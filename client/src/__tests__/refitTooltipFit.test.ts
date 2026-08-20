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
// band anchor (`bandTopFrac`) and the tooltip's budget can never drift apart:
// lift the band and this pin re-measures with it.

import { describe, expect, it } from 'vitest';
import { BOON_CATALOG, CONFIG, type BoonDef, type ShipClassId } from '@salvo/shared';
import { boonName, boonLineageLine, boonRarityLabel, boonTooltipText } from '../ui/boonCopy.js';
import {
  REFIT_TIP,
  REFIT_TIP_FLOOR_VIEWPORT_H,
  refitTooltipInnerWidth,
  refitTooltipLeft,
  refitTooltipMaxPanelH,
  refitTooltipMetrics,
  refitTooltipWidestToken,
  type RefitTooltipModel,
} from '../ui/refitTooltip.js';
import { UpgradeMenu, lineageAlpha, offerView, refitBandLayout, type OfferView } from '../ui/upgradeMenu.js';
import { CLIENT_CONFIG } from '../config.js';

const R = CLIENT_CONFIG.refit;
const LINES: BoonDef[] = Object.values(BOON_CATALOG);
const CLASSES = Object.keys(CONFIG.shipClasses) as ShipClassId[];

/** The floor viewport's own band, and the container it leaves above itself.
 *  1280 is the logical width of the ≥1600px-gated 125% UI-scale tier; the
 *  height is what boxes the band in from both sides (see `bandTopFrac`). */
const FLOOR_BAND = refitBandLayout(1280, REFIT_TIP_FLOOR_VIEWPORT_H);
const CONTAINER_H = refitTooltipMaxPanelH(FLOOR_BAND.band.y);

/** Every panel the catalog can ever produce: one per line per stack position
 *  (the heading is the ladder name AT THAT RUNG, so it moves with the stack;
 *  the explanation is keyed on the id alone and does not). */
