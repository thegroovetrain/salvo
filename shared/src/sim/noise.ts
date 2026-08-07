// Integer-hashed gradient noise + fBm + ridged multifractal — the primitives
// the island height field is composed from (cycle 59).
//
// DETERMINISM: every operation on the generation path is IEEE-754 exact
// (+ - * / , floor, imul, integer bit ops) or an integer table lookup. There is
// deliberately NO transcendental call anywhere in generation — no sin, cos,
// tan, pow, exp, log, hypot or atan2 — so V8 and JavaScriptCore cannot disagree
// by an ulp on a library approximation and flip a geometric sign test on one
// engine but not the other. Gradients are exact double literals, never
// computed. `shared/src/__tests__/noise.test.ts` enforces this by reading this
// file; keep it true as the file evolves.
//
// The per-layer 512-entry permutation table is built by a Fisher-Yates shuffle
// driven by the SAME mulberry32 integer core as `shared/src/math/rng.ts`, so it
// is seed-deterministic and costs ~256 integer swaps to build. Table lookup
// beats re-hashing the lattice coordinate on every call: measured 17.1ns vs
// 31.7ns per sample in the prototype, and the field is 2-3 million samples.

/** A built permutation table for one noise layer (512 entries, doubled). */
export type NoiseLayer = Uint8Array;

const D = 0.7071067811865476; // nearest double to sqrt(2)/2 — a literal, never computed
const GX = new Float64Array([1, -1, 0, 0, D, -D, D, -D]);
const GY = new Float64Array([0, 0, 1, -1, D, D, -D, -D]);

/**
 * The mulberry32 core in its INTEGER form. `math/rng.ts` exposes the same
 * generator divided into [0, 1); the shuffle below needs the raw uint32 so the
 * permutation table is byte-identical to the validated prototype (a float
 * `Math.floor(next() * m)` and an integer `next() % m` do not agree).
 */
function makeU32(seed: number): () => number {
  let s = seed >>> 0;
  return (): number => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
}

/** Deterministic 512-entry permutation table for one noise layer. */
export function makeLayer(seed: number): NoiseLayer {
  const p = new Uint8Array(512);
  for (let i = 0; i < 256; i++) p[i] = i;
  const next = makeU32(seed);
  for (let i = 255; i > 0; i--) {
    const j = next() % (i + 1);
    const t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  for (let i = 0; i < 256; i++) p[256 + i] = p[i];
  return p;
}

/** Quintic fade (Perlin's improved interpolant) — polynomial, exactly typed. */
function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Perlin gradient noise, roughly in [-1, 1]. `P` is a layer table. */
export function perlin(x: number, y: number, P: NoiseLayer): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const u = fade(fx);
  const v = fade(fy);
  const X = xi & 255;
  const Y = yi & 255;
  const A = P[X] + Y;
  const B = P[X + 1] + Y;
  let h = P[A] & 7;
  const n00 = GX[h] * fx + GY[h] * fy;
  h = P[B] & 7;
  const n10 = GX[h] * (fx - 1) + GY[h] * fy;
  h = P[A + 1] & 7;
  const n01 = GX[h] * fx + GY[h] * (fy - 1);
  h = P[B + 1] & 7;
  const n11 = GX[h] * (fx - 1) + GY[h] * (fy - 1);
  const a = n00 + u * (n10 - n00);
  const b = n01 + u * (n11 - n01);
  return (a + v * (b - a)) * 1.4142135623730951;
}

/**
 * fBm: `oct` octaves, frequency doubling, amplitude scaled by `gain`.
 * Persistence is a real shape dial: at 0.5 the coastline is a smooth blob, and
 * as it rises the mid-frequency octaves become comparable to the height above
 * sea level, which is what carves arms, bays and detached rocks out of one
 * landmass.
 */
export function fbm(x: number, y: number, P: NoiseLayer, oct: number, gain: number): number {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * perlin(x * freq, y * freq, P);
    norm += amp;
    amp *= gain;
    freq *= 2;
  }
  return sum / norm;
}

/**
 * Ridged multifractal (1 - |noise|, squared, octave-weighted). Output in [0,1].
 * This is the term that produces SPINES and HOOKS: thresholding a ridged field
 * high leaves elongated crest lines where plain fBm leaves round peaks.
 */
export function ridged(x: number, y: number, P: NoiseLayer, oct: number, gain: number): number {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  let weight = 1;
  for (let i = 0; i < oct; i++) {
    let n = perlin(x * freq, y * freq, P);
    n = 1 - (n < 0 ? -n : n);
    n = n * n * weight;
    weight = n * 2;
    if (weight > 1) weight = 1;
    sum += amp * n;
    norm += amp;
    amp *= gain;
    freq *= 2;
  }
  return sum / norm;
}
