import type { Fighter } from "../types";

function getBattleRoll(): number {
  return Math.floor(Math.random() * 30) + 1;
}

export function calculateBattleScore(fighter: Fighter): number {
  const weightedScore =
    fighter.strength * 0.22 +
    fighter.speed * 0.16 +
    fighter.defense * 0.16 +
    fighter.spirit * 0.18 +
    fighter.chakra * 0.18 +
    fighter.luck * 0.1;

  return weightedScore + getBattleRoll();
}

export function createBattleSummary(
  challenger: Fighter,
  opponent: Fighter,
  winner: Fighter,
): string {
  const scenes = [
    `${challenger.username} launches a blazing combo while ${opponent.username} counters with pure willpower!`,
    `${opponent.username} unleashes a hidden technique, but ${challenger.username} refuses to back down!`,
    `A shockwave erupts as both fighters clash in the center of the dojo!`,
    `The crowd roars as energy surges around both warriors!`,
  ];

  const finalScene =
    scenes[Math.floor(Math.random() * scenes.length)] +
    `\n\n**${winner.username} stands victorious!**`;

  return finalScene;
}
