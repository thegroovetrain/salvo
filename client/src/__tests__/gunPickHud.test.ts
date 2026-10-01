// Story 8.15 — the gun pick and the class Shifts on the HUD bar (Eric rulings
// 2026-09-28, epic-8 amendments 97–110): the four draft glyphs exist, the
// tooltip names are the ruled ones (the plain gun is `Cannon`, amendment 108),
// the gun square's tier reads the MOUNTED gun's own fold, the held-fire drain
// (UX-DR52) lights only while the machine gun streams, and DAMAGE CUT takes the
// boost's ACTIVE grammar (amendment 34).

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  SLOT_BOOST,
  SLOT_COUNT,
  SLOT_GUN,
  effectiveStats,
  equipmentMaxAmmo,
  gunReachU as sharedGunReachU,
  type EffectiveStats,
  type SlotItemId,
  type WeaponAmmo,
} from '@salvo/shared';
import { glyphPaths } from '../render/equipmentIcons.js';
import {
  EQUIPMENT_NAME,
  equipmentDamage,
  interactionLine,
  slotTier,
} from '../render/equipmentInfo.js';
import {
  HELD_DRAIN_ALPHA,
  drainRect,
  heldDrainFrac,
  slotViewModels,
  type HotbarView,
} from '../render/hotbar.js';
import { equipmentStatRows, statValueText } from '../ui/boonCopy.js';
import { fireArcKind, weaponRangeU, weaponReachU } from '../render/weaponArc.js';
import { computeAimPreview, ownBurstRadius, type AimPreviewInput } from '../render/aimPreview.js';

function nine<T>(v: T): T[] {
  return Array.from({ length: SLOT_COUNT }, () => v);
}

function stats(cards: readonly string[] = []): EffectiveStats {
  return effectiveStats(CONFIG.shipClasses.battleship, cards);
}

/** A bare nine-slot view: `gun` in slot 0 and `shift` in slot 1, full pools. */
function view(gun: SlotItemId, shift: SlotItemId, over: Partial<HotbarView> = {}): HotbarView {
  const s = stats();
  const loadout: (SlotItemId | null)[] = [gun, shift, ...nine<SlotItemId | null>(null).slice(2)];
  const ammo: (WeaponAmmo | null)[] = loadout.map((id) =>
    id === null ? null : { n: equipmentMaxAmmo(s, id as never), reloadMsLeft: 0 },
  );
  return { loadout, ammo, stats: s, primedSlot: SLOT_GUN, denied: nine(false), activated: nine(false), dim: false, ...over };
}

