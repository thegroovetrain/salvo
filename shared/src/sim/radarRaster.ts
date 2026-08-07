// THE SERVER-SIDE HULL RASTER (cycle 63, Eric ruling 2026-08-07, amendments
// 151-155) — the ONE function that projects a true hull polygon onto the
// low-resolution radar grid. It lives in shared/ because BOTH sides run it:
//
//   • the SERVER runs it in the `return`-grammar blip shaper (game/signals.ts)
//     to build the coverage footprint that goes on the wire — a fogged hull is
//     disclosed as "there is metal in these world cells" and NOTHING else
//     (no id, no class, no heading, no extent scalar; amendment 152);
//   • the CLIENT runs it on every sighted `Contact` (render/radarField.ts) so
//     the inside-truesight echo is built by the IDENTICAL code from the
//     identical inputs — two paint sources, one appearance (amendment 154).
//
// ONE CODE PATH IS THE INDISTINGUISHABILITY LAW (amendment 11): the decoy
// buoy's counter-intel paint is rasterized by this same function from its
// frozen drop-time pose, so a lie is byte-for-byte a genuine footprint by
// construction rather than by parallel maintenance.
//
// GEOMETRY ONLY. No intensity, no falloff, no reflectivity, no observer: the
// footprint is a pure function of (hull id, pose, cell size), which is what
// makes it world-anchored — every observer painting this hull this tick
// receives the identical mask, and moving the observer moves nothing.
//
// THE CELL SIZE IS `CONFIG.vision.radarCellU`, the shared radar grid
// resolution. It is gameplay-authoritative (it decides what the wire says),
// which is why it was promoted out of the client config; the client references
// it and never forks a second constant.

import type { HullId } from '../constants.js';
import type { Vec2 } from '../math/vec.js';
import { hullSilhouette, pointInPolygon, transformPolygon } from './silhouette.js';

/**
 * A hull's coverage footprint on the radar grid — the `return`-grammar wire
 * payload's spatial half (ReturnBlipEvent carries these five fields plus the
 * paint time).
 *
 * `gx`/`gy` are ABSOLUTE world cell indices of the rect's min corner
 * (`Math.floor(worldU / cellU)` — the same lattice the client's heatmap is
 * anchored to), so the footprint survives every client-side grid re-anchor.
 * `bits` is a packed row-major mask: cell (col, row) of the `w × h` rect is
 * bit `row * w + col`, 32 bits per word, LSB first. A battleship broadside at
 * the shipped 6u cells is ~21×8 cells ≈ 6 words — ~16 bytes packed.
 */
export interface HullCoverage {
  /** Absolute world cell index (x axis) of the rect's min corner. */
  gx: number;
  /** Absolute world cell index (y axis) of the rect's min corner. */
  gy: number;
  /** Rect width in cells (≥ 1). */
  w: number;
  /** Rect height in cells (≥ 1). */
  h: number;
  /** Packed row-major coverage mask (bit `row * w + col`, 32/word, LSB-first). */
  bits: number[];
}

/** Bits per packed mask word. */
export const COVERAGE_WORD = 32;

/** Read one mask bit. Out-of-rect coordinates answer false (uncovered). */
export function coverageHas(c: HullCoverage, col: number, row: number): boolean {
  if (col < 0 || row < 0 || col >= c.w || row >= c.h) return false;
  const i = row * c.w + col;
  return ((c.bits[i >>> 5] >>> (i & 31)) & 1) === 1;
}

/** Set one mask bit (builder-side helper; no bounds check — callers index
 *  inside the rect by construction). */
function setBit(bits: number[], i: number): void {
  bits[i >>> 5] |= 1 << (i & 31);
}

/** How many cells the mask covers (tests/diagnostics). */
export function coverageCellCount(c: HullCoverage): number {
  let n = 0;
  for (let i = 0, total = c.w * c.h; i < total; i++) {
    if (((c.bits[i >>> 5] >>> (i & 31)) & 1) === 1) n++;
  }
  return n;
}

/** Scratch polygon for the pose transform — consumed synchronously inside
 *  `rasterizeHullCoverage`, never retained, so the 20Hz server scan and the
 *  per-frame client stamp both stay allocation-light (the mask itself must be
 *  a fresh array: it goes on the wire / into a frozen paint). */
const POSE_SCRATCH: Vec2[] = [];

/** A 1×1 mask of the cell containing (x, y) — the fail-safe footprint. */
function centreCellCoverage(x: number, y: number, cellU: number): HullCoverage {
  return { gx: Math.floor(x / cellU), gy: Math.floor(y / cellU), w: 1, h: 1, bits: [1] };
}

/**
 * Project the true hull polygon onto the radar grid: every cell of the
 * polygon's bounding rect whose CENTRE lies inside the posed silhouette, plus
 * — always — the cell containing the hull's own centre. The centre-cell
 * fail-safe is the same rule the retired client stamp carried: a torpedo boat
 * seen end-on is narrower than a cell, and a return always lights the cell it
 * is in, so a mask can never be empty.
 *
 * THE SILHOUETTE IS THE FOOTPRINT (amendment 141, now server-side): the SHARED
 * polygon — the same one the hull renderer draws and the server hit-tests —
 * posed through the shared `transformPolygon` and tested with the shared
 * `pointInPolygon`. No polygon math is re-implemented here.
 *
 * An unknown hull id (impossible from a conforming caller — `HullId` is a
 * closed union) degrades to the centre-cell mask rather than throwing: this
 * runs inside the per-tick perception scan, where an exception would take the
 * whole frame down. A non-positive/non-finite `cellU` also degrades the same
 * way (a mask must never be built on a divide-by-zero lattice).
 */
export function rasterizeHullCoverage(
  cls: HullId,
  x: number,
  y: number,
  heading: number,
  cellU: number,
): HullCoverage {
  const local = hullSilhouette(cls);
  const grid = cellU > 0 && cellU < Infinity ? cellU : 0;
  if (local === undefined || grid === 0) return centreCellCoverage(x, y, grid === 0 ? 1 : grid);
  const poly = transformPolygon(local, x, y, heading, POSE_SCRATCH);
  const cover = emptyRectFor(poly, grid);
  fillCoverage(cover, poly, grid);
  // The fail-safe: the hull's own cell always lights. It is inside the rect by
  // construction (the origin sits inside the silhouette's bounding box).
  setBit(cover.bits, (Math.floor(y / grid) - cover.gy) * cover.w + (Math.floor(x / grid) - cover.gx));
  return cover;
}

/** The polygon's cell-space bounding rect, with an all-zero mask. */
function emptyRectFor(poly: readonly Vec2[], cellU: number): HullCoverage {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const gx = Math.floor(minX / cellU);
  const gy = Math.floor(minY / cellU);
  const w = Math.floor(maxX / cellU) - gx + 1;
  const h = Math.floor(maxY / cellU) - gy + 1;
  return { gx, gy, w, h, bits: new Array<number>(Math.ceil((w * h) / COVERAGE_WORD)).fill(0) };
}

/** Mark every cell of the rect whose CENTRE lies inside the polygon. */
function fillCoverage(cover: HullCoverage, poly: readonly Vec2[], cellU: number): void {
  const probe = { x: 0, y: 0 };
  for (let row = 0; row < cover.h; row++) {
    probe.y = (cover.gy + row + 0.5) * cellU;
    for (let col = 0; col < cover.w; col++) {
      probe.x = (cover.gx + col + 0.5) * cellU;
      if (pointInPolygon(probe, poly)) setBit(cover.bits, row * cover.w + col);
    }
  }
}
