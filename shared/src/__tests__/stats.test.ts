// effectiveStats — the server/client desync firewall, Story 8.1 shape:
// `effectiveStats(cls, cards: LineId[], catalog = CATALOG)`. The resolved-def
// parameter died with catalog v3: the firewall resolves ids itself, counting
// copies per line and folding in CATALOG order.
//
// Properties pinned here:
//   (1) ZERO CARDS is a byte-for-byte identity with the class/CONFIG bases —
//       field for field, after the `equipment` record reshape and the
//       torpedo→heavyTorpedo / mine→navalMines rename;
//   (2) every ladder's authored step, from catalog-v3 §4;
//   (3) doctrine add-ons fold into the per-equipment verb booleans, and stack;
//   (4) the clamps: sweepRpm ≤ sweepRpmMax, the mine ring derivations,
//       gun.barrels 1..3, the spread-rung ladder;
//   (5) THE EQUIPMENT RELOAD STEP — −5 %/tier, additive, composed BEFORE the
//       global RELOAD ladder — as a table a reader can check against the sheet;
//   (6) THE FRACTIONAL FLOOR (catalog-v3 R17): integer fields accumulate as
//       floats through the fold and floor exactly once;
//   (7) every NON-STUB line moves the tree at its cap (no dead cards).

import { describe, it, expect } from 'vitest';
import {
  CATALOG,
  CONFIG,
  EQUIPMENT_IDS,
  LINE_IDS,
  SHIP_CLASS_IDS,
  broadsideMountSpread,
  broadsideTraverse,
  clampSpreadRung,
  effectiveStats,
  equipmentMaxAmmo,
  equipmentReloadMs,
  isStubLine,
  type Catalog,
  type EffectiveStats,
  type EquipmentId,
  type LineId,
} from '../index.js';

const BASE = CONFIG.shipClasses.battleship;

/** N copies of a line — the deck's stacking shape, as it rides the wire. */
const stack = (id: LineId, n: number): LineId[] => new Array<LineId>(n).fill(id);

/** Flatten an EffectiveStats tree into dotted-path -> scalar entries.
 *  BOOLEANS ARE LEAVES TOO — the doctrine verb flags live there, and a walker
 *  that skipped them would recurse INTO a boolean, find no entries, and
 *  silently report a verb card as a dead card. */
function flatten(stats: EffectiveStats): Map<string, number | string | boolean> {
  const out = new Map<string, number | string | boolean>();
  const walk = (node: Record<string, unknown>, prefix: string): void => {
    for (const [key, value] of Object.entries(node)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') out.set(path, value);
      else walk(value as Record<string, unknown>, path);
    }
  };
  walk(stats as unknown as Record<string, unknown>, '');
  return out;
}

/** The paths a build changed, sorted. */
const changed = (before: EffectiveStats, after: EffectiveStats): string[] => {
  const a = flatten(before);
  const b = flatten(after);
  return [...b.keys()].filter((k) => b.get(k) !== a.get(k)).sort();
};

