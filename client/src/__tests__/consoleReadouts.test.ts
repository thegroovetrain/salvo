// THE CONSOLES' VIEW MODEL (Story 10.10, R17 / R18 / R19; plan O4–O8) —
// contracts only: the shown damage is the gate's multiplier against an
// ARMOR-100 hull; the hover preview marks exactly the numbers a real re-fold
// with the card changes; the rows come out in the ruled order; the mines row's
// pips follow the shared rack helpers. No vocabulary pins.

import { describe, it, expect } from 'vitest';
import {
  CATALOG,
  CONFIG,
  DEFAULT_CLASS_ID,
  EQUIPMENT_IDS,
  EQUIPMENT_STAT_FIELDS,
  INDEX_IDS,
  SLOT_COUNT,
  damageMultiplierFor,
  effectiveStats,
  initialRacks,
  rackCapacity,
  rackCount,
  slotsWithCards,
  type EffectiveStats,
  type EquipmentId,
  type MineEquipmentId,
} from '@salvo/shared';
import { cardTierSteps, equipmentStatRows } from '../ui/boonCopy.js';
import { ABILITY_KINDS, WEAPON_ROW_KINDS } from '../render/console/layout.js';
import {
  READOUT_KEY,
  ROW_KEY_GLYPH,
  ABILITY_KEY_GLYPH,
  abilityModels,
  clockNumeral,
  consoleReadouts,
  hoverPreview,
  mountClock,
  previewReadouts,
  shipReadouts,
  shownDamage,
  statRowFields,
  weaponRowModels,
  type ReadoutShip,
  type Readout,
  type WeaponsInput,
} from '../render/console/readouts.js';
import { CLIENT_CONFIG } from '../config.js';

const CLS = DEFAULT_CLASS_ID;
const SHIP: ReadoutShip = { cls: CLS, cards: [], ib: {}, shift: 'boost' };
const SHIFT_IDS = new Set<string>(['boost', 'instantReload', 'hunker']);

function fold(cards: readonly string[]): EffectiveStats {
  return effectiveStats(CONFIG.shipClasses[CLS], cards);
}

function byKey(rs: readonly Readout[]): Map<string, Readout> {
  return new Map(rs.map((r) => [r.key, r]));
}

describe('shownDamage — R19: the gate multiplier against an ARMOR-100 hull', () => {
  const BASE = CONFIG.index.base;

  it('equals floor(base × damageMultiplierFor(base index − POWER)) across a POWER sweep', () => {
    for (const dmg of [3, 27, 200, 250]) {
      for (let power = 0; power <= 3 * BASE; power += 10) {
        expect(shownDamage(dmg, power)).toBe(Math.floor(dmg * damageMultiplierFor(BASE - power)));
      }
    }
  });

  it('is ×1 at POWER = the base index (an integer damage reads unchanged)', () => {
    for (const dmg of [1, 3, 27, 250]) expect(shownDamage(dmg, BASE)).toBe(dmg);
  });

  it('never falls as POWER rises, and is always a whole number', () => {
    for (const dmg of [3, 27, 250]) {
      let prev = -Infinity;
      for (let power = 0; power <= 3 * BASE; power += 5) {
        const v = shownDamage(dmg, power);
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(prev);
        prev = v;
      }
    }
  });

  it('every DAMAGE readout on the consoles is the shown damage of its fold', () => {
    const cards = ['lightTorpedo', 'navalMines', 'starShells', 'power'];
    const stats = fold(cards);
    const rs = byKey(shipReadouts({ ...SHIP, cards })!);
    for (const [kind, id] of [['mainBattery', 'mainBattery'], ['torpedo', 'lightTorpedo'], ['mines', 'navalMines'], ['special', 'starShells']] as const) {
      expect(rs.get(READOUT_KEY.stat(kind, 'damage'))!.raw).toBe(shownDamage(stats.equipment[id].damage, stats.power));
    }
    expect(rs.get(READOUT_KEY.stat('secondaries', 'damage'))!.raw).toBe(shownDamage(CONFIG.secondaries.damage, stats.power));
  });
});

describe('field labels come from the stat tables the game already prints', () => {
  it('statRowFields aligns one-to-one with equipmentStatRows for every weapon', () => {
    const stats = fold([]);
    for (const id of EQUIPMENT_IDS as readonly EquipmentId[]) {
      if (SHIFT_IDS.has(id)) continue;
      expect(statRowFields(id, stats), id).toHaveLength(equipmentStatRows(id, stats).length);
      expect(statRowFields(id, stats).filter((f) => f !== 'triggerRadius').sort(), id).toEqual(
        [...(EQUIPMENT_STAT_FIELDS[id] as readonly string[])].filter((f) => f !== 'rangeU' || typeof (stats.equipment[id] as unknown as Record<string, unknown>).rangeU === 'number').sort(),
      );
    }
  });

  it('every printed stat readout carries a label', () => {
    const rs = shipReadouts({ ...SHIP, cards: ['heavyTorpedo', 'captiveMines', 'phosphorShells'] })!;
    for (const r of rs.filter((x) => x.role === 'stat' || x.role === 'index')) expect(r.label, r.key).not.toBe('');
  });
});

