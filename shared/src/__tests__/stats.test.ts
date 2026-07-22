// effectiveStats — the server/client desync firewall. Three properties pin it:
// (1) zero counts is a byte-for-byte identity with the class/CONFIG bases;
// (2) multiplicative entries stack as base * mult^count, adds linearly;
// (3) each of the 14 upgrade ids moves EXACTLY its documented stat(s) and
//     nothing else (a table-driven loop over UPGRADE_IDS, diffed field-by-field
//     against the identity).

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  SHIP_CLASS_IDS,
  UPGRADE_IDS,
  effectiveStats,
  equipmentMaxAmmo,
  equipmentReloadMs,
  zeroUpgrades,
  type EffectiveStats,
  type UpgradeId,
} from '../index.js';

const BASE = CONFIG.shipClasses.battleship;

/** Counts array with a single upgrade type at `count` stacks. */
function countsWith(id: UpgradeId, count: number): number[] {
  const counts = zeroUpgrades();
  counts[UPGRADE_IDS.indexOf(id)] = count;
  return counts;
}

/** Flatten an EffectiveStats tree into dotted-path -> number entries. */
function flatten(stats: EffectiveStats): Map<string, number> {
  const out = new Map<string, number>();
  const walk = (node: Record<string, unknown>, prefix: string): void => {
    for (const [key, value] of Object.entries(node)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (typeof value === 'number') out.set(path, value);
      else walk(value as Record<string, unknown>, path);
    }
  };
  walk(stats as unknown as Record<string, unknown>, '');
  return out;
}

describe('effectiveStats — zero-counts identity (per class)', () => {
  it.each(SHIP_CLASS_IDS.map((id) => [id] as const))('%s at zero counts equals its bases', (id) => {
    const cls = CONFIG.shipClasses[id];
    expect(effectiveStats(cls, zeroUpgrades())).toEqual({
      kinematics: { ...cls.kinematics },
      maxHp: cls.hp,
      radarRange: CONFIG.vision.radar,
      sweepPeriodMs: CONFIG.vision.sweepPeriod,
      sightRange: CONFIG.vision.sight,
      gun: { reloadMs: CONFIG.gun.reloadMs, maxAmmo: CONFIG.gun.maxAmmo, rangeU: CONFIG.vision.radar },
      torpedo: { reloadMs: CONFIG.torpedo.reloadMs, maxAmmo: CONFIG.torpedo.maxAmmo, speed: CONFIG.torpedo.speed },
      mine: { reloadMs: CONFIG.mine.reloadMs, maxAmmo: CONFIG.mine.maxAmmo, maxLive: CONFIG.mine.maxLive },
      boost: {
        speedBonus: CONFIG.speedBoost.speedBonus,
        durationMs: CONFIG.speedBoost.durationMs,
        maxAmmo: CONFIG.speedBoost.maxAmmo,
        reloadMs: CONFIG.speedBoost.reloadMs,
      },
      cannon: { reloadMs: CONFIG.cannon.reloadMs, maxAmmo: CONFIG.cannon.maxAmmo, rangeU: CONFIG.vision.radar },
      starShells: {
        reloadMs: CONFIG.starShells.reloadMs,
        maxAmmo: CONFIG.starShells.maxAmmo,
        rangeU: CONFIG.vision.radar,
      },
      decoyBuoy: {
        reloadMs: CONFIG.decoyBuoy.reloadMs,
        maxAmmo: CONFIG.decoyBuoy.maxAmmo,
        durationMs: CONFIG.decoyBuoy.durationMs,
      },
    });
  });

  it('an empty counts array reads as all zeros (defensive)', () => {
    expect(effectiveStats(BASE, [])).toEqual(effectiveStats(BASE, zeroUpgrades()));
  });
});

