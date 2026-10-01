// THE SLOT TOOLTIP — the hover panel that carries everything the HUD bar's
// squares no longer say out loud (Story 8.6 deleted the label column; UX-DR40/41
// left the square with state, seconds and counts and nothing else).
//
// SPLIT OUT OF render/hotbar.ts IN STORY 8.7 (ruling 13). `hotbar.ts` is the
// SQUARES and this file is the PANEL; epic-8 amendment 42 froze its WIDTH, type
// and notch exactly where they shipped.
//
// CYCLE 157 (Eric rulings 2026-09-30, epic-8 amendments 178/179) RE-CUT THE
// CONTENT TO NUMBERS: *"What I want to see when I hover over my weapon are the
// weapon's actual stats/numbers. One per line."* The prose description and the
// accrued-card build list (with its `— SHIP —` divider and `+n MORE` trim) are
// DELETED. The panel is now a heading — the name and the amber interaction
// line — over the hovered thing's LIVE stat table, one `LABEL value` per line,
// in the refit card's own row vocabulary (ui/boonCopy.ts is the one builder).
// Hovering the HP GLOBE opens the same panel for the hull itself: the class
// name over `SHIP` and the five ship stats (amendment 179). The helm globe
// stays silent.
//
// The Pixi shell that paints this model still lives in `hotbar.ts`: it draws
// into the bar's own container and shares the slot geometry. What lives here is
// the pure core, which is what the tests measure.

import { isConsumableId, type EffectiveStats, type EquipmentId, type ShipClassId, type SlotItemId } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import {
  boonName,
  consumableStatRows,
  equipmentStatRows,
  shipStatRows,
  statValueText,
  type CardStatRow,
} from '../ui/boonCopy.js';
import { CLASS_DISPLAY_NAMES } from '../ui/classNames.js';
import { monoTextWidth, monoWrapLines } from '../ui/refitCardFit.js';
import type { Rect } from './hudBar.js';
import { equipmentInfo, interactionLine, lineForEquipment } from './equipmentInfo.js';

const H = CLIENT_CONFIG.hotbar;

// --- pure core: hover + tooltip -------------------------------------------------

/** What the pointer is resting on: a slot index, the HP globe (`'ship'` —
 *  amendment 179), or nothing. */
export type HoverTarget = number | 'ship' | null;

/** Hover dwell state (which target, since when). */
export interface HoverState {
  target: HoverTarget;
  since: number;
}

export const NO_HOVER: HoverState = { target: null, since: 0 };

/** Pure: advance the hover dwell — the clock restarts whenever the target changes. */
export function nextHover(prev: HoverState, target: HoverTarget, nowMs: number): HoverState {
  if (target === prev.target) return prev;
  return { target, since: nowMs };
}

/** Pure: has the hover dwelled long enough to show the tooltip? */
export function hoverReady(state: HoverState, nowMs: number, delayMs = H.tooltip.delayMs): boolean {
  return state.target !== null && nowMs - state.since >= delayMs;
}

/**
 * Pure: should the tooltip panel be on screen this frame? Never while the
 * refit window holds the lockout (`dim`) — a ghost tooltip floating under the
 * modal contradicts the full-lockout ruling — never without a model (an
 * unfitted slot describes nothing), and never before the dwell elapses.
 */
export function shouldShowTooltip(hover: HoverState, nowMs: number, dim: boolean, hasModel: boolean): boolean {
  return !dim && hasModel && hoverReady(hover, nowMs);
}

/**
 * The tooltip's content: the heading (name + interaction line) over the stat
 * table, one row per line. `stats` may be empty (a belt stub with no live
 * mechanism) — the panel is then the heading alone.
 */
export interface TooltipModel {
  name: string;
  interaction: string;
  stats: readonly CardStatRow[];
}

