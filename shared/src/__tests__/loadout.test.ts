// Pins the shared loadout spine: the slot grammar constants, the
// state-null-iff-equipmentId-null invariant, and the per-hull fit (Stories
// 1.6–1.8, 5.6). loadoutFor builds from a REAL effectiveStats() so pool sizes
// match what the server writes on spawn/respawn/redeploy: the Torpedo Boat
// fits [gun, torpedo, speedBoost, empty]; the Battleship fits
// [gun, broadside, starShells, empty]; the Mine Layer fits
// [gun, mine, radarBuoy, empty] (Story 7-5 wave 2); a PvE fleet hull fits
// [gun, empty, empty, empty] (Story 5.6, amendment 34 — gun-only self-defence
// fit, superseding the old universal [gun, torpedo, mine, empty]). Also pins
// the EQUIPMENT_IS_WEAPON split — the single source server rows and the
// client activation path read. Pure, zero I/O.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  HULL_IDS,
  SHIP_CLASS_IDS,
  SLOT_COUNT,
  SLOT_GUN,
  SLOT_EXTRA,
  SLOT_ROLES,
  EQUIPMENT_IS_WEAPON,
  effectiveStats,
  equipmentMaxAmmo,
  equipmentReloadMs,
  hullEnvelope,
  loadoutFor,
  type EffectiveStats,
  type EquipmentId,
  type HullId,
  type LoadoutSlot,
} from '../index.js';

/** Fresh effective stats for any hull id at zero boons. */
function statsFor(id: HullId): EffectiveStats {
  return effectiveStats(hullEnvelope(id));
}

/** The two specials each PICKABLE class fits under the per-hull rule (1.6–1.8).
 *  PvE fleet hulls fit no specials at all (amendment 34) and are excluded —
 *  see the dedicated drone-fit assertions below. */
function expectedSpecials(id: HullId): [EquipmentId, EquipmentId] {
  if (id === 'torpedoBoat') return ['torpedo', 'speedBoost'];
  if (id === 'battleship') return ['broadside', 'starShells'];
  return ['mine', 'radarBuoy']; // mineLayer
}

describe('slot-grammar constants', () => {
  it('SLOT_COUNT is 4, SLOT_GUN 0, SLOT_EXTRA 3', () => {
    expect(SLOT_COUNT).toBe(4);
    expect(SLOT_GUN).toBe(0);
    expect(SLOT_EXTRA).toBe(3);
  });

  it('SLOT_ROLES is [gun, special, special, extra] and its length matches SLOT_COUNT', () => {
    expect(SLOT_ROLES).toEqual(['gun', 'special', 'special', 'extra']);
    expect(SLOT_ROLES).toHaveLength(SLOT_COUNT);
    expect(SLOT_ROLES[SLOT_GUN]).toBe('gun');
    expect(SLOT_ROLES[SLOT_EXTRA]).toBe('extra');
  });
});

describe('EQUIPMENT_IS_WEAPON — the weapon/ability split', () => {
  it('marks every aimed-click weapon true; speedBoost is now the ONLY ability', () => {
    // FLIPPED PIN (amendment 45): the mine is a click-aimed rear-arc WEAPON
    // again — prime, aim within CONFIG.mine.offset ± placeHalfArcDeg, click
    // places at the point up to placeRange. Supersedes the 1.8 stern drop.
    // FLIPPED AGAIN, Story 7-5 wave 2 (R2.7): the RADAR BUOY replacing the
    // decoy is click-placed in that same rear sector, so it left the actSeq
    // ability channel for the fireSeq weapon channel — which leaves the speed
    // boost as the last instant activation in the game.
    expect(EQUIPMENT_IS_WEAPON).toEqual({
      gun: true,
      torpedo: true,
      mine: true, // Story 2.8: click-aimed rear-arc placement (amendment 45)
      speedBoost: false,
      broadside: true, // Story 7-5 wave 2: prime-then-click twin-sector barrage
      starShells: true, // Story 1.7: prime-then-click lit-zone flare
      radarBuoy: true, // Story 7-5 wave 2: click-placed in the mine's rear sector
    });
  });

  it('every value is a boolean (runtime completeness over EquipmentId)', () => {
    for (const value of Object.values(EQUIPMENT_IS_WEAPON)) {
      expect(typeof value).toBe('boolean');
    }
  });
});

