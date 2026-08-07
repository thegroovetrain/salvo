// Pins the shared silhouette registry (Story 1.3): the silhouette IS the
// hitbox, so this suite guards the geometry everything else derives from —
// exact normalized dims, bow orientation, centering, the drone chevron trio,
// and the concave-safety of every polygon query (the TB stern notch and ML
// transom notch are real, missable cavities).

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  DRONE_HULL_IDS,
  DRONE_SIZE_IDS,
  HULL_IDS,
  SHIP_CLASS_IDS,
  hullEnvelope,
  hullSilhouette,
  transformPolygon,
  pointInPolygon,
  pointPolygonDistance,
  closestPointOnPolygon,
  segPolygonDistance,
  segPolygonHit,
  polygonMaxRadius,
  pointSegmentDistance,
} from '../index.js';
import type { Vec2 } from '../index.js';
import { segSegClosest } from '../math/geom.js';
// simplifyLoop is not (yet) re-exported from the barrel — the map-gen
// rewrite that consumes it lands separately this cycle — so this suite
// imports the module directly rather than widening index.ts. (A shared
// `polygonIsSimple` already exists in sim/islandShape.ts, mid-deletion this
// same cycle by that parallel rewrite, so this file verifies simplicity with
// its own test-local check rather than depending on either copy.)
import { simplifyLoop } from '../sim/silhouette.js';

function extents(poly: readonly Vec2[]): { minX: number; maxX: number; minY: number; maxY: number } {
  return {
    minX: Math.min(...poly.map((p) => p.x)),
    maxX: Math.max(...poly.map((p) => p.x)),
    minY: Math.min(...poly.map((p) => p.y)),
    maxY: Math.max(...poly.map((p) => p.y)),
  };
}

describe('hullSilhouette — registry shape', () => {
  it('has a closed polygon (≥3 verts, implicit closure, finite coords) for every hull id', () => {
    expect(HULL_IDS).toEqual([...SHIP_CLASS_IDS, ...DRONE_HULL_IDS]);
    for (const id of HULL_IDS) {
      const poly = hullSilhouette(id);
      expect(poly.length).toBeGreaterThanOrEqual(3);
      // Implicitly closed: no duplicated closing vert, no duplicate neighbors.
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        expect(Math.hypot(poly[i].x - poly[j].x, poly[i].y - poly[j].y)).toBeGreaterThan(1e-9);
      }
      for (const p of poly) {
        expect(Number.isFinite(p.x)).toBe(true);
        expect(Number.isFinite(p.y)).toBe(true);
      }
    }
  });

  it('board outlines keep their vert counts (TB 8, BB 17, ML 11; drones 6)', () => {
    expect(hullSilhouette('torpedoBoat')).toHaveLength(8);
    expect(hullSilhouette('battleship')).toHaveLength(17);
    expect(hullSilhouette('mineLayer')).toHaveLength(11);
    for (const id of DRONE_HULL_IDS) expect(hullSilhouette(id)).toHaveLength(6);
  });
});

describe('hullSilhouette — exact normalization (ratified length/beam, centered)', () => {
  it.each(HULL_IDS.map((id) => [id] as const))('%s spans exactly length × beam, centered on origin', (id) => {
    const { hull } = hullEnvelope(id);
    const e = extents(hullSilhouette(id));
    // Bow-to-stern span == EXACT ratified length, centered (bow at +length/2).
    expect(e.maxX).toBeCloseTo(hull.length / 2, 9);
    expect(e.minX).toBeCloseTo(-hull.length / 2, 9);
    // Max width == EXACT ratified beam, laterally centered.
    expect(e.maxY).toBeCloseTo(hull.beam / 2, 9);
    expect(e.minY).toBeCloseTo(-hull.beam / 2, 9);
  });

  it('every silhouette is symmetric about the centerline', () => {
    for (const id of HULL_IDS) {
      const poly = hullSilhouette(id);
      for (const p of poly) {
        // A mirrored twin vert exists for every vert.
        const twin = poly.find((q) => Math.abs(q.x - p.x) < 1e-9 && Math.abs(q.y + p.y) < 1e-9);
        expect(twin).toBeDefined();
      }
    }
  });
});

