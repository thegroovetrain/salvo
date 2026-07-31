// Effect layer-routing predicate (render/effects.ts). The gun-shell burst is
// the ONLY one-shot that renders into the fog-immune chart layer — a burst at
// radar range (well beyond the sight bubble) must read above the fog, mirroring
// the fog-immune reticle. Everything else stays in the fogged world.

import { describe, it, expect } from 'vitest';
import { effectPeakAlpha, isFogImmuneEffect, isJuiceEffect, type EffectKind } from '../render/effects.js';

describe('isFogImmuneEffect — burst renders above the fog', () => {
  it('is TRUE only for the burst kind', () => {
    expect(isFogImmuneEffect('burst')).toBe(true);
  });

  it('is FALSE for every fogged world effect', () => {
    const fogged: EffectKind[] = ['wake', 'muzzle', 'muzzleHeavy', 'spark', 'pierce', 'splash', 'sink', 'torpwake'];
    for (const kind of fogged) expect(isFogImmuneEffect(kind)).toBe(false);
  });
});

// --- STORY 2.9: the two doctrine one-shots -------------------------------------

describe('the Story 2.9 one-shots — a heavy muzzle and a pierce ring', () => {
  it('classes the OWN cannon\'s heavier muzzle as juice, like the muzzle it replaces', () => {
    expect(isJuiceEffect('muzzleHeavy')).toBe(true);
    expect(effectPeakAlpha('muzzleHeavy', 1, 0)).toBe(0); // motion=off: no flash
  });

  it('classes the AP PIERCE ring as INFORMATION — it survives motion=off', () => {
    // It is the entire enemy-side armor-piercing tell: a hit that did NOT stop
    // the shell. Gating it on motion would delete the doctrine from the screen
    // for anyone who turned animation down.
    expect(isJuiceEffect('pierce')).toBe(false);
    expect(effectPeakAlpha('pierce', 0.9, 0)).toBe(0.9);
  });
});
