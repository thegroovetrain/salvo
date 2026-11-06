// arcFor — the single arc-shape source (Story 1.10). These tests pin the
// RATIFIED geometry byte-for-byte to CONFIG: the gun family 360°, the heavy torpedo
// bow sector ±30°, the mine's aimed REAR sector (FLIPPED from the stern drop
// in Story 2.8, amendment 45 — offset 180° ± placeHalfArcDeg), the
// BROADSIDE's twin beam sectors, and the aimless speed boost. The three weapons
// that were consumables until Story 10.5 (supercav, flash, fouling shell) keep
// their arcs as equipment. A geometry change
// here is a DESIGN change and must be deliberate — these are regression pins,
// not derivations.
//
// RETIRED in Story 7-5 wave 2: the whole `sternDropArcFor` describe block (the
// `stern-drop` shape went with its only user).

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  EQUIPMENT_IDS,
  EQUIPMENT_IS_WEAPON,
  SHIFT_IDS,
  arcFor,
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

  it('the FOULING SHELL (`foulingShell`) is a 360° shell (Story 9.4; a slot weapon since Story 10.5)', () => {
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
    // …and so is THE MAIN BATTERY (Story 10.4): every bearing is inside some
    // turret's arc, so the weapon as a whole is never denied out-of-arc.
    // Which turrets bear (and so may fire) is sim/turrets.ts.
    expect(arcFor('mainBattery')).toEqual({ kind: CONFIG.mainBattery.arc });
    expect(arcFor('mainBattery')).toEqual({ kind: 'full' });
  });

  it('every torpedo declares the LAUNCHER arc — the fixed sectors are retired (Story 10.6, R6)', () => {
    // The geometry is per-ship (the launchers held): sim/launchers.ts
    // `launcherSectors` / `pickTube`, covered in launchers.test.ts.
    for (const id of ['heavyTorpedo', 'lightTorpedo', 'supercavTorpedo'] as const) {
      expect(arcFor(id)).toEqual({ kind: 'launcher' });
      expect('offset' in CONFIG[id === 'heavyTorpedo' ? 'torpedo' : id], id).toBe(false);
      expect('halfArc' in CONFIG[id === 'heavyTorpedo' ? 'torpedo' : id], id).toBe(false);
    }
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

  it('the twin-sector side rule: a click in neither beam is denied (the broadside\'s rule)', () => {
    const arc = twinSectorArcFor('broadside');
    expect(twinSectorSide(0, 0, arc)).toBeNull();
    expect(twinSectorSide(0, deg(90), arc)).toBe(1);
    expect(twinSectorSide(0, deg(-90), arc)).toBe(-1);
  });

  it('aimed ⇔ it declares an arc: the arc table and EQUIPMENT_IS_WEAPON agree id for id', () => {
    for (const id of EQUIPMENT_IDS) {
      expect(arcFor(id).kind !== 'none', id).toBe(EQUIPMENT_IS_WEAPON[id]);
    }
  });

  it('FLASH SHELLS is 360° like the FOULING SHELL — one arc dial each, both `full` (Story 10.9, ruling 2)', () => {
    expect(arcFor('dazzleShells')).toEqual({ kind: CONFIG.flashShells.arc });
    expect(arcFor('dazzleShells')).toEqual(arcFor('foulingShell'));
    expect(arcFor('dazzleShells').kind).toBe('full');
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

  it('covers every EquipmentId (a new id cannot ship without an arc shape)', () => {
    const ids: EquipmentId[] = [...EQUIPMENT_IDS];
    for (const id of ids) {
      expect(['full', 'sector', 'twin-sector', 'launcher', 'none'], id).toContain(arcFor(id).kind);
    }
  });

  it('is pure and deterministic (same descriptor object shape every call)', () => {
    expect(arcFor('heavyTorpedo')).toEqual(arcFor('heavyTorpedo'));
    expect(arcFor('gun')).toEqual(arcFor('gun'));
    expect(arcFor('broadside')).toEqual(arcFor('broadside'));
  });
});

describe('sectorArcFor — narrow-or-throw (the mine rear arc)', () => {
  it('narrows the mines to their sector', () => {
    expect(sectorArcFor('foulingMines')).toEqual(sectorArcFor('navalMines'));
    expect(sectorArcFor('captiveMines')).toEqual(sectorArcFor('navalMines'));
    expect(sectorArcFor('navalMines')).toEqual({
      kind: 'sector',
      offset: CONFIG.mine.offset,
      halfArc: deg(CONFIG.mine.placeHalfArcDeg),
    });
    expect(sectorArcFor('foulingMines')).toEqual(sectorArcFor('navalMines'));
  });

  it('THROWS on any non-sector id (a CONFIG/arcs authoring error, loud at load)', () => {
    for (const id of ['gun', 'broadside', 'starShells', 'boost', 'lightTorpedo', 'heavyTorpedo', 'supercavTorpedo', 'foulingShell'] as const) {
      expect(() => sectorArcFor(id)).toThrow(/must be a sector/);
    }
  });
});

describe('twinSectorArcFor — narrow-or-throw (the broadside beam accessor)', () => {
  it('narrows the broadside to its twin-sector descriptor', () => {
    expect(twinSectorArcFor('broadside')).toEqual({
      kind: 'twin-sector',
      offset: deg(CONFIG.broadside.arcOffsetDeg),
      halfArc: deg(CONFIG.broadside.arcHalfArcDeg),
    });
  });

  it('THROWS on every other id — including the plain SECTOR weapons', () => {
    for (const id of ['gun', 'starShells', 'heavyTorpedo', 'lightTorpedo', 'navalMines', 'foulingMines',
      'dazzleShells', 'boost', 'supercavTorpedo'] as const) {
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
    expect(isMineEquipment(null)).toBe(false);
  });
});
