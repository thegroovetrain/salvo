// effectiveStats — the server/client desync firewall, Story 2.8 shape:
// effectiveStats(cls, boons = []) — the legacy counts param and the 14-entry
// CONFIG.upgrades stacking DIED with the catalog (FR20; every pin here flipped
// deliberately from the counts-era suite). Properties pinned: (1) zero boons
// is a byte-for-byte identity with the class/CONFIG bases (new promoted
// fields included); (2) boon stat effects stack BY OCCURRENCE in list order;
// (3) doctrine effects fold into the per-weapon mode fields; (4) the
// defensive clamps: sweepRpm ≤ CONFIG.vision.sweepRpmMax (re-homed from the
// deleted CONFIG.upgrades), mine.triggerRadius ≤ blastRadius, gun.barrels
// 1..3; (5) the single-shot gun-pool pin is RETIRED (gun.maxAmmo moves).

import { describe, it, expect } from 'vitest';
import {
  BOON_CATALOG,
  CONFIG,
  SHIP_CLASS_IDS,
  effectiveStats,
  equipmentMaxAmmo,
  equipmentReloadMs,
  resolveBoons,
  type BoonDef,
  type BoonStatPath,
  type EffectiveStats,
} from '../index.js';

const BASE = CONFIG.shipClasses.battleship;

/** A local stat-only test boon (never in the production catalog). */
const boon = (path: BoonStatPath, over: { mult?: number; add?: number }): BoonDef => ({
  id: 't',
  category: 'test',
  rarity: 'common',
  copies: 5,
  effects: [{ kind: 'stat', path, ...over }],
});

/** N occurrences of a production catalog line (the deck's stacking shape). */
const stack = (id: string, n: number): readonly BoonDef[] => resolveBoons(new Array<string>(n).fill(id));

/** Flatten an EffectiveStats tree into dotted-path -> number entries. */
function flatten(stats: EffectiveStats): Map<string, number | string> {
  const out = new Map<string, number | string>();
  const walk = (node: Record<string, unknown>, prefix: string): void => {
    for (const [key, value] of Object.entries(node)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (typeof value === 'number' || typeof value === 'string') out.set(path, value);
      else walk(value as Record<string, unknown>, path);
    }
  };
  walk(stats as unknown as Record<string, unknown>, '');
  return out;
}

describe('effectiveStats — zero-boons identity (per class, new-field bases)', () => {
  it.each(SHIP_CLASS_IDS.map((id) => [id] as const))('%s at zero boons equals its bases', (id) => {
    const cls = CONFIG.shipClasses[id];
    expect(effectiveStats(cls)).toEqual({
      kinematics: { ...cls.kinematics },
      maxHp: cls.hp,
      radarRange: CONFIG.vision.radar,
      sweepRpm: CONFIG.vision.sweepRpm,
      sweepPeriodMs: 60000 / CONFIG.vision.sweepRpm,
      sightRange: CONFIG.vision.sight,
      gun: {
        reloadMs: CONFIG.gun.reloadMs,
        maxAmmo: CONFIG.gun.maxAmmo,
        rangeU: CONFIG.vision.radar, // range = radar range (Eric 2026-07-21)
        damage: CONFIG.gun.damage,
        contactDamage: CONFIG.gun.contactDamage,
        burstRadius: CONFIG.gun.burstRadius,
        barrels: 1,
      },
      torpedo: {
        reloadMs: CONFIG.torpedo.reloadMs,
        maxAmmo: CONFIG.torpedo.maxAmmo,
        speed: CONFIG.torpedo.speed,
        damage: CONFIG.torpedo.damage,
        mode: 'standard',
      },
      mine: {
        reloadMs: CONFIG.mine.reloadMs,
        maxAmmo: CONFIG.mine.maxAmmo,
        maxLive: CONFIG.mine.maxLive,
        damage: CONFIG.mine.damage,
        blastRadius: CONFIG.mine.blastRadius,
        triggerRadius: CONFIG.mine.triggerRadius,
        mode: 'standard',
      },
      boost: {
        speedBonus: CONFIG.speedBoost.speedBonus,
        durationMs: CONFIG.speedBoost.durationMs,
        maxAmmo: CONFIG.speedBoost.maxAmmo,
        reloadMs: CONFIG.speedBoost.reloadMs,
      },
      cannon: {
        reloadMs: CONFIG.cannon.reloadMs,
        maxAmmo: CONFIG.cannon.maxAmmo,
        rangeU: CONFIG.vision.radar,
        damage: CONFIG.cannon.damage,
        contactDamage: CONFIG.cannon.contactDamage,
        burstRadius: CONFIG.cannon.burstRadius,
        mode: 'standard',
      },
      starShells: {
        reloadMs: CONFIG.starShells.reloadMs,
        maxAmmo: CONFIG.starShells.maxAmmo,
        rangeU: CONFIG.vision.radar,
        litRadius: CONFIG.starShells.litRadius, // the ratified SIGHT/2 derivation
        litDurationMs: CONFIG.starShells.litDurationMs,
        mode: 'standard',
      },
      decoyBuoy: {
        reloadMs: CONFIG.decoyBuoy.reloadMs,
        maxAmmo: CONFIG.decoyBuoy.maxAmmo,
        durationMs: CONFIG.decoyBuoy.durationMs,
      },
    });
  });

  it('the base radar sweep is 15 rpm = exactly 4000 ms per revolution', () => {
    const s = effectiveStats(BASE);
    expect(s.sweepRpm).toBe(15);
    expect(s.sweepPeriodMs).toBe(4000);
  });

  it('the signature is (cls, boons?): omitted, [], and explicit-default calls are byte-identical', () => {
    expect(effectiveStats(BASE)).toEqual(effectiveStats(BASE, []));
  });
});