describe('loadoutFor — the per-hull fit (Stories 1.6–1.7)', () => {
  it('the Torpedo Boat fits [gun, torpedo, speedBoost, empty]', () => {
    const stats = statsFor('torpedoBoat');
    const loadout = loadoutFor('torpedoBoat', stats);
    expect(loadout.map((s) => s.equipmentId)).toEqual(['gun', 'torpedo', 'speedBoost', null]);
    expect(loadout[2].state).toEqual({ n: equipmentMaxAmmo(stats, 'speedBoost'), reloadMsLeft: 0 });
    expect(loadout[2].state).toEqual({ n: CONFIG.speedBoost.maxAmmo, reloadMsLeft: 0 });
  });

  it('the Battleship fits [gun, broadside, starShells, empty] (Story 7-5 wave 2)', () => {
    const stats = statsFor('battleship');
    const loadout = loadoutFor('battleship', stats);
    expect(loadout.map((s) => s.equipmentId)).toEqual(['gun', 'broadside', 'starShells', null]);
    expect(loadout[1].state).toEqual({ n: equipmentMaxAmmo(stats, 'broadside'), reloadMsLeft: 0 });
    expect(loadout[1].state).toEqual({ n: CONFIG.broadside.maxAmmo, reloadMsLeft: 0 });
    expect(loadout[2].state).toEqual({ n: equipmentMaxAmmo(stats, 'starShells'), reloadMsLeft: 0 });
    expect(loadout[2].state).toEqual({ n: CONFIG.starShells.maxAmmo, reloadMsLeft: 0 });
  });

  it('the Mine Layer fits [gun, mine, radarBuoy, empty] (Story 7-5 wave 2)', () => {
    const stats = statsFor('mineLayer');
    const loadout = loadoutFor('mineLayer', stats);
    expect(loadout.map((s) => s.equipmentId)).toEqual(['gun', 'mine', 'radarBuoy', null]);
    expect(loadout[1].state).toEqual({ n: equipmentMaxAmmo(stats, 'mine'), reloadMsLeft: 0 });
    expect(loadout[1].state).toEqual({ n: CONFIG.mine.maxAmmo, reloadMsLeft: 0 });
    expect(loadout[2].state).toEqual({ n: equipmentMaxAmmo(stats, 'radarBuoy'), reloadMsLeft: 0 });
    expect(loadout[2].state).toEqual({ n: CONFIG.radarBuoy.maxAmmo, reloadMsLeft: 0 });
  });

  it('every PvE fleet hull fits gun-only [gun, empty, empty, empty] (Story 5.6, amendment 34 — was the universal [gun, torpedo, mine, empty])', () => {
    for (const id of HULL_IDS) {
      if (id === 'torpedoBoat' || id === 'battleship' || id === 'mineLayer') continue;
      const loadout = loadoutFor(id, statsFor(id));
      expect(loadout.map((s) => s.equipmentId)).toEqual(['gun', null, null, null]);
    }
  });

  it('the specials match the per-hull rule on every PICKABLE class — with class-correct pools', () => {
    for (const id of SHIP_CLASS_IDS) {
      const stats = statsFor(id);
      const loadout = loadoutFor(id, stats);
      const [slotOne, slotTwo] = expectedSpecials(id);
      expect(loadout[1].equipmentId).toBe(slotOne);
      expect(loadout[1].state!.n).toBe(equipmentMaxAmmo(stats, slotOne));
      expect(loadout[2].equipmentId).toBe(slotTwo);
      expect(loadout[2].state!.n).toBe(equipmentMaxAmmo(stats, slotTwo));
    }
  });

  it('is 4 slots, gun single-shot pool, empty extra, on every hull id', () => {
    for (const id of HULL_IDS) {
      const stats = statsFor(id);
      const loadout = loadoutFor(id, stats);
      expect(loadout).toHaveLength(SLOT_COUNT);
      expect(loadout[SLOT_GUN].equipmentId).toBe('gun');
      expect(loadout[SLOT_GUN].state).toEqual({ n: 1, reloadMsLeft: 0 });
      expect(loadout[SLOT_EXTRA]).toEqual({ equipmentId: null, state: null });
    }
  });

  it('fitted weapon/ability slots start with a full pool from equipmentMaxAmmo', () => {
    for (const id of SHIP_CLASS_IDS) {
      const stats = statsFor(id);
      const loadout = loadoutFor(id, stats);
      for (let i = 0; i < SLOT_EXTRA; i++) {
        const equipmentId = loadout[i].equipmentId!;
        expect(loadout[i].state).toEqual({ n: equipmentMaxAmmo(stats, equipmentId), reloadMsLeft: 0 });
      }
    }
  });
});

