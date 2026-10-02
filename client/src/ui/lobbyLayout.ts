// THE LOBBY MODAL'S FIXED GEOMETRY (Eric on staging, 2026-10-02: "That lobby
// is far too janky. The modal changes size when people join or leave or when
// you turn on bot fill … I want two columns of 10 slots each").
//
// Every region of ui/lobbyModal.ts has ONE explicit pixel size, set here, and
// it never changes: not with the roster, the host role, bot-fill, the
// countdown or the seed's length. State shows by swapping the CONTENTS of a
// fixed box or by `visibility`, never by `display:none` or by mounting and
// unmounting anything that sizes the layout. Text that could outgrow its box
// (a callsign, a seed) is clipped with an ellipsis inside it.
//
// The budget (Eric R1, 2026-10-02: "Shrink the design to fit 650 px … never
// scrolls on a 768-tall laptop") — top to bottom, 10 px gaps, 20 px top and
// bottom padding, every region reserved: heading 22 · notice 18 · code 26 ·
// options 80 (two 36 px rows + 8) · aboard 18 · grid 236 (ten 20 px rows +
// nine 4 px gaps) · countdown 20 · buttons 40 · reason 18 = 478, + 8 gaps × 10
// + 2 × 20 = 598 px, which IS the panel height (computed below, not typed).
// Width: 600 px panel, 28 px side padding → 544 px inner = two 260 px columns
// + a 24 px gutter. `fixPanel` also lifts the shell's max-width/max-height and
// overflow-y so the panel can be neither clamped nor scrolled.

import { CONFIG } from '@salvo/shared';
import type { LobbyCaptain } from '../net/lobby.js';
import { applyHairline, makeLine, makeModalButton, makeModalInput } from './portModal.js';
import { registerCss } from './theme.js';

const PANEL_W = 600;
const PAD_V = 20;
const PAD_H = 28;
const GAP = 10;
const INNER_W = PANEL_W - 2 * PAD_H;

const OPTION_H = 36;
const OPTION_GAP = 8;
const OPTIONS_H = 2 * OPTION_H + OPTION_GAP;
const LABEL_W = 140;
const VALUE_W = 300;
const OPTION_COL_GAP = 16;
const CHIP_W = 96;
const CHIP_GAP = 8;

export const SLOT_COUNT = CONFIG.map.playerCap;
const COLS = 2;
const ROWS = Math.ceil(SLOT_COUNT / COLS);
const ROW_H = 20;
const ROW_GAP = 4;
const COL_GAP = 24;
const COL_W = (INNER_W - COL_GAP) / COLS;
const GRID_H = ROWS * ROW_H + (ROWS - 1) * ROW_GAP;
const DOT = 10;
const DOT_GAP = 10;
const NAME_W = COL_W - DOT - DOT_GAP;

const CELL_W = 160;
const CELL_GAP = 12;
const BUTTON_H = 40;

/** The one-line regions and their fixed heights. */
export const LINE_H = {
  heading: 22,
  notice: 18,
  code: 26,
  aboard: 18,
  countdown: 20,
  reason: 18,
} as const;

/** Every region's height in panel order — the panel is their sum, never a guess. */
const REGION_H = [
  LINE_H.heading,
  LINE_H.notice,
  LINE_H.code,
  OPTIONS_H,
  LINE_H.aboard,
  GRID_H,
  LINE_H.countdown,
  BUTTON_H,
  LINE_H.reason,
];
const PANEL_H = REGION_H.reduce((a, b) => a + b, 0) + (REGION_H.length - 1) * GAP + 2 * PAD_V;

/** The pixel budget, exported so the test can re-add it. */
export const LAYOUT = {
  panelW: PANEL_W,
  panelH: PANEL_H,
  padV: PAD_V,
  padH: PAD_H,
  gap: GAP,
  lineH: LINE_H,
  optionsH: OPTIONS_H,
  gridH: GRID_H,
  buttonH: BUTTON_H,
} as const;

const ELLIPSIS = 'overflow:hidden;white-space:nowrap;text-overflow:ellipsis';

/** Pin an element to an explicit size that flex can neither grow nor shrink. */
function size(el: HTMLElement, w: number, h: number): void {
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;
  el.style.flex = '0 0 auto';
  el.style.boxSizing = 'border-box';
}

function tag<T extends HTMLElement>(el: T, role: string): T {
  el.dataset.lobby = role;
  return el;
}

