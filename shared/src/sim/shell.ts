// Shell (gun projectile) kinematics + swept collision, shared so the wire types
// and the no-tunneling geometry live in one place. Pure: stepShell advances a
// shell one fixed tick and returns an OUTCOME; the server owns applying damage,
// spawning booms, and removing spent shells. Constant velocity, finite range.
//
// Swept collision (no tunneling even at max closing speed): the tick's travel is
// a segment p0->p1. Against islands it is seg-vs-circle (segCircleHit → entry
// fraction t). Against hulls it is seg-vs-capsule: closest approach of the shell
// segment to the hull axis segment (segSegClosest), a hit iff that gap ≤ hull
// radius + shell radius, at fraction `s` along the shell segment. Earliest
// fraction across all obstacles wins. The firer is immune for selfHitGrace ms.

import { CONFIG } from '../constants.js';
import { segCircleHit, segSegClosest } from '../math/geom.js';
import type { Vec2 } from '../math/vec.js';
import type { Circle } from '../types.js';

/** A shell in flight. Server-owned; the wire sends launch params once. */
export interface ShellState {
  id: string;
  ownerId: string; // firer — immune for selfHitGrace ms
  x: number; // u — current position
  y: number; // u
  vx: number; // u/s
  vy: number; // u/s
  distLeft: number; // u — remaining travel before it splashes
  bornAt: number; // ms — server time it was fired
}

/** A hull to test shells against: the capsule's axis segment (stern → bow). */
export interface HullTarget {
  id: string;
  stern: Vec2;
  bow: Vec2;
}

/** Everything stepShell needs about the world this tick. */
export interface ShellContext {
  islands: readonly Circle[];
  hulls: readonly HullTarget[];
  now: number; // ms — server time this tick
  dt: number; // s — fixed step
}

/** What happened to a shell this tick. `travel` means it is still flying. */
export type ShellOutcome =
  | { kind: 'travel' }
  | { kind: 'hitShip'; victimId: string; x: number; y: number }
  | { kind: 'hitIsland'; x: number; y: number }
  | { kind: 'expired'; x: number; y: number };

/** Half-length of the hull capsule's axis segment (so segment + 2r = length). */
export const HULL_HALF_AXIS = (CONFIG.ship.length - CONFIG.ship.beam) / 2;

/** Shell-vs-hull hit threshold: capsule radius + shell radius. */
const HIT_THRESHOLD = CONFIG.ship.beam / 2 + CONFIG.gun.shellRadius;

/** Capsule axis endpoints (stern, bow) for a ship pose. */
export function hullEndpoints(x: number, y: number, heading: number): HullTarget {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  return {
    id: '',
    stern: { x: x - c * HULL_HALF_AXIS, y: y - s * HULL_HALF_AXIS },
    bow: { x: x + c * HULL_HALF_AXIS, y: y + s * HULL_HALF_AXIS },
  };
}

interface Hit {
  frac: number; // fraction along the shell segment [0,1]
  victimId?: string; // set for a hull hit
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

/** Earliest hull hit along p0->p1, honoring owner self-hit grace, or null. */
function earliestHull(shell: ShellState, p0: Vec2, p1: Vec2, ctx: ShellContext): Hit | null {
  const graced = ctx.now - shell.bornAt < CONFIG.gun.selfHitGrace;
  let best: Hit | null = null;
  for (const hull of ctx.hulls) {
    if (hull.id === shell.ownerId && graced) continue;
    const c = segSegClosest(p0, p1, hull.stern, hull.bow);
    if (c.dist > HIT_THRESHOLD) continue;
    if (best === null || c.s < best.frac) best = { frac: c.s, victimId: hull.id };
  }
  return best;
}

/** Pick the earlier of two candidate hits (null = no hit). */
function earlier(a: Hit | null, b: Hit | null): Hit | null {
  if (a === null) return b;
  if (b === null) return a;
  return a.frac <= b.frac ? a : b;
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

  const moveDist = Math.min(speed * ctx.dt, shell.distLeft);
  const ux = shell.vx / speed;
  const uy = shell.vy / speed;
  const p1: Vec2 = { x: p0.x + ux * moveDist, y: p0.y + uy * moveDist };

  const hit = earlier(earliestIsland(p0, p1, ctx.islands), earliestHull(shell, p0, p1, ctx));
  if (hit) {
    const ix = p0.x + ux * moveDist * hit.frac;
    const iy = p0.y + uy * moveDist * hit.frac;
    shell.x = ix;
    shell.y = iy;
    if (hit.victimId !== undefined) return { kind: 'hitShip', victimId: hit.victimId, x: ix, y: iy };
    return { kind: 'hitIsland', x: ix, y: iy };
  }

  shell.x = p1.x;
  shell.y = p1.y;
  shell.distLeft -= moveDist;
  if (shell.distLeft <= 0) return { kind: 'expired', x: p1.x, y: p1.y };
  return { kind: 'travel' };
}