describe('hullSilhouette — bow lies in the +heading direction', () => {
  it.each(HULL_IDS.map((id) => [id] as const))('%s bow transforms to pos + heading · length/2', (id) => {
    const { hull } = hullEnvelope(id);
    const heading = 0.7;
    const pose = { x: 120, y: -45 };
    const world = transformPolygon(hullSilhouette(id), pose.x, pose.y, heading);
    // Project every vert onto the heading direction; the max is the bow tip.
    const ux = Math.cos(heading);
    const uy = Math.sin(heading);
    const forward = Math.max(...world.map((p) => (p.x - pose.x) * ux + (p.y - pose.y) * uy));
    expect(forward).toBeCloseTo(hull.length / 2, 9);
  });
});

describe('drone chevrons — legacy traceHull proportions at CONFIG.drones dims', () => {
  it('droneSmall is the exact 85×25 chevron (shoulders 0.3·halfLen, stern inset 0.1·halfLen)', () => {
    const hl = 85 / 2;
    const hb = 25 / 2;
    expect(hullSilhouette('droneSmall')).toEqual([
      { x: hl, y: 0 },
      { x: hl * 0.3, y: -hb },
      { x: -hl + hl * 0.1, y: -hb },
      { x: -hl, y: 0 },
      { x: -hl + hl * 0.1, y: hb },
      { x: hl * 0.3, y: hb },
    ]);
  });

  it('all three drone chevrons match their CONFIG.drones hull dims', () => {
    DRONE_HULL_IDS.forEach((id, i) => {
      const { hull } = CONFIG.drones[DRONE_SIZE_IDS[i]];
      const e = extents(hullSilhouette(id));
      expect(e.maxX - e.minX).toBeCloseTo(hull.length, 9);
      expect(e.maxY - e.minY).toBeCloseTo(hull.beam, 9);
    });
  });
});

describe('transformPolygon', () => {
  const square: Vec2[] = [
    { x: 1, y: 1 },
    { x: -1, y: 1 },
    { x: -1, y: -1 },
    { x: 1, y: -1 },
  ];

  it('is the identity at pose (0, 0, 0)', () => {
    expect(transformPolygon(square, 0, 0, 0)).toEqual(square);
  });

  it('translates and rotates (π/2 maps local (x,y) → world (-y, x))', () => {
    const out = transformPolygon(square, 10, 20, Math.PI / 2);
    expect(out[0].x).toBeCloseTo(10 - 1, 9);
    expect(out[0].y).toBeCloseTo(20 + 1, 9);
    expect(out[3].x).toBeCloseTo(10 + 1, 9);
    expect(out[3].y).toBeCloseTo(20 + 1, 9);
  });

  it('reuses a caller-provided out array (allocation-light per tick)', () => {
    const scratch: Vec2[] = [];
    const out = transformPolygon(square, 5, 5, 0, scratch);
    expect(out).toBe(scratch);
    expect(out).toHaveLength(4);
    const firstVert = out[0];
    transformPolygon(square, 6, 6, 0, scratch);
    expect(scratch[0]).toBe(firstVert); // vert objects reused, not reallocated
    expect(scratch[0].x).toBeCloseTo(7, 9);
  });
});

