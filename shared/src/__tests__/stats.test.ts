// effectiveStats — the server/client desync firewall, Story 8.1 shape:
// `effectiveStats(cls, cards: LineId[], catalog = CATALOG)`. The resolved-def
// parameter died with catalog v3: the firewall resolves ids itself, counting
// copies per line and folding in CATALOG order.
//
// Properties pinned here:
//   (1) ZERO CARDS is a byte-for-byte identity with the class/CONFIG bases —
//       field for field, after the `equipment` record reshape and the
//       torpedo→heavyTorpedo / mine→navalMines rename;
//   (2) THE FOLD LAW, stated against CATALOG: every rung of every line is the
//       zero-card value plus the authored adds / times the authored mults,
//       then the post-fold clamps (no per-rung value tables — Story 9.14);
//   (3) doctrine add-ons folded into per-equipment verb booleans — NONE is
//       left since Story 8.17 (amendment 134), and no row carries a verb;
//   (4) the clamps: the mine ring derivations (the sweep is UNCAPPED since
//       Story 10.7, R6),
//       gun.barrels 1..3, the spread-rung ladder;
//   (5) THE PER-WEAPON RELOAD BONUS (Story 10.6, R5 — it replaced the
//       −5 %/tier step) — base × haste(RELOAD + bonus × (tier − 1)) — as a
//       relation over every tiered row;
//   (6) THE FRACTIONAL FLOOR (catalog-v3 R17): integer fields accumulate as
//       floats through the fold and floor exactly once;
//   (7) every NON-STUB line moves the tree at its cap (no dead cards).

import { describe, it, expect } from 'vitest';
import {
  BOON_STAT_PATH_SET,
  CATALOG,
  CONFIG,
  EQUIPMENT_IDS,
  EQUIPMENT_INT_FIELDS,
  INDEX_IDS,
  LINE_IDS,
  SHIP_CLASS_IDS,
  bonusCount,
  deriveIndexStats,
  reloadCooldownScale,
  smokeSizeScale,
  broadsideMountSpread,
  broadsideTraverse,
  clampSpreadRung,
  damageMultiplierFor,
  effectiveStats,
  equipmentMaxAmmo,
  equipmentReloadMs,
  isStubLine,
  tierTargetOf,
  type Catalog,
  type EffectiveStats,
  type EquipmentId,
  type LineId,
} from '../index.js';
import { RELOAD_UNSCALED_ROWS, captiveTriggerRadius, deriveMineRings, mineTriggerRadius } from '../sim/stats.js';

/** Does the RELOAD scale reach this row? (Story 10.5, R10 / R11 — every row
 *  but the three Shifts.) */
const reloadScaled = (id: (typeof EQUIPMENT_IDS)[number]): boolean => !RELOAD_UNSCALED_ROWS.includes(id);
const RELOAD_SCALED_IDS = EQUIPMENT_IDS.filter(reloadScaled);
import { NEUTRAL_HULL, NEUTRAL_INDEX } from './neutralHull.js';

// THE NEUTRAL HULL (every index at the base) — no shipped battleship is 100
// across the board since Story 10.4, and these tests read CONFIG bases.
const BASE = NEUTRAL_HULL;

/** THE PER-CARD RANGE STEP of a tiered weapon (Story 9.8, Eric 2026-10-13,
 *  epic-9 ruling 125): Tier I → Tier V split evenly over the four upgrade
 *  cards, derived from the two CONFIG dials. */
type RangedWeapon = 'gun' | 'machineGun' | 'flak' | 'broadside' | 'starShells' | 'phosphorShells';
const rangeStep = (w: RangedWeapon): number => (CONFIG[w].rangeUAtV - CONFIG[w].rangeU) / 4;

/** N copies of a line — the deck's stacking shape, as it rides the wire. */
const stack = (id: LineId, n: number): LineId[] => new Array<LineId>(n).fill(id);

/** The firewall's 3-decimal rounding of the cooldown scale (sim/indexStats.ts). */
const round3 = (v: number): number => Math.round(v * 1000) / 1000;

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

