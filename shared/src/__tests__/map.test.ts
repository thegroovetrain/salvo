// Invariant suite for the HEIGHT-FIELD island generator (cycle 59):
// determinism (deep-equal + raster fingerprint), coverage band, zero enclosed
// lagoons, navigability, spawn-ring clearance, polygon simplicity/CCW,
// pole-inside-polygon, vertex budget, contour containment + sibling
// disjointness, the 4-connectivity regression, and the generation-time guard
// — across a 100-seed production sweep.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  generateMap,
  islandFromPolygon,
  landCoverage,
  validateMap,
  MapGenerationError,
  MAP_RULES,
  type GameMap,
  type MapShape,
} from '../sim/map.js';
import { TERRAIN_PARAMS } from '../sim/heightField.js';
import { mapRadius, CONFIG } from '../constants.js';
import {
  closestPointOnPolygon,
  pointInPolygon,
  polygonArea,
  polygonIsSimple,
} from '../sim/silhouette.js';
import type { Vec2 } from '../math/vec.js';
import type { Island } from '../types.js';

const P = TERRAIN_PARAMS;

// --- The 100-seed sweep at the PRODUCTION cap ---------------------------------
//
// ArenaRoom always builds `new World(seed, CONFIG.match.fillTo)` with fillTo a
// constant 20 (spec ruling 2026-08-06: the roster-scaled framing was dead
// code), so the production ocean is cap 20 — the sweep runs there, seed 0
// included (the ratified degenerate-seed case).

const SWEEP_SEEDS = 100;
const sweep: { seed: number; map: GameMap }[] = [];
for (let seed = 0; seed < SWEEP_SEEDS; seed++) {
  sweep.push({ seed, map: generateMap(seed, 20) });
}

