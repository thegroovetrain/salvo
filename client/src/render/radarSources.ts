// THE TWO WEATHER-ISH RETURN SOURCES (Story 4.10, amendments 128 + 130): SEA
// CLUTTER and the STORM WALL. Pure math, no Pixi — render/radar.ts opens,
// advances and prunes these paints exactly as it does islands, and this module
// only decides what they look like.
//
// THEY ARE ORDINARY PAINTS. Everything the grammar already guarantees applies to
// them unchanged, and none of it is re-argued here:
//
//   • A PAINT IS A HISTORICAL RECORD (amendment 83). Both records freeze the
//     OBSERVER at creation — and the storm additionally freezes the ring's
//     CENTRE AND RADIUS — so a wall painted while the ring was at 900u keeps
//     showing the wall at 900u as the ring closes past it, and a clutter haze
//     stays where the ship was when the beam swept it. Nothing here is ever
//     re-evaluated against live state; the only per-frame change is alpha.
//
//   • NOTHING VIEWPORT-DERIVED REACHES CREATION OR RETIREMENT (amendment 97).
//     Not one function in this file takes a camera, a zoom or a viewport.
//
//   • THE SWEEP IS THE ONLY THING THAT PAINTS. Both sources are arc-gated by the
//     same `from`/`to`/`full` bookkeeping an island paint carries, so the haze
//     and the wall fill in BEHIND THE BEAM rather than appearing whole.
//
//   • COLOUR IS INTENSITY, NEVER CATEGORY (amendment 105). Neither source has a
//     colour: each produces one intensity through the ONE model
//     (render/radarFalloff.ts) — coefficient x falloff-by-geometry x its own
//     shape term — and the bands do the rest.
//
// WHY THE STORM PAINTS ITS WALL AND NOT ITS AREA (amendment 128). The volume
// return falls off as 1/d^2, which is shallow enough to stay legible clear
// across the map: an AREA return would therefore own roughly half the scope at
// full strength late-match and bury every contact inside it, against the epic's
// own guardrail that "information noise must never bury the hunt". So the return
// is the closing WALL — a fixed-thickness band on the live ring. Both the whole
// outside-the-ring region and deferring the storm entirely were put to Eric and
// REJECTED. It discloses nothing: ring geometry is on the wire from its reveal
// beat (Story 3.1), so this is presentation of data the client already holds,
// exactly the posture island returns have held since amendment 69.
//
// AND ONLY THE LIVE RING. The dashed next-ring telegraph is a CHART ANNOTATION,
// not a physical object, and must never return an echo — there is nothing out
// there yet to reflect off. `openStorm` takes the live ring alone; the caller
// never passes `ZoneView.next`.
//
// WHY CLUTTER CAN NEVER MASK ANYTHING (amendment 130). Sea clutter is TEXTURE
// AND NOTHING ELSE. Its coefficient is bounded so that its peak stays strictly
// below `bands[0].at` even at the noise multiplier's most favourable draw, which
// makes "a real return always outranks clutter under `writeCell`'s max-wins
// rule" true by arithmetic rather than by hope. Clutter strong enough to swallow
// weak returns close in was put to Eric as a real mechanic and DECLINED — the
// effect only bites inside truesight, where the hull is already visible out the
// window, so it buys a readability cost and almost no gameplay. Raising the
// coefficient is a DESIGN change, not a tuning change; the bound is asserted in
// __tests__/radarHeatmap.test.ts.

import { wrapPositive, type Vec2 } from '@salvo/shared';
import { clamp01 } from '../util/math.js';
import { blipAlpha } from './phosphor.js';
import { SURFACE, VOLUME, attenuation } from './radarFalloff.js';
import {
  cellCentre,
  cellOf,
  noiseMul,
  stampCover,
  sweepCrossed,
  writeCell,
  type CoverCell,
  type HeatGrid,
  type HeatmapOpts,
  type RadarPaint,
  type RasterCtx,
  type ReturnModelOpts,
} from './radarHeatmap.js';

/**
 * The bearing whose crossing opens a fresh weather paint — one per beam
 * revolution, for each source.
 *
 * Both sources SURROUND the observer (the haze is a disc about the ship; the
 * wall is a ring the ship is normally inside), so unlike an island there is no
 * bearing span to test `arcOverlaps` against: the answer would always be true.
 * Anchoring the cycle on a fixed bearing gives the same behaviour an island gets
 * for free — the paint opens once per revolution, its arc grows behind the beam,
 * and the previous revolution's paint decays underneath it.
 */
