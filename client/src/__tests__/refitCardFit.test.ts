// THE CONTAINER-FIT PIN for the refit card (amendment 47: "nothing anywhere in
// the game may render larger than its container — no text or element may extend
// past its box such that it covers, or can be covered by, another part of the
// UX"). Story 2.8 shipped exclusive doctrine cards whose rules text ran 50–97px
// PAST the card bottom on the live site; this suite is what makes that
// unshippable from here on.
//
// It walks EVERY BOON_CATALOG line in its WORST-CASE presentation state —
//   • every stack position 0..copies-1 (the ladder's longest rung, the lineage
//     handrail at its widest, and the biggest current→next numbers all move
//     with the stack),
//   • every ship class (class stats change the printed values),
//   • both build extremes: a bare hull (smallest numbers) AND a maximally
//     stacked build (largest numbers — 1136.9 → 1307.4 is four more glyphs than
//     330 → 369.6),
//   • the rival doctrine HELD, so every exclusive card carries its REPLACES line
// — and asserts the rendered content fits the card's inner box.
//
// It also guards the two laws that constrain the FIX, so a future "fix" cannot
// simply delete its way out of a failure: amendment 15's legibility floor (the
// rules text never crashes back below 14px) and "rules text is the contract"
// (every line still prints its behavior; every stat line still prints its live
// current → next).

import { describe, expect, it } from 'vitest';
import { BOON_CATALOG, CONFIG, type BoonDef, type ShipClassId } from '@salvo/shared';
import {
  boonCategoryLabel,
  boonDescription,
  boonLineageLine,
  boonName,
  boonRarityLabel,
  boonReplacesLine,
} from '../ui/boonCopy.js';
import {
  MONO_ADVANCE_EM,
  REFIT_TYPE,
  monoWrapLines,
  refitCardInnerBox,
  refitCardMetrics,
  widestToken,
  type RefitCardCopy,
} from '../ui/refitCardFit.js';
import { UpgradeMenu, offerView } from '../ui/upgradeMenu.js';
import { CLIENT_CONFIG } from '../config.js';

const R = CLIENT_CONFIG.refit;
const LINES: BoonDef[] = Object.values(BOON_CATALOG);
const CLASSES = Object.keys(CONFIG.shipClasses) as ShipClassId[];

/** A maximally stacked build — every non-exclusive line at its full copy count.
 *  Not a reachable deck state; it is the UPPER BOUND on the number of glyphs a
 *  `current → next` sentence can print, which is exactly what a fit pin wants. */
const MAXED = LINES.filter((d) => d.rarity !== 'exclusive').flatMap((d) => Array<string>(d.copies).fill(d.id));

/** The fitted-boon list a worst case is measured against: the rival doctrine is
 *  always held (so exclusives carry their REPLACES line) and the line under test
 *  sits at `stack` copies. */
function heldBoons(def: BoonDef, stack: number, maxed: boolean): string[] {
  const base = maxed ? MAXED.filter((id) => id !== def.id) : [];
  const rival = def.exclusiveWith ? [def.exclusiveWith] : [];
  return [...base, ...rival, ...Array<string>(stack).fill(def.id)];
}

/** The card face exactly as ui/upgradeMenu.ts's toCard() builds it. */
function faceOf(def: BoonDef, stack: number, cls: ShipClassId, maxed: boolean): RefitCardCopy {
  const boons = heldBoons(def, stack, maxed);
  return {
    category: boonCategoryLabel(def.category),
    rarity: boonRarityLabel(def.rarity),
    name: boonName(def.id, stack),
    lineage: boonLineageLine(def, stack),
    replaces: boonReplacesLine(def, boons),
    description: boonDescription(def, { cls, boons }),
  };
}

/** Every worst-case presentation state of every catalog line, labelled. */
function everyFace(): { label: string; face: RefitCardCopy }[] {
  const out: { label: string; face: RefitCardCopy }[] = [];
  for (const def of LINES) {
    for (let stack = 0; stack < def.copies; stack += 1) {
      for (const cls of CLASSES) {
        for (const maxed of [false, true]) {
          out.push({ label: `${def.id}@${stack}/${cls}${maxed ? '/maxed' : ''}`, face: faceOf(def, stack, cls, maxed) });
        }
      }
    }
  }
  return out;
}

const FACES = everyFace();

describe('refit card container fit (amendment 47)', () => {
  it('covers every catalog line at every stack position', () => {
    expect(LINES.length).toBeGreaterThanOrEqual(36);
    expect(FACES.length).toBe(LINES.reduce((n, d) => n + d.copies, 0) * CLASSES.length * 2);
  });

  it('NO card renders taller than its inner box, in any presentation state', () => {
    const inner = refitCardInnerBox();
    const over = FACES.map(({ label, face }) => ({ label, m: refitCardMetrics(face), face }))
      .filter((r) => r.m.overflow > 0)
      .map((r) => `${r.label}: ${r.m.height}px > ${inner.h}px (name ${r.m.nameLines}L, rules ${r.m.descLines}L) — "${r.face.description}"`);
    expect(over).toEqual([]);
  });

  it('the meta row (category + tier tag) fits ONE line on every card', () => {
    const inner = refitCardInnerBox();
    const wrapped = FACES.filter(({ face }) => refitCardMetrics(face).metaLines > 1).map(
      ({ label, face }) => `${label}: ${refitCardMetrics(face).metaWidth}px > ${inner.w}px (${face.category} + ${face.rarity})`,
    );
    expect(wrapped).toEqual([]);
  });

  it('no ladder name carries a token too wide to fit the card, so names never mid-word break', () => {
    const inner = refitCardInnerBox();
    const tooWide = FACES.filter(
      ({ face }) => widestToken(face.name, R.nameSize, REFIT_TYPE.nameLetterSpacing) > inner.w,
    ).map(({ face }) => face.name);
    expect(tooWide).toEqual([]);
  });

  it('leaves real headroom on the worst card — the pin is not sitting on the boundary', () => {
    const inner = refitCardInnerBox();
    const worst = Math.max(...FACES.map(({ face }) => refitCardMetrics(face).height));
    expect(worst).toBeLessThanOrEqual(inner.h);
    // Documents the fit budget: whoever spends the last of it has to look here.
    expect(inner.h - worst).toBeGreaterThanOrEqual(2);
  });
});

