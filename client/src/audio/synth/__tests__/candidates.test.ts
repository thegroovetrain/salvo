// Structural contract of the audition candidates (audio/synth/candidates/):
// every slot is auditionable (≥ 2 distinct candidates, words to read, a recipe
// of sane length), every "today" comparison names a real legacy tone, and every
// engine set voices every hull with finite targets. Nothing here judges sound.

import { describe, it, expect } from 'vitest';
import { CONFIG } from '@salvo/shared';
import { CUE_SLOTS, ENGINE_CANDIDATES } from '../candidates/index.js';
import { cueLengthS } from '../recipe.js';
import { TONES } from '../../tones.js';
import { engineTargets, type EngineTargets } from '../../engine.js';

/** No audition cue should run longer than this (s); a longer one is a typo. */
const MAX_CUE_S = 12;

const allFinite = (t: EngineTargets): boolean =>
  Object.values(t).every((v) => (Array.isArray(v) ? v.every(Number.isFinite) : Number.isFinite(v)));

describe('CUE_SLOTS', () => {
  it('slot ids are unique', () => {
    const ids = CUE_SLOTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const slot of CUE_SLOTS) {
    describe(slot.id, () => {
      it('has a title, a note and at least two candidates with unique ids', () => {
        expect(slot.title.trim()).not.toBe('');
        expect(slot.note.trim()).not.toBe('');
        expect(slot.candidates.length).toBeGreaterThanOrEqual(2);
        const ids = slot.candidates.map((c) => c.id);
        expect(new Set(ids).size).toBe(ids.length);
      });

      it('every candidate has words and a recipe of finite, positive, bounded length', () => {
        for (const c of slot.candidates) {
          expect(c.label.trim(), c.id).not.toBe('');
          expect(c.blurb.trim(), c.id).not.toBe('');
          expect(c.recipe.layers.length, c.id).toBeGreaterThan(0);
          const len = cueLengthS(c.recipe);
          expect(Number.isFinite(len), c.id).toBe(true);
          expect(len, c.id).toBeGreaterThan(0);
          expect(len, c.id).toBeLessThan(MAX_CUE_S);
        }
      });

      it('its "today" comparison, if any, is a real legacy tone', () => {
        if (slot.today !== undefined) expect(Object.hasOwn(TONES, slot.today)).toBe(true);
      });
    });
  }
});

describe('ENGINE_CANDIDATES', () => {
  const hulls = Object.keys(CONFIG.shipClasses).sort();

  it('has at least two sets with unique ids and words', () => {
    expect(ENGINE_CANDIDATES.length).toBeGreaterThanOrEqual(2);
    expect(new Set(ENGINE_CANDIDATES.map((e) => e.id)).size).toBe(ENGINE_CANDIDATES.length);
    for (const e of ENGINE_CANDIDATES) {
      expect(e.label.trim()).not.toBe('');
      expect(e.blurb.trim()).not.toBe('');
    }
  });

  for (const set of ENGINE_CANDIDATES) {
    it(`${set.id} voices exactly the hulls in CONFIG.shipClasses, with finite targets idle and flat out`, () => {
      expect(Object.keys(set.profiles).sort()).toEqual(hulls);
      for (const [hull, profile] of Object.entries(set.profiles)) {
        const idle = engineTargets(profile, { throttle: 0, speed01: 0, boost: false });
        const full = engineTargets(profile, { throttle: 1, speed01: 1, boost: true });
        expect(allFinite(idle), `${hull} idle`).toBe(true);
        expect(allFinite(full), `${hull} full`).toBe(true);
      }
    });
  }
});
