// Ballistic (gun shell / torpedo) kinematics + swept collision, shared so the
// wire types and the no-tunneling geometry live in one place. Pure: stepShell
// advances one projectile a fixed tick and returns an OUTCOME; the server owns
// applying damage, spawning booms/bursts, and removing spent projectiles.
//
// PER-PROJECTILE HIT RULES (Story 1.4 — the architectural seam): every
// projectile CARRIES its own hit-rule parameters on ShellState; stepShell
// resolves from those fields, never from global CONFIG branching. Each
// equipment's activate() builds its projectile with its own rules:
//   - Gun shell (target point + burstRadius): flies to the clicked point and
//     STOPS there, bursting in `burstRadius` — the server resolves victims via
//     burstVictims() (full `damage` each). An early interceptor takes the
//     smaller `contactDamage` and stops the shell (no burst; bodyblocking is
//     intended) — UNLESS the interceptor is already inside the would-be blast
//     around the target point (the SAME predicate as burst membership), in
//     which case the shell bursts for full damage anyway, always centered on
//     the target point (no double-dipping: a burst victim takes burst damage,
//     not contact + burst). Early island contact stops the shell dead — no
//     damage, no burst — unless the island COASTLINE is within the blast radius
//     of the target (plain distance query, no LOS inside the small burst).
//   - Torpedo (contact-only: no target, burstRadius 0): today's behavior
//     byte-for-byte — first non-owner contact hits for full damage
//     (contactDamage = damage), islands stop it, it runs until impact/edge.
//   (Eric rulings 2026-07-21; the 1.7 long-range cannon likely reuses the
//   burst rule with different numbers.)
//
// Swept collision (no tunneling even at max closing speed): the tick's travel is
// a segment p0->p1. Against islands it is seg-vs-COASTLINE (islandSegHit — the
// island.ts query seam: bounding-circle broadphase, then the exact polygon test
// at radius 0, so a concave cove mouth is genuinely missable and no bounding
// circle ever stops a shell that threaded it). Against hulls it is
// seg-vs-silhouette-polygon (segPolygonHit):
// a hit iff the travel segment comes within the projectile's radius of any
// polygon edge (or starts inside), at the closest-approach fraction along the
// shell segment. Concave-safe — the Torpedo Boat stern notch and Mine Layer
// transom notch are missable cavities. The map edge is a third obstacle: the
// point where the travel segment exits the water disk (segCircleExit),
// resolving as a splash (`expired`). Earliest fraction across all obstacles
// wins — an island/hull short of the edge still takes priority. The firer is
// PERMANENTLY immune to its own projectile — own weapons never damage the owner
// (Eric ruling 2026-07-19): never intercepted by it, never a burst victim.

import { segCircleExit } from '../math/geom.js';
import { wrapAngle } from '../math/angle.js';
import { islandDistance, islandSegHit } from './island.js';
import { pointPolygonDistance, segPolygonHit } from './silhouette.js';
import type { Vec2 } from '../math/vec.js';
import type { Island } from '../types.js';

/** Map is centered at world origin (the boundary clamp treats origin as center). */
const MAP_CENTER: Vec2 = { x: 0, y: 0 };

/**
 * A projectile in flight (gun shell or torpedo). Server-owned; the wire sends
 * launch params once. Every weapon-specific field is REQUIRED — makeBallistic
 * (the sole non-test constructor) sets them all explicitly, so nothing silently
 * borrows gun values. The hit-rule fields (targetX/targetY, burstRadius,
 * contactDamage) make hit resolution per-projectile: a targeted burster (gun)
 * and a point-less contact projectile (torpedo) ride the same state shape.
 */
