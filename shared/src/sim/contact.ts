// Hull-vs-hull contact: solidity (push-apart) and the contact damage math
// (Story 9.5, Eric rulings 2026-10-11 / 2026-10-12, epic-9 amendments 25 and
// 73–82). Pure, deterministic, zero I/O — the server sim (world.ts) and the
// client predictor (prediction.ts) call THIS one resolver, so a hull pressed
// against another lands in the same place on both sides.
//
// MODEL OF RECORD (amendment 25). For a pair A/B with masses mA, mB (each
// hull's EFFECTIVE max hull, `effectiveStats().maxHp`; a drone's envelope hp;
// a wreck keeps its maxHp), the contact normal n points from B toward A and
// the relative velocity is v = vA − vB, each hull's velocity being
// `speed × (cos heading, sin heading)`:
//   - closing speed  vn = max(0, −v·n), sliding speed vt = |v × n|;
//   - HIT (once per contact, only when vn > allowanceU): E = ½·μ·vn² with
//     μ = mA·mB/(mA+mB); A takes floor(E · mB/(mA+mB) / energyPerHp), B the
//     mirror (`contactHitDamage`). THE LATCH ARMS ONLY ON A CHARGED HIT
//     (Eric 2026-10-13, amendment 83): while a pair is unlatched every tick
//     measures vn, and the first tick over the allowance is the hit — a hull
//     that creeps in under the allowance and then shoves at full speed pays
//     the shove. The latch re-arms only after a tick with no overlap;
//   - BLEED (per second while pressed, amendment 83): A accrues
//     grindPerUnit · (vt + vn) · mB/(mA+mB), B the mirror — sliding AND
//     pressing speed, so holding a push costs both hulls per second
//     (`contactGrindRate`). Unfloored: the server applies the fraction
//     per tick as the burn DoT does;
//   - LAND is the mB → ∞ limit (μ → mA, share → 1) times landSoftness
//     (`landHitDamage`, `landGrindRate`). The land scrape rides the SLIDING
//     speed only: a hull pinned head-on against a rock at the grounding cap
//     does not bleed on its press (amendment 81's "a parked hull takes
//     nothing" is the nearer reading; a hull-on-hull press bleeds because
//     the other hull is a captain's, land is nobody's).
// The latch, the bleed window and every hp write live on the server; this
// module only measures, prices and moves.
//
// SOLIDITY. For every overlapping pair, the minimum push that separates them
// comes from collision.ts's polygon push-out core (`solidEscape` over a
// `Solid` — the same code that pushes hulls off islands; never a second
// geometry implementation) and is split by mass: A moves mB/(mA+mB) of it, B
// moves mA/(mA+mB). An immovable body takes none and the other takes all; two
// immovable bodies are left as they are.
//
// PASS ORDER, BOTH SIDES: this hull pass runs BEFORE the land pass
// (`resolveShipPose`). Land is the hard constraint (no hull ever ends a tick
// inside land); hull overlap is the soft one — a hull shoved toward a coast
// resolves against that coast the same tick, and two hulls both pushed off
// one coast may touch again for a tick, which re-resolves next tick.
//
// ORIENTATION. Each pair is oriented by id (A = the lesser id), so the result
// does not depend on which side listed which hull first. Pairs are visited in
// ascending index order for at most MAX_CONTACT_PASSES sweeps — no unbounded
// loop; the server re-runs the pass every tick.

import type { Vec2 } from '../math/vec.js';
import { polygonOverlapsSolid, solidEscape } from './collision.js';
import type { Solid } from './island.js';
import type { ShipState } from './ship.js';

/** The four contact dials (`CONFIG.ram`), widened to plain numbers so the
 *  harness's `--tune ram.*` overrides type-check. */
export interface RamConfig {
  readonly energyPerHp: number;
  readonly grindPerUnit: number;
  readonly allowanceU: number;
  readonly landSoftness: number;
}

/** One hull taking part in the contact pass. */
export interface ContactBody {
  id: string;
  /** Pose and signed speed; x/y are MUTATED by the push. */
  state: ShipState;
  /** WORLD-space silhouette at `state`'s pose — caller-owned scratch, its
   *  vertices translated in place alongside any push. */
  poly: Vec2[];
  /** hp — the hull's effective max hull (the mass of the energy law). */
  mass: number;
  /** False for a body that must not be pushed (it takes no share). */
  movable: boolean;
}

/** One overlapping pair this pass. */
export interface HullContact {
  /** The lesser id of the pair. */
  a: string;
  /** The greater id of the pair. */
  b: string;
  /** Unit contact normal pointing from B toward A. */
  nx: number;
  ny: number;
  /** u/s — closing speed along −n of (vA − vB), ≥ 0. */
  vn: number;
  /** u/s — magnitude of the tangential relative speed. */
  vt: number;
}

