// Static map render, built at join. The ocean disc is world content
// (worldRoot.ocean); the boundary, range rings, and terrain are "charted" —
// always visible, fog-immune — so they live in chartRoot.map. All geometry is
// in world units; the camera transform on the parent containers scales it.
//
// TERRAIN (cycle 59) is drawn as a HYPSOMETRIC contour map: the coastline plus
// up to three elevation bands, each OUTLINED in its solid scale colour and
// FILLED with a darker, less intense version of that same colour (Eric's
// ratified grammar, 2026-08-06). Bands paint in ASCENDING level order, so a
// higher band simply covers the one below it — no cut-outs, no compositing.
//
// TWO RULES THIS FILE MUST NEVER BREAK:
//   • The level-0 outline IS `isle.poly`, vertex for vertex — the same polygon
//     the sim collides and LOS-tests against. No smoothing, no curve fitting,
//     no inflation.
//   • Levels 1..3 are RENDER-ONLY isolines of the height field. Nothing in this
//     file may become an input to anything the sim reads.
//
// COST MODEL: the layer is still built ONCE, not per frame. The only thing that
// can invalidate it is the CAMERA ZOOM (the strokes are screen-locked), so
// `update()` re-tessellates on a meaningful zoom change and does nothing —
// two float compares — on every other frame. A production map is ~1,100
// vertices total, so a redraw is far cheaper than the fog re-bake that the same
// zoom change already schedules.

import { Graphics } from 'pixi.js';
import type { GameMap, Island, Vec2 } from '@salvo/shared';
import type { StageLayers } from './stage.js';
import { CLIENT_CONFIG } from '../config.js';
import { strokeWorldWidth } from '../util/math.js';

// DESIGN.md CIC palette (tokens).
const C = CLIENT_CONFIG.colors;
const T = CLIENT_CONFIG.terrain;
const OCEAN_FILL = C.void; // black void ocean (surfaces role: page/canvas base)
const BOUNDARY = C.silver; // silver-white CIC boundary
const RING = C.silver; // faint silver range rings

/** The hypsometric ramp, index = band level (0 shore .. 3 summit). */
const RAMP = C.terrain;
/** Highest band level the ramp can colour — 4 bands is the ratified ceiling. */
export const MAX_BAND_LEVEL = RAMP.length - 1;

const RANGE_RINGS = 4; // concentric range rings inside the boundary

/** One drawable elevation band: every polygon that paints at `level`. */
export interface Band {
  /** 0 = the island body (the collided coastline); 1..3 = height isolines. */
  level: number;
  /** World-space CCW loops. A LIST because one band may split into several
   *  disjoint peaks on an elongated island — a feature, not an error. */
  polys: Vec2[][];
}

/**
 * Pure: the draw list for one island, in ASCENDING level order.
 *
 * Band 0 is synthesised from `isle.poly` (the island body is the shore band —
 * it is not carried in `contours`, which starts at level 1); bands 1..3 come
 * from `isle.contours` SORTED, because ascending order is what makes "higher
 * bands paint over lower ones" true by construction rather than by trusting the
 * generator's emission order.
 *
 * A band whose level is off the ramp, or which carries no polygons at all, is
 * dropped here rather than at the Pixi call: a level with no colour would paint
 * an undefined tint, and an empty `polys` list is a no-op that still costs a
 * Graphics path. A flat rock (no contours) yields exactly one band.
 */
export function islandBands(isle: Island): Band[] {
  const bands: Band[] = [{ level: 0, polys: [isle.poly] }];
  for (const c of isle.contours) {
    if (c.level < 1 || c.level > MAX_BAND_LEVEL) continue;
    if (c.polys.length === 0) continue;
    bands.push({ level: c.level, polys: c.polys });
  }
  bands.sort((a, b) => a.level - b.level);
  return bands;
}

/** Pure: the stroke/fill token pair for a band level. Out-of-range levels are
 *  CLAMPED to the ramp rather than returning undefined — `islandBands` already
 *  drops them, so this is the second line of defence, not the first. */
export function bandColors(level: number): { stroke: number; fill: number } {
  const i = Math.min(MAX_BAND_LEVEL, Math.max(0, Math.floor(level)));
  return RAMP[i];
}

