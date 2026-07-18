// Story 0.3 (server operability baseline) — the ArenaRoom adapter glue, unit
// tested through the reconnect.test.ts fake-injection harness pattern (bare
// `new ArenaRoom()` — core's __init never runs — with fake world/match/clients
// injected via casts, private methods reached the same way):
//   - tick-error containment: try/catch around the step body, consecutive-
//     failure counter (clean tick resets), abort-at-tolerance → match.abort +
//     this.disconnect() exactly once, re-entry guarded, sibling rooms survive.
//   - match.end / match.abort telemetry: end fires once from the finish hook
//     with matchId/mode + endSummary fields; mutual exclusion both ways
//     (aborted match never ends, finished match never aborts); 'abandoned'
//     abort fires once on dispose-while-active.
//   - JOINING-deadline kick: armed in onJoin at CONFIG.net.joiningDeadlineSeconds,
//     fire-time decision (JOINED or already-left clients are untouchable),
//     punitive close code so story 0.2's grace window never opens for a kick.
//   - metrics feeds: recordTick per clean step, recordMessage at the top of
//     both message handlers (malformed included), unregister on dispose.
//   - log hygiene: `info match.end {json}` line shape; zero info lines from
//     plain ticking (lifecycle events only).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CONFIG, MSG, type ResultsMsg } from '@salvo/shared';
import { ClientState, CloseCode } from 'colyseus';
import { World } from '../game/world.js';
import { ArenaRoom } from '../rooms/ArenaRoom.js';
import type { MatchEndSummary } from '../game/match.js';

const SIM_DT = CONFIG.tick.simDtMs;

const SUMMARY: MatchEndSummary = {
  rosterSize: 6,
  rosterByClass: { cruiser: 4, destroyer: 2 },
  durationS: 42.5,
  winnerClass: 'cruiser',
  killsByClass: { cruiser: 5, destroyer: 0 },
  stormDeaths: 1,
};

// --- console.log spy (the logger's only sink) ---------------------------------

let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  delete process.env.HC_DEBUG;
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  logSpy.mockRestore();
});

/** All captured log lines starting with `prefix` (e.g. 'info match.abort'). */
function lines(prefix: string): string[] {
  return logSpy.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith(`${prefix} `));
}

/** Parse the JSON field tail of a `level event {json}` line. */
function fieldsOf(line: string): Record<string, unknown> {
  return JSON.parse(line.slice(line.indexOf('{'))) as Record<string, unknown>;
}

// --- harness -------------------------------------------------------------------

interface FakeMetrics {
  recordTick: ReturnType<typeof vi.fn>;
  recordMessage: ReturnType<typeof vi.fn>;
  unregister: ReturnType<typeof vi.fn>;
}

interface OpsRoom {
  world: { tick: number; step: ReturnType<typeof vi.fn> };
  match: { phase: string; update: ReturnType<typeof vi.fn>; endSummary: () => MatchEndSummary } | null;
  metrics: FakeMetrics | null;
  matchId: string;
  tickErrorTolerance: number;
  consecutiveTickErrors: number;
  aborting: boolean;
  lastResults: ResultsMsg | null;
  disconnect: ReturnType<typeof vi.fn>;
  broadcast: ReturnType<typeof vi.fn>;
  update(dtMs: number): void;
  matchHooks(): { broadcastResults(msg: ResultsMsg): void };
  onDispose(): void;
}

function fakeMetrics(): FakeMetrics {
  return { recordTick: vi.fn(), recordMessage: vi.fn(), unregister: vi.fn() };
}

/**
 * Bare room with a fake world/match for the tick-loop + telemetry tests.
 * `stepImpl` runs inside world.step AFTER the tick increments (mirrors the
 * real World: tick advances first) — throw from it to fake a broken step.
 * afterStep is stubbed to a no-op so the containment loop is the unit under
 * test, not roster/zone mirroring.
 */
function opsRoom(opts: { tolerance?: number; stepImpl?: () => void; phase?: string } = {}): OpsRoom {
  const room = new ArenaRoom() as unknown as OpsRoom & { afterStep(): void };
  const world = {
    tick: 0,
    step: vi.fn(() => {
      world.tick += 1;
      opts.stepImpl?.();
    }),
  };
  room.world = world;
  room.match = {
    phase: opts.phase ?? 'active',
    update: vi.fn(),
    endSummary: () => SUMMARY,
  };
  room.matchId = 'm-test';
  room.tickErrorTolerance = opts.tolerance ?? 1;
  room.disconnect = vi.fn(() => Promise.resolve());
  room.broadcast = vi.fn();
  room.afterStep = () => undefined;
  return room;
}

