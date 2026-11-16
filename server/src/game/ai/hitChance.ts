// THE HIT CHANCE (Story 11.9, Eric 2026-11-16, rulings R1–R4): the chance
// that ONE main-battery shell lands inside the target's outline, as the bot
// can know it before it clicks.
//
// WHAT IS COUNTED (R2): two independent errors around the bot's LEAD point —
//   - its competence WOBBLE: tacticKit `scatterOffset`'s uniform disc, radius
//     `CONFIG.bots.gunAimScatterU × range / aimScatterRefU`;
//   - the REAL DISPERSION: shared `dispersedPoint`'s truncated bell on the
//     `dispersionAxes(range)` ellipse, its long axis on the line of fire.
// The target's outline sits at the lead point. The held, already-drawn offset
// is NOT used: the bot knows its skill, not its own error. Range is the held
// aim distance from the hull centre (orchestrator ruling).
//
// THE TARGET (R3, amended 2026-11-16): a contact with a known class AND
// heading is its real hull silhouette at its heading; a known class with no
// heading (a remembered class on a radar paint) is THAT hull SIDE-ON; only a
// contact with no class is judged SIDE-ON as the hull with the smallest
// silhouette area of SHIP_CLASS_IDS (the blip model — the hard case). The
// main-battery band (ai/doctrine.ts) reads the same model, so the band and
// the fire check never disagree on the target.
//
// THE QUADRATURE. A fixed Kronecker lattice of LATTICE_N points in the 4-D
// unit cube (the generalized golden-ratio R4 sequence — deterministic, no
// rng) pushed through the SAME inverse laws the samplers use: the wobble's
// radius √u and uniform angle (scatterOffset), the dispersion's shared
// `bellRadius(u, sigmas)` and uniform angle (dispersedPoint). Every point
// carries equal weight; the chance is the share of landings inside the
// outline. Above the dispersion floor every landing offset is range × a fixed
// vector, so for an outline star-shaped about its centre the chance is
// exactly non-increasing in range (the tests check it per class).
//
// SYMMETRY. Both error laws are invariant under a reflection across the line
// of fire and under a half turn, so the chance depends only on the target's
// aspect folded into [0°, 90°] (0 = end-on, 90 = side-on).
//
// COST. Memoized by (dials, model, aspect bucket, range bucket): a bot's
// per-tick question is a Map lookup once its cell has been met. Pure apart
// from the module-level memo (a cache of a pure function). Server-only: the
// transcendentals here never touch a client. No `world.js`.

import {
  CONFIG,
  SHIP_CLASS_IDS,
  bellRadius,
  dispersionAxes,
  hmToU,
  hullSilhouette,
  pointInPolygon,
  polygonArea,
  transformPolygon,
  type DispersionCfg,
  type HullId,
  type Vec2,
} from '@salvo/shared';

/** The dials the chance reads (CONFIG's, unless a caller passes its own). */
export interface HitChanceCfg {
  dispersion: DispersionCfg;
  /** u — the guns' wobble disc radius at `aimScatterRefU`. */
  gunAimScatterU: number;
  /** u — the range the wobble is quoted at. */
  aimScatterRefU: number;
}

/** The live dials (read at the call, so a harness arm moves them). */
export function liveHitChanceCfg(): HitChanceCfg {
  return {
    dispersion: CONFIG.dispersion,
    gunAimScatterU: CONFIG.bots.gunAimScatterU,
    aimScatterRefU: CONFIG.bots.aimScatterRefU,
  };
}

/** Lattice points (equal weights). */
const LATTICE_N = 4096;
/** u — the range bucket of the memo (2 hm). */
export const RANGE_BUCKET_U = hmToU(2);
/** rad — the aspect bucket of the memo (5°). */
const ASPECT_BUCKET = (5 * Math.PI) / 180;
/** rad — side-on: the hull's long axis across the line of fire. */
export const SIDE_ON = Math.PI / 2;

/** The R4 Kronecker steps: 1/φ₄^i, φ₄ the positive root of x⁵ = x + 1. */
function kroneckerSteps(dims: number): number[] {
  let g = 2;
  for (let i = 0; i < 64; i += 1) g = Math.pow(1 + g, 1 / (dims + 1));
  return Array.from({ length: dims }, (_, i) => 1 / Math.pow(g, i + 1));
}

/** The lattice in [0,1)^4, column-wise. */
const UNIT = ((): Float64Array[] => {
  const steps = kroneckerSteps(4);
  const cols = steps.map(() => new Float64Array(LATTICE_N));
  for (let n = 0; n < LATTICE_N; n += 1) {
    for (let d = 0; d < 4; d += 1) {
      const v = 0.5 + (n + 1) * steps[d];
      cols[d][n] = v - Math.floor(v);
    }
  }
  return cols;
})();

