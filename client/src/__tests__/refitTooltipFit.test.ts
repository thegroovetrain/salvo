// THE CONTAINER-FIT PIN for the REFIT CARD'S HOVER TOOLTIP (Story 7-5 wave 2,
// R2.17 — Eric ruling 2026-08-19), plus the two rulings that shipped alongside
// it: hover-ONLY (no keyboard path), and colour-carries-ladder-position under
// DESIGN.md's dual-coding floor.
//
// THE POINT OF THE FILE. Amendment 47's ~90-character budget exists because
// Story 2.8's doctrine text overflowed the 216×236 card BOX by 50–97px on the
// live site. R2.17 moved the explanation OUT of that box on purpose:
//
//   *"hovering one with the mouse should give a tooltip explaining the card, so
//   that there are no questions like 'what the fuck does a captive mine do?'"*
//
// So the budget is RE-AIMED, not deleted. `__tests__/refitCardFit.test.ts` still
// governs the face; this file governs the panel against ITS container — the
// clear water between the viewport's top margin and the band's own top edge, at
// the 1280×614 logical floor the band's geometry suite already uses. The
// explanation may be as long as it needs to actually answer Eric's question,
// and no longer.
//
// The container is derived from `refitBandLayout` rather than restated, so the
// band anchor (since Story 8.6: `barGap` off the HUD bar's top edge, epic-8
// amendment 36) and the tooltip's budget can never drift apart: lift the band
// and this pin re-measures with it.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOG, CONFIG, type CatalogLine, type ShipClassId } from '@salvo/shared';
import { boonName, boonKindLabel, boonTooltipText, cardTierLabel } from '../ui/boonCopy.js';
import {
  REFIT_TIP,
  REFIT_TIP_FLOOR_VIEWPORT_H,
  refitTooltipInnerWidth,
  refitTooltipLeft,
  refitTooltipMaxPanelH,
  refitTooltipMetrics,
  refitTooltipModel,
  refitTooltipWidestToken,
  type RefitTooltipModel,
} from '../ui/refitTooltip.js';
import {
  LINEAGE_TIERS,
  UpgradeMenu,
  lineageTint,
  offerView,
  refitBandLayout,
  refitTooltipPlacement,
  type OfferView,
} from '../ui/upgradeMenu.js';
import { hudBarLayout } from '../render/hudBar.js';
import { setUiScaleVar } from '../ui/theme.js';
import { scaleTierEnabled } from '../settings/store.js';
import { CLIENT_CONFIG } from '../config.js';

const R = CLIENT_CONFIG.refit;
const LINES: CatalogLine[] = Object.values(CATALOG);
const CLASSES = Object.keys(CONFIG.shipClasses) as ShipClassId[];

/** The floor viewport's own band, and the container it leaves above itself.
 *  1280 is the logical width of the ≥1600px-gated 125% UI-scale tier; the
 *  height is the shortest logical box the HUD is ever laid out into, and since
 *  Story 8.6 it is what sets the band's own top edge (the band hangs off the
 *  HUD bar — see `CLIENT_CONFIG.refit.barGap`). */
const FLOOR_BAND = refitBandLayout(1280, REFIT_TIP_FLOOR_VIEWPORT_H);
const CONTAINER_H = refitTooltipMaxPanelH(FLOOR_BAND.band.y);

/** Every panel the catalog can ever produce: one per line per stack position
 *  (the heading is the ladder name AT THAT RUNG, so it moves with the stack;
 *  the explanation is keyed on the id alone and does not). */
function everyPanel(): { label: string; model: RefitTooltipModel }[] {
  const out: { label: string; model: RefitTooltipModel }[] = [];
  for (const def of LINES) {
    for (let stack = 0; stack < def.cap; stack += 1) {
      out.push({
        label: `${def.id}@${stack}`,
        model: { name: boonName(def.id, stack), body: boonTooltipText(def.id) },
      });
    }
  }
  return out;
}

const PANELS = everyPanel();

