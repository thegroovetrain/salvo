// Firing-arc + range helpers (render/weaponArc.ts) — shared by firing.ts's
// marker rendering and deniedFire.ts's own-fire denial via main.ts. Keyed by the
// fitted EQUIPMENT ID (Story 1.7), NOT the loadout slot index: slot identity is
// now hull-dependent (BB slot 1 = broadside, TB slot 1 = torpedo), so a
// slot-number branch would light the wrong marker. The gun family
// (gun/starShells) is 360°; the torpedo has a bow arc; the MINE and (Story 7-5
// wave 2) the RADAR BUOY have a rear placement arc; the BROADSIDE BARRAGE has
// TWIN mirrored beam sectors.
//
// The TB torpedo case is the byte-identical regression pin: its bow-arc behavior
// must NOT drift as the branch grows more shapes. loadoutFor is the
// authoritative id→slot map, so we derive the ids the same way main.ts does.
//
// STORY 7-5 WAVE 2 RETIRED the `stern-drop` pins wholesale: that shape is
// deleted from sim/arcs.ts with the decoy buoy that was its only user, so
// "the buoy is never in arc at any bearing" is no longer true and no longer
// asserted — the radar buoy is a placement SECTOR like the mine.

import { describe, it, expect } from 'vitest';
import { BOON_CATALOG, CONFIG, arcFor, effectiveStats, loadoutFor, resolveBoons } from '@salvo/shared';
import type { EquipmentId } from '@salvo/shared';
import {
  fireArcKind,
  pointInLitZone,
  sectorOutline,
  twinSectorSide,
  weaponArcHit,
  weaponRangeHit,
  weaponRangeU,
  weaponReachU,
} from '../render/weaponArc.js';
import { ownActiveZones } from '../render/litZones.js';

/** The fitted equipment id at a slot for a hull (the client's slotIdsFor path). */
function idAt(cls: 'torpedoBoat' | 'battleship' | 'mineLayer', slot: number): EquipmentId | null {
  const stats = effectiveStats(CONFIG.shipClasses[cls]);
  return loadoutFor(cls, stats)[slot].equipmentId;
}

