import { SlashCommandBuilder } from "discord.js";
import { getActiveSeason } from "../lib/supabase";
import type { DojoCommand } from "../types";

function formatMultiplier(label: string, multiplier: number): string {
  const deltaPercent = (multiplier - 1) * 100;
  const sign = deltaPercent >= 0 ? "+" : "";
  return `${label}: **x${multiplier.toFixed(2)}** (${sign}${deltaPercent.toFixed(0)}%)`;
}

const command: DojoCommand = {
  data: new SlashCommandBuilder()
    .setName("dojo-season")
    .setDescription("Show current seasonal buffs and nerfs."),

  async execute(interaction) {
    try {
      const activeSeason = await getActiveSeason();

      if (!activeSeason) {
        await interaction.reply({
          content:
            "No active season right now. All battles are running with neutral modifiers.",
          ephemeral: true,
        });
        return;
      }

      await interaction.reply({
        content: [
          "📜 **ShonenSOL Season Balance**",
          "",
          `Season: **${activeSeason.name}** (\`${activeSeason.season_key}\`)`,
          `Window: ${new Date(activeSeason.starts_at).toLocaleDateString()} - ${new Date(
            activeSeason.ends_at,
          ).toLocaleDateString()}`,
          "",
          formatMultiplier("Strength", activeSeason.strength_mult),
          formatMultiplier("Speed", activeSeason.speed_mult),
          formatMultiplier("Defense", activeSeason.defense_mult),
          formatMultiplier("Spirit", activeSeason.spirit_mult),
          formatMultiplier("Chakra", activeSeason.chakra_mult),
          formatMultiplier("Luck", activeSeason.luck_mult),
        ].join("\n"),
        ephemeral: true,
      });
    } catch (error) {
      console.error("dojo-season failed:", error);
      await interaction.reply({
        content: "Could not load the current season modifiers.",
        ephemeral: true,
      });
    }
  },
};

export default command;
