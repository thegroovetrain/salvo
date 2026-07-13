// Geometry helpers for swept-shell collision.
//   - segCircleHit: segment vs circle (islands)
//   - segSegDistance: segment vs segment closest distance (hull capsules)
//   - pointInCircle: containment test
// All operate on plain { x, y } points. Units: world units (u).

import type { Vec2 } from './vec.js';

const EPS = 1e-9;

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

/** True iff point `p` lies within (or on) the circle of radius `r` at `center`. */
export function pointInCircle(p: Vec2, center: Vec2, r: number): boolean {
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  return dx * dx + dy * dy <= r * r;
}

/**
 * Earliest intersection of segment p0->p1 with the circle (center, r),
 * returned as the parameter t in [0, 1] (t=0 at p0, t=1 at p1), or null
 * if the segment never touches the circle. If p0 starts inside the circle,
 * returns 0 (so swept collision cannot tunnel out of an obstacle).
 */
export function segCircleHit(p0: Vec2, p1: Vec2, center: Vec2, r: number): number | null {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const fx = p0.x - center.x;
  const fy = p0.y - center.y;
  const c = fx * fx + fy * fy - r * r;
  if (c <= 0) return 0; // p0 already inside/on the circle

  const a = dx * dx + dy * dy;
  if (a <= EPS) return null; // degenerate segment (a point) outside the circle

  const b = 2 * (fx * dx + fy * dy);
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;

  const t = (-b - Math.sqrt(disc)) / (2 * a); // entry root (smaller)
  if (t < 0 || t > 1) return null;
  return t;
}

/** Closest distance between two real (non-degenerate) segments. */
function segSegCore(d1: Vec2, d2: Vec2, r: Vec2, a: number, e: number): [number, number] {
  const b = d1.x * d2.x + d1.y * d2.y;
  const c = d1.x * r.x + d1.y * r.y;
  const f = d2.x * r.x + d2.y * r.y;
  const denom = a * e - b * b;
  let s = denom > EPS ? clamp01((b * f - c * e) / denom) : 0;
  let t = (b * s + f) / e;
  if (t < 0) {
    t = 0;
    s = clamp01(-c / a);
  } else if (t > 1) {
    t = 1;
    s = clamp01((b - c) / a);
  }
  return [s, t];
}

/** Closest-approach result between two segments: params + distance. */
export interface SegClosest {
  /** Closest-point parameter on segment A (a0->a1), in [0, 1]. */
  s: number;
  /** Closest-point parameter on segment B (b0->b1), in [0, 1]. */
  t: number;
  /** Distance between the closest points. */
  dist: number;
}

/**
 * Closest approach between segment a0->a1 and segment b0->b1: the parameter on
 * each segment plus the gap. `s` (the param on segment A) doubles as the swept
 * hit fraction for shell-vs-hull: a shell segment A sweeping past a hull segment
 * B hits at fraction `s` when `dist <= beam/2 + shellRadius`. Degenerate
 * segments (endpoints equal) are treated as points.
 */
export function segSegClosest(a0: Vec2, a1: Vec2, b0: Vec2, b1: Vec2): SegClosest {
  const d1 = { x: a1.x - a0.x, y: a1.y - a0.y };
  const d2 = { x: b1.x - b0.x, y: b1.y - b0.y };
  const r = { x: a0.x - b0.x, y: a0.y - b0.y };
  const a = d1.x * d1.x + d1.y * d1.y;
  const e = d2.x * d2.x + d2.y * d2.y;

  let s = 0;
  let t = 0;
  if (a <= EPS && e <= EPS) {
    // both segments are points
  } else if (a <= EPS) {
    t = clamp01((d2.x * r.x + d2.y * r.y) / e);
  } else if (e <= EPS) {
    s = clamp01(-(d1.x * r.x + d1.y * r.y) / a);
  } else {
    [s, t] = segSegCore(d1, d2, r, a, e);
  }

  const cx = a0.x + d1.x * s - (b0.x + d2.x * t);
  const cy = a0.y + d1.y * s - (b0.y + d2.y * t);
  return { s, t, dist: Math.hypot(cx, cy) };
}

/**
 * Shortest distance between segment a0->a1 and segment b0->b1.
 * Degenerate segments (endpoints equal) are treated as points.
 * Powers segment-vs-hull-capsule tests: hit iff distance <= beam/2 + shellRadius.
 */
export function segSegDistance(a0: Vec2, a1: Vec2, b0: Vec2, b1: Vec2): number {
  return segSegClosest(a0, a1, b0, b1).dist;
}
