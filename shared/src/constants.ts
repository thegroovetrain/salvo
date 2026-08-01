// Single source of truth for every simulation tunable.
// One `CONFIG` object, nested by system. Units are noted per field:
//   u = world units, u/s = units/second, u/s^2 = accel, rad = radians,
//   rad/s = angular rate, ms = milliseconds.
//
// Angle helpers below keep mount/arc definitions readable in degrees.

const deg = (d: number): number => (d * Math.PI) / 180;

// u — base true-sight radius (Eric ruling 2026-07-23). Star shells derive
// their lit-zone radius from this as a structural ratio (SIGHT / 2) so the
// two retune together; see CONFIG.vision.sight and CONFIG.starShells.litRadius.
const SIGHT = 330;

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
    sight: SIGHT, // u — true-sight bubble (actual ships visible; Eric ruling 2026-07-23, was 220)
    radar: 650, // u — radar sweep range (paints stale blips)
    sweepRpm: 15, // rev/min — radar rotation rate (15 rpm = one 4 s revolution); keep ≤ sweepRpmMax — the effectiveStats clamp caps the TOTAL
    // rev/min — THE ratified sweep-rate ceiling (survives the 2.8 legacy-upgrade
    // strip; formerly CONFIG.upgrades.sweepSpeed.maxRpm). Clamped inside the
    // effectiveStats firewall (base + boon fold) — nothing else may re-clamp it.
    sweepRpmMax: 30,
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
    arc: 'full', // 360° — RATIFIED class-era geometry (Eric 2026-07-23; see sim/arcs.ts)
    shellSpeed: 500, // u/s — standardized gun-family muzzle velocity (Eric ruling 2026-07-25, retuned 300→500 same day)
    // BASE pool size. Story 2.8 deliberately RETIRES the single-shot pin: the
    // AFT TURRET boon (gunTurret) may raise the pool to 2 via the whitelisted
    // gun.maxAmmo stat path. The base fit is still one round.
    maxAmmo: 1,
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
    offset: deg(0), // bow-centered — RATIFIED class-era sector (Eric 2026-07-23; see sim/arcs.ts)
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
    // --- ACOUSTIC HOMING doctrine (Story 2.8, exclusive boon) — DRAFT values,
    // 2.10 tunes. A homing fish steers toward the nearest non-owner hull within
    // acquireRange at ≤ homingTurnRate rad/s (speed unchanged; sim/shell.ts).
    homingTurnRate: 0.5, // rad/s — max steering rate while homing
    homingAcquireRange: 120, // u — target acquisition radius around the fish
    // deg — min velocity-direction change since last emit before the server
    // re-emits a ballistic update ('torpU') to observers (wire cadence knob).
    homingUpdateAngleDeg: 5,
    // u — TOTAL travel budget of a homing fish, consumed by actual distance
    // travelled (a standard/command fish runs until impact or the map edge —
    // it can never circle). A homing torpedo's turn radius at base speed is
    // ≈ homingAcquireRange, so a slow orbiting target would otherwise trap it
    // in an immortal circle re-emitting torpU forever; on exhaustion it
    // expires exactly like a normal torpedo at the map edge (splash boom, no
    // burst). DRAFT HANDWAVE (Story 2.8 review P1x; 2.10's evidence pass
    // tunes): 1300u ≈ two-plus full crossings of base radar range.
    homingMaxRangeU: 1300,
    // --- COMMAND DETONATION doctrine (Story 2.8, exclusive boon) — DRAFT.
    // u — blast radius of the point-detonation at the click (reuses the
    // gun-pattern targetX/targetY + burstRadius shell fields; range is capped
    // by radar range server-side; contact hits stay ordinary torpedo hits).
    commandBurstRadius: 60,
    // u — extra spawn-offset margin ON TOP of hitRadius (see hullClearOffset)
    // so the fish spawns genuinely CLEAR of the firer's own hull, not merely
    // touching it — clean spawn geometry only. Own weapons NEVER damage the
    // owner (Eric ruling 2026-07-19: permanent owner immunity across gun /
    // torpedo / mine); the old timed selfHitGrace backstop is retired.
    spawnClearance: 6, // u
  },

  /**
   * Mines (Mine Layer slot 1): a click-aimed WEAPON as of Story 2.8 (amendment
   * 45 — supersedes the 1.8 instant-activate stern drop): prime the slot, aim
   * within the REAR arc (heading + `offset` ± `placeHalfArcDeg`), and a click
   * places the mine AT the clicked point up to `placeRange` (out-of-arc/range →
   * the denial register). Arms after `armDelay`; an enemy silhouette within
   * `triggerRadius` trips it, BLASTING every non-owner hull within the larger
   * `blastRadius` for full `damage` (owner excluded — the gun/starShells
   * owner-excluded AoE precedent). Chain reactions are SAME-OWNER only
   * (amendment 46): a detonation cascades to the owner's other ARMED mines
   * whose centers lie within its blast radius; enemy mines never sympathize.
   * Every number is a DESIGN TARGET, tunable.
   */
  mine: {
    // astern — RATIFIED class-era stern bearing (Eric 2026-07-23; sim/arcs.ts).
    // Story 2.8: now the CENTER of the mine's aimed rear placement arc. The
    // decoyBuoy still shares THIS offset for its (unchanged) stern drop.
    offset: deg(180),
    // deg — half-arc of the aimed rear placement sector about `offset`
    // (Story 2.8, amendment 45 — DRAFT value, 2.10 tunes).
    placeHalfArcDeg: 60,
    placeRange: 90, // u — max distance of the clicked placement point (DRAFT)
    armDelay: 3000, // ms — before it can trigger
    triggerRadius: 32, // u — detonation proximity (enemy pass-over trips it)
    // u — full damage to every non-owner hull within it; > triggerRadius by
    // design (the trip is the detection ring; the blast reaches farther).
    blastRadius: 48,
    damage: 45, // hp
    maxAmmo: 1, // stored drops in the ammo pool (one per reload)
    reloadMs: 8000, // ms — reload between drops
    // maxLive is DISTINCT from the ammo pool: the drop pool caps how many you
    // can drop before reloading; maxLive caps how many stay LIVE on the board at
    // once (oldest evicted past it). Separate stat, separate upgrade later.
    maxLive: 5, // max simultaneous live mines per player
    globalCap: 60, // defensive ceiling on total live mines across all players
    // --- PROP-FOULING MINES doctrine (Story 2.8, exclusive boon) — DRAFT.
    // Victims of a fouling blast are slowed (self-private you.slowedUntil;
    // sim/slow.ts slowedKinematics — composition pinned boosted → slowed →
    // hooks). The doctrine also reduces mine damage (catalog-side effect).
    foulFactor: 0.5, // × maxSpeed AND reverseSpeed while fouled
    foulDurationMs: 4000, // ms — slow window per blast (refresh, don't stack)
    // --- SELF-PROPELLED MINES doctrine (Story 2.8, exclusive boon) — DRAFT.
    // Armed mines creep toward the nearest enemy hull within acquire range.
    creepSpeed: 8, // u/s — crawl speed of an armed self-propelled mine
    creepAcquireRange: 60, // u — target acquisition radius around the mine
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
    arc: 'full', // 360° — RATIFIED class-era geometry (Eric 2026-07-23; see sim/arcs.ts)
    shellSpeed: 500, // u/s — standardized gun-family muzzle velocity (Eric ruling 2026-07-25, retuned 300→500 same day)
    maxAmmo: 1, // single shot — a 1-round pool presented as a pure cooldown
    reloadMs: 15000, // ms — cooldown between shots (the commitment spike)
    damage: 50, // hp per burst victim (pinned by damageGuardrail.test)
    contactDamage: 20, // hp to an early interceptor outside the blast (bodyblock)
    burstRadius: 30, // u — blast radius around the clicked point
    shellRadius: 2, // u — shell collision radius (added to hull capsule radius)
  },

  /**
   * Star shells (Battleship slot 2, Story 1.7): a gun-pattern skillshot that
   * spawns a server-side LIT ZONE at the burst point: for `litDurationMs` the
   * FIRER — and only the firer — gains full truesight parity inside it ("lit
   * from above", no island LOS: ships as contacts, mines, ballistic reveals).
   * DAMAGELESS as of Story 2.8 (amendment 39): the flare deals ZERO damage —
   * interception does 0 and still spawns the lit zone at the stop point; the
   * INCENDIARY/DAZZLE exclusive doctrines take over the damage/denial role.
   * The zone CIRCLE itself is visible to any observer whose effective radar
   * range reaches its center (no LOS, no sweep gate — a flare in the sky),
   * tagged with the firer's id. NO range field: range is DERIVED from
   * CONFIG.vision.radar in effectiveStats() (gun base parity, un-stacked).
   * Every number is a DESIGN TARGET, tunable.
   */
  starShells: {
    arc: 'full', // 360° — RATIFIED class-era geometry (Eric 2026-07-23; see sim/arcs.ts)
    shellSpeed: 500, // u/s — standardized gun-family muzzle velocity (Eric ruling 2026-07-25, retuned 300→500 same day)
    maxAmmo: 1, // single flare — a 1-round pool presented as a pure cooldown
    reloadMs: 20000, // ms — cooldown between flares
    // NO `damage` field (amendment 39): star shells deal zero damage anywhere,
    // structurally — a retune cannot quietly re-arm the flare.
    // u — lit-zone radius, STRUCTURALLY half of base truesight (Eric ruling
    // 2026-07-23: star shells always light exactly half the BASE sight range,
    // independent of any player's sightRange upgrade stacks). Keep this as a
    // literal derivation, never a re-tuned constant, so the ratio holds
    // whenever SIGHT changes.
    litRadius: SIGHT / 2, // u — 165 at SIGHT=330
    litDurationMs: 10000, // ms — lit-zone lifetime (natural expiry only)
    // u — flare collision radius. Own field (cannon plumbing parity) so a gun
    // retune can never silently change flare interception; same value today.
    shellRadius: 2,
    // --- INCENDIARY COMPOUND doctrine (Story 2.8, exclusive boon) — DRAFT.
    incendiaryRadiusFactor: 0.8, // × litRadius — the burning zone is slightly smaller
    incendiaryDps: 5, // hp/s — DoT to non-owner hulls inside while lit
    // --- DAZZLE BURST doctrine (Story 2.8, exclusive boon) — DRAFT.
    // × sightRange — truesight factor applied to non-owner ships whose center
    // is inside the zone (perception-side; victims get self-private
    // you.dazzledUntil so their own fog hole shrinks honestly).
    dazzleSightFactor: 0.5,
  },

  /**
   * Decoy buoy (Mine Layer slot 2, Story 1.8): an ACTIVATED ABILITY (Eric
   * ruling 2026-07-22) — a stationary server entity dropped astern that
   * radar-doubles the owner. To any fogged non-owner it paints on radar EXACTLY
   * like the owner's own ship (same blip gate + materialize, id = the owner's
   * ship id — wire-indistinguishable per FR10/counterIntel); one live per owner
   * (a new placement silently replaces the old); persists to natural expiry
   * (`durationMs`) even past owner death. Never blips to its owner, never a
   * collision subject (shells/bursts pass through with no Hit Call), never trips
   * mines. No legacy upgrade touches it. Every number is a DESIGN TARGET,
   * tunable.
   */
  decoyBuoy: {
    durationMs: 30000, // ms — lifetime before natural expiry
    reloadMs: 20000, // ms — cooldown between placements
    maxAmmo: 1, // single charge in the pool (one live per owner)
  },

  /**
   * THE DECK MODEL's draw-weight dials (Story 2.8, amendment 38). A rare or
   * exclusive card LINE's per-card draw weight escalates the longer no rare/
   * exclusive has landed in a draw (invisible soft pity):
   *   perCardWeight = rareWeightBase + levelsSinceRare × rareWeightPerDryLevel
   * (commons are always weight 1; a line's total weight = copiesInDeck ×
   * perCardWeight — see sim/deck.ts). Values RATIFIED by Eric 2026-07-31 from
   * the 2.10 batch-sim evidence (amendment 57): at 0.35 the escalation only
   * offset natural rare depletion (flat pity curve); 0.7 makes the ratified
   * soft pity genuinely rise (rareRate 0.43→0.57 by dry 6) and trims the
   * first-exclusive tail without flooding shallow draws.
   */
  deck: {
    rareWeightBase: 1, // per-card weight of a rare/exclusive at zero dry levels
    rareWeightPerDryLevel: 0.7, // weight added per level without a rare/exclusive drawn
  },

  /**
   * XP economy (Story 2.6) — THE only progression currency, and the only
   * trigger that banks a level (the offer roll lives behind it, unchanged).
   *
   * Shape (ratified; every NUMBER is a declared handwave that Story 2.10's
   * batch-sim retunes): a flat per-level XP cost in MILLISECONDS, so passive
   * accrual is literally "one level per `levelMs` of match time" — the
   * anti-snowball floor and the Rat Covenant's price (a hiding captain always
   * ticks, but never accelerates). A KILL adds its value ON TOP of current
   * progress (fractions always carry — no XP is ever snapped away):
   * a human captain = `killLevels`, a drone = its size tier below.
   *
   * DAMAGE GRANTS ZERO XP. There is deliberately no damage-XP entry here and
   * no damage-XP path in the sim — dealing damage is not progression.
   *
   * `droneTierLevels` is keyed by DRONE HULL ID (the victim's `cls`), and IS
   * the PvE fleet-tier hook the later fleets epic reuses verbatim: ¼ / ⅓ / ½
   * of a level by hull size.
   */
  xp: {
    levelMs: 60000, // ms of match time per level (passive tick ≈ 1 level/minute)
    killLevels: 1, // levels' worth of XP for sinking a human captain
    droneTierLevels: {
      droneSmall: 0.25, // ¼ level
      droneMedium: 1 / 3, // ⅓ level
      droneLarge: 0.5, // ½ level
    },
  },

  /**
   * OFFERS (Story 2.7) — the shape of the pre-rolled offer a banked level
   * carries. `size` is the ratified card count (4 boons from 4 DISTINCT
   * categories, UX-DR14 / FR19); it is gameplay-authoritative (it bounds the
   * server's accepted `SpendMsg.choice` and the client's digit picks), so it
   * lives here and not in CLIENT_CONFIG. A catalog with fewer categories than
   * `size` rolls a shorter offer rather than throwing (sim/offers.ts).
   */
  offer: {
    size: 4, // boons per offer, each from a distinct BOON_CATALOG category
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

// The 14-entry legacy upgrade system (UPGRADE_IDS / UpgradeId /
// UPGRADE_CATEGORY_IDS / UPGRADE_CATEGORIES / CONFIG.upgrades) died wholesale
// in Story 2.8 (FR20): the boon catalog + THE DECK MODEL are the only
// progression vocabulary. The sweep ceiling survives as
// CONFIG.vision.sweepRpmMax.

/** Map radius for a given player cap: base * sqrt(cap / capRef). */
export function mapRadius(playerCap: number): number {
  return CONFIG.map.baseRadius * Math.sqrt(playerCap / CONFIG.map.capRef);
}

/**
 * The Regatta wheel — 20 personal-combatant hue NAMES in ratified wheel order
 * (Story 1.12; = the existing CLIENT_CONFIG.colors.players key order verbatim).
 * This ORDER is the single source of truth both sides share: the server assigns a
 * hue INDEX (0–19) into this array at join, the index rides the roster
 * (PlayerMeta.color), and the client maps that index → its hex through the
 * same-ordered CLIENT_CONFIG.colors.players / .playerFills tables. Only the ORDER
 * is promoted to shared (nearest-free assignment + index→hex must agree); the hex
 * VALUES stay client tokens so DESIGN.md remains the styling authority. The
 * reserved bands (amber / red / storm-violet / phosphor-green) are excluded by
 * wheel construction — the wheel is the ONLY assignment source.
 */
export const REGATTA_HUES = [
  'lemon',
  'chartreuse',
  'olive',
  'lime',
  'green',
  'spring',
  'jade',
  'aqua',
  'cyan',
  'lagoon',
  'sky',
  'azure',
  'cobalt',
  'periwinkle',
  'iris',
  'orchid',
  'fuchsia',
  'magenta',
  'mulberry',
  'rose',
] as const;

/**
 * Sentinel PlayerMeta.color value = "no personal hue": drones always, and any
 * roster entry before assignment lands. Renders the drone greys everywhere; it is
 * NEVER a wheel index (the wheel is 0..19). uint8-safe.
 */
export const REGATTA_NO_HUE = 255;

/** A Regatta hue name — one of the 20 wheel entries (REGATTA_HUES order). */
export type RegattaHue = (typeof REGATTA_HUES)[number];
