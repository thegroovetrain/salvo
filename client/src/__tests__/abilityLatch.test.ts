// THE C / V PRESS LATCH (Story 10.5 review gate, Blind Hunter F2): a press the
// client accepted waits on the server's word before a second press of the same
// ability can be accepted, so a double press inside one round trip reads
// DENIED once, never ACTIVATED-then-DENIED. Contracts:
//   * an accepted press latches ITS ability only;
//   * an own frame that carries the ability COOLING (the stamp) opens it;
//   * a server denial for it opens it;
//   * a frame that does not yet carry the stamp (built before the press was
//     applied) keeps it shut — up to the predictor's own give-up bound
//     (PENDING_CAPACITY frames), after which it opens anyway (a lost answer
//     never wedges the key).

import { describe, expect, it } from 'vitest';
import { CONFIG, DEFAULT_CLASS_ID, abilityReadyAt, effectiveStats } from '@salvo/shared';
import {
  OPEN_LATCHES,
  latchHolds,
  latchOnOwnFrame,
  latchPress,
  latchRelease,
} from '../sim/abilityLatch.js';
import { PENDING_CAPACITY } from '../sim/prediction.js';

/** Any hull's folded stats — the latch reads only the stamp's presence. */
const STATS = effectiveStats(CONFIG.shipClasses[DEFAULT_CLASS_ID]);

const NOW = 1_000_000;

describe('the C / V press latch', () => {
  it('opens at rest; an accepted press latches its own ability and no other', () => {
    expect(latchHolds(OPEN_LATCHES, 'repair')).toBe(false);
    expect(latchHolds(OPEN_LATCHES, 'smoke')).toBe(false);
    const l = latchPress(OPEN_LATCHES, 'repair');
    expect(latchHolds(l, 'repair')).toBe(true);
    expect(latchHolds(l, 'smoke')).toBe(false);
  });

  it('a frame without the stamp (the press not yet applied) keeps it shut', () => {
    let l = latchPress(OPEN_LATCHES, 'smoke');
    l = latchOnOwnFrame(l, {}, NOW);
    l = latchOnOwnFrame(l, { smokeReadyAt: NOW - 1 }, NOW); // an old, already-run stamp
    expect(latchHolds(l, 'smoke')).toBe(true);
  });

  it('the frame that carries the ability cooling opens it', () => {
    let l = latchPress(latchPress(OPEN_LATCHES, 'smoke'), 'repair');
    l = latchOnOwnFrame(l, { repairReadyAt: abilityReadyAt(NOW, STATS, 'repair') }, NOW);
    expect(latchHolds(l, 'repair')).toBe(false);
    expect(latchHolds(l, 'smoke')).toBe(true); // the other ability's answer has not come
  });

  it('a server denial for the ability opens it', () => {
    const l = latchRelease(latchPress(latchPress(OPEN_LATCHES, 'repair'), 'smoke'), 'repair');
    expect(latchHolds(l, 'repair')).toBe(false);
    expect(latchHolds(l, 'smoke')).toBe(true);
  });

  it('SAFETY VALVE: with no answer it opens after the predictor\'s own give-up bound of frames, not before', () => {
    let l = latchPress(OPEN_LATCHES, 'repair');
    for (let i = 1; i < PENDING_CAPACITY; i += 1) l = latchOnOwnFrame(l, {}, NOW + i * 50);
    expect(latchHolds(l, 'repair')).toBe(true);
    l = latchOnOwnFrame(l, {}, NOW + PENDING_CAPACITY * 50);
    expect(latchHolds(l, 'repair')).toBe(false);
  });

  it('frames on an open latch leave it open', () => {
    const l = latchOnOwnFrame(OPEN_LATCHES, { repairReadyAt: abilityReadyAt(NOW, STATS, 'repair') }, NOW);
    expect(latchHolds(l, 'repair')).toBe(false);
    expect(latchHolds(l, 'smoke')).toBe(false);
  });
});
