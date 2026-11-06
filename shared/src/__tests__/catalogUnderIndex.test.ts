// STORY 10.6 — THE CATALOG UNDER THE INDEX (Eric 2026-11-05, rulings R1–R18).
// The pure rows of the story's I/O matrix, stated as LAWS over CONFIG and the
// catalog — never as literal tables (Story 9.14's test philosophy):
//   - R5   the per-weapon RELOAD bonus: base × haste(RELOAD + bonus × (tier − 1)),
//          and the bonus reaches its own weapon only;
//   - R8/R9 HULL REPAIR and SMOKE SCREEN: amounts, life, size and the "+5 to a
//          fixed score of 100" cooldown, at 0..5 cards, never touched by RELOAD;
//   - R6/R7/R10 the four one-off WEAPON cards: eligible and pickable only while
//          their family slot is filled, and they own ALL extra capacity;
//   - R4   no weapon tier changes a tube, mine or shot count;
//   - R1   the RANGE card reaches the main battery and the secondaries only;
//   - R2   every captain hull turns at one baseline rate; drones keep theirs.
//
// Pure, zero I/O.

import { describe, it, expect } from 'vitest';
import {
  CATALOG,
  CONFIG,
  DRONE_SIZE_IDS,
  EQUIPMENT_FAMILY,
  EQUIPMENT_IDS,
  FAMILY_SLOT,
  INDEX_IDS,
  LINE_IDS,
  BOON_STAT_PATH_SET,
  RANGE_ROWS,
  SHIP_CLASS_IDS,
  abilityCooldownFraction,
  abilityCooldownMs,
  abilityReadyAt,
  cloudOutlineRadius,
  cloudScale,
  effectiveStats,
  eligibleLines,
  familyMembers,
  pickRefusal,
  reloadCooldownScale,
  slotsWithCards,
  smokeSizeScale,
  tierTargetOf,
  type DrawShip,
  type EquipmentId,
  type LineId,
  type SlotFamily,
} from '../index.js';
import { RELOAD_UNSCALED_ROWS } from '../sim/stats.js';
import { NEUTRAL_HULL } from './neutralHull.js';

const BASE = NEUTRAL_HULL;
const stack = (id: LineId, n: number): LineId[] => new Array<LineId>(n).fill(id);
const HULLS = SHIP_CLASS_IDS.map((id) => [id, CONFIG.shipClasses[id]] as const);

/** The four one-off lines and the family each serves (R6 / R7 / R10). */
const ONE_OFFS: readonly (readonly [LineId, SlotFamily])[] = [
  ['aftTorpedoLauncher', 'torpedo'],
  ['secondLauncherTube', 'torpedo'],
  ['secondMineRack', 'mine'],
  ['expandedMineRacks', 'mine'],
];

/** A REAL captain's draw state for a hand: the slots are the replay of the hand. */
function shipOf(held: readonly LineId[]): DrawShip {
  const stats = effectiveStats(BASE, held);
  return { held, slotIds: slotsWithCards(stats, held).map((s) => s.equipmentId), mountedGun: 'mainBattery' };
}

/** The weapon line that fits `eq`. */
const lineOf = (eq: EquipmentId): LineId => LINE_IDS.find((id) => tierTargetOf(CATALOG[id]) === eq && CATALOG[id].kind === 'equipment')!;

