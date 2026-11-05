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
  DEFAULT_CLASS_ID,
  DEFAULT_SHIFT,
  INDEX_IDS,
  SHIFT_IDS,
  SHIP_CLASS_IDS,
  effectiveStats,
  initialTurrets,
  equipmentMaxAmmo,
  equipmentReloadMs,
  type HullIndex,
  type OwnShip,
  type ShipClass,
} from '@salvo/shared';
import { pointToastLine } from '../ui/upgradeToast.js';
import { ownStatsChanged } from '../net/roomBindings.js';
import { speedLadderFraction } from '../render/helmGlobe.js';

/** Story 10.4: no shipped hull sits at the base on every index, and RELOAD
 *  folds into every cooldown — so a pin that reads a CONFIG dial (or a scale
 *  of exactly 1) at zero cards folds this neutral envelope: the default hull,
 *  every index at `CONFIG.index.base`. A fixture, never a ship. */
const NEUTRAL_HULL: ShipClass = {
  ...CONFIG.shipClasses[DEFAULT_CLASS_ID],
  index: Object.fromEntries(INDEX_IDS.map((k) => [k, CONFIG.index.base])) as HullIndex,
};

/** Effective stats for a hull envelope + an id → stack-count boon build. */
function statsFor(hull: ShipClass, boons: Record<string, number> = {}) {
  const ids: string[] = [];
  for (const [id, n] of Object.entries(boons)) {
    for (let i = 0; i < n; i += 1) ids.push(id);
  }
  return effectiveStats(hull, ids);
}

