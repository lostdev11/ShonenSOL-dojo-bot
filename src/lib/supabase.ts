import { createClient } from "@supabase/supabase-js";
import { CHAKRA_POINTS_LOSS, CHAKRA_POINTS_WIN } from "./chakraPoints";
import {
  getMoveById,
  getUnlockedSlugs,
  STARTER_MOVE_IDS,
} from "./moves";
import { normalizeUnlockedTitles, TITLE_CATALOG } from "./cosmetics";
import type { BattleRecord, DojoSeason, Fighter } from "../types";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error(
    "Missing Supabase environment variables. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
  );
}

export const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

export async function getFighterByDiscordId(discordUserId: string) {
  const { data, error } = await supabase
    .from("dojo_fighters")
    .select("*")
    .eq("discord_user_id", discordUserId)
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle<Fighter>();

  if (error) {
    throw error;
  }

  return data;
}

export async function createFighter(
  discordUserId: string,
  username: string,
  stats: Pick<
    Fighter,
    "strength" | "speed" | "defense" | "spirit" | "chakra" | "luck"
  >,
) {
  const insertPayload: Record<string, unknown> = {
    discord_user_id: discordUserId,
    username,
    wins: 0,
    losses: 0,
    ...stats,
    chakra_points: 0,
    unlocked_moves: [...STARTER_MOVE_IDS] as string[],
  };

  let { data, error } = await supabase
    .from("dojo_fighters")
    .insert(insertPayload)
    .select("*")
    .single<Fighter>();

  for (let i = 0; i < 3 && error?.code === "PGRST204"; i += 1) {
    const msg = String((error as { message?: string }).message ?? "");
    if (msg.includes("unlocked_moves")) {
      delete insertPayload.unlocked_moves;
    } else if (msg.includes("chakra_points")) {
      delete insertPayload.chakra_points;
    } else {
      break;
    }
    const retry = await supabase
      .from("dojo_fighters")
      .insert(insertPayload)
      .select("*")
      .single<Fighter>();
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    throw error;
  }
  if (!data) {
    throw new Error("createFighter returned no row");
  }
  return data;
}

export async function appendUnlockedMove(
  discordUserId: string,
  moveSlug: string,
): Promise<Fighter> {
  const current = await getFighterByDiscordId(discordUserId);
  if (!current) {
    throw new Error("Fighter not found for unlock");
  }
  const slugs = getUnlockedSlugs(current);
  if (slugs.includes(moveSlug)) {
    return current;
  }
  const next = [...slugs, moveSlug];
  const { data, error } = await supabase
    .from("dojo_fighters")
    .update({ unlocked_moves: next })
    .eq("discord_user_id", discordUserId)
    .select("*")
    .single<Fighter>();

  if (error) {
    const colMissing =
      (error as { code?: string }).code === "PGRST204" &&
      String(error.message).includes("unlocked_moves");
    if (colMissing) {
      return current;
    }
    throw error;
  }
  if (!data) {
    return current;
  }
  return data;
}

export async function saveBattleResult(record: BattleRecord) {
  const payload = {
    challenger_id: record.challenger_id,
    opponent_id: record.opponent_id,
    challenger_score: record.challenger_score,
    opponent_score: record.opponent_score,
    winner_id: record.winner_id,
    battle_summary: record.battle_summary,
    season_id: record.season_id ?? null,
  };

  const { error: battleError } = await supabase.from("dojo_battles").insert(payload);

  if (!battleError) {
    return;
  }

  // Backward compatibility: if season_id is missing in older schemas, retry
  // without it so MVP battles still work.
  const missingSeasonColumn =
    battleError.code === "PGRST204" &&
    battleError.message.includes("'season_id'");

  if (missingSeasonColumn) {
    const { season_id: _ignored, ...legacyPayload } = payload;
    const { error: legacyInsertError } = await supabase
      .from("dojo_battles")
      .insert(legacyPayload);

    if (!legacyInsertError) {
      return;
    }

    throw legacyInsertError;
  }

  throw battleError;
}

