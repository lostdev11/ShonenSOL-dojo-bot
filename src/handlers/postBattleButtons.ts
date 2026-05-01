import type { ButtonInteraction, TextChannel } from "discord.js";
import { createBo3Session } from "../lib/bo3Session";
import {
  BO3_BUTTON_PREFIX,
  REMATCH_BUTTON_PREFIX,
  parsePostBattleButton,
} from "../lib/postBattleButtons";
import { buildLobbyText, createRematchLobby } from "../lib/lobbyState";
import { lobbyButtonRows } from "./lobbyButtons";
import { startMoveSelectionPhase } from "./moveSelectHandler";
import { getFighterByDiscordId } from "../lib/supabase";

export function isPostBattleButton(customId: string): boolean {
  return (
    customId.startsWith(REMATCH_BUTTON_PREFIX) ||
    customId.startsWith(BO3_BUTTON_PREFIX)
  );
}

export async function handlePostBattleButton(
  interaction: ButtonInteraction,
): Promise<void> {
  const parsed = parsePostBattleButton(interaction.customId);
  if (!parsed) {
    return;
  }
  const { hostId, oppId } = parsed;
  const uid = interaction.user.id;
  if (uid !== hostId && uid !== oppId) {
    await interaction.reply({
      content: "Only the two fighters from this match can use these buttons.",
      flags: 64,
    });
    return;
  }

  const channel = interaction.channel;
  if (!channel || !("send" in channel)) {
    await interaction.reply({
      content: "Can't post follow-ups in this channel.",
      flags: 64,
    });
    return;
  }

  const hostUser = await interaction.client.users.fetch(hostId).catch(() => null);
  const oppUser = await interaction.client.users.fetch(oppId).catch(() => null);
  if (!hostUser || !oppUser) {
    await interaction.reply({
      content: "Could not load both fighters. Try `/dojo-battle` instead.",
      flags: 64,
    });
    return;
  }

  if (parsed.kind === "rematch") {
    await interaction.deferReply({ flags: 64 });
    const { lobbyId } = createRematchLobby(hostId, {
      id: oppId,
      username: oppUser.username,
    });
    await (channel as TextChannel).send({
      content: [
        "🔁 **Run it back** — same pairing, fresh lobby.",
        buildLobbyText(hostId, [{ id: oppId, username: oppUser.username }], "bracket"),
      ].join("\n\n"),
      components: lobbyButtonRows(lobbyId, true, "bracket"),
    });
    await interaction.editReply({
      content: "Posted a **Run it back** lobby below.",
    });
    return;
  }

  // Best of 3
  await interaction.deferReply({ flags: 64 });
  const hostFighter = await getFighterByDiscordId(hostId);
  const oppFighter = await getFighterByDiscordId(oppId);
  if (!hostFighter || !oppFighter) {
    await interaction.editReply({
      content: "Both fighters must be registered (`/dojo-register`).",
    });
    return;
  }

  const sessionId = createBo3Session(hostId, oppId);
  const intro = await (channel as TextChannel).send({
    content: [
      "⚔️ **Best of 3** — first to **2** wins · **Round 1**",
      `${hostUser} vs ${oppUser}`,
      "",
      "_Picks are simultaneous — locks when both fighters choose._",
    ].join("\n"),
  });

  try {
    await startMoveSelectionPhase(
      intro,
      hostUser,
      { id: oppId, username: oppUser.username },
      hostFighter,
      oppFighter,
      undefined,
      { bo3SessionId: sessionId },
    );
    await interaction.editReply({
      content: "Best of **3** started — picks are live on the message below.",
    });
  } catch (e) {
    console.error("Best of 3 start failed:", e);
    await interaction.editReply({
      content: "Could not start the series (permissions or network).",
    });
  }
}
