// Mine activation + trigger resolution — the mine Equipment row.
// A mine is a STATIC point in world state (not a ballistic): dropped astern by
// an INSTANT ability activation (Story 1.8 — the actSeq channel, no aim, no
// click), arms after armDelay, then TRIPS when any NON-OWNER live hull
// silhouette comes within triggerRadius of it. A trip detonates as a BLAST
// (Eric ruling 2026-07-22): every non-owner hull silhouette within blastRadius
// takes full damage (mineBlastVictims below — the owner is ALWAYS excluded,
// the universal AoE convention), with one boom at the mine point. Max
// `maxLive` live mines per player (dropping past the cap despawns that
// player's OLDEST silently — no boom); a defensive global cap bounds total
// growth. Mines never radar-paint; their per-observer visibility is
// contact-like (the `mine` signal row).

import {
  CONFIG,
  EQUIPMENT_IS_WEAPON,
  burstVictims,
  hullSilhouette,
  pointPolygonDistance,
  transformPolygon,
  wrapAngle,
  type HullTarget,
} from '@salvo/shared';
import type { ShipRecord } from '../world.js';
import type { Equipment } from './index.js';
import { consume, tickReload } from './ammo.js';
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

// Drop astern, clear of the hull: stern is half the FIRER'S hull-length back
// (per class), plus a trigger-radius margin so the dropping ship is never
// sitting on its own mine (owner is immune anyway, and it is unarmed for
// armDelay regardless). Computed per-ship at drop time (see dropPoint).

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
 * oldest). `maxLive` is the OWNER'S effective live-mine cap (Stage D: the
 * maxMines upgrade) — the World threads it in from the owner's cached stats,
 * so this stays a pure store operation. Returns the new mine. Exported for
 * tests + the World drop closure.
 */
export function addMine(
  mines: Map<string, MineState>,
  ownerId: string,
  x: number,
  y: number,
  now: number,
  id: string,
  maxLive: number = CONFIG.mine.maxLive,
): MineState {
  if (ownMineCount(mines, ownerId) >= maxLive) {
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
  const dropOffset = hullClearOffset(ship, CONFIG.mine.triggerRadius);
  return {
    x: ship.state.x + Math.cos(dir) * dropOffset,
    y: ship.state.y + Math.sin(dir) * dropOffset,
  };
}

/**
 * Mines that trigger this tick against the given (post-move) hull silhouette
 * polygons: any armed mine within triggerRadius of a non-owner polygon
 * (pointPolygonDistance — 0 inside, concave-safe). One victim per mine (the
 * first ship found). Pure — the World deletes + resolves damage.
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
      if (pointPolygonDistance(mine, hull.poly) <= CONFIG.mine.triggerRadius) {
        triggers.push({ mine, victimId: hull.id });
        break;
      }
    }
  }
  return triggers;
}

/**
 * The BLAST membership for one detonating mine (Story 1.8): every hull whose
 * silhouette lies within CONFIG.mine.blastRadius of the mine point — OWNER
 * EXCLUDED, enemies AND drones alike, full damage each (the World applies it).
 * Reuses the shared burstVictims silhouette-in-radius rule (the gun/starShells
 * AoE precedent), so mine blasts and shell bursts can never diverge on what
 * "inside the blast" means. Pure — the World deletes the mine and resolves
 * damage/booms.
 */
export function mineBlastVictims(mine: MineState, hulls: readonly HullTarget[]): string[] {
  return burstVictims(mine, CONFIG.mine.blastRadius, hulls, mine.ownerId);
}

/** The world-space hull target for a ship pose (test/inspection convenience —
 *  the sim itself builds targets in World.aliveHulls with per-ship scratch). */
export function hullFor(ship: ShipRecord): HullTarget {
  const s = ship.state;
  return { id: ship.id, poly: transformPolygon(hullSilhouette(ship.hullId), s.x, s.y, s.heading) };
}

/** The mine Equipment row — an ABILITY as of Story 1.8 (isWeapon false via the
 *  shared flag): activation rides the actSeq channel, instant and non-aimed
 *  (no fireT compensation — the gate runs at `now`). The drop ammo pool is
 *  distinct from the live-mine board cap (stats.mine.maxLive) that addMine
 *  enforces. Pool size + reload come from the ship's cached effective stats
 *  (Stage D upgrades). No arc, no aim: a drop is denied only by an empty pool.
 *  Slot state is non-null by the loadout invariant (see index.ts). */
export const mineEquipment: Equipment = {
  id: 'mine',
  isWeapon: EQUIPMENT_IS_WEAPON.mine, // shared weapon/ability split — single source
  tick(ship, slot, dtMs): void {
    tickReload(slot.state!, ship.stats.mine.maxAmmo, ship.stats.mine.reloadMs, dtMs);
  },
  activate(ctx, slot) {
    if (!consume(slot.state!, ctx.ship.stats.mine.reloadMs)) return { ok: false, reason: 'no-ammo' }; // pool empty
    const p = dropPoint(ctx.ship);
    ctx.dropMine(p.x, p.y);
    return { ok: true };
  },
};
