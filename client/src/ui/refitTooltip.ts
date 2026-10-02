// THE REFIT CARD'S HOVER TOOLTIP (Story 7-5 wave 2, R2.17 — Eric ruling
// 2026-08-19). The card face went minimal and the hover took the rest:
//
//   *"hovering one with the mouse should give a tooltip explaining the card, so
//   that there are no questions like 'what the fuck does a captive mine do?'"*
//
// CYCLE 158 (Eric ruling 2026-09-30, epic-8 amendment 187) — THE SAME STAT
// LIST: the prose explanation is DELETED, and the panel prints the full stat
// table of what the card touches, valued AFTER the card (ui/boonCopy.ts
// `cardHoverRows` — the one builder the slot tooltip shares), one `LABEL value`
// per line. A card with no rows shows no panel.
//
// HOVER ONLY, BY RULING. Tab opens the refit window, 1–4 pick a card and 5 heals
// (input/keyboard.ts). The tooltip is deliberately NOT wired into that path:
// *"a new player will probably click and hover and read tooltips. an experienced
// player knows what they want and will use the shortcut or click faster without
// reading."* The shortcut exists so the reading can be SKIPPED, so putting the
// panel in front of it would defeat its purpose. Nothing here observes a
// focus or key event, and __tests__/refitTooltipFit.test.ts pins that absence.
//
// WHY THIS IS A SECOND TOOLTIP AND NOT THE HOTBAR'S. `render/hotbar.ts`'s slot
// tooltip is drawn in PIXI, and `shouldShowTooltip()` suppresses it outright
// while the refit modal holds the combat lockout (`dim`) — a Pixi panel could
// not paint over a DOM band at z-index 1000 anyway. So the surface has to be
// DOM. What IS reused is everything that can be: the copy layer (`boonCopy`),
// the mono wrap arithmetic (`refitCardFit`), the slot tooltip's own visual spec
// from DESIGN.md (`components.slot-tooltip`: the `panel` token at .97 opacity
// for the bed, a 1px `silver` .4 edge, square CIC corners), and — most
// importantly — the SHAPE of its container-fit pin: model the panel's height in
// pure arithmetic, then walk the whole catalog against the container in a test.
//
// THE CONTAINER IS THE CLEAR WATER ABOVE THE BAND. The panel hangs above the
// hovered card with its BOTTOM edge fixed, growing upward, so its container is
// the space between the viewport's top margin and the band's own top edge (the
// queue pips). Amendment 47 is the reason the bound is the PIPS and not the
// card: a panel that grew over the pips would cover another part of the UX.
//
// AMENDMENT 47 IS RE-AIMED, NOT RELAXED AWAY. Its ~90-character budget is a
// statement about the 216×236 card BOX, and R2.17 moves the explanation out of
// that box on purpose; `__tests__/refitCardFit.test.ts` still governs the face,
// and `__tests__/refitTooltipFit.test.ts` governs this panel against ITS own
// container. Two boxes, two pins, one law.

import { CONSUMABLE_SLOTS, isConsumableId } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { interactionLine } from '../render/equipmentInfo.js';
import { statValueText, type CardStatRow } from './boonCopy.js';
import { monoTextWidth, monoWrapLines, widestToken } from './refitCardFit.js';

const R = CLIENT_CONFIG.refit;

/**
 * The panel's type + box register. `ui/upgradeMenu.ts` interpolates these values
 * straight into its CSS strings and this module measures with them, so the model
 * and the render cannot drift (the REFIT_TYPE pattern, verbatim).
 *
 * The width is 300 (amendment 187 keeps it). Everything else about the surface
 * — the bed color, the silver hairline, the square corners — is the slot
 * tooltip's ratified spec.
 */
