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
      hp: 100, // hit points (TTK follows gun.damage/reloadMs — see CONFIG.gun)
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
    damage: 25, // hp per hit — THE gun-damage tunable (pinned by damageGuardrail.test)
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
    // u/s — must outrun every ship class (destroyer maxSpeed 46 is the
    // fastest hull) so a full-speed firer can never re-catch its own fish;
    // pinned by damageGuardrail.test. Also a deliberate balance change: torps
    // are harder to dodge now (owner call, 2026-07-14 self-hit fix session).
    speed: 70, // u/s
    damage: 55, // hp
    maxAmmo: 1, // one fish in the tube pool
    reloadMs: 12000, // ms — reload between fish (commitment spike)
    hitRadius: 2, // u — torpedo collision radius added to the hull capsule
    // u — extra spawn-offset margin ON TOP of hitRadius (see hullClearOffset)
    // so the fish spawns genuinely CLEAR of the firer's own hull, not merely
    // touching it. Root fix for the self-hit bug: the old spawn point landed
    // exactly on the firer's own collision boundary with zero margin.
    spawnClearance: 6, // u
    selfHitGrace: 500, // ms — owner-only backstop against re-collision on the
    // spawn tick; never affects hitting enemies (grace only exempts the firer).
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

  /**
   * Kill-reward upgrade increments (one uniformly-random grant per kill; see
   * UPGRADE_IDS below for the canonical id order). Multiplicative entries stack
   * as base * mult^count; additive entries stack linearly. UNCAPPED by design —
   * per-stat caps are one CONFIG value away if snowballing breaks playtests.
   * Every number is a tunable.
   */
  upgrades: {
    hullPoints: { add: 20, healOnGrant: true }, // +hp max hp per stack; the grant also heals +add (clamped)
    radarRange: { mult: 1.15 }, // × radar sweep range (u) per stack
    sweepSpeed: { periodMult: 0.85 }, // × sweep period (ms) per stack — smaller = faster revolutions
    sightRange: { mult: 1.12 }, // × true-sight bubble (u) per stack (the fog hole)
    maxSpeed: { mult: 1.08 }, // × maxSpeed AND reverseSpeed (u/s); accel/turn untouched
    gunReload: { mult: 0.88 }, // × gun reload (ms) per stack — smaller = faster
    gunRange: { mult: 1.15 }, // × max shell travel (u) per stack
    gunAmmo: { add: 1 }, // +rounds in the gun pool per stack (grant also loads +1, clamped)
    torpedoReload: { mult: 0.88 }, // × torpedo reload (ms) per stack
    torpedoAmmo: { add: 1 }, // +fish in the tube pool per stack (grant also loads +1, clamped)
    torpedoSpeed: { mult: 1.12 }, // × torpedo speed (u/s) per stack
    mineReload: { mult: 0.85 }, // × mine reload (ms) per stack
    mineAmmo: { add: 1 }, // +drops in the mine pool per stack (grant also loads +1, clamped)
    maxMines: { add: 1 }, // +max simultaneous LIVE mines on the board per stack
  },

  /**
   * Spend economy layered on the kill-reward upgrades. A kill banks ONE point;
   * each point carries a pre-rolled 3-upgrade offer (see sim/offers.ts) plus the
   * always-available heal spend below. Heal is alive-only and clamped to maxHp.
   */
  upgradePoints: {
    healHp: 25, // hp restored per point spent on heal (clamped to effective maxHp)
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

  /** Transport-level networking limits (consumed by the Colyseus room). */
  net: {
    // Colyseus force-disconnects a client that exceeds this, counting msgs by
    // SERVER-SIDE ARRIVAL in 1s windows — so the budget must cover burst
    // DELIVERY, not just send cadence. The input sampler sends at the 50ms sim
    // cadence (20 msgs/s; fire rides the input message, spends are rare), but a
    // TCP stall on flaky wifi flushes every queued input in one arrival window:
    // Colyseus severs a dead socket after ~8s of failed pings, so the worst
    // honest burst is ~8s × 20 + live 20 ≈ 180 msgs in one window. 200 covers
    // that; a real flood (hundreds/s sustained) still trips in one window.
    maxMessagesPerSecond: 200,
    // Mid-match reconnect grace (seconds): how long a dropped captain's ship
    // keeps sailing under its last telegraph order before leave teardown runs.
    // Derivation: the budget is a school-wifi hiccup — an AP roam / DHCP renew
    // / tab-suspend resume settles in well under 30s; 60s covers that with
    // margin while keeping the pilotless ghost hull a bounded liability (about
    // one storm phase). Polished reconnect UX (countdown, abandon flow) is
    // Epic 6.7 — this is only the mechanism's window.
    reconnectGraceSeconds: 60,
    // Max seconds a socket may squat in JOINING before the room kicks it,
    // freeing the roster slot and its unbounded enqueued-message buffer.
    // Derivation: a real join confirmation lands in ~seconds, so 10s is
    // generous headroom for a slow-but-honest handshake while staying well
    // under the 60s reconnect grace (a stuck seat never blocks a room for long).
    joiningDeadlineSeconds: 10,
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

/**
 * Canonical upgrade id order. Upgrade COUNTS travel as a plain number[] (wire:
 * OwnShip.upg; server: ShipRecord.upgrades) indexed by THIS array — the order
 * is part of the wire contract, so append-only. Grants pick uniformly over it.
 */
export const UPGRADE_IDS = [
  'hullPoints',
  'radarRange',
  'sweepSpeed',
  'sightRange',
  'maxSpeed',
  'gunReload',
  'gunRange',
  'gunAmmo',
  'torpedoReload',
  'torpedoAmmo',
  'torpedoSpeed',
  'mineReload',
  'mineAmmo',
  'maxMines',
] as const;

/** One of the 14 upgrade type ids (see UPGRADE_IDS / CONFIG.upgrades). */
export type UpgradeId = (typeof UPGRADE_IDS)[number];

/** Ordered upgrade CATEGORY ids. Category order feeds the deterministic offer
 *  roll (see sim/offers.ts), so — like UPGRADE_IDS — this is append-only. */
export const UPGRADE_CATEGORY_IDS = ['ship', 'intel', 'guns', 'torpedoes', 'mines'] as const;

/** One of the 5 upgrade category ids (see UPGRADE_CATEGORIES). */
export type UpgradeCategoryId = (typeof UPGRADE_CATEGORY_IDS)[number];

/**
 * Category → its member upgrade ids. PARTITIONS UPGRADE_IDS EXACTLY: every id
 * appears in exactly one category and the union is all 14 (guarded by
 * offers.test.ts, which forces a future 15th upgrade to be categorized). The
 * per-category id order also feeds the deterministic offer roll — append-only.
 */
export const UPGRADE_CATEGORIES: Record<UpgradeCategoryId, readonly UpgradeId[]> = {
  ship: ['hullPoints', 'maxSpeed'],
  intel: ['radarRange', 'sweepSpeed', 'sightRange'],
  guns: ['gunAmmo', 'gunRange', 'gunReload'],
  torpedoes: ['torpedoAmmo', 'torpedoSpeed', 'torpedoReload'],
  mines: ['mineAmmo', 'maxMines', 'mineReload'],
};

/** Map radius for a given player cap: base * sqrt(cap / capRef). */
export function mapRadius(playerCap: number): number {
  return CONFIG.map.baseRadius * Math.sqrt(playerCap / CONFIG.map.capRef);
}
