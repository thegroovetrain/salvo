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
import { CATALOG, CONFIG, DEFAULT_CLASS_ID, effectiveStats, type OwnShip } from '@salvo/shared';
import { cardHoverRows, cardStatRows } from '../ui/boonCopy.js';
import { cooldownAbilityDenied } from '../input/keyboard.js';

const KNOWN = { cls: DEFAULT_CLASS_ID, cards: [] as string[] };
const UNKNOWN = { cls: 'notAHull', cards: [] as string[] };

// CYCLE 158's review gate DELETED the one-sentence `boonDescription` reader;
// the same fail-open rule now guards the two row builders that replaced it —
// the face's `cardStatRows` and the hover's `cardHoverRows`.
describe('the refit card rows — an unresolvable hull renders nothing, never throws', () => {
  it('the FACE rows go silent on an unresolvable hull (a real hull is the control), and never throw', () => {
    expect(cardStatRows(CATALOG.reload, 0, KNOWN as never).length).toBeGreaterThan(0);
    for (const def of Object.values(CATALOG)) {
      expect(() => cardStatRows(def, 0, UNKNOWN as never), def.id).not.toThrow();
      expect(cardStatRows(def, 0, UNKNOWN as never), def.id).toEqual([]);
    }
  });

  // CYCLE 158 (amendment 187): the hover panel is the card's AFTER-fold stat
  // table now, so it goes through the same class lookup — and must fail open
  // the same way: no rows (no panel) on an unresolvable hull, never a throw.
  it('the hover rows go silent on an unresolvable hull, and never throw', () => {
    for (const def of Object.values(CATALOG)) {
      expect(() => cardHoverRows(def, 0, UNKNOWN as never), def.id).not.toThrow();
      expect(cardHoverRows(def, 0, UNKNOWN as never), def.id).toEqual([]);
    }
    expect(cardHoverRows(CATALOG.armor, 0, KNOWN as never).length).toBeGreaterThan(0);
  });
});

describe('cooldownAbilityDenied — an unresolvable hull never claims FULL', () => {
  // STORY 8.8's belt guard, RE-HOMED on the `C` key by Story 10.5 (2026-11-05,
  // epic-10 amendment 10): a HULL REPAIR press pre-denies at full hull, so the
  // same fail-open rule has to hold — an unknown hull must NOT be told it is
  // full. The stamp is absent (ready) throughout, so only the hull decides.
  const facts = (hp: number, maxHp: number, sinking = false) => ({ hp, maxHp, sinking, now: 0 });

  // The boundary, not a trivially-large number (review gate): exercise it AT
  // the cap and one below it.
  it('denies at exactly full health and allows one point below (the control)', () => {
    const maxHp = effectiveStats(CONFIG.shipClasses[DEFAULT_CLASS_ID], []).maxHp;
    expect(cooldownAbilityDenied('repair', facts(maxHp, maxHp))).toBe(true);
    expect(cooldownAbilityDenied('repair', facts(maxHp - 1, maxHp))).toBe(false);
  });

  it('mirrors amendment 53: under 1 hp missing IS full, a whole point missing is not', () => {
    // The client's pre-denial and the server's refusal must agree on the WORD
    // "full" — both read the shared `hullIsFull` through `repairRefusal`.
    const maxHp = effectiveStats(CONFIG.shipClasses[DEFAULT_CLASS_ID], []).maxHp;
    expect(cooldownAbilityDenied('repair', facts(maxHp - 0.5, maxHp))).toBe(true);
    expect(cooldownAbilityDenied('repair', facts(maxHp - 1, maxHp))).toBe(false);
  });

  it('lets the press THROUGH for an unresolvable hull rather than claiming full', () => {
    for (const maxHp of [Number.NaN, Number.POSITIVE_INFINITY, 0, -1]) {
      expect(cooldownAbilityDenied('repair', facts(10_000, maxHp))).toBe(false);
    }
  });

  it('never denies SMOKE for a full hull — only HULL REPAIR has that refusal', () => {
    const maxHp = effectiveStats(CONFIG.shipClasses[DEFAULT_CLASS_ID], []).maxHp;
    expect(cooldownAbilityDenied('smoke', facts(maxHp, maxHp))).toBe(false);
  });

  it('denies a sinking hull whatever its hp reads', () => {
    expect(cooldownAbilityDenied('repair', facts(1, 350, true))).toBe(true);
  });
});
