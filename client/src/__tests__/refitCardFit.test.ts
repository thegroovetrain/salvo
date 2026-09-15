// THE CONTAINER-FIT PIN for the refit card (amendment 47: "nothing anywhere in
// the game may render larger than its container — no text or element may extend
// past its box such that it covers, or can be covered by, another part of the
// UX"). Story 2.8 shipped exclusive doctrine cards whose rules text ran 50–97px
// PAST the card bottom on the live site; this suite is what makes that
// unshippable from here on.
//
// It walks EVERY CATALOG line in its WORST-CASE presentation state —
//   • every stack position 0..copies-1 (the ladder's longest rung, the lineage
//     handrail at its widest, and the biggest current→next numbers all move
//     with the stack),
//   • every ship class (class stats change the printed values),
//   • both build extremes: a bare hull (smallest numbers) AND a maximally
//     stacked build (largest numbers — 1136.9 → 1307.4 is four more glyphs than
//     330 → 369.6),
// — and asserts the rendered content fits the card's inner box.
//
// STORY 7-5 WAVE 2 dropped the REPLACES row from the model: exclusivity is
// deleted (R2.6), so no card can carry a fourth text line and the "rival held"
// dimension of the sweep is retired with it. That FREES a wrapped line of the
// fit budget rather than spending one — the headroom pin below still guards it.
//
// STORY 7-5 WAVE 2 ALSO RE-AIMED THIS SUITE (R2.17 — Eric ruling 2026-08-19).
// The card face went minimal: ladder name, lineage marker, rarity tag, and a
// `current → next` sentence ONLY where the line moves a number. The explanation
// moved to a hover tooltip with a container of its own
// (__tests__/refitTooltipFit.test.ts). So amendment 47's ~90-character budget is
// NOT relaxed — it is re-pointed at WHAT NOW SITS ON THE FACE, which is the stat
// sentence. Two boxes, two pins, one law; this file owns the 216×236 card.
//
// The knock-on for the "laws that constrain the fix" block below is that its
// "every line still prints rules text" clause CHANGED SUBJECT rather than
// dying: a verb card printing nothing on the face is now CORRECT, so the pin
// asks the two questions that are still failures — a stat line that has gone
// silent, and a verb card that has crept prose back onto the face.
//
// It also guards the law that constrains the FIX, so a future "fix" cannot
// simply delete its way out of a failure: amendment 15's legibility floor (the
// rules text never crashes back below 14px).

