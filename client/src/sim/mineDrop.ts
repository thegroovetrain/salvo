// THE OWN MINE DROP, as the client predicts it (2026-11-23: a mine rolls off
// the stern whatever the aim). ONE read of the shared facts the server drops
// with — `mineDropPoint` at the own hull length, and `blockedWater` at that
// point — so the aim preview's blocked tell (render/aimPreview.ts), the click
// prediction and the reticle verdict (main.ts `slotHasRound`) can never
// disagree about whether a click would drop a mine. Pure, zero I/O.

import { blockedWater, hullEnvelope, mineDropPoint, type HullId, type Island, type Vec2 } from '@salvo/shared';

/** The pose a drop is resolved from (center + heading) and the hull it is. */
export interface MineDropPose {
  x: number;
  y: number;
  heading: number;
  cls: HullId;
}

/** Where the next mine would land, and whether the server would refuse it
 *  there (`'blocked'`: on a rock, or off the water disk). */
export interface MineDropSpot extends Vec2 {
  blocked: boolean;
}

/** Pure: the stern drop point of `ship` and its blocked verdict. */
export function mineDropSpot(ship: MineDropPose, islands: readonly Island[], mapRadius: number): MineDropSpot {
  const p = mineDropPoint(ship, hullEnvelope(ship.cls).hull.length);
  return { x: p.x, y: p.y, blocked: blockedWater(p, islands, mapRadius) };
}
