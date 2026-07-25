// MouseInput (Story 2.1 hygiene): canvas-target-only click counting, the refit
// modal's full combat lockout, contextmenu suppression on the canvas, and the
// original counter/stamp semantics. jsdom (MouseEvent stands in for
// PointerEvent; `bubbles: true` dispatched ON an element gives the window
// listener a real e.target, exactly like a browser).

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

/** Dispatch a pointer-ish event ON `el` (bubbles to the window listener with
 *  e.target === el — the browser's canvas-click shape). */
function fire(el: EventTarget, type: string, init: MouseEventInit = {}): void {
  el.dispatchEvent(new MouseEvent(type, { bubbles: true, ...init }));
}

function withMouse(
  run: (m: MouseInput, canvas: HTMLElement) => void,
  nowServer?: () => number,
  isLocked?: () => boolean,
  onSlotPress?: (p: { x: number; y: number }) => boolean,
): void {
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  const m = new MouseInput(nowServer, isLocked, onSlotPress);
  m.attach(canvas);
  try {
    run(m, canvas);
  } finally {
    m.detach();
    canvas.remove();
  }
}

describe('MouseInput.clickCount — cumulative button-0 CANVAS clicks', () => {
  it('increments on button-0 pointerdown targeting the canvas only', () => {
    withMouse((m, canvas) => {
      expect(m.clickCount).toBe(0);
      fire(canvas, 'pointerdown', { button: 0 });
      expect(m.clickCount).toBe(1);
      fire(canvas, 'pointerdown', { button: 0 });
      expect(m.clickCount).toBe(2);
    });
  });

  it('a pointerdown on DOM chrome (a non-canvas target) NEVER counts — a card click cannot fire', () => {
    withMouse((m) => {
      const card = document.createElement('button'); // e.g. a refit card
      document.body.appendChild(card);
      fire(card, 'pointerdown', { button: 0 });
      fire(document.body, 'pointerdown', { button: 0 });
      expect(m.clickCount).toBe(0);
      card.remove();
    });
  });

  it('while the lockout predicate holds (refit modal open), even canvas clicks are dropped', () => {
    let locked = true;
    withMouse(
      (m, canvas) => {
        fire(canvas, 'pointerdown', { button: 0 });
        expect(m.clickCount).toBe(0); // full combat lockout
        locked = false; // modal closed
        fire(canvas, 'pointerdown', { button: 0 });
        expect(m.clickCount).toBe(1);
      },
      undefined,
      () => locked,
    );
  });

  it('ignores pointerup, pointermove, and non-primary buttons', () => {
    withMouse((m, canvas) => {
      fire(canvas, 'pointerup', { button: 0 });
      fire(canvas, 'pointermove', { clientX: 5, clientY: 6 });
      fire(canvas, 'pointerdown', { button: 2 }); // right
      fire(canvas, 'pointerdown', { button: 1 }); // middle
      expect(m.clickCount).toBe(0);
    });
  });

  it('suppresses the canvas contextmenu (right-click never pops a browser menu)', () => {
    withMouse((_m, canvas) => {
      const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      const notPrevented = canvas.dispatchEvent(e);
      expect(notPrevented).toBe(false); // preventDefault was called
    });
  });

  it('survives blur — a counter has no held state to clear', () => {
    withMouse((m, canvas) => {
      fire(canvas, 'pointerdown', { button: 0 });
      window.dispatchEvent(new Event('blur'));
      expect(m.clickCount).toBe(1);
    });
  });

  it('stops counting after detach', () => {
    const canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    const m = new MouseInput();
    m.attach(canvas);
    fire(canvas, 'pointerdown', { button: 0 });
    m.detach();
    fire(canvas, 'pointerdown', { button: 0 });
    expect(m.clickCount).toBe(1);
    canvas.remove();
  });
});

