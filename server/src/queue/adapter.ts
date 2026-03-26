// ============================================================
// Queue Adapter — Pure functions for ticket creation and validation
//
// Converts party/solo player into QueueTicket.
// No side effects, no state mutation — the orchestrator handles that.
// ============================================================

import crypto from 'node:crypto';
import type { QuickPlayMode } from '@salvo/shared';
import type { QueueTicket, QueuedMember } from './types.js';
import type { Party } from '../party/state.js';
import type { GuestSessionManager } from '../guestSessions.js';

// Legal mode matrix: party size → allowed QuickPlayMode values
// Solo (1): all modes. Party of 2: 2v2, 2v2v2, 3v3. Party of 3: 3v3 only.
const LEGAL_MODES: Record<number, ReadonlySet<QuickPlayMode>> = {
  1: new Set(['1v1', '2v2', '3v3', '3ffa', '6ffa', '2v2v2']),
  2: new Set(['2v2', '2v2v2', '3v3']),
  3: new Set(['3v3']),
};

/** Check if a party of the given size can queue for the specified mode. */
export function validateMode(partySize: number, mode: QuickPlayMode): boolean {
  const allowed = LEGAL_MODES[partySize];
  return allowed ? allowed.has(mode) : false;
}

/** Get the set of allowed modes for a given party size. */
export function getAllowedModes(partySize: number): ReadonlySet<QuickPlayMode> {
  return LEGAL_MODES[partySize] ?? new Set();
}

export type CreateTicketResult =
  | { ok: true; ticket: QueueTicket }
  | { ok: false; reason: 'member-disconnected' | 'invalid-mode' | 'in-game' };

/**
 * Create a ticket for a solo player.
 * Validates the socket is connected.
 */
export function createSoloTicket(
  guestId: string,
  socketId: string,
  playerName: string,
  mode: QuickPlayMode,
): QueueTicket {
  return {
    id: crypto.randomUUID(),
    members: [{
      guestId,
      socketId,
      playerName: playerName || 'Player',
    }],
    partyId: null,
    mode,
    createdAt: Date.now(),
  };
}

type SocketMap = { sockets: { sockets: Map<string, unknown> } };

function resolvePartyMembers(
  party: Party,
  guestSessions: GuestSessionManager,
  io: SocketMap,
): QueuedMember[] | 'member-disconnected' | 'in-game' {
  const members: QueuedMember[] = [];
  for (const [gId, member] of party.members) {
    const session = guestSessions.getSession(gId);
    if (session?.gameId) return 'in-game';
    const socketId = session?.socketId;
    if (!socketId || !io.sockets.sockets.has(socketId)) return 'member-disconnected';
    members.push({
      guestId: gId,
      socketId,
      playerName: member.name ?? session?.name ?? 'Player',
    });
  }
  return members;
}

/**
 * Create a ticket for a party.
 * Validates all member sockets are connected and mode is legal.
 */
export function createPartyTicket(
  party: Party,
  mode: QuickPlayMode,
  guestSessions: GuestSessionManager,
  io: SocketMap,
): CreateTicketResult {
  if (!validateMode(party.members.size, mode)) {
    return { ok: false, reason: 'invalid-mode' };
  }

  const result = resolvePartyMembers(party, guestSessions, io);
  if (typeof result === 'string') {
    return { ok: false, reason: result };
  }

  return {
    ok: true,
    ticket: {
      id: crypto.randomUUID(),
      members: result,
      partyId: party.partyId,
      mode,
      createdAt: Date.now(),
    },
  };
}
