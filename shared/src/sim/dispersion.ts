// REAL DISPERSION (Story 11.1, Eric 2026-11-12, rulings R2–R5): where a gun
// shell actually lands around the point it was aimed at.
//
// The pattern is an ellipse centered on the aim point, its long axis along the
// line of fire (muzzle → aim). Its size grows linearly with range, each axis
// floored at `floorU` (CONFIG.dispersion). Inside it the landing is BELL-shaped
// — a truncated 2-D normal, sampled in closed form (no rejection loop): the
// normalized radius r ∈ [0, 1] is a Rayleigh radius truncated at `sigmas`
// standard deviations, the angle is uniform, and the unit disc is then
// stretched onto the ellipse. The ellipse is therefore a HARD EDGE.
//
// Pure: no I/O, no Math.random — every landing comes from a mulberry32 seed,
// so the same inputs and seed give the same point ON A GIVEN JS ENGINE. It is
// NOT bit-identical across engines: the bell and the angle go through
// `Math.log` / `Math.exp` / `Math.cos` / `Math.sin`, whose last bits the spec
// leaves to the implementation. That is fine because ONLY THE SERVER SAMPLES
// LANDINGS (`dispersedPoint` / `dispersedLanding`); the client never predicts
// a landing and may call `dispersionAxes` only (the preview oval — plain
// arithmetic). The per-shell seed is minted server-side (World `mintShell`,
// an HMAC off the room's private dispersion key — Story 11.1 review fix), so
// no seed derivation lives here.
// `dispersedPoint` does no map clamping; `dispersedLanding` clamps inside the
// water disk along the origin → landing ray.

import { CONFIG } from '../constants.js';
import { mulberry32 } from '../math/rng.js';
import { clampInsideMap } from './aim.js';

/** The four dispersion dials (CONFIG.dispersion's shape). */
export interface DispersionCfg {
  /** Full length along the shot, as a fraction of range. */
  alongFrac: number;
  /** Full width across the shot, as a fraction of the length along. */
  acrossFrac: number;
  /** u — smallest full length of either axis. */
  floorU: number;
  /** The ellipse edge in standard deviations of the bell. */
  sigmas: number;
}

/** The ellipse's SEMI-axes in u: half the full length along, half the full width across. */
export interface DispersionAxes {
  alongU: number;
  acrossU: number;
}

/** Below this, `sigmas` is treated as "no bell" (uniform disc). */
const MIN_SIGMAS = 1e-3;
/** Below this many u, a shot has no bearing of its own. */
const MIN_RANGE_U = 1e-9;

function safeRange(rangeU: number): number {
  return Number.isFinite(rangeU) && rangeU > 0 ? rangeU : 0;
}

/** The dispersion ellipse's semi-axes for a shot of `rangeU` u. */
export function dispersionAxes(rangeU: number, cfg: DispersionCfg = CONFIG.dispersion): DispersionAxes {
  const range = safeRange(rangeU);
  const along = cfg.alongFrac * range;
  return {
    alongU: Math.max(along, cfg.floorU) / 2,
    acrossU: Math.max(along * cfg.acrossFrac, cfg.floorU) / 2,
  };
}

/** Normalized radius in [0, 1]: a Rayleigh radius truncated at `k` sigmas, from one uniform. */
function bellRadius(u: number, k: number): number {
  if (!(k > MIN_SIGMAS)) return Math.sqrt(u); // uniform disc
  const r = Math.sqrt(-2 * Math.log(1 - u * (1 - Math.exp((-k * k) / 2)))) / k;
  return Math.min(1, Math.max(0, r));
}

/**
 * One shell's landing point: the aim point (`aimX`, `aimY`) displaced inside
 * the dispersion ellipse for the shot from (`originX`, `originY`), from `seed`.
 * A zero-length shot falls back to bearing +x. Always finite for finite input.
 */
export function dispersedPoint(
  originX: number,
  originY: number,
  aimX: number,
  aimY: number,
  seed: number,
  cfg: DispersionCfg = CONFIG.dispersion,
): { x: number; y: number } {
  const dx = aimX - originX;
  const dy = aimY - originY;
  const range = Math.hypot(dx, dy);
  const hasBearing = Number.isFinite(range) && range > MIN_RANGE_U;
  const ux = hasBearing ? dx / range : 1;
  const uy = hasBearing ? dy / range : 0;
  const { alongU, acrossU } = dispersionAxes(hasBearing ? range : 0, cfg);
  const rng = mulberry32(seed);
  const r = bellRadius(rng.next(), cfg.sigmas);
  const theta = 2 * Math.PI * rng.next();
  const a = alongU * r * Math.cos(theta);
  const b = acrossU * r * Math.sin(theta);
  // along = (ux, uy); across = (-uy, ux)
  return { x: aimX + ux * a - uy * b, y: aimY + uy * a + ux * b };
}

/**
 * One dispersed shell's LANDING (Story 11.1, R5 / R8): `dispersedPoint` from
 * `originX`, `originY` around its aim point, then pulled back inside the water
 * disk along the origin → landing ray (`clampInsideMap`). It may land past the
 * gun's reach (by at most half the ellipse's along axis), never outside the
 * map. (The secondaries' one-round path; the main battery's salvo clamps
 * along its salvo bearing instead — server equipment/ballistics.ts.)
 */
export function dispersedLanding(
  originX: number,
  originY: number,
  aimX: number,
  aimY: number,
  seed: number,
  mapRadius: number,
  cfg: DispersionCfg = CONFIG.dispersion,
): { x: number; y: number } {
  const p = dispersedPoint(originX, originY, aimX, aimY, seed, cfg);
  return clampInsideMap({ x: originX, y: originY }, p, mapRadius);
}
