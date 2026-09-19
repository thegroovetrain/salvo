// arcFor — the single arc-shape source (Story 1.10). These tests pin the
// RATIFIED geometry byte-for-byte to CONFIG: the gun family 360°, the heavy torpedo
// bow sector ±30°, the mine's aimed REAR sector (FLIPPED from the stern drop
// in Story 2.8, amendment 45 — offset 180° ± placeHalfArcDeg) which the RADAR
// BUOY now shares (Story 7-5 wave 2 — it is click-placed, not dropped), the
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
  EQUIPMENT_IDS,
  arcFor,
  isConsumableId,
  sectorArcFor,
  twinSectorArcFor,
  twinSectorSide,
  type EquipmentId,
} from '../index.js';

const deg = (d: number): number => (d * Math.PI) / 180;

describe('arcFor — descriptor ↔ CONFIG identity (ratified geometry)', () => {
  it('the gun FAMILY is declared full 360° in CONFIG and classifies full', () => {
    // The declaration itself is CONFIG-visible (rides the welcome snapshot).
    expect(CONFIG.gun.arc).toBe('full');
    expect(CONFIG.starShells.arc).toBe('full');
    for (const id of ['gun', 'starShells'] as const) {
      expect(arcFor(id)).toEqual({ kind: 'full' });
    }
  });

  it('the torpedo is the bow sector heading + offset ± halfArc, byte-identical to CONFIG', () => {
    expect(arcFor('heavyTorpedo')).toEqual({
      kind: 'sector',
      offset: CONFIG.torpedo.offset,
      halfArc: CONFIG.torpedo.halfArc,
    });
    // The ratified VALUES: bow-centered, ±30°.
    expect(CONFIG.torpedo.offset).toBe(0);
    expect(CONFIG.torpedo.halfArc).toBeCloseTo(deg(30), 12);
  });

  it('the mine is the aimed REAR sector heading + 180° ± placeHalfArcDeg (FLIPPED, Story 2.8)', () => {
    expect(arcFor('navalMines')).toEqual({
      kind: 'sector',
      offset: CONFIG.mine.offset,
      halfArc: deg(CONFIG.mine.placeHalfArcDeg),
    });
    expect(CONFIG.mine.offset).toBeCloseTo(deg(180), 12);
    expect(CONFIG.mine.placeHalfArcDeg).toBe(60); // DRAFT half-arc, 2.10 tunes
    expect(CONFIG.mine.placeRange).toBe(150); // the ratified placement leash (Eric 2026-08-02)
  });

  it('the captive AND fouling mines share the naval mine chassis sector (R25, amendment 81)', () => {
    // Not merely equal-shaped: the SAME sector for all three kinds, so the
    // placement wedges can never drift apart.
    expect(arcFor('captiveMines')).toEqual(arcFor('navalMines'));
    expect(arcFor('foulingMines')).toEqual(arcFor('navalMines'));
  });

  it('the LIGHT TORPEDO is a TWIN SECTOR: both beams, +/-45 deg about 90 deg (R18)', () => {
    expect(arcFor('lightTorpedo')).toEqual({
      kind: 'twin-sector',
      offset: CONFIG.lightTorpedo.offset,
      halfArc: CONFIG.lightTorpedo.halfArc,
    });
    // The ratified VALUES: the two sectors cover 45-135 deg and -45 to -135
    // deg, leaving 90 deg dead zones dead ahead and dead astern.
    expect(CONFIG.lightTorpedo.offset).toBeCloseTo(deg(90), 12);
    expect(CONFIG.lightTorpedo.halfArc).toBeCloseTo(deg(45), 12);
    const arc = twinSectorArcFor('lightTorpedo');
    expect((arc.offset - arc.halfArc) / (Math.PI / 180)).toBeCloseTo(45, 9);
    expect((arc.offset + arc.halfArc) / (Math.PI / 180)).toBeCloseTo(135, 9);
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
    expect(CONFIG.supercavTorpedo.halfArc).toBeCloseTo(deg(15), 12);
    expect(isConsumableId('supercavTorpedo')).toBe(true);
  });

  it('EVERY OTHER consumable declares no arc — the decoy\'s is Story 8.15\'s', () => {
    for (const id of CONSUMABLE_IDS) {
      if (id === 'supercavTorpedo') continue;
      expect(arcFor(id), id).toEqual({ kind: 'none' });
    }
  });

  it('the FOUR still-unbuilt v3 weapons and the Shift boost declare no arc yet (Story 8.14)', () => {
    // It was SEVEN until Story 8.13: the light torpedo declares its twin
    // sector, the supercav declares its bow sector as a consumable, and
    // fouling mines joined the mine chassis.
    for (const id of ['boost', 'missile', 'machineGun', 'flak', 'monitor'] as const) {
      expect(arcFor(id)).toEqual({ kind: 'none' });
    }
  });

  it('the radarBuoy SHARES the mine rear sector exactly (click-placed, Story 7-5 wave 2)', () => {
    // Not merely equal-shaped: the SAME sector, so the two placement wedges can
    // never drift apart (R2.7 — "reuse the mine's rear sector").
    expect(arcFor('radarBuoy')).toEqual(arcFor('navalMines'));
  });

  it('the broadside is TWO mirrored beam sectors at ±90°, each 60° half-wide', () => {
    expect(arcFor('broadside')).toEqual({
      kind: 'twin-sector',
      offset: deg(CONFIG.broadside.arcOffsetDeg),
      halfArc: deg(CONFIG.broadside.arcHalfArcDeg),
    });
    // The ratified VALUES, taken verbatim from the class-era side arcs: port
    // covers 30°–150°, starboard −30°–−150°, leaving 60°-wide dead zones dead
    // ahead and dead astern.
    expect(CONFIG.broadside.arcOffsetDeg).toBe(90);
    expect(CONFIG.broadside.arcHalfArcDeg).toBe(60);
    const arc = twinSectorArcFor('broadside');
    expect((arc.offset - arc.halfArc) / (Math.PI / 180)).toBeCloseTo(30, 9); // near edge
    expect((arc.offset + arc.halfArc) / (Math.PI / 180)).toBeCloseTo(150, 9); // far edge
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

describe('sectorArcFor — narrow-or-throw (torpedo bow arc + mine/buoy rear arc)', () => {
  it('narrows the heavy torpedo, the supercav, the mines AND the radar buoy to their sectors', () => {
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
    expect(sectorArcFor('radarBuoy')).toEqual(sectorArcFor('navalMines'));
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
      'radarBuoy', 'boost', 'supercavTorpedo'] as const) {
      expect(() => twinSectorArcFor(id)).toThrow(/must be a twin-sector/);
    }
  });
});
