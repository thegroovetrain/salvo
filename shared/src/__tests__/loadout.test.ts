// Pins the shared loadout spine: the slot grammar constants, the
// state-null-iff-equipmentId-null invariant, and THE UNIVERSAL SLOT FIT
// (Story 8.5). loadoutFor builds from a REAL effectiveStats() so pool sizes
// match what the server writes on spawn/respawn/redeploy.
//
// THE PER-HULL FIT IS RETIRED (Stories 1.6–1.8 / 7-5 wave 2 are superseded):
// every CAPTAIN hull now fits exactly [gun, boost, empty × the rest] — the boost
// stopped being a Torpedo Boat privilege (amendment 23) and the class weapons
// arrive as CARDS: since Story 8.10 deleted the interim spawn seed, the first
// of them comes off the LEVEL-ZERO OFFER at countdown start. A PvE fleet
// hull fits [gun, empty × the rest] (Story 5.6, amendment 34). Also pins the
// EQUIPMENT_IS_WEAPON split — the single source server rows and the client
// activation path read. Pure, zero I/O.

import { describe, it, expect } from 'vitest';
import {
  CATALOG,
  CONFIG,
  CONSUMABLE_IDS,
  BUOY_LINE_IDS,
  CONSUMABLE_IS_WEAPON,
  DEFAULT_GUN,
  HULL_IDS,
  SHIFT_IDS,
  classShift,
  SHIP_CLASS_IDS,
  SLOT_COUNT,
  SLOT_GUN,
  SLOT_BOOST,
  WEAPON_SLOTS,
  CONSUMABLE_SLOTS,
  DEFAULT_KIT,
  KIT_SIZE,
  SLOT_ROLES,
  consumableKindAt,
  consumableSlotFor,
  isConsumableKit,
  mulberry32,
  rollKit,
  EQUIPMENT_IDS,
  EQUIPMENT_IS_WEAPON,
  effectiveStats,
  equipmentMaxAmmo,
  equipmentReloadMs,
  hullEnvelope,
  isConsumableId,
  isWeaponItem,
  loadoutFor,
  slotMaxAmmo,
  type Catalog,
  type CatalogLine,
  type ConsumableKit,
  type EffectiveStats,
  type HullId,
  type LineId,
  type LoadoutSlot,
  type SlotItemId,
} from '../index.js';

/** Fresh effective stats for any hull id at zero boons. */
function statsFor(id: HullId): EffectiveStats {
  return effectiveStats(hullEnvelope(id));
}

/** Is this hull id a PvE fleet (drone) hull? */
function isFleet(id: HullId): boolean {
  return !(SHIP_CLASS_IDS as readonly string[]).includes(id);
}

describe('slot-grammar constants — the fixed roles (Story 8.5; KIT_SIZE consumable keys per ship since Story 10.1)', () => {
  it('SLOT_GUN 0, SLOT_BOOST 1, weapons [2,3,4], then ONE consumable slot per carried kind', () => {
    // WAS 4 (gun, two per-hull specials, one extra); nine from Story 8.5; six
    // keyed kinds from Story 9.2 (epic-9 amendments 21/31); since Story 10.1
    // the count follows the KIT — four lines a ship carries, bound per ship.
    expect(SLOT_GUN).toBe(0);
    expect(SLOT_BOOST).toBe(1);
    expect(WEAPON_SLOTS).toEqual([2, 3, 4]);
    expect(CONSUMABLE_SLOTS).toHaveLength(KIT_SIZE);
    expect(CONSUMABLE_SLOTS).toEqual(DEFAULT_KIT.map((id) => consumableSlotFor(DEFAULT_KIT, id)));
    expect(SLOT_COUNT).toBe(WEAPON_SLOTS.length + 2 + KIT_SIZE);
  });

  it('the four role groups PARTITION 0..SLOT_COUNT-1 exactly once', () => {
    const all = [SLOT_GUN, SLOT_BOOST, ...WEAPON_SLOTS, ...CONSUMABLE_SLOTS];
    expect([...all].sort((a, b) => a - b)).toEqual(Array.from({ length: SLOT_COUNT }, (_, i) => i));
    expect(new Set(all).size).toBe(SLOT_COUNT);
  });

  it('SLOT_ROLES covers every slot and agrees with the index constants', () => {
    expect(SLOT_ROLES).toHaveLength(SLOT_COUNT);
    expect(SLOT_ROLES[SLOT_GUN]).toBe('gun');
    expect(SLOT_ROLES[SLOT_BOOST]).toBe('boost');
    for (const i of WEAPON_SLOTS) expect(SLOT_ROLES[i], `slot ${i}`).toBe('weapon');
    for (const i of CONSUMABLE_SLOTS) expect(SLOT_ROLES[i], `slot ${i}`).toBe('consumable');
  });

  it('`SLOT_EXTRA`, `specialsFor` and `CONSUMABLE_KEY_ORDER` are GONE from the module surface (no per-hull fit, no global key row)', async () => {
    const mod = (await import('../index.js')) as Record<string, unknown>;
    expect(mod.SLOT_EXTRA).toBeUndefined();
    expect(mod.specialsFor).toBeUndefined();
    expect(mod.CONSUMABLE_KEY_ORDER).toBeUndefined(); // Story 10.1: deleted, not aliased
  });
});

