// Cycle 162 — THE ICON PASS (Eric 2026-10-01): every card line has its OWN
// glyph. The refit card and How-to-Play feed `glyphPaths` a LINE id, so the
// one lookup must answer every one of the 24 `LINE_IDS` but the stub DEPTH
// CHARGE, with no two lines drawn alike and every point inside the unit box.

import { describe, it, expect } from 'vitest';
import { LINE_IDS } from '@salvo/shared';
import { equipmentGlyphSvg, glyphPaths } from '../render/equipmentIcons.js';

/** The lines that draw a glyph — all but the stub. */
const GLYPHED = LINE_IDS.filter((id) => id !== 'depthCharge');

describe('one glyph per card line (cycle 162)', () => {
  it('every line but the stub depthCharge answers a glyph', () => {
    for (const id of GLYPHED) expect(glyphPaths(id), id).not.toBeNull();
    expect(glyphPaths('depthCharge')).toBeNull();
    expect(GLYPHED).toHaveLength(23);
  });

  it('no two lines draw the same glyph', () => {
    const drawn = GLYPHED.map((id) => JSON.stringify(glyphPaths(id)));
    expect(new Set(drawn).size).toBe(GLYPHED.length);
  });

  it('every point of every part sits inside the ±1 unit frame', () => {
    for (const id of GLYPHED) {
      for (const p of glyphPaths(id)!) {
        for (const [x, y] of p.kind === 'path' ? p.pts : [p.c]) {
          expect(Math.abs(x), `${id} x`).toBeLessThanOrEqual(1 + 1e-9);
          expect(Math.abs(y), `${id} y`).toBeLessThanOrEqual(1 + 1e-9);
        }
      }
    }
  });

  it('the CANNON ladder draws the mounted gun', () => {
    expect(glyphPaths('deckGun')).toEqual(glyphPaths('gun'));
  });

  it('a ship ladder reaches the DOM surface as an svg', () => {
    expect(equipmentGlyphSvg('armor', 24)?.tagName.toLowerCase()).toBe('svg');
  });
});
