// PERCENTAGE HEALING (CONFIG.damageControl.healFlatPct / healMissingPct /
// levelMissingPct) — Eric, 2026-08-23: "the heal option restores 10% of your
// maximum hull as a flat heal and 10% of your missing hull (after the flat
// heal) over 5 seconds".
//
// TWO PROPERTIES CARRY THE FEATURE.
//
// (1) THE ORDER IS LOAD-BEARING. "After the flat heal" means the instant part
//     shrinks the missing pool that is measured against it, so the two
//     percentages are NOT interchangeable and swapping them changes the payout.
//     A test asserts the difference explicitly rather than trusting the code to
//     read correctly.
//
// (2) THE FLAT PATH MUST STAY BYTE-IDENTICAL at the shipped 0s, including its
//     anti-flask behaviour (pools ADD, rate never changes). Percentage mode
//     deliberately departs from that rule — variable amount, fixed 5 s
//     duration — and the departure must not leak into the flat path.

import { describe, it, expect } from 'vitest';
import { CONFIG, HEAL_CHOICE, type HullId } from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';

const DC = CONFIG.damageControl as {
  healFlatPct: number;
  healMissingPct: number;
  healPoolPct: number;
  levelMissingPct: number;
  levelHp: number;
};

function withPct<T>(flat: number, missing: number, fn: () => T, levelMissing = 0): T {
  const f = DC.healFlatPct;
  const m = DC.healMissingPct;
  const l = DC.levelMissingPct;
  DC.healFlatPct = flat;
  DC.healMissingPct = missing;
  DC.levelMissingPct = levelMissing;
  try {
    return fn();
  } finally {
    DC.healFlatPct = f;
    DC.healMissingPct = m;
    DC.levelMissingPct = l;
  }
}

function bareWorld(seed = 3): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  return w;
}

function place(w: World, id: string, hull: HullId = 'battleship'): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), 'captain', hull);
  rec.state.speed = 0;
  return rec;
}

/** Bank one level so a heal is spendable, without relying on the passive tick. */
function bank(w: World, s: ShipRecord): void {
  w.grantXp(s, 1);
}

const SECOND = 1000 / CONFIG.tick.simDtMs;

describe('percentage heal: OFF is the shipped game', () => {
  it('ships at 0 and pays the flat amounts', () => {
    expect(CONFIG.damageControl.healFlatPct).toBe(0);
    expect(CONFIG.damageControl.healMissingPct).toBe(0);
    expect(CONFIG.damageControl.levelMissingPct).toBe(0);
    const w = bareWorld();
    const a = place(w, 'a');
    a.hp = 100;
    bank(w, a);
    expect(w.spendPoint('a', HEAL_CHOICE)).toBe(true);
    expect(a.hp).toBe(100 + CONFIG.damageControl.instantHp);
    expect(a.repairHp).toBe(CONFIG.damageControl.regenHp);
    expect(a.repairRate).toBe(0); // no custom rate: the fixed path
  });

  it('keeps the ANTI-FLASK rule on the flat path — two heals run longer, not faster', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    a.hp = 50;
    bank(w, a);
    bank(w, a);
    w.spendPoint('a', HEAL_CHOICE);
    w.spendPoint('a', HEAL_CHOICE);
    expect(a.repairHp).toBe(2 * CONFIG.damageControl.regenHp);
    expect(a.repairRate).toBe(0); // still the fixed rate — never doubled
  });
});

