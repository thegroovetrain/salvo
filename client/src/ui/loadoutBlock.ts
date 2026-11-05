// THE LOADOUT BLOCK (Story 8.21, UX-DR55 / FR60) — the results modal's one
// build readout, replacing the pre-pool build list and the expired-offer strip.
//
// The design of record is DESIGN.md `{components.loadout-block}` + mockup
// `countdown-results-1.html` frame 2: a section head `LOADOUT`, then the HUD
// bar's own slot row AS IT ENDED at scale .72 (gun · Shift · Q E R, each with
// its key chip), then the line of the ship ladders. STORY 10.5 (2026-11-05,
// epic-10 amendment 10): the framed consumable belt left with the kit, and the
// two cooldown abilities (`C` / `V`) are not drawn here — every captain has the
// same two, so they say nothing about a build [Story 10.5 reading].
//
// A DOM TWIN, NOT A SECOND DERIVATION. The modal is DOM chrome, so the boxes are
// drawn twice — but every fact inside them comes from the bar's own sources:
//   • the glyph      `equipmentGlyphSvg` (the refit card's DOM glyph path)
//   • the tier       `slotTier` (the gun's rung off the fold, amendment 70)
//   • the ramp       `tierRamp.ts` (the refit card's five tokens)
//   • the ladders    `cardTierSteps` over `boonStackCount`
//   • every size     `CLIENT_CONFIG.hudBar` × LOADOUT_SCALE
// No name renders on the row: the glyph is the name. An empty weapon square is
// the bar's own dashed box and `—`.
//
// THE 9 PX FLOOR (amendment 43) binds the RENDERED size: the SQUARES scale to
// .72, the TEXT does not — numerals, chips and ladder labels all render
// at ≥ 9 px (9 × .72 would be 6.5 px). `results.test.ts` walks every element in
// the block and pins it.

import {
  CATALOG,
  SLOT_BOOST,
  SLOT_COUNT,
  boonStackCount,
  type EquipmentId,
  type LineId,
} from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { cssRgba } from '../util/color.js';
import { equipmentGlyphSvg } from '../render/equipmentIcons.js';
import { SLOT_KEY_GLYPHS, slotTier } from '../render/equipmentInfo.js';
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
  icon: scaled(B.icon),
  slotGap: scaled(B.slotGap),
  chipH: scaled(B.chipH),
  chipMinW: scaled(B.chipMinW),
  chipPadX: scaled(B.chipPadX),
  chipGap: scaled(B.chipGap),
  tierRight: scaled(B.tierInset.right),
  tierBottom: scaled(B.tierInset.bottom),
} as const;

/** Text sizes: the bar's own registers, floored — never scaled. */
const TEXT = {
  chip: Math.max(LOADOUT_TEXT_FLOOR_PX, B.type.chip),
  tier: Math.max(LOADOUT_TEXT_FLOOR_PX, B.type.tier),
} as const;

const P = LOADOUT_PX;
const MONO = 'var(--hc-font-mono)';

/** The six ship ladders, in the ratified line order. Story 10.3 (Eric
 *  2026-11-04, epic-10 amendment 8) deleted HULL (`hullPoints`) and PASSIVE
 *  HEALING (`passiveHealing`), made the six +20 index cards and set the line
 *  in the INDEX order (amendment 6(c), the SHIP panel's own — RANGE has no
 *  card): ARMOR · POWER · RELOAD over ENGINES · RUDDER · INTEL. */
const LADDER_LINES: readonly LineId[] = [
  'armor',
  'power',
  'reload',
  'engines',
  'rudder',
  'intel',
];

/** Eric R2 (2026-09-30): ladders that start from nothing read `—` at ZERO
 *  copies rather than a numeral. Since Story 9.6 (Eric 2026-10-13, epic-9
 *  amendment 94) that is every ship ladder: HULL / SPEED / TURNING no longer
 *  sail at Tier I; ARMOR (Story 9.7) and ARMOR PIERCING (Story 9.9,
 *  amendment 159) too. The six since Story 10.3 (epic-10 amendment 8). */
