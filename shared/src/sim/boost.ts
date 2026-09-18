// Shift-boost kinematics hook (Story 1.6, re-cut proportional in Story 8.9) —
// THE one shared function both sim sides call, per tick, to fold an active
// boost into a ship's kinematics before stepShip. The server's stepShips and
// the client's prediction/replay each derive the same per-tick ShipConfig from
// (post-fold kinematics, factor, active), so a boosted hull predicts and
// reconciles with zero ad-hoc drift.
//
// THE INPUT IS THE POST-FOLD KINEMATICS (`EffectiveStats.kinematics`), so the
// SPEED ladder is INSIDE the bonus: the boost adds `factor × kin.maxSpeed`,
// not a flat u/s (Eric ruling 2026-09-18, epic-8 amendment 55 — a SPEED-capped
// Torpedo Boat boosts to 68.75, not 65). The bonus is layered HERE, per tick,
// and is NEVER written into `EffectiveStats.kinematics`: the bots' rated-speed
// deadband reads `kinematics.maxSpeed` as the RATED cap.
//
// The boost raises the FORWARD maxSpeed cap ONLY: reverseSpeed, accel, decel,
// turnRate, and steerageSpeed are untouched, so the hull merely accelerates
// toward a higher ceiling at its class accel and decays back at its class decel
// once the window closes (no impulse, no teleport). Pure, zero I/O, plain
// objects — never mutates its input.
//
// PINNED COMPOSITION ORDER (server AND predictor, byte-identical — Story 2.8):
//   boostedKinematics → slowedKinematics → hookKinematics
// (boost first, the prop-fouling slow second — see sim/slow.ts — hooks last).

import type { ShipConfig } from './ship.js';

/**
 * Return kinematics with the forward maxSpeed cap raised by `factor` of itself
 * while the boost is `active` (`factor` = `CONFIG.boost.factor`, 0.25). Returns
 * the input UNCHANGED (same reference) when the boost is inactive or `factor`
 * is 0 — the common, allocation-free path. Otherwise returns a fresh copy with
 * `maxSpeed + maxSpeed * factor`; every other field is copied verbatim
 * (reverseSpeed included — reverse never gets the bonus).
 *
 * THE EXPRESSION IS PINNED: `kin.maxSpeed + kin.maxSpeed * factor`, never
 * `kin.maxSpeed * (1 + factor)` — the two round differently in the last bit and
 * both sides must land on the identical double (the same law sim/arcs.ts's
 * `deg` states).
 */
export function boostedKinematics(kin: ShipConfig, factor: number, active: boolean): ShipConfig {
  if (!active || factor === 0) return kin;
  return { ...kin, maxSpeed: kin.maxSpeed + kin.maxSpeed * factor };
}
