// THE DOM HULL ART (Story 10.4 wave 2c) — the SAME shape lists the canvas
// paints (render/hullArt/shapes.ts), emitted as one inline `<svg>` string for
// chrome (the ship cards, the home class chip). Turrets sit at their rest
// bearings. Bow RIGHT (the hull's local +x → SVG +x, local +y starboard → SVG
// down — exactly the canvas at heading 0).
//
// Colors follow the two rules (epic-10 amendment 7(k)/(m)): fills from the
// hull's Default skin, EVERY line in the relation color. Weights are SCREEN px
// (`vector-effect="non-scaling-stroke"`): the hull line `hullPx`, the inner
// lines a third of it, rails and cranes 1.5× the inner (amendment 7(o)) — so
// the line weight holds whatever size the caller fits the art to.
//
// Pure string builder: colors are projected from tokens through `cssHex`, so
// the tokens guard has no literal to scan. Sized by explicit px width/height
// from `pxPerU` (the caller's scale), so several hulls can share one scale and
// keep their TRUE relative sizes.

import { turretMounts, turretRest, turretStation, type ShipClassId, type Vec2 } from '@salvo/shared';
import { CLIENT_CONFIG } from '../../config.js';
import { cssHex } from '../../util/color.js';
import { relationStroke, type Relation } from '../relationColor.js';
import { skinFill } from './palette.js';
import { hullArt, turretArt, turretDrawOrder, type LineKey, type Prim } from './shapes.js';

const A = CLIENT_CONFIG.ship.art;

/** An axis-aligned box in hull units. */
export interface ArtBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface HullArtSvgOpts {
  /** Screen px per world unit — the caller's scale (share it across hulls to
   *  keep true relative size). */
  pxPerU: number;
  /** The hull line's screen width (px); default `CLIENT_CONFIG.ship.art.svgHullPx`. */
  hullPx?: number;
}

/** A turret's primitives carried into the hull frame (rest bearing, station). */
function placed(id: ShipClassId, i: number): Prim[] {
  const c = turretStation(id, i);
  const rad = turretRest(turretMounts(id)[i]);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const tf = (v: Vec2): Vec2 => ({ x: c.x + v.x * cos - v.y * sin, y: c.y + v.x * sin + v.y * cos });
  return turretArt(id, i).prims.map((p) => {
    if (p.kind === 'poly') return { ...p, pts: p.pts.map(tf) };
    if (p.kind === 'seg') return { ...p, a: tf(p.a), b: tf(p.b) };
    return { ...p, ...tf(p) };
  });
}

/** Pure: every primitive of the hull at rest, in paint order — deck, turrets
 *  (in `turretDrawOrder`: a superfiring turret over the one it fires over),
 *  then the outline over everything. */
export function restingPrims(id: ShipClassId): Prim[] {
  const art = hullArt(id);
  const turrets = turretDrawOrder(id).flatMap((i) => placed(id, i));
  return [...art.deck, ...turrets, ...art.outline];
}

function primPoints(p: Prim): Vec2[] {
  if (p.kind === 'poly') return [...p.pts];
  if (p.kind === 'seg') return [p.a, p.b];
  return [
    { x: p.x - p.rx, y: p.y - p.ry },
    { x: p.x + p.rx, y: p.y + p.ry },
  ];
}

/** Pure: the box the resting art covers (features and barrels may overhang
 *  the hull line). */
export function artBox(id: ShipClassId): ArtBox {
  const box: ArtBox = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for (const v of restingPrims(id).flatMap(primPoints)) {
    box.minX = Math.min(box.minX, v.x);
    box.maxX = Math.max(box.maxX, v.x);
    box.minY = Math.min(box.minY, v.y);
    box.maxY = Math.max(box.maxY, v.y);
  }
  return box;
}

/** Pure: a line class's screen width (px) for a hull line of `hullPx`. */
export function svgLineWidth(key: LineKey, hullPx: number): number {
  const inner = hullPx * A.innerLineFrac;
  if (key === 'hull') return hullPx;
  return key === 'heavy' ? inner * A.heavyLineMult : inner;
}

function r3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function geometry(p: Prim): string {
  if (p.kind === 'ellipse') return `<ellipse cx="${r3(p.x)}" cy="${r3(p.y)}" rx="${r3(p.rx)}" ry="${r3(p.ry)}"`;
  if (p.kind === 'seg') return `<line x1="${r3(p.a.x)}" y1="${r3(p.a.y)}" x2="${r3(p.b.x)}" y2="${r3(p.b.y)}"`;
  return `<polygon points="${p.pts.map((v) => `${r3(v.x)},${r3(v.y)}`).join(' ')}"`;
}

function element(id: ShipClassId, p: Prim, line: string, hullPx: number): string {
  const fill = p.fill === null ? 'none' : cssHex(skinFill(id, p.fill));
  const stroke =
    p.line === null
      ? 'stroke="none"'
      : `stroke="${line}" stroke-width="${r3(svgLineWidth(p.line, hullPx))}" stroke-linejoin="round" ` +
        `stroke-linecap="round" vector-effect="non-scaling-stroke"` +
        (p.lineAlpha === undefined ? '' : ` stroke-opacity="${p.lineAlpha}"`);
  return `${geometry(p)} fill="${fill}" ${stroke}/>`;
}

/**
 * Pure: hull `id`'s art as an inline `<svg>` string, bow right, turrets at
 * rest, lines in `relation`'s color, `pxPerU` screen px per world unit, with a
 * margin of half the hull line so the bold line is never clipped.
 */
export function hullArtSvg(id: ShipClassId, relation: Relation, opts: HullArtSvgOpts): string {
  const hullPx = opts.hullPx ?? A.svgHullPx;
  const pad = hullPx / opts.pxPerU;
  const b = artBox(id);
  const vx = b.minX - pad;
  const vy = b.minY - pad;
  const vw = b.maxX - b.minX + pad * 2;
  const vh = b.maxY - b.minY + pad * 2;
  const line = cssHex(relationStroke(relation));
  const body = restingPrims(id).map((p) => element(id, p, line, hullPx)).join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" data-hull="${id}" viewBox="${r3(vx)} ${r3(vy)} ${r3(vw)} ${r3(vh)}" ` +
    `width="${r3(vw * opts.pxPerU)}" height="${r3(vh * opts.pxPerU)}" preserveAspectRatio="xMidYMid meet">` +
    `${body}</svg>`
  );
}

/** Pure: the largest `pxPerU` at which EVERY hull in `ids` fits a `w` × `h` px
 *  box — one shared scale, so the hulls keep their true relative sizes. */
export function sharedFitPxPerU(ids: readonly ShipClassId[], w: number, h: number): number {
  let k = Infinity;
  for (const id of ids) {
    const b = artBox(id);
    k = Math.min(k, w / (b.maxX - b.minX), h / (b.maxY - b.minY));
  }
  return k;
}
