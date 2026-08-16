// The client's BOON STAT SEAM (Story 2.8 — reworked from the Stage D upgrade
// seam): the ownStatsChanged frame gate (cls + boon-list equality) that gates
// the effective-stats recompute, and the HUD denominators reacting to effective
// stats. The 14 legacy upgrades, their toast labels, the `upg` wire vector and
// CONFIG.upgrades all died with the wholesale strip (PV 16) — everything that
// used to be tested through them is tested through BOONS here.

import { describe, it, expect } from 'vitest';
import {
  BOON_CATALOG,
  CONFIG,
  effectiveStats,
  equipmentMaxAmmo,
  equipmentReloadMs,
  resolveBoons,
  type OwnShip,
} from '@salvo/shared';
import { boonName } from '../ui/boonCopy.js';
import { pointToastLine } from '../ui/upgradeToast.js';
import { ownStatsChanged } from '../net/roomBindings.js';
import { speedLadderFraction } from '../render/hud.js';

/** Effective stats for a class + an id → stack-count boon build. */
function statsFor(cls: OwnShip['cls'], boons: Record<string, number> = {}) {
  const ids: string[] = [];
  for (const [id, n] of Object.entries(boons)) {
    for (let i = 0; i < n; i += 1) ids.push(id);
  }
  return effectiveStats(CONFIG.shipClasses[cls], resolveBoons(ids, BOON_CATALOG));
}

function ownShip(cls: OwnShip['cls'], boons: string[] = []): OwnShip {
  return {
    id: 'me', x: 0, y: 0, heading: 0, speed: 0, hp: 100, alive: true,
    ammo: [], sweep: 0, cls, pts: 0, offer: [], boostUntil: 0, boons, lvl: 0, xp: 0, repairHp: 0,
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
    const prev = ownShip('torpedoBoat', ['gunDamage', 'intelSweep']);
    expect(ownStatsChanged(ownShip('torpedoBoat', ['gunDamage', 'intelSweep']), prev)).toBe(false);
  });

  it('IGNORES pts/offer-only deltas — banking a level must not fire the stats/fog recompute', () => {
    const prev = { ...ownShip('torpedoBoat'), pts: 0, offer: [] as string[] };
    const next = {
      ...ownShip('torpedoBoat'),
      pts: 2,
      offer: ['gunDamage', 'shipHull', 'intelRange', 'mineBlast'],
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
    expect(ownStatsChanged(ownShip('torpedoBoat', ['gunDamage']), prev)).toBe(true);
    const one = ownShip('torpedoBoat', ['gunDamage']);
    expect(ownStatsChanged(ownShip('torpedoBoat', ['gunDamage', 'shipHull']), one)).toBe(true);
    expect(ownStatsChanged(ownShip('torpedoBoat', []), one)).toBe(true); // redeploy wipe
    const two = ownShip('torpedoBoat', ['gunDamage', 'shipHull']);
    expect(ownStatsChanged(ownShip('torpedoBoat', ['shipHull', 'gunDamage']), two)).toBe(true);
  });

  it('fires on a REPEAT of a line already held — a stack is a real stat change', () => {
    // The deck's copy-count law: occurrences stack, so appending the SAME id is
    // exactly as load-bearing as appending a new one.
    const one = ownShip('torpedoBoat', ['gunDamage']);
    expect(ownStatsChanged(ownShip('torpedoBoat', ['gunDamage', 'gunDamage']), one)).toBe(true);
  });

  it('fires on a DOCTRINE SWAP — the rival id replaces the held one in place', () => {
    const homing = ownShip('torpedoBoat', ['torpedoDamage', 'torpedoHoming']);
    const command = ownShip('torpedoBoat', ['torpedoDamage', 'torpedoCommand']);
    expect(ownStatsChanged(command, homing)).toBe(true);
  });

  it('stays quiet on an IDENTICAL boons list in a fresh array (per-frame reallocation must not refire)', () => {
    const prev = ownShip('torpedoBoat', ['gunDamage', 'shipHull']);
    const next = ownShip('torpedoBoat', ['gunDamage', 'shipHull']);
    expect(next.boons).not.toBe(prev.boons); // genuinely fresh arrays
    expect(ownStatsChanged(next, prev)).toBe(false);
  });
});

