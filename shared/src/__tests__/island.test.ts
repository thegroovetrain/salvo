// Unit tests for the island geometry query seam (sim/island.ts): broadphase
// gating, exact polygon delegation, signed distance, the nearest-boundary
// push-out direction (cycle 59 — the skeleton normal is retired), the
// pole-keyed core early-out — plus the broadphase LOS perf guard over a
// production map.
import { describe, it, expect } from 'vitest';
import {
  islandSegHit,
  islandBlocksSegment,
  pointInIsland,
  islandDistance,
  nearestCoastPoint,
  coastNormal,
  ISLAND_DIST_SLACK,
} from '../sim/island.js';
import { generateMap, islandFromPolygon } from '../sim/map.js';
import { mulberry32 } from '../math/rng.js';
import type { Vec2 } from '../math/vec.js';
import type { Island } from '../types.js';

/** 20x20 axis-aligned square about the origin (CCW). */
function squareIsland(): Island {
  return islandFromPolygon([
    { x: -10, y: -10 },
    { x: 10, y: -10 },
    { x: 10, y: 10 },
    { x: -10, y: 10 },
  ]);
}

/**
 * A hook (U-shape) whose vertex CENTROID falls in its own bay — the exact
 * geometry that zeroed the old bounding-centre core and motivated the pole of
 * inaccessibility (spec ruling 2026-08-06).
 */
function hookIsland(): Island {
  return islandFromPolygon([
    { x: -30, y: -20 },
    { x: 30, y: -20 },
    { x: 30, y: 20 },
    { x: 10, y: 20 }, // starboard prong tip
    { x: 10, y: -5 }, // bay floor
    { x: -10, y: -5 },
    { x: -10, y: 20 }, // port prong tip
    { x: -30, y: 20 },
  ]);
}

