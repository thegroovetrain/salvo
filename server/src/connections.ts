import type { ServerToClientEvents } from '@salvo/shared';

// ============================================================
// Connection Manager
// Manages bidirectional playerId ↔ socketId mapping
// and event buffering for reconnection.
// Disconnection is a state marker only — forfeit is handled
// by the turn timer in index.ts when the player's turn arrives.
// ============================================================

type BufferedEvent = {
  event: string;
  data: unknown;
};

interface ConnectionState {
  playerId: string;
  socketId: string;
  gameId: string;
  disconnectedAt: number | null;
  bufferedEvents: BufferedEvent[];
}

export class ConnectionManager {
  // playerId → connection state
  private connections = new Map<string, ConnectionState>();
  // socketId → playerId (reverse lookup)
  private socketToPlayer = new Map<string, string>();

  register(playerId: string, socketId: string, gameId: string): void {
    this.connections.set(playerId, {
      playerId,
      socketId,
      gameId,
      disconnectedAt: null,
      bufferedEvents: [],
    });
    this.socketToPlayer.set(socketId, playerId);
  }

  getPlayerIdBySocket(socketId: string): string | undefined {
    return this.socketToPlayer.get(socketId);
  }

  getSocketId(playerId: string): string | undefined {
    const conn = this.connections.get(playerId);
    if (!conn || conn.disconnectedAt !== null) return undefined;
    return conn.socketId;
  }

  getGameId(playerId: string): string | undefined {
    return this.connections.get(playerId)?.gameId;
  }

  isDisconnected(playerId: string): boolean {
    const conn = this.connections.get(playerId);
    return conn ? conn.disconnectedAt !== null : false;
  }

  /**
   * Handle a socket disconnect. Marks the player as disconnected
   * and returns the playerId/gameId. Forfeit is handled by the
   * turn timer in index.ts, not here.
   */
  handleDisconnect(
    socketId: string,
  ): { playerId: string; gameId: string } | null {
    const playerId = this.socketToPlayer.get(socketId);
    if (!playerId) return null;

    const conn = this.connections.get(playerId);
    if (!conn) return null;

    this.socketToPlayer.delete(socketId);
    conn.disconnectedAt = Date.now();
    conn.bufferedEvents = [];

    return { playerId, gameId: conn.gameId };
  }

  /**
   * Handle a reconnection. Clears disconnect state and returns
   * buffered events to replay.
   */
  handleReconnect(
    playerId: string,
    newSocketId: string,
  ): { bufferedEvents: BufferedEvent[]; gameId: string } | null {
    const conn = this.connections.get(playerId);
    if (!conn) return null;
    if (conn.disconnectedAt === null) return null; // not disconnected

    // Update socket mapping
    conn.socketId = newSocketId;
    conn.disconnectedAt = null;
    this.socketToPlayer.set(newSocketId, playerId);

    const buffered = [...conn.bufferedEvents];
    conn.bufferedEvents = [];

    return { bufferedEvents: buffered, gameId: conn.gameId };
  }

  /**
   * Buffer an event for a disconnected player.
   * Returns false if the player is not disconnected (event should be sent directly).
   */
  bufferEvent(playerId: string, event: string, data: unknown): boolean {
    const conn = this.connections.get(playerId);
    if (!conn || conn.disconnectedAt === null) return false;

    conn.bufferedEvents.push({ event, data });
    return true;
  }

  /**
   * Get remaining disconnect time in seconds, or null if not disconnected.
   */
  getDisconnectTimeRemaining(playerId: string): number | null {
    const conn = this.connections.get(playerId);
    if (!conn || conn.disconnectedAt === null) return null;

    const elapsed = Date.now() - conn.disconnectedAt;
    const remaining = Math.max(0, 60_000 - elapsed);
    return Math.ceil(remaining / 1000);
  }

  /**
   * Remove a player entirely (game over, cleanup).
   */
  remove(playerId: string): void {
    const conn = this.connections.get(playerId);
    if (conn) {
      this.socketToPlayer.delete(conn.socketId);
      this.connections.delete(playerId);
    }
  }

  /**
   * Remove all connections for a game.
   */
  removeGame(gameId: string): void {
    for (const [playerId, conn] of this.connections) {
      if (conn.gameId === gameId) {
        this.socketToPlayer.delete(conn.socketId);
        this.connections.delete(playerId);
      }
    }
  }
}
