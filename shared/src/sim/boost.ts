// Speed-boost kinematics hook (Story 1.6) — THE one shared function both sim
// sides call, per tick, to fold an active speed boost into a ship's kinematics
// before stepShip. The server's stepShips and the client's prediction/replay
// each derive the same per-tick ShipConfig from (base kinematics, bonus,
// active), so a boosted hull predicts and reconciles with zero ad-hoc drift.
//
// The boost raises the FORWARD maxSpeed cap ONLY: reverseSpeed, accel, decel,
// turnRate, and steerageSpeed are untouched, so the hull merely accelerates
// toward a higher ceiling at its class accel and decays back at its class decel
// once the window closes (no impulse, no teleport). Pure, zero I/O, plain
// objects — never mutates its input.

import type { ShipConfig } from './ship.js';

/**
 * Return kinematics with the forward maxSpeed cap raised by `bonus` while the
 * boost is `active`. Returns the input UNCHANGED (same reference) when the boost
 * is inactive or `bonus` is 0 — the common, allocation-free path. Otherwise
 * returns a fresh copy with `maxSpeed + bonus`; every other field is copied
 * verbatim (reverseSpeed included — reverse never gets the bonus).
 */
export function boostedKinematics(kin: ShipConfig, bonus: number, active: boolean): ShipConfig {
  if (!active || bonus === 0) return kin;
  return { ...kin, maxSpeed: kin.maxSpeed + bonus };
}
