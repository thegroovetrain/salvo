// Screen shake on taking damage. Pure decay math (no Pixi import — unit
// tested); a thin stateful driver composes it with a per-frame random
// direction so the offset trembles rather than sliding smoothly. Magnitude is
// clamped to SHAKE_MARGIN_PX (matches the fog bake's shake headroom, see
// render/fog.ts's EXTRA_MARGIN_PX) so the fog overlay never exposes a screen
// edge no matter how hard the hit.
//
// Plan formula: mag * e^(-8t) * random2D, re-randomized every frame (a fresh
// direction each tick reads as a tremble, not a smooth swing back to zero).

import type { Point } from './camera.js';
import { EXTRA_MARGIN_PX } from './fog.js';

/** Exponential decay rate (1/s) — mag * e^(-DECAY_RATE * t). */
export const DECAY_RATE = 8;

/** Damage thresholds the magnitude curve is anchored to (gun / torpedo hit). */
const DMG_SUBTLE = 15; // gun
const DMG_HEAVY = 55; // torpedo
const PX_SUBTLE = 4;
const PX_HEAVY = 16;

/**
 * Hard cap (px) on shake magnitude: must never exceed the fog bake's shake
 * headroom, with a little slack so screen-edge exposure never happens even at
 * the peak of a fresh, un-decayed shake.
 */
export const SHAKE_MAX_PX = EXTRA_MARGIN_PX - 8;

/** Clamp v to [lo, hi]. */
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Peak shake magnitude (px) for a hit of `damage` hp, linearly interpolated
 * between the subtle (gun, 15hp) and heavy (torpedo, 55hp) anchors and
 * clamped to [PX_SUBTLE, SHAKE_MAX_PX] for any damage value outside that
 * range (mine hits land in between; any future weapon is clamped safely).
 */
export function shakeMagnitude(damage: number): number {
  const t = (damage - DMG_SUBTLE) / (DMG_HEAVY - DMG_SUBTLE);
  const px = PX_SUBTLE + clamp(t, 0, 1) * (PX_HEAVY - PX_SUBTLE);
  return clamp(px, PX_SUBTLE, SHAKE_MAX_PX);
}

/** Remaining shake magnitude (px) at `t` seconds after a trigger of `peak` px. */
export function shakeDecay(peak: number, t: number): number {
  if (t <= 0) return peak;
  return peak * Math.exp(-DECAY_RATE * t);
}

/** Internal shake state: a peak magnitude + elapsed time since (re)trigger. */
export interface ShakeState {
  peak: number; // px
  t: number; // s since trigger
}

export const IDLE_SHAKE: ShakeState = { peak: 0, t: 0 };

/**
 * Register a new hit of `damage` hp. A stronger hit resets the decay clock; a
 * weaker hit arriving mid-shake keeps decaying the larger existing magnitude
 * (so a follow-up gun tick doesn't visually downgrade an in-flight torpedo
 * shake) but still resets the clock, extending it slightly.
 */
export function triggerShake(state: ShakeState, damage: number): ShakeState {
  const incoming = shakeMagnitude(damage);
  const current = shakeDecay(state.peak, state.t);
  return { peak: Math.max(incoming, current), t: 0 };
}

/** Advance the shake clock by `dt` seconds. */
export function advanceShake(state: ShakeState, dt: number): ShakeState {
  return { peak: state.peak, t: state.t + dt };
}

/** Current decayed magnitude (px), clamped to the fog-safe cap. */
export function shakeCurrentMagnitude(state: ShakeState): number {
  return clamp(shakeDecay(state.peak, state.t), 0, SHAKE_MAX_PX);
}

/** Magnitude below which shake is considered over (skip the random draw). */
const REST_EPSILON_PX = 0.05;

/**
 * Stateful driver: trigger() on a dmg event, update() once per render frame
 * to get this frame's screen-space offset. `rng` is injectable for tests
 * (defaults to Math.random); it drives the per-frame random direction only —
 * all magnitude math above is pure and deterministic.
 */
export class ShakeDriver {
  private state: ShakeState = IDLE_SHAKE;

  constructor(private readonly rng: () => number = Math.random) {}

  trigger(damage: number): void {
    this.state = triggerShake(this.state, damage);
  }

  /** Current decayed magnitude (px), for tests/debug. */
  get magnitude(): number {
    return shakeCurrentMagnitude(this.state);
  }

  /** Advance by `dt` seconds and return this frame's screen offset (px). */
  update(dt: number): Point {
    this.state = advanceShake(this.state, dt);
    const mag = shakeCurrentMagnitude(this.state);
    if (mag <= REST_EPSILON_PX) return { x: 0, y: 0 };
    const angle = this.rng() * Math.PI * 2;
    return { x: Math.cos(angle) * mag, y: Math.sin(angle) * mag };
  }
}
