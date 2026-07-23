// Ship hull styling (render/ships.ts) — Story 1.12 personal-hue resolution: the
// index → (bright stroke, darker fill) tables, the drone-greys + amber-hollow
// fallbacks, and the ShipView.setColors recolor path (own hull boots on the
// fallback and swaps to its hue once the roster syncs).

import { describe, it, expect } from 'vitest';
import { REGATTA_HUES } from '@salvo/shared';
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
