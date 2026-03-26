import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PartyManager } from '../state.js';
import { GuestSessionManager } from '../../guestSessions.js';

describe('PartyManager', () => {
  let pm: PartyManager;
  let gsm: GuestSessionManager;

  beforeEach(() => {
    vi.useFakeTimers();
    pm = new PartyManager();
    gsm = new GuestSessionManager();
    pm.setGuestSessions(gsm);
  });

  afterEach(() => {
    pm.clearAllTimers();
    vi.useRealTimers();
  });

  function connectGuest(guestId: string, socketId: string): void {
    gsm.handleConnect(guestId, socketId);
  }

  // ── Create Party ──────────────────────────────────

  describe('createParty', () => {
    it('creates a party and returns state', () => {
      connectGuest('g1', 's1');
      const result = pm.createParty('g1');
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.party.leaderId).toBe('g1');
      expect(result.party.members.size).toBe(1);
      expect(result.party.code).toHaveLength(4);
      expect(pm.getActivePartyCount()).toBe(1);
    });

    it('sets partyId on GuestSession', () => {
      connectGuest('g1', 's1');
      const result = pm.createParty('g1');
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(gsm.getSession('g1')!.partyId).toBe(result.party.partyId);
    });

    it('rejects if already in a party', () => {
      connectGuest('g1', 's1');
      connectGuest('g2', 's2');
      pm.createParty('g1');

      // g2 tries to join — first create a second party context
      vi.advanceTimersByTime(5001);
      pm.createParty('g2');

      // g2 tries to create another party while already in one
      vi.advanceTimersByTime(5001);
      const result = pm.createParty('g2');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe('already-in-party');
    });

    it('rejects if in a game', () => {
      connectGuest('g1', 's1');
      gsm.bindToGame('g1', 'p1', 'game1');

      const result = pm.createParty('g1');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe('in-game');
    });

    it('enforces rate limiting', () => {
      connectGuest('g1', 's1');
      pm.createParty('g1');

      // Leave and try to create again immediately
      pm.leaveParty('g1');
      const result = pm.createParty('g1');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe('rate-limited');
    });

    it('allows create after rate limit expires', () => {
      connectGuest('g1', 's1');
      pm.createParty('g1');
      pm.leaveParty('g1');

      vi.advanceTimersByTime(5001);

      const result = pm.createParty('g1');
      expect(result.ok).toBe(true);
    });
  });

  // ── Join Party ────────────────────────────────────

  describe('joinParty', () => {
    it('joins an existing party by code', () => {
      connectGuest('g1', 's1');
      connectGuest('g2', 's2');
      const create = pm.createParty('g1');
      if (!create.ok) return;

      const result = pm.joinParty('g2', create.party.code);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.party.members.size).toBe(2);
      expect(gsm.getSession('g2')!.partyId).toBe(create.party.partyId);
    });

    it('is case-insensitive for codes', () => {
      connectGuest('g1', 's1');
      connectGuest('g2', 's2');
      const create = pm.createParty('g1');
      if (!create.ok) return;

      const result = pm.joinParty('g2', create.party.code.toLowerCase());
      expect(result.ok).toBe(true);
    });

    it('rejects invalid code', () => {
      connectGuest('g1', 's1');
      const result = pm.joinParty('g1', 'ZZZZ');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe('invalid-code');
    });

    it('rejects if party is full (max 3)', () => {
      connectGuest('g1', 's1');
      connectGuest('g2', 's2');
      connectGuest('g3', 's3');
      connectGuest('g4', 's4');

      const create = pm.createParty('g1');
      if (!create.ok) return;
      pm.joinParty('g2', create.party.code);
      pm.joinParty('g3', create.party.code);

      const result = pm.joinParty('g4', create.party.code);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe('party-full');
    });

    it('rejects if already in a party', () => {
      connectGuest('g1', 's1');
      connectGuest('g2', 's2');
      pm.createParty('g1');
      pm.createParty('g2');

      const party1 = pm.getPartyByGuest('g1')!;
      const result = pm.joinParty('g2', party1.code);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe('already-in-party');
    });

    it('rejects if in a game', () => {
      connectGuest('g1', 's1');
      connectGuest('g2', 's2');
      const create = pm.createParty('g1');
      if (!create.ok) return;

      gsm.bindToGame('g2', 'p2', 'game1');

      const result = pm.joinParty('g2', create.party.code);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe('in-game');
    });
  });

  // ── Leave Party ───────────────────────────────────

  describe('leaveParty', () => {
    it('removes member from party', () => {
      connectGuest('g1', 's1');
      connectGuest('g2', 's2');
      const create = pm.createParty('g1');
      if (!create.ok) return;
      pm.joinParty('g2', create.party.code);

      const result = pm.leaveParty('g2');
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.party.members.size).toBe(1);
      expect(gsm.getSession('g2')!.partyId).toBeNull();
    });

    it('destroys party when last member leaves', () => {
      connectGuest('g1', 's1');
      pm.createParty('g1');

      pm.leaveParty('g1');
      expect(pm.getActivePartyCount()).toBe(0);
      expect(gsm.getSession('g1')!.partyId).toBeNull();
    });

    it('transfers leadership when leader leaves', () => {
      connectGuest('g1', 's1');
      connectGuest('g2', 's2');
      const create = pm.createParty('g1');
      if (!create.ok) return;
      pm.joinParty('g2', create.party.code);

      const result = pm.leaveParty('g1');
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.party.leaderId).toBe('g2');
      expect(result.party.members.size).toBe(1);
    });

    it('returns error if not in a party', () => {
      connectGuest('g1', 's1');
      const result = pm.leaveParty('g1');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe('not-in-party');
    });

    it('transfers to longest-tenured member', () => {
      connectGuest('g1', 's1');
      connectGuest('g2', 's2');
      connectGuest('g3', 's3');
      const create = pm.createParty('g1');
      if (!create.ok) return;

      vi.advanceTimersByTime(100);
      pm.joinParty('g2', create.party.code);
      vi.advanceTimersByTime(100);
      pm.joinParty('g3', create.party.code);

      pm.leaveParty('g1');
      const party = pm.getPartyByGuest('g2')!;
      expect(party.leaderId).toBe('g2'); // g2 joined before g3
    });
  });

  // ── Disband Party ─────────────────────────────────

  describe('disbandParty', () => {
    it('destroys party and clears all members', () => {
      connectGuest('g1', 's1');
      connectGuest('g2', 's2');
      const create = pm.createParty('g1');
      if (!create.ok) return;
      pm.joinParty('g2', create.party.code);

      const result = pm.disbandParty(create.party.partyId, 'g1');
      expect(result.ok).toBe(true);
      expect(pm.getActivePartyCount()).toBe(0);
      expect(gsm.getSession('g1')!.partyId).toBeNull();
      expect(gsm.getSession('g2')!.partyId).toBeNull();
    });

    it('rejects if not leader', () => {
      connectGuest('g1', 's1');
      connectGuest('g2', 's2');
      const create = pm.createParty('g1');
      if (!create.ok) return;
      pm.joinParty('g2', create.party.code);

      const result = pm.disbandParty(create.party.partyId, 'g2');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe('not-leader');
    });

    it('blocks disband while members are in-game', () => {
      connectGuest('g1', 's1');
      connectGuest('g2', 's2');
      const create = pm.createParty('g1');
      if (!create.ok) return;
      pm.joinParty('g2', create.party.code);

      gsm.bindToGame('g2', 'p2', 'game1');

      const result = pm.disbandParty(create.party.partyId, 'g1');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe('members-in-game');
    });
  });

  // ── Disconnect / Reconnect ────────────────────────

  describe('handleDisconnect', () => {
    it('marks member as disconnected', () => {
      connectGuest('g1', 's1');
      connectGuest('g2', 's2');
      const create = pm.createParty('g1');
      if (!create.ok) return;
      pm.joinParty('g2', create.party.code);

      const result = pm.handleDisconnect('g2');
      expect(result).not.toBeNull();
      expect(result!.wasLeader).toBe(false);

      const member = result!.party.members.get('g2')!;
      expect(member.disconnectedAt).not.toBeNull();
    });

    it('returns null if not in party', () => {
      connectGuest('g1', 's1');
      expect(pm.handleDisconnect('g1')).toBeNull();
    });

    it('identifies leader disconnect', () => {
      connectGuest('g1', 's1');
      pm.createParty('g1');

      const result = pm.handleDisconnect('g1');
      expect(result!.wasLeader).toBe(true);
    });
  });

  describe('leader grace period', () => {
    it('transfers leadership after 30s grace expires', () => {
      connectGuest('g1', 's1');
      connectGuest('g2', 's2');
      const create = pm.createParty('g1');
      if (!create.ok) return;
      pm.joinParty('g2', create.party.code);

      pm.handleDisconnect('g1');

      // At 29s, leader is still g1
      vi.advanceTimersByTime(29_000);
      expect(pm.getPartyByGuest('g2')!.leaderId).toBe('g1');

      // At 30s, leader transfers to g2 and g1 is removed
      vi.advanceTimersByTime(1_000);
      const party = pm.getPartyByGuest('g2');
      expect(party).toBeDefined();
      expect(party!.leaderId).toBe('g2');
      expect(party!.members.has('g1')).toBe(false);
    });

    it('clears grace timer on leader reconnect', () => {
      connectGuest('g1', 's1');
      connectGuest('g2', 's2');
      const create = pm.createParty('g1');
      if (!create.ok) return;
      pm.joinParty('g2', create.party.code);

      pm.handleDisconnect('g1');
      vi.advanceTimersByTime(15_000);

      // Reconnect within grace period
      pm.handleReconnect('g1');
      expect(pm.getPartyByGuest('g1')!.leaderId).toBe('g1');

      // Wait past original 30s — nothing should happen
      vi.advanceTimersByTime(30_000);
      expect(pm.getPartyByGuest('g1')!.leaderId).toBe('g1');
    });

    it('handles DC → reconnect → DC → fresh 30s timer', () => {
      connectGuest('g1', 's1');
      connectGuest('g2', 's2');
      const create = pm.createParty('g1');
      if (!create.ok) return;
      pm.joinParty('g2', create.party.code);

      // First DC
      pm.handleDisconnect('g1');
      vi.advanceTimersByTime(15_000);

      // Reconnect
      pm.handleReconnect('g1');

      // Second DC
      pm.handleDisconnect('g1');

      // 29s after second DC — still leader
      vi.advanceTimersByTime(29_000);
      expect(pm.getPartyByGuest('g2')!.leaderId).toBe('g1');

      // 30s after second DC — transfers
      vi.advanceTimersByTime(1_000);
      expect(pm.getPartyByGuest('g2')!.leaderId).toBe('g2');
    });

    it('destroys party if leader is only member and grace expires', () => {
      connectGuest('g1', 's1');
      pm.createParty('g1');

      pm.handleDisconnect('g1');
      vi.advanceTimersByTime(30_000);

      expect(pm.getActivePartyCount()).toBe(0);
      expect(gsm.getSession('g1')!.partyId).toBeNull();
    });
  });

  describe('non-leader DC timeout', () => {
    it('removes non-leader after 30s DC', () => {
      connectGuest('g1', 's1');
      connectGuest('g2', 's2');
      const create = pm.createParty('g1');
      if (!create.ok) return;
      pm.joinParty('g2', create.party.code);

      pm.handleDisconnect('g2');

      vi.advanceTimersByTime(29_000);
      expect(pm.getPartyByGuest('g1')!.members.size).toBe(2);

      vi.advanceTimersByTime(1_000);
      expect(pm.getPartyByGuest('g1')!.members.size).toBe(1);
      expect(pm.isInParty('g2')).toBe(false);
    });

    it('clears DC timer on non-leader reconnect', () => {
      connectGuest('g1', 's1');
      connectGuest('g2', 's2');
      const create = pm.createParty('g1');
      if (!create.ok) return;
      pm.joinParty('g2', create.party.code);

      pm.handleDisconnect('g2');
      vi.advanceTimersByTime(15_000);
      pm.handleReconnect('g2');

      vi.advanceTimersByTime(30_000);
      expect(pm.isInParty('g2')).toBe(true);
    });
  });

  describe('handleReconnect', () => {
    it('clears disconnectedAt on reconnect', () => {
      connectGuest('g1', 's1');
      connectGuest('g2', 's2');
      const create = pm.createParty('g1');
      if (!create.ok) return;
      pm.joinParty('g2', create.party.code);

      pm.handleDisconnect('g2');
      const dcResult = pm.getPartyByGuest('g1')!.members.get('g2')!;
      expect(dcResult.disconnectedAt).not.toBeNull();

      pm.handleReconnect('g2');
      const rcResult = pm.getPartyByGuest('g1')!.members.get('g2')!;
      expect(rcResult.disconnectedAt).toBeNull();
    });

    it('returns null if not in party', () => {
      connectGuest('g1', 's1');
      expect(pm.handleReconnect('g1')).toBeNull();
    });
  });

  // ── GC Sweep ──────────────────────────────────────

  describe('sweep', () => {
    it('destroys parties where all members DC >5min', () => {
      connectGuest('g1', 's1');
      pm.createParty('g1');

      // Disconnect and set DC timestamp manually
      pm.handleDisconnect('g1');

      // Advance past 5 minutes
      vi.advanceTimersByTime(5 * 60_000 + 1);

      pm.sweep();
      expect(pm.getActivePartyCount()).toBe(0);
    });

    it('skips parties with in-game members', () => {
      connectGuest('g1', 's1');
      pm.createParty('g1');

      gsm.bindToGame('g1', 'p1', 'game1');
      pm.handleDisconnect('g1');

      vi.advanceTimersByTime(5 * 60_000 + 1);

      pm.sweep();
      expect(pm.getActivePartyCount()).toBe(1); // still exists
    });

    it('skips parties with connected members', () => {
      connectGuest('g1', 's1');
      connectGuest('g2', 's2');
      const create = pm.createParty('g1');
      if (!create.ok) return;
      pm.joinParty('g2', create.party.code);

      pm.handleDisconnect('g2');
      vi.advanceTimersByTime(5 * 60_000 + 1);

      pm.sweep();
      expect(pm.getActivePartyCount()).toBe(1); // g1 is still connected
    });

    it('no-ops on empty parties map', () => {
      pm.sweep(); // should not throw
      expect(pm.getActivePartyCount()).toBe(0);
    });
  });

  // ── Fail-safe ─────────────────────────────────────

  describe('forceDestroyByGuest', () => {
    it('destroys the party and clears all members', () => {
      connectGuest('g1', 's1');
      connectGuest('g2', 's2');
      const create = pm.createParty('g1');
      if (!create.ok) return;
      pm.joinParty('g2', create.party.code);

      pm.forceDestroyByGuest('g1');

      expect(pm.getActivePartyCount()).toBe(0);
      expect(pm.isInParty('g1')).toBe(false);
      expect(pm.isInParty('g2')).toBe(false);
    });

    it('handles guest not in a party gracefully', () => {
      connectGuest('g1', 's1');
      pm.forceDestroyByGuest('g1'); // should not throw
    });
  });

  // ── Serialization ─────────────────────────────────

  describe('toPayload', () => {
    it('serializes party state for socket emission', () => {
      connectGuest('g1', 's1');
      gsm.setName('g1', 'Alice');
      const create = pm.createParty('g1');
      if (!create.ok) return;

      const payload = pm.toPayload(create.party);
      expect(payload.partyId).toBe(create.party.partyId);
      expect(payload.code).toBe(create.party.code);
      expect(payload.leaderId).toBe('g1');
      expect(payload.members).toHaveLength(1);
      expect(payload.members[0].guestId).toBe('g1');
      expect(payload.members[0].name).toBe('Alice');
    });
  });

  // ── Lookups ───────────────────────────────────────

  describe('lookups', () => {
    it('getPartyByGuest returns party', () => {
      connectGuest('g1', 's1');
      const create = pm.createParty('g1');
      if (!create.ok) return;

      expect(pm.getPartyByGuest('g1')!.partyId).toBe(create.party.partyId);
    });

    it('getPartyByCode returns party (case-insensitive)', () => {
      connectGuest('g1', 's1');
      const create = pm.createParty('g1');
      if (!create.ok) return;

      expect(pm.getPartyByCode(create.party.code.toLowerCase())!.partyId).toBe(create.party.partyId);
    });

    it('isInParty returns correct state', () => {
      connectGuest('g1', 's1');
      expect(pm.isInParty('g1')).toBe(false);

      pm.createParty('g1');
      expect(pm.isInParty('g1')).toBe(true);

      pm.leaveParty('g1');
      expect(pm.isInParty('g1')).toBe(false);
    });
  });

  // ── Join Code ─────────────────────────────────────

  describe('join code generation', () => {
    it('generates unique codes for multiple parties', () => {
      const codes = new Set<string>();
      for (let i = 0; i < 20; i++) {
        const guestId = `g${i}`;
        connectGuest(guestId, `s${i}`);
        vi.advanceTimersByTime(5001); // respect rate limit
        const result = pm.createParty(guestId);
        if (result.ok) {
          codes.add(result.party.code);
        }
      }
      expect(codes.size).toBe(20); // all unique
    });
  });

  // ── Player Name Persistence ───────────────────────

  describe('name persistence', () => {
    it('uses GuestSession name in party member', () => {
      connectGuest('g1', 's1');
      gsm.setName('g1', 'Captain Hook');
      const create = pm.createParty('g1');
      if (!create.ok) return;

      const member = create.party.members.get('g1')!;
      expect(member.name).toBe('Captain Hook');
    });

    it('handles null name gracefully', () => {
      connectGuest('g1', 's1');
      const create = pm.createParty('g1');
      if (!create.ok) return;

      const member = create.party.members.get('g1')!;
      expect(member.name).toBeNull();
    });
  });

  // ── Party Membership Persists During Gameplay ─────

  describe('in-game party persistence', () => {
    it('party membership persists when members enter a game', () => {
      connectGuest('g1', 's1');
      connectGuest('g2', 's2');
      const create = pm.createParty('g1');
      if (!create.ok) return;
      pm.joinParty('g2', create.party.code);

      // Bind to game
      gsm.bindToGame('g1', 'p1', 'game1');
      gsm.bindToGame('g2', 'p2', 'game1');

      // Party still exists
      expect(pm.isInParty('g1')).toBe(true);
      expect(pm.isInParty('g2')).toBe(true);
      expect(pm.getActivePartyCount()).toBe(1);
    });

    it('can join party after game ends (gameId cleared)', () => {
      connectGuest('g1', 's1');
      connectGuest('g2', 's2');

      gsm.bindToGame('g1', 'p1', 'game1');

      // Can't join while in-game
      const fail = pm.createParty('g1');
      expect(fail.ok).toBe(false);

      // Game ends — unbind
      gsm.unbindFromGame('g1');

      // Now can create party
      const result = pm.createParty('g1');
      expect(result.ok).toBe(true);
    });
  });
});
