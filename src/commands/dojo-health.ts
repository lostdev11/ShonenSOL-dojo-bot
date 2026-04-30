import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import type { DojoCommand } from "../types";

const REQUIRED_PERMS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.UseApplicationCommands,
] as const;

function permLabel(perm: bigint): string {
  const map = new Map<bigint, string>([
    [PermissionFlagsBits.ViewChannel, "View Channel"],
    [PermissionFlagsBits.SendMessages, "Send Messages"],
    [PermissionFlagsBits.ReadMessageHistory, "Read Message History"],
    [PermissionFlagsBits.UseApplicationCommands, "Use Application Commands"],
    [PermissionFlagsBits.SendMessagesInThreads, "Send Messages In Threads"],
  ]);
  return map.get(perm) ?? String(perm);
}

const command: DojoCommand = {
  data: new SlashCommandBuilder()
    .setName("dojo-health")
    .setDescription("Check bot channel permissions for dojo battles."),

  async execute(interaction) {
    try {
      await interaction.deferReply({ flags: 64 });
      const channel = interaction.channel;
      if (!channel || !("permissionsFor" in channel)) {
        await interaction.editReply({
          content: "Could not inspect permissions in this channel.",
        });
        return;
      }

      const me = interaction.guild?.members.me;
      if (!me) {
        await interaction.editReply({
          content: "Bot member context not found. Try again in a server channel.",
        });
        return;
      }

      const perms = channel.permissionsFor(me);
      const missing = REQUIRED_PERMS.filter((p) => !perms.has(p));
      const threadNote =
        channel.type === ChannelType.PublicThread ||
        channel.type === ChannelType.PrivateThread
          ? perms.has(PermissionFlagsBits.SendMessagesInThreads)
            ? ""
            : `\n⚠️ Missing: **${permLabel(PermissionFlagsBits.SendMessagesInThreads)}**`
          : "";

      if (missing.length === 0) {
        await interaction.editReply({
          content: [
            "✅ **Dojo health check passed**",
            "",
            "Required channel permissions are present for battle lobby updates.",
            threadNote,
          ]
            .filter(Boolean)
            .join("\n"),
        });
        return;
      }

      await interaction.editReply({
        content: [
          "❌ **Dojo health check failed**",
          "",
          "Missing permissions in this channel:",
          ...missing.map((p) => `• ${permLabel(p)}`),
          threadNote,
          "",
          "Ask a server admin to allow these for the bot role (or channel overrides).",
        ]
          .filter(Boolean)
          .join("\n"),
      });
    } catch (error) {
      console.error("dojo-health failed:", error);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: "Could not run dojo health check." });
        return;
      }
      await interaction.reply({ content: "Could not run dojo health check.", flags: 64 });
    }
  },
};

export default command;
