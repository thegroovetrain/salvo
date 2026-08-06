// Invariant suite for the fractal island generator (cycle 51): determinism,
// coverage band, star-shapedness about the skeleton, polygon simplicity,
// channel-vs-beam pinning, navigability, spawn-ring clearance, and
// inner/outer bounds — across 100 seeds spanning roster sizes 2/5/10/20.
import { describe, it, expect } from 'vitest';
import {
  generateMap,
  generateMapBounded,
  MapGenerationError,
  islandFromPolygon,
  landCoverage,
  validateMap,
  polygonArea,
  polygonIsSimple,
  fractalOffsets,
  MAP_RULES,
  type GameMap,
} from '../sim/map.js';
import { mapRadius, CONFIG, HULL_IDS } from '../constants.js';
import { mulberry32 } from '../math/rng.js';
import { skeletonNormal } from '../sim/island.js';
import {
  closestPointOnPolygon,
  hullSilhouette,
  pointInPolygon,
  polygonMaxRadius,
} from '../sim/silhouette.js';
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

/**
 * True iff the segment from `b`'s nearest skeleton point out to `b` stays on
 * land — sampled at a subset of the generator's own accept fractions (k/9).
 */
function starClear(b: Vec2, skel: readonly Vec2[], poly: readonly Vec2[]): boolean {
  const s = nearestOnSkeleton(b, skel);
  for (const t of [2 / 9, 4 / 9, 6 / 9, 8 / 9]) {
    if (!pointInPolygon({ x: s.x + (b.x - s.x) * t, y: s.y + (b.y - s.y) * t }, poly)) return false;
  }
  return true;
}

/**
 * INDEPENDENT oracle: sorted forward hit parameters (t > 0) of the ray from
 * `p` along unit (dx, dy) against the polygon. Does not reuse any generator
 * or collision internals. `p` inside => an odd number of hits; exactly one
 * means the ray leaves the land and never comes back.
 */