export async function getActiveSeason() {
  const { data, error } = await supabase
    .from("dojo_seasons")
    .select("*")
    .eq("is_active", true)
    .maybeSingle<DojoSeason>();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateBattleRecords(
  winnerDiscordId: string,
  loserDiscordId: string,
): Promise<{ winnerWinStreak: number; loserLossStreak: number } | undefined> {
  const winner = await getFighterByDiscordId(winnerDiscordId);
  const loser = await getFighterByDiscordId(loserDiscordId);

  if (!winner || !loser) {
    throw new Error("One or both fighters were not found while updating records.");
  }

  const nextWinnerStreak = (winner.win_streak ?? 0) + 1;
  const nextLoserStreak = (loser.loss_streak ?? 0) + 1;

  const withStreakPayload = {
    wins: winner.wins + 1,
    win_streak: nextWinnerStreak,
    loss_streak: 0,
  };
  const loserWithStreakPayload = {
    losses: loser.losses + 1,
    loss_streak: nextLoserStreak,
    win_streak: 0,
  };

  let winnerError = (
    await supabase
      .from("dojo_fighters")
      .update(withStreakPayload)
      .eq("discord_user_id", winnerDiscordId)
  ).error;

  if (
    winnerError &&
    (winnerError as { code?: string }).code === "PGRST204" &&
    (String(winnerError.message).includes("win_streak") ||
      String(winnerError.message).includes("loss_streak"))
  ) {
    winnerError = (
      await supabase
        .from("dojo_fighters")
        .update({ wins: winner.wins + 1 })
        .eq("discord_user_id", winnerDiscordId)
    ).error;
  }

  if (winnerError) {
    throw winnerError;
  }

  let loserError = (
    await supabase
      .from("dojo_fighters")
      .update(loserWithStreakPayload)
      .eq("discord_user_id", loserDiscordId)
  ).error;

  if (
    loserError &&
    (loserError as { code?: string }).code === "PGRST204" &&
    (String(loserError.message).includes("win_streak") ||
      String(loserError.message).includes("loss_streak"))
  ) {
    loserError = (
      await supabase
        .from("dojo_fighters")
        .update({ losses: loser.losses + 1 })
        .eq("discord_user_id", loserDiscordId)
    ).error;
  }

  if (loserError) {
    throw loserError;
  }

  const w2 = await getFighterByDiscordId(winnerDiscordId);
  const l2 = await getFighterByDiscordId(loserDiscordId);
  if (
    w2 &&
    l2 &&
    w2.win_streak != null &&
    l2.loss_streak != null
  ) {
    return {
      winnerWinStreak: w2.win_streak,
      loserLossStreak: l2.loss_streak,
    };
  }
  return undefined;
}

/** One winner; each other fighter records a loss (free-for-all). */
export async function updateBattleRecordsFreeForAll(
  winnerDiscordId: string,
  loserDiscordIds: string[],
): Promise<{ winnerWinStreak: number } | undefined> {
  const winner = await getFighterByDiscordId(winnerDiscordId);
  if (!winner) {
    throw new Error("Winner fighter was not found while updating records.");
  }

  const nextWinnerStreak = (winner.win_streak ?? 0) + 1;
  const withStreakPayload = {
    wins: winner.wins + 1,
    win_streak: nextWinnerStreak,
    loss_streak: 0,
  };

  let winnerError = (
    await supabase
      .from("dojo_fighters")
      .update(withStreakPayload)
      .eq("discord_user_id", winnerDiscordId)
  ).error;

  if (
    winnerError &&
    (winnerError as { code?: string }).code === "PGRST204" &&
    (String(winnerError.message).includes("win_streak") ||
      String(winnerError.message).includes("loss_streak"))
  ) {
    winnerError = (
      await supabase
        .from("dojo_fighters")
        .update({ wins: winner.wins + 1 })
        .eq("discord_user_id", winnerDiscordId)
    ).error;
  }

  if (winnerError) {
    throw winnerError;
  }

  for (const lid of loserDiscordIds) {
    const loser = await getFighterByDiscordId(lid);
    if (!loser) {
      throw new Error(`Loser fighter ${lid} was not found while updating records.`);
    }
    const nextLoserStreak = (loser.loss_streak ?? 0) + 1;
    const loserWithStreakPayload = {
      losses: loser.losses + 1,
      loss_streak: nextLoserStreak,
      win_streak: 0,
    };
    let loserError = (
      await supabase
        .from("dojo_fighters")
        .update(loserWithStreakPayload)
        .eq("discord_user_id", lid)
    ).error;

    if (
      loserError &&
      (loserError as { code?: string }).code === "PGRST204" &&
      (String(loserError.message).includes("win_streak") ||
        String(loserError.message).includes("loss_streak"))
    ) {
      loserError = (
        await supabase
          .from("dojo_fighters")
          .update({ losses: loser.losses + 1 })
          .eq("discord_user_id", lid)
      ).error;
    }

    if (loserError) {
      throw loserError;
    }
  }

  const w2 = await getFighterByDiscordId(winnerDiscordId);
  if (w2 && w2.win_streak != null) {
    return { winnerWinStreak: w2.win_streak };
  }
  return undefined;
}

export type FreeForAllCpAward =
  | { ok: true; winnerGain: number; loserGainEach: number }
  | { ok: false; reason: "no_column" | "not_found" };

export async function awardChakraAfterFreeForAll(
  winnerDiscordId: string,
  loserDiscordIds: string[],
): Promise<FreeForAllCpAward> {
  const w = await getFighterByDiscordId(winnerDiscordId);
  if (!w) {
    return { ok: false, reason: "not_found" };
  }

  const wNext = (w.chakra_points ?? 0) + CHAKRA_POINTS_WIN;
  const { error: e1 } = await supabase
    .from("dojo_fighters")
    .update({ chakra_points: wNext })
    .eq("discord_user_id", winnerDiscordId);

  if (e1) {
    if (
      (e1 as { code?: string }).code === "PGRST204" &&
      String(e1.message).includes("chakra_points")
    ) {
      return { ok: false, reason: "no_column" };
    }
    throw e1;
  }

  for (const lid of loserDiscordIds) {
    const l = await getFighterByDiscordId(lid);
    if (!l) {
      continue;
    }
    const lNext = (l.chakra_points ?? 0) + CHAKRA_POINTS_LOSS;
    const { error: e2 } = await supabase
      .from("dojo_fighters")
      .update({ chakra_points: lNext })
      .eq("discord_user_id", lid);

    if (e2) {
      if (
        (e2 as { code?: string }).code === "PGRST204" &&
        String(e2.message).includes("chakra_points")
      ) {
        return { ok: false, reason: "no_column" };
      }
      throw e2;
    }
  }

  return {
    ok: true,
    winnerGain: CHAKRA_POINTS_WIN,
    loserGainEach: CHAKRA_POINTS_LOSS,
  };
}

export type RecentBattleRow = {
  opponentId: string;
  won: boolean;
  myScore: number;
  theirScore: number;
  created_at: string;
};

export async function getRecentBattlesForUser(
  discordUserId: string,
  limit: number,
): Promise<RecentBattleRow[]> {
  const { data, error } = await supabase
    .from("dojo_battles")
    .select("challenger_id, opponent_id, challenger_score, opponent_score, winner_id, created_at")
    .or(`challenger_id.eq.${discordUserId},opponent_id.eq.${discordUserId}`)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if ((error as { code?: string }).code === "42P01") {
      return [];
    }
    throw error;
  }

  const rows = data ?? [];
  return rows.map((r) => {
    const isChallenger = r.challenger_id === discordUserId;
    const opponentId = isChallenger ? r.opponent_id : r.challenger_id;
    const won = r.winner_id === discordUserId;
    const myScore = isChallenger ? Number(r.challenger_score) : Number(r.opponent_score);
    const theirScore = isChallenger ? Number(r.opponent_score) : Number(r.challenger_score);
    return {
      opponentId,
      won,
      myScore,
      theirScore,
      created_at: r.created_at as string,
    };
  });
}