describe('effectiveStats — ZERO-CARD identity (per class, the 8.1 equipment record)', () => {
  it.each(SHIP_CLASS_IDS.map((id) => [id] as const))('%s at zero cards equals its bases', (id) => {
    const cls = CONFIG.shipClasses[id];
    expect(effectiveStats(cls)).toEqual({
      kinematics: { ...cls.kinematics },
      maxHp: cls.hp,
      radarRange: CONFIG.vision.radar,
      sweepRpm: CONFIG.vision.sweepRpm,
      sweepPeriodMs: 60000 / CONFIG.vision.sweepRpm,
      sightRange: CONFIG.vision.sight,
      cooldownScale: 1, // the global cooldown lever is a true no-op at base
      equipment: {
        gun: {
          tier: 1, // the deck gun's tier I ships EQUIPPED (catalog-v3 §4)
          reloadMs: CONFIG.gun.reloadMs,
          maxAmmo: CONFIG.gun.maxAmmo,
          rangeU: CONFIG.vision.radar, // range = radar range (Eric 2026-07-21)
          damage: CONFIG.gun.damage,
          contactDamage: CONFIG.gun.contactDamage,
          burstRadius: CONFIG.gun.burstRadius,
          barrels: 1,
        },
        // The v3 SHIFT BOOST placeholder (Story 8.9): 10 s / 20 s from
        // catalog-v3 §4 `[D]`, a zero speed bonus because the sheet's "+25 % of
        // hull max speed" is proportional and this field is flat u/s.
        boost: { tier: 1, reloadMs: 20000, maxAmmo: 0, durationMs: 10000, speedBonus: 0 },
        lightTorpedo: { tier: 1, reloadMs: 25000, maxAmmo: 1, speed: 45, damage: 40, homing: false },
        // THE LEGACY RENAME — byte-identical to the shipped `torpedo` block.
        heavyTorpedo: {
          tier: 1,
          reloadMs: CONFIG.torpedo.reloadMs,
          maxAmmo: CONFIG.torpedo.maxAmmo,
          speed: CONFIG.torpedo.speed,
          damage: CONFIG.torpedo.damage,
          homing: false,
        },
        supercavTorpedo: { tier: 1, reloadMs: 45000, maxAmmo: 1, speed: 195, damage: 50, homing: false },
        // ...and byte-identical to the shipped `mine` block.
        navalMines: {
          tier: 1,
          reloadMs: CONFIG.mine.reloadMs,
          maxAmmo: CONFIG.mine.maxAmmo,
          maxLive: CONFIG.mine.maxLive,
          damage: CONFIG.mine.damage,
          blastRadius: CONFIG.mine.blastRadius,
          triggerRadius: CONFIG.mine.triggerRadius,
          propFouling: false,
          captive: false,
        },
        // The captive chassis derives 144u trip / 32u blast off the SAME
        // CONFIG.mine.blastRadius (catalog-v3 R25).
        captiveMines: {
          tier: 1,
          reloadMs: 20000,
          maxAmmo: 1,
          maxLive: CONFIG.mine.maxLive,
          damage: CONFIG.mine.damage,
          blastRadius: CONFIG.mine.blastRadius * CONFIG.mine.triggerFactor,
          triggerRadius: CONFIG.mine.blastRadius * CONFIG.mine.captiveTriggerFactor,
          propFouling: false,
          captive: true,
        },
        missile: { tier: 1, reloadMs: 30000, maxAmmo: 1, damage: 40, homing: false },
        machineGun: { tier: 1, reloadMs: 15000, maxAmmo: 1, damage: 4 },
        flak: { tier: 1, reloadMs: 8000, maxAmmo: 1, damage: 10 },
        monitor: { tier: 1, reloadMs: 50000, maxAmmo: 1, damage: 75 },
        broadside: {
          tier: 1,
          reloadMs: CONFIG.broadside.reloadMs,
          maxAmmo: CONFIG.broadside.maxAmmo,
          // THE 5/8 RUNG, not the horizon (Eric: "limited to 5/8"). 412.5u base.
          rangeU: CONFIG.vision.radar * CONFIG.vision.muzzleFlashFactor,
          damage: CONFIG.broadside.damage,
          burstRadius: CONFIG.broadside.burstRadius,
          turrets: CONFIG.broadside.turrets,
          spreadRung: 1,
          traverseRad: (CONFIG.broadside.traverseDeg[0] * Math.PI) / 180,
          mountSpreadRad: (CONFIG.broadside.turretMountSpreadDeg[0] * Math.PI) / 180,
        },
        starShells: {
          tier: 1,
          reloadMs: CONFIG.starShells.reloadMs,
          maxAmmo: CONFIG.starShells.maxAmmo,
          rangeU: CONFIG.vision.radar,
          litRadius: CONFIG.starShells.litRadius, // the ratified SIGHT/2 derivation
          litDurationMs: CONFIG.starShells.litDurationMs,
          phosphor: false,
          dazzle: false,
        },
        speedBoost: {
          tier: 1,
          reloadMs: CONFIG.speedBoost.reloadMs,
          maxAmmo: CONFIG.speedBoost.maxAmmo,
          durationMs: CONFIG.speedBoost.durationMs,
          speedBonus: CONFIG.speedBoost.speedBonus,
        },
        radarBuoy: {
          tier: 1,
          reloadMs: CONFIG.radarBuoy.reloadMs,
          maxAmmo: CONFIG.radarBuoy.maxAmmo,
          durationMs: CONFIG.radarBuoy.durationMs,
          radarRange: CONFIG.radarBuoy.radarRange,
          sweepRpm: CONFIG.radarBuoy.sweepRpm,
          hp: CONFIG.radarBuoy.hp,
          gunDamage: CONFIG.radarBuoy.gunDamage,
          gunReloadMs: CONFIG.radarBuoy.gunReloadMs,
          gun: false,
          jamming: false,
        },
      },
    });
  });

  it('the shipped numbers did not move in the rename: torpedo/mine bases are exactly as before', () => {
    const eq = effectiveStats(BASE).equipment;
    expect([eq.heavyTorpedo.reloadMs, eq.heavyTorpedo.speed, eq.heavyTorpedo.damage, eq.heavyTorpedo.maxAmmo])
      .toEqual([30000, 60, 50, 1]);
    expect([eq.navalMines.reloadMs, eq.navalMines.damage, eq.navalMines.blastRadius, eq.navalMines.triggerRadius])
      .toEqual([15000, 55, 48, 32]);
    // The captive chassis: 144u trip / 32u blast at base (catalog-v3 R25).
    expect([eq.captiveMines.triggerRadius, eq.captiveMines.blastRadius]).toEqual([144, 32]);
  });

  it('the equipment record is TOTAL over EquipmentId, every row at tier 1', () => {
    const eq = effectiveStats(BASE).equipment;
    expect(Object.keys(eq).sort()).toEqual([...EQUIPMENT_IDS].sort());
    for (const id of EQUIPMENT_IDS) expect(eq[id].tier, id).toBe(1);
  });

  it('the base radar sweep is 15 rpm = exactly 4000 ms per revolution', () => {
    const s = effectiveStats(BASE);
    expect(s.sweepRpm).toBe(15);
    expect(s.sweepPeriodMs).toBe(4000);
  });

  it('the signature is (cls, cards?): omitted and [] are byte-identical; junk ids fail closed', () => {
    expect(effectiveStats(BASE)).toEqual(effectiveStats(BASE, []));
    expect(effectiveStats(BASE, ['nope', 'constructor'])).toEqual(effectiveStats(BASE));
  });
});