describe('polygon queries — concave-safe', () => {
  const ml = hullSilhouette('mineLayer'); // transom notch: cavity astern between the prongs
  const tb = hullSilhouette('torpedoBoat'); // stern notch: shallow V cavity

  it('pointInPolygon: interior in, exterior out, cavity out', () => {
    expect(pointInPolygon({ x: 0, y: 0 }, ml)).toBe(true);
    expect(pointInPolygon({ x: 200, y: 0 }, ml)).toBe(false);
    // ML transom cavity: between the stern prongs, OUTSIDE the hull.
    expect(pointInPolygon({ x: -40, y: 0 }, ml)).toBe(false);
    // TB stern-notch cavity likewise.
    expect(pointInPolygon({ x: -48, y: 0 }, tb)).toBe(false);
  });

  it('pointPolygonDistance: 0 inside, edge distance outside (cavity included)', () => {
    expect(pointPolygonDistance({ x: 0, y: 0 }, ml)).toBe(0);
    // In the ML cavity the nearest hull is the prong side wall at y = ±3.5.
    expect(pointPolygonDistance({ x: -40, y: 0 }, ml)).toBeCloseTo(3.5, 6);
  });

  it('closestPointOnPolygon returns a boundary point at the reported distance', () => {
    const p = { x: 60, y: 0 };
    const q = closestPointOnPolygon(p, ml);
    expect(q.dist).toBeCloseTo(Math.hypot(p.x - q.x, p.y - q.y), 9);
    expect(q.x).toBeCloseTo(44, 6); // ML bow tip
    expect(q.y).toBeCloseTo(0, 6);
  });

  it('segPolygonDistance: 0 crossing, 0 starting inside, positive on a near miss', () => {
    expect(segPolygonDistance({ x: 0, y: -100 }, { x: 0, y: 100 }, ml)).toBeCloseTo(0, 9);
    expect(segPolygonDistance({ x: 0, y: 0 }, { x: 1, y: 0 }, ml)).toBe(0);
    expect(segPolygonDistance({ x: 60, y: 5 }, { x: 60, y: -5 }, ml)).toBeCloseTo(16, 6);
  });

  it('polygonMaxRadius is the farthest vert from the origin', () => {
    // TB/BB: the stern prong corners sit farther out than the bow tip
    // (hypot of length/2 and the prong's lateral offset).
    expect(polygonMaxRadius(hullSilhouette('torpedoBoat'))).toBeCloseTo(Math.hypot(50, 3.5), 9);
    expect(polygonMaxRadius(hullSilhouette('battleship'))).toBeCloseTo(Math.hypot(62, 6), 9);
    expect(polygonMaxRadius(hullSilhouette('droneSmall'))).toBeCloseTo(42.5, 9); // bow tip
  });
});

describe('segPolygonHit — swept projectile vs silhouette', () => {
  const ml = hullSilhouette('mineLayer');

  it('returns the closest-approach fraction on a broadside crossing', () => {
    // Perpendicular pass through the hull midships: enters within radius early.
    const frac = segPolygonHit({ x: 0, y: -100 }, { x: 0, y: 100 }, ml, 2);
    expect(frac).not.toBeNull();
    expect(frac!).toBeGreaterThan(0);
    expect(frac!).toBeLessThan(1);
  });

  it('returns 0 when the segment starts inside the hull', () => {
    expect(segPolygonHit({ x: 0, y: 0 }, { x: 100, y: 0 }, ml, 2)).toBe(0);
  });

  it('returns null on a clean miss', () => {
    expect(segPolygonHit({ x: 60, y: 20 }, { x: 60, y: -20 }, ml, 2)).toBeNull();
  });

  it('CONCAVE MISS: a torpedo running up the ML transom notch does not hit', () => {
    // Straight up the stern cavity along the centerline, stopping between the
    // prongs: nearest hull edges are the prong walls at y = ±3.5 — farther
    // than the torpedo hitRadius (2), and the endpoint is outside the hull.
    const a0 = { x: -70, y: 0 };
    const a1 = { x: -40, y: 0 };
    expect(segPolygonHit(a0, a1, ml, CONFIG.torpedo.hitRadius)).toBeNull();

    // The retired capsule model would have HIT here (documents the fix): the
    // old axis segment for an 88×20 hull spans ±34 with radius 10, so the
    // endpoint sat 6u from the axis — inside radius + hitRadius.
    const capsuleDist = pointSegmentDistance(a1, { x: -34, y: 0 }, { x: 34, y: 0 });
    expect(capsuleDist).toBeLessThanOrEqual(10 + CONFIG.torpedo.hitRadius);
  });

  it('CONCAVE MISS: the TB stern-notch cavity is missable too', () => {
    const tb = hullSilhouette('torpedoBoat');
    // Approach dead astern, stopping at the cavity mouth: prong tips sit at
    // (−50, ±3.5), > hitRadius away from the centerline path.
    expect(segPolygonHit({ x: -80, y: 0 }, { x: -50, y: 0 }, tb, CONFIG.torpedo.hitRadius)).toBeNull();
    // Pressing deeper into the narrow V does connect (the cavity converges).
    expect(segPolygonHit({ x: -80, y: 0 }, { x: -44, y: 0 }, tb, CONFIG.torpedo.hitRadius)).not.toBeNull();
  });

  it('a crossing path still hits even when both endpoints are outside (swept, not sampled)', () => {
    const frac = segPolygonHit({ x: 0, y: -200 }, { x: 0, y: 200 }, ml, 0.1);
    expect(frac).not.toBeNull();
  });

  it('radius 0: a transversal crossing whose closest approach is float dust still hits', () => {
    // The island LOS / shell / aim-preview path calls in at radius 0, where
    // `dist <= radius` is an exact float comparison against zero. segSegClosest
    // solves for the crossing parameters and multiplies BACK to a point before
    // Math.hypot, so a genuine crossing of an oblique edge returns dust (~1e-16
    // scaled by coordinate magnitude), never 0. A skewed, non-integer triangle
    // reproduces that; an axis-aligned integer fixture computes to exactly 0
    // and would pass either way.
    const tri = [
      { x: 0.3, y: -5.7 },
      { x: 7.1, y: 0.9 },
      { x: -1.3, y: 6.2 },
    ];
    const edgeDust = segSegClosest({ x: -10, y: 0.4 }, { x: 10, y: 0.4 }, tri[0], tri[1]).dist;
    expect(edgeDust).toBeGreaterThan(0); // the crossing does NOT solve to zero
    expect(edgeDust).toBeLessThan(1e-9); // ...but is far below the tolerance
    const frac = segPolygonHit({ x: -10, y: 0.4 }, { x: 10, y: 0.4 }, tri, 0);
    expect(frac).not.toBeNull();
    expect(frac!).toBeGreaterThan(0);
    expect(frac!).toBeLessThan(1);
  });
});

