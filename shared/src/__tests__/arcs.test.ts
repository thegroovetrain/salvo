// arcFor — the single arc-shape source (Story 1.10). These tests pin the
// RATIFIED geometry byte-for-byte to CONFIG: the gun family 360°, the heavy torpedo
// bow sector ±30°, the mine's aimed REAR sector (FLIPPED from the stern drop
// in Story 2.8, amendment 45 — offset 180° ± placeHalfArcDeg; the DECOY BUOY
// consumable shared it from Story 8.16 until Story 10.9 deleted it — the four
// BUOYS that replace it are placed at ANY bearing, Eric 2026-10-28 ruling 9), the
// BROADSIDE's twin beam sectors, and the aimless speed boost. A geometry change
// here is a DESIGN change and must be deliberate — these are regression pins,
// not derivations.
//
// RETIRED in Story 7-5 wave 2: the whole `sternDropArcFor` describe block and
// the decoy stern-drop pin. The decoy buoy was the `stern-drop` shape's only
// user and the radar buoy replacing it is click-placed, so the shape, its
// accessor and their pins go together rather than testing a grammar nothing
// declares.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  CONSUMABLE_IDS,
  CONSUMABLE_IS_WEAPON,
  BUOY_LINE_IDS,
  EQUIPMENT_IDS,
  GUN_IDS,
  MOUNTED_GUN,
  SHIFT_IDS,
  arcFor,
  isConsumableId,
  sectorArcFor,
  twinSectorArcFor,
  twinSectorSide,
  type EquipmentId,
} from '../index.js';
import { MINE_EQUIPMENT_IDS, isMineEquipment, mineEquipmentFor, mineKindOf } from '../sim/arcs.js';

const deg = (d: number): number => (d * Math.PI) / 180;

