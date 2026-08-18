// Story 0.2 (reconnect into your own ship) — the unit-level halves of what
// reconnectSmoke.mjs proves over real sockets:
//   - dropPolicy: the pure hold/teardown decision (grace ONLY for a live-match
//     participant whose hull is afloat; a ghost never arms/holds a countdown).
//   - pv gate: protocolVersionError matrix + ArenaRoom's static onAuth called
//     directly (rejects missing AND mismatched pv with the "refresh" message
//     as a ServerError; reconnects bypass onAuth entirely, so no re-gate).
//   - teardown idempotence: with onDrop defined, @colyseus/core can route a
//     departure into onLeave through several paths (immediate after onDrop,
//     deferred after a failed reconnection, room dispose) — the extracted
//     teardown must make a second call a strict no-op.
//   - sunk-during-grace: a ship killed while its captain is away keeps its
//     REAL combat placement when the grace-expiry teardown eventually runs
//     (recordSink dedupe), instead of being re-recorded as sunk-at-leave.
//   - ghost sailing: while teardown is deferred, the ship keeps being
//     simulated under its last stored input (only removeShip clears the input
//     store) and still counts in the win check.
//
// STORY 6.7 — THE SCUTTLE moved WHEN, never WHAT. `Match.onPlayerLeave` no
// longer deletes an afloat participant's hull; it sinks it (no killer), so the
// departure produces a real `sunk` event, feed line and plume. The hull, its
// input store, its roster row and the match's finish therefore resolve at the
// FOUNDER EDGE — one full Story 5.2 sinking window later — instead of on the
// leave call. Every assertion below is the shipped one, moved to that moment.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CONFIG, LIFECYCLE_ALIVE, MSG, PROTOCOL_VERSION, isSinking, mulberry32, sunkAt, type ResultsMsg, type ShipLifecycle, type WelcomeMsg } from '@salvo/shared';
import { CloseCode, ClientState, ServerError, ErrorCode } from 'colyseus';
import { World } from '../game/world.js';
import { Match, dropPolicy, type MatchHooks } from '../game/match.js';
import { ArenaRoom } from '../rooms/ArenaRoom.js';
import { PlayerMeta } from '../rooms/schema/ArenaState.js';
import { protocolVersionError } from '../rooms/roomOptions.js';

const TIMINGS = { countdownMs: 100, resultsMs: 200, joinWindowMs: 0 }; // 2 ticks / 4 ticks; no gathering window (legacy fast path)
/** Ticks to sail a scuttled hull past its founder edge — DERIVED from the
 *  shared window, never a literal, so a retune of CONFIG.ship.sinkingWindowMs
 *  moves these tests with it. +1 clears the boundary tick itself. */
const SINKING_TICKS = CONFIG.ship.sinkingWindowMs / CONFIG.tick.simDtMs + 1;

// --- harness (match.test.ts pattern + a bare room for the private teardown) --

interface Harness {
  w: World;
  m: Match;
  calls: string[];
  /** The real ArenaRoom.teardown, with world/match/roster injected (no transport). */
  teardown(id: string): void;
  /** The real ArenaRoom.releaseDeparted — production runs it once per step
   *  inside afterStep(), so step() below runs it in the same place. */
  release(): void;
  players: Map<string, unknown>;
}

/**
 * A bare `new ArenaRoom()` never runs @colyseus/core's __init(), so `state`
 * stays a plain property — we inject a plain Map-backed roster plus a real
 * World + Match and call the private teardown directly.
 */
function setup(ids: string[]): Harness {
  const w = new World(1);
  w.map.islands.length = 0;
  const calls: string[] = [];
  const hooks: MatchHooks = {
    lock: () => calls.push('lock'),
    unlock: () => calls.push('unlock'),
    broadcastResults: () => calls.push('results'),
    requeue: () => calls.push('requeue'),
    disconnect: () => calls.push('disconnect'),
  };
  const m = new Match(w, TIMINGS, hooks);
  const players = new Map<string, unknown>();
  for (const id of ids) {
    w.addShip(id, id.toUpperCase());
    players.set(id, {});
    m.notifyRosterChanged();
  }
  const room = new ArenaRoom() as unknown as {
    world: World;
    match: Match | null;
    state: { players: Map<string, unknown> };
    teardown(id: string): void;
    releaseDeparted(force?: boolean): void;
  };
  room.world = w;
  room.match = m;
  room.state = { players };
  return {
    w,
    m,
    calls,
    players,
    teardown: (id) => room.teardown(id),
    release: () => room.releaseDeparted(),
  };
}

