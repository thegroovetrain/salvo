// Pins the shared loadout spine: the slot grammar constants, the
// state-null-iff-equipmentId-null invariant, and THE UNIVERSAL SLOT FIT
// (Story 8.5). loadoutFor builds from a REAL effectiveStats() so pool sizes
// match what the server writes on spawn/respawn/redeploy.
//
// THE PER-HULL FIT IS RETIRED (Stories 1.6–1.8 / 7-5 wave 2 are superseded):
// every CAPTAIN hull now fits exactly [gun, boost, empty × the rest] — the boost
// stopped being a Torpedo Boat privilege (amendment 23) and the class weapons
// arrive as CARDS: since Story 8.10 deleted the interim spawn seed, the first
// of them comes off the LEVEL-ZERO OFFER at countdown start. (The PvE fleet
// hull's [gun, empty × the rest] fit retired with the fleet, Story 10.8,
// 2026-11-06.) Also pins the
// EQUIPMENT_IS_WEAPON split — the single source server rows and the client
// activation path read. Pure, zero I/O.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  DEFAULT_SHIFT,
  EQUIPMENT_FAMILY,
  EQUIPMENT_IDS,
  EQUIPMENT_IS_WEAPON,
  FAMILY_SLOT,
  HULL_IDS,
  SHIFT_IDS,
  SHIP_CLASS_IDS,
  SLOT_BOOST,
  SLOT_COUNT,
  SLOT_FAMILIES,
  SLOT_GUN,
  SLOT_ROLES,
  WEAPON_SLOTS,
  effectiveStats,
  equipmentMaxAmmo,
  equipmentReloadMs,
  familyMembers,
  familySlotFor,
  hullEnvelope,
  isShiftId,
  loadoutFor,
  sanitizeShiftId,
  slotFamilyAt,
  type EffectiveStats,
  type HullId,
  type LoadoutSlot,
} from '../index.js';
import { NEUTRAL_HULL } from './neutralHull.js';

/** Fresh effective stats for any hull id at zero boons. */
function statsFor(id: HullId): EffectiveStats {
  return effectiveStats(hullEnvelope(id));
}

