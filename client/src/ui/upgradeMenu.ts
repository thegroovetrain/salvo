// The CTRL spend window — a plain DOM panel over the Pixi canvas, styled per
// DESIGN.md (phosphor surface, Geist Mono, amber-on-hover rows, mirroring
// ui/menu.ts's makeClassPicker). It is informational + clickable but NEVER
// pauses or blocks the game: it is a small fixed panel with pointer-events only
// on itself, so the ocean keeps running behind it and clicks off it pass through
// to the canvas. offerView() is pure (unit-tested); the class is a thin adapter.
//
// z-index sits at 1000 — below the pre-join menu (1100) and above the toast
// stacks (900) so a spend confirmation toast never hides behind the panel.

import {
  CONFIG,
  HEAL_CHOICE,
  UPGRADE_IDS,
  categoryOf,
  type OwnShip,
  type UpgradeId,
} from '@salvo/shared';
import { upgradeLabel } from './upgradeToast.js';

const PANEL_ID = 'upgrade-menu';
const DIM = 'var(--hc-text-muted)';
const AMBER = 'var(--hc-amber)';

/** The spendable state the panel renders — derived purely from `you`. */
export interface OfferView {
  pts: number;
  options: UpgradeId[];
  canHeal: boolean;
  healHp: number;
  /**
   * True while a spend is in flight (main.ts's spend latch — see trySpend()):
   * a second spend within one server-tick+RTT would otherwise reference the
   * OLD front offer and land on whatever the FIFO shifted in behind it. Rows
   * render dimmed/inert (same treatment as !canHeal) until the bank visibly
   * shrinks or the latch's fallback timeout clears it.
   */
  locked: boolean;
}

/**
 * Pure: the current spend view, or null when there is nothing to show — no own
 * ship, spectating, an empty bank (pts 0), OR any offer index out of range of
 * UPGRADE_IDS. That last case used to be handled by skipping just the bad
 * entry, which compacts `options` and breaks row->slot alignment (row 1 could
 * end up sending server slot 2's choice) — unreachable today, but real the
 * day a 15th upgrade ships against a stale tab that hasn't reloaded. Dropping
 * the WHOLE view instead keeps the invariant "row k == server slot k" and
 * goes inert (shortcuts included, since currentOfferView() also returns null)
 * rather than silently misfiring.
 * `canHeal` is alive-and-below-max (the server re-validates the heal anyway).
 */
export function offerView(you: OwnShip | null, maxHp: number, spectating: boolean, locked: boolean): OfferView | null {
  if (!you || spectating || you.pts === 0) return null;
  const options: UpgradeId[] = [];
  for (const idx of you.offer) {
    const id = UPGRADE_IDS[idx];
    if (id === undefined) return null;
    options.push(id);
  }
  return { pts: you.pts, options, canHeal: you.alive && you.hp < maxHp, healHp: CONFIG.upgradePoints.healHp, locked };
}

/** Strip the toast's "⬆ " marker, reusing upgradeToast's label map (e.g. "+GUN AMMO"). */
function optionLabel(id: UpgradeId): string {
  return upgradeLabel(id).replace(/^⬆\s*/, '');
}

const PANEL_CSS = [
  'position:fixed',
  'top:30%',
  'left:50%',
  'transform:translateX(-50%)',
  'display:none', // toggled to 'flex' when shown
  'flex-direction:column',
  'gap:8px',
  'width:340px',
  'max-width:calc(100vw - 16px)', // never clip against the body's overflow:hidden on narrow viewports
  'padding:16px',
  'background:var(--hc-panel)',
  'border:1px solid var(--hc-phosphor)',
  'z-index:1000',
].join(';');

const TITLE_CSS = [
  'font:600 13px var(--hc-font-mono)',
  'letter-spacing:2px',
  'text-transform:uppercase',
  'color:' + DIM,
  'text-align:center',
  'margin-bottom:4px',
].join(';');

const ROWS_CSS = ['display:flex', 'flex-direction:column', 'gap:6px'].join(';');

