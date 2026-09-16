// Pins the shared loadout spine: the slot grammar constants, the
// state-null-iff-equipmentId-null invariant, and THE UNIVERSAL NINE-SLOT FIT
// (Story 8.5). loadoutFor builds from a REAL effectiveStats() so pool sizes
// match what the server writes on spawn/respawn/redeploy.
//
// THE PER-HULL FIT IS RETIRED (Stories 1.6–1.8 / 7-5 wave 2 are superseded):
// every CAPTAIN hull now fits exactly [gun, speedBoost, empty ×7] — the boost
// stopped being a Torpedo Boat privilege (amendment 23) and the class weapons
// arrive as CARDS from the spawn seed (SPAWN_SEED, catalog.ts). A PvE fleet
// hull fits [gun, empty ×8] (Story 5.6, amendment 34). Also pins the
// EQUIPMENT_IS_WEAPON split — the single source server rows and the client
// activation path read. Pure, zero I/O.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  HULL_IDS,
  SHIP_CLASS_IDS,
  SLOT_COUNT,
  SLOT_GUN,
  SLOT_BOOST,
  WEAPON_SLOTS,
  CONSUMABLE_SLOTS,
  SLOT_ROLES,
  EQUIPMENT_IDS,
  EQUIPMENT_IS_WEAPON,
  effectiveStats,
  equipmentMaxAmmo,
  equipmentReloadMs,
  hullEnvelope,
  loadoutFor,
  type EffectiveStats,
  type HullId,
  type LoadoutSlot,
} from '../index.js';

/** Fresh effective stats for any hull id at zero boons. */
function statsFor(id: HullId): EffectiveStats {
  return effectiveStats(hullEnvelope(id));
}

/** Is this hull id a PvE fleet (drone) hull? */
function isFleet(id: HullId): boolean {
  return !(SHIP_CLASS_IDS as readonly string[]).includes(id);
}