describe('the four new glyphs (amendment 110 — implementer drafts)', () => {
  it('machineGun, flak, instantReload and damageCut each draw linework inside the unit frame', () => {
    for (const id of ['machineGun', 'flak', 'instantReload', 'damageCut']) {
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

  it('no two of the four share a drawing, and none copies the cannon or the star shell', () => {
    const ids = ['gun', 'starShells', 'boost', 'machineGun', 'flak', 'instantReload', 'damageCut'];
    const drawn = ids.map((id) => JSON.stringify(glyphPaths(id)));
    expect(new Set(drawn).size).toBe(ids.length);
  });

  it('the CUT ids have no glyph (missile, monitor)', () => {
    expect(glyphPaths('missile')).toBeNull();
    expect(glyphPaths('monitor')).toBeNull();
  });
});

describe('the ruled names (amendments 107/108)', () => {
  it('the plain gun is Cannon, and the two guns and two Shifts carry their names', () => {
    expect(EQUIPMENT_NAME.gun).toBe('Cannon');
    expect(EQUIPMENT_NAME.machineGun).toBe('Machine Gun');
    expect(EQUIPMENT_NAME.flak).toBe('Flak');
    expect(EQUIPMENT_NAME.instantReload).toBe('Instant Reload');
    expect(EQUIPMENT_NAME.damageCut).toBe('Damage Cut');
    expect(Object.keys(EQUIPMENT_NAME)).not.toContain('missile');
    expect(Object.keys(EQUIPMENT_NAME)).not.toContain('monitor');
  });

  // CYCLE 157 (amendment 178): the Shifts' prose descriptions are DELETED; their
  // hover prints stat lines, every number off CONFIG / the fold.
  it('the two Shifts\' stat lines read their numbers off CONFIG, never a literal', () => {
    const lines = (id: 'instantReload' | 'damageCut') =>
      equipmentStatRows(id, stats()).map((r) => `${r.label} ${statValueText(r)}`);
    expect(lines('damageCut')).toEqual([
      `CUT ${Math.round((1 - CONFIG.damageCut.factor) * 100)}%`,
      `DURATION ${(CONFIG.damageCut.durationMs / 1000).toFixed(1)} s`,
      `RELOAD ${(CONFIG.damageCut.reloadMs / 1000).toFixed(1)} s`,
    ]);
    expect(lines('instantReload')).toEqual([`RELOAD ${(CONFIG.instantReload.reloadMs / 1000).toFixed(1)} s`]);
  });

  it('the Shifts deal no damage; the machine gun reports PER SHELL, the flak per burst victim', () => {
    const s = stats();
    expect(equipmentDamage(s, 'instantReload')).toBeNull();
    expect(equipmentDamage(s, 'damageCut')).toBeNull();
    expect(equipmentDamage(s, 'machineGun')).toBe(CONFIG.machineGun.damage);
    expect(equipmentDamage(s, 'flak')).toBe(CONFIG.flak.damage);
  });
});

describe('the gun family — the MOUNTED gun\'s tier', () => {
  it('slot 0 reads the MOUNTED gun\'s own ladder rung (1 + copies), and says so on hover', () => {
    const cards = ['machineGun', 'machineGun'];
    const s = stats(cards);
    expect(slotTier(s, cards, 'machineGun')).toBe(3);
    expect(slotTier(s, cards, 'gun')).toBe(1); // the cannon's ladder is untouched
    expect(interactionLine(SLOT_GUN, 'machineGun', cards, 0, s)).toBe('WEAPON · ALWAYS SELECTED · TIER III');
    expect(interactionLine(SLOT_GUN, 'flak', ['flak'], 0, stats(['flak']))).toBe('WEAPON · ALWAYS SELECTED · TIER II');
    // No stats, no number: the fold is the only place a gun's rung lives.
    expect(interactionLine(SLOT_GUN, 'machineGun', cards)).toBe('WEAPON · ALWAYS SELECTED');
  });

});

describe('THE HELD-FIRE DRAIN (UX-DR52)', () => {
  it('lights ONLY on the gun square holding the machine gun, while held, with shells left', () => {
    const max = equipmentMaxAmmo(stats(), 'machineGun');
    const live = view('machineGun', 'damageCut', { held: true });
    live.ammo = [{ n: 10, reloadMsLeft: 0 }, ...live.ammo.slice(1)];
    expect(heldDrainFrac(live, SLOT_GUN)).toBeCloseTo(10 / max, 9);
    expect(slotViewModels(live)[SLOT_GUN].drain).toBeCloseTo(10 / max, 9);
    // Never from the pointer level alone:
    expect(heldDrainFrac({ ...live, held: false }, SLOT_GUN)).toBeNull();
    expect(heldDrainFrac({ ...live, held: undefined }, SLOT_GUN)).toBeNull();
    // ...never on another slot:
    expect(heldDrainFrac(live, SLOT_BOOST)).toBeNull();
    // ...never for the cannon or the flak gun:
    expect(heldDrainFrac(view('gun', 'damageCut', { held: true }), SLOT_GUN)).toBeNull();
    expect(heldDrainFrac(view('flak', 'damageCut', { held: true }), SLOT_GUN)).toBeNull();
    // ...never while ANOTHER slot is primed (the stream fires only with the
    // gun selected — Eric 2026-09-29; the held pointer is that slot's hold):
    expect(heldDrainFrac({ ...live, primedSlot: 2 }, SLOT_GUN)).toBeNull();
    expect(slotViewModels({ ...live, primedSlot: 2 })[SLOT_GUN].drain).toBeNull();
    // ...and never on an EMPTY magazine (the cooling wipe owns that square):
    const empty = { ...live, ammo: [{ n: 0, reloadMsLeft: 9000 }, ...live.ammo.slice(1)] };
    expect(heldDrainFrac(empty, SLOT_GUN)).toBeNull();
  });

  it('a full magazine reads 1 — the fill starts at the whole square', () => {
    expect(heldDrainFrac(view('machineGun', 'boost', { held: true }), SLOT_GUN)).toBe(1);
  });

  it('the fill is anchored on the FLOOR, full width, frac of the height (clamped)', () => {
    const sq = { x: 100, y: 40, w: 54, h: 54 };
    expect(drainRect(sq, 1)).toEqual({ x: 100, y: 40, w: 54, h: 54 });
    expect(drainRect(sq, 0.5)).toEqual({ x: 100, y: 67, w: 54, h: 27 });
    expect(drainRect(sq, 0)).toEqual({ x: 100, y: 94, w: 54, h: 0 });
    expect(drainRect(sq, 2)).toEqual(drainRect(sq, 1));
    expect(drainRect(sq, -1)).toEqual(drainRect(sq, 0));
    expect(HELD_DRAIN_ALPHA).toBe(0.16); // DESIGN.md hotbar-slot heldFire
  });
});

describe('DAMAGE CUT takes the boost\'s ACTIVE grammar (amendment 34)', () => {
  it('a running cut window makes the Shift square ACTIVE with its seconds', () => {
    const v = view('gun', 'damageCut', { activeMsLeft: [0, 6400, 0, 0, 0, 0, 0, 0, 0] });
    v.ammo = [v.ammo[0], { n: 0, reloadMsLeft: 28000 }, ...v.ammo.slice(2)];
    const m = slotViewModels(v)[SLOT_BOOST];
    expect(m.state).toBe('active'); // ACTIVE outranks the cooldown that started with it
    expect(m.activeMsLeft).toBe(6400);
  });

  it('INSTANT RELOAD has no window: a spent charge goes straight to the cooling wipe', () => {
    const v = view('gun', 'instantReload');
    v.ammo = [v.ammo[0], { n: 0, reloadMsLeft: 40000 }, ...v.ammo.slice(2)];
    expect(slotViewModels(v)[SLOT_BOOST].state).toBe('cooling');
  });
});


// STORY 8.15 — the two pickable guns aim off their OWN rows, and no gun has an
// arc (amendment 106): slot 0 never draws a wedge.
describe('the machine gun and the flak gun — aim and reach (Story 8.15)', () => {
  it('both are 360 gun-likes: never a wedge, never out of arc', () => {
    expect(fireArcKind('machineGun')).toBe('gunLike');
    expect(fireArcKind('flak')).toBe('gunLike');
  });

  it('weaponRangeU reads each gun\'s own row (the radar rung today, 660 u)', () => {
    const s = stats();
    expect(weaponRangeU(s, 'machineGun')).toBe(s.equipment.machineGun.rangeU);
    expect(weaponRangeU(s, 'flak')).toBe(s.equipment.flak.rangeU);
    expect(weaponRangeU(s, 'machineGun')).toBe(CONFIG.vision.radar);
  });

  const base = (id: 'machineGun' | 'flak' | 'gun'): AimPreviewInput => ({
    id,
    ship: { x: 0, y: 0, heading: 0, cls: 'battleship' },
    aim: 0,
    aimDist: 300,
    stats: stats(),
    mapRadius: 5000,
    islands: [],
    legal: true,
  });

  it('the MACHINE GUN previews its travel line and NO ring (a direct-hit gun)', () => {
    const m = computeAimPreview(base('machineGun'));
    expect(m.lines).toHaveLength(1);
    expect(m.bursts).toEqual([]);
  });

  it('the FLAK GUN previews one shell bursting at the click in its fixed 50 u blast', () => {
    const m = computeAimPreview(base('flak'));
    expect(m.lines).toHaveLength(1);
    expect(m.bursts).toHaveLength(1);
    expect(m.bursts[0].r).toBe(CONFIG.flak.burstRadius);
    expect(m.bursts[0].x).toBeCloseTo(300, 6);
  });

  it('our own flak burst rings at the flak gun\'s radius; the machine gun never bursts', () => {
    expect(ownBurstRadius(stats(), 'flak')).toBe(CONFIG.flak.burstRadius);
    expect(ownBurstRadius(stats(), 'machineGun')).toBeUndefined();
  });
});

// EVERY DECK GUN FIRES INTO ITS OWN LIT-UP AREA (Eric ruling 2026-09-29,
// amendment 114): R2.15's reach extension applies to the machine gun and the
// flak gun exactly as to the cannon, on both sides. The client resolves the
// reach ONCE through weaponReachU (the shared gunReachU off each gun's OWN row)
// and hands it to the range-clamp marker and the preview, so the preview shows
// the extended reach into the player's own flare — and clamps at 660 u under an
// enemy's flare or none (ownActiveZones never hands the client an enemy zone).
describe('the machine gun and the flak gun reach into their own flare (amendment 114)', () => {
  const OWN_ZONE = [{ x: 800, y: 0, r: 120 }];
  const SHIP = { x: 0, y: 0 };
  const MAP_R = 5000;

  it('weaponReachU lifts BOTH guns to an 800 u click inside an own live zone, and clamps to 660 u without one', () => {
    const s = stats();
    for (const id of ['machineGun', 'flak'] as const) {
      expect(s.equipment[id].rangeU, id).toBe(660);
      expect(weaponReachU(s, id, SHIP, 0, 800, MAP_R, OWN_ZONE), id).toBe(800);
      expect(weaponReachU(s, id, SHIP, 0, 800, MAP_R, []), id).toBe(660);
      expect(weaponReachU(s, id, SHIP, 0, 300, MAP_R, OWN_ZONE), id).toBe(660); // in range: the base
    }
  });

  it('IS the shared gunReachU off each gun\'s OWN row — the parity the server fires with', () => {
    const s = stats();
    const cases: [number, { x: number; y: number; r: number }[]][] = [
      [300, OWN_ZONE], [800, OWN_ZONE], [800, []], [1200, OWN_ZONE], [NaN, OWN_ZONE],
    ];
    for (const id of ['gun', 'machineGun', 'flak'] as const) {
      for (const [d, zones] of cases) {
        expect(weaponReachU(s, id, SHIP, 0, d, MAP_R, zones), `${id} d=${d}`)
          .toBe(sharedGunReachU(SHIP, 0, d, s.equipment[id].rangeU, MAP_R, zones));
      }
    }
  });

  it('the preview carries the lifted reach: the MG line and the flak burst land at 800 u', () => {
    const at = (id: 'machineGun' | 'flak', reach: number) =>
      computeAimPreview({
        id, ship: { x: 0, y: 0, heading: 0, cls: 'battleship' }, aim: 0, aimDist: 800,
        stats: stats(), mapRadius: MAP_R, islands: [], legal: true, gunReachU: reach,
      });
    expect(at('machineGun', 800).lines[0].x2).toBeCloseTo(800, 6);
    expect(at('flak', 800).bursts[0].x).toBeCloseTo(800, 6);
    // Not lifted (an enemy's flare, or none): the 660 u clamp.
    expect(at('machineGun', 660).lines[0].x2).toBeCloseTo(660, 6);
    expect(at('flak', 660).bursts[0].x).toBeCloseTo(660, 6);
  });
});
