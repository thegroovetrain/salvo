// The island broadphase index and the box rejects (Story 11.2 follow-up).
//
// THE CONTRACT of every function under test here is EQUALITY WITH ITS
// REFERENCE: the index, the chunked coastline test and the box rejects only
// skip work whose answer is already decided, so each must answer exactly what
// the plain scan answers — line of sight is the anti-cheat chokepoint. The
// oracles below are the references themselves (`islandBlocksSegment`,
// `islandSegHit`) or an independent re-statement of the rule (the edge scan
// of `segPolygonHit`, the point distance of `dropTouches`), asked over
// generated maps with seeded segments that include the shapes a grid walk and
// a box test get wrong: rays along cell walls, through cell corners, from on
// and inside the land, of zero length, and from outside the grid.

import { describe, it, expect } from 'vitest';
import { CONFIG } from '../constants.js';
import { segCircleHit, segSegClosest } from '../math/geom.js';
import { mulberry32, type Rng } from '../math/rng.js';
import type { Vec2 } from '../math/vec.js';
import type { Island } from '../types.js';
import { dropTouches } from '../sim/drops.js';
import { islandBlocksSegment } from '../sim/island.js';
import { IslandIndex, earliestHitReference, islandIndexFor, newLosHints, sharedIslandIndex } from '../sim/islandIndex.js';
import { generateMap } from '../sim/map.js';
import {
  buildPolyChunks,
  hullSilhouette,
  pointInPolygon,
  pointPolygonDistance,
  segPolygonBlocked,
  segPolygonHit,
  transformPolygon,
} from '../sim/silhouette.js';
import { SHIP_CLASS_IDS } from '../constants.js';

const SEEDS = [7, 21, 1337];
const GRID_CELL_U = 250; // the index's cell: rays are laid ON its walls on purpose

function referenceClear(a: Vec2, b: Vec2, islands: readonly Island[]): boolean {
  return islands.every((isle) => !islandBlocksSegment(a, b, isle));
}

/** The rule of `segPolygonHit`, restated without any reject: a0 inside is 0;
 *  else the smallest `s` over the edges within `radius + 1e-9`; else null. */
function hitOracle(a0: Vec2, a1: Vec2, poly: readonly Vec2[], radius: number): number | null {
  if (pointInPolygon(a0, poly)) return 0;
  let best: number | null = null;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const c = segSegClosest(a0, a1, poly[j], poly[i]);
    if (c.dist <= radius + 1e-9 && (best === null || c.s < best)) best = c.s;
  }
  return best;
}

function onDisc(rng: Rng, radius: number): Vec2 {
  for (;;) {
    const x = (rng.next() * 2 - 1) * radius;
    const y = (rng.next() * 2 - 1) * radius;
    if (x * x + y * y <= radius * radius) return { x, y };
  }
}

function pick<T>(rng: Rng, xs: readonly T[]): T {
  return xs[Math.min(xs.length - 1, Math.floor(rng.next() * xs.length))];
}

/** One seeded segment of the family `kind % 8` over this map. */
function segment(rng: Rng, kind: number, islands: readonly Island[], radius: number): [Vec2, Vec2] {
  const a = onDisc(rng, radius);
  const isle = pick(rng, islands);
  switch (kind % 8) {
    case 0: // a long eye ray
      return [a, onDisc(rng, radius)];
    case 1: { // a short shell step
      const ang = rng.next() * 6.283185307179586;
      const len = 5 + rng.next() * 60;
      return [a, { x: a.x + Math.cos(ang) * len, y: a.y + Math.sin(ang) * len }];
    }
    case 2: { // along a cell wall, both axes
      const wall = Math.round(a.x / GRID_CELL_U) * GRID_CELL_U;
      const b = onDisc(rng, radius);
      return rng.next() < 0.5 ? [{ x: wall, y: a.y }, { x: wall, y: b.y }] : [{ x: a.y, y: wall }, { x: b.y, y: wall }];
    }
    case 3: { // through a cell corner, on the diagonal
      const cx = Math.round(a.x / GRID_CELL_U) * GRID_CELL_U;
      const cy = Math.round(a.y / GRID_CELL_U) * GRID_CELL_U;
      const k = 100 + rng.next() * 900;
      const s = rng.next() < 0.5 ? 1 : -1;
      return [{ x: cx - k, y: cy - s * k }, { x: cx + k, y: cy + s * k }];
    }
    case 4: // from the deepest point of an island (the origin is on the land)
      return [{ x: isle.pole.x, y: isle.pole.y }, onDisc(rng, radius)];
    case 5: { // from a coastline vertex outward, and grazing it
      const v = pick(rng, isle.poly);
      return [{ x: v.x, y: v.y }, onDisc(rng, radius)];
    }
    case 6: // a point
      return [a, { x: a.x, y: a.y }];
    default: { // an end far outside the ocean (off the grid)
      const far = onDisc(rng, radius);
      return [a, { x: far.x * 9, y: far.y * 9 }];
    }
  }
}

