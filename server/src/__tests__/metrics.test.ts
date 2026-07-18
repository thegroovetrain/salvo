// Story 0.3 — unit tests for the process-local metrics registry + payload.
//
// The HTTP route is proven over a real socket by metricsSmoke.mjs (a later
// wave); here we test the pure math, ring-buffer capping, multi-room
// aggregation, message-bucket windowing/rate, register/unregister lifecycle,
// the degraded matchMaker payload path, and a direct endpoint-handler shape.
//
// `matchMaker.stats.local` is a mutable-let export we cannot reassign from a
// test, so we mock `colyseus` with importActual + a controllable stats getter
// (createEndpoint/createRouter still come from the real module so metrics.ts
// loads its endpoint at import time).

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { fakeStats } = vi.hoisted(() => ({
  fakeStats: { mode: 'ok' as 'ok' | 'throw', local: { roomCount: 0, ccu: 0 } },
}));

vi.mock('colyseus', async (importActual) => {
  const actual = await importActual<typeof import('colyseus')>();
  return {
    ...actual,
    matchMaker: {
      ...actual.matchMaker,
      stats: {
        get local() {
          if (fakeStats.mode === 'throw') throw new Error('matchMaker unavailable');
          return fakeStats.local;
        },
      },
    },
  };
});

import {
  registerRoom,
  resetMetrics,
  metricsPayload,
  metricsEndpoint,
  nearestRank,
  computeTickPercentiles,
  round2,
  __setNowSource,
} from '../metrics.js';

beforeEach(() => {
  resetMetrics();
  // Default the monotonic clock source back to real time before each test; the
  // message-rate suite overrides it with a controllable fake in its own setup.
  __setNowSource(() => performance.now());
  fakeStats.mode = 'ok';
  fakeStats.local = { roomCount: 0, ccu: 0 };
});

describe('round2', () => {
  it('rounds to two decimals', () => {
    expect(round2(1.23456)).toBe(1.23);
    expect(round2(1.235)).toBe(1.24);
    expect(round2(4)).toBe(4);
  });
});

describe('nearestRank percentiles', () => {
  it('returns 0 for an empty array', () => {
    expect(nearestRank([], 50)).toBe(0);
    expect(nearestRank([], 95)).toBe(0);
  });

  it('handles a single sample', () => {
    expect(nearestRank([7], 50)).toBe(7);
    expect(nearestRank([7], 95)).toBe(7);
    expect(nearestRank([7], 100)).toBe(7);
  });

  it('uses nearest-rank on a known distribution 1..10', () => {
    const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    // p50: ceil(0.5*10)=5 -> index 4 -> value 5
    expect(nearestRank(sorted, 50)).toBe(5);
    // p95: ceil(0.95*10)=10 -> index 9 -> value 10
    expect(nearestRank(sorted, 95)).toBe(10);
    // p100 -> value 10
    expect(nearestRank(sorted, 100)).toBe(10);
  });

  it('rounds rank up (p50 of 3 samples is the 2nd)', () => {
    // ceil(0.5*3)=2 -> index 1
    expect(nearestRank([10, 20, 30], 50)).toBe(20);
  });
});

describe('computeTickPercentiles', () => {
  it('is all zeros with a zero sample count when empty', () => {
    expect(computeTickPercentiles([])).toEqual({ p50: 0, p95: 0, max: 0, samples: 0 });
  });

  it('rounds ms to two decimals and reports sample count + max', () => {
    const out = computeTickPercentiles([1.111, 2.222, 3.333, 4.444]);
    expect(out.samples).toBe(4);
    expect(out.max).toBe(4.44);
    // sorts internally regardless of input order
    const shuffled = computeTickPercentiles([3.333, 1.111, 4.444, 2.222]);
    expect(shuffled).toEqual(out);
  });
});

describe('tick ring buffer', () => {
  it('caps at 1200 samples, dropping the oldest', () => {
    const room = registerRoom('r1');
    for (let i = 1; i <= 1300; i++) room.recordTick(i);
    const { tick } = metricsPayload();
    expect(tick.samples).toBe(1200);
    // oldest 100 (values 1..100) were overwritten; surviving set is 101..1300
    expect(tick.max).toBe(1300);
    // p50: ceil(0.5*1200)=600 -> 600th smallest of 101..1300 = 700
    expect(tick.p50).toBe(700);
  });
});

describe('multi-room tick aggregation', () => {
  it('combines samples across all registered rooms for percentiles', () => {
    const a = registerRoom('a');
    const b = registerRoom('b');
    a.recordTick(10);
    a.recordTick(20);
    b.recordTick(30);
    b.recordTick(40);
    const { tick } = metricsPayload();
    expect(tick.samples).toBe(4);
    expect(tick.max).toBe(40);
    // combined sorted [10,20,30,40]; p50 ceil(0.5*4)=2 -> value 20
    expect(tick.p50).toBe(20);
    // p95 ceil(0.95*4)=4 -> value 40
    expect(tick.p95).toBe(40);
  });
});