// --- tick-error containment ----------------------------------------------------

describe('tick-error containment', () => {
  it('tolerance 1: a throwing step aborts once — match.abort + disconnect, no further steps', () => {
    const room = opsRoom({
      tolerance: 1,
      stepImpl: () => {
        throw new Error('boom');
      },
    });
    room.update(SIM_DT);

    expect(lines('error tick.error')).toHaveLength(1);
    const aborts = lines('info match.abort');
    expect(aborts).toHaveLength(1);
    const f = fieldsOf(aborts[0]);
    expect(f.matchId).toBe('m-test');
    expect(f.reason).toBe('tick-error');
    expect(typeof f.tick).toBe('number');
    expect(room.disconnect).toHaveBeenCalledTimes(1);

    // Re-entry guard: the interval keeps firing until disposal completes —
    // no new step attempts, no second abort, no second disconnect.
    const stepsAtAbort = room.world.step.mock.calls.length;
    room.update(SIM_DT);
    room.update(SIM_DT * 5);
    expect(room.world.step.mock.calls.length).toBe(stepsAtAbort);
    expect(lines('info match.abort')).toHaveLength(1);
    expect(room.disconnect).toHaveBeenCalledTimes(1);
  });

  it('tolerance 3: two failures then a clean tick reset the counter — no abort', () => {
    let failures = 2;
    const room = opsRoom({
      tolerance: 3,
      stepImpl: () => {
        if (failures > 0) {
          failures -= 1;
          throw new Error('transient');
        }
      },
    });
    room.update(SIM_DT); // failure 1
    room.update(SIM_DT); // failure 2
    expect(room.consecutiveTickErrors).toBe(2);
    room.update(SIM_DT); // clean — counter resets
    expect(room.consecutiveTickErrors).toBe(0);

    expect(lines('error tick.error')).toHaveLength(2);
    expect(lines('info match.abort')).toHaveLength(0);
    expect(room.disconnect).not.toHaveBeenCalled();
    expect(room.aborting).toBe(false);
  });

  it('a sibling room keeps stepping after another room aborts', () => {
    const broken = opsRoom({
      tolerance: 1,
      stepImpl: () => {
        throw new Error('boom');
      },
    });
    const healthy = opsRoom({ tolerance: 1 });
    broken.update(SIM_DT);
    expect(broken.disconnect).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 5; i++) healthy.update(SIM_DT);
    expect(healthy.world.step).toHaveBeenCalledTimes(5);
    expect(healthy.disconnect).not.toHaveBeenCalled();
    // The one abort on record belongs to the broken room only.
    expect(lines('info match.abort')).toHaveLength(1);
  });
});

// --- match.end / match.abort telemetry -------------------------------------------

