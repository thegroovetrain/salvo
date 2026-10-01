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
import { cardHoverRows, cardStatRows } from '../ui/boonCopy.js';
import { beltPressDenied } from '../input/keyboard.js';

const KNOWN = { cls: 'torpedoBoat', cards: [] as string[] };
const UNKNOWN = { cls: 'notAHull', cards: [] as string[] };

// CYCLE 158's review gate DELETED the one-sentence `boonDescription` reader;
// the same fail-open rule now guards the two row builders that replaced it —
// the face's `cardStatRows` and the hover's `cardHoverRows`.
describe('the refit card rows — an unresolvable hull renders nothing, never throws', () => {
  it('the FACE rows go silent on an unresolvable hull (a real hull is the control), and never throw', () => {
    expect(cardStatRows(CATALOG.reload, 0, KNOWN as never).length).toBeGreaterThan(0);
    for (const def of Object.values(CATALOG)) {
      expect(() => cardStatRows(def, 0, UNKNOWN as never), def.id).not.toThrow();
      if (def.kind !== 'consumable') expect(cardStatRows(def, 0, UNKNOWN as never), def.id).toEqual([]);
    }
  });

  // CYCLE 158 (amendment 187): the hover panel is the card's AFTER-fold stat
  // table now, so it goes through the same class lookup — and must fail open
  // the same way: no rows (no panel) on an unresolvable hull, never a throw,
  // while a consumable's CONFIG rows need no hull at all.
  it('the hover rows go silent on an unresolvable hull, and never throw', () => {
    for (const def of Object.values(CATALOG)) {
      expect(() => cardHoverRows(def, 0, UNKNOWN as never), def.id).not.toThrow();
      if (def.kind !== 'consumable') expect(cardHoverRows(def, 0, UNKNOWN as never), def.id).toEqual([]);
    }
    expect(cardHoverRows(CATALOG.armor, 0, KNOWN as never).length).toBeGreaterThan(0);
    expect(cardHoverRows(CATALOG.hullRepair, 0, UNKNOWN as never).length).toBeGreaterThan(0);
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
