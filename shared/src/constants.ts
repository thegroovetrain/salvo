// Single source of truth for every simulation tunable.
// One `CONFIG` object, nested by system. Units are noted per field:
//   u = world units, u/s = units/second, u/s^2 = accel, rad = radians,
//   rad/s = angular rate, ms = milliseconds.
//
// Angle helpers below keep mount/arc definitions readable in degrees.

const deg = (d: number): number => (d * Math.PI) / 180;

export const CONFIG = {
  /** Circular water map. radius = base * sqrt(playerCap / capRef). */
  map: {
    baseRadius: 900, // u — map radius tuned for capRef players
    capRef: 6, // players the base radius is scaled against
    playerCap: 20, // u — max clients per arena room
    spawnFraction: 0.8, // spawn ring radius as a fraction of map radius
  },

  /**
   * Per-class hull + kinematics. Three classes trade speed against hull/hp:
   * Destroyer (fast, light) — Cruiser (balanced) — Battleship (slow, heavy).
   * The weapon fit is UNIVERSAL (every class shares CONFIG.gun/torpedo/mine);
   * only hull dims, hp, and kinematics vary. Cruiser is byte-for-byte the
   * pre-classes single ship (pinned by a balance-identity test), so a refactor
   * slip can't silently retune the game. Every number a tunable.
   */
  shipClasses: {
    destroyer: {
      hull: { length: 34, beam: 10 }, // u — long axis (bow-to-stern) / beam (capsule diameter)
      hp: 80, // hit points
      kinematics: {
        maxSpeed: 46, // u/s — full-ahead
        reverseSpeed: 14, // u/s — full-astern (magnitude); scaled with maxSpeed
        accel: 11, // u/s^2 — throttling up
        decel: 17, // u/s^2 — throttling down / braking
        turnRate: 0.9, // rad/s — yaw rate at full rudder
        steerageSpeed: 12, // u/s — speed at which rudder reaches full authority
      },
    },
    cruiser: {
      // ≙ today's ship, byte-for-byte (pinned by test).
      hull: { length: 40, beam: 12 }, // u
      hp: 100, // hit points (=> ~15-30s TTK with gun damage)
      kinematics: {
        maxSpeed: 38, // u/s — full-ahead
        reverseSpeed: 12, // u/s — full-astern (magnitude)
        accel: 9, // u/s^2 — throttling up
        decel: 14, // u/s^2 — throttling down / braking
        turnRate: 0.75, // rad/s — yaw rate at full rudder
        steerageSpeed: 10, // u/s — speed at which rudder reaches full authority
      },
    },
    battleship: {
      hull: { length: 46, beam: 14 }, // u
      hp: 120, // hit points
      kinematics: {
        maxSpeed: 30, // u/s — full-ahead
        reverseSpeed: 10, // u/s — full-astern (magnitude)
        accel: 7, // u/s^2 — throttling up
        decel: 11, // u/s^2 — throttling down / braking
        turnRate: 0.6, // rad/s — yaw rate at full rudder
        steerageSpeed: 8, // u/s — speed at which rudder reaches full authority
      },
    },
  },

  /** True ship globals shared by every class (no per-class variation). */
  ship: {
    respawnDelay: 3000, // ms — delay before respawn (prototype)
    islandSpeedMult: 0.25, // speed multiplier on island grazing push-out
  },

  /** Vision + radar (fog-of-war ranges). */
  vision: {
    sight: 220, // u — true-sight bubble (actual ships visible)
    radar: 650, // u — radar sweep range (paints stale blips)
    sweepPeriod: 4000, // ms — one full radar revolution
  },

  /**
   * Guns (weapon 0): broadside batteries. One shared AMMO POOL feeds both
   * mounts — a click fires the single mount whose arc bears on the aim, drawing
   * one round from the pool. `maxAmmo` ≈ the old pair of 3s port/starboard
   * mounts, so the sustained rate is unchanged; the accepted feel change (per
   * HULLCRACKER_NOTES) is that BOTH rounds can now go out the SAME arc.
   */
  gun: {
    shellSpeed: 130, // u/s — shell muzzle velocity
    shellRange: 480, // u — max shell travel before expiring
    maxAmmo: 2, // rounds in the shared broadside pool (≈ the old two 3s mounts)
    reloadMs: 3000, // ms — one round reloads per this interval while below max
    damage: 15, // hp per hit
    shellRadius: 2, // u — shell collision radius (added to hull capsule radius)
    selfHitGrace: 100, // ms — a shell can't hit its own firer
    mounts: [
      { name: 'port', offset: deg(90), halfArc: deg(60) }, // +90deg, +/-60deg
      { name: 'starboard', offset: deg(-90), halfArc: deg(60) }, // -90deg, +/-60deg
    ],
  },

  /**
   * Torpedoes (weapon 1): bow tube. Never painted by radar. One-deep ammo pool
   * (owner play test 2026-07-13: two tubes fired both fish within ~2 ticks of
   * one click, masking the 12s reload; one fish per click + a real reload is
   * the intended commitment-spike feel). The bow tube is now just the pool.
   */
  torpedo: {
    offset: deg(0), // bow-centered
    halfArc: deg(30), // +/-30deg launch arc
    speed: 55, // u/s
    damage: 55, // hp
    maxAmmo: 1, // one fish in the tube pool
    reloadMs: 12000, // ms — reload between fish (commitment spike)
    hitRadius: 2, // u — torpedo collision radius added to the hull capsule
    selfHitGrace: 100, // ms — a torpedo can't hit its own firer
  },

  /** Mines (weapon 2): dropped astern. Never on radar. */
  mine: {
    offset: deg(180), // astern
    armDelay: 3000, // ms — before it can trigger
    triggerRadius: 25, // u — detonation proximity
    damage: 45, // hp
    maxAmmo: 1, // stored drops in the ammo pool (one per reload)
    reloadMs: 8000, // ms — reload between drops
    // maxLive is DISTINCT from the ammo pool: the drop pool caps how many you
    // can drop before reloading; maxLive caps how many stay LIVE on the board at
    // once (oldest evicted past it). Separate stat, separate upgrade later.
    maxLive: 3, // max simultaneous live mines per player
    globalCap: 60, // defensive ceiling on total live mines across all players
  },

  /** Storm circle / battle-royale zone. */
  zone: {
    grace: 45000, // ms — full radius before shrink begins
    shrinkDuration: 180000, // ms — time to shrink to end radius
    endRadiusFraction: 0.15, // final radius as a fraction of map radius
    stormDps: 4, // hp/s — damage while outside the safe zone
  },

  /** Match lifecycle. */
  match: {
    countdown: 15000, // ms — ready-room countdown once minHumans reached
    minHumans: 2, // humans required to start the countdown
    fillTo: 6, // total ships at start (drones fill the rest)
    resultsSeconds: 10, // s — results overlay before room disposes
  },

  /** Fixed-tick timing (both server sim and client accumulator). */
  tick: {
    simDtMs: 50, // ms — simulation step (20 Hz)
    interpDelayMs: 100, // ms — remote-entity render delay (snapshot interp)
  },
} as const;

/** Static type of the CONFIG tree (used in the wire config snapshot). */
export type GameConfig = typeof CONFIG;

/** A ship-class key ('destroyer' | 'cruiser' | 'battleship'). */
export type ShipClassId = keyof typeof CONFIG.shipClasses;

/** The resolved config for one class (hull + hp + kinematics). */
export type ShipClass = (typeof CONFIG.shipClasses)[ShipClassId];

/** Ordered class ids: menu order, drone round-robin, and the balance table. */
export const SHIP_CLASS_IDS: readonly ShipClassId[] = ['destroyer', 'cruiser', 'battleship'];

/** Coerce arbitrary (wire/localStorage) input to a valid class id, default 'cruiser'. */
export function sanitizeClassId(raw: unknown): ShipClassId {
  return typeof raw === 'string' && (SHIP_CLASS_IDS as readonly string[]).includes(raw)
    ? (raw as ShipClassId)
    : 'cruiser';
}

/** Map radius for a given player cap: base * sqrt(cap / capRef). */
export function mapRadius(playerCap: number): number {
  return CONFIG.map.baseRadius * Math.sqrt(playerCap / CONFIG.map.capRef);
}
