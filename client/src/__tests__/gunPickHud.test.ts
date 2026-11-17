// Story 8.15 — the class Shifts on the HUD bar (Eric rulings 2026-09-28,
// epic-8 amendments 97–110): the Shift glyphs exist, their tooltip names are
// the ruled ones, and HUNKER (was DAMAGE CUT until Story 9.9) takes the boost's
// ACTIVE grammar (amendment 34).
//
// STORY 10.4 retired the seat's GUN PICK (the machine gun / flak gun on slot
// 0): every captain now mounts the hull's MAIN BATTERY there. What survives
// here is the Shift, and the main battery's glyph, name and pool (the hull's
// turret count). Story 10.10 retired the squares; the per-turret clocks are
// consoleReadouts.test.ts's.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  LINE_IDS,
  SHIP_CLASS_IDS,
  effectiveStats,
  equipmentMaxAmmo,
  initialTurrets,
  type EffectiveStats,
  type ShipClassId,
} from '@salvo/shared';
import { glyphPaths } from '../render/equipmentIcons.js';
import { EQUIPMENT_NAME, equipmentDamage } from '../render/equipmentInfo.js';
import { abilityModel } from '../render/console/readouts.js';
import { fireArcKind, weaponRangeU } from '../render/weaponArc.js';

function stats(cls: ShipClassId = SHIP_CLASS_IDS[0], cards: readonly string[] = []): EffectiveStats {
  return effectiveStats(CONFIG.shipClasses[cls], cards);
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
});

describe('HUNKER takes the boost\'s ACTIVE grammar (amendment 34)', () => {
  // Story 10.10: the Shift square retired into the weapons console's Shift
  // ability button; the grammar is the button's (render/console/readouts.ts).
  function shiftButton(shift: 'hunker' | 'instantReload', reloadMsLeft: number, activeMsLeft: number) {
    return abilityModel('shift', {
      stats: stats(), cards: [], shift, nowMs: undefined, repairReadyAt: undefined, smokeReadyAt: undefined,
      shiftAmmo: { n: 0, reloadMsLeft }, shiftActiveMsLeft: activeMsLeft,
    });
  }

  it('a running cut window makes the Shift button ACTIVE with its seconds', () => {
    const m = shiftButton('hunker', 28000, 6400);
    expect(m.state).toBe('active'); // ACTIVE outranks the cooldown that started with it
    expect(m.msLeft).toBe(6400);
  });

  it('INSTANT RELOAD has no window: a spent charge goes straight to cooling', () => {
    expect(shiftButton('instantReload', 40000, 0).state).toBe('cooling');
  });
});
