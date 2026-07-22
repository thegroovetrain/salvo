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
   * Per-class hull + kinematics — the ratified beta classes at literal board
   * scale (Eric-approved 2026-07-19). Three classes trade speed against
   * hull/hp: Torpedo Boat (fast, fragile) — Battleship (slow, armored) —
   * Mine Layer (area denial). Per-class loadouts are now landing: as of Story
   * 1.6 the Torpedo Boat carries its fitted loadout (gun / torpedo / speed
   * boost); as of Story 1.7 the Battleship carries gun / cannon / star shells;
   * Mine Layer keeps the universal fit (CONFIG.gun/torpedo/mine) until Story
   * 1.8. Only hull dims, hp, and
   * kinematics vary. Hull dims are the exact bow-to-stern length × max beam of
   * the shared silhouette polygon (see sim/silhouette.ts — the silhouette IS
   * the hitbox). Every number is a DESIGN TARGET, tunable.
   */
  shipClasses: {
    torpedoBoat: {
      hull: { length: 100, beam: 9 }, // u — silhouette bow-to-stern / max beam
      hp: 70, // hit points
      kinematics: {
        maxSpeed: 45, // u/s — full-ahead (Eric knot-realistic rescale 2026-07-21)
        reverseSpeed: 15, // u/s — full-astern (magnitude)
        accel: 12, // u/s^2 — throttling up
        decel: 18, // u/s^2 — throttling down / braking
        turnRate: 0.8, // rad/s — yaw rate at full rudder
        steerageSpeed: 12, // u/s — speed at which rudder reaches full authority
      },
    },
    battleship: {
      hull: { length: 124, beam: 32 }, // u
      hp: 150, // hit points
      kinematics: {
        maxSpeed: 35, // u/s — full-ahead (Eric knot-realistic rescale 2026-07-21)
        reverseSpeed: 9, // u/s — full-astern (magnitude)
        accel: 5, // u/s^2 — throttling up
        decel: 9, // u/s^2 — throttling down / braking
        turnRate: 0.4, // rad/s — yaw rate at full rudder
        steerageSpeed: 8, // u/s — speed at which rudder reaches full authority
      },
    },
    mineLayer: {
      hull: { length: 88, beam: 20 }, // u
      hp: 105, // hit points
      kinematics: {
        maxSpeed: 40, // u/s — full-ahead (Eric knot-realistic rescale 2026-07-21)
        reverseSpeed: 14, // u/s — full-astern (magnitude)
        accel: 8, // u/s^2 — throttling up
        decel: 15, // u/s^2 — throttling down / braking
        turnRate: 0.6, // rad/s — yaw rate at full rudder
        steerageSpeed: 10, // u/s — speed at which rudder reaches full authority
      },
    },
  },

  /**
   * Drone envelopes — weaponless target drones in three sizes. NOT ship
   * classes: never pickable, never upgradeable (they never earn points), never
   * in SHIP_CLASS_IDS/sanitizeClassId. Same per-entry shape as a ship class
   * (hull/hp/kinematics) so effectiveStats() accepts either. Kinematics are
   * byte-for-byte the retired destroyer/cruiser/battleship prototype blocks;
   * hulls are the legacy chevron trio scaled ~2.5× to board scale. Design
   * targets, tunable.
   */
  drones: {
    small: {
      hull: { length: 85, beam: 25 }, // u — legacy 34×10 chevron ×2.5
      hp: 80, // hit points
      kinematics: {
        maxSpeed: 46, // u/s — full-ahead (old destroyer block)
        reverseSpeed: 14, // u/s — full-astern (magnitude)
        accel: 11, // u/s^2 — throttling up
        decel: 17, // u/s^2 — throttling down / braking
        turnRate: 0.9, // rad/s — yaw rate at full rudder
        steerageSpeed: 12, // u/s — speed at which rudder reaches full authority
      },
    },
    medium: {
      hull: { length: 100, beam: 30 }, // u — legacy 40×12 chevron ×2.5
      hp: 100, // hit points
      kinematics: {
        maxSpeed: 38, // u/s — full-ahead (old cruiser block)
        reverseSpeed: 12, // u/s — full-astern (magnitude)
        accel: 9, // u/s^2 — throttling up
        decel: 14, // u/s^2 — throttling down / braking
        turnRate: 0.75, // rad/s — yaw rate at full rudder
        steerageSpeed: 10, // u/s — speed at which rudder reaches full authority
      },
    },
    large: {
      hull: { length: 115, beam: 35 }, // u — legacy 46×14 chevron ×2.5
      hp: 120, // hit points
      kinematics: {
        maxSpeed: 30, // u/s — full-ahead (old battleship block)
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
   * The universal standard gun (Eric rulings 2026-07-21): the permanently
   * selected default weapon, byte-identical on every class. 360° — no mounts,
   * no arcs, never out-of-arc. Single shot on a pure cooldown, implemented as
   * a 1-round pool @ reloadMs (identical semantics, minimal ammo-machinery
   * churn; the HUD presents it as a cooldown sweep). The shell flies to the
   * CLICKED POINT (aim + aimDist, clamped to effective range) and BURSTS there
   * in `burstRadius` — every enemy hull in the radius takes full `damage`. An
   * early interceptor takes the smaller `contactDamage` and stops the shell
   * (no burst) — unless it is already inside the would-be blast radius around
   * the target point, in which case the shell bursts for full damage anyway
   * (see sim/shell.ts). Base gun range is DERIVED from CONFIG.vision.radar —
   * you can shoot anywhere in radar range; no duplicated range constant exists.
   */
  gun: {
    shellSpeed: 130, // u/s — shell muzzle velocity
    maxAmmo: 1, // single shot — pinned to 1 in effectiveStats (gunAmmo neutralized)
    reloadMs: 3000, // ms — cooldown between shots
    damage: 25, // hp per burst victim — THE gun-damage tunable (pinned by damageGuardrail.test)
    contactDamage: 10, // hp to an early interceptor outside the blast (bodyblock)
    burstRadius: 15, // u — blast radius around the clicked point
    shellRadius: 2, // u — shell collision radius (added to hull capsule radius)
  },

  /**
   * Torpedoes (slot 1): bow tube. Never painted by radar. One-deep ammo pool
   * (owner play test 2026-07-13: two tubes fired both fish within ~2 ticks of
   * one click, masking the 12s reload; one fish per click + a real reload is
   * the intended commitment-spike feel). The bow tube is now just the pool.
   */
  torpedo: {
    offset: deg(0), // bow-centered
    halfArc: deg(30), // +/-30deg launch arc
    // u/s — must outrun every hull, classes AND drones (after Eric's 2026-07-21
    // rescale droneSmall at 46 is the fastest afloat, and a boosted Torpedo Boat
    // tops out at 55 = 45 + CONFIG.speedBoost.speedBonus) so a full-speed firer
    // can never re-catch its own fish; pinned by damageGuardrail.test. Also a
    // deliberate balance change: torps are harder to dodge (owner call,
    // 2026-07-14 self-hit fix session).
    speed: 60, // u/s
    damage: 55, // hp
    maxAmmo: 1, // one fish in the tube pool
    reloadMs: 12000, // ms — reload between fish (commitment spike)
    hitRadius: 2, // u — torpedo collision radius added to the hull capsule
    // u — extra spawn-offset margin ON TOP of hitRadius (see hullClearOffset)
    // so the fish spawns genuinely CLEAR of the firer's own hull, not merely
    // touching it — clean spawn geometry only. Own weapons NEVER damage the
    // owner (Eric ruling 2026-07-19: permanent owner immunity across gun /
    // torpedo / mine); the old timed selfHitGrace backstop is retired.
    spawnClearance: 6, // u
  },

  /** Mines (slot 2): dropped astern. Never on radar. */
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
   * Speed boost (Torpedo Boat slot 2, Story 1.6): an ACTIVATED ABILITY, not a
   * weapon — it fires nothing and emits nothing spatial. One press consumes its
   * single charge and opens a `durationMs` window during which the FORWARD
   * maxSpeed cap rises by `speedBonus` (reverseSpeed untouched); the hull
   * accelerates toward the raised cap at class accel and decays back at class
   * decel on expiry (see sim/boost.ts). `reloadMs` ≥ `durationMs` by design, so
   * an active window always implies a cooling pool — re-activation while active
   * is impossible by construction. No legacy upgrade touches it. Every number
   * is a DESIGN TARGET, tunable.
   */
  speedBoost: {
    speedBonus: 10, // u/s added to forward maxSpeed cap while active
    durationMs: 6000, // ms — active window opened by one activation
    maxAmmo: 1, // single charge in the pool
    reloadMs: 18000, // ms — cooldown between activations
  },

  /**
   * Long-range cannon (Battleship slot 1, Story 1.7): a gun-pattern burst
   * skillshot with bigger numbers (Eric Q&A 2026-07-21) — same fire flow as
   * the standard gun (flies to the clicked point, bursts there, early
   * interceptor takes the smaller contactDamage unless inside the would-be
   * blast), its own CONFIG block. NO range field: cannon range is DERIVED from
   * CONFIG.vision.radar in effectiveStats() (= the gun's BASE range — not
   * extended, and NO upgrade stacks on it). Every number is a DESIGN TARGET,
   * tunable.
   */
  cannon: {
    shellSpeed: 200, // u/s — shell muzzle velocity (fastest projectile afloat)
    maxAmmo: 1, // single shot — a 1-round pool presented as a pure cooldown
    reloadMs: 15000, // ms — cooldown between shots (the commitment spike)
    damage: 50, // hp per burst victim (pinned by damageGuardrail.test)
    contactDamage: 20, // hp to an early interceptor outside the blast (bodyblock)
    burstRadius: 30, // u — blast radius around the clicked point
    shellRadius: 2, // u — shell collision radius (added to hull capsule radius)
  },

  /**
   * Star shells (Battleship slot 2, Story 1.7): a gun-pattern skillshot whose
   * burst deals minor `damage` once across the FULL lit circle (owner excluded,
   * burst radius = litRadius) AND spawns a server-side LIT ZONE at the burst
   * point: for `litDurationMs` the FIRER — and only the firer — gains full
   * truesight parity inside it ("lit from above", no island LOS: ships as
   * contacts, mines, ballistic reveals). The zone CIRCLE itself is visible to
   * any observer whose effective radar range reaches its center (no LOS, no
   * sweep gate — a flare in the sky), tagged with the firer's id. NO range
   * field: range is DERIVED from CONFIG.vision.radar in effectiveStats() (gun
   * base parity, un-stacked). Every number is a DESIGN TARGET, tunable.
   */
  starShells: {
    shellSpeed: 130, // u/s — shell muzzle velocity (= the standard gun's)
    maxAmmo: 1, // single flare — a 1-round pool presented as a pure cooldown
    reloadMs: 20000, // ms — cooldown between flares
    damage: 10, // hp per burst victim — minor, once, at burst (full lit circle)
    litRadius: 110, // u — lit-zone radius (~half the 220u truesight bubble)
    litDurationMs: 10000, // ms — lit-zone lifetime (natural expiry only)
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
    // Hard ceiling (ms) on fire-time back-dating (D1): however large the
    // client's claimed latency or the measured RTT, a shot is never back-dated
    // further than this. RATIFIED by AR3.
    fireBackdateCeilingMs: 150,
    // ms added to the measured RTT when clamping a fire-time claim, so honest
    // network jitter doesn't cost compensation. PROPOSED design target,
    // tunable, flagged for Eric.
    fireJitterAllowanceMs: 30,
    // ms between server->client pings ('p' channel) driving RTT measurement.
    // PROPOSED design target, tunable, flagged for Eric.
    pingIntervalMs: 1000,
    // ms — sliding window over which the RTT estimator keeps samples (the
    // windowed-min is the clamp bound). PROPOSED design target, tunable,
    // flagged for Eric.
    rttWindowMs: 10000,
  },
} as const;

/** Static type of the CONFIG tree (used in the wire config snapshot). */
export type GameConfig = typeof CONFIG;

/** Hull dims: bow-to-stern length × max beam of the silhouette polygon. */
export interface Hull {
  length: number; // u — bow-to-stern
  beam: number; // u — max beam (widest point of the silhouette)
}

/**
 * One hull envelope: dims + hp + kinematics. STRUCTURAL on purpose — both a
 * CONFIG.shipClasses entry and a CONFIG.drones entry satisfy it, so
 * effectiveStats() accepts either (drones are ordinary ships whose envelope
 * merely comes from a different table).
 */
export interface HullEnvelope {
  hull: Hull;
  hp: number;
  kinematics: {
    maxSpeed: number; // u/s
    reverseSpeed: number; // u/s (magnitude)
    accel: number; // u/s^2
    decel: number; // u/s^2
    turnRate: number; // rad/s
    steerageSpeed: number; // u/s
  };
}

/** A ship-class key ('torpedoBoat' | 'battleship' | 'mineLayer'). */
export type ShipClassId = keyof typeof CONFIG.shipClasses;

/** The resolved config for one class (hull + hp + kinematics). */
export type ShipClass = HullEnvelope;

/** A drone size key into CONFIG.drones ('small' | 'medium' | 'large'). */
export type DroneSizeId = keyof typeof CONFIG.drones;

/** A drone hull id as it appears on the wire (Contact.cls). */
export type DroneHullId = 'droneSmall' | 'droneMedium' | 'droneLarge';

/**
 * Every hull id a Contact can carry: the three pickable classes plus the three
 * drone sizes. OwnShip.cls stays ShipClassId (you can never BE a drone).
 */
export type HullId = ShipClassId | DroneHullId;

/** Ordered class ids: menu order and the balance table. */
export const SHIP_CLASS_IDS: readonly ShipClassId[] = ['torpedoBoat', 'battleship', 'mineLayer'];

/** Ordered drone hull ids (round-robin fill order), aligned with DRONE_SIZE_IDS. */
export const DRONE_HULL_IDS: readonly DroneHullId[] = ['droneSmall', 'droneMedium', 'droneLarge'];

/** Ordered drone size keys into CONFIG.drones, aligned with DRONE_HULL_IDS. */
export const DRONE_SIZE_IDS: readonly DroneSizeId[] = ['small', 'medium', 'large'];

/** Every hull id, classes first then drones (silhouette registry order). */
export const HULL_IDS: readonly HullId[] = [...SHIP_CLASS_IDS, ...DRONE_HULL_IDS];

/**
 * The envelope (hull/hp/kinematics) behind any hull id — a shipClasses entry
 * for the pickable classes, a drones entry for the drone sizes.
 */
export function hullEnvelope(id: HullId): HullEnvelope {
  switch (id) {
    case 'droneSmall':
      return CONFIG.drones.small;
    case 'droneMedium':
      return CONFIG.drones.medium;
    case 'droneLarge':
      return CONFIG.drones.large;
    default:
      return CONFIG.shipClasses[id];
  }
}

/** Coerce arbitrary (wire/localStorage) input to a valid class id, default 'torpedoBoat'. */
export function sanitizeClassId(raw: unknown): ShipClassId {
  return typeof raw === 'string' && (SHIP_CLASS_IDS as readonly string[]).includes(raw)
    ? (raw as ShipClassId)
    : 'torpedoBoat';
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
