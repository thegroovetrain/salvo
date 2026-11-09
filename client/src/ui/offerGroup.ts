// THE OFFER GROUP (Story 10.10, plan O3; R3 / R9 / R10 / R15) — the always-live
// compact card group on the right edge, between the kill feed and the weapons
// console. It replaced the Tab refit band and the level-up toast:
//
//   • NO LOCKOUT (R3): it opens nothing and suspends nothing. While a level is
//     banked it simply IS on screen; a card is picked by a CLICK or by TAB + its
//     digit (input/keyboard.ts), both through main.ts's one pick path;
//   • its ARRIVAL is the level-up cue (R10 — the toast is gone);
//   • HOVER previews the card on the consoles (R9 / R18): the card's line id is
//     handed to `onHover`, which main.ts keeps as `g.hoverLine` and re-folds;
//   • at the COUNTDOWN it carries REDRAW beside its header (R10; the layout
//     spine puts it there because a footer could not clear the weapons console
//     at 1366×768).
//
// The face (O3): a 28 px glyph box, the NAME, the tier mark in the colour of
// the tier the card GRANTS (amendment 12(o): `II → III`; a one-off add-on is a
// GOLD square with no numeral), and the two-token key chip `TAB` `n`. A refused
// card is dimmed and sends nothing; a pick in flight dims the whole group.
//
// DOM chrome over the canvas (z-index 1000, as the band was). Pointer events
// live only on the cards and the button, so the water stays clickable around
// it, and a card click never reaches the gun (MouseInput counts canvas-target
// clicks only). Every rect comes from the pure spine (`OfferLayout`, logical
// px) × the UI scale, exactly as the band was positioned.
//
// The pure core — the view, the greyed refusal, the latch — is ui/offerCore.ts.

import { MULLIGAN_CHOICE } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { cssRgba } from '../util/color.js';
import { motionIntensity, settings } from '../settings/store.js';
import { FLASH_ELEMENTS, type FlashBudget } from '../render/flashBudget.js';
import { equipmentGlyphSvg } from '../render/equipmentIcons.js';
import type { OfferLayout, Rect } from '../render/console/layout.js';
import { tierTint } from './tierRamp.js';
import type { OfferCard, OfferView } from './offerCore.js';

const K = CLIENT_CONFIG.console;
const O = K.offer;
const TY = K.type;
const PANEL_ID = 'offer-group';

const PHOSPHOR = 'var(--hc-phosphor)';
const AMBER = 'var(--hc-amber)';
const DENIED = 'var(--hc-denied)';
const TEXT = 'var(--hc-text-primary)';
const CHIP_EDGE = cssRgba(CLIENT_CONFIG.colors.textMuted, 0.6);
const GLYPH_EDGE = cssRgba(CLIENT_CONFIG.colors.silver, 0.22);
const REDRAW_GLOW = `0 0 12px ${cssRgba(CLIENT_CONFIG.colors.amber, 0.3)}`;
/** The resting card edge: its tier colour at the sitting's 55 %. */
const EDGE_MIX = 55;
/** The hovered card's glow (the sitting's `.ocard.hot`), in the card's tier colour. */
const HOT_GLOW = 12;

/** The ratified word on the countdown button (amendment 60). */
export const REDRAW_LABEL = 'REDRAW';
/** The key chip's modifier token (O13). */
export const TAB_TOKEN = 'TAB';

/** Pure: the header — the banked count (`2 LEVELS`, `1 LEVEL`). */
export function offerHeaderText(pts: number): string {
  return pts === 1 ? '1 LEVEL' : `${pts} LEVELS`;
}

/** Pure: the tier colour a card's face speaks (the tier it GRANTS). */
export function cardTone(card: OfferCard): string {
  return tierTint(card.tone);
}

/** Pure: the card's tier mark — its `cur → next` numerals, or null for a
 *  one-off (no ladder), which draws the gold square instead. */
export function cardTierMark(card: OfferCard): string | null {
  return card.tierStep === null ? null : card.tier;
}

