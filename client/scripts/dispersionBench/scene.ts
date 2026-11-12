// The "Aim marker ideas" backdrop: a stage set of the game's battle view drawn
// with canvas 2D in the game's own literal colors (palette.ts, cited per value),
// in the game's z-order (client/src/render/stage.ts:8–11): ocean → fog overlay
// → charted layers (range ring, island, storm, lit zone, fog bank, radar
// paint, sight ring) → the aim marker on top. World frame as everywhere on
// this page: the aim point is the origin, the line of fire runs along +x.
//
// It is a STAGE SET, not the shooter's real surroundings: each backdrop puts
// the aim point on one kind of water so a marker can be judged there.

import { CONFIG, SHIP_CLASS_IDS, hullSilhouette, transformPolygon, type Vec2 } from '@salvo/shared';
import { sx, sy, type View } from './canvas.js';
import * as P from './palette.js';

export type BackdropId = 'open' | 'fog' | 'radar' | 'lit' | 'storm' | 'bank';

interface Backdrop {
  id: BackdropId;
  label: string;
  /** The own ship = the center of the sight bubble (the hole in the fog). */
  ship: Vec2;
  /** An own star-shell lit zone's center (clears the fog, white glow). */
  lit?: Vec2;
  /** The storm ring (center, radius): storm fill outside, violet edge. */
  storm?: { c: Vec2; r: number };
  bank?: boolean;
  radar?: boolean;
}

const SIGHT_U = CONFIG.vision.sight;
const CELL_U = CONFIG.vision.radarCellU;
const LIT_U = CONFIG.starShells.litRadius;

export const BACKDROPS: Backdrop[] = [
  { id: 'open', label: 'Open dark water (inside your sight)', ship: { x: -120, y: -40 } },
  { id: 'fog', label: 'Under fog (outside your sight)', ship: { x: -1100, y: 0 } },
  { id: 'radar', label: 'Beside radar paint (under fog)', ship: { x: -1100, y: 0 }, radar: true },
  { id: 'lit', label: 'Over your own star-shell glow', ship: { x: -1100, y: 0 }, lit: { x: 40, y: -30 } },
  { id: 'storm', label: 'At the storm edge', ship: { x: -150, y: 0 }, storm: { c: { x: -3000, y: 0 }, r: 3040 } },
  { id: 'bank', label: 'In a fog bank (the weather)', ship: { x: -150, y: 0 }, bank: true },
];

export function backdrop(id: BackdropId): Backdrop {
  return BACKDROPS.find((b) => b.id === id) ?? BACKDROPS[0];
}

/** A range ring of the map (radius = a quarter-step of the map radius) passing just left of the aim point. */
const RING_R = 2500;
const RING_C: Vec2 = { x: -RING_R - 160, y: 0 };

/** A deterministic island near the aim point (the real generator needs a whole map). */
const ISLE_C: Vec2 = { x: -125, y: 110 };
const ISLE_R = 55;

function islandLoop(scale: number, shift: Vec2): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i < 48; i++) {
    const t = (i / 48) * Math.PI * 2;
    const r = ISLE_R * scale * (1 + 0.16 * Math.sin(3 * t + 0.7) + 0.09 * Math.cos(5 * t + 1.9));
    pts.push({ x: ISLE_C.x + shift.x + r * Math.cos(t) * 1.35, y: ISLE_C.y + shift.y + r * Math.sin(t) });
  }
  return pts;
}

const ISLE_BANDS: Vec2[][] = [
  islandLoop(1, { x: 0, y: 0 }),
  islandLoop(0.7, { x: 8, y: 6 }),
  islandLoop(0.44, { x: 14, y: 10 }),
  islandLoop(0.2, { x: 18, y: 12 }),
];

function tracePoly(v: View, poly: readonly Vec2[]): void {
  v.ctx.beginPath();
  poly.forEach((p, i) => (i === 0 ? v.ctx.moveTo(sx(v, p.x), sy(v, p.y)) : v.ctx.lineTo(sx(v, p.x), sy(v, p.y))));
  v.ctx.closePath();
}

