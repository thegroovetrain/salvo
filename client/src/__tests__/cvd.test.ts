// Story 2.3 (amendment 18) — the COLORBLIND ASSIST's blip-legibility lever: the
// opacity floor (Story 4.2 replaced the old assist outline RING lever).
//
// Story 10.4 (Eric ruling R6): the hue wheel is gone, and with it the assist's
// eight-family palette and its remap chokepoint (render/ships.ts) — ships are
// drawn in the two relation colors, so there is no wheel left to remap. The
// COLORBLIND ASSIST setting itself is KEPT (settings.test.ts): it still drives
// the radar blip's alpha floor pinned here.

import { describe, it, expect } from 'vitest';
import { CLIENT_CONFIG } from '../config.js';
import { blipAlpha } from '../render/phosphor.js';

describe('blip legibility levers', () => {
  it('the opacity FLOOR keeps a decaying blip readable without extending its life', () => {
    const floor = CLIENT_CONFIG.blip.assistMinAlpha;
    expect(CLIENT_CONFIG.blip.minAlpha).toBe(0); // the base behaviour is unchanged
    expect(blipAlpha(900, 1000)).toBeCloseTo(0.1, 9); // base: nearly gone
    expect(blipAlpha(900, 1000, floor)).toBe(floor); // assist: still readable
    expect(blipAlpha(0, 1000, floor)).toBe(1); // a fresh paint is unaffected
    expect(blipAlpha(1000, 1000, floor)).toBe(0); // ...and it still DIES at its full life
    expect(blipAlpha(5000, 1000, floor)).toBe(0);
  });
});
