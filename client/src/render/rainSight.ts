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
// DISTANCE HAZE (Eric 2026-11-15: the anonymous plain-hull tier is GONE): each
// point's τ also carries the shared `fogHazeDepth` of its distance from the eye
// — 0 out to the observer's effective class-and-name sight (`RainEye.sightU`),
// rising linearly to T (the cutoff) at its effective hull sight
// (`RainEye.hullSightU`), both whiteout-scaled (sim/sight.ts). A hull clear of
// rain and smoke is crisp to 200 hm and fades with the A+D look to gone at
// 350 hm. The own star-shell exemption (`eyeForHull`) and the sent-hull floor
// cover the haze like the rest of τ.
//
// SMOKE (Story 11.6 scope add, Eric 2026-11-14: SMOKE SCREEN clouds occlude
// sight like rain; the owner is blinded too): each point's τ is the rain τ PLUS
// the shared `smokeDepthAlong` of the clouds the client holds (`smokeDiscsInto`,
// radius `cloudOutlineRadius` at the render time from each cloud's stamp), at
// the `CONFIG.countermeasure` sight dials. No ownership read anywhere: your own
// cloud costs you exactly what anybody's does. The paint's own-ship halo (a
// see-through hole in the drawn haze) is presentation and stays.
//
// THE CADENCE (`HullRainVis`): 12 marches per hull of up to the whole sight
// reach at `marchStepU` are ~1 ms per hull in rain (node, 2026-11-14), so a
// hull re-marches every `visRefreshMs` (staggered per hull) and the drawn V
// eases toward the latest march (`visEaseMs`). A newly seen hull snaps.

import {
  CONFIG,
  cloudOutlineRadius,
  fogDensityAt,
  fogDepthAlong,
  fogDepthReach,
  fogHazeDepth,
  fogHullGrid,
  fogMaxDepth,
  fogSinCos,
  fogVisibility,
  smokeDepthAlong,
  type CloudSize,
  type FogFrame,
  type SmokeDisc,
  type SmokeSightConfig,
} from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { insideAnyZone } from './litZones.js';

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

/**
 * THE SENT-HULL FLOOR: the least V the best part of a hull the server sent is
 * drawn at — the vanish cutoff plus `rainLook.sentFloorMarginV`, clear of the
 * shader's vanish edge (hullDissolve.ts `dissolveAlpha` is 0 AT the cutoff).
 */
export const SENT_FLOOR_V = CONFIG.fog.sightCutoffV + L.sentFloorMarginV;

/** Who is looking through the weather: the rain frame (null = no rain), the
 *  smoke discs (absent / empty = none), the observer's world point, its
 *  effective reaches (absent = no distance haze, every plate in sight) and the
 *  observer's OWN live star-shell lit zones (absent / empty = none). */
export interface RainEye {
  frame: FogFrame | null;
  smoke?: readonly SmokeDisc[];
  /** u — the observer's effective CLASS-AND-NAME sight (`effectiveSight`): the haze starts here, and the name tag ends. */
  sightU?: number;
  /** u — the observer's effective HULL sight (`effectiveHullSight`): the haze reaches T (gone) here. */
  hullSightU?: number;
  /** The own live lit zones (render/litZones.ts `ownActiveZones`): a hull whose
   *  center is inside one is LIT FROM ABOVE — the server sends it on the zone
   *  alone (signals.ts `ownZoneCovers`), no eye line — so it gets no rain eye. */
  lit?: readonly { x: number; y: number; r: number }[];
  x: number;
  y: number;
}

/** Pure: the eye a hull centered at (x, y) is drawn through — null (V = 1) when
 *  the hull is inside one of the observer's own lit zones (lit from above). */
export function eyeForHull(eye: RainEye | null, x: number, y: number): RainEye | null {
  if (eye === null || eye.lit === undefined || eye.lit.length === 0) return eye;
  return insideAnyZone({ x, y }, eye.lit) ? null : eye;
}

/**
 * Pure: is a hull centered at (x, y) close enough for its NAME TAG (Eric
 * 2026-11-15) — within the observer's effective class-and-name sight, by
 * center distance? No eye (a spectator) or no reach on it → yes.
 */
export function plateInSight(eye: RainEye | null, x: number, y: number): boolean {
  if (eye === null || eye.sightU === undefined) return true;
  return Math.hypot(x - eye.x, y - eye.y) <= eye.sightU;
}

/** T — the optical depth at the vanish cutoff (the haze's full depth). */
const MAX_DEPTH = fogMaxDepth(CONFIG.fog);

