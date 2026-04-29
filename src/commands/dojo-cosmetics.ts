import { SlashCommandBuilder } from "discord.js";
import {
  buildCosmeticsComponents,
  buildCosmeticsLines,
} from "../handlers/cosmeticsSelectHandler";
import { formatEquippedTitleLine } from "../lib/cosmetics";
import { getFighterByDiscordId } from "../lib/supabase";
import type { DojoCommand } from "../types";

const command: DojoCommand = {
  data: new SlashCommandBuilder()
    .setName("dojo-cosmetics")
    .setDescription("Buy and equip cosmetic titles (Chakra Points only)."),

  async execute(interaction) {
    try {
      await interaction.deferReply({ flags: 64 });
      const fighter = await getFighterByDiscordId(interaction.user.id);
      if (!fighter) {
        await interaction.editReply({
          content: "You are not registered. Use `/dojo-register` first.",
        });
        return;
      }
      await interaction.editReply({
        content: [
          buildCosmeticsLines(fighter),
          "",
          formatEquippedTitleLine(fighter),
        ].join("\n"),
        components: buildCosmeticsComponents(fighter),
      });
    } catch (e) {
      console.error("dojo-cosmetics failed:", e);
      await interaction.editReply({ content: "Cosmetics unavailable right now." });
    }
  },
};

export default command;
