// Closed-polygon path helpers (Story 2.2) — pure geometry + two Pixi Graphics
// path emitters, extracted from render/hotbar.ts so the hotbar module stays
// about the hotbar. Nothing here knows what a slot is: give it a closed ring of
// points and it walks the perimeter.
//
// The perimeter walk is what makes the hotbar's "conic" cooldown track work on
// a SQUARE (and on a chamfered square): it emits corners exactly, so a shape's
// silhouette survives being drawn as a progress arc.

import type { Graphics } from 'pixi.js';

/** A point on the ring (px). */
export interface PolyPoint {
  x: number;
  y: number;
}

/** Cumulative segment lengths of a closed polygon (last entry = perimeter). */
export function polyLengths(pts: readonly PolyPoint[]): number[] {
  const acc: number[] = [];
  let total = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    total += Math.hypot(b.x - a.x, b.y - a.y);
    acc.push(total);
  }
  return acc;
}

/** Point at arc-length `d` along the closed polygon (clamped to the ring). */
export function polyPointAt(pts: readonly PolyPoint[], acc: readonly number[], d: number): PolyPoint {
  for (let i = 0; i < pts.length; i++) {
    const start = i === 0 ? 0 : acc[i - 1];
    if (d <= acc[i] || i === pts.length - 1) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const segLen = acc[i] - start;
      const t = segLen > 0 ? Math.min(1, Math.max(0, (d - start) / segLen)) : 0;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
  }
  return pts[0];
}

/**
 * Trace the [t0, t1] fraction of a closed polygon's perimeter into `g`.
 * Corners are emitted EXACTLY (the walk stops at each vertex), so a chamfered
 * square keeps its cut when drawn as a progress arc.
 */
export function tracePerimeter(g: Graphics, pts: readonly PolyPoint[], t0: number, t1: number): void {
  if (t1 <= t0) return;
  const acc = polyLengths(pts);
  const total = acc[acc.length - 1];
  const from = t0 * total;
  const to = t1 * total;
  const start = polyPointAt(pts, acc, from);
  g.moveTo(start.x, start.y);
  for (let i = 0; i < pts.length; i++) {
    if (acc[i] <= from) continue;
    if (acc[i] >= to) break;
    const corner = pts[(i + 1) % pts.length];
    g.lineTo(corner.x, corner.y);
  }
  const end = polyPointAt(pts, acc, to);
  g.lineTo(end.x, end.y);
}

/** Trace a closed polygon as a ~50%-duty dashed outline, dashed PER EDGE so
 *  the corners stay crisp. `pitch` is the target dash period (px). */
export function traceDashed(g: Graphics, pts: readonly PolyPoint[], pitch = 8): void {
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const n = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / pitch));
    for (let k = 0; k < n; k++) {
      const at = (t: number): PolyPoint => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      const s = at(k / n);
      const e = at((k + 0.5) / n);
      g.moveTo(s.x, s.y).lineTo(e.x, e.y);
    }
  }
}
