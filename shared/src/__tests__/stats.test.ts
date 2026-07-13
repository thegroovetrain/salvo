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
  weaponMaxAmmo,
  weaponReloadMs,
  zeroUpgrades,
  type EffectiveStats,
  type UpgradeId,
} from '../index.js';

const CRUISER = CONFIG.shipClasses.cruiser;

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
      gun: { reloadMs: CONFIG.gun.reloadMs, maxAmmo: CONFIG.gun.maxAmmo, rangeU: CONFIG.gun.shellRange },
      torpedo: { reloadMs: CONFIG.torpedo.reloadMs, maxAmmo: CONFIG.torpedo.maxAmmo, speed: CONFIG.torpedo.speed },
      mine: { reloadMs: CONFIG.mine.reloadMs, maxAmmo: CONFIG.mine.maxAmmo, maxLive: CONFIG.mine.maxLive },
    });
  });

  it('an empty counts array reads as all zeros (defensive)', () => {
    expect(effectiveStats(CRUISER, [])).toEqual(effectiveStats(CRUISER, zeroUpgrades()));
  });
});

describe('effectiveStats — stacking rules', () => {
  it('multiplicative: 2 radarRange stacks = base * 1.15^2', () => {
    const s = effectiveStats(CRUISER, countsWith('radarRange', 2));
    expect(s.radarRange).toBeCloseTo(CONFIG.vision.radar * CONFIG.upgrades.radarRange.mult ** 2, 9);
  });

  it('period multipliers shrink: 3 sweepSpeed stacks = period * 0.85^3', () => {
    const s = effectiveStats(CRUISER, countsWith('sweepSpeed', 3));
    expect(s.sweepPeriodMs).toBeCloseTo(CONFIG.vision.sweepPeriod * CONFIG.upgrades.sweepSpeed.periodMult ** 3, 9);
    expect(s.sweepPeriodMs).toBeLessThan(CONFIG.vision.sweepPeriod);
  });

  it('additive: adds stack linearly and are UNCAPPED', () => {
    expect(effectiveStats(CRUISER, countsWith('hullPoints', 5)).maxHp).toBe(
      CRUISER.hp + 5 * CONFIG.upgrades.hullPoints.add,
    );
    expect(effectiveStats(CRUISER, countsWith('gunAmmo', 10)).gun.maxAmmo).toBe(CONFIG.gun.maxAmmo + 10);
  });

  it('maxSpeed scales maxSpeed AND reverseSpeed by the same factor', () => {
    const s = effectiveStats(CRUISER, countsWith('maxSpeed', 2));
    const f = CONFIG.upgrades.maxSpeed.mult ** 2;
    expect(s.kinematics.maxSpeed).toBeCloseTo(CRUISER.kinematics.maxSpeed * f, 9);
    expect(s.kinematics.reverseSpeed).toBeCloseTo(CRUISER.kinematics.reverseSpeed * f, 9);
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
  gunAmmo: ['gun.maxAmmo'],
  torpedoReload: ['torpedo.reloadMs'],
  torpedoAmmo: ['torpedo.maxAmmo'],
  torpedoSpeed: ['torpedo.speed'],
  mineReload: ['mine.reloadMs'],
  mineAmmo: ['mine.maxAmmo'],
  maxMines: ['mine.maxLive'],
};

describe('effectiveStats — each id moves exactly its stat(s), nothing else', () => {
  const identity = flatten(effectiveStats(CRUISER, zeroUpgrades()));

  it.each(UPGRADE_IDS.map((id) => [id] as const))('%s', (id) => {
    const upgraded = flatten(effectiveStats(CRUISER, countsWith(id, 1)));
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

  it('weaponMaxAmmo / weaponReloadMs index the per-weapon effective values', () => {
    const s = effectiveStats(CRUISER, countsWith('mineReload', 1));
    expect(weaponMaxAmmo(s, 0)).toBe(s.gun.maxAmmo);
    expect(weaponMaxAmmo(s, 1)).toBe(s.torpedo.maxAmmo);
    expect(weaponMaxAmmo(s, 2)).toBe(s.mine.maxAmmo);
    expect(weaponReloadMs(s, 0)).toBe(s.gun.reloadMs);
    expect(weaponReloadMs(s, 1)).toBe(s.torpedo.reloadMs);
    expect(weaponReloadMs(s, 2)).toBe(s.mine.reloadMs);
  });

  it('CONFIG.upgrades keys are exactly UPGRADE_IDS (table and order stay in sync)', () => {
    expect(Object.keys(CONFIG.upgrades).sort()).toEqual([...UPGRADE_IDS].sort());
  });
});