// The production step order (ArenaRoom.runStep): world.step -> match.update
// (which reaps a foundered departed hull) -> afterStep (which releases its
// seat). The roster row's lifetime is only correct if all three run.
function step(h: Harness, ticks = 1): void {
  for (let i = 0; i < ticks; i++) {
    h.w.step();
    h.m.update();
    h.release();
  }
}

function activate(h: Harness): void {
  expect(h.m.phase).toBe('countdown');
  for (let i = 0; i < 100 && h.m.phase !== 'active'; i++) step(h);
  expect(h.m.phase).toBe('active');
}

function input(seq: number, throttle: number, rudder = 0): unknown {
  return { seq, throttle, rudder, aim: 0, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0 };
}

// --- dropPolicy --------------------------------------------------------------

describe('dropPolicy', () => {
  it('holds ONLY a reconnectable-close, active-match participant whose hull is afloat', () => {
    expect(dropPolicy(true, true, true, true)).toBe('hold');
  });

  it('tears down every other combination (full 4-D matrix)', () => {
    for (const matchActive of [true, false]) {
      for (const hasShip of [true, false]) {
        for (const shipAlive of [true, false]) {
          for (const reconnectable of [true, false]) {
            if (matchActive && hasShip && shipAlive && reconnectable) continue;
            expect(dropPolicy(matchActive, hasShip, shipAlive, reconnectable)).toBe('teardown');
          }
        }
      }
    }
  });

  it('a punitive close never holds, even for a live afloat participant', () => {
    // reconnectableClose=false is the room mapping of WITH_ERROR 4002 (kick),
    // server shutdown, etc. — a kicked client must not earn the grace window.
    expect(dropPolicy(true, true, true, false)).toBe('teardown');
  });
});

// --- pv gate -----------------------------------------------------------------

describe('protocolVersionError', () => {
  it('accepts the exact PROTOCOL_VERSION', () => {
    expect(protocolVersionError(PROTOCOL_VERSION)).toBeNull();
  });

  it('rejects missing, mismatched, and wrong-typed pv with a "refresh" message', () => {
    for (const bad of [undefined, null, PROTOCOL_VERSION + 1, PROTOCOL_VERSION - 1, String(PROTOCOL_VERSION), NaN]) {
      const msg = protocolVersionError(bad);
      expect(msg).toMatch(/refresh/);
      expect(msg).toContain(`v${PROTOCOL_VERSION}`);
    }
  });
});

// Story 6.1 closed the arena's PUBLIC door: static onAuth now also rejects any
// direct joinOrCreate('arena') unless HC_DEV_OPTIONS=1. The pv-gate assertions
// below are about the OTHER half of that method, so they run with the dev door
// open; the closed-door matrix itself lives in queue.test.ts.
describe('ArenaRoom static onAuth (pv gate)', () => {
  const previous = process.env.HC_DEV_OPTIONS;
  beforeEach(() => {
    process.env.HC_DEV_OPTIONS = '1';
  });
  afterEach(() => {
    if (previous === undefined) delete process.env.HC_DEV_OPTIONS;
    else process.env.HC_DEV_OPTIONS = previous;
  });

  it('resolves truthy for a matching pv', async () => {
    await expect(ArenaRoom.onAuth('', { pv: PROTOCOL_VERSION })).resolves.toBe(true);
  });

  it('throws a ServerError(AUTH_FAILED) with the refresh message when pv is missing', async () => {
    const err = await ArenaRoom.onAuth('', {}).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ServerError);
    expect((err as ServerError).code).toBe(ErrorCode.AUTH_FAILED);
    expect((err as ServerError).message).toMatch(/refresh/);
  });

  it('rejects a mismatched pv (stale bundle) and absent options', async () => {
    await expect(ArenaRoom.onAuth('', { pv: PROTOCOL_VERSION + 1 })).rejects.toThrow(/refresh/);
    await expect(ArenaRoom.onAuth('')).rejects.toThrow(/refresh/);
  });
});

// --- teardown idempotence ----------------------------------------------------

