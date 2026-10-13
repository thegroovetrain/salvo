// Prop-fouling slow kinematics hook (Story 2.8) — the bespoke mirror of
// sim/boost.ts for the FOULING MINES line's victim debuff. THE one
// shared function both sim sides call, per tick, to fold an active slow into a
// ship's kinematics before stepShip: the server's stepShips and the client's
// prediction/replay each derive the same per-tick ShipConfig from (kinematics,
// factor, active), so a fouled hull predicts and reconciles with zero ad-hoc
// drift (the victim knows via self-private you.slowedUntil).
//
// The slow scales BOTH speed caps — maxSpeed AND reverseSpeed — by `factor`
// (the FOULING MINES row's folded `slowFactor`, base CONFIG.foulingMines
// .slowFactor; it was CONFIG.mine.foulFactor until epic-8 amendment 81 made
// fouling its own tiered line): a fouled prop is slow in every direction. accel,
// decel, turnRate and steerageSpeed are untouched. Pure, zero I/O, plain
// objects — never mutates its input.
//
// The FOULING SHELL's zone slow (Story 9.4, epic-9 amendments 61–68) runs
// through this SAME function a second time, with
// CONFIG.foulingShell.slowFactor gated on `now < fouledUntil`.
//
// PINNED COMPOSITION ORDER (server AND predictor, byte-identical) — five stages:
//   boostedKinematics
//   → slowedKinematics (mine:  ship.slowFactor,                  now < slowedUntil)
//   → slowedKinematics (shell: CONFIG.foulingShell.slowFactor,   now < fouledUntil)
//   → draftedKinematics
//   → hookKinematics
// (boost first, the two slows second and third, the wake draft fourth, hooks
// last — see sim/boost.ts, sim/draft.ts and sim/hooks.ts).
//
// WHY TWO CALLS OF ONE FOLD: each slow SOURCE gets exactly one call, gated by
// its own single stamp per hull. Two different sources (a mine and a shell
// zone) are two calls, so their factors multiply. The same source is one stamp
// and one call however many mines or zones refreshed it, so it never stacks
// with itself. "Different sources multiply, the same source never" is true by
// construction, not by bookkeeping.

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
