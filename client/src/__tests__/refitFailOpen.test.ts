// FAIL-OPEN ON THE CLASS TABLE (cycle 90). Two lookups on the boon-pick render
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
import { BOON_CATALOG, CONFIG, effectiveStats, type OwnShip } from '@salvo/shared';
import { boonDescription } from '../ui/boonCopy.js';
import { healView } from '../ui/upgradeMenu.js';
import { makeOffer } from '../ui/results.js';

const KNOWN = { cls: 'torpedoBoat', boons: [] as string[] };
const UNKNOWN = { cls: 'notAHull', boons: [] as string[] };

/** The catalog ids whose card text is a computed `current → next` sentence —
 *  derived from behavior on a REAL hull rather than by duplicating the
 *  STAT_LINES table, so this cannot drift from it. Doctrine and acquisition
 *  lines print static rules text and need no hull. */
const STAT_LINES_WITH_NUMBERS: Record<string, true> = Object.fromEntries(
  Object.values(BOON_CATALOG)
    .filter((d) => boonDescription(d, KNOWN as never).includes('→'))
    .map((d) => [d.id, true]),
);

describe('boonDescription — an unresolvable hull renders nothing, never throws', () => {
  it('returns rules text for a real hull (the control)', () => {
    const def = BOON_CATALOG['gunDamage'];
    const text = boonDescription(def, KNOWN as never);
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain('→');
  });

  it('returns empty text for an unknown hull instead of throwing', () => {
    const def = BOON_CATALOG['gunDamage'];
    expect(() => boonDescription(def, UNKNOWN as never)).not.toThrow();
    expect(boonDescription(def, UNKNOWN as never)).toBe('');
  });

  // NAMED EXPLICITLY, not discovered by `find` (review gate): the original
  // version searched the catalog and got `gunDamage`, which carries NO note —
  // so `line.note ? … : head` already produced '' and the test passed with the
  // production guard reverted. `intelRadar` DOES carry a standing note, so
  // without the guard this returns " Gun, cannon and star shells reach with it."
  // with a leading space. That is the regression this pins.
  it('does not leave a note dangling when the numbers cannot be computed', () => {
    const noted = BOON_CATALOG['intelRadar'];
    expect(noted).toBeDefined();
    // The control: on a real hull the line prints BOTH a number and its note.
    const good = boonDescription(noted, KNOWN as never);
    expect(good).toContain('→');
    expect(good).toContain('reach with it');
    // On an unresolvable hull it must print nothing at all.
    expect(boonDescription(noted, UNKNOWN as never)).toBe('');
  });

  it('never substitutes a fabricated hull — every catalog line is SILENT, not merely non-throwing', () => {
    for (const def of Object.values(BOON_CATALOG)) {
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
    name: 'ERIC', cls: 'torpedoBoat', hue: 0, boons: [] as string[],
    offer: ['gunDamage', 'notARealBoon', 'shipHull'] as string[],
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

describe('healView — an unresolvable hull never claims FULL', () => {
  const base = { alive: true, hp: 50, cls: 'torpedoBoat', boons: [] } as unknown as OwnShip;

  // The boundary, not a trivially-large number (review gate): `hp >= maxHp` is
  // the comparison under test, so exercise it AT the cap and one below it. A
  // `hp: 10_000` control would survive an inverted comparison.
  it('is inert at exactly full health and armed one point below (the control)', () => {
    const maxHp = effectiveStats(CONFIG.shipClasses['torpedoBoat'], []).maxHp;
    const exactly = { ...base, hp: maxHp } as unknown as OwnShip;
    const oneBelow = { ...base, hp: maxHp - 1 } as unknown as OwnShip;
    expect(healView(exactly, false).state).toBe('inert');
    expect(healView(oneBelow, false).state).toBe('armed');
  });

  it('leaves the rail ARMED for an unknown hull rather than throwing or claiming full', () => {
    const skewed = { ...base, cls: 'notAHull', hp: 10_000 } as unknown as OwnShip;
    expect(() => healView(skewed, false)).not.toThrow();
    // The conservative direction is deliberate: falsely reporting FULL would
    // deny a player a heal they need, which is worse than offering a redundant
    // one. An unidentifiable hull therefore keeps the rail available.
    expect(healView(skewed, false).state).toBe('armed');
  });
});
