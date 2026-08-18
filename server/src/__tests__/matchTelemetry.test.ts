// Story 0.3 telemetry: the pure sim-side aggregation Match owns for match.end
// (endSummary) plus the env-independent tick-error tolerance policy helpers.
// These stay unit-testable without a Colyseus room (grep colyseus server/src/game
// stays empty); the room only decorates the summary with matchId/mode + emits.

import { describe, it, expect } from 'vitest';
import { CONFIG } from '@salvo/shared';
import { World } from '../game/world.js';
import {
  Match,
  type MatchHooks,
  resolveTickErrorTolerance,
  shouldAbortOnTickError,
} from '../game/match.js';

const TIMINGS = { countdownMs: 100, resultsMs: 200, joinWindowMs: 0 }; // 2 ticks / 4 ticks; no gathering window (legacy fast path)
// Ticks in one sinking window: since the amendment-17 REVERSAL (Eric veto
// 2026-08-12) a terminal SINK holds the match open for the dying captain's
// whole window, so every sunk-out finish below steps a window before its
// finish assertions. Since Story 6.7 (the departure scuttle, Eric rulings
// R3/R4/R5) a leave is ALSO a real sinking (world.sinkShip, no killer), so
// leave-only finishes now hold the transition open for the departed hull's
// window too, exactly like a combat sink.
const SINK_TICKS = CONFIG.ship.sinkingWindowMs / CONFIG.tick.simDtMs;

function noopHooks(): MatchHooks {
  return {
    lock: () => {},
    unlock: () => {},
    broadcastResults: () => {},
    requeue: () => {},
    disconnect: () => {},
  };
}

interface Ctx {
  w: World;
  m: Match;
}

/** Bare world (no islands) + a match with fast timings. */
function build(): Ctx {
  const w = new World(1);
  w.map.islands.length = 0;
  const m = new Match(w, TIMINGS, noopHooks());
  return { w, m };
}

function step(ctx: Ctx, ticks = 1): void {
  for (let i = 0; i < ticks; i++) {
    ctx.w.step();
    ctx.m.update();
  }
}

describe('Match.endSummary — pre-activation safety', () => {
  it('returns zeros/empty/null before any match activates', () => {
    const { m } = build();
    expect(m.phase).toBe('waiting');
    expect(m.endSummary()).toEqual({
      rosterSize: 0,
      rosterByClass: {},
      durationS: 0,
      winnerClass: null,
      killsByClass: {},
      pveKillsByClass: {},
      stormDeaths: 0,
      // Pre-finish default (amendment 53): the no-survivor winner-resolution
      // state. durationS 0 + winnerClass null are the not-yet-finished tell.
      endedBy: 'lastHumanSunk',
      // ...and the outcome discriminator (amendment 16) reads 'winner' on an
      // unfinished summary rather than inventing a third "unfinished" state:
      // durationS is what marks a summary not-yet-finished, and a draw must
      // mean a REAL same-tick wipe wherever it appears.
      outcome: 'winner',
    });
  });

  it('duration stays 0 mid-match (activated but not finished)', () => {
    const ctx = build();
    ctx.w.addShip('a', 'A', 'captain', 'torpedoBoat');
    ctx.m.notifyRosterChanged();
    ctx.w.addShip('b', 'B', 'captain', 'mineLayer');
    ctx.m.notifyRosterChanged();
    for (let i = 0; i < 100 && ctx.m.phase !== 'active'; i++) step(ctx);
    expect(ctx.m.phase).toBe('active');
    const s = ctx.m.endSummary();
    expect(s.rosterSize).toBe(2);
    expect(s.durationS).toBe(0); // no finishedAt yet
    expect(s.winnerClass).toBeNull();
  });
});

