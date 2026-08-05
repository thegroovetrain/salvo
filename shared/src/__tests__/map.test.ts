// Invariant suite for the fractal island generator (cycle 51): determinism,
// coverage band, star-shapedness about the skeleton, polygon simplicity,
// channel-vs-beam pinning, navigability, spawn-ring clearance, and
// inner/outer bounds — across 100 seeds spanning roster sizes 2/5/10/20.
import { describe, it, expect } from 'vitest';
import {
  generateMap,
  landCoverage,
  validateMap,
  polygonArea,
  polygonIsSimple,
  fractalOffsets,
  MAP_RULES,
  type GameMap,
} from '../sim/map.js';
import { mapRadius, CONFIG } from '../constants.js';
import { mulberry32 } from '../math/rng.js';
import { pointInPolygon } from '../sim/silhouette.js';
import type { Vec2 } from '../math/vec.js';
import type { Island } from '../types.js';

// --- The 100-seed sweep: 25 distinct seeds per roster size ------------------

const ROSTERS = [2, 5, 10, 20] as const;
const SEEDS_PER = 25;
const sweep: { seed: number; cap: number; map: GameMap }[] = [];
ROSTERS.forEach((cap, k) => {
  for (let i = 0; i < SEEDS_PER; i++) {
    const seed = k * SEEDS_PER + i;
    sweep.push({ seed, cap, map: generateMap(seed, cap) });
  }
});

