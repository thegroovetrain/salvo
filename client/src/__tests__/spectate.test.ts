// Spectator camera math (render/spectate.ts + Camera zoom-factor/pan).

import { describe, it, expect } from 'vitest';
import {
  SPECTATE_PAN_SPEED,
  pickSpectateTarget,
  spectatePan,
  wheelZoom,
  shouldEngageFreePan,
  SPECTATE_ZOOM_MIN,
  SPECTATE_ZOOM_MAX,
} from '../render/spectate.js';
import { KeyboardInput } from '../input/keyboard.js';
import { Camera, SPECTATE_SPAN_NARROW_U, SPECTATE_SPAN_WIDE_U } from '../render/camera.js';
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
  });
});

describe('wheelZoom', () => {
  it('the spectate clamp is the two ABSOLUTE spans over the default framing (ruling 127)', () => {
    expect(SPECTATE_ZOOM_MIN).toBeCloseTo(CLIENT_CONFIG.zoom.defaultSpanU / SPECTATE_SPAN_WIDE_U, 12);
    expect(SPECTATE_ZOOM_MAX).toBeCloseTo(CLIENT_CONFIG.zoom.defaultSpanU / SPECTATE_SPAN_NARROW_U, 12);
    // Today's 0.5×–1.0× written as spans: the wide span is twice the narrow.
    expect(SPECTATE_SPAN_WIDE_U / SPECTATE_SPAN_NARROW_U).toBe(2);
  });

  it('zooms out on scroll down and back in on scroll up, clamped to the spans', () => {
    const out = wheelZoom(SPECTATE_ZOOM_MAX, 250);
    expect(out).toBeLessThan(SPECTATE_ZOOM_MAX);
    expect(wheelZoom(out, -1000)).toBe(SPECTATE_ZOOM_MAX); // back in, capped
    expect(wheelZoom(SPECTATE_ZOOM_MIN + 0.05, 10000)).toBe(SPECTATE_ZOOM_MIN); // the wide floor
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
    return c;
  }

  it('multiplies the viewport-derived base zoom and clamps to the spectate spans', () => {
    const c = cam();
    const base = c.zoom;
    c.setZoomFactor(SPECTATE_ZOOM_MIN);
    expect(c.zoom).toBeCloseTo(base * SPECTATE_ZOOM_MIN, 10);
    expect(900 / c.zoom).toBeCloseTo(SPECTATE_SPAN_WIDE_U, 6);
    c.setZoomFactor(0.01);
    expect(c.zoomFactor).toBe(SPECTATE_ZOOM_MIN);
    c.setZoomFactor(7);
    expect(c.zoomFactor).toBe(SPECTATE_ZOOM_MAX);
    expect(900 / c.zoom).toBeCloseTo(SPECTATE_SPAN_NARROW_U, 6);
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
