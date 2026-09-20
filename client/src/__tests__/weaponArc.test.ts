// Firing-arc + range helpers (render/weaponArc.ts) — shared by firing.ts's
// marker rendering and deniedFire.ts's own-fire denial via main.ts. Keyed by the
// fitted EQUIPMENT ID (Story 1.7), NOT the loadout slot index: slot identity
// was hull-dependent, and since Story 8.5's nine-slot spine it is CARD-
// dependent — the three weapon slots are generic, so whatever a captain drew
// sits in whichever of Q/E/R was empty first. A slot-number branch would light
// the wrong marker. The gun family
// (gun/starShells) is 360°; the torpedo has a bow arc; the MINE and (Story 7-5
// wave 2) the RADAR BUOY have a rear placement arc; the BROADSIDE BARRAGE has
// TWIN mirrored beam sectors.
//
// The TB torpedo case is the byte-identical regression pin: its bow-arc behavior
// must NOT drift as the branch grows more shapes. `slotsWithCards` over the
// hull's FITTED CARDS is the authoritative id→slot map, so we derive the ids
// the same way main.ts's slotIdsFor does — Story 8.10 deleted the interim spawn
// seed that used to supply them, so the lists are this suite's own fixture.
//
// STORY 7-5 WAVE 2 RETIRED the `stern-drop` pins wholesale: that shape is
// deleted from sim/arcs.ts with the decoy buoy that was its only user, so
// "the buoy is never in arc at any bearing" is no longer true and no longer
// asserted — the radar buoy is a placement SECTOR like the mine.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CATALOG,
  CONFIG,
  EQUIPMENT_IDS,
  arcFor,
  effectiveStats,
  isConsumableId,
  gunReachU as sharedGunReachU,
  WEAPON_SLOTS,
  slotsWithCards,
  pointInLitZone as sharedPointInLitZone,
} from '@salvo/shared';
import type { Catalog, CatalogLine, EquipmentId, SlotItemId } from '@salvo/shared';
import {
  MINE_EQUIPMENT_IDS,
  fireArcKind,
  isMineEquipment,
  isTorpedoItem,
  mineEquipmentFor,
  mineKindOf,
  pointInLitZone,
  sectorOutline,
  twinSectorSide,
  clickInArc,
  weaponArcHit,
  weaponRangeHit,
  weaponRangeU,
  weaponReachU,
} from '../render/weaponArc.js';
import { ownActiveZones } from '../render/litZones.js';

/**
 * THE FIXTURE (Story 8.10): the class weapons each hull is FITTED with for
 * these arc pins. They used to arrive from the interim spawn seed; that table
 * is deleted (a hull spawns with the gun and Shift alone), and what these pins
 * are about is the ARC of a fitted weapon, not who fitted it.
 */
const FITTED: Record<'torpedoBoat' | 'battleship' | 'mineLayer', readonly string[]> = {
  torpedoBoat: ['heavyTorpedo'],
  battleship: ['broadside', 'starShells'],
  mineLayer: ['navalMines'],
};

/**
 * The fitted equipment id at a slot for a hull — the client's slotIdsFor path,
 * verbatim. STORY 8.5 re-cut the base fit: it no longer takes a hull, so what a
 * hull carries comes from its CARDS, which land in the first empty WEAPON slot,
 * i.e. from slot 2 (Q) upward.
 */
function idAt(cls: 'torpedoBoat' | 'battleship' | 'mineLayer', slot: number): EquipmentId | null {
  const stats = effectiveStats(CONFIG.shipClasses[cls]);
  const id = slotsWithCards(stats, FITTED[cls])[slot].equipmentId;
  // A slot's content is a `SlotItemId` since Story 8.7 — narrowed, never cast.
  return id === null || isConsumableId(id) ? null : id;
}

/** The three WEAPON slots, by name — Q, E, R (shared WEAPON_SLOTS). */
const [Q, E] = WEAPON_SLOTS;