describe('R5 — the per-weapon RELOAD bonus replaces the 5 %-per-tier rule', () => {
  const bonus = CONFIG.catalog.reloadBonusPerTier;

  it('every RELOAD-scaled tiered row reads base × haste(RELOAD + bonus × (tier − 1)) at every rung, on every hull', () => {
    for (const [clsId, cls] of HULLS) {
      const zero = effectiveStats({ ...cls, index: { ...cls.index, reload: CONFIG.index.base } }).equipment;
      for (const id of LINE_IDS) {
        const target = tierTargetOf(CATALOG[id]);
        if (target === undefined || RELOAD_UNSCALED_ROWS.includes(target)) continue;
        for (let n = 0; n <= CATALOG[id].cap; n += 1) {
          const s = effectiveStats(cls, stack(id, n));
          const row = s.equipment[target];
          const want = zero[target].reloadMs * reloadCooldownScale(s.reload + bonus * (row.tier - 1));
          expect(row.reloadMs, `${clsId} ${id} x${n}`).toBe(want);
        }
      }
    }
  });

  it('the I/O row: RELOAD 70 with a Tier V light torpedo reloads at base × 100 / 110, and the main battery at base × 100 / 70', () => {
    const cls = { ...BASE, index: { ...BASE.index, reload: 70 } };
    const s = effectiveStats(cls, stack('lightTorpedo', 5));
    expect(s.equipment.lightTorpedo.reloadMs).toBe(CONFIG.lightTorpedo.reloadMs * reloadCooldownScale(70 + 4 * bonus));
    expect(s.equipment.lightTorpedo.reloadMs).toBeCloseTo((CONFIG.lightTorpedo.reloadMs * 100) / 110, -2);
    // THE BONUS STAYS LOCAL: the battery reads the ship's RELOAD alone.
    expect(s.equipment.mainBattery.reloadMs).toBe(CONFIG.mainBattery.reloadMs * reloadCooldownScale(70));
    expect(s.equipment.mainBattery.reloadMs).toBe(effectiveStats(cls).equipment.mainBattery.reloadMs);
  });

  it('a weapon\'s tier bonus reaches NO other row: every other row reloads exactly as at zero cards', () => {
    for (const id of LINE_IDS) {
      const target = tierTargetOf(CATALOG[id]);
      if (target === undefined) continue;
      const zero = effectiveStats(BASE).equipment;
      const s = effectiveStats(BASE, stack(id, CATALOG[id].cap)).equipment;
      for (const other of EQUIPMENT_IDS) {
        if (other !== target) expect(s[other].reloadMs, `${id} → ${other}`).toBe(zero[other].reloadMs);
      }
    }
  });

  it('the published cooldownScale stays the tier-free haste of the ship\'s RELOAD', () => {
    for (const [clsId, cls] of HULLS) {
      const s = effectiveStats(cls, [...stack('lightTorpedo', 5), ...stack('reload', 2)]);
      expect(s.cooldownScale, clsId).toBe(reloadCooldownScale(s.reload));
    }
  });

  it('the Shifts keep their base reload at any RELOAD (R1 / Story 10.5 R10)', () => {
    const s = effectiveStats(BASE, stack('reload', 5));
    for (const id of RELOAD_UNSCALED_ROWS) expect(s.equipment[id].reloadMs, id).toBe(effectiveStats(BASE).equipment[id].reloadMs);
  });

  it('the 5 %-per-tier dial is gone from CONFIG', () => {
    expect(Object.hasOwn(CONFIG.catalog, 'reloadStepPerTier')).toBe(false);
  });
});

describe('R8 — HULL REPAIR: the ladder\'s amounts and cooldown', () => {
  const H = CONFIG.hullRepair;
  it('n cards: instant and pooled heal each + n × the per-card step, a FIXED pool window, cooldown base × haste(100 + n × the per-card score)', () => {
    for (const [clsId, cls] of HULLS) {
      for (let n = 0; n <= CATALOG.hullRepair.cap; n += 1) {
        // RELOAD is held too: it must never reach the ability (R1 / R8).
        const r = effectiveStats(cls, [...stack('hullRepair', n), ...stack('reload', 5)]).repair;
        expect(r.instantHp, `${clsId} x${n}`).toBe(H.instantHp + n * H.hpPerCard);
        expect(r.regenHp, `${clsId} x${n}`).toBe(H.regenHp + n * H.hpPerCard);
        expect(r.regenMs, `${clsId} x${n}`).toBe(H.regenMs);
        expect(r.cooldownMs, `${clsId} x${n}`).toBe(H.cooldownMs * reloadCooldownScale(CONFIG.index.base + n * H.reloadPerCard));
      }
    }
  });

  it('the matrix row: three cards ready again in 75 × 100 ÷ 115 s on every hull', () => {
    for (const [clsId, cls] of HULLS) {
      expect(effectiveStats(cls, stack('hullRepair', 3)).repair.cooldownMs / 1000, clsId).toBeCloseTo((75 * 100) / 115, 1);
    }
  });

  it('every card shortens the cooldown and grows the heal', () => {
    for (let n = 1; n <= CATALOG.hullRepair.cap; n += 1) {
      const a = effectiveStats(BASE, stack('hullRepair', n - 1)).repair;
      const b = effectiveStats(BASE, stack('hullRepair', n)).repair;
      expect(b.cooldownMs, `x${n}`).toBeLessThan(a.cooldownMs);
      expect(b.instantHp + b.regenHp, `x${n}`).toBeGreaterThan(a.instantHp + a.regenHp);
    }
  });
});

