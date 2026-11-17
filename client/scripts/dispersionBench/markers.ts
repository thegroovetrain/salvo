// The "Aim marker ideas" candidates: one FILLED oval per shell of the next
// turret's salvo, each sized by the REAL `dispersionAxes` at the slider range,
// its long side along the line of fire, centered on its own shell track (the
// REAL `parallelOffsets` at the main battery's barrel spacing) — or all on the
// aim point when the "converge" idea is on. No travel lines, no blast circles.

import { dispersionAxes } from '@salvo/shared';
import { sx, sy, type View } from './canvas.js';
import { SPACING_U, trackOffsets, type BenchState } from './model.js';
import { PULSE_CAP_HZ, RETICLE, rgb, swatch } from './palette.js';

export type Letter = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';

export interface AimState {
  /** Screen px per u. */
  zoom: number;
  /** "Smallest size on screen" (px along the long side); 0 = off. */
  minPx: number;
  converge: boolean;
  backdrop: import('./scene.js').BackdropId;
  /** The swatch that re-tints candidates D–H. */
  colorKey: string;
  pick: Letter;
  reticle: boolean;
}

/** One oval in screen px (axis-aligned: the line of fire is +x). */
export interface OvalPx {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

/** The oval's TRUE full size on screen (px), before any smallest-size idea. */
export function trueOvalPx(s: BenchState, zoom: number): { long: number; wide: number } {
  const { alongU, acrossU } = dispersionAxes(s.rangeU, s.cfg);
  return { long: 2 * alongU * zoom, wide: 2 * acrossU * zoom };
}

/** The oval's DRAWN semi-axes (px): the true size, grown to `minPx` long when that is bigger. */
export function drawnSemiAxes(s: BenchState, a: AimState): { rx: number; ry: number } {
  const t = trueOvalPx(s, a.zoom);
  if (a.minPx <= 0 || t.long >= a.minPx) return { rx: t.long / 2, ry: t.wide / 2 };
  // Keep the oval's proportions; a zero-size oval borrows the dial's width ratio.
  const ratio = t.long > 0 ? t.wide / t.long : s.cfg.acrossFrac;
  return { rx: a.minPx / 2, ry: (a.minPx * ratio) / 2 };
}

export function ovals(v: View, s: BenchState, a: AimState): OvalPx[] {
  const { rx, ry } = drawnSemiAxes(s, a);
  return trackOffsets(s.shells).map((o) => (a.converge ? { cx: v.cx, cy: v.cy, rx, ry } : { cx: sx(v, o.x), cy: sy(v, o.y), rx, ry }));
}

/** Do the landing areas of neighboring shells overlap (true size, side by side)? */
export function overlapFacts(s: BenchState): { overlap: boolean; widthU: number; spacingU: number } {
  const widthU = 2 * dispersionAxes(s.rangeU, s.cfg).acrossU;
  return { overlap: widthU > SPACING_U, widthU, spacingU: SPACING_U };
}

function path(ctx: CanvasRenderingContext2D, o: OvalPx): void {
  ctx.beginPath();
  ctx.ellipse(o.cx, o.cy, Math.max(o.rx, 0), Math.max(o.ry, 0), 0, 0, Math.PI * 2);
}

function fillAll(ctx: CanvasRenderingContext2D, os: OvalPx[], color: string, alpha: number): void {
  ctx.fillStyle = `rgba(${rgb(color)}, ${alpha})`;
  for (const o of os) {
    path(ctx, o);
    ctx.fill();
  }
}

/** E: brightest at the center, fading to the edge on the real bell (the "how tightly bunched" dial). */
function fillBell(ctx: CanvasRenderingContext2D, os: OvalPx[], color: string, sigmas: number): void {
  const c = rgb(color);
  for (const o of os) {
    if (o.rx <= 0 || o.ry <= 0) continue;
    ctx.save();
    ctx.translate(o.cx, o.cy);
    ctx.scale(o.rx, o.ry);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    for (let k = 0; k <= 10; k++) {
      const r = k / 10;
      g.addColorStop(r, `rgba(${c}, ${0.95 * Math.exp(-((r * sigmas) ** 2) / 2)})`);
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/** G: a 1 px dark rim just outside each oval (2 px stroke, inner half covered by the fill), all rims first. */
function underStroke(ctx: CanvasRenderingContext2D, os: OvalPx[]): void {
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
  for (const o of os) {
    path(ctx, o);
    ctx.stroke();
  }
}

/** H: the pulse's fill alpha at time t (ms) — a slow 0.5 Hz breath, well under the game's 1.1 Hz cap; held still for reduced motion. */
export const PULSE_HZ = 0.5;
export function pulseAlpha(tMs: number, still: boolean): number {
  if (still || PULSE_HZ > PULSE_CAP_HZ) return 0.9;
  return 0.6 + 0.35 * (0.5 + 0.5 * Math.sin((2 * Math.PI * PULSE_HZ * tMs) / 1000));
}

export interface Candidate {
  letter: Letter;
  name: string;
  /** A fixed swatch key, or null = tinted by the color picker. */
  fixed: string | null;
  how: string;
  draw: (ctx: CanvasRenderingContext2D, os: OvalPx[], color: string, s: BenchState, tMs: number, still: boolean) => void;
}

export const CANDIDATES: Candidate[] = [
  { letter: 'A', name: 'Bright amber', fixed: 'amber', how: 'Solid fill, palette amber at 85 % strength. Same color as today, just bright.', draw: (c, os, col) => fillAll(c, os, col, 0.85) },
  { letter: 'B', name: 'White-hot', fixed: 'white', how: 'Solid white fill at 90 % strength.', draw: (c, os, col) => fillAll(c, os, col, 0.9) },
  { letter: 'C', name: 'Sky blue', fixed: 'info', how: 'Solid fill in the palette sky blue at 85 % strength.', draw: (c, os, col) => fillAll(c, os, col, 0.85) },
  {
    letter: 'D',
    name: 'Overlaps glow brighter',
    fixed: null,
    how: 'Each oval half see-through; where two overlap the light adds up (the canvas "lighter" blend), so water two shells can reach glows more.',
    draw: (c, os, col) => {
      c.save();
      c.globalCompositeOperation = 'lighter';
      fillAll(c, os, col, 0.5);
      c.restore();
    },
  },
  { letter: 'E', name: 'Bright middle', fixed: null, how: 'Brightest at the center, fading to nothing at the edge, following the "how tightly bunched" dial: shells really do bunch toward the middle.', draw: (c, os, col, s) => fillBell(c, os, col, s.cfg.sigmas) },
  {
    letter: 'F',
    name: 'Soft glow',
    fixed: null,
    how: 'Solid fill plus a soft glow of the same color around it (a 10 px blur halo), to lift it off the water.',
    draw: (c, os, col) => {
      c.save();
      c.shadowColor = col;
      c.shadowBlur = 10;
      fillAll(c, os, col, 0.85);
      c.restore();
    },
  },
  {
    letter: 'G',
    name: 'Dark rim',
    fixed: null,
    how: 'Solid fill with a thin black rim (1 px) just outside it. Not an outline in the marker color: a shadow line, the classic legibility trick.',
    draw: (c, os, col) => {
      underStroke(c, os);
      fillAll(c, os, col, 0.9);
    },
  },
  { letter: 'H', name: 'Slow pulse', fixed: null, how: `Solid fill whose strength breathes slowly (${PULSE_HZ} times a second). Holds still if your system asks for reduced motion.`, draw: (c, os, col, _s, t, still) => fillAll(c, os, col, pulseAlpha(t, still)) },
];

export function candidate(letter: Letter): Candidate {
  return CANDIDATES.find((c) => c.letter === letter) ?? CANDIDATES[0];
}

/** The color a candidate draws in: its fixed swatch, or the picked one. */
export function candidateColor(c: Candidate, a: AimState): { name: string; hex: string; meaning: string } {
  return swatch(c.fixed ?? a.colorKey);
}

/** Today's reticle at the aim point: ring + cross, world-unit strokes (render/firing.ts:612–615). */
export function drawReticle(v: View): void {
  const { ctx, cx, cy } = v;
  const r = RETICLE.r * v.scale;
  ctx.strokeStyle = RETICLE.color;
  ctx.globalAlpha = RETICLE.ring.alpha;
  ctx.lineWidth = RETICLE.ring.widthU * v.scale;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  const arm = r + 3 * v.scale;
  ctx.globalAlpha = RETICLE.cross.alpha;
  ctx.lineWidth = RETICLE.cross.widthU * v.scale;
  ctx.beginPath();
  ctx.moveTo(cx - arm, cy);
  ctx.lineTo(cx + arm, cy);
  ctx.moveTo(cx, cy - arm);
  ctx.lineTo(cx, cy + arm);
  ctx.stroke();
  ctx.globalAlpha = 1;
}
