import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@salvo/shared';
import { playerShotCount } from '@salvo/shared';
import { getCurrentTurnPlayerId, toClientView } from './game.js';
import { getConnections, getLobby, getGuestSessions, getPartyManager, broadcastToGame, emitToGuest } from './emitters.js';
import {
  clearTurnTimer, startTurnTimer,
  startDisconnectSkipTimer, clearDisconnectSkipTimer,
  startAllDisconnectedTimer, clearAllDisconnectedTimer,
} from './timers/index.js';
import { queueEntries, getQueueRoomName, getQueueSize, broadcastOnlineCount } from './queue/index.js';
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

  // Migrate queue entry BEFORE disconnecting old socket (prevents TOCTOU race)
  const queueEntry = queueEntries.get(evictedSocketId);
  if (queueEntry) {
    queueEntries.delete(evictedSocketId);
    queueEntries.set(newSocketId, queueEntry);
    const newSocket = io.sockets.sockets.get(newSocketId);
    const roomName = getQueueRoomName(queueEntry.mode);
    if (newSocket) {
      newSocket.join(roomName);
    }
  }

  if (evictedSocket) {
    evictedSocket.emit('tab-evicted');
    evictedSocket.disconnect(true);
  }
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

  const code = lobby.getCodeForGame(gameId) ?? '';
  socket.emit('game-created', { code, playerId, gameId });
  socket.emit('game-state', { game: toClientView(game, playerId) });

  for (const buffered of result.bufferedEvents) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    socket.emit(buffered.event as any, buffered.data as any);
  }

  const player = game.players.get(playerId);
  if (player) {
    broadcastToGame(gameId, 'player-reconnected', {
      playerId,
      playerName: player.name,
    });
  }

  if (game.phase === 'playing' && getCurrentTurnPlayerId(game) === playerId) {
    clearDisconnectSkipTimer(playerId);
    clearTurnTimer(gameId);
    const p = game.players.get(playerId)!;
    socket.emit('your-turn', {
      shotCount: playerShotCount(p),
      timerSeconds: game.timerConfig.enabled ? game.timerConfig.seconds : null,
    });
    startTurnTimer(gameId);
  }
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

/** Handle game disconnect: turn timers, all-disconnected check. */
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

  if (game.phase === 'playing' && getCurrentTurnPlayerId(game) === result.playerId) {
    clearTurnTimer(game.id);
    if (game.timerConfig.enabled) {
      startTurnTimer(game.id);
    } else {
      startDisconnectSkipTimer(game.id, result.playerId);
    }
  }

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

      // Clean up queue state
      const queueEntry = queueEntries.get(socket.id);
      if (queueEntry) {
        const roomName = getQueueRoomName(queueEntry.mode);
        queueEntries.delete(socket.id);
        const size = getQueueSize(roomName);
        io.to(roomName).emit('quickplay-queue-update', { size });
      }

      // Game disconnect
      handleGameDisconnect(socket.id);

      // Update online count for remaining clients
      broadcastOnlineCount();
    });
  });
}
