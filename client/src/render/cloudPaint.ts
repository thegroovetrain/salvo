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
// A FIELD IS A SQUARE ALPHA GRID centred on the cloud: `CLOUD_CELLS` per side,
// cell (i, j)'s centre at ((i − c)·cellU, (j − c)·cellU) from the cloud centre
// with c = (CLOUD_CELLS − 1) / 2. One `stepField` = decay every cell LINEARLY
// (the phosphor shape: a cell at `maxAlpha` reaches 0 in exactly `fadeMs`),
// then spray this step's paints. Because the decay is linear, history older
// than `fadeMs` contributes exactly nothing — which is what makes the catch-up
// in `advanceField` exact rather than an approximation, and caps its work.
//
// PURELY VISUAL: the server hides nothing behind a cloud (2026-10-12), so the
// RNG is the caller's (Math.random in the game) and never shared with anyone.

import { CONFIG, cloudOutlineRadius } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';

const K = CLIENT_CONFIG.countermeasure;
const CELL = K.cellU;
const R = K.dotCells;
const R2 = R * R;

/** Cells per side of a cloud's field — covers the end-of-life r1 disc. */
export const CLOUD_CELLS = Math.ceil((2 * CONFIG.countermeasure.r1) / CELL) + 1;
/** The centre cell index (fractional when CLOUD_CELLS is even). */
const MID = (CLOUD_CELLS - 1) / 2;
/** ms — the fixed step `advanceField` catches up in (pre-roll, a stalled tab). */
export const CATCH_UP_STEP_MS = 100;
/** Under this a field is gone: it would upload as a 0 alpha byte. */
export const FADED_ALPHA = 1 / 255;

export interface CloudField {
  /** CLOUD_CELLS² alphas, row-major (j·CLOUD_CELLS + i). */
  readonly alpha: Float32Array;
  /** The largest alpha after the last step (0 = nothing to decay or draw). */
  peak: number;
  /** Fractional paint carried into the next step. */
  carry: number;
  /** ms — the cloud age the field has been advanced to. */
  age: number;
}

export function makeField(): CloudField {
  return { alpha: new Float32Array(CLOUD_CELLS * CLOUD_CELLS), peak: 0, carry: 0, age: 0 };
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

/** One soft round dot at cell coordinates (u, v), saturating at maxAlpha. */
export function stampDot(f: CloudField, u: number, v: number): void {
  const i0 = Math.max(0, Math.ceil(u - R));
  const i1 = Math.min(CLOUD_CELLS - 1, Math.floor(u + R));
  const j0 = Math.max(0, Math.ceil(v - R));
  const j1 = Math.min(CLOUD_CELLS - 1, Math.floor(v + R));
  for (let j = j0; j <= j1; j++) {
    const dv = j - v;
    for (let i = i0; i <= i1; i++) {
      const du = i - u;
      const d2 = du * du + dv * dv;
      if (d2 < R2) addAlpha(f, j * CLOUD_CELLS + i, K.maxAlpha * (1 - d2 / R2));
    }
  }
}

function addAlpha(f: CloudField, k: number, add: number): void {
  const v = Math.min(K.maxAlpha, f.alpha[k] + add);
  f.alpha[k] = v;
  if (v > f.peak) f.peak = v;
}

/** Land `n` paints uniformly inside the disc of radius `radiusU`. */
export function sprayPaints(f: CloudField, n: number, radiusU: number, rng: () => number): void {
  const scale = radiusU / CELL;
  for (let p = 0; p < n; p++) {
    let x: number;
    let y: number;
    do {
      x = 2 * rng() - 1;
      y = 2 * rng() - 1;
    } while (x * x + y * y > 1);
    stampDot(f, MID + x * scale, MID + y * scale);
  }
}

/**
 * One step of `dtMs` from the field's current age: decay, then (while the
 * cloud still lives) spray this step's share of paints inside the disc at the
 * step's END age. Paints never land past `lifeMs`.
 */
export function stepField(f: CloudField, dtMs: number, rng: () => number): void {
  decayField(f, dtMs);
  const sprayMs = Math.max(0, Math.min(dtMs, CONFIG.countermeasure.lifeMs - f.age));
  f.age += dtMs;
  if (sprayMs <= 0) return;
  const want = f.carry + (K.paintsPerSec * sprayMs) / 1000;
  const n = Math.floor(want);
  f.carry = want - n;
  sprayPaints(f, n, cloudOutlineRadius(Math.min(f.age, CONFIG.countermeasure.lifeMs)), rng);
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

/** Jump the field's age forward over a span whose paints would all have faded. */
function skipTo(f: CloudField, age: number): void {
  f.alpha.fill(0);
  f.peak = 0;
  f.carry = 0;
  f.age = age;
}

/** Write the field into the alpha bytes of an rgba buffer (rgb untouched). */
export function fieldToRgba(f: CloudField, rgba: Uint8Array): void {
  const a = f.alpha;
  for (let k = 0; k < a.length; k++) rgba[k * 4 + 3] = (a[k] * 255 + 0.5) | 0;
}

/** Is the field done: spraying over and every cell faded out? */
export function fieldSpent(f: CloudField): boolean {
  return f.age >= CONFIG.countermeasure.lifeMs && f.peak < FADED_ALPHA;
}

/** u — world offset of cell index `i` from the cloud centre (test seam). */
export function cellOffsetU(i: number): number {
  return (i - MID) * CELL;
}
