import type { Fighter } from "../types";

function randomAround(base: number, spread: number, min = 40, max = 100): number {
  const swing = Math.floor(Math.random() * (spread * 2 + 1)) - spread;
  return Math.max(min, Math.min(max, base + swing));
}

/** Synthetic opponent for CPU / test battles (not a real Discord user). */
export function buildCpuFighter(host: Fighter): Fighter {
  const now = new Date().toISOString();
  return {
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
}