describe('fireArcKind — equipment-id → firing-arc class', () => {
  it('classes the gun FAMILY (gun/starShells) as 360° gunLike', () => {
    expect(fireArcKind('gun')).toBe('gunLike');
    expect(fireArcKind('starShells')).toBe('gunLike');
  });

  it('classes the SECTOR ids — torpedo bow arc, mine + radar buoy rear arc', () => {
    expect(fireArcKind('torpedo')).toBe('sector');
    // PIN FLIPPED (Story 2.8, amendment 45): the mine is a click-aimed weapon
    // with a rear placement sector — it used to classify `none`.
    expect(fireArcKind('mine')).toBe('sector');
    // PIN FLIPPED (Story 7-5 wave 2): the buoy is click-placed in the mine's
    // rear sector now — it used to be an un-aimed stern drop classifying `none`.
    expect(fireArcKind('radarBuoy')).toBe('sector');
  });

  it('classes the BROADSIDE as `twin` — two mirrored beam sectors (R2.1)', () => {
    expect(fireArcKind('broadside')).toBe('twin');
  });

  it('classes the instant ability + the empty slot as none (not an aimed weapon)', () => {
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

  it('is ALWAYS true for star shells (Story 1.7: 360°)', () => {
    expect(weaponArcHit(0, 0, 'starShells')).toBe(true);
    expect(weaponArcHit(0, Math.PI, 'starShells')).toBe(true); // dead astern
    expect(weaponArcHit(1.2, -2.9, 'starShells')).toBe(true);
    // And the BB's real fitted slots 1 & 2 (the whole point) — slot 1 is the
    // BROADSIDE now, which is NOT 360° and gets its own suite below.
    expect(idAt('battleship', 1)).toBe('broadside');
    expect(idAt('battleship', 2)).toBe('starShells');
  });
});

// --- Story 7-5 wave 2: the BROADSIDE BARRAGE's twin beams (R2.1/R2.2) --------

describe('weaponArcHit + twinSectorSide — the broadside beams', () => {
  const arc = arcFor('broadside');
  if (arc.kind !== 'twin-sector') throw new Error('broadside must declare twin sectors');

  it('takes its geometry from the shared descriptor: ±90° centres, 60° half-arcs', () => {
    expect((arc.offset * 180) / Math.PI).toBeCloseTo(90, 9);
    expect((arc.halfArc * 180) / Math.PI).toBeCloseTo(60, 9);
  });

  it('is in arc on EITHER beam and denied in the bow / stern dead zones', () => {
    expect(weaponArcHit(0, Math.PI / 2, 'broadside')).toBe(true); // starboard beam
    expect(weaponArcHit(0, -Math.PI / 2, 'broadside')).toBe(true); // port beam
    expect(weaponArcHit(0, 0, 'broadside')).toBe(false); // dead ahead
    expect(weaponArcHit(0, Math.PI, 'broadside')).toBe(false); // dead astern
  });

  it('leaves a 60°-wide dead zone fore and aft (boundary-inclusive edges)', () => {
    // Edges come off the DESCRIPTOR, never re-derived from degree literals: the
    // 30°/150° boundaries are `offset ∓ halfArc` to the last float bit, and a
    // literal would land a hair off and read as an off-by-one dead zone.
    const near = arc.offset - arc.halfArc; // 30° — the beam's forward edge
    const far = arc.offset + arc.halfArc; // 150° — its after edge
    expect(weaponArcHit(0, near, 'broadside')).toBe(true);
    expect(weaponArcHit(0, near - 0.001, 'broadside')).toBe(false); // into the bow zone
    expect(weaponArcHit(0, far, 'broadside')).toBe(true);
    expect(weaponArcHit(0, far + 0.001, 'broadside')).toBe(false); // into the stern zone
    // The dead zones really are 60° wide: 2 × 30° either side of the bow.
    expect(((2 * near * 180) / Math.PI)).toBeCloseTo(60, 9);
  });

  it('names WHICH beam fires (R2.2), and null in a dead zone', () => {
    expect(twinSectorSide(0, Math.PI / 2, arc)).toBe(1);
    expect(twinSectorSide(0, -Math.PI / 2, arc)).toBe(-1);
    expect(twinSectorSide(0, 0, arc)).toBeNull();
    expect(twinSectorSide(0, Math.PI, arc)).toBeNull();
  });

  it('rotates with heading like every other sector', () => {
    const heading = Math.PI / 2; // facing +y — the beams point at ±x
    expect(twinSectorSide(heading, Math.PI, arc)).toBe(1);
    expect(twinSectorSide(heading, 0, arc)).toBe(-1);
    expect(weaponArcHit(heading, heading, 'broadside')).toBe(false); // dead ahead
  });
});

describe('weaponArcHit — instant abilities / empty slot', () => {
  it('is FALSE for the ability and the empty slot (not a weapon, never in arc)', () => {
    expect(weaponArcHit(0, 0, 'speedBoost')).toBe(false);
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
  // (TB slot 1 = torpedo). The Mine Layer fits [gun, mine, radarBuoy, empty] —
  // BOTH specials are click-placed rear-sector ids since Story 7-5 wave 2. We
  // drive weaponArcHit through the REAL fitted ids.
  const halfArc = CONFIG.torpedo.halfArc;

  it('TB slot 1 is the torpedo; ML slot 1 is the mine and slot 2 the buoy rack', () => {
    expect(idAt('torpedoBoat', 1)).toBe('torpedo');
    expect(idAt('mineLayer', 1)).toBe('mine');
    expect(idAt('mineLayer', 2)).toBe('radarBuoy');
  });

  it('the TB torpedo gates on the bow arc exactly as before', () => {
    const torp = idAt('torpedoBoat', 1);
    expect(weaponArcHit(0, 0, torp)).toBe(true);
    expect(weaponArcHit(0, halfArc, torp)).toBe(true);
    expect(weaponArcHit(0, halfArc + 0.01, torp)).toBe(false);
    expect(weaponArcHit(0, Math.PI, torp)).toBe(false); // astern
  });

  it('BOTH ML specials are AIMED rear-sector ids (wave 2 flipped the buoy)', () => {
    // PIN FLIPPED (Story 2.8): slot 1 used to classify `none` alongside slot 2.
    // PIN FLIPPED AGAIN (Story 7-5 wave 2): so does slot 2 now — the radar buoy
    // is click-placed in the mine's own rear sector, and the stern-drop shape
    // that made it "never in arc at any bearing" is deleted.
    const rear = arcFor('mine');
    if (rear.kind !== 'sector') throw new Error('mine must declare a sector');
    for (const slot of [1, 2]) {
      const id = idAt('mineLayer', slot);
      expect(fireArcKind(id), String(slot)).toBe('sector');
      expect(weaponArcHit(0, rear.offset, id), String(slot)).toBe(true);
      expect(weaponArcHit(0, 0, id), String(slot)).toBe(false); // dead ahead
    }
  });
});

describe('weaponRangeU — per-weapon burst/clamp range', () => {
  const stats = effectiveStats(CONFIG.shipClasses.battleship);

  it('broadside + star shells read their OWN range block', () => {
    expect(weaponRangeU(stats, 'broadside')).toBe(stats.broadside.rangeU);
    expect(weaponRangeU(stats, 'starShells')).toBe(stats.starShells.rangeU);
    expect(weaponRangeU(stats, 'starShells')).toBe(CONFIG.vision.radar);
  });

  it('the BROADSIDE stops at the 5/8 RUNG — the one weapon short of radar (R2.4)', () => {
    // The reason this row cannot fall through to the gun-range default: it would
    // over-promise the barrage by 247.5u at base.
    expect(weaponRangeU(stats, 'broadside')).toBe(CONFIG.vision.radar * CONFIG.vision.muzzleFlashFactor);
    expect(weaponRangeU(stats, 'broadside')).toBeLessThan(weaponRangeU(stats, 'gun'));
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

  it('an intelRange stack grows gun, star shells AND the broadside together', () => {
    // Story 2.8 (brainstorm 2026-07-30): the gun-family ranges are DERIVED from
    // the folded radarRange — Intel is a stealth offense category. Wave 2 puts
    // the broadside on the SAME number at the 5/8 rung, so it rides the ladder
    // too; the mine's placement reach is deliberately NOT part of it.
    const intel = effectiveStats(
      CONFIG.shipClasses.battleship,
      resolveBoons(['intelRange', 'intelRange', 'intelRange'], BOON_CATALOG),
    );
    expect(weaponRangeU(intel, 'gun')).toBeGreaterThan(CONFIG.vision.radar);
    expect(weaponRangeU(intel, 'starShells')).toBe(weaponRangeU(intel, 'gun'));
    expect(weaponRangeU(intel, 'broadside')).toBeGreaterThan(weaponRangeU(stats, 'broadside'));
    expect(weaponRangeU(intel, 'broadside')).toBe(intel.radarRange * CONFIG.vision.muzzleFlashFactor);
    expect(weaponRangeU(intel, 'mine')).toBe(CONFIG.mine.placeRange); // untouched
  });
});

// --- THE STAR-SHELL GUN REACH (Story 7-5 wave 2, R2.15) ----------------------
//
// A GUN click whose target point lies inside a LIVE lit zone the CLICKING PLAYER
// OWNS is legal beyond `stats.gun.rangeU`. The server owns that legality gate;
// weaponReachU is the client's mirror of it, and it feeds BOTH the range-clamp
// marker and the aim preview's burst point from ONE evaluation — the project's
// guarantee is that the previewed circle IS where the shell bursts, so a
// preview that allows a click the server denies is a defect, not a cosmetic.
//
// The two halves that must NOT widen are asserted head-on: the extension is
// GUN-ONLY, and it is OWN-FLARES-ONLY.
describe('weaponReachU — the gun reaches into its own flare (R2.15)', () => {
  const reachStats = effectiveStats(CONFIG.shipClasses.battleship);
  const RANGE = reachStats.gun.rangeU;
  /** A live own flare centred 200u past the gun's own horizon. */
  const FAR_ZONE = [{ x: RANGE + 200, y: 0, r: 150 }];
  const SHIP = { x: 0, y: 0 };
  const MAP_R = 2400;
  /** The reach for a click `d` units dead ahead of a ship at the origin. */
  const reach = (id: Parameters<typeof weaponReachU>[1], d: number, zones: { x: number; y: number; r: number }[]) =>
    weaponReachU(reachStats, id, SHIP, 0, d, MAP_R, zones);

  it('is weaponRangeU for every id while the click is inside the base range', () => {
    for (const id of ['gun', 'broadside', 'starShells', 'torpedo', 'mine', null] as const) {
      expect(reach(id, 10, FAR_ZONE), `${id}`).toBe(weaponRangeU(reachStats, id));
    }
  });

  it('LIFTS the gun clamp to the click when the click lands inside an own live zone', () => {
    const d = RANGE + 200; // the zone centre, well past the horizon
    expect(reach('gun', d, FAR_ZONE)).toBe(d);
  });

  it('does NOT lift for a beyond-range click that misses the zone', () => {
    const d = RANGE + 600; // past the flare entirely
    expect(reach('gun', d, FAR_ZONE)).toBe(RANGE);
    // The boundary is inclusive, exactly like the server's circle test: the
    // zone edge is lit water.
    const edge = RANGE + 200 + 150;
    expect(reach('gun', edge, FAR_ZONE)).toBe(edge);
    expect(reach('gun', edge + 0.001, FAR_ZONE)).toBe(RANGE);
  });

  it('GUN ONLY: the broadside, the flare and the torpedo are never lifted', () => {
    const d = RANGE + 200;
    expect(reach('broadside', d, FAR_ZONE)).toBe(reachStats.broadside.rangeU);
    expect(reach('starShells', d, FAR_ZONE)).toBe(reachStats.starShells.rangeU);
    expect(reach('torpedo', d, FAR_ZONE)).toBe(reachStats.gun.rangeU);
    expect(reach('mine', d, FAR_ZONE)).toBe(CONFIG.mine.placeRange);
  });

  it('no zones at all is the pre-wave-2 clamp, byte for byte', () => {
    const d = RANGE + 200;
    expect(reach('gun', d, [])).toBe(RANGE);
  });

  // OWN FLARES ONLY. The gate is structurally incapable of seeing an enemy's
  // light because the list it reads is built by ownActiveZones, which is where
  // "owned" and "live" are both enforced — so this is asserted THROUGH that
  // builder rather than against a hand-made list, which is the property that
  // actually protects the feature.
  it('an ENEMY flare over the same water lifts NOTHING', () => {
    const d = RANGE + 200;
    const zones = [
      { id: 'z1', x: d, y: 0, r: 150, until: 10_000, by: 'foe' },
      { id: 'z2', x: d, y: 0, r: 150, until: 10_000, by: 'me' },
    ];
    const ours = ownActiveZones(zones, 'me', 0);
    const theirs = ownActiveZones(zones, 'nobody', 0);
    expect(reach('gun', d, ours)).toBe(d);
    expect(theirs).toEqual([]);
    expect(reach('gun', d, theirs)).toBe(RANGE);
  });

  it('an EXPIRED own flare lifts nothing either — the zone has to be live', () => {
    const d = RANGE + 200;
    const zones = [{ id: 'z1', x: d, y: 0, r: 150, until: 10_000, by: 'me' }];
    expect(reach('gun', d, ownActiveZones(zones, 'me', 9_999))).toBe(d);
    expect(reach('gun', d, ownActiveZones(zones, 'me', 10_000))).toBe(RANGE);
  });

  // THE POINT TESTED IS THE MAP-CLAMPED BURST POINT, not the raw cursor — the
  // server tests `burstPointAlong(...)`, and at the rim those are different
  // water. Testing the cursor would license shots the server refuses on exactly
  // the clicks a player makes while pinned against the boundary.
  it('tests the CLAMPED burst point, so a zone out past the rim licenses nothing', () => {
    const d = MAP_R + 600; // a click out over the edge
    const pastRim = [{ x: d, y: 0, r: 50 }]; // contains the CURSOR, not the burst
    expect(reach('gun', d, pastRim)).toBe(RANGE);
    const atRim = [{ x: MAP_R - 2, y: 0, r: 6 }]; // contains the clamped burst point
    expect(reach('gun', d, atRim)).toBe(d);
  });

  it('pointInLitZone is inclusive at the rim and true for ANY zone in the list', () => {
    const zones = [{ x: 0, y: 0, r: 10 }, { x: 100, y: 0, r: 5 }];
    expect(pointInLitZone({ x: 10, y: 0 }, zones)).toBe(true);
    expect(pointInLitZone({ x: 10.001, y: 0 }, zones)).toBe(false);
    expect(pointInLitZone({ x: 103, y: 0 }, zones)).toBe(true);
    expect(pointInLitZone({ x: 50, y: 0 }, zones)).toBe(false);
    expect(pointInLitZone({ x: 0, y: 0 }, [])).toBe(false);
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
    for (const id of ['gun', 'broadside', 'starShells', 'torpedo', 'speedBoost'] as const) {
      expect(weaponRangeHit(1e6, id), id).toBe(true);
    }
    expect(weaponRangeHit(1e6, null)).toBe(true);
  });
});

// --- Story 1.10: classification derives from the shared arcFor descriptor ----

describe('weaponArc — arcFor single-source (Story 1.10)', () => {
  const ALL_IDS: EquipmentId[] = ['gun', 'torpedo', 'mine', 'speedBoost', 'broadside', 'starShells', 'radarBuoy'];

  it('fireArcKind is a straight projection of the shared descriptor for every id', () => {
    const PROJECTION: Record<string, string> = {
      full: 'gunLike',
      sector: 'sector',
      'twin-sector': 'twin',
      none: 'none',
    };
    for (const id of ALL_IDS) {
      expect(fireArcKind(id), id).toBe(PROJECTION[arcFor(id).kind]);
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

// The mine's rear wedge is the one sector whose radius is REAL reach, so its
// boundary is information: the stroked edge (render/firing.ts sectorEdge) says
// "exactly this far, exactly this sector" where the fill only suggests it.
describe('sectorOutline — the placement wedge boundary', () => {
  it('puts the side rays on the sector edges at the wedge radius', () => {
    const { rays, arc } = sectorOutline(0, Math.PI / 3, 150);
    expect(Math.hypot(rays[0].x, rays[0].y)).toBeCloseTo(150, 9);
    expect(Math.hypot(rays[1].x, rays[1].y)).toBeCloseTo(150, 9);
    expect(Math.atan2(rays[0].y, rays[0].x)).toBeCloseTo(-Math.PI / 3, 9);
    expect(Math.atan2(rays[1].y, rays[1].x)).toBeCloseTo(Math.PI / 3, 9);
    expect(arc).toEqual({ from: -Math.PI / 3, to: Math.PI / 3, r: 150 });
  });

  it('is the mine’s enforced sector at its true placement reach (never a promise of water the rack cannot reach)', () => {
    const t = arcFor('mine');
    if (t.kind !== 'sector') throw new Error('mine must declare a sector');
    const { rays, arc } = sectorOutline(t.offset, t.halfArc, CONFIG.mine.placeRange);
    expect(arc.r).toBe(CONFIG.mine.placeRange);
    expect(arc.to - arc.from).toBeCloseTo(2 * t.halfArc, 12);
    // Both rays land on the placement leash, astern (offset 180°: x < 0).
    for (const r of rays) expect(Math.hypot(r.x, r.y)).toBeCloseTo(CONFIG.mine.placeRange, 9);
    expect(rays[0].x).toBeLessThan(0);
  });

  it('a degenerate radius collapses to the apex rather than drawing a stray ring', () => {
    const { rays, arc } = sectorOutline(0, Math.PI / 4, 0);
    expect(Math.hypot(rays[0].x, rays[0].y)).toBe(0);
    expect(Math.hypot(rays[1].x, rays[1].y)).toBe(0);
    expect(arc.r).toBe(0);
  });
});
