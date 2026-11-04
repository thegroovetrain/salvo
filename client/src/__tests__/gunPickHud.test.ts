// Story 8.15 — the class Shifts on the HUD bar (Eric rulings 2026-09-28,
// epic-8 amendments 97–110): the Shift glyphs exist, their tooltip names are
// the ruled ones, and HUNKER (was DAMAGE CUT until Story 9.9) takes the boost's
// ACTIVE grammar (amendment 34).
//
// STORY 10.4 retired the seat's GUN PICK (the machine gun / flak gun on slot
// 0): every captain now mounts the hull's MAIN BATTERY there. What survives
// here is the Shift square, and the main battery's slot-0 square — its glyph
// and name resolve, its pool is the hull's turret count, and `ammo[0]` (the
// battery SUMMARY: turrets ready + the soonest reload) drives the ordinary
// badge / cooling grammar.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  DEFAULT_KIT,
  LINE_IDS,
  SHIP_CLASS_IDS,
  SLOT_BOOST,
  SLOT_COUNT,
  SLOT_GUN,
  effectiveStats,
  equipmentMaxAmmo,
  initialTurrets,
  type EffectiveStats,
  type ShipClassId,
  type SlotItemId,
  type WeaponAmmo,
} from '@salvo/shared';
import { glyphPaths } from '../render/equipmentIcons.js';
import { EQUIPMENT_NAME, equipmentDamage } from '../render/equipmentInfo.js';
import { slotViewModels, type HotbarView } from '../render/hotbar.js';
import { fireArcKind, weaponRangeU } from '../render/weaponArc.js';

function nine<T>(v: T): T[] {
  return Array.from({ length: SLOT_COUNT }, () => v);
}

function stats(cls: ShipClassId = SHIP_CLASS_IDS[0], cards: readonly string[] = []): EffectiveStats {
  return effectiveStats(CONFIG.shipClasses[cls], cards);
}

/** A bare nine-slot view: the main battery in slot 0 and `shift` in slot 1, full pools. */
function view(shift: SlotItemId, over: Partial<HotbarView> = {}, cls: ShipClassId = SHIP_CLASS_IDS[0]): HotbarView {
  const s = stats(cls);
  const loadout: (SlotItemId | null)[] = ['mainBattery', shift, ...nine<SlotItemId | null>(null).slice(2)];
  const ammo: (WeaponAmmo | null)[] = loadout.map((id) =>
    id === null ? null : { n: equipmentMaxAmmo(s, id as never), reloadMsLeft: 0 },
  );
  return { loadout, kit: DEFAULT_KIT, ammo, stats: s, primedSlot: SLOT_GUN, denied: nine(false), activated: nine(false), dim: false, ...over };
}

describe('the Shift glyphs (amendment 110 — implementer drafts)', () => {
  it('instantReload and hunker each draw linework inside the unit frame', () => {
    for (const id of ['instantReload', 'hunker']) {
      const parts = glyphPaths(id);
      expect(parts, id).not.toBeNull();
      expect(parts!.length, id).toBeGreaterThan(0);
      for (const p of parts!) {
        const pts = p.kind === 'path' ? p.pts : [p.c];
        for (const [x, y] of pts) {
          expect(Math.abs(x), `${id} x`).toBeLessThanOrEqual(1 + 1e-9);
          expect(Math.abs(y), `${id} y`).toBeLessThanOrEqual(1 + 1e-9);
        }
      }
    }
  });

  // Cycle 162 (the icon pass): the set spans every glyphed CARD LINE too, so
  // no Shift may copy any line's drawing either. `deckGun` is left out because
  // it IS the cannon's glyph, and the stub `depthCharge` has none.
  it('no two Shifts share a drawing, and none copies the cannon, the star shell or any line', () => {
    const lines = LINE_IDS.filter((id) => id !== 'deckGun' && id !== 'depthCharge');
    const ids = [...new Set(['gun', 'starShells', 'boost', 'instantReload', 'hunker', ...lines])];
    const drawn = ids.map((id) => JSON.stringify(glyphPaths(id)));
    expect(new Set(drawn).size).toBe(ids.length);
  });

  it('the CUT ids have no glyph (missile, monitor)', () => {
    expect(glyphPaths('missile')).toBeNull();
    expect(glyphPaths('monitor')).toBeNull();
  });
});

