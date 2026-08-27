// Story 7-8 (Eric ruling 2026-08-27, epic-7 amendment 45) — the per-IP
// solo-create throttle. Two layers, matching the queue.ts posture the policy
// module copies:
//
//   1. the PURE policy (soloThrottle.ts): limit boundary, rolling-window
//      expiry, refusals-never-consume-quota, and the memory bound (the sweep
//      that stops an address-spraying attacker growing the ledger).
//   2. the ADAPTER (ArenaRoom.static onAuth): the 7th create inside the window
//      from one address is refused with the human-readable message, the 6th is
//      admitted, addresses are independent, the env knob works, the no-address
//      local path fails OPEN, and the QUEUE door is untouched.
//
// The adapter's 7th-refused test is the regression discriminator: delete the
// throttle call from onAuth and it fails (proven by a temporary revert during
// this story's implementation).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { AuthContext } from 'colyseus';
import { PROTOCOL_VERSION } from '@salvo/shared';
import {
  SOLO_CREATE_DEFAULT_LIMIT,
  SOLO_CREATE_THROTTLE_ERROR,
  SOLO_CREATE_WINDOW_MS,
  admitSoloCreate,
  clientIpFrom,
  resolveSoloCreateLimit,
  type SoloCreateLedger,
} from '../rooms/soloThrottle.js';
import { ArenaRoom, ARENA_DIRECT_JOIN_ERROR, resetSoloCreateThrottle } from '../rooms/ArenaRoom.js';
import { StandardQueueRoom } from '../rooms/StandardQueueRoom.js';

const CFG = { limit: SOLO_CREATE_DEFAULT_LIMIT, windowMs: SOLO_CREATE_WINDOW_MS };

describe('resolveSoloCreateLimit', () => {
  it('defaults to 6 when the env var is absent or blank', () => {
    expect(resolveSoloCreateLimit(undefined)).toBe(6);
    expect(resolveSoloCreateLimit('')).toBe(6);
    expect(resolveSoloCreateLimit('   ')).toBe(6);
  });

  it('honors a positive integer', () => {
    expect(resolveSoloCreateLimit('1')).toBe(1);
    expect(resolveSoloCreateLimit('12')).toBe(12);
  });

  it("'0' disables the throttle (the load-test self-boot needs this)", () => {
    expect(resolveSoloCreateLimit('0')).toBe(0);
  });

  // Fail CLOSED to the default: a typo must not silently remove the guard.
  it('falls back to 6 on garbage, negatives, and fractions', () => {
    expect(resolveSoloCreateLimit('banana')).toBe(6);
    expect(resolveSoloCreateLimit('-1')).toBe(6);
    expect(resolveSoloCreateLimit('2.5')).toBe(6);
    expect(resolveSoloCreateLimit('NaN')).toBe(6);
  });
});

describe('clientIpFrom — rightmost x-forwarded-for entry', () => {
  it('returns null for an absent or empty header (the fail-open signal)', () => {
    expect(clientIpFrom(undefined)).toBeNull();
    expect(clientIpFrom(null)).toBeNull();
    expect(clientIpFrom('')).toBeNull();
    expect(clientIpFrom(' ,  , ')).toBeNull();
  });

  it('returns a lone entry', () => {
    expect(clientIpFrom('203.0.113.7')).toBe('203.0.113.7');
  });

  // The trust model: leftmost entries are client-forgeable; the rightmost was
  // appended by the trusted edge proxy and cannot be displaced by the client.
  it('takes the RIGHTMOST entry, never a client-forged leftmost one', () => {
    expect(clientIpFrom('forged, 198.51.100.9')).toBe('198.51.100.9');
    expect(clientIpFrom('a, b, 192.0.2.1')).toBe('192.0.2.1');
  });

  it('skips trailing empties and trims whitespace', () => {
    expect(clientIpFrom('198.51.100.9, ')).toBe('198.51.100.9');
    expect(clientIpFrom('  192.0.2.1  ')).toBe('192.0.2.1');
  });
});