import { describe, expect, it } from 'vitest';
import { CATALOG, CONFIG, type CatalogLine, type ShipClassId } from '@salvo/shared';
import {
  boonDescription,
  boonKindLabel,
  boonLineageLine,
  boonName,
  boonTooltipText,
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
const LINES: CatalogLine[] = Object.values(CATALOG);
const CLASSES = Object.keys(CONFIG.shipClasses) as ShipClassId[];

/** A maximally stacked build — EVERY line at its full copy count. Not a
 *  reachable deck state; it is the UPPER BOUND on the number of glyphs a
 *  `current → next` sentence can print, which is exactly what a fit pin wants. */
const MAXED = LINES.flatMap((d) => Array<string>(d.cap).fill(d.id));

/** The fitted-card list a worst case is measured against: the line under test
 *  sits at `stack` copies, on top of a bare or a maximally stacked build. */
function heldCards(line: CatalogLine, stack: number, maxed: boolean): string[] {
  const base = maxed ? MAXED.filter((id) => id !== line.id) : [];
  return [...base, ...Array<string>(stack).fill(line.id)];
}

/** The card face exactly as ui/upgradeMenu.ts's toCard() builds it. */
function faceOf(line: CatalogLine, stack: number, cls: ShipClassId, maxed: boolean): RefitCardCopy {
  const cards = heldCards(line, stack, maxed);
  return {
    kind: boonKindLabel(line.kind),
    count: `${Math.min(stack, line.cap)}/${line.cap}`,
    name: boonName(line.id, stack),
    lineage: boonLineageLine(line, stack),
    description: boonDescription(line, { cls, cards }),
  };
}

interface FaceCase {
  id: string;
  label: string;
  face: RefitCardCopy;
}

/** Every worst-case presentation state of every catalog line, labelled. */
function everyFace(): FaceCase[] {
  const out: FaceCase[] = [];
  for (const def of LINES) {
    for (let stack = 0; stack < def.cap; stack += 1) {
      for (const cls of CLASSES) {
        for (const maxed of [false, true]) {
          const label = `${def.id}@${stack}/${cls}${maxed ? '/maxed' : ''}`;
          out.push({ id: def.id, label, face: faceOf(def, stack, cls, maxed) });
        }
      }
    }
  }
  return out;
}

const FACES = everyFace();

describe('refit card container fit (amendment 47)', () => {
  // Catalog v3: 29 lines / 114 physical cards (Eric's sheet, §1).
  it('covers every catalog line at every stack position', () => {
    expect(LINES).toHaveLength(29);
    expect(LINES.reduce((n, d) => n + d.cap, 0)).toBe(114);
    expect(FACES.length).toBe(LINES.reduce((n, d) => n + d.cap, 0) * CLASSES.length * 2);
  });

  it('NO card renders taller than its inner box, in any presentation state', () => {
    const inner = refitCardInnerBox();
    const over = FACES.map(({ label, face }) => ({ label, m: refitCardMetrics(face), face }))
      .filter((r) => r.m.overflow > 0)
      .map((r) => `${r.label}: ${r.m.height}px > ${inner.h}px (name ${r.m.nameLines}L, rules ${r.m.descLines}L) — "${r.face.description}"`);
    expect(over).toEqual([]);
  });

  it('the meta row (kind word + copy count) fits ONE line on every card', () => {
    const inner = refitCardInnerBox();
    const wrapped = FACES.filter(({ face }) => refitCardMetrics(face).metaLines > 1).map(
      ({ label, face }) => `${label}: ${refitCardMetrics(face).metaWidth}px > ${inner.w}px (${face.kind} + ${face.count})`,
    );
    expect(wrapped).toEqual([]);
  });

  // The a11y pin (Eric ruling 2026-09-15, amendment 8): the card's KIND is a
  // WORD, never a colour — the v2 rarity tint is deleted and nothing replaced
  // it, so this row has to carry its meaning in glyphs.
  it('every card states its kind as a WORD, one of catalog v3\'s four', () => {
    const WORDS = ['WEAPON', 'UPGRADE', 'ADD-ON', 'CONSUMABLE'];
    const odd = [...new Set(FACES.map(({ face }) => face.kind))].filter((w) => !WORDS.includes(w));
    expect(odd).toEqual([]);
    expect([...new Set(FACES.map(({ face }) => face.kind))].sort()).toEqual([...WORDS].sort());
  });

  // ONE EXCEPTION, NAMED (Story 8.1). Catalog v3 §1's SUPERCAVITATING TORPEDO
  // carries a 15-glyph unbreakable token that is wider than the 186px inner box
  // at the card's 20px name size, so it is the one line whose name wraps
  // mid-word. It does NOT overflow the card — `overflow-wrap:anywhere` breaks it
  // and the height pin above still passes — it just reads less well than every
  // other name. The name is Eric's own sheet copy and the real card face is
  // Story 8.6's, so this is FLAGGED rather than solved here, and the exemption
  // is exact so it cannot quietly grow.
  const WIDE_NAME_EXEMPT: readonly string[] = ['supercavTorpedo'];

  it('no line name carries a token too wide to fit the card, so names never mid-word break', () => {
    const inner = refitCardInnerBox();
    const tooWide = FACES.filter(({ id }) => !WIDE_NAME_EXEMPT.includes(id))
      .filter(({ face }) => widestToken(face.name, R.nameSize, REFIT_TYPE.nameLetterSpacing) > inner.w)
      .map(({ face }) => face.name);
    expect(tooWide).toEqual([]);
  });

  it('the wide-name exemption cannot rot — each id on it really is too wide', () => {
    const inner = refitCardInnerBox();
    const stale = WIDE_NAME_EXEMPT.filter(
      (id) => widestToken(boonName(id), R.nameSize, REFIT_TYPE.nameLetterSpacing) <= inner.w,
    );
    expect(stale).toEqual([]);
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
    const smallest = Math.min(R.categorySize, R.nameSize, R.descSize, R.kindSize, R.lineageSize);
    expect(smallest * 0.9).toBeGreaterThanOrEqual(CLIENT_CONFIG.settings.monoFloorPx);
  });

  // Keyed off the EFFECT SHAPE, not a tier: a line whose copies fit a weapon,
  // bolt on a verb or stock a rack has no number to print, so it is exempt from
  // the `current → next` contract and bound by the MINIMAL-face pin instead.
  // In catalog v3 that is every equipment line, every add-on and every
  // consumable — the stat lines left are the five ladders and the deck-gun
  // family.
  const VERBS = new Set<string>(LINES.filter((d) => d.kind !== 'ladder').map((d) => d.id));

  it('keeps the contract: every STAT line still prints its live current → next', () => {
    const missing = LINES.filter((d) => !VERBS.has(d.id))
      .filter((line) => !faceOf(line, 0, 'torpedoBoat', false).description.includes('→'))
      .map((d) => d.id);
    expect(missing).toEqual([]);
  });

  // THE RE-AIMED HALF (R2.17). The old pin here demanded ≥60 characters of
  // rules text off every doctrine card; that requirement is what the ruling
  // deleted. Its replacement is the OPPOSITE failure — a verb card that has
  // crept prose back onto the face — checked in EVERY presentation state, so a
  // future edit cannot reintroduce the overflow this suite exists to stop.
  it('keeps the face MINIMAL: a weapon, add-on or consumable card carries no prose', () => {
    const talkative = FACES.filter(({ id, face }) => VERBS.has(id) && face.description !== '').map(
      ({ label, face }) => `${label}: "${face.description}"`,
    );
    expect(talkative).toEqual([]);
  });

  // ...and the explanation really did land somewhere, rather than being cut.
  // The tooltip's OWN container pin lives in __tests__/refitTooltipFit.test.ts;
  // this is the seam check that the two halves of R2.17 both happened.
  // PARTIAL since catalog v3 (Story 8.1): a line whose MECHANISM is not built
  // has nothing honest to explain, and inventing copy for a weapon nobody has
  // played is what the naming law forbids. The pin is therefore "every line that
  // CAN be explained is", with the exemptions named exactly so the list cannot
  // rot — an agent who builds one of these has to delete its entry.
  const NO_EXPLANATION: readonly string[] = [
    'turning', 'deckGun', // new in v3: no v2 line to carry text from
    'lightTorpedo', 'supercavTorpedo', 'captiveMines', 'missile', 'machineGun', 'flak', 'monitor',
    'hullRepair', 'shieldBlock', 'smokeScreen', 'chaff', 'decoyBuoy', 'heatSeeking',
  ];

  it('keeps the contract: what left the face is on the hover tooltip, for every built line', () => {
    const silent = LINES.filter((line) => boonTooltipText(line.id).trim() === '').map((d) => d.id);
    expect(silent.sort()).toEqual([...NO_EXPLANATION].sort());
  });
});

describe('the belt-and-braces clip (NOT the fix — the pin above is)', () => {
  it('hangs every text row off a clipped body, and leaves the key chip outside the clip', () => {
    const menu = new UpgradeMenu(() => {});
    const you = {
      id: 'me', x: 0, y: 0, heading: 0, speed: 0, hp: 80, alive: true, ammo: [], sweep: 0,
      cls: 'torpedoBoat' as const, pts: 1, offer: ['captiveMines', 'radarSweep'], boostUntil: 0,
      cards: [], lvl: 0, xp: 0, repairHp: 0,
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
