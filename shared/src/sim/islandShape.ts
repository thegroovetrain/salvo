// The fractal landmass SHAPE builder (cycle 51) — the geometry half of
// sim/map.ts (which stays the orchestrator: placement, budget, validation).
//
// Each landmass is a 1-3 point SKELETON (1 pt = blob, 2-3 pts = ridge)
// wrapped in a boundary polygon: the capsule around the skeleton is sampled
// at N points (32 when halfWidth < 90, else 48), each displaced outward by
// halfWidth * m_i where `m` comes from PERIODIC MIDPOINT DISPLACEMENT (the
// fractal): 4 seed values around 1.0, subdivided to N with the displacement
// amplitude scaled by ROUGHNESS per level, wrapping seamlessly (index math
// mod N) so the coastline closes without a seam. Every m is clamped to
// [M_MIN, M_MAX] — that bound IS MAX_CONCAVITY, and strictly positive
// offsets along capsule normals keep the polygon STAR-SHAPED about the
// skeleton (asserted per roll; self-intersecting or non-star rolls reroll
// from the SAME rng stream).

import { wrapAngle } from '../math/angle.js';
import type { Rng } from '../math/rng.js';
import type { Vec2 } from '../math/vec.js';
import type { Island } from '../types.js';
import { nearestOnSkeleton } from './island.js';
import { closestPointOnPolygon, pointInPolygon } from './silhouette.js';

const TAU = Math.PI * 2;
const HALF_PI = Math.PI / 2;

export const M_MIN = 0.45; // fractal offset clamp — the star-shape / concavity floor
export const M_MAX = 1.6; // fractal offset clamp ceiling
export const MAX_CONCAVITY = M_MAX / M_MIN; // the ratified concavity bound the clamp pins
export const ROUGHNESS = 0.55; // midpoint-displacement amplitude decay per level

const SHAPE_ATTEMPTS = 5; // fractal rerolls per landmass on self-intersection
const MAX_TURN = (35 * Math.PI) / 180; // ridge joint turn bound

// --- Fractal offsets (periodic midpoint displacement) ------------------------

/** Insert `mult - 1` displaced points into every interval (wraps mod length). */
function subdivideRing(vals: readonly number[], rng: Rng, amp: number, mult: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < vals.length; i++) {
    const a = vals[i];
    const b = vals[(i + 1) % vals.length];
    out.push(a);
    for (let j = 1; j < mult; j++) {
      out.push(a + ((b - a) * j) / mult + rng.float(-amp, amp));
    }
  }
  return out;
}

/**
 * Periodic midpoint displacement: 4 seed values around 1.0, subdivided to
 * exactly `n` (32: x2 x2 x2 — 48: x2 x2 x3), amplitude scaled by ROUGHNESS
 * each level, every value clamped to [M_MIN, M_MAX]. Wraps seamlessly (all
 * index arithmetic is mod length) so the coastline closes without a seam.
 */
export function fractalOffsets(rng: Rng, n: number): number[] {
  let vals = [0, 0, 0, 0].map(() => rng.float(0.7, 1.3));
  let amp = 0.3;
  while (vals.length < n) {
    const mult = (n / vals.length) % 2 === 0 ? 2 : 3;
    vals = subdivideRing(vals, rng, amp, mult);
    amp *= ROUGHNESS;
  }
  return vals.map((m) => Math.min(M_MAX, Math.max(M_MIN, m)));
}

// --- Capsule sampling around the skeleton ------------------------------------

interface Frame {
  ax: number; // anchor ON the skeleton polyline (local space)
  ay: number;
  na: number; // outward normal angle (rad)
}

interface SkelSeg {
  x: number; // segment start
  y: number;
  ang: number; // direction angle
  len: number;
  cum: number; // arclength at segment start
}

function skeletonSegments(skel: readonly Vec2[]): { segs: SkelSeg[]; total: number } {
  const segs: SkelSeg[] = [];
  let cum = 0;
  for (let i = 0; i + 1 < skel.length; i++) {
    const dx = skel[i + 1].x - skel[i].x;
    const dy = skel[i + 1].y - skel[i].y;
    const len = Math.hypot(dx, dy);
    segs.push({ x: skel[i].x, y: skel[i].y, ang: Math.atan2(dy, dx), len, cum });
    cum += len;
  }
  return { segs, total: cum };
}

