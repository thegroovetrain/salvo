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

/**
 * Cut a full circle into `segments` equal slices and return the [start, end]
 * angle pair of the INKED part of each — `duty` (0..1] of the slice, centred at
 * its start. The dash/dot vocabulary the ordnance previews and the own-mine
 * rings share: line STYLE is how two concentric radii stay distinguishable
 * without a second color (DESIGN.md dual-coding), and a static dash pattern
 * reads identically with motion off.
 *
 * Degenerate inputs return an empty list rather than a full circle, so a
 * mis-set tunable can never silently draw a solid ring where a dashed one is
 * the information.
 */
export function dashArcs(segments: number, duty: number): [number, number][] {
  if (segments <= 0 || duty <= 0) return [];
  const step = (Math.PI * 2) / segments;
  // Ink is capped BELOW a full slice: at duty ≥ 1 the arcs would meet and the
  // ring would close into a solid circle — silently destroying the one channel
  // that separates the trigger ring from the blast ring (line style, not hue).
  // A dashed ring must look dashed at every tunable value it can be handed.
  const ink = step * Math.min(0.95, Math.max(0, duty));
  const out: [number, number][] = [];
  for (let i = 0; i < segments; i += 1) out.push([i * step, i * step + ink]);
  return out;
}