describe('effectiveStats — the five universal ladders (catalog-v3 §4)', () => {
  it('ARMOR (R8): +25 max hp per tier, 4 tiers', () => {
    for (const n of [1, 2, 3, 4]) expect(effectiveStats(BASE, stack('armor', n)).maxHp).toBe(BASE.hp + 25 * n);
    expect(CATALOG.armor.cap).toBe(4);
    expect(effectiveStats(BASE, stack('armor', 4)).maxHp).toBe(450); // BS 350 -> 450
  });

  it('SPEED (R10): +2.5 u/s forward per tier — reverse deliberately untouched', () => {
    for (const n of [1, 2, 4]) {
      const s = effectiveStats(BASE, stack('speed', n));
      expect(s.kinematics.maxSpeed).toBeCloseTo(BASE.kinematics.maxSpeed + 2.5 * n, 9);
      expect(s.kinematics.reverseSpeed).toBe(BASE.kinematics.reverseSpeed);
      expect(s.kinematics.accel).toBe(BASE.kinematics.accel);
      expect(s.kinematics.turnRate).toBe(BASE.kinematics.turnRate);
    }
    expect(effectiveStats(BASE, stack('speed', 4)).kinematics.maxSpeed).toBe(45); // BS 35 -> 45
  });

  it('TURNING (R6, [DRAFT]): flat +0.05 rad/s per tier — +0.2 at the cap on every hull', () => {
    for (const id of SHIP_CLASS_IDS) {
      const cls = CONFIG.shipClasses[id];
      const s = effectiveStats(cls, stack('turning', 4));
      expect(s.kinematics.turnRate, id).toBeCloseTo(cls.kinematics.turnRate + 0.2, 9);
    }
    expect(effectiveStats(BASE, stack('turning', 4)).kinematics.turnRate).toBeCloseTo(0.6, 9); // BS 0.4 -> 0.6
  });

  it('RADAR SWEEP (R11): +3 rpm per tier, 15 -> 30 at the 5-copy cap, and the clamp holds', () => {
    expect(CONFIG.vision.sweepRpmMax).toBe(30);
    const capped = effectiveStats(BASE, stack('radarSweep', 5));
    expect(capped.sweepRpm).toBe(30);
    expect(capped.sweepPeriodMs).toBe(2000);
    // Past the physical copy cap (test-only over-stack): still clamped, never NaN.
    const over = effectiveStats(BASE, stack('radarSweep', 20));
    expect(over.sweepRpm).toBe(30);
    expect(over.sweepPeriodMs).toBe(2000);
  });

  it('RELOAD (R12): −0.05 cooldownScale per tier, ADDITIVE, EXACTLY 0.75 at the cap', () => {
    expect(CATALOG.reload.cap).toBe(5);
    const table = [1, 0.95, 0.9, 0.85, 0.8, 0.75];
    table.forEach((scale, n) => {
      // STRICT equality: additive folding accumulates float dust
      // (1 − 0.05×5 === 0.7500000000000001), and clampStats rounds to 3
      // decimals BEFORE the multiplies precisely so this is exact.
      expect(effectiveStats(BASE, stack('reload', n)).cooldownScale, `${n} copies`).toBe(scale);
    });
    // ANTI-MULTIPLICATIVE PIN: 0.95^5 = 0.7737… is NOT the ruling.
    expect(effectiveStats(BASE, stack('reload', 5)).cooldownScale).not.toBeCloseTo(0.95 ** 5, 3);
  });

  it('RELOAD scales EVERY equipment reload, once, post-fold', () => {
    const base = effectiveStats(BASE);
    const capped = effectiveStats(BASE, stack('reload', 5));
    for (const id of EQUIPMENT_IDS) {
      expect(capped.equipment[id].reloadMs, id).toBeCloseTo(base.equipment[id].reloadMs * 0.75, 9);
    }
    // R40: the Shift boost cooldown is in scope — 20 s -> 15 s at the cap
    // (catalog-v3 §4's own arithmetic).
    expect(capped.equipment.boost.reloadMs).toBe(15000);
    expect(capped.equipment.gun.reloadMs).toBe(3750);
  });

  it('RELOAD moves ONLY the scale and the reloads (flatten diff)', () => {
    const paths = changed(effectiveStats(BASE), effectiveStats(BASE, stack('reload', 5)));
    expect(paths).toEqual(['cooldownScale', ...EQUIPMENT_IDS.map((id) => `equipment.${id}.reloadMs`)].sort());
  });

  it('OVER-STACK (defensive, unreachable through a deck): floored at 0.1, never zero or non-finite', () => {
    const many: LineId[] = [];
    for (let i = 0; i < 12; i += 1) many.push('reload');
    // The catalog CAP is enforced by the fold itself, so an over-stacked list
    // lands on the cap rather than running past it — the floor below is the
    // guard for effect data that never came from CATALOG at all.
    expect(effectiveStats(BASE, many).cooldownScale).toBe(0.75);
    const rogue: Catalog = {
      reload: { id: 'reload' as LineId, kind: 'ladder', cap: 30, tiers: new Array(30).fill([{ kind: 'stat', path: 'cooldownScale', add: -0.1 }]) },
    };
    const s = effectiveStats(BASE, new Array<string>(30).fill('reload'), rogue);
    expect(s.cooldownScale).toBe(0.1);
    expect(s.equipment.gun.reloadMs).toBeCloseTo(CONFIG.gun.reloadMs * 0.1, 9);
  });
});