/** Base row (dim); hover/focus flips border+text to amber (makeClassPicker style). */
const ROW_CSS = [
  'width:100%',
  'padding:10px 12px',
  'background:var(--hc-panel)',
  'border:1px solid ' + DIM,
  'color:' + DIM,
  'font:600 13px var(--hc-font-mono)',
  'letter-spacing:1px',
  'text-transform:uppercase',
  'text-align:left',
  'cursor:pointer',
].join(';');

/** Greyed, inert row (heal when !canHeal): no hover, no click. */
const ROW_INERT_CSS = ROW_CSS + ';opacity:0.4;cursor:default';

function paintRow(btn: HTMLButtonElement, on: boolean): void {
  btn.style.borderColor = on ? AMBER : DIM;
  btn.style.color = on ? AMBER : DIM;
}

/**
 * The spend window. Shortcuts (CTRL+1/2/3/E) work whether or not this is open;
 * bare CTRL toggle()s it. Rows re-render only when the view signature changes
 * (pts + option ids + canHeal) so live per-frame update()s stay cheap.
 */
export class UpgradeMenu {
  private panel: HTMLDivElement | null = null;
  private titleEl: HTMLDivElement | null = null;
  private rowsEl: HTMLDivElement | null = null;
  private shown = false;
  private sig = '';

  constructor(private readonly onSpend: (choice: number) => void) {}

  get visible(): boolean {
    return this.shown;
  }

  private ensurePanel(): HTMLDivElement {
    if (this.panel) return this.panel;
    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.style.cssText = PANEL_CSS;
    const title = document.createElement('div');
    title.style.cssText = TITLE_CSS;
    const rows = document.createElement('div');
    rows.style.cssText = ROWS_CSS;
    panel.append(title, rows);
    document.body.appendChild(panel);
    this.panel = panel;
    this.titleEl = title;
    this.rowsEl = rows;
    return panel;
  }

  private makeRow(text: string, choice: number, enabled: boolean): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = text;
    btn.style.cssText = enabled ? ROW_CSS : ROW_INERT_CSS;
    if (!enabled) {
      btn.disabled = true; // real disabled state, not just opacity — keyboard/AT see it too
      return btn;
    }
    btn.addEventListener('mouseenter', () => paintRow(btn, true));
    btn.addEventListener('mouseleave', () => paintRow(btn, false));
    btn.addEventListener('focus', () => paintRow(btn, true));
    btn.addEventListener('blur', () => paintRow(btn, false));
    btn.addEventListener('click', () => this.onSpend(choice));
    return btn;
  }

  /** Rebuild title + rows only when the meaningful view state changed. */
  private render(view: OfferView): void {
    this.ensurePanel();
    const sig = `${view.pts}|${view.options.join(',')}|${view.canHeal ? 1 : 0}|${view.locked ? 1 : 0}`;
    if (sig === this.sig) return;
    this.sig = sig;
    this.titleEl!.textContent = `SPEND UPGRADE POINT — ${view.pts} BANKED`;
    const rows = this.rowsEl!;
    rows.replaceChildren();
    // Locked (a spend is in flight — see OfferView.locked) dims/inerts every
    // row, same treatment as the existing !canHeal heal row, so a second
    // click/shortcut can't fire against the offer this frame is displaying.
    view.options.forEach((id, i) => {
      rows.appendChild(
        this.makeRow(`CTRL+${i + 1} · ${categoryOf(id).toUpperCase()} — ${optionLabel(id)}`, i, !view.locked),
      );
    });
    rows.appendChild(
      this.makeRow(`CTRL+E · REPAIR HULL +${view.healHp} HP`, HEAL_CHOICE, view.canHeal && !view.locked),
    );
  }

  /** Bare-CTRL toggle: open with this view, or close if already open. */
  toggle(view: OfferView): void {
    if (this.shown) {
      this.hide();
      return;
    }
    this.render(view);
    this.ensurePanel().style.display = 'flex';
    this.shown = true;
  }

  /**
   * Per-frame refresh: null force-hides (spend emptied the bank, or spectate);
   * a fresh view live-swaps the rows to the next queued offer, but never OPENS a
   * closed window (only bare CTRL does that).
   */
  update(view: OfferView | null): void {
    if (!view) {
      this.hide();
      return;
    }
    if (this.shown) this.render(view);
  }

  hide(): void {
    if (this.panel) this.panel.style.display = 'none';
    this.shown = false;
  }
}