describe('admitSoloCreate — the pure policy', () => {
  it('admits exactly `limit` creates in a window, then refuses', () => {
    const ledger: SoloCreateLedger = new Map();
    for (let i = 0; i < CFG.limit; i += 1) {
      expect(admitSoloCreate(ledger, 'a', 1000 + i, CFG)).toBe(true);
    }
    expect(admitSoloCreate(ledger, 'a', 1000 + CFG.limit, CFG)).toBe(false);
  });

  it('keeps addresses independent', () => {
    const ledger: SoloCreateLedger = new Map();
    for (let i = 0; i < CFG.limit; i += 1) admitSoloCreate(ledger, 'a', 1000, CFG);
    expect(admitSoloCreate(ledger, 'a', 1001, CFG)).toBe(false);
    expect(admitSoloCreate(ledger, 'b', 1001, CFG)).toBe(true);
  });

  it('rolls the window: a stamp exactly windowMs old has expired', () => {
    const ledger: SoloCreateLedger = new Map();
    for (let i = 0; i < CFG.limit; i += 1) admitSoloCreate(ledger, 'a', 1000, CFG);
    expect(admitSoloCreate(ledger, 'a', 1000 + CFG.windowMs - 1, CFG)).toBe(false);
    // At t0 + windowMs the t0 stamps are outside the rolling window.
    expect(admitSoloCreate(ledger, 'a', 1000 + CFG.windowMs, CFG)).toBe(true);
  });

  // Ruled: refusals mint nothing, so they consume nothing — and metering them
  // would let the flood itself keep a shared-NAT victim locked out forever.
  it('refusals never consume quota', () => {
    const ledger: SoloCreateLedger = new Map();
    admitSoloCreate(ledger, 'a', 1000, CFG); // 1 admit
    for (let i = 0; i < CFG.limit - 1; i += 1) admitSoloCreate(ledger, 'a', 2000, CFG); // full
    for (let i = 0; i < 50; i += 1) {
      expect(admitSoloCreate(ledger, 'a', 3000, CFG)).toBe(false); // 50 refusals
    }
    // The 1000-stamp expires; if any refusal had been recorded the bucket
    // would still be full and this would refuse.
    expect(admitSoloCreate(ledger, 'a', 1000 + CFG.windowMs, CFG)).toBe(true);
  });

  // The memory bound: every call sweeps the WHOLE ledger, so an attacker
  // spraying distinct addresses cannot grow the map past admits-in-window.
  it('prunes every expired address on any touch (memory-bounded)', () => {
    const ledger: SoloCreateLedger = new Map();
    for (let i = 0; i < 200; i += 1) admitSoloCreate(ledger, `spray-${i}`, 1000, CFG);
    expect(ledger.size).toBe(200);
    admitSoloCreate(ledger, 'fresh', 1000 + CFG.windowMs, CFG);
    expect(ledger.size).toBe(1); // only the toucher survives
    expect(ledger.has('fresh')).toBe(true);
  });

  it('drops only the expired stamps of a still-live address', () => {
    const ledger: SoloCreateLedger = new Map();
    admitSoloCreate(ledger, 'a', 1000, CFG);
    admitSoloCreate(ledger, 'a', 2000, CFG);
    admitSoloCreate(ledger, 'b', 1000 + CFG.windowMs + 500, CFG); // sweeps a's 1000
    expect(ledger.get('a')).toEqual([2000]);
  });

  it('a limit of 0 admits nothing (the adapter never calls it disabled)', () => {
    const ledger: SoloCreateLedger = new Map();
    expect(admitSoloCreate(ledger, 'a', 1000, { limit: 0, windowMs: CFG.windowMs })).toBe(false);
  });
});

