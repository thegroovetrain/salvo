import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@salvo/shared';
import { getLobby, getConnections, getGuestSessions, getPartyManager, emitToPlayer } from '../emitters.js';
import {
  removePlayer, placeShips, allShipsPlaced, beginPlaying,
  resetForRematch, toClientView,
} from '../game.js';
import { generatePlacement } from '../ai/index.js';
import { startPlacementTimer, clearPlacementTimer, clearGameTimers } from '../timers/index.js';
import { emitNextTurn } from '../gameFlow.js';
import {
  enqueue, dequeue, attemptMatch, isInQueue, getTicketByGuest,
  broadcastOnlineCount,
} from '../queue/index.js';
import { createSoloTicket } from '../queue/adapter.js';

import type { Game, Player } from '@salvo/shared';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;

// ── Quick Play Rematch ────────────────────────────────────

function requeuePlayersAsTickets(
  io: IO, humanPlayers: Player[], game: Game,
  connections: ReturnType<typeof getConnections>,
): void {
  const guestSessions = getGuestSessions();

  for (const p of humanPlayers) {
    const socketId = connections.getSocketId(p.id);
    if (!socketId) continue;

    const playerSocket = io.sockets.sockets.get(socketId);
    if (playerSocket) playerSocket.leave(game.id);

    connections.remove(p.id);

    const guestId = guestSessions.getGuestIdBySocket(socketId);
    if (!guestId) continue;

    const ticket = createSoloTicket(guestId, socketId, p.name);
    enqueue(ticket);
  }
}

function cleanupAndRequeue(
  io: IO, lobby: ReturnType<typeof getLobby>, game: Game,
): void {
  getGuestSessions().unbindAllFromGame(game.id);
  clearGameTimers(game.id);
  lobby.removeGame(game.id);

  broadcastOnlineCount();
  attemptMatch();
}

function handleQuickPlayRematch(
  io: IO, game: Game, humanPlayers: Player[],
  lobby: ReturnType<typeof getLobby>,
  connections: ReturnType<typeof getConnections>,
): boolean {
  if (game.mode === 'private') return false;

  requeuePlayersAsTickets(io, humanPlayers, game, connections);
  cleanupAndRequeue(io, lobby, game);
  return true;
}

// ── Private Rematch (unchanged) ───────────────────────────

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

// ── Handler Registration ──────────────────────────────────

export function registerRematchHandlers(io: IO, socket: Socket<ClientToServerEvents, ServerToClientEvents>): void {
  const lobby = getLobby();
  const connections = getConnections();

  // ── Rematch ────────────────────────────────────────────

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
      requeuePlayersAsTickets(io, remainingHumans, game, connections);
      cleanupAndRequeue(io, lobby, game);
      return;
    }

    handlePrivateDecline(game, decliningName, lobby);
  });

  // ============================================================
  // Quick Play Queue (ticket-based, 6-player FFA only)
  // ============================================================

  socket.on('quickplay-join', ({ playerName }: { playerName: string }) => {
    const trimmedName = playerName?.trim()?.slice(0, 20) ?? '';
    if (!trimmedName) {
      socket.emit('error', { message: 'Enter your name before joining Quick Play' });
      return;
    }

    const guestSessions = getGuestSessions();
    const guestId = guestSessions.getGuestIdBySocket(socket.id);
    if (!guestId) return;

    guestSessions.setName(guestId, trimmedName);

    // Block players in a party from Quick Play
    const partyManager = getPartyManager();
    if (partyManager.getPartyByGuest(guestId)) {
      socket.emit('queue-error', { reason: 'in-party' as const });
      return;
    }

    // If already in queue, ignore duplicate
    if (isInQueue(guestId)) {
      return;
    }

    enqueue(createSoloTicket(guestId, socket.id, trimmedName));
    attemptMatch();
  });

  socket.on('quickplay-leave', () => {
    const guestSessions = getGuestSessions();
    const guestId = guestSessions.getGuestIdBySocket(socket.id);
    if (!guestId) return;

    const ticket = getTicketByGuest(guestId);
    if (!ticket) return;

    dequeue(ticket.id);
  });
}
