// The authoritative simulation. Plain TS, ZERO Colyseus imports — the room is
// a thin adapter around this class, so everything here is unit-testable.
//
// Clock: World owns server time. `now` is ms since world (= room) creation and
// advances only inside step(); every outbound timestamp (frames, welcome,
// blips later) reads it, so there is exactly one clock.
//
// Step order (per plan): inputs -> ships -> boundary -> [islands -> shells ->
// fire control -> ability activation -> radar paint: later steps, seams marked
// below] -> sweep advance -> respawns -> passive XP. Ability activation (Story
// 1.6) sits with fire control — both consume this tick's stored input intent
// (fireSeq clicks / actSeq presses) through the single sinking-activation gate.
// The passive XP tick (Story 2.6) is deliberately LAST, after respawns and
// before the event swap, so a level banked this tick rides this tick's frame.

import {
  BOON_CATALOG,
  CONFIG,
  EQUIPMENT_IS_WEAPON,
  HEAL_CHOICE,
  HOOK_REGISTRY,
  LIFECYCLE_ALIVE,
  NO_BOONS,
  applyGroundingDamp,
  applySinkingDecel,
  applySlotEffect,
  boonBehaviors,
  boostedKinematics,
  buildDeck,
  burstVictims,
  consumeAcquisition,
  consumeCard,
  drawOffer,
  DEFAULT_HORN_ID,
  effectiveStats,
  equipmentMaxAmmo,
  equipmentReloadMs,
  fleetHullIds,
  generateMap,
  hasFoundered,
  hookKinematics,
  isAcquisitionDef,
  isAfloat,
  isSinking,
  isSunk,
  loadoutFor,
  slotsWithBoons,
  hullEnvelope,
  hullSilhouette,
  mulberry32,
  resolveBoons,
  resolveShipPose,
  slowedKinematics,
  stepShell,
  stepShip,
  transformPolygon,
  transitionLifecycle,
  visibilityTo,
  wrapPositive,
  appendWakeSample,
  createShipWake,
  createTorpWake,
  pruneWake,
  wakeCapacity,
  rollZoneRings,
  zoneCollapses,
  zoneGroups,
  zoneStateAt,
  isOutside,
  type BallisticEvent,
  type BoonBehaviorEffect,
  type BoonCatalog,
  type BoonDef,
  type BoonOffer,
  type DeckState,
  type DeniedView,
  type DenialReason,
  type EffectiveStats,
  type EquipmentId,
  type HookRegistry,
  type GameEvent,
  type GameMap,
  type HornId,
  type HullEnvelope,
  type HullId,
  type HullTarget,
  type InputMsg,
  type LitCircle,
  type LoadoutSlot,
  type Rng,
  type ShellOutcome,
  type ShellState,
  type ShipClassId,
  type ShipLifecycle,
  type ShipState,
  type SunkEvent,
  type Vec2,
  type WakeRibbon,
  type ZonePhase,
  type ZoneRing,
  type ZoneState,
  type ZoneTimeline,
} from '@salvo/shared';
import {
  BUOY_SIZE_U,
  EQUIPMENT,
  addBuoy,
  addMine,
  buoyTarget,
  captiveTorpedo,
  checkMineTriggers,
  contactBlastRadius,
  mineBlastVictims,
  scatterJamFakes,
  type ActivationContext,
  type ActivationDenial,
  type ActivationResult,
  type BuoyState,
  type MineState,
  type MineTripRules,
} from './equipment/index.js';
import type { BurstSubject } from './signals.js';
import { InputStore, clampFireTime, neutralInput } from './inputs.js';
import { FleetController, fleetSizeOf } from './drones.js';
import { BotController } from './ai/botDriver.js';
import type { AnyProfileId, BotTickEntry } from './ai/types.js';
import { observe } from './perception.js';
import {
  insideIntelDisc,
  islandClearance,
  pickFleetAnchor,
  pickSpawn,
  SPAWN_ISLAND_CLEARANCE,
  type FleetAnchor,
  type IntelDisc,
} from './spawn.js';
import { logWarn } from '../log.js';
import { leadIntercept } from './lead.js';
import { nextBountyHolder, type BountyCandidate } from './bounty.js';
// The ship-role seam (Story 6.3). ALIASED on import purely to keep them
// distinct from World's own `isFleetHull(id)` method, which answers the same
// question from an id (and fails closed on an absent record) rather than from
// a record — the method is expressed in terms of `roleIsFleetHull` below, so
// there is still exactly ONE definition.
import {
  isFleetHull as roleIsFleetHull,
  isHuman as roleIsHuman,
  isParticipant as roleIsParticipant,
  type ShipRole,
} from './participants.js';

const TAU = Math.PI * 2;

/** Floor on the fleet-anchor sampling radius as a fraction of the live ring —
 *  the guard for the late game, where `ring.r - spreadU` would go negative.
 *  NOTE this floor can push the anchor close enough to the rim that a hull
 *  scattering `spreadU` would land in the storm; `fleetOffset` tests ring
 *  containment per hull for exactly that reason (epic-6 amendment 24). */
const FLEET_ANCHOR_MIN_FRACTION = 0.35;
/** Attempts to land one fleet hull's scatter offset in water AND outside every
 *  captain's intel disc before giving up and stationing it on the anchor
 *  itself (island-clear always, intel-clear whenever the anchor was not the
 *  logged fallback — see fleetOffset). */
const FLEET_OFFSET_TRIES = 12;
/** The ShipRecord.name every fleet hull carries (Story 5.6, amendment 39):
 *  fleet hulls hold no roster row, and every client surface resolves `DRONE`
 *  off the hull id — so there is no numbered identity to mint. */
const FLEET_SHIP_NAME = 'DRONE';

/** The frozen zero-boon behavior list — one shared identity so every
 *  boon-less ShipRecord's per-tick hook fold is allocation-free. */
const NO_BEHAVIORS: readonly BoonBehaviorEffect[] = Object.freeze([]);

/** The frozen empty deck — DRONES NEVER GET A DECK (Story 2.8, amendment 38):
 *  a drone banks no levels (addXpMs guards) and could never draw; the shared
 *  identity keeps the pin allocation-free and test-visible. */
const EMPTY_DECK: DeckState = Object.freeze({ cards: Object.freeze([]) as readonly string[], levelsSinceRare: 0 });

/** ms — how long a dazzle mark outlives its last inside-the-zone tick (Story
 *  2.8 RULING): `dazzledUntil = now + DAZZLE_GRACE_MS`, refreshed every tick
 *  the victim's center stays inside a non-owned dazzle zone. The small grace
 *  keeps the wire field (and the victim's shrunken fog hole) from strobing at
 *  tick boundaries; perception reads the same field, so the server's shrunken
 *  sight and the client's honest fog hole expire together. */
const DAZZLE_GRACE_MS = 250;

/** ms — the incendiary DoT's `dmg` EVENT window (Story 2.8 review, P4). The
 *  burn applies hp every tick (20/s); the victim-private event that reports it
 *  is aggregated per (zone owner, victim) into windows this long, so a 2s burn
 *  costs ~4 events instead of 40 and client hit feedback cannot strobe. Never
 *  lossy: a pair that stops burning — or a victim that dies — flushes at once. */
const DOT_EVENT_WINDOW_MS = 500;

/** The (zone owner, victim) key of a DoT event bucket. Ids are opaque room
 *  session ids; `|` is not one of their characters. */
function dotKey(ownerId: string, victimId: string): string {
  return `${ownerId}|${victimId}`;
}

/**
 * Injectable engine registries (Story 2.5). Production omits both (the empty
 * shared HOOK_REGISTRY; the FULL shared BOON_CATALOG as of Story 2.8); tests
 * inject their own so real-tick hook execution and the deck/spend economy can
 * be driven against tiny controlled catalogs (amendment 29 — test hooks never
 * enter the production hook registry).
 */
export interface WorldOptions {
  hookRegistry?: HookRegistry;
  boonCatalog?: BoonCatalog;
  /**
   * PER-RING seed material of the SERVER-PRIVATE zone ring streams (Story
   * 3.1, amendment 10 + review FIX 2): one uint32 per rolled ring
   * (zoneSeeds[i] → ring i+1), each seeding an INDEPENDENT stream so a
   * revealed ring's geometry discloses nothing about later rings — a single
   * stream would let a modded client brute-force its 2^32 state offline from
   * ring 1's observed angle/offset. The World never generates entropy itself —
   * the caller supplies these: ArenaRoom passes fresh per-room, per-ring
   * nonces (adapter-layer entropy), the batch-sim harness derives them from
   * the match seed (server-side, so reproducibility leaks nothing). Omitted
   * entries fall back to a fixed derivation of the map seed — fine for
   * standalone Worlds (unit tests, sandbox smokes), NEVER acceptable for a
   * production room: mapSeed is client-known.
   */
  zoneSeeds?: readonly number[];
  /**
   * Seed material of the SERVER-PRIVATE pseudonym stream (R3 — the zone-nonce
   * posture): track ids must never be derivable from the client-known map
   * seed. ArenaRoom passes fresh per-room entropy (adapter-layer, like
   * zoneSeeds); omitted => a fixed derivation of the map seed — fine for
   * standalone Worlds (unit tests, smokes), NEVER acceptable for a production
   * room.
   */
  pseudonymSeed?: number;
}

/** The equipment id fitted in `loadout[slotIndex]`, or null when the slot is
 *  empty or the index is out of range. Shared by the two dispatch channels so
 *  each routes only its OWN equipment kind: fireControl (clicks) dispatches
 *  weapons, activationControl (actSeq) dispatches abilities. */
function fittedEquipment(loadout: LoadoutSlot[], slotIndex: number): EquipmentId | null {
  const slot = loadout[slotIndex];
  return slot ? slot.equipmentId : null;
}

/**
 * A live star-shell lit zone (Story 1.7): a static circle spawned where a star
 * shell BURST, granting the FIRER truesight parity inside it until `until`
 * (the reveal rules live in signals.ts — "lit from above", no island LOS).
 * Server-owned, NO per-ship state — a zone survives its owner's death and
 * dies only by natural expiry (expireLitZones). The wire shape is LitZoneView
 * ({id,x,y,r,until,by,phos?,daz?}), materialized per observer by the litzone
 * signal row.
 */
export interface LitZone {
  id: string;
  ownerId: string; // the firer — the ONLY observer the zone reveals for
  x: number; // u — zone center (the burst point)
  y: number; // u
  r: number; // u — lit radius
  until: number; // ms — server time the zone expires
  /**
   * The firer's star-shell DOCTRINE VERBS at zone-spawn time, stamped
   * INDEPENDENTLY (Story 7-5 wave 1 — PHOSPHOR and DAZZLE stopped being an
   * either/or pair, so a zone may burn AND blind, and `markZoneEffects` runs
   * the two as two separate checks rather than one if/else). Both false unless
   * the owner held the verb when the flare stopped (owner lookup at spawn; a
   * vacated owner falls back to both-false — the CONFIG-base rule).
   *
   * As of Story 2.9 (amendment 50) these ride the wire on LitZoneView to EVERY
   * observer who sees the circle — counterplay over concealment: the zone's
   * nature is observable behavior of the fired shell, not a build leak.
   * Zone-spawn stamping (not fire-time) is deliberate — the burn/dazzle zone
   * effects key off these same fields, so the wire flags can never disagree
   * with what the zone actually does.
   */
  phosphor: boolean;
  dazzle: boolean;
}

/**
 * ONE attacker's running claim on ONE victim's kill value — the entry type of
 * `ShipRecord.damageFrom`. See that field for the rolling-counter model.
 */
interface AssistTally {
  /** Clamped damage accumulated since this tally last started. */
  amount: number;
  /** Server-clock ms of this attacker's most recent damage on the victim. */
  at: number;
  /** 1 s damage history — encounterSpan.ts's substrate, never a payout input. */
  buckets: { at: number; amount: number }[];
}

/** Everything the server tracks per ship, on top of the shared kinematic state. */
export interface ShipRecord {
  id: string;
  name: string;
  /**
   * WHAT THIS HULL IS (Story 6.3, amendment 13) — the replacement for the
   * shipped `isDrone` boolean, which conflated three different questions
   * ("is it a person", "does it contest the outcome", "is it world content").
   * Read it ONLY through game/participants.ts's predicates — isHuman /
   * isParticipant / isFleetHull — never by comparing the string ad hoc. Story
   * 6.4 adds `'bot'` to the union and every consumer follows for free.
   */
  role: ShipRole;
  /**
   * Hull identity (fixed for the ship's whole life): a player's picked
   * ShipClassId, or a drone's drone hull id. THE key into hullSilhouette()/
   * hullEnvelope(), and the `cls` value contacts carry on the wire. A player
   * ship's hullId is ALWAYS a ShipClassId (OwnShip.cls narrows on that).
   */
  hullId: HullId;
  /** Cached resolved envelope (hull + hp + kinematics) for this hullId. */
  cls: HullEnvelope;
  /**
   * Per-tick scratch for the world-space silhouette polygon (transformPolygon's
   * `out` reuse — allocation-light at 20Hz). Server-internal, NEVER on the
   * wire; valid only for the tick aliveHulls() last wrote it.
   */
  hullPoly: Vec2[];
  /**
   * Per-tick scratch holding the ship's pose BEFORE this tick's kinematics —
   * the induction-valid previous pose that resolveShipPose rolls back to when a
   * candidate pose can't be pushed clear of an island. Written by stepShips,
   * read by resolveCollisions in the same tick; never on the wire.
   */
  prevPose: ShipState;
  /**
   * IS THIS HULL TOUCHING LAND RIGHT NOW — the authoritative answer, written
   * every tick by resolveCollisions from `resolveShipPose().contact`, which is
   * TRUE FOR LAND ONLY (a map-boundary press is deliberately not contact —
   * cycle 59 grounding ruling). Previously computed and thrown away inline.
   *
   * WHY IT IS STORED (Story 6.4 defect fix). Grounding is a SPEED CAP, not a
   * stop: `applyGroundingDamp` holds a dead-on grounded hull at
   * `islandSpeedMult x maxSpeed` — 8.75-11.25 u/s by class — so ANY "am I
   * going nowhere" speed heuristic is guessing at a fact the simulation
   * already knows exactly, and the bot brain's original 3 u/s trip sat 3-4x
   * BELOW every grounded hull's floor, making its whole un-beach path
   * unreachable. The AI now reads this bit instead.
   *
   * SERVER-ONLY, never on the wire (no PROTOCOL_VERSION movement): a bot reads
   * it off its OWN ShipRecord, which is a self-read exactly like hp or ammo,
   * not perception of the world. False for any hull not on the water.
   */
  landContact: boolean;
  /**
   * THE WAKE RIBBON this hull is CURRENTLY laying (Story 4.12, amendments
   * 194/200/205): the shared ring buffer of pose samples the per-observer
   * wake scan discloses segment by segment. NOTE `prevPose` above is per-tick
   * scratch and is NOT a history — this is the server's only pose history.
   * THE RIBBON IS WATER, NOT A SHIP PROPERTY (amendment 200): it outlives its
   * hull. This field only ever points at the ACTIVE ribbon; every life
   * boundary that TELEPORTS the hull (respawn / redeployShip) — and
   * removeShip — detaches the old ribbon into World.orphanWakes, where it
   * keeps ageing out and keeps disclosing until pruneWake reports it spent
   * (a detach at the teleport is mandatory for correctness, not just
   * lifecycle hygiene: appendWakeSample chains consecutive samples, so a
   * kept ribbon would draw a bogus death-point→spawn-point segment across
   * the map). sinkShip deliberately does NOT detach: a sinking hull KEEPS
   * laying wake through its window (Story 5.2 motion seam) with no teleport
   * anywhere in sight, and once foundered the attached ribbon simply stops
   * growing and ages out in place while the record survives for the
   * spectate/respawn window. Capacity is
   * provisioned from the TRUE attainable top speed — effective kinematics
   * maxSpeed + the boost speedBonus, via effectiveStats(), the sole
   * derivation path — and re-provisioned by applyBoon when a speed card
   * raises it (an under-provisioned ring silently drops the oldest tail).
   * SERVER-PRIVATE: never on the wire — only gated per-segment coverage
   * masks leave through the `wk` signal row.
   */
  wake: WakeRibbon;
  /**
   * THE DECK (Story 2.8, amendment 38): this player's card multiset — the
   * universal lines + carried-equipment subdecks + absent-equipment
   * acquisitions (sim/deck.ts buildDeck over the FRESH loadout's fit). Every
   * offer is DRAWN from it WITHOUT taking anything out (materializeOffer);
   * exactly ONE card leaves when a pick is FITTED (settleSpend's consumeCard),
   * a swapped-out doctrine rival RETURNS to it, an acquisition pick purges it.
   * SERVER-PRIVATE: never on the wire (the drawn offer ids are). Rebuilt by
   * redeployShip (fresh match = fresh deck over the fresh fit), PRESERVED by
   * respawn (waiting-phase deaths keep the build). Drones hold the frozen
   * EMPTY_DECK and never draw (pinned).
   */
  deck: DeckState;
  /**
   * This ship's PRIVATE deck stream (Story 2.8): mulberry32 decorrelated from
   * mapgen/spawn/drone streams by its own golden constant XOR a stable per-ship
   * JOIN ORDINAL (World.joinSeq — assigned once in addShip and never reused),
   * so join/leave churn elsewhere can never shift this player's draws. The
   * stream PERSISTS across redeployShip (the deck is rebuilt, the rng is not
   * reseeded): determinism is (mapSeed, join ordinal, draw sequence).
   */
  deckRng: Rng;
  /**
   * UNSPENT BANKED LEVELS (Story 2.7; the lazy-draw bugfix): a bare COUNT, the
   * SINGLE SOURCE OF TRUTH for the level bank (OwnShip.pts mirrors it). Levels
   * behind the front one carry NO cards — a level is drawn for only when it
   * reaches the front (`offer` below), so banking can never drain the deck.
   * Wiped by redeployShip (a fresh match = fresh build).
   */
  bankedLevels: number;
  /**
   * THE FRONT OFFER — the one hand the player is about to pick from, or null
   * (no banked level, or a degenerate empty draw). Materialized ONCE, from the
   * deck at the moment it reaches the front (materializeOffer →
   * sim/deck.drawOffer on this ship's deck+stream), then FROZEN until it is
   * spent: reopening the refit window can never reroll it (FR19). Its cards
   * are STILL IN THE DECK — only the fitted pick is ever consumed — so a
   * passed-on line is drawable again on the very next level. This is the field
   * OwnShip.offer surfaces. Dropped by redeployShip and by a heal spend.
   */
  offer: BoonOffer | null;
  /**
   * XP accumulator in INTEGER MILLISECONDS toward the next level (Story 2.6),
   * always in [0, CONFIG.xp.levelMs). Integer ms — never a float fraction — so
   * 1200 passive ticks × 50ms is EXACTLY one level with no drift. Two inputs
   * only: the passive tick (+dtMs while the match is active, this hull is
   * alive, and it is not a drone) and kill credit (round(levelMs × value),
   * NOT alive-gated — a shell landing after the killer's own death still
   * credits). Damage adds nothing. Every threshold crossing is banked by
   * grantXp through the existing grantPoint. Wiped by redeployShip (fresh
   * match = fresh build), PRESERVED across a waiting-phase respawn — exactly
   * like the level bank / front offer / boons.
   */
  xpMs: number;
  /** Levels COMPLETED (integer). Mirrored onto OwnShip.lvl (self-private);
   *  moves only inside grantXp's bank loop. Same lifecycle as `xpMs`. */
  level: number;
  /**
   * THE ASSIST LEDGER (CONFIG.xp.assistWindowMs) — who has damaged THIS hull,
   * how much, and when they last did it. Keyed by attacker id; it lives on the
   * VICTIM because that is the shape the split needs at the moment of sinking.
   *
   * `amount` accumulates the CLAMPED damage, never the nominal blow, so
   * overkill cannot inflate a share. `at` is the last damage's server-clock ms,
   * and it is the whole of the rolling-counter model: it decides both whether
   * this attacker's tally RESTARTS on the next hit and whether the tally is
   * eligible at the sink. `buckets` is 1 s damage history, kept as the
   * MEASUREMENT SUBSTRATE for scripts/batchsim/encounterSpan.ts (not a payout
   * input) and bounded at window/bucket + 1 entries however long a fight runs.
   *
   * Only maintained while the split is on (`assistWindowMs > 0`), so an OFF arm
   * allocates nothing. Bounded by the roster — one entry per attacker — and
   * cleared with the hull's life: on sink (after the split is paid), on
   * redeploy, and on respawn, so a fresh life never inherits a previous one's
   * contributors.
   */
  damageFrom: Map<string, AssistTally>;
  /**
   * Applied boon ids, in application order (Story 2.5 — dormant plumbing:
   * nothing grants these in production until 2.7's spend flow). Mutated only
   * by applyBoon(). Survive respawn (waiting-phase deaths keep the build,
   * like upgrades) but NOT redeployShip (fresh match = fresh build). Mirrored
   * onto OwnShip.boons (SELF-PRIVATE — rides `you` and nothing else).
   */
  boons: string[];
  /**
   * Cached resolved defs for `boons` (the resolveBoons result against the
   * world's catalog) — recomputed only when `boons` changes, beside `stats`.
   * The shared NO_BOONS identity at zero boons (allocation-free fast path).
   */
  boonDefs: readonly BoonDef[];
  /**
   * Cached `behavior` effects extracted from boonDefs — the per-tick
   * hookKinematics workload (stepShips). Frozen empty identity at zero boons
   * so the 20Hz loop allocates nothing for boon-less hulls.
   */
  boonBehaviors: readonly BoonBehaviorEffect[];
  /**
   * Cached effective stats for (cls, boonDefs) — the shared effectiveStats()
   * result. Every stat read in the sim (kinematics, vision, weapon pools,
   * reloads, ranges, damage/blast/trigger as of 2.8) goes through this, NEVER
   * raw CONFIG, so boon-fitted hulls cannot silently fall back to base
   * numbers. Recomputed on add/redeploy and on applyBoon.
   */
  stats: EffectiveStats;
  state: ShipState;
  hp: number;
  /**
   * THE one representation of this hull's life and death (Story 5.1,
   * amendment 2) — `alive: boolean` is REPLACED by it, never shadowed: a
   * derived `alive` mirror would be two representations of one truth, the
   * exact desync class effectiveStats() exists to prevent.
   *
   * Read it through the shared predicates, never by comparing `kind` inline:
   * `isAfloat()` for "a live combatant the sim damages, steers and counts",
   * `isSinking()` for "in Story 5.2's five-second window" (the three re-opened
   * seams: motion, weapons/horn, perceivability — amendment 15), `isSunk()`
   * for "this life is over" (the respawn arm). Since 5.2 the three states are
   * all REACHABLE and none is another's complement.
   *
   * Written ONLY by the named edges — construction (addShip, straight to
   * LIFECYCLE_ALIVE), `sink` (sinkShip — the entry into the window, all
   * bookkeeping at entry per amendment 11), `founder` (founderSinking, the
   * window's expiry — event-free) and `redeploy` (redeployShip / respawn) —
   * all through transitionLifecycle(), which validates against the one table.
   * Nothing else assigns it. (`sinkInstant` remains a legal table edge for
   * the transition tests; the sim no longer takes it.)
   *
   * On the wire ONLY as projections (amendments 7/16): `OwnShip.alive` and
   * `PlayerMeta.alive` stay booleans projected from isAfloat() by frames.ts /
   * syncRoster() — false the instant the hull starts sinking — and the
   * SELF-PRIVATE `OwnShip.sinkingUntil` deadline is the sole disclosure of
   * the window (it rides `you` and nothing else).
   */
  lifecycle: ShipLifecycle;
  input: InputMsg; // latest applied input (validated + clamped)
  /**
   * EVERY input accepted for this ship since the previous tick, in seq order
   * (Story 2.1 — the transport-coalescing press-swallow fix). Drained from the
   * InputStore by applyInputs each tick; fireControl / activationControl
   * evaluate each entry's fire/act intent so two presses landing inside one
   * 50ms tick BOTH fire or get a wire denial (kinematics stay latest-wins via
   * `input`). Bounded by INTENT_QUEUE_CAP — which EQUALS the fixed-window rate
   * cap (INPUT_RATE_CAP), because that window admits a burst of up to
   * INPUT_RATE_CAP accepted inputs inside a single tick, so the queue must be
   * able to hold every one of them (an average-sized cap would silently swallow
   * the middle of a jitter flush).
   */
  tickIntents: InputMsg[];
  lastAckSeq: number; // highest input seq applied to the sim
  /**
   * Highest InputMsg.fireSeq fireControl has consumed. A stored value newer
   * than this is one pending click (= one shot request); consumption happens
   * EVERY tick — even dead or denied — so clicks are never queued. NEVER reset
   * on respawn/redeploy: the live input still carries the old counter, and a
   * reset would make it read as a fresh click (a phantom shot).
   */
  lastFireSeq: number;
  /**
   * Highest InputMsg.actSeq the ability-activation control has consumed (the
   * actSeq sibling of lastFireSeq). A stored value newer than this is one
   * pending activation; consumption happens EVERY tick (even dead or inert), so
   * a press is never queued. Like lastFireSeq it is deliberately NOT reset on
   * respawn/redeploy — the live input still carries the old counter, and a reset
   * would make it read as a fresh press (a phantom boost activation on the tick
   * after respawn). Initialized to 0 in addShip only.
   */
  lastActSeq: number;
  /**
   * Highest InputMsg.hornSeq the foghorn control has consumed (Story 4.5 —
   * the hornSeq sibling of lastFireSeq/lastActSeq, same monotonic grammar). A
   * stored value newer than this is one pending honk; consumption happens
   * EVERY tick (even dead, droned, or on cooldown — the press is consumed and
   * silently dropped, exactly as malformed input is), so a press is never
   * queued. Like its siblings it is deliberately NOT reset on respawn/redeploy
   * — the live input still carries the old counter, and a reset would make it
   * read as a fresh press (a phantom honk on the tick after respawn).
   * Initialized to 0 in addShip only.
   */
  lastHornSeq: number;
  /**
   * ms — server time this ship may sound its next FOGHORN (Story 4.5);
   * 0 = eligible immediately. Armed by consumeHonk to
   * now + CONFIG.foghorn.cooldownMs on each accepted honk — the
   * server-authoritative rate limit (an early press is consumed and silently
   * dropped; the client's mirror of the same number exists only to avoid wire
   * spam). SERVER-PRIVATE, never on the wire. RESET to 0 on respawn/redeploy
   * (the nextSmokeAt rule) so a fresh life never inherits a stale cooldown;
   * dead hulls never honk (consumeHonk's alive gate), so no sink-time reset
   * is needed.
   */
  nextHonkAt: number;
  /**
   * The equipped foghorn variant (Story 4.5, amendment 52) — rides every `fh`
   * event this ship sounds (`FoghornEvent.h`), the cosmetic seam for a future
   * purchasable horn. Fixed at join (sanitizeHornId over the join option);
   * deliberately NOT a PlayerMeta/roster field — a horn is only ever public
   * at the moment it sounds.
   */
  horn: HornId;
  /**
   * ms — server-clock time the active speed-boost window ends (Story 1.6);
   * 0 = inactive. Written ONLY by the speedBoost Equipment row's activate();
   * read by stepShips (now < boostUntil => boosted kinematics cap) and mirrored
   * onto OwnShip.boostUntil (owner-only) by frames.ts. RESET to 0 on spawn/
   * respawn/redeploy so a fresh life never inherits a still-open window.
   */
  boostUntil: number;
  /**
   * hp — the REMAINING DAMAGE CONTROL regen pool (Eric rulings 2026-08-04);
   * 0 = nothing draining. Written ONLY by the heal branch of spendPoint
   * (`repairHp += CONFIG.damageControl.regenHp` — pools ADD, the rate never
   * changes) and drained by tickRepairs at the fixed
   * regenHp/regenMs (5 hp/s) WALL-CLOCK rate; mirrored onto OwnShip.repairHp
   * (owner-only) by frames.ts. RESET to 0 on spawn/sink/respawn/redeploy
   * exactly where boostUntil resets — a pool must never survive the death gap.
   */
  repairHp: number;
  /**
   * hp — the FREE per-level auto-heal's OWN pool
   * (CONFIG.damageControl.levelMissingPct), kept SEPARATE from `repairHp`
   * because it drains at its own rate. The paid pool has ONE global rate by
   * design (the anti-flask rule), and a pool cannot carry two rates: merging
   * them would either speed this trickle up or slow the paid heal down, and
   * both are the wrong answer. Written only by grantLevelHeal, drained only by
   * tickRepairs' second channel.
   *
   * Same lifecycle as `repairHp` in every respect: zeroed on sink, on redeploy,
   * and on respawn (all three through World.clearRepair). Mirrored to the
   * client SUMMED into OwnShip.repairHp, so the HUD's pending-repair readout
   * stays honest with no wire change.
   */
  levelRepairHp: number;
  /**
   * hp/ms — the free channel's drain rate, recomputed on every grant as
   * `levelRepairHp / CONFIG.damageControl.levelRegenMs`. 0 = nothing draining.
   *
   * DELIVERY BY DURATION, not at a fixed hp/s: the grant's AMOUNT varies with
   * how hurt the hull is while the ruled window is fixed at 5 s, and a fixed
   * rate cannot land a variable amount in a fixed time. This is the deliberate,
   * evidence-documented departure from the anti-flask rule, and it is CONFINED
   * TO THIS CHANNEL — the paid pool's fixed regenHp/regenMs rate is untouched
   * and pinned.
   */
  levelRepairRate: number;
  /**
   * ms — server time the PROP-FOULING slow on this ship ends (Story 2.8);
   * 0 = not slowed. Written by detonateMine when a propFouling owner's blast
   * damages this hull (REFRESH, never stack: plain assignment of now +
   * CONFIG.mine.foulDurationMs); read by stepShips through the shared
   * slowedKinematics fold (pinned composition boosted → slowed → hooks) and
   * mirrored onto OwnShip.slowedUntil (VICTIM-PRIVATE — frames.toOwnShip only,
   * the boostUntil precedent). Reset on sink/respawn/redeploy like boostUntil.
   */
  slowedUntil: number;
  /**
   * ms — server time the DAZZLE truesight reduction on this ship ends (Story
   * 2.8); 0 = not dazzled. Refreshed every tick the ship's center sits inside
   * a NON-owned dazzle zone (applyDazzle: now + DAZZLE_GRACE_MS); read by
   * signals.ts sightOf() — the DAZZLED OBSERVER'S own sight shrinks — and
   * mirrored onto OwnShip.dazzledUntil (VICTIM-PRIVATE, frames.toOwnShip only)
   * so the client's fog hole shrinks honestly. Reset on sink/respawn/redeploy.
   */
  dazzledUntil: number;
  /**
   * ms — windowed-min measured RTT for this client (pushed by the room's ping
   * loop via World.setRtt), or null when never measured. Null => the D1 fire-
   * time clamp grants ZERO compensation (drones never get an RTT, so a drone
   * claim — impossible anyway — would compensate nothing).
   */
  rttMs: number | null;
  /**
   * ms — the last ACCEPTED (activation succeeded) validated fire time. The
   * second D1 monotonicity floor: fire times never run backwards across shots.
   * Denials (empty pool etc.) deliberately do NOT advance it.
   */
  lastFireT: number;
  respawnAt: number; // ms server time to respawn at; 0 = not pending
  /**
   * ms — server time this hull may emit its next WOUNDED SMOKE puff (Story
   * 4.4); 0 = eligible immediately. Advanced by tickSmoke to
   * now + CONFIG.smoke.puffIntervalMs on each emission — the per-ship cadence
   * throttle (at most one `sm` per interval per hull). SERVER-PRIVATE, never
   * on the wire (the sm payload is {k,x,y,tier} and nothing else). RESET to 0
   * on spawn/respawn/redeploy so a fresh hull never inherits a stale timer;
   * dead hulls never emit (tickSmoke's alive gate), so no sink-time reset is
   * needed.
   */
  nextSmokeAt: number;
  sweepAngle: number; // rad — current (post-advance) radar sweep angle
  prevSweepAngle: number; // rad — sweep angle before this tick's advance (paint window start)
  /**
   * Ballistic ids (shells + torpedoes) this observer has already been sent a
   * one-time event for. Perception emits each ballistic exactly once per
   * observer (at launch for the owner, at first sight for everyone else);
   * entries are forgotten when the projectile is spent (see forgetBallistic).
   */
  seenBallistics: Set<string>;
  /**
   * Per-observer HOMING-torpedo track memory (Story 2.8): torpedo id → the
   * velocity DIRECTION (rad) this observer last received for that track (set
   * at the ballistic reveal, updated on every 'torpU' emission). The torpU row
   * re-emits a steering fish to this observer only when the live direction has
   * drifted ≥ CONFIG.torpedo.homingUpdateAngleDeg from this baseline AND the
   * fish is currently sighted (the ballistic reveal predicate). Entries are
   * forgotten with the projectile (forgetBallistic) — no growth.
   */
  torpDirs: Map<string, number>;
  /**
   * The ship's equipment loadout — 4 slots (gun / special / special / extra;
   * shared/src/sim/loadout.ts), each empty or one equipment id + its runtime
   * state (pool + reload timer, equipment/ammo.ts). THE one equipment
   * structure (replaces the old WeaponAmmo[] — no parallel ammo store);
   * input.slot names the slot a click activates. Reset to the full default
   * loadout on spawn/respawn/redeploy.
   */
  loadout: LoadoutSlot[];
  /**
   * CAPTAIN hulls this ship has sunk — the roster/results KILLS column AND
   * the bounty throne's one ruler, now the same number.
   *
   * Story 4.6 split this into `kills` (everything, drones included) and
   * `captainKills` (the throne). Story 5.6 amendment 38 ruled PvE kills count
   * NOWHERE — *"i dont want PvE kills to show up as 'kills' in a player's
   * killcount or as events in their records"* — which made the two identical
   * by construction, so the split is RETIRED in favour of this one field. A
   * drone sinking still pays XP, still fires the `sunk` event and still gets
   * its kill flash and feed line; it just never lands in a tally.
   */
  kills: number;
  /**
   * PvE SINKINGS BY VICTIM HULL ID — OPERATOR TELEMETRY, NEVER ON THE WIRE
   * (Story 5.6, epic-5 amendment 44, Eric ruling 2026-08-14: *"PvE fleet kills
   * DO NOT show up in the match log. I don't care what time I killed each
   * drone. But we can keep this data anyway, maybe for server stats?"*).
   *
   * Amendment 37's presentation ruling does not move an inch — a PvE kill
   * still lands in NO tally, NO match log and NO end-game record. What changes
   * is that it stops being thrown away: `kills` deliberately does not advance
   * on a drone victim, so before this the sinking left no trace anywhere and
   * `MatchEndSummary.killsByClass` silently lost the whole PvE faucet. This is
   * amendment 9's principle — telemetry counts what presentation does not.
   *
   * Keyed by the VICTIM's drone hull id rather than totalled, because SIZE IS
   * THE PAYOUT (¼ / ½ / ¾ level, CONFIG.xp.droneTierLevels): the per-size
   * counts alone reconstruct exactly how much XP the PvE economy paid out in a
   * real match.
   *
   * Same lifecycle as `kills`: zeroed at redeployShip (the match boundary),
   * preserved across a waiting-phase respawn.
   */
  pveKills: Record<string, number>;
  deaths: number; // times this ship has been sunk
  damageDealt: number; // hp dealt to OTHER hulls (self-hits and storm excluded)
}

