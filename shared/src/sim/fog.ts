// FOG — the rolling fog density field and its sight toll (Story 9.10; Eric
// 2026-10-14, epic-9 amendments 149–150, 163–164, 167–170; and 2026-10-15:
// "no discs — it won't look like realistic rolling fog", "make it performant").
//
// This module is the ONE derivation of the fog field and its toll. Server and
// client evaluate it identically from `(fogSeed, t, cut, CONFIG.fog)`: the
// seed rides the welcome, the cut rides the schema, `t` is the match clock.
// The perception invariant oracle deliberately re-integrates the density at a
// finer step rather than calling `fogTollAlong`, so the two check each other.
//
// The field in plain words: noise `n(x, y, t)` is two fbm layers SPINNING
// about the ocean center (one turn per `spinPeriodMs` at the rim, faster
// toward the middle by `spinShear` so banks curl and stretch; the turn's
// direction is a per-match coin flip — Eric 2026-10-16, amendment 177),
// drifting with a fixed per-match wind, and cross-faded by a triangle wave of
// period `morphMs` (so banks roll AND change shape). Density = clamp01((n − cut) / edgeBand):
// zero below the cut, a soft edge `edgeBand` wide, solid above. A ray pays
// `sightCostPerU × density` extra sight units per unit of its length (a
// midpoint march). Sight only: radar, zone circles, the foghorn and the storm
// never read this file.
//
// PURE, DETERMINISTIC, ZERO I/O, plain objects. NO TRANSCENDENTALS (the
// map-gen posture): `Math.sqrt` only — no hypot, trig, pow, exp/log, random,
// and no clock (time arrives as an argument). A shared test guards the source.

import { fbm, makeLayer, type NoiseLayer } from './noise.js';
import { mulberry32 } from '../math/rng.js';

/** A cut no fbm value reaches: density 0 everywhere — the "no fog" state (what the schema carries before the match goes live). */
export const FOG_NO_CUT = 9;

/** A cut below every fbm value: density 1 everywhere. */
const FOG_FULL_CUT = -2;

/** Offset (u, both axes) between layer A's and layer B's sample points, so the two layers never line up. */
const LAYER_B_OFFSET_U = 1000;

/** The slice of `CONFIG.fog` the field math reads (CONFIG.fog fits). */
export interface FogFieldConfig {
  sightCostPerU: number;
  wavelengthU: number;
  octaves: number;
  gain: number;
  windU: number;
  spinPeriodMs: number; // ms for one full turn of the pattern at the ocean's rim (0 = no spin)
  spinShear: number; // extra turn rate at the center as a fraction of the rim's (0 = rigid)
  morphMs: number;
  edgeBand: number;
  marchStepU: number;
}

/** A built fog field: two noise layers, the wind (u per ms) and the dials. */
export interface FogField {
  readonly layerA: NoiseLayer;
  readonly layerB: NoiseLayer;
  readonly windX: number; // u/ms
  readonly windY: number; // u/ms
  readonly spinSign: 1 | -1; // the per-match coin flip: +1 turns one way, -1 the other
  readonly spinCx: number; // u — the spin center (the ocean center)
  readonly spinCy: number;
  readonly spinRadiusU: number; // u — the ocean radius: shear reads 1 - r / this, 0 at and beyond the rim
  readonly cfg: FogFieldConfig;
}

/** A unit vector drawn from `seed` without trig: rejection-sample the unit disc, normalize. */
function windDirection(seed: number): { x: number; y: number } {
  const rng = mulberry32((seed ^ 0x85ebca6b) >>> 0);
  for (;;) {
    const u = rng.next() * 2 - 1;
    const v = rng.next() * 2 - 1;
    const m2 = u * u + v * v;
    if (m2 > 1e-6 && m2 <= 1) {
      const m = Math.sqrt(m2);
      return { x: u / m, y: v / m };
    }
  }
}

/** The spin's coin flip, drawn from `seed` (its own stream, so the wind draw is untouched). */
function spinSign(seed: number): 1 | -1 {
  return mulberry32((seed ^ 0x27d4eb2f) >>> 0).next() < 0.5 ? 1 : -1;
}

/**
 * Build the fog field for `seed` over an ocean of radius `spinRadiusU` about
 * (`spinCx`, `spinCy`). Deterministic: same seed + cfg + ocean → identical field.
 */
export function makeFogField(seed: number, cfg: FogFieldConfig, spinRadiusU: number, spinCx = 0, spinCy = 0): FogField {
  const s = seed >>> 0;
  const dir = windDirection(s);
  const perMs = cfg.windU / 1000;
  return {
    layerA: makeLayer(s),
    layerB: makeLayer((s ^ 0x9e3779b9) >>> 0),
    windX: dir.x * perMs,
    windY: dir.y * perMs,
    spinSign: spinSign(s),
    spinCx,
    spinCy,
    spinRadiusU: spinRadiusU > 0 ? spinRadiusU : 1,
    cfg,
  };
}

