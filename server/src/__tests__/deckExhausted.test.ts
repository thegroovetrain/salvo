// THE DECK-EXHAUSTION SEAM (Story 8.3) — the ADAPTER half, end to end.
//
// `World` may not log and may not import Colyseus (project-context: game/ is
// Colyseus-free and log-free), so a captain running their card pool dry is
// reported out through a plain `WorldOptions.onDeckExhausted` callback — the
// same posture as `zoneSeeds`, where the caller supplies what belongs to the
// adapter. `ArenaRoom.buildWorld` is the caller, and this file pins what it
// supplies:
//
//   * the room's BOUND logger gets `deck.exhausted { shipId }` — one field,
//     the ship id, and nothing about the deck, its contents or its depth
//     (roomId/matchId ride the binding, which is why the call itself is
//     one-field);
//   * `/metrics` `deck.exhausted` counts it;
//   * BOTH happen exactly ONCE per ship record, however many offer-less levels
//     follow (epic-8 amendment 14: the level still banks, silently).
//
// It also pins the ORDER HAZARD: `onCreate` runs `buildWorld` BEFORE
// `initOperability` rebinds `this.log`, so the callback must read `this.log`
// live. The board rebinds the logger AFTER buildWorld and asserts the NEW one
// receives the line — a captured reference would send it to the unbound module
// default instead, losing roomId/matchId on every exhaustion line in
// production.
//
// No server is booted: a bare `new ArenaRoom()` and its real `buildWorld`,
// the operability/decks.test.ts idiom.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CONFIG, DEFAULT_DECKS } from '@salvo/shared';
import type { Logger } from '../log.js';
import { ArenaRoom } from '../rooms/ArenaRoom.js';
import { metricsPayload, resetMetrics } from '../metrics.js';
import type { World } from '../game/world.js';

/** The two private members this board drives, and nothing else. */
interface BareRoom {
  log: Logger;
  buildWorld(seed: number, sanitized: Record<string, unknown>): World;
}

function bareRoom(): BareRoom {
  return new ArenaRoom() as unknown as BareRoom;
}

/** A capturing stand-in for the room's bound logger. */
function stubLogger(): Logger & { info: ReturnType<typeof vi.fn> } {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
}

beforeEach(() => {
  resetMetrics();
});

describe('ArenaRoom.buildWorld — the deck-exhaustion adapter', () => {
  it('logs deck.exhausted { shipId } through the logger bound AFTER buildWorld, and bumps /metrics — exactly once per record', () => {
    const room = bareRoom();
    // The real world the room would sail, built by the real method.
    const world = room.buildWorld(1, {});
    // initOperability's rebinding, reproduced in onCreate's own order.
    const log = stubLogger();
    room.log = log;

    // A deck LIST that names nothing: the drawable pool is empty from tick one.
    const a = world.addShip('a', 'A', 'captain', 'torpedoBoat', undefined, undefined, []);
    a.state.speed = 0;
    world.grantXp(a, 1);
    world.step();

    expect(a.bankedLevels).toBe(1); // the level BANKS (amendment 14)...
    expect(a.offer).toBeNull(); // ...with no hand behind it
    expect(log.info).toHaveBeenCalledTimes(1);
    expect(log.info).toHaveBeenCalledWith('deck.exhausted', { shipId: 'a' });
    expect(metricsPayload().deck.exhausted).toBe(1);

    // Every offer-less level after the first is silent on BOTH channels.
    world.grantXp(a, 1);
    world.step();
    world.grantXp(a, 1);
    world.step();
    expect(a.bankedLevels).toBe(3);
    expect(log.info).toHaveBeenCalledTimes(1);
    expect(metricsPayload().deck.exhausted).toBe(1);
  });

  it('counts a SECOND captain separately — the latch is per record, not per room', () => {
    const room = bareRoom();
    const world = room.buildWorld(2, {});
    const log = stubLogger();
    room.log = log;

    for (const id of ['a', 'b']) {
      const s = world.addShip(id, id.toUpperCase(), 'captain', 'torpedoBoat', undefined, undefined, []);
      s.state.speed = 0;
      world.grantXp(s, 1);
    }
    world.step();

    expect(log.info).toHaveBeenCalledTimes(2);
    expect(log.info).toHaveBeenNthCalledWith(1, 'deck.exhausted', { shipId: 'a' });
    expect(log.info).toHaveBeenNthCalledWith(2, 'deck.exhausted', { shipId: 'b' });
    expect(metricsPayload().deck.exhausted).toBe(2);
  });

  it('the counter is bumped even when the bound logger throws', () => {
    const room = bareRoom();
    const world = room.buildWorld(4, {});
    const log = stubLogger();
    log.info.mockImplementation(() => {
      throw new Error('logger transport down');
    });
    room.log = log;

    const a = world.addShip('a', 'A', 'captain', 'torpedoBoat', undefined, undefined, []);
    a.state.speed = 0;
    world.grantXp(a, 1);
    expect(() => world.step()).not.toThrow();

    expect(a.bankedLevels).toBe(1);
    expect(a.deckExhausted).toBe(true);
    expect(metricsPayload().deck.exhausted).toBe(1);
  });

  it('a HEALTHY deck reports nothing: the default deck draws a full hand', () => {
    const room = bareRoom();
    const world = room.buildWorld(3, {});
    const log = stubLogger();
    room.log = log;

    const a = world.addShip('a', 'A', 'captain', 'torpedoBoat', undefined, undefined, DEFAULT_DECKS.torpedoBoat);
    a.state.speed = 0;
    world.grantXp(a, 1);
    world.step();

    expect(a.offer).toHaveLength(CONFIG.offer.size);
    expect(a.deckExhausted).toBe(false);
    expect(log.info).not.toHaveBeenCalled();
    expect(metricsPayload().deck.exhausted).toBe(0);
  });
});