describe('MouseInput.lastClickT — server-clock stamp at pointerdown (D1)', () => {
  it('is 0 before any click (the no-claim sentinel)', () => {
    withMouse((m) => {
      expect(m.lastClickT).toBe(0);
    }, () => 5000);
  });

  it('stamps the injected server-clock estimate on a counted button-0 pointerdown', () => {
    let now = 1000;
    withMouse((m, canvas) => {
      fire(canvas, 'pointerdown', { button: 0 });
      expect(m.lastClickT).toBe(1000);
      now = 2500; // a later click re-stamps to the live estimate
      fire(canvas, 'pointerdown', { button: 0 });
      expect(m.lastClickT).toBe(2500);
    }, () => now);
  });

  it('defaults the thunk to 0 (no clock injected → always the no-claim sentinel)', () => {
    withMouse((m, canvas) => {
      fire(canvas, 'pointerdown', { button: 0 });
      expect(m.lastClickT).toBe(0);
    });
  });

  it('does not stamp on move, up, non-primary buttons, or off-canvas/locked downs', () => {
    let locked = false;
    withMouse(
      (m, canvas) => {
        fire(canvas, 'pointerup', { button: 0 });
        fire(canvas, 'pointermove', { clientX: 1, clientY: 2 });
        fire(canvas, 'pointerdown', { button: 2 }); // right
        fire(document.body, 'pointerdown', { button: 0 }); // off-canvas
        locked = true;
        fire(canvas, 'pointerdown', { button: 0 }); // locked out
        expect(m.lastClickT).toBe(0); // untouched — no counted click occurred
      },
      () => 9999,
      () => locked,
    );
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

// --- Story 2.2: the hotbar gate (amendment 11) -------------------------------
// A canvas pointerdown over a hotbar SLOT is that slot's key-equivalent action
// and is SWALLOWED — it must never reach the fire path. Pixi doesn't retarget
// events, so the hotbar's clicks arrive with the canvas as their target; this
// injected predicate is the only thing standing between them and the gun.

describe('MouseInput — the injected hotbar gate', () => {
  it('swallows a canvas press the hotbar claims (no click counted, no fire stamp)', () => {
    withMouse(
      (m, canvas) => {
        fire(canvas, 'pointerdown', { button: 0, clientX: 60, clientY: 600 });
        expect(m.clickCount).toBe(0); // the gun never fires at the water beneath
        expect(m.lastClickT).toBe(0);
      },
      () => 4242,
      undefined,
      () => true,
    );
  });

  it('lets a press the hotbar does NOT claim fire exactly as before', () => {
    withMouse(
      (m, canvas) => {
        fire(canvas, 'pointerdown', { button: 0, clientX: 800, clientY: 400 });
        expect(m.clickCount).toBe(1);
      },
      undefined,
      undefined,
      () => false,
    );
  });

  it('hands the gate the pointerdown position (not a stale move position)', () => {
    const seen: { x: number; y: number }[] = [];
    withMouse(
      (_m, canvas) => {
        fire(canvas, 'pointermove', { clientX: 5, clientY: 5 });
        fire(canvas, 'pointerdown', { button: 0, clientX: 71, clientY: 604 });
        expect(seen).toEqual([{ x: 71, y: 604 }]);
      },
      undefined,
      undefined,
      (p) => {
        seen.push({ x: p.x, y: p.y });
        return false;
      },
    );
  });

  it('is never consulted while the refit modal holds the lockout (both suspended)', () => {
    let consulted = 0;
    withMouse(
      (m, canvas) => {
        fire(canvas, 'pointerdown', { button: 0, clientX: 60, clientY: 600 });
        expect(consulted).toBe(0);
        expect(m.clickCount).toBe(0);
      },
      undefined,
      () => true,
      () => {
        consulted += 1;
        return true;
      },
    );
  });

  it('defaults to no gate (a bare MouseInput fires on every canvas press)', () => {
    withMouse((m, canvas) => {
      fire(canvas, 'pointerdown', { button: 0 });
      expect(m.clickCount).toBe(1);
    });
  });
});
