// arcFor — the single arc-shape source (Story 1.10). These tests pin the
// RATIFIED geometry byte-for-byte to CONFIG: the gun family 360°, the torpedo
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
import { CONFIG, arcFor, sectorArcFor, twinSectorArcFor, type EquipmentId } from '../index.js';

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
    expect(arcFor('torpedo')).toEqual({
      kind: 'sector',
      offset: CONFIG.torpedo.offset,
      halfArc: CONFIG.torpedo.halfArc,
    });
    // The ratified VALUES: bow-centered, ±30°.
    expect(CONFIG.torpedo.offset).toBe(0);
    expect(CONFIG.torpedo.halfArc).toBeCloseTo(deg(30), 12);
  });

  it('the mine is the aimed REAR sector heading + 180° ± placeHalfArcDeg (FLIPPED, Story 2.8)', () => {
    expect(arcFor('mine')).toEqual({
      kind: 'sector',
      offset: CONFIG.mine.offset,
      halfArc: deg(CONFIG.mine.placeHalfArcDeg),
    });
    expect(CONFIG.mine.offset).toBeCloseTo(deg(180), 12);
    expect(CONFIG.mine.placeHalfArcDeg).toBe(60); // DRAFT half-arc, 2.10 tunes
    expect(CONFIG.mine.placeRange).toBe(150); // the ratified placement leash (Eric 2026-08-02)
  });

  it('the radarBuoy SHARES the mine rear sector exactly (click-placed, Story 7-5 wave 2)', () => {
    // Not merely equal-shaped: the SAME sector, so the two placement wedges can
    // never drift apart (R2.7 — "reuse the mine's rear sector").
    expect(arcFor('radarBuoy')).toEqual(arcFor('mine'));
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

  it('the speed boost aims nothing (none)', () => {
    expect(arcFor('speedBoost')).toEqual({ kind: 'none' });
  });

  it('covers every EquipmentId (a new id cannot ship without an arc shape)', () => {
    const ids: EquipmentId[] = ['gun', 'torpedo', 'mine', 'speedBoost', 'broadside', 'starShells', 'radarBuoy'];
    for (const id of ids) {
      expect(['full', 'sector', 'twin-sector', 'none']).toContain(arcFor(id).kind);
    }
  });

  it('is pure and deterministic (same descriptor object shape every call)', () => {
    expect(arcFor('torpedo')).toEqual(arcFor('torpedo'));
    expect(arcFor('gun')).toEqual(arcFor('gun'));
    expect(arcFor('broadside')).toEqual(arcFor('broadside'));
  });
});

describe('sectorArcFor — narrow-or-throw (torpedo bow arc + mine/buoy rear arc)', () => {
  it('narrows the torpedo, the mine AND the radar buoy to their sector descriptors', () => {
    expect(sectorArcFor('torpedo')).toEqual({
      kind: 'sector',
      offset: CONFIG.torpedo.offset,
      halfArc: CONFIG.torpedo.halfArc,
    });
    expect(sectorArcFor('mine')).toEqual({
      kind: 'sector',
      offset: CONFIG.mine.offset,
      halfArc: deg(CONFIG.mine.placeHalfArcDeg),
    });
    expect(sectorArcFor('radarBuoy')).toEqual(sectorArcFor('mine'));
  });

  it('THROWS on any non-sector id (a CONFIG/arcs authoring error, loud at load)', () => {
    for (const id of ['gun', 'broadside', 'starShells', 'speedBoost'] as const) {
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
    for (const id of ['gun', 'starShells', 'torpedo', 'mine', 'radarBuoy', 'speedBoost'] as const) {
      expect(() => twinSectorArcFor(id)).toThrow(/must be a twin-sector/);
    }
  });
});
