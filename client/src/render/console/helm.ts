// THE THROTTLE GAUGE'S PURE CORE (Story 12.3 Part B, AC 33; Story 10.10 O6 (3)
// before it) — the footer's vertical nine-detent ladder: ahead on TOP, STOP in
// the middle, astern at the bottom; a box marks the ORDERED detent and an
// arrow the ACTUAL speed; the word under it reads e.g. `¾ AHEAD`, `STOP`,
// `½ ASTERN`. Ordered-vs-actual stays SHAPE-coded (a hollow box against a
// solid arrow), never colour alone.
//
// KEPT from Story 10.10: `DETENT_LABELS`, `detentIndexOf`, `detentLabel`,
// `speedLadderFraction`, `helmKinematics`. RE-EXPRESSED: the flat ladder's
// `detentTickX` / `needleX` (px along a horizontal ladder) become `detentY` /
// `speedY` (px up a vertical one). GONE with the HUD's HDG / KTS readouts and
// the rudder track (AC 33: heading lives on the radar display): the heading /
// speed text and the rudder tick.

import { boostedKinematics, type ShipConfig } from '@salvo/shared';

/** Kinematics subset the arrow needs (ahead / astern denominators). */
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

function clampDetent(index: number): number {
  return index < 0 ? 0 : index > DETENTS - 1 ? DETENTS - 1 : index;
}

/** Pure: detent index [0,8] for a throttle order in [-1,1] (0.25 steps, STOP=4). */
export function detentIndexOf(throttle: number): number {
  const i = Math.round(throttle * 4) + 4;
  return i < 0 ? 0 : i > 8 ? 8 : i;
}

/** Pure: the label of a detent index (clamped). */
export function detentLabel(index: number): string {
  return DETENT_LABELS[clampDetent(index)];
}

/** Pure: the ladder's labelled detents (AC 33: FULL / ½ / STOP / ½ / FULL —
 *  13 px labels on all nine would collide), every other one from full astern. */
export function labelledDetent(index: number): boolean {
  return clampDetent(index) % 2 === 0;
}

/** Pure: the word under the gauge for the ordered detent — `STOP`, or the
 *  detent's fraction and its direction (`¾ AHEAD`, `FULL ASTERN`). */
export function throttleWord(index: number): string {
  const i = clampDetent(index);
  if (i === STOP_DETENT) return DETENT_LABELS[i];
  return `${DETENT_LABELS[i]} ${i > STOP_DETENT ? 'AHEAD' : 'ASTERN'}`;
}

/** Pure: the y of a detent on a ladder from `top` to `top + h`, `inset` in
 *  from both ends — full ahead at the top, STOP centred, full astern at the
 *  bottom; clamped onto the end stops. */
export function detentY(index: number, top: number, h: number, inset: number): number {
  const step = (h - 2 * inset) / (DETENTS - 1);
  return top + inset + (DETENTS - 1 - clampDetent(index)) * step;
}

/** Pure: the ACTUAL speed on the telegraph's [-1,1] axis — ahead on maxSpeed,
 *  astern on reverseSpeed, saturating at ±1. */
export function speedLadderFraction(speed: number, kin: LadderKin): number {
  const denom = speed >= 0 ? kin.maxSpeed : kin.reverseSpeed;
  const f = denom > 0 ? speed / denom : 0;
  return f < -1 ? -1 : f > 1 ? 1 : f;
}

/** Pure: the arrow's y — the ladder fraction spread over the same span the
 *  detents occupy (one scale), clamped by construction. */
export function speedY(speed: number, kin: LadderKin, top: number, h: number, inset: number): number {
  const mid = detentY(STOP_DETENT, top, h, inset);
  return mid - speedLadderFraction(speed, kin) * (h / 2 - inset);
}

/** Pure: the arrow's denominators — the BOOSTED cap while the boost window
 *  is open, through the one shared mutator (a proportion, never a flat add). */
export function helmKinematics(kin: ShipConfig, boostFactor: number, boostActive: boolean): ShipConfig {
  return boostedKinematics(kin, boostFactor, boostActive);
}
