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
});
