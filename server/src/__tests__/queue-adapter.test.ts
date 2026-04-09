import { describe, it, expect } from 'vitest';
import { createSoloTicket } from '../queue/adapter.js';

// ============================================================
// createSoloTicket
// ============================================================

describe('createSoloTicket', () => {
  it('creates a ticket with one member', () => {
    const ticket = createSoloTicket('guest-1', 'sock-1', 'Alice');
    expect(ticket.members).toHaveLength(1);
    expect(ticket.members[0].guestId).toBe('guest-1');
    expect(ticket.members[0].socketId).toBe('sock-1');
    expect(ticket.members[0].playerName).toBe('Alice');
  });

  it('falls back to Player for empty name', () => {
    const ticket = createSoloTicket('guest-1', 'sock-1', '');
    expect(ticket.members[0].playerName).toBe('Player');
  });

  it('generates unique ticket IDs', () => {
    const t1 = createSoloTicket('g1', 's1', 'A');
    const t2 = createSoloTicket('g2', 's2', 'B');
    expect(t1.id).not.toBe(t2.id);
  });
});
