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
   * re-ratified band.
   *
   * THE RADIUS IS FIXED AND ALWAYS HAS BEEN (Eric ruling 2026-08-15, epic-6
   * amendment 11). Story 6.2 (Roster-Scaled Oceans) proposed sizing the map
   * from the roster and was CANCELLED: *"We won't be scaling the map size."*
   * The formula below is therefore dormant by construction — `capRef` equals
   * `playerCap` and `ArenaRoom` builds its World with that constant, so the
   * square root is always √1 and `mapRadius()` has only ever returned
   * `baseRadius`. That was equally true at 900u (capRef 6) and at 2400u: a
   * lobby that filled to 20 always got the same ocean a lobby of 2 got.
   *
   * The machinery is KEPT deliberately rather than deleted — it costs nothing,
   * `WelcomeMsg.playerCap` already ships at PV 36, and the unhomed TEAMS scope
   * would reopen sizing in the OPPOSITE direction (up to 60 hulls wants a
   * bigger ocean, not a smaller one). Feeding this a real roster is a
   * one-argument change at `ArenaRoom`'s `new World(...)`; do not do it without
   * a fresh ruling, and read amendment 11 first — at cap 2 the map would be
   * 885u, where the fixed 660u endgame ring is already 56% of the water.
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
   * boost); the Battleship carries gun / broadside / star shells (Story 1.7's
   * cannon was REPLACED outright by the BROADSIDE BARRAGE — 7-5 wave 2, R2.6);
   * Mine Layer keeps the universal fit (CONFIG.gun/torpedo/mine) until Story
   * 1.8. Only hull dims, hp, and
   * kinematics vary. Hull dims are the exact bow-to-stern length × max beam of
   * the shared silhouette polygon (see sim/silhouette.ts — the silhouette IS
   * the hitbox). Every number is a DESIGN TARGET, tunable.
   */
  shipClasses: {
    torpedoBoat: {
      hull: { length: 100, beam: 9 }, // u — silhouette bow-to-stern / max beam
      hp: 250, // hit points — objective toughness ladder: 1 pip=200hp, +50/pip (balance cycle 1); 2 pips
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
      hp: 350, // hit points — objective toughness ladder: 1 pip=200hp, +50/pip (balance cycle 1); 4 pips
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
      hp: 300, // hit points — objective toughness ladder: 1 pip=200hp, +50/pip (balance cycle 1); 3 pips
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
   * hp 80/100/120 → 60/75/90 → 45/60/75; maxSpeed 46/38/30 → 40/35/30.
   *
   * RETUNED AGAIN by cycle 94 (Eric rulings 2026-08-16, epic-6 amendment 24).
   * hp 60/75/90 → 45/60/75 and gun damage 1/2/3 → a FLAT 1 on every size.
   *
   * THE FLAT GUN IS A DERIVATION, NOT A FLATTENING — do not "restore" the
   * per-size table. Eric specified the damage a hull deals back over its own
   * lifetime as 3/4/5. The drone reload (5000ms) EQUALS the captain gun reload,
   * so volleys-back is exactly shots-to-kill, and the new hp ladder makes that
   * 3/4/5 shots (15/20/25s at the base 15-damage gun). Damage 1 on every size
   * therefore satisfies a per-size damage spec exactly; a per-size damage table
   * would double-count the size scaling hp already carries. Size reads through
   * hp, payout, speed, aim scatter, and how long the hull lives to keep firing.
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
      hp: 45, // hit points — 3 captain gun hits (15 dmg) to sink, 15s
      // The self-defence gun. Lives on the ENVELOPE rather than in
      // CONFIG.fleet so effectiveStats() can apply it structurally, with no
      // hull-id parameter threaded through the one derivation path.
      //
      // DAMAGE CUT 6/8/10 → 1/2/3 (Eric ruling 2026-08-14, amendment 45:
      // *"Oops, they are too strong!"*), then FLATTENED TO 1 across all three
      // sizes (cycle 94, epic-6 amendment 24) — see the block docstring for why
      // that still satisfies a per-size damage spec. A full six-hull group
      // volley is 6 damage, 1.2 dps: a 125hp Torpedo Boat lasts ~104s under
      // full group aggro. These are ATTRITION, not a threat that resolves a
      // fight on its own — see amendment 45 for what that does and does not
      // change about the farm.
      gun: { damage: 1, reloadMs: 5000 },
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
      hp: 60, // hit points — 4 captain gun hits to sink, 20s
      gun: { damage: 1, reloadMs: 5000 }, // 8 → 2 (amendment 45) → 1 (amendment 24)
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
      hp: 75, // hit points — 5 captain gun hits to sink, 25s
      gun: { damage: 1, reloadMs: 5000 }, // 10 → 3 (amendment 45) → 1 (amendment 24)
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
   * A "fleet" HERE IS THE SIX-HULL SPAWN UNIT (Eric ruling 2026-08-16, epic-6
   * amendment 24: *"keep 'fleet' = 6 hulls"*). Eric derives these numbers from
   * a twelve-hull fleet split into two halves; THAT TWELVE-HULL FLEET DOES NOT
   * EXIST IN CODE and must not be reintroduced as a constant. A rename of this
   * unit to `squadron` was offered and declined.
   *
   * XP IS DERIVED, NEVER DECLARED. `fleetLevels()` below computes it from
   * `composition` × `CONFIG.xp.droneTierLevels` and nothing anywhere hardcodes
   * a level total — Eric ruling 2026-08-16: *"no need to hardcode any amount of
   * xp into the contract."* Amendment 33's `fleetLevels() === 3` pin is RETIRED
   * and had gone vacuous on its own terms: it existed because droneMedium paid
   * ⅓ (non-dyadic), so a composition edit could quietly start paying float
   * dust. At ¼ / ½ / ¾ every tier is a dyadic rational, so EVERY integer
   * composition is exact. The surviving invariant is that the TIERS are exactly
   * representable — pinned in barrel.test.ts, never a particular total.
   *
   * 8 + 4 + 2 groups = 48 + 24 + 12 = 84 hulls across a match. That is ~1.8× the
   * 19 levels of captain kills a full 20-captain lobby offers, so PvE is
   * comfortably the largest single faucet ON PAPER — but only if it is all
   * farmed, which costs ~1.8 minutes per group, and it is CONTESTED rather than
   * granted. `MatchEndSummary.pveKillsByClass` (amendment 44) is the evidence
   * that settles whether the ceiling matters; re-derive from it, not from here.
   *
   * The wave sizes are a RATIO, not a budget: one TWELVE-HULL fleet (i.e. two
   * of these groups) per ~5 captains, held constant as the storm halves the
   * field. Totals stay FIXED rather than roster-scaled at spawn time — a thin
   * lobby is deliberately a target-rich one — so the ~5:1 ratio is tuned for a
   * FULL lobby and a short-handed match gets proportionally more prey.
   */
  fleet: {
    /**
     * Hulls per group by size. Six hulls: the half-fleet Eric ruled is the
     * spawn unit. Its XP value is DERIVED by fleetLevels(); do not restate it.
     */
    composition: { large: 1, medium: 2, small: 3 },
    /**
     * Wave schedule, measured from ZONE START (the same anchor T+ uses).
     * Deliberately literal rather than derived: Eric set these beats.
     */
    waves: [
      // GROUPS PER WAVE ARE SIZED TO THE LIVE ROSTER, not to a level budget
      // (Eric ruling 2026-08-14, amendment 45; counts doubled 2026-08-16,
      // amendment 24, when the spawn unit halved to six hulls). One TWELVE-HULL
      // fleet — i.e. TWO of these groups — per ~5 captains, held CONSTANT as
      // the storm thins the field: 20 captains / 4 fleets at 1:00, then ~10 / 2
      // at 5:00, then ~5 / 1 at 9:00, on the assumption that each ring stage
      // takes roughly half the field. Level totals are the CONSEQUENCE of that
      // ratio, not the input to it — re-derive from the ratio, never from a
      // remembered total.
      //
      // The two halves of a fleet are FULLY INDEPENDENT anchors (amendment 24);
      // pickFleetAnchor's max-min score already spreads them. Do not pair them.
      { atMs: 60000, fleets: 8 }, // 1:00 — 48 hulls (was 4 groups of 9)
      { atMs: 300000, fleets: 4 }, // 5:00 — 24 hulls
      { atMs: 540000, fleets: 2 }, // 9:00 — 12 hulls
    ],
    /**
     * u — radius the 6 hulls scatter over around their group anchor, and the
     * radius the group holds as it roves. THIS NUMBER IS THE DIFFICULTY DIAL
     * (amendment 35): a hit is witnessed by any fleet ship with LOS to both
     * attacker and victim within sight (330u), so the spread sets how many
     * guns answer. At ~150u all of them witness every hit and the witness rule
     * stops meaning anything; at ~700u none do and "fleet" stops meaning
     * anything.
     *
     * 400 → 500 (Eric ruling 2026-08-16, amendment 24: *"give their fleets a
     * bit of a larger surface area"*). Two effects compose — the group is now
     * SIX hulls rather than nine AND the radius is wider — so hull density
     * falls to ~43% of the shipped figure and typical witnesses per hit go
     * ~2-4 → ~1-3. 600 was offered and NOT taken: amendment 35's ~700u bound is
     * where the composition stops meaning anything on the water.
     *
     * NOTE the discoverability fix is the GROUP COUNT (8 in wave one, not 4),
     * not this radius. This is the "larger surface area" half of the ask.
     *
     * Raising this DOES NOT keep hulls out of the storm on its own — see
     * fleetOffset in server/src/game/world.ts, which now tests live-ring
     * containment explicitly rather than relying on the old arithmetic
     * coincidence between this value and FLEET_ANCHOR_MIN_FRACTION.
     */
    spreadU: 500,
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

  /**
   * COMBAT BOTS (Story 6.4, Eric rulings 2026-08-16) — AI CAPTAINS, `role:
   * 'bot'`: participants that contest the match outcome (unlike fleet hulls)
   * and never count as humans (FR34: a bot can never arm a countdown). Their
   * ONLY world knowledge is `perception.observe()` and their only output is a
   * validated InputMsg — structurally unable to cheat. Every bot-facing
   * tunable lives HERE, per the CONFIG-is-truth rule; the brain itself is
   * server/src/game/ai/.
   *
   * NOT a difficulty ladder (Eric ruling E1/E2): every bot plays at ONE honest
   * competence level, expressed through exactly two knobs — aim scatter and
   * reaction latency — both expected to be retuned by eye later. Variety comes
   * from per-class PRIORITY PROFILES (2 per class, assigned at spawn off the
   * seeded RNG), which decide what a bot WANTS, never how well it shoots.
   */
  bots: {
    /**
     * ms — how often each bot DELIBERATES: reselects its target, re-chooses
     * its posture, and considers a boon spend. This is a DECISION cadence,
     * never a perception one: every live bot calls perception.observe() and
     * folds the view EVERY tick (exactly once — the human client contract, a
     * frame per tick at 20Hz), because radar blips and the self-private
     * gunnery rows live for exactly one tick and an observe round-robin
     * RESONATES with the sweep (at 15 rpm a revolution is 80 ticks, 80 ≡ 0
     * mod 5, so a fixed bearing paints on the same tick-phase forever and a
     * bot whose slot missed it was PERMANENTLY radar-blind to that target —
     * the review-gate blocker that retired the old observe cadence).
     * Steering and firing are still emitted every tick; only deliberation is
     * staggered (phase-offset by id hash so 19 bots spread the scoring work
     * across ticks). The handicap lives in reactionMs and aimScatterU, never
     * in dropped perception.
     */
    decisionCadenceMs: 250,
    /**
     * ms — reaction latency: a contact must persist this long in the bot's
     * view before the bot acts on it (fires at it, turns to engage). The
     * second of the two difficulty knobs (E2) — scatter blunts marksmanship,
     * this blunts reflexes. Consumed by wave-2 tactics; tuned to "competent
     * but beatable", retune by eye.
     */
    reactionMs: 400,
    /**
     * u — 1σ-style uniform-disc scatter on the lead-corrected aim point at
     * `aimScatterRefU` range, scaling linearly with actual range (the fleet
     * AI's aimScatterU precedent, 8-25u by hull size — a captain-grade bot is
     * tighter than the best fleet hull, per the E2 ruling: ~6u at 250u).
     */
    aimScatterU: 6,
    /** u — the reference range aimScatterU is quoted at (scatter scales as
     *  range / aimScatterRefU, so long shots wander proportionally more). */
    aimScatterRefU: 250,
    /**
     * Fraction of max hp below which a bot DISENGAGES — breaks off the fight
     * and opens range (B2: retreat is real; fighting to the death reads as
     * robotic). Class tactics decide HOW (boost out, mine astern, trade while
     * backing); this only sets WHEN.
     */
    disengageHpFrac: 0.35,
    /**
     * Fraction of max hp below which a banked level is spent on DAMAGE CONTROL
     * (HEAL_CHOICE) instead of a card (D2). Above it, bots always build.
     */
    healHpFrac: 0.5,
    /**
     * Own-live-mine count below which a bot may lay a PREPARED mine — seeded
     * with NO target while the posture is safe (Eric ruling 2026-08-20,
     * cycle 111: the ML *"wants certain things… you just have to be lined up
     * well and prepare"*). This is the headroom kept under `mine.maxLive`
     * (5) so a REACTIVE lay always has room: `addMine` silently EVICTS the
     * owner's oldest mine at the cap, so an unbounded prepared lay every
     * reload would churn the very field it just built. 3 = maxLive − the
     * 2-deep drop pool (mine.maxAmmo), so even a full rack of reactive
     * drops on top of a fully-prepared field never evicts a laid trap.
     * Consumed by server ai/equipment.ts (the prepared-lay gate) and nothing
     * else — bot policy, never a combat constant.
     */
    preparedMineReserve: 3,
    /**
     * ms — how long a bot trusts a stale contact's last-known pose (a radar
     * blip with no live contact decays as low-confidence memory). Longer than
     * the fleet AI's 3000ms memoryMs — a captain plots a track; a fleet hull
     * merely holds a bearing — and shorter than the client's 12s phosphor,
     * because chasing minute-old paint reads as clairvoyance in reverse.
     */
    contactMemoryMs: 8000,
    /**
     * THE UN-BEACH MANOEUVRE, IN FOUR NUMBERS. It ran on ONE (`stuckMs`, doing
     * double duty as the arming dwell AND the astern burst length) until the
     * measurement below; the split is what makes it work on the slowest hull.
     *
     * ms of SUSTAINED LAND CONTACT (ShipRecord.landContact, never a speed
     * guess) before the un-beach manoeuvre ARMS — the fleet AI's stuck-trip
     * precedent at 1200ms, with a little more patience because the grounding
     * damp caps a beached hull well above zero and a captain-grade brain
     * should be reversing off, not oscillating. It doubles as the graze
     * debounce: a brush that resolves inside this window never commands
     * astern. THIS IS NO LONGER THE BURST LENGTH (see unbeachAsternMaxMs).
     */
    stuckMs: 1500,
    /**
     * ms — the CEILING on the full-astern burst. The burst normally ends
     * EARLIER, on its condition (land contact cleared AND unbeachClearU of
     * sternway made good), which is what makes it right on all three hulls
     * instead of only the nimble one; this is the backstop for a hull the
     * water will not release.
     *
     * DERIVED FROM THE WORST HULL, the Battleship, which is why the old
     * single-constant 1500ms burst failed: a bot arms while STILL MAKING WAY
     * at the grounding cap (islandSpeedMult x maxSpeed = 8.75 u/s), so a full-
     * astern order first has to kill that way at `decel` — 8.75/9 = 0.97s of
     * still travelling FORWARD — and only then build sternway at `accel`
     * (0 -> 9 u/s in 1.8s, covering 8.1u). Measured net displacement over one
     * 1500ms burst was torpedoBoat -1.76u, mineLayer -0.06u, battleship
     * +3.21u: the heaviest hull ended its "escape" DEEPER IN THE ROCK, and
     * the per-class worst land-contact runs (10.1s / 13.0s / 272.2s) ordered
     * exactly the same way. The Battleship needs 0.97 + 1.8 + (15 - 8.1)/9 =
     * 3.54s to meet the clearance condition; 4000ms leaves ~13% for the
     * resolver's shove and the head-on damp. The other two hulls meet it in
     * ~2.3s and never reach this ceiling.
     */
    unbeachAsternMaxMs: 4000,
    /**
     * u — sternway made good (straight-line displacement from where the burst
     * armed) before the burst may end. The fleet pilot's proven figure: its
     * 2.5s burst backs ~15u down the track the hull sailed in on, and 250
     * campaign matches took zero cap-outs on it.
     *
     * Paired with "land contact has cleared", and the pairing is what makes
     * plain displacement a safe stand-in for sternway: the most ground any of
     * the three hulls can make FORWARD after a full-astern order is
     * v^2/(2 x decel) = 4.25u (battleship), 3.5u (torpedoBoat), 3.3u
     * (mineLayer) — all far under 15u — so this threshold cannot be tripped
     * by the forward half of the burst.
     */
    unbeachClearU: 15,
    /**
     * ms — THE EXIT-HEADING GRACE HOLD, the manoeuvre's third stage and the
     * cure for the metronome: without it a bot backs off cleanly, instantly
     * re-seeks a target bearing that still runs through the same island, and
     * drives straight back in (land-contact EPISODES per bot-match roughly
     * doubled, ~2 -> ~5, when the arming half was fixed and this was not).
     * Target-seek is suppressed for this long and the helm simply holds the
     * heading the hull left the burst on; avoidance stays live.
     *
     * Longer than the worst-case astern -> ahead turnaround, which is the
     * floor it must clear: a Battleship at -9 u/s brakes to 0 at `decel` in
     * 1.0s and only reaches its `steerageSpeed` (8 u/s — full rudder
     * authority) 1.6s after that, so 2.6s of the hold is spent merely getting
     * way back on and ~0.4s is committed forward running. The light hulls,
     * which turn around in 1.8-1.9s, get over a second of it. The fleet
     * pilot's own grace is the same 3s, and its 250-match campaign took zero
     * cap-outs on it.
     */
    unbeachHoldMs: 3000,
    /**
     * The 2 priority profiles per class (Eric ruling E1: *"Each ship should
     * just get 2-3 different 'priority profiles'"*) — assigned per-bot at
     * spawn off the seeded RNG. Profiles decide what a bot WANTS, never its
     * competence: TB raider = isolated/damaged targets, torpedo opener, boost
     * out; TB duelist = rear-quarter turn-fights vs peers; BS bulwark =
     * attrition on HP; BS siege = standoff broadside + star shells; ML forager =
     * fleet clearing for the level lead; ML trapper = mines astern while
     * withdrawing. Behaviour tables live in server ai/profiles.ts — only the
     * ID VOCABULARY is data, so it lives here.
     */
    profiles: {
      torpedoBoat: ['raider', 'duelist'],
      battleship: ['bulwark', 'siege'],
      mineLayer: ['forager', 'trapper'],
    } as const,
    /**
     * PER-PROFILE boon weights (Eric ruling D1: *"Sure"* — first-pass weights
     * derived by the orchestrator, placed in CONFIG as a tuning panel, like
     * the height-field knobs). Keyed by PRIORITY PROFILE, not by class: two
     * bots of the same hull sailing different profiles want DIFFERENT cards,
     * which is the whole point of the E1 ruling — a class-keyed table cannot
     * express "the standoff battleship buys star shells and the attrition
     * battleship buys hull".
     *
     * Two levels, resolved by wave-2 ai/spending.ts as `lines[id] ?? cat[def
     * .category] ?? default`:
     *   `cat`   — the base weight for every card of a boon CATEGORY, covering
     *             exactly the categories that profile's deck can draw (the
     *             three universals — intel/ship/guns — plus its carried
     *             equipment's).
     *   `lines` — per-BOON-LINE overrides (real ids from sim/boons.ts) for the
     *             handful of cards a profile wants more or less than its
     *             category base. Everything unnamed falls through to `cat`.
     * A bot picks the highest-weighted offered card, rarity as tiebreak.
     * Higher = wanted more; the absolute scale is arbitrary.
     *
     * THE MINE-LAYER DOCTRINE SPLIT, AND A CORRECTION OF RECORD. These weights
     * were first written against the PRE-cycle-95 mine rack, where
     * `minePropFouling` carried `mult: 0.6` on `mine.damage`. That mattered
     * arithmetically: a base mine does 55 and a small PvE fleet hull has 45 hp,
     * so a base mine ONE-SHOTS a fleet hull while a fouling mine (33) does not
     * — and one-shotting fleet hulls is what `forager` lives on (C3). So
     * forager weighted the card 0.4 and trapper 2.0, a genuine same-card
     * disagreement.
     *
     * AMENDMENT 25 DELETED THAT MULTIPLIER (Eric: *"remove damage decrease for
     * the fouling mines"*), so the penalty forager was avoiding no longer
     * exists and prop-fouling is now a PURE ADD. Forager's 0.4 is therefore
     * retired rather than defended — keeping it would have been a bot avoiding
     * a card for a reason the game no longer contains, which is exactly the
     * stale-rationale trap this comment block exists to prevent.
     *
     * What survives is a WEAKER, still-real split: `trapper` keeps the fouling
     * want because the slow drags a victim INTO its minefield, which is its
     * whole plan; `forager` merely has no special use for a slow (a fleet hull
     * dies to one mine either way). Both doctrines are pure adds and
     * side-grades to each other, so neither profile refuses one.
     *
     * CAPTIVE IS A SURVIVAL-AND-PAYOFF TOOL, NOT A FARMING TOOL (Eric
     * playtest ruling 2026-08-20, cycle 111 — partially reversing the
     * cycle-110 demotion). The mechanical fact from that cycle STANDS: a
     * captive mine's trip gate is HOSTILE-ONLY (isCaptiveMineHostile), so a
     * neutral PvE fleet drone walks straight over it and CAPTIVE can never
     * farm fleet. But the conclusion drawn from it — that `forager` therefore
     * doesn't want the card — was the wrong frame. Eric ran CAPTIVE MINES and
     * GUN BUOY together and reports both as *"REALLY powerful weapons, you
     * just have to be lined up well and prepare"*: a 144u-trip torpedo
     * launcher covers the water a hull that HANGS BACK is withdrawing
     * through, which is precisely what a class whose measured problem is
     * SURVIVAL (181.1s vs the random control's 264.0s) should buy. Forager's
     * entry is restored as a wanted line at 2.0 — above its mines category
     * base and its fouling want, below its gun ladder (it is still a
     * gun-led fleet-clearer) and below `trapper`'s 2.4, which stays the
     * stronger signature. `buoyGun` — the other half of the combo — gets an
     * explicit override in BOTH ML tables; it was previously named by
     * neither and fell through to a bare category weight.
     *
     * THE SIX ACQUISITION CARDS GET A FULL RANKING PER PROFILE (same ruling).
     * An acquisition card inherits its TARGET equipment's category
     * (sim/boons.ts `acquire`), and no profile's `cat` table names a category
     * its hull does not already carry — so all six scored the 0.5 unlisted
     * default and the extra slot stayed empty by accident. Every profile now
     * ranks ALL SIX explicitly, every entry above that floor: a bot PREFERS
     * its favourite pickup but SETTLES for the best on offer — it never
     * passes out of pickiness. (Entries for equipment a hull already carries
     * are undrawable and exist only to make the ranking total.)
     *
     * STORY 7-5 WAVE 2 RE-KEYED FIVE MORE for the same forced reason — the
     * cannon and the decoy buoy were replaced outright, taking `cannonDamage`,
     * `decoyDuration` and `mineSelfPropelled` with them. Each moved to the
     * surviving line carrying the same INTENT, never re-tuned: siege's cannon
     * want becomes `broadsideTurrets` (the broadside's throughput line, its
     * only damage-shaped card), both Mine Layer profiles' SELF-PROPELLED want
     * becomes `mineCaptive` (its direct successor — a mine that reaches the
     * target itself), and trapper's decoy want becomes `buoyDuration`. The two
     * `cannon`/`decoyBuoy` CATEGORY weights carry over verbatim onto
     * `broadside`/`radarBuoy`.
     *
     * STORY 7-5 WAVE 1 RE-KEYED FOUR OVERRIDES, and this was forced rather
     * than chosen: `starRadius`, `mineDamage` and `mineMax` were DELETED from
     * the catalog, and a per-line override naming a card that no longer exists
     * is dead data that scores nothing (a test pins that every key here is a
     * real line, precisely so a catalog move fails loudly instead of silently
     * dropping a bot's priority). Each was re-pointed at the surviving line
     * that carries the same INTENT for that profile, never re-tuned:
     * siege's star-shell want moves to `starDuration` (its only remaining
     * star-shell line), and both Mine Layer profiles' mine want consolidates
     * onto `mineBlast` — which since the cycle-95 merge grows the trip ring
     * too, so it is now the whole mine rack in one card. `trapper` picks up an
     * explicit `decoyDuration` in the freed slot, matching the `decoyBuoy: 2.0`
     * category weight it already carried.
     */
    boonWeights: {
      // TB raider — torpedo opener at credible range, then boost out. Buys
      // tubes/homing/speed to make the one opener count, and hull last.
      raider: {
        cat: { torpedoes: 2.2, ship: 2.0, guns: 1.5, speedBoost: 1.8, intel: 1.5 },
        lines: {
          torpedoTube: 2.5, torpedoHoming: 3.0, torpedoSpeed: 2.2, shipSpeed: 2.2, shipCooldown: 2.0, shipHull: 1.2,
          // Acquisitions, ranked: a striker wants more strike (flares to
          // light a straggler), then intel, then off-identity settles.
          acquireTorpedo: 1.6, acquireBoost: 1.4, acquireStarShells: 1.2, acquireRadarBuoy: 1.0, acquireMine: 0.8, acquireBroadside: 0.7,
        },
      },
      // TB duelist — rear-quarter turn-fight, guns through the 30s torpedo
      // reload. Guns and the global cooldown lever come first.
      duelist: {
        cat: { guns: 2.4, ship: 2.2, torpedoes: 1.4, speedBoost: 1.6, intel: 1.3 },
        lines: {
          gunBarrel: 2.6, gunTurret: 2.2, shipCooldown: 2.4, shipSpeed: 2.2, shipHull: 1.6, torpedoHoming: 2.0,
          // Acquisitions: knife-range tools first — a beam fan and a dazzle
          // flare are both decided inside the turn-fight.
          acquireBroadside: 1.4, acquireStarShells: 1.3, acquireBoost: 1.2, acquireTorpedo: 1.1, acquireMine: 0.9, acquireRadarBuoy: 0.8,
        },
      },
      // BS bulwark — attrition. Trades on hp, so hull is the top line of any
      // profile's table.
      bulwark: {
        cat: { ship: 2.4, guns: 2.0, broadside: 2.0, starShells: 1.0, intel: 1.0 },
        lines: {
          shipHull: 3.0, shipCooldown: 2.2, shipSpeed: 1.4, gunBarrel: 2.2, starDazzle: 1.6,
          // Acquisitions: ground-holding tools — a field and a picket buoy
          // both defend the water it refuses to leave.
          acquireMine: 1.4, acquireRadarBuoy: 1.2, acquireTorpedo: 1.1, acquireBroadside: 1.0, acquireStarShells: 0.9, acquireBoost: 0.8,
        },
      },
      // BS siege — standoff, broadside-led, star shells to resolve stale
      // contacts into live sight (C2). Its reach is FIXED: gun, broadside and
      // star-shell rangeU all ride radarRange (the broadside at the 5/8 rung),
      // and no card moves that number since RANGE I–IV was deleted
      // (2026-08-20), so `intel` now buys sweep rate only. The appetite is
      // deliberately LEFT UNTUNED here — a bot retune belongs to a balance
      // pass, not to a card removal (ledgered in deferred-work.md).
      siege: {
        cat: { broadside: 2.6, starShells: 2.0, intel: 2.2, ship: 1.8, guns: 1.6 },
        lines: {
          // `intelRange` was dropped here when RANGE I–IV left the catalog
          // (2026-08-20, cycle 118) — the key would name a card that no
          // longer exists, which a pin refuses.
          broadsideTurrets: 2.8, starDuration: 2.2, shipCooldown: 2.2, shipHull: 1.6,
          // Acquisitions: sensors for standoff fire first, then a torpedo the
          // band pull can ease it in behind.
          acquireRadarBuoy: 1.5, acquireStarShells: 1.3, acquireTorpedo: 1.2, acquireMine: 1.1, acquireBoost: 0.9, acquireBroadside: 0.8,
        },
      },
      // ML forager — clears PvE fleet groups for the level lead (C3). Guns
      // and rate of fire do that work; see the propFouling note above.
      forager: {
        cat: { guns: 2.4, mines: 1.8, intel: 2.2, ship: 1.8, radarBuoy: 1.0 },
        lines: {
          // `intelRange` dropped with RANGE I–IV (cycle 118) — see siege.
          gunBarrel: 2.6, gunTurret: 2.4, shipCooldown: 2.6, mineBlast: 2.0,
          // CAPTIVE restored as a WANTED line (Eric playtest, 2026-08-20):
          // a survival-and-payoff tool for a hull that hangs back — its
          // hostile-only trip still cannot farm fleet, but that was never
          // the point. Priced WITH the gun buoy (the other half of Eric's
          // powerhouse combo), below the gun ladder and below trapper's 2.4
          // signature — see the block comment.
          mineCaptive: 2.0, buoyGun: 2.0, minePropFouling: 1.2,
          // Acquisitions: faster rotation between fleet groups, more
          // clearing throughput, light for the next group.
          acquireBoost: 1.4, acquireBroadside: 1.3, acquireStarShells: 1.2, acquireTorpedo: 1.0, acquireMine: 0.9, acquireRadarBuoy: 0.8,
        },
      },
      // ML trapper — mines astern while withdrawing, a radar buoy for reach,
      // fights near its own field.
      trapper: {
        cat: { mines: 2.6, radarBuoy: 2.0, ship: 1.8, guns: 1.6, intel: 1.6 },
        lines: {
          // CAPTIVE's strongest want lives HERE (2026-08-20): a hostile-only
          // torpedo mine is a trap for exactly the hulls a trapper traps.
          // Fouling stays its signature (drags victims into the field), and
          // the GUN BUOY gets its explicit want (cycle 111 — half of Eric's
          // "lined up well and prepare" powerhouse combo, previously falling
          // through to the bare 2.0 category weight): a picket that fights
          // over the field while the trapper itself stands off.
          mineBlast: 2.8, minePropFouling: 3.0, mineCaptive: 2.4, buoyGun: 2.2, shipCooldown: 2.2, buoyDuration: 2.0,
          // Acquisitions: ambush weapons that fire FROM the field.
          acquireTorpedo: 1.5, acquireStarShells: 1.3, acquireBoost: 1.1, acquireMine: 1.0, acquireBroadside: 0.9, acquireRadarBuoy: 0.8,
        },
      },
    },
    /**
     * The callsign pool (Eric ruling E5(a)): nautical names drawn without
     * repeat, so the kill feed reads `HALYARD sank BILGE RAT` rather than
     * `BOT-07`. ~30 names — comfortably above the 19-bot worst case; a pool
     * exhausted anyway (tests) reuses names with a numeric suffix. Edit
     * freely: nothing keys on the strings.
     */
    callsigns: [
      'HALYARD', 'FATHOM', 'SQUALL', 'CORSAIR', 'MAELSTROM',
      'KEELHAUL', 'BILGE RAT', 'JETSAM', 'FLOTSAM', 'LEEWARD',
      'WINDWARD', 'MAINSTAY', 'CAPSTAN', 'SCUPPER', 'BOWSPRIT',
      'MIZZEN', 'GUNWALE', 'MONSOON', 'RIPTIDE', 'UNDERTOW',
      'SPINDRIFT', 'TRADEWIND', 'DOLDRUM', 'SEXTANT', 'ASTROLABE',
      'CROWSNEST', 'MOONRAKER', 'BINNACLE', 'DEADLIGHT', 'LODESTAR',
    ],
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
   *   8/8    SIGHT * 2       660      radar          radar sweep; gun and
   *                                                  star-shell base range;
   *                                                  foghorn band 8 (50% gain)
   *   7/8    SIGHT * 1.75    577.5    farRadar       NONE — see the comment on
   *                                                  the field itself
   *   5/8    SIGHT * 1.25    412.5    muzzleFlash    muzzle flash + wounded
   *                                                  smoke (one constant, both);
   *                                                  BROADSIDE range (7-5 w2)
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
    // `sightOf(me, now) * detectFactor`, so a star-shell dazzle halves it,
    // with island LOS applied unchanged. Nothing WIDENS it any more: the card
    // that once did (intelTruesight, merged into intelRange in cycle 92) was
    // deleted in cycle 119, so the only live scale is dazzle. The resolver
    // stays observer-scaled rather than flat — see epic-7 amendment 31.
    detect: SIGHT * 0.75,
    // The runtime scale the detect gate multiplies an observer's own
    // dazzle-scaled, boon-widened sight by. It is the SAME number as detect's
    // multiple above, by construction: `detect === sight * detectFactor` is
    // pinned in zone.test.ts precisely so the base rung and the runtime factor
    // can never drift apart. Never edit one without the other.
    detectFactor: 0.75,
    sight: SIGHT, // u — 4/8: true-sight bubble (actual ships visible; Eric ruling 2026-07-23, was 220)
    // THE RUNTIME SCALE FOR THE 5/8 RUNG (Eric ruling 2026-08-16: *"It scales.
    // Intel range means your detection range on all levels gets further."*).
    // 0.625 = 5/8, and note it is a factor of `radarRange`, NOT of sight the way
    // `detectFactor` above is. That difference is deliberate and load-bearing:
    // `sightOf` is the ONLY place the dazzle factor enters perception, so
    // anchoring this rung on radar range makes "a flash is a light source —
    // dazzle does not shrink it" true BY CONSTRUCTION rather than by care. It is
    // the same argument amendment 122 made when the foghorn moved onto intel
    // range. Both numbers still describe the same circle, because `sightRange`
    // is now DERIVED as radarRange/2 (sim/stats.ts).
    muzzleFlashFactor: 0.625,
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
    // hard. HEAVY SHELLS ×5 (+3/card) used to top the ladder at 30; that CARD
    // IS GONE (`gunDamage`, deleted in Story 7-5 wave 1 — Eric: *"The gun is
    // absurdly powerful and does not need damage bonuses"*), so 15 is now the
    // gun's damage at every build. Note the knock-on: a max-stacked TRIPLE
    // MOUNT click is now 3 × 15 = 45, exactly the 45hp small drone rather than
    // double it (damageGuardrail.test carries the margin note).
    damage: 15,
    // hp to an early interceptor outside the blast (bodyblock). RETUNED 10 → 6
    // (Eric ruling 2026-08-04, weapon balance pass) — held at 40% of `damage`,
    // the ratio the bodyblock was tuned at.
    contactDamage: 6,
    burstRadius: 15, // u — blast radius around the clicked point
    shellRadius: 2, // u — shell collision radius (added to hull capsule radius)
    // u — LATERAL spacing between ADJACENT shells of a multi-barrel click
    // (Story 7-5 wave 2, R2.16). BARREL's extra shells fly on PARALLEL TRACKS
    // now, not a spreading fan: every shell is offset perpendicular to the aim
    // bearing by a multiple of this and bursts at its OWN point, so the volley
    // covers a constant-width band at every range instead of widening with it.
    // The STRADDLE rule is the broadside's (sim/spread.ts): an odd barrel count
    // puts one shell exactly on the click, an even count straddles it with none
    // on it. This REPLACES the retired BARREL_FAN_STEP_RAD 3° angular step.
    // DRAFT VALUE (implementer handwave inside Eric's ratified shape).
    barrelSpacingU: 12,
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
    // simultaneously cut to +1/card so the ladder topped at 75 — strictly under
    // the 80hp one-hit-kill floor. That CARD IS GONE (`torpedoDamage`, deleted
    // in Story 7-5 wave 1: Eric took damage bonuses off both the gun and the
    // torpedo), so 70 is now the fish's damage at every build, with no ladder
    // above it to bound.
    // BALANCE CYCLE 1 (Eric ruling 2026-08-21): 70 → 50. Measured at n=360 on an
    // even roster, the torpedo is the dial that trades the Torpedo Boat against
    // the Mine Layer — 50 put TB at 33.3 % and ML at 31.9 %, where 45 overshot
    // (ML 40.0 %) and 60 undershot (TB 46.1 %). It does NOT move the Battleship.
    damage: 50,
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
    // The radar buoy shares THIS whole rear sector: it is click-placed too.
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
    // u — detonation proximity (enemy pass-over trips it). THE BASE-STATS RUNG:
    // at runtime this is DERIVED from the effective blast radius via
    // `triggerFactor` below (Eric ruling 2026-08-16), never read directly, so a
    // blast-widening boon carries the trip ring out with it.
    triggerRadius: 32,
    // The runtime scale the trip ring is derived at: `trigger = blast ×
    // triggerFactor`. It is the SAME ratio as the two base constants above and
    // below by construction (32 / 48 = 2/3), pinned in tests exactly as
    // `detect === sight * detectFactor` is — never edit one without the other.
    // Deriving rather than clamping is what retired the old
    // `min(trigger, blastRadius)` clamp: the trip ring can no longer be eaten by
    // a ceiling, because it is now a fixed fraction of that ceiling.
    triggerFactor: 2 / 3,
    // u — full damage to every non-owner hull within it; > triggerRadius by
    // design (the trip is the detection ring; the blast reaches farther).
    blastRadius: 48,
    // hp. RETUNED 45 → 55 (Eric ruling 2026-08-04, the weapon balance pass).
    // TNT → RDX FILLER ×5 (+4/card) used to top the ladder at 75; that CARD IS
    // GONE (`mineDamage`, deleted in Story 7-5 wave 1), so 55 is now the mine's
    // damage at every build — and it still clears the 45hp small drone at base,
    // which is the Mine Layer fleet-farming ruling (2026-08-16).
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
    // --- PROP-FOULING MINES doctrine. Victims of a fouling blast are slowed
    // (self-private you.slowedUntil; sim/slow.ts slowedKinematics — composition
    // pinned boosted → slowed → hooks).
    //
    // RETUNED (Eric ruling 2026-08-19, Story 7-5): *"simply slows affected ships
    // by 25% for 5 seconds"* — a WEAKER slow held LONGER (was 0.5 / 4000ms). It
    // is also no longer an EXCLUSIVE and no longer trades damage: the cycle-95
    // ruling deleted the damage penalty, and Story 7-5 made every doctrine an
    // added verb, so this is a pure addition that STACKS with CAPTIVE MINES
    // (whose torpedo carries the foul with it — Eric, same ruling).
    foulFactor: 0.75, // × maxSpeed AND reverseSpeed while fouled (25% slower)
    foulDurationMs: 5000, // ms — slow window per blast (refresh, don't stack)
    // --- CAPTIVE MINES doctrine (Story 7-5 wave 2, `mineCaptive`) — REPLACES
    // SELF-PROPELLED MINES outright (Eric: *"this replaces the old tracking
    // mines with a more realistic torpedo mine"*). A captive mine NEVER
    // detonates on contact: it holds ONE un-upgraded torpedo doing the MINE's
    // damage at the MINE's blast radius, fired with intelligent lead at the
    // first HOSTILE to enter its (much larger) trigger ring, and is EXPENDED on
    // fire. THE TRANSFORM, derived post-fold in sim/stats.ts: the trigger and
    // blast radii SWAP, then the trigger is multiplied by this factor — 144u
    // trigger / 32u blast at base, 210.8u / 46.9u at a maxed MINES ladder. It
    // is linear in the folded blast radius, so MINES cards apply on top and
    // card ORDER CANNOT MATTER.
    captiveTriggerFactor: 3,
    // SELF-PROPELLED MINES IS GONE, AND SO IS ITS CREEP (Story 7-5 wave 2).
    // The card, the `mine.selfPropelled` verb, the World's creep step and the
    // client's creep tell/wake were deleted with it; `creepSpeed` (14 u/s) and
    // `creepAcquireRange` (150u) outlived them for exactly one cycle, on a
    // comment claiming `server/src/game/world.ts` still read them — it did not.
    // Deleted here with the last of that machinery. NO MINE CAN MOVE: a captive
    // mine is MOORED, and the doctrine that replaced tracking attacks with a
    // launched torpedo instead. Anything re-adding a moving mine re-derives
    // these numbers rather than finding them waiting.
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
   * BROADSIDE BARRAGE (Battleship slot 1, Story 7-5 wave 2) — REPLACES the
   * long-range cannon outright (Eric's `7-5-decks.md`). A click to either BEAM
   * fires every broadside turret on THAT side in one barrage: every turret
   * whose OWN firing arc contains the click fires exactly at it, every turret
   * that cannot bear fires at its arc LIMIT at the click's range (an arc at
   * constant radius — sim/aim.ts turretAimPoints; see the per-turret arc
   * fields below). Each shell is a real gun-pattern shell that
   * BURSTS at its own point and emits its OWN mz/sp/hc signals — there is no
   * salvo aggregation (R2.5).
   *
   * The ARC is a TWIN SECTOR (sim/arcs.ts, R2.1): two mirrored sectors at
   * `heading ± arcOffsetDeg`, each `arcHalfArcDeg` wide, so port covers
   * 30°–150° and starboard −30°–−150°, leaving 60°-wide dead zones dead ahead
   * and dead astern. The side whose sector contains the click is the side that
   * fires (R2.2); a click outside BOTH is DENIED through the ordinary
   * out-of-arc denial path (FR12 — never silent). Geometry taken VERBATIM from
   * the class-era side arcs (commit 26318d5).
   *
   * NO range field: broadside range is DERIVED in effectiveStats() as
   * `radarRange × CONFIG.vision.muzzleFlashFactor` — THE 5/8 RUNG of the
   * eighths ladder, 412.5u at base. It is the FIRST weapon in the game that
   * does not reach the full radar horizon (Eric: *"This weapon's range is
   * limited to 5/8"*), so it rides the ladder rather than a literal — ONE
   * derivation of the rung, which is what keeps it correct if a card ever
   * writes `radarRange` again (none does since RANGE I–IV was deleted
   * 2026-08-20, so 412.5u is the value for every observer). Every number is a
   * DESIGN TARGET, tunable.
   */
  broadside: {
    // deg — bearing of each sector's CENTER off the bow (±): the beams.
    arcOffsetDeg: 90,
    // deg — half-width of each beam sector about its center.
    arcHalfArcDeg: 60,
    shellSpeed: 500, // u/s — standardized gun-family muzzle velocity
    maxAmmo: 1, // one barrage in the pool — presented as a pure cooldown
    // ms — cooldown between barrages. BALANCE CYCLE 1 (Eric ruling 2026-08-21):
    // 30000 → 18000, superseding *"lets set the cooldown to 30 seconds"*. This is
    // the dial that recovered the Battleship, and it is the ONLY one that moved
    // it: measured +5.0 pp at 30→22, +2.2 pp at 22→20 and +3.0 pp at 20→18, and
    // the alternative (a turnRate buff, worth +2.5 pp) was tested and SCRAPPED in
    // favour of buying the same ground here, so `kinematics` stays untouched.
    reloadMs: 18000,
    // shells per barrage at base; BROADSIDE TURRETS ×2 takes it to 6.
    // BALANCE CYCLE 1 (Eric ruling 2026-08-20): 3 → 4, paired with damage 20 → 15
    // below. Base alpha is UNCHANGED at 60 (3×20 = 4×15); a maxed barrage falls
    // 100 → 90. Measured balance-neutral on its own — a denser fan wastes less of
    // the barrage as overkill (damage −1.9 %, kills +6.7 %) without moving win
    // share — so it ships as a FEEL change that costs nothing elsewhere.
    turrets: 4,
    /**
     * [DRAFT] The BATTERY'S ALONG-HULL SPAN, as a fraction of hull length —
     * Eric's correction 2026-08-19: *"It is supposed to be three separate,
     * evenly-spaced points on the ship that they fire from. When you get an
     * extra turret, this is represented as the three evenly-spaced points
     * changing to four or five."*
     *
     * The turrets are spread evenly across `length × this` on the firing beam
     * (sim/aim.ts `turretMuzzles`, straddled about midships by the SAME
     * sim/spread.ts law the fan uses), and out to the half-BEAM so a muzzle
     * sits on the hull's edge rather than its centreline. 0.6 puts a
     * battleship's battery across the middle 74.4u of its 124u hull — a real
     * midship section, clear of the bow and stern tips where a turret would
     * read as a bowsprit.
     *
     * MORE GUNS DO NOT MAKE A LONGER SHIP: the span is FIXED, so BROADSIDE
     * TURRETS re-spaces the same 74.4u into 5 then 6 points (24.8u → 18.6u →
     * 14.88u apart, from the base 4). DRAFT — Eric tunes it on the water.
     */
    turretSpanFactor: 0.6,
    // hp per burst victim, per shell. BALANCE CYCLE 1 (Eric ruling 2026-08-20):
    // 20 → 15, superseding *"lets say 20 damage"* — the paired half of turrets
    // 3 → 4 above, which holds base barrage alpha at exactly 60.
    damage: 15,
    // u — blast radius around each shell's own point. DRAFT (the gun's own
    // burstRadius): Eric ruled the shells "burst like the gun" without naming
    // a radius, so the gun's number is the handwave until it is tuned.
    burstRadius: 15,
    shellRadius: 2, // u — shell collision radius (added to hull capsule radius)
    // PER-TURRET FIRING ARCS (Eric ruling 2026-08-20) — THE DESIGNED FAN IS
    // DELETED. Eric: *"each of these turrets actually has its own firing arc
    // ... all turrets WILL fire as close to the clicked point as they are able
    // given their firing arc. And its not that the upgrade increases their
    // precision/cohesion, its that it increases each individual turret's
    // firing arc so they can each cover more area, and thus depending on where
    // is clicked, more guns can get nearer to that point."* Nobody designs a
    // spread any more — it EMERGES from guns that cannot all bear on one
    // point. `fanHalfAngleDeg` (the fan-width ladder) is gone with the model.
    //
    // Each turret's arc is its MOUNT BEARING ± its TRAVERSE half-angle. The
    // mounts are straddled across ±turretMountSpreadDeg about the firing beam
    // (index-paired with turretMuzzles, UNCROSSED: the bow-most gun owns the
    // bow-most arc — sim/aim.ts turretAimPoints), so together the battery
    // covers the whole ±60° sector while each gun stays individually narrow:
    // mountSpread + base traverse = 61.5° ≥ arcHalfArcDeg, pinned, which is what
    // guarantees at least ONE gun always bears on any legal click ("one shell
    // will absolutely hit at the target point" survives structurally).
    //
    // CONVERGENCE IS PARALLAX. A gun that bears fires EXACTLY at the click; to
    // put ALL guns on one point their muzzle→click bearings (which differ by
    // atan(hullOffset/R) — ~5° at max reach, ~14° at 150u) must each fit their
    // OWN arc, and the mounts are 28° apart. At base that closes only past
    // ~386u — 94% of the weapon's own 412.5u reach — within ~±2° of abeam.
    // Eric: *"IF you happen to click a point that can be perfectly lined up,
    // then yes, all guns should converge. But that should be very rare without
    // upgrades and aiming close to max range."*
    //
    // RETUNED on his playtest (2026-08-20): *"the convergence is slightly too
    // high at level 1 imo. I am okay with there being some dead space when
    // closer to the ship that none of the shots can actually hit."* Base
    // convergence moved ~303u → ~386u. THE DIAL IS THE OVERLAP
    // (traverse − mountSpread), which is what convergence needs; COVERAGE is
    // their SUM, which is what keeps a gun on every legal click. Widening the
    // mounts while narrowing the arcs tightens the first WITHOUT opening
    // angular gaps in the second — so the dead space Eric accepted is the
    // CLOSE-RANGE kind (parallax too wide for the outer guns to bear), never a
    // bearing that no gun can ever reach.
    //
    // [DRAFT] deg — half-spread of the outermost mount bearings about the
    // beam. FIXED as turrets increase: extra guns densify the SAME covered
    // sector (the turretSpanFactor rule applied to bearings).
    turretMountSpreadDeg: 28,
    // [DRAFT] deg — each turret's TRAVERSE half-angle about its own mount,
    // indexed by BROADSIDE SPREAD copies held (index 0 = no cards, index 4 =
    // the ×4 cap). The card WIDENS every gun's arc (+6°/card), so more guns
    // can swing onto a given click and full convergence becomes reachable at
    // closer ranges (386 → 183 → 118 → 86 → 66u, abeam). Read through
    // EffectiveStats.broadside.traverseRad, never indexed at a call site.
    traverseDeg: [33.5, 39.5, 45.5, 51.5, 57.5],
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
   * RADAR BUOY (Mine Layer slot 2, Story 7-5 wave 2) — REPLACES the decoy buoy
   * outright (Eric's `7-5-decks.md`). THE DECOY ROLE IS DELETED: nothing in
   * the game fakes a ship contact any more. What is dropped now is a real
   * sensor — a stationary, destructible buoy carrying its OWN radar set that
   * RELAYS its returns to the player who placed it.
   *
   * It is CLICK-PLACED like a mine (R2.7), reusing the mine's rear sector
   * (`CONFIG.mine.offset` ± `placeHalfArcDeg`, out to `placeRange`), which is
   * why it is a WEAPON in EQUIPMENT_IS_WEAPON rather than the 1.8 stern-drop
   * ability. `radarRange` is a FLAT SET — the buoy's own equipment, NOT the
   * owner's intel range — and its sweep is its own too. (Since cycle 119 the
   * owner's radar range is itself fixed at base, no card moves it; the buoy's
   * independence is still the point, and still what a future radar card would
   * have to respect.)
   *
   * ONE BUOY, AND A GAP — AT BASE COOLDOWN (Eric ruling 2026-08-19, amending
   * R2.7 mid-flight): the base life is SHORTER than the base reload, so out of
   * the box at most ONE buoy is ever live and there is a ~10s dead window
   * between one expiring and the next becoming available. That gap is the
   * starting point — a buoy is a commitment, not permanent cover. The earlier
   * ordering (30s life on a 20s reload) allowed two overlapping and is
   * superseded as the BASE.
   *
   * CARDS LEGITIMATELY CLOSE IT, and that is a reward curve rather than a leak:
   * BUOY I-IV adds +2.5s of life per card (to exactly the base reload at ×4),
   * and RELOAD — the universal `shipCooldown` lever — scales `reloadMs` like it
   * scales every other piece of equipment (stats.ts clampStats), reaching
   * 15 000 ms at a full stack against a 20 000 ms life, so a heavy RELOAD build
   * can hold TWO buoys on the water at once. Neither is an oversight: exempting
   * the buoy from the one global cooldown lever would make it the odd equipment
   * out. The instruction below is aimed at IMPLEMENTERS, not at player cards:
   * do NOT close the BASE gap by raising `maxAmmo` or shortening `reloadMs`.
   * It paints on radar with its OWN profile carrying no owner identity (R2.9),
   * and killing one pays no XP and prints no kill-feed line. Every number is a
   * DESIGN TARGET, tunable.
   */
  radarBuoy: {
    radarRange: 330, // u — the buoy's OWN radar reach (flat; never observer-scaled)
    sweepRpm: 15, // rev/min — its own sweep; FIXED (R2.20 moved BUOY I-IV to durationMs; no card writes it)
    durationMs: 20000, // ms — lifetime before natural expiry
    hp: 50, // hp — destructible by anything that damages a ship
    // ms — cooldown between placements. LONGER than the life at BASE cooldown
    // (Eric 2026-08-19), so one buoy at a time with a ~10s dead gap between
    // them; the BUOY and RELOAD ladders both eat into that gap (see above).
    reloadMs: 30000,
    maxAmmo: 1, // single charge in the pool
    // --- GUN BUOY doctrine (buoyGun): the buoy defends itself.
    gunDamage: 5, // hp per shot at a hostile inside its own radarRange
    gunReloadMs: 5000, // ms — cooldown between its shots
    // --- JAMMING BUOY doctrine (buoyJamming): SERVER-GENERATED false returns,
    // wire-indistinguishable from real blips, re-scattered each sweep inside
    // the buoy's circle. It ADDS fakes and never deletes a real return; the
    // buoy's owner is exempt. DRAFT count (R2.11).
    jamFakes: 10,
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
   * the PvE fleet-tier hook the later fleets epic reuses verbatim: ¼ / ½ / ¾
   * of a level by hull size.
   */
  xp: {
    levelMs: 60000, // ms of match time per level (passive tick ≈ 1 level/minute)
    killLevels: 1, // levels' worth of XP for sinking a human captain
    /**
     * MEASUREMENT DIAL, DEFAULT OFF (balance instrument, 2026-08-22). Levels'
     * worth of XP granted per 1 point of damage DEALT, credited through the
     * one `grantXp` pipeline at the one damage-credit seam (World.creditDamage,
     * shared by shell/torpedo/mine impacts and incendiary DoT alike).
     *
     * 0 IS THE SHIPPED GAME AND IS THE DEFAULT: at 0 the rule contributes
     * nothing, `xpMs` moves on exactly the two inputs it always has (the
     * passive tick and kill credit), and every existing economy pin holds
     * byte-identical. This exists so a damage->XP rule can be MEASURED by the
     * batch-sim harness (`--set xp.damageLevels=...`, already inside the
     * whitelisted `xp.*` family) without the shipped game moving. Turning it
     * on in production is Eric's ruling to make, not an implementer's.
     *
     * Self-damage never routes here (creditDamage excludes it) and neither
     * does the storm (it never routes through creditDamage at all), so the
     * rule pays only for damage one hull deals to another.
     */
    damageLevels: 0,
    // RAISED 2026-08-16 (Eric ruling, epic-6 amendment 24): ¼ / ⅓ / ½ → ¼ / ½ / ¾.
    // Every tier is now a DYADIC rational, so any integer fleet composition is
    // exactly representable — which is why fleetLevels()'s old exact-total pin
    // could be retired rather than re-fitted. Keep it that way: a future tier
    // that is not a power-of-two fraction reintroduces the float-dust hazard
    // amendment 33 was written against.
    droneTierLevels: {
      droneSmall: 0.25, // ¼ level
      droneMedium: 0.5, // ½ level
      droneLarge: 0.75, // ¾ level
    },
  },

  /**
   * OFFERS (Story 2.7) — the shape of the pre-rolled offer a banked level
   * carries. `size` is the ratified card count: 4 DIFFERENT CARD LINES, DRAWN
   * FROM THE PLAYER'S OWN DECK and weighted by rarity. The old "one from each
   * of 4 distinct CATEGORIES" roll died wholesale with Story 2.8's deck model
   * (amendment 38 — see sim/offers.ts:1-8 and sim/deck.ts `drawOffer`); the
   * category is a card's label, not a slot in the offer. It is
   * gameplay-authoritative (it bounds the server's accepted `SpendMsg.choice`
   * and the client's digit picks), so it lives here and not in CLIENT_CONFIG.
   * A deck that has run thin draws a SHORTER offer rather than throwing, and
   * an empty draw materializes no offer at all.
   */
  offer: {
    size: 4, // card lines per offer — drawn from the deck, all different
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
    // BALANCE CYCLE 1 (Eric ruling 2026-08-20): both 25 → 50, DOUBLED IN STEP
    // WITH HULL HP. These amounts are FLAT by ruling, so doubling hull HP without
    // them silently reprices every heal — measured: a heal fell from ~33 % of an
    // average hull to ~20 %, bots burned levels topping up instead of fitting
    // boons (Battleship boons 2.27 → 1.95 while its levels ROSE), and the
    // highest-HP hull paid most. Doubling both holds a heal at the same fraction
    // of every hull it was worth before, and boons recovered past baseline.
    instantHp: 50, // hp restored immediately at spend time (clamped to maxHp)
    regenHp: 50, // hp added to the regen pool per heal spend
    regenMs: 5000, // ms — payout time of one regenHp pool (the 5 hp/s rate)
    /**
     * MEASUREMENT DIAL, DEFAULT OFF (balance instrument, 2026-08-22). Hp
     * restored AUTOMATICALLY and FOR FREE each time a level is EARNED — the
     * "weak, automatic heal that you get every level" Eric floated, sitting
     * IN ADDITION TO the refit-menu heal rather than replacing it.
     *
     * WHY IN ADDITION AND NOT INSTEAD: Eric likes the heal being a strategic
     * decision and so do his players; what feels bad is the SHARE of levels it
     * eats, especially early. Replacing the menu heal would delete the
     * decision he wants kept. Layering a small free trickle under it leaves
     * the emergency spend exactly as it is while paying for routine chip
     * damage out of progression rather than out of the card budget.
     *
     * It is deliberately TIED TO LEVELLING rather than to a clock. Eric has
     * ruled against a cooldown-based global heal repeatedly; healing paced by
     * the economy is a different thing from healing paced by a timer, and
     * this dial is on the former side of that line.
     *
     * 0 IS THE SHIPPED GAME AND IS THE DEFAULT. A hull that is sinking or sunk
     * never receives it.
     *
     * IT FEEDS THE REGEN POOL, NOT THE BAR (Eric ruling 2026-08-22: "25 over 5
     * seconds"). A trickle can be out-damaged; an instant top-up cannot, and
     * answering burst damage is the menu heal's job — the decision being
     * protected. It inherits the anti-flask rule for free: pools ADD, the rate
     * never changes, so this stacks as DURATION on top of a menu heal.
     *
     * TIMING, STATED HONESTLY: the pool drains at `regenHp / regenMs` = 50 /
     * 5000 = 10 hp/s, so 25 here is delivered over 2.5 s, not 5. The 5 hp/s
     * figure in the tickRepairs docstring and in CLAUDE.md is STALE — it
     * describes the pre-cycle-122 `regenHp` of 25, which was doubled in the
     * hull-HP pass without those claims being updated. Eric's "over 5 seconds"
     * matches the DOCUMENTED game rather than the shipped one; whether to fix
     * the docs or the rate is his call, and is deliberately NOT taken here.
     */
    levelHp: 0,
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
    // ms — countdown once the seated roster reaches minHumans. 15000 -> 10000
    // (Story 6.1, Eric ruling 2026-08-14): the queue now owns the wait, so this
    // is only the final "MATCH STARTING" beat, not a gathering window.
    countdown: 10000,
    // ms — 30000 -> 0 (Story 6.1). The arena's own gathering window is RETIRED in
    // production: StandardQueueRoom holds captains for queueTimerMs instead. Zero
    // routes notifyRosterChanged straight from waiting to startCountdown via the
    // pre-existing immediate-countdown path. The gathering phase itself is left in
    // the state machine (still reachable via matchOverride, still tested) rather
    // than deleted — see spec-6-1 Design Notes.
    joinWindow: 0,
    minHumans: 2, // humans required to start the countdown
    // ms — how long StandardQueueRoom holds a pool once it has armed at minHumans
    // before forming the match (Eric ruling 2026-08-14: "a 2:00 countdown, and then
    // the game starts (with a 10 second countdown)"). Reaching CONFIG.map.playerCap
    // forms the match immediately and ignores the remainder. The deadline is set ONCE
    // at arm time and is never extended by later joins — that is what closes the
    // leave/rejoin hostage-cycling vector the 30 s gathering window carried.
    queueTimerMs: 120000,
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
   * envelopes, which carry a weaker gun than a captain's (1/2/3 vs 15).
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
 * Levels of XP one whole group is worth, COMPUTED from the composition and the
 * shipped tier table — never declared. Eric ruling 2026-08-16 (epic-6 amendment
 * 24): *"XP is calculated from fleet comp. No need to hardcode any amount of xp
 * into the contract."* Nothing in CONFIG, the wire types, or any test may
 * assert a particular level total.
 *
 * Amendment 33's `fleetLevels() === 3` pin is RETIRED and had gone vacuous on
 * its own terms. It existed because droneMedium paid ⅓ — a non-dyadic rational
 * — so a composition edit could quietly start paying float dust. At the current
 * ¼ / ½ / ¾ tiers every tier is a dyadic rational, so EVERY integer composition
 * is exactly representable. The surviving invariant is that the TIERS are
 * exact, which barrel.test.ts pins directly.
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
 * reserved bands are AMBER and the RED FAMILY, and only those two: the
 * storm-violet and phosphor-green reservations were RETIRED by Eric ruling
 * 2026-08-21 (Story 7-6 question gate B1) to keep the palette expandable, so
 * the cycle-125 wheel legitimately places green/spring/jade in the old
 * phosphor band and orchid in the old storm-violet one. The surviving
 * amber/red reserve is pinned against the live wheel by
 * client/src/__tests__/tokens.test.ts. The wheel is the ONLY assignment source.
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
