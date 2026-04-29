import { SlashCommandBuilder } from "discord.js";
import { claimDailyBonus } from "../lib/supabase";
import type { DojoCommand } from "../types";

const command: DojoCommand = {
  data: new SlashCommandBuilder()
    .setName("dojo-daily")
    .setDescription("Claim a daily Chakra Point stipend (UTC day + weekly bonus)."),

  async execute(interaction) {
    try {
      await interaction.deferReply({ flags: 64 });
      const r = await claimDailyBonus(interaction.user.id);
      if (r.ok) {
        await interaction.editReply({
          content: [
            "☀️ **Daily dojo stipend**",
            ...r.lines,
            "",
            `**Total CP:** ${r.totalCp}`,
          ].join("\n"),
        });
        return;
      }
      if (r.reason === "already_claimed") {
        await interaction.editReply({
          content:
            "You already claimed today’s stipend (UTC). Come back after **00:00 UTC**.",
        });
        return;
      }
      if (r.reason === "no_fighter") {
        await interaction.editReply({
          content: "Register first with `/dojo-register`.",
        });
        return;
      }
      await interaction.editReply({
        content:
          "Daily rewards need **`chakra_points`** and **`daily_bonus_claim_date`** on `dojo_fighters`. Run the README SQL (`alter table …`), then try again. Optional: **`weekly_bonus_week`** unlocks the weekly CP bonus without skipping it.",
      });
    } catch (e) {
      console.error("dojo-daily failed:", e);
      await interaction.editReply({ content: "Could not process daily claim." });
    }
  },
};

export default command;