describe('effectiveStats — ZERO-CARD identity (the 8.1 equipment record)', () => {
  it('the neutral hull (every index at the base) at zero cards equals the CONFIG bases', () => {
    const cls = NEUTRAL_HULL;
    // THE INDEX MODEL (Story 10.3): the five indices are the envelope's, and
    // the derived fields are the index laws over them (sim/indexStats.ts).
    const { index } = cls;
    expect(effectiveStats(cls)).toEqual({
      kinematics: {
        ...cls.kinematics,
        maxSpeed: (CONFIG.index.engines * index.engines) / CONFIG.index.base,
        turnRate: CONFIG.index.turnRate, // the ONE baseline (Story 10.6, R2)
      },
      maxHp: cls.hp,
      radarRange: CONFIG.vision.radar,
      sweepRpm: (CONFIG.vision.sweepRpm * index.intel) / CONFIG.index.base,
      sweepPeriodMs: 60000 / ((CONFIG.vision.sweepRpm * index.intel) / CONFIG.index.base),
      sightRange: CONFIG.vision.sight,
      hullSightRange: CONFIG.vision.hullSight, // the plain-hull eye (Story 11.2, R3)
      // THE SECONDARIES' REACH (Story 10.4, R3): a fraction of the main reach.
      secondaryRangeU: CONFIG.mainBattery.rangeU * CONFIG.secondaries.rangeFrac,
      cooldownScale: round3(1 / (1 + (index.reload - CONFIG.index.base) / CONFIG.index.base)),
      armor: index.armor,
      damageMultiplier: damageMultiplierFor(index.armor - CONFIG.index.base), // DERIVED — against an average attacker
      power: index.power,
      reload: index.reload,
      engines: index.engines,
      intel: index.intel,
      // THE TWO ABILITIES at zero cards (Story 10.6, R8 / R9): the CONFIG
      // bases, each ability's own score at the index base; the smoke disc is
      // the anchored CONFIG disc scaled to zero cards.
      repair: {
        reload: CONFIG.index.base,
        instantHp: CONFIG.hullRepair.instantHp,
        regenHp: CONFIG.hullRepair.regenHp,
        regenMs: CONFIG.hullRepair.regenMs,
        cooldownMs: CONFIG.hullRepair.cooldownMs,
      },
      smoke: {
        reload: CONFIG.index.base,
        sizeRung: 1,
        lifeMs: CONFIG.countermeasure.lifeMs,
        r0: CONFIG.countermeasure.r0 * smokeSizeScale(0),
        r1: CONFIG.countermeasure.r1 * smokeSizeScale(0),
        cooldownMs: CONFIG.countermeasure.cooldownMs,
      },
      // THE MOUNTS at zero cards (Story 10.6, R6 / R7): one fore launcher with
      // one tube, one rack with no bonus.
      torpedoLaunchers: 1,
      tubesPerLauncher: 1,
      mineRacks: 1,
      rackBonus: 0,
      equipment: {
        gun: {
          tier: 1, // the deck gun's tier I ships EQUIPPED (catalog-v3 §4)
          reloadMs: CONFIG.gun.reloadMs,
          maxAmmo: CONFIG.gun.maxAmmo,
          rangeU: CONFIG.gun.rangeU, // its own Tier I dial (Story 9.8, ruling 125)
          damage: CONFIG.gun.damage,
          contactDamage: CONFIG.gun.contactDamage,
          burstRadius: CONFIG.gun.burstRadius,
          barrels: CONFIG.gun.barrels, // a captain's fixed two (Story 9.12, Eric 2026-10-16)
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
          runU: CONFIG.lightTorpedo.runU, // the Tier I run (Story 11.2, R5)
        },
        // THE LEGACY RENAME — byte-identical to the shipped `torpedo` block.
        heavyTorpedo: {
          tier: 1,
          reloadMs: CONFIG.torpedo.reloadMs,
          maxAmmo: CONFIG.torpedo.maxAmmo,
          speed: CONFIG.torpedo.speed,
          damage: CONFIG.torpedo.damage,
          homingTurnRate: 0,
          runU: CONFIG.torpedo.runU, // the Tier I run (Story 11.2, R5)
        },
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
        // THE TWO PICKABLE GUNS (Story 8.15, amendments 103/105) — built from
        // their own CONFIG blocks; range is each gun's own Tier I dial (9.8).
        // `missile` and `monitor` are CUT (amendment 89e) and have no row.
        machineGun: {
          tier: 1,
          reloadMs: CONFIG.machineGun.reloadMs,
          maxAmmo: CONFIG.machineGun.maxAmmo,
          rangeU: CONFIG.machineGun.rangeU,
          damage: CONFIG.machineGun.damage,
          rateMs: CONFIG.machineGun.rateMs,
        },
        flak: {
          tier: 1,
          reloadMs: CONFIG.flak.reloadMs,
          maxAmmo: CONFIG.flak.maxAmmo,
          rangeU: CONFIG.flak.rangeU,
          damage: CONFIG.flak.damage,
          contactDamage: CONFIG.flak.contactDamage,
          burstRadius: CONFIG.flak.burstRadius,
        },
        broadside: {
          tier: 1,
          reloadMs: CONFIG.broadside.reloadMs,
          maxAmmo: CONFIG.broadside.maxAmmo,
          rangeU: CONFIG.broadside.rangeU, // its own Tier I dial (Story 9.8, ruling 125)
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
          rangeU: CONFIG.starShells.rangeU,
          litRadius: CONFIG.starShells.litRadius, // the ratified SIGHT/2 derivation
          litDurationMs: CONFIG.starShells.litDurationMs,
          // Story 8.17 (amendments 130/134): the flare deals tier-I damage;
          // the `phosphor`/`dazzle` verbs are DELETED.
          damage: CONFIG.starShells.damage,
        },
        // PHOSPHOR SHELLS (Story 8.17, amendment 131) — its own weapon row.
        phosphorShells: {
          tier: 1,
          reloadMs: CONFIG.phosphorShells.reloadMs,
          maxAmmo: CONFIG.phosphorShells.maxAmmo,
          rangeU: CONFIG.phosphorShells.rangeU, // its own Tier I dial (Story 9.8, ruling 125)
          damage: CONFIG.phosphorShells.damage,
          zoneRadius: CONFIG.phosphorShells.zoneRadius,
          zoneDurationMs: CONFIG.phosphorShells.zoneDurationMs,
          dps: CONFIG.phosphorShells.dps,
        },
        // THE TWO NEW CLASS SHIFTS (Story 8.15, amendments 97/99).
        instantReload: { tier: 1, reloadMs: CONFIG.instantReload.reloadMs, maxAmmo: CONFIG.instantReload.maxAmmo },
        // Story 9.7 (epic-9 amendments 86–88 / 110–117): temporary Armor for
        // 10 s replaces the flat ×0.5 factor and the 8 s window; the bonus is
        // CONFIG's pass-through (5 -> 100 by amendment 144, ×0.5 kept).
        hunker: {
          tier: 1,
          reloadMs: CONFIG.hunker.reloadMs,
          maxAmmo: CONFIG.hunker.maxAmmo,
          durationMs: CONFIG.hunker.durationMs,
          armorBonus: CONFIG.hunker.armorBonus,
        },
        // THE MAIN BATTERY (Story 10.4): the shared half from CONFIG, the
        // per-hull half (turret count, shell damage) from the envelope.
        mainBattery: {
          tier: 1,
          reloadMs: CONFIG.mainBattery.reloadMs,
          maxAmmo: cls.battery!.turrets.length,
          rangeU: CONFIG.mainBattery.rangeU,
          damage: cls.battery!.shellDamage,
        },
        // THE THREE MOVED WEAPONS (Story 10.5, Eric 2026-11-05, epic-10
        // amendment 11): slot weapons with a row again. The supercav never
        // homes; the flash reads the fouling shell's reach (one dial).
        supercavTorpedo: {
          tier: 1,
          reloadMs: CONFIG.supercavTorpedo.reloadMs,
          maxAmmo: CONFIG.supercavTorpedo.maxAmmo,
          speed: CONFIG.supercavTorpedo.speed,
          damage: CONFIG.supercavTorpedo.damage,
          homingTurnRate: 0,
          runU: CONFIG.supercavTorpedo.runU, // the Tier I run (Story 11.2, R5)
        },
        dazzleShells: {
          tier: 1,
          reloadMs: CONFIG.flashShells.reloadMs,
          maxAmmo: CONFIG.flashShells.maxAmmo,
          rangeU: CONFIG.foulingShell.rangeU,
          radius: CONFIG.flashShells.radius,
        },
        foulingShell: {
          tier: 1,
          reloadMs: CONFIG.foulingShell.reloadMs,
          maxAmmo: CONFIG.foulingShell.maxAmmo,
          rangeU: CONFIG.foulingShell.rangeU,
          radius: CONFIG.foulingShell.radius,
        },
      },
    });
  });

  it.each(SHIP_CLASS_IDS.map((id) => [id] as const))(
    '%s at zero cards is the neutral fold of its own envelope with RELOAD applied once, and its main reach is the base × its battery\'s reachFrac',
    (id) => {
      const cls = CONFIG.shipClasses[id];
      const s = effectiveStats(cls);
      const neutral = effectiveStats({ ...cls, index: NEUTRAL_INDEX });
      for (const k of INDEX_IDS) expect(s[k], k).toBe(cls.index[k]);
      for (const eqId of EQUIPMENT_IDS) {
        const row = s.equipment[eqId] as unknown as Record<string, number>;
        const ref = neutral.equipment[eqId] as unknown as Record<string, number>;
        for (const field of Object.keys(ref)) {
          const want = field === 'reloadMs' ? ref[field] * (reloadScaled(eqId) ? s.cooldownScale : 1) : ref[field];
          expect(row[field], `${eqId}.${field}`).toBeCloseTo(want, 9);
        }
      }
      // The battery row carries the hull's own geometry, shell and REACH
      // (Story 11.2, R2: the base × the battery's `reachFrac`, a fact of the
      // hull — no index row in the way).
      expect(s.equipment.mainBattery.maxAmmo).toBe(cls.battery.turrets.length);
      expect(s.equipment.mainBattery.damage).toBe(cls.battery.shellDamage);
      expect(s.equipment.mainBattery.rangeU).toBeCloseTo(CONFIG.mainBattery.rangeU * cls.battery.reachFrac, 9);
      expect(s.secondaryRangeU).toBeCloseTo(s.equipment.mainBattery.rangeU * CONFIG.secondaries.rangeFrac, 9);
    },
  );

  it.each(SHIP_CLASS_IDS.map((id) => [id] as const))(
    '%s: no card in the catalog changes the main-battery reach (Story 11.2, R2 / R9)',
    (id) => {
      const cls = CONFIG.shipClasses[id];
      const reach = effectiveStats(cls).equipment.mainBattery.rangeU;
      for (const line of LINE_IDS) {
        const s = effectiveStats(cls, new Array<LineId>(CATALOG[line].cap).fill(line));
        expect(s.equipment.mainBattery.rangeU, line).toBe(reach);
      }
    },
  );

  it.each(SHIP_CLASS_IDS.map((id) => [id] as const))(
    '%s: the plain-hull eye is never under the class-and-name eye, at zero cards or any index (Story 11.2, R3)',
    (id) => {
      const cls = CONFIG.shipClasses[id];
      for (const cards of [[], new Array<LineId>(5).fill('intel')] as LineId[][]) {
        const s = effectiveStats(cls, cards);
        expect(s.hullSightRange).toBeGreaterThanOrEqual(s.sightRange);
      }
    },
  );

  it('a hull with NO battery carries an inert main-battery row', () => {
    // Every battleship carries one; the PvE drones that did not retired at
    // Story 10.8 (2026-11-06), so the envelope is stripped here.
    const { battery: _battery, ...noBattery } = CONFIG.shipClasses.iowa;
    const row = effectiveStats(noBattery).equipment.mainBattery;
    expect(row.maxAmmo).toBe(0);
    expect(row.damage).toBe(0);
  });

  // THE THREE MOVED WEAPONS (Story 10.5, Eric 2026-11-05, epic-10 amendment
  // 11) — tiered through the one stat machinery, never an ad hoc derive.
  it.each([
    ['dazzleShells', CONFIG.flashShells],
    ['foulingShell', CONFIG.foulingShell],
  ] as const)('%s: the burst radius grows by its CONFIG step per tier, from the CONFIG base (R7)', (id, block) => {
    const radius = (copies: number): number => effectiveStats(BASE, stack(id, copies)).equipment[id].radius;
    expect(radius(1)).toBe(block.radius);
    const cap = CATALOG[id].cap;
    for (let n = 2; n <= cap; n += 1) {
      expect(radius(n) - radius(n - 1), `${id} tier ${n}`).toBe(block.radiusStepPerTier);
    }
    expect(radius(cap)).toBe(block.radius + (cap - 1) * block.radiusStepPerTier);
    // The reach is FIXED: no tier moves it, and the flash shares the fouling dial.
    expect(effectiveStats(BASE, stack(id, cap)).equipment[id].rangeU).toBe(CONFIG.foulingShell.rangeU);
  });

  it('SUPERCAV: every tier adds the same authored damage step, and it NEVER homes (amendment 74)', () => {
    const row = (copies: number) => effectiveStats(BASE, stack('supercavTorpedo', copies)).equipment.supercavTorpedo;
    expect(row(1).damage).toBe(CONFIG.supercavTorpedo.damage);
    const cap = CATALOG.supercavTorpedo.cap;
    const step = row(2).damage - row(1).damage;
    expect(step).toBeGreaterThan(0);
    for (let n = 2; n <= cap; n += 1) {
      expect(row(n).damage - row(n - 1).damage, `tier ${n}`).toBe(step);
      expect(row(n).homingTurnRate, `tier ${n}`).toBe(0);
      expect(row(n).speed, `tier ${n}`).toBe(CONFIG.supercavTorpedo.speed);
      expect(row(n).maxAmmo, `tier ${n}`).toBe(CONFIG.supercavTorpedo.maxAmmo);
    }
  });

  it.each(['supercavTorpedo', 'dazzleShells', 'foulingShell'] as const)(
    '%s reloads like every slot weapon: its tier bonus and the ship\'s RELOAD in the one haste law (R4, R11; Story 10.6, R5)',
    (id) => {
      const base = effectiveStats(BASE, [id]).equipment[id].reloadMs;
      const cap = CATALOG[id].cap;
      const bonus = CONFIG.catalog.reloadBonusPerTier;
      // Each tier shortens the reload; RELOAD cards shorten it further through the SAME law.
      for (let n = 2; n <= cap; n += 1) {
        const at = effectiveStats(BASE, stack(id, n)).equipment[id].reloadMs;
        expect(at, `${id} tier ${n}`).toBe(base * reloadCooldownScale(CONFIG.index.base + bonus * (n - 1)));
        expect(at, `${id} tier ${n}`).toBeLessThan(effectiveStats(BASE, stack(id, n - 1)).equipment[id].reloadMs);
      }
      const hasted = effectiveStats(BASE, [id, ...stack('reload', 5)]);
      expect(hasted.cooldownScale).toBeLessThan(1);
      expect(hasted.equipment[id].reloadMs).toBe(base * hasted.cooldownScale);
    },
  );

  it('the equipment record is TOTAL over EquipmentId, every row at tier 1', () => {
    const eq = effectiveStats(BASE).equipment;
    expect(Object.keys(eq).sort()).toEqual([...EQUIPMENT_IDS].sort());
    for (const id of EQUIPMENT_IDS) expect(eq[id].tier, id).toBe(1);
  });

  it('the signature is (cls, cards?): omitted and [] are byte-identical; junk ids fail closed', () => {
    expect(effectiveStats(BASE)).toEqual(effectiveStats(BASE, []));
    expect(effectiveStats(BASE, ['nope', 'constructor'])).toEqual(effectiveStats(BASE));
  });
});