describe('ArenaRoom.teardown', () => {
  it('runs the full leave teardown once: hull scuttled, ship + roster released at the founder edge', () => {
    const h = setup(['a', 'b', 'c']);
    activate(h);
    h.teardown('a');
    // THE SCUTTLE: the hull is SUNK, not deleted, so the departure reads as an
    // ordinary sinking. It is still in the world, mid-window...
    expect(isSinking(h.w.ships.get('a')!.lifecycle)).toBe(true);
    // ...and its roster row is still there, because the `sunk` event is framed
    // a tick later and every client resolves the feed name off the live roster.
    // Deleting the row here is what rendered the departure as UNKNOWN VESSEL.
    expect(h.players.has('a')).toBe(true);
    step(h, SINKING_TICKS);
    // Founder edge: the wreck is reaped and the seat is fully released.
    expect(h.w.ships.has('a')).toBe(false);
    expect(h.players.has('a')).toBe(false);
    expect(h.m.phase).toBe('active'); // b + c still fighting
  });

  it('is idempotent — a second call is a strict no-op, DURING the window and after it', () => {
    const h = setup(['a', 'b']);
    activate(h);
    h.teardown('a'); // b is the last afloat captain: the outcome latches on a's scuttle
    // The finish now waits out the scuttled hull's window (the outcome latch),
    // so a repeat leave arrives while the row is deliberately still present —
    // the case the presence guard alone could no longer answer.
    const callsMidWindow = [...h.calls];
    h.teardown('a'); // the drop -> failed-reconnect path reaches onLeave again
    expect(h.calls).toEqual(callsMidWindow); // no second results broadcast
    expect(isSinking(h.w.ships.get('a')!.lifecycle)).toBe(true); // window NOT truncated
    step(h, SINKING_TICKS);
    expect(h.m.phase).toBe('finished');
    const callsAfterFirst = [...h.calls];
    const placementsAfterFirst = new Map(h.m.placements);
    h.teardown('a'); // ...and again once the seat is fully released
    expect(h.calls).toEqual(callsAfterFirst);
    expect(h.m.placements).toEqual(placementsAfterFirst);
    expect(h.m.winnerId).toBe('b');
  });

  it('keeps the REAL combat placement for a ship sunk during its grace window', () => {
    const h = setup(['a', 'b', 'c']);
    activate(h);
    // a is killed by b while its captain is disconnected (grace pending, no teardown).
    h.w.sinkShip('a', 'b');
    step(h); // consumeSinks records a's combat sink
    expect(h.m.phase).toBe('active');
    // Grace expires later -> teardown runs. recordSink must dedupe (a already sank).
    h.teardown('a');
    expect(h.w.ships.has('a')).toBe(false);
    // b sinks next; c is the last human afloat -> the outcome latches at c and
    // the finish waits out b's sinking window (amendment 17 reversed).
    h.w.sinkShip('b');
    step(h, CONFIG.ship.sinkingWindowMs / CONFIG.tick.simDtMs + 1);
    expect(h.m.phase).toBe('finished');
    expect(h.m.winnerId).toBe('c');
    // Real order: a sank FIRST (worst placement). A double-recorded sink-at-leave
    // would have re-slotted a AFTER b in the sink order (a=2nd, b=3rd).
    expect(h.m.placements.get('c')).toBe(1);
    expect(h.m.placements.get('b')).toBe(2);
    expect(h.m.placements.get('a')).toBe(3);
  });

  it('sandbox rooms (match=null) tear down via bare removeShip', () => {
    const w = new World(1);
    w.map.islands.length = 0;
    w.addShip('a', 'A');
    const players = new Map<string, unknown>([['a', {}]]);
    const room = new ArenaRoom() as unknown as {
      world: World;
      match: Match | null;
      state: { players: Map<string, unknown> };
      teardown(id: string): void;
    };
    room.world = w;
    room.match = null;
    room.state = { players };
    room.teardown('a');
    room.teardown('a'); // idempotent here too
    expect(w.ships.has('a')).toBe(false);
    expect(players.has('a')).toBe(false);
  });
});

// --- ghost sailing during the grace window -----------------------------------

