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
//   (4) the clamps: sweepRpm ≤ sweepRpmMax, the mine ring derivations,
//       gun.barrels 1..3, the spread-rung ladder;
//   (5) THE EQUIPMENT RELOAD STEP — −5 %/tier, additive, composed BEFORE the
//       global RELOAD ladder — as a relation over every tiered row;
//   (6) THE FRACTIONAL FLOOR (catalog-v3 R17): integer fields accumulate as
//       floats through the fold and floor exactly once;
//   (7) every NON-STUB line moves the tree at its cap (no dead cards).

import { describe, it, expect } from 'vitest';
import {
  CATALOG,
  CONFIG,
  EQUIPMENT_IDS,
  EQUIPMENT_INT_FIELDS,
  LINE_IDS,
  SHIP_CLASS_IDS,
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
import { captiveTriggerRadius, deriveMineRings, mineTriggerRadius } from '../sim/stats.js';

const BASE = CONFIG.shipClasses.battleship;

/** THE PER-CARD RANGE STEP of a tiered weapon (Story 9.8, Eric 2026-10-13,
 *  epic-9 ruling 125): Tier I → Tier V split evenly over the four upgrade
 *  cards, derived from the two CONFIG dials. */
type RangedWeapon = 'gun' | 'machineGun' | 'flak' | 'broadside' | 'starShells' | 'phosphorShells';
const rangeStep = (w: RangedWeapon): number => (CONFIG[w].rangeUAtV - CONFIG[w].rangeU) / 4;

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
      armor: 0, // Story 9.7 (epic-9 amendment 86): no Armor until the ladder stacks
      damageMultiplier: 1, // DERIVED — K / (K + 0)
      armorPiercing: 0, // Story 9.9 (epic-9 amendment 145): no Piercing until the ladder stacks
      regen: { ...CONFIG.regen }, // Story 9.6 (amendments 90–91): CONFIG.regen verbatim at zero cards
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
        // (radarBuoy's row DELETED with the buoy, Story 8.16; the DECOY BUOY
        // consumable that replaces it carries NO row — the consumable law.)
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
      },
    });
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

  it('the signature is (cls, cards?): omitted and [] are byte-identical; junk ids fail closed', () => {
    expect(effectiveStats(BASE)).toEqual(effectiveStats(BASE, []));
    expect(effectiveStats(BASE, ['nope', 'constructor'])).toEqual(effectiveStats(BASE));
  });
});

