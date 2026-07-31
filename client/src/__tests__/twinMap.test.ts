// THE AUDIO↔VISUAL TWIN TABLE (audio/twinMap.ts) — EXPERIENCE.md's sound-map
// requirement pinned in code. The law: no cue is audio-only, so a muted player
// (or one who missed the sound) loses the flourish and nothing else.
//
// The TYPE system already forces a row per ToneId; what a type cannot force is
// that the row SAYS anything, or that it names a surface someone can go look
// at. That is this suite.

import { describe, expect, it } from 'vitest';
import { TONE_TWINS, toneTwin } from '../audio/twinMap.js';
import { TONES, type ToneId } from '../audio/tones.js';

const IDS = Object.keys(TONES) as ToneId[];

describe('every tone has a visual twin', () => {
  it('covers the tone table exactly — no missing row, no orphan row', () => {
    expect(Object.keys(TONE_TWINS).sort()).toEqual([...IDS].sort());
  });

  it('names a real, non-empty twin for every cue', () => {
    const empty = IDS.filter((id) => toneTwin(id).trim().length === 0);
    expect(empty).toEqual([]);
  });

  it('points each twin at the SURFACE that renders it (a module in parens)', () => {
    const vague = IDS.filter((id) => !/\([a-z]+\/[a-zA-Z]/.test(toneTwin(id)));
    expect(vague).toEqual([]);
  });

  it('gives the whole FIT family a twin naming the toast, the slot and the row', () => {
    for (const id of ['fitCommon', 'fitRare', 'fitExclusive'] as const) {
      const twin = toneTwin(id);
      expect(twin).toContain('toast');
      expect(twin).toContain('fit flash');
      expect(twin).toContain('tooltip row');
    }
  });
});
