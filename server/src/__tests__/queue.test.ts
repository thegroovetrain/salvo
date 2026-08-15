// Story 6.1 — the queue's arm/form policy, tested against the spec's I/O
// matrix row by row. This is deliberately unit-level against the PURE
// queueStep(): the whole reason the policy lives outside StandardQueueRoom is
// that "min 2 captains, one hard deadline, cap forms early" is the rule this
// story can silently break, and it must be provable without a transport, a
// matchmaker, or a wall clock.
//
// The adapter's own responsibilities (seat reservation, liveness sends, the
// JOINING guard) are integration surface and are covered by the queue smoke;
// what is checked HERE is that no state combination can start a 1-human match,
// and that the deadline never moves.

import { describe, it, expect, afterEach } from 'vitest';
import { CONFIG, PROTOCOL_VERSION } from '@salvo/shared';
import { ErrorCode, ServerError } from 'colyseus';
import { defaultQueueConfig, queueStep, type QueueConfig, type QueueState } from '../rooms/queue.js';
import { sanitizeExpectedCaptains, sanitizeRoomOptions } from '../rooms/roomOptions.js';
import { ArenaRoom, ARENA_DIRECT_JOIN_ERROR } from '../rooms/ArenaRoom.js';

const CFG: QueueConfig = defaultQueueConfig();
const MIN = CFG.minHumans;
const CAP = CFG.cap;
const TIMER = CFG.queueTimerMs;

/** One step at `nowMs` over `pooled` captains with the given armed stamp. */
function step(nowMs: number, pooled: number, armedAtMs: number | null = null, cfg: QueueConfig = CFG) {
  const state: QueueState = { nowMs, pooled, armedAtMs };
  return queueStep(state, cfg);
}

// --- config projection -------------------------------------------------------

describe('defaultQueueConfig', () => {
  it('projects CONFIG verbatim — the queue never forks the arena cap', () => {
    expect(CFG.minHumans).toBe(CONFIG.match.minHumans);
    expect(CFG.cap).toBe(CONFIG.map.playerCap);
    expect(CFG.queueTimerMs).toBe(CONFIG.match.queueTimerMs);
    // The ruled shape (Eric 2026-08-14): 2 captains, 2:00 hold, cap 20.
    expect(CFG.minHumans).toBe(2);
    expect(CFG.cap).toBe(20);
    expect(CFG.queueTimerMs).toBe(120000);
  });
});

// --- matrix row: lone captain ------------------------------------------------

describe('lone captain', () => {
  it('never arms, never forms, and reports no countdown', () => {
    const d = step(1000, 1);
    expect(d.armedAtMs).toBeNull();
    expect(d.form).toBe(false);
    expect(d.formCount).toBe(0);
    expect(d.startsInMs).toBeNull();
  });

  it('still does not form after well past the deadline duration', () => {
    // Nothing ever armed, so there is no deadline to expire in the first place.
    for (const now of [TIMER, TIMER * 2, TIMER * 100]) {
      const d = step(now, 1);
      expect(d.armedAtMs).toBeNull();
      expect(d.form).toBe(false);
    }
  });

  it('never forms an empty pool either', () => {
    const d = step(5000, 0);
    expect(d.armedAtMs).toBeNull();
    expect(d.form).toBe(false);
  });
});

// --- matrix row: arm ---------------------------------------------------------

describe('arm', () => {
  it('arms at exactly minHumans and starts the full countdown', () => {
    const d = step(7000, MIN);
    expect(d.armedAtMs).toBe(7000);
    expect(d.form).toBe(false);
    expect(d.startsInMs).toBe(TIMER);
  });

  it('does not re-arm on a later step — armedAtMs is carried, not recomputed', () => {
    const d = step(7000 + 30000, MIN + 3, 7000);
    expect(d.armedAtMs).toBe(7000);
    expect(d.startsInMs).toBe(TIMER - 30000);
  });
});

// --- matrix row: timer expiry ------------------------------------------------

describe('timer expiry', () => {
  it('does not form one millisecond early', () => {
    const d = step(1000 + TIMER - 1, MIN, 1000);
    expect(d.form).toBe(false);
    expect(d.startsInMs).toBe(1);
  });

  it('forms exactly at the deadline with everyone pooled', () => {
    const d = step(1000 + TIMER, 5, 1000);
    expect(d.form).toBe(true);
    expect(d.formCount).toBe(5);
    expect(d.startsInMs).toBe(0);
  });

  it('forms on any step after the deadline (a missed tick never strands a pool)', () => {
    const d = step(1000 + TIMER + 45_000, MIN, 1000);
    expect(d.form).toBe(true);
    expect(d.formCount).toBe(MIN);
  });
});

// --- matrix row: early-arm at cap --------------------------------------------

