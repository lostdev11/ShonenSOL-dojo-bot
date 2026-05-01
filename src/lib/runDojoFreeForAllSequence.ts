import type { ChatInputCommandInteraction, Message } from "discord.js";
import { ARCHETYPE_PLAYSTYLE, getMoveById } from "./moves";
import { simulateFreeForAll } from "./battleEngine";
import {
  awardChakraAfterFreeForAll,
  getActiveSeason,
  saveBattleResult,
  updateBattleRecordsFreeForAll,
} from "./supabase";
import type { Fighter } from "../types";

const PVP_PERSIST_TIMEOUT_MS = 18_000;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const DISCORD_MESSAGE_CONTENT_LIMIT = 2000;

function truncateDiscordContent(content: string): string {
  if (content.length <= DISCORD_MESSAGE_CONTENT_LIMIT) {
    return content;
  }
  const note = `\n… _Truncated (${content.length} chars) — Discord limit is ${DISCORD_MESSAGE_CONTENT_LIMIT}._`;
  const budget = DISCORD_MESSAGE_CONTENT_LIMIT - note.length;
  return `${content.slice(0, Math.max(0, budget))}${note}`;
}

async function applyBattleUpdate(
  message: Message,
  slashInteraction: ChatInputCommandInteraction | undefined,
  opts: { content: string; components?: [] },
): Promise<void> {
  const content = truncateDiscordContent(opts.content ?? "");
  const components = opts.components ?? [];

  if (slashInteraction && (slashInteraction.deferred || slashInteraction.replied)) {
    try {
      await slashInteraction.editReply({ content, components });
      return;
    } catch (e) {
      console.error("runDojoFreeForAllSequence: editReply failed:", e);
    }
  }

  try {
    await message.edit({ content, components });
  } catch (e) {
    console.error("runDojoFreeForAllSequence: message.edit failed:", e);
    const ch = message.channel;
    if (ch?.isTextBased() && ch.isSendable()) {
      await ch.send({ content: truncateDiscordContent(`${content}\n\n⚠️ _Could not edit battle message._`) }).catch(() => {});
    }
  }
}

