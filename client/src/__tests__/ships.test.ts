// Ship hull styling (render/ships.ts) — Story 10.4 relation colors (Eric's
// ruling R6): every captain hull wears its RELATION to the viewer (own / enemy),
// the amber-hollow fallback stays, and
// ShipView.setColors is the recolor path. Story 10.4 turrets: a captain view
// carries one turret child per battery mount at its station, pointed by
// setTurretAngles.

import { afterEach, describe, it, expect } from 'vitest';
import type { Graphics } from 'pixi.js';
import {
  CONFIG,
  DEFAULT_CLASS_ID,
  SHIP_CLASS_IDS,
  hullSilhouette,
  turretMounts,
  turretRest,
  turretStation,
} from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import {
  FALLBACK_STYLE,
  hullFlashIntensity,
  setHullFlashGate,
  ShipView,
} from '../render/ships.js';
import { relationStyle } from '../render/relationColor.js';
import { WorldFlashGate } from '../render/effects.js';
import { createFlashBudget } from '../render/flashBudget.js';
import { settings } from '../settings/store.js';

const C = CLIENT_CONFIG.colors;

describe('ShipView.setColors — the recolor path', () => {
  it('repaints hull and turrets (fallback → own relation → hollow) without changing turret count', () => {
    const view = new ShipView(FALLBACK_STYLE, DEFAULT_CLASS_ID);
    const count = view.turretCount;
    expect(count).toBeGreaterThan(0);
    const own = relationStyle('own');
    view.setColors(own.stroke, own.fill);
    // Story 10.4 wave 2c: EVERY line of a captain hull is the one line color
    // (amendment 7(m)) — deck detail, the outline and every turret.
    expect(new Set(strokeColorsOf(view))).toEqual(new Set([own.stroke]));
    expect(strokesOf(view.outline)).toEqual([own.stroke]);
    for (let i = 0; i < count; i++) expect(new Set(turretStrokes(view, i))).toEqual(new Set([own.stroke]));
    expect(view.turretCount).toBe(count);
    view.setColors(C.amber, null); // back to the fallback linework
    expect(new Set(strokeColorsOf(view))).toEqual(new Set([C.amber]));
    for (let i = 0; i < count; i++) expect(new Set(turretStrokes(view, i))).toEqual(new Set([C.amber]));
    expect(view.turretCount).toBe(count);
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
  const v = new ShipView(FALLBACK_STYLE, DEFAULT_CLASS_ID);
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
    const unrendered = new ShipView(FALLBACK_STYLE, DEFAULT_CLASS_ID); // never update()d
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

describe('ShipView.draw — bounds match the shared silhouette dims for each class', () => {
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
  const HULL: Record<string, { length: number; beam: number }> = Object.fromEntries(
    SHIP_CLASS_IDS.map((id) => [id, CONFIG.shipClasses[id].hull]),
  );
  const STROKE_SLOP = 12; // u — empirical Pixi miter-join stroke inflation at a sharp bow

  for (const id of SHIP_CLASS_IDS) {
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
      // A captain's hull LINE is its outline layer (deck features and secondary
      // barrels may overhang it, as on the sitting page).
      const b = view.outline.getLocalBounds();
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

/** Every stroke colour a view's deck layer actually issues, in draw order. */
function strokeColorsOf(view: ShipView): number[] {
  return strokesOf(view.hull);
}

/** Every stroke colour turret `i`'s Graphics issues. */
function turretStrokes(view: ShipView, i: number): number[] {
  const g = view.turretView(i);
  return g === undefined ? [] : strokesOf(g);
}

function strokesOf(g: Graphics): number[] {
  const instructions = g.context.instructions as { action: string; data: { style?: { color?: number } } }[];
  return instructions.filter((i) => i.action === 'stroke').map((i) => i.data.style?.color ?? -1);
}

// --- STORY 10.4: TURRETS ------------------------------------------------------
//
// A captain hull carries one turret child per mount of its shared battery, at
// the mount's station on the centreline, rotated by its hull-relative angle.
describe('ShipView turrets — one child per battery mount, pointed by setTurretAngles', () => {
  it('gives a captain view one turret per turretMounts(hull) entry', () => {
    for (const id of SHIP_CLASS_IDS) {
      const view = new ShipView(relationStyle('own'), id);
      expect(turretMounts(id).length).toBeGreaterThan(0);
      expect(view.turretCount).toBe(turretMounts(id).length);
      view.destroy();
    }
  });

  it('seats each turret at turretStation(hull, i), at its rest bearing until pointed', () => {
    for (const id of SHIP_CLASS_IDS) {
      const view = new ShipView(relationStyle('enemy'), id);
      const mounts = turretMounts(id);
      for (let i = 0; i < view.turretCount; i++) {
        const g = view.turretView(i)!;
        const p = turretStation(id, i);
        expect(g.position.x).toBeCloseTo(p.x, 6);
        expect(g.position.y).toBeCloseTo(p.y, 6);
        expect(g.rotation).toBeCloseTo(turretRest(mounts[i]), 6);
        expect(view.gfx.children).toContain(g); // a child: inherits pose, fade, flash
      }
      view.destroy();
    }
  });

  it('setTurretAngles sets each rotation; a missing entry holds the mount at its rest bearing', () => {
    for (const id of SHIP_CLASS_IDS) {
      const view = new ShipView(relationStyle('own'), id);
      const mounts = turretMounts(id);
      const all = mounts.map((m, i) => turretRest(m) + 0.1 * (i + 1));
      view.setTurretAngles(all);
      for (let i = 0; i < view.turretCount; i++) expect(view.turretView(i)!.rotation).toBeCloseTo(all[i], 6);
      view.setTurretAngles(all.slice(0, 1));
      expect(view.turretView(0)!.rotation).toBeCloseTo(all[0], 6);
      for (let i = 1; i < view.turretCount; i++) {
        expect(view.turretView(i)!.rotation).toBeCloseTo(turretRest(mounts[i]), 6);
      }
      view.destroy();
    }
  });
});