describe('EQUIPMENT_IS_WEAPON — the weapon/ability split', () => {
  it('marks every aimed-click weapon true; the two boosts are the only abilities', () => {
    // FLIPPED PIN (amendment 45): the mine is a click-aimed rear-arc WEAPON
    // again — prime, aim within CONFIG.mine.offset ± placeHalfArcDeg, click
    // places at the point up to placeRange. Supersedes the 1.8 stern drop.
    // FLIPPED AGAIN, Story 7-5 wave 2 (R2.7): the RADAR BUOY replacing the
    // decoy is click-placed in that same rear sector, so it left the actSeq
    // ability channel for the fireSeq weapon channel — which leaves the speed
    // boost as the last instant activation in the game.
    // WIDENED to catalog v3 (Story 8.1): the shipped torpedo/mine keep their
    // behaviour under their v3 names, the unbuilt v3 weapons declare
    // themselves aimed weapons ahead of their modules (8.14), and the v3
    // `boost` id is a non-aimed activation. STORY 8.13 SWAPPED ONE FOR ONE
    // (Eric rulings 2026-09-19, epic-8 amendments 74/81): `supercavTorpedo`
    // LEFT for the consumable id space and `foulingMines` ARRIVED from the
    // add-on space — the count did not move. Story 8.9 made it THE Shift boost
    // (universal, slot 1, no card can address it) and deleted the legacy
    // flat-bonus id beside it — one non-weapon left, not two.
    expect(EQUIPMENT_IS_WEAPON).toEqual({
      gun: true,
      boost: false, // Story 8.9: THE Shift boost — universal instant activation
      lightTorpedo: true,
      heavyTorpedo: true,
      navalMines: true, // Story 2.8: click-aimed rear-arc placement (amendment 45)
      captiveMines: true,
      foulingMines: true, // Story 8.13: its own line now (epic-8 amendment 81)
      // Story 8.15: the two PICKABLE GUNS (missile/monitor CUT, amendment 89e).
      machineGun: true,
      flak: true,
      broadside: true, // Story 7-5 wave 2: prime-then-click twin-sector barrage
      starShells: true, // Story 1.7: prime-then-click lit-zone flare
      phosphorShells: true, // Story 8.17: its own 360° weapon (amendment 131)
      // (radarBuoy DELETED in Story 8.16 — the DECOY BUOY consumable replaces it)
      // Story 8.15: the two NEW class Shifts — instant activations like boost.
      instantReload: false,
      hunker: false,
    });
    expect(Object.keys(EQUIPMENT_IS_WEAPON)).toEqual([...EQUIPMENT_IDS]);
  });

  it('every value is a boolean (runtime completeness over EquipmentId)', () => {
    for (const value of Object.values(EQUIPMENT_IS_WEAPON)) {
      expect(typeof value).toBe('boolean');
    }
  });
});