describe('islandFromPolygon (the fixture builder)', () => {
  it('computes the bounding circle about the vertex centroid', () => {
    const isle = squareIsland();
    expect(isle.x).toBeCloseTo(0);
    expect(isle.y).toBeCloseTo(0);
    expect(isle.r).toBeCloseTo(Math.hypot(10, 10));
    expect(isle.contours).toEqual([]);
  });

  it('pole = deepest interior point; core measured about IT, not the centre', () => {
    const isle = squareIsland();
    expect(isle.pole.x).toBeCloseTo(0, 1);
    expect(isle.pole.y).toBeCloseTo(0, 1);
    expect(isle.core).toBeCloseTo(10, 1);
  });

  it('a hook keeps core > 0 even though its centroid sits in its own bay', () => {
    const isle = hookIsland();
    // The centroid is inside the bay (water) — the shipped bounding-centre
    // core would have been 0 on exactly this shape.
    expect(pointInIsland({ x: isle.x, y: isle.y }, isle)).toBe(false);
    // The pole lands in the solid lower slab and carries a real core.
    expect(pointInIsland(isle.pole, isle)).toBe(true);
    expect(isle.core).toBeGreaterThan(5);
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

  // The cycle-59 seam change: core is measured about the POLE, so the
  // early-out disc must be centred there too. On a hook the bounding centre
  // sits in the bay — a core disc about IT would call open bay water solid.
  it('the core early-out is keyed on the POLE, not the bounding centre', () => {
    const isle = hookIsland();
    // A chord through the pole (solid land) is blocked…
    const p = isle.pole;
    expect(islandBlocksSegment({ x: p.x - 60, y: p.y }, { x: p.x + 60, y: p.y }, isle)).toBe(true);
    // …while a segment down the open bay (which passes near the bounding
    // CENTRE) stays clear: the pole-centred core cannot swallow the bay.
    expect(islandBlocksSegment({ x: 0, y: 30 }, { x: 0, y: 5 }, isle)).toBe(false);
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

describe('coastNormal (the push-out authority, cycle 59)', () => {
  it('inside: points toward the nearest boundary (the shortest way OUT)', () => {
    const n = coastNormal({ x: 5, y: 0 }, squareIsland());
    expect(n.nx).toBeCloseTo(1);
    expect(n.ny).toBeCloseTo(0);
    expect(n.dist).toBeCloseTo(5);
  });

  it('outside: points away from the boundary (increases clearance)', () => {
    const n = coastNormal({ x: 15, y: 3 }, squareIsland());
    expect(n.nx).toBeCloseTo(1);
    expect(n.ny).toBeCloseTo(0);
    expect(n.dist).toBeCloseTo(5);
  });

  it('amidships a long slab aims PERPENDICULAR to the coast, never at an end', () => {
    // The successor of the cycle-51 ridge regression: a 440x80 slab; a point
    // amidships 20u off-axis must escape straight through the near long edge.
    const isle = islandFromPolygon([
      { x: -220, y: -40 },
      { x: 220, y: -40 },
      { x: 220, y: 40 },
      { x: -220, y: 40 },
    ]);
    const n = coastNormal({ x: 10, y: 20 }, isle);
    expect(n.dist).toBeCloseTo(20);
    expect(n.nx).toBeCloseTo(0);
    expect(n.ny).toBeCloseTo(1);
  });

  it('inside a hook bay ARM, escapes through the arm side — never across the bay', () => {
    const isle = hookIsland();
    // Inside the starboard prong (x in [10, 30]), near its inner wall.
    const n = coastNormal({ x: 12, y: 10 }, isle);
    // Nearest boundary is the prong's inner wall at x = 10: escape -x, into
    // the open bay (water) — a valid exit even from concave geometry.
    expect(n.nx).toBeCloseTo(-1);
    expect(n.ny).toBeCloseTo(0);
    expect(n.dist).toBeCloseTo(2);
  });

  it('degenerates via the pole direction exactly on the coastline, +x on the pole', () => {
    const isle = squareIsland();
    const onEdge = coastNormal({ x: 10, y: 0 }, isle);
    expect(onEdge.dist).toBe(0);
    expect(onEdge.nx).toBeCloseTo(1, 1); // away from the pole (origin)
    const onPole = coastNormal({ x: isle.pole.x, y: isle.pole.y }, isle);
    expect(Math.hypot(onPole.nx, onPole.ny)).toBeCloseTo(1);
  });
});

// --- Float-dust regression at the segPolygonHit radius comparison -----------
//
// THESE TESTS MUST USE GENERATOR-PRODUCED POLYGONS: axis-aligned integer
// fixtures solve to a closest approach of EXACTLY 0.0 and hid the defect.
// Real islands have irrational, arbitrarily-oriented edges at board-scale
// coordinates, where a genuine transversal crossing returns float dust
// (~1e-16..1e-13) and a bare `<= 0` read as a clean miss — 38.5% of
// provably-crossing segments for shells and 31.8% for LOS, through the
// anti-cheat fog-of-war chokepoint.
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

  it('chords straight through island POLES are always blocked', () => {
    let chords = 0;
    for (const [seed, cap] of [
      [12345, 20],
      [42, 20],
      [2026, 30],
    ] as const) {
      for (const isle of generateMap(seed, cap).islands) {
        // The pole is inside the polygon by construction, so a chord through
        // it is unambiguously a land crossing.
        for (let k = 0; k < 24; k++) {
          const a = (k * Math.PI) / 12;
          const d = isle.r * 3;
          const a0 = { x: isle.pole.x - Math.cos(a) * d, y: isle.pole.y - Math.sin(a) * d };
          const a1 = { x: isle.pole.x + Math.cos(a) * d, y: isle.pole.y + Math.sin(a) * d };
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
    // board-scale coordinates so the epsilon path is genuinely exercised.
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
    // The bounding centre sits in the cove (water) — but the POLE never does,
    // so the core stays honest and the mouth stays open.
    expect(pointInIsland({ x: isle.x, y: isle.y }, isle)).toBe(false);
    expect(isle.core).toBeGreaterThan(0);
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
