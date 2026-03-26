// ============================================================
// Queue Orchestrator — Ticket-based matchmaking
//
// Single source of truth: tickets Map + guestToTicket reverse index.
// Socket.IO rooms are used ONLY for event broadcasting.
//
//   tickets: Map<ticketId, QueueTicket>
//   guestToTicket: Map<guestId, ticketId>   (reverse index for O(1) DC/eviction)
//   modeTickets: Map<mode, ticketId[]>      (per-mode ticket ordering for FIFO)
// ============================================================

import type { QuickPlayMode } from '@salvo/shared';
import { toGameMode, MODE_RINGS } from '@salvo/shared';
import crypto from 'node:crypto';
import { getIO, getLobby, getConnections, getGuestSessions, emitToPlayer, emitToGuest } from '../emitters.js';
import type { GuestSessionManager } from '../guestSessions.js';
import { createGame, addPlayer, startGame, toClientView } from '../game.js';
import { assignQuickPlayColors } from '../helpers.js';
import { startPlacementTimer } from '../timers/index.js';
import type { QueueTicket } from './types.js';
import { tryMatch, assignTeams, isTeamMode, getTargetSize } from './matcher.js';

// ── State ─────────────────────────────────────────────────

const tickets = new Map<string, QueueTicket>();
const guestToTicket = new Map<string, string>();
const modeTickets = new Map<QuickPlayMode, string[]>();

// ── Public API ────────────────────────────────────────────

export { isTeamMode, getTargetSize } from './matcher.js';

export function getQueueRoomName(mode: QuickPlayMode): string {
  return `quickplay-${mode}`;
}

export function getQueueSize(mode: QuickPlayMode): { size: number; ticketCount: number } {
  const ids = modeTickets.get(mode) ?? [];
  let size = 0;
  for (const id of ids) {
    const t = tickets.get(id);
    if (t) size += t.members.length;
  }
  return { size, ticketCount: ids.length };
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
  const roomName = getQueueRoomName(ticket.mode);

  // Store ticket
  tickets.set(ticket.id, ticket);
  for (const m of ticket.members) {
    guestToTicket.set(m.guestId, ticket.id);
  }

  // Maintain mode ordering
  if (!modeTickets.has(ticket.mode)) modeTickets.set(ticket.mode, []);
  modeTickets.get(ticket.mode)!.push(ticket.id);

  // Join all member sockets to the broadcast room
  for (const m of ticket.members) {
    const s = io.sockets.sockets.get(m.socketId);
    if (s) s.join(roomName);
  }

  // Emit ticket-created to party members (data contract reservation for Sprint 1e)
  if (ticket.partyId) {
    const memberInfo = ticket.members.map(m => ({ name: m.playerName, displayId: crypto.randomUUID().slice(0, 8) }));
    for (const m of ticket.members) {
      io.to(m.socketId).emit('quickplay-ticket-created', {
        ticketId: ticket.id,
        members: memberInfo,
        mode: ticket.mode,
      });
    }
  }

  console.log(`[queue] enqueue ticket=${ticket.id} mode=${ticket.mode} size=${ticket.members.length} party=${ticket.partyId ?? 'solo'}`);

  broadcastQueueUpdate(ticket.mode);
  broadcastOnlineCount();
}

export function dequeue(ticketId: string): QueueTicket | undefined {
  const ticket = tickets.get(ticketId);
  if (!ticket) return undefined;

  const io = getIO();
  const roomName = getQueueRoomName(ticket.mode);

  // Remove from state
  tickets.delete(ticketId);
  for (const m of ticket.members) {
    guestToTicket.delete(m.guestId);
  }

  // Remove from mode ordering
  const modeList = modeTickets.get(ticket.mode);
  if (modeList) {
    const idx = modeList.indexOf(ticketId);
    if (idx !== -1) modeList.splice(idx, 1);
  }

  // Leave broadcast room
  for (const m of ticket.members) {
    const s = io.sockets.sockets.get(m.socketId);
    if (s) s.leave(roomName);
  }

  console.log(`[queue] dequeue ticket=${ticket.id} mode=${ticket.mode} reason=removed`);

  broadcastQueueUpdate(ticket.mode);
  broadcastOnlineCount();

  return ticket;
}

/**
 * Dissolve a ticket and notify party members.
 * Used when: member DC, party mutation while queued, leader cancel.
 */
