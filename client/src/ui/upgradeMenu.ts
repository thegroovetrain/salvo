// The TAB-toggled refit modal (Story 2.1 — re-ruled from the interregnum CTRL
// window, Eric 2026-07-24) — a plain DOM panel over the Pixi canvas, styled per
// DESIGN.md (phosphor surface, Geist Mono, amber-on-hover rows). It NEVER
// pauses or blocks the simulation: a small fixed panel with pointer-events only
// on itself, so the ocean keeps running behind it — but while it is OPEN the
// game is under FULL COMBAT LOCKOUT (mouse fire suppressed by MouseInput's
// lockout predicate + canvas-target filter; Q/E/R/F suspended at the keyboard
// chokepoint; helm stays live). It closes ONLY via a pick (digit 1–4 or card
// click), TAB, or ESC — plus the existing auto-close when there is nothing to
// spend (offerView → null: zero points, death into spectate). REPAIR/heal is
// deleted end-to-end ("1-4 cards, no repair").
//
// Click hygiene: a card click spends AND closes and must never fire the gun
// (MouseInput only counts canvas-target clicks; the card is DOM) — and never
// retains focus (mousedown preventDefault + post-click blur), so a later
// Space/Enter can't re-trigger the button and a focused button can't trip the
// chokepoint's text-entry guard.
//
// z-index sits at 1000 — below the pre-join menu (1100) and above the toast
// stacks (900) so a spend confirmation toast never hides behind the panel.

import { UPGRADE_IDS, categoryOf, type OwnShip, type UpgradeId } from '@salvo/shared';
import { upgradeLabel } from './upgradeToast.js';

const PANEL_ID = 'upgrade-menu';
// Story 2.3 (amendment 17): the refit card's resting state is bright white
// content, not grey — hover/focus still flips it to amber.
const REST = 'var(--hc-text-primary)';
const AMBER = 'var(--hc-amber)';