function everyPanel(): { label: string; model: RefitTooltipModel }[] {
  const out: { label: string; model: RefitTooltipModel }[] = [];
  for (const def of LINES) {
    for (let stack = 0; stack < def.copies; stack += 1) {
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
    expect(LINES.length).toBeGreaterThanOrEqual(29);
    expect(PANELS.length).toBe(LINES.reduce((n, d) => n + d.copies, 0));
  });

  it('leaves a real container above the band at the logical floor', () => {
    // The band's top edge IS the queue pips; a panel that grew past it would
    // cover another part of the UX, which is the half of amendment 47 that is
    // about neighbours rather than about a box.
    expect(FLOOR_BAND.band.y).toBeGreaterThan(0);
    expect(CONTAINER_H).toBeGreaterThan(200);
  });

  it('NO panel renders taller than that container, at any stack position', () => {
    const over = PANELS.map(({ label, model }) => ({ label, m: refitTooltipMetrics(model, CONTAINER_H) }))
      .filter((r) => r.m.overflow > 0)
      .map((r) => `${r.label}: ${r.m.height}px > ${CONTAINER_H}px (${r.m.bodyLines} body lines)`);
    expect(over).toEqual([]);
  });

  it('leaves real headroom on the worst panel — the pin is not on the boundary', () => {
    const worst = Math.max(...PANELS.map(({ model }) => refitTooltipMetrics(model, CONTAINER_H).height));
    expect(worst).toBeLessThanOrEqual(CONTAINER_H);
    // Documents the budget: whoever spends the last of it has to look here.
    expect(CONTAINER_H - worst).toBeGreaterThanOrEqual(2);
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
  it('keeps the explanations genuinely explanatory — well past the old card budget', () => {
    const thin = LINES.filter((d) => boonTooltipText(d.id).length <= 90).map((d) => d.id);
    expect(thin).toEqual([]);
  });

  it('is TOTAL over the catalog: every line has a real explanation, stat lines included', () => {
    const blank = LINES.filter((d) => boonTooltipText(d.id).trim() === '').map((d) => d.id);
    expect(blank).toEqual([]);
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
  const OFFER = ['mineCaptive', 'intelSweep', 'shipHull', 'buoyGun'];

  function open(): { menu: UpgradeMenu; cards: HTMLButtonElement[] } {
    const you = {
      id: 'me', x: 0, y: 0, heading: 0, speed: 0, hp: 80, alive: true, ammo: [], sweep: 0,
      cls: 'torpedoBoat' as const, pts: 1, offer: OFFER, boostUntil: 0,
      boons: [], lvl: 0, xp: 0, repairHp: 0,
    };
    const view = offerView(you as never, false, false, false) as OfferView;
    const menu = new UpgradeMenu(() => {});
    menu.toggle(view);
    const cards = [...document.querySelectorAll('#upgrade-menu > div:nth-child(2) button')] as HTMLButtonElement[];
    return { menu, cards };
  }

  const tip = (): HTMLElement => document.getElementById('refit-card-tooltip') as HTMLElement;

  it('is hidden until a pointer enters a card, and shows that card\'s explanation', () => {
    const { menu, cards } = open();
    expect(tip().style.display).toBe('none');
    cards[0].dispatchEvent(new MouseEvent('mouseenter'));
    expect(tip().style.display).toBe('flex');
    // CAPTIVE MINES is Eric's own named example — the panel answers his question.
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

describe('ladder position and rarity are colour-coded AND dual-coded', () => {
  it('ramps the lineage handrail monotonically from the first rung to the last', () => {
    for (const def of LINES) {
      if (def.copies <= 1) continue;
      const ramp = Array.from({ length: def.copies }, (_, k) => lineageAlpha(k, def.copies));
      for (let i = 1; i < ramp.length; i += 1) expect(ramp[i], def.id).toBeGreaterThan(ramp[i - 1]);
      expect(ramp[ramp.length - 1], def.id).toBe(1);
      expect(ramp[0], def.id).toBeGreaterThanOrEqual(0.5); // never dimmer than legible
    }
  });

  it('clamps the ramp at both ends and reads 1 for a line with no ladder', () => {
    expect(lineageAlpha(-5, 4)).toBe(lineageAlpha(0, 4));
    expect(lineageAlpha(99, 4)).toBe(1);
    expect(lineageAlpha(0, 1)).toBe(1); // a single-copy line renders no handrail at all
  });

  // THE DUAL-CODING HALF. Strip the colour and the ladder position is still
  // stated twice in TEXT: by the handrail's numeral and by the ladder name.
  it('states the ladder position in TEXT too — the numeral and the name both move', () => {
    for (const def of LINES) {
      if (def.copies <= 1) continue;
      const handrails = Array.from({ length: def.copies }, (_, k) => boonLineageLine(def, k));
      const names = Array.from({ length: def.copies }, (_, k) => boonName(def.id, k));
      expect(new Set(handrails).size, def.id).toBe(def.copies);
      expect(new Set(names).size, def.id).toBe(def.copies);
      for (const h of handrails) expect(h, def.id).toMatch(/^[IVX]+\/[IVX]+$/);
    }
  });

  // ...and rarity's non-colour channel is the WORD, present or absent. A common
  // shows no tag at all (the absence IS the tier), so the two tiers are told
  // apart with the hue thrown away.
  it('states rarity in TEXT too — the tag is the channel, its colour is the accent', () => {
    expect(boonRarityLabel('common')).toBe('');
    expect(boonRarityLabel('rare')).toBe('RARE');
    // Every SHIPPED tier resolves to a DISTINCT tag, so the word alone
    // partitions the catalog exactly as the colour does.
    const tiers = [...new Set(LINES.map((d) => d.rarity))];
    expect(tiers.length).toBeGreaterThanOrEqual(2);
    expect(new Set(tiers.map(boonRarityLabel)).size).toBe(tiers.length);
  });

  it('renders the rarity WORD on the card, not merely a coloured mark', () => {
    const you = {
      id: 'me', x: 0, y: 0, heading: 0, speed: 0, hp: 80, alive: true, ammo: [], sweep: 0,
      cls: 'torpedoBoat' as const, pts: 1, offer: ['gunTurret', 'intelSweep'], boostUntil: 0,
      boons: [], lvl: 0, xp: 0, repairHp: 0,
    };
    const menu = new UpgradeMenu(() => {});
    menu.toggle(offerView(you as never, false, false, false) as OfferView);
    const cards = [...document.querySelectorAll('#upgrade-menu > div:nth-child(2) button')] as HTMLButtonElement[];
    expect(cards[0].textContent).toContain('RARE'); // gunTurret
    expect(cards[1].textContent).not.toContain('RARE'); // intelSweep — a plain common
    menu.hide();
    document.body.replaceChildren();
  });

  it('takes both tier colours from DESIGN.md tokens, never a fresh literal', () => {
    const you = {
      id: 'me', x: 0, y: 0, heading: 0, speed: 0, hp: 80, alive: true, ammo: [], sweep: 0,
      cls: 'torpedoBoat' as const, pts: 1, offer: ['gunTurret'], boostUntil: 0,
      boons: [], lvl: 0, xp: 0, repairHp: 0,
    };
    const menu = new UpgradeMenu(() => {});
    menu.toggle(offerView(you as never, false, false, false) as OfferView);
    const rarity = [...document.querySelectorAll('#upgrade-menu > div:nth-child(2) button span')].find(
      (el) => el.textContent === 'RARE',
    ) as HTMLElement;
    expect(rarity.style.color).toBe('var(--hc-info)');
    menu.hide();
    document.body.replaceChildren();
  });

  it('rides the handrail on the phosphor token, tinted only by opacity', () => {
    const you = {
      id: 'me', x: 0, y: 0, heading: 0, speed: 0, hp: 80, alive: true, ammo: [], sweep: 0,
      cls: 'torpedoBoat' as const, pts: 1, offer: ['intelSweep'], boostUntil: 0,
      boons: ['intelSweep', 'intelSweep'], lvl: 0, xp: 0, repairHp: 0,
    };
    const menu = new UpgradeMenu(() => {});
    menu.toggle(offerView(you as never, false, false, false) as OfferView);
    const handrail = [...document.querySelectorAll('#upgrade-menu > div:nth-child(2) button span')].find(
      (el) => el.textContent === 'III/V',
    ) as HTMLElement;
    expect(handrail).toBeDefined();
    expect(handrail.style.color).toBe('var(--hc-phosphor)');
    expect(Number(handrail.style.opacity)).toBeCloseTo(lineageAlpha(2, 5), 5);
    // The ramp really is doing something: this rung is brighter than the first.
    expect(lineageAlpha(2, 5)).toBeGreaterThan(lineageAlpha(0, 5));
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
