// FRAME-LOOP CONTAINMENT (cycle 91) — the client's equivalent of the server's
// story-0.3 tick-error containment. Until this cycle `app/loop.ts` ran both
// per-frame callbacks bare, and Pixi 8's ticker clears `_requestId` BEFORE
// calling update() and only re-requests the frame AFTER it returns — so one
// escaped throw meant NO FRAME WAS EVER REQUESTED AGAIN: input sampling stops
// and the server sails your hull on its last engine order while the picture
// freezes. That is the failure the boon-cards investigation traced.
//
// CORRECTED AT THE REVIEW GATE: an earlier version of this header claimed the
// accumulator decrement MUST precede `simTick` or the loop would hang. It would
// not — `guard` catches, so a trailing decrement runs exactly as before. The
// ordering is kept as defence against anything escaping `guard`, but it is not
// a law and these tests do not pin it. What they DO pin: containment costs no
// ticks, reporting stays bounded, hostile thrown values cannot re-arm the bug
// from inside the reporter, and the Story 6.3 disposer still detaches.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { UPDATE_PRIORITY, type Application } from 'pixi.js';
import { CONFIG } from '@salvo/shared';
import { containAppRender, startLoop, type LoopCallbacks } from '../app/loop.js';

const SIM_DT_MS = CONFIG.tick.simDtMs;

/** A minimal stand-in for the Pixi surfaces `startLoop` touches: the app's
 *  ticker and its own `render`, registered at LOW exactly as Pixi's
 *  TickerPlugin does. Returns a `step(deltaMS)` that drives the listeners in
 *  priority order and models Pixi's `Ticker._tick`: a throw that escapes a
 *  listener means no frame is ever requested again, so the ticker goes DEAD.
 *
 *  Typed `Application` rather than `never` (review gate): an `as never` app
 *  makes `startLoop`'s first parameter unchecked, so any future change to which
 *  Pixi surfaces the loop touches would compile silently against this fake. */
function fakeApp(render: () => void = () => undefined): {
  app: Application;
  step: (deltaMS: number) => void;
  listeners: number;
  dead: boolean;
} {
  type Fn = (t: { deltaMS: number }) => void;
  const fns: { fn: Fn; ctx: unknown; priority: number }[] = [];
  let dead = false;
  const ticker = {
    add: (fn: Fn, ctx?: unknown, priority = UPDATE_PRIORITY.NORMAL) => {
      // Pixi keeps the list sorted by priority, highest first; equal priorities keep insertion order.
      const i = fns.findIndex((l) => l.priority < priority);
      fns.splice(i < 0 ? fns.length : i, 0, { fn, ctx, priority });
    },
    remove: (fn: Fn, ctx?: unknown) => {
      const i = fns.findIndex((l) => l.fn === fn && (ctx === undefined || l.ctx === ctx));
      if (i >= 0) fns.splice(i, 1);
    },
  };
  const app = { ticker, render } as unknown as Application;
  ticker.add(app.render as unknown as Fn, app, UPDATE_PRIORITY.LOW); // TickerPlugin.init
  const handle = {
    app,
    step: (deltaMS: number) => {
      if (dead) return;
      try {
        for (const l of [...fns]) l.fn.call(l.ctx, { deltaMS });
      } catch {
        dead = true; // Ticker._tick never re-requests the frame
      }
    },
    get listeners(): number {
      return fns.length;
    },
    get dead(): boolean {
      return dead;
    },
  };
  return handle;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('loop containment — a throwing frame costs one frame, never the session', () => {
  it('survives a throwing simTick and keeps stepping on later frames', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { app, step } = fakeApp();
    let ticks = 0;
    let renders = 0;
    const cb: LoopCallbacks = {
      simTick: () => {
        ticks += 1;
        if (ticks === 1) throw new Error('boom');
      },
      render: () => {
        renders += 1;
      },
    };
    startLoop(app, cb);

    step(SIM_DT_MS); // the throwing tick
    step(SIM_DT_MS); // must still arrive
    step(SIM_DT_MS);

    expect(ticks).toBe(3);
    expect(renders).toBe(3); // render is not collateral damage of a sim throw
  });

  it('still renders on the very frame whose simTick threw', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { app, step } = fakeApp();
    let renders = 0;
    startLoop(app, {
      simTick: () => {
        throw new Error('boom');
      },
      render: () => {
        renders += 1;
      },
    });
    step(SIM_DT_MS);
    expect(renders).toBe(1);
  });

  it('survives a throwing render, keeps the sim stepping, and RESUMES rendering', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { app, step } = fakeApp();
    let ticks = 0;
    let renders = 0;
    let renderShouldThrow = true;
    startLoop(app, {
      simTick: () => {
        ticks += 1;
      },
      render: () => {
        renders += 1;
        if (renderShouldThrow) throw new Error('render boom');
      },
    });
    step(SIM_DT_MS);
    renderShouldThrow = false;
    step(SIM_DT_MS);
    expect(ticks).toBe(2);
    // "Rendering resumes" was asserted NOWHERE before the acceptance audit —
    // the old test counted sim ticks only. Count the render calls, and prove
    // the second one completed rather than merely being attempted.
    expect(renders).toBe(2);
  });

  // One frame carrying 4 sim steps' worth of time must still run its ticks when
  // every one of them throws, and must terminate.
  //
  // HONESTY NOTE (review gate): an earlier version of this comment claimed the
  // test would hang if the decrement moved back below the guarded call. That is
  // FALSE — `guard` catches, so a trailing decrement still runs. This test pins
  // that containment does not COST ticks, not the ordering. `>= 4` rather than
  // `=== 4` because the accumulator carries float dust that a simDtMs retune
  // could push either side of the boundary.
  it('drains the accumulator when EVERY tick throws (no infinite loop)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { app, step } = fakeApp();
    let ticks = 0;
    startLoop(app, {
      simTick: () => {
        ticks += 1;
        throw new Error('always');
      },
      render: () => undefined,
    });
    step(SIM_DT_MS * 4);
    expect(ticks).toBeGreaterThanOrEqual(4);
  });
});

