// Canvas 2 — "the aim preview candidates" (Story 11.1 ruling R7: the in-game
// aim preview draws the dispersion ellipse outline at the aim point). A mock of
// the game's own aim preview over the game's water, in the SAME colors, stroke
// widths and alphas, copied literally from the shipped client (cited per value
// below). Three panels: today's preview, candidate A (thin outline), candidate
// B (thin outline + faint fill). Strokes are world units, so like the game they
// scale with the zoom.

import { dispersionAxes } from '@salvo/shared';
import { fit, sx, sy, type View } from './canvas.js';
import { BLAST_U, trackOffsets, type BenchState } from './model.js';

// --- Literal look values (copied, not imported: this page must not pull Pixi) ---
/** client/src/config.ts:32 `COLORS.void` — the ocean (map.ts:35 OCEAN_FILL = C.void). */
const WATER = '#050807';
/** client/src/config.ts:48 `COLORS.amber` — the main battery's reticle tint (firing.ts:58 AMBER, firing.ts:129 weaponTint). */
const TINT = '#ffb800';
/** client/src/config.ts:823–829 `aimPreview` — travel line and blast circle. */
const LINE_WIDTH = 1; // config.ts:823 lineWidth
const LINE_ALPHA = 0.26; // config.ts:824 lineAlpha
const BURST_WIDTH = 1.2; // config.ts:827 burstWidth
const BURST_ALPHA = 0.4; // config.ts:828 burstAlpha
const BURST_FILL_ALPHA = 0.05; // config.ts:829 burstFillAlpha
/** client/src/render/firing.ts:68 RETICLE_R and the drawReticle strokes (firing.ts:611–615). */
const RETICLE_R = 7; // u
const RETICLE_LINE = { width: 1, alpha: 0.25 }; // firing.ts:611 ship → cursor line
const RETICLE_RING = { width: 1.5, alpha: 0.8 }; // firing.ts:612 ring
const RETICLE_CROSS = { width: 1, alpha: 0.6 }; // firing.ts:613–615 cross, ±(R + 3)

export type Variant = 'today' | 'A' | 'B';

function stroke(v: View, width: number, alpha: number): void {
  v.ctx.globalAlpha = alpha;
  v.ctx.lineWidth = width * v.scale;
  v.ctx.strokeStyle = TINT;
  v.ctx.stroke();
  v.ctx.globalAlpha = 1;
}

function fillTint(v: View, alpha: number): void {
  v.ctx.globalAlpha = alpha;
  v.ctx.fillStyle = TINT;
  v.ctx.fill();
  v.ctx.globalAlpha = 1;
}

/** Today's preview: one travel line + one blast circle per shell (aimPreview.ts:350–372, 774–785). */
function drawToday(v: View, s: BenchState): void {
  const { ctx } = v;
  for (const o of trackOffsets(s.shells)) {
    ctx.beginPath();
    ctx.moveTo(sx(v, -s.rangeU + o.x), sy(v, o.y));
    ctx.lineTo(sx(v, o.x), sy(v, o.y));
    stroke(v, LINE_WIDTH, LINE_ALPHA);
    ctx.beginPath();
    ctx.arc(sx(v, o.x), sy(v, o.y), BLAST_U * v.scale, 0, Math.PI * 2);
    fillTint(v, BURST_FILL_ALPHA);
    stroke(v, BURST_WIDTH, BURST_ALPHA);
  }
}

/** The candidate oval at the aim point, in the blast circle's own register. */
function drawOval(v: View, s: BenchState, filled: boolean): void {
  const { alongU, acrossU } = dispersionAxes(s.rangeU, s.cfg);
  v.ctx.beginPath();
  v.ctx.ellipse(v.cx, v.cy, Math.max(alongU * v.scale, 0.5), Math.max(acrossU * v.scale, 0.5), 0, 0, Math.PI * 2);
  if (filled) fillTint(v, BURST_FILL_ALPHA);
  stroke(v, BURST_WIDTH, BURST_ALPHA);
}

/** The reticle at the cursor (= the aim point), firing.ts:599–615. */
function drawReticle(v: View, s: BenchState): void {
  const { ctx, cx, cy } = v;
  const r = RETICLE_R * v.scale;
  ctx.beginPath();
  ctx.moveTo(sx(v, -s.rangeU), cy);
  ctx.lineTo(cx, cy);
  stroke(v, RETICLE_LINE.width, RETICLE_LINE.alpha);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  stroke(v, RETICLE_RING.width, RETICLE_RING.alpha);
  const arm = r + 3 * v.scale;
  ctx.beginPath();
  ctx.moveTo(cx - arm, cy);
  ctx.lineTo(cx + arm, cy);
  ctx.moveTo(cx, cy - arm);
  ctx.lineTo(cx, cy + arm);
  stroke(v, RETICLE_CROSS.width, RETICLE_CROSS.alpha);
}

export function drawPreview(canvas: HTMLCanvasElement, s: BenchState, variant: Variant): void {
  const { ctx, w, h } = fit(canvas, 0.75, 360);
  const v: View = { ctx, w, h, scale: s.zoom, cx: w / 2, cy: h / 2 };
  ctx.fillStyle = WATER;
  ctx.fillRect(0, 0, w, h);
  if (variant === 'today' || s.keepCircles) drawToday(v, s);
  if (variant !== 'today') drawOval(v, s, variant === 'B');
  drawReticle(v, s);
}
