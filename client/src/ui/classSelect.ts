// Class-select layer (Story 1.14) — the "cards side by side" pick that OPENS
// over the dimmed/blurred home (ui/home.ts), per the ratified mock
// (home-class-picker-1.html `.layer`). Since Story 10.4: FOUR ship cards (356px)
// on a horizontal scroll rail (the dashed "more classes" ghost card is gone —
// four cards fill the panel), each card carrying the
// differences that matter: hull silhouette (the shared polygon via
// util/silhouetteSvg), three real-value pip scales (util/pips against
// absolute anchors). The weapon-row block is EMPTY on every card since Story
// 8.10 (amendment 62 — no hull spawns with a class weapon any more). Story 10.4
// replaces the DECK GUN chip row with the SHIFT pick in the same chip grammar:
// row key `SPECIAL`, three chips SPEED BOOST · INSTANT RELOAD · HUNKER — ONE
// pick for the captain, shared by every card (the Shift is the seat's, not the
// hull's, so the read-only SPECIAL row went too). The Color Hoist is gone (R6):
// the selection accent is the OWN relation color (ui/ownAccent.ts). The footer
// carries the CONSUMABLES row and CONFIRM SELECTION — which saves the pick and
// returns to port. It never deploys: PLAY is the single launch path.
//
// Card click (whole card, including its in-card SELECT button — same element)
// only HIGHLIGHTS: it moves the highlight to that card and repaints, exactly
// like a digit press, and never closes the layer. Keyboard: 1-4 + arrows
// move the highlight, Enter ≡ CONFIRM SELECTION, ESC closes without change —
// all gated OFF whenever a text input is focused (the callsign field keeps
// its own Enter=PLAY). Colors/typography via CLIENT_CONFIG tokens (cssHex/
// cssRgba for the own accent, which has no --hc-* var; registerCss for
// the DESIGN type ramp). DESIGN spine over mock: CONFIRM SELECTION is an
// amber OUTLINE+GLOW primary button (never a filled slab).

import {
  CONFIG,
  DEFAULT_KIT,
  DEFAULT_SHIFT,
  SHIFT_IDS,
  SHIP_CLASS_IDS,
  isConsumableKit,
  type ConsumableKit,
  type ShiftId,
  type ShipClassId,
} from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { applyViewportCap } from './fit.js';
import { cssHex, cssRgba } from '../util/color.js';
import { silhouetteSvg } from '../util/silhouetteSvg.js';
import { pipFill } from '../util/pips.js';
import { OWN_ACCENT, type OwnAccent } from './ownAccent.js';
import { registerCss } from './theme.js';
import { monoTextWidth } from './refitCardFit.js';
import { CLASS_DISPLAY_NAMES } from './classNames.js';
import {
  LOADOUT_KEY_COL_PX,
  LOADOUT_KEY_GAP_PX,
  LOADOUT_KEY_TRACKING_EM,
  LOADOUT_VALUE_PX,
  LOADOUT_VALUE_TRACKING_EM,
} from './loadoutGrammar.js';
import { makeKitRow, openKitPicker, type KitPickerHandle, type KitRow } from './kitPicker.js';

const C = CLIENT_CONFIG.colors;

// --- class display data (verbatim rulings) -----------------------------------

/** Two-word display names the ship-class id can't produce — moved to the leaf
 *  `ui/classNames.ts` in cycle 158 so the HUD's SHIP tooltip can read it. */
export { CLASS_DISPLAY_NAMES };

interface LoadoutRow {
  key: string;
  value: string;
}

/**
 * THE SHIFT's player-facing NAME, per Shift id (Story 8.15, Eric ruling
 * 2026-09-28, epic-8 amendment 107). NAMES ONLY — amendment 96(c): "Any
 * description should be in the modal, not as subtext on the button that opens
 * it", and the modal is Story 9.4's LOADOUT screen. The row key is `SPECIAL`,
 * never "Shift" (amendment 96(e): "shift can be reassigned").
 */
export const SPECIAL_NAMES: Readonly<Record<ShiftId, string>> = {
  boost: 'SPEED BOOST',
  instantReload: 'INSTANT RELOAD',
  hunker: 'HUNKER',
};

/** The Shift chip row's key (amendment 96(e)'s word — never "Shift"). */
export const SPECIAL_KEY = 'SPECIAL';

/**
 * The card's read-only loadout rows: NONE since Story 10.4. The Shift is the
 * captain's pick (the chip row `buildShiftRow` draws), not the hull's, so the
 * `SPECIAL · <the hull's Shift>` row went with `classShift`. Eric ruling
 * 2026-07-24 stands: NO fantasy tagline — "the card sells what differs".
 */
