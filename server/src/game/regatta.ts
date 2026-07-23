// Regatta Hoist personal-hue assignment (Story 1.12). PURE — zero Colyseus
// imports, fully unit-testable. The server assigns each human a unique hue INDEX
// (0..19) into the shared REGATTA_HUES wheel at join; the index rides the roster
// (PlayerMeta.color) so every screen agrees. This module is the ONLY assignment
// source (Eric ruling 2026-07-23: FIRST-COME-FIRST-SERVED at join, colors never
// change mid-match):
//   - preference free  → grant it;
//   - preference taken → nearest FREE hue by circular index distance, ties
//     resolved CLOCKWISE (ascending index) — from pref 7 with 5 and 9 both free
//     at distance 2, pick 9;
//   - no preference    → a uniformly-random free hue off the room's decorrelated
//     hue RNG stream;
//   - wheel exhausted  → defensive deterministic fallback (never throws).
// The reserved bands (amber / red / storm-violet / phosphor-green) are excluded
// by wheel CONSTRUCTION — nothing here re-checks them; the wheel is the whitelist.

import { REGATTA_HUES, type Rng } from '@salvo/shared';

/** Wheel size (20). The hue index space is [0, WHEEL). */
const WHEEL = REGATTA_HUES.length;

/** The free hue indices, in ascending order, given the currently-used set. */
function freeHues(used: ReadonlySet<number>): number[] {
  const free: number[] = [];
  for (let i = 0; i < WHEEL; i++) if (!used.has(i)) free.push(i);
  return free;
}

/**
 * The nearest free hue to `pref` by circular index distance, ties going CLOCKWISE
 * (ascending index): at each distance d we probe the clockwise neighbor
 * `(pref+d) % WHEEL` BEFORE the counter-clockwise `(pref-d) % WHEEL`, so a tie
 * awards the ascending side (pref 7, 5 & 9 free → 9). The caller only invokes this
 * when at least one hue is free, so the loop always returns before falling
 * through; the trailing `return pref` is unreachable belt-and-braces.
 */
function nearestFree(pref: number, used: ReadonlySet<number>): number {
  for (let d = 1; d <= WHEEL; d++) {
    const cw = (pref + d) % WHEEL;
    if (!used.has(cw)) return cw;
    const ccw = (pref - d + WHEEL) % WHEEL;
    if (!used.has(ccw)) return ccw;
  }
  return pref;
}

/**
 * Assign a hue index for a joining human. `used` is the set of hue indices the
 * roster already holds (drones/no-hue carry the 255 sentinel and are NOT in it),
 * `pref` the sanitized preference (0..19 or undefined), `rng` the room's
 * decorrelated hue stream (seeded mulberry32 — no Math.random). Deterministic
 * given (used, pref, rng state). The wheel cap equals the player cap, so the
 * exhausted branch is defensive only — it returns `pref ?? 0` rather than throw
 * (joinOrder is not available to this pure function).
 */
export function assignHue(used: ReadonlySet<number>, pref: number | undefined, rng: Rng): number {
  const free = freeHues(used);
  if (free.length === 0) return pref ?? 0; // defensive: wheel exhausted (unreachable at cap 20)
  if (pref !== undefined) {
    return used.has(pref) ? nearestFree(pref, used) : pref;
  }
  return rng.pick(free);
}
