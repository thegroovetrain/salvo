// Firing-arc + range helpers (render/weaponArc.ts) — shared by firing.ts's
// marker rendering and deniedFire.ts's own-fire denial via main.ts. Keyed by the
// fitted EQUIPMENT ID (Story 1.7), NOT the loadout slot index: slot identity is
// now hull-dependent (BB slot 1 = cannon, TB slot 1 = torpedo), so a slot-number
// branch would light the wrong marker. The gun family (gun/cannon/starShells) is
// 360°; the torpedo has a bow arc; the mine drops astern regardless of aim.
//
// The TB/ML torpedo + mine cases are the byte-identical regression pins: their
// behavior must NOT drift now that the branch is id-driven. loadoutFor is the
// authoritative id→slot map, so we derive the ids the same way main.ts does.

import { describe, it, expect } from 'vitest';
import { CONFIG, UPGRADE_IDS, effectiveStats, loadoutFor, zeroUpgrades } from '@salvo/shared';
import type { EquipmentId } from '@salvo/shared';
import { fireArcKind, weaponArcHit, weaponRangeU } from '../render/weaponArc.js';

/** The fitted equipment id at a slot for a hull (the client's slotIdsFor path). */
function idAt(cls: 'torpedoBoat' | 'battleship' | 'mineLayer', slot: number): EquipmentId | null {
  const stats = effectiveStats(CONFIG.shipClasses[cls], zeroUpgrades());
  return loadoutFor(cls, stats)[slot].equipmentId;
}

describe('fireArcKind — equipment-id → firing-arc class', () => {
  it('classes the gun FAMILY (gun/cannon/starShells) as 360° gunLike', () => {
    expect(fireArcKind('gun')).toBe('gunLike');
    expect(fireArcKind('cannon')).toBe('gunLike');
    expect(fireArcKind('starShells')).toBe('gunLike');
  });

  it('classes the torpedo (bow arc) and mine (astern) distinctly', () => {
    expect(fireArcKind('torpedo')).toBe('torpedo');
    expect(fireArcKind('mine')).toBe('mine');
  });

  it('classes abilities + the empty slot as none (not an aimed weapon)', () => {
    expect(fireArcKind('speedBoost')).toBe('none');
    expect(fireArcKind(null)).toBe('none');
  });
});

describe('weaponArcHit — gun family (360°)', () => {
  it('is ALWAYS true for the gun — never out of arc, at any bearing/heading', () => {
    expect(weaponArcHit(0, 0, 'gun')).toBe(true); // dead ahead
    expect(weaponArcHit(0, Math.PI, 'gun')).toBe(true); // dead astern (was denied pre-1.4)
    expect(weaponArcHit(1.2, -2.9, 'gun')).toBe(true);
    expect(weaponArcHit(0, Math.PI / 2, 'gun')).toBe(true);
  });

  it('is ALWAYS true for the Battleship cannon + star shells (Story 1.7: 360°)', () => {
    for (const id of ['cannon', 'starShells'] as const) {
      expect(weaponArcHit(0, 0, id)).toBe(true);
      expect(weaponArcHit(0, Math.PI, id)).toBe(true); // dead astern
      expect(weaponArcHit(1.2, -2.9, id)).toBe(true);
    }
    // And they arrive at the BB's real fitted slots 1 & 2 (the whole point).
    expect(idAt('battleship', 1)).toBe('cannon');
    expect(idAt('battleship', 2)).toBe('starShells');
  });
});

describe('weaponArcHit — mines (astern, no aim gate)', () => {
  it('is always true (mines drop astern regardless of aim)', () => {
    expect(weaponArcHit(0, 0, 'mine')).toBe(true);
    expect(weaponArcHit(1.2, -2.9, 'mine')).toBe(true);
  });
});

describe('weaponArcHit — abilities / empty slot', () => {
  it('is FALSE for the boost ability and the empty slot (not a weapon, never in arc)', () => {
    expect(weaponArcHit(0, 0, 'speedBoost')).toBe(false);
    expect(weaponArcHit(0, 0, null)).toBe(false); // empty slot 3 / defensive null
  });
});

