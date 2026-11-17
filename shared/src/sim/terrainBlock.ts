// MAIN-BATTERY HIGH GROUND (Eric 2026-11-13, epic-11 amendment 8): a main-gun
// shell fires OVER the lowest elevation band of an island — the outer
// coastline band, "basically ground" — and is BLOCKED by anything higher ("the
// lowest band passable, the second band up blocks").
//
// THE ELEVATION AUTHORITY IS THE HEIGHT RASTER (`GameMap.heightRaster`, cycle
// 59, Eric 2026-08-06 — contour polygons are render-only and never collided).
// The threshold is the chart's OWN first inner contour, read in raster units:
// contour level k sits at `sea + (peak − sea) × contourStep × k` of the field
// (sim/map.ts attachContours; `peak` is the field's highest in-disc sample),
// and the raster quantizes `(v − sea) / (peak − sea) × 255` with Math.round
// over the SAME sea level and peak (heightField.ts buildHeightRaster). So a
// sample lies inside the level-k band iff its unrounded raster value is at
// least `255 × contourStep × k`, and its quantized height is at least
// `contourBandHeight(k)`. No new number: it is the contour rule, quantized.
//
// Pure, deterministic, zero transcendentals (Math.floor / ceil / hypot only).
// Both sides may call it: the server once per main-battery shell AT LAUNCH
// (the path is a fixed straight line and islands are static, so there is no
// per-tick island test afterwards), a bot or a preview over the same public
// raster (rebuilt from the map seed on every client; never on the wire).

import { TERRAIN_PARAMS, tileCeiling, type HeightRaster } from './heightField.js';
import type { Vec2 } from '../math/vec.js';

/**
 * The smallest QUANTIZED raster height (0–255) inside the chart's level-`k`
 * contour band: `h ≥ contourBandHeight(k)` ⟺ the unrounded raster value is ≥
 * `255 × contourStep × k` (Math.round rounds a half up, so `round(x) ≥ q` ⟺
 * `x ≥ q − 0.5`). Exact whenever `255 × contourStep × k` is a half-integer —
 * it is for level 1 at the shipped panel (76.5).
 */
export function contourBandHeight(k: number, contourStep: number = TERRAIN_PARAMS.contourStep): number {
  return Math.ceil(255 * contourStep * k + 0.5);
}

/**
 * The quantized raster height at or above which terrain STOPS a main-battery
 * shell: the chart's first inner contour (level 1). Below it — the lowest,
 * outer land band — the shell passes over.
 */
export const BATTERY_BLOCK_HEIGHT = contourBandHeight(1);

/** u — a nudge past a tile boundary so an index read lands in the tile entered. */
const NUDGE_U = 1e-6;

/** Pyramid level the walk skips by (8 cells = 112 u at the shipped 14 u cell);
 *  clamped to the raster's own depth. */
const COARSE_LEVEL = 3;

/** One straight walk: origin, unit direction. */
interface Ray {
  ax: number;
  ay: number;
  dx: number;
  dy: number;
}

/** A tile visitor: the distance to report (stop the walk), or null to go on. */
type TileVisit = (ti: number, tj: number, tIn: number, tOut: number) => number | null;

/** Distance along one axis at which the ray leaves tile index `t` of `size`. */
function axisExit(o: number, d: number, lo: number, t: number, size: number): number {
  if (d > 0) return (lo + (t + 1) * size - o) / d;
  if (d < 0) return (lo + t * size - o) / d;
  return Infinity;
}

/**
 * Walk the level-`level` tiles the ray crosses over [t0, t1), in order,
 * calling `visit` with each tile's entry and exit distance (exit clamped to
 * t1); the first non-null answer ends the walk. Every crossing is derived
 * from the boundary's own coordinate, never an accumulated step.
 */
function walkTiles(r: HeightRaster, level: number, ray: Ray, t0: number, t1: number, visit: TileVisit): number | null {
  const size = r.cell * (1 << level);
  const lox = r.x0 - r.cell / 2;
  const loy = r.y0 - r.cell / 2;
  let t = t0;
  while (t < t1) {
    const ti = Math.floor((ray.ax + ray.dx * (t + NUDGE_U) - lox) / size);
    const tj = Math.floor((ray.ay + ray.dy * (t + NUDGE_U) - loy) / size);
    const out = Math.max(Math.min(axisExit(ray.ax, ray.dx, lox, ti, size), axisExit(ray.ay, ray.dy, loy, tj, size), t1), t + NUDGE_U);
    const hit = visit(ti, tj, t, out);
    if (hit !== null) return hit;
    t = out;
  }
  return null;
}

/**
 * The distance (u) along `a → b` at which the segment first ENTERS a raster
 * cell whose quantized height is at least `minHeight`, or null when it never
 * does (the cell holding `a` counts, at distance 0). Off-raster reads are sea.
 * Open water and low ground cost one pyramid test per coarse tile: only a
 * tile whose ceiling reaches `minHeight` is walked cell by cell.
 */
export function firstHighGround(r: HeightRaster, a: Vec2, b: Vec2, minHeight: number): number | null {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (!(len > 0) || !(r.cell > 0) || r.pyramid.length === 0) return null;
  const ray: Ray = { ax: a.x, ay: a.y, dx: (b.x - a.x) / len, dy: (b.y - a.y) / len };
  const level = Math.min(COARSE_LEVEL, r.pyramid.length - 1);
  return walkTiles(r, level, ray, 0, len, (ti, tj, tIn, tOut) =>
    tileCeiling(r, level, ti, tj) < minHeight
      ? null
      : walkTiles(r, 0, ray, tIn, tOut, (i, j, cIn) => (tileCeiling(r, 0, i, j) >= minHeight ? cIn : null)),
  );
}

/**
 * Where a MAIN-BATTERY shell flying `from → landing` is stopped by high ground
 * (`BATTERY_BLOCK_HEIGHT`), or null when it clears every hill and reaches its
 * landing point.
 */
export function batteryTerrainStop(r: HeightRaster, from: Vec2, landing: Vec2): Vec2 | null {
  const d = firstHighGround(r, from, landing, BATTERY_BLOCK_HEIGHT);
  if (d === null) return null;
  const len = Math.hypot(landing.x - from.x, landing.y - from.y);
  const k = d / len;
  return { x: from.x + (landing.x - from.x) * k, y: from.y + (landing.y - from.y) * k };
}
