import { SlashCommandBuilder } from "discord.js";
import { formatEquippedTitleLine } from "../lib/cosmetics";
import { getFighterByDiscordId } from "../lib/supabase";
import { calculatePowerLevel } from "../lib/stats";
import type { DojoCommand } from "../types";

const command: DojoCommand = {
  data: new SlashCommandBuilder()
    .setName("dojo-stats")
    .setDescription("View your fighter stats and record."),

  async execute(interaction) {
    try {
      const fighter = await getFighterByDiscordId(interaction.user.id);

      if (!fighter) {
        await interaction.reply({
          content:
            "You are not registered yet. Use `/dojo-register` to join the dojo.",
          ephemeral: true,
        });
        return;
      }

      const streakLine =
        fighter.win_streak != null || fighter.loss_streak != null
          ? `Streaks — **${fighter.win_streak ?? 0}** W in a row · **${fighter.loss_streak ?? 0}** L in a row`
          : null;

      await interaction.reply({
        content: [
          `**${fighter.username}'s Dojo Stats**`,
          formatEquippedTitleLine(fighter),
          streakLine ?? "",
          `Strength: **${fighter.strength}**`,
          `Speed: **${fighter.speed}**`,
          `Defense: **${fighter.defense}**`,
          `Spirit: **${fighter.spirit}**`,
          `Chakra: **${fighter.chakra}**`,
          `Luck: **${fighter.luck}**`,
          `Chakra Points: **${fighter.chakra_points ?? 0}** _(/dojo-shop, earn from PvP & training)_`,
          `Wins: **${fighter.wins}**`,
          `Losses: **${fighter.losses}**`,
          `Power Level: **${calculatePowerLevel(fighter)}**`,
          "",
          "_Recent fights:_ `/dojo-history`",
        ].filter(Boolean).join("\n"),
        ephemeral: true,
      });
    } catch (error) {
      console.error("dojo-stats failed:", error);
      await interaction.reply({
        content: "Could not fetch your stats.",
        ephemeral: true,
      });
    }
  },
};

export default command;