function loadoutRows(): readonly LoadoutRow[] {
  return [];
}

// --- THE CONTAINER-FIT LAW ON THE CARD (amendment 47) ---------------------------
//
// The card is a FIXED 356 px flex-basis with 22 px side padding, so every row
// shares one 312 px inner line. The class bay is PORT chrome and does NOT ride
// `--hc-ui-scale` (ui/theme.ts UI_SCALE_VAR), so these widths hold at every
// UI-scale tier; the pins in __tests__/classSelect.test.ts measure them with
// the refit card's mono model (`monoTextWidth`).

export {
  CARD_INNER_PX,
  LOADOUT_KEY_COL_PX,
  LOADOUT_KEY_GAP_PX,
  LOADOUT_KEY_TRACKING_EM,
  LOADOUT_VALUE_PX,
  LOADOUT_VALUE_TRACKING_EM,
} from './loadoutGrammar.js';
/** The Shift chips (Story 10.4 — the retired gun chips' grammar): hudMicro-
 *  sized mono, tighter tracking than the register's 0.18em. The three Shift
 *  names are longer than the three gun names were, so the row WRAPS rather
 *  than shrinking the type; each chip alone fits the card's inner line. */
export const SHIFT_CHIP_TRACKING_EM = 0.1;
export const SHIFT_CHIP_PAD_X_PX = 8;
export const SHIFT_CHIP_GAP_PX = 6;
export const SHIFT_CHIP_BORDER_PX = 1;

// --- pure view-model + input helpers (tested) --------------------------------

interface PipRow {
  label: string;
  /** The index this row reads (Story 10.3) — its anchor is `home.pip[index]`. */
  index: PipIndex;
  filled: number; // 1..5
}

/** The three indices the hull card shows, in row order (Story 10.3). */
type PipIndex = keyof typeof CLIENT_CONFIG.home.pip;

/** The three pip rows: ENGINES / ARMOR / RUDDER (Story 10.3 — the index words;
 *  until 10.3 SPEED / HULL / TURNING on raw speed, hp and turn rate). */
const PIP_ROWS: readonly { label: string; index: PipIndex }[] = [
  { label: 'ENGINES', index: 'engines' },
  { label: 'ARMOR', index: 'armor' },
  { label: 'RUDDER', index: 'rudder' },
];

export interface CardViewModel {
  cls: ShipClassId;
  name: string;
  /** DISPLAYED zero-padded card key ('01'..'04'). */
  key: string;
  pips: PipRow[];
  loadout: readonly LoadoutRow[];
}

/**
 * The card's data per class: name, zero-padded key (index+1), the three
 * index pips (util/pips against the index anchors), and the read-only
 * loadout rows — EMPTY for every hull since Story 10.4. Pure — the DOM builder + tests consume it.
 */
/**
 * The pip grid's LABEL COLUMN (px) and the label's own letter-spacing (em) —
 * exported because `__tests__/classSelect.test.ts` measures every pip label
 * against them, and a pin that re-typed the numbers would drift off the CSS it
 * claims to be about.
 *
 * THIS COLUMN IS WHY THE ARMOR ROW IS CALLED ARMOR (Eric ruling 2026-08-21:
 * *"on ship select, change 'toughness' to 'armor' so the text fits better."*).
 * The column is fixed, the face is mono, and the label carries a 0.16em track,
 * so `TOUGHNESS` measured 9 x (14 x 0.605 + 2.24) = 96.4px into an 88px cell and
 * overflowed it. `ARMOR` was 53.6px and `TURNING` 75.0px. The middle row read
 * `HULL` from Story 9.6 (epic-9 amendment 93) until Story 10.3 made the three
 * rows indices — `ENGINES` / `ARMOR` / `RUDDER` (Eric 2026-11-04): `ENGINES`,
 * the longest, is 7 chars = 75.0px, so the column ruling holds. The column is deliberately NOT shrunk to match: it was never the
 * thing at fault, and narrowing it would re-open the same trap for the next
 * label somebody adds.
 */
export const PIP_LABEL_COL_PX = 88;
export const PIP_LABEL_TRACKING_EM = 0.16;

export function cardViewModel(cls: ShipClassId): CardViewModel {
  const spec = CONFIG.shipClasses[cls];
  const anchors = CLIENT_CONFIG.home.pip;
  return {
    cls,
    name: CLASS_DISPLAY_NAMES[cls],
    key: String(SHIP_CLASS_IDS.indexOf(cls) + 1).padStart(2, '0'),
    pips: PIP_ROWS.map(({ label, index }) => ({ label, index, filled: pipFill(spec.index[index], anchors[index]) })),
    loadout: loadoutRows(),
  };
}

