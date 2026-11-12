// Section 3, "The display": a marine-radar scope drawn on the game's chart —
// own ship at the center, real islands, a handful of made-up echoes — with
// range-ring and sweep candidates. The sweep turns at the real rate
// (CONFIG.vision.sweepRpm). Look values are the game's (cited per value).

import { CONFIG, hmToU, uToHm, type GameMap, type HullId, type Vec2 } from '@salvo/shared';
import { fit, type View } from '../dispersionBench/canvas.js';
import { RANGE_RING, SIGHT_RING } from '../dispersionBench/palette.js';
import { drawIslands, drawOwnShip, drawRim, fillBackground, PHOSPHOR, SILVER } from './chart.js';
import { ringSpacingHm } from './model.js';

export type RingStyle = 'A' | 'B' | 'C' | 'D';
export type LabelPos = 'bow' | 'east' | 'cardinal';
export type SweepStyle = 1 | 2 | 3 | 4;

export interface ScopeState {
  spanU: number;
  ringStyle: RingStyle;
  labelPos: LabelPos;
  bearing: boolean;
  headingLine: boolean;
  sweep: SweepStyle;
}

export interface ScopeInput {
  map: GameMap;
  ship: Vec2;
  heading: number;
  hull: HullId;
  radarU: number;
  sightU: number;
}

/** The game's real zoom limits, world span across the short axis (u): client/src/config.ts:1508 `zoom.closeSpanU` and the brief's whole-board zoom-out (copied literally). */
export const SPAN_MIN_U = 880;
export const SPAN_MAX_U = 10500;
const PERIOD_MS = 60000 / CONFIG.vision.sweepRpm;
const TAU = Math.PI * 2;

/** Made-up echoes for the look only: compass bearing (°) and distance (hm) from the ship. */
const BLIPS: Array<{ brg: number; hm: number }> = [
  { brg: 35, hm: 60 }, { brg: 120, hm: 140 }, { brg: 200, hm: 25 }, { brg: 250, hm: 300 },
  { brg: 300, hm: 90 }, { brg: 330, hm: 210 }, { brg: 80, hm: 12 }, { brg: 160, hm: 380 },
];

let view: View | null = null;

export function layoutScope(canvas: HTMLCanvasElement, input: ScopeInput, s: ScopeState): View {
  const { ctx, w, h } = fit(canvas, 0.62, 640);
  const scale = Math.min(w, h) / s.spanU;
  view = { ctx, w, h, scale, cx: w / 2 - input.ship.x * scale, cy: h / 2 - input.ship.y * scale };
  return view;
}

/** Ring spacing (hm) and the scope's RANGE (hm, center to the short edge) for a view. */
export function scopeScale(v: View): { rangeHm: number; ringsHm: number } {
  const halfShortHm = uToHm(Math.min(v.w, v.h) / 2 / v.scale);
  const halfLongHm = uToHm(Math.max(v.w, v.h) / 2 / v.scale);
  return { rangeHm: halfShortHm, ringsHm: ringSpacingHm(halfLongHm) };
}

export function drawScopeFrame(input: ScopeInput, s: ScopeState, tMs: number): void {
  const v = view;
  if (!v) return;
  const { ctx } = v;
  ctx.save();
  fillBackground(v);
  drawRim(v, input.map);
  drawIslands(v, input.map);
  const c = { x: v.w / 2, y: v.h / 2 };
  const sweepA = ((tMs % PERIOD_MS) / PERIOD_MS) * TAU; // compass radians, clockwise from north
  drawBlips(v, c, input.radarU, sweepA);
  drawSweep(v, c, input.radarU * v.scale, sweepA, s.sweep);
  if (s.ringStyle === 'D') drawTodayRings(v, c, input);
  else drawRangeRings(v, c, input, s);
  if (s.headingLine) drawHeadingLine(v, c, input.heading);
  if (s.bearing) drawBearingScale(v, c);
  drawOwnShip(v, input.hull, input.ship, input.heading);
  drawCorner(v, input.radarU);
  ctx.restore();
}

/** Compass bearing (rad, clockwise from north) → canvas angle (rad, from +x, y down). */
const canvasAngle = (brg: number): number => brg - Math.PI / 2;

