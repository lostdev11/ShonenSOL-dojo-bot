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
  "The dojo remembers honest effort.",
  "Hunger is useless if your hands shake.",
  "Let them swing at yesterday's you.",
  "Footwork first; ego last.",
  "Silence reads louder than boasting.",
  "If you blink, you pay rent.",
  "Hold the line with your spine, not your pride.",
  "The cleanest win is the one you saw coming.",
  "Chaos is just untrained rhythm.",
  "Do not chase the hit—own the space.",
  "Courage is showing up tired and focused.",
  "Two steps back can be a declaration of war.",
  "You are not behind—you are loading.",
  "Steel breaks; spirit bends and returns.",
  "The ring is a mirror with teeth.",
  "Every feint is a question; answer with truth.",
  "Fight like you still have something to learn.",
  "Confidence without recovery is a trap.",
  "Let the storm pass through you, not over you.",
  "If you saw the opening, it is already late.",
  "Pain is a teacher that does not repeat gently.",
  "Keep your eyes soft and your intent hard.",
  "The finish line moves when you stop growing.",
  "Stillness is not weakness—it is poised violence.",
  "They want a duel; sell them a siege.",
  "Your guard is where your apology lives.",
  "Win small until small becomes inevitable.",
  "Charge is worthless without aim.",
  "Be the rumor they cannot imitate.",
  "The crowd fades when your breath steadies.",
  "Do not brag about power you cannot reload.",
  "If you grin, earn it.",
  "Let doubt be theirs; clarity is yours.",
  "Momentum is borrowed—pay it back with precision.",
  "He who hesitates rents space to fortune.",
  "You are dangerous when predictable on purpose.",
  "The bruise fades; the habit stays.",
  "Trade pride for posture.",
  "A clean block is louder than trash talk.",
  "Do not audition for applause—spar for mastery.",
  "You are allowed to shine without announcing it.",
  "If you stumble, pretend it was a feint—even to yourself.",
  "The hardest opponent is boredom with basics.",
  "Speed is admiration; endurance is devotion.",
  "Make them earn every inch forward.",
  "Do not memorize combos—memorize consequences.",
  "They call it luck when practice looks boring.",
  "Empty your lungs; fill the moment.",
  "Your next move should surprise you a little too.",
  "Leave nothing on the floor but sweat and doubt.",
  "If you shout, breathe first.",
  "The scoreboard forgets swagger; remembers outcomes.",
  "Walk in like homework is done.",
  "Be kind outside the bracket; ruthless inside.",
  "If you blink twice, you've paid tuition.",
  "Fear sharpened turns into instinct.",
  "Let them waste energy proving they are brave.",
  "You are not here to be liked mid-combo.",
  "The best trash talk is a calm exhale.",
  "Make pressure your teammate.",
  "If you flinch, flinch forward.",
  "Do not worship strength—worship timing.",
  "Every round is a vote on your habits.",
  "They want your heat; sell them your ice.",
  "Rest is part of the weapon.",
  "You can be tired and still be correct.",
  "Do not argue with the pain—schedule it.",
  "If you are smiling, your guard better be real.",
  "Winning boring is still winning loud.",
  "Let their rhythm break on you.",
  "You are the variable they did not balance for.",
  "Champions collect quiet reps.",
  "If you rush, you volunteer to lose.",
  "Precision is respect for your own time.",
  "They will remember how you stood up.",
  "Do not hunt glory—hunt clean execution.",
  "Your spirit should arrive before your fist.",
  "If you fear the counter, you feed it.",
  "Leave drama in the lobby; bring craft to the mat.",
  "The next exchange owes you nothing—earn it.",
  "Be difficult to read and easy to respect.",
  "You are not behind; you are adjusting range.",
  "Make them pay for every assumption.",
  "Calm is a currency few can counterfeit.",
  "If you want the crown, carry the weight.",
  "Endurance is a flex that never gets old.",
  "Do not swing at ghosts—cut the real line.",
  "Your best move is the one you can repeat.",
  "Let them celebrate early; you celebrate last.",
  "Heart without technique is just noise.",
  "Technique without heart is just furniture.",
  "You are here to finish the lesson.",
  "If the room doubts you, let your feet answer.",
  "Victory likes a quiet entrance.",
  "Train like the rematch is tomorrow.",
  "Leave them wondering what you did not show.",
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
