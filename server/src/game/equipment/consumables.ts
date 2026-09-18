// THE BELT'S PRODUCTION REGISTRY (Story 8.7; first row filled in Story 8.8).
//
// A CONSUMABLE is not a module: it is a STACK of copies sitting in one of the
// four belt slots (5–8), each copy one use, with NO reload ever. The mechanics
// of a row — the no-op tick, the activate-then-spend order and the ONE SPEND
// LAW — live in `consumables/row.ts`, one level down, so that a row module can
// import the factory without importing the registry that imports it. Each
// LINE's own effect lives beside it in `consumables/<lineId>.ts`.
//
// THE REGISTRY HOLDS EXACTLY ONE ROW TODAY: HULL REPAIR (Story 8.8, epic-8
// amendments 46 + 51). The other four consumable lines are still `stub` in the
// catalog, so no copy of them can be dealt, picked or stocked — and because the
// registry is PARTIAL, even a forged belt press naming one finds no row and
// fails closed at the gate. The invariant that keeps the two halves honest is
// pinned in equipment.test.ts: every NON-STUB consumable has a row here and
// every STUB one has none.
//
// Pure adapter, like every other row module: no World reference and no I/O.
// `slotRow` (equipment/index.ts) is what resolves an id to either registry.

import { hullRepairRow } from './consumables/hullRepair.js';
import { buildConsumableRegistry, type ConsumableRegistry } from './consumables/row.js';

export {
  buildConsumableRegistry,
  consumableRow,
  type ConsumableEffect,
  type ConsumableRegistry,
  type ConsumableRow,
} from './consumables/row.js';

/**
 * THE PRODUCTION REGISTRY — HULL REPAIR and nothing else, pinned by
 * equipment.test.ts against the catalog's `stub` flags.
 */
export const CONSUMABLES: ConsumableRegistry = buildConsumableRegistry([hullRepairRow]);