function drawBlips(v: View, c: Vec2, radarU: number, sweepA: number): void {
  const { ctx } = v;
  for (const b of BLIPS) {
    const dU = hmToU(b.hm);
    if (dU > radarU) continue;
    const brg = (b.brg * Math.PI) / 180;
    const since = (((sweepA - brg) % TAU) + TAU) % TAU; // how long ago the beam passed (as an angle)
    const a = Math.exp(-3 * (since / TAU)); // bright on the pass, near-gone a revolution later
    const ang = canvasAngle(brg);
    const x = c.x + Math.cos(ang) * dU * v.scale;
    const y = c.y + Math.sin(ang) * dU * v.scale;
    const r = Math.max(2.5, 9 * v.scale);
    ctx.fillStyle = `rgba(102, 255, 170, ${(0.12 + 0.88 * a).toFixed(3)})`; // config.ts blipFresh #66ffaa
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.6, r, ang + Math.PI / 2, 0, TAU);
    ctx.fill();
  }
}

function drawSweep(v: View, c: Vec2, rPx: number, sweepA: number, style: SweepStyle): void {
  if (style === 4) return;
  const { ctx } = v;
  const lead = canvasAngle(sweepA);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  if (style === 1) wedge(ctx, c, rPx, lead, (40 * Math.PI) / 180, 0.26);
  if (style === 3) wedge(ctx, c, rPx, lead, (5 * Math.PI) / 180, 0.45);
  // textures.ts paintLeadingEdge: three layered strokes, wide/dim to thin/bright (today);
  // one crisp line for the thin candidates.
  const layers: Array<[number, number]> = style === 1 ? [[7, 0.1], [3.5, 0.25], [1.5, 0.9]] : [[1.5, 0.95]];
  ctx.lineCap = 'round';
  for (const [width, alpha] of layers) {
    ctx.strokeStyle = `rgba(${PHOSPHOR}, ${alpha})`;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(c.x + Math.cos(lead) * rPx, c.y + Math.sin(lead) * rPx);
    ctx.stroke();
  }
  ctx.restore();
}

