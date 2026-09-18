// THE REFIT BAND (ui/upgradeMenu.ts, Story 2.7 — reworked from the Story 2.1
// text-column modal): the pure band GEOMETRY (refitBandLayout, measured against
// vitalsLayout/hotbarLayout at both ratified viewport floors), the pure
// offerView() truth table over BOON ids, the DOM adapter (four cards, digit
// chips 1–4, queue pips, ghost edge, click → onSpend choice, focus hygiene,
// stay-open live-swap, auto-hide, denied pulse), and the spend latch's
// release predicate + its new outcome classifier. jsdom.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CATALOG, CONFIG, MULLIGAN_CHOICE, type OwnShip } from '@salvo/shared';
import {
  REDRAW_FOOTER_PX,
  REDRAW_WORD,
  SLOTS_FULL,
  SPEND_LATCH_TIMEOUT_MS,
  UpgradeMenu,
  canLatchSpend,
  cardGreyed,
  frontOfferSignature,
  mulliganLanded,
  offerView,
  refitBandLayout,
  shouldAutoOpen,
  spendLatchReleased,
  spendOutcome,
  type OfferCard,
  type OfferView,
  type RefitBox,
  type SpendLatch,
} from '../ui/upgradeMenu.js';
import { MICRO_VAR, domMicroScale } from '../ui/refitCardFit.js';
import {
  boonFitToastLine,
  boonKindLabel,
  boonName,
  boonTooltipText,
  cardStatRows,
  cardTierLabel,
  cardTierSteps,
} from '../ui/boonCopy.js';
import { hudBarLayout } from '../render/hudBar.js';
import { setUiScaleVar } from '../ui/theme.js';
import { CLIENT_CONFIG } from '../config.js';
import { scaleTierEnabled, settings } from '../settings/store.js';
import { FLASH_ELEMENTS, type FlashBudget, type FlashVerdict } from '../render/flashBudget.js';

const R = CLIENT_CONFIG.refit;

/** A real four-LINE draw from the shipped Boon Catalog v1 (the deck draws four
 *  different card LINES — categories may repeat; these happen not to). */
const OFFER = ['radarSweep', 'armor', 'deckGunBarrel', 'navalMines'];
const OFFER_B = ['reload', 'speed', 'radarSweep', 'navalMines'];

