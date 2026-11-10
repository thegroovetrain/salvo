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
import { OfferGroup, REDRAW_LABEL, cardTierMark, offerHeaderText, rearmChoice, type OfferGroupHooks } from '../ui/offerGroup.js';
import { FLASH_ELEMENTS, type FlashBudget } from '../render/flashBudget.js';
import { settings } from '../settings/store.js';
import { CLIENT_CONFIG } from '../config.js';

const OFFER = ['intel', 'armor', 'deckGun', 'navalMines'];
/** The RIGHT stack on the 13" MacBook's logical viewport (1440×900 ÷ 0.75). */
const LIVE = consoleLayout(1920, 1200).offer;
const COUNTDOWN = consoleLayout(1920, 1200, { countdown: true }).offer;
/** The BOTTOM row (R26) on the reference screen. */
const ROW = consoleLayout(1920, 1080, { offerPos: 'bottom' }).offer;

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

/** THE TEXT RULE (epic-10 amendment 18 (f), R23): every label ≥ 14 px and
 *  every key chip ≥ 12 px at the 1920 reference. */
const LABEL_FLOOR = 14;
const CHIP_FLOOR = 12;

function part(root: HTMLElement, name: string): HTMLElement[] {
  return [...root.querySelectorAll(`[data-part="${name}"]`)] as HTMLElement[];
}