/**
 * Per-tick values handed to every STEP_ORDER row (Story 5.1, AR8). The rows
 * have three distinct signatures today — dt in SECONDS (integrators), dt in
 * MILLISECONDS (wall-clock timers), and the shared post-move hulls snapshot —
 * and this context carries each under its own name so a row passes its method
 * EXACTLY what the method's unchanged signature demands. Both dt forms are
 * rebuilt from step()'s own `dtMs` argument every tick (never captured at
 * module scope), so a caller-supplied dt reaches every row exactly as before.
 */
export interface StepContext {
  /** This tick's dt in SECONDS — the kinematics/ballistics integrators' unit. */
  readonly dt: number;
  /** This tick's dt in MILLISECONDS — the wall-clock timers' unit (reloads, XP, sweeps). */
  readonly dtMs: number;
  /**
   * The tick's ONE aliveHulls() snapshot, memoized on first access — see
   * World.stepContext() for why it is neither a STEP_ORDER row nor a prologue
   * statement, and why its staleness is semantic.
   */
  readonly hulls: () => HullTarget[];
}

/** One named simulation step in World.STEP_ORDER (Story 5.1, AR8). The name
 *  is the row's identity: the order-identity test (stepOrder.test.ts,
 *  amendment 6) pins the exact name sequence, so it must stay stable. */
export interface StepRow {
  readonly name: string;
  readonly run: (world: World, ctx: StepContext) => void;
}

export class World {
  readonly map: GameMap;
  readonly playerCap: number;
  readonly ships = new Map<string, ShipRecord>();
  /** All in-flight ballistics (gun shells AND torpedoes), keyed by id. */
  readonly shells = new Map<string, ShellState>();
  /** All live dropped mines (static points), in drop order. */
  readonly mines = new Map<string, MineState>();
  /**
   * All live RADAR BUOYS (Story 7-5 wave 2, R2.7), in drop order — the
   * mines/litZones store shape. A buoy is world state, not a ship: it never
   * enters `ships`, the roster, spawn clearance, or the AI target sets. It
   * dies by natural expiry or by hp reaching 0 under ordinary weapon damage
   * (tickBuoys / hitBuoy), paying NO XP and emitting NO event either way — a
   * despawned buoy simply drops out of the next frame's `buoys` list.
   */
  readonly buoys = new Map<string, BuoyState>();
  /** All live star-shell lit zones (static circles), in burst order (Story 1.7). */
  readonly litZones = new Map<string, LitZone>();
  /**
   * LIVE TORPEDO wake ribbons, keyed by shell id (Story 4.12, amendment 196):
   * a running torpedo (`ShellState.kind === 'torp'`) lays a one-cell-wide
   * half-life ribbon sampled in stepShells. ShellState is a shared plain
   * object with no pose history, so the ribbon lives in this parallel store
   * rather than on the shell. When the fish is spent its ribbon moves to
   * `orphanWakes` — the water outlives the weapon exactly as it outlives a
   * hull (amendment 200). The torpedo ENTITY still never paints; only this
   * water does (its `torp`/`torpU` gating is byte-identical).
   */
  readonly torpWakes = new Map<string, WakeRibbon>();
  /**
   * DETACHED wake ribbons still ageing out (Story 4.12, amendment 200): water
   * whose source is gone — a respawned/redeployed/removed hull's old track, a
   * spent torpedo's run. Pruned every tick (sampleWakes) and released the
   * tick pruneWake reports zero live samples. Never grows unboundedly: each
   * entry dies within its own lifeMs of its newest sample.
   */
  private readonly orphanWakes: WakeRibbon[] = [];
  readonly inputs = new InputStore();
  /** Drives PvE fleet hulls through the normal input path (game/drones.ts). */
  readonly drones: FleetController;
  /** Drives combat-bot AI captains through the normal input path (Story 6.4,
   *  game/ai/botDriver.ts) — perception-gated, unlike the omniscient fleet
   *  mind. The controller never sees this World: it gets the narrow port at
   *  construction and a per-tick BotTickEntry array (each bot's own record +
   *  a bound observe() thunk — see botEntries()), so ai/ is structurally
   *  incapable of reaching world internals. Nothing in production constructs
   *  a bot this cycle (harness + tests only; Story 6-5 wires the mode). */
  readonly bots: BotController;
  /** Monotonic bot ordinal — the ship id namespace `bot-N` (never collides
   *  with Colyseus session ids, `fleet-N`, or `trk-` pseudonyms). */
  private botSeq = 0;
  /** How many rows of CONFIG.fleet.waves have already been enqueued. */
  private wavesFired = 0;
  /** Fleets owed but not yet placed — one entry per fleet, each carrying its
   *  own retry count against CONFIG.fleet.spawnRetryTicks (amendment 37: the
   *  wave ALWAYS arrives; it degrades visibly rather than never spawning). */
  private pendingFleets: { retries: number }[] = [];
  /** Monotonic fleet ordinal (the FleetController's shared-waypoint group). */
  private fleetSeq = 0;
  /** Monotonic fleet-hull ordinal — the ship id namespace `fleet-N`. */
  private fleetHullSeq = 0;
  /** ms since world creation — the one server clock. */
  now = 0;
  /** Fixed-step counter. */
  tick = 0;

  // --- Combat policy flags (driven by the match lifecycle, game/match.ts) ---
  // Defaults are permissive so a standalone World (unit tests, sandbox smokes)
  // behaves exactly like the pre-lifecycle simulation; Match imposes phase
  // policy on top (waiting/countdown: no damage; active: no respawn).

  /** False = target practice: shells/mines/storm land but deal no damage. */
  damageEnabled = true;
  /** False = sinkShip schedules NO respawn (active phase: death → spectate). */
  respawnEnabled = true;
  /**
   * THE BOARDING FREEZE (Story 6.1, epic-6 amendment 8) — three gates, one
   * derivation (Match.applyPolicy, beside damageEnabled/xpEnabled), driven ONLY
   * in a queue-formed room's pre-active phases. Eric: *"drop everyone into
   * their start location on the map, with movement/weapons locked and radar
   * off."*
   *
   * false = the helm is dead: applyInputs zeroes the APPLIED throttle/rudder
   * (never the stored message) so a boarding hull cannot move or turn, while
   * aim, slot and every seq keep tracking — the HUD stays live rather than
   * frozen-weird, and nothing about the input contract changes.
   */
  helmEnabled = true;
  /**
   * false = NOTHING activates: the sinking-activation gate — the one call path
   * to Equipment.activate() — refuses every press before any row is dispatched.
   * This is strictly stronger than the ready room's damageEnabled=false, where
   * shells really fly and merely land harmlessly: during boarding the
   * activation never happens at all, so no ordnance, no mine, no ability and no
   * reveal exists to be seen. Reloads keep ticking (fireControl's per-slot tick
   * is untouched) exactly as they do in every other phase.
   */
  weaponsEnabled = true;
  /**
   * false = the RADAR SENSOR is off: advanceSweeps does not turn the beam and
   * perception emits no blip of any kind (ship, decoy counter-intel, or wake).
   * TRUESIGHT IS NOT AFFECTED — contacts, mines, lit zones and every other
   * channel behave normally, because "radar off" is one sensor, not blindness.
   */
  radarEnabled = true;
  /**
   * False = the PASSIVE XP tick is suppressed (Story 2.6, amendment 34: XP
   * accrues only while the match phase is 'active' — the ready room banks
   * nothing). The damageEnabled sibling in every respect, including its
   * permissive default: Match drives it from the phase (applyPolicy) so World
   * stays Colyseus-free and phase-blind, and a standalone World (unit tests,
   * sandbox smokes) simply ticks XP like a live match.
   *
   * KILL CREDIT IS NOT GATED BY THIS FLAG, and the reason is the DEAD KILLER,
   * not the phase edge: within the active phase a mutual destruction must still
   * pay the killer who died first (sinkShip's credit is deliberately not
   * alive-gated), and routing that through an xp gate would be one more way to
   * lose it. A sink ACROSS the phase edge is not the reason — it cannot happen:
   * every attributed sink comes through the damage path, and `damageEnabled`
   * flips off at the very same applyPolicy seam this flag does.
   */
  xpEnabled = true;

  /**
   * THE BOUNTY THRONE (Story 4.6, Eric ruling 2026-08-10): the current
   * holder's ship id, '' while vacant. IDENTITY ONLY — mirrored verbatim onto
   * ArenaState.bountyId by the room, never a position or any other channel.
   * Re-evaluated by recomputeBounty() at exactly three seams — once per sink
   * (in sink order, AFTER the kill credit so the killer's fresh count
   * competes), on ship removal (so it never names an absent player), and on
   * respawn (ready-room only: `kills` persists across the death, so a
   * returning captain may still clear the floor) — via the pure
   * strict-overtake rule in game/bounty.ts. Cleared at the match
   * boundary (resetForMatchStart), where redeployShip zeroes every hull's
   * `kills` right beside it.
   */
  bountyId = '';

  private rng: Rng;
  /** The map seed — kept so per-ship deck streams (deckRngFor) derive from it. */
  private readonly seed: number;
  /**
   * Stable per-ship JOIN ORDINAL counter (Story 2.8): assigned once per
   * addShip, never reused or decremented, so a ship's deck stream is a pure
   * function of (mapSeed, its own ordinal) — join/leave churn elsewhere can
   * never shift another player's draws. (Replaces the retired shared
   * upgradeRng offer stream — draws are per-ship now.)
   */
  private joinSeq = 0;
  private shellSeq = 0;
  /**
   * MUZZLE-FLASH DEDUPE (Story 4.3): owners whose `mz` already fired this
   * tick. A multi-barrel salvo spawns N shells in one tick and must produce
   * exactly ONE flash (per-shell flashes would leak the barrel count — a
   * build tell the wire deliberately does not carry). Cleared with the other
   * per-tick state at the end-of-step event swap.
   */
  private readonly mzOwnersThisTick = new Set<string>();
  /**
   * OPEN INCENDIARY DoT EVENT BUCKETS (Story 2.8 review, P4), keyed by
   * dotKey(zone owner, victim): the applied-but-not-yet-reported DoT for that
   * pair and the server time its window opened. hp is ALREADY deducted — this
   * only defers the victim-private `dmg` event (see applyZoneEffects).
   */
  private readonly dotBuckets = new Map<string, { victimId: string; amount: number; since: number }>();
  private mineSeq = 0;
  private litZoneSeq = 0;
  private buoySeq = 0;
  /**
   * THE PSEUDONYM MAP (R3, radar realism cycle): ship id → stable per-match
   * track id, rolled on the SERVER-PRIVATE pseudonym stream (pseudonymRng —
   * the zone-nonce posture: never derivable from the client-known map seed).
   * Entries are assigned at addShip and NEVER pruned — a paint may legitimately
   * outlive the ship it belongs to (a return sitting in phosphor after a sink)
   * and must keep resolving to the same pseudonym after removeShip, so the map
   * is append-only for the room's lifetime (bounded by joins per room).
   *
   * HONEST BOUND (do not overclaim): a stable pseudonym does NOT make tracks
   * uncorrelatable. A client that watches a ship leave truesight (real id, via
   * `Contact`) and reappear at radar range can re-link it by trajectory. Fully
   * breaking that would require per-paint random ids, which would destroy
   * ghost-track linking — the entire course-inference channel amendment 67
   * depends on. What the pseudonym buys is that the ROSTER link is not free
   * and not instant.
   */
  private readonly trackIds = new Map<string, string>();
  /** The private pseudonym stream (see trackIds / WorldOptions.pseudonymSeed). */
  private readonly pseudonymRng: Rng;
  /**
   * THE JAM STREAM (Story 7-5 wave 2, R2.11): mints each dropped buoy's
   * server-private jamSeed, from which that buoy's per-revolution fake
   * scatter derives (scatterJamFakes). Seeded off the SAME private material
   * as the pseudonym stream (opts.pseudonymSeed in production — never the
   * client-known map seed alone), decorrelated by its own constant
   * (0x94d049bb is unused by any other stream here; see the spawnPhase doc
   * for the roster). NEVER Math.random(): fakes must be deterministic per
   * (buoy, sweep) so tests can reproduce them, while a client — which never
   * learns jamSeed — cannot predict them.
   */
  private readonly jamRng: Rng;
  /** Zone timeline (default CONFIG.zone; overridable for smokes/tests only). */
  private readonly zoneCfg: ZoneTimeline;
  /** Server ms the storm timeline was anchored at; null = idle (not started). */
  private zoneStartT: number | null = null;
  /**
   * The full rolled ring set (Story 3.1), rolled ONCE by startZone on the
   * SERVER-PRIVATE zone stream; null while idle. SERVER-PRIVATE as a whole
   * (amendment 10): only the revealed prefix — zoneCurrentRing plus
   * zoneRevealedNextRing from the reveal beat — may ever reach a client, so a
   * modded client can never precompute where future rings land.
   */
  private zoneRings: ZoneRing[] | null = null;
  /**
   * Caller-supplied per-ring zone seed material (WorldOptions.zoneSeeds — see
   * its JSDoc for who supplies what). Deliberately NOT derived from the
   * world/map seed in production: mapSeed rides the welcome, so any fixed
   * derivation would let a modded client precompute every future ring
   * (amendment 10). Deterministic per seed set — the harness's (match seed →
   * ring seeds → rings) reproducibility rides on it.
   */
  private readonly zoneSeeds: readonly number[] | undefined;
  /** Events queued since the last completed step (joins, sinks, respawns). */
  private pending: GameEvent[] = [];
  /** Events belonging to the most recently completed tick (read by frames). */
  private events: GameEvent[] = [];
  /** Denied presses queued during the current step, keyed by the pressing
   *  ship's id (Story 1.10). SELF-PRIVATE by construction: frames read ONLY
   *  the requesting client's own entry (denialsFor), so a denial can never
   *  ride another observer's frame — the boostUntil/own-ship-data precedent,
   *  not a perception channel (nothing here is spatial). */
  private pendingDenials = new Map<string, DeniedView[]>();
  /** Denials belonging to the most recently completed tick (read by frames). */
  private tickDenials = new Map<string, DeniedView[]>();

  /** Hook registry every per-tick kinematics fold runs against (injectable —
   *  tests; production defaults to the empty shared HOOK_REGISTRY). */
  private readonly hookRegistry: HookRegistry;
  /** Boon catalog applyBoon resolves ids against (injectable — tests;
   *  production defaults to the empty shared BOON_CATALOG). */
  private readonly boonCatalog: BoonCatalog;

  /**
   * THE MATCH'S ONE SPAWN LATTICE (Eric ruling 2026-08-16). Every placement
   * edge — addShip, redeployShip, respawn — passes this to pickSpawn, so all
   * hulls come off a SINGLE rotated ring of `SPAWN_CANDIDATES` slots instead of
   * each drawing its own. That is what delivers the ruled outcome (*"No
   * participants should start so close to each other that they can see each
   * other, let alone radar scan each other"*): a full lobby fills distinct
   * slots at the lattice's even 700.8u, against 660u of radar. Per-hull phases
   * measured 352-483u — inside radar on every seed.
   *
   * ITS OWN DECORRELATED STREAM, not a draw off `this.rng`, for two reasons:
   * the phase must not shift with HOW MANY hulls get placed (a draw off the
   * shared spawn stream would reorder every later fleet-anchor sample), and one
   * value read once wants a stream it cannot desynchronize from. 0xb5297a4d is
   * unused by any other stream here (spawn 0x9e3779b9, pseudonym 0x1b873593,
   * fleet 0x85ebca6b, deck 0x165667b1).
   *
   * DISCLOSURE NOTE, so nobody reads this as a new leak: the phase derives from
   * the client-known map seed — but so does `this.rng` itself, so spawn
   * placement has ALWAYS been reconstructible by a client willing to replay the
   * stream. A shared lattice makes the reconstruction easier (no join order to
   * model), not newly possible. If spawn placement should ever be genuinely
   * non-derivable, the fix is a server-private nonce for the WHOLE spawn stream
   * — the zone-ring precedent — not for this one draw.
   */
  private readonly spawnPhase: number;

  constructor(
    seed: number,
    playerCap: number = CONFIG.map.playerCap,
    zoneCfg: ZoneTimeline = CONFIG.zone,
    opts: WorldOptions = {},
  ) {
    this.hookRegistry = opts.hookRegistry ?? HOOK_REGISTRY;
    this.boonCatalog = opts.boonCatalog ?? BOON_CATALOG;
    this.playerCap = playerCap;
    this.seed = seed;
    this.map = generateMap(seed, playerCap);
    this.rng = mulberry32((seed ^ 0x9e3779b9) >>> 0); // spawn stream, decorrelated from mapgen
    // The match's one spawn-lattice phase — see the field's doc for why it gets
    // its own stream rather than a draw off this.rng.
    this.spawnPhase = mulberry32((seed ^ 0xb5297a4d) >>> 0).float(0, Math.PI * 2);
    this.zoneCfg = zoneCfg;
    this.zoneSeeds = opts.zoneSeeds;
    // Pseudonym stream: caller-supplied private material, or the TEST-ONLY
    // map-seed fallback (0x1b873593 is unused by any other stream).
    this.pseudonymRng = mulberry32((opts.pseudonymSeed ?? (seed ^ 0x1b873593)) >>> 0);
    // Jam-seed stream (R2.11) — same private material, own decorrelation
    // constant, so drawing buoy seeds never perturbs the pseudonym sequence.
    this.jamRng = mulberry32((((opts.pseudonymSeed ?? (seed ^ 0x1b873593)) ^ 0x94d049bb) >>> 0));
    // Fleet steering stream, decorrelated again from mapgen + spawn.
    this.drones = new FleetController(this, (seed ^ 0x85ebca6b) >>> 0);
    // Bot decision stream (Story 6.4), decorrelated from every other stream
    // here (0xc2b2ae35 is unused by any of them — see the spawnPhase doc for
    // the roster of constants in use).
    this.bots = new BotController(this, (seed ^ 0xc2b2ae35) >>> 0);
  }

  /** The pseudonym map, read-only — for perception context threading and
   *  tests. See trackIds for the honest correlation bound. */
  get pseudonyms(): ReadonlyMap<string, string> {
    return this.trackIds;
  }

  /**
   * The stable per-match track id for `shipId` (R3), rolling one on first
   * request. Roll-on-demand (not only at addShip) covers an ownerId that names
   * a ship whose record predates this room's map (or was injected by a test) —
   * its paint must still emit a pseudonym, never fall open to the roster id.
   */
  pseudonymFor(shipId: string): string {
    let track = this.trackIds.get(shipId);
    if (track === undefined) {
      track = this.rollTrackId();
      this.trackIds.set(shipId, track);
    }
    return track;
  }

  /** One fresh track id off the private stream: 'trk-' + 8 hex chars —
   *  structurally distinct from Colyseus session ids and 'drone-N' ids, and
   *  re-rolled on the (astronomically unlikely) collision with an existing
   *  track id or ship id. */
  private rollTrackId(): string {
    for (;;) {
      const id = `trk-${this.pseudonymRng.int(0, 0xffffffff).toString(16).padStart(8, '0')}`;
      if (this.ships.has(id)) continue;
      let taken = false;
      for (const existing of this.trackIds.values()) {
        if (existing === id) { taken = true; break; }
      }
      if (!taken) return id;
    }
  }

  /**
   * Anchor the storm timeline to server time `t` (default: now). Explicit API,
   * NOT tied to room creation: step 14's match lifecycle calls this at the
   * waiting->active transition. Idempotent — a second call is a no-op, so the
   * interim "start on 2nd ship" wiring in ArenaRoom cannot re-anchor it.
   */
  startZone(t: number = this.now): void {
    if (this.zoneStartT !== null) return;
    this.zoneStartT = t;
    // Roll the WHOLE ring set once, on per-ring server-private streams (Story
    // 3.1, amendment 10). Clients only ever receive the revealed prefix.
    const groups = zoneGroups(this.zoneCfg);
    const ringSeeds = Array.from({ length: groups }, (_, i) => this.zoneRingSeed(i));
    this.zoneRings = rollZoneRings(this.map.radius, this.zoneCfg, ringSeeds);
  }

  /** Seed for rolled ring i+1: the caller-supplied private material, or the
   *  TEST-ONLY map-seed fallback (standalone Worlds — see WorldOptions.
   *  zoneSeeds; 0x27d4eb2f is unused by any other stream). */
  private zoneRingSeed(i: number): number {
    const supplied = this.zoneSeeds?.[i];
    if (supplied !== undefined) return supplied >>> 0;
    return (this.seed ^ 0x27d4eb2f ^ Math.imul(i + 1, 0x9e3779b9)) >>> 0;
  }

  /** Server ms the zone was anchored at, or 0 while idle (for the schema). */
  get zoneStartMs(): number {
    return this.zoneStartT ?? 0;
  }

  /** The full-map ring — the zone geometry while idle (pre-start). */
  private idleRing(): ZoneRing {
    return { cx: 0, cy: 0, r: this.map.radius };
  }

  /** The full phased timeline state, or null while idle. */
  private zoneTimelineState(): ZoneState | null {
    if (this.zoneStartT === null || this.zoneRings === null) return null;
    return zoneStateAt(this.now, this.zoneStartT, this.zoneRings, this.zoneCfg);
  }

  /** Current zone phase for the public schema ('idle' until startZone). */
  get zonePhase(): ZonePhase {
    return this.zoneTimelineState()?.phase ?? 'idle';
  }

  /**
   * The LIVE ring — ring g exactly through clear/supply/reveal, the linear
   * ring-g → ring-g+1 interpolation during a close, terminal once closed, the
   * full map while idle. THE ring applyStorm bites outside of, and the one
   * drones/pilots steer against.
   */
  get zoneLiveRing(): ZoneRing {
    return this.zoneTimelineState()?.current ?? this.idleRing();
  }

  /**
   * Ring g as of the last ring boundary (UNinterpolated — the schema's
   * `zoneCur*` mirror; clients interpolate toward the revealed next ring
   * themselves via the shared zoneLiveState). Terminal once closed; the full
   * map while idle.
   */
  get zoneCurrentRing(): ZoneRing {
    const state = this.zoneTimelineState();
    if (state === null || this.zoneRings === null) return this.idleRing();
    if (state.phase === 'closed') return this.zoneRings[this.zoneRings.length - 1];
    return this.zoneRings[state.groupIndex];
  }

  /**
   * The REVEALED next ring — non-null only from the live group's reveal beat
   * through the end of its close (the schema's `zoneNext*` mirror, amendment
   * 10: unrevealed geometry never leaves the World). Null while idle/closed.
   */
  get zoneRevealedNextRing(): ZoneRing | null {
    return this.zoneTimelineState()?.next ?? null;
  }

  /**
   * Has the ENDGAME RING been reached — i.e. is the timeline in its last act?
   * True once the timeline is fully closed, and (under sudden death) from the
   * moment the final COLLAPSE group goes live, because that group opens ON the
   * terminal 660u ring: the endgame the Story 3.4 guarantee is about has
   * arrived, and the four beats that follow are the collapse, not another
   * geometric step.
   *
   * It exists so nothing re-derives that fact ad hoc. `zonePhase === 'closed'`
   * used to BE the fact (the timeline ended on the terminal ring, so closure
   * and endgame were the same instant); sudden death separates them by a full
   * ring group, and the batch-sim endgame pilot — which is pacifist until the
   * endgame and hunts after (epic-3 amendment 23) — would otherwise sit on its
   * hands until 16:00 and stop measuring the thing it was built to measure.
   */
  get zoneEndgameReached(): boolean {
    const state = this.zoneTimelineState();
    if (state === null) return false;
    if (state.phase === 'closed') return true;
    return zoneCollapses(this.zoneCfg) && state.groupIndex === zoneGroups(this.zoneCfg) - 1;
  }


  /** Events emitted during the last completed step (and joins just before it). */
  get tickEvents(): readonly GameEvent[] {
    return this.events;
  }

  /**
   * EVERY live wake ribbon — the wake scan's one subject list (Story 4.12):
   * each ship's active ribbon (alive AND dead-in-place wrecks — amendment
   * 200), every running torpedo's, and every detached ribbon still ageing
   * out. Read per-observer by perception's SignalContext; fresh array per
   * call (a handful of refs at 20Hz — the aliveHulls() allocation posture).
   */
  get wakeRibbons(): readonly WakeRibbon[] {
    const out: WakeRibbon[] = [];
    for (const ship of this.ships.values()) out.push(ship.wake);
    for (const r of this.torpWakes.values()) out.push(r);
    for (const r of this.orphanWakes) out.push(r);
    return out;
  }

  /** The last completed step's denied presses for ONE client — the only read
   *  path (frames.ts, for the frame's own client). Undefined = none. */
  denialsFor(id: string): readonly DeniedView[] | undefined {
    return this.tickDenials.get(id);
  }

