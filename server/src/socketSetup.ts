import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents, Game } from '@salvo/shared';
import { playerShotCount } from '@salvo/shared';
import { getCurrentTurnPlayerId, toClientView } from './game.js';
import { getLobbyCapabilities } from './capabilities.js';
import { getConnections, getLobby, getGuestSessions, getPartyManager, broadcastToGame, emitToGuest, emitGameState } from './emitters.js';
import {
  clearTurnTimer, startTurnTimer,
  startDisconnectSkipTimer, clearDisconnectSkipTimer,
  startAllDisconnectedTimer, clearAllDisconnectedTimer,
  registerGameCleanup,
} from './timers/index.js';
import { isInQueue, getTicketByGuest, dissolveTicket, migrateTicketSocket, broadcastOnlineCount } from './queue/index.js';
import {
  registerLobbyHandlers,
  registerPlayingHandlers,
  registerSocialHandlers,
  registerConnectionHandlers,
  registerRematchHandlers,
  registerPartyHandlers,
} from './handlers/index.js';
import { isValidGuestId } from './guestSessions.js';
import crypto from 'node:crypto';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;
type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

// ============================================================
// Connection Flow
//
//   1. Client connects with auth: { guestId }
//   2. Validate guestId (generate if missing/invalid)
//   3. GuestSessionManager.handleConnect() — evict old socket if needed
//   4. If active game → auto-reattach (fresh game-state snapshot)
//   5. If party member → party auto-reattach (snapshot-on-reconnect)
//   6. If no game/party → normal fresh connection
//
// Disconnect Flow
//
//   1. Party disconnect (if in party and not eviction)
//   2. GuestSessionManager.handleDisconnect() — keep session
//   3. ConnectionManager.handleDisconnect() — mark disconnected
//   4. If their turn: start turn timer (timed) or skip timer (untimed)
//   5. If all players DC: start 30s all-disconnected timer
// ============================================================

function handleEviction(io: IO, evictedSocketId: string, newSocketId: string): void {
  const evictedSocket = io.sockets.sockets.get(evictedSocketId);
  const connections = getConnections();

  // Mark the evicted socket as disconnected in ConnectionManager BEFORE
  // disconnecting it. This prevents handleReconnect() and disconnect handler
  // from corrupting the new connection's state.
  connections.handleDisconnect(evictedSocketId);

  // Migrate queue ticket BEFORE disconnecting old socket (prevents TOCTOU race)
  const evictedGuestId = getGuestSessions().getGuestIdBySocket(evictedSocketId);
  if (evictedGuestId && isInQueue(evictedGuestId)) {
    migrateTicketSocket(evictedGuestId, newSocketId);
  }

  if (evictedSocket) {
    evictedSocket.emit('tab-evicted');
    evictedSocket.disconnect(true);
  }
}

function resumeIfOnTurn(socket: TypedSocket, game: Game, playerId: string): void {
  if (game.phase !== 'playing' || getCurrentTurnPlayerId(game) !== playerId) return;
  clearDisconnectSkipTimer(playerId);
  clearTurnTimer(game.id);
  const p = game.players.get(playerId)!;
  socket.emit('your-turn', {
    shotCount: playerShotCount(p),
    timerSeconds: game.timerConfig.enabled ? game.timerConfig.seconds : null,
  });
  startTurnTimer(game.id);
}

function autoReattach(io: IO, socket: TypedSocket, playerId: string, gameId: string): void {
  const connections = getConnections();
  const lobby = getLobby();
  const game = lobby.getGame(gameId);

  if (!game) {
    socket.emit('error', { message: 'Game no longer available' });
    return;
  }

  const result = connections.handleReconnect(playerId, socket.id);
  if (!result) {
    socket.emit('error', { message: 'Game no longer available' });
    getGuestSessions().unbindFromGame(
      getGuestSessions().getGuestIdBySocket(socket.id) ?? ''
    );
    return;
  }

  socket.join(gameId);
  clearAllDisconnectedTimer(gameId);
  // Only cancel host transfer if the reconnecting player IS the host
  if (game.hostId === playerId) clearHostTransferTimer(gameId);

  const code = lobby.getCodeForGame(gameId) ?? '';
  socket.emit('game-created', { code, playerId, gameId });

  const capabilities = game.phase === 'lobby'
    ? getLobbyCapabilities(game, playerId)
    : undefined;
  socket.emit('game-state', { game: toClientView(game, playerId), capabilities });

  for (const buffered of result.bufferedEvents) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    socket.emit(buffered.event as any, buffered.data as any);
  }

  const player = game.players.get(playerId);
  if (player) {
    broadcastToGame(gameId, 'player-reconnected', { playerId, playerName: player.name });
  }

  resumeIfOnTurn(socket, game, playerId);
}

/** Restore party state on reconnect (snapshot-on-reconnect pattern). */
function partyAutoReattach(socket: TypedSocket, guestId: string): void {
  const partyManager = getPartyManager();
  const session = getGuestSessions().getSession(guestId);
  if (!session?.partyId) return;

  const result = partyManager.handleReconnect(guestId);
  if (!result) return;

  const payload = partyManager.toPayload(result.party);
  socket.emit('party-joined', payload);
  broadcastToParty(result.party, 'party-updated', payload, guestId);

  if (result.wasLeader) {
    broadcastToParty(result.party, 'party-leader-reconnected', undefined, guestId);
  }
}