describe('R9 — SMOKE SCREEN: cooldown, life and size', () => {
  const C = CONFIG.countermeasure;
  it('n cards: cooldown base × haste(100 + n × the per-card score), life + n × the per-card step, never touched by RELOAD', () => {
    for (const [clsId, cls] of HULLS) {
      for (let n = 0; n <= CATALOG.smokeScreen.cap; n += 1) {
        const s = effectiveStats(cls, [...stack('smokeScreen', n), ...stack('reload', 5)]).smoke;
        expect(s.cooldownMs, `${clsId} x${n}`).toBe(C.cooldownMs * reloadCooldownScale(CONFIG.index.base + n * C.reloadPerCard));
        expect(s.lifeMs, `${clsId} x${n}`).toBe(C.lifeMs + n * C.lifeMsPerCard);
      }
    }
  });

  it('the ANCHOR card count reads exactly the CONFIG size; each card is one size step larger', () => {
    const at = (n: number) => effectiveStats(BASE, stack('smokeScreen', n)).smoke;
    expect(at(C.sizeAnchorCards).r0).toBe(C.r0);
    expect(at(C.sizeAnchorCards).r1).toBe(C.r1);
    for (let n = 1; n <= CATALOG.smokeScreen.cap; n += 1) {
      expect(at(n).r0 / at(n - 1).r0, `x${n}`).toBeCloseTo(C.sizeStepPerCard, 12);
      expect(at(n).r1 / at(n - 1).r1, `x${n}`).toBeCloseTo(C.sizeStepPerCard, 12);
    }
  });

  it('smokeSizeScale is 1 at the anchor and the step to the power of the distance from it', () => {
    expect(smokeSizeScale(C.sizeAnchorCards)).toBe(1);
    for (let n = 0; n <= 5; n += 1) {
      expect(smokeSizeScale(n), `x${n}`).toBeCloseTo(C.sizeStepPerCard ** (n - C.sizeAnchorCards), 12);
    }
  });
});

describe('the ability functions read the ship\'s stats, never CONFIG (R8 / R9)', () => {
  it('cooldown, ready stamp and wipe fraction all follow the stamped cooldown', () => {
    for (const n of [0, 3, 5]) {
      const s = effectiveStats(BASE, [...stack('hullRepair', n), ...stack('smokeScreen', n)]);
      for (const id of ['repair', 'smoke'] as const) {
        const cd = abilityCooldownMs(s, id);
        expect(cd, `${id} x${n}`).toBe(id === 'repair' ? s.repair.cooldownMs : s.smoke.cooldownMs);
        const readyAt = abilityReadyAt(1000, s, id);
        expect(readyAt - 1000, `${id} x${n}`).toBe(cd);
        expect(abilityCooldownFraction(1000 + cd / 2, readyAt, s, id), `${id} x${n}`).toBeCloseTo(0.5, 12);
      }
    }
  });

  it('a cloud\'s disc grows from its OWN stamped r0 to its own r1 over its own life', () => {
    const size = { lifeMs: 20000, r0: 200, r1: 400 };
    expect(cloudScale(0, size)).toBe(1);
    expect(cloudOutlineRadius(0, size)).toBe(size.r0);
    expect(cloudOutlineRadius(size.lifeMs, size)).toBe(size.r1);
    expect(cloudOutlineRadius(size.lifeMs / 2, size)).toBeCloseTo((size.r0 + size.r1) / 2, 9);
    expect(cloudOutlineRadius(size.lifeMs * 3, size)).toBe(size.r1);
  });
});