describe('loop containment — reporting is bounded and delegated', () => {
  it('reports a repeating identical failure ONCE, not once per frame', () => {
    const onError = vi.fn();
    const { app, step } = fakeApp();
    startLoop(app, {
      simTick: () => {
        throw new Error('same message every time');
      },
      render: () => undefined,
      onError,
    });
    for (let i = 0; i < 20; i++) step(SIM_DT_MS);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('reports simTick and render failures as distinct phases', () => {
    const onError = vi.fn();
    const { app, step } = fakeApp();
    startLoop(app, {
      simTick: () => {
        throw new Error('x');
      },
      render: () => {
        throw new Error('x');
      },
      onError,
    });
    step(SIM_DT_MS);
    const phases = onError.mock.calls.map((c) => c[1]);
    expect(phases).toEqual(['simTick', 'render']);
  });

  it('falls back to console.error when the caller supplies no hook', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { app, step } = fakeApp();
    startLoop(app, {
      simTick: () => {
        throw new Error('unhooked');
      },
      render: () => undefined,
    });
    step(SIM_DT_MS);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('survives a hook that throws, and does not re-break the loop', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { app, step } = fakeApp();
    let ticks = 0;
    startLoop(app, {
      simTick: () => {
        ticks += 1;
        if (ticks === 1) throw new Error('boom');
      },
      render: () => undefined,
      onError: () => {
        throw new Error('the reporter is broken too');
      },
    });
    step(SIM_DT_MS);
    step(SIM_DT_MS);
    expect(ticks).toBe(2); // the loop outlived a broken reporter
    expect(spy).toHaveBeenCalledTimes(1); // degraded to the fallback
  });

  // EXACT, not `<=` (review gate): a `<=` bound also passes when reporting is
  // broken entirely and onError is never called at all.
  it('caps distinct reports at 8 per phase so a varying failure cannot spam', () => {
    const onError = vi.fn();
    const { app, step } = fakeApp();
    let n = 0;
    startLoop(app, {
      simTick: () => {
        n += 1;
        throw new Error(`unique ${n}`);
      },
      render: () => undefined,
      onError,
    });
    for (let i = 0; i < 50; i++) step(SIM_DT_MS);
    expect(onError).toHaveBeenCalledTimes(8);
  });

  // The cap is PER PHASE: a saturated simTick must not silence the FIRST render
  // failure, which under a global cap it did.
  it('a saturated simTick phase does not silence the first render failure', () => {
    const onError = vi.fn();
    const { app, step } = fakeApp();
    let n = 0;
    let renderShouldThrow = false;
    startLoop(app, {
      simTick: () => {
        n += 1;
        throw new Error(`unique ${n}`);
      },
      render: () => {
        if (renderShouldThrow) throw new Error('the render failure that matters');
      },
      onError,
    });
    for (let i = 0; i < 30; i++) step(SIM_DT_MS); // saturate simTick
    onError.mockClear();
    renderShouldThrow = true;
    step(SIM_DT_MS);
    const phases = onError.mock.calls.map((c) => c[1]);
    expect(phases).toContain('render');
  });

  // The reporter runs inside guard's CATCH — anything it throws escapes and
  // kills the ticker, re-arming the original bug from inside the containment.
  it('survives thrown values that are hostile to inspection', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const hostile: unknown[] = [
      Object.create(null), // String(err) throws: no toPrimitive
      new Proxy({}, { getPrototypeOf: () => { throw new Error('nope'); } }), // instanceof throws
    ];
    for (const value of hostile) {
      const { app, step } = fakeApp();
      let ticks = 0;
      startLoop(app, {
        simTick: () => {
          ticks += 1;
          if (ticks === 1) throw value;
        },
        render: () => undefined,
      });
      expect(() => step(SIM_DT_MS)).not.toThrow();
      step(SIM_DT_MS);
      expect(ticks).toBe(2); // the loop outlived it
    }
  });

  it('survives an onError defined as a throwing getter', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { app, step } = fakeApp();
    let ticks = 0;
    const cb = {
      simTick: () => {
        ticks += 1;
        if (ticks === 1) throw new Error('boom');
      },
      render: () => undefined,
    };
    Object.defineProperty(cb, 'onError', {
      get() {
        throw new Error('hostile getter');
      },
    });
    startLoop(app, cb as LoopCallbacks);
    expect(() => step(SIM_DT_MS)).not.toThrow();
    step(SIM_DT_MS);
    expect(ticks).toBe(2);
  });
});