const WEATHER_ANCHOR = 0;

/** Fraction of full strength the storm wall keeps at the seaward/landward EDGE
 *  of its band, so the wall reads as a wall with soft shoulders rather than as a
 *  drawn line. The spine (the live ring radius exactly) is full strength. */
const STORM_EDGE = 0.35;

/**
 * Hard cap on baked storm-band cells — a runaway guard, never the thing that
 * trims a real wall.
 *
 * The worst LEGITIMATE case is the endgame: a terminal ring the observer sits
 * inside, so the whole circumference is in range. At the shipped numbers that is
 * `2π × 660 × 60 / 6²` ≈ 6,900 cells, so 8,000 leaves the cap slack. A ring
 * bigger than the scope is cheaper, not dearer — only the arc within radar range
 * is ever walked.
 */
const STORM_MAX_CELLS = 8000;

/** The live storm ring, structurally — the `ZoneView.cur` fields this needs and
 *  nothing else, so this module never imports the zone layer. */
export interface StormRing {
  cx: number;
  cy: number;
  r: number;
}

// --- 1. sea clutter -------------------------------------------------------------

/**
 * A near-field sea-clutter haze: a bounded disc about the OBSERVER AS FROZEN AT
 * PAINT TIME, stamped procedurally.
 *
 * No baked cover list, deliberately: the disc is small (a couple of thousand
 * cells) and, being centred on the ship, is the one paint that is always on
 * screen — so a bake would allocate a list every revolution to save nothing. The
 * per-cell values are still fully determined by the frozen record (`ox`/`oy`,
 * `seed`, the arc), which is what amendment 83 actually requires; "frozen" is a
 * property of the INPUTS, not of the storage.
 */
export interface ClutterPaint {
  kind: 'clutter';
  /** Observer position AT PAINT TIME — the haze does not follow the ship. */
  ox: number;
  oy: number;
  /** Beam bearing when this paint opened, and where the beam has reached. */
  from: number;
  to: number;
  /** True once the beam has swept a whole revolution across it. */
  full: boolean;
  t: number;
  seed: number;
}

/** Clutter's intensity at a range, before noise: the tiny surface coefficient on
 *  the SURFACE curve. The near-ship CONCENTRATION falls out of that pairing
 *  (amendment 130) rather than out of a hand-placed radius. */
export function clutterIntensity(dist: number, m: ReturnModelOpts): number {
  return clamp01(m.clutter * attenuation(dist, m.surfaceRef, SURFACE, m.floor));
}

/** Open a clutter paint from the observer at this instant. */
export function openClutter(obs: Vec2, from: number, to: number, t: number, seed: number): ClutterPaint {
  return { kind: 'clutter', ox: obs.x, oy: obs.y, from, to, full: false, t, seed };
}

/**
 * Stamp the haze: every cell of the frozen disc whose bearing the beam has
 * reached. `writeCell` is max-wins, so a clutter cell can only ever lose to a
 * real return — and by amendment 130's bound it is below the visible threshold
 * in any case.
 *
 * THIS RUNS EVERY FRAME FOR EVERY LIVE HAZE, so the loop is written for that: a
 * SQUARED-distance reject on raw scalars rejects the ~21% of the bounding box
 * outside the disc before anything transcendental happens, and the survivors pay
 * a `sqrt` rather than `Math.hypot` (which is far slower for the same answer
 * here — there is no overflow range to protect). The `!p.full` short-circuit
 * keeps the `atan2` off the path entirely for a completed haze, which is what
 * two of every three live hazes are.
 */
export function stampClutter(g: HeatGrid, p: ClutterPaint, alpha: number, o: HeatmapOpts): void {
  const m = o.model;
  const reach = m.clutterRangeU;
  if (!(reach > 0)) return;
  const reach2 = reach * reach;
  const span = wrapPositive(p.to - p.from);
  const gx0 = cellOf(p.ox - reach, g.cellU);
  const gx1 = cellOf(p.ox + reach, g.cellU);
  const gy1 = cellOf(p.oy + reach, g.cellU);
  for (let gy = cellOf(p.oy - reach, g.cellU); gy <= gy1; gy++) {
    const wy = cellCentre(gy, g.cellU) - p.oy;
    for (let gx = gx0; gx <= gx1; gx++) {
      const wx = cellCentre(gx, g.cellU) - p.ox;
      const d2 = wx * wx + wy * wy;
      if (d2 > reach2) continue;
      if (!p.full && wrapPositive(Math.atan2(wy, wx) - p.from) > span) continue;
      const i = clutterIntensity(Math.sqrt(d2), m) * noiseMul(p.seed, gx, gy, o.noise);
      writeCell(g, gx, gy, i, alpha);
    }
  }
}

