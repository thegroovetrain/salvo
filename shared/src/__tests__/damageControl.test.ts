// DAMAGE CONTROL (Eric rulings 2026-08-04) — CONFIG/wire pins for the
// always-available heal spend. Pure pins, the damageGuardrail idiom: they
// fail the moment a retune or a refactor drifts across a ruled line — the
// sentinel going positive (a card-index collision), the regen rate leaving
// 5 hp/s (the number the design was ruled on), or the four-card draw
// thinning (the strip is a sibling of the row, never a member).

import { describe, it, expect } from 'vitest';
import { CONFIG, HEAL_CHOICE } from '../index.js';

describe('HEAL_CHOICE — the reserved negative spend sentinel', () => {
  it('is exactly -1', () => {
    expect(HEAL_CHOICE).toBe(-1);
  });

  it('is NEGATIVE — a positive sentinel would collide with a real card index the moment offer size moves', () => {
    // Card choices are 0..length-1 by construction, so ONLY a negative value
    // can never alias an offer slot. A refactor that "tidies" this to a
    // positive index (e.g. 4) reintroduces the collision this pin forbids.
    expect(HEAL_CHOICE).toBeLessThan(0);
  });
});

describe('CONFIG.damageControl — flat on every hull (Eric rulings 2026-08-04)', () => {
  it('all three tunables are finite and positive', () => {
    const { instantHp, regenHp, regenMs } = CONFIG.damageControl;
    for (const v of [instantHp, regenHp, regenMs]) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThan(0);
    }
  });

  it('the derived regen rate is EXACTLY the ruled 5 hp/s', () => {
    // THE number the game design was ruled on: the pool pays out at
    // regenHp / (regenMs/1000) hp per second, and pools ADD at this fixed
    // rate (two heals run 10s at 5 hp/s, never 5s at 10 hp/s). Pin the
    // derived rate itself so a retune of either tunable alone trips here.
    expect(CONFIG.damageControl.regenHp / (CONFIG.damageControl.regenMs / 1000)).toBe(5);
  });

  it('pins the ruled amounts: 25 instant + 25 pooled over 5000ms', () => {
    expect(CONFIG.damageControl.instantHp).toBe(25);
    expect(CONFIG.damageControl.regenHp).toBe(25);
    expect(CONFIG.damageControl.regenMs).toBe(5000);
  });
});

describe('the four-card draw is untouched (regression pin)', () => {
  it('CONFIG.offer.size is still 4 — this cycle must not have thinned the draw', () => {
    expect(CONFIG.offer.size).toBe(4);
  });
});
