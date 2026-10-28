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
  DEFAULT_KIT,
  effectiveStats,
  equipmentMaxAmmo,
  equipmentReloadMs,
  type OwnShip,
} from '@salvo/shared';
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
    ammo: [], sweep: 0, cls, gun: 'deckGun', kit: [...DEFAULT_KIT], pts: 0, offer: [], boostUntil: 0, cards, lvl: 0, xp: 0, repairHp: 0,
  };
}

describe('point toast line — pure formatting', () => {
  // Story 2.6 (amendment 33): a LEVEL UP is the only thing that banks a point
  // now — passive tick or kill — so the toast names the level, with no "banked"
  // wording and REFIT (not UPGRADE) as the verb. Supersedes the 2.1 copy.
  it('pointToastLine yields one non-empty, stable prompt line', () => {
    expect(pointToastLine().length).toBeGreaterThan(0);
    expect(pointToastLine()).toBe(pointToastLine());
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
      offer: ['radarSweep', 'hullPoints', 'deckGun', 'navalMines'],
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
    expect(ownStatsChanged(ownShip('torpedoBoat', ['radarSweep', 'hullPoints']), one)).toBe(true);
    expect(ownStatsChanged(ownShip('torpedoBoat', []), one)).toBe(true); // redeploy wipe
    const two = ownShip('torpedoBoat', ['radarSweep', 'hullPoints']);
    expect(ownStatsChanged(ownShip('torpedoBoat', ['hullPoints', 'radarSweep']), two)).toBe(true);
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
    const prev = ownShip('torpedoBoat', ['radarSweep', 'hullPoints']);
    const next = ownShip('torpedoBoat', ['radarSweep', 'hullPoints']);
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

  it('chip denominators come from effective stats — the second turret retires the single-shot pin', () => {
    // PIN FLIPPED (Story 2.8): the gun pool is no longer pinned at 1 — the
    // second turret raises it, and effectiveStats is the one place it moves.
    // Since amendment 197 the turret is the CANNON ladder's rung to III (its
    // second card), not a card of its own: one card leaves the pool alone.
    expect(equipmentMaxAmmo(effectiveStats(TB), 'gun')).toBe(CONFIG.gun.maxAmmo);
    expect(equipmentMaxAmmo(statsFor('torpedoBoat', { deckGun: 1 }), 'gun')).toBe(CONFIG.gun.maxAmmo);
    const turret = statsFor('torpedoBoat', { deckGun: 2 });
    expect(equipmentMaxAmmo(turret, 'gun')).toBe(CONFIG.gun.maxAmmo + 1);
  });

  // PIN INVERTED (2026-08-04): the per-equipment reload lines are gone and ONE
  // universal RELOAD card scales every cooldown at once. RETUNED by catalog v3
  // (R12, Eric's sheet): −5 % per tier over five tiers, cap 25 % — was −10 %
  // per copy to 50 %.
  it('cooldown chips: ONE RELOAD stack scales every equipment reload at once', () => {
    const base = effectiveStats(TB);
    const drilled = statsFor('torpedoBoat', { reload: 1 });
    expect(drilled.cooldownScale).toBeLessThan(1);
    expect(drilled.cooldownScale).toBeGreaterThan(0);
    for (const id of ['gun', 'broadside', 'heavyTorpedo', 'navalMines', 'starShells', 'boost'] as const) {
      expect(equipmentReloadMs(drilled, id), id).toBe(equipmentReloadMs(base, id) * drilled.cooldownScale);
    }
    // ...and nothing that is not a cooldown moves with it.
    expect(equipmentMaxAmmo(drilled, 'navalMines')).toBe(equipmentMaxAmmo(base, 'navalMines'));
    expect(drilled.equipment.gun.damage).toBe(base.equipment.gun.damage);
    expect(drilled.kinematics.maxSpeed).toBe(base.kinematics.maxSpeed);
  });

  // The HUD/hotbar surface reads the SAME scaled numbers the sim does — the
  // firewall's post-fold multiply is the only place the scale is applied, so a
  // full 5-stack build lands the scaled base reloads on the chips.
  it('a FULL RELOAD stack is additive-linear (never compounding) and lands on the chips', () => {
    const one = statsFor('battleship', { reload: 1 }).cooldownScale;
    const maxed = statsFor('battleship', { reload: 5 });
    expect(maxed.cooldownScale).toBeCloseTo(1 - 5 * (1 - one), 9);
    expect(maxed.cooldownScale).not.toBeCloseTo(one ** 5, 3);
    expect(equipmentReloadMs(maxed, 'gun')).toBe(CONFIG.gun.reloadMs * maxed.cooldownScale);
    expect(equipmentReloadMs(maxed, 'broadside')).toBe(CONFIG.broadside.reloadMs * maxed.cooldownScale);
  });

  // The whole ladder, rung by rung: 1 / .95 / .9 / .85 / .8 / .75 — every step
  // exact after clampStats' 3-decimal rounding, so no reachable stack can leave
  // float dust that costs a whole 50ms ammo tick.
  it('walks a dust-free, strictly descending scale ladder at every reachable stack (0..5)', () => {
    const ladder = [0, 1, 2, 3, 4, 5].map((n) => statsFor('battleship', { reload: n }).cooldownScale);
    expect(ladder[0]).toBe(1);
    ladder.forEach((scale, n) => {
      expect(scale, `stack ${n} carries no float dust`).toBe(Math.round(scale * 1000) / 1000);
      if (n > 0) expect(scale, `stack ${n}`).toBeLessThan(ladder[n - 1]);
      const s = statsFor('battleship', { reload: n });
      expect(equipmentReloadMs(s, 'gun'), `gun @ ${n}`).toBe(CONFIG.gun.reloadMs * scale);
      expect(equipmentReloadMs(s, 'broadside'), `broadside @ ${n}`).toBe(CONFIG.broadside.reloadMs * scale);
    });
  });

  it('hp bar: the effective maxHp denominator grows with HULL stacks', () => {
    expect(statsFor('torpedoBoat', { hullPoints: 3 }).maxHp).toBeGreaterThan(TB.hp);
    // Three copies of one line stack by occurrence — the deck's copy-count law.
    const one = statsFor('torpedoBoat', { hullPoints: 1 }).maxHp - TB.hp;
    expect(statsFor('torpedoBoat', { hullPoints: 3 }).maxHp).toBe(TB.hp + 3 * one);
  });
});