describe('early form at cap', () => {
  it('forms the instant the pool reaches cap, ignoring the remaining timer', () => {
    const d = step(1000, CAP, 1000);
    expect(d.form).toBe(true);
    expect(d.formCount).toBe(CAP);
    // The timer had not even started running down.
    expect(d.startsInMs).toBe(TIMER);
  });

  it('forms in the SAME step the pool jumps from below min straight to cap', () => {
    // Arm and cap-form resolve in one pass: nothing must wait a tick for the
    // arm to "take" when the pool is already full.
    const d = step(1000, CAP, null);
    expect(d.form).toBe(true);
    expect(d.formCount).toBe(CAP);
    // Armed and formed in the same pass, so the arm is already spent: forming
    // clears it, and the next cohort starts from null rather than inheriting a
    // stamp that is instantly expired.
    expect(d.armedAtMs).toBeNull();
  });

  it('does not form one captain short of cap before the deadline', () => {
    const d = step(2000, CAP - 1, 1000);
    expect(d.form).toBe(false);
    expect(d.formCount).toBe(0);
  });
});

// --- matrix row: drop below min after arm ------------------------------------

describe('drop below min after arm', () => {
  it('retains armedAtMs and does NOT form at expiry while below min', () => {
    const d = step(1000 + TIMER + 60_000, 1, 1000);
    expect(d.armedAtMs).toBe(1000); // retained, not cleared
    expect(d.form).toBe(false);
    expect(d.startsInMs).toBe(0); // deadline visibly passed...
  });

  it('forms as soon as the pool re-reaches min, with no fresh wait', () => {
    const d = step(1000 + TIMER + 60_001, MIN, 1000);
    expect(d.form).toBe(true);
    expect(d.formCount).toBe(MIN);
    // The waiting captain does not serve a second sentence — but the form
    // still spends the arm, so the NEXT cohort in this room waits its own full
    // timer instead of being matched instantly forever after.
    expect(d.armedAtMs).toBeNull();
  });

  it('an empty pool at expiry still does not form', () => {
    const d = step(1000 + TIMER, 0, 1000);
    expect(d.form).toBe(false);
    expect(d.formCount).toBe(0);
  });
});

// --- matrix row: re-join churn -----------------------------------------------

describe('re-join churn', () => {
  it('never moves the deadline across an arbitrary leave/rejoin sequence', () => {
    // Simulated pool sizes over 30s steps: arm at 2, churn around min, end at 2.
    const churn = [2, 1, 2, 1, 2, 3, 1, 2];
    let armedAtMs: number | null = null;
    let now = 1000;
    for (const pooled of churn) {
      const d = queueStep({ nowMs: now, pooled, armedAtMs }, CFG);
      armedAtMs = d.armedAtMs;
      // Never forms early: every step below is inside the deadline.
      if (now < 1000 + TIMER) expect(d.form).toBe(false);
      now += 10_000;
    }
    expect(armedAtMs).toBe(1000); // set at the first step, never touched since
  });

  it('a captain cycling cannot extend the hold: the deadline still fires on schedule', () => {
    // Arm at t=1000, churn for the whole window, be at min again at expiry.
    const d = step(1000 + TIMER, MIN, 1000);
    expect(d.form).toBe(true);
  });
});

// --- matrix row: overflow ----------------------------------------------------

describe('overflow past cap', () => {
  it('forms exactly cap captains and leaves the remainder for the next form', () => {
    const pooled = CAP + 5;
    const d = step(1000, pooled, 1000);
    expect(d.form).toBe(true);
    expect(d.formCount).toBe(CAP);
    expect(pooled - d.formCount).toBe(5); // the surplus that stays pooled
  });

  it('clears the arm when it forms, so the surplus serves its OWN full timer', () => {
    // Forming is a cohort boundary: the seated captains have left for the
    // arena, so the 5 left behind must not inherit the expired remains of the
    // departed cohort's deadline. Without this, a queue room that had once
    // expired would form every later pair INSTANTLY for the rest of its life
    // and the 2:00 wait would silently evaporate after the first match.
    const formed = step(1000, CAP + 5, 1000);
    expect(formed.form).toBe(true);
    expect(formed.armedAtMs).toBeNull();

    // The surplus re-arms fresh on the next step...
    const rearmed = step(2000, 5, formed.armedAtMs);
    expect(rearmed.form).toBe(false);
    expect(rearmed.armedAtMs).toBe(2000);
    expect(rearmed.startsInMs).toBe(TIMER);

    // ...and only forms once its own full timer has run.
    expect(step(2000 + TIMER - 1, 5, rearmed.armedAtMs).form).toBe(false);
    expect(step(2000 + TIMER, 5, rearmed.armedAtMs).form).toBe(true);
  });

  it('a surplus below min waits, exactly like a fresh lone captain', () => {
    const d = step(1000 + TIMER, 1, 1000);
    expect(d.form).toBe(false);
  });
});

// --- countdown reporting (QueueStatusMsg.startsInMs) -------------------------