export function dissolveTicket(ticketId: string): void {
  const ticket = dequeue(ticketId);
  if (!ticket || !ticket.partyId) return;

  // Notify non-leader members that queue was cancelled
  for (const m of ticket.members) {
    emitToGuest(m.guestId, 'party-queue-cancelled', undefined);
  }

  console.log(`[queue] dissolved ticket=${ticketId} party=${ticket.partyId}`);
}

// ── Matching ──────────────────────────────────────────────

export function attemptMatch(mode: QuickPlayMode): void {
  const target = getTargetSize(mode);
  const modeList = modeTickets.get(mode);
  if (!modeList || modeList.length === 0) return;

  // Build ordered ticket array for this mode
  const modeTicketObjs: QueueTicket[] = [];
  for (const id of modeList) {
    const t = tickets.get(id);
    if (t) modeTicketObjs.push(t);
  }

  const matched = tryMatch(modeTicketObjs, target);
  if (!matched) return;

  createMatchFromTickets(matched, mode);
}

function addTicketMembersToGame(
  matchedTickets: QueueTicket[], hostId: string, game: ReturnType<typeof createGame>, roomName: string,
): Map<string, string[]> {
  const io = getIO();
  const lobby = getLobby();
  const connections = getConnections();
  const guestSessions = getGuestSessions();
  const playerIdsByTicket = new Map<string, string[]>();
  let isFirst = true;

  for (const ticket of matchedTickets) {
    const pids: string[] = [];
    for (const member of ticket.members) {
      const playerId = isFirst ? hostId : crypto.randomUUID();
      isFirst = false;

      if (playerId !== hostId) addPlayer(game, playerId, member.playerName);

      lobby.registerPlayer(playerId, game.id);
      connections.register(playerId, member.socketId, game.id);
      bindGuestToGame(guestSessions, member.socketId, playerId, game.id, member.playerName);
      moveSocketToGame(io, member.socketId, roomName, game.id);
      io.to(member.socketId).emit('quickplay-matched', { playerId, gameId: game.id });
      pids.push(playerId);
    }
    playerIdsByTicket.set(ticket.id, pids);
  }
  return playerIdsByTicket;
}

function removeMatchedTickets(matchedTickets: QueueTicket[], mode: QuickPlayMode): void {
  for (const ticket of matchedTickets) {
    tickets.delete(ticket.id);
    for (const m of ticket.members) guestToTicket.delete(m.guestId);
    const modeList = modeTickets.get(mode);
    if (modeList) {
      const idx = modeList.indexOf(ticket.id);
      if (idx !== -1) modeList.splice(idx, 1);
    }
  }
}

function createMatchFromTickets(matchedTickets: QueueTicket[], mode: QuickPlayMode): void {
  const roomName = getQueueRoomName(mode);
  const gameMode = toGameMode(mode);

  const firstMember = matchedTickets[0].members[0];
  const hostId = crypto.randomUUID();
  const game = createGame(
    hostId, firstMember.playerName,
    { enabled: true, seconds: 60 }, gameMode, isTeamMode(mode), MODE_RINGS[gameMode],
  );

  const lobby = getLobby();
  const code = lobby.generateUniqueCode();
  lobby.addGame(game, code);

  const playerIdsByTicket = addTicketMembersToGame(matchedTickets, hostId, game, roomName);
  removeMatchedTickets(matchedTickets, mode);

  // Team assignment (party-aware)
  assignTeams(game, matchedTickets, playerIdsByTicket, mode);
  assignQuickPlayColors(game, mode);
  startGame(game);

  const qpPlacementDeadline = game.timerConfig.enabled
    ? Date.now() + game.timerConfig.seconds * 1000
    : undefined;
  for (const pid of game.players.keys()) {
    emitToPlayer(pid, 'placement-phase', { game: toClientView(game, pid), placementDeadline: qpPlacementDeadline });
  }

  startPlacementTimer(game.id);

  console.log(`[queue] match created game=${game.id} mode=${mode} tickets=${matchedTickets.length} players=${game.players.size}`);

  broadcastQueueUpdate(mode);
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
  const roomName = getQueueRoomName(ticket.mode);

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

function broadcastQueueUpdate(mode: QuickPlayMode): void {
  const io = getIO();
  const roomName = getQueueRoomName(mode);
  const { size, ticketCount } = getQueueSize(mode);
  const target = getTargetSize(mode);

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
export function _getModeTicketsForTesting(): Map<QuickPlayMode, string[]> { return modeTickets; }

export function _clearForTesting(): void {
  tickets.clear();
  guestToTicket.clear();
  modeTickets.clear();
}
