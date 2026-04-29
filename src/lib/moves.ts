// Move catalog: unlock via training and/or Chakra Points shop; each move adds a flat edge in battle.

import { calculatePowerLevel } from "./stats";
import type { Fighter } from "../types";

export type MoveTier = 0 | 1 | 2 | 3 | 4;

export type MoveArchetype =
  | "offense"
  | "defense"
  | "mobility"
  | "control"
  | "burst";

/** Player-facing playstyle labels for move archetypes (strategy wheel). */
export const ARCHETYPE_PLAYSTYLE: Record<MoveArchetype, string> = {
  offense: "Rushdown",
  defense: "Fortress",
  mobility: "Footwork",
  control: "Tempo",
  burst: "Spike",
};

export type MoveDefinition = {
  id: string;
  name: string;
  short: string;
  /** Added to final score after the weighted stat + RNG step (before underdog awakening). */
  finalScoreFlatBonus: number;
  /** Strategy archetype used for move-vs-move counter logic. */
  archetype: MoveArchetype;
  /** Primary stat that empowers this move's strategic efficiency. */
  affinityStat: "strength" | "speed" | "defense" | "spirit" | "chakra" | "luck";
  /** If true, can appear from a successful training roll (in addition to the shop). */
  trainUnlock: boolean;
  /** 0 = starter; higher = shop / training tier. */
  tier: MoveTier;
  /** Cost in Chakra Points; `null` = not sold in `/dojo-shop` (starters). */
  shopPrice: number | null;
};

export const STARTER_MOVE_IDS: readonly string[] = [
  "basic_strike",
  "guard",
  "quick_step",
];

export const MOVE_CATALOG: Record<string, MoveDefinition> = {
  basic_strike: {
    id: "basic_strike",
    name: "Basic Strike",
    short: "Reliable hit.",
    finalScoreFlatBonus: 0.65,
    archetype: "offense",
    affinityStat: "strength",
    trainUnlock: false,
    tier: 0,
    shopPrice: null,
  },
  guard: {
    id: "guard",
    name: "Guard",
    short: "Brace and reduce pressure.",
    finalScoreFlatBonus: 1.15,
    archetype: "defense",
    affinityStat: "defense",
    trainUnlock: false,
    tier: 0,
    shopPrice: null,
  },
  quick_step: {
    id: "quick_step",
    name: "Quick Step",
    short: "Faster rhythm.",
    finalScoreFlatBonus: 1.05,
    archetype: "mobility",
    affinityStat: "speed",
    trainUnlock: false,
    tier: 0,
    shopPrice: null,
  },
  // Shop-only low tier (not in training pool)
  gale_sweep: {
    id: "gale_sweep",
    name: "Gale Sweep",
    short: "Low line; steady pressure.",
    finalScoreFlatBonus: 1.05,
    archetype: "control",
    affinityStat: "speed",
    trainUnlock: false,
    tier: 1,
    shopPrice: 40,
  },
  iron_parry: {
    id: "iron_parry",
    name: "Iron Parry",
    short: "Timed metal guard.",
    finalScoreFlatBonus: 1.25,
    archetype: "defense",
    affinityStat: "defense",
    trainUnlock: false,
    tier: 1,
    shopPrice: 55,
  },
  // Train pool + shop
  spirit_palm: {
    id: "spirit_palm",
    name: "Spirit Palm",
    short: "Chakra burst forward.",
    finalScoreFlatBonus: 2.05,
    archetype: "burst",
    affinityStat: "spirit",
    trainUnlock: true,
    tier: 2,
    shopPrice: 95,
  },
  raikiri_feint: {
    id: "raikiri_feint",
    name: "Lightning Feint",
    short: "Fake high, real low.",
    finalScoreFlatBonus: 2.35,
    archetype: "mobility",
    affinityStat: "speed",
    trainUnlock: true,
    tier: 2,
    shopPrice: 130,
  },
  tempest_kick: {
    id: "tempest_kick",
    name: "Tempest Kick",
    short: "Spinning pressure.",
    finalScoreFlatBonus: 2.55,
    archetype: "offense",
    affinityStat: "strength",
    trainUnlock: true,
    tier: 3,
    shopPrice: 170,
  },
  domain_pin: {
    id: "domain_pin",
    name: "Domain Pin",
    short: "Control the center line.",
    finalScoreFlatBonus: 2.75,
    archetype: "control",
    affinityStat: "chakra",
    trainUnlock: true,
    tier: 3,
    shopPrice: 210,
  },
  dojo_ultimate: {
    id: "dojo_ultimate",
    name: "Dojo Finisher",
    short: "Rare signature move.",
    finalScoreFlatBonus: 3.05,
    archetype: "burst",
    affinityStat: "chakra",
    trainUnlock: true,
    tier: 4,
    shopPrice: 300,
  },
};