describe('deferred teardown (grace window)', () => {
  it('the dropped ship keeps sailing under its last stored input and counts in the win check', () => {
    const h = setup(['a', 'b']);
    activate(h);
    // a's last input before the drop: full throttle, straight rudder.
    expect(h.w.submitInput('a', input(1, 1))).toBe(true);
    const before = { ...h.w.ships.get('a')!.state };
    step(h, 60); // 3s of pilotless sailing — NOTHING tears the ship down
    const after = h.w.ships.get('a')!.state;
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(20);
    // The input store still holds the telegraph (only removeShip clears it).
    expect(h.w.inputs.get('a')?.throttle).toBe(1);
    // Two humans afloat -> the ghost still counts; no win yet.
    expect(h.m.phase).toBe('active');
    // Grace expiry -> teardown SCUTTLES the ship. The input store is still
    // cleared with the ship and b still wins — but both land at the founder
    // edge now, because the hull sails out its Story 5.2 sinking window first.
    h.teardown('a');
    expect(h.w.inputs.get('a')?.throttle).toBe(1); // still stored: nothing removed the ship
    expect(h.m.phase).toBe('active'); // the outcome is latched; the finish waits
    step(h, SINKING_TICKS);
    expect(h.w.inputs.get('a')).toBeUndefined();
    expect(h.m.phase).toBe('finished');
    expect(h.m.winnerId).toBe('b');
  });

  it('a held fireSeq does not re-fire after the drop (edge-triggered click stays consumed)', () => {
    const h = setup(['a', 'b']);
    activate(h);
    // One click (fireSeq 1) fires once; the SAME held value must not fire again.
    expect(
      h.w.submitInput('a', { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 1, aimDist: 0, slot: 0, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0 }),
    ).toBe(true);
    step(h); // click consumed this tick (lastFireSeq catches up)
    const shellsAfterClick = h.w.shells.size;
    step(h, 40); // 2s of the ghost holding fireSeq=1 — no new launches
    expect(h.w.shells.size).toBeLessThanOrEqual(shellsAfterClick);
    expect(h.w.ships.get('a')!.lastFireSeq).toBe(1);
  });
});

// --- onDrop wiring (F4) ------------------------------------------------------
// The pure hold/teardown decision is covered above; this exercises the GLUE in
// ArenaRoom.onDrop: close-code -> reconnectable mapping, allowReconnection call
// (grace seconds), the phase gate, and the F2 results re-send on resume. A bare
// `new ArenaRoom()` never runs core's __init(), so we inject fakes via `as any`
// and stub allowReconnection with a spy returning a controllable promise.

interface WiringRoom {
  world: { ships: Map<string, { lifecycle: ShipLifecycle }> };
  match: { phase: string } | null;
  lastResults: ResultsMsg | null;
  allowReconnection: (client: unknown, seconds: number) => Promise<unknown>;
  onDrop(client: { sessionId: string }, code?: number): void;
}

function wiringRoom(opts: {
  phase: string;
  ship?: { lifecycle: ShipLifecycle };
  lastResults?: ResultsMsg;
  reconnectPromise?: Promise<unknown>;
}): { room: WiringRoom; allow: ReturnType<typeof vi.fn> } {
  const allow = vi.fn(() => opts.reconnectPromise ?? new Promise<unknown>(() => undefined));
  const room = new ArenaRoom() as unknown as WiringRoom;
  const ships = new Map<string, { lifecycle: ShipLifecycle }>();
  if (opts.ship) ships.set('a', opts.ship);
  room.world = { ships };
  room.match = { phase: opts.phase };
  room.lastResults = opts.lastResults ?? null;
  room.allowReconnection = allow as unknown as WiringRoom['allowReconnection'];
  return { room, allow };
}

const RESUMABLE = CloseCode.ABNORMAL_CLOSURE; // 1006, in RECONNECTABLE_CLOSE_CODES
const CLIENT = { sessionId: 'a' };