/** textures.ts paintWedgeTail: a conic fade from nothing to `peak` up to the leading edge. */
function wedge(ctx: CanvasRenderingContext2D, c: Vec2, rPx: number, lead: number, tail: number, peak: number): void {
  const grad = ctx.createConicGradient(lead - tail, c.x, c.y);
  const edge = tail / TAU;
  grad.addColorStop(0, `rgba(${PHOSPHOR}, 0)`);
  grad.addColorStop(edge, `rgba(${PHOSPHOR}, ${peak})`);
  grad.addColorStop(Math.min(1, edge + 0.002), `rgba(${PHOSPHOR}, 0)`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(c.x, c.y);
  ctx.arc(c.x, c.y, rPx, lead - tail, lead);
  ctx.closePath();
  ctx.fill();
}

interface RingLook {
  stroke: string;
  dash: number[];
  everyOther: boolean;
}

const LOOKS: Record<Exclude<RingStyle, 'D'>, RingLook> = {
  A: { stroke: 'rgba(255, 255, 255, 0.7)', dash: [], everyOther: false },
  B: { stroke: 'rgba(255, 255, 255, 0.7)', dash: [], everyOther: true },
  C: { stroke: 'rgba(255, 255, 255, 0.6)', dash: [5, 5], everyOther: false },
};

function drawRangeRings(v: View, c: Vec2, input: ScopeInput, s: ScopeState): void {
  const { ctx } = v;
  const look = LOOKS[s.ringStyle as Exclude<RingStyle, 'D'>];
  const stepU = hmToU(scopeScale(v).ringsHm);
  const farPx = Math.hypot(v.w, v.h) / 2;
  ctx.save();
  ctx.lineWidth = 1;
  ctx.setLineDash(look.dash);
  ctx.strokeStyle = look.stroke;
  for (let k = 1; k * stepU < input.radarU && k * stepU * v.scale < farPx; k++) {
    ring(ctx, c, k * stepU * v.scale);
    if (!look.everyOther || k % 2 === 0) labelRing(v, c, k * stepU, input.heading, s.labelPos, 'rgba(255, 255, 255, 0.9)');
  }
  // The radar's own reach: drawn distinct (solid, brighter, phosphor-tinted).
  ctx.setLineDash([]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = `rgba(${PHOSPHOR}, 0.8)`;
  ring(ctx, c, input.radarU * v.scale);
  labelRing(v, c, input.radarU, input.heading, s.labelPos, `rgba(${PHOSPHOR}, 1)`);
  ctx.restore();
}

/** Today's look: the four faint chart rings about the board center, the faint sight and radar rings about the ship. */
function drawTodayRings(v: View, c: Vec2, input: ScopeInput): void {
  const { ctx } = v;
  const toPx = (u: number): number => Math.max(u * v.scale, 0.5);
  ctx.strokeStyle = `rgba(${RANGE_RING.color}, ${RANGE_RING.alpha})`; // render/map.ts:110
  ctx.lineWidth = toPx(RANGE_RING.widthU);
  for (let i = 1; i < 4; i++) ring(ctx, { x: v.cx, y: v.cy }, ((input.map.radius * i) / 4) * v.scale);
  ctx.strokeStyle = `rgba(${SIGHT_RING.color}, ${SIGHT_RING.alpha})`; // render/radar.ts:533
  ctx.lineWidth = toPx(SIGHT_RING.widthU);
  ring(ctx, c, input.sightU * v.scale);
  ctx.strokeStyle = `rgba(${SILVER}, 0.07)`; // render/radar.ts:534 (2 u at 0.07)
  ctx.lineWidth = toPx(2);
  ring(ctx, c, input.radarU * v.scale);
}

function ring(ctx: CanvasRenderingContext2D, c: Vec2, rPx: number): void {
  ctx.beginPath();
  ctx.arc(c.x, c.y, rPx, 0, TAU);
  ctx.stroke();
}

const CARDINALS = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];

function labelRing(v: View, c: Vec2, rU: number, heading: number, pos: LabelPos, color: string): void {
  const angles = pos === 'cardinal' ? CARDINALS.map(canvasAngle) : [pos === 'bow' ? heading : 0];
  const { ctx } = v;
  const text = String(Math.round(uToHm(rU)));
  ctx.font = '600 10px ui-monospace, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const a of angles) {
    const x = c.x + Math.cos(a) * rU * v.scale;
    const y = c.y + Math.sin(a) * rU * v.scale;
    const wPx = ctx.measureText(text).width + 4;
    ctx.fillStyle = 'rgba(5, 8, 7, 0.85)'; // config.ts:32 void, so the numeral reads over the line
    ctx.fillRect(x - wPx / 2, y - 6, wPx, 12);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }
}

function drawHeadingLine(v: View, c: Vec2, heading: number): void {
  const { ctx } = v;
  const far = Math.hypot(v.w, v.h);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(c.x, c.y);
  ctx.lineTo(c.x + Math.cos(heading) * far, c.y + Math.sin(heading) * far);
  ctx.stroke();
}

function drawBearingScale(v: View, c: Vec2): void {
  const { ctx } = v;
  const r = Math.min(v.w, v.h) / 2 - 3;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.lineWidth = 1;
  ctx.font = '600 10px ui-monospace, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let d = 0; d < 360; d += 5) {
    const a = canvasAngle((d * Math.PI) / 180);
    const len = d % 10 === 0 ? 9 : 5;
    ctx.beginPath();
    ctx.moveTo(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r);
    ctx.lineTo(c.x + Math.cos(a) * (r - len), c.y + Math.sin(a) * (r - len));
    ctx.stroke();
    if (d % 30 === 0) ctx.fillText(String(d).padStart(3, '0'), c.x + Math.cos(a) * (r - 18), c.y + Math.sin(a) * (r - 18));
  }
}

function drawCorner(v: View, radarU: number): void {
  const { ctx } = v;
  const { rangeHm, ringsHm } = scopeScale(v);
  ctx.font = '600 13px ui-monospace, Menlo, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(5, 8, 7, 0.8)';
  ctx.fillRect(6, 6, 236, 40);
  ctx.fillStyle = 'rgba(226, 232, 240, 0.95)'; // config.ts textPrimary
  ctx.fillText(`RANGE ${Math.round(rangeHm)} hm · RINGS ${ringsHm} hm`, 12, 10);
  ctx.fillStyle = `rgba(${PHOSPHOR}, 0.95)`;
  ctx.fillText(`RADAR ${Math.round(uToHm(radarU))} hm`, 12, 28);
}
