// THE REFIT BAND (ui/upgradeMenu.ts, Story 2.7 — reworked from the Story 2.1
// text-column modal): the pure band GEOMETRY (refitBandLayout, measured against
// vitalsLayout/hotbarLayout at both ratified viewport floors), the pure
// offerView() truth table over BOON ids, the DOM adapter (four cards, digit
// chips 1–4, queue pips, ghost edge, click → onSpend choice, focus hygiene,
// stay-open live-swap, auto-hide, denied pulse), and the spend latch's
// release predicate + its new outcome classifier. jsdom.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BOON_CATALOG, CONFIG, HEAL_CHOICE, effectiveStats, resolveBoons, type OwnShip } from '@salvo/shared';
import {
  HEAL_LABEL,
  HEAL_STATUS_FULL,
  HEAL_STATUS_SUNK,
  SPEND_LATCH_TIMEOUT_MS,
  UpgradeMenu,
  canLatchSpend,
  frontOfferSignature,
  healReadout,
  healView,
  offerView,
  refitBandLayout,
  spendLatchReleased,
  spendOutcome,
  type OfferCard,
  type OfferView,
  type RefitBox,
  type SpendLatch,
} from '../ui/upgradeMenu.js';
import { refitStripInnerBox, refitStripMetrics } from '../ui/refitCardFit.js';
import { boonFitToastLine, boonName, boonTooltipText } from '../ui/boonCopy.js';
import { vitalsLayout } from '../render/hud.js';
import { hotbarLayout } from '../render/hotbar.js';
import { CLIENT_CONFIG } from '../config.js';
import { settings } from '../settings/store.js';
import { FLASH_ELEMENTS, type FlashBudget, type FlashVerdict } from '../render/flashBudget.js';

const R = CLIENT_CONFIG.refit;

/** A real four-LINE draw from the shipped Boon Catalog v1 (the deck draws four
 *  different card LINES — categories may repeat; these happen not to). */
const OFFER = ['intelSweep', 'shipHull', 'intelRange', 'mineBlast'];
const OFFER_B = ['shipCooldown', 'shipSpeed', 'intelSweep', 'mineBlast'];

function ownShip(over: Partial<OwnShip> = {}): OwnShip {
  return {
    id: 'me', x: 0, y: 0, heading: 0, speed: 0, hp: 80, alive: true,
    ammo: [], sweep: 0, cls: 'torpedoBoat', pts: 1, offer: [...OFFER],
    boostUntil: 0, boons: [], lvl: 0, xp: 0, repairHp: 0,
    ...over,
  };
}

/** The own hull's max HP through the SAME derivation the strip uses (the
 *  shared effectiveStats firewall) — never a literal, so a class retune can
 *  never leave these tests asserting a stale full-hull number. */
