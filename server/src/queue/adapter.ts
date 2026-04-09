// ============================================================
// Queue Adapter — Pure functions for ticket creation
//
// Converts solo player into QueueTicket.
// No side effects, no state mutation — the orchestrator handles that.
// ============================================================

import crypto from 'node:crypto';
import type { QueueTicket } from './types.js';

/**
 * Create a ticket for a solo player.
 */
export function createSoloTicket(
  guestId: string,
  socketId: string,
  playerName: string,
): QueueTicket {
  return {
    id: crypto.randomUUID(),
    members: [{
      guestId,
      socketId,
      playerName: playerName || 'Player',
    }],
    createdAt: Date.now(),
  };
}
