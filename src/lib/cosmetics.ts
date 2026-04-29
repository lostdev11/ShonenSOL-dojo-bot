// Cosmetic titles — CP-only, no battle stat effects.

export type TitleDefinition = {
  id: string;
  label: string;
  short: string;
  shopPrice: number;
};

export const STARTER_TITLE_IDS: readonly string[] = ["title_student"];

export const TITLE_CATALOG: Record<string, TitleDefinition> = {
  title_student: {
    id: "title_student",
    label: "Student",
    short: "Everyone starts somewhere.",
    shopPrice: 0,
  },
  title_hot_streak: {
    id: "title_hot_streak",
    label: "Hot Streak",
    short: "Ride the momentum.",
    shopPrice: 35,
  },
  title_spirit_bound: {
    id: "title_spirit_bound",
    label: "Spirit Bound",
    short: "Technique follows conviction.",
    shopPrice: 55,
  },
  title_dojo_icon: {
    id: "title_dojo_icon",
    label: "Dojo Icon",
    short: "Main character energy (costume only).",
    shopPrice: 90,
  },
  title_shadow_peer: {
    id: "title_shadow_peer",
    label: "Shadow Peer",
    short: "Quiet menace, loud results.",
    shopPrice: 130,
  },
};

export function normalizeUnlockedTitles(fighter: {
  unlocked_titles?: string[] | null;
}): string[] {
  const raw = fighter.unlocked_titles;
  if (Array.isArray(raw) && raw.length > 0) {
    const filtered = raw.filter((id) => id in TITLE_CATALOG);
    if (filtered.length > 0) {
      return filtered;
    }
  }
  return [...STARTER_TITLE_IDS];
}

export function getEquippedTitleId(fighter: {
  equipped_title?: string | null;
  unlocked_titles?: string[] | null;
}): string {
  const unlocked = new Set(normalizeUnlockedTitles(fighter));
  const eq = fighter.equipped_title;
  if (eq && unlocked.has(eq)) {
    return eq;
  }
  return "title_student";
}

export function formatEquippedTitleLine(fighter: {
  equipped_title?: string | null;
  unlocked_titles?: string[] | null;
  username: string;
}): string {
  const id = getEquippedTitleId(fighter);
  const def = TITLE_CATALOG[id] ?? TITLE_CATALOG.title_student!;
  return `「${def.label}」 ${fighter.username}`;
}

/** Purchasable titles (not owned), cheapest first. */
export function getShopPurchasableTitles(fighter: {
  unlocked_titles?: string[] | null;
}): TitleDefinition[] {
  const owned = new Set(normalizeUnlockedTitles(fighter));
  return Object.values(TITLE_CATALOG)
    .filter((t) => t.shopPrice > 0 && !owned.has(t.id))
    .sort((a, b) => a.shopPrice - b.shopPrice);
}
