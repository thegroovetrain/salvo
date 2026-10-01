// THE CONTAINER-FIT PIN for the REFIT CARD'S HOVER TOOLTIP (Story 7-5 wave 2,
// R2.17 — Eric ruling 2026-08-19), plus the rulings that shipped alongside it:
// hover-ONLY (no keyboard path), colour-carries-ladder-position under
// DESIGN.md's dual-coding floor, and (cycle 158, amendment 188) the KIND
// colours — dual-coded by the kind word.
//
// CYCLE 158 (amendment 187): the panel's body is the STAT TABLE of what the card
// touches, valued after the card (`cardHoverRows`) — not prose. The walk below
// is every line × every class × every copy count.
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
import {
  boonName,
  cardHoverRows,
  cardKind,
  cardKindLabel,
  cardTierLabel,
  consumableStatRows,
  statValueText,
  type CardKind,
} from '../ui/boonCopy.js';
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
  KIND_COLORS,
  KIND_EDGES,
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

/** The hover model the band builds for a line at `stack` copies on `cls`. */
function panelFor(def: CatalogLine, stack: number, cls: ShipClassId): RefitTooltipModel {
  const rows = cardHoverRows(def, stack, { cls, cards: Array<string>(stack).fill(def.id) });
  return refitTooltipModel(def, boonName(def.id, stack), rows, stack);
}

/** Every panel the catalog can ever open: every line × class × copies held
 *  0..cap, keeping only those with rows (a card with none opens no panel). */
function everyPanel(): { label: string; model: RefitTooltipModel }[] {
  const out: { label: string; model: RefitTooltipModel }[] = [];
  for (const def of LINES) {
    for (const cls of CLASSES) {
      for (let stack = 0; stack <= def.cap; stack += 1) {
        const model = panelFor(def, stack, cls);
        if (model.stats.length > 0) out.push({ label: `${def.id}@${stack}/${cls}`, model });
      }
    }
  }
  return out;
}

const PANELS = everyPanel();

/** A panel's rows as the DOM prints them, one `LABEL value` per line. */
function rowText(model: RefitTooltipModel): string[] {
  return model.stats.map((r) => `${r.label}${statValueText(r)}`);
}