/** Whole-hp damage to each side of a pair. */
export interface ContactSplit {
  a: number;
  b: number;
}

/** Sweeps over all pairs per call; a fixed cap, never a convergence loop. */
const MAX_CONTACT_PASSES = 2;

/** A body seen as a solid for the push-out core, kept in step with its pose. */
interface ContactSolid extends Solid {
  body: ContactBody;
  poly: Vec2[];
}

/**
 * Push every overlapping pair of hulls apart by mass share and report one
 * `HullContact` per overlapping pair (`out` is cleared and refilled). Moved
 * bodies have `state.x/y` and `poly` updated so later pairs see the new pose.
 */
export function resolveHullContacts(
  bodies: readonly ContactBody[],
  out: HullContact[] = [],
): HullContact[] {
  out.length = 0;
  const solids = bodies.map(toSolid);
  for (let pass = 0; pass < MAX_CONTACT_PASSES; pass++) {
    if (!sweep(solids, out)) break;
  }
  return out;
}

/** One sweep over every pair in ascending index order; true iff any body moved. */
function sweep(solids: readonly ContactSolid[], out: HullContact[]): boolean {
  let moved = false;
  for (let i = 0; i < solids.length; i++) {
    for (let j = i + 1; j < solids.length; j++) {
      if (resolvePair(solids[i], solids[j], out)) moved = true;
    }
  }
  return moved;
}

function toSolid(body: ContactBody): ContactSolid {
  const { x, y } = body.state;
  let r = 0;
  for (const p of body.poly) {
    const d = Math.hypot(p.x - x, p.y - y);
    if (d > r) r = d;
  }
  return { body, x, y, r, poly: body.poly, pole: { x, y } };
}

/**
 * Resolve one pair: bounding-circle broadphase, exact overlap, the push-out
 * core's minimal escape of A out of B, the contact record, the mass-split
 * push. True iff a body moved.
 */
function resolvePair(p: ContactSolid, q: ContactSolid, out: HullContact[]): boolean {
  const dc = Math.hypot(p.x - q.x, p.y - q.y);
  if (dc > p.r + q.r) return false;
  const swap = q.body.id < p.body.id;
  const a = swap ? q : p;
  const b = swap ? p : q;
  if (!polygonOverlapsSolid(a.poly, 0, 0, b)) return false;
  // THE CONTACT NORMAL IS THE LINE OF CENTRES (B's centre toward A's), and
  // the closing / sliding speeds are measured on it — NOT on the geometric
  // escape direction. Two pointed bows meeting tip to tip have a minimal
  // escape that is almost sideways (they would slide off each other), which
  // would read a full-speed head-on ram as a 30 u/s glance; the line of
  // centres reads it as the closing speed a captain sees (orchestrator
  // ruling at the 9.5 build, probe on the real silhouettes).
  const c = centreNormal(a, b, dc);
  recordContact(a.body, b.body, c.nx, c.ny, out);
  // Translating A by r_A + r_B + dc along ANY direction separates the bounding
  // circles, so the cap never refuses a clearable pair; the exponential
  // bracket inside the core still finds the FIRST clearing (no teleport).
  const esc = solidEscape(a.poly, b, a.r + b.r + dc);
  if (esc === null) return false;
  // The push follows the geometric escape — EXCEPT when that escape would
  // carry A THROUGH B (its direction opposes the line of centres, which the
  // core can return at a deep overlap where A's deepest vertex sits past B's
  // midline): then the push runs along the line of centres instead, by the
  // same depth, and the pair re-resolves next tick (bounded, never a teleport).
  const through = esc.nx * c.nx + esc.ny * c.ny < 0;
  const px = through ? c.nx : esc.nx;
  const py = through ? c.ny : esc.ny;
  return push(a, b, px * esc.depth, py * esc.depth);
}

/** The contact normal: B's centre toward A's (+x when coincident). */
function centreNormal(a: ContactSolid, b: ContactSolid, dc: number): { nx: number; ny: number } {
  if (dc === 0) return { nx: 1, ny: 0 };
  return { nx: (a.x - b.x) / dc, ny: (a.y - b.y) / dc };
}

/** Record the pair once per call (a second sweep never duplicates it). */
function recordContact(
  a: ContactBody,
  b: ContactBody,
  nx: number,
  ny: number,
  out: HullContact[],
): void {
  for (const c of out) if (c.a === a.id && c.b === b.id) return;
  const vx = velX(a.state) - velX(b.state);
  const vy = velY(a.state) - velY(b.state);
  const vn = Math.max(0, -(vx * nx + vy * ny));
  const vt = Math.abs(vx * ny - vy * nx);
  out.push({ a: a.id, b: b.id, nx, ny, vn, vt });
}

