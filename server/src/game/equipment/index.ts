// Equipment registry + the Equipment interface (Story 1.2). Every fitted
// system — the weapons (guns / torpedoes / mines / broadside), non-weapon
// specials from stories 1.6+ — implements one interface over a ship's loadout
// SLOT. The click's InputMsg.slot names the slot it activates (0 = the gun,
// the permanently-selected default; a primed skillshot click carries its
// slot — the server keeps NO priming state); the World routes each consumed
// click (one activation per fireSeq increment) to that slot's row through the
// single sinking-activation gate (world.ts), but EVERY fitted slot's equipment
// ticks every tick regardless of selection (so a weapon reloads while another
// is in use). Rows are slot-position-independent (the slot is passed in),
// string-keyed by EquipmentId, and deep-frozen — mirroring signals.ts's
// SIGNAL_REGISTRY discipline. Each row is a small pure adapter over its
// slot's EquipmentState pool (equipment/ammo.ts) + the shared ballistic/mine
// helpers; the World owns storage (shells/mines maps) and event emission,
// exposed to rows through the narrow ActivationContext capabilities.

import {
  type EquipmentId,
  type Island,
  type LitCircle,
  type LoadoutSlot,
  type ShellState,
  type WeaponAmmo,
} from '@salvo/shared';
import type { ShipRecord } from '../world.js';
import { gunEquipment } from './guns.js';
import { torpedoEquipment } from './torpedoes.js';
import { mineEquipment } from './mines.js';
import { boostEquipment } from './boost.js';
import { broadsideEquipment } from './broadside.js';
import { starShellsEquipment } from './starShells.js';
import { radarBuoyEquipment } from './radarBuoy.js';

/**
 * The exact capabilities equipment needs from the World to activate — no more
 * (formerly FireContext, identical shape). Guns/torpedoes spawn ballistics;
 * mines drop a static point. `mkId` mints a unique projectile id; `now` is
 * server time this tick.
 */
export interface ActivationContext {
  ship: ShipRecord;
  now: number;
  /**
   * ms — the VALIDATED fire time for this activation (D1 latency compensation,
   * clamped by the World via clampFireTime; = `now` when there is no honored
   * claim). Ballistics take it as bornAt (the World then pre-steps a back-dated
   * shell to where it belongs this tick); mines arm from it
   * (armedAt = fireT + armDelay). Never earlier than the clamp allows.
   */
  fireT: number;
  /** Water-disk radius (u) — the gun clamps its burst point inside it so a rim
   *  ship firing outward bursts in-bounds rather than expiring at the edge;
   *  the stern rack refuses a drop point outside it (Story 1.10 'blocked'). */
  mapRadius: number;
  /** Island landmasses — the mine rack refuses a drop point ashore on one
   *  (Story 1.10 'blocked'); no other row reads them (gun/broadside muzzle
   *  island-blindness stays deliberately out of scope — see the ledger). */
  islands: readonly Island[];
  mkId: () => string;
  /** Store + reveal a launched projectile. `opts.perShellFlash` is the ONE
   *  declared opt-out from the per-owner-per-tick muzzle-flash dedupe: the
   *  BROADSIDE BARRAGE emits a flash PER SHELL (Story 7-5 wave 2, R2.5), where
   *  a multi-barrel gun salvo still collapses to one. */
  spawnBallistic: (shell: ShellState, opts?: BallisticSpawnOptions) => void;
  dropMine: (x: number, y: number) => void;
  /** Place a RADAR BUOY at an already-validated point (Story 7-5 wave 2,
   *  R2.7) — the dropMine sibling: the row validates the rear sector /
   *  placeRange / water legality and hands the World the clicked point. */
  dropBuoy: (x: number, y: number) => void;
  /**
   * THE STAR-SHELL GUN REACH (Story 7-5 wave 2, R2.15): the LIVE lit zones owned
   * by the ACTIVATING ship, as centre+radius circles. The gun row feeds them to
   * the SHARED reach predicate (`@salvo/shared` `gunReachU`) before it clamps an
   * out-of-range click; no other row calls it, which is what makes the extension
   * gun-only.
   *
   * A CAPABILITY, NOT THE ZONE STORE. Rows get a list already filtered to
   * OWN + LIVE — never the zone map, never an owner id or expiry they could
   * re-interpret — so "own flares only" cannot be widened by a row reading a
   * zone it shouldn't (the World keys the closure on the activating ship's id).
   * A THUNK rather than a value so a torpedo/mine/boost activation, which never
   * asks, pays nothing to build the list.
   */
  ownLitZones: () => readonly LitCircle[];
}

/** Per-spawn options for `ActivationContext.spawnBallistic`. */
export interface BallisticSpawnOptions {
  /** true = this shell emits its OWN `mz` rather than being folded into the
   *  owner's one-flash-per-tick dedupe (the broadside's per-shell signals). */
  perShellFlash?: boolean;
}

