// Story 2.3 (amendment 18) — the colorblind-assist palette's ACCEPTANCE test:
// the eight drafted families must be pairwise distinguishable under a simulated
// deuteranopia at blip scale, must avoid the reserved functional bands, and must
// stay legible against the void. Plus the remap chokepoint itself (render/
// ships.ts) and the two blip-legibility levers (opacity floor + luminance
// floor — Story 4.2 replaced the old assist outline RING lever, see below).

import { describe, it, expect } from 'vitest';
import { CLIENT_CONFIG } from '../config.js';
import { hueAngle, hueSeparation, labDistance, simulateDeuteranopia } from '../util/cvd.js';
import { contrastRatio } from '../util/color.js';
import { blipAlpha } from '../render/phosphor.js';
import { luminanceFloor, relativeLuminance } from '../render/blipMarks.js';
import {
  PLAYER_FILLS,
  PLAYER_HUES,
  colorblindAssist,
  cvdFamilyIndex,
  hueRevision,
  setColorblindAssist,
} from '../render/ships.js';
import { relatchForHueSwap } from '../render/contacts.js';
import { retryHue } from '../render/hueLatch.js';

const C = CLIENT_CONFIG.colors;
const FAMILIES = Object.values(C.cvd);
const FAMILY_NAMES = Object.keys(C.cvd);
const FILLS = Object.values(C.cvdFills);

/**
 * The acceptance threshold. CIE76 ΔE ~ 30 is comfortably above the "clearly a
 * different color at a glance" band (~10–15) — a blip is small, low-contrast and
 * decaying, so the palette is held to a wide margin rather than a just-noticeable
 * one.
 */
const MIN_DELTA_E = 30;

/** The reserved functional bands (hue angle ± 20°) the assist may never enter. */
const RESERVED = [
  ['denied red', C.denied],
  ['amber', C.amber],
  ['phosphor', C.phosphor],
  ['storm violet', C.storm],
] as const;
const RESERVED_HALF_WIDTH = 20;

