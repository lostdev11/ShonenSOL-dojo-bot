import type {
  ChatInputCommandInteraction,
  Message,
  MessageEditOptions,
  User,
} from "discord.js";
import { recordBo3RoundWin } from "./bo3Session";
import { getMoveById, ARCHETYPE_PLAYSTYLE, type MoveDefinition } from "./moves";
import { simulateBattle } from "./battleEngine";
import { CHAKRA_POINTS_CPU_BATTLE } from "./chakraPoints";
import { buildPostBattleRows } from "./postBattleButtons";
import {
  addChakraPointsFromActivity,
  awardChakraAfterBattle,
  getActiveSeason,
  saveBattleResult,
  updateBattleRecords,
} from "./supabase";
import type { DojoSeason, Fighter } from "../types";

const DISCORD_MESSAGE_CONTENT_LIMIT = 2000;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function truncateDiscordContent(content: string): string {
  if (content.length <= DISCORD_MESSAGE_CONTENT_LIMIT) {
    return content;
  }
  const note = `\n… _Truncated (${content.length} chars) — Discord limit is ${DISCORD_MESSAGE_CONTENT_LIMIT}._`;
  const budget = DISCORD_MESSAGE_CONTENT_LIMIT - note.length;
  return `${content.slice(0, Math.max(0, budget))}${note}`;
}

async function addChakraPointsWithTimeout(
  discordUserId: string,
  amount: number,
  ms: number,
): Promise<boolean> {
  try {
    const result = await Promise.race([
      addChakraPointsFromActivity(discordUserId, amount),
      new Promise<boolean>((resolve) =>
        setTimeout(() => resolve(false), ms),
      ),
    ]);
    return result;
  } catch {
    return false;
  }
}

async function applyBattleUpdate(
  message: Message,
  slashInteraction: ChatInputCommandInteraction | undefined,
  opts: Pick<MessageEditOptions, "content" | "components">,
): Promise<void> {
  const content = truncateDiscordContent(opts.content ?? "");
  const components = opts.components ?? [];

  if (slashInteraction && (slashInteraction.deferred || slashInteraction.replied)) {
    try {
      await slashInteraction.editReply({ content, components });
      return;
    } catch (e) {
      console.error("runDojoBattleSequence: editReply failed, trying message.edit:", e);
    }
  }

  try {
    await message.edit({ content, components });
  } catch (e) {
    console.error("runDojoBattleSequence: message.edit failed:", e);
    const ch = message.channel;
    if (ch?.isTextBased() && ch.isSendable()) {
      const errNote = `\n\n⚠️ _Could not edit the battle message (${String((e as Error)?.message ?? e).slice(0, 160)})._`;
      await ch
        .send({ content: truncateDiscordContent(content + errNote) })
        .catch((e2) => {
          console.error("runDojoBattleSequence: channel.send fallback failed:", e2);
        });
    }
  }
}

async function getActiveSeasonWithTimeout(
  fetcher: () => Promise<DojoSeason | null>,
  ms: number,
): Promise<DojoSeason | null> {
  try {
    return await Promise.race([
      fetcher(),
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), ms);
      }),
    ]);
  } catch {
    return null;
  }
}

function randomPick(lines: string[]): string {
  return lines[Math.floor(Math.random() * lines.length)] ?? lines[0]!;
}

function buildMoveCallout(username: string, move: MoveDefinition): string {
  return `${username} commits **${move.name}** — _${move.short}_`;
}

function buildSameMoveJoke(moveName: string): string {
  const jokes = [
    `Both fighters picked **${moveName}**. Mirror match detected - someone call the cloning department.`,
    `Double **${moveName}**! The dojo crowd boos and cheers at the exact same time.`,
    `They both chose **${moveName}**. Copy homework energy, but make it combat.`,
  ];
  return randomPick(jokes);
}