/** What the group hands back to main.ts. */
export interface OfferGroupHooks {
  /** A live card was clicked — main.ts's pick path (the same one Tab+digit takes). */
  onPick: (choice: number) => void;
  /** The countdown REDRAW was pressed — main.ts's `tryMulligan`. */
  onRedraw: () => void;
  /** A card's line id under the pointer, or null when it left (R18). */
  onHover: (line: string | null) => void;
}

interface CardEls {
  root: HTMLButtonElement;
  tone: string;
  greyed: boolean;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, css: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.style.cssText = css;
  return e;
}

function place(e: HTMLElement, r: Rect, origin: Rect): void {
  e.style.left = `${r.x - origin.x}px`;
  e.style.top = `${r.y - origin.y}px`;
  e.style.width = `${r.w}px`;
  e.style.height = `${r.h}px`;
}

const ROOT_CSS = [
  'position:fixed',
  'display:none',
  'z-index:1000',
  'pointer-events:none',
  'transform-origin:top left',
  'transform:scale(var(--hc-ui-scale, 1))',
  'font-family:var(--hc-font-mono)',
].join(';');

// A BLOCK, not a flex row: a flex row trims the space between the count and
// its word (`2 LEVELS` read `2LEVELS`).
const HEADER_CSS = [
  'position:absolute',
  'display:block',
  `font:600 ${TY.offerHeader}px var(--hc-font-mono)`,
  'letter-spacing:.18em',
  'text-transform:uppercase',
  'white-space:nowrap',
].join(';');

const CARD_CSS = [
  'position:absolute',
  'box-sizing:border-box',
  'margin:0',
  `padding:${O.pad}px`,
  'background-color:transparent',
  'border-width:1px',
  'border-style:solid',
  'border-radius:0',
  'cursor:pointer',
  'pointer-events:auto',
  'overflow:hidden',
  'text-align:left',
  'font-family:var(--hc-font-mono)',
].join(';');

const GLYPH_BOX_CSS = [
  'position:absolute',
  `left:${O.pad}px`,
  `top:${O.pad}px`,
  `width:${O.glyphBox}px`,
  `height:${O.glyphBox}px`,
  'box-sizing:border-box',
  'border-width:1px',
  'border-style:solid',
  'display:flex',
  'align-items:center',
  'justify-content:center',
].join(';');

const NAME_CSS = [
  'position:absolute',
  `left:${O.pad + O.glyphBox + O.pad}px`,
  `right:${O.pad}px`,
  `top:${O.pad}px`,
  `height:${O.glyphBox}px`,
  'display:flex',
  'align-items:center',
  `font:600 ${TY.offerName}px/1.1 var(--hc-font-mono)`,
  'letter-spacing:.03em',
  'text-transform:uppercase',
  'overflow:hidden',
].join(';');

const FOOT_CSS = [
  'position:absolute',
  `left:${O.pad}px`,
  `right:${O.pad}px`,
  `bottom:${O.pad}px`,
  'height:16px',
  'display:flex',
  'align-items:center',
  'justify-content:space-between',
].join(';');

const TIER_CSS = [`font:600 ${TY.tier}px var(--hc-font-mono)`, 'letter-spacing:.04em', 'white-space:nowrap'].join(';');
const ONE_OFF_CSS = ['display:inline-block', 'width:8px', 'height:8px'].join(';');
const CHIP_CSS = [
  'display:inline-flex',
  'height:16px',
  'box-sizing:border-box',
  'border-width:1px',
  'border-style:solid',
  `font:${TY.keyChip}px/14px var(--hc-font-mono)`,
  'letter-spacing:.04em',
].join(';');
const CHIP_TOKEN_CSS = ['padding:0 4px'].join(';');

