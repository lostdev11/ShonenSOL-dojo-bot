import { SlashCommandBuilder } from "discord.js";
import { buildShopComponents, buildShopMessageContent } from "../handlers/shopHandler";
import { getFighterByDiscordId } from "../lib/supabase";
import type { DojoCommand } from "../types";

const command: DojoCommand = {
  data: new SlashCommandBuilder()
    .setName("dojo-shop")
    .setDescription("Spend Chakra Points on battle moves (low to high tier)."),

  async execute(interaction) {
    try {
      await interaction.deferReply({ flags: 64 });
    } catch {
      return;
    }

    try {
      const fighter = await getFighterByDiscordId(interaction.user.id);
      if (!fighter) {
        await interaction.editReply({
          content: "You are not registered. Use `/dojo-register` first.",
        });
        return;
      }
      await interaction.editReply({
        content: buildShopMessageContent(fighter),
        components: buildShopComponents(fighter),
      });
    } catch (error) {
      console.error("dojo-shop failed:", error);
      await interaction.editReply({ content: "The shop is unavailable right now." });
    }
  },
};

export default command;