export const REFIT_TIP = {
  /** Panel width (px), borders and padding included (box-sizing: border-box). */
  width: 300,
  /** Inner padding (px) on all four sides. */
  pad: 12,
  /** Border width (px) — inside the border box, so it eats inner space. */
  border: 1,
  /** Clear space (px) between the band's top edge and the panel's bottom edge. */
  gap: 10,
  /** Minimum clear space (px) between the panel's top edge and the viewport. */
  margin: 12,
  /** The heading row: the ladder name at the hovered card's stack position.
   *  The interaction line and every stat row use this same mono register. */
  nameSize: 14,
  nameLetterSpacing: 1,
  nameLineHeight: 1.2,
  /** Vertical gap (px) between the panel's blocks (heading, shape line, rows). */
  rowGap: 8,
  /** Minimum clear px between a stat row's label and its value. */
  statColGap: 12,
} as const;

/** The logical floor viewport the pin measures against — the 1280×614 of the
 *  ≥1600px-gated 125% UI-scale tier, the same floor the band's own geometry
 *  suite and the hotbar tooltip's fit pin both use. */
export const REFIT_TIP_FLOOR_VIEWPORT_H = 614;

/** The panel's INNER content width (px): the fixed width minus padding and
 *  border on both sides. */
export function refitTooltipInnerWidth(): number {
  return REFIT_TIP.width - 2 * (REFIT_TIP.pad + REFIT_TIP.border);
}

/**
 * The panel's CONTAINER height (px) for a band whose top edge (the queue pips)
 * sits at `bandTopY`. The panel's bottom edge is pinned `gap` above the band, so
 * everything from there up to the viewport's `margin` is what it may occupy.
 *
 * `bandTopY` is passed in rather than recomputed here on purpose: the band's
 * anchor arithmetic lives in ONE place (`refitBandLayout`), and duplicating it
 * would be exactly the drift this module's whole design avoids. Floored at 0 so
 * an absurdly short viewport yields "no room" rather than a negative budget.
 */
export function refitTooltipMaxPanelH(bandTopY: number): number {
  return Math.max(0, bandTopY - REFIT_TIP.gap - REFIT_TIP.margin);
}

/**
 * What the panel renders: the hovered card's name over the stat table of what
 * the card touches, one row per line (amendment 187).
 *
 * A CONSUMABLE card also carries the same INTERACTION LINE the belt's slot
 * tooltip does, above the rows (Story 8.7, ruling 13): the activation shape
 * (formerly printed; removed, amendment 203) is the one thing about a
 * consumable a player cannot read off the face, and the card is where they meet
 * the line for the first time, before there is a belt square to hover.
 */
export interface RefitTooltipModel {
  name: string;
  /** The consumable's shape line, or absent for every other kind. */
  interaction?: string;
  stats: readonly CardStatRow[];
}

export interface RefitTooltipMetrics {
  innerW: number;
  nameLines: number;
  /** The consumable interaction row's wrapped lines; 0 when there is none. */
  interactionLines: number;
  /** One per stat row (rows never wrap). */
  statLines: number;
  /** Total rendered panel height (px), padding and borders included. */
  height: number;
  /** height − containerH: ≤ 0 fits, > 0 is an amendment-47 violation. */
  overflow: number;
}

/** Rendered height (px) of ONE line box, ROUNDED UP — browsers lay line boxes
 *  out on whole pixels (the refit card's own rule, same reason). */
function lineBox(fontPx: number, lh: number): number {
  return Math.ceil(fontPx * lh);
}

/**
 * Pure: the panel's rendered height against its container. Mirrors the DOM in
 * `ui/upgradeMenu.ts` exactly — padding, border, heading row, then one
 * `rowGap` before the shape line (consumables only) and one before the stat
 * block, whose rows are one mono line box each. An EMPTY table contributes
 * nothing, which agrees with the render because a card with no rows never
 * draws a panel AT ALL.
 */
