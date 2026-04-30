import type { Fighter } from "../types";
import { rollTraining, allStatsAtCap, STAT_CAP, STAT_KEYS } from "./training";

function randomAround(base: number, spread: number, min = 40, max = 100): number {
  const swing = Math.floor(Math.random() * (spread * 2 + 1)) - spread;
  return Math.max(min, Math.min(max, base + swing));
}

/** ~one `/dojo-train` session per calendar day lived, capped — CPU keeps pace without DB rows. */
const MAX_SYNTH_CPU_TRAIN_SESSIONS = 21;

function applySynthTrainSessions(cpu: Fighter, hostCreatedAtIso: string): Fighter {
  const created = new Date(hostCreatedAtIso).getTime();
  if (Number.isNaN(created)) {
    return cpu;
  }
  const daysAlive = Math.max(0, Math.floor((Date.now() - created) / 86_400_000));
  const sessions = Math.min(daysAlive, MAX_SYNTH_CPU_TRAIN_SESSIONS);

  let f: Fighter = { ...cpu };
  for (let i = 0; i < sessions; i++) {
    if (allStatsAtCap(f)) {
      break;
    }
    const gains = rollTraining(f);
    for (const key of STAT_KEYS) {
      const d = gains[key];
      if (d) {
        f = { ...f, [key]: Math.min(STAT_CAP, f[key] + d) };
      }
    }
  }
  return f;
}

/** Synthetic opponent for CPU / test battles (not a real Discord user). */
export function buildCpuFighter(host: Fighter): Fighter {
  const now = new Date().toISOString();
  const jittered: Fighter = {
    ...host,
    id: -1,
    discord_user_id: "cpu_training_dummy",
    username: "Dojo CPU",
    strength: randomAround(host.strength, 8),
    speed: randomAround(host.speed, 8),
    defense: randomAround(host.defense, 8),
    spirit: randomAround(host.spirit, 8),
    chakra: randomAround(host.chakra, 8),
    luck: randomAround(host.luck, 8),
    wins: 0,
    losses: 0,
    created_at: now,
    updated_at: now,
  };
  return applySynthTrainSessions(jittered, host.created_at);
}
