// A HULL'S ZERO-CARD KINEMATICS (Story 10.3). Since the index model, a hull
// envelope no longer carries `maxSpeed` / `turnRate`: both are DERIVED from
// ENGINES / RUDDER inside the one fold (`effectiveStats`, shared
// sim/indexStats.ts). Client code that needs a hull's base kinematics by id —
// the wake pool's ceiling, a contact's wake intensity, the predictor's seed —
// reads them here, through the fold, never by re-deriving from an index.
//
// Memoised per hull id: the envelope is static CONFIG, so the fold's answer
// for zero cards never changes, and the wake reads it every frame.

import { effectiveStats, hullEnvelope, type HullId, type ShipConfig } from '@salvo/shared';

const cache = new Map<HullId, Readonly<ShipConfig>>();

/** The hull's base (zero-card) runtime kinematics, off the fold. */
export function hullBaseKinematics(id: HullId): Readonly<ShipConfig> {
  let kin = cache.get(id);
  if (kin === undefined) {
    kin = Object.freeze({ ...effectiveStats(hullEnvelope(id)).kinematics });
    cache.set(id, kin);
  }
  return kin;
}

/** The hull's base top speed (u/s), off the fold. */
export function hullTopSpeed(id: HullId): number {
  return hullBaseKinematics(id).maxSpeed;
}
