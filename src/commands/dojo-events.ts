import { SlashCommandBuilder } from "discord.js";
import type { DojoCommand } from "../types";

const command: DojoCommand = {
  data: new SlashCommandBuilder()
    .setName("dojo-events")
    .setDescription("Fight-night checklist mods can paste into a pinned message."),

  async execute(interaction) {
    await interaction.reply({
      content: [
        "🗓️ **Community fight night — quick checklist**",
        "",
        "1. Create a **temporary voice stage** or thread named “Dojo Fight Night”.",
        "2. Ping `@Dojo Fighters` (or your role) **15 minutes** before start.",
        "3. Host drops **`/dojo-battle`** (brackets, **tournament**, or free-for-all) — fighters **Join**, host runs the matching start buttons (**Brackets** / **Tournament** / **FFA**).",
        "4. Between sets, use **Run it back** or **Best of 3** buttons under results.",
        "5. Snapshot funny battles or clutch finishes for highlights.",
        "",
        "_Tip: schedule the same weekday so momentum builds._",
      ].join("\n"),
      ephemeral: true,
    });
  },
};

export default command;
