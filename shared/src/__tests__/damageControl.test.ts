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

  it('the derived regen rate is EXACTLY 10 hp/s — DOUBLED with hull hp', () => {
    // SUPERSEDES the ruled 5 hp/s (Eric 2026-08-04) — balance cycle 1 doubled
    // `regenHp` 25 → 50 while `regenMs` stayed 5000, so the rate doubled with it.
    // That is deliberate and it is what was MEASURED: hull hp doubled in the
    // same pass, so a 5 hp/s pool would have healed half as fast RELATIVE to a
    // hull, which is the same silent repricing the flat-amount problem caused
    // for the pool's size. Doubling both holds the heal at the fraction of a
    // hull it was always worth.
    //
    // THE INVARIANT THE OLD RULING WAS REALLY ABOUT IS INTACT: pools still ADD
    // and never ACCELERATE — two heals run 10s at 10 hp/s, never 5s at 20 hp/s.
    // What moved is the base rate, not the stacking law.
    expect(CONFIG.damageControl.regenHp / (CONFIG.damageControl.regenMs / 1000)).toBe(10);
  });

  it('pins the amounts: 50 instant + 50 pooled over 5000ms', () => {
    expect(CONFIG.damageControl.instantHp).toBe(50);
    expect(CONFIG.damageControl.regenHp).toBe(50);
    expect(CONFIG.damageControl.regenMs).toBe(5000);
  });

  it('a heal is worth the SAME FRACTION of every hull it was before the doubling', () => {
    // The whole reason damageControl moved at all. Amounts are flat by ruling,
    // so hull hp doubling without them would have cut a heal's relative value
    // by half on every hull — measured as bots burning levels on heals instead
    // of boons, worst on the highest-hp hull.
    const heal = CONFIG.damageControl.instantHp + CONFIG.damageControl.regenHp;
    const before = { torpedoBoat: 125, battleship: 350 / 2, mineLayer: 150 };
    for (const [hull, oldHp] of Object.entries(before)) {
      const nowFrac = heal / CONFIG.shipClasses[hull as keyof typeof CONFIG.shipClasses].hp;
      expect(nowFrac).toBeCloseTo(50 / oldHp, 10);
    }
  });
});

describe('the four-card draw is untouched (regression pin)', () => {
  it('CONFIG.offer.size is still 4 — this cycle must not have thinned the draw', () => {
    expect(CONFIG.offer.size).toBe(4);
  });
});
