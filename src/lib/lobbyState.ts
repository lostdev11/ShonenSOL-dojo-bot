// In-memory lobbies: multiple joiners, host must click Start. For multi-worker setups,
// `resolveJoinersForBattleStart` merges the live Discord message (who appears under **In the dojo**)
// with this map so every joiner is included when a match starts.

export type LobbyJoiner = {
  id: string;
  username: string;
};

/** `bracket` — parallel 1v1s. `ffa` — everyone in one clash. `tournament` — single elimination. */
export type LobbyFormat = "bracket" | "ffa" | "tournament";

export type DojoLobby = {
  hostId: string;
  joiners: LobbyJoiner[];
  createdAt: number;
  format: LobbyFormat;
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

export function createLobby(
  hostId: string,
  format: LobbyFormat = "bracket",
): { lobbyId: string } {
  const lobbyId = randomLobbyId();
  lobbies.set(lobbyId, {
    hostId,
    joiners: [],
    createdAt: Date.now(),
    format,
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
    format: "bracket",
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

/**
 * Discord message content is the cross-process source of truth for who clicked Join:
 * in-memory `lobby.joiners` only updates on the bot worker that handled each Join button.
 * When multiple workers/processes serve traffic, merge parsed mentions with memory so every
 * registered joiner is included when the host starts.
 */
export function resolveJoinersForBattleStart(
  lobby: DojoLobby,
  messageContent: string,
): LobbyJoiner[] {
  const marker = "**In the dojo**";
  const idx = messageContent.indexOf(marker);
  if (idx === -1) {
    return lobby.joiners;
  }
  const section = messageContent.slice(idx + marker.length).trim();
  if (section.includes("_No challengers yet._")) {
    return [];
  }

  const parsedIds = [...section.matchAll(/<@(\d+)>/g)].map((m) => m[1]!);
  const memoryById = new Map(lobby.joiners.map((j) => [j.id, j] as const));
  const mergedIds = new Set<string>();
  for (const id of parsedIds) {
    mergedIds.add(id);
  }
  for (const j of lobby.joiners) {
    mergedIds.add(j.id);
  }

  return [...mergedIds].map((id) => {
    const fromMemory = memoryById.get(id);
    return fromMemory ?? { id, username: "Fighter" };
  });
}

export function buildLobbyText(
  hostId: string,
  joiners: LobbyJoiner[],
  format: LobbyFormat,
): string {
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

  const commonHead = [
    format === "ffa"
      ? "⚔️ **ShonenSOL Free-for-all Lobby**"
      : format === "tournament"
        ? "🏟️ **ShonenSOL Tournament Lobby**"
        : "⚔️ **ShonenSOL Battle Lobby**",
    "",
    `**Host** <@${hostId}>`,
    `**Joined:** ${joiners.length}`,
    "",
    "• Before joining, register your fighter with **`/dojo-register`**.",
    "• Fighters can **Join** at their own pace — nothing starts automatically.",
    "• **Fight CPU (test)** — instant **solo practice** (no PvP records/CP; does not need joiners).",
    "",
  ];

  if (format === "ffa") {
    return [
      ...commonHead,
      "• Only the **host** can run **FFA · pick moves** or **FFA · quick** (enabled once someone joined).",
      "• **Everyone vs everyone** — one clash; **one winner**, everyone else logs a loss for ranked stats.",
      "• **FFA · pick moves** — each fighter uses **their menu** (max **5** fighters with menus; use **quick** if you have more).",
      "• **FFA · quick** — **auto strongest unlocked** move per fighter (any lobby size).",
      "",
      "**In the dojo**",
      joinerLines,
    ].join("\n");
  }

  if (format === "tournament") {
    return [
      ...commonHead,
      "• Only the **host** can run **Tournament · pick moves** or **Tournament · quick** (enabled once someone joined).",
      "• **Single elimination** — random seed; **winners advance** each round until one **champion**.",
      "• **Tournament · pick moves** — pick moves each round. **Tournament · quick** — auto moves every fight.",
      "• With an **odd** number of fighters, **one random bye** advances without fighting that round.",
      "",
      "**In the dojo**",
      joinerLines,
    ].join("\n");
  }

  return [
    ...commonHead,
    "• Only the **host** can press **Brackets · moves** or **Brackets · quick** (enabled once at least one person is in the lobby).",
    "• **Brackets · moves** → **pick moves** per 1v1. **Brackets · quick** → **auto** moves (no menus).",
    "• Start **pairs everyone** (host + registered joiners): **random matchups**, **one Discord message per fight**.",
    "• With an **odd** number of registered fighters, **one random fighter sits out** that round.",
    "",
    "**In the dojo**",
    joinerLines,
  ].join("\n");
}
