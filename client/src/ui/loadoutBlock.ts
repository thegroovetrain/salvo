// THE LOADOUT BLOCK (Story 8.21, UX-DR55 / FR60) — the results modal's one
// build readout, replacing the pre-pool build list and the expired-offer strip.
//
// The design of record is DESIGN.md `{components.loadout-block}` + mockup
// `countdown-results-1.html` frame 2: a section head `LOADOUT`, then the HUD
// bar's own slot STACK AS IT ENDED at scale .72, then ONE line of the five ship
// ladders. Since Story 9.2 (epic-9 amendment 34) the stack is the live bar's
// D-prime twin: the six consumable squares in key order (1–6, zero-stock
// included) above the weapon row (gun · Shift · Q E R), each with its chip.
//
// A DOM TWIN, NOT A SECOND DERIVATION. The modal is DOM chrome, so the boxes are
// drawn twice — but every fact inside them comes from the bar's own sources:
//   • the glyph      `equipmentGlyphSvg` (the refit card's DOM glyph path)
//   • the tier       `slotTier` (the gun's rung off the fold, amendment 70)
//   • the stock      `stockBadgeText` (the bar's `×n`; zero/absent ⇒ no badge)
//   • the ramp       `tierRamp.ts` (the refit card's five tokens)
//   • the ladders    `cardTierSteps` over `boonStackCount`
//   • every size     `CLIENT_CONFIG.hudBar` × LOADOUT_SCALE
// No name renders on the row: the glyph is the name. An empty weapon square is
// the bar's own dashed box and `—`; a consumable kind whose stock ended at zero
// (it has left `cards`, Eric R4) is the bar's ZERO-STOCK square — dashed, its
// own glyph faint — never `×0` and never a word.
//
// THE 9 PX FLOOR (amendment 43) binds the RENDERED size: the SQUARES scale to
// .72, the TEXT does not — numerals, badges, chips and ladder labels all render
// at ≥ 9 px (9 × .72 would be 6.5 px). `results.test.ts` walks every element in
// the block and pins it.

import {
  CATALOG,
  CONSUMABLE_SLOTS,
  SLOT_BOOST,
  SLOT_COUNT,
  boonStackCount,
  consumableKindAt,
  isConsumableId,
  type LineId,
  type SlotItemId,
} from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { cssRgba } from '../util/color.js';
import { equipmentGlyphSvg } from '../render/equipmentIcons.js';
import { SLOT_KEY_GLYPHS, stockBadgeText, slotTier } from '../render/equipmentInfo.js';
import { boonName, cardTierSteps } from './boonCopy.js';
import { romanTier, tierTint } from './tierRamp.js';
import { SECTION_HEAD_CSS, type ResultsOwn } from './results.js';

const B = CLIENT_CONFIG.hudBar;
const C = CLIENT_CONFIG.colors;

/** The row's scale against the live bar (mock `.lo-row { transform: scale(.72) }`). */
export const LOADOUT_SCALE = 0.72;

/** A bar size at the block's scale, rounded to whole px. */
function scaled(v: number): number {
  return Math.round(v * LOADOUT_SCALE);
}

/** THE 9 PX FLOOR (amendment 43) — no text in the block renders under it. */
export const LOADOUT_TEXT_FLOOR_PX = 9;

/** Every box size of the stack: the bar's (`hudBar`) × LOADOUT_SCALE. The
 *  strip's stock badge box takes the 9 px floor's own height (+ its 1 px
 *  borders) where the scaled box would be shorter than its glyph. */
