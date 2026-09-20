// THE MATCH CONSUMABLE POOL (Story 8.11, catalog-v3 R4/R44, FR43) — the
// SERVER half. The pure roll lives in shared (`sim/pool.ts`, pool.test.ts);
// what this file pins is everything the World and the room do with it:
//
//   THE WORLD    — one pool, rolled ONCE in the constructor before any ship
//                  exists, appended to every captain's and every bot's deck
//                  and to no fleet hull's. An explicit `pool` wins over the
//                  roll and is sanitized to consumable lines only.
//   THE ROOM     — the amendment-10 posture, pool edition (the zoneSeeds.test.ts
//                  pin, modelled): `buildWorld` must pass CALLER-SUPPLIED
//                  entropy, because a pool derived from the client-known
//                  mapSeed would be brute-forceable. Two rooms on the SAME map
//                  seed must therefore be able to roll DIFFERENT pools.
//   THE LOG      — `match.pool { count }`, once per room, COUNT ONLY: the
//                  composition is server-private (NFR20) and no id may ever
//                  reach a log line.
//   THE DEV ARM  — `poolOverride` honoured under HC_DEV_OPTIONS=1, dropped and
//                  reported without it.
//
// Harness: the bare `new ArenaRoom()` idiom (zoneSeeds/operability/solo tests) —
// core's `__init` never runs, but `buildWorld` touches nothing core-owned, and
// `onCreate` is drivable with core's own methods injected (the solo.test.ts
// board).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CATALOG, CONFIG, DEFAULT_DECKS, isStubLine, type LineId } from '@salvo/shared';
import { NO_DECK, World } from '../game/world.js';
import { ArenaRoom } from '../rooms/ArenaRoom.js';
import type { RoomOptions, SanitizedRoomOptions } from '../rooms/roomOptions.js';

interface BuildRoom {
  buildWorld(seed: number, sanitized: SanitizedRoomOptions): World;
}

const buildWorld = (seed: number, sanitized: SanitizedRoomOptions = {}): World =>
  (new ArenaRoom() as unknown as BuildRoom).buildWorld(seed, sanitized);

/** How many of a list's cards `buildDeckState` will actually deal — the stub
 *  lines (four of the five consumables today) are withheld, amendment 67. */
const dealable = (ids: readonly LineId[]): number => ids.filter((id) => !isStubLine(id)).length;

/** A captain's deck, sorted, for multiset comparison. */
const sorted = (ids: readonly string[]): string[] => [...ids].sort();

// --- THE WORLD ---------------------------------------------------------------

describe('World.pool — the roll (Story 8.11)', () => {
  it('a bare World still rolls one: CONFIG.pool.size consumable cards, off the TEST-ONLY map-seed fallback', () => {
    const w = new World(99);
    expect(w.pool).toHaveLength(CONFIG.pool.size);
    for (const id of w.pool) expect(CATALOG[id].kind).toBe('consumable');
    // The fallback is a fixed derivation of the map seed, so it is stable.
    expect(new World(99).pool).toEqual(w.pool);
  });

  it('is DETERMINISTIC per poolSeed, and INDEPENDENT of the map seed', () => {
    const a = new World(1, CONFIG.map.playerCap, CONFIG.zone, { poolSeed: 0xfeed });
    const b = new World(2, CONFIG.map.playerCap, CONFIG.zone, { poolSeed: 0xfeed });
    const c = new World(1, CONFIG.map.playerCap, CONFIG.zone, { poolSeed: 0xbeef });
    expect(b.pool).toEqual(a.pool); // same private seed, different maps ⇒ same pool
    expect(c.pool).not.toEqual(a.pool); // different private seed ⇒ different pool
  });

  it('an EXPLICIT pool wins over the roll, and is sanitized to CONSUMABLE lines only', () => {
    const w = new World(1, CONFIG.map.playerCap, CONFIG.zone, {
      // 'armor' is equipment, 'nope' is unknown: both are dropped silently, so
      // an override can never add an equipment line to anybody's deck. Order
      // and duplicates survive; there is no size clamp.
      pool: ['hullRepair', 'armor', 'nope', 'hullRepair', 'chaff'] as unknown as readonly LineId[],
    });
    expect(w.pool).toEqual(['hullRepair', 'hullRepair', 'chaff']);
  });

  it('the EMPTY pool is a real ask — the fixture every depth pin in this suite uses', () => {
    expect(new World(1, CONFIG.map.playerCap, CONFIG.zone, { pool: [] }).pool).toEqual([]);
  });
});