function utcDateString(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function utcWeekKey(d = new Date()): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - day);
  const y = x.getUTCFullYear();
  const z =
    Math.floor((x.getTime() - Date.UTC(y, 0, 1).valueOf()) / 86400000 / 7) + 1;
  return `${y}-W${String(z).padStart(2, "0")}`;
}

const DAILY_CP_BASE = 25;
const WEEKLY_BONUS_CP = 15;

/** Normalize DB date/timestamp/text to `YYYY-MM-DD` for comparisons. */
function normalizeStoredDay(raw: unknown): string | null {
  if (raw == null || raw === "") {
    return null;
  }
  const s = String(raw).trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m?.[1] ?? null;
}

function errorMentionsColumn(error: unknown, column: string): boolean {
  const e = error as { message?: string; details?: string; hint?: string };
  const blob = `${e.message ?? ""}${e.details ?? ""}${e.hint ?? ""}`;
  return blob.includes(column);
}

export type ClaimDailyResult =
  | {
      ok: true;
      cpGained: number;
      totalCp: number;
      lines: string[];
    }
  | { ok: false; reason: "no_fighter" | "already_claimed" | "no_column" };

export async function claimDailyBonus(discordUserId: string): Promise<ClaimDailyResult> {
  const f = await getFighterByDiscordId(discordUserId);
  if (!f) {
    return { ok: false, reason: "no_fighter" };
  }
  const today = utcDateString();
  const lastClaimDay = normalizeStoredDay(f.daily_bonus_claim_date);
  if (lastClaimDay === today) {
    return { ok: false, reason: "already_claimed" };
  }

  const thisWeek = utcWeekKey();
  const normalizedWeek = f.weekly_bonus_week?.trim() ?? "";
  const eligibleWeekly = normalizedWeek !== thisWeek;

  let cpGain = DAILY_CP_BASE;
  const lines: string[] = [`Daily stipend: **+${DAILY_CP_BASE}** CP`];
  if (eligibleWeekly) {
    cpGain += WEEKLY_BONUS_CP;
    lines.push(`Weekly login bonus (first claim this week): **+${WEEKLY_BONUS_CP}** CP`);
  }

  const applyCp = (gain: number) => (f.chakra_points ?? 0) + gain;

  const runUpdate = (payload: Record<string, unknown>) =>
    supabase.from("dojo_fighters").update(payload).eq("discord_user_id", discordUserId);

  let payload: Record<string, unknown> = {
    chakra_points: applyCp(cpGain),
    daily_bonus_claim_date: today,
  };
  if (eligibleWeekly) {
    payload.weekly_bonus_week = thisWeek;
  }

  let { error } = await runUpdate(payload);

  // Often only `daily_bonus_claim_date` + `chakra_points` exist; `weekly_bonus_week` missing breaks the whole update.
  if (error && eligibleWeekly && errorMentionsColumn(error, "weekly_bonus_week")) {
    cpGain = DAILY_CP_BASE;
    const linesDaily = [`Daily stipend: **+${DAILY_CP_BASE}** CP`];
    lines.length = 0;
    lines.push(...linesDaily);
    lines.push(
      "_Weekly bonus skipped — add column `weekly_bonus_week` (see README) to track weekly CP._",
    );
    payload = {
      chakra_points: applyCp(cpGain),
      daily_bonus_claim_date: today,
    };
    ({ error } = await runUpdate(payload));
  }

  if (error) {
    if (
      errorMentionsColumn(error, "daily_bonus_claim_date") ||
      errorMentionsColumn(error, "chakra_points")
    ) {
      return { ok: false, reason: "no_column" };
    }
    console.error("claimDailyBonus:", error);
    throw error;
  }

  return {
    ok: true,
    cpGained: cpGain,
    totalCp: applyCp(cpGain),
    lines,
  };
}

