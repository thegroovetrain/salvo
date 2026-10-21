// COVER — where a bot breaking off (or lying in wait) goes to disappear
// (Story 9.13, Eric ruling 2026-10-17, epic-9 amendment 199, cover half; the
// idle hold of amendment 202 reads the same point).
//
// TWO KINDS OF COVER, both PUBLIC GEOMETRY a human in the seat also has:
//
//   * SOLID FOG — the fog field is public weather (amendment 169: a human
//     client evaluates it from the welcome seed and the schema cut); the bot
//     reads it through its bound `fogAt` thunk (BotMind.fogAt). Sight-only
//     (amendment 162: fog never stops radar), so fog hides a hull from eyes,
//     not from the scope.
//   * ISLAND SHADOW — the far side of the nearest island along the
//     threat→self axis. Islands block EVERY sensor at all ranges (the
//     2026-08-02 LOS ruling), so an island is the better cover, preferred
//     whenever reaching it costs no more than CONFIG.bots.nav.coverDetourU of
//     detour over the straight line (the orchestrator's reading of "a short
//     detour", amendment 199).
//
// PURE: no rng, no clock, no world import, no mutation; the map arrives as
// the islands the port already carries, the fog as the bound thunk, the
// optional nav grid as the shared raster (sim/nav.ts). Ties break by sample
// order, so two worlds stepping one seed agree.

import {
  CONFIG,
  FOG_SOLID_DENSITY,
  cellOf,
  isWater,
  lineClear,
  nearestCoastPoint,
  pointInPolygon,
  pointOf,
  routeTo,
  snapToWater,
  type Island,
  type NavGrid,
  type Vec2,
} from '@salvo/shared';
import type { BotMind } from './types.js';
import { LONGEST_HULL_U, lineBlocked } from './plot.js';

/** Density at or above which fog is SOLID cover — the shared solid-fog bar (amendment 199: "density ≥ ½"). */
export const FOG_COVER_DENSITY = FOG_SOLID_DENSITY;

/** u — the three sample radii of the fog search, nearest first (the
 *  orchestrator's reading under amendment 199: 200 / 400 / 600 u). A search
 *  pattern, not a gameplay dial. */
const FOG_RADII_U: readonly number[] = [200, 400, 600];

/** The eight sample bearings as multiples of π/4 off the AWAY-from-threat
 *  bearing, nearest-to-away first; with a threat the half-disc facing it
 *  (|offset| > π/2) is skipped. */
const FOG_OFFSETS: readonly number[] = [0, 1, -1, 2, -2, 3, -3, 4];
const FACING_HALF = 2;

/** Where the bot is and what it is: the BotSituation fields cover reads. */
export interface CoverSite {
  x: number;
  y: number;
  /** The public map radius (port.map.radius); omitted = no rim check. */
  waterR?: number;
  /** u — own hull length: the island point's standoff and the arrival
   *  tolerance. Omitted = the longest participant hull. */
  hullLength?: number;
}

/** Optional inputs: the nav grid (snap to water, routed detour), the
 *  detour cap (CONFIG.bots.nav.coverDetourU by default) and a LEGALITY
 *  filter — a candidate it refuses is never returned (the posture chain hands
 *  in "inside the live ring and the revealed next ring", Story 9.13 fix wave
 *  P2, so a cover search never answers with a point the departure rule would
 *  immediately run the bot back out of). */
export interface CoverOptions {
  grid?: NavGrid | null;
  detourU?: number;
  accept?: (p: Vec2) => boolean;
}

type Accept = (p: Vec2) => boolean;
const ANY: Accept = () => true;

/**
 * THE COVER POINT for a bot at `site` running from `threat` (null = no
 * threat: idle siege / trapper looking for a place to lie in wait), or null
 * when there is neither solid fog in reach of the samples nor a usable
 * island. The island wins when its detour is within the cap; otherwise solid
 * fog; an over-detour island is still better than nothing.
 */