describe('World.pool — what the seat gets (Story 8.11)', () => {
  const POOL: readonly LineId[] = ['hullRepair', 'hullRepair', 'chaff'] as unknown as readonly LineId[];

  function world(): World {
    return new World(7, CONFIG.map.playerCap, CONFIG.zone, { pool: POOL });
  }

  it('a captain deals the AUTHORED list plus the pool; deckList stays the authored 40', () => {
    const w = world();
    const rec = w.addShip('a', 'A', 'captain', 'torpedoBoat', undefined, undefined, DEFAULT_DECKS.torpedoBoat);
    expect(rec.deckList).toBe(DEFAULT_DECKS.torpedoBoat);
    expect(rec.deckList).toHaveLength(CONFIG.deck.size);
    // 30 authored dealable cards — the TB list less its stubs, which Story
    // 8.13 took from 27 by un-stubbing LIGHT TORPEDO and SUPERCAV TORPEDO —
    // plus the pool's dealable copies (CHAFF is still a stub, so it joins the
    // multiset and is never dealt: amendment 11's rule, applied to the pool by
    // the SAME `isDealable`).
    expect(rec.deck.cards).toHaveLength(30 + dealable(POOL));
    expect(rec.deck.cards.filter((id) => id === 'chaff')).toHaveLength(0);
  });

  it('EVERY participant gets the SAME pool — one roll, one list, whenever they board', () => {
    const w = world();
    const cap = w.addShip('a', 'A', 'captain', 'torpedoBoat', undefined, undefined, DEFAULT_DECKS.torpedoBoat);
    const late = w.addShip('b', 'B', 'captain', 'torpedoBoat', undefined, undefined, DEFAULT_DECKS.torpedoBoat);
    const bot = w.addBot('torpedoBoat', undefined, (h) => DEFAULT_DECKS[h]);
    expect(sorted(late.deck.cards)).toEqual(sorted(cap.deck.cards));
    expect(sorted(bot.deck.cards)).toEqual(sorted(cap.deck.cards));
  });

  it('a FLEET HULL gets the frozen EMPTY deck and no pool (amendments 12/24)', () => {
    const w = world();
    const drone = w.addShip('d', 'D', 'fleet', 'droneSmall', undefined, undefined, DEFAULT_DECKS.torpedoBoat);
    expect(drone.deck.cards).toEqual([]);
    expect(drone.deckList).toEqual([]);
  });

  it('a captain with NO list still gets the pool — the list and the pool are independent inputs', () => {
    const w = world();
    const rec = w.addShip('a', 'A', 'captain', 'torpedoBoat', undefined, undefined, NO_DECK('torpedoBoat'));
    expect(rec.deckList).toEqual([]);
    expect(rec.deck.cards).toHaveLength(dealable(POOL));
  });

  it('redeploy does NOT re-append the pool: the deck is PRESERVED as 8.10 built it', () => {
    const w = world();
    const rec = w.addShip('a', 'A', 'captain', 'torpedoBoat', undefined, undefined, DEFAULT_DECKS.torpedoBoat);
    const before = rec.deck;
    w.resetForMatchStart();
    expect(w.ships.get('a')!.deck).toBe(before);
  });
});

// --- THE ROOM (the amendment-10 posture, pool edition) -----------------------

describe('ArenaRoom.buildWorld — the match pool is ROOM entropy, never the map seed', () => {
  it('two rooms on the SAME map seed roll DIFFERENT pools (private material reaches the world)', () => {
    // If buildWorld stopped passing poolSeed, every world would fall back to
    // the map-seed derivation and two rooms on one seed would deal IDENTICAL
    // pools — which a client that can read its own mapSeed could reconstruct.
    // The pool is a small multiset, so two rolls can legitimately collide;
    // over a handful of rooms a difference must appear.
    const first = buildWorld(1234).pool;
    let differed = false;
    for (let i = 0; i < 8 && !differed; i += 1) {
      differed = JSON.stringify(buildWorld(1234).pool) !== JSON.stringify(first);
    }
    expect(differed).toBe(true);
    // The map itself stays seed-deterministic — only the pool moved.
    expect(buildWorld(1234).map).toEqual(buildWorld(1234).map);
  });

  it('honours a sanitized poolOverride, dropping anything that is not a consumable line', () => {
    const w = buildWorld(1234, { poolOverride: ['hullRepair', 'armor', 'chaff'] });
    expect(w.pool).toEqual(['hullRepair', 'chaff']);
  });

  it('rolls a full pool when no override is supplied', () => {
    expect(buildWorld(1234).pool).toHaveLength(CONFIG.pool.size);
  });
});

