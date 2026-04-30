import "dotenv/config";
import { REST, Routes } from "discord.js";
import { commands } from "./commands";

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildIdRaw = process.env.DISCORD_GUILD_ID?.trim();
const deployGlobal =
  process.env.DISCORD_DEPLOY_GLOBAL === "true" ||
  process.env.DISCORD_DEPLOY_GLOBAL === "1";

if (!token || !clientId) {
  throw new Error(
    "Missing Discord variables. Set DISCORD_TOKEN and DISCORD_CLIENT_ID in .env.",
  );
}

const rest = new REST({ version: "10" }).setToken(token);
const safeClientId = clientId;
const commandData = commands.map((command) => command.data.toJSON());

async function deployCommands() {
  if (!deployGlobal && guildIdRaw) {
    const guildIds = guildIdRaw
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    for (const gid of guildIds) {
      await rest.put(Routes.applicationGuildCommands(safeClientId, gid), {
        body: commandData,
      });
      console.log(`Deployed commands to guild ${gid}.`);
    }
    return;
  }

  await rest.put(Routes.applicationCommands(safeClientId), {
    body: commandData,
  });
  console.log("Deployed global application commands.");
}

deployCommands().catch((error) => {
  console.error("Failed to deploy commands:", error);
  process.exit(1);
});