export interface ShellState {
  id: string;
  ownerId: string; // firer — NEVER hit by this projectile (permanent owner immunity)
  x: number; // u — current position
  y: number; // u
  vx: number; // u/s
  vy: number; // u/s
  distLeft: number; // u — remaining travel before it splashes
  bornAt: number; // ms — server time it was fired
  kind: 'shell' | 'torp'; // wire kind
  damage: number; // hp per burst victim (or per contact hit for contact-only projectiles)
  hitRadius: number; // collision radius added to the hull silhouette
  targetX: number | null; // u — burst point it flies to and stops at (null = point-less)
  targetY: number | null; // u
  burstRadius: number; // u — blast radius around the target point (0 = contact-only)
  contactDamage: number; // hp to an early interceptor outside the blast (= damage for contact-only)
  /**
   * SERVER-INTERNAL star-shell tag (Story 1.7): when set, a BURST of this
   * shell also spawns a lit zone of `radius` for `durationMs` (World.
   * resolveBurst). Absent on every other projectile; stepShell never reads it.
   * NEVER on the wire — the ballistic wire shape stays {k,id,x,y,vx,vy,t}
   * (BallisticEvent), and the perception shape guards pin that.
   */
  lit?: { radius: number; durationMs: number };
  /**
   * PLUNGING FIRE doctrine (Story 2.8, cannonArcing): the shell arcs OVER the
   * water — island and hull collision are skipped entirely en route and it
   * bursts exactly at its target point. Set at spawn by the server; never on
   * the wire (the doctrine fields below share that rule).
   */
  arcing?: true;
  /**
   * ARMOR-PIERCING doctrine (Story 2.8, cannonAp): a full-range direction shot
   * (no target point, no burst) that pierces up to `remaining` hulls with
   * damage falloff by hit order (PIERCE_FALLOFF — 100/50/25%), never re-hits a
   * hull in `hitIds`, continues its swept segment after each pierce, and is
   * stopped dead by islands. `remaining` starts at 3; `hitIds` starts empty.
   */
  pierce?: { remaining: number; hitIds: string[] };
  /**
   * ACOUSTIC HOMING doctrine (Story 2.8, torpedoHoming): per tick the fish
   * acquires the nearest non-owner hull whose centroid is within
   * `acquireRange` (hulls only — decoys never attract it; ctx.hulls carries
   * only ALIVE hulls) and steers its velocity direction toward it at up to
   * `turnRate` rad/s. Speed magnitude is never changed; expiry/range semantics
   * are untouched. `targetId` is the current lock (re-acquired every tick).
   */
  homing?: { turnRate: number; acquireRange: number; targetId?: string };
}

/** The AP damage-falloff table by hit ORDER (0-based): 100% / 50% / 25%. */
export const PIERCE_FALLOFF: readonly number[] = [1, 0.5, 0.25];

/** The damage of the `order`-th pierce hit (0-based) for a base damage — the
 *  helper the server applies to each PierceHit. Past-table orders deal 0. */
export function pierceDamage(baseDamage: number, order: number): number {
  return baseDamage * (PIERCE_FALLOFF[order] ?? 0);
}

/** One hull pierced by an AP shell this tick, in hit order. `order` is the
 *  GLOBAL 0-based hit index across the shell's life (feeds pierceDamage). */
export interface PierceHit {
  victimId: string;
  x: number; // u — the pierce point
  y: number;
  order: number;
}

/**
 * A hull to test shells against: its silhouette polygon transformed to the
 * ship's world pose this tick (see silhouette.ts transformPolygon — callers
 * cache the transformed verts per tick).
 */
export interface HullTarget {
  id: string;
  poly: readonly Vec2[]; // world-space silhouette verts
}

/** Everything stepShell needs about the world this tick. */
export interface ShellContext {
  islands: readonly Island[];
  hulls: readonly HullTarget[];
  now: number; // ms — server time this tick
  dt: number; // s — fixed step
  mapRadius: number; // u — water disk radius; a projectile splashes at this edge
}

/**
 * What happened to a shell this tick. `travel` = still flying. `hitShip` = an
 * early interception OUTSIDE the blast — the server applies `contactDamage` to
 * the victim, no burst. `burst` = the shell detonated at its target point
 * (reached it, or was intercepted inside the would-be blast) — the server
 * resolves victims via burstVictims() and applies `damage` to each.
 * `hitIsland` = stopped dead by an island outside the blast — no damage.
 * `pierced` = an AP shell went THROUGH one or more hulls this tick (`hits` in
 * order; the server applies pierceDamage per hit); `spent` = the shell also
 * terminated this tick (third hull, island, edge, or range end — x/y is the
 * stop point) and must be removed.
 */
export type ShellOutcome =
  | { kind: 'travel' }
  | { kind: 'hitShip'; victimId: string; x: number; y: number }
  | { kind: 'burst'; x: number; y: number }
  | { kind: 'hitIsland'; x: number; y: number }
  | { kind: 'expired'; x: number; y: number }
  | { kind: 'pierced'; hits: PierceHit[]; spent: boolean; x: number; y: number };

