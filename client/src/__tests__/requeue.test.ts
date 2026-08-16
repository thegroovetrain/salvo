// THE AUTO-REQUEUE CHAIN (app/requeue.ts, Story 6.3, epic-6 amendment 18):
// leave() raced against a timeout → enterPort. The returnToPort suite's shape,
// against the one thing this chain must guarantee instead of a reload — the
// survivor of a collapsed cohort always reaches port and joins exactly one
// queue.
//
// The two failures these pin:
//   • DOUBLE JOIN. The signal arrives and the room disconnects us a beat later,
//     so two independent routes reach this door. Without the latch the survivor
//     would start a second queue join (and the first would be orphaned holding a
//     socket). Every test that activates twice is that pin.
//   • A STRANDED SURVIVOR. `room.leave()` need not ever settle against a server
//     already disposing the room; an unbounded await would leave the player on a
//     frozen start line with no menu and no reload behind them.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { makeRequeue, REQUEUE_LEAVE_TIMEOUT_MS, type RequeueDeps } from '../app/requeue.js';

/** A promise that never settles — a dead socket's leave(). */
function never<T>(): Promise<T> {
  return new Promise<T>(() => undefined);
}

interface Harness {
  deps: RequeueDeps;
  calls: string[];
  ports: number;
}

function harness(over: Partial<RequeueDeps> = {}): Harness {
  const calls: string[] = [];
  const h: Harness = {
    calls,
    ports: 0,
    deps: {
      leaveRoom: () => {
        calls.push('leave');
        return Promise.resolve();
      },
      enterPort: () => {
        calls.push('enterPort');
        h.ports += 1;
      },
      onStart: () => calls.push('start'),
      ...over,
    },
  };
  return h;
}

describe('makeRequeue — the chain always settles to exactly one enterPort', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('happy path: teardown, leave, then port — in that order', async () => {
    const h = harness();
    makeRequeue(h.deps)();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.calls).toEqual(['start', 'leave', 'enterPort']);
    expect(h.ports).toBe(1);
  });

  // NOT the return-to-port chain: a collapsed lobby is not a finished match, so
  // there is no ad break in front of the leave. If one is ever added, this is
  // the test that says it was a decision.
  it('requests no ad break — the deps have no seam for one', () => {
    const h = harness();
    expect(Object.keys(h.deps)).not.toContain('requestAdBreak');
  });

  it('leave() rejects: swallowed, and we still reach port', async () => {
    const h = harness({
      leaveRoom: () => {
        h.calls.push('leave');
        return Promise.reject(new Error('socket already closed'));
      },
    });
    makeRequeue(h.deps)();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.calls).toEqual(['start', 'leave', 'enterPort']);
    expect(h.ports).toBe(1);
  });

  it('leave() throws synchronously: still one clean trip to port', async () => {
    const h = harness({
      leaveRoom: () => {
        h.calls.push('leave');
        throw new Error('leave exploded');
      },
    });
    makeRequeue(h.deps)();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.calls).toEqual(['start', 'leave', 'enterPort']);
    expect(h.ports).toBe(1);
  });

  // The stranded-survivor pin: the room is being disposed underneath us, so
  // leave() may never settle. Without the race this hangs forever.
  it('leave() NEVER settles: the race timer wins and we go home anyway', async () => {
    const h = harness({
      leaveRoom: () => {
        h.calls.push('leave');
        return never<void>();
      },
    });
    makeRequeue(h.deps)();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.ports).toBe(0); // hung inside the race window
    await vi.advanceTimersByTimeAsync(REQUEUE_LEAVE_TIMEOUT_MS - 1);
    expect(h.ports).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.calls).toEqual(['start', 'leave', 'enterPort']);
    expect(h.ports).toBe(1);
  });

  it('honors a custom race window', async () => {
    const h = harness({ leaveRoom: () => never<void>(), leaveTimeoutMs: 25 });
    makeRequeue(h.deps)();
    await vi.advanceTimersByTimeAsync(24);
    expect(h.ports).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.ports).toBe(1);
  });

  // THE DOUBLE-JOIN PIN. The `rq` signal is always followed by the room
  // disconnecting everyone, so the socket-close route reaches the same door a
  // beat behind it. Exactly one join may start.
  it('the socket closing behind the signal cannot start a second join', async () => {
    const h = harness();
    const go = makeRequeue(h.deps);
    go(); // the `rq` signal
    go(); // the disconnect that follows it
    await vi.advanceTimersByTimeAsync(0);
    go(); // and a late one, after the chain completed
    await vi.advanceTimersByTimeAsync(0);
    expect(h.calls).toEqual(['start', 'leave', 'enterPort']);
    expect(h.ports).toBe(1);
  });

  it('latches even while the chain is hung on a dead leave()', async () => {
    const h = harness({ leaveRoom: () => never<void>() });
    const go = makeRequeue(h.deps);
    go();
    await vi.advanceTimersByTimeAsync(0);
    go();
    go();
    await vi.advanceTimersByTimeAsync(REQUEUE_LEAVE_TIMEOUT_MS);
    expect(h.ports).toBe(1);
    expect(h.calls.filter((c) => c === 'start')).toHaveLength(1);
  });

  it('is per-instance: two factories latch independently', async () => {
    const a = harness();
    const b = harness();
    makeRequeue(a.deps)();
    makeRequeue(b.deps)();
    await vi.advanceTimersByTimeAsync(0);
    expect(a.ports).toBe(1);
    expect(b.ports).toBe(1);
  });

  // onStart runs AFTER the latch is set, so an unguarded throw there would
  // escape with the latch stuck on and no chain behind it — a survivor left on
  // a frozen start line with the loop already stopped, which is worse than the
  // pre-6.3 behaviour this replaced.
  it('onStart throws: the chain still runs to exactly one enterPort', async () => {
    const h = harness({
      onStart: () => {
        h.calls.push('start');
        throw new Error('teardown exploded');
      },
    });
    const go = makeRequeue(h.deps);
    expect(() => go()).not.toThrow();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.calls).toEqual(['start', 'leave', 'enterPort']);
    expect(h.ports).toBe(1);
  });

  it('runs without an onStart hook', async () => {
    const h = harness({ onStart: undefined });
    makeRequeue(h.deps)();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.calls).toEqual(['leave', 'enterPort']);
  });
});
