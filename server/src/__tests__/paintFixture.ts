// THE WIRE PAINT, as a test expects it (Story 11.2 review gate, F1): the
// shared paint pipeline under THIS world's room-private per-paint salt —
// exactly what the `blip` / `wk` shapers put on the wire. A test that knows
// the world can rebuild a wire mask; a client, which has no key, cannot.

import { CONFIG, paintCoverage, paintSegmentCoverage, type HullCoverage, type HullId } from '@salvo/shared';
import type { World } from '../game/world.js';

/** The wire mask of a hull painted at `t` (default: now) in world `w`. */
export function wirePaint(w: World, cls: HullId, x: number, y: number, heading: number, t = w.now): HullCoverage {
  return paintCoverage(cls, x, y, heading, CONFIG.vision.radarCellU, t, w.paintSaltFor('hull', [t, x, y, heading]));
}

/** The wire mask of a wake segment painted at `t` (default: now) in world `w`. */
export function wireWakePaint(w: World, ax: number, ay: number, bx: number, by: number, widthU: number, t = w.now): HullCoverage {
  return paintSegmentCoverage(ax, ay, bx, by, widthU, CONFIG.vision.radarCellU, t, w.paintSaltFor('wake', [t, ax, ay, bx, by]));
}
