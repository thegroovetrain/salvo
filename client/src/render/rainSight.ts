// RAIN SIGHT, PER PART (Story 11.6; Eric 2026-11-14 on the bench page: rain
// must occlude "in a realistic way" — you see the PARTS of a ship the rain lets
// through). The pure half of the hulls' A+D look: the per-hull visibility grid
// and the decision whether a hull needs the dissolve at all. The Pixi half is
// render/hullDissolve.ts.
//
// THE GRID: the shared `fogHullGrid` — the SAME `hullGridCols × hullGridRows`
// cell-center points over the hull's length × beam the server gates the hull
// on — each given V = exp(−k·τ) (`fogVisibility`) of the optical depth
// `fogDepthAlong` from the OBSERVER (the own hull) to that point through the
// frame's rain. Point (col c, row r) lands at `out[r × cols + c]`: columns
// stern → bow, rows starboard → port (hull-local −y → +y), the shader's
// layout. The rain is public weather, so this is the client re-deriving what
// the server already used to send the hull; it is presentation only.
//
// THE CADENCE (`HullRainVis`): 12 marches per hull of up to the whole sight
// reach at `marchStepU` are ~1 ms per hull in rain (node, 2026-11-14), so a
// hull re-marches every `visRefreshMs` (staggered per hull) and the drawn V
// eases toward the latest march (`visEaseMs`). A newly seen hull snaps.

import { CONFIG, fogDepthAlong, fogHullGrid, fogVisibility, type FogFrame } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';

const L = CLIENT_CONFIG.rainLook;

/** The shared hull sight grid's shape (CONFIG.fog). */
export const RAIN_GRID_COLS = CONFIG.fog.hullGridCols;
export const RAIN_GRID_ROWS = CONFIG.fog.hullGridRows;
export const RAIN_GRID_N = RAIN_GRID_COLS * RAIN_GRID_ROWS;

/**
 * V at or above this reads as CLEAR water: the look cannot show the difference
 * (the dissolve keeps a 1 − V share of nothing, and the fade is under half an
 * 8-bit step), so the hull keeps drawing exactly as it always did, unfiltered.
 */
export const CLEAR_V = 1 - 1 / 512;

/** Who is looking through the rain: the frame and the observer's world point. */
export interface RainEye {
  frame: FogFrame;
  x: number;
  y: number;
}

/** A hull's look this frame: unfiltered, the A+D filter, or the no-WebGL plain fade. */
export type RainLookMode = 'off' | 'filter' | 'fade';

/**
 * Pure: V at each of the hull's sight-grid points — the hull at (cx, cy),
 * `heading` (rad, bow), `lengthU` × `beamU` — seen from `eye`. `pts` is a
 * scratch of at least 2 × RAIN_GRID_N; `out` receives RAIN_GRID_N values in
 * [0, 1]. Returns `out`.
 */
export function hullVisGrid(
  eye: RainEye, cx: number, cy: number, heading: number, lengthU: number, beamU: number,
  pts: Float64Array, out: Float32Array,
): Float32Array {
  const n = fogHullGrid(cx, cy, heading, lengthU, beamU, RAIN_GRID_COLS, RAIN_GRID_ROWS, pts);
  for (let i = 0; i < n; i++) {
    const tau = fogDepthAlong(eye.frame, eye.x, eye.y, pts[2 * i], pts[2 * i + 1]);
    out[i] = fogVisibility(tau, CONFIG.fog);
  }
  return floorSentHull(out, n);
}

/**
 * Pure, in place: THE FLOOR for a hull the server SENT. The server held it, so
 * the client must never draw it fully gone on a timing or cell difference: if
 * every part's V is below `CONFIG.fog.sightCutoffV`, the BEST part is raised
 * to the cutoff (the others stay). Returns `out`.
 */
export function floorSentHull(out: Float32Array, n: number = out.length): Float32Array {
  let best = 0;
  for (let i = 1; i < n; i++) if (out[i] > out[best]) best = i;
  if (n > 0 && out[best] < CONFIG.fog.sightCutoffV) out[best] = CONFIG.fog.sightCutoffV;
  return out;
}

/** Pure: does any grid point read below clear water? */
export function needsDissolve(vis: ArrayLike<number>): boolean {
  for (let i = 0; i < vis.length; i++) if (vis[i] < CLEAR_V) return true;
  return false;
}

/** Pure: the grid's mean V (the no-WebGL fallback's alpha). 1 for an empty grid. */
export function meanVisibility(vis: ArrayLike<number>): number {
  if (vis.length === 0) return 1;
  let s = 0;
  for (let i = 0; i < vis.length; i++) s += vis[i];
  return s / vis.length;
}

/**
 * Pure: the filter on/off decision. No grid (no observer, no rain) or a clear
 * grid → 'off' (the hull draws exactly as before, at zero cost); otherwise the
 * A+D filter where it can run, else the plain fade by the mean V.
 */
export function rainLookMode(vis: ArrayLike<number> | null, filterSupported: boolean): RainLookMode {
  if (vis === null || !needsDissolve(vis)) return 'off';
  return filterSupported ? 'filter' : 'fade';
}

/** Successive hulls start their re-march clocks this far apart (ms), so a fleet never marches on one frame. */
const STAGGER_MS = 37;
let staggerSeq = 0;

/**
 * One hull's drawn visibility grid over time: re-marched on the cadence,
 * eased between marches, snapped on first sight. Per view; no per-frame
 * allocation.
 */
export class HullRainVis {
  /** The drawn V grid (what the look reads). */
  readonly vis = new Float32Array(RAIN_GRID_N).fill(1);
  private readonly target = new Float32Array(RAIN_GRID_N).fill(1);
  private readonly pts = new Float64Array(2 * RAIN_GRID_N);
  private sinceMs: number;
  private fresh = true;

  constructor(phaseMs: number = (staggerSeq++ * STAGGER_MS) % L.visRefreshMs) {
    this.sinceMs = phaseMs;
  }

  /**
   * Advance by `dtMs` with the hull at (x, y, heading), `lengthU` × `beamU`,
   * seen from `eye`. Returns the drawn grid, or null with no eye (no observer
   * or no rain — the next eye snaps again).
   */
  step(eye: RainEye | null, x: number, y: number, heading: number, lengthU: number, beamU: number, dtMs: number): Float32Array | null {
    if (eye === null) {
      this.fresh = true;
      return null;
    }
    const dt = Number.isFinite(dtMs) && dtMs > 0 ? dtMs : 0;
    if (this.due(dt)) hullVisGrid(eye, x, y, heading, lengthU, beamU, this.pts, this.target);
    if (this.fresh) {
      this.vis.set(this.target);
      this.fresh = false;
      return this.vis;
    }
    const k = L.visEaseMs > 0 ? 1 - Math.exp(-dt / L.visEaseMs) : 1;
    for (let i = 0; i < RAIN_GRID_N; i++) this.vis[i] += (this.target[i] - this.vis[i]) * k;
    return this.vis;
  }

  /** Advance the re-march clock by `dt`: is a march due this frame? (always on first sight; never twice for one frame) */
  private due(dt: number): boolean {
    this.sinceMs += dt;
    if (!this.fresh && this.sinceMs < L.visRefreshMs) return false;
    this.sinceMs = this.fresh ? this.sinceMs % L.visRefreshMs : this.sinceMs - L.visRefreshMs;
    if (this.sinceMs >= L.visRefreshMs) this.sinceMs = 0; // a long gap
    return true;
  }
}