function ownShip(cls: OwnShip['cls'], cards: string[] = [], shift: OwnShip['shift'] = DEFAULT_SHIFT): OwnShip {
  return {
    id: 'me', x: 0, y: 0, heading: 0, speed: 0, hp: 100, alive: true,
    ammo: [], sweep: 0, cls, shift, turrets: initialTurrets(cls), sec: { heat: 0, locked: false }, pts: 0, offer: [], boostUntil: 0, cards, lvl: 0, xp: 0, repairHp: 0,
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
    expect(ownStatsChanged(ownShip(DEFAULT_CLASS_ID), null)).toBe(true);
    expect(ownStatsChanged(ownShip(DEFAULT_CLASS_ID), undefined)).toBe(true);
  });

  it('fires on a class change', () => {
    const [a, b] = SHIP_CLASS_IDS;
    expect(ownStatsChanged(ownShip(b), ownShip(a))).toBe(true);
  });

  // Story 10.4: the Shift is the seat's pick and the loadout's slot 1, so a
  // Shift swap re-folds the loadout exactly as a class change does.
  it('fires on a Shift change', () => {
    const other = SHIFT_IDS.find((id) => id !== DEFAULT_SHIFT)!;
    expect(ownStatsChanged(ownShip(DEFAULT_CLASS_ID, [], other), ownShip(DEFAULT_CLASS_ID))).toBe(true);
  });

  it('stays quiet when cls and the boon list are unchanged (per-frame fast path)', () => {
    expect(ownStatsChanged(ownShip(DEFAULT_CLASS_ID), ownShip(DEFAULT_CLASS_ID))).toBe(false);
    const prev = ownShip(DEFAULT_CLASS_ID, ['intel', 'intel']);
    expect(ownStatsChanged(ownShip(DEFAULT_CLASS_ID, ['intel', 'intel']), prev)).toBe(false);
  });

  it('IGNORES pts/offer-only deltas — banking a level must not fire the stats/fog recompute', () => {
    const prev = { ...ownShip(DEFAULT_CLASS_ID), pts: 0, offer: [] as string[] };
    const next = {
      ...ownShip(DEFAULT_CLASS_ID),
      pts: 2,
      offer: ['intel', 'armor', 'deckGun', 'navalMines'],
    };
    expect(ownStatsChanged(next, prev)).toBe(false);
  });

  it('IGNORES the Story 2.6 xp/lvl deltas — the passive tick moves `xp` EVERY frame', () => {
    // The XP fill is a per-frame moving number: if it fed the recompute gate,
    // every single frame would rebuild effective stats and re-bake the fog.
    const prev = { ...ownShip(DEFAULT_CLASS_ID), lvl: 0, xp: 0.25 };
    expect(ownStatsChanged({ ...prev, xp: 0.2508333 }, prev)).toBe(false);
    // ...and a LEVEL UP is not a stat change either: the build only moves when
    // the level is SPENT (which lands as a `boons` change, pinned below).
    expect(ownStatsChanged({ ...prev, lvl: 1, xp: 0, pts: 1 }, prev)).toBe(false);
  });

  it('fires on ANY boons change: first fit, append, removal, and reorder', () => {
    const prev = ownShip(DEFAULT_CLASS_ID, []);
    expect(ownStatsChanged(ownShip(DEFAULT_CLASS_ID, ['intel']), prev)).toBe(true);
    const one = ownShip(DEFAULT_CLASS_ID, ['intel']);
    expect(ownStatsChanged(ownShip(DEFAULT_CLASS_ID, ['intel', 'armor']), one)).toBe(true);
    expect(ownStatsChanged(ownShip(DEFAULT_CLASS_ID, []), one)).toBe(true); // redeploy wipe
    const two = ownShip(DEFAULT_CLASS_ID, ['intel', 'armor']);
    expect(ownStatsChanged(ownShip(DEFAULT_CLASS_ID, ['armor', 'intel']), two)).toBe(true);
  });

  it('fires on a REPEAT of a line already held — a stack is a real stat change', () => {
    // The deck's copy-count law: occurrences stack, so appending the SAME id is
    // exactly as load-bearing as appending a new one.
    const one = ownShip(DEFAULT_CLASS_ID, ['intel']);
    expect(ownStatsChanged(ownShip(DEFAULT_CLASS_ID, ['intel', 'intel']), one)).toBe(true);
  });

  it('fires on a DOCTRINE SWAP — the rival id replaces the held one in place', () => {
    const homing = ownShip(DEFAULT_CLASS_ID, ['heavyTorpedo', 'acousticHoming']);
    const command = ownShip(DEFAULT_CLASS_ID, ['heavyTorpedo', 'mineSelfPropelled']);
    expect(ownStatsChanged(command, homing)).toBe(true);
  });

  it('stays quiet on an IDENTICAL cards list in a fresh array (per-frame reallocation must not refire)', () => {
    const prev = ownShip(DEFAULT_CLASS_ID, ['intel', 'armor']);
    const next = ownShip(DEFAULT_CLASS_ID, ['intel', 'armor']);
    expect(next.cards).not.toBe(prev.cards); // genuinely fresh arrays
    expect(ownStatsChanged(next, prev)).toBe(false);
  });
});

