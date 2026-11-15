// The bounded rain gate (Story 11.2 follow-up; re-cut on optical depth by
// Story 11.6) — `World.fogSightAdmits` and `World.fogHullAdmits`.
//
// THE CONTRACT: for every ray the point gate answers exactly `τ ≤ T` for
// `τ = World.fogDepthAlong(ray)` — the WHOLE cell walk — and it may stop
// walking only once that answer is decided; the hull gate answers exactly
// "some point of the shared hull grid passes the point gate". Sight is the
// anti-cheat boundary: an early "seen" the whole walk would have refused is
// a leak. The oracle is the whole walk itself, asked on a second World with
// the identical frame so neither call can warm the other's memo.

import { describe, it, expect } from 'vitest';
import { CONFIG, fogHullGrid, mulberry32, type FogFrame } from '@salvo/shared';
import { World } from '../game/world.js';
import { RAIN_T, clearFrame, stormFrame, uniformRainFrame } from './rainFixture.js';

const SEED = 31;
const T = RAIN_T;
const COLS = CONFIG.fog.hullGridCols;
const ROWS = CONFIG.fog.hullGridRows;

function pair(build: (w: World) => FogFrame): { gate: World; ref: World } {
  const make = (): World => {
    const w = new World(SEED, CONFIG.match.fillTo);
    w.setFogFrameForTest(build(w));
    return w;
  };
  return { gate: make(), ref: make() };
}

/** The weathers the equivalence is held under: the real storm at two clocks
 *  (the first ring, and a later one with the eye off-center) and uniform
 *  rain at full and half density. */
const WEATHERS: ReadonlyArray<[string, (w: World) => FogFrame]> = [
  ['storm, first ring', (w) => stormFrame(w)],
  ['storm, a later ring, eye off-center', (w) => stormFrame(w, CONFIG.zone.beatMs * 5.5, w.map.radius * 0.2, -w.map.radius * 0.1)],
  ['uniform density 1', (w) => uniformRainFrame(w, 1)],
  ['uniform density 1/2', (w) => uniformRainFrame(w, 0.5)],
];

/** The length along (ux, uy) from A at which the reference depth crosses T, by bisection (τ never decreases with length); null when the ray never gets there inside `max`. */
function vanishingLength(ref: World, ax: number, ay: number, ux: number, uy: number, max: number): number | null {
  if (ref.fogDepthAlong(ax, ay, ax + ux * max, ay + uy * max) <= T) return null;
  let lo = 0;
  let hi = max;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (ref.fogDepthAlong(ax, ay, ax + ux * mid, ay + uy * mid) <= T) lo = mid;
    else hi = mid;
  }
  return hi;
}

describe('World.fogSightAdmits — the whole walk\'s answer, decided early', () => {
  it('equals `fogDepthAlong(ray) <= T` for seeded rays under the real storm and uniform rain — at lengths on, just inside and just outside the ray\'s own vanishing length — and both answers occur', () => {
    let seen = 0;
    let hidden = 0;
    let walked = 0;
    let edges = 0;
    WEATHERS.forEach(([name, build], wi) => {
      const { gate, ref } = pair(build);
      const R = gate.map.radius;
      const rng = mulberry32(0xf06 ^ wi);
      for (let n = 0; n < 600; n++) {
        const ax = (rng.next() * 2 - 1) * R * 0.7;
        const ay = (rng.next() * 2 - 1) * R * 0.7;
        const ang = rng.next() * 6.283185307179586;
        const ux = Math.cos(ang);
        const uy = Math.sin(ang);
        const lens = [n % 4 === 0 ? 20 + rng.next() * 300 : 300 + rng.next() * 7500];
        const edge = vanishingLength(ref, ax, ay, ux, uy, 8000);
        if (edge !== null) {
          edges += 1;
          lens.push(edge, edge - 1e-9, edge + 1e-9, edge - 1e-4, edge + 1e-4, edge * 0.5, edge + 50);
        }
        for (const len of lens) {
          const bx = ax + ux * len;
          const by = ay + uy * len;
          const want = ref.fogDepthAlong(ax, ay, bx, by) <= T;
          const before = gate.fogWalks;
          expect(gate.fogSightAdmits(ax, ay, bx, by), `${name} ray ${n} length ${len}`).toBe(want);
          walked += gate.fogWalks - before;
          if (want) seen += 1;
          else hidden += 1;
        }
      }
    });
    expect(seen).toBeGreaterThan(0);
    expect(hidden).toBeGreaterThan(0);
    expect(walked).toBeGreaterThan(0);
    expect(edges).toBeGreaterThan(0); // the boundary lengths were really exercised
  });

  it('with no rain every ray is admitted and nothing is walked', () => {
    const { gate } = pair(clearFrame);
    const before = gate.fogWalks;
    expect(gate.fogSightAdmits(-400, 120, 900, -310)).toBe(true);
    expect(gate.fogHullAdmits(-400, 120, 900, -310, 0.4, 60, 10)).toBe(true);
    expect(gate.fogWalks).toBe(before);
  });

  it('a ray no longer than T — its whole length at full density still under the threshold — is admitted without a walk; past that the walk is paid, once for a repeated question', () => {
    const { gate, ref } = pair((w) => uniformRainFrame(w, 1));
    const before = gate.fogWalks;
    const [ax, ay] = [-300, 120];
    expect(gate.fogSightAdmits(ax, ay, ax + T * 0.6, ay + T * 0.6)).toBe(true); // length 0.85 T
    expect(gate.fogWalks).toBe(before);
    const [bx, by] = [ax + T, ay + T]; // length 1.41 T
    const first = gate.fogSightAdmits(ax, ay, bx, by);
    expect(first).toBe(ref.fogDepthAlong(ax, ay, bx, by) <= T);
    expect(first).toBe(false); // density 1: τ is the length
    expect(gate.fogWalks).toBe(before + 1);
    expect(gate.fogSightAdmits(ax, ay, bx, by)).toBe(first);
    expect(gate.fogWalks).toBe(before + 1);
  });

  it('NO OWN-BANK EXEMPTION: an observer standing in rain pays for it — under uniform rain the depth of a ray is its density × its length from the first unit', () => {
    const { ref } = pair((w) => uniformRainFrame(w, 0.5));
    for (const len of [40, 400, 1600]) {
      expect(ref.fogDepthAlong(100, -50, 100 + len, -50)).toBeCloseTo(0.5 * len, 6);
    }
  });

  it('degenerate rays cross no rain: a point, a non-finite end, a ray wholly off the ocean', () => {
    const { gate } = pair((w) => uniformRainFrame(w, 1));
    const far = gate.map.radius * 3;
    expect(gate.fogSightAdmits(0, 0, 0, 0)).toBe(true);
    expect(gate.fogSightAdmits(NaN, 0, 100, 0)).toBe(true);
    expect(gate.fogSightAdmits(far, 0, far + 5000, 0)).toBe(true);
  });
});

