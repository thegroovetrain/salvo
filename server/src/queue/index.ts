// ============================================================
// Queue Orchestrator — Ticket-based matchmaking
//
// Single source of truth: tickets Map + guestToTicket reverse index.
// Socket.IO rooms are used ONLY for event broadcasting.
// Quick Play is always 6-player FFA.
//
//   tickets: Map<ticketId, QueueTicket>
//   guestToTicket: Map<guestId, ticketId>   (reverse index for O(1) DC/eviction)
//   ticketQueue: string[]                   (FIFO ordering)
// ============================================================

import { MODE_RINGS } from '@salvo/shared';
import crypto from 'node:crypto';
import { getIO, getLobby, getConnections, getGuestSessions, emitToPlayer } from '../emitters.js';
import type { GuestSessionManager } from '../guestSessions.js';
import { createGame, addPlayer, startGame, toClientView } from '../game.js';
import { assignQuickPlayColors } from '../helpers.js';
import { startPlacementTimer } from '../timers/index.js';
import type { QueueTicket } from './types.js';
import { tryMatch, getTargetSize } from './matcher.js';

// ── State ─────────────────────────────────────────────────

const tickets = new Map<string, QueueTicket>();
const guestToTicket = new Map<string, string>();
const ticketQueue: string[] = [];

// ── Public API ────────────────────────────────────────────

export { getTargetSize } from './matcher.js';

export function getQueueRoomName(): string {
  return 'quickplay-queue';
}

export function getQueueSize(): { size: number; ticketCount: number } {
  let size = 0;
  for (const id of ticketQueue) {
    const t = tickets.get(id);
    if (t) size += t.members.length;
  }
  return { size, ticketCount: ticketQueue.length };
}

export function broadcastOnlineCount(): void {
  const guestSessions = getGuestSessions();
  const count = guestSessions
    ? guestSessions.getConnectedGuestCount()
    : getIO().sockets.sockets.size;
  getIO().emit('online-count', { count });
}

/** Check if a guest is currently in a queue ticket. */
export function isInQueue(guestId: string): boolean {
  return guestToTicket.has(guestId);
}

/** Get a ticket by guestId (reverse index lookup). */
export function getTicketByGuest(guestId: string): QueueTicket | undefined {
  const ticketId = guestToTicket.get(guestId);
  if (!ticketId) return undefined;
  return tickets.get(ticketId);
}

// ── Enqueue / Dequeue ─────────────────────────────────────

export function enqueue(ticket: QueueTicket): void {
  const io = getIO();
  const roomName = getQueueRoomName();

  // Store ticket
  tickets.set(ticket.id, ticket);
  for (const m of ticket.members) {
    guestToTicket.set(m.guestId, ticket.id);
  }

  // Maintain FIFO ordering
  ticketQueue.push(ticket.id);

  // Join all member sockets to the broadcast room
  for (const m of ticket.members) {
    const s = io.sockets.sockets.get(m.socketId);
    if (s) s.join(roomName);
  }

  console.log(`[queue] enqueue ticket=${ticket.id} size=${ticket.members.length}`);

  broadcastQueueUpdate();
  broadcastOnlineCount();
}

export function dequeue(ticketId: string): QueueTicket | undefined {
  const ticket = tickets.get(ticketId);
  if (!ticket) return undefined;

  const io = getIO();
  const roomName = getQueueRoomName();

  // Remove from state
  tickets.delete(ticketId);
  for (const m of ticket.members) {
    guestToTicket.delete(m.guestId);
  }

  // Remove from FIFO ordering
  const idx = ticketQueue.indexOf(ticketId);
  if (idx !== -1) ticketQueue.splice(idx, 1);

  // Leave broadcast room
  for (const m of ticket.members) {
    const s = io.sockets.sockets.get(m.socketId);
    if (s) s.leave(roomName);
  }

  console.log(`[queue] dequeue ticket=${ticket.id} reason=removed`);

  broadcastQueueUpdate();
  broadcastOnlineCount();

  return ticket;
}

/**
 * Dissolve a ticket (dequeue wrapper for consistency with existing callers).
 */
export function dissolveTicket(ticketId: string): void {
  dequeue(ticketId);
}

// ── Matching ──────────────────────────────────────────────

export function attemptMatch(): void {
  const target = getTargetSize();
  if (ticketQueue.length === 0) return;

  // Build ordered ticket array
  const orderedTickets: QueueTicket[] = [];
  for (const id of ticketQueue) {
    const t = tickets.get(id);
    if (t) orderedTickets.push(t);
  }

  const matched = tryMatch(orderedTickets, target);
  if (!matched) return;

  createMatchFromTickets(matched);
}