describe('Match.endSummary — driven mini-match (drones + storm death)', () => {
  function run(): Ctx {
    const ctx = build();
    // Two humans of distinct classes (arm the countdown) + one drone (fills a
    // slot; drones never count toward humanCount so this can't start/hold it).
    // The drone takes a DRONE hull id — telemetry buckets it under that id.
    ctx.w.addShip('a', 'A', 'captain', 'torpedoBoat');
    ctx.m.notifyRosterChanged();
    ctx.w.addShip('b', 'B', 'captain', 'mineLayer');
    ctx.m.notifyRosterChanged();
    ctx.w.addShip('d1', 'D1', 'fleet', 'droneLarge');
    ctx.m.notifyRosterChanged();
    // Activate (2 ticks: now 0 -> 100 == countdownEndT).
    for (let i = 0; i < 100 && ctx.m.phase !== 'active'; i++) step(ctx);
    expect(ctx.m.phase).toBe('active');
    expect(ctx.m.activatedAt).toBe(100);
    // Killer-less sink of the drone = a storm death (by === undefined).
    ctx.w.sinkShip('d1');
    step(ctx);
    expect(ctx.m.phase).toBe('active'); // both humans still afloat
    // 'a' (torpedoBoat) sinks 'b' (mineLayer) → the outcome latches at a; the
    // finish waits for b's sinking window (amendment 17 reversed).
    ctx.w.sinkShip('b', 'a');
    step(ctx, SINK_TICKS + 1);
    expect(ctx.m.phase).toBe('finished');
    expect(ctx.m.winnerId).toBe('a');
    return ctx;
  }

  it('aggregates roster/kills/winner/storm/duration across all combatants incl. drones', () => {
    const s = run().m.endSummary();
    expect(s.rosterSize).toBe(3); // drone included
    expect(s.rosterByClass).toEqual({ torpedoBoat: 1, mineLayer: 1, droneLarge: 1 });
    expect(s.winnerClass).toBe('torpedoBoat');
    expect(s.killsByClass).toEqual({ torpedoBoat: 1, mineLayer: 0, droneLarge: 0 });
    expect(s.stormDeaths).toBe(1);
    // The finish lands on b's founder tick: sink-entry at 150 (activation 100
    // + one drone-sink tick) + the 5000ms window → finishedAt 5150, activated
    // 100 → 5.05s, rounded to 1 decimal (half-up) = 5.1.
    expect(s.durationS).toBeCloseTo(
      Math.round((150 + CONFIG.ship.sinkingWindowMs - 100) / 100) / 10,
      5,
    );
    expect(s.endedBy).toBe('fieldCleared'); // 'a' survives an empty ocean
  });
});

// PvE telemetry (Story 5.6, epic-5 amendment 44): the faucet's economy signal.
// A PvE kill still reaches no tally and no record — killsByClass must count
// NONE of it — while pveKillsByClass carries the per-size truth an operator can
// turn back into XP paid (¼ / ⅓ / ½ level).
describe('Match.endSummary — the PvE column (amendment 44)', () => {
  it('counts drone sinkings per VICTIM size, and leaves killsByClass untouched', () => {
    const ctx = build();
    ctx.w.addShip('a', 'A', 'captain', 'torpedoBoat');
    ctx.m.notifyRosterChanged();
    ctx.w.addShip('b', 'B', 'captain', 'mineLayer');
    ctx.m.notifyRosterChanged();
    for (const [id, hull] of [
      ['d1', 'droneSmall'],
      ['d2', 'droneSmall'],
      ['d3', 'droneMedium'],
      ['d4', 'droneLarge'],
    ] as const) {
      ctx.w.addShip(id, id.toUpperCase(), 'fleet', hull);
      ctx.m.notifyRosterChanged();
    }
    for (let i = 0; i < 100 && ctx.m.phase !== 'active'; i++) step(ctx);
    expect(ctx.m.phase).toBe('active');
    for (const id of ['d1', 'd2', 'd3', 'd4']) ctx.w.sinkShip(id, 'a');
    step(ctx);
    ctx.w.sinkShip('b', 'a'); // ...and ONE captain kill, for the contrast
    step(ctx, SINK_TICKS + 1);
    expect(ctx.m.phase).toBe('finished');
    const s = ctx.m.endSummary();
    expect(s.pveKillsByClass).toEqual({ droneSmall: 2, droneMedium: 1, droneLarge: 1 });
    // The presentation tally saw exactly the captain kill — the four drones
    // are absent from it, keyed by the KILLER's hull as it always was.
    expect(s.killsByClass.torpedoBoat).toBe(1);
    expect(s.killsByClass.droneSmall).toBe(0);
  });
});