export function findCover(
  mind: Pick<BotMind, 'fogAt'>,
  site: CoverSite,
  threat: Vec2 | null,
  islands: readonly Island[],
  fogAt: ((x: number, y: number) => number) | undefined = mind.fogAt,
  cfg: CoverOptions = {},
): Vec2 | null {
  const grid = cfg.grid ?? null;
  const accept = cfg.accept ?? ANY;
  const island = acceptedIsland(islandCover(site, threat, islands, grid), accept);
  if (island !== null && island.detour <= detourCapOf(cfg)) return island.p;
  return fogOrNull(site, threat, islands, fogAt, grid, accept) ?? island?.p ?? null;
}

function detourCapOf(cfg: CoverOptions): number {
  return cfg.detourU ?? CONFIG.bots.nav.coverDetourU;
}

/** The island candidate when the legality filter takes its point. */
function acceptedIsland(found: { p: Vec2; detour: number } | null, accept: Accept): { p: Vec2; detour: number } | null {
  return found !== null && accept(found.p) ? found : null;
}

function fogOrNull(
  site: CoverSite,
  threat: Vec2 | null,
  islands: readonly Island[],
  fogAt: ((x: number, y: number) => number) | undefined,
  grid: NavGrid | null,
  accept: Accept,
): Vec2 | null {
  return fogAt === undefined ? null : fogCover(site, threat, islands, fogAt, grid, accept);
}

/** Is the bot AT its cover point — within one own hull length of it? */
export function atCover(site: CoverSite, point: Vec2 | null | undefined): boolean {
  if (point === null || point === undefined) return false;
  return Math.hypot(point.x - site.x, point.y - site.y) <= hullLengthOf(site);
}

function hullLengthOf(site: CoverSite): number {
  return site.hullLength ?? LONGEST_HULL_U;
}

// ---------------------------------------------------------------------------
// FOG
// ---------------------------------------------------------------------------

/** The bearing AWAY from the threat (0 with no threat, or one on top of us). */
function awayBearing(site: CoverSite, threat: Vec2 | null): number {
  if (threat === null) return 0;
  const dx = site.x - threat.x;
  const dy = site.y - threat.y;
  return dx === 0 && dy === 0 ? 0 : Math.atan2(dy, dx);
}

/** The nearest solid-fog sample on open water, nearest radius first, then
 *  nearest to the away bearing; null when none reads solid. */
function fogCover(
  site: CoverSite,
  threat: Vec2 | null,
  islands: readonly Island[],
  fogAt: (x: number, y: number) => number,
  grid: NavGrid | null,
  accept: Accept,
): Vec2 | null {
  const away = awayBearing(site, threat);
  for (const r of FOG_RADII_U) {
    for (const k of FOG_OFFSETS) {
      if (threat !== null && Math.abs(k) > FACING_HALF) continue;
      const a = away + (k * Math.PI) / 4;
      const p = { x: site.x + Math.cos(a) * r, y: site.y + Math.sin(a) * r };
      if (onOpenWater(p, site, islands, grid) && accept(p) && fogAt(p.x, p.y) >= FOG_COVER_DENSITY) return p;
    }
  }
  return null;
}

/** On the map and off the land: the grid's own cell class when a grid is
 *  handed in, else no island polygon holds the point. */
