// THE CONSUMABLES ROW AND ITS PICKER (Story 10.1, epic-10 amendment 3).
//
// Eric 2026-10-27: ONE `CONSUMABLES` key · value row on the class-select
// layer's footer (the kit is the captain's, not the hull's); its value is FOUR
// squares in slot order — the live belt's square look, a key chip `1`–`4`
// under each — and pressing a square opens the picker for THAT slot. The
// picker lists every dealable consumable line (`dealableConsumables()` — never
// enumerated here) as picker-cards: glyph · NAME · the line's stat rows, the
// ONE place a line is described. The slot's own line is CURRENT; a line in
// another slot is greyed and inert (four distinct lines, ruling 4). A press on
// a lit card fills the slot and closes; ESC or the dim closes with no change;
// the picker never stacks. No sub-line, no explanation on the row (Eric
// 2026-09-28, twice).
//
// Pure view-models (`kitRowModel`, `pickerModel`, `pickLine`) + thin DOM. The
// DOM reuses the ONE glyph source (`equipmentGlyphSvg`), the belt's size
// tokens (`CLIENT_CONFIG.hudBar`), the belt's key glyphs (`SLOT_KEY_GLYPHS`),
// the line names (`boonName`) and the stat-row formatter the refit hover uses
// (`consumableStatRows` + `statValueText`). Port chrome: no `--hc-ui-scale`.

import {
  CONSUMABLE_SLOTS,
  dealableConsumables,
  type ConsumableId,
  type ConsumableKit,
} from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { cssRgba } from '../util/color.js';
import { equipmentGlyphSvg } from '../render/equipmentIcons.js';
import { SLOT_KEY_GLYPHS } from '../render/equipmentInfo.js';
import { boonName, consumableStatRows, statValueText, type CardStatRow } from './boonCopy.js';
import { LOADOUT_KEY_COL_PX, LOADOUT_KEY_GAP_PX, LOADOUT_KEY_TRACKING_EM } from './classSelect.js';
import { registerCss } from './theme.js';

const C = CLIENT_CONFIG.colors;
const B = CLIENT_CONFIG.hudBar;
const MONO = 'var(--hc-font-mono)';

/** The row's KEY word and the picker's title (the KEY word, DESIGN.md picker-modal). */
export const KIT_ROW_KEY = 'CONSUMABLES';

// --- pure view-models (tested) ------------------------------------------------

export interface KitSquareModel {
  /** Kit index 0..KIT_SIZE-1 (the square's `data-slot`). */
  slot: number;
  kind: ConsumableId;
  /** The key chip under the square — the belt's own glyph for that slot. */
  key: string;
}

/** Pure: the row's squares, one per kit entry, keyed as the live belt is. */
export function kitRowModel(kit: ConsumableKit): KitSquareModel[] {
  return kit.map((kind, slot) => ({ slot, kind, key: SLOT_KEY_GLYPHS[CONSUMABLE_SLOTS[slot]] ?? '' }));
}

export type PickerCardState = 'current' | 'taken' | 'open';

export interface PickerCardModel {
  id: ConsumableId;
  name: string;
  state: PickerCardState;
  rows: readonly CardStatRow[];
}

function cardState(kit: ConsumableKit, slot: number, id: ConsumableId): PickerCardState {
  if (kit[slot] === id) return 'current';
  return kit.includes(id) ? 'taken' : 'open';
}

/** Pure: the picker for kit index `slot` — every dealable line in catalog order,
 *  the slot's own line `current`, a line in another slot `taken`. */
export function pickerModel(
  kit: ConsumableKit,
  slot: number,
  pool: readonly ConsumableId[] = dealableConsumables(),
): PickerCardModel[] {
  return pool.map((id) => ({ id, name: boonName(id), state: cardState(kit, slot, id), rows: consumableStatRows(id) }));
}

/** Pure: kit index `slot` set to `id` — a no-op (the same kit) when `id` is
 *  already carried (current or taken) or is not a dealable line. */
export function pickLine(
  kit: ConsumableKit,
  slot: number,
  id: ConsumableId,
  pool: readonly ConsumableId[] = dealableConsumables(),
): ConsumableKit {
  if (kit.includes(id) || !pool.includes(id) || slot < 0 || slot >= kit.length) return kit;
  return kit.map((line, i) => (i === slot ? id : line));
}

