// The client's BOON STAT SEAM (Story 2.8 — reworked from the Stage D upgrade
// seam): the ownStatsChanged frame gate (cls + boon-list equality) that gates
// the effective-stats recompute, and the HUD denominators reacting to effective
// stats. The 14 legacy upgrades, their toast labels, the `upg` wire vector and
// CONFIG.upgrades all died with the wholesale strip (PV 16) — everything that
// used to be tested through them is tested through BOONS here.

import { describe, it, expect } from 'vitest';
import {
  CATALOG,
  CONFIG,
  effectiveStats,
  equipmentMaxAmmo,
  equipmentReloadMs,
  type OwnShip,
} from '@salvo/shared';
import { boonName } from '../ui/boonCopy.js';
import { pointToastLine } from '../ui/upgradeToast.js';
import { ownStatsChanged } from '../net/roomBindings.js';
import { speedLadderFraction } from '../render/helmGlobe.js';

/** Effective stats for a class + an id → stack-count boon build. */
function statsFor(cls: OwnShip['cls'], boons: Record<string, number> = {}) {
  const ids: string[] = [];
  for (const [id, n] of Object.entries(boons)) {
    for (let i = 0; i < n; i += 1) ids.push(id);
  }
  return effectiveStats(CONFIG.shipClasses[cls], ids);
}

function ownShip(cls: OwnShip['cls'], cards: string[] = []): OwnShip {
  return {
    id: 'me', x: 0, y: 0, heading: 0, speed: 0, hp: 100, alive: true,
    ammo: [], sweep: 0, cls, pts: 0, offer: [], boostUntil: 0, cards, lvl: 0, xp: 0, repairHp: 0,
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
    expect(ownStatsChanged(ownShip('torpedoBoat'), null)).toBe(true);
    expect(ownStatsChanged(ownShip('torpedoBoat'), undefined)).toBe(true);
  });

  it('fires on a class change', () => {
    expect(ownStatsChanged(ownShip('battleship'), ownShip('torpedoBoat'))).toBe(true);
  });

  it('stays quiet when cls and the boon list are unchanged (per-frame fast path)', () => {
    expect(ownStatsChanged(ownShip('torpedoBoat'), ownShip('torpedoBoat'))).toBe(false);
    const prev = ownShip('torpedoBoat', ['radarSweep', 'radarSweep']);
    expect(ownStatsChanged(ownShip('torpedoBoat', ['radarSweep', 'radarSweep']), prev)).toBe(false);
  });

  it('IGNORES pts/offer-only deltas — banking a level must not fire the stats/fog recompute', () => {
    const prev = { ...ownShip('torpedoBoat'), pts: 0, offer: [] as string[] };
    const next = {
      ...ownShip('torpedoBoat'),
      pts: 2,
      offer: ['radarSweep', 'armor', 'deckGunBarrel', 'navalMines'],
    };
    expect(ownStatsChanged(next, prev)).toBe(false);
  });

  it('IGNORES the Story 2.6 xp/lvl deltas — the passive tick moves `xp` EVERY frame', () => {
    // The XP fill is a per-frame moving number: if it fed the recompute gate,
    // every single frame would rebuild effective stats and re-bake the fog.
    const prev = { ...ownShip('torpedoBoat'), lvl: 0, xp: 0.25 };
    expect(ownStatsChanged({ ...prev, xp: 0.2508333 }, prev)).toBe(false);
    // ...and a LEVEL UP is not a stat change either: the build only moves when
    // the level is SPENT (which lands as a `boons` change, pinned below).
    expect(ownStatsChanged({ ...prev, lvl: 1, xp: 0, pts: 1 }, prev)).toBe(false);
  });

  it('fires on ANY boons change: first fit, append, removal, and reorder', () => {
    const prev = ownShip('torpedoBoat', []);
    expect(ownStatsChanged(ownShip('torpedoBoat', ['radarSweep']), prev)).toBe(true);
    const one = ownShip('torpedoBoat', ['radarSweep']);
    expect(ownStatsChanged(ownShip('torpedoBoat', ['radarSweep', 'armor']), one)).toBe(true);
    expect(ownStatsChanged(ownShip('torpedoBoat', []), one)).toBe(true); // redeploy wipe
    const two = ownShip('torpedoBoat', ['radarSweep', 'armor']);
    expect(ownStatsChanged(ownShip('torpedoBoat', ['armor', 'radarSweep']), two)).toBe(true);
  });

  it('fires on a REPEAT of a line already held — a stack is a real stat change', () => {
    // The deck's copy-count law: occurrences stack, so appending the SAME id is
    // exactly as load-bearing as appending a new one.
    const one = ownShip('torpedoBoat', ['radarSweep']);
    expect(ownStatsChanged(ownShip('torpedoBoat', ['radarSweep', 'radarSweep']), one)).toBe(true);
  });

  it('fires on a DOCTRINE SWAP — the rival id replaces the held one in place', () => {
    const homing = ownShip('torpedoBoat', ['heavyTorpedo', 'acousticHoming']);
    const command = ownShip('torpedoBoat', ['heavyTorpedo', 'mineSelfPropelled']);
    expect(ownStatsChanged(command, homing)).toBe(true);
  });

  it('stays quiet on an IDENTICAL cards list in a fresh array (per-frame reallocation must not refire)', () => {
    const prev = ownShip('torpedoBoat', ['radarSweep', 'armor']);
    const next = ownShip('torpedoBoat', ['radarSweep', 'armor']);
    expect(next.cards).not.toBe(prev.cards); // genuinely fresh arrays
    expect(ownStatsChanged(next, prev)).toBe(false);
  });
});