describe('arcFor — descriptor ↔ CONFIG identity (ratified geometry)', () => {
  it('the gun FAMILY is declared full 360° in CONFIG and classifies full', () => {
    // The declaration itself is CONFIG-visible (rides the welcome snapshot).
    expect(CONFIG.gun.arc).toBe('full');
    expect(CONFIG.starShells.arc).toBe('full');
    // PHOSPHOR SHELLS joins the family as its own 360° weapon (Story 8.17,
    // amendment 131).
    expect(CONFIG.phosphorShells.arc).toBe('full');
    for (const id of ['gun', 'starShells', 'phosphorShells'] as const) {
      expect(arcFor(id)).toEqual({ kind: 'full' });
    }
  });

  it('the FOULING SHELL (`foulingShell`) is a 360° CONSUMABLE shell (Story 9.4; FLASH SHELLS before it)', () => {
    expect(isConsumableId('foulingShell')).toBe(true);
    expect(arcFor('foulingShell')).toEqual({ kind: CONFIG.foulingShell.arc });
    // Its reach is its OWN fixed CONFIG dial since Story 9.8 (ruling 125:
    // 8/12 of the radar ruler) — never the firer's radarRange.
    expect('rangeU' in CONFIG.foulingShell).toBe(true);
  });

  it('EVERY GUN is 360° — cannon, machine gun, flak (Story 8.15, amendment 106: "There is no \'arc.\'")', () => {
    for (const id of ['gun', 'machineGun', 'flak'] as const) {
      expect(CONFIG[id].arc, id).toBe('full');
      expect(arcFor(id), id).toEqual({ kind: 'full' });
    }
    // …and every seat gun's MOUNTED module is one of them (no gun can be
    // denied out-of-arc, whatever the captain picked).
    for (const gun of GUN_IDS) expect(arcFor(MOUNTED_GUN[gun]), gun).toEqual({ kind: 'full' });
  });

  it('the torpedo is the bow sector heading + offset ± halfArc, byte-identical to CONFIG', () => {
    expect(arcFor('heavyTorpedo')).toEqual({
      kind: 'sector',
      offset: CONFIG.torpedo.offset,
      halfArc: CONFIG.torpedo.halfArc,
    });
    // Bow-centered (the half-width is a tuning dial, not pinned here).
    expect(CONFIG.torpedo.offset).toBe(0);
  });

  it('the mine is the aimed REAR sector heading + 180° ± placeHalfArcDeg (FLIPPED, Story 2.8)', () => {
    expect(arcFor('navalMines')).toEqual({
      kind: 'sector',
      offset: CONFIG.mine.offset,
      halfArc: deg(CONFIG.mine.placeHalfArcDeg),
    });
    expect(CONFIG.mine.offset).toBeCloseTo(deg(180), 12);
  });

  it('the captive AND fouling mines share the naval mine chassis sector (R25, amendment 81)', () => {
    // Not merely equal-shaped: the SAME sector for all three kinds, so the
    // placement wedges can never drift apart.
    expect(arcFor('captiveMines')).toEqual(arcFor('navalMines'));
    expect(arcFor('foulingMines')).toEqual(arcFor('navalMines'));
  });

  it('the LIGHT TORPEDO is a TWIN SECTOR about both beams, byte-identical to CONFIG (R18)', () => {
    expect(arcFor('lightTorpedo')).toEqual({
      kind: 'twin-sector',
      offset: CONFIG.lightTorpedo.offset,
      halfArc: CONFIG.lightTorpedo.halfArc,
    });
    // Centred on the beam, leaving dead zones dead ahead and dead astern.
    expect(CONFIG.lightTorpedo.offset).toBeCloseTo(deg(90), 12);
    const arc = twinSectorArcFor('lightTorpedo');
    // And the side rule is the broadside's, verbatim: a click dead ahead is in
    // NEITHER sector and is denied out-of-arc.
    expect(twinSectorSide(0, 0, arc)).toBeNull();
    expect(twinSectorSide(0, deg(90), arc)).toBe(1);
    expect(twinSectorSide(0, deg(-90), arc)).toBe(-1);
  });

  it('the SUPERCAV TORPEDO is a bow sector — and it is a CONSUMABLE (amendment 74)', () => {
    expect(arcFor('supercavTorpedo')).toEqual({
      kind: 'sector',
      offset: CONFIG.supercavTorpedo.offset,
      halfArc: CONFIG.supercavTorpedo.halfArc,
    });
    expect(CONFIG.supercavTorpedo.offset).toBe(0);
    expect(isConsumableId('supercavTorpedo')).toBe(true);
  });

  it('EVERY OTHER consumable declares no arc — the aimed ones are exactly the click-aimed set (CONSUMABLE_IS_WEAPON)', () => {
    // FLASH SHELLS joined the aimed set in Story 8.17 (amendment 132); the
    // FOULING SHELL took its seat in Story 9.4; Story 10.9 brought FLASH
    // SHELLS back and added the four BUOYS. The arc table and the weapon table
    // must agree id for id: aimed ⇔ it declares an arc.
    for (const id of CONSUMABLE_IDS) {
      expect(arcFor(id).kind !== 'none', id).toBe(CONSUMABLE_IS_WEAPON[id]);
    }
    const aimed = CONSUMABLE_IDS.filter((id) => arcFor(id).kind !== 'none');
    expect([...aimed].sort()).toEqual(
      ['supercavTorpedo', 'foulingShell', 'dazzleShells', ...BUOY_LINE_IDS].sort(),
    );
  });

  it('FLASH SHELLS is 360° like the FOULING SHELL — one arc dial each, both `full` (Story 10.9, ruling 2)', () => {
    expect(arcFor('dazzleShells')).toEqual({ kind: CONFIG.flashShells.arc });
    expect(arcFor('dazzleShells')).toEqual(arcFor('foulingShell'));
    expect(arcFor('dazzleShells').kind).toBe('full');
  });

  it('EVERY BUOY is placed at ANY bearing — a `full` arc, NOT the mine sector (Story 10.9, Eric 2026-10-28 ruling 9)', () => {
    for (const id of BUOY_LINE_IDS) {
      expect(arcFor(id), id).toEqual({ kind: 'full' });
      expect(arcFor(id), id).not.toEqual(arcFor('navalMines'));
      expect(isConsumableId(id), id).toBe(true);
    }
    // The mines KEEP their rear sector — the buoys leaving it changed nothing
    // for them.
    expect(arcFor('navalMines')).toEqual({
      kind: 'sector',
      offset: CONFIG.mine.offset,
      halfArc: deg(CONFIG.mine.placeHalfArcDeg),
    });
    // The deleted DECOY BUOY is no consumable at all any more.
    expect(isConsumableId('decoyBuoy')).toBe(false);
  });

  it('the THREE class Shifts declare no arc — nothing else does (Story 8.15)', () => {
    // It was the boost plus four unbuilt weapons until Story 8.15: missile and
    // monitor are CUT (amendment 89e) and machine gun / flak are 360° guns.
    for (const id of SHIFT_IDS) {
      expect(arcFor(id), id).toEqual({ kind: 'none' });
    }
    const none = EQUIPMENT_IDS.filter((id) => arcFor(id).kind === 'none');
    expect([...none].sort()).toEqual([...SHIFT_IDS].sort());
  });

  it('the radar buoy is GONE from the equipment id space (Story 8.16)', () => {
    expect((EQUIPMENT_IDS as readonly string[]).includes('radarBuoy')).toBe(false);
  });

  it('the broadside is TWO mirrored beam sectors at ±90°, byte-identical to CONFIG', () => {
    expect(arcFor('broadside')).toEqual({
      kind: 'twin-sector',
      offset: deg(CONFIG.broadside.arcOffsetDeg),
      halfArc: deg(CONFIG.broadside.arcHalfArcDeg),
    });
    // Centred on the beam (the half-width is a tuning dial, not pinned here).
    expect(CONFIG.broadside.arcOffsetDeg).toBe(90);
  });

  it('the Shift boost aims nothing (none)', () => {
    expect(arcFor('boost')).toEqual({ kind: 'none' });
  });

  it('covers every SlotItemId (a new id cannot ship without an arc shape)', () => {
    const ids: EquipmentId[] = [...EQUIPMENT_IDS];
    for (const id of ids) {
      expect(['full', 'sector', 'twin-sector', 'none'], id).toContain(arcFor(id).kind);
    }
    // WIDENED PAST EQUIPMENT in Story 8.13 (amendment 74): the arc grammar now
    // answers for consumables too, because one of them is click-aimed.
    for (const id of CONSUMABLE_IDS) {
      expect(['full', 'sector', 'twin-sector', 'none'], id).toContain(arcFor(id).kind);
    }
  });

  it('is pure and deterministic (same descriptor object shape every call)', () => {
    expect(arcFor('heavyTorpedo')).toEqual(arcFor('heavyTorpedo'));
    expect(arcFor('gun')).toEqual(arcFor('gun'));
    expect(arcFor('broadside')).toEqual(arcFor('broadside'));
  });
});