export const LOADOUT_PX = {
  slot: scaled(B.slot),
  stockSlot: scaled(B.stockSlot),
  icon: scaled(B.icon),
  stockIcon: scaled(B.stockIcon),
  slotGap: scaled(B.slotGap),
  stockGap: scaled(B.stockGap),
  stackGap: scaled(B.stackGap),
  chipH: scaled(B.chipH),
  chipMinW: scaled(B.chipMinW),
  chipPadX: scaled(B.chipPadX),
  chipGap: scaled(B.chipGap),
  stockChipGap: scaled(B.stockChipGap),
  badge: scaled(B.badge),
  badgeOverhang: scaled(B.badgeOverhang),
  stockBadge: Math.max(scaled(B.stockBadge), LOADOUT_TEXT_FLOOR_PX + 2),
  stockBadgeOverhang: scaled(B.stockBadgeOverhang),
  tierRight: scaled(B.tierInset.right),
  tierBottom: scaled(B.tierInset.bottom),
} as const;

/** Text sizes: the bar's own registers, floored — never scaled. The badge takes
 *  the floor itself so its `×n` fits the .72 badge box. */
const TEXT = {
  chip: Math.max(LOADOUT_TEXT_FLOOR_PX, B.type.chip),
  tier: Math.max(LOADOUT_TEXT_FLOOR_PX, B.type.tier),
  badge: LOADOUT_TEXT_FLOOR_PX,
} as const;

const P = LOADOUT_PX;
const MONO = 'var(--hc-font-mono)';

/** The seven ship ladders, in the ratified line order (PASSIVE HEALING last,
 *  Story 9.6; ARMOR right after HULL, Story 9.7 — Eric 2026-10-13). */
const LADDER_LINES: readonly LineId[] = [
  'hullPoints',
  'armor',
  'speed',
  'turning',
  'radarSweep',
  'reload',
  'passiveHealing',
];

/** Eric R2 (2026-09-30): ladders that start from nothing read `—` at ZERO
 *  copies rather than a numeral. Since Story 9.6 (Eric 2026-10-13, epic-9
 *  amendment 94) that is every ship ladder: HULL / SPEED / TURNING no longer
 *  sail at Tier I, and PASSIVE HEALING is new; ARMOR (Story 9.7) too. */
const DASH_AT_ZERO: ReadonlySet<LineId> = new Set<LineId>([
  'hullPoints',
  'armor',
  'speed',
  'turning',
  'radarSweep',
  'reload',
  'passiveHealing',
]);

/** The chip a keyless gun column carries (mock `.kc.ghost`) — laid out, never seen. */
const GHOST_CHIP = '·';

// --- the square skins: the bar's static READY / EMPTY skins (hotbar.ts SKINS) ---

interface SquareSkin {
  border: string;
  glow: string;
  iconAlpha: number;
}

const WEAPON_SKIN: SquareSkin = {
  border: `1px solid ${cssRgba(C.phosphor, 0.4)}`,
  glow: `0 0 ${scaled(10)}px ${cssRgba(C.phosphor, 0.15)}`,
  iconAlpha: 0.75,
};
const SHIFT_SKIN: SquareSkin = {
  border: `1px solid ${cssRgba(C.phosphor, 0.65)}`,
  glow: `0 0 ${scaled(14)}px ${cssRgba(C.phosphor, 0.2)}`,
  iconAlpha: 0.85,
};
const EMPTY_BORDER = `1px dashed ${cssRgba(C.textMuted, 0.45)}`;
/** The ZERO-STOCK glyph's alpha (hotbar.ts `SKINS.zeroStock`, mock `.slot.zero`). */
const ZERO_STOCK_ICON_ALPHA = 0.45;

// --- pure core -------------------------------------------------------------------

/** One ladder entry of the line under the row: its label and its tier, or null
 *  for R2's untaken dash. */
export interface LadderEntry {
  label: string;
  tier: number | null;
}

/** Pure: the five ladder entries for a build (`cards` with repeats intact). */
export function ladderEntries(cards: readonly string[]): LadderEntry[] {
  return LADDER_LINES.map((id) => {
    const copies = boonStackCount(cards, id);
    const label = boonName(id);
    if (copies === 0 && DASH_AT_ZERO.has(id)) return { label, tier: null };
    return { label, tier: cardTierSteps(CATALOG[id], copies)?.cur ?? null };
  });
}