describe('loadoutFor — THE UNIVERSAL SLOT FIT (Story 8.5)', () => {
  // RETIRED with the per-hull rule: the three "the Torpedo Boat fits
  // [gun, heavyTorpedo, boost, empty]" / Battleship / Mine Layer cases,
  // and "the specials match the per-hull rule on every PICKABLE class". There
  // is no per-hull fit left to pin — the class weapons arrive as CARDS off the
  // offers, whose landing slots are pinned in nineSlots.test.ts.
  it('every CAPTAIN hull gets the IDENTICAL shape and ids: [gun, boost, empty × the rest]', () => {
    for (const id of SHIP_CLASS_IDS) {
      const loadout = loadoutFor(statsFor(id));
      expect(loadout.map((s) => s.equipmentId), id).toEqual([
        'gun', 'boost', ...new Array<null>(SLOT_COUNT - 2).fill(null),
      ]);
    }
  });

  it('the fitted slots start FULL-POOL and IDLE, with class-correct pools', () => {
    for (const id of SHIP_CLASS_IDS) {
      const stats = statsFor(id);
      const loadout = loadoutFor(stats);
      expect(loadout[SLOT_GUN].state, id).toEqual({ n: equipmentMaxAmmo(stats, 'gun'), reloadMsLeft: 0 });
      expect(loadout[SLOT_BOOST].state, id).toEqual({ n: equipmentMaxAmmo(stats, 'boost'), reloadMsLeft: 0 });
      expect(loadout[SLOT_BOOST].state, id).toEqual({ n: CONFIG.boost.maxAmmo, reloadMsLeft: 0 });
    }
  });

  it('the DEFAULT shift is the boost (the argument omitted fits the Torpedo Boat\'s Shift)', () => {
    for (const id of SHIP_CLASS_IDS) {
      expect(loadoutFor(statsFor(id))[SLOT_BOOST].equipmentId, id).toBe('boost');
    }
  });

  it('SLOT 1 IS THE HULL\'S CLASS SHIFT (Story 8.15, amendment 89c): TB boost · ML instant reload · BS hunker', () => {
    const want = { torpedoBoat: 'boost', mineLayer: 'instantReload', battleship: 'hunker' } as const;
    for (const id of SHIP_CLASS_IDS) {
      expect(CONFIG.shipClasses[id].shift, id).toBe(want[id]);
      expect(classShift(id), id).toBe(want[id]);
      const stats = statsFor(id);
      const loadout = loadoutFor(stats, false, DEFAULT_GUN, classShift(id));
      expect(loadout[SLOT_BOOST].equipmentId, id).toBe(want[id]);
      // A FULL charge, idle — the boost's semantics for every Shift.
      expect(loadout[SLOT_BOOST].state, id).toEqual({ n: equipmentMaxAmmo(stats, want[id]), reloadMsLeft: 0 });
      expect(EQUIPMENT_IS_WEAPON[want[id]], id).toBe(false);
      // The rest of the fit does not move with the Shift.
      expect(loadout.map((s) => s.equipmentId).filter((_, i) => i !== SLOT_BOOST), id)
        .toEqual(['gun', ...new Array<null>(SLOT_COUNT - 2).fill(null)]);
    }
    // Every ShiftId is some hull's — no orphan Shift, no hull without one.
    expect(SHIP_CLASS_IDS.map((id) => classShift(id)).sort()).toEqual([...SHIFT_IDS].sort());
  });

  it('a FLEET drone fits NO Shift whatever `shift` says', () => {
    for (const shift of SHIFT_IDS) {
      expect(loadoutFor(statsFor('droneSmall'), true, DEFAULT_GUN, shift)[SLOT_BOOST])
        .toEqual({ equipmentId: null, state: null });
    }
  });

  it('the weapon row and the consumable slots start EMPTY on every captain hull', () => {
    for (const id of SHIP_CLASS_IDS) {
      const loadout = loadoutFor(statsFor(id));
      for (const i of [...WEAPON_SLOTS, ...CONSUMABLE_SLOTS]) {
        expect(loadout[i], `${id}:${i}`).toEqual({ equipmentId: null, state: null });
      }
    }
  });

  it('fleet === true is the gun-only drone fit: [gun, empty × the rest] (amendments 34 / 24)', () => {
    for (const id of HULL_IDS) {
      const loadout = loadoutFor(statsFor(id), true);
      expect(loadout.map((s) => s.equipmentId), id).toEqual([
        'gun', ...new Array<null>(SLOT_COUNT - 1).fill(null),
      ]);
      expect(loadout[SLOT_GUN].state, id).toEqual({ n: equipmentMaxAmmo(statsFor(id), 'gun'), reloadMsLeft: 0 });
    }
  });

  it('is SLOT_COUNT slots with the gun in slot 0 on every hull id, captain or fleet', () => {
    for (const id of HULL_IDS) {
      for (const fleet of [false, true]) {
        const loadout = loadoutFor(statsFor(id), fleet);
        expect(loadout, `${id}/${String(fleet)}`).toHaveLength(SLOT_COUNT);
        expect(loadout[SLOT_GUN].equipmentId).toBe('gun');
        expect(loadout[SLOT_GUN].state).toEqual({ n: equipmentMaxAmmo(statsFor(id), 'gun'), reloadMsLeft: 0 });
      }
    }
  });

  it('the fit is hull-INDEPENDENT: a drone hull passed as a captain gets the captain fit', () => {
    // The hull parameter is gone; a fleet hull is one BOOLEAN away, and the
    // only thing its id still decides is its STATS (pools/reloads).
    for (const id of HULL_IDS) {
      if (!isFleet(id)) continue;
      expect(loadoutFor(statsFor(id)).map((s) => s.equipmentId), id)
        .toEqual(loadoutFor(statsFor('torpedoBoat')).map((s) => s.equipmentId));
    }
  });
});