describe('ArenaRoom.onDrop wiring', () => {
  it('(a) reconnectable close + active + alive -> allowReconnection(grace)', () => {
    const { room, allow } = wiringRoom({ phase: 'active', ship: { lifecycle: LIFECYCLE_ALIVE } });
    room.onDrop(CLIENT, RESUMABLE);
    expect(allow).toHaveBeenCalledTimes(1);
    expect(allow.mock.calls[0][1]).toBe(CONFIG.net.reconnectGraceSeconds);
  });

  it('(b) punitive close (WITH_ERROR 4002) -> allowReconnection NOT called', () => {
    const { room, allow } = wiringRoom({ phase: 'active', ship: { lifecycle: LIFECYCLE_ALIVE } });
    room.onDrop(CLIENT, CloseCode.WITH_ERROR);
    expect(allow).not.toHaveBeenCalled();
  });

  it('(b2) undefined / server-shutdown / consented codes -> NOT called', () => {
    for (const code of [undefined, CloseCode.SERVER_SHUTDOWN, CloseCode.CONSENTED, CloseCode.FAILED_TO_RECONNECT]) {
      const { room, allow } = wiringRoom({ phase: 'active', ship: { lifecycle: LIFECYCLE_ALIVE } });
      room.onDrop(CLIENT, code);
      expect(allow).not.toHaveBeenCalled();
    }
  });

  it('(c) drop during waiting/countdown -> allowReconnection NOT called', () => {
    for (const phase of ['waiting', 'countdown', 'finished']) {
      const { room, allow } = wiringRoom({ phase, ship: { lifecycle: LIFECYCLE_ALIVE } });
      room.onDrop(CLIENT, RESUMABLE);
      expect(allow).not.toHaveBeenCalled();
    }
  });

  it('(c2) reconnectable close but hull already sunk -> NOT called', () => {
    const { room, allow } = wiringRoom({ phase: 'active', ship: { lifecycle: sunkAt(0) } });
    room.onDrop(CLIENT, RESUMABLE);
    expect(allow).not.toHaveBeenCalled();
  });

  it('(d) resume with cached results re-sends MSG.results to the new client', async () => {
    const results: ResultsMsg = { winnerId: 'a', rows: [] };
    const newClient = { send: vi.fn() };
    const { room } = wiringRoom({
      phase: 'active',
      ship: { lifecycle: LIFECYCLE_ALIVE },
      lastResults: results,
      reconnectPromise: Promise.resolve(newClient),
    });
    room.onDrop(CLIENT, RESUMABLE);
    await Promise.resolve(); // flush the .then microtask
    await Promise.resolve();
    expect(newClient.send).toHaveBeenCalledWith(MSG.results, results);
  });

  it('(d2) resume without cached results sends nothing', async () => {
    const newClient = { send: vi.fn() };
    const { room } = wiringRoom({
      phase: 'active',
      ship: { lifecycle: LIFECYCLE_ALIVE },
      reconnectPromise: Promise.resolve(newClient),
    });
    room.onDrop(CLIENT, RESUMABLE);
    await Promise.resolve();
    await Promise.resolve();
    expect(newClient.send).not.toHaveBeenCalled();
  });

  it('(d3) a rejected reconnection promise is swallowed (no unhandled rejection)', async () => {
    const { room } = wiringRoom({
      phase: 'active',
      ship: { lifecycle: LIFECYCLE_ALIVE },
      reconnectPromise: Promise.reject(new Error('grace expired')),
    });
    expect(() => room.onDrop(CLIENT, RESUMABLE)).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    // If the .catch() were missing, the rejected promise above would surface as
    // an unhandledRejection and fail the suite.
  });
});

// --- config ------------------------------------------------------------------

describe('CONFIG.net.reconnectGraceSeconds', () => {
  it('declares a positive, finite grace window', () => {
    expect(CONFIG.net.reconnectGraceSeconds).toBe(60);
    expect(Number.isFinite(CONFIG.net.reconnectGraceSeconds)).toBe(true);
  });
});

// --- onReconnect: the welcome re-send (Story 6.7) ----------------------------
// A refreshed page loses its JS heap, so it resumes into a socket that has
// never told it its own sessionId or the map seed — and can render nothing.
// Core calls onReconnect INSTEAD OF onJoin on the reconnection branch
// (@colyseus/core 0.17.44 Room.mjs:693-701), so the re-send is the ONLY way
// those bytes reach a resumed client, and equally: nothing on this path may
// re-run the SPAWN half of onJoin. Harness is radarModes.test.ts's joinRoom —
// a bare `new ArenaRoom()` never runs core's __init(), so world/state/clock
// are plain injected properties and the client is a literal with spies.

interface ResumeClient {
  sessionId: string;
  state: ClientState;
  send: ReturnType<typeof vi.fn>;
  leave: ReturnType<typeof vi.fn>;
}

interface ResumeRoom {
  world: World;
  match: null;
  state: { players: Map<string, PlayerMeta>; mapSeed: number; mapRadius: number };
  clients: ResumeClient[];
  clock: { setTimeout: ReturnType<typeof vi.fn> };
  hueRng: ReturnType<typeof mulberry32>;
  onJoin(client: ResumeClient, options?: unknown): void;
  onReconnect(client: ResumeClient): void;
}