const DASH_AT_ZERO: ReadonlySet<LineId> = new Set<LineId>([
  'armor',
  'power',
  'engines',
  'rudder',
  'intel',
  'reload',
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

// --- pure core -------------------------------------------------------------------

/** One ladder entry of the line under the row: its label and its tier, or null
 *  for R2's untaken dash. */
export interface LadderEntry {
  label: string;
  tier: number | null;
}

/** Pure: the six ladder entries for a build (`cards` with repeats intact). */
export function ladderEntries(cards: readonly string[]): LadderEntry[] {
  return LADDER_LINES.map((id) => {
    const copies = boonStackCount(cards, id);
    const label = boonName(id);
    if (copies === 0 && DASH_AT_ZERO.has(id)) return { label, tier: null };
    return { label, tier: cardTierSteps(CATALOG[id], copies)?.cur ?? null };
  });
}

/** Pure: the tier numeral a square prints — 0 for the Shift slot and an
 *  empty slot. */
export function loadoutSlotTier(own: ResultsOwn, slot: number): number {
  const id = own.slots[slot] ?? null;
  if (slot === SLOT_BOOST || id === null) return 0;
  return slotTier(own.stats, own.cards, id);
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

/** The square's box — sharp corners, transparent bed, the bar's skin (dashed
 *  when nothing is held). */
function squareBox(slot: number, filled: boolean): HTMLDivElement {
  const size = P.slot;
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
function makeEmptyDash(): HTMLSpanElement {
  const size = P.icon;
  const el = span(`font:400 ${Math.max(LOADOUT_TEXT_FLOOR_PX, size)}px/1 ${MONO};color:${cssRgba(C.textMuted, 0.5)}`, '—');
  el.dataset.loadoutEmpty = '';
  return el;
}

/** The fitted square's glyph, in phosphor through `currentColor`. */
function makeGlyph(id: EquipmentId, slot: number): SVGSVGElement | null {
  const svg = equipmentGlyphSvg(id, P.icon);
  if (svg === null) return null;
  const skin = slot === SLOT_BOOST ? SHIFT_SKIN : WEAPON_SKIN;
  svg.style.cssText = `display:block;color:var(--hc-phosphor);opacity:${skin.iconAlpha}`;
  return svg;
}

/** One square: the glyph + its tier numeral, or the empty dash. */
function makeSquare(own: ResultsOwn, slot: number): HTMLDivElement {
  const id = own.slots[slot] ?? null;
  const box = squareBox(slot, id !== null);
  if (id === null) {
    box.appendChild(makeEmptyDash());
    return box;
  }
  const glyph = makeGlyph(id, slot);
  if (glyph !== null) box.appendChild(glyph);
  const tier = loadoutSlotTier(own, slot);
  if (tier > 0) box.appendChild(makeTier(tier));
  return box;
}

/** One column (mock `.sw`): the square over its key chip. */
function makeColumn(own: ResultsOwn, slot: number): HTMLDivElement {
  const col = document.createElement('div');
  col.style.cssText = `display:flex;flex-direction:column;align-items:center;gap:${P.chipGap}px`;
  col.append(makeSquare(own, slot), makeChip(slot));
  return col;
}

/** The ONE row: gun · Shift · Q E R, `slotGap` apart — every loadout slot. */
function makeRow(own: ResultsOwn): HTMLDivElement {
  const row = document.createElement('div');
  row.style.cssText = `display:flex;justify-content:center;align-items:flex-start;gap:${P.slotGap}px`;
  row.dataset.loadoutRow = '';
  for (let slot = 0; slot < SLOT_COUNT; slot += 1) row.appendChild(makeColumn(own, slot));
  return row;
}

/** The ladder line's CSS metrics, single-sourced so the 4 + 4 fit test reads
 *  the very numbers the inline styles use (Story 9.9, epic-9 amendment 160). */
export const LADDER_LINE_PX = Object.freeze({
  labelPx: 10,
  labelTrackingEm: 0.16,
  numeralPx: 11,
  numeralTrackingEm: 0.1,
  numeralGapPx: 6,
  separatorMarginPx: 12,
});

/** One ladder entry: the muted label, then its ramp numeral or R2's muted dash. */
function makeLadderEntry(entry: LadderEntry): HTMLSpanElement {
  const el = span('', entry.label);
  const mark = entry.tier === null ? '—' : romanTier(entry.tier);
  const tint = entry.tier === null ? 'var(--hc-text-muted)' : tierTint(entry.tier);
  el.appendChild(span(`font-weight:600;font-size:${LADDER_LINE_PX.numeralPx}px;margin-left:${LADDER_LINE_PX.numeralGapPx}px;letter-spacing:${LADDER_LINE_PX.numeralTrackingEm}em;color:${tint}`, mark));
  return el;
}

/** Ladders per row of the ladder line (Story 9.6, epic-9 amendment 99; four
 *  since Story 9.7, Eric 2026-10-13, epic-9 amendment 114 — seven read 4 + 3;
 *  kept at four in Story 9.9, Eric's pick on the rendered page, epic-9
 *  amendment 160 — eight read 4 + 4). THREE again since Story 10.3: the six
 *  index ladders read 3 + 3 (amendment 99's two rows of three return). */
const LADDERS_PER_ROW = 3;

/** One row of the ladder line: its entries with a muted `·` between them. */
function makeLadderRow(entries: readonly LadderEntry[]): HTMLDivElement {
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;justify-content:center';
  entries.forEach((entry, i) => {
    if (i > 0) row.appendChild(span(`color:${cssRgba(C.textMuted, 0.5)};margin:0 ${LADDER_LINE_PX.separatorMarginPx}px`, '·'));
    row.appendChild(makeLadderEntry(entry));
  });
  return row;
}

/**
 * The six ship ladders as TWO ROWS, THREE OVER THREE (mock `.lo-lad`, re-cut
 * at Story 9.6 — Eric 2026-10-13, epic-9 amendment 99 — again at Story 9.7,
 * amendment 114, at Story 9.9, amendment 160, and at Story 10.3): ARMOR ·
 * POWER · RELOAD sit over ENGINES · RUDDER · INTEL at the same type, tracking
 * and separators (a single line of six would run past the panel's 530 px
 * content column at its widest numerals).
 */
function makeLadderLine(cards: readonly string[]): HTMLDivElement {
  const line = document.createElement('div');
  line.style.cssText = [
    'margin-top:12px',
    'display:flex',
    'flex-direction:column',
    'align-items:center',
    'gap:6px',
    `font:400 ${LADDER_LINE_PX.labelPx}px ${MONO}`,
    `letter-spacing:${LADDER_LINE_PX.labelTrackingEm}em`,
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
