// Truesight nameplates (Story 1.13) — a screen-space callsign label floated
// above every truesight combatant hull (own ship + contacts). The plates live in
// their OWN container (render/stage.ts's `plate` chart layer), NOT as children of
// the heading-rotating ShipView.gfx: the text never tilts with the hull. That
// container is SCREEN-SPACE even though it is seated inside the
// camera-transformed chart stack — `applyCamera` inverts the chart transform off
// it every frame — which is what lets a plate sit between `ship` and `aim` (over
// terrain and hulls, under the reticle) while still being placed in raw screen
// pixels here.
//
// STORY 12.3 (Eric 2026-11-18, the approved bench v13) — THE PLATE IS NAME +
// HULL BAR, STACKED ON THE CORNER BRACKET. Top to bottom: the name, the hull
// health bar (render/hullBars.ts), the bracket's top edge; the bar `padPx`
// above the bracket and the name's bottom `nameGapPx` above the bar. The
// caller hands the bracket's top edge and half (render/brackets.ts
// `bracketHalfPx`), so plate and bracket can never disagree.
//
// THE NAME IS FITTED, AND EVERY NAME AT ONE ZOOM IS THE SAME SIZE (Eric: "At
// the same zoom level, all names should be in the same font size"): the size
// at which a NAME_MAX-character tracked name fits the bracket width of the
// SHORTEST hull class at this zoom (a reading of record: the four classes are
// not one length, so the shortest's bracket is the one every name is
// guaranteed to fit), capped at the hud-micro size and snapped to
// `sizeQuantPx` so the Text re-rasterizes only on a real change. Below
// `floorPx` every name switches to the 5×7 pixel font (render/pixelFont.ts),
// built ONCE per name at latch — never per frame; a name the pixel font
// cannot draw stays in the mono at the floor size. The name never hides and
// may be wider than its bracket at the floor. Name, bar and bracket each carry
// a slight static glow in their own color (`chartMarks.glowPx`).
//
// Latch discipline: a plate's text + color are resolved ONCE — the moment the
// roster name lands — then latched. A human contact whose name hasn't synced
// gets NO plate (we never render a session id); once latched, the plate
// persists even if the player later leaves the roster. Per-frame work is
// position + alpha writes, plus a font-size write or a bar redraw only when
// the snapped size or the block count actually changed.

import { Container, Graphics, Text } from 'pixi.js';
import { CONFIG, SHIP_CLASS_IDS } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { textSafe } from '../util/color.js';
import { ellipsizeName, NAME_MAX } from '../util/text.js';
import { bracketHalfPx, glowPasses } from './brackets.js';
import { drawHullBar, hullBarWidthPx } from './hullBars.js';
import { GLYPH_H, pixelCells, pixelFontCovers, pixelRing, pixelTextWidth } from './pixelFont.js';

const NP = CLIENT_CONFIG.nameplate;
const HB = CLIENT_CONFIG.hullBar;
const CM = CLIENT_CONFIG.chartMarks;

/** The LARGEST name size (px) — the hud-micro register, lifted 9 → 14 by
 *  Story 2.3 (amendment 15). Since Story 12.3 the name shrinks below it to fit
 *  the bracket, down to `nameplate.floorPx`. */
export const PLATE_FONT_PX = CLIENT_CONFIG.type.registers.hudMicro.size;

/** hud-micro tracking, in em (0.18em). */
const TRACK_EM = Number.parseFloat(CLIENT_CONFIG.type.registers.hudMicro.tracking);

/** hud-micro register in Pixi (DESIGN §Typography + amendment 15): mono,
 *  0.18em tracking, and (Story 12.3) the slight glow — a zero-distance drop
 *  shadow of `glowPx` blur in the plate's own color (set at latch). Uppercase
 *  is applied in code (Pixi has no text-transform). */
const PLATE_STYLE = {
  fontFamily: CLIENT_CONFIG.type.mono,
  fontSize: PLATE_FONT_PX,
  letterSpacing: PLATE_FONT_PX * TRACK_EM,
  dropShadow: { alpha: 1, angle: 0, blur: CM.glowPx, distance: 0, color: CLIENT_CONFIG.colors.white },
} as const;

/** Display text for a callsign: mid-ellipsized to the shared cap on the RAW name
 *  first, THEN uppercased — so the kill feed and the plate agree on which
 *  characters survive the ellipsis (the feed ellipsizes the same raw name).
 *  toUpperCase() can EXPAND code points ('ß'→'SS', 'ﬁ'→'FI'), so if the
 *  uppercased result overruns NAME_MAX we re-ellipsize the uppercased string. */
export function plateText(name: string): string {
  const up = ellipsizeName(name).toUpperCase();
  return [...up].length > NAME_MAX ? ellipsizeName(up) : up;
}

/** Plate text color: a captain's RELATION stroke's text-safe (≥4.5:1) variant
 *  (Story 10.4 — render/relationColor.ts). */
export function plateColor(stroke: number): number {
  return textSafe(stroke);
}