/** Point + direction angle at arclength `t` along the skeleton polyline. */
function polylineAt(segs: readonly SkelSeg[], t: number): { x: number; y: number; ang: number } {
  let seg = segs[segs.length - 1];
  for (const s of segs) {
    if (t <= s.cum + s.len) {
      seg = s;
      break;
    }
  }
  const d = t - seg.cum;
  return { x: seg.x + Math.cos(seg.ang) * d, y: seg.y + Math.sin(seg.ang) * d, ang: seg.ang };
}

/** The capsule-boundary frame at walk parameter `u` (CCW: right side, far cap, left side, near cap). */
function frameAt(
  skel: readonly Vec2[],
  segs: readonly SkelSeg[],
  total: number,
  capLen: number,
  hw: number,
  u: number,
): Frame {
  if (u < total) {
    const p = polylineAt(segs, u);
    return { ax: p.x, ay: p.y, na: p.ang - HALF_PI };
  }
  if (u < total + capLen) {
    const end = skel[skel.length - 1];
    const last = segs[segs.length - 1];
    return { ax: end.x, ay: end.y, na: last.ang - HALF_PI + (u - total) / hw };
  }
  if (u < 2 * total + capLen) {
    const p = polylineAt(segs, total - (u - total - capLen));
    return { ax: p.x, ay: p.y, na: p.ang + HALF_PI };
  }
  return { ax: skel[0].x, ay: skel[0].y, na: segs[0].ang + HALF_PI + (u - 2 * total - capLen) / hw };
}

/** N uniformly-spaced capsule-boundary frames around the skeleton (CCW). */
function capsuleFrames(skel: readonly Vec2[], hw: number, n: number): Frame[] {
  const out: Frame[] = [];
  if (skel.length === 1) {
    for (let i = 0; i < n; i++) {
      out.push({ ax: skel[0].x, ay: skel[0].y, na: (TAU * i) / n });
    }
    return out;
  }
  const { segs, total } = skeletonSegments(skel);
  const capLen = Math.PI * hw;
  const perim = 2 * total + 2 * capLen;
  for (let i = 0; i < n; i++) {
    out.push(frameAt(skel, segs, total, capLen, hw, (perim * i) / n));
  }
  return out;
}

// --- Polygon predicates -------------------------------------------------------

function orient(a: Vec2, b: Vec2, c: Vec2): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function segsCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

/** True iff no two non-adjacent edges properly intersect (simple polygon). */
export function polygonIsSimple(poly: readonly Vec2[]): boolean {
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // adjacent through the wrap
      if (segsCross(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n])) return false;
    }
  }
  return true;
}

/** Signed shoelace area (positive = CCW). */
export function polygonArea(poly: readonly Vec2[]): number {
  let s = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    s += poly[j].x * poly[i].y - poly[i].x * poly[j].y;
  }
  return s / 2;
}

/**
 * True iff the segment from `b`'s nearest skeleton point out to `b` stays
 * inside the polygon, sampled at k/9, k = 1..8 (the test suite asserts a
 * subset of these fractions). `nearestOnSkeleton` is imported from the
 * island.ts query seam so the accept predicate and the runtime push-out
 * consumer can never disagree about what "the skeleton" means.
 */
function skeletonRayClear(b: Vec2, poly: readonly Vec2[], skel: readonly Vec2[]): boolean {
  const s = nearestOnSkeleton(b, skel);
  for (let k = 1; k <= 8; k++) {
    const t = k / 9;
    const p = { x: s.x + (b.x - s.x) * t, y: s.y + (b.y - s.y) * t };
    if (!pointInPolygon(p, poly)) return false;
  }
  return true;
}

