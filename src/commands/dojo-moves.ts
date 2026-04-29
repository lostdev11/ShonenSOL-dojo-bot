import { SlashCommandBuilder } from "discord.js";
import { previewMoveMatchup } from "../lib/battleEngine";
import { ARCHETYPE_PLAYSTYLE, MOVE_CATALOG, getMoveById } from "../lib/moves";
import type { DojoCommand } from "../types";

const command: DojoCommand = {
  data: new SlashCommandBuilder()
    .setName("dojo-moves")
    .setDescription("Archetype wheel + optional matchup preview between two moves.")
    .addStringOption((o) =>
      o
        .setName("move_a")
        .setDescription("Move id (e.g. spirit_palm)")
        .setRequired(false),
    )
    .addStringOption((o) =>
      o
        .setName("move_b")
        .setDescription("Second move id for a preview")
        .setRequired(false),
    ),

  async execute(interaction) {
    try {
      const a = interaction.options.getString("move_a");
      const b = interaction.options.getString("move_b");

      if (!a && b) {
        await interaction.reply({
          content:
            "Use **move_a** alone for a move card, or **both** move_a and move_b for a matchup preview.",
          ephemeral: true,
        });
        return;
      }

      if (!a && !b) {
        await interaction.reply({
          content: [
            "🧭 **Archetype wheel** (counter-clockwise beats the next):",
            "**Rushdown** → **Spike** → **Tempo** → **Footwork** → **Fortress** → **Rushdown**",
            "",
            "_Affinity sync still depends on your stats — this is only the rock-paper layer._",
            "",
            "Try `/dojo-moves move_a:spirit_palm move_b:guard` for a head-to-head read.",
          ].join("\n"),
          ephemeral: true,
        });
        return;
      }

      const ma = getMoveById(a ?? undefined);
      const mb = getMoveById(b ?? undefined);

      if (a && !MOVE_CATALOG[a]) {
        await interaction.reply({
          content: `Unknown **move_a** \`${a}\`. Use a slug from training or \`/dojo-shop\`.`,
          ephemeral: true,
        });
        return;
      }
      if (b && !MOVE_CATALOG[b]) {
        await interaction.reply({
          content: `Unknown **move_b** \`${b}\`.`,
          ephemeral: true,
        });
        return;
      }

      if (a && !b) {
        await interaction.reply({
          content: [
            `**${ma.name}** (\`${ma.id}\`)`,
            `· Playstyle: **${ARCHETYPE_PLAYSTYLE[ma.archetype]}**`,
            `· Edge: **+${ma.finalScoreFlatBonus.toFixed(1)}** (PvP cap applies in real fights)`,
            `· ${ma.short}`,
          ].join("\n"),
          ephemeral: true,
        });
        return;
      }

      if (a && b) {
        const prev = previewMoveMatchup(ma, mb);
        await interaction.reply({
          content: [
            `**${ma.name}** vs **${mb.name}**`,
            `_${ARCHETYPE_PLAYSTYLE[ma.archetype]} vs ${ARCHETYPE_PLAYSTYLE[mb.archetype]}_`,
            "",
            prev.line,
          ].join("\n"),
          ephemeral: true,
        });
      }
    } catch (e) {
      console.error("dojo-moves failed:", e);
      await interaction.reply({
        content: "Could not build matchup text.",
        ephemeral: true,
      });
    }
  },
};

export default command;