describe('sectorArcFor — narrow-or-throw (torpedo bow arc + mine/decoy rear arc)', () => {
  it('narrows the heavy torpedo, the supercav, the mines AND the decoy buoy to their sectors', () => {
    expect(sectorArcFor('supercavTorpedo')).toEqual({
      kind: 'sector',
      offset: CONFIG.supercavTorpedo.offset,
      halfArc: CONFIG.supercavTorpedo.halfArc,
    });
    expect(sectorArcFor('foulingMines')).toEqual(sectorArcFor('navalMines'));
    expect(sectorArcFor('captiveMines')).toEqual(sectorArcFor('navalMines'));
    expect(sectorArcFor('heavyTorpedo')).toEqual({
      kind: 'sector',
      offset: CONFIG.torpedo.offset,
      halfArc: CONFIG.torpedo.halfArc,
    });
    expect(sectorArcFor('navalMines')).toEqual({
      kind: 'sector',
      offset: CONFIG.mine.offset,
      halfArc: deg(CONFIG.mine.placeHalfArcDeg),
    });
    expect(sectorArcFor('foulingMines')).toEqual(sectorArcFor('navalMines'));
  });

  it('THROWS on any non-sector id (a CONFIG/arcs authoring error, loud at load)', () => {
    for (const id of ['gun', 'broadside', 'starShells', 'boost', 'lightTorpedo', 'hullRepair'] as const) {
      expect(() => sectorArcFor(id)).toThrow(/must be a sector/);
    }
  });
});

describe('twinSectorArcFor — narrow-or-throw (the broadside beam accessor)', () => {
  it('narrows the broadside AND the light torpedo to their twin-sector descriptors', () => {
    expect(twinSectorArcFor('broadside')).toEqual({
      kind: 'twin-sector',
      offset: deg(CONFIG.broadside.arcOffsetDeg),
      halfArc: deg(CONFIG.broadside.arcHalfArcDeg),
    });
    expect(twinSectorArcFor('lightTorpedo')).toEqual({
      kind: 'twin-sector',
      offset: CONFIG.lightTorpedo.offset,
      halfArc: CONFIG.lightTorpedo.halfArc,
    });
    // The two twin sectors are NOT the same geometry: the light torpedo's
    // beams are narrower (+/-45 deg vs +/-60 deg), so its dead zones are wider.
    expect(twinSectorArcFor('lightTorpedo').halfArc)
      .toBeLessThan(twinSectorArcFor('broadside').halfArc);
  });

  it('THROWS on every other id — including the plain SECTOR weapons', () => {
    for (const id of ['gun', 'starShells', 'heavyTorpedo', 'navalMines', 'foulingMines',
      'healingBuoy', 'dazzleShells', 'boost', 'supercavTorpedo'] as const) {
      expect(() => twinSectorArcFor(id)).toThrow(/must be a twin-sector/);
    }
  });
});

describe('the mine-line family', () => {
  it('a mine line and its kind round-trip through mineKindOf / mineEquipmentFor', () => {
    const kinds = new Set<string>();
    for (const id of MINE_EQUIPMENT_IDS) {
      const kind = mineKindOf(id);
      kinds.add(kind);
      expect(mineEquipmentFor(kind)).toBe(id);
    }
    expect(kinds.size).toBe(MINE_EQUIPMENT_IDS.length);
  });

  it('isMineEquipment admits exactly the mine lines and refuses null', () => {
    const mines = new Set<string>(MINE_EQUIPMENT_IDS);
    for (const id of EQUIPMENT_IDS) expect(isMineEquipment(id), id).toBe(mines.has(id));
    for (const id of CONSUMABLE_IDS) expect(isMineEquipment(id), id).toBe(false);
    expect(isMineEquipment(null)).toBe(false);
  });
});
