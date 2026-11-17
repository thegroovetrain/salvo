// Per-hull silhouette polygons — THE single hull-geometry source (UX-DR9:
// the silhouette IS the hitbox). One closed polygon per hull id, in the
// ship's LOCAL frame: origin at the ship position (midpoint of the bow/stern
// extents), bow along +x (the heading direction — matches stepShip, which
// advances +heading by cos/sin). Client render draws these polygons; server
// projectile/mine hit-tests and island collision consume them. No independent
// hull geometry may exist anywhere else.
//
// Player polygons are the four TRACED battleship outlines (Story 10.4, Eric
// 2026-11-04, epic-10 amendment 7(b) — sim/hullOutlines.ts), normalized so
// bow-to-stern span EXACTLY equals the class hull length and max width EXACTLY
// equals the class beam. The three board-SVG scaffold outlines (torpedoBoat /
// battleship / mineLayer) are gone with their classes (2026-11-04, Story 10.4,
// epic-10 amendment 9). The PvE drone chevrons retired with the fleet at
// Story 10.8 (2026-11-06).
//
// Geometry helpers below are concave-safe (a traced hull is not convex — the
// knuckles and the stern are real, missable cavities) and pure. Local vert
// arrays are precomputed once at module load; transformPolygon reuses a
// caller-provided output array so the 20Hz loop can run allocation-light.

import { CONFIG, SHIP_CLASS_IDS, type Hull, type HullId } from '../constants.js';
import { segSegClosest } from '../math/geom.js';
import type { Vec2 } from '../math/vec.js';
import { HULL_OUTLINES, type TracedPoint } from './hullOutlines.js';

const EPS = 1e-9;

// --- Traced outlines -> local frame -----------------------------------------

/**
 * u — HOW FAR A SIMPLIFIED TRACE MAY SIT FROM THE TRACE AS TRACED (Story 10.4
 * design note: "simplify only below hit-test tolerance"). A traced vertex is
 * dropped only when it lies within this distance of the chord that replaces
 * it, so the polygon never leaves the trace by more than 0.3 u — under a sixth
 * of a shell's own collision radius. It cuts the four hulls' 62 / 42 / 148 /
 * 38 traced points to a few dozen vertices each; every hull edge is paid for
 * on every hit test, coast check and radar paint (orchestrator ruling at the
 * wave-1 gate: 0.1 u left Warspite at 122 vertices).
 */
const TRACE_TOLERANCE_U = 0.3;

/** Distance from `p` to segment a-b. */
function chordDistance(p: Vec2, a: Vec2, b: Vec2): number {
  return segSegClosest(p, p, a, b).dist;
}

/**
 * Douglas-Peucker over the open run `pts[from..to]`: mark every vertex that
 * must stay so the kept chain is within `tol` of the original. The two ends
 * are the caller's anchors (already marked).
 */
function keepWithinTolerance(pts: readonly Vec2[], from: number, to: number, tol: number, keep: boolean[]): void {
  let worst = -1;
  let worstDist = tol;
  for (let i = from + 1; i < to; i += 1) {
    const d = chordDistance(pts[i], pts[from], pts[to]);
    if (d > worstDist) {
      worst = i;
      worstDist = d;
    }
  }
  if (worst < 0) return;
  keep[worst] = true;
  keepWithinTolerance(pts, from, worst, tol, keep);
  keepWithinTolerance(pts, worst, to, tol, keep);
}

/**
 * One SIDE of a hull (bow tip -> stern tip, in u) with the vertices that are
 * not needed dropped. The bow tip, the stern tip and the side's widest vertex
 * are anchors and always stay, so the simplified hull keeps its exact length
 * and beam.
 */
function simplifySide(side: readonly Vec2[], tol: number): Vec2[] {
  const keep = side.map(() => false);
  let widest = 0;
  side.forEach((p, i) => {
    if (Math.abs(p.y) > Math.abs(side[widest].y)) widest = i;
  });
  const last = side.length - 1;
  keep[0] = true;
  keep[widest] = true;
  keep[last] = true;
  keepWithinTolerance(side, 0, widest, tol, keep);
  keepWithinTolerance(side, widest, last, tol, keep);
  return side.filter((_, i) => keep[i]);
}

