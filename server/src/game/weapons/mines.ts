// Mine fire control + trigger resolution — the mines WeaponSystem (WeaponId 2).
// A mine is a STATIC point in world state (not a ballistic): dropped astern,
// arms after armDelay, then triggers when any NON-OWNER live hull capsule comes
// within triggerRadius of it. On trigger it deals damage to that ship and
// despawns with a boom at the mine point. Max `maxLive` live mines per player
// (dropping past the cap despawns that player's OLDEST silently — no boom); a
// defensive global cap bounds total growth. Mines never radar-paint; their
// per-observer visibility is contact-like (see perception.minesForObserver).

import {
  CONFIG,
  WEAPON,
  hullEndpoints,
  pointSegmentDistance,
  wrapAngle,
  type HullTarget,
} from '@salvo/shared';
import type { ShipRecord } from '../world.js';
import type { FireContext, WeaponSystem } from './index.js';
import { hullClearOffset } from './ballistics.js';

/** A dropped mine. Server-owned; synced to clients as contact-like MineView. */
export interface MineState {
  id: string;
  ownerId: string;
  x: number; // u
  y: number; // u
  armedAt: number; // ms — server time it becomes live (drop time + armDelay)
}

/** A mine that triggered this tick, with the ship that set it off. */
export interface MineTrigger {
  mine: MineState;
  victimId: string;
}

// Drop astern, clear of the hull: stern is half a hull-length back, plus a
// trigger-radius margin so the dropping ship is never sitting on its own mine
// (owner is immune anyway, and it is unarmed for armDelay regardless).
const DROP_OFFSET = hullClearOffset(CONFIG.mine.triggerRadius);

/** Trigger proximity: hull capsule surface within triggerRadius of the mine. */
const TRIGGER_DIST = CONFIG.mine.triggerRadius + CONFIG.ship.beam / 2;

/** Fresh mine drop cooldown (ready). */
export function freshMineCooldown(): number {
  return 0;
}

/** Count a player's currently-live mines. */
function ownMineCount(mines: Map<string, MineState>, ownerId: string): number {
  let n = 0;
  for (const m of mines.values()) if (m.ownerId === ownerId) n++;
  return n;
}

/** First (oldest, by insertion order) mine owned by `ownerId`, or undefined. */
function oldestOwnMine(mines: Map<string, MineState>, ownerId: string): string | undefined {
  for (const [id, m] of mines) if (m.ownerId === ownerId) return id;
  return undefined;
}

/**
 * Add a mine to the world store, enforcing the per-player cap (despawn the
 * player's oldest, silently) and the defensive global cap (despawn the globally
 * oldest). Returns the new mine. Exported for tests + the World drop closure.
 */
export function addMine(
  mines: Map<string, MineState>,
  ownerId: string,
  x: number,
  y: number,
  now: number,
  id: string,
): MineState {
  if (ownMineCount(mines, ownerId) >= CONFIG.mine.maxLive) {
    const oldest = oldestOwnMine(mines, ownerId);
    if (oldest !== undefined) mines.delete(oldest);
  }
  if (mines.size >= CONFIG.mine.globalCap) {
    const first = mines.keys().next().value;
    if (first !== undefined) mines.delete(first);
  }
  const mine: MineState = { id, ownerId, x, y, armedAt: now + CONFIG.mine.armDelay };
  mines.set(id, mine);
  return mine;
}

/** Where a ship's next mine drops (astern of its stern, with margin). */
export function dropPoint(ship: ShipRecord): { x: number; y: number } {
  const dir = wrapAngle(ship.state.heading + CONFIG.mine.offset); // astern (heading + π)
  return {
    x: ship.state.x + Math.cos(dir) * DROP_OFFSET,
    y: ship.state.y + Math.sin(dir) * DROP_OFFSET,
  };
}

/**
 * Mines that trigger this tick against the given (post-move) hulls: any armed
 * mine whose nearest non-owner hull capsule is within TRIGGER_DIST. One victim
 * per mine (the first ship found). Pure — the World deletes + resolves damage.
 */
export function checkMineTriggers(
  mines: Map<string, MineState>,
  hulls: readonly HullTarget[],
  now: number,
): MineTrigger[] {
  const triggers: MineTrigger[] = [];
  for (const mine of mines.values()) {
    if (now < mine.armedAt) continue; // still arming
    for (const hull of hulls) {
      if (hull.id === mine.ownerId) continue; // owner never trips its own mine
      if (pointSegmentDistance(mine, hull.stern, hull.bow) <= TRIGGER_DIST) {
        triggers.push({ mine, victimId: hull.id });
        break;
      }
    }
  }
  return triggers;
}

/** Hull capsule for a ship pose (thin re-export so tests need not import shared). */
export function hullFor(ship: ShipRecord): HullTarget {
  const h = hullEndpoints(ship.state.x, ship.state.y, ship.state.heading);
  h.id = ship.id;
  return h;
}

/** The mines weapon system (WeaponId 2). */
export const mineSystem: WeaponSystem = {
  id: WEAPON.mine,
  tick(ship: ShipRecord, dtMs: number): void {
    ship.mineCooldown = Math.max(0, ship.mineCooldown - dtMs);
  },
  mountCooldowns(ship: ShipRecord): number[] {
    return [ship.mineCooldown];
  },
  fire(ctx: FireContext): void {
    if (ctx.ship.mineCooldown > 0) return;
    const p = dropPoint(ctx.ship);
    ctx.dropMine(p.x, p.y);
    ctx.ship.mineCooldown = CONFIG.mine.dropCooldown;
  },
};
