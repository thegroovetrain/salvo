// FRAME-LOOP CONTAINMENT (cycle 90) — the client's equivalent of the server's
// story-0.3 tick-error containment. Until this cycle `app/loop.ts` ran both
// per-frame callbacks bare, and Pixi 8's ticker clears `_requestId` BEFORE
// calling update() and only re-requests the frame AFTER it returns — so one
// escaped throw meant NO FRAME WAS EVER REQUESTED AGAIN: input sampling stops
// and the server sails your hull on its last engine order while the picture
// freezes. That is the failure the boon-cards investigation traced.
//
// The trap these tests exist to pin: the accumulator decrement MUST happen
// before `simTick`. A guard placed around the call while the decrement stayed
// after it would never decrement on a throwing tick, so `accumulator >= SIM_DT`
// would never clear — converting a freeze into a HUNG TAB, strictly worse.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { CONFIG } from '@salvo/shared';
import { startLoop, type LoopCallbacks } from '../app/loop.js';

const SIM_DT_MS = CONFIG.tick.simDtMs;

/** A minimal stand-in for the one Pixi surface `startLoop` touches. Returns a
 *  `step(deltaMS)` that drives whatever the loop registered. */
function fakeApp(): { app: never; step: (deltaMS: number) => void; listeners: number } {
  const fns: ((t: { deltaMS: number }) => void)[] = [];
  const ticker = {
    add: (fn: (t: { deltaMS: number }) => void) => fns.push(fn),
    remove: (fn: (t: { deltaMS: number }) => void) => {
      const i = fns.indexOf(fn);
      if (i >= 0) fns.splice(i, 1);
    },
  };
  const handle = {
    app: { ticker } as unknown as never,
    step: (deltaMS: number) => {
      for (const fn of [...fns]) fn({ deltaMS });
    },
    get listeners(): number {
      return fns.length;
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

  it('survives a throwing render and keeps the sim stepping', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { app, step } = fakeApp();
    let ticks = 0;
    startLoop(app, {
      simTick: () => {
        ticks += 1;
      },
      render: () => {
        throw new Error('render boom');
      },
    });
    step(SIM_DT_MS);
    step(SIM_DT_MS);
    expect(ticks).toBe(2);
  });

  // THE HANG GUARD. One frame carrying 4 sim steps' worth of time must run
  // EXACTLY 4 ticks even when every one of them throws. If the decrement moved
  // back below the call this asserts nothing — it never returns.
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
    expect(ticks).toBe(4);
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

  it('caps distinct reports so a per-frame-varying failure cannot spam', () => {
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
    expect(onError.mock.calls.length).toBeLessThanOrEqual(8);
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
    stop();
    expect(handle.listeners).toBe(0);
    handle.step(SIM_DT_MS);
    expect(ticks).toBe(1); // no sim tick may run after the room is left
  });
});
