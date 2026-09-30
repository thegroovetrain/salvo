// Wake-drafting kinematics hook (Story 8.19, Eric rulings 2026-09-30, epic-8
// amendments 151–155) — the sibling of sim/boost.ts and sim/slow.ts. THE one
// shared function both sim sides call, per tick, to fold the wake-draft lift
// into a ship's kinematics before stepShip: the server computes the lift with
// `draftLift` (sim/wake.ts) and sends it self-privately as `OwnShip.draft`;
// the client's prediction/replay folds that same double through this same
// function, so a drafting hull predicts and reconciles with zero ad-hoc drift.
//
// The lift raises the FORWARD maxSpeed cap ONLY (the boost's shape): reverse,
// accel, decel, turnRate and steerageSpeed are untouched, so the hull merely
// accelerates toward a slightly higher ceiling and decays back at its class
// decel once it leaves the lane. The lift is a fraction of the cap AS IT
// STANDS at this step — after the boost and the slow — and is never written
// into `EffectiveStats.kinematics`. Pure, zero I/O, plain objects — never
// mutates its input.
//
// PINNED COMPOSITION ORDER (server AND predictor, byte-identical):
//   boostedKinematics → slowedKinematics → draftedKinematics → hookKinematics
// (boost first, the prop-fouling slow second, the wake draft third, hooks
// last — see sim/boost.ts, sim/slow.ts and sim/hooks.ts).

import type { ShipConfig } from './ship.js';

/**
 * Return kinematics with the forward maxSpeed cap raised by `lift` of itself
 * while drafting is `active` (`lift` = the scalar `draftLift` returned, in
 * (0, CONFIG.wake.draft.lift]). Returns the input UNCHANGED (same reference)
 * when inactive or `lift` is 0 — the common, allocation-free path. Otherwise
 * returns a fresh copy with `maxSpeed + maxSpeed * lift`; every other field is
 * copied verbatim (reverseSpeed included — reverse never drafts).
 *
 * THE EXPRESSION IS PINNED: `kin.maxSpeed + kin.maxSpeed * lift`, never
 * `kin.maxSpeed * (1 + lift)` — the two round differently in the last bit and
 * both sides must land on the identical double (the boost's law).
 */
export function draftedKinematics(kin: ShipConfig, lift: number, active: boolean): ShipConfig {
  if (!active || lift === 0) return kin;
  return { ...kin, maxSpeed: kin.maxSpeed + kin.maxSpeed * lift };
}