describe('effectiveStats — stacking rules', () => {
  it('multiplicative: 2 radarRange stacks = base * 1.15^2', () => {
    const s = effectiveStats(BASE, countsWith('radarRange', 2));
    expect(s.radarRange).toBeCloseTo(CONFIG.vision.radar * CONFIG.upgrades.radarRange.mult ** 2, 9);
  });

  it('period multipliers shrink: 3 sweepSpeed stacks = period * 0.85^3', () => {
    const s = effectiveStats(BASE, countsWith('sweepSpeed', 3));
    expect(s.sweepPeriodMs).toBeCloseTo(CONFIG.vision.sweepPeriod * CONFIG.upgrades.sweepSpeed.periodMult ** 3, 9);
    expect(s.sweepPeriodMs).toBeLessThan(CONFIG.vision.sweepPeriod);
  });

  it('additive: adds stack linearly and are UNCAPPED', () => {
    expect(effectiveStats(BASE, countsWith('hullPoints', 5)).maxHp).toBe(
      BASE.hp + 5 * CONFIG.upgrades.hullPoints.add,
    );
    expect(effectiveStats(BASE, countsWith('torpedoAmmo', 10)).torpedo.maxAmmo).toBe(
      CONFIG.torpedo.maxAmmo + 10,
    );
  });

  it('gunAmmo is NEUTRALIZED: gun maxAmmo pinned to 1 at any stack count (single-shot gun)', () => {
    for (const count of [0, 1, 5, 100]) {
      expect(effectiveStats(BASE, countsWith('gunAmmo', count)).gun.maxAmmo).toBe(1);
    }
    expect(CONFIG.gun.maxAmmo).toBe(1);
  });

  it('gun range bases on CONFIG.vision.radar (range = radar range) and gunRange multiplies it', () => {
    expect(effectiveStats(BASE, zeroUpgrades()).gun.rangeU).toBe(CONFIG.vision.radar);
    const s = effectiveStats(BASE, countsWith('gunRange', 2));
    expect(s.gun.rangeU).toBeCloseTo(CONFIG.vision.radar * CONFIG.upgrades.gunRange.mult ** 2, 9);
    // gunRange stacks move ONLY the gun range — radar itself is untouched.
    expect(s.radarRange).toBe(CONFIG.vision.radar);
  });

  it('maxSpeed scales maxSpeed AND reverseSpeed by the same factor', () => {
    const s = effectiveStats(BASE, countsWith('maxSpeed', 2));
    const f = CONFIG.upgrades.maxSpeed.mult ** 2;
    expect(s.kinematics.maxSpeed).toBeCloseTo(BASE.kinematics.maxSpeed * f, 9);
    expect(s.kinematics.reverseSpeed).toBeCloseTo(BASE.kinematics.reverseSpeed * f, 9);
  });

  it('maxSpeed multiplies the BASE cap only — the boost bonus never rides the multiplier', () => {
    const s = effectiveStats(BASE, countsWith('maxSpeed', 3));
    // The additive speed-boost bonus is a per-tick step (sim/boost.ts), NOT part
    // of effectiveStats — so no upgrade count ever multiplies it.
    expect(s.boost.speedBonus).toBe(CONFIG.speedBoost.speedBonus);
    expect(s.kinematics.maxSpeed).toBeCloseTo(BASE.kinematics.maxSpeed * CONFIG.upgrades.maxSpeed.mult ** 3, 9);
  });
});

describe('effectiveStats — boost block is a pure CONFIG.speedBoost pass-through', () => {
  it('equals CONFIG.speedBoost for every class at zero upgrades', () => {
    for (const id of SHIP_CLASS_IDS) {
      expect(effectiveStats(CONFIG.shipClasses[id], zeroUpgrades()).boost).toEqual({
        speedBonus: CONFIG.speedBoost.speedBonus,
        durationMs: CONFIG.speedBoost.durationMs,
        maxAmmo: CONFIG.speedBoost.maxAmmo,
        reloadMs: CONFIG.speedBoost.reloadMs,
      });
    }
  });

  it('no upgrade id moves any boost field', () => {
    const base = effectiveStats(BASE, zeroUpgrades()).boost;
    for (const id of UPGRADE_IDS) {
      expect(effectiveStats(BASE, countsWith(id, 4)).boost).toEqual(base);
    }
  });
});

