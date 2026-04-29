import { calculatePowerLevel } from "./stats";
import { getMoveById, type MoveDefinition } from "./moves";
import { generateQuoteMomentum } from "./battleQuotes";
import type { DojoSeason, Fighter } from "../types";

type BattleWeights = {
  strength: number;
  speed: number;
  defense: number;
  spirit: number;
  chakra: number;
  luck: number;
  statInfluence: number;
  rngInfluence: number;
};

/** Stat weights sum to 1; luck is slightly lower here because luck duel + rolls also apply. */
const DEFAULT_WEIGHTS: BattleWeights = {
  strength: 0.23,
  speed: 0.16,
  defense: 0.16,
  spirit: 0.19,
  chakra: 0.19,
  luck: 0.07,
  statInfluence: 0.93,
  rngInfluence: 0.07,
};

const UNDERDOG_THRESHOLD_RATIO = 0.9;
const AWAKENING_TRIGGER_CHANCE = 0.2;
const AWAKENING_SCORE_BONUS = 0.1;
const POWER_LEVEL_EDGE_SCALE = 0.065;
/** Primary luck swing (per-fighter roll noise is lower via `rngInfluence`). */
const LUCK_ROLL_SCALE = 0.09;
// Strategy tuning: meaningful in close fights, but not a guaranteed override.
const STRATEGY_COUNTER_BONUS = 1.12;
const STRATEGY_AFFINITY_BONUS_CAP = 1.1;
const STRATEGY_AFFINITY_SCALE = 0.022;
const STRATEGY_AFFINITY_BASELINE = 50;
const STRATEGY_TOTAL_EDGE_CAP = 2.15;

// Soft cap: high-tier **shop** moves can swing a close match; cap prevents one button from always deciding everything.
const PVP_MOVE_BONUS_CAP = 3.5;

// Ties: same 2-decimal view as players see; merit breaks (stats, then technique), then coin.

function resolveWinnerOnTie(
  fighterA: Fighter,
  fighterB: Fighter,
  statA: number,
  statB: number,
  techniqueA: number,
  techniqueB: number,
): { winner: Fighter; tieBreakCoinFlip: boolean } {
  if (statA !== statB) {
    return { winner: statA > statB ? fighterA : fighterB, tieBreakCoinFlip: false };
  }
  if (techniqueA !== techniqueB) {
    return { winner: techniqueA > techniqueB ? fighterA : fighterB, tieBreakCoinFlip: false };
  }
  return {
    winner: Math.random() < 0.5 ? fighterA : fighterB,
    tieBreakCoinFlip: true,
  };
}

function applyPvpMoveCap(b: number) {
  return Math.min(b, PVP_MOVE_BONUS_CAP);
}

export type SimulatedBattleResult = {
  winner: Fighter;
  loser: Fighter;
  fighterA_score: number;
  fighterB_score: number;
  /** Absolute difference after rounding (same decimals as displayed scores). */
  scoreMargin: number;
  /** True when the fight was extremely close on the scoreboard (spectacle line). */
  isPhotoFinish: boolean;
  awakeningTriggered: boolean;
  /** True when final scores were equal and a random tie-break picked the winner. */
  tieBreakCoinFlip: boolean;
  /** Raw weighted stat totals before per-fighter RNG (used for tie-break merit). */
  fighterA_statScore: number;
  fighterB_statScore: number;
  rngRollA: number;
  rngRollB: number;
  rngScoreA: number;
  rngScoreB: number;
  /** Signed toward A: (PL_A - PL_B) * scale. */
  powerEdgeTowardA: number;
  /** Signed toward A: luck duel after rolls (includes luck stat tilt). */
  luckSwingTowardA: number;
  /** Combined power + luck edge toward A (same as powerEdgeTowardA + luckSwingTowardA). */
  powerLuckEdgeTowardA: number;
  quoteA: string;
  quoteB: string;
  quoteEdge: number;
  strategyEdgeA: number;
  strategyEdgeB: number;
  strategyNote: string;
  summary: string;
};

type SimulateBattleOptions = {
  season?: DojoSeason | null;
  /** Host / fighter A move id. */
  moveAId?: string;
  /** Opponent / fighter B move id. */
  moveBId?: string;
};

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getFighterPowerLevel(fighter: Fighter): number {
  return fighter.power_level ?? calculatePowerLevel(fighter);
}

/**
 * Adds explicit power-level and luck influence to final duel score.
 * - Power level provides steady edge.
 * - Luck provides a volatile swing so fights are less deterministic.
 */
