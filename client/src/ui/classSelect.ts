// Class-select layer (Story 1.14) — the "cards side by side" pick that OPENS
// over the dimmed/blurred home (ui/home.ts), per the ratified mock
// (home-class-picker-1.html `.layer`). Three class cards (356px) + a dashed
// ghost card on a horizontal scroll rail, each card carrying the four
// differences that matter: hull silhouette (the shared polygon via
// util/silhouetteSvg), the GDD fantasy line, three real-value pip scales
// (util/pips against absolute anchors), and the fitted loadout. A footer
// repeats the Color Hoist and carries SET SAIL (pick + deploy in one press).
//
// Keyboard: 1/2/3 + arrows move the highlight, Enter picks it, ESC closes
// without change — all gated OFF whenever a text input is focused (the callsign
// field keeps its own Enter=PLAY). Colors/typography via CLIENT_CONFIG tokens
// (cssHex/cssRgba for the personal hues, which have no --hc-* var; registerCss
// for the DESIGN type ramp). DESIGN spine over mock: SET SAIL is an amber
// OUTLINE+GLOW primary button (never a filled slab).

import { CONFIG, SHIP_CLASS_IDS, type ShipClassId } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { cssHex, cssRgba } from '../util/color.js';
import { silhouetteSvg } from '../util/silhouetteSvg.js';
import { pipFill } from '../util/pips.js';
import { PLAYER_HUES, PLAYER_FILLS } from '../render/ships.js';
import { loadColorPref } from '../net/connection.js';
import { registerCss } from './theme.js';

const C = CLIENT_CONFIG.colors;

// --- class display data (verbatim rulings) -----------------------------------

/** Two-word display names the ship-class id can't produce. */
export const CLASS_DISPLAY_NAMES: Record<ShipClassId, string> = {
  torpedoBoat: 'TORPEDO BOAT',
  battleship: 'BATTLESHIP',
  mineLayer: 'MINE LAYER',
};

/** GDD power-fantasy line per class (verbatim from the mock). */
const FANTASY: Record<ShipClassId, string> = {
  torpedoBoat: 'fast, fragile, the needle-threader',
  battleship: 'massive, heavily armored, long-range artillery',
  mineLayer: 'the trapper',
};

interface LoadoutRow {
  key: string;
  value: string;
}

/** Long-form loadout rows (GUN universal + two class specials), verbatim. */
const LOADOUT: Record<ShipClassId, readonly LoadoutRow[]> = {
  torpedoBoat: [
    { key: 'GUN', value: 'STANDARD GUN — UNIVERSAL' },
    { key: 'SPECIAL 1', value: 'TORPEDO TUBES' },
    { key: 'SPECIAL 2', value: 'SPEED BOOST' },
  ],
  battleship: [
    { key: 'GUN', value: 'STANDARD GUN — UNIVERSAL' },
    { key: 'SPECIAL 1', value: 'LONG-RANGE CANNON' },
    { key: 'SPECIAL 2', value: 'STAR SHELLS' },
  ],
  mineLayer: [
    { key: 'GUN', value: 'STANDARD GUN — UNIVERSAL' },
    { key: 'SPECIAL 1', value: 'PROXIMITY MINES' },
    { key: 'SPECIAL 2', value: 'DECOY BUOY' },
  ],
};

const HOIST_CAPTION = 'PREFERENCE PICK — YOU GET IT UNLESS CLAIMED, THEN NEAREST FREE HUE';
const COLOR_KEY = 'hullcracker.color';

// --- pure view-model + input helpers (tested) --------------------------------

interface PipRow {
  label: string;
  filled: number; // 1..5
}

export interface CardViewModel {
  cls: ShipClassId;
  name: string;
  /** DISPLAYED zero-padded card key ('01'/'02'/'03'). */
  key: string;
  fantasy: string;
  pips: PipRow[];
  loadout: readonly LoadoutRow[];
}

/**
 * The card's data per class: name, zero-padded key (index+1), fantasy line, the
 * three real-value pips (util/pips against the absolute anchors — TB 4/2/4,
 * BS 3/4/2, ML 3/3/3), and the loadout rows. Pure — the DOM builder + tests
 * consume it.
 */