describe('percentage heal: ON', () => {
  it('pays 10% of MAX instantly and 10% of what is STILL missing into the pool', () => {
    withPct(0.1, 0.1, () => {
      const w = bareWorld();
      const a = place(w, 'a'); // battleship, 350 max
      const max = a.stats.maxHp;
      a.hp = 100;
      bank(w, a);
      w.spendPoint('a', HEAL_CHOICE);
      const instant = max * 0.1; // 35
      expect(a.hp).toBeCloseTo(100 + instant, 6);
      // missing is measured AFTER the instant: 350 - 135 = 215, x 10% = 21.5
      expect(a.repairHp).toBeCloseTo((max - (100 + instant)) * 0.1, 6);
    });
  });

  it('THE ORDER MATTERS — flat-then-missing is not the same as missing-then-flat', () => {
    withPct(0.1, 0.1, () => {
      const w = bareWorld();
      const a = place(w, 'a');
      const max = a.stats.maxHp;
      a.hp = 100;
      bank(w, a);
      w.spendPoint('a', HEAL_CHOICE);
      const shipped = a.repairHp;
      // Had the pool been sized BEFORE the flat heal it would have been
      // (350-100) x 10% = 25 rather than 21.5. The gap is the whole point of
      // Eric's "after the flat heal" clause.
      const wrongOrder = (max - 100) * 0.1;
      expect(shipped).toBeLessThan(wrongOrder);
      expect(wrongOrder - shipped).toBeCloseTo(max * 0.1 * 0.1, 6);
    });
  });

  it('delivers the pool over 5 s BY DURATION, whatever the amount', () => {
    withPct(0.1, 0.1, () => {
      const w = bareWorld();
      const a = place(w, 'a');
      a.hp = 100;
      bank(w, a);
      w.spendPoint('a', HEAL_CHOICE);
      const pool = a.repairHp;
      expect(a.repairRate).toBeGreaterThan(0); // percentage mode has its own rate
      for (let i = 0; i < SECOND * 5; i++) w.step();
      expect(a.repairHp).toBeCloseTo(0, 4); // exactly the window, not longer
      expect(a.hp).toBeCloseTo(100 + a.stats.maxHp * 0.1 + pool, 3);
    });
  });

  it('is worth MORE the more hurt you are — the point of a missing-hull term', () => {
    const healed = (startHp: number): number =>
      withPct(0.1, 0.1, () => {
        const w = bareWorld();
        const a = place(w, 'a');
        a.hp = startHp;
        bank(w, a);
        w.spendPoint('a', HEAL_CHOICE);
        return a.hp - startHp + a.repairHp;
      });
    // A flat heal is worth the same at 90% and at 5%; this is not.
    expect(healed(50)).toBeGreaterThan(healed(300));
  });

  it('scales with the dial — 20% flat pays twice 10% flat', () => {
    const instantOf = (pct: number): number =>
      withPct(pct, 0, () => {
        const w = bareWorld();
        const a = place(w, 'a');
        a.hp = 100;
        bank(w, a);
        w.spendPoint('a', HEAL_CHOICE);
        return a.hp - 100;
      });
    expect(instantOf(0.2)).toBeCloseTo(2 * instantOf(0.1), 6);
  });

  it('never overheals past maxHp', () => {
    withPct(0.2, 0.2, () => {
      const w = bareWorld();
      const a = place(w, 'a');
      a.hp = a.stats.maxHp - 1;
      bank(w, a);
      w.spendPoint('a', HEAL_CHOICE);
      for (let i = 0; i < SECOND * 6; i++) w.step();
      expect(a.hp).toBe(a.stats.maxHp);
    });
  });
});

describe('percentage heal: the FREE per-level heal as a fraction of missing', () => {
  it('adds 10% of missing to its own pool, over its own window', () => {
    withPct(
      0,
      0,
      () => {
        const w = bareWorld();
        const a = place(w, 'a');
        a.hp = 150;
        const missing = a.stats.maxHp - 150;
        w.grantXp(a, 1);
        expect(a.levelRepairHp).toBeCloseTo(missing * 0.1, 6);
        expect(a.levelRepairRate).toBeGreaterThan(0);
        // It is its OWN channel — the paid pool is untouched.
        expect(a.repairHp).toBe(0);
      },
      0.1,
    );
  });

  it('gives a FULL hull nothing — 10% of zero missing is zero', () => {
    withPct(
      0,
      0,
      () => {
        const w = bareWorld();
        const a = place(w, 'a');
        a.hp = a.stats.maxHp;
        w.grantXp(a, 1);
        expect(a.levelRepairHp).toBe(0);
      },
      0.1,
    );
  });
});