describe('refit tooltip container fit (amendment 47, re-aimed by R2.17)', () => {
  it('covers every catalog line at every stack position', () => {
    // Catalog v3: 29 lines / 122 physical cards. It was 114 until Story 8.13
    // traded two cap-1 ADD-ONS for two cap-5 lines (FOULING MINES became
    // equipment, DEPTH CHARGE joined as a stub consumable, ACOUSTIC HOMING was
    // deleted — epic-8 amendments 80/81/83).
    expect(LINES).toHaveLength(29);
    expect(PANELS.length).toBe(LINES.reduce((n, d) => n + d.cap, 0));
  });

  // AMENDMENT 37 (Eric, 2026-09-17) — THE PANEL FLIPS RATHER THAN CLIPS.
  //
  // Amendment 36 hung the band off the HUD bar, and at the logical floor that
  // left 130px of water above it against a tallest panel of 261px: 45 of the
  // catalog's 114 panels would have been cut off at the top. STORY 8.7's 236 ->
  // 226 card re-cut handed 10px of that back, and STORY 8.8 hands back 46 more
  // (the DAMAGE CONTROL rail plus its seam), which moves the split BOTH ways
  // without changing the rule: more water above, and a shorter band to open
  // downward into. The panel's own width and type are untouched (epic-8
  // amendment 42). Eric's ruling keeps the ratified above-the-band placement
  // wherever it fits and opens the rest DOWNWARD from the band's top edge, over
  // the card row they describe — never over the bar, never clipped. So the pin
  // is no longer "everything fits above"; it is "everything fits SOMEWHERE, and
  // the somewhere is one of exactly two".
  it('opens every panel ABOVE at 1366x768 — the flip is a short-viewport rule', () => {
    const band = refitBandLayout(1366, 768).band;
    const down = PANELS.filter(({ model }) => !refitTooltipPlacement(model, band).above).map((p) => p.label);
    expect(down).toEqual([]);
    expect(refitTooltipMaxPanelH(band.y)).toBe(340);
  });

  it('flips exactly the panels the floor has no water for, and counts them', () => {
    // The floor's own numbers, documented rather than implied: whoever changes
    // the band, the bar or the copy moves this split and has to look here.
    expect(CONTAINER_H).toBe(186);
    const down = PANELS.filter(({ model }) => !refitTooltipPlacement(model, FLOOR_BAND.band).above);
    expect(PANELS).toHaveLength(122);
    // 45 at 8.7. Story 8.8 moved it BOTH ways and netted +1: 46px more water
    // above lifts several panels back over the line, while HULL REPAIR's new
    // explanation (amendment 50's one-line description) adds three tall panels
    // of its own.
    // 45 at 8.7, 46 at 8.8. Story 8.13 nets −2: the two DELETED add-ons
    // (ACOUSTIC HOMING, the FOULING MINES verb) took two tall explained panels
    // with them, and the ten cards that replaced them carry no explanation at
    // all, so every one of them fits above.
    expect(down).toHaveLength(44);
    expect(PANELS.length - down.length).toBe(78);
    // The split IS the water line — nothing else decides it.
    for (const { label, model } of PANELS) {
      const p = refitTooltipPlacement(model, FLOOR_BAND.band);
      expect(p.above, label).toBe(p.height <= CONTAINER_H);
      // DOWN: the budget is the band's own height, and a panel that outgrows it
      // slides up by the shortfall rather than clipping (Story 8.8 — see
      // RefitTipPlacement.offset). `maxH` follows the lift, so it is never a
      // clip for anything the shipped catalog can produce.
      expect(p.maxH, label).toBe(p.above ? CONTAINER_H : FLOOR_BAND.band.h + p.offset);
      expect(p.offset, label).toBe(p.above ? 0 : Math.max(0, p.height - FLOOR_BAND.band.h));
    }
  });

  it('NO panel is CLIPPED — at either ratified floor, at every enabled tier', () => {
    const viewports = [
      { w: 1366, h: 768 },
      { w: 1280, h: 614 },
      { w: 1600, h: 768 },
      { w: 1920, h: 1080 },
    ];
    const clipped: string[] = [];
    for (const { w, h } of viewports) {
      for (const tier of CLIENT_CONFIG.settings.scaleTiers) {
        if (!scaleTierEnabled(tier, w)) continue;
        const f = tier / 100;
        const band = refitBandLayout(w / f, h / f).band;
        const barTop = hudBarLayout(w / f, h / f).bar.y;
        for (const { label, model } of PANELS) {
          const p = refitTooltipPlacement(model, band);
          const where = `${w}x${h}@${tier}% ${label} (${p.above ? 'above' : 'down'})`;
          if (p.height > p.maxH) clipped.push(`${where}: ${p.height}px > ${p.maxH}px`);
          // ...and the panel's own box stays in its half: above, clear of the
          // viewport's top margin; down, clear of the bar.
          const top = p.above ? band.y - REFIT_TIP.gap - p.height : band.y - p.offset;
          const bottom = p.above ? band.y - REFIT_TIP.gap : band.y - p.offset + p.height;
          if (top < 0) clipped.push(`${where}: ${-top}px off the top`);
          if (bottom > barTop - R.barGap) clipped.push(`${where}: ${bottom - (barTop - R.barGap)}px into the bar`);
        }
      }
    }
    expect(clipped).toEqual([]);
  });

  it('leaves real headroom in BOTH placements — neither pin is on the boundary', () => {
    const worst = Math.max(...PANELS.map(({ model }) => refitTooltipMetrics(model, CONTAINER_H).height));
    expect(worst).toBe(261);
    // Above, at the comfortable floor: the water still out-measures the panel.
    expect(refitTooltipMaxPanelH(refitBandLayout(1366, 768).band.y) - worst).toBeGreaterThanOrEqual(2);
    // DOWN, at the floor: the band is 244px since Story 8.8 deleted the rail, so
    // the tallest panel no longer fits inside it and takes the amendment-37
    // slide-up instead. What has to hold is that the lift lands the panel in
    // real water — its top stays on screen with room to spare, and its bottom
    // still seats `barGap` above the bar.
    const lift = Math.max(0, worst - FLOOR_BAND.band.h);
    expect(lift).toBe(17);
    expect(FLOOR_BAND.band.y - lift).toBeGreaterThanOrEqual(2);
  });

  it('never carries a token wider than the panel, so nothing paints out its side', () => {
    const inner = refitTooltipInnerWidth();
    const tooWide = PANELS.filter(({ model }) => refitTooltipWidestToken(model) > inner).map((p) => p.label);
    expect(tooWide).toEqual([]);
  });

  it('keeps the heading to ONE line (the height model counts it, but a wrap reads as broken)', () => {
    const wrapped = PANELS.filter(({ model }) => refitTooltipMetrics(model, CONTAINER_H).nameLines > 1).map(
      ({ label, model }) => `${label}: "${model.name}"`,
    );
    expect(wrapped).toEqual([]);
  });

  it('stays inside the band horizontally in every slot', () => {
    const rowW = FLOOR_BAND.row.w;
    for (let i = 0; i < FLOOR_BAND.cards.length; i += 1) {
      const left = refitTooltipLeft(i, rowW);
      expect(left, `slot ${i}`).toBeGreaterThanOrEqual(0);
      expect(left + REFIT_TIP.width, `slot ${i}`).toBeLessThanOrEqual(rowW);
    }
  });
});