const REDRAW_CSS = [
  'position:absolute',
  'box-sizing:border-box',
  'margin:0',
  'display:flex',
  'align-items:center',
  'justify-content:center',
  'gap:10px',
  'background-color:transparent',
  'border-width:1px',
  'border-style:solid',
  'border-radius:0',
  `font:600 ${TY.redraw}px var(--hc-font-mono)`,
  'letter-spacing:.16em',
  'text-transform:uppercase',
  'white-space:nowrap',
  'cursor:pointer',
  'pointer-events:auto',
].join(';');
const PIP_CSS = ['display:block', 'width:8px', 'height:8px', 'box-sizing:border-box', 'border-width:1px', 'border-style:solid'].join(';');

/** The signature that decides a rebuild: everything the face prints. */
function viewSig(v: OfferView): string {
  const cards = v.options.map((c) => `${c.id}:${c.name}:${c.tier ?? '-'}:${c.tone}:${c.greyed ? 1 : 0}`).join(',');
  return `${v.pts}|${cards}|${v.locked ? 1 : 0}|${v.redraw}`;
}

/**
 * The offer group. `update(view, layout, uiScale)` once per frame: a null view
 * (nothing banked, no offer, spectating, sinking) hides it; a view shows it
 * where the spine says and rebuilds the cards only when what they print moved.
 */
export class OfferGroup {
  private root: HTMLDivElement | null = null;
  private header: HTMLDivElement | null = null;
  private redrawBtn: HTMLButtonElement | null = null;
  private redrawPip: HTMLElement | null = null;
  private cards: CardEls[] = [];
  private sig = '';
  private shown = false;
  private hovered: number | null = null;
  private deniedChoice: number | null = null;
  private deniedLastAt = -Infinity;
  private lastPlace = '';

  constructor(
    private readonly hooks: OfferGroupHooks,
    private readonly budget?: FlashBudget,
  ) {}

  get visible(): boolean {
    return this.shown;
  }

  update(view: OfferView | null, layout: OfferLayout, uiScale: number): void {
    if (view === null) {
      this.hide();
      return;
    }
    const root = this.ensureRoot();
    this.position(root, layout, uiScale);
    const sig = viewSig(view);
    if (sig !== this.sig) this.render(view, layout, sig);
    if (!this.shown) root.style.display = 'block';
    this.shown = true;
  }

  private ensureRoot(): HTMLDivElement {
    if (this.root) return this.root;
    const root = el('div', ROOT_CSS);
    root.id = PANEL_ID;
    const header = el('div', HEADER_CSS);
    header.style.color = TEXT;
    root.appendChild(header);
    document.body.appendChild(root);
    this.root = root;
    this.header = header;
    return root;
  }

  /** The group's anchor in CSS px (the logical frame × the UI scale), written
   *  only when it moved. */
  private position(root: HTMLDivElement, layout: OfferLayout, uiScale: number): void {
    const s = Number.isFinite(uiScale) && uiScale > 0 ? uiScale : 1;
    const key = `${layout.frame.x}|${layout.frame.y}|${s}|${layout.redraw === null ? 0 : 1}`;
    if (key === this.lastPlace) return;
    this.lastPlace = key;
    root.style.left = `${layout.frame.x * s}px`;
    root.style.top = `${layout.frame.y * s}px`;
    root.style.width = `${layout.frame.w}px`;
    root.style.height = `${layout.frame.h}px`;
    this.sig = ''; // the children are placed off the layout: rebuild them
  }

  private render(view: OfferView, layout: OfferLayout, sig: string): void {
    this.sig = sig;
    this.clearHover(); // the buttons under the pointer are about to go
    this.deniedChoice = null;
    const root = this.root!;
    for (const c of this.cards) c.root.remove();
    this.redrawBtn?.remove();
    this.redrawBtn = null;
    this.renderHeader(view, layout);
    this.cards = view.options.map((card, i) => this.makeCard(card, i, view.locked, layout));
    for (const c of this.cards) root.appendChild(c.root);
    if (layout.redraw !== null && view.redraw !== 'hidden') this.makeRedraw(view, layout);
  }

