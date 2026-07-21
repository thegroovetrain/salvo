// Effect layer-routing predicate (render/effects.ts). The gun-shell burst is
// the ONLY one-shot that renders into the fog-immune chart layer — a burst at
// radar range (well beyond the sight bubble) must read above the fog, mirroring
// the fog-immune reticle. Everything else stays in the fogged world.

import { describe, it, expect } from 'vitest';
import { isFogImmuneEffect, type EffectKind } from '../render/effects.js';

describe('isFogImmuneEffect — burst renders above the fog', () => {
  it('is TRUE only for the burst kind', () => {
    expect(isFogImmuneEffect('burst')).toBe(true);
  });

  it('is FALSE for every fogged world effect', () => {
    const fogged: EffectKind[] = ['wake', 'muzzle', 'spark', 'splash', 'sink', 'torpwake'];
    for (const kind of fogged) expect(isFogImmuneEffect(kind)).toBe(false);
  });
});