describe('the laws that constrain the fix', () => {
  // The fix for an overflow may not be "shrink the type until it fits" — that
  // is the trade amendment 15 already refused on the card, and this panel's
  // whole reason to exist is that the explanation should be READABLE.
  it('keeps amendment 15 legibility: the explanation never crashes below 14px', () => {
    expect(REFIT_TIP.bodySize).toBeGreaterThanOrEqual(14);
    expect(REFIT_TIP.nameSize).toBeGreaterThanOrEqual(14);
    expect(Math.min(REFIT_TIP.bodySize, REFIT_TIP.nameSize) * 0.9).toBeGreaterThanOrEqual(
      CLIENT_CONFIG.settings.monoFloorPx,
    );
  });

  // Nor may it be "cut the copy back to the old card budget", which would undo
  // the ruling. Amendment 47's ~90 characters is what the FACE gets; the whole
  // point here is that an explanation is allowed to be a real explanation.
  // PARTIAL, not total, since catalog v3 (Story 8.1): a line whose MECHANISM is
  // not built has nothing honest to explain, and inventing copy for a weapon
  // nobody has played is what the naming law forbids. The exemptions are named
  // EXACTLY so the list cannot rot — an agent who builds one has to delete its
  // entry, and `boonCopy.test.ts` pins the same list from the copy side.
  const NO_EXPLANATION: readonly string[] = [
    'turning', 'deckGun',
    // The three lines Story 8.13 made LIVE still have no explanation, and
    // neither does FOULING MINES, whose add-on text died with its card: the
    // mechanisms exist, the WORDS are Eric's (no-in-game-copy-unasked).
    'lightTorpedo', 'supercavTorpedo', 'captiveMines', 'foulingMines',
    'missile', 'machineGun', 'flak', 'monitor',
    // `hullRepair` left this list in Story 8.8 — its mechanism is built now.
    'shieldBlock', 'smokeScreen', 'chaff', 'decoyBuoy', 'depthCharge', 'heatSeeking',
  ];

  it('keeps the WRITTEN explanations genuinely explanatory — past the old card budget', () => {
    const thin = LINES.filter((d) => !NO_EXPLANATION.includes(d.id))
      .filter((d) => boonTooltipText(d.id).length <= 90)
      .map((d) => d.id);
    expect(thin).toEqual([]);
  });

  it('covers every line whose mechanism exists — and NOTHING it cannot explain', () => {
    const blank = LINES.filter((d) => boonTooltipText(d.id).trim() === '').map((d) => d.id);
    expect(blank.sort()).toEqual([...NO_EXPLANATION].sort());
  });
});