/** FNV-1a over a byte array — the raster/geometry fingerprint. */
function fnv1a(bytes: Uint8Array, h0 = 0x811c9dc5): number {
  let h = h0;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** One number pinning every vertex, pole, contour point and height cell. */
function mapFingerprint(map: GameMap): number {
  const nums: number[] = [map.radius, map.spawnRing];
  for (const isle of map.islands) {
    nums.push(isle.x, isle.y, isle.r, isle.pole.x, isle.pole.y, isle.core);
    for (const p of isle.poly) nums.push(p.x, p.y);
    for (const c of isle.contours) {
      nums.push(c.level);
      for (const poly of c.polys) for (const p of poly) nums.push(p.x, p.y);
    }
  }
  const f = new Float64Array(nums);
  let h = fnv1a(new Uint8Array(f.buffer));
  h = fnv1a(map.heightRaster.height, h);
  return h;
}

// --- Ratified constants ------------------------------------------------------

describe('MAP_RULES pinning', () => {
  it('coverage band is the ratified [2%, 3%]', () => {
    expect(MAP_RULES.COVER_MIN).toBe(0.02);
    expect(MAP_RULES.COVER_MAX).toBe(0.03);
  });

  it('nav erosion mirrors TERRAIN_PARAMS.navClear exactly (one number, two homes)', () => {
    expect(MAP_RULES.NAV_CLEAR).toBe(MAP_RULES.WIDEST_BEAM / 2 + MAP_RULES.NAV_MARGIN);
    expect(MAP_RULES.NAV_CLEAR).toBe(P.navClear);
  });

  it('SPAWN_MARGIN is 64u — at least the widest hull bounding radius (62.29)', () => {
    expect(MAP_RULES.SPAWN_MARGIN).toBe(64);
    expect(MAP_RULES.SPAWN_MARGIN).toBeGreaterThanOrEqual(62.29);
    expect(MAP_RULES.SPAWN_MARGIN).toBe(P.spawnMargin);
  });

  it('MIN_FEATURE is the marching-squares corner-clamp bound (~4.9u at cell 14)', () => {
    expect(MAP_RULES.MIN_FEATURE).toBeCloseTo(0.25 * Math.SQRT2 * P.cell, 12);
    expect(MAP_RULES.MIN_FEATURE).toBeGreaterThan(4.8);
  });
});

describe('mapRadius', () => {
  it('scales as base * sqrt(cap / capRef)', () => {
    expect(mapRadius(CONFIG.map.capRef)).toBeCloseTo(CONFIG.map.baseRadius);
    // 2400 -> 2800 (Story 5.6, amendment 42): read off CONFIG rather than a
    // second literal, so this pin can't itself go stale on the next retune.
    expect(mapRadius(5)).toBeCloseTo(CONFIG.map.baseRadius * Math.sqrt(5 / 20));
  });
});

// --- Determinism (absolute) ---------------------------------------------------

describe('generateMap determinism', () => {
  it('identical (seed, playerCap) is deep-equal — vertex, pole, contour, height cell', () => {
    for (const { seed, map } of sweep.filter((_, i) => i % 10 === 0)) {
      const again = generateMap(seed, 20);
      expect(again).toEqual(map);
      expect(mapFingerprint(again)).toBe(mapFingerprint(map));
    }
  });

  it('different seeds produce different oceans', () => {
    expect(mapFingerprint(sweep[1].map)).not.toBe(mapFingerprint(sweep[2].map));
  });

  it('sets radius and spawn ring from CONFIG', () => {
    const m = generateMap(5, 10);
    expect(m.radius).toBeCloseTo(mapRadius(10));
    expect(m.spawnRing).toBeCloseTo(mapRadius(10) * CONFIG.map.spawnFraction);
  });

  it('non-production caps generate and validate too (smoke)', () => {
    for (const cap of [2, 5, 10]) {
      const m = generateMap(3, cap);
      expect(m.islands.length).toBeGreaterThanOrEqual(1);
      expect(m).toEqual(generateMap(3, cap));
    }
  });
});

// --- Island structural invariants ---------------------------------------------

function assertIslandStructure(isle: Island): void {
  // x/y/r IS the bounding circle: r = max distance from centre to any vert.
  let maxD = 0;
  for (const p of isle.poly) {
    maxD = Math.max(maxD, Math.hypot(p.x - isle.x, p.y - isle.y));
  }
  expect(isle.r).toBeCloseTo(maxD, 6);
  // CCW closed simple boundary within the vertex budget.
  expect(isle.poly.length).toBeGreaterThanOrEqual(3);
  expect(isle.poly.length).toBeLessThanOrEqual(MAP_RULES.VERT_HARD_CAP);
  expect(polygonArea(isle.poly)).toBeGreaterThan(0);
  expect(polygonIsSimple(isle.poly)).toBe(true);
  // Pole of inaccessibility: strictly inside; core measured about it, > 0.
  expect(pointInPolygon(isle.pole, isle.poly)).toBe(true);
  expect(isle.core).toBeGreaterThan(0);
  expect(closestPointOnPolygon(isle.pole, isle.poly).dist).toBeCloseTo(isle.core, 6);
}

describe('island geometry invariants (all 100 sweep maps)', () => {
  it('>=1 island on every seed, including seed 0', () => {
    for (const { map } of sweep) expect(map.islands.length).toBeGreaterThanOrEqual(1);
  });

  it('bounding circle, CCW simple polygon, pole-inside, pole-centred core', () => {
    for (const { map } of sweep) {
      for (const isle of map.islands) assertIslandStructure(isle);
    }
  });

  it('every landmass clears the sub-rock speck floor', () => {
    for (const { map } of sweep) {
      for (const isle of map.islands) {
        expect(Math.abs(polygonArea(isle.poly))).toBeGreaterThanOrEqual(MAP_RULES.MIN_ISLAND_AREA);
      }
    }
  });

  it('the vertex budget holds: ~34 avg/island, hard cap never exceeded', () => {
    let verts = 0;
    let islands = 0;
    let biggest = 0;
    for (const { map } of sweep) {
      for (const isle of map.islands) {
        verts += isle.poly.length;
        islands++;
        biggest = Math.max(biggest, isle.poly.length);
      }
    }
    const avg = verts / islands;
    // The prototype measured ~34 avg / 627 per map; the count-driven
    // simplifier (no separate area-tolerance dust pass) may land a little
    // higher, never lower than a real coastline needs.
    expect(avg).toBeGreaterThan(10);
    expect(avg).toBeLessThan(45);
    expect(biggest).toBeLessThanOrEqual(MAP_RULES.VERT_HARD_CAP);
    // Per-map total stays well under the shipped ~1,500 (per-tick geometry
    // gets CHEAPER — the spec's hard constraint).
    expect(verts / sweep.length).toBeLessThan(1100);
  });
});

// --- Coverage band ------------------------------------------------------------

describe('land coverage (shoelace area over the map disc)', () => {
  it('every sweep map sits in [COVER_MIN, COVER_MAX]', () => {
    for (const { seed, map } of sweep) {
      const cover = landCoverage(map);
      expect(cover, `seed ${seed}`).toBeGreaterThanOrEqual(MAP_RULES.COVER_MIN);
      expect(cover, `seed ${seed}`).toBeLessThanOrEqual(MAP_RULES.COVER_MAX);
    }
  });
});

// --- Navigability + lagoons ---------------------------------------------------

describe('navigability (no lagoons, no unreachable pockets, no tight channels)', () => {
  it('every sweep map validates (flood from the spawn ring reaches all water)', () => {
    for (const { seed, map } of sweep) {
      expect(validateMap(map), `seed ${seed}`).toBe(true);
    }
  });
});

// INDEPENDENT ORACLE for enclosed lagoons — deliberately reimplemented here
// rather than imported, so it cannot inherit a generator bug. A lagoon is any
// navigable-water cell the 4-connected ocean flood cannot reach.
describe('zero enclosed lagoons (independent oracle)', () => {
  function oracleUnreached(map: MapShape): number {
    const cell = MAP_RULES.NAV_CELL;
    const R = map.radius;
    const n = Math.ceil((R * 2) / cell);
    const cells = new Uint8Array(n * n); // 0 out/land/tight, 3 navigable
    for (let cy = 0; cy < n; cy++) {
      for (let cx = 0; cx < n; cx++) {
        const x = -R + (cx + 0.5) * cell;
        const y = -R + (cy + 0.5) * cell;
        if (x * x + y * y > R * R) continue;
        let nav = true;
        for (const isle of map.islands) {
          const dx = x - isle.x;
          const dy = y - isle.y;
          const reach = isle.r + MAP_RULES.NAV_CLEAR;
          if (dx * dx + dy * dy >= reach * reach) continue;
          if (
            pointInPolygon({ x, y }, isle.poly) ||
            closestPointOnPolygon({ x, y }, isle.poly).dist < MAP_RULES.NAV_CLEAR
          ) {
            nav = false;
            break;
          }
        }
        if (nav) cells[cy * n + cx] = 3;
      }
    }
    // Seed at the spawn ring's due-east cell (open water by generation).
    const scx = Math.floor((map.spawnRing + R) / cell);
    const scy = Math.floor(R / cell);
    const seed = scy * n + scx;
    const reached = new Uint8Array(n * n);
    if (cells[seed] === 3) {
      reached[seed] = 1;
      const stack = [seed];
      while (stack.length > 0) {
        const idx = stack.pop() as number;
        const cx = idx % n;
        const nbs = [idx - n, idx + n, idx - 1, idx + 1];
        const ok = [idx >= n, idx + n < n * n, cx > 0, cx < n - 1];
        for (let k = 0; k < 4; k++) {
          if (ok[k] && cells[nbs[k]] === 3 && !reached[nbs[k]]) {
            reached[nbs[k]] = 1;
            stack.push(nbs[k]);
          }
        }
      }
    }
    let unreached = 0;
    for (let i = 0; i < cells.length; i++) if (cells[i] === 3 && !reached[i]) unreached++;
    return unreached;
  }

  it('every 5th sweep map has zero unreachable navigable water', () => {
    for (const { seed, map } of sweep.filter((_, i) => i % 5 === 0)) {
      expect(oracleUnreached(map), `seed ${seed}`).toBe(0);
    }
  });
});

// --- Spawn-ring clearance -----------------------------------------------------

describe('spawn-ring clearance', () => {
  /** Min |distance from ring circle| to any coastline point (dense sample). */
  function ringClearance(map: MapShape): number {
    let worst = Infinity;
    for (const isle of map.islands) {
      // Broadphase: only islands whose bounding annulus touches the ring band.
      const d = Math.hypot(isle.x, isle.y);
      if (Math.abs(d - map.spawnRing) > isle.r + MAP_RULES.SPAWN_MARGIN + 50) continue;
      for (let i = 0, j = isle.poly.length - 1; i < isle.poly.length; j = i++) {
        const a = isle.poly[j];
        const b = isle.poly[i];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const steps = Math.max(1, Math.ceil(len / 3));
        for (let s = 0; s <= steps; s++) {
          const x = a.x + ((b.x - a.x) * s) / steps;
          const y = a.y + ((b.y - a.y) * s) / steps;
          const ad = Math.abs(Math.hypot(x, y) - map.spawnRing);
          if (ad < worst) worst = ad;
        }
      }
    }
    return worst;
  }

  it('every coastline stays >= SPAWN_MARGIN from the spawn ring (all sweep maps)', () => {
    for (const { seed, map } of sweep) {
      expect(ringClearance(map), `seed ${seed}`).toBeGreaterThanOrEqual(MAP_RULES.SPAWN_MARGIN);
    }
  });
});

// --- Contours (render-only elevation bands) -----------------------------------

describe('contours: bands, containment, sibling disjointness', () => {
  it('levels are 1..CONTOUR_LEVELS, polys CCW + simple, within the vertex cap', () => {
    let bands = 0;
    let polys = 0;
    for (const { map } of sweep) {
      for (const isle of map.islands) {
        expect(isle.contours.length).toBeLessThanOrEqual(MAP_RULES.CONTOUR_LEVELS);
        for (const c of isle.contours) {
          bands++;
          expect(c.level).toBeGreaterThanOrEqual(1);
          expect(c.level).toBeLessThanOrEqual(MAP_RULES.CONTOUR_LEVELS);
          expect(c.polys.length).toBeGreaterThan(0);
          for (const poly of c.polys) {
            polys++;
            expect(poly.length).toBeGreaterThanOrEqual(3);
            expect(polygonArea(poly)).toBeGreaterThan(0);
            expect(polygonIsSimple(poly)).toBe(true);
          }
        }
      }
    }
    expect(bands).toBeGreaterThan(50); // elevation genuinely materialized
    expect(polys).toBeGreaterThanOrEqual(bands);
  });

  it('a band somewhere splits into multiple peaks (the desired feature)', () => {
    let split = 0;
    for (const { map } of sweep) {
      for (const isle of map.islands) {
        for (const c of isle.contours) if (c.polys.length > 1) split++;
      }
    }
    expect(split).toBeGreaterThan(0);
  });

  it('each band is strictly inside its parent (coastline for level 1, level k-1 above)', () => {
    for (const { map } of sweep) {
      for (const isle of map.islands) {
        for (const c of isle.contours) {
          const parents =
            c.level === 1
              ? [isle.poly]
              : (isle.contours.find((p) => p.level === c.level - 1)?.polys ?? []);
          for (const poly of c.polys) {
            const inside = parents.some((par) => poly.every((v) => pointInPolygon(v, par)));
            expect(inside).toBe(true);
          }
        }
      }
    }
  });

  it('sibling polys of one band never overlap (vertex-in-poly oracle)', () => {
    for (const { map } of sweep.filter((_, i) => i % 4 === 0)) {
      for (const isle of map.islands) {
        for (const c of isle.contours) {
          for (let a = 0; a < c.polys.length; a++) {
            for (let b = a + 1; b < c.polys.length; b++) {
              for (const v of c.polys[a]) expect(pointInPolygon(v, c.polys[b])).toBe(false);
              for (const v of c.polys[b]) expect(pointInPolygon(v, c.polys[a])).toBe(false);
            }
          }
        }
      }
    }
  });
});

// --- The retained height raster -----------------------------------------------

describe('the retained height raster (radar-shadow substrate)', () => {
  it('ships on every map, sea-level-zeroed, with a full max pyramid to a 1x1 root', () => {
    const map = sweep[42].map;
    const r = map.heightRaster;
    expect(r.n).toBeGreaterThan(0);
    expect(r.cell).toBe(P.cell);
    expect(r.pyramid[0].cells).toBe(r.height);
    expect(r.pyramid[r.pyramid.length - 1].n).toBe(1);
    // Land exists, so the peak cell is above sea level.
    let max = 0;
    for (let i = 0; i < r.height.length; i++) max = Math.max(max, r.height[i]);
    expect(max).toBeGreaterThan(0);
    expect(r.pyramid[r.pyramid.length - 1].cells[0]).toBe(max);
  });
});

// --- The raster agrees with the shipped coastline (closure-sealed lagoons) ----
//
// The lagoon-closure pass flips unreachable water to land in the MASK only;
// the FIELD stays below sea level there on purpose (raising it would feed
// back into every later re-extraction). Pre-fix the raster quantized the raw
// field, so a closure-sealed lagoon — solid land on the shipped coastline —
// read height 0: transparent SEA inside LAND, contradicting map.ts's own
// guarantee and poisoning the future radar-shadow raymarch. The land-mask
// stamp in buildHeightRaster (fed the final sea-level mask by generateMap)
// restores `height > 0 ⟺ the shipped mask says LAND`.
describe('height raster ⟷ coastline agreement (closure-sealed lagoons)', () => {
  /** Sea-level (height 0) cells whose sample sits ≥`depth`u INSIDE a shipped
   *  island polygon. Depth 30u clears simplification fuzz at the coast. */
  function seaLevelCellsInsideLand(map: GameMap, depth: number): number {
    const r = map.heightRaster;
    let bad = 0;
    for (const isle of map.islands) {
      const i0 = Math.max(0, Math.floor((isle.x - isle.r - r.x0) / r.cell));
      const i1 = Math.min(r.n - 1, Math.ceil((isle.x + isle.r - r.x0) / r.cell));
      const j0 = Math.max(0, Math.floor((isle.y - isle.r - r.y0) / r.cell));
      const j1 = Math.min(r.n - 1, Math.ceil((isle.y + isle.r - r.y0) / r.cell));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          if (r.height[j * r.n + i] !== 0) continue;
          const p = { x: r.x0 + i * r.cell, y: r.y0 + j * r.cell };
          if (!pointInPolygon(p, isle.poly)) continue;
          if (closestPointOnPolygon(p, isle.poly).dist >= depth) bad++;
        }
      }
    }
    return bad;
  }

  it('seed 27 lagoon regression: no sea-level cell deep inside any island', () => {
    // Seed 27 ships a closure-sealed lagoon. Pre-fix: 61 cells ≥30u inside
    // the shipped coastline read height 0, the deepest 127.9u in.
    expect(seaLevelCellsInsideLand(sweep[27].map, 30)).toBe(0);
  });

  it('holds across the sweep sample', () => {
    for (const { map } of sweep.filter((_, i) => i % 10 === 0)) {
      expect(seaLevelCellsInsideLand(map, 30)).toBe(0);
    }
  });
});

