// THE LOADOUT BLOCK (Story 8.21, UX-DR55 / FR60) — the results modal's one
// build readout, replacing the pre-pool build list and the expired-offer strip.
//
// The design of record is DESIGN.md `{components.loadout-block}` + mockup
// `countdown-results-1.html` frame 2: a section head `LOADOUT`, then the HUD
// bar's own slot row AS IT ENDED at scale .72 (gun · Shift · Q E R · belt 1–4,
// each with its key chip), then ONE line of the five ship ladders.
//
// A DOM TWIN, NOT A SECOND DERIVATION. The modal is DOM chrome, so the boxes are
// drawn twice — but every fact inside them comes from the bar's own sources:
//   • the glyph      `equipmentGlyphSvg` (the refit card's DOM glyph path)
//   • the tier       `slotTier` (the gun's rung off the fold, amendment 70)
//   • the stock      `beltBadgeText` (the bar's `×n`; zero/absent ⇒ no badge)
//   • the ramp       `tierRamp.ts` (the refit card's five tokens)
//   • the ladders    `cardTierSteps` over `boonStackCount`
//   • every size     `CLIENT_CONFIG.hudBar` × LOADOUT_SCALE
// No name renders on the row: the glyph is the name. An empty square (a slot
// never fitted, or a belt stack fired to zero — it has left `cards`, Eric R4) is
// the bar's own dashed box and `—`, never `×0` and never a word.
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
  isConsumableId,
  type LineId,
  type SlotItemId,
} from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { cssRgba } from '../util/color.js';
import { equipmentGlyphSvg } from '../render/equipmentIcons.js';
import { SLOT_KEY_GLYPHS, slotTier } from '../render/equipmentInfo.js';
import { beltBadgeText } from '../render/hotbar.js';
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

/** Every box size of the row: the bar's (`hudBar`) × LOADOUT_SCALE. The group
 *  gap is the bar's one horizontal gap (mock `.lo-row { gap: 16px }`). */
