import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
} from "discord.js";
import type { StringSelectMenuInteraction } from "discord.js";
import {
  TITLE_CATALOG,
  formatEquippedTitleLine,
  getEquippedTitleId,
  getShopPurchasableTitles,
  normalizeUnlockedTitles,
} from "../lib/cosmetics";
import {
  equipOwnedTitle,
  getFighterByDiscordId,
  purchaseTitleWithChakra,
} from "../lib/supabase";

export const DOJO_COSMETIC_BUY = "dojo_cos_buy";
export const DOJO_COSMETIC_EQUIP = "dojo_cos_equip";

const MAX_OPTS = 25;

export function isCosmeticsSelect(customId: string): boolean {
  return customId === DOJO_COSMETIC_BUY || customId === DOJO_COSMETIC_EQUIP;
}

export function buildCosmeticsLines(fighter: {
  unlocked_titles?: string[] | null;
  chakra_points?: number | null;
  equipped_title?: string | null;
}) {
  const eq = getEquippedTitleId(fighter);
  const eqDef = TITLE_CATALOG[eq] ?? TITLE_CATALOG.title_student!;
  const purch = getShopPurchasableTitles(fighter);
  const owned = normalizeUnlockedTitles(fighter);
  return [
    "🎭 **Dojo cosmetics** — titles are **CP-only** flair (no battle stats).",
    "",
    `**Equipped:** ${eqDef.label} — _${eqDef.short}_`,
    `**Owned:** ${owned.length} title(s)`,
    purch.length === 0 ? "🎉 You own every purchasable title." : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildCosmeticsComponents(fighter: {
  unlocked_titles?: string[] | null;
  chakra_points?: number | null;
}) {
  const rows: ActionRowBuilder<StringSelectMenuBuilder>[] = [];
  const buyList = getShopPurchasableTitles(fighter).slice(0, MAX_OPTS);
  if (buyList.length > 0) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(DOJO_COSMETIC_BUY)
      .setMinValues(1)
      .setMaxValues(1)
      .setPlaceholder("Buy a title")
      .addOptions(
        buyList.map((t) => ({
          label: `${t.label} — ${t.shopPrice} CP`.slice(0, 100),
          value: t.id,
          description: t.short.slice(0, 100),
        })),
      );
    rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu));
  }

  const owned = normalizeUnlockedTitles(fighter)
    .map((id) => TITLE_CATALOG[id])
    .filter((t): t is NonNullable<typeof t> => t !== undefined)
    .slice(0, MAX_OPTS);
  if (owned.length > 0) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(DOJO_COSMETIC_EQUIP)
      .setMinValues(1)
      .setMaxValues(1)
      .setPlaceholder("Equip a title")
      .addOptions(
        owned.map((t) => ({
          label: t.label.slice(0, 100),
          value: t.id,
          description: t.short.slice(0, 100),
        })),
      );
    rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu));
  }

  return rows;
}

export async function handleCosmeticsSelect(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  const titleId = interaction.values[0];
  if (!titleId) {
    return;
  }

  const uid = interaction.user.id;
  const fighter = await getFighterByDiscordId(uid);
  if (!fighter) {
    await interaction.update({
      content: "You are not registered. Use `/dojo-register` first.",
      components: [],
    });
    return;
  }

  if (interaction.customId === DOJO_COSMETIC_BUY) {
    const result = await purchaseTitleWithChakra(uid, titleId);
    if (result.ok) {
      const t = TITLE_CATALOG[titleId];
      const after = result.fighter;
      await interaction.update({
        content: [
          `✅ Purchased **${t?.label ?? titleId}** — equipped automatically.`,
          "",
          buildCosmeticsLines(after),
          "",
          formatEquippedTitleLine(after),
        ].join("\n"),
        components: buildCosmeticsComponents(after),
      });
      return;
    }
    const err = result.error;
    const msgs: Record<typeof err, string> = {
      unknown_title: "Unknown title.",
      not_in_shop: "That title is not for sale.",
      already_owned: "You already own this title.",
      insufficient: "Not enough CP.",
      missing_columns: "Add `unlocked_titles` / `equipped_title` — see README.",
      no_fighter: "No fighter row.",
    };
    await interaction.update({
      content: [`⚠️ ${msgs[err]}`, "", buildCosmeticsLines(fighter)].join("\n"),
      components: buildCosmeticsComponents(fighter),
    });
    return;
  }

  if (interaction.customId === DOJO_COSMETIC_EQUIP) {
    const result = await equipOwnedTitle(uid, titleId);
    if (result.ok) {
      const after = result.fighter;
      await interaction.update({
        content: [
          `✅ Equipped **${TITLE_CATALOG[titleId]?.label ?? titleId}**.`,
          "",
          buildCosmeticsLines(after),
          "",
          formatEquippedTitleLine(after),
        ].join("\n"),
        components: buildCosmeticsComponents(after),
      });
      return;
    }
    if (result.error === "not_owned") {
      await interaction.update({
        content: "You don’t own that title.",
        components: buildCosmeticsComponents(fighter),
      });
      return;
    }
    if (result.error === "missing_column") {
      await interaction.update({
        content: "Database missing `equipped_title` — see README.",
        components: [],
      });
      return;
    }
    await interaction.update({
      content: "Could not equip title.",
      components: buildCosmeticsComponents(fighter),
    });
  }
}
