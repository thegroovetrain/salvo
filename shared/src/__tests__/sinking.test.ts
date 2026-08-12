import { describe, it, expect } from 'vitest';
import { CONFIG } from '../constants.js';
import {
  applySinkingDecel,
  founderDeadline,
  hasFoundered,
  sinkingRemaining,
  sinkingSpeedCap,
} from '../sim/sinking.js';
import { stepShip, type ShipState } from '../sim/ship.js';
import { boostedKinematics } from '../sim/boost.js';
import * as shared from '../index.js';

const DT = CONFIG.tick.simDtMs; // 50 ms — the one fixed sim step
const WINDOW = CONFIG.ship.sinkingWindowMs;
const TB = CONFIG.shipClasses.torpedoBoat.kinematics; // fastest hull = worst case

/** A hull mid-ocean, already at some way. Fresh per test — the fold mutates. */
function ship(speed: number, heading = 0): ShipState {
  return { x: 0, y: 0, heading, speed };
}

describe('CONFIG.ship.sinkingWindowMs — amendment 13', () => {
  it('is EXACTLY the flat 5000 ms Eric ruled, for all classes (there is only one)', () => {
    // "5s is fine all around" — per-class windows were offered and DECLINED.
    // A second window constant appearing anywhere is a ruling change.
    expect(WINDOW).toBe(5000);
  });

  it('is a whole number of 50 ms ticks, so cap-zero and the founder tick coincide', () => {
    expect(WINDOW % DT).toBe(0);
  });

  it('fixes the mine interaction in place: armDelay (3000) < window (5000)', () => {
    // Amendment 13 names this: a mine laid in the first two seconds of
    // sinking arms BEFORE its layer founders; one laid later arms after.
    expect(CONFIG.mine.armDelay).toBe(3000);
    expect(CONFIG.mine.armDelay).toBeLessThan(WINDOW);
  });
});

describe('sinkingRemaining — the window fraction', () => {
  it('runs 1 at sink-entry, linearly to 0 at the deadline, and stays 0 after', () => {
    const since = 100_000;
    expect(sinkingRemaining(since, since)).toBe(1);
    expect(sinkingRemaining(since, since + WINDOW / 4)).toBeCloseTo(0.75, 12);
    expect(sinkingRemaining(since, since + WINDOW / 2)).toBeCloseTo(0.5, 12);
    expect(sinkingRemaining(since, since + WINDOW)).toBe(0);
    expect(sinkingRemaining(since, since + WINDOW * 3)).toBe(0);
  });

  it('clamps a not-yet-started window to 1 and FAILS CLOSED on a corrupt clock', () => {
    expect(sinkingRemaining(1000, 500)).toBe(1); // now < since: full window ahead
    // NaN timestamps read as 0 — a broken clock STOPS a sinking hull rather
    // than freeing it (the collision.ts clamp01 idiom).
    expect(sinkingRemaining(NaN, 500)).toBe(0);
    expect(sinkingRemaining(1000, NaN)).toBe(0);
  });
});

describe('applySinkingDecel — the linear cap (the applyGroundingDamp precedent)', () => {
  it('caps an over-cap speed and leaves an under-cap speed untouched', () => {
    const since = 0;
    const half = WINDOW / 2; // cap = maxSpeed / 2 = 22.5
    const fast = ship(TB.maxSpeed);
    applySinkingDecel(fast, TB.maxSpeed, since, half);
    expect(fast.speed).toBeCloseTo(TB.maxSpeed / 2, 12);
    const slow = ship(10); // below the 22.5 cap — a slow hull is NOT dragged down early
    applySinkingDecel(slow, TB.maxSpeed, since, half);
    expect(slow.speed).toBe(10);
  });

  it('preserves sign — a hull making sternway decays to a stop the same way', () => {
    const astern = ship(-TB.reverseSpeed);
    // Late in the window the cap (45 × 0.1 = 4.5) undercuts full astern (15).
    applySinkingDecel(astern, TB.maxSpeed, 0, WINDOW * 0.9);
    expect(astern.speed).toBeCloseTo(-TB.maxSpeed * 0.1, 12);
  });

  it('forces EXACTLY 0 at the deadline — no epsilon, no asymptote', () => {
    const s = ship(TB.maxSpeed);
    applySinkingDecel(s, TB.maxSpeed, 0, WINDOW);
    expect(s.speed).toBe(0);
  });

  it('brings a full-ahead hull under live helm to a FULL STOP within the window', () => {
    // The AC's sentence, run literally: helm at full ahead + full rudder for
    // the whole window, stepped at the real 50 ms dt through the real stepShip
    // then the fold — exactly the server/predictor call pattern.
    const s = ship(TB.maxSpeed);
    let prevSpeed = s.speed;
    let turned = 0;
    for (let now = DT; now <= WINDOW; now += DT) {
      const h0 = s.heading;
      stepShip(s, { throttle: 1, rudder: 1 }, TB, DT / 1000);
      applySinkingDecel(s, TB.maxSpeed, 0, now);
      expect(s.speed).toBeLessThanOrEqual(prevSpeed); // monotone ritardando
      prevSpeed = s.speed;
      if (s.heading !== h0) turned += 1;
    }
    expect(s.speed).toBe(0);
    // The rudder BIT while the hull was making way — the point of the story:
    // a sinking captain can still turn to bring guns to bear.
    expect(turned).toBeGreaterThan(WINDOW / DT / 2);
  });

  it('is STATELESS and NON-COMPOUNDING: a second application on the same tick is a no-op', () => {
    // The cycle-59 grounding lesson — a per-tick multiplier compounds, a cap
    // derived from (since, now) alone cannot.
    const s = ship(TB.maxSpeed);
    applySinkingDecel(s, TB.maxSpeed, 0, WINDOW / 2);
    const once = s.speed;
    applySinkingDecel(s, TB.maxSpeed, 0, WINDOW / 2);
    expect(s.speed).toBe(once);
  });

  it('mutates NOTHING but speed, and never raises it', () => {
    const s = ship(30, 1.25);
    s.x = 77;
    s.y = -13;
    applySinkingDecel(s, TB.maxSpeed, 0, WINDOW * 0.75);
    expect({ x: s.x, y: s.y, heading: s.heading }).toEqual({ x: 77, y: -13, heading: 1.25 });
    const idle = ship(0);
    applySinkingDecel(idle, TB.maxSpeed, 0, 0);
    expect(idle.speed).toBe(0); // a cap never accelerates a stopped hull
  });
});