/** The unit wobble (√u radius, uniform angle) and the unit dispersion
 *  (bell radius, uniform angle; x along the line of fire, y across). */
interface Lattice {
  wx: Float64Array;
  wy: Float64Array;
  dx: Float64Array;
  dy: Float64Array;
}

const TAU = 2 * Math.PI;

/** Unit wobble — tacticKit scatterOffset's law. Fixed. */
const WOBBLE = ((): Pick<Lattice, 'wx' | 'wy'> => {
  const wx = new Float64Array(LATTICE_N);
  const wy = new Float64Array(LATTICE_N);
  for (let n = 0; n < LATTICE_N; n += 1) {
    const r = Math.sqrt(UNIT[0][n]);
    const a = TAU * UNIT[1][n];
    wx[n] = Math.cos(a) * r;
    wy[n] = Math.sin(a) * r;
  }
  return { wx, wy };
})();

/** Unit dispersion per `sigmas` (dispersedPoint's law via the shared bellRadius). */
const BELL_BY_SIGMAS = new Map<number, Lattice>();

function latticeFor(sigmas: number): Lattice {
  const hit = BELL_BY_SIGMAS.get(sigmas);
  if (hit !== undefined) return hit;
  const dx = new Float64Array(LATTICE_N);
  const dy = new Float64Array(LATTICE_N);
  for (let n = 0; n < LATTICE_N; n += 1) {
    const r = bellRadius(UNIT[2][n], sigmas);
    const a = TAU * UNIT[3][n];
    dx[n] = r * Math.cos(a);
    dy[n] = r * Math.sin(a);
  }
  const out = { ...WOBBLE, dx, dy };
  BELL_BY_SIGMAS.set(sigmas, out);
  return out;
}

/** The outline's bounding box (a cheap reject before the polygon test). */
function boxOf(poly: readonly Vec2[]): [number, number, number, number] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of poly) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return [x0, y0, x1, y1];
}

/** The landing share inside `poly` (fire frame) for the given error sizes. */
function shareInside(poly: readonly Vec2[], lat: Lattice, along: number, across: number, wobble: number): number {
  const [x0, y0, x1, y1] = boxOf(poly);
  const p = { x: 0, y: 0 };
  let inside = 0;
  for (let n = 0; n < LATTICE_N; n += 1) {
    p.x = along * lat.dx[n] + wobble * lat.wx[n];
    p.y = across * lat.dy[n] + wobble * lat.wy[n];
    if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
    if (pointInPolygon(p, poly)) inside += 1;
  }
  return inside / LATTICE_N;
}

/**
 * THE CHANCE, unmemoized: one shell at `rangeU` against a hull whose LOCAL
 * outline (bow at +x, centred) is `outline`, its heading `aspectRad` relative
 * to the line of fire (0 = end-on, π/2 = side-on). In [0, 1]; a non-finite
 * or negative range, a non-finite aspect or a degenerate outline reads 0.
 */
export function hitChance(rangeU: number, outline: readonly Vec2[], aspectRad: number, cfg: HitChanceCfg = liveHitChanceCfg()): number {
  if (!Number.isFinite(rangeU) || rangeU < 0 || !Number.isFinite(aspectRad) || outline.length < 3) return 0;
  const { alongU, acrossU } = dispersionAxes(rangeU, cfg.dispersion);
  const wobble = (cfg.gunAimScatterU * rangeU) / cfg.aimScatterRefU;
  if (!Number.isFinite(wobble) || wobble < 0) return 0;
  const poly = transformPolygon(outline, 0, 0, aspectRad);
  const share = shareInside(poly, latticeFor(cfg.dispersion.sigmas), alongU, acrossU, wobble);
  return Number.isFinite(share) ? share : 0;
}

/** The R3 blip model: the hull with the smallest silhouette area. */
export const BLIP_CLASS: HullId = SHIP_CLASS_IDS.reduce((best, id) =>
  Math.abs(polygonArea(hullSilhouette(id))) < Math.abs(polygonArea(hullSilhouette(best))) ? id : best,
);

/** An aspect folded into [0, π/2] (the two symmetries in the header). */
export function foldAspect(rel: number): number {
  const a = ((rel % Math.PI) + Math.PI) % Math.PI;
  return a > Math.PI / 2 ? Math.PI - a : a;
}

/** One memo per dial set (a harness arm gets its own). */
const MEMO = new Map<string, Map<number, number>>();

