import { describe, it, expect } from 'vitest';
import { Camera } from '../render/camera.js';

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
