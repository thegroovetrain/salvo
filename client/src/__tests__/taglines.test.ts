// Cycle 87 — home tagline pool guard tests. Pins the invariants a future edit
// to HOME_TAGLINES could silently break (container-fit headroom, uppercase
// register, no dupes) and the deterministic draw. The pool's WORDING is Eric's
// and is not pinned (Story 9.14, ruling R3).

import { describe, it, expect } from 'vitest';
import { HOME_TAGLINES, pickTagline } from '../ui/taglines.js';

describe('HOME_TAGLINES — pool invariants', () => {
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
});

describe('pickTagline — deterministic draw', () => {
  it('returns pool[k] for an injected rand returning k/pool length', () => {
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

  // Review gate (cycle 85, flagged by both reviewers). No production caller can
  // reach these — makeWordmark() passes the default Math.random — but the
  // export is annotated `: string`, and an unguarded malformed RNG returned
  // `undefined`, which would paint an empty tagline rather than fail loudly.
  it('never returns undefined for a malformed injected rand', () => {
    for (const bad of [NaN, -0.01, -1, -Infinity, Infinity, 2]) {
      const line = pickTagline(() => bad);
      expect(typeof line).toBe('string');
      expect(HOME_TAGLINES).toContain(line);
    }
  });
});