/** The plate a hull should show, or null when it cannot yet resolve (the latch
 *  gate): a captain needs a synced name. `stroke` is the captain's relation
 *  stroke. */
export function resolvePlate(name: string | null, stroke: number): { text: string; color: number } | null {
  if (name === null) return null;
  // Strip control chars only (a newline must never reach Pixi as a multi-line
  // plate) — KEEP format chars (\p{Cf}) so emoji ZWJ sequences survive intact.
  // A name that is empty or ALL whitespace/format chars can't latch a blank
  // plate: treat as unresolved (null) so the driver keeps retrying.
  const stripped = name.replace(/\p{Cc}/gu, '');
  if ([...stripped].every((ch) => /[\s\p{Cf}]/u.test(ch))) return null;
  return { text: plateText(stripped), color: plateColor(stroke) };
}

/** One latch step for a plate driver: given the current latch flag + resolver
 *  inputs, the plate to SET this frame (null = set nothing) and the next latch.
 *  Once latched it never re-resolves — the plate persists even if the roster
 *  entry later vanishes (name back to null). */
export function latchPlate(
  latched: boolean,
  name: string | null,
  stroke: number,
): { plate: { text: string; color: number } | null; latched: boolean } {
  if (latched) return { plate: null, latched: true };
  const plate = resolvePlate(name, stroke);
  return { plate, latched: plate !== null };
}

/** The shortest hull class's length (u) — the bracket every name must fit. */
const REF_LENGTH_U = Math.min(...SHIP_CLASS_IDS.map((id) => CONFIG.shipClasses[id].hull.length));

/** A name size for one zoom: the mono at `px`, or the 5×7 pixel font. */
export interface NameFit {
  pixel: boolean;
  /** The mono size (px) — the floor size while `pixel` (the out-of-table fallback). */
  px: number;
}

/** Pure: the name size that makes a NAME_MAX-character tracked name fit a
 *  bracket `half` px — capped at PLATE_FONT_PX, snapped DOWN to `sizeQuantPx`,
 *  and the pixel font below `floorPx`. Depends on the bracket only, never on
 *  the name. */
export function nameFitForHalf(half: number): NameFit {
  const emWidth = NAME_MAX * (NP.advanceEm + TRACK_EM); // tracking counted on every char: never overruns
  const q = NP.sizeQuantPx;
  const fit = (2 * half) / emWidth;
  const px = Math.min(PLATE_FONT_PX, q > 0 ? Math.floor(fit / q) * q : fit);
  return px < NP.floorPx || !Number.isFinite(px) ? { pixel: true, px: NP.floorPx } : { pixel: false, px };
}

/** Pure: the one name size for every plate at `zoom` px per u. */
export function nameFitAt(zoom: number): NameFit {
  return nameFitForHalf(bracketHalfPx(REF_LENGTH_U * zoom));
}

/** Pure: the hull bar's top edge and the name's bottom edge (screen y) for a
 *  bracket whose top edge is at `bracketTopY`. */
export function plateStack(bracketTopY: number): { barTop: number; nameBottom: number } {
  const barTop = bracketTopY - HB.padPx - HB.heightPx;
  return { barTop, nameBottom: barTop - NP.nameGapPx };
}

/** What a plate is placed with each frame beyond its position and alpha. */
export interface PlateLook {
  /** The bracket's half-box (screen px) — `bracketHalfPx` of the hull. */
  halfPx: number;
  /** Camera zoom (px per u) — the one name size for this frame. */
  zoom: number;
  /** Hull blocks lit (`hullBlocks`), or null with none known (no bar). */
  blocks: number | null;
}

const DEFAULT_LOOK: PlateLook = { halfPx: CM.bracketHalfPx, zoom: 1, blocks: null };

/** One hull's plate: the mono Text, the pixel-font Graphics (null when the
 *  name has a character outside the table), the bar, and what was last drawn. */
interface Plate {
  text: Text;
  pixel: Graphics | null;
  bar: Graphics;
  px: number;
  barW: number;
  barBlocks: number;
}

/** Paint `name`'s 5×7 pixels (glow rings under the lit pixels) in `color`
 *  onto `g`, bottom-center anchored at (0, 0): integer px, one per font pixel. */
function paintPixelName(g: Graphics, name: string, color: number): void {
  g.clear();
  const cells = pixelCells(name);
  const left = -Math.round(pixelTextWidth([...name].length) / 2);
  const top = -GLYPH_H;
  const rings = glowPasses().map(([reach, alpha]) => [Math.round(reach), alpha] as const);
  for (let r = 0; r < rings.length; r++) {
    const [reach, alpha] = rings[r];
    const inner = r + 1 < rings.length ? rings[r + 1][0] : 0;
    const ring = pixelRing(cells, reach, inner);
    for (let i = 0; i < ring.length; i += 2) g.rect(left + ring[i], top + ring[i + 1], 1, 1);
    if (ring.length > 0) g.fill({ color, alpha });
  }
  for (let i = 0; i < cells.length; i += 2) g.rect(left + cells[i], top + cells[i + 1], 1, 1);
  if (cells.length > 0) g.fill({ color, alpha: 1 });
}

