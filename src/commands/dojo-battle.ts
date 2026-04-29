import { SlashCommandBuilder } from "discord.js";
import { getFighterByDiscordId } from "../lib/supabase";
import { buildLobbyText, createLobby } from "../lib/lobbyState";
import { lobbyButtonRows } from "../handlers/lobbyButtons";
import { buildCpuFighter } from "../lib/cpuOpponent";
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
      const host = interaction.user;
      const fighter = await getFighterByDiscordId(host.id);
      if (!fighter) {
        await interaction.reply({
          content: "You are not registered. Use `/dojo-register` first.",
          flags: 64,
        });
        return;
      }

      const mode = interaction.options.getString("mode") ?? "pvp";
      if (mode === "cpu") {
        const cpuFighter = buildCpuFighter(fighter);
        await interaction.reply({
          content: "🧪 Starting CPU test battle...",
        });
        const battleMessage = await interaction.fetchReply();
        await runDojoBattleSequence(battleMessage, {
          challengerUser: host,
          opponentId: cpuFighter.discord_user_id,
          opponentUsername: cpuFighter.username,
          challenger: fighter,
          opponent: cpuFighter,
          isCpuBattle: true,
          opponentLabel: "🤖 Dojo CPU",
        });
        return;
      }

      const { lobbyId } = createLobby(host.id);

      await interaction.reply({
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