describe('previewReadouts — R18: exactly the changing numbers, with direction', () => {
  const cur = shipReadouts(SHIP)!;

  it('marks nothing when nothing changes', () => {
    expect(previewReadouts(cur, cur).size).toBe(0);
  });

  it('marks exactly the keys whose raw differs, up or down', () => {
    const next = cur.map((r, i) => (i === 0 ? { ...r, raw: r.raw + 1 } : i === 2 ? { ...r, raw: r.raw - 1 } : r));
    const marks = previewReadouts(cur, next);
    expect([...marks.keys()].sort()).toEqual([cur[0].key, cur[2].key].sort());
    expect(marks.get(cur[0].key)!.direction).toBe('up');
    expect(marks.get(cur[2].key)!.direction).toBe('down');
    expect(marks.get(cur[0].key)!.from).toBe(cur[0].raw);
  });

  it('a number that did not exist before reads as a rise from nothing', () => {
    const extra: Readout = { key: 'x.new', label: '', value: '1', raw: 1, role: 'count' };
    const marks = previewReadouts(cur, [...cur, extra]);
    expect(marks.get('x.new')).toMatchObject({ from: null, direction: 'up' });
    expect(marks.size).toBe(1);
  });
});

describe('hoverPreview — the incoming values ARE effectiveStats with the card applied', () => {
  it('a POWER card raises POWER, its held rung and every DAMAGE readout — and nothing else', () => {
    const marks = hoverPreview(SHIP, 'power')!;
    const after = fold(['power']);
    expect(marks.get(READOUT_KEY.index('power'))!.raw).toBe(after.power);
    expect(marks.get(READOUT_KEY.held('power'))!.direction).toBe('up');
    for (const key of marks.keys()) {
      expect(key === READOUT_KEY.index('power') || key === READOUT_KEY.held('power') || key.endsWith('.damage'), key).toBe(true);
    }
    for (const id of INDEX_IDS) if (id !== 'power') expect(marks.has(READOUT_KEY.index(id))).toBe(false);
  });

  it('every marked value equals the readout of the real fold with the card', () => {
    for (const line of ['armor', 'reload', 'lightTorpedo', 'hullRepair']) {
      const marks = hoverPreview(SHIP, line)!;
      const next = byKey(shipReadouts(SHIP, line)!);
      expect(marks.size, line).toBeGreaterThan(0);
      for (const [key, m] of marks) expect(m.raw, `${line} ${key}`).toBe(next.get(key)!.raw);
    }
  });

  it('a SECOND LAUNCHER TUBE card marks the torpedo row`s tube count up (a new clock)', () => {
    const you = { ...SHIP, cards: ['lightTorpedo'] };
    const marks = hoverPreview(you, 'secondLauncherTube')!;
    expect(marks.get(READOUT_KEY.count('torpedo', 'tubes'))!.direction).toBe('up');
  });

  it('a tier card moves the row`s tier numeral the way the card`s own tier step says', () => {
    const you = { ...SHIP, cards: ['lightTorpedo'] };
    const step = cardTierSteps(CATALOG.lightTorpedo, 1)!;
    const m = hoverPreview(you, 'lightTorpedo')!.get(READOUT_KEY.tier('torpedo'))!;
    expect(m.from).toBe(step.cur);
    expect(m.raw).toBe(step.next);
  });

  it('a REFUSED card (the shared pickRefusal over the own slots) previews nothing', () => {
    const full = ['gun', 'boost', 'lightTorpedo', 'navalMines', 'starShells', ...Array.from({ length: SLOT_COUNT - 5 }, () => null)] as const;
    const you = { ...SHIP, cards: ['lightTorpedo'] };
    expect(hoverPreview(you, 'heavyTorpedo', full)).toBeNull();
    expect(hoverPreview(you, 'power', full)).not.toBeNull();
  });

  it('nothing hovered → no marks', () => {
    expect(hoverPreview(SHIP, null)).toBeNull();
  });
});

