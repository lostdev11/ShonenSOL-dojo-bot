import { SlashCommandBuilder } from "discord.js";
import { CHAKRA_POINTS_TRAIN } from "../lib/chakraPoints";
import {
  addChakraPointsFromActivity,
  appendUnlockedMove,
  applyTraining,
  getFighterByDiscordId,
} from "../lib/supabase";
import { getMoveById, getUnlockedSlugs, tryUnlockMoveFromPool } from "../lib/moves";
import {
  allStatsAtCap,
  canTrain,
  formatMs,
  rollTraining,
  STAT_CAP,
  STAT_KEYS,
} from "../lib/training";
import type { DojoCommand } from "../types";

const command: DojoCommand = {
  data: new SlashCommandBuilder()
    .setName("dojo-train")
    .setDescription("Train your fighter to grow stronger (once per 24 hours)."),

  async execute(interaction) {
    // Defers so DB work cannot exceed Discord's 3s interaction window.
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

      if (allStatsAtCap(fighter)) {
        await edit(
          `All your stats are at the **${STAT_CAP}** cap. More growth may come in future seasons.`,
        );
        return;
      }

      const ready = canTrain(fighter);
      if (!ready.ok) {
        await edit(
          [
            "You already trained your fighter recently. **Training is limited to once every 24 hours.**",
            "",
            `Come back in **~${formatMs(ready.msLeft)}** to train again.`,
          ].join("\n"),
        );
        return;
      }

      const gains = rollTraining(fighter);
      if (Object.keys(gains).length === 0) {
        await edit("You could not gain more stats this session (all stats already maxed).");
        return;
      }

      const now = new Date().toISOString();
      const patch: Parameters<typeof applyTraining>[1] = { last_train_at: now };
      for (const key of STAT_KEYS) {
        const d = gains[key];
        if (d) {
          patch[key] = Math.min(STAT_CAP, fighter[key] + d);
        }
      }

      const { fighter: updated, usedLastTrainAt } = await applyTraining(
        fighter.discord_user_id,
        patch,
      );

      const cpSaved = await addChakraPointsFromActivity(
        fighter.discord_user_id,
        CHAKRA_POINTS_TRAIN,
      );

      const newMoveSlug = tryUnlockMoveFromPool(getUnlockedSlugs(updated), updated);
      let learnedLine = "";
      if (newMoveSlug) {
        const afterUnlock = await appendUnlockedMove(fighter.discord_user_id, newMoveSlug);
        if (getUnlockedSlugs(afterUnlock).includes(newMoveSlug)) {
          const mv = getMoveById(newMoveSlug);
          learnedLine = [
            "",
            `✨ **New move learned:** *${mv.name}* (use it in the next battle’s move select).`,
            `_${mv.short}_`,
          ].join("\n");
        }
      }

      const lines = STAT_KEYS.map((k) => {
        const before = fighter[k];
        const after = updated[k];
        if (after > before) {
          return `• ${k.charAt(0).toUpperCase() + k.slice(1)}: **${before}** → **${after}**`;
        }
        return null;
      }).filter(Boolean) as string[];

      const noCooldownNote = usedLastTrainAt
        ? ""
        : [
            "",
            "⚠️ *Cooldown is not saved until you add a `last_train_at` column* — see README for SQL.",
          ].join("");

      const trainCpNote = cpSaved
        ? `💠 **+${CHAKRA_POINTS_TRAIN}** Chakra Points (for the move shop).`
        : "⚠️ *Chakra Points not saved* — add a `chakra_points` column to `dojo_fighters` (see README).";

      await edit(
        [
          "🏋️ **Dojo training complete**",
          "",
          ...lines,
          noCooldownNote,
          learnedLine,
          "",
          trainCpNote,
          "",
          "Keep grinding — the next match might be the one.",
        ].join("\n"),
      );
    } catch (error) {
      console.error("dojo-train failed:", error);
      const msg =
        (error as { message?: string })?.message ?? String(error);
      const isMissingColumn = msg.includes("last_train_at");
      await edit(
        [
          "Training could not be saved. Common fixes:",
          "",
          "1. In Supabase SQL, run: `alter table dojo_fighters add column if not exists last_train_at timestamptz;`",
          "2. In Supabase → Settings → API, click **Reload schema** (or wait ~1 min) after creating the column.",
          isMissingColumn
            ? ""
            : "3. Check the bot terminal for the full error.",
          isMissingColumn ? "3. Error was about a missing or unknown column." : "",
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }
  },
};

export default command;
