import { SlashCommandBuilder } from "discord.js";
import { getFighterByDiscordId } from "../lib/supabase";
import { buildLobbyText, createLobby } from "../lib/lobbyState";
import { lobbyButtonRows } from "../handlers/lobbyButtons";
import { buildCpuFighter } from "../lib/cpuOpponent";
import { pickRandomMoveId, pickRandomMoveIdAvoiding } from "../lib/moves";
import { runDojoBattleSequence } from "../lib/runDojoBattleSequence";
import type { DojoCommand } from "../types";

const command: DojoCommand = {
  data: new SlashCommandBuilder()
    .setName("dojo-battle")
    .setDescription("Open a battle lobby, or test instantly against CPU.")
    .addStringOption((option) =>
      option
        .setName("mode")
        .setDescription("Battle mode")
        .addChoices(
          { name: "Lobby (PvP)", value: "pvp" },
          { name: "CPU (testing)", value: "cpu" },
        ),
    ),

  async execute(interaction) {
    try {
      await interaction.deferReply();
      const host = interaction.user;
      const fighter = await getFighterByDiscordId(host.id);
      if (!fighter) {
        await interaction.editReply({
          content: "You are not registered. Use `/dojo-register` first.",
        });
        return;
      }

      const mode = interaction.options.getString("mode") ?? "pvp";
      if (mode === "cpu") {
        const cpuFighter = buildCpuFighter(fighter);
        const moveAId = pickRandomMoveId(fighter);
        const moveBId = pickRandomMoveIdAvoiding(cpuFighter, moveAId);
        await interaction.editReply({
          content: "🧪 Starting CPU test battle...",
        });
        const battleMessage = await interaction.fetchReply();
        await runDojoBattleSequence(battleMessage, {
          challengerUser: host,
          opponentId: cpuFighter.discord_user_id,
          opponentUsername: cpuFighter.username,
          challenger: fighter,
          opponent: cpuFighter,
          moveAId,
          moveBId,
          isCpuBattle: true,
          opponentLabel: "🤖 Dojo CPU",
          slashInteraction: interaction,
        });
        return;
      }

      const { lobbyId } = createLobby(host.id);

      await interaction.editReply({
        content: buildLobbyText(host.id, []),
        // Host cannot start until someone joins; gives everyone time to enter the dojo.
        components: lobbyButtonRows(lobbyId, false),
      });
    } catch (error) {
      console.error("dojo-battle failed:", error);
      const maybeDiscordError = error as { code?: number | string };
      if (maybeDiscordError?.code === 10062 || maybeDiscordError?.code === "10062") {
        return;
      }
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content: "Failed to open battle lobby.",
            flags: 64,
          });
          return;
        }
        await interaction.reply({ content: "Failed to open battle lobby.", flags: 64 });
      } catch (e) {
        console.error("dojo-battle follow-up failed:", e);
      }
    }
  },
};

export default command;
