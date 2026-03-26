import type { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@salvo/shared';
import { toClientView } from './game.js';
import type { ConnectionManager } from './connections.js';
import type { LobbyManager } from './lobby.js';
import type { GuestSessionManager } from './guestSessions.js';
import type { PartyManager } from './party/state.js';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;

let _io: IO;
let _connections: ConnectionManager;
let _lobby: LobbyManager;
let _guestSessions: GuestSessionManager;
let _partyManager: PartyManager;

export function initEmitters(io: IO, connections: ConnectionManager, lobby: LobbyManager, guestSessions: GuestSessionManager, partyManager: PartyManager): void {
  _io = io;
  _connections = connections;
  _lobby = lobby;
  _guestSessions = guestSessions;
  _partyManager = partyManager;
}

export function getIO(): IO {
  return _io;
}

export function getConnections(): ConnectionManager {
  return _connections;
}

export function getLobby(): LobbyManager {
  return _lobby;
}

export function getGuestSessions(): GuestSessionManager {
  return _guestSessions;
}

export function getPartyManager(): PartyManager {
  return _partyManager;
}

/** Emit to a guest by guestId. No buffering — party uses snapshot-on-reconnect. */
export function emitToGuest(guestId: string, event: string, data: unknown): void {
  const session = _guestSessions.getSession(guestId);
  if (!session?.socketId) return; // Guest disconnected — snapshot on reconnect

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _io.to(session.socketId).emit(event as any, data as any);
}

export function emitToPlayer(playerId: string, event: string, data: unknown): void {
  // Buffer if disconnected, otherwise emit directly
  if (_connections.bufferEvent(playerId, event, data)) return;

  const socketId = _connections.getSocketId(playerId);
  if (socketId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _io.to(socketId).emit(event as any, data as any);
  }
}

export function emitGameState(gameId: string): void {
  const game = _lobby.getGame(gameId);
  if (!game) return;

  for (const playerId of game.players.keys()) {
    const view = toClientView(game, playerId);
    emitToPlayer(playerId, 'game-state', { game: view });
  }
}

export function broadcastToGame(gameId: string, event: string, data: unknown): void {
  const game = _lobby.getGame(gameId);
  if (!game) return;

  for (const playerId of game.players.keys()) {
    emitToPlayer(playerId, event, data);
  }
}
