// Pure blip-mark math (no Pixi import — unit-tested). Story 4.2 turns a radar
// paint from an anonymous soft dot into a TRUE-SCALE hull silhouette plus an
// ARPA-style speed vector, and this module owns every number that decision
// needs. The Pixi adapter (render/radar.ts) only traces what these functions
// return, so the geometry and the hue math stay testable without a GPU.
//
// Two surfaces live here:
//
//   • THE SPEED VECTOR (amendment 10) — an arrowhead vector off the hull whose
//     LENGTH is proportional to speed. It is a heading-aware WORLD-frame mark
//     (offsets relative to the paint position): the blip Graphics is NOT
//     rotated, because the silhouette is likewise pre-rotated through the
//     shared `transformPolygon`, which keeps one frame of reference for both
//     marks and keeps the 1px `pixelLine` stroke free of any node transform.
//
//   • THE LUMINANCE FLOOR (amendment 13) — an ALGORITHMIC lift, not a
//     hand-authored per-hue table. A 1px hairline carries far less light than
//     the 1.5px stroke + solid fill a hull view gets, so the darkest Regatta
//     hues (cobalt, azure, mulberry, lagoon) would sink into the fogged ocean
//     if painted raw. `luminanceFloor` raises a hue's WCAG relative luminance
//     to a target while PRESERVING its hue, so it covers all 20 wheel hues AND
//     the 8 colorblind-assist families with no table to keep in sync.

import type { Vec2 } from '@salvo/shared';

/**
 * An ARPA speed vector in the blip's world frame, as OFFSETS from the paint
 * position (the Graphics is positioned at the paint, untransformed).
 * `from`→`to` is the shaft; the two barbs both terminate at `to`.
 */
export interface SpeedVector {
  /** Shaft root — on the hull outline, in the direction of travel. */
  from: Vec2;
  /** Shaft tip — where the contact reaches in `seconds` at this speed. */
  to: Vec2;
  /** The arrowhead's two swept-back barb endpoints (each pairs with `to`). */
  barbs: readonly [Vec2, Vec2];
}

/** Tunables for `speedVector` (CLIENT_CONFIG.blip.vector supplies them). */
export interface VectorOpts {
  /** Seconds of travel the shaft represents — the tip IS the predicted position. */
  seconds: number;
  /** Shortest drawable shaft (u) — a crawling contact still shows a course. */
  minLength: number;
  /** Longest drawable shaft (u) — a flank-speed contact can't overwhelm the hull. */
  maxLength: number;
  /** Speeds at or below this (u/s) draw NO vector — a dead-in-the-water return. */
  deadSpeed: number;
  /** Arrowhead barb length (u). */
  barbLength: number;
  /** Arrowhead half-angle (rad) between a barb and the shaft. */
  barbAngle: number;
}

/**
 * The ARPA speed vector for a paint, or null when the contact is stopped.
 *
 * Direction is the heading for ahead motion and −heading (ASTERN) for a
 * reversing hull, which is the whole reason `speed` rides the wire SIGNED: a
 * ship backing out of an island shadow is not the same tactical read as one
 * driving at you, and the vector is the only channel that says which.
 *
 * A speed at or below `deadSpeed` draws nothing. That is deliberate and it is
 * what a scope does: a stationary return has no vector, and drawing the
 * min-length stub for one would state a course the contact does not have —
 * which for a decoy buoy (`speed` exactly 0, amendment 11) would be the render
 * inventing the lie the wire refused to tell. The min/max clamp therefore
 * bounds the vector of a MOVING contact: never so short it vanishes, never so
 * long it reads as linework instead of a hull.
 */
export function speedVector(
  heading: number,
  speed: number,
  rootOffset: number,
  o: VectorOpts,
): SpeedVector | null {
  const mag = Math.abs(speed);
  if (mag <= o.deadSpeed) return null;
  const dir = speed < 0 ? heading + Math.PI : heading;
  const ux = Math.cos(dir);
  const uy = Math.sin(dir);
  const len = Math.min(o.maxLength, Math.max(o.minLength, mag * o.seconds));
  const from = { x: ux * rootOffset, y: uy * rootOffset };
  const to = { x: ux * (rootOffset + len), y: uy * (rootOffset + len) };
  return { from, to, barbs: [barb(to, dir, -1, o), barb(to, dir, 1, o)] };
}