/**
 * Normalize a traced outline ([fraction of length from the bow, fraction of
 * beam off the centreline]) into the local frame: bow -> +x, span scaled to
 * EXACTLY hull.length, width scaled to EXACTLY hull.beam, centered on the
 * midpoint of the bow/stern and port/starboard extents. The scale is taken
 * from the trace's own extents, so the exactness never depends on the trace
 * spanning 0..1 to the last digit.
 *
 * THE TRACE IS KEPT AS TRACED, less the vertices `TRACE_TOLERANCE_U` makes
 * redundant: no vertex is ever moved or invented. A trace runs bow -> stern
 * down one side and stern -> bow up the other, half its points each; each
 * side is simplified on its own, BOTH read bow -> stern, so a mirror-symmetric
 * trace stays exactly mirror-symmetric.
 *
 * The vertex ORDER leaves the bow down the +y side first — counter-clockwise
 * in the local frame, the winding the retired board outlines had. (Every
 * consumer is winding-agnostic, so this is a convention, not a requirement.)
 */
function normalizeTracedOutline(raw: readonly TracedPoint[], hull: Hull): Vec2[] {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [fx, fy] of raw) {
    if (fx < minX) minX = fx;
    if (fx > maxX) maxX = fx;
    if (fy < minY) minY = fy;
    if (fy > maxY) maxY = fy;
  }
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  const lengthScale = hull.length / (maxX - minX);
  const beamScale = hull.beam / (maxY - minY);
  // fx grows toward the STERN, local x toward the BOW.
  const local = raw.map(([fx, fy]) => ({ x: (midX - fx) * lengthScale, y: (fy - midY) * beamScale }));
  const half = Math.floor(local.length / 2);
  const down = simplifySide(local.slice(0, half), TRACE_TOLERANCE_U); // bow -> stern, the −y side
  const up = simplifySide(local.slice(half).reverse(), TRACE_TOLERANCE_U); // bow -> stern, the +y side
  const verts = [...up, ...down.reverse()]; // bow -> stern down +y, then stern -> bow up −y
  // A trace whose bow (or stern) comes to a single point on the centreline
  // states that point TWICE — once as each side's end (Bismarck's bow). The
  // loop is implicitly closed, so the repeat would be a zero-length edge;
  // drop a vertex that coincides with the one before it (wrap included).
  return verts.filter((p, i) => {
    const prev = verts[(i + verts.length - 1) % verts.length];
    return p.x !== prev.x || p.y !== prev.y;
  });
}