describe('effectiveStats — the deck-gun family (catalog-v3 §4)', () => {
  it('DECK GUN (R14): +1.25 damage per tier — 15 -> 16.25 -> 17.5 -> 18.75 -> 20', () => {
    const damage = [15, 16.25, 17.5, 18.75, 20];
    damage.forEach((d, n) => {
      expect(effectiveStats(BASE, stack('deckGun', n)).equipment.gun.damage, `${n} copies`).toBeCloseTo(d, 9);
    });
    expect(CATALOG.deckGun.cap).toBe(4);
  });

  it('DECK GUN TURRET (R15): the gun pool 1 -> 2, one copy', () => {
    expect(effectiveStats(BASE).equipment.gun.maxAmmo).toBe(1);
    expect(effectiveStats(BASE, stack('deckGunTurret', 1)).equipment.gun.maxAmmo).toBe(2);
    expect(CATALOG.deckGunTurret.cap).toBe(1);
  });

  it('DECK GUN BARREL (R16): +1 barrel per copy, 1 -> 2 -> 3', () => {
    expect(effectiveStats(BASE, stack('deckGunBarrel', 1)).equipment.gun.barrels).toBe(2);
    expect(effectiveStats(BASE, stack('deckGunBarrel', 2)).equipment.gun.barrels).toBe(3);
    expect(CATALOG.deckGunBarrel.cap).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// THE EQUIPMENT RELOAD STEP — catalog-v3 §3's STANDING RULE, §4's conventions.
// −5 % of the weapon's OWN base per tier, additive five-point steps, composed
// BEFORE the global RELOAD ladder. ONE formula covers the deck gun and every
// equipment line, because `equipment.gun.tier` counts `1 + deckGun copies`
// (tier I ships equipped) while an equipment line's tier IS its copies held
// (copy 1 IS tier I). See sim/stats.ts reloadTierScale.
// ---------------------------------------------------------------------------
describe('THE EQUIPMENT RELOAD STEP (catalog-v3 §3 standing rule)', () => {
  it('the deck gun reads ×1.00 at ZERO copies and ×0.80 at FOUR — the §4 "80 % (4 s)" cell', () => {
    const table: [number, number, number][] = [
      // copies, tier, reloadMs (base 5000 ms)
      [0, 1, 5000],
      [1, 2, 4750],
      [2, 3, 4500],
      [3, 4, 4250],
      [4, 5, 4000],
    ];
    for (const [copies, tier, reloadMs] of table) {
      const gun = effectiveStats(BASE, stack('deckGun', copies)).equipment.gun;
      expect(gun.tier, `${copies} copies: tier`).toBe(tier);
      expect(gun.reloadMs, `${copies} copies: reloadMs`).toBe(reloadMs);
    }
  });

  it('an equipment line reads ×1.00 at copy 1 (the bare weapon) and ×0.80 at copy 5', () => {
    const table: [number, number, number][] = [
      // copies, tier, reloadMs (heavy torpedo base 30000 ms)
      [0, 1, 30000],
      [1, 1, 30000],
      [2, 2, 28500],
      [3, 3, 27000],
      [4, 4, 25500],
      [5, 5, 24000], // catalog-v3 §4 HEAVY TORPEDO tier V: "24 s"
    ];
    for (const [copies, tier, reloadMs] of table) {
      const t = effectiveStats(BASE, stack('heavyTorpedo', copies)).equipment.heavyTorpedo;
      expect(t.tier, `${copies} copies: tier`).toBe(tier);
      expect(t.reloadMs, `${copies} copies: reloadMs`).toBe(reloadMs);
    }
  });

  it('the two ladders COMPOSE: a maxed deck gun under a maxed Reload runs at 0.80 × 0.75 = 60 %', () => {
    const cards = [...stack('deckGun', 4), ...stack('reload', 5)];
    const s = effectiveStats(BASE, cards);
    expect(s.equipment.gun.reloadMs).toBe(CONFIG.gun.reloadMs * 0.6);
    expect(s.equipment.gun.reloadMs).toBe(3000); // §4: "80 % (4 s; 3 s under max Reload)"
  });

  it('a line with no tier target moves no tier at all (an add-on is not a rung)', () => {
    const s = effectiveStats(BASE, ['acousticHoming', 'phosphorShells']);
    for (const id of EQUIPMENT_IDS) expect(s.equipment[id].tier, id).toBe(1);
  });
});

describe('THE FRACTIONAL FLOOR (catalog-v3 R17 standing rule)', () => {
  it('a +0.5 integer step shows nothing alone and a whole barrel when it completes', () => {
    // A TEST-ONLY line: no production line steps fractionally yet (8.13–8.16
    // author the +0.5 tube/turret/flare steps the rule exists for).
    const half: Catalog = {
      halfBarrel: {
        id: 'deckGunBarrel' as LineId,
        kind: 'ladder',
        cap: 4,
        tiers: new Array(4).fill([{ kind: 'stat', path: 'equipment.gun.barrels', add: 0.5 }]),
      },
    };
    const barrels = (n: number): number =>
      effectiveStats(BASE, new Array<string>(n).fill('halfBarrel'), half).equipment.gun.barrels;
    expect(barrels(0)).toBe(1);
    expect(barrels(1)).toBe(1); // 1.5 accumulated, floors to 1 — nothing appears
    expect(barrels(2)).toBe(2); // the fraction completes a whole
    expect(barrels(3)).toBe(2);
    expect(barrels(4)).toBe(3);
  });

  it('gun.barrels is clamped to 1..3 after the floor (untyped over/under-stack data)', () => {
    const rogue = (over: { add?: number; mult?: number }): Catalog => ({
      x: { id: 'x' as unknown as LineId, kind: 'ladder', cap: 1, tiers: [[{ kind: 'stat', path: 'equipment.gun.barrels', ...over }]] },
    });
    expect(effectiveStats(BASE, ['x'], rogue({ add: 10 })).equipment.gun.barrels).toBe(3);
    // A sub-1 fold survives the positive-scalar gate but the clamp floors it to 1.
    expect(effectiveStats(BASE, ['x'], rogue({ mult: 0.1 })).equipment.gun.barrels).toBe(1);
  });
});

describe('effectiveStats — doctrine verb folds (the five add-ons)', () => {
  it('every verb is false at base; each add-on sets exactly its own', () => {
    const eq = effectiveStats(BASE).equipment;
    expect([eq.lightTorpedo.homing, eq.heavyTorpedo.homing, eq.navalMines.propFouling, eq.missile.homing,
      eq.starShells.phosphor, eq.starShells.dazzle]).toEqual([false, false, false, false, false, false]);
    // ACOUSTIC HOMING (R22) homes BOTH torpedoes with one card — and never the
    // supercavitating straight-runner.
    const homing = effectiveStats(BASE, ['acousticHoming']).equipment;
    expect([homing.lightTorpedo.homing, homing.heavyTorpedo.homing, homing.supercavTorpedo.homing])
      .toEqual([true, true, false]);
    expect(effectiveStats(BASE, ['foulingMines']).equipment.navalMines.propFouling).toBe(true);
    expect(effectiveStats(BASE, ['heatSeeking']).equipment.missile.homing).toBe(true);
    expect(effectiveStats(BASE, ['dazzleShells']).equipment.starShells.dazzle).toBe(true);
    expect(effectiveStats(BASE, ['phosphorShells']).equipment.starShells.phosphor).toBe(true);
  });

  it('FOULING MINES is naval mines ONLY — the captive fish does not foul (R28)', () => {
    const eq = effectiveStats(BASE, ['foulingMines']).equipment;
    expect([eq.navalMines.propFouling, eq.captiveMines.propFouling]).toEqual([true, false]);
  });

  it('VERBS STACK: dazzle and phosphor compose on one flare, in either pick order (R33)', () => {
    for (const order of [['dazzleShells', 'phosphorShells'], ['phosphorShells', 'dazzleShells']] as LineId[][]) {
      const eq = effectiveStats(BASE, order).equipment.starShells;
      expect([eq.phosphor, eq.dazzle]).toEqual([true, true]);
    }
  });

  it('an add-on moves ONLY its own verb flags (flatten diff)', () => {
    expect(changed(effectiveStats(BASE), effectiveStats(BASE, ['dazzleShells'])))
      .toEqual(['equipment.starShells.dazzle']);
    expect(changed(effectiveStats(BASE), effectiveStats(BASE, ['acousticHoming'])))
      .toEqual(['equipment.heavyTorpedo.homing', 'equipment.lightTorpedo.homing']);
  });

  it('an unknown doctrine weapon/verb in an untyped line is a fail-closed no-op', () => {
    const rogue: Catalog = {
      x: {
        id: 'x' as unknown as LineId,
        kind: 'addon',
        cap: 1,
        tiers: [[
          { kind: 'doctrine', weapon: 'gun', mode: 'arcing' }, // the gun carries no doctrine state
          { kind: 'doctrine', weapon: 'cannon' as EquipmentId, mode: 'ap' }, // the DELETED weapon
          { kind: 'doctrine', weapon: 'navalMines', mode: 'captive' }, // now the captive LINE, not a verb
          { kind: 'doctrine', weapon: 'radarBuoy', mode: 'jamming' }, // deleted with the buoy (R1)
          { kind: 'doctrine', weapon: 'starShells', mode: 'litRadius' }, // a real field, NOT a verb
        ]],
      },
    };
    expect(effectiveStats(BASE, ['x'], rogue)).toEqual(effectiveStats(BASE));
  });
});

describe('effectiveStats — derived ranges and rings', () => {
  it('gun/starShells rangeU IS radarRange; the broadside is the 5/8 rung; nothing writes radarRange', () => {
    const s = effectiveStats(BASE);
    expect(s.radarRange).toBe(CONFIG.vision.radar);
    expect(s.equipment.gun.rangeU).toBe(s.radarRange);
    expect(s.equipment.starShells.rangeU).toBe(s.radarRange);
    expect(s.equipment.broadside.rangeU).toBeCloseTo(412.5, 9);
    expect(s.equipment.broadside.rangeU).toBeLessThan(s.radarRange);
    const writers = LINE_IDS.filter((id) =>
      CATALOG[id].tiers.some((t) => t.some((e) => e.kind === 'stat' && e.path === 'radarRange')),
    );
    expect(writers).toEqual([]);
  });

  it('sightRange is DERIVED as radarRange/2, never stat-addressable', () => {
    const s = effectiveStats(BASE);
    expect(s.sightRange).toBeCloseTo(s.radarRange / 2, 9);
    expect(s.sightRange).toBe(CONFIG.vision.sight); // radar IS SIGHT*2
  });

  it('the eighths ladder ordering holds by ARITHMETIC off the one number', () => {
    const s = effectiveStats(BASE);
    const detect = s.sightRange * CONFIG.vision.detectFactor;
    const muzzle = s.radarRange * CONFIG.vision.muzzleFlashFactor;
    const farRadar = s.radarRange * 0.875;
    expect(detect).toBeLessThan(s.sightRange);
    expect(s.sightRange).toBeLessThan(muzzle);
    expect(muzzle).toBeLessThan(farRadar);
    expect(farRadar).toBeLessThan(s.radarRange);
  });

  it('a mine trip ring is DERIVED from its blast radius, on BOTH chassis', () => {
    const eq = effectiveStats(BASE).equipment;
    expect(eq.navalMines.triggerRadius).toBe(CONFIG.mine.triggerRadius); // 48 × 2/3 = 32 exactly
    expect(eq.navalMines.triggerRadius).toBeLessThan(eq.navalMines.blastRadius);
    // The captive swaps them: the trip ring is the LARGER of the two.
    expect(eq.captiveMines.triggerRadius).toBeGreaterThan(eq.captiveMines.blastRadius);
  });

  it('the SPREAD rung drives both authored arc ladders, clamps, and never NaNs', () => {
    const base = effectiveStats(BASE);
    expect(base.equipment.broadside.spreadRung).toBe(1);
    const top = CONFIG.broadside.traverseDeg.length;
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(clampSpreadRung(bad), `${bad}`).toBe(1);
      expect(Number.isFinite(broadsideTraverse(bad)), `traverse ${bad}`).toBe(true);
      expect(Number.isFinite(broadsideMountSpread(bad)), `mounts ${bad}`).toBe(true);
    }
    expect(CONFIG.broadside.turretMountSpreadDeg).toHaveLength(top);
    // The rung walks BOTH ladders in OPPOSITE directions (Eric 2026-08-27) —
    // NO v3 line writes it this cycle (the broadside's tiers II–V are Story
    // 8.16's), so drive it through an injected catalog.
    const spread: Catalog = {
      s: { id: 's' as unknown as LineId, kind: 'ladder', cap: 4, tiers: new Array(4).fill([{ kind: 'stat', path: 'equipment.broadside.spreadRung', add: 1 }]) },
    };
    for (let n = 0; n <= 4; n += 1) {
      const s = effectiveStats(BASE, new Array<string>(n).fill('s'), spread).equipment.broadside;
      expect(s.spreadRung, `${n}`).toBe(n + 1);
      expect(s.traverseRad, `${n}`).toBeCloseTo((CONFIG.broadside.traverseDeg[n] * Math.PI) / 180, 12);
      expect(s.mountSpreadRad, `${n}`).toBeCloseTo((CONFIG.broadside.turretMountSpreadDeg[n] * Math.PI) / 180, 12);
    }
    const over = effectiveStats(BASE, new Array<string>(4).fill('s'), spread).equipment.broadside;
    expect(over.traverseRad).toBeGreaterThan(base.equipment.broadside.traverseRad);
    expect(over.mountSpreadRad).toBeLessThan(base.equipment.broadside.mountSpreadRad);
  });
});

describe('effectiveStats — every NON-STUB line folds (no dead cards)', () => {
  it('each non-stub line, held at its cap, moves the stats tree', () => {
    const identity = effectiveStats(BASE);
    for (const id of LINE_IDS) {
      if (isStubLine(id)) continue;
      const folded = effectiveStats(BASE, stack(id, CATALOG[id].cap));
      expect(changed(identity, folded), id).not.toEqual([]);
    }
  });

  it('an equipment line at copy 1 is the bare weapon: it FITS and moves no number', () => {
    // Copy 1 of an equipment line carries `slotFill` alone, so the stat tree is
    // byte-identical — the fit shows up in the LOADOUT (sim/boons.ts), not here.
    for (const id of ['heavyTorpedo', 'navalMines', 'broadside', 'starShells'] as const) {
      expect(effectiveStats(BASE, [id]), id).toEqual(effectiveStats(BASE));
    }
  });

  it('a STUB line forced in (never dealt) moves only its own row — no crash, no leak', () => {
    const identity = effectiveStats(BASE);
    expect(effectiveStats(BASE, ['machineGun'])).toEqual(identity);
    expect(changed(identity, effectiveStats(BASE, stack('machineGun', 5))))
      .toEqual(['equipment.machineGun.reloadMs', 'equipment.machineGun.tier']);
  });

  it('a consumable is a pure `stock` line: it never moves a derived number', () => {
    for (const id of ['hullRepair', 'shieldBlock', 'smokeScreen', 'chaff', 'decoyBuoy'] as const) {
      expect(effectiveStats(BASE, stack(id, 5)), id).toEqual(effectiveStats(BASE));
    }
  });
});

describe('equipment helpers', () => {
  it('equipmentMaxAmmo / equipmentReloadMs are lookups into the total record', () => {
    const s = effectiveStats(BASE, stack('reload', 1));
    for (const id of EQUIPMENT_IDS) {
      expect(equipmentMaxAmmo(s, id), id).toBe(s.equipment[id].maxAmmo);
      expect(equipmentReloadMs(s, id), id).toBe(s.equipment[id].reloadMs);
    }
    // ONE RELOAD copy scales EVERY lookup, not just one weapon's.
    expect(equipmentReloadMs(s, 'navalMines')).toBeCloseTo(CONFIG.mine.reloadMs * 0.95, 9);
    expect(equipmentReloadMs(s, 'gun')).toBeCloseTo(CONFIG.gun.reloadMs * 0.95, 9);
  });

  it('the legacy upgrade vocabulary is GONE: no CONFIG.upgrades block survives', () => {
    expect('upgrades' in CONFIG).toBe(false);
  });

  it('the tick-count consequence: a reload must land on a whole 50 ms tick boundary', () => {
    // Inlined ammo.ts loop shape (server/src/game/equipment/ammo.ts) — do not
    // import server code into a shared test. Float dust in the scale would cost
    // a whole extra tick; clampStats' round3 is what prevents it.
    const ticksToRefill = (reloadMs: number): number => {
      let left = reloadMs;
      let n = 0;
      while (left > 0) {
        left -= 50;
        n += 1;
      }
      return n;
    };
    const capped = effectiveStats(BASE, stack('reload', 5));
    expect(capped.equipment.gun.reloadMs).toBe(3750);
    expect(ticksToRefill(capped.equipment.gun.reloadMs)).toBe(75);
    expect(ticksToRefill(capped.equipment.broadside.reloadMs)).toBe(270); // 13500 ms
  });
});