// --- the row -------------------------------------------------------------------

/** The belt square's READY skin at full size (hotbar's ready skin, the results
 *  twin's `WEAPON_SKIN` unscaled). */
const SQUARE_BORDER = cssRgba(C.phosphor, 0.4);
const SQUARE_GLOW = `0 0 10px ${cssRgba(C.phosphor, 0.15)}`;
const ICON_ALPHA = 0.75;
/** DESIGN.md loadout-row: Open = amber rule + 14 px glow while its picker is up. */
const OPEN_GLOW = `0 0 14px ${cssRgba(C.amber, 0.3)}`;
/** The 9 px floor (amendment 33) — the key chip never renders under it. */
const CHIP_PX = Math.max(9, B.type.chip);

export interface KitRow {
  el: HTMLElement;
  /** Repaint for `kit`; `openSlot` is the kit index whose picker is up (or null). */
  paint(kit: ConsumableKit, openSlot: number | null): void;
}

function makeChip(): HTMLSpanElement {
  const chip = document.createElement('span');
  chip.style.cssText = [
    'display:inline-flex',
    'align-items:center',
    'justify-content:center',
    'box-sizing:border-box',
    `min-width:${B.chipMinW}px`,
    `height:${B.chipH}px`,
    `padding:0 ${B.chipPadX}px`,
    `border:1px solid ${cssRgba(C.textMuted, 0.55)}`,
    'color:var(--hc-text-muted)',
    `font:400 ${CHIP_PX}px/1 ${MONO}`,
    'letter-spacing:0',
  ].join(';');
  return chip;
}

function makeSquare(slot: number, onSlot: (slot: number) => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.dataset.slot = String(slot);
  btn.style.cssText = [
    'flex:none',
    'box-sizing:border-box',
    `width:${B.beltSlot}px`,
    `height:${B.beltSlot}px`,
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'padding:0',
    'border-radius:0',
    'background:transparent',
    'cursor:pointer',
  ].join(';');
  btn.addEventListener('click', () => {
    onSlot(slot);
    btn.blur(); // the swatch rule: Enter/Space must reach the layer again
  });
  return btn;
}

function paintSquare(btn: HTMLButtonElement, kind: ConsumableId, open: boolean): void {
  btn.style.border = `1px solid ${open ? cssRgba(C.amber, 1) : SQUARE_BORDER}`;
  btn.style.boxShadow = open ? OPEN_GLOW : SQUARE_GLOW;
  btn.setAttribute('aria-label', boonName(kind));
  btn.dataset.kind = kind;
  btn.replaceChildren();
  const svg = equipmentGlyphSvg(kind, B.beltIcon);
  if (svg === null) return;
  svg.style.cssText = `display:block;color:var(--hc-phosphor);opacity:${ICON_ALPHA}`;
  btn.appendChild(svg);
}

/**
 * THE CONSUMABLES ROW: the key in the card's row grammar (10 px mono `.14em`,
 * the 108 px column) and four belt squares with key chips. `onSlot(i)` fires on
 * a square press — the layer opens the picker for kit index `i`.
 */
export function makeKitRow(onSlot: (slot: number) => void): KitRow {
  const row = document.createElement('div');
  row.dataset.kitRow = '';
  row.style.cssText = `display:flex;align-items:flex-start;gap:${LOADOUT_KEY_GAP_PX}px`;
  const key = document.createElement('span');
  key.textContent = KIT_ROW_KEY;
  key.style.cssText =
    `${registerCss('hudMicro')};flex:0 0 ${LOADOUT_KEY_COL_PX}px;height:${B.beltSlot}px;display:flex;` +
    `align-items:center;color:var(--hc-phosphor);letter-spacing:${LOADOUT_KEY_TRACKING_EM}em`;
  const squares = document.createElement('div');
  squares.style.cssText = `display:flex;gap:${B.beltGap}px`;
  const cells: Array<{ btn: HTMLButtonElement; chip: HTMLSpanElement }> = [];
  const ensureCells = (n: number): void => {
    while (cells.length < n) {
      const col = document.createElement('div');
      col.style.cssText = `display:flex;flex-direction:column;align-items:center;gap:${B.chipGap}px`;
      const cell = { btn: makeSquare(cells.length, onSlot), chip: makeChip() };
      col.append(cell.btn, cell.chip);
      squares.appendChild(col);
      cells.push(cell);
    }
  };
  row.append(key, squares);
  const paint = (kit: ConsumableKit, openSlot: number | null): void => {
    const model = kitRowModel(kit);
    ensureCells(model.length);
    for (const sq of model) {
      paintSquare(cells[sq.slot].btn, sq.kind, sq.slot === openSlot);
      cells[sq.slot].chip.textContent = sq.key;
    }
  };
  return { el: row, paint };
}