describe('weaponArcHit — torpedo bow arc', () => {
  const halfArc = CONFIG.torpedo.halfArc;

  it('is true dead ahead (bow-centered) with heading 0', () => {
    expect(weaponArcHit(0, 0, 'torpedo')).toBe(true);
  });

  it('is true right at the arc edge and false just past it', () => {
    expect(weaponArcHit(0, halfArc, 'torpedo')).toBe(true); // inclusive boundary
    expect(weaponArcHit(0, halfArc + 0.01, 'torpedo')).toBe(false);
  });

  it('is false directly astern', () => {
    expect(weaponArcHit(0, Math.PI, 'torpedo')).toBe(false);
  });

  it('rotates with heading', () => {
    const heading = Math.PI / 2; // facing +y
    expect(weaponArcHit(heading, Math.PI / 2, 'torpedo')).toBe(true);
    expect(weaponArcHit(heading, 0, 'torpedo')).toBe(false);
  });
});

describe('weaponArcHit — TB/ML torpedo + mine byte-identical regression', () => {
  // The id-driven branch must reproduce the pre-1.7 slot-driven behavior for
  // every hull that still carries the torpedo/mine (TB slot 1 = torpedo; ML
  // slots 1/2 = torpedo/mine). We drive weaponArcHit through the REAL fitted ids.
  const halfArc = CONFIG.torpedo.halfArc;

  it('TB slot 1 is the torpedo bow arc; ML slots 1/2 are torpedo + mine', () => {
    expect(idAt('torpedoBoat', 1)).toBe('torpedo');
    expect(idAt('mineLayer', 1)).toBe('torpedo');
    expect(idAt('mineLayer', 2)).toBe('mine');
  });

  it('a torpedo fitted at any slot gates on the identical bow arc', () => {
    for (const cls of ['torpedoBoat', 'mineLayer'] as const) {
      const torp = idAt(cls, 1); // torpedo on both
      expect(weaponArcHit(0, 0, torp)).toBe(true);
      expect(weaponArcHit(0, halfArc, torp)).toBe(true);
      expect(weaponArcHit(0, halfArc + 0.01, torp)).toBe(false);
      expect(weaponArcHit(0, Math.PI, torp)).toBe(false); // astern
    }
  });

  it('the ML mine drops astern regardless of aim (always in arc)', () => {
    const mine = idAt('mineLayer', 2);
    expect(weaponArcHit(0, 0, mine)).toBe(true);
    expect(weaponArcHit(1.2, -2.9, mine)).toBe(true);
    expect(weaponArcHit(0, Math.PI, mine)).toBe(true);
  });
});

describe('weaponRangeU — per-weapon burst/clamp range', () => {
  const stats = effectiveStats(CONFIG.shipClasses.battleship, zeroUpgrades());

  it('cannon + star shells read their OWN (radar-derived base) range block', () => {
    expect(weaponRangeU(stats, 'cannon')).toBe(stats.cannon.rangeU);
    expect(weaponRangeU(stats, 'starShells')).toBe(stats.starShells.rangeU);
    // Un-upgraded, all three equal the radar base (the cannon does not extend).
    expect(weaponRangeU(stats, 'cannon')).toBe(CONFIG.vision.radar);
    expect(weaponRangeU(stats, 'starShells')).toBe(CONFIG.vision.radar);
  });

  it('the gun reads its own stacked range (the default for every other id)', () => {
    expect(weaponRangeU(stats, 'gun')).toBe(stats.gun.rangeU);
    // Non-gun-like ids draw no ring; the gun range is the harmless default.
    expect(weaponRangeU(stats, 'torpedo')).toBe(stats.gun.rangeU);
    expect(weaponRangeU(stats, null)).toBe(stats.gun.rangeU);
  });

  it('an upgraded gun can out-range the cannon (known interregnum quirk)', () => {
    const upg = zeroUpgrades();
    upg[UPGRADE_IDS.indexOf('gunRange')] = 3;
    const up = effectiveStats(CONFIG.shipClasses.battleship, upg);
    expect(weaponRangeU(up, 'gun')).toBeGreaterThan(weaponRangeU(up, 'cannon'));
    expect(weaponRangeU(up, 'cannon')).toBe(CONFIG.vision.radar); // cannon un-stacked
  });
});
