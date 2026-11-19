// THE HUD BAR'S FLYOUT (Story 12.3 Part B, AC 34 / 36) — the little box that
// opens BESIDE the bar (toward the open water, level with the row) when the
// pointer is over a weapon or ability tile, or when a hovered upgrade card
// changes one: the tile's stat lines, or the card's amber `old → new ▲`
// changes. It closes when the hover ends.
//
// DOM chrome over the canvas (z-index 1000, like the offer group), DISPLAY
// ONLY: `pointer-events:none` on the whole box, so it never steals a press or
// a hover from the canvas or the cards under it. Its anchor is the spine's
// (layout.ts `BarLayout.openEdge`, the row's top) in LOGICAL px × the UI scale;
// the content is the pure model (render/console/flyout.ts), rewritten only
// when its signature or anchor moved.

import { CLIENT_CONFIG } from '../config.js';
import { cssRgba } from '../util/color.js';
import { flyoutSig, type FlyoutModel } from '../render/console/flyout.js';
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

function el(tag: string, css: string, text = ''): HTMLElement {
  const e = document.createElement(tag);
  e.style.cssText = css;
  e.textContent = text;
  return e;
}

export class HudFlyout {
  private box: HTMLDivElement | null = null;
  private sig = '';
  private placeKey = '';
  private shown = false;

  get visible(): boolean {
    return this.shown;
  }

  /** Show `model` at `anchor` under the UI scale `s`; the screen height `viewH`
   *  (real px) keeps the box on screen. */
  show(model: FlyoutModel, anchor: FlyoutAnchor, s: number, viewH: number): void {
    const box = this.ensure();
    const sig = flyoutSig(model);
    if (sig !== this.sig) this.render(box, model, sig);
    if (!this.shown) box.style.display = 'block';
    this.shown = true;
    this.position(box, anchor, s, viewH);
  }

  hide(): void {
    if (!this.shown) return;
    this.shown = false;
    if (this.box) this.box.style.display = 'none';
  }

  private ensure(): HTMLDivElement {
    if (this.box) return this.box;
    const box = document.createElement('div');
    box.id = BOX_ID;
    box.style.cssText = ROOT_CSS;
    box.setAttribute('role', 'tooltip');
    document.body.appendChild(box);
    this.box = box;
    return box;
  }

  private render(box: HTMLDivElement, m: FlyoutModel, sig: string): void {
    this.sig = sig;
    this.placeKey = ''; // the height may have changed: re-clamp
    const lines = m.lines.map((l) => {
      const row = el('div', LINE_CSS);
      const v = el('span', VALUE_CSS, l.value);
      v.style.color = l.amber ? 'var(--hc-amber)' : 'var(--hc-phosphor)';
      row.append(el('span', KEY_CSS, l.label), v);
      return row;
    });
    box.replaceChildren(el('div', TITLE_CSS, m.title), ...lines);
  }

  /** The box's corner in CSS px: beside the bar, the bar's own UI scale on
   *  the box (`transform: scale`), kept inside the viewport's bottom edge. */
  private position(box: HTMLDivElement, a: FlyoutAnchor, s: number, viewH: number): void {
    const k = Number.isFinite(s) && s > 0 ? s : 1;
    const key = `${a.x}|${a.y}|${a.side}|${k}|${viewH}`;
    if (key === this.placeKey) return;
    this.placeKey = key;
    const left = a.side === 'left';
    box.style.transformOrigin = left ? 'top left' : 'top right';
    box.style.transform = `scale(${k})`;
    const x = (left ? a.x + F.gap : a.x - F.gap) * k;
    box.style.left = left ? `${x}px` : '';
    box.style.right = left ? '' : `${Math.max(0, window.innerWidth - x)}px`;
    const h = box.offsetHeight * k;
    const top = Math.min(a.y * k, viewH - h - F.gap * k);
    box.style.top = `${Math.max(0, top)}px`;
  }
}
