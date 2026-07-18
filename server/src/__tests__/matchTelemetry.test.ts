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

const TIMINGS = { countdownMs: 100, resultsMs: 200 }; // 2 ticks / 4 ticks

function noopHooks(): MatchHooks {
  return {
    lock: () => {},
    unlock: () => {},
    fillToCapacity: () => {},
    broadcastResults: () => {},
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
      stormDeaths: 0,
    });
  });

  it('duration stays 0 mid-match (activated but not finished)', () => {
    const ctx = build();
    ctx.w.addShip('a', 'A', false, 'destroyer');
    ctx.m.notifyRosterChanged();
    ctx.w.addShip('b', 'B', false, 'cruiser');
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
    ctx.w.addShip('a', 'A', false, 'destroyer');
    ctx.m.notifyRosterChanged();
    ctx.w.addShip('b', 'B', false, 'cruiser');
    ctx.m.notifyRosterChanged();
    ctx.w.addShip('d1', 'D1', true, 'battleship');
    ctx.m.notifyRosterChanged();
    // Activate (2 ticks: now 0 -> 100 == countdownEndT).
    for (let i = 0; i < 100 && ctx.m.phase !== 'active'; i++) step(ctx);
    expect(ctx.m.phase).toBe('active');
    expect(ctx.m.activatedAt).toBe(100);
    // Killer-less sink of the drone = a storm death (by === undefined).
    ctx.w.sinkShip('d1');
    step(ctx);
    expect(ctx.m.phase).toBe('active'); // both humans still afloat
    // 'a' (destroyer) sinks 'b' (cruiser) → win check finishes at a.
    ctx.w.sinkShip('b', 'a');
    step(ctx);
    expect(ctx.m.phase).toBe('finished');
    expect(ctx.m.winnerId).toBe('a');
    return ctx;
  }

  it('aggregates roster/kills/winner/storm/duration across all combatants incl. drones', () => {
    const s = run().m.endSummary();
    expect(s.rosterSize).toBe(3); // drone included
    expect(s.rosterByClass).toEqual({ destroyer: 1, cruiser: 1, battleship: 1 });
    expect(s.winnerClass).toBe('destroyer');
    expect(s.killsByClass).toEqual({ destroyer: 1, cruiser: 0, battleship: 0 });
    expect(s.stormDeaths).toBe(1);
    expect(s.durationS).toBeCloseTo(0.1, 5); // finishedAt 200 - activatedAt 100
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