export type PurchaseTitleResult =
  | { ok: true; fighter: Fighter }
  | {
      ok: false;
      error:
        | "no_fighter"
        | "unknown_title"
        | "not_in_shop"
        | "already_owned"
        | "insufficient"
        | "missing_columns";
    };

export async function purchaseTitleWithChakra(
  discordUserId: string,
  titleId: string,
): Promise<PurchaseTitleResult> {
  const def = TITLE_CATALOG[titleId];
  if (!def) {
    return { ok: false, error: "unknown_title" };
  }
  if (def.shopPrice <= 0) {
    return { ok: false, error: "not_in_shop" };
  }
  const current = await getFighterByDiscordId(discordUserId);
  if (!current) {
    return { ok: false, error: "no_fighter" };
  }
  const slugs = normalizeUnlockedTitles(current);
  if (slugs.includes(titleId)) {
    return { ok: false, error: "already_owned" };
  }
  const balance = current.chakra_points ?? 0;
  if (balance < def.shopPrice) {
    return { ok: false, error: "insufficient" };
  }
  const nextBalance = balance - def.shopPrice;
  const nextTitles = [...slugs, titleId];
  const { data, error } = await supabase
    .from("dojo_fighters")
    .update({
      chakra_points: nextBalance,
      unlocked_titles: nextTitles,
      equipped_title: titleId,
    })
    .eq("discord_user_id", discordUserId)
    .select("*")
    .single<Fighter>();

  if (error) {
    if (
      (error as { code?: string }).code === "PGRST204" &&
      (String(error.message).includes("unlocked_titles") ||
        String(error.message).includes("equipped_title"))
    ) {
      return { ok: false, error: "missing_columns" };
    }
    if (
      (error as { code?: string }).code === "PGRST204" &&
      String(error.message).includes("chakra_points")
    ) {
      return { ok: false, error: "missing_columns" };
    }
    throw error;
  }
  if (!data) {
    return { ok: false, error: "no_fighter" };
  }
  return { ok: true, fighter: data };
}

