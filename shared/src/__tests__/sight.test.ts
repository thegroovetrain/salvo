// effectiveSight (sim/sight.ts) — THE one derivation of a hull's truesight.
// The server's `sightOf` and every client mirror (fog hole, radar dim,
// projectile cull, prediction) call this one function, so pinning its contract
// here pins all of them. Eric 2026-10-29 re-cut FLASH SHELLS into THE WHITEOUT
// LAW: a flashed hull's sight is ZERO through ramp + hold, then grows LINEARLY
// from 0 to the full sightRange across the clear phase; the window is the sum
// of the three CONFIG phases (never pinned here — read off CONFIG); radar is
// never touched; the curve is uniform for humans and bots.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  SHIP_CLASS_IDS,
  FLASH_WINDOW_MS,
  effectiveSight,
  effectiveStats,
  flashClearFraction,
  flashElapsedMs,
  type LineId,
} from '../index.js';

const BUILDS: LineId[][] = [[], new Array<LineId>(5).fill('radarSweep'), ['starShells', 'starShells', 'reload']];
const { rampMs, holdMs, clearMs } = CONFIG.flashShells;
const BLIND = rampMs + holdMs;
const HIT = 100_000; // ms — an arbitrary server-clock hit time
const UNTIL = HIT + FLASH_WINDOW_MS;

describe('effectiveSight — the one derivation hub', () => {
  it('undazzled, it is the derived sightRange, on every hull and build — with no mark, a zero mark, or a lapsed one', () => {
    for (const id of SHIP_CLASS_IDS) {
      for (const cards of BUILDS) {
        const s = effectiveStats(CONFIG.shipClasses[id], cards);
        const tag = `${id}/${cards.join(',')}`;
        expect(effectiveSight(s), tag).toBe(s.sightRange);
        expect(effectiveSight(s, 0, 5000), tag).toBe(s.sightRange);
        expect(effectiveSight(s, 4000, 5000), tag).toBe(s.sightRange); // the mark is in the past
      }
    }
  });

  it('FLASH_WINDOW_MS is the sum of the three CONFIG phases — the one derived total', () => {
    expect(FLASH_WINDOW_MS).toBe(rampMs + holdMs + clearMs);
  });
});