/** One arrowhead barb: back down the shaft from `to`, swept by ±`barbAngle`. */
function barb(to: Vec2, dir: number, side: number, o: VectorOpts): Vec2 {
  const a = dir + Math.PI + side * o.barbAngle;
  return { x: to.x + Math.cos(a) * o.barbLength, y: to.y + Math.sin(a) * o.barbLength };
}

/**
 * How far the local-frame silhouette reaches along `angle` (bow at +x, so 0 is
 * the bow extent and π the stern extent). The speed vector roots on the hull
 * OUTLINE rather than at the hull origin, so the shaft never runs through the
 * silhouette it belongs to — the arrowhead terminal and the closed outline stay
 * two separable line grammars (DESIGN.md's requirement that a vector not read
 * as another rotated hull edge).
 */
export function extentAlong(poly: readonly Vec2[], angle: number): number {
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  let max = 0;
  for (const p of poly) {
    const d = p.x * ux + p.y * uy;
    if (d > max) max = d;
  }
  return max;
}

// --- Algorithmic per-hue luminance floor -------------------------------------

/** One sRGB byte → its linear-light value (the WCAG transfer function). */
function srgbToLinear(byte: number): number {
  const s = byte / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance [0,1] of a packed 0xRRGGBB color. */
export function relativeLuminance(color: number): number {
  return (
    0.2126 * srgbToLinear((color >> 16) & 0xff) +
    0.7152 * srgbToLinear((color >> 8) & 0xff) +
    0.0722 * srgbToLinear(color & 0xff)
  );
}

/**
 * The lift curve, parameterized by a single monotone knob `s` ∈ [0,2]:
 *
 *   s ∈ [0,1] — raise VALUE: scale every channel by the same factor, up to the
 *               largest scale that keeps the brightest channel ≤ 255. Equal
 *               channel scaling leaves the HSV hue AND saturation untouched.
 *   s ∈ (1,2] — reduce SATURATION: blend the value-maxed color toward white.
 *               `c' = (1−t)·c + 255t` scales every channel DIFFERENCE (and
 *               max−min) by the same (1−t), so the HSV hue is again exact.
 *
 * Luminance is strictly non-decreasing in `s` and reaches 1 (white) at s = 2,
 * so any target in [0,1] is reachable by bisection. Blues need the second leg:
 * cobalt at full value is still only ~0.19 relative luminance, because the blue
 * channel carries just 7% of the luminance weight.
 */
function liftAt(color: number, s: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const peak = Math.max(r, g, b);
  const v = 1 + Math.min(s, 1) * ((peak > 0 ? 255 / peak : 1) - 1);
  const t = Math.max(0, s - 1);
  const ch = (c: number): number => {
    const lifted = c * v;
    return Math.round(lifted + (255 - lifted) * t);
  };
  return (ch(r) << 16) | (ch(g) << 8) | ch(b);
}

/**
 * Lift `color` until its relative luminance reaches `target`, PRESERVING hue.
 * Already-bright hues (lemon, citron, mint) return byte-identical — the floor
 * only ever raises. 24 bisection steps resolve the knob far finer than the
 * 8-bit output can express, so the result is stable and idempotent.
 *
 * This is the whole of amendment 13: no per-hue table exists, so a new Regatta
 * hue or a re-tuned colorblind family needs no companion edit here.
 */
export function luminanceFloor(color: number, target: number): number {
  if (relativeLuminance(color) >= target) return color;
  let lo = 0;
  let hi = 2;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (relativeLuminance(liftAt(color, mid)) >= target) hi = mid;
    else lo = mid;
  }
  return liftAt(color, hi);
}
