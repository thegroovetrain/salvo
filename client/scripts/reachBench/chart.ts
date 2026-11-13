// The game's chart, drawn with canvas 2D from a REAL generated map: the ocean
// disc, its rim, the islands in the game's hypsometric bands (render/map.ts
// terrainDrawPlan order: body first, then contour levels 1..3), the zone rings
// and the spawn ring. Colors are the dispersion bench's literal copies of the
// game's tokens (../dispersionBench/palette.ts cites each file:line).

import { CONFIG, hullSilhouette, transformPolygon, type GameMap, type HullId, type Vec2 } from '@salvo/shared';
import { circlePath, polyPath, sx, sy, type View } from '../dispersionBench/canvas.js';
import { OCEAN, TERRAIN } from '../dispersionBench/palette.js';

/** config.ts:39 `COLORS.silver` — the map rim (render/map.ts:112: 2.5 u at alpha 0.35). */
export const SILVER = '192, 192, 192';
/** config.ts:44 `COLORS.phosphor`. */
export const PHOSPHOR = '0, 255, 136';
/** config.ts:48 `COLORS.amber`. */
export const AMBER = '255, 184, 0';
/** relationColor.ts:37 — your own ship's outline cyan. */
export const OWN_CYAN = '#00e8ff';

/** A view that fits the whole board disc into a w × h box, centered. */
export function boardView(ctx: CanvasRenderingContext2D, w: number, h: number, map: GameMap, margin = 8): View {
  const scale = (Math.min(w, h) / 2 - margin) / map.radius;
  return { ctx, w, h, scale, cx: w / 2, cy: h / 2 };
}

export function fillBackground(v: View): void {
  v.ctx.fillStyle = OCEAN;
  v.ctx.fillRect(0, 0, v.w, v.h);
}

function islandBands(isle: GameMap['islands'][number]): Array<{ level: number; polys: Vec2[][] }> {
  const bands = [{ level: 0, polys: [isle.poly] }];
  for (const c of [...isle.contours].sort((a, b) => a.level - b.level)) bands.push({ level: c.level, polys: c.polys });
  return bands;
}

export function drawIslands(v: View, map: GameMap): void {
  const { ctx } = v;
  for (const isle of map.islands) {
    for (const band of islandBands(isle)) {
      const t = TERRAIN[Math.min(band.level, TERRAIN.length - 1)];
      ctx.fillStyle = t.fill;
      ctx.strokeStyle = t.stroke;
      ctx.lineWidth = band.level === 0 ? 1.5 : 1;
      for (const poly of band.polys) {
        polyPath(v, poly);
        ctx.fill();
        ctx.stroke();
      }
    }
  }
}

export function drawRim(v: View, map: GameMap): void {
  v.ctx.strokeStyle = `rgba(${SILVER}, 0.35)`;
  v.ctx.lineWidth = 1.5;
  circlePath(v, { x: 0, y: 0 }, map.radius);
  v.ctx.stroke();
}

/** The three zone rings and the spawn ring with its points, faint, for scale. */
export function drawScaleRings(v: View, map: GameMap, spawns: readonly Vec2[]): void {
  const { ctx } = v;
  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = 'rgba(176, 110, 232, 0.45)';
  ctx.lineWidth = 1;
  for (const r of CONFIG.zone.ringRadii) {
    circlePath(v, { x: 0, y: 0 }, r);
    ctx.stroke();
  }
  ctx.setLineDash([2, 5]);
  ctx.strokeStyle = `rgba(${SILVER}, 0.3)`;
  circlePath(v, { x: 0, y: 0 }, map.spawnRing);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = `rgba(${SILVER}, 0.75)`;
  for (const p of spawns) {
    ctx.beginPath();
    ctx.arc(sx(v, p.x), sy(v, p.y), 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** The own hull at TRUE size (the real silhouette) plus a fixed-size marker so it can be found. */
export function drawOwnShip(v: View, hull: HullId, at: Vec2, heading: number): void {
  const { ctx } = v;
  const x = sx(v, at.x);
  const y = sy(v, at.y);
  ctx.strokeStyle = OWN_CYAN;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, 7, 0, Math.PI * 2);
  ctx.moveTo(x + Math.cos(heading) * 7, y + Math.sin(heading) * 7);
  ctx.lineTo(x + Math.cos(heading) * 14, y + Math.sin(heading) * 14);
  ctx.stroke();
  polyPath(v, transformPolygon(hullSilhouette(hull), at.x, at.y, heading));
  ctx.fillStyle = 'rgba(0, 232, 255, 0.35)';
  ctx.fill();
  ctx.stroke();
}

/** A ring around a world point with a small label at its top. */
export function drawRing(v: View, at: Vec2, rU: number, color: string, label: string, dashed = false): void {
  const { ctx } = v;
  ctx.save();
  if (dashed) ctx.setLineDash([6, 4]);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  circlePath(v, at, rU);
  ctx.stroke();
  ctx.restore();
  if (!label) return;
  // Label where the ring crosses the line from the ring's center toward the
  // board center (straight up when it sits on the center), so it stays on the board.
  const d = Math.hypot(at.x, at.y);
  const ux = d > 1 ? -at.x / d : 0;
  const uy = d > 1 ? -at.y / d : -1;
  const x = sx(v, at.x + ux * rU);
  const y = sy(v, at.y + uy * rU);
  if (x < 0 || y < 0 || x > v.w || y > v.h) return;
  ctx.font = '600 13px ui-monospace, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(label).width + 6;
  ctx.fillStyle = 'rgba(5, 8, 7, 0.85)';
  ctx.fillRect(x - w / 2, y - 9, w, 18);
  ctx.fillStyle = color;
  ctx.fillText(label, x, y);
}
