// THE NAV CACHE (Story 9.13, epic-9 amendment 192) — one per map: the
// generator's ratified 32 u navigability grid (shared sim/nav.ts), its
// distance-to-land raster, and the "downhill to safety" flow fields of the
// rings the storm has made public, built LAZILY on first request per ring
// (the next ring at its reveal, the collapse ring at its close start — a
// one-off 25–40 ms build per ring, accepted 2026-10-17) and never per tick.
//
// Lives OUTSIDE ai/ so both the bot driver (through the port) and the PvE
// fleet controller hold the same instance; it reads nothing but the map,
// which is public (amendment 191). Zero Colyseus, no rng, no clock.
//
// ONE PER MAP IDENTITY (`navCacheFor`, a WeakMap). The island list is
// re-checked cheaply on every read (length + first/last identity) so a test
// fixture that edits `map.islands` after construction — the suites clear or
// push islands on a generated map — gets a fresh grid rather than a stale one;
// a production map never changes, so the check never fires there.

import {
  CONFIG,
  SHIP_CLASS_IDS,
  buildNavGrid,
  distanceToLand,
  flowField,
  goalCellsInsideDisc,
  hullEnvelope,
  isWater,
  pointOf,
  routeTo,
  snapToWater,
  type FlowField,
  type Island,
  type NavGrid,
  type NavSource,
  type Vec2,
  type ZoneRing,
} from '@salvo/shared';

/** u — how far inside a ring its field's goal set ends: the widest
 *  participant's rated full-ahead turn radius (the ring-escape deadband's own
 *  family, utility.ts ringDeadband), so one field per ring serves every hull. */
export const FIELD_MARGIN_U = Math.max(
  ...SHIP_CLASS_IDS.map((id) => hullEnvelope(id).kinematics.maxSpeed / hullEnvelope(id).kinematics.turnRate),
);

/** Fields kept per map (the live ring, the next, the one after while a close
 *  overlaps a reveal) — older entries are dropped first. */
const FIELD_MEMO = 4;

function ringKey(ring: ZoneRing, marginU: number): string {
  return `${ring.cx}:${ring.cy}:${ring.r}:${marginU}`;
}

/** The goal set of a ring: its water inside r − margin, else inside r, else
 *  the water cell nearest its centre (a collapse ring, or a ring centred
 *  deep inside an island) — empty only on a map with no water at all. */
function ringGoals(grid: NavGrid, ring: ZoneRing, marginU: number): number[] {
  const shrunk = goalCellsInsideDisc(grid, ring.cx, ring.cy, Math.max(0, ring.r - marginU));
  if (shrunk.length > 0) return shrunk;
  const whole = goalCellsInsideDisc(grid, ring.cx, ring.cy, ring.r);
  if (whole.length > 0) return whole;
  const c = snapToWater(grid, { x: ring.cx, y: ring.cy });
  if (c >= 0) return [c];
  const far = nearestWaterCell(grid, { x: ring.cx, y: ring.cy });
  return far < 0 ? [] : [far];
}

/** The navigable cell whose centre is nearest `p` over the WHOLE grid (ties
 *  by cell index), or -1 on a waterless grid — snapToWater's reach is three
 *  cells, so a ring centre deep inside land needs the exhaustive answer
 *  (Story 9.13 fix wave P4). One scan per ring build (≈ 0.4 M cells on the
 *  10,000 u ocean), never per tick. */
export function nearestWaterCell(grid: NavGrid, p: Vec2): number {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < grid.cells.length; i += 1) {
    if (!isWater(grid, i)) continue;
    const c = pointOf(grid, i);
    const d = (c.x - p.x) * (c.x - p.x) + (c.y - p.y) * (c.y - p.y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

export class NavCache {
  readonly grid: NavGrid;
  private dtl: Float32Array | null = null;
  private readonly fields = new Map<string, FlowField>();
  /** Fields built so far (inspection: the once-per-ring contract). */
  builds = 0;

  constructor(map: NavSource) {
    this.grid = buildNavGrid(map);
  }

  /** Clearance (cells) to the nearest non-navigable cell — built on first read. */
  get distToLand(): Float32Array {
    this.dtl ??= distanceToLand(this.grid);
    return this.dtl;
  }

  /** The flow field descending to `ring`'s safe set (r − marginU), memoised
   *  by (cx, cy, r, margin). */
  fieldFor(ring: ZoneRing, marginU: number = FIELD_MARGIN_U): FlowField {
    const key = ringKey(ring, marginU);
    const hit = this.fields.get(key);
    if (hit !== undefined) return hit;
    const field = flowField(this.grid, ringGoals(this.grid, ring, marginU));
    this.builds += 1;
    if (this.fields.size >= FIELD_MEMO) {
      const oldest = this.fields.keys().next().value;
      if (oldest !== undefined) this.fields.delete(oldest);
    }
    this.fields.set(key, field);
    return field;
  }

  /** Is `ring`'s field already built (inspection: the reveal hook's
   *  contract, fix wave P8)? */
  has(ring: ZoneRing, marginU: number = FIELD_MARGIN_U): boolean {
    return this.fields.has(ringKey(ring, marginU));
  }

  /** A string-pulled water route (null = unreachable / over budget). */
  routeTo(from: Vec2, to: Vec2): Vec2[] | null {
    return routeTo(this.grid, from, to, {
      budgetNodes: CONFIG.bots.nav.routeBudgetNodes,
      clearancePenalty: CONFIG.bots.nav.clearancePenalty,
    });
  }
}

interface Entry {
  cache: NavCache;
  islands: readonly Island[];
  count: number;
  first: Island | undefined;
  last: Island | undefined;
  radius: number;
}

const CACHES = new WeakMap<object, Entry>();

function fresh(e: Entry, map: NavSource): boolean {
  const isl = map.islands;
  return e.islands === isl && e.count === isl.length && e.first === isl[0] && e.last === isl[isl.length - 1] && e.radius === map.radius;
}

/** THE nav cache of a map (built on first use, rebuilt if its islands were
 *  edited — see the header). */
export function navCacheFor(map: NavSource): NavCache {
  const hit = CACHES.get(map);
  if (hit !== undefined && fresh(hit, map)) return hit.cache;
  const isl = map.islands;
  const cache = new NavCache(map);
  CACHES.set(map, { cache, islands: isl, count: isl.length, first: isl[0], last: isl[isl.length - 1], radius: map.radius });
  return cache;
}
