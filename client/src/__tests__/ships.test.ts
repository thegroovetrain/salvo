// Ship hull styling (render/ships.ts) — Story 1.12 personal-hue resolution: the
// index → (bright stroke, darker fill) tables, the drone-greys + amber-hollow
// fallbacks, and the ShipView.setColors recolor path (own hull boots on the
// fallback and swaps to its hue once the roster syncs).

import { afterEach, describe, it, expect } from 'vitest';
import { CONFIG, DRONE_HULL_IDS, HULL_IDS, REGATTA_HUES, SHIP_CLASS_IDS, hullSilhouette } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import {
  PLAYER_HUES,
  PLAYER_FILLS,
  DRONE_STYLE,
  FALLBACK_STYLE,
  hullStyle,
  contactStyle,
  hullFlashIntensity,
  isDroneHull,
  setHullFlashGate,
  ShipView,
} from '../render/ships.js';
import { WorldFlashGate } from '../render/effects.js';
import { createFlashBudget } from '../render/flashBudget.js';
import { settings } from '../settings/store.js';

const C = CLIENT_CONFIG.colors;

describe('PLAYER_HUES / PLAYER_FILLS — index-aligned to the wheel', () => {
  it('are 20 entries each, matching the shared REGATTA_HUES order', () => {
    expect(PLAYER_HUES).toHaveLength(REGATTA_HUES.length);
    expect(PLAYER_FILLS).toHaveLength(REGATTA_HUES.length);
    REGATTA_HUES.forEach((name, i) => {
      expect(PLAYER_HUES[i]).toBe(C.players[name]);
      expect(PLAYER_FILLS[i]).toBe(C.playerFills[name]);
    });
  });
});

describe('hullStyle — personal hue or amber-hollow fallback', () => {
  it('resolves an index to its bright stroke + darker fill', () => {
    expect(hullStyle(8)).toEqual({ stroke: C.players.cyan, fill: C.playerFills.cyan }); // index 8 = cyan
  });

  it('falls back to amber-hollow for null / out-of-range', () => {
    expect(hullStyle(null)).toEqual(FALLBACK_STYLE);
    expect(hullStyle(-1)).toEqual(FALLBACK_STYLE);
    expect(hullStyle(20)).toEqual(FALLBACK_STYLE);
    expect(FALLBACK_STYLE).toEqual({ stroke: C.amber, fill: null });
  });
});

describe('contactStyle / isDroneHull — drones wear greys', () => {
  it('routes every drone hull id to the drone greys regardless of index', () => {
    for (const hull of ['droneSmall', 'droneMedium', 'droneLarge'] as const) {
      expect(isDroneHull(hull)).toBe(true);
      expect(contactStyle(hull, 5)).toEqual(DRONE_STYLE);
      expect(contactStyle(hull, null)).toEqual(DRONE_STYLE);
    }
    expect(DRONE_STYLE).toEqual({ stroke: C.droneOutline, fill: C.droneFill });
  });

  it('routes a pickable class to its personal hue (or fallback)', () => {
    expect(isDroneHull('battleship')).toBe(false);
    expect(contactStyle('battleship', 0)).toEqual({ stroke: C.players.lemon, fill: C.playerFills.lemon });
    expect(contactStyle('torpedoBoat', null)).toEqual(FALLBACK_STYLE);
  });
});