describe('loop containment — the Story 6.3 disposer still works', () => {
  it('detaches the tick callback so a torn-down session stops stepping', () => {
    const handle = fakeApp();
    let ticks = 0;
    const stop = startLoop(handle.app, {
      simTick: () => {
        ticks += 1;
      },
      render: () => undefined,
    });
    handle.step(SIM_DT_MS);
    expect(ticks).toBe(1);
    const running = handle.listeners;
    stop();
    expect(handle.listeners).toBe(running - 1); // only the game tick goes; Pixi's (guarded) draw stays
    handle.step(SIM_DT_MS);
    expect(ticks).toBe(1); // no sim tick may run after the room is left
  });
});

// STORY 11.2 FOLLOW-UP 3 (ruling R3): Pixi's OWN render listener is a frame path
// too. A live alpha mask whose texture source was destroyed made `app.render`
// throw inside Pixi's ticker, which then never requested another frame — the
// picture froze AND the input stopped riding the wire.
describe('loop containment — a throw inside Pixi\'s own render costs one frame', () => {
  it('keeps ticking, sampling input and rendering after app.render throws, and reports it once', () => {
    let draws = 0;
    let throwsLeft = 2;
    const handle = fakeApp(() => {
      draws += 1;
      if (throwsLeft > 0) {
        throwsLeft -= 1;
        throw new TypeError("Cannot read properties of null (reading '0')");
      }
    });
    let ticks = 0;
    let renders = 0;
    const onError = vi.fn();
    startLoop(handle.app, {
      simTick: () => {
        ticks += 1; // the input sampler + send live here
      },
      render: () => {
        renders += 1;
      },
      onError,
    });
    for (let k = 0; k < 5; k++) handle.step(SIM_DT_MS);
    expect(handle.dead).toBe(false);
    expect(ticks).toBe(5);
    expect(renders).toBe(5);
    expect(draws).toBe(5); // the next frame was requested and drawn every time
    expect(onError).toHaveBeenCalledTimes(1); // same message twice → one report
    expect(onError.mock.calls[0][1]).toBe('pixiRender');
  });

  it('Pixi\'s draw runs after the game\'s render callback, once per frame (its priority is kept)', () => {
    const order: string[] = [];
    const { app, step } = fakeApp(() => order.push('pixi'));
    startLoop(app, { simTick: () => order.push('sim'), render: () => order.push('render') });
    step(SIM_DT_MS);
    expect(order).toEqual(['sim', 'render', 'pixi']);
  });

  it('stays guarded after the game loop stops (home screen), falling back to one console line', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let draws = 0;
    const { app, step } = fakeApp(() => {
      draws += 1;
      throw new Error('draw boom');
    });
    const stop = startLoop(app, { simTick: () => undefined, render: () => undefined, onError: () => undefined });
    step(SIM_DT_MS);
    stop();
    step(SIM_DT_MS);
    step(SIM_DT_MS);
    expect(draws).toBe(3);
    expect(err).toHaveBeenCalledTimes(1);
  });

  it('containAppRender is idempotent: one guarded draw per frame however often it is called', () => {
    let draws = 0;
    const { app, step } = fakeApp(() => {
      draws += 1;
    });
    containAppRender(app);
    containAppRender(app);
    startLoop(app, { simTick: () => undefined, render: () => undefined });
    step(SIM_DT_MS);
    expect(draws).toBe(1);
  });
});