describe('R6 / R7 / R10 — the four one-off WEAPON cards', () => {
  it('each is a cap-1 line, never a stub', () => {
    for (const [id] of ONE_OFFS) {
      expect(CATALOG[id].cap, id).toBe(1);
      expect(CATALOG[id].stub, id).toBeUndefined();
    }
  });

  it('are never eligible while their family slot is EMPTY, are UPGRADES once it is filled, and leave once held', () => {
    for (const [id, family] of ONE_OFFS) {
      expect(eligibleLines(shipOf([])).some((e) => e.id === id), `${id} on an empty hull`).toBe(false);
      // Filling ANOTHER family's slot never opens it.
      for (const other of familyMembers(family === 'torpedo' ? 'mine' : 'torpedo')) {
        expect(eligibleLines(shipOf([lineOf(other)])).some((e) => e.id === id), `${id} with ${other}`).toBe(false);
      }
      for (const eq of familyMembers(family)) {
        const hand = [lineOf(eq)];
        expect(eligibleLines(shipOf(hand)), `${id} with ${eq}`).toContainEqual({ id, kind: 'upgrade' });
        expect(eligibleLines(shipOf([...hand, id])).some((e) => e.id === id), `${id} held`).toBe(false);
      }
    }
  });

  it('pickRefusal refuses one while its family slot is empty and passes it once filled (and atCap once held)', () => {
    for (const [id, family] of ONE_OFFS) {
      const empty = shipOf([]);
      expect(pickRefusal([], empty.slotIds, id), id).not.toBeNull();
      const host = lineOf(familyMembers(family)[0]);
      const filled = shipOf([host]);
      expect(pickRefusal(filled.held, filled.slotIds, id), id).toBeNull();
      expect(pickRefusal([...filled.held, id], filled.slotIds, id), id).toBe('atCap');
    }
  });

  it('TORPEDOES: the row holds launchers × tubes — 1 / 2 / 2 / 4 — on every torpedo, in either card order', () => {
    for (const eq of familyMembers('torpedo')) {
      const line = lineOf(eq);
      const ammo = (hand: LineId[]): number => effectiveStats(BASE, [line, ...hand]).equipment[eq].maxAmmo;
      const base = effectiveStats(BASE, [line]).equipment[eq].maxAmmo;
      expect(ammo([]), eq).toBe(base);
      expect(ammo(['aftTorpedoLauncher']), eq).toBe(2 * base);
      expect(ammo(['secondLauncherTube']), eq).toBe(2 * base);
      expect(ammo(['secondLauncherTube', 'aftTorpedoLauncher']), eq).toBe(4 * base);
      expect(ammo(['aftTorpedoLauncher', 'secondLauncherTube']), eq).toBe(4 * base);
      const s = effectiveStats(BASE, [line, 'aftTorpedoLauncher', 'secondLauncherTube']);
      expect([s.torpedoLaunchers, s.tubesPerLauncher], eq).toEqual([2, 2]);
    }
  });

  it('MINES: the row holds racks × (per-rack base + bonus) — max 8 naval / fouling, 4 captive', () => {
    for (const eq of familyMembers('mine')) {
      const line = lineOf(eq);
      const per = effectiveStats(BASE, [line]).equipment[eq].maxAmmo;
      const ammo = (hand: LineId[]): number => effectiveStats(BASE, [line, ...hand]).equipment[eq].maxAmmo;
      expect(ammo(['secondMineRack']), eq).toBe(2 * per);
      expect(ammo(['expandedMineRacks']), eq).toBe(per + 1);
      expect(ammo(['expandedMineRacks', 'secondMineRack']), eq).toBe(2 * (per + 1));
      const s = effectiveStats(BASE, [line, 'secondMineRack', 'expandedMineRacks']);
      expect([s.mineRacks, s.rackBonus], eq).toEqual([2, 1]);
    }
    expect(effectiveStats(BASE, ['navalMines', 'secondMineRack', 'expandedMineRacks']).equipment.navalMines.maxAmmo).toBe(8);
    expect(effectiveStats(BASE, ['foulingMines', 'secondMineRack', 'expandedMineRacks']).equipment.foulingMines.maxAmmo).toBe(8);
    expect(effectiveStats(BASE, ['captiveMines', 'secondMineRack', 'expandedMineRacks']).equipment.captiveMines.maxAmmo).toBe(4);
  });

  it('a one-off of one family never moves the other family\'s capacity', () => {
    const base = effectiveStats(BASE).equipment;
    const torp = effectiveStats(BASE, ['aftTorpedoLauncher', 'secondLauncherTube']).equipment;
    const mine = effectiveStats(BASE, ['secondMineRack', 'expandedMineRacks']).equipment;
    for (const eq of familyMembers('mine')) expect(torp[eq].maxAmmo, eq).toBe(base[eq].maxAmmo);
    for (const eq of familyMembers('torpedo')) expect(mine[eq].maxAmmo, eq).toBe(base[eq].maxAmmo);
  });
});

