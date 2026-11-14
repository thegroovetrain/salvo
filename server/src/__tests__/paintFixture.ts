// THE WIRE PAINT, as a test expects it (Story 11.2 review gate, F1): the
// shared paint pipeline under THIS world's room-private per-paint salt —
// exactly what the `blip` / `wk` shapers put on the wire. A test that knows
// the world can rebuild a wire mask; a client, which has no key, cannot.
//
// THE OBSERVER (Story 11.3, the arc): every radar paint is smeared about the
// ship whose radar painted it, so a wire mask is a function of that
// observer's position — every fixture takes it.

import { CONFIG, paintCoverage, paintDiscCoverage, paintSegmentCoverage, type HullCoverage, type HullId, type Vec2 } from '@salvo/shared';
import type { World } from '../game/world.js';

/** The wire mask of a hull painted at `t` (default: now) in world `w`, as
 *  the observer at `o` receives it. */
export function wirePaint(w: World, o: Vec2, cls: HullId, x: number, y: number, heading: number, t = w.now): HullCoverage {
  return paintCoverage(cls, x, y, heading, CONFIG.vision.radarCellU, t, w.paintSaltFor('hull', [t, x, y, heading]), o.x, o.y);
}

/** The wire mask of a wake segment painted at `t` (default: now) in world
 *  `w`, as the observer at `o` receives it. */
export function wireWakePaint(w: World, o: Vec2, ax: number, ay: number, bx: number, by: number, widthU: number, t = w.now): HullCoverage {
  return paintSegmentCoverage(ax, ay, bx, by, widthU, CONFIG.vision.radarCellU, t, w.paintSaltFor('wake', [t, ax, ay, bx, by]), o.x, o.y);
}

/** The wire mask of an airdrop crate painted at `t` (default: now) in world
 *  `w`, as the observer at `o` receives it. */
export function wireCratePaint(w: World, o: Vec2, x: number, y: number, t = w.now): HullCoverage {
  return paintDiscCoverage(x, y, CONFIG.drops.radiusU, CONFIG.vision.radarCellU, t, w.paintSaltFor('crate', [t, x, y]), o.x, o.y);
}