interface Hit {
  frac: number; // fraction along the shell segment [0,1]
  victimId?: string; // set for a hull hit
  poly?: readonly Vec2[]; // the struck hull's world polygon (blast-membership test)
  island?: Island; // set for an island hit (blast-proximity test)
  edge?: boolean; // set when the map edge is the winning obstacle
}

/**
 * Earliest COASTLINE entry along p0->p1, or null. islandSegHit runs the
 * bounding-circle broadphase then the exact polygon test, so a path that
 * threads a cove mouth without touching an edge (and without entering the
 * interior) returns null here — concave cavities are genuinely missable.
 * Scans every island: the EARLIEST hit wins, so there is no early-out.
 */
function earliestIsland(p0: Vec2, p1: Vec2, islands: readonly Island[]): Hit | null {
  let best: Hit | null = null;
  for (const isle of islands) {
    const t = islandSegHit(p0, p1, isle);
    if (t !== null && (best === null || t < best.frac)) best = { frac: t, island: isle };
  }
  return best;
}

/** Earliest hull hit along p0->p1; the firer is permanently immune, and any
 *  id in `exclude` (already-pierced hulls) is skipped. Null = no hit. */
function earliestHull(
  shell: ShellState,
  p0: Vec2,
  p1: Vec2,
  ctx: ShellContext,
  exclude?: readonly string[],
): Hit | null {
  let best: Hit | null = null;
  for (const hull of ctx.hulls) {
    if (hull.id === shell.ownerId) continue; // own weapon never damages the owner
    if (exclude !== undefined && exclude.includes(hull.id)) continue; // pierced already: never re-hit
    // Silhouette polygon dilated by this projectile's own radius.
    const frac = segPolygonHit(p0, p1, hull.poly, shell.hitRadius);
    if (frac === null) continue;
    if (best === null || frac < best.frac) best = { frac, victimId: hull.id, poly: hull.poly };
  }
  return best;
}

/** Where p0->p1 crosses OUT of the water disk (map edge), or null (stays in). */
function earliestEdge(p0: Vec2, p1: Vec2, mapRadius: number): Hit | null {
  const t = segCircleExit(p0, p1, MAP_CENTER, mapRadius);
  return t === null ? null : { frac: t, edge: true };
}

/** Pick the earlier of two candidate hits (null = no hit). */
function earlier(a: Hit | null, b: Hit | null): Hit | null {
  if (a === null) return b;
  if (b === null) return a;
  return a.frac <= b.frac ? a : b;
}

/**
 * THE blast-membership predicate — one rule for both the interception
 * proximity exception and burst victim resolution: is this hull polygon
 * within `radius` of the burst center (point-to-polygon distance, 0 inside)?
 */
function polyInBlast(center: Vec2, radius: number, poly: readonly Vec2[]): boolean {
  return pointPolygonDistance(center, poly) <= radius;
}

/**
 * Would this interception happen inside the would-be blast around the shell's
 * target point? Hulls use the burst-membership predicate; islands use the same
 * shape of test against the COASTLINE (islandDistance — signed, negative when
 * the target sits on the land itself). Always false for point-less projectiles.
 */
function interceptedInBlast(shell: ShellState, hit: Hit): boolean {
  if (shell.targetX === null || shell.targetY === null) return false;
  const center: Vec2 = { x: shell.targetX, y: shell.targetY };
  if (hit.poly !== undefined) return polyInBlast(center, shell.burstRadius, hit.poly);
  if (hit.island !== undefined) return islandDistance(center, hit.island) <= shell.burstRadius;
  return false;
}

/**
 * Classify a resolved interception at (ix, iy): map-edge splash > in-blast
 * proximity burst (centered on the TARGET, never the impact point) > contact
 * hull hit > island stop.
 */
function classifyHit(shell: ShellState, hit: Hit, ix: number, iy: number): ShellOutcome {
  if (hit.edge) return { kind: 'expired', x: ix, y: iy };
  if (interceptedInBlast(shell, hit)) {
    shell.x = shell.targetX!;
    shell.y = shell.targetY!;
    return { kind: 'burst', x: shell.targetX!, y: shell.targetY! };
  }
  if (hit.victimId !== undefined) return { kind: 'hitShip', victimId: hit.victimId, x: ix, y: iy };
  return { kind: 'hitIsland', x: ix, y: iy };
}

/** Centroid (vertex average) of a hull polygon — the homing target point.
 *  Deterministic and cheap; precise hull geometry is irrelevant at acquire
 *  ranges, and both sides would compute it identically if ever needed. */