const TWO_PI = 6.283185307179586;
const HALF_PI = 1.5707963267948966;

/**
 * sin and cos of `a` radians by plain arithmetic (no Math.sin/cos: the
 * map-gen posture — byte-identical on every JS engine). Range-reduce to
 * [-π/2, π/2] with Math.floor, then an odd degree-11 series: error < 1e-6,
 * which is a sub-unit displacement at the ocean's rim.
 */
function sinCos(a: number, out: { s: number; c: number }): void {
  const q = a / TWO_PI;
  let x = (q - Math.floor(q)) * TWO_PI; // [0, 2π)
  if (x > 3.141592653589793) x -= TWO_PI; // (-π, π]
  const flip = x > HALF_PI ? 1 : x < -HALF_PI ? -1 : 0;
  if (flip === 1) x = 3.141592653589793 - x;
  else if (flip === -1) x = -3.141592653589793 - x;
  const x2 = x * x;
  const sn = x * (1 - x2 / 6 * (1 - x2 / 20 * (1 - x2 / 42 * (1 - x2 / 72 * (1 - x2 / 110)))));
  const cs = 1 - x2 / 2 * (1 - x2 / 12 * (1 - x2 / 30 * (1 - x2 / 56 * (1 - x2 / 90))));
  out.s = sn;
  out.c = flip === 0 ? cs : -cs;
}

const SC = { s: 0, c: 0 };

/**
 * The sample point for one layer: the pattern spins about the ocean center
 * at `spinPeriodMs` per turn at the rim, faster toward the center by
 * `spinShear` (differential rotation — banks curl and stretch), and drifts
 * on the wind. Spin and drift are isometries and may accumulate all match;
 * the SHEAR is measured from `tResetMs`, the last instant this layer's morph
 * weight was 0 (invisible), so a layer never carries more than one
 * `morphMs` of stretch. Writes (x, y) in noise-space into `out`.
 */
function layerSample(field: FogField, x: number, y: number, tMs: number, tResetMs: number, out: { x: number; y: number }): void {
  const c = field.cfg;
  const px = x - field.spinCx;
  const py = y - field.spinCy;
  let rx = px;
  let ry = py;
  if (c.spinPeriodMs > 0) {
    const w0 = TWO_PI / c.spinPeriodMs; // rad/ms at the rim
    const r = Math.sqrt(px * px + py * py);
    const f = r >= field.spinRadiusU ? 0 : c.spinShear * (1 - r / field.spinRadiusU);
    const ang = -field.spinSign * (w0 * tMs + w0 * f * (tMs - tResetMs)); // look back in time: the pattern turns forward
    sinCos(ang, SC);
    rx = px * SC.c - py * SC.s;
    ry = px * SC.s + py * SC.c;
  }
  out.x = (rx + field.spinCx - field.windX * tMs) / c.wavelengthU;
  out.y = (ry + field.spinCy - field.windY * tMs) / c.wavelengthU;
}

const PA = { x: 0, y: 0 };
const PB = { x: 0, y: 0 };

/** Triangle wave of `t / period` in [0, 1] (0 at phase 0, 1 at phase ½). A non-positive period reads 0. */
function morphWeight(tMs: number, period: number): number {
  if (!(period > 0)) return 0;
  const q = tMs / period;
  const phase = q - Math.floor(q);
  return phase < 0.5 ? 2 * phase : 2 - 2 * phase;
}

/**
 * The raw fog noise at (x, y) at match time `tMs`, roughly in [-1, 1].
 * Any non-finite input reads 0 (with a sane cut that is density 0 or an edge
 * value — never NaN).
 */
export function fogNoiseAt(field: FogField, x: number, y: number, tMs: number): number {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(tMs)) return 0;
  const c = field.cfg;
  const off = LAYER_B_OFFSET_U / c.wavelengthU;
  // n = a + (b - a)·w: layer B is invisible at morph phase 0 (t = k·morphMs), layer A at phase ½
  const period = c.morphMs > 0 ? c.morphMs : 0;
  const tB = period > 0 ? Math.floor(tMs / period) * period : 0;
  const tA = period > 0 ? Math.floor((tMs - period / 2) / period) * period + period / 2 : 0;
  layerSample(field, x, y, tMs, tA, PA);
  layerSample(field, x, y, tMs, tB, PB);
  const a = fbm(PA.x, PA.y, field.layerA, c.octaves, c.gain);
  const b = fbm(PB.x + off, PB.y + off, field.layerB, c.octaves, c.gain);
  const n = a + (b - a) * morphWeight(tMs, c.morphMs);
  return Number.isFinite(n) ? n : 0;
}

