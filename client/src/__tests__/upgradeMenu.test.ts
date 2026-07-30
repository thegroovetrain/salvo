// THE REFIT BAND (ui/upgradeMenu.ts, Story 2.7 — reworked from the Story 2.1
// text-column modal): the pure band GEOMETRY (refitBandLayout, measured against
// vitalsLayout/hotbarLayout at both ratified viewport floors), the pure
// offerView() truth table over BOON ids, the DOM adapter (four cards, digit
// chips 1–4, queue pips, ghost edge, click → onSpend choice, focus hygiene,
// stay-open live-swap, auto-hide, denied pulse), and the spend latch's
// release predicate + its new outcome classifier. jsdom.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BOON_CATALOG, CONFIG, type OwnShip } from '@salvo/shared';
import {
  SPEND_LATCH_TIMEOUT_MS,
  UpgradeMenu,
  frontOfferSignature,
  offerView,
  refitBandLayout,
  spendLatchReleased,
  spendOutcome,
  type OfferCard,
  type OfferView,
  type RefitBox,
  type SpendLatch,
} from '../ui/upgradeMenu.js';
import { boonFitToastLine, boonLabel } from '../ui/boonCopy.js';
import { vitalsLayout } from '../render/hud.js';
import { hotbarLayout } from '../render/hotbar.js';
import { CLIENT_CONFIG } from '../config.js';
import { settings } from '../settings/store.js';

const R = CLIENT_CONFIG.refit;

/** A real four-boon offer from the shipped catalog (four distinct categories). */
const OFFER = ['reinforcedBulkheads', 'forcedDraught', 'rangefinderCrew', 'highGainAntenna'];
const OFFER_B = ['splinterMattresses', 'trimmedScrews', 'practicedLoaders', 'crowsNestWatch'];

function ownShip(over: Partial<OwnShip> = {}): OwnShip {
  return {
    id: 'me', x: 0, y: 0, heading: 0, speed: 0, hp: 80, alive: true,
    ammo: [], sweep: 0, cls: 'torpedoBoat', upg: [], pts: 1, offer: [...OFFER],
    boostUntil: 0, boons: [], lvl: 0, xp: 0,
    ...over,
  };
}

// --- band geometry --------------------------------------------------------------
//
// The two RATIFIED viewport floors: 1366×768 at 100%, and the 1280×614 LOGICAL
// floor of the 125% tier (which is itself gated to viewports ≥ 1600px wide, so
// 1600/1.25 = 1280 by 768/1.25 = 614 is the smallest logical box the HUD is
// ever laid out into).
const FLOORS = [
  { name: '1366x768 @100%', w: 1366, h: 768 },
  { name: '1280x614 (125% logical floor)', w: 1280, h: 614 },
];

