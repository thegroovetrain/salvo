// RAIN CLUTTER ON THE SCOPE (Story 11.6 scope add, Eric 2026-11-14) — the
// radar's side of render/rainClutter.ts. Each beam step the radar marches
// (render/radar.ts `marchBeam`, one per `march.sliceRad` quantum) also asks
// this track for the clutter of the same sector from THIS instant's rain frame
// (`FogFieldView.frameAt`), the observer, a bounded range and the revolution
// index. Presentation only: no wire, no server, nothing else reads it.
//
// HOW IT SITS UNDER REAL RETURNS (max-wins): the clutter slices are a SEPARATE
// list from the radar's paint list (so they never count against the paints'
// runaway cap and can never shift a real paint out), stamped AFTER the paints
// with `stampClutter`, which writes a cell only where its intensity beats
// what the cell already holds. A real return stronger than the clutter keeps
// its cell whatever the two ages are; clutter covers only weaker returns and
// empty water. The dim mask hangs on the radar layer, so it applies to clutter
// exactly as it does to paints.
//
// THE COST BOUND (`clutterReachU`): the scope reaches 400 hm (~9,091 u), so a
// full-range sector step would visit ~26,000 lattice cells (each a shared
// density query). The clutter range is therefore the radar range, cut to the
// farthest corner of the camera's view padded by `viewPadFrac`, and cut again
// so the step's wedge holds at most `maxCellsPerStep` cells. At the default
// framing the whole screen is covered; zoomed far out, clutter is a disc of
// that budget around the own hull. The slice records are pooled: the list
// holds at most `persistSweeps` revolutions of steps (2π / `march.sliceRad`
// each) plus one — radar.ts passes `maxSlices() / 2 + 1`, halving away the
// paints' wire-echo slack, which clutter never emits — recycled, so a warm
// track allocates nothing (a record grows only past its largest step).
//
// NO CLUTTER when there is no rain frame (rain off / pre-zone), with no own
// pose (the radar marches nothing; spectate renders the radar pose-less), or
// for a non-finite input.

import { blipAlpha } from './phosphor.js';
import type { HeatGrid } from './radarHeatmap.js';
import type { MarchSlice } from './radarMarch.js';
import { emptyClutterSlice, rainClutter, type RainClutterOpts } from './rainClutter.js';
import type { FogFrame } from '@salvo/shared';

/** The camera's world rect (render/radar.ts `ViewRect`). */
export interface ClutterView {
  x: number;
  y: number;
  halfW: number;
  halfH: number;
}

/** Where the track reads the rain: `FogFieldView.frameAt` (null = no rain). */
export interface ClutterFrameSource {
  frameAt(tMs: number): FogFrame | null;
}

export interface ClutterBudget {
  maxCellsPerStep: number; // lattice cells one step's wedge may hold
  viewPadFrac: number; // the view rect grown by this fraction of its half extents
}

/**
 * Pure: the clutter range (u) for a step of `widthRad` from (ox, oy) — the
 * radar range, cut to the farthest corner of the padded `view` (when given),
 * cut so the wedge's area holds at most `maxCellsPerStep` cells of `cellU`.
 * 0 for any non-finite or non-positive input.
 */
export function clutterReachU(
  ox: number, oy: number, view: ClutterView | null, radarRange: number, widthRad: number, cellU: number, b: ClutterBudget,
): number {
  if (![ox, oy, radarRange, widthRad, cellU].every(Number.isFinite) || !(radarRange > 0) || !(widthRad > 0) || !(cellU > 0)) return 0;
  let r = radarRange;
  if (view !== null) {
    const pad = 1 + Math.max(0, b.viewPadFrac);
    const hw = view.halfW * pad;
    const hh = view.halfH * pad;
    const dx = Math.max(Math.abs(view.x - hw - ox), Math.abs(view.x + hw - ox));
    const dy = Math.max(Math.abs(view.y - hh - oy), Math.abs(view.y + hh - oy));
    const corner = Math.sqrt(dx * dx + dy * dy);
    if (Number.isFinite(corner)) r = Math.min(r, corner);
  }
  const budget = Math.max(0, b.maxCellsPerStep);
  // wedge area = ½ · width · r²  ≤  budget · cellU²
  const rBudget = Math.sqrt((2 * budget * cellU * cellU) / Math.min(widthRad, 2 * Math.PI));
  return Math.max(0, Math.min(r, rBudget));
}