// --- THE HOVER RULING -----------------------------------------------------------
//
// *"a new player will probably click and hover and read tooltips. an experienced
// player knows what they want and will use the shortcut or click faster without
// reading."* The Tab / 1–4 / 5 path exists precisely SO the reading can be
// skipped, so wiring the explanation into it would put the text back in front of
// the one player who does not want it.

describe('the tooltip is HOVER-ONLY (R2.17, Eric ruling 2026-08-19)', () => {
  // ACOUSTIC HOMING is deleted (Story 8.13, epic-8 amendment 80) and an offer
  // naming a line the catalog does not carry resolves to nothing, so the row is
  // re-cut from lines that exist. FOULING MINES stays — it is an equipment LINE
  // now (amendment 81) rather than an add-on, which is exactly the kind of card
  // this row wants beside a ladder and a verb.
  const OFFER = ['phosphorShells', 'radarSweep', 'armor', 'foulingMines'];

  function open(): { menu: UpgradeMenu; cards: HTMLButtonElement[]; view: OfferView } {
    const you = {
      id: 'me', x: 0, y: 0, heading: 0, speed: 0, hp: 80, alive: true, ammo: [], sweep: 0,
      cls: 'torpedoBoat' as const, pts: 1, offer: OFFER, boostUntil: 0,
      cards: [], lvl: 0, xp: 0, repairHp: 0,
    };
    const view = offerView(you as never, false, false, false) as OfferView;
    const menu = new UpgradeMenu(() => {});
    menu.toggle(view);
    const cards = [...document.querySelectorAll('#upgrade-menu > div:nth-child(2) button')] as HTMLButtonElement[];
    return { menu, cards, view };
  }

  /** A real viewport resize, as jsdom can express one. */
  function resizeTo(w: number, h: number): void {
    Object.defineProperty(window, 'innerWidth', { value: w, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: h, configurable: true });
  }

  const tip = (): HTMLElement => document.getElementById('refit-card-tooltip') as HTMLElement;

  it('is hidden until a pointer enters a card, and shows that card\'s explanation', () => {
    const { menu, cards } = open();
    expect(tip().style.display).toBe('none');
    cards[0].dispatchEvent(new MouseEvent('mouseenter'));
    expect(tip().style.display).toBe('flex');
    expect(tip().textContent).toContain(boonName(OFFER[0], 0));
    expect(tip().textContent).toContain(boonTooltipText(OFFER[0]));
    cards[0].dispatchEvent(new MouseEvent('mouseleave'));
    expect(tip().style.display).toBe('none');
    menu.hide();
    document.body.replaceChildren();
  });

  it('FOLLOWS the pointer along the row — one panel, re-filled, never a trail', () => {
    const { menu, cards } = open();
    cards[0].dispatchEvent(new MouseEvent('mouseenter'));
    cards[1].dispatchEvent(new MouseEvent('mouseenter'));
    expect(document.querySelectorAll('#refit-card-tooltip')).toHaveLength(1);
    expect(tip().textContent).toContain(boonTooltipText(OFFER[1]));
    expect(tip().textContent).not.toContain(boonTooltipText(OFFER[0]));
    menu.hide();
    document.body.replaceChildren();
  });

  // THE RULING ITSELF. Focus is the keyboard's own arrival on a card, and it
  // deliberately does NOT open the panel — this asymmetry is the feature.
  it('does NOT open on FOCUS — there is deliberately no keyboard path', () => {
    const { menu, cards } = open();
    cards[0].dispatchEvent(new FocusEvent('focus'));
    expect(tip().style.display).toBe('none');
    // ...and focus still ARMS the card, so the keyboard has lost nothing else.
    expect(cards[0].style.borderColor).toBe('var(--hc-amber)');
    menu.hide();
    document.body.replaceChildren();
  });

  it('drops the panel when the band closes — a reopen never inherits a stale hover', () => {
    const { menu, cards } = open();
    cards[0].dispatchEvent(new MouseEvent('mouseenter'));
    expect(tip().style.display).toBe('flex');
    menu.hide();
    expect(tip().style.display).toBe('none');
    document.body.replaceChildren();
  });

  it('takes no pointer events — the panel overhangs the cards it describes', () => {
    const { menu } = open();
    expect(tip().style.pointerEvents).toBe('none');
    menu.hide();
    document.body.replaceChildren();
  });

  // REVIEW GATE, CYCLE 141: the above/below decision went STALE on a resize.
  // `placeTip` ran only inside `showTip`, so a window that shrank while the
  // pointer sat on a card left the panel opening upward into water that was no
  // longer there — clipped at the top, which is the exact outcome amendment 37
  // exists to prevent. The per-frame `place()` now re-decides for the open tip.
  it('re-decides an OPEN tip\'s placement when the viewport resizes under it', () => {
    const TALL = OFFER.indexOf('phosphorShells');
    const before = { w: window.innerWidth, h: window.innerHeight };
    const { menu, cards, view } = open();
    cards[TALL].dispatchEvent(new MouseEvent('mouseenter'));
    const opened = { top: tip().style.top, bottom: tip().style.bottom };
    resizeTo(1280, 614); // the 125% logical floor: 140px of water, a 198px panel
    menu.update(view); // the per-frame refresh, which is how a resize reaches the band
    const resized = { top: tip().style.top, bottom: tip().style.bottom, maxHeight: tip().style.maxHeight };
    const band = refitBandLayout(1280, 614).band;
    resizeTo(before.w, before.h);
    menu.hide();
    document.body.replaceChildren();
    expect(opened.top).toBe('auto'); // it opened ABOVE, where it fitted
    expect(opened.bottom).toBe(`calc(100% + ${REFIT_TIP.gap}px)`);
    expect(resized.top).toBe('0px'); // ...and flipped DOWN when the water went away
    expect(resized.bottom).toBe('auto');
    expect(resized.maxHeight).toBe(`${band.h}px`);
  });

  // AMENDMENT 37 REACHES THE DOM. The rule is pure (refitTooltipPlacement) but
  // it is worth nothing if the two placements are not actually written, so both
  // are taken here on the SAME card. The UI-scale tier is the lever: jsdom's
  // 1024x768 window is 768 logical px at 100% (294px of water — `phosphorShells`
  // fits above at 198px) and 614.4 at the 125% tier (140px — it does not).
  // It was `foulingMines` until Story 8.13: that line became EQUIPMENT and lost
  // its add-on explanation, so its panel is a 43px heading and fits everywhere.
  it('writes the ABOVE placement when the water is deep enough, DOWN when it is not', () => {
    const TALL = OFFER.indexOf('phosphorShells');
    const model = { name: boonName(OFFER[TALL], 0), body: boonTooltipText(OFFER[TALL]) };
    // Measured first, asserted after — a failed expectation inside the loop
    // would strand an open band in the document and poison every later DOM test.
    const seen = [1, 1.25].map((factor) => {
      setUiScaleVar(factor);
      const { menu, cards } = open();
      cards[TALL].dispatchEvent(new MouseEvent('mouseenter'));
      const { top, bottom, maxHeight } = tip().style;
      menu.hide();
      document.body.replaceChildren();
      const band = refitBandLayout(window.innerWidth / factor, window.innerHeight / factor).band;
      return { factor, band, css: { top, bottom, maxHeight }, p: refitTooltipPlacement(model, band) };
    });
    setUiScaleVar(1);
    for (const { factor, band, css, p } of seen) {
      const above = factor === 1;
      expect(p.above, `@${factor}`).toBe(above);
      expect(css.top, `@${factor}`).toBe(above ? 'auto' : '0px');
      expect(css.bottom, `@${factor}`).toBe(above ? `calc(100% + ${REFIT_TIP.gap}px)` : 'auto');
      expect(css.maxHeight, `@${factor}`).toBe(`${above ? refitTooltipMaxPanelH(band.y) : band.h}px`);
    }
  });
});