export function cardViewModel(cls: ShipClassId): CardViewModel {
  const spec = CONFIG.shipClasses[cls];
  const anchors = CLIENT_CONFIG.home.pip;
  return {
    cls,
    name: CLASS_DISPLAY_NAMES[cls],
    key: String(SHIP_CLASS_IDS.indexOf(cls) + 1).padStart(2, '0'),
    fantasy: FANTASY[cls],
    pips: [
      { label: 'SPEED', filled: pipFill(spec.kinematics.maxSpeed, anchors.speedMax) },
      { label: 'TOUGHNESS', filled: pipFill(spec.hp, anchors.hpMax) },
      { label: 'TURNING', filled: pipFill(spec.kinematics.turnRate, anchors.turnMax) },
    ],
    loadout: LOADOUT[cls],
  };
}

/** Compact loadout line for the home Class Chip sub-line (gun + two specials). */
export function chipLoadoutLine(cls: ShipClassId): string {
  const rows = LOADOUT[cls];
  return ['STD GUN', rows[1].value, rows[2].value].join(' · ');
}

export type LayerAction =
  | { kind: 'highlight'; index: number }
  | { kind: 'move'; dir: -1 | 1 }
  | { kind: 'pick' }
  | { kind: 'close' }
  | null;

/**
 * Map a keydown key to a layer action, or null (ignored). 1..cardCount jump the
 * highlight to that card; arrows step it; Enter picks the highlight; ESC closes.
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

// --- color hoist (shared controller) -----------------------------------------

/** Resolved personal accent as a 0xRRGGBB number (pref hue, or amber when unset). */
function accentNum(idx: number | null): number {
  return idx === null ? C.amber : PLAYER_HUES[idx];
}

function accentColor(idx: number | null): string {
  return cssHex(accentNum(idx));
}

function accentFillColor(idx: number | null): string {
  return idx === null ? 'none' : cssHex(PLAYER_FILLS[idx]);
}

function saveColorPref(idx: number): void {
  try {
    localStorage.setItem(COLOR_KEY, String(idx));
  } catch {
    // storage unavailable — the preference just won't persist
  }
}

/**
 * The shared Color Hoist state. One instance is created by the home and passed
 * into the layer, so the two swatch rows (home + layer footer) and the Class
 * Chip / card treatment stay in lockstep. `pick` writes `hullcracker.color` —
 * the exact key connection.ts's `loadColorPref` reads — and notifies every
 * subscriber (both rows' rings, the chip border, the highlighted card).
 */
export class ColorHoist {
  private index: number | null;
  private readonly listeners: Array<(idx: number) => void> = [];

  constructor() {
    this.index = loadColorPref() ?? null;
  }

  /** Selected wheel index (0..19) or null when no preference is stored. */
  get selected(): number | null {
    return this.index;
  }

  /** Resolved personal accent CSS color (the pref hue, or amber when unset). */
  get accent(): string {
    return accentColor(this.index);
  }

  /** Personal interior fill CSS color, or 'none' when no preference is set. */
  get accentFill(): string {
    return accentFillColor(this.index);
  }