function computePowerLuckEdges(
  fighterA: Fighter,
  fighterB: Fighter,
): {
  edgeA: number;
  edgeB: number;
  powerEdgeTowardA: number;
  luckSwingTowardA: number;
} {
  const powerA = getFighterPowerLevel(fighterA);
  const powerB = getFighterPowerLevel(fighterB);
  const powerEdgeTowardA = (powerA - powerB) * POWER_LEVEL_EDGE_SCALE;

  // Luck duel: each side rolls + scales with their luck stat.
  const luckRollA = randomInt(1, 100) + fighterA.luck * 0.35;
  const luckRollB = randomInt(1, 100) + fighterB.luck * 0.35;
  const luckSwingTowardA = (luckRollA - luckRollB) * LUCK_ROLL_SCALE;

  const edgeA = powerEdgeTowardA + luckSwingTowardA;
  return {
    edgeA,
    edgeB: -edgeA,
    powerEdgeTowardA,
    luckSwingTowardA,
  };
}

/** Exported for `/dojo-moves` previews — same ring as battle resolution. */
export function getCounterBonus(
  myMove: MoveDefinition,
  enemyMove: MoveDefinition,
): number {
  const counterMap: Record<MoveDefinition["archetype"], MoveDefinition["archetype"]> = {
    offense: "burst",
    defense: "offense",
    mobility: "defense",
    control: "mobility",
    burst: "control",
  };
  return counterMap[myMove.archetype] === enemyMove.archetype
    ? STRATEGY_COUNTER_BONUS
    : 0;
}

function getAffinityBonus(fighter: Fighter, move: MoveDefinition): number {
  const affinityStatValue = fighter[move.affinityStat];
  const overBaseline = Math.max(0, affinityStatValue - STRATEGY_AFFINITY_BASELINE);
  return Math.min(overBaseline * STRATEGY_AFFINITY_SCALE, STRATEGY_AFFINITY_BONUS_CAP);
}

function computeMoveStrategyEdges(
  fighterA: Fighter,
  fighterB: Fighter,
  moveA: MoveDefinition,
  moveB: MoveDefinition,
): { edgeA: number; edgeB: number; note: string } {
  const counterA = getCounterBonus(moveA, moveB);
  const counterB = getCounterBonus(moveB, moveA);
  const affinityA = getAffinityBonus(fighterA, moveA);
  const affinityB = getAffinityBonus(fighterB, moveB);
  const edgeA = Math.min(counterA + affinityA, STRATEGY_TOTAL_EDGE_CAP);
  const edgeB = Math.min(counterB + affinityB, STRATEGY_TOTAL_EDGE_CAP);

  const notes: string[] = [];
  if (counterA > 0 && counterB <= 0) {
    notes.push(`${moveA.name} counters ${moveB.name}`);
  } else if (counterB > 0 && counterA <= 0) {
    notes.push(`${moveB.name} counters ${moveA.name}`);
  } else if (counterA > 0 && counterB > 0) {
    notes.push("counter clash");
  }
  notes.push(
    `${fighterA.username} sync +${affinityA.toFixed(2)} / ${fighterB.username} sync +${affinityB.toFixed(2)}`,
  );
  return { edgeA, edgeB, note: notes.join(" | ") };
}

/** Strategy-only preview (no fighter affinity). For player-facing matchup hints. */
export function previewMoveMatchup(moveA: MoveDefinition, moveB: MoveDefinition): {
  favors: "a" | "b" | "even";
  line: string;
} {
  const counterA = getCounterBonus(moveA, moveB);
  const counterB = getCounterBonus(moveB, moveA);
  if (counterA > 0 && counterB <= 0) {
    return {
      favors: "a",
      line: `${moveA.name} counters ${moveB.name} on the archetype wheel.`,
    };
  }
  if (counterB > 0 && counterA <= 0) {
    return {
      favors: "b",
      line: `${moveB.name} counters ${moveA.name} on the archetype wheel.`,
    };
  }
  if (counterA > 0 && counterB > 0) {
    return {
      favors: "even",
      line: "Both moves trade counters — messy neutral.",
    };
  }
  return {
    favors: "even",
    line: "No clean counter — spacing and stats decide this.",
  };
}

function applySeasonModifiers(
  fighter: Fighter,
  season?: DojoSeason | null,
): Fighter {
  if (!season) {
    return fighter;
  }

  // Seasonal balance modifies effective battle stats but keeps base DB stats unchanged.
  return {
    ...fighter,
    strength: fighter.strength * season.strength_mult,
    speed: fighter.speed * season.speed_mult,
    defense: fighter.defense * season.defense_mult,
    spirit: fighter.spirit * season.spirit_mult,
    chakra: fighter.chakra * season.chakra_mult,
    luck: fighter.luck * season.luck_mult,
  };
}