function signatureOf(cfg: HitChanceCfg): string {
  const d = cfg.dispersion;
  return `${d.alongFrac}|${d.acrossFrac}|${d.floorU}|${d.sigmas}|${cfg.gunAimScatterU}|${cfg.aimScatterRefU}`;
}

function memoOf(sig: string): Map<number, number> {
  let m = MEMO.get(sig);
  if (m === undefined) {
    m = new Map();
    MEMO.set(sig, m);
  }
  return m;
}

/** A hull class for the memo, or the blip model for none. */
function modelOf(cls: HullId | null): HullId {
  return cls ?? BLIP_CLASS;
}

/**
 * THE CHANCE for a hull CLASS (null = the R3 blip model, side-on whatever the
 * aspect given), memoized on the nearest 2 hm range bucket and 5° aspect
 * bucket — the value IS the chance at the bucket's centre point.
 */
export function classHitChance(cls: HullId | null, rangeU: number, aspectRad: number, cfg: HitChanceCfg = liveHitChanceCfg()): number {
  if (!Number.isFinite(rangeU) || rangeU < 0 || !Number.isFinite(aspectRad)) return 0;
  const model = modelOf(cls);
  const aspectK = Math.round(foldAspect(cls === null ? SIDE_ON : aspectRad) / ASPECT_BUCKET);
  const rangeK = Math.round(rangeU / RANGE_BUCKET_U);
  const key = (SHIP_CLASS_IDS.indexOf(model) * 64 + aspectK) * 1e6 + rangeK;
  const memo = memoOf(signatureOf(cfg));
  const hit = memo.get(key);
  if (hit !== undefined) return hit;
  const chance = hitChance(rangeK * RANGE_BUCKET_U, hullSilhouette(model), aspectK * ASPECT_BUCKET, cfg);
  memo.set(key, chance);
  return chance;
}

/** What a bot knows of its target, for the chance. */
export interface TargetModel {
  cls: HullId | null;
  heading: number | null;
}

/**
 * THE CHANCE OF A SHOT the bot is about to click: `t`'s class at its heading
 * relative to the line of fire `fireBearing` (rad, the UNWOBBLED lead
 * bearing); a known class with no heading (a remembered class on a radar
 * paint) is THAT hull side-on; no class is the blip model side-on (R3 as
 * amended 2026-11-16 — the band reads the same model). `rangeU` is the held
 * aim distance.
 */
export function shotHitChance(t: TargetModel, fireBearing: number, rangeU: number, cfg: HitChanceCfg = liveHitChanceCfg()): number {
  if (t.cls === null || t.heading === null) return classHitChance(t.cls, rangeU, SIDE_ON, cfg);
  return classHitChance(t.cls, rangeU, t.heading - fireBearing, cfg);
}

const BAR_MEMO = new Map<string, number>();

/** The largest bucket index k ≤ kMax whose side-on chance clears `bar`, by
 *  bisection (the chance is non-increasing in range — header); −1 = none. */
function lastClearing(cls: HullId | null, kMax: number, bar: number, cfg: HitChanceCfg): number {
  const clears = (k: number): boolean => classHitChance(cls, k * RANGE_BUCKET_U, SIDE_ON, cfg) >= bar;
  if (!clears(0)) return -1;
  let lo = 0;
  let hi = kMax + 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (clears(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * u — THE BAR RANGE (R4): the largest range ≤ `rangeU` at which a SIDE-ON
 * hull of class `cls` (null = the R3 blip model) still clears `bar` — `rangeU`
 * itself when the chance there clears it, else the last 2 hm bucket that
 * does; 0 when not even point blank does (the bar is unreachable). Memoized.
 */
export function barRangeU(cls: HullId | null, rangeU: number, bar: number = CONFIG.bots.hitBar, cfg: HitChanceCfg = liveHitChanceCfg()): number {
  if (!Number.isFinite(rangeU) || rangeU <= 0 || !Number.isFinite(bar)) return 0;
  const key = `${signatureOf(cfg)}|${bar}|${modelOf(cls)}|${rangeU}`;
  const hit = BAR_MEMO.get(key);
  if (hit !== undefined) return hit;
  let out: number;
  if (classHitChance(cls, rangeU, SIDE_ON, cfg) >= bar) out = rangeU;
  else {
    const k = lastClearing(cls, Math.floor(rangeU / RANGE_BUCKET_U), bar, cfg);
    out = k < 0 ? 0 : Math.min(rangeU, k * RANGE_BUCKET_U);
  }
  BAR_MEMO.set(key, out);
  return out;
}
