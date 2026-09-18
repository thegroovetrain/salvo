// Procedural equipment icons (Story 2.2) — LINEWORK ONLY, one glyph per
// EquipmentId, in the mock's inline `currentColor` vector idiom. No image
// assets, no fills that would read as a panel: a hotbar slot is a floating
// outline with water showing through it.
//
// ONE GLYPH SOURCE, TWO SURFACES (Story 8.7, ruling 11). Until 8.7 each glyph
// was a closure that issued Pixi `moveTo`/`lineTo` calls, which meant the
// linework could only ever be drawn on the canvas. The refit card's 40px icon
// box is DOM, so the same drawing now has to reach an `<svg>` as well — and
// copying the coordinates into a second table is exactly how two surfaces start
// disagreeing about what a torpedo looks like.
//
// So a glyph is DATA: a list of primitives in a UNIT FRAME — centred on (0,0),
// extending to ±1 — and the two emitters scale it:
//
//   • `drawEquipmentIcon` strokes it into a Pixi Graphics inside a `size` box
//     (the hotbar square, 28px / 22px on the belt);
//   • `equipmentGlyphSvg` emits the same primitives as an `<svg>` with a
//     `-1 -1 2 2` viewBox, which the refit card drops into its icon box.
//
// A line with NO glyph draws NOTHING and throws nothing — the eight unbuilt
// weapons (Stories 8.13-8.16), every ladder, every add-on and every CONSUMABLE.
// Drawing linework for kit nobody has played would be inventing art; the card's
// icon box simply renders empty, which is ledgered for the icon pass UX-DR50
// names.

import type { Graphics, StrokeInput } from 'pixi.js';
import { isConsumableId, type EquipmentId, type SlotItemId } from '@salvo/shared';

/** A point in the unit glyph frame: (0,0) is the icon box's centre, ±1 its edge. */
export type GlyphPoint = readonly [number, number];

/** One primitive of a glyph's linework. `path` is an open polyline (a closed
 *  shape simply repeats its first point, exactly as the Pixi code always did);
 *  `circle` is the one curved primitive the set needs. */
export type GlyphPart =
  | { readonly kind: 'path'; readonly pts: readonly GlyphPoint[] }
  | { readonly kind: 'circle'; readonly c: GlyphPoint; readonly r: number };

/** One glyph: its primitives, in draw order. */
export type GlyphPaths = readonly GlyphPart[];

/** Shorthand builders — the tables below read as coordinates, not as calls. */
function path(...pts: GlyphPoint[]): GlyphPart {
  return { kind: 'path', pts };
}
function circle(cx: number, cy: number, r: number): GlyphPart {
  return { kind: 'circle', c: [cx, cy], r };
}

/** A ring of `n` radial spokes from `inner` to `outer` — the mine's spikes and
 *  the star shell's rays, whose only difference is their radii. */
function spokes(n: number, inner: (i: number) => number, outer: (i: number) => number): GlyphPart[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i * Math.PI) / 4;
    return path([Math.cos(a) * inner(i), Math.sin(a) * inner(i)], [Math.cos(a) * outer(i), Math.sin(a) * outer(i)]);
  });
}

/** Deck gun: breech block, angled barrel, a shell dot leaving the muzzle. */
const gun: GlyphPaths = [
  path([-0.7, 0.55], [-0.15, 0.55], [-0.15, 0.05], [-0.7, 0.05], [-0.7, 0.55]),
  path([-0.45, 0.05], [0.65, -0.75]),
  path([-0.15, 0.3], [0.95, -0.5]),
  circle(0.62, -0.95, 0.14),
];

/** Torpedo: elongated body with a pointed nose, tail fins, wake ticks. */
const torpedo: GlyphPaths = [
  path([-0.85, -0.34], [0.5, -0.34], [0.95, 0], [0.5, 0.34], [-0.85, 0.34], [-0.85, -0.34]),
  path([-0.85, -0.34], [-1, -0.62]),
  path([-0.85, 0.34], [-1, 0.62]),
  path([-0.35, -0.34], [-0.35, 0.34]),
];

/** Mine: spiked sphere. */
const mine: GlyphPaths = [circle(0, 0, 0.52), ...spokes(8, () => 0.52, () => 0.92)];

/** Speed boost: a double chevron. */
const boost: GlyphPaths = [-0.5, 0.05].map((dx) => path([dx, -0.7], [dx + 0.55, 0], [dx, 0.7]));

/** Broadside barrage: twin barrels over a turret block. */
const broadside: GlyphPaths = [
  path([-0.7, 0.6], [0.7, 0.6], [0.5, 0.05], [-0.5, 0.05], [-0.7, 0.6]),
  path([-0.32, 0.05], [-0.32, -0.95]),
  path([0.32, 0.05], [0.32, -0.95]),
];

/** Star shells: a burst — eight rays around a small core. */
const starShells: GlyphPaths = [
  circle(0, 0, 0.22),
  ...spokes(8, (i) => (i % 2 === 0 ? 0.4 : 0.36), (i) => (i % 2 === 0 ? 0.95 : 0.68)),
];

