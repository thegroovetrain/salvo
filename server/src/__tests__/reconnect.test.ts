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

import { describe, it, expect, vi } from 'vitest';
import { CONFIG, MSG, PROTOCOL_VERSION, type ResultsMsg } from '@salvo/shared';
import { CloseCode, ServerError, ErrorCode } from 'colyseus';
import { World } from '../game/world.js';
import { Match, dropPolicy, type MatchHooks } from '../game/match.js';
import { ArenaRoom } from '../rooms/ArenaRoom.js';
import { protocolVersionError } from '../rooms/roomOptions.js';

const TIMINGS = { countdownMs: 100, resultsMs: 200 }; // 2 ticks / 4 ticks

// --- harness (match.test.ts pattern + a bare room for the private teardown) --

interface Harness {
  w: World;
  m: Match;
  calls: string[];
  /** The real ArenaRoom.teardown, with world/match/roster injected (no transport). */
  teardown(id: string): void;
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
    fillToCapacity: () => calls.push('fill'),
    broadcastResults: () => calls.push('results'),
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
  };
  room.world = w;
  room.match = m;
  room.state = { players };
  return { w, m, calls, players, teardown: (id) => room.teardown(id) };
}

function step(h: Harness, ticks = 1): void {
  for (let i = 0; i < ticks; i++) {
    h.w.step();
    h.m.update();
  }
}

function activate(h: Harness): void {
  expect(h.m.phase).toBe('countdown');
  for (let i = 0; i < 100 && h.m.phase !== 'active'; i++) step(h);
  expect(h.m.phase).toBe('active');
}

function input(seq: number, throttle: number, rudder = 0): unknown {
  return { seq, throttle, rudder, aim: 0, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0 };
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

describe('ArenaRoom static onAuth (pv gate)', () => {
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
  it('runs the full leave teardown once: ship + roster removed, sunk-at-leave placement', () => {
    const h = setup(['a', 'b', 'c']);
    activate(h);
    h.teardown('a');
    expect(h.w.ships.has('a')).toBe(false);
    expect(h.players.has('a')).toBe(false);
    expect(h.m.phase).toBe('active'); // b + c still fighting
  });

  it('is idempotent — a second call is a strict no-op (no extra hook calls, no throw)', () => {
    const h = setup(['a', 'b']);
    activate(h);
    h.teardown('a'); // match finishes: b is the last human afloat
    expect(h.m.phase).toBe('finished');
    const callsAfterFirst = [...h.calls];
    const placementsAfterFirst = new Map(h.m.placements);
    h.teardown('a'); // the drop→failed-reconnect path reaches onLeave again
    expect(h.calls).toEqual(callsAfterFirst); // no second results broadcast
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
    // b sinks next; c is the last human afloat -> match ends.
    h.w.sinkShip('b');
    step(h);
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
    // Grace expiry -> teardown clears the input store with the ship.
    h.teardown('a');
    expect(h.w.inputs.get('a')).toBeUndefined();
    expect(h.m.phase).toBe('finished');
    expect(h.m.winnerId).toBe('b');
  });

  it('a held fireSeq does not re-fire after the drop (edge-triggered click stays consumed)', () => {
    const h = setup(['a', 'b']);
    activate(h);
    // One click (fireSeq 1) fires once; the SAME held value must not fire again.
    expect(
      h.w.submitInput('a', { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 1, aimDist: 0, slot: 0, fireT: 0 }),
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
  world: { ships: Map<string, { alive: boolean }> };
  match: { phase: string } | null;
  lastResults: ResultsMsg | null;
  allowReconnection: (client: unknown, seconds: number) => Promise<unknown>;
  onDrop(client: { sessionId: string }, code?: number): void;
}

function wiringRoom(opts: {
  phase: string;
  ship?: { alive: boolean };
  lastResults?: ResultsMsg;
  reconnectPromise?: Promise<unknown>;
}): { room: WiringRoom; allow: ReturnType<typeof vi.fn> } {
  const allow = vi.fn(() => opts.reconnectPromise ?? new Promise<unknown>(() => undefined));
  const room = new ArenaRoom() as unknown as WiringRoom;
  const ships = new Map<string, { alive: boolean }>();
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
    const { room, allow } = wiringRoom({ phase: 'active', ship: { alive: true } });
    room.onDrop(CLIENT, RESUMABLE);
    expect(allow).toHaveBeenCalledTimes(1);
    expect(allow.mock.calls[0][1]).toBe(CONFIG.net.reconnectGraceSeconds);
  });

  it('(b) punitive close (WITH_ERROR 4002) -> allowReconnection NOT called', () => {
    const { room, allow } = wiringRoom({ phase: 'active', ship: { alive: true } });
    room.onDrop(CLIENT, CloseCode.WITH_ERROR);
    expect(allow).not.toHaveBeenCalled();
  });

  it('(b2) undefined / server-shutdown / consented codes -> NOT called', () => {
    for (const code of [undefined, CloseCode.SERVER_SHUTDOWN, CloseCode.CONSENTED, CloseCode.FAILED_TO_RECONNECT]) {
      const { room, allow } = wiringRoom({ phase: 'active', ship: { alive: true } });
      room.onDrop(CLIENT, code);
      expect(allow).not.toHaveBeenCalled();
    }
  });

  it('(c) drop during waiting/countdown -> allowReconnection NOT called', () => {
    for (const phase of ['waiting', 'countdown', 'finished']) {
      const { room, allow } = wiringRoom({ phase, ship: { alive: true } });
      room.onDrop(CLIENT, RESUMABLE);
      expect(allow).not.toHaveBeenCalled();
    }
  });

  it('(c2) reconnectable close but hull already sunk -> NOT called', () => {
    const { room, allow } = wiringRoom({ phase: 'active', ship: { alive: false } });
    room.onDrop(CLIENT, RESUMABLE);
    expect(allow).not.toHaveBeenCalled();
  });

  it('(d) resume with cached results re-sends MSG.results to the new client', async () => {
    const results: ResultsMsg = { winnerId: 'a', rows: [] };
    const newClient = { send: vi.fn() };
    const { room } = wiringRoom({
      phase: 'active',
      ship: { alive: true },
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
      ship: { alive: true },
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
      ship: { alive: true },
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