// --- the picker modal ------------------------------------------------------------

/** The personal hue, read off the layer's ColorHoist (structural — no import). */
export interface PickerAccent {
  accent: string;
  accentValue: number;
  accentText: string;
}

export interface KitPickerOpts {
  /** Where the picker mounts — the class-select layer's container, so it sits
   *  over the layer (its own stacking context) at the modal rung. */
  host: HTMLElement;
  kit: ConsumableKit;
  /** Kit index the picker fills. */
  slot: number;
  accent: PickerAccent;
  /** A lit card was pressed: the new kit (only `slot` changed). */
  onPick: (kit: ConsumableKit) => void;
  /** The picker closed, for any reason (pick, ESC, dim, superseded). */
  onClose: () => void;
}

export interface KitPickerHandle {
  close(): void;
  isOpen(): boolean;
  /** The layer routes its keydown here while the picker is up: ESC closes. */
  key(e: KeyboardEvent): void;
}

/** DESIGN.md picker-modal: `[ASSUMPTION: 760px]`, 3-up cards `[ASSUMPTION: 140px tall]`. */
const MODAL_W_PX = 760;
const CARD_MIN_H_PX = 140;
const GLYPH_BOX_PX = 34;
const GLYPH_PX = 22;

let live: KitPickerHandle | null = null;

function makeTitleBar(onClose: () => void): HTMLElement {
  const bar = document.createElement('div');
  bar.style.cssText = 'display:flex;align-items:baseline;justify-content:space-between;margin-bottom:16px';
  const title = document.createElement('span');
  title.textContent = KIT_ROW_KEY;
  title.style.cssText = `font:500 13px ${MONO};letter-spacing:.24em;color:var(--hc-text-primary)`;
  const esc = document.createElement('button');
  esc.type = 'button';
  esc.style.cssText =
    `${registerCss('hudMicro')};letter-spacing:.14em;color:var(--hc-text-muted);background:transparent;` +
    'border:0;padding:0;cursor:pointer;display:flex;align-items:center;gap:6px';
  const escKey = document.createElement('i');
  escKey.textContent = 'ESC';
  escKey.style.cssText =
    'font-style:normal;border:1px solid var(--hc-hairline);padding:1px 6px;border-radius:3px;color:var(--hc-text-secondary)';
  esc.append(escKey, document.createTextNode('· CLOSE'));
  esc.addEventListener('click', onClose);
  bar.append(title, esc);
  return bar;
}

function makeGlyphBox(card: PickerCardModel): HTMLElement {
  const box = document.createElement('span');
  const muted = card.state === 'taken';
  box.style.cssText =
    `width:${GLYPH_BOX_PX}px;height:${GLYPH_BOX_PX}px;box-sizing:border-box;display:inline-flex;align-items:center;` +
    `justify-content:center;border:1px solid ${cssRgba(muted ? C.textMuted : C.silver, muted ? 0.5 : 0.28)};` +
    `color:var(${muted ? '--hc-text-muted' : '--hc-phosphor'});margin-bottom:4px`;
  const svg = equipmentGlyphSvg(card.id, GLYPH_PX);
  if (svg !== null) box.appendChild(svg);
  return box;
}