  /** Register a repaint fired on every pick; returns an unsubscribe. */
  onChange(fn: (idx: number) => void): () => void {
    this.listeners.push(fn);
    return () => {
      const i = this.listeners.indexOf(fn);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }

  pick(idx: number): void {
    this.index = idx;
    saveColorPref(idx);
    for (const fn of this.listeners) fn(idx);
  }
}

const SWATCH_BASE = [
  'width:20px',
  'height:20px',
  'border-radius:50%',
  'border:1px solid transparent',
  'cursor:pointer',
  'padding:0',
].join(';');

/** One 20px round swatch; its ring is painted by the row's repaint. */
function makeSwatch(hoist: ColorHoist, idx: number): HTMLButtonElement {
  const sw = document.createElement('button');
  sw.type = 'button';
  sw.style.cssText = `${SWATCH_BASE};background:${cssHex(PLAYER_HUES[idx])}`;
  sw.setAttribute('aria-label', `hue ${idx + 1}`);
  sw.addEventListener('click', () => hoist.pick(idx));
  return sw;
}

/**
 * A Color Hoist row (20 round swatches + caption), wired to the shared `hoist`.
 * `direction` lays the caption below ('column', home) or the row is inline
 * ('row', layer footer). Repaints its selected ring on every hoist change.
 */
export function makeHoistRow(hoist: ColorHoist, direction: 'column' | 'row'): HTMLElement {
  const wrap = document.createElement('div');
  wrap.style.cssText =
    direction === 'column'
      ? 'display:flex;flex-direction:column;align-items:center;gap:8px'
      : 'display:flex;flex-direction:row;align-items:center;gap:14px';

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;justify-content:center';
  const swatches: HTMLButtonElement[] = [];
  for (let i = 0; i < PLAYER_HUES.length; i++) {
    const sw = makeSwatch(hoist, i);
    swatches.push(sw);
    row.appendChild(sw);
  }

  const cap = document.createElement('div');
  cap.textContent = HOIST_CAPTION;
  cap.style.cssText = `${registerCss('hudMicro')};color:var(--hc-text-muted);letter-spacing:0.08em`;

  const paintRing = (): void => {
    const sel = hoist.selected;
    swatches.forEach((sw, i) => {
      const on = i === sel;
      sw.style.outline = on ? `2px solid ${cssHex(PLAYER_HUES[i])}` : 'none';
      sw.style.outlineOffset = on ? '3px' : '0';
    });
  };
  paintRing();
  hoist.onChange(paintRing);

  wrap.append(row, cap);
  return wrap;
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
  name.style.cssText = 'font:700 21px var(--hc-font-display);letter-spacing:0.05em;color:var(--hc-text-primary)';
  const key = document.createElement('span');
  key.textContent = vm.key;
  key.style.cssText = `${registerCss('hudMicro')};color:var(--hc-text-muted);letter-spacing:0.1em`;
  head.append(name, key);
  return head;
}

function buildFantasy(vm: CardViewModel): HTMLElement {
  const f = document.createElement('div');
  f.textContent = `“${vm.fantasy}”`;
  f.style.cssText =
    'font:400 12.5px var(--hc-font-display);font-style:italic;color:var(--hc-text-secondary);' +
    'margin-top:2px;min-height:34px';
  return f;
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

/** A pip-scale grid (SPEED/TOUGHNESS/TURNING × 5 bars); returns the row cells. */
function buildPips(vm: CardViewModel): { el: HTMLElement; rows: HTMLElement[][] } {
  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:88px 1fr;row-gap:6px;align-items:center';
  const rows: HTMLElement[][] = [];
  for (const pr of vm.pips) {
    const label = document.createElement('span');
    label.textContent = pr.label;
    label.style.cssText = `${registerCss('hudMicro')};color:var(--hc-text-muted);letter-spacing:0.16em`;
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

function buildLoadout(vm: CardViewModel): HTMLElement {
  const wrap = document.createElement('div');
  wrap.style.cssText =
    'margin-top:12px;border-top:1px solid var(--hc-hairline);padding-top:11px;' +
    'display:flex;flex-direction:column;gap:5px';
  for (const slot of vm.loadout) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:10px;align-items:baseline';
    const k = document.createElement('span');
    k.textContent = slot.key;
    k.style.cssText = `${registerCss('hudMicro')};flex:0 0 74px;color:var(--hc-text-muted);letter-spacing:0.14em`;
    const v = document.createElement('span');
    v.textContent = slot.value;
    v.style.cssText = 'font:500 13px var(--hc-font-mono);letter-spacing:0.05em;color:var(--hc-text-primary)';
    row.append(k, v);
    wrap.appendChild(row);
  }
  return wrap;
}

function buildPickButton(): HTMLElement {
  const row = document.createElement('div');
  row.style.cssText = 'margin-top:14px';
  const btn = document.createElement('div');
  btn.className = 'hc-pickbtn';
  btn.textContent = 'SELECT';
  btn.style.cssText =
    'width:100%;height:38px;border-radius:6px;display:flex;align-items:center;justify-content:center;' +
    'font:500 12px var(--hc-font-mono);letter-spacing:0.24em;border:1px solid var(--hc-hairline);' +
    'color:var(--hc-text-secondary)';
  row.appendChild(btn);
  return row;
}

function buildCard(vm: CardViewModel, onPick: (cls: ShipClassId) => void): CardEls {
  const root = document.createElement('div');
  root.className = 'hc-ccard';
  root.style.cssText = CARD_BASE;
  const silbox = buildSilbox();
  const head = buildCardHead(vm);
  const pips = buildPips(vm);
  const pickRow = buildPickButton();
  root.append(head, buildFantasy(vm), silbox, pips.el, buildLoadout(vm), pickRow);
  root.addEventListener('click', () => onPick(vm.cls));
  return {
    cls: vm.cls,
    root,
    silbox,
    cname: head.querySelector('.hc-cname') as HTMLElement,
    pipEls: pips.rows,
    pipFilled: vm.pips.map((p) => p.filled),
    pickBtn: pickRow.querySelector('.hc-pickbtn') as HTMLElement,
    silverStroke: cssHex(C.silver),
  };
}

function buildGhostCard(): HTMLElement {
  const card = document.createElement('div');
  card.style.cssText =
    'flex:0 0 356px;background:var(--hc-panel-deep);border:1px dashed var(--hc-hairline);border-radius:10px;' +
    'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;min-height:472px;opacity:0.85';
  const qm = document.createElement('div');
  qm.textContent = '?';
  qm.style.cssText =
    'width:70px;height:110px;border:1.5px dashed var(--hc-hairline);border-radius:10px;display:flex;' +
    'align-items:center;justify-content:center;font:400 34px var(--hc-font-display);color:var(--hc-text-muted)';
  const gt = document.createElement('div');
  gt.innerHTML = 'MORE CLASSES<br>IN DEVELOPMENT';
  gt.style.cssText =
    `${registerCss('hudMicro')};color:var(--hc-text-muted);letter-spacing:0.22em;text-align:center;line-height:2`;
  card.append(qm, gt);
  return card;
}

// --- card paint (selection treatment) ----------------------------------------

/** Repaint every card for the current highlight + personal accent. */
function paintCards(cards: CardEls[], highlight: number, hoist: ColorHoist): void {
  const n = accentNum(hoist.selected);
  const fill = accentFillColor(hoist.selected);
  cards.forEach((card, i) => paintCard(card, i === highlight, n, fill));
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
    `${registerCss('hudMicro')};margin-left:auto;color:var(--hc-text-muted);letter-spacing:0.14em;` +
    'display:flex;align-items:center;gap:8px';
  const escKey = document.createElement('b');
  escKey.textContent = 'ESC';
  escKey.style.cssText =
    'color:var(--hc-text-secondary);border:1px solid var(--hc-hairline);border-radius:4px;padding:2px 8px;font-weight:500';
  const escLabel = document.createElement('span');
  escLabel.textContent = 'BACK TO PORT';
  esc.append(escKey, escLabel);
  head.append(kicker, title, esc);
  return head;
}

function buildRail(cards: CardEls[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:relative';
  const rail = document.createElement('div');
  rail.style.cssText = 'display:flex;gap:22px;overflow-x:auto;padding:6px 42px 18px';
  for (const card of cards) rail.appendChild(card.root);
  rail.appendChild(buildGhostCard());
  const fade = document.createElement('div');
  fade.style.cssText =
    `position:absolute;right:0;top:0;bottom:18px;width:110px;pointer-events:none;` +
    `background:linear-gradient(90deg, ${cssRgba(C.panel, 0)}, ${cssRgba(C.panel, 0.92)} 78%)`;
  const chevron = document.createElement('div');
  chevron.textContent = '›';
  chevron.style.cssText =
    'position:absolute;right:20px;top:44%;font:400 30px var(--hc-font-display);color:var(--hc-phosphor);pointer-events:none';
  wrap.append(rail, fade, chevron);
  return wrap;
}

/** Amber outline+glow primary button (DESIGN spine — never a filled slab). */
function buildSetSail(onSetSail: () => void): HTMLElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = 'SET SAIL';
  btn.style.cssText =
    'margin-left:auto;width:300px;height:56px;background:transparent;border:1px solid var(--hc-amber);' +
    'border-radius:7px;color:var(--hc-amber);font:800 20px var(--hc-font-mono);letter-spacing:0.3em;' +
    `text-indent:0.3em;cursor:pointer;box-shadow:0 0 30px ${cssRgba(C.amber, 0.22)}`;
  btn.addEventListener('click', onSetSail);
  return btn;
}

function buildFooter(hoist: ColorHoist, onSetSail: () => void): HTMLElement {
  const foot = document.createElement('div');
  foot.style.cssText =
    'display:flex;align-items:center;gap:30px;padding:18px 42px 0;border-top:1px solid var(--hc-hairline);margin-top:4px';
  foot.append(makeHoistRow(hoist, 'row'), buildSetSail(onSetSail));
  return foot;
}

// --- open / lifecycle --------------------------------------------------------

export interface ClassSelectOpts {
  /** Card pre-highlighted on open (first-run: Torpedo Boat). */
  initial: ShipClassId;
  hoist: ColorHoist;
  /** Home overlay to blur/dim behind the layer while open. */
  blurTarget: HTMLElement;
  /** Enter / card click / SELECT: persist + close + update the chip (no deploy). */
  onPick: (cls: ShipClassId) => void;
  /** Footer SET SAIL: pick the highlight AND deploy in one press. */
  onSetSail: (cls: ShipClassId) => void;
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

/**
 * Open the class-select layer over the home. Returns a handle whose `close()`
 * tears everything down (removes the DOM, restores the home blur, detaches the
 * keydown listener). All three exits (pick / set-sail / dismiss) route through
 * the caller's callbacks; the caller closes via those (except SET SAIL, which
 * closes here after deploying).
 */
function makeLayerShell(): { container: HTMLElement; dimmer: HTMLElement; panel: HTMLElement } {
  const container = document.createElement('div');
  container.id = LAYER_ID;
  container.style.cssText =
    'position:fixed;inset:0;z-index:1200;display:flex;align-items:center;justify-content:center';
  const dimmer = document.createElement('div');
  dimmer.style.cssText = `position:absolute;inset:0;background:${cssRgba(C.void, 0.72)}`;
  const panel = document.createElement('div');
  panel.style.cssText =
    'position:relative;width:1680px;max-width:calc(100vw - 48px);max-height:calc(100vh - 48px);overflow-y:auto;' +
    'background:var(--hc-panel);border:1px solid var(--hc-hairline);border-radius:12px;padding:34px 0 26px';
  container.append(dimmer, panel);
  return { container, dimmer, panel };
}

export function openClassSelect(opts: ClassSelectOpts): ClassSelectHandle {
  document.getElementById(LAYER_ID)?.remove();
  const cards = SHIP_CLASS_IDS.map((cls) => buildCard(cardViewModel(cls), pick));
  let highlight = Math.max(0, SHIP_CLASS_IDS.indexOf(opts.initial));

  const { container, dimmer, panel } = makeLayerShell();
  panel.append(buildHeader(), buildRail(cards), buildFooter(opts.hoist, setSail));

  let unsubHoist = (): void => undefined;
  function repaint(): void {
    paintCards(cards, highlight, opts.hoist);
  }
  function pick(cls: ShipClassId): void {
    close();
    opts.onPick(cls);
  }
  function setSail(): void {
    const cls = SHIP_CLASS_IDS[highlight];
    close();
    opts.onSetSail(cls);
  }
  function dismiss(): void {
    close();
    opts.onClose();
  }
  function onKey(e: KeyboardEvent): void {
    if (isTextInput(document.activeElement)) return;
    const action = keyAction(e.key, cards.length);
    if (!action) return;
    e.preventDefault();
    if (action.kind === 'highlight') highlight = action.index;
    else if (action.kind === 'move') highlight = moveHighlight(highlight, action.dir, cards.length);
    else if (action.kind === 'pick') return pick(SHIP_CLASS_IDS[highlight]);
    else if (action.kind === 'close') return dismiss();
    repaint();
  }
  function close(): void {
    window.removeEventListener('keydown', onKey);
    unsubHoist();
    container.remove();
    opts.blurTarget.style.filter = '';
    opts.blurTarget.style.opacity = '';
  }

  dimmer.addEventListener('click', dismiss);
  unsubHoist = opts.hoist.onChange(repaint);
  window.addEventListener('keydown', onKey);
  // Hand keyboard control to the layer: drop callsign focus (typing-isolation guard).
  if (isTextInput(document.activeElement)) (document.activeElement as HTMLElement).blur();
  opts.blurTarget.style.filter = 'blur(2px)';
  opts.blurTarget.style.opacity = '0.5';
  document.body.appendChild(container);
  repaint();
  return { close };
}