/**
 * Pure: the tooltip for a slot, or null when there is nothing to describe (an
 * unfitted slot has no equipment — and since Story 8.6 the square carries no
 * words at all, so the tooltip is the ONLY place a slot's name is ever read).
 * `cards` is the own fitted-card id list (repeats intact) — the interaction
 * line's tier reads it.
 *
 * A BELT SLOT takes its name from the copy layer and its rows from the card
 * face's `CONSUMABLE_ROWS`, and carries the shape and the STOCK on its
 * interaction line (Story 8.7, ruling 13). `stock` is the belt slot's
 * `ammo[slot].n` — copies held.
 */
export function tooltipModel(
  slot: number,
  id: SlotItemId | null,
  stats: EffectiveStats,
  cards: readonly string[] = [],
  stock = 0,
): TooltipModel | null {
  if (id === null) return null;
  if (isConsumableId(id)) {
    return {
      name: boonName(id).toUpperCase(),
      interaction: interactionLine(slot, id, cards, stock),
      stats: consumableStatRows(id),
    };
  }
  return {
    name: slotHeading(id, stats),
    interaction: interactionLine(slot, id, cards, 0, stats),
    stats: equipmentStatRows(id, stats),
  };
}

/**
 * Pure: an equipment slot tooltip's HEADING (Eric 2026-09-30, review gate P9)
 * — the catalog LINE's name where a line fits the equipment (HEAVY TORPEDO,
 * NAVAL MINES, BROADSIDE GUN, CANNON for the gun's `deckGun` …), so the hover
 * names the weapon exactly as the card that fitted it did; the three Shifts
 * have no line and keep `EQUIPMENT_NAME` (SPEED BOOST / INSTANT RELOAD /
 * DAMAGE CUT). Uppercased for the tooltip register.
 */
export function slotHeading(id: EquipmentId, stats: EffectiveStats): string {
  const line = lineForEquipment(id);
  return (line === null ? equipmentInfo(stats, id).name : boonName(line)).toUpperCase();
}

/** The SHIP panel's interaction word (amendment 179). */
export const SHIP_INTERACTION = 'SHIP';

/**
 * Pure: the HP globe's SHIP panel (amendment 179) — the class display name over
 * `SHIP` and the five ship stats at live values. Null for a hull this build
 * cannot name (fail-closed: no panel rather than a nameless one).
 */
export function shipTooltipModel(cls: ShipClassId | undefined, stats: EffectiveStats): TooltipModel | null {
  if (cls === undefined || !Object.hasOwn(CLASS_DISPLAY_NAMES, cls)) return null;
  return { name: CLASS_DISPLAY_NAMES[cls], interaction: SHIP_INTERACTION, stats: shipStatRows(stats) };
}

/** The stat row's printed value (one printer for both hover panels). */
export { statValueText };

// --- pure core: the tooltip's CONTAINER FIT (amendment 47) ----------------------

// The panel is a GROWING panel inside a fixed viewport — model the height in
// pure arithmetic, pin it in a test that walks the whole catalog
// (__tests__/tooltipFit.test.ts).
//
// WHY THE MODEL IS THE RENDER (and cannot drift): every text style the shell
// builds takes its size AND its line-height from TIP_TYPE, the stat rows are
// one mono line each (no wrap), and drawTooltip lays everything out at the
// modelled offsets. Widths use the refit card's mono model (ui/refitCardFit) —
// an UPPER bound (0.605em covers the whole declared fallback stack).

/** The tooltip's type register — sizes, letter-spacings, explicit line-heights
 *  and inter-block gaps. The Pixi styles in hotbar.ts are built FROM this. */
export const TIP_TYPE = {
  nameSize: 17,
  nameLetterSpacing: 1.1,
  interactionSize: 14,
  interactionLetterSpacing: 1.6,
  /** The stat rows (both columns). */
  boonSize: 14,
  boonLetterSpacing: 0.6,
  boonLineHeight: 20,
  /** Line box (px) for the two mono heading rows. */
  headLineHeight: 24,
  /** Gaps: name→interaction, interaction→stat rows. */
  nameGap: 6,
  descGap: 10,
  /** Clear px between the widest label and the value column. */
  statColGap: 12,
} as const;