const maxHpOf = (cls: OwnShip['cls'], boons: readonly string[] = []): number =>
  effectiveStats(CONFIG.shipClasses[cls], resolveBoons([...boons])).maxHp;

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

  // --- THE DAMAGE CONTROL RAIL (cycle 46) --------------------------------------
  //
  // THE REGRESSION PIN THAT MATTERS MOST. The heal is a SIBLING of the row, not
  // a fifth card: the four cards stay 216px, the gaps stay 20px, the row stays
  // exactly 924px, and CONFIG.offer.size stays 4 — with the rail present. A
  // five-card row would be 1160px, leaving 60px of margin at the 1280×614
  // logical floor and superseding the ratified UX-DR14 geometry outright.
  it('leaves the four-card row BYTE-IDENTICAL with the rail present (the untouchable row)', () => {
    for (const { name, w, h } of FLOORS) {
      const L = refitBandLayout(w, h);
      expect(CONFIG.offer.size, name).toBe(4);
      expect(L.cards, name).toHaveLength(4);
      expect(L.row.w, name).toBe(4 * 216 + 3 * 20);
      expect(L.row.w, name).toBe(924);
      expect(L.row.h, name).toBe(236);
      for (const c of L.cards) {
        expect(c.w, name).toBe(216);
        expect(c.h, name).toBe(236);
        expect(c.y, name).toBe(L.row.y); // still ONE row, one baseline
      }
      for (let i = 1; i < L.cards.length; i += 1) {
        expect(L.cards[i].x - (L.cards[i - 1].x + 216), name).toBe(20);
      }
      // The row still derives from ONE anchor and the pips still hang a fixed
      // offset above it. CYCLE 47 moved that anchor (0.58 → 0.534) to buy the
      // rail its room — deliberately, by Eric ruling (amendment 65), which
      // reopened amendment 40's "no band lift" for exactly this. What the pin
      // above protects is unchanged and is the point: the row's SHAPE is
      // untouchable, its POSITION was the only thing that moved.
      expect(L.row.y, name).toBe(Math.round(h * R.bandTopFrac));
      expect(L.pips.y, name).toBe(L.row.y - R.pipsAbove);
    }
  });

  // THE FIVE-PIXEL BAND (cycle 47). The lifted anchor is wedged between two hard
  // constraints at the 1280×614 logical floor, and the whole geometry lives or
  // dies on both margins staying non-negative:
  //
  //   above — the own-hull keep-out:  band.y > h/2
  //   below — the container-fit law:  strip bottom ≤ h
  //
  // At that floor there are exactly five pixels of slack between them, so this
  // is pinned with the ACTUAL numbers rather than only as an inequality: a
  // future card-height, pip-offset, rail-height or anchor change that eats the
  // margin fails HERE, in arithmetic, instead of clipping off the bottom of
  // someone's laptop screen. The 1366×768 floor is comfortable and is pinned
  // alongside so the two are never accidentally tuned apart.
  it('keeps both floor margins non-negative at the lifted anchor', () => {
    const cases = [
      { name: '1366x768 @100%', w: 1366, h: 768 },
      { name: '1280x614 (125% logical floor)', w: 1280, h: 614 },
    ];
    for (const { name, w, h } of cases) {
      const L = refitBandLayout(w, h);
      const keepOut = L.band.y - h / 2; // > 0 or the band covers the own hull
      const bottom = h - (L.strip.y + L.strip.h); // ≥ 0 or the rail clips off
      expect(keepOut, `${name}: band ${-keepOut}px over the own-hull keep-out`).toBeGreaterThan(0);
      expect(bottom, `${name}: rail ${-bottom}px past the bottom edge`).toBeGreaterThanOrEqual(0);
    }
    // The floor case, to the pixel — 3px clear above, 4px clear below.
    const F = refitBandLayout(1280, 614);
    expect(F.row.y).toBe(328);
    expect(F.band.y).toBe(310); // 3px clear of the 307 keep-out
    expect(F.strip.y).toBe(570);
    expect(F.strip.y + F.strip.h).toBe(610); // 4px clear of the 614 edge
  });

  // THE SCALED-TIER FIT — the case the logical-floor pins above CANNOT see, and
  // the one that actually caught a real clip during the cycle-47 review.
  //
  // `place()` anchors the band from `window.innerHeight` in PHYSICAL pixels,
  // but the panel's contents are scaled by `--hc-ui-scale` about `top center`.
  // So at the 125% tier the band's real footprint is 1.25 × its laid-out height
  // hanging off an UNSCALED anchor — which is NOT what refitBandLayout(w/1.25,
  // h/1.25) models. The tier's own gate is width-only (`scaleGateWidthPx` 1600),
  // so a 1600×768 viewport can select 125% and is the binding case.
  //
  // This mismatch is a pre-existing defect (ledgered). What is pinned here is
  // the consequence that must stay legal regardless: the band, at every
  // committed scale tier, still ends inside the viewport.
  it('keeps the scaled band inside the viewport at every UI-scale tier', () => {
    const H = R.pipsAbove + R.cardHeight + R.stripGap + R.stripHeight;
    for (const { w, h } of [
      { w: 1600, h: 768 }, // the binding case — 125% is reachable here
      { w: 1600, h: 900 },
      { w: 1920, h: 1080 },
      { w: 1366, h: 768 }, // 125% gated off below 1600 wide, but 90%/100% apply
    ]) {
      const top = refitBandLayout(w, h).band.y;
      for (const tier of CLIENT_CONFIG.settings.scaleTiers) {
        const scale = tier / 100;
        if (scale > 1 && w < CLIENT_CONFIG.settings.scaleGateWidthPx) continue; // tier disabled
        const bottom = top + H * scale;
        expect(bottom, `${w}x${h} @${tier}%: band ${(bottom - h).toFixed(1)}px past the bottom`).toBeLessThanOrEqual(h);
      }
    }
  });

  // The rail must READ as choosable, which is a type-and-padding property, not a
  // box-size one (Eric, cycle 47: "big enough to actually register as 'this is
  // something I can choose' on all viewports"). These are the three marks that
  // were below the line in cycle 46.
  it('carries card-grade type, the family key chip, and real vertical padding', () => {
    expect(R.stripFontSize, 'below amendment 15 legibility floor').toBeGreaterThanOrEqual(14);
    expect(R.stripFontSize * 0.9, 'below the 9px mono floor at the 90% tier').toBeGreaterThanOrEqual(9);
    expect(R.stripKeyChip, 'not the ONE key-chip family size').toBe(R.keyChip);
    expect(R.stripPadY, 'the rail has no vertical padding').toBeGreaterThan(0);
    // The chip is the tallest mark, so it — plus its padding and borders — IS
    // the rail height. A mismatch here means the box and its contents disagree.
    expect(R.stripHeight).toBe(R.stripKeyChip + 2 * R.stripPadY + 2);
  });

  it('hangs the rail BELOW the row, exactly as wide, never overlapping a card', () => {
    const L = refitBandLayout(1366, 768);
    expect(L.strip.y).toBe(L.row.y + L.row.h + R.stripGap);
    expect(L.strip.y).toBeGreaterThanOrEqual(L.row.y + L.row.h); // strictly below
    expect(L.strip.x).toBe(L.row.x);
    expect(L.strip.w).toBe(L.row.w);
    expect(L.strip.h).toBe(R.stripHeight);
    for (const c of L.cards) expect(overlaps(L.strip, c)).toBe(false);
    // The band now covers the rail too — the keep-out checks measure the whole
    // thing, so nothing can be laid out over a strip the band forgot to declare.
    expect(L.band.y + L.band.h).toBe(L.strip.y + L.strip.h);
  });

  // THE CONTAINER-FIT LAW (amendment 47) at both ratified floors. In cycle 46
  // this was the constraint the rail's whole geometry was DERIVED from — the
  // card row ended 22px above the 1280×614 viewport edge and the rail had to
  // live in that 22px, which is what produced the 16px seam Eric rejected on
  // sight. Cycle 47 inverted the dependency: the rail is a ruled 40px and the
  // band anchor absorbs the cost, so this check is now a GUARD on the anchor
  // rather than the derivation of the rail.
  for (const { name, w, h } of FLOORS) {
    it(`fits the rail inside the viewport with nothing clipped at ${name}`, () => {
      const L = refitBandLayout(w, h);
      expect(L.strip.y + L.strip.h, `${name}: rail clipped off the bottom`).toBeLessThanOrEqual(h);
      expect(L.band.y + L.band.h, `${name}: band clipped off the bottom`).toBeLessThanOrEqual(h);
      expect(L.strip.x, name).toBeGreaterThanOrEqual(0);
      expect(L.strip.x + L.strip.w, name).toBeLessThanOrEqual(w);
    });
  }

  it('fits every mark INSIDE the rail box (the horizontal half of the law)', () => {
    // Measured from the live copy, which prints CONFIG.damageControl's own
    // numbers — a retune of the ruling moves the string and this pin with it.
    const worst = { key: '5', label: HEAL_LABEL, readout: healReadout(), status: HEAL_STATUS_FULL };
    const m = refitStripMetrics(worst);
    expect(m.overflowX, `rail content overflows by ${m.overflowX}px`).toBeLessThanOrEqual(0);
    expect(m.overflowY, `rail content is ${m.overflowY}px taller than its box`).toBeLessThanOrEqual(0);
    expect(refitStripInnerBox().w).toBeLessThan(924); // the box is the ROW's, minus chrome
    // The inner box must SUBTRACT the vertical padding, not just the borders.
    // Without this the model reports a comfortable −16px overflowY on a rail
    // whose marks actually sit in the padding — a false pass, which is exactly
    // the failure mode a fit model exists to prevent.
    expect(refitStripInnerBox().h).toBe(R.stripHeight - 2 * (R.stripPadY + 1));
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
    expect(offerView(null, false, false, false)).toBeNull();
    expect(offerView(ownShip(), true, false, false)).toBeNull(); // spectating
    expect(offerView(ownShip({ pts: 0, offer: [] }), false, false, false)).toBeNull();
  });

  it('resolves the front offer to four cards with catalog category + ratified copy', () => {
    const view = offerView(ownShip(), false, false, false);
    expect(view?.options.map((o) => o.id)).toEqual(OFFER);
    expect(view?.options).toHaveLength(CONFIG.offer.size);
    expect(view?.pts).toBe(1);
    for (const card of view!.options) {
      expect(card.category.length).toBeGreaterThan(0);
      expect(card.name).toBe(boonName(card.id, 0)); // first rung — the build is empty
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

  it('names each card at the rung the player\'s stack puts it at (name-by-stack-position)', () => {
    const fresh = offerView(ownShip(), false, false, false);
    expect(fresh?.options[0].name).toBe(boonName('intelSweep', 0));
    const stacked = offerView(ownShip({ boons: ['intelSweep', 'intelSweep'] }), false, false, false);
    expect(stacked?.options[0].name).toBe(boonName('intelSweep', 2));
    expect(stacked?.options[0].name).not.toBe(fresh?.options[0].name);
  });

  // Story 7-5 wave 1 dropped the verb cards from `exclusive` to `rare` when they
  // stopped being either/or, and WAVE 2 deleted the cannon pair — the last
  // EXCLUSIVE line in the catalog. So no SHIPPED line carries that tier today;
  // the label itself is still supported and pinned in boonCopy.test.ts, and the
  // DOM row below still renders one from a hand-built card.
  it('carries the rarity tier: nothing for a common, RARE otherwise', () => {
    const view = offerView(ownShip({ offer: ['intelSweep', 'gunTurret', 'mineCaptive', 'acquireMine'] }), false, false, false);
    expect(view?.options.map((o) => o.rarity)).toEqual(['', 'RARE', 'RARE', 'RARE']);
  });

  it('carries the lineage handrail for multi-copy lines only, at the right position', () => {
    const view = offerView(ownShip({ offer: ['intelSweep', 'gunTurret'], boons: ['intelSweep'] }), false, false, false);
    expect(view?.options[0].lineage).toBe('II/V'); // one held → this card is the second
    expect(view?.options[1].lineage).toBeNull(); // AFT TURRET is a single copy
  });

  // THE DOCTRINE-SWAP PIN IS RETIRED (Story 7-5 wave 2, R2.6). Amendment 44's
  // free swap needed an exclusive PAIR, and the cannon's was the last one in the
  // game; `BoonDef.exclusiveWith` left the type with it, so an OfferCard has no
  // `replaces` field for a card to carry.

  it('prints rules text with the player\'s LIVE values (a preview diff, not a static table)', () => {
    const fresh = offerView(ownShip({ offer: ['intelSweep'] }), false, false, false);
    const stacked = offerView(ownShip({ offer: ['intelSweep'], boons: ['intelSweep'] }), false, false, false);
    expect(fresh?.options[0].description).toContain('RPM →');
    expect(stacked?.options[0].description).not.toBe(fresh?.options[0].description);
  });

  it('resolves the card face against the OWN CLASS too (hull stats differ per class)', () => {
    const tb = offerView(ownShip({ offer: ['shipHull'] }), false, false, false);
    const bb = offerView(ownShip({ cls: 'battleship', offer: ['shipHull'] }), false, false, false);
    expect(bb?.options[0].description).not.toBe(tb?.options[0].description);
  });

  // FINDING A (spend latch): `locked` is threaded straight through from the
  // caller (main.ts's spendInFlight) — offerView stays pure, it just carries
  // the flag into the view so the DOM adapter can dim/inert the cards.
  it('carries the caller-supplied `locked` flag straight through', () => {
    expect(offerView(ownShip(), false, true, false)?.locked).toBe(true);
    expect(offerView(ownShip(), false, false, false)?.locked).toBe(false);
  });
});

// --- healView: the DAMAGE CONTROL rail's pure state ------------------------------

describe('healView — the rail is ARMED only where the server would honor the pick', () => {
  it('is ARMED on a damaged, living hull, with no status word', () => {
    const h = healView(ownShip({ hp: 80 }), false);
    expect(h.state).toBe('armed');
    expect(h.status).toBe(''); // the ABSENCE of a word is the armed channel
    expect(h.label).toBe('DAMAGE CONTROL');
  });

  it('is INERT at exactly full HP — the server rejects it and banks the level', () => {
    const full = maxHpOf('torpedoBoat');
    expect(healView(ownShip({ hp: full }), false).state).toBe('inert');
    expect(healView(ownShip({ hp: full }), false).status).toBe(HEAL_STATUS_FULL);
    // ...and one point below full is still spendable (the guard is `>=`, and
    // an overflowing heal is ruled to waste the remainder, not to be refused).
    expect(healView(ownShip({ hp: full - 1 }), false).state).toBe('armed');
  });

  it('reads full HP through effectiveStats — a fitted hull line MOVES the threshold', () => {
    const boons = ['shipHull', 'shipHull'];
    const base = maxHpOf('torpedoBoat');
    const grown = maxHpOf('torpedoBoat', boons);
    expect(grown).toBeGreaterThan(base); // the card ladder really does move it
    // At the BASE max with a grown hull the ship is damaged: armed, not inert.
    expect(healView(ownShip({ hp: base, boons }), false).state).toBe('armed');
    expect(healView(ownShip({ hp: grown, boons }), false).state).toBe('inert');
  });

  it('is INERT on a dead hull, and with no own ship at all', () => {
    expect(healView(ownShip({ alive: false, hp: 0 }), false).state).toBe('inert');
    expect(healView(ownShip({ alive: false, hp: 0 }), false).status).toBe(HEAL_STATUS_SUNK);
    expect(healView(null, false).state).toBe('inert');
    expect(healView(undefined, false).state).toBe('inert');
  });

  it('is INERT while a spend is in flight — transient, so it names no reason', () => {
    const h = healView(ownShip({ hp: 80 }), true);
    expect(h.state).toBe('inert');
    expect(h.status).toBe('');
  });

  it('prints the amounts from CONFIG.damageControl, never a hardcoded 25/25/5', () => {
    const dc = CONFIG.damageControl;
    const line = healReadout();
    // Cycle 47 moved the voice from a stat line to a sentence (Eric: "Restores
    // 25 HP now and 25 HP/5s or something") — the pin is that the NUMBERS still
    // come from config, which is what a retune of the ruling has to keep moving.
    expect(line).toBe(`RESTORES ${dc.instantHp} HP NOW AND ${dc.regenHp} HP OVER ${dc.regenMs / 1000}S`);
    expect(line).toContain(`${dc.instantHp} HP`);
    expect(line).toContain(`${dc.regenHp} HP`);
    expect(line).toContain(`${dc.regenMs / 1000}S`);
  });

  it('never echoes the shipHull ladder\'s vocabulary in its label', () => {
    // "HULL" belongs to the +maxHp card line; the rail must not borrow it.
    expect(HEAL_LABEL).toBe('DAMAGE CONTROL');
    expect(HEAL_LABEL).not.toContain('HULL');
  });

  it('rides offerView as a SIBLING of the cards, never as a fifth option', () => {
    const v = offerView(ownShip({ hp: 80 }), false, false, false);
    expect(v?.options).toHaveLength(CONFIG.offer.size);
    expect(v?.options.map((o) => o.id)).toEqual(OFFER); // no heal entry among them
    expect(v?.heal.state).toBe('armed');
    expect(offerView(ownShip({ hp: maxHpOf('torpedoBoat') }), false, false, false)?.heal.state).toBe('inert');
  });
});

// --- DOM adapter -----------------------------------------------------------------

describe('UpgradeMenu — DOM adapter (the TAB-toggled band)', () => {
  beforeEach(() => document.body.replaceChildren());
  afterEach(() => settings.set({ motion: 'full' }));

  const cardsOf = (ids: readonly string[]): OfferCard[] =>
    ids.map((id) => ({
      id,
      category: BOON_CATALOG[id].category.toUpperCase(),
      rarity: '',
      name: boonName(id, 0),
      lineage: null,
      description: '',
      // Story 7-5 wave 2 (R2.17): the face's prose moved to a hover tooltip, so
      // an OfferCard now carries the explanation and the ladder position the
      // handrail's colour ramp reads.
      tooltip: boonTooltipText(id),
      stack: 0,
      copies: BOON_CATALOG[id].copies,
    }));

  const view = (over: Partial<OfferView> = {}): OfferView => ({
    pts: 1, options: cardsOf(OFFER), locked: false, heal: healView(ownShip(), false), ...over,
  });

  /** The CARDS — scoped to the row, deliberately. The DAMAGE CONTROL rail is a
   *  button too, and it is the band's SIBLING of the row, not a member of it:
   *  a query that swept it up with the cards would be the very conflation the
   *  strip exists to avoid. */
  function cards(): HTMLButtonElement[] {
    return [...document.querySelectorAll('#upgrade-menu > div:nth-child(2) button')] as HTMLButtonElement[];
  }
  const strip = (): HTMLButtonElement => document.getElementById('refit-damage-control') as HTMLButtonElement;
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
    expect(text).toContain(boonName(OFFER[0], 0));
    expect(text).toContain('DESC ' + OFFER[0]);
  });

  // --- Story 2.8 card anatomy ---------------------------------------------------
  //
  // The card face grew three CONDITIONAL lines. The digit chip stays the FIRST
  // span in every card (pinned above and re-pinned here against the new lines):
  // the whole 1-4 spatial mapping is read off it.
  it('renders the RARE / EXCLUSIVE tag and nothing at all for a plain common', () => {
    const menu = new UpgradeMenu(() => {});
    menu.toggle(view({
      options: [
        { ...cardsOf(['intelSweep'])[0] }, // common: rarity ''
        { ...cardsOf(['gunTurret'])[0], rarity: 'RARE' },
        { ...cardsOf(['mineCaptive'])[0], rarity: 'EXCLUSIVE' },
      ],
    }));
    const [common, rare, exclusive] = cards();
    expect(common.textContent).not.toContain('RARE');
    expect(common.textContent).not.toContain('EXCLUSIVE');
    expect(rare.textContent).toContain('RARE');
    expect(exclusive.textContent).toContain('EXCLUSIVE');
    // Tier colors are TEXT-only: the border/box-shadow channel belongs to the
    // armed edge and the denied pulse, and a rarity tag must never touch it.
    expect(rare.style.borderColor).not.toBe('var(--hc-info)');
    expect(exclusive.style.borderColor).not.toBe('var(--hc-storm-readout)');
    const tagColor = (b: HTMLButtonElement): string =>
      [...b.querySelectorAll('span')].map((el) => (el as HTMLElement).style.color).join('|');
    expect(tagColor(rare)).toContain('var(--hc-info)');
    expect(tagColor(exclusive)).toContain('var(--hc-storm-readout)');
  });

  it('renders the lineage handrail for a multi-copy line and nothing for a single', () => {
    const menu = new UpgradeMenu(() => {});
    menu.toggle(view({
      options: [
        { ...cardsOf(['intelSweep'])[0], lineage: 'II/V' },
        { ...cardsOf(['mineCaptive'])[0], rarity: 'RARE' },
        { ...cardsOf(['gunTurret'])[0], rarity: 'RARE' }, // 1 copy: no lineage line
      ],
    }));
    const [stacked, verb, single] = cards();
    expect(stacked.textContent).toContain('II/V');
    expect(verb.textContent).not.toContain('/');
    expect(single.textContent).not.toContain('/');
    // The chip is STILL the first span, with every line in place.
    expect(cards().map((b) => b.querySelector('span')?.textContent)).toEqual(['1', '2', '3']);
  });

  it('re-renders when only the COPY moves (same ids, new rung after a spend)', () => {
    // The memo signature carries every rendered line, not just the ids: a queued
    // offer that slides in after a pick can carry the same line at a new rung.
    const menu = new UpgradeMenu(() => {});
    menu.toggle(view());
    const before = cards()[0].textContent;
    menu.update(view({ options: cardsOf(OFFER).map((c, i) => (i === 0 ? { ...c, name: 'HEAVY SHELLS Mk II', lineage: 'II/V' } : c)) }));
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

  // --- THE DAMAGE CONTROL RAIL, in the DOM ------------------------------------

  it('renders ONE rail below the row — never a fifth card in it', () => {
    const menu = new UpgradeMenu(() => {});
    menu.toggle(view());
    expect(cards()).toHaveLength(4);
    expect(document.querySelectorAll('#refit-damage-control')).toHaveLength(1);
    // The rail is the PANEL's third child (pips, row, rail) — outside the row.
    // Story 7-5 wave 2 (R2.17) adds a FOURTH: the one hover tooltip, built with
    // the panel and never rebuilt, deliberately last so it paints over the row.
    const panel = document.getElementById('upgrade-menu')!;
    expect(panel.children).toHaveLength(4);
    expect(panel.children[2]).toBe(strip());
    expect(panel.children[3]?.id).toBe('refit-card-tooltip');
    expect(strip().parentElement).toBe(panel);
    expect(strip().textContent).toContain(HEAL_LABEL);
    expect(strip().textContent).toContain(healReadout());
    expect((strip().firstElementChild as HTMLElement).textContent).toBe('5'); // the key chip
  });

  it('routes a rail click to HEAL_CHOICE — the same path digit 5 takes', () => {
    const spends: number[] = [];
    const menu = new UpgradeMenu((c) => spends.push(c));
    menu.toggle(view());
    strip().click();
    expect(spends).toEqual([HEAL_CHOICE]);
    expect(HEAL_CHOICE).toBe(-1); // never an index into the offer
  });

  it('the rail never retains focus: mousedown is prevented and click blurs', () => {
    const menu = new UpgradeMenu(() => {});
    menu.toggle(view());
    const el = strip();
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    expect(el.dispatchEvent(down)).toBe(false); // preventDefault — focus never taken
    el.focus();
    el.click();
    expect(document.activeElement).not.toBe(el);
  });

  it('renders INERT dual-coded: dimmed AND disabled AND carrying the reason word', () => {
    const spends: number[] = [];
    const menu = new UpgradeMenu((c) => spends.push(c));
    menu.toggle(view({ heal: healView(ownShip({ hp: maxHpOf('torpedoBoat') }), false) }));
    expect(strip().disabled).toBe(true);
    expect(strip().style.opacity).toBe(String(R.lockedAlpha));
    expect(strip().textContent).toContain(HEAL_STATUS_FULL); // never hue alone
    strip().click();
    expect(spends).toEqual([]); // a disabled rail fires nothing
  });

  it('live-swaps between armed and inert without rebuilding the rail', () => {
    const menu = new UpgradeMenu(() => {});
    menu.toggle(view());
    const el = strip();
    expect(el.disabled).toBe(false);
    menu.update(view({ heal: healView(ownShip({ alive: false, hp: 0 }), false) }));
    expect(strip()).toBe(el); // the same node — the rail is never drawn or discarded
    expect(el.disabled).toBe(true);
    expect(el.textContent).toContain(HEAL_STATUS_SUNK);
    menu.update(view());
    expect(el.disabled).toBe(false);
    expect(el.textContent).not.toContain(HEAL_STATUS_SUNK);
  });

  it('arms amber on hover and drops back on leave (the card grammar, one line high)', () => {
    const menu = new UpgradeMenu(() => {});
    menu.toggle(view());
    strip().dispatchEvent(new MouseEvent('mouseenter'));
    expect(strip().style.borderColor).toBe('var(--hc-amber)');
    expect(strip().style.boxShadow).toContain('var(--hc-amber)');
    strip().dispatchEvent(new MouseEvent('mouseleave'));
    expect(strip().style.borderColor).toBe('var(--hc-hairline)');
  });

  it('fires the SAME 80ms denied pulse on the rail for a rejected heal', () => {
    const menu = new UpgradeMenu(() => {});
    menu.toggle(view());
    menu.pulseDenied(HEAL_CHOICE, 1000);
    expect(menu.deniedActive(1000)).toBe(true);
    expect(strip().style.borderColor).toBe('var(--hc-denied)');
    expect(cards()[0].style.borderColor).not.toBe('var(--hc-denied)'); // cards untouched
    expect(menu.deniedActive(1000 + R.deniedPulseMs)).toBe(false);
  });

  it('a lit rail pulse survives a card-row rebuild (the rail outlives every offer)', () => {
    const menu = new UpgradeMenu(() => {});
    menu.toggle(view({ pts: 2 }));
    menu.pulseDenied(HEAL_CHOICE, 1000);
    menu.update(view({ pts: 1, options: cardsOf(OFFER_B) }));
    expect(menu.deniedActive(1000)).toBe(true);
    expect(strip().style.borderColor).toBe('var(--hc-denied)');
  });

  it('a hover cannot paint a lit rail refusal away mid-pulse', () => {
    const menu = new UpgradeMenu(() => {});
    menu.toggle(view());
    menu.pulseDenied(HEAL_CHOICE, 1000);
    strip().dispatchEvent(new MouseEvent('mouseenter'));
    expect(strip().style.borderColor).toBe('var(--hc-denied)');
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
  // to its flat rest value ('none', same vocabulary as paintCard/paintStrip).

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

    it('a DEGRADED denial still marks the DAMAGE CONTROL RAIL the same way', () => {
      const menu = new UpgradeMenu(() => {}, fakeBudget('degrade'));
      menu.toggle(view());
      menu.pulseDenied(HEAL_CHOICE, 1000);
      expect(strip().style.borderColor).toBe('var(--hc-denied)');
      expect(strip().style.boxShadow).toBe('none');
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
