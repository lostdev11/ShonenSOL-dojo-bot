import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
} from "discord.js";
import type { StringSelectMenuInteraction } from "discord.js";
import {
  formatMoveTier,
  getMoveById,
  getShopPurchasableMoves,
} from "../lib/moves";
import {
  getFighterByDiscordId,
  purchaseMoveWithChakra,
} from "../lib/supabase";

export const DOJO_SHOP_SELECT_ID = "dojo_shop_pick";

/** Discord allows at most 25 options per String Select. */
const MAX_SHOP_SELECT_OPTIONS = 25;

export function isDojoShopSelect(customId: string): boolean {
  return customId === DOJO_SHOP_SELECT_ID;
}

function balanceLine(points: number | null | undefined): string {
  return `**Chakra Points:** \`${points ?? 0}\`  _(earn from battles and training)_`;
}

export function buildShopMessageContent(fighter: {
  unlocked_moves?: string[] | null;
  chakra_points?: number | null;
}): string {
  const purchasable = getShopPurchasableMoves(fighter);
  return [
    "🛒 **Dojo move shop**",
    "Spend **Chakra Points (CP)** on moves. Low-tier options are cheap; **high-tier moves** add a **bigger edge** in PvP and can turn a close fight (still bounded so stats matter).",
    "You can also **unlock** some moves from training; the shop always lists anything you can still buy.",
    "",
    balanceLine(fighter.chakra_points),
    "",
    purchasable.length === 0
      ? "🎉 You own **every** move in the shop."
      : purchasable.length > MAX_SHOP_SELECT_OPTIONS
        ? `**Pick a move below** (showing cheapest **${MAX_SHOP_SELECT_OPTIONS}** of ${purchasable.length}; run again after buying).`
        : "**Pick a move below** to buy (you can return here anytime with `/dojo-shop`).",
  ].join("\n");
}

function shopSelectRow(fighter: {
  unlocked_moves?: string[] | null;
  chakra_points?: number | null;
  username: string;
}) {
  const list = getShopPurchasableMoves(fighter).slice(0, MAX_SHOP_SELECT_OPTIONS);
  if (list.length === 0) {
    return [];
  }
  const menu = new StringSelectMenuBuilder()
    .setCustomId(DOJO_SHOP_SELECT_ID)
    .setMinValues(1)
    .setMaxValues(1)
    .setPlaceholder("Select a move to purchase")
    .addOptions(
      list.map((m) => {
        const p = m.shopPrice ?? 0;
        const can = (fighter.chakra_points ?? 0) >= p;
        return {
          label: `${m.name} — ${p} CP`.slice(0, 100),
          value: m.id,
          description: `${formatMoveTier(m)} · +${m.finalScoreFlatBonus.toFixed(1)} · ${can ? "Buy" : "not enough CP"}`
            .slice(0, 100),
        };
      }),
    );
  return [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)];
}

export function buildShopComponents(fighter: {
  unlocked_moves?: string[] | null;
  chakra_points?: number | null;
  username: string;
}) {
  return shopSelectRow(fighter);
}

export async function handleDojoShopSelect(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  const moveSlug = interaction.values[0];
  if (!moveSlug) {
    return;
  }

  const userId = interaction.user.id;
  const fighter = await getFighterByDiscordId(userId);
  if (!fighter) {
    await interaction.update({
      content: "You are not registered. Use `/dojo-register` first.",
      components: [],
    });
    return;
  }

  const result = await purchaseMoveWithChakra(userId, moveSlug);

  if (result.ok) {
    const mv = getMoveById(moveSlug);
    const after = result.fighter;
    const price = mv.shopPrice ?? 0;
    const lines = [
      `✅ **Purchased** *${mv.name}* for **${price}** CP. — _${mv.short}_`,
      `**Battle edge:** +${mv.finalScoreFlatBonus.toFixed(1)} to your PvP roll (capped in battle so one move can’t run the whole fight).`,
      "",
      buildShopMessageContent(after),
    ];
    await interaction.update({
      content: lines.join("\n"),
      components: buildShopComponents(after),
    });
    return;
  }

  const err = result.error;
  if (err === "missing_chakra_column" || err === "unlocked_column") {
    await interaction.update({
      content: [
        "The shop could not save your purchase. Add the `chakra_points` column (and `unlocked_moves` for moves) — see **README** SQL.",
        "",
        buildShopMessageContent(fighter),
      ].join("\n"),
      components: buildShopComponents(fighter),
    });
    return;
  }

  const messages = {
    no_fighter: "Fighter not found — try `/dojo-register`.",
    not_in_shop: "That move is not for sale (select from the list).",
    already_owned: "You already have this move.",
    insufficient: `Not enough Chakra Points. This move costs **${getMoveById(moveSlug).shopPrice ?? "?"}** CP; you have **${fighter.chakra_points ?? 0}**.`,
    missing_chakra_column: "Database missing `chakra_points` (see README).",
    unlocked_column: "Database missing `unlocked_moves` (see README).",
  } as const;

  await interaction.update({
    content: [
      `⚠️ ${messages[err]}`,
      "",
      buildShopMessageContent(fighter),
    ].join("\n"),
    components: buildShopComponents(fighter),
  });
}
