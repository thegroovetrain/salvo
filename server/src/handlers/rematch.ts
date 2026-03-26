import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents, QuickPlayMode } from '@salvo/shared';
import { toQuickPlayMode } from '@salvo/shared';
import { getLobby, getConnections, getGuestSessions, getPartyManager, emitToGuest, emitToPlayer } from '../emitters.js';
import {
  removePlayer, placeShips, allShipsPlaced, beginPlaying,
  resetForRematch, toClientView,
} from '../game.js';
import { generatePlacement } from '../ai/index.js';
import { startPlacementTimer, clearPlacementTimer, clearGameTimers } from '../timers/index.js';
import { emitNextTurn } from '../gameFlow.js';
import {
  enqueue, dequeue, dissolveTicket, attemptMatch, isInQueue, getTicketByGuest,
  broadcastOnlineCount,
} from '../queue/index.js';
import { createSoloTicket, createPartyTicket, validateMode } from '../queue/adapter.js';

import type { Game, Player } from '@salvo/shared';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;

// ── Quick Play Rematch ────────────────────────────────────

function requeuePlayersAsTickets(
  io: IO, humanPlayers: Player[], game: Game, qpMode: QuickPlayMode,
  connections: ReturnType<typeof getConnections>,
): void {
  const guestSessions = getGuestSessions();

  for (const p of humanPlayers) {
    const socketId = connections.getSocketId(p.id);
    if (!socketId) continue;

    const playerSocket = io.sockets.sockets.get(socketId);
    if (playerSocket) playerSocket.leave(game.id);

    connections.remove(p.id);

    // Create solo ticket for each player (rematch stays individual per eng review)
    const guestId = guestSessions.getGuestIdBySocket(socketId);
    if (!guestId) continue;

    const ticket = createSoloTicket(guestId, socketId, p.name, qpMode);
    enqueue(ticket);
  }
}

function cleanupAndRequeue(
  io: IO, lobby: ReturnType<typeof getLobby>, game: Game, qpMode: QuickPlayMode,
): void {
  getGuestSessions().unbindAllFromGame(game.id);
  clearGameTimers(game.id);
  lobby.removeGame(game.id);

  broadcastOnlineCount();
  attemptMatch(qpMode);
}

function handleQuickPlayRematch(
  io: IO, game: Game, humanPlayers: Player[],
  lobby: ReturnType<typeof getLobby>,
  connections: ReturnType<typeof getConnections>,
): boolean {
  const qpMode = toQuickPlayMode(game.mode);
  if (!qpMode) return false;

  requeuePlayersAsTickets(io, humanPlayers, game, qpMode, connections);
  cleanupAndRequeue(io, lobby, game, qpMode);
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

// ── Quick Play Queue Helpers ──────────────────────────────

function handlePartyQueue(
  io: IO, socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  guestId: string, trimmedName: string, mode: QuickPlayMode,
): void {
  const guestSessions = getGuestSessions();
  const partyManager = getPartyManager();
  const party = partyManager.getPartyByGuest(guestId);
  if (!party) return;

  if (party.leaderId !== guestId) {
    socket.emit('queue-error', { reason: 'not-leader' as const });
    return;
  }

  if (!validateMode(party.members.size, mode)) {
    socket.emit('queue-error', { reason: 'invalid-mode' as const });
    return;
  }

  const result = createPartyTicket(party, mode, guestSessions, io);
  if (!result.ok) {
    socket.emit('queue-error', { reason: result.reason });
    return;
  }

  enqueue(result.ticket);

  for (const m of party.members.values()) {
    if (m.guestId !== guestId) {
      emitToGuest(m.guestId, 'party-queued', { mode, leaderName: trimmedName });
    }
  }

  attemptMatch(mode);
}

/** Handle queue-switch for a player already in queue. Returns 'proceed' | 'block' | 'duplicate'. */
function handleQueueSwitch(
  guestId: string, mode: QuickPlayMode,
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
): 'proceed' | 'block' | 'duplicate' {
  const existingTicket = isInQueue(guestId) ? getTicketByGuest(guestId) : null;
  if (!existingTicket) return 'proceed';

  if (existingTicket.partyId) {
    socket.emit('queue-error', { reason: 'already-queued' as const });
    return 'block';
  }
  if (existingTicket.mode === mode) return 'duplicate';
  dequeue(existingTicket.id);
  return 'proceed';
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
      const qpMode = toQuickPlayMode(game.mode);
      if (!qpMode) return;
      requeuePlayersAsTickets(io, remainingHumans, game, qpMode, connections);
      cleanupAndRequeue(io, lobby, game, qpMode);
      return;
    }

    handlePrivateDecline(game, decliningName, lobby);
  });

  // ============================================================
  // Quick Play Queue (ticket-based)
  // ============================================================

  socket.on('quickplay-join', ({ playerName, mode }: { playerName: string; mode: QuickPlayMode }) => {
    const validModes: QuickPlayMode[] = ['1v1', '2v2', '3v3', '3ffa', '6ffa', '2v2v2'];
    if (!validModes.includes(mode)) return;

    const trimmedName = playerName?.trim()?.slice(0, 20) ?? '';
    if (!trimmedName) {
      socket.emit('error', { message: 'Enter your name before joining Quick Play' });
      return;
    }

    const guestSessions = getGuestSessions();
    const guestId = guestSessions.getGuestIdBySocket(socket.id);
    if (!guestId) return;

    guestSessions.setName(guestId, trimmedName);

    const switchResult = handleQueueSwitch(guestId, mode, socket);
    if (switchResult === 'block' || switchResult === 'duplicate') return;

    const partyManager = getPartyManager();
    if (partyManager.getPartyByGuest(guestId)) {
      handlePartyQueue(io, socket, guestId, trimmedName, mode);
    } else {
      enqueue(createSoloTicket(guestId, socket.id, trimmedName, mode));
      attemptMatch(mode);
    }
  });

  socket.on('quickplay-leave', () => {
    const guestSessions = getGuestSessions();
    const guestId = guestSessions.getGuestIdBySocket(socket.id);
    if (!guestId) return;

    const ticket = getTicketByGuest(guestId);
    if (!ticket) return;

    // Party ticket: only leader can cancel
    if (ticket.partyId) {
      const partyManager = getPartyManager();
      const party = partyManager.getPartyByGuest(guestId);
      if (party && party.leaderId !== guestId) {
        socket.emit('queue-error', { reason: 'not-leader' as const });
        return;
      }
      dissolveTicket(ticket.id);
    } else {
      dequeue(ticket.id);
    }
  });
}
