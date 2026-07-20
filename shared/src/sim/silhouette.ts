// Per-hull silhouette polygons — THE single hull-geometry source (UX-DR9:
// the silhouette IS the hitbox). One closed polygon per hull id, in the
// ship's LOCAL frame: origin at the ship position (midpoint of the bow/stern
// extents), bow along +x (the heading direction — matches stepShip, which
// advances +heading by cos/sin). Client render draws these polygons; server
// projectile/mine hit-tests and island collision consume them. No independent
// hull geometry may exist anywhere else.
//
// Player polygons come from the ratified board SVG outlines (bow-up, y-down
// frames), normalized so bow-to-stern span EXACTLY equals the class hull
// length and max width EXACTLY equals the class beam. Drone polygons are the
// legacy chevron generated procedurally at CONFIG.drones dims (same
// proportions as the old client traceHull: shoulders at 0.3·halfLen, stern
// inset 0.1·halfLen).
//
// Geometry helpers below are concave-safe (the Torpedo Boat stern notch and
// Mine Layer transom notch are real, missable cavities) and pure. Local vert
// arrays are precomputed once at module load; transformPolygon reuses a
// caller-provided output array so the 20Hz loop can run allocation-light.

import { CONFIG, DRONE_HULL_IDS, DRONE_SIZE_IDS, type Hull, type HullId } from '../constants.js';
import { segSegClosest } from '../math/geom.js';
import type { Vec2 } from '../math/vec.js';

const EPS = 1e-9;

// --- Board SVG outlines (bow-up, y-down; viewBox coords) --------------------

/** Raw board outline verts per class, as [svgX, svgY] pairs. */
const BOARD_OUTLINES: Record<keyof typeof CONFIG.shipClasses, readonly (readonly [number, number])[]> = {
  // viewBox 0 0 24 100 — M12 2 L15.5 22 L16.5 58 L15.5 90 L12 84 L8.5 90 L7.5 58 L8.5 22 Z
  torpedoBoat: [
    [12, 2],
    [15.5, 22],
    [16.5, 58],
    [15.5, 90],
    [12, 84], // stern-notch apex
    [8.5, 90],
    [7.5, 58],
    [8.5, 22],
  ],
  // viewBox 0 0 48 124
  battleship: [
    [24, 2],
    [32, 20],
    [34, 30],
    [34, 38],
    [40, 44],
    [40, 84],
    [34, 90],
    [34, 106],
    [30, 118],
    [18, 118],
    [14, 106],
    [14, 90],
    [8, 84],
    [8, 44],
    [14, 38],
    [14, 30],
    [16, 20],
  ],
  // viewBox 0 0 36 88
  mineLayer: [
    [18, 2],
    [24, 22],
    [27, 50],
    [28, 84],
    [21.5, 84], // transom-notch starboard prong
    [21.5, 72],
    [14.5, 72], // transom-notch inner wall
    [14.5, 84],
    [8, 84],
    [9, 50],
    [12, 22],
  ],
};

/**
 * Normalize a board outline into the local frame: bow (min svgY) → +x, span
 * scaled to EXACTLY hull.length, width scaled to EXACTLY hull.beam, centered
 * on the midpoint of the bow/stern and port/starboard extents.
 */
function normalizeBoardOutline(raw: readonly (readonly [number, number])[], hull: Hull): Vec2[] {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of raw) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  const lengthScale = hull.length / (maxY - minY); // svg y-span → hull length
  const beamScale = hull.beam / (maxX - minX); // svg x-span → hull beam
  // Bow-up SVG (−y = forward) → local (+x = forward): rotate so the bow lands
  // on +x; lateral offset becomes local y.
  return raw.map(([x, y]) => ({ x: (midY - y) * lengthScale, y: (x - midX) * beamScale }));
}

/** The legacy chevron at (length, beam): bow tip, shoulders at 0.3·halfLen, stern inset 0.1·halfLen. */
function droneChevron(hull: Hull): Vec2[] {
  const hl = hull.length / 2;
  const hb = hull.beam / 2;
  const shoulder = hl * 0.3;
  const stern = -hl + hl * 0.1;
  return [
    { x: hl, y: 0 }, // bow tip
    { x: shoulder, y: -hb },
    { x: stern, y: -hb },
    { x: -hl, y: 0 }, // stern center
    { x: stern, y: hb },
    { x: shoulder, y: hb },
  ];
}

