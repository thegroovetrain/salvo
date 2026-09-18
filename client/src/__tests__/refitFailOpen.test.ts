// FAIL-OPEN ON THE CLASS TABLE (cycle 91). Two lookups on the boon-pick render
// path indexed `CONFIG.shipClasses` with no `Object.hasOwn` gate, while every
// other catalog/registry lookup in the engine has one. Both run EVERY FRAME
// while the refit band is open — i.e. exactly while the player is choosing a
// card — and an unresolvable `cls` hands `effectiveStats` an undefined spec,
// which throws on `cls.kinematics`. Inside the ticker callback that meant a
// permanent freeze (see loopContainment.test.ts).
//
// Unreachable while client and server share a PROTOCOL_VERSION, so this is
// defence in depth — but it is the only ungated throw shape the boon-cards
// investigation found on that path, and version skew is exactly the condition
// that would make it look intermittent and player-specific.

import { describe, it, expect } from 'vitest';
import { CATALOG, CONFIG, effectiveStats, type OwnShip } from '@salvo/shared';
import { boonDescription, boonTooltipText } from '../ui/boonCopy.js';
import { beltPressDenied } from '../input/keyboard.js';
import { makeOffer } from '../ui/results.js';

const KNOWN = { cls: 'torpedoBoat', cards: [] as string[] };
const UNKNOWN = { cls: 'notAHull', cards: [] as string[] };

/** The catalog ids whose card text is a computed `current → next` sentence —
 *  derived from behavior on a REAL hull rather than by duplicating the
 *  STAT_LINES table, so this cannot drift from it. Doctrine and acquisition
 *  lines print static rules text and need no hull. */
const STAT_LINES_WITH_NUMBERS: Record<string, true> = Object.fromEntries(
  Object.values(CATALOG)
    .filter((d) => boonDescription(d, KNOWN as never).includes('→'))
    .map((d) => [d.id, true]),
);

describe('boonDescription — an unresolvable hull renders nothing, never throws', () => {
  it('returns rules text for a real hull (the control)', () => {
    const def = CATALOG['reload'];
    const text = boonDescription(def, KNOWN as never);
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain('→');
  });

  it('returns empty text for an unknown hull instead of throwing', () => {
    const def = CATALOG['reload'];
    expect(() => boonDescription(def, UNKNOWN as never)).not.toThrow();
    expect(boonDescription(def, UNKNOWN as never)).toBe('');
  });

  // RE-AIMED BY R2.17 (Story 7-5 wave 2). This pin used to guard a DANGLING
  // NOTE: the deleted INTEL RANGE line carried a standing rider, so an
  // unresolvable hull that skipped the guard printed " Sight, gun, broadside and
  // star shells reach with it." with a leading space and no numbers. The riders
  // left the card face entirely — the face is now the stat sentence alone — so
  // that exact shape is unreachable and its subject is gone.
  //
  // What survives is the CLAUSE the guard actually protects, which R2.17 makes
  // sharper rather than weaker: a stat card's face is ALL numbers, so an
  // unresolvable hull must print the empty string and never a fragment of the
  // template. Checked over EVERY stat line rather than one named example,
  // because there is no longer a note to make one line special.
  it('never prints a fragment of the diff template when the numbers cannot be computed', () => {
    const stats = Object.values(CATALOG).filter((d) => Object.hasOwn(STAT_LINES_WITH_NUMBERS, d.id));
    // A NON-DEGENERACY FLOOR, deliberately slack — not a catalog count pin. The
    // set is derived from the catalog, so it moves when lines do: catalog v3
    // (Story 8.1) took it to the EIGHT ladder lines, because an equipment line's
    // copy 1 fits a weapon and its four upgrade tiers are unauthored until
    // Stories 8.12–8.16. Its only job is to prove the filter did not silently
    // return an empty set and make the loop below vacuous. The authoritative
    // catalog counts live in shared/src/__tests__/catalog.test.ts.
    expect(stats.length).toBeGreaterThanOrEqual(8);
    for (const def of stats) {
      // The control: on a real hull the line prints a label and two numbers.
      expect(boonDescription(def, KNOWN as never), def.id).toMatch(/^[^.]+: .+ → .+\.$/);
      // On an unresolvable hull it must print nothing at all — not a label, not
      // a colon, not a lone arrow.
      expect(boonDescription(def, UNKNOWN as never), def.id).toBe('');
    }
  });

  // ...and the riders really did land on the hover tooltip rather than being
  // deleted. RETARGETED in cycle 119: this pin was authored around INTEL RANGE,
  // whose catalog line is now deleted, so it runs on `shipHull` — a SURVIVING
  // line that carried a standing rider ("Repairs the hull it adds.") which the
  // same R2.17 move pushed into the hover explanation.
  it('moved the standing riders to the hover explanation, which needs no hull', () => {
    expect(boonTooltipText('armor')).toContain('repairs');
    expect(boonTooltipText('navalMines')).toContain('trip ring');
    // The explanation is keyed on the id alone, so an unresolvable hull cannot
    // silence it — the tooltip is the surface that always has something to say.
    expect(boonTooltipText('armor').length).toBeGreaterThan(100);
  });

  it('never substitutes a fabricated hull — every catalog line is SILENT, not merely non-throwing', () => {
    for (const def of Object.values(CATALOG)) {
      expect(() => boonDescription(def, UNKNOWN as never)).not.toThrow();
      const text = boonDescription(def, UNKNOWN as never);
      // Doctrine and acquisition lines carry static rules text that needs no
      // hull to render; every STAT line must go quiet rather than half-print.
      if (Object.hasOwn(STAT_LINES_WITH_NUMBERS, def.id)) expect(text).toBe('');
      expect(text.startsWith(' ')).toBe(false);
    }
  });
});

