// TEST FIXTURE ONLY — a hull footprint stamp built from a pose, for the march
// and heatmap suites that need steel in a field.
//
// Production no longer builds a ship stamp from a pose at all (epic-9 amendment
// 210, Eric 2026-10-21: "The client should never be calculating a ship's radar
// shadow for any reason."): every hull return arrives on the wire and is laid
// down verbatim by `stampCoverage` in `Radar.marchEcho`. The fixture runs the
// SAME shared `paintCoverage` pipeline the server runs for a wire blip, so a
// fixture hull is cell-for-cell what the wire would have delivered for it.

import { paintCoverage, type HullId } from '@salvo/shared';
import { hullSample, stampCoverage, type ShipStamp } from '../render/radarField.js';
import type { ReturnModelOpts } from '../render/radarHeatmap.js';

/** Where a fixture hull is and what class it is. */
export interface EchoHull {
  id: string;
  x: number;
  y: number;
  heading: number;
  cls: HullId;
}

/** Stamp each hull's wire-equivalent footprint (`paintCoverage` at glint seed
 *  `seedT`) into one ship layer, max-wins. */
export function buildShipStamp(
  hulls: readonly EchoHull[],
  m: ReturnModelOpts,
  cellU: number,
  seedT = 0,
): ShipStamp {
  const stamp: ShipStamp = new Map();
  const steel = hullSample(m);
  for (const h of hulls) {
    stampCoverage(stamp, paintCoverage(h.cls, h.x, h.y, h.heading, cellU, seedT), steel);
  }
  return stamp;
}