describe('CVD assist palette — eight separated families (amendment 18)', () => {
  it('ships exactly eight families with matching fills', () => {
    expect(FAMILIES).toHaveLength(8);
    expect(FILLS).toHaveLength(8);
    expect(Object.keys(C.cvdFills)).toEqual(FAMILY_NAMES); // same key order = same family
    expect(new Set(FAMILIES).size).toBe(8);
  });

  it('is PAIRWISE DISTINGUISHABLE under simulated deuteranopia', () => {
    const sim = FAMILIES.map(simulateDeuteranopia);
    for (let i = 0; i < sim.length; i++) {
      for (let j = i + 1; j < sim.length; j++) {
        const d = labDistance(sim[i], sim[j]);
        expect(d, `${FAMILY_NAMES[i]} vs ${FAMILY_NAMES[j]} (ΔE ${d.toFixed(1)})`).toBeGreaterThanOrEqual(MIN_DELTA_E);
      }
    }
  });

  it('keeps the reserved functional bands intact (±20° of each)', () => {
    for (const [name, reserved] of RESERVED) {
      const h = hueAngle(reserved);
      for (let i = 0; i < FAMILIES.length; i++) {
        const sep = hueSeparation(hueAngle(FAMILIES[i]), h);
        expect(sep, `${FAMILY_NAMES[i]} vs ${name}`).toBeGreaterThan(RESERVED_HALF_WIDTH);
      }
    }
  });

  it('stays legible: every family clears 4.5:1 against the void', () => {
    for (let i = 0; i < FAMILIES.length; i++) {
      expect(contrastRatio(FAMILIES[i], C.void), FAMILY_NAMES[i]).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('derives every fill by the documented HSV value ×0.45 rule', () => {
    const scale045 = (hex: number): number => {
      const ch = (shift: number): number => Math.round(((hex >> shift) & 0xff) * 0.45);
      return (ch(16) << 16) | (ch(8) << 8) | ch(0);
    };
    FAMILIES.forEach((hue, i) => expect(FILLS[i], FAMILY_NAMES[i]).toBe(scale045(hue)));
  });
});

describe('cvdFamilyIndex — the 20-hue wheel collapses onto 8 families', () => {
  it('spreads adjacent wheel indices (adjacent HUES) onto different families', () => {
    for (let i = 0; i < 19; i++) expect(cvdFamilyIndex(i)).not.toBe(cvdFamilyIndex(i + 1));
  });

  it('covers every family and stays in range for the whole wheel', () => {
    const seen = new Set(Array.from({ length: 20 }, (_, i) => cvdFamilyIndex(i)));
    expect(seen.size).toBe(8);
    for (const f of seen) expect(f).toBeGreaterThanOrEqual(0);
  });
});

describe('the remap CHOKEPOINT (render/ships.ts) — one swap, every consumer', () => {
  it('swaps both hue tables live and bumps the revision, idempotently', () => {
    const baseHues = [...PLAYER_HUES];
    const baseRev = hueRevision();
    expect(colorblindAssist()).toBe(false);

    setColorblindAssist(true);
    expect(colorblindAssist()).toBe(true);
    expect(hueRevision()).toBe(baseRev + 1);
    expect(PLAYER_HUES).toHaveLength(baseHues.length);
    expect(PLAYER_FILLS).toHaveLength(baseHues.length);
    // Every wheel index now resolves to its family's outline/fill pair.
    PLAYER_HUES.forEach((hue, i) => {
      expect(hue).toBe(FAMILIES[cvdFamilyIndex(i)]);
      expect(PLAYER_FILLS[i]).toBe(FILLS[cvdFamilyIndex(i)]);
    });
    // ...and the 20 hues collapse to exactly 8 distinct values.
    expect(new Set(PLAYER_HUES).size).toBe(8);

    setColorblindAssist(true); // idempotent — no spurious revision bump
    expect(hueRevision()).toBe(baseRev + 1);

    setColorblindAssist(false);
    expect(PLAYER_HUES).toEqual(baseHues); // the ratified Regatta wheel restored
    expect(hueRevision()).toBe(baseRev + 2);
  });
});

describe('blip legibility levers', () => {
  it('the opacity FLOOR keeps a decaying blip readable without extending its life', () => {
    const floor = CLIENT_CONFIG.blip.assistMinAlpha;
    expect(CLIENT_CONFIG.blip.minAlpha).toBe(0); // the base grammar is unchanged
    expect(blipAlpha(900, 1000)).toBeCloseTo(0.1, 9); // base: nearly gone
    expect(blipAlpha(900, 1000, floor)).toBe(floor); // assist: still readable
    expect(blipAlpha(0, 1000, floor)).toBe(1); // a fresh paint is unaffected
    expect(blipAlpha(1000, 1000, floor)).toBe(0); // ...and it still DIES at its full life
    expect(blipAlpha(5000, 1000, floor)).toBe(0);
  });

  // Story 4.2 retired the assist's hard OUTLINE RING with the soft dot it
  // existed for: every blip is now a 1px `pixelLine` hull outline, and
  // `pixelLine` IGNORES stroke width, so the assist cannot thicken it. Amendment
  // 18's "boost the outline" intent moved to the two channels a hairline has —
  // the decayed-alpha floor above, and the hue LUMINANCE floor here.
  it('the assist raises the blip hue LUMINANCE floor above the base grammar', () => {
    expect(CLIENT_CONFIG.blip.assistLumaFloor).toBeGreaterThan(CLIENT_CONFIG.blip.lumaFloor);
    // Every assist family clears the raised floor once lifted (the lift is
    // algorithmic, so this holds for any future family without a table edit).
    for (const hue of Object.values(CLIENT_CONFIG.colors.cvd)) {
      const lifted = luminanceFloor(hue, CLIENT_CONFIG.blip.assistLumaFloor);
      expect(relativeLuminance(lifted)).toBeGreaterThanOrEqual(CLIENT_CONFIG.blip.assistLumaFloor - 1e-6);
    }
  });
});

// --- REGRESSION (Story 2.3 review gate): the assist must be LIVE --------------
// Every recolor consumer LATCHES (contact hulls, nameplates, ordnance markers)
// so it stops probing the roster each frame. Only the own hull re-resolved on a
// revision bump, so toggling the assist mid-match left every visible contact,
// plate and mine wearing the OLD hue until it died and re-appeared.

describe('hue-revision propagation to the latched consumers', () => {
  it('relatchForHueSwap drops the hull-color and plate latches (drones keep theirs)', () => {
    // A human contact must re-resolve BOTH its hull style and its plate color.
    expect(relatchForHueSwap(false)).toEqual({ colored: false, plated: false });
    // A drone wears the greys, which live outside the personal-hue table and
    // never move — so its hull latch stands and only the plate re-resolves.
    expect(relatchForHueSwap(true)).toEqual({ colored: true, plated: false });
  });

  it('retryHue repaints an ALREADY-LATCHED ordnance marker on a revision bump', () => {
    const painted: number[] = [];
    const hueFor = (): number => PLAYER_HUES[3];
    const state = { by: 'someone', colored: false, rev: hueRevision() };

    retryHue(state, hueFor, (c) => painted.push(c));
    expect(state.colored).toBe(true);
    expect(painted).toHaveLength(1);

    // Latched: the per-frame probe is a single int compare and does nothing.
    retryHue(state, hueFor, (c) => painted.push(c));
    expect(painted).toHaveLength(1);

    // The assist toggle swaps the table under it — it must repaint.
    const before = colorblindAssist();
    setColorblindAssist(!before);
    try {
      retryHue(state, hueFor, (c) => painted.push(c));
      expect(painted).toHaveLength(2);
      expect(painted[1]).toBe(PLAYER_HUES[3]); // the NEW family hue
      expect(painted[1]).not.toBe(painted[0]);
      expect(state.rev).toBe(hueRevision());
    } finally {
      setColorblindAssist(before);
    }
  });

  it('an unresolved marker keeps probing across a revision bump', () => {
    const state = { by: 'ghost', colored: false, rev: hueRevision() };
    retryHue(state, () => null, () => expect.unreachable('nothing to paint'));
    expect(state.colored).toBe(false); // still amber, still retrying
  });
});