  /** Wire entry point: validate/store a raw input message for `id`. */
  submitInput(id: string, raw: unknown): boolean {
    return this.inputs.submit(id, raw, this.now);
  }

  /**
   * Push a fresh RTT estimate (windowed min, ms) for `id`'s D1 fire-time clamp,
   * or null when the estimator has no live samples. Called by the room's ping
   * loop — the I/O adapter measures, the World only stores (Colyseus-free).
   */
  setRtt(id: string, ms: number | null): void {
    const ship = this.ships.get(id);
    if (ship) ship.rttMs = ms;
  }

  /** Spawn a new ship on the ring, max-distance from existing ships. Players
   *  pass their picked ShipClassId; fleet hulls pass a drone hull id — the
   *  envelope source (hullEnvelope) is the ONLY thing that differs between
   *  them. `horn` is the sanitized foghorn variant from the join option
   *  (Story 4.5); fleet hulls keep the default (they never honk — consumeHonk
   *  gates them).
   *
   *  `at` (Story 5.6) places the hull EXACTLY there instead of on the spawn
   *  ring — the mid-match fleet-wave path (amendment 37), the first placement
   *  in the codebase that is neither the ring nor a redeploy. Everything else
   *  about the record is identical, including the `spawn` event (whose
   *  `pointSighted` gate means a fleet arriving outside every captain's intel
   *  emits an event nobody receives — the desired behaviour, confirmed at the
   *  row rather than inherited). A brand-new record's wake ring is FRESH, so
   *  the mandatory detachWake at a teleport has nothing to detach here — the
   *  bogus cross-map segment it exists to prevent is structurally impossible
   *  on this path. */
  addShip(id: string, name: string, role: ShipRole = 'captain', hullId: HullId = 'torpedoBoat', horn: HornId = DEFAULT_HORN_ID, at?: Vec2): ShipRecord {
    const p = at ?? pickSpawn(this.map, [...this.ships.values()].map((s) => ({ x: s.state.x, y: s.state.y })), this.rng, this.spawnPhase);
    const heading = Math.atan2(-p.y, -p.x);
    const cls = hullEnvelope(hullId);
    const stats = effectiveStats(cls);
    // Per-hull loadout (Story 1.6): the class fit, or the universal drone fit.
    const loadout = loadoutFor(hullId, stats);
    const rec: ShipRecord = {
      id,
      name,
      role,
      hullId,
      cls,
      hullPoly: [],
      prevPose: { x: p.x, y: p.y, heading: 0, speed: 0 }, landContact: false,
      // THE SWEEP STARTS AT THE HULL'S HEADING (Eric ruling 2026-08-16), at
      // EVERY placement edge — here, redeployShip and respawn — so there is one
      // rule and not three. Constructing every hull at 0 phase-LOCKED the whole
      // fleet: a boarding room freezes the sweep (advanceSweeps early-returns
      // while `radarEnabled` is false), so every captain's beam unfroze at
      // exactly 0 on the same tick and stayed in lockstep for the match, handing
      // a systematic, position-determined first-detection advantage. Anchoring
      // to the spawn heading decorrelates it from the placement itself.
      // prevSweepAngle MUST EQUAL sweepAngle: this tick's paint window is the
      // half-open arc [prev, sweep), so an equal pair is zero-width and paints
      // nothing on the hull's first tick.
      // (Wake ring provisioned from the TRUE attainable top speed — Story 4.12.)
      wake: createShipWake(hullId, World.wakeTopSpeed(stats)), sweepAngle: wrapPositive(heading), prevSweepAngle: wrapPositive(heading),
      // THE DECK (2.8): over the fresh fit; fleet hulls never get one (pinned).
      // ECONOMY, so it keys on the FLEET reading — an AI captain (6.4) is a
      // participant that plays the game, and gets a deck like any other.
      deck: roleIsFleetHull({ role }) ? EMPTY_DECK : buildDeck(this.boonCatalog, World.carriedEquipment(loadout)),
      deckRng: this.deckRngFor(this.joinSeq++),
      bankedLevels: 0, offer: null,
      xpMs: 0, level: 0, damageFrom: new Map(),
      boons: [],
      boonDefs: NO_BOONS,
      boonBehaviors: NO_BEHAVIORS,
      stats,
      state: { x: p.x, y: p.y, heading, speed: 0 },
      hp: stats.maxHp,
      // CONSTRUCTION, not a transition (Story 5.1): a record that does not yet
      // exist has no state to move FROM, so it is initialized to the shared
      // frozen `alive` singleton rather than driven through the table. The
      // three real `-> alive` edges (match-start redeploy, respawn) go through
      // transitionLifecycle.
      lifecycle: LIFECYCLE_ALIVE,
      input: neutralInput(),
      tickIntents: [],
      lastAckSeq: 0,
      lastFireSeq: 0,
      lastActSeq: 0,
      // Foghorn (Story 4.5): fresh counter + cooldown, join-time variant.
      lastHornSeq: 0, nextHonkAt: 0, horn,
      // A fresh hull carries no open windows — boost, DAMAGE CONTROL pool
      // (2026-08-04), prop-fouling slow, dazzle — the same four zeroed together
      // at every other life boundary (sinkShip / respawn / redeployShip).
      boostUntil: 0, repairHp: 0, levelRepairHp: 0, levelRepairRate: 0, slowedUntil: 0, dazzledUntil: 0,
      rttMs: null,
      lastFireT: 0,
      respawnAt: 0,
      nextSmokeAt: 0,
      seenBallistics: new Set(),
      torpDirs: new Map(),
      loadout,
      // ONE tally (Story 5.6, amendment 38): `kills` counts PARTICIPANT
      // victims only — human captains AND, since Story 6.4 (Eric ruling B3:
      // bots are ordinary combatants), AI-captain bots; never PvE fleet
      // hulls. The Story 4.6 `captainKills` split stays retired — the two
      // became identical by construction the moment PvE kills stopped
      // counting anywhere.
      kills: 0,
      pveKills: {}, // operator telemetry only (amendment 44) — never on the wire
      deaths: 0,
      damageDealt: 0,
    };
    this.ships.set(id, rec);
    this.pseudonymFor(id); // eager track id (R3) — see pseudonymFor / trackIds
    // NOT registered with the FleetController here (Story 5.6): a fleet hull's
    // registration carries its fleet id and its constant formation station,
    // which only the wave spawner knows. spawnFleet() is the ONE registrar.
    this.pending.push({ k: 'spawn', id, x: p.x, y: p.y });
    return rec;
  }

  /**
   * Spawn one COMBAT BOT (Story 6.4): an AI captain — `role: 'bot'`, a real
   * ship class, a nautical callsign, a priority profile — enrolled with the
   * BotController (which rolls class/profile/callsign off its own seeded
   * stream) and then placed through the EXACT addShip path a human uses:
   * the shared spawn lattice (no `at` argument — bots never teleport in),
   * a real deck (a bot is a participant, not a fleet hull), a roster-ready
   * record. Ids are namespaced `bot-N`, structurally distinct from Colyseus
   * session ids, `fleet-N` hulls and `trk-` pseudonyms.
   *
   * `hull` (Story 6.5) OVERRIDES the controller's own class roll so a caller
   * that builds a whole field at once can deal it a balanced spread instead of
   * nineteen independent uniform draws (which land lopsided often enough that
   * "nine battleships" is an ordinary result). It is a plain parameter, not a
   * mode: the room decides the mix, the World just places the hull. Omitted —
   * which is the batch-sim harness and every existing test — the roll is
   * exactly the shipped one, off the same stream position (see enroll).
   *
   * `profile` (Story 7-6 wave 4) forces a specific profile row — the batch-sim
   * harness's door to the TEST-ONLY random-spend rows, which are deliberately
   * absent from CONFIG.bots.profiles and therefore unreachable through the
   * rolled path. Same stream discipline as `hull`: the controller still rolls
   * and discards, so every downstream enrollment is byte-identical whether or
   * not a profile was forced. A forced profile governs the hull (each row is
   * hull-bound), so callers pass the profile alone.
   */
  addBot(hull?: ShipClassId, profile?: AnyProfileId): ShipRecord {
    this.botSeq += 1;
    const id = `bot-${this.botSeq}`;
    const { name, hullId } = this.bots.enroll(id, hull, profile);
    return this.addShip(id, name, 'bot', hullId);
  }

  /**
   * Redraw a bot's CALLSIGN from the controller's remaining pool (Story 6.5),
   * returning the new name (null for an unknown id or a non-bot hull). The one
   * caller is the room resolving a collision with a human captain's chosen
   * callsign — the bot pool is drawn without repeat among bots but has never
   * been checked against a player's name, and two identical names in one kill
   * feed is a confusing feed. Renaming only: the hull, the mind, the profile,
   * the deck and every timer are untouched, and nothing about the brain moves.
   */
  renameBot(id: string): string | null {
    const rec = this.ships.get(id);
    if (!rec || rec.role !== 'bot') return null;
    const next = this.bots.redrawCallsign(id);
    if (next === '') return null; // unknown to the controller — leave the name be
    rec.name = next;
    return next;
  }

  /**
   * THE BOT PERCEPTION INJECTION (review-gate hardening): one entry per
   * `role: 'bot'` ship, built fresh each tick for the `botsTick` row. Each
   * entry carries the bot's OWN record (ai/ types it as the structural
   * BotSelf and can address no other ship) and an observe() thunk BOUND to
   * that bot's id — so the fogged view is handed in and ai/ never holds a
   * World, never chooses an observer, and cannot value-import perception.js
   * at all (the lint boundary makes it type-only there, which is what keeps
   * observeSpectator — the unfogged view — structurally out of reach).
   * The driver calls each thunk exactly once per live tick: the honest human
   * client contract (a frame per tick), never a sampled subset — radar blips
   * and the self-private gunnery rows live for one tick only, and a sampling
   * cadence aliases against the sweep period (the review-gate blocker).
   */
  private botEntries(): BotTickEntry[] {
    const out: BotTickEntry[] = [];
    for (const ship of this.ships.values()) {
      if (ship.role !== 'bot') continue;
      out.push({
        id: ship.id,
        afloat: isAfloat(ship.lifecycle),
        self: ship,
        observe: () => observe(this, ship.id),
      });
    }
    return out;
  }

  /**
   * This ship's private deck stream (Story 2.8): mulberry32 over the map seed
   * XOR a fresh golden constant (the mapgen/spawn/upgrade/drone stream idiom —
   * 0x165667b1 is unused by any other stream) XOR the join ordinal scrambled by
   * Math.imul with the 32-bit golden ratio, so consecutive ordinals land on
   * well-separated seeds. Deterministic per (mapSeed, ordinal); never reseeded
   * (redeployShip rebuilds the deck, not the stream).
   */
  private deckRngFor(ordinal: number): Rng {
    return mulberry32((this.seed ^ 0x165667b1 ^ Math.imul(ordinal, 0x9e3779b9)) >>> 0);
  }

  /** The equipment ids a loadout carries, in slot order — buildDeck's input. */
  private static carriedEquipment(loadout: LoadoutSlot[]): EquipmentId[] {
    const out: EquipmentId[] = [];
    for (const slot of loadout) if (slot.equipmentId !== null) out.push(slot.equipmentId);
    return out;
  }

  /** Remove a ship entirely (client left). Its wake is water, not a ship
   *  property (Story 4.12, amendment 200): the ribbon detaches into the
   *  orphan store and keeps disclosing until its water ages out. */
  removeShip(id: string): void {
    const ship = this.ships.get(id);
    if (ship !== undefined && pruneWake(ship.wake, this.now) > 0) this.orphanWakes.push(ship.wake);
    this.ships.delete(id);
    this.inputs.remove(id);
    this.drones.remove(id);
    this.bots.remove(id);
    // The throne never names an absent player (Story 4.6): re-evaluate now —
    // a departed holder vacates, and re-claiming needs a fresh strict unique
    // maximum among the alive captains still in the room.
    this.recomputeBounty();
  }

  /**
   * Countdown→active transition (match lifecycle): clear the practice field —
   * all shells and mines gone, per-observer ballistic memory wiped, queued
   * events dropped — then redeploy EVERY hull to a fresh spawn-ring placement
   * with full hp and full ammo pools. Inputs are kept (players keep driving
   * through the transition); each ship emits a spawn event so clients snap
   * their camera/prediction to the teleport. Roster/welcome state is untouched.
   *
   * `holdStartLine` (Eric ruling 2026-08-16) is the QUEUE-FORMED room's answer
   * and defaults FALSE so the dev/sandbox ready room — where captains really
   * sail, fire and drain pools for the whole waiting phase, and the re-roll is
   * what returns them to the ring — stays byte-identical. See redeployShip for
   * exactly which three mutations the hold skips and why nothing else moves.
   */
  resetForMatchStart(holdStartLine = false): void {
    this.shells.clear();
    this.mines.clear();
    this.buoys.clear(); // practice-field buoys never relay into the real match (mines precedent)
    this.litZones.clear(); // practice-field zones never light the real match (mines precedent)
    this.pending = [];
    // The throne dies at the match boundary (Story 4.6): redeployShip below
    // zeroes every hull's `kills`, so the vacated throne cannot be re-claimed
    // until someone earns a fresh captain kill in the real match.
    this.bountyId = '';
    const placed: Vec2[] = [];
    for (const ship of this.ships.values()) this.redeployShip(ship, placed, holdStartLine);
    // Practice-field WATER never leaks into the real match either (Story 4.12
    // — the mines/zones/buoys rule): redeployShip just detached every hull's
    // practice ribbon into the orphan store, and the shells.clear() above
    // stranded every torpedo ribbon. Wipe both — a fresh match starts on
    // clean water. (Amendment 200 governs in-match death, not this boundary.)
    this.torpWakes.clear();
    this.orphanWakes.length = 0;
  }

  /** Fresh-match state for one hull: ring placement, full hp, full ammo pools.
   *  THE BUILD IS WIPED: a redeploy is the countdown→active match boundary, and
   *  a fresh match means a fresh build — anything farmed in the practice-room
   *  waiting phase (drone kills) must not carry a head start into the real
   *  match. (respawn() below, waiting-phase only, PRESERVES the build.)
   *
   *  `holdStartLine` (Eric ruling 2026-08-16) — a QUEUE-FORMED (boarding) room
   *  places its captains on the ring at addShip during boarding and SHOWS them
   *  that spot, so re-rolling it here teleported every one of them at the gun
   *  (measured 20/20 displaced, median ~2140u) in direct violation of Story
   *  6-1's AC and epic-6 amendment 8 point 3. Under the hold, EXACTLY THREE
   *  mutations are skipped and EVERY other line below still runs:
   *    • the placement itself — no pickSpawn call at all, so no RNG draw and no
   *      write to state.x/y/heading/speed (the boarding freeze already pins
   *      speed at 0, and the sweep is already anchored to this heading);
   *    • detachWake — there is no teleport, so the bogus cross-map chained
   *      segment it exists to prevent is structurally impossible;
   *    • the `spawn` event — a no-move spawn calls the client's
   *      predictor.forceSnap(), which blanks the own hull/nameplate/hotbar for
   *      ~1-3 frames at the exact moment the gun goes. Dropping it is safe:
   *      client updateMatchEpoch already fires resetOwnOrders on the `-> active`
   *      phase edge and documents itself as idempotent with the server's event.
   *
   *  ACCEPTED CONSEQUENCE: skipping N pickSpawn draws advances the shared world
   *  `rng` differently, so a given seed lands its later PvE fleet-wave anchors
   *  elsewhere. Nothing pins seed-stable fleet placement, and the batch-sim
   *  harness passes no expectedCaptains so it keeps the old path entirely. */
  private redeployShip(ship: ShipRecord, placed: Vec2[], holdStartLine = false): void {
    if (holdStartLine) {
      // The held hull still counts as OCCUPIED. It was placed by addShip off
      // the same shared lattice, so its position IS a lattice slot — feeding it
      // to `placed` is what stops a mixed call (some held, some re-rolled) from
      // handing that exact slot to another hull. Today the flag is all-or-
      // nothing, so this is inert; it is correct rather than load-bearing, and
      // costs one push.
      placed.push({ x: ship.state.x, y: ship.state.y });
    } else {
      const p = pickSpawn(this.map, placed, this.rng, this.spawnPhase);
      placed.push(p);
      ship.state.x = p.x;
      ship.state.y = p.y;
      ship.state.heading = Math.atan2(-p.y, -p.x);
      ship.state.speed = 0;
      // The sweep re-anchors to the NEW heading at this placement edge (Eric
      // ruling 2026-08-16) — see addShip for the rule and why prev must equal it.
      ship.sweepAngle = wrapPositive(ship.state.heading);
      ship.prevSweepAngle = ship.sweepAngle;
    }
    ship.bankedLevels = 0;
    ship.offer = null;
    // XP progress dies with the build (Story 2.6): the countdown→active
    // boundary is a fresh match, so nothing farmed in the ready room (a drone
    // kill's XP, or waiting-phase seconds) carries a head start into it.
    // respawn() below, waiting-phase only, PRESERVES both.
    ship.xpMs = 0;
    ship.level = 0;
    // ...and so does the assist ledger: a fresh match's kill value must never
    // be split with someone who damaged this hull in the ready room.
    ship.damageFrom.clear();
    // Boons are wiped WITH the level bank (Story 2.5): the match boundary means a
    // fresh build — respawn() below, waiting-phase only, preserves.
    ship.boons = [];
    ship.boonDefs = NO_BOONS;
    ship.boonBehaviors = NO_BEHAVIORS;
    ship.stats = effectiveStats(ship.cls);
    ship.hp = ship.stats.maxHp;
    // The match-start `redeploy` edge (Story 5.1, amendment 3): legal from ANY
    // state — the common case is `alive -> alive` (a hull that never died being
    // reset at the countdown->active boundary).
    ship.lifecycle = transitionLifecycle(ship.lifecycle, 'redeploy', this.now);
    ship.respawnAt = 0;
    // ...nor a stale grounding read: the placement is island-clear by
    // construction, and a carried-over `true` would arm an un-beach reverse on
    // a hull sitting in open water at the start line.
    ship.landContact = false;
    // A fresh life never inherits an open boost window — nor a slow or dazzle.
    ship.boostUntil = 0;
    // ...nor a DAMAGE CONTROL pool: hp is already full here, so a surviving
    // pool would drain entirely into the maxHp clamp — but the wire field would
    // still tick down on a brand-new match's HUD (the boostUntil rule).
    World.clearRepair(ship);
    ship.slowedUntil = 0;
    ship.dazzledUntil = 0;
    // A fresh match never inherits a stale smoke timer (Story 4.4) — nor a
    // stale foghorn cooldown (Story 4.5).
    ship.nextSmokeAt = 0;
    ship.nextHonkAt = 0;
    // lastFireSeq / lastActSeq / lastHornSeq are deliberately NOT reset — a
    // reset fires a phantom shot / phantom boost / phantom honk (the stored
    // input's fireSeq/actSeq/hornSeq would read as a fresh click/press on
    // this tick).
    ship.seenBallistics.clear();
    ship.torpDirs.clear();
    ship.loadout = loadoutFor(ship.hullId, ship.stats);
    // THE DECK is rebuilt over the FRESH fit (Story 2.8): a fresh match means a
    // fresh deck — but the deck STREAM is deliberately NOT reseeded (ship.
    // deckRng persists), so a player's whole-session draw sequence stays a pure
    // function of (mapSeed, join ordinal, draw count). Drones keep EMPTY_DECK.
    ship.deck = roleIsFleetHull(ship)
      ? EMPTY_DECK
      : buildDeck(this.boonCatalog, World.carriedEquipment(ship.loadout));
    ship.kills = 0; // the tally AND the bounty ruler (one field since 5.6)
    ship.pveKills = {}; // ...and its telemetry sibling (amendment 44), same boundary
    ship.deaths = 0;
    ship.damageDealt = 0;
    // The redeploy TELEPORTS the hull (Story 4.12): detach the old ribbon —
    // a kept one would chain a bogus segment across the map — and start
    // fresh, provisioned from the just-reset base stats. (resetForMatchStart
    // wipes the detached practice water right after this loop.) BOTH lines are
    // skipped under the hold: nothing moved, so there is no bogus segment to
    // prevent and no snap for the client to take. detachWake stays HERE, below
    // the stats reset, because the fresh ribbon is provisioned from ship.stats.
    if (holdStartLine) return;
    this.detachWake(ship);
    this.pending.push({ k: 'spawn', id: ship.id, x: ship.state.x, y: ship.state.y });
  }

  /**
   * Sink a ship — the entry into THE SINKING WINDOW (Story 5.2): `alive ->
   * sinking` via the `sink` edge, with EVERY piece of bookkeeping firing HERE
   * at sink-entry, unmoved (amendment 11 — the question gate offered deferring
   * it to founder and Eric rejected that): kill credit and its XP, the bounty
   * recompute, deaths, the single public `sunk` event and its kill-feed line,
   * the roster `alive` flip (syncRoster projects isAfloat) and the respawn
   * arm. The CONFIG.ship.sinkingWindowMs that follow belong to the dying
   * captain alone — the hull keeps its way and its weapons (the three
   * amendment-15 seams) until the founderSinking step takes the `founder`
   * edge at the deadline WITHOUT a second event. Attributes a kill (and its
   * XP, which banks a point on every level crossed) to `by` when it names a
   * different ship still in the room — a DEAD killer (mutual destruction)
   * still gets both; storm (`by` undefined) and self-kills grant nothing by
   * construction. Combat routes damage through here; tests drive it directly.
   */
  sinkShip(id: string, by?: string): void {
    const ship = this.ships.get(id);
    // THE SOLE IDEMPOTENCY LOCK (amendment 1): exactly one `sunk` event per
    // hull per life hangs off this early return. A hull already `sinking`
    // fails isAfloat, so re-entry during the window is refused here — the
    // split into sink+founder did NOT weaken the lock, because founderSinking
    // emits nothing and this remains the only emitter.
    if (!ship || !isAfloat(ship.lifecycle)) return;
    // THE PRE-SINK BOUNTY READ (Story 4.6): captured before ANYTHING mutates —
    // the kill credit below may move the throne, and the bonus + the `bty`
    // channel are both about who held it at the instant of sinking. A
    // storm/self sink has no killer and therefore no bonus, but still marks
    // the victim.
    const bountyMark = this.bountyMark(id, by);
    const victimHeldBounty = bountyMark === 'v';
    // `alive -> sinking` (Story 5.2): the `sink` edge opens the window. All
    // bookkeeping below fires NOW; only the physical foundering is deferred.
    ship.lifecycle = transitionLifecycle(ship.lifecycle, 'sink', this.now);
    ship.hp = 0;
    // WHAT SINK-ENTRY DELIBERATELY DOES **NOT** ZERO (Story 5.2 — each kept
    // field is a decision, not an omission; founderSinking zeroes them all at
    // the window's end):
    //   - state.speed — the ritardando IS the window: the hull keeps its way
    //     and decays through the shared sim/sinking.ts cap in stepShips.
    //   - boostUntil — amendment 10 admits speedBoost while sinking (the
    //     doomed surge), so an OPEN boost window must survive sink-entry and
    //     keep composing with the decel cap; zeroing it here would kill a
    //     live surge the ruling explicitly allows. The old "no active-boost
    //     HUD chrome on a dead ship" rationale no longer applies at entry:
    //     the owner's frame still carries `you` and the hotbar stays live.
    //   - slowedUntil / dazzledUntil — a hull that sinks fouled sinks fouled:
    //     the motion seam re-opens with the hull's REAL state (the slow keeps
    //     lowering the cap the decel scales; the dazzle keeps shrinking the
    //     dying captain's own fog hole). Neither can be REFRESHED while
    //     sinking (mine blasts and zone effects gate on isAfloat), so both
    //     expire naturally within the window.
    // The DAMAGE CONTROL pool DOES die at entry (2026-08-04 rule, unchanged):
    // the economy is what a sinking captain loses (amendment 10 — "once
    // sinking, you're done"), tickRepairs would never tick it anyway (afloat
    // gate), and nothing may trickle hp back onto a hull already at 0. The FREE
    // per-level channel dies on the same rule and at the same instant.
    World.clearRepair(ship);
    ship.deaths += 1;
    ship.respawnAt = this.respawnEnabled ? this.now + CONFIG.ship.respawnDelay : 0;
    this.creditKill(ship, by, victimHeldBounty);
    const ev: SunkEvent = { k: 'sunk', id, by };
    // `bty` is appended LAST and only when a participant held the throne
    // (msgpack: never an undefined value) — the wire shape the sunk row's
    // materialize preserves. The XP bonus above is the VICTIM case only: a
    // leader who kills someone collects nothing extra for it.
    if (bountyMark !== undefined) ev.bty = bountyMark;
    this.pending.push(ev);
    // Re-evaluate the throne AFTER the credit (Story 4.6): the killer's fresh
    // kill count competes in this very evaluation — one recompute per sink,
    // in sink order, so simultaneous challengers resolve sequentially.
    this.recomputeBounty();
  }

  /**
   * THE FOUNDER EDGE (Story 5.2): every hull whose sinking window has expired
   * takes `sinking -> sunk` — and emits NOTHING. All bookkeeping (kill credit,
   * XP, bounty, deaths, the `sunk` event, the respawn arm, the roster flip)
   * fired at sink-entry (amendment 11); this step is purely the physical end
   * of the window, so a second `sunk` here would be exactly the duplicate
   * amendment 1's idempotency lock exists to prevent. hasFoundered's
   * INCLUSIVE deadline matches the shared decel cap reaching exactly 0, so
   * "stopped" and "foundered" land on the same tick by construction.
   *
   * The fields sink-entry deliberately KEPT (see sinkShip) are zeroed here,
   * at the actual end of the life: the residual speed (the cap is exactly 0
   * on this tick — the assignment makes the wreck's parked state explicit
   * rather than an artifact of the ramp), any still-open boost window (the
   * original "no active-boost chrome on a dead ship" rule now applies — the
   * next frame is a spectator frame with no `you`), and the slow/dazzle marks
   * (nothing carries through the death gap; respawn re-zeroes them for
   * symmetry exactly as before).
   */
  private founderSinking(): void {
    for (const ship of this.ships.values()) {
      const lc = ship.lifecycle;
      if (lc.kind !== 'sinking' || !hasFoundered(lc.since, this.now)) continue;
      ship.lifecycle = transitionLifecycle(lc, 'founder', this.now);
      ship.state.speed = 0;
      ship.boostUntil = 0;
      ship.slowedUntil = 0;
      ship.dazzledUntil = 0;
    }
  }

  /**
   * WHICH participant in a sinking holds the throne right now — the wire value
   * for `SunkEvent.bty` ('v' the victim, 'k' the killer), or undefined when
   * neither does. Both can never be true at once (one throne), and a self-sink
   * (`by === id`) resolves as the VICTIM case: `'k'` requires a killer distinct
   * from the victim, mirroring creditKill's own attribution rule. Called on
   * the PRE-sink state — before creditKill and recomputeBounty can move the
   * throne (the 2026-08-10 kill-leader grammar: the skull rides the leader's
   * name as killer OR victim).
   */
  private bountyMark(id: string, by: string | undefined): 'v' | 'k' | undefined {
    if (this.bountyId === '') return undefined;
    if (this.bountyId === id) return 'v';
    if (by !== undefined && by !== id && this.bountyId === by) return 'k';
    return undefined;
  }

  /**
   * The kill-credit half of sinkShip (Story 4.6 extraction): tally + XP for
   * an attributed sink. A DEAD killer (mutual destruction) still gets both;
   * storm (`by` undefined) and self-kills credit nothing to the roster tally
   * or the bounty bonus by construction — but the kill VALUE itself now flows
   * through payKillValue regardless, which pays assists on those sinks too.
   * `kills` — the roster tally AND the bounty ruler, one field since Story
   * 5.6 — advances ONLY on a PARTICIPANT victim: a human captain or, since
   * Story 6.4 (Eric ruling B3: bots are ordinary combatants — a bot victim
   * counts into `kills`, pays the full captain killLevels, and can move the
   * bounty throne), an AI-captain bot. A PvE fleet kill counts nowhere here
   * (amendment 38 — while its XP, its `sunk` event and its onscreen kill
   * flash all still fire); it instead advances `pveKills` under its own hull
   * id — the OPERATOR-ONLY sibling (amendment 44), which counts precisely
   * what `kills` deliberately refuses to. Sinking the throne's holder pays
   * `CONFIG.bounty.killLevels` ON TOP of the standard kill value, through the
   * unchanged grantXp pipeline (fractional carry untouched).
   *
   * The kill VALUE itself no longer necessarily lands whole on the killer — it
   * goes through payKillValue, which splits it among the hull's recent
   * attackers. THE BOUNTY BONUS IS NEVER SPLIT and is granted here, separately:
   * it rewards the act of sinking the throne's holder, not the work of wearing
   * them down.
   */
  private creditKill(victim: ShipRecord, by: string | undefined, victimHeldBounty: boolean): void {
    const killer = by && by !== victim.id ? this.ships.get(by) : undefined;
    if (killer !== undefined) {
      // The PvE TALLY keys on the fleet reading (economy): `pveKills` counts
      // fleet tonnage. An AI captain sunk in 6.4 is a captain kill, not PvE.
      if (roleIsFleetHull(victim)) killer.pveKills[victim.hullId] = (killer.pveKills[victim.hullId] ?? 0) + 1;
      else killer.kills += 1;
      if (victimHeldBounty) this.grantXp(killer, CONFIG.bounty.killLevels);
    }
    this.payKillValue(victim, killer);
    victim.damageFrom.clear(); // the ledger dies with the life it described
  }

