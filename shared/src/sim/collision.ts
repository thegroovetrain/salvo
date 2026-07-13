// Ship-vs-world collision resolution, shared by the server sim (world.ts) and
// client prediction (prediction.ts) so the two never diverge on rocks or the
// map edge. Both effects are positional corrections plus a scalar speed damp —
// no reflection/bounce, no heading change (a grazed ship keeps pointing where
// it was, just loses way). Pure over a plain ShipState; mutates in place.
//
// The hull is approximated as a circle of radius beam/2 (the capsule's width)
// for push-out — cheap, deterministic, and adequate for a slow-turning tracer
// hull. Both the boundary and island damp use CONFIG.ship.islandSpeedMult.

import { CONFIG } from '../constants.js';
import type { Circle } from '../types.js';
import type { ShipState } from './ship.js';

/** Ship collision radius (half beam = the hull capsule's radius). */
export const SHIP_RADIUS = CONFIG.ship.beam / 2;

const EPS = 1e-9;

/**
 * Map-edge collision: if the ship center has crossed outside the map circle,
 * clamp it back onto the boundary and damp its speed while it presses out.
 * Matches the original world.ts rule exactly (center clamped to `radius`).
 */
export function resolveBoundary(ship: ShipState, radius: number): void {
  const d = Math.hypot(ship.x, ship.y);
  if (d <= radius) return;
  const scale = radius / d;
  ship.x *= scale;
  ship.y *= scale;
  ship.speed *= CONFIG.ship.islandSpeedMult;
}

/**
 * Ship-vs-island collision: for every island the hull circle overlaps, push the
 * ship out along the contact normal so its edge just clears the island, and damp
 * its speed. Iterated in array order (mapgen spaces islands so overlaps between
 * two islands don't occur, making order immaterial in practice).
 */
export function resolveShipIslands(ship: ShipState, islands: readonly Circle[]): void {
  for (const isle of islands) {
    pushOutOf(ship, isle);
  }
}

/** Push `ship` out of a single island circle (positional) and damp its speed. */
function pushOutOf(ship: ShipState, isle: Circle): void {
  const dx = ship.x - isle.x;
  const dy = ship.y - isle.y;
  const minDist = isle.r + SHIP_RADIUS;
  const d = Math.hypot(dx, dy);
  if (d >= minDist) return;
  if (d > EPS) {
    const push = minDist / d;
    ship.x = isle.x + dx * push;
    ship.y = isle.y + dy * push;
  } else {
    // Dead-center: choose a deterministic escape direction (+x).
    ship.x = isle.x + minDist;
    ship.y = isle.y;
  }
  ship.speed *= CONFIG.ship.islandSpeedMult;
}
