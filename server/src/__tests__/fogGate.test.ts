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
//
// THE SMOKE TERM (Story 11.6 scope add, Eric 2026-11-14 — smoke occludes
// sight like rain): with clouds alive the point gate answers exactly
// `fogDepthAlong(ray) <= T − smokeDepthAlong(ray)` (total optical depth
// against the one threshold), the hull gate the OR of that over the grid,
// and `fogRainAdmits` stays the rain alone. A ray that touches no cloud
// costs what it cost before, and the one-entry memos never serve an answer
// from a smaller cloud.

import { describe, it, expect } from 'vitest';
import { CONFIG, fogHullGrid, mulberry32, type FogFrame } from '@salvo/shared';
import { World } from '../game/world.js';
import { RAIN_T, clearFrame, smokeDepthOracle, stormFrame, uniformRainFrame } from './rainFixture.js';

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

// ---------------------------------------------------------------------------
// THE SMOKE TERM
// ---------------------------------------------------------------------------

const SMOKE = CONFIG.countermeasure;

/** Seat a cloud on `w` as a press would store it, `frac` of the way through its life (its disc that far from r0 to r1). */
function seatCloud(w: World, id: string, x: number, y: number, frac: number): void {
  const bornAt = w.now - SMOKE.lifeMs * frac;
  w.clouds.set(id, { id, ownerId: 'x', x, y, bornAt, until: bornAt + SMOKE.lifeMs, lifeMs: SMOKE.lifeMs, r0: SMOKE.r0, r1: SMOKE.r1 });
}

/** The disc radius of a cloud `frac` through its life (the stamp's own linear growth). */
const discRadius = (frac: number): number => SMOKE.r0 + (SMOKE.r1 - SMOKE.r0) * frac;

interface Seat { x: number; y: number; frac: number }

/** The same seeded clouds on both Worlds of a pair; returns them. */
function seedClouds(worlds: World[], seed: number, n: number, spread: number): Seat[] {
  const rng = mulberry32(seed);
  const seats: Seat[] = Array.from({ length: n }, () => ({ x: (rng.next() * 2 - 1) * spread, y: (rng.next() * 2 - 1) * spread, frac: rng.next() * 0.99 }));
  for (const w of worlds) seats.forEach((c, i) => seatCloud(w, `cl${i}`, c.x, c.y, c.frac));
  return seats;
}

/** Every weather the smoke term is held under: the four rains above, and no rain at all. */
const SMOKE_WEATHERS: ReadonlyArray<[string, (w: World) => FogFrame]> = [...WEATHERS, ['no rain', clearFrame]];

