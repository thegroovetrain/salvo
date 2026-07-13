// Weapon systems registry + the WeaponSystem interface. Selection is
// input.weapon (0 guns / 1 torpedoes / 2 mines); the World routes `fire` to the
// selected system, but EVERY system's cooldowns tick every tick regardless of
// selection (so a weapon reloads while another is in use). Each system is a
// small pure adapter over a ShipRecord's per-weapon cooldown state + the shared
// ballistic/mine helpers; the World owns storage (shells/mines maps) and event
// emission, exposed to systems through the narrow FireContext capabilities.

import type { WeaponId, ShellState } from '@salvo/shared';
import type { ShipRecord } from '../world.js';
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

/** One hull-mounted weapon: cooldown bookkeeping + selection-gated firing. */
export interface WeaponSystem {
  readonly id: WeaponId;
  /** Tick this weapon's cooldown timers (called for every ship, every tick). */
  tick(ship: ShipRecord, dtMs: number): void;
  /** Soonest-ready cooldown (ms) for this ship — feeds OwnShip.cooldowns[id]. */
  soonest(ship: ShipRecord): number;
  /** Run fire control when this weapon is selected + fire is held this tick. */
  fire(ctx: FireContext): void;
}

/** Weapon systems indexed by WeaponId (0 guns, 1 torpedoes, 2 mines). */
export const WEAPON_SYSTEMS: readonly WeaponSystem[] = [gunSystem, torpedoSystem, mineSystem];

/** [gun, torpedo, mine] soonest-ready cooldowns (ms) for OwnShip.cooldowns. */
export function weaponCooldowns(ship: ShipRecord): number[] {
  return WEAPON_SYSTEMS.map((sys) => sys.soonest(ship));
}

export { gunSystem, freshGunCooldowns, soonestGunCooldown } from './guns.js';
export { torpedoSystem, freshTorpedoCooldowns, soonestTorpedoCooldown, fireTorpedo } from './torpedoes.js';
export {
  mineSystem,
  freshMineCooldown,
  addMine,
  checkMineTriggers,
  dropPoint,
  hullFor,
  GLOBAL_MINE_CAP,
  type MineState,
  type MineTrigger,
} from './mines.js';