describe('World.fogHullAdmits — a hull is seen while ANY point of its sight grid is', () => {
  /** The OR over the shared grid of the reference walk — the hull gate's whole contract. */
  function gridReference(ref: World, ax: number, ay: number, cx: number, cy: number, heading: number, length: number, beam: number): { any: boolean; passing: number } {
    const pts = new Float64Array(2 * COLS * ROWS);
    const n = fogHullGrid(cx, cy, heading, length, beam, COLS, ROWS, pts);
    let passing = 0;
    for (let k = 0; k < n; k++) if (ref.fogDepthAlong(ax, ay, pts[2 * k], pts[2 * k + 1]) <= T) passing += 1;
    return { any: passing > 0, passing };
  }

  it('equals the OR of `fogDepthAlong(observer → grid point) <= T` over the shared `fogHullGrid`, for seeded observers and hull poses under the real storm and uniform rain; seen, hidden and PARTLY seen hulls all occur', () => {
    let seen = 0;
    let hidden = 0;
    let partial = 0;
    WEATHERS.forEach(([name, build], wi) => {
      const { gate, ref } = pair(build);
      const R = gate.map.radius;
      const rng = mulberry32(0x4a11 ^ wi);
      for (let n = 0; n < 500; n++) {
        const ax = (rng.next() * 2 - 1) * R * 0.7;
        const ay = (rng.next() * 2 - 1) * R * 0.7;
        const ang = rng.next() * 6.283185307179586;
        // Half the hulls sit near the observer's vanishing length on that bearing, where the grid straddles the threshold.
        const edge = n % 2 === 0 ? vanishingLength(ref, ax, ay, Math.cos(ang), Math.sin(ang), 8000) : null;
        const d = edge !== null ? edge + (rng.next() * 2 - 1) * 60 : 100 + rng.next() * 6000;
        const cx = ax + Math.cos(ang) * d;
        const cy = ay + Math.sin(ang) * d;
        const heading = rng.next() * 6.283185307179586;
        const length = 40 + rng.next() * 160;
        const beam = 8 + rng.next() * 24;
        const want = gridReference(ref, ax, ay, cx, cy, heading, length, beam);
        expect(gate.fogHullAdmits(ax, ay, cx, cy, heading, length, beam), `${name} hull ${n}`).toBe(want.any);
        if (!want.any) hidden += 1;
        else if (want.passing < COLS * ROWS) partial += 1;
        else seen += 1;
      }
    });
    expect(seen).toBeGreaterThan(0);
    expect(hidden).toBeGreaterThan(0);
    expect(partial).toBeGreaterThan(0);
  });

  it('a hull whose CENTER is past the threshold is still seen by the end that reaches inside it, and gone once every grid point is past it', () => {
    const { gate } = pair((w) => uniformRainFrame(w, 1)); // τ = distance
    const length = 240;
    const beam = 20;
    // Bow-on to the observer along +x: the nearest grid column's center is (1/2 − 1/(2 COLS)) of the length inside the hull's center.
    const reachIn = (0.5 - 0.5 / COLS) * length;
    const nearCol = (d: number): number => Math.hypot(d - reachIn, beam / (2 * ROWS)); // the nearest grid point's distance
    const partly = T + reachIn / 2;
    expect(nearCol(partly)).toBeLessThan(T); // premise: its near end is inside the threshold...
    expect(partly).toBeGreaterThan(T); // ...and its center is not
    expect(gate.fogSightAdmits(0, 0, partly, 0)).toBe(false); // the center alone is hidden
    expect(gate.fogHullAdmits(0, 0, partly, 0, 0, length, beam)).toBe(true);
    const gone = T + reachIn + beam;
    expect(nearCol(gone)).toBeGreaterThan(T); // premise: no grid point is inside
    expect(gate.fogHullAdmits(0, 0, gone, 0, 0, length, beam)).toBe(false);
  });

  it('the same hull question asked again in the same epoch walks nothing; a hidden hull costs at most one walk per grid point', () => {
    const { gate } = pair((w) => uniformRainFrame(w, 1));
    const before = gate.fogWalks;
    expect(gate.fogHullAdmits(0, 0, T * 3, 0, 1.1, 120, 20)).toBe(false);
    const cost = gate.fogWalks - before;
    expect(cost).toBeGreaterThan(0);
    expect(cost).toBeLessThanOrEqual(COLS * ROWS);
    expect(gate.fogHullAdmits(0, 0, T * 3, 0, 1.1, 120, 20)).toBe(false);
    expect(gate.fogWalks - before).toBe(cost);
  });
});