describe('message rate — windowed sum over covered seconds', () => {
  // A controllable monotonic clock (ms) so time is fully deterministic without
  // depending on whether this vitest version fakes performance.now.
  let clockMs = 0;
  const atSec = (s: number) => {
    clockMs = s * 1000;
  };

  beforeEach(() => {
    resetMetrics();
    clockMs = 0;
    __setNowSource(() => clockMs);
  });

  it('divides the windowed sum by covered seconds and tracks total since start', () => {
    atSec(100);
    const room = registerRoom('r');
    room.recordMessage();
    room.recordMessage();
    room.recordMessage(); // 3 in second 100 (also stamps firstRecordSec=100)
    atSec(101);
    room.recordMessage();
    room.recordMessage(); // 2 in second 101
    atSec(102); // query 2s after first record
    const { messages } = metricsPayload();
    expect(messages.total).toBe(5);
    // covered = 102 - 100 = 2; windowed sum = 5 -> 2.5
    expect(messages.ratePerSec).toBe(2.5);
  });

  it('averages a lone burst over the elapsed window, not the single active second', () => {
    atSec(0);
    const room = registerRoom('r');
    for (let i = 0; i < 300; i++) room.recordMessage(); // 300 messages in second 0
    atSec(30); // 30s later, otherwise idle
    const { messages } = metricsPayload();
    expect(messages.total).toBe(300);
    // OLD (bug): average over active seconds -> 300. NEW: 300 / min(60, 30) = 10.
    expect(messages.ratePerSec).toBe(10);
  });

  it('drops buckets older than the 60s window from the rate (total unaffected)', () => {
    atSec(0);
    const room = registerRoom('r');
    room.recordMessage();
    room.recordMessage(); // 2 in second 0
    atSec(61); // second 0 now outside the 60s window
    room.recordMessage(); // 1 in second 61
    const { messages } = metricsPayload();
    expect(messages.total).toBe(3); // since-start total, unaffected by window
    // windowed sum = 1 (only second 61); covered = min(60, 61) = 60 -> 1/60
    expect(messages.ratePerSec).toBe(0.02);
  });

  it('aggregates message counts across rooms in the windowed sum', () => {
    atSec(0);
    const a = registerRoom('a');
    const b = registerRoom('b');
    a.recordMessage();
    a.recordMessage(); // 2
    b.recordMessage(); // 1 -> combined 3 in second 0
    atSec(1);
    const { messages } = metricsPayload();
    expect(messages.total).toBe(3);
    // covered = 1; windowed sum 3 -> 3
    expect(messages.ratePerSec).toBe(3);
  });
});

describe('message total — retained across unregister (since process start)', () => {
  it('keeps a retired room\'s messages in the total after unregister', () => {
    const room = registerRoom('r');
    for (let i = 0; i < 5; i++) room.recordMessage();
    room.unregister();
    // Without the retiredMessageTotal fold, totalMessages() sums only live rooms
    // and this reads 0 — the "since process start" total would shrink on dispose.
    expect(metricsPayload().messages.total).toBe(5);
  });
});

describe('register / unregister lifecycle', () => {
  it('removes a room\'s samples on unregister', () => {
    const a = registerRoom('a');
    const b = registerRoom('b');
    a.recordTick(10);
    b.recordTick(20);
    a.unregister();
    const { tick } = metricsPayload();
    expect(tick.samples).toBe(1);
    expect(tick.max).toBe(20);
  });

  it('unregister is a no-op after the id was re-registered', () => {
    const first = registerRoom('a');
    first.recordTick(10);
    const second = registerRoom('a'); // re-register resets samples
    second.recordTick(99);
    first.unregister(); // stale handle must not evict the live room
    const { tick } = metricsPayload();
    expect(tick.samples).toBe(1);
    expect(tick.max).toBe(99);
  });
});

describe('metricsPayload counts', () => {
  it('reads rooms/players from matchMaker.stats.local when available', () => {
    fakeStats.local = { roomCount: 3, ccu: 7 };
    registerRoom('a'); // registry.size differs from stats to prove the source
    const payload = metricsPayload();
    expect(payload.rooms).toBe(3);
    expect(payload.players).toBe(7);
  });

  it('degrades to registered-room count and zero players when matchMaker throws', () => {
    fakeStats.mode = 'throw';
    registerRoom('a');
    registerRoom('b');
    const payload = metricsPayload();
    expect(payload.rooms).toBe(2);
    expect(payload.players).toBe(0);
  });

  it('has the full documented shape when idle', () => {
    fakeStats.mode = 'throw'; // degraded, no rooms
    const payload = metricsPayload();
    expect(payload).toEqual({
      rooms: 0,
      players: 0,
      tick: { p50: 0, p95: 0, max: 0, samples: 0 },
      messages: { ratePerSec: 0, total: 0 },
    });
  });
});

describe('metricsEndpoint direct invocation', () => {
  it('resolves to the payload JSON when called as a function', async () => {
    fakeStats.local = { roomCount: 1, ccu: 2 };
    const room = registerRoom('a');
    room.recordTick(5);
    const body = await metricsEndpoint({});
    expect(body).toMatchObject({
      rooms: 1,
      players: 2,
      tick: { samples: 1, max: 5 },
      messages: { total: 0 },
    });
  });
});
