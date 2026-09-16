// THE HUD BAR's GEOMETRY SPINE (Story 8.6) — one pure function that lays the
// whole bottom-centre cluster out from the viewport, plus the one micro-type
// counter-scale the 90% UI setting needs.
//
// Direction B "TRISTRAM", ratified by Eric 2026-09-11: ONE bar replaces the
// three corners (bottom-left hotbar stack, bottom-right vitals cluster,
// bottom-left XP rail). Left to right it reads
//
//   HP globe | Gun  Shift  Q  E  R | [ 1 2 3 4 ] | helm globe
//                                   ^ the framed consumable belt
//
// with the XP strip's row beneath the whole thing. Every number comes from
// `mockups/hud-composite-3.html` through `CLIENT_CONFIG.hudBar` — the mock is
// read LITERALLY (epic-8 amendment 31: the July 1.6x micro lift does not apply
// to the bar's surfaces), with the single ruled change that BOTH globes are 104
// px (amendment 32; the mock draws the HP globe at 96).
//
// LOGICAL UNITS. main.ts divides the real screen by the UI scale before it
// hands sizes to the HUD, so `hudBarLayout` never sees a scale factor and every
// constant is pre-scale. The ONE thing that does see the scale is `microScale`
// — see its doc comment.
//
// PURE, AND RECOMPUTED PER RESIZE, NEVER CACHED ACROSS SIZES: the layout is a
// function of (screenW, screenH) and nothing else, which is what lets the tests
// pin the whole bar against the mock without instantiating Pixi.
//
// This module is the geometry SPINE only. The `HudBar` container class that
// composes the globes, the slot row and the strip is Story 8.6's later wave and
// lands here beside these functions.

import { CONSUMABLE_SLOTS, SLOT_COUNT } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';

const B = CLIENT_CONFIG.hudBar;

/** A screen-space box, in logical px. (Deliberately local: shared's `Rect`-ish
 *  geometry types are WORLD units, and the bar never touches world space.) */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A screen-space circle, in logical px — a globe's bed. */
export interface Circle {
  cx: number;
  cy: number;
  r: number;
}

/** Where one slot's key chip sits: centred horizontally on `cx`, its TOP edge
 *  at `y`. The chip's width is the glyph's (`chipMinW` .. text + 2 x `chipPadX`),
 *  which only the drawer can measure, so the layout carries an anchor and not a
 *  box. Its height is always `hudBar.chipH`. */
export interface ChipAnchor {
  cx: number;
  y: number;
}

/**
 * The XP strip's row, beneath the main row.
 *
 * `track` is the strip's MAXIMAL band — the full bar width at `hudBar.strip`
 * tall, centred on `rowY`. The strip narrows it at draw time from measured
 * text: its left edge moves to `lvX + (width of "LV n") + stripItemGap`, and
 * its right edge stops `stripItemGap` short of the tail group.
 *
 * The tail group (`chip` then, `cueGap` later, the `TAB TO REFIT` cue) is
 * RIGHT-ANCHORED to the bar's right edge, exactly as the mock's flex row ends.
 * `chip` is therefore the chip's box in the NO-CUE case (`cueLine` empty, i.e.
 * no refit can be taken) and `cueX` is the cue's RIGHT edge; when a cue renders,
 * the drawer shifts the chip left by the cue's measured width + `cueGap`. Only
 * the drawer can measure that string, so the layout stays pure.
 */
export interface StripLayout {
  track: Rect;
  lvX: number;
  chip: Rect;
  cueX: number;
  rowY: number;
}

/**
 * The whole bar, laid out. `squares` and `chips` are indexed by LOADOUT SLOT
 * (0 gun, 1 boost, 2-4 Q/E/R, 5-8 the belt), so a caller never re-derives the
 * slot order; `dimGroups` is the exactly-two boxes that drop to `dimAlpha`
 * while the refit window is open or the start line is held (the mock's
 * `.B-slots` and `.belt`) — the globes and the strip stay at full.
 */
export interface HudBarLayout {
  bar: Rect;
  hpGlobe: Circle;
  helmGlobe: Circle;
  squares: Rect[];
  chips: ChipAnchor[];
  belt: Rect;
  strip: StripLayout;
  dimGroups: Rect[];
}

/** How many squares sit in the belt frame (4) and ahead of it (5). */
const BELT_COUNT = CONSUMABLE_SLOTS.length;
const WEAPON_ROW_COUNT = SLOT_COUNT - BELT_COUNT;

/** The five-square weapon run: 5 x 54 + 4 x 8. */
const SLOT_RUN_W = WEAPON_ROW_COUNT * B.slot + (WEAPON_ROW_COUNT - 1) * B.slotGap;

/** The belt FRAME: its padding encloses four 44 px squares AND their chips. */
const BELT_W = B.beltPad.side * 2 + BELT_COUNT * B.beltSlot + (BELT_COUNT - 1) * B.beltGap;

/** A slot's full column: square, 5 px, key chip. Centred on the 104 px row. */
const SLOT_COL_H = B.slot + B.chipGap + B.chipH;
const BELT_COL_H = B.beltPad.top + B.beltSlot + B.chipGap + B.chipH + B.beltPad.bottom;