const overlaps = (a: RefitBox, b: { x: number; y: number; w: number; h: number }): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('refitBandLayout — the below-center card band (UX-DR14 geometry)', () => {
  it('lays out exactly four 216px cards with 20px gaps — a 924px row', () => {
    const L = refitBandLayout(1366, 768);
    expect(L.cards).toHaveLength(CONFIG.offer.size);
    expect(L.row.w).toBe(4 * 216 + 3 * 20);
    expect(L.row.w).toBe(924);
    for (const c of L.cards) {
      expect(c.w).toBe(R.card);
      expect(c.h).toBe(R.cardHeight);
      expect(c.y).toBe(L.row.y); // one row, one baseline — never a second line
    }
    // Strictly left-to-right with exactly `gap` between neighbours: digit k sits
    // over card k (the spatial 1–4 mapping UX-DR14 requires).
    for (let i = 1; i < L.cards.length; i += 1) {
      expect(L.cards[i].x - (L.cards[i - 1].x + R.card)).toBe(R.gap);
    }
  });

  for (const { name, w, h } of FLOORS) {
    it(`fits without wrapping or clipping at ${name}`, () => {
      const L = refitBandLayout(w, h);
      expect(L.row.x).toBeGreaterThanOrEqual(0);
      expect(L.row.x + L.row.w).toBeLessThanOrEqual(w);
      expect(L.band.y).toBeGreaterThanOrEqual(0);
      expect(L.band.y + L.band.h).toBeLessThanOrEqual(h);
      // Horizontally centered: equal margins either side (±1px rounding).
      expect(Math.abs(L.row.x - (w - L.row.x - L.row.w))).toBeLessThanOrEqual(1);
    });

    it(`sits BELOW center — own hull at screen center stays clear at ${name}`, () => {
      // The band's ~58% top edge is the keep-out proxy for the listening ring
      // (UX-DR18, Epic 4/6 — it does not exist yet). The honest constraint the
      // geometry can actually be held to today is "the own hull at screen
      // center is never occluded", and that is what this pins.
      const L = refitBandLayout(w, h);
      expect(L.band.y).toBeGreaterThan(h / 2);
      expect(L.row.y).toBe(Math.round(h * R.bandTopFrac));
    });

    it(`keeps the pip strip above the cards, left-aligned with the row at ${name}`, () => {
      const L = refitBandLayout(w, h);
      expect(L.pips.y + L.pips.h).toBeLessThanOrEqual(L.row.y);
      expect(L.pips.x).toBe(L.row.x);
      expect(L.band.y).toBe(L.pips.y);
    });
  }

  it('is translational under a viewport change (pure geometry, no hidden state)', () => {
    const a = refitBandLayout(1366, 768);
    const b = refitBandLayout(1920, 1080);
    expect(b.row.w).toBe(a.row.w); // fixed row — never rescaled by the viewport
    expect(b.row.x - a.row.x).toBe((1920 - 1366) / 2);
  });

  // DELIBERATE PIN, NOT AN ASPIRATION. The ratified UX-DR14 row (924px) and the
  // ratified below-center band (~58%) are geometrically OVER-CONSTRAINED against
  // the bottom-left hotbar (Story 2.2) and the bottom-right vitals cluster
  // (Story 2.4): at 1366×768 the hotbar occupies y ≥ 445 and the cluster y ≥ 490,
  // so ANY card row with a readable height in the below-center band must overlap
  // the two corners. That is accepted by design — the hotbar dims to 38% and slot
  // input is suspended for exactly the window the band is open — but it is pinned
  // here so a future geometry change (a narrower row, a shorter card, a moved
  // corner) is a CONSCIOUS break rather than a silent regression. What must never
  // regress is the two INNER cards, which stay clear of both clusters at the
  // 1366×768 floor, and the own-hull keep-out above.
  it('overlaps only the two DIMMED corner clusters, never the inner cards (1366x768)', () => {
    const L = refitBandLayout(1366, 768);
    const vitals = vitalsLayout(1366, 768).cluster;
    const hotbar = hotbarLayout(768).rows.map((r) => r.row);
    const hitsHotbar = (c: RefitBox): boolean => hotbar.some((r) => overlaps(c, r));
    // Outer cards: the accepted overlap (documented above).
    expect(hitsHotbar(L.cards[0])).toBe(true);
    expect(overlaps(L.cards[3], vitals)).toBe(true);
    // Inner cards: clear of BOTH clusters — the property that must hold.
    for (const i of [1, 2]) {
      expect(hitsHotbar(L.cards[i]), `card ${i} vs hotbar`).toBe(false);
      expect(overlaps(L.cards[i], vitals), `card ${i} vs vitals`).toBe(false);
    }
  });
});

// --- offerView -------------------------------------------------------------------