describe('equipmentMaxAmmo / equipmentReloadMs cover the Shift boost (from stats.boost)', () => {
  it('the boost pool + reload come from CONFIG.boost (Story 8.9)', () => {
    const stats = statsFor('torpedoBoat');
    expect(equipmentMaxAmmo(stats, 'boost')).toBe(stats.equipment.boost.maxAmmo);
    expect(equipmentMaxAmmo(stats, 'boost')).toBe(CONFIG.boost.maxAmmo);
    expect(equipmentReloadMs(stats, 'boost')).toBe(stats.equipment.boost.reloadMs);
    expect(equipmentReloadMs(stats, 'boost')).toBe(CONFIG.boost.reloadMs);
  });
});

describe('equipmentMaxAmmo / equipmentReloadMs cover broadside + starShells + phosphorShells', () => {
  it('phosphorShells pool + reload come from CONFIG.phosphorShells (Story 8.17, amendment 131)', () => {
    const stats = statsFor('battleship');
    expect(equipmentMaxAmmo(stats, 'phosphorShells')).toBe(CONFIG.phosphorShells.maxAmmo);
    expect(equipmentReloadMs(stats, 'phosphorShells')).toBe(CONFIG.phosphorShells.reloadMs);
  });

  it('broadside pool + reload come from CONFIG.broadside (via stats.broadside)', () => {
    const stats = statsFor('battleship');
    expect(equipmentMaxAmmo(stats, 'broadside')).toBe(stats.equipment.broadside.maxAmmo);
    expect(equipmentMaxAmmo(stats, 'broadside')).toBe(CONFIG.broadside.maxAmmo);
    expect(equipmentReloadMs(stats, 'broadside')).toBe(stats.equipment.broadside.reloadMs);
    expect(equipmentReloadMs(stats, 'broadside')).toBe(CONFIG.broadside.reloadMs);
  });

  it('starShells pool + reload come from CONFIG.starShells (via stats.starShells)', () => {
    const stats = statsFor('battleship');
    expect(equipmentMaxAmmo(stats, 'starShells')).toBe(stats.equipment.starShells.maxAmmo);
    expect(equipmentMaxAmmo(stats, 'starShells')).toBe(CONFIG.starShells.maxAmmo);
    expect(equipmentReloadMs(stats, 'starShells')).toBe(stats.equipment.starShells.reloadMs);
    expect(equipmentReloadMs(stats, 'starShells')).toBe(CONFIG.starShells.reloadMs);
  });
});