describe('ArenaRoom.static onAuth — the adapter', () => {
  const ENV_KEYS = ['HC_SOLO_CREATE_LIMIT', 'HC_DEV_OPTIONS', 'HC_STAGING_KEY'] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    resetSoloCreateThrottle();
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    resetSoloCreateThrottle();
  });

  /** AuthContext as the matchmake route builds it: headers + the raw XFF-ish
   *  ip field; no socket (verified against @colyseus/core 0.17.44). */
  function ctx(xff?: string): AuthContext {
    const headers = new Headers();
    if (xff !== undefined) headers.set('x-forwarded-for', xff);
    return { headers, ip: xff ?? '' } as AuthContext;
  }

  function soloAuth(context?: AuthContext): Promise<unknown> {
    return ArenaRoom.onAuth('', { solo: true, pv: PROTOCOL_VERSION }, context);
  }

  // THE REGRESSION DISCRIMINATOR: deleting the throttle call from onAuth
  // makes this fail (the 7th create would resolve true).
  it('admits the 6th create from one address and refuses the 7th with the message', async () => {
    for (let i = 0; i < 6; i += 1) {
      await expect(soloAuth(ctx('203.0.113.7'))).resolves.toBe(true);
    }
    await expect(soloAuth(ctx('203.0.113.7'))).rejects.toThrow(SOLO_CREATE_THROTTLE_ERROR);
  });

  it('keeps addresses independent — a throttled neighbor never blocks you', async () => {
    for (let i = 0; i < 7; i += 1) await soloAuth(ctx('203.0.113.7')).catch(() => undefined);
    await expect(soloAuth(ctx('198.51.100.9'))).resolves.toBe(true);
  });

  // The forgeable HALF of XFF must buy an attacker nothing: rotating the
  // leftmost entry per request still lands every create in one bucket.
  it('cannot be evaded by rotating a client-forged leftmost XFF entry', async () => {
    for (let i = 0; i < 6; i += 1) {
      await expect(soloAuth(ctx(`fake-${i}, 203.0.113.7`))).resolves.toBe(true);
    }
    await expect(soloAuth(ctx('fake-99, 203.0.113.7'))).rejects.toThrow(SOLO_CREATE_THROTTLE_ERROR);
  });

  // A bare local run has no proxy and no header: fail OPEN (ruled), so a dev
  // machine — and every pre-existing test that passes no context — is never
  // locked out of its own solo door.
  it('fails open when no address is derivable', async () => {
    for (let i = 0; i < 20; i += 1) {
      await expect(soloAuth(undefined)).resolves.toBe(true);
      await expect(soloAuth(ctx())).resolves.toBe(true);
    }
  });

  it('HC_SOLO_CREATE_LIMIT=0 disables the throttle (load-test self-boot)', async () => {
    process.env.HC_SOLO_CREATE_LIMIT = '0';
    for (let i = 0; i < 20; i += 1) {
      await expect(soloAuth(ctx('203.0.113.7'))).resolves.toBe(true);
    }
  });

  it('HC_SOLO_CREATE_LIMIT tunes the bound', async () => {
    process.env.HC_SOLO_CREATE_LIMIT = '2';
    await expect(soloAuth(ctx('203.0.113.7'))).resolves.toBe(true);
    await expect(soloAuth(ctx('203.0.113.7'))).resolves.toBe(true);
    await expect(soloAuth(ctx('203.0.113.7'))).rejects.toThrow(SOLO_CREATE_THROTTLE_ERROR);
  });

  it('an invalid HC_SOLO_CREATE_LIMIT falls back to the default 6', async () => {
    process.env.HC_SOLO_CREATE_LIMIT = 'banana';
    for (let i = 0; i < 6; i += 1) {
      await expect(soloAuth(ctx('203.0.113.7'))).resolves.toBe(true);
    }
    await expect(soloAuth(ctx('203.0.113.7'))).rejects.toThrow(SOLO_CREATE_THROTTLE_ERROR);
  });

  // Gate ordering: PV runs first, and a PV-refused request (which mints
  // nothing) must not consume quota.
  it('PV-gate refusals precede the throttle and never consume quota', async () => {
    for (let i = 0; i < 10; i += 1) {
      await expect(
        ArenaRoom.onAuth('', { solo: true, pv: PROTOCOL_VERSION + 1 }, ctx('203.0.113.7')),
      ).rejects.toThrow(/refresh/);
    }
    for (let i = 0; i < 6; i += 1) {
      await expect(soloAuth(ctx('203.0.113.7'))).resolves.toBe(true);
    }
  });

  it('leaves the non-solo direct-join refusal byte-identical', async () => {
    await expect(ArenaRoom.onAuth('', { pv: PROTOCOL_VERSION }, ctx('203.0.113.7'))).rejects.toThrow(
      ARENA_DIRECT_JOIN_ERROR,
    );
  });

  // Ops observability (reviewer finding: the rightmost-XFF trust model is an
  // unverified deployment assumption). Only the FIRST admit per process logs;
  // every refusal logs. Never the raw header — only its entry count and the
  // derived rightmost key.
  it('logs room.soloThrottleShape once on the first admit, and on every refusal', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      for (let i = 0; i < 6; i += 1) {
        await expect(soloAuth(ctx('203.0.113.7'))).resolves.toBe(true);
      }
      await expect(soloAuth(ctx('203.0.113.7'))).rejects.toThrow(SOLO_CREATE_THROTTLE_ERROR);
      await expect(soloAuth(ctx('203.0.113.7'))).rejects.toThrow(SOLO_CREATE_THROTTLE_ERROR);

      const shapeLines = logSpy.mock.calls
        .map((args) => String(args[0]))
        .filter((line) => line.includes('room.soloThrottleShape'));
      // 1 admit line (the first of the six) + 2 refusal lines (every refusal).
      expect(shapeLines).toHaveLength(3);
      expect(shapeLines[0]).toContain('"verdict":"admitted"');
      expect(shapeLines[0]).toContain('"entries":1');
      expect(shapeLines[0]).toContain('"rightmost":"203.0.113.7"');
      expect(shapeLines[1]).toContain('"verdict":"refused"');
      expect(shapeLines[2]).toContain('"verdict":"refused"');
    } finally {
      logSpy.mockRestore();
    }
  });

  // Ruled: ONLY the solo create path is metered. The queue door is
  // socket-gated and cohort-formed; a flood there holds sockets, not rooms.
  it('never throttles the queue door', async () => {
    for (let i = 0; i < 30; i += 1) {
      await expect(
        StandardQueueRoom.onAuth('', { pv: PROTOCOL_VERSION }, ctx('203.0.113.7')),
      ).resolves.toBe(true);
    }
  });
});
