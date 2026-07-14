// Client-only tunables. These are render/feel constants that never travel on
// the wire and are not part of the shared simulation CONFIG (that stays the
// single source of truth for anything gameplay-authoritative). If a value here
// starts to feel gameplay-load-bearing, promote it to shared CONFIG instead.

import { CONFIG } from '@salvo/shared';

export const CLIENT_CONFIG = {
  /** Camera follow + look-ahead lead (the "does it feel like a ship" knobs). */
  camera: {
    /** Exponential follow rate (1/s). Larger = camera catches the ship faster. */
    followRate: 5,
    /**
     * Look-ahead time (s). Lead distance = |speed| * leadSeconds, capped at
     * leadMax. At maxSpeed 25 u/s this reaches ~112.5u, past the leadMax cap
     * (110u @ sight 220) — the cap engages near top speed (step 11 feel-pass
     * tuning, up from 4s; flagged for playtest).
     */
    leadSeconds: 4.5,
    /** Lead distance cap (u) = 0.5 * sight range, per the plan. */
    leadMax: CONFIG.vision.sight * 0.5,
  },

  /** Wake trail — continuous speed feedback behind the hull. */
  wake: {
    /** Don't spawn wake below this speed magnitude (u/s). */
    minSpeed: 1.5,
    /** Spawn one dot per this many world-units travelled (spatial density).
     *  Step 11 feel-pass tuning: 6 -> 4 for a richer trail; flagged for playtest. */
    spacing: 4,
    /** Particle lifetime (s). */
    life: 1.1,
    /** Base radius of a wake dot (u). */
    radius: 2.6,
    /** Peak alpha at spawn (scaled by speed fraction). */
    alpha: 0.28,
    /** Wake color (tactical green, DESIGN.md wake trail). */
    color: 0x00ff88,
  },

  /** Own/contact ship view feel constants. */
  ship: {
    flashMs: 130, // ms — hit-flash duration
    sunkTint: 0x8b0000, // DESIGN.md dark crimson tint for a sunk hull
  },

  /** Netcode render delays (ms behind estimated server time). */
  net: {
    /** Remote contacts interpolate this far behind serverNow(). */
    interpDelayMs: CONFIG.tick.interpDelayMs,
    /** Own ship in the interp-checkpoint mode renders at -50ms per the plan. */
    ownDelayMs: 50,
  },
} as const;