// --- THE ROOM'S LOG + THE DEV GATE (the real onCreate) ----------------------

interface PoolRoom {
  world: World;
  onCreate(options?: RoomOptions): void;
}

/** A real onCreate on a bare room, with core's own methods injected (the
 *  solo.test.ts board — the REAL construction order is the point). */
function room(options: RoomOptions): PoolRoom {
  const r = new ArenaRoom() as unknown as PoolRoom & Record<string, unknown>;
  r.lock = vi.fn(() => Promise.resolve());
  r.unlock = vi.fn(() => Promise.resolve());
  r.disconnect = vi.fn(() => Promise.resolve());
  r.broadcast = vi.fn();
  r.onMessage = vi.fn();
  r.setTimestep = vi.fn();
  r.clock = { setInterval: vi.fn(), setTimeout: vi.fn() };
  r.clients = [];
  r.onCreate(options);
  return r;
}

let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  delete process.env.HC_DEV_OPTIONS;
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  delete process.env.HC_DEV_OPTIONS;
  vi.restoreAllMocks();
});

/** All captured log lines starting with `prefix`. */
function lines(prefix: string): string[] {
  return logSpy.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith(`${prefix} `));
}

/** Parse the JSON field tail of a `level event {json}` line. */
function fieldsOf(line: string): Record<string, unknown> {
  return JSON.parse(line.slice(line.indexOf('{'))) as Record<string, unknown>;
}

describe('the room log — match.pool { count } and nothing else', () => {
  it('logs the COUNT exactly once per room, with no id anywhere in the line', () => {
    const r = room({ solo: true });
    const logged = lines('info match.pool');
    expect(logged).toHaveLength(1);
    // EXACTLY one field. roomId/matchId ride the bound logger (which is why
    // the line is logged after initOperability), and the composition — the
    // thing a client must never learn — is simply not here.
    const fields = fieldsOf(logged[0]);
    expect(fields.count).toBe(r.world.pool.length);
    expect(fields.count).toBe(CONFIG.pool.size);
    // The BOUND logger adds roomId/matchId/mode/tick to every line it writes;
    // `count` is the only field this call itself passes.
    const bound = ['roomId', 'matchId', 'mode', 'tick'];
    expect(Object.keys(fields).filter((k) => !bound.includes(k))).toEqual(['count']);
    // FAIL-PROOF for "no ids": every line the room wrote, scanned for one.
    const all = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    for (const id of new Set(r.world.pool)) expect(all).not.toContain(id);
  });
});

describe('the dev match pool — poolOverride through the real onCreate', () => {
  it('is HONOURED under HC_DEV_OPTIONS=1, and nothing is reported rejected', () => {
    process.env.HC_DEV_OPTIONS = '1';
    const r = room({ solo: true, poolOverride: ['hullRepair', 'hullRepair', 'armor'] });
    expect(r.world.pool).toEqual(['hullRepair', 'hullRepair']); // equipment dropped
    expect(lines('warn room.devOptionsRejected')).toEqual([]);
    // Every bot in the fleet sails it, so a smoke's pool is the whole lobby's.
    const decks = [...r.world.ships.values()].map((s) => s.deck.cards.filter((id) => id === 'hullRepair').length);
    expect(new Set(decks).size).toBe(1);
    expect(decks[0]).toBe(3 + 2); // the default deck's three copies + the pool's two
  });

  it('is DROPPED and REPORTED without the gate — production rolls its own', () => {
    const r = room({ solo: true, poolOverride: ['hullRepair', 'hullRepair', 'hullRepair'] });
    expect(r.world.pool).toHaveLength(CONFIG.pool.size);
    const rejected = lines('warn room.devOptionsRejected');
    expect(rejected).toHaveLength(1);
    expect(fieldsOf(rejected[0])).toMatchObject({ rejected: ['poolOverride'] });
  });
});
