// THE OFFER'S PURE CORE (ui/offerCore.ts — moved out of ui/upgradeMenu.ts by
// Story 10.10, with these tests): the pure offerView() truth table over BOON
// ids, the greyed refusal (the shared `pickRefusal`), the REDRAW state, and the
// FINDING A spend latch's gate, release predicate and outcome classifier. No
// DOM — the corner group's adapter is pinned in offerGroup.test.ts.

import { describe, it, expect } from 'vitest';
import {
  CATALOG,
  CONFIG,
  effectiveStats,
  DEFAULT_CLASS_ID,
  DEFAULT_SHIFT,
  MULLIGAN_CHOICE,
  SHIP_CLASS_IDS,
  SLOT_COUNT,
  familySlotFor,
  initialTurrets,
  type OwnShip,
  type EquipmentId,
} from '@salvo/shared';
import {
  SLOTS_FULL,
  SPEND_LATCH_TIMEOUT_MS,
  canLatchSpend,
  cardFoot,
  cardGreyed,
  frontOfferSignature,
  offerView,
  pickableChoice,
  redrawState,
  spendLatchReleased,
  spendOutcome,
  type OfferView,
  type SpendLatch,
} from '../ui/offerCore.js';
import {
  boonName,
  cardHoverRows,
  cardColorTier,
  cardStatRows,
  cardTierLabel,
  cardTierSteps,
} from '../ui/boonCopy.js';

/** A real four-LINE draw from the shipped Boon Catalog v1. */
const OFFER = ['intel', 'armor', 'deckGun', 'navalMines'];
const OFFER_B = ['reload', 'engines', 'intel', 'navalMines'];

function ownShip(over: Partial<OwnShip> = {}): OwnShip {
  return {
    id: 'me', x: 0, y: 0, heading: 0, speed: 0, hp: 80, alive: true,
    ammo: [], sweep: 0, cls: DEFAULT_CLASS_ID, shift: DEFAULT_SHIFT, turrets: initialTurrets(DEFAULT_CLASS_ID),
    sec: { heat: 0, locked: false }, pts: 1, offer: [...OFFER],
    boostUntil: 0, cards: [], lvl: 0, xp: 0, repairHp: 0, rd: false, ib: {},
    ...over,
  };
}

// --- offerView -------------------------------------------------------------------