/**
 * Stamp one clutter slice UNDER whatever the grid holds: a cell is written
 * only where the clutter's intensity beats the cell's (max-wins on strength,
 * any age), at the slice's own age opacity `alpha`.
 */
export function stampClutter(g: HeatGrid, s: MarchSlice, alpha: number): void {
  if (!(alpha > 0) || s.n === 0 || offGrid(g, s)) return;
  for (let k = 0; k < s.n; k++) stampCell(g, s.cells[k * 2] - g.baseGx, s.cells[k * 2 + 1] - g.baseGy, s.w[k], alpha);
}

/** Does the slice's bounding box miss the grid entirely? */
function offGrid(g: HeatGrid, s: MarchSlice): boolean {
  const x1 = g.originX + g.cols * g.cellU;
  const y1 = g.originY + g.rows * g.cellU;
  return s.maxX < g.originX || s.minX > x1 || s.maxY < g.originY || s.minY > y1;
}

/** One buffer cell (cx, cy): written only where `w` beats what it holds. */
function stampCell(g: HeatGrid, cx: number, cy: number, w: number, alpha: number): void {
  if (cx < 0 || cy < 0 || cx >= g.cols || cy >= g.rows) return;
  const i = cy * g.cols + cx;
  if (!(w > g.w[i])) return;
  g.w[i] = w;
  g.a[i] = alpha;
}

/** One beam step for the track. */
export interface ClutterStep {
  frame: FogFrame | null;
  ox: number;
  oy: number;
  from: number; // rad — the step's start bearing
  to: number; // rad — its end (to > from)
  t: number; // ms — server time, the slice's paint time
  rangeU: number; // u — from `clutterReachU`
}

/** The radar's live clutter slices: pooled, revolution-counted, time-retired. */
export class ClutterTrack {
  private readonly live: MarchSlice[] = [];
  private readonly free: MarchSlice[] = [];
  private sweep = 0;

  constructor(private readonly opts: RainClutterOpts, private readonly cap: number) {}

  /** The live slices (stamp order: oldest first). */
  get slices(): readonly MarchSlice[] {
    return this.live;
  }

  /** The revolution index the next step rolls (bumped by `wrapped`). */
  get sweepIndex(): number {
    return this.sweep;
  }

  /** The march cursor crossed bearing 0: the next steps roll a fresh revolution. */
  wrapped(): void {
    this.sweep = (this.sweep + 1) | 0;
  }

  /** March the clutter of one step; returns the cells it painted (0 = nothing enrolled). */
  step(st: ClutterStep): number {
    if (st.frame === null || !(st.rangeU > 0)) return 0;
    const rec = this.take();
    const s = rainClutter(
      { frame: st.frame, ox: st.ox, oy: st.oy, rangeU: st.rangeU, sweepIndex: this.sweep, from: st.from, to: st.to, t: st.t },
      this.opts, rec,
    );
    if (s.n === 0) {
      this.free.push(s);
      return 0;
    }
    this.live.push(s);
    return s.n;
  }

  /** Retire slices whose phosphor has faded at `now` (life `lifeMs`). */
  prune(now: number, lifeMs: number): void {
    let k = 0;
    while (k < this.live.length && !(blipAlpha(now - this.live[k].t, lifeMs) > 0)) k++;
    for (let i = 0; i < k; i++) this.free.push(this.live[i]);
    if (k > 0) this.live.splice(0, k);
  }

  /** Stamp every live slice under the grid's returns at its age opacity. */
  stamp(g: HeatGrid, now: number, lifeMs: number, alphaFloor: number): void {
    for (const s of this.live) stampClutter(g, s, blipAlpha(now - s.t, lifeMs, alphaFloor));
  }

  /** Drop every live slice (back to the pool). */
  clear(): void {
    for (const s of this.live) this.free.push(s);
    this.live.length = 0;
  }

  /** A record to fill: a free one, else the oldest live one past the cap, else a new one. */
  private take(): MarchSlice {
    const f = this.free.pop();
    if (f !== undefined) return f;
    if (this.live.length >= this.cap) return this.live.shift() as MarchSlice;
    return emptyClutterSlice(256);
  }
}
