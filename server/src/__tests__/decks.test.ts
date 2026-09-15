// THE DECK DOOR (Story 8.2) — the loader, the two doors, the refusal, and the
// reservation transport. Every row of the spec's I/O matrix that involves a
// room lives here; the pure rules live in shared (deckRules.test.ts) and the
// sanitizer in roomOptions.test.ts.
//
//   THE LOADER   — `loadDeckFor` answers the hull's DEFAULT deck and ignores
//                  `userId`/`deckId` (the Epic 9 port); a default always passes
//                  the door's check.
//   THE ARENA    — the REAL `onJoin` on a bare `new ArenaRoom()` (the
//                  operability/solo idiom): a client `deck` key refuses; a
//                  dev `deckOverride` is honoured under HC_DEV_OPTIONS=1 and
//                  refused when illegal, NEVER substituted; without the env it
//                  is dropped and logged; a seat-carried `client.auth.deck` is
//                  used as-is (no re-load); a malformed seat value refuses.
//   THE QUEUE    — the REAL `onJoin` on a bare `new StandardQueueRoom()`: the
//                  same refusals BEFORE the pool push (pool untouched), and —
//                  through a partial mock of `matchMaker` — the proof that the
//                  frozen deck is written into the reservation's SERVER-ONLY
//                  `auth`, never into `options`.
//   THE WIRE     — the welcome carries no deck key (the frame pin is the
//                  perception invariant).
//
// WHAT THIS FILE CANNOT PROVE IN-PROCESS: that @colyseus/core carries the
// reservation's `auth` into `client.auth` before `onJoin`. That path runs
// through `_reserveSeat` → `_onJoin`, which needs a live matchmaker driver.
// It is verified by reading @colyseus/core 0.18.13 (MatchMaker.mjs :461-481 →
// Room.mjs :1313 → :1098-1099 → :1125) and PROVED over real sockets by
// queueSmoke.mjs, whose arena `client.join` log lines carry
// `deckSource: 'seat'` for every queued captain.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClientState, ServerError, matchMaker } from 'colyseus';
import {
  CONFIG,
  DEFAULT_DECKS,
  DEFAULT_OWNED,
  MSG,
  SHIP_CLASS_IDS,
  checkDeck,
  mulberry32,
  type LineId,
  type Rng,
  type ShipClassId,
} from '@salvo/shared';
import { ArenaRoom } from '../rooms/ArenaRoom.js';
import { StandardQueueRoom } from '../rooms/StandardQueueRoom.js';
import { DECK_REFUSED_CODE, loadDeckFor } from '../game/decks.js';
import { World } from '../game/world.js';

// --- the matchMaker seam (the queue's ONLY matchmaker calls, captured) ------

const { seams } = vi.hoisted(() => ({
  seams: {
    createRoom: vi.fn(async () => ({ roomId: 'arena-test', name: 'arena', clients: 0, maxClients: 20, locked: false, metadata: {} })),
    reserveMultipleSeatsFor: vi.fn(async (_room: unknown, clientsData: unknown[]) => clientsData.map(() => true)),
    buildSeatReservation: vi.fn((room: { roomId: string }, sessionId: string) => ({ room, sessionId })),
  },
}));

vi.mock('colyseus', async (importActual) => {
  const actual = await importActual<typeof import('colyseus')>();
  return {
    ...actual,
    matchMaker: {
      ...actual.matchMaker,
      createRoom: seams.createRoom,
      reserveMultipleSeatsFor: seams.reserveMultipleSeatsFor,
      buildSeatReservation: seams.buildSeatReservation,
    },
  };
});

// --- console.log spy (the logger's only sink) ---------------------------------

let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  delete process.env.HC_DEV_OPTIONS;
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  seams.createRoom.mockClear();
  seams.reserveMultipleSeatsFor.mockClear();
  seams.buildSeatReservation.mockClear();
});

afterEach(() => {
  logSpy.mockRestore();
  delete process.env.HC_DEV_OPTIONS;
});

