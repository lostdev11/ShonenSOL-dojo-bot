import { SlashCommandBuilder } from "discord.js";
import { buildCpuFighter } from "../lib/cpuOpponent";
import { getFighterByDiscordId } from "../lib/supabase";
import { runDojoBattleSequence } from "../lib/runDojoBattleSequence";
import type { DojoCommand } from "../types";

/** Alias for instant CPU practice — no PvP records. */
const command: DojoCommand = {
  data: new SlashCommandBuilder()
    .setName("dojo-spar")
    .setDescription("Spar the Dojo CPU instantly (no PvP records)."),

  async execute(interaction) {
    try {
      await interaction.deferReply();
      const fighter = await getFighterByDiscordId(interaction.user.id);
      if (!fighter) {
        await interaction.editReply({
          content: "You are not registered. Use `/dojo-register` first.",
        });
        return;
      }
      const cpuFighter = buildCpuFighter(fighter);
      await interaction.editReply({
        content: "🥋 **Sparring session** vs CPU — hang tight…",
      });
      const battleMessage = await interaction.fetchReply();
      await runDojoBattleSequence(battleMessage, {
        challengerUser: interaction.user,
        opponentId: cpuFighter.discord_user_id,
        opponentUsername: cpuFighter.username,
        challenger: fighter,
        opponent: cpuFighter,
        isCpuBattle: true,
        opponentLabel: "🤖 Dojo CPU",
        slashInteraction: interaction,
      });
    } catch (error) {
      console.error("dojo-spar failed:", error);
      try {
        await interaction.followUp({
          content: "Sparring failed to run.",
          flags: 64,
        });
      } catch {
        /* ignore */
      }
    }
  },
};

export default command;