/** Why an activation was refused. Derived from the internal outcomes
 *  (arc-miss keeps the pool; empty pool denies; a blocked stern drop keeps
 *  charge AND reload — Story 1.10). As of 1.10 the World maps row denials
 *  onto the SELF-PRIVATE wire denial channel (FrameMsg.denied) so denied
 *  presses are never silent; 'empty-slot' and 'dead' both come from the
 *  gate, never from a row, and never reach the wire: the gate refuses a dead
 *  ship ('dead') and an empty/out-of-range slot ('empty-slot') before any
 *  row is dispatched. 'frozen' (Story 6.1, amendment 8) is the third of that
 *  kind — the BOARDING weapons lock, refused at the same gate and equally
 *  wire-silent. */
export type ActivationDenial = 'no-ammo' | 'out-of-arc' | 'blocked' | 'empty-slot' | 'dead' | 'frozen';

/** Outcome of one activation attempt. */
export type ActivationResult = { ok: true } | { ok: false; reason: ActivationDenial };

/** One fitted system: per-slot reload bookkeeping + selection-gated activation.
 *  Pool sizes / reloads are NOT on the row — every read goes through the
 *  ship's cached EFFECTIVE stats (ship.stats, Stage D upgrades), so a stale
 *  CONFIG lookup cannot desync an upgraded hull. Rows receive the SLOT they
 *  operate on (state via slot.state), so a row never assumes its position —
 *  per-class loadouts (1.6–1.9) can fit equipment into any compatible slot.
 *  LOADOUT INVARIANT: a fitted slot always has state (state is null iff
 *  equipmentId is null), and the World never routes an empty slot to a row
 *  (the sinking-activation gate answers 'empty-slot' first). POLICY: fitted
 *  slots always have state — the gate's empty-slot check is the single
 *  boundary, and every downstream reader (slotAmmo, ammo-upgrade grant,
 *  rows via slot.state!) asserts non-null. A violation crashes loudly rather
 *  than improvising a zero pool or silently skipping. */
export interface Equipment {
  readonly id: EquipmentId;
  /** True for systems that launch ordnance (all three today); non-weapon
   *  specials (smoke, boost, …) arrive in stories 1.6+ with false. */
  readonly isWeapon: boolean;
  /** Tick this slot's reload timer (called for every fitted slot, every tick). */
  tick(ship: ShipRecord, slot: LoadoutSlot, dtMs: number): void;
  /** Run activation when this slot is selected and a click landed this tick. */
  activate(ctx: ActivationContext, slot: LoadoutSlot): ActivationResult;
}

/** Freeze the registry AND every row inside it (the SIGNAL_REGISTRY freeze
 *  discipline): a shallow freeze on the map alone would leave rows mutable. */
const deepFreezeRows = <T extends object>(rows: T): Readonly<T> => {
  for (const key of Object.keys(rows) as (keyof T)[]) Object.freeze(rows[key]);
  return Object.freeze(rows);
};

/** String-keyed registry of every fitted system, by EquipmentId. Rows are
 *  added at authoring time only; the World resolves a slot's equipmentId here. */
export const EQUIPMENT: Readonly<Record<EquipmentId, Equipment>> = deepFreezeRows({
  gun: gunEquipment,
  torpedo: torpedoEquipment,
  mine: mineEquipment, // Story 1.8: flipped to a non-weapon (instant drop-astern ability)
  speedBoost: boostEquipment, // Story 1.6: the first non-weapon (ability) row
  broadside: broadsideEquipment, // Story 7-5 wave 2: the Battleship's twin-beam barrage (replaced the cannon)
  starShells: starShellsEquipment, // Story 1.7: the Battleship's lit-zone flare
  radarBuoy: radarBuoyEquipment, // Story 7-5 wave 2: the Mine Layer's click-placed radar relay (replaced the decoy)
});

/**
 * SLOT-ALIGNED ammo for OwnShip.ammo: length SLOT_COUNT, one entry per loadout
 * slot in slot order — null iff that slot is empty (mirrors the LoadoutSlot
 * invariant: state is null iff equipmentId is null), else a FRESH
 * {n, reloadMsLeft} copy of the slot's live pool. maxAmmo/reloadMs are NOT on
 * the wire — the client derives them from its own effective-stats computation.
 */
export function slotAmmo(ship: ShipRecord): (WeaponAmmo | null)[] {
  return ship.loadout.map((slot) =>
    slot.state === null ? null : { n: slot.state.n, reloadMsLeft: slot.state.reloadMsLeft },
  );
}

export { freshAmmo, tickReload, consume } from './ammo.js';
export { boostEquipment } from './boost.js';
export {
  BUOY_SIZE_U,
  addBuoy,
  buoySilhouette,
  buoyTarget,
  radarBuoyEquipment,
  scatterJamFakes,
  type BuoyState,
  type JamFake,
} from './radarBuoy.js';
export { broadsideEquipment, broadsideMuzzles, broadsideTargets } from './broadside.js';
export { starShellsEquipment } from './starShells.js';
export { gunEquipment } from './guns.js';
export { torpedoEquipment, fireTorpedo } from './torpedoes.js';
export {
  mineEquipment,
  addMine,
  captiveTorpedo,
  checkMineTriggers,
  contactBlastRadius,
  dropBlocked,
  hullFor,
  mineBlastVictims,
  minePlacePoint,
  type MineState,
  type MineTripRules,
  type MineTrigger,
} from './mines.js';
