// THE COUNTERMEASURE CLOUD'S SPRAYPAINT FIELD — pure math, no Pixi (Story 9.3
// session 2, "smoke is paint", Eric 2026-10-12). render/countermeasure.ts is
// the thin adapter that owns one of these per held cloud, uploads it through a
// BufferImageSource and positions one Sprite — the same seam radarHeatmap.ts
// holds for the radar heat raster.
//
// THE LOOK (Eric, verbatim): "treat it as a 2d bitmap more or less the same
// way the radar layer is. … Imagine if someone was using the spraypaint tool
// on a bitmap, and the user is just holding down the mouse while the radius of
// that tool gets slightly bigger over time, and it's capturing this
// frame-by-frame so that each 'paint' itself fades to 0 alpha (similarly to
// the phosphor decay). It's smoke." His picks: the spray runs the whole shared
// `CONFIG.countermeasure.lifeMs`, fixed at the press point, inside the shared
// disc `cloudOutlineRadius(age)` (r0 → r1); each paint fades over ~6–10 s;
// cells are the radar raster's 9 u.
//
// THE BRUSH (session 3, Eric 2026-10-12, rejecting the dot spray: "It looks
// like you have sprayed the spray tool itself" … "I said PIXELS, not blobs"
// — his reference is soft overlapping puffs of many sizes and greys, lighter
// wisps at the rim, denser where they pile up). Each stamp is a soft PUFF: a
// disc of random radius in [puffMinU, puffMaxU] with the smooth bell falloff
// (1 − (d/R)²)², random centre strength in [puffMinAlpha, puffMaxAlpha] and a
// random grey in [shadeMin, shadeMax], landing inside the current spray disc
// biased to the centre (radius = R·u^0.8) so the body is dense and the rim
// wispy. A puff composites OVER the cell — a ← a + s·(1 − a), clamped at
// maxAlpha — and its grey blends into the cell's SHADE channel with the
// puff's over-weight s / a_new, so the shade is always a mix of puff greys.
//
// A FIELD IS A SQUARE ALPHA GRID centred on the cloud: `CLOUD_CELLS` per side,
// cell (i, j)'s centre at ((i − c)·cellU, (j − c)·cellU) from the cloud centre
// with c = (CLOUD_CELLS − 1) / 2, wide enough for an end-of-life r1 disc plus
// one largest puff (so a rim puff is never clipped square by the grid). One
// `stepField` = decay every cell LINEARLY (the phosphor shape: a cell at
// `maxAlpha` reaches 0 in exactly `fadeMs`), then stamp this step's puffs. Because the decay is linear, history older
// than `fadeMs` contributes exactly nothing — which is what makes the catch-up
// in `advanceField` exact rather than an approximation, and caps its work.
//
// PURELY VISUAL: the server hides nothing behind a cloud (2026-10-12), so the
// RNG is the caller's (Math.random in the game) and never shared with anyone.

import { CONFIG, cloudOutlineRadius } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';

const K = CLIENT_CONFIG.countermeasure;
const CELL = K.cellU;

/** Cells per side of a cloud's field — covers the end-of-life r1 disc plus
 *  one largest puff's radius. */
export const CLOUD_CELLS = Math.ceil((2 * (CONFIG.countermeasure.r1 + K.puffMaxU)) / CELL) + 1;
/** The centre cell index (fractional when CLOUD_CELLS is even). */
const MID = (CLOUD_CELLS - 1) / 2;
/** ms — the fixed step `advanceField` catches up in (pre-roll, a stalled tab). */
export const CATCH_UP_STEP_MS = 100;
/** Under this a field is gone: it would upload as a 0 alpha byte. */
export const FADED_ALPHA = 1 / 255;
/** RNG draws one puff consumes (landing radius, angle, size, strength, grey). */
export const RNG_PER_PUFF = 5;

export interface CloudField {
  /** CLOUD_CELLS² alphas, row-major (j·CLOUD_CELLS + i). */
  readonly alpha: Float32Array;
  /** CLOUD_CELLS² greys (multipliers of the smoke color), same layout. */
  readonly shade: Float32Array;
  /** The largest alpha after the last step (0 = nothing to decay or draw). */
  peak: number;
  /** Fractional puff carried into the next step. */
  carry: number;
  /** ms — the cloud age the field has been advanced to. */
  age: number;
}

/** One puff, drawn by `samplePuff` — offsets and radius in u. */
export interface Puff {
  x: number;
  y: number;
  r: number;
  s: number;
  shade: number;
}

/** The one scratch puff the spray reuses (no per-puff allocation). */
const PUFF: Puff = { x: 0, y: 0, r: 0, s: 0, shade: 0 };

export function makeField(): CloudField {
  const n = CLOUD_CELLS * CLOUD_CELLS;
  return { alpha: new Float32Array(n), shade: new Float32Array(n), peak: 0, carry: 0, age: 0 };
}