describe('offerView — pure spend-view derivation over BOON ids', () => {
  it('is null with no own ship, while spectating, or with an empty bank', () => {
    expect(offerView(null, false, false)).toBeNull();
    expect(offerView(ownShip(), true, false)).toBeNull(); // spectating
    expect(offerView(ownShip({ pts: 0, offer: [] }), false, false)).toBeNull();
  });

  it('resolves the front offer to four cards with catalog category + draft copy', () => {
    const view = offerView(ownShip(), false, false);
    expect(view?.options.map((o) => o.id)).toEqual(OFFER);
    expect(view?.options).toHaveLength(CONFIG.offer.size);
    expect(view?.pts).toBe(1);
    for (const card of view!.options) {
      expect(card.category).toBe(BOON_CATALOG[card.id].category.toUpperCase());
      expect(card.name).toBe(boonLabel(card.id).toUpperCase());
      expect(card.description.length).toBeGreaterThan(0);
    }
    // Story 2.1 ("1-4 cards, no repair"): the view carries ONLY cards — the
    // canHeal/healHp fields left with the REPAIR spend and never came back.
    expect(view && 'canHeal' in view).toBe(false);
    expect(view && 'healHp' in view).toBe(false);
  });

  // FINDING B (version-skew), carried forward from the index era: an offer entry
  // the client cannot resolve used to be dropped from the options array, which
  // COMPACTS it and breaks row->slot alignment — row 1 would end up sending the
  // server's slot 2 choice. The fix drops the WHOLE view (digit picks go inert
  // too, since currentOfferView also returns null), so "row k == server slot k"
  // can never be violated. With boon ids the trigger is a catalog id the client
  // does not know — the PV join gate is what keeps it unreachable in practice.
  it('returns null (drops the whole view) when ANY offer id is unresolvable', () => {
    expect(offerView(ownShip({ offer: [OFFER[0], 'notARealBoon', OFFER[2], OFFER[3]] }), false, false)).toBeNull();
    expect(offerView(ownShip({ offer: ['notARealBoon', ...OFFER.slice(1)] }), false, false)).toBeNull();
    // The prototype-key trap: resolveBoons is own-property gated, so this is an
    // unresolvable id like any other — never Object.prototype.constructor.
    expect(offerView(ownShip({ offer: ['constructor', ...OFFER.slice(1)] }), false, false)).toBeNull();
  });

  it('renders a SHORT offer verbatim (a small catalog rolls fewer cards, never a crash)', () => {
    const view = offerView(ownShip({ offer: [OFFER[0], OFFER[1]] }), false, false);
    expect(view?.options.map((o) => o.id)).toEqual([OFFER[0], OFFER[1]]);
  });

  it('is available while DEAD in the waiting phase (builds persist across respawns)', () => {
    expect(offerView(ownShip({ alive: false, hp: 0 }), false, false)).not.toBeNull();
  });

  // FINDING A (spend latch): `locked` is threaded straight through from the
  // caller (main.ts's spendInFlight) — offerView stays pure, it just carries
  // the flag into the view so the DOM adapter can dim/inert the cards.
  it('carries the caller-supplied `locked` flag straight through', () => {
    expect(offerView(ownShip(), false, true)?.locked).toBe(true);
    expect(offerView(ownShip(), false, false)?.locked).toBe(false);
  });
});

// --- DOM adapter -----------------------------------------------------------------

