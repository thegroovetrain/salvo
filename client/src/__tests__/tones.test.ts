// Audio tone map (audio/tones.ts): pure event-kind -> tone-id mapping,
// spec-table completeness/duration bounds, and the match-phase cue
// edge-detectors. audio/context.ts (the AudioContext adapter) is a thin,
// untested adapter per convention — this file covers everything pure.

import { describe, it, expect } from 'vitest';
import { BOON_CATALOG, CONFIG, type BoonRarity } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import {
  TONES,
  FIT_CATEGORIES,
  fireTone,
  fitDetune,
  fitTone,
  telegraphTone,
  hpBandEdge,
  worldCue,
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
  'heal',
  'burn',
  'hitCall',
  'slowed',
  'dazzled',
  'sink',
  'bounty',
  // the AGGRO STINGS (Story 5.6, amendment 40) — the matched acquire/release pair
  'aggroLock',
  'aggroRelease',
  // the SOUND MAP (Story 4.7) — the six world cues
  'gunReport',
  'impact',
  'splash',
  'sunkWitness',
  'hpHurt',
  'hpCritical',
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

  // Story 4.5 / amendment 57. The ~1.8s foghorn got its OWN play path
  // (Audio.playHorn + audio/horns.ts) precisely so this ceiling would not have
  // to move for it. If a horn ever appears in TONES, or MAX_TONE_S drifts up to
  // accommodate one, the ceiling has stopped meaning anything for the short cues
  // it was written for — which is the thing that ruling protected.
  it('keeps the 150ms ceiling intact — the horn rides its own path, not an exemption', () => {
    expect(MAX_TONE_S).toBe(0.15);
    expect(Object.keys(TONES)).not.toContain('foghorn');
    expect(Object.keys(TONES).filter((id) => /horn/i.test(id))).toEqual([]);
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
    expect(Object.keys(BOON_CATALOG).length).toBeGreaterThanOrEqual(33);
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

describe('bounty tone (Story 4.6) — the two-tone klaxon for taking the throne', () => {
  it('stays inside the 150ms short-cue budget (only sink is exempt)', () => {
    expect(TONES.bounty.duration).toBeLessThanOrEqual(MAX_TONE_S);
  });

  it('is V-CONTOURED — it dips and comes back, which nothing else up here does', () => {
    expect(TONES.bounty.freqMid).toBeLessThan(TONES.bounty.freqStart);
    expect(TONES.bounty.freqEnd).toBeGreaterThan(TONES.bounty.freqMid);
    // Its high-register neighbours all glide ONE way and stop.
    for (const id of ['kill', 'point', 'dazzled'] as const) {
      expect(TONES[id].freqMid).toBeGreaterThan(TONES[id].freqStart);
    }
  });

  it('is the only NON-FLAT square in the high register (the ticks never move in pitch)', () => {
    expect(TONES.bounty.type).toBe('square');
    for (const id of ['tick', 'telegraphUp', 'telegraphDown'] as const) {
      expect(TONES[id].freqStart).toBe(TONES[id].freqEnd);
    }
  });

  it('shares its contour ONLY with the Hit Call, two octaves down on a soft triangle', () => {
    // hitCall is the catalog's other dip-and-return; the separation is register
    // and voice, so the two can never be confused.
    expect(TONES.hitCall.freqStart).toBeLessThan(TONES.bounty.freqStart / 4);
    expect(TONES.hitCall.type).not.toBe(TONES.bounty.type);
  });

  it('carries no noise layer — it is a status change, not an impact', () => {
    expect(TONES.bounty.noise).toBeUndefined();
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

// --- STORY 4.7: THE SOUND MAP ---------------------------------------------------
//
// Six cues for things that happen OUT IN THE WORLD, each riding an event the
// client already receives and already draws. The specs are an UNRATIFIED
// implementer draft awaiting Eric's ear; what this suite pins is the part that
// IS reviewable — the separation arguments written into audio/tones.ts. Every
// assertion below is one of those arguments, so a retune that quietly collapses
// two cues into each other fails here rather than on the water.

describe('the SOUND MAP catalog (Story 4.7) — six cues for the world, not for you', () => {
  const SOUND_MAP = ['gunReport', 'impact', 'splash', 'sunkWitness', 'hpHurt', 'hpCritical'] as const;

  it('every new cue stays inside the 150ms short-cue budget (only sink is exempt)', () => {
    for (const id of SOUND_MAP) {
      expect(TONES[id].duration, id).toBeLessThanOrEqual(MAX_TONE_S);
    }
  });

  it('gunReport is your own gun crack after distance has eaten it — darker, duller, quieter', () => {
    expect(TONES.gunReport.freqStart).toBeLessThan(TONES.fireGun.freqStart / 2); // the highs go first
    expect(TONES.gunReport.type).not.toBe(TONES.fireGun.type); // no square edge left
    expect(TONES.gunReport.volume).toBeLessThan(TONES.fireGun.volume);
    expect(TONES.gunReport.noise).toBe(true); // a report is still a transient
  });

  it('gunReport separates from the damage thud on register, sweep, length AND transient', () => {
    // The closest neighbour: same family, same octave. Four channels move.
    expect(TONES.gunReport.freqStart).toBeGreaterThan(TONES.damage.freqStart);
    expect(TONES.gunReport.freqEnd).toBeLessThan(TONES.damage.freqEnd);
    expect(TONES.gunReport.duration).toBeLessThan(TONES.damage.duration);
    expect(TONES.gunReport.volume).toBeLessThan(TONES.damage.volume);
    expect(TONES.damage.noise).toBeUndefined();
  });

  it('HIT and MISS sit at opposite ends of the catalog — the one pair that must never blur', () => {
    // Bracket-and-walk is the Gunnery Conversation's whole point, so impact and
    // splash share NO channel: not register, not waveform, not level.
    expect(TONES.splash.freqStart).toBeGreaterThan(TONES.impact.freqStart * 2);
    expect(TONES.impact.type).toBe('sawtooth');
    expect(TONES.splash.type).toBe('sine');
    expect(TONES.impact.volume).toBeGreaterThan(TONES.splash.volume);
  });

  it('impact cannot be confused with the Hit Call, which may fire in the SAME frame', () => {
    expect(TONES.impact.freqStart).toBeGreaterThan(TONES.hitCall.freqStart * 1.5);
    expect(TONES.impact.type).not.toBe(TONES.hitCall.type);
    expect(TONES.impact.noise).toBe(true);
    expect(TONES.hitCall.noise).toBeUndefined(); // "a transient would make it a near crack"
    // hitCall dips and RETURNS; impact falls and stops.
    expect(TONES.impact.freqEnd).toBeLessThan(TONES.impact.freqMid);
    expect(TONES.hitCall.freqEnd).toBeGreaterThan(TONES.hitCall.freqMid);
  });

  it('impact separates from the denied blat — the most frequent cue in the game', () => {
    expect(TONES.impact.type).not.toBe(TONES.denied.type); // sawtooth grit vs square blat
    expect(TONES.denied.noise).toBeUndefined(); // the refusal is curt BY DEFINITION
    expect(TONES.impact.duration).toBeGreaterThan(TONES.denied.duration);
    expect(TONES.impact.freqEnd).toBeLessThan(TONES.denied.freqEnd);
  });

  it('impact shares the sawtooth voice with the alarm family but not its shape or length', () => {
    expect(TONES.impact.duration).toBeLessThan(TONES.sink.duration / 2);
    expect(TONES.impact.freqStart).toBeLessThan(TONES.sink.freqStart);
    expect(TONES.impact.freqMid).toBeLessThan(TONES.sink.freqMid); // already collapsed at 40%
    expect(TONES.stormWarn.noise).toBeUndefined();
  });

  it('splash is the quietest, softest, wettest cue — a miss is information, not an event', () => {
    const quietest = Math.min(...Object.values(TONES).map((t) => t.volume));
    expect(TONES.splash.volume).toBe(quietest);
    expect(TONES.splash.noise).toBe(true); // the hiss is what says "water"
    expect(TONES.splash.freqEnd).toBeLessThan(TONES.splash.freqStart); // it thins out
  });

  it('splash never settles like heal and never rises like the reward cues', () => {
    expect(TONES.heal.freqEnd).toBe(TONES.heal.freqMid); // heal holds its root...
    expect(TONES.splash.freqEnd).not.toBe(TONES.splash.freqMid); // ...this keeps falling
    expect(TONES.heal.noise).toBeUndefined();
    for (const id of ['point', 'kill'] as const) {
      expect(TONES[id].freqEnd, id).toBeGreaterThan(TONES[id].freqStart);
    }
    // ...and it is not one of the soft sine DROPS, which live an octave below.
    for (const id of ['fireMine', 'placeDecoy'] as const) {
      expect(TONES.splash.freqStart, id).toBeGreaterThan(TONES[id].freqStart * 1.5);
      expect(TONES[id].noise, id).toBeUndefined();
    }
  });

  it('sunkWitness falls to the lowest floor in the catalog — a hull sinking out of hearing', () => {
    const floors = Object.values(TONES).map((t) => t.freqEnd);
    expect(TONES.sunkWitness.freqEnd).toBe(Math.min(...floors));
  });

  it('sunkWitness is not YOUR sink, and not your credited kill', () => {
    expect(TONES.sunkWitness.type).not.toBe(TONES.sink.type); // soft triangle vs alarm sawtooth
    expect(TONES.sunkWitness.duration).toBeLessThan(TONES.sink.duration / 2);
    // kill RISES (the credit), this FALLS (the hull) — they will fire together.
    expect(TONES.kill.freqEnd).toBeGreaterThan(TONES.kill.freqStart);
    expect(TONES.sunkWitness.freqEnd).toBeLessThan(TONES.sunkWitness.freqStart);
  });

  it('sunkWitness is a groan, not a crack — the attack is what separates it from impact', () => {
    expect(TONES.sunkWitness.noise).toBeUndefined();
    expect(TONES.impact.noise).toBe(true);
    expect(TONES.sunkWitness.type).not.toBe(TONES.impact.type);
    // ...and from the catalog's other transient-free low triangle, by CONTOUR.
    expect(TONES.hitCall.freqEnd).toBeGreaterThan(TONES.hitCall.freqMid); // dips and returns
    expect(TONES.sunkWitness.freqEnd).toBeLessThan(TONES.sunkWitness.freqMid); // never comes back
  });

  it('the HP stings WHOOP where the alarm family falls, and end BELOW where they began', () => {
    for (const id of ['hpHurt', 'hpCritical'] as const) {
      expect(TONES[id].type, id).toBe('sawtooth'); // the alarm family's voice, deliberately
      expect(TONES[id].freqMid, id).toBeGreaterThan(TONES[id].freqStart); // up...
      expect(TONES[id].freqEnd, id).toBeLessThan(TONES[id].freqStart); // ...and down THROUGH
      expect(TONES[id].noise, id).toBeUndefined(); // nothing struck you at a crossing
    }
    for (const id of ['stormWarn', 'sink'] as const) {
      expect(TONES[id].freqMid, id).toBeLessThan(TONES[id].freqStart); // siblings fall monotonically
    }
    // The catalog's only other rise-then-fall cues both settle ABOVE their start.
    for (const id of ['matchStart', 'dazzled'] as const) {
      expect(TONES[id].freqEnd, id).toBeGreaterThan(TONES[id].freqStart);
    }
  });

  it('hpCritical is heavier than hpHurt on five independent channels', () => {
    expect(TONES.hpCritical.freqStart).toBeLessThan(TONES.hpHurt.freqStart);
    expect(TONES.hpCritical.freqMid).toBeLessThan(TONES.hpHurt.freqMid);
    expect(TONES.hpCritical.freqEnd).toBeLessThan(TONES.hpHurt.freqEnd);
    expect(TONES.hpCritical.duration).toBeGreaterThan(TONES.hpHurt.duration);
    expect(TONES.hpCritical.volume).toBeGreaterThan(TONES.hpHurt.volume);
  });

  it('neither sting can be confused with the damage thud or the denied refusal', () => {
    for (const id of ['hpHurt', 'hpCritical'] as const) {
      expect(TONES[id].type, id).not.toBe(TONES.damage.type);
      expect(TONES[id].type, id).not.toBe(TONES.denied.type);
      // Both of those fall monotonically; a sting rises first.
      expect(TONES[id].freqMid, id).toBeGreaterThan(TONES[id].freqStart);
    }
    expect(TONES.damage.freqMid).toBeLessThan(TONES.damage.freqStart);
    expect(TONES.denied.freqMid).toBeLessThan(TONES.denied.freqStart);
  });
});

describe('worldCue (Story 4.7) — attenuate + place a cue that happened out there', () => {
  // ONE reach for every world cue: the eighths ladder's 8/8 rung. It is a
  // FALLOFF SCALE, never a gate — the server already decided what reaches this
  // client, and re-deriving that here would be a second implementation of a
  // perception rule.
  const REACH = CONFIG.vision.radar;
  const { worldFloorGain, panMax } = CLIENT_CONFIG.audio;

  /** Non-null helper — a cue inside the reach must always resolve. */
  const cue = (dx: number, dy: number, reach = REACH) => {
    const c = worldCue(dx, dy, reach);
    if (!c) throw new Error(`expected a cue at (${dx},${dy})`);
    return c;
  };

  it('is at full gain and dead centre at the listener', () => {
    const c = cue(0, 0);
    expect(c.gain).toBeCloseTo(1, 12);
    expect(c.pan).toBe(0);
  });

  it('falls LINEARLY to exactly the floor at the reach — not inverse-square', () => {
    expect(cue(0, REACH).gain).toBeCloseTo(worldFloorGain, 12);
    // Halfway out is halfway between 1 and the floor. Under a 1/d² curve it
    // would already be at a quarter, which is the whole reason that shape was
    // rejected: everything past truesight would be indistinguishably silent.
    expect(cue(0, REACH / 2).gain).toBeCloseTo((1 + worldFloorGain) / 2, 12);
    expect(cue(REACH / 4, 0).gain).toBeCloseTo(worldFloorGain + (1 - worldFloorGain) * 0.75, 12);
  });

  it('never exceeds 1 and never drops below the floor, anywhere in the reach', () => {
    for (let i = 0; i <= 20; i++) {
      const d = (REACH * i) / 20;
      for (const g of [cue(d, 0).gain, cue(-d, 0).gain, cue(0, d).gain]) {
        expect(g).toBeLessThanOrEqual(1);
        expect(g).toBeGreaterThanOrEqual(worldFloorGain - 1e-12);
      }
    }
    // ...and a diagonal is attenuated by TRUE distance, not by either axis.
    expect(cue(REACH * 0.3, REACH * 0.4).gain).toBeCloseTo(cue(0, REACH * 0.5).gain, 12);
  });

  it('pans toward the side the cue is on, and NEVER hard', () => {
    expect(cue(REACH, 0).pan).toBeCloseTo(panMax, 12);
    expect(cue(-REACH, 0).pan).toBeCloseTo(-panMax, 12);
    expect(cue(REACH * 0.4, 0).pan).toBeGreaterThan(0);
    expect(cue(-REACH * 0.4, 0).pan).toBeLessThan(0);
    expect(Math.abs(cue(REACH * 0.4, 0).pan)).toBeLessThan(panMax);
    expect(panMax).toBeLessThan(1); // a hard pan would vanish on one channel
  });

  it('the cross-axis carries no pan at all — dead ahead and dead astern are both centred', () => {
    expect(cue(0, REACH * 0.5).pan).toBe(0);
    expect(cue(0, -REACH * 0.5).pan).toBe(0);
  });

  it('CLAMPS past the reach — it keeps the bearing and holds the floor, never null', () => {
    // The reach is a FALLOFF SCALE, and events legitimately arrive from beyond
    // it: a captain with intel-range boons fires out past base radar, and a
    // spectator's frames are unfogged. Returning null there dropped the PAN —
    // the one thing the cue exists to carry — for a mark already on screen.
    const far = worldCue(REACH * 1.2, 0, REACH);
    expect(far).not.toBeNull();
    expect(far!.gain).toBeCloseTo(worldFloorGain, 12); // already the floor at the reach
    expect(far!.pan).toBeCloseTo(panMax, 12); // ...and still to starboard
    expect(worldCue(-REACH * 2, 0, REACH)!.pan).toBeCloseTo(-panMax, 12);
    expect(worldCue(REACH, REACH, REACH)).not.toBeNull(); // a diagonal past the reach
    expect(worldCue(REACH, 0, REACH)).not.toBeNull(); // exactly AT the reach still sounds
  });

  it('is CONTINUOUS across the old cutoff — no pan snapping to centre at the boundary', () => {
    const inside = cue(REACH - 1, 0);
    const outside = worldCue(REACH + 1, 0, REACH)!;
    expect(outside.pan).toBeCloseTo(inside.pan, 2); // not 0.7 → 0
    expect(outside.pan).toBeGreaterThan(0);
    expect(outside.gain).toBeCloseTo(inside.gain, 2); // gain was already continuous
  });

  it('degrades safely on junk rather than throwing', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(worldCue(bad, 0, REACH)).toBeNull();
      expect(worldCue(0, bad, REACH)).toBeNull();
      expect(worldCue(0, 0, bad)).toBeNull();
    }
    expect(worldCue(0, 0, 0)).toBeNull(); // a zero reach would divide by zero
    expect(worldCue(0, 0, -1)).toBeNull();
  });
});

describe('hpBandEdge (Story 4.7) — one sting per DOWNWARD band crossing', () => {
  const { amberBelow, criticalBelow } = CONFIG.damageBands;

  it('reads its thresholds from shared CONFIG, never from local literals', () => {
    // amendment 41's binding: 0.5 / 0.25 exist exactly once in the codebase, and
    // moving them must move the rail, the smoke tiers and this sting together.
    expect(hpBandEdge(amberBelow + 0.01, amberBelow - 0.01)).toBe('hurt');
    expect(hpBandEdge(criticalBelow + 0.01, criticalBelow - 0.01)).toBe('critical');
  });

  it('fires once on each crossing and is silent while you stay inside a band', () => {
    expect(hpBandEdge(0.6, 0.4)).toBe('hurt');
    expect(hpBandEdge(0.4, 0.35)).toBeNull(); // still hurt — no repeat
    expect(hpBandEdge(0.4, 0.2)).toBe('critical');
    expect(hpBandEdge(0.2, 0.05)).toBeNull(); // still critical — no repeat
    expect(hpBandEdge(0.9, 0.8)).toBeNull(); // healthy the whole way
  });

  it('is silent going UP — recovery makes no alarm', () => {
    expect(hpBandEdge(0.1, 0.4)).toBeNull();
    expect(hpBandEdge(0.4, 0.9)).toBeNull();
    expect(hpBandEdge(0.1, 1)).toBeNull();
  });

  it('RE-ARMS by construction: heal above a band, take it again, and it fires again', () => {
    // There is no latch to reset — the edge is a function of two adjacent
    // frames, so nothing can get stuck armed or stuck fired.
    expect(hpBandEdge(0.6, 0.4)).toBe('hurt');
    expect(hpBandEdge(0.4, 0.7)).toBeNull(); // healed back over
    expect(hpBandEdge(0.7, 0.45)).toBe('hurt'); // and down again
    expect(hpBandEdge(0.2, 0.6)).toBeNull();
    expect(hpBandEdge(0.6, 0.1)).toBe('critical');
  });

  it('crossing BOTH bands in one step reports the WORSE one only, never two', () => {
    expect(hpBandEdge(0.6, 0.1)).toBe('critical');
    expect(hpBandEdge(1, 0)).toBe('critical');
  });

  it('treats a band bound as the BETTER state — the shared exclusive-lower-bound rule', () => {
    expect(hpBandEdge(0.6, amberBelow)).toBeNull(); // exactly 0.5 is healthy
    expect(hpBandEdge(0.4, criticalBelow)).toBeNull(); // exactly 0.25 is hurt
  });

  it('never reads a MISSING hull as 0 HP (spectating, the respawn gap, maxHp <= 0)', () => {
    expect(hpBandEdge(null, 0.1)).toBeNull();
    expect(hpBandEdge(0.6, null)).toBeNull();
    expect(hpBandEdge(null, null)).toBeNull();
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(hpBandEdge(bad, 0.1)).toBeNull();
      expect(hpBandEdge(0.6, bad)).toBeNull();
    }
  });
});
