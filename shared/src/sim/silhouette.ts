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

/**
 * Min distance from segment a0->a1 to the polygon (0 when intersecting or
 * inside). NOTE for callers: "0 when intersecting" is 0 up to float dust —
 * segSegClosest returns ~1e-16 (scaling with coordinate magnitude) rather
 * than exactly 0 for a real crossing, so never test this result with `=== 0`
 * or `<= 0`; compare against a tolerance, as segPolygonHit does with EPS.
 */
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
    // `radius + EPS`, not `radius`. At radius 0 — the island LOS / shell /
    // aim-preview path — a bare `<= radius` is an exact float comparison
    // against zero, and segSegClosest never returns exactly zero for a real
    // crossing: it solves for the closest-approach parameters and multiplies
    // BACK to a point before Math.hypot, so a genuine transversal returns
    // float dust (measured 7.2e-16 at coords ~10, scaling with coordinate
    // magnitude to ~2e-13 at the 2400u board edge). Axis-aligned integer
    // fixtures happen to cancel to 0.0 and hid this; real fractal islands do
    // not, and 38%/32% of provably-crossing segments read as clean misses for
    // shells and LOS respectively. EPS (1e-9) clears the worst-case dust by
    // ~4 orders of magnitude while staying far below any gameplay-observable
    // threshold for radius > 0 callers (hull tests pass beam/2 + shellRadius,
    // several world units). The tolerance belongs HERE, at the comparison —
    // segSegClosest is a general-purpose primitive and must not snap its own
    // output to zero. It does not make a cove solid: a 1e-9 widening of the
    // coastline leaves every real cavity genuinely missable.
    if (c.dist <= radius + EPS && (best === null || c.s < best)) best = c.s;
  }
  return best;
}

/**
 * The polygon's TOTAL extent projected onto the axis perpendicular to
 * `bearing` (radians): the width the hull subtends across an observer's line
 * of sight — the `return`-grammar echo-size primitive (amendment 66). A
 * battleship bow-on (bearing along the hull axis) projects its beam; the same
 * hull abeam projects its full length. Max−min of the projections, so it is
 * translation-invariant (pass a world-posed polygon or a local one, same
 * answer) and invariant under `bearing + π` (a hull is the same width from
 * either side). Pure aspect geometry in world units — range attenuation is a
 * client render concern and never rides the wire.
 */
