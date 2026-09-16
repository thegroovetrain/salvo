// THE COOLDOWN WIPE (Story 8.6) — the radial clock that replaces the hotbar's
// perimeter track on every cooling slot.
//
// The mock draws it as a CSS `conic-gradient`: a dark overlay over the square
// that UNCOVERS CLOCKWISE FROM TWELVE as the reload elapses, with the seconds
// left as one big centred numeral over the dimmed icon. So the thing this
// module computes is the DARK region — what is still covered — as a polygon:
// the square's centre plus the run of its perimeter from the sweep angle round
// to 12 o'clock again.
//
// ANGLE-UNIFORM, DELIBERATELY. A conic gradient sweeps by ANGLE, and a square's
// perimeter is not angle-uniform: walking it by arc-length instead would carry
// the edge faster along the flats than through the corners, and the clock would
// visibly speed up and slow down four times a cycle. `squareRayPoint`
// (util/poly.ts) is what buys the correct sweep — the perimeter is sampled on a
// ray every `wipe.sampleDeg`, with every crossed CORNER emitted exactly so the
// silhouette survives the sampling.
//
// The elapsed fraction itself is NOT computed here: `reloadFraction` in
// render/hud.ts stays the one source, and this module takes its output.
//
// The centred numeral is drawn by the slot row (it owns the square's Text
// children); what lives here is the string it shows and — via
// `CLIENT_CONFIG.hudBar.wipe` — the size, shadow and alphas it shows it at.

import type { Graphics } from 'pixi.js';
import { CLIENT_CONFIG } from '../config.js';
import { squareRayPoint, type PolyPoint } from '../util/poly.js';
import type { Rect } from './hudBar.js';

const C = CLIENT_CONFIG.colors;
const W = CLIENT_CONFIG.hudBar.wipe;

/** The square's four corners as angles on the bar's convention (0 = 12
 *  o'clock, clockwise). Emitted exactly wherever the sweep crosses one. */
const CORNER_DEG = [45, 135, 225, 315];

/** The angles the dark run is sampled at: the sweep edge, every `sampleDeg`
 *  step past it, every corner it crosses, and 12 o'clock to close. */
function wipeAngles(startDeg: number): number[] {
  const step = W.sampleDeg;
  const angles = new Set<number>([startDeg, 360]);
  for (let a = Math.ceil(startDeg / step) * step; a < 360; a += step) angles.add(a);
  for (const corner of CORNER_DEG) if (corner > startDeg && corner < 360) angles.add(corner);
  return [...angles].sort((a, b) => a - b);
}

/**
 * Pure: the DARK (not-yet-elapsed) region of a cooling square, as a closed
 * polygon in the square's own space — centred on (`cx`, `cy`), half-size
 * `half`.
 *
 * `elapsedFrac` is `1 - reloadMsLeft / reloadMs` (hud.ts's `reloadFraction`).
 * At 0 the whole square is dark (the plain four corners — there is no wedge to
 * cut yet); as it climbs, the run starts at `360 * elapsed` degrees clockwise
 * from twelve and the cleared wedge grows out of the top-right; at 1 and beyond
 * there is nothing left to draw and the polygon is EMPTY, which is how a caller
 * can tell "finished" from "just started" without a second predicate.
 */
export function wipePolygon(elapsedFrac: number, half: number, cx = 0, cy = 0): PolyPoint[] {
  const e = Number.isFinite(elapsedFrac) ? elapsedFrac : 0;
  if (e >= 1) return [];
  const at = (deg: number): PolyPoint => {
    const p = squareRayPoint(deg, half);
    return { x: cx + p.x, y: cy + p.y };
  };
  if (e <= 0) return CORNER_DEG.map(at);
  return [{ x: cx, y: cy }, ...wipeAngles(e * 360).map(at)];
}

/**
 * Pure: the seconds numeral over a cooling slot.
 *
 * TENTHS under two seconds (`1.2`) and whole seconds ROUNDED UP above it
 * (`7`) — the same grammar the retired quick-info line used, so the reading a
 * player already has does not move. Rounding up is the honest direction: a
 * numeral that reads `0` on a weapon that cannot fire yet is a lie, and one
 * that reads `7` on 6.1 s left costs nothing.
 *
 * An expired or absent timer is the EMPTY STRING, never `0` — a slot that is
 * not cooling shows no numeral at all.
 */
export function wipeLabel(msLeft: number): string {
  if (!Number.isFinite(msLeft) || msLeft <= 0) return '';
  if (msLeft < W.tenthsBelowMs) return (Math.round(msLeft / 100) / 10).toFixed(1);
  return String(Math.ceil(msLeft / 1000));
}

/**
 * Paint one cooling square's wipe into `g`: the interior scrim over the whole
 * square, then the dark region on top. The icon's dimming (`wipe.iconAlpha`)
 * and the numeral are the slot row's — it owns those children.
 */
export function drawWipe(g: Graphics, square: Rect, elapsedFrac: number): void {
  const half = Math.min(square.w, square.h) / 2;
  const cx = square.x + square.w / 2;
  const cy = square.y + square.h / 2;
  g.rect(square.x, square.y, square.w, square.h).fill({ color: C.cardScrim, alpha: W.scrimAlpha });
  const dark = wipePolygon(elapsedFrac, half, cx, cy);
  if (dark.length < 3) return;
  g.poly(dark.flatMap((p) => [p.x, p.y])).fill({ color: C.cardScrim, alpha: W.darkAlpha });
}