describe('effectiveSight — THE WHITEOUT LAW (Eric 2026-10-29)', () => {
  it('is ZERO at every instant inside ramp + hold, on every hull and build', () => {
    for (const id of SHIP_CLASS_IDS) {
      for (const cards of BUILDS) {
        const s = effectiveStats(CONFIG.shipClasses[id], cards);
        for (const dt of [0, 1, rampMs, rampMs + holdMs / 2, BLIND - 1]) {
          expect(effectiveSight(s, UNTIL, HIT + dt), `${id}/${cards.join(',')} @${dt}`).toBe(0);
        }
      }
    }
  });

  it('grows linearly across the clear phase: half sight at the clear midpoint, full at the window end, full past it', () => {
    const s = effectiveStats(CONFIG.shipClasses.torpedoBoat);
    expect(effectiveSight(s, UNTIL, HIT + BLIND + clearMs / 2)).toBeCloseTo(s.sightRange / 2, 9);
    expect(effectiveSight(s, UNTIL, HIT + BLIND + clearMs / 4)).toBeCloseTo(s.sightRange / 4, 9);
    expect(effectiveSight(s, UNTIL, UNTIL)).toBe(s.sightRange);
    expect(effectiveSight(s, UNTIL, UNTIL + 1)).toBe(s.sightRange);
    expect(effectiveSight(s, UNTIL, UNTIL + 60_000)).toBe(s.sightRange);
  });

  it('is monotone non-decreasing in `now` across the whole window', () => {
    const s = effectiveStats(CONFIG.shipClasses.battleship);
    let prev = -1;
    for (let t = HIT; t <= UNTIL + 500; t += 50) {
      const v = effectiveSight(s, UNTIL, t);
      expect(v, `t=${t}`).toBeGreaterThanOrEqual(prev);
      expect(v).toBeLessThanOrEqual(s.sightRange);
      prev = v;
    }
  });

  it('a re-flash restarts the window: a later mark gives a smaller sight at the same `now`', () => {
    const s = effectiveStats(CONFIG.shipClasses.mineLayer);
    const now = HIT + BLIND + clearMs / 2; // half clear under the first mark
    const first = effectiveSight(s, UNTIL, now);
    const reflashed = effectiveSight(s, Math.max(UNTIL, now + FLASH_WINDOW_MS), now); // hit again at `now`
    expect(first).toBeGreaterThan(0);
    expect(reflashed).toBe(0); // back inside ramp + hold
    expect(reflashed).toBeLessThan(first);
  });

  it('reads only sightRange — radar is never an input (a bare Pick compiles and runs; radar range changes nothing)', () => {
    const narrow = { sightRange: 400, radarRange: 1000 };
    const wide = { sightRange: 400, radarRange: 3000 };
    const t = HIT + BLIND + clearMs / 3;
    expect(effectiveSight(narrow, UNTIL, t)).toBe(effectiveSight(wide, UNTIL, t));
    expect(effectiveSight({ sightRange: 100 })).toBe(100);
    expect(effectiveSight({ sightRange: 100 }, UNTIL, HIT + 1)).toBe(0);
  });

  it('never touches the stats it reads — a flash blinds, it does not deafen', () => {
    const s = effectiveStats(CONFIG.shipClasses.torpedoBoat);
    const before = structuredClone(s);
    effectiveSight(s, UNTIL, HIT + BLIND + 10);
    expect(s).toEqual(before);
  });

  it('fails CLOSED: a pending mark with a non-finite clock, or a non-finite mark, reads as sight 0', () => {
    const s = { sightRange: 500 };
    expect(effectiveSight(s, UNTIL, Number.NaN)).toBe(0);
    expect(effectiveSight(s, UNTIL, Number.POSITIVE_INFINITY)).toBe(s.sightRange); // the mark has lapsed at +∞
    expect(effectiveSight(s, UNTIL, Number.NEGATIVE_INFINITY)).toBe(0);
    expect(effectiveSight(s, Number.POSITIVE_INFINITY, HIT)).toBe(0);
    expect(effectiveSight(s, Number.NaN, HIT)).toBe(0);
    expect(effectiveSight(s, Number.NEGATIVE_INFINITY, HIT)).toBe(s.sightRange); // not a pending mark
  });
});

describe('flashClearFraction / flashElapsedMs — the curve the client paints', () => {
  it('flashElapsedMs is the time since the hit under a `hit + FLASH_WINDOW_MS` mark', () => {
    expect(flashElapsedMs(UNTIL, HIT)).toBe(0);
    expect(flashElapsedMs(UNTIL, HIT + 1234)).toBe(1234);
    expect(flashElapsedMs(UNTIL, UNTIL)).toBe(FLASH_WINDOW_MS);
  });

  it('flashClearFraction is 0 through ramp + hold, linear across clear, clamped to [0, 1], 0 on NaN', () => {
    expect(flashClearFraction(-1000)).toBe(0);
    expect(flashClearFraction(0)).toBe(0);
    expect(flashClearFraction(BLIND)).toBe(0);
    expect(flashClearFraction(BLIND + clearMs / 2)).toBeCloseTo(0.5, 9);
    expect(flashClearFraction(BLIND + clearMs)).toBe(1);
    expect(flashClearFraction(BLIND + clearMs * 10)).toBe(1);
    expect(flashClearFraction(Number.NaN)).toBe(0);
    expect(flashClearFraction(Number.POSITIVE_INFINITY)).toBe(1);
  });

  it('effectiveSight IS sightRange × flashClearFraction(flashElapsedMs) while the mark is pending', () => {
    const s = { sightRange: 640 };
    for (let dt = 0; dt < FLASH_WINDOW_MS; dt += 250) {
      expect(effectiveSight(s, UNTIL, HIT + dt)).toBe(s.sightRange * flashClearFraction(flashElapsedMs(UNTIL, HIT + dt)));
    }
  });
});