function px(v: string): number {
  return Number.parseFloat(v);
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
    expect(part(panel(), 'header')[0].textContent).toBe(offerHeaderText(2)); // the header IS the pure line
  });

  it('stacks the four cards in ONE column, each at its spine rect, in rect order (R22)', () => {
    const g = new OfferGroup(hooks());
    g.update(view(ownShip()), LIVE, 1);
    const cs = cards();
    expect(cs).toHaveLength(4);
    cs.forEach((b, i) => {
      // Placed off the spine's rect (relative to the group frame), never re-derived.
      expect(px(b.style.left)).toBe(LIVE.cards[i].x - LIVE.frame.x);
      expect(px(b.style.top)).toBe(LIVE.cards[i].y - LIVE.frame.y);
      expect(px(b.style.width)).toBe(LIVE.cards[i].w);
    });
    // A vertical stack: one left edge, each card BELOW the one before it.
    for (let i = 1; i < cs.length; i++) {
      expect(px(cs[i].style.left)).toBe(px(cs[0].style.left));
      expect(px(cs[i].style.top)).toBeGreaterThanOrEqual(px(cs[i - 1].style.top) + px(cs[i - 1].style.height));
    }
  });

  it('lays the cards from the ROW`s rects too (BOTTOM, R26): one row, left to right, the header in its slot', () => {
    const g = new OfferGroup(hooks());
    g.update(view(ownShip()), ROW, 1);
    const cs = cards();
    expect(cs).toHaveLength(4);
    cs.forEach((b, i) => {
      expect(px(b.style.left)).toBe(ROW.cards[i].x - ROW.frame.x);
      expect(px(b.style.top)).toBe(ROW.cards[i].y - ROW.frame.y);
      expect(px(b.style.width)).toBe(ROW.cards[i].w);
      expect(px(b.style.height)).toBe(ROW.cards[i].h);
    });
    for (let i = 1; i < cs.length; i++) {
      expect(px(cs[i].style.top)).toBe(px(cs[0].style.top));
      expect(px(cs[i].style.left)).toBeGreaterThanOrEqual(px(cs[i - 1].style.left) + px(cs[i - 1].style.width));
    }
    const header = part(panel(), 'header')[0];
    expect(px(header.style.left)).toBe(ROW.header.x - ROW.frame.x);
    expect(px(header.style.width)).toBe(ROW.header.w);
    expect(panel().style.width).toBe(`${ROW.frame.w}px`);
  });

  it('re-lays when the arrangement changes under the same view (a settings change)', () => {
    const g = new OfferGroup(hooks());
    g.update(view(ownShip()), LIVE, 1);
    g.update(view(ownShip()), ROW, 1);
    expect(px(cards()[1].style.left)).toBe(ROW.cards[1].x - ROW.frame.x);
    expect(px(cards()[1].style.top)).toBe(ROW.cards[1].y - ROW.frame.y);
  });

  it('keeps the MERGED card face: glyph box top-left, the name beside it, the tier mark bottom-left, the TAB n chip bottom-right', () => {
    const g = new OfferGroup(hooks());
    g.update(view(ownShip()), LIVE, 1);
    for (const b of cards()) {
      const glyph = part(b, 'glyph')[0];
      const name = part(b, 'name')[0];
      const tier = [...part(b, 'tier'), ...part(b, 'oneOff')][0];
      const chip = part(b, 'chip')[0];
      for (const e of [glyph, name, tier, chip]) expect(e).toBeDefined();
      expect(px(glyph.style.width)).toBe(CLIENT_CONFIG.console.offer.glyphBox);
      expect(px(glyph.style.left)).toBe(px(glyph.style.top));
      expect(px(name.style.left)).toBeGreaterThan(px(glyph.style.left) + px(glyph.style.width));
      // the foot line carries the tier first (left) and the chip last (right)
      const foot = tier.parentElement!;
      expect(foot).toBe(chip.parentElement);
      expect(foot.firstElementChild).toBe(tier);
      expect(foot.lastElementChild).toBe(chip);
      expect(foot.style.justifyContent).toBe('space-between');
      expect(foot.style.bottom).not.toBe('');
      expect(chip.textContent?.startsWith('TAB')).toBe(true);
      expect(b.style.borderStyle).toBe('solid');
    }
  });

  it('THE TEXT RULE: header, names, tier marks and REDRAW at ≥ 14 px, the key chip at ≥ 12 px', () => {
    const g = new OfferGroup(hooks());
    g.update({ ...view(ownShip())!, redraw: 'unspent' }, COUNTDOWN, 1);
    const root = panel();
    const labels = [...part(root, 'header'), ...part(root, 'name'), ...part(root, 'tier'), ...part(root, 'redraw')];
    expect(part(root, 'name')).toHaveLength(4);
    expect(part(root, 'redraw')).toHaveLength(1);
    for (const e of labels) expect(px(e.style.fontSize), e.dataset.part).toBeGreaterThanOrEqual(LABEL_FLOOR);
    for (const e of [...part(root, 'header'), ...part(root, 'name'), ...part(root, 'redraw')]) {
      expect(e.style.fontWeight, e.dataset.part).toBe('600');
    }
    for (const e of part(root, 'chip')) expect(px(e.style.fontSize)).toBeGreaterThanOrEqual(CHIP_FLOOR);
  });

  it('sits on ONE dark-glass bed behind the header and the stack (R24)', () => {
    const g = new OfferGroup(hooks());
    g.update(view(ownShip()), LIVE, 1);
    const beds = part(panel(), 'bed');
    expect(beds).toHaveLength(1);
    const bed = beds[0];
    expect(panel().firstElementChild).toBe(bed); // beneath everything else
    expect(bed.style.backgroundColor).toMatch(/^rgba\(/); // translucent…
    expect(bed.style.backgroundColor).not.toMatch(/, 0\)$/); // …not transparent
    expect(bed.style.borderStyle).toBe('solid');
    expect(bed.style.pointerEvents).toBe('none'); // the water stays clickable
    // It sits at the spine's bed rect and covers the header AND the whole stack.
    expect(px(bed.style.left)).toBe(LIVE.bed.x - LIVE.frame.x);
    expect(px(bed.style.top)).toBe(LIVE.bed.y - LIVE.frame.y);
    const [bx, by, bw, bh] = [px(bed.style.left), px(bed.style.top), px(bed.style.width), px(bed.style.height)];
    for (const e of [part(panel(), 'header')[0], ...cards()]) {
      const [x, y, w, h] = [px(e.style.left), px(e.style.top), px(e.style.width), px(e.style.height)];
      expect(x).toBeGreaterThanOrEqual(bx);
      expect(y).toBeGreaterThanOrEqual(by);
      expect(x + w).toBeLessThanOrEqual(bx + bw);
      expect(y + h).toBeLessThanOrEqual(by + bh);
    }
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

  it('a refused (greyed) card is INERT under the pointer: no preview line, no glow', () => {
    const h = hooks();
    const g = new OfferGroup(h);
    const full = ['gun', 'boost', 'lightTorpedo', 'navalMines', 'starShells', ...Array.from({ length: SLOT_COUNT - 5 }, () => null)] as const;
    const you = ownShip({ offer: ['heavyTorpedo', 'intel'], cards: ['lightTorpedo'] });
    g.update(offerView(you, false, false, false, full), LIVE, 1);
    cards()[0].dispatchEvent(new MouseEvent('mouseenter'));
    expect(h.hovers).toEqual([]);
    expect(cards()[0].style.boxShadow).toBe('none');
    cards()[1].dispatchEvent(new MouseEvent('mouseenter'));
    expect(h.hovers).toEqual(['intel']);
  });

  it('re-arms the hover when the cards rebuild under a parked pointer', () => {
    const h = hooks();
    let under: number | null = null;
    const g = new OfferGroup(h, undefined, (el) => cards().indexOf(el as HTMLButtonElement) === under);
    g.update(view(ownShip({ pts: 2 })), LIVE, 1);
    under = 1;
    cards()[1].dispatchEvent(new MouseEvent('mouseenter'));
    g.update(view(ownShip({ pts: 1 })), LIVE, 1); // the bank moved: the cards rebuild
    expect(h.hovers.at(-1)).toBe(OFFER[1]);
    expect(cards()[1].style.boxShadow).not.toBe('none');
    under = null;
    cards()[1].dispatchEvent(new MouseEvent('mouseleave'));
    expect(h.hovers.at(-1)).toBeNull();
  });

  it('the re-arm helper picks the live card under the pointer, never a refused or locked one', () => {
    const live = { greyed: false, disabled: false };
    expect(rearmChoice([live, live, live], (i) => i === 2)).toBe(2);
    expect(rearmChoice([live, { greyed: true, disabled: false }], (i) => i === 1)).toBeNull();
    expect(rearmChoice([{ greyed: false, disabled: true }], () => true)).toBeNull();
    expect(rearmChoice([live, live], () => false)).toBeNull();
  });

  it('drops the REDRAW pip with its button when a rebuild has no REDRAW', () => {
    const g = new OfferGroup(hooks());
    g.update({ ...view(ownShip())!, redraw: 'spent' }, COUNTDOWN, 1);
    expect(g.redrawPipFilled).toBe(true);
    g.update({ ...view(ownShip())!, redraw: 'hidden' }, LIVE, 1);
    expect(g.redrawPipFilled).toBe(false);
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