describe('UpgradeMenu — DOM adapter (the TAB-toggled band)', () => {
  beforeEach(() => document.body.replaceChildren());
  afterEach(() => settings.set({ motion: 'full' }));

  const cardsOf = (ids: readonly string[]): OfferCard[] =>
    ids.map((id) => ({ id, category: BOON_CATALOG[id].category.toUpperCase(), name: boonLabel(id).toUpperCase(), description: '' }));

  const view = (over: Partial<OfferView> = {}): OfferView => ({
    pts: 1, options: cardsOf(OFFER), locked: false, ...over,
  });

  function cards(): HTMLButtonElement[] {
    return [...document.querySelectorAll('#upgrade-menu button')] as HTMLButtonElement[];
  }
  function pips(): HTMLElement[] {
    const strip = document.querySelector('#upgrade-menu > div');
    return [...(strip?.children ?? [])] as HTMLElement[];
  }

  it('renders EXACTLY four cards and routes clicks to the right choice', () => {
    const spends: number[] = [];
    const menu = new UpgradeMenu((c) => spends.push(c));
    menu.toggle(view());
    const btns = cards();
    expect(btns).toHaveLength(4);
    btns[0].click();
    btns[3].click();
    expect(spends).toEqual([0, 3]); // digit 4 / card 4 is LIVE (Story 2.7)
  });

  it('each card leads with its digit key-chip (1-based, matching the pick keys)', () => {
    const menu = new UpgradeMenu(() => {});
    menu.toggle(view());
    const chips = cards().map((b) => b.querySelector('span')?.textContent);
    expect(chips).toEqual(['1', '2', '3', '4']);
  });

  it('a card carries the category tag, the boon name, and its description', () => {
    const menu = new UpgradeMenu(() => {});
    menu.toggle(view({ options: cardsOf(OFFER).map((c) => ({ ...c, description: 'DESC ' + c.id })) }));
    const text = cards()[0].textContent ?? '';
    expect(text).toContain(BOON_CATALOG[OFFER[0]].category.toUpperCase());
    expect(text).toContain(boonLabel(OFFER[0]).toUpperCase());
    expect(text).toContain('DESC ' + OFFER[0]);
  });

  it('card buttons never retain focus: mousedown is prevented and click blurs', () => {
    const menu = new UpgradeMenu(() => {});
    menu.toggle(view());
    const btn = cards()[0];
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    const notPrevented = btn.dispatchEvent(down);
    expect(notPrevented).toBe(false); // preventDefault — focus never acquired on click
    btn.focus(); // keyboard-path focus (belt-and-braces)
    btn.click();
    expect(document.activeElement).not.toBe(btn); // click blurs — Space/Enter can't re-trigger
  });

  it('toggle twice hides the band (TAB open / TAB close-without-choosing)', () => {
    const menu = new UpgradeMenu(() => {});
    menu.toggle(view());
    expect(menu.visible).toBe(true);
    menu.toggle(view());
    expect(menu.visible).toBe(false);
  });

  it('positions the band from refitBandLayout, not from a CSS guess', () => {
    const menu = new UpgradeMenu(() => {});
    menu.toggle(view());
    const panel = document.getElementById('upgrade-menu')!;
    const expected = refitBandLayout(window.innerWidth, window.innerHeight).band.y;
    expect(panel.style.top).toBe(`${expected}px`);
    expect(panel.style.zIndex).toBe('1000');
    expect(panel.style.transform).toContain('scale(var(--hc-ui-scale, 1))');
  });

  // AMENDMENT 36 — stay open through the queue: a successful spend live-swaps
  // the row to the next queued offer IN PLACE. The window is never hidden by a
  // pick (main.ts no longer calls hide()); only pts→0 closes it, through the
  // existing update(null) force-hide.
  it('live-swaps to the next queued offer and STAYS OPEN', () => {
    const menu = new UpgradeMenu(() => {});
    menu.toggle(view({ pts: 2 }));
    const first = cards()[0].textContent;
    menu.update(view({ pts: 1, options: cardsOf(OFFER_B) }));
    expect(menu.visible).toBe(true);
    expect(cards()[0].textContent).not.toBe(first);
    expect(cards()).toHaveLength(4);
  });

  it('update(null) force-hides the band (the LAST level was spent / spectate)', () => {
    const menu = new UpgradeMenu(() => {});
    menu.toggle(view());
    menu.update(null);
    expect(menu.visible).toBe(false);
  });

  it('update() never OPENS a closed window (only the TAB toggle does)', () => {
    const menu = new UpgradeMenu(() => {});
    menu.update(view());
    expect(menu.visible).toBe(false);
  });

  // FINDING A (spend latch): while main.ts's spendInFlight latch is set,
  // offerView carries locked:true — every card must render inert so a second
  // click can't fire against the stale offer this frame is showing.
  it('locked:true dims/inerts every card', () => {
    const spends: number[] = [];
    const menu = new UpgradeMenu((c) => spends.push(c));
    menu.toggle(view({ locked: true }));
    for (const btn of cards()) {
      expect(btn.disabled).toBe(true);
      expect(btn.style.opacity).toBe(String(R.lockedAlpha));
      btn.click();
    }
    expect(spends).toEqual([]); // nothing fires while locked
  });

  it('update() re-renders cards live when only `locked` flips (latch clears)', () => {
    const spends: number[] = [];
    const menu = new UpgradeMenu((c) => spends.push(c));
    menu.toggle(view({ locked: true }));
    menu.update(view({ locked: false }));
    cards()[0].click();
    expect(spends).toEqual([0]); // unlocked again — the card is live
  });

  // QUEUE CHROME (UX-DR14): one filled pip for the offer on screen, one hollow
  // pip per offer still waiting; the dashed ghost edge only when more than one
  // level is banked.
  it('renders one pip per banked level: the front one filled, the rest hollow', () => {
    const menu = new UpgradeMenu(() => {});
    menu.toggle(view({ pts: 3 }));
    const p = pips();
    expect(p).toHaveLength(3);
    expect(p[0].style.backgroundColor).toBe('var(--hc-phosphor)'); // filled = the offer on screen
    expect(p[1].style.backgroundColor).toBe('transparent'); // hollow = still queued
    expect(p[2].style.backgroundColor).toBe('transparent');
  });

  it('shows the dashed ghost edge only while offers are still queued', () => {
    const menu = new UpgradeMenu(() => {});
    const ghost = (): HTMLElement => document.querySelector('#upgrade-menu > div:nth-child(2) > div')!;
    menu.toggle(view({ pts: 1 }));
    expect(ghost().style.display).toBe('none');
    menu.update(view({ pts: 2 }));
    expect(ghost().style.display).toBe('block');
    expect(ghost().style.borderStyle).toBe('dashed');
  });

  // DENIED REGISTER (amendment 36): a rejected/timed-out spend pulses the card
  // the player picked — 80ms, one flash per 300ms from this source, motion-scaled.
  it('pulses the PICKED card on a denied spend, then drops back to rest', () => {
    const menu = new UpgradeMenu(() => {});
    menu.toggle(view());
    menu.pulseDenied(2, 1000);
    expect(menu.deniedActive(1000)).toBe(true);
    expect(cards()[2].style.borderColor).toBe('var(--hc-denied)');
    expect(cards()[0].style.borderColor).not.toBe('var(--hc-denied)');
    expect(menu.deniedActive(1000 + R.deniedPulseMs)).toBe(false); // 80ms one-shot
  });

  it('honors the 300ms same-source floor (spam reads as one flash, never a strobe)', () => {
    const menu = new UpgradeMenu(() => {});
    menu.toggle(view());
    menu.pulseDenied(0, 1000);
    menu.pulseDenied(1, 1000 + R.deniedFloorMs - 1); // inside the floor — ignored
    expect(cards()[1].style.borderColor).not.toBe('var(--hc-denied)');
    menu.pulseDenied(1, 1000 + R.deniedFloorMs); // floor elapsed — accepted
    expect(cards()[1].style.borderColor).toBe('var(--hc-denied)');
  });

  it('suppresses the pulse entirely at motion=off (information rides the pips, not the flash)', () => {
    settings.set({ motion: 'off' });
    const menu = new UpgradeMenu(() => {});
    menu.toggle(view());
    menu.pulseDenied(1, 1000);
    expect(menu.deniedActive(1000)).toBe(false);
    expect(cards()[1].style.borderColor).not.toBe('var(--hc-denied)');
  });

  it('a fresh row never inherits the previous row\'s pulse', () => {
    const menu = new UpgradeMenu(() => {});
    menu.toggle(view({ pts: 2 }));
    menu.pulseDenied(1, 1000);
    menu.update(view({ pts: 1, options: cardsOf(OFFER_B) }));
    expect(menu.deniedActive(1000)).toBe(false);
  });
});