describe('the smoke term — total optical depth against the one threshold', () => {
  it('the point gate equals `fogDepthAlong(ray) <= T − smokeDepthAlong(ray)` for seeded rays through seeded clouds under every weather and none; rays HID BY SMOKE (the rain alone would show them) and rays seen through smoke both occur, and the rain-only gate never reads the smoke', () => {
    let hidBySmoke = 0;
    let seenThroughSmoke = 0;
    let untouched = 0;
    SMOKE_WEATHERS.forEach(([name, build], wi) => {
      const { gate, ref } = pair(build);
      const spread = gate.map.radius * 0.25;
      const seats = seedClouds([gate, ref], 0x5310c ^ wi, 12, spread);
      const rng = mulberry32(0x7a9 ^ wi);
      for (let n = 0; n < 500; n++) {
        // Most rays start near a cloud (inside it, beside it) and run a few cloud widths; some run long.
        const from = seats[n % seats.length];
        const ax = from.x + (rng.next() * 2 - 1) * SMOKE.r1 * 2;
        const ay = from.y + (rng.next() * 2 - 1) * SMOKE.r1 * 2;
        const ang = rng.next() * 6.283185307179586;
        const len = n % 5 === 0 ? 300 + rng.next() * 6000 : 20 + rng.next() * SMOKE.r1 * 4;
        const bx = ax + Math.cos(ang) * len;
        const by = ay + Math.sin(ang) * len;
        const smoke = ref.smokeDepthAlong(ax, ay, bx, by);
        const rainOnly = ref.fogDepthAlong(ax, ay, bx, by) <= T;
        const want = ref.fogDepthAlong(ax, ay, bx, by) <= T - smoke;
        expect(gate.fogSightAdmits(ax, ay, bx, by), `${name} ray ${n}`).toBe(want);
        expect(gate.fogRainAdmits(ax, ay, bx, by), `${name} ray ${n}, the rain alone`).toBe(rainOnly);
        if (smoke === 0) untouched += 1;
        else if (want) seenThroughSmoke += 1;
        else if (rainOnly) hidBySmoke += 1;
      }
    });
    expect(hidBySmoke).toBeGreaterThan(0);
    expect(seenThroughSmoke).toBeGreaterThan(0);
    expect(untouched).toBeGreaterThan(0);
  });

  it('the hull gate equals the OR of the point rule over the shared `fogHullGrid`; hulls wholly hidden by smoke, partly seen past a cloud\'s edge and wholly seen all occur', () => {
    let seen = 0;
    let hidden = 0;
    let partial = 0;
    SMOKE_WEATHERS.forEach(([name, build], wi) => {
      const { gate, ref } = pair(build);
      const seats = seedClouds([gate, ref], 0xc10d ^ wi, 10, gate.map.radius * 0.2);
      const rng = mulberry32(0x4a77 ^ wi);
      const pts = new Float64Array(2 * COLS * ROWS);
      for (let n = 0; n < 300; n++) {
        const from = seats[n % seats.length];
        const ax = from.x + (rng.next() * 2 - 1) * SMOKE.r1 * 3;
        const ay = from.y + (rng.next() * 2 - 1) * SMOKE.r1 * 3;
        const ang = rng.next() * 6.283185307179586;
        const d = 40 + rng.next() * SMOKE.r1 * 4;
        const [cx, cy, heading] = [ax + Math.cos(ang) * d, ay + Math.sin(ang) * d, rng.next() * 6.283185307179586];
        const [length, beam] = [40 + rng.next() * 160, 8 + rng.next() * 24];
        const count = fogHullGrid(cx, cy, heading, length, beam, COLS, ROWS, pts);
        let passing = 0;
        for (let k = 0; k < count; k++) {
          const [px, py] = [pts[2 * k], pts[2 * k + 1]];
          if (ref.fogDepthAlong(ax, ay, px, py) <= T - ref.smokeDepthAlong(ax, ay, px, py)) passing += 1;
        }
        expect(gate.fogHullAdmits(ax, ay, cx, cy, heading, length, beam), `${name} hull ${n}`).toBe(passing > 0);
        if (passing === 0) hidden += 1;
        else if (passing < count) partial += 1;
        else seen += 1;
      }
    });
    expect(seen).toBeGreaterThan(0);
    expect(hidden).toBeGreaterThan(0);
    expect(partial).toBeGreaterThan(0);
  });

  it('with no rain the smoke alone decides, with no lattice walk: a ray through a grown cloud is hidden, the ray beside it is seen', () => {
    const { gate } = pair(clearFrame);
    seatCloud(gate, 'c', 0, 0, 0.9);
    const r = discRadius(0.9);
    const before = gate.fogWalks;
    expect(gate.smokeDepthAlong(-r * 2, 0, r * 2, 0)).toBeGreaterThan(T); // premise: the center chord is past the threshold
    expect(gate.fogSightAdmits(-r * 2, 0, r * 2, 0)).toBe(false);
    expect(gate.fogHullAdmits(-r * 2, 0, r * 2, 0, 0.3, 100, 16)).toBe(false);
    expect(gate.fogSightAdmits(-r * 2, r * 1.5, r * 2, r * 1.5)).toBe(true);
    expect(gate.fogRainAdmits(-r * 2, 0, r * 2, 0)).toBe(true);
    expect(gate.fogWalks).toBe(before);
  });

  it('NO OBSERVER EXEMPTION: the smoke on a ray from inside a cloud counts from the eye out, whoever owns the cloud — the depth is the same with either hull named the owner', () => {
    const { gate, ref } = pair(clearFrame);
    for (const [w, owner] of [[gate, 'me'], [ref, 'them']] as const) {
      const bornAt = w.now - SMOKE.lifeMs * 0.9;
      w.clouds.set('c', { id: 'c', ownerId: owner, x: 0, y: 0, bornAt, until: bornAt + SMOKE.lifeMs, lifeMs: SMOKE.lifeMs, r0: SMOKE.r0, r1: SMOKE.r1 });
    }
    const out = discRadius(0.9) * 2;
    expect(gate.smokeDepthAlong(0, 0, out, 0)).toBeGreaterThan(0);
    expect(gate.smokeDepthAlong(0, 0, out, 0)).toBe(ref.smokeDepthAlong(0, 0, out, 0));
    expect(gate.fogSightAdmits(0, 0, out, 0)).toBe(ref.fogSightAdmits(0, 0, out, 0));
  });

  it('a ray that touches no cloud costs exactly what it cost with no cloud alive: the same answers and the same number of lattice walks', () => {
    const { gate, ref } = pair((w) => stormFrame(w));
    const R = gate.map.radius;
    seatCloud(gate, 'far', R * 0.6, R * 0.6, 0.9); // a grown cloud in one corner; `ref` has none
    const rng = mulberry32(0xc057);
    let asked = 0;
    for (let n = 0; n < 400; n++) {
      // Rays confined to the opposite half: none can reach the cloud.
      const ax = -rng.next() * R * 0.6;
      const ay = -rng.next() * R * 0.6;
      const bx = -rng.next() * R * 0.6;
      const by = -rng.next() * R * 0.6;
      expect(gate.smokeDepthAlong(ax, ay, bx, by)).toBe(0); // premise
      expect(gate.fogSightAdmits(ax, ay, bx, by)).toBe(ref.fogSightAdmits(ax, ay, bx, by));
      asked += 1;
    }
    expect(asked).toBeGreaterThan(0);
    expect(gate.fogWalks).toBeGreaterThan(0);
    expect(gate.fogWalks).toBe(ref.fogWalks);
  });

  it('THE MEMOS FOLLOW THE CLOUD: the same ray and the same hull question, asked again after the cloud has grown across them, get the new answer — and again once the cloud is gone', () => {
    const { gate } = pair(clearFrame);
    // A ray passing the young disc's edge: clear of r0, deep inside r1.
    const y = (SMOKE.r0 + SMOKE.r1) / 2;
    const ray = [-SMOKE.r1 * 2, y, SMOKE.r1 * 2, y] as const;
    const hull = [-SMOKE.r1 * 2, y, SMOKE.r1 * 2, y, 0, 100, 16] as const;
    seatCloud(gate, 'c', 0, 0, 0);
    expect(gate.fogSightAdmits(...ray)).toBe(true);
    expect(gate.fogHullAdmits(...hull)).toBe(true);
    seatCloud(gate, 'c', 0, 0, 0.99); // the same cloud, grown
    expect(gate.smokeDepthAlong(...ray)).toBeGreaterThan(T); // premise
    expect(gate.fogSightAdmits(...ray)).toBe(false);
    expect(gate.fogHullAdmits(...hull)).toBe(false);
    gate.clouds.clear();
    expect(gate.fogSightAdmits(...ray)).toBe(true);
    expect(gate.fogHullAdmits(...hull)).toBe(true);
  });

  it('a live cloud grows with the World\'s clock: stepping the world deepens the smoke on a ray inside its final disc', () => {
    const { gate } = pair(clearFrame);
    seatCloud(gate, 'c', 0, 0, 0);
    const y = (SMOKE.r0 + SMOKE.r1) / 2;
    const depths: number[] = [];
    for (let k = 0; k < 4; k++) {
      depths.push(gate.smokeDepthAlong(-SMOKE.r1 * 2, y, SMOKE.r1 * 2, y));
      for (let t = 0; t < Math.ceil(SMOKE.lifeMs / 5 / CONFIG.tick.simDtMs); t++) gate.step();
    }
    expect(depths[0]).toBe(0); // premise: the young disc does not reach the ray
    for (let k = 1; k < depths.length; k++) expect(depths[k]).toBeGreaterThanOrEqual(depths[k - 1]);
    expect(depths[depths.length - 1]).toBeGreaterThan(depths[0]);
  });
});

