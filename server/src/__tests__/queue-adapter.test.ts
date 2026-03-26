import { describe, it, expect } from 'vitest';
import { validateMode, getAllowedModes, createSoloTicket, createPartyTicket } from '../queue/adapter.js';
import type { Party } from '../party/state.js';
import type { QuickPlayMode } from '@salvo/shared';

// ============================================================
// validateMode — 18 cases (6 modes × 3 party sizes)
// ============================================================

describe('validateMode', () => {
  const allModes: QuickPlayMode[] = ['1v1', '2v2', '3v3', '3ffa', '6ffa', '2v2v2'];

  describe('solo (size 1) — all modes allowed', () => {
    for (const mode of allModes) {
      it(`allows ${mode}`, () => {
        expect(validateMode(1, mode)).toBe(true);
      });
    }
  });

  describe('party of 2 — team modes only', () => {
    it('allows 2v2', () => expect(validateMode(2, '2v2')).toBe(true));
    it('allows 2v2v2', () => expect(validateMode(2, '2v2v2')).toBe(true));
    it('allows 3v3', () => expect(validateMode(2, '3v3')).toBe(true));
    it('blocks 1v1', () => expect(validateMode(2, '1v1')).toBe(false));
    it('blocks 3ffa', () => expect(validateMode(2, '3ffa')).toBe(false));
    it('blocks 6ffa', () => expect(validateMode(2, '6ffa')).toBe(false));
  });

  describe('party of 3 — 3v3 only', () => {
    it('allows 3v3', () => expect(validateMode(3, '3v3')).toBe(true));
    it('blocks 1v1', () => expect(validateMode(3, '1v1')).toBe(false));
    it('blocks 2v2', () => expect(validateMode(3, '2v2')).toBe(false));
    it('blocks 2v2v2', () => expect(validateMode(3, '2v2v2')).toBe(false));
    it('blocks 3ffa', () => expect(validateMode(3, '3ffa')).toBe(false));
    it('blocks 6ffa', () => expect(validateMode(3, '6ffa')).toBe(false));
  });

  it('rejects invalid party sizes', () => {
    expect(validateMode(0, '1v1')).toBe(false);
    expect(validateMode(4, '3v3')).toBe(false);
  });
});

// ============================================================
// getAllowedModes
// ============================================================

describe('getAllowedModes', () => {
  it('returns all 6 modes for solo', () => {
    expect(getAllowedModes(1).size).toBe(6);
  });

  it('returns 3 modes for party of 2', () => {
    const modes = getAllowedModes(2);
    expect(modes.size).toBe(3);
    expect(modes.has('2v2')).toBe(true);
    expect(modes.has('2v2v2')).toBe(true);
    expect(modes.has('3v3')).toBe(true);
  });

  it('returns 1 mode for party of 3', () => {
    const modes = getAllowedModes(3);
    expect(modes.size).toBe(1);
    expect(modes.has('3v3')).toBe(true);
  });

  it('returns empty set for invalid sizes', () => {
    expect(getAllowedModes(4).size).toBe(0);
  });
});

// ============================================================
// createSoloTicket
// ============================================================

describe('createSoloTicket', () => {
  it('creates a ticket with one member', () => {
    const ticket = createSoloTicket('guest-1', 'sock-1', 'Alice', '1v1');
    expect(ticket.members).toHaveLength(1);
    expect(ticket.members[0].guestId).toBe('guest-1');
    expect(ticket.members[0].socketId).toBe('sock-1');
    expect(ticket.members[0].playerName).toBe('Alice');
    expect(ticket.partyId).toBeNull();
    expect(ticket.mode).toBe('1v1');
  });

  it('falls back to Player for empty name', () => {
    const ticket = createSoloTicket('guest-1', 'sock-1', '', '2v2');
    expect(ticket.members[0].playerName).toBe('Player');
  });

  it('generates unique ticket IDs', () => {
    const t1 = createSoloTicket('g1', 's1', 'A', '1v1');
    const t2 = createSoloTicket('g2', 's2', 'B', '1v1');
    expect(t1.id).not.toBe(t2.id);
  });
});

// ============================================================
// createPartyTicket
// ============================================================

describe('createPartyTicket', () => {
  function makeParty(size: number): Party {
    const members = new Map<string, { guestId: string; displayId: string; name: string | null; joinedAt: number; disconnectedAt: number | null }>();
    for (let i = 0; i < size; i++) {
      members.set(`guest-${i}`, {
        guestId: `guest-${i}`,
        displayId: `disp-${i}`,
        name: `Player${i}`,
        joinedAt: Date.now(),
        disconnectedAt: null,
      });
    }
    return { partyId: 'party-1', code: 'ABCD', leaderId: 'guest-0', members, createdAt: Date.now() };
  }

  function makeGuestSessions(connected: Map<string, string>): any {
    return {
      getSession: (guestId: string) => {
        const socketId = connected.get(guestId);
        return socketId ? { socketId, gameId: null, name: `Name-${guestId}` } : null;
      },
    };
  }

  function makeIO(connectedSockets: Set<string>): any {
    return { sockets: { sockets: new Map([...connectedSockets].map(s => [s, {}])) } };
  }

  it('creates a party ticket with all members', () => {
    const party = makeParty(2);
    const gs = makeGuestSessions(new Map([['guest-0', 'sock-0'], ['guest-1', 'sock-1']]));
    const io = makeIO(new Set(['sock-0', 'sock-1']));

    const result = createPartyTicket(party, '2v2', gs, io);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ticket.members).toHaveLength(2);
      expect(result.ticket.partyId).toBe('party-1');
      expect(result.ticket.mode).toBe('2v2');
    }
  });

  it('rejects invalid mode for party size', () => {
    const party = makeParty(2);
    const gs = makeGuestSessions(new Map([['guest-0', 'sock-0'], ['guest-1', 'sock-1']]));
    const io = makeIO(new Set(['sock-0', 'sock-1']));

    const result = createPartyTicket(party, '1v1', gs, io);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid-mode');
  });

  it('rejects when a member socket is disconnected', () => {
    const party = makeParty(2);
    const gs = makeGuestSessions(new Map([['guest-0', 'sock-0'], ['guest-1', 'sock-1']]));
    const io = makeIO(new Set(['sock-0'])); // sock-1 not connected

    const result = createPartyTicket(party, '2v2', gs, io);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('member-disconnected');
  });

  it('rejects when a member is in a game', () => {
    const party = makeParty(2);
    const gs = {
      getSession: (guestId: string) => {
        if (guestId === 'guest-1') return { socketId: 'sock-1', gameId: 'some-game', name: 'P1' };
        return { socketId: 'sock-0', gameId: null, name: 'P0' };
      },
    };
    const io = makeIO(new Set(['sock-0', 'sock-1']));

    const result = createPartyTicket(party, '2v2', gs as any, io);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('in-game');
  });

  it('uses member name from party, falls back to guest session name', () => {
    const party = makeParty(1);
    party.members.get('guest-0')!.name = null; // no party name
    const gs = makeGuestSessions(new Map([['guest-0', 'sock-0']]));
    const io = makeIO(new Set(['sock-0']));

    const result = createPartyTicket(party, '3v3', gs, io);
    // party of 1 can only play... actually validateMode(1, '3v3') is true for solo
    // but this is a party, so members.size = 1. validateMode(1, '3v3') = true
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ticket.members[0].playerName).toBe('Name-guest-0');
    }
  });
});
