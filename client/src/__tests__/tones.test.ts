// Audio tone map (audio/tones.ts): pure event-kind -> tone-id mapping,
// spec-table completeness/duration bounds, and the match-phase cue
// edge-detectors. audio/context.ts (the AudioContext adapter) is a thin,
// untested adapter per convention — this file covers everything pure.

import { describe, it, expect } from 'vitest';
import { BOON_CATALOG, type BoonRarity } from '@salvo/shared';
import {
  TONES,
  FIT_CATEGORIES,
  fireTone,
  fitDetune,
  fitTone,
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
  'denied',
  'damage',
  'kill',
  'point',
  'fitCommon',
  'fitRare',
  'fitExclusive',
  'burn',
  'hitCall',
  'slowed',
  'dazzled',
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

describe('denied tone (Story 1.10) — the exactly-one-feedback refusal cue', () => {
  // Fired only via the exactly-one-feedback path (predicted denial OR an
  // unmatched server denial — weapons AND abilities); mute-awareness rides
  // Audio.play like every tone. The character contract: a curt downward BLAT,
  // clearly distinct from every success cue.
  it('is short, noise-free, and a downward refusal (never a rising success shape)', () => {
    expect(TONES.denied.duration).toBeLessThanOrEqual(MAX_TONE_S);
    expect(TONES.denied.noise).toBeUndefined(); // no gun-crack noise layer
    expect(TONES.denied.freqEnd).toBeLessThan(TONES.denied.freqStart); // downward blat
  });

  it('is distinct from every fire/placement success cue and the damage thud', () => {
    // Starts well BELOW every gun-family crack (fireGun 900 / fireCannon 520)…
    expect(TONES.denied.freqStart).toBeLessThan(TONES.fireCannon.freqStart);
    expect(TONES.denied.freqStart).toBeLessThan(TONES.fireGun.freqStart);
    // …is not a soft sine drop (the mine/decoy placement family)…
    expect(TONES.denied.type).not.toBe(TONES.fireMine.type);
    expect(TONES.denied.type).not.toBe(TONES.placeDecoy.type);
    // …and is a different waveform family from the damage thud.
    expect(TONES.denied.type).not.toBe(TONES.damage.type);
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

describe('the FIT family (Story 2.9) — one two-note template, three tier weights', () => {
  const TIERS = ['fitCommon', 'fitRare', 'fitExclusive'] as const;

  it('every tier is the same rising two-note shape, inside the short-tone budget', () => {
    for (const id of TIERS) {
      const t = TONES[id];
      expect(t.freqMid).toBeGreaterThan(t.freqStart); // the second note steps UP
      expect(t.freqEnd).toBe(t.freqMid); // ...and HOLDS (the retired `upgrade` shape)
      expect(t.duration).toBeLessThanOrEqual(MAX_TONE_S);
      expect(t.type).toBe('triangle'); // one instrument, three weights
      expect(t.noise).toBeUndefined(); // never a gun-family transient
    }
  });

  it('WEIGHTS by tier: the root drops, the note lengthens, the level rises', () => {
    const [common, rare, exclusive] = TIERS.map((id) => TONES[id]);
    expect(rare.freqStart).toBeLessThan(common.freqStart);
    expect(exclusive.freqStart).toBeLessThan(rare.freqStart);
    expect(rare.duration).toBeGreaterThan(common.duration);
    expect(exclusive.duration).toBeGreaterThan(rare.duration);
    expect(rare.volume).toBeGreaterThan(common.volume);
    expect(exclusive.volume).toBeGreaterThan(rare.volume);
  });

  it('routes a boon rarity to its cue, and fails OPEN (never silent) on junk', () => {
    expect(fitTone('common')).toBe('fitCommon');
    expect(fitTone('rare')).toBe('fitRare');
    expect(fitTone('exclusive')).toBe('fitExclusive');
    expect(fitTone(undefined)).toBe('fitCommon');
    expect(fitTone('legendary' as BoonRarity)).toBe('fitCommon');
  });

  it('every catalog line maps to a fit cue with a real spec (no silent boon)', () => {
    const silent = Object.values(BOON_CATALOG).filter((def) => TONES[fitTone(def.rarity)] === undefined);
    expect(silent).toEqual([]);
    expect(Object.keys(BOON_CATALOG).length).toBeGreaterThanOrEqual(36);
  });
});

describe('point tone — bright single rise (banked-point ping)', () => {
  it('rises continuously (each stage above the last) and stays in the short budget', () => {
    expect(TONES.point.freqMid).toBeGreaterThan(TONES.point.freqStart);
    expect(TONES.point.freqEnd).toBeGreaterThan(TONES.point.freqMid); // single continuous rise
    expect(TONES.point.duration).toBeLessThanOrEqual(MAX_TONE_S);
  });

  it('is distinct from the FIT family\'s "spent" two-note (which plateaus)', () => {
    // Every fit tone holds its second note (mid === end); point keeps climbing.
    expect(TONES.point.freqEnd).not.toBe(TONES.point.freqMid);
    expect(TONES.fitCommon.freqEnd).toBe(TONES.fitCommon.freqMid);
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

// --- STORY 2.9: the per-CATEGORY fit transposition ------------------------------
//
// Tier picks the cue's weight (fitTone); category moves it up or down the scale
// (fitDetune, in cents). One family, nine voices — so fitting a gun common and a
// mine common back to back are audibly different EVENTS without being different
// cues, and neither needs a new tone spec.

describe('fitDetune — one fit family, nine category voices', () => {
  const CATEGORIES = [...new Set(Object.values(BOON_CATALOG).map((d) => d.category))];

  it('covers EXACTLY the catalog\'s categories — no gap, no orphan', () => {
    expect([...FIT_CATEGORIES].sort()).toEqual([...CATEGORIES].sort());
    expect(CATEGORIES).toHaveLength(9);
  });

  it('gives every category a DISTINCT transposition inside ±4 semitones', () => {
    const cents = CATEGORIES.map((c) => fitDetune(c));
    expect(new Set(cents).size).toBe(CATEGORIES.length);
    for (const c of cents) expect(Math.abs(c)).toBeLessThanOrEqual(400);
  });

  it('every category lands on a whole semitone (no microtonal drift)', () => {
    for (const c of CATEGORIES) expect(Math.abs(fitDetune(c) % 100)).toBe(0);
  });

  it('fails OPEN to the untransposed root on a junk/absent category', () => {
    expect(fitDetune('')).toBe(0);
    expect(fitDetune('notACategory')).toBe(0);
  });

  it('every catalog line therefore has BOTH a weight and a voice', () => {
    for (const def of Object.values(BOON_CATALOG)) {
      expect(TONES[fitTone(def.rarity)]).toBeDefined();
      expect(Number.isFinite(fitDetune(def.category))).toBe(true);
    }
  });
});

// --- STORY 2.9: the victim tells + the burn treatment ---------------------------

describe('the victim cues (Story 2.9) — burn / slowed / dazzled', () => {
  it('are all inside the short-tone budget', () => {
    for (const id of ['burn', 'slowed', 'dazzled'] as const) {
      expect(TONES[id].duration).toBeLessThanOrEqual(MAX_TONE_S);
    }
  });

  it('burn is the damage thud\'s quieter, lower sibling — the same register, not a new one', () => {
    expect(TONES.burn.type).toBe(TONES.damage.type); // same family: this IS damage
    expect(TONES.burn.freqStart).toBeLessThan(TONES.damage.freqStart); // ...but under it
    expect(TONES.burn.volume).toBeLessThan(TONES.damage.volume); // a DoT tick, not a slam
  });

  it('slowed SAGS and dazzled STINGS — opposite shapes, so the two never blur', () => {
    expect(TONES.slowed.freqEnd).toBeLessThan(TONES.slowed.freqStart); // revs falling
    expect(TONES.dazzled.freqMid).toBeGreaterThan(TONES.dazzled.freqStart); // a wash upward
    expect(TONES.dazzled.freqStart).toBeGreaterThan(TONES.slowed.freqStart * 2);
  });

  it('neither tell can be confused with the denied refusal or a fire cue', () => {
    for (const id of ['slowed', 'dazzled'] as const) {
      expect(TONES[id].type).not.toBe(TONES.denied.type); // never the square blat
      expect(TONES[id].noise).toBeUndefined(); // never a gun-family transient
    }
  });
});

// --- STORY 4.3: the HIT CALL — the muffled boom --------------------------------
//
// "Something you fired or laid CONNECTED", possibly at a hull you cannot see.
// The character contract: the lowest tone in the catalog, a soft triangle with
// no transient (muffled = distance), and a contour that DIPS and rolls back up
// — a swell, not an impact. Its neighbours in the low register (damage, burn,
// stormWarn) are all things happening TO you, and all fall monotonically.

describe('hitCall tone (Story 4.3) — a connection you may not be able to see', () => {
  it('is a short, noise-free triangle inside the tone budget', () => {
    expect(TONES.hitCall.type).toBe('triangle');
    expect(TONES.hitCall.noise).toBeUndefined(); // a transient would make it a near crack
    expect(TONES.hitCall.duration).toBeLessThanOrEqual(MAX_TONE_S);
  });

  it('sits BELOW every low-register neighbour it must not be confused with', () => {
    for (const id of ['damage', 'burn', 'stormWarn'] as const) {
      expect(TONES.hitCall.freqStart, id).toBeLessThan(TONES[id].freqStart);
    }
  });

  it('DIPS and rolls back up, where every low neighbour falls and stops', () => {
    expect(TONES.hitCall.freqMid).toBeLessThan(TONES.hitCall.freqStart); // the punch down
    expect(TONES.hitCall.freqEnd).toBeGreaterThan(TONES.hitCall.freqMid); // ...and the swell back
    for (const id of ['damage', 'burn', 'stormWarn'] as const) {
      expect(TONES[id].freqEnd, id).toBeLessThan(TONES[id].freqMid); // monotonic fall
    }
  });

  it('is not the storm\'s sawtooth growl, and carries no burn hiss', () => {
    expect(TONES.hitCall.type).not.toBe(TONES.stormWarn.type);
    expect(TONES.burn.noise).toBe(true);
  });
});
