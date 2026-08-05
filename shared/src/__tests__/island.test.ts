// Unit tests for the island geometry query seam (sim/island.ts): broadphase
// gating, exact polygon delegation, signed distance, skeleton push-out
// direction — plus the broadphase LOS perf guard over a production map.
import { describe, it, expect } from 'vitest';
import {
  islandSegHit,
  islandBlocksSegment,
  pointInIsland,
  islandDistance,
  nearestCoastPoint,
  skeletonNormal,
  ISLAND_DIST_SLACK,
} from '../sim/island.js';
import { generateMap, islandFromPolygon } from '../sim/map.js';
import { mulberry32 } from '../math/rng.js';
import type { Vec2 } from '../math/vec.js';
import type { Island } from '../types.js';

/** 20x20 axis-aligned square about the origin (CCW), centroid skeleton. */
function squareIsland(): Island {
  return islandFromPolygon([
    { x: -10, y: -10 },
    { x: 10, y: -10 },
    { x: 10, y: 10 },
    { x: -10, y: 10 },
  ]);
}

describe('islandFromPolygon', () => {
  it('computes the bounding circle and core about the skeleton centroid', () => {
    const isle = squareIsland();
    expect(isle.x).toBeCloseTo(0);
    expect(isle.y).toBeCloseTo(0);
    expect(isle.r).toBeCloseTo(Math.hypot(10, 10));
    expect(isle.core).toBeCloseTo(10);
    expect(isle.skeleton).toHaveLength(1);
  });

  it('zeroes the core when the skeleton centre is outside the polygon', () => {
    const isle = islandFromPolygon(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
      [{ x: -50, y: 0 }],
    );
    expect(isle.core).toBe(0);
  });
});

describe('islandSegHit', () => {
  it('returns the earliest hit fraction on a crossing segment', () => {
    const isle = squareIsland();
    const t = islandSegHit({ x: -20, y: 0 }, { x: 20, y: 0 }, isle);
    expect(t).toBeCloseTo(0.25); // enters at x = -10
  });

  it('returns 0 when the segment starts inside', () => {
    expect(islandSegHit({ x: 0, y: 0 }, { x: 40, y: 0 }, squareIsland())).toBe(0);
  });

  it('returns null on a clean miss (and on a broadphase miss)', () => {
    const isle = squareIsland();
    expect(islandSegHit({ x: -20, y: 30 }, { x: 20, y: 30 }, isle)).toBeNull();
    expect(islandSegHit({ x: 100, y: 100 }, { x: 120, y: 100 }, isle)).toBeNull();
  });

  it('misses a path inside the bounding circle but outside the polygon', () => {
    // The square's corner region: inside r = 14.14, outside the edges.
    const isle = squareIsland();
    expect(islandSegHit({ x: 13, y: 11 }, { x: 11, y: 13 }, isle)).toBeNull();
  });
});

describe('islandBlocksSegment', () => {
  it('blocks a crossing segment and passes a clear one', () => {
    const isle = squareIsland();
    expect(islandBlocksSegment({ x: -20, y: 0 }, { x: 20, y: 0 }, isle)).toBe(true);
    expect(islandBlocksSegment({ x: -20, y: 30 }, { x: 20, y: 30 }, isle)).toBe(false);
  });

  it('the core early-out agrees with the exact test through the centre', () => {
    const isle = squareIsland();
    expect(isle.core).toBeGreaterThan(0);
    expect(islandBlocksSegment({ x: -30, y: 1 }, { x: 30, y: -1 }, isle)).toBe(true);
  });
});

describe('pointInIsland', () => {
  it('inside / outside / broadphase-outside', () => {
    const isle = squareIsland();
    expect(pointInIsland({ x: 0, y: 0 }, isle)).toBe(true);
    expect(pointInIsland({ x: 13, y: 13 }, isle)).toBe(false); // in r, outside poly
    expect(pointInIsland({ x: 500, y: 0 }, isle)).toBe(false);
  });
});

describe('islandDistance (signed)', () => {
  it('is exact near the island: positive outside, negative inside', () => {
    const isle = squareIsland();
    expect(islandDistance({ x: 15, y: 0 }, isle)).toBeCloseTo(5);
    expect(islandDistance({ x: 0, y: 0 }, isle)).toBeCloseTo(-10);
  });

  it('returns the conservative lower bound beyond the slack radius', () => {
    const isle = squareIsland();
    const d = 200; // > r + ISLAND_DIST_SLACK
    expect(d).toBeGreaterThan(isle.r + ISLAND_DIST_SLACK);
    const got = islandDistance({ x: d, y: 0 }, isle);
    expect(got).toBeCloseTo(d - isle.r); // lower bound, <= true distance (190)
    expect(got).toBeLessThanOrEqual(190);
  });
});

