import { SlashCommandBuilder } from "discord.js";
import { createFighter, getFighterByDiscordId } from "../lib/supabase";
import { calculatePowerLevel, generateRandomStats } from "../lib/stats";
import type { DojoCommand, Fighter } from "../types";

function formatFighterProfile(fighter: Fighter) {
  return [
    `Strength: **${fighter.strength}**`,
    `Speed: **${fighter.speed}**`,
    `Defense: **${fighter.defense}**`,
    `Spirit: **${fighter.spirit}**`,
    `Chakra: **${fighter.chakra}**`,
    `Luck: **${fighter.luck}**`,
    `Chakra Points: **${fighter.chakra_points ?? 0}** _(/dojo-shop — earn in battles & training)_`,
    `Wins/Losses: **${fighter.wins}/${fighter.losses}**`,
    `Power Level: **${calculatePowerLevel(fighter)}**`,
  ].join("\n");
}

const command: DojoCommand = {
  data: new SlashCommandBuilder()
    .setName("dojo-register")
    .setDescription("Register as a fighter in ShonenSOL Dojo."),

  async execute(interaction) {
    try {
      const discordUserId = interaction.user.id;
      const username = interaction.user.username;

      const existingFighter = await getFighterByDiscordId(discordUserId);

      if (existingFighter) {
        await interaction.reply({
          content: `You are already registered, **${existingFighter.username}**.\n\n${formatFighterProfile(existingFighter)}`,
          ephemeral: true,
        });
        return;
      }

      const stats = generateRandomStats();
      const newFighter = await createFighter(discordUserId, username, stats);

      await interaction.reply({
        content: `Welcome to the dojo, **${newFighter.username}**.\nYour fighter has awakened!\n\n${formatFighterProfile(newFighter)}`,
      });
    } catch (error) {
      console.error("dojo-register failed:", error);
      await interaction.reply({
        content: "Registration failed due to an unexpected error.",
        ephemeral: true,
      });
    }
  },
};

export default command;
