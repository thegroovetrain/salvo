// Weapon systems registry + the WeaponSystem interface. Selection is
// input.weapon (0 guns / 1 torpedoes / 2 mines); the World routes each
// consumed click (one shot per fireSeq increment) to the selected system, but
// EVERY system's reload ticks every tick regardless of selection (so a weapon
// reloads while another is in use). Each system is a small pure adapter over a
// ShipRecord's per-weapon ammo pool (weapons/ammo.ts) + the shared
// ballistic/mine helpers; the World owns storage (shells/mines maps) and event
// emission, exposed to systems through the narrow FireContext capabilities.

import { weaponMaxAmmo, type EffectiveStats, type WeaponId, type WeaponAmmo, type ShellState } from '@salvo/shared';
import type { ShipRecord } from '../world.js';
import { freshAmmo } from './ammo.js';
import { gunSystem } from './guns.js';
import { torpedoSystem } from './torpedoes.js';
import { mineSystem } from './mines.js';

/**
 * The exact capabilities a weapon system needs from the World to fire — no more.
 * Guns/torpedoes spawn ballistics; mines drop a static point. `mkId` mints a
 * unique projectile id; `now` is server time this tick.
 */
export interface FireContext {
  ship: ShipRecord;
  now: number;
  mkId: () => string;
  spawnBallistic: (shell: ShellState) => void;
  dropMine: (x: number, y: number) => void;
}

/** One hull-mounted weapon: ammo/reload bookkeeping + selection-gated firing.
 *  Pool sizes / reloads are NOT on the system — every read goes through the
 *  ship's cached EFFECTIVE stats (ship.stats, Stage D upgrades), so a stale
 *  CONFIG lookup cannot desync an upgraded hull. */
export interface WeaponSystem {
  readonly id: WeaponId;
  /** Tick this weapon's reload timer (called for every ship, every tick). */
  tick(ship: ShipRecord, dtMs: number): void;
  /** Run fire control when this weapon is selected and a click landed this tick. */
  fire(ctx: FireContext): void;
}

/** Weapon systems indexed by WeaponId (0 guns, 1 torpedoes, 2 mines). */
export const WEAPON_SYSTEMS: readonly WeaponSystem[] = [gunSystem, torpedoSystem, mineSystem];

/** A full ammo array (one WeaponAmmo per weapon, pools at the ship's EFFECTIVE
 *  sizes) for a fresh/respawned/redeployed hull. */
export function freshWeaponAmmo(stats: EffectiveStats): WeaponAmmo[] {
  return WEAPON_SYSTEMS.map((sys) => freshAmmo(weaponMaxAmmo(stats, sys.id)));
}

/**
 * Per-weapon ammo for OwnShip.ammo: a WeaponAmmo[] indexed by WeaponId, each a
 * {n, reloadMsLeft} copy of the ship's live pool. maxAmmo/reloadMs are NOT on
 * the wire — the client reads them from CONFIG (Stage D: from effective stats).
 */
export function weaponAmmo(ship: ShipRecord): WeaponAmmo[] {
  return ship.ammo.map((a) => ({ n: a.n, reloadMsLeft: a.reloadMsLeft }));
}

export { freshAmmo, tickReload, consume } from './ammo.js';
export { gunSystem } from './guns.js';
export { torpedoSystem, fireTorpedo } from './torpedoes.js';
export {
  mineSystem,
  addMine,
  checkMineTriggers,
  dropPoint,
  hullFor,
  type MineState,
  type MineTrigger,
} from './mines.js';
