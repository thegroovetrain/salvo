// THE return-to-port chain (app/returnToPort.ts): ad break → leave() raced
// against a timeout → reload. Every row of the fix's I/O matrix, on fake timers.
//
// The regression this pins: `room.leave()` NEVER settles once the server has
// disposed the room (it does so resultsSeconds after the finish), which used to
// leave the player stranded on the results screen with no path home — the
// pre-fix chain awaited leave() unbounded, so `reload()` was never reached.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { makeReturnToPort, LEAVE_TIMEOUT_MS, type ReturnToPortDeps } from '../app/returnToPort.js';

/** A promise that never settles — a dead socket's leave(), or a hanging ad. */
function never<T>(): Promise<T> {
  return new Promise<T>(() => undefined);
}

interface Harness {
  deps: ReturnToPortDeps;
  calls: string[];
  reloads: number;
  /** Resolve the pending ad break (only for the deferred-ad harness). */
  settleAd: () => void;
}

/** Build deps + call log; `leaveRoom` and `requestAdBreak` are overridable. */
function harness(over: Partial<ReturnToPortDeps> = {}): Harness {
  const calls: string[] = [];
  const h: Harness = {
    calls,
    reloads: 0,
    settleAd: () => undefined,
    deps: {
      requestAdBreak: () => {
        calls.push('adBreak');
        return Promise.resolve();
      },
      leaveRoom: () => {
        calls.push('leave');
        return Promise.resolve();
      },
      reload: () => {
        calls.push('reload');
        h.reloads += 1;
      },
      onStart: () => calls.push('start'),
      ...over,
    },
  };
  return h;
}

describe('makeReturnToPort — the chain always settles to a reload', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('happy path: ad break, then leave() resolves, then reload — in that order', async () => {
    const h = harness();
    makeReturnToPort(h.deps)();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.calls).toEqual(['start', 'adBreak', 'leave', 'reload']);
    expect(h.reloads).toBe(1);
  });

  it('leave() rejects: the rejection is swallowed and the reload still fires', async () => {
    const h = harness({
      leaveRoom: () => {
        h.calls.push('leave');
        return Promise.reject(new Error('socket already closed'));
      },
    });
    makeReturnToPort(h.deps)();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.calls).toEqual(['start', 'adBreak', 'leave', 'reload']);
    expect(h.reloads).toBe(1);
  });

  it('leave() throws synchronously: still one clean reload', async () => {
    const h = harness({
      leaveRoom: () => {
        h.calls.push('leave');
        throw new Error('leave exploded');
      },
    });
    makeReturnToPort(h.deps)();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.calls).toEqual(['start', 'adBreak', 'leave', 'reload']);
    expect(h.reloads).toBe(1);
  });

  // THE regression pin: a dead room's leave() never settles. Without the race
  // the chain hangs here forever and the player is stranded — so the assertion
  // that reload has NOT fired before the timer, and HAS fired after it, is
  // exactly what fails against the pre-fix behavior (where it never fires).
  it('leave() NEVER settles: the race timer wins and reloads anyway', async () => {
    const h = harness({
      leaveRoom: () => {
        h.calls.push('leave');
        return never<void>();
      },
    });
    makeReturnToPort(h.deps)();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.calls).toEqual(['start', 'adBreak', 'leave']); // hung — no reload yet
    expect(h.reloads).toBe(0);
    await vi.advanceTimersByTimeAsync(LEAVE_TIMEOUT_MS - 1);
    expect(h.reloads).toBe(0); // still inside the race window
    await vi.advanceTimersByTimeAsync(1);
    expect(h.reloads).toBe(1); // the timeout is the handler
    expect(h.calls).toEqual(['start', 'adBreak', 'leave', 'reload']);
  });

  it('honors a custom race window', async () => {
    const h = harness({ leaveRoom: () => never<void>(), leaveTimeoutMs: 25 });
    makeReturnToPort(h.deps)();
    await vi.advanceTimersByTimeAsync(24);
    expect(h.reloads).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.reloads).toBe(1);
  });

  it('waits for the ad break before leaving — it is never cut off by this chain', async () => {
    let releaseAd: (() => void) | undefined;
    const h = harness({
      requestAdBreak: () => {
        h.calls.push('adBreak');
        return new Promise<void>((resolve) => {
          releaseAd = resolve;
        });
      },
    });
    makeReturnToPort(h.deps)();
    // A long ad (safeAdapter already caps it at 35s): nothing else has run.
    await vi.advanceTimersByTimeAsync(30_000);
    expect(h.calls).toEqual(['start', 'adBreak']);
    releaseAd?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.calls).toEqual(['start', 'adBreak', 'leave', 'reload']);
  });

  it('a rejected ad break does not abort the chain', async () => {
    const h = harness({
      requestAdBreak: () => {
        h.calls.push('adBreak');
        return Promise.reject(new Error('no fill'));
      },
    });
    makeReturnToPort(h.deps)();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.calls).toEqual(['start', 'adBreak', 'leave', 'reload']);
    expect(h.reloads).toBe(1);
  });

  it('double activation is a no-op: onStart, leave and reload each happen once', async () => {
    const h = harness();
    const go = makeReturnToPort(h.deps);
    go();
    go(); // second click / a key right after the click
    await vi.advanceTimersByTimeAsync(0);
    go(); // and again after the chain completed
    await vi.advanceTimersByTimeAsync(0);
    expect(h.calls).toEqual(['start', 'adBreak', 'leave', 'reload']);
    expect(h.reloads).toBe(1);
  });

  it('latches even while the chain is hung on a dead leave()', async () => {
    const h = harness({ leaveRoom: () => never<void>() });
    const go = makeReturnToPort(h.deps);
    go();
    await vi.advanceTimersByTimeAsync(0);
    go(); // mashing RETURN TO PORT while it looks stuck
    go();
    await vi.advanceTimersByTimeAsync(LEAVE_TIMEOUT_MS);
    expect(h.reloads).toBe(1);
    expect(h.calls.filter((c) => c === 'adBreak')).toHaveLength(1);
  });

  it('is per-instance: two factories latch independently', async () => {
    const a = harness();
    const b = harness();
    makeReturnToPort(a.deps)();
    makeReturnToPort(b.deps)();
    await vi.advanceTimersByTimeAsync(0);
    expect(a.reloads).toBe(1);
    expect(b.reloads).toBe(1);
  });

  it('runs without an onStart hook', async () => {
    const h = harness({ onStart: undefined });
    makeReturnToPort(h.deps)();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.calls).toEqual(['adBreak', 'leave', 'reload']);
  });
});
