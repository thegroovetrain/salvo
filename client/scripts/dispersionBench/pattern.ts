// Canvas 1 — "the pattern, to scale": top-down around the aim point, the
// line of fire coming in from the left. Hull, ellipse(s), landings and their
// blast circles, all in true u.

import { CONFIG, dispersionAxes, type Vec2 } from '@salvo/shared';
import { circlePath, ellipsePath, fit, niceLength, polyPath, sx, sy, token, type View } from './canvas.js';
import {
  ACCUMULATE_SALVOS,
  BLAST_U,
  SPACING_U,
  blastReaches,
  hullPoly,
  salvo,
  trackOffsets,
  type BenchState,
} from './model.js';

/** World half-extent the view must hold: the pattern, the hull, the blasts. */
function halfExtent(s: BenchState): number {
  const { alongU, acrossU } = dispersionAxes(s.rangeU, s.cfg);
  const offMax = (SPACING_U * (s.shells - 1)) / 2;
  const hullHalf = CONFIG.shipClasses[s.hull].hull.length / 2;
  return Math.max(alongU, acrossU + offMax, hullHalf) + BLAST_U;
}

export function patternView(canvas: HTMLCanvasElement, s: BenchState): View {
  const { ctx, w, h } = fit(canvas, 0.62, 560);
  const r = halfExtent(s) * 1.12;
  return { ctx, w, h, scale: Math.min(w, h) / (2 * r), cx: w / 2, cy: h / 2 };
}

function drawHull(v: View, poly: readonly Vec2[]): void {
  polyPath(v, poly);
  v.ctx.fillStyle = token('--hull-fill');
  v.ctx.fill();
  v.ctx.lineWidth = 1.5;
  v.ctx.strokeStyle = token('--hull-edge');
  v.ctx.stroke();
}

function drawTracks(v: View, s: BenchState): void {
  const { alongU, acrossU } = dispersionAxes(s.rangeU, s.cfg);
  const { ctx } = v;
  for (const o of trackOffsets(s.shells)) {
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = token('--fire-line');
    ctx.beginPath();
    ctx.moveTo(0, sy(v, o.y));
    ctx.lineTo(sx(v, o.x), sy(v, o.y));
    ctx.stroke();
    ctx.setLineDash([3, 4]);
    ellipsePath(v, o, alongU / 2, acrossU / 2);
    ctx.strokeStyle = token('--oval-inner');
    ctx.stroke();
    ctx.setLineDash([]);
    ellipsePath(v, o, alongU, acrossU);
    ctx.lineWidth = 2;
    ctx.strokeStyle = token('--oval');
    ctx.stroke();
  }
}

function drawDots(v: View, s: BenchState, poly: readonly Vec2[]): void {
  const { ctx } = v;
  const hit = token('--hit');
  const miss = token('--miss');
  for (let k = 0; k < ACCUMULATE_SALVOS; k++) {
    for (const sh of salvo(s, s.counter + k)) {
      ctx.fillStyle = blastReaches(sh.land, poly) ? hit : miss;
      ctx.fillRect(sx(v, sh.land.x) - 1.5, sy(v, sh.land.y) - 1.5, 3, 3);
    }
  }
}

function drawSalvo(v: View, s: BenchState, poly: readonly Vec2[]): void {
  const { ctx } = v;
  for (const sh of salvo(s, s.counter)) {
    const color = blastReaches(sh.land, poly) ? token('--hit') : token('--miss');
    circlePath(v, sh.land, BLAST_U);
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(sx(v, sh.land.x), sy(v, sh.land.y), 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawAimMark(v: View): void {
  const { ctx } = v;
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = token('--text');
  ctx.beginPath();
  ctx.moveTo(v.cx - 8, v.cy);
  ctx.lineTo(v.cx + 8, v.cy);
  ctx.moveTo(v.cx, v.cy - 8);
  ctx.lineTo(v.cx, v.cy + 8);
  ctx.stroke();
}

function drawScaleBar(v: View): void {
  const { ctx } = v;
  const len = niceLength(v.w / 5 / v.scale);
  const px = len * v.scale;
  const x0 = 16;
  const y0 = v.h - 18;
  ctx.lineWidth = 2;
  ctx.strokeStyle = token('--text');
  ctx.beginPath();
  ctx.moveTo(x0, y0 - 5);
  ctx.lineTo(x0, y0);
  ctx.lineTo(x0 + px, y0);
  ctx.lineTo(x0 + px, y0 - 5);
  ctx.stroke();
  ctx.fillStyle = token('--text');
  ctx.font = '600 14px ui-monospace, Menlo, Consolas, monospace';
  ctx.fillText(`${len} u`, x0 + px + 8, y0 + 4);
}

/** Draw the whole pattern canvas; returns its view (for pointer mapping). */
export function drawPattern(canvas: HTMLCanvasElement, s: BenchState): View {
  const v = patternView(canvas, s);
  v.ctx.fillStyle = token('--canvas-bg');
  v.ctx.fillRect(0, 0, v.w, v.h);
  const poly = hullPoly(s);
  drawHull(v, poly);
  drawTracks(v, s);
  if (s.accumulate) drawDots(v, s, poly);
  drawSalvo(v, s, poly);
  drawAimMark(v);
  drawScaleBar(v);
  return v;
}