function resumeRoom(): ResumeRoom {
  const world = new World(7);
  world.map.islands.length = 0;
  const room = new ArenaRoom() as unknown as ResumeRoom;
  room.world = world;
  room.match = null;
  room.state = { players: new Map(), mapSeed: 7, mapRadius: world.map.radius };
  room.clients = [];
  room.clock = { setTimeout: vi.fn() };
  room.hueRng = mulberry32(7);
  return room;
}

function resumeClient(sessionId: string): ResumeClient {
  return { sessionId, state: ClientState.JOINED, send: vi.fn(), leave: vi.fn() };
}

function welcomesTo(client: ResumeClient): WelcomeMsg[] {
  return client.send.mock.calls
    .filter(([channel]: unknown[]) => channel === MSG.welcome)
    .map(([, payload]: unknown[]) => payload as WelcomeMsg);
}

describe('ArenaRoom.onReconnect (Story 6.7 — the welcome re-send)', () => {
  it('a resume gets a welcome — the fresh-page path has no other source for it', () => {
    const room = resumeRoom();
    const c = resumeClient('alice');
    room.clients.push(c);
    room.onJoin(c, { name: 'ALICE' });
    c.send.mockClear(); // the page refreshed: everything already sent is gone
    room.onReconnect(c);
    const welcomes = welcomesTo(c);
    expect(welcomes).toHaveLength(1);
    expect(welcomes[0].sessionId).toBe('alice');
    expect(welcomes[0].mapSeed).toBe(7);
  });

  it('the re-sent payload is byte-identical to the join welcome (one builder, two doors)', () => {
    const room = resumeRoom();
    const c = resumeClient('alice');
    room.clients.push(c);
    room.onJoin(c, { name: 'ALICE' });
    expect(welcomesTo(c)).toHaveLength(1);
    room.onReconnect(c);
    const sent = welcomesTo(c);
    expect(sent).toHaveLength(2);
    // Deep equality across every field — sessionId, mapSeed, mapRadius,
    // playerCap, t (read live off world.now, unmoved because the world has not
    // stepped), config, and both radar modes. NO WIRE CHANGE: this is the
    // shipped WelcomeMsg reached from a second hook, PROTOCOL_VERSION 40.
    expect(sent[1]).toEqual(sent[0]);
    // ...and it is a FRESH build, not the join's payload retained by mistake.
    expect(sent[1]).not.toBe(sent[0]);
  });

  it('THE SECOND-HULL REGRESSION: a resume adds no ship, no roster row, no hue draw', () => {
    const room = resumeRoom();
    const c = resumeClient('alice');
    room.clients.push(c);
    room.onJoin(c, { name: 'ALICE', cls: 'battleship' });
    const shipsAfterJoin = room.world.ships.size;
    const record = room.world.ships.get('alice');
    const meta = room.state.players.get('alice');
    const hue = meta?.color;
    expect(shipsAfterJoin).toBe(1);
    expect(record).toBeDefined();

    room.onReconnect(c);

    // The hull the captain resumes into is the SAME record, not a fresh spawn
    // sharing its id (which would silently reset pose, hp, boons and class).
    expect(room.world.ships.size).toBe(shipsAfterJoin);
    expect(room.world.ships.get('alice')).toBe(record);
    // The roster is untouched: one row, same object, same personal hue.
    expect(room.state.players.size).toBe(1);
    expect(room.state.players.get('alice')).toBe(meta);
    expect(room.state.players.get('alice')?.color).toBe(hue);
  });

  it('is TOTAL — a throwing send is swallowed, because core answers a throw by ABORTING the resume', () => {
    // Core wraps onReconnect rethrow-true (Room.mjs:1129-1130) and its own
    // catch runs _onLeave(FAILED_TO_RECONNECT). A captain who reconnected
    // successfully must never lose the seat to a diagnostic failure.
    const room = resumeRoom();
    const c = resumeClient('alice');
    room.clients.push(c);
    room.onJoin(c, { name: 'ALICE' });
    c.send.mockImplementation(() => {
      throw new Error('socket closed mid-flush');
    });
    expect(() => room.onReconnect(c)).not.toThrow();
  });
});
