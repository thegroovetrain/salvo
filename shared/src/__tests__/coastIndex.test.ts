// The coastline index (sim/coastIndex.ts) and the island-only predicates built
// on it in sim/collision.ts are EXACT re-statements of the brute-force ones —
// every resolved pose must stay byte-identical (the server and the client
// predictor both run them). These pins compare indexed vs brute with `===` on
// real generated coastlines, at points and hull poses concentrated on the
// coast, where a pruning bug would show.
import { describe, it, expect } from 'vitest';
import { CONFIG, HULL_IDS } from '../constants.js';
import { generateMap } from '../sim/map.js';
import { coastContains, coastDistance, coastSegNear } from '../sim/coastIndex.js';
import { indexedIslandDistance, islandOverlaps, polygonOverlapsSolid } from '../sim/collision.js';
import { islandDistance } from '../sim/island.js';
import { closestPointOnPolygon, hullSilhouette, pointInPolygon, transformPolygon } from '../sim/silhouette.js';
import { segSegClosest } from '../math/geom.js';
import { mulberry32 } from '../math/rng.js';
import type { Island } from '../types.js';
import type { Vec2 } from '../math/vec.js';

const SEEDS = [1, 0x9876, 555555];
const maps = SEEDS.map((s) => generateMap(s, CONFIG.match.fillTo));

/** Probe points on and around one coastline: every vertex, every edge
 *  midpoint, points sharing a vertex's y (the parity edge case), and jitter
 *  up to `spread` u off random vertices. */
function coastPoints(isle: Island, rng: ReturnType<typeof mulberry32>, spread: number): Vec2[] {
  const pts: Vec2[] = [];
  const n = isle.poly.length;
  for (let k = 0; k < n; k++) {
    const a = isle.poly[k];
    const b = isle.poly[(k + 1) % n];
    pts.push({ x: a.x, y: a.y }, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, { x: a.x + 3, y: a.y }, { x: a.x - 3, y: a.y });
  }
  for (let i = 0; i < 2 * n; i++) {
    const v = isle.poly[rng.int(0, n - 1)];
    pts.push({ x: v.x + (rng.next() * 2 - 1) * spread, y: v.y + (rng.next() * 2 - 1) * spread });
  }
  pts.push({ x: isle.x, y: isle.y }, { x: isle.x + isle.r + 50, y: isle.y }, { x: isle.x - isle.r - 400, y: isle.y + 7 });
  return pts;
}

/** segPolygonHit's edge clause alone (the start-inside rule is coastContains). */
function bruteSegNear(a0: Vec2, a1: Vec2, poly: readonly Vec2[], radius: number): boolean {
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    if (segSegClosest(a0, a1, poly[j], poly[i]).dist <= radius) return true;
  }
  return false;
}

describe('coastline index — exact against the brute predicates', () => {
  it('coastContains === pointInPolygon and coastDistance === closestPointOnPolygon.dist', () => {
    const rng = mulberry32(0xc0a57);
    let inside = 0;
    let checked = 0;
    for (const map of maps) {
      for (const isle of map.islands) {
        for (const p of coastPoints(isle, rng, 40)) {
          const pin = pointInPolygon(p, isle.poly);
          expect(coastContains(p, isle.poly)).toBe(pin);
          expect(coastDistance(p, isle.poly)).toBe(closestPointOnPolygon(p, isle.poly).dist);
          expect(indexedIslandDistance(p, isle)).toBe(islandDistance(p, isle));
          if (pin) inside += 1;
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(10000);
    expect(inside).toBeGreaterThan(checked / 20); // both answers genuinely exercised
  });

  it('coastSegNear === the brute edge clause, at the overlap threshold and a wider one', () => {
    const rng = mulberry32(0x5e9);
    let near = 0;
    for (const isle of maps[1].islands) {
      const pts = coastPoints(isle, rng, 30);
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i];
        const b = { x: pts[i].x + (rng.next() * 2 - 1) * 40, y: pts[i].y + (rng.next() * 2 - 1) * 40 };
        for (const radius of [2e-9, 1e-4]) {
          const brute = bruteSegNear(a, b, isle.poly, radius);
          expect(coastSegNear(a, b, isle.poly, radius)).toBe(brute);
          if (brute) near += 1;
        }
      }
    }
    expect(near).toBeGreaterThan(100);
  });

  it('islandOverlaps === polygonOverlapsSolid for every hull, posed across the coast, at offsets', () => {
    const rng = mulberry32(0x0f15);
    let hits = 0;
    let total = 0;
    const world: Vec2[] = [];
    for (const map of maps) {
      for (const isle of map.islands) {
        for (let i = 0; i < 40; i++) {
          const v = isle.poly[rng.int(0, isle.poly.length - 1)];
          const hull = hullSilhouette(HULL_IDS[rng.int(0, HULL_IDS.length - 1)]);
          const x = v.x + (rng.next() * 2 - 1) * 70;
          const y = v.y + (rng.next() * 2 - 1) * 70;
          transformPolygon(hull, x, y, rng.next() * Math.PI * 2, world);
          for (const [ox, oy] of [[0, 0], [(rng.next() * 2 - 1) * 20, (rng.next() * 2 - 1) * 20]]) {
            const brute = polygonOverlapsSolid(world, ox, oy, isle);
            expect(islandOverlaps(world, ox, oy, isle)).toBe(brute);
            if (brute) hits += 1;
            total += 1;
          }
        }
      }
    }
    expect(hits).toBeGreaterThan(total / 10);
    expect(total - hits).toBeGreaterThan(total / 10);
  });
});