// STEP 1: Weighted base stat score.
export function calculateStatScore(
  fighter: Fighter,
  weights: BattleWeights = DEFAULT_WEIGHTS,
): number {
  return (
    fighter.strength * weights.strength +
    fighter.speed * weights.speed +
    fighter.defense * weights.defense +
    fighter.spirit * weights.spirit +
    fighter.chakra * weights.chakra +
    fighter.luck * weights.luck
  );
}

// STEP 2 + STEP 3: Apply server-side RNG and combine into final score.
export function applyRNG(
  statScore: number,
  weights: BattleWeights = DEFAULT_WEIGHTS,
): { finalScore: number; rngRoll: number; rngScore: number } {
  const rngRoll = randomInt(1, 100);
  const rngScore = rngRoll * weights.rngInfluence;
  const finalScore = statScore * weights.statInfluence + rngScore;

  return { finalScore, rngRoll, rngScore };
}

// STEP 4: Determine if the weaker fighter is at least 10% behind.
export function checkUnderdog(fighterAScore: number, fighterBScore: number) {
  const strongerScore = Math.max(fighterAScore, fighterBScore);
  const weakerScore = Math.min(fighterAScore, fighterBScore);
  const weakerIsUnderdog = weakerScore < strongerScore * UNDERDOG_THRESHOLD_RATIO;

  return {
    weakerIsUnderdog,
    strongerIsA: fighterAScore >= fighterBScore,
  };
}

// STEP 5: 20% chance to grant underdog an awakening bonus.
export function applyAwakening(
  score: number,
  isUnderdog: boolean,
): { score: number; awakeningTriggered: boolean } {
  if (!isUnderdog) {
    return { score, awakeningTriggered: false };
  }

  const awakeningRoll = Math.random();
  if (awakeningRoll > AWAKENING_TRIGGER_CHANCE) {
    return { score, awakeningTriggered: false };
  }

  return {
    score: score * (1 + AWAKENING_SCORE_BONUS),
    awakeningTriggered: true,
  };
}

function createBattleSummary(
  fighterA: Fighter,
  fighterB: Fighter,
  winner: Fighter,
  loser: Fighter,
  awakeningTriggered: boolean,
  tieBreakCoinFlip: boolean,
): string {
  const winnerPower = getFighterPowerLevel(winner);
  const loserPower = getFighterPowerLevel(loser);

  if (tieBreakCoinFlip) {
    return `A perfect standoff! Fate flips a coin and ${winner.username} seizes the win by a hair!`;
  }

  if (awakeningTriggered) {
    const awakeningLines = [
      `${loser.username} triggers AWAKENING and nearly flips destiny, but ${winner.username} answers with a final devastating strike!`,
      `${loser.username} enters AWAKENING state and shocks the arena, yet ${winner.username} digs deeper and wins the last exchange!`,
      `AWAKENING erupts from ${loser.username}, but ${winner.username} refuses to fall and claims the final clash!`,
    ];
    return (
      awakeningLines[randomInt(0, awakeningLines.length - 1)] ??
      `${winner.username} survives an awakening comeback from ${loser.username}.`
    );
  }

  if (winnerPower > loserPower) {
    const dominantLines = [
      `${winner.username} overwhelms ${loser.username} with superior power.`,
      `${winner.username} sets the pace early, baits out every counter, then closes the fight with a clean final combo that leaves ${loser.username} with no answer.`,
      `${loser.username} throws everything they have, but ${winner.username} stands untouchable.`,
    ];
    return (
      dominantLines[randomInt(0, dominantLines.length - 1)] ??
      `${winner.username} dominates ${loser.username}.`
    );
  }

  const clutchScenes = [
    `A clutch moment gives ${winner.username} the edge.`,
    `${fighterA.username} and ${fighterB.username} collide in a final burst, and ${winner.username} claims victory.`,
    `${winner.username} survives the pressure and outlasts ${loser.username} in a razor-close finish.`,
    `${winner.username} reads the final move and counters ${loser.username} at the perfect moment.`,
    `${loser.username} pushes ${winner.username} to the brink, but one last technique decides it.`,
  ];

  return (
    clutchScenes[randomInt(0, clutchScenes.length - 1)] ??
    `${winner.username} outlasts ${loser.username} in a dramatic finish.`
  );
}