  /**
   * Pay out a sinking hull's KILL VALUE — split among its recent attackers
   * (CONFIG.xp.assistWindowMs > 0), or whole to the killer at the 0 sentinel.
   *
   * OFF is byte-identical to last-hit-takes-all: an unattributed or self sink
   * pays nobody, and a killer takes the full `killXpLevels`.
   *
   * ON, the value becomes a pot: `killerShare` of it is guaranteed to the
   * killer, and the rest is divided by damage among everyone eligible — the
   * killer INCLUDED, since the killing blow itself routes through recordAssist,
   * so a solo kill still pays the full value and the split only ever moves
   * value to people who actually contributed.
   *
   * A DRONE VICTIM'S POT SPLITS TOO (Eric answer A5, 2026-08-23): `killXpLevels`
   * covers a fleet hull's ¼/½/¾ level, and that is what every measured arm did.
   *
   * A STORM KILL STILL PAYS THE ASSISTS. There is no killer, so the guaranteed
   * share goes UNPAID — it is payment for the risk of closing, and nobody took
   * that risk — but the hull was worn down by somebody and the split is about
   * that work. This is NEW value: today an unattributed sink credits nothing at
   * all.
   *
   * A FLEET-HULL KILLER BURNS THE GUARANTEED SHARE. The 0.1 (or configured
   * `killerShare`) is granted to the drone here exactly as it would be to a
   * human, but `addXpMs` fail-closes on every fleet hull — so the tenth simply
   * evaporates while the eligible human contributors still only split the 0.9
   * remainder through splitAssists. This is reachable in production (drones
   * carry guns and can land the killing blow) and matches the measured
   * reference behavior; it is a named consequence, not a defect.
   */
  private payKillValue(victim: ShipRecord, killer: ShipRecord | undefined): void {
    const pot = World.killXpLevels(victim);
    if (!(pot > 0)) return;
    const windowMs = CONFIG.xp.assistWindowMs;
    if (windowMs <= 0) {
      if (killer !== undefined) this.grantXp(killer, pot);
      return;
    }
    const share = Math.min(1, Math.max(0, CONFIG.xp.killerShare));
    if (killer !== undefined && share > 0) this.grantXp(killer, pot * share);
    this.splitAssists(victim, pot * (1 - share), this.now - windowMs, killer);
  }

  /**
   * The victim's contributors who may actually be paid: a tally whose last
   * damage landed at or after `cutoff` — i.e. whose rolling counter is still
   * active — from a hull that still exists and is not a fleet hull.
   *
   * Split out of splitAssists for the complexity budget, but it earns its own
   * name: every clause here is a RULE (the eligibility window, the fleet
   * exclusion, the self-damage guard) rather than bookkeeping, and reading them
   * in one place is how the payout stays auditable.
   *
   * FLEET HULLS ARE EXCLUDED rather than counted-and-unpaid: they cannot accrue
   * XP, so counting their damage would silently EVAPORATE part of every pot
   * they contributed to instead of redistributing it. (recordAssist already
   * refuses to ledger a fleet attacker; this is the same rule at the second
   * seam, and it also catches a hull whose role changed mid-life.)
   *
   * A DEAD ATTACKER'S CLAIM STILL PAYS: nothing here checks the contributor's
   * OWN lifecycle, only the victim's damage ledger — deliberately, mirroring
   * the mutual-destruction kill-credit precedent (creditKill still pays a
   * killer who died in the same exchange). A hull that sinks the victim's
   * attacker after they landed their damage does not erase that claim.
   *
   * OUTBOUND CLAIMS ARE NOT SWEPT FROM OTHER HULLS' LEDGERS on redeploy or
   * respawn — a fresh life can still be paid for damage its previous life
   * dealt, if some other victim's `damageFrom` entry for this id is still
   * inside the window. Unreachable in live BR (ready-room damage is
   * suppressed and match death is terminal — there is no redeploy), so this is
   * a directed-API limitation rather than a rule anyone has had to enforce.
   */
  private eligibleContributors(victim: ShipRecord, cutoff: number): { ship: ShipRecord; amount: number }[] {
    const out: { ship: ShipRecord; amount: number }[] = [];
    for (const [id, rec] of victim.damageFrom) {
      if (id === victim.id || rec.at < cutoff || !(rec.amount > 0)) continue;
      const ship = this.ships.get(id);
      if (ship === undefined || roleIsFleetHull(ship)) continue;
      out.push({ ship, amount: rec.amount });
    }
    return out;
  }

  /**
   * Divide `budget` levels among the victim's eligible contributors, in
   * proportion to the damage each dealt.
   *
   * AN ELIGIBLE ATTACKER BRINGS THEIR WHOLE TALLY WITH THEM — the window is a
   * property of the COUNTER, not a filter over the damage inside it. Eric:
   * *"as long as i continue putting damage on the ship within 60s, it tracks
   * all the damage i have done."* A sliding window over the same history (only
   * damage dealt inside the last 60 s counts) was measured and is deliberately
   * NOT taken: it discards the opening damage of a brawl still in progress.
   *
   * WITH NO ELIGIBLE CONTRIBUTOR AT ALL the remainder falls to the KILLER, and
   * with no killer either it evaporates — the storm-lull case, and the reason a
   * hull burning alone owes nobody anything.
   *
   * THE KILLER FALLBACK MAKES CONSERVATION STRUCTURAL RATHER THAN EMERGENT.
   * The ruling's own rationale for "a solo kill still pays the full value" is
   * that the killing blow itself routes through recordAssist, so the killer
   * always holds a live counter — true of every in-sim damage path, and the
   * branch below is therefore unreachable from any of them. But `sinkShip(id,
   * by)` is a directed API whose documented contract is "an attributed sink
   * credits the killer", and leaving that contract dependent on a call ordering
   * in another method is the same hidden coupling the REQUIRED `dealt`
   * parameter exists to forbid at the other seam. A killer who is on the books
   * for nothing IS the sole contributor to that death, so last-hit-takes-all is
   * the correct degenerate answer rather than burning nine tenths of the pot.
   * It is measurement-neutral: no measured arm could reach it.
   *
   * The same directed-API reasoning also covers a killer whose ledger entry
   * has fallen out of `eligibleContributors`' window — a directed sink against
   * a killer whose last recorded hit is older than `cutoff` reaches this
   * fallback exactly as the empty-ledger case does. Still unreachable in-sim
   * for the identical reason: the killing blow itself is the freshest possible
   * damage against `cutoff`, so it always refreshes the counter before this
   * branch could ever be asked to cover for it.
   */
  private splitAssists(victim: ShipRecord, budget: number, cutoff: number, killer: ShipRecord | undefined): void {
    if (!(budget > 0)) return;
    const eligible = this.eligibleContributors(victim, cutoff);
    let total = 0;
    for (const e of eligible) total += e.amount;
    if (!(total > 0)) {
      // A FLEET killer collects nothing here either: addXpMs fail-closes on it,
      // so the pot still evaporates exactly as it did before the fallback.
      if (killer !== undefined) this.grantXp(killer, budget);
      return;
    }
    for (const e of eligible) this.grantXp(e.ship, (budget * e.amount) / total);
  }

  /**
   * Mirror the strict-overtake throne rule (game/bounty.ts) over a snapshot
   * of the current field. Called once per sink, on ship removal, and on
   * respawn — never per tick, never from the frame path.
   */
  private recomputeBounty(): void {
    const cands: BountyCandidate[] = [];
    for (const s of this.ships.values()) {
      cands.push({ id: s.id, lifecycle: s.lifecycle, role: s.role, kills: s.kills });
    }
    this.bountyId = nextBountyHolder(this.bountyId, cands);
  }

  /**
   * Levels' worth of XP a kill on `victim` pays (Story 2.6, amendment 31): a
   * human captain is the full `CONFIG.xp.killLevels`; a drone pays its SIZE
   * TIER (¼ / ½ / ¾), read off the victim's existing hull id — the PvE tier
   * fractions' first real consumer, with no new drone state. An unknown hull
   * id pays nothing (fail-closed).
   */
  private static killXpLevels(victim: ShipRecord): number {
    if (!roleIsFleetHull(victim)) return CONFIG.xp.killLevels;
    const tiers: Partial<Record<HullId, number>> = CONFIG.xp.droneTierLevels;
    return tiers[victim.hullId] ?? 0;
  }

  /**
   * THE one XP entry point (Story 2.6): add `levels` worth of XP to a ship and
   * bank every threshold it crosses. Integer ms throughout — a kill's value is
   * rounded ONCE here. Every tier is a dyadic fraction of the 60000ms level, so
   * each rounds exactly: ¼ = 15000ms, ½ = 30000ms, ¾ = 45000ms.
   *
   * DRONES NEVER ACCRUE (the ratified bugfix): the guard sits in the credit
   * path itself, so no caller — passive tick, kill credit, or a future one —
   * can hand a drone XP, an offer array, or a `pt` event.
   *
   * The bank loop is a WHILE: one grant may cross several levels (a kill on
   * top of near-full progress, or a kill worth > 1 level), and each crossing
   * banks its own point + pre-rolled offer through the unchanged grantPoint.
   * The remainder always carries — no XP is ever snapped away (amendment 33).
   */
  grantXp(ship: ShipRecord, levels: number): void {
    if (!Number.isFinite(levels) || levels <= 0) return;
    this.addXpMs(ship, Math.round(CONFIG.xp.levelMs * levels));
  }

  /** The raw ms form behind grantXp (and the passive tick's `+dtMs`): the drone
   *  guard and the bank loop, in one place. Both guards are FAIL-CLOSED on
   *  non-finite input — a plain `<= 0` is false for NaN (which would poison
   *  `xpMs` forever) and for Infinity (which would spin the bank loop). */
  private addXpMs(ship: ShipRecord, ms: number): void {
    if (roleIsFleetHull(ship) || !Number.isFinite(ms) || ms <= 0) return;
    ship.xpMs += ms;
    while (ship.xpMs >= CONFIG.xp.levelMs) {
      ship.xpMs -= CONFIG.xp.levelMs;
      ship.level += 1;
      this.grantPoint(ship);
    }
  }

  /**
   * Level reward (Story 2.8, THE DECK MODEL; the lazy-draw bugfix): bank the
   * LEVEL — always, unconditionally — then materialize the front offer if this
   * level is the one at the front. A level that lands BEHIND a materialized
   * offer draws nothing at all: its hand is drawn when it reaches the front,
   * which is exactly what stops a banked queue from draining the deck.
   *
   * The self-private `pt` event fires whenever there IS a front offer after
   * materializing — i.e. on every level against a healthy deck. The one case
   * that stays silent is a DEGENERATE EMPTY DRAW (deck yielded nothing): the
   * level is still banked, but an offer-less level must not advertise
   * TAB-to-refit (the ratified rule, preserved). Reopening the refit window can
   * never reroll — the front offer is drawn once and frozen (FR19).
   */
  private grantPoint(killer: ShipRecord): void {
    killer.bankedLevels += 1;
    this.grantLevelHeal(killer);
    this.materializeOffer(killer);
    if (killer.offer !== null) this.pending.push({ k: 'pt', id: killer.id });
  }

  /**
   * THE FREE PER-LEVEL AUTO-HEAL (CONFIG.damageControl.levelMissingPct).
   *
   * Earning a level patches 10 % of the hull's MISSING hp at no cost, IN
   * ADDITION to the refit-menu heal, which is untouched. It costs no banked
   * level, drops no offer, and touches no deck — so the strategic heal spend
   * keeps working exactly as it does today, and only the routine chip-damage
   * tax moves off the card budget (measured: 58.7 % of every level earned was
   * going to a heal rather than an upgrade).
   *
   * Sits in grantPoint rather than addXpMs so it fires ONCE PER LEVEL BANKED —
   * including each crossing when one grant banks several at once — and inherits
   * grantPoint's callers for free. A fleet hull never reaches here: addXpMs
   * fail-closes on it before the bank loop runs.
   *
   * INTO THE POOL, NOT THE BAR. Feeding a pool rather than `hp` is what makes
   * this a TRICKLE the enemy can out-damage instead of a free instant top-up,
   * so it pays for chip damage between fights without answering burst damage —
   * which is the menu heal's job and the decision Eric wants preserved.
   *
   * A SINKING OR SUNK HULL GETS NOTHING. The "no hp comes back" rule of the
   * sinking window (amendment 10) governs here exactly as it governs spendHeal,
   * and a hull CAN still cross a level while sinking — its shells keep
   * resolving and kill credit is not alive-gated — so this guard is REACHABLE
   * rather than defensive.
   *
   * A FULL HULL GETS NOTHING AND NO CUE: 10 % of zero missing is zero, and the
   * `heal` event must not fire for a heal that did not happen. (This is why the
   * cue lives after the amount, not before it.)
   */
  private grantLevelHeal(ship: ShipRecord): void {
    if (!isAfloat(ship.lifecycle)) return;
    const dc = CONFIG.damageControl;
    // THE CHANNEL'S THIRD OFF SENTINEL, same family as assistWindowMs=0: a zero
    // duration means OFF, never instant. Without this guard a zeroed
    // levelRegenMs still accrues into levelRepairHp at a drain rate of 0 — a
    // pool that never empties and permanently inflates the wire's summed
    // repairHp.
    if (!(dc.levelMissingPct > 0) || !(dc.levelRegenMs > 0)) return;
    const add = (ship.stats.maxHp - ship.hp) * dc.levelMissingPct;
    if (!(add > 0)) return;
    ship.levelRepairHp += add;
    // DELIVERY BY DURATION: rate recomputed against the WHOLE pool, so the pool
    // empties exactly one levelRegenMs after the most recent level rather than
    // running longer for each one. See ShipRecord.levelRepairRate.
    ship.levelRepairRate = dc.levelRegenMs > 0 ? ship.levelRepairHp / dc.levelRegenMs : 0;
    // The existing self-private cue, reused: the client already plays the heal
    // tone and shows the hp rail's pending segment, so the free heal has full
    // feedback with ZERO client change.
    this.pending.push({ k: 'heal', id: ship.id });
  }

  /**
   * Draw the FRONT offer — the single place a hand is ever drawn (the lazy-draw
   * bugfix). Fires ONLY when a level is banked and no offer is materialized, so
   * exactly one draw happens per level over that level's lifetime and
   * `levelsSinceRare` (the pity escalation) still advances once per draw.
   *
   * DEGENERATE EMPTY DRAW: `offer` stays null and the bank stays put — the
   * queue never deadlocks (spendPoint's HEAL_CHOICE is still spendable, a card
   * pick is refused), and the next level simply retries the draw.
   */
  private materializeOffer(ship: ShipRecord): void {
    if (ship.bankedLevels <= 0 || ship.offer !== null) return;
    const { deck, offer } = drawOffer(ship.deck, ship.deckRng, this.boonCatalog);
    ship.deck = deck; // NON-CONSUMING: only levelsSinceRare moved
    if (offer.length > 0) ship.offer = offer;
  }

  /**
   * Apply one boon to a ship (Story 2.5 seam, live since 2.7; Story 2.8 grew
   * the doctrine swap, heal-on-grant, and raised-cap top-up). Exactly the two
   * homes plus hooks, nothing else: resolve the doctrine swap (below), append
   * the id, refresh the resolved-def/behavior caches, recompute the cached
   * stats through effectiveStats (home 1), and apply THIS boon's slot effects
   * incrementally to the live loadout (home 2 — untouched slots keep their
   * ammo/reload state; behavior effects execute per-tick in stepShips via the
   * cached boonBehaviors). NO event is queued (spendPoint owns the spend UX).
   *
   * HEAL-ON-GRANT (amendment 38, shipHull — the ONLY heal path): a
   * healOnGrant def heals exactly the maxHp DELTA this fit produced (clamped
   * to the new cap, never negative; only a LIVING hull heals — a corpse gets
   * full effective hp on respawn anyway).
   *
   * POOLS (amendment 41 — "everything arrives loaded", superseding the 2.5
   * clamp-down-only parking): after the slot effects, every fitted slot whose
   * effective cap ROSE fills to the new cap; a LOWERED cap still clamps down
   * (reconcilePools). Acquisitions install full pools via freshSlotState.
   *
   * TIMERS (Eric ruling 2026-08-04): a grant that moves a fitted slot's
   * effective reload rescales that slot's in-flight `reloadMsLeft` by the same
   * ratio, preserving the progress fraction — never a free round
   * (rescaleReloadTimers).
   *
   * EXCLUSIVITY IS DELETED (Story 7-5 wave 2, R2.6): the cannon's AP/PLUNGING
   * pair was the last user of `exclusiveWith`, and it died with the weapon. No
   * grant removes anything any more — every doctrine is an independent verb
   * that stacks — so applyBoon returns nothing and the deck has no give-back
   * path (`returnCards` left the shared barrel with the mechanism).
   *
   * Fail-closed: an id the world's catalog cannot resolve appends (the wire
   * mirrors it; clients drop it at resolve) but applies nothing. Public so
   * directed tests (and the spend path) can drive it.
   */
  applyBoon(ship: ShipRecord, boonId: string): void {
    // Own-property gate (fail-closed): a plain-object catalog answers
    // `this.boonCatalog['constructor']` with Object.prototype.constructor —
    // not undefined, and with no `effects` to iterate.
    const def = Object.hasOwn(this.boonCatalog, boonId) ? this.boonCatalog[boonId] : undefined;
    ship.boons.push(boonId);
    ship.boonDefs = resolveBoons(ship.boons, this.boonCatalog);
    ship.boonBehaviors = ship.boonDefs.length === 0 ? NO_BEHAVIORS : boonBehaviors(ship.boonDefs);
    const prevStats = ship.stats;
    ship.stats = effectiveStats(ship.cls, ship.boonDefs);
    if (def?.healOnGrant === true && isAfloat(ship.lifecycle)) {
      const delta = Math.max(0, ship.stats.maxHp - prevStats.maxHp);
      ship.hp = Math.min(ship.hp + delta, ship.stats.maxHp);
    }
    // hp invariant: a maxHp-LOWERING fit may not leave hp above the cap.
    ship.hp = Math.min(ship.hp, ship.stats.maxHp);
    if (def !== undefined) {
      for (const effect of def.effects) applySlotEffect(ship.loadout, effect, ship.stats);
    }
    this.reconcilePools(ship, prevStats);
    this.rescaleReloadTimers(ship, prevStats);
    // A speed card raises the true attainable top speed the wake ring was
    // provisioned for (Story 4.12) — upsize in place, live samples preserved.
    this.reprovisionWake(ship);
  }

  /**
   * Pool invariant after a stats recompute (amendment 41): a slot whose
   * effective cap ROSE fills to the new cap immediately ("everything arrives
   * loaded" — AFT TURRET/SECOND TUBE hand out their round); a cap at-or-below
   * its previous value still clamps `n` down to the ceiling. A slot FILLED by
   * this very grant (acquisition) compares base-vs-base caps — a no-op over
   * its already-full fresh pool.
   */
  private reconcilePools(ship: ShipRecord, prevStats: EffectiveStats): void {
    for (const slot of ship.loadout) {
      const id = slot.equipmentId;
      if (id === null || slot.state === null) continue;
      const cap = equipmentMaxAmmo(ship.stats, id);
      if (cap > equipmentMaxAmmo(prevStats, id)) slot.state.n = cap;
      slot.state.n = Math.min(slot.state.n, cap);
    }
  }

  /**
   * Mid-reload renormalization (Eric ruling 2026-08-04): a grant that changes a
   * fitted slot's EFFECTIVE reload rescales that slot's in-flight timer by the
   * same ratio, so the PROGRESS FRACTION survives the fit — a captain half way
   * through a 5000ms gun reload who takes one cooldown card lands on 2250 of
   * 4500, still half way, instead of waiting out the old, longer clock.
   *
   * Deliberately NOT a free round: only `reloadMsLeft` moves (`n` is
   * reconcilePools' business) and the scaled timer stays strictly positive, so
   * nothing becomes instantly available. The rule is GENERIC — it compares
   * prev-vs-new `equipmentReloadMs` per fitted slot, so a ratio of 1 (any boon
   * that does not touch reloads) leaves every timer byte-identical, and a future
   * per-weapon reload card gets the same treatment for free.
   *
   * ORDER — this runs AFTER reconcilePools deliberately. The two touch disjoint
   * fields (counts vs timer) and both read the same untouched `prevStats`, so
   * they commute numerically; running timers LAST keeps the reading "settle the
   * pool, then the clock that fills it" and guarantees we never scale a timer a
   * later step would overwrite. The one interaction worth naming: a slot whose
   * cap ROSE is filled to cap by reconcilePools and may keep a stale nonzero
   * timer — but `tickReload` pins the timer to 0 on the very next tick once
   * `n >= maxAmmo`, so scaling it is inert either way. A slot FILLED by this
   * grant (acquisition) arrives from `freshSlotState` with `reloadMsLeft: 0` and
   * is skipped by the `left <= 0` guard.
   */
  private rescaleReloadTimers(ship: ShipRecord, prevStats: EffectiveStats): void {
    for (const slot of ship.loadout) {
      const id = slot.equipmentId;
      if (id === null || slot.state === null) continue;
      const left = slot.state.reloadMsLeft;
      if (left <= 0) continue; // idle slot: nothing in flight
      const oldMs = equipmentReloadMs(prevStats, id);
      const newMs = equipmentReloadMs(ship.stats, id);
      if (oldMs <= 0 || oldMs === newMs) continue; // no ratio, or nothing moved
      slot.state.reloadMsLeft = left * (newMs / oldMs);
    }
  }

  /**
   * Wire entry point for MSG.spend: consume ONE banked level. Validate-
   * everything like submitInput, fail-closed — unknown ship, empty bank, or a
   * malformed choice returns false with the bank and its hand untouched. `choice` indexes
   * the FRONT offer, bounded by that offer's ACTUAL length (4 against the
   * production catalog, so digit 4 is live — Story 2.7; a short offer from a
   * small injected catalog bounds itself). Levels ARE spendable while dead
   * (builds persist across waiting-phase respawns — same precedent as the dead
   * killer's reward) but NEVER while SINKING (Story 5.2, amendment 10 — see
   * the guard below).
   *
   * The fitted boon is applied through applyBoon (the 2.5 seam, now live) and
   * the SELF-PRIVATE `bn` event is queued HERE, not inside applyBoon: a
   * directed applyBoon (tests, future scripted grants) must stay event-free —
   * "a spend happened" is a property of this path only.
   *
   * DAMAGE CONTROL (Eric rulings 2026-08-04): the accept set widens by exactly
   * ONE reserved value — `HEAL_CHOICE` (-1), the always-available heal strip.
   * It is a NEGATIVE sentinel deliberately (a positive one would collide the
   * day CONFIG.offer.size moves), so the ordinary bound stays `0 ≤ choice <
   * front.length` and every other negative (-2, -99) is still malformed. The
   * heal is NOT a card and never reaches applyBoon.
   */
  spendPoint(id: string, rawChoice: unknown): boolean {
    const ship = this.ships.get(id);
    if (!ship || ship.bankedLevels <= 0) return false;
    // THE REFIT IS CLOSED WHILE SINKING (Story 5.2, amendment 10 — "once
    // sinking, you're done"): card picks AND the HEAL_CHOICE spend are refused
    // outright — a clean denial (false), never a throw; the bank and its
    // front hand stay untouched, so the level is still there for the next life.
    // Deliberately NOT routed through sinkingActivationGate: the economy never
    // went near it, and this is the actual policy that gate's amendment names.
    // Note the asymmetry is three-state: alive spends, SUNK spends (builds
    // persist across waiting-phase respawns), sinking alone shops nothing.
    if (isSinking(ship.lifecycle)) return false;
    if (typeof rawChoice !== 'number' || !Number.isInteger(rawChoice)) return false;
    if (rawChoice === HEAL_CHOICE) return this.spendHeal(ship);
    return this.spendCard(ship, rawChoice);
  }

  /**
   * The CARD half of a spend, split from spendPoint (complexity budget). A card
   * pick needs a MATERIALIZED front offer — a degenerate offer-less level has
   * nothing to fit, so the pick is refused (the level stays banked and the heal
   * strip stays live).
   *
   * THE ORDER HERE IS LOAD-BEARING (the lazy-draw bugfix): consume the LEVEL
   * first (drop the offer, decrement the bank), then settle the fit (which
   * takes the chosen card out of the deck, returns a swapped-out doctrine
   * rival, and purges on an acquisition), and materialize the NEXT offer LAST —
   * so the next hand is drawn from a fully cleaned deck: post-purge,
   * post-return, minus exactly the one card just fitted.
   */
  private spendCard(ship: ShipRecord, choice: number): boolean {
    const front = ship.offer;
    if (front === null || choice < 0 || choice >= front.length) return false;
    ship.offer = null;
    ship.bankedLevels -= 1;
    this.settleSpend(ship, front, choice);
    this.materializeOffer(ship);
    return true;
  }

  /**
   * The DAMAGE CONTROL spend (Eric rulings 2026-08-04) — a sibling of
   * settleSpend, never a path into applyBoon: the heal is not a boon, so it
   * must not run grant-time effects, reconcilePools, or rescaleReloadTimers.
   *
   * FAIL-CLOSED, checked BEFORE anything is consumed: a dead hull or one
   * already at full effective hp is REJECTED with the queue and the pool
   * completely untouched — the level stays banked (the client renders the strip
   * inert + a denied pulse). This is the one asymmetry with a card pick, which
   * is legal while dead because a build persists across the death gap; a heal
   * cannot, because tickRepairs only ticks living hulls and sinkShip zeroes the
   * pool. (A SINKING hull never reaches this method — spendPoint refuses the
   * whole spend first, amendment 10 — but the isAfloat guard here would refuse
   * it anyway: belt and braces on the "no hp comes back" rule.)
   *
   * On success exactly ONE level is consumed and the front offer is DROPPED —
   * unlike a card pick, which takes its chosen card out of the deck. The deck
   * is not touched AT ALL (under the lazy-draw model nothing ever left it), so
   * a heal costs progression time and nothing else: the cards you passed on are
   * all still in the pool for the next hand. A card pick is the only thing that
   * thins the deck. Requires only a BANKED LEVEL — a degenerate offer-less
   * level can still be healed with.
   */
  private spendHeal(ship: ShipRecord): boolean {
    if (!isAfloat(ship.lifecycle) || ship.hp >= ship.stats.maxHp) return false;
    ship.offer = null;
    ship.bankedLevels -= 1;
    const dc = CONFIG.damageControl;
    ship.hp = Math.min(ship.hp + dc.instantHp, ship.stats.maxHp);
    // Pools ADD, the RATE never changes (the ratified anti-flask rule): a second
    // heal makes the drain run twice as LONG, never twice as fast.
    ship.repairHp += dc.regenHp;
    this.pending.push({ k: 'heal', id: ship.id });
    this.materializeOffer(ship); // the NEXT banked level surfaces its hand now
    return true;
  }

  /** The spend's application half: take the CHOSEN card out of the deck, fit
   *  the pick, queue the self-private `bn`, and run the acquisition
   *  bookkeeping when the pick filled the R slot. Split from spendPoint
   *  (complexity budget). */
  private settleSpend(ship: ShipRecord, front: BoonOffer, choice: number): void {
    const boon = front[choice];
    // THE DECK's one and only outflow (the lazy-draw bugfix): the CHOSEN card
    // leaves the pool. The unchosen cards need no give-back — they never left —
    // so the deck thins over a match by exactly the cards FITTED, and a
    // passed-on line is at full copies for the very next draw.
    ship.deck = consumeCard(ship.deck, boon);
    this.applyBoon(ship, boon);
    this.pending.push({ k: 'bn', id: ship.id, boon });
    // Acquisition pick (amendment 38): the R slot is PERMANENT — the acquired
    // subdeck shuffles in and every remaining acquisition card purges. The
    // NEXT offer is materialized after this returns, so it is drawn from the
    // already-cleaned deck (amendment 43's scrub has nothing left to do).
    const def = Object.hasOwn(this.boonCatalog, boon) ? this.boonCatalog[boon] : undefined;
    if (def !== undefined && isAcquisitionDef(def)) this.consumeAcquisitionPick(ship, def);
  }

  /**
   * The acquisition-pick deck bookkeeping (Story 2.8, amendment 38), run AFTER
   * applyBoon installed the equipment: shuffle the acquired equipment's subdeck
   * into the pool and purge every remaining acquisition card
   * (consumeAcquisition — the R slot can never fill again).
   *
   * AMENDMENT 43's SCRUB IS RETIRED (the lazy-draw bugfix): it removed dead
   * acquisition cards from other BANKED offers, and there are none — only the
   * FRONT offer is ever materialized, and spendCard drops it before calling
   * here, then materializes the next one from this already-purged deck. A stale
   * acquisition card is unreachable by construction, which also retires the P5
   * scrubbed-to-empty deadlock the old refill could produce.
   */
  private consumeAcquisitionPick(ship: ShipRecord, def: BoonDef): void {
    const fill = def.effects.find((e) => e.kind === 'slotFill');
    if (fill === undefined || fill.kind !== 'slotFill') return;
    ship.deck = consumeAcquisition(ship.deck, this.boonCatalog, fill.equipmentId);
  }

