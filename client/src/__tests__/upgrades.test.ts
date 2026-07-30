// Stage D client seams: the pure upgrade-toast label, the ownStatsChanged
// frame gate (cls/upg array equality) that triggers the effective-stats
// recompute, and the HUD denominators reacting to effective stats.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  UPGRADE_IDS,
  effectiveStats,
  equipmentMaxAmmo,
  equipmentReloadMs,
  zeroUpgrades,
  type OwnShip,
} from '@salvo/shared';
import { upgradeLabel, pointToastLine } from '../ui/upgradeToast.js';
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

function ownShip(cls: OwnShip['cls'], upg: number[], boons: string[] = []): OwnShip {
  return {
    id: 'me', x: 0, y: 0, heading: 0, speed: 0, hp: 100, alive: true,
    ammo: [], sweep: 0, cls, upg, pts: 0, offer: [], boostUntil: 0, boons, lvl: 0, xp: 0,
  };
}

describe('point toast line — pure formatting', () => {
  // Story 2.6 (amendment 33): a LEVEL UP is the only thing that banks a point
  // now — passive tick or kill — so the toast names the level, with no "banked"
  // wording and REFIT (not UPGRADE) as the verb. Supersedes the 2.1 copy.
  it('pointToastLine is the fixed LEVEL UP → TAB refit prompt', () => {
    expect(pointToastLine()).toBe('▲ LEVEL UP — TAB TO REFIT');
  });
});

describe('ownStatsChanged — the recompute gate', () => {
  it('fires on the first frame (no previous you)', () => {
    expect(ownStatsChanged(ownShip('torpedoBoat', zeroUpgrades()), null)).toBe(true);
    expect(ownStatsChanged(ownShip('torpedoBoat', zeroUpgrades()), undefined)).toBe(true);
  });

  it('fires on a class change and on any upgrade-count change', () => {
    const prev = ownShip('torpedoBoat', zeroUpgrades());
    expect(ownStatsChanged(ownShip('battleship', zeroUpgrades()), prev)).toBe(true);
    const upg = zeroUpgrades();
    upg[UPGRADE_IDS.indexOf('gunAmmo')] = 1;
    expect(ownStatsChanged(ownShip('torpedoBoat', upg), prev)).toBe(true);
  });

  it('stays quiet when cls and every count are unchanged (per-frame fast path)', () => {
    const prev = ownShip('torpedoBoat', zeroUpgrades());
    expect(ownStatsChanged(ownShip('torpedoBoat', zeroUpgrades()), prev)).toBe(false);
    const upg = zeroUpgrades();
    upg[3] = 2;
    expect(ownStatsChanged(ownShip('torpedoBoat', [...upg]), ownShip('torpedoBoat', upg))).toBe(false);
  });

  it('treats a length mismatch as a change (defensive)', () => {
    expect(ownStatsChanged(ownShip('torpedoBoat', [0, 0]), ownShip('torpedoBoat', zeroUpgrades()))).toBe(true);
  });

  it('IGNORES pts/offer-only deltas — banking a point must not fire the stats/fog recompute', () => {
    const prev = { ...ownShip('torpedoBoat', zeroUpgrades()), pts: 0, offer: [] as string[] };
    // Story 2.7: the offer is BOON IDS now — still not a stats input.
    const next = {
      ...ownShip('torpedoBoat', zeroUpgrades()),
      pts: 2,
      offer: ['reinforcedBulkheads', 'forcedDraught', 'rangefinderCrew', 'highGainAntenna'],
    };
    expect(ownStatsChanged(next, prev)).toBe(false);
  });

  it('IGNORES the Story 2.6 xp/lvl deltas — the passive tick moves `xp` EVERY frame', () => {
    // The XP fill is a per-frame moving number: if it fed the recompute gate,
    // every single frame would rebuild effective stats and re-bake the fog.
    const prev = { ...ownShip('torpedoBoat', zeroUpgrades()), lvl: 0, xp: 0.25 };
    expect(ownStatsChanged({ ...prev, xp: 0.2508333 }, prev)).toBe(false);
    // ...and a LEVEL UP is not a stat change either: the build only moves when
    // the level is SPENT (which lands as a `boons` change, pinned below).
    expect(ownStatsChanged({ ...prev, lvl: 1, xp: 0, pts: 1 }, prev)).toBe(false);
  });

  it('fires on ANY boons change: first grant, append, removal, and reorder (Story 2.5)', () => {
    const prev = ownShip('torpedoBoat', zeroUpgrades(), []);
    expect(ownStatsChanged(ownShip('torpedoBoat', zeroUpgrades(), ['surge']), prev)).toBe(true);
    const one = ownShip('torpedoBoat', zeroUpgrades(), ['surge']);
    expect(ownStatsChanged(ownShip('torpedoBoat', zeroUpgrades(), ['surge', 'plating']), one)).toBe(true);
    expect(ownStatsChanged(ownShip('torpedoBoat', zeroUpgrades(), []), one)).toBe(true); // redeploy wipe
    const two = ownShip('torpedoBoat', zeroUpgrades(), ['surge', 'plating']);
    expect(ownStatsChanged(ownShip('torpedoBoat', zeroUpgrades(), ['plating', 'surge']), two)).toBe(true);
  });

  it('stays quiet on an IDENTICAL boons list in a fresh array (per-frame reallocation must not refire)', () => {
    const prev = ownShip('torpedoBoat', zeroUpgrades(), ['surge', 'plating']);
    const next = ownShip('torpedoBoat', zeroUpgrades(), ['surge', 'plating']);
    expect(next.boons).not.toBe(prev.boons); // genuinely fresh arrays
    expect(ownStatsChanged(next, prev)).toBe(false);
  });
});

