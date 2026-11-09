// THE OFFER GROUP (ui/offerGroup.ts, Story 10.10 — plan O3; R3 / R9 / R10).
// The DOM adapter over the moved pure core (ui/offerCore.ts): it renders the
// view the core derives, hides with nothing banked, carries REDRAW only at the
// countdown, hands the hovered card's line to the consoles and clears it, and
// routes a click through ONE pick path — once, and never while a pick is in
// flight or on a refused card. jsdom.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DEFAULT_CLASS_ID, DEFAULT_SHIFT, MULLIGAN_CHOICE, SLOT_COUNT, initialTurrets, type OwnShip } from '@salvo/shared';
import { consoleLayout } from '../render/console/layout.js';
import { offerView, redrawState, type OfferView } from '../ui/offerCore.js';
import { OfferGroup, REDRAW_LABEL, cardTierMark, offerHeaderText, type OfferGroupHooks } from '../ui/offerGroup.js';
import { FLASH_ELEMENTS, type FlashBudget } from '../render/flashBudget.js';
import { settings } from '../settings/store.js';

const OFFER = ['intel', 'armor', 'deckGun', 'navalMines'];
const LIVE = consoleLayout(1366, 768).offer;
const COUNTDOWN = consoleLayout(1366, 768, { countdown: true }).offer;

function ownShip(over: Partial<OwnShip> = {}): OwnShip {
  return {
    id: 'me', x: 0, y: 0, heading: 0, speed: 0, hp: 80, alive: true,
    ammo: [], sweep: 0, cls: DEFAULT_CLASS_ID, shift: DEFAULT_SHIFT, turrets: initialTurrets(DEFAULT_CLASS_ID),
    sec: { heat: 0, locked: false }, pts: 1, offer: [...OFFER],
    boostUntil: 0, cards: [], lvl: 0, xp: 0, repairHp: 0, rd: false, ib: {},
    ...over,
  };
}

function hooks(): OfferGroupHooks & { picks: number[]; hovers: (string | null)[]; redraws: number } {
  const h = {
    picks: [] as number[],
    hovers: [] as (string | null)[],
    redraws: 0,
    onPick: (c: number) => h.picks.push(c),
    onHover: (l: string | null) => h.hovers.push(l),
    onRedraw: () => (h.redraws += 1),
  };
  return h;
}

function cards(): HTMLButtonElement[] {
  return [...document.querySelectorAll('#offer-group button')].filter((b) => b.textContent !== REDRAW_LABEL) as HTMLButtonElement[];
}

function redrawBtn(): HTMLButtonElement | undefined {
  return [...document.querySelectorAll('#offer-group button')].find((b) => b.textContent === REDRAW_LABEL) as HTMLButtonElement | undefined;
}

function panel(): HTMLElement {
  return document.getElementById('offer-group')!;
}

function view(you: OwnShip, locked = false): OfferView | null {
  return offerView(you, false, locked, false);
}