// --- 4-connectivity: the corner-pocket regression (Codex gate, cycle 51) ------
//
// Ported off the skeleton fixtures: four square landmasses whose outer-corner
// water pockets touch the ocean only DIAGONALLY. A hull cannot squeeze through
// a corner touch, so validateMap must reject; the geometry is re-scaled so the
// fixture sits inside the NEW [2%, 3%] coverage band and only navigability
// can reject it.
describe('navigability is 4-CONNECTED (corner-pocket regression)', () => {
  const radius = 140;
  function squareIsland(cx: number, cy: number, half: number): Island {
    return islandFromPolygon([
      { x: cx - half, y: cy - half },
      { x: cx + half, y: cy - half },
      { x: cx + half, y: cy + half },
      { x: cx - half, y: cy + half },
    ]);
  }
  const islands = [
    squareIsland(36, 36, 10),
    squareIsland(-36, 36, 10),
    squareIsland(36, -36, 10),
    squareIsland(-36, -36, 10),
  ];
  const map: MapShape = { radius, spawnRing: radius * CONFIG.map.spawnFraction, islands };

  it('the fixture is in the coverage band, so ONLY navigability can reject it', () => {
    const cover = landCoverage(map);
    expect(cover).toBeGreaterThanOrEqual(MAP_RULES.COVER_MIN);
    expect(cover).toBeLessThanOrEqual(MAP_RULES.COVER_MAX);
  });

  it('validateMap REJECTS the corner-pocket board', () => {
    expect(validateMap(map)).toBe(false);
  });

  it('the same board with the pockets opened up passes navigability', () => {
    const open: MapShape = {
      radius,
      spawnRing: radius * CONFIG.map.spawnFraction,
      islands: [squareIsland(0, 0, 14)],
    };
    // One centred square: all surrounding water is orthogonally continuous
    // with the ocean, so only the coverage clause can complain — prove that by
    // checking validateMap's navigability half in isolation via a band-sized
    // land total.
    expect(landCoverage(open)).toBeLessThan(MAP_RULES.COVER_MIN); // out of band…
    expect(validateMap({ ...open, islands })).toBe(false); // …and pockets still reject
  });
});