describe('HUD denominators react to effective stats', () => {
  const TB = CONFIG.shipClasses.torpedoBoat;

  it('speed ladder: at the same true speed, an upgraded maxSpeed reads a LOWER fraction', () => {
    const upg = zeroUpgrades();
    upg[UPGRADE_IDS.indexOf('maxSpeed')] = 2;
    const base = effectiveStats(TB, zeroUpgrades()).kinematics;
    const fast = effectiveStats(TB, upg).kinematics;
    expect(speedLadderFraction(30, fast)).toBeLessThan(speedLadderFraction(30, base));
    // Full ahead at the UPGRADED max still pins the needle at exactly 1.
    expect(speedLadderFraction(fast.maxSpeed, fast)).toBe(1);
    expect(speedLadderFraction(-fast.reverseSpeed, fast)).toBe(-1);
  });

  it('chip denominators come from effective stats; the gun pool stays pinned at 1', () => {
    const upg = zeroUpgrades();
    upg[UPGRADE_IDS.indexOf('gunAmmo')] = 1; // interregnum: neutralized, no effect on the pool
    upg[UPGRADE_IDS.indexOf('gunReload')] = 1;
    const stats = effectiveStats(TB, upg);
    // Single-shot gun: maxAmmo is PINNED to 1 regardless of a stacked gunAmmo
    // (the id survives on the wire but is neutralized in effectiveStats).
    expect(equipmentMaxAmmo(stats, 'gun')).toBe(CONFIG.gun.maxAmmo);
    expect(equipmentMaxAmmo(stats, 'gun')).toBe(1);
    expect(equipmentReloadMs(stats, 'gun')).toBeCloseTo(CONFIG.gun.reloadMs * CONFIG.upgrades.gunReload.mult, 9);
    expect(equipmentMaxAmmo(stats, 'torpedo')).toBe(CONFIG.torpedo.maxAmmo); // others untouched
  });

  it('hp bar: the effective maxHp denominator grows with hullPoints stacks', () => {
    const upg = zeroUpgrades();
    upg[UPGRADE_IDS.indexOf('hullPoints')] = 3;
    expect(effectiveStats(TB, upg).maxHp).toBe(TB.hp + 3 * CONFIG.upgrades.hullPoints.add);
  });
});
