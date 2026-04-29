import type { Fighter } from "../types";

const TRAIN_COOLDOWN_MS = 24 * 60 * 60 * 1000; // once per 24 hours
const STAT_CAP = 100; // training cannot exceed registered cap; tune later in DB
const BONUS_POINTS = 3; // +3 total per session (split across stats)

const STAT_KEYS = [
  "strength",
  "speed",
  "defense",
  "spirit",
  "chakra",
  "luck",
] as const;

export function canTrain(fighter: Fighter): { ok: true } | { ok: false; msLeft: number } {
  if (!fighter.last_train_at) {
    return { ok: true };
  }
  const last = new Date(fighter.last_train_at).getTime();
  if (Number.isNaN(last)) {
    return { ok: true };
  }
  const elapsed = Date.now() - last;
  if (elapsed >= TRAIN_COOLDOWN_MS) {
    return { ok: true };
  }
  return { ok: false, msLeft: TRAIN_COOLDOWN_MS - elapsed };
}

export function formatMs(ms: number) {
  const m = Math.ceil(ms / 60000);
  if (m < 60) {
    return `${m}m`;
  }
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h ${mm}m`;
}

/**
 * Distribute BONUS_POINTS across random stats, respecting STAT_CAP.
 * TODO: NFT traits / dojo items could alter bonus points.
 */
export function rollTraining(fighter: Fighter): Partial<Record<(typeof STAT_KEYS)[number], number>> {
  const result: Partial<Record<(typeof STAT_KEYS)[number], number>> = {};
  for (let i = 0; i < BONUS_POINTS; i++) {
    // Prefer stats that are not already capped, but allow overflow logic below.
    const shuffled = [...STAT_KEYS].sort(() => Math.random() - 0.5);
    for (const key of shuffled) {
      const current = fighter[key] + (result[key] ?? 0);
      if (current < STAT_CAP) {
        result[key] = (result[key] ?? 0) + 1;
        break;
      }
    }
  }
  return result;
}

export function allStatsAtCap(fighter: Fighter) {
  return STAT_KEYS.every((k) => fighter[k] >= STAT_CAP);
}

export { STAT_CAP, TRAIN_COOLDOWN_MS, STAT_KEYS };
