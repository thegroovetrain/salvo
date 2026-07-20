// Ballistic (gun shell / torpedo) kinematics + swept collision, shared so the
// wire types and the no-tunneling geometry live in one place. Pure: stepShell
// advances one projectile a fixed tick and returns an OUTCOME; the server owns
// applying damage, spawning booms, and removing spent projectiles. Constant
// velocity; range may be finite (guns) or Infinity (torpedoes run until they
// hit something / cross the map edge). ONE parameterized model serves both
// weapons — guns and torpedoes differ only in speed/range/damage/collision-
// radius, all carried on the ShellState (torpedoes are slow, long-legged,
// hard-hitting shells).
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
// (Eric ruling 2026-07-19); the old timed self-hit grace is retired.

import { segCircleExit, segCircleHit } from '../math/geom.js';
import { segPolygonHit } from './silhouette.js';
import type { Vec2 } from '../math/vec.js';
import type { Circle } from '../types.js';

/** Map is centered at world origin (the boundary clamp treats origin as center). */
const MAP_CENTER: Vec2 = { x: 0, y: 0 };

/**
 * A projectile in flight (gun shell or torpedo). Server-owned; the wire sends
 * launch params once. Every weapon-specific field is REQUIRED — makeBallistic
 * (the sole non-test constructor) sets them all explicitly, so nothing silently
 * borrows gun values (a torpedo carries its own kind/damage/hitRadius/grace).
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
  damage: number; // hp per hull hit
  hitRadius: number; // collision radius added to the hull capsule
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

/** What happened to a shell this tick. `travel` means it is still flying. */
export type ShellOutcome =
  | { kind: 'travel' }
  | { kind: 'hitShip'; victimId: string; x: number; y: number }
  | { kind: 'hitIsland'; x: number; y: number }
  | { kind: 'expired'; x: number; y: number };

interface Hit {
  frac: number; // fraction along the shell segment [0,1]
  victimId?: string; // set for a hull hit
  edge?: boolean; // set when the map edge is the winning obstacle
}

/** Earliest island entry along p0->p1, or null. */
function earliestIsland(p0: Vec2, p1: Vec2, islands: readonly Circle[]): Hit | null {
  let best: Hit | null = null;
  for (const isle of islands) {
    const t = segCircleHit(p0, p1, isle, isle.r);
    if (t !== null && (best === null || t < best.frac)) best = { frac: t };
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
    if (best === null || frac < best.frac) best = { frac, victimId: hull.id };
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

/** Classify a resolved impact at (ix, iy): hull hit > map-edge splash > island. */
function classifyHit(hit: Hit, ix: number, iy: number): ShellOutcome {
  if (hit.victimId !== undefined) return { kind: 'hitShip', victimId: hit.victimId, x: ix, y: iy };
  if (hit.edge) return { kind: 'expired', x: ix, y: iy };
  return { kind: 'hitIsland', x: ix, y: iy };
}

/**
 * Advance `shell` one fixed tick. Mutates its position/distLeft on travel;
 * returns the outcome. On a hit or range exhaustion the shell is spent (the
 * caller removes it) and the returned x/y is the impact/splash point.
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

  const moveDist = Math.min(speed * ctx.dt, shell.distLeft);
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
    return classifyHit(hit, ix, iy);
  }

  shell.x = p1.x;
  shell.y = p1.y;
  shell.distLeft -= moveDist;
  if (shell.distLeft <= 0) return { kind: 'expired', x: p1.x, y: p1.y };
  return { kind: 'travel' };
}
