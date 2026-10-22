// Invariant suite for the HEIGHT-FIELD island generator (cycle 59):
// determinism (deep-equal + raster fingerprint), coverage band, zero enclosed
// lagoons, navigability, spawn-ring clearance, polygon simplicity/CCW,
// pole-inside-polygon, vertex budget, contour containment + sibling
// disjointness and the 4-connectivity regression — across a 100-seed
// production sweep.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  generateMap,
  islandFromPolygon,
  landCoverage,
  mapIsNavigable,
  validateMap,
  MapGenerationError,
  RESEED_CAP,
  MAP_RULES,
  type GameMap,
  type MapShape,
} from '../sim/map.js';
import { TERRAIN_PARAMS } from '../sim/heightField.js';
import { mapRadius, CONFIG, SHIP_CLASS_IDS } from '../constants.js';
import {
  closestPointOnPolygon,
  pointInPolygon,
  polygonArea,
  polygonIsSimple,
  polygonMaxRadius,
  hullSilhouette,
} from '../sim/silhouette.js';
import type { Vec2 } from '../math/vec.js';
import type { Island } from '../types.js';

const P = TERRAIN_PARAMS;

// --- The 100-seed sweep at the PRODUCTION cap ---------------------------------
//
// ArenaRoom always builds `new World(seed, CONFIG.match.fillTo)` with fillTo a
// constant (spec ruling 2026-08-06: the roster-scaled framing was dead code;
// 20 → 16 Story 9.8), so the production ocean is cap `fillTo` — the sweep runs
// there, read off CONFIG, seed 0 included (the ratified degenerate-seed case).

const SWEEP_SEEDS = 100;
const sweep: { seed: number; map: GameMap }[] = [];
for (let seed = 0; seed < SWEEP_SEEDS; seed++) {
  sweep.push({ seed, map: generateMap(seed, CONFIG.match.fillTo) });
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
  it('the coverage band is a proper band inside (0, 1): COVER_MIN < COVER_MAX', () => {
    // The band's NUMBERS are Eric's (2.5 % → 10 % land, Story 9.1, 2026-10-07)
    // and are not a test subject; the contract is that the band is a band.
    expect(MAP_RULES.COVER_MIN).toBeGreaterThan(0);
    expect(MAP_RULES.COVER_MIN).toBeLessThan(MAP_RULES.COVER_MAX);
    expect(MAP_RULES.COVER_MAX).toBeLessThan(1);
  });

  it('nav erosion mirrors TERRAIN_PARAMS.navClear exactly (one number, two homes)', () => {
    expect(MAP_RULES.NAV_CLEAR).toBe(MAP_RULES.WIDEST_BEAM / 2 + MAP_RULES.NAV_MARGIN);
    expect(MAP_RULES.NAV_CLEAR).toBe(P.navClear);
  });

  it('SPAWN_MARGIN is at least the widest player-hull bounding radius, and mirrors TERRAIN_PARAMS.spawnMargin', () => {
    const widest = Math.max(...SHIP_CLASS_IDS.map((id) => polygonMaxRadius(hullSilhouette(id))));
    expect(MAP_RULES.SPAWN_MARGIN).toBeGreaterThanOrEqual(widest);
    expect(MAP_RULES.SPAWN_MARGIN).toBe(P.spawnMargin);
  });

  it('MIN_FEATURE is the marching-squares corner-clamp bound, ¼·√2·cell', () => {
    expect(MAP_RULES.MIN_FEATURE).toBeCloseTo(0.25 * Math.SQRT2 * P.cell, 12);
  });
});

describe('mapRadius', () => {
  it('scales as base * sqrt(cap / capRef)', () => {
    expect(mapRadius(CONFIG.map.capRef)).toBeCloseTo(CONFIG.map.baseRadius);
    // 2400 -> 2800 (Story 5.6, amendment 42): read off CONFIG rather than a
    // second literal, so this pin can't itself go stale on the next retune.
    expect(mapRadius(5)).toBeCloseTo(CONFIG.map.baseRadius * Math.sqrt(5 / CONFIG.map.capRef));
  });
});

// --- Determinism (absolute) ---------------------------------------------------

