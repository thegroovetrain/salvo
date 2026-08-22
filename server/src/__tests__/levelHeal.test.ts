// THE FREE PER-LEVEL HEAL (CONFIG.damageControl.levelHp) — the measurement dial
// behind Eric's "weak, automatic heal that you get every level" (2026-08-22).
//
// THE POINT OF THE FEATURE IS WHAT IT DOES *NOT* TOUCH. Eric likes the heal
// being a strategic decision and wants that kept; the complaint is only that
// heals eat too large a SHARE of levels, especially early. So the tests that
// matter most here are the ones pinning that the refit-menu heal still costs a
// level, still drops the offer, and is otherwise byte-identical — a free heal
// that quietly made the paid one redundant would be a worse outcome than doing
// nothing at all.
//
// Ships at 0 (off) like every other dial in this instrument.

import { describe, it, expect } from 'vitest';
import { CONFIG, HEAL_CHOICE, isAfloat, type HullId } from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';

const DC = CONFIG.damageControl as { levelHp: number };

function withLevelHp<T>(hp: number, fn: () => T): T {
  const prev = DC.levelHp;
  DC.levelHp = hp;
  try {
    return fn();
  } finally {
    DC.levelHp = prev;
  }
}

function bareWorld(seed = 3): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  return w;
}

function place(w: World, id: string, hull: HullId = 'torpedoBoat', fleet = false): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), fleet ? 'fleet' : 'captain', hull);
  rec.state.speed = 0;
  return rec;
}

/** Tick one level, capturing repairHp on the tick the level lands.
 *  tickRepairs runs BEFORE tickXp in STEP_ORDER, so the grant is not drained
 *  in its own tick and this reads the full amount. */
function tickOneLevelWatching(w: World, ship: ShipRecord, out: number[]): void {
  const ticks = CONFIG.xp.levelMs / CONFIG.tick.simDtMs;
  const before = ship.level;
  for (let i = 0; i < ticks; i++) {
    w.step();
    if (ship.level > before && out.length === 0) out.push(ship.repairHp);
  }
}

/** Tick until `ship` banks one more level via the passive tick. */
function tickOneLevel(w: World): void {
  const ticks = CONFIG.xp.levelMs / CONFIG.tick.simDtMs;
  for (let i = 0; i < ticks; i++) w.step();
}

describe('per-level heal: OFF is the shipped game', () => {
  it('restores nothing at the shipped default of 0', () => {
    expect(CONFIG.damageControl.levelHp).toBe(0);
    const w = bareWorld();
    const a = place(w, 'a');
    a.hp = 100;
    tickOneLevel(w);
    expect(a.level).toBe(1);
    expect(a.hp).toBe(100);
    expect(a.repairHp).toBe(0);
  });
});

describe('per-level heal: ON', () => {
  it('adds exactly levelHp to the POOL (not the bar) and costs NOTHING', () => {
    withLevelHp(25, () => {
      const w = bareWorld();
      const a = place(w, 'a');
      a.hp = 100;
      // Freeze the drain so the grant itself is observable: tickRepairs would
      // otherwise start paying it out in the same tick it lands.
      const seen: number[] = [];
      tickOneLevelWatching(w, a, seen);
      expect(seen[0]).toBe(25); // the pool really received 25 at the crossing
      // The level is still banked and its offer still drawn — the free heal is
      // additive, never a substitute for the spend.
      expect(a.bankedLevels).toBe(1);
      expect(a.offer).not.toBeNull();
    });
  });

  it('delivers over TIME at the pool rate, not instantly', () => {
    withLevelHp(25, () => {
      const w = bareWorld();
      const a = place(w, 'a');
      a.hp = 100;
      tickOneLevel(w);
      // The bar has NOT jumped by 25 the instant the level lands — the whole
      // 25 is still sitting in the pool, undrained (tickRepairs runs before
      // tickXp, so payout starts on the NEXT tick).
      expect(a.hp).toBe(100);
      expect(a.repairHp).toBe(25);
      w.step();
      expect(a.hp).toBeGreaterThan(100); // now it is arriving...
      expect(a.hp).toBeLessThan(125); // ...but not all at once
      for (let i = 0; i < 200; i++) w.step(); // let it finish paying out
      expect(a.repairHp).toBeCloseTo(0, 5);
      expect(a.hp).toBe(125); // the full 25 landed, just over time
    });
  });

  it('still banks pool at FULL hp — overflow is lost, which is the ruled behavior', () => {
    withLevelHp(25, () => {
      const w = bareWorld();
      const a = place(w, 'a');
      a.hp = a.stats.maxHp;
      tickOneLevel(w);
      // Unlike the PAID heal (refused at full hp because it would cost a level
      // for nothing), the free one has no spend to protect, so it lands and
      // tickRepairs burns it against the clamp — the same overflow-is-lost path
      // any pool takes.
      expect(a.hp).toBe(a.stats.maxHp);
    });
  });

  it('fires once PER LEVEL when one grant banks several at once', () => {
    withLevelHp(25, () => {
      const w = bareWorld();
      const a = place(w, 'a', 'battleship');
      a.hp = 100;
      w.grantXp(a, 3); // three levels in one grant
      expect(a.level).toBe(3);
      expect(a.repairHp).toBe(75); // 3 x 25 into the pool, not 25
    });
  });

  it('gives a SINKING hull nothing — the no-hp-comes-back rule holds', () => {
    withLevelHp(25, () => {
      const w = bareWorld();
      const a = place(w, 'a');
      a.hp = 100;
      w.sinkShip('a');
      expect(isAfloat(a.lifecycle)).toBe(false);
      w.grantXp(a, 1);
      expect(a.level).toBe(1); // the level still lands...
      expect(a.repairHp).toBe(0); //  ...the pool does not
    });
  });

  it('gives a FLEET hull nothing — it never banks a level at all', () => {
    withLevelHp(25, () => {
      const w = bareWorld();
      const d = place(w, 'd', 'droneSmall', true);
      d.hp = 10;
      w.grantXp(d, 5);
      expect(d.level).toBe(0);
      expect(d.repairHp).toBe(0);
    });
  });
});

describe('per-level heal: the MENU heal Eric wants kept is untouched', () => {
  it('still costs a banked level and still drops the offer', () => {
    withLevelHp(25, () => {
      const w = bareWorld();
      const a = place(w, 'a');
      a.hp = 50;
      tickOneLevel(w); // banks a level; the free heal puts 25 in the pool
      expect(a.repairHp).toBe(25);
      expect(a.bankedLevels).toBe(1);
      const ok = w.spendPoint('a', HEAL_CHOICE);
      expect(ok).toBe(true);
      // The paid heal pays its FULL shipped amount — instant hp untouched by
      // the free trickle — and it really did cost the level.
      expect(a.hp).toBe(50 + CONFIG.damageControl.instantHp);
      expect(a.bankedLevels).toBe(0);
      // ANTI-FLASK: the pools ADD, so the level-heal stacks as DURATION on top
      // of the menu heal rather than making it land faster.
      expect(a.repairHp).toBe(25 + CONFIG.damageControl.regenHp);
    });
  });

  it('is still refused at full hp — the free heal does not create a legal spend', () => {
    withLevelHp(25, () => {
      const w = bareWorld();
      const a = place(w, 'a');
      tickOneLevel(w);
      a.hp = a.stats.maxHp;
      expect(w.spendPoint('a', HEAL_CHOICE)).toBe(false);
      expect(a.bankedLevels).toBe(1); // nothing was consumed
    });
  });
});