function makeStatRows(rows: readonly CardStatRow[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:2px;margin-top:2px';
  for (const r of rows) {
    const line = document.createElement('div');
    line.style.cssText =
      `font:400 9px/1.5 ${MONO};letter-spacing:.12em;display:flex;justify-content:space-between;gap:8px`;
    const label = document.createElement('span');
    label.textContent = r.label;
    label.style.color = 'var(--hc-text-muted)';
    const value = document.createElement('span');
    value.textContent = statValueText(r);
    value.style.cssText = 'color:var(--hc-text-secondary);white-space:nowrap';
    line.append(label, value);
    wrap.appendChild(line);
  }
  return wrap;
}

function makeCurrentTag(accent: PickerAccent): HTMLElement {
  const tag = document.createElement('span');
  tag.textContent = 'CURRENT';
  tag.style.cssText =
    `position:absolute;right:12px;top:12px;font:400 9px/1 ${MONO};letter-spacing:.18em;color:${accent.accentText}`;
  return tag;
}

function paintPickerCard(btn: HTMLButtonElement, card: PickerCardModel, accent: PickerAccent): void {
  const current = card.state === 'current';
  btn.style.borderColor = current ? accent.accent : 'var(--hc-hairline)';
  btn.style.boxShadow = current ? `0 0 14px ${cssRgba(accent.accentValue, 0.3)}` : 'none';
  btn.style.cursor = card.state === 'open' ? 'pointer' : 'default';
  btn.disabled = card.state === 'taken';
}

function makePickerCard(card: PickerCardModel, accent: PickerAccent, onPick: (id: ConsumableId) => void): HTMLElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.dataset.line = card.id;
  btn.dataset.state = card.state;
  btn.style.cssText =
    `position:relative;min-height:${CARD_MIN_H_PX}px;box-sizing:border-box;border:1px solid var(--hc-hairline);` +
    'border-radius:8px;background:var(--hc-panel-deep);padding:12px 14px;display:flex;flex-direction:column;' +
    'align-items:flex-start;gap:4px;text-align:left;font:inherit;color:inherit';
  const name = document.createElement('span');
  name.textContent = card.name;
  name.style.cssText =
    `font:600 14px ${MONO};letter-spacing:.14em;text-transform:uppercase;` +
    `color:var(${card.state === 'taken' ? '--hc-text-muted' : '--hc-text-primary'})`;
  btn.append(makeGlyphBox(card), name, makeStatRows(card.rows));
  if (card.state === 'current') btn.appendChild(makeCurrentTag(accent));
  paintPickerCard(btn, card, accent);
  if (card.state === 'open') btn.addEventListener('click', () => onPick(card.id));
  return btn;
}

function makeModal(opts: KitPickerOpts, close: () => void, pick: (id: ConsumableId) => void): HTMLElement {
  const modal = document.createElement('div');
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-label', KIT_ROW_KEY);
  modal.style.cssText =
    `position:relative;width:${MODAL_W_PX}px;max-width:calc(100vw - 48px);max-height:calc(100vh - 48px);` +
    'overflow-y:auto;box-sizing:border-box;background:var(--hc-panel);border:1px solid var(--hc-silver);' +
    `border-radius:12px;padding:20px 24px 22px;box-shadow:0 0 40px ${cssRgba(C.void, 0.6)}`;
  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:14px';
  for (const card of pickerModel(opts.kit, opts.slot)) grid.appendChild(makePickerCard(card, opts.accent, pick));
  modal.append(makeTitleBar(close), grid);
  return modal;
}

/**
 * Open the picker for kit index `opts.slot` inside `opts.host`. Never stacks: a
 * live picker is closed first. Attaches NO key listener of its own — the layer
 * routes its keydown through `handle.key` so one listener owns the keyboard.
 */
export function openKitPicker(opts: KitPickerOpts): KitPickerHandle {
  live?.close();
  const root = document.createElement('div');
  root.dataset.kitPicker = '';
  root.style.cssText =
    'position:absolute;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center';
  const dim = document.createElement('div');
  dim.dataset.kitDim = '';
  dim.style.cssText = `position:absolute;inset:0;background:${cssRgba(C.void, 0.55)}`;
  let open = true;
  const close = (): void => {
    if (!open) return;
    open = false;
    root.remove();
    if (live === handle) live = null;
    opts.onClose();
  };
  const pick = (id: ConsumableId): void => {
    const next = pickLine(opts.kit, opts.slot, id);
    if (next === opts.kit) return;
    close();
    opts.onPick(next);
  };
  dim.addEventListener('click', close);
  root.append(dim, makeModal(opts, close, pick));
  const handle: KitPickerHandle = {
    close,
    isOpen: () => open,
    key: (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      close();
    },
  };
  opts.host.appendChild(root);
  live = handle;
  return handle;
}