  /**
   * THE TICK ORDER AS DATA (Story 5.1, AR8): every simulation step step()
   * runs, in the exact order it runs them. The order-identity test
   * (stepOrder.test.ts, amendment 6) pins the name sequence, so any reorder,
   * insertion, or removal is a deliberate reviewed edit rather than a silent
   * behavior change — several rows below are correct ONLY because of where
   * they sit, and their comments (moved here verbatim from the old inline
   * step() body) are the sole documentation of those orderings.
   *
   * Rows hold SIM STEPS ONLY (amendment 5). Three statements stay in step()
   * itself, outside this array: the clock advance, the aliveHulls() snapshot
   * (see stepContext()), and the end-of-tick event/denial/muzzle-dedupe swap.
   * Those are frame BOUNDARIES, not insertable positions — a row placed
   * "before the clock" or "after the swap" would not be part of the tick it
   * thinks it is in.
   *
   * Each row's thunk passes its method EXACTLY the arguments the method's
   * unchanged signature demands (ctx.dt seconds / ctx.dtMs milliseconds /
   * ctx.hulls() / nothing) — the signatures themselves did not move, so the
   * type-checker re-verifies every call against the real method and a row
   * cannot silently drift onto the wrong unit or a stale capture.
   */
  static readonly STEP_ORDER: readonly StepRow[] = Object.freeze(
    ([
    // PvE fleet hulls write their inputs through the same store humans use, so
    // they are picked up by applyInputs exactly like any client this tick. The
    // ROW NAME is unchanged across the Story 5.6 rewrite (the order-identity
    // pin is on names, and the name still describes what the row does).
    { name: 'dronesTick', run: (w) => w.drones.tick() },
    // Combat bots (Story 6.4) write their inputs through the very same store,
    // for the very same reason: an AI input row must sit ahead of applyInputs
    // in the SAME tick, or every bot steers on a 50ms-stale command. Beside
    // dronesTick, immediately before applyInputs — the sanctioned position
    // the spawnFleetWaves rationale below names; the two AI rows are order-
    // independent of each other (disjoint hull sets, both write-only into the
    // input store), but nothing may sit between this pair and applyInputs.
    // World hands the controller its per-tick entries (own record + bound
    // observe thunk per bot — see botEntries()); the controller holds no
    // World reference of its own.
    { name: 'botsTick', run: (w) => w.bots.tick(w.botEntries()) },
    { name: 'applyInputs', run: (w) => w.applyInputs() },
    { name: 'stepShips', run: (w, ctx) => w.stepShips(ctx.dt) },
    { name: 'resolveCollisions', run: (w) => w.resolveCollisions() },
    // Wake sampling (Story 4.12) hangs off the kinematics pass — DELIBERATELY
    // after resolveCollisions, not inside stepShips: resolveShipPose can roll
    // a candidate pose back off an island, and a wake sample must record the
    // RESOLVED pose (water where the hull actually is), never a rolled-back
    // candidate inside land. Torpedo ribbons sample in stepShells below.
    { name: 'sampleWakes', run: (w) => w.sampleWakes() },
    // THE FOUNDER EDGE (Story 5.2) — DELIBERATE step-order position, chosen
    // not inherited (amendment 6). AFTER the motion block (stepShips /
    // resolveCollisions / sampleWakes): the window's final tick still moves,
    // resolves against land and lays its last wake sample as `sinking`, and
    // the transition reads POST-move truth. BEFORE every later consumer of
    // liveness, so on the deadline tick the hull is already `sunk` for the
    // damage rows (a no-op either way — amendment 12 makes a sinking victim
    // untouchable, so this placement cannot change damage semantics; that is
    // exactly why it is safe here), for the activation gates (the firing
    // window closes on precisely the tick the shared decel cap reaches 0 —
    // hasFoundered and the cap share the inclusive deadline, so "stopped",
    // "silenced" and "foundered" are the same tick), and for processRespawns
    // (a standalone-World respawn owes no extra tick past the deadline).
    { name: 'founderSinking', run: (w) => w.founderSinking() },
    // Storm: post-move positions decide who is outside the (damage-only) zone.
    // The physical map boundary stays at mapRadius — ships freely sail into the
    // storm; the zone only bites HP.
    { name: 'applyStorm', run: (w, ctx) => w.applyStorm(ctx.dt) },
    // Ballistics + mines both test against post-move hulls (built once):
    // ctx.hulls() materializes the tick's ONE snapshot here, on first access
    // (see stepContext()), and the two mine rows below reuse it as-is.
    { name: 'stepShells', run: (w, ctx) => w.stepShells(ctx.dt, ctx.hulls()) },
    { name: 'stepMines', run: (w, ctx) => w.stepMines(ctx.hulls()) },
    // RADAR BUOYS (Story 7-5 wave 2) — DELIBERATE step-order position, with
    // the other static-entity resolution (the stepMines/expireLitZones band):
    // expiry, the buoy's own sweep advance + jam-epoch refresh, and the GUN
    // BUOY's auto-fire. It must sit AFTER the motion block (the gun ranges
    // post-move hostiles) and BEFORE tickRepairs, whose "after EVERY damage
    // source this tick" contract the buoy gun now falls under — a hull the
    // buoy sinks this tick is already sunk before regen runs, so damage keeps
    // winning the tie by construction.
    { name: 'tickBuoys', run: (w, ctx) => w.tickBuoys(ctx.dtMs) },
    // Star-shell doctrine zone effects (Story 2.8): incendiary DoT + dazzle
    // marking, against post-move centers, BEFORE the expiry sweep so a zone
    // burns/dazzles through its final tick.
    { name: 'applyZoneEffects', run: (w, ctx) => w.applyZoneEffects(ctx.dt) },
    // DAMAGE CONTROL regen (Eric rulings 2026-08-04) — DELIBERATE step-order
    // position: dead LAST among the hp movers, after EVERY damage source this
    // tick (storm, ballistics, mine blasts, the incendiary DoT) has already
    // bitten and any lethal bite has already routed through sinkShip. Two
    // things follow, both intended. (1) The afloat gate reads POST-DAMAGE truth
    // — a hull the storm sank this very tick is already `sunk` with its
    // pool zeroed, so a regen pool can never un-sink a hull at 0 hp; damage
    // wins the tie by construction, with no explicit tie-break code. (2) The
    // storm overlap nets exactly (regen rate − stormDps) per tick, because both
    // integrate the same dt against the same float hp in a fixed order. It sits
    // BEFORE processRespawns for the same reason tickXp sits after: a respawn
    // restores full hp and zeroes the pool, so anything paid to a wreck here
    // would be overwritten rather than banked. Nothing downstream in the step
    // reads hp or repairHp, so no other system depends on this position.
    { name: 'tickRepairs', run: (w, ctx) => w.tickRepairs(ctx.dtMs) },
    // WOUNDED SMOKE (Story 4.4) — DELIBERATE step-order position: directly
    // after the LAST hp mover (tickRepairs), so every damage source AND the
    // regen drain have already resolved. A hull that crossed a band this tick
    // smokes at its post-resolution hp, and one healed above the band goes
    // silent the same tick it recovered.
    { name: 'tickSmoke', run: (w) => w.tickSmoke() },
    // Lit zones (Story 1.7): natural-expiry sweep, positioned with the other
    // static-entity resolution (the mines precedent). Zones are SPAWNED inside
    // stepShells (resolveBurst on a star shell) and deliberately survive their
    // owner's death — expiry is the only way out.
    { name: 'expireLitZones', run: (w) => w.expireLitZones() },
    { name: 'fireControl', run: (w, ctx) => w.fireControl(ctx.dtMs) },
    // Ability activation (Story 1.6): the actSeq sibling of fireControl, resolved
    // in the same step-order position — both turn this tick's stored input intent
    // into activations through the single sinking gate.
    { name: 'activationControl', run: (w) => w.activationControl() },
    // Foghorn (Story 4.5): the hornSeq sibling, resolved in the same
    // step-order position — post-move, so a honk sounds at the ship's TRUE
    // position this tick. An emote, never an activation: it goes nowhere near
    // the sinking gate, the equipment rows, or the denial queue.
    { name: 'hornControl', run: (w) => w.hornControl() },
    // Radar: the sweep advances here; the per-observer paint (blips) happens
    // at frame-build time in perception.ts using [prevSweepAngle, sweepAngle).
    { name: 'advanceSweeps', run: (w, ctx) => w.advanceSweeps(ctx.dtMs) },
    { name: 'processRespawns', run: (w) => w.processRespawns() },
    // Passive XP (Story 2.6) — DELIBERATE step-order position: dead LAST, after
    // respawns and before the event swap. After respawns so a hull that came
    // back this very tick is already afloat for its own accrual (the afloat gate
    // reads post-respawn truth, not a one-tick-stale one); before the swap so a
    // level banked here publishes its `pt` event on THIS tick's frame rather
    // than trailing into the next one. Nothing downstream in the step reads XP,
    // so no other system's behavior can depend on where it sits.
    { name: 'tickXp', run: (w, ctx) => w.tickXp(ctx.dtMs) },
    // PvE FLEET WAVES (Story 5.6, amendment 37) — DELIBERATE step-order
    // position: dead LAST, after every row that touches a hull.
    //
    // The obvious slot is before `dronesTick`, so a hull spawning this tick
    // gets its first input the same tick. It is the WRONG slot, twice over.
    // First, the AI input rows' position is pinned and load-bearing — the
    // dronesTick/botsTick pair must sit IMMEDIATELY before applyInputs, and
    // inserting ahead of them is the one change the ordering rationale
    // forbids. Second, every row between spawn
    // and the tick's end would then see a hull that has not moved, has no
    // wake sample and has never been collision-resolved; the storm row in
    // particular would bite a hull placed one row earlier. Spawning last
    // costs the fleet exactly one tick (50ms) of idling and buys a hull that
    // enters the world at a clean tick boundary.
    //
    // It still publishes on THIS tick's frame: the event swap is the EPILOGUE
    // (outside STEP_ORDER), so the `spawn` events queued here ride out
    // immediately.
    { name: 'spawnFleetWaves', run: (w) => w.spawnFleetWaves() },
    // Each ROW is frozen too, not just the container (review finding F2b):
    // Object.freeze on the array alone leaves `STEP_ORDER[i].run` writable, so
    // a shallow freeze would let a row be swapped out from under the identity
    // pin without moving a single name.
    ] satisfies StepRow[]).map((row) => Object.freeze(row)),
  );

  /** Advance the simulation one fixed step (default SIM_DT = 50ms). */
  step(dtMs: number = CONFIG.tick.simDtMs): void {
    // Fixed PROLOGUE (amendment 5): the clock advance is the tick's opening
    // frame boundary, not an insertable position — it stays outside STEP_ORDER.
    this.tick += 1;
    this.now += dtMs;
    const ctx = this.stepContext(dtMs);

    for (const row of World.STEP_ORDER) row.run(this, ctx);

    // Fixed EPILOGUE (amendment 5): the end-of-tick swap is the closing frame
    // boundary — a row appended "after" it would land in the NEXT tick's
    // publish window, so it too stays outside STEP_ORDER.
    // Publish this tick's events (including joins/sinks queued between steps).
    this.events = this.pending;
    this.pending = [];
    // Publish this tick's denied presses (Story 1.10) — same swap discipline.
    this.tickDenials = this.pendingDenials;
    this.pendingDenials = new Map();
    // Muzzle-flash dedupe (Story 4.3) resets with the tick's other per-tick
    // state: next tick's first gun-family spawn per owner flashes again.
    this.mzOwnersThisTick.clear();
  }

  /**
   * Build one tick's StepContext. Both dt forms derive from step()'s own dtMs
   * argument each tick, so a caller-supplied dt flows to every row unchanged.
   *
   * `hulls` is the tick's ONE aliveHulls() snapshot, memoized on FIRST access
   * — which the pinned order guarantees is stepShells, the exact position the
   * old inline `const hulls = this.aliveHulls()` statement occupied. It is
   * DELIBERATELY STALE from then on: a hull sunk by stepShells remains in the
   * array for stepMines, which re-checks liveness per
   * victim — the damage semantics live in those re-checks, NOT in the
   * snapshot (amendment 5). It is not a STEP_ORDER row because a row would
   * advertise an insertable slot right after it, and anything inserted there
   * silently inherits that staleness trap. And it cannot move to the prologue
   * either: aliveHulls() bakes post-move polygon transforms and filters on
   * post-storm liveness at call time, so a prologue snapshot would hand
   * ballistics pre-move geometry and hulls the storm already sank this tick.
   */
  private stepContext(dtMs: number): StepContext {
    let hulls: HullTarget[] | undefined;
    return {
      dt: dtMs / 1000,
      dtMs,
      hulls: () => (hulls ??= this.aliveHulls()),
    };
  }

  /**
   * Queue a SELF-PRIVATE wire denial for one refused press (Story 1.10 —
   * FR12's "denied fire is never silent"). Maps the row's internal denial
   * onto the wire vocabulary per channel: 'out-of-arc' and 'blocked' pass
   * through; an empty pool reads 'cooling' on the WEAPON click channel (the
   * round is reloading — with the shared ammo machine an empty weapon pool
   * always has its reload running) and 'no-ammo' on the ABILITY channel (no
   * charge). The gate's 'dead'/'empty-slot' refusals never reach the wire
   * (client-predictable / honest-client-unreachable). A denial is a
   * SELF-PRIVATE wire message, so it is queued for a REAL CONNECTED CAPTAIN
   * only — the one site keyed on isHuman rather than on the fleet/participant
   * split, because what it needs is a socket at the other end, not a stake in
   * the outcome (a 6.4 AI captain drives itself and has nobody to tell).
   * `seq` is the press identity the client dedups on (fireSeq for clicks,
   * actSeq for ability presses).
   */
  private queueDenial(
    ship: ShipRecord,
    slot: number,
    seq: number,
    denial: ActivationDenial,
    channel: 'weapon' | 'ability',
  ): void {
    if (!roleIsHuman(ship)) return;
    const reason = World.wireDenialReason(denial, channel);
    if (reason === null) return;
    const queue = this.pendingDenials.get(ship.id) ?? [];
    queue.push({ slot, reason, seq });
    this.pendingDenials.set(ship.id, queue);
  }

  /** The wire reason for an internal denial, or null when it never travels. */
  private static wireDenialReason(
    denial: ActivationDenial,
    channel: 'weapon' | 'ability',
  ): DenialReason | null {
    if (denial === 'out-of-arc' || denial === 'blocked') return denial;
    if (denial === 'no-ammo') return channel === 'weapon' ? 'cooling' : 'no-ammo';
    // 'dead' / 'empty-slot' / 'frozen' — gate refusals stay server-internal
    return null;
  }

  /** Copy each client's latest stored input onto its ship (kinematics stay
   *  latest-wins) and drain this tick's accepted-intent queue (Story 2.1) so
   *  fireControl / activationControl can evaluate EVERY accepted press. */
  private applyInputs(): void {
    for (const ship of this.ships.values()) {
      ship.tickIntents = this.inputs.drainIntents(ship.id);
      const inp = this.inputs.get(ship.id);
      if (inp) {
        ship.input = inp;
        ship.lastAckSeq = inp.seq;
      }
      // THE HELM LOCK (Story 6.1, amendment 8) — here in the INPUT PATH rather
      // than as a skip of this whole method or a branch inside stepShips: the
      // ship still takes the client's aim, slot and press counters (so the HUD
      // and every seq grammar keep tracking), it just steers a neutral helm.
      // The stored message is NEVER mutated — the InputStore hands out the same
      // object every tick until a newer one arrives, so zeroing it in place
      // would silently erase the client's real throttle for good.
      if (!this.helmEnabled) ship.input = { ...ship.input, throttle: 0, rudder: 0 };
    }
  }

  /** Kinematics for every hull still on the water — afloat OR SINKING (Story
   *  5.2 motion seam 1 of 3, amendment 15): a sinking hull still answers its
   *  helm through the same shared stepShip, then decays through the shared
   *  sinking cap below. EFFECTIVE kinematics (maxSpeed upgrade); the client
   *  predictor steps with the same effectiveStats() result, so prediction
   *  stays in lockstep. */
  private stepShips(dt: number): void {
    for (const ship of this.ships.values()) {
      const lc = ship.lifecycle;
      if (!isAfloat(lc) && !isSinking(lc)) continue;
      // Snapshot the pre-kinematics pose (induction-valid) for resolveShipPose's
      // rollback branch, then advance.
      const p = ship.prevPose;
      p.x = ship.state.x;
      p.y = ship.state.y;
      p.heading = ship.state.heading;
      // THE one place boost enters kinematics (Story 1.6): while the window is
      // open (now < boostUntil) the shared helper raises the forward maxSpeed cap
      // by stats.boost.speedBonus; the hull accelerates toward it at class accel
      // and decays back at class decel on expiry. Client prediction/replay call
      // the identical helper, so a boosting hull stays in lockstep.
      // Story 2.5: boon behavior hooks fold in AFTER the bespoke boost —
      // hookKinematics(boostedKinematics(...)) — the documented composition
      // order the client Predictor.tickKin mirrors exactly. Zero behaviors
      // (every production hull until 2.7) returns the boosted reference
      // unchanged, so the pre-boon tick is byte-identical.
      const boosted = boostedKinematics(
        ship.stats.kinematics,
        ship.stats.boost.speedBonus,
        this.now < ship.boostUntil,
      );
      // PINNED COMPOSITION ORDER (server AND predictor, byte-identical —
      // sim/slow.ts header): boostedKinematics → slowedKinematics →
      // hookKinematics. The prop-fouling slow (Story 2.8) folds between the
      // bespoke boost and the hook chain; the client's Predictor.tickKin
      // mirrors this exact order from you.boostUntil/you.slowedUntil.
      const slowed = slowedKinematics(boosted, CONFIG.mine.foulFactor, this.now < ship.slowedUntil);
      const kin = hookKinematics(slowed, ship.boonBehaviors, this.hookRegistry);
      stepShip(ship.state, ship.input, kin, dt);
      // THE RITARDANDO (Story 5.2): the shared linear speed cap, applied
      // right after stepShip exactly where prediction.ts applies it — and
      // fed the POST-boost/slow PER-TICK max (kin.maxSpeed), NEVER the rated
      // class max: amendment 10 admits speedBoost while sinking, and a
      // rated-max ramp would silently cap the surge out of existence. A live
      // boost lifts the ceiling the ramp scales (bonus × remaining), a slow
      // lowers it, and either way the cap is exactly 0 at the founder
      // deadline. (The `kind` read, not isSinking(), because the `since`
      // payload needs the discriminant narrow — the gate above is the seam.)
      if (lc.kind === 'sinking') applySinkingDecel(ship.state, kin.maxSpeed, lc.since, this.now);
    }
  }

  /**
   * Resolve each candidate pose against islands + the map edge via the shared
   * pose-validity rollback (sim/collision.ts) — the SAME function the client
   * Predictor runs, so prediction never diverges on rocks or the boundary.
   * The speed response is the SHARED applyGroundingDamp (Eric ruling
   * 2026-08-06: directional, land-only, a cap rather than a per-tick
   * multiplier) called with the hull's RATED effective max speed — the exact
   * number the predictor passes — so the two sides stay byte-identical.
   * hullPoly doubles as the transform scratch (aliveHulls rewrites it for this
   * tick's ballistic/mine tests).
   *
   * The result's LAND-ONLY `contact` flag is also STORED on the record
   * (ShipRecord.landContact) rather than consumed and dropped: it is the
   * simulation's exact answer to "is this hull aground", and the bot brain's
   * un-beach trip reads it off its own record instead of guessing from speed
   * (which cannot work — the damp is a cap, not a stop).
   */
  private resolveCollisions(): void {
    for (const ship of this.ships.values()) {
      // Story 5.2 motion seam 2 of 3 (amendment 15): a SINKING hull still
      // pushes out of islands and off the map edge — it moved this tick, so
      // its pose must resolve, or the window would let it coast into land.
      if (!isAfloat(ship.lifecycle) && !isSinking(ship.lifecycle)) {
        ship.landContact = false; // off the water: never aground
        continue;
      }
      const res = resolveShipPose(
        ship.prevPose,
        ship.state,
        this.map.islands,
        this.map.radius,
        hullSilhouette(ship.hullId),
        ship.hullPoly,
      );
      ship.landContact = res.contact;
      applyGroundingDamp(ship.state, res, ship.stats.kinematics.maxSpeed);
    }
  }

  /** A hull's TRUE attainable top speed for wake-ring provisioning (Story
   *  4.12): the effective kinematics cap plus the boost window's speedBonus —
   *  both off effectiveStats(), the sole derivation path. Never raw CONFIG. */
  private static wakeTopSpeed(stats: EffectiveStats): number {
    return stats.kinematics.maxSpeed + stats.boost.speedBonus;
  }

  /**
   * Per-tick wake upkeep (Story 4.12): every hull still on the water — afloat
   * OR SINKING (Story 5.2 motion seam 3 of 3, amendment 15: a hull making way
   * lays wake, and a sinking hull is still making way) — records its resolved
   * pose on the shared distance cadence (appendWakeSample drops non-finite
   * samples and enforces the cadence itself — a stopped or dead hull simply
   * lays nothing); every ribbon's expired tail is pruned; and DETACHED
   * ribbons whose water is entirely gone are released (amendment 200: a wake
   * outlives its source UNTIL its water ages out, not forever). Attached
   * ribbons are never released — a ship's active ribbon empties and refills
   * as it stops and gets under way.
   */
  private sampleWakes(): void {
    for (const ship of this.ships.values()) {
      pruneWake(ship.wake, this.now);
      if (isAfloat(ship.lifecycle) || isSinking(ship.lifecycle)) {
        appendWakeSample(ship.wake, ship.state.x, ship.state.y, this.now);
      }
    }
    for (const r of this.torpWakes.values()) pruneWake(r, this.now);
    for (let i = this.orphanWakes.length - 1; i >= 0; i--) {
      if (pruneWake(this.orphanWakes[i], this.now) === 0) this.orphanWakes.splice(i, 1);
    }
  }

  /**
   * Detach a hull's active ribbon into the orphan store and start a fresh one
   * (Story 4.12) — called at every life boundary that TELEPORTS the hull
   * (respawn / redeployShip) and at removeShip. Mandatory at a teleport:
   * appendWakeSample chains consecutive samples, so a kept ribbon would draw
   * a bogus death-point→spawn-point segment across the map. The old water
   * keeps disclosing from orphanWakes until it ages out. An empty detached
   * ribbon is dropped immediately (nothing to age out).
   */
  private detachWake(ship: ShipRecord): void {
    if (pruneWake(ship.wake, this.now) > 0) this.orphanWakes.push(ship.wake);
    ship.wake = createShipWake(ship.hullId, World.wakeTopSpeed(ship.stats));
  }

  /**
   * Wake ring re-provisioning after a stats change (Story 4.12): a speed card
   * (shipSpeed ×1.05/copy) raises the true attainable top speed, and wave 1's
   * ring capacity derives from the speed provisioned at creation — an
   * under-provisioned ring silently overwrites its oldest tail. When the new
   * top speed needs more capacity, the live samples replay into a bigger
   * fresh ring (stored samples already satisfy the cadence, so every append
   * is accepted verbatim, timestamps preserved). Never shrinks.
   */
  private reprovisionWake(ship: ShipRecord): void {
    const top = World.wakeTopSpeed(ship.stats);
    if (wakeCapacity(top, ship.wake.lifeMs) <= ship.wake.cap) return;
    const old = ship.wake;
    const fresh = createShipWake(ship.hullId, top);
    for (let n = 0; n < old.count; n++) {
      const i = (old.head + n) % old.cap;
      appendWakeSample(fresh, old.xs[i], old.ys[i], old.ts[i]);
    }
    ship.wake = fresh;
  }

  /** Record a running torpedo's wake sample (Story 4.12, amendment 196) —
   *  called from stepShells for every live `kind === 'torp'` shell. The
   *  ribbon is created lazily on the fish's first sampled tick. */
  private sampleTorpWake(shell: ShellState): void {
    let r = this.torpWakes.get(shell.id);
    if (r === undefined) {
      r = createTorpWake();
      this.torpWakes.set(shell.id, r);
    }
    appendWakeSample(r, shell.x, shell.y, this.now);
  }

  /** A spent torpedo's ribbon moves to the orphan store (amendment 200: the
   *  water outlives the weapon); an empty ribbon is dropped. No-op for gun
   *  shells (they never enter torpWakes). */
  private orphanTorpWake(id: string): void {
    const r = this.torpWakes.get(id);
    if (r === undefined) return;
    this.torpWakes.delete(id);
    if (pruneWake(r, this.now) > 0) this.orphanWakes.push(r);
  }

  /**
   * Storm damage: every alive hull strictly outside the LIVE ring (Story 3.1:
   * offset-center, phase-interpolated — boundary-inclusive-SAFE) bleeds
   * stormDps·dt HP in EVERY phase (kept fractional — hp is a float
   * internally). A storm kill routes through sinkShip with `by` undefined
   * (unattributed). Per RULING this emits NO per-tick dmg event (that would
   * spam ~20/s); the victim already receives its live hp every frame via
   * OwnShip.hp, and the client HP bar reads from you.hp, so it stays accurate.
   * No boom for storm ticks either.
   *
   * IT DELIBERATELY BYPASSES creditDamage, which is what makes "the storm never
   * refreshes an attacker's counter" STRUCTURAL rather than a restated rule: a
   * hull burning alone out here is not in a fight, so its attackers' claims on
   * its kill value still lapse. When the storm finishes it, payKillValue still
   * pays whatever counters are live, with the killer's guaranteed share unpaid.
   */
  private applyStorm(dt: number): void {
    if (this.zoneStartT === null || !this.damageEnabled) return;
    const ring = this.zoneLiveRing;
    const bite = CONFIG.zone.stormDps * dt;
    for (const ship of this.ships.values()) {
      if (!isAfloat(ship.lifecycle) || !isOutside(ship.state, ring.cx, ring.cy, ring.r)) continue;
      ship.hp -= bite;
      if (ship.hp <= 0) this.sinkShip(ship.id); // by=undefined — the storm has no killer
    }
  }

  /**
   * DAMAGE CONTROL regen (Eric rulings 2026-08-04) — applyStorm's structural
   * INVERSE: per-tick fractional hp against the same float, clamped, with NO
   * per-tick event (that would spam ~20/s; the owner already receives live
   * `hp` AND `repairHp` on every frame via OwnShip, so the HUD stays exact).
   *
   * The pool drains on the WALL CLOCK at the fixed rate regenHp/regenMs
   * (5 hp/s): `repairHp` decrements by the elapsed budget WHETHER OR NOT the hp
   * lands. Overflow past maxHp is therefore LOST, not banked — the ruled
   * behavior (a full-bar hull burns its pool for nothing), and the reason the
   * spend itself is guarded at full hp. Pools ADD but the rate NEVER changes,
   * so two heals run 10s at 5 hp/s rather than 5s at 10 hp/s: that property
   * lives entirely in `repairHp += regenHp` at spend time, not here.
   *
   * Only LIVING hulls tick — a wreck's pool is already zeroed by sinkShip, so
   * the afloat gate is belt-and-braces against a directed caller.
   *
   * TWO INDEPENDENT CHANNELS since 2026-08-23, drained side by side through one
   * payRepair: the PAID pool above at its fixed rate, and the FREE per-level
   * pool at its own `levelRepairRate` (pool ÷ levelRegenMs, set on grant). They
   * do not interact — a level heal landing on top of a menu heal changes
   * neither pool's rate, and each empties on its own clock.
   */
  private tickRepairs(dtMs: number): void {
    const dc = CONFIG.damageControl;
    const budget = (dc.regenHp / dc.regenMs) * dtMs;
    for (const ship of this.ships.values()) {
      if (!isAfloat(ship.lifecycle)) continue;
      if (ship.repairHp > 0) World.payRepair(ship, budget, false);
      if (ship.levelRepairHp > 0 && ship.levelRepairRate > 0) World.payRepair(ship, ship.levelRepairRate * dtMs, true);
    }
  }

  /** Drain ONE repair channel by its own wall-clock budget. The pool decrements
   *  WHETHER OR NOT the hp lands, so overflow past maxHp is lost rather than
   *  banked — the ruled behavior, and identical for both channels. */
  private static payRepair(ship: ShipRecord, budget: number, level: boolean): void {
    const pool = level ? ship.levelRepairHp : ship.repairHp;
    const paid = Math.min(budget, pool);
    if (level) {
      ship.levelRepairHp -= paid;
      // An emptied pool drops its rate, so a later grant is never paid out at a
      // stale one (the rate is always recomputed against the whole pool).
      if (ship.levelRepairHp <= 0) ship.levelRepairRate = 0;
    } else ship.repairHp -= paid;
    ship.hp = Math.min(ship.hp + paid, ship.stats.maxHp);
  }

  /** Zero BOTH repair channels and the free channel's rate. ONE helper for the
   *  three sites that end a hull's repair state (sink, redeploy, respawn), so a
   *  future channel cannot be added to one of them and forgotten in the others. */
  private static clearRepair(ship: ShipRecord): void {
    ship.repairHp = 0;
    ship.levelRepairHp = 0;
    ship.levelRepairRate = 0;
  }

  /** Alive hull silhouette polygons (post-move) that shells and mines test
   *  against this tick. DELIBERATELY EXCLUDES SINKING HULLS (Story 5.2,
   *  amendment 12): a hull in the window is not a collision subject — ordnance
   *  passes through rather than resolving a no-op hit, so damage on it is
   *  structurally impossible upstream of hitShip's guard (the perceivability
   *  seam makes it a visible TARGET; nothing makes it a HITTABLE one). Each
   *  ship's transformed verts are written into its own hullPoly scratch
   *  (transformPolygon reuses the array), so the 20Hz loop allocates only the
   *  small per-tick target list. */
  private aliveHulls(): HullTarget[] {
    const hulls: HullTarget[] = [];
    for (const ship of this.ships.values()) {
      if (!isAfloat(ship.lifecycle)) continue;
      const s = ship.state;
      transformPolygon(hullSilhouette(ship.hullId), s.x, s.y, s.heading, ship.hullPoly);
      hulls.push({ id: ship.id, poly: ship.hullPoly });
    }
    return hulls;
  }

  /** True iff `id` names a PvE fleet hull (Story 5.6). The ONE predicate the
   *  fleet-only rules key on — friendly-fire exclusion, the intel-disc
   *  denial set, the roster/kill accounting — so "is this a fleet ship" has a
   *  single answer and an absent record fails closed. */
  isFleetHull(id: string): boolean {
    const s = this.ships.get(id);
    return s !== undefined && roleIsFleetHull(s);
  }

  // -------------------------------------------------------------------------
  // PvE FLEET WAVES (Story 5.6, amendments 33/37)
  // -------------------------------------------------------------------------

  /**
   * THE WAVE SCHEDULER. Fires CONFIG.fleet.waves off the ZONE START clock —
   * the same anchor the chrome bar's T+ uses — while the match is live.
   *
   * The live gate is `zoneStartT !== null && damageEnabled`, byte-identical to
   * applyStorm's: in a room `damageEnabled` is true exactly in the active
   * phase, and a standalone World (unit tests, sandbox smokes) has to call
   * startZone() before anything arrives. Nothing in the codebase spawned a
   * ship mid-match before this (amendment 37).
   */
  private spawnFleetWaves(): void {
    if (this.zoneStartT === null || !this.damageEnabled) return;
    this.enqueueDueWaves(this.now - this.zoneStartT);
    this.placePendingFleets();
  }

