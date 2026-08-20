// THE CONTAINER-FIT LAW, applied to the refit card (amendment 47: "nothing
// anywhere in the game may render larger than its container — no text or element
// may extend past its box such that it covers, or can be covered by, another
// part of the UX").
//
// The refit card is a FIXED box (216 × 236) holding WRAPPING mono text whose
// length is data-driven (ladder names by stack position, a lineage handrail, a
// doctrine REPLACES line, and rules text that prints live current→next values).
// That combination — fixed height + wrapping content — is exactly the shape that
// silently overflows, which is what it did on the live site for the exclusive
// doctrine cards.
//
// So the card's height is COMPUTABLE, and this module computes it. Everything
// here is pure arithmetic over the copy strings; ui/upgradeMenu.ts builds its
// CSS from the very same REFIT_TYPE register, so the model and the DOM can never
// drift. The permanent pin lives in __tests__/refitCardFit.test.ts, which walks
// every BOON_CATALOG line at every stack position in its worst-case presentation
// state and fails if any card exceeds its inner box.
//
// WHY THE MATH IS EXACT (and not a guess):
//   • MONO type. Every glyph on the card advances by the same width, so a line's
//     width is chars × advance and wrap points are countable.
//   • EXPLICIT line-heights. The card's text elements declare their line-height
//     from this register rather than inheriting `normal` (which is a font metric
//     the model could not know), so lines × fontPx × lineHeight IS the rendered
//     block height.
//   • CONSERVATIVE wrapping. Lines are broken on WHITESPACE only. Browsers also
//     break after hyphens (and, with `overflow-wrap:anywhere`, anywhere), which
//     can only pack MORE per line — so the model's line count is an upper bound
//     on the rendered one, never an under-count.

import { CONFIG } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';

const R = CLIENT_CONFIG.refit;

/**
 * Mono advance width, in em — THE model constant.
 *
 * Geist Mono (the declared face) advances 0.6 em exactly; the fallback stack
 * ('ui-monospace', SFMono-Regular, Menlo, monospace) tops out at Menlo's
 * 1233/2048 = 0.6021 em. 0.605 covers the whole declared stack with a little
 * room, so a card that fits the model fits the render on every fallback too.
 */
export const MONO_ADVANCE_EM = 0.605;

/**
 * The card's type register — letter-spacings, line-heights, the inter-row gap
 * and the border. ui/upgradeMenu.ts interpolates these values straight into its
 * CSS strings and this module measures with them, so there is ONE source of
 * truth for the card's text metrics. (The font SIZES stay in CLIENT_CONFIG.refit
 * with the rest of the band's geometry.)
 */
export const REFIT_TYPE = {
  /** Letter-spacing (px) per card row. */
  categoryLetterSpacing: 1,
  rarityLetterSpacing: 1,
  nameLetterSpacing: 1,
  lineageLetterSpacing: 2,
  descriptionLetterSpacing: 0,
  /** Line-height MULTIPLIER for every card row except the rules text. */
  lineHeight: 1.2,
  /** The rules text runs a touch looser — it is the only multi-line paragraph. */
  descLineHeight: 1.25,
  /** Flex `gap` (px) between the card's rows. 6 → 5 under amendment 47: the
   *  three px bought back is the fit margin the worst exclusive card runs on. */
  rowGap: 5,
  /** Card border width (px) — inside the border-box, so it eats inner space. */
  border: 1,
} as const;

/** Advance width (px) of one glyph at a size + letter-spacing. */
export function monoCharWidth(fontPx: number, letterSpacingPx = 0): number {
  return fontPx * MONO_ADVANCE_EM + letterSpacingPx;
}

/** Rendered width (px) of a mono string. Counts CODE POINTS, not UTF-16 units. */
export function monoTextWidth(text: string, fontPx: number, letterSpacingPx = 0): number {
  return [...text].length * monoCharWidth(fontPx, letterSpacingPx);
}

/**
 * Line count a mono string wraps to inside `boxW`. Greedy, whitespace-only
 * breaks (the conservative bound — see the header), with a hard chunk break for
 * any single token wider than the box (what `overflow-wrap:anywhere` does).
 * Empty text occupies no lines.
 */