function buildRegistry(): Record<HullId, readonly Vec2[]> {
  const out = {} as Record<HullId, readonly Vec2[]>;
  for (const id of SHIP_CLASS_IDS) {
    out[id] = normalizeTracedOutline(HULL_OUTLINES[id], CONFIG.shipClasses[id].hull);
  }
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

/**
 * Closest point on the polygon BOUNDARY to `p`, with the boundary distance.
 *
 * Uses `Math.sqrt(dx²+dy²)`, NOT `Math.hypot`: this primitive sits on the map
 * GENERATION path (pole of inaccessibility, navigability classification, the
 * repair loop), where cross-engine byte-determinism is absolute. sqrt is
 * IEEE-754 correctly rounded on every engine; hypot is a library approximation
 * that V8 and JavaScriptCore may disagree on by an ulp, which is enough to
 * flip a nearest-edge comparison and desync the generated coastline.
 */
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
    const ddx = p.x - qx;
    const ddy = p.y - qy;
    const d = Math.sqrt(ddx * ddx + ddy * ddy);
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
 * Slack (u) every conservative box reject below keeps between "the boxes are
 * disjoint" and "no edge can be within reach": six orders of magnitude over
 * EPS and over any float dust `segSegClosest` or the ray-cast of
 * `pointInPolygon` can produce at board coordinates, and far below anything a
 * player could observe. A reject is therefore EXACT — it only skips work whose
 * answer is already "no hit".
 */
const BOX_PAD = 1e-3;

/**
 * THE BOX REJECT (Story 11.2 follow-up): is segment a0->a1 provably farther
 * than `radius` from every edge of `poly` AND a0 provably outside it — because
 * the segment's bounding box, grown by `radius` + BOX_PAD, misses the
 * polygon's? True means `segPolygonHit` is null without visiting an edge;
 * false means "unknown — run the exact test". Any NaN compares false and falls
 * through to the exact test, so the degenerate cases keep their old answers.
 * One pass of compares over the vertices against ~one `segSegClosest` per
 * edge: a 20 Hz shell step is a short segment and almost never near a hull.
 */
export function segClearOfPolyBox(a0: Vec2, a1: Vec2, poly: readonly Vec2[], radius: number): boolean {
  const reach = Math.max(radius, 0) + BOX_PAD; // a negative radius never shrinks the box (a0 inside the polygon still hits)
  const lo = Math.min(a0.x, a1.x) - reach;
  const hi = Math.max(a0.x, a1.x) + reach;
  const below = Math.min(a0.y, a1.y) - reach;
  const above = Math.max(a0.y, a1.y) + reach;
  let left = true;
  let right = true;
  let under = true;
  let over = true;
  for (const v of poly) {
    left = left && v.x < lo;
    right = right && v.x > hi;
    under = under && v.y < below;
    over = over && v.y > above;
  }
  return left || right || under || over;
}

/** A polygon's bounding box as [minX, minY, maxX, maxY] (unpadded). */
export type PolyBox = readonly [number, number, number, number];

/** The bounding box of `poly` AS IT IS NOW (see `segClearOfBox`). */
export function polyBox(poly: readonly Vec2[]): PolyBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const v of poly) {
    minX = Math.min(minX, v.x);
    minY = Math.min(minY, v.y);
    maxX = Math.max(maxX, v.x);
    maxY = Math.max(maxY, v.y);
  }
  return [minX, minY, maxX, maxY];
}

/**
 * `segClearOfPolyBox` against a box the caller already holds: true when the
 * segment's box, grown by `radius` + BOX_PAD, misses it — then
 * `segPolygonHit` at that radius is null. The box MUST be `polyBox` of the
 * polygon as it is at the time of the test (a hull polygon is rewritten in
 * place, so a box is only good while the pose it was taken at stands). A box
 * holding a NaN (a polygon with one) never rejects.
 */
export function segClearOfBox(a0: Vec2, a1: Vec2, box: PolyBox, radius: number): boolean {
  const reach = Math.max(radius, 0) + BOX_PAD;
  return (
    box[2] < Math.min(a0.x, a1.x) - reach ||
    box[0] > Math.max(a0.x, a1.x) + reach ||
    box[3] < Math.min(a0.y, a1.y) - reach ||
    box[1] > Math.max(a0.y, a1.y) + reach
  );
}

/** Edges per chunk of a `PolyChunks` index — a handful, so a chunk's box is tight. */
const CHUNK_EDGES = 6;

/**
 * A STATIC polygon's edge boxes (Story 11.2 follow-up): the boundary cut into
 * runs of `CHUNK_EDGES` consecutive edges, each with its bounding box grown by
 * BOX_PAD (`box` holds minX, minY, maxX, maxY per chunk), plus the whole
 * polygon's padded box. Built once for a polygon that never moves (an island
 * coastline); `segPolygonBlocked` reads it. NEVER build one for a hull — hull
 * polygons are rewritten in place every tick.
 */
export interface PolyChunks {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly box: Float64Array;
  readonly count: number;
}

