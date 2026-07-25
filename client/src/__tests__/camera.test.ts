import { describe, it, expect } from 'vitest';
import { Camera, canUserZoom, USER_ZOOM_MIN, USER_ZOOM_MAX } from '../render/camera.js';
import { CLIENT_CONFIG } from '../config.js';

function makeCamera() {
  return new Camera({ radarRange: 650, followRate: 5, leadSeconds: 4, leadMax: 110 });
}

describe('Camera zoom formula', () => {
  it('fits the radar diameter to the short axis', () => {
    const cam = makeCamera();
    cam.setViewport(1600, 900); // short axis = 900
    expect(cam.zoom).toBeCloseTo(900 / (2 * 650), 10);
  });

  it('uses width when it is the shorter axis', () => {
    const cam = makeCamera();
    cam.setViewport(800, 1200);
    expect(cam.zoom).toBeCloseTo(800 / (2 * 650), 10);
  });

  it('setRadarRange recomputes the base zoom against the current viewport (radar upgrade)', () => {
    const cam = makeCamera();
    cam.setViewport(1600, 900);
    const before = cam.zoom;
    cam.setRadarRange(650 * 1.15); // one radarRange stack: the world grows
    expect(cam.zoom).toBeCloseTo(900 / (2 * 650 * 1.15), 10);
    expect(cam.zoom).toBeLessThan(before); // zoomed OUT
    // A later resize keeps using the upgraded range.
    cam.setViewport(800, 1200);
    expect(cam.zoom).toBeCloseTo(800 / (2 * 650 * 1.15), 10);
  });
});

describe('Camera alive user-zoom (Story 2.1 — X/Z + wheel, ruled 0.5×–1.5×)', () => {
  it('multiplies the base radar-fit zoom by the user factor', () => {
    const cam = makeCamera();
    cam.setViewport(1600, 900);
    const base = cam.zoom;
    cam.setUserZoom(1.25);
    expect(cam.userZoom).toBe(1.25);
    expect(cam.zoom).toBeCloseTo(base * 1.25, 10);
    cam.setUserZoom(0.75);
    expect(cam.zoom).toBeCloseTo(base * 0.75, 10);
  });

  it('clamps to the ruled [0.5, 1.5] range', () => {
    const cam = makeCamera();
    cam.setUserZoom(0.1);
    expect(cam.userZoom).toBe(0.5);
    cam.setUserZoom(99);
    expect(cam.userZoom).toBe(1.5);
  });

  it('the camera bounds mirror CLIENT_CONFIG.zoom (one ruling, two homes)', () => {
    expect(USER_ZOOM_MIN).toBe(CLIENT_CONFIG.zoom.min);
    expect(USER_ZOOM_MAX).toBe(CLIENT_CONFIG.zoom.max);
  });

  it('IGNORES a non-finite factor — NaN can never poison the composed zoom', () => {
    const cam = makeCamera();
    cam.setViewport(1600, 900);
    const base = cam.zoom;
    cam.setUserZoom(1.25);
    // Math.min/max pass NaN straight through, so an unguarded setter would
    // latch NaN forever (every later clamp of NaN is NaN).
    cam.setUserZoom(NaN);
    expect(cam.userZoom).toBe(1.25); // unchanged
    expect(cam.zoom).toBeCloseTo(base * 1.25, 10);
    cam.setUserZoom(Infinity);
    expect(cam.userZoom).toBe(1.25);
    // …and the camera still takes a real value afterwards.
    cam.setUserZoom(0.8);
    expect(cam.userZoom).toBe(0.8);
  });

  it('resetUserZoom returns to the base framing (spectate entry)', () => {
    const cam = makeCamera();
    cam.setViewport(1600, 900);
    const base = cam.zoom;
    cam.setUserZoom(1.5);
    cam.resetUserZoom();
    expect(cam.userZoom).toBe(1);
    expect(cam.zoom).toBeCloseTo(base, 10);
  });

  it('is independent of the spectate factor — the spectate clamp stays [0.5, 1]', () => {
    const cam = makeCamera();
    cam.setViewport(1600, 900);
    // The spectate path is untouched: same setter, same clamp as ever.
    cam.setZoomFactor(0.2);
    expect(cam.zoomFactor).toBe(0.5);
    cam.setZoomFactor(1.4);
    expect(cam.zoomFactor).toBe(1);
    // resetUserZoom on spectate entry keeps the composed zoom the pure
    // spectate product (base × factor), byte-identical to the pre-2.1 path.
    cam.resetUserZoom();
    cam.setZoomFactor(0.6);
    expect(cam.zoom).toBeCloseTo((900 / (2 * 650)) * 0.6, 10);
  });
});

