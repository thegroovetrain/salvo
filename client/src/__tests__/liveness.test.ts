// Story 6.6 — the home screen's `/liveness` client: the strict shape guard,
// the clock-skew correction, and the fail-safe poll.
//
// Everything here is about ONE property: the home screen must never be broken,
// blocked, or lied to by this module. Every failure mode — an outage, a 500, a
// timeout, a proxy's HTML error page, an old server missing a field, a NaN —
// has to arrive at the UI as the SAME thing: `null`, meaning "unavailable, show
// nothing". So most of these tests are shaped as "feed it garbage, assert
// null", deliberately.

import { describe, it, expect, vi, afterEach } from 'vitest';
import type { LivenessPayload } from '@salvo/shared';
import {
  fetchLiveness,
  livenessUrl,
  localizeDeadline,
  parseLiveness,
  skewOffsetMs,
  startLivenessPoll,
} from '../net/liveness.js';

/** A well-formed payload; spread over it to build the malformed variants. */
function payload(over: Partial<LivenessPayload> = {}): LivenessPayload {
  return {
    playersOnline: 23,
    liveGames: 2,
    queue: { pooled: 3, min: 2, cap: 20, deadlineAt: 1_000_000 },
    modes: { standard: { players: 20, games: 1 }, soloVsAi: { players: 3, games: 1 } },
    serverNow: 900_000,
    ...over,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('livenessUrl — the origin idiom probeServer uses', () => {
  it('is the ws endpoint rewritten to http, with the route appended once', () => {
    const url = livenessUrl();
    expect(url.startsWith('http')).toBe(true);
    expect(url).not.toContain('ws://');
    expect(url.endsWith('/liveness')).toBe(true);
    expect(url.match(/\/liveness/g)).toHaveLength(1);
    expect(url).not.toContain('//liveness'); // a trailing-slash origin must not double up
  });
});

describe('parseLiveness — the strict shape guard', () => {
  it('accepts a well-formed payload and returns it unchanged', () => {
    const p = payload();
    expect(parseLiveness(p)).toBe(p);
  });

  it('accepts `queue: null` — no queue room is the NORMAL empty state, not an error', () => {
    expect(parseLiveness(payload({ queue: null }))).not.toBeNull();
  });

  it('accepts an UNARMED pool (deadlineAt null) — null is load-bearing, not missing', () => {
    const p = payload({ queue: { pooled: 1, min: 2, cap: 20, deadlineAt: null } });
    expect(parseLiveness(p)).not.toBeNull();
  });

  it('accepts an honest ZERO everywhere (a dead server is a valid answer)', () => {
    const p = payload({
      playersOnline: 0,
      liveGames: 0,
      queue: { pooled: 0, min: 2, cap: 20, deadlineAt: null },
      modes: { standard: { players: 0, games: 0 }, soloVsAi: { players: 0, games: 0 } },
    });
    expect(parseLiveness(p)).not.toBeNull();
  });

  it.each([
    ['not an object', 'hello'],
    ['null', null],
    ['an array-ish nothing', undefined],
  ])('rejects %s', (_label, raw) => {
    expect(parseLiveness(raw)).toBeNull();
  });

  it('rejects NON-NUMERIC top-level counts — a NaN on screen is worse than nothing', () => {
    expect(parseLiveness(payload({ playersOnline: '23' as unknown as number }))).toBeNull();
    expect(parseLiveness(payload({ liveGames: NaN }))).toBeNull();
    expect(parseLiveness(payload({ serverNow: null as unknown as number }))).toBeNull();
    expect(parseLiveness(payload({ playersOnline: Infinity }))).toBeNull();
  });

  it('rejects a MISSING field (an older server, a partial response)', () => {
    const p = payload() as unknown as Record<string, unknown>;
    delete p.liveGames;
    expect(parseLiveness(p)).toBeNull();
    const q = payload() as unknown as Record<string, unknown>;
    delete q.queue; // absent is NOT the same as an explicit null
    expect(parseLiveness(q)).toBeNull();
  });

  it('rejects a malformed QUEUE (any non-numeric member)', () => {
    expect(parseLiveness(payload({ queue: { pooled: 'x', min: 2, cap: 20, deadlineAt: null } as never }))).toBeNull();
    expect(parseLiveness(payload({ queue: { pooled: 1, min: 2, cap: 20 } as never }))).toBeNull();
    expect(parseLiveness(payload({ queue: { pooled: 1, min: 2, cap: 20, deadlineAt: 'soon' } as never }))).toBeNull();
  });

  it('rejects malformed MODES, including a missing sub-object', () => {
    expect(parseLiveness(payload({ modes: null as never }))).toBeNull();
    expect(parseLiveness(payload({ modes: { standard: { players: 1, games: 1 } } as never }))).toBeNull();
    expect(
      parseLiveness(payload({ modes: { standard: { players: 1, games: 'x' }, soloVsAi: { players: 0, games: 0 } } as never })),
    ).toBeNull();
  });
});

describe('clock skew — the countdown is correct on a wrong client clock', () => {
  it('measures how far AHEAD the server clock runs', () => {
    expect(skewOffsetMs(payload({ serverNow: 1000 }), 1000)).toBe(0);
    expect(skewOffsetMs(payload({ serverNow: 31_000 }), 1000)).toBe(30_000); // client 30s slow
    expect(skewOffsetMs(payload({ serverNow: 1000 }), 31_000)).toBe(-30_000); // client 30s fast
  });

  it('rewrites deadlineAt into the CLIENT epoch so `deadline - Date.now()` is right', () => {
    // Server says: it is 900_000, and the pool forms at 1_000_000 → 100s away.
    // This client's clock reads 5_000_000 (wildly wrong). The localized deadline
    // must therefore be 5_100_000 — still exactly 100s away by the LOCAL clock.
    const local = localizeDeadline(payload(), 5_000_000);
    expect(local.queue?.deadlineAt).toBe(5_100_000);
    expect((local.queue?.deadlineAt ?? 0) - 5_000_000).toBe(100_000);
  });

  it('never mutates the payload it was handed', () => {
    const p = payload();
    localizeDeadline(p, 5_000_000);
    expect(p.queue?.deadlineAt).toBe(1_000_000);
  });

  it('passes an unarmed pool / absent queue straight through — nothing to move', () => {
    const unarmed = payload({ queue: { pooled: 1, min: 2, cap: 20, deadlineAt: null } });
    expect(localizeDeadline(unarmed, 5_000_000)).toBe(unarmed);
    const none = payload({ queue: null });
    expect(localizeDeadline(none, 5_000_000)).toBe(none);
  });
});

describe('fetchLiveness — fails SAFE on every path', () => {
  it('parses a healthy 200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => payload() }));
    await expect(fetchLiveness()).resolves.toMatchObject({ playersOnline: 23 });
  });

  it('resolves null on a network error — never rejects into the home screen', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(fetchLiveness()).resolves.toBeNull();
  });

  it('resolves null on a non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => payload() }));
    await expect(fetchLiveness()).resolves.toBeNull();
  });

  it('resolves null when the body is not JSON (a proxy error page, a captive portal)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
    }));
    await expect(fetchLiveness()).resolves.toBeNull();
  });

  it('resolves null when the JSON parses but the SHAPE does not hold', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ playersOnline: 'lots' }) }));
    await expect(fetchLiveness()).resolves.toBeNull();
  });

  it('carries an abort signal (the timeout bound), and asks for GET', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => payload() });
    vi.stubGlobal('fetch', fetchMock);
    await fetchLiveness(1234);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('GET');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    // NOT `mode:'no-cors'` — that is probeServer's ping, which reads no body.
    // This one needs the JSON, so it must be a real CORS request.
    expect(init.mode).toBeUndefined();
  });
});