function circle(v: View, c: Vec2, r: number): void {
  v.ctx.beginPath();
  v.ctx.arc(sx(v, c.x), sy(v, c.y), Math.max(r * v.scale, 0), 0, Math.PI * 2);
}

/** Fog of war: the fog color everywhere, a feathered hole at the ship, a hard hole in an own lit zone. */
function drawFog(v: View, b: Backdrop): void {
  const off = document.createElement('canvas');
  off.width = v.ctx.canvas.width;
  off.height = v.ctx.canvas.height;
  const o = off.getContext('2d');
  if (!o) return;
  o.setTransform(v.ctx.getTransform());
  o.fillStyle = P.FOG_FILL;
  o.fillRect(0, 0, v.w, v.h);
  o.globalCompositeOperation = 'destination-out';
  const hx = sx(v, b.ship.x);
  const hy = sy(v, b.ship.y);
  const R = SIGHT_U * v.scale;
  const g = o.createRadialGradient(hx, hy, R * P.HOLE_FEATHER_START, hx, hy, R);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  o.fillStyle = g;
  o.beginPath();
  o.arc(hx, hy, R, 0, Math.PI * 2);
  o.fill();
  if (b.lit) {
    o.fillStyle = '#000';
    o.beginPath();
    o.arc(sx(v, b.lit.x), sy(v, b.lit.y), LIT_U * v.scale, 0, Math.PI * 2);
    o.fill();
  }
  v.ctx.save();
  v.ctx.setTransform(1, 0, 0, 1, 0, 0);
  v.ctx.drawImage(off, 0, 0);
  v.ctx.restore();
}

function strokeWorld(v: View, color: string, widthU: number): void {
  v.ctx.lineWidth = widthU * v.scale;
  v.ctx.strokeStyle = color;
  v.ctx.stroke();
}

function drawIsland(v: View): void {
  ISLE_BANDS.forEach((poly, i) => {
    tracePoly(v, poly);
    v.ctx.fillStyle = P.TERRAIN[i].fill;
    v.ctx.fill();
    v.ctx.lineWidth = i === 0 ? P.COAST_PX : P.CONTOUR_PX;
    v.ctx.strokeStyle = P.TERRAIN[i].stroke;
    v.ctx.stroke();
  });
}

function drawStorm(v: View, storm: { c: Vec2; r: number }): void {
  const { ctx } = v;
  ctx.beginPath();
  ctx.rect(0, 0, v.w, v.h);
  ctx.arc(sx(v, storm.c.x), sy(v, storm.c.y), storm.r * v.scale, 0, Math.PI * 2, true);
  ctx.fillStyle = P.STORM_FILL;
  ctx.fill('evenodd');
  circle(v, storm.c, storm.r);
  ctx.lineWidth = P.STORM_EDGE.px;
  ctx.strokeStyle = P.STORM_EDGE.color;
  ctx.stroke();
}

function drawLit(v: View, c: Vec2): void {
  const { ctx } = v;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  circle(v, c, LIT_U);
  ctx.fillStyle = `rgba(255, 255, 255, ${P.LIT.fillAlpha})`;
  ctx.fill();
  strokeWorld(v, `rgba(255, 255, 255, ${P.LIT.ringAlpha})`, P.LIT.ringU);
  ctx.restore();
}

/** Fog-bank puffs (x, y, radius u, puff alpha) — the field is noise-driven in the game; these are fixed. */
const PUFFS: Array<[number, number, number, number]> = [
  [-70, -25, 62, 0.55], [25, 12, 58, 0.6], [95, -55, 46, 0.4], [-25, 62, 40, 0.35],
  [150, 30, 68, 0.5], [-150, -80, 52, 0.45], [60, 85, 44, 0.3], [-130, 40, 36, 0.3], [10, -95, 50, 0.4],
];