// --- STORY 6.3: THE CLIENT'S SECOND PREDICATE, PINNED -------------------------
//
// Epic-6 amendment 13. The server's non-combatant answer is a FIELD
// (`ShipRecord`'s ship-role seam) and that field is not on the wire — zero
// occurrences in `shared/` — so the client tests the HULL ID instead. Two
// independent predicates exist by necessity, and `deferred-work.md` has warned
// since Story 5.6 that they must be kept in step.
//
// These pins are what make "in step" enforceable. They are written against
// shared's own id tables rather than a literal list, so the failure mode is the
// one that matters: a hull id added SERVER-SIDE (a fourth drone size, a fourth
// pickable class) without a matching edit here fails a test rather than
// silently mis-classifying a ship on the water — a new drone hull would render
// in a personal hue and count as a contestant kill; a new class mistakenly
// admitted would lose its captain's hue to the greys.
//
// Story 6.4's AI captains do NOT move this: a bot carries a real class hull id,
// so it is a participant that is not a fleet hull, and it renders like any
// captain. That is exactly what the second pin below asserts.
describe('isDroneHull — pinned against the shared hull-id tables (amendment 13)', () => {
  it('admits EXACTLY the shared DRONE_HULL_IDS set, over every hull id that exists', () => {
    // Not "the three ids I remember" — every id shared declares, partitioned by
    // shared's own drone table. Adding an id to either table without teaching
    // this predicate about it breaks here.
    for (const id of HULL_IDS) {
      expect(isDroneHull(id)).toBe(DRONE_HULL_IDS.includes(id as (typeof DRONE_HULL_IDS)[number]));
    }
    expect(HULL_IDS.filter((id) => isDroneHull(id))).toEqual([...DRONE_HULL_IDS]);
    expect(DRONE_HULL_IDS).toHaveLength(3);
  });

  it('never admits a pickable ship class — the shape Story 6.4 relies on', () => {
    // A bot captain will carry one of these ids, which is why bots need no
    // change here: a participant that is not a fleet hull keeps its personal
    // hue, its nameplate and its kill-feed line.
    for (const id of SHIP_CLASS_IDS) {
      expect(isDroneHull(id)).toBe(false);
      expect(contactStyle(id, 8)).toEqual({ stroke: C.players.cyan, fill: C.playerFills.cyan });
    }
    expect(HULL_IDS).toHaveLength(SHIP_CLASS_IDS.length + DRONE_HULL_IDS.length);
  });
});

describe('ShipView.setColors — the recolor path', () => {
  it('constructs and recolors without throwing (own hull fallback → personal hue)', () => {
    const view = new ShipView(FALLBACK_STYLE, 'torpedoBoat');
    expect(() => view.setColors(C.players.cyan, C.playerFills.cyan)).not.toThrow();
    expect(() => view.setColors(C.amber, null)).not.toThrow(); // back to hollow fallback
    view.destroy();
  });
});

// --- STORY 4.8: THE HULL HIT FLASH'S BUDGET CLAIM ------------------------------
//
// The 130 ms hit flash is the game's worst stacking surface after the muzzle
// flashes — one burst lands on every hull inside its radius at once, and up to
// 20 hulls can flash in the same second. It claims against the client's ONE
// aggregate budget by the screen REGION of that hull, and an over-budget flash
// DEGRADES (a dimmer mark, same hull, same full 130 ms) rather than vanishing:
// a hull that took a hit and did not show it would be deleted information.

const FB = CLIENT_CONFIG.flashBudget;
/** World units ARE screen px on an 800x600 viewport (4x3 grid → 200x200 cells). */
const PROJECTOR = {
  worldToScreen: (p: { x: number; y: number }) => ({ x: p.x, y: p.y }),
  screenCenter: { x: 400, y: 300 },
};

function wireGate(now: () => number = () => 1_000): ReturnType<typeof createFlashBudget> {
  const budget = createFlashBudget();
  setHullFlashGate(new WorldFlashGate(budget, PROJECTOR, now));
  return budget;
}

/** A hull parked at a world point, ready to take a hit. */
function hullAt(x: number, y: number): ShipView {
  const v = new ShipView(FALLBACK_STYLE, 'torpedoBoat');
  v.update(x, y, 0);
  return v;
}

afterEach(() => {
  setHullFlashGate(null); // the module-level gate is shared state — always unwire
  settings.set({ motion: 'full' });
});

