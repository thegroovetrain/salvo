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
// A line with NO glyph draws NOTHING and throws nothing — every ladder, every
// add-on and every CONSUMABLE without a module behind it.
//
// STORY 8.17 DREW TWO (amendment 135(j), same DRAFT status): PHOSPHOR SHELLS
// (flame tongues on a waterline) and FLASH SHELLS (a struck-through eye).
//
// STORY 8.16 DREW THREE MORE, for the belt (amendment 124(f), same DRAFT
// status): SHIELD BLOCK (a heater-shield outline), CHAFF (a scatter of short
// strokes) and DECOY BUOY (the on-water spar-buoy marker the deleted radar
// buoy's glyph already drew).
//
// STORY 8.15 DREW FOUR (epic-8 amendment 110 — IMPLEMENTER DRAFTS, ledgered for
// Eric's eye on staging): the MACHINE GUN (a breech firing a stream of short
// dashes), the FLAK GUN (a jagged starburst), INSTANT RELOAD (a circular arrow)
// and DAMAGE CUT (a hexagon halved down the middle). The missile and monitor
// are CUT (amendment 89e) and never had glyphs.
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

/**
 * Machine gun (Story 8.15 DRAFT, amendment 110): a breech block bottom-left, a
 * short barrel, and a STREAM of three short dashes leaving the muzzle along the
 * same bearing — the held-fire tracer stream, where the cannon has one shell.
 */
const machineGun: GlyphPaths = [
  path([-0.95, 0.95], [-0.45, 0.95], [-0.45, 0.45], [-0.95, 0.45], [-0.95, 0.95]),
  path([-0.6, 0.45], [-0.2, 0.05]),
  path([-0.05, -0.1], [0.15, -0.3]),
  path([0.3, -0.45], [0.5, -0.65]),
  path([0.65, -0.8], [0.85, -1]),
];

/**
 * Flak (Story 8.15 DRAFT, amendment 110): an AIR-BURST — a jagged eight-point
 * starburst outline, closed. Deliberately NOT the star shell's core-and-rays:
 * one is a flare that lights, the other a shell that bursts.
 */
const flak: GlyphPaths = [
  path(
    ...Array.from({ length: 17 }, (_, i): GlyphPoint => {
      const a = (i * Math.PI) / 8 - Math.PI / 2;
      const r = i % 2 === 0 ? 0.95 : 0.42;
      return [Math.cos(a) * r, Math.sin(a) * r];
    }),
  ),
];

/** Points on a circle of radius `r` from angle `a0` to `a1` (rad), `n` steps. */
function arcPts(r: number, a0: number, a1: number, n: number): GlyphPoint[] {
  return Array.from({ length: n + 1 }, (_, i): GlyphPoint => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [Math.cos(a) * r, Math.sin(a) * r];
  });
}

/**
 * Instant reload (Story 8.15 DRAFT, amendment 110): a CIRCULAR ARROW — a
 * three-quarter ring with an arrowhead at its leading end (the universal
 * "reload / refresh" mark).
 */
const INSTANT_RELOAD_ARC = arcPts(0.7, -Math.PI / 3, (4 * Math.PI) / 3, 14);
const instantReload: GlyphPaths = (() => {
  const [hx, hy] = INSTANT_RELOAD_ARC[INSTANT_RELOAD_ARC.length - 1];
  return [path(...INSTANT_RELOAD_ARC), path([hx - 0.32, hy - 0.08], [hx, hy], [hx + 0.08, hy - 0.32])];
})();

/**
 * Damage cut (Story 8.15 DRAFT, amendment 110): a HALVED HEXAGON — an armour
 * plate outline split down the middle, one half hatched: incoming damage cut
 * in two.
 */