function velX(s: ShipState): number {
  return s.speed * Math.cos(s.heading);
}

function velY(s: ShipState): number {
  return s.speed * Math.sin(s.heading);
}

/**
 * Split the relative separation (dx, dy) — A's escape out of B — by mass:
 * A moves +wA of it, B moves −wB. True iff anything moved.
 */
function push(a: ContactSolid, b: ContactSolid, dx: number, dy: number): boolean {
  const [wA, wB] = pushShares(a.body, b.body);
  if (wA === 0 && wB === 0) return false;
  translate(a, dx * wA, dy * wA);
  translate(b, -dx * wB, -dy * wB);
  return true;
}

/** Each body's share of the separation: the OTHER's mass fraction, an
 *  immovable body none, two immovable bodies nothing. */
function pushShares(a: ContactBody, b: ContactBody): [number, number] {
  if (!a.movable) return b.movable ? [0, 1] : [0, 0];
  if (!b.movable) return [1, 0];
  const total = a.mass + b.mass;
  if (!(total > 0)) return [0.5, 0.5];
  return [b.mass / total, a.mass / total];
}

/** Translate a body (state, solid centre, pole, world polygon) — exact for a
 *  pure translation, so no re-transform from the local silhouette. */
function translate(s: ContactSolid, dx: number, dy: number): void {
  if (dx === 0 && dy === 0) return;
  s.body.state.x += dx;
  s.body.state.y += dy;
  s.x += dx;
  s.y += dy;
  s.pole.x += dx;
  s.pole.y += dy;
  for (const p of s.poly) {
    p.x += dx;
    p.y += dy;
  }
}

/**
 * The HIT of one contact: `E = ½·μ·vn²`, μ = mA·mB/(mA+mB); A takes
 * floor(E · mB/(mA+mB) / energyPerHp), B floor(E · mA/(mA+mB) /
 * energyPerHp). Nothing at or under `allowanceU` of closing speed.
 */
export function contactHitDamage(mA: number, mB: number, vn: number, cfg: RamConfig): ContactSplit {
  if (!(vn > cfg.allowanceU) || !pairIsPriceable(mA, mB)) return NOTHING;
  const total = mA + mB;
  const energy = 0.5 * ((mA * mB) / total) * vn * vn;
  return finiteSplit(
    Math.floor((energy * (mB / total)) / cfg.energyPerHp),
    Math.floor((energy * (mA / total)) / cfg.energyPerHp),
  );
}

/** The BLEED rates (hp/s, unfloored — the server applies the fraction per
 *  tick): grindPerUnit · (vt + vn) × the other hull's mass share, each side
 *  (amendment 83: a sustained push bleeds like a scrape). */
export function contactGrindRate(mA: number, mB: number, vt: number, vn: number, cfg: RamConfig): ContactSplit {
  if (!pairIsPriceable(mA, mB)) return NOTHING;
  const total = mA + mB;
  const rate = cfg.grindPerUnit * (vt + vn);
  return finiteSplit(rate * (mB / total), rate * (mA / total));
}

const NOTHING: ContactSplit = Object.freeze({ a: 0, b: 0 });

/** A pair can be priced only with finite masses summing above zero (the
 *  energy law divides by mA + mB); anything else prices as nothing, so a
 *  NaN never reaches a hull's hp. */
function pairIsPriceable(mA: number, mB: number): boolean {
  return Number.isFinite(mA) && Number.isFinite(mB) && mA + mB > 0;
}

/** A split whose two sides are finite, else nothing (a non-finite speed or
 *  dial prices as nothing rather than NaN). */
function finiteSplit(a: number, b: number): ContactSplit {
  return Number.isFinite(a) && Number.isFinite(b) ? { a, b } : NOTHING;
}

/** A LAND strike: the infinite-mass limit (μ → m, share → 1) softened —
 *  floor(½·m·vn² / energyPerHp · landSoftness); nothing at or under the
 *  allowance. */
export function landHitDamage(m: number, vn: number, cfg: RamConfig): number {
  if (!(vn > cfg.allowanceU)) return 0;
  return finiteOrZero(Math.floor(((0.5 * m * vn * vn) / cfg.energyPerHp) * cfg.landSoftness));
}

/** The LAND scrape rate (hp/s, unfloored): grindPerUnit · vt · landSoftness
 *  on the SLIDING speed only — a hull pressing head-on into a rock takes
 *  nothing beyond its strike (amendment 81; see the header). */
export function landGrindRate(vt: number, cfg: RamConfig): number {
  return finiteOrZero(cfg.grindPerUnit * vt * cfg.landSoftness);
}

function finiteOrZero(n: number): number {
  return Number.isFinite(n) ? n : 0;
}
