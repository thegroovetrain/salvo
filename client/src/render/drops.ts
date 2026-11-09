// THE AIRDROPS ON THE WATER (Story 10.9, epic-10 amendment 16, Eric's R3/R4
// of 2026-11-08). Fed every frame from FrameMsg.drops (contact-like, sight-gated
// per observer, sanitized fail-closed by sim/dropView.ts before it lands here).
//
// WHAT IS DRAWN: inside sight, a crate shows its STAT GLYPH (the index ladder's
// own hotbar/card linework, `drawEquipmentIcon`) and its AMOUNT as a small mono
// `+n`. On radar a drop is a plain anonymous blip — no art here (R3). The body
// is sized off the 15 u pickup disc (`CONFIG.drops.radiusU`, R4), so what you
// see is the water you must touch. A WRECK BUNDLE (three rolls) draws its three
// glyphs in a tight row inside a wider body, a `+n` UNDER each glyph.
//
// COLOR: body + glyph `colors.white` at the mine marker's alpha, the numeral
// `colors.phosphor`. No relation color (a drop has no owner), no alert tint
// (not a hazard), no motion.
//
// THREE CANDIDATE BODIES (`CLIENT_CONFIG.drops.variant`, for Eric's rendered
// page — the losers are deleted after his ruling): A "crate" — the 15 u disc's
// inscribed square; B "float" — the 15 u circle (a stadium for a bundle);
// C "parachute" — the circle (an ellipse for a bundle) with four canopy spokes
// meeting at the center.
//
// SHAPE (render/beacons.ts's): a PURE core — `crateLayout` (no Pixi),
// `drawCrate` (one Graphics, world units, centered at 0,0) and `buildCrate`
// (Graphics + numeral Texts in one Container) — and the thin `Drops` adapter:
// one sprite per id, add/remove reconcile exactly like `Mines.sync` (the shared
// `reconcileLitZones` diff), placed once
// at spawn (a drop never moves).

import { Container, Graphics, Text } from 'pixi.js';
import { CONFIG, type DropView, type IndexId } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { reconcileLitZones } from './litZones.js';
import { drawEquipmentIcon } from './equipmentIcons.js';

export type CrateVariant = 'A' | 'B' | 'C';

/** Everything the core draws with — the page's dials, the game's config. */
export interface CrateStyle {
  variant: CrateVariant;
  /** Body + glyph linework color and alpha. */
  color: number;
  alpha: number;
  /** u — linework width (the mine marker's 1.5 u). */
  width: number;
  /** The `+n` numeral's color and WORLD-unit font size. */
  numeralColor: number;
  numeralPx: number;
  /** u — gap between a bundle's glyph cells. */
  bundleGap: number;
  /** u — the pickup disc the body is sized from. */
  radiusU: number;
}

/** The shipped style, read off CLIENT_CONFIG / CONFIG. */
export function crateStyle(variant: CrateVariant = CLIENT_CONFIG.drops.variant): CrateStyle {
  const D = CLIENT_CONFIG.drops;
  return {
    variant,
    color: CLIENT_CONFIG.colors.white,
    alpha: D.glyphAlpha,
    width: 1.5,
    numeralColor: CLIENT_CONFIG.colors.phosphor,
    numeralPx: D.numeralPx,
    bundleGap: D.bundleGap,
    radiusU: CONFIG.drops.radiusU,
  };
}

/** One glyph cell: the roll it shows and its center (x; y is always 0). */
export interface CrateCell {
  stat: IndexId;
  n: number;
  cx: number;
}

/** One `+n` numeral: its text, its position and its anchor. */
export interface CrateNumeral {
  text: string;
  x: number;
  y: number;
  anchorX: number;
  anchorY: number;
}

export interface CrateLayout {
  /** Half extents of the body. */
  halfW: number;
  halfH: number;
  /** The glyph box side (u). */
  glyphSize: number;
  cells: CrateCell[];
  numerals: CrateNumeral[];
}

/** The glyph box: 70 % of the disc's inscribed square. */
const GLYPH_FRAC = 0.7;

/** Pure: the base half-extent of a variant's body — the inscribed square's
 *  half side for A, the disc radius for B and C. */
function baseHalf(style: CrateStyle): number {
  return style.variant === 'A' ? style.radiusU / Math.SQRT2 : style.radiusU;
}

/** Pure: where each `+n` goes — lower right of a single crate's body, under
 *  each glyph of a bundle. */
function numeralsFor(cells: readonly CrateCell[], halfH: number, style: CrateStyle): CrateNumeral[] {
  if (cells.length === 1) {
    const c = style.radiusU / Math.SQRT2; // the disc's 45° point — on every body
    return [{ text: `+${cells[0].n}`, x: c + 1, y: c, anchorX: 0, anchorY: 0.5 }];
  }
  return cells.map((cell) => ({ text: `+${cell.n}`, x: cell.cx, y: halfH + 1, anchorX: 0.5, anchorY: 0 }));
}

