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
//     damage, no burst — unless the island surface is within the blast radius
//     of the target (plain radius query, no LOS inside the small burst).
//   - Torpedo (contact-only: no target, burstRadius 0): today's behavior
//     byte-for-byte — first non-owner contact hits for full damage
//     (contactDamage = damage), islands stop it, it runs until impact/edge.
//   (Eric rulings 2026-07-21; the 1.7 long-range cannon likely reuses the
//   burst rule with different numbers.)
//
// Swept collision (no tunneling even at max closing speed): the tick's travel is
// a segment p0->p1. Against islands it is seg-vs-circle (segCircleHit → entry
// fraction t). Against hulls it is seg-vs-silhouette-polygon (segPolygonHit):
// a hit iff the travel segment comes within the projectile's radius of any
// polygon edge (or starts inside), at the closest-approach fraction along the
// shell segment. Concave-safe — the Torpedo Boat stern notch and Mine Layer
// transom notch are missable cavities. The map edge is a third obstacle: the
// point where the travel segment exits the water disk (segCircleExit),
// resolving as a splash (`expired`). Earliest fraction across all obstacles
// wins — an island/hull short of the edge still takes priority. The firer is
// PERMANENTLY immune to its own projectile — own weapons never damage the owner
// (Eric ruling 2026-07-19): never intercepted by it, never a burst victim.

import { segCircleExit, segCircleHit } from '../math/geom.js';
import { pointPolygonDistance, segPolygonHit } from './silhouette.js';
import type { Vec2 } from '../math/vec.js';
import type { Circle } from '../types.js';

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
  islands: readonly Circle[];
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
 */
export type ShellOutcome =
  | { kind: 'travel' }
  | { kind: 'hitShip'; victimId: string; x: number; y: number }
  | { kind: 'burst'; x: number; y: number }
  | { kind: 'hitIsland'; x: number; y: number }
  | { kind: 'expired'; x: number; y: number };

interface Hit {
  frac: number; // fraction along the shell segment [0,1]
  victimId?: string; // set for a hull hit
  poly?: readonly Vec2[]; // the struck hull's world polygon (blast-membership test)
  island?: Circle; // set for an island hit (blast-proximity test)
  edge?: boolean; // set when the map edge is the winning obstacle
}

/** Earliest island entry along p0->p1, or null. */
function earliestIsland(p0: Vec2, p1: Vec2, islands: readonly Circle[]): Hit | null {
  let best: Hit | null = null;
  for (const isle of islands) {
    const t = segCircleHit(p0, p1, isle, isle.r);
    if (t !== null && (best === null || t < best.frac)) best = { frac: t, island: isle };
  }
  return best;
}

/** Earliest hull hit along p0->p1; the firer is permanently immune, or null. */
function earliestHull(shell: ShellState, p0: Vec2, p1: Vec2, ctx: ShellContext): Hit | null {
  let best: Hit | null = null;
  for (const hull of ctx.hulls) {
    if (hull.id === shell.ownerId) continue; // own weapon never damages the owner
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
 * target point? Hulls use the burst-membership predicate; islands use plain
 * circle-surface proximity. Always false for point-less projectiles.
 */
function interceptedInBlast(shell: ShellState, hit: Hit): boolean {
  if (shell.targetX === null || shell.targetY === null) return false;
  const center: Vec2 = { x: shell.targetX, y: shell.targetY };
  if (hit.poly !== undefined) return polyInBlast(center, shell.burstRadius, hit.poly);
  if (hit.island !== undefined) {
    const d = Math.hypot(center.x - hit.island.x, center.y - hit.island.y) - hit.island.r;
    return d <= shell.burstRadius;
  }
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

/**
 * Advance `shell` one fixed tick. Mutates its position/distLeft on travel;
 * returns the outcome. On any terminal outcome the shell is spent (the caller
 * removes it) and the returned x/y is the impact/burst/splash point. A
 * targeted projectile stops AT its target point and bursts there when nothing
 * intercepted it earlier.
 */
export function stepShell(shell: ShellState, ctx: ShellContext): ShellOutcome {
  const speed = Math.hypot(shell.vx, shell.vy);
  const p0: Vec2 = { x: shell.x, y: shell.y };
  if (speed <= 0) return { kind: 'expired', x: p0.x, y: p0.y };

  // Already outside the water disk (a rim-clamped ship firing outward spawns
  // hull-clear PAST the edge): no obstacle can ever be met out there — islands
  // and hulls are inside, the edge test only fires on an inside→out crossing,
  // and a torpedo's Infinity range never runs out. Splash it where it stands.
  if (Math.hypot(p0.x, p0.y) > ctx.mapRadius) return { kind: 'expired', x: p0.x, y: p0.y };

  // A targeted projectile never travels past its target point.
  const distToTarget =
    shell.targetX === null || shell.targetY === null
      ? Number.POSITIVE_INFINITY
      : Math.hypot(shell.targetX - p0.x, shell.targetY - p0.y);
  const moveDist = Math.min(speed * ctx.dt, shell.distLeft, distToTarget);
  const ux = shell.vx / speed;
  const uy = shell.vy / speed;
  const p1: Vec2 = { x: p0.x + ux * moveDist, y: p0.y + uy * moveDist };

  const obstacle = earlier(earliestIsland(p0, p1, ctx.islands), earliestHull(shell, p0, p1, ctx));
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
