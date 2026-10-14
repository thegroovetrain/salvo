// ISLAND BUCKETS — a static uniform grid over the map's islands for the PvE
// fleet's per-tick island avoidance (game/drones.ts). Eric 2026-10-14: a drone
// reasons only about what lies within its own sight, so a drone must not scan
// all ~118 islands of the 10,000 u map every tick to find the one or two
// whose coast is near it.
//
// EXACT BY CONSTRUCTION. Each island is filed in every cell its bounding
// circle grown by `reach` overlaps (as an axis-aligned box, clamped to the
// grid), so any point within `reach` of the circle falls in a cell that lists
// the island — a superset of the islands the caller's own broadphase would
// accept. Lists keep the island array's ORDER (ascending index), so a caller
// that sums a per-island term visits the non-zero terms in the very same
// order as a full scan and produces the identical float.
//
// Pure server-side helper over plain data; no Colyseus, no World.

import type { Island } from '@salvo/shared';

/** Cell edge (u). Coarse on purpose: a drone reads one cell per tick. */
const CELL = 500;

interface Buckets {
  /** The island refs the grid was built from — revalidated on every read so
   *  an in-place edit of `map.islands` (tests do this) can never go stale. */
  source: Island[];
  x0: number;
  y0: number;
  cols: number;
  rows: number;
  cells: Island[][];
}

function cellIndex(v: number, origin: number, count: number): number {
  const c = Math.floor((v - origin) / CELL);
  if (c < 0) return 0;
  return c >= count ? count - 1 : c;
}

function build(islands: readonly Island[], mapRadius: number, reach: number): Buckets {
  const x0 = -mapRadius;
  const y0 = -mapRadius;
  const cols = Math.max(1, Math.ceil((2 * mapRadius) / CELL));
  const rows = cols;
  const cells: Island[][] = Array.from({ length: cols * rows }, () => []);
  for (const isle of islands) {
    const grow = isle.r + reach;
    const c0 = cellIndex(isle.x - grow, x0, cols);
    const c1 = cellIndex(isle.x + grow, x0, cols);
    const r1 = cellIndex(isle.y + grow, y0, rows);
    for (let r = cellIndex(isle.y - grow, y0, rows); r <= r1; r++) {
      for (let c = c0; c <= c1; c++) cells[r * cols + c].push(isle);
    }
  }
  return { source: [...islands], x0, y0, cols, rows, cells };
}

function stillValid(b: Buckets, islands: readonly Island[]): boolean {
  if (b.source.length !== islands.length) return false;
  for (let i = 0; i < islands.length; i++) if (b.source[i] !== islands[i]) return false;
  return true;
}

/** Caches one grid per (islands, map radius, reach) and answers the islands
 *  that may lie within `reach` of a point, in island-array order. */
export class IslandBuckets {
  private grid: Buckets | null = null;
  private radius = 0;

  constructor(private readonly reach: number) {}

  /** Rebuild if the island list or the map radius changed since last tick. */
  sync(islands: readonly Island[], mapRadius: number): void {
    if (this.grid && this.radius === mapRadius && stillValid(this.grid, islands)) return;
    this.grid = build(islands, mapRadius, this.reach);
    this.radius = mapRadius;
  }

  /** The islands filed in `(x, y)`'s cell (call sync() first this tick). */
  near(x: number, y: number): readonly Island[] {
    const g = this.grid;
    if (!g) return [];
    return g.cells[cellIndex(y, g.y0, g.rows) * g.cols + cellIndex(x, g.x0, g.cols)];
  }
}
