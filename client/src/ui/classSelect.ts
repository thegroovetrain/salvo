// Class-select layer (Story 1.14) — the "cards side by side" pick that OPENS
// over the dimmed/blurred home (ui/home.ts), per the ratified mock
// (home-class-picker-1.html `.layer`). Three class cards (356px) + a dashed
// ghost card on a horizontal scroll rail, each card carrying the four
// differences that matter: hull silhouette (the shared polygon via
// util/silhouetteSvg), three real-value pip scales (util/pips against
// absolute anchors), and the two special-slot loadout rows. The footer is the
// ONLY home for the Color Hoist (the duplicate home picker is retired) and
// carries CONFIRM SELECTION — which saves the class and returns to port. It
// never deploys: PLAY is the single launch path.
//
// Keyboard: 1/2/3 + arrows move the highlight, Enter ≡ CONFIRM SELECTION, ESC
// closes without change — all gated OFF whenever a text input is focused (the
// callsign field keeps its own Enter=PLAY). Colors/typography via CLIENT_CONFIG
// tokens (cssHex/cssRgba for the personal hues, which have no --hc-* var;
// registerCss for the DESIGN type ramp). DESIGN spine over mock: CONFIRM
// SELECTION is an amber OUTLINE+GLOW primary button (never a filled slab).

import { CONFIG, SHIP_CLASS_IDS, type ShipClassId } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { applyViewportCap } from './fit.js';
import { cssHex, cssRgba, textSafe } from '../util/color.js';
import { silhouetteSvg } from '../util/silhouetteSvg.js';
import { pipFill } from '../util/pips.js';
import { PLAYER_HUES, PLAYER_FILLS } from '../render/ships.js';
import { ensureColorPref, COLOR_PREF_KEY } from '../net/connection.js';
import { registerCss } from './theme.js';

const C = CLIENT_CONFIG.colors;

// --- class display data (verbatim rulings) -----------------------------------

/** Two-word display names the ship-class id can't produce. */
export const CLASS_DISPLAY_NAMES: Record<ShipClassId, string> = {
  torpedoBoat: 'TORPEDO BOAT',
  battleship: 'BATTLESHIP',
  mineLayer: 'MINE LAYER',
};

interface LoadoutRow {
  key: string;
  value: string;
}

/**
 * Long-form loadout rows — the two class specials only. Eric ruling
 * 2026-07-24: NO fantasy tagline and NO universal-GUN row on the cards (both
 * were mock-era content he rejected); the gun is a given on every hull, the
 * card sells what differs. Row labels are the slots' future keys Q/E (the
 * ruled Epic-2 mapping: Q/E = the two class-special slots).
 */
const LOADOUT: Record<ShipClassId, readonly LoadoutRow[]> = {
  torpedoBoat: [
    { key: 'Q', value: 'TORPEDO TUBES' },
    { key: 'E', value: 'SPEED BOOST' },
  ],
  battleship: [
    { key: 'Q', value: 'LONG-RANGE CANNON' },
    { key: 'E', value: 'STAR SHELLS' },
  ],
  mineLayer: [
    { key: 'Q', value: 'PROXIMITY MINES' },
    { key: 'E', value: 'DECOY BUOY' },
  ],
};

/** Register label sitting to the LEFT of the footer swatch row. */
const HOIST_LABEL = 'COLOR PREFERENCE:';

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
  pips: PipRow[];
  loadout: readonly LoadoutRow[];
}

/**
 * The card's data per class: name, zero-padded key (index+1), the three
 * real-value pips (util/pips against the objective anchor ladders — TB 4/2/4,
 * BS 2/4/2, ML 3/3/3), and the two special-slot loadout rows. Pure — the DOM
 * builder + tests consume it.
 */