function streakLines(streakInfo?: {
  winnerWinStreak: number;
  loserLossStreak: number;
}): string[] {
  if (!streakInfo) {
    return [];
  }
  const out: string[] = [];
  const { winnerWinStreak, loserLossStreak } = streakInfo;
  if (winnerWinStreak >= 3) {
    const hype =
      winnerWinStreak >= 10
        ? "Arena rumor mill is tracking this run."
        : winnerWinStreak >= 5
          ? "The dojo scoreboard is paying attention."
          : "Momentum is real.";
    out.push(`🔥 **Win streak ${winnerWinStreak}** — ${hype}`);
  }
  if (loserLossStreak >= 3) {
    out.push(`🧊 **Cold streak ${loserLossStreak}** — bounce-back arc loading…`);
  }
  return out;
}

async function continueBo3SeriesAfterRound(
  sessionId: string,
  anchorMessage: Message,
): Promise<void> {
  const { getBo3Session } = await import("./bo3Session");
  const { getFighterByDiscordId } = await import("./supabase");
  const state = getBo3Session(sessionId);
  if (!state) {
    return;
  }
  const hostU = await anchorMessage.client.users.fetch(state.hostId);
  const oppU = await anchorMessage.client.users.fetch(state.oppId);
  const hostF = await getFighterByDiscordId(state.hostId);
  const oppF = await getFighterByDiscordId(state.oppId);
  if (!hostF || !oppF) {
    return;
  }
  const ch = anchorMessage.channel;
  if (!ch || !("send" in ch)) {
    return;
  }
  const msg = await ch.send({
    content: [
      "⚔️ **Best of 3** continues",
      `Score **${state.winsHost}–${state.winsOpp}** · Round **${state.round}**`,
      `${hostU} vs ${oppU}`,
      "",
      "_First to **2** wins — picks lock when both fighters commit._",
    ].join("\n"),
  });
  const { startMoveSelectionPhase } = await import("../handlers/moveSelectHandler");
  await startMoveSelectionPhase(
    msg,
    hostU,
    { id: state.oppId, username: oppU.username },
    hostF,
    oppF,
    undefined,
    { bo3SessionId: sessionId },
  );
}