export type LayerAction =
  | { kind: 'highlight'; index: number }
  | { kind: 'move'; dir: -1 | 1 }
  | { kind: 'pick' }
  | { kind: 'close' }
  | null;

/**
 * Map a keydown key to a layer action, or null (ignored). 1..cardCount jump the
 * highlight to that card; arrows step it; Enter confirms the highlight (≡ the
 * footer's CONFIRM SELECTION); ESC closes.
 * The caller suppresses this entirely while a text input is focused.
 */
export function keyAction(key: string, cardCount: number): LayerAction {
  if (key === 'Escape') return { kind: 'close' };
  if (key === 'Enter') return { kind: 'pick' };
  if (key === 'ArrowLeft' || key === 'ArrowUp') return { kind: 'move', dir: -1 };
  if (key === 'ArrowRight' || key === 'ArrowDown') return { kind: 'move', dir: 1 };
  const n = Number(key);
  if (Number.isInteger(n) && n >= 1 && n <= cardCount) return { kind: 'highlight', index: n - 1 };
  return null;
}

/** Wrap-around highlight movement (arrows). */
export function moveHighlight(current: number, dir: number, count: number): number {
  if (count <= 0) return 0;
  return (((current + dir) % count) + count) % count;
}

// --- card DOM ----------------------------------------------------------------

interface CardEls {
  cls: ShipClassId;
  root: HTMLElement;
  silbox: HTMLElement;
  cname: HTMLElement;
  pipEls: HTMLElement[][]; // [row][pip]
  pipFilled: number[]; // filled count per row
  pickBtn: HTMLElement;
  /** The three Shift chips (Story 10.4), keyed by Shift id. */
  chips: Map<ShiftId, HTMLButtonElement>;
  silverStroke: string;
}

const CARD_BASE = [
  'flex:0 0 356px',
  'background:var(--hc-panel-deep)',
  'border:1px solid var(--hc-hairline)',
  'border-radius:10px',
  'padding:20px 22px 18px',
  'display:flex',
  'flex-direction:column',
  'cursor:pointer',
].join(';');

function buildCardHead(vm: CardViewModel): HTMLElement {
  const head = document.createElement('div');
  head.style.cssText = 'display:flex;align-items:baseline;justify-content:space-between';
  const name = document.createElement('span');
  name.className = 'hc-cname';
  name.textContent = vm.name;
  name.style.cssText = 'font:700 24px var(--hc-font-display);letter-spacing:0.05em;color:var(--hc-text-primary)';
  const key = document.createElement('span');
  key.textContent = vm.key;
  key.style.cssText = `${registerCss('hudMicro')};color:var(--hc-phosphor);letter-spacing:0.1em`;
  head.append(name, key);
  return head;
}

function buildSilbox(): HTMLElement {
  const box = document.createElement('div');
  box.style.cssText =
    'height:158px;display:flex;align-items:center;justify-content:center;background:var(--hc-void);' +
    'border:1px solid var(--hc-hairline);border-radius:7px;margin:12px 0 14px';
  return box;
}

function pipCell(): HTMLElement {
  const p = document.createElement('span');
  p.style.cssText = 'width:22px;height:7px;border-radius:2px;background:var(--hc-hairline)';
  return p;
}

/** A pip-scale grid (ENGINES/ARMOR/RUDDER × 5 bars); returns the row cells. */
function buildPips(vm: CardViewModel): { el: HTMLElement; rows: HTMLElement[][] } {
  const grid = document.createElement('div');
  grid.style.cssText =
    `display:grid;grid-template-columns:${PIP_LABEL_COL_PX}px 1fr;row-gap:6px;align-items:center`;
  const rows: HTMLElement[][] = [];
  for (const pr of vm.pips) {
    const label = document.createElement('span');
    label.textContent = pr.label;
    label.style.cssText =
      `${registerCss('hudMicro')};color:var(--hc-phosphor);letter-spacing:${PIP_LABEL_TRACKING_EM}em`;
    const dots = document.createElement('span');
    dots.style.cssText = 'display:flex;gap:5px';
    const cells: HTMLElement[] = [];
    for (let i = 0; i < 5; i++) {
      const cell = pipCell();
      cells.push(cell);
      dots.appendChild(cell);
    }
    rows.push(cells);
    grid.append(label, dots);
  }
  return { el: grid, rows };
}

/** The loadout block: the read-only rows (none since Story 10.4) and — always —
 *  the Shift chip row the caller appends, so the block never paints its seam
 *  and rule above nothing. */
