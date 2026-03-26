import { describe, it, expect, beforeEach } from 'vitest';
import { GuestSessionManager, isValidGuestId } from '../guestSessions.js';

describe('isValidGuestId', () => {
  it('accepts valid UUIDv4', () => {
    expect(isValidGuestId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(isValidGuestId('6ba7b810-9dad-41d1-80b4-00c04fd430c8')).toBe(true);
  });

  it('rejects non-string values', () => {
    expect(isValidGuestId(undefined)).toBe(false);
    expect(isValidGuestId(null)).toBe(false);
    expect(isValidGuestId(42)).toBe(false);
    expect(isValidGuestId({})).toBe(false);
  });

  it('rejects non-UUID strings', () => {
    expect(isValidGuestId('')).toBe(false);
    expect(isValidGuestId('not-a-uuid')).toBe(false);
    expect(isValidGuestId('550e8400-e29b-41d4-a716')).toBe(false); // truncated
    expect(isValidGuestId('550e8400-e29b-51d4-a716-446655440000')).toBe(false); // v5 not v4
  });
});

describe('GuestSessionManager', () => {
  let gsm: GuestSessionManager;

  beforeEach(() => {
    gsm = new GuestSessionManager();
  });

  describe('handleConnect', () => {
    it('creates a new session', () => {
      const result = gsm.handleConnect('guest-1', 'socket-1');
      expect(result.evictedSocketId).toBeNull();
      expect(result.activeGame).toBeNull();

      const session = gsm.getSession('guest-1');
      expect(session).toBeDefined();
      expect(session!.socketId).toBe('socket-1');
      expect(session!.guestId).toBe('guest-1');
    });

    it('evicts old socket when same guestId connects again', () => {
      gsm.handleConnect('guest-1', 'socket-1');
      const result = gsm.handleConnect('guest-1', 'socket-2');

      expect(result.evictedSocketId).toBe('socket-1');
      expect(gsm.getSession('guest-1')!.socketId).toBe('socket-2');
      // Old socket removed from reverse lookup
      expect(gsm.getGuestIdBySocket('socket-1')).toBeUndefined();
      expect(gsm.getGuestIdBySocket('socket-2')).toBe('guest-1');
    });

    it('returns active game when guest has one', () => {
      gsm.handleConnect('guest-1', 'socket-1');
      gsm.bindToGame('guest-1', 'player-1', 'game-1');

      // Simulate disconnect + reconnect
      gsm.handleDisconnect('socket-1');
      const result = gsm.handleConnect('guest-1', 'socket-2');

      expect(result.activeGame).toEqual({ playerId: 'player-1', gameId: 'game-1' });
    });

    it('returns null activeGame when guest has no game', () => {
      gsm.handleConnect('guest-1', 'socket-1');
      const result = gsm.handleConnect('guest-1', 'socket-2');
      expect(result.activeGame).toBeNull();
    });
  });

  describe('handleDisconnect', () => {
    it('clears socketId but keeps session', () => {
      gsm.handleConnect('guest-1', 'socket-1');
      gsm.handleDisconnect('socket-1');

      const session = gsm.getSession('guest-1');
      expect(session).toBeDefined();
      expect(session!.socketId).toBeNull();
      expect(gsm.getGuestIdBySocket('socket-1')).toBeUndefined();
    });

    it('is a no-op for unknown socketId', () => {
      gsm.handleDisconnect('nonexistent');
      // Should not throw
    });

    it('preserves game binding', () => {
      gsm.handleConnect('guest-1', 'socket-1');
      gsm.bindToGame('guest-1', 'player-1', 'game-1');
      gsm.handleDisconnect('socket-1');

      const session = gsm.getSession('guest-1');
      expect(session!.playerId).toBe('player-1');
      expect(session!.gameId).toBe('game-1');
    });
  });

  describe('bindToGame / unbindFromGame', () => {
    it('binds guest to a game', () => {
      gsm.handleConnect('guest-1', 'socket-1');
      gsm.bindToGame('guest-1', 'player-1', 'game-1');

      const session = gsm.getSession('guest-1');
      expect(session!.playerId).toBe('player-1');
      expect(session!.gameId).toBe('game-1');
    });

    it('unbinds guest from a game', () => {
      gsm.handleConnect('guest-1', 'socket-1');
      gsm.bindToGame('guest-1', 'player-1', 'game-1');
      gsm.unbindFromGame('guest-1');

      const session = gsm.getSession('guest-1');
      expect(session!.playerId).toBeNull();
      expect(session!.gameId).toBeNull();
    });

    it('is a no-op for unknown guestId', () => {
      gsm.bindToGame('nonexistent', 'player-1', 'game-1');
      gsm.unbindFromGame('nonexistent');
      // Should not throw
    });
  });

  describe('name persistence', () => {
    it('stores and retrieves player name', () => {
      gsm.handleConnect('guest-1', 'socket-1');
      gsm.setName('guest-1', 'Captain Hook');
      expect(gsm.getName('guest-1')).toBe('Captain Hook');
    });

    it('returns null for unknown guest', () => {
      expect(gsm.getName('nonexistent')).toBeNull();
    });
  });

  describe('getConnectedGuestCount', () => {
    it('counts only connected guests', () => {
      gsm.handleConnect('guest-1', 'socket-1');
      gsm.handleConnect('guest-2', 'socket-2');
      expect(gsm.getConnectedGuestCount()).toBe(2);

      gsm.handleDisconnect('socket-1');
      expect(gsm.getConnectedGuestCount()).toBe(1);
    });
  });

  describe('areAllDisconnected', () => {
    it('returns true when all guests in game are disconnected', () => {
      gsm.handleConnect('guest-1', 'socket-1');
      gsm.handleConnect('guest-2', 'socket-2');
      gsm.bindToGame('guest-1', 'p1', 'game-1');
      gsm.bindToGame('guest-2', 'p2', 'game-1');

      gsm.handleDisconnect('socket-1');
      expect(gsm.areAllDisconnected('game-1')).toBe(false);

      gsm.handleDisconnect('socket-2');
      expect(gsm.areAllDisconnected('game-1')).toBe(true);
    });

    it('returns false when no guests in game', () => {
      expect(gsm.areAllDisconnected('nonexistent')).toBe(false);
    });
  });

  describe('unbindAllFromGame', () => {
    it('unbinds all guests from a game', () => {
      gsm.handleConnect('guest-1', 'socket-1');
      gsm.handleConnect('guest-2', 'socket-2');
      gsm.bindToGame('guest-1', 'p1', 'game-1');
      gsm.bindToGame('guest-2', 'p2', 'game-1');

      gsm.unbindAllFromGame('game-1');

      expect(gsm.getSession('guest-1')!.gameId).toBeNull();
      expect(gsm.getSession('guest-2')!.gameId).toBeNull();
    });
  });

  describe('GC sweep', () => {
    it('removes orphaned sessions older than 5 minutes', () => {
      gsm.handleConnect('guest-1', 'socket-1');
      gsm.handleDisconnect('socket-1');

      // Manually set lastSeenAt to 6 minutes ago
      const session = gsm.getSession('guest-1')!;
      session.lastSeenAt = Date.now() - 6 * 60_000;

      gsm.sweep();
      expect(gsm.getSession('guest-1')).toBeUndefined();
    });

    it('does NOT remove sessions with active game binding', () => {
      gsm.handleConnect('guest-1', 'socket-1');
      gsm.bindToGame('guest-1', 'p1', 'game-1');
      gsm.handleDisconnect('socket-1');

      const session = gsm.getSession('guest-1')!;
      session.lastSeenAt = Date.now() - 10 * 60_000;

      gsm.sweep();
      expect(gsm.getSession('guest-1')).toBeDefined();
    });

    it('unbinds game reference when game no longer exists', () => {
      gsm.setGameExistsCheck(() => false); // all games "gone"
      gsm.handleConnect('guest-1', 'socket-1');
      gsm.bindToGame('guest-1', 'p1', 'game-1');

      gsm.sweep();

      const session = gsm.getSession('guest-1')!;
      expect(session.gameId).toBeNull();
      expect(session.playerId).toBeNull();
      // Session itself still exists (for party in future)
      expect(gsm.getSession('guest-1')).toBeDefined();
    });

    it('does NOT remove recently disconnected sessions without game', () => {
      gsm.handleConnect('guest-1', 'socket-1');
      gsm.handleDisconnect('socket-1');
      // lastSeenAt is recent (just now)

      gsm.sweep();
      expect(gsm.getSession('guest-1')).toBeDefined();
    });
  });

  describe('disconnect does NOT eliminate', () => {
    it('player remains in session after disconnect with active game', () => {
      gsm.handleConnect('guest-1', 'socket-1');
      gsm.bindToGame('guest-1', 'player-1', 'game-1');
      gsm.handleDisconnect('socket-1');

      const session = gsm.getSession('guest-1');
      expect(session).toBeDefined();
      expect(session!.playerId).toBe('player-1');
      expect(session!.gameId).toBe('game-1');
      // socketId is null but game binding persists — player can rejoin anytime
    });
  });
});
