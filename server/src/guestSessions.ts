// ============================================================
// Guest Session Manager
// Manages persistent guest identity (guestId) across connections.
// Separate from ConnectionManager which handles per-game playerId.
//
//   Client (localStorage)          Server
//   ──────────────────          ──────
//   guestId ─── auth ──────▶  GuestSessionManager
//                                guestId → { socketId, playerId?, gameId?, partyId?, name?, lastSeenAt }
//                                    │
//                              ConnectionManager (per-game)     PartyManager
//                                playerId → { socketId, ...}     partyId → { members, leader, code }
//
// GuestSessionManager owns:
//   - Guest identity lifecycle (connect, disconnect, GC)
//   - Game binding (bindToGame, unbindFromGame)
//   - Multi-tab eviction (last connection wins)
//   - Player name persistence
// ============================================================

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface GuestSession {
  guestId: string;
  socketId: string | null;    // null when disconnected
  playerId: string | null;    // null when not in a game
  gameId: string | null;      // null when not in a game
  partyId: string | null;     // null when not in a party (set/cleared only by PartyManager)
  name: string | null;        // last-used player name
  lastSeenAt: number;         // timestamp for GC
}

export interface ConnectResult {
  evictedSocketId: string | null;
  activeGame: { playerId: string; gameId: string } | null;
}

export function isValidGuestId(guestId: unknown): guestId is string {
  return typeof guestId === 'string' && UUID_REGEX.test(guestId);
}

export class GuestSessionManager {
  private sessions = new Map<string, GuestSession>();
  private socketToGuest = new Map<string, string>();
  private gcInterval: ReturnType<typeof setInterval> | null = null;
  private gameExistsCheck: ((gameId: string) => boolean) | null = null;

  /** Register a callback to check if a game still exists (set by emitters init) */
  setGameExistsCheck(fn: (gameId: string) => boolean): void {
    this.gameExistsCheck = fn;
  }

  /**
   * Handle a new socket connection for a guestId.
   * If the guestId already has an active socket, evict it (last connection wins).
   * Returns the evicted socketId (if any) and active game info (if any).
   */
  handleConnect(guestId: string, socketId: string): ConnectResult {
    const existing = this.sessions.get(guestId);
    let evictedSocketId: string | null = null;

    if (existing) {
      // Evict old socket if still active
      if (existing.socketId !== null) {
        evictedSocketId = existing.socketId;
        this.socketToGuest.delete(existing.socketId);
      }
      existing.socketId = socketId;
      existing.lastSeenAt = Date.now();
    } else {
      this.sessions.set(guestId, {
        guestId,
        socketId,
        playerId: null,
        gameId: null,
        partyId: null,
        name: null,
        lastSeenAt: Date.now(),
      });
    }

    this.socketToGuest.set(socketId, guestId);

    const session = this.sessions.get(guestId)!;
    const activeGame = session.playerId && session.gameId
      ? { playerId: session.playerId, gameId: session.gameId }
      : null;

    return { evictedSocketId, activeGame };
  }

  /**
   * Handle a socket disconnect. Session persists with game binding.
   */
  handleDisconnect(socketId: string): void {
    const guestId = this.socketToGuest.get(socketId);
    if (!guestId) return;

    this.socketToGuest.delete(socketId);
    const session = this.sessions.get(guestId);
    if (session && session.socketId === socketId) {
      session.socketId = null;
      session.lastSeenAt = Date.now();
    }
  }

  /**
   * Bind a guest to a game (when they join/create a game).
   */
  bindToGame(guestId: string, playerId: string, gameId: string): void {
    const session = this.sessions.get(guestId);
    if (!session) return;
    session.playerId = playerId;
    session.gameId = gameId;
  }

  /**
   * Unbind a guest from a game (game ended, player surrendered).
   */
  unbindFromGame(guestId: string): void {
    const session = this.sessions.get(guestId);
    if (!session) return;
    session.playerId = null;
    session.gameId = null;
  }

  /**
   * Update the player's last-used name.
   */
  setName(guestId: string, name: string): void {
    const session = this.sessions.get(guestId);
    if (session) session.name = name;
  }

  getName(guestId: string): string | null {
    return this.sessions.get(guestId)?.name ?? null;
  }

  getSession(guestId: string): GuestSession | undefined {
    return this.sessions.get(guestId);
  }

  getGuestIdByPlayer(playerId: string): string | undefined {
    for (const session of this.sessions.values()) {
      if (session.playerId === playerId) return session.guestId;
    }
    return undefined;
  }

  getSocketId(guestId: string): string | null {
    return this.sessions.get(guestId)?.socketId ?? null;
  }

  getGuestIdBySocket(socketId: string): string | undefined {
    return this.socketToGuest.get(socketId);
  }

  /** Count unique connected guests (for online count dedup). */
  getConnectedGuestCount(): number {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (session.socketId !== null) count++;
    }
    return count;
  }

  /** Get all guestIds bound to a specific game (for all-disconnected check). */
  getGuestsInGame(gameId: string): GuestSession[] {
    const guests: GuestSession[] = [];
    for (const session of this.sessions.values()) {
      if (session.gameId === gameId) guests.push(session);
    }
    return guests;
  }

  /** Check if all human players in a game are disconnected. */
  areAllDisconnected(gameId: string): boolean {
    const guests = this.getGuestsInGame(gameId);
    if (guests.length === 0) return false;
    return guests.every(g => g.socketId === null);
  }

  /**
   * Unbind all guests from a game (called on game cleanup).
   */
  unbindAllFromGame(gameId: string): void {
    for (const session of this.sessions.values()) {
      if (session.gameId === gameId) {
        session.playerId = null;
        session.gameId = null;
      }
    }
  }

  get sessionCount(): number {
    return this.sessions.size;
  }

  // ── Garbage Collection ──────────────────────────────

  startGC(): void {
    if (this.gcInterval) return;
    this.gcInterval = setInterval(() => this.sweep(), 60_000);
  }

  stopGC(): void {
    if (this.gcInterval) {
      clearInterval(this.gcInterval);
      this.gcInterval = null;
    }
  }

  sweep(): void {
    const now = Date.now();
    const staleThreshold = 5 * 60_000; // 5 minutes

    for (const [guestId, session] of this.sessions) {
      // Sessions with active game are never cleaned up
      if (session.gameId !== null) {
        // But check if the game still exists
        if (this.gameExistsCheck && !this.gameExistsCheck(session.gameId)) {
          session.playerId = null;
          session.gameId = null;
          // Don't delete — session may still be useful (party in Sprint 1b+)
        }
        continue;
      }

      // Orphaned session: no socket, no game, no party, stale
      if (session.socketId === null && session.partyId === null && (now - session.lastSeenAt) > staleThreshold) {
        this.sessions.delete(guestId);
      }
    }
  }
}
