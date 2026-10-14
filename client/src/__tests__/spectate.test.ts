// Spectator camera math (render/spectate.ts + Camera zoom-factor/pan).

import { describe, it, expect } from 'vitest';
import {
  SPECTATE_PAN_SPEED,
  pickSpectateTarget,
  spectatePan,
  wheelZoom,
  shouldEngageFreePan,
} from '../render/spectate.js';
import { KeyboardInput } from '../input/keyboard.js';
import { Camera, ringFitSpanU, stepZoom } from '../render/camera.js';
import { CLIENT_CONFIG } from '../config.js';

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
    // The ring-fit out limit reaches well under 0.5 now: same screen speed there too.
    const ringFit = spectatePan({ throttle: 1, rudder: 0 }, 0.1, 0.2);
    expect(ringFit.dy).toBeCloseTo(-5 * SPECTATE_PAN_SPEED * 0.1, 9);
  });

  it('a degenerate zoom factor pans at the default-framing speed, never Infinity / NaN', () => {
    for (const f of [0, -1, NaN, Infinity]) {
      expect(spectatePan({ throttle: 1, rudder: 0 }, 0.1, f).dy).toBeCloseTo(-SPECTATE_PAN_SPEED * 0.1, 9);
    }
  });
});

// Eric 2026-10-14: "The full zoom-out needs to apply to spectate mode, as well."
// The old fixed spectate spans are gone; the wheel takes the alive LOG step and
// the camera applies the alive range (camera.test.ts covers the clamp).
describe('wheelZoom', () => {
  it('is the alive log wheel step (stepZoom × CLIENT_CONFIG.zoom.wheelRate), unclamped', () => {
    for (const f of [0.2, 0.5, 1, 1.4]) {
      expect(wheelZoom(f, 100)).toBeCloseTo(stepZoom(f, -100 * CLIENT_CONFIG.zoom.wheelRate), 12);
      expect(wheelZoom(f, -100)).toBeGreaterThan(f); // scroll up zooms in
      expect(wheelZoom(f, 100)).toBeLessThan(f); // scroll down zooms out
    }
  });

  it('before the map radius (amendment 142 fallback) a wheel spin out reaches the LIVE ring fit, and back in to the close framing', () => {
    const c = new Camera({
      defaultSpanU: CLIENT_CONFIG.zoom.defaultSpanU,
      closeSpanU: CLIENT_CONFIG.zoom.closeSpanU,
      ringFitMargin: CLIENT_CONFIG.reveal.mapFitMargin,
      followRate: 5,
      leadSeconds: 4,
      leadMax: 110,
    });
    c.setViewport(1600, 900);
    c.setRing(0, 0, 2800);
    for (let i = 0; i < 100; i++) c.zoomAbout(400, 300, wheelZoom(c.zoomFactor, 250));
    expect(900 / c.zoom).toBeCloseTo(ringFitSpanU(2800, CLIENT_CONFIG.reveal.mapFitMargin), 6);
    for (let i = 0; i < 100; i++) c.zoomAbout(400, 300, wheelZoom(c.zoomFactor, -250));
    expect(900 / c.zoom).toBeCloseTo(CLIENT_CONFIG.zoom.closeSpanU, 6);
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

describe('shouldEngageFreePan', () => {
  it('latches on any nonzero throttle or rudder axis', () => {
    expect(shouldEngageFreePan({ throttle: 1, rudder: 0 })).toBe(true);
    expect(shouldEngageFreePan({ throttle: 0, rudder: -1 })).toBe(true);
    expect(shouldEngageFreePan({ throttle: 0, rudder: 0 })).toBe(false);
  });

  it('FINDING 1 regression: keys held at the moment of death read as zero the ' +
    'frame after KeyboardInput.clearKeys() runs, so the follow-killer camera is ' +
    'not defeated by steering into your own death', () => {
    const kb = new KeyboardInput();
    kb.keys.add('KeyW'); // steering hard when the killing shot lands
    kb.keys.add('KeyD');
    // Spectate reads panAxes() (held WASD), so W/S held still count here.
    expect(shouldEngageFreePan(kb.panAxes())).toBe(true); // pre-fix: this alone flips freePan forever

    // The onSpectate transition (main.ts's enterSpectateVisuals) clears the
    // keyboard before the first spectate frame is rendered.
    kb.clearKeys();
    expect(shouldEngageFreePan(kb.panAxes())).toBe(false); // no latch: no fresh press yet

    // A genuine fresh press after death still engages free-pan as normal.
    kb.keys.add('KeyA');
    expect(shouldEngageFreePan(kb.panAxes())).toBe(true);
  });
});

describe('Camera zoom factor + pan (spectators only)', () => {
  function cam(): Camera {
    const c = new Camera({
      defaultSpanU: CLIENT_CONFIG.zoom.defaultSpanU,
      closeSpanU: CLIENT_CONFIG.zoom.closeSpanU,
      ringFitMargin: CLIENT_CONFIG.reveal.mapFitMargin,
      followRate: 5,
      leadSeconds: 4,
      leadMax: 110,
    });
    c.setViewport(1600, 900);
    c.setRing(0, 0, RING_R); // the spectate feed (Eric 2026-10-14)
    return c;
  }
  const RING_R = 2800;

  // Re-based on Eric's 2026-10-14 ruling: the clamp is the alive range — the
  // close framing in, the live ring fit out — no longer the 2,640–1,320 u spans.
  it('multiplies the viewport-derived base zoom and clamps to the ALIVE range', () => {
    const c = cam();
    const base = c.zoom;
    const lim = c.spectateZoomLimits;
    expect(lim).toEqual(c.userZoomLimits);
    c.setZoomFactor(lim.min);
    expect(c.zoom).toBeCloseTo(base * lim.min, 10);
    expect(900 / c.zoom).toBeCloseTo(ringFitSpanU(RING_R, CLIENT_CONFIG.reveal.mapFitMargin), 6);
    c.setZoomFactor(0.01);
    expect(c.zoomFactor).toBe(lim.min);
    c.setZoomFactor(7);
    expect(c.zoomFactor).toBe(lim.max);
    expect(900 / c.zoom).toBeCloseTo(CLIENT_CONFIG.zoom.closeSpanU, 6);
  });

  it('resets to 1x and survives viewport changes', () => {
    const c = cam();
    c.setZoomFactor(0.6);
    c.setViewport(800, 1200); // resize re-derives base zoom, keeps the factor
    expect(c.zoom).toBeCloseTo((800 / CLIENT_CONFIG.zoom.defaultSpanU) * 0.6, 10);
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
