import type { ButtonInteraction, TextChannel, User } from "discord.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import {
  addJoiner,
  buildLobbyText,
  getLobby,
  type LobbyFormat,
  type LobbyJoiner,
  removeJoiner,
  removeLobby,
} from "../lib/lobbyState";
import { runDojoFreeForAllSequence } from "../lib/runDojoFreeForAllSequence";
import {
  MAX_FFA_MOVE_MENU_FIGHTERS,
  startFfaMoveSelectionPhase,
} from "./ffaMoveSelectHandler";
import { startMoveSelectionPhase } from "./moveSelectHandler";
import { buildCpuFighter } from "../lib/cpuOpponent";
import { pickAutoMoveId, pickRandomMoveId, pickRandomMoveIdAvoiding } from "../lib/moves";
import { runDojoBattleSequence } from "../lib/runDojoBattleSequence";
import { getFighterByDiscordId } from "../lib/supabase";
import type { Fighter } from "../types";

export const LOBBY_BUTTON_PREFIX = "dojolobby:";

function parseLobbyAction(interaction: ButtonInteraction) {
  const match = interaction.customId.match(
    /^dojolobby:(join|leave|start|start_auto|ffa_start|ffa_auto|cpu):(.+)$/,
  );
  if (!match || !match[1] || !match[2]) {
    return null;
  }
  return {
    action: match[1] as
      | "join"
      | "leave"
      | "start"
      | "start_auto"
      | "ffa_start"
      | "ffa_auto"
      | "cpu",
    lobbyId: match[2],
  };
}

/**
 * @param canStart - Host can start only when at least one challenger joined
 * (button disabled before that, so the host can wait for people without rushing).
 */
export function lobbyButtonRows(lobbyId: string, canStart: boolean, format: LobbyFormat) {
  const join = new ButtonBuilder()
    .setCustomId(`${LOBBY_BUTTON_PREFIX}join:${lobbyId}`)
    .setLabel("Join")
    .setStyle(ButtonStyle.Primary);
  const leave = new ButtonBuilder()
    .setCustomId(`${LOBBY_BUTTON_PREFIX}leave:${lobbyId}`)
    .setLabel("Leave")
    .setStyle(ButtonStyle.Secondary);
  const fightCpu = new ButtonBuilder()
    .setCustomId(`${LOBBY_BUTTON_PREFIX}cpu:${lobbyId}`)
    .setLabel("Fight CPU (test)")
    .setStyle(ButtonStyle.Secondary);

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(join, leave, fightCpu);

  if (format === "ffa") {
    const ffaMoves = new ButtonBuilder()
      .setCustomId(`${LOBBY_BUTTON_PREFIX}ffa_start:${lobbyId}`)
      .setLabel("FFA · pick moves")
      .setStyle(ButtonStyle.Success)
      .setDisabled(!canStart);
    const ffaQuick = new ButtonBuilder()
      .setCustomId(`${LOBBY_BUTTON_PREFIX}ffa_auto:${lobbyId}`)
      .setLabel("FFA · quick")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!canStart);
    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(ffaMoves, ffaQuick);
    return [row1, row2];
  }

  const start = new ButtonBuilder()
    .setCustomId(`${LOBBY_BUTTON_PREFIX}start:${lobbyId}`)
    .setLabel("Brackets · moves")
    .setStyle(ButtonStyle.Success)
    .setDisabled(!canStart);
  const quickBattle = new ButtonBuilder()
    .setCustomId(`${LOBBY_BUTTON_PREFIX}start_auto:${lobbyId}`)
    .setLabel("Brackets · quick")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(!canStart);
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(start, quickBattle);
  return [row1, row2];
}

export function isDojoLobbyButton(customId: string): boolean {
  return customId.startsWith(LOBBY_BUTTON_PREFIX);
}

type LobbyFighterSlot = {
  id: string;
  username: string;
  fighter: Fighter;
};

async function loadRegisteredLobbyFighters(
  hostUser: User,
  joiners: LobbyJoiner[],
): Promise<
  | { ok: false; code: "host_unregistered" | "too_few" }
  | { ok: true; fighters: LobbyFighterSlot[]; skippedJoiners: LobbyJoiner[] }
> {
  const hostFighter = await getFighterByDiscordId(hostUser.id);
  if (!hostFighter) {
    return { ok: false, code: "host_unregistered" };
  }
  const fighters: LobbyFighterSlot[] = [
    { id: hostUser.id, username: hostUser.username, fighter: hostFighter },
  ];
  const skippedJoiners: LobbyJoiner[] = [];
  for (const j of joiners) {
    const f = await getFighterByDiscordId(j.id);
    if (f) {
      fighters.push({ id: j.id, username: j.username, fighter: f });
    } else {
      skippedJoiners.push(j);
    }
  }
  if (fighters.length < 2) {
    return { ok: false, code: "too_few" };
  }
  return { ok: true, fighters, skippedJoiners };
}