/** The modal panel at its one size (overrides the shared shell's flexible bounds). */
export function fixPanel(panel: HTMLElement): void {
  tag(panel, 'panel');
  size(panel, PANEL_W, PANEL_H);
  // The shell's `max-width/max-height:100%` + `overflow-y:auto` would clamp and
  // scroll a tall panel on a short window; this one is never clamped or scrolled.
  panel.style.maxWidth = 'none';
  panel.style.maxHeight = 'none';
  panel.style.minWidth = '0';
  panel.style.overflow = 'hidden';
  // The longhands too: the shell sets `overflow-y`, which the shorthand alone
  // does not reliably displace in every CSSOM.
  panel.style.overflowX = 'hidden';
  panel.style.overflowY = 'hidden';
  panel.style.padding = `${PAD_V}px ${PAD_H}px`;
  panel.style.gap = `${GAP}px`;
  panel.style.alignItems = 'center';
}

/** A centred one-line region of fixed height; overflowing text is clipped. */
export function makeFixedLine(
  role: keyof typeof LINE_H,
  register: 'hudReadout' | 'hudMicro' | 'label',
  color: string,
): HTMLElement {
  const el = tag(makeLine(register, color), role);
  size(el, INNER_W, LINE_H[role]);
  el.style.lineHeight = `${LINE_H[role]}px`;
  el.style.overflow = 'hidden';
  el.style.whiteSpace = 'nowrap';
  el.style.textOverflow = 'ellipsis';
  return el;
}

// --- options block -------------------------------------------------------------

export interface OptionRow {
  row: HTMLElement;
  /** The fixed value box: the host's control or everyone else's status. */
  value: HTMLElement;
}

function makeOptionRow(label: string): OptionRow {
  const row = tag(document.createElement('div'), 'option');
  size(row, LABEL_W + OPTION_COL_GAP + VALUE_W, OPTION_H);
  row.style.display = 'flex';
  row.style.alignItems = 'center';
  row.style.gap = `${OPTION_COL_GAP}px`;
  const name = tag(document.createElement('div'), 'option-label');
  size(name, LABEL_W, OPTION_H);
  name.style.cssText += `;${registerCss('hudMicro')};color:var(--hc-text-muted);line-height:${OPTION_H}px;text-align:right`;
  name.textContent = label;
  const value = tag(document.createElement('div'), 'option-value');
  size(value, VALUE_W, OPTION_H);
  value.style.display = 'flex';
  value.style.alignItems = 'center';
  value.style.gap = `${CHIP_GAP}px`;
  row.append(name, value);
  return { row, value };
}

/** `SEED` and `BOT-FILL`, each a label then a fixed value box. */
export function makeOptionsBlock(): { root: HTMLElement; seed: OptionRow; botFill: OptionRow } {
  const root = tag(document.createElement('div'), 'options');
  size(root, INNER_W, OPTIONS_H);
  root.style.display = 'flex';
  root.style.flexDirection = 'column';
  root.style.alignItems = 'center';
  root.style.gap = `${OPTION_GAP}px`;
  const seed = makeOptionRow('SEED');
  const botFill = makeOptionRow('BOT-FILL');
  root.append(seed.row, botFill.row);
  return { root, seed, botFill };
}

/** A non-host's read-only value: one clipped line filling the value box. */
export function makeOptionStatus(asTyped: boolean): HTMLElement {
  const el = document.createElement('div');
  size(el, VALUE_W, OPTION_H);
  el.style.cssText += `;${ELLIPSIS};font:500 14px var(--hc-font-mono);letter-spacing:.1em;line-height:${OPTION_H}px`;
  el.style.color = 'var(--hc-text-primary)';
  // The seed is free text hashed AS TYPED, so it is shown as typed.
  el.style.textTransform = asTyped ? 'none' : 'uppercase';
  return el;
}

/** The host's seed field, filling the value box. */
export function makeSeedField(): HTMLInputElement {
  const input = makeModalInput();
  size(input, VALUE_W, OPTION_H);
  input.style.padding = '0 12px';
  input.style.fontSize = '14px';
  input.style.textAlign = 'left';
  input.style.textOverflow = 'ellipsis';
  // As typed — an uppercased display would hide the difference between two maps.
  input.style.textTransform = 'none';
  input.placeholder = 'OPTIONAL';
  input.maxLength = CONFIG.lobby.seedTextMax;
  return input;
}

