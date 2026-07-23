// arcFor — the single arc-shape source (Story 1.10). These tests pin the
// RATIFIED class-era geometry (Eric 2026-07-23) byte-for-byte to CONFIG: the
// gun family 360°, the torpedo bow sector ±30°, the shared mine/decoy stern
// rack at CONFIG.mine.offset, and the aimless speed boost. A geometry change
// here is a DESIGN change and must be deliberate — these are regression pins,
// not derivations.

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

  it('mine AND decoyBuoy share the ONE stern rack at CONFIG.mine.offset (astern)', () => {
    const mine = arcFor('mine');
    const decoy = arcFor('decoyBuoy');
    expect(mine).toEqual({ kind: 'stern-drop', offset: CONFIG.mine.offset });
    expect(decoy).toEqual(mine); // one rule for both ML specials — never split
    expect(CONFIG.mine.offset).toBeCloseTo(deg(180), 12);
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

describe('sectorArcFor — narrow-or-throw (the torpedo sector accessor)', () => {
  it('narrows the torpedo to its sector descriptor (offset/halfArc from CONFIG)', () => {
    expect(sectorArcFor('torpedo')).toEqual({
      kind: 'sector',
      offset: CONFIG.torpedo.offset,
      halfArc: CONFIG.torpedo.halfArc,
    });
  });

  it('THROWS on any non-sector id (a CONFIG/arcs authoring error, loud at load)', () => {
    // The gun family (full), the stern rack (stern-drop), and the aimless boost
    // (none) are every other shape — each must be rejected, never coerced.
    for (const id of ['gun', 'cannon', 'starShells', 'mine', 'decoyBuoy', 'speedBoost'] as const) {
      expect(() => sectorArcFor(id)).toThrow(/must be a sector/);
    }
  });
});

describe('sternDropArcFor — narrow-or-throw (the mine/decoy stern-rack accessor)', () => {
  it('narrows mine AND decoyBuoy to the shared stern-drop descriptor', () => {
    const drop = { kind: 'stern-drop', offset: CONFIG.mine.offset };
    expect(sternDropArcFor('mine')).toEqual(drop);
    expect(sternDropArcFor('decoyBuoy')).toEqual(drop); // one rack, both specials
  });

  it('THROWS on any non-stern-drop id (same authoring-error law)', () => {
    for (const id of ['gun', 'cannon', 'starShells', 'torpedo', 'speedBoost'] as const) {
      expect(() => sternDropArcFor(id)).toThrow(/must be a stern-drop/);
    }
  });
});