/**
 * Radar buoy: a spar buoy — waterline, mast, and a DIAMOND radar-reflector
 * daymark at the masthead.
 *
 * Redrawn in Story 7-5 wave 2 to share the on-water marker's shape language
 * (render/buoys.ts BUOY_MARKER) rather than merely being "not a mine": the
 * shipped glyph hung a pennant off the mast, which is nothing the chart ever
 * draws. The mine glyph is a SPIKED SPHERE and this one has no round part at
 * all, so Eric's *"the icon needs to be distinguished from the mines a bit
 * more"* holds in the hotbar as well as on the water.
 */
const radarBuoy: GlyphPaths = [
  path([-0.75, 0.85], [0.75, 0.85]),
  path([0, 0.85], [0, -0.28]),
  path([0, -0.7], [0.42, -0.28], [0, 0.14], [-0.42, -0.28], [0, -0.7]),
];

/**
 * The glyph table. PARTIAL over `EquipmentId` since Story 8.1 widened that type
 * to catalog v3's thirteen weapons plus the legacy ids: the seven ids whose
 * MODULES do not exist yet (Stories 8.13-8.16) get no glyph, because drawing
 * linework for a weapon nobody has played would be inventing art.
 */
const GLYPHS: Partial<Record<EquipmentId, GlyphPaths>> = {
  gun,
  heavyTorpedo: torpedo,
  navalMines: mine,
  boost,
  broadside,
  starShells,
  radarBuoy,
};

/**
 * THE one lookup, over either kind of slot content (Story 8.7, ruling 1). A
 * CONSUMABLE is narrowed away FIRST — `GLYPHS` is keyed by `EquipmentId` and a
 * consumable entry in it would be a lie — and there is no consumable linework in
 * 8.7 anyway, so a stocked belt square and a consumable card's icon box both
 * render empty. Null, never a throw: an unbuilt id has no art, not a crash.
 */
export function glyphPaths(id: string): GlyphPaths | null {
  if (isConsumableId(id)) return null;
  return Object.hasOwn(GLYPHS, id) ? GLYPHS[id as EquipmentId] ?? null : null;
}

/**
 * The EMPTY slot's centred `—` (an em-dash rule), drawn in the same linework
 * family as every equipment glyph.
 *
 * IT REPLACED A `+` IN STORY 8.5 (UX-DR41). The plus said "add something here",
 * which was fair when exactly one slot was fillable and a refit was always
 * pending; with seven empty slots at 0:00 it read as seven invitations. The
 * ruled empty state is a dashed outline and a dash — *"the empty IS the state"*
 * — with no words beside it.
 */
export function drawDashGlyph(g: Graphics, cx: number, cy: number, size: number, style: StrokeInput): void {
  const r = size / 2;
  g.moveTo(cx - r, cy).lineTo(cx + r, cy);
  g.stroke(style);
}

/** Draw one glyph centered at (cx, cy) inside a `size`-px box. A line with no
 *  glyph — an unbuilt weapon, or any CONSUMABLE — draws nothing and throws
 *  nothing (ruling 15: no crash, no word, no invented art). */
export function drawEquipmentIcon(
  g: Graphics,
  id: SlotItemId,
  cx: number,
  cy: number,
  size: number,
  style: StrokeInput,
): void {
  const parts = glyphPaths(id);
  if (parts === null) return;
  const r = size / 2;
  for (const part of parts) {
    if (part.kind === 'circle') {
      g.circle(cx + part.c[0] * r, cy + part.c[1] * r, part.r * r);
      continue;
    }
    part.pts.forEach(([x, y], i) => {
      if (i === 0) g.moveTo(cx + x * r, cy + y * r);
      else g.lineTo(cx + x * r, cy + y * r);
    });
  }
  g.stroke(style);
}

/** The SVG namespace — DOM `<svg>` children must be created in it or they
 *  render as unknown HTML elements. */
const SVG_NS = 'http://www.w3.org/2000/svg';

/** The stroke width the DOM emitter draws at, in UNIT-FRAME units: the Pixi
 *  side strokes 1.5px inside a 28px box, and `2 / 28 * 1.5` is that same weight
 *  once the viewBox is 2 units wide. Derived, so the two surfaces stay one
 *  drawing rather than two. */
const SVG_STROKE_W = (1.5 * 2) / 28;

/** One primitive as an SVG `d` fragment / element. */
function svgPart(part: GlyphPart): SVGElement {
  if (part.kind === 'circle') {
    const el = document.createElementNS(SVG_NS, 'circle');
    el.setAttribute('cx', String(part.c[0]));
    el.setAttribute('cy', String(part.c[1]));
    el.setAttribute('r', String(part.r));
    return el;
  }
  const el = document.createElementNS(SVG_NS, 'path');
  el.setAttribute('d', part.pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' '));
  return el;
}

/**
 * The DOM half of the ONE glyph source (ruling 11): the same primitives as an
 * `<svg>` sized to `size` px, stroked in `currentColor` so the refit card's
 * rest/armed state cascades into it exactly as the hotbar's tint does.
 *
 * Returns null when the line has no glyph, which is the card's signal to leave
 * its icon box EMPTY rather than to draw a placeholder.
 */
export function equipmentGlyphSvg(id: string, size: number): SVGSVGElement | null {
  const parts = glyphPaths(id);
  if (parts === null) return null;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '-1 -1 2 2');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', String(SVG_STROKE_W));
  for (const part of parts) svg.appendChild(svgPart(part));
  return svg;
}
