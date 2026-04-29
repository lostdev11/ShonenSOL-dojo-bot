import { SlashCommandBuilder } from "discord.js";
import { getLeaderboard } from "../lib/supabase";
import { calculateWinRate } from "../lib/stats";
import type { DojoCommand, Fighter } from "../types";

const command: DojoCommand = {
  data: new SlashCommandBuilder()
    .setName("dojo-leaderboard")
    .setDescription("View the top 10 dojo fighters."),

  async execute(interaction) {
    try {
      const fighters = await getLeaderboard();

      if (fighters.length === 0) {
        await interaction.reply("No fighters registered yet.");
        return;
      }

      const sortedTopFighters = fighters
        .sort((a: Fighter, b: Fighter) => {
          if (b.wins !== a.wins) {
            return b.wins - a.wins;
          }

          return calculateWinRate(b.wins, b.losses) - calculateWinRate(a.wins, a.losses);
        })
        .slice(0, 10);

      const rows = sortedTopFighters.map((fighter, index) => {
        const winRate = calculateWinRate(fighter.wins, fighter.losses).toFixed(1);
        return `${index + 1}. **${fighter.username}** - Wins: ${fighter.wins} | Win%: ${winRate}%`;
      });

      await interaction.reply({
        content: `**ShonenSOL Dojo Leaderboard**\n\n${rows.join("\n")}`,
      });
    } catch (error) {
      console.error("dojo-leaderboard failed:", error);
      await interaction.reply({
        content: "Could not load leaderboard.",
        ephemeral: true,
      });
    }
  },
};

export default command;