/** The spendable state the panel renders — derived purely from `you`. */
export interface OfferView {
  pts: number;
  options: UpgradeId[];
  /**
   * True while a spend is in flight (main.ts's spend latch — see trySpend()):
   * a second spend within one server-tick+RTT would otherwise reference the
   * OLD front offer and land on whatever the FIFO shifted in behind it. Rows
   * render dimmed/inert until the bank visibly shrinks or the latch's
   * fallback timeout clears it; digit picks are gated on the same flag.
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
 * goes inert (digit picks included, since currentOfferView() also returns
 * null) rather than silently misfiring.
 */
export function offerView(you: OwnShip | null, spectating: boolean, locked: boolean): OfferView | null {
  if (!you || spectating || you.pts === 0) return null;
  const options: UpgradeId[] = [];
  for (const idx of you.offer) {
    const id = UPGRADE_IDS[idx];
    if (id === undefined) return null;
    options.push(id);
  }
  return { pts: you.pts, options, locked };
}

/** How long the spend latch holds before falling back open, in case the server
 *  silently rejected the spend — well past any real server-tick+RTT round trip,
 *  so it never masks a stuck UI. */
export const SPEND_LATCH_TIMEOUT_MS = 1500;

/** The send-time snapshot behind the FINDING A spend latch (main.ts's
 *  `spendInFlight`): the banked count and the FRONT offer, kept SEPARATE so a
 *  bank arriving mid-flight (which moves `pts` but not the front offer) can be
 *  told apart from the queue actually shifting. `at` is the performance.now()
 *  the spend was sent at — the timeout fallback's epoch. */
export interface SpendLatch {
  pts: number;
  offerSig: string;
  at: number;
}

/** The FRONT offer's indices, joined — the "the server queue moved" signal.
 *  Deliberately excludes `pts`: Story 2.6's passive banking ticks the count up
 *  on its own schedule, and that is not a spend landing. */
export function frontOfferSignature(you: { offer: number[] } | null | undefined): string {
  return you ? you.offer.join(',') : '';
}

/**
 * Pure: may the FINDING A spend latch be released this frame? Released when
 *
 *   (a) there is no own ship — death/spectate; the modal is hidden anyway and
 *       holding the latch across a life would outlive its purpose;
 *   (b) the bank visibly SHRANK (`pts` below the snapshot) — the spend landed;
 *   (c) the front offer CHANGED — the queue shifted, which covers a spend that
 *       landed in the same frame as a bank that cancelled the numeric drop;
 *   (d) the fallback timeout elapsed — the server silently rejected the spend
 *       (nothing shifted), so the player is never locked out forever.
 *
 * A pts INCREASE with an unchanged front offer HOLDS: passive XP banking
 * (Story 2.6) makes that a routine mid-flight event, and releasing on it would
 * re-open the double-spend-against-a-shifted-FIFO hazard the latch exists to
 * prevent. Known degraded edge, accepted: if a simultaneous bank cancels the
 * pts drop AND the newly-rolled offer happens to carry identical indices, the
 * latch holds until the timeout (d) — a ≤1.5s lockout, which is the fail-safe
 * side of the trade against mis-spending on an offer the player never saw.
 */
export function spendLatchReleased(
  latch: SpendLatch,
  you: { pts: number; offer: number[] } | null | undefined,
  nowMs: number,
): boolean {
  if (!you) return true;
  if (nowMs - latch.at > SPEND_LATCH_TIMEOUT_MS) return true;
  if (you.pts < latch.pts) return true;
  return frontOfferSignature(you) !== latch.offerSig;
}

/** Strip the toast's "⬆ " marker, reusing upgradeToast's label map (e.g. "+GUN AMMO"). */
function optionLabel(id: UpgradeId): string {
  return upgradeLabel(id).replace(/^⬆\s*/, '');
}

const PANEL_CSS = [
  'position:fixed',
  'top:30%',
  'left:50%',
  'display:none', // toggled to 'flex' when shown
  'flex-direction:column',
  'gap:8px',
  'width:420px',
  'max-width:calc(100vw - 16px)', // never clip against the body's overflow:hidden on narrow viewports
  'padding:16px',
  'background:var(--hc-panel)',
  'border:1px solid var(--hc-phosphor)',
  'z-index:1000',
  // HUD-tier DOM chrome scales with the accessibility UI scale (Story 2.3); the
  // centering translate composes with it.
  'transform-origin:top center',
  'transform:translateX(-50%) scale(var(--hc-ui-scale, 1))',
].join(';');

const TITLE_CSS = [
  'font:600 20px var(--hc-font-mono)',
  'letter-spacing:2px',
  'text-transform:uppercase',
  'color:var(--hc-phosphor)',
  'text-align:center',
  'margin-bottom:4px',
].join(';');

const ROWS_CSS = ['display:flex', 'flex-direction:column', 'gap:6px'].join(';');

/** Base row (dim); hover/focus flips border+text to amber (makeClassPicker style). */
const ROW_CSS = [
  'width:100%',
  'padding:10px 12px',
  'background:var(--hc-panel)',
  'border:1px solid var(--hc-hairline)',
  'color:' + REST,
  'font:600 20px var(--hc-font-mono)',
  'letter-spacing:1px',
  'text-transform:uppercase',
  'text-align:left',
  'cursor:pointer',
  'display:flex',
  'align-items:center',
  'gap:10px',
].join(';');

/** Greyed, inert row (spend-latch lock): no hover, no click. */
const ROW_INERT_CSS = ROW_CSS + ';opacity:0.4;cursor:default';

/** The mono key-chip glyph (the ONE key-chip family — HUD chips and the PTS
 *  prompt render the same mono treatment on the Pixi side): a small bordered
 *  digit riding currentColor so the row's dim/amber state cascades into it. */
const KEY_CHIP_CSS = [
  'display:inline-block',
  'min-width:20px',
  'padding:1px 5px',
  'border:1px solid currentColor',
  'text-align:center',
  'font:inherit',
  'flex:none',
].join(';');

function paintRow(btn: HTMLButtonElement, on: boolean): void {
  btn.style.borderColor = on ? AMBER : 'var(--hc-hairline)';
  btn.style.color = on ? AMBER : REST;
}

/**
 * The refit modal. TAB toggle()s it (main.ts gates open on a banked point);
 * digits 1–4 pick via main.ts's onRefitPick while it is open; a card click
 * picks too. A pick spends AND closes (main.ts hides after routing the spend).
 * Rows re-render only when the view signature changes (pts + option ids +
 * locked) so live per-frame update()s stay cheap.
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

  /** One card row: mono digit key-chip + "CATEGORY — LABEL". */
  private makeRow(chip: string, text: string, choice: number, enabled: boolean): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    const key = document.createElement('span');
    key.style.cssText = KEY_CHIP_CSS;
    key.textContent = chip;
    btn.append(key, document.createTextNode(text));
    btn.style.cssText = enabled ? ROW_CSS : ROW_INERT_CSS;
    // Focus hygiene (full-lockout modal): never acquire focus on click —
    // a focus-retaining card would (a) let Space/Enter re-trigger the spend
    // and (b) trip the keyboard chokepoint's text-entry guard mid-battle.
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    if (!enabled) {
      btn.disabled = true; // real disabled state, not just opacity — keyboard/AT see it too
      return btn;
    }
    btn.addEventListener('mouseenter', () => paintRow(btn, true));
    btn.addEventListener('mouseleave', () => paintRow(btn, false));
    btn.addEventListener('focus', () => paintRow(btn, true));
    btn.addEventListener('blur', () => paintRow(btn, false));
    btn.addEventListener('click', () => {
      btn.blur(); // belt-and-braces with the mousedown preventDefault above
      this.onSpend(choice);
    });
    return btn;
  }

  /** Rebuild title + rows only when the meaningful view state changed. */
  private render(view: OfferView): void {
    this.ensurePanel();
    const sig = `${view.pts}|${view.options.join(',')}|${view.locked ? 1 : 0}`;
    if (sig === this.sig) return;
    this.sig = sig;
    // Amendment 33's LEVEL vocabulary: what you spend is a LEVEL, and nothing
    // in this economy is described as "banked" any more (the chip/cue line say
    // "LEVEL UP — TAB TO REFIT"). The ×N is the count waiting to be spent.
    this.titleEl!.textContent = `SPEND LEVEL — ×${view.pts}`;
    const rows = this.rowsEl!;
    rows.replaceChildren();
    // Locked (a spend is in flight — see OfferView.locked) dims/inerts every
    // row so a second click/digit can't fire against the offer this frame is
    // displaying. Digit glyphs 1..N map row-for-row (digit 4 goes live when
    // offers carry 4 cards — Story 2.7; with 3 cards it is simply never built).
    view.options.forEach((id, i) => {
      rows.appendChild(
        this.makeRow(`${i + 1}`, `${categoryOf(id).toUpperCase()} — ${optionLabel(id)}`, i, !view.locked),
      );
    });
  }

  /** TAB toggle: open with this view, or close if already open. */
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
   * closed window (only the TAB toggle does).
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