function polyCentroid(poly: readonly Vec2[]): Vec2 {
  let x = 0;
  let y = 0;
  for (const v of poly) {
    x += v.x;
    y += v.y;
  }
  return { x: x / poly.length, y: y / poly.length };
}

/**
 * ACOUSTIC HOMING per-tick steering (mutates vx/vy only — speed magnitude is
 * preserved): acquire the nearest non-owner hull centroid within acquireRange
 * (ties: the later hull in ctx.hulls order — deterministic) and rotate the
 * velocity direction toward it by at most turnRate·dt. No target in range =
 * fly straight (lock cleared).
 */
function steerHoming(shell: ShellState, ctx: ShellContext): void {
  const homing = shell.homing!;
  const speed = Math.hypot(shell.vx, shell.vy);
  if (speed <= 0) return;
  let best: Vec2 | null = null;
  let bestId: string | undefined;
  let bestD = homing.acquireRange;
  for (const hull of ctx.hulls) {
    if (hull.id === shell.ownerId) continue; // never homes on the owner
    const c = polyCentroid(hull.poly);
    const d = Math.hypot(c.x - shell.x, c.y - shell.y);
    if (d <= bestD) {
      bestD = d;
      best = c;
      bestId = hull.id;
    }
  }
  homing.targetId = bestId;
  if (best === null) return;
  const current = Math.atan2(shell.vy, shell.vx);
  const desired = Math.atan2(best.y - shell.y, best.x - shell.x);
  const maxTurn = homing.turnRate * ctx.dt;
  const delta = Math.max(-maxTurn, Math.min(maxTurn, wrapAngle(desired - current)));
  const dir = current + delta;
  shell.vx = speed * Math.cos(dir);
  shell.vy = speed * Math.sin(dir);
}

/** Resolve a pierce sweep's NON-hull stop (island/edge) into an outcome. */
function pierceStop(hits: PierceHit[], edge: boolean, ix: number, iy: number): ShellOutcome {
  if (hits.length === 0) return edge ? { kind: 'expired', x: ix, y: iy } : { kind: 'hitIsland', x: ix, y: iy };
  return { kind: 'pierced', hits, spent: true, x: ix, y: iy };
}

/**
 * ARMOR-PIERCING sweep: walk the tick's travel segment, piercing hulls in
 * order (recorded in hit order with falloff indices; never re-hitting a hull
 * in hitIds — which also covers "segment starts inside a pierced hull" on the
 * next tick), continuing the swept segment after each pierce, until the shell
 * runs out of pierces (3 hulls), meets an island/edge (stopped dead), or the
 * segment ends.
 */
function stepPierce(
  shell: ShellState,
  ctx: ShellContext,
  p0: Vec2,
  ux: number,
  uy: number,
  moveDist: number,
): ShellOutcome {
  const pierce = shell.pierce!;
  const hits: PierceHit[] = [];
  let travelled = 0;
  for (;;) {
    const from: Vec2 = { x: p0.x + ux * travelled, y: p0.y + uy * travelled };
    const p1: Vec2 = { x: p0.x + ux * moveDist, y: p0.y + uy * moveDist };
    const hull = earliestHull(shell, from, p1, ctx, pierce.hitIds);
    const blocker = earlier(earliestIsland(from, p1, ctx.islands), earliestEdge(from, p1, ctx.mapRadius));
    const first = earlier(hull, blocker);
    if (first === null) break;
    const segLen = moveDist - travelled;
    const ix = from.x + ux * segLen * first.frac;
    const iy = from.y + uy * segLen * first.frac;
    if (first.victimId === undefined) {
      shell.x = ix;
      shell.y = iy;
      return pierceStop(hits, first.edge === true, ix, iy);
    }
    hits.push({ victimId: first.victimId, x: ix, y: iy, order: pierce.hitIds.length });
    pierce.hitIds.push(first.victimId);
    pierce.remaining -= 1;
    travelled += segLen * first.frac;
    if (pierce.remaining <= 0) {
      shell.x = ix;
      shell.y = iy;
      return { kind: 'pierced', hits, spent: true, x: ix, y: iy };
    }
  }
  shell.x = p0.x + ux * moveDist;
  shell.y = p0.y + uy * moveDist;
  shell.distLeft -= moveDist;
  const spent = shell.distLeft <= 0;
  if (hits.length === 0) return spent ? { kind: 'expired', x: shell.x, y: shell.y } : { kind: 'travel' };
  return { kind: 'pierced', hits, spent, x: shell.x, y: shell.y };
}

