// Drawing for the arc bench: the chart (the real map, the observer, every
// paint, own-ship range rings every 100 hm) and the close-up panels. Paints
// are drawn in the scope's red register (palette.ts RADAR.red at
// RADAR_ALPHA); the true target outline is thin white for comparison.

import { formatHm, hmToU, type GameMap, type Vec2 } from '@salvo/shared';
import { circlePath, fit, polyPath, sx, sy, type View } from '../dispersionBench/canvas.js';
import { OCEAN, RADAR, RADAR_ALPHA } from '../dispersionBench/palette.js';
import { OWN_CYAN, boardView, drawIslands, drawRim, drawRing, fillBackground } from '../reachBench/chart.js';
import { CELL_U, coarseCells, type Paint } from './model.js';

const PAINT = `rgba(${RADAR.red}, ${RADAR_ALPHA})`;
const OUTLINE = 'rgba(255, 255, 255, 0.9)';
const LABEL_FONT = '600 13px ui-monospace, Menlo, monospace';

/** Draw one paint's cells, k × 9 u each, at least one screen pixel wide. */
export function drawMask(v: View, p: Paint, k: number): void {
  const size = k * CELL_U;
  const px = Math.max(size * v.scale, 1);
  v.ctx.fillStyle = PAINT;
  for (const [x, y] of coarseCells(p.mask, k)) v.ctx.fillRect(sx(v, x), sy(v, y), px, px);
}

/** The true target, thin white. */
export function drawShape(v: View, p: Paint): void {
  const { ctx } = v;
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1;
  if (p.shape.kind === 'poly') polyPath(v, p.shape.poly);
  else if (p.shape.kind === 'disc') circlePath(v, p.at, p.shape.r);
  else {
    ctx.beginPath();
    ctx.moveTo(sx(v, p.shape.a.x), sy(v, p.shape.a.y));
    ctx.lineTo(sx(v, p.shape.b.x), sy(v, p.shape.b.y));
    ctx.lineWidth = Math.max(1, p.shape.widthU * v.scale);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
  }
  ctx.stroke();
}

function drawObserver(v: View, o: Vec2): void {
  const { ctx } = v;
  ctx.strokeStyle = OWN_CYAN;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(sx(v, o.x), sy(v, o.y), 7, 0, Math.PI * 2);
  ctx.stroke();
}

/** The chart: the whole board with every paint. Returns the view. */
export function drawChart(canvas: HTMLCanvasElement, map: GameMap, o: Vec2, paints: Paint[], factor: (p: Paint) => number): View {
  const { ctx, w, h } = fit(canvas, 1, 820);
  const v = boardView(ctx, w, h, map);
  fillBackground(v);
  drawRim(v, map);
  drawIslands(v, map);
  for (let hm = 100; hm <= 400; hm += 100) drawRing(v, o, hmToU(hm), 'rgba(192, 192, 192, 0.55)', `${hm} hm`);
  for (const p of paints) drawMask(v, p, factor(p));
  for (const p of paints) drawShape(v, p);
  drawObserver(v, o);
  return v;
}

/** A view that fits a world box (with a margin) into the canvas. */
function boxView(ctx: CanvasRenderingContext2D, w: number, h: number, box: [number, number, number, number]): View {
  const spanX = Math.max(box[2] - box[0], CELL_U * 4);
  const spanY = Math.max(box[3] - box[1], CELL_U * 4);
  const scale = Math.min((w - 24) / spanX, (h - 40) / spanY);
  const mx = (box[0] + box[2]) / 2;
  const my = (box[1] + box[3]) / 2;
  return { ctx, w, h, scale, cx: w / 2 - mx * scale, cy: h / 2 + 8 - my * scale };
}

/** The world box holding the paint (and its sharp rect). */
function paintBox(p: Paint, k: number): [number, number, number, number] {
  const m = p.mask;
  const g = k * CELL_U;
  const x0 = Math.floor((m.gx * CELL_U) / g) * g;
  const y0 = Math.floor((m.gy * CELL_U) / g) * g;
  return [x0, y0, Math.ceil(((m.gx + m.w) * CELL_U) / g) * g, Math.ceil(((m.gy + m.h) * CELL_U) / g) * g];
}

/** Faint drawn-cell lattice lines over the box, when cells are big enough to see. */
function drawLattice(v: View, box: [number, number, number, number], k: number): void {
  const g = k * CELL_U;
  if (g * v.scale < 5) return;
  const { ctx } = v;
  ctx.strokeStyle = 'rgba(192, 192, 192, 0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = box[0]; x <= box[2] + 1e-6; x += g) {
    ctx.moveTo(sx(v, x), sy(v, box[1]));
    ctx.lineTo(sx(v, x), sy(v, box[3]));
  }
  for (let y = box[1]; y <= box[3] + 1e-6; y += g) {
    ctx.moveTo(sx(v, box[0]), sy(v, y));
    ctx.lineTo(sx(v, box[2]), sy(v, y));
  }
  ctx.stroke();
}

/** An arrow at the top-left saying which way your own ship is. */
function drawTowardYou(v: View, p: Paint, o: Vec2): void {
  const { ctx } = v;
  const t = Math.atan2(o.y - p.at.y, o.x - p.at.x);
  const x = 22;
  const y = 18;
  ctx.strokeStyle = OWN_CYAN;
  ctx.fillStyle = OWN_CYAN;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x - Math.cos(t) * 10, y - Math.sin(t) * 10);
  ctx.lineTo(x + Math.cos(t) * 10, y + Math.sin(t) * 10);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + Math.cos(t) * 10, y + Math.sin(t) * 10, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = LABEL_FONT;
  ctx.textBaseline = 'middle';
  ctx.fillText('toward you', x + 18, y);
}

/** One close-up: the paint large, its cells visible, the true target in white. */
export function drawCloseUp(canvas: HTMLCanvasElement, p: Paint, o: Vec2, k: number, aspect = 0.75): void {
  const { ctx, w, h } = fit(canvas, aspect, 420);
  ctx.fillStyle = OCEAN;
  ctx.fillRect(0, 0, w, h);
  const box = paintBox(p, k);
  const v = boxView(ctx, w, h, box);
  drawLattice(v, box, k);
  drawMask(v, p, k);
  drawShape(v, p);
  drawTowardYou(v, p, o);
}

/** "400 hm" style label for a u distance. */
export function hm(u: number): string {
  return `${formatHm(u)} hm`;
}
