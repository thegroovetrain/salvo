// THE CONTAINER-FIT LAW, applied to the refit card (amendment 47: "nothing
// anywhere in the game may render larger than its container — no text or element
// may extend past its box such that it covers, or can be covered by, another
// part of the UX").
//
// STORY 8.7 RE-CUT IT WHOLESALE. The card is no longer a fixed box holding
// WRAPPING prose: the ratified face (`hud-composite-3.html` `.rc`, epic-8
// amendment 31) is a 216×226 STAT BLOCK whose every text mark is `nowrap` —
// an uppercase name, a KIND word, two tier numerals, and five label/value rows.
// That turns the vertical axis into arithmetic a child could do (the rows are a
// fixed 17px grid) and moves the whole risk onto the HORIZONTAL axis: a mark
// wider than the 192px inner box would paint out through the card's side.
//
// So this module now answers two questions and no others:
//   • `cardNameSize(name)` — does the name fit the inner box at the mock's 15px,
//     or does it take the mock's own `.cn.long` 12.5px step? ONE decision, made
//     here, rendered by ui/upgradeMenu.ts, pinned over every catalog name by
//     __tests__/refitCardFit.test.ts.
//   • `refitCardMetrics(card)` — does every row's label + value pair fit one
//     192px line, and does the whole stack fit the 226px box?
//
// WHY THE MATH IS EXACT (and not a guess):
//   • MONO type. Every glyph on the card's mono marks advances by the same
//     width, so a line's width is chars × advance. The NAME is the one sans mark
//     and it is measured with the same mono model deliberately: 0.605em is an
//     UPPER bound for the declared display face, whose average advance sits well
//     under 0.6em, so a name that fits the model fits the render.
//   • FIXED line boxes. Every row's height is declared in CLIENT_CONFIG.refit
//     (the mock's own numbers) rather than inherited from `normal`, so the
//     modelled height IS the rendered height.

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
 * The card's type register — the letter-spacings, line boxes and border the mock
 * declares as `em` values, resolved to px HERE so ui/upgradeMenu.ts can splice
 * them into its CSS and this module can measure with the very same numbers.
 * ONE source of truth for the card's text metrics; the font SIZES themselves
 * live in CLIENT_CONFIG.refit with the rest of the face's geometry.
 *
 * Every tracking below is `size × the mock's em value`:
 *   name `.02em` · kind `.2em` · tier `.14em` · label `.14em` · value `.04em`
 *   · foot `.24em` · key chip `0`.
 */
