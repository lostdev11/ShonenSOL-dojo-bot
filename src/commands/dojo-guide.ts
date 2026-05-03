import { SlashCommandBuilder } from "discord.js";
import type { DojoCommand } from "../types";

const GUIDE_LINES = [
  "📖 **How ShonenSOL Dojo works**",
  "",
  "**1 · Register & grow**",
  "• `/dojo-register` creates your fighter (one time).",
  "• `/dojo-stats` — your stats, record, CP, titles.",
  "• `/dojo-train` — stat rolls + a chance to unlock a new move.",
  "• **Chakra Points** = currency (`/dojo-daily`, PvP wins, etc.). `/dojo-shop` buys moves.",
  "",
  "**2 · Moves & matchups**",
  "• Fights use your **unlocked** moves — stronger moves add more to your score.",
  "• **Archetype wheel:** offense → burst → control → mobility → defense → offense (each **beats** the next).",
  "• `/dojo-moves` lists your kit.",
  "",
  "**3 · Battles**",
  "• `/dojo-battle` — **Brackets** = parallel **1v1**s (not linked). **Tournament** = single elimination — **winners advance** round by round to one champion. **FFA** = **everyone vs everyone** in one clash (move menus capped at **5**; use **FFA · quick** for bigger groups). **PvP** saves wins/losses and CP.",
  "• **Fight CPU** (on the lobby) — test fight; **no** PvP records.",
  "• `/dojo-spar` — private CPU drill; **only you** see it.",
  "• After ranked fights: **Run it back** / **Best of 3** when those buttons appear.",
  "",
  "**4 · Meta**",
  "• Seasons can buff stats (`/dojo-season`). `/dojo-history` · `/dojo-leaderboard` · `/dojo-cosmetics`.",
  "",
  "_Mods: `/dojo-events` is a fight-night checklist._",
];

const command: DojoCommand = {
  data: new SlashCommandBuilder()
    .setName("dojo-guide")
    .setDescription("How fights, moves, stats, and commands fit together."),

  async execute(interaction) {
    await interaction.reply({
      content: GUIDE_LINES.join("\n"),
      ephemeral: true,
    });
  },
};

export default command;