// --- ERIC'S COLOUR RULING + DESIGN.md's DUAL-CODING FLOOR -----------------------
//
// *"The cards with many copies can use a colour to designate which number in the
// sequence it is, if you want. The cards that are obviously rarer can also get a
// special colour. I'm pretty flexible here, I just want it to be easy to read."*
//
// DESIGN.md · Do's and Don'ts: *"Don't use color alone to carry class, threat, or
// state meaning — dual-code (shape/position/text/audio)."* So each of the two
// distinctions colour now carries must ALSO be readable with the colour removed.

describe('ladder position is colour-coded AND dual-coded; the KIND is a word only', () => {
  it('walks the loot-tier ramp green->blue->purple->red->gold, a DISTINCT hue per rung', () => {
    // Eric's ruling: cards are chrome, not the water, so they may carry the
    // convention every looter has taught players. The rungs must stay DISTINCT
    // — a repeated hue would make two rungs read as the same tier.
    expect(new Set(LINEAGE_TIERS).size).toBe(LINEAGE_TIERS.length);
    for (const def of LINES) {
      if (def.cap <= 1) continue;
      const ramp = Array.from({ length: def.cap }, (_, k) => lineageTint(k, def.cap));
      expect(new Set(ramp).size, def.id).toBe(ramp.length); // no rung repeats a hue
      expect(ramp[0], def.id).toBe(LINEAGE_TIERS[0]); // every ladder starts green
      // ABSOLUTE, not normalised: rung II is blue whether the ladder is 2 or 5
      // long, and a short ladder simply never reaches gold.
      expect(ramp[1], def.id).toBe(LINEAGE_TIERS[1]);
      expect(ramp[ramp.length - 1], def.id).toBe(LINEAGE_TIERS[def.cap - 1]);
    }
    // Only a full five-copy ladder earns the gold capstone.
    expect(lineageTint(4, 5)).toBe(LINEAGE_TIERS[4]);
    expect(lineageTint(1, 2)).not.toBe(LINEAGE_TIERS[4]);
  });

  it('clamps the ramp at both ends and reads the first tier for a line with no ladder', () => {
    expect(lineageTint(-5, 4)).toBe(lineageTint(0, 4));
    expect(lineageTint(99, 4)).toBe(LINEAGE_TIERS[3]); // clamped to the ladder's own last rung
    expect(lineageTint(0, 1)).toBe(LINEAGE_TIERS[0]); // a single-copy line renders no handrail at all
  });

  // THE DUAL-CODING HALF. Strip the colour and the ladder position is still
  // stated in TEXT. Catalog v3 names the LINE, not the rung (one name per line,
  // Eric's sheet §1), so the NAME no longer moves with the stack — the TIER
  // NUMERALS are the text channel, and they move on every rung.
  it('states the ladder position in TEXT too — the numerals move on every rung', () => {
    for (const def of LINES) {
      if (def.kind === 'consumable' || def.kind === 'addon') continue;
      const labels = Array.from({ length: def.cap }, (_, k) => cardTierLabel(def, k));
      expect(new Set(labels).size, def.id).toBe(def.cap);
      for (const l of labels) expect(l, def.id).toMatch(/^[IVX]+( → [IVX]+)?$/);
    }
  });

  // ...and the card's KIND is a WORD and ONLY a word (Eric ruling 2026-09-15,
  // amendment 8): the meta row is neutral, so nothing here is carried by hue at
  // all. Every kind the catalog uses resolves to a DISTINCT word, so the text
  // alone partitions the catalog.
  it('states the kind in TEXT only — four distinct words, no tier colour', () => {
    expect(boonKindLabel('equipment')).toBe('WEAPON');
    expect(boonKindLabel('ladder')).toBe('UPGRADE');
    expect(boonKindLabel('addon')).toBe('ADD-ON');
    expect(boonKindLabel('consumable')).toBe('CONSUMABLE');
    const kinds = [...new Set(LINES.map((d) => d.kind))];
    expect(kinds).toHaveLength(4);
    expect(new Set(kinds.map(boonKindLabel)).size).toBe(kinds.length);
  });

  it('renders the KIND word on the card (the copy count left with the interim face)', () => {
    const you = {
      id: 'me', x: 0, y: 0, heading: 0, speed: 0, hp: 80, alive: true, ammo: [], sweep: 0,
      cls: 'torpedoBoat' as const, pts: 1, offer: ['deckGunTurret', 'heavyTorpedo'], boostUntil: 0,
      cards: [], lvl: 0, xp: 0, repairHp: 0,
    };
    const menu = new UpgradeMenu(() => {});
    menu.toggle(offerView(you as never, false, false, false, []) as OfferView);
    const cards = [...document.querySelectorAll('#upgrade-menu > div:nth-child(2) button')] as HTMLButtonElement[];
    expect(cards[0].textContent).toContain('UPGRADE'); // deckGunTurret — a ladder
    expect(cards[1].textContent).toContain('WEAPON'); // heavyTorpedo — an equipment line
    // STORY 8.7: the "n/cap" count is DELETED — the drawn ladder says the same
    // thing in rungs, and Eric's standing rule is that a readout must earn its
    // place.
    //
    // PINNED AS THE COUNT'S SHAPE, not as a bare slash (Story 8.13). The
    // original assertion was `not.toContain('/')`, a proxy that was already
    // untrue elsewhere on the face — HULL REPAIR's OVER TIME row has read
    // `+50 HP / 5 S` since Story 8.8 — and that the HOMING row's `rad/s`
    // (epic-8 amendment 85) now trips on the weapon faces too. What must stay
    // gone is the COUNT: a number over a number. A unit with a solidus in it
    // is a unit, and the two are told apart by the digits either side.
    const COUNT = /\d\s*\/\s*\d/;
    expect(cards[0].textContent).not.toMatch(COUNT);
    expect(cards[1].textContent).not.toMatch(COUNT);
    menu.hide();
    document.body.replaceChildren();
  });

  it('paints the KIND word NEUTRAL — no tier tint survives anywhere on it', () => {
    const you = {
      id: 'me', x: 0, y: 0, heading: 0, speed: 0, hp: 80, alive: true, ammo: [], sweep: 0,
      cls: 'torpedoBoat' as const, pts: 1, offer: ['deckGunTurret'], boostUntil: 0,
      cards: [], lvl: 0, xp: 0, repairHp: 0,
    };
    const menu = new UpgradeMenu(() => {});
    menu.toggle(offerView(you as never, false, false, false, []) as OfferView);
    const spans = [...document.querySelectorAll('#upgrade-menu > div:nth-child(2) button span')] as HTMLElement[];
    const meta = spans.filter((el) => el.textContent === 'UPGRADE');
    expect(meta).toHaveLength(1);
    for (const el of meta) expect(el.style.color).toBe('var(--hc-text-secondary)');
    menu.hide();
    document.body.replaceChildren();
  });

  it('tints each tier NUMERAL by the rung it names, on the absolute loot ramp', () => {
    const you = {
      id: 'me', x: 0, y: 0, heading: 0, speed: 0, hp: 80, alive: true, ammo: [], sweep: 0,
      cls: 'torpedoBoat' as const, pts: 1, offer: ['radarSweep'], boostUntil: 0,
      cards: ['radarSweep', 'radarSweep'], lvl: 0, xp: 0, repairHp: 0,
    };
    const menu = new UpgradeMenu(() => {});
    menu.toggle(offerView(you as never, false, false, false, []) as OfferView);
    const spans = [...document.querySelectorAll('#upgrade-menu > div:nth-child(2) button span')] as HTMLElement[];
    // Two copies held, so this card is the step II → III: blue, then purple.
    const cur = spans.find((el) => el.textContent === 'II') as HTMLElement;
    const next = spans.find((el) => el.textContent === 'III') as HTMLElement;
    expect(cur).toBeDefined();
    expect(next).toBeDefined();
    expect(cur.style.color).toBe(LINEAGE_TIERS[1]);
    expect(next.style.color).toBe(LINEAGE_TIERS[2]);
    expect(next.style.color).toBe('var(--hc-storm-readout)');
    // The ramp really is doing something: the two numerals differ.
    expect(cur.style.color).not.toBe(next.style.color);
    menu.hide();
    document.body.replaceChildren();
  });
});