// The I/O matrix row the acceptance audit found uncovered. The guard at
// results.ts is PRE-EXISTING (it was already there at the baseline commit, and
// the spec's claim that it needed adding came from a stale read) — but the row
// is inside the spec's frozen block, so it gets covered rather than reworded.
describe('results LAST OFFER — an unresolvable boon id drops its card, never the block', () => {
  const own = {
    name: 'ERIC', cls: 'torpedoBoat', hue: 0, cards: [] as string[],
    offer: ['radarSweep', 'notARealBoon', 'armor'] as string[],
    pts: 3,
  };

  it('renders the block and omits only the unresolvable card', () => {
    const block = makeOffer(own as never);
    expect(block).not.toBeNull();
    // One section head + one row; the row holds 2 cards, not 3.
    const row = block?.lastElementChild;
    expect(row?.children.length).toBe(2);
  });

  it('does not throw on an offer that is entirely unresolvable', () => {
    const allJunk = { ...own, offer: ['nope', 'alsoNope'], pts: 2 };
    expect(() => makeOffer(allJunk as never)).not.toThrow();
    expect(makeOffer(allJunk as never)?.lastElementChild?.children.length).toBe(0);
  });
});

describe('beltPressDenied — an unresolvable hull never claims FULL', () => {
  // STORY 8.8 moved the "is my hull already full?" guard off the deleted DAMAGE
  // CONTROL rail and onto the BELT: a stocked HULL REPAIR square pre-denies its
  // own press at full hull, so the same fail-open rule has to hold here — an
  // unknown hull must NOT be told it is full.

  // The boundary, not a trivially-large number (review gate): `hp >= maxHp` is
  // the comparison under test, so exercise it AT the cap and one below it. A
  // `hp: 10_000` control would survive an inverted comparison.
  it('denies at exactly full health and allows one point below (the control)', () => {
    const maxHp = effectiveStats(CONFIG.shipClasses['torpedoBoat'], []).maxHp;
    expect(beltPressDenied('hullRepair', maxHp, maxHp, false)).toBe(true);
    expect(beltPressDenied('hullRepair', maxHp - 1, maxHp, false)).toBe(false);
  });

  it('mirrors amendment 53: under 1 hp missing IS full, a whole point missing is not', () => {
    // The client's pre-denial and the server row must agree on the WORD "full",
    // or a press the client lets through comes back `blocked` (a wasted round
    // trip and a denied pulse a beat late). Both now read the shared
    // `hullIsFull` — under 1 hp missing is full, which is exactly where a
    // fractional storm bite or the geometric regen parks a hull.
    expect(beltPressDenied('hullRepair', 349.5, 350, false)).toBe(true);
    expect(beltPressDenied('hullRepair', 349, 350, false)).toBe(false);
  });

  it('lets the press THROUGH for an unresolvable hull rather than claiming full', () => {
    // The conservative direction is deliberate: falsely reporting FULL would
    // deny a player a heal they need, which is worse than sending a press the
    // server refuses. A hull whose maxHp cannot be derived is never denied here.
    for (const maxHp of [Number.NaN, Number.POSITIVE_INFINITY, 0, -1]) {
      expect(beltPressDenied('hullRepair', 10_000, maxHp, false)).toBe(false);
    }
  });

  it('never denies a square that does not hold HULL REPAIR', () => {
    const maxHp = effectiveStats(CONFIG.shipClasses['torpedoBoat'], []).maxHp;
    expect(beltPressDenied('smokeScreen', maxHp, maxHp, true)).toBe(false);
    expect(beltPressDenied(null, maxHp, maxHp, true)).toBe(false);
  });

  it('denies a sinking hull whatever its hp reads', () => {
    expect(beltPressDenied('hullRepair', 1, 350, true)).toBe(true);
  });
});
