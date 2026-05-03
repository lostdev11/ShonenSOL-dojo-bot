import { randomBytes } from "node:crypto";
import type { Client, TextChannel } from "discord.js";
import { pickAutoMoveId } from "./moves";
import { runDojoBattleSequence } from "./runDojoBattleSequence";
import type { Fighter } from "../types";
import { startMoveSelectionPhase } from "../handlers/moveSelectHandler";

export type TournamentFollowUp = {
  tournamentId: string;
  round: number;
  matchIndex: number;
};

export type TourSlot = {
  id: string;
  username: string;
  fighter: Fighter;
};

type Pairing = {
  matchIndex: number;
  a: TourSlot;
  b: TourSlot;
};

type TState = {
  textChannelId: string;
  organizerHostId: string;
  round: number;
  autoMoves: boolean;
  bye: TourSlot | null;
  pairings: Pairing[];
  winnersThisRound: TourSlot[];
  recorded: Set<string>;
};

const tournaments = new Map<string, TState>();

function shuffleIntoPairs(slots: TourSlot[]): {
  pairs: [TourSlot, TourSlot][];
  bye: TourSlot | null;
} {
  const shuffled = [...slots].sort(() => Math.random() - 0.5);
  const pairs: [TourSlot, TourSlot][] = [];
  const pairCount = Math.floor(shuffled.length / 2);
  for (let i = 0; i < pairCount; i++) {
    const a = shuffled[i * 2];
    const b = shuffled[i * 2 + 1];
    if (a && b) {
      pairs.push([a, b]);
    }
  }
  const bye = shuffled.length % 2 === 1 ? shuffled[shuffled.length - 1]! : null;
  return { pairs, bye };
}

export function createTournamentId(): string {
  return randomBytes(8).toString("hex");
}

async function launchRoundMatches(client: Client, tournamentId: string): Promise<void> {
  const t = tournaments.get(tournamentId);
  if (!t || t.pairings.length === 0) {
    return;
  }
  const channel = await client.channels.fetch(t.textChannelId).catch(() => null);
  if (!channel?.isTextBased() || !("send" in channel)) {
    return;
  }
  const textChannel = channel as TextChannel;
  const { pairings, autoMoves, round } = t;

  const outcomes = await Promise.allSettled(
    pairings.map(async (p) => {
      const u1 = await client.users.fetch(p.a.id);
      const battleMessage = await textChannel.send({
        content: `🏟️ **R${round} · Match ${p.matchIndex + 1}** — <@${p.a.id}> vs <@${p.b.id}>`,
      });
      const tournamentFollowUp: TournamentFollowUp = {
        tournamentId,
        round,
        matchIndex: p.matchIndex,
      };
      if (autoMoves) {
        await runDojoBattleSequence(battleMessage, {
          challengerUser: u1,
          opponentId: p.b.id,
          opponentUsername: p.b.username,
          challenger: p.a.fighter,
          opponent: p.b.fighter,
          moveAId: pickAutoMoveId(p.a.fighter),
          moveBId: pickAutoMoveId(p.b.fighter),
          tournamentFollowUp,
        });
      } else {
        await startMoveSelectionPhase(
          battleMessage,
          u1,
          { id: p.b.id, username: p.b.username },
          p.a.fighter,
          p.b.fighter,
          undefined,
          { tournamentFollowUp },
        );
      }
    }),
  );

  const failed = outcomes.filter((o) => o.status === "rejected") as PromiseRejectedResult[];
  if (failed.length > 0) {
    console.error("tournament round matches failed:", failed.map((f) => f.reason));
  }
}

export async function startTournament(
  client: Client,
  channel: TextChannel,
  organizerHostId: string,
  fighters: TourSlot[],
  autoMoves: boolean,
): Promise<{ tournamentId: string }> {
  const tournamentId = createTournamentId();
  const shuffled = [...fighters].sort(() => Math.random() - 0.5);
  const { pairs: rawPairs, bye } = shuffleIntoPairs(shuffled);
  const pairings: Pairing[] = rawPairs.map(([a, b], i) => ({
    matchIndex: i,
    a,
    b,
  }));

  tournaments.set(tournamentId, {
    textChannelId: channel.id,
    organizerHostId,
    round: 1,
    autoMoves,
    bye,
    pairings,
    winnersThisRound: [],
    recorded: new Set(),
  });

  await channel.send({
    content: [
      "🏟️ **Tournament — single elimination**",
      `**Round 1** · **${fighters.length}** fighters · **${pairings.length}** match(es)${
        bye ? ` · **Bye:** <@${bye.id}> (auto-advances)` : ""
      }`,
      "_Winners move forward each round until one champion takes all the bragging rights._",
    ].join("\n"),
  });

  await launchRoundMatches(client, tournamentId);
  return { tournamentId };
}

export async function notifyTournamentMatchResolved(
  client: Client,
  followUp: TournamentFollowUp,
  winnerDiscordId: string,
): Promise<void> {
  const t = tournaments.get(followUp.tournamentId);
  if (!t || t.round !== followUp.round) {
    return;
  }

  const key = `${followUp.round}:${followUp.matchIndex}`;
  if (t.recorded.has(key)) {
    return;
  }

  const pairing = t.pairings.find((p) => p.matchIndex === followUp.matchIndex);
  if (!pairing) {
    return;
  }

  const winner =
    winnerDiscordId === pairing.a.id
      ? pairing.a
      : winnerDiscordId === pairing.b.id
        ? pairing.b
        : null;
  if (!winner) {
    console.error(
      "tournament: winner id not in pairing",
      followUp,
      winnerDiscordId,
    );
    return;
  }

  t.recorded.add(key);
  t.winnersThisRound.push(winner);

  if (t.winnersThisRound.length < t.pairings.length) {
    return;
  }

  let pool = [...t.winnersThisRound];
  if (t.bye) {
    pool.push(t.bye);
  }
  t.winnersThisRound = [];
  t.recorded.clear();
  t.bye = null;

  if (pool.length === 1) {
    const champ = pool[0]!;
    const ch = await client.channels.fetch(t.textChannelId).catch(() => null);
    if (ch?.isTextBased() && "send" in ch) {
      await (ch as TextChannel).send({
        content: [
          "👑 **Tournament champion**",
          `<@${champ.id}> (**${champ.username}**) — **all bragging rights** for this bracket.`,
          `_Organizer: <@${t.organizerHostId}>._`,
        ].join("\n"),
      });
    }
    tournaments.delete(followUp.tournamentId);
    return;
  }

  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const { pairs: rawPairs, bye: nextBye } = shuffleIntoPairs(shuffled);
  t.round += 1;
  t.pairings = rawPairs.map(([a, b], i) => ({
    matchIndex: i,
    a,
    b,
  }));
  t.bye = nextBye;

  const ch2 = await client.channels.fetch(t.textChannelId).catch(() => null);
  if (ch2?.isTextBased() && "send" in ch2) {
    const lines = [
      `🏟️ **Round ${t.round}** — **${pool.length}** fighters left`,
      ...t.pairings.map(
        (p, i) => `**Match ${i + 1}:** <@${p.a.id}> vs <@${p.b.id}>`,
      ),
    ];
    if (t.bye) {
      lines.push(`⏸️ **Bye:** <@${t.bye.id}> advances`);
    }
    lines.push("_Same rules — winners advance._");
    await (ch2 as TextChannel).send({
      content: lines.join("\n"),
    });
  }

  await launchRoundMatches(client, followUp.tournamentId);
}
