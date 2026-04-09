import { describe, it, expect } from 'vitest';
import { tryMatch, getTargetSize } from '../queue/matcher.js';
import type { QueueTicket } from '../queue/types.js';

function ticket(id: string, size: number): QueueTicket {
  const members = Array.from({ length: size }, (_, i) => ({
    guestId: `${id}-g${i}`,
    socketId: `${id}-s${i}`,
    playerName: `P${i}`,
  }));
  return { id, members, createdAt: Date.now() };
}

// ============================================================
// getTargetSize
// ============================================================

describe('getTargetSize', () => {
  it('always returns 6', () => expect(getTargetSize()).toBe(6));
});

// ============================================================
// tryMatch — greedy FIFO with skip
// ============================================================

describe('tryMatch', () => {
  it('matches 6 solo tickets', () => {
    const tickets = Array.from({ length: 6 }, (_, i) => ticket(`s${i}`, 1));
    const result = tryMatch(tickets, 6);
    expect(result).toHaveLength(6);
  });

  it('matches 2 solo tickets for target 2', () => {
    const tickets = [ticket('a', 1), ticket('b', 1)];
    const result = tryMatch(tickets, 2);
    expect(result).toHaveLength(2);
  });

  it('skips oversized ticket and takes smaller ones', () => {
    const tickets = [
      ticket('big', 3),   // skipped (3 > remaining after first)
      ticket('s1', 1),
      ticket('s2', 1),
    ];
    const result = tryMatch(tickets, 2);
    expect(result).toHaveLength(2);
    expect(result![0].id).toBe('s1');
    expect(result![1].id).toBe('s2');
  });

  it('returns null when not enough players', () => {
    const tickets = [ticket('a', 1)];
    expect(tryMatch(tickets, 2)).toBeNull();
  });

  it('returns null for empty ticket list', () => {
    expect(tryMatch([], 2)).toBeNull();
  });

  it('matches single ticket that exactly fills target', () => {
    const tickets = [ticket('party', 3)];
    const result = tryMatch(tickets, 3);
    expect(result).toHaveLength(1);
    expect(result![0].members.length).toBe(3);
  });

  it('skips ticket that would overflow and finds a valid combination', () => {
    const tickets = [
      ticket('party3', 3),  // 3 players, too big for target=2
      ticket('s1', 1),
      ticket('s2', 1),
    ];
    const result = tryMatch(tickets, 2);
    expect(result).toHaveLength(2);
  });
});
