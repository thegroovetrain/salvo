// THE HUD BAR'S FLYOUT (Story 12.3 Part B, AC 34 / 36) — the little box that
// opens BESIDE the bar (toward the open water, level with the row) when the
// pointer is over a weapon or ability tile, or when a hovered upgrade card
// changes one: the tile's stat lines, or the card's amber `old → new ▲`
// changes. A hovered SHIP-stat card opens ONE BOX PER tile whose shown stats
// it moves (Eric 2026-11-20), each beside its own row, stacked so none
// overlaps the next (`stackTops`). They close when the hover ends.
//
// DOM chrome over the canvas (z-index 1000, like the offer group), DISPLAY
// ONLY: `pointer-events:none` on every box, so none ever steals a press or a
// hover from the canvas or the cards under it. Its anchor is the spine's
// (layout.ts `BarLayout.openEdge`, the row's top) in LOGICAL px × the UI scale;
// the content is the pure model (render/console/flyout.ts), rewritten only
// when its signature or anchor moved.

import { CLIENT_CONFIG } from '../config.js';
import { cssRgba } from '../util/color.js';
import { flyoutSig, stackTops, type FlyoutModel } from '../render/console/flyout.js';
import type { HudSide } from '../settings/store.js';

const K = CLIENT_CONFIG.console;
const F = K.flyout;
const T = K.type;
const C = CLIENT_CONFIG.colors;
const BOX_ID = 'hud-flyout';

const ROOT_CSS = [
  'position:fixed',
  'display:none',
  'z-index:1000',
  'pointer-events:none',
  'box-sizing:border-box',
  `min-width:${F.minW}px`,
  `padding:${F.padY}px ${F.padX}px`,
  `background-color:${cssRgba(C.cardScrim, F.bgAlpha)}`,
  'border:1px solid var(--hc-hairline)',
  `box-shadow:0 0 0 1px ${cssRgba(C.phosphor, F.edgeGlow)}`,
  'font-family:var(--hc-font-mono)',
  'white-space:nowrap',
].join(';');

const TITLE_CSS = [`margin:0 0 6px`, `font-size:${T.flyTitle}px`, 'font-weight:600', 'letter-spacing:.06em', 'color:var(--hc-text-primary)'].join(';');
const LINE_CSS = ['display:flex', 'justify-content:space-between', 'gap:18px', `line-height:${F.lineH}px`].join(';');
const KEY_CSS = [`font-size:${T.flyLabel}px`, 'color:var(--hc-text-muted)'].join(';');
const VALUE_CSS = [`font-size:${T.flyValue}px`, 'font-weight:600'].join(';');

/** Where the flyout opens: beside the bar's water-side edge `x`, level with a
 *  row whose top is `y` (both LOGICAL px), toward the open water of `side`. */
export interface FlyoutAnchor {
  x: number;
  y: number;
  side: HudSide;
}

/** One box to show: its content and the row it sits beside. Several share
 *  one bar, so they share `x` and `side`; `y` ascends in bar order. */
export interface FlyoutItem {
  model: FlyoutModel;
  anchor: FlyoutAnchor;
}

/** One pooled box and what it last showed. */
interface Slot {
  box: HTMLDivElement;
  open: boolean;
  model: FlyoutModel | null;
  sig: string;
  x: number;
  y: number;
  side: HudSide | null;
}

function el(tag: string, css: string, text = ''): HTMLElement {
  const e = document.createElement(tag);
  e.style.cssText = css;
  e.textContent = text;
  return e;
}

function makeBox(i: number): HTMLDivElement {
  const box = document.createElement('div');
  // The first box keeps the one id the page has always had.
  box.id = i === 0 ? BOX_ID : `${BOX_ID}-${i}`;
  box.style.cssText = ROOT_CSS;
  // Display only, whatever a parser made of the declarations above.
  box.style.pointerEvents = 'none';
  box.setAttribute('role', 'tooltip');
  document.body.appendChild(box);
  return box;
}

function renderBox(box: HTMLDivElement, m: FlyoutModel): void {
  const lines = m.lines.map((l) => {
    const row = el('div', LINE_CSS);
    const v = el('span', VALUE_CSS, l.value);
    v.style.color = l.amber ? 'var(--hc-amber)' : 'var(--hc-phosphor)';
    row.append(el('span', KEY_CSS, l.label), v);
    return row;
  });
  box.replaceChildren(el('div', TITLE_CSS, m.title), ...lines);
}