// The card geometry the panel hangs off, restated as a guard: the tooltip's
// horizontal placement is derived from the SAME card/gap register the row is
// laid out from, so a card resize moves both together.
describe('the panel is anchored on the band\'s own geometry', () => {
  it('centres over an interior card and clamps at the ends', () => {
    const rowW = FLOOR_BAND.row.w;
    const middle = refitTooltipLeft(1, rowW);
    expect(middle).toBe((R.card + R.gap) + R.card / 2 - REFIT_TIP.width / 2);
    expect(refitTooltipLeft(0, rowW)).toBe(0);
    expect(refitTooltipLeft(3, rowW)).toBe(rowW - REFIT_TIP.width);
  });
});

// THE CONSUMABLE SHAPE LINE ON THE HOVER PANEL (Story 8.7, ruling 13).
//
// UX-DR50 keeps verbs and sentences off the card FACE outright, and a
// consumable's activation shape — does the key fire it, or prime it for a click?
// — is the one thing about the line a player cannot read anywhere else at the
// moment they are choosing it. So the hover panel carries the same interaction
// line the belt's slot tooltip prints, above the explanation.
//
// DORMANT IN 8.7: every consumable is still a stub (amendment 41), so no
// consumable card is ever offered. These pins are what make Story 8.8 a flag
// flip rather than a plumbing job.
describe('the hover panel\'s consumable shape line', () => {
  it('adds the line for a CONSUMABLE and for nothing else', () => {
    const instant = refitTooltipModel({ id: 'hullRepair', kind: 'consumable' }, 'HULL REPAIR', 'body', 0);
    expect(instant.interaction).toBe('CONSUMABLE · 1 · KEY FIRES · ×1');
    const clicked = refitTooltipModel({ id: 'decoyBuoy', kind: 'consumable' }, 'DECOY BUOY', 'body', 0);
    expect(clicked.interaction).toBe('CONSUMABLE · 1 · KEY PRIMES · CLICK FIRES · ×1');
    for (const line of [
      { id: 'radarSweep', kind: 'ladder' },
      { id: 'heavyTorpedo', kind: 'equipment' },
      { id: 'acousticHoming', kind: 'addon' },
    ]) {
      expect(refitTooltipModel(line, 'N', 'body', 0).interaction, line.id).toBeUndefined();
    }
  });

  // THE COUNT IS THE REAL ONE (review patch P7). The panel used to print a
  // hard-coded `×1` whatever the captain was carrying, so a hover over a second
  // copy said `×1` while the belt square beside it said `×2`. The hover is on a
  // card ABOUT TO BE STOCKED, so the number it shows is what the belt WILL read
  // once the card is taken — copies held + this one — which is the same reading
  // the face's ladder and its stat rows already use (they preview the copy
  // being offered, never the one already held).
  it('prints the stock the belt will read AFTER the pick: held + 1', () => {
    const at = (held: number): string | undefined =>
      refitTooltipModel({ id: 'hullRepair', kind: 'consumable' }, 'HULL REPAIR', 'body', held).interaction;
    expect(at(0)).toBe('CONSUMABLE · 1 · KEY FIRES · ×1');
    expect(at(1)).toBe('CONSUMABLE · 1 · KEY FIRES · ×2');
    expect(at(2)).toBe('CONSUMABLE · 1 · KEY FIRES · ×3');
  });

  it('is fed the card\'s OWN stack by the band, never a literal', () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../ui/upgradeMenu.ts'), 'utf8');
    const fn = src.slice(src.indexOf('function tipModelFor('));
    expect(fn.slice(0, 400)).toContain('copy.stack');
  });

  it('costs the panel its own row, and nothing when there is no line', () => {
    const CONTAINER = 400;
    const bare = refitTooltipMetrics({ name: 'HULL REPAIR', body: 'body' }, CONTAINER);
    const withLine = refitTooltipMetrics(
      refitTooltipModel({ id: 'hullRepair', kind: 'consumable' }, 'HULL REPAIR', 'body', 0),
      CONTAINER,
    );
    expect(bare.interactionLines).toBe(0);
    expect(withLine.interactionLines).toBeGreaterThan(0);
    expect(withLine.height).toBeGreaterThan(bare.height);
  });

  it('fits inside the panel, at its shipped width (amendment 42)', () => {
    expect(REFIT_TIP.width).toBe(300);
    for (const id of ['hullRepair', 'shieldBlock', 'smokeScreen', 'chaff', 'decoyBuoy']) {
      const model = refitTooltipModel({ id, kind: 'consumable' }, boonName(id), boonTooltipText(id), 4);
      expect(refitTooltipWidestToken(model), id).toBeLessThanOrEqual(refitTooltipInnerWidth());
      // VERTICALLY the panel is measured against the placement it would take,
      // not against the above-the-band water alone: HULL REPAIR has real prose
      // since Story 8.8, so at the floor it flips DOWN exactly like the tall
      // weapon panels do. The amendment-47 claim is that it fits SOMEWHERE.
      const p = refitTooltipPlacement(model, FLOOR_BAND.band);
      expect(p.height, id).toBeLessThanOrEqual(p.maxH);
    }
  });

  it('renders the row on the card\'s hover panel, hidden for every other kind', () => {
    const you = {
      id: 'me', x: 0, y: 0, heading: 0, speed: 0, hp: 80, alive: true, ammo: [], sweep: 0,
      cls: 'torpedoBoat' as const, pts: 1, offer: ['hullRepair', 'radarSweep'], boostUntil: 0,
      cards: [], lvl: 0, xp: 0, repairHp: 0,
    };
    const menu = new UpgradeMenu(() => {});
    menu.toggle(offerView(you as never, false, false, false, []) as OfferView);
    const cards = [...document.querySelectorAll('#upgrade-menu > div:nth-child(2) button')] as HTMLButtonElement[];
    const tip = document.getElementById('refit-card-tooltip') as HTMLElement;
    const row = (): HTMLElement => tip.children[1] as HTMLElement;
    // HULL REPAIR has no explanation yet (every consumable is a stub), so its
    // panel never opens at all — the shape line is built, not shown. The LADDER
    // beside it does open, and carries no shape line.
    cards[1].dispatchEvent(new MouseEvent('mouseenter'));
    expect(tip.style.display).toBe('flex');
    expect(row().style.display).toBe('none');
    expect(row().textContent).toBe('');
    menu.hide();
    document.body.replaceChildren();
  });
});
