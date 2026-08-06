// Mine activation + trigger resolution — the mine Equipment row.
// A mine is a STATIC point in world state (not a ballistic): PLACED at the
// clicked point by a click-aimed WEAPON activation (Story 2.8, amendment 45 —
// the fireSeq channel; supersedes the 1.8 instant stern drop): the click must
// lie within the REAR placement sector (heading + CONFIG.mine.offset ±
// placeHalfArcDeg — sim/arcs.ts, the single arc-shape source) AND within
// CONFIG.mine.placeRange of the ship; a bad aim is an 'out-of-arc' denial
// (nothing consumed). The mine arms after armDelay, then TRIPS when any
// NON-OWNER live hull silhouette comes within the OWNER's effective
// triggerRadius of it. A trip detonates as a BLAST (Eric ruling 2026-07-22):
// every non-owner hull silhouette within the owner's effective blastRadius
// takes the owner's effective damage (mineBlastVictims below — the owner is
// ALWAYS excluded, the universal AoE convention), with one boom at the mine
// point; same-owner chains cascade in the World (amendment 46). Max `maxLive`
// live mines per player (dropping past the cap despawns that player's OLDEST
// silently — no boom); a defensive global cap bounds total growth. Mines never
// radar-paint; their per-observer visibility is contact-like (the `mine`
// signal row).

import {
  CONFIG,
  EQUIPMENT_IS_WEAPON,
  blockedWater,
  burstVictims,
  hullSilhouette,
  inArc,
  pointPolygonDistance,
  sectorArcFor,
  transformPolygon,
  wrapAngle,
  type Island,
  type HullTarget,
  type Vec2,
} from '@salvo/shared';
import type { ShipRecord } from '../world.js';
import type { Equipment } from './index.js';
import { consume, tickReload } from './ammo.js';

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

// The mine's ratified REAR placement sector (Story 2.8, amendment 45): the
// shared arcFor family is the single arc-shape source, so the enforced sector
// can never drift from what the client classifies/renders. Resolved at module
// load — a non-sector mine arc is a CONFIG/arcs authoring error, failed loudly
// at boot (sectorArcFor throws), never mid-tick.
const REAR_SECTOR = sectorArcFor('mine');

/** The clicked placement point: along the aim bearing at the clicked distance
 *  (never negative), measured from the ship CENTER — "place the mine AT the
 *  clicked point" (amendment 45). Range/arc validity is the row's job. */
export function minePlacePoint(ship: ShipRecord): Vec2 {
  const dist = Math.max(0, ship.input.aimDist);
  return {
    x: ship.state.x + Math.cos(ship.input.aim) * dist,
    y: ship.state.y + Math.sin(ship.input.aim) * dist,
  };
}

/**
 * Is a placement/drop point ILLEGAL water (Story 1.10 'blocked')? True when
 * the point lands inside any island circle or outside the water disk. The mine
 * AND decoy rows both refuse a blocked point WITHOUT consuming anything (charge
 * + reload kept), so the previously silent wasted-charge failure becomes an
 * explicit 'blocked' denial. The rule itself now lives in shared sim/aim.ts
 * (blockedWater) because the client's mine-placement preview draws its blocked
 * tell off the same predicate; this stays as the row's named seam.
 */
export function dropBlocked(p: Vec2, islands: readonly Island[], mapRadius: number): boolean {
  return blockedWater(p, islands, mapRadius);
}

/**
 * Mines that trigger this tick against the given (post-move) hull silhouette
 * polygons: any armed mine within its OWNER's effective trigger radius of a
 * non-owner polygon (pointPolygonDistance — 0 inside, concave-safe;
 * `triggerRadiusFor` is the World's owner-stats lookup with the vacated-owner
 * CONFIG fallback — Story 2.8). One victim per mine (the first ship found).
 * Pure — the World deletes + resolves damage.
 */