describe('OfferGroup — the corner group (O3)', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    settings.set({ motion: 'full' });
  });

  it('renders the core\'s view: one card per offered line, keyed TAB + 1…n, the header counting the bank', () => {
    const g = new OfferGroup(hooks());
    g.update(view(ownShip({ pts: 2 })), LIVE, 1);
    expect(g.visible).toBe(true);
    expect(cards()).toHaveLength(OFFER.length);
    // The digit token on each chip is its pick index + 1 (the Tab+digit map).
    cards().forEach((b, i) => expect(b.textContent?.endsWith(String(i + 1))).toBe(true));
    expect(panel().querySelector('b')?.textContent).toBe('2');
    expect(panel().firstElementChild?.textContent).toBe(offerHeaderText(2)); // the header IS the pure line
  });

  it('is HIDDEN with nothing banked, and with no view at all (spectate / sinking)', () => {
    const g = new OfferGroup(hooks());
    g.update(view(ownShip()), LIVE, 1);
    expect(g.visible).toBe(true);
    g.update(view(ownShip({ pts: 0, offer: [] })), LIVE, 1);
    expect(g.visible).toBe(false);
    expect(panel().style.display).toBe('none');
    g.update(offerView(ownShip(), true, false, false), LIVE, 1); // spectating
    expect(g.visible).toBe(false);
  });

  it('carries REDRAW only at the countdown — and its press routes once', () => {
    const h = hooks();
    const g = new OfferGroup(h);
    g.update(view(ownShip()), LIVE, 1);
    expect(redrawBtn()).toBeUndefined();
    g.update({ ...view(ownShip())!, redraw: redrawState('countdown', ownShip()) }, COUNTDOWN, 1);
    const btn = redrawBtn();
    expect(btn).toBeDefined();
    btn!.click();
    expect(h.redraws).toBe(1);
    expect(g.redrawPipFilled).toBe(false);
    // Spent: the pip fills and the button goes inert.
    g.update({ ...view(ownShip())!, redraw: redrawState('countdown', ownShip({ rd: true })) }, COUNTDOWN, 1);
    expect(g.redrawPipFilled).toBe(true);
    redrawBtn()!.click();
    expect(h.redraws).toBe(1);
  });

  it('hover hands the card\'s line to the consoles, and leaving clears it', () => {
    const h = hooks();
    const g = new OfferGroup(h);
    g.update(view(ownShip()), LIVE, 1);
    cards()[1].dispatchEvent(new MouseEvent('mouseenter'));
    expect(h.hovers).toEqual([OFFER[1]]);
    cards()[1].dispatchEvent(new MouseEvent('mouseleave'));
    expect(h.hovers).toEqual([OFFER[1], null]);
  });

  it('clears a live hover when the group hides (no mouseleave ever reaches a hidden card)', () => {
    const h = hooks();
    const g = new OfferGroup(h);
    g.update(view(ownShip()), LIVE, 1);
    cards()[0].dispatchEvent(new MouseEvent('mouseenter'));
    g.update(null, LIVE, 1);
    expect(h.hovers).toEqual([OFFER[0], null]);
  });

  it('a click picks that card once; a pick in flight (locked) sends nothing', () => {
    const h = hooks();
    const g = new OfferGroup(h);
    g.update(view(ownShip()), LIVE, 1);
    cards()[2].click();
    expect(h.picks).toEqual([2]);
    g.update(view(ownShip(), true), LIVE, 1); // main.ts latched the pick
    for (const b of cards()) {
      expect(b.disabled).toBe(true);
      b.click();
    }
    expect(h.picks).toEqual([2]);
  });

  it('a refused (greyed) card sends nothing', () => {
    const h = hooks();
    const g = new OfferGroup(h);
    const full = ['gun', 'boost', 'lightTorpedo', 'navalMines', 'starShells', ...Array.from({ length: SLOT_COUNT - 5 }, () => null)] as const;
    const you = ownShip({ offer: ['heavyTorpedo', 'intel'], cards: ['lightTorpedo'] });
    g.update(offerView(you, false, false, false, full), LIVE, 1);
    cards()[0].click();
    expect(h.picks).toEqual([]);
    cards()[1].click();
    expect(h.picks).toEqual([1]);
  });

  it('a one-off card draws no numeral; a ladder card prints its step', () => {
    const v = view(ownShip({ offer: ['intel'] }))!;
    expect(cardTierMark(v.options[0])).toBe(v.options[0].tier);
    expect(cardTierMark({ ...v.options[0], tierStep: null })).toBeNull();
  });

  it('a denied pick pulses the picked card and claims the `offerDenied` budget element', () => {
    const claims: string[] = [];
    const budget = { claim: (key: string) => (claims.push(key), 'animate') } as unknown as FlashBudget;
    const g = new OfferGroup(hooks(), budget);
    g.update({ ...view(ownShip())!, redraw: 'unspent' }, COUNTDOWN, 1);
    g.pulseDenied(1, 1000);
    expect(claims).toEqual([FLASH_ELEMENTS.offerDenied]);
    expect(g.deniedActive()).toBe(true);
    g.pulseDenied(MULLIGAN_CHOICE, 1100); // inside the same-source floor: dropped
    expect(claims).toHaveLength(1);
  });

  it('never pulses while hidden', () => {
    const claim = vi.fn(() => 'animate');
    const g = new OfferGroup(hooks(), { claim } as unknown as FlashBudget);
    g.pulseDenied(0, 1000);
    expect(claim).not.toHaveBeenCalled();
  });

  it('anchors at the spine\'s offer frame × the UI scale', () => {
    const g = new OfferGroup(hooks());
    g.update(view(ownShip()), LIVE, 1.25);
    expect(panel().style.left).toBe(`${LIVE.frame.x * 1.25}px`);
    expect(panel().style.top).toBe(`${LIVE.frame.y * 1.25}px`);
  });
});
