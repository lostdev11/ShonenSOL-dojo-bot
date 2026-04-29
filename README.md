# ShonenSOL Dojo Bot (MVP)

Beginner-friendly Discord bot built with Node.js, TypeScript, discord.js, and Supabase.

## Features

- `/dojo-register`: registers a fighter with random stats from 40-100
- `/dojo-stats`: stats, record, power level, **equipped title**, **win/loss streaks** (when DB columns exist), pointer to history
- `/dojo-battle`: opens a lobby (**default**) or runs **CPU test mode** (`mode: CPU`) for instant practice
- `/dojo-spar`: instant CPU fight (same as CPU mode — **no PvP records**)
- `/dojo-train`: gain small stat boosts (cooldown 24h; cap 100 per stat), **Chakra Points (CP)**, and a chance to **learn a new battle move**
- `/dojo-shop`: spend **Chakra Points** on **tiered moves** (cheap basics → elite) that add a **flat edge** in PvP; earn CP from **wins/losses** in battles and from training
- `/dojo-cosmetics`: spend CP on **cosmetic titles** (no combat stats)
- `/dojo-daily`: daily **CP stipend** (UTC) + **weekly bonus** on first claim of the ISO week (requires DB columns)
- `/dojo-history`: last few **PvP** battles with scores and timestamps
- `/dojo-moves`: archetype wheel help + optional **matchup preview** between two moves
- `/dojo-events`: copy/paste **fight night** checklist for mods (ephemeral)
- **Battle move select** (after the host starts): simultaneous picks; archetype **playstyle** labels; **photo finish** margin text; optional **🔥** reaction on hype outcomes; **Run it back** / **Best of 3** buttons after PvP
- `/dojo-season` / `/dojo-leaderboard`: season buffs and rankings

## Project Structure

- `src/commands`: slash command handlers
- `src/lib/supabase.ts`: Supabase reads/writes
- `src/lib/battle.ts`: battle score calculation + flavor text
- `src/lib/stats.ts`: random stat generation and stat helpers

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy env template:

   ```bash
   cp .env.example .env
   ```

3. Fill in `.env` values:
   - `DISCORD_TOKEN`
   - `DISCORD_CLIENT_ID`
   - `DISCORD_GUILD_ID` (optional, recommended for testing)
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

## Supabase Tables

Run this SQL in Supabase SQL editor:

```sql
create table if not exists dojo_fighters (
  id bigint generated always as identity primary key,
  discord_user_id text unique not null,
  username text not null,
  strength int not null,
  speed int not null,
  defense int not null,
  spirit int not null,
  chakra int not null,
  luck int not null,
  wins int not null default 0,
  losses int not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists dojo_battles (
  id bigint generated always as identity primary key,
  challenger_id text not null,
  opponent_id text not null,
  challenger_score numeric not null,
  opponent_score numeric not null,
  winner_id text not null,
  battle_summary text not null,
  created_at timestamp with time zone not null default now()
);
```

**Training column** (if your `dojo_fighters` table already exists from earlier setup):

```sql
alter table dojo_fighters
add column if not exists last_train_at timestamp with time zone;
```

**Unlocked moves** (optional; for training to persist new moves; JSON array of string slugs):

```sql
alter table dojo_fighters
add column if not exists unlocked_moves jsonb default '["basic_strike", "guard", "quick_step"]'::jsonb;
```

If the column is missing, battles still work; the bot falls back to starter moves for everyone. Training may not persist unlocks until you add the column.

**Chakra Points** (optional; shop currency; integer):

```sql
alter table dojo_fighters
add column if not exists chakra_points int not null default 0;
```

If missing, the bot still runs battles, but you will not earn or spend Chakra Points until this column exists.

**Battle season link** (optional, if you use seasons and `season_id` on battles):

```sql
-- After dojo_seasons exists; see prior season SQL.
alter table dojo_battles
add column if not exists season_id bigint references dojo_seasons(id);
```

**Streaks, daily login, cosmetics** (optional — unlocks streak lines, `/dojo-daily`, `/dojo-cosmetics` persistence):

```sql
alter table dojo_fighters
add column if not exists win_streak int not null default 0;

alter table dojo_fighters
add column if not exists loss_streak int not null default 0;

alter table dojo_fighters
add column if not exists daily_bonus_claim_date text;

alter table dojo_fighters
add column if not exists weekly_bonus_week text;

alter table dojo_fighters
add column if not exists unlocked_titles jsonb default '["title_student"]'::jsonb;

alter table dojo_fighters
add column if not exists equipped_title text default 'title_student';
```

If these columns are absent, battles still work; streak UI and login/cosmetic flows degrade gracefully until migrations are applied.

## Discord Command Deployment

Deploy slash commands (run this after changing any command options so Discord shows them):

```bash
npm run deploy:commands
```

- If `DISCORD_GUILD_ID` is set, commands deploy to that guild (fast).
- If not set, commands deploy globally (can take up to an hour).

## Run the Bot

Build and run:

```bash
npm run build
npm start
```

Or run in dev mode:

```bash
npm run dev
```