describe('effectiveStats — the eight universal ladders (catalog-v3 §4 + Stories 9.6 / 9.7 / 9.9)', () => {
  // THE UNIVERSAL FOLD (Story 9.14, Eric 2026-10-22: the literal per-ladder
  // step pins were CONST pins of catalog content). Each rung is the zero-card
  // value plus the authored adds, then the firewall's post-fold rule for that
  // path; the ladder moves only its own paths and the values derived from them.
  const UNIVERSAL = LINE_IDS.filter((id) => CATALOG[id].kind === 'ladder' && tierTargetOf(CATALOG[id]) === undefined);
  const round3 = (v: number): number => Math.round(v * 1000) / 1000;
  const POST_FOLD: Record<string, (v: number) => number> = {
    armor: (v) => Math.max(0, Math.floor(v)),
    armorPiercing: (v) => Math.max(0, Math.floor(v)),
    sweepRpm: (v) => Math.min(v, CONFIG.vision.sweepRpmMax),
    cooldownScale: (v) => Math.max(0.1, round3(v)),
    'regen.missingPctPerS': round3,
    'regen.outOfCombatMs': (v) => Math.max(0, v),
  };
  const read = (s: EffectiveStats, path: string): number => flatten(s).get(path) as number;

  it('the universal ladders are exactly the eight non-weapon ladders, each with a tier array per copy', () => {
    expect(UNIVERSAL).toHaveLength(8);
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
    const DERIVED: Record<string, (p: string) => boolean> = {
      armor: (p) => p === 'damageMultiplier',
      sweepRpm: (p) => p === 'sweepPeriodMs',
      cooldownScale: (p) => p.startsWith('equipment.') && p.endsWith('.reloadMs'),
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
  it('ARMOR: n cards → damageMultiplier exactly K/(K+armor) through damageMultiplierFor (the exact ratio, never rounded), n = 0..cap, on every hull', () => {
    const K = CONFIG.armor.k;
    for (let n = 0; n <= CATALOG.armor.cap; n += 1) {
      for (const id of SHIP_CLASS_IDS) {
        const s = effectiveStats(CONFIG.shipClasses[id], stack('armor', n));
        expect(s.damageMultiplier, `${id} ${n}`).toBe(K / (K + s.armor));
        expect(s.damageMultiplier, `${id} ${n}`).toBe(damageMultiplierFor(s.armor));
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

  it('ARMOR adds no hull (no maxHp, so no ramming mass) and moves only the Armor pair', () => {
    const base = effectiveStats(BASE);
    const v = effectiveStats(BASE, stack('armor', 5));
    expect(v.maxHp).toBe(base.maxHp);
    expect({ ...v, armor: base.armor, damageMultiplier: base.damageMultiplier }).toEqual(base);
    // ...and no other ladder moves it.
    for (const id of ['hullPoints', 'armorPiercing', 'speed', 'turning', 'radarSweep', 'reload', 'passiveHealing'] as const) {
      const s = effectiveStats(BASE, stack(id, CATALOG[id].cap));
      expect([s.armor, s.damageMultiplier], id).toEqual([0, 1]);
    }
    // A Tier-V HULL POINTS + Tier-V ARMOR hull carries both, independently.
    const both = effectiveStats(BASE, [...stack('hullPoints', 5), ...stack('armor', 5)]);
    expect([both.maxHp, both.armor, both.damageMultiplier])
      .toEqual([effectiveStats(BASE, stack('hullPoints', 5)).maxHp, armorOf(5), damageMultiplierFor(armorOf(5))]);
  });

  // ARMOR PIERCING (Story 9.9, Eric 2026-10-14/15, epic-9 amendments 144–146):
  // the ATTACKER's stat — folded, floored, and never in the holder's own
  // damageMultiplier (which stays victim-only, amendment 120(e)).
  it('ARMOR PIERCING: n ARMOR + m PIERCING cards fold independently — damageMultiplier from armor alone', () => {
    const pierceOf = (m: number): number => effectiveStats(BASE, stack('armorPiercing', m)).armorPiercing;
    for (let n = 0; n <= CATALOG.armor.cap; n += 1) {
      for (let m = 0; m <= CATALOG.armorPiercing.cap; m += 1) {
        const s = effectiveStats(BASE, [...stack('armor', n), ...stack('armorPiercing', m)]);
        expect([s.armor, s.armorPiercing], `${n}/${m}`).toEqual([armorOf(n), pierceOf(m)]);
        expect(s.damageMultiplier, `${n}/${m}`).toBe(damageMultiplierFor(armorOf(n)));
      }
    }
  });

  it('ARMOR PIERCING is 0 on every hull at base and under every other ladder, and moves nothing else', () => {
    for (const id of SHIP_CLASS_IDS) expect(effectiveStats(CONFIG.shipClasses[id]).armorPiercing, id).toBe(0);
    for (const id of ['hullPoints', 'armor', 'speed', 'turning', 'radarSweep', 'reload', 'passiveHealing'] as const) {
      expect(effectiveStats(BASE, stack(id, CATALOG[id].cap)).armorPiercing, id).toBe(0);
    }
    const base = effectiveStats(BASE);
    const v = effectiveStats(BASE, stack('armorPiercing', 5));
    expect({ ...v, armorPiercing: base.armorPiercing }).toEqual(base);
  });

  it('ARMOR and ARMOR PIERCING are floored to whole numbers before anything derives (injected fractional step)', () => {
    const half: Catalog = {
      armor: { id: 'armor', kind: 'ladder', cap: 2, tiers: [[{ kind: 'stat', path: 'armor', add: 1.5 }], [{ kind: 'stat', path: 'armor', add: 1.5 }]] },
      armorPiercing: {
        id: 'armorPiercing', kind: 'ladder', cap: 2,
        tiers: [[{ kind: 'stat', path: 'armorPiercing', add: 2.5 }], [{ kind: 'stat', path: 'armorPiercing', add: 2.5 }]],
      },
    };
    const one = effectiveStats(BASE, ['armor', 'armorPiercing'], half);
    expect([one.armor, one.armorPiercing, one.damageMultiplier]).toEqual([1, 2, damageMultiplierFor(1)]);
    const two = effectiveStats(BASE, ['armor', 'armor', 'armorPiercing', 'armorPiercing'], half);
    expect([two.armor, two.armorPiercing, two.damageMultiplier]).toEqual([3, 5, damageMultiplierFor(3)]);
  });

  // PASSIVE HEALING (Story 9.6, Eric 2026-10-13, epic-9 amendments 90–91): the
  // regen pair is DERIVED in effectiveStats — zero cards ≙ CONFIG.regen, each
  // copy's authored steps folded on (the rate round3'd, the cooldownScale dust
  // rule) — the UNIVERSAL FOLD above.
  it('PASSIVE HEALING: zero cards is CONFIG.regen as a COPY — a fold never writes through to CONFIG', () => {
    const s = effectiveStats(BASE);
    expect(s.regen).toEqual(CONFIG.regen);
    expect(s.regen).not.toBe(CONFIG.regen);
    effectiveStats(BASE, stack('passiveHealing', 5));
    expect(effectiveStats(BASE).regen).toEqual(CONFIG.regen);
  });

  it('PASSIVE HEALING moves only the regen pair; no other ladder moves it', () => {
    const base = effectiveStats(BASE);
    expect({ ...effectiveStats(BASE, stack('passiveHealing', 3)), regen: base.regen }).toEqual(base);
    for (const id of ['hullPoints', 'speed', 'turning', 'radarSweep', 'reload'] as const) {
      expect(effectiveStats(BASE, stack(id, CATALOG[id].cap)).regen, id).toEqual(base.regen);
    }
  });

  it('RADAR SWEEP never passes the sweepRpmMax clamp at any copy count, an over-stack included, and its period is 60000 / rpm', () => {
    const max = CONFIG.vision.sweepRpmMax;
    for (const n of [0, 1, 2, 3, 4, 5, 20]) {
      const s = effectiveStats(BASE, stack('radarSweep', n));
      expect(s.sweepRpm, `${n} copies`).toBeLessThanOrEqual(max);
      expect(s.sweepPeriodMs, `${n} copies`).toBe(60000 / s.sweepRpm);
    }
  });

  it('RELOAD is ADDITIVE, never compounding: the cap scale is round3(1 + Σ authored adds), not the per-copy factor to the cap', () => {
    const steps = CATALOG.reload.tiers.flat().flatMap((e) => (e.kind === 'stat' && e.path === 'cooldownScale' && e.add !== undefined ? [e.add] : []));
    const atCap = effectiveStats(BASE, stack('reload', CATALOG.reload.cap)).cooldownScale;
    expect(atCap).toBe(round3(1 + steps.reduce((a, b) => a + b, 0)));
    expect(atCap).not.toBeCloseTo(steps.reduce((a, b) => a * (1 + b), 1), 3);
  });

  it('RELOAD scales EVERY equipment reload, once, post-fold', () => {
    const base = effectiveStats(BASE);
    const capped = effectiveStats(BASE, stack('reload', 5));
    for (const id of EQUIPMENT_IDS) {
      expect(capped.equipment[id].reloadMs, id).toBeCloseTo(base.equipment[id].reloadMs * capped.cooldownScale, 9);
    }
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
    expect(effectiveStats(BASE, many).cooldownScale).toBe(effectiveStats(BASE, stack('reload', CATALOG.reload.cap)).cooldownScale);
    const rogue: Catalog = {
      reload: { id: 'reload' as LineId, kind: 'ladder', cap: 30, tiers: new Array(30).fill([{ kind: 'stat', path: 'cooldownScale', add: -0.1 }]) },
    };
    const s = effectiveStats(BASE, new Array<string>(30).fill('reload'), rogue);
    expect(s.cooldownScale).toBe(0.1);
    expect(s.equipment.gun.reloadMs).toBeCloseTo(CONFIG.gun.reloadMs * 0.1, 9);
  });
});

describe('effectiveStats — the deck-gun family (catalog-v3 §4)', () => {
  it('a PvE fleet envelope (cls.gun present) keeps ONE barrel and its own damage; a captain reads CONFIG.gun.barrels (epic-7 amendment 24 untouched)', () => {
    const drone = effectiveStats(CONFIG.drones.small).equipment.gun;
    expect(drone.barrels).toBe(1);
    expect(drone.damage).toBe(CONFIG.drones.small.gun.damage);
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
// the −5 % reload per tier is DERIVED from that tier in clampStats — the one
// formula every row uses. The per-rung numbers live in the TIERED-LINE FOLD
// and EQUIPMENT RELOAD STEP relations, never as tables (Story 9.14).
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

  it('MACHINE GUN: RELOAD scales the reload but never the shot delay (cooldownScale reaches reloadMs only)', () => {
    const plain = effectiveStats(BASE, stack('machineGun', 4)).equipment.machineGun;
    const mg = effectiveStats(BASE, [...stack('machineGun', 4), ...stack('reload', 5)]).equipment.machineGun;
    expect(mg.rateMs).toBe(plain.rateMs);
    expect(mg.reloadMs).toBeCloseTo(plain.reloadMs * effectiveStats(BASE, stack('reload', 5)).cooldownScale, 6);
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

describe('STORY 8.15 — the class Shift rows take RELOAD like every row (amendments 97/99)', () => {
  it('the three Shift rows take the maxed RELOAD ladder\'s cooldownScale; their window, Armor bonus and charges never move', () => {
    const base = effectiveStats(BASE).equipment;
    const cd = effectiveStats(BASE, stack('reload', 5)).cooldownScale;
    const maxed = effectiveStats(BASE, stack('reload', 5)).equipment;
    for (const shift of ['instantReload', 'hunker', 'boost'] as const) {
      expect(maxed[shift].reloadMs, shift).toBe(base[shift].reloadMs * cd);
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
// THREE THINGS ARE DERIVED, NOT AUTHORED, and are pinned as relations:
//   - the −5 %/tier reload step (sim/stats.ts reloadTierScale);
//   - the +0.5 pool steps, which accumulate as floats and FLOOR ONCE
//     (catalog-v3 R17);
//   - the CAPTIVE mine's trip ring, which steps ×1.1 off the ROW'S TIER while
//     its 32 u burst never moves (amendment 84d).
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
// rulings 2026-09-29, epic-8 amendments 130/131/133). The −5 %/tier reload is
// DERIVED from each row's tier exactly as for the torpedoes; every other step
// is authored in sim/catalog.ts.
// ---------------------------------------------------------------------------
describe('STORY 8.17 — the star shell, broadside and phosphor ladders (amendments 130/131/133)', () => {
  it('three lines held together each fold to their own rung — the joint fold is each line\'s solo fold', () => {
    const s = effectiveStats(BASE, [...stack('starShells', 3), ...stack('broadside', 5), 'phosphorShells']);
    expect(s.equipment.starShells).toEqual(effectiveStats(BASE, stack('starShells', 3)).equipment.starShells);
    expect(s.equipment.broadside).toEqual(effectiveStats(BASE, stack('broadside', 5)).equipment.broadside);
    expect(s.equipment.phosphorShells).toEqual(effectiveStats(BASE, ['phosphorShells']).equipment.phosphorShells);
  });

  it('the three lines take the global RELOAD ladder after their own tier step (tier-V reload × the maxed cooldownScale)', () => {
    const cd = effectiveStats(BASE, stack('reload', 5)).cooldownScale;
    const s = effectiveStats(BASE, [
      ...stack('starShells', 5), ...stack('broadside', 5), ...stack('phosphorShells', 5), ...stack('reload', 5),
    ]);
    for (const id of ['starShells', 'broadside', 'phosphorShells'] as const) {
      const solo = effectiveStats(BASE, stack(id, 5)).equipment[id].reloadMs;
      expect(s.equipment[id].reloadMs, id).toBeCloseTo(solo * cd, 6);
    }
  });
});

describe('STORY 8.13 — the three mine ladders (amendments 77/81/82/84d)', () => {
  it('THE POOL FLOOR on the +0.5 lines: the pool is floor(base + the authored adds so far), so a half-step alone shows nothing (catalog-v3 R17)', () => {
    for (const id of ['lightTorpedo', 'heavyTorpedo', 'captiveMines'] as const) {
      const path = `equipment.${id}.maxAmmo`;
      const base = effectiveStats(BASE).equipment[id].maxAmmo;
      let acc = base;
      for (let n = 1; n <= CATALOG[id].cap; n += 1) {
        for (const e of CATALOG[id].tiers[n - 1]!) if (e.kind === 'stat' && e.path === path && e.add !== undefined) acc += e.add;
        const pool = effectiveStats(BASE, stack(id, n)).equipment[id].maxAmmo;
        expect(pool, `${id} x${n}`).toBe(Math.floor(acc));
      }
      // The line authors at least one fractional step — the floor is exercised, not vacuous.
      expect(CATALOG[id].tiers.flat().some((e) => e.kind === 'stat' && e.path === path && !Number.isInteger(e.add)), id).toBe(true);
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
  it('every tiered row reads its own base × (1 − step × (tier − 1)): ×1.00 at tier I, additive five-point steps, ×(1 − 4·step) at V — never compounded', () => {
    const step = CONFIG.catalog.reloadStepPerTier;
    const round3 = (v: number): number => Math.round(v * 1000) / 1000;
    const base = effectiveStats(BASE).equipment;
    for (const id of LINE_IDS) {
      const target = tierTargetOf(CATALOG[id]);
      if (target === undefined) continue;
      for (let n = 0; n <= CATALOG[id].cap; n += 1) {
        const row = effectiveStats(BASE, stack(id, n)).equipment[target];
        expect(row.reloadMs, `${id} x${n}`).toBeCloseTo(base[target].reloadMs * round3(1 - step * (row.tier - 1)), 9);
      }
      const atV = effectiveStats(BASE, stack(id, CATALOG[id].cap)).equipment[target];
      expect(atV.tier, id).toBe(5);
      expect(atV.reloadMs, id).toBeCloseTo(base[target].reloadMs * (1 - 4 * step), 9);
      expect(atV.reloadMs, `${id} is additive, not (1 − step)^4`).not.toBeCloseTo(base[target].reloadMs * (1 - step) ** 4, 3);
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

  it('the two ladders COMPOSE: a maxed deck gun under a maxed Reload runs at its own tier-V step × the RELOAD scale', () => {
    const cards = [...stack('deckGun', 4), ...stack('reload', 5)];
    const s = effectiveStats(BASE, cards);
    const tierV = effectiveStats(BASE, stack('deckGun', 4)).equipment.gun.reloadMs;
    expect(s.equipment.gun.reloadMs).toBeCloseTo(tierV * effectiveStats(BASE, stack('reload', 5)).cooldownScale, 9);
  });

  it('a line with no tier target moves no tier at all (a consumable is not a rung)', () => {
    // Story 8.17 re-pin (amendments 131/132): this used the two add-ons, and
    // there are none left — FLASH SHELLS (the FOULING SHELL since Story 9.4) is
    // a consumable and PHOSPHOR SHELLS a real equipment line (whose own tier it
    // DOES move).
    const s = effectiveStats(BASE, ['foulingShell', 'hullRepair', 'decoyBuoy']);
    for (const id of EQUIPMENT_IDS) expect(s.equipment[id].tier, id).toBe(1);
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
    // The FOULING SHELL (FLASH SHELLS' slot since Story 9.4) is a consumable:
    // five copies move no derived number at all.
    expect(effectiveStats(BASE, stack('foulingShell', 5))).toEqual(effectiveStats(BASE));
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
// STORY 9.8 — WEAPON RANGES ARE TIERED DIALS ON THE TWELFTHS RULER (Eric
// 2026-10-13, epic-9 ruling 125, superseding amendment 105's "defaults =
// today's values"). Each tiered weapon's reach is `CONFIG.<w>.rangeU` at Tier I
// plus an EVEN step per upgrade card, landing exactly on `CONFIG.<w>.rangeUAtV`
// at Tier V. At the shipped ruler (one rung = 125 u) the 0 / 2 / 4-card reach
// is: cannon 1,000 / 1,125 / 1,250; machine gun 750 / 812.5 / 875; flak and
// broadside 625 / 687.5 / 750; star shells 1,375 / 1,437.5 / 1,500; phosphor
// 1,000 / 1,125 / 1,250. Asserted by derivation, never by those literals
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

  it.each(LINES)('%s: 0 / 2 / 4 upgrade cards reach Tier I + k × step, and four cards land EXACTLY on Tier V', (w, line, tierI) => {
    for (const k of [0, 1, 2, 3, 4]) {
      const row = effectiveStats(BASE, stack(line, tierI + k)).equipment[w];
      expect(row.rangeU, `${w} +${k}`).toBe(CONFIG[w].rangeU + k * rangeStep(w));
    }
    expect(effectiveStats(BASE, stack(line, tierI + 4)).equipment[w].rangeU).toBe(CONFIG[w].rangeUAtV);
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

  it('sightRange is DERIVED as radarRange/3 (the 4/12 rung, epic-9 amendment 103), never stat-addressable', () => {
    const s = effectiveStats(BASE);
    expect(s.sightRange).toBeCloseTo(s.radarRange / 3, 9);
    expect(s.sightRange).toBe(CONFIG.vision.sight); // radar IS SIGHT*3
  });

  // The "eighths ladder ordering holds by ARITHMETIC" pin is DELETED (Story
  // 9.8): it re-derived farRadar from a hard-coded 0.875 and so could never
  // fail (deferred-work 1552, epic-9 amendment 8). The ladder's rung ratios
  // are pinned against CONFIG in zone.test.ts.

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
      // A CONSUMABLE IS EXEMPT BY DESIGN, not by omission: its copies carry a
      // `stock` effect, which fills its kind's SLOT and addresses no stat at all —
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
      'broadside', 'starShells', 'phosphorShells'] as const) {
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

  it('a consumable is a pure `stock` line: it never moves a derived number', () => {
    // SUPERCAV TORPEDO and DEPTH CHARGE joined the list in Story 8.13 — and
    // supercav is the proof that the id MOVED id spaces rather than keeping a
    // row: five copies of it move nothing at all.
    // FLASH SHELLS joined in Story 8.17 (amendment 132) and became the
    // FOULING SHELL in Story 9.4: like supercav, it carries no stat row.
    for (const id of ['hullRepair', 'shieldBlock', 'countermeasure', 'decoyBuoy',
      'depthCharge', 'supercavTorpedo', 'foulingShell'] as const) {
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

  it('the tick-count consequence: a maxed RELOAD never costs a reload an extra tick of float dust', () => {
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
    const base = effectiveStats(BASE);
    const capped = effectiveStats(BASE, stack('reload', 5));
    for (const id of EQUIPMENT_IDS) {
      // The independent oracle: ×0.75 as exact integer arithmetic (×3, ÷4).
      const exact = (base.equipment[id].reloadMs * 3) / 4;
      expect(ticksToRefill(capped.equipment[id].reloadMs), id).toBe(Math.ceil(exact / 50));
    }
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