/**
 * The screen-space plate container: per hull id a Text, a pixel-font Graphics
 * and a bar Graphics, created lazily on resolve and destroyed with the contact
 * view. Thin over the pure helpers above — it only owns Pixi lifecycle.
 */
export class NameplateLayer {
  private plates = new Map<string, Plate>();
  private fitZoom = Number.NaN;
  private fit: NameFit = nameFitAt(1);

  constructor(private readonly layer: Container) {}

  /** True once a plate has been created (latched) for this id. */
  has(id: string): boolean {
    return this.plates.has(id);
  }

  /** Create (lazily) + latch a plate's text/color — called ONCE by the driver
   *  when the name/hue first resolve. Diff-before-assign guards the text (Pixi
   *  re-rasterizes on assignment); fill is a cheap per-plate style write. The
   *  pixel-font name is built here, once. */
  set(id: string, text: string, color: number): void {
    let p = this.plates.get(id);
    if (!p) {
      const t = new Text({ text, style: PLATE_STYLE });
      t.anchor.set(0.5, 1); // bottom-center: the name floats above the bar
      const bar = new Graphics();
      this.layer.addChild(bar);
      this.layer.addChild(t);
      p = { text: t, pixel: null, bar, px: PLATE_FONT_PX, barW: Number.NaN, barBlocks: Number.NaN };
      this.plates.set(id, p);
    } else if (p.text.text !== text) {
      p.text.text = text;
    }
    p.text.style.fill = color;
    p.text.style.dropShadow = { ...PLATE_STYLE.dropShadow, color };
    this.latchPixel(p, text, color);
  }

  /** Build (or rebuild, on a text/color change) the pixel-font name — never per frame. */
  private latchPixel(p: Plate, text: string, color: number): void {
    if (!pixelFontCovers(text)) {
      p.pixel?.destroy();
      p.pixel = null;
      return;
    }
    if (p.pixel === null) {
      p.pixel = new Graphics();
      p.pixel.visible = false;
      this.layer.addChild(p.pixel);
    }
    paintPixelName(p.pixel, text, color);
  }

  /**
   * Per frame: the hull's screen x, the bracket's TOP EDGE (screen y), the
   * plate's alpha, and its look (bracket half, zoom, hull blocks). No
   * text/color churn. A no-op for an id without a latched plate.
   */
  place(id: string, x: number, bracketTopY: number, alpha: number, look: PlateLook = DEFAULT_LOOK): void {
    const p = this.plates.get(id);
    if (!p) return;
    const shown = alpha > 0;
    const { barTop, nameBottom } = plateStack(bracketTopY);
    this.placeName(p, x, nameBottom, alpha, shown, look.zoom);
    this.placeBar(p, x, barTop, alpha, shown && look.blocks !== null, look);
  }

  private placeName(p: Plate, x: number, bottom: number, alpha: number, shown: boolean, zoom: number): void {
    const fit = this.fitAt(zoom);
    const pixel = fit.pixel && p.pixel !== null;
    const t = p.text;
    if (!pixel && fit.px !== p.px) {
      p.px = fit.px;
      t.style.fontSize = fit.px;
      t.style.letterSpacing = fit.px * TRACK_EM;
    }
    t.position.set(x, bottom);
    t.alpha = alpha;
    t.visible = shown && !pixel;
    if (p.pixel === null) return;
    p.pixel.position.set(Math.round(x), Math.round(bottom));
    p.pixel.alpha = alpha;
    p.pixel.visible = shown && pixel;
  }

  private placeBar(p: Plate, x: number, top: number, alpha: number, shown: boolean, look: PlateLook): void {
    p.bar.visible = shown;
    if (!shown || look.blocks === null) return;
    const w = hullBarWidthPx(look.halfPx);
    if (w !== p.barW || look.blocks !== p.barBlocks) {
      drawHullBar(p.bar, w, look.blocks);
      p.barW = w;
      p.barBlocks = look.blocks;
    }
    p.bar.position.set(x, top);
    p.bar.alpha = alpha;
  }

  /** The one name size for `zoom`, recomputed only when the zoom moved. */
  private fitAt(zoom: number): NameFit {
    if (zoom !== this.fitZoom) {
      this.fitZoom = zoom;
      this.fit = nameFitAt(zoom);
    }
    return this.fit;
  }

  /** Hide a resolved plate without destroying it (own hull on spectate/sunk). */
  hide(id: string): void {
    const p = this.plates.get(id);
    if (!p) return;
    p.text.visible = false;
    p.bar.visible = false;
    if (p.pixel) p.pixel.visible = false;
  }

  /** Destroy a plate (its contact view was pruned). */
  remove(id: string): void {
    const p = this.plates.get(id);
    if (!p) return;
    p.text.destroy();
    p.bar.destroy();
    p.pixel?.destroy();
    this.plates.delete(id);
  }
}