function drawBank(v: View): void {
  const { ctx } = v;
  for (const [x, y, r, a] of PUFFS) {
    const cx = sx(v, x);
    const cy = sy(v, y);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * v.scale);
    g.addColorStop(0, `rgba(${P.FOG_BANK.color}, ${a * P.FOG_BANK.maxAlpha})`);
    g.addColorStop(1, `rgba(${P.FOG_BANK.color}, 0)`);
    ctx.fillStyle = g;
    circle(v, { x, y }, r);
    ctx.fill();
  }
}

function inPoly(p: Vec2, poly: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** A radar return: a real hull silhouette rasterized onto the real 9 u radar lattice. Red inside, blue one cell out, green two out. */
function radarCells(): Array<{ i: number; j: number; color: string }> {
  const hull = SHIP_CLASS_IDS[0];
  const poly = transformPolygon(hullSilhouette(hull), 95, -60, (-20 * Math.PI) / 180);
  const inside = new Set<string>();
  for (let i = -12; i <= 30; i++) for (let j = -22; j <= 4; j++) if (inPoly({ x: (i + 0.5) * CELL_U, y: (j + 0.5) * CELL_U }, poly)) inside.add(`${i},${j}`);
  const out: Array<{ i: number; j: number; color: string }> = [];
  for (let i = -14; i <= 32; i++) {
    for (let j = -24; j <= 6; j++) {
      const d = ringDistance(inside, i, j);
      if (d <= 2) out.push({ i, j, color: [P.RADAR.red, P.RADAR.blue, P.RADAR.green][d] });
    }
  }
  // Lone weak returns (water clutter / a wake) — green only, a few under the aim point.
  for (const [i, j] of [[-1, 0], [0, 1], [-3, -1], [2, 2], [-6, 1], [-8, 2], [4, -2], [-12, -4], [7, 4]]) out.push({ i, j, color: P.RADAR.green });
  return out;
}

/** Chebyshev distance (in cells, capped at 3) from cell (i, j) to the nearest inside cell. */
function ringDistance(inside: Set<string>, i: number, j: number): number {
  for (let d = 0; d <= 2; d++) {
    for (let di = -d; di <= d; di++) for (let dj = -d; dj <= d; dj++) if (inside.has(`${i + di},${j + dj}`)) return d;
  }
  return 3;
}

let cachedCells: ReturnType<typeof radarCells> | null = null;

function drawRadar(v: View, b: Backdrop): void {
  cachedCells ??= radarCells();
  const dist = Math.hypot(b.ship.x, b.ship.y);
  const alpha = P.RADAR_ALPHA * (dist < SIGHT_U ? P.RADAR_DIM_IN_SIGHT : 1);
  const s = CELL_U * v.scale;
  for (const c of cachedCells) {
    v.ctx.fillStyle = `rgba(${c.color}, ${alpha})`;
    v.ctx.fillRect(sx(v, c.i * CELL_U), sy(v, c.j * CELL_U), s, s);
  }
}

/** Draw the whole backdrop under the marker. */
export function drawBackdrop(v: View, id: BackdropId): void {
  const b = backdrop(id);
  v.ctx.fillStyle = P.OCEAN;
  v.ctx.fillRect(0, 0, v.w, v.h);
  drawFog(v, b);
  circle(v, RING_C, RING_R);
  strokeWorld(v, `rgba(${P.RANGE_RING.color}, ${P.RANGE_RING.alpha})`, P.RANGE_RING.widthU);
  drawIsland(v);
  if (b.storm) drawStorm(v, b.storm);
  if (b.lit) drawLit(v, b.lit);
  if (b.bank) drawBank(v);
  if (b.radar) drawRadar(v, b);
  circle(v, b.ship, SIGHT_U);
  strokeWorld(v, `rgba(${P.SIGHT_RING.color}, ${P.SIGHT_RING.alpha})`, P.SIGHT_RING.widthU);
}
