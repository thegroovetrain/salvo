// PASSIVE HEALING (sim/regen.ts — Story 10.5, Eric 2026-11-05, epic-10
// amendment 10, R8): a hull that has lost no hull hp for the CONFIG wait heals
// a CONFIG fraction of its MISSING hp per second. Relations only: every
// number is read from CONFIG.regen, never typed.

import { describe, it, expect } from 'vitest';
import { BOON_STAT_PATHS, CONFIG, effectiveStats, hullIsFull, regenDue, regenGain } from '../index.js';

const WAIT = CONFIG.regen.outOfCombatMs;
const RATE = CONFIG.regen.missingPctPerS;
const DT = CONFIG.tick.simDtMs / 1000;
const MAX = effectiveStats(CONFIG.shipClasses.iowa).maxHp;

describe('CONFIG.regen — the two dials', () => {
  it('a positive wait that is a whole number of sim ticks, and a rate that is a fraction of the missing hp', () => {
    expect(WAIT).toBeGreaterThan(0);
    expect(WAIT % CONFIG.tick.simDtMs).toBe(0);
    expect(RATE).toBeGreaterThan(0);
    expect(RATE).toBeLessThan(1);
  });

  it('is FIXED: no stat path addresses it (not a stat, no card)', () => {
    for (const path of BOON_STAT_PATHS) expect(path.startsWith('regen'), path).toBe(false);
    expect('regen' in effectiveStats(CONFIG.shipClasses.iowa)).toBe(false);
  });
});

describe('regenDue — only after the wait', () => {
  it('not due one tick short of the wait, due exactly at it and after — from any last-damaged stamp', () => {
    for (const lastDamagedAt of [0, 7_350, 480_000]) {
      expect(regenDue(lastDamagedAt, lastDamagedAt)).toBe(false);
      expect(regenDue(lastDamagedAt + WAIT - CONFIG.tick.simDtMs, lastDamagedAt)).toBe(false);
      expect(regenDue(lastDamagedAt + WAIT, lastDamagedAt)).toBe(true);
      expect(regenDue(lastDamagedAt + 10 * WAIT, lastDamagedAt)).toBe(true);
    }
  });

  it('a fresh blow RESTARTS the wait: due before it, not due after it until the whole wait has run again', () => {
    const firstHit = 1000;
    const now = firstHit + WAIT + 500;
    expect(regenDue(now, firstHit)).toBe(true);
    const secondHit = now; // any hull damage re-stamps lastDamagedAt
    expect(regenDue(now, secondHit)).toBe(false);
    expect(regenDue(secondHit + WAIT - 1, secondHit)).toBe(false);
    expect(regenDue(secondHit + WAIT, secondHit)).toBe(true);
  });

  it('is FAIL-CLOSED on a non-finite clock or stamp', () => {
    expect(regenDue(Number.NaN, 0)).toBe(false);
    expect(regenDue(1e9, Number.NaN)).toBe(false);
  });
});

describe('regenGain — proportional to MISSING hp', () => {
  it('one second of healing is the CONFIG fraction of what is missing', () => {
    for (const hp of [1, MAX / 4, MAX / 2, MAX - 100]) {
      expect(regenGain(hp, MAX, 1), String(hp)).toBeCloseTo((MAX - hp) * RATE, 9);
    }
  });

  it('is LINEAR in the missing amount and in dt: twice as hurt heals twice as fast, a tick is its share of a second', () => {
    const a = regenGain(MAX - 200, MAX, DT);
    const b = regenGain(MAX - 400, MAX, DT);
    expect(b).toBeCloseTo(2 * a, 9);
    expect(regenGain(MAX - 400, MAX, 2 * DT)).toBeCloseTo(2 * b, 9);
    expect(a).toBeCloseTo(regenGain(MAX - 200, MAX, 1) * DT, 9);
  });

  it('is ZERO at full — and over it, and for a zero or negative dt', () => {
    expect(regenGain(MAX, MAX, DT)).toBe(0);
    expect(regenGain(MAX + 5, MAX, DT)).toBe(0);
    expect(regenGain(MAX / 2, MAX, 0)).toBe(0);
    expect(regenGain(MAX / 2, MAX, -DT)).toBe(0);
  });

  it('never overshoots: hp + gain stays at or under max, however long the step', () => {
    for (const hp of [0, 1, MAX / 2, MAX - 1, MAX - 0.25]) {
      for (const dt of [DT, 1, 60, 1e6]) {
        expect(hp + regenGain(hp, MAX, dt), `${hp} over ${dt}`).toBeLessThanOrEqual(MAX);
      }
    }
  });

  it('THE LAST POINT SNAPS (amendment 53): under 1 hp missing, the gain is the whole remainder, so a ticking hull reaches full', () => {
    const hp = MAX - 0.4;
    expect(hullIsFull(hp, MAX)).toBe(true);
    expect(hp + regenGain(hp, MAX, DT)).toBe(MAX);
    // A hull ticking from half reaches EXACTLY full in finite time rather than
    // closing the gap forever.
    let cur = MAX / 2;
    let ticks = 0;
    while (cur < MAX && ticks < 1_000_000) {
      const gain = regenGain(cur, MAX, DT);
      expect(gain).toBeGreaterThan(0);
      cur += gain;
      ticks += 1;
    }
    expect(cur).toBe(MAX);
  });

  it('a non-finite input gains nothing (never NaN hp)', () => {
    expect(regenGain(Number.NaN, MAX, DT)).toBe(0);
    expect(regenGain(MAX / 2, Number.NaN, DT)).toBe(0);
    expect(regenGain(MAX / 2, MAX, Number.NaN)).toBe(0);
  });
});