describe("percentage heal: the POOLED half as a fraction of MAX (Eric's ruling config)", () => {
  it('ships at 0', () => {
    expect(CONFIG.damageControl.healPoolPct).toBe(0);
  });

  it('pays 10% of max instantly and 15% of max into the pool, over 5 s', () => {
    const prev = DC.healPoolPct;
    DC.healPoolPct = 0.15;
    try {
      withPct(0.1, 0, () => {
        const w = bareWorld();
        const a = place(w, 'a'); // battleship, 350 max
        const max = a.stats.maxHp;
        a.hp = 100;
        bank(w, a);
        w.spendPoint('a', HEAL_CHOICE);
        expect(a.hp).toBeCloseTo(100 + max * 0.1, 6); // 35 instant
        expect(a.repairHp).toBeCloseTo(max * 0.15, 6); // 52.5 pooled
        for (let i = 0; i < SECOND * 5; i++) w.step();
        expect(a.repairHp).toBeCloseTo(0, 4); // exactly the 5 s window
        expect(a.hp).toBeCloseTo(100 + max * 0.25, 3); // 25% of max total
      });
    } finally {
      DC.healPoolPct = prev;
    }
  });

  it('pays the SAME whatever your hp — unlike the missing-sized pool', () => {
    const prev = DC.healPoolPct;
    DC.healPoolPct = 0.15;
    try {
      const pooled = (startHp: number): number =>
        withPct(0.1, 0, () => {
          const w = bareWorld();
          const a = place(w, 'a');
          a.hp = startHp;
          bank(w, a);
          w.spendPoint('a', HEAL_CHOICE);
          return a.repairHp;
        });
      expect(pooled(50)).toBeCloseTo(pooled(250), 6);
    } finally {
      DC.healPoolPct = prev;
    }
  });

  it('takes PRECEDENCE over healMissingPct so two pooled halves never both pay', () => {
    const prev = DC.healPoolPct;
    DC.healPoolPct = 0.15;
    try {
      withPct(0.1, 0.5, () => {
        const w = bareWorld();
        const a = place(w, 'a');
        a.hp = 100;
        bank(w, a);
        w.spendPoint('a', HEAL_CHOICE);
        expect(a.repairHp).toBeCloseTo(a.stats.maxHp * 0.15, 6); // max-based only
      });
    } finally {
      DC.healPoolPct = prev;
    }
  });
});

describe('percentage heal: FLAT instant + %max pool (Eric 2026-08-23 variant)', () => {
  it('pays the flat 50 instantly and 10% of max into the pool', () => {
    // healFlatPct 0 means "use the flat instantHp", and healPoolPct sizes the
    // pool off max — the hybrid keeps the flat heal's implicit small-hull
    // advantage while the POOLED half still grows with hull cards.
    const prev = DC.healPoolPct;
    DC.healPoolPct = 0.10;
    try {
      withPct(0, 0, () => {
        const w = bareWorld();
        const a = place(w, 'a'); // battleship 350
        a.hp = 100;
        bank(w, a);
        w.spendPoint('a', HEAL_CHOICE);
        expect(a.hp).toBe(100 + CONFIG.damageControl.instantHp); // flat 50
        expect(a.repairHp).toBeCloseTo(a.stats.maxHp * 0.1, 6); // 35 pooled
      });
    } finally {
      DC.healPoolPct = prev;
    }
  });

  it('leaves the SMALL hull the better proportional deal, unlike an all-%max heal', () => {
    const prev = DC.healPoolPct;
    DC.healPoolPct = 0.10;
    try {
      const fracOf = (hull: HullId): number =>
        withPct(0, 0, () => {
          const w = bareWorld();
          const a = place(w, 'a', hull);
          a.hp = 10;
          bank(w, a);
          w.spendPoint('a', HEAL_CHOICE);
          return (CONFIG.damageControl.instantHp + a.repairHp) / a.stats.maxHp;
        });
      // The flat instant is a bigger slice of a small hull, so the TB keeps an
      // edge that a pure %max heal erases entirely.
      expect(fracOf('torpedoBoat')).toBeGreaterThan(fracOf('battleship'));
    } finally {
      DC.healPoolPct = prev;
    }
  });
});

describe('percentage heal: %max instant + FLAT pool (Eric 2026-08-23, the reverse)', () => {
  it('pays 10% of max instantly and the flat 50 into the pool', () => {
    withPct(0.1, 0, () => {
      const w = bareWorld();
      const a = place(w, 'a'); // battleship 350
      a.hp = 100;
      bank(w, a);
      w.spendPoint('a', HEAL_CHOICE);
      expect(a.hp).toBeCloseTo(100 + a.stats.maxHp * 0.1, 6); // 35 instant
      expect(a.repairHp).toBe(CONFIG.damageControl.regenHp); // flat 50 pooled
    });
  });

  it('KEEPS the anti-flask rule, unlike the other ordering', () => {
    // With no percentage pool the drain stays on the fixed CONFIG rate, so two
    // heals run LONGER rather than faster. The 50-flat-instant + %max-pool
    // ordering does NOT have this property, because its pool carries its own
    // duration-based rate. Identical totals, different stacking behaviour —
    // worth knowing when comparing the two.
    withPct(0.1, 0, () => {
      const w = bareWorld();
      const a = place(w, 'a');
      a.hp = 50;
      bank(w, a);
      bank(w, a);
      w.spendPoint('a', HEAL_CHOICE);
      w.spendPoint('a', HEAL_CHOICE);
      expect(a.repairHp).toBe(2 * CONFIG.damageControl.regenHp);
      expect(a.repairRate).toBe(0);
    });
  });
});