// --- 2. the storm wall ----------------------------------------------------------

/**
 * The closing storm wall as the beam last saw it: a fixed-thickness band on the
 * ring's radius AT PAINT TIME, baked into a cover list.
 *
 * Baked rather than procedural (the opposite call from clutter, for the opposite
 * reason): the band is a thin arc of a potentially huge circle, so walking it
 * parametrically once per revolution is far cheaper than testing every cell of
 * the radar disc every frame — and baking is also what freezes the ring geometry
 * the paint is a record of.
 */
export interface StormPaint {
  kind: 'storm';
  from: number;
  to: number;
  full: boolean;
  t: number;
  /** Baked band cells (absolute world cells + frozen intensity + bearing). */
  cover: readonly CoverCell[];
}

/** The wall's intensity at one point: the storm coefficient on the VOLUME curve,
 *  shaped across the band so the spine is strongest. */
function stormIntensity(dist: number, off: number, m: ReturnModelOpts): number {
  const profile = 1 - (1 - STORM_EDGE) * off * off;
  return clamp01(m.storm * profile * attenuation(dist, m.volumeRef, VOLUME, m.floor));
}

/**
 * Half the angular window of the ring that lies within `radarRange` of `obs`, or
 * null when none of it does; `Math.PI` when all of it does.
 *
 * Law of cosines on the observer→centre→point triangle. This is a pure COMPUTE
 * bound — it decides which part of the ring is worth walking, and the range gate
 * is applied exactly per cell afterwards — so a slack answer costs time and
 * never correctness.
 */
function ringWindow(d: number, rho: number, radarRange: number): number | null {
  if (!(d > 0) || !(rho > 0)) return radarRange >= Math.abs(rho - d) ? Math.PI : null;
  const cos = (d * d + rho * rho - radarRange * radarRange) / (2 * d * rho);
  if (cos <= -1) return Math.PI;
  if (cos >= 1) return null;
  return Math.acos(cos);
}

/**
 * Row stride of the numeric dedup key. A world cell index is bounded by
 * `mapRadius / cellU` (a few hundred), so `gy * KEY_ROW + gx` is injective for
 * anything the generator can produce and costs nothing next to a string key —
 * which mattered: the walk visits each cell three or four times.
 */
const KEY_ROW = 1_000_000;

/**
 * Walk one radius of the band across the in-range angular window, emitting cells.
 *
 * The step is half a CELL OF ARC — derived from the radius, not a fixed angle,
 * because a fixed angle would leave gaps in a big ring and waste thousands of
 * samples on a small one.
 *
 * THE BEARING IS COMPUTED ONLY WHEN A CELL IS ACTUALLY STORED. Adjacent samples
 * land in the same cell three or four times over, so computing `b` eagerly meant
 * three `atan2` calls out of four thrown away — the single biggest cost in the
 * bake, and this is a bake that must not stutter the frame it lands on.
 */
function walkRing(
  cells: Map<number, CoverCell>,
  ring: StormRing,
  rho: number,
  ctx: { obs: Vec2; radarRange: number; seed: number; o: HeatmapOpts; half: number },
): void {
  const ox = ctx.obs.x;
  const oy = ctx.obs.y;
  const win = ringWindow(Math.hypot(ox - ring.cx, oy - ring.cy), rho, ctx.radarRange);
  if (win === null) return;
  const base = Math.atan2(oy - ring.cy, ox - ring.cx);
  const step = ctx.o.cellU / (2 * rho);
  if (!(step > 0)) return;
  const range2 = ctx.radarRange * ctx.radarRange;
  const off = ctx.half > 0 ? Math.abs(rho - ring.r) / ctx.half : 0;
  for (let a = -win; a <= win; a += step) {
    const x = ring.cx + Math.cos(base + a) * rho;
    const y = ring.cy + Math.sin(base + a) * rho;
    const rx = x - ox;
    const ry = y - oy;
    const d2 = rx * rx + ry * ry;
    if (d2 > range2) continue;
    const gx = cellOf(x, ctx.o.cellU);
    const gy = cellOf(y, ctx.o.cellU);
    const key = gy * KEY_ROW + gx;
    const prev = cells.get(key);
    const i = stormIntensity(Math.sqrt(d2), off, ctx.o.model) * noiseMul(ctx.seed, gx, gy, ctx.o.noise);
    if (i > 0 && (prev === undefined || i > prev.i)) {
      cells.set(key, { gx, gy, i, b: Math.atan2(ry, rx) });
    }
  }
}

