// Effect layer-routing predicate (render/effects.ts). Four one-shots render into
// the fog-immune chart layer: the gun-shell burst (a detonation at radar range
// must read above the fog, mirroring the fog-immune reticle) and — since Story
// 4.3 — the three gunnery marks, each of which is now a server signal with its
// own declared fog exception and would be drawn exactly where it is useless if
// it stayed under the fog. Everything else stays in the fogged world.

import { describe, it, expect } from 'vitest';
import { effectPeakAlpha, isFogImmuneEffect, isJuiceEffect, type EffectKind } from '../render/effects.js';

describe('isFogImmuneEffect — the marks that must read above the fog', () => {
  it('is TRUE for the burst and the three Story 4.3 gunnery marks', () => {
    expect(isFogImmuneEffect('burst')).toBe(true);
    // splash = our own fall of shot at its TRUE impact point (bracket-and-walk
    // fire is the point: the miss you cannot see is the one you need to see).
    expect(isFogImmuneEffect('splash')).toBe(true);
    // spark = the Hit Call bloom, confirming a connection at a fogged hull.
    expect(isFogImmuneEffect('spark')).toBe(true);
    // muzzle = a shooter inside the 412.5u flash halo but outside the 330u bubble.
    expect(isFogImmuneEffect('muzzle')).toBe(true);
  });

  it('is FALSE for every fogged world effect', () => {
    // muzzleHeavy stays fogged and correctly so: it is own-side only and only
    // ever draws on our own hull, which IS the hole in the fog.
    const fogged: EffectKind[] = ['wake', 'muzzleHeavy', 'pierce', 'sink', 'torpwake'];
    for (const kind of fogged) expect(isFogImmuneEffect(kind)).toBe(false);
  });
});

// --- STORY 4.3: the promotion out of juice -------------------------------------

describe('isJuiceEffect — only the own cannon\'s extra weight is decoration', () => {
  it('classes muzzle and spark as INFORMATION, not juice', () => {
    // DO NOT "FIX" THIS BACK. Both were juice while they were client-side
    // GUESSES about things you could already see (a flash inferred from a shell
    // revealing on a visible hull; a spark only at impacts inside your bubble).
    // Story 4.3 made them server signals: `mz` says a gun went off HERE — a
    // shooter you may not be able to see — and `hc` says something you fired
    // CONNECTED, at a point you may have no other way to learn about. FR16 makes
    // both load-bearing, and the ratified motion rule is that `off` removes
    // MOTION, never INFORMATION.
    expect(isJuiceEffect('muzzle')).toBe(false);
    expect(isJuiceEffect('spark')).toBe(false);
    expect(effectPeakAlpha('muzzle', 0.9, 0)).toBe(0.9); // motion=off: still drawn
    expect(effectPeakAlpha('spark', 1, 0)).toBe(1);
  });

  it('is TRUE for muzzleHeavy alone — the whole juice set is one kind', () => {
    const kinds: EffectKind[] = ['wake', 'muzzle', 'muzzleHeavy', 'spark', 'pierce', 'splash', 'sink', 'torpwake', 'burst'];
    expect(kinds.filter(isJuiceEffect)).toEqual(['muzzleHeavy']);
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