describe('effectiveStats — the six universal ladders (catalog-v3 §4 + Stories 9.7 / 9.9 / 10.3)', () => {
  // THE UNIVERSAL FOLD (Story 9.14, Eric 2026-10-22: the literal per-ladder
  // step pins were CONST pins of catalog content). Each rung is the zero-card
  // value plus the authored adds, then the firewall's post-fold rule for that
  // path; the ladder moves only its own paths and the values derived from them.
  const UNIVERSAL = LINE_IDS.filter((id) => CATALOG[id].kind === 'ladder' && tierTargetOf(CATALOG[id]) === undefined);
  // Every index ladder writes an INDEX since Story 10.3, and every index is
  // floored whole (armor / power at 0, the rest at 1) before anything
  // derives; the two ability ladders' scores and the smoke rung likewise
  // (Story 10.6).
  const POST_FOLD: Record<string, (v: number) => number> = {
    armor: (v) => Math.max(0, Math.floor(v)),
    power: (v) => Math.max(0, Math.floor(v)),
    reload: (v) => Math.max(1, Math.floor(v)),
    engines: (v) => Math.max(1, Math.floor(v)),
    intel: (v) => Math.max(1, Math.floor(v)),
    'repair.reload': (v) => Math.max(1, Math.floor(v)),
    'smoke.reload': (v) => Math.max(1, Math.floor(v)),
    'smoke.sizeRung': (v) => Math.max(1, Math.floor(v)),
  };
  const read = (s: EffectiveStats, path: string): number => flatten(s).get(path) as number;

  it('the universal ladders are exactly the SHIP ladders — one per index plus HULL REPAIR and SMOKE SCREEN (Story 10.6, R1; RANGE out since Story 11.2, R9), each with a tier array per copy', () => {
    expect([...UNIVERSAL].sort()).toEqual([...INDEX_IDS, 'hullRepair', 'smokeScreen'].sort());
    for (const id of UNIVERSAL) expect(CATALOG[id].tiers, id).toHaveLength(CATALOG[id].cap);
  });

  it.each(UNIVERSAL.map((id) => [id] as const))('%s: each rung is the zero-card value + the authored adds, through the post-fold rule, on every hull', (id) => {
    for (const clsId of SHIP_CLASS_IDS) {
      const cls = CONFIG.shipClasses[clsId];
      const zero = effectiveStats(cls);
      const acc = new Map<string, number>();
      for (let n = 1; n <= CATALOG[id].cap; n += 1) {
        for (const e of CATALOG[id].tiers[n - 1]!) {
          if (e.kind !== 'stat') continue;
          const prev = acc.get(e.path) ?? read(zero, e.path);
          acc.set(e.path, e.mult !== undefined ? prev * e.mult : prev + (e.add ?? 0));
        }
        const s = effectiveStats(cls, stack(id, n));
        for (const [path, want] of acc) {
          const rule = POST_FOLD[path];
          if (rule) expect(read(s, path), `${clsId} ${id} x${n}: ${path}`).toBe(rule(want));
          else expect(read(s, path), `${clsId} ${id} x${n}: ${path}`).toBeCloseTo(want, 9);
        }
      }
    }
  });

  it.each(UNIVERSAL.map((id) => [id] as const))('%s: at its cap moves only its own paths and what derives from them', (id) => {
    // What each INDEX derives (Story 10.3, sim/indexStats.ts).
    const DERIVED: Record<string, (p: string) => boolean> = {
      armor: (p) => p === 'damageMultiplier',
      engines: (p) => p === 'kinematics.maxSpeed',
      intel: (p) => p === 'sweepRpm' || p === 'sweepPeriodMs',
      reload: (p) => p === 'cooldownScale' || (p.startsWith('equipment.') && p.endsWith('.reloadMs')),
      // (`range` — the RANGE index's derived reaches — left with Story 11.2, R9.)
      'repair.reload': (p) => p === 'repair.cooldownMs',
      'smoke.reload': (p) => p === 'smoke.cooldownMs',
      'smoke.sizeRung': (p) => p === 'smoke.r0' || p === 'smoke.r1',
    };
    const own = new Set<string>(CATALOG[id].tiers.flat().flatMap((e) => (e.kind === 'stat' ? [e.path] : [])));
    for (const path of changed(effectiveStats(BASE), effectiveStats(BASE, stack(id, CATALOG[id].cap)))) {
      const ok = own.has(path) || [...own].some((o) => DERIVED[o]?.(path) === true);
      expect(ok, `${id} moved ${path}`).toBe(true);
    }
    for (const path of own) expect(read(effectiveStats(BASE, stack(id, CATALOG[id].cap)), path), `${id}: ${path}`).not.toBe(read(effectiveStats(BASE), path));
  });

  // ARMOR (Story 9.7, Eric 2026-10-13, epic-9 amendments 86–88 / 110–117;
  // rescaled by Story 9.9, amendment 144: +20 Armor per card, K 5 -> 100):
  // the multiplier K / (K + Armor) DERIVED in the firewall through the one
  // exported curve — the EXACT ratio, never rounded (review gate 2026-10-13,
  // epic-9 amendment 120(a)). K is READ from CONFIG, never restated; the card
  // step is READ from CATALOG.
  const armorOf = (n: number): number => effectiveStats(BASE, stack('armor', n)).armor;
  const STEP = 20; // a synthetic effective-armor value for the curve tests below (not the catalog step)
  it('ARMOR: n cards → damageMultiplier exactly K/(K+(armor − base)) through damageMultiplierFor (the exact ratio, never rounded), n = 0..cap, on every hull', () => {
    const K = CONFIG.armor.k;
    for (let n = 0; n <= CATALOG.armor.cap; n += 1) {
      for (const id of SHIP_CLASS_IDS) {
        const s = effectiveStats(CONFIG.shipClasses[id], stack('armor', n));
        // Published against an AVERAGE attacker (POWER = base): ×1 on a base hull.
        // The K / (K + E) branch holds from the base up; a hull BELOW the base (Iowa)
        // reads the negative branch, which damageMultiplierFor owns.
        if (s.armor >= CONFIG.index.base) expect(s.damageMultiplier, `${id} ${n}`).toBe(K / (K + (s.armor - CONFIG.index.base)));
        expect(s.damageMultiplier, `${id} ${n}`).toBe(damageMultiplierFor(s.armor - CONFIG.index.base));
        if (n > 0) expect(s.damageMultiplier, `${id} ${n}`).toBeLessThan(effectiveStats(CONFIG.shipClasses[id], stack('armor', n - 1)).damageMultiplier);
      }
    }
  });

  // THE TWO-BRANCH CURVE (Story 9.9, Eric 2026-10-14/15, epic-9 amendment
  // 146): E ≥ 0 → K/(K+E); E < 0 → 2 − K/(K−E). Synthetic E, K from CONFIG.
  describe('damageMultiplierFor — the one curve on effective armor E (amendment 146)', () => {
    const K = CONFIG.armor.k;
    it('E ≥ 0 is K/(K+E): ×1 at 0, ×0.5 at K, ×1/3 at 2K', () => {
      expect(damageMultiplierFor(0)).toBe(1);
      expect(damageMultiplierFor(STEP)).toBe(K / (K + STEP));
      expect(damageMultiplierFor(K)).toBe(0.5);
      expect(damageMultiplierFor(2 * K)).toBe(1 / 3);
      // The HUNKER's bonus enters the curve as Armor (amendments 88 / 144).
      expect(damageMultiplierFor(STEP * 5 + CONFIG.hunker.armorBonus)).toBe(K / (K + STEP * 5 + CONFIG.hunker.armorBonus));
      expect(damageMultiplierFor(0 + CONFIG.hunker.armorBonus)).toBe(K / (K + CONFIG.hunker.armorBonus));
    });

    it('E < 0 is 2 − K/(K−E): ×7/6 one card under, ×1.5 at −K (where raw K/(K+E) would divide by zero)', () => {
      expect(damageMultiplierFor(-STEP)).toBe(7 / 6); // exact at K 100 / step 20
      expect(damageMultiplierFor(-K)).toBe(1.5);
      for (const e of [-1, -7, -20, -60, -100, -333, -1000]) {
        expect(damageMultiplierFor(e), String(e)).toBeCloseTo(2 - K / (K - e), 12);
      }
    });

    it('stays EXACT below zero: a whole product is whole (12 hp at E −20 is 14, a 0.5 burn tick at −K is 0.75)', () => {
      expect(12 * damageMultiplierFor(-STEP)).toBe(14);
      expect(12 * damageMultiplierFor(-K)).toBe(18);
      expect(0.5 * damageMultiplierFor(-K)).toBe(0.75);
    });

    it('is bounded strictly between ×1 and ×2 for every finite negative E', () => {
      for (const e of [-1e-6, -1, -K, -10 * K, -1e6, -1e12]) {
        const m = damageMultiplierFor(e);
        expect(m, String(e)).toBeGreaterThan(1);
        expect(m, String(e)).toBeLessThan(2);
      }
    });

    it('is continuous through 0 from both sides', () => {
      expect(Math.abs(damageMultiplierFor(1e-9) - 1)).toBeLessThan(1e-8);
      expect(Math.abs(damageMultiplierFor(-1e-9) - 1)).toBeLessThan(1e-8);
      expect(damageMultiplierFor(-0)).toBe(1);
    });

    it('is strictly decreasing over E −300 → 300', () => {
      let prev = Infinity;
      for (let e = -300; e <= 300; e += 10) {
        const m = damageMultiplierFor(e);
        expect(m, String(e)).toBeLessThan(prev);
        prev = m;
      }
    });

    it('reads a non-finite E as ×1 — a NaN never poisons the gate', () => {
      for (const bad of [NaN, Infinity, -Infinity]) expect(damageMultiplierFor(bad), String(bad)).toBe(1);
    });
  });

  it('ARMOR adds no hull (maxHp is untouched — ARMOR is the ramming MASS since Story 10.3, never the hull) and moves only the Armor pair', () => {
    const base = effectiveStats(BASE);
    const v = effectiveStats(BASE, stack('armor', 5));
    expect(v.maxHp).toBe(base.maxHp);
    expect({ ...v, armor: base.armor, damageMultiplier: base.damageMultiplier }).toEqual(base);
    // ...and no other ladder moves it.
    for (const id of ['power', 'engines', 'intel', 'reload', 'hullRepair', 'smokeScreen'] as const) {
      const s = effectiveStats(BASE, stack(id, CATALOG[id].cap));
      expect([s.armor, s.damageMultiplier], id).toEqual([base.armor, base.damageMultiplier]);
    }
    // The Tier-V HULL POINTS + Tier-V ARMOR case lived here until Story 10.3
    // DELETED HULL POINTS (Eric 2026-11-04, epic-10 amendment 8).
  });

  // POWER (Story 9.9's ARMOR PIERCING, Eric 2026-10-14/15, epic-9 amendments
  // 144–146; renamed by Story 10.3, Eric 2026-11-04, epic-10 amendment 8):
  // the ATTACKER's stat — folded, floored, and never in the holder's own
  // damageMultiplier (which stays victim-only, amendment 120(e)).
  it('POWER: n ARMOR + m POWER cards fold independently — damageMultiplier from armor alone', () => {
    const pierceOf = (m: number): number => effectiveStats(BASE, stack('power', m)).power;
    for (let n = 0; n <= CATALOG.armor.cap; n += 1) {
      for (let m = 0; m <= CATALOG.power.cap; m += 1) {
        const s = effectiveStats(BASE, [...stack('armor', n), ...stack('power', m)]);
        expect([s.armor, s.power], `${n}/${m}`).toEqual([armorOf(n), pierceOf(m)]);
        expect(s.damageMultiplier, `${n}/${m}`).toBe(damageMultiplierFor(armorOf(n) - CONFIG.index.base));
      }
    }
  });

  it('POWER is the envelope\'s index on every hull at base and under every other ladder, and moves nothing else', () => {
    for (const id of SHIP_CLASS_IDS) expect(effectiveStats(CONFIG.shipClasses[id]).power, id).toBe(CONFIG.shipClasses[id].index.power);
    for (const id of ['armor', 'engines', 'intel', 'reload', 'hullRepair', 'smokeScreen'] as const) {
      expect(effectiveStats(BASE, stack(id, CATALOG[id].cap)).power, id).toBe(BASE.index.power);
    }
    const base = effectiveStats(BASE);
    const v = effectiveStats(BASE, stack('power', 5));
    expect({ ...v, power: base.power }).toEqual(base);
  });

  it('ARMOR and POWER are floored to whole numbers before anything derives (injected fractional step)', () => {
    const half: Catalog = {
      armor: { id: 'armor', kind: 'ladder', cap: 2, tiers: [[{ kind: 'stat', path: 'armor', add: 1.5 }], [{ kind: 'stat', path: 'armor', add: 1.5 }]] },
      power: {
        id: 'power', kind: 'ladder', cap: 2,
        tiers: [[{ kind: 'stat', path: 'power', add: 2.5 }], [{ kind: 'stat', path: 'power', add: 2.5 }]],
      },
    };
    const a0 = BASE.index.armor;
    const p0 = BASE.index.power;
    const one = effectiveStats(BASE, ['armor', 'power'], half);
    expect([one.armor, one.power, one.damageMultiplier]).toEqual([a0 + 1, p0 + 2, damageMultiplierFor(a0 + 1 - CONFIG.index.base)]);
    const two = effectiveStats(BASE, ['armor', 'armor', 'power', 'power'], half);
    expect([two.armor, two.power, two.damageMultiplier]).toEqual([a0 + 3, p0 + 5, damageMultiplierFor(a0 + 3 - CONFIG.index.base)]);
  });

  // THE REGEN PAIR (Story 9.6) and its PASSIVE HEALING ladder are DELETED by
  // Story 10.3 (Eric 2026-11-04, epic-10 amendment 8) — see THE INDEX MODEL
  // describe below for the `regen`-is-gone pin.

  it('INTEL has NO sweep ceiling (Story 10.7, R6): on every hull, one more INTEL index point — card-folded or bonus — raises sweepRpm by the same linear increment, at the card cap and past it', () => {
    const perPoint = CONFIG.vision.sweepRpm / CONFIG.index.base; // rpm per INTEL index point — the linear law
    const POINTS = CONFIG.offer.exhausted.indexPoints;
    const step = (CATALOG.intel.tiers[0].find((e) => e.kind === 'stat') as { add: number }).add;
    for (const clsId of SHIP_CLASS_IDS) {
      const cls = CONFIG.shipClasses[clsId];
      for (let n = 0; n <= CATALOG.intel.cap; n += 1) {
        for (const b of [0, 1, 7]) {
          const s = effectiveStats(cls, stack('intel', n), CATALOG, { intel: b });
          const more = effectiveStats(cls, stack('intel', n), CATALOG, { intel: b + 1 });
          expect(more.sweepRpm - s.sweepRpm, `${clsId} x${n} +${b}`).toBeCloseTo(perPoint * POINTS, 9);
          expect(s.sweepPeriodMs, `${clsId} x${n} +${b}`).toBe(60000 / s.sweepRpm);
          if (n < CATALOG.intel.cap) {
            const card = effectiveStats(cls, stack('intel', n + 1), CATALOG, { intel: b });
            expect(card.sweepRpm - s.sweepRpm, `${clsId} card x${n + 1} +${b}`).toBeCloseTo(perPoint * step, 9);
          }
        }
      }
    }
  });

  it('RELOAD is MULTIPLICATIVE on the index (Story 10.3, ruling 14): the cap scale is the haste law over base + Σ authored adds, not an additive scale', () => {
    const steps = CATALOG.reload.tiers.flat().flatMap((e) => (e.kind === 'stat' && e.path === 'reload' && e.add !== undefined ? [e.add] : []));
    const reloadAtCap = BASE.index.reload + steps.reduce((a, b) => a + b, 0);
    const atCap = effectiveStats(BASE, stack('reload', CATALOG.reload.cap)).cooldownScale;
    expect(atCap).toBe(round3(1 / (1 + (reloadAtCap - CONFIG.index.base) / CONFIG.index.base)));
    expect(atCap).toBe(round3(CONFIG.index.base / reloadAtCap)); // the algebraic twin
  });

  it('RELOAD scales every row but the Shifts once, post-fold (Story 10.5, R10 / R11)', () => {
    const base = effectiveStats(BASE);
    const capped = effectiveStats(BASE, stack('reload', 5));
    for (const id of EQUIPMENT_IDS) {
      const want = base.equipment[id].reloadMs * (reloadScaled(id) ? capped.cooldownScale : 1);
      expect(capped.equipment[id].reloadMs, id).toBeCloseTo(want, 9);
    }
    // The main battery and the Q / E / R families ARE scaled (R11); the three
    // Shifts are NOT (R10).
    for (const id of ['mainBattery', 'lightTorpedo', 'heavyTorpedo', 'supercavTorpedo', 'navalMines', 'captiveMines',
      'foulingMines', 'starShells', 'phosphorShells', 'dazzleShells', 'foulingShell'] as const) {
      expect(reloadScaled(id), id).toBe(true);
    }
    for (const id of ['boost', 'instantReload', 'hunker'] as const) expect(reloadScaled(id), id).toBe(false);
  });

  it('RELOAD moves ONLY its index, the scale and the scaled rows\' reloads (flatten diff)', () => {
    const paths = changed(effectiveStats(BASE), effectiveStats(BASE, stack('reload', 5)));
    expect(paths).toEqual(['reload', 'cooldownScale', ...RELOAD_SCALED_IDS.map((id) => `equipment.${id}.reloadMs`)].sort());
  });

  it('OVER-STACK (defensive, unreachable through a deck): the scale floors at 0.1, never zero or non-finite', () => {
    const many: LineId[] = [];
    for (let i = 0; i < 12; i += 1) many.push('reload');
    // The catalog CAP is enforced by the fold itself, so an over-stacked list
    // lands on the cap rather than running past it — the floor below is the
    // guard for effect data that never came from CATALOG at all.
    expect(effectiveStats(BASE, many).cooldownScale).toBe(effectiveStats(BASE, stack('reload', CATALOG.reload.cap)).cooldownScale);
    // A rogue RELOAD index in the thousands drives the haste law toward zero;
    // the 0.1 floor holds the cadence finite.
    const rogue: Catalog = {
      reload: { id: 'reload' as LineId, kind: 'ladder', cap: 30, tiers: new Array(30).fill([{ kind: 'stat', path: 'reload', add: 1000 }]) },
    };
    const s = effectiveStats(BASE, new Array<string>(30).fill('reload'), rogue);
    expect(s.cooldownScale).toBe(0.1);
    expect(s.equipment.gun.reloadMs).toBeCloseTo(CONFIG.gun.reloadMs * 0.1, 9);
  });
});