/**
 * Forward crossings (t > 0) of the ray from `p` along unit `d` with the
 * polygon boundary. Half-open side rule ((sA > 0) !== (sB > 0)) so a ray
 * grazing a vertex counts once, never twice. `p` inside => odd count; a count
 * of exactly 1 means the ray leaves the land and NEVER RE-ENTERS it.
 */
function rayCrossings(p: Vec2, dx: number, dy: number, poly: readonly Vec2[]): number {
  let n = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j];
    const b = poly[i];
    const sa = dx * (a.y - p.y) - dy * (a.x - p.x);
    const sb = dx * (b.y - p.y) - dy * (b.x - p.x);
    if (sa > 0 === sb > 0) continue;
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    if ((((a.x - p.x) * ey - (a.y - p.y) * ex) / (dx * ey - dy * ex)) > 0) n++;
  }
  return n;
}

const RAY_SAMPLES = 288; // escape-ray anchors walked around the capsule perimeter
const JOINT_FAN = 48; // extra rays fanned across each ridge joint's normal cone

/**
 * Every (anchor, direction) an escape ray can take — the NORMAL CONE of the
 * skeleton polyline, which is exactly the family `skeletonNormal` produces:
 * a `capsuleFrames` walk already enumerates both side normals along every
 * segment plus the 180-degree fan at each end cap. What it does NOT enumerate
 * is the wedge at an interior ridge JOINT, where the outer-side normal swings
 * by the joint's turn angle — and that wedge is where every residual
 * violation lived once the two `nearestOnSkeleton` definitions were unified.
 */
function escapeRays(skel: readonly Vec2[], hw: number): Frame[] {
  const out = capsuleFrames(skel, hw, RAY_SAMPLES);
  if (skel.length < 3) return out;
  const { segs } = skeletonSegments(skel);
  for (let j = 1; j < segs.length; j++) {
    const turn = wrapAngle(segs[j].ang - segs[j - 1].ang);
    const side = turn > 0 ? -HALF_PI : HALF_PI; // the convex side of the joint
    for (let k = 0; k <= JOINT_FAN; k++) {
      const na = segs[j - 1].ang + side + (turn * k) / JOINT_FAN;
      out.push({ ax: skel[j].x, ay: skel[j].y, na });
    }
  }
  return out;
}

/**
 * Star-shapedness about the skeleton polyline — the load-bearing escape
 * guarantee: from anywhere inside the coastline the push-out direction leads
 * out and STAYS out, so no concave pocket can trap a hull and no "minimal
 * clearing translation" can slide one along the coast.
 *
 * Two complementary samplings, both anchored on the SAME `nearestOnSkeleton`
 * the runtime push-out uses:
 *  1. BOUNDARY: vertices **and edge midpoints**. Vertices alone were the
 *     shipped blind spot — the offset ring is sampled at only 32/48 frames and
 *     the fractal displaces neighbours independently, so a midpoint's ray can
 *     clip a neighbouring lobe while both endpoints are clean.
 *  2. RAY FAMILY: every escape ray must cross the coastline exactly ONCE. The
 *     boundary sampling alone cannot see this near a 3-point ridge's joint,
 *     because there the nearest-skeleton map is NOT constant along the outward
 *     ray, so a boundary violation need not exist for an interior one to.
 */
function isStarShaped(poly: readonly Vec2[], skel: readonly Vec2[], hw: number): boolean {
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    if (!skeletonRayClear(poly[i], poly, skel)) return false;
    const mid = { x: (poly[j].x + poly[i].x) / 2, y: (poly[j].y + poly[i].y) / 2 };
    if (!skeletonRayClear(mid, poly, skel)) return false;
  }
  for (const f of escapeRays(skel, hw)) {
    const p = { x: f.ax, y: f.ay };
    if (rayCrossings(p, Math.cos(f.na), Math.sin(f.na), poly) !== 1) return false;
  }
  return true;
}

// --- Landmass shapes ---------------------------------------------------------

/** A local-frame landmass shape, centred on its skeleton centroid. */
export interface Shape {
  poly: Vec2[]; // local, centred on the skeleton centroid (= the bounding centre)
  skel: Vec2[]; // local skeleton points
  rLocal: number; // bounding radius about the origin
  core: number; // largest origin-centred disc radius inside poly (0 if origin outside)
  area: number; // |shoelace|
}