// --- simplifyLoop (Visvalingam-Whyatt, count-driven) ------------------------
//
// The fBm-terrain rewrite (cycle 59) traces marching-squares coastlines that
// can carry hundreds of near-collinear vertices per island; simplifyLoop is
// the count dial that brings them under the per-tick LOS/collision budget.
// This suite is the ONLY coverage for it — the map-gen rewrite that will
// actually call it lands in a parallel task this same cycle.

/** Signed shoelace area (positive = CCW) — test-local, no shared dependency. */
function shoelaceArea(poly: readonly Vec2[]): number {
  let s = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    s += poly[j].x * poly[i].y - poly[i].x * poly[j].y;
  }
  return s / 2;
}

/**
 * True iff the closed polygon has no crossing edges — test-local so this
 * suite's simplicity check is independent of both simplifyLoop's internal
 * guard and sim/islandShape.ts's (soon-deleted) copy of the same primitive.
 */
function polygonIsSimple(poly: readonly Vec2[]): boolean {
  const orient = (a: Vec2, b: Vec2, c: Vec2) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const cross = (a: Vec2, b: Vec2, c: Vec2, d: Vec2) => {
    const o1 = orient(a, b, c);
    const o2 = orient(a, b, d);
    const o3 = orient(c, d, a);
    const o4 = orient(c, d, b);
    return o1 * o2 < 0 && o3 * o4 < 0;
  };
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (cross(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n])) return false;
    }
  }
  return true;
}

/** A convex, star-shaped-about-origin polygon: every ear removal is provably safe. */
function circlePolygon(n: number, ccw: boolean, radius = 20): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const theta = ccw ? (i / n) * 2 * Math.PI : -(i / n) * 2 * Math.PI;
    // Tiny per-vert jitter (deterministic, no Math.random) breaks exact
    // symmetry so no two effective areas coincide by construction.
    pts.push({
      x: radius * Math.cos(theta) + (i % 3) * 0.01,
      y: radius * Math.sin(theta) + (i % 5) * 0.01,
    });
  }
  return pts;
}

/**
 * A hexagon engineered so two non-adjacent "ears" (index 1 and index 4) have
 * an IDENTICAL effective area (10) — both strictly smaller than every corner
 * ear — to exercise the lowest-index tie-break deterministically.
 */
const TIE_HEXAGON: Vec2[] = [
  { x: 0, y: 0 }, // A
  { x: 5, y: -1 }, // E1 — area 10, index 1 (wins the tie: lower index)
  { x: 10, y: 0 }, // B
  { x: 10, y: 10 }, // C
  { x: 5, y: 11 }, // E2 — area 10, index 4
  { x: 0, y: 10 }, // D
];

/**
 * A 58-vertex jagged spiral corridor, found by exhaustive search over the
 * prototype's naive (unguarded) VW implementation: reducing it to 20 verts
 * WITHOUT the self-intersection guard produces a self-crossing polygon (a
 * jagged near-collinear stretch on the outer arm collapses into a chord that
 * slices across the inner arm, which the wrap brings close by). Confirmed
 * simple at full resolution; confirms the guard is doing real work below,
 * not merely never encountering a candidate crossing.
 */