/** The smoke sight dials (CONFIG.countermeasure). */
export const SMOKE_SIGHT: SmokeSightConfig = {
  thickness: CONFIG.countermeasure.sightThickness,
  softFrac: CONFIG.countermeasure.sightSoftFrac,
};

/** A held cloud as sight reads it: its place, its stamp time and its stamped size. */
export interface SmokeCloudLike extends CloudSize {
  x: number;
  y: number;
  t0: number; // ms — server time the cloud was made
}

/** A mutable disc (the scratch `smokeDiscsInto` fills). */
export interface SmokeDiscSlot {
  x: number;
  y: number;
  r: number;
}

/**
 * Pure, allocation-free once warm: the held clouds as sight discs at server
 * time `nowMs` — radius `cloudOutlineRadius(age, stamp)`; a cloud past its
 * stamped life, or with a non-finite stamp, is left out. Refills `pool`
 * (growing it only when more clouds are held than ever before) and sets
 * `out.length`; returns `out`. Ownership is never read.
 */
export function smokeDiscsInto(
  clouds: readonly SmokeCloudLike[], nowMs: number, pool: SmokeDiscSlot[], out: SmokeDiscSlot[],
): SmokeDiscSlot[] {
  let n = 0;
  for (const c of clouds) {
    const age = Math.max(0, nowMs - c.t0);
    if (!(age < c.lifeMs)) continue;
    const r = cloudOutlineRadius(age, c);
    if (!(r > 0) || !Number.isFinite(r)) continue;
    const slot = pool[n] ?? (pool[n] = { x: 0, y: 0, r: 0 });
    slot.x = c.x;
    slot.y = c.y;
    slot.r = r;
    out[n++] = slot;
  }
  out.length = n;
  return out;
}

/** A hull's look this frame: unfiltered, the A+D filter, or the no-WebGL plain fade. */
export type RainLookMode = 'off' | 'filter' | 'fade';

const NO_SMOKE: readonly SmokeDisc[] = [];

/**
 * Pure: V at each of the hull's sight-grid points — the hull at (cx, cy),
 * `heading` (rad, bow), `lengthU` × `beamU` — seen from `eye` (τ = rain + smoke
 * + distance haze). `pts` is a
 * scratch of at least 2 × RAIN_GRID_N; `out` receives RAIN_GRID_N values in
 * [0, 1]. Returns `out`.
 */
export function hullVisGrid(
  eye: RainEye, cx: number, cy: number, heading: number, lengthU: number, beamU: number,
  pts: Float64Array, out: Float32Array,
): Float32Array {
  const n = fogHullGrid(cx, cy, heading, lengthU, beamU, RAIN_GRID_COLS, RAIN_GRID_ROWS, pts);
  const smoke = eye.smoke ?? NO_SMOKE;
  for (let i = 0; i < n; i++) {
    const px = pts[2 * i];
    const py = pts[2 * i + 1];
    const rain = eye.frame === null ? 0 : fogDepthAlong(eye.frame, eye.x, eye.y, px, py);
    const tau = rain + smokeDepthAlong(smoke, eye.x, eye.y, px, py, SMOKE_SIGHT) + hazeDepth(eye, px, py);
    out[i] = fogVisibility(tau, CONFIG.fog);
  }
  return floorSentHull(out, n);
}

/** The distance haze from `eye` to (px, py): 0 without both reaches on the eye. */
function hazeDepth(eye: RainEye, px: number, py: number): number {
  if (eye.sightU === undefined || eye.hullSightU === undefined) return 0;
  return fogHazeDepth(Math.hypot(px - eye.x, py - eye.y), eye.sightU, eye.hullSightU, MAX_DEPTH);
}

/**
 * Pure, in place: THE FLOOR for a hull the server SENT. The server held it, so
 * the client must never draw it fully gone on a timing or cell difference: if
 * every part's V is below `SENT_FLOOR_V` (the cutoff plus a margin that clears
 * the shader's vanish edge), the BEST part is raised to it (the others stay).
 * Returns `out`.
 */
