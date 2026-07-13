// Pure ammo/reload state machine — one pool + one reload timer per weapon,
// replacing the old per-mount cooldown arrays. A weapon has `n` rounds loaded
// and a single `reloadMsLeft` timer. The timer runs whenever the pool is below
// max: each time it crosses zero it tops the pool up by one round and, if still
// below max, restarts with OVERSHOOT CARRY (the fraction of the tick past zero
// is not lost, so a k-deep deficit refills in exactly k·reloadMs). Firing draws
// one round and starts the timer ONLY if idle — firing mid-reload does not reset
// the clock. No I/O, no CONFIG reads: callers pass maxAmmo/reloadMs so Stage D
// can feed per-ship effective stats through the same machine.

import type { WeaponAmmo } from '@salvo/shared';

/** A full pool with an idle reload timer (nothing pending). */
export function freshAmmo(maxAmmo: number): WeaponAmmo {
  return { n: maxAmmo, reloadMsLeft: 0 };
}

/**
 * Advance one weapon's reload by `dtMs`. At full the timer is pinned to 0. Below
 * max the timer decrements; on crossing <= 0 the pool gains a round and, if it
 * is still below max, the timer restarts carrying the overshoot (reloadMsLeft +=
 * reloadMs, so reloadMsLeft ends positive), else it settles at 0. Mutates `w`.
 */
export function tickReload(w: WeaponAmmo, maxAmmo: number, reloadMs: number, dtMs: number): void {
  if (w.n >= maxAmmo) {
    w.reloadMsLeft = 0;
    return;
  }
  w.reloadMsLeft -= dtMs;
  if (w.reloadMsLeft <= 0) {
    w.n += 1;
    w.reloadMsLeft = w.n < maxAmmo ? w.reloadMsLeft + reloadMs : 0;
  }
}

/**
 * Consume one round for a shot. Returns false (no state change) when the pool is
 * empty. Otherwise decrements the pool and — only if the reload was idle
 * (reloadMsLeft <= 0) — starts a fresh reload; firing while already reloading
 * leaves the running timer untouched. Mutates `w`.
 */
export function consume(w: WeaponAmmo, reloadMs: number): boolean {
  if (w.n <= 0) return false;
  w.n -= 1;
  if (w.reloadMsLeft <= 0) w.reloadMsLeft = reloadMs;
  return true;
}