export function perpendicularExtent(poly: readonly Vec2[], bearing: number): number {
  const ux = -Math.sin(bearing);
  const uy = Math.cos(bearing);
  let min = Infinity;
  let max = -Infinity;
  for (const p of poly) {
    const d = p.x * ux + p.y * uy;
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return max - min;
}

/**
 * How far the polygon's ORIGIN may sit from a circle's centre, along the unit
 * direction `(ux, uy)`, with the polygon rotated to `heading`, before any vert
 * leaves that circle. The heading-aware companion to `polygonMaxRadius`: the
 * bounding radius answers the same question for the WORST heading, this one
 * for the actual pose (a hull running parallel to the map edge is held off by
 * its beam, not by its stern-corner diagonal).
 *
 * EXACT, not a tangent-line approximation: for each vert `v` the constraint
 * |L·u + v| ≤ radius is a quadratic in L whose only non-negative root is
 * √((u·v)² + radius² − |v|²) − (u·v) (the other root is negative whenever the
 * vert fits in the circle at all), so the limit is the MIN of those over the
 * verts. One sqrt per vert, no allocation.
 */
export function polygonFitLimit(
  poly: readonly Vec2[],
  heading: number,
  ux: number,
  uy: number,
  radius: number,
): number {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  const r2 = radius * radius;
  let limit = Infinity;
  for (const p of poly) {
    const vx = c * p.x - s * p.y;
    const vy = s * p.x + c * p.y;
    const dot = ux * vx + uy * vy;
    const disc = dot * dot + r2 - (vx * vx + vy * vy);
    const l = disc <= 0 ? 0 : Math.sqrt(disc) - dot;
    if (l < limit) limit = l;
  }
  return limit > 0 ? limit : 0;
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

// --- Visvalingam-Whyatt simplification (island coastline vertex budget) ----
//
// Ported from the fBm-terrain prototype (`tmp-fbm/poly.mjs`), extended with a
// self-intersection guard the prototype didn't need (its callers accepted the
// small measured failure rate; the production seam does not).

/** Twice the (unsigned) area of triangle a-b-c — the VW "effective area" of `b`. */
function triArea2(a: Vec2, b: Vec2, c: Vec2): number {
  const v = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  return v < 0 ? -v : v;
}

/** Signed area x2 of a-b-c; sign gives turn direction. Building block for segmentsCross. */
function orient(a: Vec2, b: Vec2, c: Vec2): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

/**
 * True iff segments a-b and c-d cross transversally. A shared/touching
 * endpoint is NOT a crossing (both `orient` products land at 0, failing the
 * strict `< 0`), which is the right call for adjacent polygon edges — they
 * are SUPPOSED to touch at their shared vertex.
 */
function segmentsCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

/**
 * True iff collapsing vertex `i` of the linked-list polygon (replacing edges
 * prev(i)->i->next(i) with a single prev(i)->next(i) edge) would cross some
 * OTHER edge of the polygon. Walks the ring from the vertex after next(i) up
 * to (excluding) the vertex before prev(i) — precisely the edges that don't
 * already share an endpoint with the new edge, since a shared-endpoint edge
 * can only touch it at a corner, never cross it. O(n) per candidate, so the
 * simplification loop below stays O(n^2) overall, same order as vertex
 * selection alone.
 */
function removalCrosses(pts: readonly Vec2[], prev: Int32Array, next: Int32Array, i: number): boolean {
  const a = prev[i];
  const b = next[i];
  const pa = pts[a];
  const pb = pts[b];
  let k = next[b];
  while (next[k] !== a) {
    if (segmentsCross(pa, pb, pts[k], pts[next[k]])) return true;
    k = next[k];
  }
  return false;
}

/**
 * Lowest-area ALIVE & UNLOCKED vertex; ties broken by lowest index — the scan
 * runs ascending and only a STRICTLY smaller area replaces the incumbent, so
 * an equal-area later candidate never wins. Returns -1 once none remain.
 */
function pickLeastArea(n: number, alive: Uint8Array, locked: Uint8Array, area: Float64Array): number {
  let best = -1;
  let bestArea = Infinity;
  for (let i = 0; i < n; i++) {
    if (!alive[i] || locked[i]) continue;
    if (area[i] < bestArea) {
      bestArea = area[i];
      best = i;
    }
  }
  return best;
}

/**
 * Visvalingam-Whyatt simplification of a CLOSED loop, reducing it to at most
 * `targetCount` vertices (never below 3, never above the input length).
 *
 * Chosen over Douglas-Peucker: vertex COUNT is the scarce resource here —
 * every island vertex is paid per tick by LOS and ship-island collision, and
 * per frame by the client radar terrain bake. VW removes vertices in
 * ascending order of "effective area" (the area of the triangle a vertex
 * forms with its two neighbors), which gives a direct count dial; DP's
 * distance tolerance only controls count indirectly, and swings wildly
 * between a smooth lobe and a ragged headland at the same tolerance.
 *
 * CLOSED, not open-polyline VW: the neighbor lookup wraps mod n like every
 * other polygon walk in this file, and every vertex (including index 0) is
 * exactly as removable as any other — no fixed endpoints.
 *
 * Deterministic: `pickLeastArea` breaks ties by lowest index, never by
 * Set/Map iteration order or a float comparison that could flip between
 * engines. Same input -> byte-identical output, every run, every engine.
 *
 * Self-intersection guard: removing a vertex can fold a concave stretch of
 * the boundary across another part of it (verified against a real failing
 * case in this function's test suite — a naive count-only VW pass produces a
 * crossing there). Before a removal is committed, `removalCrosses` checks the
 * replacement edge against every other current edge; a vertex that would
 * break simplicity is LOCKED (not removed on this call, ever) and the search
 * moves to the next-lowest-area candidate. Locking rather than
 * skip-and-retry is what guarantees termination — each while-loop iteration
 * either removes a vertex or permanently shrinks the removable set, so the
 * loop can never spin on a vertex whose neighbors haven't changed. One
 * consequence: if enough vertices lock, the result can land ABOVE
 * `targetCount` — a safety floor, not a bug.
 *
 * Pure: returns a new array; never mutates `poly` or its Vec2 elements.
 */
export function simplifyLoop(poly: readonly Vec2[], targetCount: number): Vec2[] {
  const n = poly.length;
  const minVerts = 3;
  const target = Math.max(minVerts, Math.floor(targetCount));
  if (n <= target) return poly.slice();

  const pts = poly;
  const alive = new Uint8Array(n).fill(1);
  const locked = new Uint8Array(n);
  const prev = new Int32Array(n);
  const next = new Int32Array(n);
  const area = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    prev[i] = (i - 1 + n) % n;
    next[i] = (i + 1) % n;
  }
  for (let i = 0; i < n; i++) area[i] = triArea2(pts[prev[i]], pts[i], pts[next[i]]);

  let count = n;
  while (count > target) {
    const best = pickLeastArea(n, alive, locked, area);
    if (best < 0) break; // every remaining vertex is locked — cannot simplify further
    if (removalCrosses(pts, prev, next, best)) {
      locked[best] = 1;
      continue;
    }
    alive[best] = 0;
    count--;
    const p = prev[best];
    const q = next[best];
    next[p] = q;
    prev[q] = p;
    area[p] = triArea2(pts[prev[p]], pts[p], pts[next[p]]);
    area[q] = triArea2(pts[prev[q]], pts[q], pts[next[q]]);
  }

  const out: Vec2[] = [];
  let start = 0;
  while (!alive[start]) start++;
  let i = start;
  do {
    out.push(pts[i]);
    i = next[i];
  } while (i !== start);
  return out;
}
