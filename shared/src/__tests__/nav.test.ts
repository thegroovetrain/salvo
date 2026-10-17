// sim/nav.ts — the navigation layer's contracts (Story 9.13, epic-9 amendment
// 192): the exported grid IS the generator's navigability raster, the flow
// field reaches exactly the connected water, routes never cross a
// non-navigable cell, an enclosed lagoon is unreachable, and everything is
// byte-deterministic. No ring size, bearing or geometry is pinned.

import { describe, expect, it } from 'vitest';
import { CONFIG } from '../constants.js';
import { mulberry32 } from '../math/rng.js';
import type { Vec2 } from '../math/vec.js';
import { ringProbes } from '../sim/islandShape.js';
import { generateMap, islandFromPolygon, MAP_RULES, mapIsNavigable, type MapShape } from '../sim/map.js';
import {
  buildNavGrid,
  cellOf,
  distanceToLand,
  floodCells,
  flowDirection,
  flowField,
  geodesicU,
  goalCellsInsideDisc,
  isWater,
  lineClear,
  NAV_KIND,
  NAV_RULES,
  pointOf,
  routeTo,
  snapToWater,
  type NavGrid,
} from '../sim/nav.js';

const SEEDS = Array.from({ length: 10 }, (_, i) => 101 + i * 37);
const maps = SEEDS.map((seed) => generateMap(seed, CONFIG.match.fillTo));

/** First navigable cell under the spawn-ring probes (the generator's own seed rule). */
function spawnSeed(grid: NavGrid, spawnRing: number): number {
  for (const p of ringProbes(spawnRing, 128)) {
    const idx = cellOf(grid, p.x, p.y);
    if (isWater(grid, idx)) return idx;
  }
  return -1;
}

/** The navigability check re-derived from the exported grid + flood. */
function navigableByGrid(map: MapShape): { ok: boolean; reached: Uint8Array } {
  const grid = buildNavGrid(map);
  const reached = new Uint8Array(grid.cells.length);
  const seed = spawnSeed(grid, map.spawnRing);
  if (seed >= 0) {
    reached[seed] = 1;
    floodCells(grid, reached, [seed], NAV_KIND.WATER);
  }
  const shore = Uint8Array.from(reached);
  const seeds: number[] = [];
  for (let i = 0; i < shore.length; i++) if (shore[i]) seeds.push(i);
  floodCells(grid, shore, seeds, NAV_KIND.TIGHT);
  let ok = true;
  for (let i = 0; i < grid.cells.length; i++) {
    if (grid.cells[i] === NAV_KIND.WATER && !reached[i]) ok = false;
    if (grid.cells[i] === NAV_KIND.TIGHT && !shore[i]) ok = false;
  }
  return { ok, reached };
}

function rect(x0: number, y0: number, x1: number, y1: number): Vec2[] {
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}

/** A synthetic map with a square frame of land sealing an open-water lagoon at the centre. */
const LAGOON: MapShape = {
  radius: 1000,
  spawnRing: 750,
  islands: [
    islandFromPolygon(rect(-300, -300, 300, -240)),
    islandFromPolygon(rect(-300, 240, 300, 300)),
    islandFromPolygon(rect(-300, -300, -240, 300)),
    islandFromPolygon(rect(240, -300, 300, 300)),
  ],
};

/** Every point along a polyline (sampled at cellU/8) stands on a navigable cell. */
function polylineOnWater(grid: NavGrid, pts: readonly Vec2[]): boolean {
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(len / (grid.cellU / 8)));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      if (!isWater(grid, cellOf(grid, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t))) return false;
    }
  }
  return true;
}

function randomWaterPoint(grid: NavGrid, rng: ReturnType<typeof mulberry32>): Vec2 {
  for (;;) {
    const idx = rng.int(0, grid.cells.length - 1);
    if (!isWater(grid, idx)) continue;
    const c = pointOf(grid, idx);
    return { x: c.x + rng.float(-0.45, 0.45) * grid.cellU, y: c.y + rng.float(-0.45, 0.45) * grid.cellU };
  }
}