function buildLoadout(vm: CardViewModel): HTMLElement {
  const wrap = document.createElement('div');
  wrap.style.cssText =
    'margin-top:12px;border-top:1px solid var(--hc-hairline);padding-top:11px;' +
    'display:flex;flex-direction:column;gap:5px';
  for (const slot of vm.loadout) {
    const row = document.createElement('div');
    row.style.cssText = `display:flex;gap:${LOADOUT_KEY_GAP_PX}px;align-items:baseline`;
    const v = document.createElement('span');
    v.textContent = slot.value;
    v.style.cssText =
      `font:500 ${LOADOUT_VALUE_PX}px var(--hc-font-mono);letter-spacing:${LOADOUT_VALUE_TRACKING_EM}em;` +
      'color:var(--hc-text-primary);white-space:nowrap';
    row.append(rowKey(slot.key, `flex:0 0 ${LOADOUT_KEY_COL_PX}px`), v);
    wrap.appendChild(row);
  }
  return wrap;
}

/** One row KEY in the loadout grammar (phosphor hudMicro, 0.14em). */
function rowKey(text: string, extra: string): HTMLElement {
  const k = document.createElement('span');
  k.textContent = text;
  k.style.cssText =
    `${registerCss('hudMicro')};${extra};color:var(--hc-phosphor);letter-spacing:${LOADOUT_KEY_TRACKING_EM}em`;
  return k;
}

/**
 * Pure: the rendered width (px) of ONE Shift chip — the container-fit pin's
 * model (text + side padding + borders). Every chip must stay ≤ CARD_INNER_PX;
 * the row wraps between chips.
 */
export function shiftChipWidth(id: ShiftId): number {
  const px = CLIENT_CONFIG.type.registers.hudMicro.size;
  const track = px * SHIFT_CHIP_TRACKING_EM;
  return monoTextWidth(SPECIAL_NAMES[id], px, track) + 2 * (SHIFT_CHIP_PAD_X_PX + SHIFT_CHIP_BORDER_PX);
}

/**
 * THE `SPECIAL` ROW (Story 10.4 — the retired DECK GUN row's grammar): the key
 * on its own line and the three Shift chips under it, wrapping. A chip is a
 * `<button>` painted in the card's own selected/unselected register by
 * `paintChips`. It does NOT stop propagation: picking a Shift on a card also
 * highlights that card, exactly like its in-card SELECT button.
 */
function buildShiftRow(onShift: (id: ShiftId) => void): { el: HTMLElement; chips: Map<ShiftId, HTMLButtonElement> } {
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-top:4px';
  const line = document.createElement('div');
  line.style.cssText = `display:flex;flex-wrap:wrap;gap:${SHIFT_CHIP_GAP_PX}px`;
  const chips = new Map<ShiftId, HTMLButtonElement>();
  for (const id of SHIFT_IDS) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'hc-shiftchip';
    chip.dataset.shift = id;
    chip.textContent = SPECIAL_NAMES[id];
    chip.style.cssText =
      `${registerCss('hudMicro')};letter-spacing:${SHIFT_CHIP_TRACKING_EM}em;flex:0 0 auto;white-space:nowrap;` +
      `padding:5px ${SHIFT_CHIP_PAD_X_PX}px;border:${SHIFT_CHIP_BORDER_PX}px solid var(--hc-hairline);` +
      'border-radius:6px;background:transparent;cursor:pointer;box-sizing:border-box';
    chip.addEventListener('click', () => {
      onShift(id);
      // Release focus so Enter/Space reach the layer again.
      chip.blur();
    });
    chips.set(id, chip);
    line.appendChild(chip);
  }
  row.append(rowKey(SPECIAL_KEY, 'display:block'), line);
  return { el: row, chips };
}

function buildPickButton(): HTMLElement {
  const row = document.createElement('div');
  row.style.cssText = 'margin-top:14px';
  const btn = document.createElement('div');
  btn.className = 'hc-pickbtn';
  btn.textContent = 'SELECT';
  btn.style.cssText =
    'width:100%;height:38px;border-radius:6px;display:flex;align-items:center;justify-content:center;' +
    'font:500 18px var(--hc-font-mono);letter-spacing:0.24em;border:1px solid var(--hc-hairline);' +
    'color:var(--hc-text-primary)';
  row.appendChild(btn);
  return row;
}