// ---------------------------------------------------------------------------
// THE INDEX MODEL (Story 10.3, Eric 2026-11-04, epic-10 amendment 8). Five
// AUTHORED indices — armor, power, reload, engines, intel (RUDDER deleted by
// Story 10.6, R2; RANGE by Story 11.2, R9) — are seeded from the hull
// envelope and stepped by the ship ladders; the speed, sweep rate and
// cooldown scale are DERIVED from them in the fold (sim/indexStats.ts) and
// nowhere else. Every expectation is a RELATION to CONFIG, never a literal.
// ---------------------------------------------------------------------------
describe('THE INDEX MODEL — the authored indices and what the fold derives from them (Story 10.3)', () => {
  const step = (id: LineId): number => (CATALOG[id].tiers[0].find((e) => e.kind === 'stat') as { add: number }).add;

  it('zero cards seeds every index from the envelope, on every class', () => {
    for (const cls of SHIP_CLASS_IDS.map((id) => CONFIG.shipClasses[id])) {
      const s = effectiveStats(cls);
      for (const k of INDEX_IDS) expect(s[k], k).toBe(cls.index[k]);
    }
  });

  it('ENGINES: top speed = CONFIG.index.engines × engines / base, at every rung, on every hull — and the law is linear (ruling 15)', () => {
    for (const clsId of SHIP_CLASS_IDS) {
      for (let n = 0; n <= CATALOG.engines.cap; n += 1) {
        const s = effectiveStats(CONFIG.shipClasses[clsId], stack('engines', n));
        expect(s.engines, `${clsId} x${n}`).toBe(CONFIG.shipClasses[clsId].index.engines + n * step('engines'));
        expect(s.kinematics.maxSpeed, `${clsId} x${n}`).toBe((CONFIG.index.engines * s.engines) / CONFIG.index.base);
      }
    }
    // +100 % ENGINES is +100 % distance per minute.
    const base = effectiveStats(BASE);
    const doubled = { ...BASE, index: { ...BASE.index, engines: BASE.index.engines * 2 } };
    expect(effectiveStats(doubled).kinematics.maxSpeed).toBeCloseTo(base.kinematics.maxSpeed * 2, 9);
  });

  it('the other kinematics (reverse, accel, decel, steerage) stay per-class CONFIG pass-throughs that no ladder moves', () => {
    for (const clsId of SHIP_CLASS_IDS) {
      const cls = CONFIG.shipClasses[clsId];
      const s = effectiveStats(cls, stack('engines', 5));
      expect(s.kinematics.reverseSpeed, clsId).toBe(cls.kinematics.reverseSpeed);
      expect(s.kinematics.accel, clsId).toBe(cls.kinematics.accel);
      expect(s.kinematics.decel, clsId).toBe(cls.kinematics.decel);
      expect(s.kinematics.steerageSpeed, clsId).toBe(cls.kinematics.steerageSpeed);
    }
  });

  it('INTEL: sweep RPM = CONFIG.vision.sweepRpm × intel / base, uncapped (Story 10.7, R6), and the period follows', () => {
    for (let n = 0; n <= CATALOG.intel.cap + 2; n += 1) {
      const s = effectiveStats(BASE, stack('intel', n));
      expect(s.sweepRpm, `x${n}`).toBe((CONFIG.vision.sweepRpm * s.intel) / CONFIG.index.base);
      expect(s.sweepPeriodMs, `x${n}`).toBe(60000 / s.sweepRpm);
    }
  });

  it('RELOAD is the haste law (ruling 14): cooldownScale = round3(1 / (1 + (reload − base) / base)) — half at double the index — through every scaled row', () => {
    for (let n = 0; n <= CATALOG.reload.cap; n += 1) {
      const s = effectiveStats(BASE, stack('reload', n));
      const want = round3(1 / (1 + (s.reload - CONFIG.index.base) / CONFIG.index.base));
      expect(s.cooldownScale, `x${n}`).toBe(want);
      expect(s.cooldownScale * (1 + (s.reload - CONFIG.index.base) / CONFIG.index.base), `x${n}`).toBeCloseTo(1, 2);
      for (const id of EQUIPMENT_IDS) {
        const base = effectiveStats(BASE).equipment[id].reloadMs;
        expect(s.equipment[id].reloadMs, `${id} x${n}`).toBeCloseTo(base * (reloadScaled(id) ? s.cooldownScale : 1), 9);
      }
    }
    const twice = { ...BASE, index: { ...BASE.index, reload: BASE.index.reload * 2 } };
    expect(effectiveStats(twice).cooldownScale).toBe(0.5);
  });

  it('a RELOAD card is multiplicative on the index, never additive on the scale: the first card buys a bigger cut than the fifth', () => {
    const cd = (n: number): number => effectiveStats(BASE, stack('reload', n)).cooldownScale;
    expect(cd(0) - cd(1)).toBeGreaterThan(cd(4) - cd(5));
    expect(cd(5)).toBeLessThan(cd(0));
  });

  // THE THREE RANGE-INDEX CASES ('RANGE scales the deck-gun rows' reach…',
  // 'RANGE composes with a line's own tiered reach…', 'the RANGE multiply
  // fails CLOSED…') are DELETED with the RANGE index (Story 11.2, 2026-11-12,
  // epic-11 amendment 4, R9). The reach contract
  // that replaces them — base × the hull's `battery.reachFrac`, untouched by
  // every card — sits in the ZERO-CARD identity suite above.

  it('every index is floored WHOLE in the fold: armor / power at 0, the rest at 1 (injected fractional and near-zero steps)', () => {
    const frac: Catalog = Object.fromEntries(
      INDEX_IDS.map((k) => [k, { id: k as LineId, kind: 'ladder', cap: 1, tiers: [[{ kind: 'stat', path: k, add: 0.5 }]] }]),
    ) as unknown as Catalog;
    const s = effectiveStats(BASE, [...INDEX_IDS], frac);
    for (const k of INDEX_IDS) {
      expect(Number.isInteger(s[k]), k).toBe(true);
      expect(s[k], k).toBe(BASE.index[k]);
    }
    const tiny: Catalog = Object.fromEntries(
      INDEX_IDS.map((k) => [k, { id: k as LineId, kind: 'ladder', cap: 1, tiers: [[{ kind: 'stat', path: k, mult: 1e-6 }]] }]),
    ) as unknown as Catalog;
    const t = effectiveStats(BASE, [...INDEX_IDS], tiny);
    expect([t.armor, t.power]).toEqual([0, 0]);
    for (const k of ['reload', 'engines', 'intel'] as const) expect(t[k], k).toBe(1);
    // ...so no derivation ever divides by or multiplies to zero.
    expect(Number.isFinite(t.cooldownScale) && t.cooldownScale > 0).toBe(true);
    expect(t.kinematics.maxSpeed).toBeGreaterThan(0);
    expect(t.kinematics.turnRate).toBeGreaterThan(0);
    expect(Number.isFinite(t.sweepPeriodMs)).toBe(true);
  });

  it('the published damageMultiplier reads ARMOR against an AVERAGE attacker: damageMultiplierFor(armor − base) — ×1 at base', () => {
    for (const clsId of SHIP_CLASS_IDS) {
      for (let n = 0; n <= CATALOG.armor.cap; n += 1) {
        const s = effectiveStats(CONFIG.shipClasses[clsId], stack('armor', n));
        expect(s.damageMultiplier, `${clsId} x${n}`).toBe(damageMultiplierFor(s.armor - CONFIG.index.base));
      }
    }
    expect(effectiveStats(BASE).damageMultiplier).toBe(1);
  });

  it('the fold is IDEMPOTENT: folding twice equals folding once, and re-deriving an already-derived tree changes nothing', () => {
    for (const clsId of SHIP_CLASS_IDS) {
      const cls = CONFIG.shipClasses[clsId];
      const hand = [...stack('engines', 2), ...stack('reload', 3), ...stack('intel', 5), 'deckGun', 'deckGun'] as LineId[];
      expect(effectiveStats(cls, hand)).toEqual(effectiveStats(cls, hand));
      expect(JSON.stringify(effectiveStats(cls))).toBe(JSON.stringify(effectiveStats(cls)));
      const once = effectiveStats(cls, hand);
      const twice = structuredClone(once);
      deriveIndexStats(twice);
      expect(twice).toEqual(once);
    }
  });

  it('the fold is permutation-invariant over the ship ladders', () => {
    const hand: LineId[] = [
      ...stack('engines', 3), ...stack('intel', 4), ...stack('reload', 1), ...stack('armor', 5),
      ...stack('power', 2), ...stack('hullRepair', 3), ...stack('smokeScreen', 1),
    ];
    const a = effectiveStats(BASE, hand);
    const b = effectiveStats(BASE, [...hand].reverse());
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('no `regen` survives on the stats tree or the stat whitelist (PASSIVE HEALING, the card ladder, is gone)', () => {
    expect('regen' in effectiveStats(BASE)).toBe(false);
    // The regen itself is BACK since Story 10.5 (R8) — as a fixed CONFIG law
    // (sim/regen.ts), never a stat: no stat path may address it.
    expect(BOON_STAT_PATH_SET.has('regen.missingPctPerS') || BOON_STAT_PATH_SET.has('regen.outOfCombatMs')).toBe(false);
  });
});

describe('effectiveStats — the deck-gun family (catalog-v3 §4)', () => {
  it('every hull reads CONFIG.gun.barrels (the PvE envelope\'s one-barrel override retired, Story 10.8)', () => {
    for (const id of SHIP_CLASS_IDS) {
      expect(effectiveStats(CONFIG.shipClasses[id]).equipment.gun.barrels, id).toBe(CONFIG.gun.barrels);
    }
  });
});

// ---------------------------------------------------------------------------
// THE TIERED-LINE FOLD (Eric 2026-10-22, Story 9.14: the per-rung VALUE tables
// were CONST pins of catalog content and are deleted). What stays is the fold
// law, stated against CATALOG: every rung a tiered line reaches is the
// zero-card row plus the authored `add`s (in copy order) and times the
// authored `mult`s, with the integer fields floored once after the fold; the
// derived rows follow the folded tier/rung, never an authored number.
// ---------------------------------------------------------------------------
describe('THE TIERED-LINE FOLD — every rung is its CATALOG effects over the zero-card row', () => {
  const TIERED = LINE_IDS.filter((id) => tierTargetOf(CATALOG[id]) !== undefined);

  it.each(TIERED.map((id) => [id] as const))('%s: each authored path is base + Σadd / base × Πmult, integer fields floored once', (id) => {
    const base = effectiveStats(BASE).equipment as unknown as Record<string, Record<string, number>>;
    const acc = new Map<string, number>();
    for (let n = 1; n <= CATALOG[id].cap; n += 1) {
      for (const e of CATALOG[id].tiers[n - 1]!) {
        if (e.kind !== 'stat') continue;
        const [, row, field] = e.path.split('.') as [string, string, string];
        const prev = acc.get(e.path) ?? base[row]![field]!;
        acc.set(e.path, e.mult !== undefined ? prev * e.mult : prev + (e.add ?? 0));
      }
      const eq = effectiveStats(BASE, stack(id, n)).equipment as unknown as Record<string, Record<string, number>>;
      for (const [path, want] of acc) {
        const [, row, field] = path.split('.') as [string, string, string];
        const got = eq[row]![field]!;
        if (EQUIPMENT_INT_FIELDS.includes(field)) expect(got, `${id} x${n}: ${path}`).toBe(Math.floor(want + 1e-9));
        else expect(got, `${id} x${n}: ${path}`).toBeCloseTo(want, 9);
      }
    }
  });

  it('the derived rows follow the fold at every rung: contact trip rings ride the blast, the captive ring rides the tier on a fixed burst, the broadside arcs ride the rung', () => {
    for (let n = 0; n <= 5; n += 1) {
      const naval = effectiveStats(BASE, stack('navalMines', n)).equipment.navalMines;
      expect(naval.triggerRadius, `naval x${n}`).toBeCloseTo(mineTriggerRadius(naval.blastRadius), 9);
      expect(naval.slowFactor, `naval x${n}: a naval mine never fouls (amendment 81)`).toBe(1);
      const fouling = effectiveStats(BASE, stack('foulingMines', n)).equipment.foulingMines;
      expect(fouling.triggerRadius, `fouling x${n}`).toBeCloseTo(mineTriggerRadius(fouling.blastRadius), 9);
      const captive = effectiveStats(BASE, stack('captiveMines', n)).equipment.captiveMines;
      expect(captive.triggerRadius, `captive x${n}`).toBe(captiveTriggerRadius(captive.tier));
      expect(captive.blastRadius, `captive x${n}: the burst never steps (amendment 84d)`).toBe(CONFIG.captiveMines.blastRadius);
      const bs = effectiveStats(BASE, stack('broadside', n)).equipment.broadside;
      expect(bs.traverseRad, `broadside x${n}`).toBe(broadsideTraverse(bs.spreadRung));
      expect(bs.mountSpreadRad, `broadside x${n}`).toBe(broadsideMountSpread(bs.spreadRung));
      const ph = effectiveStats(BASE, stack('phosphorShells', n)).equipment.phosphorShells;
      expect(Number.isInteger(ph.dps), `phosphor x${n}: burn is whole hp (amendment 39)`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// STORY 8.15 — THE PICKABLE GUNS' LADDERS AND THE CLASS SHIFT ROWS (Eric
// rulings 2026-09-28, epic-8 amendments 97–105). Each gun ladder is the DECK
// GUN's shape exactly: `appliesTo` advances the gun's TIER (1 + copies), and
// the per-weapon RELOAD bonus is DERIVED from that tier in clampStats — the
// one formula every row uses (Story 10.6, R5). The per-rung numbers live in
// the TIERED-LINE FOLD and RELOAD BONUS relations, never as tables (Story 9.14).
// ---------------------------------------------------------------------------
describe('STORY 8.15 — the machine gun and flak ladders (amendments 104/105)', () => {
  it('MACHINE GUN: a malformed shot delay (≤ 0 or non-finite) falls back to the CONFIG base; the ladder\'s Tier V delay is untouched (plumbing guard)', () => {
    const bad = (over: { add?: number; mult?: number }): Catalog => ({
      machineGun: {
        id: 'machineGun', kind: 'ladder', cap: 1, appliesTo: ['machineGun'],
        tiers: [[{ kind: 'stat', path: 'equipment.machineGun.rateMs', ...over }]],
      },
    } as unknown as Catalog);
    // The fold's sanity gate (boons.ts) skips the bad effect first; the
    // clampStats guard (guardRateMs) is the output contract behind it.
    for (const over of [{ add: -1000 }, { mult: 0 }, { add: Number.NaN }, { add: Number.POSITIVE_INFINITY }]) {
      const mg = effectiveStats(BASE, ['machineGun'], bad(over)).equipment.machineGun;
      expect(mg.rateMs, JSON.stringify(over)).toBe(CONFIG.machineGun.rateMs);
    }
    const authored = CATALOG.machineGun.tiers
      .flat()
      .filter((e) => e.kind === 'stat' && e.path === 'equipment.machineGun.rateMs')
      .reduce((sum, e) => sum + (e as { add: number }).add, 0);
    expect(effectiveStats(BASE, stack('machineGun', 4)).equipment.machineGun.rateMs).toBe(CONFIG.machineGun.rateMs + authored);
  });

  it('TORPEDO RUN (Story 11.2 review gate, F7): a malformed Tier I run (≤ 0 or non-finite — the base row, the one path the fold\'s sanity gate does not screen) never leaves the firewall: every torpedo row still carries a finite, positive run; a healthy row passes through untouched', () => {
    const kinds = [
      ['lightTorpedo', CONFIG.lightTorpedo],
      ['heavyTorpedo', CONFIG.torpedo],
      ['supercavTorpedo', CONFIG.supercavTorpedo],
    ] as const;
    for (const [row, cfg] of kinds) {
      const dial = cfg as { runU: number };
      const shipped = dial.runU;
      expect(effectiveStats(BASE).equipment[row].runU, row).toBe(shipped);
      try {
        for (const bad of [0, -shipped, Number.NaN, Number.POSITIVE_INFINITY]) {
          dial.runU = bad;
          const run = effectiveStats(BASE).equipment[row].runU;
          expect(Number.isFinite(run) && run > 0, `${row} base ${bad} -> ${run}`).toBe(true);
        }
      } finally {
        dial.runU = shipped;
      }
    }
  });

  it('MACHINE GUN: RELOAD shortens the reload but never the shot delay (the reload law reaches reloadMs only)', () => {
    const plain = effectiveStats(BASE, stack('machineGun', 4)).equipment.machineGun;
    const s = effectiveStats(BASE, [...stack('machineGun', 4), ...stack('reload', 5)]);
    const mg = s.equipment.machineGun;
    expect(mg.rateMs).toBe(plain.rateMs);
    expect(mg.reloadMs).toBeLessThan(plain.reloadMs);
    expect(mg.reloadMs).toBe(CONFIG.machineGun.reloadMs * reloadCooldownScale(s.reload + CONFIG.catalog.reloadBonusPerTier * (mg.tier - 1)));
  });

  it('a gun ladder steps ONLY its own gun: the machine gun ladder never touches the cannon or flak (and back)', () => {
    const base = effectiveStats(BASE).equipment;
    const mg = effectiveStats(BASE, stack('machineGun', 4)).equipment;
    const flak = effectiveStats(BASE, stack('flak', 4)).equipment;
    const cannon = effectiveStats(BASE, stack('deckGun', 4)).equipment;
    expect([mg.gun, mg.flak]).toEqual([base.gun, base.flak]);
    expect([flak.gun, flak.machineGun]).toEqual([base.gun, base.machineGun]);
    expect([cannon.machineGun, cannon.flak]).toEqual([base.machineGun, base.flak]);
  });

  it('the two guns\' ranges are their OWN dials, never the radar rung (Story 9.8, ruling 125)', () => {
    const s = effectiveStats(BASE);
    expect(s.equipment.machineGun.rangeU).toBe(CONFIG.machineGun.rangeU);
    expect(s.equipment.flak.rangeU).toBe(CONFIG.flak.rangeU);
  });
});

describe('STORY 8.15 — the class Shift rows; RELOAD leaves them alone since Story 10.5 (R10; amendments 97/99 superseded)', () => {
  it('a maxed RELOAD ladder moves no Shift row — reload, window, Armor bonus and charges all hold', () => {
    const base = effectiveStats(BASE).equipment;
    const maxedStats = effectiveStats(BASE, stack('reload', 5));
    expect(maxedStats.cooldownScale).toBeLessThan(1);
    const maxed = maxedStats.equipment;
    for (const shift of ['instantReload', 'hunker', 'boost'] as const) {
      expect(maxed[shift].reloadMs, shift).toBe(base[shift].reloadMs);
      expect(maxed[shift].maxAmmo, shift).toBe(base[shift].maxAmmo);
    }
    // The window and the Armor bonus are Eric's fixed numbers — RELOAD never
    // moves them (Story 9.7, epic-9 amendments 86–88 / 110–117).
    expect([maxed.hunker.durationMs, maxed.hunker.armorBonus])
      .toEqual([CONFIG.hunker.durationMs, CONFIG.hunker.armorBonus]);
  });

  it('no catalog line steps a Shift row\'s tier (no card can address a Shift)', () => {
    for (const id of LINE_IDS) {
      for (const shift of ['boost', 'instantReload', 'hunker'] as const) {
        const s = effectiveStats(BASE, stack(id, CATALOG[id].cap)).equipment[shift];
        expect(s.tier, `${id} → ${shift}`).toBe(1);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// THE FIVE TORPEDO / MINE LADDERS (Story 8.13 — catalog-v3 §4 as amended by
// Eric's 2026-09-19 rulings, epic-8 amendments 74/77/80/81/82/84d). The
// per-rung value tables are deleted (Story 9.14, Eric 2026-10-22: CONST pins
// of catalog content).
//
// TWO THINGS ARE DERIVED, NOT AUTHORED, and are pinned as relations:
//   - the per-weapon RELOAD bonus (Story 10.6, R5 — sim/stats.ts applyReloadLaw);
//   - the CAPTIVE mine's trip ring, which steps ×1.1 off the ROW'S TIER while
//     its 32 u burst never moves (amendment 84d).
// (The +0.5 pool steps are GONE: Story 10.6, R4 — capacity left the tiers.)
// ---------------------------------------------------------------------------
describe('STORY 8.13 — the torpedo ladders (amendments 80/84f)', () => {
  it('tier I is a STRAIGHT-RUNNER on both lines — turn rate 0, and 0.5 rad/s at V', () => {
    for (const id of ['lightTorpedo', 'heavyTorpedo'] as const) {
      expect(effectiveStats(BASE, stack(id, 1)).equipment[id].homingTurnRate, id).toBe(0);
      expect(effectiveStats(BASE, stack(id, 5)).equipment[id].homingTurnRate, id)
        .toBeCloseTo(CONFIG.torpedo.homingTurnRate, 9);
    }
  });
});

// ---------------------------------------------------------------------------
// STORY 8.17 — the STAR SHELLS, BROADSIDE and PHOSPHOR SHELLS ladders (Eric
// rulings 2026-09-29, epic-8 amendments 130/131/133). The per-weapon RELOAD
// bonus is DERIVED from each row's tier exactly as for the torpedoes; every other step
// is authored in sim/catalog.ts.
// ---------------------------------------------------------------------------
describe('STORY 8.17 — the star shell, broadside and phosphor ladders (amendments 130/131/133)', () => {
  it('three lines held together each fold to their own rung — the joint fold is each line\'s solo fold', () => {
    const s = effectiveStats(BASE, [...stack('starShells', 3), ...stack('broadside', 5), 'phosphorShells']);
    expect(s.equipment.starShells).toEqual(effectiveStats(BASE, stack('starShells', 3)).equipment.starShells);
    expect(s.equipment.broadside).toEqual(effectiveStats(BASE, stack('broadside', 5)).equipment.broadside);
    expect(s.equipment.phosphorShells).toEqual(effectiveStats(BASE, ['phosphorShells']).equipment.phosphorShells);
  });

  it('the three lines take the ship\'s RELOAD and their own Tier V bonus in the one haste law (Story 10.5, R11; Story 10.6, R5)', () => {
    const s = effectiveStats(BASE, [
      ...stack('starShells', 5), ...stack('broadside', 5), ...stack('phosphorShells', 5), ...stack('reload', 5),
    ]);
    expect(s.cooldownScale).toBeLessThan(1);
    for (const id of ['starShells', 'broadside', 'phosphorShells'] as const) {
      const solo = effectiveStats(BASE, stack(id, 5)).equipment[id].reloadMs;
      expect(s.equipment[id].reloadMs, id).toBeLessThan(solo);
      expect(s.equipment[id].reloadMs, id).toBe(CONFIG[id].reloadMs * reloadCooldownScale(s.reload + 4 * CONFIG.catalog.reloadBonusPerTier));
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
// THE PER-WEAPON RELOAD BONUS (Story 10.6, Eric 2026-11-05, R5) — it REPLACED
// catalog-v3 §3's −5 %-per-tier step. Each tier above I adds
// `reloadBonusPerTier` to the ship's RELOAD for THAT row only, inside the one
// haste law. ONE formula covers the deck gun and every equipment line,
// because `equipment.gun.tier` counts `1 + deckGun copies` (tier I ships
// equipped) while an equipment line's tier IS its copies held (copy 1 IS tier
// I). See sim/stats.ts applyReloadLaw; the per-hull sweep is in
// catalogUnderIndex.test.ts.
// ---------------------------------------------------------------------------
describe('THE PER-WEAPON RELOAD BONUS (Story 10.6, R5)', () => {
  it('every tiered row reads its own base × haste(base index + bonus × (tier − 1)): ×1 at tier I, shorter every tier', () => {
    const bonus = CONFIG.catalog.reloadBonusPerTier;
    const base = effectiveStats(BASE).equipment;
    for (const id of LINE_IDS) {
      const target = tierTargetOf(CATALOG[id]);
      if (target === undefined) continue;
      for (let n = 0; n <= CATALOG[id].cap; n += 1) {
        const row = effectiveStats(BASE, stack(id, n)).equipment[target];
        expect(row.reloadMs, `${id} x${n}`).toBe(base[target].reloadMs * reloadCooldownScale(CONFIG.index.base + bonus * (row.tier - 1)));
      }
      const atV = effectiveStats(BASE, stack(id, CATALOG[id].cap)).equipment[target];
      expect(atV.tier, id).toBe(5);
      expect(atV.reloadMs, id).toBeLessThan(base[target].reloadMs);
    }
  });

  it('the tier counts the copies: a ladder is 1 + copies (tier I ships equipped), an equipment line is its copies with copy 1 the bare weapon', () => {
    for (const id of LINE_IDS) {
      const target = tierTargetOf(CATALOG[id]);
      if (target === undefined) continue;
      for (let n = 0; n <= CATALOG[id].cap; n += 1) {
        const tier = effectiveStats(BASE, stack(id, n)).equipment[target].tier;
        expect(tier, `${id} x${n}`).toBe(CATALOG[id].kind === 'ladder' ? 1 + n : Math.max(1, n));
      }
    }
  });

  it('the bonus and the ship\'s RELOAD ADD inside the one law: a maxed deck gun under a maxed RELOAD runs at haste(RELOAD + its Tier V bonus)', () => {
    const s = effectiveStats(BASE, [...stack('deckGun', 4), ...stack('reload', 5)]);
    const bonus = CONFIG.catalog.reloadBonusPerTier * (s.equipment.gun.tier - 1);
    expect(s.equipment.gun.reloadMs).toBe(CONFIG.gun.reloadMs * reloadCooldownScale(s.reload + bonus));
    // ...never the old product of two scales.
    const product = CONFIG.gun.reloadMs * reloadCooldownScale(CONFIG.index.base + bonus) * s.cooldownScale;
    expect(s.equipment.gun.reloadMs).not.toBeCloseTo(product, 0);
  });

  it('a line with no tier target moves no tier at all (the DEPTH CHARGE stub is not a rung)', () => {
    const s = effectiveStats(BASE, stack('depthCharge', CATALOG.depthCharge.cap));
    for (const id of EQUIPMENT_IDS) expect(s.equipment[id].tier, id).toBe(1);
    expect(s).toEqual(effectiveStats(BASE));
  });
});

describe('THE FRACTIONAL FLOOR (catalog-v3 R17 standing rule)', () => {
  it('a +0.5 integer step shows nothing alone and a whole barrel when it completes (from the fixed base CONFIG.gun.barrels, Story 9.12)', () => {
    // A TEST-ONLY line: no production line authors barrels any more (fixed at
    // CONFIG.gun.barrels since Story 9.12); the +0.5 tube steps are the live
    // users of the rule. The base must leave room under the 1..3 clamp.
    const base = CONFIG.gun.barrels;
    expect(base + 1).toBeLessThanOrEqual(3);
    const half: Catalog = {
      halfBarrel: {
        id: 'halfBarrel' as LineId,
        kind: 'ladder',
        cap: 2,
        tiers: new Array(2).fill([{ kind: 'stat', path: 'equipment.gun.barrels', add: 0.5 }]),
      },
    };
    const barrels = (n: number): number =>
      effectiveStats(BASE, new Array<string>(n).fill('halfBarrel'), half).equipment.gun.barrels;
    expect(barrels(0)).toBe(base);
    expect(barrels(1)).toBe(base); // base + 0.5 accumulated, floors to base — nothing appears
    expect(barrels(2)).toBe(base + 1); // the fraction completes a whole
  });

  it('gun.barrels is clamped to 1..3 after the floor — barrels are a fixed 2 since Story 9.12 and the clamp guards malformed data', () => {
    const rogue = (over: { add?: number; mult?: number }): Catalog => ({
      x: { id: 'x' as unknown as LineId, kind: 'ladder', cap: 1, tiers: [[{ kind: 'stat', path: 'equipment.gun.barrels', ...over }]] },
    });
    expect(effectiveStats(BASE, ['x'], rogue({ add: 10 })).equipment.gun.barrels).toBe(3);
    // A sub-1 fold survives the positive-scalar gate but the clamp floors it to 1.
    expect(effectiveStats(BASE, ['x'], rogue({ mult: 0.1 })).equipment.gun.barrels).toBe(1);
  });
});

describe('effectiveStats — doctrine verb folds (NO add-on is left since Story 8.17)', () => {
  it('the star shell carries no verb any more, and the former add-on ids fold as their new kinds', () => {
    // HEAT SEEKING and the missile's `homing` verb are CUT (Story 8.15, 89e);
    // the star shell's `phosphor`/`dazzle` are DELETED (Story 8.17, Eric
    // 2026-09-29, amendment 134). This pin is REWRITTEN, not removed: what it
    // asserted — each add-on sets its own verb — is no longer true of the game.
    const eq = effectiveStats(BASE).equipment as unknown as Record<string, Record<string, unknown>>;
    for (const verb of ['phosphor', 'dazzle']) expect(verb in eq.starShells!, verb).toBe(false);
    // PHOSPHOR SHELLS copy 1 is the bare weapon: it fits and moves no number.
    expect(effectiveStats(BASE, ['phosphorShells'])).toEqual(effectiveStats(BASE));
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

  it('a doctrine effect naming the DELETED star-shell verbs is a fail-closed no-op (amendment 134)', () => {
    // The machinery stays (the `doctrine` kind, applyDoctrineEffect) but the
    // vocabulary is empty, so an untyped line carrying the old verbs moves
    // nothing — never a stray boolean written onto the star-shell row.
    const rogue: Catalog = {
      x: {
        id: 'x' as unknown as LineId,
        kind: 'addon',
        cap: 1,
        tiers: [[
          { kind: 'doctrine', weapon: 'starShells', mode: 'phosphor' },
          { kind: 'doctrine', weapon: 'starShells', mode: 'dazzle' },
        ]],
      },
    };
    expect(effectiveStats(BASE, ['x'], rogue)).toEqual(effectiveStats(BASE));
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
          { kind: 'doctrine', weapon: 'radarBuoy' as EquipmentId, mode: 'jamming' }, // the DELETED buoy (R1, Story 8.16)
          { kind: 'doctrine', weapon: 'starShells', mode: 'litRadius' }, // a real field, NOT a verb
        ]],
      },
    };
    expect(effectiveStats(BASE, ['x'], rogue)).toEqual(effectiveStats(BASE));
  });
});

// ---------------------------------------------------------------------------
// STORY 9.8 — WEAPON RANGES ARE TIERED DIALS (Eric 2026-10-13, epic-9 ruling
// 125, superseding amendment 105's "defaults = today's values"; hectometer
// facts since Story 11.2). Each tiered weapon's reach is `CONFIG.<w>.rangeU`
// at Tier I plus an EVEN step per upgrade card, landing on
// `CONFIG.<w>.rangeUAtV` at Tier V. Asserted by derivation, never by literals
// (epic-9 amendment 8).
// ---------------------------------------------------------------------------
describe('STORY 9.8 — every weapon range is its own tiered dial (ruling 125)', () => {
  // [weapon, line, copies at Tier I]: a LADDER's Tier I is zero copies (the
  // gun ships equipped); an EQUIPMENT line's Tier I is its first copy.
  const LINES: readonly [RangedWeapon, LineId, number][] = [
    ['gun', 'deckGun', 0],
    ['machineGun', 'machineGun', 0],
    ['flak', 'flak', 0],
    ['broadside', 'broadside', 1],
    ['starShells', 'starShells', 1],
    ['phosphorShells', 'phosphorShells', 1],
  ];

  // Since Story 11.2 the reaches are hectometer facts (not binary-exact), so
  // the fold's repeated adds land on Tier V to float precision, not bit for
  // bit — the "no dust" exactness was a property of the retired 125 u rung.
  it.each(LINES)('%s: 0 / 2 / 4 upgrade cards reach Tier I + k × step, and four cards land on Tier V', (w, line, tierI) => {
    for (const k of [0, 1, 2, 3, 4]) {
      const row = effectiveStats(BASE, stack(line, tierI + k)).equipment[w];
      expect(row.rangeU, `${w} +${k}`).toBeCloseTo(CONFIG[w].rangeU + k * rangeStep(w), 6);
    }
    expect(effectiveStats(BASE, stack(line, tierI + 4)).equipment[w].rangeU).toBeCloseTo(CONFIG[w].rangeUAtV, 6);
    // The step is a positive climb (Tier V outreaches Tier I on every line).
    expect(rangeStep(w)).toBeGreaterThan(0);
  });

  it('rangeU is never floored — a fractional reach (a 31.25 u step) survives the fold', () => {
    const bs = effectiveStats(BASE, stack('broadside', 2)).equipment.broadside;
    expect(bs.rangeU).toBe(CONFIG.broadside.rangeU + rangeStep('broadside'));
    expect(Number.isInteger(bs.rangeU)).toBe(false);
  });

  it('a RADAR fold never moves a weapon range (the post-fold re-pin is deleted)', () => {
    const rogue: Catalog = {
      x: { id: 'x', kind: 'ladder', cap: 1, tiers: [[{ kind: 'stat', path: 'radarRange', mult: 2 }]] },
    } as unknown as Catalog;
    const base = effectiveStats(BASE).equipment;
    const wide = effectiveStats(BASE, ['x' as LineId], rogue).equipment;
    for (const [w] of LINES) expect(wide[w].rangeU, w).toBe(base[w].rangeU);
  });
});

describe('effectiveStats — derived ranges and rings', () => {
  it('no card writes radarRange', () => {
    const writers = LINE_IDS.filter((id) =>
      CATALOG[id].tiers.some((t) => t.some((e) => e.kind === 'stat' && e.path === 'radarRange')),
    );
    expect(writers).toEqual([]);
  });

  // The 'sightRange is DERIVED as radarRange/3' pin is DELETED (Story 11.2,
  // 2026-11-12, epic-11 amendment 4): the two eye
  // reaches are their own CONFIG facts. What stays is the mechanism — they
  // are read from CONFIG, never stat-addressable, and a radar write never
  // moves them.
  it('the two eye reaches are the CONFIG facts, never stat-addressable, and a radar fold never moves them (Story 11.2, R3)', () => {
    const s = effectiveStats(BASE);
    expect(s.sightRange).toBe(CONFIG.vision.sight);
    expect(s.hullSightRange).toBe(CONFIG.vision.hullSight);
    expect(BOON_STAT_PATH_SET.has('sightRange')).toBe(false);
    expect(BOON_STAT_PATH_SET.has('hullSightRange')).toBe(false);
    const rogue: Catalog = {
      x: { id: 'x', kind: 'ladder', cap: 1, tiers: [[{ kind: 'stat', path: 'radarRange', mult: 2 }]] },
    } as unknown as Catalog;
    const wide = effectiveStats(BASE, ['x' as LineId], rogue);
    expect(wide.radarRange).toBe(s.radarRange * 2);
    expect([wide.sightRange, wide.hullSightRange]).toEqual([s.sightRange, s.hullSightRange]);
  });

  // The "eighths ladder ordering holds by ARITHMETIC" pin is DELETED (Story
  // 9.8): it re-derived farRadar from a hard-coded 0.875 and so could never
  // fail (deferred-work 1552, epic-9 amendment 8). (The rung-ratio pins that
  // replaced it in zone.test.ts are deleted with the ladder, Story 11.2.)

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
    // The rung walks BOTH ladders in OPPOSITE directions (Eric 2026-08-27).
    // The BROADSIDE line writes it since Story 8.17 (amendment 133 — its fold
    // is the TIERED-LINE FOLD relation); this pin drives it through an injected catalog so
    // it isolates the rung from the line's turret step.
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
    // TRUE OF THE LADDERED LINES TOO: the steps live on tiers II–V, so a hull
    // holding exactly one LIGHT TORPEDO card sails the tier-I fish.
    for (const id of ['lightTorpedo', 'heavyTorpedo', 'navalMines', 'captiveMines', 'foulingMines',
      'broadside', 'starShells', 'phosphorShells', 'supercavTorpedo', 'dazzleShells', 'foulingShell'] as const) {
      expect(effectiveStats(BASE, [id]), id).toEqual(effectiveStats(BASE));
    }
  });

  it('a GUN LADDER moves only its own gun\'s row — no crash, no leak (Story 8.15)', () => {
    // machineGun / flak were STUB equipment lines until 8.15; they are their
    // guns' ladders now, and every copy — copy 1 included — is a real step.
    const identity = effectiveStats(BASE);
    // No `damage`: the machine gun's 5 is flat since Story 9.12 (Eric 2026-10-16).
    expect(changed(identity, effectiveStats(BASE, stack('machineGun', 4)))).toEqual([
      'equipment.machineGun.maxAmmo', 'equipment.machineGun.rangeU',
      'equipment.machineGun.rateMs', 'equipment.machineGun.reloadMs', 'equipment.machineGun.tier',
    ]);
    expect(changed(identity, effectiveStats(BASE, stack('flak', 4)))).toEqual([
      'equipment.flak.damage', 'equipment.flak.maxAmmo', 'equipment.flak.rangeU', 'equipment.flak.reloadMs',
      'equipment.flak.tier',
    ]);
  });

});

describe('equipment helpers', () => {
  it('equipmentMaxAmmo / equipmentReloadMs are lookups into the total record', () => {
    const s = effectiveStats(BASE, stack('reload', 1));
    for (const id of EQUIPMENT_IDS) {
      expect(equipmentMaxAmmo(s, id), id).toBe(s.equipment[id].maxAmmo);
      expect(equipmentReloadMs(s, id), id).toBe(s.equipment[id].reloadMs);
    }
    // ONE RELOAD copy scales the weapon lookups by the haste law (Story 10.3,
    // ruling 14), slot weapons included (Story 10.5, R11); a Shift's is left
    // alone (R10).
    expect(s.cooldownScale).toBeLessThan(1);
    expect(equipmentReloadMs(s, 'navalMines')).toBeCloseTo(CONFIG.mine.reloadMs * s.cooldownScale, 9);
    expect(equipmentReloadMs(s, 'boost')).toBe(CONFIG.boost.reloadMs);
    expect(equipmentReloadMs(s, 'gun')).toBeCloseTo(CONFIG.gun.reloadMs * s.cooldownScale, 9);
  });

  it('the tick-count consequence: a doubled RELOAD (haste exactly ×0.5) never costs a reload an extra tick of float dust', () => {
    // Inlined ammo.ts loop shape (server/src/game/equipment/ammo.ts) — do not
    // import server code into a shared test. Float dust in the scale would cost
    // a whole extra tick; the derivation's round3 is what prevents it.
    const ticksToRefill = (reloadMs: number): number => {
      let left = reloadMs;
      let n = 0;
      while (left > 0) {
        left -= 50;
        n += 1;
      }
      return n;
    };
    // An index whose haste is exact in three decimals (RELOAD 200 → ×0.5), so
    // the round3 itself adds nothing and any extra tick would be float dust.
    // (Since Story 10.6's +10 cards a CARD-built index is generally NOT exact
    // in three decimals — RELOAD 150 rounds ×0.6667 to ×0.667 — and that
    // rounding, not dust, can cost one tick; this pin covers the dust only.)
    const base = effectiveStats(BASE);
    const capped = effectiveStats({ ...BASE, index: { ...BASE.index, reload: 2 * CONFIG.index.base } });
    // Only the rows RELOAD reaches (Story 10.5, R10 / R11) carry the scale.
    for (const id of RELOAD_SCALED_IDS) {
      // The independent oracle: the haste law as exact INTEGER arithmetic —
      // base × 100 / RELOAD at the cap (ruling 14's algebraic twin), never
      // through the folded float scale.
      const exact = (base.equipment[id].reloadMs * CONFIG.index.base) / capped.reload;
      expect(ticksToRefill(capped.equipment[id].reloadMs), id).toBe(Math.ceil(exact / 50));
    }
  });
});

// ---------------------------------------------------------------------------
// THE RELOAD-LAW FLOOR. A deep tier adds a large bonus to the haste law's
// input; the law itself is floored at ×0.1 (sim/indexStats.ts
// reloadCooldownScale), so no tier — however deep an injected catalog takes
// it — gives a zero cadence (unlimited fire, and `rescaleReloadTimers`
// multiplying a running timer by 0) or a negative one (a reload that never
// completes).
// ---------------------------------------------------------------------------
describe('the per-weapon reload law FLOORS at x0.1 (hostile / over-capped tier)', () => {
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
      expect(gun.reloadMs, `${copies}`).toBe(base * reloadCooldownScale(CONFIG.index.base + CONFIG.catalog.reloadBonusPerTier * copies));
    }
    // A hostile ship index far past any card lands on the floor.
    const rogue = { ...BASE, index: { ...BASE.index, reload: 1e6 } };
    expect(effectiveStats(rogue, stack('deckGun', 24), deepLadder).equipment.gun.reloadMs).toBeCloseTo(base * 0.1, 6);
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
  /** Two lines over one row: a held one-copy TEST ladder (an injected id, not
   *  a production line), then an UNHELD deck gun. */
  const twoClaimants: Catalog = {
    testGunClaimant: { id: 'testGunClaimant' as LineId, kind: 'ladder', cap: 1, appliesTo: ['gun'], tiers: [[]] },
    deckGun: CATALOG.deckGun,
  };

  it('the held line keeps the tier it bought, whatever sorts after it', () => {
    expect(effectiveStats(BASE, ['testGunClaimant'], twoClaimants).equipment.gun.tier).toBe(2);
  });

  it('...and an unheld catalog still reads every row at tier 1', () => {
    expect(effectiveStats(BASE, [], twoClaimants).equipment.gun.tier).toBe(1);
  });
});

describe('deriveMineRings — the mine rings re-pinned from the folded row', () => {
  const rows = (): EffectiveStats['equipment'] => structuredClone(effectiveStats(BASE).equipment);

  it('a contact mine’s trip ring follows its own blast; the captive ring follows its tier', () => {
    const eq = rows();
    eq.navalMines.blastRadius = 123;
    eq.navalMines.triggerRadius = -1;
    eq.foulingMines.blastRadius = 77;
    eq.foulingMines.triggerRadius = -1;
    eq.captiveMines.tier = 3;
    eq.captiveMines.triggerRadius = -1;
    deriveMineRings(eq);
    expect(eq.navalMines.triggerRadius).toBe(mineTriggerRadius(123));
    expect(eq.foulingMines.triggerRadius).toBe(mineTriggerRadius(77));
    expect(eq.captiveMines.triggerRadius).toBe(captiveTriggerRadius(3));
  });

  it('a captive burst grown by any path is pinned back to the base burst', () => {
    const baseBurst = effectiveStats(BASE).equipment.captiveMines.blastRadius;
    const eq = rows();
    eq.captiveMines.blastRadius = baseBurst * 10;
    deriveMineRings(eq);
    expect(eq.captiveMines.blastRadius).toBe(baseBurst);
  });

  it('is idempotent: a second pass changes nothing', () => {
    const eq = rows();
    eq.navalMines.blastRadius = 200;
    deriveMineRings(eq);
    const once = structuredClone(eq);
    deriveMineRings(eq);
    expect(eq).toEqual(once);
  });
});

describe('THE EXHAUSTED HULL\'S BONUS POINTS — folded after the cards, beyond the cap (Story 10.7, R5)', () => {
  const POINTS = CONFIG.offer.exhausted.indexPoints;
  const BONUS_IDS = CONFIG.offer.exhausted.indices;
  /** The index step one card of `id`'s ladder authors. */
  const cardStep = (id: LineId): number => (CATALOG[id].tiers[0].find((e) => e.kind === 'stat') as { add: number }).add;
  /** Every numeric path that moved from `a` to `b`, with the sign of the move. */
  const moves = (a: EffectiveStats, b: EffectiveStats): Map<string, number> => {
    const fa = flatten(a);
    const fb = flatten(b);
    const out = new Map<string, number>();
    for (const path of changed(a, b)) {
      const va = fa.get(path);
      const vb = fb.get(path);
      if (typeof va === 'number' && typeof vb === 'number') out.set(path, Math.sign(vb - va));
    }
    return out;
  };

  it('the stats a level may land on are distinct indices, exactly the index list — nothing else (no HULL REPAIR, no SMOKE SCREEN, no RANGE since Story 11.2)', () => {
    expect(new Set(BONUS_IDS).size).toBe(BONUS_IDS.length);
    expect([...BONUS_IDS].sort()).toEqual([...INDEX_IDS].sort());
  });

  it('no bonus — absent, empty, or all zeros — is byte-identical to the fold without the argument', () => {
    const zeros = Object.fromEntries(INDEX_IDS.map((id) => [id, 0]));
    const builds: LineId[][] = [[], stack('armor', 2), ['engines', 'reload', 'intel', 'power']];
    for (const clsId of SHIP_CLASS_IDS) {
      const cls = CONFIG.shipClasses[clsId];
      for (const cards of builds) {
        const plain = effectiveStats(cls, cards);
        expect(effectiveStats(cls, cards, CATALOG, {}), clsId).toEqual(plain);
        expect(effectiveStats(cls, cards, CATALOG, zeros), clsId).toEqual(plain);
      }
    }
  });

  it.each(BONUS_IDS)('%s: one point raises exactly that index by the CONFIG amount, and moves only what a card of it moves, the same way', (id) => {
    const base = effectiveStats(BASE);
    const bonus = effectiveStats(BASE, [], CATALOG, { [id]: 1 });
    expect(bonus[id]).toBe(base[id] + POINTS);
    for (const other of INDEX_IDS) if (other !== id) expect(bonus[other], other).toBe(base[other]);
    const byCard = moves(base, effectiveStats(BASE, [id]));
    const byBonus = moves(base, bonus);
    expect(byBonus.get(id)).toBe(1);
    for (const [path, sign] of byBonus) expect(byCard.get(path), path).toBe(sign);
    // AT THE CARD CAP TOO (Story 10.7, R6): a point on a capped ladder still
    // moves what a card of it moves — INTEL's sweep included, now uncapped.
    const capped = stack(id, CATALOG[id].cap);
    const atCap = moves(effectiveStats(BASE, capped), effectiveStats(BASE, capped, CATALOG, { [id]: 1 }));
    expect(atCap.get(id)).toBe(1);
    for (const [path, sign] of atCap) expect(byCard.get(path), `at cap: ${path}`).toBe(sign);
    if (id === 'intel') for (const path of ['sweepRpm', 'sweepPeriodMs']) expect(atCap.get(path), `at cap: ${path}`).toBe(byCard.get(path));
  });

  it.each(BONUS_IDS)('%s: as many points as one card\'s step fold to exactly that card', (id) => {
    const k = cardStep(id) / POINTS;
    expect(Number.isInteger(k)).toBe(true);
    expect(effectiveStats(BASE, [], CATALOG, { [id]: k })).toEqual(effectiveStats(BASE, [id]));
  });

  it.each(BONUS_IDS)('%s: points ADD past the ladder\'s card cap', (id) => {
    const capped = stack(id, CATALOG[id].cap);
    const atCap = effectiveStats(BASE, capped);
    expect(effectiveStats(BASE, capped, CATALOG, { [id]: 3 })[id]).toBe(atCap[id] + 3 * POINTS);
  });

  it('a malformed count (negative, fractional, non-finite, not a number) is ignored or floored — fail-closed', () => {
    const plain = effectiveStats(BASE);
    const junk = { armor: -4, power: Number.NaN, engines: Number.POSITIVE_INFINITY, reload: 0.5, intel: 'x' as unknown as number };
    expect(effectiveStats(BASE, [], CATALOG, junk)).toEqual(plain);
    expect(effectiveStats(BASE, [], CATALOG, { intel: 2.9 }).intel).toBe(plain.intel + 2 * POINTS);
  });

  it('a count past the safe-integer range (1e308, MAX_SAFE_INTEGER + 2) is ignored, not folded; a null bonus is no bonus', () => {
    const plain = effectiveStats(BASE);
    for (const n of [1e308, Number.MAX_SAFE_INTEGER + 2, -Number.MAX_VALUE]) {
      expect(effectiveStats(BASE, [], CATALOG, { intel: n, armor: n }), String(n)).toEqual(plain);
    }
    expect(effectiveStats(BASE, [], CATALOG, null)).toEqual(plain);
    expect(effectiveStats(BASE, ['intel'], CATALOG, null)).toEqual(effectiveStats(BASE, ['intel']));
  });

  it('bonusCount is the one acceptance rule: a floored non-negative safe integer, else 0', () => {
    expect(bonusCount(3)).toBe(3);
    expect(bonusCount(2.9)).toBe(2);
    expect(bonusCount(0)).toBe(0);
    expect(bonusCount(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
    for (const bad of [undefined, null, 'x', Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1, -0.5, 1e308, Number.MAX_SAFE_INTEGER + 2]) {
      expect(bonusCount(bad), String(bad)).toBe(0);
    }
  });
});