/** Roll a local skeleton (centroid at origin): blob = 1 pt, ridge = 2-3 pts. */
function rollSkeleton(rng: Rng, hw: number, kind: 'blob' | 'ridge'): Vec2[] {
  if (kind === 'blob') return [{ x: 0, y: 0 }];
  const total = hw * rng.float(2, 5);
  const phi = rng.float(0, TAU);
  const pts: Vec2[] = [{ x: 0, y: 0 }];
  if (rng.next() < 0.5) {
    pts.push({ x: Math.cos(phi) * total, y: Math.sin(phi) * total });
  } else {
    const len1 = total * rng.float(0.4, 0.6);
    const turn = rng.float(-MAX_TURN, MAX_TURN);
    const mid = { x: Math.cos(phi) * len1, y: Math.sin(phi) * len1 };
    pts.push(mid);
    pts.push({
      x: mid.x + Math.cos(phi + turn) * (total - len1),
      y: mid.y + Math.sin(phi + turn) * (total - len1),
    });
  }
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  return pts.map((p) => ({ x: p.x - cx, y: p.y - cy }));
}

/**
 * Build one landmass shape: skeleton -> capsule frames -> fractal offsets ->
 * boundary polygon. Rejects self-intersecting or non-star-shaped rolls and
 * rerolls the offsets from the SAME rng stream (bounded attempts).
 */
export function buildShape(rng: Rng, hw: number, kind: 'blob' | 'ridge'): Shape | null {
  const skel = rollSkeleton(rng, hw, kind);
  const n = hw < 90 ? 32 : 48;
  const frames = capsuleFrames(skel, hw, n);
  for (let attempt = 0; attempt < SHAPE_ATTEMPTS; attempt++) {
    const m = fractalOffsets(rng, n);
    const poly = frames.map((f, i) => ({
      x: f.ax + Math.cos(f.na) * hw * m[i],
      y: f.ay + Math.sin(f.na) * hw * m[i],
    }));
    if (!polygonIsSimple(poly) || !isStarShaped(poly, skel, hw)) continue;
    return finishShape(poly, skel);
  }
  return null;
}

function finishShape(poly: Vec2[], skel: Vec2[]): Shape {
  let rLocal = 0;
  for (const p of poly) {
    const d = Math.hypot(p.x, p.y);
    if (d > rLocal) rLocal = d;
  }
  const origin = { x: 0, y: 0 };
  const core = pointInPolygon(origin, poly) ? closestPointOnPolygon(origin, poly).dist : 0;
  return { poly, skel, rLocal, core, area: Math.abs(polygonArea(poly)) };
}

/**
 * Assemble an Island from a WORLD-SPACE polygon (+ optional skeleton points,
 * default: the polygon centroid). Computes the bounding circle about the
 * skeleton centroid and the core radius. Exported for consumer test fixtures.
 */
export function islandFromPolygon(poly: readonly Vec2[], skeleton?: readonly Vec2[]): Island {
  let skel: Vec2[];
  if (skeleton && skeleton.length > 0) {
    skel = skeleton.map((p) => ({ x: p.x, y: p.y }));
  } else {
    const cx = poly.reduce((s, p) => s + p.x, 0) / poly.length;
    const cy = poly.reduce((s, p) => s + p.y, 0) / poly.length;
    skel = [{ x: cx, y: cy }];
  }
  const x = skel.reduce((s, p) => s + p.x, 0) / skel.length;
  const y = skel.reduce((s, p) => s + p.y, 0) / skel.length;
  let r = 0;
  for (const p of poly) {
    const d = Math.hypot(p.x - x, p.y - y);
    if (d > r) r = d;
  }
  const centre = { x, y };
  const core = pointInPolygon(centre, poly) ? closestPointOnPolygon(centre, poly).dist : 0;
  return { x, y, r, poly: poly.map((p) => ({ x: p.x, y: p.y })), skeleton: skel, core };
}