export function floorSentHull(out: Float32Array, n: number = out.length): Float32Array {
  let best = 0;
  for (let i = 1; i < n; i++) if (out[i] > out[best]) best = i;
  if (n > 0 && out[best] < SENT_FLOOR_V) out[best] = SENT_FLOOR_V;
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
 * Pure: the filter on/off decision. No grid (no observer, or lit from above) or a clear
 * grid → 'off' (the hull draws exactly as before, at zero cost); otherwise the
 * A+D filter where it can run, else the plain fade by the mean V.
 */
export function rainLookMode(vis: ArrayLike<number> | null, filterSupported: boolean): RainLookMode {
  if (vis === null || !needsDissolve(vis)) return 'off';
  return filterSupported ? 'filter' : 'fade';
}

/**
 * Pure: V at ONE point seen from `eye` — τ = rain + smoke + distance haze,
 * the term a hull's grid point at that spot gets (`hullVisGrid`), floored at
 * `SENT_FLOOR_V` (the server SENT the thing, so it is never drawn fully
 * gone). The CRATE's visibility (2026-11-20, epic-12 amendment 10: a crate is
 * seen "exactly like a hull" — one small mark, one alpha, asked of its centre,
 * the point the server's `crateHeld` gates it on).
 */
export function pointVisibility(eye: RainEye, px: number, py: number): number {
  const rain = eye.frame === null ? 0 : fogDepthAlong(eye.frame, eye.x, eye.y, px, py);
  const tau = rain + smokeDepthAlong(eye.smoke ?? NO_SMOKE, eye.x, eye.y, px, py, SMOKE_SIGHT) + hazeDepth(eye, px, py);
  return Math.max(SENT_FLOOR_V, fogVisibility(tau, CONFIG.fog));
}

/** Successive hulls start their re-march clocks this far apart (ms), so a fleet never marches on one frame. */
const STAGGER_MS = 37;
let staggerSeq = 0;

/** The re-march cadence of one drawn thing: due on first sight, then every
 *  `visRefreshMs`, never twice for one frame. */
class RefreshClock {
  fresh = true;
  private sinceMs: number;

  constructor(phaseMs: number = (staggerSeq++ * STAGGER_MS) % L.visRefreshMs) {
    this.sinceMs = phaseMs;
  }

  /** Advance by `dt`: is a march due this frame? */
  due(dt: number): boolean {
    this.sinceMs += dt;
    if (!this.fresh && this.sinceMs < L.visRefreshMs) return false;
    this.sinceMs = this.fresh ? this.sinceMs % L.visRefreshMs : this.sinceMs - L.visRefreshMs;
    if (this.sinceMs >= L.visRefreshMs) this.sinceMs = 0; // a long gap
    return true;
  }
}

/** The per-frame ease share toward the latest march over `dt` ms. */
function easeShare(dt: number): number {
  return L.visEaseMs > 0 ? 1 - Math.exp(-dt / L.visEaseMs) : 1;
}

const cleanDt = (dtMs: number): number => (Number.isFinite(dtMs) && dtMs > 0 ? dtMs : 0);

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
  private readonly clock: RefreshClock;

  constructor(phaseMs?: number) {
    this.clock = new RefreshClock(phaseMs);
  }

  /**
   * Advance by `dtMs` with the hull at (x, y, heading), `lengthU` × `beamU`,
   * seen from `eye`. Returns the drawn grid, or null with no eye (no observer,
   * or the hull lit from above by an own star shell —
   * the next eye snaps again).
   */
  step(rawEye: RainEye | null, x: number, y: number, heading: number, lengthU: number, beamU: number, dtMs: number): Float32Array | null {
    const eye = eyeForHull(rawEye, x, y);
    if (eye === null) {
      this.clock.fresh = true;
      return null;
    }
    const dt = cleanDt(dtMs);
    if (this.clock.due(dt)) hullVisGrid(eye, x, y, heading, lengthU, beamU, this.pts, this.target);
    if (this.clock.fresh) {
      this.vis.set(this.target);
      this.clock.fresh = false;
      return this.vis;
    }
    const k = easeShare(dt);
    for (let i = 0; i < RAIN_GRID_N; i++) this.vis[i] += (this.target[i] - this.vis[i]) * k;
    return floorSentHull(this.vis); // easing between two floored grids can dip every part under the floor
  }
}

/**
 * One POINT's drawn visibility over time (a crate, 2026-11-20): `HullRainVis`
 * for a single point — the same cadence (one march per `visRefreshMs`,
 * staggered), the same ease, snapped on first sight. No allocation.
 */
export class PointRainVis {
  /** The drawn V. */
  v = 1;
  private target = 1;
  private readonly clock: RefreshClock;

  constructor(phaseMs?: number) {
    this.clock = new RefreshClock(phaseMs);
  }

