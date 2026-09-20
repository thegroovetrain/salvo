// THE BELT'S PRODUCTION REGISTRY (Story 8.7; first row filled in Story 8.8).
//
// A CONSUMABLE is not a module: it is a STACK of copies sitting in one of the
// four belt slots (5–8), each copy one use, with NO reload ever. The mechanics
// of a row — the no-op tick, the activate-then-spend order and the ONE SPEND
// LAW — live in `consumables/row.ts`, one level down, so that a row module can
// import the factory without importing the registry that imports it. Each
// LINE's own effect lives beside it in `consumables/<lineId>.ts`.
//
// THE REGISTRY HOLDS TWO ROWS: HULL REPAIR (Story 8.8, epic-8 amendments
// 46 + 51) and, since Story 8.13, the SUPERCAV TORPEDO — the belt's first
// CLICK-AIMED line (amendment 74, `CONSUMABLE_IS_WEAPON.supercavTorpedo`).
// The other four consumable lines (SHIELD BLOCK, SMOKE SCREEN, CHAFF, DECOY
// BUOY) and the DEPTH CHARGE stub (amendment 83) are still `stub` in the
// catalog, so no copy of them can be dealt, picked or stocked — and because
// the registry is PARTIAL, even a forged belt press naming one finds no row
// and fails closed at the gate. The invariant that keeps the two halves honest
// is pinned in equipment.test.ts: every NON-STUB consumable has a row here and
// every STUB one has none.
//
// Pure adapter, like every other row module: no World reference and no I/O.
// `slotRow` (equipment/index.ts) is what resolves an id to either registry.

import { hullRepairRow } from './consumables/hullRepair.js';
import { supercavTorpedoRow } from './consumables/supercavTorpedo.js';
import { buildConsumableRegistry, type ConsumableRegistry } from './consumables/row.js';

export {
  buildConsumableRegistry,
  consumableRow,
  type ConsumableEffect,
  type ConsumableRegistry,
  type ConsumableRow,
} from './consumables/row.js';

/**
 * THE PRODUCTION REGISTRY — the two BUILT lines, pinned by equipment.test.ts
 * against the catalog's `stub` flags.
 */
export const CONSUMABLES: ConsumableRegistry = buildConsumableRegistry([hullRepairRow, supercavTorpedoRow]);