describe('the laws that constrain the fix', () => {
  it('keeps amendment 15 legibility: rules text never crashes back below 14px', () => {
    expect(R.descSize).toBeGreaterThanOrEqual(14);
    expect(R.nameSize).toBeGreaterThanOrEqual(20);
    expect(R.categorySize).toBeGreaterThanOrEqual(14);
  });

  it('keeps every card font clear of the 9px mono accessibility floor at the 90% tier', () => {
    const smallest = Math.min(R.categorySize, R.nameSize, R.descSize, R.raritySize, R.lineageSize);
    expect(smallest * 0.9).toBeGreaterThanOrEqual(CLIENT_CONFIG.settings.monoFloorPx);
  });

  it('keeps the contract: EVERY catalog line still prints rules text', () => {
    const blank = LINES.filter((def) => faceOf(def, 0, 'torpedoBoat', false).description.trim() === '').map((d) => d.id);
    expect(blank).toEqual([]);
  });

  it('keeps the contract: every STAT line still prints its live current → next', () => {
    const doctrineOrAcquire = new Set(
      LINES.filter((d) => d.rarity === 'exclusive' || d.effects.some((e) => e.kind === 'slotFill')).map((d) => d.id),
    );
    const missing = LINES.filter((d) => !doctrineOrAcquire.has(d.id))
      .filter((def) => !faceOf(def, 0, 'torpedoBoat', false).description.includes('→'))
      .map((d) => d.id);
    expect(missing).toEqual([]);
  });

  it('keeps the contract: no doctrine card was tightened down to a stub', () => {
    const stubs = LINES.filter((d) => d.rarity === 'exclusive')
      .filter((def) => faceOf(def, 0, 'torpedoBoat', false).description.length < 60)
      .map((d) => d.id);
    expect(stubs).toEqual([]);
  });
});

describe('the belt-and-braces clip (NOT the fix — the pin above is)', () => {
  it('hangs every text row off a clipped body, and leaves the key chip outside the clip', () => {
    const menu = new UpgradeMenu(() => {});
    const you = {
      id: 'me', x: 0, y: 0, heading: 0, speed: 0, hp: 80, alive: true, ammo: [], sweep: 0,
      cls: 'torpedoBoat' as const, pts: 1, offer: ['cannonAp', 'gunDamage'], boostUntil: 0,
      boons: ['cannonArcing'], lvl: 0, xp: 0, repairHp: 0,
    };
    menu.toggle(offerView(you, false, false, false)!);
    const card = document.querySelector('#upgrade-menu button') as HTMLElement;
    // The chip is still the card's FIRST child (the pinned digit→slot mapping)
    // and it is NOT inside the clipped body — it overhangs the corner by design.
    expect((card.firstElementChild as HTMLElement).textContent).toBe('1');
    expect(card.style.overflow).toBe('');
    const body = card.lastElementChild as HTMLElement;
    expect(body.tagName).toBe('DIV');
    expect(body.style.overflow).toBe('hidden');
    expect(body.style.minHeight).toBe('0px');
    // The card box itself is the fixed container the pin measures against.
    expect(card.style.height).toBe(`${R.cardHeight}px`);
    expect(card.style.boxSizing).toBe('border-box');
    // Every text row declares the explicit line-height the model measures with.
    const rows = [...body.children].filter((el) => el.tagName === 'SPAN') as HTMLElement[];
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.style.overflowWrap).toBe('anywhere');
    menu.hide();
    document.body.replaceChildren();
  });
});

describe('the wrap math itself', () => {
  it('models the declared mono stack (Geist Mono 0.6em, Menlo 0.6021em) with margin', () => {
    expect(MONO_ADVANCE_EM).toBeGreaterThanOrEqual(0.6021);
    expect(MONO_ADVANCE_EM).toBeLessThan(0.62); // still tight enough to be useful
  });

  it('breaks greedily on whitespace — the conservative (upper-bound) line count', () => {
    // 20 chars per line at 15px/0 tracking inside 186px.
    expect(monoWrapLines('', 15, 0, 186)).toBe(0);
    expect(monoWrapLines('short', 15, 0, 186)).toBe(1);
    expect(monoWrapLines('12345678901234567890', 15, 0, 186)).toBe(1);
    expect(monoWrapLines('12345678901234567890 x', 15, 0, 186)).toBe(2);
  });

  it('hard-breaks a single token wider than the box (what overflow-wrap:anywhere does)', () => {
    expect(monoWrapLines('1234567890123456789012345', 15, 0, 186)).toBe(2);
    expect(monoWrapLines('x '.repeat(0) + 'y'.repeat(61), 15, 0, 186)).toBe(4);
  });
});
