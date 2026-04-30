import "dotenv/config";
import { Client, Events, GatewayIntentBits } from "discord.js";
import { commands } from "./commands";
import {
  handlePostBattleButton,
  isPostBattleButton,
} from "./handlers/postBattleButtons";
import { handleLobbyButton, isDojoLobbyButton } from "./handlers/lobbyButtons";
import {
  handleCosmeticsSelect,
  isCosmeticsSelect,
} from "./handlers/cosmeticsSelectHandler";
import {
  handleDojoShopSelect,
  isDojoShopSelect,
} from "./handlers/shopHandler";
import {
  handleMoveStringSelect,
  isMoveSelectMenu,
} from "./handlers/moveSelectHandler";

const token = process.env.DISCORD_TOKEN;
const dojoCommandChannelIds = new Set(
  (process.env.DOJO_COMMAND_CHANNEL_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);

if (!token) {
  throw new Error("Missing DISCORD_TOKEN in .env");
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`ShonenSOL Dojo Bot ready as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isButton() && isPostBattleButton(interaction.customId)) {
    try {
      await handlePostBattleButton(interaction);
    } catch (err) {
      console.error("post-battle button failed:", err);
    }
    return;
  }

  if (interaction.isButton() && isDojoLobbyButton(interaction.customId)) {
    try {
      await handleLobbyButton(interaction);
    } catch (err) {
      console.error("lobby button failed:", err);
    }
    return;
  }

  if (interaction.isStringSelectMenu() && isCosmeticsSelect(interaction.customId)) {
    try {
      await handleCosmeticsSelect(interaction);
    } catch (err) {
      console.error("cosmetics select failed:", err);
    }
    return;
  }

  if (interaction.isStringSelectMenu() && isDojoShopSelect(interaction.customId)) {
    try {
      await handleDojoShopSelect(interaction);
    } catch (err) {
      console.error("shop select failed:", err);
    }
    return;
  }

  if (interaction.isStringSelectMenu() && isMoveSelectMenu(interaction.customId)) {
    try {
      await handleMoveStringSelect(interaction);
    } catch (err) {
      console.error("move select failed:", err);
    }
    return;
  }

  if (!interaction.isChatInputCommand()) {
    return;
  }

  if (
    dojoCommandChannelIds.size > 0 &&
    !dojoCommandChannelIds.has(interaction.channelId)
  ) {
    await interaction
      .reply({
        content:
          "Dojo commands are limited to bot-command channels right now. Use them in an allowed channel.",
        flags: 64,
      })
      .catch(() => {});
    return;
  }

  const command = commands.find(
    (entry) => entry.data.name === interaction.commandName,
  );

  if (!command) {
    return;
  }

  await command.execute(interaction);
});

client.login(token).catch((error) => {
  console.error("Login failed:", error);
  process.exit(1);
});
