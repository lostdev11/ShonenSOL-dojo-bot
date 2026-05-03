import type { Message } from "discord.js";
import type { Fighter } from "../types";

export const MOVE_SELECT_PREFIX = "dojomv:";

export type MovePending = {
  message: Message;
  hostId: string;
  oppId: string;
  hostFighter: Fighter;
  oppFighter: Fighter;
  moveHost: string | null;
  moveOpp: string | null;
  timeout: ReturnType<typeof setTimeout> | null;
  /** When set, battle outcome feeds a Best-of-3 series. */
  bo3SessionId?: string | null;
  /** When set, winner advances in single-elimination tournament. */
  tournamentFollowUp?: {
    tournamentId: string;
    round: number;
    matchIndex: number;
  } | null;
};

const sessions = new Map<string, MovePending>();

export function setMoveSession(id: string, p: MovePending) {
  sessions.set(id, p);
}

export function getMoveSession(id: string) {
  return sessions.get(id);
}

export function deleteMoveSession(id: string) {
  const p = sessions.get(id);
  if (p?.timeout) {
    clearTimeout(p.timeout);
  }
  sessions.delete(id);
}

/** Take session off the map synchronously (stops 60s timeout from racing in). */
export function takeMoveSession(id: string): MovePending | undefined {
  const p = sessions.get(id);
  if (!p) {
    return undefined;
  }
  if (p.timeout) {
    clearTimeout(p.timeout);
  }
  p.timeout = null;
  sessions.delete(id);
  return p;
}
