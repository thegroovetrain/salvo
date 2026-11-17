// THE HULL ART AS PURE SHAPES (Story 10.4 wave 2c) — the sitting page's
// `drawHull` + `drawFeatures` ported to a renderer-free list of primitives in
// the hull's LOCAL frame (bow at +x, origin at the hull centre, world units,
// +y starboard — the shared silhouette's frame). The Pixi art
// (render/hullArt/pixiArt.ts) and the DOM art (render/hullArt/svgArt.ts) both
// walk THESE lists, so the canvas ship and the card ship cannot disagree.
//
// A primitive names its FILL by skin key and its LINE by weight class — never a
// color and never a width. Color is the painter's business (skin for fills,
// the relation for every line — epic-10 amendment 7(m)); width is the
// painter's (world units in the canvas, screen px in the DOM — 7(o)).
//
// THE HULL LINE IS THE SHARED SILHOUETTE (`hullSilhouette`) — the polygon the
// hit test uses, so what you see is what gets hit. The page traced the raw
// `HULL_OUTLINES`; shared simplifies them at `TRACE_TOLERANCE_U` (0.3 u), which
// is ~0.17 px at the default framing and ~0.26 px at the close limit — below a
// pixel at every game zoom.

import { CONFIG, U_PER_M, hullSilhouette, turretMounts, turretStation, type ShipClassId, type Vec2 } from '@salvo/shared';
import { CLIENT_CONFIG } from '../../config.js';
import { FEATURES, HOUSES, type Feature, type FracPoint } from './data.js';

/** A skin fill slot (CLIENT_CONFIG.skins.* keys; `tier1..3` index `tier[]`). */
export type FillKey = 'deck' | 'tier1' | 'tier2' | 'tier3' | 'round' | 'funnel' | 'funnelMouth' | 'sec' | 'turret' | 'barrel';

/** A line weight class: the ONE bold hull line, the inner lines, and the 1.5×
 *  inner rails / cranes (amendment 7(o)). */
export type LineKey = 'hull' | 'inner' | 'heavy';

interface PrimBase {
  fill: FillKey | null;
  line: LineKey | null;
  /** Line alpha (the page's 0.6 deck line); absent = 1. */
  lineAlpha?: number;
}
export interface PolyPrim extends PrimBase {
  kind: 'poly';
  pts: readonly Vec2[];
}
export interface EllipsePrim extends PrimBase {
  kind: 'ellipse';
  x: number;
  y: number;
  rx: number;
  ry: number;
}
export interface SegPrim extends PrimBase {
  kind: 'seg';
  a: Vec2;
  b: Vec2;
}
export type Prim = PolyPrim | EllipsePrim | SegPrim;

/** The hull's art, split by Graphics layer: `deck` (fill, features, barbette
 *  rings — under the turrets) and `outline` (the bold line, drawn LAST so
 *  nothing covers it, as the page does). */
export interface HullArt {
  deck: readonly Prim[];
  outline: readonly Prim[];
}

/** A main turret's art in its OWN frame (pivot at the origin, barrels along
 *  +x): the barrels first (under), then the gunhouse. */
export interface TurretArt {
  prims: readonly Prim[];
  /** The gunhouse polygon alone (tests: the house covers the pivot). */
  house: readonly Vec2[];
}

const A = CLIENT_CONFIG.ship.art;
const DEG = Math.PI / 180;

/** Fraction space → hull local units for a hull of `len` × `beam`. */
interface Frame {
  len: number;
  beam: number;
}

function X(f: Frame, fx: number): number {
  return (0.5 - fx) * f.len;
}
function Y(f: Frame, fy: number): number {
  return fy * f.beam;
}
function at(f: Frame, p: FracPoint): Vec2 {
  return { x: X(f, p[0]), y: Y(f, p[1]) };
}

/** Rotate a local (metres) point by `rad` about `c`, scaled to units. */
function rotM(c: Vec2, rad: number, x: number, y: number): Vec2 {
  const ux = Math.cos(rad);
  const uy = Math.sin(rad);
  return { x: c.x + (ux * x - uy * y) * U_PER_M, y: c.y + (uy * x + ux * y) * U_PER_M };
}

/** A barrel as a FILLED quad (7(m): barrels are fills), from x0 to x1 at
 *  across-track `o` (metres, local frame of `c` rotated by `rad`). */