function buildCard(
  vm: CardViewModel,
  onSelect: (cls: ShipClassId) => void,
  onShift: (id: ShiftId) => void,
): CardEls {
  const root = document.createElement('div');
  root.className = 'hc-ccard';
  root.style.cssText = CARD_BASE;
  const silbox = buildSilbox();
  const head = buildCardHead(vm);
  const pips = buildPips(vm);
  const pickRow = buildPickButton();
  const loadout = buildLoadout(vm);
  const shiftRow = buildShiftRow(onShift);
  loadout.appendChild(shiftRow.el);
  root.append(head, silbox, pips.el, loadout, pickRow);
  root.addEventListener('click', () => onSelect(vm.cls));
  return {
    cls: vm.cls,
    root,
    silbox,
    cname: head.querySelector('.hc-cname') as HTMLElement,
    pipEls: pips.rows,
    pipFilled: vm.pips.map((p) => p.filled),
    pickBtn: pickRow.querySelector('.hc-pickbtn') as HTMLElement,
    chips: shiftRow.chips,
    silverStroke: cssHex(C.silver),
  };
}

// --- card paint (selection treatment) ----------------------------------------

/** Repaint every card for the current highlight in the own accent, and every
 *  card's Shift chips for the one shared Shift pick. */
function paintCards(cards: CardEls[], highlight: number, accent: OwnAccent, shift: ShiftId): void {
  const n = accent.accentValue;
  const fill = accent.accentFill;
  cards.forEach((card, i) => {
    paintCard(card, i === highlight, n, fill);
    paintChips(card, shift, n);
  });
}

/**
 * The Shift chips in the card's OWN selected register (the SELECTED ✓ button's
 * paint: accent border + accent text + a 0.07 accent wash) for the picked
 * Shift, and its unselected register (hairline border, secondary text, no
 * wash) for the other two. The pick is ONE value shared by every card, so
 * every card shows the same chip lit.
 */
