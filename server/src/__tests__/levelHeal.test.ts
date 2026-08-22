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
  });
});

describe('per-level heal: ON', () => {
  it('restores exactly levelHp when a level is earned, and costs NOTHING', () => {
    withLevelHp(20, () => {
      const w = bareWorld();
      const a = place(w, 'a');
      a.hp = 100;
      tickOneLevel(w);
      expect(a.hp).toBe(120);
      // The level is still banked and its offer still drawn — the free heal is
      // additive, never a substitute for the spend.
      expect(a.bankedLevels).toBe(1);
      expect(a.offer).not.toBeNull();
    });
  });

  it('clamps to maxHp and stays silent when already full', () => {
    withLevelHp(20, () => {
      const w = bareWorld();
      const a = place(w, 'a');
      a.hp = a.stats.maxHp - 5;
      tickOneLevel(w);
      expect(a.hp).toBe(a.stats.maxHp);
      // A full hull emits no heal cue — a free no-op must not look like a heal.
      // tickEvents holds only the CURRENT tick, so this has to accumulate as it
      // goes rather than diff a count across the level.
      a.hp = a.stats.maxHp;
      const ticks = CONFIG.xp.levelMs / CONFIG.tick.simDtMs;
      let heals = 0;
      for (let i = 0; i < ticks; i++) {
        w.step();
        a.hp = a.stats.maxHp; // hold it pinned full for the whole level
        heals += w.tickEvents.filter((e) => e.k === 'heal').length;
      }
      expect(a.level).toBe(2); // the second level really was earned
      expect(heals).toBe(0);
    });
  });

  it('fires once PER LEVEL when one grant banks several at once', () => {
    withLevelHp(20, () => {
      const w = bareWorld();
      const a = place(w, 'a', 'battleship');
      a.hp = 100;
      w.grantXp(a, 3); // three levels in one grant
      expect(a.level).toBe(3);
      expect(a.hp).toBe(160); // 3 x 20, not 20
    });
  });

  it('gives a SINKING hull nothing — the no-hp-comes-back rule holds', () => {
    withLevelHp(20, () => {
      const w = bareWorld();
      const a = place(w, 'a');
      a.hp = 100;
      w.sinkShip('a');
      expect(isAfloat(a.lifecycle)).toBe(false);
      const hp = a.hp;
      w.grantXp(a, 1);
      expect(a.level).toBe(1); // the level still lands...
      expect(a.hp).toBe(hp); //  ...the hp does not
    });
  });

  it('gives a FLEET hull nothing — it never banks a level at all', () => {
    withLevelHp(20, () => {
      const w = bareWorld();
      const d = place(w, 'd', 'droneSmall', true);
      d.hp = 10;
      w.grantXp(d, 5);
      expect(d.level).toBe(0);
      expect(d.hp).toBe(10);
    });
  });
});

describe('per-level heal: the MENU heal Eric wants kept is untouched', () => {
  it('still costs a banked level and still drops the offer', () => {
    withLevelHp(20, () => {
      const w = bareWorld();
      const a = place(w, 'a');
      a.hp = 50;
      tickOneLevel(w); // banks a level; free heal takes hp to 70
      expect(a.hp).toBe(70);
      expect(a.bankedLevels).toBe(1);
      const ok = w.spendPoint('a', HEAL_CHOICE);
      expect(ok).toBe(true);
      // The paid heal is the FULL shipped amount on top of the free trickle,
      // and it really did cost the level.
      expect(a.hp).toBe(70 + CONFIG.damageControl.instantHp);
      expect(a.repairHp).toBe(CONFIG.damageControl.regenHp);
      expect(a.bankedLevels).toBe(0);
    });
  });

  it('is still refused at full hp — the free heal does not create a legal spend', () => {
    withLevelHp(20, () => {
      const w = bareWorld();
      const a = place(w, 'a');
      tickOneLevel(w);
      a.hp = a.stats.maxHp;
      expect(w.spendPoint('a', HEAL_CHOICE)).toBe(false);
      expect(a.bankedLevels).toBe(1); // nothing was consumed
    });
  });
});