function buildRegistry(): Record<HullId, readonly Vec2[]> {
  const out = {} as Record<HullId, readonly Vec2[]>;
  for (const id of ['torpedoBoat', 'battleship', 'mineLayer'] as const) {
    out[id] = normalizeBoardOutline(BOARD_OUTLINES[id], CONFIG.shipClasses[id].hull);
  }
  DRONE_HULL_IDS.forEach((id, i) => {
    out[id] = droneChevron(CONFIG.drones[DRONE_SIZE_IDS[i]].hull);
  });
  return out;
}

/** Local-frame silhouette per hull id. Closed implicitly (last vert → first). */
const SILHOUETTES: Readonly<Record<HullId, readonly Vec2[]>> = buildRegistry();

/** The local-frame silhouette polygon for a hull id (bow at +x, origin-centered). */
export function hullSilhouette(id: HullId): readonly Vec2[] {
  return SILHOUETTES[id];
}

// --- Pose transform ---------------------------------------------------------

/**
 * Transform a local polygon to a world pose (x, y, heading). Reuses `out`
 * (resizing it to the polygon's length and mutating its Vec2s in place) so
 * per-tick callers can hold one scratch array per ship instead of allocating.
 */
export function transformPolygon(
  local: readonly Vec2[],
  x: number,
  y: number,
  heading: number,
  out: Vec2[] = [],
): Vec2[] {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  out.length = local.length;
  for (let i = 0; i < local.length; i++) {
    const p = local[i];
    const o = out[i] ?? (out[i] = { x: 0, y: 0 });
    o.x = x + c * p.x - s * p.y;
    o.y = y + s * p.x + c * p.y;
  }
  return out;
}

// --- Concave-safe polygon queries -------------------------------------------

/**
 * True iff `p` is inside the closed polygon (even-odd ray crossing).
 * Concave-safe. Points exactly ON an edge are boundary-ambiguous, as usual
 * for ray casting — distance-based callers already read an on-edge point as
 * distance 0, so nothing gameplay-facing depends on that ambiguity.
 */
export function pointInPolygon(p: Vec2, poly: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    const crosses = a.y > p.y !== b.y > p.y;
    if (crosses && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Closest point on the polygon BOUNDARY to `p`, with the boundary distance. */
export function closestPointOnPolygon(p: Vec2, poly: readonly Vec2[]): Vec2 & { dist: number } {
  let best = { x: poly[0].x, y: poly[0].y, dist: Infinity };
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j];
    const b = poly[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = len2 > EPS ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const qx = a.x + dx * t;
    const qy = a.y + dy * t;
    const d = Math.hypot(p.x - qx, p.y - qy);
    if (d < best.dist) best = { x: qx, y: qy, dist: d };
  }
  return best;
}

/** Distance from a point to the polygon (0 when inside). Concave-safe. */
export function pointPolygonDistance(p: Vec2, poly: readonly Vec2[]): number {
  if (pointInPolygon(p, poly)) return 0;
  return closestPointOnPolygon(p, poly).dist;
}

/** Min distance from segment a0->a1 to the polygon (0 when intersecting or inside). */
export function segPolygonDistance(a0: Vec2, a1: Vec2, poly: readonly Vec2[]): number {
  if (pointInPolygon(a0, poly)) return 0;
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const d = segSegClosest(a0, a1, poly[j], poly[i]).dist;
    if (d < best) best = d;
  }
  return best;
}

/**
 * Swept-projectile hit test: earliest fraction along a0->a1 at which the
 * segment comes within `radius` of the polygon (edge closest-approach, the
 * same rule the old capsule test used), or 0 when a0 starts inside, or null
 * on a clean miss. Concave cavities are missable: a path that never comes
 * within `radius` of any EDGE and never enters the interior does not hit.
 */
export function segPolygonHit(
  a0: Vec2,
  a1: Vec2,
  poly: readonly Vec2[],
  radius: number,
): number | null {
  if (pointInPolygon(a0, poly)) return 0;
  let best: number | null = null;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const c = segSegClosest(a0, a1, poly[j], poly[i]);
    if (c.dist <= radius && (best === null || c.s < best)) best = c.s;
  }
  return best;
}

/** Max distance from the local origin to any vert (bounding-circle radius). */
export function polygonMaxRadius(poly: readonly Vec2[]): number {
  let max = 0;
  for (const p of poly) {
    const d = Math.hypot(p.x, p.y);
    if (d > max) max = d;
  }
  return max;
}