/** One YES / NO chip at its fixed size. */
export function makeChip(label: string, onClick: () => void): HTMLButtonElement {
  const btn = makeModalButton(label, 'var(--hc-text-secondary)', onClick);
  size(btn, CHIP_W, OPTION_H);
  btn.style.padding = '0';
  return btn;
}

/** A chip lit phosphor when it is the selection, hairline + muted when not. */
export function paintChip(btn: HTMLButtonElement, lit: boolean): void {
  btn.setAttribute('aria-pressed', lit ? 'true' : 'false');
  btn.style.color = lit ? 'var(--hc-phosphor)' : 'var(--hc-text-secondary)';
  applyHairline(btn, lit ? 'var(--hc-phosphor)' : 'var(--hc-hairline)');
}

// --- slot grid -----------------------------------------------------------------

export interface SlotEls {
  dot: HTMLElement;
  name: HTMLElement;
}

function makeSlot(i: number): { root: HTMLElement; els: SlotEls } {
  const root = tag(document.createElement('div'), 'slot');
  size(root, COL_W, ROW_H);
  // Slot i fills LEFT TO RIGHT, then TOP TO BOTTOM: i = 0 → r1 c1, 1 → r1 c2, 2 → r2 c1.
  root.style.gridRow = String(Math.floor(i / COLS) + 1);
  root.style.gridColumn = String((i % COLS) + 1);
  root.style.display = 'flex';
  root.style.alignItems = 'center';
  root.style.gap = `${DOT_GAP}px`;
  const dot = tag(document.createElement('div'), 'dot');
  size(dot, DOT, DOT);
  dot.style.borderRadius = '50%';
  const name = tag(document.createElement('div'), 'name');
  size(name, NAME_W, ROW_H);
  name.style.cssText += `;${ELLIPSIS};font:500 14px var(--hc-font-mono);letter-spacing:.1em;text-transform:uppercase;line-height:${ROW_H}px`;
  name.style.color = 'var(--hc-text-primary)';
  root.append(dot, name);
  return { root, els: { dot, name } };
}

/** The 2 × 10 grid with all twenty slots built once, empty. */
export function makeSlotGrid(): { grid: HTMLElement; slots: SlotEls[] } {
  const grid = tag(document.createElement('div'), 'grid');
  size(grid, INNER_W, GRID_H);
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = `repeat(${COLS}, ${COL_W}px)`;
  grid.style.gridTemplateRows = `repeat(${ROWS}, ${ROW_H}px)`;
  grid.style.columnGap = `${COL_GAP}px`;
  grid.style.rowGap = `${ROW_GAP}px`;
  const slots: SlotEls[] = [];
  for (let i = 0; i < SLOT_COUNT; i++) {
    const s = makeSlot(i);
    grid.appendChild(s.root);
    slots.push(s.els);
  }
  return { grid, slots };
}

/** Green circle when ready, red when not; an empty slot is a hairline ring, no name. */
export function paintSlotEls(s: SlotEls, captain: LobbyCaptain | undefined): void {
  const state = captain === undefined ? 'empty' : captain.ready ? 'ready' : 'unready';
  const fill = { ready: 'var(--hc-phosphor)', unready: 'var(--hc-denied)', empty: 'transparent' }[state];
  s.dot.dataset.state = state;
  s.dot.style.backgroundColor = fill;
  applyHairline(s.dot, state === 'empty' ? 'var(--hc-hairline)' : fill);
  s.name.textContent = captain?.name ?? '';
}

// --- button row ----------------------------------------------------------------

/** READY · LEAVE · START NOW, three fixed cells; a non-host's third stays empty. */
export function makeButtonRow(): { row: HTMLElement; cells: HTMLElement[] } {
  const row = tag(document.createElement('div'), 'buttons');
  size(row, INNER_W, BUTTON_H);
  row.style.display = 'flex';
  row.style.justifyContent = 'center';
  row.style.gap = `${CELL_GAP}px`;
  const cells = [0, 1, 2].map(() => {
    const cell = tag(document.createElement('div'), 'cell');
    size(cell, CELL_W, BUTTON_H);
    return cell;
  });
  row.append(...cells);
  return { row, cells };
}

/** A modal button filling its cell. */
export function fillCell(btn: HTMLButtonElement): HTMLButtonElement {
  btn.style.width = '100%';
  btn.style.height = '100%';
  btn.style.padding = '0';
  btn.style.boxSizing = 'border-box';
  return btn;
}