describe('effectiveStats — boon stacking BY OCCURRENCE (the deck copy law)', () => {
  it('N repeats of a mult line compound: base × mult^N', () => {
    const s3 = effectiveStats(BASE, stack('intelRadar', 3));
    expect(s3.radarRange).toBeCloseTo(CONFIG.vision.radar * 1.15 ** 3, 9);
  });

  it('N repeats of an add line stack linearly (shipHull +20/card)', () => {
    for (const n of [1, 3, 5]) {
      expect(effectiveStats(BASE, stack('shipHull', n)).maxHp).toBe(BASE.hp + 20 * n);
    }
  });

  it('torpedoSpeed is the RATIFIED +5/card ladder: 60 → 80 at the 4-copy cap', () => {
    expect(effectiveStats(BASE, stack('torpedoSpeed', 4)).torpedo.speed).toBe(80);
    expect(CONFIG.torpedo.speed).toBe(60);
  });

  it('shipSpeed scales maxSpeed AND reverseSpeed by the same factor (reverse rides along)', () => {
    const s = effectiveStats(BASE, stack('shipSpeed', 2));
    const f = 1.05 ** 2;
    expect(s.kinematics.maxSpeed).toBeCloseTo(BASE.kinematics.maxSpeed * f, 9);
    expect(s.kinematics.reverseSpeed).toBeCloseTo(BASE.kinematics.reverseSpeed * f, 9);
    expect(s.kinematics.accel).toBe(BASE.kinematics.accel); // accel/turn untouched
    expect(s.kinematics.turnRate).toBe(BASE.kinematics.turnRate);
  });

  it('boon-list order is load-bearing and deterministic (mult-then-add ≠ add-then-mult)', () => {
    const mult = boon('maxHp', { mult: 2 });
    const add = boon('maxHp', { add: 30 });
    expect(effectiveStats(BASE, [mult, add]).maxHp).toBe(BASE.hp * 2 + 30);
    expect(effectiveStats(BASE, [add, mult]).maxHp).toBe((BASE.hp + 30) * 2);
    expect(effectiveStats(BASE, [mult, add])).toEqual(effectiveStats(BASE, [mult, add]));
  });
});

describe('effectiveStats — the single-shot gun-pool pin is RETIRED (Story 2.8)', () => {
  // FLIPPED PIN: the counts-era suite pinned gun.maxAmmo to 1 against any
  // stack (gunAmmo neutralized). The AFT TURRET line now legitimately raises
  // the pool — whitelist + stats unpinned KNOWINGLY.
  it('gunTurret raises the gun pool 1 → 2', () => {
    expect(effectiveStats(BASE).gun.maxAmmo).toBe(1);
    expect(effectiveStats(BASE, stack('gunTurret', 1)).gun.maxAmmo).toBe(2);
  });

  it('gunBarrel raises barrels 1 → 2 → 3 (TWIN → TRIPLE MOUNT)', () => {
    expect(effectiveStats(BASE, stack('gunBarrel', 1)).gun.barrels).toBe(2);
    expect(effectiveStats(BASE, stack('gunBarrel', 2)).gun.barrels).toBe(3);
  });
});