function weaponsInput(cards: readonly string[], over: Partial<WeaponsInput> = {}): WeaponsInput {
  const stats = fold(cards);
  const loadout = slotsWithCards(stats, cards).map((s) => s.equipmentId);
  return {
    stats, cards, cls: CLS, loadout, ammo: loadout.map(() => null), turrets: [], launchers: [], racks: [],
    sec: { heat: 0 }, primedSlot: 0,
    readouts: consoleReadouts({ stats, loadout, cards, cls: CLS }),
    ...over,
  };
}

describe('a non-finite distance reads EMPTY, never a bare unit (Story 11.2 gate C5)', () => {
  it('the secondaries reach and a weapon reach print nothing when the number is not finite', () => {
    const stats = structuredClone(fold([]));
    stats.secondaryRangeU = Number.NaN;
    stats.equipment.mainBattery.rangeU = Number.POSITIVE_INFINITY;
    const loadout = slotsWithCards(stats, []).map((s) => s.equipmentId);
    const rs = byKey(consoleReadouts({ stats, loadout, cards: [], cls: CLS }));
    expect(rs.get(READOUT_KEY.stat('secondaries', 'rangeU'))?.value).toBe('');
    expect(rs.get(READOUT_KEY.stat('mainBattery', 'rangeU'))?.value).toBe('');
  });
});

describe('weaponRowModels — the five rows in the ruled order (R17)', () => {
  it('comes out MAIN BATTERY · SECONDARIES · TORPEDO · MINES · SPECIAL with their own key chips', () => {
    const rows = weaponRowModels(weaponsInput([]));
    expect(rows.map((r) => r.kind)).toEqual([...WEAPON_ROW_KINDS]);
    expect(rows.map((r) => r.keyGlyph)).toEqual(WEAPON_ROW_KINDS.map((k) => ROW_KEY_GLYPH[k]));
    expect(new Set(rows.map((r) => r.keyGlyph)).size).toBe(rows.length);
  });

  it('an unfitted Q / E / R row is EMPTY, keeps its key, shows its family glyph and no numbers', () => {
    const rows = weaponRowModels(weaponsInput([]));
    for (const r of rows.slice(2)) {
      expect(r.state).toBe('empty');
      expect(r.emptyGlyph).not.toBeNull();
      expect(r.stats).toEqual([]);
      expect(r.clocks).toEqual([]);
      expect(r.keyGlyph).not.toBe('');
    }
  });

  it('a readied Q row reads READIED whatever its reload; the main battery never does', () => {
    const cards = ['lightTorpedo'];
    const input = weaponsInput(cards, { primedSlot: 2 });
    const rows = weaponRowModels(input);
    expect(rows[2].readied).toBe(true);
    expect(rows[2].state).toBe('readied');
    expect(weaponRowModels(weaponsInput(cards, { primedSlot: 0 }))[0].readied).toBe(false);
  });

  it('the secondaries read ready at every heat (full heat slows, never locks) and carry the heat', () => {
    expect(weaponRowModels(weaponsInput([], { sec: { heat: 1 } }))[1]).toMatchObject({ state: 'ready', heat: { heat: 1 } });
    expect(weaponRowModels(weaponsInput([]))[1].state).toBe('ready');
  });

  it('one clock per turret, ready vs cooling off its own reload', () => {
    const turrets = [{ a: 0, reloadMsLeft: 0 }, { a: 0, reloadMsLeft: 4000 }];
    const mb = weaponRowModels(weaponsInput([], { turrets }))[0];
    expect(mb.clocks.map((c) => c.ready)).toEqual([true, false]);
    expect(mb.state).toBe('ready');
    const all = weaponRowModels(weaponsInput([], { turrets: [{ a: 0, reloadMsLeft: 4000 }] }))[0];
    expect(all.state).toBe('cooling');
  });

  it('one clock per tube, grouped by launcher', () => {
    const launchers = [{ a: 0, tubes: [0, 3000] }, { a: 0, tubes: [0, 0] }];
    const q = weaponRowModels(weaponsInput(['lightTorpedo'], { launchers }))[2];
    expect(q.clocks.map((c) => c.group)).toEqual([0, 0, 1, 1]);
    expect(q.clocks.filter((c) => !c.ready)).toHaveLength(1);
  });

  it('the stats line is the row`s stat readouts, in print order', () => {
    const input = weaponsInput(['lightTorpedo']);
    const q = weaponRowModels(input)[2];
    expect(q.stats.length).toBeGreaterThan(0);
    expect(q.stats.every((r) => r.role === 'stat' && r.key.startsWith('row.torpedo.'))).toBe(true);
  });
});