describe('fireArcKind — equipment-id → firing-arc class', () => {
  it('classes the gun FAMILY (gun/starShells) as 360° gunLike', () => {
    expect(fireArcKind('gun')).toBe('gunLike');
    expect(fireArcKind('starShells')).toBe('gunLike');
  });

  it('classes the SECTOR ids — torpedo bow arc, mine + radar buoy rear arc', () => {
    expect(fireArcKind('heavyTorpedo')).toBe('sector');
    // PIN FLIPPED (Story 2.8, amendment 45): the mine is a click-aimed weapon
    // with a rear placement sector — it used to classify `none`.
    expect(fireArcKind('navalMines')).toBe('sector');
    // PIN FLIPPED (Story 7-5 wave 2): the buoy is click-placed in the mine's
    // rear sector now — it used to be an un-aimed stern drop classifying `none`.
    expect(fireArcKind('radarBuoy')).toBe('sector');
  });

  it('classes the BROADSIDE as `twin` — two mirrored beam sectors (R2.1)', () => {
    expect(fireArcKind('broadside')).toBe('twin');
  });

  it('classes the instant ability + the empty slot as none (not an aimed weapon)', () => {
    expect(fireArcKind('boost')).toBe('none');
    expect(fireArcKind(null)).toBe('none');
  });

  // --- STORY 8.13: three mine LINES, three torpedo ids ------------------------
  //
  // Every predicate in this module keyed on `navalMines` / `heavyTorpedo` until
  // now, so a captain priming CAPTIVE or FOULING MINES got the GUN's
  // radar-derived range ring and no placement denial at all, a LIGHT TORPEDO
  // classified as an unaimed slot, and the belt's SUPERCAV — a click-aimed
  // consumable (epic-8 amendment 74) — was trusted blind.

  it('classes ALL THREE mine lines as the rear placement SECTOR', () => {
    for (const id of MINE_EQUIPMENT_IDS) expect(fireArcKind(id), id).toBe('sector');
  });

  it('classes the LIGHT TORPEDO as `twin` — both beams, ±45° (catalog-v3 R18)', () => {
    expect(fireArcKind('lightTorpedo')).toBe('twin');
    const arc = arcFor('lightTorpedo');
    if (arc.kind !== 'twin-sector') throw new Error('the light torpedo must declare twin sectors');
    // The beams, not the bow: dead ahead and dead astern are the dead zones.
    expect(weaponArcHit(0, arc.offset, 'lightTorpedo')).toBe(true);
    expect(weaponArcHit(0, -arc.offset, 'lightTorpedo')).toBe(true);
    expect(weaponArcHit(0, 0, 'lightTorpedo')).toBe(false);
    expect(weaponArcHit(0, Math.PI, 'lightTorpedo')).toBe(false);
  });

  it('classes the BELT\'s SUPERCAV TORPEDO as its own bow SECTOR', () => {
    expect(fireArcKind('supercavTorpedo')).toBe('sector');
    expect(weaponArcHit(0, 0, 'supercavTorpedo')).toBe(true);
    expect(weaponArcHit(0, CONFIG.supercavTorpedo.halfArc + 0.001, 'supercavTorpedo')).toBe(false);
    // ...and it is NARROWER than the heavy fish's bow arc, which is the point
    // of a 195 u/s straight-runner.
    expect(CONFIG.supercavTorpedo.halfArc).toBeLessThan(CONFIG.torpedo.halfArc);
  });
});

// THE ID SETS THIS MODULE RESTATES (Story 8.13). `sim/arcs.ts` keeps its own
// `isMineChassis` PRIVATE, so the client holds its own list — and this closes
// the loop from the other end, so a fourth mine kind cannot ship without
// joining it.
describe('the mine + torpedo id sets agree with the SHARED arc grammar', () => {
  it('every id it calls a MINE really does declare the mine\'s rear sector', () => {
    const rear = arcFor('navalMines');
    for (const id of MINE_EQUIPMENT_IDS) {
      expect(arcFor(id), id).toEqual(rear);
      expect(isMineEquipment(id), id).toBe(true);
    }
  });

  it('...and every EQUIPMENT id declaring that sector is a mine or the legacy buoy', () => {
    const rear = JSON.stringify(arcFor('navalMines'));
    const strays = EQUIPMENT_IDS
      .filter((id) => JSON.stringify(arcFor(id)) === rear)
      .filter((id) => !isMineEquipment(id) && id !== 'radarBuoy');
    expect(strays).toEqual([]);
  });

  it('maps each line to its wire KIND, and back, without a third spelling', () => {
    for (const id of MINE_EQUIPMENT_IDS) expect(mineEquipmentFor(mineKindOf(id)), id).toBe(id);
    expect(mineKindOf('captiveMines')).toBe('captive');
    expect(mineKindOf('foulingMines')).toBe('fouling');
  });

  it('calls exactly the three FISH torpedoes — never a mine, never the gun', () => {
    for (const id of ['lightTorpedo', 'heavyTorpedo', 'supercavTorpedo'] as const) {
      expect(isTorpedoItem(id), id).toBe(true);
    }
    for (const id of ['gun', 'broadside', 'navalMines', 'captiveMines', null] as const) {
      expect(isTorpedoItem(id), String(id)).toBe(false);
    }
  });
});

