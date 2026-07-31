// Firing-arc + range helpers (render/weaponArc.ts) — shared by firing.ts's
// marker rendering and deniedFire.ts's own-fire denial via main.ts. Keyed by the
// fitted EQUIPMENT ID (Story 1.7), NOT the loadout slot index: slot identity is
// now hull-dependent (BB slot 1 = cannon, TB slot 1 = torpedo), so a slot-number
// branch would light the wrong marker. The gun family (gun/cannon/starShells) is
// 360°; the torpedo has a bow arc; the MINE has a rear placement arc (Story 2.8,
// amendment 45 — PIN FLIPPED from Story 1.8's un-aimed stern drop); the decoy
// buoy still drops astern regardless of aim.
//
// The TB torpedo case is the byte-identical regression pin: its bow-arc behavior
// must NOT drift as the branch grows a second sector weapon. The Mine Layer fits
// [gun, mine, decoyBuoy, empty], so ML slot 1 is now an AIMED weapon and slot 2
// stays `none`. loadoutFor is the authoritative id→slot map, so we derive the
// ids the same way main.ts does.

import { describe, it, expect } from 'vitest';
import { BOON_CATALOG, CONFIG, arcFor, effectiveStats, loadoutFor, resolveBoons } from '@salvo/shared';
import type { EquipmentId } from '@salvo/shared';
import { fireArcKind, weaponArcHit, weaponRangeHit, weaponRangeU } from '../render/weaponArc.js';

/** The fitted equipment id at a slot for a hull (the client's slotIdsFor path). */
function idAt(cls: 'torpedoBoat' | 'battleship' | 'mineLayer', slot: number): EquipmentId | null {
  const stats = effectiveStats(CONFIG.shipClasses[cls]);
  return loadoutFor(cls, stats)[slot].equipmentId;
}