describe('HUD denominators react to effective stats', () => {
  const TB = CONFIG.shipClasses.torpedoBoat;

  it('speed ladder: at the same true speed, a shipSpeed stack reads a LOWER fraction', () => {
    const base = effectiveStats(TB).kinematics;
    const fast = statsFor('torpedoBoat', { shipSpeed: 2 }).kinematics;
    expect(speedLadderFraction(20, fast)).toBeLessThan(speedLadderFraction(20, base));
    // Full ahead at the STACKED max still pins the needle at exactly 1.
    expect(speedLadderFraction(fast.maxSpeed, fast)).toBe(1);
    expect(speedLadderFraction(-fast.reverseSpeed, fast)).toBe(-1);
  });

  it('chip denominators come from effective stats — AFT TURRET retires the single-shot pin', () => {
    // PIN FLIPPED (Story 2.8): the gun pool is no longer pinned at 1 — the rare
    // AFT TURRET line raises it, and effectiveStats is the one place it moves.
    expect(equipmentMaxAmmo(effectiveStats(TB), 'gun')).toBe(CONFIG.gun.maxAmmo);
    const turret = statsFor('torpedoBoat', { gunTurret: 1 });
    expect(equipmentMaxAmmo(turret, 'gun')).toBe(CONFIG.gun.maxAmmo + 1);
  });

  // PIN INVERTED (2026-08-04): the seven per-equipment reload lines are gone and
  // ONE universal `shipCooldown` card scales every cooldown at once. The old
  // pin proved a gun card left the mines alone; this one proves the opposite —
  // a single stack has to move ALL SEVEN reloads, or the card is a lie.
  it('cooldown chips: ONE shipCooldown stack scales every equipment reload at once', () => {
    const base = effectiveStats(TB);
    const drilled = statsFor('torpedoBoat', { shipCooldown: 1 });
    expect(drilled.cooldownScale).toBe(0.9);
    for (const id of ['gun', 'cannon', 'torpedo', 'mine', 'starShells', 'speedBoost', 'decoyBuoy'] as const) {
      expect(equipmentReloadMs(drilled, id), id).toBe(equipmentReloadMs(base, id) * 0.9);
    }
    // ...and nothing that is not a cooldown moves with it.
    expect(equipmentMaxAmmo(drilled, 'mine')).toBe(equipmentMaxAmmo(base, 'mine'));
    expect(drilled.gun.damage).toBe(base.gun.damage);
    expect(drilled.kinematics.maxSpeed).toBe(base.kinematics.maxSpeed);
  });

  // The HUD/hotbar surface reads the SAME scaled numbers the sim does — the
  // firewall's post-fold multiply is the only place the scale is applied, so a
  // full 5-stack build (Eric ruling 2026-08-04: copies 4 → 5, cap 0.6 → 0.5)
  // lands the ratified 2.5s gun / 22.5s cannon on the chips (the cannon figure
  // was 25s until the same-day balance pass retuned its base 50000 → 45000).
  it('a FULL shipCooldown stack lands the ratified 2.5s gun and 22.5s cannon on the chips', () => {
    const maxed = statsFor('battleship', { shipCooldown: 5 });
    expect(equipmentReloadMs(maxed, 'gun')).toBe(2500);
    // 45000 base -> 22500 (cannon base retuned 50000 -> 45000, Eric ruling
    // 2026-08-04, the weapon balance pass).
    expect(equipmentReloadMs(maxed, 'cannon')).toBe(22500);
    // Additive-linear, never 0.9^5 (which would land 2952/26572).
    expect(maxed.cooldownScale).toBe(0.5);
    // The 5th rung has ratified copy — the card can name the stack it just took.
    expect(boonName('shipCooldown', 4)).toBe('GUNNERY PENNANT');
  });

  // The whole ladder, rung by rung: 1 / 0.9 / 0.8 / 0.7 / 0.6 / 0.5 — every step
  // exact after clampStats' 3-decimal rounding, so no reachable stack can leave
  // float dust that costs a whole 50ms ammo tick.
  it('walks the exact scale ladder at every reachable stack (0..5), strictly', () => {
    const ladder = [1, 0.9, 0.8, 0.7, 0.6, 0.5];
    ladder.forEach((scale, n) => {
      const s = statsFor('battleship', { shipCooldown: n });
      expect(s.cooldownScale, `stack ${n}`).toBe(scale);
      expect(equipmentReloadMs(s, 'gun'), `gun @ ${n}`).toBe(CONFIG.gun.reloadMs * scale);
      expect(equipmentReloadMs(s, 'cannon'), `cannon @ ${n}`).toBe(CONFIG.cannon.reloadMs * scale);
    });
  });

  it('hp bar: the effective maxHp denominator grows with shipHull stacks', () => {
    expect(statsFor('torpedoBoat', { shipHull: 3 }).maxHp).toBeGreaterThan(TB.hp);
    // Three copies of one line stack by occurrence — the deck's copy-count law.
    const one = statsFor('torpedoBoat', { shipHull: 1 }).maxHp - TB.hp;
    expect(statsFor('torpedoBoat', { shipHull: 3 }).maxHp).toBe(TB.hp + 3 * one);
  });
});