/** Pure: the tier numeral a square prints — 0 for the Shift slot, an empty
 *  slot and every consumable slot (they carry stock, not a rung). */
export function loadoutSlotTier(own: ResultsOwn, slot: number): number {
  const id = own.slots[slot] ?? null;
  if (slot === SLOT_BOOST || id === null || isConsumableId(id)) return 0;
  return slotTier(own.stats, own.cards, id);
}

function isStock(slot: number): boolean {
  return CONSUMABLE_SLOTS.includes(slot);
}

// --- DOM ---------------------------------------------------------------------------

function span(css: string, text: string): HTMLSpanElement {
  const el = document.createElement('span');
  el.style.cssText = css;
  el.textContent = text;
  return el;
}

/** The key chip under a square (mock `.kc`): a muted hairline mono box; the
 *  gun's is a GHOST that keeps the row's baseline and is never seen. */
function makeChip(slot: number): HTMLSpanElement {
  const glyph = SLOT_KEY_GLYPHS[slot] ?? '';
  const ghost = glyph === '';
  const edge = ghost ? 'transparent' : cssRgba(C.textMuted, 0.55);
  const chip = span(
    [
      'display:inline-flex',
      'align-items:center',
      'justify-content:center',
      'box-sizing:border-box',
      `min-width:${P.chipMinW}px`,
      `height:${P.chipH}px`,
      `padding:0 ${P.chipPadX}px`,
      `border:1px solid ${edge}`,
      `color:${ghost ? 'transparent' : 'var(--hc-text-muted)'}`,
      `font:400 ${TEXT.chip}px/1 ${MONO}`,
      'letter-spacing:0',
      'white-space:nowrap',
    ].join(';'),
    ghost ? GHOST_CHIP : glyph,
  );
  chip.dataset.loadoutChip = String(slot);
  return chip;
}

/** The tier numeral in the square's bottom-right corner (mock `.tier`). */
function makeTier(tier: number): HTMLSpanElement {
  const el = span(
    [
      'position:absolute',
      `right:${P.tierRight}px`,
      `bottom:${P.tierBottom}px`,
      `font:600 ${TEXT.tier}px/1 ${MONO}`,
      'letter-spacing:.04em',
      `color:${tierTint(tier)}`,
    ].join(';'),
    romanTier(tier),
  );
  el.dataset.loadoutTier = '';
  return el;
}

/** A consumable's `×n` stock badge overhanging the square's top-right (mock
 *  `.strip .badge`). */
function makeBadge(text: string): HTMLSpanElement {
  const el = span(
    [
      'position:absolute',
      `top:${-P.stockBadgeOverhang}px`,
      `right:${-P.stockBadgeOverhang}px`,
      'box-sizing:border-box',
      `min-width:${P.stockBadge}px`,
      `height:${P.stockBadge}px`,
      `padding:0 ${P.chipPadX}px`,
      `background-color:${cssRgba(C.cardScrim, 0.95)}`,
      `border:1px solid ${cssRgba(C.phosphor, 0.5)}`,
      'color:var(--hc-phosphor)',
      `font:400 ${TEXT.badge}px/${P.stockBadge - 2}px ${MONO}`,
      'text-align:center',
      'letter-spacing:0',
    ].join(';'),
    text,
  );
  el.dataset.loadoutBadge = '';
  return el;
}

/** The square's box — sharp corners, transparent bed, the bar's skin (dashed
 *  when nothing is held: an empty weapon slot or a zero-stock kind). */