/**
 * The SHORTEST logical viewport the HUD is designed against — the 1280×614
 * floor the refit band's geometry is already pinned to (CLIENT_CONFIG.refit's
 * cardHeight note, the 125% UI-scale tier of a 1366×768 screen). A panel that
 * fits here fits everywhere.
 */
export const TOOLTIP_FLOOR_VIEWPORT_H = 614;

/** THE tooltip's container: the floor viewport minus the panel's own minimum
 *  margin at top and bottom. Nothing may render taller than this. */
export const TOOLTIP_MAX_PANEL_H = TOOLTIP_FLOOR_VIEWPORT_H - 2 * H.tooltip.margin;

/** The panel's inner content width (px) — the fixed panel minus padding. */
export function tooltipInnerWidth(): number {
  return H.tooltip.width - H.tooltip.pad * 2;
}

/** Everything the fit pin asserts on. */
export interface TooltipMetrics {
  innerW: number;
  /** Wrapped line count of the INTERACTION row (Story 8.7 — a belt slot's whole
   *  activation shape plus its stock does not sit on one 320px line at the
   *  frozen type, so the row wraps and the panel grows by a line). */
  interactionLines: number;
  /** One per stat row. */
  statLines: number;
  /** The widest label (px) — the value column starts `statColGap` past it. */
  labelW: number;
  /** The widest whole row (label column + gap + value) — must fit `innerW`. */
  rowW: number;
  /** Total panel height (px) — the same number drawTooltip paints with. */
  height: number;
  /** height − maxPanelH: ≤ 0 fits, > 0 is an amendment-47 violation. */
  overflow: number;
}

/** Pure: how many lines the interaction row wraps to at the panel's inner
 *  width. At least one — an empty row still owns its line box. */
export function interactionLines(interaction: string): number {
  const n = monoWrapLines(interaction, TIP_TYPE.interactionSize, TIP_TYPE.interactionLetterSpacing, tooltipInnerWidth());
  return Math.max(1, n);
}

/** Pure: the rendered height (px) of the two heading rows — the name's one line
 *  plus however many the interaction row wraps to. */
export function headingHeight(interaction: string): number {
  return TIP_TYPE.headLineHeight * (1 + interactionLines(interaction));
}

/** Pure: one string's width at the stat-row register. */
function statTextWidth(text: string): number {
  return monoTextWidth(text, TIP_TYPE.boonSize, TIP_TYPE.boonLetterSpacing);
}

/** Pure: the widest LABEL (px) of a stat table — where the value column's
 *  offset comes from, in the model and the render alike. */
export function statLabelWidth(rows: readonly CardStatRow[]): number {
  return rows.reduce((w, r) => Math.max(w, statTextWidth(r.label)), 0);
}

/**
 * Pure: the modelled geometry of a tooltip panel, against its container.
 * `maxPanelH` is the budget `overflow` is measured against — the design floor
 * by default; the fit pin passes the room above each square.
 */
export function tooltipMetrics(model: TooltipModel, maxPanelH = TOOLTIP_MAX_PANEL_H): TooltipMetrics {
  const T = TIP_TYPE;
  const labelW = statLabelWidth(model.stats);
  const valueW = model.stats.reduce((w, r) => Math.max(w, statTextWidth(statValueText(r))), 0);
  const n = model.stats.length;
  const height = H.tooltip.pad * 2 + headingHeight(model.interaction) + T.nameGap + T.descGap + n * T.boonLineHeight;
  return {
    innerW: tooltipInnerWidth(),
    interactionLines: interactionLines(model.interaction),
    statLines: n,
    labelW,
    rowW: n === 0 ? 0 : labelW + T.statColGap + valueW,
    height,
    overflow: height - maxPanelH,
  };
}

/**
 * What ONE frame's tooltip paints — offsets relative to the panel's top-left,
 * so the placement (which needs `panelH`) can be resolved after this.
 */