describe('IslandIndex — the same answers as the reference scan', () => {
  it('losClear equals "no island blocks the segment" on generated maps, with and without the caller\'s hints, and each family is decided both ways somewhere', () => {
    let blocked = 0;
    let clear = 0;
    for (const seed of SEEDS) {
      const map = generateMap(seed, CONFIG.map.playerCap);
      const index = new IslandIndex(map.islands);
      const hints = newLosHints();
      const rng = mulberry32(seed ^ 0x51ab);
      for (let n = 0; n < 6000; n++) {
        const [a, b] = segment(rng, n, map.islands, map.radius);
        const want = referenceClear(a, b, map.islands);
        expect(index.losClear(a, b), `seed ${seed} #${n} (kind ${n % 8})`).toBe(want);
        expect(index.losClear(a, b, hints), `seed ${seed} #${n} (kind ${n % 8}, hinted)`).toBe(want);
        if (want) clear += 1;
        else blocked += 1;
      }
    }
    expect(blocked).toBeGreaterThan(0);
    expect(clear).toBeGreaterThan(0);
  });

  it('many rays from ONE origin (the per-origin memory) and a non-finite end answer as the reference', () => {
    const map = generateMap(SEEDS[0], CONFIG.map.playerCap);
    const index = new IslandIndex(map.islands);
    const rng = mulberry32(99);
    for (const origin of [map.islands[0].pole, map.islands[5].poly[0], onDisc(rng, map.radius)]) {
      const hints = newLosHints();
      for (let n = 0; n < 400; n++) {
        const b = onDisc(rng, map.radius);
        expect(index.losClear(origin, b, hints)).toBe(referenceClear(origin, b, map.islands));
      }
    }
    const a = onDisc(rng, map.radius);
    for (const bad of [{ x: NaN, y: 0 }, { x: 0, y: Infinity }]) {
      expect(index.losClear(a, bad)).toBe(referenceClear(a, bad, map.islands));
      expect(index.losClear(bad, a)).toBe(referenceClear(bad, a, map.islands));
    }
  });

  it('earliestHit is the reference scan\'s hit — the same fraction and the same island', () => {
    let hits = 0;
    for (const seed of SEEDS) {
      const map = generateMap(seed, CONFIG.map.playerCap);
      const index = new IslandIndex(map.islands);
      const rng = mulberry32(seed ^ 0x77);
      for (let n = 0; n < 6000; n++) {
        const [a, b] = segment(rng, n, map.islands, map.radius);
        const want = earliestHitReference(a, b, map.islands);
        const got = index.earliestHit(a, b);
        expect(got === null, `seed ${seed} #${n}`).toBe(want === null);
        if (want === null || got === null) continue;
        hits += 1;
        expect(got.t).toBe(want.t);
        expect(got.island).toBe(want.island);
      }
    }
    expect(hits).toBeGreaterThan(0);
  });

  it('asks the coastline only of islands whose bounding circle the segment meets, each at most once', () => {
    const map = generateMap(SEEDS[1], CONFIG.map.playerCap);
    const index = new IslandIndex(map.islands);
    const rng = mulberry32(5);
    for (let n = 0; n < 2000; n++) {
      const [a, b] = segment(rng, n, map.islands, map.radius);
      const before = index.narrowTests;
      index.losClear(a, b);
      const met = map.islands.filter((isle) => segCircleHit(a, b, isle, isle.r) !== null).length;
      expect(index.narrowTests - before).toBeLessThanOrEqual(met);
    }
  });

  it('an empty list is clear and hits nothing', () => {
    const index = new IslandIndex([]);
    expect(index.losClear({ x: 0, y: 0 }, { x: 100, y: 0 }, newLosHints())).toBe(true);
    expect(index.earliestHit({ x: 0, y: 0 }, { x: 100, y: 0 })).toBeNull();
  });

  it('a list rewritten in place is no longer current: islandIndexFor and sharedIslandIndex hand out a fresh index that answers for the new list', () => {
    const islands = [...generateMap(SEEDS[0], CONFIG.map.playerCap).islands];
    const first = islandIndexFor(undefined, islands);
    expect(islandIndexFor(first, islands)).toBe(first);
    expect(sharedIslandIndex(islands)).toBe(sharedIslandIndex(islands));
    const a = { x: islands[0].pole.x - islands[0].r - 50, y: islands[0].pole.y };
    const b = { x: islands[0].pole.x, y: islands[0].pole.y };
    expect(first.losClear(a, b)).toBe(false);
    const sharedBefore = sharedIslandIndex(islands);
    const kept = islands.splice(0, islands.length); // the tests' idiom: empty the map in place...
    expect(first.isCurrent(islands)).toBe(false);
    expect(islandIndexFor(first, islands).losClear(a, b)).toBe(true);
    expect(sharedIslandIndex(islands)).not.toBe(sharedBefore);
    islands.push(kept[3]); // ...then seat other land: same array, different islands
    const second = islandIndexFor(first, islands);
    expect(second).not.toBe(first);
    const p = { x: kept[3].pole.x - kept[3].r - 50, y: kept[3].pole.y };
    expect(second.losClear(p, kept[3].pole)).toBe(false);
    islands[0] = kept[0]; // the same length, another island
    expect(second.isCurrent(islands)).toBe(false);
    expect(sharedIslandIndex(islands).losClear(a, b)).toBe(false);
  });
});