// THE CLICK GATE OVER A SLOT'S CONTENT (review patch P8).
//
// A click-placed CONSUMABLE — the decoy buoy, Story 8.15 — is an `isWeapon`
// item with NO equipment row, so the arc table and the range table know nothing
// about it. Asking them produced `inArc: false`, which made the client paint a
// predicted DENIED pulse, keep the prime and dedupe away the server's answer,
// while the server cheerfully placed the buoy. The client TRUSTS THE SERVER'S
// ARC for one: no sector test, no range clamp, prime consumed like any weapon.
describe('clickInArc — a click-placed consumable trusts the server (P8)', () => {
  it('is TRUE for an isWeapon consumable at any bearing and any distance', () => {
    for (const aim of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      expect(clickInArc(0, aim, 99_999, 'decoyBuoy'), String(aim)).toBe(true);
    }
  });

  it('is FALSE for a KEY-FIRES consumable — a click on an ability fires nothing', () => {
    for (const id of ['hullRepair', 'shieldBlock', 'smokeScreen', 'chaff'] as const) {
      expect(clickInArc(0, 0, 10, id), id).toBe(false);
    }
  });

  // THE ONE CONSUMABLE THAT IS NOT TRUSTED BLIND (Story 8.13, epic-8 amendment
  // 74): the SUPERCAV TORPEDO declares a real arc, so the client gates it like
  // a fitted weapon. The test is the DESCRIPTOR, not the id — the decoy buoy
  // declares `none` and keeps the blind trust above.
  it('GATES a consumable that declares an arc, and trusts one that does not', () => {
    expect(clickInArc(0, 0, 10, 'supercavTorpedo')).toBe(true); // dead ahead: inside ±15°
    expect(clickInArc(0, Math.PI, 10, 'supercavTorpedo')).toBe(false); // astern: denied
    expect(clickInArc(0, Math.PI, 99_999, 'decoyBuoy')).toBe(true); // still blind-trusted
  });

  it('gates EVERY mine line on the ONE shared leash, not just the naval rack', () => {
    for (const id of MINE_EQUIPMENT_IDS) {
      expect(clickInArc(0, Math.PI, CONFIG.mine.placeRange, id), id).toBe(true);
      expect(clickInArc(0, Math.PI, CONFIG.mine.placeRange + 1, id), id).toBe(false);
      expect(weaponRangeU(effectiveStats(CONFIG.shipClasses.mineLayer, []), id), id)
        .toBe(CONFIG.mine.placeRange);
    }
  });

  it('leaves EQUIPMENT exactly as it was — both tables still gate it', () => {
    expect(clickInArc(0, 0, 10, 'gun')).toBe(true);
    expect(clickInArc(0, 0, 10, 'heavyTorpedo')).toBe(weaponArcHit(0, 0, 'heavyTorpedo'));
    expect(clickInArc(0, Math.PI, 10, 'navalMines')).toBe(true);
    // ...the mine's placement leash included.
    expect(clickInArc(0, Math.PI, CONFIG.mine.placeRange + 1, 'navalMines')).toBe(false);
    expect(clickInArc(0, 0, 10, null)).toBe(false);
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
    // And the BB's real fitted slots (the whole point) — its seed fills Q with
    // the BROADSIDE, which is NOT 360° and gets its own suite below, and E with
    // the star shells.
    expect(idAt('battleship', Q)).toBe('broadside');
    expect(idAt('battleship', E)).toBe('starShells');
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
    expect(weaponArcHit(0, 0, 'boost')).toBe(false);
    expect(weaponArcHit(0, 0, null)).toBe(false); // empty slot 3 / defensive null
  });
});

