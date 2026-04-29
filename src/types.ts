import type {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
} from "discord.js";

export interface Fighter {
  id: number;
  discord_user_id: string;
  username: string;
  strength: number;
  speed: number;
  defense: number;
  spirit: number;
  chakra: number;
  luck: number;
  power_level?: number;
  wins: number;
  losses: number;
  /** Currency to buy moves in `/dojo-shop` (not the Chakra stat). */
  chakra_points?: number | null;
  last_train_at?: string | null;
  /** Slugs from `lib/moves` — extra moves learned via training. */
  unlocked_moves?: string[] | null;
  /** Consecutive PvP wins (optional column). */
  win_streak?: number | null;
  /** Consecutive PvP losses (optional column). */
  loss_streak?: number | null;
  /** UTC calendar date `YYYY-MM-DD` of last `/dojo-daily` claim (optional column). */
  daily_bonus_claim_date?: string | null;
  /** ISO week string `YYYY-Www` for weekly bonus tracking (optional column). */
  weekly_bonus_week?: string | null;
  /** Cosmetic title ids owned (optional column). */
  unlocked_titles?: string[] | null;
  /** Equipped cosmetic title id (optional column). */
  equipped_title?: string | null;
  created_at: string;
  updated_at: string;
}

export interface BattleRecord {
  challenger_id: string;
  opponent_id: string;
  challenger_score: number;
  opponent_score: number;
  winner_id: string;
  battle_summary: string;
  season_id?: number;
}

export interface DojoSeason {
  id: number;
  season_key: string;
  name: string;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  strength_mult: number;
  speed_mult: number;
  defense_mult: number;
  spirit_mult: number;
  chakra_mult: number;
  luck_mult: number;
  created_at: string;
  updated_at: string;
}

export interface DojoCommand {
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}
