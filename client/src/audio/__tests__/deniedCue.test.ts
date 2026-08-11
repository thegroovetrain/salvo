// THE `denied` CUE's accessibility rules (audio/deniedCue.ts) — the twin walk
// (amendment 60, epic-4-context-amendments.md) found the predicted
// ability-press denial and the FIFO-full denial playing the tone with no
// visual twin available (dead/spectating hides the whole hotbar), and found
// the tone unbounded while its visual twin caps at one flash per
// PULSE_RATE_MS. Both fixes live here so they're pinned without importing
// main.ts (the Pixi/DOM bootstrap that runs unconditionally on import).

import { describe, expect, it } from 'vitest';
import { deniedFeedbackHasNoTwin, deniedToneFloor } from '../deniedCue.js';
import { PULSE_RATE_MS } from '../../render/deniedFire.js';

describe('deniedFeedbackHasNoTwin — FIX A: no chip to flash, no tone to play', () => {
  it('has no twin while spectating, whatever alive says', () => {
    expect(deniedFeedbackHasNoTwin(true, true)).toBe(true);
    expect(deniedFeedbackHasNoTwin(true, false)).toBe(true);
    expect(deniedFeedbackHasNoTwin(true, undefined)).toBe(true);
  });

  it('has no twin once sunk (alive === false), not spectating', () => {
    expect(deniedFeedbackHasNoTwin(false, false)).toBe(true);
  });

  it('HAS a twin while alive and not spectating — a denial must still sound ' +
    '(e.g. an ability press denied only because the slot is not loaded)', () => {
    expect(deniedFeedbackHasNoTwin(false, true)).toBe(false);
  });

  it('pre-first-frame (`alive` undefined) reads as having a twin — a missing ' +
    'frame is not yet known to be dead', () => {
    expect(deniedFeedbackHasNoTwin(false, undefined)).toBe(false);
  });
});

describe('deniedToneFloor — FIX B: the tone is bounded to the visual pulse\'s own rate', () => {
  it('reads the existing PULSE_RATE_MS constant, not a new literal', () => {
    const floor = deniedToneFloor();
    expect(floor.request(0)).toBe(true);
    expect(floor.request(PULSE_RATE_MS - 1)).toBe(false); // still inside the floor
    expect(floor.request(PULSE_RATE_MS)).toBe(true); // floor elapsed
  });

  it('two denied events 150ms apart produce ONE tone', () => {
    const floor = deniedToneFloor();
    const played = [0, 150].filter((t) => floor.request(t));
    expect(played).toEqual([0]);
  });

  it('two denied events 350ms apart produce TWO tones', () => {
    const floor = deniedToneFloor();
    const played = [0, 350].filter((t) => floor.request(t));
    expect(played).toEqual([0, 350]);
  });
});