function squareBox(slot: number, filled: boolean): HTMLDivElement {
  const size = isStock(slot) ? P.stockSlot : P.slot;
  const skin = slot === SLOT_BOOST ? SHIFT_SKIN : WEAPON_SKIN;
  const box = document.createElement('div');
  box.style.cssText = [
    'position:relative',
    'flex:none',
    'box-sizing:border-box',
    `width:${size}px`,
    `height:${size}px`,
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'border-radius:0',
    `border:${filled ? skin.border : EMPTY_BORDER}`,
    `box-shadow:${filled ? skin.glow : 'none'}`,
  ].join(';');
  box.dataset.loadoutSlot = String(slot);
  return box;
}

/** The empty square's centred `—` (UX-DR41): muted, no word beside it. */
function makeEmptyDash(slot: number): HTMLSpanElement {
  const size = isStock(slot) ? P.stockIcon : P.icon;
  const el = span(`font:400 ${Math.max(LOADOUT_TEXT_FLOOR_PX, size)}px/1 ${MONO};color:${cssRgba(C.textMuted, 0.5)}`, '—');
  el.dataset.loadoutEmpty = '';
  return el;
}

/** The fitted square's glyph, in phosphor through `currentColor`. */
function makeGlyph(id: SlotItemId, slot: number): SVGSVGElement | null {
  const svg = equipmentGlyphSvg(id, isStock(slot) ? P.stockIcon : P.icon);
  if (svg === null) return null;
  const skin = slot === SLOT_BOOST ? SHIFT_SKIN : WEAPON_SKIN;
  svg.style.cssText = `display:block;color:var(--hc-phosphor);opacity:${skin.iconAlpha}`;
  return svg;
}

/** A ZERO-STOCK square's glyph: the kind's own, in the muted slate at .45. */
function makeZeroStockGlyph(kind: SlotItemId): SVGSVGElement | null {
  const svg = equipmentGlyphSvg(kind, P.stockIcon);
  if (svg === null) return null;
  svg.style.cssText = `display:block;color:var(--hc-text-muted);opacity:${ZERO_STOCK_ICON_ALPHA}`;
  svg.dataset.loadoutZeroStock = '';
  return svg;
}

/** The mark an UNHELD square shows: a zero-stock kind's faint glyph on the
 *  strip (its kind is fixed by the slot), the empty dash on the weapon row. */
function makeUnheldMark(slot: number): Element {
  const kind = consumableKindAt(slot);
  return (kind === null ? null : makeZeroStockGlyph(kind)) ?? makeEmptyDash(slot);
}

/** The corner mark: a tier numeral on the weapon row, a stock badge on the strip. */
function cornerMark(own: ResultsOwn, slot: number): HTMLSpanElement | null {
  if (isStock(slot)) {
    const text = stockBadgeText(own.ammo[slot] ?? null);
    return text === null ? null : makeBadge(text);
  }
  const tier = loadoutSlotTier(own, slot);
  return tier > 0 ? makeTier(tier) : null;
}

/** One square: the glyph + its corner mark, or the unheld mark. */
function makeSquare(own: ResultsOwn, slot: number): HTMLDivElement {
  const id = own.slots[slot] ?? null;
  const box = squareBox(slot, id !== null);
  if (id === null) {
    box.appendChild(makeUnheldMark(slot));
    return box;
  }
  const glyph = makeGlyph(id, slot);
  if (glyph !== null) box.appendChild(glyph);
  const mark = cornerMark(own, slot);
  if (mark !== null) box.appendChild(mark);
  return box;
}

/** One column (mock `.sw`): the square over its key chip (3 px on the strip,
 *  5 px on the weapon row — scaled). */
function makeColumn(own: ResultsOwn, slot: number): HTMLDivElement {
  const col = document.createElement('div');
  const gap = isStock(slot) ? P.stockChipGap : P.chipGap;
  col.style.cssText = `display:flex;flex-direction:column;align-items:center;gap:${gap}px`;
  col.append(makeSquare(own, slot), makeChip(slot));
  return col;
}

/** The consumable strip (1–6, key order) and the weapon row (gun · Shift ·
 *  Q E R) — unframed, as on the live bar. */