function ownShip(over: Partial<OwnShip> = {}): OwnShip {
  return {
    id: 'me', x: 0, y: 0, heading: 0, speed: 0, hp: 80, alive: true,
    ammo: [], sweep: 0, cls: 'torpedoBoat', pts: 1, offer: [...OFFER],
    boostUntil: 0, cards: [], lvl: 0, xp: 0, repairHp: 0,
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

    it(`hangs exactly barGap above the HUD bar's top edge at ${name}`, () => {
      // EPIC-8 AMENDMENT 36 (Eric, 2026-09-17) replaced the viewport-fraction
      // anchor with UX-DR53's rule — row bottom = hud-bar top − 8px — applied to
      // the band's LOWEST edge. Story 8.8 deleted the DAMAGE CONTROL strip that
      // used to hang under the row, so that edge is THE CARD ROW'S BOTTOM. The
      // below-centre own-hull keep-out is WAIVED by the same ruling, so the old
      // `band.y > h/2` pin is gone; what replaces it is the property that
      // actually matters now.
      const L = refitBandLayout(w, h);
      const bar = hudBarLayout(w, h).bar;
      expect(L.row.y + L.row.h).toBe(L.band.y + L.band.h); // the CARD ROW is the lowest edge
      expect(L.band.y + L.band.h).toBe(bar.y - R.barGap);
      expect(overlaps(L.band, bar)).toBe(false);
      // Waived is not unbounded: the band may now start above the screen centre
      // but never off the top of the screen.
      expect(L.band.y).toBeGreaterThanOrEqual(0);
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

  // AMENDMENT 40 (Story 2.8) — the overlap below is now RATIFIED OUTRIGHT, not
  // merely accepted: "at floor viewports the outer cards overlap the 38%-dimmed
  // corner clusters — the dimmed chrome is inert during the refit combat
  // lockout; cards render above it and MAY GROW MODESTLY TALLER for the new
  // rarity/lineage/doctrine lines. No band lift, no card shrink." The card grew
  // 156 → 236px for exactly those lines; this pin is re-taken at the new height
  // and the two INNER cards still clear both clusters.
  it('the grown card still fits both ratified floors below the band anchor', () => {
    for (const { name, w, h } of FLOORS) {
      const L = refitBandLayout(w, h);
      expect(L.cards[0].h, name).toBe(R.cardHeight);
      expect(L.band.y + L.band.h, name).toBeLessThanOrEqual(h); // no clip off the bottom
    }
  });

  // --- THE UNTOUCHABLE ROW -----------------------------------------------------
  //
  // THE REGRESSION PIN THAT MATTERS MOST. The four cards stay 216px, the gaps
  // stay 20px, the row stays exactly 924px, and CONFIG.offer.size stays 4 —
  // through the cycle-46 rail's whole life and through Story 8.8's deletion of
  // it. A five-card row would be 1160px, leaving 60px of margin at the 1280×614
  // logical floor and superseding the ratified UX-DR14 geometry outright.
  it('leaves the four-card row BYTE-IDENTICAL (the untouchable row)', () => {
    for (const { name, w, h } of FLOORS) {
      const L = refitBandLayout(w, h);
      expect(CONFIG.offer.size, name).toBe(4);
      expect(L.cards, name).toHaveLength(4);
      expect(L.row.w, name).toBe(4 * 216 + 3 * 20);
      expect(L.row.w, name).toBe(924);
      expect(L.row.h, name).toBe(226);
      for (const c of L.cards) {
        expect(c.w, name).toBe(216);
        expect(c.h, name).toBe(226);
        expect(c.y, name).toBe(L.row.y); // still ONE row, one baseline
      }
      for (let i = 1; i < L.cards.length; i += 1) {
        expect(L.cards[i].x - (L.cards[i - 1].x + 216), name).toBe(20);
      }
      // The row still derives from ONE anchor and the pips still hang a fixed
      // offset above it. STORY 8.6 (epic-8 amendment 36) moved that anchor for
      // the second time — from a viewport fraction to the HUD bar's top edge —
      // and, as in cycle 47, only the POSITION moved: the row's SHAPE is
      // untouchable and is what the pin above protects.
      expect(L.row.y, name).toBe(L.band.y + R.pipsAbove);
      expect(L.pips.y, name).toBe(L.row.y - R.pipsAbove);
    }
  });

  // THE ANCHORED EDGE, TO THE PIXEL (Story 8.6, epic-8 amendment 36). The band
  // no longer floats at a fraction of the viewport between two opposing
  // constraints — it HANGS off the HUD bar, so there is exactly one number to
  // pin and it is an equality rather than a pair of inequalities:
  //
  //   band bottom (the CARD ROW's, since Story 8.8) === hudBarLayout().bar.y − barGap
  //
  // The own-hull keep-out that boxed the old anchor in from above is WAIVED by
  // the same ruling, and the container-fit law from below is now satisfied BY
  // CONSTRUCTION (the bar is itself `floor` px off the viewport edge). What can
  // still go wrong is the band running off the TOP of a short viewport, so that
  // is pinned too, with the actual numbers.
  it('seats the band exactly barGap above the bar at both ratified floors', () => {
    const cases = [
      { name: '1366x768 @100%', w: 1366, h: 768, barTop: 614, bandBottom: 606 },
      { name: '1280x614 (125% logical floor)', w: 1280, h: 614, barTop: 460, bandBottom: 452 },
    ];
    for (const { name, w, h, barTop, bandBottom } of cases) {
      const L = refitBandLayout(w, h);
      expect(hudBarLayout(w, h).bar.y, name).toBe(barTop);
      expect(L.band.y + L.band.h, name).toBe(bandBottom);
      expect(L.row.y + L.row.h, name).toBe(bandBottom);
      expect(L.band.y, `${name}: band ${-L.band.y}px off the top of the screen`).toBeGreaterThanOrEqual(0);
      expect(L.band.y + L.band.h, name).toBeLessThanOrEqual(h);
    }
    // The floor case, to the pixel. STORY 8.8 DELETED THE RAIL AND ITS SEAM, so
    // the band is 244px (18 pips + 226 card) rather than 290: ending at 452 it
    // now starts at 208 rather than 162, and the card row's own bottom IS the
    // anchored edge. The ANCHOR is unchanged (amendment 36) — a shorter band
    // simply leaves more clear water above it, which is what the tooltip's
    // amendment-37 flip spends.
    const F = refitBandLayout(1280, 614);
    expect(F.band.h).toBe(R.pipsAbove + R.cardHeight);
    expect(F.band.h).toBe(244);
    expect(F.band.y).toBe(208);
    expect(F.row.y).toBe(226);
    expect(F.row.y + F.row.h).toBe(452);
  });

  // --- THE COUNTDOWN FOOTER (Story 8.10, epic-8 amendments 60 + 63a) ----------
  //
  // THE 44px IS A DELTA, NOT A PAIR OF ABSOLUTES. The band's BOTTOM is anchored
  // (`barGap` above the bar) and the footer is the band's last block, so every
  // pixel it adds comes off the TOP: the card row LIFTS by exactly the footer's
  // height and the bar never moves. UX-DR54 / DESIGN.md's 388 → 344 pair forgot
  // the 8px bar gap; the measured numbers are 380 → 336 at 1366×768, and the
  // ratified fact is the lift between them.
  it('lifts the card row by exactly the footer and leaves the anchored edge alone', () => {
    const live = refitBandLayout(1366, 768);
    const countdown = refitBandLayout(1366, 768, CONFIG.offer.size, REDRAW_FOOTER_PX);
    expect(REDRAW_FOOTER_PX).toBe(44);
    expect(live.row.y).toBe(380);
    expect(countdown.row.y).toBe(336);
    expect(live.row.y - countdown.row.y).toBe(REDRAW_FOOTER_PX);
    // The one edge that must NOT move, in either state.
    expect(live.band.y + live.band.h).toBe(606);
    expect(countdown.band.y + countdown.band.h).toBe(606);
    expect(hudBarLayout(1366, 768).bar.y - R.barGap).toBe(606);
    // The row itself is untouchable: same shape, same width, one baseline.
    expect(countdown.row.w).toBe(live.row.w);
    expect(countdown.row.h).toBe(live.row.h);
    expect(countdown.cards.map((c) => c.x)).toEqual(live.cards.map((c) => c.x));
  });

  it('seats the REDRAW button in the gap under the row, flush with the band\'s bottom', () => {
    const L = refitBandLayout(1366, 768, CONFIG.offer.size, REDRAW_FOOTER_PX);
    expect(L.footer.h).toBe(R.redrawHeight);
    expect(L.footer.y).toBe(L.row.y + L.row.h + R.redrawGap);
    expect(L.footer.y + L.footer.h).toBe(L.band.y + L.band.h); // the anchored edge
    expect(L.footer.x).toBe(L.row.x);
    expect(R.redrawGap + R.redrawHeight).toBe(REDRAW_FOOTER_PX);
  });

  it('is DEGENERATE with no footer — nothing hangs under the row off the start line', () => {
    const L = refitBandLayout(1366, 768);
    expect(L.footer.h).toBe(0);
    expect(L.footer.y).toBe(L.row.y + L.row.h);
    expect(L.band.h).toBe(R.pipsAbove + R.cardHeight);
  });

  it('still fits both ratified floors with the footer standing', () => {
    for (const { name, w, h } of FLOORS) {
      const L = refitBandLayout(w, h, CONFIG.offer.size, REDRAW_FOOTER_PX);
      expect(L.band.y, `${name}: band ${-L.band.y}px off the top`).toBeGreaterThanOrEqual(0);
      expect(L.band.y + L.band.h, name).toBeLessThanOrEqual(h);
      expect(overlaps(L.band, hudBarLayout(w, h).bar), name).toBe(false);
    }
  });

  // THE SCALED-TIER FIT — the case the logical-floor pins above cannot see, and
  // the one that caught a real clip during the cycle-47 review.
  //
  // THE MISMATCH IT USED TO DOCUMENT IS GONE. `place()` anchored the band from
  // `window.innerHeight` in PHYSICAL px while the panel's contents were scaled
  // by `--hc-ui-scale` about `top center`, so the band's real footprint was
  // `scale x` its laid-out height hanging off an UNSCALED anchor. Story 8.6 lays
  // the band out in LOGICAL units (physical / the factor, the same units the bar
  // uses) and writes `band.y * factor` to `top`, which retires the defect the
  // cycle-47 review ledgered. This pin is re-derived on that anchor: at every
  // selectable tier the band still ends inside the viewport, still clears the
  // bar by exactly `barGap`, and still starts on screen.
  it('keeps the scaled band inside the viewport, clear of the bar, at every UI-scale tier', () => {
    for (const { w, h } of [
      { w: 1366, h: 768 },
      { w: 1280, h: 614 },
      { w: 1600, h: 768 }, // the binding case — 125% is reachable here
      { w: 1920, h: 1080 },
    ]) {
      for (const tier of CLIENT_CONFIG.settings.scaleTiers) {
        if (!scaleTierEnabled(tier, w)) continue; // gated off at this width
        const f = tier / 100;
        const label = `${w}x${h} @${tier}%`;
        const L = refitBandLayout(w / f, h / f);
        const bar = hudBarLayout(w / f, h / f).bar;
        expect(L.band.y + L.band.h, label).toBeCloseTo(bar.y - R.barGap, 6);
        expect(overlaps(L.band, bar), label).toBe(false);
        // What the DOM actually renders: the logical box scaled about its top.
        const bottom = (L.band.y + L.band.h) * f;
        expect(bottom, `${label}: band ${(bottom - h).toFixed(1)}px past the bottom`).toBeLessThanOrEqual(h);
        expect(L.band.y * f, `${label}: band ${(-L.band.y * f).toFixed(1)}px off the top`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  // THE OVERLAP IS GONE — the pin that used to ratify it now forbids it.
  //
  // For six epics a 924px card row sitting at a fraction of the viewport height
  // reached into whatever the HUD had parked at the bottom of the screen, and
  // the rule that made it acceptable was the combat lockout: the surface under
  // the cards dims to 38% and stops taking input for exactly the window the band
  // is open. Story 8.6 replaced the three corner clusters with ONE 768px bar and
  // Eric ruled (epic-8 amendment 36) that the band hangs off it instead — so the
  // overlap is not merely tolerated now, it cannot happen, at any viewport or
  // scale tier. The dim stays: it is what tells the player the slots are inert,
  // and it is no longer load-bearing for legibility.
  it('clears the HUD bar it dims by exactly barGap, and stays clear of the chrome bar (1366x768)', () => {
    const L = refitBandLayout(1366, 768);
    const hud = hudBarLayout(1366, 768);
    expect(overlaps(L.band, hud.bar)).toBe(false);
    expect(L.band.y + L.band.h).toBe(hud.bar.y - R.barGap);
    // Nothing the band paints reaches the dimmed slot groups any more — the
    // outer cards were what used to sit on them.
    for (const card of L.cards) {
      for (const g of hud.dimGroups) expect(overlaps(card, g)).toBe(false);
    }
    // ...and it still never climbs into the top-centre match register.
    expect(L.band.y).toBeGreaterThan(CLIENT_CONFIG.chromeBar.y + CLIENT_CONFIG.chromeBar.fontSize);
  });
});

// --- offerView -------------------------------------------------------------------

describe('offerView — pure spend-view derivation over BOON ids', () => {
  it('is null with no own ship, while spectating, or with an empty bank', () => {
    expect(offerView(null, false, false, false)).toBeNull();
    expect(offerView(ownShip(), true, false, false)).toBeNull(); // spectating
    expect(offerView(ownShip({ pts: 0, offer: [] }), false, false, false)).toBeNull();
  });

  it('resolves the front offer to four cards with the kind word + ratified copy', () => {
    const view = offerView(ownShip(), false, false, false);
    expect(view?.options.map((o) => o.id)).toEqual(OFFER);
    expect(view?.options).toHaveLength(CONFIG.offer.size);
    expect(view?.pts).toBe(1);
    for (const card of view!.options) {
      expect(card.kind.length).toBeGreaterThan(0);
      expect(card.name).toBe(boonName(card.id, 0)); // the sheet's name for the line
      // STORY 8.7: the face is the ratified FIVE-ROW block. A LADDER card and a
      // LIVE equipment line print rows; an add-on, a consumable and an unbuilt
      // weapon move no number and print none, which is correct, not a fault.
      const line = CATALOG[card.id];
      const speaks = line.kind === 'ladder' || (line.kind === 'equipment' && line.stub !== true);
      if (speaks) expect(card.rows.length, card.id).toBeGreaterThan(0);
      else expect(card.rows, card.id).toEqual([]);
      // ...and the three interim-face fields went with the face they belonged to.
      for (const dead of ['count', 'lineage', 'description']) {
        expect(card, `${card.id}.${dead}`).not.toHaveProperty(dead);
      }
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
    expect(offerView(ownShip({ offer: [OFFER[0], 'notARealBoon', OFFER[2], OFFER[3]] }), false, false, false)).toBeNull();
    expect(offerView(ownShip({ offer: ['notARealBoon', ...OFFER.slice(1)] }), false, false, false)).toBeNull();
    // The prototype-key trap: resolveBoons is own-property gated, so this is an
    // unresolvable id like any other — never Object.prototype.constructor.
    expect(offerView(ownShip({ offer: ['constructor', ...OFFER.slice(1)] }), false, false, false)).toBeNull();
  });

  it('renders a SHORT offer verbatim (a small catalog rolls fewer cards, never a crash)', () => {
    const view = offerView(ownShip({ offer: [OFFER[0], OFFER[1]] }), false, false, false);
    expect(view?.options.map((o) => o.id)).toEqual([OFFER[0], OFFER[1]]);
  });

  // ...but an EMPTY offer is not "short", it is unusable: a band of queue pips
  // with no cards can neither be acted on nor spent closed. Fail closed, the
  // same reflex as the unresolvable id (only reachable through a degenerate
  // catalog — the server never rolls zero ids against the shipped one).
  it('returns null for an EMPTY front offer, even with levels banked', () => {
    expect(offerView(ownShip({ offer: [] }), false, false, false)).toBeNull();
    expect(offerView(ownShip({ pts: 3, offer: [] }), false, false, false)).toBeNull();
  });

  it('is available while DEAD in the waiting phase (builds persist across respawns)', () => {
    expect(offerView(ownShip({ alive: false, hp: 0 }), false, false, false)).not.toBeNull();
  });

  // Story 5.2 / amendment 10 — "once sinking, you're done". A sinking hull
  // keeps every weapon, every ability and the foghorn; what it loses is the
  // ECONOMY. The flag is its own, deliberately: `!alive` would also close the
  // band for the wreck-awaiting-respawn case directly above (which is open by
  // ruling), and `spectating` is false for the whole window by design.
  it('is INERT while SINKING, whatever the bank holds', () => {
    expect(offerView(ownShip({ alive: false, hp: 0 }), false, false, true)).toBeNull();
    expect(offerView(ownShip({ pts: 3 }), false, false, true)).toBeNull();
    // ...and the same hull with the window closed is spendable again, so the
    // flag — not some coincidence of the fixture — is what closed it.
    expect(offerView(ownShip({ pts: 3 }), false, false, false)).not.toBeNull();
  });

  // --- Story 2.8: the card face is resolved against the PLAYER'S OWN BUILD ----

  it('names the LINE and lets the LADDER and its numerals carry the stack', () => {
    // Catalog v3 names the line, not the rung (Eric's sheet §1). Story 8.7
    // replaced the "n/cap" count and the "II/V" handrail with the DRAWN ladder:
    // `stack` and `cap` are the rung count and its filled prefix, and the
    // numerals say the STEP this card buys.
    const fresh = offerView(ownShip(), false, false, false);
    expect(fresh?.options[0].name).toBe(boonName('radarSweep', 0));
    expect(fresh?.options[0].stack).toBe(0);
    expect(fresh?.options[0].cap).toBe(5);
    expect(fresh?.options[0].tier).toBe('I');
    const stacked = offerView(ownShip({ cards: ['radarSweep', 'radarSweep'] }), false, false, false);
    expect(stacked?.options[0].name).toBe(fresh?.options[0].name);
    expect(stacked?.options[0].stack).toBe(2);
    expect(stacked?.options[0].tier).toBe('II → III');
  });

  // Story 7-5 wave 1 dropped the verb cards from `exclusive` to `rare` when they
  // stopped being either/or, and WAVE 2 deleted the cannon pair — the last
  // EXCLUSIVE line in the catalog. So no SHIPPED line carries that tier today;
  // the label itself is still supported and pinned in boonCopy.test.ts, and the
  // DOM row below still renders one from a hand-built card.
  it('carries the KIND word, neutral and unconditional, on every card', () => {
    const view = offerView(ownShip({ offer: ['radarSweep', 'deckGunTurret', 'captiveMines', 'acousticHoming'] }), false, false, false);
    expect(view?.options.map((o) => o.kind)).toEqual(['UPGRADE', 'UPGRADE', 'WEAPON', 'ADD-ON']);
  });

  it('carries the ladder length and the copies held — the rungs and their fill', () => {
    const held = ['radarSweep', 'radarSweep', 'radarSweep'];
    const view = offerView(ownShip({ offer: ['radarSweep', 'deckGunTurret'], cards: held }), false, false, false);
    expect(view?.options[0].stack).toBe(3);
    expect(view?.options[0].cap).toBe(5);
    expect(view?.options[1].stack).toBe(0);
    expect(view?.options[1].cap).toBe(1);
  });

  it('draws NO ladder for a consumable or an add-on — they have no rungs', () => {
    const view = offerView(ownShip({ offer: ['hullRepair', 'acousticHoming', 'radarSweep'] }), false, false, false);
    expect(view?.options[0].tier).toBeNull();
    expect(view?.options[0].tierStep).toBeNull();
    expect(view?.options[1].tier).toBeNull();
    expect(view?.options[2].tier).not.toBeNull();
  });

  // THE DOCTRINE-SWAP PIN IS RETIRED (Story 7-5 wave 2, R2.6). Amendment 44's
  // free swap needed an exclusive PAIR, and the cannon's was the last one in the
  // game; `CatalogLine.exclusiveWith` left the type with it, so an OfferCard has no
  // `replaces` field for a card to carry.

  it('prints ROWS with the player\'s LIVE values (a preview diff, not a static table)', () => {
    const fresh = offerView(ownShip({ offer: ['radarSweep'] }), false, false, false);
    const stacked = offerView(ownShip({ offer: ['radarSweep'], cards: ['radarSweep'] }), false, false, false);
    expect(fresh?.options[0].rows[0].label).toBe('RADAR SWEEP');
    expect(fresh?.options[0].rows[0].next).toContain('RPM');
    expect(stacked?.options[0].rows[0].cur).not.toBe(fresh?.options[0].rows[0].cur);
  });

  it('resolves the card face against the OWN CLASS too (hull stats differ per class)', () => {
    const tb = offerView(ownShip({ offer: ['armor'] }), false, false, false);
    const bb = offerView(ownShip({ cls: 'battleship', offer: ['armor'] }), false, false, false);
    expect(bb?.options[0].rows[0].cur).not.toBe(tb?.options[0].rows[0].cur);
  });

  // FINDING A (spend latch): `locked` is threaded straight through from the
  // caller (main.ts's spendInFlight) — offerView stays pure, it just carries
  // the flag into the view so the DOM adapter can dim/inert the cards.
  it('carries the caller-supplied `locked` flag straight through', () => {
    expect(offerView(ownShip(), false, true, false)?.locked).toBe(true);
    expect(offerView(ownShip(), false, false, false)?.locked).toBe(false);
  });
});

// --- DOM adapter -----------------------------------------------------------------

describe('UpgradeMenu — DOM adapter (the TAB-toggled band)', () => {
  beforeEach(() => document.body.replaceChildren());
  afterEach(() => settings.set({ motion: 'full' }));

  // THE RATIFIED FACE's OfferCard (Story 8.7, ruling 11): the icon box, the
  // name, the cap-rung ladder with its `cur → next` numerals, the KIND word, up
  // to five live stat rows and the foot. No description, no lineage handrail,
  // no copy count — those went with the interim face.
  const cardsOf = (ids: readonly string[]): OfferCard[] =>
    ids.map((id) => ({
      id,
      kind: boonKindLabel(CATALOG[id].kind),
      name: boonName(id, 0),
      tier: cardTierLabel(CATALOG[id], 0),
      tierStep: cardTierSteps(CATALOG[id], 0),
      rows: cardStatRows(CATALOG[id], 0, { cls: 'torpedoBoat', cards: [] }),
      tooltip: boonTooltipText(id),
      greyed: false,
      stack: 0,
      cap: CATALOG[id].cap,
    }));

  const view = (over: Partial<OfferView> = {}): OfferView => ({
    pts: 1, options: cardsOf(OFFER), locked: false, redraw: 'hidden', ...over,
  });

  /** The CARDS — scoped to the row, deliberately: the panel also holds the pip
   *  strip and the one hover tooltip, neither of which is a card. */
  function cards(): HTMLButtonElement[] {
    return [...document.querySelectorAll('#upgrade-menu > div:nth-child(2) button')] as HTMLButtonElement[];
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

  // THE RATIFIED FACE, TOP-DOWN (Story 8.7, ruling 11 — mock `.rc`): key chip
  // (outside the clipped body, pinned first) · 40px icon box · name · ladder ·
  // KIND word · five 17px rows · foot. No prose anywhere on it.
  it('builds the ratified face in the mock\'s own DOM order', () => {
    const menu = new UpgradeMenu(() => {});
    menu.toggle(view());
    const card = cards()[0];
    expect((card.firstElementChild as HTMLElement).textContent).toBe('1'); // key chip
    const body = card.lastElementChild as HTMLElement;
    const kids = [...body.children] as HTMLElement[];
    expect(kids).toHaveLength(6);
    expect(kids[0].style.width).toBe(`${R.iconBox}px`);        // icon box
    expect(kids[1].textContent).toBe(boonName(OFFER[0], 0));   // name
    expect(kids[2].style.height).toBe(`${R.ladderH}px`);       // ladder row
    expect(kids[3].textContent).toBe(boonKindLabel(CATALOG[OFFER[0]].kind));
    expect(kids[4].style.display).toBe('grid');                // the five-row grid
    expect(kids[5].style.height).toBe(`${R.footH}px`);         // foot, blank at rest
    expect(kids[5].textContent).toBe('');
  });

  it('always renders EXACTLY five rows, blank past the end of the card\'s stats', () => {
    const menu = new UpgradeMenu(() => {});
    // radarSweep moves ONE number, so four of its five rows are ruled blanks.
    menu.toggle(view({ options: cardsOf(['radarSweep']) }));
    const grid = (cards()[0].lastElementChild as HTMLElement).children[4] as HTMLElement;
    expect(grid.children).toHaveLength(R.rowCount);
    expect(grid.style.gridTemplateRows).toBe(`repeat(${R.rowCount}, ${R.rowH}px)`);
    expect((grid.children[0] as HTMLElement).textContent).toContain('RADAR SWEEP');
    for (let i = 1; i < R.rowCount; i += 1) {
      expect((grid.children[i] as HTMLElement).textContent, `row ${i}`).toBe('');
    }
  });

  it('carries NO prose on the face — the explanation is hover-only (R2.17)', () => {
    const menu = new UpgradeMenu(() => {});
    menu.toggle(view({ options: cardsOf(['heavyTorpedo']) }));
    const text = cards()[0].textContent ?? '';
    expect(text).not.toContain(boonTooltipText('heavyTorpedo').slice(0, 20));
    expect(text).not.toMatch(/[a-z]{4}/); // no lowercase word: the face is all caps + numbers
  });

  // --- Story 2.8 card anatomy ---------------------------------------------------
  //
  // The card face grew three CONDITIONAL lines. The digit chip stays the FIRST
  // span in every card (pinned above and re-pinned here against the new lines):
  // the whole 1-4 spatial mapping is read off it.
  // THE META ROW IS UNCONDITIONAL AND NEUTRAL (Eric ruling 2026-09-15,
  // amendment 8). The v2 RARE / EXCLUSIVE tag and its two tier colours are
  // deleted with the rarity axis; every card now states its KIND as a word and
  // its copy count, both in the secondary-text token.
  it('renders the kind WORD on EVERY card, in the neutral token', () => {
    const menu = new UpgradeMenu(() => {});
    menu.toggle(view({
      options: [
        { ...cardsOf(['radarSweep'])[0] },
        { ...cardsOf(['deckGunTurret'])[0] },
        { ...cardsOf(['captiveMines'])[0] },
      ],
    }));
    const [ladder, single, weapon] = cards();
    expect(ladder.textContent).toContain('UPGRADE');
    expect(single.textContent).toContain('UPGRADE');
    expect(weapon.textContent).toContain('WEAPON');
    // No tier hue anywhere: not on the border (that channel belongs to the
    // armed edge and the denied pulse) and not on any span.
    for (const b of cards()) {
      expect(b.style.borderColor).not.toBe('var(--hc-info)');
      const colors = [...b.querySelectorAll('span')].map((el) => (el as HTMLElement).style.color);
      expect(colors).not.toContain('var(--hc-info)');
      expect(colors).not.toContain('var(--hc-storm-readout)');
      expect(colors).toContain('var(--hc-text-secondary)');
    }
  });

  it('draws one rung per copy the line carries, filled up to what is held', () => {
    const menu = new UpgradeMenu(() => {});
    menu.toggle(view({
      options: [
        { ...cardsOf(['radarSweep'])[0], stack: 2, tier: 'II → III', tierStep: { cur: 2, next: 3 } },
        { ...cardsOf(['hullRepair'])[0] },   // consumable: no ladder at all
        { ...cardsOf(['acousticHoming'])[0] }, // add-on: likewise
      ],
    }));
    const [stacked, consumable, addon] = cards();
    const ladderOf = (b: HTMLElement): HTMLElement => (b.lastElementChild as HTMLElement).children[2] as HTMLElement;
    // Five rungs (radarSweep's cap) plus the numerals span.
    expect(ladderOf(stacked).querySelectorAll('i')).toHaveLength(5);
    // The arrow's spacing is the mock's 3px margin, not literal spaces — so the
    // rendered text is tighter than the fit model's string, which is the safe
    // direction (the model over-measures by two blanks).
    expect(ladderOf(stacked).textContent).toBe('II→III');
    // BLANK for a consumable and an add-on — the row is still 16px tall, so
    // every card in the offer keeps one baseline.
    for (const b of [consumable, addon]) {
      expect(ladderOf(b).children).toHaveLength(0);
      expect(ladderOf(b).style.height).toBe(`${R.ladderH}px`);
    }
    // The chip is STILL the first span, with every mark in place.
    expect(cards().map((b) => b.querySelector('span')?.textContent)).toEqual(['1', '2', '3']);
  });

  it('re-renders when only the COPY moves (same ids, new rung after a spend)', () => {
    // The memo signature carries every rendered line, not just the ids: a queued
    // offer that slides in after a pick can carry the same line at a new rung.
    const menu = new UpgradeMenu(() => {});
    menu.toggle(view());
    const before = cards()[0].textContent;
    menu.update(view({ options: cardsOf(OFFER).map((c, i) => (i === 0 ? { ...c, name: 'HEAVY SHELLS Mk II', tier: 'II → III' } : c)) }));
    expect(cards()[0].textContent).not.toBe(before);
    expect(cards()[0].textContent).toContain('HEAVY SHELLS Mk II');
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

  // THE ANCHOR SCALES WITH THE CONTENTS (Story 8.6, epic-8 amendment 36) — the
  // pre-existing defect the cycle-47 review ledgered, closed by construction.
  //
  // `place()` lays the band out in LOGICAL units (physical / the live
  // `--hc-ui-scale` factor, exactly the units `hudBarLayout` works in) and then
  // converts ONLY the finished anchor back to CSS px. Because `PANEL_CSS` scales
  // about `transform-origin: top center`, writing `band.y * factor` to `top`
  // puts the rendered BOTTOM at `(band.y + band.h) * factor` = `(bar.y - barGap)
  // * factor` — the same `barGap` seam the Pixi bar is drawn with, at any tier.
  it('scales the band anchor with its contents, landing barGap above the scaled bar', () => {
    const menu = new UpgradeMenu(() => {});
    for (const factor of [0.9, 1, 1.25]) {
      setUiScaleVar(factor);
      menu.update(view()); // re-places while open
      if (!menu.visible) menu.toggle(view());
      const panel = document.getElementById('upgrade-menu')!;
      const logical = refitBandLayout(window.innerWidth / factor, window.innerHeight / factor);
      const bar = hudBarLayout(window.innerWidth / factor, window.innerHeight / factor).bar;
      expect(panel.style.top, `@${factor}`).toBe(`${logical.band.y * factor}px`);
      // The arithmetic the comment above claims, checked rather than asserted.
      const renderedBottom = Number.parseFloat(panel.style.top) + logical.band.h * factor;
      expect(renderedBottom, `@${factor}`).toBeCloseTo((bar.y - CLIENT_CONFIG.refit.barGap) * factor, 6);
      expect(renderedBottom, `@${factor}`).toBeLessThanOrEqual(window.innerHeight);
    }
    setUiScaleVar(1);
  });

  // TEXT MUST BE READABLE (epic-8 amendment 43). The band scales as ONE block,
  // so `place()` publishes the DOM twin of the bar's `microScale` as a custom
  // property on the band's root, and the two registers seated on the 9px mono
  // floor — the stat-row LABELS and the reason-word FOOT — divide their size by
  // the UI scale through it. Everything above the floor rides the geometry and
  // must NOT reference the property at all.
  it('publishes --hc-micro on the band root, at the bar\'s own law', () => {
    const menu = new UpgradeMenu(() => {});
    for (const factor of [0.9, 1, 1.25]) {
      setUiScaleVar(factor);
      if (!menu.visible) menu.toggle(view());
      else menu.update(view()); // re-places while open
      const panel = document.getElementById('upgrade-menu')!;
      const micro = Number.parseFloat(panel.style.getPropertyValue(MICRO_VAR));
      expect(micro, `@${factor}`).toBeCloseTo(domMicroScale(factor), 12);
    }
    setUiScaleVar(1);
    menu.hide();
  });

  it('counter-scales the LABEL and the FOOT through it, and nothing else', () => {
    const menu = new UpgradeMenu(() => {});
    const you = ownShip({ offer: ['decoyBuoy', 'radarSweep'] });
    const belt = [null, null, null, null, null, 'hullRepair', 'shieldBlock', 'smokeScreen', 'chaff'] as const;
    menu.toggle(offerView(you, false, false, false, belt)!);
    // The REFUSED card (decoyBuoy) is the one that prints a foot; the live card
    // beside it (radarSweep) is the one that prints a stat row.
    const foot = (cards()[0].lastElementChild as HTMLElement).lastElementChild as HTMLElement;
    const body = cards()[1].lastElementChild as HTMLElement;
    const [icon, name, ladder, kind, grid] = [...body.children] as HTMLElement[];
    const label = grid.children[0].firstElementChild as HTMLElement;
    const value = grid.children[0].lastElementChild as HTMLElement;
    // The two registers ON the floor divide their size (and their tracking).
    for (const [what, el] of [['label', label], ['foot', foot]] as const) {
      expect(el.style.fontSize, what).toContain(`var(${MICRO_VAR}`);
      expect(el.style.letterSpacing, what).toContain(`var(${MICRO_VAR}`);
    }
    expect(foot.textContent).toBe(SLOTS_FULL); // the foot really is printing
    expect(label.textContent).not.toBe('');    // ...and so is the label
    // ...and every register above the floor is untouched by it.
    const chip = cards()[1].firstElementChild as HTMLElement;
    for (const [what, el] of [['name', name], ['kind', kind], ['value', value], ['chip', chip],
      ['icon', icon], ['ladder', ladder]] as const) {
      expect(el.style.cssText, what).not.toContain(MICRO_VAR);
    }
    menu.hide();
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

  // STORY 2.7 REVIEW — a HIDDEN band never pulses. The latch outlives the
  // window: the player can TAB the band closed (or die, force-hiding it through
  // update(null)) while a spend is still in flight, and the 1.5s timeout then
  // fires a denied verdict at a panel nobody is looking at. Painting it would
  // both do nothing AND burn the 300ms same-source floor.
  it('pulseDenied is inert while the band is hidden — and burns no same-source floor', () => {
    const menu = new UpgradeMenu(() => {});
    menu.toggle(view()); // open
    menu.hide(); // TAB close / you-gone force-hide, spend still in flight
    menu.pulseDenied(1, 1000); // the 1.5s timeout lands here
    expect(menu.deniedActive(1000)).toBe(false);
    expect(cards()[1].style.borderColor).not.toBe('var(--hc-denied)');
    // The floor was never consumed: a genuine denial in the REOPENED band
    // flashes immediately instead of being swallowed as a repeat.
    menu.toggle(view());
    menu.pulseDenied(1, 1000 + 1);
    expect(menu.deniedActive(1000 + 1)).toBe(true);
    expect(cards()[1].style.borderColor).toBe('var(--hc-denied)');
  });

  it('closing the band drops a LIT denied edge (a reopened band starts at rest)', () => {
    const menu = new UpgradeMenu(() => {});
    menu.toggle(view());
    menu.pulseDenied(1, 1000);
    expect(cards()[1].style.borderColor).toBe('var(--hc-denied)');
    menu.hide(); // closed mid-pulse — the 80ms timeout no-ops afterwards
    menu.toggle(view()); // same view signature: the SAME buttons are reused
    expect(menu.deniedActive(1000)).toBe(false);
    expect(cards()[1].style.borderColor).not.toBe('var(--hc-denied)');
  });

  // --- the flash-budget claim (Story 4.8 wave 2c) ---------------------------
  //
  // `pulseDenied` claims `FLASH_ELEMENTS.refitDenied` only for a denial that
  // survives every existing gate (shown, motion, the 300ms same-source floor).
  // A 'degrade' verdict must never delete the mark: the border still snaps to
  // the denied color for the pulse's full life; only the box-shadow glow drops
  // to its flat rest value ('none', same vocabulary as paintCard).

  describe('the flash-budget claim on pulseDenied', () => {
    const fakeBudget = (verdict: FlashVerdict): FlashBudget => ({
      claim: () => verdict,
      coalesce: () => true,
      reset: () => {},
    });

    it("claims FLASH_ELEMENTS.refitDenied, at the call's own nowMs, only for an accepted denial", () => {
      const claims: Array<[string, number]> = [];
      const budget: FlashBudget = {
        claim: (key, nowMs) => {
          claims.push([key, nowMs]);
          return 'animate';
        },
        coalesce: () => true,
        reset: () => {},
      };
      const menu = new UpgradeMenu(() => {}, budget);
      menu.toggle(view());
      menu.pulseDenied(0, 1000);
      expect(claims).toEqual([[FLASH_ELEMENTS.refitDenied, 1000]]);
    });

    it('a DEGRADED denial still marks the CARD as denied — border set, glow flattened', () => {
      const menu = new UpgradeMenu(() => {}, fakeBudget('degrade'));
      menu.toggle(view());
      menu.pulseDenied(2, 1000);
      expect(menu.deniedActive(1000)).toBe(true); // still counts as lit
      expect(cards()[2].style.borderColor).toBe('var(--hc-denied)'); // still marked denied
      expect(cards()[2].style.boxShadow).toBe('none'); // the flat state: no glow
    });

    it('under-budget (animate) renders the full glow — byte-identical to today', () => {
      const menu = new UpgradeMenu(() => {}, fakeBudget('animate'));
      menu.toggle(view());
      menu.pulseDenied(1, 1000);
      expect(cards()[1].style.borderColor).toBe('var(--hc-denied)');
      expect(cards()[1].style.boxShadow).toContain('var(--hc-denied)');
    });

    it('behaves exactly as today when no budget instance is supplied', () => {
      const menu = new UpgradeMenu(() => {}); // no budget arg at all
      menu.toggle(view());
      menu.pulseDenied(1, 1000);
      expect(menu.deniedActive(1000)).toBe(true);
      expect(cards()[1].style.borderColor).toBe('var(--hc-denied)');
      expect(cards()[1].style.boxShadow).toContain('var(--hc-denied)');
    });

    it('the 300ms same-source floor and motion:off still gate BEFORE the budget is ever consulted', () => {
      const claims: number[] = [];
      const budget: FlashBudget = {
        claim: (_key, nowMs) => {
          claims.push(nowMs);
          return 'animate';
        },
        coalesce: () => true,
        reset: () => {},
      };
      const menu = new UpgradeMenu(() => {}, budget);
      menu.toggle(view());
      menu.pulseDenied(0, 1000);
      // Inside the 300ms floor: gated before the budget is ever asked.
      menu.pulseDenied(1, 1000 + R.deniedFloorMs - 1);
      expect(claims).toEqual([1000]);
      expect(cards()[1].style.borderColor).not.toBe('var(--hc-denied)');
      settings.set({ motion: 'off' });
      try {
        // motion:off: gated before the budget is ever asked, same as always.
        menu.pulseDenied(2, 1000 + R.deniedFloorMs);
        expect(claims).toEqual([1000]);
        expect(cards()[2].style.borderColor).not.toBe('var(--hc-denied)');
      } finally {
        settings.reset();
      }
    });
  });

  // --- THE COUNTDOWN FOOTER (Story 8.10, epic-8 amendment 60) -------------------
  //
  // ONE button under the row, countdown only, with the "once" pip beside the
  // word. It is NOT a fifth card: it lives in its own block AFTER the row, so
  // the row stays exactly the four cards every digit and every existing pin
  // addresses.
  describe('the REDRAW button', () => {
    const redrawBtn = (): HTMLButtonElement | null =>
      document.getElementById('refit-redraw') as HTMLButtonElement | null;
    const footer = (): HTMLElement => document.querySelector('#upgrade-menu > div:nth-child(3)') as HTMLElement;
    const pip = (): HTMLElement => redrawBtn()!.querySelector('i') as HTMLElement;

    it('is ABSENT from the band off the start line, and present during the countdown', () => {
      const menu = new UpgradeMenu(() => {});
      menu.toggle(view()); // redraw: 'hidden' — live water
      expect(footer().style.display).toBe('none');
      menu.update(view({ redraw: 'unspent' }));
      expect(footer().style.display).toBe('flex');
      expect(redrawBtn()!.textContent).toBe(REDRAW_WORD);
    });

    it('leaves the ROW at exactly four card buttons (it is not a fifth pick)', () => {
      const spends: number[] = [];
      const menu = new UpgradeMenu((c) => spends.push(c));
      menu.toggle(view({ redraw: 'unspent' }));
      expect(cards()).toHaveLength(4); // the positional selector still counts 4
      expect(pips()).toHaveLength(1);
      expect(redrawBtn()!.parentElement).not.toBe(cards()[0].parentElement);
      redrawBtn()!.click();
      expect(spends).toEqual([]); // a REDRAW is never a card spend
    });

    it('routes its click to the onRedraw hook, once per press, and never keeps focus', () => {
      let presses = 0;
      const menu = new UpgradeMenu(() => {}, undefined, () => (presses += 1));
      menu.toggle(view({ redraw: 'unspent' }));
      redrawBtn()!.click();
      expect(presses).toBe(1);
      expect(document.activeElement).not.toBe(redrawBtn());
    });

    it('draws the pip HOLLOW while unspent and FILLED once spent, and goes inert', () => {
      const menu = new UpgradeMenu(() => {}, undefined, () => {});
      menu.toggle(view({ redraw: 'unspent' }));
      expect(pip().style.backgroundColor).toBe('transparent');
      expect(redrawBtn()!.disabled).toBe(false);
      menu.update(view({ redraw: 'spent' }));
      // Dual-coded: the pip FILLS (at full alpha — it is the answer) while the
      // label dims and the control really is disabled, not merely dimmed.
      expect(pip().style.backgroundColor).toBe('var(--hc-amber)');
      expect(pip().style.borderColor).toBe('var(--hc-amber)');
      expect(redrawBtn()!.disabled).toBe(true);
      expect(redrawBtn()!.style.cursor).toBe('default');
      expect(redrawBtn()!.style.color).not.toBe('var(--hc-amber)');
    });

    // THE ROW'S LOCK REACHES THE BUTTON (the 8.10 review, P5). A spend in
    // flight disables and dims every card; a REDRAW that stayed bright and
    // clickable inside that locked row invited a second send the latch drops
    // on the floor, with no feedback and no pulse.
    it('is DISABLED and dimmed exactly like the cards while the row is locked', () => {
      const menu = new UpgradeMenu(() => {}, undefined, () => {});
      menu.toggle(view({ redraw: 'unspent' }));
      expect(redrawBtn()!.disabled).toBe(false);

      menu.update(view({ redraw: 'unspent', locked: true }));

      expect(redrawBtn()!.disabled).toBe(true);
      expect(redrawBtn()!.style.cursor).toBe('default');
      expect(redrawBtn()!.style.opacity).toBe(String(R.lockedAlpha)); // the cards' own dim
      for (const c of cards()) expect(c.disabled).toBe(true); // ...the same treatment
      // The PIP is untouched: it reports whether the free redraw is still there
      // to spend, which a momentary lock does not change.
      expect(pip().style.backgroundColor).toBe('transparent');

      menu.update(view({ redraw: 'unspent' })); // the latch released
      expect(redrawBtn()!.disabled).toBe(false);
      expect(redrawBtn()!.style.cursor).toBe('pointer');
      expect(redrawBtn()!.style.opacity).toBe('1');
    });

    it('stays disabled when a SPENT redraw is also locked, with the pip still filled', () => {
      const menu = new UpgradeMenu(() => {}, undefined, () => {});
      menu.toggle(view({ redraw: 'spent', locked: true }));
      expect(redrawBtn()!.disabled).toBe(true);
      expect(pip().style.backgroundColor).toBe('var(--hc-amber)');
    });

    it('takes the amber denied pulse on a refused redraw, and drops it back', () => {
      const menu = new UpgradeMenu(() => {}, undefined, () => {});
      menu.toggle(view({ redraw: 'unspent' }));
      menu.pulseDenied(MULLIGAN_CHOICE, 1000);
      expect(menu.deniedActive(1000)).toBe(true);
      expect(redrawBtn()!.style.borderColor).toBe('var(--hc-denied)');
      menu.hide(); // the close drops every lit edge (cards and button alike)
      expect(redrawBtn()!.style.borderColor).toBe('var(--hc-amber)');
    });

    it('rides the GEOMETRY, never the 9px floor: no --hc-micro anywhere on it', () => {
      const menu = new UpgradeMenu(() => {}, undefined, () => {});
      menu.toggle(view({ redraw: 'unspent' }));
      // 12px mono is well clear of the readable floor (amendment 43), so the
      // footer must not counter-scale — only the LABEL and the FOOT do.
      expect(footer().style.cssText).not.toContain(MICRO_VAR);
      expect(redrawBtn()!.style.cssText).not.toContain(MICRO_VAR);
      expect(pip().style.cssText).not.toContain(MICRO_VAR);
      // 12px, read off the SHORTHAND (jsdom keeps `style.font` verbatim but
      // does not decompose a var()-carrying shorthand into `style.fontSize`) —
      // and the shorthand is what the mock and every other register here use.
      expect(redrawBtn()!.style.font).toBe('600 12px var(--hc-font-mono)');
      expect(redrawBtn()!.style.letterSpacing).toBe('0.18em');
    });

    it('GOES when the water goes live, with the window still open (the row drops back)', () => {
      const menu = new UpgradeMenu(() => {}, undefined, () => {});
      menu.toggle(view({ redraw: 'unspent' }));
      expect(footer().style.display).toBe('flex');
      menu.update(view({ redraw: 'hidden' })); // countdown → active, window untouched
      expect(menu.visible).toBe(true);
      expect(footer().style.display).toBe('none');
    });

    it('TAB takes it with the window (the footer lives INSIDE the panel)', () => {
      const menu = new UpgradeMenu(() => {}, undefined, () => {});
      menu.toggle(view({ redraw: 'unspent' }));
      expect(footer().closest('#upgrade-menu')).not.toBeNull();
      menu.toggle(view({ redraw: 'unspent' })); // TAB again — closes
      expect(menu.visible).toBe(false);
      expect(document.getElementById('upgrade-menu')!.style.display).toBe('none');
      menu.toggle(view({ redraw: 'unspent' })); // ...and TAB brings it back
      expect(menu.visible).toBe(true);
      expect(footer().style.display).toBe('flex');
    });
  });
});

// --- THE OPENING's two pure rules (Story 8.10) ----------------------------------

describe('shouldAutoOpen — the window opens itself once per match (amendment 59)', () => {
  const at = (over: Partial<Parameters<typeof shouldAutoOpen>[0]> = {}) =>
    shouldAutoOpen({ latched: false, phase: 'countdown', visible: false, hasOffer: true, ...over });

  it('opens on the first countdown frame that carries an offer', () => {
    expect(at()).toBe(true);
  });

  it('never opens twice: the latch is "not yet THIS match", not a numeric rise', () => {
    expect(at({ latched: true })).toBe(false);
  });

  it('opens for a RECONNECT whose very first frame already reads pts 1', () => {
    // There is no edge to see — the offer is simply there — which is exactly
    // why the rule is a latch over the epoch and not a rise over `pts`.
    expect(at({ latched: false })).toBe(true);
  });

  it('never opens off the countdown, over an open window, or with nothing to show', () => {
    expect(at({ phase: 'waiting' })).toBe(false);
    expect(at({ phase: 'active' })).toBe(false);
    expect(at({ visible: true })).toBe(false);
    expect(at({ hasOffer: false })).toBe(false);
  });
});

describe('mulliganLanded — the redraw ack rule (amendment 60)', () => {
  const latch = (over: Partial<SpendLatch> = {}): SpendLatch => ({
    pts: 1, offerSig: OFFER.join(','), at: 1000, choice: MULLIGAN_CHOICE, acked: false, ...over,
  });
  const you = (over: Partial<Pick<OwnShip, 'pts' | 'offer'>> = {}) => ({ pts: 1, offer: [...OFFER], ...over });
  const soon = 1000 + SPEND_LATCH_TIMEOUT_MS / 2;
  const late = 1000 + SPEND_LATCH_TIMEOUT_MS + 1;

  it('lands when the FRONT OFFER changes at an unchanged bank (the redraw costs nothing)', () => {
    expect(mulliganLanded(latch(), you({ offer: [...OFFER_B] }), soon)).toBe(true);
  });

  it('is still PENDING while the offer has not moved', () => {
    expect(mulliganLanded(latch(), you(), soon)).toBe(false);
  });

  it('does NOT land on the timeout — nothing moved, so the redraw was refused', () => {
    expect(mulliganLanded(latch(), you(), late)).toBe(false);
  });

  it('is only ever about a MULLIGAN latch — a card pick never fills the pip', () => {
    expect(mulliganLanded(latch({ choice: 2 }), you({ offer: [...OFFER_B] }), soon)).toBe(false);
  });

  // THE BANK MUST NOT MOVE (the 8.10 review, P4). `spendOutcome` calls a pts
  // DROP a success, because for a card pick it is one. A redraw that cost a
  // level did not land — it is a pick the server processed, or a desync — and
  // filling the pip on it would swallow the evidence and eat the free redraw.
  it('does NOT land when the BANK DROPPED, even though the latch released', () => {
    // The signature is unchanged, so the only release clause is `pts <`.
    expect(mulliganLanded(latch(), you({ pts: 0 }), soon)).toBe(false);
  });

  it('does not land on a bank drop that ALSO changed the offer', () => {
    expect(mulliganLanded(latch(), you({ pts: 0, offer: [...OFFER_B] }), soon)).toBe(false);
  });

  it('lands on a changed SIGNATURE at an unchanged bank, the redraw\'s one real signal', () => {
    expect(mulliganLanded(latch(), you({ pts: 1, offer: [...OFFER_B] }), soon)).toBe(true);
  });

  it('a server RECEIPT still outranks the inference, as it does for a pick', () => {
    expect(mulliganLanded(latch({ acked: true }), you(), soon)).toBe(true);
  });

  it('a vanished own ship is never an ack', () => {
    expect(mulliganLanded(latch(), null, soon)).toBe(false);
    expect(mulliganLanded(latch(), undefined, late)).toBe(false);
  });
});

// --- the spend GATE (main.ts's trySpend, as a pure predicate) --------------------

describe('canLatchSpend — what may be sent and latched', () => {
  const latch = (): SpendLatch => ({ pts: 1, offerSig: OFFER.join(','), at: 1000, choice: 0, acked: false });
  const you = { pts: 1, offer: [...OFFER] };

  it('allows a pick with an own ship and nothing in flight', () => {
    expect(canLatchSpend(null, you)).toBe(true);
  });

  it('refuses a SECOND pick while one is in flight (the FINDING A rule)', () => {
    expect(canLatchSpend(latch(), you)).toBe(false);
  });

  // STORY 2.7 REVIEW: a click can land in the gap between the frame that dropped
  // `you` (death/spectate) and the rAF that hides the band. Latching there
  // snapshots pts:0 / an empty signature against a `you` that stays null, so no
  // release clause can EVER fire on state — the latch is guaranteed to sit until
  // the 1.5s timeout and report 'failed', pulsing a card for a spend that was
  // never spendable. Drop the pick instead.
  it('refuses a pick with NO own ship in the mirror (the death-gap click)', () => {
    expect(canLatchSpend(null, null)).toBe(false);
    expect(canLatchSpend(null, undefined)).toBe(false);
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
    pts: 1, offerSig: OFFER.join(','), at: 1000, choice: 0, acked: false, ...over,
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

  // STORY 2.7 REVIEW — the `bn` ack extends the predicate (it never rewrites it):
  // with acked:false every clause above is byte-for-byte the 2.6 rule; acked:true
  // releases on the server's own receipt, no inference required.
  it('releases on the SERVER ACK even when nothing about `you` moved at all', () => {
    expect(spendLatchReleased(latch({ acked: true }), you(), soon)).toBe(true);
  });

  it('releases on the ack through a passive bank that masked the pts drop', () => {
    // The degenerate corner: the spend landed AND a level banked in the same
    // frame (pts back to its snapshot value) AND the re-rolled offer carries
    // identical ids (unchanged signature). Nothing observable in `you` moved.
    expect(spendLatchReleased(latch({ acked: true }), you({ pts: 1 }), soon)).toBe(true);
    // Same state WITHOUT the ack still HOLDS — the old semantics, unregressed.
    expect(spendLatchReleased(latch(), you({ pts: 1 }), soon)).toBe(false);
  });

  it('signs the FRONT OFFER ALONE — pts is deliberately not in the signature', () => {
    expect(frontOfferSignature(you())).toBe(OFFER.join(','));
    expect(frontOfferSignature(you({ pts: 9 }))).toBe(frontOfferSignature(you({ pts: 1 })));
    expect(frontOfferSignature(null)).toBe('');
  });
});

describe('spendOutcome — the stay-open state machine classifier (amendment 36)', () => {
  const latch = (over: Partial<SpendLatch> = {}): SpendLatch => ({
    pts: 1, offerSig: OFFER.join(','), at: 1000, choice: 2, acked: false, ...over,
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

  // STORY 2.7 REVIEW — THE DEGENERATE CORNER. A spend LANDS, a passive bank
  // lands in the same frame (pts back to the snapshot value), and the freshly
  // rolled offer happens to carry the SAME ids (unchanged front signature). No
  // inference off `you` can see that spend. Before the `bn` ack the latch held
  // to the 1.5s timeout and classified 'failed' — firing the denied pulse on a
  // spend the player had ALREADY been told succeeded by the ◆ FITTED toast.
  it('SUCCESS on the ack when pts and the front signature are both unchanged', () => {
    const acked = latch({ acked: true });
    expect(spendOutcome(acked, you(), soon)).toBe('success');
    // ...and therefore never a denied pulse: main.ts pulses on 'failed' only.
    expect(spendOutcome(acked, you(), soon)).not.toBe('failed');
    // Without the ack the SAME state is 'pending' (held), then 'failed' at the
    // timeout — the pre-fix behavior this patch exists to correct.
    expect(spendOutcome(latch(), you(), soon)).toBe('pending');
    expect(spendOutcome(latch(), you(), late)).toBe('failed');
  });

  it('the ack outranks every inference: success even past the timeout / with pts UP', () => {
    expect(spendOutcome(latch({ acked: true }), you({ pts: 2 }), soon)).toBe('success');
    expect(spendOutcome(latch({ acked: true }), you(), late)).toBe('success');
    expect(spendOutcome(latch({ acked: true }), null, soon)).toBe('success');
  });

  it('never disagrees with spendLatchReleased about WHEN the latch clears', () => {
    const cases: [SpendLatch, ReturnType<typeof you> | null, number][] = [
      [latch(), you(), soon],
      [latch(), you({ pts: 2 }), soon],
      [latch({ pts: 2 }), you({ pts: 1 }), soon],
      [latch(), you({ offer: [...OFFER_B] }), soon],
      [latch(), you(), late],
      [latch(), null, soon],
      [latch({ acked: true }), you(), soon],
      [latch({ acked: true }), you({ pts: 2 }), soon],
      [latch({ acked: true }), null, late],
    ];
    for (const [l, y, t] of cases) {
      expect(spendOutcome(l, y, t) === 'pending').toBe(!spendLatchReleased(l, y, t));
    }
  });
});

// --- THE GREYED CARD (Story 8.7, ruling 10 / UX-DR52) ---------------------------
//
// A consumable the belt cannot take is refused BEFORE the press, not after it.
// The server would return false with no mutation and no event, so a client that
// sent the pick anyway would sit through a 1.5s latch timeout and then fire a
// denied pulse for a refusal it could have known about. Instead the card is
// greyed the moment the offer resolves, and its digit and its click send
// nothing at all.
//
// DUAL-CODED, three ways, because the dim alone is hue/lightness only: the face
// dims to `greyedAlpha`, the key chip goes DASHED, and the foot carries the
// boxed reason word.

describe('the greyed card — a refusal stated before the press', () => {
  beforeEach(() => document.body.replaceChildren());

  /** The four belt slots, holding four DISTINCT consumable lines — a full belt. */
  const FULL_BELT = [null, null, null, null, null, 'hullRepair', 'shieldBlock', 'smokeScreen', 'chaff'] as const;
  /** The same belt with one square free. */
  const ROOM_LEFT = [null, null, null, null, null, 'hullRepair', null, null, null] as const;

  function cards(): HTMLButtonElement[] {
    return [...document.querySelectorAll('#upgrade-menu > div:nth-child(2) button')] as HTMLButtonElement[];
  }

  it('greys ONLY a consumable, and only when the belt cannot take it', () => {
    // A fifth distinct line has nowhere to go.
    expect(cardGreyed(CATALOG.decoyBuoy, FULL_BELT)).toBe(true);
    // A line the belt ALREADY holds always fits — the stack just grows.
    expect(cardGreyed(CATALOG.hullRepair, FULL_BELT)).toBe(false);
    // With a square free, anything fits.
    expect(cardGreyed(CATALOG.decoyBuoy, ROOM_LEFT)).toBe(false);
    // No other KIND can ever be refused: a ladder lands on the hull, a weapon
    // on a weapon slot, an add-on on a verb.
    for (const id of ['radarSweep', 'heavyTorpedo', 'acousticHoming']) {
      expect(cardGreyed(CATALOG[id], FULL_BELT), id).toBe(false);
    }
  });

  it('carries the flag onto the OfferCard, through the same shared predicate', () => {
    const you = ownShip({ offer: ['decoyBuoy', 'hullRepair', 'radarSweep', 'acousticHoming'] });
    const view = offerView(you, false, false, false, FULL_BELT);
    expect(view?.options.map((o) => o.greyed)).toEqual([true, false, false, false]);
    // ...and with room on the belt nothing is greyed.
    expect(offerView(you, false, false, false, ROOM_LEFT)?.options.map((o) => o.greyed))
      .toEqual([false, false, false, false]);
  });

  it('renders the refusal three ways: dimmed face, DASHED chip, boxed SLOTS FULL', () => {
    const menu = new UpgradeMenu(() => {});
    const you = ownShip({ offer: ['decoyBuoy', 'radarSweep'] });
    menu.toggle(offerView(you, false, false, false, FULL_BELT)!);
    const [refused, ok] = cards();
    expect(refused.style.opacity).toBe(String(R.greyedAlpha));
    expect((refused.firstElementChild as HTMLElement).style.borderStyle).toBe('dashed');
    const foot = (refused.lastElementChild as HTMLElement).lastElementChild as HTMLElement;
    expect(foot.textContent).toBe(SLOTS_FULL);
    // The reason word rides `silver` at FULL alpha so it still reads through the
    // dim — the whole point of a non-colour channel.
    expect(foot.style.color).toBe('var(--hc-silver)');
    expect(foot.style.borderStyle).toBe('solid');
    // ...and an ordinary card carries none of it.
    expect(ok.style.opacity).toBe('');
    expect((ok.firstElementChild as HTMLElement).style.borderStyle).toBe('solid');
    expect(((ok.lastElementChild as HTMLElement).lastElementChild as HTMLElement).textContent).toBe('');
    menu.hide();
  });

  it('sends NOTHING on a greyed card\'s click — no spend, and no denied pulse', () => {
    const spends: number[] = [];
    const menu = new UpgradeMenu((c) => spends.push(c));
    const you = ownShip({ offer: ['decoyBuoy', 'radarSweep'] });
    menu.toggle(offerView(you, false, false, false, FULL_BELT)!);
    cards()[0].click();
    expect(spends).toEqual([]);
    expect(menu.deniedActive()).toBe(false); // the refusal is already on screen
    // The live card beside it still spends, so the guard is the GREY, not the row.
    cards()[1].click();
    expect(spends).toEqual([1]);
    menu.hide();
  });

  it('is DISTINCT from the spend-latch dim — a refusal must stay readable', () => {
    expect(R.greyedAlpha).toBeGreaterThan(R.lockedAlpha);
    const menu = new UpgradeMenu(() => {});
    const you = ownShip({ offer: ['decoyBuoy', 'radarSweep'] });
    // Locked dims the WHOLE row and genuinely disables it; greyed does neither.
    menu.toggle({ ...offerView(you, false, true, false, FULL_BELT)!, locked: true });
    for (const b of cards()) {
      expect(b.disabled).toBe(true);
      expect(b.style.opacity).toBe(String(R.lockedAlpha));
    }
    menu.hide();
  });
});