async function getActiveSeasonWithTimeout(ms: number) {
  try {
    return await Promise.race([
      getActiveSeason(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
    ]);
  } catch {
    return null;
  }
}

function randomPick(lines: string[]): string {
  return lines[Math.floor(Math.random() * lines.length)] ?? lines[0]!;
}

function winnerStreakLine(streak?: number): string {
  if (!streak || streak < 3) {
    return "";
  }
  const hype =
    streak >= 10
      ? "Arena rumor mill is tracking this run."
      : streak >= 5
        ? "The dojo scoreboard is paying attention."
        : "Momentum is real.";
  return `\n🔥 **Win streak ${streak}** — ${hype}`;
}

export async function runDojoFreeForAllSequence(
  message: Message,
  options: {
    slots: { fighter: Fighter; moveId: string }[];
    slashInteraction?: ChatInputCommandInteraction;
  },
): Promise<void> {
  const { slots, slashInteraction } = options;
  const activeSeason = await getActiveSeasonWithTimeout(5_000);
  const result = simulateFreeForAll(
    slots.map((s) => ({ fighter: s.fighter, moveId: s.moveId })),
    { season: activeSeason },
  );

  const winnerUser = await message.client.users
    .fetch(result.winner.discord_user_id)
    .catch(() => null);

  const mentions = await Promise.all(
    result.placements.map((p) =>
      message.client.users.fetch(p.fighter.discord_user_id).catch(() => null),
    ),
  );

  const edit = async (content: string) => {
    await applyBattleUpdate(message, slashInteraction, { content, components: [] });
  };

  const headerLines = [
    "⚔️ **ShonenSOL Free-for-all**",
    "",
    `${slots.length} fighters — **everyone vs everyone**`,
    "",
    randomPick([
      "💥 Techniques erupt from every corner of the dojo…",
      "💥 The ring becomes pure chaos — no alliances…",
      "💥 All rivals unleash at once…",
    ]),
  ];

  await edit(headerLines.join("\n"));
  await wait(1200);
  await edit(
    [
      ...headerLines,
      randomPick([
        "🌀 Crossfire — counters fly in every direction…",
        "🌀 Momentum shifts second by second…",
      ]),
    ].join("\n"),
  );
  await wait(1400);
  await edit(
    [
      ...headerLines,
      "🌀 Crossfire — counters fly in every direction…",
      randomPick(["⏳ The dust settles…", "⏳ The arena goes quiet…"]),
    ].join("\n"),
  );
  await wait(1000);

  let cpLine = "";
  let persistWarning = "";
  let winStreakNote = "";

  const loserIds = result.placements
    .filter((p) => p.fighter.discord_user_id !== result.winner.discord_user_id)
    .map((p) => p.fighter.discord_user_id);

  try {
    await Promise.race([
      (async () => {
        const winP = result.placements.find(
          (p) => p.fighter.discord_user_id === result.winner.discord_user_id,
        );
        const runP =
          result.runnerUp !== null
            ? result.placements.find(
                (p) => p.fighter.discord_user_id === result.runnerUp!.discord_user_id,
              )
            : undefined;

        const summaryBlob = [
          result.summary,
          "",
          ...result.placements.map((p, rank) => {
            const mv = getMoveById(p.moveId);
            return `#${rank + 1} ${p.fighter.username} — **${p.finalScore}** (*${mv.name}*)`;
          }),
        ].join("\n");

        await saveBattleResult({
          challenger_id: result.winner.discord_user_id,
          opponent_id:
            result.runnerUp?.discord_user_id ?? loserIds[0] ?? result.winner.discord_user_id,
          challenger_score: winP?.finalScore ?? 0,
          opponent_score: runP?.finalScore ?? 0,
          winner_id: result.winner.discord_user_id,
          battle_summary: `[Free-for-all ${slots.length}p] ${summaryBlob.slice(0, 900)}`,
          ...(activeSeason ? { season_id: activeSeason.id } : {}),
        });

        const streakOut = await updateBattleRecordsFreeForAll(
          result.winner.discord_user_id,
          loserIds,
        );
        winStreakNote = winnerStreakLine(streakOut?.winnerWinStreak);

        const cpAward = await awardChakraAfterFreeForAll(
          result.winner.discord_user_id,
          loserIds,
        );
        cpLine =
          cpAward.ok === true
            ? `\n\n💠 **Chakra Points** — winner **+${cpAward.winnerGain}** · each other fighter **+${cpAward.loserGainEach}**`
            : "";
      })(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("ffa_persist_timeout")), PVP_PERSIST_TIMEOUT_MS),
      ),
    ]);
  } catch (e) {
    console.error("runDojoFreeForAllSequence: PvP persistence failed or timed out:", e);
    cpLine = "";
    persistWarning =
      "\n\n⚠️ _Outcome is shown locally, but **records/chakra did not sync** (database timeout or error)._";
  }

  const leaderboard = result.placements
    .map((p, rank) => {
      const u = mentions[rank];
      const mv = getMoveById(p.moveId);
      const medal = rank === 0 ? "🥇" : rank === 1 ? "🥈" : rank === 2 ? "🥉" : `${rank + 1}.`;
      const who = u ? `${u}` : p.fighter.username;
      const ps = ARCHETYPE_PLAYSTYLE[mv.archetype];
      return `${medal} ${who} — **${p.finalScore.toFixed(2)}** · *${mv.name}* (${ps})`;
    })
    .join("\n");

  const winnerScoreVal = result.placements.find(
    (p) => p.fighter.discord_user_id === result.winner.discord_user_id,
  )!.finalScore;
  const runnerScoreVal = result.runnerUp
    ? result.placements.find(
        (p) => p.fighter.discord_user_id === result.runnerUp!.discord_user_id,
      )!.finalScore
    : winnerScoreVal;
  const photoMargin = winnerScoreVal - runnerScoreVal;

  const photoLine = result.photoFinish
    ? `\n📸 **Photo finish** — margin **${photoMargin.toFixed(2)}** to the next rival.`
    : "";

  const tieLine = result.tieBreakCoinFlip
    ? "\n⚖️ *Top scores tied — winner settled by **stat merit**, then **technique**, then a fair coin.*"
    : "";

  const finalContent = [
    "⚔️ **ShonenSOL Free-for-all · Results**",
    "",
    leaderboard,
    "",
    photoLine,
    tieLine,
    winStreakNote,
    cpLine,
    persistWarning,
    "",
    `🏆 **Winner:** ${winnerUser ? winnerUser.toString() : result.winner.username}`,
    "",
    result.summary,
  ]
    .filter(Boolean)
    .join("\n");

  await applyBattleUpdate(message, slashInteraction, {
    content: finalContent,
    components: [],
  });

  const hypeReact = result.photoFinish || result.tieBreakCoinFlip;
  if (hypeReact) {
    await message.react("🔥").catch(() => {});
  }
}
