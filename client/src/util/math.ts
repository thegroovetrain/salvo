// Small pure math helpers for rendering + camera. Kept free of any Pixi import
// so every consumer stays unit-testable. Angle helpers re-export from shared so
// there is one canonical wrap/lerp used across sim and render.

export { lerpAngle, wrapAngle, angleDiff } from '@salvo/shared';

/** Linear interpolation from a to b, t in [0,1] (not clamped). */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Clamp v to [0, 1]. */
export function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

/** Clamp v to [lo, hi]. */
export function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

/**
 * Frame-rate-independent exponential approach of `current` toward `target`.
 * `rate` is the decay constant (larger = snappier). Returns the new value.
 * new = target + (current - target) * exp(-rate * dt).
 */
export function expDecay(current: number, target: number, rate: number, dt: number): number {
  return target + (current - target) * Math.exp(-rate * dt);
}