const SPIRAL_FIXTURE: Vec2[] = [
  { x: 22.677, y: 0 }, { x: 20.586, y: 8.527 }, { x: 22.205, y: 22.205 }, { x: 11.317, y: 27.322 },
  { x: 0, y: 40.791 }, { x: -15.455, y: 37.312 }, { x: -36.166, y: 36.166 }, { x: -44.665, y: 18.501 },
  { x: -61.542, y: 0 }, { x: -54.605, y: -22.618 }, { x: -50.192, y: -50.192 }, { x: -26.881, y: -64.897 },
  { x: 0, y: -79.698 }, { x: 29.855, y: -72.075 }, { x: 63.47, y: -63.47 }, { x: 81.87, y: -33.912 },
  { x: 98.144, y: 0 }, { x: 91.027, y: 37.705 }, { x: 75.785, y: 75.785 }, { x: 40.318, y: 97.336 },
  { x: 0, y: 117.962 }, { x: -44.462, y: 107.341 }, { x: -90.256, y: 90.256 }, { x: -115.939, y: 48.023 },
  { x: -134.71, y: 0 }, { x: -123.038, y: -50.964 }, { x: -102.977, y: -102.977 }, { x: -55.338, y: -133.599 },
  { x: 0, y: -155.266 }, { x: 0, y: -150.556 }, { x: -52.422, y: -126.558 }, { x: -99.387, y: -99.387 },
  { x: -120.265, y: -49.816 }, { x: -130.79, y: 0 }, { x: -110.287, y: 45.682 }, { x: -85.958, y: 85.958 },
  { x: -41.923, y: 101.211 }, { x: 0, y: 110.14 }, { x: 39.014, y: 94.188 }, { x: 70.979, y: 70.979 },
  { x: 83.113, y: 34.427 }, { x: 91.554, y: 0 }, { x: 75.351, y: -31.212 }, { x: 59.127, y: -59.127 },
  { x: 27.177, y: -65.612 }, { x: 0, y: -72.189 }, { x: -23.475, y: -56.673 }, { x: -44.98, y: -44.98 },
  { x: -49.666, y: -20.572 }, { x: -55.679, y: 0 }, { x: -41.936, y: 17.371 }, { x: -31.594, y: 31.594 },
  { x: -12.811, y: 30.928 }, { x: 0, y: 34.455 }, { x: 9.527, y: 22.999 }, { x: 19.833, y: 19.833 },
  { x: 13.17, y: 5.455 }, { x: 18.095, y: 0 },
];

/**
 * Naive (unguarded) count-driven VW — reference logic used ONLY to prove
 * SPIRAL_FIXTURE actually needs the guard; not exported, not the SUT.
 */
function naiveSimplifyForTest(poly: readonly Vec2[], targetCount: number): Vec2[] {
  const n = poly.length;
  const alive = new Uint8Array(n).fill(1);
  const prev = new Int32Array(n);
  const next = new Int32Array(n);
  const area = new Float64Array(n);
  const triArea2 = (a: Vec2, b: Vec2, c: Vec2) => Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
  for (let i = 0; i < n; i++) {
    prev[i] = (i - 1 + n) % n;
    next[i] = (i + 1) % n;
  }
  for (let i = 0; i < n; i++) area[i] = triArea2(poly[prev[i]], poly[i], poly[next[i]]);
  let count = n;
  while (count > targetCount) {
    let best = -1;
    let bestArea = Infinity;
    for (let i = 0; i < n; i++) {
      if (alive[i] && area[i] < bestArea) {
        bestArea = area[i];
        best = i;
      }
    }
    if (best < 0) break;
    alive[best] = 0;
    count--;
    const p = prev[best];
    const q = next[best];
    next[p] = q;
    prev[q] = p;
    area[p] = triArea2(poly[prev[p]], poly[p], poly[next[p]]);
    area[q] = triArea2(poly[prev[q]], poly[q], poly[next[q]]);
  }
  const out: Vec2[] = [];
  let start = 0;
  while (!alive[start]) start++;
  let i = start;
  do {
    out.push(poly[i]);
    i = next[i];
  } while (i !== start);
  return out;
}