describe('weaponArcHit — mine REAR placement arc (Story 2.8, amendment 45)', () => {
  const arc = arcFor('navalMines');
  if (arc.kind !== 'sector') throw new Error('mine must declare a sector');

  it('is true astern (the sector is centred on CONFIG.mine.offset) and false dead ahead', () => {
    // PIN FLIPPED: the mine used to answer FALSE at every bearing.
    expect(weaponArcHit(0, arc.offset, 'navalMines')).toBe(true);
    expect(weaponArcHit(0, 0, 'navalMines')).toBe(false); // dead ahead is out of the rear arc
  });

  it('is boundary-inclusive at the sector edge and denied a hair past it', () => {
    expect(weaponArcHit(0, arc.offset + arc.halfArc, 'navalMines')).toBe(true);
    expect(weaponArcHit(0, arc.offset - arc.halfArc, 'navalMines')).toBe(true);
    expect(weaponArcHit(0, arc.offset + arc.halfArc + 0.001, 'navalMines')).toBe(false);
  });

  it('rotates with heading, exactly like the bow arc', () => {
    const heading = Math.PI / 2; // facing +y — the rear arc points at -y
    expect(weaponArcHit(heading, heading + arc.offset, 'navalMines')).toBe(true);
    expect(weaponArcHit(heading, heading, 'navalMines')).toBe(false);
  });
});

describe('weaponArcHit — torpedo bow arc', () => {
  const halfArc = CONFIG.torpedo.halfArc;

  it('is true dead ahead (bow-centered) with heading 0', () => {
    expect(weaponArcHit(0, 0, 'heavyTorpedo')).toBe(true);
  });

  it('is true right at the arc edge and false just past it', () => {
    expect(weaponArcHit(0, halfArc, 'heavyTorpedo')).toBe(true); // inclusive boundary
    expect(weaponArcHit(0, halfArc + 0.01, 'heavyTorpedo')).toBe(false);
  });

  it('is false directly astern', () => {
    expect(weaponArcHit(0, Math.PI, 'heavyTorpedo')).toBe(false);
  });

  it('rotates with heading', () => {
    const heading = Math.PI / 2; // facing +y
    expect(weaponArcHit(heading, Math.PI / 2, 'heavyTorpedo')).toBe(true);
    expect(weaponArcHit(heading, 0, 'heavyTorpedo')).toBe(false);
  });
});

describe('weaponArcHit — TB torpedo regression + ML ability fit (Story 1.8)', () => {
  // The id-driven branch must reproduce the TB's bow-arc torpedo behavior
  // (TB's Q = torpedo). The Mine Layer's seed fills Q with the mine; the RADAR
  // BUOY has gone DARK (epic-8 amendment 22 — no card and no seed reaches it,
  // so no hull carries it in play), and the arc suite below drives it as a bare
  // id, which is what `weaponArcHit` actually takes.
  const halfArc = CONFIG.torpedo.halfArc;

  it('the TB seed fills Q with the torpedo; the ML seed fills Q with the mine', () => {
    expect(idAt('torpedoBoat', Q)).toBe('heavyTorpedo');
    expect(idAt('mineLayer', Q)).toBe('navalMines');
    // AMENDMENT 22: nothing fits the buoy any more — E stays empty on the ML.
    expect(idAt('mineLayer', E)).toBeNull();
  });

  it('the TB torpedo gates on the bow arc exactly as before', () => {
    const torp = idAt('torpedoBoat', Q);
    expect(weaponArcHit(0, 0, torp)).toBe(true);
    expect(weaponArcHit(0, halfArc, torp)).toBe(true);
    expect(weaponArcHit(0, halfArc + 0.01, torp)).toBe(false);
    expect(weaponArcHit(0, Math.PI, torp)).toBe(false); // astern
  });

  it('BOTH ML specials are AIMED rear-sector ids (wave 2 flipped the buoy)', () => {
    // PIN FLIPPED (Story 2.8): the mine used to classify `none` alongside the
    // buoy. PIN FLIPPED AGAIN (Story 7-5 wave 2): so does the buoy — it is
    // click-placed in the mine's own rear sector, and the stern-drop shape that
    // made it "never in arc at any bearing" is deleted.
    //
    // STORY 8.5 DROPPED THE SLOT LOOKUP, NOT THE PIN (epic-8 amendment 22): the
    // buoy is unreachable in play, so there is no fitted slot to read it out of
    // — the module, its arc and this behaviour all stay until Story 8.15
    // deletes them. The ids are named directly, which is what weaponArcHit
    // takes anyway.
    const rear = arcFor('navalMines');
    if (rear.kind !== 'sector') throw new Error('mine must declare a sector');
    for (const id of ['navalMines', 'radarBuoy'] as const) {
      expect(fireArcKind(id), id).toBe('sector');
      expect(weaponArcHit(0, rear.offset, id), id).toBe(true);
      expect(weaponArcHit(0, 0, id), id).toBe(false); // dead ahead
    }
  });
});