export function refitTooltipMetrics(model: RefitTooltipModel, containerH: number): RefitTooltipMetrics {
  const innerW = refitTooltipInnerWidth();
  const nameLines = monoWrapLines(model.name, REFIT_TIP.nameSize, REFIT_TIP.nameLetterSpacing, innerW);
  const interaction = model.interaction ?? '';
  const interactionLines = monoWrapLines(interaction, REFIT_TIP.nameSize, REFIT_TIP.nameLetterSpacing, innerW);
  const statLines = model.stats.length;
  const box = lineBox(REFIT_TIP.nameSize, REFIT_TIP.nameLineHeight);
  const block = (n: number): number => (n > 0 ? REFIT_TIP.rowGap + n * box : 0);
  const height = 2 * (REFIT_TIP.pad + REFIT_TIP.border) + nameLines * box + block(interactionLines) + block(statLines);
  return { innerW, nameLines, interactionLines, statLines, height, overflow: height - containerH };
}

/** Pure: one stat row's width (px) — label, the minimum column gap, value. A
 *  row never wraps, so it is one unbreakable token for the width law. */
export function refitTooltipRowWidth(row: CardStatRow): number {
  const w = (t: string): number => monoTextWidth(t, REFIT_TIP.nameSize, REFIT_TIP.nameLetterSpacing);
  return w(row.label) + REFIT_TIP.statColGap + w(statValueText(row));
}

/** Widest unbreakable token (px) across the heading, the shape line and every
 *  stat row (label + value) — the horizontal half of the law: a token wider
 *  than the inner box paints out through the panel's side. */
export function refitTooltipWidestToken(model: RefitTooltipModel): number {
  return Math.max(
    widestToken(model.name, REFIT_TIP.nameSize, REFIT_TIP.nameLetterSpacing),
    widestToken(model.interaction ?? '', REFIT_TIP.nameSize, REFIT_TIP.nameLetterSpacing),
    ...model.stats.map(refitTooltipRowWidth),
  );
}

/**
 * Pure: the hover panel's model for one offered line (Story 8.7, ruling 13).
 * A CONSUMABLE card gains the interaction line the belt's slot tooltip prints;
 * every other kind is the name over its stat rows.
 *
 * The KEY is the FIRST belt key rather than a resolved slot, because a card has
 * not been picked yet and therefore has no slot — what the panel teaches is the
 * SHAPE (formerly printed; removed, amendment 203), not which square it will
 * land in.
 *
 * THE STOCK IS THE REAL ONE (review patch P7). It was a hard-coded `×1`, so a
 * hover over a line already carried twice disagreed with the belt square beside
 * it. `copiesHeld` is the card's own stack, and the number printed is
 * `copiesHeld + 1`: the hover is on a card ABOUT TO BE STOCKED, so it reads
 * what the belt WILL say once it is taken — the same tense the face's ladder
 * and stat rows are already in (they preview the copy being offered).
 */
export function refitTooltipModel(
  line: { id: string; kind: string },
  name: string,
  stats: readonly CardStatRow[],
  copiesHeld: number,
): RefitTooltipModel {
  if (line.kind !== 'consumable' || !isConsumableId(line.id)) return { name, stats };
  const stock = Math.max(0, Math.trunc(copiesHeld)) + 1;
  const interaction = interactionLine(CONSUMABLE_SLOTS[0], line.id, [], stock);
  return interaction === '' ? { name, stats } : { name, stats, interaction };
}

/**
 * Pure: the panel's LEFT offset (px) inside the card row's coordinate space, for
 * the card in slot `index`. Centered over that card — the panel is wider than a
 * 216px card, so the two end slots deliberately overhang the row, which is
 * legal: the row is centered in a ≥1280px viewport and the band's own margins
 * are far wider than the overhang. Clamped into `rowW` only when the row is
 * wider than the panel, so a degenerate narrow row cannot produce a nonsense
 * negative-and-clamped position.
 */
export function refitTooltipLeft(index: number, rowW: number): number {
  const center = index * (R.card + R.gap) + R.card / 2;
  const left = center - REFIT_TIP.width / 2;
  if (rowW <= REFIT_TIP.width) return left;
  return Math.min(Math.max(left, 0), rowW - REFIT_TIP.width);
}