function nearestOnSkeleton(p: Vec2, skel: readonly Vec2[]): Vec2 {
  if (skel.length === 1) return skel[0];
  let best: Vec2 = skel[0];
  let bd = Infinity;
  for (let i = 0; i + 1 < skel.length; i++) {
    const a = skel[i];
    const b = skel[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const q = { x: a.x + dx * t, y: a.y + dy * t };
    const d = Math.hypot(p.x - q.x, p.y - q.y);
    if (d < bd) {
      bd = d;
      best = q;
    }
  }
  return best;
}

// --- Ratified constants ------------------------------------------------------

describe('MAP_RULES pinning (channels, spawns, concavity)', () => {
  it('CHANNEL_MIN is 48u and STRICTLY wider than every hull beam (classes + drones)', () => {
    expect(MAP_RULES.CHANNEL_MIN).toBe(48);
    const beams = [
      ...Object.values(CONFIG.shipClasses).map((c) => c.hull.beam),
      ...Object.values(CONFIG.drones).map((d) => d.hull.beam),
    ];
    for (const beam of beams) expect(beam).toBeLessThan(MAP_RULES.CHANNEL_MIN);
    expect(MAP_RULES.WIDEST_BEAM).toBe(Math.max(...beams));
  });

  it('nav erosion fits a CHANNEL_MIN channel: NAV_CLEAR <= CHANNEL_MIN / 2', () => {
    expect(MAP_RULES.NAV_CLEAR).toBe(MAP_RULES.WIDEST_BEAM / 2 + MAP_RULES.NAV_MARGIN);
    expect(MAP_RULES.NAV_CLEAR).toBeLessThanOrEqual(MAP_RULES.CHANNEL_MIN / 2);
  });

  it('SPAWN_MARGIN is 64u — at least the widest hull bounding radius (62.29)', () => {
    expect(MAP_RULES.SPAWN_MARGIN).toBe(64);
    expect(MAP_RULES.SPAWN_MARGIN).toBeGreaterThanOrEqual(62.29);
  });

  it('MAX_CONCAVITY is exactly the fractal offset clamp ratio', () => {
    expect(MAP_RULES.MAX_CONCAVITY).toBeCloseTo(MAP_RULES.M_MAX / MAP_RULES.M_MIN, 12);
    expect(MAP_RULES.M_MIN).toBe(0.45);
    expect(MAP_RULES.M_MAX).toBe(1.6);
  });

  it('coverage band is the ratified [3%, 5%]', () => {
    expect(MAP_RULES.COVER_MIN).toBe(0.03);
    expect(MAP_RULES.COVER_MAX).toBe(0.05);
  });
});

describe('mapRadius', () => {
  it('scales as base * sqrt(cap / capRef)', () => {
    expect(mapRadius(CONFIG.map.capRef)).toBeCloseTo(CONFIG.map.baseRadius);
    expect(mapRadius(5)).toBeCloseTo(2400 * Math.sqrt(5 / 20));
  });
});

describe('fractalOffsets (periodic midpoint displacement)', () => {
  it('produces exactly N clamped values for both sample budgets', () => {
    for (const n of [32, 48]) {
      const m = fractalOffsets(mulberry32(7), n);
      expect(m).toHaveLength(n);
      for (const v of m) {
        expect(v).toBeGreaterThanOrEqual(MAP_RULES.M_MIN);
        expect(v).toBeLessThanOrEqual(MAP_RULES.M_MAX);
      }
    }
  });

  it('is deterministic per stream', () => {
    expect(fractalOffsets(mulberry32(99), 48)).toEqual(fractalOffsets(mulberry32(99), 48));
  });
});

// --- Determinism -------------------------------------------------------------

describe('generateMap determinism (R8: absolute)', () => {
  it('identical (seed, playerCap) is deep-equal, vertex for vertex', () => {
    for (const { seed, cap, map } of sweep.filter((_, i) => i % 9 === 0)) {
      expect(generateMap(seed, cap)).toEqual(map);
    }
  });

  it('different seeds produce different maps', () => {
    expect(generateMap(1, 20).islands).not.toEqual(generateMap(2, 20).islands);
  });

  it('sets radius and spawn ring from CONFIG', () => {
    const m = generateMap(5, 6);
    expect(m.radius).toBeCloseTo(mapRadius(6));
    expect(m.spawnRing).toBeCloseTo(mapRadius(6) * CONFIG.map.spawnFraction);
  });
});

// --- Island structural invariants -------------------------------------------

function assertIslandStructure(isle: Island): void {
  // x/y/r IS the bounding circle: r = max distance from centre to any vert.
  let maxD = 0;
  for (const p of isle.poly) {
    maxD = Math.max(maxD, Math.hypot(p.x - isle.x, p.y - isle.y));
  }
  expect(isle.r).toBeCloseTo(maxD, 6);
  // CCW closed boundary at one of the two sample budgets.
  expect([32, 48]).toContain(isle.poly.length);
  expect(polygonArea(isle.poly)).toBeGreaterThan(0);
  // Skeleton: 1-3 points, all strictly inside the polygon; core inside bounds.
  expect(isle.skeleton.length).toBeGreaterThanOrEqual(1);
  expect(isle.skeleton.length).toBeLessThanOrEqual(3);
  for (const s of isle.skeleton) expect(pointInPolygon(s, isle.poly)).toBe(true);
  expect(isle.core).toBeGreaterThanOrEqual(0);
  expect(isle.core).toBeLessThanOrEqual(isle.r);
}

describe('island geometry invariants (all 100 sweep maps)', () => {
  it('bounding circle, CCW polygon, skeleton, and core are all coherent', () => {
    for (const { map } of sweep) {
      for (const isle of map.islands) assertIslandStructure(isle);
    }
  });

  it('every polygon is simple (no self-intersection)', () => {
    for (const { map } of sweep) {
      for (const isle of map.islands) expect(polygonIsSimple(isle.poly)).toBe(true);
    }
  });

  it('every polygon is star-shaped about its skeleton (the push-out guarantee)', () => {
    for (const { map } of sweep) {
      for (const isle of map.islands) {
        for (const v of isle.poly) {
          const s = nearestOnSkeleton(v, isle.skeleton);
          // Subset of the generator's own accept-predicate fractions (k/9).
          for (const t of [2 / 9, 4 / 9, 6 / 9, 8 / 9]) {
            const p = { x: s.x + (v.x - s.x) * t, y: s.y + (v.y - s.y) * t };
            expect(pointInPolygon(p, isle.poly)).toBe(true);
          }
        }
      }
    }
  });

  it('concavity is bounded by MAX_CONCAVITY (vertex offset ratio about the skeleton)', () => {
    for (const { map } of sweep) {
      for (const isle of map.islands) {
        let min = Infinity;
        let max = 0;
        for (const v of isle.poly) {
          const s = nearestOnSkeleton(v, isle.skeleton);
          const d = Math.hypot(v.x - s.x, v.y - s.y);
          min = Math.min(min, d);
          max = Math.max(max, d);
        }
        expect(max / min).toBeLessThanOrEqual(MAP_RULES.MAX_CONCAVITY * 1.05);
      }
    }
  });
});

// --- Placement invariants ----------------------------------------------------

function assertPlacement(map: GameMap): void {
  const { radius, spawnRing, islands } = map;
  for (let i = 0; i < islands.length; i++) {
    const c = islands[i];
    const d = Math.hypot(c.x, c.y);
    // inner/outer fraction bounds (bounding circle => polygon too)
    expect(d + c.r).toBeLessThanOrEqual(radius * MAP_RULES.OUTER_FRACTION + 1e-6);
    expect(d - c.r).toBeGreaterThanOrEqual(radius * MAP_RULES.INNER_FRACTION - 1e-6);
    // spawn-ring clearance >= SPAWN_MARGIN from every polygon
    expect(Math.abs(d - spawnRing)).toBeGreaterThanOrEqual(c.r + MAP_RULES.SPAWN_MARGIN - 1e-6);
    // every inter-landmass bounding gap >= CHANNEL_MIN
    for (let j = i + 1; j < islands.length; j++) {
      const o = islands[j];
      const gap = Math.hypot(c.x - o.x, c.y - o.y) - c.r - o.r;
      expect(gap).toBeGreaterThanOrEqual(MAP_RULES.CHANNEL_MIN - 1e-6);
    }
  }
}

describe('placement invariants (all 100 sweep maps)', () => {
  it('inner/outer bounds, spawn-ring clearance >= 64u, channels >= CHANNEL_MIN', () => {
    for (const { map } of sweep) assertPlacement(map);
  });
});

// --- Coverage band -----------------------------------------------------------

describe('land coverage (shoelace area over the map disc)', () => {
  it('every sweep map sits in [COVER_MIN, COVER_MAX] at every roster size', () => {
    for (const { map } of sweep) {
      const cover = landCoverage(map);
      expect(cover).toBeGreaterThanOrEqual(MAP_RULES.COVER_MIN);
      expect(cover).toBeLessThanOrEqual(MAP_RULES.COVER_MAX);
    }
  });

  it('100 fresh seeds at playerCap 20 all land in the band (acceptance)', () => {
    for (let seed = 200; seed < 300; seed++) {
      const cover = landCoverage(generateMap(seed, 20));
      expect(cover).toBeGreaterThanOrEqual(MAP_RULES.COVER_MIN);
      expect(cover).toBeLessThanOrEqual(MAP_RULES.COVER_MAX);
    }
  });
});

// --- Navigability ------------------------------------------------------------

describe('navigability (no lagoons, no unreachable pockets, no tight channels)', () => {
  it('every sweep map validates (flood fill from the spawn ring reaches all water)', () => {
    for (const { map } of sweep) expect(validateMap(map)).toBe(true);
  });
});

// --- Variety + degenerate boards ----------------------------------------------

describe('archetype and scale variety (R4/R5)', () => {
  it('the sweep realizes blobs, ridges, small rocks, and large masses', () => {
    let ridges = 0;
    let blobs = 0;
    let small = 0;
    let large = 0;
    for (const { map } of sweep) {
      for (const isle of map.islands) {
        if (isle.skeleton.length >= 2) ridges++;
        else blobs++;
        if (isle.r <= 45) small++;
        if (isle.r >= 150) large++;
      }
    }
    expect(ridges).toBeGreaterThan(0);
    expect(blobs).toBeGreaterThan(0);
    expect(small).toBeGreaterThan(0);
    expect(large).toBeGreaterThan(0);
  });

  it('close-set landmass groups exist (archipelago channels)', () => {
    // Some pair somewhere sits within the archipelago gap band
    // [CHANNEL_MIN, CHANNEL_MIN * 3] — threadable channels are real.
    let close = 0;
    for (const { map } of sweep) {
      const isl = map.islands;
      for (let i = 0; i < isl.length; i++) {
        for (let j = i + 1; j < isl.length; j++) {
          const gap = Math.hypot(isl[i].x - isl[j].x, isl[i].y - isl[j].y) - isl[i].r - isl[j].r;
          if (gap <= MAP_RULES.CHANNEL_MIN * 3) close++;
        }
      }
    }
    expect(close).toBeGreaterThan(0);
  });
});

describe('degenerate tiny board', () => {
  it('playerCap 1 still yields >= 1 landmass with every invariant intact', () => {
    for (const seed of [0, 7]) {
      const map = generateMap(seed, 1);
      expect(map.islands.length).toBeGreaterThanOrEqual(1);
      expect(validateMap(map)).toBe(true);
      assertPlacement(map);
      for (const isle of map.islands) assertIslandStructure(isle);
    }
  });
});
