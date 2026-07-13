// Firing-arc predicate (render/weaponArc.ts) — shared by firing.ts's sector
// rendering and deniedFire.ts's own-fire denial via main.ts.

import { describe, it, expect } from 'vitest';
import { CONFIG, WEAPON } from '@salvo/shared';
import { weaponArcHit, bearingGunMount } from '../render/weaponArc.js';

describe('weaponArcHit — mines', () => {
  it('is always true (mines drop astern regardless of aim)', () => {
    expect(weaponArcHit(0, 0, WEAPON.mine)).toBe(true);
    expect(weaponArcHit(1.2, -2.9, WEAPON.mine)).toBe(true);
  });
});

describe('weaponArcHit — torpedo bow arc', () => {
  const halfArc = CONFIG.torpedo.halfArc;

  it('is true dead ahead (bow-centered) with heading 0', () => {
    expect(weaponArcHit(0, 0, WEAPON.torpedo)).toBe(true);
  });

  it('is true right at the arc edge and false just past it', () => {
    expect(weaponArcHit(0, halfArc, WEAPON.torpedo)).toBe(true); // inclusive boundary
    expect(weaponArcHit(0, halfArc + 0.01, WEAPON.torpedo)).toBe(false);
  });

  it('is false directly astern', () => {
    expect(weaponArcHit(0, Math.PI, WEAPON.torpedo)).toBe(false);
  });

  it('rotates with heading', () => {
    const heading = Math.PI / 2; // facing +y
    expect(weaponArcHit(heading, Math.PI / 2, WEAPON.torpedo)).toBe(true);
    expect(weaponArcHit(heading, 0, WEAPON.torpedo)).toBe(false);
  });
});

describe('weaponArcHit — gun broadside mounts', () => {
  const port = CONFIG.gun.mounts.find((m) => m.name === 'port')!;
  const starboard = CONFIG.gun.mounts.find((m) => m.name === 'starboard')!;

  it('is true when aim falls in the port mount arc, heading 0', () => {
    expect(weaponArcHit(0, port.offset, WEAPON.gun)).toBe(true);
  });

  it('is true when aim falls in the starboard mount arc, heading 0', () => {
    expect(weaponArcHit(0, starboard.offset, WEAPON.gun)).toBe(true);
  });

  it('is false dead ahead / astern (the gap between broadside arcs)', () => {
    expect(weaponArcHit(0, 0, WEAPON.gun)).toBe(false);
    expect(weaponArcHit(0, Math.PI, WEAPON.gun)).toBe(false);
  });

  it('rotates with heading — the same relative bearing stays lit', () => {
    const heading = 1.0;
    expect(weaponArcHit(heading, heading + port.offset, WEAPON.gun)).toBe(true);
  });
});

describe('bearingGunMount — which mount bears on aim (HUD sub-bar highlight)', () => {
  it('returns 0 (port) aiming to port, 1 (starboard) aiming starboard', () => {
    expect(bearingGunMount(0, CONFIG.gun.mounts[0].offset)).toBe(0); // port +90°
    expect(bearingGunMount(0, CONFIG.gun.mounts[1].offset)).toBe(1); // starboard -90°
  });

  it('returns -1 when neither broadside bears (aim over the bow/stern)', () => {
    expect(bearingGunMount(0, 0)).toBe(-1); // dead ahead
    expect(bearingGunMount(0, Math.PI)).toBe(-1); // dead astern
  });

  it('rotates with heading', () => {
    const heading = 1.0;
    expect(bearingGunMount(heading, heading + CONFIG.gun.mounts[0].offset)).toBe(0);
  });
});