describe('HUD denominators react to effective stats', () => {
  const TB = NEUTRAL_HULL;

  it('speed ladder: at the same true speed, a SPEED stack reads a LOWER fraction', () => {
    const base = effectiveStats(TB).kinematics;
    const fast = statsFor(TB, { engines: 2 }).kinematics;
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
    expect(equipmentMaxAmmo(statsFor(TB, { deckGun: 1 }), 'gun')).toBe(CONFIG.gun.maxAmmo);
    const turret = statsFor(TB, { deckGun: 2 });
    expect(equipmentMaxAmmo(turret, 'gun')).toBe(CONFIG.gun.maxAmmo + 1);
  });

  // PIN INVERTED (2026-08-04): the per-equipment reload lines are gone and ONE
  // universal RELOAD card scales every cooldown at once. RETUNED by catalog v3
  // (R12, Eric's sheet): −5 % per tier over five tiers, cap 25 % — was −10 %
  // per copy to 50 %. RE-SCOPED by Story 10.5 (R10 / R11, epic-10 amendment
  // 11): RELOAD scales the main battery and the Q / E / R weapons (BROADSIDE
  // and the legacy deck gun too); the Shifts reload on their own numbers.
  it('cooldown chips: ONE RELOAD stack scales the main battery and every slot weapon, and NO Shift', () => {
    const base = effectiveStats(TB);
    const drilled = statsFor(TB, { reload: 1 });
    expect(drilled.cooldownScale).toBeLessThan(1);
    expect(drilled.cooldownScale).toBeGreaterThan(0);
    for (const id of ['mainBattery', 'gun', 'broadside', 'heavyTorpedo', 'navalMines', 'starShells'] as const) {
      expect(equipmentReloadMs(drilled, id), id).toBeCloseTo(equipmentReloadMs(base, id) * drilled.cooldownScale, 9);
    }
    for (const id of ['boost', 'instantReload', 'hunker'] as const) {
      expect(equipmentReloadMs(drilled, id), id).toBe(equipmentReloadMs(base, id));
    }
    // ...and nothing that is not a cooldown moves with it.
    expect(equipmentMaxAmmo(drilled, 'navalMines')).toBe(equipmentMaxAmmo(base, 'navalMines'));
    expect(drilled.equipment.gun.damage).toBe(base.equipment.gun.damage);
    expect(drilled.kinematics.maxSpeed).toBe(base.kinematics.maxSpeed);
  });

  // The HUD/hotbar surface reads the SAME scaled numbers the sim does — the
  // firewall's post-fold multiply is the only place the scale is applied, so a
  // full 5-stack build lands the scaled base reloads on the chips.
  // Story 10.3 (Eric's ruling 14, the haste law): the RELOAD INDEX steps
  // additively, and the cooldown is base / (1 + (RELOAD − 100) / 100) — never a
  // compounded per-card multiplier.
  it('a FULL RELOAD stack follows the haste law (never compounding) and lands on the chips', () => {
    const base = CONFIG.index.base;
    const one = statsFor(TB, { reload: 1 });
    const maxed = statsFor(TB, { reload: 5 });
    expect(maxed.reload - base).toBe(5 * (one.reload - base));
    expect(maxed.cooldownScale).toBeCloseTo(1 / (1 + (maxed.reload - base) / base), 3);
    expect(maxed.cooldownScale).not.toBeCloseTo(one.cooldownScale ** 5, 3);
    expect(equipmentReloadMs(maxed, 'gun')).toBe(CONFIG.gun.reloadMs * maxed.cooldownScale);
    expect(equipmentReloadMs(maxed, 'broadside')).toBeCloseTo(CONFIG.broadside.reloadMs * maxed.cooldownScale, 9); // R11: scaled
    expect(equipmentReloadMs(maxed, 'boost')).toBe(CONFIG.boost.reloadMs); // R10: a Shift is unscaled
  });

  // The whole ladder, rung by rung: 1 / .95 / .9 / .85 / .8 / .75 — every step
  // exact after clampStats' 3-decimal rounding, so no reachable stack can leave
  // float dust that costs a whole 50ms ammo tick.
  it('walks a dust-free, strictly descending scale ladder at every reachable stack (0..5)', () => {
    const ladder = [0, 1, 2, 3, 4, 5].map((n) => statsFor(TB, { reload: n }).cooldownScale);
    expect(ladder[0]).toBe(1);
    ladder.forEach((scale, n) => {
      expect(scale, `stack ${n} carries no float dust`).toBe(Math.round(scale * 1000) / 1000);
      if (n > 0) expect(scale, `stack ${n}`).toBeLessThan(ladder[n - 1]);
      const s = statsFor(TB, { reload: n });
      expect(equipmentReloadMs(s, 'gun'), `gun @ ${n}`).toBe(CONFIG.gun.reloadMs * scale);
      expect(equipmentReloadMs(s, 'broadside'), `broadside @ ${n}`).toBeCloseTo(CONFIG.broadside.reloadMs * scale, 9); // R11: scaled
    });
  });

  // The "maxHp grows by HULL stacks" case lived here until Story 10.3 deleted
  // HULL POINTS (Eric 2026-11-04, epic-10 amendment 8): nothing writes maxHp.
});