describe('fireArcKind — equipment-id → firing-arc class', () => {
  it('classes the gun FAMILY (gun/cannon/starShells) as 360° gunLike', () => {
    expect(fireArcKind('gun')).toBe('gunLike');
    expect(fireArcKind('cannon')).toBe('gunLike');
    expect(fireArcKind('starShells')).toBe('gunLike');
  });

  it('classes the two SECTOR weapons — the torpedo bow arc and the mine rear arc', () => {
    expect(fireArcKind('torpedo')).toBe('sector');
    // PIN FLIPPED (Story 2.8, amendment 45): the mine is a click-aimed weapon
    // with a rear placement sector — it used to classify `none`.
    expect(fireArcKind('mine')).toBe('sector');
  });

  it('classes every instant ability + the empty slot as none (not an aimed weapon)', () => {
    expect(fireArcKind('speedBoost')).toBe('none');
    expect(fireArcKind('decoyBuoy')).toBe('none'); // Story 1.8: the ML radar-double buoy
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

describe('weaponArcHit — instant abilities / empty slot', () => {
  it('is FALSE for every ability and the empty slot (not a weapon, never in arc)', () => {
    expect(weaponArcHit(0, 0, 'speedBoost')).toBe(false);
    expect(weaponArcHit(0, 0, 'decoyBuoy')).toBe(false);
    expect(weaponArcHit(0, 0, null)).toBe(false); // empty slot 3 / defensive null
  });
});

describe('weaponArcHit — mine REAR placement arc (Story 2.8, amendment 45)', () => {
  const arc = arcFor('mine');
  if (arc.kind !== 'sector') throw new Error('mine must declare a sector');

  it('is true astern (the sector is centred on CONFIG.mine.offset) and false dead ahead', () => {
    // PIN FLIPPED: the mine used to answer FALSE at every bearing.
    expect(weaponArcHit(0, arc.offset, 'mine')).toBe(true);
    expect(weaponArcHit(0, 0, 'mine')).toBe(false); // dead ahead is out of the rear arc
  });

  it('is boundary-inclusive at the sector edge and denied a hair past it', () => {
    expect(weaponArcHit(0, arc.offset + arc.halfArc, 'mine')).toBe(true);
    expect(weaponArcHit(0, arc.offset - arc.halfArc, 'mine')).toBe(true);
    expect(weaponArcHit(0, arc.offset + arc.halfArc + 0.001, 'mine')).toBe(false);
  });

  it('rotates with heading, exactly like the bow arc', () => {
    const heading = Math.PI / 2; // facing +y — the rear arc points at -y
    expect(weaponArcHit(heading, heading + arc.offset, 'mine')).toBe(true);
    expect(weaponArcHit(heading, heading, 'mine')).toBe(false);
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

describe('weaponArcHit — TB torpedo regression + ML ability fit (Story 1.8)', () => {
  // The id-driven branch must reproduce the TB's bow-arc torpedo behavior
  // (TB slot 1 = torpedo). The Mine Layer now fits [gun, mine, decoyBuoy, empty]
  // — both specials are instant abilities (never aimed), so slots 1/2 read as
  // `none` and are never in arc. We drive weaponArcHit through the REAL fitted ids.
  const halfArc = CONFIG.torpedo.halfArc;

  it('TB slot 1 is the torpedo; ML slot 1 is the mine and slot 2 the decoy rack', () => {
    expect(idAt('torpedoBoat', 1)).toBe('torpedo');
    expect(idAt('mineLayer', 1)).toBe('mine');
    expect(idAt('mineLayer', 2)).toBe('decoyBuoy');
  });

  it('the TB torpedo gates on the bow arc exactly as before', () => {
    const torp = idAt('torpedoBoat', 1);
    expect(weaponArcHit(0, 0, torp)).toBe(true);
    expect(weaponArcHit(0, halfArc, torp)).toBe(true);
    expect(weaponArcHit(0, halfArc + 0.01, torp)).toBe(false);
    expect(weaponArcHit(0, Math.PI, torp)).toBe(false); // astern
  });

  it('the ML mine slot is an AIMED sector weapon; the decoy rack stays an ability', () => {
    // PIN FLIPPED (Story 2.8): slot 1 used to classify `none` alongside slot 2.
    const mine = idAt('mineLayer', 1);
    expect(fireArcKind(mine)).toBe('sector');
    const rear = arcFor('mine');
    if (rear.kind !== 'sector') throw new Error('mine must declare a sector');
    expect(weaponArcHit(0, rear.offset, mine)).toBe(true);
    const decoy = idAt('mineLayer', 2);
    expect(fireArcKind(decoy)).toBe('none');
    expect(weaponArcHit(0, 0, decoy)).toBe(false);
    expect(weaponArcHit(1.2, -2.9, decoy)).toBe(false);
    expect(weaponArcHit(0, Math.PI, decoy)).toBe(false);
  });
});

describe('weaponRangeU — per-weapon burst/clamp range', () => {
  const stats = effectiveStats(CONFIG.shipClasses.battleship);

  it('cannon + star shells read their OWN range block', () => {
    expect(weaponRangeU(stats, 'cannon')).toBe(stats.cannon.rangeU);
    expect(weaponRangeU(stats, 'starShells')).toBe(stats.starShells.rangeU);
    // Boonless, all three equal the radar base.
    expect(weaponRangeU(stats, 'cannon')).toBe(CONFIG.vision.radar);
    expect(weaponRangeU(stats, 'starShells')).toBe(CONFIG.vision.radar);
  });

  it('the gun reads its own range block (the default for every non-mine id)', () => {
    expect(weaponRangeU(stats, 'gun')).toBe(stats.gun.rangeU);
    // Non-gun-like ids draw no ring; the gun range is the harmless default.
    expect(weaponRangeU(stats, 'torpedo')).toBe(stats.gun.rangeU);
    expect(weaponRangeU(stats, null)).toBe(stats.gun.rangeU);
  });

  it('the MINE reads its ratified placement reach — NOT radar range (Story 2.8)', () => {
    expect(weaponRangeU(stats, 'mine')).toBe(CONFIG.mine.placeRange);
    expect(weaponRangeU(stats, 'mine')).toBeLessThan(stats.gun.rangeU);
  });

  it('PIN FLIPPED: an intelRadar stack grows the gun, cannon AND star shells together', () => {
    // Story 2.8 (brainstorm 2026-07-30): all three gun-family ranges are DERIVED
    // from the folded radarRange — Intel is a stealth offense category. The old
    // "an upgraded gun out-ranges the cannon" quirk died with the gunRange
    // upgrade; the mine's placement reach is deliberately NOT part of it.
    const intel = effectiveStats(
      CONFIG.shipClasses.battleship,
      resolveBoons(['intelRadar', 'intelRadar', 'intelRadar'], BOON_CATALOG),
    );
    expect(weaponRangeU(intel, 'gun')).toBeGreaterThan(CONFIG.vision.radar);
    expect(weaponRangeU(intel, 'cannon')).toBe(weaponRangeU(intel, 'gun'));
    expect(weaponRangeU(intel, 'starShells')).toBe(weaponRangeU(intel, 'gun'));
    expect(weaponRangeU(intel, 'mine')).toBe(CONFIG.mine.placeRange); // untouched
  });
});

describe('weaponRangeHit — the mine\'s hard placement-reach denial (Story 2.8)', () => {
  // The server's mine row refuses `aimDist > CONFIG.mine.placeRange` through
  // the SAME 'out-of-arc' denial channel as a bad bearing, consuming nothing.
  // The client's predicted gate must be its exact complement, or an
  // out-of-range click would silently consume the prime and revert to the gun.
  it('accepts a click inside the reach, boundary included, and refuses one past it', () => {
    expect(weaponRangeHit(0, 'mine')).toBe(true);
    expect(weaponRangeHit(CONFIG.mine.placeRange - 1, 'mine')).toBe(true);
    expect(weaponRangeHit(CONFIG.mine.placeRange, 'mine')).toBe(true); // inclusive, like the server
    expect(weaponRangeHit(CONFIG.mine.placeRange + 0.001, 'mine')).toBe(false);
  });

  it('never gates any OTHER id on distance — they clamp or run on, they do not deny', () => {
    for (const id of ['gun', 'cannon', 'starShells', 'torpedo', 'speedBoost', 'decoyBuoy'] as const) {
      expect(weaponRangeHit(1e6, id), id).toBe(true);
    }
    expect(weaponRangeHit(1e6, null)).toBe(true);
  });
});

// --- Story 1.10: classification derives from the shared arcFor descriptor ----

describe('weaponArc — arcFor single-source (Story 1.10)', () => {
  const ALL_IDS: EquipmentId[] = ['gun', 'torpedo', 'mine', 'speedBoost', 'cannon', 'starShells', 'decoyBuoy'];

  it('fireArcKind is a straight projection of the shared descriptor for every id', () => {
    for (const id of ALL_IDS) {
      const arc = arcFor(id);
      const expected = arc.kind === 'full' ? 'gunLike' : arc.kind === 'sector' ? 'sector' : 'none';
      expect(fireArcKind(id)).toBe(expected);
    }
  });

  it('the torpedo aim gate is EXACTLY the descriptor sector (boundary-inclusive)', () => {
    const arc = arcFor('torpedo');
    if (arc.kind !== 'sector') throw new Error('torpedo must declare a sector');
    // Heading 0: the sector edge is in-arc (shared inArc is boundary-inclusive)…
    expect(weaponArcHit(0, arc.offset + arc.halfArc, 'torpedo')).toBe(true);
    expect(weaponArcHit(0, arc.offset - arc.halfArc, 'torpedo')).toBe(true);
    // …and a hair beyond it is denied — the exact server gate, same primitives.
    expect(weaponArcHit(0, arc.offset + arc.halfArc + 0.001, 'torpedo')).toBe(false);
  });
});
