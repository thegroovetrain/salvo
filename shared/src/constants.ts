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

  /** Ship hull + kinematics (one identical hull for every ship). */
  ship: {
    length: 40, // u — hull long axis (bow-to-stern)
    beam: 12, // u — hull width (used as capsule diameter)
    // Feel knobs bumped ~50% after the 2026-07-13 owner play test ("very slow").
    maxSpeed: 38, // u/s — full-ahead (feel: 25 read as sluggish)
    reverseSpeed: 12, // u/s — full-astern (magnitude); scaled with maxSpeed
    accel: 9, // u/s^2 — throttling up (feel: reach the higher top speed briskly)
    decel: 14, // u/s^2 — throttling down / braking (feel: scaled with accel)
    turnRate: 0.75, // rad/s — yaw rate at full rudder (feel: 0.6 was too lazy)
    steerageSpeed: 10, // u/s — speed at which rudder reaches full authority
    hp: 100, // hit points (=> ~15-30s TTK with gun damage)
    respawnDelay: 3000, // ms — delay before respawn (prototype)
    islandSpeedMult: 0.25, // speed multiplier on island grazing push-out
  },

  /** Vision + radar (fog-of-war ranges). */
  vision: {
    sight: 220, // u — true-sight bubble (actual ships visible)
    radar: 650, // u — radar sweep range (paints stale blips)
    sweepPeriod: 4000, // ms — one full radar revolution
  },

  /** Guns (weapon 0): broadside batteries. */
  gun: {
    shellSpeed: 130, // u/s — shell muzzle velocity
    shellRange: 480, // u — max shell travel before expiring
    reload: 3000, // ms — per-mount reload
    damage: 15, // hp per hit
    shellRadius: 2, // u — shell collision radius (added to hull capsule radius)
    selfHitGrace: 100, // ms — a shell can't hit its own firer
    mounts: [
      { name: 'port', offset: deg(90), halfArc: deg(60) }, // +90deg, +/-60deg
      { name: 'starboard', offset: deg(-90), halfArc: deg(60) }, // -90deg, +/-60deg
    ],
  },

  /** Torpedoes (weapon 1): bow tube. Never painted by radar. */
  torpedo: {
    // Single tube (owner play test 2026-07-13): two tubes fired both fish within
    // ~2 ticks of one click, masking the 12s reload entirely. One fish per click
    // + a real reload is the intended commitment-spike feel.
    tubes: 1, // bow tube
    offset: deg(0), // bow-centered
    halfArc: deg(30), // +/-30deg launch arc
    speed: 55, // u/s
    damage: 55, // hp
    reload: 12000, // ms — per tube
    hitRadius: 2, // u — torpedo collision radius added to the hull capsule
    selfHitGrace: 100, // ms — a torpedo can't hit its own firer
  },

  /** Mines (weapon 2): dropped astern. Never on radar. */
  mine: {
    offset: deg(180), // astern
    armDelay: 3000, // ms — before it can trigger
    triggerRadius: 25, // u — detonation proximity
    damage: 45, // hp
    dropCooldown: 8000, // ms — between drops
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

/** Map radius for a given player cap: base * sqrt(cap / capRef). */
export function mapRadius(playerCap: number): number {
  return CONFIG.map.baseRadius * Math.sqrt(playerCap / CONFIG.map.capRef);
}