describe('match telemetry', () => {
  it('match.end fires once from the finish hook with matchId/mode + summary fields', () => {
    const room = opsRoom({ phase: 'finished' });
    const hooks = room.matchHooks();
    const msg: ResultsMsg = { winnerId: 'a', rows: [] };
    hooks.broadcastResults(msg);

    // Existing results behavior preserved: cache + broadcast.
    expect(room.lastResults).toBe(msg);
    expect(room.broadcast).toHaveBeenCalledWith(MSG.results, msg);

    const ends = lines('info match.end');
    expect(ends).toHaveLength(1);
    expect(ends[0].startsWith('info match.end {')).toBe(true);
    const f = fieldsOf(ends[0]);
    expect(f.matchId).toBe('m-test');
    expect(f.mode).toBe('arena');
    expect(f.rosterSize).toBe(SUMMARY.rosterSize);
    expect(f.rosterByClass).toEqual(SUMMARY.rosterByClass);
    expect(f.durationS).toBe(SUMMARY.durationS);
    expect(f.winnerClass).toBe(SUMMARY.winnerClass);
    expect(f.killsByClass).toEqual(SUMMARY.killsByClass);
    expect(f.stormDeaths).toBe(SUMMARY.stormDeaths);

    // A second hook invocation must not emit a second telemetry line.
    hooks.broadcastResults(msg);
    expect(lines('info match.end')).toHaveLength(1);
  });

  it('an aborted match never emits match.end, even if the dispose cascade reaches finish()', () => {
    const room = opsRoom({
      tolerance: 1,
      stepImpl: () => {
        throw new Error('boom');
      },
    });
    room.update(SIM_DT); // abort fires
    expect(lines('info match.abort')).toHaveLength(1);

    // this.disconnect() → leave cascade → Match.checkWin CAN still finish the
    // match and fire the broadcastResults hook — the telemetry must stay out.
    room.matchHooks().broadcastResults({ winnerId: 'b', rows: [] });
    expect(lines('info match.end')).toHaveLength(0);
    // The results broadcast itself is untouched (behavior preservation).
    expect(room.broadcast).toHaveBeenCalledTimes(1);
  });

  it('a finished match never emits match.abort', () => {
    const room = opsRoom({ phase: 'active' });
    room.matchHooks().broadcastResults({ winnerId: 'a', rows: [] });
    expect(lines('info match.end')).toHaveLength(1);
    // Even with the phase (artificially) still 'active', dispose must not abort.
    room.onDispose();
    expect(lines('info match.abort')).toHaveLength(0);
  });

  it("dispose-while-active emits one 'abandoned' abort; repeat dispose stays silent", () => {
    const room = opsRoom({ phase: 'active' });
    room.onDispose();
    const aborts = lines('info match.abort');
    expect(aborts).toHaveLength(1);
    expect(fieldsOf(aborts[0])).toMatchObject({ matchId: 'm-test', reason: 'abandoned' });
    expect(lines('info room.dispose')).toHaveLength(1);

    room.onDispose();
    expect(lines('info match.abort')).toHaveLength(1);
  });

  it('dispose with the match waiting/countdown/finished emits no abort', () => {
    for (const phase of ['waiting', 'countdown', 'finished']) {
      const room = opsRoom({ phase });
      room.onDispose();
    }
    expect(lines('info match.abort')).toHaveLength(0);
  });
});

// --- JOINING-deadline kick -------------------------------------------------------

interface JoinClient {
  sessionId: string;
  state: ClientState;
  send: ReturnType<typeof vi.fn>;
  leave: ReturnType<typeof vi.fn>;
}

interface JoinRoom {
  world: World;
  match: null;
  state: { players: Map<string, unknown>; mapSeed: number; mapRadius: number };
  clients: JoinClient[];
  clock: { setTimeout: ReturnType<typeof vi.fn> };
  onJoin(client: JoinClient, options?: unknown): void;
}

function joinClient(id: string): JoinClient {
  return { sessionId: id, state: ClientState.JOINING, send: vi.fn(), leave: vi.fn() };
}

/** Bare room with a real (islandless) World, sandbox match, and a spied clock. */
function joinRoom(): JoinRoom {
  const room = new ArenaRoom() as unknown as JoinRoom;
  const w = new World(1);
  w.map.islands.length = 0;
  room.world = w;
  room.match = null;
  room.state = { players: new Map(), mapSeed: 1, mapRadius: w.map.radius };
  room.clients = [];
  room.clock = { setTimeout: vi.fn() };
  return room;
}

/** Run onJoin and return the armed deadline callback. */
function join(room: JoinRoom, client: JoinClient): () => void {
  room.clients.push(client); // core pushes BEFORE onJoin runs (verified in Room._onJoin)
  const armedBefore = room.clock.setTimeout.mock.calls.length;
  room.onJoin(client, { name: client.sessionId.toUpperCase() });
  const calls = room.clock.setTimeout.mock.calls;
  expect(calls.length).toBe(armedBefore + 1);
  expect(calls[calls.length - 1][1]).toBe(CONFIG.net.joiningDeadlineSeconds * 1000);
  return calls[calls.length - 1][0] as () => void;
}