describe('effectiveStats — cannon/starShells are pure pass-throughs (Story 1.7)', () => {
  it('equal their CONFIG blocks + the radar-derived range for every class at zero upgrades', () => {
    for (const id of SHIP_CLASS_IDS) {
      const s = effectiveStats(CONFIG.shipClasses[id], zeroUpgrades());
      expect(s.cannon).toEqual({
        reloadMs: CONFIG.cannon.reloadMs,
        maxAmmo: CONFIG.cannon.maxAmmo,
        rangeU: CONFIG.vision.radar,
      });
      expect(s.starShells).toEqual({
        reloadMs: CONFIG.starShells.reloadMs,
        maxAmmo: CONFIG.starShells.maxAmmo,
        rangeU: CONFIG.vision.radar,
      });
    }
  });

  it('rangeU is the gun BASE range (radar parity) on both — never a new constant', () => {
    const s = effectiveStats(BASE, zeroUpgrades());
    expect(s.cannon.rangeU).toBe(CONFIG.vision.radar);
    expect(s.starShells.rangeU).toBe(CONFIG.vision.radar);
    expect(s.cannon.rangeU).toBe(s.gun.rangeU); // = the un-upgraded gun's range exactly
    expect(s.starShells.rangeU).toBe(s.gun.rangeU);
  });

  it('no upgrade id moves any cannon or starShells field (gunRange/gunReload apply to the gun ONLY)', () => {
    const base = effectiveStats(BASE, zeroUpgrades());
    for (const id of UPGRADE_IDS) {
      const s = effectiveStats(BASE, countsWith(id, 4));
      expect(s.cannon).toEqual(base.cannon);
      expect(s.starShells).toEqual(base.starShells);
    }
    // The documented interregnum quirk, pinned: a gunRange-stacked standard gun
    // out-ranges the un-stacked cannon.
    const stacked = effectiveStats(BASE, countsWith('gunRange', 2));
    expect(stacked.gun.rangeU).toBeGreaterThan(stacked.cannon.rangeU);
  });
});

describe('effectiveStats — mine.maxLive base + maxMines stacking (Story 1.8)', () => {
  it('maxLive base is CONFIG.mine.maxLive (5) at zero upgrades on every class', () => {
    expect(CONFIG.mine.maxLive).toBe(5);
    for (const id of SHIP_CLASS_IDS) {
      expect(effectiveStats(CONFIG.shipClasses[id], zeroUpgrades()).mine.maxLive).toBe(5);
    }
  });

  it('maxMines stacks linearly on the base 5 (add per stack), leaving other mine fields untouched', () => {
    const base = effectiveStats(BASE, zeroUpgrades()).mine;
    for (const count of [1, 3, 7]) {
      const mine = effectiveStats(BASE, countsWith('maxMines', count)).mine;
      expect(mine.maxLive).toBe(CONFIG.mine.maxLive + CONFIG.upgrades.maxMines.add * count);
      expect(mine.reloadMs).toBe(base.reloadMs);
      expect(mine.maxAmmo).toBe(base.maxAmmo);
    }
  });
});

describe('effectiveStats — decoyBuoy block is a pure CONFIG.decoyBuoy pass-through (Story 1.8)', () => {
  it('equals CONFIG.decoyBuoy for every class at zero upgrades', () => {
    for (const id of SHIP_CLASS_IDS) {
      expect(effectiveStats(CONFIG.shipClasses[id], zeroUpgrades()).decoyBuoy).toEqual({
        reloadMs: CONFIG.decoyBuoy.reloadMs,
        maxAmmo: CONFIG.decoyBuoy.maxAmmo,
        durationMs: CONFIG.decoyBuoy.durationMs,
      });
    }
  });

  it('no upgrade id moves any decoyBuoy field', () => {
    const base = effectiveStats(BASE, zeroUpgrades()).decoyBuoy;
    for (const id of UPGRADE_IDS) {
      expect(effectiveStats(BASE, countsWith(id, 4)).decoyBuoy).toEqual(base);
    }
  });
});

