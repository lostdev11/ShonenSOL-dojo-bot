import type { Message } from "discord.js";
import type { Fighter } from "../types";

export const FFA_MOVE_SELECT_PREFIX = "dojomvffa:";

export type FfaMoveSlot = {
  userId: string;
  username: string;
  fighter: Fighter;
  moveId: string | null;
};

export type FfaMovePending = {
  message: Message;
  sessionId: string;
  slots: FfaMoveSlot[];
  timeout: ReturnType<typeof setTimeout> | null;
};

const sessions = new Map<string, FfaMovePending>();

export function setFfaMoveSession(sessionId: string, pending: FfaMovePending): void {
  sessions.set(sessionId, pending);
}

export function getFfaMoveSession(sessionId: string): FfaMovePending | undefined {
  return sessions.get(sessionId);
}

export function takeFfaMoveSession(sessionId: string): FfaMovePending | undefined {
  const p = sessions.get(sessionId);
  if (!p) {
    return undefined;
  }
  sessions.delete(sessionId);
  return p;
}

export function parseFfaMoveSelectCustomId(
  customId: string,
): { sessionId: string; userId: string } | null {
  const raw = customId.startsWith(FFA_MOVE_SELECT_PREFIX)
    ? customId.slice(FFA_MOVE_SELECT_PREFIX.length)
    : null;
  if (!raw) {
    return null;
  }
  const colon = raw.indexOf(":");
  if (colon <= 0) {
    return null;
  }
  const sessionId = raw.slice(0, colon);
  const userId = raw.slice(colon + 1);
  if (!/^[0-9a-f]+$/.test(sessionId) || !/^\d+$/.test(userId)) {
    return null;
  }
  return { sessionId, userId };
}
