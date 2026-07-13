// Pure vignette state→alpha mapping (render/zone.ts). The derived-radius
// timeline math itself lives in shared/src/sim/zone.ts (ONE implementation for
// both sides — see shared/src/__tests__/zone.test.ts); the client just consumes
// it, so there is nothing client-specific to re-test there.

import { describe, it, expect } from 'vitest';
import { vignetteAlpha } from '../render/zone.js';

// Must track render/zone.ts's VIGNETTE_BASE/AMP (bumped for the purple storm —
// purple reads calmer than red, so it leans on alpha to keep alarm legibility).
const BASE = 0.27;
const AMP = 0.17;

describe('vignetteAlpha — out-of-zone feedback mapping', () => {
  it('is exactly 0 when not in the storm (any time)', () => {
    expect(vignetteAlpha(false, 0)).toBe(0);
    expect(vignetteAlpha(false, 12.34)).toBe(0);
    expect(vignetteAlpha(false, 999)).toBe(0);
  });

  it('sits at the base alpha at the pulse zero-crossing (t=0)', () => {
    expect(vignetteAlpha(true, 0)).toBeCloseTo(BASE, 9);
  });

  it('stays within [base-amp, base+amp] and always strictly positive while in storm', () => {
    for (let t = 0; t < 4; t += 0.05) {
      const a = vignetteAlpha(true, t);
      expect(a).toBeGreaterThan(0);
      expect(a).toBeGreaterThanOrEqual(BASE - AMP - 1e-9);
      expect(a).toBeLessThanOrEqual(BASE + AMP + 1e-9);
    }
  });

  it('reaches its peak a quarter-pulse in and its trough three-quarters in', () => {
    const hz = 1.1;
    const peakT = 0.25 / hz; // sin = +1
    const troughT = 0.75 / hz; // sin = -1
    expect(vignetteAlpha(true, peakT)).toBeCloseTo(BASE + AMP, 6);
    expect(vignetteAlpha(true, troughT)).toBeCloseTo(BASE - AMP, 6);
  });
});