describe('the radar buoy is DELETED (Story 8.16) — no id, no stat row, no pool', () => {
  it('radarBuoy is gone from EquipmentId and the stats record; the four BUOYS are consumables with NO row', () => {
    const stats = statsFor('mineLayer');
    expect((EQUIPMENT_IDS as readonly string[]).includes('radarBuoy')).toBe(false);
    expect('radarBuoy' in stats.equipment).toBe(false);
    // The consumable law: a buoy carries no EffectiveStats row — its numbers
    // are read straight from CONFIG.buoy (Story 10.9). The deleted DECOY BUOY
    // is no id at all any more.
    for (const id of BUOY_LINE_IDS) {
      expect(id in stats.equipment, id).toBe(false);
      expect(isConsumableId(id), id).toBe(true);
    }
    expect(isConsumableId('decoyBuoy')).toBe(false);
  });
});

describe('LoadoutSlot invariant — state is null iff equipmentId is null', () => {
  it('holds for every slot across every hull id', () => {
    for (const id of HULL_IDS) {
      for (const fleet of [false, true]) {
        const loadout: LoadoutSlot[] = loadoutFor(statsFor(id), fleet);
        expect(loadout).toHaveLength(SLOT_COUNT); // all SLOT_COUNT slots, not just the fitted head
        for (const slot of loadout) {
          expect(slot.state === null).toBe(slot.equipmentId === null);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// THE BELT'S CONTENT TYPE (Story 8.7, orchestrator ruling 1). A slot holds a
// `SlotItemId` — an EquipmentId (slots 0–4) or a ConsumableId (its fixed slot).
// The two id spaces stay DISJOINT: every EquipmentId-keyed record
// (EQUIPMENT_IS_WEAPON, EQUIPMENT_STAT_FIELDS, the server's rows, the glyph
// table) would have to carry a lie for a stack if EquipmentId widened, so the
// union lives at the ONE place that holds either — the slot — and every read
// of an EquipmentId-keyed record narrows through `isConsumableId` first.
// ---------------------------------------------------------------------------

describe('SlotItemId — the disjoint union a slot may hold (Story 8.7)', () => {
  it('the two id spaces never overlap: no consumable id is an EquipmentId and vice versa', () => {
    const equipment = new Set<string>(EQUIPMENT_IDS);
    for (const id of CONSUMABLE_IDS) expect(equipment.has(id), id).toBe(false);
    const consumables = new Set<string>(CONSUMABLE_IDS);
    for (const id of EQUIPMENT_IDS) expect(consumables.has(id), id).toBe(false);
    // Story 9.4 replaced `dazzleShells` with `foulingShell`; Story 10.9 brought
    // `dazzleShells` back BESIDE it — both consumables, neither equipment.
    expect(CONSUMABLE_IDS).toContain('foulingShell');
    expect(CONSUMABLE_IDS).toContain('dazzleShells');
    expect((EQUIPMENT_IDS as readonly string[]).includes('foulingShell')).toBe(false);
    expect((EQUIPMENT_IDS as readonly string[]).includes('dazzleShells')).toBe(false);
  });

  it('a LoadoutSlot may hold either kind — a weapon slot an EquipmentId, a consumable slot a ConsumableId', () => {
    // Type-level pin as much as a runtime one: this file type-checks in the
    // gate, so a narrowed `equipmentId: EquipmentId | null` fails to compile.
    const weapon: LoadoutSlot = { equipmentId: 'heavyTorpedo', state: { n: 2, reloadMsLeft: 0 } };
    const belt: LoadoutSlot = { equipmentId: 'hullRepair', state: { n: 1, reloadMsLeft: 0 } };
    const ids: (SlotItemId | null)[] = [weapon.equipmentId, belt.equipmentId, null];
    expect(ids).toEqual(['heavyTorpedo', 'hullRepair', null]);
    // A STACK NEVER RELOADS (ruling 2): its reloadMsLeft is 0 forever.
    expect(belt.state?.reloadMsLeft).toBe(0);
  });

  it('isConsumableId is the ONE guard: true for every consumable id, false for every EquipmentId and for junk', () => {
    for (const id of CONSUMABLE_IDS) expect(isConsumableId(id), id).toBe(true);
    for (const id of EQUIPMENT_IDS) expect(isConsumableId(id), id).toBe(false);
    for (const junk of ['', 'nope', 'constructor', 'toString', 'hullrepair', 'HullRepair']) {
      expect(isConsumableId(junk), junk).toBe(false);
    }
  });
});

describe('CONSUMABLE_IS_WEAPON / isWeaponItem — the split both activation channels read', () => {
  it('is the exact table: the SUPERCAV TORPEDO, the two click shells and the four BUOYS are click-aimed (D21)', () => {
    expect(CONSUMABLE_IS_WEAPON).toEqual({
      hullRepair: false,
      shieldBlock: false,
      countermeasure: false,
      depthCharge: false, // STUB, non-aimed until Eric rules (amendment 83)
      supercavTorpedo: true, // KEY PRIMES, CLICK FIRES — bow +/-15 deg (amendment 74)
      foulingShell: true, // FOULING SHELL — KEY PRIMES, CLICK FIRES, 360° (Story 9.4)
      dazzleShells: true, // FLASH SHELLS — KEY PRIMES, CLICK FIRES, 360° (Story 10.9 restoring amendment 132)
      radarBuoy: true, // the four BUOYS: click-PLACED at any bearing (Story 10.9, ruling 9)
      healingBuoy: true,
      shieldBuoy: true,
      speedBuoy: true,
    });
    expect(Object.keys(CONSUMABLE_IS_WEAPON)).toEqual([...CONSUMABLE_IDS]);
    for (const value of Object.values(CONSUMABLE_IS_WEAPON)) expect(typeof value).toBe('boolean');
  });

  it('isWeaponItem agrees with EQUIPMENT_IS_WEAPON over every EquipmentId', () => {
    for (const id of EQUIPMENT_IDS) expect(isWeaponItem(id), id).toBe(EQUIPMENT_IS_WEAPON[id]);
  });

  it('isWeaponItem agrees with CONSUMABLE_IS_WEAPON over every ConsumableId', () => {
    for (const id of CONSUMABLE_IDS) expect(isWeaponItem(id), id).toBe(CONSUMABLE_IS_WEAPON[id]);
    expect(CONSUMABLE_IDS.filter((id) => isWeaponItem(id))).toEqual([
      'supercavTorpedo', 'foulingShell', 'dazzleShells', ...BUOY_LINE_IDS,
    ]);
  });
});

describe('slotMaxAmmo — a stack is capped by its LINE, a weapon by its stats row', () => {
  const stats = statsFor('torpedoBoat');

  it('routes every EquipmentId to equipmentMaxAmmo, unchanged', () => {
    for (const id of EQUIPMENT_IDS) expect(slotMaxAmmo(stats, id), id).toBe(equipmentMaxAmmo(stats, id));
  });

  it('routes every ConsumableId to its catalog line CAP (five copies, five uses)', () => {
    for (const id of CONSUMABLE_IDS) {
      expect(slotMaxAmmo(stats, id), id).toBe(CATALOG[id].cap);
    }
  });

  it('reads the INJECTED catalog, and an unknown consumable line caps at 0 (fail-closed)', () => {
    const short: CatalogLine = {
      id: 'hullRepair' as LineId,
      kind: 'consumable',
      cap: 2,
      tiers: [[{ kind: 'stock', equipmentId: 'hullRepair' }], [{ kind: 'stock', equipmentId: 'hullRepair' }]],
    };
    const cat: Catalog = { hullRepair: short };
    expect(slotMaxAmmo(stats, 'hullRepair', cat)).toBe(2);
    expect(slotMaxAmmo(stats, 'healingBuoy', cat)).toBe(0); // no line in this catalog
    expect(slotMaxAmmo(stats, 'gun', cat)).toBe(equipmentMaxAmmo(stats, 'gun')); // equipment ignores it
  });
});

describe('THE KIT — every carried consumable kind owns one fixed slot (Story 9.2 → Story 10.1, epic-10 amendment 3)', () => {
  /** A handful of valid kits: the default, its reverse, and seeded rolls. */
  const KITS: ConsumableKit[] = [
    DEFAULT_KIT,
    [...DEFAULT_KIT].reverse(),
    ...Array.from({ length: 20 }, (_, seed) => rollKit(mulberry32(seed).next)),
  ];

  it('DEFAULT_KIT is a valid kit of KIT_SIZE distinct consumable ids (its members are Eric\'s, not pinned here)', () => {
    expect(isConsumableKit(DEFAULT_KIT)).toBe(true);
    expect(new Set(DEFAULT_KIT).size).toBe(KIT_SIZE);
    for (const id of DEFAULT_KIT) expect(isConsumableId(id), id).toBe(true);
    for (const id of DEFAULT_KIT) expect(CATALOG[id].stub, id).not.toBe(true);
  });

  it('consumableSlotFor and consumableKindAt round-trip for every kit line: slot 5+i ⇔ kit[i]', () => {
    for (const kit of KITS) {
      kit.forEach((id, i) => {
        const slot = consumableSlotFor(kit, id);
        expect(slot, id).toBe(CONSUMABLE_SLOTS[i]);
        expect(SLOT_ROLES[slot ?? -1], id).toBe('consumable');
        expect(consumableKindAt(kit, slot ?? -1), id).toBe(id);
      });
      expect(CONSUMABLE_SLOTS.map((i) => consumableKindAt(kit, i))).toEqual([...kit]);
    }
  });

  it('a kind the kit does not carry has NO slot — the DEPTH CHARGE stub never, a live line only when carried', () => {
    for (const kit of KITS) {
      for (const id of CONSUMABLE_IDS) {
        const carried = (kit as readonly string[]).includes(id);
        expect(consumableSlotFor(kit, id) !== null, `${id} in [${kit.join(',')}]`).toBe(carried);
      }
      expect(consumableSlotFor(kit, 'depthCharge')).toBeNull();
    }
  });

  it('consumableKindAt is null off the consumable slots (gun, Shift, weapon row, out of range, non-integer)', () => {
    for (const slot of [SLOT_GUN, SLOT_BOOST, ...WEAPON_SLOTS, -1, SLOT_COUNT, SLOT_COUNT + 5, 5.5, Number.NaN]) {
      expect(consumableKindAt(DEFAULT_KIT, slot), String(slot)).toBeNull();
    }
  });

  it('the helpers are FAIL-CLOSED over a malformed kit: an entry past KIT_SIZE has no slot, a short kit leaves slots unbound', () => {
    const long = [...DEFAULT_KIT, 'healingBuoy'] as const;
    expect(isConsumableKit(long)).toBe(false);
    expect(consumableSlotFor(long, 'healingBuoy')).toBeNull();
    expect(consumableKindAt(long, CONSUMABLE_SLOTS[CONSUMABLE_SLOTS.length - 1] + 1)).toBeNull();
    const short = DEFAULT_KIT.slice(0, 1);
    expect(isConsumableKit(short)).toBe(false);
    expect(consumableKindAt(short, CONSUMABLE_SLOTS[0])).toBe(short[0]);
    expect(consumableKindAt(short, CONSUMABLE_SLOTS[1])).toBeNull();
    expect(consumableSlotFor([], 'hullRepair')).toBeNull();
  });

  it('CHAFF is retired: not a consumable id (amendment 31)', () => {
    expect(isConsumableId('chaff')).toBe(false);
  });
});
