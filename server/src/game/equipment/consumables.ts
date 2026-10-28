// THE BELT'S PRODUCTION REGISTRY (Story 8.7; first row filled in Story 8.8).
//
// A CONSUMABLE is not a module: it is a STACK of copies sitting in its kind's
// own FIXED slot (5–10, one per keyed kind since Story 9.2 — epic-9
// amendments 21/22), each copy one use, with NO reload ever. The mechanics
// of a row — the no-op tick, the activate-then-spend order and the ONE SPEND
// LAW — live in `consumables/row.ts`, one level down, so that a row module can
// import the factory without importing the registry that imports it. Each
// LINE's own effect lives beside it in `consumables/<lineId>.ts`.
//
// THE REGISTRY HELD SIX ROWS BEFORE STORY 10.9: HULL REPAIR (Story 8.8, epic-8 amendments
// 46 + 51), since Story 8.13 the SUPERCAV TORPEDO — the belt's first
// CLICK-AIMED line (amendment 74, `CONSUMABLE_IS_WEAPON.supercavTorpedo`) —
// since Story 8.16 SHIELD BLOCK and the click-placed DECOY BUOY
// (amendments 116–124; CHAFF, added there too, was retired in Story 9.2 —
// epic-9 amendment 31), since Story 8.17 FLASH SHELLS (id `dazzleShells`,
// amendment 132 — the second click-aimed line; replaced on key `4` by the
// FOULING SHELL in Story 9.4, epic-9 amendments 61–68), and since Story 9.3 the
// MULTI-SPECTRAL COUNTERMEASURE (epic-9 amendments 40–47 — key-fired, one
// cloud per press at the hull's centre; it took SMOKE SCREEN's 8.18 seat).
// STORY 10.9 (epic-10 amendments 2 and 4): the DECOY BUOY is RETIRED and four
// buoy lines share its drop body (consumables/buoys.ts — RADAR / HEALING /
// SHIELD / SPEED, 360° placement), and FLASH SHELLS returns BESIDE the
// FOULING SHELL on its click path (consumables/dazzleShells.ts) — TEN rows.
// The DEPTH CHARGE stub (amendment 83) is the ONE line still `stub` in the
// catalog, so no copy of it can be dealt, picked or stocked — and because the
// registry is PARTIAL, even a forged belt press naming it finds no row and
// fails closed at the gate. The invariant that keeps the two halves honest is
// pinned in equipment.test.ts: every NON-STUB consumable has a row here and
// every STUB one has none.
//
// Pure adapter, like every other row module: no World reference and no I/O.
// `slotRow` (equipment/index.ts) is what resolves an id to either registry.

import { hullRepairRow } from './consumables/hullRepair.js';
import { supercavTorpedoRow } from './consumables/supercavTorpedo.js';
import { shieldBlockRow } from './consumables/shieldBlock.js';
import { foulingShellRow } from './consumables/foulingShell.js';
import { dazzleShellsRow } from './consumables/dazzleShells.js';
import { healingBuoyRow, radarBuoyRow, shieldBuoyRow, speedBuoyRow } from './consumables/buoys.js';
import { countermeasureRow } from './consumables/countermeasure.js';
import { buildConsumableRegistry, type ConsumableRegistry } from './consumables/row.js';

export {
  buildConsumableRegistry,
  consumableRow,
  type ConsumableEffect,
  type ConsumableRegistry,
  type ConsumableRow,
} from './consumables/row.js';

/**
 * THE PRODUCTION REGISTRY — the ten BUILT lines, pinned by equipment.test.ts
 * against the catalog's `stub` flags.
 */
export const CONSUMABLES: ConsumableRegistry = buildConsumableRegistry([
  hullRepairRow,
  supercavTorpedoRow,
  shieldBlockRow,
  foulingShellRow,
  countermeasureRow,
  dazzleShellsRow,
  radarBuoyRow,
  healingBuoyRow,
  shieldBuoyRow,
  speedBuoyRow,
]);