function shuffleIntoPairs(fighters: LobbyFighterSlot[]): {
  pairs: [LobbyFighterSlot, LobbyFighterSlot][];
  bye: LobbyFighterSlot | null;
} {
  const shuffled = [...fighters].sort(() => Math.random() - 0.5);
  const pairs: [LobbyFighterSlot, LobbyFighterSlot][] = [];
  const pairCount = Math.floor(shuffled.length / 2);
  for (let i = 0; i < pairCount; i++) {
    const a = shuffled[i * 2];
    const b = shuffled[i * 2 + 1];
    if (a && b) {
      pairs.push([a, b]);
    }
  }
  const bye = shuffled.length % 2 === 1 ? shuffled[shuffled.length - 1]! : null;
  return { pairs, bye };
}

export async function handleLobbyButton(interaction: ButtonInteraction): Promise<void> {
  const parsed = parseLobbyAction(interaction);
  if (!parsed) {
    return;
  }
  const { action, lobbyId } = parsed;

  if (action === "join") {
    const lobby = getLobby(lobbyId);
    if (!lobby) {
      await interaction.reply({
        content: "This lobby is no longer available. Run `/dojo-battle` again.",
        flags: 64,
      });
      return;
    }
    if (interaction.user.id === lobby.hostId) {
      await interaction.reply({
        content:
          "You are the host. Wait for others to join, then start from the **host buttons** below.",
        flags: 64,
      });
      return;
    }
    const fighter = await getFighterByDiscordId(interaction.user.id);
    if (!fighter) {
      await interaction.reply({
        content: "You must register first with `/dojo-register` before joining a battle lobby.",
        flags: 64,
      });
      return;
    }
    const done = addJoiner(lobbyId, {
      id: interaction.user.id,
      username: interaction.user.username,
    });
    if (done.ok === false) {
      await interaction.reply({
        content: "This lobby is no longer available. Run `/dojo-battle` again.",
        flags: 64,
      });
      return;
    }
    if (done.duplicate) {
      await interaction.reply({ content: "You are already in the lobby.", flags: 64 });
      return;
    }
    const afterJoin = getLobby(lobbyId);
    if (!afterJoin) {
      await interaction.followUp({
        content: "This lobby is no longer available. Run `/dojo-battle` again.",
        flags: 64,
      });
      return;
    }
    try {
      await interaction.update({
        content: buildLobbyText(afterJoin.hostId, afterJoin.joiners, afterJoin.format),
        components: lobbyButtonRows(lobbyId, afterJoin.joiners.length > 0, afterJoin.format),
      });
    } catch (err) {
      console.error("lobby join interaction.update failed:", err);
      try {
        await interaction.reply({
          content:
            "You joined, but the lobby list could not refresh in this channel. Check bot channel permissions (View Channel, Send Messages, Read Message History).",
          flags: 64,
        });
      } catch (inner) {
        console.error("lobby join message.edit fallback failed:", inner);
      }
    }
    return;
  }

  if (action === "leave") {
    const lobby = getLobby(lobbyId);
    if (!lobby) {
      await interaction.reply({
        content: "This lobby is no longer available.",
        flags: 64,
      });
      return;
    }
    if (interaction.user.id === lobby.hostId) {
      await interaction.reply({ content: "The host cannot leave. Cancel by deleting the message or run a new battle.", flags: 64 });
      return;
    }
    if (!lobby.joiners.some((j) => j.id === interaction.user.id)) {
      await interaction.reply({ content: "You are not in this lobby.", flags: 64 });
      return;
    }
    removeJoiner(lobbyId, interaction.user.id);
    const after = getLobby(lobbyId);
    if (!after) {
      return;
    }
    try {
      await interaction.update({
        content: buildLobbyText(lobby.hostId, after.joiners, after.format),
        components: lobbyButtonRows(lobbyId, after.joiners.length > 0, after.format),
      });
    } catch (err) {
      console.error("lobby leave interaction.update failed:", err);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.deferUpdate();
        }
        const base = interaction.message;
        const msg = base && "fetch" in base && base.partial ? await base.fetch() : base;
        if (msg) {
          await msg.edit({
            content: buildLobbyText(lobby.hostId, after.joiners, after.format),
            components: lobbyButtonRows(lobbyId, after.joiners.length > 0, after.format),
          });
        }
      } catch (inner) {
        console.error("lobby leave message.edit fallback failed:", inner);
      }
    }
    return;
  }

  if (action === "cpu") {
    const lobby = getLobby(lobbyId);
    if (!lobby) {
      await interaction.reply({
        content: "This lobby is no longer available. Run `/dojo-battle` again.",
        flags: 64,
      });
      return;
    }
    if (interaction.user.id !== lobby.hostId) {
      await interaction.reply({
        content: "Only the **host** can start a CPU test battle.",
        flags: 64,
      });
      return;
    }
    await interaction.deferUpdate();
    const hostFighter = await getFighterByDiscordId(lobby.hostId);
    if (!hostFighter) {
      await interaction.followUp({
        content: "Could not load the host fighter. Make sure the host is registered.",
        flags: 64,
      });
      return;
    }
    const cpuFighter = buildCpuFighter(hostFighter);
    const moveAId = pickRandomMoveId(hostFighter);
    const moveBId = pickRandomMoveIdAvoiding(cpuFighter, moveAId);
    removeLobby(lobbyId);
    const message = interaction.message;
    const hostUser = interaction.user;
    try {
      await runDojoBattleSequence(message, {
        challengerUser: hostUser,
        opponentId: cpuFighter.discord_user_id,
        opponentUsername: cpuFighter.username,
        challenger: hostFighter,
        opponent: cpuFighter,
        moveAId,
        moveBId,
        isCpuBattle: true,
        opponentLabel: "🤖 Dojo CPU",
      });
    } catch (err) {
      console.error("runDojoBattleSequence (CPU) failed:", err);
      await interaction
        .followUp({
          content:
            "CPU battle failed in this channel. Check bot permissions (View Channel, Send Messages, Read Message History).",
          flags: 64,
        })
        .catch(() => {});
    }
    return;
  }

  if (action === "start" || action === "start_auto") {
    const autoMoves = action === "start_auto";
    const lobby = getLobby(lobbyId);
    if (!lobby) {
      await interaction.reply({
        content: "This lobby is no longer available. Run `/dojo-battle` again.",
        flags: 64,
      });
      return;
    }
    if (interaction.user.id !== lobby.hostId) {
      await interaction.reply({
        content: "Only the **host** can start the battle.",
        flags: 64,
      });
      return;
    }
    if (lobby.format !== "bracket") {
      await interaction.reply({
        content:
          "This lobby is **free-for-all** — use **FFA · pick moves** or **FFA · quick**.",
        flags: 64,
      });
      return;
    }
    if (lobby.joiners.length === 0) {
      await interaction.reply({
        content: "At least one fighter must **Join** before you can start.",
        flags: 64,
      });
      return;
    }
    // Acknowledge immediately so DB fetch + user fetch cannot expire interaction.
    await interaction.deferUpdate();
    const channel = interaction.channel;
    if (!channel || !("send" in channel)) {
      await interaction.followUp({
        content: "Battles need a server channel where the bot can send messages.",
        flags: 64,
      });
      return;
    }
    const textChannel = channel as TextChannel;

    const loaded = await loadRegisteredLobbyFighters(interaction.user, lobby.joiners);
    if (!loaded.ok) {
      if (loaded.code === "host_unregistered") {
        await interaction.followUp({
          content: "Could not load the host fighter. Make sure the host is registered.",
          flags: 64,
        });
        return;
      }
      await interaction.followUp({
        content:
          "Need at least **two** registered fighters (host + joiners with `/dojo-register`). Unregistered joiners don’t count.",
        flags: 64,
      });
      return;
    }

    const { pairs, bye } = shuffleIntoPairs(loaded.fighters);
    removeLobby(lobbyId);

    const summaryLines: string[] = [
      "⚔️ **Bracket started** — random pairings:",
      ...pairs.map(([a, b], i) => `**Match ${i + 1}:** <@${a.id}> vs <@${b.id}>`),
    ];
    if (bye) {
      summaryLines.push(
        `⏸️ **Bye:** <@${bye.id}> — odd fighter count, sitting out this round.`,
      );
    }
    if (loaded.skippedJoiners.length > 0) {
      summaryLines.push(
        `⚠️ **Not registered** (skipped): ${loaded.skippedJoiners.map((j) => `<@${j.id}>`).join(", ")}`,
      );
    }
    summaryLines.push(
      "",
      "_Each match is in its own message below — use the move menus on **your** fight._",
    );

    try {
      await interaction.message.edit({
        content: summaryLines.join("\n"),
        components: [],
      });
    } catch (e) {
      console.error("lobby bracket summary edit failed:", e);
    }

    const client = interaction.client;
    const startOneMatch = async (a: LobbyFighterSlot, b: LobbyFighterSlot) => {
      const u1 = await client.users.fetch(a.id);
      const battleMessage = await textChannel.send({
        content: `⚔️ **Match** — <@${a.id}> vs <@${b.id}>`,
      });
      if (autoMoves) {
        await runDojoBattleSequence(battleMessage, {
          challengerUser: u1,
          opponentId: b.id,
          opponentUsername: b.username,
          challenger: a.fighter,
          opponent: b.fighter,
          moveAId: pickAutoMoveId(a.fighter),
          moveBId: pickAutoMoveId(b.fighter),
        });
      } else {
        await startMoveSelectionPhase(
          battleMessage,
          u1,
          { id: b.id, username: b.username },
          a.fighter,
          b.fighter,
        );
      }
    };

    try {
      await Promise.all(pairs.map(([a, b]) => startOneMatch(a, b)));
    } catch (err) {
      console.error(
        autoMoves ? "runDojoBattleSequence (quick bracket) failed:" : "startMoveSelectionPhase (bracket) failed:",
        err,
      );
      await interaction
        .followUp({
          content:
            "One or more matches failed to start. Check bot permissions (View Channel, Send Messages, Read Message History).",
          flags: 64,
        })
        .catch(() => {});
    }
  }

  if (action === "ffa_start" || action === "ffa_auto") {
    const autoMoves = action === "ffa_auto";
    const lobby = getLobby(lobbyId);
    if (!lobby) {
      await interaction.reply({
        content: "This lobby is no longer available. Run `/dojo-battle` again.",
        flags: 64,
      });
      return;
    }
    if (interaction.user.id !== lobby.hostId) {
      await interaction.reply({
        content: "Only the **host** can start the free-for-all.",
        flags: 64,
      });
      return;
    }
    if (lobby.format !== "ffa") {
      await interaction.reply({
        content:
          "This lobby uses **brackets** — use **Brackets · moves** or **Brackets · quick**.",
        flags: 64,
      });
      return;
    }
    if (lobby.joiners.length === 0) {
      await interaction.reply({
        content: "At least one fighter must **Join** before you can start.",
        flags: 64,
      });
      return;
    }

    await interaction.deferUpdate();
    const channel = interaction.channel;
    if (!channel || !("send" in channel)) {
      await interaction.followUp({
        content: "Battles need a server channel where the bot can send messages.",
        flags: 64,
      });
      return;
    }
    const textChannel = channel as TextChannel;

    const loaded = await loadRegisteredLobbyFighters(interaction.user, lobby.joiners);
    if (!loaded.ok) {
      if (loaded.code === "host_unregistered") {
        await interaction.followUp({
          content: "Could not load the host fighter. Make sure the host is registered.",
          flags: 64,
        });
        return;
      }
      await interaction.followUp({
        content:
          "Need at least **two** registered fighters (host + joiners with `/dojo-register`). Unregistered joiners don’t count.",
        flags: 64,
      });
      return;
    }

    if (!autoMoves && loaded.fighters.length > MAX_FFA_MOVE_MENU_FIGHTERS) {
      await interaction.followUp({
        content: `**FFA · pick moves** supports at most **${MAX_FFA_MOVE_MENU_FIGHTERS}** fighters. Use **FFA · quick** instead, or open a **bracket** lobby for larger groups.`,
        flags: 64,
      });
      return;
    }

    const shuffled = [...loaded.fighters].sort(() => Math.random() - 0.5);
    removeLobby(lobbyId);

    const summaryLines: string[] = [
      "⚔️ **Free-for-all started**",
      `**Fighters (${shuffled.length}):** ${shuffled.map((f) => `<@${f.id}>`).join(" · ")}`,
    ];
    if (loaded.skippedJoiners.length > 0) {
      summaryLines.push(
        `⚠️ **Not registered** (skipped): ${loaded.skippedJoiners.map((j) => `<@${j.id}>`).join(", ")}`,
      );
    }
    summaryLines.push(
      "",
      "_Resolution posts below — **one ranked outcome** for the whole brawl._",
    );

    try {
      await interaction.message.edit({
        content: summaryLines.join("\n"),
        components: [],
      });
    } catch (e) {
      console.error("lobby FFA summary edit failed:", e);
    }

    const battleMessage = await textChannel.send({
      content: autoMoves
        ? "⚔️ **Free-for-all** — auto moves, resolving…"
        : "⚔️ **Free-for-all** — pick your moves…",
    });

    try {
      if (autoMoves) {
        await runDojoFreeForAllSequence(battleMessage, {
          slots: shuffled.map((s) => ({
            fighter: s.fighter,
            moveId: pickAutoMoveId(s.fighter),
          })),
        });
      } else {
        await startFfaMoveSelectionPhase(
          battleMessage,
          shuffled.map((s) => ({ id: s.id, username: s.username, fighter: s.fighter })),
        );
      }
    } catch (err) {
      console.error(autoMoves ? "FFA quick failed:" : "FFA move phase failed:", err);
      await interaction
        .followUp({
          content:
            "Free-for-all failed to run in this channel. Check bot permissions (View Channel, Send Messages, Read Message History).",
          flags: 64,
        })
        .catch(() => {});
    }
  }
}