/** Build the edge boxes of a static polygon (see `PolyChunks`). */
export function buildPolyChunks(poly: readonly Vec2[]): PolyChunks {
  const n = poly.length;
  const count = Math.ceil(n / CHUNK_EDGES);
  const box = new Float64Array(count * 4);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let c = 0; c < count; c++) {
    const b = chunkBox(poly, c);
    box.set(b, c * 4);
    minX = Math.min(minX, b[0]);
    minY = Math.min(minY, b[1]);
    maxX = Math.max(maxX, b[2]);
    maxY = Math.max(maxY, b[3]);
  }
  return { minX, minY, maxX, maxY, box, count };
}

/** The padded bounding box of chunk `c`'s edges: edge `i` runs poly[i-1] -> poly[i] (wrapping). */
function chunkBox(poly: readonly Vec2[], c: number): [number, number, number, number] {
  const n = poly.length;
  const b: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  const end = Math.min(n, (c + 1) * CHUNK_EDGES);
  for (let i = c * CHUNK_EDGES; i < end; i++) {
    for (const v of [poly[i], poly[(i + n - 1) % n]]) {
      b[0] = Math.min(b[0], v.x - BOX_PAD);
      b[1] = Math.min(b[1], v.y - BOX_PAD);
      b[2] = Math.max(b[2], v.x + BOX_PAD);
      b[3] = Math.max(b[3], v.y + BOX_PAD);
    }
  }
  return b;
}

/** Could segment a0->a1 come within EPS of an edge in chunk `c`? (`boxMayTouch` on the chunk's padded box.) */
function chunkMayTouch(k: PolyChunks, c: number, a0: Vec2, a1: Vec2): boolean {
  return boxMayTouch(k.box[c * 4], k.box[c * 4 + 1], k.box[c * 4 + 2], k.box[c * 4 + 3], a0, a1);
}

/** Could segment a0->a1 come within EPS of anything inside the PADDED box
 *  (x0, y0)-(x1, y1)? False only when the box is disjoint from the segment's
 *  box or lies wholly on one side of the segment's line — then everything
 *  the box was padded around is at least ~BOX_PAD away. Conservative: any
 *  doubt (NaN included) answers true. */
export function boxMayTouch(x0: number, y0: number, x1: number, y1: number, a0: Vec2, a1: Vec2): boolean {
  if (Math.max(a0.x, a1.x) < x0 || Math.min(a0.x, a1.x) > x1) return false;
  if (Math.max(a0.y, a1.y) < y0 || Math.min(a0.y, a1.y) > y1) return false;
  return !boxOffLine(x0, y0, x1, y1, a0, a1);
}

/** Are the box's four corners all strictly on ONE side of the line through
 *  a0->a1 (the sign of each corner's cross product with the direction)? */
function boxOffLine(x0: number, y0: number, x1: number, y1: number, a0: Vec2, a1: Vec2): boolean {
  const dx = a1.x - a0.x;
  const dy = a1.y - a0.y;
  const c00 = dx * (y0 - a0.y) - dy * (x0 - a0.x);
  const c10 = dx * (y0 - a0.y) - dy * (x1 - a0.x);
  const c01 = dx * (y1 - a0.y) - dy * (x0 - a0.x);
  const c11 = dx * (y1 - a0.y) - dy * (x1 - a0.x);
  return Math.min(c00, c10, c01, c11) > 0 || Math.max(c00, c10, c01, c11) < 0;
}

/**
 * Does any edge of chunk `c` lie within EPS of segment a0->a1? The exact test
 * is the reference's `segSegClosest(...).dist <= EPS`; an edge whose two ends
 * sit on the same side of the segment's LINE, both more than BOX_PAD off it,
 * is skipped first (two cross products: `cross = |d| × distance`, and
 * `|dx| + |dy| >= |d|`, so the margin `m` is at least BOX_PAD of true
 * distance) — such an edge is at least BOX_PAD from the segment. A point
 * segment has `m = 0` and both crosses 0, so nothing is skipped; a NaN never
 * skips.
 */
