// THE SLOT TOOLTIP — the hover panel that carries everything the HUD bar's
// squares no longer say out loud (Story 8.6 deleted the label column; UX-DR40/41
// left the square with state, seconds and counts and nothing else).
//
// SPLIT OUT OF render/hotbar.ts IN STORY 8.7 (ruling 13), VERBATIM. Nothing here
// is new work: the hover dwell, the accrued-boon rows, the container-fit model
// and the placement are the ratified 2.2–8.6 contract, moved so that `hotbar.ts`
// is the SQUARES and this file is the PANEL. 8.7 then re-cut the panel's
// CONTENT — the interaction line gained a weapon's tier and a belt slot's
// consumable shape (render/equipmentInfo.ts) — and epic-8 amendment 42 froze its
// WIDTH, type and notch exactly where they shipped.
//
// The Pixi shell that paints this model still lives in `hotbar.ts`: it draws
// into the bar's own container and shares the slot geometry, so moving the
// drawing would have split one renderer across two files to no end. What moved
// is the pure core, which is what the tests measure.

import {
  CATALOG,
  boonStackCount,
  isConsumableId,
  type EffectiveStats,
  type SlotItemId,
} from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { boonEffectLine, boonName, boonTooltipText } from '../ui/boonCopy.js';
import { monoWrapLines } from '../ui/refitCardFit.js';
import type { Rect } from './hudBar.js';
import {
  cardEquipmentIds,
  equipmentInfo,
  interactionLine,
  isShipwideCard,
} from './equipmentInfo.js';

const H = CLIENT_CONFIG.hotbar;

/**
 * Pure: the accrued card ids a SLOT owns, in fit order with repeats intact.
 *
 * STORY 8.1 — NO CATEGORY FILTER. Catalog v3 deleted the nine categories, so a
 * slot claims the cards that actually ADDRESS its equipment: the line's own
 * slotFill target, the equipment its stat effects write into, and the equipment
 * an add-on bolts its verb onto (render/equipmentInfo.cardEquipmentIds). The
 * GUN, being the permanent first slot, additionally hosts the SHIPWIDE ladders
 * (ARMOR / SPEED / TURNING / RADAR SWEEP / RELOAD), which belong to no weapon —
 * the same role the v2 INTEL/SHIP categories had, derived rather than declared.
 *
 * A BELT slot holds a CONSUMABLE line, which addresses no equipment at all
 * (Story 8.7, ruling 1): it owns no accrued rows, and its stock is carried by
 * the interaction line instead. Narrowed, never cast.
 *
 * Fail-closed on the catalog (Object.hasOwn): a junk id on the wire is dropped
 * rather than rendering a row nothing can explain.
 */
export function slotBoonIds(id: SlotItemId, cards: readonly string[]): string[] {
  if (isConsumableId(id)) return [];
  return cards.filter((c) => {
    if (!Object.hasOwn(CATALOG, c)) return false;
    const targets = cardEquipmentIds(c);
    return targets.length === 0 ? id === 'gun' : targets.includes(id);
  });
}
// --- pure core: hover + tooltip -------------------------------------------------

/** Hover dwell state (which slot, since when). */
export interface HoverState {
  slot: number | null;
  since: number;
}

export const NO_HOVER: HoverState = { slot: null, since: 0 };

/** Pure: advance the hover dwell — the clock restarts whenever the slot changes. */
export function nextHover(prev: HoverState, slot: number | null, nowMs: number): HoverState {
  if (slot === prev.slot) return prev;
  return { slot, since: nowMs };
}

/** Pure: has the hover dwelled long enough to show the tooltip? */
export function hoverReady(state: HoverState, nowMs: number, delayMs = H.tooltip.delayMs): boolean {
  return state.slot !== null && nowMs - state.since >= delayMs;
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
 * One accrued-boon row in the tooltip's BOONS block (Story 2.9 — the block that
 * shipped in 2.2 as deliberate absence now carries the build).
 *
 * A normal row is a PAIR of lines: the `◆ NAME` the card showed (at the stack's
 * current rung) over a compact effect line reporting the LIVE value. A `divider`
 * row is a single line with no effect under it — the `— SHIP —` section head and
 * the `+n MORE` overflow marker.
 */
