// In-memory lobbies: multiple joiners, host must click Start. Single-process only.

export type LobbyJoiner = {
  id: string;
  username: string;
};

export type DojoLobby = {
  hostId: string;
  joiners: LobbyJoiner[];
  createdAt: number;
};

// Lobbies stay open a long time so the host can wait for several people to join.
const LOBBY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_LOBBY_PREVIEW = 20;
const lobbies = new Map<string, DojoLobby>();

function randomLobbyId(): string {
  return `${Date.now().toString(36)}z${Math.random().toString(36).slice(2, 12)}`.replace(
    /[^a-z0-9]/g,
    "x",
  );
}

export function createLobby(hostId: string): { lobbyId: string } {
  const lobbyId = randomLobbyId();
  lobbies.set(lobbyId, {
    hostId,
    joiners: [],
    createdAt: Date.now(),
  });
  return { lobbyId };
}

/** Pre-seeds one challenger (e.g. **Run it back** rematch). */
export function createRematchLobby(
  hostId: string,
  opponent: LobbyJoiner,
): { lobbyId: string } {
  const lobbyId = randomLobbyId();
  lobbies.set(lobbyId, {
    hostId,
    joiners: [{ id: opponent.id, username: opponent.username }],
    createdAt: Date.now(),
  });
  return { lobbyId };
}

export function getLobby(lobbyId: string): DojoLobby | undefined {
  const lobby = lobbies.get(lobbyId);
  if (!lobby) {
    return undefined;
  }
  if (Date.now() - lobby.createdAt > LOBBY_TTL_MS) {
    lobbies.delete(lobbyId);
    return undefined;
  }
  return lobby;
}

export function removeLobby(lobbyId: string): void {
  lobbies.delete(lobbyId);
}

export function addJoiner(
  lobbyId: string,
  joiner: LobbyJoiner,
):
  | { ok: true; duplicate: boolean }
  | { ok: false; reason: "missing" } {
  const lobby = getLobby(lobbyId);
  if (!lobby) {
    return { ok: false, reason: "missing" };
  }
  if (lobby.joiners.some((j) => j.id === joiner.id)) {
    return { ok: true, duplicate: true };
  }
  lobby.joiners.push(joiner);
  return { ok: true, duplicate: false };
}

export function removeJoiner(lobbyId: string, userId: string): void {
  const lobby = lobbies.get(lobbyId);
  if (!lobby) {
    return;
  }
  lobby.joiners = lobby.joiners.filter((j) => j.id !== userId);
}

export function pickRandomOpponent(lobbyId: string): LobbyJoiner | null {
  const lobby = getLobby(lobbyId);
  if (!lobby || lobby.joiners.length === 0) {
    return null;
  }
  const idx = Math.floor(Math.random() * lobby.joiners.length);
  return lobby.joiners[idx] ?? null;
}

export function buildLobbyText(hostId: string, joiners: LobbyJoiner[]): string {
  const visible = joiners.slice(0, MAX_LOBBY_PREVIEW);
  const extraCount = Math.max(0, joiners.length - visible.length);
  const joinerLines =
    joiners.length === 0
      ? "_No challengers yet._"
      : [
          ...visible.map((j) => `• <@${j.id}>`),
          extraCount > 0 ? `• ...and **${extraCount}** more` : "",
        ]
          .filter(Boolean)
          .join("\n");

  return [
    "⚔️ **ShonenSOL Battle Lobby**",
    "",
    `**Host** <@${hostId}>`,
    `**Joined:** ${joiners.length}`,
    "",
    "• Fighters can **Join** at their own pace — the battle does **not** start automatically.",
    "• Only the **host** can press **Start battle** or **Quick battle** (enabled once at least one person is in the lobby).",
    "• **Start battle** → both players **pick moves**. **Quick battle** → **auto strongest unlocked** move each (no menus).",
    "• Either start picks **one random challenger** — every joiner has **equal odds** to be selected.",
    "• **Fight CPU (test)** — instant **solo practice** (no PvP records/CP; does not need joiners).",
    "",
    "**In the dojo**",
    joinerLines,
  ].join("\n");
}
