// Audio tone map (audio/tones.ts): pure event-kind -> tone-id mapping,
// spec-table completeness/duration bounds, and the match-phase cue
// edge-detectors. audio/context.ts (the AudioContext adapter) is a thin,
// untested adapter per convention — this file covers everything pure.

import { describe, it, expect } from 'vitest';
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
  'fireCannon',
  'fireStarShells',
  'placeDecoy',
  'damage',
  'kill',
  'point',
  'upgrade',
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
  // The speedBoost ability never fires: fireTone is typed to the weapon subset
  // of EquipmentId (Story 1.6), so an ability id can't even reach it.
  it('maps every firing weapon to its distinct tone', () => {
    expect(fireTone('gun')).toBe('fireGun');
    expect(fireTone('torpedo')).toBe('fireTorp');
    expect(fireTone('mine')).toBe('fireMine');
    expect(fireTone('cannon')).toBe('fireCannon'); // Story 1.7: BB heavy report
    expect(fireTone('starShells')).toBe('fireStarShells'); // Story 1.7: BB flare pop
  });

  it('covers all five weapon ids with no gaps', () => {
    const ids = ['gun', 'torpedo', 'mine', 'cannon', 'starShells'] as const;
    for (const id of ids) expect(TONES[fireTone(id)]).toBeDefined();
  });

  it('the cannon report is heavier (lower start) than the gun crack; the flare is a distinct rise', () => {
    expect(TONES.fireCannon.freqStart).toBeLessThan(TONES.fireGun.freqStart); // heavier
    expect(TONES.fireStarShells.freqEnd).toBeGreaterThan(TONES.fireStarShells.freqStart); // rising pop
  });
});

describe('placeDecoy tone (Story 1.8) — buoy placement cue', () => {
  // The decoy is an instant ability, not a firing weapon, so it is NOT in the
  // fireTone map (decoyBuoy is excluded at the type level); its cue plays as
  // 'placeDecoy' from the Decoys reconcile own-spawn hook (the mine precedent).
  // It shares the soft sine "drop" family with the mine plop but is pitched a
  // touch higher so seeding a buoy is audibly distinct from dropping a mine.
  it('is a soft sine drop, within the short-tone budget, pitched above the mine plop', () => {
    expect(TONES.placeDecoy.type).toBe('sine');
    expect(TONES.placeDecoy.duration).toBeLessThanOrEqual(MAX_TONE_S);
    expect(TONES.placeDecoy.freqStart).toBeGreaterThan(TONES.fireMine.freqStart); // brighter than the mine
    expect(TONES.placeDecoy.freqEnd).toBeLessThan(TONES.placeDecoy.freqStart); // a downward drop
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

describe('upgrade tone — short rising two-note', () => {
  it('rises (ends above its start) and stays within the short-tone budget', () => {
    expect(TONES.upgrade.freqEnd).toBeGreaterThan(TONES.upgrade.freqStart);
    expect(TONES.upgrade.freqMid).toBeGreaterThan(TONES.upgrade.freqStart); // the second note steps UP
    expect(TONES.upgrade.duration).toBeLessThanOrEqual(MAX_TONE_S);
  });
});

describe('point tone — bright single rise (banked-point ping)', () => {
  it('rises continuously (each stage above the last) and stays in the short budget', () => {
    expect(TONES.point.freqMid).toBeGreaterThan(TONES.point.freqStart);
    expect(TONES.point.freqEnd).toBeGreaterThan(TONES.point.freqMid); // single continuous rise
    expect(TONES.point.duration).toBeLessThanOrEqual(MAX_TONE_S);
  });

  it('is distinct from the upgrade "spent" two-note (which plateaus)', () => {
    // upgrade holds its second note (mid === end); point keeps climbing.
    expect(TONES.point.freqEnd).not.toBe(TONES.point.freqMid);
    expect(TONES.upgrade.freqEnd).toBe(TONES.upgrade.freqMid);
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