describe('startLivenessPoll', () => {
  it('reads IMMEDIATELY — a 10s blank home would read as broken, not as loading', async () => {
    const seen: Array<LivenessPayload | null> = [];
    const poll = startLivenessPoll((p) => seen.push(p), {
      fetchOnce: async () => payload(),
      now: () => 900_000,
    });
    await vi.waitFor(() => expect(seen).toHaveLength(1));
    poll.stop();
    expect(seen[0]?.playersOnline).toBe(23);
  });

  it('localizes the deadline against the injected clock before publishing', async () => {
    const seen: Array<LivenessPayload | null> = [];
    const poll = startLivenessPoll((p) => seen.push(p), {
      fetchOnce: async () => payload(),
      now: () => 5_000_000,
    });
    await vi.waitFor(() => expect(seen).toHaveLength(1));
    poll.stop();
    expect(seen[0]?.queue?.deadlineAt).toBe(5_100_000);
  });

  it('publishes NULL (unavailable) when the read fails, and keeps polling', async () => {
    vi.useFakeTimers();
    const seen: Array<LivenessPayload | null> = [];
    let attempt = 0;
    const poll = startLivenessPoll((p) => seen.push(p), {
      intervalMs: 1000,
      fetchOnce: async () => (++attempt === 1 ? null : payload()),
      now: () => 900_000,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(seen).toEqual([null]); // the outage is published, not swallowed
    await vi.advanceTimersByTimeAsync(1000);
    expect(seen).toHaveLength(2);
    expect(seen[1]).not.toBeNull(); // ...and recovery is picked up on the next cycle
    poll.stop();
  });

  it('an injected fetcher that REJECTS is still just "unavailable"', async () => {
    const seen: Array<LivenessPayload | null> = [];
    const poll = startLivenessPoll((p) => seen.push(p), {
      fetchOnce: async () => {
        throw new Error('boom');
      },
    });
    await vi.waitFor(() => expect(seen).toEqual([null]));
    poll.stop();
  });

  it('stop() ends the chain AND suppresses an in-flight response', async () => {
    vi.useFakeTimers();
    const seen: Array<LivenessPayload | null> = [];
    const gate: { release: (() => void) | null } = { release: null };
    const poll = startLivenessPoll((p) => seen.push(p), {
      intervalMs: 1000,
      fetchOnce: () => new Promise<LivenessPayload>((res) => {
        gate.release = () => res(payload());
      }),
    });
    await vi.advanceTimersByTimeAsync(0);
    poll.stop();
    gate.release?.(); // the home is already gone; this must paint nothing
    await vi.advanceTimersByTimeAsync(10_000);
    expect(seen).toEqual([]);
  });

  it('does not stack requests: the next cycle is scheduled only after the last settles', async () => {
    vi.useFakeTimers();
    let inFlight = 0;
    let peak = 0;
    const poll = startLivenessPoll(() => undefined, {
      intervalMs: 100,
      fetchOnce: async () => {
        peak = Math.max(peak, ++inFlight);
        await new Promise((res) => setTimeout(res, 5000)); // slower than the interval
        inFlight--;
        return payload();
      },
    });
    await vi.advanceTimersByTimeAsync(20_000);
    poll.stop();
    expect(peak).toBe(1);
  });

  it('a THROWING consumer does not kill the poll', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const poll = startLivenessPoll(
      () => {
        calls++;
        throw new Error('the home blew up');
      },
      { intervalMs: 100, fetchOnce: async () => payload() },
    );
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(100);
    poll.stop();
    expect(calls).toBeGreaterThanOrEqual(2);
  });
});
