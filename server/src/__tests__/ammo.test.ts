// The pure ammo/reload state machine (weapons/ammo.ts): fresh pools, the reload
// fill chain with overshoot carry across tick boundaries, and consume rules
// (starts the timer only when idle; impossible at empty).

import { describe, it, expect } from 'vitest';
import type { WeaponAmmo } from '@salvo/shared';
import { freshAmmo, tickReload, consume } from '../game/equipment/ammo.js';

const RELOAD = 3000;
const MAX = 2;

/** Run tickReload for `totalMs` in `dtMs` steps (mutating + returning `w`). */
function tickFor(w: WeaponAmmo, maxAmmo: number, reloadMs: number, totalMs: number, dtMs = 50): WeaponAmmo {
  for (let t = 0; t < totalMs; t += dtMs) tickReload(w, maxAmmo, reloadMs, dtMs);
  return w;
}

describe('freshAmmo', () => {
  it('is a full pool with an idle timer', () => {
    expect(freshAmmo(2)).toEqual({ n: 2, reloadMsLeft: 0 });
    expect(freshAmmo(1)).toEqual({ n: 1, reloadMsLeft: 0 });
  });
});

describe('tickReload — at full', () => {
  it('holds the pool at max and pins the timer to 0', () => {
    const w: WeaponAmmo = { n: MAX, reloadMsLeft: 0 };
    tickReload(w, MAX, RELOAD, 50);
    expect(w).toEqual({ n: MAX, reloadMsLeft: 0 });
  });

  it('pins a stray positive timer back to 0 when already full', () => {
    const w: WeaponAmmo = { n: MAX, reloadMsLeft: 500 };
    tickReload(w, MAX, RELOAD, 50);
    expect(w).toEqual({ n: MAX, reloadMsLeft: 0 });
  });
});

describe('tickReload — single fill', () => {
  it('refills exactly one round after reloadMs and settles idle (still at max)', () => {
    const w: WeaponAmmo = { n: MAX - 1, reloadMsLeft: RELOAD };
    tickFor(w, MAX, RELOAD, RELOAD); // exactly one reload's worth of ticks
    expect(w.n).toBe(MAX);
    expect(w.reloadMsLeft).toBe(0); // reached max -> idle
  });

  it('does not top up before the timer crosses zero', () => {
    const w: WeaponAmmo = { n: 0, reloadMsLeft: RELOAD };
    tickFor(w, MAX, RELOAD, RELOAD - 50);
    expect(w.n).toBe(0);
    expect(w.reloadMsLeft).toBeCloseTo(50, 6);
  });
});

describe('tickReload — two-deep deficit refills in exactly 2×reloadMs with overshoot carry', () => {
  it('carries the overshoot across the tick boundary (uneven divisor)', () => {
    // reloadMs deliberately NOT a multiple of dtMs, so each fill overshoots zero.
    const reloadMs = 3020; // 60.4 ticks of 50ms
    const w: WeaponAmmo = { n: 0, reloadMsLeft: reloadMs };
    // Just before 2×reload: still one short (second fill hasn't landed yet).
    tickFor(w, MAX, reloadMs, 2 * reloadMs - 50);
    expect(w.n).toBe(1);
    // Cross the second boundary: pool full, timer idle, no lost/duplicated time.
    tickFor(w, MAX, reloadMs, 100);
    expect(w.n).toBe(MAX);
    expect(w.reloadMsLeft).toBe(0);
  });

  it('after the first fill restarts the timer (still below max)', () => {
    const w: WeaponAmmo = { n: 0, reloadMsLeft: 20 }; // 20ms from the first fill
    tickReload(w, MAX, RELOAD, 50); // crosses zero by 30ms
    expect(w.n).toBe(1); // first round in
    // Overshoot carry: 20 - 50 = -30, then + RELOAD => RELOAD - 30 remaining.
    expect(w.reloadMsLeft).toBe(RELOAD - 30);
  });
});

describe('consume', () => {
  it('from a full/idle pool draws one round and starts the reload', () => {
    const w = freshAmmo(MAX);
    expect(consume(w, RELOAD)).toBe(true);
    expect(w).toEqual({ n: MAX - 1, reloadMsLeft: RELOAD });
  });

  it('while already reloading draws a round but does NOT reset the running timer', () => {
    const w: WeaponAmmo = { n: 1, reloadMsLeft: 1200 };
    expect(consume(w, RELOAD)).toBe(true);
    expect(w).toEqual({ n: 0, reloadMsLeft: 1200 }); // timer untouched
  });

  it('at zero returns false and changes nothing', () => {
    const w: WeaponAmmo = { n: 0, reloadMsLeft: 1500 };
    expect(consume(w, RELOAD)).toBe(false);
    expect(w).toEqual({ n: 0, reloadMsLeft: 1500 });
  });
});

describe('consume + tickReload — a 1-deep pool behaves like the old cooldown', () => {
  it('fires, denies for reloadMs, then is ready again', () => {
    const w = freshAmmo(1);
    expect(consume(w, RELOAD)).toBe(true); // fire
    expect(w.n).toBe(0);
    tickFor(w, 1, RELOAD, RELOAD - 50); // just short of ready
    expect(consume(w, RELOAD)).toBe(false); // still empty
    tickFor(w, 1, RELOAD, 100); // cross the boundary
    expect(w.n).toBe(1);
    expect(consume(w, RELOAD)).toBe(true); // ready again
  });
});