export interface TooltipRenderGeom {
  panelH: number;
  /** Top of the stat rows, from the panel's top edge. */
  statsDy: number;
  /** Left of the VALUE column, from the panel's inner left edge. */
  valueDx: number;
}

/**
 * Pure: the render geometry. NO MEASUREMENT AND NO TRIM: every row is one mono
 * line at an explicit line-height, so the model IS the render, and the catalog
 * walk (tooltipFit.test.ts) proves every panel fits the room above its square
 * at the 1280×614 floor — the cycle-141 room-above law, kept as a PIN.
 */
export function tooltipRenderGeom(model: TooltipModel): TooltipRenderGeom {
  const T = TIP_TYPE;
  const m = tooltipMetrics(model);
  return {
    panelH: m.height,
    statsDy: H.tooltip.pad + headingHeight(model.interaction) + T.nameGap + T.descGap,
    valueDx: m.labelW + T.statColGap,
  };
}

/**
 * Pure: the clear water ABOVE an anchor — between the top margin and the
 * panel's own `gap` over the thing it points at (review gate, cycle 141). The
 * panel hangs above its anchor by construction, so this is the only budget that
 * keeps it off the bar; the fit pin asserts every panel fits inside it.
 */
export function tooltipRoomAbove(anchor: Rect): number {
  return anchor.y - H.tooltip.gap - H.tooltip.margin;
}

/** Where the tooltip panel sits, and where its pointer notch tips down. */
export interface TooltipPlacement {
  x: number;
  y: number;
  /** Notch tip's screen x, on the panel's BOTTOM edge. */
  notchX: number;
}

/**
 * Pure: the panel ABOVE the hovered anchor (Story 8.6), horizontally centred on
 * it and clamped so it never leaves the viewport on any edge. The anchor is a
 * slot square, or the HP globe's bounding square for the SHIP panel.
 *
 * ABOVE, NOT FLANKING. The bar is CENTRED at the foot of the screen: a flanking
 * panel would cover the globes or the belt — i.e. the HUD would hide the HUD —
 * while the space directly above the bar is empty by construction. Nothing else
 * renders there: epic-8 amendment 38 moved the storm warning and the victim
 * tells UNDER the top-centre chrome bar precisely because this panel reaches
 * across that space on every hover.
 *
 * THE CLAMPS ARE BELT AND BRACES, NOT THE FIT: the fit pin proves every panel
 * fits the room above its anchor at the floor, so the top clamp never pulls a
 * panel down over the thing it points at.
 *
 * `gap` is measured from the SQUARE, not from the chip, so the panel's foot
 * reads as pointing at the thing it describes.
 */
export function tooltipPlacement(square: Rect, panelH: number, screenW: number, screenH: number): TooltipPlacement {
  const t = H.tooltip;
  const cx = square.x + square.w / 2;
  const maxX = Math.max(t.margin, screenW - t.margin - t.width);
  const x = Math.min(maxX, Math.max(t.margin, cx - t.width / 2));
  const maxY = Math.max(t.margin, screenH - t.margin - panelH);
  const y = Math.min(maxY, Math.max(t.margin, square.y - t.gap - panelH));
  const notchX = Math.min(x + t.width - t.notch - 2, Math.max(x + t.notch + 2, cx));
  return { x, y, notchX };
}

/**
 * Pure: ONE frame's whole tooltip — the geometry and the placement, composed in
 * the order the renderer needs them (the placement needs `panelH`). The Pixi
 * shell does nothing else to them, which is what makes the pair testable
 * without a canvas.
 */
export function tooltipFrame(
  model: TooltipModel,
  anchor: Rect,
  screenW: number,
  screenH: number,
): { geom: TooltipRenderGeom; place: TooltipPlacement } {
  const geom = tooltipRenderGeom(model);
  return { geom, place: tooltipPlacement(anchor, geom.panelH, screenW, screenH) };
}
