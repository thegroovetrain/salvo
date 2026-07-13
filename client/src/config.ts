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
     * leadMax. At maxSpeed 25 u/s this reaches ~100u before the cap.
     */
    leadSeconds: 4,
    /** Lead distance cap (u) = 0.5 * sight range, per the plan. */
    leadMax: CONFIG.vision.sight * 0.5,
  },

  /** Wake trail — continuous speed feedback behind the hull. */
  wake: {
    /** Don't spawn wake below this speed magnitude (u/s). */
    minSpeed: 1.5,
    /** Spawn one dot per this many world-units travelled (spatial density). */
    spacing: 6,
    /** Particle lifetime (s). */
    life: 1.1,
    /** Base radius of a wake dot (u). */
    radius: 2.6,
    /** Peak alpha at spawn (scaled by speed fraction). */
    alpha: 0.28,
    /** Wake color (tactical green, DESIGN.md wake trail). */
    color: 0x00ff88,
  },

  /**
   * Remote-entity interpolation delay (ms). Placeholder for the netcode steps;
   * unused in the offline drive step but declared so the state/render shape is
   * stable when snapshots arrive.
   */
  interpDelayMs: CONFIG.tick.interpDelayMs,

  /** Deterministic map seed for the offline step (no server yet). */
  mapSeed: 42,
} as const;