/** Map noise to density with the soft edge: clamp01((n − cut) / edgeBand); edgeBand ≤ 0 → a hard step. */
function densityOf(n: number, cut: number, edgeBand: number): number {
  if (!(edgeBand > 0)) return n > cut ? 1 : 0;
  const d = (n - cut) / edgeBand;
  return d <= 0 ? 0 : d >= 1 ? 1 : d;
}

/**
 * Fog density at (x, y) at match time `tMs` under `cut`, in [0, 1].
 * A non-finite cut or a cut ≥ FOG_NO_CUT reads 0 without evaluating noise.
 */
export function fogDensityAt(field: FogField, x: number, y: number, tMs: number, cut: number): number {
  if (!Number.isFinite(cut) || cut >= FOG_NO_CUT) return 0;
  return densityOf(fogNoiseAt(field, x, y, tMs), cut, field.cfg.edgeBand);
}

function allFinite(a: number, b: number, c: number, d: number): boolean {
  return Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(c) && Number.isFinite(d);
}

/** Σ density at the midpoints of `n` equal steps along A → B. */
function marchDensity(
  field: FogField, ax: number, ay: number, dx: number, dy: number, n: number, tMs: number, cut: number,
): number {
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const f = (i + 0.5) / n;
    sum += fogDensityAt(field, ax + dx * f, ay + dy * f, tMs, cut);
  }
  return sum;
}

/**
 * The extra sight distance a ray A → B pays crossing the fog at `tMs` under
 * `cut`: Σ density(midpoint_i) × step × sightCostPerU over n = ceil(len /
 * marchStepU) equal steps. Always ≥ 0 and finite; 0 for the no-fog cut, a
 * zero-length segment or any non-finite input.
 */
export function fogTollAlong(
  field: FogField, ax: number, ay: number, bx: number, by: number, tMs: number, cut: number,
): number {
  if (!Number.isFinite(cut) || cut >= FOG_NO_CUT || !allFinite(ax, ay, bx, by)) return 0;
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (!(len > 0) || !Number.isFinite(len)) return 0;
  const stepU = field.cfg.marchStepU > 0 ? field.cfg.marchStepU : len;
  const n = Math.max(1, Math.ceil(len / stepU));
  const toll = marchDensity(field, ax, ay, dx, dy, n, tMs, cut) * (len / n) * field.cfg.sightCostPerU;
  return Number.isFinite(toll) && toll > 0 ? toll : 0;
}

/**
 * The cut whose fogged share over `points` is `target`: the (1 − target)
 * quantile of the noise at those points. target ≤ 0 (or NaN) or no points →
 * FOG_NO_CUT; target ≥ 1 → a cut below every noise value (density 1
 * everywhere). Pure — the caller picks the points (the server: a lattice
 * inside the live ring).
 */
export function fogCutForTarget(
  field: FogField, tMs: number, points: readonly { x: number; y: number }[], target: number,
): number {
  const n = points.length;
  if (!(target > 0) || n === 0) return FOG_NO_CUT;
  if (target >= 1) return FOG_FULL_CUT;
  const vals = new Float64Array(n);
  for (let i = 0; i < n; i++) vals[i] = fogNoiseAt(field, points[i].x, points[i].y, tMs);
  vals.sort();
  const idx = Math.floor((1 - target) * n);
  return vals[idx < 0 ? 0 : idx > n - 1 ? n - 1 : idx];
}

/**
 * `side × side` cell centers over the bounding square of the disc (cx, cy, r),
 * keeping only those inside the disc. Reuses `out` (and its point objects)
 * when given, so a refresh allocates nothing after the first.
 */
export function fogLattice(
  cx: number, cy: number, r: number, side: number, out: { x: number; y: number }[] = [],
): { x: number; y: number }[] {
  let k = 0;
  const cell = (2 * r) / side;
  const r2 = r * r;
  for (let j = 0; j < side; j++) {
    const y = cy - r + (j + 0.5) * cell;
    for (let i = 0; i < side; i++) {
      const x = cx - r + (i + 0.5) * cell;
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) > r2) continue;
      k = pushPoint(out, k, x, y);
    }
  }
  out.length = k;
  return out;
}

/** Write (x, y) into slot `k` of `out`, reusing an existing point object; returns k + 1. */
function pushPoint(out: { x: number; y: number }[], k: number, x: number, y: number): number {
  const p = out[k];
  if (p) {
    p.x = x;
    p.y = y;
  } else {
    out.push({ x, y });
  }
  return k + 1;
}
