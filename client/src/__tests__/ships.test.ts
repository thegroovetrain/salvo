// Ship hull styling (render/ships.ts) — Story 1.12 personal-hue resolution: the
// index → (bright stroke, darker fill) tables, the drone-greys + amber-hollow
// fallbacks, and the ShipView.setColors recolor path (own hull boots on the
// fallback and swaps to its hue once the roster syncs).

import { describe, it, expect } from 'vitest';
import { CONFIG, REGATTA_HUES, hullSilhouette } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import {
  PLAYER_HUES,
  PLAYER_FILLS,
  DRONE_STYLE,
  FALLBACK_STYLE,
  hullStyle,
  contactStyle,
  isDroneHull,
  ShipView,
} from '../render/ships.js';

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

describe('ShipView.setColors — the recolor path', () => {
  it('constructs and recolors without throwing (own hull fallback → personal hue)', () => {
    const view = new ShipView(FALLBACK_STYLE, 'torpedoBoat');
    expect(() => view.setColors(C.players.cyan, C.playerFills.cyan)).not.toThrow();
    expect(() => view.setColors(C.amber, null)).not.toThrow(); // back to hollow fallback
    view.destroy();
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