describe('hullFlashIntensity — the pure degrade', () => {
  it('spends the AMPLITUDE and nothing else', () => {
    expect(hullFlashIntensity(1, false)).toBe(1);
    expect(hullFlashIntensity(1, true)).toBeCloseTo(FB.degradeAlphaFactor, 10);
    // Composes multiplicatively with Story 2.3's `reduced` halving, which is
    // untouched: strength, never duration.
    expect(hullFlashIntensity(0.5, true)).toBeCloseTo(0.5 * FB.degradeAlphaFactor, 10);
    expect(hullFlashIntensity(1, true)).toBeGreaterThan(0); // a mark, never a deletion
  });
});

describe('the hull hit flash under a 20-hull stack', () => {
  it('claims per region, degrades past the floor, and still marks EVERY hull', () => {
    wireGate();
    const hulls = Array.from({ length: 20 }, (_, i) => hullAt(100 + i, 100)); // one region
    for (const h of hulls) h.flash();
    const now = performance.now();
    const lit = hulls.map((h) => h.flashIntensityAt(now));
    expect(lit.filter((v) => v === 1)).toHaveLength(FB.maxPerSecond); // the floor binds…
    for (const v of lit) expect(v).toBeGreaterThan(0); // …and nothing is deleted
    for (const v of lit.slice(FB.maxPerSecond)) expect(v).toBeCloseTo(FB.degradeAlphaFactor, 10);
    // The DURATION is untouched by the degrade — the flash still ends on time.
    for (const h of hulls) expect(h.flashIntensityAt(now + CLIENT_CONFIG.ship.flashMs + 1)).toBe(0);
    for (const h of hulls) h.destroy();
  });

  it('gives a hull in a quiet region its full flash while another region is saturated', () => {
    wireGate();
    const busy = Array.from({ length: 6 }, (_, i) => hullAt(100 + i, 100)); // r0:0
    for (const h of busy) h.flash();
    const quiet = hullAt(700, 500); // r3:2
    quiet.flash();
    expect(quiet.flashIntensityAt(performance.now())).toBe(1);
    for (const h of [...busy, quiet]) h.destroy();
  });

  it('LATCHES the verdict — a live flash never brightens as the window empties', () => {
    let t = 1_000;
    wireGate(() => t);
    const hulls = Array.from({ length: 5 }, (_, i) => hullAt(100 + i, 100));
    for (const h of hulls) h.flash();
    const degraded = hulls[4];
    t += FB.windowMs * 5; // the window empties under a flash already on screen
    expect(degraded.flashIntensityAt(performance.now())).toBeCloseTo(FB.degradeAlphaFactor, 10);
    for (const h of hulls) h.destroy();
  });
});

describe('a hull that has never rendered never charges the wrong region', () => {
  it('animates, and spends no onset, when the view has no pose yet', () => {
    // `flash()` buckets by `this.gfx.position` — the LAST RENDERED pose. A
    // ShipView created and damaged inside the same network batch flashes before
    // its first `update()`, so it reads (0,0) and would charge the map-centre
    // region for a hull that is somewhere else entirely. Fail SAFE: no claim, no
    // mis-bucket, and the flash animates.
    const budget = wireGate();
    const unrendered = new ShipView(FALLBACK_STYLE, 'torpedoBoat'); // never update()d
    unrendered.flash();
    expect(unrendered.flashIntensityAt(performance.now())).toBe(1);
    // ...and it did not eat an onset from the region it would have mis-bucketed
    // into: three real hulls there still flash at full strength.
    const real = Array.from({ length: FB.maxPerSecond }, (_, i) => hullAt(10 + i, 10)); // r0:0
    for (const h of real) h.flash();
    for (const h of real) expect(h.flashIntensityAt(performance.now())).toBe(1);
    expect(budget.claim('r0:0', 1_000)).toBe('degrade'); // exactly three, no more
    for (const h of [unrendered, ...real]) h.destroy();
  });
});