describe('the perception suite\'s smoke oracle is an honest band around production', () => {
  it('for seeded rays through seeded clouds, production\'s smoke depth lies within the independent integral ± its own slack; a ray that misses every cloud reads exactly 0 on both, with no slack', () => {
    const { gate } = pair(clearFrame);
    const seats = seedClouds([gate], 0x0c1e, 10, gate.map.radius * 0.2);
    const discs = seats.map((c) => ({ x: c.x, y: c.y, r: discRadius(c.frac) }));
    const rng = mulberry32(0xb4d);
    let touched = 0;
    let missed = 0;
    for (let n = 0; n < 20000; n++) {
      const from = seats[n % seats.length];
      const a = { x: from.x + (rng.next() * 2 - 1) * SMOKE.r1 * 2, y: from.y + (rng.next() * 2 - 1) * SMOKE.r1 * 2 };
      const ang = rng.next() * 6.283185307179586;
      const len = 10 + rng.next() * SMOKE.r1 * 5;
      const b = { x: a.x + Math.cos(ang) * len, y: a.y + Math.sin(ang) * len };
      const got = gate.smokeDepthAlong(a.x, a.y, b.x, b.y);
      const want = smokeDepthOracle(discs, a, b);
      const gap = Math.abs(got - want.tau);
      expect(gap, `ray ${n}`).toBeLessThanOrEqual(want.slack + 1e-6);
      if (!want.touched) {
        expect(got).toBe(0);
        missed += 1;
      } else {
        touched += 1;
      }
    }
    expect(touched).toBeGreaterThan(0);
    expect(missed).toBeGreaterThan(0);
  });
});
