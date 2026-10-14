// THE RADAR DROPOUT (Story 9.8, Eric 2026-10-13, epic-9 amendment 104 and
// rulings 121–123) — the pure half both the server's perception and its test
// oracle call.
//
// The attenuation band 8/12–12/12 of the radar ruler is DROPOUT, NOT DIMMING:
// a return's brightness stays on the shipped 1/d⁴ curve, and from
// `CONFIG.vision.dropout.startU` outward a sweep increasingly FAILS TO PAINT
// it at all. Two pieces, both pure and deterministic:
//
//   - `dropoutPaintP(d)` — the probability a sweep paints a return at range
//     `d`: 1 to `startU`, `kneeP` at `kneeU`, `rimP` at the radar rim, joined
//     by two polynomial smoothsteps S(x) = x²(3 − 2x) (flat, then a cliff —
//     ruling 121). No transcendentals.
//   - `dropoutRoll(seed, observer, target, rev)` — ONE uniform draw in [0, 1)
//     per (world seed, observer, target, sweep revolution), from a STATELESS
//     integer hash fed to one `mulberry32` draw. Never a consumed stream:
//     `observe()` runs once per connected client and per bot thunk every tick,
//     so a stream would make the outcome depend on how many callers there are.
//     Rolling per REVOLUTION (not per tick) is what makes "this sweep saw it
//     or didn't" read as one decision across the one or two ticks a beam
//     takes to cross a target.
//
// NO SIZE WEIGHTING (ruling 122): every return — hull, decoy, wake, cloud —
// sees the same curve. The server applies the roll inside `perception
// .observe()`, so a missed paint never leaves the server.

import { CONFIG } from '../constants.js';
import { mulberry32 } from '../math/rng.js';
import { hashSeedText } from './seedText.js';

/** The four dials of the dropout curve (`CONFIG.vision.dropout`). */
export interface DropoutCurve {
  /** u — p(paint) is 1 out to here (the 8/12 rung). */
  readonly startU: number;
  /** u — p(paint) is `kneeP` here (the 10/12 rung). */
  readonly kneeU: number;
  /** Paint probability at the knee. */
  readonly kneeP: number;
  /** Paint probability at the radar rim (12/12). */
  readonly rimP: number;
}

/** Clamp to [0, 1]; a non-finite value reads 0 (fail closed: never paints). */
function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v <= 0 ? 0 : v >= 1 ? 1 : v;
}

/** The polynomial smoothstep S(x) = x²(3 − 2x) on x clamped to [0, 1]. */
function smoothstep(x: number): number {
  const c = clamp01(x);
  return c * c * (3 - 2 * c);
}

/** A usable curve has a strictly increasing start < knee < rim. Anything else
 *  (a reversed or collapsed band, a NaN dial) is DEGENERATE. */
function isDegenerate(cfg: DropoutCurve, radarU: number): boolean {
  // A rim more reliable than the knee (rimP > kneeP) is not a curve either —
  // the Edge Case Hunter's harness arm (2026-10-13); it collapses to the step.
  return !(cfg.kneeU > cfg.startU) || !(radarU > cfg.kneeU) || !(cfg.kneeP >= cfg.rimP);
}

/**
 * THE PAINT PROBABILITY at range `dU` (ruling 121): 1 for `d ≤ startU`;
 * `1 − (1 − kneeP)·S((d − startU)/(kneeU − startU))` to the knee;
 * `kneeP − (kneeP − rimP)·S((d − kneeU)/(radarU − kneeU))` to the rim; `rimP`
 * beyond it (callers already exclude d > radar range). Continuous and
 * monotone non-increasing for kneeP ≥ rimP.
 *
 * FAILS CLOSED: a non-finite `dU` reads 0 (never paints); a DEGENERATE curve
 * (kneeU ≤ startU, radarU ≤ kneeU, or a NaN dial) collapses to a STEP at
 * `startU` — full paint inside it, none beyond — so a bad harness dial can
 * never paint farther than the flat band, only less. The result is clamped to
 * [0, 1].
 */
export function dropoutPaintP(
  dU: number,
  cfg: DropoutCurve = CONFIG.vision.dropout,
  radarU: number = CONFIG.vision.radar,
): number {
  if (!Number.isFinite(dU)) return 0;
  if (dU <= cfg.startU) return 1;
  if (isDegenerate(cfg, radarU)) return 0;
  if (dU <= cfg.kneeU) {
    return clamp01(1 - (1 - cfg.kneeP) * smoothstep((dU - cfg.startU) / (cfg.kneeU - cfg.startU)));
  }
  return clamp01(cfg.kneeP - (cfg.kneeP - cfg.rimP) * smoothstep((dU - cfg.kneeU) / (radarU - cfg.kneeU)));
}

/** One round of the integer mix: xor the input in, multiply by an odd
 *  constant, fold the high bits down. 32-bit integer arithmetic only. */
function mix(h: number, v: number, k: number): number {
  const m = Math.imul(h ^ v, k);
  return (m ^ (m >>> 15)) >>> 0;
}

/**
 * THE ROLL: a uniform float in [0, 1) for one (world seed, observer, target,
 * sweep revolution). A STATELESS integer hash — the seed, the two keys
 * (through `hashSeedText`) and the revolution index each mixed in with its
 * OWN odd constant, so swapping observer and target, or moving one revolution,
 * gives an unrelated draw — seeds ONE `mulberry32` draw. Identical inputs give
 * the identical float on every call, on every machine and in every caller
 * (server perception, bot thunks, the test oracle).
 *
 * `seed` and `rev` are coerced to uint32 (`>>> 0`: a NaN reads 0), so a
 * malformed input still yields a deterministic draw rather than a throw.
 */
export function dropoutRoll(seed: number, observerKey: string, targetKey: string, rev: number): number {
  let h = 0x9e3779b9;
  h = mix(h, seed >>> 0, 0x85ebca6b);
  h = mix(h, hashSeedText(observerKey), 0xc2b2ae35);
  h = mix(h, hashSeedText(targetKey), 0x27d4eb2f);
  h = mix(h, rev >>> 0, 0x165667b1);
  return mulberry32(h).next();
}

/**
 * Does this sweep revolution PAINT a return at range `dU`? `dropoutRoll(...) <
 * dropoutPaintP(dU, ...)` — so a return inside `startU` always paints (p = 1
 * and the roll is < 1), a non-finite range never does (p = 0), and at range
 * `d` the long-run paint share over revolutions is p(d).
 */
export function dropoutPaints(
  dU: number,
  seed: number,
  observerKey: string,
  targetKey: string,
  rev: number,
  cfg: DropoutCurve = CONFIG.vision.dropout,
  radarU: number = CONFIG.vision.radar,
): boolean {
  return dropoutRoll(seed, observerKey, targetKey, rev) < dropoutPaintP(dU, cfg, radarU);
}