  private renderHeader(view: OfferView, layout: OfferLayout): void {
    const h = this.header!;
    place(h, { ...layout.header, w: layout.redraw === null ? layout.header.w : layout.redraw.x - layout.header.x }, layout.frame);
    h.style.lineHeight = `${layout.header.h}px`;
    const count = el('b', `color:${PHOSPHOR};font-weight:600`);
    count.textContent = String(view.pts);
    const rest = offerHeaderText(view.pts).slice(String(view.pts).length);
    h.replaceChildren(count, document.createTextNode(rest));
  }

  private makeCard(card: OfferCard, choice: number, locked: boolean, layout: OfferLayout): CardEls {
    const btn = el('button', CARD_CSS);
    btn.type = 'button';
    place(btn, layout.cards[choice], layout.frame);
    const tone = cardTone(card);
    btn.append(glyphBox(card, tone), nameEl(card), footEl(card, choice, tone));
    const els: CardEls = { root: btn, tone, greyed: card.greyed };
    paintCard(els, false);
    if (locked) btn.style.opacity = String(O.lockedAlpha);
    else if (card.greyed) btn.style.opacity = String(O.greyedAlpha);
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    if (locked) {
      btn.disabled = true;
      return els;
    }
    this.wireCard(els, card.id, choice);
    return els;
  }

  private wireCard(els: CardEls, line: string, choice: number): void {
    const btn = els.root;
    btn.addEventListener('mouseenter', () => {
      paintCard(els, true);
      this.hovered = choice;
      this.hooks.onHover(line);
    });
    btn.addEventListener('mouseleave', () => {
      paintCard(els, false);
      this.clearHover();
    });
    btn.addEventListener('click', () => {
      btn.blur();
      // A refused card sends NOTHING (ruling 10): its refusal is on its face.
      if (els.greyed) return;
      this.hooks.onPick(choice);
    });
  }

  private makeRedraw(view: OfferView, layout: OfferLayout): void {
    const btn = el('button', REDRAW_CSS);
    btn.type = 'button';
    place(btn, layout.redraw!, layout.frame);
    btn.style.borderColor = AMBER;
    btn.style.color = AMBER;
    btn.style.boxShadow = REDRAW_GLOW;
    btn.appendChild(document.createTextNode(REDRAW_LABEL));
    const pip = el('i', PIP_CSS);
    pip.style.borderColor = AMBER;
    const spent = view.redraw === 'spent';
    pip.style.backgroundColor = spent ? AMBER : 'transparent';
    btn.appendChild(pip);
    const inert = spent || view.locked;
    if (inert) {
      btn.disabled = true;
      btn.style.cursor = 'default';
      btn.style.opacity = String(view.locked ? O.lockedAlpha : O.greyedAlpha);
    }
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', () => {
      btn.blur();
      if (!inert) this.hooks.onRedraw();
    });
    this.root!.appendChild(btn);
    this.redrawBtn = btn;
    this.redrawPip = pip;
  }

  private clearHover(): void {
    if (this.hovered === null) return;
    this.hovered = null;
    this.hooks.onHover(null);
  }

  /**
   * A pick was REJECTED (the latch timed out): the 80 ms denied edge on the
   * card (or REDRAW) the player picked — rate-limited per source, motion-gated,
   * and claimed on the flash budget as `offerDenied`; a `'degrade'` verdict
   * keeps the red edge and drops only the glow. A hidden group never pulses.
   */
  pulseDenied(choice: number, nowMs = performance.now()): void {
    if (!this.pulseAllowed(nowMs)) return;
    const target = this.deniedTarget(choice);
    if (target === null) return;
    const verdict = this.budget?.claim(FLASH_ELEMENTS.offerDenied, nowMs) ?? 'animate';
    this.deniedLastAt = nowMs;
    this.deniedChoice = choice;
    target.style.borderColor = DENIED;
    target.style.boxShadow = verdict === 'degrade' ? 'none' : `0 0 8px ${DENIED}`;
    setTimeout(() => this.clearDenied(choice), O.deniedPulseMs);
  }

  /** The gates in front of a pulse: shown, motion on, past the same-source floor. */
  private pulseAllowed(nowMs: number): boolean {
    if (!this.shown) return false;
    if (motionIntensity(settings.current.motion) <= 0) return false;
    return nowMs - this.deniedLastAt >= O.deniedFloorMs;
  }

  /** The control a pick's denial paints: the card, or REDRAW for the redraw sentinel. */
  private deniedTarget(choice: number): HTMLElement | null {
    if (choice === MULLIGAN_CHOICE) return this.redrawBtn;
    return this.cards[choice]?.root ?? null;
  }

  private clearDenied(choice: number): void {
    if (this.deniedChoice !== choice) return;
    this.deniedChoice = null;
    if (choice === MULLIGAN_CHOICE) {
      if (this.redrawBtn) {
        this.redrawBtn.style.borderColor = AMBER;
        this.redrawBtn.style.boxShadow = REDRAW_GLOW;
      }
      return;
    }
    const card = this.cards[choice];
    if (card) paintCard(card, this.hovered === choice);
  }

  /** True while a denied pulse is lit (test seam). */
  deniedActive(): boolean {
    return this.deniedChoice !== null;
  }

  /** Hide, and drop the hover with it (no mouseleave ever reaches a hidden
   *  card, so the consoles' preview would otherwise strand). */
  hide(): void {
    if (this.root) this.root.style.display = 'none';
    this.shown = false;
    this.clearHover();
    if (this.deniedChoice !== null) this.clearDenied(this.deniedChoice);
    this.deniedLastAt = -Infinity;
  }

  /** The REDRAW pip (test seam). */
  get redrawPipFilled(): boolean {
    return this.redrawPip !== null && this.redrawPip.style.backgroundColor !== 'transparent';
  }
}