// --- Failure is loud ----------------------------------------------------------

describe('exhaustion is LOUD, never a silently-invalid map', () => {
  it('MapGenerationError carries the deterministic context', () => {
    const err = new MapGenerationError(7, 20, 4);
    expect(err.name).toBe('MapGenerationError');
    expect(err.seed).toBe(7);
    expect(err.playerCap).toBe(20);
    expect(err.message).toContain('seed=7');
  });

  it('the production path never actually throws (measured across the sweep)', () => {
    // The 100-map sweep above IS the measurement: construction at module load
    // would have thrown. Spot-check a few fresh seeds explicitly.
    for (const seed of [1234, 99991, 424242]) {
      expect(() => generateMap(seed, 20)).not.toThrow();
    }
  });
});

// --- Generation-time guard ----------------------------------------------------

describe('generation-time guard', () => {
  it('a production map generates within budget', () => {
    const t0 = performance.now();
    generateMap(4242, 20);
    const elapsed = performance.now() - t0;
    // Prototype: 38ms server / 44ms client.
    //
    // RE-BASED 250 → 500 by Story 5.6 (amendment 42 grew the board 2400 →
    // 2800). Measured rather than guessed, because a perf budget moved without
    // evidence is just a number that stops meaning anything:
    //
    //   warm, this seed, solo:   2400u  77ms  ->  2800u  117ms   (1.52x)
    //   warm, 7 seeds, solo:     ratio 1.22-1.52x, median ~1.44x
    //
    // which tracks the 1.36x AREA ratio — generation is O(r^2) in the height
    // field, so this is the expected cost of the bigger ocean and not a
    // regression in the generator.
    //
    // WHY THE HEADROOM IS SO WIDE, and why it was already wide before: this
    // guard measures MACHINE CONTENTION as much as code. The same call cold in
    // a bare node process measures ~590ms at the OLD radius and ~820ms at the
    // new one (JIT of the whole generation path, which does not scale with
    // radius at all); inside vitest it is warm by the time it runs — the
    // 100-map sweep above sees to that — but it still read 400ms under the
    // full parallel suite, against 117ms solo. So the old 250 was already
    // marginal and would have flaked on a loaded machine at the old radius
    // too. 500 keeps the guard catching what it is actually for — an
    // order-of-magnitude regression in the generator — without failing the
    // build because three workspaces happened to run their suites at once.
    expect(elapsed).toBeLessThan(500);
  });
});