// endedBy (amendment 53): the abandonment classification the balance evidence
// needs, so a quit-out match can't be read as a fought-out one. One case per
// cause, driven through the real transitions (no direct field pokes).
describe('Match.endSummary — endedBy classification', () => {
  /** Two humans + `drones` drones, activated. Since amendment 4 the drones do
   *  NOT hold the match open for a lone survivor — the second captain is what
   *  keeps it live — but they still prove a finish can happen with hulls afloat. */
  function activated(drones: number): Ctx {
    const ctx = build();
    ctx.w.addShip('a', 'A', 'captain', 'torpedoBoat');
    ctx.m.notifyRosterChanged();
    ctx.w.addShip('b', 'B', 'captain', 'mineLayer');
    ctx.m.notifyRosterChanged();
    for (let i = 0; i < drones; i++) ctx.w.addShip(`d${i}`, `D${i}`, 'fleet', 'droneLarge');
    for (let i = 0; i < 100 && ctx.m.phase !== 'active'; i++) step(ctx);
    expect(ctx.m.phase).toBe('active');
    return ctx;
  }

  it('fieldCleared: the winner is alive with everything else dead', () => {
    const ctx = activated(1);
    ctx.w.sinkShip('d0', 'a');
    ctx.w.sinkShip('b', 'a');
    step(ctx, SINK_TICKS + 1); // b's window holds the finish (amendment 17 reversed)
    expect(ctx.m.phase).toBe('finished');
    expect(ctx.m.winnerId).toBe('a');
    expect(ctx.m.endSummary().endedBy).toBe('fieldCleared');
    expect(ctx.m.endSummary().outcome).toBe('winner');
  });

  it('lastHumanSunk: a terminal sinking leaves 0 humans alive (storm case)', () => {
    const ctx = activated(1);
    // Killer-less sinks = storm deaths; the drone outlives both captains. Both
    // captains going down on ONE tick is amendment 14's wipe — a DRAW — but
    // the endedBy classification is about CAUSE, not winner, and stays
    // lastHumanSunk.
    ctx.w.sinkShip('a');
    ctx.w.sinkShip('b');
    step(ctx, SINK_TICKS + 1); // both windows hold the finish (amendment 17 reversed)
    expect(ctx.m.phase).toBe('finished');
    expect(ctx.m.winnerId).toBe(''); // same-tick wipe: a draw (Story 5.2)
    const s = ctx.m.endSummary();
    expect(s.stormDeaths).toBe(2);
    expect(s.endedBy).toBe('lastHumanSunk');
    expect(s.winnerClass).toBeNull(); // no winner, no winner class
    // THE DISCRIMINATOR (amendment 16): winnerClass null is ambiguous — it also
    // reads null when the winner lookup misses — so the draw needs its own,
    // authoritative field. This is the case that makes it countable.
    expect(s.outcome).toBe('draw');
  });

  it('lastHumanSunk: mutual destruction in combat classifies as sunk, not cleared', () => {
    const ctx = activated(0);
    ctx.w.sinkShip('a', 'b');
    ctx.w.sinkShip('b', 'a'); // same tick
    step(ctx, SINK_TICKS + 1); // both windows hold the finish (amendment 17 reversed)
    expect(ctx.m.phase).toBe('finished');
    expect(ctx.m.endSummary().endedBy).toBe('lastHumanSunk');
  });

  // ('lastHumanLeft' had a case here — the last afloat captain quitting out on
  //  the exact tick another sank, with no step() between. Story 6.3, epic-6
  //  amendment 16 DELETED the category: ArenaRoom steps the world and the match
  //  synchronously, so that gap does not exist over a real socket, and the case
  //  could only ever be produced by driving Match directly. The test went with
  //  it rather than being adapted — no dead knob, no synthetic-only coverage.)

  it('a departure that leaves a survivor standing is fieldCleared', () => {
    const ctx = activated(0);
    ctx.m.onPlayerLeave('b'); // 'a' is left alone on an empty ocean
    expect(ctx.m.phase).toBe('active'); // b's scuttled hull holds the finish (Story 6.7)
    step(ctx, SINK_TICKS + 1); // b's sinking window runs out
    expect(ctx.m.phase).toBe('finished');
    expect(ctx.m.winnerId).toBe('a');
    expect(ctx.m.endSummary().endedBy).toBe('fieldCleared');
  });
});

describe('resolveTickErrorTolerance — override × prod/dev matrix', () => {
  it('honors a valid positive-integer override regardless of env', () => {
    expect(resolveTickErrorTolerance('2', true)).toBe(2);
    expect(resolveTickErrorTolerance('2', false)).toBe(2);
    expect(resolveTickErrorTolerance('5', false)).toBe(5);
  });

  it('defaults to 3 in prod / 1 in dev when the override is missing', () => {
    expect(resolveTickErrorTolerance(undefined, true)).toBe(3);
    expect(resolveTickErrorTolerance(undefined, false)).toBe(1);
  });

  it('defaults on invalid overrides (non-numeric, zero, negative, fractional, empty)', () => {
    for (const bad of ['abc', '0', '-1', '2.5', '']) {
      expect(resolveTickErrorTolerance(bad, true)).toBe(3);
      expect(resolveTickErrorTolerance(bad, false)).toBe(1);
    }
  });

  it('clamps oversized valid overrides to 100 (containment + log-throttle guard)', () => {
    // Without the clamp, 1e9 disables containment and unthrottles error logging.
    expect(resolveTickErrorTolerance('1000000000', true)).toBe(100);
    expect(resolveTickErrorTolerance('101', false)).toBe(100);
    expect(resolveTickErrorTolerance('100', true)).toBe(100); // boundary stays 100
    expect(resolveTickErrorTolerance('50', false)).toBe(50); // in-range unchanged
  });
});

describe('shouldAbortOnTickError — boundary behavior', () => {
  it('aborts once consecutive failures reach the tolerance', () => {
    expect(shouldAbortOnTickError(0, 1)).toBe(false);
    expect(shouldAbortOnTickError(1, 1)).toBe(true); // dev: first failure aborts
    expect(shouldAbortOnTickError(2, 3)).toBe(false);
    expect(shouldAbortOnTickError(3, 3)).toBe(true); // prod: third failure aborts
    expect(shouldAbortOnTickError(4, 3)).toBe(true);
  });
});

describe('CONFIG.net.joiningDeadlineSeconds', () => {
  it('is declared and sits under the reconnect grace', () => {
    expect(CONFIG.net.joiningDeadlineSeconds).toBe(10);
    expect(CONFIG.net.joiningDeadlineSeconds).toBeLessThan(CONFIG.net.reconnectGraceSeconds);
  });
});
