import { randomBytes } from "node:crypto";
import { ActionRowBuilder, StringSelectMenuBuilder } from "discord.js";
import type { Message, StringSelectMenuInteraction } from "discord.js";
import type { Fighter } from "../types";
import {
  FFA_MOVE_SELECT_PREFIX,
  getFfaMoveSession,
  parseFfaMoveSelectCustomId,
  setFfaMoveSession,
  takeFfaMoveSession,
  type FfaMovePending,
} from "../lib/ffaMoveSession";
import { getMoveSelectData } from "../lib/moves";
import { runDojoFreeForAllSequence } from "../lib/runDojoFreeForAllSequence";

export const MAX_FFA_MOVE_MENU_FIGHTERS = 5;

export function isFfaMoveSelectMenu(customId: string): boolean {
  return (
    customId.startsWith(FFA_MOVE_SELECT_PREFIX) &&
    parseFfaMoveSelectCustomId(customId) !== null
  );
}

function buildFfaContent(slots: FfaMovePending["slots"]) {
  const lines = slots.map((s) => {
    const status = s.moveId === null ? "⏳ choose" : "✅ locked in";
    return `<@${s.userId}> — ${status}`;
  });
  return [
    "🎯 **Free-for-all — pick moves**",
    "_Everyone fights everyone — scores resolve in one clash._",
    "",
    "**90s** total — unfilled slots default to **Basic Strike**.",
    "",
    ...lines,
  ].join("\n");
}

function makeFfaRows(sessionId: string, slots: FfaMovePending["slots"]) {
  const rows: ActionRowBuilder<StringSelectMenuBuilder>[] = [];
  for (const s of slots) {
    const opts = getMoveSelectData(s.fighter);
    if (opts.length === 0) {
      return null;
    }
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`${FFA_MOVE_SELECT_PREFIX}${sessionId}:${s.userId}`)
      .setMinValues(1)
      .setMaxValues(1)
      .setPlaceholder(`${s.username.slice(0, 80)}: pick a move`)
      .addOptions(
        opts.map((o) => ({
          label: o.label.slice(0, 100),
          value: o.id,
          description: o.description?.slice(0, 100),
        })),
      );
    rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu));
  }
  return rows;
}

async function onFfaMoveTimeout(sessionId: string) {
  const taken = takeFfaMoveSession(sessionId);
  if (!taken) {
    return;
  }
  if (taken.timeout) {
    clearTimeout(taken.timeout);
  }
  const slots = taken.slots.map((s) => ({
    fighter: s.fighter,
    moveId: s.moveId ?? "basic_strike",
  }));
  const m = taken.message;
  try {
    await m.edit({
      content: "🔒 **Moves locked** (timer) — resolving free-for-all…",
      components: [],
    });
  } catch (e) {
    console.error("ffa timeout message.edit failed:", e);
  }
  try {
    await runDojoFreeForAllSequence(m, { slots });
  } catch (e) {
    console.error("runDojoFreeForAllSequence after FFA timeout failed:", e);
    await m
      .edit({
        content:
          "Free-for-all failed to complete. Check bot permissions and try again.",
        components: [],
      })
      .catch(() => {});
  }
}

export async function startFfaMoveSelectionPhase(
  message: Message,
  slotsInput: { id: string; username: string; fighter: Fighter }[],
): Promise<void> {
  const sessionId = randomBytes(6).toString("hex");
  const slots = slotsInput.map((s) => ({
    userId: s.id,
    username: s.username,
    fighter: s.fighter,
    moveId: null as string | null,
  }));

  const rows = makeFfaRows(sessionId, slots);
  if (!rows) {
    await runDojoFreeForAllSequence(message, {
      slots: slots.map((s) => ({ fighter: s.fighter, moveId: "basic_strike" })),
    });
    return;
  }

  const pending: FfaMovePending = {
    message,
    sessionId,
    slots,
    timeout: null,
  };
  pending.timeout = setTimeout(() => {
    void onFfaMoveTimeout(sessionId);
  }, 90_000);

  await message.edit({
    content: buildFfaContent(slots),
    components: rows,
  });
  setFfaMoveSession(sessionId, pending);
}

export async function handleFfaMoveStringSelect(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  const parsed = parseFfaMoveSelectCustomId(interaction.customId);
  if (!parsed) {
    return;
  }
  const session = getFfaMoveSession(parsed.sessionId);
  if (!session) {
    await interaction.reply({
      content: "This free-for-all move select is no longer active.",
      flags: 64,
    });
    return;
  }
  if (interaction.user.id !== parsed.userId) {
    await interaction.reply({
      content: "Use **your own** menu for this free-for-all.",
      flags: 64,
    });
    return;
  }

  const slot = session.slots.find((s) => s.userId === parsed.userId);
  if (!slot) {
    await interaction.reply({ content: "Could not match your pick to this brawl.", flags: 64 });
    return;
  }

  const allowedMoveIds = new Set(getMoveSelectData(slot.fighter).map((o) => o.id));
  const pickRaw = interaction.values[0];
  if (!pickRaw || !allowedMoveIds.has(pickRaw)) {
    await interaction.reply({
      content: "That move isn’t valid here — pick again from your menu.",
      flags: 64,
    });
    return;
  }

  slot.moveId = pickRaw;

  const allReady = session.slots.every((s) => s.moveId !== null);
  if (allReady) {
    if (session.timeout) {
      clearTimeout(session.timeout);
    }
    const taken = takeFfaMoveSession(parsed.sessionId);
    if (!taken) {
      await interaction.reply({ content: "This brawl already resolved.", flags: 64 });
      return;
    }
    await interaction.deferUpdate();
    try {
      await taken.message.edit({
        content: "🔒 **Everyone’s locked in** — resolving free-for-all…",
        components: [],
      });
    } catch (e) {
      console.error("ffa all-ready message.edit failed:", e);
    }
    try {
      await runDojoFreeForAllSequence(taken.message, {
        slots: taken.slots.map((s) => ({
          fighter: s.fighter,
          moveId: s.moveId!,
        })),
      });
    } catch (e) {
      console.error("runDojoFreeForAllSequence (FFA all ready) failed:", e);
      await taken.message
        .edit({
          content:
            "Free-for-all failed to complete. Check bot permissions and try again.",
          components: [],
        })
        .catch(() => {});
    }
    return;
  }

  await interaction.deferUpdate();
  const rows = makeFfaRows(parsed.sessionId, session.slots);
  if (!rows) {
    return;
  }
  await session.message
    .edit({
      content: buildFfaContent(session.slots),
      components: rows,
    })
    .catch(() => {});
}