describe('weaponRangeU — per-weapon burst/clamp range', () => {
  const stats = effectiveStats(CONFIG.shipClasses.battleship);

  it('broadside + star shells read their OWN range block', () => {
    expect(weaponRangeU(stats, 'broadside')).toBe(stats.equipment.broadside.rangeU);
    expect(weaponRangeU(stats, 'starShells')).toBe(stats.equipment.starShells.rangeU);
    expect(weaponRangeU(stats, 'starShells')).toBe(CONFIG.vision.radar);
  });

  it('the BROADSIDE stops at the 5/8 RUNG — the one weapon short of radar (R2.4)', () => {
    // The reason this row cannot fall through to the gun-range default: it would
    // over-promise the barrage by 247.5u at base.
    expect(weaponRangeU(stats, 'broadside')).toBe(CONFIG.vision.radar * CONFIG.vision.muzzleFlashFactor);
    expect(weaponRangeU(stats, 'broadside')).toBeLessThan(weaponRangeU(stats, 'gun'));
  });

  it('the gun reads its own range block (the default for every non-mine id)', () => {
    expect(weaponRangeU(stats, 'gun')).toBe(stats.equipment.gun.rangeU);
    // Non-gun-like ids draw no ring; the gun range is the harmless default.
    expect(weaponRangeU(stats, 'heavyTorpedo')).toBe(stats.equipment.gun.rangeU);
    expect(weaponRangeU(stats, null)).toBe(stats.equipment.gun.rangeU);
  });

  it('the MINE reads its ratified placement reach — NOT radar range (Story 2.8)', () => {
    expect(weaponRangeU(stats, 'navalMines')).toBe(CONFIG.mine.placeRange);
    expect(weaponRangeU(stats, 'navalMines')).toBeLessThan(stats.equipment.gun.rangeU);
    // The RADAR BUOY shares the mine's placement leash verbatim (R2.7).
    expect(weaponRangeU(stats, 'radarBuoy')).toBe(CONFIG.mine.placeRange);
  });

  // A WIDER `radarRange` grows gun, star shells AND the broadside together.
  // RETARGETED in cycle 119: this pin was written against a three-card INTEL
  // RANGE stack, and that line is deleted — no shipped card writes `radarRange`
  // any more. Its SUBJECT is the derivation, not the card, so it is driven by an
  // INJECTED def on the still-whitelisted `radarRange` path (the server suite's
  // `OMNI_BOON` shape). Asserting this against zero boons would compare the
  // ranges with themselves and prove nothing.
  const WIDE_RADAR = {
    id: 'testWideRadar',
    kind: 'ladder',
    cap: 1,
    tiers: [[{ kind: 'stat', path: 'radarRange', mult: 1.25 }]],
  } as unknown as CatalogLine;

  /** CATALOG plus the injected line — `effectiveStats`' third argument is THE
   *  test seam since Story 8.1 made the fold resolve ids internally. */
  const WIDE_CATALOG: Catalog = { ...CATALOG, testWideRadar: WIDE_RADAR };

  it('a widened radarRange grows gun, star shells AND the broadside together', () => {
    // Story 2.8 (brainstorm 2026-07-30): the gun-family ranges are DERIVED from
    // the folded radarRange. Wave 2 puts the broadside on the SAME number at the
    // 5/8 rung, so it rides the ladder too; the mine's placement reach is
    // deliberately NOT part of it.
    const intel = effectiveStats(CONFIG.shipClasses.battleship, ['testWideRadar'], WIDE_CATALOG);
    expect(intel.radarRange).toBeGreaterThan(stats.radarRange); // the premise
    expect(weaponRangeU(intel, 'gun')).toBeGreaterThan(CONFIG.vision.radar);
    expect(weaponRangeU(intel, 'starShells')).toBe(weaponRangeU(intel, 'gun'));
    expect(weaponRangeU(intel, 'broadside')).toBeGreaterThan(weaponRangeU(stats, 'broadside'));
    expect(weaponRangeU(intel, 'broadside')).toBe(intel.radarRange * CONFIG.vision.muzzleFlashFactor);
    expect(weaponRangeU(intel, 'navalMines')).toBe(CONFIG.mine.placeRange); // untouched
  });
});

