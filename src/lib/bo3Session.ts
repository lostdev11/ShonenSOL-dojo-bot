import { randomBytes } from "node:crypto";

export type Bo3SeriesState = {
  hostId: string;
  oppId: string;
  winsHost: number;
  winsOpp: number;
  round: number;
};

const WIN_TARGET = 2;
const sessions = new Map<string, Bo3SeriesState>();

export function createBo3Session(hostId: string, oppId: string): string {
  const id = randomBytes(6).toString("hex");
  sessions.set(id, {
    hostId,
    oppId,
    winsHost: 0,
    winsOpp: 0,
    round: 1,
  });
  return id;
}

export function getBo3Session(id: string): Bo3SeriesState | undefined {
  return sessions.get(id);
}

export function deleteBo3Session(id: string): void {
  sessions.delete(id);
}

/**
 * Record who won a round. Host is always fighter A in battles.
 * Returns whether the series ended and the champion discord id if so.
 */
export function recordBo3RoundWin(
  sessionId: string,
  winnerDiscordId: string,
): { done: boolean; championId?: string; state: Bo3SeriesState | null } {
  const s = sessions.get(sessionId);
  if (!s) {
    return { done: true, state: null };
  }
  if (winnerDiscordId === s.hostId) {
    s.winsHost += 1;
  } else if (winnerDiscordId === s.oppId) {
    s.winsOpp += 1;
  }
  s.round += 1;
  if (s.winsHost >= WIN_TARGET) {
    sessions.delete(sessionId);
    return { done: true, championId: s.hostId, state: s };
  }
  if (s.winsOpp >= WIN_TARGET) {
    sessions.delete(sessionId);
    return { done: true, championId: s.oppId, state: s };
  }
  return { done: false, state: s };
}
