import { SlashCommandBuilder } from "discord.js";
import { getRecentBattlesForUser } from "../lib/supabase";
import type { DojoCommand } from "../types";

const command: DojoCommand = {
  data: new SlashCommandBuilder()
    .setName("dojo-history")
    .setDescription("Show your last few ranked PvP battles (same channel bot saves).")
    .addIntegerOption((o) =>
      o
        .setName("count")
        .setDescription("How many battles (max 10)")
        .setMinValue(1)
        .setMaxValue(10),
    ),

  async execute(interaction) {
    try {
      await interaction.deferReply({ flags: 64 });
      const n = interaction.options.getInteger("count") ?? 5;
      const rows = await getRecentBattlesForUser(interaction.user.id, n);
      if (rows.length === 0) {
        await interaction.editReply({
          content:
            "No PvP battles on record yet — win something impressive first (or check Supabase `dojo_battles`).",
        });
        return;
      }
      const lines = rows.map((r) => {
        const wl = r.won ? "W" : "L";
        return `• **${wl}** vs <@${r.opponentId}> — **${r.myScore.toFixed(2)}**–**${r.theirScore.toFixed(2)}** · <t:${Math.floor(new Date(r.created_at).getTime() / 1000)}:R>`;
      });
      await interaction.editReply({
        content: ["📜 **Recent PvP**", "", ...lines].join("\n"),
      });
    } catch (e) {
      console.error("dojo-history failed:", e);
      await interaction.editReply({ content: "Could not load battle history." });
    }
  },
};

export default command;