/** All captured log lines starting with `prefix` (e.g. 'warn deck.illegal'). */
function lines(prefix: string): string[] {
  return logSpy.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith(`${prefix} `));
}

/** Parse the JSON field tail of a `level event {json}` line. */
function fieldsOf(line: string): Record<string, unknown> {
  return JSON.parse(line.slice(line.indexOf('{'))) as Record<string, unknown>;
}

const TB = DEFAULT_DECKS.torpedoBoat;
const ML = DEFAULT_DECKS.mineLayer;

/** The refusal, as `expect(...).toThrow` cannot check the code. */
function expectRefusal(fn: () => void, rule: string, sessionId: string): void {
  let caught: unknown = null;
  try {
    fn();
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(ServerError);
  expect((caught as ServerError).code).toBe(DECK_REFUSED_CODE);
  expect((caught as ServerError).message).toBe(`deck illegal: ${rule}`);
  const warned = lines('warn deck.illegal');
  expect(warned).toHaveLength(1); // exactly once per refusal
  expect(fieldsOf(warned[0])).toMatchObject({ rule, sessionId });
  // Never the deck's contents in a log line.
  for (const l of logSpy.mock.calls.map((c) => String(c[0]))) expect(l).not.toContain('"armor"');
}

// --- THE LOADER ---------------------------------------------------------------

describe('loadDeckFor — the one port a deck enters through (no account module)', () => {
  it.each(SHIP_CLASS_IDS)('%s: answers the hull\'s DEFAULT deck, by reference, whatever userId/deckId say', (hull) => {
    expect(loadDeckFor(null, undefined, hull)).toBe(DEFAULT_DECKS[hull]);
    expect(loadDeckFor('user-1', 'my-deck', hull)).toBe(DEFAULT_DECKS[hull]); // the Epic 9 port, ignored today
    expect(loadDeckFor(null, '', hull)).toBe(DEFAULT_DECKS[hull]);
  });

  it('a default deck ALWAYS passes the door\'s check — so today only a dev override can be refused', () => {
    for (const hull of SHIP_CLASS_IDS) expect(checkDeck(loadDeckFor(null, undefined, hull), DEFAULT_OWNED)).toEqual({ ok: true });
  });

  it('DECK_REFUSED_CODE is an app code outside every Colyseus ErrorCode / CloseCode', () => {
    expect(DECK_REFUSED_CODE).toBe(4402);
    expect([520, 521, 522, 523, 524, 525, 526, 4217]).not.toContain(DECK_REFUSED_CODE); // ErrorCode
    expect([1000, 1001, 1005, 1006, 4000, 4001, 4002, 4003, 4010]).not.toContain(DECK_REFUSED_CODE); // CloseCode
    expect(DECK_REFUSED_CODE).not.toBe(525); // the client maps THAT one to "VERSION MISMATCH"
  });
});

// --- THE ARENA DOOR -------------------------------------------------------------

interface ArenaClient {
  sessionId: string;
  state: ClientState;
  auth?: unknown;
  send: ReturnType<typeof vi.fn>;
  leave: ReturnType<typeof vi.fn>;
}

interface ArenaDoor {
  world: World;
  match: null;
  state: { players: Map<string, unknown>; mapSeed: number; mapRadius: number };
  clients: ArenaClient[];
  clock: { setTimeout: ReturnType<typeof vi.fn> };
  hueRng: Rng;
  setMetadata: ReturnType<typeof vi.fn>;
  onJoin(client: ArenaClient, options?: unknown): void;
}

function arenaClient(id: string, auth?: unknown): ArenaClient {
  const c: ArenaClient = { sessionId: id, state: ClientState.JOINING, send: vi.fn(), leave: vi.fn() };
  if (auth !== undefined) c.auth = auth;
  return c;
}

/** Bare arena with a real (islandless) World — the operability joinRoom idiom. */
function arenaDoor(): ArenaDoor {
  const room = new ArenaRoom() as unknown as ArenaDoor;
  const w = new World(1);
  w.map.islands.length = 0;
  room.world = w;
  room.match = null;
  room.state = { players: new Map(), mapSeed: 1, mapRadius: w.map.radius };
  room.clients = [];
  room.clock = { setTimeout: vi.fn() };
  room.hueRng = mulberry32(1);
  room.setMetadata = vi.fn(() => Promise.resolve());
  return room;
}

/** Push (core does it BEFORE onJoin) and run the real onJoin. */
function joinArena(room: ArenaDoor, client: ArenaClient, options: Record<string, unknown> = {}): void {
  room.clients.push(client);
  room.onJoin(client, options);
}

describe('the arena door — a captain with no seat deck (Solo vs AI, dev direct join)', () => {
  it('loads the hull\'s default deck itself, stores it on the record, and deals 23 drawable cards', () => {
    const room = arenaDoor();
    joinArena(room, arenaClient('s1'), { cls: 'mineLayer' });
    const rec = room.world.ships.get('s1')!;
    expect(rec.deckList).toBe(ML);
    expect(rec.deck.cards).toHaveLength(23);
    expect(room.state.players.has('s1')).toBe(true);
    expect(lines('warn deck.illegal')).toEqual([]);
    expect(fieldsOf(lines('info client.join')[0])).toMatchObject({ sessionId: 's1', deckSource: 'door' });
  });

  it('REFUSES a client `deck` key — nothing is spawned, no roster row, no welcome', () => {
    const room = arenaDoor();
    const c = arenaClient('s1');
    expectRefusal(() => joinArena(room, c, { cls: 'torpedoBoat', deck: [...TB] }), 'clientSupplied', 's1');
    expect(room.world.ships.has('s1')).toBe(false);
    expect(room.state.players.has('s1')).toBe(false);
    expect(c.send).not.toHaveBeenCalled();
    expect(room.clock.setTimeout).not.toHaveBeenCalled(); // no joining deadline armed either
  });

  it('refuses the `deck` key even when it is undefined — the KEY is the offence', () => {
    const room = arenaDoor();
    expectRefusal(() => joinArena(room, arenaClient('s1'), { deck: undefined }), 'clientSupplied', 's1');
  });

  it('honours a LEGAL dev deckOverride under HC_DEV_OPTIONS=1 — the default is NOT used', () => {
    process.env.HC_DEV_OPTIONS = '1';
    const room = arenaDoor();
    // A TB sailing the MINE LAYER's default: legal (three equipment lines, all owned).
    joinArena(room, arenaClient('s1'), { cls: 'torpedoBoat', deckOverride: [...ML] });
    const rec = room.world.ships.get('s1')!;
    expect(rec.deckList).toEqual(ML);
    expect(rec.deckList).not.toBe(TB);
    expect(Object.isFrozen(rec.deckList)).toBe(true);
    expect(lines('warn deck.devOptionsRejected')).toEqual([]);
  });

  it.each([
    ['size', [...TB, 'armor']],
    ['equipmentLines', [...TB.slice(1), 'navalMines']], // a fourth equipment line, owned
    ['unowned', [...TB.slice(1), 'phosphorShells']],
    ['overCap', [...TB.slice(1), 'acousticHoming']],
  ] as const)('REFUSES an illegal dev override (%s) and never substitutes the default', (rule, override) => {
    process.env.HC_DEV_OPTIONS = '1';
    const room = arenaDoor();
    expectRefusal(() => joinArena(room, arenaClient('s1'), { cls: 'torpedoBoat', deckOverride: [...override] }), rule, 's1');
    expect(room.world.ships.has('s1')).toBe(false);
  });

  it('DROPS a deckOverride without HC_DEV_OPTIONS, logs it once, and sails the default', () => {
    const room = arenaDoor();
    joinArena(room, arenaClient('s1'), { cls: 'battleship', deckOverride: [...TB, 'armor'] }); // would be illegal if honoured
    const rec = room.world.ships.get('s1')!;
    expect(rec.deckList).toBe(DEFAULT_DECKS.battleship);
    const dropped = lines('warn deck.devOptionsRejected');
    expect(dropped).toHaveLength(1);
    expect(fieldsOf(dropped[0])).toMatchObject({ rejected: ['deckOverride'] });
    expect(lines('warn deck.illegal')).toEqual([]);
  });

  it('a malformed dev override (unknown id) is dropped by the sanitizer and the default is used — not a refusal', () => {
    process.env.HC_DEV_OPTIONS = '1';
    const room = arenaDoor();
    joinArena(room, arenaClient('s1'), { cls: 'torpedoBoat', deckOverride: [...TB.slice(1), 'nope'] });
    expect(room.world.ships.get('s1')!.deckList).toBe(TB);
    expect(lines('warn deck.illegal')).toEqual([]);
  });

  it('accepts and ignores deckId (the Epic 9 port): the default is used', () => {
    const room = arenaDoor();
    joinArena(room, arenaClient('s1'), { cls: 'torpedoBoat', deckId: 'my-deck' });
    expect(room.world.ships.get('s1')!.deckList).toBe(TB);
  });

  it('the welcome carries no deck, deckList or deckId key — its `config.deck` is the two public rule dials and nothing else', () => {
    const room = arenaDoor();
    const c = arenaClient('s1');
    joinArena(room, c, { cls: 'torpedoBoat' });
    const welcome = c.send.mock.calls.find((call) => call[0] === MSG.welcome)!;
    expect(welcome).toBeDefined();
    const payload = welcome[1] as { config: { deck: unknown } } & Record<string, unknown>;
    // The welcome ships the CONFIG snapshot, whose `deck` block (since 8.1)
    // is the two rule numbers every client may know — the SAME numbers the
    // pre-queue gate will read in Epic 9. It is not deck state: pinned to
    // exactly those two dials, so a contents/id/owned field can never hide
    // inside it.
    expect(payload.config.deck).toEqual({ size: CONFIG.deck.size, maxEquipmentLines: CONFIG.deck.maxEquipmentLines });
    // Everything OUTSIDE the config snapshot: no deck-shaped key at all.
    const text = JSON.stringify({ ...payload, config: undefined });
    for (const key of ['"deck"', '"deckList"', '"deckId"']) expect(text).not.toContain(key);
    for (const key of ['"deckList"', '"deckId"']) expect(JSON.stringify(payload)).not.toContain(key);
  });
});

describe('the arena door — a queue-seated captain (client.auth.deck)', () => {
  it('uses the seat-carried list AS IS — no re-load, no substitution — and logs deckSource seat', () => {
    const room = arenaDoor();
    // The seat carries the ML default for a TB-class join: if the arena
    // re-loaded, deckList would be the TB default; it must be the seat's.
    joinArena(room, arenaClient('s1', { deck: ML }), { cls: 'torpedoBoat' });
    const rec = room.world.ships.get('s1')!;
    expect(rec.deckList).toBe(ML);
    expect(rec.deck.cards).toHaveLength(ML.filter((id) => !['captiveMines', 'flak', 'hullRepair', 'shieldBlock', 'smokeScreen', 'chaff'].includes(id)).length);
    expect(fieldsOf(lines('info client.join')[0])).toMatchObject({ sessionId: 's1', deckSource: 'seat' });
  });

  it('carries the rest of a server-written auth payload alongside the deck (the Epic 9 shape)', () => {
    const room = arenaDoor();
    joinArena(room, arenaClient('s1', { userId: 'u-1', deck: TB }), { cls: 'torpedoBoat' });
    expect(room.world.ships.get('s1')!.deckList).toBe(TB);
  });

  it('a seat deck wins over a dev deckOverride in the options (the queue already honoured it)', () => {
    process.env.HC_DEV_OPTIONS = '1';
    const room = arenaDoor();
    joinArena(room, arenaClient('s1', { deck: ML }), { cls: 'torpedoBoat', deckOverride: [...TB] });
    expect(room.world.ships.get('s1')!.deckList).toBe(ML);
  });

  it('still refuses a client `deck` key in the options, seat or no seat', () => {
    const room = arenaDoor();
    expectRefusal(() => joinArena(room, arenaClient('s1', { deck: TB }), { deck: [...TB] }), 'clientSupplied', 's1');
  });

  it('a MALFORMED seat value is a bug that refuses loudly — never sails a default instead', () => {
    const room = arenaDoor();
    expectRefusal(() => joinArena(room, arenaClient('s1', { deck: 'armor' }), { cls: 'torpedoBoat' }), 'size', 's1');
    expect(room.world.ships.has('s1')).toBe(false);
  });

  it('a seat value that fails a rule refuses with that rule', () => {
    const room = arenaDoor();
    expectRefusal(() => joinArena(room, arenaClient('s1', { deck: [...TB.slice(1), 'phosphorShells'] }), {}), 'unowned', 's1');
  });

  it('an auth payload WITHOUT a deck (a bare verdict, an object without the key) falls to the door path', () => {
    for (const auth of [true, {}, { userId: 'u' }]) {
      const room = arenaDoor();
      joinArena(room, arenaClient('s1', auth), { cls: 'mineLayer' });
      expect(room.world.ships.get('s1')!.deckList).toBe(ML);
    }
  });
});

// --- THE QUEUE DOOR --------------------------------------------------------------

interface QueueClient {
  sessionId: string;
  state: ClientState;
  auth: unknown;
  send: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  leave: ReturnType<typeof vi.fn>;
}

interface QueueDoor {
  pool: { client: QueueClient; options: Record<string, unknown>; deck: readonly LineId[] }[];
  clients: QueueClient[];
  onJoin(client: QueueClient, options?: unknown): void;
  onLeave(client: QueueClient): void;
}

function queueClient(id: string): QueueClient {
  // `auth` is what the queue's own static onAuth left there: the bare verdict.
  return { sessionId: id, state: ClientState.JOINING, auth: true, send: vi.fn(), error: vi.fn(), leave: vi.fn() };
}

/** Bare queue room with the real onCreate (the colyseus018 bareQueue idiom). */
function queueDoor(): QueueDoor {
  const r = new StandardQueueRoom() as unknown as QueueDoor & Record<string, unknown>;
  r.clients = [];
  r.clock = { currentTime: 0, setInterval: vi.fn(() => 0), setTimeout: vi.fn(() => 0) };
  r.setMetadata = vi.fn(() => Promise.resolve());
  (r.onCreate as () => void)();
  return r;
}

function joinQueue(room: QueueDoor, client: QueueClient, options: Record<string, unknown> = {}): void {
  room.clients.push(client);
  room.onJoin(client, options);
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('the queue door — refusals happen BEFORE the pool push', () => {
  it('pools a captain with the frozen default deck for the class', () => {
    const room = queueDoor();
    joinQueue(room, queueClient('q1'), { cls: 'battleship', name: 'A' });
    expect(room.pool).toHaveLength(1);
    expect(room.pool[0].deck).toBe(DEFAULT_DECKS.battleship);
    // `deckId` is forwarded to the arena options; nothing deck-shaped else is.
    joinQueue(room, queueClient('q2'), { cls: 'torpedoBoat', deckId: ' d1 ', deckOverride: [...TB] });
    expect(room.pool[1].options).toEqual({ name: undefined, cls: 'torpedoBoat', horn: 'standard', colorPref: undefined, deckId: ' d1 ' });
    expect('deck' in room.pool[1].options).toBe(false);
    expect('deckOverride' in room.pool[1].options).toBe(false);
  });

  it('REFUSES a client `deck` key: not pooled, and a later onLeave finds nothing to splice', () => {
    const room = queueDoor();
    const c = queueClient('q1');
    expectRefusal(() => joinQueue(room, c, { cls: 'torpedoBoat', deck: [...TB] }), 'clientSupplied', 'q1');
    expect(room.pool).toHaveLength(0);
    expect(c.send).not.toHaveBeenCalled(); // no queueStatus for a refused captain
    room.onLeave(c); // core's teardown after the throw
    expect(room.pool).toHaveLength(0);
    expect(lines('info queue.leave')).toEqual([]);
  });

  it('REFUSES an illegal dev override under HC_DEV_OPTIONS=1 and honours a legal one', () => {
    process.env.HC_DEV_OPTIONS = '1';
    const room = queueDoor();
    expectRefusal(() => joinQueue(room, queueClient('q1'), { cls: 'torpedoBoat', deckOverride: [...TB, 'armor'] }), 'size', 'q1');
    expect(room.pool).toHaveLength(0);
    joinQueue(room, queueClient('q2'), { cls: 'torpedoBoat', deckOverride: [...ML] });
    expect(room.pool).toHaveLength(1);
    expect(room.pool[0].deck).toEqual(ML);
  });

  it('DROPS a deckOverride without HC_DEV_OPTIONS (logged once) and pools the default', () => {
    const room = queueDoor();
    joinQueue(room, queueClient('q1'), { cls: 'torpedoBoat', deckOverride: [...TB, 'armor'] });
    expect(room.pool[0].deck).toBe(TB);
    expect(lines('warn deck.devOptionsRejected')).toHaveLength(1);
  });
});

describe('the queue door — the frozen deck rides the reservation\'s server-only `auth`', () => {
  it('writes { ...client.auth, deck } into auth and NOTHING deck-shaped into options, for every seated captain', async () => {
    const room = queueDoor();
    const classes: ShipClassId[] = ['torpedoBoat', 'battleship', 'mineLayer'];
    for (let i = 0; i < CONFIG.map.playerCap; i += 1) {
      joinQueue(room, queueClient(`q${i}`), { cls: classes[i % 3], name: `C${i}`, deckId: `d${i}` });
    }
    // The cap trips an immediate form (queue policy); let its awaits settle.
    await flush();
    await flush();
    expect(seams.createRoom).toHaveBeenCalledTimes(1);
    expect(seams.createRoom).toHaveBeenCalledWith('arena', { expectedCaptains: CONFIG.map.playerCap });
    expect(seams.reserveMultipleSeatsFor).toHaveBeenCalledTimes(1);
    const clientsData = seams.reserveMultipleSeatsFor.mock.calls[0][1] as { sessionId: string; options: Record<string, unknown>; auth: Record<string, unknown> }[];
    expect(clientsData).toHaveLength(CONFIG.map.playerCap);
    clientsData.forEach((data, i) => {
      expect(data.sessionId).toBe(`q${i}`);
      // THE DECK IS IN `auth`, BY REFERENCE TO THE FROZEN DEFAULT...
      expect(data.auth.deck).toBe(DEFAULT_DECKS[classes[i % 3]]);
      // ...and the bare `true` verdict the queue's onAuth left spreads to nothing.
      expect(Object.keys(data.auth)).toEqual(['deck']);
      // ...and NEVER in `options` — a client-shapeable payload.
      expect(data.options).toEqual({ name: `C${i}`, cls: classes[i % 3], horn: 'standard', colorPref: undefined, deckId: `d${i}` });
      for (const key of ['deck', 'deckOverride']) expect(key in data.options).toBe(false);
    });
    expect(seams.buildSeatReservation).toHaveBeenCalledTimes(CONFIG.map.playerCap);
    expect(room.pool).toHaveLength(0);
  });

  it('carries an OBJECT auth payload through (the Epic 9 account shape) with the deck added', async () => {
    const room = queueDoor();
    for (let i = 0; i < CONFIG.map.playerCap; i += 1) {
      const c = queueClient(`q${i}`);
      c.auth = { userId: `u${i}` };
      joinQueue(room, c, { cls: 'torpedoBoat' });
    }
    await flush();
    await flush();
    const clientsData = seams.reserveMultipleSeatsFor.mock.calls[0][1] as { auth: Record<string, unknown> }[];
    expect(clientsData[3].auth).toEqual({ userId: 'u3', deck: TB });
  });
});
