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
  /**
   * Circular water map. radius = base * sqrt(playerCap / capRef).
   *
   * RADIUS 2400 → 2800 (Story 5.6, Eric ruling 2026-08-14, epic-5 amendment
   * 42): *"lets scale the ring up a bit, I feel like the map is a little too
   * small, so each stage doesn't force enough movement."* That sentence is TWO
   * asks with two knobs, and the shipped closing-rate test proves it: it pins
   * worst-case escape per close between 0.75 and 0.85 of a battleship-minute,
   * which holds forced movement CONSTANT no matter how big the ocean gets. So
   * a bigger map alone could never deliver the second half.
   *
   * Ruled: radius up, `zone.beatMs` and `zone.offsetCap` UNTOUCHED, and the
   * ratified band re-ratified to ≈1.0. Because the terminal ring is derived
   * from truesight and never moves, growing R grows max Δr against a fixed
   * denominator — so worst-case escape goes 0.799 → 1.019 and the match still
   * closes at 12:00. 1.019 means a battleship caught at the worst possible
   * position runs the whole close beat at flank speed and JUST misses safety:
   * it takes a bite of storm rather than dying. That is the forced movement.
   *
   * Headroom note for anyone retuning this: at `beatMs` 60000 the band caps
   * baseRadius near 2480 and this value is deliberately past it, on the
   * re-ratified band. Story 6.2 makes sizing roster-dynamic and will re-derive
   * the band as a function of radius rather than as a literal.
   */
  map: {
    baseRadius: 2800, // u — map radius tuned for capRef players (2400 → 2800, amendment 42)
    capRef: 20, // players the base radius is scaled against
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
      hp: 125, // hit points — objective toughness ladder: 1 pip=100hp, +25/pip (Eric ruling 2026-08-03); 2 pips
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
      hp: 175, // hit points — objective toughness ladder: 1 pip=100hp, +25/pip (Eric ruling 2026-08-03); 4 pips
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
      hp: 150, // hit points — objective toughness ladder: 1 pip=100hp, +25/pip (Eric ruling 2026-08-03); 3 pips
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
   * PvE FLEET envelopes in three sizes. NOT ship classes: never pickable,
   * never upgradeable (they never earn points), never in
   * SHIP_CLASS_IDS/sanitizeClassId. Same per-entry shape as a ship class
   * (hull/hp/kinematics) so effectiveStats() accepts either. Hulls are the
   * legacy chevron trio scaled ~2.5× to board scale.
   *
   * RETUNED WHOLESALE by Story 5.6 (Eric rulings 2026-08-14, epic-5 amendment
   * 34). These were weaponless target drones on byte-for-byte the retired
   * destroyer/cruiser/battleship prototype kinematics; they are now armed PvE
   * fleet ships (see CONFIG.fleet).
   *
   * hp 80/100/120 → 60/75/90; maxSpeed 46/38/30 → 40/35/30.
   *
   * The speed change DISCHARGES the rescale epics.md:1090 has owed since Story
   * 1.6 (2026-07-21): the small drone at 46 u/s was the FASTEST HULL AFLOAT,
   * ahead of the Torpedo Boat's 45. At 40 it sits below every player class,
   * medium at 35 ties the Battleship, and CONFIG.torpedo.speed (60) still
   * outruns everything — the damageGuardrail pin holds.
   *
   * `reverseSpeed`/`accel`/`decel` scale PROPORTIONALLY with maxSpeed;
   * `turnRate`/`steerageSpeed` deliberately DO NOT MOVE, so agility stays a
   * size property rather than drifting with a speed retune. Reverse is now
   * load-bearing rather than decorative — it is the tool the un-beaching
   * manoeuvre uses (drones.ts), which is why it could not simply be left at
   * the old block's value.
   *
   * The identity table in shared/src/__tests__/shipClasses.test.ts pins every
   * number here; it updates deliberately with this block, never silently.
   */
  drones: {
    small: {
      hull: { length: 85, beam: 25 }, // u — legacy 34×10 chevron ×2.5
      hp: 60, // hit points — 4 captain gun hits (15 dmg) to sink
      // The self-defence gun. Lives on the ENVELOPE rather than in
      // CONFIG.fleet so effectiveStats() can apply it structurally, with no
      // hull-id parameter threaded through the one derivation path.
      gun: { damage: 6, reloadMs: 5000 },
      kinematics: {
        maxSpeed: 40, // u/s — full-ahead (Eric ruling 2026-08-14; was 46, the fastest hull afloat)
        reverseSpeed: 12, // u/s — full-astern (magnitude), scaled 14 × 40/46
        accel: 9.5, // u/s^2 — throttling up, scaled 11 × 40/46
        decel: 14.8, // u/s^2 — throttling down / braking, scaled 17 × 40/46
        turnRate: 0.9, // rad/s — yaw rate at full rudder (UNCHANGED: agility is a size property)
        steerageSpeed: 12, // u/s — speed at which rudder reaches full authority (UNCHANGED)
      },
    },
    medium: {
      hull: { length: 100, beam: 30 }, // u — legacy 40×12 chevron ×2.5
      hp: 75, // hit points — 5 captain gun hits to sink
      gun: { damage: 8, reloadMs: 5000 },
      kinematics: {
        maxSpeed: 35, // u/s — full-ahead (Eric ruling 2026-08-14; was 38) — ties the Battleship
        reverseSpeed: 11, // u/s — full-astern (magnitude), scaled 12 × 35/38
        accel: 8.3, // u/s^2 — throttling up, scaled 9 × 35/38
        decel: 12.9, // u/s^2 — throttling down / braking, scaled 14 × 35/38
        turnRate: 0.75, // rad/s — yaw rate at full rudder (UNCHANGED)
        steerageSpeed: 10, // u/s — speed at which rudder reaches full authority (UNCHANGED)
      },
    },
    large: {
      hull: { length: 115, beam: 35 }, // u — legacy 46×14 chevron ×2.5
      hp: 90, // hit points — 6 captain gun hits to sink
      gun: { damage: 10, reloadMs: 5000 },
      kinematics: {
        maxSpeed: 30, // u/s — full-ahead (Eric ruling 2026-08-14; unchanged, so the block below is too)
        reverseSpeed: 10, // u/s — full-astern (magnitude)
        accel: 7, // u/s^2 — throttling up
        decel: 11, // u/s^2 — throttling down / braking
        turnRate: 0.6, // rad/s — yaw rate at full rudder
        steerageSpeed: 8, // u/s — speed at which rudder reaches full authority
      },
    },
  },

  /**
   * ROVING PvE FLEETS (Story 5.6, Eric rulings 2026-08-14, epic-5 amendments
   * 33/35/36/37). World content, never roster fill (FR34) — these hulls are
   * not participants, hold no roster row, gate no win check, and their kills
   * count nowhere (amendments 38/39).
   *
   * THE ECONOMY IS EXACT BY CONSTRUCTION, not by search. One fleet is
   * 2 large + 3 medium + 4 small = 2(½) + 3(⅓) + 4(¼) = 1 + 1 + 1 = exactly
   * 3.000 levels in 9 hulls, so every wave is a whole number of fleets and the
   * AC's *"total XP value is exactly the number"* stops being a constraint to
   * satisfy. `fleetLevels()` below asserts the identity against
   * CONFIG.xp.droneTierLevels rather than trusting this comment.
   *
   * 3 + 2 + 1 fleets = 27 + 18 + 9 = 54 hulls and 18 levels across a match —
   * BELOW the 19 levels of captain kills a full lobby offers, so this is a
   * third faucet rather than the dominant one. Totals are FIXED, never
   * roster-scaled: a thin lobby is deliberately a target-rich one.
   */
  fleet: {
    /** Hulls per fleet by size — the exact-3-levels composition. */
    composition: { large: 2, medium: 3, small: 4 },
    /**
     * Wave schedule, measured from ZONE START (the same anchor T+ uses).
     * Deliberately literal rather than derived: Eric set these beats.
     */
    waves: [
      { atMs: 60000, fleets: 3 }, // 1:00 — 9 levels
      { atMs: 300000, fleets: 2 }, // 5:00 — 6 levels
      { atMs: 540000, fleets: 1 }, // 9:00 — 3 levels
    ],
    /**
     * u — radius the 9 hulls scatter over around their fleet anchor, and the
     * radius the fleet holds as it roves. THIS NUMBER IS THE DIFFICULTY DIAL
     * (amendment 35): a hit is witnessed by any fleet ship with LOS to both
     * attacker and victim within sight (330u), so the spread sets how many
     * guns answer. At ~150u all nine witness every hit and the witness rule
     * stops meaning anything; at ~700u none do and "fleet" stops meaning
     * anything. At 400 typical neighbour spacing lands near the sight edge, so
     * ~2-4 answer and full aggro becomes a mistake rather than the default.
     */
    spreadU: 400,
    /**
     * u — 1σ scatter added to the LEAD-CORRECTED aim point, by size. Fleet
     * ships solve the intercept (shell speed 500 u/s over ≤330u is a 0.66s
     * flight, in which a 45 u/s Torpedo Boat moves 30u — TWICE the 15u burst
     * radius, so no-lead misses nearly everything and perfect lead nearly
     * never misses). Scatter is what makes size read as gunnery competence and
     * makes "kill the large one first" a real decision.
     */
    aimScatterU: { small: 25, medium: 15, large: 8 },
    /**
     * ms — how long a fleet ship holds a target's last known bearing after
     * losing line of sight. Instant forgetting (the literal reading of the
     * brief) makes them jitter at every island edge as LOS flickers and turns
     * any rock into a perfect off-switch.
     */
    memoryMs: 3000,
    /**
     * Ticks a pending wave may keep retrying for an anchor outside every
     * captain's intel range before falling back to the plain max-min point.
     * 200 ticks = 10s at the 20Hz sim rate. The wave ALWAYS arrives; it
     * degrades visibly (and logs) rather than silently never spawning.
     */
    spawnRetryTicks: 200,
  },

  /** True ship globals shared by every class (no per-class variation). */
  ship: {
    respawnDelay: 3000, // ms — delay before respawn (prototype)
    // Fraction of a hull's RATED max speed it may still make while driving
    // DEAD-ON into land (sim/collision.ts applyGroundingDamp; Eric ruling
    // 2026-08-06 "boundary + directional damp"). Scaled by how head-on the
    // contact is — a graze costs nothing — and applied as a CAP, not a
    // per-tick multiplier: the old multiplier collapsed to 0.083 u/s under
    // sustained contact and took rudder authority with it. Pressing the MAP
    // EDGE is not grounding and is never damped.
    islandSpeedMult: 0.25,
    // ms — THE SINKING WINDOW (Story 5.2, Eric ruling 2026-08-12, amendment
    // 13: "5s is fine all around"). A FLAT 5000 for ALL three classes —
    // per-class windows (a Battleship going down slower than a Torpedo Boat)
    // were offered and DECLINED for now; that stays available as a post-live
    // balance pass, and it is a table-for-a-constant swap when it comes.
    // Consumed by sim/sinking.ts (the shared decel cap + founder deadline).
    // Interaction FIXED IN PLACE by the ruling: mine armDelay is 3000 ms
    // against this 5000 ms window, so a mine laid in the first two seconds of
    // sinking arms before its layer founders and one laid later arms after.
    sinkingWindowMs: 5000,
  },

  /**
   * Vision + radar (fog-of-war ranges) — THE EIGHTHS LADDER.
   *
   * INTEL RANGE is the one ruler (Eric ruling 2026-08-06, amendments 113/119:
   * *"lets go ahead and divide our total intel range into 8 concentric
   * circles... That model is how I want to think about range from now on"*).
   * Radar range is the ruler's full extent (8/8) and EVERY sensor boundary in
   * the game is a named eighth of it. Every rung is a `SIGHT` multiple, in the
   * derivation style `radar = SIGHT * 2` already used here — so retuning base
   * truesight moves the whole ladder together and no boundary anywhere in the
   * codebase is an independent literal.
   *
   *   band   multiple        u        rung           consumer
   *   ----   -------------   -----    ------------   ---------------------------
   *   8/8    SIGHT * 2       660      radar          radar sweep; gun / cannon /
   *                                                  star-shell base range;
   *                                                  foghorn band 8 (50% gain)
   *   7/8    SIGHT * 1.75    577.5    farRadar       NONE — see the comment on
   *                                                  the field itself
   *   5/8    SIGHT * 1.25    412.5    muzzleFlash    muzzle flash + wounded
   *                                                  smoke (one constant, both)
   *   4/8    SIGHT           330      sight          true-sight bubble
   *   3/8    SIGHT * 0.75    247.5    detect         mines + torpedoes
   *
   * The unnamed bands (6/8, 2/8, 1/8) are deliberate: a rung earns a constant
   * only when a sensor actually sits on it. The ordering
   * `detect < sight < muzzleFlash < farRadar < radar` and every derivation in
   * the table are pinned by __tests__/zone.test.ts — a one-sided edit to any
   * rung fails the build.
   */
  vision: {
    // u — 3/8: the MINE + TORPEDO detection rung (Story 4.9, Eric ruling
    // 2026-08-06, amendment 119: *"lets split the difference and say its 3/8,
    // and i can tweak from there. Torpedoes and mines especially need buffs"*).
    // A real combat buff to the torpedo and the Mine Layer, taken knowingly.
    // SHELLS DO NOT RIDE THIS — a shell is in the air and still materializes at
    // the truesight boundary; a torpedo is a wake just under the surface and a
    // mine sits in the water. A mine's or torpedo's BOOM/BURST also stays on
    // truesight: you can watch an explosion you never saw the ordnance for.
    //
    // This is the BASE-STATS rung — the value the ladder PINS, read by the
    // constraint tests and the weapons smoke and by NO production code: at
    // RUNTIME the gate is OBSERVER-SCALED (amendment 121) and multiplies by
    // `detectFactor` below, never by this. The server resolves it as
    // `sightOf(me, now) * detectFactor`, so a star-shell dazzle halves it and
    // an intelTruesight boon widens it, with island LOS applied unchanged.
    detect: SIGHT * 0.75,
    // The runtime scale the detect gate multiplies an observer's own
    // dazzle-scaled, boon-widened sight by. It is the SAME number as detect's
    // multiple above, by construction: `detect === sight * detectFactor` is
    // pinned in zone.test.ts precisely so the base rung and the runtime factor
    // can never drift apart. Never edit one without the other.
    detectFactor: 0.75,
    sight: SIGHT, // u — 4/8: true-sight bubble (actual ships visible; Eric ruling 2026-07-23, was 220)
    // u — 5/8: muzzle-flash carry (Story 4.3, amendment 15; MOVED from 6/8 to
    // 5/8 by Story 4.9, Eric ruling 2026-08-06, amendment 119: *"5/8 for
    // muzzle/smoke"* — 495u → 412.5u). DERIVED: 1.25 × base truesight, exactly
    // as radar below, so retuning SIGHT moves the flash halo with it (never an
    // independent literal; the constraint test in zone.test.ts pins the
    // derivation and the full ladder ordering). THIS ONE NUMBER ALSO CARRIES
    // WOUNDED SMOKE (amendment 42 — never forked into a fourth vision
    // constant), so Eric's "muzzle/smoke" band moves both signals together;
    // that coupling is doing exactly what it was designed to do.
    //
    // The annulus beyond the base bubble is now a deliberately THIN 82.5u
    // (330–412.5, halved from 165u — an ACCEPTED consequence of the ladder,
    // not a defect): a shooter just outside your sight gives themselves away,
    // but a radar-range duel stays anonymous — radar remains the ONLY
    // long-range sensor. The flash still covers the D1 back-dated shell spawn
    // because 412.5 > 330, so amendment 15's masking coupling holds. Island
    // LOS applies (Eric ruling 2026-08-02: islands block EVERY sensor at ALL
    // ranges); dazzle does NOT (a flash is a light source, not an illuminated
    // object — signals.ts muzzleFlashSignal).
    muzzleFlash: SIGHT * 1.25,
    // u — 7/8: "far radar", where a mid-size hull's return reads BLUE rather
    // than RED. DERIVED: 1.75 × base truesight.
    //
    // !!! THIS RUNG SHIPS DELIBERATELY UNCONSUMED, AND THAT IS CORRECT. !!!
    // It has no caller at all — not production, not tests beyond the ladder
    // pins. Naming the rung is what makes the ladder complete and checkable
    // (amendment 123). It is not quite the ONLY consumer-less constant here:
    // `detect` above has no PRODUCTION consumer either (runtime multiplies by
    // `detectFactor`), but it IS read — by the ladder pins and the weapons
    // smoke — whereas this one is read by nothing. It exists as STORY 4.10's
    // CALIBRATION TARGET: under amendment 106 the radar red→blue crossover
    // must EMERGE from the 1/d⁴ falloff curve fitted to cross here, never from
    // a threshold branch. Writing `if (d > farRadar)` — or any other
    // comparison against this constant — anywhere in a radar paint path
    // VIOLATES amendment 105 (colour is intensity, never category) and is the
    // wrong implementation of amendment 118. Fit the curve; do not branch.
    farRadar: SIGHT * 1.75,
    radar: SIGHT * 2, // u — 8/8: radar sweep range (paints stale blips) — DERIVED: 2 × base truesight
    // (Eric ruling 2026-08-02, epic-3 amendment 22; resolves the radar-650-vs-660
    // marginality: radar from the terminal-ring center exactly covers the 660u
    // endgame ring). Gun base range and star-shell flare range ride this same
    // number (Eric ruling 2026-07-21). Note: zoneTerminalRadius (in sim/zone.ts,
    // terminalSightFactor × sight) is an INDEPENDENT derivation that happens to
    // share the factor 2 — the constraint test in zone.test.ts is what binds the
    // two together; don't conflate them as the same derivation.
    // q — THE RADAR MAST HEIGHT `H` (Story 4.11, Eric ruling 2026-08-08,
    // amendments 177/184), in the height raster's OWN 0-255 quantized units
    // (0 = sea level, 255 = that map's peak). Every antenna — ship, drone and
    // decoy alike — stands at this one height, so the shadow model is
    // symmetric (A paints B exactly when B paints A) and the whole law is the
    // ratio h/H: the same number that decides which terrain is an absolute
    // radar wall (h ≥ H ⇒ dark to the rim) also sets how long every softer
    // shadow runs. Consumed ONLY by sim/radarShadow.ts, alongside the derived
    // K = radar²/4 (amendment 185: K stays on the BASE range above, never an
    // observer's boon-widened stats.radarRange).
    //
    // THIS IS A FIXED CONSTANT, NEVER A PERCENTILE. Amendment 184: q64 is a
    // fixed point on each map's elevation SCALE, deliberately NOT an absolute
    // elevation converted per map and NEVER a percentile of any map's height
    // distribution — the share of land above it varies by seed, and that
    // per-seed spread is the map character amendment 114 explicitly accepted.
    // NOTHING MAY MAKE IT PURCHASABLE — no stat, boon or card may touch it
    // (amendment 116, "land is sacred": a lever over H would buy its way past
    // terrain). Measured consequence at q64 (amendment 177 — 4 seeds, 22,400
    // rays; Eric picked it against the tactical framing): ~39% of
    // land-crossing bearings become absolute cover, median land-crossing
    // reach ~521u, and a coastal graze over fringe heights costs almost
    // nothing — cutting across an island's SPINE is what breaks a radar lock,
    // and standing off a soft-cover island buys reach on that bearing.
    // Pinned as a plain literal in zone.test.ts; retuning it is an Eric
    // decision, not a feel tweak.
    radarMastQ: 64,
    sweepRpm: 15, // rev/min — radar rotation rate (15 rpm = one 4 s revolution); keep ≤ sweepRpmMax — the effectiveStats clamp caps the TOTAL
    // rev/min — THE ratified sweep-rate ceiling (survives the 2.8 legacy-upgrade
    // strip; formerly CONFIG.upgrades.sweepSpeed.maxRpm). Clamped inside the
    // effectiveStats firewall (base + boon fold) — nothing else may re-clamp it.
    sweepRpmMax: 30,
    // u — THE RADAR GRID RESOLUTION (cycle 63, amendment 152). World units per
    // radar cell, shared because it is now gameplay-authoritative: the server
    // rasterizes a fogged hull's true silhouette onto THIS lattice and sends
    // the coverage cells (`ReturnBlipEvent` — sim/radarRaster.ts), so the cell
    // size decides what the wire says. Promoted from the client-only
    // `CLIENT_CONFIG.blip.heatmap.cellU`, which now REFERENCES this value —
    // never a second constant (the one-ruler rule). Cell indices on the wire
    // are absolute (`Math.floor(worldU / radarCellU)`), the same lattice the
    // client heatmap anchors to, so a footprint survives every grid re-anchor.
    //
    // 6 → 9 AT THE CYCLE-63 REVIEW GATE (amendments 156-157): the coarser
    // lattice is the first of the three fuzz mechanisms (a real set's
    // range/azimuth resolution), chosen so that — together with `radarFuzz`
    // below — the six hull envelopes stop being pairwise-distinct cell
    // templates. Measured across all six hulls × 4 aspects × 48 paints
    // (radarRaster.test.ts): under the SHARP 6u rasterization every envelope
    // pair was separable at a glance; at 9u with fuzz, every hull's
    // (long, short) cell-dimension RANGE overlaps at least one other hull's
    // at every aspect, while battleship-vs-torpedo-boat still separates
    // cleanly on covered-cell count and broadside-vs-bow-on still flips the
    // long axis. Changing this value CHANGES THE WIRE (every gx/gy/bits
    // reinterprets) — it is pinned beside PROTOCOL_VERSION in
    // radarRaster.test.ts, and moving it is a deliberate wire decision, never
    // a render retune.
    radarCellU: 9,
    /**
     * THE MASK FUZZ (cycle-63 review gate, amendments 156-157) — the second
     * and third resolution-loss mechanisms, applied per paint in
     * `fuzzCoverage` (sim/radarRaster.ts) on BOTH paint sources: dilation is
     * structural (always one cell, the beam-width smear — a return is the
     * target convolved with the beam), and these two knobs shape what varies
     * per paint. Gameplay-authoritative: they decide what the wire says, so
     * they live here, not in the client config.
     *
     * ACCEPTED LIMIT, stated rather than overclaimed (amendment 157): a
     * client that heuristically correlates paints can average several sweeps
     * toward the true envelope. With `id` gone correlation is itself a guess,
     * and 3-sweep persistence is a thin sample — the bar is amendment 68's
     * "it should not be easy", not cryptographic indistinguishability.
     */
    radarFuzz: {
      /** Per-side probability of one extra cell of smear (pulse-length
       *  scintillation): each paint's envelope is raw+2..raw+4 cells per
       *  axis, so a cell dimension is a random variable, not a template. */
      stretchP: 0.5,
      /** Per-cell drop probability on the smear fringe (glint). The hull's
       *  own core cells are never dropped, so a mask is never empty and
       *  amendment 127's `minPeak` floor always has a footprint to land on. */
      glintP: 0.35,
    },
    // ms — THE ONE WAKE CLOCK (Story 4.12, Eric ruling 2026-08-08, amendment
    // 205): how long a stretch of disturbed water physically persists behind
    // the hull that laid it, before it flattens and stops existing — on the
    // water AND on the radar lattice, because there is exactly ONE wake with
    // exactly ONE length (amendment 204: the on-water foam and the radar
    // ribbon are two RENDERINGS of the same geometry, never two objects with
    // two lifetimes). Promoted from the client-only `CLIENT_CONFIG.wake.life`
    // (1.1s) the moment the server started rasterizing the same ribbon —
    // the standing rule that a value becomes shared CONFIG when it becomes
    // gameplay-load-bearing.
    //
    // CUT 12000 -> 5500 BY ERIC ON SEEING IT LIVE (cycle 71, ruling
    // 2026-08-09, amendment 213). The 12s figure was fitted to real-ship
    // physics and the physics is unchanged and still recorded below — what
    // moved is that a physically honest wake is too much wake for THIS ocean.
    // Eric, at full ahead in a torpedo boat: *"that wake trail is far as
    // fuck"*. It was: 540u of track against a 660u radar radius is 82% of
    // your own scope radius and 41% of its full width, drawn behind you at
    // all times.
    //
    // THE LENGTH IS NOW AN EIGHTHS-LADDER RUNG (amendment 113's one ruler):
    // the FASTEST hull's full-ahead track is exactly `CONFIG.vision.detect`,
    // the 3/8 rung — your wake reaches as far behind you as detect reaches
    // around you. So the clock is `detect / fastest maxSpeed` = 247.5 / 45 =
    // 5500ms EXACTLY, and full-ahead tracks become torpedo boat 247.5u (2.5
    // hull lengths), mine layer 220u (2.5), battleship 192u (1.5).
    //
    // WRITTEN AS A LITERAL AND PINNED, NOT COMPUTED, and the distinction is
    // deliberate: deriving it from `maxSpeed` in the object literal would let
    // a kinematics retune silently move the wake clock, which is a FEEL value
    // Eric set. The identity is asserted in shared/src/__tests__/zone.test.ts
    // instead, so a retune fails the build and a human re-decides.
    //
    // Eric DECLINED the harder rule that motivated the cut ("you may never be
    // tracked by someone who cannot paint your hull" would have been this
    // same 3/8 number by a different route, since reach 5/8 + track 3/8 =
    // 8/8): *"eh, well not *never* never, im sure that situation will happen,
    // but its not like i want to restrict getting wake returns until a hull
    // is seen."* The rung stands on its own; the no-track property is a
    // near-consequence, not a guarantee, and nothing tests for it.
    //
    // THE PHYSICS THIS REPLACED, kept because it is the reason the number can
    // never be argued back up to realism (205): a real wake's visible aerated
    // foam runs ~5-20 ship lengths and lasts 1-3 minutes; the de-aerated
    // turbulent "scar" radar actually images runs 50-200 lengths (10-20km
    // behind a real warship) — UNBUILDABLE here as a scale fact, one to four
    // times the diameter of the whole 2400u ocean. 12s was the bottom edge of
    // the playable-and-real foam band; 5.5s is BELOW it, a knowing departure
    // from realism for legibility. Length stays `speed × life` — longer wake
    // = faster ship — untouched. NOTHING MAY PURCHASE IT (no stat, boon or
    // card; the wake carries no observer scaling of any kind).
    //
    // THREE CLOCKS AGREE and a retune of any one must check the other two
    // (205): water dissipation (this, 5.5s), the phosphor paint window (12s
    // at the base sweep rate, amendment 195 — a wake paint decays on the
    // STANDARD three-paint persistence window, no wake-specific lifetime
    // exists), and the wake material's ~412u reach (amendment 203) against a
    // 192-247.5u full-ahead track. The margins all got WIDER, never tighter:
    // the track is now well inside the material's own reach.
    //
    // AND THE MAXED-SWEEP SHORTFALL IS RESOLVED BY THIS CUT (it was cycle
    // 69's review-gate P4, an accepted-not-repaired hole): the phosphor
    // window is three REVOLUTIONS, so a maxed intelSweep build (sweepRpmMax
    // 30, 2s revolutions) holds paints for 6s — which was short of the old
    // 12s water clock and now COVERS the 5.5s one with margin. The agreement
    // holds at EVERY sweep rate, not just the base one. Pinned in
    // zone.test.ts, where the assertion changed from documenting a shortfall
    // to enforcing a guarantee.
    wakeLifeMs: 5500,
    // u — the wake pose-history SAMPLE CADENCE (Story 4.12): a source records
    // a new wake sample only after travelling this far since its last one, so
    // the ribbon is a chain of ~12u segments (sim/wake.ts). One sample per
    // 9u `radarCellU` lattice cell plus margin: consecutive segments
    // rasterize contiguously (each segment's centre-line walk bridges its own
    // cells, so no spacing can open a gap) without oversampling — and the
    // per-SEGMENT disclosure gate stays about as tight as the hull's centre
    // predicate already is, because a segment spans roughly one cell of
    // bearing. MUST STAY > radarCellU (pinned with the ladder in
    // zone.test.ts); a fixed literal, never a computed quantity.
    wakeSampleU: 12,
    // × wakeLifeMs — the TORPEDO wake's life fraction (Story 4.12, Eric
    // ruling 2026-08-08, amendment 196: "roughly half"). HELD AT 0.5 through
    // the cycle-71 length cut (amendment 213) — Eric was offered the
    // alternative of raising it to hold the torpedo track near its old
    // absolute 360u and declined, because that would put a fish's tell above
    // any ship's and break the one-model-one-ratio shape. So the torpedo
    // shrinks with everything else: 2.75s at the fixed 60 u/s torpedo speed =
    // 165u of one-cell-wide ribbon (was 6s / 360u), still the LONGEST track
    // in the game per second of travel because the fish is the fastest thing
    // afloat. Findable if you happen to be watching that stretch of water,
    // easy to miss — which is the ruled reading. The FISH
    // itself still never paints and keeps its 3/8 `detect` gate — see the
    // CONFIG.torpedo header; what paints is the water behind it. Nothing may
    // purchase this either.
    wakeTorpLifeFactor: 0.5,
  },

  /**
   * THE DAMAGE BANDS (Story 4.4, amendment 41) — the ONE set of hp-fraction
   * thresholds in the game. Fractions of maxHp, read as EXCLUSIVE LOWER
   * BOUNDS FOR THE BETTER STATE: `frac >= amberBelow` is healthy,
   * `frac >= criticalBelow` is hurt, anything below `criticalBelow` is
   * critical. Exactly 0.5 is therefore healthy — no amber rail, no smoke.
   *
   * These are the own-vitals HP rail's SHIPPED thresholds (hpColor() /
   * railPulsing()), promoted here UNCHANGED because the server now decides
   * wounded smoke from them: a light plume means your rail has gone amber, a
   * heavy plume means it has gone crimson — "wounded smoke is the
   * enemy-facing half of a vocabulary that already shipped self-facing"
   * (amendment 41). BINDING: no second set of band numbers may exist
   * anywhere. `CLIENT_CONFIG.vitals.amberBelow`/`criticalBelow` MUST
   * REFERENCE these rather than restate them, so a future retune of the rail
   * moves the smoke tiers with it. Pinned by __tests__/damageBands.test.ts.
   */
  damageBands: {
    amberBelow: 0.5, // frac < this — hurt (amber rail / light smoke, tier 1)
    criticalBelow: 0.25, // frac < this — critical (crimson rail / heavy smoke, tier 2)
  },

  /**
   * Wounded smoke (Story 4.4) — the SERVER emission cadence, and nothing
   * else. Reach is deliberately NOT here: it is CONFIG.vision.muzzleFlash
   * (the 5/8 rung, SIGHT * 1.25, 412.5u) reused verbatim, never forked into a
   * fourth vision constant (amendment 42) — so Story 4.9's move of that band
   * from 6/8 to 5/8 shortened the plume's reach in the same edit, deliberately
   * (amendment 119). The tiers are CONFIG.damageBands (amendment 41).
   * Puff lifetime, drift, billow and every other presentation knob are
   * CLIENT-ONLY (CLIENT_CONFIG.smoke): the server keeps no plume history at
   * all, exactly as it keeps no radar-blip history — the client synthesizes
   * the persistence from these anonymous pulses.
   */
  smoke: {
    // ms between puffs, emitted at a smoking hull's TRUE current position.
    // Paired with the client's deliberately SHORT puff life, this cadence is
    // what keeps the plume an attached column rather than the decaying track
    // amendment 43 explicitly rejected.
    puffIntervalMs: 250,
  },

  /**
   * The foghorn (Story 4.5, amendments 51-58) — the SIM-AUTHORITATIVE cadence,
   * and nothing else. The server is the only authority on whether a honk
   * happened: it gates the emit on this cooldown and silently drops an early
   * hornSeq. The client mirrors the same number purely to avoid wire spam and
   * to play the predicted `denied` cue on an early press — an own honk is
   * NEVER client-predicted (amendment 58); the honker hears their own horn
   * from the self-addressed server event, exactly once.
   *
   * Reach is deliberately NOT here: the volume BANDS are eighths of the
   * LISTENER's own intel range (`stats.radarRange`) on the eighths ladder
   * above (Story 4.9, amendment 122 — superseding amendment 53's sightOf /
   * muzzleFlash / radarRange tiers and retiring its max() clamps, since intel
   * range is a quantity dazzle cannot touch). Never a flat foghorn constant,
   * and no CONFIG.vision constant was added for the horn (amendment 42). Horn
   * voices, the band → gain table, mix concurrency cap, chevron geometry and
   * TTL are all CLIENT-ONLY presentation (CLIENT_CONFIG.foghorn +
   * client/src/audio/horns.ts).
   */
  foghorn: {
    // ms between accepted honks, server-gated. 1.5s (Eric ruling, amendment
    // 56) chosen over 3s/5s explicitly so captains can have honk
    // CONVERSATIONS — "let them be silly". The audio mix is protected by a
    // client-side concurrency cap, not by a slower cooldown.
    cooldownMs: 1500,
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
    // ms — cooldown between shots. RETUNED 3000 → 5000 (Eric ruling
    // 2026-08-04, the global-cooldown-reduction cycle): the gun fired far too
    // often for its payload. A max shipCooldown build (5 copies, cooldownScale
    // 0.5 — the ONE global reduction line) lands it at 2.5s.
    reloadMs: 5000,
    // hp per burst victim — THE gun-damage tunable (pinned by
    // damageGuardrail.test). RETUNED 25 → 15 (Eric ruling 2026-08-04, the
    // weapon balance pass): a permanently-fitted default weapon hit far too
    // hard. HEAVY SHELLS ×5 (+3/card) tops the ladder at 30, still well under
    // the 80hp one-hit-kill floor.
    damage: 15,
    // hp to an early interceptor outside the blast (bodyblock). RETUNED 10 → 6
    // (Eric ruling 2026-08-04, weapon balance pass) — held at 40% of `damage`,
    // the ratio the bodyblock was tuned at.
    contactDamage: 6,
    burstRadius: 15, // u — blast radius around the clicked point
    shellRadius: 2, // u — shell collision radius (added to hull capsule radius)
  },

  /**
   * Torpedoes (slot 1): bow tube. The FISH itself is never painted by radar —
   * no blip, and its 3/8 `detect` gate is untouched — but since Story 4.12
   * (Eric ruling 2026-08-08, amendment 196) its WAKE is: the ribbon of
   * disturbed water behind a running torpedo paints as a weak, one-cell-wide
   * surface return at roughly half a ship's wake life
   * (`CONFIG.vision.wakeLifeMs × wakeTorpLifeFactor`). The torpedo keeps its
   * identity as the quiet weapon and gains a tell rather than losing its
   * stealth. One-deep ammo pool
   * (owner play test 2026-07-13: two tubes fired both fish within ~2 ticks of
   * one click, masking the reload — 12s at the time, 30s since the 2026-08-04
   * balance pass; one fish per click + a real reload is the intended
   * commitment-spike feel). The bow tube is now just the pool.
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
    // hp. RETUNED 55 → 70 (Eric ruling 2026-08-04, the weapon balance pass): a
    // heavier fish on a much longer commitment cycle. HEAVY WARHEAD ×5 was
    // simultaneously cut to +1/card so the ladder tops at 75 — strictly under
    // the 80hp one-hit-kill floor (see sim/boons.ts torpedoDamage).
    damage: 70,
    maxAmmo: 1, // one fish in the tube pool
    // ms — reload between fish (commitment spike). RETUNED 12000 → 30000 (Eric
    // ruling 2026-08-04, weapon balance pass): the heavier warhead buys a much
    // longer commitment cycle. A max shipCooldown build (5 copies,
    // cooldownScale 0.5) lands it at 15s.
    reloadMs: 30000,
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
    // tunes): 1300u ≈ just under two full crossings of base radar range (660u).
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
    // u — max distance of the clicked placement point. Eric ruling 2026-08-02:
    // 90u was barely a hull and a half astern of a battleship (124u long), so
    // "laying a field" meant dropping mines on your own transom and sailing off
    // it; 150u is a real leash — you can seed the water you just left, or the
    // gap you are backing away from, without the rack becoming a ranged weapon
    // (it stays a fraction of gun/radar reach). Every consumer derives from
    // this: the rear placement wedge IS drawn at placeRange (render/firing.ts
    // via weaponArc.weaponRangeU), the client's range-denial gate and the
    // server's activation check both read it, so the leash moves in one place.
    placeRange: 150,
    armDelay: 3000, // ms — before it can trigger
    triggerRadius: 32, // u — detonation proximity (enemy pass-over trips it)
    // u — full damage to every non-owner hull within it; > triggerRadius by
    // design (the trip is the detection ring; the blast reaches farther).
    blastRadius: 48,
    // hp. RETUNED 45 → 55 (Eric ruling 2026-08-04, the weapon balance pass).
    // TNT → RDX FILLER ×5 (+4/card) tops the ladder at 75 — strictly under the
    // 80hp one-hit-kill floor.
    damage: 55,
    // stored drops in the ammo pool (one refilled per reload). RETUNED 1 → 2
    // (Eric ruling 2026-08-04, weapon balance pass): a Mine Layer could not lay
    // a FIELD with a one-deep rack. This is a BASE change with no new
    // machinery — the same shared pool path torpedoTube already exercises for a
    // 2-deep pool — and deliberately NOT a new catalog card. `maxLive` (5) is
    // untouched and remains a distinct cap (see below).
    maxAmmo: 2,
    // ms — reload between drops. RETUNED 8000 → 15000 (Eric ruling 2026-08-04,
    // weapon balance pass): the rack got deeper, so each round costs more. A
    // max shipCooldown build (5 copies, cooldownScale 0.5) lands it at 7.5s.
    reloadMs: 15000,
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
    // --- SELF-PROPELLED MINES doctrine (Story 2.8, exclusive boon).
    // Armed mines creep toward the nearest enemy hull within acquire range.
    // ACQUISITION IS SILHOUETTE-METRIC (Eric ruling 2026-08-02): the range below
    // is measured mine→hull POLYGON (pointPolygonDistance — the SAME metric the
    // trigger uses), never mine→ship center. The old 60u center-metric ring was
    // strictly INSIDE the trip ring for every hull in the game (hulls are
    // 85–124u long, so a ship trips the mine at 74–94u CENTER distance): the
    // doctrine could never acquire anything. 150u of silhouette reach clears
    // even a max-mineTrigger battleship's 51.5u trip ring by a wide margin, and
    // 14 u/s is a crawl that can still close it before the hull sails past.
    creepSpeed: 14, // u/s — crawl speed of an armed self-propelled mine
    creepAcquireRange: 150, // u — SILHOUETTE-distance acquisition radius
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
    // ms — cooldown between shots (the commitment spike). RETUNED 15000 →
    // 50000 (Eric ruling 2026-08-04, the global-cooldown-reduction cycle): a
    // 500 u/s shell at a 15s cadence gave no reaction window, making the
    // cannon the strongest weapon in the game.
    // AMENDED 50000 → 45000 (Eric ruling 2026-08-04, the weapon balance pass):
    // the same-day 50s retune overshot; 45s keeps the commitment spike without
    // benching the slot. A max shipCooldown build (5 copies, cooldownScale 0.5)
    // now lands it at 22.5s (it was 25s under the 50s base).
    reloadMs: 45000,
    // hp per burst victim (pinned by damageGuardrail.test). RETUNED 50 → 65
    // (Eric ruling 2026-08-04, weapon balance pass). HEAVY CHARGE ×5 was
    // simultaneously cut to +2/card so the ladder tops at 75 — strictly under
    // the 80hp one-hit-kill floor (see sim/boons.ts cannonDamage).
    damage: 65,
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
   * soft pity genuinely rise (rareRate climbs from the dry-1 dip of ~0.43 to
   * ~0.57 by dry 6, vs a ≈flat ~0.4 across the same span at the old 0.35 dial;
   * the dry-0 opening rate is ~0.48 either way) and trims the
   * first-exclusive tail without flooding shallow draws.
   *
   * STALE RATES, DIALS UNCHANGED (2026-08-04, global-cooldown cycle 41): the
   * ~0.48/~0.57 figures above were measured against the 42-line catalog.
   * Deleting the seven per-equipment reload ladders removed 35 COMMON cards
   * while leaving every rare/exclusive in place, so rare DENSITY rose on every
   * deck (TB 14.5% -> 17.2%, ML 11.4% -> 13.2%) and with it the draw rate — a
   * review simulation puts TB dry-0 P(>=1 rare per offer) at ~0.59, i.e. the
   * new OPENING rate now exceeds the old ratified dry-6 pity CEILING. The dials
   * themselves are untouched: retuning them is a balance decision that needs an
   * Eric ruling + a batch-sim pass, and is ledgered in deferred-work.md. Treat
   * the numbers above as the amendment-57 provenance record, not current rates.
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

  /**
   * THE BOUNTY (Story 4.6, Eric ruling 2026-08-10) — the held throne over
   * CAPTAIN-only kills. The kill leader is named publicly (ArenaState.bountyId,
   * identity ONLY — never a position, class, hp, hue, or kill count; the ruling
   * deleted the Bounty Bloom and every location channel with it), and sinking
   * the holder pays `killLevels` ON TOP of the standard captain-kill level
   * through the unchanged grantXp pipeline. The throne moves only on a STRICT
   * OVERTAKE — a tie never transfers it in either direction — and only an
   * ALIVE captain with at least `minCaptainKills` can hold it. Drones never
   * count toward it and never hold it (the Public Register's "drones are not
   * combatants" position). Rule lives in server/src/game/bounty.ts.
   */
  bounty: {
    killLevels: 1, // bonus levels for sinking the holder, on top of the standard captain kill (Eric ruling 2026-08-10)
    minCaptainKills: 1, // captain kills required to hold the throne — a zero-kill field has no bounty (Eric ruling 2026-08-10)
  },

  /**
   * DAMAGE CONTROL (Eric rulings 2026-08-04) — the always-available heal
   * spend: a permanent strip beneath the refit band's four-card row. NOT a
   * card: never drawn, never in the deck (BOON_CATALOG / CONFIG.deck /
   * CONFIG.offer untouched — deck composition is byte-identical). Spending
   * one banked level restores `instantHp` immediately (clamped to maxHp) and
   * adds `regenHp` to a regen pool that drains at the fixed rate
   * regenHp/regenMs (5 hp/s). Pools ADD, never accelerate: two heals run 10s
   * at 5 hp/s, never 5s at 10 hp/s. Amounts are FLAT on every hull — no
   * maxHp scaling, no upgrade scaling, no class variation. Every number is a
   * DESIGN TARGET, tunable.
   */
  damageControl: {
    instantHp: 25, // hp restored immediately at spend time (clamped to maxHp)
    regenHp: 25, // hp added to the regen pool per heal spend
    regenMs: 5000, // ms — payout time of one regenHp pool (the 5 hp/s rate)
  },

  /**
   * Storm circle / battle-royale zone — the PHASED ring timeline (Story 3.1).
   * ringSteps.length + 1 ring groups, each a four-beat rhythm of beatMs per
   * beat (clear → reserved structural slot → next ring revealed → ring closes
   * over one beat); full closure at groups × 4 × beatMs (12:00 at the shipped
   * defaults). Rings are offset-center circles rolled once at zone start on a
   * server-private stream; the terminal ring radius is DERIVED as
   * terminalSightFactor × CONFIG.vision.sight (the Story 3.4 endgame pillar —
   * never an independent constant). Semantics + structural guards live in
   * sim/zone.ts. Every number is a DESIGN TARGET pending the 3.1 evidence
   * checkpoint; stormDps deliberately sits OUTSIDE the ZoneTimeline override
   * shape (damage is never overridable).
   */
  zone: {
    beatMs: 60000, // ms — one beat; a ring group is 4 of these
    // Per-group geometric exponents of the intermediate rings in the descent
    // map radius → terminal (r_g = R·(T/R)^step): equal ratio steps — the
    // ratified pure-geometric shrink (amendment 5). Length sets the group count.
    ringSteps: [1 / 3, 2 / 3],
    offsetCap: 1.0, // ≤ this × (r_cur − r_next) next-ring center offset (structurally clamped 0..1)
    terminalSightFactor: 2, // × CONFIG.vision.sight — the endgame ring radius (660u at sight 330)
    /**
     * SUDDEN DEATH — THE FINAL COLLAPSE (Eric ruling 2026-08-14, authorizing the
     * long-parked contingency he wrote on 2026-08-04: *"sudden death at 15
     * minutes that fully closes the ring in until it is all storm at 16
     * minutes"*, plus the new clause that the collapse point is MARKED at
     * 14:00). It appends a FOURTH ring group to the same four-beat rhythm, so
     * at the 60s beat above the beats land on Eric's clock exactly:
     *   12:00 clear · 13:00 supply · 14:00 reveal (the X mark) · 15:00-16:00
     *   the terminal ring shrinks CONCENTRICALLY onto its own center to r=0.
     * Full closure moves 12:00 -> 16:00 (zoneClosedAtMs 720_000 -> 960_000) and
     * the map is 100% storm from 16:00, which is what structurally ENDS a match
     * that the geometric endgame bar (epic-3 amendment 24) could not.
     *
     * The collapse ring is CONCENTRIC with the terminal ring and carries no
     * roll, no seed and no new wire field — it is synthesized identically on
     * both sides (sim/zone.ts). stormDps is untouched: Eric ruled the GEOMETRY,
     * not the damage curve. Turning this off restores the shipped three-group
     * 12:00 timeline byte-for-byte.
     */
    suddenDeath: true,
    stormDps: 4, // hp/s — damage while outside the live ring, every phase
  },

  /** Match lifecycle. */
  match: {
    countdown: 15000, // ms — ready-room countdown once minHumans reached
    joinWindow: 30000, // ms — room stays open/joinable after minHumans before the countdown arms (gathering phase; Eric ruling 2026-08-02)
    minHumans: 2, // humans required to start the countdown
    fillTo: 20, // total ships at start (drones fill the rest) — 3.1 design target (amendment 7)
    // s — results overlay before the room disposes. 10 -> 45 (Story 5.3, epic-5
    // amendment 27): the old ceiling predates there being anything to READ on
    // that screen. It must now contain the last sinking captain's window closing
    // (amendment 20 holds finish() open for it), the omniscient reveal, and a
    // modal carrying the MATCH LOG. The dev-only matchOverride.resultsMs is
    // untouched, so every headless smoke still runs at its own 3000 ms.
    resultsSeconds: 45,
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
  /**
   * OPTIONAL per-hull gun override (Story 5.6). Present only on PvE fleet
   * envelopes, which carry a weaker gun than a captain's (6/8/10 vs 15).
   * Applied inside `baseStats()` so `effectiveStats()` remains the single
   * derivation path — no hull id is threaded through it and nothing mutates
   * `ship.stats` after construction. Absent on every real ship class, which
   * therefore keeps CONFIG.gun verbatim.
   */
  gun?: { damage: number; reloadMs: number };
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

/** The CONFIG.drones size key for a hull id, or null for a real ship class. */
export function droneSizeOf(id: HullId): DroneSizeId | null {
  switch (id) {
    case 'droneSmall':
      return 'small';
    case 'droneMedium':
      return 'medium';
    case 'droneLarge':
      return 'large';
    default:
      return null;
  }
}

/** The drone hull id for a CONFIG.drones size key. */
export function droneHullOf(size: DroneSizeId): DroneHullId {
  if (size === 'small') return 'droneSmall';
  if (size === 'medium') return 'droneMedium';
  return 'droneLarge';
}

/**
 * The 9 hull ids of ONE fleet, largest first — the spawn order, so a fleet
 * that is truncated by an infeasible placement loses its cheapest hulls last.
 */
export function fleetHullIds(): DroneHullId[] {
  const out: DroneHullId[] = [];
  for (const size of ['large', 'medium', 'small'] as const) {
    for (let i = 0; i < CONFIG.fleet.composition[size]; i += 1) out.push(droneHullOf(size));
  }
  return out;
}

/**
 * Levels of XP one whole fleet is worth, computed from the composition and the
 * shipped tier table rather than asserted. This is EXACTLY 3 by construction
 * (2×½ + 3×⅓ + 4×¼), and the shared tests pin that — so a composition edit
 * that breaks the exact-XP property fails the build instead of quietly paying
 * a fraction.
 */
export function fleetLevels(): number {
  const tiers = CONFIG.xp.droneTierLevels;
  return (
    CONFIG.fleet.composition.large * tiers.droneLarge +
    CONFIG.fleet.composition.medium * tiers.droneMedium +
    CONFIG.fleet.composition.small * tiers.droneSmall
  );
}

/** Coerce arbitrary (wire/localStorage) input to a valid class id, default 'torpedoBoat'. */
export function sanitizeClassId(raw: unknown): ShipClassId {
  return typeof raw === 'string' && (SHIP_CLASS_IDS as readonly string[]).includes(raw)
    ? (raw as ShipClassId)
    : 'torpedoBoat';
}

/**
 * The horn catalog (Story 4.5, amendment 52) — the shared vocabulary for the
 * `h` field on a FoghornEvent and the optional `horn` join option.
 *
 * EXACTLY ONE HORN SHIPS. The variant id exists now because the wire carries
 * it (a purchased horn must be audible to everyone, not just its owner), but
 * ADDING A SECOND HORN IS CONTENT AND NEEDS AN ERIC RULING — no cycle may
 * invent horn variants. A horn's VOICE (synth layers or a sample url) is
 * client-only presentation (client/src/audio/horns.ts); this catalog is only
 * the id space both sides validate against.
 */
export const HORN_IDS = ['standard'] as const;

/** A foghorn variant id as it appears on the wire (FoghornEvent.h). */
export type HornId = (typeof HORN_IDS)[number];

/** The horn every captain fits until one is chosen/purchased. */
export const DEFAULT_HORN_ID: HornId = 'standard';

/**
 * Coerce arbitrary (wire/localStorage/join-option) input to a valid horn id,
 * default 'standard'. Never throws — an OLD CLIENT hearing a NEW horn must
 * degrade to the default voice rather than to silence or an exception
 * (amendment 52), which is the same fail-open contract as sanitizeClassId.
 */
export function sanitizeHornId(raw: unknown): HornId {
  return typeof raw === 'string' && (HORN_IDS as readonly string[]).includes(raw)
    ? (raw as HornId)
    : DEFAULT_HORN_ID;
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
