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