describe('segPolygonBlocked — the line-of-sight form of segPolygonHit at radius 0', () => {
  it('equals `segPolygonHit(a, b, poly, 0) !== null` on generated coastlines', () => {
    let blocked = 0;
    for (const seed of SEEDS) {
      const map = generateMap(seed, CONFIG.map.playerCap);
      const rng = mulberry32(seed ^ 0xbeef);
      for (const isle of map.islands) {
        const chunks = buildPolyChunks(isle.poly);
        for (let n = 0; n < 60; n++) {
          // ends about THIS island, so the coastline is actually in play
          const a = { x: isle.x + (rng.next() * 2 - 1) * isle.r * 1.3, y: isle.y + (rng.next() * 2 - 1) * isle.r * 1.3 };
          const v = pick(rng, isle.poly);
          const b = n % 3 === 0 ? { x: v.x, y: v.y } : { x: isle.x + (rng.next() * 2 - 1) * isle.r * 1.3, y: isle.y + (rng.next() * 2 - 1) * isle.r * 1.3 };
          const want = hitOracle(a, b, isle.poly, 0) !== null;
          expect(segPolygonBlocked(a, b, isle.poly, chunks)).toBe(want);
          if (want) blocked += 1;
        }
      }
    }
    expect(blocked).toBeGreaterThan(0);
  });
});

describe('the box rejects change no answer', () => {
  const rng = mulberry32(4242);
  const out: Vec2[] = [];

  function posedHull(): readonly Vec2[] {
    const hull = pick(rng, SHIP_CLASS_IDS);
    transformPolygon(hullSilhouette(hull), (rng.next() * 2 - 1) * 400, (rng.next() * 2 - 1) * 400, rng.next() * 6.283185307179586, out);
    return out.map((v) => ({ x: v.x, y: v.y }));
  }

  it('segPolygonHit is the edge scan\'s answer for steps near and far from a hull, at every radius (a negative and a NaN one included)', () => {
    let hits = 0;
    for (let n = 0; n < 4000; n++) {
      const poly = posedHull();
      const c = poly[0];
      const spread = n % 2 === 0 ? 80 : 900; // half the steps start near the hull
      const a = { x: c.x + (rng.next() * 2 - 1) * spread, y: c.y + (rng.next() * 2 - 1) * spread };
      const b = { x: a.x + (rng.next() * 2 - 1) * 70, y: a.y + (rng.next() * 2 - 1) * 70 };
      const radius = pick(rng, [0, 2, 9, 40, -5, NaN]);
      const want = hitOracle(a, b, poly, radius);
      expect(segPolygonHit(a, b, poly, radius)).toBe(want);
      if (want !== null) hits += 1;
    }
    expect(hits).toBeGreaterThan(0);
    expect(segPolygonHit({ x: 0, y: 0 }, { x: 1, y: 1 }, [], 5)).toBeNull();
  });

  it('dropTouches is "the hull is within the radius of the centre" (0 inside), near and far', () => {
    let touching = 0;
    for (let n = 0; n < 4000; n++) {
      const poly = posedHull();
      const c = poly[0];
      const spread = n % 2 === 0 ? 60 : 900;
      const p = { x: c.x + (rng.next() * 2 - 1) * spread, y: c.y + (rng.next() * 2 - 1) * spread };
      const r = pick(rng, [0, 12, 40, -3]);
      const want = pointPolygonDistance(p, poly) <= r;
      expect(dropTouches(p, poly, r)).toBe(want);
      if (want) touching += 1;
    }
    expect(touching).toBeGreaterThan(0);
  });
});
