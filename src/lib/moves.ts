// Move catalog: unlock via training and/or Chakra Points shop; each move adds a flat edge in battle.

import { calculatePowerLevel } from "./stats";
import type { Fighter } from "../types";
import { MOVE_BATTLE_PHRASES } from "./moveBattlePhrases";

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
  /** Fighter shout line tied to this move (battle reveal 💬). */
  battlePhrase: string;
};

export const STARTER_MOVE_IDS: readonly string[] = [
  "basic_strike",
  "guard",
  "quick_step",
];

const MOVE_CATALOG_RAW: Record<string, Omit<MoveDefinition, "battlePhrase">> = {
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
    finalScoreFlatBonus: 2.92,
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
    finalScoreFlatBonus: 3.48,
    archetype: "burst",
    affinityStat: "chakra",
    trainUnlock: true,
    tier: 4,
    shopPrice: 365,
  },
  ember_fist: {
    id: "ember_fist",
    name: "Ember Fist",
    short: "Jab wrapped in lingering heat.",
    finalScoreFlatBonus: 1.06,
    archetype: "offense",
    affinityStat: "strength",
    trainUnlock: true,
    tier: 1,
    shopPrice: 42,
  },
  mist_veil: {
    id: "mist_veil",
    name: "Mist Veil",
    short: "Vanish edges of your silhouette.",
    finalScoreFlatBonus: 1.07,
    archetype: "defense",
    affinityStat: "speed",
    trainUnlock: false,
    tier: 1,
    shopPrice: 43,
  },
  root_stance: {
    id: "root_stance",
    name: "Root Stance",
    short: "Low center; hard to shove.",
    finalScoreFlatBonus: 1.08,
    archetype: "mobility",
    affinityStat: "defense",
    trainUnlock: false,
    tier: 1,
    shopPrice: 44,
  },
  thread_bind: {
    id: "thread_bind",
    name: "Thread Bind",
    short: "Snare rhythm with feints.",
    finalScoreFlatBonus: 1.1,
    archetype: "control",
    affinityStat: "spirit",
    trainUnlock: true,
    tier: 1,
    shopPrice: 45,
  },
  snap_elbow: {
    id: "snap_elbow",
    name: "Snap Elbow",
    short: "Short arc, mean contact.",
    finalScoreFlatBonus: 1.11,
    archetype: "burst",
    affinityStat: "chakra",
    trainUnlock: false,
    tier: 1,
    shopPrice: 46,
  },
  river_roll: {
    id: "river_roll",
    name: "River Roll",
    short: "Flow around the lock.",
    finalScoreFlatBonus: 1.12,
    archetype: "offense",
    affinityStat: "luck",
    trainUnlock: false,
    tier: 1,
    shopPrice: 47,
  },
  stone_shoulder: {
    id: "stone_shoulder",
    name: "Stone Shoulder",
    short: "Turn a hit into a brace.",
    finalScoreFlatBonus: 1.14,
    archetype: "defense",
    affinityStat: "strength",
    trainUnlock: true,
    tier: 1,
    shopPrice: 48,
  },
  cloud_split: {
    id: "cloud_split",
    name: "Cloud Split",
    short: "Cut through smoke and doubt.",
    finalScoreFlatBonus: 1.15,
    archetype: "mobility",
    affinityStat: "speed",
    trainUnlock: false,
    tier: 1,
    shopPrice: 49,
  },
  needle_knee: {
    id: "needle_knee",
    name: "Needle Knee",
    short: "Rise sudden up the middle.",
    finalScoreFlatBonus: 1.16,
    archetype: "control",
    affinityStat: "defense",
    trainUnlock: false,
    tier: 1,
    shopPrice: 50,
  },
  echo_palm: {
    id: "echo_palm",
    name: "Echo Palm",
    short: "Strike that asks twice.",
    finalScoreFlatBonus: 1.17,
    archetype: "burst",
    affinityStat: "spirit",
    trainUnlock: true,
    tier: 1,
    shopPrice: 51,
  },
  drift_slide: {
    id: "drift_slide",
    name: "Drift Slide",
    short: "Glide wide; deny the lane.",
    finalScoreFlatBonus: 1.19,
    archetype: "offense",
    affinityStat: "chakra",
    trainUnlock: false,
    tier: 1,
    shopPrice: 52,
  },
  iron_breath: {
    id: "iron_breath",
    name: "Iron Breath",
    short: "Steady lungs; steady guard.",
    finalScoreFlatBonus: 1.2,
    archetype: "defense",
    affinityStat: "luck",
    trainUnlock: false,
    tier: 1,
    shopPrice: 53,
  },
  spiral_throw: {
    id: "spiral_throw",
    name: "Spiral Throw",
    short: "Redirect with a twist.",
    finalScoreFlatBonus: 1.21,
    archetype: "mobility",
    affinityStat: "strength",
    trainUnlock: true,
    tier: 1,
    shopPrice: 54,
  },
  pulse_check: {
    id: "pulse_check",
    name: "Pulse Check",
    short: "Read openings by touch.",
    finalScoreFlatBonus: 1.22,
    archetype: "control",
    affinityStat: "speed",
    trainUnlock: false,
    tier: 1,
    shopPrice: 55,
  },
  shade_step: {
    id: "shade_step",
    name: "Shade Step",
    short: "Borrow the blind spot.",
    finalScoreFlatBonus: 1.24,
    archetype: "burst",
    affinityStat: "defense",
    trainUnlock: false,
    tier: 1,
    shopPrice: 56,
  },
  thorn_push: {
    id: "thorn_push",
    name: "Thorn Push",
    short: "Painful clearance.",
    finalScoreFlatBonus: 1.25,
    archetype: "offense",
    affinityStat: "spirit",
    trainUnlock: true,
    tier: 1,
    shopPrice: 57,
  },
  mirror_line: {
    id: "mirror_line",
    name: "Mirror Line",
    short: "Match their tempo; steal it.",
    finalScoreFlatBonus: 1.26,
    archetype: "defense",
    affinityStat: "chakra",
    trainUnlock: false,
    tier: 1,
    shopPrice: 58,
  },
  hollow_block: {
    id: "hollow_block",
    name: "Hollow Block",
    short: "Let power pass through air.",
    finalScoreFlatBonus: 1.27,
    archetype: "mobility",
    affinityStat: "luck",
    trainUnlock: false,
    tier: 1,
    shopPrice: 59,
  },
  flare_turn: {
    id: "flare_turn",
    name: "Flare Turn",
    short: "Spin off the bind.",
    finalScoreFlatBonus: 1.29,
    archetype: "control",
    affinityStat: "strength",
    trainUnlock: true,
    tier: 1,
    shopPrice: 60,
  },
  kite_string: {
    id: "kite_string",
    name: "Kite String",
    short: "Keep them on your lead.",
    finalScoreFlatBonus: 1.3,
    archetype: "burst",
    affinityStat: "speed",
    trainUnlock: false,
    tier: 1,
    shopPrice: 61,
  },
  ember_guard: {
    id: "ember_guard",
    name: "Ember Guard",
    short: "Warm ring; cool head.",
    finalScoreFlatBonus: 1.31,
    archetype: "offense",
    affinityStat: "defense",
    trainUnlock: false,
    tier: 1,
    shopPrice: 62,
  },
  crane_drop: {
    id: "crane_drop",
    name: "Crane Drop",
    short: "Vertical answer to pressure.",
    finalScoreFlatBonus: 1.32,
    archetype: "defense",
    affinityStat: "spirit",
    trainUnlock: true,
    tier: 1,
    shopPrice: 63,
  },
  serpent_whip: {
    id: "serpent_whip",
    name: "Serpent Whip",
    short: "Whip the angle open.",
    finalScoreFlatBonus: 1.33,
    archetype: "mobility",
    affinityStat: "chakra",
    trainUnlock: false,
    tier: 1,
    shopPrice: 64,
  },
  amber_hold: {
    id: "amber_hold",
    name: "Amber Hold",
    short: "Freeze the moment you need.",
    finalScoreFlatBonus: 1.35,
    archetype: "control",
    affinityStat: "luck",
    trainUnlock: false,
    tier: 1,
    shopPrice: 65,
  },
  lotus_pivot: {
    id: "lotus_pivot",
    name: "Lotus Pivot",
    short: "Turn without losing root.",
    finalScoreFlatBonus: 1.36,
    archetype: "burst",
    affinityStat: "strength",
    trainUnlock: true,
    tier: 1,
    shopPrice: 66,
  },
  thunder_rim: {
    id: "thunder_rim",
    name: "Thunder Rim",
    short: "Shock the guard from below.",
    finalScoreFlatBonus: 1.92,
    archetype: "offense",
    affinityStat: "strength",
    trainUnlock: true,
    tier: 2,
    shopPrice: 88,
  },
  void_slip: {
    id: "void_slip",
    name: "Void Slip",
    short: "Step where they did not swing.",
    finalScoreFlatBonus: 1.94,
    archetype: "defense",
    affinityStat: "speed",
    trainUnlock: false,
    tier: 2,
    shopPrice: 90,
  },
  mountain_echo: {
    id: "mountain_echo",
    name: "Mountain Echo",
    short: "Second wave hits harder.",
    finalScoreFlatBonus: 1.96,
    archetype: "mobility",
    affinityStat: "defense",
    trainUnlock: true,
    tier: 2,
    shopPrice: 92,
  },
  tidebreaker: {
    id: "tidebreaker",
    name: "Tidebreaker",
    short: "Splash through the wall.",
    finalScoreFlatBonus: 1.98,
    archetype: "control",
    affinityStat: "spirit",
    trainUnlock: false,
    tier: 2,
    shopPrice: 94,
  },
  silver_arc: {
    id: "silver_arc",
    name: "Silver Arc",
    short: "Clean slash of intent.",
    finalScoreFlatBonus: 2,
    archetype: "burst",
    affinityStat: "chakra",
    trainUnlock: true,
    tier: 2,
    shopPrice: 96,
  },
  heartline: {
    id: "heartline",
    name: "Heartline",
    short: "Honest thrust; no disguise.",
    finalScoreFlatBonus: 2.02,
    archetype: "offense",
    affinityStat: "luck",
    trainUnlock: false,
    tier: 2,
    shopPrice: 98,
  },
  night_ledger: {
    id: "night_ledger",
    name: "Night Ledger",
    short: "Pay pain with interest.",
    finalScoreFlatBonus: 2.03,
    archetype: "defense",
    affinityStat: "strength",
    trainUnlock: true,
    tier: 2,
    shopPrice: 100,
  },
  wind_knot: {
    id: "wind_knot",
    name: "Wind Knot",
    short: "Tangle limbs mid-motion.",
    finalScoreFlatBonus: 2.05,
    archetype: "mobility",
    affinityStat: "speed",
    trainUnlock: false,
    tier: 2,
    shopPrice: 102,
  },
  brazen_rush: {
    id: "brazen_rush",
    name: "Brazen Rush",
    short: "Take space like it is owed.",
    finalScoreFlatBonus: 2.07,
    archetype: "control",
    affinityStat: "defense",
    trainUnlock: true,
    tier: 2,
    shopPrice: 104,
  },
  glass_parry: {
    id: "glass_parry",
    name: "Glass Parry",
    short: "Barely there; razor sharp.",
    finalScoreFlatBonus: 2.09,
    archetype: "burst",
    affinityStat: "spirit",
    trainUnlock: false,
    tier: 2,
    shopPrice: 106,
  },
  spirit_chain: {
    id: "spirit_chain",
    name: "Spirit Chain",
    short: "Link hits into verdict.",
    finalScoreFlatBonus: 2.11,
    archetype: "offense",
    affinityStat: "chakra",
    trainUnlock: true,
    tier: 2,
    shopPrice: 108,
  },
  ember_typhoon: {
    id: "ember_typhoon",
    name: "Ember Typhoon",
    short: "Heat and swirl together.",
    finalScoreFlatBonus: 2.13,
    archetype: "defense",
    affinityStat: "luck",
    trainUnlock: false,
    tier: 2,
    shopPrice: 110,
  },
  shadow_clock: {
    id: "shadow_clock",
    name: "Shadow Clock",
    short: "Every tick is yours.",
    finalScoreFlatBonus: 2.15,
    archetype: "mobility",
    affinityStat: "strength",
    trainUnlock: true,
    tier: 2,
    shopPrice: 112,
  },
  aurora_kick: {
    id: "aurora_kick",
    name: "Aurora Kick",
    short: "Arc that paints the sky.",
    finalScoreFlatBonus: 2.17,
    archetype: "control",
    affinityStat: "speed",
    trainUnlock: false,
    tier: 2,
    shopPrice: 114,
  },
  deep_current: {
    id: "deep_current",
    name: "Deep Current",
    short: "Pull them into your pace.",
    finalScoreFlatBonus: 2.19,
    archetype: "burst",
    affinityStat: "defense",
    trainUnlock: true,
    tier: 2,
    shopPrice: 116,
  },
  iron_bloom: {
    id: "iron_bloom",
    name: "Iron Bloom",
    short: "Guard flowers into strike.",
    finalScoreFlatBonus: 2.21,
    archetype: "offense",
    affinityStat: "spirit",
    trainUnlock: false,
    tier: 2,
    shopPrice: 118,
  },
  luck_weave: {
    id: "luck_weave",
    name: "Luck Weave",
    short: "Thread probability tight.",
    finalScoreFlatBonus: 2.22,
    archetype: "defense",
    affinityStat: "chakra",
    trainUnlock: true,
    tier: 2,
    shopPrice: 120,
  },
  phantom_tag: {
    id: "phantom_tag",
    name: "Phantom Tag",
    short: "Touch they feel too late.",
    finalScoreFlatBonus: 2.24,
    archetype: "mobility",
    affinityStat: "luck",
    trainUnlock: false,
    tier: 2,
    shopPrice: 122,
  },
  solar_rib: {
    id: "solar_rib",
    name: "Solar Rib",
    short: "Body line like a beam.",
    finalScoreFlatBonus: 2.26,
    archetype: "control",
    affinityStat: "strength",
    trainUnlock: true,
    tier: 2,
    shopPrice: 124,
  },
  monsoon_heel: {
    id: "monsoon_heel",
    name: "Monsoon Heel",
    short: "Rain of downward checks.",
    finalScoreFlatBonus: 2.28,
    archetype: "burst",
    affinityStat: "speed",
    trainUnlock: false,
    tier: 2,
    shopPrice: 126,
  },
  rift_palm: {
    id: "rift_palm",
    name: "Rift Palm",
    short: "Open a gap with pressure.",
    finalScoreFlatBonus: 2.3,
    archetype: "offense",
    affinityStat: "defense",
    trainUnlock: true,
    tier: 2,
    shopPrice: 128,
  },
  starfall: {
    id: "starfall",
    name: "Starfall",
    short: "Drop from nowhere.",
    finalScoreFlatBonus: 2.32,
    archetype: "defense",
    affinityStat: "spirit",
    trainUnlock: false,
    tier: 2,
    shopPrice: 130,
  },
  ember_domain: {
    id: "ember_domain",
    name: "Ember Domain",
    short: "Own the heated center.",
    finalScoreFlatBonus: 2.34,
    archetype: "mobility",
    affinityStat: "chakra",
    trainUnlock: true,
    tier: 2,
    shopPrice: 132,
  },
  quiet_burst: {
    id: "quiet_burst",
    name: "Quiet Burst",
    short: "No shout; all damage.",
    finalScoreFlatBonus: 2.36,
    archetype: "control",
    affinityStat: "luck",
    trainUnlock: false,
    tier: 2,
    shopPrice: 134,
  },
  woven_strike: {
    id: "woven_strike",
    name: "Woven Strike",
    short: "Braid offense into defense.",
    finalScoreFlatBonus: 2.38,
    archetype: "burst",
    affinityStat: "strength",
    trainUnlock: true,
    tier: 2,
    shopPrice: 136,
  },
  apex_line: {
    id: "apex_line",
    name: "Apex Line",
    short: "Straight path to the throne.",
    finalScoreFlatBonus: 2.42,
    archetype: "offense",
    affinityStat: "strength",
    trainUnlock: true,
    tier: 3,
    shopPrice: 160,
  },
  eclipse_wheel: {
    id: "eclipse_wheel",
    name: "Eclipse Wheel",
    short: "Spin that eats daylight.",
    finalScoreFlatBonus: 2.44,
    archetype: "defense",
    affinityStat: "speed",
    trainUnlock: false,
    tier: 3,
    shopPrice: 162,
  },
  thousand_pulse: {
    id: "thousand_pulse",
    name: "Thousand Pulse",
    short: "Many beats become one blow.",
    finalScoreFlatBonus: 2.45,
    archetype: "mobility",
    affinityStat: "defense",
    trainUnlock: true,
    tier: 3,
    shopPrice: 164,
  },
  sovereign_guard: {
    id: "sovereign_guard",
    name: "Sovereign Guard",
    short: "Refuse ruin at the gate.",
    finalScoreFlatBonus: 2.47,
    archetype: "control",
    affinityStat: "spirit",
    trainUnlock: false,
    tier: 3,
    shopPrice: 166,
  },
  blood_oath_feint: {
    id: "blood_oath_feint",
    name: "Blood Oath Feint",
    short: "Promise violence; deliver worse.",
    finalScoreFlatBonus: 2.49,
    archetype: "burst",
    affinityStat: "chakra",
    trainUnlock: true,
    tier: 3,
    shopPrice: 168,
  },
  skyhook_reversal: {
    id: "skyhook_reversal",
    name: "Skyhook Reversal",
    short: "Turn ascent into doom.",
    finalScoreFlatBonus: 2.5,
    archetype: "offense",
    affinityStat: "luck",
    trainUnlock: false,
    tier: 3,
    shopPrice: 170,
  },
  gravity_well: {
    id: "gravity_well",
    name: "Gravity Well",
    short: "They sink into your orbit.",
    finalScoreFlatBonus: 2.52,
    archetype: "defense",
    affinityStat: "strength",
    trainUnlock: true,
    tier: 3,
    shopPrice: 172,
  },
  mirage_fatal: {
    id: "mirage_fatal",
    name: "Mirage Fatal",
    short: "Truth arrives last.",
    finalScoreFlatBonus: 2.54,
    archetype: "mobility",
    affinityStat: "speed",
    trainUnlock: false,
    tier: 3,
    shopPrice: 174,
  },
  crowned_elbow: {
    id: "crowned_elbow",
    name: "Crowned Elbow",
    short: "Royal finish from inside.",
    finalScoreFlatBonus: 2.55,
    archetype: "control",
    affinityStat: "defense",
    trainUnlock: true,
    tier: 3,
    shopPrice: 176,
  },
  storm_ledger: {
    id: "storm_ledger",
    name: "Storm Ledger",
    short: "Totals paid in thunder.",
    finalScoreFlatBonus: 2.57,
    archetype: "burst",
    affinityStat: "spirit",
    trainUnlock: false,
    tier: 3,
    shopPrice: 178,
  },
  sanctum_wall: {
    id: "sanctum_wall",
    name: "Sanctum Wall",
    short: "No passage without tribute.",
    finalScoreFlatBonus: 2.59,
    archetype: "offense",
    affinityStat: "chakra",
    trainUnlock: true,
    tier: 3,
    shopPrice: 180,
  },
  razor_canvas: {
    id: "razor_canvas",
    name: "Razor Canvas",
    short: "Paint them into corners.",
    finalScoreFlatBonus: 2.6,
    archetype: "defense",
    affinityStat: "luck",
    trainUnlock: false,
    tier: 3,
    shopPrice: 182,
  },
  pulse_crown: {
    id: "pulse_crown",
    name: "Pulse Crown",
    short: "Rule the heartbeat of the fight.",
    finalScoreFlatBonus: 2.62,
    archetype: "mobility",
    affinityStat: "strength",
    trainUnlock: true,
    tier: 3,
    shopPrice: 184,
  },
  spirit_nova: {
    id: "spirit_nova",
    name: "Spirit Nova",
    short: "Detonate aura at contact.",
    finalScoreFlatBonus: 2.64,
    archetype: "control",
    affinityStat: "speed",
    trainUnlock: false,
    tier: 3,
    shopPrice: 186,
  },
  lotus_sentence: {
    id: "lotus_sentence",
    name: "Lotus Sentence",
    short: "Close the case gently.",
    finalScoreFlatBonus: 2.66,
    archetype: "burst",
    affinityStat: "defense",
    trainUnlock: true,
    tier: 3,
    shopPrice: 188,
  },
  iron_symphony: {
    id: "iron_symphony",
    name: "Iron Symphony",
    short: "Many guards; one crescendo.",
    finalScoreFlatBonus: 2.67,
    archetype: "offense",
    affinityStat: "spirit",
    trainUnlock: false,
    tier: 3,
    shopPrice: 190,
  },
  chakrastorm: {
    id: "chakrastorm",
    name: "Chakra Storm",
    short: "Spiral pressure everywhere.",
    finalScoreFlatBonus: 2.69,
    archetype: "defense",
    affinityStat: "chakra",
    trainUnlock: true,
    tier: 3,
    shopPrice: 192,
  },
  destiny_fork: {
    id: "destiny_fork",
    name: "Destiny Fork",
    short: "Force a bad fork in their plan.",
    finalScoreFlatBonus: 2.71,
    archetype: "mobility",
    affinityStat: "luck",
    trainUnlock: false,
    tier: 3,
    shopPrice: 194,
  },
  obsidian_slide: {
    id: "obsidian_slide",
    name: "Obsidian Slide",
    short: "Frictionless doom.",
    finalScoreFlatBonus: 2.72,
    archetype: "control",
    affinityStat: "strength",
    trainUnlock: true,
    tier: 3,
    shopPrice: 196,
  },
  aurum_thread: {
    id: "aurum_thread",
    name: "Aurum Thread",
    short: "Gold line through chaos.",
    finalScoreFlatBonus: 2.74,
    archetype: "burst",
    affinityStat: "speed",
    trainUnlock: false,
    tier: 3,
    shopPrice: 198,
  },
  void_verdict: {
    id: "void_verdict",
    name: "Void Verdict",
    short: "Judgment without witness.",
    finalScoreFlatBonus: 2.76,
    archetype: "offense",
    affinityStat: "defense",
    trainUnlock: true,
    tier: 3,
    shopPrice: 200,
  },
  ember_crown_kick: {
    id: "ember_crown_kick",
    name: "Crown Flame Kick",
    short: "Leg wearing authority.",
    finalScoreFlatBonus: 2.77,
    archetype: "defense",
    affinityStat: "spirit",
    trainUnlock: false,
    tier: 3,
    shopPrice: 202,
  },
  temple_breaker: {
    id: "temple_breaker",
    name: "Temple Breaker",
    short: "Doctrine meets dust.",
    finalScoreFlatBonus: 2.79,
    archetype: "mobility",
    affinityStat: "chakra",
    trainUnlock: true,
    tier: 3,
    shopPrice: 204,
  },
  harmonic_burst: {
    id: "harmonic_burst",
    name: "Harmonic Burst",
    short: "Strike at resonant timing.",
    finalScoreFlatBonus: 2.81,
    archetype: "control",
    affinityStat: "luck",
    trainUnlock: false,
    tier: 3,
    shopPrice: 206,
  },
  zenith_charge: {
    id: "zenith_charge",
    name: "Zenith Charge",
    short: "Highest point of impact.",
    finalScoreFlatBonus: 2.82,
    archetype: "burst",
    affinityStat: "strength",
    trainUnlock: true,
    tier: 3,
    shopPrice: 208,
  },
  skyforge_finisher: {
    id: "skyforge_finisher",
    name: "Skyforge Finisher",
    short: "Hammer forged in open air.",
    finalScoreFlatBonus: 2.96,
    archetype: "offense",
    affinityStat: "strength",
    trainUnlock: true,
    tier: 4,
    shopPrice: 290,
  },
  world_edge: {
    id: "world_edge",
    name: "World Edge",
    short: "Stand where endings begin.",
    finalScoreFlatBonus: 2.99,
    archetype: "defense",
    affinityStat: "speed",
    trainUnlock: true,
    tier: 4,
    shopPrice: 294,
  },
  oathbreaker_nova: {
    id: "oathbreaker_nova",
    name: "Oathbreaker Nova",
    short: "Break limits; owe nothing.",
    finalScoreFlatBonus: 3.01,
    archetype: "mobility",
    affinityStat: "defense",
    trainUnlock: true,
    tier: 4,
    shopPrice: 298,
  },
  silent_cataclysm: {
    id: "silent_cataclysm",
    name: "Silent Cataclysm",
    short: "Ruin without rehearsal.",
    finalScoreFlatBonus: 3.04,
    archetype: "control",
    affinityStat: "spirit",
    trainUnlock: true,
    tier: 4,
    shopPrice: 302,
  },
  infinite_gate: {
    id: "infinite_gate",
    name: "Infinite Gate",
    short: "Step through endless openings.",
    finalScoreFlatBonus: 3.06,
    archetype: "burst",
    affinityStat: "chakra",
    trainUnlock: true,
    tier: 4,
    shopPrice: 306,
  },
  soul_tributary: {
    id: "soul_tributary",
    name: "Soul Tributary",
    short: "Flow that claims its due.",
    finalScoreFlatBonus: 3.09,
    archetype: "offense",
    affinityStat: "luck",
    trainUnlock: true,
    tier: 4,
    shopPrice: 310,
  },
  starforge_palm: {
    id: "starforge_palm",
    name: "Starforge Palm",
    short: "Heat of distant cores.",
    finalScoreFlatBonus: 3.12,
    archetype: "defense",
    affinityStat: "strength",
    trainUnlock: true,
    tier: 4,
    shopPrice: 314,
  },
  last_breath_arts: {
    id: "last_breath_arts",
    name: "Last Breath Arts",
    short: "Finalize with honor.",
    finalScoreFlatBonus: 3.14,
    archetype: "mobility",
    affinityStat: "speed",
    trainUnlock: true,
    tier: 4,
    shopPrice: 318,
  },
  absolute_line: {
    id: "absolute_line",
    name: "Absolute Line",
    short: "No debate; only result.",
    finalScoreFlatBonus: 3.17,
    archetype: "control",
    affinityStat: "defense",
    trainUnlock: true,
    tier: 4,
    shopPrice: 322,
  },
  heavens_ledger: {
    id: "heavens_ledger",
    name: "Heavens Ledger",
    short: "Balance paid in radiance.",
    finalScoreFlatBonus: 3.19,
    archetype: "burst",
    affinityStat: "spirit",
    trainUnlock: true,
    tier: 4,
    shopPrice: 326,
  },
  dojos_end: {
    id: "dojos_end",
    name: "Dojos End",
    short: "Close the chapter.",
    finalScoreFlatBonus: 3.22,
    archetype: "offense",
    affinityStat: "chakra",
    trainUnlock: true,
    tier: 4,
    shopPrice: 330,
  },
  aurora_sovereign: {
    id: "aurora_sovereign",
    name: "Aurora Sovereign",
    short: "Light that commands.",
    finalScoreFlatBonus: 3.25,
    archetype: "defense",
    affinityStat: "luck",
    trainUnlock: true,
    tier: 4,
    shopPrice: 334,
  },
  chronicle_drop: {
    id: "chronicle_drop",
    name: "Chronicle Drop",
    short: "History falls on them.",
    finalScoreFlatBonus: 3.27,
    archetype: "mobility",
    affinityStat: "strength",
    trainUnlock: true,
    tier: 4,
    shopPrice: 338,
  },
  void_monarch: {
    id: "void_monarch",
    name: "Void Monarch",
    short: "Rule the empty space.",
    finalScoreFlatBonus: 3.3,
    archetype: "control",
    affinityStat: "speed",
    trainUnlock: true,
    tier: 4,
    shopPrice: 342,
  },
  ember_genesis: {
    id: "ember_genesis",
    name: "Ember Genesis",
    short: "Begin again in fire.",
    finalScoreFlatBonus: 3.32,
    archetype: "burst",
    affinityStat: "defense",
    trainUnlock: true,
    tier: 4,
    shopPrice: 346,
  },
};

