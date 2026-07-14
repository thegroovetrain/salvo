// Angle math in radians. Bearings use standard atan2 convention
// (0 = +x axis, increasing counter-clockwise).

import type { Vec2 } from './vec.js';

const TAU = Math.PI * 2;

/** Wrap an angle into the half-open range [-pi, pi). */
export function wrapAngle(a: number): number {
  const t = (((a + Math.PI) % TAU) + TAU) % TAU;
  return t - Math.PI;
}

/** Wrap an angle into the half-open range [0, 2*pi). */
export function wrapPositive(a: number): number {
  return ((a % TAU) + TAU) % TAU;
}

/**
 * Shortest signed rotation from angle `a` to angle `b`, in [-pi, pi).
 * Positive = counter-clockwise.
 */
export function angleDiff(a: number, b: number): number {
  return wrapAngle(b - a);
}

/** Bearing (radians) from point `from` to point `to`. */
export function bearing(from: Vec2, to: Vec2): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

/**
 * True iff `angle` lies within `halfWidth` radians of `center`
 * (an arc of total width 2*halfWidth). Boundary is inclusive.
 */
export function inArc(angle: number, center: number, halfWidth: number): boolean {
  return Math.abs(angleDiff(center, angle)) <= halfWidth;
}

/** Interpolate from `a` to `b` along the shortest arc, `t` in [0,1]. */
export function lerpAngle(a: number, b: number, t: number): number {
  return wrapAngle(a + angleDiff(a, b) * t);
}