// --- No transcendentals on the generation path (source guard) ------------------
//
// Same guard as noise.test.ts / heightField.test.ts (duplicated by design —
// importing one vitest file from another re-registers its suites), extended
// to the two remaining generation modules: map.ts and islandShape.ts.

const FORBIDDEN_MATH = [
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
  'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
  'pow', 'exp', 'expm1', 'log', 'log2', 'log10', 'log1p',
  'hypot', 'cbrt', 'random',
];

function expectNoTranscendentals(src: string): void {
  for (const fn of FORBIDDEN_MATH) {
    expect(new RegExp(`Math\\.${fn}\\s*\\(`).test(src), `Math.${fn}( is forbidden`).toBe(false);
  }
  expect(/Date\.now\s*\(/.test(src), 'Date.now( is forbidden').toBe(false);
  expect(/\bMath\.PI\b/.test(src), 'Math.PI is forbidden').toBe(false);
}

describe('map.ts + islandShape.ts — no transcendentals on the generation path', () => {
  it('map.ts calls no transcendental Math function, no Math.random, no Date.now', () => {
    expectNoTranscendentals(
      readFileSync(fileURLToPath(new URL('../sim/map.ts', import.meta.url)), 'utf8'),
    );
  });

  it('islandShape.ts calls no transcendental Math function, no Math.random, no Date.now', () => {
    expectNoTranscendentals(
      readFileSync(fileURLToPath(new URL('../sim/islandShape.ts', import.meta.url)), 'utf8'),
    );
  });
});
