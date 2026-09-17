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
// The `HudBar` container class that composes the globes, the slot row and the
// strip lives at the FOOT of this file, beside the geometry it lays out with.
// Its four children import `microScale` back out of here, which is a module
// cycle by construction and a safe one: `microScale` is a function DECLARATION,
// so it is initialised at instantiation time, before any module body runs.

import { Container } from 'pixi.js';
import { CONSUMABLE_SLOTS, SLOT_COUNT } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import type { ScreenPoint } from '../input/mouse.js';
import { HpGlobe, type HpGlobeInput } from './hpGlobe.js';
import { HelmGlobe, type HelmGlobeInput } from './helmGlobe.js';
import { XpStrip, type XpView } from './xpStrip.js';
import { Hotbar, type HotbarView } from './hotbar.js';

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

// --- THE BAR ITSELF ---------------------------------------------------------

/**
 * Everything ONE frame of the bar needs, assembled at main.ts's composition
 * seam (`hudBarView`) and never re-derived here: this class is a COMPOSER, not
 * a second place where own-ship state is interpreted.
 *
 * `dim` is the one field the bar itself acts on (ruling 9): while the refit
 * window is open OR the start line is held, the TWO dim groups — the five
 * weapon squares and the framed belt, which together are exactly the Hotbar's
 * root — drop to `hudBar.dimAlpha`. The globes and the strip stay at full: a
 * suspended trigger is not a reason to stop being able to read your hull, your
 * heading or your bank.
 */
export interface HudBarView {
  /** The slot row + belt (render/hotbar.ts). Its own `dim` is overwritten. */
  slots: HotbarView;
  hp: HpGlobeInput;
  /** The amber corollary's verdict for the HP channel (`hpGlobeHoldsLit`). */
  hpHold: boolean;
  helm: HelmGlobeInput;
  xp: XpView;
  /** A higher attention tier is active: the bank chip holds at its DIM keyframe. */
  freeze: boolean;
  /** `combatLocked(g)` — the refit window is open or the start line is held. */
  dim: boolean;
}

/**
 * THE HUD BAR (Story 8.6, ruling 9) — one Container on the HUD layer owning the
 * four surfaces that used to be three corners: the HP globe, the slot row (with
 * its belt frame), the helm globe and the XP strip.
 *
 * It owns exactly three things and delegates everything else:
 *   1. the LAYOUT, recomputed only when the viewport moves (`hudBarLayout` is
 *      pure, so a cache keyed on w/h is the whole invalidation rule);
 *   2. VISIBILITY as ONE object — the bar shows while the player is conning a
 *      hull and is gone at founder, rather than each member deciding for itself
 *      (which is how the three corners drifted apart in the first place);
 *   3. the DIM, which it applies by handing the Hotbar its `dim` flag and by
 *      touching nothing else.
 *
 * No own-ship interpretation lives here: every number arrives on `HudBarView`.
 */
export class HudBar {
  private readonly root = new Container();
  readonly hpGlobe: HpGlobe;
  readonly helmGlobe: HelmGlobe;
  readonly xpStrip: XpStrip;
  readonly hotbar: Hotbar;
  /** The layout this bar last computed, and the viewport it was computed for.
   *  Kept across `hide()`: it is pure geometry, not a statement about whether
   *  anything is on screen (the CLICK gate is the Hotbar's own cache, which
   *  hide() does drop). */
  private cached: HudBarLayout | null = null;
  private cachedW = -1;
  private cachedH = -1;

  constructor(hudLayer: Container) {
    hudLayer.addChild(this.root);
    // Child order IS draw order: the Hotbar goes on LAST because its hover
    // tooltip is its own child and must paint over the globes it reaches across.
    this.hpGlobe = new HpGlobe(this.root);
    this.helmGlobe = new HelmGlobe(this.root);
    this.xpStrip = new XpStrip(this.root);
    this.hotbar = new Hotbar(this.root);
  }

  /**
   * One frame. `screenW`/`screenH` are LOGICAL (already divided by the UI
   * scale); `cursor` is the pointer in that same space, or null when it is
   * outside the window; `nowSec` is the server-clock estimate in seconds (the
   * clock every breath on the bar rides) and `nowMs` the frame's monotonic one.
   */
  update(
    view: HudBarView,
    screenW: number,
    screenH: number,
    cursor: ScreenPoint | null,
    nowSec: number,
    nowMs: number,
    uiScale: number,
  ): void {
    this.root.visible = true;
    const layout = this.layoutFor(screenW, screenH);
    this.hotbar.update({ ...view.slots, dim: view.dim }, layout, cursor, nowMs, uiScale);
    this.hpGlobe.update(view.hp, layout.hpGlobe, nowSec, view.hpHold, uiScale);
    this.helmGlobe.update(view.helm, layout.helmGlobe, nowSec, uiScale);
    this.xpStrip.update(view.xp, layout.strip, nowSec, view.freeze, nowMs, uiScale);
  }

  /** The layout for this viewport, recomputed ONLY when the viewport moved. */
  private layoutFor(screenW: number, screenH: number): HudBarLayout {
    if (this.cached === null || screenW !== this.cachedW || screenH !== this.cachedH) {
      this.cached = hudBarLayout(screenW, screenH);
      this.cachedW = screenW;
      this.cachedH = screenH;
    }
    return this.cached;
  }

  /**
   * The bar is GONE (founder, spectate, the reveal, return to port). Every
   * member is hidden and the chip's breath state is dropped with it, so the
   * next life starts cold.
   */
  hide(): void {
    this.root.visible = false;
    this.hotbar.hide(); // also drops the click layout: a hidden bar routes nothing
    this.hpGlobe.hide();
    this.helmGlobe.hide();
    this.xpStrip.hide();
  }

  /**
   * The bar is hidden for a TRANSIENT frame gap (the forceSnap/pose gap behind
   * a respawn or the P netcode toggle): visually identical to `hide()`, but the
   * XP chip's breath state SURVIVES it. A full hide there would make the very
   * next frame look like a new bank and re-arm a decayed chip's window off a
   * gap the player never saw (see XpStrip.hideTransient).
   */
  hideTransient(): void {
    this.root.visible = false;
    this.hotbar.hide();
    this.hpGlobe.hide();
    this.helmGlobe.hide();
    this.xpStrip.hideTransient();
  }

  /** The refit window opened (TAB): re-arm the banked-level chip's breath. */
  rearmBank(): void {
    this.xpStrip.rearm();
  }

  /** The slot under a screen point (HUD space), or null — the click gate. */
  slotAt(p: ScreenPoint): number | null {
    return this.hotbar.slotAt(p);
  }

  /** The layout this bar last computed; null before the first frame. */
  get layout(): HudBarLayout | null {
    return this.cached;
  }

  /**
   * The bar's TOP edge, as the last laid-out frame resolved it. 0 before the
   * first layout, which only a caller that never rendered the bar can see.
   *
   * It used to feed `Hud.update`'s satellite column; epic-8 amendment 38 moved
   * IN STORM and the victim tells under the CHROME bar, so nothing consumes this
   * today. It stays as the bar's one published geometry seam (and its pin) —
   * anything that needs to seat itself against the bar reads it here rather than
   * re-deriving the layout.
   */
  get barTop(): number {
    return this.cached === null ? 0 : this.cached.bar.y;
  }
}