function chunkBlocks(poly: readonly Vec2[], c: number, a0: Vec2, a1: Vec2): boolean {
  const n = poly.length;
  const end = Math.min(n, (c + 1) * CHUNK_EDGES);
  const dx = a1.x - a0.x;
  const dy = a1.y - a0.y;
  const m = BOX_PAD * (Math.abs(dx) + Math.abs(dy));
  for (let i = c * CHUNK_EDGES; i < end; i++) {
    const p = poly[(i + n - 1) % n];
    const q = poly[i];
    const cp = dx * (p.y - a0.y) - dy * (p.x - a0.x);
    const cq = dx * (q.y - a0.y) - dy * (q.x - a0.x);
    if (sameSideBeyond(cp, cq, m)) continue;
    if (segSegClosest(a0, a1, p, q).dist <= EPS) return true;
  }
  return false;
}

/** Are both crosses past the margin on the same side (see `chunkBlocks`)? */
function sameSideBeyond(cp: number, cq: number, m: number): boolean {
  return (cp > m && cq > m) || (cp < -m && cq < -m);
}

/**
 * Can `p` be inside the polygon these chunks index? False when `p` is outside
 * the polygon's padded box — there `pointInPolygon` is provably false (no
 * edge straddles its row, or every straddling edge is on one side of it and
 * a closed boundary straddles a row an even number of times).
 */
export function pointMayBeInside(chunks: PolyChunks, p: Vec2): boolean {
  return !(p.x < chunks.minX || p.x > chunks.maxX || p.y < chunks.minY || p.y > chunks.maxY);
}

/**
 * The EDGE half of `segPolygonBlocked`: is some edge of the static polygon
 * within EPS of segment a0->a1? (No inside test — the caller answers "is a0
 * inside" itself, e.g. once per origin.)
 */
export function segPolygonEdgeBlocked(a0: Vec2, a1: Vec2, poly: readonly Vec2[], chunks: PolyChunks): boolean {
  if (!boxMayTouch(chunks.minX, chunks.minY, chunks.maxX, chunks.maxY, a0, a1)) return false; // the whole (padded) polygon is out of reach
  for (let c = 0; c < chunks.count; c++) {
    if (chunkMayTouch(chunks, c, a0, a1) && chunkBlocks(poly, c, a0, a1)) return true;
  }
  return false;
}

/**
 * THE LINE-OF-SIGHT form of `segPolygonHit` for a STATIC polygon: exactly
 * `segPolygonHit(a0, a1, poly, 0) !== null` — a0 inside the polygon, or some
 * edge within EPS of the segment — answered through the polygon's prebuilt
 * edge boxes (`chunks`, from `buildPolyChunks(poly)` of this same polygon).
 * The boxes only skip edges that are provably ~BOX_PAD away and the inside
 * test when a0 is outside the polygon's padded box (where the ray-cast is
 * provably false), so the answer is the reference's, bit for bit; the exact
 * edge test is the reference's own `segSegClosest(...).dist <= EPS`
 * (`silhouette.test.ts` holds the two equal on generated coastlines).
 */
export function segPolygonBlocked(a0: Vec2, a1: Vec2, poly: readonly Vec2[], chunks: PolyChunks): boolean {
  if (pointMayBeInside(chunks, a0) && pointInPolygon(a0, poly)) return true;
  return segPolygonEdgeBlocked(a0, a1, poly, chunks);
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
  if (segClearOfPolyBox(a0, a1, poly, radius)) return null;
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

/**
 * Signed shoelace area (positive = CCW). Moved here from islandShape.ts with
 * the cycle-59 capsule deletion — this file is THE one polygon library.
 */
export function polygonArea(poly: readonly Vec2[]): number {
  let s = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    s += poly[j].x * poly[i].y - poly[i].x * poly[j].y;
  }
  return s / 2;
}

/**
 * True iff no two non-adjacent edges properly intersect (simple polygon).
 * Moved here from islandShape.ts with the cycle-59 capsule deletion; shares
 * the private `segmentsCross`/`orient` below with simplifyLoop's guard.
 */
export function polygonIsSimple(poly: readonly Vec2[]): boolean {
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // adjacent through the wrap
      if (segmentsCross(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n])) return false;
    }
  }
  return true;
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