// --- THE STAR-SHELL GUN REACH (Story 7-5 wave 2, R2.15) ----------------------
//
// A GUN click whose target point lies inside a LIVE lit zone the CLICKING PLAYER
// OWNS is legal beyond `stats.equipment.gun.rangeU`. The server owns that legality gate;
// weaponReachU is the client's mirror of it, and it feeds BOTH the range-clamp
// marker and the aim preview's burst point from ONE evaluation — the project's
// guarantee is that the previewed circle IS where the shell bursts, so a
// preview that allows a click the server denies is a defect, not a cosmetic.
//
// The two halves that must NOT widen are asserted head-on: the extension is
// GUN-ONLY, and it is OWN-FLARES-ONLY.
describe('weaponReachU — the gun reaches into its own flare (R2.15)', () => {
  const reachStats = effectiveStats(CONFIG.shipClasses.battleship);
  const RANGE = reachStats.equipment.gun.rangeU;
  /** A live own flare centred 200u past the gun's own horizon. */
  const FAR_ZONE = [{ x: RANGE + 200, y: 0, r: 150 }];
  const SHIP = { x: 0, y: 0 };
  const MAP_R = 2400;
  /** The reach for a click `d` units dead ahead of a ship at the origin. */
  const reach = (id: Parameters<typeof weaponReachU>[1], d: number, zones: { x: number; y: number; r: number }[]) =>
    weaponReachU(reachStats, id, SHIP, 0, d, MAP_R, zones);

  it('is weaponRangeU for every id while the click is inside the base range', () => {
    for (const id of ['gun', 'broadside', 'starShells', 'heavyTorpedo', 'navalMines', null] as const) {
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
    expect(reach('broadside', d, FAR_ZONE)).toBe(reachStats.equipment.broadside.rangeU);
    expect(reach('starShells', d, FAR_ZONE)).toBe(reachStats.equipment.starShells.rangeU);
    expect(reach('heavyTorpedo', d, FAR_ZONE)).toBe(reachStats.equipment.gun.rangeU);
    expect(reach('navalMines', d, FAR_ZONE)).toBe(CONFIG.mine.placeRange);
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

  // THE PROMOTION IS REAL, NOT A MIRROR (Story 7-5 wave 2 cleanup). This rule
  // shipped implemented TWICE — the server's legality gate and this preview —
  // agreeing only because an agent copied one into the other. It now lives in
  // `shared/src/sim/aim.ts` and BOTH sides call it; the server's own parity pin
  // (server/src/__tests__/combat.test.ts) asserts the same thing from its side,
  // so the two agree TRANSITIVELY through one function rather than by
  // discipline. This case fails the moment this file re-grows a private copy.
  it('IS the shared gunReachU, argument for argument, across the whole domain', () => {
    const cases: [number, { x: number; y: number; r: number }[]][] = [
      [10, FAR_ZONE],                       // in range
      [RANGE, FAR_ZONE],                    // exactly at the horizon
      [RANGE + 200, FAR_ZONE],              // lifted
      [RANGE + 200, []],                    // clamped, no zones at all
      [RANGE + 900, FAR_ZONE],              // beyond the zone, clamped
      [NaN, FAR_ZONE],                      // the NaN-safe branch
      [MAP_R + 500, [{ x: MAP_R - 2, y: 0, r: 6 }]], // the rim clamp
    ];
    for (const [d, zones] of cases) {
      expect(weaponReachU(reachStats, 'gun', SHIP, 0, d, MAP_R, zones), `d=${d}`)
        .toBe(sharedGunReachU(SHIP, 0, d, RANGE, MAP_R, zones));
    }
  });

  it('and pointInLitZone is literally the shared function, not a lookalike', () => {
    expect(pointInLitZone).toBe(sharedPointInLitZone);
  });
});

describe('weaponRangeHit — the CLICK-PLACED ids\' hard placement-reach denial (Story 2.8)', () => {
  // The server's mine row refuses `aimDist > CONFIG.mine.placeRange` through
  // the SAME 'out-of-arc' denial channel as a bad bearing, consuming nothing.
  // The client's predicted gate must be its exact complement, or an
  // out-of-range click would silently consume the prime and revert to the gun.
  //
  // STORY 7-5 WAVE 2: the RADAR BUOY joined the mine on this gate, and it is a
  // real client/server parity fix rather than a nicety —
  // `server/src/game/equipment/radarBuoy.ts` reuses `CONFIG.mine.placeRange`
  // verbatim (R2.7's "the mine's rear sector at placeRange 150u"), so while the
  // client answered `true` for the buoy at any distance, a long buoy click ate
  // the prime for a drop the server refused.
  for (const id of ['navalMines', 'radarBuoy'] as const) {
    it(`${id}: accepts a click inside the reach, boundary included, and refuses one past it`, () => {
      expect(weaponRangeHit(0, id)).toBe(true);
      expect(weaponRangeHit(CONFIG.mine.placeRange - 1, id)).toBe(true);
      expect(weaponRangeHit(CONFIG.mine.placeRange, id)).toBe(true); // inclusive, like the server
      expect(weaponRangeHit(CONFIG.mine.placeRange + 0.001, id)).toBe(false);
    });
  }

  // The buoy's OWN 330u radar set is a different number entirely — that is the
  // circle it watches once dropped, not how far you can throw it. Reaching for
  // it here would triple the placement leash.
  it('the buoy is leashed by the PLACEMENT range, never by its own radar reach', () => {
    expect(CONFIG.radarBuoy.radarRange).toBeGreaterThan(CONFIG.mine.placeRange);
    expect(weaponRangeHit(CONFIG.radarBuoy.radarRange, 'radarBuoy')).toBe(false);
  });

  it('never gates any OTHER id on distance — they clamp or run on, they do not deny', () => {
    for (const id of ['gun', 'broadside', 'starShells', 'heavyTorpedo', 'boost'] as const) {
      expect(weaponRangeHit(1e6, id), id).toBe(true);
    }
    expect(weaponRangeHit(1e6, null)).toBe(true);
  });
});

// --- Story 1.10: classification derives from the shared arcFor descriptor ----

describe('weaponArc — arcFor single-source (Story 1.10)', () => {
  const ALL_IDS: EquipmentId[] = ['gun', 'heavyTorpedo', 'navalMines', 'boost', 'broadside', 'starShells', 'radarBuoy'];

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
    const arc = arcFor('heavyTorpedo');
    if (arc.kind !== 'sector') throw new Error('torpedo must declare a sector');
    // Heading 0: the sector edge is in-arc (shared inArc is boundary-inclusive)…
    expect(weaponArcHit(0, arc.offset + arc.halfArc, 'heavyTorpedo')).toBe(true);
    expect(weaponArcHit(0, arc.offset - arc.halfArc, 'heavyTorpedo')).toBe(true);
    // …and a hair beyond it is denied — the exact server gate, same primitives.
    expect(weaponArcHit(0, arc.offset + arc.halfArc + 0.001, 'heavyTorpedo')).toBe(false);
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
    const t = arcFor('navalMines');
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

// ---- THE PLACEMENT WEDGE (Eric playtest 2026-08-20) --------------------------
//
// *"The buoy's targeting range indicator isn't correct"* and *"the mine's
// targeting indicator seems to show two stacked indicators?"*, with the reason
// both matter: *"with this rear facing, place-in-short-range arc style weapon,
// its important that I as a captain can clearly see where I can place my
// stuff."*
//
// Two defects, one root cause — the two CLICK-PLACED ids were not sharing a
// grammar. `render/firing.ts` special-cased `id === 'navalMines'` for radius, tint and
// boundary, so the RADAR BUOY fell to the torpedo branch: drawn at the
// indicative ARC_R (72u) instead of its real 150u leash. And `sector()` drew a
// SECOND wedge at HALF the radius to show reloading, which on a true-radius
// placement wedge is a second "you can place here" boundary.
//
// These pin the INVARIANT rather than the pixels: both click-placed ids answer
// the same leash, and that leash is the placement range — never the buoy's own
// 330u radar set, which is a different circle entirely.
describe('the click-placed pair share ONE placement leash (Eric 2026-08-20)', () => {
  it('mine and radarBuoy report the SAME reach, and it is the placement range', () => {
    const stats = effectiveStats(CONFIG.shipClasses.mineLayer, []);
    expect(weaponRangeU(stats, 'navalMines')).toBe(CONFIG.mine.placeRange);
    expect(weaponRangeU(stats, 'radarBuoy')).toBe(CONFIG.mine.placeRange);
    expect(weaponRangeU(stats, 'radarBuoy')).toBe(weaponRangeU(stats, 'navalMines'));
  });

  it("the buoy's placement leash is NOT its radar set — the bug was showing a different circle", () => {
    const stats = effectiveStats(CONFIG.shipClasses.mineLayer, []);
    expect(weaponRangeU(stats, 'radarBuoy')).not.toBe(stats.equipment.radarBuoy.radarRange);
    expect(weaponRangeU(stats, 'radarBuoy')).toBeLessThan(stats.equipment.radarBuoy.radarRange);
  });

  it('both are aim-gated SECTOR weapons sharing the rear arc — so both draw a wedge at all', () => {
    expect(fireArcKind('navalMines')).toBe('sector');
    expect(fireArcKind('radarBuoy')).toBe('sector');
    const m = arcFor('navalMines');
    const b = arcFor('radarBuoy');
    expect(b.kind).toBe('sector');
    if (m.kind !== 'sector' || b.kind !== 'sector') throw new Error('both must be sectors');
    expect(b.offset).toBe(m.offset);
    expect(b.halfArc).toBe(m.halfArc);
  });
});

// THE NARROWING SEAM for the firing path (Story 8.7, ruling 1). Since the belt
// landed, a slot holds a `SlotItemId` — equipment OR a consumable line — while
// every weapon-geometry helper in this module is keyed by `EquipmentId`. A
// primed slot holding a consumable therefore has NO weapon geometry on the
// client: no arc, no range, no reload readout, no aim preview. The click itself
// is untouched and still travels to the server on `input.slot` (the decoy
// buoy's arc is the server's in Story 8.15).
//
// Behaviourally inert today — every consumable is a stub and the belt ships
// empty — so what is pinned is the TYPE-LEVEL discipline: narrow, never cast.
describe('a primed BELT slot narrows out of the weapon tables (Story 8.7, ruling 1)', () => {
  /** main.ts's `ownWeaponAt` body, verbatim — the guard, not a cast. */
  const weaponIdOf = (id: SlotItemId | null): EquipmentId | null =>
    id === null || isConsumableId(id) ? null : id;

  it('a consumable id narrows to null; an equipment id passes through unchanged', () => {
    expect(weaponIdOf('hullRepair')).toBeNull();
    // ...INCLUDING the click-placed one: `decoyBuoy` is a weapon on the
    // ability/click split (CONSUMABLE_IS_WEAPON) and still has no equipment row,
    // so it narrows here exactly like the four instant lines do.
    expect(weaponIdOf('decoyBuoy')).toBeNull();
    expect(weaponIdOf('heavyTorpedo')).toBe('heavyTorpedo');
    expect(weaponIdOf('gun')).toBe('gun');
    expect(weaponIdOf(null)).toBeNull();
  });

  it('...so the geometry surfaces answer the empty-slot way for it', () => {
    expect(fireArcKind(weaponIdOf('decoyBuoy'))).toBe('none');
    expect(weaponArcHit(0, 0, weaponIdOf('decoyBuoy'))).toBe(false);
    // ...while the equipment that shares the slot row is untouched.
    expect(fireArcKind(weaponIdOf('heavyTorpedo'))).toBe('sector');
    expect(weaponArcHit(0, 0, weaponIdOf('heavyTorpedo'))).toBe(true);
  });

  it('main.ts ROUTES the primed slot through that helper, and casts nowhere', () => {
    // A grep pin, because the tempting fix here is one `as EquipmentId` in the
    // firing path — which compiles, and hands an EquipmentId-keyed record a key
    // it has no row for.
    const src = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '../main.ts'),
      'utf8',
    );
    expect(src).toContain('const primedId = ownWeaponAt(g, slot);');
    expect(src).not.toContain('as EquipmentId');
  });
});