/** Distance from p0 to the shell's target point (Infinity for point-less). */
function targetDistance(shell: ShellState, p0: Vec2): number {
  return shell.targetX === null || shell.targetY === null
    ? Number.POSITIVE_INFINITY
    : Math.hypot(shell.targetX - p0.x, shell.targetY - p0.y);
}

/**
 * Advance `shell` one fixed tick. Mutates its position/distLeft on travel;
 * returns the outcome. On any terminal outcome the shell is spent (the caller
 * removes it) and the returned x/y is the impact/burst/splash point. A
 * targeted projectile stops AT its target point and bursts there when nothing
 * intercepted it earlier. Doctrine fields (Story 2.8) reroute the scan:
 * `homing` steers the velocity before the sweep, `pierce` runs the AP
 * multi-hull sweep, `arcing` skips island AND hull collision entirely (the
 * shell overflies everything and bursts exactly at its target).
 */
export function stepShell(shell: ShellState, ctx: ShellContext): ShellOutcome {
  if (shell.homing !== undefined) steerHoming(shell, ctx);
  const speed = Math.hypot(shell.vx, shell.vy);
  const p0: Vec2 = { x: shell.x, y: shell.y };
  if (speed <= 0) return { kind: 'expired', x: p0.x, y: p0.y };

  // Already outside the water disk (a rim-clamped ship firing outward spawns
  // hull-clear PAST the edge): no obstacle can ever be met out there — islands
  // and hulls are inside, the edge test only fires on an inside→out crossing,
  // and a torpedo's Infinity range never runs out. Splash it where it stands.
  if (Math.hypot(p0.x, p0.y) > ctx.mapRadius) return { kind: 'expired', x: p0.x, y: p0.y };

  // A targeted projectile never travels past its target point.
  const distToTarget = targetDistance(shell, p0);
  const moveDist = Math.min(speed * ctx.dt, shell.distLeft, distToTarget);
  const ux = shell.vx / speed;
  const uy = shell.vy / speed;

  // ARMOR-PIERCING: the multi-hull sweep owns the whole scan.
  if (shell.pierce !== undefined) return stepPierce(shell, ctx, p0, ux, uy, moveDist);

  const p1: Vec2 = { x: p0.x + ux * moveDist, y: p0.y + uy * moveDist };

  // PLUNGING FIRE overflies islands and hulls (no en-route collision at all);
  // the map edge still terminates (a target is always inside the water disk).
  const obstacle = shell.arcing
    ? null
    : earlier(earliestIsland(p0, p1, ctx.islands), earliestHull(shell, p0, p1, ctx));
  const hit = earlier(obstacle, earliestEdge(p0, p1, ctx.mapRadius));
  if (hit) {
    const ix = p0.x + ux * moveDist * hit.frac;
    const iy = p0.y + uy * moveDist * hit.frac;
    shell.x = ix;
    shell.y = iy;
    return classifyHit(shell, hit, ix, iy);
  }

  if (moveDist >= distToTarget) {
    // Arrived un-intercepted: snap to the exact target point and burst there.
    shell.x = shell.targetX!;
    shell.y = shell.targetY!;
    return { kind: 'burst', x: shell.targetX!, y: shell.targetY! };
  }

  shell.x = p1.x;
  shell.y = p1.y;
  shell.distLeft -= moveDist;
  if (shell.distLeft <= 0) return { kind: 'expired', x: p1.x, y: p1.y };
  return { kind: 'travel' };
}

/**
 * Resolve the victims of a burst at `center`: every hull whose silhouette
 * polygon is within `radius` of the center (point-to-polygon distance, 0 when
 * the center is inside the hull) — the SAME predicate the interception
 * proximity exception uses. The owner is excluded (permanent owner immunity).
 * Pure; the server applies the shell's `damage` to each returned id (one
 * victim-private dmg event per victim, no double-dipping with contact damage).
 */
export function burstVictims(
  center: Vec2,
  radius: number,
  hulls: readonly HullTarget[],
  ownerId: string,
): string[] {
  const victims: string[] = [];
  for (const hull of hulls) {
    if (hull.id === ownerId) continue; // own weapon never damages the owner
    if (polyInBlast(center, radius, hull.poly)) victims.push(hull.id);
  }
  return victims;
}