export class HudFlyout {
  private slots: Slot[] = [];
  /** How many boxes are open (the first `count` slots). */
  private count = 0;
  private k = 0;
  private viewH = 0;
  /** `show()`'s one-item list, reused frame to frame. */
  private readonly one: FlyoutItem = { model: { title: '', lines: [] }, anchor: { x: 0, y: 0, side: 'left' } };
  private readonly oneList: readonly FlyoutItem[] = [this.one];

  get visible(): boolean {
    return this.count > 0;
  }

  /** How many boxes are open (test seam). */
  get openCount(): number {
    return this.count;
  }

  /** Show ONE box: `model` at `anchor` under the UI scale `s`; the screen
   *  height `viewH` (real px) keeps the box on screen. */
  show(model: FlyoutModel, anchor: FlyoutAnchor, s: number, viewH: number): void {
    this.one.model = model;
    this.one.anchor = anchor;
    this.showAll(this.oneList, s, viewH);
  }

  /** Show one box per item (in bar order) and close the rest; re-measure and
   *  re-place only when a content, an anchor, the scale or the screen moved. */
  showAll(items: readonly FlyoutItem[], s: number, viewH: number): void {
    const k = Number.isFinite(s) && s > 0 ? s : 1;
    let dirty = items.length !== this.count || k !== this.k || viewH !== this.viewH;
    for (let i = 0; i < items.length; i++) dirty = this.fill(this.slotAt(i), items[i]) || dirty;
    this.closeFrom(items.length);
    this.count = items.length;
    this.k = k;
    this.viewH = viewH;
    if (dirty && items.length > 0) this.position(items, k, viewH);
  }

  hide(): void {
    if (this.count === 0) return;
    this.closeFrom(0);
    this.count = 0;
  }

  /** Take the boxes off the page (the session's teardown, beside the other DOM
   *  chrome): a later show() builds fresh ones, so #hud-flyout never doubles. */
  destroy(): void {
    for (const slot of this.slots) slot.box.remove();
    this.slots = [];
    this.count = 0;
  }

  private slotAt(i: number): Slot {
    while (this.slots.length <= i) {
      this.slots.push({ box: makeBox(this.slots.length), open: false, model: null, sig: '', x: NaN, y: NaN, side: null });
    }
    return this.slots[i];
  }

  /** Write one box's content and open it; true when anything about it moved. */
  private fill(slot: Slot, item: FlyoutItem): boolean {
    let moved = !slot.open;
    if (item.model !== slot.model) {
      slot.model = item.model;
      const sig = flyoutSig(item.model);
      if (sig !== slot.sig) {
        slot.sig = sig;
        renderBox(slot.box, item.model);
        moved = true;
      }
    }
    const a = item.anchor;
    if (a.x !== slot.x || a.y !== slot.y || a.side !== slot.side) moved = true;
    slot.x = a.x;
    slot.y = a.y;
    slot.side = a.side;
    if (!slot.open) slot.box.style.display = 'block';
    slot.open = true;
    return moved;
  }

  private closeFrom(n: number): void {
    for (let i = n; i < this.slots.length; i++) {
      const slot = this.slots[i];
      if (slot.open) slot.box.style.display = 'none';
      slot.open = false;
    }
  }

  /** Every open box's corner in CSS px: beside the bar, the bar's own UI
   *  scale on the box (`transform: scale`), stacked down the bar without
   *  overlapping and kept inside the viewport's bottom edge. */
  private position(items: readonly FlyoutItem[], k: number, viewH: number): void {
    const wants: number[] = [];
    const heights: number[] = [];
    for (let i = 0; i < items.length; i++) {
      placeSide(this.slots[i].box, items[i].anchor, k);
      wants.push(items[i].anchor.y * k);
      heights.push(this.slots[i].box.offsetHeight * k);
    }
    const tops = stackTops(wants, heights, F.gap * k, viewH);
    for (let i = 0; i < items.length; i++) this.slots[i].box.style.top = `${tops[i]}px`;
  }
}

/** A box's horizontal side: beside the bar's water-side edge, toward the
 *  open water, under the bar's UI scale. */
function placeSide(box: HTMLDivElement, a: FlyoutAnchor, k: number): void {
  const left = a.side === 'left';
  box.style.transformOrigin = left ? 'top left' : 'top right';
  box.style.transform = `scale(${k})`;
  const x = (left ? a.x + F.gap : a.x - F.gap) * k;
  box.style.left = left ? `${x}px` : '';
  box.style.right = left ? '' : `${Math.max(0, window.innerWidth - x)}px`;
}
