// ============================================================
// Queue Matcher — Pure matching logic operating on tickets
//
// Greedy FIFO: iterate tickets in order, sum member counts,
// skip tickets that don't fit remaining slots.
// Quick Play is always 6-player FFA.
// ============================================================

import type { QueueTicket } from './types.js';

/** Quick Play target is always 6 players. */
export function getTargetSize(): number {
  return 6;
}

/**
 * Greedy FIFO matching: iterate tickets in order, accumulate members
 * until we reach the target player count. Skip tickets that would overflow.
 */
export function tryMatch(
  tickets: QueueTicket[],
  targetSize: number,
): QueueTicket[] | null {
  const matched: QueueTicket[] = [];
  let total = 0;

  for (const ticket of tickets) {
    if (total + ticket.members.length > targetSize) continue;
    matched.push(ticket);
    total += ticket.members.length;
    if (total === targetSize) return matched;
  }

  return null;
}