  /** Enqueue every wave whose beat has passed. A WHILE, not an equality test:
   *  a slow/uneven tick must never step over a beat and delete its fleets. */
  private enqueueDueWaves(elapsed: number): void {
    const waves = CONFIG.fleet.waves;
    while (this.wavesFired < waves.length && elapsed >= waves[this.wavesFired].atMs) {
      for (let i = 0; i < waves[this.wavesFired].fleets; i += 1) this.pendingFleets.push({ retries: 0 });
      this.wavesFired += 1;
    }
  }

  /** Try to place every owed fleet this tick; those that cannot find an
   *  anchor OUTSIDE every captain's intel disc wait for the next tick until
   *  their retry budget runs out, then take the max-min point and LOG it. */
  private placePendingFleets(): void {
    if (this.pendingFleets.length === 0) return;
    const waiting: { retries: number }[] = [];
    for (const req of this.pendingFleets) {
      const anchor = this.fleetAnchor();
      if (anchor.fallback && req.retries < CONFIG.fleet.spawnRetryTicks) {
        req.retries += 1;
        waiting.push(req);
        continue;
      }
      if (anchor.fallback) {
        logWarn('fleet.spawnFallback', { tick: this.tick, retries: req.retries, x: Math.round(anchor.x), y: Math.round(anchor.y) });
      }
      this.spawnFleet(anchor);
    }
    this.pendingFleets = waiting;
  }

  /**
   * One anchor request against the CURRENT field: inside the live ring, clear
   * of land, outside EVERY captain's intel disc, farthest from everything
   * already afloat (fleet hulls included, so successive fleets spread out).
   *
   * The disc radius is the captain's EFFECTIVE `stats.radarRange`, not the
   * CONFIG base: a stacked intel build denies the area it actually sees.
   * Sampling stops `spreadU` short of the ring edge so the six hulls scatter
   * into water rather than into the storm — but that is now a BEST EFFORT that
   * `FLEET_ANCHOR_MIN_FRACTION` can override on a small ring. The hard
   * guarantee lives in `fleetOffset`, which tests live-ring containment per
   * hull; see its docblock for why the old two-constant arithmetic was retired.
   */
  private fleetAnchor(): FleetAnchor {
    const ring = this.zoneLiveRing;
    const occupied: Vec2[] = [];
    for (const s of this.ships.values()) {
      if (isAfloat(s.lifecycle)) occupied.push({ x: s.state.x, y: s.state.y });
    }
    const max = Math.max(ring.r - CONFIG.fleet.spreadU, ring.r * FLEET_ANCHOR_MIN_FRACTION);
    return pickFleetAnchor({ x: ring.cx, y: ring.cy }, max, this.map.islands, occupied, this.captainDiscs(), this.rng);
  }

  /** Every afloat PARTICIPANT's intel disc, at their EFFECTIVE `stats.radarRange`
   *  (a stacked intel build denies the area it actually sees). THE one
   *  derivation of the denied region: the anchor and the per-hull scatter both
   *  read it, so they can never disagree about where a fleet may appear.
   *
   *  KEYED ON THE PARTICIPANT READING (Story 6.3): the rule is "a hull that
   *  contests the match denies intel around itself" — a fleet may not
   *  materialize inside anyone's scope. A 6.4 AI captain has a scope and must
   *  deny like any other combatant; only fleet hulls deny nothing. */
  private captainDiscs(): IntelDisc[] {
    const denied: IntelDisc[] = [];
    for (const s of this.ships.values()) {
      if (!isAfloat(s.lifecycle) || !roleIsParticipant(s)) continue;
      denied.push({ x: s.state.x, y: s.state.y, r: s.stats.radarRange });
    }
    return denied;
  }

  /**
   * Spawn ONE group: the exact composition (`fleetHullIds()` — 1 large, 2
   * medium, 3 small in SIX hulls, largest first) scattered around `anchor`. Its
   * XP value is DERIVED by `fleetLevels()` and is deliberately not restated
   * here (epic-6 amendment 24 — no hardcoded level totals). Each hull's scatter
   * offset is ALSO its permanent formation station (FleetController.add), which
   * is what keeps the group travelling together at the spread the witness rule
   * was tuned against.
   */
  private spawnFleet(anchor: FleetAnchor): void {
    this.fleetSeq += 1;
    const fleetId = this.fleetSeq;
    const denied = this.captainDiscs(); // read ONCE: fleet hulls deny nothing
    const ring = this.zoneLiveRing; // read ONCE: the storm-containment bound
    for (const hullId of fleetHullIds()) {
      const offset = this.fleetOffset(anchor, denied, ring);
      this.fleetHullSeq += 1;
      const id = `fleet-${this.fleetHullSeq}`;
      // The name is the HULL's name, not a numbered roster identity (amendment
      // 39): fleet hulls hold no PlayerMeta row, and every client-side surface
      // reads `DRONE` off Contact.cls. Never `DRONE-07`.
      this.addShip(id, FLEET_SHIP_NAME, 'fleet', hullId, DEFAULT_HORN_ID, {
        x: anchor.x + offset.x,
        y: anchor.y + offset.y,
      });
      this.drones.add(id, fleetSizeOf(hullId), fleetId, offset);
    }
  }

  /**
   * One hull's scatter/station offset: uniform over a disc of
   * `CONFIG.fleet.spreadU`, rejecting land through the SAME clearance the spawn
   * ring demands (spawn.ts owns that math) AND rejecting any point inside a
   * captain's intel disc.
   *
   * THE INTEL TEST IS PER HULL, NOT ON THE ANCHOR (review gate, Story 5.6).
   * Amendment 36 constrains the ANCHOR to sit outside every captain's intel
   * disc, but the nine hulls then scatter up to `spreadU` (400u) from it — so
   * worst case a hull materialized 260u from a captain, INSIDE the 330u sight
   * bubble: exactly the visible pop-in the amendment exists to prevent.
   * Inflating the anchor's denied radius by `spreadU` instead was costed and
   * REJECTED: it takes the denied area per captain from ~1.37M u² to ~3.53M u²,
   * which at a full roster exceeds the map, so every wave would take the
   * max-min fallback and the rule would stop meaning anything. The FORMATION
   * deforms slightly instead — the wave never fails.
   *
   * The fallback ladder, in order: a land-clear-but-intel-dirty offset is only
   * REMEMBERED (`landOnly`), never preferred. When the anchor itself cleared
   * every disc (`fallback === false`) the anchor is intel-clear BY
   * CONSTRUCTION and wins over it, so on the nominal path no hull can ever
   * land in intel range. Only on the already-degraded fallback anchor (logged,
   * ratified by amendment 37) does `landOnly` ship — there neither option is
   * clear, and a spread fleet beats nine hulls stacked on one point.
   *
   * THE RING CLAMP IS NOW AN EXPLICIT TEST, NOT AN ARITHMETIC COINCIDENCE
   * (cycle 94, epic-6 amendment 24). This docblock used to claim offsets stayed
   * inside the storm ring because `fleetAnchor` subtracts `spreadU` from the
   * ring radius. That only held while `spreadU` was small relative to the
   * FLEET_ANCHOR_MIN_FRACTION floor: the floor bites whenever
   * `ring.r < spreadU / (1 - FLEET_ANCHOR_MIN_FRACTION)` — below 615u at the
   * old spreadU 400, below 769u at the current 500 — and at the 660u terminal
   * ring it permits an anchor at 231u scattering 500u, i.e. 731u from centre:
   * OUTSIDE the ring, in the storm. Two unrelated constants were holding a
   * safety property between them, so the property is now asserted directly.
   *
   * The ring test runs BEFORE `landOnly` is recorded, so the degraded fallback
   * offset is island-clear AND ring-clear too. The final `{0,0}` fallback is
   * the anchor itself, which `fleetAnchor` samples inside the ring by
   * construction.
   */
  private fleetOffset(anchor: FleetAnchor, denied: readonly IntelDisc[], ring: ZoneRing): Vec2 {
    let landOnly: Vec2 | null = null;
    for (let i = 0; i < FLEET_OFFSET_TRIES; i += 1) {
      const a = this.rng.float(0, TAU);
      const r = Math.sqrt(this.rng.next()) * CONFIG.fleet.spreadU; // sqrt => uniform
      const off = { x: Math.cos(a) * r, y: Math.sin(a) * r };
      const p = { x: anchor.x + off.x, y: anchor.y + off.y };
      if (islandClearance(p, this.map.islands) <= SPAWN_ISLAND_CLEARANCE) continue;
      if (isOutside(p, ring.cx, ring.cy, ring.r)) continue; // never spawn into the storm
      if (!insideIntelDisc(p, denied)) return off;
      landOnly ??= off;
    }
    if (!anchor.fallback) return { x: 0, y: 0 }; // the anchor cleared every disc
    return landOnly ?? { x: 0, y: 0 };
  }

  /** Advance every live ballistic; spent ones emit a boom (+ damage on a hit).
   *  THE one spent-shell path: remove it from flight, drop every observer's
   *  seen-memory, resolve its outcome into events/damage. The D1 back-dated
   *  spawn pre-step deliberately does NOT resolve outcomes (see preStepShell) —
   *  every projectile funnels through here, one tick after spawn at the
   *  earliest, so all shell damage resolves in exactly one place. */
  private stepShells(dt: number, aliveHulls: HullTarget[]): void {
    // RADAR BUOYS are ordinary collision subjects on every ordnance path
    // (Story 7-5 wave 2, R2.7 "destructible by anything that damages a ship"):
    // merged here ONCE per tick, so shell sweeps, interceptions, bursts and
    // the blasts resolved off `targets` all see them — while checkMineTriggers
    // (stepMines) keeps the pure hull snapshot and a buoy never TRIPS a mine.
    const hulls = this.withBuoyTargets(aliveHulls);
    let friendlyFree: HullTarget[] | undefined; // lazy, per-tick (see shellTargets)
    for (const [id, shell] of this.shells) {
      // FLEET SHIPS NEVER DAMAGE EACH OTHER (Story 5.6, amendment 36). The
      // amendment names burstVictims, but the exclusion is applied one level
      // UP — a fleet-owned shell simply does not see a friendly hull as a
      // collision subject at all. Excluding only at the burst leaves a
      // friendly hull INTERCEPTING the shell (contactDamage, and the shell
      // stops dead), which is the same rule broken by a different path: nine
      // hulls inside a 400u spread block each other's line constantly. One
      // filtered snapshot per tick, built only when a fleet shell is in
      // flight; captain shells keep the shared snapshot by reference.
      const targets = this.isFleetHull(shell.ownerId)
        ? (friendlyFree ??= hulls.filter((h) => !this.isFleetHull(h.id)))
        : hulls;
      const outcome = stepShell(shell, {
        islands: this.map.islands,
        hulls: targets,
        now: this.now,
        dt,
        mapRadius: this.map.radius,
      });
      // Torpedo wake sampling (Story 4.12): a RUNNING fish records its
      // post-step pose on the shared cadence — including the tick it spends,
      // so the ribbon reaches the detonation point. The torpedo ENTITY still
      // never paints; only its water does (amendment 196).
      if (shell.kind === 'torp') this.sampleTorpWake(shell);
      if (outcome.kind === 'travel') continue;
      this.shells.delete(id);
      this.forgetBallistic(id);
      // The spent fish's water outlives it (amendment 200) — detach, never drop.
      this.orphanTorpWake(id);
      this.resolveShell(shell, outcome, targets);
    }
  }

  /**
   * Resolve mines that tripped this tick (Story 1.8 blast rework): each trip
   * detonates as a BLAST — despawn, one boom at the mine point (hit = the
   * tripping ship, gated per observer by perception), full damage to EVERY
   * non-owner hull whose silhouette is within blastRadius. The trip ring is
   * the OWNER's effective triggerRadius (Story 2.8 — owner lookup at trigger
   * time; a vacated owner falls back to the CONFIG base).
   */
  private stepMines(hulls: HullTarget[]): void {
    // TRIPPING scans the PURE hull snapshot — a radar buoy never trips a mine
    // (it is not a hull, and remote minefield clearing is a mechanic nobody
    // ruled on) — while DETONATION resolves against the buoy-merged list, so
    // a blast still damages any buoy sitting inside it (R2.7).
    for (const { mine, victimId, captive } of checkMineTriggers(this.mines, hulls, this.now, this.mineTripRules())) {
      if (captive) this.launchCaptiveTorpedo(mine, victimId);
      else this.detonateMine(mine, this.withBuoyTargets(hulls), victimId);
    }
  }

  /** The per-owner trip policy for this tick's mines: effective trip ring, the
   *  CAPTIVE doctrine read, and the captive-only hostile gate — each an OWNER
   *  lookup with the vacated-owner CONFIG fallback, so an orphan mine keeps no
   *  dead build's numbers and no dead build's doctrine. */
  private mineTripRules(): MineTripRules {
    return {
      triggerRadius: (ownerId) => this.ships.get(ownerId)?.stats.mine.triggerRadius ?? CONFIG.mine.triggerRadius,
      captive: (ownerId) => this.laysCaptiveMines(ownerId),
      hostile: (ownerId, victimId) => this.isCaptiveMineHostile(ownerId, victimId),
    };
  }

  /**
   * Does this owner's field consist of CAPTIVE mines? THE single read of the
   * doctrine, with the vacated-owner CONFIG fallback (false) every other mine
   * lookup uses — the verb rides the OWNER's live stats, never a per-mine flag,
   * so a layer who fits CAPTIVE MINES converts the field already on the water.
   * Three call sites, all of them a carve-out for the same reason: the trip
   * (launch instead of blast), the burst (R2.18), and the chain (R2.18).
   */
  private laysCaptiveMines(ownerId: string): boolean {
    return this.ships.get(ownerId)?.stats.mine.captive ?? false;
  }

  /**
   * "HOSTILE" FOR A CAPTIVE MINE (Story 7-5 wave 2, R2.13 — Eric's ruling). An
   * enemy CAPTAIN OR BOT always is: they contest the match, and the mine's
   * owner is already excluded upstream. A FLEET DRONE is hostile ONLY while its
   * CURRENT acquired target is the mine's owner — read LIVE off the
   * FleetController's mind, never cached, so a drone that breaks off (target
   * lost, target sunk, aggro expired) becomes safe to sail past again in the
   * very next tick.
   *
   * THE GATE IS CAPTIVE-ONLY and must not be widened: ordinary and prop-fouling
   * mines still trip on ANY non-owner hull, drones included, and a mine hit
   * still causes no aggro (amendment 36, unchanged — see hitShip's `fromMine`).
   * A vanished victim is not hostile, so a mid-tick teardown cannot launch a
   * fish at nothing.
   */
  private isCaptiveMineHostile(ownerId: string, victimId: string): boolean {
    const victim = this.ships.get(victimId);
    if (victim === undefined) return false;
    if (!roleIsFleetHull(victim)) return true; // an enemy captain or bot
    return this.drones.isTargeting(victim.id, ownerId); // live aggro, nothing else
  }

  /**
   * A CAPTIVE MINE FIRES (R2.12/R2.14). The mine is EXPENDED — deleted first
   * (the consume-first discipline detonateMine established, so nothing can fire
   * it twice) — and launches ONE un-upgraded torpedo from its own point along
   * the lead solution against the tripping hull. No boom, no blast, no chain:
   * a captive mine never detonates on contact, so none of the detonation path
   * runs at all.
   *
   * THE FISH IS DODGEABLE, AND THAT IS THE DESIGN: it is a base-speed torpedo
   * fired at where the target WILL be if it holds course, computed by the same
   * lead solver the fleet gun uses (game/lead.ts). Turn and it misses.
   *
   * It carries the OWNER's effective MINE damage and MINE blast radius — read
   * again at detonation through the ordinary mine-blast path, which is what
   * makes PROP FOULING ride along when the layer holds both cards (Eric A1:
   * captive STACKS with prop fouling, and the torpedo's hit carries the foul).
   * A vacated owner falls back to the CONFIG bases exactly as a mine blast
   * does; a vanished VICTIM cannot happen here (the hostile gate refuses one).
   */
  private launchCaptiveTorpedo(mine: MineState, victimId: string): void {
    if (!this.mines.delete(mine.id)) return; // already spent this tick
    const victim = this.ships.get(victimId);
    if (victim === undefined) return;
    const { damage, blastRadius } = this.mineBlastParams(mine.ownerId);
    const vx = Math.cos(victim.state.heading) * victim.state.speed;
    const vy = Math.sin(victim.state.heading) * victim.state.speed;
    const led = leadIntercept(mine, victim.state, vx, vy, CONFIG.torpedo.speed);
    const dir = Math.atan2(led.y - mine.y, led.x - mine.x);
    this.spawnBallistic(captiveTorpedo(this.nextBallisticId(), mine, dir, this.now, { damage, blastRadius }));
  }

  /**
   * Detonate ONE mine — and its SAME-OWNER CHAIN (Story 2.8, amendment 46).
   * Each detonation: despawn, one boom at the mine point (`hit` = the tripping
   * ship on the FIRST mine only; chained mines and gun-shot detonations carry
   * NO victim id — the splash-boom convention), then the BLAST: every
   * non-owner hull whose silhouette is within the OWNER's effective
   * blastRadius takes the owner's effective mine damage through the hitShip
   * choke (victim-private dmg, kill credit; OWNER EXCLUDED — the universal AoE
   * convention; a VACATED owner's mine falls back to CONFIG bases, pinned).
   * PROP-FOULING (doctrine): victims of a fouling owner's blast get
   * slowedUntil refreshed (never stacked). CHAINS: every same-owner ARMED mine
   * whose CENTER lies within the detonation's blast radius detonates in the
   * same tick, cascading breadth-first with a visited set (bounded — each mine
   * detonates at most once; deletion makes re-entry impossible); enemy mines
   * NEVER sympathetically detonate.
   *
   * CONSUME-FIRST (Story 2.8 review, P6): the mine is deleted from the store
   * BEFORE its blast resolves, and every path into a detonation re-checks
   * existence via that delete. The `visited` set alone was not enough — two
   * mines within each other's blast can both trip in the SAME tick, so the
   * trigger loop (and the burst-detonation snapshot) hands us a mine an
   * earlier cascade already consumed; without the re-check it detonated twice
   * (two booms, double damage) from one trip.
   */
  private detonateMine(mine: MineState, hulls: readonly HullTarget[], trippedBy?: string): void {
    const queue: MineState[] = [mine];
    const visited = new Set<string>([mine.id]);
    let hit = trippedBy;
    while (queue.length > 0) {
      const m = queue.shift()!;
      // Consume-first re-check: a mine an earlier cascade already detonated is
      // gone from the store and must never detonate a second time.
      if (!this.mines.delete(m.id)) continue;
      this.pending.push(
        hit !== undefined
          ? { k: 'boom', id: m.id, hit, x: m.x, y: m.y }
          : { k: 'boom', id: m.id, x: m.x, y: m.y },
      );
      hit = undefined; // only the tripped mine's boom names the tripping ship
      const blastRadius = this.blastMine(m, hulls);
      this.chainMines(m, blastRadius, visited, queue);
    }
  }

  /** One mine's effective blast parameters: the OWNER's stats, or the CONFIG
   *  bases when the owner has VACATED (pinned — an orphan mine never keeps a
   *  dead build's numbers, and never fouls). */
  private mineBlastParams(ownerId: string): { damage: number; blastRadius: number; fouls: boolean } {
    const owner = this.ships.get(ownerId);
    if (owner === undefined) {
      return { damage: CONFIG.mine.damage, blastRadius: CONFIG.mine.blastRadius, fouls: false };
    }
    const mine = owner.stats.mine;
    return { damage: mine.damage, blastRadius: mine.blastRadius, fouls: mine.propFouling };
  }

  /** One mine's blast damage + prop-fouling debuff (owner-stats-driven with
   *  the vacated-owner CONFIG fallback). Returns the blast radius used.
   *  Story 4.3 (amendment 18): a detonation that RESOLVES ≥1 victim sends one
   *  self-private `hc` to the mine's OWNER at the MINE's position — a Mine
   *  Layer learning remotely that a trap sprung is the intended feature.
   *  Victim RESOLUTION, not dmg emission (the ready-room rule); a victimless
   *  detonation sends NOTHING (mines have no fall-of-shot — amendment 16). */
  private blastMine(m: MineState, hulls: readonly HullTarget[]): number {
    const { resolved, blastRadius } = this.applyMineBlast(m, m.ownerId, hulls);
    if (resolved > 0) this.emitHitCall(m.ownerId, m.x, m.y);
    return blastRadius;
  }

  /**
   * ONE MINE-STYLE BLAST at `at`, on `ownerId`'s effective mine numbers: full
   * damage to every non-owner hull silhouette inside the blast (owner excluded
   * — the universal AoE convention), plus the PROP FOULING slow when the owner
   * holds the doctrine. Returns how many hulls it RESOLVED and the radius used.
   *
   * Split out of blastMine (Story 7-5 wave 2) with the Hit Call left BEHIND on
   * purpose: the CAPTIVE MINE's torpedo detonates through here too (R2.14 — the
   * fish's hit carries the foul, because the foul is read off the owner's live
   * stats at detonation exactly as a mine's is), and its `hc` is already
   * emitted by resolveShell's interception branch. Amendment 17's "exactly one
   * `hc` per shell resolution" is what forbids a second one here.
   */
  private applyMineBlast(
    at: Vec2,
    ownerId: string,
    hulls: readonly HullTarget[],
  ): { resolved: number; blastRadius: number } {
    const { damage, blastRadius, fouls } = this.mineBlastParams(ownerId);
    let resolved = 0;
    for (const victimId of mineBlastVictims({ x: at.x, y: at.y, ownerId }, hulls, blastRadius)) {
      const victim = this.ships.get(victimId);
      // Per-victim re-check against the DELIBERATELY STALE `hulls` snapshot: a
      // hull sunk earlier this tick is still in it, and damage semantics live
      // in this re-check rather than in the snapshot (amendment 5).
      if (!victim || !isAfloat(victim.lifecycle)) {
        // A RADAR BUOY inside the blast is an ordinary victim (R2.7): damaged,
        // counted as resolved (the owner's `hc` is honest — something
        // connected), never fouled (no propeller) and never worth XP.
        if (!victim && this.hitBuoy(victimId, damage)) resolved += 1;
        continue;
      }
      resolved += 1;
      this.hitShip(victim, damage, ownerId, true); // MINE: no aggro (amendment 36)
      // PROP-FOULING: a fouling blast's victim is slowed — REFRESH (plain
      // assignment), never stack. Gated with damage (no fouling in the
      // damage-suppressed ready room).
      if (fouls && this.damageEnabled) victim.slowedUntil = this.now + CONFIG.mine.foulDurationMs;
    }
    return { resolved, blastRadius };
  }

  /** Queue the SAME-OWNER armed mines whose centers lie within `blastRadius`
   *  of detonating mine `m` (amendment 46 — enemy mines never chain). A CAPTIVE
   *  field chains nothing at all (R2.18). */
  private chainMines(m: MineState, blastRadius: number, visited: Set<string>, queue: MineState[]): void {
    const r2 = blastRadius * blastRadius;
    // R2.18 — a CAPTIVE field never propagates a chain either. The chain is
    // same-owner by construction, so one read answers for every candidate.
    if (this.laysCaptiveMines(m.ownerId)) return;
    for (const other of this.mines.values()) {
      if (visited.has(other.id) || other.ownerId !== m.ownerId || this.now < other.armedAt) continue;
      const dx = other.x - m.x;
      const dy = other.y - m.y;
      if (dx * dx + dy * dy <= r2) {
        visited.add(other.id);
        queue.push(other);
      }
    }
  }

  /** Drop a spent ballistic from every observer's seen set — and its homing
   *  track-direction memory (Story 2.8) — (no leaks, no growth). */
  private forgetBallistic(id: string): void {
    for (const ship of this.ships.values()) {
      ship.seenBallistics.delete(id);
      ship.torpDirs.delete(id);
    }
  }

  /**
   * Apply damage to a hull, emitting dmg (+ sink on death). THE phase guard:
   * while damage is suppressed (waiting/countdown target practice, finished
   * freeze) impacts still boom but no hp is lost — this early return is the
   * single choke for shell, torpedo, and mine damage alike.
   *
   * `fromMine` is REQUIRED at every call site and threaded EXPLICITLY (Story
   * 5.6, amendment 36): a mine hit gives a PvE fleet ship no bearing worth
   * closing on — its layer may be dead or 2000u away — so it must cause no
   * aggro, and the ordnance that caused a hit is knowable only here at the
   * caller. Inferring it downstream (from `byId`'s distance, from the absence
   * of a shell, from anything) would be a guess; a required parameter makes
   * every future damage path state its own answer.
   */
  private hitShip(victim: ShipRecord, amount: number, byId: string, fromMine: boolean): void {
    if (!this.damageEnabled) return;
    // A SINKING HULL CANNOT BE FINISHED OFF (Story 5.2, amendment 12): damage
    // landing inside the window is a NO-OP — no hp, no dmg event, no re-sink,
    // no change to the founder deadline. Load-bearing for correctness, not
    // only feel: a lethal second hit would otherwise drive sinkShip at a
    // `sinking` victim (its own guard also refuses — this is defense-in-depth
    // at the single damage choke, since every in-sim caller already re-checks
    // isAfloat per victim and aliveHulls() never offers a sinking silhouette
    // as a target; a directed caller is what this line actually stops).
    if (isSinking(victim.lifecycle)) return;
    // THE AGGRO SEAM (Story 5.6): a fleet hull that takes damage acquires its
    // attacker and runs the ONE-SHOT witness sweep. Fires BEFORE the hp is
    // applied, so a hull sunk by this very hit still propagates the fight to
    // the friends that saw it happen. onDamaged itself no-ops for a
    // non-fleet victim, a mine hit, and a fleet-on-fleet hit.
    this.drones.onDamaged(victim.id, byId, fromMine);
    // OVERKILL NEVER PAYS (Eric ruling 2026-08-22): *"if i do 50 damage to
    // someone with 1 HP left, i get 1 damage worth of XP"*. The claim-eligible
    // figure is the damage the hull could actually absorb, so it has to be read
    // BEFORE the hp is applied — afterwards the excess is only recoverable as a
    // negative hp, which is the same number arrived at less clearly.
    const dealt = Math.max(0, Math.min(amount, victim.hp));
    victim.hp -= amount;
    this.creditDamage(byId, victim.id, amount, dealt);
    this.pending.push({ k: 'dmg', id: victim.id, amount, hp: Math.max(0, victim.hp) });
    if (victim.hp <= 0) this.sinkShip(victim.id, byId);
  }

  /**
   * Accumulate damageDealt on the attacker (self-hits excluded; storm never
   * routes here), and note the contribution on the victim's assist ledger.
   *
   * TWO FIGURES, DELIBERATELY: `amount` is the FULL nominal damage of the blow
   * and is what `damageDealt` has always counted — it is the RESULTS-SCREEN
   * TALLY, not the economy, and the overkill ruling was about the economy;
   * `dealt` is the part the hull could actually absorb and is the only part
   * that earns a share. They differ only on an overkilling blow. `dealt` is
   * REQUIRED rather than defaulted to `amount` — a default would let a future
   * damage path silently opt back into paying for overkill by simply not
   * knowing about it, which is exactly the ruling this parameter enforces.
   */
  private creditDamage(byId: string, victimId: string, amount: number, dealt: number): void {
    if (byId === victimId) return;
    const attacker = this.ships.get(byId);
    if (attacker) attacker.damageDealt += amount;
    this.recordAssist(victimId, byId, dealt);
  }

  /**
   * Note one attacker's contribution on the VICTIM's assist ledger — the whole
   * of the rolling-counter model, in Eric's words (2026-08-23):
   *
   *   *"as long as i continue putting damage on the ship within 60s, it tracks
   *   all the damage i have done. If that 60s window expires, then it stops
   *   tracking my damage. When the ship is sunk, the xp reward is split
   *   proportionally to everyone who still had an active counter at that
   *   time."*
   *
   * So a lapsed counter RESTARTS FROM ZERO on the next hit — *"as if I had not
   * previously been in the battle"* — and that fires PER ATTACKER, even while
   * the fight rages on, because someone else keeping it alive does not keep
   * YOUR claim alive. One number does all three jobs (restart gap, eligibility
   * window, on-switch), which is why a second encounter-gap dial does not
   * exist: with gap = window, every-attacker-silent is exactly every-counter-
   * expired, so the encounter-level wipe is subsumed.
   *
   * Records the CLAMPED `dealt`, never the nominal blow, so a killing shot that
   * overkills by 300 does not buy its owner a 300-damage share.
   *
   * A FLEET attacker is never ledgered at all — it cannot accrue XP, so a share
   * for it would evaporate rather than redistribute. An attacker we cannot find
   * IS ledgered (a departed player's claim survives, exactly as a dead killer's
   * kill credit does); eligibleContributors drops it at payout if the hull is
   * really gone.
   *
   * The storm never routes through this seam (applyStorm bypasses creditDamage
   * entirely), which is what makes "the storm never refreshes a counter"
   * structural rather than a restated rule.
   */
  private recordAssist(victimId: string, byId: string, dealt: number): void {
    if (CONFIG.xp.assistWindowMs <= 0 || !(dealt > 0)) return;
    const victim = this.ships.get(victimId);
    if (victim === undefined) return;
    const attacker = this.ships.get(byId);
    if (attacker !== undefined && roleIsFleetHull(attacker)) return;
    const prev = victim.damageFrom.get(byId);
    if (prev === undefined || this.now - prev.at > CONFIG.xp.assistWindowMs) {
      victim.damageFrom.set(byId, { amount: dealt, at: this.now, buckets: [{ at: this.now, amount: dealt }] });
      return;
    }
    prev.amount += dealt;
    prev.at = this.now;
    World.addBucket(prev.buckets, dealt, this.now);
  }

  /** ms per assist bucket. 1 s against a 60 s window is ~1.7 % of boundary
   *  fuzz, and it is what keeps the history BOUNDED: incendiary DoT credits
   *  ~20 events a second, so exact per-event history would grow without limit
   *  in exactly the case that matters. */
  private static readonly ASSIST_BUCKET_MS = 1000;