export function cardViewModel(cls: ShipClassId): CardViewModel {
  const spec = CONFIG.shipClasses[cls];
  const anchors = CLIENT_CONFIG.home.pip;
  return {
    cls,
    name: CLASS_DISPLAY_NAMES[cls],
    key: String(SHIP_CLASS_IDS.indexOf(cls) + 1).padStart(2, '0'),
    pips: [
      { label: 'SPEED', filled: pipFill(spec.kinematics.maxSpeed, anchors.speed) },
      { label: 'TOUGHNESS', filled: pipFill(spec.hp, anchors.toughness) },
      { label: 'TURNING', filled: pipFill(spec.kinematics.turnRate, anchors.turning) },
    ],
    loadout: LOADOUT[cls],
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

// --- color hoist (shared controller) -----------------------------------------

function accentColor(idx: number): string {
  return cssHex(PLAYER_HUES[idx]);
}

function accentFillColor(idx: number): string {
  return cssHex(PLAYER_FILLS[idx]);
}

function saveColorPref(idx: number): void {
  try {
    localStorage.setItem(COLOR_PREF_KEY, String(idx));
  } catch {
    // storage unavailable — the preference just won't persist
  }
}

/**
 * The shared Color Hoist state. One instance is created by the home and passed
 * into the layer, so the layer's swatch row and the home's tinted chrome (Class
 * Chip, callsign field) stay in lockstep — the home itself no longer carries a
 * picker, only the tint that follows this state. `pick` writes
 * `hullcracker.color` — the exact key connection.ts's `loadColorPref` reads —
 * and notifies every subscriber (the row's rings, the home tint, the card).
 *
 * The index is NEVER null: the constructor seeds from `ensureColorPref()`,
 * which either returns the valid stored preference or rolls a uniform random
 * Regatta hue and persists it before first paint (the retired amber-unset
 * fallback is gone — an unset player still gets a personal identity color).
 */
export class ColorHoist {
  private index: number;
  private readonly listeners: Array<(idx: number) => void> = [];

  constructor() {
    this.index = ensureColorPref();
  }

  /** Selected wheel index (0..19) — always a real index, never null. */
  get selected(): number {
    return this.index;
  }

  /** Resolved personal accent CSS color (the raw pref hue — outlines/borders). */
  get accent(): string {
    return accentColor(this.index);
  }

  /** The personal accent as a raw 0xRRGGBB number (for `cssRgba` glows). */
  get accentValue(): number {
    return PLAYER_HUES[this.index];
  }

  /** The personal accent rendered as TEXT — WCAG-lifted via `textSafe`. */
  get accentText(): string {
    return cssHex(textSafe(PLAYER_HUES[this.index]));
  }

  /** Personal interior fill CSS color. */
  get accentFill(): string {
    return accentFillColor(this.index);
  }

  /** Live subscriber count (test-only hook: proves layer open/close balances). */
  get listenerCount(): number {
    return this.listeners.length;
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
  sw.addEventListener('click', () => {
    hoist.pick(idx);
    // Release focus so the full keyboard (ESC/Enter/arrows) is live again —
    // without this the swatch stays the focused BUTTON and Enter/Space stay
    // swallowed by isSwallowedKey until a stray mouse click (Finding A).
    sw.blur();
  });
  return sw;
}

export interface HoistRow {
  el: HTMLElement;
  /** Release the row's `hoist.onChange` subscription (call on layer/home teardown). */
  off: () => void;
}

/**
 * THE Color Hoist row (a `COLOR PREFERENCE:` register label + 20 round
 * swatches), wired to the shared `hoist` and mounted only in the layer footer —
 * the home's duplicate picker is retired, so this row is the single place a hue
 * is chosen. The claim-caveat caption is gone with it. Repaints its selected
 * ring on every hoist change. Returns the element AND an `off` disposer so the
 * caller releases the subscription when its container tears down (the hoist
 * outlives the row).
 */
export function makeHoistRow(hoist: ColorHoist): HoistRow {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:row;align-items:center;gap:16px;min-width:0';

  const label = document.createElement('span');
  label.textContent = HOIST_LABEL;
  label.style.cssText = `${registerCss('label')};color:var(--hc-phosphor);white-space:nowrap`;

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-start;min-width:0';
  const swatches: HTMLButtonElement[] = [];
  for (let i = 0; i < PLAYER_HUES.length; i++) {
    const sw = makeSwatch(hoist, i);
    swatches.push(sw);
    row.appendChild(sw);
  }

  const paintRing = (): void => {
    const sel = hoist.selected;
    swatches.forEach((sw, i) => {
      const on = i === sel;
      sw.style.outline = on ? `2px solid ${cssHex(PLAYER_HUES[i])}` : 'none';
      sw.style.outlineOffset = on ? '3px' : '0';
    });
  };
  paintRing();
  const off = hoist.onChange(paintRing);

  wrap.append(label, row);
  return { el: wrap, off };
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

/** A pip-scale grid (SPEED/TOUGHNESS/TURNING × 5 bars); returns the row cells. */
function buildPips(vm: CardViewModel): { el: HTMLElement; rows: HTMLElement[][] } {
  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:88px 1fr;row-gap:6px;align-items:center';
  const rows: HTMLElement[][] = [];
  for (const pr of vm.pips) {
    const label = document.createElement('span');
    label.textContent = pr.label;
    label.style.cssText = `${registerCss('hudMicro')};color:var(--hc-phosphor);letter-spacing:0.16em`;
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
    k.style.cssText = `${registerCss('hudMicro')};flex:0 0 108px;color:var(--hc-phosphor);letter-spacing:0.14em`;
    const v = document.createElement('span');
    v.textContent = slot.value;
    v.style.cssText = 'font:500 20px var(--hc-font-mono);letter-spacing:0.05em;color:var(--hc-text-primary)';
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
    'font:500 18px var(--hc-font-mono);letter-spacing:0.24em;border:1px solid var(--hc-hairline);' +
    'color:var(--hc-text-primary)';
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
  root.append(head, silbox, pips.el, buildLoadout(vm), pickRow);
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
    'align-items:center;justify-content:center;font:400 34px var(--hc-font-display);color:var(--hc-phosphor)';
  const gt = document.createElement('div');
  gt.innerHTML = 'MORE CLASSES<br>IN DEVELOPMENT';
  gt.style.cssText =
    `${registerCss('hudMicro')};color:var(--hc-phosphor);letter-spacing:0.22em;text-align:center;line-height:2`;
  card.append(qm, gt);
  return card;
}

// --- card paint (selection treatment) ----------------------------------------

/** Repaint every card for the current highlight + personal accent. */
function paintCards(cards: CardEls[], highlight: number, hoist: ColorHoist): void {
  const n = hoist.accentValue;
  const fill = hoist.accentFill;
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
function buildConfirm(onConfirm: () => void): HTMLElement {
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

function buildFooter(hoist: ColorHoist, onConfirm: () => void): HoistRow {
  const foot = document.createElement('div');
  // flex-wrap:wrap — below ~700px viewport width this nowrap row (label + 20
  // swatches + the 300px-min CONFIRM button) clipped the button outside the
  // panel (vertical-only scroll can't reach it). Wrapping degrades gracefully
  // instead; the ratified 1366x768 floor is unchanged (still fits on one row).
  foot.style.cssText =
    'display:flex;align-items:center;flex-wrap:wrap;gap:30px;padding:18px 42px 0;' +
    'border-top:1px solid var(--hc-hairline);margin-top:4px';
  const hoistRow = makeHoistRow(hoist);
  foot.append(hoistRow.el, buildConfirm(onConfirm));
  return { el: foot, off: hoistRow.off };
}

// --- open / lifecycle --------------------------------------------------------

export interface ClassSelectOpts {
  /** Card pre-highlighted on open (first-run: Torpedo Boat). */
  initial: ShipClassId;
  hoist: ColorHoist;
  /** Home overlay to blur/dim behind the layer while open. */
  blurTarget: HTMLElement;
  /** Card click / SELECT: persist + close + update the chip (no deploy). */
  onPick: (cls: ShipClassId) => void;
  /** Footer CONFIRM SELECTION (and Enter): persist the highlight + close back to
   *  port. NEVER deploys — PLAY is the one launch path. */
  onConfirm: (cls: ShipClassId) => void;
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

/** A layer button (e.g. a focused color swatch) holds keyboard focus. */
function isLayerButton(el: Element | null, container: HTMLElement): boolean {
  return !!el && el.tagName === 'BUTTON' && container.contains(el);
}

/**
 * Only Enter/Space are swallowed while a layer button holds focus — those two
 * would otherwise double-fire (native button activation racing our own
 * pick/confirm). Everything else (ESC/arrows/digits) must still reach the
 * layer regardless of focus, or a focused button (notably a color swatch —
 * the bay is the app's ONLY color picker) would deafen the whole layer to
 * every shortcut until a stray mouse click restored it (Finding A).
 */
function isSwallowedKey(e: KeyboardEvent, container: HTMLElement): boolean {
  return (e.key === 'Enter' || e.key === ' ') && isLayerButton(document.activeElement, container);
}

/** The single live layer, if any — so a re-open fully tears the prior one down
 *  (window listener + hoist subscriptions), never just its DOM (fix: half-teardown). */
let current: { close(): void } | null = null;

interface LayerWiring {
  container: HTMLElement;
  dimmer: HTMLElement;
  blurTarget: HTMLElement;
  hoist: ColorHoist;
  onKey: (e: KeyboardEvent) => void;
  onResize: () => void;
  dismiss: () => void;
  repaint: () => void;
  evaluateOverflow: () => void;
}

/** Attach the layer's listeners, blur the home, mount it, and paint — returns the
 *  hoist unsubscribe. Split out of openClassSelect to keep that function lean. */
function activateLayer(w: LayerWiring): () => void {
  w.dimmer.addEventListener('click', w.dismiss);
  const unsubHoist = w.hoist.onChange(w.repaint);
  window.addEventListener('keydown', w.onKey);
  window.addEventListener('resize', w.onResize);
  // Hand keyboard control to the layer: drop callsign focus (typing-isolation guard).
  if (isTextInput(document.activeElement)) (document.activeElement as HTMLElement).blur();
  w.blurTarget.style.filter = 'blur(2px)';
  w.blurTarget.style.opacity = '0.5';
  document.body.appendChild(w.container);
  w.evaluateOverflow(); // now that the rail is laid out, hide fade/chevron if it fits
  w.repaint();
  return unsubHoist;
}

/**
 * Open the class-select layer over the home. Returns a handle whose `close()`
 * tears everything down (removes the DOM, restores the home blur, detaches the
 * keydown listener). All three exits (pick / confirm / dismiss) close the layer
 * here and then route through the caller's callbacks — none of them deploys.
 */
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

export function openClassSelect(opts: ClassSelectOpts): ClassSelectHandle {
  current?.close(); // full teardown of any prior layer (listener + subscriptions), not just DOM
  const cards = SHIP_CLASS_IDS.map((cls) => buildCard(cardViewModel(cls), pick));
  let highlight = Math.max(0, SHIP_CLASS_IDS.indexOf(opts.initial));

  const { container, dimmer, panel } = makeLayerShell();
  const rail = buildRail(cards);
  const footer = buildFooter(opts.hoist, confirmPick);
  panel.append(buildHeader(), rail.el, footer.el);

  // Ignore any keydown dispatched at/before this instant — the very keystroke
  // (Enter on the callsign field / chip) that opened us is still bubbling and
  // would otherwise reach the freshly-attached window listener and insta-pick.
  const openedAt = performance.now();
  const onResize = (): void => rail.evaluateOverflow();
  function repaint(): void {
    paintCards(cards, highlight, opts.hoist);
  }
  function pick(cls: ShipClassId): void {
    close();
    opts.onPick(cls);
  }
  /** CONFIRM SELECTION / Enter: resolve the highlight, close, hand it back. */
  function confirmPick(): void {
    const cls = SHIP_CLASS_IDS[highlight];
    close();
    opts.onConfirm(cls);
  }
  function dismiss(): void {
    close();
    opts.onClose();
  }
  function onKey(e: KeyboardEvent): void {
    if (e.timeStamp <= openedAt) return; // the opening keystroke — never ours to act on
    if (isTextInput(document.activeElement)) return;
    if (isSwallowedKey(e, container)) return; // let native Enter/Space button activation win
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
    unsubHoist();
    footer.off();
    container.remove();
    opts.blurTarget.style.filter = '';
    opts.blurTarget.style.opacity = '';
    if (current === handle) current = null;
  }
  const handle: ClassSelectHandle = { close };
  const unsubHoist = activateLayer({
    container, dimmer, blurTarget: opts.blurTarget, hoist: opts.hoist,
    onKey, onResize, dismiss, repaint, evaluateOverflow: rail.evaluateOverflow,
  });
  current = handle;
  return handle;
}