function onOpenWater(p: Vec2, site: CoverSite, islands: readonly Island[], grid: NavGrid | null): boolean {
  if (site.waterR !== undefined && Math.hypot(p.x, p.y) > site.waterR) return false;
  if (grid !== null) return isWater(grid, cellOf(grid, p.x, p.y));
  for (const isle of islands) {
    if (Math.hypot(p.x - isle.x, p.y - isle.y) <= isle.r && pointInPolygon(p, isle.poly)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// ISLAND SHADOW
// ---------------------------------------------------------------------------

/** The island whose COASTLINE is nearest the bot (bounding circles prune the
 *  polygon walks), or null on an empty map. Ties keep the earlier island. */
export function nearestIsland(p: Vec2, islands: readonly Island[]): Island | null {
  let best: Island | null = null;
  let bestD = Infinity;
  for (const isle of islands) {
    if (Math.hypot(p.x - isle.x, p.y - isle.y) - isle.r >= bestD) continue;
    const d = nearestCoastPoint(p, isle).dist;
    if (d < bestD) {
      bestD = d;
      best = isle;
    }
  }
  return best;
}

/** Unit vector of (b − a), or the fallback when the two coincide. */
function unitFrom(a: Vec2, b: Vec2, fallback: Vec2): Vec2 {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const m = Math.hypot(dx, dy);
  return m > 0 ? { x: dx / m, y: dy / m } : fallback;
}

/** The far-side point of the nearest island away from the threat with its
 *  detour, or null (no island, the point is off the map / on land / not
 *  reachable). */
function islandCover(
  site: CoverSite,
  threat: Vec2 | null,
  islands: readonly Island[],
  grid: NavGrid | null,
): { p: Vec2; detour: number } | null {
  const isle = nearestIsland(site, islands);
  if (isle === null) return null;
  const c = { x: isle.x, y: isle.y };
  const outward = unitFrom(c, site, { x: 1, y: 0 });
  const u = threat === null ? outward : unitFrom(threat, site, outward);
  const raw = { x: c.x + u.x * (isle.r + hullLengthOf(site)), y: c.y + u.y * (isle.r + hullLengthOf(site)) };
  const p = landedPoint(raw, site, islands, grid);
  if (p === null) return null;
  const detour = grid !== null ? routedDetour(site, p, grid) : flankDetour(site, p, isle, islands, hullLengthOf(site));
  return detour === null ? null : { p, detour };
}

/** The island point made usable: snapped to navigable water through the grid
 *  (null when none is near), else refused when it is on land; off the map is
 *  refused either way. */
function landedPoint(raw: Vec2, site: CoverSite, islands: readonly Island[], grid: NavGrid | null): Vec2 | null {
  if (site.waterR !== undefined && Math.hypot(raw.x, raw.y) > site.waterR) return null;
  if (grid === null) return onOpenWater(raw, site, islands, null) ? raw : null;
  const idx = snapToWater(grid, raw);
  return idx < 0 ? null : pointOf(grid, idx);
}

/** u — the routed path's length over the straight line; 0 when the line is
 *  clear, null when no route exists. */
function routedDetour(site: CoverSite, p: Vec2, grid: NavGrid): number | null {
  const from = { x: site.x, y: site.y };
  if (lineClear(grid, from, p)) return 0;
  const route = routeTo(grid, from, p);
  if (route === null) return null;
  let len = 0;
  let at = from;
  for (const w of route) {
    len += Math.hypot(w.x - at.x, w.y - at.y);
    at = w;
  }
  return Math.max(0, len - Math.hypot(p.x - from.x, p.y - from.y));
}

/** u — the gridless estimate: 0 on a clear line, else the shorter dog-leg
 *  round the island's flank (centre ± the perpendicular × (r + a hull
 *  length)) over the straight line. */
function flankDetour(site: CoverSite, p: Vec2, isle: Island, islands: readonly Island[], standoff: number): number {
  const from = { x: site.x, y: site.y };
  if (!lineBlocked(from, p, islands)) return 0;
  const u = unitFrom(from, p, { x: 1, y: 0 });
  const reach = isle.r + standoff;
  const straight = Math.hypot(p.x - from.x, p.y - from.y);
  let best = Infinity;
  for (const s of [1, -1]) {
    const f = { x: isle.x - u.y * reach * s, y: isle.y + u.x * reach * s };
    const leg = Math.hypot(f.x - from.x, f.y - from.y) + Math.hypot(p.x - f.x, p.y - f.y);
    best = Math.min(best, leg - straight);
  }
  return Math.max(0, best);
}