describe('the mines row — a clock per rack, pips per held mine (R17)', () => {
  function minesRow(cards: string[], id: MineEquipmentId, held?: number[]) {
    const stats = fold(cards);
    const racks = initialRacks(stats, id).racks.map((r, i) => ({ ...r, n: held?.[i] ?? r.n }));
    return { row: weaponRowModels(weaponsInput(cards, { racks }))[3], stats };
  }

  it('two racks × the shared rack capacity, every rack full at fit', () => {
    const { row, stats } = minesRow(['navalMines', 'secondMineRack', 'expandedMineRacks'], 'navalMines');
    expect(row.racks).toHaveLength(rackCount(stats));
    expect(rackCount(stats)).toBe(2);
    expect(row.clocks).toHaveLength(row.racks.length);
    for (const r of row.racks) expect(r).toMatchObject({ capacity: rackCapacity(stats, 'navalMines'), held: rackCapacity(stats, 'navalMines') });
  });

  it('a captive rack holds fewer than a naval rack on the same cards — capacity is derived, never a constant', () => {
    const naval = minesRow(['navalMines', 'secondMineRack', 'expandedMineRacks'], 'navalMines');
    const captive = minesRow(['captiveMines', 'secondMineRack', 'expandedMineRacks'], 'captiveMines');
    expect(captive.row.racks).toHaveLength(2);
    expect(captive.row.racks[0].capacity).toBe(rackCapacity(captive.stats, 'captiveMines'));
    expect(captive.row.racks[0].capacity).toBeLessThan(naval.row.racks[0].capacity);
  });

  it('pips count the mines a rack holds, and an emptied rack row is not ready', () => {
    const { row } = minesRow(['navalMines', 'secondMineRack'], 'navalMines', [0, 0]);
    expect(row.racks.map((r) => r.held)).toEqual([0, 0]);
    expect(row.state).toBe('cooling');
  });
});

describe('clocks and abilities', () => {
  it('a clock numeral prints tenths under the threshold, rounds UP above it, nothing when ready', () => {
    const T = CLIENT_CONFIG.console.tenthsBelowMs;
    expect(clockNumeral(0)).toBe('');
    expect(clockNumeral(Number.NaN)).toBe('');
    expect(clockNumeral(T - 100)).toBe(((T - 100) / 1000).toFixed(1));
    expect(clockNumeral(6100)).toBe('7');
    expect(mountClock(0, 9000)).toMatchObject({ ready: true, progress: 1, numeral: '' });
    expect(mountClock(4500, 9000).progress).toBeCloseTo(0.5, 9);
  });

  it('an unreadable remaining time reads NOT ready (fail closed), with a finite ring', () => {
    const c = mountClock(Number.NaN, 9000);
    expect(c.ready).toBe(false);
    expect(Number.isFinite(c.progress)).toBe(true);
    expect(c.numeral).toBe('');
  });

  it('a fitted special with no ammo state yet reads NOT ready', () => {
    const special = weaponRowModels(weaponsInput(['starShells']))[WEAPON_ROW_KINDS.indexOf('special')];
    expect(special.id).not.toBeNull();
    expect(special.clocks.some((c) => c.ready)).toBe(false);
    expect(special.state).not.toBe('ready');
  });

  it('C · V · Shift in order with their keys; cooling reads off the server stamp', () => {
    const stats = fold([]);
    const base = { stats, cards: [], shift: 'boost' as const, nowMs: 1000, repairReadyAt: undefined, smokeReadyAt: undefined, shiftAmmo: null, shiftActiveMsLeft: 0 };
    const ready = abilityModels(base);
    expect(ready.map((a) => a.kind)).toEqual([...ABILITY_KINDS]);
    expect(ready.map((a) => a.keyGlyph)).toEqual(ABILITY_KINDS.map((k) => ABILITY_KEY_GLYPH[k]));
    expect(ready.every((a) => a.state === 'ready')).toBe(true);
    const cooling = abilityModels({ ...base, repairReadyAt: 1000 + stats.repair.cooldownMs / 2 });
    expect(cooling[0].state).toBe('cooling');
    expect(cooling[0].progress).toBeCloseTo(0.5, 9);
    expect(cooling[0].msLeft).toBeCloseTo(stats.repair.cooldownMs / 2, 9);
  });

  it('a running Shift window reads ACTIVE ahead of its cooldown', () => {
    const stats = fold([]);
    const shift = abilityModels({ stats, cards: [], shift: 'boost', nowMs: 0, repairReadyAt: undefined, smokeReadyAt: undefined, shiftAmmo: { n: 0, reloadMsLeft: 5000 }, shiftActiveMsLeft: 3000 })[2];
    expect(shift.state).toBe('active');
    expect(shift.msLeft).toBe(3000);
  });
});
