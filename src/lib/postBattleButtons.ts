import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

export const REMATCH_BUTTON_PREFIX = "dojorm:";
export const BO3_BUTTON_PREFIX = "dojobo3:";

export function buildPostBattleRows(hostId: string, oppId: string) {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${REMATCH_BUTTON_PREFIX}${hostId}:${oppId}`)
        .setLabel("Run it back")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`${BO3_BUTTON_PREFIX}${hostId}:${oppId}`)
        .setLabel("Best of 3")
        .setStyle(ButtonStyle.Success),
    ),
  ];
}

export function parsePostBattleButton(customId: string): {
  kind: "rematch" | "bo3";
  hostId: string;
  oppId: string;
} | null {
  const rm = customId.match(/^dojorm:(\d+):(\d+)$/);
  if (rm && rm[1] && rm[2]) {
    return { kind: "rematch", hostId: rm[1], oppId: rm[2] };
  }
  const b3 = customId.match(/^dojobo3:(\d+):(\d+)$/);
  if (b3 && b3[1] && b3[2]) {
    return { kind: "bo3", hostId: b3[1], oppId: b3[2] };
  }
  return null;
}