describe('HUD denominators react to effective stats', () => {
  const TB = CONFIG.shipClasses.torpedoBoat;

  it('speed ladder: at the same true speed, a SPEED stack reads a LOWER fraction', () => {
    const base = effectiveStats(TB).kinematics;
    const fast = statsFor('torpedoBoat', { speed: 2 }).kinematics;
    expect(speedLadderFraction(20, fast)).toBeLessThan(speedLadderFraction(20, base));
    // Full ahead at the STACKED max still pins the needle at exactly 1.
    expect(speedLadderFraction(fast.maxSpeed, fast)).toBe(1);
    expect(speedLadderFraction(-fast.reverseSpeed, fast)).toBe(-1);
  });

  it('chip denominators come from effective stats — AFT TURRET retires the single-shot pin', () => {
    // PIN FLIPPED (Story 2.8): the gun pool is no longer pinned at 1 — the rare
    // AFT TURRET line raises it, and effectiveStats is the one place it moves.
    expect(equipmentMaxAmmo(effectiveStats(TB), 'gun')).toBe(CONFIG.gun.maxAmmo);
    const turret = statsFor('torpedoBoat', { deckGunTurret: 1 });
    expect(equipmentMaxAmmo(turret, 'gun')).toBe(CONFIG.gun.maxAmmo + 1);
  });

  // PIN INVERTED (2026-08-04): the per-equipment reload lines are gone and ONE
  // universal RELOAD card scales every cooldown at once. RETUNED by catalog v3
  // (R12, Eric's sheet): −5 % per tier over five tiers, cap 25 % — was −10 %
  // per copy to 50 %.
  it('cooldown chips: ONE RELOAD stack scales every equipment reload at once', () => {
    const base = effectiveStats(TB);
    const drilled = statsFor('torpedoBoat', { reload: 1 });
    expect(drilled.cooldownScale).toBe(0.95);
    for (const id of ['gun', 'broadside', 'heavyTorpedo', 'navalMines', 'starShells', 'speedBoost', 'radarBuoy'] as const) {
      expect(equipmentReloadMs(drilled, id), id).toBe(equipmentReloadMs(base, id) * 0.95);
    }
    // ...and nothing that is not a cooldown moves with it.
    expect(equipmentMaxAmmo(drilled, 'navalMines')).toBe(equipmentMaxAmmo(base, 'navalMines'));
    expect(drilled.equipment.gun.damage).toBe(base.equipment.gun.damage);
    expect(drilled.kinematics.maxSpeed).toBe(base.kinematics.maxSpeed);
  });

  // The HUD/hotbar surface reads the SAME scaled numbers the sim does — the
  // firewall's post-fold multiply is the only place the scale is applied, so a
  // full 5-stack build lands the ratified numbers on the chips. Catalog v3 (R12)
  // caps the ladder at 25 %, so the BB's gun runs 3.75s and its broadside 13.5s.
  it('a FULL RELOAD stack lands 3.75s gun and 13.5s broadside on the chips', () => {
    const maxed = statsFor('battleship', { reload: 5 });
    expect(equipmentReloadMs(maxed, 'gun')).toBe(3750);
    expect(equipmentReloadMs(maxed, 'broadside')).toBe(13500); // 18000 base × 0.75
    // Additive-linear, never 0.95^5 (which would land 3869/13930).
    expect(maxed.cooldownScale).toBe(0.75);
    // The line has a ratified name — catalog v3 names the LINE, not the rung.
    expect(boonName('reload', 4)).toBe('RELOAD');
  });

  // The whole ladder, rung by rung: 1 / .95 / .9 / .85 / .8 / .75 — every step
  // exact after clampStats' 3-decimal rounding, so no reachable stack can leave
  // float dust that costs a whole 50ms ammo tick.
  it('walks the exact scale ladder at every reachable stack (0..5), strictly', () => {
    const ladder = [1, 0.95, 0.9, 0.85, 0.8, 0.75];
    ladder.forEach((scale, n) => {
      const s = statsFor('battleship', { reload: n });
      expect(s.cooldownScale, `stack ${n}`).toBe(scale);
      expect(equipmentReloadMs(s, 'gun'), `gun @ ${n}`).toBe(CONFIG.gun.reloadMs * scale);
      expect(equipmentReloadMs(s, 'broadside'), `broadside @ ${n}`).toBe(CONFIG.broadside.reloadMs * scale);
    });
  });

  it('hp bar: the effective maxHp denominator grows with ARMOR stacks', () => {
    expect(statsFor('torpedoBoat', { armor: 3 }).maxHp).toBeGreaterThan(TB.hp);
    // Three copies of one line stack by occurrence — the deck's copy-count law.
    const one = statsFor('torpedoBoat', { armor: 1 }).maxHp - TB.hp;
    expect(statsFor('torpedoBoat', { armor: 3 }).maxHp).toBe(TB.hp + 3 * one);
  });
});