export type EquipTitleResult =
  | { ok: true; fighter: Fighter }
  | { ok: false; error: "no_fighter" | "not_owned" | "missing_column" };

export async function equipOwnedTitle(
  discordUserId: string,
  titleId: string,
): Promise<EquipTitleResult> {
  const current = await getFighterByDiscordId(discordUserId);
  if (!current) {
    return { ok: false, error: "no_fighter" };
  }
  const owned = new Set(normalizeUnlockedTitles(current));
  if (!owned.has(titleId) || !TITLE_CATALOG[titleId]) {
    return { ok: false, error: "not_owned" };
  }
  const { data, error } = await supabase
    .from("dojo_fighters")
    .update({ equipped_title: titleId })
    .eq("discord_user_id", discordUserId)
    .select("*")
    .single<Fighter>();

  if (error) {
    if (
      (error as { code?: string }).code === "PGRST204" &&
      String(error.message).includes("equipped_title")
    ) {
      return { ok: false, error: "missing_column" };
    }
    throw error;
  }
  if (!data) {
    return { ok: false, error: "no_fighter" };
  }
  return { ok: true, fighter: data };
}

export type AwardChakraResult =
  | { ok: true; winnerGain: number; loserGain: number; winnerNew: number; loserNew: number }
  | { ok: false; reason: "no_column" | "not_found" };

/**
 * Winner / loser Chakra Point rewards after a battle.
 * Fails soft if `chakra_points` is not in the database schema.
 */
export async function awardChakraAfterBattle(
  winnerDiscordId: string,
  loserDiscordId: string,
): Promise<AwardChakraResult> {
  const w = await getFighterByDiscordId(winnerDiscordId);
  const l = await getFighterByDiscordId(loserDiscordId);
  if (!w || !l) {
    return { ok: false, reason: "not_found" };
  }
  const wNext = (w.chakra_points ?? 0) + CHAKRA_POINTS_WIN;
  const lNext = (l.chakra_points ?? 0) + CHAKRA_POINTS_LOSS;

  const { error: e1 } = await supabase
    .from("dojo_fighters")
    .update({ chakra_points: wNext })
    .eq("discord_user_id", winnerDiscordId);

  if (e1) {
    if (
      (e1 as { code?: string }).code === "PGRST204" &&
      String(e1.message).includes("chakra_points")
    ) {
      return { ok: false, reason: "no_column" };
    }
    throw e1;
  }

  const { error: e2 } = await supabase
    .from("dojo_fighters")
    .update({ chakra_points: lNext })
    .eq("discord_user_id", loserDiscordId);

  if (e2) {
    if (
      (e2 as { code?: string }).code === "PGRST204" &&
      String(e2.message).includes("chakra_points")
    ) {
      return { ok: false, reason: "no_column" };
    }
    throw e2;
  }

  return {
    ok: true,
    winnerGain: CHAKRA_POINTS_WIN,
    loserGain: CHAKRA_POINTS_LOSS,
    winnerNew: wNext,
    loserNew: lNext,
  };
}

/**
 * Add CP (e.g. after training). Returns `false` if the column is missing.
 */