describe('slot-grammar constants — the fixed roles (Story 8.5; five slots since Story 10.5)', () => {
  it('the role groups PARTITION 0..SLOT_COUNT-1 exactly once: the gun, the Shift, the weapon row', () => {
    const all = [SLOT_GUN, SLOT_BOOST, ...WEAPON_SLOTS];
    expect([...all].sort((a, b) => a - b)).toEqual(Array.from({ length: SLOT_COUNT }, (_, i) => i));
    expect(new Set(all).size).toBe(SLOT_COUNT);
  });

  it('SLOT_ROLES covers every slot and agrees with the index constants', () => {
    expect(SLOT_ROLES).toHaveLength(SLOT_COUNT);
    expect(SLOT_ROLES[SLOT_GUN]).toBe('gun');
    expect(SLOT_ROLES[SLOT_BOOST]).toBe('boost');
    for (const i of WEAPON_SLOTS) expect(SLOT_ROLES[i], `slot ${i}`).toBe('weapon');
  });

  it('the retired slot models are GONE from the module surface: no per-hull fit, no key row, no kit', async () => {
    const mod = (await import('../index.js')) as Record<string, unknown>;
    for (const name of [
      'SLOT_EXTRA', 'specialsFor', 'CONSUMABLE_KEY_ORDER',
      // Story 10.5 (Eric 2026-11-05, epic-10 amendment 11): the kit is retired.
      'KIT_SIZE', 'DEFAULT_KIT', 'CONSUMABLE_SLOTS', 'CONSUMABLE_IDS', 'CONSUMABLE_IS_WEAPON',
      'consumableSlotFor', 'consumableKindAt', 'isConsumableKit', 'isConsumableId', 'rollKit', 'KitRollError',
      'dealableConsumables', 'stockSlotFor', 'slotMaxAmmo', 'isWeaponItem',
    ]) {
      expect(mod[name], name).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// THE THREE FAMILY SLOTS (Story 10.5, Eric 2026-11-05, epic-10 amendment 11):
// `Q` holds a torpedo, `E` a mine, `R` a special shell — one kind per slot.
// These pin the MODEL (every weapon has exactly one home, every home is a
// weapon slot); what the fold and the draw do with it is familySlots.test.ts.
// ---------------------------------------------------------------------------
describe('the slot-family model — every slot weapon has ONE fixed home', () => {
  it('SLOT_FAMILIES and WEAPON_SLOTS pair up one to one, in order, through FAMILY_SLOT and slotFamilyAt', () => {
    expect(SLOT_FAMILIES).toHaveLength(WEAPON_SLOTS.length);
    SLOT_FAMILIES.forEach((family, k) => {
      expect(FAMILY_SLOT[family], family).toBe(WEAPON_SLOTS[k]);
      expect(slotFamilyAt(WEAPON_SLOTS[k]), family).toBe(family);
    });
    expect(new Set(Object.values(FAMILY_SLOT)).size).toBe(SLOT_FAMILIES.length);
  });

  it('slotFamilyAt is null off the weapon row (gun, Shift, out of range, non-integer)', () => {
    for (const slot of [SLOT_GUN, SLOT_BOOST, -1, SLOT_COUNT, SLOT_COUNT + 5, 2.5, Number.NaN]) {
      expect(slotFamilyAt(slot), String(slot)).toBeNull();
    }
  });

  it('familySlotFor is the family\'s slot for a family weapon and null for everything else', () => {
    for (const id of EQUIPMENT_IDS) {
      const family = EQUIPMENT_FAMILY[id];
      expect(familySlotFor(id), id).toBe(family === null ? null : FAMILY_SLOT[family]);
    }
  });

  it('a family member is always an aimed WEAPON; no Shift and no mounted gun has a family', () => {
    for (const id of EQUIPMENT_IDS) {
      if (EQUIPMENT_FAMILY[id] !== null) expect(EQUIPMENT_IS_WEAPON[id], id).toBe(true);
    }
    for (const id of [...SHIFT_IDS, 'gun', 'machineGun', 'flak', 'mainBattery'] as const) {
      expect(EQUIPMENT_FAMILY[id], id).toBeNull();
    }
  });

  it('familyMembers partitions the family weapons: every member once, more than one kind competing for each slot', () => {
    const seen = new Set<string>();
    for (const family of SLOT_FAMILIES) {
      const members = familyMembers(family);
      expect(members.length, family).toBeGreaterThan(1);
      for (const id of members) {
        expect(EQUIPMENT_FAMILY[id], id).toBe(family);
        expect(seen.has(id), id).toBe(false);
        seen.add(id);
      }
    }
    expect(seen.size).toBe(EQUIPMENT_IDS.filter((id) => EQUIPMENT_FAMILY[id] !== null).length);
  });

  it('the three weapons that were consumables until Story 10.5 are family weapons now', () => {
    expect(EQUIPMENT_FAMILY.supercavTorpedo).toBe('torpedo');
    expect(EQUIPMENT_FAMILY.dazzleShells).toBe('shell');
    expect(EQUIPMENT_FAMILY.foulingShell).toBe('shell');
  });

  it('BROADSIDE has NO family slot — it left the deal (Eric 2026-11-05, R6)', () => {
    expect(EQUIPMENT_FAMILY.broadside).toBeNull();
    expect(familySlotFor('broadside')).toBeNull();
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
      // Story 8.15: the two NEW class Shifts — instant activations like boost.
      instantReload: false,
      hunker: false,
      // Story 10.4: THE MAIN BATTERY — a captain's slot 0, click-aimed.
      mainBattery: true,
      // Story 10.5: the three weapons that left the consumable space.
      supercavTorpedo: true,
      dazzleShells: true,
      foulingShell: true,
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
  // offers, whose landing slots are pinned in familySlots.test.ts.
  it('every CAPTAIN hull gets the IDENTICAL shape and ids: [mainBattery, the default Shift, empty × the rest]', () => {
    for (const id of SHIP_CLASS_IDS) {
      const loadout = loadoutFor(statsFor(id));
      expect(loadout.map((s) => s.equipmentId), id).toEqual([
        'mainBattery', DEFAULT_SHIFT, ...new Array<null>(SLOT_COUNT - 2).fill(null),
      ]);
    }
  });

  it('the fitted slots start FULL-POOL and IDLE, with class-correct pools', () => {
    for (const id of SHIP_CLASS_IDS) {
      const stats = statsFor(id);
      const loadout = loadoutFor(stats);
      // Slot 0's pool is the hull's TURRET COUNT — every turret loaded (Story 10.4).
      expect(loadout[SLOT_GUN].state, id).toEqual({ n: CONFIG.shipClasses[id].battery.turrets.length, reloadMsLeft: 0 });
      expect(loadout[SLOT_BOOST].state, id).toEqual({ n: equipmentMaxAmmo(stats, 'boost'), reloadMsLeft: 0 });
      expect(loadout[SLOT_BOOST].state, id).toEqual({ n: CONFIG.boost.maxAmmo, reloadMsLeft: 0 });
    }
  });

  it('the DEFAULT shift fits when the argument is omitted', () => {
    for (const id of SHIP_CLASS_IDS) {
      expect(loadoutFor(statsFor(id))[SLOT_BOOST].equipmentId, id).toBe(DEFAULT_SHIFT);
    }
  });

  it("SLOT 1 IS THE SEAT'S SHIFT (Story 10.4): any hull fits any Shift, and nothing else moves", () => {
    for (const id of SHIP_CLASS_IDS) {
      const stats = statsFor(id);
      for (const shift of SHIFT_IDS) {
        const loadout = loadoutFor(stats, shift);
        expect(loadout[SLOT_BOOST].equipmentId, `${id}/${shift}`).toBe(shift);
        // A FULL charge, idle — the boost's semantics for every Shift.
        expect(loadout[SLOT_BOOST].state, `${id}/${shift}`).toEqual({ n: equipmentMaxAmmo(stats, shift), reloadMsLeft: 0 });
        expect(EQUIPMENT_IS_WEAPON[shift], shift).toBe(false);
        // The rest of the fit does not move with the Shift.
        expect(loadout.map((s) => s.equipmentId).filter((_, i) => i !== SLOT_BOOST), `${id}/${shift}`)
          .toEqual(['mainBattery', ...new Array<null>(SLOT_COUNT - 2).fill(null)]);
      }
    }
  });

  it('sanitizeShiftId passes every Shift through and fails OPEN to the default for anything else (R7)', () => {
    for (const shift of SHIFT_IDS) {
      expect(isShiftId(shift), shift).toBe(true);
      expect(sanitizeShiftId(shift), shift).toBe(shift);
    }
    expect(SHIFT_IDS).toContain(DEFAULT_SHIFT);
    // The retired seat-gun ids, an equipment id that is not a Shift, junk.
    for (const raw of ['deckGun', 'machineGun', 'flak', 'mainBattery', 'gun', '', 'BOOST', undefined, null, 1, {}]) {
      expect(isShiftId(raw), String(raw)).toBe(false);
      expect(sanitizeShiftId(raw), String(raw)).toBe(DEFAULT_SHIFT);
    }
  });

  it('the three family slots start EMPTY on every captain hull', () => {
    for (const id of SHIP_CLASS_IDS) {
      const loadout = loadoutFor(statsFor(id));
      for (const i of WEAPON_SLOTS) {
        expect(loadout[i], `${id}:${i}`).toEqual({ equipmentId: null, state: null });
      }
    }
  });

  it('is SLOT_COUNT slots with the main battery fitted in slot 0 on every hull id', () => {
    for (const id of HULL_IDS) {
      const loadout = loadoutFor(statsFor(id));
      expect(loadout, id).toHaveLength(SLOT_COUNT);
      expect(loadout[SLOT_GUN].equipmentId).toBe('mainBattery');
      expect(loadout[SLOT_GUN].state).toEqual({ n: equipmentMaxAmmo(statsFor(id), 'mainBattery'), reloadMsLeft: 0 });
    }
  });
});

describe('equipmentMaxAmmo / equipmentReloadMs cover the Shift boost (from stats.boost)', () => {
  it('the boost pool + reload come from CONFIG.boost (Story 8.9)', () => {
    const stats = effectiveStats(NEUTRAL_HULL);
    expect(equipmentMaxAmmo(stats, 'boost')).toBe(stats.equipment.boost.maxAmmo);
    expect(equipmentMaxAmmo(stats, 'boost')).toBe(CONFIG.boost.maxAmmo);
    expect(equipmentReloadMs(stats, 'boost')).toBe(stats.equipment.boost.reloadMs);
    expect(equipmentReloadMs(stats, 'boost')).toBe(CONFIG.boost.reloadMs);
  });
});

describe('equipmentMaxAmmo / equipmentReloadMs cover broadside + starShells + phosphorShells', () => {
  it('phosphorShells pool + reload come from CONFIG.phosphorShells (Story 8.17, amendment 131)', () => {
    const stats = effectiveStats(NEUTRAL_HULL);
    expect(equipmentMaxAmmo(stats, 'phosphorShells')).toBe(CONFIG.phosphorShells.maxAmmo);
    expect(equipmentReloadMs(stats, 'phosphorShells')).toBe(CONFIG.phosphorShells.reloadMs);
  });

  it('broadside pool + reload come from CONFIG.broadside (via stats.broadside)', () => {
    const stats = effectiveStats(NEUTRAL_HULL);
    expect(equipmentMaxAmmo(stats, 'broadside')).toBe(stats.equipment.broadside.maxAmmo);
    expect(equipmentMaxAmmo(stats, 'broadside')).toBe(CONFIG.broadside.maxAmmo);
    expect(equipmentReloadMs(stats, 'broadside')).toBe(stats.equipment.broadside.reloadMs);
    expect(equipmentReloadMs(stats, 'broadside')).toBe(CONFIG.broadside.reloadMs);
  });

  it('starShells pool + reload come from CONFIG.starShells (via stats.starShells)', () => {
    const stats = effectiveStats(NEUTRAL_HULL);
    expect(equipmentMaxAmmo(stats, 'starShells')).toBe(stats.equipment.starShells.maxAmmo);
    expect(equipmentMaxAmmo(stats, 'starShells')).toBe(CONFIG.starShells.maxAmmo);
    expect(equipmentReloadMs(stats, 'starShells')).toBe(stats.equipment.starShells.reloadMs);
    expect(equipmentReloadMs(stats, 'starShells')).toBe(CONFIG.starShells.reloadMs);
  });
});

describe('equipmentMaxAmmo / equipmentReloadMs cover the three moved weapons (Story 10.5, R4)', () => {
  it('each reads its pool and its Tier I reload from its own CONFIG block', () => {
    const stats = effectiveStats(NEUTRAL_HULL);
    const blocks = {
      supercavTorpedo: CONFIG.supercavTorpedo,
      dazzleShells: CONFIG.flashShells,
      foulingShell: CONFIG.foulingShell,
    } as const;
    for (const id of ['supercavTorpedo', 'dazzleShells', 'foulingShell'] as const) {
      expect(equipmentMaxAmmo(stats, id), id).toBe(blocks[id].maxAmmo);
      expect(equipmentReloadMs(stats, id), id).toBe(blocks[id].reloadMs);
    }
  });
});

describe('LoadoutSlot invariant — state is null iff equipmentId is null', () => {
  it('holds for every slot across every hull id', () => {
    for (const id of HULL_IDS) {
      for (const shift of SHIFT_IDS) {
        const loadout: LoadoutSlot[] = loadoutFor(statsFor(id), shift);
        expect(loadout).toHaveLength(SLOT_COUNT); // all SLOT_COUNT slots, not just the fitted head
        for (const slot of loadout) {
          expect(slot.state === null).toBe(slot.equipmentId === null);
        }
      }
    }
  });
});