export function monoWrapLines(text: string, fontPx: number, letterSpacingPx: number, boxW: number): number {
  const perLine = Math.max(1, Math.floor(boxW / monoCharWidth(fontPx, letterSpacingPx)));
  let lines = 0;
  let used = 0;
  for (const word of text.split(/\s+/)) {
    const w = [...word].length;
    if (w === 0) continue;
    if (used > 0 && used + 1 + w <= perLine) {
      used += 1 + w;
      continue;
    }
    lines += 1;
    used = w;
    while (used > perLine) {
      lines += 1;
      used -= perLine;
    }
  }
  return lines;
}

/** Widest single unbreakable token (px) in a whitespace-separated string — the
 *  horizontal half of the law: a token wider than the box is what makes text
 *  paint outside it when word-breaking is off. */
export function widestToken(text: string, fontPx: number, letterSpacingPx = 0): number {
  let widest = 0;
  for (const word of text.split(/\s+/)) widest = Math.max(widest, monoTextWidth(word, fontPx, letterSpacingPx));
  return widest;
}

/** The card's INNER content box (px) — the fixed card minus its padding on both
 *  sides and its 1px border on both sides (box-sizing: border-box). */
export function refitCardInnerBox(): { w: number; h: number } {
  const chrome = 2 * (R.pad + REFIT_TYPE.border);
  return { w: R.card - chrome, h: R.cardHeight - chrome };
}

// --- THE DAMAGE CONTROL STRIP (cycle 46) ---------------------------------------
//
// The strip is the same shape of problem as the card, one axis at a time: a
// FIXED box (924 × `stripHeight`) holding mono text whose length is CONFIG-
// driven (the amounts are printed from `CONFIG.damageControl`, never hardcoded,
// so a retune moves the copy). It is measured here for the same reason the card
// is — so the amendment-47 pin is arithmetic over the real strings rather than a
// hope.
//
// The VERTICAL axis is still the scarce one, but the scarcity moved up a level
// in cycle 47: the rail is no longer squeezed into whatever the card row left
// over (22px), it is a ruled 40px and the BAND ANCHOR absorbed the cost. Inside
// the rail, the 22px key chip is the tallest mark and therefore sets the inner
// box; `stripPadY` is real padding around it rather than the zero cycle 46 had
// to live with. Horizontally the rail is now comfortable — the widest copy
// spends roughly 705 of 894px — so this model's live job is to keep BOTH of
// those true as the copy and the type register drift.

/** The rail's full width — the ratified row's width, since the strip renders as
 *  the row's sibling and stretches under it (`align-self: stretch`). DERIVED
 *  from the same card/gap register and the same wire-contract slot count the
 *  row is laid out from (`CONFIG.offer.size`), never restated as a literal. */
const STRIP_ROW_W = CONFIG.offer.size * R.card + (CONFIG.offer.size - 1) * R.gap;

/** The strip's INNER content box (px): the rail minus its padding and its 1px
 *  border on all four sides (box-sizing: border-box). The VERTICAL padding is
 *  load-bearing here — omitting it would let the model report a fitting rail
 *  whose marks actually paint into (or through) the padding cycle 47 added. */
export function refitStripInnerBox(): { w: number; h: number } {
  return {
    w: STRIP_ROW_W - 2 * (R.stripPad + REFIT_TYPE.border),
    h: R.stripHeight - 2 * (R.stripPadY + REFIT_TYPE.border),
  };
}

/** The rail's columns, left to right — exactly what ui/upgradeMenu builds. */
export interface RefitStripCopy {
  /** Key-chip glyph ('5'). */
  key: string;
  label: string;
  readout: string;
  /** The dual-coding status word — '' while ARMED (the absence IS the state). */
  status: string;
}

export interface RefitStripMetrics {
  innerW: number;
  innerH: number;
  /** Total width (px) of chip + gaps + every text column. */
  contentWidth: number;
  /** Rendered height (px) of the tallest mark on the rail — the taller of the
   *  text line box and the key chip, since both sit in the same flex row. */
  contentHeight: number;
  /** contentWidth − innerW: > 0 is a horizontal amendment-47 violation. */
  overflowX: number;
  /** contentHeight − innerH: > 0 is a vertical amendment-47 violation. */
  overflowY: number;
}

/**
 * Pure: the rail's rendered content against its fixed inner box. Mirrors the
 * DOM in ui/upgradeMenu.ts exactly — key chip, label, readout, optional status
 * word, with `stripColGap` between every pair that is actually built (an ARMED
 * strip builds no status span, so it spends no gap on one).
 */