export const LOADOUT_PX = {
  slot: scaled(B.slot),
  beltSlot: scaled(B.beltSlot),
  icon: scaled(B.icon),
  beltIcon: scaled(B.beltIcon),
  slotGap: scaled(B.slotGap),
  beltGap: scaled(B.beltGap),
  groupGap: scaled(B.globeGap),
  beltPadTop: scaled(B.beltPad.top),
  beltPadSide: scaled(B.beltPad.side),
  beltPadBottom: scaled(B.beltPad.bottom),
  chipH: scaled(B.chipH),
  chipMinW: scaled(B.chipMinW),
  chipPadX: scaled(B.chipPadX),
  chipGap: scaled(B.chipGap),
  badge: scaled(B.badge),
  badgeOverhang: scaled(B.badgeOverhang),
  beltBadgeOverhang: scaled(B.beltBadgeOverhang),
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

/** The five ship ladders, in the ratified line order. */
const LADDER_LINES: readonly LineId[] = ['armor', 'speed', 'turning', 'radarSweep', 'reload'];

/** Eric R2 (2026-09-30): these two start from nothing, so at ZERO copies they
 *  read `—` rather than a numeral. ARMOR / SPEED / TURNING sail at Tier I. */
const DASH_AT_ZERO: ReadonlySet<LineId> = new Set<LineId>(['radarSweep', 'reload']);

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
 *  slot and every belt slot (they carry stock, not a rung). */
export function loadoutSlotTier(own: ResultsOwn, slot: number): number {
  const id = own.slots[slot] ?? null;
  if (slot === SLOT_BOOST || id === null || isConsumableId(id)) return 0;
  return slotTier(own.stats, own.cards, id);
}

function isBelt(slot: number): boolean {
  return (CONSUMABLE_SLOTS as readonly number[]).includes(slot);
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

/** The belt's `×n` stock badge overhanging the square's top-right (mock `.belt .badge`). */
function makeBadge(text: string): HTMLSpanElement {
  const el = span(
    [
      'position:absolute',
      `top:${-P.beltBadgeOverhang}px`,
      `right:${-P.beltBadgeOverhang}px`,
      'box-sizing:border-box',
      `min-width:${P.badge}px`,
      `height:${P.badge}px`,
      `padding:0 ${P.chipPadX}px`,
      `background-color:${cssRgba(C.cardScrim, 0.95)}`,
      `border:1px solid ${cssRgba(C.phosphor, 0.5)}`,
      'color:var(--hc-phosphor)',
      `font:400 ${TEXT.badge}px/${P.badge - 2}px ${MONO}`,
      'text-align:center',
      'letter-spacing:0',
    ].join(';'),
    text,
  );
  el.dataset.loadoutBadge = '';
  return el;
}

/** The square's box — sharp corners, transparent bed, the bar's skin. */
function squareBox(slot: number, filled: boolean): HTMLDivElement {
  const size = isBelt(slot) ? P.beltSlot : P.slot;
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
  const size = isBelt(slot) ? P.beltIcon : P.icon;
  const el = span(`font:400 ${Math.max(LOADOUT_TEXT_FLOOR_PX, size)}px/1 ${MONO};color:${cssRgba(C.textMuted, 0.5)}`, '—');
  el.dataset.loadoutEmpty = '';
  return el;
}

/** The fitted square's glyph, in phosphor through `currentColor`. */
function makeGlyph(id: SlotItemId, slot: number): SVGSVGElement | null {
  const svg = equipmentGlyphSvg(id, isBelt(slot) ? P.beltIcon : P.icon);
  if (svg === null) return null;
  const skin = slot === SLOT_BOOST ? SHIFT_SKIN : WEAPON_SKIN;
  svg.style.cssText = `display:block;color:var(--hc-phosphor);opacity:${skin.iconAlpha}`;
  return svg;
}

/** The corner mark: a tier numeral on the main group, a stock badge on the belt. */
function cornerMark(own: ResultsOwn, slot: number): HTMLSpanElement | null {
  if (isBelt(slot)) {
    const text = beltBadgeText(own.ammo[slot] ?? null);
    return text === null ? null : makeBadge(text);
  }
  const tier = loadoutSlotTier(own, slot);
  return tier > 0 ? makeTier(tier) : null;
}

/** One square: the glyph + its corner mark, or the empty dash. */
function makeSquare(own: ResultsOwn, slot: number): HTMLDivElement {
  const id = own.slots[slot] ?? null;
  const box = squareBox(slot, id !== null);
  if (id === null) {
    box.appendChild(makeEmptyDash(slot));
    return box;
  }
  const glyph = makeGlyph(id, slot);
  if (glyph !== null) box.appendChild(glyph);
  const mark = cornerMark(own, slot);
  if (mark !== null) box.appendChild(mark);
  return box;
}

/** One column (mock `.sw`): the square over its key chip. */
function makeColumn(own: ResultsOwn, slot: number): HTMLDivElement {
  const col = document.createElement('div');
  col.style.cssText = `display:flex;flex-direction:column;align-items:center;gap:${P.chipGap}px`;
  col.append(makeSquare(own, slot), makeChip(slot));
  return col;
}

/** The main group (gun · Shift · Q E R) and the framed belt (1–4). */
function makeGroups(own: ResultsOwn): [HTMLDivElement, HTMLDivElement] {
  const main = document.createElement('div');
  main.style.cssText = `display:flex;align-items:flex-start;gap:${P.slotGap}px`;
  const belt = document.createElement('div');
  belt.style.cssText = [
    'display:flex',
    'align-items:flex-start',
    `gap:${P.beltGap}px`,
    `padding:${P.beltPadTop}px ${P.beltPadSide}px ${P.beltPadBottom}px`,
    `border:1px solid ${cssRgba(C.silver, 0.2)}`,
  ].join(';');
  for (let slot = 0; slot < SLOT_COUNT; slot += 1) {
    (isBelt(slot) ? belt : main).appendChild(makeColumn(own, slot));
  }
  return [main, belt];
}

function makeRow(own: ResultsOwn): HTMLDivElement {
  const row = document.createElement('div');
  row.style.cssText = `display:flex;justify-content:center;align-items:flex-start;gap:${P.groupGap}px`;
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

/** The line of the five ship ladders (mock `.lo-lad`). */
function makeLadderLine(cards: readonly string[]): HTMLDivElement {
  const line = document.createElement('div');
  line.style.cssText = [
    'margin-top:12px',
    'display:flex',
    'justify-content:center',
    `font:400 10px ${MONO}`,
    'letter-spacing:.16em',
    'text-transform:uppercase',
    'color:var(--hc-text-muted)',
    'white-space:nowrap',
  ].join(';');
  line.dataset.loadoutLadder = '';
  ladderEntries(cards).forEach((entry, i) => {
    if (i > 0) line.appendChild(span(`color:${cssRgba(C.textMuted, 0.5)};margin:0 12px`, '·'));
    line.appendChild(makeLadderEntry(entry));
  });
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