/**
 * THE BAR'S WIDTH (px) — 768, DERIVED, never a literal:
 *   104 + 16 + (5 x 54 + 4 x 8) + 16 + (8 + 4 x 44 + 3 x 6 + 8) + 16 + 104
 * The mock's `.B-hud` declares 790 with its contents centred inside; that slack
 * existed because the mock's HP globe was 96. At the ruled 104 (amendment 32)
 * the contents ARE the bar, so the bar is exactly as wide as what it holds.
 */
export const HUD_BAR_WIDTH =
  B.globe + B.globeGap + SLOT_RUN_W + B.globeGap + BELT_W + B.globeGap + B.globe;

/** The main row's height (a globe) and the bar's total height. */
const MAIN_ROW_H = B.globe;
const HUD_BAR_HEIGHT = MAIN_ROW_H + B.stripGap + B.stripRowH;

/**
 * Pure: the whole bar from the viewport, in LOGICAL px.
 *
 * Horizontally the bar is centred and its left edge is INTEGER-ROUNDED (the
 * mock's `left: 50%; transform: translateX(-50%)`, landed on a pixel so a
 * hairline frame stays a hairline). Vertically it hangs from the FLOOR: the
 * bar's bottom edge sits `hudBar.floor` above the viewport's, which is what
 * keeps the whole cluster on a short viewport — at the 1280x614 floor the main
 * row's top lands at 460 with room to spare under the chrome bar.
 *
 * The slot column (75 tall) and the belt frame (79 tall) are each centred on
 * the 104 px main row, so their half-pixel offsets are the mock's own flexbox
 * centring and are deliberately NOT rounded — rounding them would break the
 * chips out of a shared baseline.
 */
export function hudBarLayout(screenW: number, screenH: number): HudBarLayout {
  const w = HUD_BAR_WIDTH;
  const h = HUD_BAR_HEIGHT;
  const x = Math.round((screenW - w) / 2);
  const y = screenH - B.floor - h;
  const bar: Rect = { x, y, w, h };

  const r = B.globe / 2;
  const hpGlobe: Circle = { cx: x + r, cy: y + r, r };
  const helmGlobe: Circle = { cx: x + w - r, cy: y + r, r };

  const slotsX = x + B.globe + B.globeGap;
  const beltX = slotsX + SLOT_RUN_W + B.globeGap;
  const colTop = y + (MAIN_ROW_H - SLOT_COL_H) / 2;
  const belt: Rect = { x: beltX, y: y + (MAIN_ROW_H - BELT_COL_H) / 2, w: BELT_W, h: BELT_COL_H };

  const squares: Rect[] = [];
  for (let i = 0; i < WEAPON_ROW_COUNT; i++) {
    squares.push({ x: slotsX + i * (B.slot + B.slotGap), y: colTop, w: B.slot, h: B.slot });
  }
  const beltTop = belt.y + B.beltPad.top;
  for (let i = 0; i < BELT_COUNT; i++) {
    const bx = belt.x + B.beltPad.side + i * (B.beltSlot + B.beltGap);
    squares.push({ x: bx, y: beltTop, w: B.beltSlot, h: B.beltSlot });
  }
  const chips: ChipAnchor[] = squares.map((s) => ({ cx: s.x + s.w / 2, y: s.y + s.h + B.chipGap }));

  return {
    bar,
    hpGlobe,
    helmGlobe,
    squares,
    chips,
    belt,
    strip: stripLayout(bar),
    dimGroups: [{ x: slotsX, y: colTop, w: SLOT_RUN_W, h: SLOT_COL_H }, belt],
  };
}

/** Pure: the XP strip's row, hung under the main row. See `StripLayout`. */
function stripLayout(bar: Rect): StripLayout {
  const rowY = bar.y + MAIN_ROW_H + B.stripGap + B.stripRowH / 2;
  const right = bar.x + bar.w;
  return {
    track: { x: bar.x, y: rowY - B.strip / 2, w: bar.w, h: B.strip },
    lvX: bar.x,
    chip: { x: right - B.bankChip, y: rowY - B.bankChip / 2, w: B.bankChip, h: B.bankChip },
    cueX: right,
    rowY,
  };
}

/**
 * Pure: the factor a 9 px HUD Text must scale itself by so it still RENDERS at
 * 9 px (DESIGN.md: "the 90% setting scales geometry and exempts the micro type
 * tier").
 *
 * The whole HUD scales as ONE container, so at the 90% UI setting a 9 px glyph
 * would come out at 8.1 px — under the ratified mono floor. Counter-scaling the
 * six 9 px registers about their own anchor is the smallest change that honours
 * "geometry scales, micro type does not"; a second, unscaled HUD layer would
 * fork the coordinate space for the sake of six labels.
 *
 * ONLY below 1: at 100% and 125% the setting is already at or above the floor
 * and the type rides the geometry, so this returns exactly 1 and no Text is
 * touched. The counter-scaled glyph must still FIT its scaled box (the
 * container-fit law, epic-2 amendment 47), which is what the 14.4 px chip pin
 * measures.
 */
export function microScale(uiScale: number): number {
  return Number.isFinite(uiScale) && uiScale > 0 && uiScale < 1 ? 1 / uiScale : 1;
}
