import { randomBytes } from "node:crypto";
import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
} from "discord.js";
import type { Message, StringSelectMenuInteraction, User } from "discord.js";
import type { ButtonInteraction } from "discord.js";
import {
  getMoveById,
  getMoveSelectData,
} from "../lib/moves";
import {
  getMoveSession,
  MOVE_SELECT_PREFIX,
  setMoveSession,
  takeMoveSession,
  type MovePending,
} from "../lib/moveSession";
import { getBo3Session } from "../lib/bo3Session";
import { runDojoBattleSequence } from "../lib/runDojoBattleSequence";
import type { Fighter } from "../types";

function buildSelectContent(
  hostMention: string,
  oppMention: string,
  hDone: boolean,
  oDone: boolean,
  bo3?: { winsHost: number; winsOpp: number; round: number },
) {
  const bo3Line = bo3
    ? `\n🏅 **Best of 3** · score **${bo3.winsHost}–${bo3.winsOpp}** · Round **${bo3.round}**`
    : "";
  return [
    "🎯 **Select your move** (both use the menus below. **60s** to pick, then defaults to **Basic Strike**).",
    "_Archetypes chain:_ offense → burst → control → mobility → defense → offense (beats the next).",
    bo3Line,
    "",
    "🔁 **Reveal:** picks are **simultaneous** — each menu is independent; the fight locks when **both** fighters commit.",
    "",
    `${hostMention} **(Fighter 1):** ${hDone ? "✅ locked in" : "⏳ choose"}`,
    `${oppMention} **(Fighter 2):** ${oDone ? "✅ locked in" : "⏳ choose"}`,
  ].join("\n");
}

function makeRows(sessionId: string, hostF: Fighter, oppF: Fighter) {
  const hOpts = getMoveSelectData(hostF);
  const oOpts = getMoveSelectData(oppF);
  if (hOpts.length === 0 || oOpts.length === 0) {
    return null;
  }
  const hMenu = new StringSelectMenuBuilder()
    .setCustomId(`${MOVE_SELECT_PREFIX}${sessionId}:h`)
    .setMinValues(1)
    .setMaxValues(1)
    .setPlaceholder("Fighter 1: pick a move")
    .addOptions(
      hOpts.map((o) => ({
        label: o.label,
        value: o.id,
        description: o.description,
      })),
    );
  const oMenu = new StringSelectMenuBuilder()
    .setCustomId(`${MOVE_SELECT_PREFIX}${sessionId}:o`)
    .setMinValues(1)
    .setMaxValues(1)
    .setPlaceholder("Fighter 2: pick a move")
    .addOptions(
      oOpts.map((o) => ({
        label: o.label,
        value: o.id,
        description: o.description,
      })),
    );
  return [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(hMenu),
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(oMenu),
  ];
}

function parseSelectCustomId(
  id: string,
): { sessionId: string; role: "h" | "o" } | null {
  const m = id.match(/^dojomv:([0-9a-f]+):(h|o)$/);
  if (!m || !m[1] || !m[2]) {
    return null;
  }
  return { sessionId: m[1], role: m[2] as "h" | "o" };
}

export function isMoveSelectMenu(customId: string): boolean {
  return customId.startsWith(MOVE_SELECT_PREFIX) && /:h$|:o$/.test(customId);
}

export async function startMoveSelectionPhase(
  message: Message,
  hostUser: User,
  challenger: { id: string; username: string },
  hostFighter: Fighter,
  oppFighter: Fighter,
  startInteraction?: ButtonInteraction,
  extras?: {
    bo3SessionId?: string;
    tournamentFollowUp?: {
      tournamentId: string;
      round: number;
      matchIndex: number;
    };
  },
): Promise<void> {
  const sessionId = randomBytes(4).toString("hex");
  const rows = makeRows(sessionId, hostFighter, oppFighter);
  if (!rows) {
    await runDojoBattleSequence(message, {
      challengerUser: hostUser,
      opponentId: challenger.id,
      opponentUsername: challenger.username,
      challenger: hostFighter,
      opponent: oppFighter,
      ...(extras?.tournamentFollowUp
        ? { tournamentFollowUp: extras.tournamentFollowUp }
        : {}),
    });
    return;
  }

  const p: MovePending = {
    message,
    hostId: hostUser.id,
    oppId: challenger.id,
    hostFighter,
    oppFighter,
    moveHost: null,
    moveOpp: null,
    timeout: null,
    bo3SessionId: extras?.bo3SessionId ?? null,
    tournamentFollowUp: extras?.tournamentFollowUp ?? null,
  };
  p.timeout = setTimeout(() => {
    void onMoveSelectTimeout(sessionId);
  }, 60_000);
  const hostMention = `<@${p.hostId}>`;
  const oppMention = `<@${p.oppId}>`;
  const bo3State = p.bo3SessionId ? getBo3Session(p.bo3SessionId) : undefined;
  const payload = {
    content: buildSelectContent(
      hostMention,
      oppMention,
      false,
      false,
      bo3State
        ? {
            winsHost: bo3State.winsHost,
            winsOpp: bo3State.winsOpp,
            round: bo3State.round,
          }
        : undefined,
    ),
    components: rows,
  };
  // After host `deferUpdate` on the lobby button, edit the **same** message;
  // `editReply` can break token/message state for follow-up selects.
  if (startInteraction) {
    try {
      const base = startInteraction.message;
      p.message = base.partial ? await base.fetch() : base;
      await p.message.edit(payload);
      setMoveSession(sessionId, p);
      return;
    } catch (e) {
      console.error("startMoveSelectionPhase: message.edit failed, falling back:", e);
    }
  }
  await message.edit(payload);
  setMoveSession(sessionId, p);
}