function addTicketMembersToGame(
  matchedTickets: QueueTicket[], hostId: string, game: ReturnType<typeof createGame>, roomName: string,
): void {
  const io = getIO();
  const lobby = getLobby();
  const connections = getConnections();
  const guestSessions = getGuestSessions();
  let isFirst = true;

  for (const ticket of matchedTickets) {
    for (const member of ticket.members) {
      const playerId = isFirst ? hostId : crypto.randomUUID();
      isFirst = false;

      if (playerId !== hostId) addPlayer(game, playerId, member.playerName);

      lobby.registerPlayer(playerId, game.id);
      connections.register(playerId, member.socketId, game.id);
      bindGuestToGame(guestSessions, member.socketId, playerId, game.id, member.playerName);
      moveSocketToGame(io, member.socketId, roomName, game.id);
      io.to(member.socketId).emit('quickplay-matched', { playerId, gameId: game.id });
    }
  }
}

function removeMatchedTickets(matchedTickets: QueueTicket[]): void {
  for (const ticket of matchedTickets) {
    tickets.delete(ticket.id);
    for (const m of ticket.members) guestToTicket.delete(m.guestId);
    const idx = ticketQueue.indexOf(ticket.id);
    if (idx !== -1) ticketQueue.splice(idx, 1);
  }
}

function createMatchFromTickets(matchedTickets: QueueTicket[]): void {
  const roomName = getQueueRoomName();

  const firstMember = matchedTickets[0].members[0];
  const hostId = crypto.randomUUID();
  const game = createGame(
    hostId, firstMember.playerName,
    { enabled: true, seconds: 60 }, 'quickplay', false, MODE_RINGS['quickplay'],
  );

  const lobby = getLobby();
  const code = lobby.generateUniqueCode();
  lobby.addGame(game, code);

  addTicketMembersToGame(matchedTickets, hostId, game, roomName);
  removeMatchedTickets(matchedTickets);

  assignQuickPlayColors(game);
  startGame(game);

  const qpPlacementDeadline = game.timerConfig.enabled
    ? Date.now() + game.timerConfig.seconds * 1000
    : undefined;
  for (const pid of game.players.keys()) {
    emitToPlayer(pid, 'placement-phase', { game: toClientView(game, pid), placementDeadline: qpPlacementDeadline });
  }

  startPlacementTimer(game.id);

  console.log(`[queue] match created game=${game.id} tickets=${matchedTickets.length} players=${game.players.size}`);

  broadcastQueueUpdate();
  broadcastOnlineCount();
}

// ── Tab Eviction Migration ────────────────────────────────

/** Update a ticket member's socketId after tab eviction. */
export function migrateTicketSocket(guestId: string, newSocketId: string): void {
  const ticketId = guestToTicket.get(guestId);
  if (!ticketId) return;

  const ticket = tickets.get(ticketId);
  if (!ticket) return;

  const io = getIO();
  const roomName = getQueueRoomName();

  for (const m of ticket.members) {
    if (m.guestId === guestId) {
      // Leave old room
      const oldSocket = io.sockets.sockets.get(m.socketId);
      if (oldSocket) oldSocket.leave(roomName);

      // Update socketId
      m.socketId = newSocketId;

      // Join new socket to room
      const newSocket = io.sockets.sockets.get(newSocketId);
      if (newSocket) newSocket.join(roomName);

      console.log(`[queue] migrated ticket=${ticketId} guest=${guestId.slice(0, 8)} to new socket`);
      break;
    }
  }
}

// ── Helpers ───────────────────────────────────────────────

function broadcastQueueUpdate(): void {
  const io = getIO();
  const roomName = getQueueRoomName();
  const { size, ticketCount } = getQueueSize();
  const target = getTargetSize();

  io.to(roomName).emit('quickplay-queue-update', { size, ticketCount, target });
}

function moveSocketToGame(io: ReturnType<typeof getIO>, socketId: string, roomName: string, gameId: string): void {
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

// ── For testing ───────────────────────────────────────────

export function _getTicketsForTesting(): Map<string, QueueTicket> { return tickets; }
export function _getGuestToTicketForTesting(): Map<string, string> { return guestToTicket; }
export function _getTicketQueueForTesting(): string[] { return ticketQueue; }

export function _clearForTesting(): void {
  tickets.clear();
  guestToTicket.clear();
  ticketQueue.length = 0;
}