export function simulateBattle(
  fighterA: Fighter,
  fighterB: Fighter,
  options: SimulateBattleOptions = {},
): SimulatedBattleResult {
  const effectiveFighterA = applySeasonModifiers(fighterA, options.season);
  const effectiveFighterB = applySeasonModifiers(fighterB, options.season);

  const fighterAStatScore = calculateStatScore(effectiveFighterA);
  const fighterBStatScore = calculateStatScore(effectiveFighterB);

  const fighterAWithRng = applyRNG(fighterAStatScore);
  const fighterBWithRng = applyRNG(fighterBStatScore);
  const powerLuck = computePowerLuckEdges(effectiveFighterA, effectiveFighterB);
  const quoteMomentum = generateQuoteMomentum();
  const moveA = getMoveById(options.moveAId);
  const moveB = getMoveById(options.moveBId);
  const strategy = computeMoveStrategyEdges(
    effectiveFighterA,
    effectiveFighterB,
    moveA,
    moveB,
  );

  const underdogCheck = checkUnderdog(fighterAStatScore, fighterBStatScore);

  // Move pick bonuses (after statInfluence/rngInfluence roll; before underdog / awakening on final).
  const bonusA = applyPvpMoveCap(
    moveA.finalScoreFlatBonus,
  );
  const bonusB = applyPvpMoveCap(
    moveB.finalScoreFlatBonus,
  );

  const techniqueMeritA = strategy.edgeA + bonusA;
  const techniqueMeritB = strategy.edgeB + bonusB;

  let fighterAFinalScore =
    fighterAWithRng.finalScore +
    bonusA +
    powerLuck.edgeA +
    quoteMomentum.edge +
    strategy.edgeA;
  let fighterBFinalScore =
    fighterBWithRng.finalScore +
    bonusB +
    powerLuck.edgeB -
    quoteMomentum.edge +
    strategy.edgeB;
  let awakeningTriggered = false;

  if (underdogCheck.weakerIsUnderdog) {
    if (underdogCheck.strongerIsA) {
      const awakening = applyAwakening(fighterBFinalScore, true);
      fighterBFinalScore = awakening.score;
      awakeningTriggered = awakening.awakeningTriggered;
    } else {
      const awakening = applyAwakening(fighterAFinalScore, true);
      fighterAFinalScore = awakening.score;
      awakeningTriggered = awakening.awakeningTriggered;
    }
  }

  const sa = Math.round(fighterAFinalScore * 100) / 100;
  const sb = Math.round(fighterBFinalScore * 100) / 100;
  const scoreMargin = Math.abs(sa - sb);
  let tieBreakCoinFlip = false;
  let winner: Fighter;
  if (sa === sb) {
    const resolved = resolveWinnerOnTie(
      fighterA,
      fighterB,
      fighterAStatScore,
      fighterBStatScore,
      techniqueMeritA,
      techniqueMeritB,
    );
    winner = resolved.winner;
    tieBreakCoinFlip = resolved.tieBreakCoinFlip;
  } else {
    winner = sa > sb ? fighterA : fighterB;
  }
  const PHOTO_FINISH_MAX = 2;
  const isPhotoFinish =
    scoreMargin <= PHOTO_FINISH_MAX && !tieBreakCoinFlip;
  const loser = winner.discord_user_id === fighterA.discord_user_id ? fighterB : fighterA;
  const summary = createBattleSummary(
    fighterA,
    fighterB,
    winner,
    loser,
    awakeningTriggered,
    tieBreakCoinFlip,
  );

  return {
    winner,
    loser,
    fighterA_score: Number(fighterAFinalScore.toFixed(2)),
    fighterB_score: Number(fighterBFinalScore.toFixed(2)),
    scoreMargin: Number(scoreMargin.toFixed(2)),
    isPhotoFinish,
    awakeningTriggered,
    tieBreakCoinFlip,
    fighterA_statScore: fighterAStatScore,
    fighterB_statScore: fighterBStatScore,
    rngRollA: fighterAWithRng.rngRoll,
    rngRollB: fighterBWithRng.rngRoll,
    rngScoreA: Number(fighterAWithRng.rngScore.toFixed(2)),
    rngScoreB: Number(fighterBWithRng.rngScore.toFixed(2)),
    powerEdgeTowardA: powerLuck.powerEdgeTowardA,
    luckSwingTowardA: powerLuck.luckSwingTowardA,
    powerLuckEdgeTowardA: powerLuck.edgeA,
    quoteA: quoteMomentum.quoteA,
    quoteB: quoteMomentum.quoteB,
    quoteEdge: quoteMomentum.edge,
    strategyEdgeA: strategy.edgeA,
    strategyEdgeB: strategy.edgeB,
    strategyNote: strategy.note,
    summary,
  };
}

// TODO: Add NFT trait-based stat boosts into pre-battle modifiers.
// TODO: Add elemental matchup system (fire, water, wind, etc.).
// TODO: Add critical hit logic as a separate combat event layer.
// TODO: Integrate this engine into tournament bracket mode.
