// TEST FIXTURE — THE NEUTRAL HULL (Story 10.4).
//
// None of the four battleships sits at index 100 across the board (R1 gives
// every hull its own table), so a test that wants "the CONFIG number, with no
// index in the way" has no shipped hull to ask. This envelope is the default
// hull's geometry, kinematics and battery with EVERY index at
// `CONFIG.index.base` — the hull on which RELOAD, ENGINES, INTEL, ARMOR and
// POWER are all the identity — and (Story 11.2, R2) its battery's
// `reachFrac` at 1, so a zero-card fold reads the CONFIG bases byte for byte.
// (RANGE, the sixth index, left with Story 11.2, R9; the per-hull reach ratio
// it carried is `battery.reachFrac`.)
//
// A fixture, never a ship: it is not in `SHIP_CLASS_IDS` and nothing outside
// the tests can sail it.

import { CONFIG, DEFAULT_CLASS_ID, INDEX_IDS, type HullIndex, type ShipClass } from '../constants.js';

const base = CONFIG.index.base;

/** Every index at the base. */
export const NEUTRAL_INDEX: HullIndex = Object.fromEntries(INDEX_IDS.map((k) => [k, base])) as HullIndex;

const DEFAULT_HULL: ShipClass = CONFIG.shipClasses[DEFAULT_CLASS_ID];

/** The default hull's envelope with every index at `CONFIG.index.base` and its battery at the base reach. */
export const NEUTRAL_HULL: ShipClass = {
  ...DEFAULT_HULL,
  index: NEUTRAL_INDEX,
  ...(DEFAULT_HULL.battery ? { battery: { ...DEFAULT_HULL.battery, reachFrac: 1 } } : {}),
};
