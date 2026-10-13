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
//     mirror (`contactHitDamage`);
//   - GRIND (per second while pressed): A accrues grindPerUnit · vt ·
//     mB/(mA+mB), B the mirror — unfloored, the server pools the fraction
//     (`contactGrindRate`);
//   - LAND is the mB → ∞ limit (μ → mA, share → 1) times landSoftness
//     (`landHitDamage`, `landGrindRate`).
// The latch (once per contact), the grind pools and every hp write live on the
// server; this module only measures and moves.
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
  // Translating A by r_A + r_B + dc along ANY direction separates the bounding
  // circles, so the cap never refuses a clearable pair; the exponential
  // bracket inside the core still finds the FIRST clearing (no teleport).
  const esc = solidEscape(a.poly, b, a.r + b.r + dc);
  const n = esc ?? centreNormal(a, b, dc);
  recordContact(a.body, b.body, n.nx, n.ny, out);
  if (esc === null) return false;
  return push(a, b, esc.nx * esc.depth, esc.ny * esc.depth);
}

/** Fallback normal (B's centre toward A's; +x when coincident) for a pair the
 *  core could not clear — the pair still counts as a contact this tick. */
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
  if (!(vn > cfg.allowanceU)) return { a: 0, b: 0 };
  const total = mA + mB;
  const energy = 0.5 * ((mA * mB) / total) * vn * vn;
  return {
    a: Math.floor((energy * (mB / total)) / cfg.energyPerHp),
    b: Math.floor((energy * (mA / total)) / cfg.energyPerHp),
  };
}

/** The GRIND rates (hp/s, unfloored — the server pools the fraction):
 *  grindPerUnit · vt × the other hull's mass share, each side. */
export function contactGrindRate(mA: number, mB: number, vt: number, cfg: RamConfig): ContactSplit {
  const total = mA + mB;
  return {
    a: cfg.grindPerUnit * vt * (mB / total),
    b: cfg.grindPerUnit * vt * (mA / total),
  };
}

/** A LAND strike: the infinite-mass limit (μ → m, share → 1) softened —
 *  floor(½·m·vn² / energyPerHp · landSoftness); nothing at or under the
 *  allowance. */
export function landHitDamage(m: number, vn: number, cfg: RamConfig): number {
  if (!(vn > cfg.allowanceU)) return 0;
  return Math.floor(((0.5 * m * vn * vn) / cfg.energyPerHp) * cfg.landSoftness);
}

/** The LAND grind rate (hp/s, unfloored): grindPerUnit · vt · landSoftness. */
export function landGrindRate(vt: number, cfg: RamConfig): number {
  return cfg.grindPerUnit * vt * cfg.landSoftness;
}