describe('nav grid — the generator\'s ratified raster', () => {
  it('CONFIG.bots.nav.cellU is the generator\'s cell size', () => {
    expect(CONFIG.bots.nav.cellU).toBe(MAP_RULES.NAV_CELL);
    expect(NAV_RULES.NAV_CELL).toBe(MAP_RULES.NAV_CELL);
    expect(buildNavGrid(maps[0]).cellU).toBe(MAP_RULES.NAV_CELL);
  });

  it('a flood over the exported grid agrees with mapIsNavigable (generated maps and a sealed lagoon)', () => {
    for (const map of maps) {
      expect(navigableByGrid(map).ok).toBe(mapIsNavigable(map));
      expect(mapIsNavigable(map)).toBe(true);
    }
    expect(mapIsNavigable(LAGOON)).toBe(false);
    expect(navigableByGrid(LAGOON).ok).toBe(false);
  });

  it('two builds of the same map are byte-identical', () => {
    for (const map of maps.slice(0, 3)) {
      const a = buildNavGrid(map);
      const b = buildNavGrid(map);
      expect(b.n).toBe(a.n);
      expect(Buffer.from(b.cells).equals(Buffer.from(a.cells))).toBe(true);
    }
  });
});

describe('distanceToLand', () => {
  it('is 0 on land-adjacent water and on land, and grows strictly inward', () => {
    const n = 11;
    const cells = new Uint8Array(n * n).fill(NAV_KIND.WATER);
    for (let y = 0; y < n; y++) cells[y * n] = NAV_KIND.LAND; // a coast down column 0
    const grid: NavGrid = { n, cellU: 32, radius: (n * 32) / 2, cells };
    const d = distanceToLand(grid);
    const row = 5;
    expect(d[row * n]).toBe(0); // land
    expect(d[row * n + 1]).toBe(0); // orthogonally next to land
    // centre row, from the coast to the middle (the raster edge is non-water too)
    for (let x = 2; x <= 5; x++) expect(d[row * n + x]).toBeGreaterThan(d[row * n + x - 1]);
  });
});

describe('flow field', () => {
  it('from the spawn ring reaches exactly the flood-reached water, and descends strictly', () => {
    for (const map of maps.slice(0, 4)) {
      const grid = buildNavGrid(map);
      const seed = spawnSeed(grid, map.spawnRing);
      const { reached } = navigableByGrid(map);
      const field = flowField(grid, [seed]);
      const bad: number[] = [];
      for (let i = 0; i < grid.cells.length; i++) {
        const finite = Number.isFinite(field.dist[i]);
        if (finite !== (grid.cells[i] === NAV_KIND.WATER && reached[i] === 1)) bad.push(i);
        else if (finite && i !== seed && !(field.dist[field.next[i]] < field.dist[i])) bad.push(i);
      }
      expect(bad).toEqual([]);
      expect(field.next[seed]).toBe(-1);
    }
  });

  it('a disc goal: every goal cell is navigable water inside the disc at zero distance; following the field arrives', () => {
    const map = maps[1];
    const grid = buildNavGrid(map);
    const r = map.spawnRing / 2;
    const goals = goalCellsInsideDisc(grid, 0, 0, r);
    expect(goals.length).toBeGreaterThan(0);
    const field = flowField(grid, goals);
    for (const g of goals) {
      const c = pointOf(grid, g);
      expect(isWater(grid, g)).toBe(true);
      expect(Math.hypot(c.x, c.y)).toBeLessThan(r);
      expect(field.dist[g]).toBe(0);
      expect(geodesicU(field, grid, c.x, c.y)).toBe(0);
    }
    const rng = mulberry32(7);
    for (let k = 0; k < 5; k++) {
      let p = randomWaterPoint(grid, rng);
      expect(geodesicU(field, grid, p.x, p.y)).toBeLessThan(Infinity);
      for (let step = 0; step < 4 * grid.n; step++) {
        const dir = flowDirection(field, grid, p.x, p.y);
        if (!dir) break;
        p = { x: p.x + dir.dx * grid.cellU * 0.5, y: p.y + dir.dy * grid.cellU * 0.5 };
      }
      expect(field.dist[cellOf(grid, p.x, p.y)]).toBe(0);
    }
  });

  it('no goals gives an unreachable field', () => {
    const grid = buildNavGrid(maps[0]);
    const field = flowField(grid, []);
    expect(field.dist.every((v) => v === Infinity)).toBe(true);
    expect(flowDirection(field, grid, 0, 0)).toBeNull();
  });

  it('is byte-deterministic', () => {
    const grid = buildNavGrid(maps[2]);
    const goals = goalCellsInsideDisc(grid, 0, 0, maps[2].spawnRing / 3);
    const a = flowField(grid, goals);
    const b = flowField(buildNavGrid(maps[2]), [...goals].reverse());
    expect(Buffer.from(b.dist.buffer).equals(Buffer.from(a.dist.buffer))).toBe(true);
    expect(Buffer.from(b.next.buffer).equals(Buffer.from(a.next.buffer))).toBe(true);
  });
});