describe('R4 — capacity has left the tiers', () => {
  it('no tier of any dealt weapon line changes its row\'s capacity', () => {
    for (const id of LINE_IDS) {
      const line = CATALOG[id];
      const target = tierTargetOf(line);
      if (line.kind !== 'equipment' || target === undefined || EQUIPMENT_FAMILY[target] === null) continue;
      const tierI = effectiveStats(BASE, [id]).equipment[target].maxAmmo;
      for (let n = 2; n <= line.cap; n += 1) {
        expect(effectiveStats(BASE, stack(id, n)).equipment[target].maxAmmo, `${id} x${n}`).toBe(tierI);
      }
    }
  });

  it('no dealt line but the one-offs authors a capacity step', () => {
    const oneOffIds = new Set<string>(ONE_OFFS.map(([id]) => id));
    for (const id of LINE_IDS) {
      const line = CATALOG[id];
      const target = tierTargetOf(line);
      const dealtWeapon = line.kind === 'equipment' && target !== undefined && EQUIPMENT_FAMILY[target] !== null;
      if (!dealtWeapon || oneOffIds.has(id)) continue;
      for (const e of line.tiers.flat()) {
        if (e.kind === 'stat') expect(e.path.endsWith('.maxAmmo'), `${id}: ${e.path}`).toBe(false);
      }
    }
  });

  it('the rack bases: naval and fouling hold the same, the captive fewer', () => {
    expect(CONFIG.foulingMines.maxAmmo).toBe(CONFIG.mine.maxAmmo);
    expect(CONFIG.captiveMines.maxAmmo).toBeLessThan(CONFIG.mine.maxAmmo);
  });
});

describe('R1 — the RANGE card', () => {
  it('steps the RANGE index and so reaches the main battery and the secondaries only', () => {
    const base = effectiveStats(BASE);
    const far = effectiveStats(BASE, stack('range', CATALOG.range.cap));
    expect(far.range).toBeGreaterThan(base.range);
    expect(far.equipment.mainBattery.rangeU).toBeCloseTo((CONFIG.mainBattery.rangeU * far.range) / CONFIG.index.base, 9);
    expect(far.secondaryRangeU).toBeCloseTo(far.equipment.mainBattery.rangeU * CONFIG.secondaries.rangeFrac, 9);
    for (const id of EQUIPMENT_IDS) {
      if ((RANGE_ROWS as readonly string[]).includes(id)) continue;
      const row = far.equipment[id] as unknown as Record<string, number>;
      const was = base.equipment[id] as unknown as Record<string, number>;
      if ('rangeU' in row) expect(row.rangeU, id).toBe(was.rangeU);
    }
  });
});

describe('R2 — RUDDER is gone; one baseline turn rate', () => {
  it('no index, card or stat path named rudder survives', () => {
    expect((INDEX_IDS as readonly string[]).includes('rudder')).toBe(false);
    expect((LINE_IDS as readonly string[]).includes('rudder')).toBe(false);
    expect(BOON_STAT_PATH_SET.has('rudder')).toBe(false);
    expect('rudder' in effectiveStats(BASE)).toBe(false);
  });

  it('every captain hull turns at the baseline rate, under any card', () => {
    for (const [clsId, cls] of HULLS) {
      expect(effectiveStats(cls).kinematics.turnRate, clsId).toBe(CONFIG.index.turnRate);
      expect(effectiveStats(cls, stack('engines', 5)).kinematics.turnRate, clsId).toBe(CONFIG.index.turnRate);
    }
  });

  it('the drones keep the turn rates they had under the retired RUDDER law (I5)', () => {
    // The pre-10.6 law, inlined as the oracle: 0.4 rad/s × RUDDER / 100 over
    // the drones' old indices 225 / 188 / 150.
    const OLD: Record<(typeof DRONE_SIZE_IDS)[number], number> = { small: 225, medium: 188, large: 150 };
    for (const size of DRONE_SIZE_IDS) {
      expect(effectiveStats(CONFIG.drones[size]).kinematics.turnRate, size).toBe((0.4 * OLD[size]) / 100);
    }
  });
});

describe('the catalog\'s new lines', () => {
  it('HULL REPAIR and SMOKE SCREEN are universal ship ladders and the one-offs name their family\'s weapons', () => {
    for (const id of ['range', 'hullRepair', 'smokeScreen'] as const) {
      expect(CATALOG[id].kind, id).toBe('ladder');
      expect(tierTargetOf(CATALOG[id]), id).toBeUndefined();
    }
    for (const [id, family] of ONE_OFFS) {
      expect([...(CATALOG[id].appliesTo ?? [])].sort(), id).toEqual(familyMembers(family).sort());
    }
  });

  it('the family slot every one-off waits on is a real family slot', () => {
    for (const [, family] of ONE_OFFS) expect(FAMILY_SLOT[family]).toBeGreaterThan(1);
  });
});
