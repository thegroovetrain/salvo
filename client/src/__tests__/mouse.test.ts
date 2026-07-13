import { describe, it, expect } from 'vitest';
import { worldAim } from '../input/mouse.js';
import { Camera } from '../render/camera.js';

const opts = { radarRange: 650, followRate: 5, leadSeconds: 4, leadMax: 110 };

describe('worldAim', () => {
  it('is the bearing from the own ship to a world point', () => {
    expect(worldAim(0, 0, { x: 1, y: 0 })).toBeCloseTo(0, 9); // due +x
    expect(worldAim(0, 0, { x: 0, y: 1 })).toBeCloseTo(Math.PI / 2, 9); // +y
    expect(worldAim(10, 10, { x: 10, y: 20 })).toBeCloseTo(Math.PI / 2, 9);
    expect(worldAim(5, 5, { x: 4, y: 5 })).toBeCloseTo(Math.PI, 9); // due -x
  });
});

describe('mouse aim via camera roundtrip', () => {
  it('screenToWorld inverts worldToScreen so cursor aim is exact', () => {
    const cam = new Camera(opts);
    cam.setViewport(1600, 900);
    cam.snapTo({ x: 300, y: -120 }); // ship somewhere in the world

    const target = { x: 480, y: 60 };
    const screen = cam.worldToScreen(target);
    const back = cam.screenToWorld(screen);
    expect(back.x).toBeCloseTo(target.x, 6);
    expect(back.y).toBeCloseTo(target.y, 6);

    // A cursor over `target` yields the same bearing as aiming straight at it.
    const ship = cam.center;
    const aim = worldAim(ship.x, ship.y, cam.screenToWorld(screen));
    expect(aim).toBeCloseTo(Math.atan2(target.y - ship.y, target.x - ship.x), 9);
  });
});
