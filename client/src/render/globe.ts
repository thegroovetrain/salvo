// THE TWO GLOBES' SHARED SKIN (Story 8.6) — the bed both ends of the HUD bar
// stand on, and the circular-segment polygon the HP globe fills with.
//
// The bar ends in two 104 px discs: the HP globe at the left, the helm globe at
// the right (epic-8 amendment 32 put them at the same size). They are drawn by
// two different modules with nothing else in common, so exactly the parts that
// ARE common live here — the dark bed with its hairline ring, and the "how much
// water is in the bowl" polygon. Everything above the waterline (the readouts,
// the tick arc, the needle, the pending band) belongs to the owning module.
//
// Pixi's y grows DOWNWARD, so "below the waterline" means y GREATER than the
// waterline, and a fuller hull has a SMALLER `waterY`. The segment is returned
// in the globe's own space (centre at the origin) so a caller can place it
// without the helper knowing where the globe sits.

import type { Graphics } from 'pixi.js';
import { CLIENT_CONFIG } from '../config.js';
import type { PolyPoint } from '../util/poly.js';

const C = CLIENT_CONFIG.colors;
const B = CLIENT_CONFIG.hudBar;

/** Arc samples per segment. Well over the ratified 48 floor: at r 52 that is a
 *  vertex every ~5 px of arc, which is under a pixel of sag. */
const SEGMENT_SAMPLES = 64;

/**
 * Pure: the circular segment of a radius-`r` circle centred on the ORIGIN that
 * lies BELOW the horizontal line `y = waterY`, as a closed polygon.
 *
 * Three regimes, all total:
 *   waterY >= r    the line is at or under the bowl's floor — EMPTY (a hull at
 *                  0 draws nothing, not a sliver)
 *   waterY <= -r   the line is at or over the crown — the FULL circle
 *   otherwise      the arc from one end of the chord round through the bottom
 *                  to the other, closing along the chord itself
 *
 * A non-positive radius is empty rather than an error: a degenerate globe has
 * no water in it.
 */
export function circleSegmentBelow(r: number, waterY: number): PolyPoint[] {
  if (!(r > 0) || !Number.isFinite(waterY) || waterY >= r) return [];
  if (waterY <= -r) {
    return Array.from({ length: SEGMENT_SAMPLES }, (_, i) => {
      const t = (i / SEGMENT_SAMPLES) * Math.PI * 2;
      return { x: r * Math.cos(t), y: r * Math.sin(t) };
    });
  }
  // `a` is the chord's angle off the +x axis; the arc below the chord runs from
  // `a` (the right-hand end) through pi/2 (the bowl's floor) to `pi - a`.
  const a = Math.asin(waterY / r);
  const span = Math.PI - 2 * a;
  return Array.from({ length: SEGMENT_SAMPLES + 1 }, (_, i) => {
    const t = a + (i / SEGMENT_SAMPLES) * span;
    return { x: r * Math.cos(t), y: r * Math.sin(t) };
  });
}

/**
 * Paint a globe's BED into `g`: the dark glass disc the readouts sit on, ringed
 * with one hairline. `ringColor`/`ringAlpha` are the caller's — the HP globe
 * rings itself in its own damage-ramp colour, the helm globe in plain silver —
 * so the shared part really is only the bed and the stroke width.
 */
export function drawGlobeBed(
  g: Graphics,
  cx: number,
  cy: number,
  r: number,
  ringColor: number,
  ringAlpha: number,
): void {
  g.circle(cx, cy, r).fill({ color: C.cardScrim, alpha: B.globeBedAlpha });
  g.circle(cx, cy, r).stroke({ width: B.lineW, color: ringColor, alpha: ringAlpha });
}
