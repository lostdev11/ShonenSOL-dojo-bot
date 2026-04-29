import { SlashCommandBuilder } from "discord.js";
import { simulateBattle } from "../lib/battleEngine";
import { getMoveById, getUnlockedSlugs, MOVE_CATALOG } from "../lib/moves";
import { getFighterByDiscordId } from "../lib/supabase";
import type { DojoCommand, Fighter } from "../types";

const DEFAULT_ITERATIONS = 100;
const MIN_ITERATIONS = 20;
const MAX_ITERATIONS = 1000;
const MATRIX_MOVE_CAP = 5;

function randomAround(base: number, spread: number, min = 40, max = 100): number {
  const swing = Math.floor(Math.random() * (spread * 2 + 1)) - spread;
  return Math.max(min, Math.min(max, base + swing));
}

function buildCpuFighter(host: Fighter): Fighter {
  const now = new Date().toISOString();
  return {
    ...host,
    id: -1,
    discord_user_id: "cpu_sim_dummy",
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

/** Same stats as host — isolates RNG, quotes, counters, and move bonuses (balance curve check). */
function buildMirrorCpu(host: Fighter): Fighter {
  const now = new Date().toISOString();
  return {
    ...host,
    id: -1,
    discord_user_id: "cpu_sim_dummy",
    username: "Dojo CPU (mirror)",
    wins: 0,
    losses: 0,
    created_at: now,
    updated_at: now,
  };
}

function normalizeMoveId(input: string | null): string | null {
  if (!input) {
    return null;
  }
  const id = input.trim().toLowerCase().replace(/\s+/g, "_");
  return id.length > 0 ? id : null;
}

function isValidMoveId(id: string | null): id is string {
  return !!id && id in MOVE_CATALOG;
}

const command: DojoCommand = {
  data: new SlashCommandBuilder()
    .setName("dojo-sim")
    .setDescription("Run debug battle simulations and inspect strategy impact.")
    .addIntegerOption((option) =>
      option
        .setName("iterations")
        .setDescription(`How many simulations to run (${MIN_ITERATIONS}-${MAX_ITERATIONS}).`)
        .setMinValue(MIN_ITERATIONS)
        .setMaxValue(MAX_ITERATIONS),
    )
    .addStringOption((option) =>
      option
        .setName("move_a")
        .setDescription("Your move id (optional). Example: guard"),
    )
    .addStringOption((option) =>
      option
        .setName("move_b")
        .setDescription("CPU move id (optional). Example: quick_step"),
    )
    .addBooleanOption((option) =>
      option
        .setName("mirror_stats")
        .setDescription(
          "CPU copies your stats exactly (measure variance vs equal power). Default: random CPU spread.",
        ),
    ),

  async execute(interaction) {
    try {
      await interaction.deferReply({ flags: 64 });
    } catch {
      return;
    }

    const edit = (content: string) => interaction.editReply({ content });

    try {
      const fighter = await getFighterByDiscordId(interaction.user.id);
      if (!fighter) {
        await edit("You are not registered. Use `/dojo-register` first.");
        return;
      }

      const iterations = interaction.options.getInteger("iterations") ?? DEFAULT_ITERATIONS;
      const moveAInput = normalizeMoveId(interaction.options.getString("move_a"));
      const moveBInput = normalizeMoveId(interaction.options.getString("move_b"));
      const mirrorStats = interaction.options.getBoolean("mirror_stats") ?? false;
      const makeCpu = mirrorStats ? buildMirrorCpu : buildCpuFighter;

      if ((moveAInput && !isValidMoveId(moveAInput)) || (moveBInput && !isValidMoveId(moveBInput))) {
        await edit(
          [
            "Invalid move id.",
            "Use move ids like: `guard`, `quick_step`, `iron_parry`, `domain_pin`, `dojo_ultimate`.",
          ].join("\n"),
        );
        return;
      }

      if (moveAInput || moveBInput) {
        const moveA = getMoveById(moveAInput ?? "basic_strike");
        const moveB = getMoveById(moveBInput ?? "basic_strike");
        let wins = 0;
        let avgDelta = 0;

        for (let i = 0; i < iterations; i += 1) {
          const cpu = makeCpu(fighter);
          const result = simulateBattle(fighter, cpu, {
            moveAId: moveA.id,
            moveBId: moveB.id,
          });
          if (result.winner.discord_user_id === fighter.discord_user_id) {
            wins += 1;
          }
          avgDelta += result.fighterA_score - result.fighterB_score;
        }

        const winRate = (wins / iterations) * 100;
        const meanDelta = avgDelta / iterations;
        await edit(
          [
            "🧪 **Dojo Sim (direct matchup)**",
            "",
            `Runs: **${iterations}**`,
            mirrorStats ? "CPU: **mirrored stats** (RNG + moves + counters only)." : "CPU: **random spread ±8** per stat.",
            `Matchup: **${moveA.name}** vs **${moveB.name}**`,
            `Win rate: **${winRate.toFixed(1)}%**`,
            `Avg score edge: **${meanDelta >= 0 ? "+" : ""}${meanDelta.toFixed(2)}**`,
            "",
            "_Target:_ mirrored + **same moves** → ~**50%** wins; upsets come from luck/counters/quote.",
            "_Tip:_ omit move options for the matrix; use **mirror_stats** to measure variance at equal power.",
          ].join("\n"),
        );
        return;
      }

      const moveIds = getUnlockedSlugs(fighter).slice(0, MATRIX_MOVE_CAP);
      if (moveIds.length < 2) {
        await edit("Not enough unlocked moves for matrix mode. Train or buy more moves first.");
        return;
      }

      const pairs: Array<{ a: string; b: string }> = [];
      for (const a of moveIds) {
        for (const b of moveIds) {
          if (a !== b) {
            pairs.push({ a, b });
          }
        }
      }

      const runsPerPair = Math.max(3, Math.floor(iterations / pairs.length));
      const results: Array<{ label: string; winRate: number; avgEdge: number }> = [];

      for (const pair of pairs) {
        let wins = 0;
        let edgeSum = 0;
        for (let i = 0; i < runsPerPair; i += 1) {
          const cpu = makeCpu(fighter);
          const result = simulateBattle(fighter, cpu, {
            moveAId: pair.a,
            moveBId: pair.b,
          });
          if (result.winner.discord_user_id === fighter.discord_user_id) {
            wins += 1;
          }
          edgeSum += result.fighterA_score - result.fighterB_score;
        }

        const moveA = getMoveById(pair.a);
        const moveB = getMoveById(pair.b);
        results.push({
          label: `${moveA.name} vs ${moveB.name}`,
          winRate: (wins / runsPerPair) * 100,
          avgEdge: edgeSum / runsPerPair,
        });
      }

      const best = [...results].sort((x, y) => y.winRate - x.winRate).slice(0, 3);
      const worst = [...results].sort((x, y) => x.winRate - y.winRate).slice(0, 3);
      const totalRuns = runsPerPair * pairs.length;

      await edit(
        [
          "🧪 **Dojo Sim (move matrix)**",
          "",
          mirrorStats ? "CPU: **mirrored stats**." : "CPU: **random spread ±8** per stat.",
          `Requested runs: **${iterations}** | Executed runs: **${totalRuns}**`,
          `Move pool: **${moveIds.map((id) => getMoveById(id).name).join(", ")}**`,
          "",
          "**Best matchups**",
          ...best.map(
            (r) =>
              `• ${r.label} — ${r.winRate.toFixed(1)}% win | edge ${r.avgEdge >= 0 ? "+" : ""}${r.avgEdge.toFixed(2)}`,
          ),
          "",
          "**Weak matchups**",
          ...worst.map(
            (r) =>
              `• ${r.label} — ${r.winRate.toFixed(1)}% win | edge ${r.avgEdge >= 0 ? "+" : ""}${r.avgEdge.toFixed(2)}`,
          ),
        ].join("\n"),
      );
    } catch (error) {
      console.error("dojo-sim failed:", error);
      await edit("Simulation failed. Check terminal logs and try again.");
    }
  },
};

export default command;