  /** Add `dealt` to the newest bucket, opening a new one when it has aged out,
   *  and drop buckets that can no longer be inside any window. Bounded at
   *  window/bucket + 1 entries however long a fight runs. The history is
   *  MEASUREMENT SUBSTRATE ONLY (scripts/batchsim/encounterSpan.ts) — no payout
   *  path reads it; the payout reads `amount` and `at`. */
  private static addBucket(buckets: { at: number; amount: number }[], dealt: number, now: number): void {
    const last = buckets[buckets.length - 1];
    if (last !== undefined && now - last.at < World.ASSIST_BUCKET_MS) last.amount += dealt;
    else buckets.push({ at: now, amount: dealt });
    const cutoff = now - CONFIG.xp.assistWindowMs - World.ASSIST_BUCKET_MS;
    let drop = 0;
    while (drop < buckets.length && buckets[drop].at < cutoff) drop++;
    if (drop > 0) buckets.splice(0, drop);
  }

  /**
   * HIT CALL (Story 4.3, amendments 17/18): one self-private `hc` to the
   * ordnance OWNER at the connection point — ALL ordnance (gun, cannon, star
   * shells, torpedo, mines). Keyed off VICTIM RESOLUTION at every call site,
   * never off `dmg` emission, so target practice in the weapons-safe ready
   * room (damage suppressed) still gets its feedback. Carries NO severity
   * channel of any kind: no victim id, no amount, no kill flag, no hull
   * count. There is deliberately NO decoy-suppression code anywhere on the
   * paths into this: a buoy is not a collision subject, so a shot at one
   * structurally resolves no victim and produces `sp`, never `hc` — the
   * ratified oracle holds BY CONSTRUCTION.
   */
  private emitHitCall(ownerId: string, x: number, y: number): void {
    this.pending.push({ k: 'hc', id: ownerId, x, y });
  }

  /**
   * FALL OF SHOT (Story 4.3, amendment 16): one self-private `sp` to the
   * shooter at the true termination point of a shell that resolved NO victim.
   * GUN-FAMILY ONLY — the wire-kind predicate (`kind === 'shell'`) selects
   * gun + broadside + star shells and excludes 'torp' exactly: a torpedo that
   * misses or expires produces NOTHING (the quiet weapon), and mines never
   * route here at all. ONE PER SHELL, and every shell of a broadside barrage
   * is its own shell (R2.5) — a barrage that misses with three of five splashes
   * three times, which is the fall-of-shot readout bracket-and-walk needs.
   */
  private emitSplash(shell: ShellState, x: number, y: number): void {
    if (shell.kind !== 'shell') return; // gun family only (amendment 16)
    this.pending.push({ k: 'sp', id: shell.ownerId, x, y });
  }

  /** Turn a spent ballistic's outcome into its events, per the projectile's
   *  OWN hit rule (Story 1.4 seam): `burst` detonates at the target point;
   *  `hitShip` is an early interception OUTSIDE the blast — the interceptor
   *  takes the smaller contactDamage (torpedoes set contactDamage = damage, so
   *  their behavior is unchanged; a damageless star shell deals 0 and still
   *  lights its zone at the stop point — amendment 39); everything else is a
   *  plain splash boom. */
  private resolveShell(shell: ShellState, outcome: ShellOutcome, hulls: readonly HullTarget[]): void {
    if (outcome.kind === 'travel') return;
    if (outcome.kind === 'burst') {
      this.resolveBurst(shell, outcome, hulls);
      return;
    }
    if (outcome.kind !== 'hitShip') {
      this.pending.push({ k: 'boom', id: shell.id, x: outcome.x, y: outcome.y });
      // hitIsland / expired: a MISS — fall of shot to the shooter (Story 4.3;
      // gun family only — the guard lives in emitSplash).
      this.emitSplash(shell, outcome.x, outcome.y);
      return;
    }
    this.pending.push({ k: 'boom', id: shell.id, hit: outcome.victimId, x: outcome.x, y: outcome.y });
    // Early interception = a victim RESOLVED (Story 4.3, amendments 17/18):
    // one Hit Call at the impact point, all ordnance — deliberately NOT
    // derived from dmg emission, so the weapons-safe ready room still calls
    // hits (hitShip early-returns on !damageEnabled).
    this.emitHitCall(shell.ownerId, outcome.x, outcome.y);
    // A DAMAGELESS flare still lights where it stopped (Story 2.8, amendment
    // 39): an intercepted star shell spawns its zone at the interception point.
    if (shell.lit) this.spawnLitZone(shell, outcome);
    // THE CAPTIVE MINE'S TORPEDO (Story 7-5 wave 2, R2.12/R2.14) — the game's
    // one CONTACT-BLAST projectile: it detonates AT ITS IMPACT POINT for the
    // layer's MINE damage over the layer's MINE blast radius, carrying the PROP
    // FOULING slow when the layer holds that card too, instead of dealing plain
    // contact damage to the hull it touched. The struck hull is inside its own
    // blast by construction, so there is no double-dip to guard: this branch
    // RETURNS rather than falling through to the contact hit below. The one Hit
    // Call for this resolution was already emitted above (amendment 17), which
    // is why applyMineBlast deliberately does not emit one.
    if (contactBlastRadius(shell) > 0) {
      this.applyMineBlast(outcome, shell.ownerId, hulls);
      return;
    }
    if (shell.contactDamage <= 0) return; // zero-damage interception: boom only
    const victim = this.ships.get(outcome.victimId);
    if (!victim) {
      // A RADAR BUOY intercepted the shot (R2.7): it takes the interceptor's
      // contactDamage exactly as a hull would (the `hc` above already told
      // the shooter something connected). No XP, no feed line (hitBuoy).
      this.hitBuoy(outcome.victimId, shell.contactDamage);
      return;
    }
    if (!isAfloat(victim.lifecycle)) return;
    // EVERY SHELL THAT CONNECTS DEALS DAMAGE (Eric ruling 2026-08-05): a later
    // shell of the same multi-barrel click gets no discount here — it is its
    // own shell, and it connected. The one-hit-kill law governs a single SHELL,
    // not a single click (the same-click salvo ledger is deleted). `noAggro`
    // (the GUN BUOY's R2.21a tag) rides the fromMine seat: its rationale is
    // the mine exception's, verbatim.
    this.hitShip(victim, shell.contactDamage, shell.ownerId, shell.noAggro === true);
  }

  /**
   * Detonate a burst at the shell's target point: ONE burst event (the
   * server-internal `own` field drives owner-visibility in signals.ts and is
   * ALWAYS stripped by its materialize), then the shared burstVictims()
   * resolves every hull silhouette within the blast (owner excluded —
   * permanent owner immunity) and each victim takes the shell's full damage
   * through the hitShip choke: one victim-private dmg event per victim, kill
   * credit through the normal path, and no contact-damage double-dipping (a
   * burst outcome never also reports an interceptor).
   *
   * THE NO-DOUBLE-DIPPING RULE IS PER SHELL, AND ONLY PER SHELL (Eric ruling
   * 2026-08-05). One shell hits a given hull at most once — contact XOR burst.
   * ACROSS shells of one multi-barrel click there is no such rule: the fanned
   * bursts overlap at fighting range and a hull inside all three takes all
   * three applications. The Story 2.8 review's same-click salvo ledger, which
   * held a victim to one application per CLICK, is deleted — see guns.ts's
   * fireGunShells for why its premise (gun 25 vs a 70hp floor) dissolved in the
   * cycle-44 rebalance.
   */
  private resolveBurst(shell: ShellState, at: Vec2, hulls: readonly HullTarget[]): void {
    const burst: BurstSubject = { k: 'burst', id: shell.id, x: at.x, y: at.y, own: shell.ownerId };
    this.pending.push(burst);
    // A star shell's burst also lights its zone (Story 1.7): the server-
    // internal `lit` tag rides only star shells, so every other burster is
    // untouched. The burst-flash wire event above is the SAME 'burst' row —
    // no new GameEvent kind; the zone itself syncs contact-like as litZones.
    if (shell.lit) this.spawnLitZone(shell, at);
    // A zero-damage burst (the damageless star shell, amendment 39) resolves
    // no victims at all — no 0-hp dmg-event noise, structurally.
    let resolved = 0; // hulls the burst RESOLVED (Story 4.3 — counted ahead of
    // the damage-suppression phase guard inside hitShip, so the Hit Call keys
    // off resolution, not dmg: the weapons-safe ready room still calls hits).
    if (shell.damage > 0) {
      for (const victimId of burstVictims(at, shell.burstRadius, hulls, shell.ownerId)) {
        const victim = this.ships.get(victimId);
        if (!victim || !isAfloat(victim.lifecycle)) {
          // A RADAR BUOY inside the burst takes the shell's full damage like
          // any hull (R2.7) — resolved counts it, so the shooter's Hit Call
          // stays honest; no XP, no feed line, no dmg event (hitBuoy).
          if (!victim && this.hitBuoy(victimId, shell.damage)) resolved += 1;
          continue;
        }
        resolved += 1;
        // `noAggro` (the GUN BUOY's R2.21a tag) rides the fromMine seat here
        // exactly as on the contact path above.
        this.hitShip(victim, shell.damage, shell.ownerId, shell.noAggro === true);
      }
    }
    // Story 4.3: exactly one of hc/sp per shell resolution — a burst that
    // resolved ≥1 hull is a Hit Call at the burst point; one that resolved
    // none is fall of shot (a decoy buoy is not a collision subject, so a
    // shot centered on one lands HERE, in the splash branch, by construction).
    //
    // A DAMAGELESS FLARE BURSTING OVER A HULL EMITS `sp`, NEVER `hc` — and that
    // is deliberate, not an oversight in the `damage > 0` gate above. DO NOT
    // "fix" it by counting geometric victims for zero-damage shells: a star
    // shell cannot connect with anything (it damages nothing), so a Hit Call
    // there would be a lie — and worse, it would mint an unsanctioned detection
    // channel. A flare lobbed into fog would answer "is a hull within
    // burstRadius of this point?" directly, bypassing the lit zone + LOS that
    // is the flare's ONE sanctioned way to reveal a ship. The flare reports
    // where it fell; the zone it lights is what finds people.
    if (resolved > 0) this.emitHitCall(shell.ownerId, at.x, at.y);
    else this.emitSplash(shell, at.x, at.y);
    this.detonateMinesInBurst(shell, at, hulls);
  }

  /**
   * Click-your-own-minefield (Story 1.8, Eric ruling 2026-07-22): a shell
   * burst detonates the shell OWNER's own ARMED mines whose CENTER lies within
   * the burst radius — each resolving as a normal mine blast at the MINE's
   * position (owner-excluded damage, no-victim boom). Two hard gates, in
   * order: OWNER-ONLY (an enemy's burst never touches your field) and
   * ARMED-ONLY (armDelay keeps its anti-instant-bomb role — an unarmed mine is
   * immune). The detonation set is snapshotted from the SHELL burst alone
   * before any blast resolves; as of Story 2.8 (amendment 46) each detonation
   * then CASCADES same-owner through detonateMine's chain — a deliberate
   * change from the 1.8 no-cascade rule (deletion keeps every mine at most one
   * detonation).
   *
   * A CAPTIVE MINE CANNOT BE SELF-DETONATED (Story 7-5 wave 2, R2.18 — Eric
   * ruling 2026-08-19). It is excluded here outright: the burst passes over it
   * and the mine PERSISTS, armed and waiting. It does NOT blast and it does NOT
   * launch — R2.12 already made the torpedo its only attack, and this was the
   * last path by which a captive mine could produce a blast centred on its own
   * casing. After this there are none. The carve-out is CAPTIVE-ONLY and must
   * not be widened: ordinary and prop-fouling fields self-detonate exactly as
   * they always have (the same shape as R2.13's hostile gate).
   */
  private detonateMinesInBurst(shell: ShellState, at: Vec2, hulls: readonly HullTarget[]): void {
    if (this.laysCaptiveMines(shell.ownerId)) return; // R2.18 — the burst passes over
    const detonating: MineState[] = [];
    const r2 = shell.burstRadius * shell.burstRadius;
    for (const mine of this.mines.values()) {
      if (mine.ownerId !== shell.ownerId || this.now < mine.armedAt) continue;
      const dx = mine.x - at.x;
      const dy = mine.y - at.y;
      if (dx * dx + dy * dy <= r2) detonating.push(mine);
    }
    for (const mine of detonating) this.detonateMine(mine, hulls);
  }

  /** Spawn a lit zone where a star shell stopped (burst point, or the
   *  interception stop point — amendment 39's damageless flare always lights).
   *  The two doctrine verbs are read INDEPENDENTLY off the OWNER's stats at
   *  spawn time (owner lookup; a vacated owner falls back to both-false — the
   *  CONFIG-base rule, pinned), so a firer holding BOTH stamps a zone that
   *  burns and blinds. */
  private spawnLitZone(shell: ShellState, at: Vec2): void {
    const id = this.nextLitZoneId();
    const stars = this.ships.get(shell.ownerId)?.stats.starShells;
    this.litZones.set(id, {
      id,
      ownerId: shell.ownerId,
      x: at.x,
      y: at.y,
      r: shell.lit!.radius,
      until: this.now + shell.lit!.durationMs,
      phosphor: stars?.phosphor ?? false,
      dazzle: stars?.dazzle ?? false,
    });
  }

  /**
   * Star-shell DOCTRINE zone effects (Story 2.8), once per tick over post-move
   * centers: INCENDIARY zones burn every non-owner alive hull whose CENTER is
   * inside — incendiaryDps integrated per tick through the burnShip choke
   * (kill credit to the zone owner), at most once per (owner, victim) pair per
   * tick no matter how many of that owner's zones overlap; DAZZLE zones
   * refresh the victim's dazzledUntil mark (perception shrinks the DAZZLED
   * observer's own sight; non-dazzled observers untouched).
   *
   * ALL of it is gated on damageEnabled (Story 2.8 review, P9): dazzle is a
   * HOSTILE effect like the burn, so the weapons-safe ready room must not
   * blind anyone. One flag, one policy — a flare fired in the ready room
   * lights the water and nothing else.
   *
   * DoT WIRE CADENCE (Story 2.8 review, P4): hp application stays EXACTLY
   * per-tick (sim math unchanged, kill timing unchanged), but the victim-
   * private `dmg` EVENT is aggregated per (zone owner, victim) into
   * DOT_EVENT_WINDOW_MS windows — a 20/s fractional-damage event stream is
   * wire noise and strobes client hit feedback. Nothing is ever unreported:
   * a pair that stopped burning this tick (zone expired, victim left, victim
   * died) flushes immediately below, and a lethal bite flushes inside burnShip
   * before the sink.
   */
  private applyZoneEffects(dt: number): void {
    if (!this.damageEnabled) return; // ready-room flares never burn OR dazzle
    const bite = CONFIG.starShells.incendiaryDps * dt;
    const burning = new Set<string>();
    for (const ship of this.ships.values()) {
      if (!isAfloat(ship.lifecycle)) continue;
      for (const ownerId of this.markZoneEffects(ship)) {
        if (!isAfloat(ship.lifecycle)) break; // a mid-loop sink stops further burns
        burning.add(dotKey(ownerId, ship.id));
        this.burnShip(ship, bite, ownerId);
      }
    }
    // Every pair that did NOT burn this tick has stopped burning: flush its
    // remainder now so no applied damage is ever left unreported.
    for (const key of [...this.dotBuckets.keys()]) {
      if (!burning.has(key)) this.flushDot(key);
    }
  }

  /**
   * One tick of incendiary DoT: hp/credit/sink exactly like hitShip, but the
   * `dmg` EVENT is accumulated into this (owner, victim) pair's window bucket
   * instead of emitted per tick (see applyZoneEffects). A bite that SINKS the
   * victim flushes the bucket first, so the victim's last dmg event lands
   * before its `sunk` — the ordering the non-DoT path already guarantees.
   */
  private burnShip(victim: ShipRecord, amount: number, ownerId: string): void {
    // A SINKING HULL CANNOT BE FINISHED OFF (Story 5.2, amendment 12) — the
    // DoT choke gets the same guard as hitShip: applyZoneEffects already
    // filters and mid-loop-breaks on isAfloat, so in-sim this is unreachable,
    // but a directed caller must not be able to burn hp off a hull already at
    // 0 or nudge sinkShip at a sinking victim.
    if (isSinking(victim.lifecycle)) return;
    // The overkill clamp applies to the DoT path too (hitShip's rule at the
    // second call site): a burn tick that finishes a hull claims only the hp it
    // actually took.
    const dealt = Math.max(0, Math.min(amount, victim.hp));
    victim.hp -= amount;
    this.creditDamage(ownerId, victim.id, amount, dealt);
    const key = dotKey(ownerId, victim.id);
    const bucket = this.dotBuckets.get(key);
    if (bucket === undefined) this.dotBuckets.set(key, { victimId: victim.id, amount, since: this.now });
    else bucket.amount += amount;
    if (victim.hp <= 0) {
      this.flushDot(key);
      this.sinkShip(victim.id, ownerId);
      return;
    }
    const open = this.dotBuckets.get(key)!;
    if (this.now - open.since >= DOT_EVENT_WINDOW_MS) this.flushDot(key);
  }

  /** Emit one aggregated victim-private `dmg` for a DoT bucket and drop it.
   *  `hp` reports the victim's CURRENT hp (already applied per tick), so the
   *  client's hp mirror is exact at flush time. */
  private flushDot(key: string): void {
    const bucket = this.dotBuckets.get(key);
    if (bucket === undefined) return;
    this.dotBuckets.delete(key);
    const victim = this.ships.get(bucket.victimId);
    if (victim === undefined || bucket.amount <= 0) return;
    this.pending.push({ k: 'dmg', id: bucket.victimId, amount: bucket.amount, hp: Math.max(0, victim.hp) });
  }

  /** The per-ship zone scan: refresh the dazzle mark for every covering
   *  non-owned DAZZLE zone and collect the owners of covering PHOSPHOR zones
   *  (deduped — at most one burn per owner per tick).
   *
   *  THE TWO VERBS ARE INDEPENDENT CHECKS, NOT AN if/else (Story 7-5 wave 1):
   *  a firer holding both cards stamps a zone that is phosphor AND dazzle, and
   *  that zone must BOTH burn and blind. The pre-7-5 chain (`if dazzle … else
   *  if incendiary …`) structurally could not say that. */
  private markZoneEffects(ship: ShipRecord): Set<string> {
    const burnedBy = new Set<string>();
    for (const zone of this.litZones.values()) {
      if (zone.ownerId === ship.id) continue; // own zones never burn or dazzle you
      const dx = ship.state.x - zone.x;
      const dy = ship.state.y - zone.y;
      if (dx * dx + dy * dy > zone.r * zone.r) continue;
      if (zone.dazzle) ship.dazzledUntil = this.now + DAZZLE_GRACE_MS;
      if (zone.phosphor) burnedBy.add(zone.ownerId);
    }
    return burnedBy;
  }

  /** Drop every lit zone whose lifetime has elapsed (natural expiry — the ONLY
   *  way a zone dies: no per-ship state, owner death never clears it). */
  private expireLitZones(): void {
    for (const [id, zone] of this.litZones) {
      if (this.now >= zone.until) this.litZones.delete(id);
    }
  }

  /**
   * Tick EVERY fitted slot's equipment for every ship (regardless of selection
   * — a weapon reloads while another is in use; empty slots are skipped), then
   * route this tick's clicks to the slot each click names (input.slot; 0 = the
   * gun, the permanently-selected default — a primed skillshot click carries
   * its slot) through the single sinking-activation gate. One shot per click:
   * a fireSeq newer than lastFireSeq is one pending click, and it is ALWAYS
   * consumed this tick (even dead or denied), so clicks during reload are
   * consumed, not queued. Story 2.1: EVERY accepted input's click intent is
   * evaluated, in seq order, from the drained tickIntents queue — two clicks
   * landing inside one tick both fire (or get their own wire denial) with each
   * click's OWN aim/aimDist/fireT, instead of latest-wins swallowing the older
   * press. The queue holds EVERY accepted input (INTENT_QUEUE_CAP ===
   * INPUT_RATE_CAP, so a jitter burst can never overflow it); the trailing
   * latest-input pass remains ONLY for the direct-assignment (test) path that
   * writes ship.input without going through the store, and the lastFireSeq
   * max-advance keeps it a no-op whenever the queue already covered the press.
   * Equipment reaches the World only through the narrow
   * ActivationContext (spawn ballistics / drop mines).
   */
  private fireControl(dtMs: number): void {
    for (const ship of this.ships.values()) {
      for (const slot of ship.loadout) {
        if (slot.equipmentId !== null) EQUIPMENT[slot.equipmentId].tick(ship, slot, dtMs);
      }
      for (const intent of ship.tickIntents) this.consumeClick(ship, intent);
      this.consumeClick(ship, ship.input);
    }
  }

  /**
   * Evaluate ONE accepted input's click intent (fireSeq monotonic grammar).
   * Consumption is unconditional — lastFireSeq advances even dead or denied —
   * and each press is evaluated at most once (a later duplicate reads stale).
   */
  private consumeClick(ship: ShipRecord, input: InputMsg): void {
    const clicked = input.fireSeq > ship.lastFireSeq;
    ship.lastFireSeq = Math.max(ship.lastFireSeq, input.fireSeq);
    // Afloat OR SINKING (Story 5.2 weapons seam, amendments 10/15): every
    // weapon stays live for the whole window — the guns are the point of the
    // dying captain's beat. Only a hull whose life is over is skipped.
    if ((!isAfloat(ship.lifecycle) && !isSinking(ship.lifecycle)) || !clicked) return;
    // The CLICK channel dispatches WEAPONS ONLY — the mirror of
    // activationControl's ability wall (Story 1.6). A forged click naming an
    // ability or empty slot (e.g. a TB's speedBoost in slot 2) is silently
    // inert: abilities activate via actSeq, and letting a click reach
    // boostEquipment.activate would burn the charge AND stamp lastFireT off
    // the wrong channel. An out-of-range/empty slot is inert here too (it was
    // an 'empty-slot' gate denial before — same no-op, no lastFireT).
    const id = fittedEquipment(ship.loadout, input.slot);
    if (id === null || !EQUIPMENT_IS_WEAPON[id]) return;
    // D1: validate the click's claimed fire time BEFORE activation. The clamp
    // is the trust boundary (never earlier than now - min(RTT+jitter, ceiling),
    // never before the previous ACCEPTED fire time).
    const fireT = clampFireTime({
      claimed: input.fireT,
      now: this.now,
      rttMs: ship.rttMs,
      jitterMs: CONFIG.net.fireJitterAllowanceMs,
      ceilingMs: CONFIG.net.fireBackdateCeilingMs,
      prevFireT: ship.lastFireT,
    });
    // Equipment rows read aim/aimDist/slot off ship.input — evaluate this
    // press under ITS OWN input so an older click keeps its own aim point.
    const result = this.withInput(ship, input, () => this.sinkingActivationGate(ship, input.slot, fireT));
    // Only a SUCCESSFUL activation consumes fire-time monotonicity — a denial
    // (empty pool, empty slot) must not floor a later honest back-date.
    if (result.ok) ship.lastFireT = fireT;
    // A refused click becomes a SELF-PRIVATE wire denial (Story 1.10): the
    // press identity is the click's fireSeq, so the client's predicted
    // denial (if any) dedups the echo and a stale-ammo race is surfaced
    // late-but-explicit instead of silently swallowed.
    else this.queueDenial(ship, input.slot, input.fireSeq, result.reason, 'weapon');
  }

  /** Run `fn` with `input` temporarily installed as the ship's live input
   *  (equipment rows read aim fields off ship.input); always restores the
   *  latest input so kinematics stay latest-wins after fire control. */
  private withInput<T>(ship: ShipRecord, input: InputMsg, fn: () => T): T {
    const latest = ship.input;
    ship.input = input;
    try {
      return fn();
    } finally {
      ship.input = latest;
    }
  }

  /**
   * Ability-activation control (Story 1.6) — the actSeq sibling of fireControl,
   * same monotonic grammar. A stored actSeq newer than lastActSeq is ONE pending
   * activation; lastActSeq advances EVERY tick (even dead or inert, exactly like
   * lastFireSeq), so a stale counter never re-reads as a fresh press. It targets
   * ABILITIES ONLY: the slot named by input.actSlot activates through the single
   * sinking gate iff it holds non-weapon equipment (EQUIPMENT_IS_WEAPON[id] ===
   * false). A weapon or empty/out-of-range slot is silently inert — weapons fire
   * via fireSeq + a click, never actSeq, so the two counters never race within a
   * tick. Ability activation is NOT latency-compensated: the gate runs at `now`
   * (the default fireT), so the boost window opens at server apply time.
   * Story 2.1: every accepted input's press intent is evaluated in seq order
   * (tickIntents), so two presses coalescing into one tick both activate or
   * get their own wire denial; the queue holds every accepted input
   * (INTENT_QUEUE_CAP === INPUT_RATE_CAP — no overflow), so the trailing
   * latest-input pass is the direct-assignment (test) backstop only, a no-op
   * when the queue already covered the press.
   */
  private activationControl(): void {
    for (const ship of this.ships.values()) {
      for (const intent of ship.tickIntents) this.consumePress(ship, intent);
      this.consumePress(ship, ship.input);
    }
  }

  /** Evaluate ONE accepted input's ability-press intent (actSeq grammar) —
   *  the consumeClick sibling; same unconditional consumption + at-most-once
   *  evaluation. */
  private consumePress(ship: ShipRecord, input: InputMsg): void {
    const activated = input.actSeq > ship.lastActSeq;
    ship.lastActSeq = Math.max(ship.lastActSeq, input.actSeq);
    // Afloat OR SINKING (Story 5.2 weapons seam, amendments 10/15): abilities
    // meet the fitment criterion — "it is in a ship equipment slot" — so
    // speedBoost's doomed surge and the decoy drop stay live while sinking.
    if ((!isAfloat(ship.lifecycle) && !isSinking(ship.lifecycle)) || !activated) return;
    // actSeq targets ABILITIES only: a weapon or empty slot is a no-op (no
    // state change), so a forged actSeq on a gun/torpedo slot fires nothing —
    // the mirror of fireControl's weapon-only wall.
    const id = fittedEquipment(ship.loadout, input.actSlot);
    if (id === null || EQUIPMENT_IS_WEAPON[id]) return;
    const result = this.withInput(ship, input, () => this.sinkingActivationGate(ship, input.actSlot));
    // A refused press becomes a SELF-PRIVATE wire denial (Story 1.10) keyed
    // on the press's actSeq — this is what makes the within-RTT double
    // press (stale client predicts READY, server refuses) audible at last.
    if (!result.ok) this.queueDenial(ship, input.actSlot, input.actSeq, result.reason, 'ability');
  }

  /**
   * Foghorn control (Story 4.5) — the hornSeq sibling of activationControl,
   * same intent-queue walk: every accepted input's honk intent is evaluated in
   * seq order (tickIntents), then the stored latest input as the direct-
   * assignment (test) backstop, so a press coalesced into a busy tick is never
   * silently swallowed.
   */
  private hornControl(): void {
    for (const ship of this.ships.values()) {
      for (const intent of ship.tickIntents) this.consumeHonk(ship, intent);
      this.consumeHonk(ship, ship.input);
    }
  }

  /**
   * Evaluate ONE accepted input's honk intent (hornSeq grammar) — the
   * consumePress sibling: unconditional consumption (lastHornSeq advances
   * even dead, droned, or on cooldown, so a stale/replayed counter never
   * re-reads as a fresh press) + at-most-once evaluation. An eligible press
   * emits ONE `fh` SUBJECT into pending — {k,h,x,y,id}, the ship's true
   * current position and id, which the signals.ts foghorn row consumes to
   * compute each observer's bearing/tier and NEVER forwards (materialize
   * builds a fresh per-observer payload; x/y reach spectators only, id
   * reaches no one) — and arms the cooldown. An early or ineligible press
   * (dead, drone, inside cooldownMs) is consumed and silently dropped,
   * exactly as malformed input is: no denial, no event, no state beyond the
   * counter.
   */
  private consumeHonk(ship: ShipRecord, input: InputMsg): void {
    const pressed = input.hornSeq > ship.lastHornSeq;
    ship.lastHornSeq = Math.max(ship.lastHornSeq, input.hornSeq);
    // Afloat OR SINKING (Story 5.2, amendment 10 — "Weapons and equipment
    // only. And foghorn."): the horn is named alongside the slots, so a
    // sinking captain keeps the last word.
    // Fleet hulls never honk (they emit hornSeq 0 forever; this is the
    // backstop). ECONOMY/CONTENT reading, not the participant one — a hull
    // driven through the input pipeline may legitimately sound its horn.
    if (!pressed || (!isAfloat(ship.lifecycle) && !isSinking(ship.lifecycle)) || roleIsFleetHull(ship) || this.now < ship.nextHonkAt) return;
    ship.nextHonkAt = this.now + CONFIG.foghorn.cooldownMs;
    this.pending.push({ k: 'fh', h: ship.horn, x: ship.state.x, y: ship.state.y, id: ship.id });
  }

  /**
   * THE sinking-activation gate — the ONLY call path to Equipment.activate()
   * anywhere. Takes the SELECTED slot INDEX and resolves the slot on THIS
   * ship internally, so a caller can never hand it ship A plus ship B's slot
   * object (a cross-ship aliasing hazard that would fire from A while draining
   * B's pool).
   *
   * THE SINKING POLICY IS CLOSED (Story 5.2, amendment 10 — the TBD this gate
   * carried since Epic 1): NO RESTRICTION AT THE GATE. The ratified criterion
   * is FITMENT, not category — "it is in a ship equipment slot so it meets
   * criteria for usability" — so all seven registry rows (gun, torpedo, mine,
   * broadside, starShells, speedBoost, radarBuoy) activate while SINKING exactly
   * as when alive, and a future row is in by default rather than needing a
   * ruling. What a sinking captain loses is the ECONOMY — the upgrade menu,
   * picks and the heal — which never routed through this gate at all (that
   * block lives in spendPoint: "once sinking, you're done"). Only a hull
   * whose life is OVER is refused ('dead'): defense-in-depth on a public seam
   * (fireControl/activationControl already skip the sunk). An empty or
   * out-of-range slot is answered here (empty-slot denial, no dereference) so
   * rows never see one. Public so directed tests can drive activation and
   * read the ActivationResult (never on the wire).
   */
  sinkingActivationGate(
    ship: ShipRecord,
    slotIndex: number,
    fireT: number = this.now,
  ): ActivationResult {
    // THE WEAPONS LOCK (Story 6.1, amendment 8) sits at the TOP of the one call
    // path to Equipment.activate(), so a boarding room has no second seam to
    // forget: weapons, abilities and mine drops alike are refused before any
    // row is dispatched, before a pool is touched and before a reload is armed.
    // 'frozen' never reaches the wire (wireDenialReason maps it to null, like
    // the gate's other two refusals) — a locked helm and a dark HUD already say
    // the start line is held; a denial klaxon per click would be noise.
    if (!this.weaponsEnabled) return { ok: false, reason: 'frozen' };
    if (!isAfloat(ship.lifecycle) && !isSinking(ship.lifecycle)) return { ok: false, reason: 'dead' };
    const slot = ship.loadout[slotIndex];
    if (!slot || slot.equipmentId === null) return { ok: false, reason: 'empty-slot' };
    return EQUIPMENT[slot.equipmentId].activate(this.activationContext(ship, fireT), slot);
  }