describe('slot-grammar constants — the nine fixed roles (Story 8.5)', () => {
  it('SLOT_COUNT is 9, SLOT_GUN 0, SLOT_BOOST 1, weapons [2,3,4], consumables [5,6,7,8]', () => {
    // WAS 4 (gun, two per-hull specials, one extra). The extra slot and its
    // SLOT_EXTRA constant are DELETED — one flat nine-slot array instead.
    expect(SLOT_COUNT).toBe(9);
    expect(SLOT_GUN).toBe(0);
    expect(SLOT_BOOST).toBe(1);
    expect(WEAPON_SLOTS).toEqual([2, 3, 4]);
    expect(CONSUMABLE_SLOTS).toEqual([5, 6, 7, 8]);
  });

  it('the four role groups PARTITION 0..SLOT_COUNT-1 exactly once', () => {
    const all = [SLOT_GUN, SLOT_BOOST, ...WEAPON_SLOTS, ...CONSUMABLE_SLOTS];
    expect([...all].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(new Set(all).size).toBe(SLOT_COUNT);
  });

  it('SLOT_ROLES is the nine-tuple [gun, boost, weapon ×3, consumable ×4] and agrees with the index constants', () => {
    expect(SLOT_ROLES).toEqual([
      'gun', 'boost', 'weapon', 'weapon', 'weapon', 'consumable', 'consumable', 'consumable', 'consumable',
    ]);
    expect(SLOT_ROLES).toHaveLength(SLOT_COUNT);
    expect(SLOT_ROLES[SLOT_GUN]).toBe('gun');
    expect(SLOT_ROLES[SLOT_BOOST]).toBe('boost');
    for (const i of WEAPON_SLOTS) expect(SLOT_ROLES[i], `slot ${i}`).toBe('weapon');
    for (const i of CONSUMABLE_SLOTS) expect(SLOT_ROLES[i], `slot ${i}`).toBe('consumable');
  });

  it('`SLOT_EXTRA` and `specialsFor` are GONE from the module surface (no per-hull fit to name)', async () => {
    const mod = (await import('../index.js')) as Record<string, unknown>;
    expect(mod.SLOT_EXTRA).toBeUndefined();
    expect(mod.specialsFor).toBeUndefined();
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
    // behaviour under their v3 names, the seven unbuilt v3 weapons declare
    // themselves aimed weapons ahead of their modules (8.13/8.14), and the v3
    // `boost` placeholder joins `speedBoost` as a non-aimed activation.
    expect(EQUIPMENT_IS_WEAPON).toEqual({
      gun: true,
      boost: false, // Story 8.9 builds the Shift ability
      lightTorpedo: true,
      heavyTorpedo: true,
      supercavTorpedo: true,
      navalMines: true, // Story 2.8: click-aimed rear-arc placement (amendment 45)
      captiveMines: true,
      missile: true,
      machineGun: true,
      flak: true,
      monitor: true,
      broadside: true, // Story 7-5 wave 2: prime-then-click twin-sector barrage
      starShells: true, // Story 1.7: prime-then-click lit-zone flare
      speedBoost: false,
      radarBuoy: true, // Story 7-5 wave 2: click-placed in the mine's rear sector
    });
    expect(Object.keys(EQUIPMENT_IS_WEAPON)).toEqual([...EQUIPMENT_IDS]);
  });

  it('every value is a boolean (runtime completeness over EquipmentId)', () => {
    for (const value of Object.values(EQUIPMENT_IS_WEAPON)) {
      expect(typeof value).toBe('boolean');
    }
  });
});

describe('loadoutFor — THE UNIVERSAL NINE-SLOT FIT (Story 8.5)', () => {
  // RETIRED with the per-hull rule: the three "the Torpedo Boat fits
  // [gun, heavyTorpedo, speedBoost, empty]" / Battleship / Mine Layer cases,
  // and "the specials match the per-hull rule on every PICKABLE class". There
  // is no per-hull fit left to pin — the class weapons arrive as spawn-seed
  // CARDS (SPAWN_SEED), whose landing slots are pinned in nineSlots.test.ts.
  it('every CAPTAIN hull gets the IDENTICAL shape and ids: [gun, speedBoost, empty ×7]', () => {
    for (const id of SHIP_CLASS_IDS) {
      const loadout = loadoutFor(statsFor(id));
      expect(loadout.map((s) => s.equipmentId), id).toEqual([
        'gun', 'speedBoost', null, null, null, null, null, null, null,
      ]);
    }
  });

  it('the fitted slots start FULL-POOL and IDLE, with class-correct pools', () => {
    for (const id of SHIP_CLASS_IDS) {
      const stats = statsFor(id);
      const loadout = loadoutFor(stats);
      expect(loadout[SLOT_GUN].state, id).toEqual({ n: equipmentMaxAmmo(stats, 'gun'), reloadMsLeft: 0 });
      expect(loadout[SLOT_GUN].state, id).toEqual({ n: 1, reloadMsLeft: 0 }); // single-shot gun pool
      expect(loadout[SLOT_BOOST].state, id).toEqual({ n: equipmentMaxAmmo(stats, 'speedBoost'), reloadMsLeft: 0 });
      expect(loadout[SLOT_BOOST].state, id).toEqual({ n: CONFIG.speedBoost.maxAmmo, reloadMsLeft: 0 });
    }
  });

  it('EVERY captain hull boosts now (amendment 23 — it was a Torpedo Boat privilege)', () => {
    for (const id of SHIP_CLASS_IDS) {
      expect(loadoutFor(statsFor(id))[SLOT_BOOST].equipmentId, id).toBe('speedBoost');
    }
  });

  it('the weapon row and the consumable belt start EMPTY on every captain hull', () => {
    for (const id of SHIP_CLASS_IDS) {
      const loadout = loadoutFor(statsFor(id));
      for (const i of [...WEAPON_SLOTS, ...CONSUMABLE_SLOTS]) {
        expect(loadout[i], `${id}:${i}`).toEqual({ equipmentId: null, state: null });
      }
    }
  });

  it('fleet === true is the gun-only drone fit: [gun, empty ×8] (amendments 34 / 24)', () => {
    for (const id of HULL_IDS) {
      const loadout = loadoutFor(statsFor(id), true);
      expect(loadout.map((s) => s.equipmentId), id).toEqual([
        'gun', null, null, null, null, null, null, null, null,
      ]);
      expect(loadout[SLOT_GUN].state, id).toEqual({ n: 1, reloadMsLeft: 0 });
    }
  });

  it('is SLOT_COUNT slots with the gun in slot 0 on every hull id, captain or fleet', () => {
    for (const id of HULL_IDS) {
      for (const fleet of [false, true]) {
        const loadout = loadoutFor(statsFor(id), fleet);
        expect(loadout, `${id}/${String(fleet)}`).toHaveLength(SLOT_COUNT);
        expect(loadout[SLOT_GUN].equipmentId).toBe('gun');
        expect(loadout[SLOT_GUN].state).toEqual({ n: 1, reloadMsLeft: 0 });
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

describe('equipmentMaxAmmo / equipmentReloadMs cover speedBoost (from stats.boost)', () => {
  it('speedBoost pool + reload come from CONFIG.speedBoost', () => {
    const stats = statsFor('torpedoBoat');
    expect(equipmentMaxAmmo(stats, 'speedBoost')).toBe(stats.equipment.speedBoost.maxAmmo);
    expect(equipmentMaxAmmo(stats, 'speedBoost')).toBe(CONFIG.speedBoost.maxAmmo);
    expect(equipmentReloadMs(stats, 'speedBoost')).toBe(stats.equipment.speedBoost.reloadMs);
    expect(equipmentReloadMs(stats, 'speedBoost')).toBe(CONFIG.speedBoost.reloadMs);
  });
});

describe('equipmentMaxAmmo / equipmentReloadMs cover broadside + starShells', () => {
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

describe('equipmentMaxAmmo / equipmentReloadMs cover radarBuoy (Story 7-5 wave 2)', () => {
  it('radarBuoy pool + reload come from CONFIG.radarBuoy (via stats.radarBuoy)', () => {
    const stats = statsFor('mineLayer');
    expect(equipmentMaxAmmo(stats, 'radarBuoy')).toBe(stats.equipment.radarBuoy.maxAmmo);
    expect(equipmentMaxAmmo(stats, 'radarBuoy')).toBe(CONFIG.radarBuoy.maxAmmo);
    expect(equipmentReloadMs(stats, 'radarBuoy')).toBe(stats.equipment.radarBuoy.reloadMs);
    expect(equipmentReloadMs(stats, 'radarBuoy')).toBe(CONFIG.radarBuoy.reloadMs);
  });
});

describe('LoadoutSlot invariant — state is null iff equipmentId is null', () => {
  it('holds for every slot across every hull id', () => {
    for (const id of HULL_IDS) {
      for (const fleet of [false, true]) {
        const loadout: LoadoutSlot[] = loadoutFor(statsFor(id), fleet);
        expect(loadout).toHaveLength(SLOT_COUNT); // all NINE slots, not just the fitted head
        for (const slot of loadout) {
          expect(slot.state === null).toBe(slot.equipmentId === null);
        }
      }
    }
  });
});