describe('routeTo', () => {
  it('between random water points on every seed: each leg line-clear and on navigable water, ending at the goal', () => {
    for (let m = 0; m < maps.length; m++) {
      const grid = buildNavGrid(maps[m]);
      const rng = mulberry32(SEEDS[m]);
      for (let k = 0; k < 3; k++) {
        const from = randomWaterPoint(grid, rng);
        const to = randomWaterPoint(grid, rng);
        const path = routeTo(grid, from, to, { budgetNodes: Infinity });
        expect(path).not.toBeNull();
        const pts = [from, ...(path as Vec2[])];
        for (let i = 0; i + 1 < pts.length; i++) expect(lineClear(grid, pts[i], pts[i + 1])).toBe(true);
        expect(polylineOnWater(grid, pts)).toBe(true);
        expect(pts[pts.length - 1]).toEqual(to);
      }
    }
  });

  it('a line blocked by land is routed around it', () => {
    const grid = buildNavGrid(LAGOON);
    const from = { x: -500, y: 0 };
    const to = { x: 500, y: 0 };
    expect(lineClear(grid, from, to)).toBe(false);
    const path = routeTo(grid, from, to) as Vec2[];
    expect(path.length).toBeGreaterThan(1);
    expect(polylineOnWater(grid, [from, ...path])).toBe(true);
  });

  it('returns null into a lagoon sealed by land, and when the budget runs out', () => {
    const grid = buildNavGrid(LAGOON);
    expect(routeTo(grid, { x: -600, y: 0 }, { x: 0, y: 0 })).toBeNull();
    expect(routeTo(grid, { x: -500, y: 0 }, { x: 500, y: 0 }, { budgetNodes: 5 })).toBeNull();
  });

  it('is deterministic, including after other searches reuse the scratch', () => {
    const grid = buildNavGrid(maps[3]);
    const rng = mulberry32(42);
    const from = randomWaterPoint(grid, rng);
    const to = randomWaterPoint(grid, rng);
    const first = routeTo(grid, from, to, { budgetNodes: Infinity });
    routeTo(grid, to, from, { budgetNodes: Infinity });
    expect(routeTo(grid, from, to, { budgetNodes: Infinity })).toEqual(first);
    expect(routeTo(buildNavGrid(maps[3]), from, to, { budgetNodes: Infinity })).toEqual(first);
  });
});

describe('snapToWater — never across a spit (Story 9.13 fix wave P13, Edge Case Hunter)', () => {
  it('a point on the shore band beside a one-cell land spit snaps to water on ITS side, not the nearer cell across the spit', () => {
    const n = 9;
    const cellU = 32;
    const cells = new Uint8Array(n * n).fill(NAV_KIND.WATER);
    for (let y = 1; y <= 7; y++) cells[y * n + 4] = NAV_KIND.LAND; // the spit, column 4
    for (const x of [2, 3]) for (const y of [3, 4, 5]) cells[y * n + x] = NAV_KIND.TIGHT; // the shore band west of it
    const grid: NavGrid = { n, cellU, radius: (n * cellU) / 2, cells };
    const p = { x: -grid.radius + 3.95 * cellU, y: -grid.radius + 4.5 * cellU };
    const across = 4 * n + 5; // the nearest water centre, east of the spit
    const idx = snapToWater(grid, p);
    expect(isWater(grid, idx)).toBe(true);
    const c = pointOf(grid, idx);
    const dAcross = Math.hypot(pointOf(grid, across).x - p.x, pointOf(grid, across).y - p.y);
    expect(Math.hypot(c.x - p.x, c.y - p.y)).toBeGreaterThan(dAcross); // a farther cell was preferred...
    expect(idx % n).toBeLessThan(4); // ...on the point's own (west) side
  });

  it('with no same-side candidate the raw nearest still wins', () => {
    const n = 9;
    const cellU = 32;
    const cells = new Uint8Array(n * n).fill(NAV_KIND.LAND);
    cells[4 * n + 6] = NAV_KIND.WATER;
    for (let y = 0; y < n; y++) cells[y * n + 5] = NAV_KIND.LAND;
    const grid: NavGrid = { n, cellU, radius: (n * cellU) / 2, cells };
    const p = { x: -grid.radius + 4.5 * cellU, y: -grid.radius + 4.5 * cellU };
    expect(snapToWater(grid, p)).toBe(4 * n + 6);
  });
});