export interface TooltipBoonRow {
  label: string;
  effect: string;
  divider: boolean;
  /** The `+n MORE` marker only: how many REAL accrued lines it stands in for.
   *  Carried as data (not re-parsed off the label) so a second trim pass — the
   *  render's viewport clamp re-trimming an already-trimmed list — folds the
   *  earlier count into its own instead of forgetting it. */
  hidden?: number;
}

/**
 * The tooltip's content. `boons` is the ACCRUED build for this slot — already
 * trimmed to fit its box (fitBoonRows). An empty list still renders as ABSENCE:
 * no divider, no rows, no placeholder.
 */
export interface TooltipModel {
  name: string;
  interaction: string;
  description: string;
  boons: readonly TooltipBoonRow[];
}

/** The section head that separates the gun slot's own guns lines from the
 *  shipwide INTEL/SHIP lines it hosts. */
export const SHIP_DIVIDER_ROW = '— SHIP —';

/** Pure: the `+n MORE` marker that replaces the rows a panel cannot fit. */
export function moreBoonsRow(hidden: number): TooltipBoonRow {
  return { label: `◆ +${hidden} MORE`, effect: '', divider: true, hidden };
}

/**
 * Pure: one accrued line's row — the ladder name at the rung you hold, and the
 * live effect line under it.
 *
 * NO `×n` SUFFIX. `boonName` is position-aware: every stackable ladder in the
 * catalog names its own rung (HEAVY SHELLS Mk III), so a suffix could only ever
 * repeat what the name just said — and the rows that DON'T carry a rung name are
 * the single-copy lines, where there is no count to print anyway.
 */
function boonRow(id: string, stack: number, stats: EffectiveStats): TooltipBoonRow {
  return { label: `◆ ${boonName(id, stack - 1)}`, effect: boonEffectLine(id, stats), divider: false };
}

/**
 * Pure: every accrued row for a slot, UNTRIMMED, in fit order. Stacked copies
 * COLLAPSE: five HEAVY SHELLS are one row at Mk V, not five rows. The gun slot
 * appends the shipwide lines under the `— SHIP —` divider (see slotBoonIds).
 *
 * The divider is a SEPARATOR, so it only appears with something on both sides:
 * a gun holding shipwide lines and nothing of its own lists them bare. A heading
 * over the whole list separates it from nothing and just spends a line saying so.
 */
export function boonRows(id: SlotItemId, cards: readonly string[], stats: EffectiveStats): TooltipBoonRow[] {
  const ids = slotBoonIds(id, cards);
  const own: TooltipBoonRow[] = [];
  const ship: TooltipBoonRow[] = [];
  const seen = new Set<string>();
  for (const b of ids) {
    if (seen.has(b)) continue;
    seen.add(b);
    const row = boonRow(b, boonStackCount(ids, b), stats);
    (isShipwideCard(b) ? ship : own).push(row);
  }
  if (ship.length === 0) return own;
  if (own.length === 0) return ship;
  return [...own, { label: SHIP_DIVIDER_ROW, effect: '', divider: true }, ...ship];
}

/**
 * Pure: the tooltip for a slot, or null when there is nothing to describe (an
 * unfitted slot has no equipment — and since Story 8.6 the square carries no
 * words at all, so the tooltip is the ONLY place a slot's name is ever read).
 * `boons` is the own fitted-boon id list (repeats intact).
 *
 * A BELT SLOT forks the whole model (Story 8.7, ruling 13): a consumable has no
 * equipment row to read a name, a description or accrued cards off, so it takes
 * its name from the copy layer, its explanation from the catalog's own hover
 * text, and carries the shape and the STOCK on its interaction line instead.
 * `stock` is the belt slot's `ammo[slot].n` — copies held.
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
      description: boonTooltipText(id),
      boons: [],
    };
  }
  const info = equipmentInfo(stats, id);
  const full: TooltipModel = {
    name: info.name.toUpperCase(),
    interaction: interactionLine(slot, id, cards, 0, stats),
    description: info.description,
    boons: boonRows(id, cards, stats),
  };
  return { ...full, boons: fitBoonRows(full) };
}

// --- pure core: the tooltip's CONTAINER FIT (amendment 47) ----------------------

// The panel is the mirror image of the refit card's fit problem: the card is a
// FIXED box holding growing text, the tooltip is a GROWING panel inside a fixed
// viewport. Same law, same method — model the height in pure arithmetic, pin it
// in a test that walks the whole catalog (__tests__/tooltipFit.test.ts).
//
// WHY THE MODEL IS THE RENDER (and cannot drift): every text style below takes
// its size AND its line-height from TIP_TYPE, and drawTooltip lays the rows out
// at the modelled offsets rather than at Pixi's measured heights. Widths use the
// refit card's mono model (ui/refitCardFit) — an UPPER bound for the mono rows
// (0.605em covers the whole declared fallback stack) and, comfortably, for the
// proportional description too, whose display face averages well under 0.6em.

/** The tooltip's type register — sizes, letter-spacings, explicit line-heights
 *  and inter-block gaps. The Pixi styles below are built FROM this. */
