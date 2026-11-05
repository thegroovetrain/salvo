// THE CANVAS HULL ART (Story 10.4 wave 2c) — the pure shape lists
// (render/hullArt/shapes.ts) painted into Pixi `GraphicsContext`s, built ONCE
// per (hull, line color) and SHARED by every ShipView that wears them: a
// Pixi 8 Graphics constructed over a context it does not own draws that
// geometry without copying it, and `Graphics.destroy()` leaves a borrowed
// context alone. Nothing here runs per frame.
//
// Fills are the skin (palette.ts), lines the one relation color in `line`, at
// the world-unit weights of CLIENT_CONFIG.ship.art — the hull line bold, every
// inner line a third of it, rails and cranes 1.5× the inner (amendment 7(o)).

import { GraphicsContext } from 'pixi.js';
import type { ShipClassId } from '@salvo/shared';
import { CLIENT_CONFIG } from '../../config.js';
import { skinFill } from './palette.js';
import { hullArt, turretArt, type LineKey, type Prim } from './shapes.js';

const A = CLIENT_CONFIG.ship.art;

/** Pure: a line class's world-unit width. */
export function lineWidthU(key: LineKey): number {
  const inner = A.hullLineU * A.innerLineFrac;
  if (key === 'hull') return A.hullLineU;
  return key === 'heavy' ? inner * A.heavyLineMult : inner;
}

function trace(ctx: GraphicsContext, p: Prim): void {
  if (p.kind === 'ellipse') {
    ctx.ellipse(p.x, p.y, p.rx, p.ry);
    return;
  }
  if (p.kind === 'seg') {
    ctx.moveTo(p.a.x, p.a.y).lineTo(p.b.x, p.b.y);
    return;
  }
  ctx.poly(p.pts.flatMap((v) => [v.x, v.y]), true);
}

/** Paint primitives in order: each traced once, filled with its skin slot,
 *  then stroked in the relation color at its weight class. */
function paint(ctx: GraphicsContext, id: ShipClassId, prims: readonly Prim[], line: number): GraphicsContext {
  for (const p of prims) {
    trace(ctx, p);
    if (p.fill !== null) ctx.fill({ color: skinFill(id, p.fill), alpha: 1 });
    if (p.line !== null) {
      ctx.stroke({ width: lineWidthU(p.line), color: line, alpha: p.lineAlpha ?? 1, join: 'round', cap: 'round' });
    }
  }
  return ctx;
}

const cache = new Map<string, GraphicsContext>();

function cached(key: string, build: () => GraphicsContext): GraphicsContext {
  let ctx = cache.get(key);
  if (ctx === undefined) {
    ctx = build();
    cache.set(key, ctx);
  }
  return ctx;
}

/** The shared DECK context (skin fill, features, barbette rings) for hull `id`
 *  with linework in `line`. Never destroy it — it is borrowed. */
export function deckContext(id: ShipClassId, line: number): GraphicsContext {
  return cached(`deck|${id}|${line}`, () => paint(new GraphicsContext(), id, hullArt(id).deck, line));
}

/** The shared OUTLINE context (the one bold hull line) for hull `id` in `line`. */
export function outlineContext(id: ShipClassId, line: number): GraphicsContext {
  return cached(`outline|${id}|${line}`, () => paint(new GraphicsContext(), id, hullArt(id).outline, line));
}

/** The shared context for main turret `i` of hull `id` in `line` (its own
 *  frame: barrels along +x). */
export function turretContext(id: ShipClassId, i: number, line: number): GraphicsContext {
  return cached(`turret|${id}|${i}|${line}`, () => paint(new GraphicsContext(), id, turretArt(id, i).prims, line));
}

/** How many contexts are cached (tests: building views does not grow it per view). */
export function artCacheSize(): number {
  return cache.size;
}