describe('JOINING-deadline kick', () => {
  it('a client still JOINING at the deadline is kicked with a punitive close code', () => {
    const room = joinRoom();
    const client = joinClient('a');
    const fire = join(room, client);

    fire();
    expect(client.leave).toHaveBeenCalledTimes(1);
    // WITH_ERROR is NOT reconnectable: onDrop must route the kick to teardown,
    // never to the story-0.2 grace window.
    expect(client.leave).toHaveBeenCalledWith(CloseCode.WITH_ERROR);
    const kicks = lines('warn client.joiningKick');
    expect(kicks).toHaveLength(1);
    expect(fieldsOf(kicks[0]).sessionId).toBe('a');
  });

  it('a client that reached JOINED in time is never kicked', () => {
    const room = joinRoom();
    const client = joinClient('a');
    const fire = join(room, client);

    client.state = ClientState.JOINED;
    fire();
    expect(client.leave).not.toHaveBeenCalled();
    expect(lines('warn client.joiningKick')).toHaveLength(0);
  });

  it('a client that already left is not kicked (fire-time clients check)', () => {
    const room = joinRoom();
    const client = joinClient('a');
    const fire = join(room, client);

    room.clients.length = 0; // core removed the client at drop/leave time
    fire();
    expect(client.leave).not.toHaveBeenCalled();
    expect(lines('warn client.joiningKick')).toHaveLength(0);
  });

  it('kicking one stuck client never touches the others', () => {
    const room = joinRoom();
    const stuck = joinClient('a');
    const timely = joinClient('b');
    const fireStuck = join(room, stuck);
    const fireTimely = join(room, timely);

    timely.state = ClientState.JOINED;
    fireStuck();
    fireTimely();
    expect(stuck.leave).toHaveBeenCalledTimes(1);
    expect(timely.leave).not.toHaveBeenCalled();
  });
});

// --- metrics feeds ---------------------------------------------------------------

interface MessageRoom {
  world: { submitInput: ReturnType<typeof vi.fn>; spendPoint: ReturnType<typeof vi.fn> };
  metrics: FakeMetrics | null;
  onInputMessage(client: { sessionId: string }, raw: unknown): void;
  onSpendMessage(client: { sessionId: string }, raw: unknown): void;
}

describe('metrics feeds', () => {
  it('recordTick fires once per clean sim step with the measured duration', () => {
    const room = opsRoom();
    const metrics = fakeMetrics();
    room.metrics = metrics;
    room.update(SIM_DT * 2); // two whole steps drained from the accumulator
    expect(metrics.recordTick).toHaveBeenCalledTimes(2);
    for (const [duration] of metrics.recordTick.mock.calls) {
      expect(typeof duration).toBe('number');
      expect(duration).toBeGreaterThanOrEqual(0);
    }
  });

  it('recordTick does not fire for a failed step', () => {
    const room = opsRoom({
      tolerance: 3,
      stepImpl: () => {
        throw new Error('boom');
      },
    });
    const metrics = fakeMetrics();
    room.metrics = metrics;
    room.update(SIM_DT);
    expect(metrics.recordTick).not.toHaveBeenCalled();
  });

  it('recordMessage fires at the top of BOTH handlers — malformed input included', () => {
    const room = new ArenaRoom() as unknown as MessageRoom;
    const metrics = fakeMetrics();
    room.metrics = metrics;
    room.world = { submitInput: vi.fn(), spendPoint: vi.fn() };
    const client = { sessionId: 'a' };

    room.onInputMessage(client, null); // malformed — still transport pressure
    room.onInputMessage(client, { seq: 1 });
    room.onSpendMessage(client, { choice: 0 });
    expect(metrics.recordMessage).toHaveBeenCalledTimes(3);
    expect(room.world.submitInput).toHaveBeenCalledTimes(2);
    expect(room.world.spendPoint).toHaveBeenCalledTimes(1);
  });

  it('unregister fires exactly once on dispose', () => {
    const room = opsRoom({ phase: 'finished' });
    const metrics = fakeMetrics();
    room.metrics = metrics;
    room.onDispose();
    room.onDispose();
    expect(metrics.unregister).toHaveBeenCalledTimes(1);
  });
});

// --- log hygiene ------------------------------------------------------------------

describe('log hygiene', () => {
  it('plain ticking emits ZERO log lines (info reserved for lifecycle; debug gated off)', () => {
    const room = opsRoom();
    for (let i = 0; i < 45; i++) room.update(SIM_DT); // > 2s of clean 20Hz steps
    expect(room.world.step.mock.calls.length).toBe(45);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('CONFIG declares a positive, finite joining deadline', () => {
    expect(CONFIG.net.joiningDeadlineSeconds).toBe(10);
    expect(Number.isFinite(CONFIG.net.joiningDeadlineSeconds)).toBe(true);
  });
});
