// Section 2, "Radar shadows at this range": which sea is in radar shadow from
// the ship, from the REAL shared model — `visibilityTo` over the map's real
// height raster, the one-shot ray the server gate calls.
//
// HOW A DIFFERENT K IS SHOWN WITHOUT TOUCHING SHARED. `radarShadowK()` reads
// CONFIG.vision.radar (today's 1,500 u), and no walk takes K as an argument.
// But the model is exactly scale-invariant: every term is a distance d or the
// pair (d, K) as u/d + d/K and D·(aMin − D/K), so scaling every distance by
// 1/s and K by 1/s² changes nothing. Asking the REAL function about a copy of
// the raster shrunk by s = √(K′/K) (cell, x0, y0 ÷ s; heights untouched) with
// every coordinate ÷ s therefore answers the question "what if K were K′" on
// the real terrain — no shared edit, no CONFIG mutation, no forked walk. (The
// walk's tiny absolute EPS nudge is the only term that does not scale.)

import { radarShadowK, sampleHeight, visibilityTo, type GameMap, type HeightRaster, type HullId, type Vec2 } from '@salvo/shared';
import { fit, type View } from '../dispersionBench/canvas.js';
import { boardView, drawIslands, drawOwnShip, drawRim, drawRing, fillBackground } from './chart.js';

/** Grid cells across the board for the shadow image (responsiveness over detail). */
export const SHADOW_GRID = 150;

export const TODAY_K = radarShadowK();

export interface ShadowResult {
  /** Per grid cell: -1 = not counted (land / off-board / outside reach), else 0..1 shadow. */
  shade: Float32Array;
  /** Share of the in-reach sea that is in shadow (sum of 1 − visibility over sea cells). */
  share: number;
}

function scaledRaster(r: HeightRaster, s: number): HeightRaster {
  return s === 1 ? r : { ...r, cell: r.cell / s, x0: r.x0 / s, y0: r.y0 / s };
}

/** The shadow image and readout for one K, from the ship out to `reachU`. */
export function computeShadow(map: GameMap, ship: Vec2, reachU: number, k: number): ShadowResult {
  const n = SHADOW_GRID;
  const shade = new Float32Array(n * n).fill(-1);
  const s = Math.sqrt(k / TODAY_K);
  const raster = scaledRaster(map.heightRaster, s);
  const cellU = (map.radius * 2) / n;
  let sea = 0;
  let dark = 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = -map.radius + (i + 0.5) * cellU;
      const y = -map.radius + (j + 0.5) * cellU;
      if (!countable(map, ship, reachU, x, y)) continue;
      const d = 1 - visibilityTo(raster, ship.x / s, ship.y / s, x / s, y / s);
      shade[j * n + i] = d;
      sea += 1;
      dark += d;
    }
  }
  return { shade, share: sea > 0 ? dark / sea : 0 };
}

function countable(map: GameMap, ship: Vec2, reachU: number, x: number, y: number): boolean {
  if (Math.hypot(x, y) > map.radius) return false;
  if (Math.hypot(x - ship.x, y - ship.y) > reachU) return false;
  return sampleHeight(map.heightRaster, x, y) === 0;
}

/** Draw one panel: the chart, the shadow as a dark red-violet wash, the radar ring, the ship. */
export function drawShadow(canvas: HTMLCanvasElement, map: GameMap, ship: Vec2, heading: number, hull: HullId, reachU: number, res: ShadowResult): View {
  const { ctx, w, h } = fit(canvas, 1, 520);
  const v = boardView(ctx, w, h, map, 4);
  fillBackground(v);
  paintShade(v, map, res.shade);
  drawRim(v, map);
  drawIslands(v, map);
  drawRing(v, ship, reachU, 'rgba(192, 192, 192, 0.8)', '');
  drawOwnShip(v, hull, ship, heading);
  return v;
}

/** One RGBA pixel per grid cell: lit sea a faint phosphor tint, shadowed sea violet by depth. */
function shadeImage(shade: Float32Array): HTMLCanvasElement {
  const n = SHADOW_GRID;
  const img = new ImageData(n, n);
  for (let k = 0; k < n * n; k++) {
    const d = shade[k];
    if (d < 0) continue;
    const dark = d > 0.02;
    img.data.set(dark ? [150, 70, 220, Math.round(255 * (0.25 + 0.55 * d))] : [0, 255, 136, 18], k * 4);
  }
  const c = document.createElement('canvas');
  c.width = n;
  c.height = n;
  c.getContext('2d')?.putImageData(img, 0, 0);
  return c;
}

function paintShade(v: View, map: GameMap, shade: Float32Array): void {
  const side = map.radius * 2 * v.scale;
  v.ctx.imageSmoothingEnabled = true;
  v.ctx.drawImage(shadeImage(shade), v.cx - side / 2, v.cy - side / 2, side, side);
}