/** Exactly which flattened fields each upgrade id may move. */
const AFFECTED: Record<UpgradeId, string[]> = {
  hullPoints: ['maxHp'],
  radarRange: ['radarRange'],
  sweepSpeed: ['sweepPeriodMs'],
  sightRange: ['sightRange'],
  maxSpeed: ['kinematics.maxSpeed', 'kinematics.reverseSpeed'], // by design (accel/turn untouched)
  gunReload: ['gun.reloadMs'],
  gunRange: ['gun.rangeU'],
  gunAmmo: [], // NEUTRALIZED (Story 1.4): single-shot gun pins maxAmmo to 1 — moves nothing
  torpedoReload: ['torpedo.reloadMs'],
  torpedoAmmo: ['torpedo.maxAmmo'],
  torpedoSpeed: ['torpedo.speed'],
  mineReload: ['mine.reloadMs'],
  mineAmmo: ['mine.maxAmmo'],
  maxMines: ['mine.maxLive'],
};

describe('effectiveStats — each id moves exactly its stat(s), nothing else', () => {
  const identity = flatten(effectiveStats(BASE, zeroUpgrades()));

  it.each(UPGRADE_IDS.map((id) => [id] as const))('%s', (id) => {
    const upgraded = flatten(effectiveStats(BASE, countsWith(id, 1)));
    expect([...upgraded.keys()]).toEqual([...identity.keys()]); // same shape
    const changed = [...upgraded.keys()].filter((k) => upgraded.get(k) !== identity.get(k));
    expect(changed.sort()).toEqual([...AFFECTED[id]].sort());
    // Direction sanity: reload/period multipliers shrink, everything else grows.
    const shrinking = id === 'sweepSpeed' || id.endsWith('Reload');
    for (const k of changed) {
      if (shrinking) expect(upgraded.get(k)!).toBeLessThan(identity.get(k)!);
      else expect(upgraded.get(k)!).toBeGreaterThan(identity.get(k)!);
    }
  });

  it('the AFFECTED table covers all 14 ids (loop is exhaustive)', () => {
    expect(Object.keys(AFFECTED).sort()).toEqual([...UPGRADE_IDS].sort());
    expect(UPGRADE_IDS).toHaveLength(14);
  });
});

describe('upgrade helpers', () => {
  it('zeroUpgrades matches UPGRADE_IDS length and is a fresh array each call', () => {
    const z = zeroUpgrades();
    expect(z).toEqual(new Array(UPGRADE_IDS.length).fill(0));
    expect(zeroUpgrades()).not.toBe(z);
  });

  it('equipmentMaxAmmo / equipmentReloadMs look up the per-equipment effective values', () => {
    const s = effectiveStats(BASE, countsWith('mineReload', 1));
    expect(equipmentMaxAmmo(s, 'gun')).toBe(s.gun.maxAmmo);
    expect(equipmentMaxAmmo(s, 'torpedo')).toBe(s.torpedo.maxAmmo);
    expect(equipmentMaxAmmo(s, 'mine')).toBe(s.mine.maxAmmo);
    expect(equipmentMaxAmmo(s, 'speedBoost')).toBe(s.boost.maxAmmo);
    expect(equipmentMaxAmmo(s, 'decoyBuoy')).toBe(s.decoyBuoy.maxAmmo);
    expect(equipmentReloadMs(s, 'gun')).toBe(s.gun.reloadMs);
    expect(equipmentReloadMs(s, 'torpedo')).toBe(s.torpedo.reloadMs);
    expect(equipmentReloadMs(s, 'mine')).toBe(s.mine.reloadMs);
    expect(equipmentReloadMs(s, 'speedBoost')).toBe(s.boost.reloadMs);
    expect(equipmentReloadMs(s, 'decoyBuoy')).toBe(s.decoyBuoy.reloadMs);
  });

  it('CONFIG.upgrades keys are exactly UPGRADE_IDS (table and order stay in sync)', () => {
    expect(Object.keys(CONFIG.upgrades).sort()).toEqual([...UPGRADE_IDS].sort());
  });
});
