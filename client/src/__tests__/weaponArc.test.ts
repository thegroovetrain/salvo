// Firing-arc predicate (render/weaponArc.ts) — shared by firing.ts's marker
// rendering and deniedFire.ts's own-fire denial via main.ts. Keyed by loadout
// SLOT (Eric ruling 2026-07-21): the gun (0) is 360°, torpedo (1) has a bow
// arc, mines (2) drop astern regardless of aim.

import { describe, it, expect } from 'vitest';
import { CONFIG, SLOT_GUN } from '@salvo/shared';
import { weaponArcHit, SLOT_TORPEDO } from '../render/weaponArc.js';

const MINE = 2;

describe('weaponArcHit — gun (360°)', () => {
  it('is ALWAYS true — the gun is never out of arc, at any bearing/heading', () => {
    expect(weaponArcHit(0, 0, SLOT_GUN)).toBe(true); // dead ahead
    expect(weaponArcHit(0, Math.PI, SLOT_GUN)).toBe(true); // dead astern (was denied pre-1.4)
    expect(weaponArcHit(1.2, -2.9, SLOT_GUN)).toBe(true);
    expect(weaponArcHit(0, Math.PI / 2, SLOT_GUN)).toBe(true);
  });
});

describe('weaponArcHit — mines', () => {
  it('is always true (mines drop astern regardless of aim)', () => {
    expect(weaponArcHit(0, 0, MINE)).toBe(true);
    expect(weaponArcHit(1.2, -2.9, MINE)).toBe(true);
  });
});

describe('weaponArcHit — torpedo bow arc', () => {
  const halfArc = CONFIG.torpedo.halfArc;

  it('is true dead ahead (bow-centered) with heading 0', () => {
    expect(weaponArcHit(0, 0, SLOT_TORPEDO)).toBe(true);
  });

  it('is true right at the arc edge and false just past it', () => {
    expect(weaponArcHit(0, halfArc, SLOT_TORPEDO)).toBe(true); // inclusive boundary
    expect(weaponArcHit(0, halfArc + 0.01, SLOT_TORPEDO)).toBe(false);
  });

  it('is false directly astern', () => {
    expect(weaponArcHit(0, Math.PI, SLOT_TORPEDO)).toBe(false);
  });

  it('rotates with heading', () => {
    const heading = Math.PI / 2; // facing +y
    expect(weaponArcHit(heading, Math.PI / 2, SLOT_TORPEDO)).toBe(true);
    expect(weaponArcHit(heading, 0, SLOT_TORPEDO)).toBe(false);
  });
});