export const TIP_TYPE = {
  nameSize: 17,
  nameLetterSpacing: 1.1,
  interactionSize: 14,
  interactionLetterSpacing: 1.6,
  descSize: 18,
  descLineHeight: 26,
  boonSize: 14,
  boonLetterSpacing: 0.6,
  boonLineHeight: 20,
  /** Line box (px) for the two mono heading rows. */
  headLineHeight: 24,
  /** Gaps: name→interaction, interaction→description, description→boons. */
  nameGap: 6,
  descGap: 10,
  boonsGap: 12,
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

/** Everything the fit pin asserts on, plus the line counts that make a failure
 *  diagnosable ("the boons block wrapped to 31 lines"). */
export interface TooltipMetrics {
  innerW: number;
  /**
   * Wrapped line count of the INTERACTION row (Story 8.7).
   *
   * It used to be one, unconditionally, and the height model said so. Ruling 13
   * put two facts on that row that a player cannot guess — a weapon's TIER and
   * a belt slot's whole activation shape plus its stock — and the longest of
   * them (`CONSUMABLE · 1 · KEY PRIMES · CLICK FIRES · ×2`) is 46 glyphs
   * against a 29-glyph line. Epic-8 amendment 42 freezes the panel's WIDTH and
   * TYPE, so the row has to WRAP, and a model that kept assuming one line would
   * put the description on top of it and paint the overflow outside the panel —
   * the exact amendment-47 failure this module exists to prevent.
   *
   * So the row is measured. Everything else is untouched: the panel is still
   * 320px at the same type with the same notch, and the boon-row trim still
   * absorbs the extra line out of the SAME height budget.
   */
  interactionLines: number;
  descLines: number;
  boonLines: number;
  /** Total panel height (px) — the same number drawTooltip paints with. */
  height: number;
  /** height − TOOLTIP_MAX_PANEL_H: ≤ 0 fits, > 0 is an amendment-47 violation. */
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

/** Pure: the BOONS block as ONE wrapped text run — the exact string the panel
 *  renders (a divider row contributes its label alone). */
export function boonBlockText(rows: readonly TooltipBoonRow[]): string {
  return rows.map((r) => (r.divider ? r.label : `${r.label}\n${r.effect}`)).join('\n');
}

/** Wrapped line count of the boons block at the panel's inner width. */
function boonBlockLines(rows: readonly TooltipBoonRow[], innerW: number): number {
  let lines = 0;
  for (const r of rows) {
    lines += monoWrapLines(r.label, TIP_TYPE.boonSize, TIP_TYPE.boonLetterSpacing, innerW);
    if (!r.divider) lines += monoWrapLines(r.effect, TIP_TYPE.boonSize, TIP_TYPE.boonLetterSpacing, innerW);
  }
  return lines;
}

/**
 * Pure: the modelled height of a tooltip panel, against its container. `maxPanelH`
 * is the budget `overflow` is measured against — the design floor by default, and
 * the REAL viewport's allowance when the render clamps against a screen shorter
 * than the room above the hovered square (drawTooltip / tooltipRenderGeom).
 */
export function tooltipMetrics(model: TooltipModel, maxPanelH = TOOLTIP_MAX_PANEL_H): TooltipMetrics {
  const T = TIP_TYPE;
  const innerW = tooltipInnerWidth();
  const descLines = monoWrapLines(model.description, T.descSize, 0, innerW);
  const boonLines = boonBlockLines(model.boons, innerW);
  const iLines = interactionLines(model.interaction);
  const height =
    H.tooltip.pad * 2 +
    headingHeight(model.interaction) +
    T.nameGap +
    T.descGap +
    descLines * T.descLineHeight +
    (model.boons.length > 0 ? T.boonsGap + boonLines * T.boonLineHeight : 0);
  return { innerW, interactionLines: iLines, descLines, boonLines, height, overflow: height - maxPanelH };
}

/** Pure: how many REAL accrued lines a row list accounts for — one per boon row,
 *  none for a `— SHIP —` head (furniture: counting it would make the `+n MORE`
 *  marker overstate the build it hides), and the carried count for a marker that
 *  is itself standing in for rows. */
function boonLineCount(rows: readonly TooltipBoonRow[]): number {
  return rows.reduce((n, r) => n + (r.divider ? (r.hidden ?? 0) : 1), 0);
}

/**
 * Pure: the first `k` rows, tidied into something that can actually be shown —
 * the trim's own honesty rules, kept out of the fit search's arithmetic.
 *
 *  • a kept TRAILING divider is popped: a `— SHIP —` head whose section was
 *    entirely trimmed away introduces nothing, and directly above the marker it
 *    reads as a heading FOR the marker;
 *  • the `+n MORE` count is the REAL lines dropped, dividers excluded — the
 *    panel must never claim to be hiding a separator.
 */
export function trimmedBoonRows(rows: readonly TooltipBoonRow[], k: number): TooltipBoonRow[] {
  const kept = rows.slice(0, k);
  while (kept.length > 0 && kept[kept.length - 1].divider) kept.pop();
  const hidden = boonLineCount(rows) - boonLineCount(kept);
  return hidden > 0 ? [...kept, moreBoonsRow(hidden)] : kept;
}

/**
 * Pure: the accrued rows a panel can actually SHOW (amendment 47 — the tooltip's
 * half of the container-fit law). Keeps as many rows as fit, in fit order, and
 * spends the last row on a `◆ +n MORE` marker when anything had to go, so the
 * panel never lies about the size of the build. Returns the whole list whenever
 * it fits — the trim is the exception, not the design. `maxPanelH` is the height
 * budget to fit inside (see tooltipMetrics).
 */
export function fitBoonRows(model: TooltipModel, maxPanelH = TOOLTIP_MAX_PANEL_H): readonly TooltipBoonRow[] {
  for (let k = model.boons.length; k > 0; k -= 1) {
    const boons = k === model.boons.length ? model.boons : trimmedBoonRows(model.boons, k);
    if (tooltipMetrics({ ...model, boons }, maxPanelH).overflow <= 0) return boons;
  }
  return [];
}

/**
 * What ONE frame's tooltip actually paints — the model's arithmetic reconciled
 * with the two things only the renderer knows: how tall the description text
 * MEASURED, and how tall the screen really is.
 *
 * The offsets are relative to the panel's top-left, so the placement (which
 * needs `panelH`) can be resolved after this.
 */
export interface TooltipRenderGeom {
  /** The rows to draw — model.boons, or a shorter list when the real viewport
   *  is tighter than the design floor the model was fitted against. */
  boons: readonly TooltipBoonRow[];
  panelH: number;
  /** Top of the description block, from the panel's top edge. */
  descDy: number;
  /** Top of the boons block, from the panel's top edge. */
  boonsDy: number;
}

/**
 * Pure: that reconciliation (amendment 47, the render half).
 *
 * The MODEL stays the fit-pin authority — tooltipMetrics is what the catalog
 * walk proves — but a model is an upper bound on width and a nominal on height,
 * and the panel is painted at real pixels on a real screen. Two things can
 * therefore differ from the pin, and both would otherwise draw past a boundary:
 *
 *  • `measuredDescH`: Pixi wrapped the description to more height than the mono
 *    model predicted. The boons block is placed below the LARGER of the two and
 *    the panel grows by the difference, so the description can never run under
 *    the build list.
 *  • `roomAboveH`: the clear water ABOVE the hovered square is shorter than the
 *    design floor's allowance (a small window, a high UI scale, a belt square
 *    that sits lower than the weapon row). The panel is clamped to what that
 *    space allows and the rows are re-trimmed against the smaller budget — the
 *    same `+n MORE` grammar, just tighter.
 *
 *    THE ROOM ABOVE, NOT THE SCREEN (review gate, cycle 141). This used to be
 *    `screenH - 2*margin`, which at the 1280x614 floor let the tallest build
 *    model a 570px panel that `tooltipPlacement` then clamped to the top margin
 *    — painting straight over the hovered square, the other eight slots and both
 *    globes. The panel hangs ABOVE the square by construction, so the square's
 *    own clearance is the only budget that can keep that promise, and the screen
 *    clamp is subsumed by it (the bar is `floor` px off the viewport's edge).
 *
 * Growth from measurement is taken out of the row budget FIRST, so the two fixes
 * cannot fight: whatever the description costs, the panel still fits its space.
 */
export function tooltipRenderGeom(model: TooltipModel, measuredDescH: number, roomAboveH: number): TooltipRenderGeom {
  const T = TIP_TYPE;
  const maxPanelH = Math.min(TOOLTIP_MAX_PANEL_H, roomAboveH);
  const modelledDescH = tooltipMetrics(model).descLines * T.descLineHeight;
  const excess = Math.max(0, measuredDescH - modelledDescH);
  const budget = maxPanelH - excess;
  const fitted = tooltipMetrics(model, budget).overflow <= 0 ? model.boons : fitBoonRows(model, budget);
  const m = tooltipMetrics({ ...model, boons: fitted }, budget);
  // The description starts under the WHOLE heading block — the name's one line
  // plus however many the interaction row wrapped to (Story 8.7, ruling 13).
  const descDy = H.tooltip.pad + headingHeight(model.interaction) + T.nameGap + T.descGap;
  return {
    boons: fitted,
    panelH: m.height + excess,
    descDy,
    boonsDy: descDy + Math.max(modelledDescH, measuredDescH) + T.boonsGap,
  };
}

/** Where the tooltip panel sits, and where its pointer notch tips down. */
export interface TooltipPlacement {
  x: number;
  y: number;
  /** Notch tip's screen x, on the panel's BOTTOM edge. */
  notchX: number;
}

/**
 * Pure: the panel ABOVE the hovered square (Story 8.6), horizontally centred on
 * it and clamped so it never leaves the viewport on any edge.
 *
 * ABOVE, NOT FLANKING. The old stack sat at the screen's left edge, so a panel
 * could flank it right and sit over open water. The bar is CENTRED at the foot
 * of the screen: a flanking panel would cover the globes or the belt — i.e. the
 * HUD would hide the HUD — while the space directly above the bar is empty by
 * construction. Nothing else renders there: epic-8 amendment 38 moved the storm
 * warning and the victim tells UNDER the top-centre chrome bar precisely because
 * this panel reaches across that space on every hover.
 *
 * THE CLAMPS ARE BELT AND BRACES, NOT THE FIT (review gate, cycle 141): the
 * panel is trimmed to the room above the square before it gets here
 * (`tooltipFrame`), so the top clamp can no longer pull a too-tall panel down
 * over the square it points at.
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
 * the same order the renderer needs them (the placement needs `panelH`, which
 * the geometry resolves). The Pixi shell does nothing else to them, which is
 * what makes the pair testable without a canvas.
 */
export function tooltipFrame(
  model: TooltipModel,
  measuredDescH: number,
  square: Rect,
  screenW: number,
  screenH: number,
): { geom: TooltipRenderGeom; place: TooltipPlacement } {
  // THE HEIGHT BUDGET IS THE ROOM ABOVE THE SQUARE (review gate, cycle 141) —
  // the clear water between the top margin and the panel's own `gap` over the
  // thing it points at. Trimming against the SCREEN instead let the tallest
  // build model a panel taller than that space and land on the bar.
  const roomAbove = square.y - H.tooltip.gap - H.tooltip.margin;
  const geom = tooltipRenderGeom(model, measuredDescH, roomAbove);
  return { geom, place: tooltipPlacement(square, geom.panelH, screenW, screenH) };
}