async function onMoveSelectTimeout(sessionId: string) {
  const s = takeMoveSession(sessionId);
  if (!s) {
    return;
  }
  const a = s.moveHost ?? "basic_strike";
  const b = s.moveOpp ?? "basic_strike";
  const m = s.message;
  const hostU = await m.client.users.fetch(s.hostId);
  const oppU = await m.client.users.fetch(s.oppId);
  try {
    await runDojoBattleSequence(m, {
      challengerUser: hostU,
      opponentId: s.oppId,
      opponentUsername: oppU.username,
      challenger: s.hostFighter,
      opponent: s.oppFighter,
      moveAId: a,
      moveBId: b,
      ...(s.bo3SessionId ? { bo3SessionId: s.bo3SessionId } : {}),
      ...(s.tournamentFollowUp
        ? { tournamentFollowUp: s.tournamentFollowUp }
        : {}),
    });
  } catch (e) {
    console.error("battle after move timeout failed:", e);
  }
}

async function runDojoWhenBothReady(
  sessionId: string,
  s: MovePending,
  interaction: StringSelectMenuInteraction,
) {
  if (s.moveHost === null || s.moveOpp === null) {
    return;
  }
  // Remove session synchronously so the 60s timer cannot race with awaits below.
  const taken = takeMoveSession(sessionId);
  if (!taken) {
    await interaction
      .reply({
        content: "This match already started or ended.",
        flags: 64,
      })
      .catch(() => {
        return interaction.deferUpdate().catch(() => {});
      });
    return;
  }
  const moveA = taken.moveHost;
  const moveB = taken.moveOpp;
  if (moveA === null || moveB === null) {
    return;
  }
  const ma = getMoveById(moveA);
  const mb = getMoveById(moveB);
  try {
    await interaction.update({
      content: `🔒 **Moves locked!** Fighter 1: **${ma.name}** | Fighter 2: **${mb.name}** — battle in progress…`,
      components: [],
    });
  } catch (e) {
    console.error("runDojoWhenBothReady: interaction.update failed:", e);
  }
  const m = taken.message;
  const hostU = await interaction.client.users.fetch(taken.hostId);
  const oppU = await interaction.client.users.fetch(taken.oppId);
  try {
    await runDojoBattleSequence(m, {
      challengerUser: hostU,
      opponentId: taken.oppId,
      opponentUsername: oppU.username,
      challenger: taken.hostFighter,
      opponent: taken.oppFighter,
      moveAId: moveA,
      moveBId: moveB,
      ...(taken.bo3SessionId ? { bo3SessionId: taken.bo3SessionId } : {}),
      ...(taken.tournamentFollowUp
        ? { tournamentFollowUp: taken.tournamentFollowUp }
        : {}),
    });
  } catch (e) {
    console.error("runDojoWhenBothReady: battle sequence failed:", e);
    await m
      .edit({
        content:
          "Battle failed to complete (network or permissions). Check bot perms in this channel and try again.",
        components: [],
      })
      .catch(() => {});
  }
}

export async function handleMoveStringSelect(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  const parsed = parseSelectCustomId(interaction.customId);
  if (!parsed) {
    return;
  }
  const s = getMoveSession(parsed.sessionId);
  if (!s) {
    await interaction.reply({
      content: "This move select is no longer active.",
      flags: 64,
    });
    return;
  }
  if (parsed.role === "h" && interaction.user.id !== s.hostId) {
    await interaction.reply({
      content: "Only **Fighter 1** in this match can use the left-hand menu.",
      flags: 64,
    });
    return;
  }
  if (parsed.role === "o" && interaction.user.id !== s.oppId) {
    await interaction.reply({
      content: "Only **Fighter 2** in this match can use the right-hand menu.",
      flags: 64,
    });
    return;
  }
  const fighterForPick =
    parsed.role === "h" ? s.hostFighter : s.oppFighter;
  const allowedMoveIds = new Set(
    getMoveSelectData(fighterForPick).map((o) => o.id),
  );
  const pickRaw = interaction.values[0];
  if (!pickRaw || !allowedMoveIds.has(pickRaw)) {
    await interaction.reply({
      content:
        "That move isn’t valid for you in this match. Choose again from your menu.",
      flags: 64,
    });
    return;
  }
  const pick = pickRaw;
  if (parsed.role === "h") {
    s.moveHost = pick;
  } else {
    s.moveOpp = pick;
  }

  if (s.moveHost && s.moveOpp) {
    await runDojoWhenBothReady(parsed.sessionId, s, interaction);
    return;
  }

  await interaction.deferUpdate();
  const rows = makeRows(parsed.sessionId, s.hostFighter, s.oppFighter);
  if (!rows) {
    return;
  }
  const hostMention = `<@${s.hostId}>`;
  const oppMention = `<@${s.oppId}>`;
  const hDone = s.moveHost !== null;
  const oDone = s.moveOpp !== null;
  const bo3State = s.bo3SessionId ? getBo3Session(s.bo3SessionId) : undefined;
  await s.message
    .edit({
      content: buildSelectContent(
        hostMention,
        oppMention,
        hDone,
        oDone,
        bo3State
          ? {
              winsHost: bo3State.winsHost,
              winsOpp: bo3State.winsOpp,
              round: bo3State.round,
            }
          : undefined,
      ),
      components: rows,
    })
    .catch(() => {});
}