describe('offerView — pure spend-view derivation over BOON ids', () => {
  it('is null with no own ship, while spectating, or with an empty bank', () => {
    expect(offerView(null, false, false, false)).toBeNull();
    expect(offerView(ownShip(), true, false, false)).toBeNull(); // spectating
    expect(offerView(ownShip({ pts: 0, offer: [] }), false, false, false)).toBeNull();
  });

  it('resolves the front offer to four cards with the ratified copy', () => {
    const view = offerView(ownShip(), false, false, false);
    expect(view?.options.map((o) => o.id)).toEqual(OFFER);
    expect(view?.options).toHaveLength(CONFIG.offer.size);
    expect(view?.pts).toBe(1);
    for (const card of view!.options) {
      expect(card.name).toBe(boonName(card.id, 0)); // the sheet's name for the line
      // STORY 8.7: the face is the ratified FIVE-ROW block. A LADDER card and a
      // LIVE equipment line print rows; an add-on, a consumable and an unbuilt
      // weapon move no number and print none, which is correct, not a fault.
      const line = CATALOG[card.id];
      const speaks = line.kind === 'ladder' || (line.kind === 'equipment' && line.stub !== true);
      if (speaks) expect(card.rows.length, card.id).toBeGreaterThan(0);
      else expect(card.rows, card.id).toEqual([]);
      // ...and the three interim-face fields went with the face they belonged to.
      for (const dead of ['count', 'lineage', 'description', 'tooltip']) {
        expect(card, `${card.id}.${dead}`).not.toHaveProperty(dead);
      }
      // CYCLE 158 (amendment 187): the hover is the AFTER-fold stat table.
      expect(card.hover, card.id).toEqual(cardHoverRows(line, 0, ownShip()));
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
    expect(fresh?.options[0].name).toBe(boonName('intel', 0));
    expect(fresh?.options[0].stack).toBe(0);
    expect(fresh?.options[0].cap).toBe(CATALOG.intel.cap);
    expect(fresh?.options[0].tier).toBe(cardTierLabel(CATALOG.intel, 0));
    const stacked = offerView(ownShip({ cards: ['intel', 'intel'] }), false, false, false);
    expect(stacked?.options[0].name).toBe(fresh?.options[0].name);
    expect(stacked?.options[0].stack).toBe(2);
    expect(stacked?.options[0].tier).toBe(cardTierLabel(CATALOG.intel, 2));
    expect(stacked?.options[0].tier).not.toBe(fresh?.options[0].tier);
  });

  // Story 7-5 wave 1 dropped the verb cards from `exclusive` to `rare` when they
  // stopped being either/or, and WAVE 2 deleted the cannon pair — the last
  // EXCLUSIVE line in the catalog. So no SHIPPED line carries that tier today;
  // the label itself is still supported and pinned in boonCopy.test.ts, and the
  // DOM row below still renders one from a hand-built card.
  // Eric 2026-11-05: a card's colour is the TIER it grants, whatever its kind.
  it('carries the tone = the tier the card grants, on every card', () => {
    const offer = ['intel', 'deckGun', 'captiveMines', 'foulingShell'];
    const view = offerView(ownShip({ offer }), false, false, false);
    expect(view?.options.map((o) => o.tone)).toEqual(offer.map((id) => cardColorTier(CATALOG[id], 0)));
    const tier = offerView(ownShip({ offer: ['captiveMines'], cards: ['captiveMines'] }), false, false, false);
    expect(tier?.options[0].tone).toBe(cardColorTier(CATALOG.captiveMines, 1));
  });

  it('carries the ladder length and the copies held — the rungs and their fill', () => {
    const held = ['intel', 'intel', 'intel'];
    // The CANNON ladder replaced the one-rung DECK GUN TURRET here (amendment
    // 197 — no one-rung card ships any more): nothing held, cap 4.
    const view = offerView(ownShip({ offer: ['intel', 'deckGun'], cards: held }), false, false, false);
    expect(view?.options[0].stack).toBe(3);
    expect(view?.options[0].cap).toBe(CATALOG.intel.cap);
    expect(view?.options[1].stack).toBe(0);
    expect(view?.options[1].cap).toBe(CATALOG.deckGun.cap);
  });

  it('draws NO ladder for an add-on (the DEPTH CHARGE stub) — it has no rungs', () => {
    const view = offerView(ownShip({ offer: ['depthCharge', 'foulingShell', 'intel'] }), false, false, false);
    expect(view?.options[0].tier).toBeNull();
    expect(view?.options[0].tierStep).toBeNull();
    expect(view?.options[1].tier).not.toBeNull(); // a slot weapon climbs (Story 10.5)
    expect(view?.options[2].tier).not.toBeNull();
  });

  // STORY 10.5: the draw may deal a SHORT offer (an exhausted hull) — the view
  // shows exactly what was dealt — or an EMPTY one, which opens no window.
  it('a SHORT offer shows exactly its cards; an EMPTY offer yields no view at all', () => {
    const short = offerView(ownShip({ offer: ['intel', 'armor'] }), false, false, false);
    expect(short?.options.map((o) => o.id)).toEqual(['intel', 'armor']);
    expect(offerView(ownShip({ pts: 2, offer: [] }), false, false, false)).toBeNull();
  });

  it('pickableChoice: a digit past a SHORT offer, a greyed card, a locked row or no view picks nothing', () => {
    const short = offerView(ownShip({ offer: ['intel', 'armor'] }), false, false, false)!;
    expect(pickableChoice(short, 0)).toBe(true);
    expect(pickableChoice(short, 1)).toBe(true);
    expect(pickableChoice(short, 2)).toBe(false); // the third digit addresses no card
    expect(pickableChoice(short, 3)).toBe(false);
    expect(pickableChoice(short, -1)).toBe(false);
    expect(pickableChoice({ ...short, locked: true }, 0)).toBe(false);
    expect(pickableChoice(null, 0)).toBe(false); // an empty offer never opened a window
    const greyed = { ...short, options: [{ ...short.options[0], greyed: true }, short.options[1]] };
    expect(pickableChoice(greyed, 0)).toBe(false);
    expect(pickableChoice(greyed, 1)).toBe(true);
  });

  // THE DOCTRINE-SWAP PIN IS RETIRED (Story 7-5 wave 2, R2.6). Amendment 44's
  // free swap needed an exclusive PAIR, and the cannon's was the last one in the
  // game; `CatalogLine.exclusiveWith` left the type with it, so an OfferCard has no
  // `replaces` field for a card to carry.

  it('prints ROWS with the player\'s LIVE values (a preview diff, not a static table)', () => {
    const fresh = offerView(ownShip({ offer: ['intel'] }), false, false, false);
    const stacked = offerView(ownShip({ offer: ['intel'], cards: ['intel'] }), false, false, false);
    // Story 10.3: the INTEL card prints its own index (the fold's value).
    expect(fresh?.options[0].rows[0].next).toBe(String(effectiveStats(CONFIG.shipClasses[DEFAULT_CLASS_ID], ['intel']).intel));
    expect(stacked?.options[0].rows[0].cur).not.toBe(fresh?.options[0].rows[0].cur);
  });

  it('resolves the card face against the OWN CLASS too (hull stats differ per class)', () => {
    // ENGINES (top speed) since Story 10.3 deleted HULL, the old example here.
    // Any hull whose ENGINES index differs from the default's.
    const engines = (c: (typeof SHIP_CLASS_IDS)[number]): number => CONFIG.shipClasses[c].index.engines;
    const other = SHIP_CLASS_IDS.find((c) => engines(c) !== engines(DEFAULT_CLASS_ID))!;
    expect(other).toBeDefined();
    const tb = offerView(ownShip({ offer: ['engines'] }), false, false, false);
    const bb = offerView(ownShip({ cls: other, offer: ['engines'] }), false, false, false);
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

// --- THE COUNTDOWN's REDRAW pip (Story 8.10 / 10.7) ------------------------------

describe('redrawState — the REDRAW pip reads the server flag (Story 10.7, R4)', () => {
  it('is unspent in the countdown while the own row says the redraw is unused', () => {
    expect(redrawState('countdown', ownShip({ rd: false }))).toBe('unspent');
  });

  it('is spent in the countdown once the own row says it is used — reconnect included', () => {
    expect(redrawState('countdown', ownShip({ rd: true }))).toBe('spent');
  });

  it('is hidden off the countdown, whatever the flag says', () => {
    for (const phase of ['waiting', 'active', 'finished']) {
      expect(redrawState(phase, ownShip({ rd: false }))).toBe('hidden');
      expect(redrawState(phase, ownShip({ rd: true }))).toBe('hidden');
    }
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

// STORY 10.7 REVIEW GATE (2026-11-06) — a REDRAW that deals the SAME four cards.
// The server honors the redraw, but the fresh hand is byte-identical: pts and
// the front signature never move, and a redraw fits nothing, so no `bn` ack
// arrives. The own row's `rd` flag (the one redraw is used) IS the receipt —
// the button could only be pressed while `rd` was false.
describe('the REDRAW latch releases on the server\'s used flag (`rd`)', () => {
  const latch = (over: Partial<SpendLatch> = {}): SpendLatch => ({
    pts: 1, offerSig: OFFER.join(','), at: 1000, choice: MULLIGAN_CHOICE, acked: false, ...over,
  });
  const you = (rd: boolean) => ({ pts: 1, offer: [...OFFER], rd });
  const soon = 1000 + SPEND_LATCH_TIMEOUT_MS / 2;
  const late = 1000 + SPEND_LATCH_TIMEOUT_MS + 1;

  it('an identical hand with `rd` true: released at once, a SUCCESS — never a denied pulse', () => {
    expect(spendLatchReleased(latch(), you(true), soon)).toBe(true);
    expect(spendOutcome(latch(), you(true), soon)).toBe('success');
    expect(spendOutcome(latch(), you(true), late)).toBe('success');
  });

  it('with `rd` still false: held, then FAILED at the timeout (the server truly refused)', () => {
    expect(spendLatchReleased(latch(), you(false), soon)).toBe(false);
    expect(spendOutcome(latch(), you(false), soon)).toBe('pending');
    expect(spendOutcome(latch(), you(false), late)).toBe('failed');
  });

  it('a CARD spend latch is unaffected by `rd`', () => {
    const card = latch({ choice: 0 });
    expect(spendLatchReleased(card, you(true), soon)).toBe(false);
    expect(spendOutcome(card, you(true), soon)).toBe('pending');
    expect(spendOutcome(card, you(true), late)).toBe('failed');
  });
});

// --- THE GREYED CARD (Story 8.7, ruling 10 / UX-DR52) ---------------------------
//
// A card the server would refuse (a line at its cap; copy 1 of a weapon with
// Q/E/R full — the belt's "no room" refusal retired in Story 9.2) is refused
// BEFORE the press, not after it.
// The server would return false with no mutation and no event, so a client that
// sent the pick anyway would sit through a 1.5s latch timeout and then fire a
// denied pulse for a refusal it could have known about. Instead the card is
// greyed the moment the offer resolves, and its digit and its click send
// nothing at all.
//
// DUAL-CODED, three ways, because the dim alone is hue/lightness only: the face
// dims to `greyedAlpha`, the key chip goes DASHED, and — for the weapon-slot
// refusal only (epic-9 amendment 32: no cap copy) — the foot carries the boxed
// reason word.

describe('the greyed card — a refusal stated before the press', () => {

  type Slots = readonly (EquipmentId | null)[];
  /** All three FAMILY slots filled (Story 10.5): torpedo, mine, special shell. */
  const ROW_FULL: Slots = ['gun', 'boost', 'lightTorpedo', 'navalMines', 'starShells'];
  /** Nothing fitted past the gun and Shift. */
  const ROOM_LEFT: Slots = ['gun', 'boost', ...Array.from({ length: SLOT_COUNT - 2 }, () => null)];
  const ARMOR_CAPPED = new Array<string>(CATALOG.armor.cap).fill('armor');

  // --- THE TWO REFUSALS (Story 8.14 review, F1; re-cut for the family slots in
  // Story 10.5): a line already AT ITS CAP, and copy 1 of a weapon whose FAMILY
  // slot holds another kind — the fail-closed twin of the server's own guard
  // (the draw never deals either).

  it('greys a line the player already holds AT ITS CAP', () => {
    expect(cardGreyed(CATALOG.armor, ROOM_LEFT, ARMOR_CAPPED)).toBe(true);
    // ...one short of the cap it is a live card again.
    expect(cardGreyed(CATALOG.armor, ROOM_LEFT, ARMOR_CAPPED.slice(1))).toBe(false);
  });

  it('greys copy 1 of a weapon whose family slot holds ANOTHER kind, and never a later copy of the held kind', () => {
    expect(cardGreyed(CATALOG.heavyTorpedo, ROW_FULL, ['lightTorpedo'])).toBe(true); // Q holds the light torpedo
    expect(cardGreyed(CATALOG.lightTorpedo, ROW_FULL, ['lightTorpedo'])).toBe(false); // a TIER card of the held kind
    expect(cardGreyed(CATALOG.heavyTorpedo, ROOM_LEFT, [])).toBe(false); // the family slot is open
  });

  // Story 10.6 (R10): a one-off WEAPON card is refused `noHost` while its
  // family slot is EMPTY — greyed, with no foot word (no word is ruled for it).
  it('greys a one-off card whose family slot is empty, with no foot word; live once a host is aboard', () => {
    const torpedoAboard: Slots = ROOM_LEFT.map((id, i) => (i === familySlotFor('heavyTorpedo') ? 'heavyTorpedo' : id));
    expect(cardGreyed(CATALOG.aftTorpedoLauncher, ROOM_LEFT, [])).toBe(true);
    expect(cardFoot(CATALOG.aftTorpedoLauncher, ROOM_LEFT, [])).toBe('');
    expect(cardGreyed(CATALOG.aftTorpedoLauncher, torpedoAboard, ['heavyTorpedo'])).toBe(false);
  });

  it('prints SLOTS FULL for the family-slot refusal ONLY — a capped line has NO foot word (amendment 32)', () => {
    expect(cardFoot(CATALOG.heavyTorpedo, ROW_FULL, ['lightTorpedo'])).toBe(SLOTS_FULL);
    expect(cardFoot(CATALOG.armor, ROOM_LEFT, ARMOR_CAPPED)).toBe('');
    expect(cardFoot(CATALOG.intel, ROW_FULL, [])).toBe(''); // a live card
  });

  it('carries the flag AND the foot onto the OfferCard, through the same shared predicate', () => {
    const you = ownShip({ offer: ['heavyTorpedo', 'armor', 'intel'], cards: [...ARMOR_CAPPED, 'lightTorpedo'] });
    const view = offerView(you, false, false, false, ROW_FULL);
    expect(view?.options.map((o) => o.greyed)).toEqual([true, true, false]);
    expect(view?.options.map((o) => o.foot)).toEqual([SLOTS_FULL, '', '']);
    // ...and with the family slot open only the capped line stays greyed.
    expect(offerView({ ...you, cards: ARMOR_CAPPED }, false, false, false, ROOM_LEFT)?.options.map((o) => o.greyed))
      .toEqual([false, true, false]);
  });
});