  /** Advance by `dtMs` with the point at (x, y) seen from `eye`. Returns the
   *  drawn V — 1 with no eye (a spectator, or lit from above by an own star
   *  shell; the next eye snaps again). */
  step(rawEye: RainEye | null, x: number, y: number, dtMs: number): number {
    const eye = eyeForHull(rawEye, x, y);
    if (eye === null) {
      this.clock.fresh = true;
      this.v = 1;
      return 1;
    }
    const dt = cleanDt(dtMs);
    if (this.clock.due(dt)) this.target = pointVisibility(eye, x, y);
    if (this.clock.fresh) {
      this.clock.fresh = false;
      this.v = this.target;
      return this.v;
    }
    this.v += (this.target - this.v) * easeShare(dt);
    return this.v; // between two floored values: never under the floor
  }
}

// --- the radar's eye-reach fan through rain AND smoke ---------------------------

/** Does the ray (ox, oy) + (ux, uy)·t, t ∈ [0, range], cross disc `c`? */
function rayCrosses(c: SmokeDisc, ox: number, oy: number, ux: number, uy: number, range: number): boolean {
  if (!(c.r > 0)) return false;
  const px = ox - c.x;
  const py = oy - c.y;
  const b = px * ux + py * uy;
  const disc = b * b - (px * px + py * py - c.r * c.r);
  if (!(disc > 0)) return false;
  const s = Math.sqrt(disc);
  return -b + s > 0 && -b - s < range;
}

/**
 * The reach along unit (ux, uy) where rain τ + smoke τ first reaches `maxDepth`,
 * capped at `range`: the rain's slots of `marchStepU` laid from the observer
 * (as the shared march), the smoke's cumulative depth (`smokeDepthAlong`) at
 * each slot end, linear inside the slot that fills.
 */
function combinedReach(
  frame: FogFrame | null, smoke: readonly SmokeDisc[], ox: number, oy: number, ux: number, uy: number,
  range: number, maxDepth: number,
): number {
  const stepCfg = frame === null ? 0 : frame.field.cfg.marchStepU;
  const step = stepCfg > 0 ? stepCfg : CONFIG.fog.marchStepU;
  let rain = 0;
  let prev = 0;
  for (let d0 = 0; d0 < range; d0 += step) {
    const d1 = Math.min(range, d0 + step);
    if (frame !== null) rain += fogDensityAt(frame, ox + ux * (d0 + step / 2), oy + uy * (d0 + step / 2)) * (d1 - d0);
    const tot = rain + smokeDepthAlong(smoke, ox, oy, ox + ux * d1, oy + uy * d1, SMOKE_SIGHT);
    if (tot >= maxDepth) return d0 + ((d1 - d0) * (maxDepth - prev)) / (tot - prev);
    prev = tot;
  }
  return range;
}

const FSC = { s: 0, c: 0 };
const crossing: SmokeDisc[] = [];

/**
 * Pure (module scratch, no allocation once warm): the eye's reach through rain
 * AND smoke on `out.length` bearings (ray k at k·2π/N, world axes) — per ray,
 * where rain τ + smoke τ from the observer first reaches `maxDepth`, capped at
 * `range`. A ray that crosses no cloud is exactly the shared rain reach
 * (`fogDepthReach`, or `range` with no rain); only the rays a cloud lies on pay
 * the combined march. A non-positive or non-finite `range`, or a non-positive
 * `maxDepth`, fills 0 (an infinite range fills itself). Returns `out`.
 */
export function eyeReachFanInto(
  frame: FogFrame | null, smoke: readonly SmokeDisc[], ox: number, oy: number, range: number, maxDepth: number,
  out: Float32Array,
): Float32Array {
  if (!(range > 0) || !Number.isFinite(range) || !(maxDepth > 0)) return out.fill(range > 0 && maxDepth > 0 ? range : 0);
  const rain = frame !== null && frame.on ? frame : null;
  const n = out.length;
  for (let k = 0; k < n; k++) out[k] = rayReach(rain, smoke, ox, oy, (k * 2 * Math.PI) / n, range, maxDepth);
  return out;
}

/** One bearing of `eyeReachFanInto`: the combined march if a cloud lies on the ray, else the rain reach. */
function rayReach(
  rain: FogFrame | null, smoke: readonly SmokeDisc[], ox: number, oy: number, angle: number, range: number, maxDepth: number,
): number {
  fogSinCos(angle, FSC);
  crossing.length = 0;
  for (const c of smoke) if (rayCrosses(c, ox, oy, FSC.c, FSC.s, range)) crossing.push(c);
  if (crossing.length > 0) return combinedReach(rain, crossing, ox, oy, FSC.c, FSC.s, range, maxDepth);
  return rain === null ? range : fogDepthReach(rain, ox, oy, angle, range, maxDepth);
}