describe('startsInMs', () => {
  it('is null while unarmed and clamped at 0 once the deadline passes', () => {
    expect(step(0, MIN - 1).startsInMs).toBeNull();
    expect(step(1000 + TIMER + 999_999, 1, 1000).startsInMs).toBe(0);
  });

  it('counts down monotonically from the arm stamp', () => {
    const a = step(1000, MIN, 1000).startsInMs;
    const b = step(31_000, MIN, 1000).startsInMs;
    expect(a).toBe(TIMER);
    expect(b).toBe(TIMER - 30_000);
    expect(Number(b)).toBeLessThan(Number(a));
  });
});

// --- guardrail: nothing may start a 1-human match ----------------------------

describe('min-2 invariant', () => {
  it('holds across the whole (pooled x elapsed x armed) grid', () => {
    for (const pooled of [0, 1, 2, 3, CAP - 1, CAP, CAP + 7]) {
      for (const elapsed of [0, 1, TIMER - 1, TIMER, TIMER * 3]) {
        for (const armedAtMs of [null, 0]) {
          const d = queueStep({ nowMs: elapsed, pooled, armedAtMs }, CFG);
          if (d.form) {
            expect(d.formCount).toBeGreaterThanOrEqual(MIN);
            expect(d.formCount).toBeLessThanOrEqual(CAP);
            expect(d.formCount).toBeLessThanOrEqual(pooled);
          } else {
            expect(d.formCount).toBe(0);
          }
        }
      }
    }
  });
});

// --- the arena's public door (Story 6.1) -------------------------------------

describe('ArenaRoom direct-join door', () => {
  const previous = process.env.HC_DEV_OPTIONS;
  afterEach(() => {
    if (previous === undefined) delete process.env.HC_DEV_OPTIONS;
    else process.env.HC_DEV_OPTIONS = previous;
  });

  it('rejects a direct joinOrCreate("arena") when HC_DEV_OPTIONS is unset', async () => {
    delete process.env.HC_DEV_OPTIONS;
    const err = await ArenaRoom.onAuth('', { pv: PROTOCOL_VERSION }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ServerError);
    expect((err as ServerError).code).toBe(ErrorCode.AUTH_FAILED);
    expect((err as ServerError).message).toBe(ARENA_DIRECT_JOIN_ERROR);
  });

  it('rejects a direct join for any non-"1" HC_DEV_OPTIONS value (fail closed)', async () => {
    for (const value of ['0', 'true', '', 'yes']) {
      process.env.HC_DEV_OPTIONS = value;
      await expect(ArenaRoom.onAuth('', { pv: PROTOCOL_VERSION })).rejects.toThrow(/not joinable directly/);
    }
  });

  it('still lets the dev door through with HC_DEV_OPTIONS=1', async () => {
    process.env.HC_DEV_OPTIONS = '1';
    await expect(ArenaRoom.onAuth('', { pv: PROTOCOL_VERSION })).resolves.toBe(true);
  });

  it('reports a stale bundle as a version mismatch BEFORE the closed-door message', async () => {
    // Ordering matters for the menu: a stale client must be told to refresh,
    // not told it used the wrong door.
    delete process.env.HC_DEV_OPTIONS;
    await expect(ArenaRoom.onAuth('', { pv: PROTOCOL_VERSION + 1 })).rejects.toThrow(/refresh/);
  });
});

// --- expectedCaptains (Eric ruling 2026-08-14: the boarding handshake) -------

describe('sanitizeExpectedCaptains', () => {
  it('passes a legitimate group size through unchanged', () => {
    for (const n of [MIN, 3, CAP - 1, CAP]) expect(sanitizeExpectedCaptains(n)).toBe(n);
  });

  it('clamps a forged value into [minHumans, playerCap]', () => {
    expect(sanitizeExpectedCaptains(0)).toBe(MIN);
    expect(sanitizeExpectedCaptains(-99)).toBe(MIN);
    expect(sanitizeExpectedCaptains(10_000)).toBe(CAP);
  });

  it('rejects non-integers and non-numbers outright (no boarding expectation)', () => {
    for (const bad of [undefined, null, NaN, Infinity, 2.5, '5', {}, []]) {
      expect(sanitizeExpectedCaptains(bad)).toBeUndefined();
    }
  });

  it('survives sanitizeRoomOptions WITHOUT the dev gate — the queue always sets it', () => {
    const prod = sanitizeRoomOptions({ expectedCaptains: 7 }, false);
    expect(prod.sanitized.expectedCaptains).toBe(7);
    expect(prod.rejectedKeys).toEqual([]);
    const dev = sanitizeRoomOptions({ expectedCaptains: 7 }, true);
    expect(dev.sanitized.expectedCaptains).toBe(7);
  });

  it('is absent for a directly-created arena that never passed one', () => {
    expect(sanitizeRoomOptions({}, false).sanitized.expectedCaptains).toBeUndefined();
    expect(sanitizeRoomOptions({}, true).sanitized.expectedCaptains).toBeUndefined();
  });
});
