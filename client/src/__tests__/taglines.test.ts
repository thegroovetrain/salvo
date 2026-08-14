// Cycle 87 — home tagline pool guard tests. Pins the invariants a future edit
// to HOME_TAGLINES could silently break (container-fit headroom, uppercase
// register, no dupes, the two ruled-out replacements never creeping back in).

import { describe, it, expect } from 'vitest';
import { HOME_TAGLINES, pickTagline } from '../ui/taglines.js';

describe('HOME_TAGLINES — pool invariants', () => {
  it('holds exactly the 20 approved strings, in order', () => {
    expect(HOME_TAGLINES).toEqual([
      'SEAS THE DAY',
      'WATER YOU WAITING FOR?',
      'HULL OF A GOOD TIME',
      'OH BUOY, HERE WE GO',
      'PIER PRESSURE',
      'SHIP HAPPENS',
      'NAUTI BY NATURE',
      "FOR FLOAT'S SAKE",
      'RUDDER NONSENSE',
      'KEEL WELL SOON',
      'SINK OR SWIM. MOSTLY SINK.',
      'ALL HANDS ON DECK. BRIEFLY.',
      'ABANDON SHIP RESPONSIBLY',
      'YOUR HULL, THEIR PROBLEM',
      'WE HAVE A SINKING FEELING',
      'BUOYANCY IS TEMPORARY',
      'NO SHIP LASTS FOREVER',
      'THE SEA ALWAYS COLLECTS',
      'SOMEONE HAS TO SINK FIRST',
      'DAMAGE CONTROL IS A MINDSET',
    ]);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(HOME_TAGLINES)).toBe(true);
  });

  it('every entry is non-empty, all-caps, untrimmed-clean, and within the container-fit cap (28 chars)', () => {
    for (const line of HOME_TAGLINES) {
      expect(line.length).toBeGreaterThan(0);
      expect(line).toBe(line.toUpperCase());
      expect(line).toBe(line.trim());
      expect(line.length).toBeLessThanOrEqual(28);
    }
  });

  it('has no duplicate entries', () => {
    expect(new Set(HOME_TAGLINES).size).toBe(HOME_TAGLINES.length);
  });

  it('never contains the retired win-condition line or either excluded crude entry', () => {
    expect(HOME_TAGLINES).not.toContain('LAST HULL FLOATING WINS');
    expect(HOME_TAGLINES).not.toContain('WHAT A LOAD OF SHIP');
    expect(HOME_TAGLINES).not.toContain("LET'S GET SHIPFACED");
  });
});

describe('pickTagline — deterministic draw', () => {
  it('returns pool[k] for an injected rand returning k/20', () => {
    for (let k = 0; k < HOME_TAGLINES.length; k++) {
      expect(pickTagline(() => k / HOME_TAGLINES.length)).toBe(HOME_TAGLINES[k]);
    }
  });

  it('clamps a degenerate rand() === 1 to the last entry, never undefined', () => {
    expect(pickTagline(() => 1)).toBe(HOME_TAGLINES[HOME_TAGLINES.length - 1]);
  });

  it('rand() === 0 returns the first entry', () => {
    expect(pickTagline(() => 0)).toBe(HOME_TAGLINES[0]);
  });

  it('defaults to Math.random and always returns a pool member', () => {
    for (let i = 0; i < 50; i++) {
      expect(HOME_TAGLINES).toContain(pickTagline());
    }
  });
});