/**
 * Pure: does the terrain layer need re-stroking at this zoom? Terrain geometry
 * never moves, so the camera zoom is the whole key (relative, since `zoom` is
 * px-per-world-unit and its scale depends on the viewport). `lastZoom < 0` is
 * the never-drawn sentinel; a degenerate zoom is redrawn once and then held, so
 * a NaN camera cannot drive a redraw every frame.
 */
export function needsZoomRedraw(lastZoom: number, zoom: number): boolean {
  if (lastZoom < 0) return true;
  if (!Number.isFinite(zoom)) return false;
  return Math.abs(zoom - lastZoom) > Math.abs(lastZoom) * T.redrawZoomFrac;
}

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

/** One filled-and-outlined loop, ready for Pixi. */
export interface TerrainOp {
  poly: Vec2[];
  /** The darker, less intense body of the band. */
  fill: number;
  /** The solid scale colour the band is outlined in. */
  stroke: number;
  /** World-space stroke width (already screen-locked for this zoom). */
  width: number;
}

/**
 * PURE: the whole terrain layer as an ordered list of draw operations — the
 * ratified grammar with no Pixi anywhere near it, so band ordering, split-band
 * completeness, colour selection and stroke width are all unit-testable.
 *
 * ORDER IS THE COMPOSITING RULE: ops are emitted island by island and, within
 * an island, in ascending band level, so a higher band simply paints over the
 * one beneath it. Islands never overlap, so no cross-island ordering is needed.
 */
export function terrainDrawPlan(islands: readonly Island[], zoom: number): TerrainOp[] {
  const coastW = strokeWorldWidth(T.coastPx, zoom);
  const contourW = strokeWorldWidth(T.contourPx, zoom);
  const ops: TerrainOp[] = [];
  for (const isle of islands) {
    for (const band of islandBands(isle)) {
      const { stroke, fill } = bandColors(band.level);
      const width = band.level === 0 ? coastW : contourW;
      // EVERY poly in the band: a band that split into two peaks draws two.
      for (const poly of band.polys) ops.push({ poly, fill, stroke, width });
    }
  }
  return ops;
}

/** Draw the terrain plan into the chart Graphics (the only Pixi in this seam). */
function drawIslands(g: Graphics, map: GameMap, zoom: number): void {
  for (const op of terrainDrawPlan(map.islands, zoom)) {
    g.poly(op.poly, true)
      .fill({ color: op.fill, alpha: 1 })
      .stroke({ width: op.width, color: op.stroke, alpha: 1 });
  }
}

/**
 * The charted map layer: static boundary/rings plus the zoom-locked terrain.
 * Held by the game so the render loop can feed it the camera zoom; everything
 * else about it is built once at join.
 */
export class MapChart {
  /** Boundary + range rings — fixed world widths, drawn exactly once. */
  private readonly chart = new Graphics();
  /** The hypsometric terrain, re-stroked only on a meaningful zoom change. */
  private readonly terrain = new Graphics();
  private lastZoom = -1;

  constructor(private readonly map: GameMap, layers: StageLayers) {
    const ocean = new Graphics();
    drawOcean(ocean, map.radius);
    layers.ocean.addChild(ocean);

    drawBoundaryAndRings(this.chart, map.radius);
    // Added in this order so terrain paints OVER the range rings, exactly as it
    // did when both shared one Graphics.
    layers.map.addChild(this.chart);
    layers.map.addChild(this.terrain);
  }

  /** Feed the camera's px-per-world-unit each frame; re-tessellates only when
   *  the screen-locked stroke width has drifted enough to matter. */
  update(zoom: number): void {
    if (!needsZoomRedraw(this.lastZoom, zoom)) return;
    // A degenerate zoom latches as 0, NOT as the NaN itself: `strokeWorldWidth`
    // has already drawn at its raw-px fallback, and a NaN in `lastZoom` would
    // make every later comparison NaN — the layer would either redraw forever
    // or never redraw again. 0 is a real number that differs from every valid
    // zoom, so the next good frame re-tessellates exactly once.
    this.lastZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 0;
    this.terrain.clear();
    drawIslands(this.terrain, this.map, zoom);
  }
}

/**
 * Build all static map graphics once. Ocean -> world layer; boundary, rings,
 * and terrain -> chart layer. Returns the chart so the render loop can keep the
 * screen-locked strokes honest as the player zooms.
 */
export function buildMap(map: GameMap, layers: StageLayers, zoom: number): MapChart {
  const chart = new MapChart(map, layers);
  chart.update(zoom);
  return chart;
}