// Runs animation + Supabase save + final score. Edits the same lobby message.
export async function runDojoBattleSequence(
  message: Message,
  options: {
    challengerUser: User;
    opponentId: string;
    opponentUsername: string;
    challenger: Fighter;
    opponent: Fighter;
    moveAId?: string;
    moveBId?: string;
    isCpuBattle?: boolean;
    opponentLabel?: string;
    /** Active Best-of-3 series (mid-series rounds). */
    bo3SessionId?: string;
    /** Slash command interaction — updates use editReply when set (interaction replies). */
    slashInteraction?: ChatInputCommandInteraction;
  },
): Promise<void> {
  const {
    challengerUser,
    opponentId,
    opponentUsername,
    challenger,
    opponent,
    moveAId = "basic_strike",
    moveBId = "basic_strike",
    isCpuBattle = false,
    opponentLabel,
    bo3SessionId,
    slashInteraction,
  } = options;
  const opponentDisplay = opponentLabel ?? `<@${opponentId}>`;

  const activeSeason = await getActiveSeasonWithTimeout(() => getActiveSeason(), 5_000);
  const result = simulateBattle(challenger, opponent, {
    season: activeSeason,
    moveAId,
    moveBId,
  });
  const mA = getMoveById(moveAId);
  const mB = getMoveById(moveBId);
  const moveLine = `**Moves** — ${challengerUser.username}: *${mA.name}* (+${mA.finalScoreFlatBonus.toFixed(1)}) | ${opponentUsername}: *${mB.name}* (+${mB.finalScoreFlatBonus.toFixed(1)})`;
  const playstyleLine = `_Playstyles:_ **${ARCHETYPE_PLAYSTYLE[mA.archetype]}** vs **${ARCHETYPE_PLAYSTYLE[mB.archetype]}** — ${mA.short} / ${mB.short}`;
  const moveCalloutA = buildMoveCallout(challengerUser.username, mA);
  const moveCalloutB = buildMoveCallout(opponentUsername, mB);
  const sameMoveLine =
    mA.id === mB.id ? `\n😂 ${buildSameMoveJoke(mA.name)}` : "";

  const phaseOneLine = randomPick([
    `💥 ${challengerUser.username}: "This ends now!"`,
    `💥 ${opponentUsername}: "Try and stop me!"`,
    "💥 Energy surges across the dojo...",
    "💥 The arena trembles as both fighters power up...",
  ]);
  const phaseTwoLine = randomPick([
    "🌀 Techniques collide in a blazing clash...",
    "🌀 A shockwave bursts through the battlefield...",
    "🌀 Steel nerves and raw chakra collide mid-air...",
    "🌀 The crowd gasps as both signatures spike...",
  ]);
  const phaseThreeLine = randomPick([
    "⏳ The dust settles...",
    "⏳ For one second, everything goes silent...",
    "⏳ Both fighters stand frozen after the final strike...",
    "⏳ The dojo waits for the verdict...",
  ]);

  const edit = async (content: string) => {
    await applyBattleUpdate(message, slashInteraction, {
      content,
      components: [],
    });
  };

  await edit(
    [
      "⚔️ **ShonenSOL Battle**",
      "",
      `${challengerUser} vs ${opponentDisplay}`,
      "",
      phaseOneLine,
    ].join("\n"),
  );
  await wait(1200);
  await edit(
    [
      "⚔️ **ShonenSOL Battle**",
      "",
      `${challengerUser} vs ${opponentDisplay}`,
      "",
      phaseOneLine,
      phaseTwoLine,
    ].join("\n"),
  );
  await wait(1400);
  await edit(
    [
      "⚔️ **ShonenSOL Battle**",
      "",
      `${challengerUser} vs ${opponentDisplay}`,
      "",
      phaseOneLine,
      phaseTwoLine,
      phaseThreeLine,
    ].join("\n"),
  );
  await wait(1000);

  let cpLine = "";
  let streakInfo:
    | { winnerWinStreak: number; loserLossStreak: number }
    | undefined;

  if (!isCpuBattle) {
    await saveBattleResult({
      challenger_id: challenger.discord_user_id,
      opponent_id: opponentId,
      challenger_score: result.fighterA_score,
      opponent_score: result.fighterB_score,
      winner_id: result.winner.discord_user_id,
      battle_summary: result.summary,
      ...(activeSeason ? { season_id: activeSeason.id } : {}),
    });

    streakInfo = await updateBattleRecords(
      result.winner.discord_user_id,
      result.loser.discord_user_id,
    );

    const cpAward = await awardChakraAfterBattle(
      result.winner.discord_user_id,
      result.loser.discord_user_id,
    );
    cpLine = cpAward.ok
      ? `\n\n💠 **Chakra Points** — winner **+${cpAward.winnerGain}** · loser **+${cpAward.loserGain}**`
      : "";
  } else {
    const cpuCpOk = await addChakraPointsWithTimeout(
      challenger.discord_user_id,
      CHAKRA_POINTS_CPU_BATTLE,
      10_000,
    );
    cpLine = cpuCpOk
      ? `\n\n💠 **Chakra Points** — **+${CHAKRA_POINTS_CPU_BATTLE}** for completing a CPU battle (PvP records not saved).`
      : "\n\n🤖 **CPU battle** — PvP records are not saved.";
  }

  const photoLine = result.isPhotoFinish
    ? `\n📸 **Photo finish** — margin **${result.scoreMargin.toFixed(2)}** on the board.`
    : "";

  const streakBlock = streakLines(streakInfo).join("\n");

  let bo3Append = "";
  let bo3MidSeries = false;
  if (!isCpuBattle && bo3SessionId) {
    const outcome = recordBo3RoundWin(bo3SessionId, result.winner.discord_user_id);
    if (outcome.done && outcome.championId) {
      bo3Append = `\n\n🏆 **Best of 3 complete!** <@${outcome.championId}> takes the series.`;
    } else if (!outcome.done && outcome.state) {
      bo3MidSeries = true;
      bo3Append = `\n\n📎 **Series ${outcome.state.winsHost}–${outcome.state.winsOpp}** — next round opens below.`;
    }
  }

  const revealNote =
    "\n🔁 **Reveal:** simultaneous picks — host and challenger menus tick independently; the clash resolves once **both** lock in.";

  const finalContent = [
    "⚔️ **ShonenSOL Battle**",
    "",
    `${challengerUser} vs ${opponentDisplay}`,
    moveLine,
    playstyleLine,
    revealNote,
    `🎭 ${moveCalloutA}`,
    `🎭 ${moveCalloutB}`,
    `💬 ${challengerUser.username}: "${result.quoteA}"`,
    `💬 ${opponentUsername}: "${result.quoteB}"`,
    sameMoveLine,
    "",
    `${challengerUser.username} Score: **${result.fighterA_score}**`,
    `${opponentUsername} Score: **${result.fighterB_score}**`,
    photoLine,
    streakBlock ? `\n${streakBlock}` : "",
    [
      "📊 **Score build** — base",
      `**${result.fighterA_statScore.toFixed(2)}** / **${result.fighterB_statScore.toFixed(2)}**`,
      `· RNG **${result.rngRollA}**/**${result.rngRollB}** (+${result.rngScoreA.toFixed(2)} / +${result.rngScoreB.toFixed(2)} noise)`,
      `· power ${result.powerEdgeTowardA >= 0 ? "+" : ""}${result.powerEdgeTowardA.toFixed(2)}`,
      `· luck duel ${result.luckSwingTowardA >= 0 ? "+" : ""}${result.luckSwingTowardA.toFixed(2)}`,
      `(net PL swing ${result.powerLuckEdgeTowardA >= 0 ? "+" : ""}${result.powerLuckEdgeTowardA.toFixed(2)} toward ${challengerUser.username})`,
    ].join(" "),
    `🎲 Quote momentum: **${result.quoteEdge >= 0 ? "+" : ""}${result.quoteEdge.toFixed(2)}** to ${result.quoteEdge >= 0 ? challengerUser.username : opponentUsername} (mirrored for fairness)`,
    `🧠 Strategy edge: **+${result.strategyEdgeA.toFixed(2)} ${challengerUser.username}** | **+${result.strategyEdgeB.toFixed(2)} ${opponentUsername}** (${result.strategyNote})`,
    result.tieBreakCoinFlip
      ? "\n⚖️ *Equal score — winner picked by a fair 50/50 roll (no host advantage).*"
      : result.fighterA_score === result.fighterB_score && !result.tieBreakCoinFlip
        ? "\n⚖️ *Equal score — tie broken by **stat merit**, then **move + counter merit**.*"
        : "",
    activeSeason ? `Season: **${activeSeason.name}**` : "",
    result.awakeningTriggered ? "\n🔥 **AWAKENING TRIGGERED**" : "",
    cpLine,
    bo3Append,
    "",
    `🏆 Winner: ${result.winner.discord_user_id === challenger.discord_user_id ? challengerUser.toString() : opponentDisplay}`,
    "",
    result.summary,
  ].join("\n");

  const showReplayButtons =
    !isCpuBattle && !bo3MidSeries;

  await applyBattleUpdate(message, slashInteraction, {
    content: finalContent,
    components: showReplayButtons
      ? buildPostBattleRows(challenger.discord_user_id, opponentId)
      : [],
  });

  const hypeReact =
    result.awakeningTriggered || result.isPhotoFinish || result.tieBreakCoinFlip;
  if (hypeReact) {
    await message.react("🔥").catch(() => {});
  }

  if (!isCpuBattle && bo3MidSeries && bo3SessionId) {
    await continueBo3SeriesAfterRound(bo3SessionId, message);
  }
}