export async function addChakraPointsFromActivity(
  discordUserId: string,
  amount: number,
): Promise<boolean> {
  if (amount === 0) {
    return true;
  }
  const f = await getFighterByDiscordId(discordUserId);
  if (!f) {
    return false;
  }
  const next = (f.chakra_points ?? 0) + amount;
  const { error } = await supabase
    .from("dojo_fighters")
    .update({ chakra_points: next })
    .eq("discord_user_id", discordUserId);
  if (error) {
    if (
      (error as { code?: string }).code === "PGRST204" &&
      String(error.message).includes("chakra_points")
    ) {
      return false;
    }
    throw error;
  }
  return true;
}

export type PurchaseMoveResult =
  | { ok: true; fighter: Fighter }
  | {
      ok: false;
      error:
        | "no_fighter"
        | "not_in_shop"
        | "already_owned"
        | "insufficient"
        | "missing_chakra_column"
        | "unlocked_column";
    };

export async function purchaseMoveWithChakra(
  discordUserId: string,
  moveSlug: string,
): Promise<PurchaseMoveResult> {
  const def = getMoveById(moveSlug);
  if (def.shopPrice == null) {
    return { ok: false, error: "not_in_shop" };
  }
  const current = await getFighterByDiscordId(discordUserId);
  if (!current) {
    return { ok: false, error: "no_fighter" };
  }
  const slugs = getUnlockedSlugs(current);
  if (slugs.includes(moveSlug)) {
    return { ok: false, error: "already_owned" };
  }
  const balance = current.chakra_points ?? 0;
  const { shopPrice: price } = def;
  if (price == null) {
    return { ok: false, error: "not_in_shop" };
  }
  if (balance < price) {
    return { ok: false, error: "insufficient" };
  }
  const nextBalance = balance - price;
  const nextSlugs = [...slugs, moveSlug];
  const { data, error } = await supabase
    .from("dojo_fighters")
    .update({ chakra_points: nextBalance, unlocked_moves: nextSlugs })
    .eq("discord_user_id", discordUserId)
    .select("*")
    .single<Fighter>();

  if (error) {
    if (
      (error as { code?: string }).code === "PGRST204" &&
      String(error.message).includes("chakra_points")
    ) {
      return { ok: false, error: "missing_chakra_column" };
    }
    if (
      (error as { code?: string }).code === "PGRST204" &&
      String(error.message).includes("unlocked_moves")
    ) {
      return { ok: false, error: "unlocked_column" };
    }
    throw error;
  }
  if (!data) {
    return { ok: false, error: "no_fighter" };
  }
  return { ok: true, fighter: data };
}

type TrainingUpdatePayload = {
  last_train_at?: string;
  strength?: number;
  speed?: number;
  defense?: number;
  spirit?: number;
  chakra?: number;
  luck?: number;
};

export type ApplyTrainingResult = { fighter: Fighter; usedLastTrainAt: boolean };

export async function applyTraining(
  discordUserId: string,
  updates: TrainingUpdatePayload,
): Promise<ApplyTrainingResult> {
  const runUpdate = (payload: TrainingUpdatePayload) =>
    supabase
      .from("dojo_fighters")
      .update(payload)
      .eq("discord_user_id", discordUserId)
      .select("*")
      .single<Fighter>();

  const { data, error } = await runUpdate(updates);

  if (error) {
    const missingLastTrainColumn =
      (error as { code?: string }).code === "PGRST204" &&
      String(error.message).includes("last_train_at");
    if (missingLastTrainColumn) {
      const { last_train_at: _dropped, ...statsOnly } = updates;
      if (Object.keys(statsOnly).length > 0) {
        const retry = await runUpdate(statsOnly);
        if (retry.data && !retry.error) {
          return { fighter: retry.data, usedLastTrainAt: false };
        }
        if (retry.error) {
          throw retry.error;
        }
      }
    }
    throw error;
  }

  if (!data) {
    throw new Error("Training update returned no row");
  }

  return { fighter: data, usedLastTrainAt: true };
}

export async function getLeaderboard() {
  const { data, error } = await supabase
    .from("dojo_fighters")
    .select("*")
    .order("wins", { ascending: false })
    .limit(50);

  if (error) {
    throw error;
  }

  return (data ?? []) as Fighter[];
}
