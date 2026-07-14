// Stage D client seams: the pure upgrade-toast label, the ownStatsChanged
// frame gate (cls/upg array equality) that triggers the effective-stats
// recompute, and the HUD denominators reacting to effective stats.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  UPGRADE_IDS,
  effectiveStats,
  weaponMaxAmmo,
  weaponReloadMs,
  zeroUpgrades,
  type OwnShip,
} from '@salvo/shared';
import { upgradeLabel, pointToastLine, healToastLine } from '../ui/upgradeToast.js';
import { ownStatsChanged } from '../net/roomBindings.js';
import { speedLadderFraction } from '../render/hud.js';

describe('upgradeLabel — pure toast formatting', () => {
  it('formats the canonical example', () => {
    expect(upgradeLabel('gunAmmo')).toBe('⬆ +GUN AMMO');
    expect(upgradeLabel('hullPoints')).toBe('⬆ +HULL POINTS');
    expect(upgradeLabel('maxMines')).toBe('⬆ +MAX MINES');
  });

  it('has an uppercase "⬆ +" line for every one of the 14 ids', () => {
    for (const id of UPGRADE_IDS) {
      const label = upgradeLabel(id);
      expect(label.startsWith('⬆ +')).toBe(true);
      const text = label.slice(3);
      expect(text.length).toBeGreaterThan(0);
      expect(text).toBe(text.toUpperCase());
    }
  });
});

function ownShip(cls: OwnShip['cls'], upg: number[]): OwnShip {
  return {
    id: 'me', x: 0, y: 0, heading: 0, speed: 0, hp: 100, alive: true,
    weapon: 0, ammo: [], sweep: 0, cls, upg, pts: 0, offer: [],
  };
}

describe('point / heal toast lines — pure formatting', () => {
  it('pointToastLine is the fixed CTRL prompt', () => {
    expect(pointToastLine()).toBe('▲ UPGRADE POINT — CTRL TO SPEND');
  });

  it('healToastLine embeds the clamped delta', () => {
    expect(healToastLine(25)).toBe('⛨ HULL REPAIRED +25');
    expect(healToastLine(8)).toBe('⛨ HULL REPAIRED +8');
  });
});

describe('ownStatsChanged — the recompute gate', () => {
  it('fires on the first frame (no previous you)', () => {
    expect(ownStatsChanged(ownShip('cruiser', zeroUpgrades()), null)).toBe(true);
    expect(ownStatsChanged(ownShip('cruiser', zeroUpgrades()), undefined)).toBe(true);
  });

  it('fires on a class change and on any upgrade-count change', () => {
    const prev = ownShip('cruiser', zeroUpgrades());
    expect(ownStatsChanged(ownShip('destroyer', zeroUpgrades()), prev)).toBe(true);
    const upg = zeroUpgrades();
    upg[UPGRADE_IDS.indexOf('gunAmmo')] = 1;
    expect(ownStatsChanged(ownShip('cruiser', upg), prev)).toBe(true);
  });

  it('stays quiet when cls and every count are unchanged (per-frame fast path)', () => {
    const prev = ownShip('cruiser', zeroUpgrades());
    expect(ownStatsChanged(ownShip('cruiser', zeroUpgrades()), prev)).toBe(false);
    const upg = zeroUpgrades();
    upg[3] = 2;
    expect(ownStatsChanged(ownShip('cruiser', [...upg]), ownShip('cruiser', upg))).toBe(false);
  });

  it('treats a length mismatch as a change (defensive)', () => {
    expect(ownStatsChanged(ownShip('cruiser', [0, 0]), ownShip('cruiser', zeroUpgrades()))).toBe(true);
  });

  it('IGNORES pts/offer-only deltas — banking a point must not fire the stats/fog recompute', () => {
    const prev = { ...ownShip('cruiser', zeroUpgrades()), pts: 0, offer: [] as number[] };
    const next = { ...ownShip('cruiser', zeroUpgrades()), pts: 2, offer: [3, 6, 10] };
    expect(ownStatsChanged(next, prev)).toBe(false);
  });
});

describe('HUD denominators react to effective stats', () => {
  const CRUISER = CONFIG.shipClasses.cruiser;

  it('speed ladder: at the same true speed, an upgraded maxSpeed reads a LOWER fraction', () => {
    const upg = zeroUpgrades();
    upg[UPGRADE_IDS.indexOf('maxSpeed')] = 2;
    const base = effectiveStats(CRUISER, zeroUpgrades()).kinematics;
    const fast = effectiveStats(CRUISER, upg).kinematics;
    expect(speedLadderFraction(30, fast)).toBeLessThan(speedLadderFraction(30, base));
    // Full ahead at the UPGRADED max still pins the needle at exactly 1.
    expect(speedLadderFraction(fast.maxSpeed, fast)).toBe(1);
    expect(speedLadderFraction(-fast.reverseSpeed, fast)).toBe(-1);
  });

  it('ammo chips: pool size and reload denominators come from effective stats', () => {
    const upg = zeroUpgrades();
    upg[UPGRADE_IDS.indexOf('gunAmmo')] = 1;
    upg[UPGRADE_IDS.indexOf('gunReload')] = 1;
    const stats = effectiveStats(CRUISER, upg);
    expect(weaponMaxAmmo(stats, 0)).toBe(CONFIG.gun.maxAmmo + 1); // an extra chip segment
    expect(weaponReloadMs(stats, 0)).toBeCloseTo(CONFIG.gun.reloadMs * CONFIG.upgrades.gunReload.mult, 9);
    expect(weaponMaxAmmo(stats, 1)).toBe(CONFIG.torpedo.maxAmmo); // others untouched
  });

  it('hp bar: the effective maxHp denominator grows with hullPoints stacks', () => {
    const upg = zeroUpgrades();
    upg[UPGRADE_IDS.indexOf('hullPoints')] = 3;
    expect(effectiveStats(CRUISER, upg).maxHp).toBe(CRUISER.hp + 3 * CONFIG.upgrades.hullPoints.add);
  });
});
