// Spectator camera math (render/spectate.ts + Camera zoom-factor/pan).

import { describe, it, expect } from 'vitest';
import {
  SPECTATE_PAN_SPEED,
  pickSpectateTarget,
  spectatePan,
  wheelZoom,
} from '../render/spectate.js';
import { Camera, SPECTATE_ZOOM_MIN } from '../render/camera.js';

describe('spectatePan', () => {
  it('maps W/S to screen-up/down and A/D to left/right', () => {
    const up = spectatePan({ throttle: 1, rudder: 0 }, 0.1, 1);
    expect(up.dx).toBeCloseTo(0, 12);
    expect(up.dy).toBeCloseTo(-SPECTATE_PAN_SPEED * 0.1, 12);
    const right = spectatePan({ throttle: 0, rudder: 1 }, 0.1, 1);
    expect(right.dx).toBeCloseTo(SPECTATE_PAN_SPEED * 0.1, 12);
    expect(right.dy).toBeCloseTo(0, 12);
  });

  it('scales speed inversely with the zoom factor (same screen speed zoomed out)', () => {
    const zoomedOut = spectatePan({ throttle: 1, rudder: 0 }, 0.1, 0.5);
    expect(zoomedOut.dy).toBeCloseTo(-2 * SPECTATE_PAN_SPEED * 0.1, 9);
  });
});

describe('wheelZoom', () => {
  it('zooms out on scroll down and back in on scroll up, clamped to [0.5, 1]', () => {
    const out = wheelZoom(1, 250);
    expect(out).toBeLessThan(1);
    expect(wheelZoom(out, -1000)).toBe(1); // back in, capped at 1x
    expect(wheelZoom(0.55, 10000)).toBe(SPECTATE_ZOOM_MIN); // floor at 0.5x
  });
});

describe('pickSpectateTarget', () => {
  it('prefers the killer while it is still afloat', () => {
    expect(pickSpectateTarget('k', ['a', 'k', 'b'])).toBe('k');
  });

  it('falls back to any alive ship when the killer is gone or unknown', () => {
    expect(pickSpectateTarget('k', ['a', 'b'])).toBe('a');
    expect(pickSpectateTarget(null, ['b'])).toBe('b');
  });

  it('returns null with nobody afloat (camera holds position)', () => {
    expect(pickSpectateTarget('k', [])).toBeNull();
  });
});

describe('Camera zoom factor + pan (spectators only)', () => {
  function cam(): Camera {
    const c = new Camera({ radarRange: 650, followRate: 5, leadSeconds: 4, leadMax: 110 });
    c.setViewport(1600, 900);
    return c;
  }

  it('multiplies the viewport-derived base zoom and clamps to [0.5, 1]', () => {
    const c = cam();
    const base = c.zoom;
    c.setZoomFactor(0.5);
    expect(c.zoom).toBeCloseTo(base * 0.5, 10);
    c.setZoomFactor(0.1);
    expect(c.zoomFactor).toBe(0.5);
    c.setZoomFactor(7);
    expect(c.zoomFactor).toBe(1);
  });

  it('resets to 1x and survives viewport changes', () => {
    const c = cam();
    c.setZoomFactor(0.6);
    c.setViewport(800, 1200); // resize re-derives base zoom, keeps the factor
    expect(c.zoom).toBeCloseTo((800 / (2 * 650)) * 0.6, 10);
    c.resetZoomFactor();
    expect(c.zoomFactor).toBe(1);
  });

  it('pan nudges the center by a world-space delta', () => {
    const c = cam();
    c.snapTo({ x: 10, y: 20 });
    c.pan(5, -3);
    expect(c.center).toEqual({ x: 15, y: 17 });
  });
});