describe('nearestCoastPoint', () => {
  it('projects onto the closest edge', () => {
    const p = nearestCoastPoint({ x: 15, y: 3 }, squareIsland());
    expect(p.x).toBeCloseTo(10);
    expect(p.y).toBeCloseTo(3);
    expect(p.dist).toBeCloseTo(5);
  });
});

describe('skeletonNormal (the push-out authority)', () => {
  it('points from the nearest skeleton point toward p', () => {
    const n = skeletonNormal({ x: 5, y: 0 }, squareIsland());
    expect(n.nx).toBeCloseTo(1);
    expect(n.ny).toBeCloseTo(0);
    expect(n.dist).toBeCloseTo(5);
  });

  it('picks the nearest of several skeleton points', () => {
    const isle = islandFromPolygon(
      [
        { x: -40, y: -10 },
        { x: 40, y: -10 },
        { x: 40, y: 10 },
        { x: -40, y: 10 },
      ],
      [
        { x: -30, y: 0 },
        { x: 30, y: 0 },
      ],
    );
    const n = skeletonNormal({ x: 33, y: 4 }, isle);
    expect(n.dist).toBeCloseTo(5);
    expect(n.nx).toBeCloseTo(3 / 5);
    expect(n.ny).toBeCloseTo(4 / 5);
  });

  it('degenerates to +x on the skeleton point itself', () => {
    const n = skeletonNormal({ x: 0, y: 0 }, squareIsland());
    expect(n.nx).toBe(1);
    expect(n.ny).toBe(0);
    expect(n.dist).toBe(0);
  });
});

