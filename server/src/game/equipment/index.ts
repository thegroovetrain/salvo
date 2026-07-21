// Equipment registry + the Equipment interface (Story 1.2). Every fitted
// system — the three weapons today (guns / torpedoes / mines), non-weapon
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

import { type EquipmentId, type LoadoutSlot, type ShellState, type WeaponAmmo } from '@salvo/shared';
import type { ShipRecord } from '../world.js';
import { gunEquipment } from './guns.js';
import { torpedoEquipment } from './torpedoes.js';
import { mineEquipment } from './mines.js';

/**
 * The exact capabilities equipment needs from the World to activate — no more
 * (formerly FireContext, identical shape). Guns/torpedoes spawn ballistics;
 * mines drop a static point. `mkId` mints a unique projectile id; `now` is
 * server time this tick.
 */
export interface ActivationContext {
  ship: ShipRecord;
  now: number;
  /** Water-disk radius (u) — the gun clamps its burst point inside it so a rim
   *  ship firing outward bursts in-bounds rather than expiring at the edge. */
  mapRadius: number;
  mkId: () => string;
  spawnBallistic: (shell: ShellState) => void;
  dropMine: (x: number, y: number) => void;
}

/** Why an activation was refused. Derived from the EXISTING internal outcomes
 *  (arc-miss keeps the pool; empty pool denies); consumed only by tests —
 *  never a wire event. 'empty-slot' and 'dead' both come from the gate, never
 *  from a row: the gate refuses a dead ship ('dead') and an empty/out-of-range
 *  slot ('empty-slot') before any row is dispatched. */
export type ActivationDenial = 'no-ammo' | 'out-of-arc' | 'empty-slot' | 'dead';

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
  mine: mineEquipment,
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
export { gunEquipment } from './guns.js';
export { torpedoEquipment, fireTorpedo } from './torpedoes.js';
export {
  mineEquipment,
  addMine,
  checkMineTriggers,
  dropPoint,
  hullFor,
  type MineState,
  type MineTrigger,
} from './mines.js';
