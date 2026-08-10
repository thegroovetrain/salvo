// THE AUDIO↔VISUAL TWIN TABLE (audio/twinMap.ts) — EXPERIENCE.md's sound-map
// requirement pinned in code. The law: no cue is audio-only, so a muted player
// (or one who missed the sound) loses the flourish and nothing else.
//
// The TYPE system already forces a row per ToneId; what a type cannot force is
// that the row SAYS anything, or that it names a surface someone can go look
// at. That is this suite.

import { describe, expect, it } from 'vitest';
import { TONE_TWINS, toneTwin, type AudioCueId } from '../audio/twinMap.js';
import { TONES, type ToneId } from '../audio/tones.js';

/** Every cue that can SOUND — the tone table plus the cues on their own engine
 *  paths. The horn is the first of the latter (Story 4.5): it is not a ToneSpec,
 *  and the whole point of widening the key was that dodging `TONES` must not let
 *  a cue dodge its twin. */
const OFF_TABLE: AudioCueId[] = ['foghorn'];
const IDS = [...(Object.keys(TONES) as ToneId[]), ...OFF_TABLE];

describe('every audio cue has a visual twin', () => {
  it('covers every soundable cue exactly — no missing row, no orphan row', () => {
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

  it('gives the BOUNTY a twin on BOTH its text surfaces — and none on the water', () => {
    // Story 4.6: the cue fires once, when the throne lands on you. Its twin has
    // to carry the same fact twice over — the moment (the toast) and the state
    // that outlives it (the chrome bar's register naming the holder). The
    // 2026-08-10 ruling deleted every positional cue, so no on-water surface
    // may appear here.
    const twin = toneTwin('bounty');
    expect(twin).toMatch(/toast/i);
    expect(twin).toMatch(/chrome bar/i);
    expect(twin).toMatch(/ui\/upgradeToast/);
    expect(twin).toMatch(/ui\/chromeBar/);
    expect(twin).not.toMatch(/radar|blip|bloom|ring|marker|halo/i);
  });

  it('gives the FOGHORN a twin that carries a BEARING — the only thing the honk says', () => {
    const twin = toneTwin('foghorn');
    expect(twin).toMatch(/bearing/i);
    expect(twin).toMatch(/chevron/i);
    // Your own honk gets a hull bloom instead of a chevron (amendment 55), so
    // the row has to name both surfaces or the muted own-honk has no twin.
    expect(twin).toMatch(/bloom/i);
  });
});