// --- the boon copy layer ----------------------------------------------------------

describe('boonCopy — client-side draft presentation (no display fields on BoonDef)', () => {
  it('names and describes every shipped catalog entry', () => {
    for (const id of Object.keys(BOON_CATALOG)) {
      expect(boonLabel(id).length).toBeGreaterThan(0);
      expect(boonLabel(id)).not.toBe(id); // real copy, not the humanized fallback
    }
  });

  it('fails OPEN on an unknown id (a readable fallback, never an empty card)', () => {
    expect(boonLabel('someFutureBoon')).toBe('Some Future Boon');
  });

  it('the fitted toast names the boon and carries the accrued-boon diamond', () => {
    expect(boonFitToastLine('reinforcedBulkheads')).toBe('◆ REINFORCED BULKHEADS FITTED');
  });
});

// --- FINDING A: the spend latch's release predicate + outcome ---------------------
//
// The latch is set the instant a spend is sent and must HOLD until that spend
// visibly lands, or the second digit/click of a double-tap fires against a
// front offer the server has already shifted away. Story 2.6's passive banking
// is what makes this subtle: `pts` now ticks UP on the server's own schedule,
// mid-flight, with nothing about the spend having changed. Story 2.7 EXTENDS
// this with spendOutcome() (which of the released cases happened) and must not
// regress a single release clause.