describe('speedBoost composes (amendment 10) — a doomed surge, never a no-op', () => {
  const BONUS = CONFIG.speedBoost.speedBonus;

  it('the boosted per-tick max raises the cap by bonus × remaining', () => {
    const t = WINDOW / 2;
    const boosted = boostedKinematics(TB, BONUS, true);
    const capBase = sinkingSpeedCap(TB.maxSpeed, 0, t);
    const capBoosted = sinkingSpeedCap(boosted.maxSpeed, 0, t);
    // The decel is a cap the boost PUSHES AGAINST: Eric admitted speedBoost
    // while sinking on the fitment criterion, knowing it fights the
    // ritardando — so it must genuinely lift the ceiling, not be refused.
    expect(capBoosted).toBeCloseTo(capBase + BONUS * 0.5, 12);
    expect(capBoosted).toBeGreaterThan(capBase);
  });

  it('a mid-window boost lets the hull ACCELERATE above the unboosted cap', () => {
    const s = ship(TB.maxSpeed);
    const boosted = boostedKinematics(TB, BONUS, true);
    // Sail unboosted to mid-window (speed pinned to the falling cap)...
    for (let now = DT; now <= WINDOW / 2; now += DT) {
      stepShip(s, { throttle: 1, rudder: 0 }, TB, DT / 1000);
      applySinkingDecel(s, TB.maxSpeed, 0, now);
    }
    const atHalf = s.speed;
    // ...then punch the boost for one tick: the hull genuinely SURGES.
    stepShip(s, { throttle: 1, rudder: 0 }, boosted, DT / 1000);
    applySinkingDecel(s, boosted.maxSpeed, 0, WINDOW / 2 + DT);
    expect(s.speed).toBeGreaterThan(atHalf);
    expect(s.speed).toBeGreaterThan(sinkingSpeedCap(TB.maxSpeed, 0, WINDOW / 2 + DT));
  });

  it('...and is still DOOMED: boosted or not, the cap is exactly 0 at the deadline', () => {
    const boosted = boostedKinematics(TB, BONUS, true);
    expect(sinkingSpeedCap(boosted.maxSpeed, 0, WINDOW)).toBe(0);
    const s = ship(TB.maxSpeed + BONUS);
    applySinkingDecel(s, boosted.maxSpeed, 0, WINDOW);
    expect(s.speed).toBe(0);
  });
});

describe('founderDeadline / hasFoundered — the window expiry', () => {
  it('the deadline is since + the one CONFIG window', () => {
    expect(founderDeadline(120_000)).toBe(120_000 + WINDOW);
  });

  it('founders INCLUSIVELY at the deadline tick — cap-zero and founder agree', () => {
    const since = 7_350; // any tick-aligned server time
    expect(hasFoundered(since, since + WINDOW - DT)).toBe(false);
    expect(hasFoundered(since, since + WINDOW)).toBe(true);
    expect(hasFoundered(since, since + WINDOW + DT)).toBe(true);
    // The agreement itself: the tick that founders is the tick the cap hits 0.
    expect(sinkingSpeedCap(TB.maxSpeed, since, since + WINDOW)).toBe(0);
    expect(sinkingSpeedCap(TB.maxSpeed, since, since + WINDOW - DT)).toBeGreaterThan(0);
  });

  it('is deterministic — pure math over (since, now), same answer every call', () => {
    for (let i = 0; i < 3; i++) {
      expect(founderDeadline(999)).toBe(999 + WINDOW);
      expect(sinkingRemaining(999, 999 + 1234)).toBe(sinkingRemaining(999, 999 + 1234));
    }
  });
});

describe('barrel', () => {
  it('sim/sinking.ts rides the shared barrel', () => {
    const ns = shared as Record<string, unknown>;
    for (const name of [
      'sinkingRemaining',
      'sinkingSpeedCap',
      'applySinkingDecel',
      'founderDeadline',
      'hasFoundered',
    ]) {
      expect(typeof ns[name], name).toBe('function');
    }
  });
});
