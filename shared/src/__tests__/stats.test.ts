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
        // THE SHIFT BOOST (Story 8.9, epic-8 amendments 54–55): live equipment
        // in slot 1 on every captain hull, `CONFIG.boost` verbatim. NO speed
        // field — the bonus is `CONFIG.boost.factor × kinematics.maxSpeed`,
        // layered per tick by sim/boost.ts and never folded in here.
        boost: {
          tier: 1,
          reloadMs: CONFIG.boost.reloadMs,
          maxAmmo: CONFIG.boost.maxAmmo,
          durationMs: CONFIG.boost.durationMs,
        },
        // LIGHT TORPEDO (R18) — its own CONFIG block since Story 8.13.
        // `homingTurnRate` REPLACED the `homing` boolean: homing is a TIER
        // STAT now (epic-8 amendment 80) and tier I is a straight-runner.
        lightTorpedo: {
          tier: 1,
          reloadMs: CONFIG.lightTorpedo.reloadMs,
          maxAmmo: CONFIG.lightTorpedo.maxAmmo,
          speed: CONFIG.lightTorpedo.speed,
          damage: CONFIG.lightTorpedo.damage,
          homingTurnRate: 0,
        },
        // THE LEGACY RENAME — byte-identical to the shipped `torpedo` block.
        heavyTorpedo: {
          tier: 1,
          reloadMs: CONFIG.torpedo.reloadMs,
          maxAmmo: CONFIG.torpedo.maxAmmo,
          speed: CONFIG.torpedo.speed,
          damage: CONFIG.torpedo.damage,
          homingTurnRate: 0,
        },
        // `supercavTorpedo` HAS NO ROW AT ALL (amendment 74): it is a
        // consumable now, and a consumable has no stats row, no reload and no
        // tier. Its absence is pinned by the TOTALITY test below.
        // ...and byte-identical to the shipped `mine` block. It NO LONGER
        // FOULS (amendment 81), so its slowFactor is the inert 1.
        navalMines: {
          tier: 1,
          reloadMs: CONFIG.mine.reloadMs,
          maxAmmo: CONFIG.mine.maxAmmo,
          damage: CONFIG.mine.damage,
          blastRadius: CONFIG.mine.blastRadius,
          triggerRadius: CONFIG.mine.triggerRadius,
          homingTurnRate: 0,
          slowFactor: 1,
        },
        // CAPTIVE MINES has its OWN ring pair now (amendment 84d): 144u trip
        // ring, 32u fixed burst — no longer a transform of CONFIG.mine.
        captiveMines: {
          tier: 1,
          reloadMs: CONFIG.captiveMines.reloadMs,
          maxAmmo: CONFIG.captiveMines.maxAmmo,
          damage: CONFIG.captiveMines.damage,
          blastRadius: CONFIG.captiveMines.blastRadius,
          triggerRadius: CONFIG.captiveMines.triggerRadius,
          homingTurnRate: 0,
          slowFactor: 1,
        },
        // FOULING MINES (amendment 81) — its own equipment line since 8.13.
        foulingMines: {
          tier: 1,
          reloadMs: CONFIG.foulingMines.reloadMs,
          maxAmmo: CONFIG.foulingMines.maxAmmo,
          damage: CONFIG.foulingMines.damage,
          blastRadius: CONFIG.foulingMines.blastRadius,
          triggerRadius: CONFIG.foulingMines.blastRadius * CONFIG.mine.triggerFactor,
          homingTurnRate: 0,
          slowFactor: CONFIG.foulingMines.slowFactor,
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

  it('the shipped numbers did not move in the rename except speed (catalog-v3 R17, Eric 2026-09-15): torpedo/mine bases', () => {
    const eq = effectiveStats(BASE).equipment;
    expect([eq.heavyTorpedo.reloadMs, eq.heavyTorpedo.speed, eq.heavyTorpedo.damage, eq.heavyTorpedo.maxAmmo])
      .toEqual([30000, 65, 50, 1]);
    expect([eq.navalMines.reloadMs, eq.navalMines.damage, eq.navalMines.blastRadius, eq.navalMines.triggerRadius])
      .toEqual([15000, 55, 48, 32]);
    // The captive rings: 144u trip / 32u blast at base (catalog-v3 R25) — now
    // its OWN CONFIG pair rather than a transform (amendment 84d).
    expect([eq.captiveMines.triggerRadius, eq.captiveMines.blastRadius]).toEqual([144, 32]);
  });

  it('the STORY 8.13 tier-I rows come from their own CONFIG blocks, not STUB_ROWS', () => {
    const eq = effectiveStats(BASE).equipment;
    // LIGHT TORPEDO (R18): 45 u/s, 40 dmg, 1 tube, 25 s, straight-running.
    expect([eq.lightTorpedo.speed, eq.lightTorpedo.damage, eq.lightTorpedo.maxAmmo, eq.lightTorpedo.reloadMs])
      .toEqual([45, 40, 1, 25000]);
    expect(eq.lightTorpedo.homingTurnRate).toBe(0);
    expect(eq.heavyTorpedo.homingTurnRate).toBe(0);
    // CAPTIVE MINES (R25, amendment 77): 1 held on a 20 s clock, 55 dmg.
    expect([eq.captiveMines.maxAmmo, eq.captiveMines.reloadMs, eq.captiveMines.damage]).toEqual([1, 20000, 55]);
    expect(eq.captiveMines.homingTurnRate).toBe(0);
    // FOULING MINES (amendment 81): 10 dmg, 72 u blast, 48 u trip, 2 held,
    // 15 s, ×0.75 victim slow.
    expect([eq.foulingMines.damage, eq.foulingMines.blastRadius, eq.foulingMines.maxAmmo, eq.foulingMines.reloadMs])
      .toEqual([10, 72, 2, 15000]);
    expect(eq.foulingMines.triggerRadius).toBeCloseTo(48, 9);
    expect(eq.foulingMines.slowFactor).toBe(0.75);
    // The inert identities on the rows that do not own the field.
    expect([eq.navalMines.slowFactor, eq.captiveMines.slowFactor]).toEqual([1, 1]);
    expect([eq.navalMines.homingTurnRate, eq.foulingMines.homingTurnRate]).toEqual([0, 0]);
  });

  it('SUPERCAV TORPEDO has NO stat row — it is a consumable (amendment 74)', () => {
    const eq = effectiveStats(BASE).equipment as unknown as Record<string, unknown>;
    expect(eq.supercavTorpedo).toBeUndefined();
    expect([...EQUIPMENT_IDS]).not.toContain('supercavTorpedo');
    expect([...EQUIPMENT_IDS]).toContain('foulingMines');
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
    // R40: the Shift boost cooldown is in scope — 25 s -> 18.75 s at the cap.
    // Story 8.9 (epic-8 amendment 54) authored the reload at 25 s, superseding
    // the 20 s / 15 s pair catalog-v3 §4 quotes.
    expect(capped.equipment.boost.reloadMs).toBe(18750);
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
  it('DECK GUN (R14, amendment 39): +1.25 per tier FLOORED — 15 -> 16 -> 17 -> 18 -> 20, never a fraction', () => {
    const damage = [15, 16, 17, 18, 20];
    damage.forEach((d, n) => {
      const got = effectiveStats(BASE, stack('deckGun', n)).equipment.gun.damage;
      expect(got, `${n} copies`).toBe(d);
      expect(Number.isInteger(got), `${n} copies is a whole number`).toBe(true);
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
// THE FIVE TORPEDO / MINE LADDERS (Story 8.13 — catalog-v3 §4 as amended by
// Eric's 2026-09-19 rulings, epic-8 amendments 74/77/80/81/82/84d). Pinned as
// TABLES against the spec's I/O matrix, rung by rung, so a reader can check
// them against the sheet without running the fold in their head.
//
// THREE THINGS ARE DERIVED, NOT AUTHORED, and are pinned here as such:
//   - the −5 %/tier reload step (sim/stats.ts reloadTierScale);
//   - the +0.5 pool steps, which accumulate as floats and FLOOR ONCE
//     (catalog-v3 R17) — 1, 1, 2, 2, 3 across the five rungs;
//   - the CAPTIVE mine's trip ring, which steps ×1.1 off the ROW'S TIER while
//     its 32 u burst never moves (amendment 84d).
// ---------------------------------------------------------------------------
describe('STORY 8.13 — the torpedo ladders (amendments 80/84f)', () => {
  it.each([
    // line, [damage, speed, tubes, reloadMs, homingTurnRate] per rung 1..5
    ['lightTorpedo', [
      [40, 45, 1, 25000, 0],
      [45, 47.5, 1, 23750, 0.125],
      [50, 50, 2, 22500, 0.25],
      [55, 52.5, 2, 21250, 0.375],
      [60, 55, 3, 20000, 0.5],
    ]],
    ['heavyTorpedo', [
      [50, 65, 1, 30000, 0],
      [55, 67.5, 1, 28500, 0.125],
      [60, 70, 2, 27000, 0.25],
      [65, 72.5, 2, 25500, 0.375],
      [70, 75, 3, 24000, 0.5],
    ]],
  ] as const)('%s: +5 dmg, +2.5 u/s, +0.5 tubes, +0.125 rad/s per tier', (id, table) => {
    table.forEach(([damage, speed, tubes, reloadMs, turn], i) => {
      const row = effectiveStats(BASE, stack(id, i + 1)).equipment[id];
      expect(row.tier, `${id} x${i + 1}: tier`).toBe(i + 1);
      expect(row.damage, `${id} x${i + 1}: damage`).toBe(damage);
      expect(row.speed, `${id} x${i + 1}: speed`).toBeCloseTo(speed, 9);
      expect(row.maxAmmo, `${id} x${i + 1}: tubes`).toBe(tubes);
      expect(row.reloadMs, `${id} x${i + 1}: reloadMs`).toBeCloseTo(reloadMs, 6);
      expect(row.homingTurnRate, `${id} x${i + 1}: turnRate`).toBeCloseTo(turn, 9);
    });
  });

  it('tier I is a STRAIGHT-RUNNER on both lines — turn rate 0, and 0.5 rad/s at V', () => {
    for (const id of ['lightTorpedo', 'heavyTorpedo'] as const) {
      expect(effectiveStats(BASE, stack(id, 1)).equipment[id].homingTurnRate, id).toBe(0);
      expect(effectiveStats(BASE, stack(id, 5)).equipment[id].homingTurnRate, id)
        .toBeCloseTo(CONFIG.torpedo.homingTurnRate, 9);
    }
  });
});

describe('STORY 8.13 — the three mine ladders (amendments 77/81/82/84d)', () => {
  it('NAVAL MINES: +5 dmg, x1.1 blast (trip ring follows at 2/3), +1 held', () => {
    const table: [number, number, number, number][] = [
      // damage, blastRadius, held, reloadMs
      [55, 48, 2, 15000],
      [60, 52.8, 3, 14250],
      [65, 58.08, 4, 13500],
      [70, 63.888, 5, 12750],
      [75, 70.2768, 6, 12000],
    ];
    table.forEach(([damage, blast, held, reloadMs], i) => {
      const row = effectiveStats(BASE, stack('navalMines', i + 1)).equipment.navalMines;
      expect(row.damage, `x${i + 1}: damage`).toBe(damage);
      expect(row.blastRadius, `x${i + 1}: blast`).toBeCloseTo(blast, 6);
      expect(row.triggerRadius, `x${i + 1}: trip`).toBeCloseTo(blast * CONFIG.mine.triggerFactor, 6);
      expect(row.maxAmmo, `x${i + 1}: held`).toBe(held);
      expect(row.reloadMs, `x${i + 1}: reloadMs`).toBeCloseTo(reloadMs, 6);
      // A naval mine NEVER fouls now (amendment 81) — at any tier.
      expect(row.slowFactor, `x${i + 1}: slow`).toBe(1);
    });
  });

  it('CAPTIVE MINES: +5 fish dmg, +0.5 held, +0.075 rad/s — and a TIER-DRIVEN trip ring on a FIXED 32u burst', () => {
    const table: [number, number, number, number, number][] = [
      // fish damage, held, reloadMs, homingTurnRate, triggerRadius
      [55, 1, 20000, 0, 144],
      [60, 1, 19000, 0.075, 158.4],
      [65, 2, 18000, 0.15, 174.24],
      [70, 2, 17000, 0.225, 191.664],
      [75, 3, 16000, 0.3, 210.8304],
    ];
    table.forEach(([damage, held, reloadMs, turn, trip], i) => {
      const row = effectiveStats(BASE, stack('captiveMines', i + 1)).equipment.captiveMines;
      expect(row.damage, `x${i + 1}: damage`).toBe(damage);
      expect(row.maxAmmo, `x${i + 1}: held`).toBe(held);
      expect(row.reloadMs, `x${i + 1}: reloadMs`).toBeCloseTo(reloadMs, 6);
      expect(row.homingTurnRate, `x${i + 1}: turnRate`).toBeCloseTo(turn, 9);
      expect(row.triggerRadius, `x${i + 1}: trip`).toBeCloseTo(trip, 4);
      // THE BURST NEVER STEPS: the line grows the reach of the trap, not the
      // size of the bang (amendment 84d).
      expect(row.blastRadius, `x${i + 1}: blast`).toBe(32);
    });
    // The matrix's headline number.
    expect(effectiveStats(BASE, stack('captiveMines', 5)).equipment.captiveMines.triggerRadius)
      .toBeCloseTo(210.8, 1);
  });

  it('FOULING MINES: x1.1 blast (trip follows), +1 held, -0.05 slow — damage and duration FIXED', () => {
    const table: [number, number, number, number][] = [
      // blastRadius, held, reloadMs, slowFactor
      [72, 2, 15000, 0.75],
      [79.2, 3, 14250, 0.7],
      [87.12, 4, 13500, 0.65],
      [95.832, 5, 12750, 0.6],
      [105.4152, 6, 12000, 0.55],
    ];
    table.forEach(([blast, held, reloadMs, slow], i) => {
      const row = effectiveStats(BASE, stack('foulingMines', i + 1)).equipment.foulingMines;
      expect(row.blastRadius, `x${i + 1}: blast`).toBeCloseTo(blast, 6);
      expect(row.triggerRadius, `x${i + 1}: trip`).toBeCloseTo(blast * CONFIG.mine.triggerFactor, 6);
      expect(row.maxAmmo, `x${i + 1}: held`).toBe(held);
      expect(row.reloadMs, `x${i + 1}: reloadMs`).toBeCloseTo(reloadMs, 6);
      expect(row.slowFactor, `x${i + 1}: slow`).toBeCloseTo(slow, 9);
      // DAMAGE IS FIXED AT 10 (amendment 81): "minimal damage" is the point.
      expect(row.damage, `x${i + 1}: damage`).toBe(10);
    });
    // ...and so is the 5 s window — only the DEPTH of the slow tiers up.
    expect(CONFIG.foulingMines.slowDurationMs).toBe(5000);
  });

  it('THE POOL FLOOR, on the three +0.5 lines: 1, 1, 2, 2, 3 (catalog-v3 R17)', () => {
    for (const id of ['lightTorpedo', 'heavyTorpedo', 'captiveMines'] as const) {
      const pools = [1, 2, 3, 4, 5].map((n) => effectiveStats(BASE, stack(id, n)).equipment[id].maxAmmo);
      expect(pools, id).toEqual([1, 1, 2, 2, 3]);
    }
  });
});

// ---------------------------------------------------------------------------
// WHOLE-NUMBER DAMAGE, EVERY LINE, EVERY TIER (Eric ruling 2026-09-17, epic-8
// amendment 39: *a shell NEVER deals a fractional hit point*). The floor is
// `EQUIPMENT_INT_FIELDS` in sim/stats.ts clampStats, applied ONCE after the
// fold; this is the catalog-wide sweep that proves it, so a future line
// authoring a fractional damage step is caught the day it lands.
// ---------------------------------------------------------------------------
describe('THE WHOLE-NUMBER DAMAGE LAW (amendment 39), swept over the catalog', () => {
  it('every damage field is an integer at every rung of every line, on every hull', () => {
    for (const clsId of SHIP_CLASS_IDS) {
      const cls = CONFIG.shipClasses[clsId];
      for (const line of LINE_IDS) {
        for (let n = 0; n <= CATALOG[line].cap; n += 1) {
          const eq = effectiveStats(cls, stack(line, n)).equipment as unknown as Record<string, Record<string, number>>;
          for (const id of EQUIPMENT_IDS) {
            for (const field of ['damage', 'contactDamage']) {
              const v = eq[id][field];
              if (v === undefined) continue;
              expect(Number.isInteger(v), `${clsId}/${line}x${n}: ${id}.${field} = ${v}`).toBe(true);
            }
          }
        }
      }
    }
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
    const s = effectiveStats(BASE, ['dazzleShells', 'phosphorShells']);
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

describe('effectiveStats — doctrine verb folds (the three surviving add-ons)', () => {
  it('every verb is false at base; each add-on sets exactly its own', () => {
    const eq = effectiveStats(BASE).equipment;
    expect([eq.missile.homing, eq.starShells.phosphor, eq.starShells.dazzle]).toEqual([false, false, false]);
    expect(effectiveStats(BASE, ['heatSeeking']).equipment.missile.homing).toBe(true);
    expect(effectiveStats(BASE, ['dazzleShells']).equipment.starShells.dazzle).toBe(true);
    expect(effectiveStats(BASE, ['phosphorShells']).equipment.starShells.phosphor).toBe(true);
  });

  // THE TWO DELETED VERBS (Eric rulings 2026-09-19, epic-8 amendments 80/81).
  // These pins are REWRITTEN, not removed: what they asserted — that ACOUSTIC
  // HOMING homed both torpedoes and that FOULING MINES fouled naval mines only
  // — is no longer true of the game, because both CARDS are gone. The torpedo
  // rows carry a NUMERIC `homingTurnRate` instead, and a naval mine cannot
  // foul at all.
  it('no torpedo or mine row carries a doctrine verb any more', () => {
    const eq = effectiveStats(BASE).equipment as unknown as Record<string, Record<string, unknown>>;
    for (const id of ['lightTorpedo', 'heavyTorpedo', 'navalMines', 'captiveMines', 'foulingMines']) {
      expect('homing' in eq[id], id).toBe(false);
      expect('propFouling' in eq[id], id).toBe(false);
      expect('captive' in eq[id], id).toBe(false);
    }
    expect(effectiveStats(BASE, ['lightTorpedo']).equipment.lightTorpedo.homingTurnRate).toBe(0);
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
    expect(changed(effectiveStats(BASE), effectiveStats(BASE, ['phosphorShells'])))
      .toEqual(['equipment.starShells.phosphor']);
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
          { kind: 'doctrine', weapon: 'navalMines', mode: 'propFouling' }, // deleted with the add-on (amendment 81)
          { kind: 'doctrine', weapon: 'heavyTorpedo', mode: 'homing' }, // now a TIER STAT (amendment 80)
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

  it('a CONTACT mine trip ring is DERIVED from its blast radius (naval AND fouling)', () => {
    const eq = effectiveStats(BASE).equipment;
    expect(eq.navalMines.triggerRadius).toBe(CONFIG.mine.triggerRadius); // 48 × 2/3 = 32 exactly
    expect(eq.navalMines.triggerRadius).toBeLessThan(eq.navalMines.blastRadius);
    // FOULING reuses the SAME fraction — one source, so the two cannot drift.
    expect(eq.foulingMines.triggerRadius).toBeCloseTo(eq.foulingMines.blastRadius * CONFIG.mine.triggerFactor, 9);
    expect(eq.foulingMines.triggerRadius).toBeLessThan(eq.foulingMines.blastRadius);
    // The CAPTIVE's rings are the other way round — the trip ring is the big
    // one — and its trip ring rides its TIER, not its blast (amendment 84d).
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
      // A CONSUMABLE IS EXEMPT BY DESIGN, not by omission: its copies carry a
      // `stock` effect, which fills a BELT SLOT and addresses no stat at all —
      // pinned two tests down. HULL REPAIR is the first live one (Story 8.8),
      // so this loop stopped being "non-stub ⇒ moves a number" the day a
      // consumable became dealable.
      if (CATALOG[id].kind === 'consumable') continue;
      const folded = effectiveStats(BASE, stack(id, CATALOG[id].cap));
      expect(changed(identity, folded), id).not.toEqual([]);
    }
  });

  it('an equipment line at copy 1 is the bare weapon: it FITS and moves no number', () => {
    // Copy 1 of an equipment line carries `slotFill` alone, so the stat tree is
    // byte-identical — the fit shows up in the LOADOUT (sim/boons.ts), not here.
    // TRUE OF THE LADDERED LINES TOO: the steps live on tiers II–V, so a hull
    // holding exactly one LIGHT TORPEDO card sails the tier-I fish.
    for (const id of ['lightTorpedo', 'heavyTorpedo', 'navalMines', 'captiveMines', 'foulingMines',
      'broadside', 'starShells'] as const) {
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
    // SUPERCAV TORPEDO and DEPTH CHARGE joined the list in Story 8.13 — and
    // supercav is the proof that the id MOVED id spaces rather than keeping a
    // row: five copies of it move nothing at all.
    for (const id of ['hullRepair', 'shieldBlock', 'smokeScreen', 'chaff', 'decoyBuoy',
      'depthCharge', 'supercavTorpedo'] as const) {
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

// ---------------------------------------------------------------------------
// THE RELOAD-STEP FLOOR. `reloadTierScale` is `1 - 0.05 x (tier - 1)`, which
// goes to ZERO at tier 21 and NEGATIVE beyond it. Nothing in catalog v3 reaches
// tier 6, but the multiplier is applied to EVERY row unconditionally and
// `rescaleReloadTimers` divides by it -- a zero cadence is unlimited fire and a
// negative one is a reload that never completes. So it is floored at 0.1, the
// same defensive floor `cooldownScale` already carries one line above it.
// ---------------------------------------------------------------------------
describe('the equipment reload step FLOORS at x0.1 (hostile / over-capped tier)', () => {
  /** An injected ladder on the deck gun with an absurd cap -- the shape a
   *  malformed or far-future catalog could take. */
  const deepLadder: Catalog = {
    deckGun: {
      id: 'deckGun', kind: 'ladder', cap: 25, appliesTo: ['gun'],
      tiers: new Array<readonly []>(25).fill([]),
    },
  };

  it('never reaches zero or a negative reload, however deep the tier', () => {
    const base = effectiveStats(BASE).equipment.gun.reloadMs;
    for (const copies of [19, 20, 24]) {
      const gun = effectiveStats(BASE, stack('deckGun', copies), deepLadder).equipment.gun;
      expect(gun.tier, `${copies}`).toBe(1 + copies);
      expect(gun.reloadMs, `${copies}`).toBeGreaterThan(0);
      expect(gun.reloadMs, `${copies}`).toBeCloseTo(base * 0.1, 6);
    }
  });
});

// ---------------------------------------------------------------------------
// A ZERO-COPY LINE MOVES NO TIER. `applyLineTier` ran for EVERY line in the
// catalog, held or not, writing `1` (a ladder at zero copies) or `max(1, 0)`
// (an equipment line) over whatever the previous line had already written. In
// production every line owns its own row so the write is a harmless no-op --
// but it made the tier a fact about CATALOG ORDER rather than about the cards
// held, and any injected or future catalog with two claimants loses the tier of
// whichever one sorts first. A line nobody holds now writes nothing at all.
// ---------------------------------------------------------------------------
describe('a line held at ZERO copies never writes a tier', () => {
  /** Two lines over one row: a held one-copy ladder, then an UNHELD deck gun. */
  const twoClaimants: Catalog = {
    deckGunTurret: { id: 'deckGunTurret', kind: 'ladder', cap: 1, appliesTo: ['gun'], tiers: [[]] },
    deckGun: CATALOG.deckGun,
  };

  it('the held line keeps the tier it bought, whatever sorts after it', () => {
    expect(effectiveStats(BASE, ['deckGunTurret'], twoClaimants).equipment.gun.tier).toBe(2);
  });

  it('...and an unheld catalog still reads every row at tier 1', () => {
    expect(effectiveStats(BASE, [], twoClaimants).equipment.gun.tier).toBe(1);
  });
});