/** Pure: the whole crate's geometry for a view's rolls. */
export function crateLayout(view: Pick<DropView, 'g'>, style: CrateStyle): CrateLayout {
  const glyphSize = style.radiusU * Math.SQRT2 * GLYPH_FRAC;
  const pitch = glyphSize + style.bundleGap;
  const k = view.g.length;
  const cells = view.g.map(([stat, n], i) => ({ stat, n, cx: (i - (k - 1) / 2) * pitch }));
  const base = baseHalf(style);
  const halfW = ((k - 1) / 2) * pitch + base;
  return { halfW, halfH: base, glyphSize, cells, numerals: numeralsFor(cells, base, style) };
}

type Stroke = { width: number; color: number; alpha: number };

function drawSquareBody(g: Graphics, l: CrateLayout, s: Stroke): void {
  g.rect(-l.halfW, -l.halfH, 2 * l.halfW, 2 * l.halfH).stroke(s);
}

function drawFloatBody(g: Graphics, l: CrateLayout, s: Stroke): void {
  if (l.halfW === l.halfH) g.circle(0, 0, l.halfH);
  else g.roundRect(-l.halfW, -l.halfH, 2 * l.halfW, 2 * l.halfH, l.halfH);
  g.stroke(s);
}

function drawParachuteBody(g: Graphics, l: CrateLayout, s: Stroke): void {
  g.ellipse(0, 0, l.halfW, l.halfH);
  for (const a of [0.25, 0.75, 1.25, 1.75]) {
    g.moveTo(0, 0).lineTo(Math.cos(a * Math.PI) * l.halfW, Math.sin(a * Math.PI) * l.halfH);
  }
  g.stroke(s);
}

const BODIES: Readonly<Record<CrateVariant, (g: Graphics, l: CrateLayout, s: Stroke) => void>> = {
  A: drawSquareBody,
  B: drawFloatBody,
  C: drawParachuteBody,
};

/** Draw the crate's body and glyphs onto `g` (cleared first) at (0, 0) in
 *  WORLD units. The numerals are Text — see `buildCrate`. */
export function drawCrate(g: Graphics, view: Pick<DropView, 'g'>, style: CrateStyle): void {
  const layout = crateLayout(view, style);
  const stroke: Stroke = { width: style.width, color: style.color, alpha: style.alpha };
  g.clear();
  BODIES[style.variant](g, layout, stroke);
  for (const cell of layout.cells) drawEquipmentIcon(g, cell.stat, cell.cx, 0, layout.glyphSize, stroke);
}

/** One `+n` numeral as a world-scaled Text. */
function numeralText(n: CrateNumeral, style: CrateStyle): Text {
  const t = new Text({
    text: n.text,
    style: { fontFamily: CLIENT_CONFIG.type.mono, fontSize: style.numeralPx, fill: style.numeralColor },
  });
  t.anchor.set(n.anchorX, n.anchorY);
  t.position.set(n.x, n.y);
  t.alpha = style.alpha;
  return t;
}

/** The whole crate at (0, 0): its Graphics (first child) plus its numerals. */
export function buildCrate(view: Pick<DropView, 'g'>, style: CrateStyle): Container {
  const root = new Container();
  const g = new Graphics();
  drawCrate(g, view, style);
  root.addChild(g);
  for (const n of crateLayout(view, style).numerals) root.addChild(numeralText(n, style));
  return root;
}

/** The thin adapter: one crate per drop id on the fogged `dropWorld` layer. */
export class Drops {
  private readonly sprites = new Map<string, Container>();

  constructor(private readonly layer: Container) {}

  /** Reconcile against this frame's (sanitized) drops: add new ids, remove
   *  vanished ones, leave survivors untouched — a drop never moves or changes. */
  sync(views: readonly DropView[]): void {
    const { add, remove } = reconcileLitZones(new Set(this.sprites.keys()), views);
    for (const id of remove) this.despawn(id);
    const style = crateStyle();
    for (const v of add) this.spawn(v, style);
  }

  /** Per render frame. A crate has no motion and no tint; kept for the
   *  renderer contract (and a later ruling's tell). */
  render(_nowSec: number): void {}

  /** The sprite held for an id (test seam), or null. */
  spriteOf(id: string): Container | null {
    return this.sprites.get(id) ?? null;
  }

  destroy(): void {
    for (const id of [...this.sprites.keys()]) this.despawn(id);
  }

  private spawn(v: DropView, style: CrateStyle): void {
    if (this.sprites.has(v.id)) return; // a duplicate id in one frame draws once
    const c = buildCrate(v, style);
    c.position.set(v.x, v.y);
    this.layer.addChild(c);
    this.sprites.set(v.id, c);
  }

  private despawn(id: string): void {
    const c = this.sprites.get(id);
    if (!c) return;
    c.destroy({ children: true });
    this.sprites.delete(id);
  }
}