  /** The capabilities equipment needs to activate for this ship this tick.
   *  `fireT` is the VALIDATED fire time (clampFireTime — never earlier than
   *  the allowance permits, defaulting to `now` for directed callers). */
  private activationContext(ship: ShipRecord, fireT: number = this.now): ActivationContext {
    return {
      ship,
      now: this.now,
      fireT,
      mapRadius: this.map.radius,
      islands: this.map.islands,
      mkId: () => this.nextBallisticId(),
      spawnBallistic: (shell, opts) => this.spawnBallistic(shell, opts?.perShellFlash === true),
      dropMine: (x, y) => this.spawnMine(ship, x, y, fireT),
      // R2.7 — the buoy's placement capability, the dropMine sibling. Life,
      // hp and radar set read off the OWNER's effective stats at drop.
      dropBuoy: (x, y) => this.spawnBuoy(ship, x, y, fireT),
      // R2.15 — keyed on the ACTIVATING ship, which is what makes the star-shell
      // gun reach OWN-FLARES-ONLY: a row cannot ask about anyone else's zones.
      ownLitZones: () => this.ownLiveLitZones(ship.id),
    };
  }

  /**
   * THE STAR-SHELL GUN REACH INPUT (Story 7-5 wave 2, R2.15): the lit zones
   * owned by `ownerId` that are still LIVE, reduced to centre+radius circles.
   * Live means not yet expired — tested explicitly against `now` rather than
   * trusting the store, because expireLitZones runs at the END of the tick and
   * a zone whose `until` fell this tick must not license a shot for one last
   * frame.
   *
   * BOTH filters live here and nowhere else: the shared predicate
   * (`@salvo/shared` `gunReachU`, which owns the containment + range rule for
   * server AND client alike) receives circles with no owner and no expiry, so
   * it CANNOT lend a row someone else's light or a dead flare's. The membership
   * test it then runs is the same centre-distance test markZoneEffects uses, so
   * the water a flare licenses you to shoot into is exactly the water it burns
   * and blinds in.
   */
  private ownLiveLitZones(ownerId: string): LitCircle[] {
    const out: LitCircle[] = [];
    for (const zone of this.litZones.values()) {
      if (zone.ownerId !== ownerId || this.now >= zone.until) continue;
      out.push({ x: zone.x, y: zone.y, r: zone.r });
    }
    return out;
  }

  /**
   * Store a newly-fired ballistic + queue its world-tick event. NOTE: the
   * queued tick event never reaches the wire — signals.ts drops ownerless tick
   * shell/torp events by design; clients learn of a projectile through
   * perception.ballisticScan, which reveals each LIVE shell per observer at
   * its CURRENT position with t = reveal time. D1: a back-dated shot
   * (bornAt < now) is PRE-STEPPED along its real trajectory this tick (see
   * preStepShell), so the back-date manifests on the wire as the shell being
   * revealed further along its flight — exactly AR3's "materializes slightly
   * ahead of the muzzle".
   */
  private spawnBallistic(shell: ShellState, perShellFlash = false): void {
    // MUZZLE FLASH (Story 4.3) — emitted BEFORE the D1 pre-step below runs,
    // while (shell.x, shell.y) is still the TRUE MUZZLE (the pre-pre-step
    // origin). This is the Epic 1 D1 latency mask: the flash marks the hull
    // the shell left, while the back-dated shell materializes further along
    // its flight. NEVER compute a flash from a reveal point — that is the
    // exact anti-cheat leak the Story 1.5 review closed.
    this.emitMuzzleFlash(shell, perShellFlash);
    this.shells.set(shell.id, shell);
    this.pending.push(this.ballisticEvent(shell));
    if (shell.bornAt < this.now) this.preStepShell(shell);
  }

  /**
   * One `mz` per owner per tick for GUN-FAMILY spawns only (Story 4.3,
   * amendments 19/20): the wire-kind predicate `kind === 'shell'` selects gun
   * + broadside + star shells and excludes 'torp' exactly — torpedoes are the
   * ratified quiet weapon, and no per-weapon flash table exists for a weapon
   * identity to leak through. Mines never call spawnBallistic at all. The
   * event carries position ONLY — no shooter id for anyone, including the
   * shooter (amendment 19).
   *
   * THE DEDUPE IS PER TICK PER OWNER, NOT PER SALVO — say it precisely, because
   * the two differ. Its headline job is collapsing a multi-barrel gun salvo's N
   * shells into ONE flash (per-shell flashes would leak the barrel count, a
   * build tell the wire deliberately does not carry). But it ALSO collapses two
   * SEPARATE gun-family launches by the same ship in one 50ms tick — a gun
   * click and a star-shell click coalesced by `tickIntents` — into a single
   * flash. That is intended and costs nothing: both muzzles are on the same
   * hull at the same tick, so the second flash would draw on top of the first,
   * and emitting two would tell an observer the ship fired twice, which is a
   * weapon-activity tell amendment 19 keeps off this row.
   *
   * `perShellFlash` IS THE ONE DECLARED OPT-OUT, and it is the BROADSIDE
   * BARRAGE's (Story 7-5 wave 2, R2.5 — Eric A2): every shell of a barrage
   * emits its OWN mz, so a 5-turret broadside lights five muzzles along the
   * engaged beam rather than one. That deliberately discloses the turret count
   * to anyone inside the flash halo, which is the ruling: the barrage IS the
   * spectacle, and the row still carries no shooter id, no hue and no weapon
   * type. A per-shell spawn neither reads nor writes the per-owner set, so a
   * gun click in the same tick still gets its own single flash.
   */
  private emitMuzzleFlash(shell: ShellState, perShellFlash: boolean): void {
    if (shell.kind !== 'shell') return; // gun family only — the wire kind IS the predicate
    if (!perShellFlash) {
      if (this.mzOwnersThisTick.has(shell.ownerId)) return; // per tick per owner (see above)
      this.mzOwnersThisTick.add(shell.ownerId);
    }
    this.pending.push({ k: 'mz', x: shell.x, y: shell.y });
  }

  /**
   * Fly a back-dated shell forward by (now − bornAt) on its spawn tick, in
   * sub-steps of ≤ one sim tick, each through the SAME shared stepShell against
   * CURRENT alive hulls + islands + map edge (live state — deliberately NO
   * rewind: a hull that has since ducked behind an island blocks the shot, "the
   * shooter's claim is honored in time, the world is honored in space").
   *
   * A non-travel outcome is NOT resolved here: pre-stepping stops and the
   * shell is left alive at the position stepShell left it (the terminal
   * point); the NEXT tick's normal stepShells sweep re-steps it there and
   * resolves the burst / interception / island stop / expiry against then-live
   * hulls. Consequences: every projectile survives its spawn tick, so the
   * perception ballisticScan reveal invariant ("shell event, then burst")
   * holds for ALL shots including maximally-compensated point-blank ones (the
   * same one-tick-deferred semantics as the 1.4 muzzleOrTarget point-blank
   * precedent) — and no damage ever resolves inside fireControl, so same-tick
   * mutual fire can never depend on ships-map iteration order.
   */
  private preStepShell(shell: ShellState): void {
    const hulls = this.withBuoyTargets(this.aliveHulls()); // buoys intercept back-dated shots too
    let remainingMs = this.now - shell.bornAt;
    while (remainingMs > 0) {
      const dtMs = Math.min(remainingMs, CONFIG.tick.simDtMs);
      remainingMs -= dtMs;
      const outcome = stepShell(shell, {
        islands: this.map.islands,
        hulls,
        now: this.now,
        dt: dtMs / 1000,
        mapRadius: this.map.radius,
      });
      if (outcome.kind !== 'travel') return; // terminal: defer to next tick's sweep
    }
  }

  /** Store a newly-dropped mine at an already-validated point. Per-player cap =
   *  the OWNER'S effective maxLive (the maxMines ladder); the defensive global
   *  cap stays in addMine. Story 2.8 (amendment 45): mines are a click-aimed
   *  WEAPON on the fireSeq channel — the equipment row validates the rear
   *  placement sector + placeRange and hands us the CLICKED point, and the
   *  activation carries the D1-compensated fire time, so `droppedAt` is that
   *  validated fireT (not necessarily `now`) and armedAt = droppedAt +
   *  armDelay. Caps / oldest-eviction untouched. */
  private spawnMine(owner: ShipRecord, x: number, y: number, droppedAt: number = this.now): void {
    addMine(this.mines, owner.id, x, y, droppedAt, this.nextMineId(), owner.stats.mine.maxLive);
  }

  /** Store a newly-placed RADAR BUOY at an already-validated point (Story 7-5
   *  wave 2, R2.7) — the spawnMine sibling. The buoy's jamSeed comes off the
   *  server-private jam stream at this one site, so a buoy's whole fake
   *  history is fixed at drop and reproducible from (jamSeed, epoch). */
  private spawnBuoy(owner: ShipRecord, x: number, y: number, droppedAt: number = this.now): void {
    this.buoySeq += 1;
    addBuoy(this.buoys, owner, x, y, droppedAt, `b${this.buoySeq}`, this.jamRng.int(0, 0xffffffff));
  }

  /**
   * Per-tick RADAR BUOY driving (Story 7-5 wave 2): natural expiry, the
   * buoy's OWN sweep advance (+ the jamming epoch/fake refresh on each
   * completed revolution), and the GUN BUOY's auto-fire. Deletion during
   * iteration is safe (Map iteration tolerates delete of the current entry).
   */
  private tickBuoys(dtMs: number): void {
    for (const buoy of this.buoys.values()) {
      if (this.now >= buoy.until) {
        this.buoys.delete(buoy.id); // silent expiry — no XP, no event (R2.7)
        continue;
      }
      this.advanceBuoySweep(buoy, dtMs);
      this.fireBuoyGun(buoy, dtMs);
    }
  }

  /**
   * Advance one buoy's OWN sweep — 15 RPM, FIXED: R2.20 replaced the sweep
   * card with BUOY I-IV's DURATION ladder, so nothing in the catalog writes
   * `radarBuoy.sweepRpm` and every buoy turns at the CONFIG rate. The rate is
   * still read LIVE off the owner's effective stats each tick (the
   * mine-doctrine precedent), so a future sweep card would speed a buoy
   * already on the water without touching this; a vacated owner falls back to
   * CONFIG. Frozen with every other radar while `radarEnabled` is false
   * (the advanceSweeps rule — prev === cur means a zero-width paint window,
   * and perception's explicit radar gate backstops it anyway). Each completed
   * revolution is one JAMMING EPOCH: the fake set re-scatters exactly then
   * (R2.11 "re-scattered each sweep"), deterministically from (jamSeed,
   * epoch) — see scatterJamFakes' draw-order contract.
   */
  private advanceBuoySweep(buoy: BuoyState, dtMs: number): void {
    if (!this.radarEnabled) return;
    const rpm = this.ships.get(buoy.ownerId)?.stats.radarBuoy.sweepRpm ?? CONFIG.radarBuoy.sweepRpm;
    const delta = (TAU * dtMs) / (60000 / rpm);
    buoy.prevSweepAngle = buoy.sweepAngle;
    buoy.sweepAngle = wrapPositive(buoy.sweepAngle + delta);
    buoy.sweepTotalRad += delta;
    const epoch = Math.floor(buoy.sweepTotalRad / TAU);
    if (epoch !== buoy.jamEpoch) {
      buoy.jamEpoch = epoch;
      buoy.jamFakes = scatterJamFakes(buoy.jamSeed, epoch, buoy.x, buoy.y, buoy.radarRange);
    }
  }

  /**
   * THE GUN BUOY (R2.21, Eric ruling 2026-08-19 — REVERSES R2.10's
   * aggro-gated hostile definition for this weapon ALONE): *"It has its own
   * radar and is autonomous, so when it has the gun upgrade, it should target
   * basically anything it sees that isn't the owner of the buoy. Closest
   * target proximally to the buoy."* Under the owner's `radarBuoy.gun` verb:
   * 5 damage on a 5000ms cooldown at the NEAREST-TO-THE-BUOY ship its OWN
   * RADAR can see — enemy captains, bots, and neutral fleet drones alike, NO
   * aggro test (R2.13's aggro-gated hostile stays CAPTIVE-MINE-ONLY; the two
   * weapons deliberately differ). The gun is bounded by the buoy's own
   * PERCEPTION, not a bare distance check: within its flat radar set AND
   * radar-visible from the buoy (visibilityTo > 0 — a real radar never shoots
   * what terrain hides from it; the cycle-99 lesson). Excluded: the OWNER
   * (and, structurally, every buoy — the scan iterates ships only, so buoys
   * never duel: a defaulted call, flagged to Eric). Damage routes through the
   * ordinary hitShip choke with byId = the OWNER (kill credit, feed line and
   * XP pay the captain exactly as a mine kill does) and AGGROS NOBODY
   * (`fromMine: true` — R2.21a: the mine exception's own rationale verbatim,
   * "the layer may be dead or across the map, so there is nothing to chase";
   * the owner must not inherit fights an autonomous turret picked). The
   * cooldown holds READY at 0 while nothing is in reach and arms on a shot.
   */
  private fireBuoyGun(buoy: BuoyState, dtMs: number): void {
    const owner = this.ships.get(buoy.ownerId);
    if (owner === undefined || !owner.stats.radarBuoy.gun) return;
    buoy.gunReloadMsLeft = Math.max(0, buoy.gunReloadMsLeft - dtMs);
    if (buoy.gunReloadMsLeft > 0) return;
    const target = this.nearestBuoyTarget(buoy);
    if (target === null) return;
    // THE TURRET FIRES A REAL SHELL (Story 7-5 fix cycle — Eric playtest:
    // *"It fires a muzzle flash, but even if its in LOS range there is no
    // projectile and it deals no damage to anything."*). As first built the
    // gun was HITSCAN: hitShip() ran and hp genuinely fell, but nothing was
    // observable — no projectile on any scope, no Hit Call to the owner, and
    // `dmg` is victim-private, so from the owner's seat the flash was the
    // whole weapon and "deals no damage" was the honest reading. A weapon the
    // game cannot show is not a weapon; the fix routes the shot through the
    // ONE ballistics pipeline everything else fires on, which buys the visible
    // tracer, the boom, the owner's `hc`/`sp` feedback, kill credit and the
    // burst mechanics for free — no new information channel exists, only the
    // ordinary ordnance disclosure rules every shell already obeys.
    //
    // The shell wears the GUN's physical envelope (shellSpeed/shellRadius/
    // burstRadius — the universal gun's identity: fly to the point, burst
    // there) with the BUOY's ruled damage on both the burst and the contact
    // path, lead-solved from the buoy by the shared solver. `noAggro` keeps
    // R2.21a intact through the pipeline: an autonomous turret's hit must not
    // hand its owner a fight (hitShip reads it as the mine exception).
    const s = target.state;
    const vx = Math.cos(s.heading) * s.speed;
    const vy = Math.sin(s.heading) * s.speed;
    const at = leadIntercept(buoy, s, vx, vy, CONFIG.gun.shellSpeed);
    const dist = Math.hypot(at.x - buoy.x, at.y - buoy.y);
    const dir = Math.atan2(at.y - buoy.y, at.x - buoy.x);
    // BOW CLEARANCE, the torpedo precedent — and fail-proven, not theoretical:
    // the buoy is itself a ballistic target (withBuoyTargets, R2.7), so a
    // shell spawned AT its center sweeps out through its OWN 12u square and
    // self-intercepts on the first step — the turret shoots itself, emits an
    // honest-looking Hit Call, and the enemy takes nothing (exactly the
    // regression test caught). Clear the square's worst-case half-diagonal
    // plus the shell's own hit radius; the min() keeps a point-blank target
    // in front of the muzzle rather than behind it.
    const clear = Math.min(BUOY_SIZE_U + CONFIG.gun.shellRadius, dist / 2);
    // PER-SHELL FLASH, deliberately: emitMuzzleFlash's per-owner dedupe would
    // collapse a same-tick owner gun click and buoy shot into ONE flash at one
    // of two DIFFERENT muzzles — putting a flash where nothing fired and
    // hiding one where something did. A buoy fires one shell per gunReloadMs,
    // so the barrage's salvo-count disclosure concern cannot arise.
    this.spawnBallistic(
      {
        id: this.nextBallisticId(),
        ownerId: buoy.ownerId,
        x: buoy.x + Math.cos(dir) * clear,
        y: buoy.y + Math.sin(dir) * clear,
        vx: Math.cos(dir) * CONFIG.gun.shellSpeed,
        vy: Math.sin(dir) * CONFIG.gun.shellSpeed,
        distLeft: dist - clear + CONFIG.gun.shellRadius,
        bornAt: this.now,
        kind: 'shell',
        damage: owner.stats.radarBuoy.gunDamage,
        hitRadius: CONFIG.gun.shellRadius,
        targetX: at.x,
        targetY: at.y,
        burstRadius: CONFIG.gun.burstRadius,
        contactDamage: owner.stats.radarBuoy.gunDamage,
        noAggro: true,
      },
      true,
    );
    buoy.gunReloadMsLeft = owner.stats.radarBuoy.gunReloadMs;
  }

  /** The gun buoy's target pick (R2.21): the afloat non-owner ship NEAREST TO
   *  THE BUOY within its flat radar set and radar-visible from the buoy —
   *  role-blind (captain, bot, or neutral drone alike). */
  private nearestBuoyTarget(buoy: BuoyState): ShipRecord | null {
    let best: ShipRecord | null = null;
    let bestD2 = buoy.radarRange * buoy.radarRange;
    for (const ship of this.ships.values()) {
      if (ship.id === buoy.ownerId || !isAfloat(ship.lifecycle)) continue;
      const dx = ship.state.x - buoy.x;
      const dy = ship.state.y - buoy.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > bestD2) continue;
      if (visibilityTo(this.map.heightRaster, buoy.x, buoy.y, ship.state.x, ship.state.y) <= 0) continue;
      best = ship;
      bestD2 = d2;
    }
    return best;
  }

  /**
   * The ballistic/blast target list: alive hulls PLUS every live buoy's
   * frozen square silhouette (Story 7-5 wave 2, R2.7 — "destructible by
   * anything that damages a ship" is delivered by making the buoy an ordinary
   * collision subject on the ordnance paths: shell contact/interception,
   * bursts, torpedo hits, and mine/captive-fish blasts). DELIBERATELY NOT fed
   * to checkMineTriggers: a buoy is not a hull and must not TRIP a mine —
   * that would be a new mechanic (remote minefield clearing) nobody ruled on;
   * mine BLASTS still damage it because detonation resolution takes this
   * merged list. Allocation-free when no buoy is live (the common case).
   */
  private withBuoyTargets(hulls: HullTarget[]): HullTarget[] {
    if (this.buoys.size === 0) return hulls;
    const merged = hulls.slice();
    for (const buoy of this.buoys.values()) merged.push(buoyTarget(buoy));
    return merged;
  }

  /**
   * Apply weapon damage to a BUOY victim (the hitShip sibling for the one
   * non-ship damageable): honors the same phase guard (target practice never
   * destroys a buoy), and a destroyed buoy is simply DELETED — NO XP, NO
   * kill-feed line, NO event of any kind (R2.7; the client reads the despawn
   * from the buoys list emptying, exactly as it reads expiry). Returns true
   * iff `victimId` named a live buoy (the caller's "victim resolved" answer —
   * a connected shot on a buoy IS a Hit Call: `hc` means "something of yours
   * connected", and the decoy's no-Hit-Call oracle died with the decoy).
   * Deliberately NO damageDealt credit and NO dmg event: the stat and the
   * channel are about hulls, and no wire shape carries buoy hp at all.
   */
  private hitBuoy(victimId: string, amount: number): boolean {
    const buoy = this.buoys.get(victimId);
    if (buoy === undefined) return false;
    if (!this.damageEnabled) return true; // resolved, but target practice breaks nothing
    buoy.hp -= amount;
    if (buoy.hp <= 0) this.buoys.delete(buoy.id);
    return true;
  }

  private nextBallisticId(): string {
    this.shellSeq += 1;
    return `s${this.shellSeq}`;
  }

  private nextMineId(): string {
    this.mineSeq += 1;
    return `m${this.mineSeq}`;
  }

  private nextLitZoneId(): string {
    this.litZoneSeq += 1;
    return `z${this.litZoneSeq}`;
  }

  /**
   * One-time ballistic params the client dead-reckons from. NO range-derivable
   * field (no ttl/distLeft) — see BallisticEvent's anti-cheat note. Perception
   * re-issues this per observer at reveal time; the wire shape stays
   * constant-free. `k` carries the projectile kind (shell vs torp).
   */
  private ballisticEvent(shell: ShellState): BallisticEvent {
    return {
      k: shell.kind,
      id: shell.id,
      x: shell.x,
      y: shell.y,
      vx: shell.vx,
      vy: shell.vy,
      t: shell.bornAt,
    };
  }

  /**
   * Advance each radar sweep, remembering where it started. This tick's paint
   * window is the half-open arc [prevSweepAngle, sweepAngle) — perception.ts
   * paints a target iff its bearing fell inside it (wrap-safe). OwnShip.sweep
   * surfaces the post-advance angle, so the client's wedge sits exactly at the
   * leading edge of everything painted this tick.
   */
  private advanceSweeps(dtMs: number): void {
    // THE RADAR LOCK, half one (Story 6.1, amendment 8): a boarding room's beam
    // does not turn. prevSweepAngle therefore equals sweepAngle, and every
    // paint gate is the half-open window [prev, angle) — so this alone already
    // makes sweptThisTick() answer false for every bearing. Perception keeps
    // its own explicit gate anyway (half two): "no blip reaches any client" is
    // an anti-cheat statement and must not rest on an emergent zero-width-arc
    // argument that a later sweep refactor could quietly invalidate.
    if (!this.radarEnabled) return;
    for (const ship of this.ships.values()) {
      // Per-ship EFFECTIVE period (sweepSpeed upgrade) — an upgraded sweep
      // completes a revolution (and thus paints everything) proportionally faster.
      const delta = (TAU * dtMs) / ship.stats.sweepPeriodMs;
      ship.prevSweepAngle = ship.sweepAngle;
      ship.sweepAngle = wrapPositive(ship.sweepAngle + delta);
    }
  }

  /**
   * The passive XP tick (Story 2.6, amendment 34): every ALIVE human hull
   * accrues exactly this tick's `dtMs`, so 1200 ticks of the 50ms step is one
   * level to the millisecond. Three gates, all of them here:
   *   • `xpEnabled` — the match phase is 'active' (the ready room and the
   *     post-match freeze accrue nothing; Match drives the flag);
   *   • alive — a wreck awaiting respawn / a spectating corpse earns nothing;
   *   • not a drone — enforced again inside addXpMs, the credit path itself.
   * The sim never pauses, so XP keeps ticking while the refit modal is open —
   * that is the ratified behavior, not an oversight.
   */
  private tickXp(dtMs: number): void {
    if (!this.xpEnabled) return;
    for (const ship of this.ships.values()) {
      if (isAfloat(ship.lifecycle)) this.addXpMs(ship, dtMs);
    }
  }

  /**
   * WOUNDED SMOKE emission (Story 4.4, amendments 40-50): every ALIVE hull —
   * drones included (amendment 47), the smoking ship's own captain included
   * (amendment 46: the row has no special case) — whose hp FRACTION sits below
   * a damage band queues one anonymous `sm` pulse per
   * CONFIG.smoke.puffIntervalMs at its TRUE current position. The fraction
   * reads the EFFECTIVE maxHp (stats.maxHp — a hull-boon hull smokes by its
   * real capacity), and the thresholds are EXCLUSIVE lower bounds for the
   * better state, mirroring the client rail's hpColor(): exactly 0.5 is
   * healthy (silent), exactly 0.25 is hurt (tier 1), below 0.25 is critical
   * (tier 2). The payload is {k,x,y,tier} and NOTHING else — no ship id for
   * any observer (amendment 45); per-observer delivery is the sm registry
   * row's job (the CONFIG.vision.muzzleFlash halo + island LOS), never this
   * emitter's. A healthy hull's stale timer is left untouched: the moment it
   * drops into a band it puffs immediately, then throttles.
   */
  private tickSmoke(): void {
    const bands = CONFIG.damageBands;
    for (const ship of this.ships.values()) {
      if (!isAfloat(ship.lifecycle) || this.now < ship.nextSmokeAt) continue;
      const frac = ship.hp / ship.stats.maxHp;
      if (frac >= bands.amberBelow) continue;
      ship.nextSmokeAt = this.now + CONFIG.smoke.puffIntervalMs;
      this.pending.push({ k: 'sm', x: ship.state.x, y: ship.state.y, tier: frac < bands.criticalBelow ? 2 : 1 });
    }
  }

  /** Bring sunk ships back on the ring once their respawn delay elapses.
   *  isSunk(), NOT !isAfloat(): this gate means "this life is over" — the
   *  TERMINAL state that armed `respawnAt` — and a hull merely on its way down
   *  (Story 5.2's window) must not be revived out from under it. */
  private processRespawns(): void {
    for (const ship of this.ships.values()) {
      if (!isSunk(ship.lifecycle) || ship.respawnAt === 0 || this.now < ship.respawnAt) continue;
      this.respawn(ship);
    }
  }

  private respawn(ship: ShipRecord): void {
    const occupied = [...this.ships.values()]
      .filter((s) => s.id !== ship.id && isAfloat(s.lifecycle))
      .map((s) => ({ x: s.state.x, y: s.state.y }));
    const p = pickSpawn(this.map, occupied, this.rng, this.spawnPhase);
    ship.state.x = p.x;
    ship.state.y = p.y;
    ship.state.heading = Math.atan2(-p.y, -p.x);
    ship.state.speed = 0;
    // The THIRD placement edge re-anchors the sweep to the new heading too (Eric
    // ruling 2026-08-16) — one rule at addShip / redeployShip / respawn alike.
    // prev MUST equal it: [prev, sweep) is half-open, so an equal pair paints
    // nothing on the fresh life's first tick.
    ship.sweepAngle = wrapPositive(ship.state.heading);
    ship.prevSweepAngle = ship.sweepAngle;
    // Respawn happens only in the waiting phase (active-phase death = spectate),
    // so the build PERSISTS: full EFFECTIVE hp + effective-size ammo pools.
    // XP progress (xpMs/level) and the banked levels + front offer persist with
    // it — deliberately untouched here. (redeployShip, the match boundary, is
    // where the whole build, XP included, gets wiped.)
    ship.hp = ship.stats.maxHp;
    // The respawn `redeploy` edge (Story 5.1, amendment 3): `sunk -> alive`.
    // Production-unreachable in a live match (damageEnabled and respawnEnabled
    // are mutually exclusive by construction, match.ts) but driven by every
    // standalone-World test, which defaults both flags true.
    ship.lifecycle = transitionLifecycle(ship.lifecycle, 'redeploy', this.now);
    ship.respawnAt = 0;
    // The throne is a THIRD recompute seam (Story 4.6 gap fix, beside sinkShip
    // and removeShip): `kills` persists across the death (only
    // redeployShip zeroes it), so a returning captain may still clear the
    // floor and reclaim or newly claim the throne. Ready-room only exposure —
    // in the active match phase the dead spectate instead of respawning.
    this.recomputeBounty();
    // A fresh life never inherits an open boost window — nor a slow, a dazzle,
    // or a DAMAGE CONTROL pool (sinkShip already zeroed them; kept symmetric
    // for directed callers).
    ship.boostUntil = 0;
    World.clearRepair(ship);
    ship.slowedUntil = 0;
    ship.dazzledUntil = 0;
    // ...nor a previous life's contributors: creditKill already cleared the
    // ledger at the sink, kept symmetric here for directed callers.
    ship.damageFrom.clear();
    // ...nor a stale grounding read (the redeployShip rule): the respawn
    // placement is island-clear, so the hull is not aground.
    ship.landContact = false;
    // A fresh life never inherits a stale smoke timer (Story 4.4): without
    // this, a hull that puffed just before sinking would owe the remainder of
    // the old interval on its next life.
    ship.nextSmokeAt = 0;
    // ...nor a stale foghorn cooldown (Story 4.5, the same rule).
    ship.nextHonkAt = 0;
    // lastFireSeq / lastActSeq / lastHornSeq are deliberately NOT reset — a
    // reset fires a phantom shot / phantom boost / phantom honk (the stored
    // input's fireSeq/actSeq/hornSeq would read as a fresh click/press on
    // this tick).
    // Boons AND the deck PERSIST across a waiting-phase respawn, so the fresh
    // loadout re-derives with their slot effects replayed — the SAME shared
    // derivation the client runs (slotsWithBoons ≡ loadoutFor at zero boons,
    // byte-identical).
    ship.loadout = slotsWithBoons(ship.hullId, ship.stats, ship.boonDefs);
    // The respawn TELEPORTS the hull (Story 4.12, amendment 200): the old
    // life's water detaches into the orphan store — where it keeps disclosing
    // and ageing out, a fading track with nothing attached — and the new life
    // starts a fresh ribbon (a kept one would chain a bogus wreck→spawn
    // segment across the map).
    this.detachWake(ship);
    this.pending.push({ k: 'spawn', id: ship.id, x: p.x, y: p.y });
  }
}
