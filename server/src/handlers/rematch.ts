import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents, QuickPlayMode } from '@salvo/shared';
import { toQuickPlayMode } from '@salvo/shared';
import { getLobby, getConnections, getGuestSessions, emitToPlayer } from '../emitters.js';
import {
  removePlayer, placeShips, allShipsPlaced, beginPlaying,
  resetForRematch, toClientView,
} from '../game.js';
import { generatePlacement } from '../ai/index.js';
import { startPlacementTimer, clearPlacementTimer, clearGameTimers } from '../timers/index.js';
import { emitNextTurn } from '../gameFlow.js';
import { queueEntries, getQueueRoomName, getQueueSize, broadcastOnlineCount, tryMatchRoom } from '../queue/index.js';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;

import type { Game, Player } from '@salvo/shared';

function requeuePlayersToRoom(
  io: IO, humanPlayers: Player[], game: Game, qpMode: QuickPlayMode,
  connections: ReturnType<typeof getConnections>,
): void {
  const roomName = getQueueRoomName(qpMode);
  for (const p of humanPlayers) {
    const socketId = connections.getSocketId(p.id);
    if (!socketId) continue;

    const playerSocket = io.sockets.sockets.get(socketId);
    if (playerSocket) {
      playerSocket.leave(game.id);
      playerSocket.join(roomName);
    }
    queueEntries.set(socketId, { playerName: p.name, mode: qpMode });
    connections.remove(p.id);
  }
}

function cleanupAndRequeue(
  io: IO, lobby: ReturnType<typeof getLobby>, game: Game, qpMode: QuickPlayMode,
): void {
  const roomName = getQueueRoomName(qpMode);
  getGuestSessions().unbindAllFromGame(game.id);
  clearGameTimers(game.id);
  lobby.removeGame(game.id);

  const size = getQueueSize(roomName);
  io.to(roomName).emit('quickplay-queue-update', { size });
  broadcastOnlineCount();
  tryMatchRoom(roomName, qpMode);
}

function handleQuickPlayRematch(
  io: IO, game: Game, humanPlayers: Player[],
  lobby: ReturnType<typeof getLobby>,
  connections: ReturnType<typeof getConnections>,
): boolean {
  const qpMode = toQuickPlayMode(game.mode);
  if (!qpMode) return false;

  requeuePlayersToRoom(io, humanPlayers, game, qpMode, connections);
  cleanupAndRequeue(io, lobby, game, qpMode);
  return true;
}

function autoPlaceBotShips(game: Game): void {
  for (const p of game.players.values()) {
    if (p.isBot && p.aiDifficulty) {
      const placement = generatePlacement(p.aiDifficulty, game.rings, game.islands);
      placeShips(game, p.id, placement);
    }
  }
}

function broadcastToHumans(game: Game, event: string, viewBuilder: (pid: string) => unknown): void {
  for (const pid of game.players.keys()) {
    if (!game.players.get(pid)?.isBot) {
      emitToPlayer(pid, event, viewBuilder(pid));
    }
  }
}

function handlePrivateRematch(game: Game): void {
  resetForRematch(game);
  autoPlaceBotShips(game);

  const rematchPlacementDeadline = game.timerConfig.enabled
    ? Date.now() + game.timerConfig.seconds * 1000
    : undefined;
  broadcastToHumans(game, 'rematch-starting', (pid) => ({ game: toClientView(game, pid), placementDeadline: rematchPlacementDeadline }));

  if (game.timerConfig.enabled) {
    startPlacementTimer(game.id);
  }

  if (allShipsPlaced(game)) {
    clearPlacementTimer(game.id);
    beginPlaying(game);
    broadcastToHumans(game, 'all-ready', (pid) => ({ game: toClientView(game, pid) }));
    emitNextTurn(game.id);
  }
}

function handlePrivateDecline(
  game: Game, decliningName: string,
  lobby: ReturnType<typeof getLobby>,
): void {
  game.phase = 'lobby';
  game.shots = new Set();
  game.turnOrder = [];
  game.currentTurnIndex = 0;
  game.rematchAccepted = new Set();
  for (const p of game.players.values()) {
    p.ships = [];
  }

  const newCode = lobby.generateUniqueCode();
  const oldCode = lobby.getCodeForGame(game.id);
  if (oldCode) {
    clearGameTimers(game.id);
    lobby.removeGame(game.id);
    lobby.addGame(game, newCode);
    for (const pid of game.players.keys()) {
      lobby.registerPlayer(pid, game.id);
    }
  }

  broadcastToHumans(game, 'rematch-declined', (pid) => ({
    playerName: decliningName,
    code: newCode,
    game: toClientView(game, pid),
  }));

  game.lastActivity = Date.now();
}