describe('polygonIsSimple', () => {
  it('true for a simple polygon, false for a self-crossing one', () => {
    expect(polygonIsSimple(circlePolygon(10, true))).toBe(true);
    const bowtie: Vec2[] = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
    ];
    expect(polygonIsSimple(bowtie)).toBe(false);
  });
});

describe('simplifyLoop — count-driven reduction', () => {
  it.each([30, 20, 10, 6])('reduces a 40-vert convex polygon to exactly %i verts', (target) => {
    const circle = circlePolygon(40, true);
    const out = simplifyLoop(circle, target);
    expect(out).toHaveLength(target);
    expect(polygonIsSimple(out)).toBe(true);
  });

  it('a polygon already at or under the target is returned unchanged', () => {
    const out = simplifyLoop(TIE_HEXAGON, 10);
    expect(out).toEqual(TIE_HEXAGON);
    expect(out).not.toBe(TIE_HEXAGON); // new array — pure function contract
  });

  it('a polygon exactly at the target is returned unchanged', () => {
    const out = simplifyLoop(TIE_HEXAGON, TIE_HEXAGON.length);
    expect(out).toEqual(TIE_HEXAGON);
  });
});

describe('simplifyLoop — determinism and tie-break', () => {
  it('same input, repeated runs, identical output', () => {
    const circle = circlePolygon(50, true);
    const a = simplifyLoop(circle, 15);
    const b = simplifyLoop(circle, 15);
    expect(b).toEqual(a);
  });

  it('an exact effective-area tie breaks to the LOWER index, deterministically', () => {
    // E1 (index 1) and E2 (index 4) both have effective area 10 — strictly
    // less than every corner's — so this forces the tie-break to decide.
    const out = simplifyLoop(TIE_HEXAGON, 5);
    expect(out).toHaveLength(5);
    // E1 gone, E2 survives: the tie resolved to the lower index every time.
    expect(out).not.toContainEqual({ x: 5, y: -1 });
    expect(out).toContainEqual({ x: 5, y: 11 });
    // Repeat runs agree — not an artifact of iteration order.
    expect(simplifyLoop(TIE_HEXAGON, 5)).toEqual(out);
    expect(simplifyLoop(TIE_HEXAGON, 5)).toEqual(out);
  });
});

describe('simplifyLoop — self-intersection guard', () => {
  it('SPIRAL_FIXTURE is simple, and naive (unguarded) reduction to 20 verts breaks it', () => {
    expect(polygonIsSimple(SPIRAL_FIXTURE)).toBe(true);
    expect(polygonIsSimple(naiveSimplifyForTest(SPIRAL_FIXTURE, 20))).toBe(false);
  });

  it('simplifyLoop keeps the result simple where the naive reduction would not', () => {
    const out = simplifyLoop(SPIRAL_FIXTURE, 20);
    expect(polygonIsSimple(out)).toBe(true);
    expect(out.length).toBeGreaterThanOrEqual(3);
    expect(out.length).toBeLessThanOrEqual(SPIRAL_FIXTURE.length);
  });
});

describe('simplifyLoop — winding, floor, and purity', () => {
  it('preserves CCW winding', () => {
    const ccw = circlePolygon(30, true);
    expect(shoelaceArea(ccw)).toBeGreaterThan(0);
    expect(shoelaceArea(simplifyLoop(ccw, 12))).toBeGreaterThan(0);
  });

  it('preserves CW winding (never force-normalizes)', () => {
    const cw = circlePolygon(30, false);
    expect(shoelaceArea(cw)).toBeLessThan(0);
    expect(shoelaceArea(simplifyLoop(cw, 12))).toBeLessThan(0);
  });

  it('never reduces below 3 verts, even when asked for fewer', () => {
    const circle = circlePolygon(40, true);
    expect(simplifyLoop(circle, 0)).toHaveLength(3);
    expect(simplifyLoop(circle, 1)).toHaveLength(3);
    expect(simplifyLoop(circle, 2)).toHaveLength(3);
    expect(polygonIsSimple(simplifyLoop(circle, 2))).toBe(true);
  });

  it('never mutates the input array or its verts', () => {
    const circle = circlePolygon(24, true);
    const snapshot = circle.map((p) => ({ x: p.x, y: p.y }));
    simplifyLoop(circle, 8);
    expect(circle).toEqual(snapshot);
    expect(circle).toHaveLength(24);
  });
});