export const REFIT_TYPE = {
  /** Letter-spacing (px) per card mark, from the mock's `em` values. */
  nameLetterSpacing: R.nameSize * 0.02,
  nameLetterSpacingLong: R.nameSizeLong * 0.02,
  kindLetterSpacing: R.kindSize * 0.2,
  tierLetterSpacing: R.tierSize * 0.14,
  labelLetterSpacing: R.labelSize * 0.14,
  valueLetterSpacing: R.valueSize * 0.04,
  footLetterSpacing: R.footSize * 0.24,
  /** The name's declared line box, as a MULTIPLIER (mock `15px/1.15`). */
  nameLineHeight: 1.15,
  /** Line-height MULTIPLIER for every other single-line mark on the card. */
  lineHeight: 1.2,
  /** The mock's vertical seams, top-down: icon→name, name→kind, kind→ladder,
   *  ladder→rows, rows→foot (`margin-top` on each of those blocks). */
  nameGap: 4,
  kindGap: 2,
  ladderGap: 4,
  rowsGap: 6,
  footGap: 2,
  /** The in-row arrow's horizontal margin (px) — mock `.rw .v .ar { margin:0 4px }`. */
  arrowMargin: 4,
  /** The `cur → next` tier numerals' offset from the last rung (mock `.tl`). */
  tierGap: 8,
  /** Card border width (px) — inside the border-box, so it eats inner space. */
  border: 1,
  /** The strip rail's own tracking — unchanged, and deliberately not one of the
   *  card's: the DAMAGE CONTROL rail is Story 8.8's to delete, not to re-cut. */
  categoryLetterSpacing: 1,
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

/**
 * The card's INNER content box (px) — the fixed card minus its ASYMMETRIC
 * padding and its 1px border on every side (box-sizing: border-box).
 *
 * The WIDTH the ratified face is specified against is the mock's own
 * `216 − 2×12 = 192`; the 1px border is carried in `boxW` below for the marks
 * that really do have to clear it, and the 192 is what the spec's row/name
 * budgets are quoted in. Both are exported so a failure names the number the
 * reader is holding.
 */
export function refitCardInnerBox(): { w: number; h: number } {
  return {
    w: R.card - 2 * R.pad.side,
    h: R.cardHeight - R.pad.top - R.pad.bottom - 2 * REFIT_TYPE.border,
  };
}

/**
 * Pure: the type size the NAME renders at — the mock's 15px `.cn`, or its own
 * `.cn.long` 12.5px step when the measured name does not fit the 192px inner
 * box on ONE line (the name is `nowrap`, so there is no third option).
 *
 * THE ONE DECISION, made once: ui/upgradeMenu.ts renders whatever this returns
 * and __tests__/refitCardFit.test.ts walks every catalog name through it, so a
 * 30th line cannot ship a name that paints out through the card's side.
 */
export function cardNameSize(name: string): number {
  const inner = refitCardInnerBox().w;
  const at15 = monoTextWidth(name, R.nameSize, REFIT_TYPE.nameLetterSpacing);
  return at15 <= inner ? R.nameSize : R.nameSizeLong;
}

/** Pure: the letter-spacing that goes with `cardNameSize`'s answer. */
export function cardNameTracking(name: string): number {
  return cardNameSize(name) === R.nameSize
    ? REFIT_TYPE.nameLetterSpacing
    : REFIT_TYPE.nameLetterSpacingLong;
}

/** Pure: the rendered width (px) of a name at the size this module picked for
 *  it — the horizontal half of the law, in one call. */
export function cardNameWidth(name: string): number {
  return monoTextWidth(name, cardNameSize(name), cardNameTracking(name));
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


// --- THE RATIFIED CARD FACE (Story 8.7, ruling 11) -----------------------------

/** The mock's `.rc.grey .foot { padding: 0 8px }` — the reason word's box. */
export const FOOT_BOX_PAD = 8;

/** The in-row / in-ladder arrow glyph, declared once so the model and the DOM
 *  cannot disagree about what a row actually prints. */
export const ARROW = '→';

/** ONE stat row of the ratified face: a label, the value the build has NOW
 *  (null on an absolute row — a weapon's first copy prints no `before`), and
 *  the value this card would produce. Structurally `boonCopy.CardStatRow`,
 *  restated here so the math module depends on nothing but strings. */
export interface RefitStatRow {
  label: string;
  cur: string | null;
  next: string;
}

/** The copy a card face carries — structurally the ui/upgradeMenu OfferCard,
 *  restated here so the math module depends on nothing but strings. */
export interface RefitCardCopy {
  /** The KIND word (WEAPON / UPGRADE / ADD-ON / CONSUMABLE) — the mock's `.ck`.
   *  CONSUMABLE is the widest, so it sets that mark's worst case. */
  kind: string;
  name: string;
  /** The `cur → next` tier numerals beside the ladder, or null for a line with
   *  no ladder at all (a consumable or an add-on). */
  tier: string | null;
  /** The line's ladder length — how many rungs the row draws. */
  cap: number;
  /** Up to `rowCount` stat rows; the remainder render blank. */
  rows: readonly RefitStatRow[];
  /** The foot's reason word — '' on every card but a refused one. */
  foot: string;
}

/** Everything the fit pin asserts on, plus the intermediates that make a
 *  failure diagnosable ("MAX HULL beside 1136.9 → 1307.4 is 204px of 192"). */
export interface RefitCardMetrics {
  innerW: number;
  innerH: number;
  /** The size `cardNameSize` picked, and the width the name renders at. */
  nameSize: number;
  nameWidth: number;
  /** The widest label+value pair across the card's rows (px). */
  widestRow: number;
  /** The whole ladder row's width (px), 0 when there is no ladder. */
  ladderWidth: number;
  /** The KIND word's width (px). */
  kindWidth: number;
  /** The foot word's width (px), its box included when it is a reason word. */
  footWidth: number;
  /** Total rendered content height (px) — a CONSTANT across the catalog, since
   *  every mark on the ratified face is `nowrap` and every block has a declared
   *  height. Computed rather than asserted, so a moved mock number moves the
   *  pin with it. */
  height: number;
  /** height − innerH: ≤ 0 is a fitting card, > 0 is an amendment-47 violation. */
  overflow: number;
  /** The widest single mark − innerW: ≤ 0 fits the box on the horizontal axis. */
  overflowX: number;
}

/** Pure: one stat row's rendered width (px) — label, then the value cell, which
 *  is `next` alone on an absolute row and `cur → next` with the mock's 4px
 *  arrow margins on a diff row. The row is `justify-content: space-between`, so
 *  its two ends only collide once their sum passes the inner box. */
export function statRowWidth(row: RefitStatRow): number {
  const label = monoTextWidth(row.label, R.labelSize, REFIT_TYPE.labelLetterSpacing);
  const value = monoTextWidth(row.next, R.valueSize, REFIT_TYPE.valueLetterSpacing);
  if (row.cur === null) return label + value;
  const cur = monoTextWidth(row.cur, R.valueSize, REFIT_TYPE.valueLetterSpacing);
  const arrow = monoTextWidth(ARROW, R.valueSize, REFIT_TYPE.valueLetterSpacing) + 2 * REFIT_TYPE.arrowMargin;
  return label + cur + arrow + value;
}

/** Pure: the whole LADDER row's width (px) — `cap` rungs at `rungW` with
 *  `ladderGap` between them, plus the `cur → next` numerals at their own
 *  `tierGap` offset. 0 for a line with no ladder. */
export function ladderRowWidth(cap: number, tier: string | null): number {
  if (tier === null) return 0;
  const rungs = cap * R.rungW + Math.max(0, cap - 1) * R.ladderGap;
  return rungs + REFIT_TYPE.tierGap + monoTextWidth(tier, R.tierSize, REFIT_TYPE.tierLetterSpacing);
}

/**
 * Pure: the ratified face measured against its fixed inner box. Mirrors
 * makeCard()'s DOM exactly, top-down — icon box · name · KIND word · ladder row
 * · the five-row grid · foot — with the mock's own `margin-top` seam between
 * each pair.
 */
export function refitCardMetrics(card: RefitCardCopy): RefitCardMetrics {
  const T = REFIT_TYPE;
  const { w: innerW, h: innerH } = refitCardInnerBox();
  const nameSize = cardNameSize(card.name);
  const nameWidth = cardNameWidth(card.name);
  const widestRow = card.rows.reduce((w, r) => Math.max(w, statRowWidth(r)), 0);
  const ladderWidth = ladderRowWidth(card.cap, card.tier);
  const kindWidth = monoTextWidth(card.kind, R.kindSize, T.kindLetterSpacing);
  const footWidth = card.foot === ''
    ? 0
    : monoTextWidth(card.foot, R.footSize, T.footLetterSpacing) + 2 * FOOT_BOX_PAD + 2 * T.border;
  const height =
    R.iconBox +
    T.nameGap + lineBox(nameSize, T.nameLineHeight) +
    T.kindGap + lineBox(R.kindSize, T.lineHeight) +
    T.ladderGap + R.ladderH +
    T.rowsGap + R.rowCount * R.rowH +
    T.footGap + R.footH;
  const widest = Math.max(nameWidth, widestRow, kindWidth, footWidth, ladderWidth);
  return {
    innerW, innerH, nameSize, nameWidth, widestRow, ladderWidth, kindWidth, footWidth,
    height, overflow: height - innerH, overflowX: widest - innerW,
  };
}

/** Rendered height (px) of ONE line box: the declared line-height, ROUNDED UP.
 *  Browsers lay a line box out on whole pixels, so a 15px name at 1.15 occupies
 *  18px, not 17.25 — and five of those quarter-pixels is the fit margin. */
function lineBox(fontPx: number, lh: number): number {
  return Math.ceil(fontPx * lh);
}
