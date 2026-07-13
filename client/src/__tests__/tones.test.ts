// Audio tone map (audio/tones.ts): pure event-kind -> tone-id mapping,
// spec-table completeness/duration bounds, and the match-phase cue
// edge-detectors. audio/context.ts (the AudioContext adapter) is a thin,
// untested adapter per convention — this file covers everything pure.

import { describe, it, expect } from 'vitest';
import { WEAPON, type WeaponId } from '@salvo/shared';
import {
  TONES,
  fireTone,
  telegraphTone,
  MAX_TONE_S,
  MAX_SINK_TONE_S,
  audioCues,
  stormEnterEdge,
  INITIAL_CUE_STATE,
  type ToneId,
  type AudioCueState,
} from '../audio/tones.js';

const ALL_TONE_IDS: ToneId[] = [
  'fireGun',
  'fireTorp',
  'fireMine',
  'damage',
  'kill',
  'sink',
  'tick',
  'matchStart',
  'stormWarn',
  'telegraphUp',
  'telegraphDown',
];

describe('TONES — spec table completeness', () => {
  it('has a spec for every ToneId with positive, finite envelope values', () => {
    for (const id of ALL_TONE_IDS) {
      const spec = TONES[id];
      expect(spec).toBeDefined();
      expect(spec.freqStart).toBeGreaterThan(0);
      expect(spec.freqMid).toBeGreaterThan(0);
      expect(spec.freqEnd).toBeGreaterThan(0);
      expect(spec.duration).toBeGreaterThan(0);
      expect(spec.volume).toBeGreaterThan(0);
      expect(spec.volume).toBeLessThanOrEqual(1);
    }
  });

  it('carries no extra/undocumented tone ids beyond the known set', () => {
    expect(Object.keys(TONES).sort()).toEqual([...ALL_TONE_IDS].sort());
  });

  it('every tone is <= 150ms except sink, which is the one long tone (~400ms)', () => {
    for (const id of ALL_TONE_IDS) {
      if (id === 'sink') continue;
      expect(TONES[id].duration).toBeLessThanOrEqual(MAX_TONE_S);
    }
    expect(TONES.sink.duration).toBeGreaterThan(MAX_TONE_S);
    expect(TONES.sink.duration).toBeLessThanOrEqual(MAX_SINK_TONE_S);
  });
});

describe('fireTone — weapon -> own-fire tone mapping', () => {
  it('maps every WeaponId to its distinct tone', () => {
    expect(fireTone(WEAPON.gun)).toBe('fireGun');
    expect(fireTone(WEAPON.torpedo)).toBe('fireTorp');
    expect(fireTone(WEAPON.mine)).toBe('fireMine');
  });

  it('covers all three WeaponId values with no gaps', () => {
    const ids: WeaponId[] = [0, 1, 2];
    for (const w of ids) expect(TONES[fireTone(w)]).toBeDefined();
  });
});

describe('telegraphTone — detent-click direction', () => {
  it('rings up (ahead) vs down (astern) to distinct tones', () => {
    expect(telegraphTone(1)).toBe('telegraphUp');
    expect(telegraphTone(-1)).toBe('telegraphDown');
  });

  it('pitches the ahead click above the astern click', () => {
    expect(TONES.telegraphUp.freqStart).toBeGreaterThan(TONES.telegraphDown.freqStart);
  });
});

describe('audioCues — countdown tick + match-start edge detection', () => {
  it('ticks once per second inside the last 5s of countdown', () => {
    let state = INITIAL_CUE_STATE;
    const r1 = audioCues(state, 'countdown', 5);
    expect(r1.tick).toBe(true);
    state = r1.state;
    // Same second again (called again this frame, or a re-render at the same tick): no re-fire.
    const r2 = audioCues(state, 'countdown', 5);
    expect(r2.tick).toBe(false);
    state = r2.state;
    // Next second: fires again.
    const r3 = audioCues(state, 'countdown', 4);
    expect(r3.tick).toBe(true);
  });

  it('does not tick outside the last-5s window', () => {
    const r = audioCues(INITIAL_CUE_STATE, 'countdown', 6);
    expect(r.tick).toBe(false);
  });

  it('does not tick outside the countdown phase', () => {
    const r = audioCues(INITIAL_CUE_STATE, 'waiting', 2);
    expect(r.tick).toBe(false);
  });

  it('fires matchStart exactly once on the waiting/countdown -> active transition', () => {
    let state: AudioCueState = { lastPhase: 'countdown', lastTickSec: 1 };
    const r1 = audioCues(state, 'active', 0);
    expect(r1.matchStart).toBe(true);
    state = r1.state;
    const r2 = audioCues(state, 'active', 0);
    expect(r2.matchStart).toBe(false); // already active — no repeat
  });

  it('does not fire matchStart for a phase that was already active', () => {
    const state: AudioCueState = { lastPhase: 'active', lastTickSec: null };
    expect(audioCues(state, 'active', 0).matchStart).toBe(false);
  });
});

describe('stormEnterEdge', () => {
  it('is true only on the inside -> outside transition', () => {
    expect(stormEnterEdge(false, true)).toBe(true);
    expect(stormEnterEdge(true, true)).toBe(false); // already outside — no repeat
    expect(stormEnterEdge(false, false)).toBe(false);
    expect(stormEnterEdge(true, false)).toBe(false); // re-entering the zone, no warning
  });
});