const HEX = arcPts(0.9, -Math.PI / 2, (3 * Math.PI) / 2, 6);
const damageCut: GlyphPaths = [
  path(...HEX),
  path([0, -0.9], [0, 0.9]),
  path([0.12, -0.45], [0.55, -0.7]),
  path([0.12, 0.05], [0.78, -0.33]),
  path([0.12, 0.55], [0.7, 0.22]),
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
 * Phosphor shells (Story 8.17 DRAFT, epic-8 amendment 135(j) — the amendment
 * 110 precedent, ledgered for Eric's eye on staging): WATER ON FIRE — three
 * flame tongues standing on a waterline, the tall one centred. Deliberately not
 * the star shell's rayed burst: one lights, the other burns.
 */
const phosphorShells: GlyphPaths = [
  path([-0.95, 0.8], [0.95, 0.8]),
  path([-0.3, 0.8], [-0.3, 0.15], [0, -0.9], [0.3, 0.15], [0.3, 0.8]),
  path([-0.8, 0.8], [-0.8, 0.45], [-0.62, 0.05], [-0.45, 0.45], [-0.45, 0.8]),
  path([0.45, 0.8], [0.45, 0.45], [0.62, 0.05], [0.8, 0.45], [0.8, 0.8]),
];

/**
 * The glyph table — TOTAL over `EquipmentId` since Story 8.15 built the last
 * two guns and the two new Shifts (the missile and the monitor, which never
 * had modules, are CUT). It stays typed `Partial` so a future id with no module
 * yet can land without inventing art; the lookup answers null for it.
 */
const GLYPHS: Partial<Record<EquipmentId, GlyphPaths>> = {
  gun,
  machineGun,
  flak,
  instantReload,
  damageCut,
  // THE FAMILY GLYPHS ARE REUSED (Story 8.13, UX-DR50's icon pass stays
  // ledgered): a light torpedo is a torpedo and a captive or fouling mine is a
  // mine, so each new line takes its family's shipped linework rather than art
  // invented here. The squares are already distinguished by their key, their
  // tier numeral and their tooltip; a drawn distinction between three mines is
  // a DESIGN decision, and it belongs to the icon pass Eric owns.
  lightTorpedo: torpedo,
  heavyTorpedo: torpedo,
  navalMines: mine,
  captiveMines: mine,
  foulingMines: mine,
  boost,
  broadside,
  starShells,
  phosphorShells, // Story 8.17 DRAFT (above)
};

/**
 * Shield block (Story 8.16 DRAFT, epic-8 amendment 124(f)): a SHIELD OUTLINE —
 * a flat-topped heater shield, closed, with no inner mark. Deliberately not
 * DAMAGE CUT's halved hexagon: one absorbs, the other reduces (amendment 118).
 */
const shieldBlock: GlyphPaths = [
  path([-0.72, -0.82], [0.72, -0.82], [0.72, 0.08], [0, 0.95], [-0.72, 0.08], [-0.72, -0.82]),
];

/**
 * Chaff (Story 8.16 DRAFT, epic-8 amendment 124(f)): a SCATTER of short strokes
 * at mixed angles — the foil cloud the fakes are made of. No circle and no
 * centre mark: the whole point is that nothing in it is the real thing.
 */
const chaff: GlyphPaths = [
  path([-0.85, -0.55], [-0.55, -0.75]),
  path([-0.2, -0.9], [0.1, -0.62]),
  path([0.45, -0.7], [0.85, -0.6]),
  path([-0.6, -0.05], [-0.25, 0.1]),
  path([0.15, -0.2], [0.3, 0.15]),
  path([0.6, 0.05], [0.9, 0.35]),
  path([-0.9, 0.55], [-0.6, 0.8]),
  path([-0.15, 0.55], [0.2, 0.45]),
  path([0.5, 0.65], [0.65, 0.95]),
];

/**
 * Decoy buoy (Story 8.16 DRAFT, epic-8 amendment 124(f)): the on-water SPAR
 * BUOY marker (render/decoys.ts `BUOY_MARKER`) — waterline, mast, and a DIAMOND
 * radar-reflector daymark at the masthead — so the belt square and the float on
 * the chart share one shape. It has no round part at all, so Eric's *"the icon
 * needs to be distinguished from the mines a bit more"* (said of the deleted
 * radar buoy, whose glyph this was) still holds beside the spiked sphere.
 */
const decoyBuoy: GlyphPaths = [
  path([-0.75, 0.85], [0.75, 0.85]),
  path([0, 0.85], [0, -0.28]),
  path([0, -0.7], [0.42, -0.28], [0, 0.14], [-0.42, -0.28], [0, -0.7]),
];

/**
 * Flash shells (`dazzleShells`, Story 8.17 DRAFT, epic-8 amendment 135(j)): a
 * BLINDED EYE — a lens-shaped eye outline with its pupil, struck through by one
 * diagonal. It says what the shell does to the hull it catches (sight cut to an
 * eighth), and shares no shape with the star shell's rayed burst.
 */
const dazzleShells: GlyphPaths = [
  path([-0.95, 0], [-0.5, -0.42], [0, -0.55], [0.5, -0.42], [0.95, 0], [0.5, 0.42], [0, 0.55], [-0.5, 0.42], [-0.95, 0]),
  circle(0, 0, 0.2),
  path([-0.8, 0.8], [0.8, -0.8]),
];

/**
 * Smoke screen (Story 8.18 DRAFT for Eric's eye, the amendment 124(f)
 * precedent): THREE OVERLAPPING PUFFS over a short waterline, growing as they
 * trail away to the left — the newest, smallest puff low at the stern end, the
 * oldest and biggest highest and furthest back, which is how a laid puff
 * behaves (it grows r82.5 → r165 over its life and never drifts). Every circle's
 * whole extent sits inside the ±1 box.
 */
const smokeScreen: GlyphPaths = [
  circle(0.55, 0.28, 0.26),
  circle(0.02, 0.0, 0.38),
  circle(-0.46, -0.36, 0.48),
  path([-0.3, 0.78], [0.95, 0.78]),
];

/**
 * THE CONSUMABLE half of the table. EMPTY until Story 8.13, because no belt
 * line had a weapon behind it: a stocked square and a consumable card's icon
 * box both rendered blank, which was the honest answer for an id with no
 * module.
 *
 * THE SUPERCAV TORPEDO IS THE FIRST ENTRY (epic-8 amendment 74). It is a
 * consumable that launches a real fish, click-aimed inside a bow sector like
 * any other torpedo, so it takes the TORPEDO FAMILY glyph for the same reason
 * the light torpedo does. DEPTH CHARGE gets none: it is a STUB (amendment 83),
 * never dealt, with no mechanism to draw — the same blank every other stub
 * consumable renders.
 */
const CONSUMABLE_GLYPHS: Partial<Record<string, GlyphPaths>> = {
  supercavTorpedo: torpedo,
  // Story 8.16 — the three lines that went live, each an IMPLEMENTER DRAFT for
  // Eric's eye on staging (amendment 124(f), the amendment 110 precedent).
  shieldBlock,
  chaff,
  decoyBuoy,
  dazzleShells, // FLASH SHELLS — Story 8.17 DRAFT (above)
  smokeScreen, // Story 8.18 DRAFT (above)
};

/**
 * THE one lookup, over either kind of slot content (Story 8.7, ruling 1). The
 * two id spaces stay DISJOINT — `GLYPHS` is keyed by `EquipmentId` and a
 * consumable entry in it would be a lie — so a consumable is narrowed away
 * first and answered from its own table. Null, never a throw: an unbuilt id has
 * no art, not a crash.
 */
export function glyphPaths(id: string): GlyphPaths | null {
  if (isConsumableId(id)) return CONSUMABLE_GLYPHS[id] ?? null;
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
