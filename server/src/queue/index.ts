import type { QuickPlayMode } from '@salvo/shared';
import { toGameMode, MODE_RINGS } from '@salvo/shared';
import crypto from 'node:crypto';
import { getIO, getLobby, getConnections, getGuestSessions, emitToPlayer } from '../emitters.js';
import type { GuestSessionManager } from '../guestSessions.js';
import { createGame, addPlayer, startGame, toClientView } from '../game.js';
import { assignQuickPlayColors } from '../helpers.js';
import { startPlacementTimer } from '../timers/index.js';

export const queueEntries = new Map<string, { playerName: string; mode: QuickPlayMode }>();

export function getQueueRoomName(mode: QuickPlayMode): string {
  return `quickplay-${mode}`;
}

export function getQueueSize(roomName: string): number {
  return getIO().sockets.adapter.rooms.get(roomName)?.size ?? 0;
}

export function broadcastOnlineCount(): void {
  // Deduplicate by guestId — multi-tab users count as 1
  const guestSessions = getGuestSessions();
  const count = guestSessions
    ? guestSessions.getConnectedGuestCount()
    : getIO().sockets.sockets.size;
  getIO().emit('online-count', { count });
}

export function getTargetSize(mode: QuickPlayMode): number {
  switch (mode) {
    case '1v1': return 2;
    case '2v2': return 4;
    case '3v3': return 6;
    case '3ffa': return 3;
    case '6ffa': return 6;
    case '2v2v2': return 6;
  }
}

export function isTeamMode(mode: QuickPlayMode): boolean {
  return mode === '2v2' || mode === '3v3' || mode === '2v2v2';
}

import type { Game } from '@salvo/shared';

type IO = ReturnType<typeof getIO>;

function moveSocketToGame(io: IO, socketId: string, roomName: string, gameId: string): void {
  const playerSocket = io.sockets.sockets.get(socketId);
  if (playerSocket) {
    playerSocket.leave(roomName);
    playerSocket.join(gameId);
  }
}

function bindGuestToGame(guestSessions: GuestSessionManager, socketId: string, playerId: string, gameId: string, playerName: string): void {
  const guestId = guestSessions.getGuestIdBySocket(socketId);
  if (guestId) {
    guestSessions.bindToGame(guestId, playerId, gameId);
    guestSessions.setName(guestId, playerName);
  }
}

function addMatchedPlayers(
  io: IO, matchedSocketIds: string[], game: Game, roomName: string,
): string[] {
  const lobby = getLobby();
  const connections = getConnections();
  const guestSessions = getGuestSessions();
  const allPlayerIds: string[] = [];

  for (let i = 1; i < matchedSocketIds.length; i++) {
    const sid = matchedSocketIds[i];
    const entry = queueEntries.get(sid);
    const playerName = entry?.playerName ?? 'Player';
    const playerId = crypto.randomUUID();
    addPlayer(game, playerId, playerName);
    lobby.registerPlayer(playerId, game.id);
    connections.register(playerId, sid, game.id);
    bindGuestToGame(guestSessions, sid, playerId, game.id, playerName);
    moveSocketToGame(io, sid, roomName, game.id);
    queueEntries.delete(sid);
    io.to(sid).emit('quickplay-matched', { playerId, gameId: game.id });
    allPlayerIds.push(playerId);
  }

  return allPlayerIds;
}

const TEAM_LAYOUTS: Record<string, { teams: string[]; perTeam: number }> = {
  '2v2':   { teams: ['alpha', 'bravo'], perTeam: 2 },
  '3v3':   { teams: ['alpha', 'bravo'], perTeam: 3 },
  '2v2v2': { teams: ['alpha', 'bravo', 'charlie'], perTeam: 2 },
};

function assignTeams(game: Game, playerIds: string[], mode: QuickPlayMode): void {
  if (!isTeamMode(mode)) return;

  // Shuffle for random team assignment
  for (let i = playerIds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [playerIds[i], playerIds[j]] = [playerIds[j], playerIds[i]];
  }

  game.teamsEnabled = true;
  const layout = TEAM_LAYOUTS[mode];
  let idx = 0;
  for (const team of layout.teams) {
    for (let j = 0; j < layout.perTeam; j++) {
      game.teams.set(playerIds[idx++], team);
    }
  }
}

/** Try to create a match from players in a queue room. Called from join handler and requeue. */
export function tryMatchRoom(roomName: string, mode: QuickPlayMode): void {
  const io = getIO();
  const lobby = getLobby();
  const connections = getConnections();

  const target = getTargetSize(mode);
  if (getQueueSize(roomName) < target) return;

  const roomSockets = io.sockets.adapter.rooms.get(roomName);
  if (!roomSockets) return;

  const matchedSocketIds = [...roomSockets].slice(0, target);
  const gameMode = toGameMode(mode);

  const guestSessions = getGuestSessions();
  const firstEntry = queueEntries.get(matchedSocketIds[0]);
  const hostName = firstEntry?.playerName ?? 'Player';
  const hostId = crypto.randomUUID();
  const game = createGame(
    hostId, hostName,
    { enabled: true, seconds: 60 }, gameMode, isTeamMode(mode), MODE_RINGS[gameMode],
  );

  const code = lobby.generateUniqueCode();
  lobby.addGame(game, code);
  lobby.registerPlayer(hostId, game.id);
  connections.register(hostId, matchedSocketIds[0], game.id);
  bindGuestToGame(guestSessions, matchedSocketIds[0], hostId, game.id, hostName);
  moveSocketToGame(io, matchedSocketIds[0], roomName, game.id);
  queueEntries.delete(matchedSocketIds[0]);
  io.to(matchedSocketIds[0]).emit('quickplay-matched', { playerId: hostId, gameId: game.id });

  const otherPlayerIds = addMatchedPlayers(io, matchedSocketIds, game, roomName);
  const allPlayerIds = [hostId, ...otherPlayerIds];

  assignTeams(game, allPlayerIds, mode);
  assignQuickPlayColors(game, mode);
  startGame(game);

  const qpPlacementDeadline = game.timerConfig.enabled
    ? Date.now() + game.timerConfig.seconds * 1000
    : undefined;
  for (const pid of game.players.keys()) {
    emitToPlayer(pid, 'placement-phase', { game: toClientView(game, pid), placementDeadline: qpPlacementDeadline });
  }

  startPlacementTimer(game.id);
  broadcastOnlineCount();
}
