import type { Fighter } from "../types";

const MIN_STAT = 40;
const MAX_STAT = 100;

function getRandomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function generateRandomStats() {
  return {
    strength: getRandomInt(MIN_STAT, MAX_STAT),
    speed: getRandomInt(MIN_STAT, MAX_STAT),
    defense: getRandomInt(MIN_STAT, MAX_STAT),
    spirit: getRandomInt(MIN_STAT, MAX_STAT),
    chakra: getRandomInt(MIN_STAT, MAX_STAT),
    luck: getRandomInt(MIN_STAT, MAX_STAT),
  };
}

export function calculatePowerLevel(fighter: Fighter): number {
  const statTotal =
    fighter.strength +
    fighter.speed +
    fighter.defense +
    fighter.spirit +
    fighter.chakra +
    fighter.luck;

  return statTotal + fighter.wins * 15 - fighter.losses * 5;
}

export function calculateWinRate(wins: number, losses: number): number {
  const totalBattles = wins + losses;
  if (totalBattles === 0) {
    return 0;
  }

  return (wins / totalBattles) * 100;
}