function makeGroups(own: ResultsOwn): [HTMLDivElement, HTMLDivElement] {
  const strip = document.createElement('div');
  strip.style.cssText = `display:flex;align-items:flex-start;gap:${P.stockGap}px`;
  const weapons = document.createElement('div');
  weapons.style.cssText = `display:flex;align-items:flex-start;gap:${P.slotGap}px`;
  for (let slot = 0; slot < SLOT_COUNT; slot += 1) {
    (isStock(slot) ? strip : weapons).appendChild(makeColumn(own, slot));
  }
  return [strip, weapons];
}

/** The stack: the strip above the weapon row, centred, `stackGap` apart. */
function makeRow(own: ResultsOwn): HTMLDivElement {
  const row = document.createElement('div');
  row.style.cssText = `display:flex;flex-direction:column;align-items:center;gap:${P.stackGap}px`;
  row.dataset.loadoutRow = '';
  row.append(...makeGroups(own));
  return row;
}

/** One ladder entry: the muted label, then its ramp numeral or R2's muted dash. */
function makeLadderEntry(entry: LadderEntry): HTMLSpanElement {
  const el = span('', entry.label);
  const mark = entry.tier === null ? '—' : romanTier(entry.tier);
  const tint = entry.tier === null ? 'var(--hc-text-muted)' : tierTint(entry.tier);
  el.appendChild(span(`font-weight:600;font-size:11px;margin-left:6px;letter-spacing:.1em;color:${tint}`, mark));
  return el;
}

/** Ladders per row of the ladder line (Story 9.6, epic-9 amendment 99; four
 *  since Story 9.7, Eric 2026-10-13, epic-9 amendment 114 — seven read 4 + 3). */
const LADDERS_PER_ROW = 4;

/** One row of the ladder line: its entries with a muted `·` between them. */
function makeLadderRow(entries: readonly LadderEntry[]): HTMLDivElement {
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;justify-content:center';
  entries.forEach((entry, i) => {
    if (i > 0) row.appendChild(span(`color:${cssRgba(C.textMuted, 0.5)};margin:0 12px`, '·'));
    row.appendChild(makeLadderEntry(entry));
  });
  return row;
}

/**
 * The seven ship ladders as TWO ROWS, FOUR OVER THREE (mock `.lo-lad`, re-cut
 * at Story 9.6 — Eric 2026-10-13, epic-9 amendment 99 — and again at Story 9.7,
 * amendment 114): with PASSIVE HEALING the one line of six ran past the
 * panel's 530 px content column, so it split into rows; with ARMOR, HULL ·
 * ARMOR · SPEED · TURNING sit over RADAR SWEEP · RELOAD · PASSIVE HEALING at
 * the same type, tracking and separators.
 */
function makeLadderLine(cards: readonly string[]): HTMLDivElement {
  const line = document.createElement('div');
  line.style.cssText = [
    'margin-top:12px',
    'display:flex',
    'flex-direction:column',
    'align-items:center',
    'gap:6px',
    `font:400 10px ${MONO}`,
    'letter-spacing:.16em',
    'text-transform:uppercase',
    'color:var(--hc-text-muted)',
    'white-space:nowrap',
  ].join(';');
  line.dataset.loadoutLadder = '';
  const entries = ladderEntries(cards);
  for (let i = 0; i < entries.length; i += LADDERS_PER_ROW) {
    line.appendChild(makeLadderRow(entries.slice(i, i + LADDERS_PER_ROW)));
  }
  return line;
}

/** The whole block: section head, the row, the ladder line. */
export function makeLoadoutBlock(own: ResultsOwn): HTMLElement {
  const block = document.createElement('div');
  block.dataset.loadoutBlock = '';
  const head = document.createElement('div');
  head.textContent = 'LOADOUT';
  head.style.cssText = SECTION_HEAD_CSS;
  block.append(head, makeRow(own), makeLadderLine(own.cards));
  return block;
}