function rayHits(p: Vec2, dx: number, dy: number, poly: readonly Vec2[]): number[] {
  const ts: number[] = [];
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const ax = poly[j].x;
    const ay = poly[j].y;
    const ex = poly[i].x - ax;
    const ey = poly[i].y - ay;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-15) continue;
    const qx = ax - p.x;
    const qy = ay - p.y;
    const t = (qx * ey - qy * ex) / den; // along the ray
    const u = (qx * dy - qy * dx) / den; // along the edge
    if (t > 1e-9 && u >= -1e-12 && u <= 1 + 1e-12) ts.push(t);
  }
  ts.sort((a, b) => a - b);
  return ts.filter((t, i) => i === 0 || t - ts[i - 1] > 1e-7); // vertex hits count once
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

  // VERTICES **AND EDGE MIDPOINTS**. Vertices alone were the shipped blind
  // spot that let a non-star-shaped coastline through: the generator's own
  // accept predicate sampled only vertices too, so this suite structurally
  // could not catch a violation hiding between two clean neighbours (measured
  // 15 failing midpoints across 60 production maps before the fix).
  it('every polygon is star-shaped about its skeleton at vertices AND edge midpoints', () => {
    let vertices = 0;
    let midpoints = 0;
    let vertexFails = 0;
    let midpointFails = 0;
    for (const { map } of sweep) {
      for (const isle of map.islands) {
        const poly = isle.poly;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          const mid = { x: (poly[j].x + poly[i].x) / 2, y: (poly[j].y + poly[i].y) / 2 };
          vertices++;
          midpoints++;
          if (!starClear(poly[i], isle.skeleton, poly)) vertexFails++;
          if (!starClear(mid, isle.skeleton, poly)) midpointFails++;
        }
      }
    }
    expect(midpoints).toBeGreaterThan(50_000); // the widened sampling really ran
    expect(vertices).toBe(midpoints);
    expect(vertexFails).toBe(0);
    expect(midpointFails).toBe(0);
  });

  // REGRESSION (adversarial review gate, cycle 51). The shipped defect: the
  // push-out consumer took its escape direction from the nearest skeleton
  // POINT while the generator validated star-shapedness about the skeleton
  // POLYLINE. On a long 2-point ridge a hull amidships was therefore pushed
  // along a heavily TANGENTIAL ray from a far endpoint, and its escape ray
  // left the coastline only to re-enter it (measured 121 / 81,499 interior
  // points across 60 production maps). Both sides now call the SAME
  // `nearestOnSkeleton`, so the ray this test aims IS the ray collision.ts
  // aims. It must leave the land and STAY out.
  it('every interior escape ray leaves the coastline and never re-enters it', () => {
    // The narrowest water gap any hull afloat could ever come to rest inside.
    const smallestHull = Math.min(...HULL_IDS.map((id) => 2 * polygonMaxRadius(hullSilhouette(id))));
    let sampled = 0;
    let ridgeFails = 0; // blobs + 2-point ridges: ZERO tolerance
    let jointFails = 0; // 3-point ridge joints: bounded slivers only
    let worstGap = 0;
    for (const { map } of sweep) {
      for (const isle of map.islands) {
        const step = (isle.r * 2) / 16;
        for (let gx = -isle.r; gx <= isle.r; gx += step) {
          for (let gy = -isle.r; gy <= isle.r; gy += step) {
            const p = { x: isle.x + gx, y: isle.y + gy };
            if (!pointInPolygon(p, isle.poly)) continue;
            sampled++;
            // THE PRODUCTION AIM — collision.ts pushOutOf calls exactly this.
            const { nx, ny, dist } = skeletonNormal(p, isle);
            if (dist <= 1e-9) continue;
            const ts = rayHits(p, nx, ny, isle.poly);
            if (ts.length <= 1) continue;
            if (isle.skeleton.length <= 2) ridgeFails++;
            else jointFails++;
            worstGap = Math.max(worstGap, ts[1] - ts[0]);
          }
        }
      }
    }
    expect(sampled).toBeGreaterThan(100_000); // the probe genuinely bit
    // Blobs and 2-point ridges — the shipped failure case — are now exact:
    // the nearest-point map is constant along the outward ray, so the
    // generator's boundary predicate implies the interior property.
    expect(ridgeFails).toBe(0);
    // A 3-point ridge JOINT is the one place that implication does not hold
    // (there the nearest-point map switches segments along the outward ray),
    // so the generator's finite escape-ray sampling can leave a vanishing
    // residue. This sweep currently measures ZERO of it, but the tolerance is
    // deliberate rather than tightened to 0: a denser probe (60 maps @ cap 20,
    // 500k interior points) still finds 7, and they are harmless BY
    // CONSTRUCTION — this is the bound that proves it. Every residual
    // re-entry is a water sliver (worst measured 2.99u) far narrower than the
    // smallest hull afloat, so pushOutOf's bisection — which needs the WHOLE
    // silhouette clear — can never come to rest inside one, and the push
    // direction stays perpendicular to the coast either way.
    expect(worstGap).toBeLessThan(smallestHull / 4);
    expect(jointFails / sampled).toBeLessThan(1e-4);
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

// --- 4-connectivity: the corner-pocket regression (Codex cross-model gate) ----
//
// INDEPENDENT ORACLE for the navigability raster — deliberately reimplemented
// here rather than imported, so it cannot inherit the very bug it checks.

interface Grid {
  n: number;
  cells: Uint8Array; // 0 outside disc, 1 land, 2 tight water, 3 navigable
}

const ORTHO = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;
const DIAG = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;

function oracleClassify(p: Vec2, islands: readonly Island[]): 1 | 2 | 3 {
  let tight = false;
  for (const isle of islands) {
    if (pointInPolygon(p, isle.poly)) return 1;
    if (closestPointOnPolygon(p, isle.poly).dist < MAP_RULES.NAV_CLEAR) tight = true;
  }
  return tight ? 2 : 3;
}

function oracleGrid(radius: number, islands: readonly Island[]): Grid {
  const cell = MAP_RULES.NAV_CELL;
  const n = Math.ceil((radius * 2) / cell);
  const cells = new Uint8Array(n * n);
  for (let cy = 0; cy < n; cy++) {
    for (let cx = 0; cx < n; cx++) {
      const x = -radius + (cx + 0.5) * cell;
      const y = -radius + (cy + 0.5) * cell;
      if (x * x + y * y > radius * radius) continue;
      cells[cy * n + cx] = oracleClassify({ x, y }, islands);
    }
  }
  return { n, cells };
}

function oracleNeighbors(n: number, idx: number, conn: 4 | 8): number[] {
  const cx = idx % n;
  const cy = (idx - cx) / n;
  const out: number[] = [];
  for (const [dx, dy] of conn === 4 ? ORTHO : [...ORTHO, ...DIAG]) {
    const nx = cx + dx;
    const ny = cy + dy;
    if (nx >= 0 && ny >= 0 && nx < n && ny < n) out.push(ny * n + nx);
  }
  return out;
}

function oracleFlood(grid: Grid, seed: number, conn: 4 | 8): Uint8Array {
  const reached = new Uint8Array(grid.cells.length);
  reached[seed] = 1;
  const stack = [seed];
  while (stack.length > 0) {
    const idx = stack.pop() as number;
    for (const nb of oracleNeighbors(grid.n, idx, conn)) {
      if (grid.cells[nb] === 3 && reached[nb] === 0) {
        reached[nb] = 1;
        stack.push(nb);
      }
    }
  }
  return reached;
}

function oracleSpawnSeed(grid: Grid, radius: number, spawnRing: number): number {
  const cell = MAP_RULES.NAV_CELL;
  for (let k = 0; k < 64; k++) {
    const ang = (TAU_TEST * k) / 64;
    const cx = Math.floor((Math.cos(ang) * spawnRing + radius) / cell);
    const cy = Math.floor((Math.sin(ang) * spawnRing + radius) / cell);
    if (cx < 0 || cy < 0 || cx >= grid.n || cy >= grid.n) continue;
    if (grid.cells[cy * grid.n + cx] === 3) return cy * grid.n + cx;
  }
  return -1;
}

const TAU_TEST = Math.PI * 2;

/** An axis-aligned square landmass of side `2*half` centred on (cx, cy). */
function squareIsland(cx: number, cy: number, half: number): Island {
  return islandFromPolygon([
    { x: cx - half, y: cy - half },
    { x: cx + half, y: cy - half },
    { x: cx + half, y: cy + half },
    { x: cx - half, y: cy + half },
  ]);
}

// REGRESSION (Codex cross-model review gate, cycle 51). The shipped defect:
// `floodFromSpawnRing` spread over the FOUR orthogonal neighbours while the
// acceptance test `hasReachedNeighbor` accepted any of the EIGHT surrounding
// cells. Water touching the reachable ocean only at a CORNER therefore counted
// as "reachable enough", so `validateMap` accepted enclosed pockets and
// sub-beam diagonal pinches — defeating the ratified no-enclosed-lagoons
// invariant. A hull cannot squeeze through a corner touch, so 4-connectivity
// is the correct semantics on BOTH sides; both now call `orthoNeighbors`.
//
// Codex's exact repro geometry: four 20x20 landmasses centred at (+/-36, +/-36)
// on a radius-113 board. Measured on this fixture BEFORE the fix,
// `validateMap` returned TRUE; after, FALSE.
describe('navigability is 4-CONNECTED on both sides (corner-pocket regression)', () => {
  const radius = 113;
  const islands = [
    squareIsland(36, 36, 10),
    squareIsland(-36, 36, 10),
    squareIsland(36, -36, 10),
    squareIsland(-36, -36, 10),
  ];
  const map: GameMap = { radius, spawnRing: radius * CONFIG.map.spawnFraction, islands };

  it('the fixture is in the coverage band, so ONLY navigability can reject it', () => {
    const cover = landCoverage(map);
    expect(cover).toBeGreaterThanOrEqual(MAP_RULES.COVER_MIN);
    expect(cover).toBeLessThanOrEqual(MAP_RULES.COVER_MAX);
  });

  it('the fixture really does contain corner-only water (independent oracle)', () => {
    const grid = oracleGrid(radius, islands);
    const seed = oracleSpawnSeed(grid, radius, map.spawnRing);
    expect(seed).toBeGreaterThanOrEqual(0);
    const r4 = oracleFlood(grid, seed, 4);
    const r8 = oracleFlood(grid, seed, 8);
    let unreached4 = 0;
    let cornerOnly = 0;
    for (let i = 0; i < grid.cells.length; i++) {
      if (grid.cells[i] !== 3 || r4[i] === 1) continue;
      unreached4++;
      if (r8[i] === 1) cornerOnly++;
    }
    // Four navigable pockets (one outside each island's outer corner) that the
    // diagonal flood reaches and the orthogonal flood cannot. That gap IS the
    // defect: it is exactly what the old 8-neighbour acceptance forgave.
    expect(unreached4).toBe(4);
    expect(cornerOnly).toBe(4);
  });

  it('validateMap REJECTS it (it returned true before the fix)', () => {
    expect(validateMap(map)).toBe(false);
  });

  it('the same board with the pockets opened up is accepted', () => {
    // Shrink the landmasses so every pocket joins the ocean orthogonally; the
    // fixture is then navigable and only leaves the coverage band, proving the
    // rejection above is about connectivity and not about the geometry style.
    const open = [
      squareIsland(46, 46, 6),
      squareIsland(-46, 46, 6),
      squareIsland(46, -46, 6),
      squareIsland(-46, -46, 6),
    ];
    const grid = oracleGrid(radius, open);
    const seed = oracleSpawnSeed(grid, radius, radius * CONFIG.map.spawnFraction);
    const r4 = oracleFlood(grid, seed, 4);
    let unreached4 = 0;
    for (let i = 0; i < grid.cells.length; i++) {
      if (grid.cells[i] === 3 && r4[i] === 0) unreached4++;
    }
    expect(unreached4).toBe(0);
  });
});

// --- The exhaustion ladder (R6) ------------------------------------------------
//
// REGRESSION (flagged independently at both review gates, cycle 51). The
// shipped defect: on MAP_ATTEMPTS exhaustion the generator popped landmasses
// until `navigable()` alone passed and returned IMMEDIATELY, never rerunning
// the coverage / >=1-landmass checks in `validateMap()`. Measured on the
// shipped code with the attempt loop starved so the fallback always ran: over
// 1,600 (seed, cap) pairs it returned 10 maps that FAIL `validateMap` — all 10
// below COVER_MIN (worst 0.29% land at cap 20 / seed 338) and one with ZERO
// landmasses (cap 5 / seed 322). Every acceptance now goes through
// `validateMap`, and a ladder that cannot produce one throws.
describe('exhaustion is LOUD, never a silently-invalid map (R6)', () => {
  it('throws MapGenerationError when the budget cannot produce a valid map', () => {
    const starved: [number, number][] = [
      [12, 5],
      [28, 5],
      [5, 20],
      [10, 20],
    ];
    for (const [seed, cap] of starved) {
      expect(() => generateMapBounded(seed, cap, 1)).toThrow(MapGenerationError);
    }
  });

  it('a starved ladder either throws or returns a FULLY valid map — never in between', () => {
    let threw = 0;
    let returned = 0;
    for (const cap of [5, 20]) {
      for (let seed = 0; seed < 30; seed++) {
        let map: GameMap;
        try {
          map = generateMapBounded(seed, cap, 1);
        } catch (err) {
          expect(err).toBeInstanceOf(MapGenerationError);
          threw++;
          continue;
        }
        returned++;
        expect(map.islands.length).toBeGreaterThanOrEqual(1); // >=1 landmass
        expect(validateMap(map)).toBe(true); // band + navigability
        expect(landCoverage(map)).toBeGreaterThanOrEqual(MAP_RULES.COVER_MIN);
      }
    }
    expect(threw).toBeGreaterThan(0); // the exhaustion path genuinely ran
    expect(returned).toBeGreaterThan(0); // and so did the success path
  });

  it('the DROP relaxation still yields a fully valid map, never a bare navigable one', () => {
    // Attempt >= DROP_FROM (4) is the rung that pops landmasses. Give the
    // ladder enough budget to reach it and assert the result is still checked
    // in full — this is the exact rung the old code short-circuited.
    for (const cap of [5, 20]) {
      for (let seed = 0; seed < 12; seed++) {
        const map = generateMapBounded(seed, cap, 6);
        expect(map.islands.length).toBeGreaterThanOrEqual(1);
        expect(validateMap(map)).toBe(true);
      }
    }
  });

  it('the production budget never actually reaches the throw (measured)', () => {
    // Measured over 1,500 (seed, cap) pairs across caps 1/2/5/10/20: zero
    // throws, and no map ever needed more than 3 of the 10 attempts. The throw
    // is the guarantee's teeth, not a path players travel — which is what makes
    // it safe on the CLIENT, where a throw would be a failed join. It is also
    // DETERMINISTIC, so server and client would always refuse the same seed.
    for (const cap of [1, 2, 5, 10, 20]) {
      for (let seed = 600; seed < 610; seed++) {
        expect(() => generateMap(seed, cap)).not.toThrow();
      }
    }
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
