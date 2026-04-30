export type BattleQuotePick = {
  quoteA: string;
  quoteB: string;
  /** Symmetric edge: +edge for A and -edge for B. */
  edge: number;
};

/** Symmetric narrative swing; tuned down so matchup + stats drive closer fights. */
const MAX_QUOTE_EDGE = 1.0;

function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Quotes come from each fighter's chosen move so every technique has its own line. */
export function generateQuoteMomentum(quoteA: string, quoteB: string): BattleQuotePick {
  const roll = hashString(`${quoteA}|${quoteB}`) % 1000;
  const normalized = roll / 999; // 0..1
  const centered = (normalized - 0.5) * 2; // -1..1
  const edge = Number((centered * MAX_QUOTE_EDGE).toFixed(2));

  return { quoteA, quoteB, edge };
}
