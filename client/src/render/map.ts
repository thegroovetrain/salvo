// Static map render, drawn once at join. The ocean disc is world content
// (worldRoot.ocean); the boundary, range rings, and islands are "charted" —
// always visible, fog-immune — so they live in chartRoot.map. All geometry is
// in world units; the camera transform on the parent containers scales it.

import { Graphics } from 'pixi.js';
import type { GameMap } from '@salvo/shared';
import type { StageLayers } from './stage.js';
import { CLIENT_CONFIG } from '../config.js';

// DESIGN.md CIC palette (tokens).
const C = CLIENT_CONFIG.colors;
const OCEAN_FILL = C.void; // black void ocean (surfaces role: page/canvas base)
const BOUNDARY = C.silver; // silver-white CIC boundary
const RING = C.silver; // faint silver range rings
const ISLAND_FILL = C.islandFill; // dark yellowish terrain
const ISLAND_STROKE = C.islandStroke;

const RANGE_RINGS = 4; // concentric range rings inside the boundary

/** Draw the ocean disc into the world ocean layer. */
function drawOcean(layer: Graphics, radius: number): void {
  layer.circle(0, 0, radius).fill({ color: OCEAN_FILL, alpha: 1 });
}

/** Draw the boundary circle + faint concentric range rings into the chart. */
function drawBoundaryAndRings(g: Graphics, radius: number): void {
  for (let i = 1; i < RANGE_RINGS; i++) {
    const r = (radius * i) / RANGE_RINGS;
    g.circle(0, 0, r).stroke({ width: 1.5, color: RING, alpha: 0.06 });
  }
  g.circle(0, 0, radius).stroke({ width: 2.5, color: BOUNDARY, alpha: 0.35 });
}

/** Draw island circles into the chart (charted terrain). */
function drawIslands(g: Graphics, map: GameMap): void {
  for (const isle of map.islands) {
    g.circle(isle.x, isle.y, isle.r)
      .fill({ color: ISLAND_FILL, alpha: 1 })
      .stroke({ width: 2, color: ISLAND_STROKE, alpha: 0.8 });
  }
}

/**
 * Build all static map graphics once. Ocean -> world layer; boundary, rings,
 * and islands -> chart layer. Returns the created Graphics so callers may
 * dispose/rebuild on a future map change (none in this step).
 */
export function buildMap(map: GameMap, layers: StageLayers): void {
  const ocean = new Graphics();
  drawOcean(ocean, map.radius);
  layers.ocean.addChild(ocean);

  const chart = new Graphics();
  drawBoundaryAndRings(chart, map.radius);
  drawIslands(chart, map);
  layers.map.addChild(chart);
}