describe('the ruled names (amendments 107/108)', () => {
  it('the two Shifts each carry a name, and the CUT ids carry none', () => {
    for (const id of ['instantReload', 'hunker'] as const) {
      expect(EQUIPMENT_NAME[id].trim(), id).not.toBe('');
    }
    expect(Object.keys(EQUIPMENT_NAME)).not.toContain('missile');
    expect(Object.keys(EQUIPMENT_NAME)).not.toContain('monitor');
  });

  it('the Shifts deal no damage', () => {
    const s = stats();
    expect(equipmentDamage(s, 'instantReload')).toBeNull();
    expect(equipmentDamage(s, 'hunker')).toBeNull();
  });
});

// STORY 10.4: slot 0 is the MAIN BATTERY. Its name and glyph are the cannon's
// (it fires cannon shells), its damage is its own row's, and it is a full-arc
// gun that never draws a wedge.
describe('the main battery on slot 0 (Story 10.4)', () => {
  it('resolves a name and a glyph — the cannon\'s', () => {
    expect(EQUIPMENT_NAME.mainBattery).toBe(EQUIPMENT_NAME.gun);
    expect(glyphPaths('mainBattery')).not.toBeNull();
    expect(JSON.stringify(glyphPaths('mainBattery'))).toBe(JSON.stringify(glyphPaths('gun')));
  });

  it('reports its own row\'s damage, aims as a gun-like and reaches its own row\'s range', () => {
    for (const cls of SHIP_CLASS_IDS) {
      const s = stats(cls);
      expect(equipmentDamage(s, 'mainBattery'), cls).toBe(s.equipment.mainBattery.damage);
      expect(weaponRangeU(s, 'mainBattery'), cls).toBe(s.equipment.mainBattery.rangeU);
    }
    expect(fireArcKind('mainBattery')).toBe('gunLike');
  });

  it('its pool is the hull\'s TURRET COUNT, on every hull', () => {
    for (const cls of SHIP_CLASS_IDS) {
      const s = stats(cls);
      expect(equipmentMaxAmmo(s, 'mainBattery'), cls).toBe(initialTurrets(cls).length);
      expect(equipmentMaxAmmo(s, 'mainBattery'), cls).toBe(s.equipment.mainBattery.maxAmmo);
    }
  });

  it('the slot-0 square reads ammo[0] — the battery SUMMARY — through the ordinary pool grammar', () => {
    for (const cls of SHIP_CLASS_IDS) {
      const turrets = initialTurrets(cls).length;
      // All turrets ready: the badge counts them and the square is not cooling.
      const full = slotViewModels(view('boost', {}, cls))[SLOT_GUN];
      expect(full.id, cls).toBe('mainBattery');
      expect(full.badge, cls).toBe(String(turrets));
      expect(full.state, cls).not.toBe('cooling');
      // Some turrets reloading: the badge follows the ready count.
      const partial = view('boost', {}, cls);
      partial.ammo = [{ n: turrets - 1, reloadMsLeft: 4000 }, ...partial.ammo.slice(1)];
      expect(slotViewModels(partial)[SLOT_GUN].badge, cls).toBe(String(turrets - 1));
      // Every turret reloading: the cooling wipe with the soonest reload.
      const spent = view('boost', {}, cls);
      spent.ammo = [{ n: 0, reloadMsLeft: 4000 }, ...spent.ammo.slice(1)];
      const m = slotViewModels(spent)[SLOT_GUN];
      expect(m.state, cls).toBe('cooling');
      expect(m.reloadMsLeft, cls).toBe(4000);
    }
  });
});

describe('HUNKER takes the boost\'s ACTIVE grammar (amendment 34)', () => {
  it('a running cut window makes the Shift square ACTIVE with its seconds', () => {
    const v = view('hunker', { activeMsLeft: [0, 6400, 0, 0, 0, 0, 0, 0, 0] });
    v.ammo = [v.ammo[0], { n: 0, reloadMsLeft: 28000 }, ...v.ammo.slice(2)];
    const m = slotViewModels(v)[SLOT_BOOST];
    expect(m.state).toBe('active'); // ACTIVE outranks the cooldown that started with it
    expect(m.activeMsLeft).toBe(6400);
  });

  it('INSTANT RELOAD has no window: a spent charge goes straight to the cooling wipe', () => {
    const v = view('instantReload');
    v.ammo = [v.ammo[0], { n: 0, reloadMsLeft: 40000 }, ...v.ammo.slice(2)];
    expect(slotViewModels(v)[SLOT_BOOST].state).toBe('cooling');
  });
});
