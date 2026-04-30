import type { ButtonInteraction } from "discord.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import {
  addJoiner,
  buildLobbyText,
  getLobby,
  type LobbyJoiner,
  removeJoiner,
  removeLobby,
} from "../lib/lobbyState";
import { startMoveSelectionPhase } from "./moveSelectHandler";
import { buildCpuFighter } from "../lib/cpuOpponent";
import { pickAutoMoveId } from "../lib/moves";
import { runDojoBattleSequence } from "../lib/runDojoBattleSequence";
import { getFighterByDiscordId } from "../lib/supabase";

export const LOBBY_BUTTON_PREFIX = "dojolobby:";

function parseLobbyAction(interaction: ButtonInteraction) {
  const match = interaction.customId.match(
    /^dojolobby:(join|leave|start|start_auto|cpu):(.+)$/,
  );
  if (!match || !match[1] || !match[2]) {
    return null;
  }
  return {
    action: match[1] as "join" | "leave" | "start" | "start_auto" | "cpu",
    lobbyId: match[2],
  };
}

/**
 * @param canStart - Host can start only when at least one challenger joined
 * (button disabled before that, so the host can wait for people without rushing).
 */
export function lobbyButtonRows(lobbyId: string, canStart: boolean) {
  const join = new ButtonBuilder()
    .setCustomId(`${LOBBY_BUTTON_PREFIX}join:${lobbyId}`)
    .setLabel("Join")
    .setStyle(ButtonStyle.Primary);
  const leave = new ButtonBuilder()
    .setCustomId(`${LOBBY_BUTTON_PREFIX}leave:${lobbyId}`)
    .setLabel("Leave")
    .setStyle(ButtonStyle.Secondary);
  const start = new ButtonBuilder()
    .setCustomId(`${LOBBY_BUTTON_PREFIX}start:${lobbyId}`)
    .setLabel("Start battle (host)")
    .setStyle(ButtonStyle.Success)
    .setDisabled(!canStart);
  const quickBattle = new ButtonBuilder()
    .setCustomId(`${LOBBY_BUTTON_PREFIX}start_auto:${lobbyId}`)
    .setLabel("Quick battle")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(!canStart);
  const fightCpu = new ButtonBuilder()
    .setCustomId(`${LOBBY_BUTTON_PREFIX}cpu:${lobbyId}`)
    .setLabel("Fight CPU (test)")
    .setStyle(ButtonStyle.Secondary);
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      join,
      leave,
      start,
      quickBattle,
      fightCpu,
    ),
  ];
}

export function isDojoLobbyButton(customId: string): boolean {
  return customId.startsWith(LOBBY_BUTTON_PREFIX);
}

async function pickRandomRegisteredOpponent(joiners: LobbyJoiner[]) {
  const shuffled = [...joiners].sort(() => Math.random() - 0.5);
  for (const j of shuffled) {
    const fighter = await getFighterByDiscordId(j.id);
    if (fighter) {
      return { joiner: j, fighter };
    }
  }
  return null;
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
        content: "You are the host. Wait for others to join, then use **Start Battle**.",
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
        content: buildLobbyText(afterJoin.hostId, afterJoin.joiners),
        components: lobbyButtonRows(lobbyId, afterJoin.joiners.length > 0),
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
        content: buildLobbyText(lobby.hostId, after.joiners),
        components: lobbyButtonRows(lobbyId, after.joiners.length > 0),
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
            content: buildLobbyText(lobby.hostId, after.joiners),
            components: lobbyButtonRows(lobbyId, after.joiners.length > 0),
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
    if (lobby.joiners.length === 0) {
      await interaction.reply({
        content: "At least one fighter must **Join** before you can start.",
        flags: 64,
      });
      return;
    }
    // Acknowledge immediately so DB fetch + user fetch cannot expire interaction.
    await interaction.deferUpdate();
    const picked = await pickRandomRegisteredOpponent(lobby.joiners);
    if (!picked) {
      await interaction.followUp({
        content:
          "No eligible challenger available. Ask someone to join with a registered fighter (`/dojo-register`) and try again.",
        flags: 64,
      });
      return;
    }
    const challengerFighter = await getFighterByDiscordId(lobby.hostId);
    const opponentFighter = picked.fighter;
    if (!challengerFighter) {
      await interaction.followUp({
        content: "Could not load the host fighter. Make sure the host is registered.",
        flags: 64,
      });
      return;
    }
    removeLobby(lobbyId);
    const message = interaction.message;
    const hostUser = interaction.user;
    try {
      if (autoMoves) {
        await runDojoBattleSequence(message, {
          challengerUser: hostUser,
          opponentId: picked.joiner.id,
          opponentUsername: picked.joiner.username,
          challenger: challengerFighter,
          opponent: opponentFighter,
          moveAId: pickAutoMoveId(challengerFighter),
          moveBId: pickAutoMoveId(opponentFighter),
        });
      } else {
        await startMoveSelectionPhase(
          message,
          hostUser,
          picked.joiner,
          challengerFighter,
          opponentFighter,
          interaction,
        );
      }
    } catch (err) {
      console.error(autoMoves ? "runDojoBattleSequence (quick) failed:" : "startMoveSelectionPhase failed:", err);
      await interaction
        .followUp({
          content:
            "Battle failed to start in this channel. Check bot permissions (View Channel, Send Messages, Read Message History).",
          flags: 64,
        })
        .catch(() => {});
    }
  }
}