describe('equipmentMaxAmmo / equipmentReloadMs cover speedBoost (from stats.boost)', () => {
  it('speedBoost pool + reload come from CONFIG.speedBoost', () => {
    const stats = statsFor('torpedoBoat');
    expect(equipmentMaxAmmo(stats, 'speedBoost')).toBe(stats.boost.maxAmmo);
    expect(equipmentMaxAmmo(stats, 'speedBoost')).toBe(CONFIG.speedBoost.maxAmmo);
    expect(equipmentReloadMs(stats, 'speedBoost')).toBe(stats.boost.reloadMs);
    expect(equipmentReloadMs(stats, 'speedBoost')).toBe(CONFIG.speedBoost.reloadMs);
  });
});

describe('equipmentMaxAmmo / equipmentReloadMs cover broadside + starShells', () => {
  it('broadside pool + reload come from CONFIG.broadside (via stats.broadside)', () => {
    const stats = statsFor('battleship');
    expect(equipmentMaxAmmo(stats, 'broadside')).toBe(stats.broadside.maxAmmo);
    expect(equipmentMaxAmmo(stats, 'broadside')).toBe(CONFIG.broadside.maxAmmo);
    expect(equipmentReloadMs(stats, 'broadside')).toBe(stats.broadside.reloadMs);
    expect(equipmentReloadMs(stats, 'broadside')).toBe(CONFIG.broadside.reloadMs);
  });

  it('starShells pool + reload come from CONFIG.starShells (via stats.starShells)', () => {
    const stats = statsFor('battleship');
    expect(equipmentMaxAmmo(stats, 'starShells')).toBe(stats.starShells.maxAmmo);
    expect(equipmentMaxAmmo(stats, 'starShells')).toBe(CONFIG.starShells.maxAmmo);
    expect(equipmentReloadMs(stats, 'starShells')).toBe(stats.starShells.reloadMs);
    expect(equipmentReloadMs(stats, 'starShells')).toBe(CONFIG.starShells.reloadMs);
  });
});

describe('equipmentMaxAmmo / equipmentReloadMs cover radarBuoy (Story 7-5 wave 2)', () => {
  it('radarBuoy pool + reload come from CONFIG.radarBuoy (via stats.radarBuoy)', () => {
    const stats = statsFor('mineLayer');
    expect(equipmentMaxAmmo(stats, 'radarBuoy')).toBe(stats.radarBuoy.maxAmmo);
    expect(equipmentMaxAmmo(stats, 'radarBuoy')).toBe(CONFIG.radarBuoy.maxAmmo);
    expect(equipmentReloadMs(stats, 'radarBuoy')).toBe(stats.radarBuoy.reloadMs);
    expect(equipmentReloadMs(stats, 'radarBuoy')).toBe(CONFIG.radarBuoy.reloadMs);
  });
});

describe('LoadoutSlot invariant — state is null iff equipmentId is null', () => {
  it('holds for every slot across every hull id', () => {
    for (const id of HULL_IDS) {
      const loadout: LoadoutSlot[] = loadoutFor(id, statsFor(id));
      for (const slot of loadout) {
        expect(slot.state === null).toBe(slot.equipmentId === null);
      }
    }
  });
});
