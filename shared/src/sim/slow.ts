// Prop-fouling slow kinematics hook (Story 2.8) — the bespoke mirror of
// sim/boost.ts for the PROP-FOULING MINES doctrine's victim debuff. THE one
// shared function both sim sides call, per tick, to fold an active slow into a
// ship's kinematics before stepShip: the server's stepShips and the client's
// prediction/replay each derive the same per-tick ShipConfig from (kinematics,
// factor, active), so a fouled hull predicts and reconciles with zero ad-hoc
// drift (the victim knows via self-private you.slowedUntil).
//
// The slow scales BOTH speed caps — maxSpeed AND reverseSpeed — by `factor`
// (CONFIG.mine.foulFactor): a fouled prop is slow in every direction. accel,
// decel, turnRate and steerageSpeed are untouched. Pure, zero I/O, plain
// objects — never mutates its input.
//
// PINNED COMPOSITION ORDER (server AND predictor, byte-identical):
//   boostedKinematics → slowedKinematics → hookKinematics
// (boost first, slow second, hooks last — see sim/boost.ts and sim/hooks.ts).

import type { ShipConfig } from './ship.js';

/**
 * Return kinematics with both speed caps scaled by `factor` while the slow is
 * `active`. Returns the input UNCHANGED (same reference) when inactive or
 * `factor` is 1 — the common, allocation-free path (the boostedKinematics
 * idiom). Otherwise returns a fresh copy with maxSpeed AND reverseSpeed
 * scaled; every other field is copied verbatim.
 */
export function slowedKinematics(kin: ShipConfig, factor: number, active: boolean): ShipConfig {
  if (!active || factor === 1) return kin;
  return { ...kin, maxSpeed: kin.maxSpeed * factor, reverseSpeed: kin.reverseSpeed * factor };
}