describe('refit tooltip container fit (amendment 47, re-aimed by R2.17)', () => {
  it('covers every catalog line × class × copies held — every built line opens a panel', () => {
    expect(LINES).toHaveLength(26);
    const lines = new Set(PANELS.map((p) => p.label.split('@')[0]));
    // Only the never-dealt stub opens no panel.
    expect(LINES.filter((d) => !lines.has(d.id)).map((d) => d.id)).toEqual(['depthCharge']);
    expect(PANELS.length).toBe(
      LINES.filter((d) => d.id !== 'depthCharge').reduce((n, d) => n + (d.cap + 1) * CLASSES.length, 0),
    );
  });

  // AMENDMENT 37 (Eric, 2026-09-17) — THE PANEL FLIPS RATHER THAN CLIPS: it
  // opens above the band whenever it fits there, otherwise DOWNWARD from the
  // band's top edge over the card row — never over the bar, never clipped.
  it('opens every panel ABOVE at 1366x768', () => {
    const band = refitBandLayout(1366, 768).band;
    const down = PANELS.filter(({ model }) => !refitTooltipPlacement(model, band).above).map((p) => p.label);
    expect(down).toEqual([]);
    expect(refitTooltipMaxPanelH(band.y)).toBe(340);
  });

  // CYCLE 158: a stat table is much shorter than the prose it replaced (the
  // tallest is a seven-row weapon table, 170px), so at the floor EVERY panel
  // opens above the band. The flip rule still stands (the DOM pins below
  // exercise it on a shorter viewport); the split is still the water line.
  it('opens every panel ABOVE even at the 1280x614 floor — the split is the water line', () => {
    expect(CONTAINER_H).toBe(186);
    const down = PANELS.filter(({ model }) => !refitTooltipPlacement(model, FLOOR_BAND.band).above);
    expect(down.map((p) => p.label)).toEqual([]);
    for (const { label, model } of PANELS) {
      const p = refitTooltipPlacement(model, FLOOR_BAND.band);
      expect(p.above, label).toBe(p.height <= CONTAINER_H);
      expect(p.maxH, label).toBe(CONTAINER_H);
      expect(p.offset, label).toBe(0);
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

  it('leaves real headroom at the floor — the pin is not on the boundary', () => {
    const worst = Math.max(...PANELS.map(({ model }) => refitTooltipMetrics(model, CONTAINER_H).height));
    expect(worst).toBe(170);
    expect(CONTAINER_H - worst).toBeGreaterThanOrEqual(2);
  });

  it('models each stat row as ONE line box, one rowGap before the block', () => {
    const box = Math.ceil(REFIT_TIP.nameSize * REFIT_TIP.nameLineHeight);
    const head = { name: 'X', stats: [] };
    const one = { name: 'X', stats: [{ label: 'A', cur: null, next: '1' }] };
    const two = { name: 'X', stats: [...one.stats, { label: 'B', cur: null, next: '2' }] };
    expect(refitTooltipMetrics(one, 999).height - refitTooltipMetrics(head, 999).height).toBe(REFIT_TIP.rowGap + box);
    expect(refitTooltipMetrics(two, 999).height - refitTooltipMetrics(one, 999).height).toBe(box);
    expect(refitTooltipMetrics(two, 999).statLines).toBe(2);
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
  // is the trade amendment 15 already refused on the card.
  it('keeps amendment 15 legibility: the panel never crashes below 14px', () => {
    expect(REFIT_TIP.nameSize).toBeGreaterThanOrEqual(14);
    expect(REFIT_TIP.nameSize * 0.9).toBeGreaterThanOrEqual(CLIENT_CONFIG.settings.monoFloorPx);
  });

  it('every panel row is a real stat — a label and a value, never blank', () => {
    const blank = PANELS.flatMap(({ label, model }) =>
      model.stats.filter((r) => r.label.trim() === '' || r.next.trim() === '').map(() => label),
    );
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
  // ACOUSTIC HOMING is deleted (Story 8.13, epic-8 amendment 80) and an offer
  // naming a line the catalog does not carry resolves to nothing, so the row is
  // re-cut from lines that exist. FOULING MINES stays — it is an equipment LINE
  // now (amendment 81) rather than an add-on, which is exactly the kind of card
  // this row wants beside a ladder and a verb.
  // STORY 8.17: PHOSPHOR SHELLS stays the TALL card, re-measured — its add-on
  // explanation became the equipment line's DRAFT (240px). The tallest panels
  // (BROADSIDE and HEAVY TORPEDO, 261px) are taller than the floor band itself,
  // so flipped DOWN they are nudged (-17px) rather than seated at the band's
  // top edge — which is not the placement these pins are about.
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

  it('is hidden until a pointer enters a card, and shows that card\'s stat rows', () => {
    const { menu, cards, view } = open();
    expect(tip().style.display).toBe('none');
    cards[0].dispatchEvent(new MouseEvent('mouseenter'));
    expect(tip().style.display).toBe('flex');
    expect(tip().textContent).toContain(boonName(OFFER[0], 0));
    // One DOM line per stat row, label then value.
    const hover = view.options[0].hover;
    expect(hover.length).toBeGreaterThan(0);
    const lines = [...tip().children[2].children] as HTMLElement[];
    expect(lines).toHaveLength(hover.length);
    expect(lines.map((l) => l.textContent)).toEqual(hover.map((r) => `${r.label}${statValueText(r)}`));
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
    // radarSweep's hover is the SHIP table; PHOSPHOR's own BURN row is gone.
    expect(tip().textContent).toContain('RADAR SWEEP');
    expect(tip().textContent).not.toContain('BURN');
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
  // longer there. The per-frame `place()` now re-decides for the open tip.
  // CYCLE 158: every stat panel fits above at the 1280x614 floor, so the shrink
  // here goes past it, to a viewport whose water the tallest panel outgrows.
  const SHORT = { w: 1280, h: 560 };
  it('re-decides an OPEN tip\'s placement when the viewport resizes under it', () => {
    const TALL = OFFER.indexOf('phosphorShells');
    const model = panelFor(CATALOG.phosphorShells, 0, 'torpedoBoat');
    const before = { w: window.innerWidth, h: window.innerHeight };
    const { menu, cards, view } = open();
    cards[TALL].dispatchEvent(new MouseEvent('mouseenter'));
    const opened = { top: tip().style.top, bottom: tip().style.bottom };
    resizeTo(SHORT.w, SHORT.h);
    menu.update(view); // the per-frame refresh, which is how a resize reaches the band
    const resized = { top: tip().style.top, bottom: tip().style.bottom, maxHeight: tip().style.maxHeight };
    const band = refitBandLayout(SHORT.w, SHORT.h).band;
    resizeTo(before.w, before.h);
    menu.hide();
    document.body.replaceChildren();
    const p = refitTooltipPlacement(model, band);
    expect(p.above).toBe(false); // the short viewport really has no water for it
    expect(opened.top).toBe('auto'); // it opened ABOVE, where it fitted
    expect(opened.bottom).toBe(`calc(100% + ${REFIT_TIP.gap}px)`);
    expect(resized.top).toBe(`${-p.offset}px`); // ...and flipped DOWN when the water went away
    expect(resized.bottom).toBe('auto');
    expect(resized.maxHeight).toBe(`${p.maxH}px`);
  });

  // AMENDMENT 37 REACHES THE DOM: both placements written on the SAME card. The
  // UI-scale tier is the lever — jsdom's 1024x768 window is 768 logical px at
  // 100% (340px of water) and 512 at 150% (too little for the 170px panel).
  it('writes the ABOVE placement when the water is deep enough, DOWN when it is not', () => {
    const TALL = OFFER.indexOf('phosphorShells');
    const model = panelFor(CATALOG.phosphorShells, 0, 'torpedoBoat');
    // Measured first, asserted after — a failed expectation inside the loop
    // would strand an open band in the document and poison every later DOM test.
    const seen = [1, 1.5].map((factor) => {
      setUiScaleVar(factor);
      const { menu, cards } = open();
      cards[TALL].dispatchEvent(new MouseEvent('mouseenter'));
      const { top, bottom, maxHeight } = tip().style;
      menu.hide();
      document.body.replaceChildren();
      const band = refitBandLayout(window.innerWidth / factor, window.innerHeight / factor).band;
      return { factor, css: { top, bottom, maxHeight }, p: refitTooltipPlacement(model, band) };
    });
    setUiScaleVar(1);
    for (const { factor, css, p } of seen) {
      const above = factor === 1;
      expect(p.above, `@${factor}`).toBe(above);
      expect(css.top, `@${factor}`).toBe(above ? 'auto' : `${-p.offset}px`);
      expect(css.bottom, `@${factor}`).toBe(above ? `calc(100% + ${REFIT_TIP.gap}px)` : 'auto');
      expect(css.maxHeight, `@${factor}`).toBe(`${p.maxH}px`);
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

describe('ladder position and KIND are colour-coded AND dual-coded', () => {
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

  // THE KIND (Eric ruling 2026-09-30, epic-8 amendment 188 — supersedes
  // amendment 8's neutral word): WEAPON phosphor · WEAPON UPGRADE info · SHIP
  // UPGRADE storm-readout · CONSUMABLE silver, on the word and the resting
  // edge. DUAL-CODED: strip the colour and the WORD still names the kind — every
  // kind has its own distinct word, so the text alone partitions the cards.
  it('states the kind in TEXT as well as colour — five distinct words, five distinct colours', () => {
    const KINDS: readonly CardKind[] = ['weapon', 'weaponUpgrade', 'shipUpgrade', 'consumable', 'addon'];
    expect(new Set(KINDS.map(cardKindLabel)).size).toBe(KINDS.length);
    expect(new Set(KINDS.map((k) => KIND_COLORS[k])).size).toBe(KINDS.length);
    expect(KIND_COLORS).toEqual({
      weapon: 'var(--hc-phosphor)',
      weaponUpgrade: 'var(--hc-info)',
      shipUpgrade: 'var(--hc-storm-readout)',
      consumable: 'var(--hc-silver)',
      addon: 'var(--hc-text-secondary)',
    });
    // Eric's picks keep clear of the two state colours this surface already uses.
    for (const k of KINDS) {
      expect(KIND_COLORS[k], k).not.toBe('var(--hc-amber)');
      expect(KIND_COLORS[k], k).not.toBe('var(--hc-denied)');
    }
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
    expect(cards[0].textContent).toContain('WEAPON UPGRADE'); // deckGunTurret — a gun ladder
    expect(cards[1].textContent).toContain('WEAPON'); // heavyTorpedo copy 1 — the fit
    expect(cards[1].textContent).not.toContain('UPGRADE');
    // The "n/cap" count stays DELETED (Story 8.7): a number over a number.
    const COUNT = /\d\s*\/\s*\d/;
    expect(cards[0].textContent).not.toMatch(COUNT);
    expect(cards[1].textContent).not.toMatch(COUNT);
    menu.hide();
    document.body.replaceChildren();
  });

  it('paints the KIND word and the resting edge in the kind\'s colour; armed stays amber', () => {
    const you = {
      id: 'me', x: 0, y: 0, heading: 0, speed: 0, hp: 80, alive: true, ammo: [], sweep: 0,
      cls: 'torpedoBoat' as const, pts: 1, offer: ['heavyTorpedo', 'deckGunTurret', 'armor', 'hullRepair'],
      boostUntil: 0, cards: [], lvl: 0, xp: 0, repairHp: 0,
    };
    const menu = new UpgradeMenu(() => {});
    menu.toggle(offerView(you as never, false, false, false, []) as OfferView);
    const cards = [...document.querySelectorAll('#upgrade-menu > div:nth-child(2) button')] as HTMLButtonElement[];
    const expected: CardKind[] = ['weapon', 'weaponUpgrade', 'shipUpgrade', 'consumable'];
    expected.forEach((kind, i) => {
      const line = CATALOG[you.offer[i]];
      expect(cardKind(line, 0), line.id).toBe(kind);
      const word = cardKindLabel(kind);
      const spans = [...cards[i].querySelectorAll('span')] as HTMLElement[];
      const meta = spans.filter((el) => el.textContent === word);
      expect(meta, `${line.id} kind word`).toHaveLength(1);
      expect(meta[0].style.color, line.id).toBe(KIND_COLORS[kind]);
      // jsdom normalises the rgba() string; compare through a probe element.
      const probe = document.createElement('div');
      probe.style.borderColor = KIND_EDGES[kind];
      expect(cards[i].style.borderColor, line.id).toBe(probe.style.borderColor);
    });
    // ARMED: the edge flips to amber and the kind word KEEPS its colour.
    cards[0].dispatchEvent(new MouseEvent('mouseenter'));
    expect(cards[0].style.borderColor).toBe('var(--hc-amber)');
    const word = ([...cards[0].querySelectorAll('span')] as HTMLElement[]).find((el) => el.textContent === 'WEAPON');
    expect(word?.style.color).toBe(KIND_COLORS.weapon);
    cards[0].dispatchEvent(new MouseEvent('mouseleave'));
    expect(cards[0].style.borderColor).not.toBe('var(--hc-amber)');
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
    const instant = refitTooltipModel({ id: 'hullRepair', kind: 'consumable' }, 'HULL REPAIR', [], 0);
    expect(instant.interaction).toBe('CONSUMABLE · 1 · KEY FIRES · ×1');
    const clicked = refitTooltipModel({ id: 'decoyBuoy', kind: 'consumable' }, 'DECOY BUOY', [], 0);
    expect(clicked.interaction).toBe('CONSUMABLE · 1 · KEY PRIMES · CLICK FIRES · ×1');
    for (const line of [
      { id: 'radarSweep', kind: 'ladder' },
      { id: 'heavyTorpedo', kind: 'equipment' },
      { id: 'acousticHoming', kind: 'addon' },
    ]) {
      expect(refitTooltipModel(line, 'N', [], 0).interaction, line.id).toBeUndefined();
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
      refitTooltipModel({ id: 'hullRepair', kind: 'consumable' }, 'HULL REPAIR', [], held).interaction;
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
    const rows = consumableStatRows('hullRepair');
    const bare = refitTooltipMetrics({ name: 'HULL REPAIR', stats: rows }, CONTAINER);
    const withLine = refitTooltipMetrics(
      refitTooltipModel({ id: 'hullRepair', kind: 'consumable' }, 'HULL REPAIR', rows, 0),
      CONTAINER,
    );
    expect(bare.interactionLines).toBe(0);
    expect(withLine.interactionLines).toBeGreaterThan(0);
    expect(withLine.height).toBeGreaterThan(bare.height);
  });

  it('fits inside the panel, at its shipped width (amendment 42)', () => {
    expect(REFIT_TIP.width).toBe(300);
    for (const id of ['hullRepair', 'shieldBlock', 'smokeScreen', 'chaff', 'decoyBuoy']) {
      const model = refitTooltipModel({ id, kind: 'consumable' }, boonName(id), consumableStatRows(id), 4);
      expect(refitTooltipWidestToken(model), id).toBeLessThanOrEqual(refitTooltipInnerWidth());
      // VERTICALLY the panel is measured against the placement it would take.
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
    // HULL REPAIR's panel carries its shape line ABOVE its rows (ruling 13)...
    cards[0].dispatchEvent(new MouseEvent('mouseenter'));
    expect(tip.style.display).toBe('flex');
    expect(row().style.display).toBe('block');
    expect(row().textContent).toBe('CONSUMABLE · 1 · KEY FIRES · ×1');
    expect(tip.children[2].textContent).toContain('INSTANT');
    // ...and the LADDER beside it opens with no shape line.
    cards[1].dispatchEvent(new MouseEvent('mouseenter'));
    expect(tip.style.display).toBe('flex');
    expect(row().style.display).toBe('none');
    expect(row().textContent).toBe('');
    menu.hide();
    document.body.replaceChildren();
  });
});