const TRAIN_UNLOCK_POOL = Object.values(MOVE_CATALOG).filter((m) => m.trainUnlock);

const MAX_SELECT_OPTIONS = 5;

function normalizeUnlocked(fighter: { unlocked_moves?: string[] | null }): string[] {
  const raw = fighter.unlocked_moves;
  if (Array.isArray(raw) && raw.length > 0) {
    const filtered = raw.filter((id) => id in MOVE_CATALOG);
    // Junk-only rows would leave no moves — fall back so shop/battle stay valid.
    if (filtered.length > 0) {
      return filtered;
    }
  }
  return [...STARTER_MOVE_IDS];
}

export function getUnlockedSlugs(fighter: {
  unlocked_moves?: string[] | null;
}): string[] {
  return normalizeUnlocked(fighter);
}

/** Moves you can still buy (not owned, has a shop price), cheapest first. */
export function getShopPurchasableMoves(fighter: {
  unlocked_moves?: string[] | null;
}): MoveDefinition[] {
  const owned = new Set(getUnlockedSlugs(fighter));
  return Object.values(MOVE_CATALOG)
    .filter((m) => m.shopPrice != null && !owned.has(m.id))
    .sort((a, b) => (a.shopPrice! - b.shopPrice!) || a.tier - b.tier);
}

export function formatMoveTier(m: MoveDefinition): string {
  if (m.tier <= 0) {
    return "Starter";
  }
  return `Tier ${m.tier}`;
}

/** Up to 5 options for a StringSelect (strongest first for clarity). */
/** Strongest unlocked move by flat bonus — Quick Battle auto-pick (same ordering as move menus). */
export function pickAutoMoveId(fighter: {
  unlocked_moves?: string[] | null;
}): string {
  const slugs = getUnlockedSlugs(fighter);
  const sorted = slugs
    .map((id) => MOVE_CATALOG[id])
    .filter((m): m is MoveDefinition => m !== undefined)
    .sort((a, b) => b.finalScoreFlatBonus - a.finalScoreFlatBonus);
  return sorted[0]?.id ?? "basic_strike";
}

export function getMoveSelectData(fighter: {
  unlocked_moves?: string[] | null;
}): { id: string; label: string; description: string; bonus: number }[] {
  const slugs = getUnlockedSlugs(fighter);
  const list = slugs
    .map((id) => MOVE_CATALOG[id])
    .filter((m): m is MoveDefinition => m !== undefined)
    .sort((a, b) => b.finalScoreFlatBonus - a.finalScoreFlatBonus)
    .slice(0, MAX_SELECT_OPTIONS);
  return list.map((m) => ({
    id: m.id,
    label: `${m.name} (+${m.finalScoreFlatBonus.toFixed(1)})`.slice(0, 100),
    description: m.short.slice(0, 100),
    bonus: m.finalScoreFlatBonus,
  }));
}

export function getMoveById(id: string | undefined): MoveDefinition {
  if (id) {
    const m = MOVE_CATALOG[id];
    if (m) {
      return m;
    }
  }
  return MOVE_CATALOG["basic_strike"]!;
}

// ~22% for a new-ish fighter; approaches ~2% floor as power level climbs (wins + high stats add power).
const UNLOCK_CHANCE_FLOOR = 0.02;
const UNLOCK_CHANCE_PEAK = 0.22;
const UNLOCK_BASELINE_POWER = 250;
const UNLOCK_DECAY_PER_POWER = 200;

/**
 * On successful training, a chance to learn a new move from the unlock pool.
 * Chance gets **lower** the stronger the fighter (power level = total stats + win/loss modifier).
 * TODO: NFTs / dojo rank could add extra unlock % or unique moves.
 */
export function tryUnlockMoveFromPool(
  currentSlugs: string[],
  fighter: Fighter,
): string | null {
  const have = new Set(currentSlugs);
  const available = TRAIN_UNLOCK_POOL.map((m) => m.id).filter((id) => !have.has(id));
  if (available.length === 0) {
    return null;
  }
  const power = calculatePowerLevel(fighter);
  const spread = power - UNLOCK_BASELINE_POWER;
  const t = Math.max(0, spread) / UNLOCK_DECAY_PER_POWER;
  const p =
    UNLOCK_CHANCE_FLOOR +
    (UNLOCK_CHANCE_PEAK - UNLOCK_CHANCE_FLOOR) * Math.exp(-t);
  if (Number.isNaN(p) || Math.random() > p) {
    return null;
  }
  return available[Math.floor(Math.random() * available.length)] ?? null;
}