describe('spendLatchReleased — the FINDING A latch predicate', () => {
  const latch = (over: Partial<SpendLatch> = {}): SpendLatch => ({
    pts: 1, offerSig: OFFER.join(','), at: 1000, choice: 0, ...over,
  });
  const you = (over: Partial<Pick<OwnShip, 'pts' | 'offer'>> = {}) =>
    ({ pts: 1, offer: [...OFFER], ...over });
  const soon = 1000 + SPEND_LATCH_TIMEOUT_MS / 2; // well inside the fallback window

  it('HOLDS through a passive bank mid-flight (pts 1 -> 2, same front offer)', () => {
    // THE Story 2.6 regression: the old "signature changed in ANY way" check
    // folded pts into the signature, so a passive level banking while the spend
    // was in flight released the latch and re-opened the double-spend hazard.
    expect(spendLatchReleased(latch(), you({ pts: 2 }), soon)).toBe(false);
  });

  it('HOLDS while nothing has moved at all', () => {
    expect(spendLatchReleased(latch(), you(), soon)).toBe(false);
  });

  it('releases when the spend visibly lands (the bank shrinks)', () => {
    expect(spendLatchReleased(latch({ pts: 2 }), you({ pts: 1 }), soon)).toBe(true);
  });

  it('releases when a spend and a bank land together: pts unchanged, front offer shifted', () => {
    expect(spendLatchReleased(latch(), you({ pts: 1, offer: [...OFFER_B] }), soon)).toBe(true);
  });

  it('releases on the fallback timeout (a silently rejected spend never locks the player out)', () => {
    expect(spendLatchReleased(latch(), you(), 1000 + SPEND_LATCH_TIMEOUT_MS + 1)).toBe(true);
    expect(spendLatchReleased(latch(), you(), 1000 + SPEND_LATCH_TIMEOUT_MS)).toBe(false); // not yet
  });

  it('releases when the own ship is gone (death / spectate — the band is hidden anyway)', () => {
    expect(spendLatchReleased(latch(), null, soon)).toBe(true);
    expect(spendLatchReleased(latch(), undefined, soon)).toBe(true);
  });

  it('signs the FRONT OFFER ALONE — pts is deliberately not in the signature', () => {
    expect(frontOfferSignature(you())).toBe(OFFER.join(','));
    expect(frontOfferSignature(you({ pts: 9 }))).toBe(frontOfferSignature(you({ pts: 1 })));
    expect(frontOfferSignature(null)).toBe('');
  });
});

describe('spendOutcome — the stay-open state machine classifier (amendment 36)', () => {
  const latch = (over: Partial<SpendLatch> = {}): SpendLatch => ({
    pts: 1, offerSig: OFFER.join(','), at: 1000, choice: 2, ...over,
  });
  const you = (over: Partial<Pick<OwnShip, 'pts' | 'offer'>> = {}) =>
    ({ pts: 1, offer: [...OFFER], ...over });
  const soon = 1000 + SPEND_LATCH_TIMEOUT_MS / 2;
  const late = 1000 + SPEND_LATCH_TIMEOUT_MS + 1;

  it('pending while the latch holds — including through a passive bank', () => {
    expect(spendOutcome(latch(), you(), soon)).toBe('pending');
    expect(spendOutcome(latch(), you({ pts: 2 }), soon)).toBe('pending');
  });

  it('success when the bank shrinks (the spend landed)', () => {
    expect(spendOutcome(latch({ pts: 2 }), you({ pts: 1 }), soon)).toBe('success');
  });

  it('success when the front offer shifted under an unchanged pts (spend + bank together)', () => {
    expect(spendOutcome(latch(), you({ pts: 1, offer: [...OFFER_B] }), soon)).toBe('success');
  });

  it('failed on the fallback timeout with nothing moved (denied pulse, level stays banked)', () => {
    expect(spendOutcome(latch(), you(), late)).toBe('failed');
  });

  it('failed when the own ship vanished (classified, but the band is already hidden)', () => {
    expect(spendOutcome(latch(), null, soon)).toBe('failed');
  });

  it('never disagrees with spendLatchReleased about WHEN the latch clears', () => {
    const cases: [SpendLatch, ReturnType<typeof you> | null, number][] = [
      [latch(), you(), soon],
      [latch(), you({ pts: 2 }), soon],
      [latch({ pts: 2 }), you({ pts: 1 }), soon],
      [latch(), you({ offer: [...OFFER_B] }), soon],
      [latch(), you(), late],
      [latch(), null, soon],
    ];
    for (const [l, y, t] of cases) {
      expect(spendOutcome(l, y, t) === 'pending').toBe(!spendLatchReleased(l, y, t));
    }
  });
});