describe('generateMap determinism', () => {
  it('identical (seed, playerCap) is deep-equal — vertex, pole, contour, height cell', () => {
    for (const { seed, map } of sweep.filter((_, i) => i % 10 === 0)) {
      const again = generateMap(seed, CONFIG.match.fillTo);
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

  it('the vertex budget holds: a real coastline per island, hard cap never exceeded', () => {
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
    // The AVERAGE is map character, not a contract (it was ~34 at 2800 u /
    // 2.5 % land and is ~51 at 5500 u / 10 %, Story 9.1): only the floor
    // (a real coastline needs vertices) and the HARD CAP are pinned.
    expect(avg).toBeGreaterThan(10);
    expect(biggest).toBeLessThanOrEqual(MAP_RULES.VERT_HARD_CAP);
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

  /** Of the cells `seaLevelCellsInsideLand` would count, only those whose
   *  4-connected sea-level component on the raster NEVER leaves the island
   *  polygon — i.e. a SEALED pocket, the lagoon this suite exists for. An
   *  inlet still open to the sea is coastline-simplification fuzz instead. */
  function sealedSeaCellsInsideLand(map: GameMap, depth: number): number {
    const r = map.heightRaster;
    let bad = 0;
    for (const isle of map.islands) {
      const sealed = new Map<number, boolean>(); // cell → its component is sealed
      const inside = (k: number): boolean =>
        pointInPolygon({ x: r.x0 + (k % r.n) * r.cell, y: r.y0 + Math.floor(k / r.n) * r.cell }, isle.poly);
      const floodSealed = (start: number): boolean => {
        const comp = [start];
        const seen = new Set([start]);
        let open = false;
        for (let q = 0; q < comp.length && !open; q++) {
          const k = comp[q];
          if (!inside(k)) open = true;
          const i = k % r.n;
          for (const nk of [k - 1, k + 1, k - r.n, k + r.n]) {
            if (nk < 0 || nk >= r.height.length || seen.has(nk) || r.height[nk] !== 0) continue;
            if ((nk === k - 1 && i === 0) || (nk === k + 1 && i === r.n - 1)) continue;
            seen.add(nk);
            comp.push(nk);
          }
        }
        for (const k of seen) sealed.set(k, !open);
        return !open;
      };
      const i0 = Math.max(0, Math.floor((isle.x - isle.r - r.x0) / r.cell));
      const i1 = Math.min(r.n - 1, Math.ceil((isle.x + isle.r - r.x0) / r.cell));
      const j0 = Math.max(0, Math.floor((isle.y - isle.r - r.y0) / r.cell));
      const j1 = Math.min(r.n - 1, Math.ceil((isle.y + isle.r - r.y0) / r.cell));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const k = j * r.n + i;
          if (r.height[k] !== 0 || !inside(k)) continue;
          const p = { x: r.x0 + i * r.cell, y: r.y0 + j * r.cell };
          if (closestPointOnPolygon(p, isle.poly).dist < depth) continue;
          if (sealed.get(k) ?? floodSealed(k)) bad++;
        }
      }
    }
    return bad;
  }

  it('no SEALED sea-level pocket sits deep inside any island across the sweep sample', () => {
    // The regression is a SEALED lagoon (sea on the raster, land on the shipped
    // coastline, no way out). Story 9.1 had already raised the depth 30 → 60 u
    // for coastline-simplification fuzz on the biggest islands (92-vertex hard
    // cap, epic-9 amendment 9c). At the 5,000 u ocean (Story 9.8) seed 30
    // shows a 90.8 u-deep chord across an inlet that is OPEN to the sea — the
    // same fuzz, deeper — so this case now asks the question it exists for:
    // is the pocket sealed? Depth back to 30 u. A finer vertex cap for very
    // large islands stays a map-look question for Eric.
    for (const { map } of sweep.filter((_, i) => i % 10 === 0)) {
      expect(sealedSeaCellsInsideLand(map, 30)).toBe(0);
    }
  });
});

// --- 4-connectivity: the corner-pocket regression (Codex gate, cycle 51) ------
//
// Ported off the skeleton fixtures: four square landmasses whose outer-corner
// water pockets touch the ocean only DIAGONALLY. A hull cannot squeeze through
// a corner touch, so the navigability check must reject it. The fixture is
// asked about NAVIGABILITY directly (mapIsNavigable) rather than through
// validateMap's cover band — the band is Eric's number (2.5 % → 10 %, Story
// 9.1) and this geometry is pinned to the 32 u nav grid, not to the band.
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

  it('the corner-pocket board is rejected for NAVIGABILITY', () => {
    expect(mapIsNavigable(map)).toBe(false);
    expect(validateMap(map)).toBe(false); // ...and therefore by validateMap, whatever the band says
  });

  it('the same board with the pockets opened up passes navigability', () => {
    const open: MapShape = {
      radius,
      spawnRing: radius * CONFIG.map.spawnFraction,
      islands: [squareIsland(0, 0, 14)],
    };
    // One centred square: all surrounding water is orthogonally continuous
    // with the ocean.
    expect(mapIsNavigable(open)).toBe(true);
    expect(mapIsNavigable({ ...open, islands })).toBe(false); // the pockets still reject
  });
});

// --- Failure is loud ----------------------------------------------------------

describe('THERE IS NO GIVE-UP (Eric 2026-10-07) — an invalid draw is reseeded, never thrown', () => {
  it('every sweep seed yields a valid map — including the ones whose first draw fails an invariant', () => {
    // The 100-map sweep above IS the proof: before this ruling seed 52 threw
    // on the 5500 u / 10 % ocean (its first draw failed the cover band +
    // navigability after repair); now it reseeds and ships a valid ocean like
    // every other seed. Nothing in the sweep is skipped.
    expect(sweep).toHaveLength(SWEEP_SEEDS);
    for (const { seed, map } of sweep) {
      expect(map.islands.length, `seed ${seed}`).toBeGreaterThanOrEqual(1);
      expect(validateMap(map), `seed ${seed}`).toBe(true);
    }
    for (const seed of [1234, 99991, 424242]) expect(() => generateMap(seed, CONFIG.match.fillTo)).not.toThrow();
  });

  it('the reseed chain is deterministic and seed-specific (both sides rebuild the same ocean from the wire seed)', () => {
    const a = generateMap(52, CONFIG.match.fillTo);
    const b = generateMap(52, CONFIG.match.fillTo);
    expect(a.islands.length).toBe(b.islands.length);
    expect(a.islands.map((i) => [i.x, i.y, i.r])).toEqual(b.islands.map((i) => [i.x, i.y, i.r]));
    const other = generateMap(53, CONFIG.match.fillTo);
    expect(a.islands.map((i) => [i.x, i.y])).not.toEqual(other.islands.map((i) => [i.x, i.y]));
  });

  it('MapGenerationError survives only as the bug guard, and still carries the deterministic context', () => {
    expect(RESEED_CAP).toBeGreaterThanOrEqual(100);
    const err = new MapGenerationError(7, CONFIG.map.playerCap, RESEED_CAP);
    expect(err.name).toBe('MapGenerationError');
    expect(err.seed).toBe(7);
    expect(err.playerCap).toBe(CONFIG.map.playerCap);
    expect(err.message).toContain('seed=7');
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