export const MOVE_CATALOG: Record<string, MoveDefinition> = Object.fromEntries(
  Object.entries(MOVE_CATALOG_RAW).map(([id, m]) => {
    const battlePhrase = MOVE_BATTLE_PHRASES[id];
    if (!battlePhrase) {
      throw new Error(`Missing MOVE_BATTLE_PHRASES entry for move: ${id}`);
    }
    return [id, { ...m, battlePhrase }] as const;
  }),
) as Record<string, MoveDefinition>;

for (const id of Object.keys(MOVE_BATTLE_PHRASES)) {
  if (!MOVE_CATALOG_RAW[id]) {
    throw new Error(`MOVE_BATTLE_PHRASES has unknown move id: ${id}`);
  }
}

const TARGET_SHOP_MOVE_COUNT = 50;
const TARGET_TRAIN_UNLOCK_COUNT = 50;

const NON_STARTER_MOVES = Object.values(MOVE_CATALOG).filter(
  (m) => !STARTER_MOVE_IDS.includes(m.id),
);

/** Active shop pool: exactly 50 moves, sorted by affordability then tier. */
const SHOP_MOVE_ID_SET = new Set(
  NON_STARTER_MOVES.filter((m) => m.shopPrice != null)
    .sort((a, b) => (a.shopPrice! - b.shopPrice!) || a.tier - b.tier)
    .slice(0, TARGET_SHOP_MOVE_COUNT)
    .map((m) => m.id),
);

/** Active training pool: exactly 50 lucky unlocks. */
const TRAIN_UNLOCK_POOL = NON_STARTER_MOVES.filter((m) => m.trainUnlock)
  .sort((a, b) => a.tier - b.tier || b.finalScoreFlatBonus - a.finalScoreFlatBonus)
  .slice(0, TARGET_TRAIN_UNLOCK_COUNT);

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
    .filter((m) => SHOP_MOVE_ID_SET.has(m.id) && !owned.has(m.id))
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

/** Uniform random from unlocked moves — spar / CPU practice. */
export function pickRandomMoveId(fighter: {
  unlocked_moves?: string[] | null;
}): string {
  const slugs = getUnlockedSlugs(fighter);
  if (slugs.length === 0) {
    return "basic_strike";
  }
  return slugs[Math.floor(Math.random() * slugs.length)]!;
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