describe('canUserZoom — the alive-only gate for X/Z + wheel zoom', () => {
  it('allows zoom ONLY for a live captain who is not spectating', () => {
    expect(canUserZoom(false, true)).toBe(true);
    expect(canUserZoom(true, true)).toBe(false); // spectate owns zoom there
    expect(canUserZoom(false, false)).toBe(false); // sunk, awaiting respawn
  });

  it('treats a MISSING own ship as NOT alive (pre-join / before the first frame)', () => {
    // `you` is null until the first frame lands; an `alive === false` gate would
    // let zoom (and its debounced fog re-bake) run against an unstarted match.
    expect(canUserZoom(false, undefined)).toBe(false);
    expect(canUserZoom(true, undefined)).toBe(false);
  });
});

describe('Camera world<->screen roundtrip', () => {
  it('screenToWorld inverts worldToScreen', () => {
    const cam = makeCamera();
    cam.setViewport(1600, 900);
    cam.snapTo({ x: 120, y: -40 });
    cam.shake.x = 7;
    cam.shake.y = -3;
    for (const p of [
      { x: 0, y: 0 },
      { x: 250, y: 130 },
      { x: -900, y: 640 },
    ]) {
      const s = cam.worldToScreen(p);
      const back = cam.screenToWorld(s);
      expect(back.x).toBeCloseTo(p.x, 6);
      expect(back.y).toBeCloseTo(p.y, 6);
    }
  });

  it('maps the camera center to screen center (no shake)', () => {
    const cam = makeCamera();
    cam.setViewport(1000, 800);
    cam.snapTo({ x: 42, y: 17 });
    const s = cam.worldToScreen({ x: 42, y: 17 });
    expect(s.x).toBeCloseTo(500, 6);
    expect(s.y).toBeCloseTo(400, 6);
  });
});

describe('Camera follow smoothing', () => {
  it('is deterministic and converges toward ship + lead', () => {
    const cam = makeCamera();
    cam.setViewport(1600, 900);
    cam.snapTo({ x: 0, y: 0 });
    // Ship stationary at (100, 0): no lead, center approaches (100, 0).
    const ship = { x: 100, y: 0, heading: 0, speed: 0 };
    const before = cam.center.x;
    cam.update(0.05, ship);
    const after = cam.center.x;
    // one 50ms step at rate 5: factor = 1 - exp(-0.25) ~= 0.221
    expect(after).toBeCloseTo(100 * (1 - Math.exp(-0.25)), 6);
    expect(after).toBeGreaterThan(before);
    for (let i = 0; i < 400; i++) cam.update(0.05, ship);
    expect(cam.center.x).toBeCloseTo(100, 4);
    expect(cam.center.y).toBeCloseTo(0, 4);
  });

  it('leads ahead by speed * leadSeconds below the cap', () => {
    const cam = makeCamera();
    cam.setViewport(1600, 900);
    // maxSpeed 25 * leadSeconds 4 = 100u, under leadMax 110 (cap not engaged).
    const ship = { x: 0, y: 0, heading: 0, speed: 25 };
    cam.snapTo({ x: 0, y: 0 });
    for (let i = 0; i < 500; i++) cam.update(0.05, ship);
    expect(cam.center.x).toBeCloseTo(100, 3);
    expect(cam.center.y).toBeCloseTo(0, 3);
  });

  it('caps lead at leadMax for over-speed inputs', () => {
    const cam = makeCamera();
    cam.setViewport(1600, 900);
    const ship = { x: 0, y: 0, heading: 0, speed: 40 }; // 40*4 = 160 > 110 cap
    cam.snapTo({ x: 0, y: 0 });
    for (let i = 0; i < 500; i++) cam.update(0.05, ship);
    expect(cam.center.x).toBeCloseTo(110, 3);
    expect(cam.center.y).toBeCloseTo(0, 3);
  });

  it('leads astern when reversing', () => {
    const cam = makeCamera();
    cam.setViewport(1600, 900);
    const ship = { x: 0, y: 0, heading: 0, speed: -8 };
    cam.snapTo({ x: 0, y: 0 });
    for (let i = 0; i < 500; i++) cam.update(0.05, ship);
    // travel dir is -x; lead magnitude = 8 * 4 = 32 (< cap)
    expect(cam.center.x).toBeCloseTo(-32, 3);
  });
});