export function registerRematchHandlers(io: IO, socket: Socket<ClientToServerEvents, ServerToClientEvents>): void {
  const lobby = getLobby();
  const connections = getConnections();

  socket.on('rematch-request', () => {
    const playerId = connections.getPlayerIdBySocket(socket.id);
    if (!playerId) return;

    const game = lobby.getGameByPlayer(playerId);
    if (!game || game.phase !== 'finished') return;

    game.rematchAccepted.add(playerId);
    for (const p of game.players.values()) {
      if (p.isBot) game.rematchAccepted.add(p.id);
    }

    const humanPlayers = [...game.players.values()].filter(p => !p.isBot);
    const allAccepted = humanPlayers.every(p => game.rematchAccepted.has(p.id));

    if (!allAccepted) {
      for (const p of humanPlayers) {
        emitToPlayer(p.id, 'rematch-pending', {
          acceptedIds: [...game.rematchAccepted],
          totalHumans: humanPlayers.length,
        });
      }
      return;
    }

    if (game.mode !== 'private') {
      handleQuickPlayRematch(io, game, humanPlayers, lobby, connections);
      return;
    }

    handlePrivateRematch(game);
  });

  socket.on('rematch-decline', () => {
    const playerId = connections.getPlayerIdBySocket(socket.id);
    if (!playerId) return;

    const game = lobby.getGameByPlayer(playerId);
    if (!game || game.phase !== 'finished') return;

    const decliningPlayer = game.players.get(playerId);
    const decliningName = decliningPlayer?.name ?? 'Unknown';

    // Unbind declining player's guest session
    const guestId = getGuestSessions().getGuestIdBySocket(socket.id);
    if (guestId) getGuestSessions().unbindFromGame(guestId);

    removePlayer(game, playerId);
    lobby.registerPlayer(playerId, '');
    connections.remove(playerId);

    const remainingHumans = [...game.players.values()].filter(p => !p.isBot);
    if (remainingHumans.length === 0) {
      getGuestSessions().unbindAllFromGame(game.id);
      clearGameTimers(game.id);
      lobby.removeGame(game.id);
      broadcastOnlineCount();
      return;
    }

    if (game.mode !== 'private') {
      const qpMode = toQuickPlayMode(game.mode);
      if (!qpMode) return;
      requeuePlayersToRoom(io, remainingHumans, game, qpMode, connections);
      cleanupAndRequeue(io, lobby, game, qpMode);
      return;
    }

    handlePrivateDecline(game, decliningName, lobby);
  });

  // ============================================================
  // Quick Play Queue
  // ============================================================

  socket.on('quickplay-join', ({ playerName, mode }: { playerName: string; mode: QuickPlayMode }) => {
    // Validate mode
    const validModes: QuickPlayMode[] = ['1v1', '2v2', '3v3', '3ffa', '6ffa', '2v2v2'];
    if (!validModes.includes(mode)) return;

    const trimmedName = playerName?.trim()?.slice(0, 20) ?? '';
    if (!trimmedName) {
      socket.emit('error', { message: 'Enter your name before joining Quick Play' });
      return;
    }

    // Queue switch: if already in a different queue, leave it first
    const existing = queueEntries.get(socket.id);
    if (existing) {
      if (existing.mode === mode) return; // already in this queue
      const oldRoom = getQueueRoomName(existing.mode);
      socket.leave(oldRoom);
      queueEntries.delete(socket.id);
      const oldSize = getQueueSize(oldRoom);
      io.to(oldRoom).emit('quickplay-queue-update', { size: oldSize });
    }

    const roomName = getQueueRoomName(mode);
    socket.join(roomName);
    queueEntries.set(socket.id, { playerName: trimmedName, mode });

    // Broadcast queue size to room members
    const size = getQueueSize(roomName);
    io.to(roomName).emit('quickplay-queue-update', { size });
    broadcastOnlineCount();

    // Check if match is ready
    tryMatchRoom(roomName, mode);
  });

  socket.on('quickplay-leave', () => {
    const entry = queueEntries.get(socket.id);
    if (!entry) return;

    const roomName = getQueueRoomName(entry.mode);
    socket.leave(roomName);
    queueEntries.delete(socket.id);

    const size = getQueueSize(roomName);
    io.to(roomName).emit('quickplay-queue-update', { size });
    broadcastOnlineCount();
  });
}