/** The resting / hovered card edge: its tier colour at 55 %, or full with the
 *  tier-coloured glow (amendment 12 R26 — the card glows in its own colour). */
function paintCard(c: CardEls, hot: boolean): void {
  c.root.style.borderColor = hot ? c.tone : `color-mix(in srgb, ${c.tone} ${EDGE_MIX}%, transparent)`;
  c.root.style.boxShadow = hot
    ? `0 0 ${HOT_GLOW}px color-mix(in srgb, ${c.tone} 55%, transparent), inset 0 0 ${HOT_GLOW}px color-mix(in srgb, ${c.tone} 22%, transparent)`
    : 'none';
}

function glyphBox(card: OfferCard, tone: string): HTMLDivElement {
  const box = el('div', GLYPH_BOX_CSS);
  box.style.borderColor = GLYPH_EDGE;
  box.style.color = tone;
  const svg = equipmentGlyphSvg(card.id, O.glyph);
  if (svg !== null) box.appendChild(svg);
  return box;
}

function nameEl(card: OfferCard): HTMLDivElement {
  const name = el('div', NAME_CSS);
  name.style.color = TEXT;
  name.textContent = card.name;
  return name;
}

function footEl(card: OfferCard, choice: number, tone: string): HTMLDivElement {
  const foot = el('div', FOOT_CSS);
  const mark = cardTierMark(card);
  if (mark === null) {
    const one = el('span', ONE_OFF_CSS);
    one.style.backgroundColor = tone;
    foot.appendChild(one);
  } else {
    const tier = el('span', TIER_CSS);
    tier.style.color = tone;
    tier.textContent = mark;
    foot.appendChild(tier);
  }
  foot.appendChild(keyChip(choice));
  return foot;
}

/** The two-token key chip `TAB` `n` (the sitting's `.kc2`). */
function keyChip(choice: number): HTMLSpanElement {
  const chip = el('span', CHIP_CSS);
  chip.style.borderColor = CHIP_EDGE;
  const tab = el('span', CHIP_TOKEN_CSS);
  tab.style.color = TEXT;
  tab.textContent = TAB_TOKEN;
  const n = el('span', `${CHIP_TOKEN_CSS};font-weight:600`);
  n.style.color = TEXT;
  n.style.borderLeftWidth = '1px';
  n.style.borderLeftStyle = 'solid';
  n.style.borderLeftColor = CHIP_EDGE;
  n.textContent = String(choice + 1);
  chip.append(tab, n);
  return chip;
}