// --- Float-dust regression at the segPolygonHit radius comparison -----------
//
// THESE TESTS MUST USE GENERATOR-PRODUCED POLYGONS, and the reason is the
// whole point of the suite: every fixture above is an axis-aligned INTEGER
// square. A horizontal probe crossing a vertical edge of such a square solves
// to a closest approach of EXACTLY 0.0 in IEEE double, so the old
// `c.dist <= radius` test (radius === 0 on the island LOS / shell / aim path)
// passed by luck and the defect was invisible.
//
// Real islands are fractal polygons with irrational, arbitrarily-oriented
// edges at board-scale coordinates. There, segSegClosest solves for the
// closest-approach parameters and multiplies BACK to a point before taking
// Math.hypot, so a genuine transversal crossing returns float dust
// (measured 7.216449660063518e-16 at coords ~10; it scales with coordinate
// magnitude, so ~2e-13 out at the 2400u board edge) and never exactly 0.
// Against `<= 0` that read as a clean MISS: 38.5% of provably-crossing
// segments reported no hit for shells/aim preview and 31.8% reported clear
// line of sight through solid land — through the anti-cheat fog-of-war
// chokepoint. Only generator geometry exercises that path; hand-built
// axis-aligned fixtures cannot reproduce it.
describe('generator geometry: no crossing may be missed to float dust', () => {
  /** Points genuinely inside `isle`'s polygon, one per sampled bearing. */
  function interiorProbes(isle: Island): { inner: Vec2; outer: Vec2 }[] {
    const out: { inner: Vec2; outer: Vec2 }[] = [];
    for (let k = 0; k < 40; k++) {
      const a = (k * Math.PI) / 20;
      for (let f = 0.9; f > 0.05; f -= 0.1) {
        const inner = {
          x: isle.x + Math.cos(a) * isle.r * f,
          y: isle.y + Math.sin(a) * isle.r * f,
        };
        if (!pointInIsland(inner, isle)) continue;
        // Fire from well outside the bounding circle, ENDING on land: the
        // ground truth is unambiguous — the segment must cross the coastline.
        out.push({
          inner,
          outer: { x: isle.x + Math.cos(a) * isle.r * 2.5, y: isle.y + Math.sin(a) * isle.r * 2.5 },
        });
        break;
      }
    }
    return out;
  }

  it('every segment ending inside a polygon hits AND blocks (several seeds/rosters)', () => {
    let sampled = 0;
    let segMissed = 0;
    let losMissed = 0;
    for (const [seed, cap] of [
      [12345, 20],
      [42, 20],
      [7, 12],
      [99991, 6],
      [2026, 30],
    ] as const) {
      for (const isle of generateMap(seed, cap).islands) {
        for (const { inner, outer } of interiorProbes(isle)) {
          sampled++;
          if (islandSegHit(outer, inner, isle) === null) segMissed++;
          if (!islandBlocksSegment(outer, inner, isle)) losMissed++;
        }
      }
    }
    expect(sampled).toBeGreaterThan(2000); // the probe must actually have bitten
    expect(segMissed).toBe(0);
    expect(losMissed).toBe(0);
  });

  it('chords straight through island centres are always blocked', () => {
    let chords = 0;
    for (const [seed, cap] of [
      [12345, 20],
      [42, 20],
      [2026, 30],
    ] as const) {
      for (const isle of generateMap(seed, cap).islands) {
        // `core > 0` proves the bounding centre is inside the polygon, so a
        // chord through it is unambiguously a land crossing.
        if (isle.core <= 0) continue;
        for (let k = 0; k < 24; k++) {
          const a = (k * Math.PI) / 12;
          const d = isle.r * 3;
          const a0 = { x: isle.x - Math.cos(a) * d, y: isle.y - Math.sin(a) * d };
          const a1 = { x: isle.x + Math.cos(a) * d, y: isle.y + Math.sin(a) * d };
          chords++;
          expect(islandBlocksSegment(a0, a1, isle)).toBe(true);
          expect(islandSegHit(a0, a1, isle)).not.toBeNull();
        }
      }
    }
    expect(chords).toBeGreaterThan(100);
  });

  it('a concave cove is still genuinely missable under the epsilon', () => {
    // The tolerance must not make a cavity solid. A deliberate U with a
    // 20u-wide mouth, rotated by an irrational-ish angle and pushed out to
    // board-scale coordinates so the epsilon path is genuinely exercised
    // (an axis-aligned fixture would prove nothing here either).
    const th = 0.37;
    const c = Math.cos(th);
    const s = Math.sin(th);
    const place = (p: Vec2): Vec2 => ({
      x: 1137.31 + c * p.x - s * p.y,
      y: -412.77 + s * p.x + c * p.y,
    });
    const isle = islandFromPolygon(
      [
        { x: -30, y: -20 },
        { x: 30, y: -20 },
        { x: 30, y: 20 },
        { x: 10, y: 20 }, // starboard prong tip
        { x: 10, y: -5 }, // cove floor
        { x: -10, y: -5 },
        { x: -10, y: 20 }, // port prong tip
        { x: -30, y: 20 },
      ].map(place),
    );
    expect(isle.core).toBe(0); // the bounding centre sits in the cove (water)
    // Down the middle of the mouth, stopping 10u clear of the cove floor and
    // 10u clear of either prong: no edge is touched, no interior is entered.
    const mouth0 = place({ x: 0, y: 30 });
    const mouth1 = place({ x: 0, y: 5 });
    expect(pointInIsland(mouth1, isle)).toBe(false);
    expect(islandSegHit(mouth0, mouth1, isle)).toBeNull();
    expect(islandBlocksSegment(mouth0, mouth1, isle)).toBe(false);
    // ...but pushing one unit past the cove floor DOES hit.
    expect(islandSegHit(mouth0, place({ x: 0, y: -6 }), isle)).not.toBeNull();
  });
});

describe('broadphase perf guard', () => {
  it('LOS across a full production map stays within budget', () => {
    const map = generateMap(42, 20);
    const rng = mulberry32(1234);
    const R = map.radius;
    const t0 = performance.now();
    let blocked = 0;
    for (let i = 0; i < 10_000; i++) {
      const a = { x: rng.float(-R, R), y: rng.float(-R, R) };
      const b = { x: rng.float(-R, R), y: rng.float(-R, R) };
      for (const isle of map.islands) {
        if (islandBlocksSegment(a, b, isle)) {
          blocked++;
          break;
        }
      }
    }
    const elapsed = performance.now() - t0;
    expect(blocked).toBeGreaterThan(0); // sanity: terrain actually blocks
    // 10k full-map LOS sweeps; generous CI budget — the broadphase keeps the
    // exact polygon test off the hot path for distant islands.
    expect(elapsed).toBeLessThan(1500);
  });
});
