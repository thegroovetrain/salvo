// THE BAND STINGS' wiring (audio/hpSting.ts): the two pure functions main.ts's
// `playHpSting` composes every frame, extracted post-landing so the call site
// — not just the edge math in audio/tones.ts (`hpBandEdge`, covered in
// tones.test.ts) — is pinned by a test. main.ts is the Pixi/DOM bootstrap that
// no test imports, so before this extraction the wiring could break silently;
// this is the amendment-60 gap closed.

import { describe, it, expect } from 'vitest';
import { CONFIG, effectiveStats } from '@salvo/shared';
import { CLIENT_CONFIG } from '../../config.js';
import { ownHpFrac, hpStingCue, hpStingCueAt, hpStingFloor } from '../hpSting.js';

// A real EffectiveStats (via the shared derivation, never a hand-rolled stub)
// with `maxHp` overridden per case — `ownHpFrac` only reads that one field.
const BASE_STATS = effectiveStats(CONFIG.shipClasses.battleship);

/** A minimal own-status stand-in — only the three fields `ownHpFrac` reads. */
function status(hp: number, maxHp: number, alive = true) {
  return { hp, alive, stats: { ...BASE_STATS, maxHp } };
}

describe('ownHpFrac — own-status to hull fraction', () => {
  it('divides hp by maxHp while alive', () => {
    expect(ownHpFrac(status(50, 100))).toBe(0.5);
    expect(ownHpFrac(status(100, 100))).toBe(1);
    expect(ownHpFrac(status(0, 100))).toBe(0);
  });

  // NULL IS NOT ZERO — a dead hull reading as 0 would fire the critical sting
  // at the moment you die and again on every spectate frame afterward, since
  // hpBandEdge sees a downward crossing into 0 exactly once per death.
  it('is null (never 0) when dead, even with a positive hp/maxHp on record', () => {
    expect(ownHpFrac(status(50, 100, false))).toBeNull();
    expect(ownHpFrac(status(0, 100, false))).toBeNull();
  });

  it('is null (never a divide-by-zero 0 or NaN) when there is no usable maxHp', () => {
    expect(ownHpFrac(status(50, 0))).toBeNull();
    expect(ownHpFrac(status(50, -10))).toBeNull();
  });
});

describe('hpStingCue — fraction pair to cue id, delegating to hpBandEdge', () => {
  it('crossing below 0.5 yields hpHurt exactly once, then silence while inside the band', () => {
    expect(hpStingCue(0.6, 0.4)).toBe('hpHurt');
    expect(hpStingCue(0.4, 0.35)).toBeNull(); // still inside the band — no repeat
  });

  it('crossing below 0.25 yields hpCritical', () => {
    expect(hpStingCue(0.4, 0.2)).toBe('hpCritical');
    expect(hpStingCue(0.2, 0.1)).toBeNull(); // still critical — no repeat
  });

  it('falling through BOTH bands in one step yields hpCritical only, never two cues', () => {
    expect(hpStingCue(0.6, 0.1)).toBe('hpCritical');
    expect(hpStingCue(1, 0)).toBe('hpCritical');
  });

  it('recovering upward is silent, and re-crossing downward later fires again', () => {
    expect(hpStingCue(0.4, 0.7)).toBeNull(); // healed back over 0.5
    expect(hpStingCue(0.7, 0.45)).toBe('hpHurt'); // and down again — no latch to reset
  });

  // No own hull (dead/spectating) or a nonsensical maxHp must resolve through
  // ownHpFrac to null, and null must never be mistaken for "just hit zero" —
  // that would fire the critical sting at the moment of death and again on
  // every spectate frame, since a stale null->null pair must stay silent.
  it('is silent for a missing hull on either side — never reads null as a crossing to 0', () => {
    expect(hpStingCue(0.6, null)).toBeNull(); // died mid-band
    expect(hpStingCue(null, 0.6)).toBeNull(); // respawned/first frame back
    expect(hpStingCue(null, null)).toBeNull(); // spectating the whole time
  });

  it('a null previous fraction (first frame of a life) never spuriously fires', () => {
    expect(hpStingCue(null, 0.9)).toBeNull();
    expect(hpStingCue(null, 0.4)).toBeNull(); // spawns already hurt — still no fire without a prior frame
    expect(hpStingCue(null, 0.1)).toBeNull(); // spawns already critical — same
  });
});

// --- THE STINGS' BOUND (review gate) ----------------------------------------
//
// The stings shipped unbounded on the reasoning that an edge cannot repeat. It
// can: DAMAGE CONTROL regen pays into `hp` every server tick while incoming fire
// subtracts, so a hull held around a band crosses it downward again and again.
// The bound is the RATIFIED 300ms same-source floor every world cue already
// uses — no new constant (amendment 37), and no hysteresis margin, which is a
// feel number belonging to the owner's listening pass.

describe('hpStingCueAt — the same-source floor on the band alarms', () => {
  const FLOOR = CLIENT_CONFIG.gunnery.hitCallToneFloorMs;

  it('the first crossing always sounds', () => {
    expect(hpStingCueAt(0.6, 0.4, 1000, hpStingFloor())).toBe('hpHurt');
  });

  it('REGEN CHATTER: repeated crossings inside the floor collapse to one sting', () => {
    const floor = hpStingFloor();
    // Held around 50% under sustained fire: regen lifts the hull back over the
    // band and the next round drops it through again, several times a second.
    expect(hpStingCueAt(0.6, 0.49, 1000, floor)).toBe('hpHurt');
    expect(hpStingCueAt(0.51, 0.49, 1050, floor)).toBeNull();
    expect(hpStingCueAt(0.51, 0.49, 1100, floor)).toBeNull();
    expect(hpStingCueAt(0.51, 0.49, 1200, floor)).toBeNull();
  });

  it('...and past the floor the alarm is heard again — refused, never silenced for good', () => {
    const floor = hpStingFloor();
    expect(hpStingCueAt(0.6, 0.49, 1000, floor)).toBe('hpHurt');
    expect(hpStingCueAt(0.51, 0.49, 1000 + FLOOR - 1, floor)).toBeNull();
    expect(hpStingCueAt(0.51, 0.49, 1000 + FLOOR, floor)).toBe('hpHurt');
  });

  it('the floor is SHARED by both stings — the critical alarm is one source with the hurt one', () => {
    // Falling all the way through both bands inside one floor is ONE event to
    // the ear, not two; the worse band is the one that survives (hpBandEdge).
    const floor = hpStingFloor();
    expect(hpStingCueAt(0.6, 0.4, 1000, floor)).toBe('hpHurt');
    expect(hpStingCueAt(0.4, 0.2, 1100, floor)).toBeNull();
  });

  it('a frame with NO crossing never spends the floor', () => {
    const floor = hpStingFloor();
    expect(hpStingCueAt(0.9, 0.85, 1000, floor)).toBeNull(); // nothing crossed
    expect(hpStingCueAt(0.85, 0.4, 1010, floor)).toBe('hpHurt'); // ...so this still sounds
  });

  it('the edge semantics are otherwise untouched — it is hpStingCue plus a gate', () => {
    const floor = hpStingFloor();
    expect(hpStingCueAt(0.4, 0.7, 1000, floor)).toBeNull(); // upward is silent
    expect(hpStingCueAt(null, 0.1, 5000, floor)).toBeNull(); // no prior frame
    expect(hpStingCueAt(0.6, 0.1, 9000, floor)).toBe('hpCritical'); // worse band only
  });
});