describe('effectiveStats — doctrine mode folds', () => {
  it('every weapon defaults to standard; each doctrine card sets exactly its mode', () => {
    const base = effectiveStats(BASE);
    expect([base.cannon.mode, base.torpedo.mode, base.mine.mode, base.starShells.mode]).toEqual([
      'standard',
      'standard',
      'standard',
      'standard',
    ]);
    expect(effectiveStats(BASE, stack('cannonArcing', 1)).cannon.mode).toBe('arcing');
    expect(effectiveStats(BASE, stack('cannonAp', 1)).cannon.mode).toBe('ap');
    expect(effectiveStats(BASE, stack('torpedoHoming', 1)).torpedo.mode).toBe('homing');
    expect(effectiveStats(BASE, stack('torpedoCommand', 1)).torpedo.mode).toBe('command');
    expect(effectiveStats(BASE, stack('mineSelfPropelled', 1)).mine.mode).toBe('selfPropelled');
    expect(effectiveStats(BASE, stack('starIncendiary', 1)).starShells.mode).toBe('incendiary');
    expect(effectiveStats(BASE, stack('starDazzle', 1)).starShells.mode).toBe('dazzle');
  });

  it('a doctrine card moves ONLY its mode field (flatten diff)', () => {
    const identity = flatten(effectiveStats(BASE));
    const arcing = flatten(effectiveStats(BASE, stack('cannonArcing', 1)));
    expect([...arcing.keys()]).toEqual([...identity.keys()]);
    const changed = [...arcing.keys()].filter((k) => arcing.get(k) !== identity.get(k));
    expect(changed).toEqual(['cannon.mode']);
  });

  it('minePropFouling sets the mode AND trades damage down (its bundled stat effect)', () => {
    const s = effectiveStats(BASE, stack('minePropFouling', 1));
    expect(s.mine.mode).toBe('propFouling');
    expect(s.mine.damage).toBeCloseTo(CONFIG.mine.damage * 0.6, 9);
  });

  it('stat stacks apply under either doctrine (amendment 44): swap keeps the ladders', () => {
    const homingBuild = resolveBoons(['torpedoDamage', 'torpedoDamage', 'torpedoHoming']);
    const commandBuild = resolveBoons(['torpedoDamage', 'torpedoDamage', 'torpedoCommand']);
    expect(effectiveStats(BASE, homingBuild).torpedo.damage).toBe(CONFIG.torpedo.damage + 4);
    expect(effectiveStats(BASE, commandBuild).torpedo.damage).toBe(CONFIG.torpedo.damage + 4);
  });

  it('an unknown doctrine weapon/mode in an untyped def is a fail-closed no-op', () => {
    const rogue = {
      id: 'rogue',
      category: 'test',
      rarity: 'exclusive',
      copies: 1,
      effects: [
        { kind: 'doctrine', weapon: 'gun', mode: 'arcing' }, // gun has no mode field
        { kind: 'doctrine', weapon: 'cannon', mode: 'nuclear' }, // unknown mode
      ],
    } as unknown as BoonDef;
    expect(effectiveStats(BASE, [rogue])).toEqual(effectiveStats(BASE));
  });
});

describe('effectiveStats — defensive clamps', () => {
  it('sweepRpm is capped at CONFIG.vision.sweepRpmMax (the re-homed ratified ceiling)', () => {
    expect(CONFIG.vision.sweepRpmMax).toBe(30);
    const capped = effectiveStats(BASE, stack('intelSweep', 5));
    expect(capped.sweepRpm).toBe(30); // 15 + 5×3 exactly at the cap
    expect(capped.sweepPeriodMs).toBe(2000);
    // Past the physical copy cap (test-only over-stack): still clamped.
    const over = effectiveStats(BASE, stack('intelSweep', 20));
    expect(over.sweepRpm).toBe(30);
    expect(over.sweepPeriodMs).toBe(2000);
  });

  it('mine.triggerRadius is clamped to blastRadius (fuze stacks past casing stacks)', () => {
    // 5 trigger stacks alone: 32 × 1.1^5 ≈ 51.5 > blast 48 → clamped to 48.
    const s = effectiveStats(BASE, stack('mineTrigger', 5));
    expect(s.mine.triggerRadius).toBe(s.mine.blastRadius);
    // With blast stacks too, the trigger may grow up to the (bigger) blast.
    const both = effectiveStats(BASE, resolveBoons(['mineTrigger', 'mineTrigger', 'mineTrigger', 'mineTrigger', 'mineTrigger', 'mineBlast', 'mineBlast']));
    expect(both.mine.triggerRadius).toBeLessThanOrEqual(both.mine.blastRadius);
    expect(both.mine.triggerRadius).toBeGreaterThan(CONFIG.mine.triggerRadius);
  });

  it('gun.barrels is clamped to 1..3 integer (untyped over/under-stack data)', () => {
    const over = { ...boon('gun.barrels', { add: 10 }), id: 'over' };
    expect(effectiveStats(BASE, [over]).gun.barrels).toBe(3);
    // A sub-1 fold is already rejected by the positive-scalar gate (mult 0.1
    // → 0.1 is positive but the clamp floors it to 1).
    const under = { ...boon('gun.barrels', { mult: 0.1 }), id: 'under' };
    expect(effectiveStats(BASE, [under]).gun.barrels).toBe(1);
  });
});

describe('effectiveStats — every production catalog line folds (no dead cards)', () => {
  it('each non-acquisition line moves the stats tree; acquisitions leave it byte-identical', () => {
    const identity = flatten(effectiveStats(BASE));
    for (const [id, def] of Object.entries(BOON_CATALOG)) {
      const folded = flatten(effectiveStats(BASE, resolveBoons([id])));
      const isAcquisition = def.effects.some((e) => e.kind === 'slotFill');
      if (isAcquisition) expect(folded, id).toEqual(identity);
      else expect(folded, id).not.toEqual(identity);
    }
  });
});

describe('equipment helpers', () => {
  it('equipmentMaxAmmo / equipmentReloadMs look up the per-equipment effective values', () => {
    const s = effectiveStats(BASE, stack('mineReload', 1));
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
    expect(equipmentReloadMs(s, 'mine')).toBeCloseTo(CONFIG.mine.reloadMs * 0.9, 9);
  });

  it('the legacy upgrade vocabulary is GONE: no CONFIG.upgrades block survives', () => {
    expect('upgrades' in CONFIG).toBe(false);
  });
});