function barrel(c: Vec2, rad: number, x0: number, x1: number, o: number, widthM: number): PolyPrim {
  const h = widthM / 2;
  return {
    kind: 'poly',
    pts: [rotM(c, rad, x0, o - h), rotM(c, rad, x1, o - h), rotM(c, rad, x1, o + h), rotM(c, rad, x0, o + h)],
    fill: 'barrel',
    line: null,
  };
}

const TIER_FILL: Readonly<Record<1 | 2 | 3, FillKey>> = { 1: 'tier1', 2: 'tier2', 3: 'tier3' };

function circle(c: Vec2, rU: number, fill: FillKey | null, line: LineKey | null): EllipsePrim {
  return { kind: 'ellipse', x: c.x, y: c.y, rx: rU, ry: rU, fill, line };
}

/** The page's `sec`: barrels under a trained six-sided house. */
function secPrims(f: Frame, s: Extract<Feature, { t: 'sec' }>): Prim[] {
  const c = { x: X(f, s.x), y: Y(f, s.y) };
  const rad = s.a * DEG;
  const hl = s.l / 2;
  const hw = s.w / 2;
  const out: Prim[] = [];
  for (let i = 0; i < s.n; i++) {
    out.push(barrel(c, rad, hl * 0.3, hl + s.b, (i - (s.n - 1) / 2) * hw * 0.9, A.secBarrelM));
  }
  const house: FracPoint[] = [[-hl, -hw], [hl * 0.45, -hw], [hl, -hw * 0.5], [hl, hw * 0.5], [hl * 0.45, hw], [-hl, hw]];
  out.push({ kind: 'poly', pts: house.map(([x, y]) => rotM(c, rad, x, y)), fill: 'sec', line: 'inner' });
  return out;
}

/** The page's `funnel`: a filled ellipse with a dark mouth inside it. */
function funnelPrims(f: Frame, s: Extract<Feature, { t: 'funnel' }>): Prim[] {
  const x = X(f, s.x);
  const y = Y(f, s.y);
  const rx = (s.l / 2) * U_PER_M;
  const ry = (s.w / 2) * U_PER_M;
  const k = A.funnelMouthFrac;
  return [
    { kind: 'ellipse', x, y, rx, ry, fill: 'funnel', line: 'inner' },
    { kind: 'ellipse', x, y, rx: rx * k, ry: ry * k, fill: 'funnelMouth', line: 'inner' },
  ];
}

/** The page's `crane`: a jib line from the post, then the post disc over it. */
function cranePrims(f: Frame, s: Extract<Feature, { t: 'crane' }>): Prim[] {
  const c = { x: X(f, s.x), y: Y(f, s.y) };
  const tip = rotM(c, s.a * DEG, s.l, 0);
  return [
    { kind: 'seg', a: c, b: tip, fill: null, line: 'heavy' },
    circle(c, A.craneHubM * U_PER_M, 'round', 'heavy'),
  ];
}

function casePrim(f: Frame, s: Extract<Feature, { t: 'case' }>): PolyPrim {
  const cx = X(f, s.x);
  const cy = Y(f, s.y);
  const hl = (s.l / 2) * U_PER_M;
  const hw = (s.w / 2) * U_PER_M;
  const pts = [
    { x: cx - hl, y: cy - hw },
    { x: cx + hl, y: cy - hw },
    { x: cx + hl, y: cy + hw },
    { x: cx - hl, y: cy + hw },
  ];
  return { kind: 'poly', pts, fill: 'sec', line: 'inner' };
}

function segPrim(f: Frame, s: Extract<Feature, { t: 'rail' | 'line' }>): SegPrim {
  const a = at(f, [s.x0, s.y0]);
  const b = at(f, [s.x1, s.y1]);
  if (s.t === 'rail') return { kind: 'seg', a, b, fill: null, line: 'heavy' };
  return { kind: 'seg', a, b, fill: null, line: 'inner', lineAlpha: A.deckLineAlpha };
}

/** One page feature → its primitives, in the page's draw order. */
function featurePrims(f: Frame, s: Feature): Prim[] {
  switch (s.t) {
    case 'tier':
      return [{ kind: 'poly', pts: s.pts.map((p) => at(f, p)), fill: TIER_FILL[s.lvl], line: 'inner' }];
    case 'round':
      return [circle({ x: X(f, s.x), y: Y(f, s.y) }, s.r * U_PER_M, 'round', 'inner')];
    case 'funnel':
      return funnelPrims(f, s);
    case 'sec':
      return secPrims(f, s);
    case 'case':
      return [casePrim(f, s)];
    case 'crane':
      return cranePrims(f, s);
    default:
      return [segPrim(f, s)];
  }
}