/**
 * Bake the band: concentric walks from the inner edge to the outer edge of the
 * wall, clipped to radar range from the FROZEN observer.
 *
 * Everything a cell will ever read — its intensity, its bearing, whether it is
 * in range at all — is decided here, once, and the ring's centre and radius are
 * frozen by construction because they are only ever read inside this call.
 */
export function buildStormBand(
  ring: StormRing,
  obs: Vec2,
  radarRange: number,
  seed: number,
  o: HeatmapOpts,
): CoverCell[] {
  const half = o.model.stormBandU / 2;
  // FINITENESS IS LOAD-BEARING, not defensive: the radial walk below advances by
  // a fixed step, so a non-finite radius or centre would give `rho + step === rho`
  // and spin forever inside a render frame. A ring the client cannot describe
  // bakes nothing and the scope simply carries no wall that revolution.
  if (!Number.isFinite(ring.r + ring.cx + ring.cy)) return [];
  if (!(ring.r > 0) || !(half > 0) || !(radarRange > 0)) return [];
  const cells = new Map<number, CoverCell>();
  const ctx = { obs, radarRange, seed, o, half };
  const step = Math.max(o.cellU / 2, 1);
  for (let rho = Math.max(1, ring.r - half); rho <= ring.r + half; rho += step) {
    walkRing(cells, ring, rho, ctx);
    if (cells.size > STORM_MAX_CELLS) break;
  }
  return [...cells.values()];
}

/** Open a storm paint for the LIVE ring, or null when there is nothing in range
 *  to paint (which is the ordinary case early in a match, when the wall is the
 *  map boundary and the scope is nowhere near it). */
export function openStorm(
  ring: StormRing,
  obs: Vec2,
  radarRange: number,
  from: number,
  to: number,
  t: number,
  seed: number,
  o: HeatmapOpts,
): StormPaint | null {
  const cover = buildStormBand(ring, obs, radarRange, seed, o);
  if (cover.length === 0) return null;
  return { kind: 'storm', from, to, full: false, t, cover };
}

/** Stamp the wall — the baked cover list under its arc gate, the same primitive
 *  an island paint uses. */
export function stampStorm(g: HeatGrid, p: StormPaint, alpha: number): void {
  stampCover(g, p.cover, p.from, p.to, p.full, alpha);
}

// --- 3. the frame ---------------------------------------------------------------

/** Has the beam just crossed the bearing that opens a fresh weather paint?
 *  Delegates to the grammar's ONE crossing test (half-open in the direction of
 *  travel, and a stalled beam crosses nothing) — a second implementation of the
 *  sweep window is exactly the drift the shared helper exists to prevent. */
export function weatherCycled(from: number, to: number): boolean {
  return sweepCrossed(from, to, WEATHER_ANCHOR);
}

/**
 * Stamp the weather paints of one frame — the companion pass to
 * `rasterize` (render/radarHeatmap.ts), over the SAME list.
 *
 * Two passes rather than one dispatch, because that is what keeps the module
 * dependency one-way: this file imports the grid primitives at runtime, and
 * radarHeatmap.ts imports only the SHAPE of these two paints (an erased
 * `import type`). Each module stamps the kinds it declares, and neither can
 * silently grow a cycle.
 */
export function rasterizeWeather(
  g: HeatGrid,
  paints: readonly RadarPaint[],
  ctx: RasterCtx,
): void {
  for (const p of paints) {
    if (p.kind !== 'clutter' && p.kind !== 'storm') continue;
    const alpha = blipAlpha(ctx.now - p.t, ctx.lifeMs, ctx.alphaFloor);
    if (alpha <= 0) continue;
    if (p.kind === 'clutter') stampClutter(g, p, alpha, ctx.opts);
    else stampStorm(g, p, alpha);
  }
}
