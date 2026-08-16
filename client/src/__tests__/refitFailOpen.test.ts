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
import { BOON_CATALOG, type OwnShip } from '@salvo/shared';
import { boonDescription } from '../ui/boonCopy.js';
import { healView } from '../ui/upgradeMenu.js';

const KNOWN = { cls: 'torpedoBoat', boons: [] as string[] };
const UNKNOWN = { cls: 'notAHull', boons: [] as string[] };

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

  it('does not leave a note dangling when the numbers cannot be computed', () => {
    // `intelRadar`-style lines carry a standing note; with no head sentence the
    // card must print nothing at all rather than a leading-space fragment.
    const withNote = Object.values(BOON_CATALOG).find(
      (d) => boonDescription(d, KNOWN as never).length > 0 && d.effects.some((e) => e.kind === 'stat'),
    );
    expect(withNote).toBeDefined();
    const text = boonDescription(withNote as never, UNKNOWN as never);
    expect(text).toBe('');
    expect(text.startsWith(' ')).toBe(false);
  });

  it('never substitutes a fabricated hull — every catalog line is silent on an unknown class', () => {
    for (const def of Object.values(BOON_CATALOG)) {
      expect(() => boonDescription(def, UNKNOWN as never)).not.toThrow();
    }
  });
});

describe('healView — an unresolvable hull never claims FULL', () => {
  const base = { alive: true, hp: 50, cls: 'torpedoBoat', boons: [] } as unknown as OwnShip;

  it('reports the rail inert at full health on a real hull (the control)', () => {
    const full = { ...base, hp: 10_000 } as unknown as OwnShip;
    expect(healView(full, false).state).toBe('inert');
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