export function checkMineTriggers(
  mines: Map<string, MineState>,
  hulls: readonly HullTarget[],
  now: number,
  triggerRadiusFor: (ownerId: string) => number = () => CONFIG.mine.triggerRadius,
): MineTrigger[] {
  const triggers: MineTrigger[] = [];
  for (const mine of mines.values()) {
    if (now < mine.armedAt) continue; // still arming
    const triggerRadius = triggerRadiusFor(mine.ownerId);
    for (const hull of hulls) {
      if (hull.id === mine.ownerId) continue; // owner never trips its own mine
      if (pointPolygonDistance(mine, hull.poly) <= triggerRadius) {
        triggers.push({ mine, victimId: hull.id });
        break;
      }
    }
  }
  return triggers;
}

/**
 * The BLAST membership for one detonating mine (Story 1.8): every hull whose
 * silhouette lies within `blastRadius` of the mine point (the OWNER's
 * effective blast radius as of Story 2.8 — the World threads it in with the
 * vacated-owner CONFIG fallback) — OWNER EXCLUDED, enemies AND drones alike,
 * full damage each (the World applies it). Reuses the shared burstVictims
 * silhouette-in-radius rule (the gun/starShells AoE precedent), so mine blasts
 * and shell bursts can never diverge on what "inside the blast" means. Pure —
 * the World deletes the mine and resolves damage/booms.
 */
export function mineBlastVictims(
  mine: MineState,
  hulls: readonly HullTarget[],
  blastRadius: number = CONFIG.mine.blastRadius,
): string[] {
  return burstVictims(mine, blastRadius, hulls, mine.ownerId);
}

/** The world-space hull target for a ship pose (test/inspection convenience —
 *  the sim itself builds targets in World.aliveHulls with per-ship scratch). */
export function hullFor(ship: ShipRecord): HullTarget {
  const s = ship.state;
  return { id: ship.id, poly: transformPolygon(hullSilhouette(ship.hullId), s.x, s.y, s.heading) };
}

/** The mine Equipment row — a click-aimed WEAPON as of Story 2.8 (amendment
 *  45, isWeapon true via the shared flag): activation rides the fireSeq click
 *  channel with the D1-validated fireT (armedAt = fireT + armDelay). Checks in
 *  the torpedo's arc-first order, nothing consumed on a denial: the click must
 *  lie in the REAR sector (heading + offset ± placeHalfArcDeg) AND within
 *  CONFIG.mine.placeRange — either miss is 'out-of-arc' (the aim-denial
 *  channel, per the amendment ruling); a clicked point inside a rock / off the
 *  water is 'blocked' (Story 1.10); an empty pool is 'no-ammo'. The drop ammo
 *  pool is distinct from the live-mine board cap (stats.mine.maxLive) that
 *  addMine enforces. Pool size + reload come from the ship's cached effective
 *  stats. Slot state is non-null by the loadout invariant (see index.ts). */
export const mineEquipment: Equipment = {
  id: 'mine',
  isWeapon: EQUIPMENT_IS_WEAPON.mine, // shared weapon/ability split — single source
  tick(ship, slot, dtMs): void {
    tickReload(slot.state!, ship.stats.mine.maxAmmo, ship.stats.mine.reloadMs, dtMs);
  },
  activate(ctx, slot) {
    const ship = ctx.ship;
    const center = wrapAngle(ship.state.heading + REAR_SECTOR.offset); // astern-centered
    if (!inArc(ship.input.aim, center, REAR_SECTOR.halfArc)) return { ok: false, reason: 'out-of-arc' };
    // Out-of-RANGE shares the aim-denial channel (amendment 45 ruling): the
    // click names a point the rack cannot reach — same "bad aim" grammar.
    if (ship.input.aimDist > CONFIG.mine.placeRange) return { ok: false, reason: 'out-of-arc' };
    const p = minePlacePoint(ship);
    if (dropBlocked(p, ctx.islands, ctx.mapRadius)) return { ok: false, reason: 'blocked' }; // nothing consumed
    if (!consume(slot.state!, ship.stats.mine.reloadMs)) return { ok: false, reason: 'no-ammo' }; // pool empty
    ctx.dropMine(p.x, p.y);
    return { ok: true };
  },
};