function frameOf(id: ShipClassId): Frame {
  const h = CONFIG.shipClasses[id].hull;
  return { len: h.length, beam: h.beam };
}

/**
 * Pure: a deck TORPEDO LAUNCHER's art in its own frame (pivot at the origin,
 * tubes along +x — Story 10.6, I2): the pivot disc, then `tubes` outlined
 * tubes side by side (1 or 2), or — `tubes` null, a sighted enemy whose tube
 * count is not on the wire (I7) — ONE generic housing of the same length.
 */
export function launcherArt(tubes: number | null): readonly Prim[] {
  const L = A.launcher;
  const x0 = -L.tubeBackM * U_PER_M;
  const x1 = (L.tubeLenM - L.tubeBackM) * U_PER_M;
  const rect = (y: number, w: number, fill: FillKey): PolyPrim => {
    const h = (w / 2) * U_PER_M;
    const c = y * U_PER_M;
    return { kind: 'poly', pts: [{ x: x0, y: c - h }, { x: x1, y: c - h }, { x: x1, y: c + h }, { x: x0, y: c + h }], fill, line: 'inner' };
  };
  const prims: Prim[] = [circle({ x: 0, y: 0 }, L.pivotM * U_PER_M, 'round', 'inner')];
  if (tubes === null) return [...prims, rect(0, L.housingWidthM, 'sec')];
  const n = Math.max(1, Math.floor(tubes));
  for (let k = 0; k < n; k++) prims.push(rect((k - (n - 1) / 2) * L.tubeGapM, L.tubeWidthM, 'barrel'));
  return prims;
}

/** Pure: a main turret's barbette ring (deck layer) at its shared station. */
export function barbetteRadiusU(id: ShipClassId): number {
  return HOUSES[id].barbette * U_PER_M;
}

/**
 * Pure: the hull's art — deck fill (the shared silhouette), every deck
 * feature in the page's order, a barbette ring under every main turret, and
 * the bold outline. Built from data only; callers cache.
 */
export function hullArt(id: ShipClassId): HullArt {
  const f = frameOf(id);
  const silhouette = hullSilhouette(id);
  const deck: Prim[] = [{ kind: 'poly', pts: silhouette, fill: 'deck', line: null }];
  for (const s of FEATURES[id]) deck.push(...featurePrims(f, s));
  const r = barbetteRadiusU(id);
  turretMounts(id).forEach((_, i) => deck.push(circle(turretStation(id, i), r, null, 'inner')));
  return { deck, outline: [{ kind: 'poly', pts: silhouette, fill: null, line: 'hull' }] };
}

/**
 * Pure: the order the main turrets PAINT in, first (lowest) to last (on top):
 * farthest from amidships first, so a SUPERFIRING turret — the one nearer
 * amidships, raised to fire over its neighbour — draws above the turret it
 * fires over (Eric 2026-11-06: "on the 4x2 ships it looks like the third gun
 * (from the front) barrels are rendered under the fourth gun turrets. Fix
 * that."). A rule off each turret's shared station (`|x|`, the distance from
 * amidships), never a per-hull table; ties keep the bow-first index order.
 */
export function turretDrawOrder(id: ShipClassId): number[] {
  const away = turretMounts(id).map((_, i) => Math.abs(turretStation(id, i).x));
  return away.map((_, i) => i).sort((a, b) => away[b] - away[a] || a - b);
}

/**
 * Pure: main turret `i`'s art in its own frame — `guns` barrels (the shared
 * mount's count) from just behind the gun face out to the barrel length, then
 * the gunhouse polygon over them (skin fill, inner relation line).
 */
export function turretArt(id: ShipClassId, i: number): TurretArt {
  const H = HOUSES[id];
  const guns = turretMounts(id)[i]?.guns ?? 0;
  const face = H.poly[2][0];
  const origin = { x: 0, y: 0 };
  const prims: Prim[] = [];
  for (let k = 0; k < guns; k++) {
    prims.push(barrel(origin, 0, face - A.mainBarrelBackM, face + H.barrel, (k - (guns - 1) / 2) * H.gap, A.mainBarrelM));
  }
  const house = H.poly.map(([x, y]) => ({ x: x * U_PER_M, y: y * U_PER_M }));
  prims.push({ kind: 'poly', pts: house, fill: 'turret', line: 'inner' });
  return { prims, house };
}