function paintChips(card: CardEls, shift: ShiftId, accentN: number): void {
  const accent = cssHex(accentN);
  for (const [id, chip] of card.chips) {
    const on = id === shift;
    chip.style.borderColor = on ? accent : cssHex(C.hairline);
    chip.style.color = on ? accent : cssHex(C.textSecondary);
    chip.style.background = on ? cssRgba(accentN, 0.07) : 'transparent';
    chip.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
}

function paintCard(card: CardEls, on: boolean, accentN: number, fill: string): void {
  if (on) paintCardOn(card, accentN, fill);
  else paintCardOff(card);
}

function setSilhouette(card: CardEls, stroke: string, fill: string): void {
  card.silbox.innerHTML = silhouetteSvg(card.cls, { stroke, fill, strokeWidth: 2 });
  const svg = card.silbox.firstElementChild as HTMLElement | null;
  if (svg) svg.style.cssText = 'height:140px;width:auto;max-width:100%';
}

function paintCardOn(card: CardEls, accentN: number, fill: string): void {
  const accent = cssHex(accentN);
  card.root.style.borderColor = accent;
  card.root.style.boxShadow = `0 0 26px ${cssRgba(accentN, 0.13)}`;
  card.silbox.style.borderColor = accent;
  card.cname.style.color = accent;
  setSilhouette(card, accent, fill);
  paintPips(card, accent);
  card.pickBtn.textContent = 'SELECTED ✓';
  card.pickBtn.style.borderColor = accent;
  card.pickBtn.style.color = accent;
  card.pickBtn.style.background = cssRgba(accentN, 0.07);
}

function paintCardOff(card: CardEls): void {
  const hair = cssHex(C.hairline);
  card.root.style.borderColor = hair;
  card.root.style.boxShadow = 'none';
  card.silbox.style.borderColor = hair;
  card.cname.style.color = cssHex(C.textPrimary);
  setSilhouette(card, card.silverStroke, 'none');
  paintPips(card, card.silverStroke);
  card.pickBtn.textContent = 'SELECT';
  card.pickBtn.style.borderColor = hair;
  card.pickBtn.style.color = cssHex(C.textSecondary);
  card.pickBtn.style.background = 'transparent';
}

function paintPips(card: CardEls, onColor: string): void {
  card.pipEls.forEach((cells, r) => {
    const filled = card.pipFilled[r];
    cells.forEach((cell, i) => {
      cell.style.background = i < filled ? onColor : cssHex(C.hairline);
    });
  });
}

// --- header / footer ---------------------------------------------------------

function buildHeader(): HTMLElement {
  const head = document.createElement('div');
  head.style.cssText = 'display:flex;align-items:baseline;gap:18px;padding:0 42px 20px';
  const kicker = document.createElement('span');
  kicker.textContent = 'SELECT CLASS';
  kicker.style.cssText = `${registerCss('label')};color:var(--hc-phosphor)`;
  const title = document.createElement('h3');
  title.textContent = 'WHAT WILL YOU SAIL?';
  title.style.cssText = 'font:700 26px var(--hc-font-display);letter-spacing:0.1em;color:var(--hc-text-primary)';
  const esc = document.createElement('span');
  esc.style.cssText =
    `${registerCss('hudMicro')};margin-left:auto;color:var(--hc-phosphor);letter-spacing:0.14em;` +
    'display:flex;align-items:center;gap:8px';
  const escKey = document.createElement('b');
  escKey.textContent = 'ESC';
  escKey.style.cssText =
    'color:var(--hc-text-primary);border:1px solid var(--hc-hairline);border-radius:4px;padding:2px 8px;font-weight:500';
  const escLabel = document.createElement('span');
  escLabel.textContent = 'BACK TO PORT';
  esc.append(escKey, escLabel);
  head.append(kicker, title, esc);
  return head;
}

interface RailEls {
  el: HTMLElement;
  /** Show the fade + chevron only when the rail actually overflows; call after
   *  mount (layout available) and on every resize while the layer is open. */
  evaluateOverflow: () => void;
}

function buildRail(cards: CardEls[]): RailEls {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:relative';
  const rail = document.createElement('div');
  rail.style.cssText = 'display:flex;gap:22px;overflow-x:auto;padding:6px 42px 18px';
  for (const card of cards) rail.appendChild(card.root);
  const fade = document.createElement('div');
  fade.style.cssText =
    `position:absolute;right:0;top:0;bottom:18px;width:110px;pointer-events:none;` +
    `background:linear-gradient(90deg, ${cssRgba(C.panel, 0)}, ${cssRgba(C.panel, 0.92)} 78%)`;
  const chevron = document.createElement('div');
  chevron.textContent = '›';
  chevron.style.cssText =
    'position:absolute;right:20px;top:44%;font:400 30px var(--hc-font-display);color:var(--hc-phosphor);pointer-events:none';
  wrap.append(rail, fade, chevron);
  const evaluateOverflow = (): void => {
    const overflow = rail.scrollWidth > rail.clientWidth;
    fade.style.display = overflow ? '' : 'none';
    chevron.style.display = overflow ? '' : 'none';
  };
  return { el: wrap, evaluateOverflow };
}

/**
 * CONFIRM SELECTION — the layer's primary. Amber outline+glow chrome, byte-for-
 * byte the SET SAIL treatment it replaces (Eric ruling: identical chrome), with
 * one container-fit concession: the 300px fixed width becomes a MIN width so
 * the longer label can't overrun its own border box (amendment 47).
 */
function buildConfirm(onConfirm: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = 'CONFIRM SELECTION';
  btn.style.cssText =
    'margin-left:auto;min-width:300px;height:56px;padding:0 28px;box-sizing:border-box;background:transparent;' +
    'border:1px solid var(--hc-amber);flex:0 0 auto;white-space:nowrap;' +
    'border-radius:7px;color:var(--hc-amber);font:800 20px var(--hc-font-mono);letter-spacing:0.3em;' +
    `text-indent:0.3em;cursor:pointer;box-shadow:0 0 30px ${cssRgba(C.amber, 0.22)}`;
  btn.addEventListener('click', onConfirm);
  return btn;
}

interface FooterEls {
  el: HTMLElement;
  confirm: HTMLButtonElement;
}

/** The footer: the CONSUMABLES row (Story 10.1 — a full-width first line, the
 *  kit is the captain's, shared by every card) above CONFIRM. The Color Hoist
 *  row is gone (Story 10.4, R6). */
function buildFooter(kitRow: KitRow, onConfirm: () => void): FooterEls {
  const foot = document.createElement('div');
  // flex-wrap:wrap — the CONSUMABLES row takes its own full-width line and
  // CONFIRM wraps under it rather than clipping outside the panel.
  foot.style.cssText =
    'display:flex;align-items:center;flex-wrap:wrap;gap:18px 30px;padding:18px 42px 0;' +
    'border-top:1px solid var(--hc-hairline);margin-top:4px';
  const confirm = buildConfirm(onConfirm);
  kitRow.el.style.flexBasis = '100%';
  foot.append(kitRow.el, confirm);
  return { el: foot, confirm };
}

// --- open / lifecycle --------------------------------------------------------

export interface ClassSelectOpts {
  /** Card pre-highlighted on open (first-run: the default hull). */
  initial: ShipClassId;
  /** The Shift chip lit on open (Story 10.4) — the stored pick, else DEFAULT_SHIFT. */
  initialShift?: ShiftId;
  /** The CONSUMABLES row's kit on open (Story 10.1) — the saved kit, else DEFAULT_KIT. */
  initialKit?: ConsumableKit;
  /** Home overlay to blur/dim behind the layer while open. */
  blurTarget: HTMLElement;
  /** Footer CONFIRM SELECTION (and Enter): persist the highlight + close back to
   *  port. NEVER deploys — PLAY is the one launch path. Carries the Shift pick
   *  beside the class (Story 10.4) and the kit (Story 10.1). */
  onConfirm: (cls: ShipClassId, shift: ShiftId, kit: ConsumableKit) => void;
  /** ESC / dimmer dismiss: close with no change. */
  onClose: () => void;
}

export interface ClassSelectHandle {
  close(): void;
}

const LAYER_ID = 'hc-class-select';

function isTextInput(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || (el as HTMLElement).isContentEditable === true;
}

/** A layer button (e.g. a focused chip) holds keyboard focus. */
function isLayerButton(el: Element | null, container: HTMLElement): boolean {
  return !!el && el.tagName === 'BUTTON' && container.contains(el);
}

/**
 * Only Enter/Space are swallowed while a layer button holds focus — those two
 * would otherwise double-fire (native button activation racing our own
 * confirm — Enter on the CONFIRM button, or a focused chip's Space/Enter
 * activation). Everything else (ESC/arrows/digits) must still reach the
 * layer regardless of focus, or a focused button would deafen the whole
 * layer to every shortcut until a stray mouse click restored it (Finding A).
 */
function isSwallowedKey(e: KeyboardEvent, container: HTMLElement): boolean {
  return (e.key === 'Enter' || e.key === ' ') && isLayerButton(document.activeElement, container);
}

/** Keys the layer never acts on: a focused text input owns them, or a focused
 *  layer button's native Enter/Space activation must win. */
function isIgnoredKey(e: KeyboardEvent, container: HTMLElement): boolean {
  return isTextInput(document.activeElement) || isSwallowedKey(e, container);
}

/** The single live layer, if any — so a re-open fully tears the prior one down
 *  (window listeners), never just its DOM (fix: half-teardown). */
let current: { close(): void } | null = null;

interface LayerWiring {
  container: HTMLElement;
  dimmer: HTMLElement;
  blurTarget: HTMLElement;
  onKey: (e: KeyboardEvent) => void;
  onResize: () => void;
  dismiss: () => void;
  repaint: () => void;
  evaluateOverflow: () => void;
}

/** Attach the layer's listeners, blur the home, mount it, and paint. Split out
 *  of openClassSelect to keep that function lean. */
function activateLayer(w: LayerWiring): void {
  w.dimmer.addEventListener('click', w.dismiss);
  window.addEventListener('keydown', w.onKey);
  window.addEventListener('resize', w.onResize);
  // Hand keyboard control to the layer: drop callsign focus (typing-isolation guard).
  if (isTextInput(document.activeElement)) (document.activeElement as HTMLElement).blur();
  w.blurTarget.style.filter = 'blur(2px)';
  w.blurTarget.style.opacity = '0.5';
  document.body.appendChild(w.container);
  w.evaluateOverflow(); // now that the rail is laid out, hide fade/chevron if it fits
  w.repaint();
}

/** Build the layer's fixed container + dimmer + viewport-capped panel shell. */
function makeLayerShell(): { container: HTMLElement; dimmer: HTMLElement; panel: HTMLElement } {
  const container = document.createElement('div');
  container.id = LAYER_ID;
  container.style.cssText =
    'position:fixed;inset:0;z-index:1200;display:flex;align-items:center;justify-content:center';
  const dimmer = document.createElement('div');
  dimmer.style.cssText = `position:absolute;inset:0;background:${cssRgba(C.void, 0.72)}`;
  const panel = document.createElement('div');
  // `box-sizing:border-box` is the amendment-47 fix: the 34/26px padding and the
  // 1px border sat OUTSIDE the `calc(100vh - 48px)` cap under content-box, so
  // the bay's border box was always `viewport + 14px` and 7px of panel chrome
  // was clipped at the top and bottom edges at every viewport size.
  panel.style.cssText =
    'position:relative;width:1680px;max-width:calc(100vw - 48px);max-height:calc(100vh - 48px);overflow-y:auto;' +
    'box-sizing:border-box;' +
    'background:var(--hc-panel);border:1px solid var(--hc-hairline);border-radius:12px;padding:34px 0 26px';
  applyViewportCap(panel); // amendment 47 — border-box + a real scroll surface (ui/fit.ts)
  container.append(dimmer, panel);
  return { container, dimmer, panel };
}

/**
 * Open the class-select layer over the home. Returns a handle whose `close()`
 * tears everything down (removes the DOM, restores the home blur, detaches the
 * keydown listener). Two caller-facing exits close the layer — confirm and
 * dismiss — and route through the caller's callbacks; a card click only moves
 * the highlight and stays open, never one of them. The returned handle's
 * `close()` is a third, callback-free teardown path (used by re-open and home
 * teardown) — it tears down without notifying either callback. None of them
 * deploys.
 */
export function openClassSelect(opts: ClassSelectOpts): ClassSelectHandle {
  current?.close(); // full teardown of any prior layer (listener + subscriptions), not just DOM
  const cards = SHIP_CLASS_IDS.map((cls) => buildCard(cardViewModel(cls), select, pickShift));
  let highlight = Math.max(0, SHIP_CLASS_IDS.indexOf(opts.initial));
  let shift: ShiftId = opts.initialShift ?? DEFAULT_SHIFT;
  let kit: ConsumableKit = opts.initialKit ?? DEFAULT_KIT;
  /** The CONSUMABLES picker while it is up (Story 10.1): the layer's keys are
   *  routed to it — only ESC acts, closing the picker, never the layer. */
  let picker: { slot: number; handle: KitPickerHandle } | null = null;

  const { container, dimmer, panel } = makeLayerShell();
  const rail = buildRail(cards);
  const kitRow = makeKitRow(openSlot);
  const footer = buildFooter(kitRow, confirmPick);
  panel.append(buildHeader(), rail.el, footer.el);

  // Ignore any keydown dispatched at/before this instant — the very keystroke
  // (Enter on the callsign field / chip) that opened us is still bubbling and
  // would otherwise reach the freshly-attached window listener and insta-pick.
  const openedAt = performance.now();
  const onResize = (): void => rail.evaluateOverflow();
  function repaint(): void {
    paintCards(cards, highlight, OWN_ACCENT, shift);
    kitRow.paint(kit, picker?.slot ?? null);
    footer.confirm.disabled = !isConsumableKit(kit); // a guard, not a state
  }
  /** A CONSUMABLES square: open the picker for that kit index over the layer. */
  function openSlot(slot: number): void {
    const handle = openKitPicker({
      host: container, kit, slot, accent: OWN_ACCENT,
      onPick: (next) => {
        kit = next;
        repaint();
      },
      onClose: () => {
        if (picker?.handle === handle) picker = null;
        panel.removeAttribute('inert');
        repaint();
      },
    });
    picker = { slot, handle };
    panel.setAttribute('inert', ''); // the layer's buttons are out of the tab order while the picker is up
    repaint();
  }
  /** A Shift chip: move the ONE Shift pick and repaint. The chip's click then
   *  bubbles to its card, which highlights that card too. */
  function pickShift(id: ShiftId): void {
    shift = id;
    repaint();
  }
  /** Card click (or its in-card SELECT button): move the highlight and repaint —
   *  never closes the layer, never fires a callback (Eric ruling 2026-08-03). */
  function select(cls: ShipClassId): void {
    highlight = Math.max(0, SHIP_CLASS_IDS.indexOf(cls));
    repaint();
  }
  /** CONFIRM SELECTION / Enter: resolve the highlight, close, hand it back. */
  function confirmPick(): void {
    if (!isConsumableKit(kit)) return;
    const cls = SHIP_CLASS_IDS[highlight];
    close();
    opts.onConfirm(cls, shift, kit);
  }
  function dismiss(): void {
    close();
    opts.onClose();
  }
  function onKey(e: KeyboardEvent): void {
    if (e.timeStamp <= openedAt) return; // the opening keystroke — never ours to act on
    if (picker) {
      if (e.key === 'Tab') e.preventDefault(); // belt-and-braces with `inert`: no focus walk under the dim
      return picker.handle.key(e); // the picker owns the keyboard (ESC only)
    }
    if (isIgnoredKey(e, container)) return;
    const action = keyAction(e.key, cards.length);
    if (!action) return;
    e.preventDefault();
    if (action.kind === 'highlight') highlight = action.index;
    else if (action.kind === 'move') highlight = moveHighlight(highlight, action.dir, cards.length);
    else if (action.kind === 'pick') return confirmPick(); // Enter ≡ CONFIRM SELECTION
    else if (action.kind === 'close') return dismiss();
    repaint();
  }
  function close(): void {
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
    picker?.handle.close();
    container.remove();
    opts.blurTarget.style.filter = '';
    opts.blurTarget.style.opacity = '';
    if (current === handle) current = null;
  }
  const handle: ClassSelectHandle = { close };
  activateLayer({
    container, dimmer, blurTarget: opts.blurTarget,
    onKey, onResize, dismiss, repaint, evaluateOverflow: rail.evaluateOverflow,
  });
  current = handle;
  return handle;
}