export function refitStripMetrics(copy: RefitStripCopy): RefitStripMetrics {
  const { w: innerW, h: innerH } = refitStripInnerBox();
  const text = (s: string): number => monoTextWidth(s, R.stripFontSize, REFIT_TYPE.categoryLetterSpacing);
  const cols = [text(copy.label), text(copy.readout), ...(copy.status ? [text(copy.status)] : [])];
  const contentWidth =
    R.stripKeyChip + cols.reduce((a, b) => a + b, 0) + cols.length * R.stripColGap;
  const contentHeight = Math.max(R.stripKeyChip, lineBox(R.stripFontSize, REFIT_TYPE.lineHeight));
  return { innerW, innerH, contentWidth, contentHeight, overflowX: contentWidth - innerW, overflowY: contentHeight - innerH };
}

/** The copy a card face carries — structurally the ui/upgradeMenu OfferCard,
 *  restated here so the math module depends on nothing but strings. */
export interface RefitCardCopy {
  category: string;
  /** '' for a plain common — the absence IS the tier, and no span is built. */
  rarity: string;
  name: string;
  lineage: string | null;
  description: string;
}

/** Everything the fit pin asserts on, plus the intermediate line counts that
 *  make a failure diagnosable ("the rules text wrapped to 9 lines"). */
export interface RefitCardMetrics {
  innerW: number;
  innerH: number;
  /** Category + gap + rarity on the meta row: it must fit ONE line (the row is
   *  a flex pair — category left, tier hard right — and wrapping it both eats
   *  vertical rhythm and reads as broken). */
  metaWidth: number;
  metaLines: number;
  nameLines: number;
  descLines: number;
  /** Total rendered content height (px). */
  height: number;
  /** height − innerH: ≤ 0 is a fitting card, > 0 is an amendment-47 violation. */
  overflow: number;
}

/** Rendered height (px) of ONE line box: the declared line-height, ROUNDED UP.
 *  Browsers lay a line box out on whole pixels, so a 15px row at 1.25 occupies
 *  19px, not 18.75 — five of those is the 1.25px that would otherwise hide
 *  inside the model and spend the card's whole fit margin. */
function lineBox(fontPx: number, lh: number): number {
  return Math.ceil(fontPx * lh);
}

/** Rendered height (px) of one wrapped text row. */
function rowHeight(text: string, fontPx: number, ls: number, boxW: number, lh: number): number {
  return monoWrapLines(text, fontPx, ls, boxW) * lineBox(fontPx, lh);
}

/**
 * Pure: the rendered height of a card face's content, against its fixed inner
 * box. Mirrors makeCard()'s DOM exactly — meta row, ladder name, optional
 * lineage handrail, optional doctrine REPLACES line, rules text, with the flex
 * row gap between every pair. The description span is always built (even when
 * empty), so it always contributes its gap.
 */
export function refitCardMetrics(card: RefitCardCopy): RefitCardMetrics {
  const T = REFIT_TYPE;
  const { w: innerW, h: innerH } = refitCardInnerBox();
  const rarityW = card.rarity ? R.metaGap + monoTextWidth(card.rarity, R.raritySize, T.rarityLetterSpacing) : 0;
  const metaWidth = monoTextWidth(card.category, R.categorySize, T.categoryLetterSpacing) + rarityW;
  const metaLines = Math.max(1, Math.ceil(metaWidth / innerW));
  const nameLines = monoWrapLines(card.name, R.nameSize, T.nameLetterSpacing, innerW);
  const descLines = monoWrapLines(card.description, R.descSize, T.descriptionLetterSpacing, innerW);
  const lineageH = card.lineage ? rowHeight(card.lineage, R.lineageSize, T.lineageLetterSpacing, innerW, T.lineHeight) : 0;
  const rows = 3 + (card.lineage ? 1 : 0); // meta + name + rules text always
  const height =
    metaLines * lineBox(R.categorySize, T.lineHeight) +
    nameLines * lineBox(R.nameSize, T.lineHeight) +
    lineageH +
    descLines * lineBox(R.descSize, T.descLineHeight) +
    (rows - 1) * T.rowGap;
  return { innerW, innerH, metaWidth, metaLines, nameLines, descLines, height, overflow: height - innerH };
}
