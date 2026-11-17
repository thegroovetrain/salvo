// THE HELM INSTRUMENT'S PURE CORE (Story 10.10, O6 (3)) — the ship console's
// flat telegraph: `HDG 045°` / `18.0 KTS`, the nine-detent ladder laid out
// HORIZONTALLY (astern LEFT, STOP in the middle, ahead RIGHT — the globe's arc
// unrolled), the hollow ordered rung, the solid actual needle and the rudder
// track's tick.
//
// MOVED FROM render/helmGlobe.ts (which W3 deletes): `detentIndexOf`,
// `detentLabel`, `DETENT_LABELS`, `speedLadderFraction`, `rudderTickCenter`
// and the heading / speed readouts, unchanged. RE-EXPRESSED: the globe's
// `detentTickAngle` / `needleAngle` (degrees on an arc) become `detentTickX` /
// `needleX` (px along a straight ladder) — the same fraction, a different
// shape. Ordered-vs-actual stays SHAPE-coded: a hollow rung against a solid
// needle, never colour alone.

import { boostedKinematics, wrapPositive, type ShipConfig } from '@salvo/shared';

/** Kinematics subset the needle needs (ahead / astern denominators). */
export interface LadderKin {
  maxSpeed: number;
  reverseSpeed: number;
}

/** The detent vocabulary, index 0 (full astern) → 8 (full ahead). */
export const DETENT_LABELS = ['FULL', '¾', '½', '¼', 'STOP', '¼', '½', '¾', 'FULL'] as const;

/** The detent count (the ladder's nine ticks). */
export const DETENTS = DETENT_LABELS.length;

/** The STOP detent's index. */
export const STOP_DETENT = (DETENTS - 1) / 2;

/** Pure: detent index [0,8] for a throttle order in [-1,1] (0.25 steps, STOP=4). */
export function detentIndexOf(throttle: number): number {
  const i = Math.round(throttle * 4) + 4;
  return i < 0 ? 0 : i > 8 ? 8 : i;
}

/** Pure: the label of a detent index (clamped). */
export function detentLabel(index: number): string {
  const i = index < 0 ? 0 : index > 8 ? 8 : index;
  return DETENT_LABELS[i];
}

/** Pure: the x of a detent tick on a ladder [x, x + w] — index 0 at the left
 *  end, STOP dead centre, 8 at the right end; clamped onto the end stops. */
export function detentTickX(index: number, x: number, w: number): number {
  const i = index < 0 ? 0 : index > 8 ? 8 : index;
  return x + (w * i) / (DETENTS - 1);
}

/** Pure: the ACTUAL speed on the telegraph's [-1,1] axis — ahead on maxSpeed,
 *  astern on reverseSpeed, saturating at ±1. */
export function speedLadderFraction(speed: number, kin: LadderKin): number {
  const denom = speed >= 0 ? kin.maxSpeed : kin.reverseSpeed;
  const f = denom > 0 ? speed / denom : 0;
  return f < -1 ? -1 : f > 1 ? 1 : f;
}

/** Pure: the needle's x on the ladder — the ladder fraction spread over the
 *  same span the ticks occupy (one scale), clamped by construction. */
export function needleX(speed: number, kin: LadderKin, x: number, w: number): number {
  return x + w / 2 + (speedLadderFraction(speed, kin) * w) / 2;
}

/** Pure: the needle's denominators — the BOOSTED cap while the boost window
 *  is open, through the one shared mutator (a proportion, never a flat add). */
export function helmKinematics(kin: ShipConfig, boostFactor: number, boostActive: boolean): ShipConfig {
  return boostedKinematics(kin, boostFactor, boostActive);
}

/** Pure: the rudder tick's x CENTER for an axis in [-1,1], clamped so the
 *  painted tick never overhangs the track. */
export function rudderTickCenter(rudder: number, trackX: number, trackW: number, inset: number): number {
  const r = rudder < -1 ? -1 : rudder > 1 ? 1 : rudder;
  const raw = trackX + trackW / 2 + (r * trackW) / 2;
  const lo = trackX + inset;
  const hi = trackX + trackW - inset;
  return raw < lo ? lo : raw > hi ? hi : raw;
}

/** Pure: the heading readout — three wrapped digits and the degree sign. */
export function headingText(headingRad: number): string {
  const deg = Math.round((wrapPositive(headingRad) * 180) / Math.PI) % 360;
  return `${deg.toString().padStart(3, '0')}°`;
}

/** Pure: the speed readout — the one-decimal magnitude of the raw hull speed
 *  (the globe's grammar, unchanged). */
export function speedText(speed: number): string {
  return Math.abs(speed).toFixed(1);
}
