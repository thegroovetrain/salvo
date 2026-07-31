// arcFor — the single arc-shape source (Story 1.10). These tests pin the
// RATIFIED geometry byte-for-byte to CONFIG: the gun family 360°, the torpedo
// bow sector ±30°, the mine's aimed REAR sector (FLIPPED from the stern drop
// in Story 2.8, amendment 45 — offset 180° ± placeHalfArcDeg), the decoy's
// stern drop at CONFIG.mine.offset, and the aimless speed boost. A geometry
// change here is a DESIGN change and must be deliberate — these are
// regression pins, not derivations.

import { describe, it, expect } from 'vitest';
import { CONFIG, arcFor, sectorArcFor, sternDropArcFor, type EquipmentId } from '../index.js';

const deg = (d: number): number => (d * Math.PI) / 180;

describe('arcFor — descriptor ↔ CONFIG identity (ratified geometry)', () => {
  it('the gun FAMILY is declared full 360° in CONFIG and classifies full', () => {
    // The declaration itself is CONFIG-visible (rides the welcome snapshot).
    expect(CONFIG.gun.arc).toBe('full');
    expect(CONFIG.cannon.arc).toBe('full');
    expect(CONFIG.starShells.arc).toBe('full');
    for (const id of ['gun', 'cannon', 'starShells'] as const) {
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
    expect(CONFIG.mine.placeRange).toBe(90); // DRAFT max placement range
  });

  it('the decoyBuoy keeps the stern drop at CONFIG.mine.offset (astern)', () => {
    expect(arcFor('decoyBuoy')).toEqual({ kind: 'stern-drop', offset: CONFIG.mine.offset });
  });

  it('the speed boost aims nothing (none)', () => {
    expect(arcFor('speedBoost')).toEqual({ kind: 'none' });
  });

  it('covers every EquipmentId (a new id cannot ship without an arc shape)', () => {
    const ids: EquipmentId[] = ['gun', 'torpedo', 'mine', 'speedBoost', 'cannon', 'starShells', 'decoyBuoy'];
    for (const id of ids) {
      expect(['full', 'sector', 'stern-drop', 'none']).toContain(arcFor(id).kind);
    }
  });

  it('is pure and deterministic (same descriptor object shape every call)', () => {
    expect(arcFor('torpedo')).toEqual(arcFor('torpedo'));
    expect(arcFor('gun')).toEqual(arcFor('gun'));
  });
});

describe('sectorArcFor — narrow-or-throw (torpedo bow arc + mine rear arc)', () => {
  it('narrows the torpedo AND the mine to their sector descriptors', () => {
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
  });

  it('THROWS on any non-sector id (a CONFIG/arcs authoring error, loud at load)', () => {
    for (const id of ['gun', 'cannon', 'starShells', 'decoyBuoy', 'speedBoost'] as const) {
      expect(() => sectorArcFor(id)).toThrow(/must be a sector/);
    }
  });
});

describe('sternDropArcFor — narrow-or-throw (the decoy stern-rack accessor)', () => {
  it('narrows decoyBuoy to the stern-drop descriptor', () => {
    expect(sternDropArcFor('decoyBuoy')).toEqual({ kind: 'stern-drop', offset: CONFIG.mine.offset });
  });

  it('THROWS on any non-stern-drop id — the MINE now included (FLIPPED, Story 2.8)', () => {
    for (const id of ['gun', 'cannon', 'starShells', 'torpedo', 'mine', 'speedBoost'] as const) {
      expect(() => sternDropArcFor(id)).toThrow(/must be a stern-drop/);
    }
  });
});
