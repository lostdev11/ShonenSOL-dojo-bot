export type BattleQuotePick = {
  quoteA: string;
  quoteB: string;
  /** Symmetric edge: +edge for A and -edge for B. */
  edge: number;
};

const BATTLE_QUOTES: readonly string[] = [
  "Power means nothing without control.",
  "Calm mind, sharp strike.",
  "I bend, but I do not break.",
  "One breath can change the fight.",
  "Speed without timing is wasted motion.",
  "Pressure reveals true spirit.",
  "Every scar is a lesson.",
  "Win the moment, not the noise.",
  "Discipline defeats chaos.",
  "A patient fighter sees the opening first.",
  "Luck helps, preparation wins.",
  "Respect your rival, then surpass them.",
];

/** Symmetric narrative swing; tuned down so matchup + stats drive closer fights. */
const MAX_QUOTE_EDGE = 1.0;

function randomInt(maxExclusive: number): number {
  return Math.floor(Math.random() * maxExclusive);
}

function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function generateQuoteMomentum(): BattleQuotePick {
  const quoteA = BATTLE_QUOTES[randomInt(BATTLE_QUOTES.length)] ?? BATTLE_QUOTES[0]!;
  const quoteB = BATTLE_QUOTES[randomInt(BATTLE_QUOTES.length)] ?? BATTLE_QUOTES[0]!;
  const roll = hashString(`${quoteA}|${quoteB}`) % 1000;
  const normalized = roll / 999; // 0..1
  const centered = (normalized - 0.5) * 2; // -1..1
  const edge = Number((centered * MAX_QUOTE_EDGE).toFixed(2));

  return { quoteA, quoteB, edge };
}