describe('the hull flash at motion: \'off\' is unchanged by the budget', () => {
  it('does not flash and does not spend an onset', () => {
    settings.set({ motion: 'off' });
    const budget = wireGate();
    const hulls = Array.from({ length: 10 }, (_, i) => hullAt(100 + i, 100));
    for (const h of hulls) h.flash();
    for (const h of hulls) expect(h.flashIntensityAt(performance.now())).toBe(0); // exactly as before 4.8
    // A suppressed flash did not flash, so the region's budget is untouched.
    for (let i = 0; i < FB.maxPerSecond; i++) expect(budget.claim('r0:0', 1_000)).toBe('animate');
    for (const h of hulls) h.destroy();
  });

  it('unwired (no gate) every hull flashes at full strength, exactly as it shipped', () => {
    setHullFlashGate(null);
    const hulls = Array.from({ length: 20 }, (_, i) => hullAt(100 + i, 100));
    for (const h of hulls) h.flash();
    for (const h of hulls) expect(h.flashIntensityAt(performance.now())).toBe(1);
    for (const h of hulls) h.destroy();
  });
});

describe('ShipView.draw — bounds match the shared silhouette dims for each class + drone', () => {
  // The silhouette IS the hitbox: ShipView.draw() traces hullSilhouette(id)
  // verbatim (no parallel geometry). Pixi 8 Graphics bounds resolve under jsdom
  // (pure geometry math), so we pin the RENDERED geometry — not just that a view
  // constructs. Two facts are asserted per hull:
  //   1. the traced polygon's span == the class's CONFIG hull length/beam
  //      (bow-to-stern along +x = length, port-to-starboard along y = beam), and
  //   2. gfx.getLocalBounds() ENCLOSES that hull and preserves its aspect.
  // Pixi's stroke/miter join inflates the box isotropically (a sharp bow adds a
  // few u to BOTH width and height), so a direct length/beam equality is
  // defeated; the stroke-invariant width − height == length − beam holds exactly,
  // and the box never sits inside the hull dims. (Geometry exactness lives in
  // shared/silhouette.test; this pins the client render is wired to it.)
  const HULL: Record<string, { length: number; beam: number }> = {
    torpedoBoat: CONFIG.shipClasses.torpedoBoat.hull,
    battleship: CONFIG.shipClasses.battleship.hull,
    mineLayer: CONFIG.shipClasses.mineLayer.hull,
    droneMedium: CONFIG.drones.medium.hull,
  };
  const STROKE_SLOP = 12; // u — empirical Pixi miter-join stroke inflation at a sharp bow

  for (const id of ['torpedoBoat', 'battleship', 'mineLayer', 'droneMedium'] as const) {
    it(`traces ${id} at its CONFIG hull length/beam (rendered bounds enclose it)`, () => {
      const poly = hullSilhouette(id);
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const p of poly) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      }
      const { length, beam } = HULL[id];
      expect(maxX - minX).toBeCloseTo(length, 6); // silhouette span == CONFIG length
      expect(maxY - minY).toBeCloseTo(beam, 6); // silhouette span == CONFIG beam

      const view = new ShipView(FALLBACK_STYLE, id);
      const b = view.gfx.getLocalBounds();
      expect(b.width).toBeGreaterThanOrEqual(length - 1e-6); // stroke inflates outward…
      expect(b.height).toBeGreaterThanOrEqual(beam - 1e-6);
      expect(b.width).toBeLessThan(length + STROKE_SLOP); // …but only by the stroke/miter
      expect(b.height).toBeLessThan(beam + STROKE_SLOP);
      expect(b.width - b.height).toBeCloseTo(length - beam, 3); // aspect preserved exactly
      // setHullId re-draws through the same hullSilhouette path (own-hull correction).
      expect(() => view.setHullId(id)).not.toThrow();
      view.destroy();
    });
  }
});
