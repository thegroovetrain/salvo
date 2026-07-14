import { describe, it, expect } from 'vitest';
import { MouseInput, worldAim, worldAimDist } from '../input/mouse.js';
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

describe('worldAimDist', () => {
  it('is the distance from the own ship to a world point', () => {
    expect(worldAimDist(0, 0, { x: 3, y: 4 })).toBeCloseTo(5, 9);
    expect(worldAimDist(10, 10, { x: 10, y: 10 })).toBe(0);
    expect(worldAimDist(-2, 1, { x: 1, y: 5 })).toBeCloseTo(5, 9);
  });
});

describe('MouseInput.clickCount — cumulative button-0 clicks', () => {
  function pointer(type: string, init: MouseEventInit = {}): MouseEvent {
    // jsdom has no PointerEvent constructor; MouseEvent carries `button` fine.
    return new MouseEvent(type, init);
  }

  function withMouse(run: (m: MouseInput) => void): void {
    const m = new MouseInput();
    m.attach();
    try {
      run(m);
    } finally {
      m.detach();
    }
  }

  it('increments on button-0 pointerdown only', () => {
    withMouse((m) => {
      expect(m.clickCount).toBe(0);
      window.dispatchEvent(pointer('pointerdown', { button: 0 }));
      expect(m.clickCount).toBe(1);
      window.dispatchEvent(pointer('pointerdown', { button: 0 }));
      expect(m.clickCount).toBe(2);
    });
  });

  it('ignores pointerup, pointermove, and non-primary buttons', () => {
    withMouse((m) => {
      window.dispatchEvent(pointer('pointerup', { button: 0 }));
      window.dispatchEvent(pointer('pointermove', { clientX: 5, clientY: 6 }));
      window.dispatchEvent(pointer('pointerdown', { button: 2 })); // right
      window.dispatchEvent(pointer('pointerdown', { button: 1 })); // middle
      expect(m.clickCount).toBe(0);
    });
  });

  it('survives blur — a counter has no held state to clear', () => {
    withMouse((m) => {
      window.dispatchEvent(pointer('pointerdown', { button: 0 }));
      window.dispatchEvent(new Event('blur'));
      expect(m.clickCount).toBe(1);
    });
  });

  it('stops counting after detach', () => {
    const m = new MouseInput();
    m.attach();
    window.dispatchEvent(pointer('pointerdown', { button: 0 }));
    m.detach();
    window.dispatchEvent(pointer('pointerdown', { button: 0 }));
    expect(m.clickCount).toBe(1);
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