/** Linear decay of every cell by `dtMs`; refreshes `peak`. */
export function decayField(f: CloudField, dtMs: number): void {
  if (f.peak === 0) return;
  const drop = (K.maxAlpha * dtMs) / K.fadeMs;
  const a = f.alpha;
  let peak = 0;
  for (let k = 0; k < a.length; k++) {
    const v = a[k] - drop;
    a[k] = v > 0 ? v : 0;
    if (v > peak) peak = v;
  }
  f.peak = peak;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Draw one puff into `out`: a landing point inside the disc of radius
 * `radiusU` biased to the centre (radius = R·u^0.8 — √u would be uniform over
 * the area), a size, a strength and a grey. Exactly `RNG_PER_PUFF` draws.
 */
export function samplePuff(radiusU: number, rng: () => number, out: Puff = PUFF): Puff {
  const rho = radiusU * Math.pow(rng(), 0.8);
  const theta = 2 * Math.PI * rng();
  out.x = rho * Math.cos(theta);
  out.y = rho * Math.sin(theta);
  out.r = lerp(K.puffMinU, K.puffMaxU, rng());
  out.s = lerp(K.puffMinAlpha, K.puffMaxAlpha, rng());
  out.shade = lerp(K.shadeMin, K.shadeMax, rng());
  return out;
}

/**
 * Stamp one soft puff centred (xU, yU) u from the cloud centre, radius `rU`,
 * centre strength `s`, grey `shade`. Each cell inside the disc gets the bell
 * weight w = s·(1 − (d/R)²)² composited OVER it (a ← a + w·(1 − a), clamped
 * at maxAlpha); its shade moves toward the puff's by w / a_new.
 */
export function stampPuff(f: CloudField, xU: number, yU: number, rU: number, s: number, shade: number): void {
  const u = MID + xU / CELL;
  const v = MID + yU / CELL;
  const R = rU / CELL;
  const R2 = R * R;
  const i0 = Math.max(0, Math.ceil(u - R));
  const i1 = Math.min(CLOUD_CELLS - 1, Math.floor(u + R));
  const j0 = Math.max(0, Math.ceil(v - R));
  const j1 = Math.min(CLOUD_CELLS - 1, Math.floor(v + R));
  for (let j = j0; j <= j1; j++) {
    const dv = j - v;
    for (let i = i0; i <= i1; i++) {
      const du = i - u;
      const t = (du * du + dv * dv) / R2;
      if (t < 1) composite(f, j * CLOUD_CELLS + i, s * (1 - t) * (1 - t), shade);
    }
  }
}

/** Alpha "over": the cell takes w of the remaining (1 − a), up to maxAlpha. */
function composite(f: CloudField, k: number, w: number, shade: number): void {
  const a0 = f.alpha[k];
  const a = Math.min(K.maxAlpha, a0 + w * (1 - a0));
  if (a <= 0) return;
  f.shade[k] = lerp(f.shade[k], shade, Math.min(1, w / a));
  f.alpha[k] = a;
  if (a > f.peak) f.peak = a;
}

/** Stamp `n` puffs inside the disc of radius `radiusU`. */
export function sprayPuffs(f: CloudField, n: number, radiusU: number, rng: () => number): void {
  for (let p = 0; p < n; p++) {
    const q = samplePuff(radiusU, rng);
    stampPuff(f, q.x, q.y, q.r, q.s, q.shade);
  }
}

/**
 * One step of `dtMs` from the field's current age: decay, then (while the
 * cloud still lives) stamp this step's share of puffs inside the disc at the
 * step's END age. Puffs never land past `lifeMs`.
 */
export function stepField(f: CloudField, dtMs: number, rng: () => number): void {
  decayField(f, dtMs);
  const sprayMs = Math.max(0, Math.min(dtMs, CONFIG.countermeasure.lifeMs - f.age));
  f.age += dtMs;
  if (sprayMs <= 0) return;
  const want = f.carry + (K.puffsPerSec * sprayMs) / 1000;
  const n = Math.floor(want);
  f.carry = want - n;
  sprayPuffs(f, n, cloudOutlineRadius(Math.min(f.age, CONFIG.countermeasure.lifeMs)), rng);
}

/**
 * Advance the field to `toAge`. A normal frame is one step. A big jump — the
 * PRE-ROLL of a cloud first seen mid-life (reconnect, delivery delay) or a
 * stalled tab — is walked in `CATCH_UP_STEP_MS` steps, and only over the last
 * `fadeMs` of it: under linear decay anything older has faded to exactly 0,
 * so skipping it is exact and the work is capped at fadeMs / step steps.
 * A clock estimate that steps backwards is ignored.
 */
export function advanceField(f: CloudField, toAge: number, rng: () => number): void {
  if (!(toAge > f.age)) return;
  if (toAge - f.age > K.fadeMs) skipTo(f, toAge - K.fadeMs);
  while (toAge - f.age > CATCH_UP_STEP_MS) stepField(f, CATCH_UP_STEP_MS, rng);
  stepField(f, toAge - f.age, rng);
}

/** Jump the field's age forward over a span whose puffs would all have faded. */
function skipTo(f: CloudField, age: number): void {
  f.alpha.fill(0);
  f.peak = 0;
  f.carry = 0;
  f.age = age;
}

/**
 * Write the field into an rgba buffer: rgb = the cell's shade × 255 (the grey
 * Sprite's tint `colors.woundedSmoke` multiplies it), a = its alpha × 255.
 */
export function fieldToRgba(f: CloudField, rgba: Uint8Array): void {
  const a = f.alpha;
  const sh = f.shade;
  for (let k = 0; k < a.length; k++) {
    const g = (sh[k] * 255 + 0.5) | 0;
    const o = k * 4;
    rgba[o] = g;
    rgba[o + 1] = g;
    rgba[o + 2] = g;
    rgba[o + 3] = (a[k] * 255 + 0.5) | 0;
  }
}

/** The preview seam (a node script renders a field to a PNG): exactly
 *  `fieldToRgba` — this module imports no Pixi, so `tsx` can load it. */
export function fieldPreview(f: CloudField, rgbaOut: Uint8Array): void {
  fieldToRgba(f, rgbaOut);
}

/** Is the field done: spraying over and every cell faded out? */
export function fieldSpent(f: CloudField): boolean {
  return f.age >= CONFIG.countermeasure.lifeMs && f.peak < FADED_ALPHA;
}

/** u — world offset of cell index `i` from the cloud centre. */
export function cellOffsetU(i: number): number {
  return (i - MID) * CELL;
}