/** Broadcast an event to all party members except one. */
function broadcastToParty(party: { members: Map<string, { guestId: string }> }, event: string, data: unknown, excludeGuestId: string): void {
  for (const member of party.members.values()) {
    if (member.guestId !== excludeGuestId) {
      emitToGuest(member.guestId, event, data);
    }
  }
}

/** Handle party member disconnect. Skips eviction (not a real disconnect). */
function handlePartyDisconnect(socketId: string, guestId: string): void {
  const session = getGuestSessions().getSession(guestId);
  if (!session?.partyId) return;

  // Eviction check: if session already has a different socketId, this is eviction
  if (session.socketId !== null && session.socketId !== socketId) return;

  const partyManager = getPartyManager();
  try {
    const result = partyManager.handleDisconnect(guestId);
    if (!result) return;

    if (result.wasLeader) {
      broadcastToParty(result.party, 'party-leader-disconnected', undefined, guestId);
    }
    broadcastToParty(result.party, 'party-updated', partyManager.toPayload(result.party), guestId);
  } catch (err) {
    console.error('[party] disconnect handler failed, force-destroying party', err);
    partyManager.forceDestroyByGuest(guestId);
  }
}

// Host transfer timers for lobby disconnect
const hostTransferTimers = new Map<string, NodeJS.Timeout>();

function scheduleHostTransfer(game: Game, disconnectedHostId: string): void {
  if (hostTransferTimers.has(game.id)) return;

  const timer = setTimeout(() => {
    hostTransferTimers.delete(game.id);
    if (game.hostId !== disconnectedHostId) return; // already transferred
    if (game.phase !== 'lobby') return;

    // Find longest-tenured human player
    for (const p of game.players.values()) {
      if (!p.isBot && p.id !== disconnectedHostId) {
        game.hostId = p.id;
        emitGameState(game.id);
        break;
      }
    }
  }, 10_000);

  hostTransferTimers.set(game.id, timer);
}

export function clearHostTransferTimer(gameId: string): void {
  const timer = hostTransferTimers.get(gameId);
  if (timer) {
    clearTimeout(timer);
    hostTransferTimers.delete(gameId);
  }
}

// Register host transfer cleanup with game timer system
registerGameCleanup(clearHostTransferTimer);

function handleTurnDisconnect(game: Game, playerId: string): void {
  if (game.phase !== 'playing' || getCurrentTurnPlayerId(game) !== playerId) return;
  clearTurnTimer(game.id);
  if (game.timerConfig.enabled) {
    startTurnTimer(game.id);
  } else {
    startDisconnectSkipTimer(game.id, playerId);
  }
}

/** Handle game disconnect: turn timers, all-disconnected check, host transfer. */
function handleGameDisconnect(socketId: string): void {
  const connections = getConnections();
  const lobby = getLobby();
  const guestSessions = getGuestSessions();
  const result = connections.handleDisconnect(socketId);
  if (!result) return;

  const game = lobby.getGame(result.gameId);
  if (!game) return;

  const player = game.players.get(result.playerId);
  broadcastToGame(result.gameId, 'player-disconnected', {
    playerId: result.playerId,
    playerName: player?.name ?? 'Unknown',
  });

  if (game.phase === 'lobby' && game.hostId === result.playerId) {
    scheduleHostTransfer(game, result.playerId);
  }

  handleTurnDisconnect(game, result.playerId);

  if (guestSessions.areAllDisconnected(game.id)) {
    startAllDisconnectedTimer(game.id);
  }
}

export function setupSocket(io: IO): void {
  io.on('connection', (socket) => {
    const guestSessions = getGuestSessions();

    // ── Step 1: Resolve guestId ──
    let guestId = socket.handshake.auth?.guestId;
    if (!isValidGuestId(guestId)) {
      guestId = crypto.randomUUID();
      socket.emit('guest-id-assigned', { guestId });
    }

    // ── Step 2: Register guest session (evict old socket if needed) ──
    const { evictedSocketId, activeGame } = guestSessions.handleConnect(guestId, socket.id);

    if (evictedSocketId) {
      handleEviction(io, evictedSocketId, socket.id);
    }

    // ── Step 3: Auto-reattach game state ──
    if (activeGame) {
      autoReattach(io, socket, activeGame.playerId, activeGame.gameId);
    }

    // ── Step 4: Party auto-reattach (snapshot-on-reconnect) ──
    partyAutoReattach(socket, guestId);

    // Broadcast updated online count
    process.nextTick(() => broadcastOnlineCount());

    // ── Register event handlers ──
    registerLobbyHandlers(io, socket);
    registerPlayingHandlers(io, socket);
    registerSocialHandlers(io, socket);
    registerConnectionHandlers(io, socket);
    registerRematchHandlers(io, socket);
    registerPartyHandlers(io, socket);

    // ── Handle disconnect ──
    socket.on('disconnect', () => {
      // Party disconnect (before guest session clears socketId)
      const dcGuestId = guestSessions.getGuestIdBySocket(socket.id);
      if (dcGuestId) {
        handlePartyDisconnect(socket.id, dcGuestId);
      }

      // Update guest session (keep session, clear socket)
      guestSessions.handleDisconnect(socket.id);

      // Clean up queue state: dissolve entire ticket on any member DC
      if (dcGuestId && isInQueue(dcGuestId)) {
        const ticket = getTicketByGuest(dcGuestId);
        if (ticket) {
          dissolveTicket(ticket.id);
        }
      }

      // Game disconnect
      handleGameDisconnect(socket.id);

      // Update online count for remaining clients
      broadcastOnlineCount();
    });
  });
}
