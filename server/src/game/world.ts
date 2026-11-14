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
  CATALOG,
  CONFIG,
  HOOK_REGISTRY,
  LIFECYCLE_ALIVE,
  applyGroundingDamp,
  applySinkingDecel,
  applySlotEffect,
  beaconCycleAt,
  beaconCycleStartMs,
  cardBehaviors,
  boostedKinematics,
  abilityCode,
  abilityFromCode,
  abilityReadyAt,
  abilitySlot,
  repairRefusal,
  smokeRefusal,
  regenDue,
  regenGain,
  type CooldownAbilityId,
  contactGrindRate,
  contactHitDamage,
  landGrindRate,
  landHitDamage,
  resolveHullContacts,
  boonStackCount,
  pickRefusal,
  polyInBlast,
  burstVictims,
  drawOffer,
  drawBonusIndex,
  INDEX_IDS,
  type IndexId,
  lineWeight,
  DEFAULT_CLASS_ID,
  DEFAULT_SHIFT,
  SLOT_BOOST,
  SLOT_GUN,
  EQUIPMENT_IS_WEAPON,
  WEAPON_SLOTS,
  batteryAimPoint,
  initialSecondaries,
  ventSecondaries,
  initialTurrets,
  reloadAllTurrets,
  stepSecondaries,
  stepTurrets,
  DEFAULT_HORN_ID,
  damageMultiplierFor,
  effectiveStats,
  equipmentMaxAmmo,
  equipmentReloadMs,
  generateMap,
  dropCountFor,
  dropMinuteAt,
  dropTouches,
  rollKind,
  rollPickup,
  hasFoundered,
  hookKinematics,
  isAfloat,
  isSinking,
  isSunk,
  slotsWithCards,
  loadoutFor,
  MULLIGAN_CHOICE,
  hullEnvelope,
  hullSilhouette,
  pointPolygonDistance,
  flakRimFactor,
  settleBlow,
  mulberry32,
  resolveShipPose,
  slowedKinematics,
  stepShell,
  stepShip,
  transformPolygon,
  transitionLifecycle,
  wrapPositive,
  appendWakeSample,
  createShipWake,
  createTorpWake,
  pruneWake,
  wakeCapacity,
  draftLift,
  draftedKinematics,
  rollZoneRings,
  zoneCollapses,
  zoneGroups,
  stormDpsFor,
  zoneStateAt,
  isOutside,
  FOG_NO_CUT,
  makeFogField,
  FOG_SOLID_DENSITY,
  fogDensityAt as fieldDensityAt,
  islandIndexFor,
  newLosHints,
  polyBox,
  type PolyBox,
  type IslandIndex,
  type LosHints,
  fogNoiseAt,
  fogCutForTarget,
  fogLattice,
  type FogField,
  type BallisticEvent,
  type BoonBehaviorEffect,
  type Catalog,
  type CatalogLine,
  type DrawShip,
  type PickRefusal,
  type SecondariesState,
  type ShiftId,
  type TurretState,
  type Weights,
  type BoonOffer,
  type LineId,
  type DeniedView,
  type DenialReason,
  type EffectiveStats,
  type ShipConfig,
  type ContactBody,
  type HookRegistry,
  type HullContact,
  type GameEvent,
  type GameMap,
  type HornId,
  type HullEnvelope,
  type HullId,
  type Target,
  type TargetKind,
  type InputMsg,
  type LitCircle,
  type LoadoutSlot,
  type MineKind,
  type EquipmentId,
  type Rng,
  type LauncherState,
  type RackBank,
  type ShellOutcome,
  type DropState,
  type ShellState,
  type CloudRecord,
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
  EQUIPMENT,
  MINE_ROW_ID,
  addMine,
  captiveTorpedo,
  checkMineTriggers,
  configTriggerRadius,
  contactBlastRadius,
  fireSecondaryRound,
  mineBlastVictims,
  slotRow,
  syncBatterySlot,
  type ActivationContext,
  type ActivationDenial,
  type ActivationResult,
  type MineState,
  type MineTripRules,
} from './equipment/index.js';
import { emptyRackBank, instantReloadMounts, isMountBacked, refitMounts, resetMounts, stepShipLaunchers } from './equipment/mounts.js';
import type { BoomSubject, BurstSubject } from './signals.js';
import type { HandRecord } from './matchRecord.js';
import { InputStore, clampFireTime, neutralInput } from './inputs.js';
import { BeaconField, type BeaconChart, type BeaconRecord } from './beacons.js';
import { dispersionShellSeed, offlineDispersionKey } from './dispersionKey.js';
import { paintSalt, paintSaltKey, type PaintKind } from './paintSalt.js';
import { plainHandle, plainHandleKey } from './plainHandle.js';
import { BotController } from './ai/botDriver.js';
import { makeBotPort } from './botPort.js';
import { navCacheFor, type NavCache } from './navCache.js';
import type { AnyProfileId, BotTickEntry } from './ai/types.js';
import { observe } from './perception.js';
import { SPAWN_ISLAND_CLEARANCE, islandClearance, isSpawnClear, pickFleetAnchor, pickSpawn, type IntelDisc } from './spawn.js';
import { logWarn } from '../log.js';
import { leadIntercept } from './lead.js';
import { nextBountyHolder, type BountyCandidate } from './bounty.js';
// The ship-role seam (Story 6.3). Aliased on import for symmetry with the
// World's own id-keyed predicates.
import {
  isHuman as roleIsHuman,
  isParticipant as roleIsParticipant,
  type ShipRole,
} from './participants.js';

const TAU = Math.PI * 2;

/** The frozen zero-card behavior list — one shared identity so every
 *  card-less ShipRecord's per-tick hook fold is allocation-free. */
const NO_BEHAVIORS: readonly BoonBehaviorEffect[] = Object.freeze([]);

/** The frozen empty DEV SPAWN FIT (Story 8.10, epic-8 amendment 65) — what
 *  every hull in production and every bot carries, so the
 *  no-fit case is one shared allocation-free identity. */
const EMPTY_FIT: readonly string[] = Object.freeze([]);

/**
 * A DEV PLACEMENT POSE (Story 9.15): where a scripted smoke asked a captain to
 * stand, and which way to face. Already dev-gated and value-sanitized at the
 * door (`roomOptions.ts` sanitizeSpawnPose). Structural so the World needs no
 * import from the room layer.
 */
export interface DevPose {
  readonly x: number;
  readonly y: number;
  readonly heading: number;
}

// (`DAZZLE_GRACE_MS` — the per-tick refresh grace of the old star-shell DAZZLE
// zone — was DELETED with the verb, Story 8.17 / epic-8 amendment 134, and the
// one-time FLASH SHELLS mark that replaced it (`dazzledUntil` / applyFlash)
// left with the FOULING SHELL, Story 9.4. The foul zone's per-tick stamp is a
// plain `now + CONFIG.foulingShell.lingerMs` — see applyFoulZones.)

/** ms — the incendiary DoT's `dmg` EVENT window (Story 2.8 review, P4). The
 *  burn applies hp every tick (20/s); the victim-private event that reports it
 *  is aggregated per (zone owner, victim) into windows this long, so a 2s burn
 *  costs ~4 events instead of 40 and client hit feedback cannot strobe. Never
 *  lossy: a pair that stops burning — or a victim that dies — flushes at once. */
const DOT_EVENT_WINDOW_MS = 500;

/** The (zone owner, victim) key of a BURN DoT event bucket. Ids are opaque
 *  room session ids; `|` is not one of their characters. */
function dotKey(ownerId: string, victimId: string): string {
  return `${ownerId}|${victimId}`;
}

/** The key of a contact BLEED ('grind') event bucket (Story 9.5 review gate):
 *  one window per (attacker, victim), where the attacker is the other hull's
 *  id or the sentinel `land` for the coast. The sentinel lives in this map
 *  ONLY — the `dmg` event carries no attacker and never will. The `grind:`
 *  prefix keeps a bleed window apart from the same attacker's burn window
 *  and lets each flush sweep find only its own buckets. */
function grindKey(attackerId: string | undefined, victimId: string): string {
  return `${GRIND_KEY_PREFIX}${attackerId ?? 'land'}|${victimId}`;
}

const GRIND_KEY_PREFIX = 'grind:';

/**
 * Injectable engine registries (Story 2.5). Production omits both (the empty
 * shared HOOK_REGISTRY; the FULL shared CATALOG as of Story 8.1); tests
 * inject their own so real-tick hook execution and the deck/spend economy can
 * be driven against tiny controlled catalogs (amendment 29 — test hooks never
 * enter the production hook registry).
 */
export interface WorldOptions {
  hookRegistry?: HookRegistry;
  catalog?: Catalog;
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
  /**
   * THE DISPERSION KEY (Story 11.1 review fix — anti-cheat): 32 bytes of
   * per-room secret from which every gun shell's dispersion seed is minted
   * (`HMAC-SHA256(key, ordinal)`, see `mintShell`). It is INDEPENDENT of
   * `pseudonymSeed` and of every other stream on purpose: a shooter sees its
   * own shells' exact landings, so any one shell's 32-bit seed is
   * brute-forceable — and under an HMAC that reveals nothing about the key,
   * any other shell or any other stream. ArenaRoom passes
   * `crypto.randomBytes(32)` for every real room. Omitted => a deterministic
   * key derived from the World's seeds (SHA-256 over a fixed label, the map
   * seed and the pseudonym material) — for OFFLINE runs only (batch sims,
   * tests, the RL env), so they replay exactly; NEVER acceptable for a
   * production room.
   */
  dispersionKey?: Uint8Array;
  /**
   * THE RADIO BEACON SWITCH (Story 10.8, a DEV SMOKE ARM). `false` makes
   * `placeBeacons` and `tickBeacons` no-ops, so no beacon is ever charted and
   * the public chart stays empty — a scripted socket scenario keeps its XP
   * clock to itself. Absent / `true` = the shipped beacons. ArenaRoom passes
   * it ONLY from the dev-gated `matchOverride.beacons` (stripped without
   * HC_DEV_OPTIONS=1).
   */
  beacons?: boolean;
  /**
   * THE AIRDROP SWITCH (Story 10.9, epic-10 amendment 18 — a DEV SMOKE ARM).
   * `false` makes `spawnDrops` a no-op: no SCHEDULED crate is ever scattered.
   * WRECK PICKUPS are still placed (a sink is not the schedule — spec I/O row
   * "Dev door"), and collection and the storm sweep run as ever. Absent /
   * `true` = the shipped schedule. ArenaRoom passes it ONLY from the
   * dev-gated `matchOverride.drops` (stripped without HC_DEV_OPTIONS=1).
   */
  drops?: boolean;
}

/** The item id fitted in `loadout[slotIndex]`, or null when the slot is
 *  empty or the index is out of range. Shared by the two dispatch channels so
 *  each routes only its OWN kind: fireControl (clicks) dispatches weapons,
 *  activationControl (actSeq) dispatches the Shift — a split both read off the
 *  shared `EQUIPMENT_IS_WEAPON`. */
function fittedEquipment(loadout: LoadoutSlot[], slotIndex: number): EquipmentId | null {
  const slot = loadout[slotIndex];
  return slot ? slot.equipmentId : null;
}

/**
 * A MULTI-SPECTRAL COUNTERMEASURE cloud as the World STORES it (Story 9.3):
 * exactly the shared `CloudRecord` (id, owner, centre, bornAt, until) — the
 * pixel base the cycle-174 store cached is gone with the pixels (Story 9.3
 * session 2: the cloud is a client overlay). SERVER-PRIVATE as a whole: the
 * `cloud` registry row materializes a fresh `{id,x,y,t0}` and nothing here
 * (owner, until) ever rides the wire.
 */
export type StoredCloud = CloudRecord;

/**
 * A live star-shell lit zone (Story 1.7): a static circle spawned where a star
 * shell BURST, granting the FIRER truesight parity inside it until `until`
 * (the reveal rules live in signals.ts — "lit from above", no island LOS).
 * Server-owned, NO per-ship state — a zone survives its owner's death and
 * dies only by natural expiry (expireLitZones). The wire shape is LitZoneView
 * ({id,x,y,r,until,by}), materialized per observer by the litzone signal row.
 *
 * A LIT ZONE ONLY EVER LIGHTS (Story 8.17, epic-8 amendment 134): the
 * star-shell PHOSPHOR / DAZZLE doctrine verbs and the `phosphor` / `dazzle`
 * fields that stamped them here are DELETED. Burning is a BurnZone
 * (PHOSPHOR SHELLS, its own store below); the FLASH SHELLS blinding that
 * followed is itself gone — Story 9.4 replaced it with the FOULING SHELL,
 * whose FoulZone (its own store below) slows props and never touches sight.
 */
export interface LitZone {
  id: string;
  ownerId: string; // the firer — the ONLY observer the zone reveals for
  x: number; // u — zone center (the burst point)
  y: number; // u
  r: number; // u — lit radius
  until: number; // ms — server time the zone expires
}

/**
 * A live PHOSPHOR SHELLS BURNING ZONE (Story 8.17, Eric ruling 2026-09-29,
 * epic-8 amendments 131 / 135(e)): a static circle spawned where a phosphor
 * shell BURST (or where an interception stopped it), burning `dps` hp/s on
 * every non-owner afloat hull whose CENTRE is inside until `until`. All three
 * numbers are STAMPED from the shell's `burn` tag — the owner's effective row
 * at LAUNCH — so a later tier card never changes a live zone.
 *
 * A HAZARD ONLY, and ITS OWN STORE rather than a LitZone with a flag, BY
 * CONSTRUCTION: `ownZoneCovers` (the firer's truesight parity) and the
 * star-shell gun reach (`ownLiveLitZones`) iterate `litZones` alone, so a
 * burning zone can reveal nothing and extend no gun — there is no flag for a
 * reader to forget. Server-owned, NO per-ship state — it survives its owner's
 * death and dies only by natural expiry (expireBurnZones). The wire shape is
 * BurnZoneView ({id,x,y,r,until,by}), materialized per observer by the
 * `burnzone` signal row on the LIT ZONE's visibility gate.
 */
export interface BurnZone {
  id: string;
  ownerId: string; // the firer — never burned by its own zone; kill credit goes here
  x: number; // u — zone center (the burst / stop point)
  y: number; // u
  r: number; // u — burning radius
  until: number; // ms — server time the zone expires
  dps: number; // hp/s — the burn, integrated per tick through the 'burn' seat
}

/**
 * A live FOULING SHELL FOUL ZONE (Story 9.4, Eric ruling 2026-10-11, epic-9
 * amendments 61–68): a stationary slow patch spawned where a fouling shell
 * STOPPED (its burst point, or an interception's stop point — the lit / burn
 * precedent), `r` and `until` STAMPED from the shell's `foul` tag. Every
 * AFLOAT hull whose OUTLINE touches the circle — the owner included (Eric:
 * *"Yes it does slow you"*; a slow is not damage, so there is no friendly-fire
 * exemption), sinking hulls excluded — is stamped
 * `fouledUntil = now + CONFIG.foulingShell.lingerMs` every tick it is inside
 * (applyFoulZones, the outline test of amendment 62), and runs at
 * `CONFIG.foulingShell.slowFactor` × both caps while that stamp is in the
 * future (tickKinematics' second slowedKinematics fold).
 *
 * A HAZARD ONLY, and ITS OWN STORE BY CONSTRUCTION — the BurnZone argument
 * verbatim: `ownZoneCovers` and the star-shell reach iterate `litZones` alone
 * and the burn DoT iterates `burnZones` alone, so no reveal, burn or light
 * reader can ever find a foul zone; there is no flag for a reader to forget.
 * No damage, no reveal, no radar return (amendment 63). Server-owned, NO
 * per-zone-per-hull state — one stamp per hull per tick is what makes "the
 * same source never stacks" (amendment 64) true by construction. It survives
 * its owner's death and dies only by natural expiry (expireFoulZones). The
 * wire shape is FoulZoneView ({id,x,y,r,until,by}) — the burn zone's shape
 * byte-for-byte — materialized per observer by the `foulzone` signal row on
 * the burn zone's visibility gate.
 */
export interface FoulZone {
  id: string;
  ownerId: string; // the firer — slowed by its own zone like anyone else; rides the wire as `by`
  x: number; // u — zone center (the burst / stop point)
  y: number; // u
  r: number; // u — foul radius
  until: number; // ms — server time the zone expires
}

/**
 * ONE attacker's running claim on ONE victim's kill value — the entry type of
 * `ShipRecord.damageFrom`. See that field for the rolling-counter model.
 */
export interface AssistTally {
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
   * isParticipant — never by comparing the string ad hoc. Story 6.4 added
   * `'bot'` to the union and every consumer followed for free; Story 10.8
   * retired `'fleet'` with the PvE drones.
   */
  role: ShipRole;
  /**
   * Hull identity (fixed for the ship's whole life): a player's picked
   * ShipClassId. THE key into hullSilhouette()/hullEnvelope(), and the `cls`
   * value contacts carry on the wire. A player ship's hullId is ALWAYS a
   * ShipClassId (OwnShip.cls narrows on that).
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
   * HOW SQUARE THIS TICK'S LAND CONTACT WAS — `resolveShipPose().headOn`
   * stored beside `landContact` (Story 9.5): 0 = grazing along the coast,
   * 1 = dead-on, 0 whenever `landContact` is false. The land strike reads it
   * for the closing speed (`preDampSpeed × headOn`) and the land grind for the
   * sliding speed (`preDampSpeed × √(1 − headOn²)`). Server-only.
   */
  landHeadOn: number;
  /**
   * `landContact` as it stood LAST tick (Story 9.5) — the land HIT fires on
   * the false → true edge only (amendment 81: every FRESH strike costs by the
   * closing speed; a hull that stays pressed pays the grind, never a second
   * hit). Written by applyContactDamage after it has read the edge. Reset
   * false at every life boundary (addShip / founderSinking / respawn /
   * redeployShip). Server-only.
   */
  landWasContact: boolean;
  /**
   * |speed| as it stood AFTER this tick's kinematics and BEFORE
   * applyGroundingDamp capped it (Story 9.5) — written by the
   * resolveHullContacts row, read by applyContactDamage. The land strike is
   * priced on the speed the hull ARRIVED with, not the quarter-speed cap the
   * damp leaves it at. Server-only, per-tick scratch.
   */
  preDampSpeed: number;
  /**
   * WHAT LAST TOOK HP OFF THIS HULL (Story 9.5) — stamped by applyDamage when
   * `dealt > 0`, null until the first blow of a life. The harness reads it off
   * the victim's record at the `sunk` event to tell a ram kill ('contact' or
   * 'grind' with a killer) and a grounding death ('contact' / 'grind', no
   * killer, `lastContactWasLand`) from the rest; the kill feed keeps today's
   * lines (amendment 76), so this never rides the wire. Reset null at
   * respawn / redeployShip (NOT at founderSinking — the sink-time reading is
   * the one the harness takes).
   */
  lastDamageSrc: DamageSource | null;
  /**
   * WHETHER THE LAST CONTACT BLOW CAME FROM LAND (Story 9.5 review gate):
   * stamped by dealContact / bleedContact with the blow's kind BEFORE the
   * gate runs — true for the coast, false for another hull, a sinking WRECK
   * INCLUDED (a wreck is hull contact, not land, even though it credits
   * nobody). The tally split below and the harness's `ranAground` /
   * `sunkByContact` read it; never on the wire. Reset with the tally.
   */
  lastContactWasLand: boolean;
  /**
   * hp this hull has TAKEN from contact this life — the 'contact' hits and
   * the fractional 'grind' bleed — split by `lastContactWasLand` at each
   * blow: another hull or a wreck (`contactDamageTaken`) or the coast
   * (`landDamageTaken`). Accumulated in applyDamage from `dealt`; harness
   * readouts only (Story 9.5), never on the wire. Fractional (the bleed is
   * applied per tick unfloored, as the burn is). Reset 0 at respawn /
   * redeployShip.
   */
  contactDamageTaken: number;
  landDamageTaken: number;
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
   * maxSpeed with an open boost window folded in by the shared hook, off
   * effectiveStats(), the sole
   * derivation path — and re-provisioned by applyBoon when a speed card
   * raises it (an under-provisioned ring silently drops the oldest tail).
   * SERVER-PRIVATE: never on the wire — only gated per-segment coverage
   * masks leave through the `wk` signal row.
   */
  wake: WakeRibbon;
  /**
   * THE DEV SPAWN FIT (Story 8.10, epic-8 amendment 65) — the line ids a
   * DEV-ONLY `fitOverride` room option asked this hull to come up holding,
   * already dev-gated and shape-sanitized at the door. EMPTY on every
   * production path and on every bot: `fitOverride` is stripped
   * without HC_DEV_OPTIONS=1, the queue never forwards it, and addShip keeps
   * it only for a `captain`. Applied ONCE, at spawn (`enrolShip` →
   * `applyDevFit`), and never again: since the 8.10 review the activation
   * redeploy preserves `cards`, so the smokes' torpedo survives the
   * countdown→active boundary by itself and a second application would DOUBLE
   * the fit. The list stays on the record as the record of what was asked.
   * SERVER-PRIVATE: never on the wire.
   */
  devFit: readonly string[];
  /**
   * THE DEV SPAWN POSE (Story 9.15) — the placement a DEV-ONLY `spawnOverride`
   * join option asked this hull to take, already dev-gated and value-sanitized
   * at the door. UNDEFINED on every production path and on every bot: the
   * option is stripped without HC_DEV_OPTIONS=1 and addShip keeps it
   * only for a `captain` (the `devFit` rule). Honoured at EVERY placement edge
   * — addShip, redeployShip (unless the start line is held) and respawn — in
   * place of `pickSpawn`, heading included. A PLACEMENT ONLY: it never touches
   * hp, ammo, the fit or anything applyDamage owns. SERVER-PRIVATE: never on
   * the wire.
   */
  devPose?: DevPose;
  /**
   * THE SEAT'S SHIFT (Story 10.4, epic-10 amendment 9 — it replaced the seat's
   * GUN, Story 8.14): which Shift ability this captain PICKED, sanitized at
   * the door (`sanitizeShiftId`, fail-open to `DEFAULT_SHIFT`) and frozen for
   * the match. Slot 1 mounts it (`loadoutFor(stats, shift)`); slot 0 is
   * the hull's MAIN BATTERY on every hull. A bot's is dealt off the room's
   * bot-fleet stream.
   *
   * SELF-PRIVATE: it rides the own-ship frame (`OwnShip.shift`) and NOTHING
   * else — which Shift an enemy picked is build information.
   */
  shift: ShiftId;
  /**
   * THE MAIN BATTERY'S TURRETS (Story 10.4, R2/R4): one `{a, reloadMsLeft}`
   * per turret, bow to stern — the TRUTH slot 0's `{n, reloadMsLeft}` pair is
   * derived from (`batterySummary`); `a` is the DERIVED angle (no traverse,
   * Story 11.1). Stepped in place by the shared
   * `stepTurrets` in the `stepTurrets` STEP_ORDER row; a turret's reload is
   * started by the mainBattery row's `fireTurret`. `initialTurrets(hullId)` at
   * every spawn / redeploy / respawn.
   * The ANGLES ride a sighted contact's row (`Contact.tu`, through the contact
   * gate); the reloads ride the own-ship frame only (`OwnShip.turrets`).
   */
  turrets: TurretState[];
  /**
   * THE TORPEDO LAUNCHERS (Story 10.6, Eric 2026-11-05, R6 / R13 / R16): one
   * `{a, tubes}` per launcher, fore first — the TRUTH the torpedo slot's
   * `{n, reloadMsLeft}` pair is derived from (`launcherSummary`). EMPTY until
   * the torpedo family slot fills; then `initialLaunchers` (everything
   * loaded, I3), resized by cards (`refitMounts`), reset at every fresh life
   * beside the turrets (`resetMounts`). Stepped in place by the
   * `stepLaunchers` STEP_ORDER row. The ANGLES ride a sighted contact's
   * `Contact.lu` (the `tu` gate); the tubes ride the own-ship frame only
   * (`OwnShip.launchers`). Lifecycle: equipment/mounts.ts.
   */
  launchers: LauncherState[];
  /**
   * THE MINE RACKS (Story 10.6, R7 / R17 / R18): one `{n, reloadMsLeft}` per
   * rack plus the drop-turn cursor — the TRUTH the mine slot's pair is
   * derived from (`rackSummary`). No rack until the mine family slot fills.
   * Ticked by the mine row (`tickRacks`); the racks ride the own-ship frame
   * only (`OwnShip.racks`); the cursor never leaves the server.
   */
  racks: RackBank;
  /**
   * hp/ms — the RATE the running HULL REPAIR pool pays out at, stamped at the
   * press from the ship's OWN `stats.repair` (`regenHp / regenMs` — Story
   * 10.6, R8 / R15: the pool always drains over its fixed window, so a card
   * taken mid-drain never changes a pool already running). Server-private.
   */
  repairRate: number;
  /**
   * THE SECONDARIES' HEAT (Story 10.4, R3): the shared stepper's state,
   * stepped in place by the `secondariesControl` STEP_ORDER row off the
   * latest input's `sec` level. `{heat}` rides the own-ship frame only
   * (`OwnShip.sec`); the round phase (`untilRoundMs`) never leaves the server.
   * Reset at every spawn / redeploy / respawn.
   */
  sec: SecondariesState;
  /**
   * This ship's PRIVATE DRAW stream (Story 2.8, renamed in 8.14 when the deck
   * became the common pool): mulberry32 decorrelated from the mapgen/spawn
   * streams by its own golden constant XOR a stable per-ship JOIN ORDINAL
   * (World.joinSeq — assigned once in addShip and never reused), so join/leave
   * churn elsewhere can never shift this player's draws. The stream PERSISTS
   * across redeployShip (which since Story 8.10 preserves the whole countdown
   * economy, and never reseeded the stream on any path): determinism is
   * (mapSeed, join ordinal, draw sequence).
   */
  drawRng: Rng;
  /**
   * UNSPENT BANKED LEVELS (Story 2.7; the lazy-draw bugfix): a bare COUNT, the
   * SINGLE SOURCE OF TRUTH for the level bank (OwnShip.pts mirrors it). Levels
   * behind the front one carry NO cards — a level is drawn for only when it
   * reaches the front (`offer` below), so banking costs nothing.
   * A HULL WITH NOTHING DEALABLE BANKS NOTHING (Story 10.7, R5, Eric
   * 2026-11-06): an EMPTY draw converts every banked level into a bonus point
   * (`indexBonus`) and sets this to 0 (`materializeOffer`), so `pts` never
   * advertises a level that can never be spent. `level` keeps counting.
   * PRESERVED by redeployShip since Story 8.10 — the level the countdown
   * granted is the one the captain spends on live water.
   */
  bankedLevels: number;
  /**
   * THE EXHAUSTED HULL'S BONUS POINTS (Story 10.7, R5, Eric 2026-11-06,
   * epic-10 amendment 13): per index, how many levels met an EMPTY draw and
   * became `CONFIG.offer.exhausted.indexPoints` on that index (picked by the
   * shared `drawBonusIndex` off `drawRng`). All six keys, zero at addShip.
   * Folded ONLY through `effectiveStats()` (`refoldCards`, `redeployEconomy`)
   * and mirrored self-private onto `OwnShip.ib`. PER MATCH, like `cards`:
   * PRESERVED by redeployShip and respawn (the build persists).
   */
  indexBonus: Record<IndexId, number>;
  /**
   * THE FRONT OFFER — the one hand the player is about to pick from, or null
   * (no banked level — an empty draw banks nothing, Story 10.7 R5: its levels
   * become bonus points instead).
   * Materialized ONCE, from THE COMMON POOL at the moment the level reaches the
   * front (materializeOffer → sim/draw.drawOffer over this ship's state, its
   * weights and its stream), then FROZEN until it is spent: reopening the refit
   * window can never reroll it (FR19). A draw takes NOTHING out of anything —
   * there is no deck to thin — so a passed-on line is drawable again on the very
   * next level. This is the field OwnShip.offer surfaces. Dropped by a spend;
   * PRESERVED by redeployShip since Story 8.10 (a hand held at 0:00 is still
   * held at 0:01).
   */
  offer: BoonOffer | null;
  /**
   * THE HAND LOG (Story 8.21, Eric ruling R1 2026-09-30): every hand this ship
   * was dealt, in deal order — the offered ids, the id taken (or null), whether
   * it was REDRAWn — for the end-of-match `MatchRecord`. Written at the three
   * sites that own the flow and nowhere else: `materializeOffer` pushes,
   * `mulligan` marks the open hand redrawn, `settleSpend` marks it taken. The
   * dev spawn fit is NOT a hand (it rides `cards` only). Stamps are RAW
   * `world.now` — the World does not know the match's activation, so
   * `buildMatchRecord` converts to `T+` once.
   *
   * PER MATCH, like `cards` and `bankedLevels`: set `[]` at addShip and never
   * cleared (the activation redeploy preserves the whole countdown economy, and
   * a record lives exactly one match). SERVER-PRIVATE: never on the wire — the
   * perception invariant's forbidden-key walk pins it.
   */
  hands: HandRecord[];
  /**
   * THE ONE FREE COUNTDOWN REDRAW, SPENT (Story 8.10, FR48, epic-8 amendment
   * 60): false until this ship's captain throws the level-zero offer back
   * (`World.mulligan`), true forever after — for THIS MATCH. A second press,
   * a press after 0:00 and a press by anything that is not a human captain
   * are all silent no-ops that leave the offer byte-identical.
   *
   * PER MATCH, NOT PER LIFE: set false at addShip and nowhere else. The
   * activation redeploy PRESERVES it along with the rest of the countdown
   * economy, in EVERY room (amendment 63b, made unconditional by the 8.10
   * review) — the redraw was spent on the offer the hull still holds at 0:00,
   * so it must not come back. A waiting-phase respawn never touches it
   * either. The record lives exactly one match, so nothing has to clear it.
   */
  mulliganed: boolean;
  /**
   * THE OPENING GRANT, TAKEN (Story 8.10, FR48; the 8.10 review, P2): false
   * until this hull has been handed its level-zero level by
   * `World.grantOpening()`, true forever after. PER RECORD, never cleared —
   * a record lives exactly one match.
   *
   * WHY THE LATCH IS PER SHIP AND NOT PER MATCH. `Match.startCountdown()` can
   * legitimately run more than once (a countdown that cancels back to
   * `waiting` because a captain left, then re-arms), and a hull that was in
   * the room for the first arming must not bank a SECOND level for the second
   * — while a captain or bot who joined in between MUST get its first. One
   * match-wide flag answers only the first half; this one answers both, and
   * it is also what lets `addShip` grant a hull that arrives mid-countdown.
   *
   * SERVER-PRIVATE: never on the wire (the banked level it produces is).
   */
  openingGranted: boolean;
  /**
   * XP accumulator in INTEGER MILLISECONDS toward the next level (Story 2.6),
   * always in [0, CONFIG.xp.levelMs). Integer ms — never a float fraction — so
   * 1200 passive ticks × 50ms is EXACTLY one level with no drift. Two inputs
   * only: the passive tick (+dtMs while the match is active, this hull is
   * alive) and kill credit (round(levelMs × value),
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
   * Fitted card LINE ids, in fit order (Story 8.1 — catalog v3). Mutated only
   * by applyCard(). Survive respawn (waiting-phase deaths keep the build,
   * like upgrades) but NOT redeployShip (fresh match = fresh build). Mirrored
   * onto OwnShip.cards (SELF-PRIVATE — rides `you` and nothing else).
   *
   * THE ID LIST IS THE BUILD: `effectiveStats` counts copies per line itself
   * and folds in CATALOG order, so there is no resolved-def cache to keep in
   * step (the Story 8.1 deletion of the `boonDefs` mirror).
   */
  cards: string[];
  /**
   * Cached `behavior` effects of the fitted cards — the per-tick
   * hookKinematics workload (stepShips). Frozen empty identity at zero cards
   * so the 20Hz loop allocates nothing for card-less hulls.
   */
  cardBehaviors: readonly BoonBehaviorEffect[];
  /**
   * Cached effective stats for (cls, cards) — the shared effectiveStats()
   * result. Every stat read in the sim (kinematics, vision, weapon pools,
   * reloads, ranges, damage/blast/trigger as of 2.8) goes through this, NEVER
   * raw CONFIG, so card-fitted hulls cannot silently fall back to base
   * numbers. Recomputed on add/redeploy and on applyCard.
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
   * EVERY tick (even dead or on cooldown — the press is consumed and
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
   * 0 = inactive. Written ONLY by the `boost` Equipment row's activate();
   * read by stepShips (now < boostUntil => boosted kinematics cap) and mirrored
   * onto OwnShip.boostUntil (owner-only) by frames.ts. RESET to 0 on spawn/
   * respawn/redeploy so a fresh life never inherits a still-open window.
   */
  boostUntil: number;
  /**
   * ms — server-clock time this ship's HUNKER (was DAMAGE CUT until Story 9.9) window ends (Story 8.15, the
   * Battleship's Shift, Eric rulings 2026-09-28, epic-8 amendments 99–102);
   * 0 = no cut opened this life. Written ONLY through the `setHunker`
   * activation capability (the hunker row's activate); read by applyDamage
   * (while `now < hunkerUntil` the row's `armorBonus` is added to the
   * hull's Armor inside the gate's multiplier; storm bites
   * are exempt — epic-9 amendments 86–88) and mirrored
   * onto OwnShip.hunkerUntil (SELF-PRIVATE, omitted while 0) by frames.ts.
   * RESET to 0 wherever `boostUntil` resets (redeploy / founder / respawn).
   */
  hunkerUntil: number;
  /**
   * ms — server-clock time the MACHINE GUN's stream may fire its next shell
   * (Story 8.15, amendment 103). While the stream stays live it CARRIES OVER
   * (`previous due + rateMs`, orchestrator ruling 2026-09-30, so a
   * non-tick delay such as 310 ms averages 310 ms on 50 ms ticks; Eric's
   * 2026-10-02 delays are all whole ticks); a fresh stream re-anchors to
   * `now + rateMs`. Server-private, written only by the machineGun row's
   * `stream`. 0 = fire on the first held tick.
   */
  streamNextAt: number;
  /**
   * True while the machine gun's stream was live on the previous call (held on
   * the selected gun slot, shells in the magazine) — the carry-over gate for
   * `streamNextAt`. False = the next shot starts a FRESH stream (after a
   * release, a deselect or an emptied magazine). Server-private.
   */
  streamLive: boolean;
  /**
   * hp — the REMAINING PAID HULL REPAIR pool (Eric rulings 2026-08-04; a
   * cooldown ABILITY on `C` since Story 10.5, epic-10 amendment 11); 0 =
   * nothing draining. Written ONLY by World.applyRepair (the repair press —
   * `repairHp = stats.repair.regenHp` — the ship's own, Story 10.6 — a re-press REPLACES the pool,
   * amendment 141; the rate never changes) and drained by tickRepairs at the
   * rate stamped at the press (`repairRate`, regenHp/regenMs) on the WALL CLOCK; mirrored onto OwnShip.repairHp
   * (owner-only) by frames.ts. RESET to 0 on spawn/sink/respawn/redeploy
   * exactly where boostUntil resets — a pool must never survive the death gap.
   * The R8 passive regen (Story 10.5) runs BESIDE it, never through it.
   */
  repairHp: number;
  /**
   * ms — server time HULL REPAIR (`C`) is ready again (Story 10.5, Eric
   * 2026-11-05, epic-10 amendment 11, R1/R3); 0 = ready. Stamped ONLY on a
   * successful press (`abilityReadyAt(now, stats, 'repair')` — the ship's own cooldown, never scaled by
   * RELOAD, never touched by INSTANT RELOAD). Mirrored onto the SELF-PRIVATE
   * `OwnShip.repairReadyAt` by frames.ts while in the future. Reset to 0 at
   * every life boundary (spawn, respawn, redeploy) — ready at spawn.
   */
  repairReadyAt: number;
  /** ms — server time SMOKE (`V`) is ready again (Story 10.5, R2/R3); the
   *  `repairReadyAt` rules verbatim (`OwnShip.smokeReadyAt`). */
  smokeReadyAt: number;
  /**
   * ms — server-clock time this hull last took LANDED damage (epic-8 amendment
   * 47). Stamped by applyDamage's step (d) on every source that actually
   * removed hp (`dealt > 0` — shells, torpedoes, mines, ram and land contact,
   * burn ticks, storm bites). Storm and burn both route through the one gate,
   * so "the storm resets the clock" is structural rather than a second rule.
   *
   * ITS READER IS BACK (Story 10.5, Eric 2026-11-05, epic-10 amendment 11,
   * R8): the passive regen in tickRepairs (`regenDue(now, lastDamagedAt)` —
   * 2 % of missing hp per second after 15 s without a blow). SERVER-PRIVATE —
   * never on the wire.
   *
   * SET TO `now` AT SPAWN, RESPAWN AND REDEPLOY, not to 0: a fresh life starts
   * with a fresh combat clock, never a stale one from its previous life.
   */
  lastDamagedAt: number;
  /**
   * ms — server time the FOULING slow on this ship ends (Story 2.8; its source
   * is FOULING MINES since epic-8 amendment 81 — a NAVAL mine no longer fouls
   * anything); 0 = not slowed. Written by a fouling mine's blast (REFRESH,
   * never stack: plain assignment of now + CONFIG.foulingMines.slowDurationMs);
   * read by stepShips through the FIRST shared slowedKinematics fold (the
   * five-stage composition pinned in sim/slow.ts) and mirrored onto
   * OwnShip.slowedUntil (VICTIM-PRIVATE — frames.toOwnShip only, the
   * boostUntil precedent). Reset on sink/respawn/redeploy like boostUntil.
   */
  slowedUntil: number;
  /**
   * × BOTH speed caps while `slowedUntil` is in the future — the FOULING MINES
   * row's folded `slowFactor` at the LAYER's tier (0.75 at I → 0.55 at V,
   * epic-8 amendment 81). 1 = not slowed, and it is written beside every
   * `slowedUntil = 0` reset (sink / respawn / redeploy).
   *
   * IT LIVES ON THE VICTIM, not read off the layer at step time, for the same
   * reason the kind moved onto the mine: by the time the slow is ticking the
   * layer may have sunk, left, or re-fitted away from the rack that fouled
   * this hull. A LATER FOULING OVERWRITES BOTH — factor and clock together,
   * REFRESH-NOT-STACK (amendment 81), never multiplied.
   *
   * IT CROSSES TO THE VICTIM beside the clock, as OwnShip.slowFactor (Story
   * 8.13, epic-8 amendment 86): VICTIM-PRIVATE on the `slowedUntil` terms —
   * frames.toOwnShip only, omitted when the hull is not slowed or the factor
   * is the inert 1 — so the predictor scales its own caps by the factor that
   * actually fouled it instead of assuming the tier-I 0.75 and snapping on
   * reconcile against a deeper rack.
   */
  slowFactor: number;
  /**
   * ms — server time the FOULING SHELL zone's slow on this ship ends (Story
   * 9.4, epic-9 amendments 61–68; it took FLASH SHELLS' `dazzledUntil` seat);
   * 0 = not fouled by a zone. THE ZONE'S LINGER STAMP: applyFoulZones writes
   * `now + CONFIG.foulingShell.lingerMs` every tick this hull's OUTLINE
   * touches any live foul zone (plain assignment — one stamp per hull per
   * tick, however many zones cover it, so the same source never stacks and a
   * second zone only extends the clock), and the slow therefore lingers
   * `lingerMs` after the hull leaves. Read by tickKinematics through the
   * SECOND shared slowedKinematics fold at `CONFIG.foulingShell.slowFactor`
   * (the mine's fold is the first — different sources multiply) and mirrored
   * onto OwnShip.fouledUntil (VICTIM-PRIVATE, frames.toOwnShip only, omitted
   * when not in the future). Reset wherever `slowedUntil` resets: addShip,
   * founder, respawn, redeploy, match start (sink-entry keeps both — a hull
   * that sinks fouled sinks fouled).
   */
  fouledUntil: number;
  /**
   * ms — server time this ship's FLASH SHELLS dazzle ends (Story 8.17,
   * amendment 132; RESTORED by Story 10.9, epic-10 amendments 2 and 4); 0 =
   * never dazzled. Written ONLY by applyFlash: every non-owner afloat hull
   * whose CENTRE is inside a flash burst gets `max(current, now +
   * FLASH_WINDOW_MS)` — a second flash keeps the LATER expiry (a re-flash
   * restarts the whiteout), never stacks, never shortens. Read by perception
   * (signals.sightOf → the shared `effectiveSight(stats, dazzledUntil, now)`,
   * the whiteout's clear circle, epic-10 amendment 5) and mirrored onto OwnShip.dazzledUntil
   * (VICTIM-PRIVATE, frames.toOwnShip only, omitted when not in the future).
   * Reset wherever `fouledUntil` resets (addShip, founder, respawn, redeploy /
   * match start); sink-entry keeps it like every debuff window.
   */
  dazzledUntil: number;
  /**
   * The WAKE-DRAFT lift folded into this hull's forward cap on the CURRENT
   * tick (Story 8.19, Eric rulings 2026-09-30, epic-8 amendments 151–155): the
   * shared `draftLift` over every OTHER hull's ribbon as it stood after last
   * tick's sampleWakes (stepShips precedes sampleWakes — one tick old IS the
   * definition), in [0, CONFIG.wake.draft.lift]. STAMPED by stepShips before
   * each step for every hull on the water (afloat OR sinking — ruling 155,
   * "water is water"); 0 for a hull off the water. Mirrored onto
   * OwnShip.draft (SELF-PRIVATE, frames.toOwnShip only, present only when
   * positive — the exact double, so the client predictor folds the identical
   * `draftedKinematics`). Reset 0 at addShip / founderSinking / respawn /
   * redeploy.
   */
  draft: number;
  /**
   * ms — windowed-min measured RTT for this client (pushed by the room's ping
   * loop via World.setRtt), or null when never measured. Null => the D1 fire-
   * time clamp grants ZERO compensation (a bot never gets an RTT, so a bot
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
  /**
   * ms — server time this hull's MOST RECENT own MULTI-SPECTRAL COUNTERMEASURE
   * cloud expires (Story 9.3): stamped `now + stats.smoke.lifeMs` (the owner's, Story 10.6)
   * by World.makeCloud at every successful SMOKE press; 0 = none this
   * life. SERVER-PRIVATE, never on the wire; mirrored to the bot's own
   * BotTickEntry.cloudUntil (a self-read — the bot's "one of mine is still
   * up" test) and nothing else. Reset to 0 at addShip / sinkShip /
   * founderSinking / respawn / redeploy (a fresh life inherits no stale
   * stamp — the 8.18 lay-window posture); the clouds themselves are WORLD-
   * owned and live out their 15 s regardless (amendment 127). Not the
   * wounded-smoke timer above (`nextSmokeAt` — CONFIG.smoke).
   */
  cloudUntil: number;
  sweepAngle: number; // rad — current (post-advance) radar sweep angle
  prevSweepAngle: number; // rad — sweep angle before this tick's advance (paint window start)
  // (`sweepRev`, the per-ship sweep REVOLUTION COUNTER — the `rev` term of
  // the radar dropout roll, Story 9.8 — was REMOVED 2026-11-12 with the
  // dropout: Story 11.2, R8.)
  /**
   * Ballistic ids (shells + torpedoes) this observer has already been sent a
   * reveal for ON THIS VISIT. Perception emits each ballistic exactly once per
   * ENTRY into this observer's reveal gate (owner-always / sight-or-detect /
   * owned lit zone) — at launch for the owner, at first sight for everyone
   * else.
   *
   * THE MARK IS PER-VISIT, NOT PERMANENT (Story 8.13, epic-8 amendment 78).
   * `perception.ballisticScan` clears it the first tick a still-live
   * projectile is OUTSIDE the gate, so a later re-entry re-reveals the
   * projectile with its CURRENT position and velocity — the identical
   * first-reveal wire shape `{k,id,x,y,vx,vy,t}`, no range-derivable field,
   * `t` = the reveal time. A projectile that stays inside the gate is revealed
   * exactly once, byte-identically to the pre-8.13 behaviour, because the mark
   * is only ever cleared from outside; and the OWNER's gate never closes, so
   * the owner is revealed its own fish once and never again. Entries are also
   * forgotten when the projectile is spent (see forgetBallistic).
   */
  seenBallistics: Set<string>;
  /**
   * This hull's own LINE-OF-SIGHT HINTS (Story 11.2 follow-up — shared
   * `LosHints`): the islands that most recently blocked ITS eye rays, asked
   * first by the next ray (`signals.fieldClear`). An order of asking only —
   * it can change the cost of a sight test and never its answer — so it is
   * never reset and rides no wire.
   */
  losHints: LosHints;
  /**
   * Per-observer HOMING-torpedo track memory (Story 2.8): torpedo id → the
   * velocity DIRECTION (rad) this observer last received for that track (set
   * at the ballistic reveal, updated on every 'torpU' emission). The torpU row
   * re-emits a steering fish to this observer only when the live direction has
   * drifted ≥ CONFIG.torpedo.homingUpdateAngleDeg from this baseline AND the
   * fish is currently detected (the ballistic reveal predicate).
   *
   * AN ENTRY TRAVELS WITH THE PER-VISIT MARK ABOVE (Story 8.13, epic-8
   * amendment 78): when `ballisticScan` drops a fish's `seenBallistics` mark
   * on the way out of the gate it drops this baseline in the same breath, and
   * the re-reveal on re-entry re-sets it — so later drift is measured from the
   * velocity the client was just handed, never from a stale one it no longer
   * has. Entries are also forgotten with the projectile (forgetBallistic) — no
   * growth.
   */
  torpDirs: Map<string, number>;
  /**
   * Per-observer PLAIN-HULL handle memory (Story 11.2, R3): target ship id →
   * the anonymous handle this observer currently holds for it, for as long
   * as that hull stays a `PlainContact` in this observer's frames (the outer
   * sight tier). PER VISIT: perception's ship scan drops an entry the first
   * pass its hull is not materialized as a plain contact, so a re-entry
   * mints a fresh handle (`World.plainHandleFor`). SERVER-PRIVATE — only the
   * handle string ever rides the wire, and it is a keyed hash of a counter
   * (game/plainHandle.ts), never of either ship id.
   */
  plainHandles: Map<string, string>;
  /**
   * The ship's equipment loadout — FIVE FIXED-ROLE SLOTS (Story 10.5;
   * shared/src/sim/loadout.ts): `[gun, boost, torpedo, mine, special shell]`,
   * the SAME shape for every captain hull, each slot either
   * empty or holding one equipment id + its runtime state (pool + reload
   * timer, equipment/ammo.ts).
   *
   * There is no per-hull fit any more: slot 0 is the gun and slot 1 the boost
   * on every captain (amendment 23); the three WEAPON slots are filled by
   * CARDS, each into its FAMILY's slot and one kind per slot for the match
   * (sim/boons.ts applySlotEffect, Story 10.5), and they start EMPTY — Story
   * 8.10 deleted the interim spawn seed (amendment 62), so the first weapon
   * aboard is the one the captain takes from the level-zero offer.
   *
   * THE one equipment structure (replaces the old WeaponAmmo[] — no parallel
   * ammo store); `input.slot` names the slot a click activates. Rebuilt from
   * the ship's cards on spawn/respawn/redeploy.
   */
  loadout: LoadoutSlot[];
  /**
   * Hulls this ship has sunk — the roster/results KILLS column AND the bounty
   * throne's one ruler, the same number. (Story 5.6 amendment 38 ruled PvE
   * kills count nowhere; Story 10.8 retired the PvE fleet, so every sinking a
   * captain or bot causes lands here.)
   */
  kills: number;
  deaths: number; // times this ship has been sunk
  damageDealt: number; // hp dealt to OTHER hulls (self-hits and storm excluded)
  /**
   * XP ms this hull has been paid by RADIO BEACONS this match (Story 10.8) —
   * the integer shares `tickBeacons` handed it, the beacon kill value NOT
   * included. HARNESS / MatchRecord substrate only: never on the wire (the
   * hull's own `xp` / `lvl` already carry the result, self-privately).
   */
  beaconXpMs: number;
  /**
   * AIRDROPS this hull has collected this match (Story 10.9, epic-10
   * amendment 18) — scheduled crates and wreck pickups alike. HARNESS /
   * MatchRecord substrate only: never on the wire (the own row's `ib` and the
   * self-private `dp` already carry the result).
   */
  dropsTaken: number;
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
   * THE ORDNANCE TARGET COLLECTOR, bound to this tick (Story 8.4, AR44). A row
   * asks for the KINDS it may touch and gets the tick's memoized list; nothing
   * in an ordnance step enumerates world entities itself. See
   * World.hitTargets() for the memo, the sink invalidation and the kinds.
   */
  readonly hitTargets: HitTargets;
}

/** The collector's call shape — what a STEP_ORDER row and every ordnance
 *  method receive instead of a pre-built hull array (Story 8.4, AR44). */
export type HitTargets = (mask: readonly TargetKind[]) => readonly Target[];

/**
 * The MINE BLAST's target set. A blast damages hulls — and a surfaced RADIO
 * BEACON (Story 10.8, R12: a mine never TRIPS on a beacon — the trip masks
 * are the CONFIG rows' `HITS_TRIP` — but its blast damages one). It never
 * "finds" other mines through the collector — a chain is the mine system
 * propagating within its own store (chainMines), not an ordnance step looking
 * for targets, and routing it through the collector would hand a cascade a
 * snapshot that its own deletions immediately invalidate.
 */
const MINE_BLAST_HITS: readonly TargetKind[] = ['hull', 'beacon'];

/** The FOUL ZONE stamp's subjects (Story 9.4): afloat hull OUTLINES only —
 *  the same per-tick snapshot the ballistic and mine rows test against, read
 *  through the collector so the memo is shared. A foul zone slows ships;
 *  mines, ordnance and RADIO BEACONS (Story 10.8 — an anchored body with no
 *  engines) have no prop to foul, so `beacon` is deliberately absent. */
const FOUL_ZONE_HITS: readonly TargetKind[] = ['hull'];

/**
 * WHICH CONFIG ROW EACH MINE KIND TRIPS THROUGH (cycle-148 review gate, P4).
 *
 * The trip scan used to collect `CONFIG.mine.hits` once and scan every mine
 * against it, whatever rack it came off — which made `CONFIG.foulingMines.hits`
 * dead authored data, and would have shipped the fouling line's mask silently
 * ignored the day it diverged from the naval one. The table names the ROW, and
 * the mask is read off CONFIG at scan time, so each line's `hits` stays
 * authored in exactly one place. The captive line authors none of its own — it
 * trips on the naval rule (amendment 84d) — so it points at the same row.
 *
 * It costs nothing: `hitTargets` memoizes per mask within the tick, so the
 * three kinds share one collection for as long as their masks agree.
 */
const MINE_TRIP_HITS: Readonly<Record<MineKind, 'mine' | 'foulingMines'>> = Object.freeze({
  naval: 'mine',
  captive: 'mine',
  fouling: 'foulingMines',
});

/** ONE MINE'S runtime numbers (see `mineBlastParams`). `slowFactor` is 1 on
 *  every kind but FOULING and `homingTurnRate` 0 on every kind but CAPTIVE —
 *  the inert identities the stat rows carry, so a reader never branches. */
interface MineBlastParams {
  damage: number;
  blastRadius: number;
  slowFactor: number;
  homingTurnRate: number;
}

/**
 * THE VACATED-OWNER FALLBACK, per mine kind (Story 8.13). A mine whose layer
 * has left the room keeps no dead build's TIER — it reverts to its line's
 * CONFIG base — but it is still the KIND it was laid as: an orphaned fouling
 * mine still fouls (at the base factor) and an orphaned captive still launches
 * its fish. Authored here rather than inside the lookup so the three answers
 * sit side by side and none can quietly diverge from its CONFIG block.
 */
const CONFIG_MINE_BLAST: Readonly<Record<MineKind, MineBlastParams>> = Object.freeze({
  naval: Object.freeze({
    damage: CONFIG.mine.damage,
    blastRadius: CONFIG.mine.blastRadius,
    slowFactor: 1, // a naval mine never fouls (amendment 81)
    homingTurnRate: 0,
  }),
  captive: Object.freeze({
    damage: CONFIG.captiveMines.damage,
    blastRadius: CONFIG.captiveMines.blastRadius, // the fish's FIXED 32 u burst
    slowFactor: 1,
    homingTurnRate: 0, // tier I is a pure lead shot (amendment 82)
  }),
  fouling: Object.freeze({
    damage: CONFIG.foulingMines.damage,
    blastRadius: CONFIG.foulingMines.blastRadius,
    slowFactor: CONFIG.foulingMines.slowFactor,
    homingTurnRate: 0,
  }),
});

/**
 * THE SWEEP MASK (amendment 20, Eric 2026-09-16) — a projectile's own `hits`
 * row with `mine` taken out. A mine is NEVER a collision subject for anything
 * in flight: *"if I did not DIRECTLY click on the mine, then under no
 * circumstances whatsoever should it block a shot, register a hit or miss, or
 * give any indication whatsoever to the shooter that anything might be there"*.
 * So every sweep runs against this mask; only the LANDING TEST at the point the
 * shell lands (amendment 200, `landOnMines`) reads the full one's mines.
 *
 * Memoized by the ROW OBJECT (the `CONFIG.<ordnance>.hits` arrays are frozen
 * module constants, so there are three of them for the whole game), and a mask
 * with no `mine` bit is returned UNCHANGED — same array, so `hitTargets` hands
 * back the same memoized list by identity and a torpedo or a flare pays nothing
 * at all for this rule.
 */
const SWEEP_MASKS = new WeakMap<readonly TargetKind[], readonly TargetKind[]>();
/** The two BURST-ONLY kinds a sweep never sees: `mine` (amendment 20) and,
 *  since Story 8.15, `ordnance` (amendment 105 — a fish in flight is struck
 *  only by a burst covering it, never by a shell flying past). A mine is
 *  touched only where a deck gun's shell LANDS on it (amendment 200). */
const BURST_ONLY_KINDS: readonly TargetKind[] = ['mine', 'ordnance'];
function sweepMask(hits: readonly TargetKind[]): readonly TargetKind[] {
  const memo = SWEEP_MASKS.get(hits);
  if (memo !== undefined) return memo;
  const strip = hits.some((k) => BURST_ONLY_KINDS.includes(k));
  const sweep = strip ? hits.filter((k) => !BURST_ONLY_KINDS.includes(k)) : hits;
  SWEEP_MASKS.set(hits, sweep);
  return sweep;
}

/**
 * WHAT DEALT THE DAMAGE (Story 8.4, AR47). The exact list AR47 names, and the
 * ONLY thing `applyDamage` branches on: 'burn' takes the windowed DoT report,
 * 'storm' emits no `dmg`, skips the assist ledger AND is exempt from the
 * HUNKER (amendment 101), everything else takes the immediate
 * victim-private `dmg`. 'missile' was declared ahead of the horizontal missile
 * and DELETED with it (Story 8.15, amendment 89e); 'contact' is the whole-hp
 * ram / land STRIKE (Story 9.5, epic-9 amendments 25, 73–82): a hull hit by
 * another hull (`byId` = the other hull — damage credit and the kill like a
 * shell) or by the coast or a sinking wreck (`byId` undefined — no credit, a
 * `dmg`, the feed's `LOST WITH ALL HANDS` line). It was declared as the
 * decoy-contact seat (Story 8.16; the decoys left with Story 10.5) and never
 * used until 9.5. 'grind' is the
 * contact BLEED (Story 9.5 review gate, amendment 83): the per-tick
 * FRACTIONAL hp of two hulls pressed or sliding together, or of a hull
 * scraping a coast, delivered exactly as 'burn' is — unfloored under the
 * HUNKER, reported through a 500 ms window
 * bucket (grindKey) rather than an immediate `dmg`. AR47's list therefore
 * grows by one: a whole-hp immediate report cannot carry a fraction (under
 * the cut every 1-hp pool drain floored to 0, so a cut hull was immune to
 * all grind and received a `dmg 0` every few ticks; every drain also fired
 * the client hit cue up to five times a second) — the burn already had the
 * windowed fractional path, and the bleed takes the same one.
 */
export type DamageSource =
  | 'shell'
  | 'burst'
  | 'torpedo'
  | 'mine'
  | 'burn'
  | 'storm'
  | 'contact'
  | 'grind';

/** A hull's cached settled pose (World.settledPoses) and every key the
 *  resolver's answer for it depends on. */
interface SettledPose {
  x: number;
  y: number;
  heading: number;
  hullId: ShipRecord['hullId'];
  islands: World['map']['islands'];
  /** Islands never change in a match; the count also catches a test fixture
   *  that pushes or clears islands in place. */
  islandCount: number;
  radius: number;
}

/** One named simulation step in World.STEP_ORDER (Story 5.1, AR8). The name
 *  is the row's identity: the order-identity test (stepOrder.test.ts,
 *  amendment 6) pins the exact name sequence, so it must stay stable. */
export interface StepRow {
  readonly name: string;
  readonly run: (world: World, ctx: StepContext) => void;
}

/** Is point `p` ON `mine` — within `r` of its centre? (The mine landing
 *  test's one predicate: `r` is the shell's blast plus the mine's 10 u marker,
 *  Story 9.12, epic-9 amendment 184(i).) */
function onMine(mine: Vec2, p: Vec2, r: number): boolean {
  return Math.hypot(mine.x - p.x, mine.y - p.y) <= r;
}

// THE RANGE-ATTENUATION FACTOR (`shellAttenuation`, Story 9.12, epic-9
// amendments 184(b) / 187) — RETIRED 2026-11-12, Story 11.1 (Eric's lock 3 /
// #39): every deck-gun blow is flat with range.

/** The hp one burst deals to one caught hull. The ONE settle of a
 *  deck-gun blow (Story 9.12, ruling 184(c)): `damage` × the FLAK rim falloff
 *  (half at the rim, by the NEAREST point of the caught outline —
 *  `CONFIG.flak.rimFactor`; 1 for every other burster), floored ONCE to a
 *  whole number with a floor of one (`settleBlow`) before the damage gate.
 *  Flat with range (Story 11.1). */
function burstHitAmount(shell: ShellState, t: Target, at: Vec2): number {
  const rim =
    shell.family === 'flak' ? flakRimFactor(pointPolygonDistance(at, t.poly), shell.burstRadius, CONFIG.flak.rimFactor) : 1;
  return settleBlow(shell.damage * rim);
}

/** The damage SOURCE a landing blow is recorded under (the harness's
 *  kill-by-source readout): a secondary round (family `'mg'`) keeps its
 *  `'shell'` label though it lands by the main battery's rule (epic-11
 *  amendment <AMENDMENT>, review gate); every other landing is a `'burst'`. */
function landingSource(shell: ShellState): DamageSource {
  return shell.family === 'mg' ? 'shell' : 'burst';
}

/** The hp an EARLY INTERCEPTION deals (Story 9.12, ruling 184(c)): a DIRECT
 *  shell's contact hit — the machine gun's, whose `contactDamage` IS its
 *  damage (the secondaries' round left this path for the landing rule,
 *  epic-11 amendment <AMENDMENT>) — is settled once (flat with range since
 *  Story 11.1); every other interception (the cannon / flak bodyblock,
 *  torpedoes, the broadside, star / phosphor / fouling shells) deals its
 *  `contactDamage` untouched. */
function interceptionAmount(shell: ShellState): number {
  if (shell.direct !== true) return shell.contactDamage;
  return settleBlow(shell.contactDamage);
}

// ---------------------------------------------------------------------------
// THE AIRDROPS (Story 10.9, epic-10 amendment 18) — see World.dropSeed.
// ---------------------------------------------------------------------------

/** The airdrop stream's mint constant (XORed into the room-private pseudonym
 *  material) — unused by any other stream (see the spawnPhase roster). */
const DROP_STREAM_K = 0x5bd1e995;

/** The PICKUP sub-stream key base (Eric 2026-11-08 — the amount is rolled at
 *  pickup): the k-th pickup of this World draws on
 *  `dropSeed ^ imul(PICKUP_DROP_K + k, 0x9e3779b9)`, far from the minute
 *  batches' `m + 1` keys. (0x51ed270b, the retired wreck sub-stream key, is
 *  not reused: a wreck crate now draws nothing at placement.) */
const PICKUP_DROP_K = 0x3c6ef35f;
/** The target kinds a crate is collected by: afloat hull outlines only. */
const DROP_TAKER_MASK: readonly TargetKind[] = ['hull'];

// ---------------------------------------------------------------------------
// THE FOG DENSITY MEMO (Story 9.10) — see World.fogMemo.
// ---------------------------------------------------------------------------

/** Water the memo lattice extends past the ocean's radius on every side (u):
 *  ONE CELL (Story 11.2 review gate, F2). Fog exists only on the ocean — the
 *  shared `fogDensityAt` reads 0 at every point beyond the rim (amendment
 *  179) — so the part of ANY ray outside the ocean's bounding square pays
 *  nothing wherever its ends lie, and `fogTollAlong` clips the ray to the
 *  lattice before walking it: no margin is needed for exactness, and the one
 *  cell only keeps a rim-straddling cell whole. HISTORY: the margin was the
 *  longest tolled eye ray (750 u; then 350 hm = 7,955 u under Story 11.2's
 *  first cut, a 2,591² lattice of ~54 MB per World that tolled nothing the
 *  1,002² one does not). */
const FOG_MEMO_MARGIN_U = CONFIG.fog.marchStepU;

/** The memo lattice: `side × side` cells of `cell` u from (ox, oy); `dens`
 *  holds a cell's density and `epoch` the fog epoch it was evaluated in
 *  (0 = never — epochs start at 1). Allocated ONCE per World. */
interface FogMemo {
  readonly ox: number;
  readonly oy: number;
  readonly cell: number;
  readonly side: number;
  readonly dens: Float32Array;
  readonly epoch: Uint32Array;
}

/** Move `from` toward `to` by at most `maxStep` (a non-positive step holds). */
function clampStep(from: number, to: number, maxStep: number): number {
  if (!(maxStep > 0)) return from;
  const d = to - from;
  if (d > maxStep) return from + maxStep;
  if (d < -maxStep) return from - maxStep;
  return to;
}

/** One axis of the DDA: the cell step (−1 / 0 / +1), the ray parameter per
 *  cell crossed and the parameter of the first boundary crossing. */
interface DdaAxis {
  step: number;
  tDelta: number;
  tMax: number;
}

/** The bounding boxes of `list`'s polygons, taken once per list per pass
 *  (`cache` lives for one `stepShells` call — see there). */
function targetBoxesOf(cache: Map<readonly Target[], readonly PolyBox[]>, list: readonly Target[]): readonly PolyBox[] {
  let boxes = cache.get(list);
  if (boxes === undefined) {
    boxes = list.map((t) => polyBox(t.poly));
    cache.set(list, boxes);
  }
  return boxes;
}

function ddaAxis(origin: number, cell: number, idx: number, a: number, d: number, out: DdaAxis): DdaAxis {
  if (d === 0) {
    out.step = 0;
    out.tDelta = Infinity;
    out.tMax = Infinity;
    return out;
  }
  out.step = d > 0 ? 1 : -1;
  const edge = origin + (idx + (out.step > 0 ? 1 : 0)) * cell;
  out.tDelta = cell / Math.abs(d);
  out.tMax = (edge - a) / d;
  return out;
}

// The fog walk's scratch (one walk at a time, never re-entrant): reused so a
// tick's walks allocate nothing.
const FOG_DDA_X: DdaAxis = { step: 0, tDelta: 0, tMax: 0 };
const FOG_DDA_Y: DdaAxis = { step: 0, tDelta: 0, tMax: 0 };
const FOG_CLIP = { t0: 0, t1: 1 };
const FOG_SPAN = { sx: 0, sy: 0, dx: 0, dy: 0 };
const FOG_RUN = { free: false, first: true };

/**
 * The sight gate's early exits for one fog walk (`World.fogSightAdmits`).
 * `acceptBelow`: the gate holds whenever the walk's FINAL sum (Σ density ×
 * fraction of the span) is at most this — already less FOG_DECIDE_SLACK.
 * `d` / `range`: the final comparison's own operands, for the reject.
 * `verdict` is the walk's answer when it stopped early: +1 seen, −1 not,
 * 0 undecided (the walk ran to its end).
 */
interface FogBounds {
  acceptBelow: number;
  d: number;
  range: number;
  verdict: number;
}

/** The toll's bounds: nothing ever decides early. */
const FOG_NO_BOUNDS: FogBounds = { acceptBelow: -Infinity, d: 0, range: Infinity, verdict: 0 };
/** The gate's bounds scratch (one walk at a time). */
const FOG_BOUNDS: FogBounds = { acceptBelow: 0, d: 0, range: 0, verdict: 0 };

/**
 * Slack (u) the sight gate's "seen whatever the rest of the fog" bound keeps
 * under `range`: the walk's float dust is ~1e-9 u at board scale (a few
 * hundred additions of terms ≤ 1e4 u), so 1e-6 u makes the early "seen"
 * strictly safe — a ray that close to the edge simply walks to the end and
 * takes the reference comparison.
 */
const FOG_DECIDE_SLACK = 1e-6;

/**
 * Has the gate's answer been decided after the cells up to span fraction
 * `tDone`, with `sum` so far? Seen: even at density 1 over the whole
 * remainder the final sum stays under `acceptBelow`. Not seen: the running
 * toll alone (`sum × len × cost`, the final comparison's own expression in
 * its own operation order — and the sum only grows) already puts the ray
 * past `range`; `scale` (= len × cost) is only the cheap pre-test that
 * guards it. Sets `bounds.verdict`.
 */
function fogDecided(bounds: FogBounds, sum: number, tDone: number, len: number, scale: number): boolean {
  if (sum + (1 - tDone) <= bounds.acceptBelow) {
    bounds.verdict = 1;
    return true;
  }
  if (sum > 0 && bounds.d + sum * scale > bounds.range && bounds.d + sum * len * CONFIG.fog.sightCostPerU > bounds.range) {
    bounds.verdict = -1;
    return true;
  }
  return false;
}

/** Is (ax, ay, bx, by, d, range) the question the gate memo holds? */
function sameGateQuestion(
  memo: { ax: number; ay: number; bx: number; by: number; d: number; range: number },
  ax: number, ay: number, bx: number, by: number, d: number, range: number,
): boolean {
  return memo.ax === ax && memo.ay === ay && memo.bx === bx && memo.by === by && memo.d === d && memo.range === range;
}

/** Liang–Barsky on one axis: narrow [t0, t1] to where `a + d·t` lies in [lo, hi]. */
function clipAxis(a: number, d: number, lo: number, hi: number, t: { t0: number; t1: number }): boolean {
  if (d === 0) return a >= lo && a <= hi;
  const tA = (lo - a) / d;
  const tB = (hi - a) / d;
  t.t0 = Math.max(t.t0, Math.min(tA, tB));
  t.t1 = Math.min(t.t1, Math.max(tA, tB));
  return t.t0 <= t.t1;
}

/** The coverage lattice's radius for `ring`: never below one bank's size
 *  (`wavelengthU`), so the final close cannot shrink the quantile to a point. */
function fogLatticeRadius(ring: ZoneRing): number {
  return Math.max(ring.r, CONFIG.fog.wavelengthU);
}

/** The cell index of coordinate `v` on an axis from `origin`, clamped into [0, side). */
function memoIndex(origin: number, cell: number, side: number, v: number): number {
  const i = Math.floor((v - origin) / cell);
  return i < 0 ? 0 : i >= side ? side - 1 : i;
}

/**
 * WAS THIS HULL IN COMBAT? (Story 10.9 review gate — the quitter wreck.) Eric,
 * 2026-11-09, verbatim: "If a player is about to sink another ship, and that
 * other ship's player disconnects right before I get the kill, and I get
 * denied XP and/or a wreck, that'd be pretty shitty. So yeah if they
 * disconnect out of the blue, nothing, but if the ship was in combat when
 * they disconnect, wreck."
 *
 * In combat = the hull's ASSIST LEDGER (`damageFrom`) holds at least one
 * entry stamped within `CONFIG.xp.assistWindowMs` of `now` — the same window
 * that pays assists. The ledger's keys are attacking HULL ids by construction
 * (creditDamage excludes self-hits and the storm never routes through it).
 * At window 0 (the split switched off) any entry counts — though the ledger
 * is then never written, so a scuttle there leaves no crate. Pure: reads only
 * its arguments.
 */
export function inCombat(ship: Pick<ShipRecord, 'damageFrom'>, now: number): boolean {
  const windowMs = CONFIG.xp.assistWindowMs;
  for (const tally of ship.damageFrom.values()) {
    if (windowMs <= 0 || now - tally.at <= windowMs) return true;
  }
  return false;
}

export class World {
  readonly map: GameMap;
  readonly playerCap: number;
  readonly ships = new Map<string, ShipRecord>();
  /** All in-flight ballistics (gun shells AND torpedoes), keyed by id. */
  readonly shells = new Map<string, ShellState>();
  /** All live dropped mines (static points), in drop order. */
  readonly mines = new Map<string, MineState>();
  /** AIRDROPS (Story 10.9, epic-10 amendment 18): every live crate on the
   *  water, keyed by id, in placement order. Intangible — never a Target, a
   *  body, a contact or a storm victim in the ship sense; spawned, collected
   *  and storm-destroyed by this world's own step rows; read by perception's
   *  drop scan (sight + the radar disc paint). */
  readonly drops = new Map<string, DropState>();
  /**
   * THE MULTI-SPECTRAL COUNTERMEASURE clouds (Story 9.3; Eric rulings
   * 2026-10-11, epic-9 amendments 40–47 — 8.18's smoke store's seat), keyed
   * by id (`cl${n}`), in PRESS order. Each is a stationary cloud made at its
   * owner's centre by a SMOKE press (makeCloud — ONE per press; the press is a
   * cooldown ability since Story 10.5), born at `bornAt`, deleted by stepClouds once `now >= until`
   * (bornAt + lifeMs). A CLIENT VISUAL OVERLAY (Story 9.3 session 2, Eric
   * 2026-10-12): it occludes NO sensor on the server; the `cloud` registry
   * row ships each cloud a client may sense as `{id,x,y,t0}` and the client
   * paints it. WORLD-
   * OWNED, not on the hull: a cloud runs its full life through its owner's
   * sink, redeploy, respawn or leave (amendment 127 — everything on the water
   * outlives its owner); only resetForMatchStart clears the map (the mines
   * precedent). Exposed read-only to perception through `cloudRecords`; the count alone feeds `/metrics` (cloudCount).
   */
  readonly clouds = new Map<string, StoredCloud>();
  /**
   * THE FOG FIELD (Story 9.10; Eric 2026-10-14/15 — "no discs, it won't look
   * like realistic rolling fog", "make it performant"; epic-9 amendments
   * 149–150, 163–164, 167–170, 172–173). Fog is a continuous DENSITY FIELD
   * over the whole ocean (shared sim/fog.ts — the ONE derivation both sides
   * run): two wind-advected fbm layers cross-faded on a slow triangle wave,
   * mapped to density by a soft step over `edgeBand` above a COVERAGE CUT.
   * PUBLIC WEATHER: `fogSeed` rides the welcome and the cut rides the schema
   * (`ArenaState.fogCut`), so a client evaluates the same field — where fog
   * is, never where hulls are. Nothing per-observer about fog is ever on the
   * wire (the declared perception exceptions are SIX — amendment 162 is
   * MOOT); fog reaches a client only as the TOLL inside every sight predicate
   * (`fogTollAlong` below, through signals.ts `eyeHolds`): a ray pays
   * `sightCostPerU × density` extra sight distance per unit crossed, so a
   * hull inside the geometric bubble that fog hides is no contact — but radar
   * has no inner edge (amendment 210, superseding 163's "dark to both"), so
   * the beam still paints it. Radar,
   * zone circles, the foghorn and the storm never read the field. THE OWN
   * BANK IS FREE (Eric 2026-10-16, amendment 179 — "like grass patches in
   * League"): an observer standing in solid fog pays nothing along the ray
   * until it first leaves solid fog, full price after; and the field is 0
   * beyond the ocean's rim (fog only where islands could be).
   *
   * The seed is the map seed under its own constant — the client-known map
   * seed is fine here: the field is weather, not a hull position.
   */
  readonly fogSeed: number;
  /** The built field (makeFogField over `fogSeed` and CONFIG.fog), read-only. */
  private readonly fogField: FogField;
  /** All live star-shell lit zones (static circles), in burst order (Story 1.7). */
  readonly litZones = new Map<string, LitZone>();
  /** All live PHOSPHOR SHELLS burning zones (static circles), in burst order
   *  (Story 8.17). A SEPARATE store from `litZones` by design — see BurnZone:
   *  nothing that reveals or extends reach ever iterates it. */
  readonly burnZones = new Map<string, BurnZone>();
  /** All live FOULING SHELL foul zones (static circles), in burst order
   *  (Story 9.4). A SEPARATE store from both zone stores above by design —
   *  see FoulZone: nothing that reveals, burns or extends reach iterates it,
   *  and nothing here iterates them. */
  readonly foulZones = new Map<string, FoulZone>();
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
  /** Drives combat-bot AI captains through the normal input path (Story 6.4,
   *  game/ai/botDriver.ts) — perception-gated. The controller never sees this
   *  World: it gets the narrow port at
   *  construction and a per-tick BotTickEntry array (each bot's own record +
   *  a bound observe() thunk — see botEntries()), so ai/ is structurally
   *  incapable of reaching world internals. Nothing in production constructs
   *  a bot this cycle (harness + tests only; Story 6-5 wires the mode). */
  readonly bots: BotController;
  /** Monotonic bot ordinal — the ship id namespace `bot-N` (never collides
   *  with Colyseus session ids or `trk-` pseudonyms). */
  private botSeq = 0;
  /**
   * THE COLLECTOR'S PER-TICK MEMO (Story 8.4, AR44), keyed by sorted mask.
   * Cleared in the tick PROLOGUE (step(), beside the clock advance); entries
   * carry the generation they were built at so a sink or a mine deletion
   * retires them without a second pass.
   */
  private readonly tickTargets = new Map<string, { gen: number; list: Target[] }>();
  /**
   * THE COLLECTOR'S GENERATION. Every writer that takes a target OFF the water
   * — or puts one on it — bumps this, and a memoized list built at an older
   * generation is rebuilt on the next ask. The complete writer list:
   *   sinkShip     — the wreck leaves every list from that instant.
   *   consumeMine  — the one mine-deletion path (detonation, captive launch).
   *   spawnMine    — a new mine is not a target YET (still arming), but the
   *                  store changed and a memo must not outlive it.
   *   removeBurstOrdnance — a burst took a fish off the water (Story 8.15).
   *   sinkBeacon   — a RADIO BEACON destroyed afloat stops being hittable at
   *                  once (Story 10.8, R6): later shells this tick pass through.
   * Nothing else writes it; adding a writer means adding it here.
   */
  private targetsGen = 0;
  /**
   * HULLS THAT SANK THIS TICK, with their silhouettes COPIED at sink time
   * (amendment 19). They are not collision subjects any more — the collector
   * excludes them the instant the generation bumps — but a burst covering one
   * still counts it as a GEOMETRIC victim for the hit-call mark: `hc`, no
   * damage, no assist. Cleared in the tick PROLOGUE, which is what makes "this
   * tick" literally true: sinkShip is reachable BETWEEN ticks (match.ts's
   * leave-scuttle, a directed test), and clearing at the end of a step instead
   * would carry such a wreck into the following tick.
   */
  private sunkThisTick: Target[] = [];
  /** ms since world creation — the one server clock. */
  now = 0;
  /** Fixed-step counter. */
  tick = 0;

  // --- Combat policy flags (driven by the match lifecycle, game/match.ts) ---
  // Defaults are permissive so a standalone World (unit tests, sandbox smokes)
  // behaves exactly like the pre-lifecycle simulation; Match imposes phase
  // policy on top (waiting/countdown: no damage; active: no respawn).

  /**
   * THE HULL-CONTACT SEAM (Story 9.5, amendments 25, 73–82) — the private
   * per-tick stores the two contact rows share, reused every tick:
   *   - `contactBodies`: one `ContactBody` per hull, cached by id so the 20 Hz
   *     loop allocates nothing per tick; `mass` is re-read from
   *     `ship.stats.armor` (the ARMOR index off effectiveStats — the ONLY mass
   *     source since Story 10.3, ruling 2; HUNKER's bonus adds no mass) every
   *     tick and `poly` aliases the record's `hullPoly` scratch.
   *   - `hullContacts`: this tick's overlapping pairs, written by
   *     resolveHullContacts and read by applyContactDamage.
   *   - `contactLatch`: the ONCE-PER-CONTACT latch — the sorted pair key of
   *     every pair whose hit has been CHARGED and that overlapped last tick.
   *     THE LATCH ARMS ONLY ON A CHARGED HIT (Eric 2026-10-13, amendment
   *     83): an unlatched pair is measured every tick it overlaps, the first
   *     tick over the allowance is the hit and latches it, and only a tick
   *     with no overlap re-arms it. Under the allowance nothing latches, so
   *     creeping in and then shoving pays the shove.
   *   - `grindingNow`: the bleed bucket keys fed this tick; every open bleed
   *     window NOT in it has stopped and flushes (the burn's own rule).
   * Nothing here rides the wire.
   */
  private readonly contactBodies = new Map<string, ContactBody>();
  /**
   * THE SETTLED-POSE CACHE (fix 2026-10-14, the many-hulls tick cost).
   * Per hull, the last pose the island resolver was handed AND returned
   * untouched with no land contact — a pose that overlaps no island and needs
   * no map-edge clamp. Resolving such a pose is a pure function of the pose,
   * the silhouette, the islands and the map radius (the previous pose and the
   * speed only matter once a push or a rollback happens, and none does), so a
   * hull whose candidate this tick is EXACTLY that pose — it sat still, and no
   * hull push moved it — skips the resolver with the identical answer
   * ({contact: false, headOn: 0}, pose unchanged, damp a no-op). Keyed by
   * record so a fresh record never inherits one; every key it depends on is
   * stored and re-checked. Server-only, never on the wire. The client
   * predictor keeps calling the resolver — it resolves one hull, and its
   * answer is the same by construction.
   */
  private readonly settledPoses = new WeakMap<ShipRecord, SettledPose>();
  /** Test seam: false runs every hull through the resolver every tick (the
   *  pose-identity pin compares the two). */
  settledPoseSkip = true;
  private readonly contactBodyList: ContactBody[] = [];
  private readonly hullContacts: HullContact[] = [];
  private readonly contactLatch = new Set<string>();
  private readonly contactKeysNow = new Set<string>();
  private readonly grindingNow = new Set<string>();
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
   * perception emits no blip of any kind (ship or wake).
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
  /** The map seed — kept so per-ship draw streams (drawRngFor) derive from it. */
  private readonly seed: number;
  // (`dropoutSeed`, `wakeKeys` and `wakeKeyOf` — the radar dropout roll's
  // seed and its wake target keys, Story 9.8 — were REMOVED 2026-11-12,
  // Story 11.2, R8, with the dropout itself.)
  /**
   * THE PLAIN-HULL HANDLE KEY AND MINT COUNTER (Story 11.2, R3): every
   * `PlainContact.h` is `plainHandle(plainKey, plainSeq++)` — a keyed hash of
   * a room-wide counter, so a handle names nothing (game/plainHandle.ts has
   * the full argument). The key is derived from `dispersionKey` under its own
   * label; the counter never leaves the server.
   */
  private readonly plainKey: Buffer;
  private plainSeq = 0;
  /**
   * THE PAINT-SALT KEY (Story 11.2 review gate, F1): every wire-bound radar
   * mask (`blip`, `wk`) is fuzzed on a seed salted with
   * `paintSalt(paintKey, kind, the paint's own words)` so the fuzz cannot be
   * replayed from a pose a contact row discloses (game/paintSalt.ts has the
   * full argument). Derived from `dispersionKey` under its own label.
   */
  private readonly paintKey: Buffer;
  /**
   * Stable per-ship JOIN ORDINAL counter (Story 2.8): assigned once per
   * addShip, never reused or decremented, so a ship's draw stream is a pure
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
   * OPEN DoT EVENT BUCKETS (Story 2.8 review, P4), keyed by dotKey(zone
   * owner, victim) for the burn and grindKey(attacker | `land`, victim) for
   * the contact bleed (Story 9.5): the applied-but-not-yet-reported DoT for
   * that pair and the server time its window opened. hp is ALREADY
   * deducted — this only defers the victim-private `dmg` event (see
   * applyZoneEffects and applyContactDamage; each flushes only its own keys).
   */
  private readonly dotBuckets = new Map<string, { victimId: string; amount: number; since: number }>();
  private mineSeq = 0;
  private litZoneSeq = 0;
  private burnZoneSeq = 0;
  private foulZoneSeq = 0;
  private cloudSeq = 0;
  /**
   * THE COVERAGE CUT — the noise threshold the live field is cut at:
   * `FOG_NO_CUT` (9, a value no fbm reaches → density 0 everywhere) before
   * the zone timeline starts, and the shared `fogCutForTarget` — the
   * (1 − target) quantile of the noise over a lattice inside the live ring
   * minus half the edge band, so the SOLID share (density ≥ ½) of the
   * ring's area IS the target at every ring size (amendment 178; the thin
   * edge below ½ is extra, about ten points of the ring at a 22 % dial) —
   * slewed at most `cutRatePerS` between refreshes (the FIRST live refresh
   * snaps straight to its goal — a slew-in is a staging call for Eric).
   * Match-wide weather like the zone rings: mirrored onto `ArenaState.fogCut`
   * by the room, never per-ship, never spatial. Read through `fogCut`.
   */
  private fogCutValue = FOG_NO_CUT;
  /** TEST-ONLY: `setFogCutForTest` pinned the cut — stepFog leaves it alone. */
  private fogCutPinned = false;
  /** The controller's coverage target (share of the live ring's area),
   *  redrawn on `fogRng` every `CONFIG.fog.targetPeriodMs`; 0 until the first live refresh. */
  private fogTarget = 0;
  /** Server ms the coverage target is next redrawn (0 = on the first live refresh). */
  private fogNextTargetAt = 0;
  /** Server ms of the next cut + epoch refresh (0 = on the first live tick). */
  private fogNextRefreshAt = 0;
  /** The quantile lattice (fogLattice's reusable `out` — allocated once, refilled per refresh). */
  private readonly fogLatticePts: { x: number; y: number }[] = [];
  /** The lattice's points ON THE OCEAN (references into `fogLatticePts`, amendment 179 — see `fogControllerLattice`). */
  private readonly fogOceanPts: { x: number; y: number }[] = [];
  /** The realized fogged share over the last lattice (points at density ≥ FOG_SOLID_DENSITY / points), for metrics + tests. */
  private fogCoverageShare = 0;
  /**
   * THE DENSITY MEMO (Eric: "make it performant"; the review gate's EXACT
   * re-cut of the heuristic quick-reject raster). The server's toll IS a
   * cell walk: a fixed world lattice of `marchStepU` (10 u) cells over the
   * ocean's bounding square (+ FOG_MEMO_MARGIN_U, one cell, each side —
   * 1,002² ≈ 1.0 M cells at a 5,000 u radius, ~8 MB of Float32 + Uint32;
   * zero pages until a ray first touches them, allocated ONCE
   * in the constructor), and `fogTollAlong` sums `density(cell centre) × length of
   * the ray inside the cell × sightCostPerU` over the cells an
   * Amanatides–Woo DDA visits. A cell's density is MEMOIZED per EPOCH: first
   * touch in the current epoch evaluates the shared `fogDensityAt` at the
   * epoch's clock and cut and stores it; later rays reuse it. There is no
   * "reject vs march" to disagree — every ray reads the same lattice, and a
   * narrow peak between samples cannot hide (every 10 u cell the ray
   * crosses is read). THE OWN BANK (amendment 179): the walk is directional
   * — when the shared density at the observer's exact position is solid,
   * the observer's own cell and the leading run of solid cells are read but
   * not charged (`fogPayCell`); the first thinner cell ends the run. The
   * EPOCH advances at every fog refresh (`refreshMs`,
   * when the cut may slew): `fogEpochT` is that refresh's clock, so the
   * field the server tolls is at most `refreshMs` old. Since the spin
   * (amendments 177–178) the pattern moves `spinRimU` (1 u/s) at the rim
   * plus the wind (1 u/s), so at `refreshMs` 500 the server's field trails
   * the client's by at most a unit or so (the cycle-192 sizing was for a
   * 26 u/s rim; the epoch is kept at 500 ms). The shared midpoint march
   * (`fogTollAlong` in sim/fog.ts) stays the REFERENCE the client and the
   * tests integrate; the server walk agrees with it to one cell's
   * quantization at each end (fogField.test.ts).
   */
  private readonly fogMemo: FogMemo;
  /** The current fog epoch (starts at 1; `fogMemo.epoch` 0 = never evaluated). */
  private fogEpoch = 1;
  /** The one-entry own-bank memo (see `fogObserverInSolidFog`): the last observer position asked about, in which epoch, and the answer. */
  private readonly fogObserverMemo = { x: NaN, y: NaN, epoch: 0, solid: false };
  /**
   * The one-entry TOLL memo (Story 11.2 review gate, F2): the last ray
   * tolled, in which epoch, and its toll. For a hull inside the class reach
   * the ship scan asks about the one observer → target ray twice in a row
   * (the `contact` row, then the `plain` row's "not a full contact" term) —
   * the toll is a pure function of (ray, epoch), so the repeat is a compare
   * instead of a lattice walk (2 walks → 1 per inner-tier pair per pass; an
   * outer-tier pair was already 1).
   */
  private readonly fogTollMemo = { ax: NaN, ay: NaN, bx: NaN, by: NaN, epoch: 0, toll: 0 };
  /**
   * The one-entry GATE memo (Story 11.2 follow-up): `fogSightAdmits`' last
   * question and its answer — the toll memo's job on the sight path, where
   * the `plain` row re-asks the `contact` row's question for the same pair.
   */
  private readonly fogGateMemo = { ax: NaN, ay: NaN, bx: NaN, by: NaN, d: NaN, range: NaN, epoch: 0, seen: false };
  /** Lattice walks since construction — the toll memo's accounting (tests). */
  private fogWalkCount = 0;
  /**
   * THE ISLAND BROADPHASE INDEX (Story 11.2 follow-up — shared
   * sim/islandIndex.ts): derived from `map.islands`, built on first use and
   * rebuilt if the list is ever rewritten (tests do; a production map never
   * changes). Read through `islandIndex`, once per pass.
   */
  private islandIdx: IslandIndex | undefined;
  /** Island narrow-phase tests of indexes this World has since replaced (see `losTests`). */
  private losTestsRetired = 0;
  /** The clock the current epoch's densities are evaluated at (the last refresh's `now`). */
  private fogEpochTValue = 0;
  /** Cells evaluated since construction (perf accounting — fogField.test.ts's memo-determinism test reads it). */
  private fogCellEvalCount = 0;
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
   * THE FOG STREAM (Story 9.10): the coverage TARGET's wander — the one fog
   * draw left (the field itself is seeded, never drawn). ROOM-PRIVATE
   * entropy like the beacon stream: it rides `opts.pseudonymSeed` (the
   * TEST-ONLY map-seed fallback otherwise) under its own constant 0x3c6ef372
   * (unused by any other stream mint in the codebase — 0x7f4a7c15 is the bot
   * SPEND_STREAM_K), so a client holding the wire map seed cannot predict
   * where the coverage band is heading. NEVER Math.random().
   */
  private readonly fogRng: Rng;
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

  /**
   * IS THE START-LINE COUNTDOWN OPEN — the ONLY thing this sim knows about the
   * match phase, and it exists for exactly one job: gating the level-zero
   * MULLIGAN (Story 8.10, FR48).
   *
   * WRITTEN BY `Match` and by nothing else: true at `startCountdown()`, false
   * at `activate()` and on the cancel back to `waiting`. It is a FLAG rather
   * than a `Match` import because `world.ts` must not depend on `match.ts` —
   * the sim is unit-tested bare, with no state machine in the room — while
   * `match.ts` already owns every transition. A standalone World leaves it
   * false, so `mulligan()` fail-closes there unless a test opens it
   * deliberately.
   */
  countdownOpen = false;
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
  /** The card catalog applyCard resolves ids against (injectable — tests;
   *  production defaults to the shared CATALOG). */
  private readonly catalog: Catalog;

  /**
   * THE MATCH-WIDE TAKE LEDGER (Story 8.14, epic-8 amendments 90/91): for each
   * EQUIPMENT line, the ids of the participants who have taken COPY 1 of it
   * this match. It is the ONE input to the weapon WEIGHTING — `weightsFor`
   * turns it into a per-ship (line -> weight) map and `sim/draw.ts` consults
   * that inside stage 2 of the draw and nowhere else.
   *
   * WHAT GOES IN, exactly once per (ship, line): `recordTake`, called from
   * `applyCard` the moment an equipment line goes from 0 to 1 copies for that
   * ship. Copies 2+ (tier cards) never record — a take is the BARE WEAPON
   * arriving, not a bump (amendment 90). Ladders and add-ons never
   * record.
   *
   * WHAT NEVER COMES OUT: nothing. A take is PERMANENT FOR THE MATCH — the
   * taker sinking, leaving or being removed restores nothing (amendment 90),
   * so the set only ever grows and there is no lifetime to keep in step.
   *
   * SHIPS AND NOT COUNTS, because SELF-EXCLUSION needs to know WHO: the
   * taker's own weight for the line they took is untouched, so `weightsFor`
   * subtracts the asking ship from the set before it weighs.
   *
   * SERVER-PRIVATE, absolutely: neither the ledger nor any weight derived from
   * it rides a frame, the welcome, the schema, `/metrics`, the results or a log
   * line (pinned in perception.test.ts). Another captain's picks are build
   * information.
   */
  readonly takes = new Map<LineId, Set<string>>();

  /**
   * THE MATCH'S ONE SPAWN LATTICE (Eric ruling 2026-08-16). Every placement
   * edge — addShip, redeployShip, respawn — passes this to pickSpawn, so all
   * hulls come off a SINGLE rotated ring of `SPAWN_CANDIDATES` slots instead of
   * each drawing its own. That is what delivers the ruled outcome (*"No
   * participants should start so close to each other that they can see each
   * other, let alone radar scan each other"*): a full lobby fills distinct
   * slots at the lattice's even pitch, 2·spawnRing·sin(π/playerCap) — ≈1,560.7u
   * against 1,500u of radar since Story 9.8 (Eric 2026-10-13, 16 captains on a
   * 10,000 u ocean); 700.8u against 660u at the time of the ruling. Per-hull
   * phases measured 352-483u then — inside radar on every seed.
   *
   * ITS OWN DECORRELATED STREAM, not a draw off `this.rng`, for two reasons:
   * the phase must not shift with HOW MANY hulls get placed (a draw off the
   * shared spawn stream would reorder every later sample), and one value read
   * once wants a stream it cannot desynchronize from. 0xb5297a4d is unused by
   * any other stream here (spawn 0x9e3779b9, pseudonym 0x1b873593, draw
   * 0x165667b1, bots 0xc2b2ae35; 0x85ebca6b was the retired PvE fleet's
   * steering stream (Story 10.8), 0x6c078965 the retired drone-drop stream's
   * (Story 10.5) and 0x94d049bb the retired CHAFF fake stream's; the
   * room-private airdrop stream is 0x5bd1e995, its pickup sub-stream key
   * 0x3c6ef35f — Story 10.9; 0x51ed270b was its retired wreck sub-stream key;
   * the beacon stream 0x68e31da4, the retired dropout seed 0x2545f491 (Story 11.2), fog 0x3c6ef372).
   * 0x2c1b3c6d was Story 11.1's first DISPERSION stream constant (XORed into
   * the pseudonym material) — RETIRED at its review: a shooter sees its own
   * exact landings, so a 32-bit seed off `priv` could be brute-forced back to
   * `priv` and with it every room-private stream here. Dispersion now has its
   * own per-room key (`WorldOptions.dispersionKey`, an HMAC per shell) and
   * draws on NO constant in this roster.
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


  /** THE RADIO BEACON SWITCH (Story 10.8) — see WorldOptions.beacons. False
   *  only when a dev smoke asked for no beacons. */
  private readonly beaconsEnabled: boolean;
  /**
   * THE RADIO BEACONS (Story 10.8, Eric 2026-11-06, epic-10 amendment 14):
   * the cycle's beacon store (game/beacons.ts). Public so the harness can
   * read its counters (`beacons.inRangeTicks`, `beacons.records`); the ROOM
   * and the bots read ONLY `beaconChart` — the public facts. A beacon is
   * never a ShipRecord: it is absent from `ships`, so perception, the storm,
   * the bounty and the win check cannot see one.
   *
   * Its placement stream is ROOM-PRIVATE (the pseudonym material under its
   * own constant, 0x68e31da4 — unused by any other stream here): beacons are
   * placed max-min against the captains' positions, so a stream a client
   * could replay off the public map seed would turn the public chart into a
   * position oracle. The map-seed fallback is for standalone Worlds only.
   */
  readonly beacons: BeaconField;

  /** THE AIRDROP SWITCH (Story 10.9) — see WorldOptions.drops. False only
   *  when a dev smoke asked for no scheduled drops. */
  private readonly dropsEnabled: boolean;
  /**
   * THE AIRDROP STREAM SEED (Story 10.9, epic-10 amendment 18). ROOM-PRIVATE
   * like the beacons' (the pseudonym material under its own constant,
   * DROP_STREAM_K = 0x5bd1e995 — unused by any other stream here; see the
   * spawnPhase doc for the roster): a drop's position and stat must not be
   * predictable from the public map seed. Every MINUTE BATCH (positions +
   * kinds) draws on its own sub-stream `dropSeed ^ imul(m + 1, 0x9e3779b9)`
   * and every PICKUP (the amount — and a wreck's stats — rolled when a hull
   * takes the crate, Eric 2026-11-08) on
   * `dropSeed ^ imul(PICKUP_DROP_K + k, 0x9e3779b9)` (k = the pickup count),
   * so a skipped spot, an extra wreck or a pickup never shifts another
   * batch's draws. The per-ship `drawRng` is never touched (it would shift
   * later offers).
   */
  private readonly dropSeed: number;
  /**
   * THE DISPERSION KEY (Story 11.1, Eric 2026-11-12, R5; review fix). Where a
   * gun shell lands must not be predictable — from the public map seed, from
   * another shell's landing, or from any other stream. Every dispersed shell
   * (main battery, secondaries) draws on `shellSeedFor(ordinal)` = the first
   * 4 bytes of HMAC-SHA256(this key, ordinal as 8-byte big-endian), the
   * ordinal being the shell's own projectile sequence number (`shellSeq`): one
   * shell's seed never depends on another, a brute-forced seed reveals nothing
   * about the key, and a replay with the same key and inputs lands every
   * shell on the same point. See WorldOptions.dispersionKey for where the key
   * comes from (a random per-room key; a seed-derived one OFFLINE only).
   */
  private readonly dispersionKey: Buffer;
  /** The next match minute whose batch has not been scattered yet. */
  private nextDropMinute = 0;
  /** Wreck pickups placed this World's life — the id suffix (`drp-w-<k>`:
   *  the victim's id never rides the drop id). */
  private wreckDrops = 0;
  /** Crates collected this World's life — the pickup sub-stream key. */
  private dropPickups = 0;

  constructor(
    seed: number,
    playerCap: number = CONFIG.map.playerCap,
    zoneCfg: ZoneTimeline = CONFIG.zone,
    opts: WorldOptions = {},
  ) {
    this.hookRegistry = opts.hookRegistry ?? HOOK_REGISTRY;
    this.catalog = opts.catalog ?? CATALOG;
    // The ROOM-PRIVATE entropy every private stream below mints from: the
    // caller's pseudonym material, or the TEST-ONLY map-seed fallback.
    const priv = opts.pseudonymSeed ?? (seed ^ 0x1b873593);
    this.beaconsEnabled = opts.beacons !== false;
    this.beacons = new BeaconField((priv ^ 0x68e31da4) >>> 0);
    this.dropsEnabled = opts.drops !== false;
    this.dropSeed = (priv ^ DROP_STREAM_K) >>> 0;
    // A copy, so the caller's buffer cannot be mutated under the World; the
    // seed-derived key is the OFFLINE fallback only (see WorldOptions).
    this.dispersionKey = opts.dispersionKey !== undefined ? Buffer.from(opts.dispersionKey) : offlineDispersionKey(seed, priv);
    this.plainKey = plainHandleKey(this.dispersionKey);
    this.paintKey = paintSaltKey(this.dispersionKey);
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
    this.pseudonymRng = mulberry32(priv >>> 0);
    // Bot decision stream (Story 6.4), decorrelated from every other stream
    // here (0xc2b2ae35 is unused by any of them — see the spawnPhase doc for
    // the roster of constants in use).
    // Story 9.13 (amendment 190): the port is an explicit adapter now —
    // game/botPort.ts derives the bot's zone readouts from the same public
    // inputs a client holds (it no longer passes `this`).
    this.bots = new BotController(makeBotPort(this, this.zoneCfg), (seed ^ 0xc2b2ae35) >>> 0);
    // Fog stream (Story 9.10): room-private entropy, its own constant — see the field.
    this.fogRng = mulberry32((priv ^ 0x3c6ef372) >>> 0);
    // The fog FIELD (Story 9.10): public weather off the map seed under the
    // same constant (a different mint — the field is derived on both sides
    // from the welcome's `fogSeed`, so it is not a stream).
    this.fogSeed = (seed ^ 0x3c6ef372) >>> 0;
    this.fogField = makeFogField(this.fogSeed, CONFIG.fog, this.map.radius);
    // The density memo lattice — one allocation for the World's life (see fogMemo).
    const memoCell = CONFIG.fog.marchStepU;
    const memoHalf = this.map.radius + FOG_MEMO_MARGIN_U;
    const memoSide = Math.max(1, Math.ceil((2 * memoHalf) / memoCell));
    this.fogMemo = {
      ox: -memoHalf,
      oy: -memoHalf,
      cell: memoCell,
      side: memoSide,
      dens: new Float32Array(memoSide * memoSide),
      epoch: new Uint32Array(memoSide * memoSide),
    };
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
   *  structurally distinct from Colyseus session ids and 'bot-N' ids, and
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
   * THE PLAIN-HULL HANDLE `observer` holds for the hull `targetId` (Story
   * 11.2, R3) — get-or-mint. The ONE writer of `ShipRecord.plainHandles`
   * besides perception's per-pass forget. A fresh handle is the next
   * `plainHandle(plainKey, plainSeq)`; it is re-drawn on the (astronomically
   * unlikely) collision with a ship id or with a handle this observer
   * already holds, so a frame's handles are distinct and never a roster id.
   * `World.pseudonymFor` is NOT this: that id is stable for the match and
   * shared by every observer.
   */
  plainHandleFor(observer: ShipRecord, targetId: string): string {
    const held = observer.plainHandles.get(targetId);
    if (held !== undefined) return held;
    const fresh = this.mintPlainHandle(observer);
    observer.plainHandles.set(targetId, fresh);
    return fresh;
  }

  /**
   * THE SALT of one radar paint (Story 11.2 review gate, F1): a keyed hash
   * of the paint's own inputs (`words` = paint time + exact pose) under this
   * room's private paint key — see game/paintSalt.ts. Bound into the signal
   * context by perception.ts; read by the `blip` and `wk` shapers only.
   * ONE STABLE FUNCTION per World (an arrow property, never a per-context
   * closure): signals.ts keys its one-slot mask memos on its identity, so
   * consecutive observers of one room share a mask and two rooms never do.
   */
  readonly paintSaltFor = (kind: PaintKind, words: readonly number[]): number => paintSalt(this.paintKey, kind, words);

  /**
   * END EVERY PLAIN VISIT of one observer (Story 11.2 review gate, F3): drop
   * every plain-hull handle `observerId` holds, so each hull in its outer
   * band is minted a fresh one on the next pass. Perception forgets a handle
   * only DURING a pass, and a captain in reconnect grace gets no pass (frames
   * are built for connected clients) — so without this, a hull that left the
   * band and came back while the socket was down would keep its old handle
   * and the two visits could be linked across the gap. The room calls it at
   * the drop and again at the resume. An unknown id is a no-op.
   */
  forgetPlainVisits(observerId: string): void {
    this.ships.get(observerId)?.plainHandles.clear();
  }

  /** One fresh handle off the keyed counter (see plainHandleFor). */
  private mintPlainHandle(observer: ShipRecord): string {
    for (;;) {
      const h = plainHandle(this.plainKey, this.plainSeq++);
      if (this.ships.has(h)) continue;
      let taken = false;
      for (const existing of observer.plainHandles.values()) {
        if (existing === h) { taken = true; break; }
      }
      if (!taken) return h;
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
   * the bots steer against.
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
   * THE MAP'S NAV CACHE (Story 9.13, epic-9 amendment 192): the generator's
   * 32 u navigability grid plus the ring flow fields, one per map
   * (game/navCache.ts). Built on FIRST USE — the first bot tick — rather
   * than in the constructor, so a World that never sails a bot pays nothing;
   * the bot port reads this one instance. Flow fields are built lazily per ring
   * (the next ring at its reveal, the collapse ring at its close start), never
   * per tick.
   */
  get nav(): NavCache {
    return navCacheFor(this.map);
  }

  /** The ring the reveal hook last warmed (its key), so the hook is one
   *  compare per tick once the field exists. */
  private navWarmKey: string | null = null;

  /**
   * THE REVEAL HOOK (fix wave P8): build the revealed next ring's flow field
   * the first tick it exists. The same ring is the close's target through the
   * whole close, so the close start reads the field already built. Skipped
   * while no bot is aboard — a World nobody steers by the
   * field pays nothing — and retried each tick until one is.
   */
  private prewarmZoneNav(): void {
    const next = this.zoneRevealedNextRing;
    if (next === null) return;
    const key = `${next.cx}:${next.cy}:${next.r}`;
    if (key === this.navWarmKey || !this.hasAiHull()) return;
    this.navWarmKey = key;
    this.nav.fieldFor(next);
  }

  private hasAiHull(): boolean {
    for (const s of this.ships.values()) if (s.role !== 'captain') return true;
    return false;
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

  /**
   * Wire entry point: validate/store a raw input message for `id`.
   *
   * `arrivedAt` is the ARRIVAL time the rate cap counts on (ms, monotonic —
   * Story 11.2 follow-up; game/inputs.ts header): the ROOM passes its own
   * wall clock for every socket message, so a sim that steps slower than real
   * time cannot stretch one rate window over many wall seconds and shed an
   * honest 20 Hz client's inputs. Omitted — a bot (one submission per step)
   * and every directed test — the sim clock IS the arrival clock. The World
   * itself still reads no wall clock: the sim keeps its single clock, and
   * this number only feeds the transport's rate limiter.
   */
  submitInput(id: string, raw: unknown, arrivedAt: number = this.now): boolean {
    return this.inputs.submit(id, raw, arrivedAt);
  }

  /** The seat's transport dropped: stop its held-fire level for the whole
   *  reconnect grace (a machine gun must not stream on a ghost). The room
   *  calls this from onDrop before the grace window opens. */
  releaseHeld(id: string): void {
    this.inputs.releaseHeld(id);
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
   *  pass their picked ShipClassId (the envelope source is hullEnvelope).
   *  `horn` is the sanitized foghorn variant from the join option (Story 4.5).
   *
   *  `at` (Story 5.6) places the hull EXACTLY there instead of on the spawn
   *  ring — the first placement in the codebase that is neither the ring nor a
   *  redeploy (its production consumer, the PvE fleet wave, retired at Story
   *  10.8; tests still use it). Everything else about the record is
   *  identical, including the `spawn` event. A brand-new record's wake ring is
   *  FRESH, so the mandatory detachWake at a teleport has nothing to detach
   *  here — the bogus cross-map segment it exists to prevent is structurally
   *  impossible on this path.
   *
   *  `shift` (Story 10.4, epic-10 amendment 9 — in the seat GUN's place) is
   *  THE SEAT'S SHIFT — the captain's pick, sanitized at the door and frozen
   *  for the match. It defaults to DEFAULT_SHIFT for every caller that does
   *  not care. THERE IS NO DECK PARAMETER ANY MORE: decks are
   *  retired (amendment 89a) and every captain draws from the one common pool.
   *
   *  `fit` (Story 8.10, amendment 65) is the DEV-ONLY spawn fit — the ids a
   *  smoke's `fitOverride` asked this hull to come up holding. It defaults to
   *  NOTHING, which is every production join and every existing caller, and it
   *  is honoured for a CAPTAIN only (see spawnFit / applyDevFit).
   *
   *  `pose` (Story 9.15) is the DEV-ONLY spawn pose — a smoke's
   *  `spawnOverride`. Absent on every production join and every existing
   *  caller; honoured for a CAPTAIN only, it wins over `at` and is kept on the
   *  record (`devPose`) so the redeploy and respawn edges place the hull there
   *  again. */
  addShip(id: string, name: string, role: ShipRole = 'captain', hullId: HullId = DEFAULT_CLASS_ID, horn: HornId = DEFAULT_HORN_ID, at: Vec2 | undefined, shift: ShiftId = DEFAULT_SHIFT, fit: readonly string[] = [], pose?: DevPose): ShipRecord {
    const devPose = role === 'captain' ? pose : undefined;
    const { heading, ...p } = this.placement(id, devPose, () => at ?? pickSpawn(this.map, [...this.ships.values()].map((s) => ({ x: s.state.x, y: s.state.y })), this.rng, this.spawnPhase));
    const cls = hullEnvelope(hullId);
    const stats = effectiveStats(cls);
    // NO SPAWN SEED ANY MORE (Story 8.10, FR48, epic-8 amendment 62): the
    // interim spawn seed — the shipped class weapons a hull used to start
    // holding as cards — is DELETED. Every hull spawns holding NOTHING and the
    // first weapon arrives as a CARD from the level-zero offer the countdown
    // grants (grantOpening), drawn from the common pool like every card after.
    // The fit is the universal five-slot loadout and nothing else: the MAIN
    // BATTERY + THE SEAT'S SHIFT (Story 10.4) — the three family slots start
    // empty.
    const loadout = loadoutFor(stats, shift);
    const rec: ShipRecord = {
      id,
      name,
      role,
      hullId,
      cls,
      hullPoly: [],
      prevPose: { x: p.x, y: p.y, heading: 0, speed: 0 }, landContact: false,
      landHeadOn: 0, landWasContact: false, preDampSpeed: 0, lastDamageSrc: null, lastContactWasLand: false, contactDamageTaken: 0, landDamageTaken: 0, // Story 9.5 (clearContactState / clearContactTally)
      // THE SWEEP STARTS AT THE HULL'S HEADING (Eric ruling 2026-08-16), at
      // EVERY placement edge — here, redeployShip and respawn — so there is one
      // rule and not three. Constructing every hull at 0 phase-LOCKED every
      // hull: a boarding room freezes the sweep (advanceSweeps early-returns
      // while `radarEnabled` is false), so every captain's beam unfroze at
      // exactly 0 on the same tick and stayed in lockstep for the match, handing
      // a systematic, position-determined first-detection advantage. Anchoring
      // to the spawn heading decorrelates it from the placement itself.
      // prevSweepAngle MUST EQUAL sweepAngle: this tick's paint window is the
      // half-open arc [prev, sweep), so an equal pair is zero-width and paints
      // nothing on the hull's first tick.
      // (Wake ring provisioned from the TRUE attainable top speed — Story 4.12.)
      wake: createShipWake(hullId, World.wakeTopSpeed(stats)), sweepAngle: wrapPositive(heading), prevSweepAngle: wrapPositive(heading),
      // THE SEAT'S SHIFT (10.4) and the ship's private DRAW stream (8.14):
      // there is no deck to deal any more — the pool is the catalog and a draw
      // is a pure read of this record's own state (materializeOffer). The
      // turrets come up at rest and loaded, the secondaries cold (Story 10.4).
      shift, turrets: initialTurrets(hullId), launchers: [], racks: emptyRackBank(), sec: initialSecondaries(), devFit: World.spawnFit(role, fit), devPose, drawRng: this.drawRngFor(this.joinSeq++),
      bankedLevels: 0, indexBonus: World.noBonus(), offer: null, hands: [], mulliganed: false, openingGranted: false,
      xpMs: 0, level: 0, damageFrom: new Map(),
      cards: [],
      cardBehaviors: NO_BEHAVIORS,
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
      // A fresh hull carries no open windows — boost, HULL REPAIR pool
      // (2026-08-04), the mine's prop-fouling slow, the foul zone's slow
      // (Story 9.4) — the same four zeroed together at every other life
      // boundary (founderSinking / respawn / redeployShip / match start).
      // ...and a fresh combat clock (amendment 47): `lastDamagedAt` is `now`,
      // never 0. Both cooldown abilities READY (Story 10.5).
      boostUntil: 0, repairHp: 0, repairRate: 0, repairReadyAt: 0, smokeReadyAt: 0, lastDamagedAt: this.now, slowedUntil: 0, slowFactor: 1, fouledUntil: 0,
      // Story 8.15: no HUNKER window, and the machine gun's stream clock
      // at the epoch (fire on the first held tick), no stream live. No dazzle.
      hunkerUntil: 0, streamNextAt: 0, streamLive: false, dazzledUntil: 0,

      rttMs: null,
      lastFireT: 0,
      respawnAt: 0,
      nextSmokeAt: 0,
      cloudUntil: 0, // Story 9.3: a fresh hull has no cloud of its own up
      draft: 0, // Story 8.19: a fresh hull rides no wake until stepShips stamps it
      seenBallistics: new Set(), losHints: newLosHints(),
      torpDirs: new Map(),
      plainHandles: new Map(),
      loadout,
      // ONE tally (Story 5.6, amendment 38): `kills` counts human captains
      // AND, since Story 6.4 (Eric ruling B3: bots are ordinary combatants),
      // AI-captain bots. The Story 4.6 `captainKills` split stays retired.
      kills: 0,
      deaths: 0,
      damageDealt: 0, beaconXpMs: 0, dropsTaken: 0,
    };
    this.enrolShip(rec, p);
    return rec;
  }

  /** The new record's LAST three steps, split out of addShip (line budget):
   *  into the ship table, the dev spawn fit, the eager track id, the public
   *  `spawn` event. */
  private enrolShip(rec: ShipRecord, p: Vec2): void {
    this.ships.set(rec.id, rec);
    // THE DEV SPAWN FIT (Story 8.10, amendment 65), applied over the just-built
    // deck and loadout exactly as a pick would — and a no-op for every hull
    // that was not handed one, which is all of production.
    this.applyDevFit(rec);
    this.pseudonymFor(rec.id); // eager track id (R3) — see pseudonymFor / trackIds
    this.pending.push({ k: 'spawn', id: rec.id, x: p.x, y: p.y });
    // A HULL THAT ARRIVES MID-COUNTDOWN STILL GETS THE OPENING (Story 8.10;
    // the 8.10 review, P2). `grantOpening()` fired at startCountdown, before
    // this record existed, so without this line a late boarder — a captain
    // consuming the seat reserved for them, aboard after the countdown armed —
    // would stand on the start line at LV 0 with an empty bank and no hand
    // while everyone else refits. This is NOT a re-entry path: a production
    // room is locked
    // from birth and never unlocked, and a countdown drop is torn down at once
    // (dropPolicy holds a seat only while the match is active), so no captain
    // ever re-enters a countdown to collect a second opening; a resumed
    // reconnect reuses its existing record and never reaches addShip
    // (match.test / reconnect.test pin all three walls). AFTER the spawn
    // event, so the `pt` never precedes the hull it belongs to; guarded by the
    // same per-ship latch, so it can never double with the sweep.
    if (this.countdownOpen) this.grantOpeningTo(rec);
  }

  /**
   * Spawn one COMBAT BOT (Story 6.4): an AI captain — `role: 'bot'`, a real
   * ship class, a nautical callsign, a priority profile — enrolled with the
   * BotController (which rolls class/profile/callsign off its own seeded
   * stream) and then placed through the EXACT addShip path a human uses:
   * the shared spawn lattice (no `at` argument — bots never teleport in),
   * the same common-pool economy a human gets (a bot is a participant), a
   * roster-ready record. Ids are namespaced `bot-N`, structurally distinct from
   * Colyseus session ids and `trk-` pseudonyms.
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
  addBot(hull: ShipClassId | undefined, profile: AnyProfileId | undefined, shift?: ShiftId): ShipRecord {
    this.botSeq += 1;
    const id = `bot-${this.botSeq}`;
    const enrolled = this.bots.enroll(id, hull, profile);
    // THE SHIFT (Story 10.12, Eric 2026-11-11, R5): the controller deals it
    // at enrollment, weighted by the bot's personality (ai/profiles.ts
    // rollShift); a caller's explicit `shift` FORCES one instead (the
    // harness's `--shift`). There is no deck resolver any more — every
    // participant draws from the one common pool, so a bot's economy is a
    // captain's economy exactly.
    return this.addShip(id, enrolled.name, 'bot', enrolled.hullId, DEFAULT_HORN_ID, undefined, shift ?? enrolled.shift);
  }

  /**
   * Redraw a bot's CALLSIGN from the controller's remaining pool (Story 6.5),
   * returning the new name (null for an unknown id or a non-bot hull). The one
   * caller is the room resolving a collision with a human captain's chosen
   * callsign — the bot pool is drawn without repeat among bots but has never
   * been checked against a player's name, and two identical names in one kill
   * feed is a confusing feed. Renaming only: the hull, the mind, the profile,
   * the build and every timer are untouched, and nothing about the brain moves.
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
        // The bot's OWN most recent cloud's expiry (Story 9.3 — a self-read).
        cloudUntil: ship.cloudUntil,
        observe: () => observe(this, ship.id),
        // Story 9.10 (amendment 169): the public fog density — so a plot whose
        // predicted spot sits in fog is never read as a sweep miss. Weather
        // only (where fog is), bound here so ai/ never holds the field.
        fogAt: (x: number, y: number) => this.fogDensityAt(x, y),
      });
    }
    return out;
  }

  /**
   * This ship's private DRAW stream (Story 2.8, renamed in 8.14): mulberry32
   * over the map seed XOR a fresh golden constant (the mapgen/spawn stream
   * idiom — 0x165667b1 is unused by any other stream) XOR the join
   * ordinal scrambled by Math.imul with the 32-bit golden ratio, so consecutive
   * ordinals land on well-separated seeds. Deterministic per (mapSeed,
   * ordinal); never reseeded on any path.
   */
  private drawRngFor(ordinal: number): Rng {
    return mulberry32((this.seed ^ 0x165667b1 ^ Math.imul(ordinal, 0x9e3779b9)) >>> 0);
  }

  /**
   * THE DEV SPAWN FIT, kept on the record (Story 8.10, epic-8 amendment 65).
   * CAPTAINS ONLY — never a bot: Eric's ruling names the
   * captain, and a bot that came up pre-fitted would quietly change bot-vs-bot
   * balance in the one environment (a dev room) where a smoke is watching. The
   * list is frozen so nothing downstream can mutate what the door admitted.
   */
  /**
   * ONE PLACEMENT at any edge (Story 9.15): the hull's dev pose when it carries
   * one — no `pickSpawn` call at all, so no spawn-stream draw — else `pick()`'s
   * point facing the map centre (the shipped rule). Every edge — addShip,
   * redeployShip, respawn — goes through here, so the pose is honoured at all
   * three or none.
   *
   * THE POSE IS VALIDATED at every edge (Story 9.15 review gate): it must pass
   * `isSpawnClear` — inside the map by a hull's clearance and island-clear by
   * the spawn picker's own test. A pose that fails is NOT honoured: the hull
   * takes `pick()` (today's placement) and one `dev.poseRejected` warning is
   * logged for this placement. That is what keeps every edge's "island-clear
   * by construction" `landContact = false` true and gives resolveShipPose a
   * valid pose to induct from. Overlap between two posed hulls is NOT checked
   * — that is the script's responsibility (see sanitizeSpawnPose).
   */
  private placement(id: string, pose: DevPose | undefined, pick: () => Vec2): DevPose {
    if (pose !== undefined && isSpawnClear(this.map, pose)) return pose;
    if (pose !== undefined) logWarn('dev.poseRejected', { id, x: pose.x, y: pose.y });
    const p = pick();
    return { x: p.x, y: p.y, heading: Math.atan2(-p.y, -p.x) };
  }

  private static spawnFit(role: ShipRole, fit: readonly string[]): readonly string[] {
    if (role !== 'captain' || fit.length === 0) return EMPTY_FIT;
    return Object.freeze([...fit]);
  }

  /**
   * APPLY THE DEV SPAWN FIT — the whole of amendment 65's behaviour, and a
   * NO-OP for every hull whose `devFit` is empty (all of production).
   *
   * Each id is fitted exactly as a PICK would fit it — `applyCard` does all of
   * it (the fold, the slot effects, the pools, the timers, the wake, AND the
   * take ledger: a dev fit COUNTS AS A TAKE, because as far as every other
   * captain's weighting is concerned this hull is carrying the line) MINUS the
   * self-private `bn` event, which belongs to the spend path alone. Nothing is
   * queued here: a spawn is not a spend.
   *
   * `applyCard` IS THE WHOLE FILTER (Story 8.14, tightened by the review's F2).
   * There is no deck left to pay a copy out of, so every drop is `refusesCard`'s
   * — an id the catalog does not know, a STUB line (amendment 11: authored but
   * unbuilt is never fittable), a line already held at its `cap`, and copy 1
   * of an equipment line whose FAMILY slot already holds another kind (Story
   * 10.5 — one kind per slot). That last one is what stops a `fitOverride`
   * putting a second torpedo in `cards` with no slot to live in (and
   * recording a take for it);
   * the cap one is what stops a dev fit stacking a build no pick, draw or offer
   * could ever produce. Nothing is restated here: one predicate, one path.
   *
   * A REFUSED LINE IS LOGGED (Story 10.1 review gate): one `devFit.refused`
   * warning per dropped id, with `pickRefusal`'s reason — so a smoke whose
   * `fitOverride` names a second kind of a filled family sees why it came up
   * missing instead of a silent drop.
   */
  private applyDevFit(ship: ShipRecord): void {
    for (const line of ship.devFit) {
      const reason = this.cardRefusal(ship, line);
      if (reason !== null) logWarn('devFit.refused', { id: ship.id, line, reason });
      else this.applyCard(ship, line);
    }
  }

  /** Remove a ship entirely (client left). Its wake is water, not a ship
   *  property (Story 4.12, amendment 200): the ribbon detaches into the
   *  orphan store and keeps disclosing until its water ages out. */
  removeShip(id: string): void {
    const ship = this.ships.get(id);
    if (ship !== undefined && pruneWake(ship.wake, this.now) > 0) {
      ship.wake.hullAheadU = 0; // detached water: no hull ahead of it (amendment 159)
      this.orphanWakes.push(ship.wake);
    }
    this.ships.delete(id);
    this.contactBodies.delete(id); // Story 9.5: the latch re-arms by itself next tick
    this.inputs.remove(id);
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
   * what returns them to the ring — keeps that re-roll. It governs PLACEMENT
   * ONLY: since the 8.10 review the card economy is preserved on both paths
   * (redeployEconomy). See redeployShip for exactly which three mutations the
   * hold skips and why nothing else moves.
   */
  resetForMatchStart(holdStartLine = false): void {
    this.shells.clear();
    this.mines.clear();
    this.litZones.clear(); // practice-field zones never light the real match (mines precedent)
    this.burnZones.clear(); // ...nor burn into it (Story 8.17, the same precedent)
    this.foulZones.clear(); // ...nor foul it (Story 9.4, the same precedent)
    this.drops.clear(); // ...nor a practice-field airdrop / wreck pickup (Story 10.9, the same precedent)
    this.clouds.clear(); // ...nor a practice-field countermeasure cloud (Story 8.18 / 9.3, the same precedent)
    this.fogClear(); // ...nor any fog (Story 9.10 — the practice water has none; the cut, clocks and memo epoch reset)
    this.dotBuckets.clear(); // an open burn window must not flush a phantom dmg against a redeployed hull
    // The pending queue is dropped at the boundary as it always was. The
    // COUNTDOWN's own `pt` (the level-zero grant, Story 8.10) is never in it
    // here: the grant fires at startCountdown, a whole countdown earlier, and
    // World.step's epilogue swapped it into `events` on the very next tick
    // (amendment 63d). A countdown is >= 1 tick on every path that has one.
    this.pending = [];
    // The throne dies at the match boundary (Story 4.6): redeployShip below
    // zeroes every hull's `kills`, so the vacated throne cannot be re-claimed
    // until someone earns a fresh captain kill in the real match.
    this.bountyId = '';
    const placed: Vec2[] = [];
    for (const ship of this.ships.values()) this.redeployShip(ship, placed, holdStartLine);
    // Practice-field WATER never leaks into the real match either (Story 4.12
    // — the mines/zones rule): redeployShip just detached every hull's
    // practice ribbon into the orphan store, and the shells.clear() above
    // stranded every torpedo ribbon. Wipe both — a fresh match starts on
    // clean water. (Amendment 200 governs in-match death, not this boundary.)
    this.torpWakes.clear();
    this.orphanWakes.length = 0;
  }

  /** Fresh-match state for one hull: ring placement, full hp, full ammo pools.
   *  THE BUILD IS PRESERVED ON EVERY PATH (Story 8.10, amendment 63b, made
   *  unconditional by the 8.10 review): the countdown economy is the only
   *  pre-active economy any room can hold, so there is nothing to wipe — see
   *  redeployEconomy, which owns the rule and the reasoning.
   *  (respawn() below, waiting-phase only, PRESERVES the build too.)
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
   *  `rng` differently, so a given seed lands its later draws elsewhere.
   *  Nothing pins them seed-stable, and the batch-sim harness passes no
   *  expectedCaptains so it keeps the old path entirely. */
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
      // A posed hull (Story 9.15, dev only) goes back to its pose — and still
      // counts as OCCUPIED for the hulls placed after it.
      const p = this.placement(ship.id, ship.devPose, () => pickSpawn(this.map, placed, this.rng, this.spawnPhase));
      placed.push({ x: p.x, y: p.y });
      ship.state.x = p.x;
      ship.state.y = p.y;
      ship.state.heading = p.heading;
      ship.state.speed = 0;
      // The sweep re-anchors to the NEW heading at this placement edge (Eric
      // ruling 2026-08-16) — see addShip for the rule and why prev must equal it.
      ship.sweepAngle = wrapPositive(ship.state.heading);
      ship.prevSweepAngle = ship.sweepAngle;
    }
    // THE ECONOMY: PRESERVED on every path (Story 8.10, amendment 63b, made
    // unconditional by the 8.10 review) — see redeployEconomy.
    this.redeployEconomy(ship);
    // ...and the assist ledger dies either way: a fresh match's kill value must
    // never be split with someone who damaged this hull in the ready room.
    ship.damageFrom.clear();
    // The match-start `redeploy` edge (Story 5.1, amendment 3): legal from ANY
    // state — the common case is `alive -> alive` (a hull that never died being
    // reset at the countdown->active boundary).
    ship.lifecycle = transitionLifecycle(ship.lifecycle, 'redeploy', this.now);
    ship.respawnAt = 0;
    // ...nor a stale grounding read: the placement is island-clear by
    // construction, and a carried-over `true` would arm an un-beach reverse on
    // a hull sitting in open water at the start line.
    ship.landContact = false;
    World.clearContactState(ship); // ...nor a land edge (Story 9.5)
    World.clearContactTally(ship); // ...and a fresh match's contact tally starts at zero (Story 9.5)
    // A fresh life never inherits an open boost window — nor either slow.
    ship.boostUntil = 0;
    World.clearShiftClocks(ship); // ...nor a HUNKER window or a stream clock (Story 8.15)
    World.resetBattery(ship); // ...nor a previous life's turret angles, reloads or secondaries heat (Story 10.4)
    // ...nor a HULL REPAIR pool: hp is already full here, so a surviving
    // pool would drain entirely into the maxHp clamp — but the wire field would
    // still tick down on a brand-new match's HUD (the boostUntil rule).
    World.clearRepair(ship);
    World.readyAbilities(ship); // ...and both cooldown abilities ready (Story 10.5)
    // ...nor a stale combat clock (amendment 47).
    ship.lastDamagedAt = this.now;
    ship.slowedUntil = 0;
    ship.slowFactor = 1; // the fouling factor clears with its clock (amendment 81)
    ship.fouledUntil = 0; // ...nor a practice-water foul-zone stamp (Story 9.4; the zones left with foulZones.clear())
    ship.dazzledUntil = 0; // ...nor a practice-water dazzle (Story 10.9 — the fouledUntil rule)
    // A fresh match never inherits a stale smoke timer (Story 4.4) — nor a
    // stale foghorn cooldown (Story 4.5) — nor a stale own-cloud stamp
    // (Story 9.3; the clouds themselves left with clouds.clear()).
    ship.nextSmokeAt = 0;
    ship.cloudUntil = 0;
    ship.draft = 0; // Story 8.19: a redeployed hull rides no wake until stepShips stamps it
    ship.nextHonkAt = 0;
    // lastFireSeq / lastActSeq / lastHornSeq are deliberately NOT reset — a
    // reset fires a phantom shot / phantom boost / phantom honk (the stored
    // input's fireSeq/actSeq/hornSeq would read as a fresh click/press on
    // this tick).
    ship.seenBallistics.clear();
    ship.torpDirs.clear();
    ship.plainHandles.clear(); // Story 11.2: a fresh life starts every plain visit anew
    ship.kills = 0; // the tally AND the bounty ruler (one field since 5.6)
    ship.deaths = 0;
    ship.damageDealt = 0;
    ship.beaconXpMs = 0;
    ship.dropsTaken = 0;
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
   * THE CARD ECONOMY AT THE MATCH BOUNDARY — the one place the countdown's
   * bank, hand, build and redraw cross into the live match (Story 8.10,
   * epic-8 amendment 63b; made UNCONDITIONAL by the 8.10 review, P1).
   *
   * EVERYTHING THE COUNTDOWN HANDED THE CAPTAIN STAYS, IN EVERY ROOM: the
   * banked level, the front offer, the fitted cards and their behaviours, the
   * draw stream, the spent-redraw flag and the opening latch. FR48's whole promise
   * is that there is something to DO at the start line, so a card taken
   * during the countdown must be aboard when the water goes live — and a held
   * offer must still be held.
   *
   * WHY `hold` NO LONGER SPLITS THIS. The wipe used to be the shipped
   * behaviour of the dev/sandbox ready room, on the reasoning that its
   * captains really sail, fire and farm through the waiting phase and must not
   * carry that head start into the real match. Since 8.10 there is no head
   * start to carry: `Match.applyPolicy` leaves xp and damage disabled until
   * `active`, so the ONLY pre-active economy any room can hold is the opening
   * grant itself — and wiping that is wiping the feature. Keeping the split
   * also meant the two harnesses that build a `Match` WITHOUT
   * `expectedCaptains` — the batch-sim runner (`server/scripts/batchsim/
   * runner.ts`) and the RL env (`server/scripts/rl/env.ts`) — took the wipe
   * path and therefore measured an opening PRODUCTION NEVER PLAYS. One rule
   * now, for boarding rooms, dev rooms and harnesses alike.
   *
   * `hold` still governs exactly what it governed before this story, one
   * level up in `redeployShip`: the position/heading re-roll, the wake detach
   * and the `spawn` event.
   *
   * THE LOADOUT IS REBUILT from the preserved cards rather than kept, so the
   * weapon a captain fitted at -0:07 starts the match with a FRESH clock
   * (full pool, no reload in flight) like every other slot. The dev spawn fit
   * (`applyDevFit`, amendment 65) rides along inside those preserved cards and
   * is therefore applied at spawn ONLY — re-applying it here would double it.
   *
   * XP DIES ON EVERY PATH. `xpMs`/`level` are already 0 at a real start line
   * (xpEnabled is false until activate), so zeroing them costs the preserved
   * economy nothing and keeps the sandbox path honest. The level-zero grant
   * deliberately does NOT advance `level`, so it survives this untouched.
   */
  private redeployEconomy(ship: ShipRecord): void {
    // XP progress dies with the build (Story 2.6), on every path.
    ship.xpMs = 0;
    ship.level = 0;
    ship.stats = effectiveStats(ship.cls, ship.cards, this.catalog, ship.indexBonus);
    // The fit is the nine-slot loadout with THIS hull's PRESERVED cards
    // replayed over it through the SHARED fill rule.
    ship.loadout = slotsWithCards(ship.stats, ship.cards, this.catalog, ship.shift);
    ship.hp = ship.stats.maxHp;
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
   *
   * `opts.scuttle` marks THE SCUTTLE — the killer-less sink Match.onPlayerLeave
   * performs for a departing captain (Story 6.7) — and nothing else passes it.
   * It changes exactly one thing: the wreck crate is left only when the hull
   * was IN COMBAT (`inCombat`, Eric 2026-11-09 — see placeWreckDrop).
   */
  sinkShip(id: string, by?: string, opts?: { scuttle?: boolean }): void {
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
    // THE WRECK PICKUP (Story 10.9, R2): one `'wreck'` crate at the wreck
    // centre — only once the zone has started (placeWreckDrop's guards). It
    // runs BEFORE creditKill clears the assist ledger: a scuttle's in-combat
    // test reads that ledger.
    this.placeWreckDrop(ship, opts?.scuttle === true);
    // THE COLLECTOR INVALIDATION (Story 8.4): the wreck leaves every target
    // list built from here on — later shells of the same click pass through it
    // (`deferred-work.md:594`) and homing drops the lock — while its silhouette
    // is COPIED into sunkThisTick so a burst covering it can still mark `hc`
    // without damage (amendment 19). The copy matters: `hullPoly` is a reused
    // per-ship scratch array.
    this.targetsGen += 1;
    // The silhouette is transformed FRESH into its own array rather than copied
    // off `hullPoly`: that scratch is only current once this tick's collector
    // has run, and a storm sink lands before it.
    this.sunkThisTick.push({
      id,
      kind: 'hull',
      poly: transformPolygon(hullSilhouette(ship.hullId), ship.state.x, ship.state.y, ship.state.heading),
    });
    ship.hp = 0;
    // WHAT SINK-ENTRY DELIBERATELY DOES **NOT** ZERO (Story 5.2 — each kept
    // field is a decision, not an omission; founderSinking zeroes them all at
    // the window's end):
    //   - state.speed — the ritardando IS the window: the hull keeps its way
    //     and decays through the shared sim/sinking.ts cap in stepShips.
    //   - boostUntil — amendment 10 admits the boost while sinking (the
    //     doomed surge), so an OPEN boost window must survive sink-entry and
    //     keep composing with the decel cap; zeroing it here would kill a
    //     live surge the ruling explicitly allows. The old "no active-boost
    //     HUD chrome on a dead ship" rationale no longer applies at entry:
    //     the owner's frame still carries `you` and the hotbar stays live.
    //   - slowedUntil / fouledUntil — a hull that sinks fouled sinks fouled:
    //     the motion seam re-opens with the hull's REAL state (both slows
    //     keep lowering the cap the decel scales). Neither can be REFRESHED
    //     while sinking (mine blasts and the foul-zone stamp gate on
    //     isAfloat), so both expire naturally within the window.
    // The HULL REPAIR pool DOES die at entry (2026-08-04 rule, unchanged):
    // the economy is what a sinking captain loses (amendment 10 — "once
    // sinking, you're done"), tickRepairs would never tick it anyway (afloat
    // gate), and nothing may trickle hp back onto a hull already at 0. The
    // passive regen is refused on exactly the same afloat gate.
    World.clearRepair(ship);
    // ...and the own-cloud stamp dies with the life (Story 9.3): a sinking
    // press is refused by the row anyway, and the bot's self-read must not
    // hold its next life. The clouds already made stay in World.clouds to
    // their own `until` (amendment 127: everything on the water outlives its
    // owner).
    ship.cloudUntil = 0;
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
   * next frame is a spectator frame with no `you`), and both slow marks
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
      World.clearShiftClocks(ship); // the HUNKER window dies with the life (Story 8.15)
      ship.slowedUntil = 0;
      ship.slowFactor = 1; // the fouling factor clears with its clock (amendment 81)
      ship.fouledUntil = 0; // the foul zone's stamp dies with the life too (Story 9.4)
      ship.dazzledUntil = 0; // ...and the flash's dazzle (Story 10.9)
      ship.cloudUntil = 0; // already cleared at sinkShip; symmetric for directed callers (Story 9.3)
      ship.draft = 0; // ...and rides no wake (Story 8.19): never a stale lift on the wire
      // The land edge dies with the life (Story 9.5); the damage-source
      // stamp, the land bit and the contact tally DO NOT — the harness reads
      // them off the record, and the wreck sat out the window taking nothing.
      World.clearContactState(ship);
    }
  }

  /** Story 9.5: the land edge and the pre-damp speed — zeroed at every life
   *  boundary (addShip inline, founderSinking, respawn, redeployShip). */
  private static clearContactState(ship: ShipRecord): void {
    ship.landHeadOn = 0;
    ship.landWasContact = false;
    ship.preDampSpeed = 0;
  }

  /** Story 9.5: the harness readouts — what last took hp, whether the last
   *  contact was land, and the contact / land damage tallies — zeroed at the
   *  two FRESH-LIFE boundaries (respawn, redeployShip), never at
   *  founderSinking. */
  private static clearContactTally(ship: ShipRecord): void {
    ship.lastDamageSrc = null;
    ship.lastContactWasLand = false;
    ship.contactDamageTaken = 0;
    ship.landDamageTaken = 0;
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
   * 5.6 — advances on every attributed victim: a human captain or, since
   * Story 6.4 (Eric ruling B3: bots are ordinary combatants — a bot victim
   * counts into `kills`, pays the full captain killLevels, and can move the
   * bounty throne), an AI-captain bot. Sinking the throne's holder pays
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
      killer.kills += 1;
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
   * A STORM KILL STILL PAYS THE ASSISTS. There is no killer, so the guaranteed
   * share goes UNPAID — it is payment for the risk of closing, and nobody took
   * that risk — but the hull was worn down by somebody and the split is about
   * that work. This is NEW value: today an unattributed sink credits nothing at
   * all.
   */
  private payKillValue(victim: ShipRecord, killer: ShipRecord | undefined): void {
    this.payKillPot(World.killXpLevels(), victim.damageFrom, victim.id, killer);
  }

  /**
   * THE SPLIT LAW ITSELF, over any damage ledger (Story 10.8 extraction —
   * the body payKillValue has always had, unchanged): `pot` levels, the
   * killer's guaranteed share, the rest by damage among the ledger's eligible
   * contributors. A hull's kill value reaches it through payKillValue; a
   * destroyed RADIO BEACON's `CONFIG.beacons.killLevels` reaches it through
   * sinkBeacon with the beacon's own ledger (R13: "divided among participants
   * like ship kills would be"). `victimId` is the ledger owner's id — the
   * self-damage guard's subject.
   */
  private payKillPot(
    pot: number,
    ledger: ReadonlyMap<string, AssistTally>,
    victimId: string,
    killer: ShipRecord | undefined,
  ): void {
    if (!(pot > 0)) return;
    const windowMs = CONFIG.xp.assistWindowMs;
    if (windowMs <= 0) {
      if (killer !== undefined) this.grantXp(killer, pot);
      return;
    }
    const share = Math.min(1, Math.max(0, CONFIG.xp.killerShare));
    if (killer !== undefined && share > 0) this.grantXp(killer, pot * share);
    this.splitAssists(ledger, victimId, pot * (1 - share), this.now - windowMs, killer);
  }

  /**
   * The victim's contributors who may actually be paid: a tally whose last
   * damage landed at or after `cutoff` — i.e. whose rolling counter is still
   * active — from a hull that still exists.
   *
   * Split out of splitAssists for the complexity budget, but it earns its own
   * name: every clause here is a RULE (the eligibility window, the self-damage
   * guard) rather than bookkeeping, and reading them in one place is how the
   * payout stays auditable.
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
  private eligibleContributors(
    ledger: ReadonlyMap<string, AssistTally>,
    victimId: string,
    cutoff: number,
  ): { ship: ShipRecord; amount: number }[] {
    const out: { ship: ShipRecord; amount: number }[] = [];
    for (const [id, rec] of ledger) {
      if (id === victimId || rec.at < cutoff || !(rec.amount > 0)) continue;
      const ship = this.ships.get(id);
      if (ship === undefined) continue;
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
  private splitAssists(
    ledger: ReadonlyMap<string, AssistTally>,
    victimId: string,
    budget: number,
    cutoff: number,
    killer: ShipRecord | undefined,
  ): void {
    if (!(budget > 0)) return;
    const eligible = this.eligibleContributors(ledger, victimId, cutoff);
    let total = 0;
    for (const e of eligible) total += e.amount;
    if (!(total > 0)) {
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
   * Levels' worth of XP a kill on a hull pays (Story 2.6, amendment 31): the
   * full `CONFIG.xp.killLevels` for every captain and bot (the PvE size tiers
   * retired with the fleet at Story 10.8).
   */
  private static killXpLevels(): number {
    return CONFIG.xp.killLevels;
  }

  /**
   * THE one XP entry point (Story 2.6): add `levels` worth of XP to a ship and
   * bank every threshold it crosses. Integer ms throughout — a kill's value is
   * rounded ONCE here. Every tier is a dyadic fraction of the 60000ms level, so
   * each rounds exactly: ¼ = 15000ms, ½ = 30000ms, ¾ = 45000ms.
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

  /** The raw ms form behind grantXp (and the passive tick's `+dtMs`): the
   *  guard and the bank loop, in one place. The guard is FAIL-CLOSED on
   *  non-finite input — a plain `<= 0` is false for NaN (which would poison
   *  `xpMs` forever) and for Infinity (which would spin the bank loop). */
  private addXpMs(ship: ShipRecord, ms: number): void {
    if (!Number.isFinite(ms) || ms <= 0) return;
    ship.xpMs += ms;
    while (ship.xpMs >= CONFIG.xp.levelMs) {
      ship.xpMs -= CONFIG.xp.levelMs;
      ship.level += 1;
      this.grantPoint(ship);
    }
  }

  /**
   * Level reward (Story 2.8; the lazy-draw bugfix): bank the LEVEL — always,
   * unconditionally — then materialize the front offer if this level is the one
   * at the front. A level that lands BEHIND a materialized offer draws nothing
   * at all: its hand is drawn when it reaches the front.
   *
   * The self-private `pt` event fires whenever there IS a front offer after
   * materializing. An EXHAUSTED hull (nothing eligible: every ladder and all
   * three slot weapons at cap, or an all-stub catalog) draws an EMPTY offer,
   * and since Story 10.7 (R5, Eric 2026-11-06) the level becomes a BONUS
   * POINT: `materializeOffer` converts it to +1 on a random index and zeroes
   * `bankedLevels`, no offer opens, no `pt` fires and nothing throws. `level`
   * still rose (the XP loop owns that).
   * Reopening the refit window can never reroll — the front offer is drawn once
   * and frozen (FR19).
   */
  private grantPoint(killer: ShipRecord): void {
    killer.bankedLevels += 1;
    this.materializeOffer(killer);
    if (killer.offer !== null) this.pending.push({ k: 'pt', id: killer.id });
  }

  /**
   * THE LEVEL-ZERO GRANT — THE OPENING (Story 8.10, FR48, epic-8 amendments
   * 59-63). Called by `Match.startCountdown()` and by nothing else: every
   * PARTICIPANT (a human captain or an AI captain) banks ONE level and draws its hand through the ordinary draw. The offer's
   * EQUIPMENT slot (Story 10.7, card 1) is what keeps the first offer from
   * being four ladders on a hull with no weapon: on a bare hull every eligible
   * equipment line is a bare weapon. The level-zero guarantee (amendment 93)
   * is retired.
   *
   * `level` does NOT move. The captain is at LV 0 with one banked level and a
   * full hand — which is exactly what the HUD bar already renders (`LV 0`,
   * chip 1, empty strip) with no change to the bar at all. `xpMs` is 0 here
   * by construction (xpEnabled is false before `active`).
   *
   * `isParticipant` is the one reading that means "plays the game"
   * (amendment 63e — the retired PvE fleet was excluded by this guard).
   *
   * IDEMPOTENT PER HULL (the 8.10 review, P2): each record carries its own
   * `openingGranted` latch, so calling this on every `startCountdown()` —
   * including the second one after a countdown cancelled back to `waiting` —
   * banks exactly one level per hull, while a captain or bot who joined
   * BETWEEN the two armings still gets its own. Without the per-ship latch a
   * match-wide one either double-banked the veterans or starved the newcomer.
   *
   * The `pt` each grant queues reaches its client one tick later, in the
   * ordinary pending→events swap (amendment 63d).
   */
  grantOpening(): void {
    for (const ship of this.ships.values()) this.grantOpeningTo(ship);
  }

  /**
   * One hull's level-zero grant, behind the two guards every caller needs:
   * PARTICIPANTS ONLY (amendment 63e) and ONCE PER RECORD.
   */
  private grantOpeningTo(ship: ShipRecord): void {
    if (!roleIsParticipant(ship) || ship.openingGranted) return;
    ship.openingGranted = true;
    this.grantPoint(ship);
  }

  /**
   * THE ONE FREE COUNTDOWN REDRAW (Story 8.10, FR48, epic-8 amendment 60):
   * throw the level-zero hand back and draw another — simply the draw run
   * again (Story 10.7, R2: the wildcards flip afresh) — off the SAME common
   * pool. A draw consumes nothing, so there is nothing to give back and the
   * thrown hand's lines are drawable again immediately.
   *
   * HONOURED IFF all five hold: the countdown is open (`Match` owns the
   * flag), the hull is a HUMAN CAPTAIN (a bot never sends the sentinel — its
   * policy cannot return a negative, pinned), it is NOT SINKING, this ship has not already redrawn, and it
   * HOLDS a hand. Anything else returns false BEFORE any mutation, so the
   * next frame's offer is the same array, byte for byte (the pick-refusal
   * pattern).
   *
   * THE SINKING GUARD LIVES HERE, NOT ONLY AT THE WIRE (the 8.10 review, P6).
   * `spendPoint` already refuses a sinking hull, so the wire path was covered
   * — but `Match`'s dev `autoMulligan` arm calls this directly, and a
   * countdown CAN hold a sinking hull (a dev/sandbox room's waiting phase is
   * live water, and Story 5.2's five-second window straddles the arming).
   * Guarding the one function every caller shares is the chokepoint; the
   * check in `spendPoint` is now redundant and kept.
   *
   * Public because two callers need it: `spendPoint` (the wire, via
   * MULLIGAN_CHOICE) and `Match`'s dev-gated `autoMulligan` smoke arm.
   */
  mulligan(ship: ShipRecord): boolean {
    if (!this.countdownOpen || ship.role !== 'captain' || isSinking(ship.lifecycle)) return false;
    if (ship.mulliganed || ship.offer === null) return false;
    ship.mulliganed = true;
    ship.offer = null; // dropped, NOT spent: bankedLevels does not move
    World.markRedrawn(ship); // the thrown hand stays in the log (Story 8.21)
    this.materializeOffer(ship);
    if (ship.offer !== null) this.pending.push({ k: 'pt', id: ship.id });
    return true;
  }

  /**
   * Draw the FRONT offer — the single place a hand is ever drawn (the lazy-draw
   * bugfix). Fires ONLY when a level is banked and no offer is materialized, so
   * exactly one draw happens per level over that level's lifetime.
   *
   * THE SOURCE IS THE COMMON POOL (Story 8.14, amendment 89a): there is no deck
   * and no match pool any more. `sim/draw.ts` is handed three plain things —
   * what this ship IS (`drawShipOf`), what the match has TAKEN (`weightsFor`),
   * and this ship's own stream — and answers with up to CONFIG.offer.size
   * DIFFERENT line ids. It takes nothing out of anything: a draw is a read.
   *
   * THE ELIGIBILITY LAW LIVES THERE, not here (caps, the family slots, gun
   * ladders, add-on hosts, stubs). This function's whole job is to assemble
   * the three arguments.
   *
   * A SHORT OR EMPTY OFFER IS LEGAL (Story 10.5): with the consumables gone a
   * hull can run out of eligible lines. A short hand is stored as drawn; an
   * EMPTY one is never materialized — `offer` stays null, no refit window
   * opens, nothing throws, nothing is logged.
   *
   * AN EMPTY DRAW CONVERTS EVERY BANKED LEVEL INTO A BONUS POINT (Story 10.7,
   * R5, Eric 2026-11-06 — replacing R3's "banks nothing"): `convertBank`.
   * Exhaustion is permanent — only taking a card can make a new line
   * eligible, and an exhausted hull has no card to take — so every level
   * queued behind the empty one converts too. This one branch covers all
   * three callers: a level earned by an exhausted hull (`grantPoint`), the
   * next-level draw after a hull spends its LAST eligible card with levels
   * queued (`spendCard`), and the redraw (`mulligan`). `level` is untouched.
   *
   * There is no level-zero guarantee any more (amendment 93, retired by Story
   * 10.7): the opening, its redraw and every ordinary level all run the same
   * four-slot draw, whose Equipment slot deals a bare weapon on a bare hull.
   */
  private materializeOffer(ship: ShipRecord): void {
    if (ship.bankedLevels <= 0 || ship.offer !== null) return;
    const offer = drawOffer(this.drawShipOf(ship), this.weightsFor(ship), ship.drawRng, this.catalog);
    if (offer.length === 0) {
      this.convertBank(ship);
      return;
    }
    ship.offer = offer;
    // THE HAND LOG (Story 8.21, R1): a dealt hand is logged the moment it is
    // drawn — this is the single place a hand is ever drawn.
    ship.hands.push({ dealtAtMs: this.now, offered: [...offer], taken: null, takenAtMs: null, redrawn: false });
  }

  /**
   * THE EXHAUSTED HULL'S CONVERSION (Story 10.7, R5, Eric 2026-11-06, epic-10
   * amendment 13): every level still banked becomes ONE bonus point on an
   * index picked by `drawBonusIndex` (one `drawRng.next()` per level), the
   * bank drops to 0, and the stats re-fold through `effectiveStats()` with
   * the same settle a card gets (pools, reload clocks, mounts, wake). No
   * offer, no hand log, no `pt` — the own row's `ib` is the whole signal.
   * A pick that is not one of the six indices (`drawBonusIndex` answers
   * undefined — a misconfigured list or a bad rng, review gate P4) is that
   * level's point skipped: no junk key is ever written.
   *
   * NO BONUS WHILE SINKING (Story 10.7, R7, Eric 2026-11-06, epic-10
   * amendment 13 — "once sinking, you're done", the rule `spendPoint` refuses
   * a card pick by): on a SINKING or SUNK hull every banked level is simply
   * dropped — no point, bank 0, no `drawRng` value spent, no re-fold. Levels
   * earned while sinking / sunk are gone even if the hull is later redeployed.
   *
   * RE-ENTRANCY (review gate P5): since R5 this re-fold can run INSIDE damage
   * resolution — kill credit → grantXp → grantPoint → materializeOffer → here
   * — replacing `ship.stats`, rescaling its reload clocks and possibly
   * swapping `ship.wake` mid-step. No step may hold a ship's `stats` / `wake`
   * reference across a call that can award a kill.
   */
  private convertBank(ship: ShipRecord): void {
    if (isSinking(ship.lifecycle) || isSunk(ship.lifecycle)) {
      ship.bankedLevels = 0;
      return;
    }
    for (let n = ship.bankedLevels; n > 0; n -= 1) {
      const id = drawBonusIndex(ship.drawRng);
      if (id !== undefined) ship.indexBonus[id] += 1;
    }
    ship.bankedLevels = 0;
    const prevStats = this.refoldCards(ship);
    this.settleRefold(ship, prevStats);
  }

  /** The hand currently open in the log — the last entry, while it is neither
   *  taken nor thrown back — or undefined (Story 8.21). */
  private static openHand(ship: ShipRecord): HandRecord | undefined {
    const last = ship.hands[ship.hands.length - 1];
    return last !== undefined && last.taken === null && !last.redrawn ? last : undefined;
  }

  /** The countdown REDRAW threw the open hand back (Story 8.21, R1). */
  private static markRedrawn(ship: ShipRecord): void {
    const open = World.openHand(ship);
    if (open !== undefined) open.redrawn = true;
  }

  /**
   * THIS SHIP, AS THE DRAW SEES IT (Story 8.14) — the whole of what
   * `sim/draw.ts` is allowed to know about a record:
   *
   *   - `held`: the fitted card ids, one entry per copy. Widened to `string[]`
   *     on the record (an injected test catalog may name ids the shipped
   *     `LineId` union does not), and the callee is fail-closed on an id its
   *     catalog does not know — so the narrow rides the callee's contract, not
   *     this assertion.
   *   - `slotIds`: the five slot contents, the same array `pickRefusal`
   *     takes. `sim/draw.ts` derives which FAMILY slots are still empty from
   *     it — what makes copy 1 of a weapon eligible at all (a bare weapon
   *     needs its family's slot empty, Story 10.5) — and which add-on hosts
   *     are aboard (Story 10.6).
   *   - `mountedGun`: the MODULE slot 0 carries by `loadoutFor`'s
   *     construction — `'mainBattery'` on every hull since Story 10.4 (no
   *     ladder is hosted on it, so the three deck-gun ladders are never
   *     eligible). A constant rather than a slot read so it stays typed as an
   *     EquipmentId without a cast.
   */
  private drawShipOf(ship: ShipRecord): DrawShip {
    return {
      held: ship.cards as readonly LineId[],
      slotIds: ship.loadout.map((s) => s.equipmentId),
      mountedGun: 'mainBattery',
    };
  }

  /**
   * THIS SHIP'S WEAPON WEIGHTS (Story 8.14, amendments 90/91), derived fresh
   * from the take ledger at every draw — never cached, because the ledger moves
   * whenever anyone in the match takes a weapon.
   *
   * One entry per line at least one OTHER participant has taken copy 1 of:
   * `lineWeight(n)` = `max(floor, factor ** n)`. SELF-EXCLUSION is the whole
   * reason the ledger stores ship ids — the asking ship is subtracted from the
   * set before it is weighed, so a captain's own take never makes their own
   * tier cards rarer. A line with no other taker is LEFT OUT, because an absent
   * id weighs the base 1.0 in `sim/draw.ts`: an untouched match draws an empty
   * map and pays nothing for the feature.
   */
  weightsFor(ship: ShipRecord): Weights {
    const out = new Map<LineId, number>();
    for (const [lineId, takers] of this.takes) {
      const others = takers.size - (takers.has(ship.id) ? 1 : 0);
      if (others > 0) out.set(lineId, lineWeight(others));
    }
    return out;
  }

  /**
   * RECORD A TAKE (Story 8.14, amendment 90): this ship now carries copy 1 of
   * this equipment line, so every OTHER captain's weight for it steps down by
   * `CONFIG.offer.weighting.factor`. Called from `applyCard` and nowhere else,
   * exactly on the 0 -> 1 transition; idempotent by construction (a Set), so a
   * second call for the same pair is free.
   *
   * PERMANENT: nothing removes a take — not a sink, not a leave, not a match
   * boundary within the same World. See the `takes` field doc.
   */
  private recordTake(shipId: string, lineId: LineId): void {
    const takers = this.takes.get(lineId);
    if (takers === undefined) this.takes.set(lineId, new Set([shipId]));
    else takers.add(shipId);
  }

  /** Is THIS copy the take — copy 1 of an EQUIPMENT line (amendment 90: the
   *  bare weapon arriving, never a tier bump, never a ladder or add-on)? Split out of `applyCard` so the ledger write is one guarded
   *  statement there and the branch count stays where it was. */
  private static isTake(line: CatalogLine | undefined, copiesBefore: number): boolean {
    return line?.kind === 'equipment' && copiesBefore === 0;
  }

  /**
   * Apply one CARD to a ship (Story 2.5 seam, live since 2.7; re-cut for
   * catalog v3 in Story 8.1). Exactly the two homes plus hooks, nothing else:
   * append the id, refresh the behavior cache, recompute the cached stats
   * through effectiveStats (home 1 — it counts copies and folds in CATALOG
   * order itself, so the ID LIST IS THE BUILD and there is no resolved-def
   * mirror to keep in step), and apply THIS COPY's slot effects incrementally
   * to the live loadout (home 2 — untouched slots keep their ammo/reload
   * state; behavior effects execute per-tick in stepShips via the cached
   * cardBehaviors). NO event is queued (spendPoint owns the spend UX).
   *
   * WHICH TIER THIS COPY APPLIES: the copy index is how many copies of the
   * line the ship holds AFTER the push, and `tiers[copy - 1]` is its step.
   * Past the line's `cap` the fit buys nothing — the draw can never OFFER a
   * line at its cap, so that is a fail-closed guard, not a path.
   *
   * THE TAKE LEDGER (Story 8.14, amendment 90): copy 1 of an EQUIPMENT line —
   * the bare weapon arriving — is a TAKE, and is recorded here, on the ONE path
   * every acquisition runs through (a spend, a dev spawn fit, a directed test
   * grant). Copies 2+, ladders and add-ons record nothing.
   *
   * HEAL-ON-GRANT is GONE: its only line, HULL POINTS, and the `healOnGrant`
   * flag were DELETED by Story 10.3 (Eric 2026-11-04, epic-10 amendment 8),
   * so no grant heals. The hp clamp below stays for a maxHp-lowering fit.
   *
   * NEVER FIT AN ID WITH NO MODULE (Story 8.1): a `slotFill` whose target has
   * no row in the server EQUIPMENT registry is a SILENT NO-OP. Stub lines are
   * never dealt at all, so this is unreachable in play — it is the
   * structural guarantee that an authored-but-unbuilt weapon can never land in
   * a slot the tick loop would then have to dispatch.
   *
   * POOLS (amendment 41 — "everything arrives loaded", superseding the 2.5
   * clamp-down-only parking): after the slot effects, every fitted slot whose
   * effective cap ROSE fills to the new cap; a LOWERED cap still clamps down
   * (reconcilePools). A slotFill installs a full pool via freshSlotState.
   *
   * TIMERS (Eric ruling 2026-08-04): a grant that moves a fitted slot's
   * effective reload rescales that slot's in-flight `reloadMsLeft` by the same
   * ratio, preserving the progress fraction — never a free round
   * (rescaleReloadTimers). The per-tier −5 % reload step is DERIVED from the
   * tier in clampStats, so an equipment-ladder copy moves those timers too.
   * Since Story 10.5 (R10 / R11) a RELOAD card moves the turrets' and the
   * Q / E / R weapons' clocks; the fold no longer scales a Shift, so its
   * ratio is 1.
   *
   * Fail-closed: an id the world's catalog cannot resolve is REFUSED outright
   * (8.14 review F1 — `pickRefusal` reads an id the catalog does not OWN as a
   * stub), so nothing unresolvable ever reaches `cards` and therefore the wire.
   * Public so directed tests (and the spend path) can drive it.
   */
  applyCard(ship: ShipRecord, lineId: string): void {
    // Own-property gate (fail-closed): a plain-object catalog answers
    // `this.catalog['constructor']` with Object.prototype.constructor —
    // not undefined, and with no `tiers` to iterate.
    const line = Object.hasOwn(this.catalog, lineId) ? this.catalog[lineId] : undefined;
    // THE PRE-PUSH REFUSALS — a stub, a line at its cap, a bare weapon with
    // no slot. See `refusesCard`.
    if (this.refusesCard(ship, lineId)) return;
    const copiesBefore = boonStackCount(ship.cards, lineId);
    ship.cards.push(lineId);
    // THE TAKE (amendment 90), before anything else can throw: copy 1 of an
    // equipment line steps every OTHER captain's weight for it down.
    if (World.isTake(line, copiesBefore)) this.recordTake(ship.id, lineId as LineId);
    // The heal-on-grant branch (HULL POINTS' `healOnGrant`) sat here until
    // Story 10.3 deleted it (Eric 2026-11-04, epic-10 amendment 8); the hp
    // clamp to the new maxHp lives in refoldCards.
    const prevStats = this.refoldCards(ship);
    if (line !== undefined) this.applyGrantSlots(ship, line, lineId);
    this.settleRefold(ship, prevStats);
  }

  /**
   * Everything that follows a stats re-fold once the slots are settled —
   * shared by `applyCard` and the exhausted hull's `convertBank` (Story 10.7,
   * R5), so a bonus point moves pools, clocks, mounts and the wake exactly as
   * a card of the same index would. Via `convertBank` this can run INSIDE
   * damage resolution (a kill's level) — see the re-entrancy note there
   * (review gate P5): never hold a ship's `stats` / `wake` across a kill.
   */
  private settleRefold(ship: ShipRecord, prevStats: EffectiveStats): void {
    this.reconcilePools(ship, prevStats);
    this.rescaleReloadTimers(ship, prevStats);
    // THE LAUNCHERS AND RACKS (Story 10.6, I3): resize to the folded counts —
    // a new launcher, tube, rack or expanded seat arrives loaded — and rescale
    // every running tube / rack clock by the held weapon's new ÷ old reload
    // (a RELOAD card and the weapon's own tier card alike). Re-derives the
    // torpedo / mine slot summaries, so it runs after the two pool passes.
    refitMounts(ship, prevStats);
    // A speed card raises the true attainable top speed the wake ring was
    // provisioned for (Story 4.12) — upsize in place, live samples preserved.
    this.reprovisionWake(ship);
  }

  /**
   * THE REASONS A COPY NEVER ENTERS `ship.cards` — checked together, BEFORE the
   * push, because the push is what puts an id on the wire.
   *
   * ONE SHARED PREDICATE (`sim/boons.pickRefusal`, Story 8.14 review F1/F2) —
   * the same function the client greys the refit card with, the same one
   * `spendCard` runs one step earlier (it must refuse before the offer moves),
   * and the same one the bot scorer skips on. Its three refusals:
   *
   *   • A STUB LINE (or an id this world's catalog does not own): its mechanism
   *     does not exist, so fitting it buys nothing — and the id would then ride
   *     in `cards`, where the client's replay and this world's own respawn
   *     replay would both try to derive a loadout from it.
   *   • A LINE ALREADY AT ITS `cap`. The draw never offers one; a dev fit can
   *     still name it.
   *   • COPY 1 OF AN EQUIPMENT LINE WHOSE FAMILY SLOT HOLDS ANOTHER KIND (Story
   *     10.5 — one kind per slot). The draw never offers it, but a dev
   *     `fitOverride` reaches `applyCard` directly — and a bare weapon in
   *     `cards` with no slot is a take recorded for a weapon nobody carries
   *     whose tier cards then become eligible.
   */
  private refusesCard(ship: ShipRecord, lineId: string): boolean {
    return this.cardRefusal(ship, lineId) !== null;
  }

  /** `refusesCard`'s reason (`pickRefusal`), or `null` when the pick is legal. */
  private cardRefusal(ship: ShipRecord, lineId: string): PickRefusal | null {
    return pickRefusal(ship.cards, ship.loadout.map((s) => s.equipmentId), lineId, this.catalog);
  }

  /**
   * RE-DERIVE EVERYTHING THAT HANGS OFF `ship.cards`, and answer with the stats
   * that were live before. The ONE place the held-card fold is re-run (the
   * only edit that moves the card multiset is `applyCard`'s push since the
   * consumable spend left with Story 10.5) — and, since Story 10.7 (R5), the
   * exhausted hull's bonus points beside them (`convertBank`); `prevStats` is
   * what the pool/timer reconciliation compares against. Clamps hp to the
   * new maxHp.
   */
  private refoldCards(ship: ShipRecord): EffectiveStats {
    ship.cardBehaviors = cardBehaviors(ship.cards, this.catalog);
    const prevStats = ship.stats;
    ship.stats = effectiveStats(ship.cls, ship.cards, this.catalog, ship.indexBonus);
    // hp invariant: a maxHp-LOWERING fold may not leave hp above the cap.
    ship.hp = Math.min(ship.hp, ship.stats.maxHp);
    return prevStats;
  }

  /** THIS COPY's slot effects, applied incrementally to the live loadout (home
   *  2 of applyCard — see there). The copy index is how many copies of the line
   *  the ship holds AFTER the push, so `tiers[copy - 1]` is its step. The
   *  EQUIPMENT-registry gate is belt-and-braces beside the shared catalog's
   *  stub guard: an id with no built module can never be dispatched.
 */
  private applyGrantSlots(ship: ShipRecord, line: CatalogLine, lineId: string): void {
    for (const effect of line.tiers[boonStackCount(ship.cards, lineId) - 1] ?? []) {
      if (effect.kind === 'slotFill' && !Object.hasOwn(EQUIPMENT, effect.equipmentId)) continue;
      applySlotEffect(ship.loadout, effect, ship.stats, this.catalog);
    }
  }

  /**
   * Pool invariant after a stats recompute (amendment 41): a slot whose
   * effective cap ROSE fills to the new cap immediately ("everything arrives
   * loaded" — a ladder rung that adds a turret or tube hands out its round); a cap at-or-below
   * its previous value still clamps `n` down to the ceiling. A slot FILLED by
   * this very grant (acquisition) compares base-vs-base caps — a no-op over
   * its already-full fresh pool.
   */
  private reconcilePools(ship: ShipRecord, prevStats: EffectiveStats): void {
    for (const slot of ship.loadout) {
      const id = slot.equipmentId;
      // A torpedo / mine pool is a SUMMARY of the launchers / racks (Story
      // 10.6) — refitMounts owns it, so it is never filled here.
      if (id === null || slot.state === null || isMountBacked(id)) continue;
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
   * that does not touch reloads) leaves every timer byte-identical, and a
   * weapon's own tier card gets the same treatment for free. SINCE STORY 10.5
   * (R10 / R11, epic-10 amendment 11) a RELOAD card rescales the turrets' and
   * the Q / E / R weapons' running clocks; a Shift reads an unchanged reload
   * (ratio 1, sim/stats.ts `RELOAD_UNSCALED_ROWS`) and keeps its countdown.
   *
   * ORDER — this runs AFTER reconcilePools deliberately. The two touch disjoint
   * fields (counts vs timer) and both read the same untouched `prevStats`, so
   * they commute numerically; running timers LAST keeps the reading "settle the
   * pool, then the clock that fills it" and guarantees we never scale a timer a
   * later step would overwrite. The one interaction worth naming: a slot whose
   * cap ROSE is filled to cap by reconcilePools and may keep a stale nonzero
   * timer — but the slot's tick pins the timer to 0 on the very next tick
   * once `n >= maxAmmo` (`tickReload` for a per-round pool, the machine gun's
   * `tickSwap` for its magazine), so scaling it is inert either way. A slot
   * FILLED by this grant (acquisition) arrives from `freshSlotState` with
   * `reloadMsLeft: 0` and is skipped by the `left <= 0` guard.
   */
  private rescaleReloadTimers(ship: ShipRecord, prevStats: EffectiveStats): void {
    for (const slot of ship.loadout) {
      const id = slot.equipmentId;
      // Tube and rack clocks are rescaled per unit by refitMounts (Story 10.6).
      if (id === null || slot.state === null || isMountBacked(id)) continue;
      const oldMs = equipmentReloadMs(prevStats, id);
      const newMs = equipmentReloadMs(ship.stats, id);
      if (!Number.isFinite(oldMs) || oldMs <= 0 || oldMs === newMs) continue; // no ratio, or nothing moved
      if (id === 'mainBattery') {
        World.rescaleTurretReloads(ship, slot, newMs / oldMs);
        continue;
      }
      const left = slot.state.reloadMsLeft;
      if (left <= 0) continue; // idle slot: nothing in flight
      slot.state.reloadMsLeft = left * (newMs / oldMs);
    }
  }

  /**
   * THE MAIN BATTERY'S share of `rescaleReloadTimers` (Story 10.4 gate S1):
   * slot 0's `{n, reloadMsLeft}` is DERIVED (`syncBatterySlot` overwrites it
   * every tick), so the progress-fraction rule lands on EACH turret's own
   * running clock; a loaded turret (0) has nothing in flight. The slot pair is
   * then re-derived from the turrets.
   */
  private static rescaleTurretReloads(ship: ShipRecord, slot: LoadoutSlot, ratio: number): void {
    for (const t of ship.turrets) {
      if (t.reloadMsLeft > 0) t.reloadMsLeft *= ratio;
    }
    syncBatterySlot(ship, slot);
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
   * THE ACCEPT SET IS THE OFFER PLUS ONE SENTINEL (Story 8.8, re-opened by
   * Story 8.10). The reserved `HEAL_CHOICE` (-1) that used to buy an instant
   * heal is GONE end to end — healing is the HULL REPAIR ability (`C`, Story
   * 10.5). `MULLIGAN_CHOICE` (-2) is the ONE negative
   * the channel accepts again (amendment 60): the countdown redraw, which
   * spends no level. Every other negative, -1 included, is malformed and
   * refused by spendCard's own bound.
   */
  spendPoint(id: string, rawChoice: unknown): boolean {
    const ship = this.ships.get(id);
    if (!ship || ship.bankedLevels <= 0) return false;
    // THE REFIT IS CLOSED WHILE SINKING (Story 5.2, amendment 10 — "once
    // sinking, you're done"): a card pick is refused outright — a clean
    // denial (false), never a throw; the bank and its
    // front hand stay untouched, so the level is still there for the next life.
    // Deliberately NOT routed through sinkingActivationGate: the economy never
    // went near it, and this is the actual policy that gate's amendment names.
    // Note the asymmetry is three-state: alive spends, SUNK spends (builds
    // persist across waiting-phase respawns), sinking alone shops nothing.
    if (isSinking(ship.lifecycle)) return false;
    if (typeof rawChoice !== 'number' || !Number.isInteger(rawChoice)) return false;
    // THE ONE LEGAL NEGATIVE (Story 8.10, amendment 60): MULLIGAN_CHOICE (-2)
    // is not an offer index at all — it asks for the countdown redraw, which
    // spends no level and fits no card. Every OTHER negative is still
    // malformed and falls through to spendCard's own bound.
    if (rawChoice === MULLIGAN_CHOICE) return this.mulligan(ship);
    return this.spendCard(ship, rawChoice);
  }

  /**
   * The CARD half of a spend, split from spendPoint (complexity budget). A card
   * pick needs a MATERIALIZED front offer — a degenerate offer-less level has
   * nothing to fit, so the pick is refused and the level stays banked.
   *
   * THE ORDER HERE IS LOAD-BEARING (the lazy-draw bugfix): consume the LEVEL
   * first (drop the offer, decrement the bank), then settle the fit, and
   * materialize the NEXT offer LAST — so the next hand is drawn against the
   * build this pick just produced (its new copy counts, its now-fuller weapon
   * row, and its own take already in the ledger). If that pick was the hull's
   * LAST eligible card, the next draw comes back empty and `materializeOffer`
   * converts every level still queued into a bonus point (Story 10.7, R5).
   */
  private spendCard(ship: ShipRecord, choice: number): boolean {
    const front = ship.offer;
    if (front === null || choice < 0 || choice >= front.length) return false;
    // THE PICK REFUSAL (Story 8.7 ruling 3, widened by the 8.14 review F1),
    // BEFORE anything is consumed: a line already at its cap or a bare weapon
    // with no weapon slot is refused outright rather than fitted into
    // nothing. `pickRefusal` is the SAME shared predicate the client greys the
    // card with, over the
    // same replayed slot ids and the same held cards, so the two can never
    // disagree about whether a pick is legal — and because this returns here,
    // the level stays banked, nothing is fitted, no `bn` is queued and the next
    // frame's offer is the SAME array, byte for byte.
    const lineId = front[choice];
    if (pickRefusal(ship.cards, ship.loadout.map((s) => s.equipmentId), lineId, this.catalog) !== null) return false;
    ship.offer = null;
    ship.bankedLevels -= 1;
    this.settleSpend(ship, front, choice);
    this.materializeOffer(ship);
    return true;
  }

  /** The spend's application half: fit the pick and queue the self-private
   *  `bn`. Split from spendPoint (complexity budget).
   *
   *  NOTHING IS CONSUMED (Story 8.14): there is no deck to take the chosen card
   *  out of and no copy to give the unchosen ones back to — the pool is the
   *  catalog, bounded per ship by caps and slots. `applyCard` is the whole fit,
   *  and it is also where the TAKE is recorded.
   *
   *  The `bn` event stays HERE, deliberately: "a spend happened" is a property
   *  of the wire path only, and a spawn-time fit must queue nothing. */
  private settleSpend(ship: ShipRecord, front: BoonOffer, choice: number): void {
    const card = front[choice];
    this.applyCard(ship, card);
    // THE TAKE, IN THE HAND LOG (Story 8.21, R1): only a pick from an OFFER
    // lands here — the dev spawn fit calls applyCard directly and is no hand,
    // and a refused pick returned in spendCard before anything moved.
    const open = World.openHand(ship);
    if (open !== undefined) {
      open.taken = card;
      open.takenAtMs = this.now;
    }
    this.pending.push({ k: 'bn', id: ship.id, boon: card });
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
    // Combat bots (Story 6.4) write their inputs through the same store humans
    // use, so they are picked up by applyInputs exactly like any client this
    // tick: an AI input row must sit ahead of applyInputs in the SAME tick, or
    // every bot steers on a 50ms-stale command. IMMEDIATELY before
    // applyInputs — nothing may sit between this row and applyInputs (the
    // retired PvE `dronesTick` row sat beside it under the same rule, Story
    // 10.8). World hands the controller its per-tick entries (own record + bound
    // observe thunk per bot — see botEntries()); the controller holds no
    // World reference of its own.
    { name: 'botsTick', run: (w) => w.bots.tick(w.botEntries()) },
    { name: 'applyInputs', run: (w) => w.applyInputs() },
    { name: 'stepShips', run: (w, ctx) => w.stepShips(ctx.dt) },
    // THE HULL PASS (Story 9.5, amendment 25): every afloat-or-sinking hull is
    // a solid body; overlapping pairs are pushed apart by mass share through
    // the SHARED resolver the client predictor also runs. DELIBERATELY BEFORE
    // resolveCollisions: land is the hard constraint (no hull ever ends a tick
    // inside land — pinned), hull overlap the soft one, so a hull shoved
    // toward a coast resolves against that coast the same tick. The row also
    // records the tick's contacts and each hull's pre-damp speed for the
    // damage row below.
    { name: 'resolveHullContacts', run: (w) => w.resolveHullContacts() },
    { name: 'resolveCollisions', run: (w) => w.resolveCollisions() },
    // CONTACT DAMAGE (Story 9.5, amendments 25, 73–82): the hull-pair HIT
    // (once per contact, over the allowance) and GRIND, and the land strike
    // and scrape — all through the damage gate as source 'contact'. AFTER
    // resolveCollisions so the land edge (`landContact`, `landHeadOn`) is this
    // tick's truth, BEFORE sampleWakes / founderSinking so a hull sunk here
    // still lays this tick's wake and takes the sink edge in the ordinary
    // order.
    { name: 'applyContactDamage', run: (w) => w.applyContactDamage() },
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
    // COUNTERMEASURE cloud expiry (Story 9.3 — 8.18's `stepSmoke` seat,
    // kept DELIBERATELY: after founderSinking, after the motion block, BEFORE
    // applyStorm and everything after it). The row is an expiry sweep only —
    // a cloud is MADE at the SMOKE press (makeCloud, in activationControl)
    // and never moves — so the seat matters for one thing: a cloud whose
    // `until` arrives this tick is gone before any later consumer this tick
    // (the AI rows next tick read the store through observe(); frames.ts's
    // buildFrame, outside STEP_ORDER, ships the survivors the same tick).
    { name: 'stepClouds', run: (w) => w.stepClouds() },
    // THE FOG FIELD (Story 9.10) — weather beside weather, DIRECTLY after
    // stepClouds: once per refreshMs the coverage controller re-cuts the
    // field (live match only; no fog before the zone starts) and a new
    // density-memo epoch begins. Before applyStorm and every later row;
    // perception tolls its sight rays against this tick's cut through
    // observe() (frames.ts's buildFrame, outside STEP_ORDER, the same tick).
    { name: 'stepFog', run: (w) => w.stepFog() },
    // Storm: post-move positions decide who is outside the (damage-only) zone.
    // The physical map boundary stays at mapRadius — ships freely sail into the
    // storm; the zone only bites HP.
    { name: 'applyStorm', run: (w, ctx) => w.applyStorm(ctx.dt) },
    // THE STORM TAKES THE AIRDROPS (Story 10.9, epic-10 amendment 18) —
    // DIRECTLY after applyStorm and against THE SAME live ring: every crate
    // the ring has closed over (`isOutside`, the hull test's own predicate)
    // is deleted, so nothing later this tick can collect it and no frame
    // ships it. Unlike the bite it runs before the first close and with
    // damage off — a drop outside the ring is simply gone.
    { name: 'stormDrops', run: (w) => w.stormDrops() },
    // Ballistics + mines both test against post-move hulls (built once):
    // ctx.hulls() materializes the tick's ONE snapshot here, on first access
    // (see stepContext()), and the two mine rows below reuse it as-is.
    { name: 'stepShells', run: (w, ctx) => w.stepShells(ctx.dt, ctx.hitTargets) },
    { name: 'stepMines', run: (w, ctx) => w.stepMines(ctx.hitTargets) },
    // AIRDROP COLLECTION (Story 10.9, epic-10 amendment 18, R4) — DIRECTLY
    // after stepMines: against the tick's post-move, post-storm AFLOAT hull
    // outlines (the `hull` list of the hitTargets memo — rebuilt after any
    // sink this tick, so a hull the shells or a mine just sank collects
    // nothing). The first afloat participant (ship insertion order) whose
    // silhouette touches a crate takes it: index points, re-fold, `dp`.
    { name: 'collectDrops', run: (w, ctx) => w.collectDrops(ctx.hitTargets) },
    // PHOSPHOR burning-zone DoT (Story 2.8's seat, Story 8.17's source):
    // against post-move centers, BEFORE the expiry sweep so a zone burns
    // through its final tick. (The dazzle mark left this row with the verb in
    // Story 8.17; its FLASH SHELLS successor left with Story 9.4.)
    { name: 'applyZoneEffects', run: (w, ctx) => w.applyZoneEffects(ctx.dt) },
    // FOUL ZONE stamp (Story 9.4) — DELIBERATE seat, immediately after the
    // burn DoT: against POST-MOVE hull OUTLINES (the tick's hull snapshot,
    // already built for stepShells and reused here through the hitTargets
    // memo), so the stamp reads where the hull actually is this tick, and
    // BEFORE its expiry sweep (expireFoulZones below) so a zone fouls through
    // its final tick. The stamp's reader is next tick's stepShips — nothing
    // downstream in this tick reads `fouledUntil` except frames, which ship
    // the fresh stamp to the victim the same tick.
    { name: 'applyFoulZones', run: (w) => w.applyFoulZones() },
    // DAMAGE CONTROL (Eric rulings 2026-08-04; the HULL REPAIR pool and,
    // since Story 10.5 / R8, the passive regen) — DELIBERATE step-order
    // position: dead LAST among the hp movers, after EVERY damage source this
    // tick (storm, ballistics, mine blasts, the incendiary DoT) has already
    // bitten and any lethal bite has already routed through sinkShip. Two
    // things follow, both intended. (1) The afloat gate reads POST-DAMAGE truth
    // — a hull the storm sank this very tick is already `sunk` with its
    // pool zeroed, so a repair pool can never un-sink a hull at 0 hp; damage
    // wins the tie by construction, with no explicit tie-break code. (2) The
    // storm overlap nets exactly (heal rate − stormDps) per tick, because both
    // integrate the same dt against the same float hp in a fixed order. It sits
    // BEFORE processRespawns for the same reason tickXp sits after: a respawn
    // restores full hp and zeroes the pool, so anything paid to a wreck here
    // would be overwritten rather than banked. Nothing downstream in the step
    // reads hp or repairHp, so no other system depends on this position.
    { name: 'tickRepairs', run: (w, ctx) => w.tickRepairs(ctx.dtMs) },
    // WOUNDED SMOKE (Story 4.4) — DELIBERATE step-order position: directly
    // after the LAST hp mover (tickRepairs), so every damage source AND the
    // repair / regen heal have already resolved. A hull that crossed a band this tick
    // smokes at its post-resolution hp, and one healed above the band goes
    // silent the same tick it recovered.
    { name: 'tickSmoke', run: (w) => w.tickSmoke() },
    // Lit zones (Story 1.7): natural-expiry sweep, positioned with the other
    // static-entity resolution (the mines precedent). Zones are SPAWNED inside
    // stepShells (resolveBurst on a star shell) and deliberately survive their
    // owner's death — expiry is the only way out.
    { name: 'expireLitZones', run: (w) => w.expireLitZones() },
    // Burning zones (Story 8.17): the same natural-expiry sweep, beside the
    // lit zones'. Spawned inside stepShells (resolveBurst / resolveInterception
    // on a phosphor shell), they too survive their owner's death.
    { name: 'expireBurnZones', run: (w) => w.expireBurnZones() },
    // Foul zones (Story 9.4): the same natural-expiry sweep, beside the burn
    // zones' and AFTER applyFoulZones (the stamp lands through the final tick).
    { name: 'expireFoulZones', run: (w) => w.expireFoulZones() },
    // THE TURRET STEP (Story 10.4, contract §4; no traverse since Story 11.1,
    // R16) — DELIBERATE seat, directly BEFORE fireControl: every captain
    // hull's turret reloads count down and its turret angles are set to the
    // DERIVED angle for the latest input's aim point (the shared
    // `stepTurrets`, the very call the client predicts with). AFTER the
    // motion block (stepShips / resolveCollisions) so the angles read the
    // tick's RESOLVED pose, and after founderSinking so a hull that left the
    // water this tick already keeps its angles. BEFORE fireControl so a
    // turret that finishes its reload THIS tick may fire this tick (a turret
    // fired at tick T is ready again at exactly T + reloadMs / dt), and so the
    // mainBattery row's per-tick hotbar sync reads the stepped reloads.
    { name: 'stepTurrets', run: (w, ctx) => w.stepTurrets(ctx.dtMs) },
    // THE LAUNCHER STEP (Story 10.6, Eric 2026-11-05, R6 / R13; no traverse
    // since Story 11.1, R16) — the turret step's twin, seated directly beside
    // it and for the same reasons: every torpedo launcher's tube clocks count
    // down and its angle is set to the DERIVED angle for the SAME
    // latest-input aim (the shared `stepLaunchers` over `launcherAimPoint`,
    // the very calls the client predicts with); a sinking / dead hull keeps
    // its angles. BEFORE fireControl so a tube that finishes reloading this
    // tick may fire this tick, and the torpedo row's hotbar sync reads the
    // stepped tubes.
    { name: 'stepLaunchers', run: (w, ctx) => w.stepLaunchers(ctx.dtMs) },
    { name: 'fireControl', run: (w, ctx) => w.fireControl(ctx.dtMs) },
    // THE HELD-FIRE STREAM (Story 8.15): the machine gun's level channel,
    // resolved right after the click channel — the reloads have ticked (a
    // magazine swap that completed this tick may fire), and a click on a
    // stream row was already skipped by consumeClick, so the two channels
    // can never double-fire the first shell.
    { name: 'streamControl', run: (w) => w.streamControl() },
    // THE SECONDARIES (Story 10.4, R3, contract §4 step 5) — the second LEVEL
    // channel, DIRECTLY after streamControl: same tick-position rationale (the
    // post-move pose, after the click channel, before the ability channel),
    // and it reads the same LATEST input through the same refusal gate. The
    // shared heat stepper runs every tick for every captain hull — draining
    // while not firing — and the rounds it returns spawn here.
    { name: 'secondariesControl', run: (w, ctx) => w.secondariesControl(ctx.dtMs) },
    // Ability activation (Story 1.6): the actSeq sibling of fireControl, resolved
    // in the same step-order position — both turn this tick's stored input intent
    // into activations through the single sinking gate. Since Story 10.5 the
    // press names its ability (`InputMsg.act`): the Shift, HULL REPAIR or SMOKE.
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
    // RADIO BEACON PAYOUT (Story 10.8, R3 / R4) — DELIBERATE seat, directly
    // after tickXp and for tickXp's own reasons: after respawns (the afloat
    // gate reads post-respawn truth), after every damage row (a hull sunk
    // this tick is not paid; a beacon destroyed this tick already carries its
    // early sink time) and before the event swap, so a level a beacon banks
    // publishes its `pt` on THIS tick's frame. It pays through the same XP
    // door (`addXpMs`); nothing downstream in the step reads XP.
    { name: 'tickBeacons', run: (w, ctx) => w.tickBeacons(ctx.dtMs) },
    // RADIO BEACON PLACEMENT (Story 10.8, R2 / R10) — DELIBERATE step-order
    // position: LAST but for the airdrop scatter (which must read this set —
    // Story 10.9), after every row that touches a hull, and
    // zone-clock driven: when the clock enters a new ring cycle the set is
    // REPLACED. Last, so the placement reads every hull's settled end-of-tick
    // position (the max-min spacing and the keep-out discs) and a beacon
    // enters the world at a clean tick boundary — nothing this tick could
    // have paid, hit or rammed it. (The retired PvE wave spawner held this
    // seat for the same reason: a body placed mid-tick would be seen by the
    // later rows unmoved, unwaked and never collision-resolved.) The room
    // mirrors the new chart onto the schema right after the step.
    { name: 'placeBeacons', run: (w) => w.placeBeacons() },
    // AIRDROP SCATTER (Story 10.9, epic-10 amendment 18, R1) — DEAD LAST,
    // DIRECTLY AFTER placeBeacons (not before it): ring cycles begin on
    // minute marks, so on a cycle's first tick the new set must already be
    // charted for the HARD KEEP-OUT to read it — scattered first, a batch
    // would test against the outgoing set and could land inside a new
    // beacon's circle. Zone-clock driven: every match minute not yet
    // scattered (a long step catches up in order) places its batch inside
    // the live ring, clear of land and of every non-gone beacon. A crate
    // placed last enters the world at a clean tick boundary.
    { name: 'spawnDrops', run: (w) => w.spawnDrops() },
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
    // The ordnance collector's memo and the wreck list are PER-TICK state, so
    // they are cleared HERE, with the clock advance, not in the epilogue (Story
    // 8.4 review, P4). The epilogue looked equivalent — nothing between two
    // steps reads them — but sinkShip is reachable from OUTSIDE a step
    // (match.ts's leave-scuttle, a directed test), and an epilogue clear let
    // such a wreck survive into the NEXT tick as a "sank this tick" geometric
    // victim, minting an `hc` for a hull that sank before the tick began. The
    // collector's FIRST build of the tick still lands at stepShells, exactly
    // where the old ctx.hulls() snapshot was taken: nothing before that row
    // asks for targets.
    this.tickTargets.clear();
    this.sunkThisTick = [];
    const ctx = this.stepContext(dtMs);
    // THE REVEAL HOOK (Story 9.13 fix wave P8): the zone state is a function
    // of the clock just advanced, so the tick a next ring is revealed is this
    // one — its flow field is built HERE, before botsTick, not
    // inside whichever bot's situation asks first. A cache warm-up with no sim
    // effect (the lazy NavCache.fieldFor path stays the fallback), so it is
    // not a STEP_ORDER row.
    this.prewarmZoneNav();

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
    return {
      dt: dtMs / 1000,
      dtMs,
      hitTargets: (mask) => this.hitTargets(mask),
    };
  }

  /**
   * THE ORDNANCE TARGET COLLECTOR (Story 8.4, AR44 / D25 / placement rule 13).
   * THE only way any ordnance step finds anything to hit. A caller names the
   * KINDS its projectile may touch — always from a `CONFIG.<ordnance>.hits`
   * row, never a literal at the call site — and gets one list back.
   *
   * MEMOIZED PER TICK PER MASK. The key is the sorted mask, so two rows asking
   * for the same kinds in a different order share one build. The per-tick store
   * is cleared in the tick prologue, which puts the FIRST build exactly where
   * the old `ctx.hulls()` snapshot was built (stepShells — post-move,
   * post-storm), and that position is load-bearing: aliveHulls bakes post-move
   * polygon transforms and filters on post-storm liveness.
   *
   * AND INVALIDATED BY A SINK. `sinkShip` bumps a generation, so every list
   * built after it excludes the wreck. That is what DECIDES two ledgered
   * defects rather than inheriting them: a later shell of the same multi-barrel
   * click no longer collides with a hull the first shell just sank
   * (`deferred-work.md:594`), and the per-tick hull snapshot is no longer stale
   * across a mid-tick kill (`:249`). Mine deletion bumps it too, so a second
   * burst of the same click can never resolve against a mine an earlier cascade
   * already took off the water. What stays deliberately stale is a list a
   * caller is ALREADY holding — a mine blast resolves against the list
   * captured before it fired, with a
   * per-victim liveness re-check (amendment 5).
   *
   * THE KINDS:
   *   hull     — afloat silhouettes (a sinking hull is not a collision subject).
   *   mine     — EVERY mine as a POINT, any kind, armed or arming (amendment
   *              200). LANDING-ONLY: this kind is read by the deck guns'
   *              landing test (`landOnMines`) at the point a shell lands, never
   *              by a sweep — stepShells strips the `mine` bit off every
   *              projectile's mask before it collects the list stepShell flies
   *              against, so NO mine can stop, slow or report a shell passing
   *              overhead (amendment 20) — and never as a burst victim (shared
   *              burstVictims skips the kind).
   *   ordnance — every LIVE TORPEDO as a POINT (Story 8.15, amendment 105 —
   *              a SIDE EFFECT of the flak gun's mask, which is the only mask
   *              naming it). BURST-ONLY like `mine`: the World strips it off
   *              every sweep, so nothing in flight ever collides with a fish;
   *              a burst covering one REMOVES it (resolveBurst — no boom, no
   *              damage, no `hc`), and the owner's OWN fish are never victims
   *              (excluded at the burst, where the shooter is known).
   *   beacon   — every RADIO BEACON that is HITTABLE right now (Story 10.8,
   *              R6 / R8: afloat only — never charted, never once its sink has
   *              started), as the shared octagon body. NOT burst-only: a
   *              sweep stops on it like a hull, a burst covering it damages
   *              it, a homing fish may lock it (R12). Named by every weapon
   *              row's mask except the mine TRIP rows.
   */
  hitTargets(mask: readonly TargetKind[]): readonly Target[] {
    const key = [...mask].sort().join('|');
    const memo = this.tickTargets.get(key);
    if (memo !== undefined && memo.gen === this.targetsGen) return memo.list;
    const list: Target[] = [];
    // ORDER IS PARITY: hulls first, then mines, then ordnance — which burst
    // victim resolution and homing tie-breaks both read.
    if (mask.includes('hull')) this.collectHulls(list);
    if (mask.includes('mine')) this.collectMines(list);
    if (mask.includes('ordnance')) this.collectOrdnance(list);
    // ...and beacons LAST, so the three older kinds keep their relative order.
    if (mask.includes('beacon')) this.beacons.collectTargets(this.now, list);
    this.tickTargets.set(key, { gen: this.targetsGen, list });
    return list;
  }

  /** Afloat hull silhouettes (post-move), transformed into each ship's own
   *  scratch array so the 20Hz loop allocates only the small target list. */
  private collectHulls(out: Target[]): void {
    for (const ship of this.ships.values()) {
      if (!isAfloat(ship.lifecycle)) continue;
      const st = ship.state;
      transformPolygon(hullSilhouette(ship.hullId), st.x, st.y, st.heading, ship.hullPoly);
      out.push({ id: ship.id, kind: 'hull', poly: ship.hullPoly });
    }
  }

  /** EVERY mine on the water as a POINT target — any kind, armed OR arming,
   *  any owner (amendment 200, Eric 2026-10-01: an arming mine pops and a
   *  captive can be destroyed, so the old arming/captive gates are gone). A
   *  mine's polygon is the single vertex at its centre, read ONLY by the
   *  deck guns' LANDING TEST (`landOnMines`): nothing in flight is ever
   *  resolved against this list (amendment 20, sweepMask) and no burst ever
   *  counts a mine as a victim (shared burstVictims skips the kind). */
  private collectMines(out: Target[]): void {
    for (const mine of this.mines.values()) {
      out.push({ id: mine.id, kind: 'mine', poly: [{ x: mine.x, y: mine.y }] });
    }
  }

  /** Every live TORPEDO as a POINT target (Story 8.15, amendment 105) — the
   *  `ordnance` kind. A fish's polygon is the single vertex at its centre,
   *  BURST geometry exactly as a mine's: burstVictims asks "does the blast
   *  cover the fish's centre?". Nothing in flight is ever resolved against
   *  this list (sweepMask strips the kind). Gun-pattern shells are NOT here:
   *  the ruling names fish in flight, and a shell is in the air. */
  private collectOrdnance(out: Target[]): void {
    for (const shell of this.shells.values()) {
      if (shell.kind !== 'torp') continue;
      out.push({ id: shell.id, kind: 'ordnance', poly: [{ x: shell.x, y: shell.y }] });
    }
  }

  /** How many mines are live on the water right now — the `/metrics`
   *  `world.minesLivePeak` feed (Story 8.4). Count only: no mine identity, no
   *  position, nothing that could become an ops-side wallhack. */
  get mineCount(): number {
    return this.mines.size;
  }

  /** How many COUNTERMEASURE clouds are live right now — the `/metrics`
   *  `world.cloudLivePeak` feed (Story 8.18 / 9.3). Count only: no owner, no
   *  position, nothing that could become an ops-side wallhack. */
  get cloudCount(): number {
    return this.clouds.size;
  }

  /**
   * Every live COUNTERMEASURE cloud as a read-only array (Story 9.3). THE
   * reader: perception (once per observer context — `SignalContextBase.clouds`,
   * the `cloud` channel's subjects; a cloud occludes nothing since Story 9.3
   * session 2). A fresh snapshot per call, so a caller can never mutate the
   * store through it.
   */
  get cloudRecords(): readonly StoredCloud[] {
    return [...this.clouds.values()];
  }

  /** The live COVERAGE CUT (Story 9.10) — `FOG_NO_CUT` = no fog. Mirrored
   *  onto `ArenaState.fogCut` by the room; a number, never a position. */
  get fogCut(): number {
    return this.fogCutValue;
  }

  /** The realized fogged share of the live ring over the last quantile
   *  lattice (Story 9.10) — the `/metrics` and harness readout. A share,
   *  never a position. 0 with no fog. */
  get fogCoverageEstimate(): number {
    return this.fogCoverageShare;
  }

  /** The clock the server's fog view is evaluated at (Story 9.10): the last
   *  refresh's `now` — the field the toll reads is at most `refreshMs` old.
   *  The perception oracle integrates the shared density at this clock. */
  get fogEpochT(): number {
    return this.fogEpochTValue;
  }

  /** Memo cells evaluated since construction (Story 9.10 perf accounting). */
  get fogCellEvals(): number {
    return this.fogCellEvalCount;
  }

  /**
   * Fog density at (x, y) under the live cut at the epoch's clock, in [0, 1]
   * (Story 9.10): the shared `fogDensityAt` over this world's field — the
   * same view the toll walks. Public weather — read by the bots' sweep-miss
   * rule (amendment 169), the own-bank decision of the toll (179), metrics
   * and tests. 0 everywhere before the zone starts and beyond the ocean's rim.
   */
  fogDensityAt(x: number, y: number): number {
    return fieldDensityAt(this.fogField, x, y, this.fogEpochTValue, this.fogCutValue);
  }

  /**
   * THE FOG TOLL on the ray A → B, A THE OBSERVER (Story 9.10, amendments
   * 164 and 179): the extra sight distance the ray pays crossing fog — Σ over
   * the memo cells the segment crosses of `density(cell) × length inside the
   * cell`, times `sightCostPerU` (see `fogMemo`) — LESS THE OBSERVER'S OWN
   * BANK: when the shared density at A itself is solid (≥ FOG_SOLID_DENSITY,
   * one exact evaluation, memoized per observer position and epoch because
   * observe() tolls every ray of one observer in a row), the leading run of
   * solid cells pays nothing; the run ends at the first thinner cell and
   * never restarts (Eric 2026-10-16: "if you are in it, you should be able
   * to see out of it normally … like grass patches in League" — clear water
   * between you and a second bank makes that bank pay). Directional: the
   * reverse ray may cost more or less. THE one entry of the fog cost into
   * perception: signals.ts `eyeHolds` adds it to the ray's length through
   * the `SightField.fogToll` thunk the contexts bind to this method. 0 with no fog (no walk). The segment is CLIPPED to the lattice
   * square first (fog beyond the ocean's rim + margin is irrelevant — and
   * since amendment 179 the shared density is 0 past the rim anyway); a ray
   * wholly outside pays 0.
   */
  fogTollAlong(ax: number, ay: number, bx: number, by: number): number {
    if (this.fogCutValue >= FOG_NO_CUT) return 0;
    const memo = this.fogTollMemo;
    if (memo.epoch === this.fogEpoch && memo.ax === ax && memo.ay === ay && memo.bx === bx && memo.by === by) return memo.toll;
    const toll = this.fogTollWalked(ax, ay, bx, by);
    memo.ax = ax;
    memo.ay = ay;
    memo.bx = bx;
    memo.by = by;
    memo.epoch = this.fogEpoch;
    memo.toll = toll;
    return toll;
  }

  /**
   * THE SIGHT GATE'S FOG QUESTION, ANSWERED WITHOUT THE WHOLE WALK WHEN THE
   * ANSWER IS ALREADY DECIDED (Story 11.2 follow-up): does the ray A → B
   * (A the observer), `d` long, stay inside `range` once its toll is added —
   * exactly `toll <= 0 || d + toll <= range` for `toll = fogTollAlong(ax, ay,
   * bx, by)`, the comparison signals.ts ran on the full toll. The caller has
   * already established `d <= range` (the plain squared test).
   *
   * The toll is a sum of non-negative terms over the same cell walk, so two
   * bounds decide early and EXACTLY:
   *   - a density is at most 1, so the toll is at most `sightCostPerU` × the
   *     ray's length on the lattice: when `d` + that bound is inside `range`
   *     (less FOG_DECIDE_SLACK, which swallows the walk's float dust many
   *     times over) the ray is seen with no walk at all — every point inside
   *     `range / (1 + sightCostPerU)` of the eye — and the same bound over
   *     the cells still ahead ends a walk the moment the rest cannot matter;
   *   - the running sum never decreases, so the moment `d + tollSoFar` is
   *     past `range` the answer is "no" (checked with the final comparison's
   *     own expression, so it cannot disagree with it).
   * A walk that neither bound ends runs to the end and takes the reference
   * comparison. Never an approximation: `fogGate.test.ts` holds it equal to
   * the full toll's answer.
   */
  fogSightAdmits(ax: number, ay: number, bx: number, by: number, d: number, range: number): boolean {
    if (this.fogCutValue >= FOG_NO_CUT) return true;
    const memo = this.fogGateMemo;
    if (memo.epoch === this.fogEpoch && sameGateQuestion(memo, ax, ay, bx, by, d, range)) return memo.seen;
    const seen = this.fogSightWalked(ax, ay, bx, by, d, range);
    memo.ax = ax;
    memo.ay = ay;
    memo.bx = bx;
    memo.by = by;
    memo.d = d;
    memo.range = range;
    memo.epoch = this.fogEpoch;
    memo.seen = seen;
    return seen;
  }

  /**
   * The CURRENT island index (see `islandIdx`): validated against
   * `map.islands` on every read — one identity pass over the list — so a
   * caller takes it ONCE per pass (one observe(), one shell step) and hands
   * it to that pass's queries.
   */
  get islandIndex(): IslandIndex {
    const cur = islandIndexFor(this.islandIdx, this.map.islands);
    if (cur !== this.islandIdx && this.islandIdx !== undefined) this.losTestsRetired += this.islandIdx.narrowTests;
    this.islandIdx = cur;
    return cur;
  }

  /** Island narrow-phase tests since construction — how many islands a
   *  segment query took past the bounding circle to the core / coastline
   *  test (work accounting for the perception guard test and the tick-cost
   *  probe; never a gameplay input). */
  get losTests(): number {
    return this.losTestsRetired + (this.islandIdx?.narrowTests ?? 0);
  }

  /** The side of the density memo lattice in u (cells × cell size) — its
   *  extent accounting (Story 11.2 review gate, F2: the lattice is the
   *  ocean's bounding square plus one cell a side, never a sight reach). */
  get fogMemoSpanU(): number {
    return this.fogMemo.side * this.fogMemo.cell;
  }

  /** Lattice walks since construction (Story 11.2 review gate, F2 — the toll
   *  memo's accounting: a ray re-asked in the same epoch walks nothing; since
   *  the follow-up, neither does a ray the length bound decides). */
  get fogWalks(): number {
    return this.fogWalkCount;
  }

  /** The clipped lattice span of the ray A → B as `FOG_SPAN` (start point and
   *  delta), or false when the ray is degenerate or misses the lattice — then
   *  it pays nothing. Shared by the toll and the gate, so both walk the very
   *  same segment. */
  private fogSpan(ax: number, ay: number, bx: number, by: number): boolean {
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (!(len > 0) || !Number.isFinite(len) || !Number.isFinite(ax) || !Number.isFinite(ay)) return false;
    const m = this.fogMemo;
    const extent = m.cell * m.side;
    const t = FOG_CLIP;
    t.t0 = 0;
    t.t1 = 1;
    if (!clipAxis(ax, dx, m.ox, m.ox + extent, t) || !clipAxis(ay, dy, m.oy, m.oy + extent, t)) return false;
    const span = FOG_SPAN;
    span.sx = ax + dx * t.t0;
    span.sy = ay + dy * t.t0;
    span.dx = dx * (t.t1 - t.t0);
    span.dy = dy * (t.t1 - t.t0);
    return true;
  }

  /** The toll of one ray, walked (see `fogTollAlong`, its only caller). */
  private fogTollWalked(ax: number, ay: number, bx: number, by: number): number {
    if (!this.fogSpan(ax, ay, bx, by)) return 0;
    const ownBank = this.fogObserverInSolidFog(ax, ay);
    this.fogWalkCount += 1;
    const span = FOG_SPAN;
    return this.fogWalk(span.sx, span.sy, span.dx, span.dy, ownBank, FOG_NO_BOUNDS) * CONFIG.fog.sightCostPerU;
  }

  /** `fogSightAdmits`, computed (its only caller holds the one-entry memo). */
  private fogSightWalked(ax: number, ay: number, bx: number, by: number, d: number, range: number): boolean {
    if (!this.fogSpan(ax, ay, bx, by)) return true; // toll 0
    const span = FOG_SPAN;
    const cost = CONFIG.fog.sightCostPerU;
    const len = Math.sqrt(span.dx * span.dx + span.dy * span.dy);
    // In the walk's own units (Σ density × fraction of the span, at most 1)
    // the gate reads `d + sum × len × cost <= range`: `room` is the sum the
    // gate can absorb, less the slack.
    const room = (range - FOG_DECIDE_SLACK - d) / (len * cost);
    if (room >= 1) return true; // seen whatever the fog: no walk
    const ownBank = this.fogObserverInSolidFog(ax, ay);
    this.fogWalkCount += 1;
    const bounds = FOG_BOUNDS;
    bounds.acceptBelow = room;
    bounds.d = d;
    bounds.range = range;
    bounds.verdict = 0;
    const toll = this.fogWalk(span.sx, span.sy, span.dx, span.dy, ownBank, bounds) * cost;
    if (bounds.verdict !== 0) return bounds.verdict > 0;
    return toll <= 0 || d + toll <= range;
  }

  /** Does the observer at (x, y) stand in solid fog (the exact shared density
   *  at that point, not a memo cell — so the own-bank decision is the same on
   *  the reference march and the invariant oracle)? One-entry memo keyed on
   *  the position and the epoch: observe() asks for every ray of one observer
   *  in a row, so there the second and later rays cost nothing here; a miss
   *  is one shared density evaluation (≈ 0.3 µs), within the perf pin. */
  private fogObserverInSolidFog(x: number, y: number): boolean {
    const o = this.fogObserverMemo;
    if (o.x !== x || o.y !== y || o.epoch !== this.fogEpoch) {
      o.x = x;
      o.y = y;
      o.epoch = this.fogEpoch;
      o.solid = this.fogDensityAt(x, y) >= FOG_SOLID_DENSITY;
    }
    return o.solid;
  }

  /** The DDA over the memo from (sx, sy) along (dx, dy) (already clipped to
   *  the lattice): Σ density × length inside each visited cell — skipping the
   *  observer's own bank when `ownBank`: the leading run of solid cells
   *  (density ≥ FOG_SOLID_DENSITY) is free, and the first thinner cell ends
   *  the run for good (amendment 179). `bounds` is the sight gate's early
   *  exit (`fogSightAdmits`): when it sets `bounds.verdict` the walk stopped
   *  early and the returned sum is partial; the toll passes FOG_NO_BOUNDS,
   *  which never fires, so toll and gate read the very same sum. */
  private fogWalk(sx: number, sy: number, dx: number, dy: number, ownBank: boolean, bounds: FogBounds): number {
    const m = this.fogMemo;
    const len = Math.sqrt(dx * dx + dy * dy);
    let i = memoIndex(m.ox, m.cell, m.side, sx);
    let j = memoIndex(m.oy, m.cell, m.side, sy);
    const X = ddaAxis(m.ox, m.cell, i, sx, dx, FOG_DDA_X);
    const Y = ddaAxis(m.oy, m.cell, j, sy, dy, FOG_DDA_Y);
    const scale = len * CONFIG.fog.sightCostPerU;
    let sum = 0;
    let tCur = 0;
    const run = FOG_RUN;
    run.free = ownBank;
    run.first = true;
    for (let n = 2 * m.side + 2; n > 0; n--) {
      const tNext = Math.min(X.tMax, Y.tMax, 1);
      if (tNext > tCur) sum += this.fogPayCell(i, j, run) * (tNext - tCur);
      if (tNext >= 1) break;
      if (fogDecided(bounds, sum, tNext, len, scale)) break;
      tCur = tNext;
      if (X.tMax < Y.tMax) {
        X.tMax += X.tDelta;
        i += X.step;
      } else {
        Y.tMax += Y.tDelta;
        j += Y.step;
      }
      if (i < 0 || i >= m.side || j < 0 || j >= m.side) break; // the clip put the end on the rim: done
    }
    return sum * len;
  }

  /** The density cell (i, j) CHARGES the walk: 0 while the observer's own
   *  bank runs (`run.free` and the cell is solid — or it is the observer's
   *  OWN cell, `run.first`: they stand in solid fog by the exact evaluation,
   *  and a cell centre up to 7 u away, possibly behind them, must not end the
   *  run before it starts); the first thinner cell after that ends the run
   *  for good and every cell from there pays its density. */
  private fogPayCell(i: number, j: number, run: { free: boolean; first: boolean }): number {
    const d = this.fogCellDensity(i, j);
    const own = run.first;
    run.first = false;
    if (run.free && (own || d >= FOG_SOLID_DENSITY)) return 0;
    run.free = false;
    return d;
  }

  /** The memoized density of cell (i, j) in the current epoch — evaluated on
   *  first touch with the shared `fogDensityAt` at the epoch's clock and cut. */
  private fogCellDensity(i: number, j: number): number {
    const m = this.fogMemo;
    const idx = j * m.side + i;
    if (m.epoch[idx] !== this.fogEpoch) {
      const cx = m.ox + (i + 0.5) * m.cell;
      const cy = m.oy + (j + 0.5) * m.cell;
      m.dens[idx] = fieldDensityAt(this.fogField, cx, cy, this.fogEpochTValue, this.fogCutValue);
      m.epoch[idx] = this.fogEpoch;
      this.fogCellEvalCount += 1;
    }
    return m.dens[idx];
  }

  /** Start a new fog epoch at `now`: every memo cell is stale until touched. */
  private fogBumpEpoch(): void {
    this.fogEpoch += 1;
    this.fogEpochTValue = this.now;
  }

  /**
   * TEST-ONLY seam (Story 9.10): PIN the cut (stepFog then never moves it —
   * the zone gate, the target and the slew are all skipped until
   * resetForMatchStart; the epoch keeps bumping on its cadence) and start a
   * fresh epoch at `now`. −2 is density 1 on the whole ocean (0 past the
   * rim, amendment 179 — an observer on the ocean then stands in one
   * ocean-wide bank and pays nothing; one just past the rim pays for the
   * ocean part of its ray); `FOG_NO_CUT` is no fog. Production NEVER calls
   * it — the controller in stepFog is the only production writer of the cut.
   */
  setFogCutForTest(cut: number): void {
    this.fogCutPinned = true;
    this.fogCutValue = cut;
    this.fogNextRefreshAt = this.now + CONFIG.fog.refreshMs;
    this.fogBumpEpoch();
    this.fogCoverageShare = this.fogMeasureCoverage(this.zoneLiveRing);
  }

  /** TEST-ONLY seam (Story 9.10): the built field, so an oracle can integrate the shared density itself. */
  fogFieldForTest(): FogField {
    return this.fogField;
  }

  /**
   * Queue a SELF-PRIVATE wire denial for one refused press (Story 1.10 —
   * FR12's "denied fire is never silent"). The caller has already mapped the
   * refusal onto the wire vocabulary (wireDenialReason for a row's internal
   * denial; the shared cooldown law answers in wire reasons directly). A
   * denial is a SELF-PRIVATE wire message, so it is queued for a REAL
   * CONNECTED CAPTAIN only — the one site keyed on isHuman rather than on the
   * participant reading, because what it needs is a socket at the other
   * end, not a stake in the outcome (a 6.4 AI captain drives itself and has
   * nobody to tell). `seq` is the press identity the client dedups on
   * (fireSeq for clicks, actSeq for ability presses); `act` rides an ability
   * press only (Story 10.5).
   */
  private queueDenial(ship: ShipRecord, denial: DeniedView): void {
    if (!roleIsHuman(ship)) return;
    const queue = this.pendingDenials.get(ship.id) ?? [];
    queue.push(denial);
    this.pendingDenials.set(ship.id, queue);
  }

  /**
   * The wire reason for an internal row denial, or null when it never
   * travels: 'out-of-arc' and 'blocked' pass through; an empty pool reads
   * 'cooling' on the WEAPON click channel (the round is reloading — with the
   * shared ammo machine an empty weapon pool always has its reload running)
   * and 'no-ammo' on the ABILITY channel (no charge). The gate's
   * 'dead'/'empty-slot'/'frozen' refusals never reach the wire
   * (client-predictable / honest-client-unreachable).
   */
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
    // THE WATER a rider reads (Story 8.19): every ribbon as it stood after
    // LAST tick's sampleWakes — stepShips precedes sampleWakes in STEP_ORDER,
    // so the lift is one tick old by definition. Captured ONCE: the getter
    // allocates a fresh array per call.
    const ribbons = this.wakeRibbons;
    for (const ship of this.ships.values()) {
      const lc = ship.lifecycle;
      if (!isAfloat(lc) && !isSinking(lc)) {
        ship.draft = 0; // off the water: never a stale lift on the wire
        continue;
      }
      // Snapshot the pre-kinematics pose (induction-valid) for resolveShipPose's
      // rollback branch, then advance.
      const p = ship.prevPose;
      p.x = ship.state.x;
      p.y = ship.state.y;
      p.heading = ship.state.heading;
      const kin = this.tickKinematics(ship, ribbons);
      stepShip(ship.state, ship.input, kin, dt);
      // THE RITARDANDO (Story 5.2): the shared linear speed cap, applied
      // right after stepShip exactly where prediction.ts applies it — and
      // fed the POST-FOLD PER-TICK max (kin.maxSpeed — boost, slow, draft and
      // hooks all in), NEVER the rated class max: amendment 10 admits the
      // boost while sinking, and a rated-max ramp would silently cap the surge
      // out of existence. A live boost lifts the ceiling the ramp scales
      // (bonus × remaining), a slow lowers it, a wake under a sinking hull
      // lifts it (ruling 155), and either way the cap is exactly 0 at the
      // founder deadline. (The `kind` read, not isSinking(), because the
      // `since` payload needs the discriminant narrow — the gate above is the
      // seam.)
      if (lc.kind === 'sinking') applySinkingDecel(ship.state, kin.maxSpeed, lc.since, this.now);
    }
  }

  /**
   * One hull's kinematics for THIS tick — stamps `ship.draft` first (the
   * shared draftLift at the PRE-STEP pose, the hull's own attached ribbon
   * excluded by reference, the rider's own half hull length fed to the stern
   * rule — amendment 159), then folds.
   *
   * THE one place boost enters kinematics (Story 1.6): while the window is
   * open (now < boostUntil) the shared helper raises the forward maxSpeed cap
   * by CONFIG.boost.factor (+25 %) of the POST-FOLD max speed — so the SPEED
   * ladder is inside the bonus (Story 8.9, amendment 55) — and the hull
   * accelerates toward it at class accel and decays back at class decel on
   * expiry. Zero behaviors return the input reference unchanged, and a zero
   * draft returns its input reference unchanged, so an undrafted, hookless
   * tick is byte-identical to the pre-8.19 composition.
   *
   * PINNED COMPOSITION ORDER (server AND predictor, byte-identical — sim/
   * boost.ts, sim/slow.ts, sim/draft.ts, sim/hooks.ts headers) — five stages:
   *   boostedKinematics (the Shift's boost)
   *   → slowedKinematics (mine:  ship.slowFactor,                now < slowedUntil)
   *   → slowedKinematics (shell: CONFIG.foulingShell.slowFactor, now < fouledUntil)
   *   → draftedKinematics
   *   → hookKinematics
   * The mine's prop-fouling slow (Story 2.8) folds after the bespoke boost,
   * the FOULING SHELL zone's slow (Story 9.4, amendment 64) right after it —
   * two calls of the ONE shared fold, one per SOURCE, so different sources
   * multiply and the same source (one stamp per hull) never stacks with
   * itself — the wake draft (Story 8.19) after both slows, the boon hook
   * chain (Story 2.5) last; the client's Predictor.tickKin mirrors this exact
   * order from you.boostUntil / you.slowedUntil / you.fouledUntil / you.draft.
   */
  private tickKinematics(ship: ShipRecord, ribbons: readonly WakeRibbon[]): ShipConfig {
    ship.draft = draftLift(
      ribbons, ship.wake, ship.state.x, ship.state.y, ship.state.heading,
      ship.cls.hull.length / 2, this.now, CONFIG.wake.draft,
    );
    // STAGE ONE: the Shift's boost on the RATED kinematics (the SPEED BUOY's
    // term left with the buoys, Story 10.5; the predictor folds the same call
    // from you.boostUntil).
    const boosted = boostedKinematics(ship.stats.kinematics, CONFIG.boost.factor, this.now < ship.boostUntil);
    const slowed = slowedKinematics(boosted, ship.slowFactor, this.now < ship.slowedUntil);
    const fouled = slowedKinematics(slowed, CONFIG.foulingShell.slowFactor, this.now < ship.fouledUntil);
    const drafted = draftedKinematics(fouled, ship.draft, ship.draft > 0);
    return hookKinematics(drafted, ship.cardBehaviors, this.hookRegistry);
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
      if (this.isSettled(ship)) {
        // The resolver's own answer for a settled pose (settledPoses above).
        ship.landContact = false;
        ship.landHeadOn = 0;
        continue;
      }
      const st = ship.state;
      const cx = st.x;
      const cy = st.y;
      const ch = st.heading;
      const res = resolveShipPose(
        ship.prevPose,
        st,
        this.map.islands,
        this.map.radius,
        hullSilhouette(ship.hullId),
        ship.hullPoly,
      );
      ship.landContact = res.contact;
      ship.landHeadOn = res.headOn; // Story 9.5: the land strike / scrape read it
      applyGroundingDamp(st, res, ship.stats.kinematics.maxSpeed);
      if (!res.contact && st.x === cx && st.y === cy && st.heading === ch) this.noteSettled(ship);
    }
  }

  /** True iff this hull's candidate pose is its cached settled pose under
   *  the same silhouette, islands and map radius. */
  private isSettled(ship: ShipRecord): boolean {
    if (!this.settledPoseSkip) return false;
    const s = this.settledPoses.get(ship);
    if (s === undefined) return false;
    const st = ship.state;
    return st.x === s.x && st.y === s.y && st.heading === s.heading && ship.hullId === s.hullId
      && this.map.islands === s.islands && this.map.islands.length === s.islandCount
      && this.map.radius === s.radius;
  }

  /** Cache the hull's current (just-resolved, untouched, contact-free) pose. */
  private noteSettled(ship: ShipRecord): void {
    let s = this.settledPoses.get(ship);
    if (s === undefined) {
      s = { x: 0, y: 0, heading: 0, hullId: ship.hullId, islands: this.map.islands, islandCount: 0, radius: 0 };
      this.settledPoses.set(ship, s);
    }
    s.x = ship.state.x;
    s.y = ship.state.y;
    s.heading = ship.state.heading;
    s.hullId = ship.hullId;
    s.islands = this.map.islands;
    s.islandCount = this.map.islands.length;
    s.radius = this.map.radius;
  }

  /**
   * THE HULL PASS (Story 9.5, amendment 25; see the STEP_ORDER row). Bodies
   * are every hull on the water — afloat OR SINKING (amendment 82: a wreck is
   * solid and movable; the damage path is what refuses it) — each at its
   * post-kinematics pose with its silhouette transformed into `hullPoly`
   * (per-tick scratch: resolveCollisions re-transforms it right after this
   * row and collectHulls again later, so the translation the push applies
   * here is consumed by this tick's resolver and never read stale). `mass` is
   * `stats.armor` from effectiveStats — the ARMOR index IS the mass (Story
   * 10.3, Eric 2026-11-04, ruling 2: "ramming mass = ARMOR"); HUNKER's
   * temporary bonus is NOT mass. The pass moves `state.x/y` directly; the land pass
   * then validates the pushed pose exactly as it validates a kinematics
   * candidate (rollback to `prevPose` if it cannot be cleared).
   *
   * `preDampSpeed` is stamped here, BEFORE applyGroundingDamp can cap it: the
   * land strike is priced on the speed the hull arrived with.
   */
  private resolveHullContacts(): void {
    const bodies = this.contactBodyList;
    bodies.length = 0;
    for (const ship of this.ships.values()) {
      if (!isAfloat(ship.lifecycle) && !isSinking(ship.lifecycle)) continue;
      ship.preDampSpeed = Math.abs(ship.state.speed);
      const st = ship.state;
      transformPolygon(hullSilhouette(ship.hullId), st.x, st.y, st.heading, ship.hullPoly);
      bodies.push(this.contactBodyOf(ship));
    }
    // RADIO BEACONS (Story 10.8, R7 / R12): every SOLID beacon — afloat or
    // sinking, the wreck law — is an IMMOVABLE body of mass = its ARMOR, so
    // the shared resolver pushes the hull the whole way out and reports the
    // pair for the damage row.
    this.beacons.collectBodies(this.now, bodies);
    resolveHullContacts(bodies, this.hullContacts);
  }

  /** The cached body for a hull, its mass (the ARMOR index, Story 10.3)
   *  refreshed from effectiveStats. A test that swaps a record's `state`
   *  object gets a fresh body. */
  private contactBodyOf(ship: ShipRecord): ContactBody {
    let body = this.contactBodies.get(ship.id);
    if (body === undefined || body.state !== ship.state || body.poly !== ship.hullPoly) {
      body = { id: ship.id, state: ship.state, poly: ship.hullPoly, mass: ship.stats.armor, movable: true };
      this.contactBodies.set(ship.id, body);
    }
    body.mass = ship.stats.armor;
    return body;
  }

  /**
   * CONTACT DAMAGE (Story 9.5; see the STEP_ORDER row). Two halves:
   *   (a) HULL PAIRS — for every pair the hull pass reported: the HIT if the
   *       pair is not latched and its closing speed is over the allowance
   *       (`contactHitDamage`) — THE LATCH ARMS ONLY ON A CHARGED HIT
   *       (Eric 2026-10-13, amendment 83), so an under-allowance touch is
   *       measured again next tick — then the BLEED (`contactGrindRate` on
   *       sliding + pressing speed) applied per tick as a FRACTION through
   *       the gate as 'grind', exactly as the burn is. The hit goes through
   *       hitShip with the OTHER hull as `byId`, so damage credit, the kill,
   *       the bounty all behave as for a shell; the bleed goes through
   *       applyDamage with the same `byId` (credit and the kill — the burn's
   *       seat). ATTACKER
   *       ELIGIBILITY IS READ AT EACH BLOW — except that the two halves of
   *       one hit are one impact and read both ids at that instant (a mutual
   *       ram credits both, the spec's mutual-kill row): the hit on A can
   *       sink A, after which every LATER blow — the bleed from this tick on
   *       — credits nobody. A sinking victim is refused inside
   *       the gate (amendment 82) while the live hull still pays its share —
   *       and a WRECK IS NEVER THE ATTACKER: a live hull that runs into a
   *       sinking one pays with no `byId` (no damage credit, no
   *       assist-ledger seat, no kill for "a sink it did not cause" — the
   *       spec's wreck row; the feed then reads LOST WITH ALL HANDS) but it
   *       is still HULL contact, not land (`lastContactWasLand` false).
   *   (b) LAND — the strike on the `landContact` false → true edge priced on
   *       `preDampSpeed × headOn`, and the scrape on the SLIDING component
   *       only while contact holds (a hull pinned head-on against a rock
   *       bleeds nothing — amendment 81); both with no `byId` (no credit, a
   *       `dmg`, no feed cause — amendment 76). A parked hull (speed 0)
   *       accrues nothing.
   * Then the latch re-arms (every charged pair key NOT overlapping this tick
   * is dropped) and every bleed window not fed this tick flushes its `dmg`.
   */
  private applyContactDamage(): void {
    const dt = CONFIG.tick.simDtMs / 1000;
    const seen = this.contactKeysNow;
    seen.clear();
    this.grindingNow.clear();
    for (const c of this.hullContacts) {
      seen.add(`${c.a}|${c.b}`);
      this.damagePair(c, dt);
    }
    for (const key of this.contactLatch) if (!seen.has(key)) this.contactLatch.delete(key);
    for (const ship of this.ships.values()) {
      if (isAfloat(ship.lifecycle) || isSinking(ship.lifecycle)) this.damageLand(ship, dt);
    }
    for (const key of [...this.dotBuckets.keys()]) {
      if (key.startsWith(GRIND_KEY_PREFIX) && !this.grindingNow.has(key)) this.flushDot(key);
    }
  }

  /** (a) one overlapping pair: the HIT when unlatched and charged, then the
   *  BLEED. */
  private damagePair(c: HullContact, dt: number): void {
    const a = this.ships.get(c.a);
    const b = this.ships.get(c.b);
    if (a === undefined || b === undefined) {
      this.damageBeaconPair(c, dt, a ?? b);
      return;
    }
    // MASS = ARMOR (Story 10.3, ruling 2): the folded ARMOR index, never the
    // HUNKER bonus and never maxHp.
    const mA = a.stats.armor;
    const mB = b.stats.armor;
    const key = `${c.a}|${c.b}`;
    if (!this.contactLatch.has(key) && c.vn > CONFIG.ram.allowanceU) {
      // THE CHARGED HIT (amendment 83): over the allowance, priced and
      // latched — even when the price floors to 0 at a crawl, this IS the
      // strike of this contact. The two halves are ONE impact: both attacker
      // ids are read at the instant of impact, so a mutual ram credits both
      // (the spec's mutual-kill row) although the first half may sink its
      // victim before the second lands.
      this.contactLatch.add(key);
      const hit = contactHitDamage(mA, mB, c.vn, CONFIG.ram);
      const byA = World.attackerId(a);
      const byB = World.attackerId(b);
      this.dealContact(a, hit.a, byB, 'hull');
      this.dealContact(b, hit.b, byA, 'hull');
    }
    // THE BLEED is a later blow: eligibility is re-read now — a hull the hit
    // just sank credits nothing from here on.
    const bleed = contactGrindRate(mA, mB, c.vt, c.vn, CONFIG.ram);
    this.bleedContact(a, bleed.a * dt, World.attackerId(b), 'hull');
    this.bleedContact(b, bleed.b * dt, World.attackerId(a), 'hull');
  }

  /**
   * A HULL AGAINST A RADIO BEACON (Story 10.8, R7 / R12): the ramming law
   * with the beacon as an anchored hull of mass = its ARMOR. `ship` is the
   * pair's hull (undefined when neither id names one); the other id must name
   * a beacon. The same two halves as a hull pair — the latched HIT over the
   * allowance, then the BLEED — priced by the same shared functions:
   *   - the SHIP's share goes through the gate with NO attacker (the wreck
   *     row: a hull sunk on a beacon has no killer, no credit, no assist);
   *   - the BEACON's share goes through `damageBeacon` credited to the
   *     rammer while that hull is afloat (a wreck is never the attacker) —
   *     and the door itself refuses it once the beacon's sink has started,
   *     so a sinking beacon is solid yet takes nothing.
   */
  private damageBeaconPair(c: HullContact, dt: number, ship: ShipRecord | undefined): void {
    if (ship === undefined) return;
    const shipIsA = ship.id === c.a;
    const beacon = this.beacons.get(shipIsA ? c.b : c.a);
    if (beacon === undefined) return;
    const mShip = ship.stats.armor;
    const mBeacon = CONFIG.beacons.armor;
    // The pair is priced in the contact's own (a, b) order; these read each
    // side's share back out of it.
    const shipShare = (split: { a: number; b: number }): number => (shipIsA ? split.a : split.b);
    const beaconShare = (split: { a: number; b: number }): number => (shipIsA ? split.b : split.a);
    const mA = shipIsA ? mShip : mBeacon;
    const mB = shipIsA ? mBeacon : mShip;
    const key = `${c.a}|${c.b}`;
    if (!this.contactLatch.has(key) && c.vn > CONFIG.ram.allowanceU) {
      this.contactLatch.add(key);
      const hit = contactHitDamage(mA, mB, c.vn, CONFIG.ram);
      const by = World.attackerId(ship); // read at the instant of impact
      this.dealContact(ship, shipShare(hit), undefined, 'hull');
      this.ramBeacon(beacon, beaconShare(hit), 'contact', by);
    }
    const bleed = contactGrindRate(mA, mB, c.vt, c.vn, CONFIG.ram);
    this.bleedContact(ship, shipShare(bleed) * dt, undefined, 'hull');
    this.ramBeacon(beacon, beaconShare(bleed) * dt, 'grind', World.attackerId(ship));
  }

  /** One half of a ram landing on a beacon: nothing unless it is a real blow
   *  (the `isBlow` floor the hull halves share). */
  private ramBeacon(beacon: BeaconRecord, amount: number, src: 'contact' | 'grind', byId: string | undefined): void {
    if (World.isBlow(amount)) this.damageBeacon(beacon.id, amount, src, byId);
  }

  /** The id a blow is credited to, read AT THE BLOW: the other hull while it
   *  is afloat, nobody once it is sinking (a wreck is never the attacker). */
  private static attackerId(other: ShipRecord): string | undefined {
    return isAfloat(other.lifecycle) ? other.id : undefined;
  }

  /** True iff `amount` is a quantity the gate may see: finite and above zero.
   *  A NaN mass or speed prices as 0 in the shared math; this is the floor
   *  under that, so applyDamage never sees NaN. */
  private static isBlow(amount: number): boolean {
    return Number.isFinite(amount) && amount > 0;
  }

  /** One whole-hp contact STRIKE: through hitShip (credit) when a live hull
   *  dealt it, through the bare gate when the coast or a wreck did.
   *  `kind` stamps `lastContactWasLand` for the tally and the harness. */
  private dealContact(victim: ShipRecord, amount: number, byId: string | undefined, kind: 'hull' | 'land'): void {
    if (!World.isBlow(amount)) return;
    victim.lastContactWasLand = kind === 'land';
    if (byId === undefined) this.applyDamage(victim, amount, 'contact', undefined);
    else this.hitShip(victim, amount, byId, 'contact');
  }

  /** One tick of contact BLEED: a fractional 'grind' through the gate (the
   *  burn's seat — cut unfloored, fractional hp write, windowed
   *  `dmg`), credited to `byId` when a live hull dealt it. Marks the bleed
   *  window fed this tick so applyContactDamage does not flush it. */
  private bleedContact(victim: ShipRecord, amount: number, byId: string | undefined, kind: 'hull' | 'land'): void {
    if (!World.isBlow(amount) || !isAfloat(victim.lifecycle)) return;
    victim.lastContactWasLand = kind === 'land';
    this.grindingNow.add(grindKey(byId, victim.id));
    this.applyDamage(victim, amount, 'grind', byId);
  }

  /** (b) one hull against the coast: the strike on the edge, the scrape while
   *  pressed. `landHeadOn` is this tick's resolveCollisions reading. */
  private damageLand(ship: ShipRecord, dt: number): void {
    if (ship.landContact) {
      const headOn = ship.landHeadOn;
      if (!ship.landWasContact) {
        this.dealContact(ship, landHitDamage(ship.stats.armor, ship.preDampSpeed * headOn, CONFIG.ram), undefined, 'land');
      }
      const vt = ship.preDampSpeed * Math.sqrt(Math.max(0, 1 - headOn * headOn));
      this.bleedContact(ship, landGrindRate(vt, CONFIG.ram) * dt, undefined, 'land');
    }
    ship.landWasContact = ship.landContact;
  }

  /** A hull's TRUE attainable top speed for wake-ring provisioning (Story
   *  4.12): the effective kinematics cap with an OPEN boost window AND a full
   *  wake-draft lift (Story 8.19) folded in — through the SAME shared hooks
   *  stepShips and the client predictor use (Story 8.9), never a hand-written
   *  multiply, so the server's provisioning and the client's ring budget land
   *  on the identical double. The kinematics come off effectiveStats(), the
   *  sole derivation path. Never raw CONFIG for the cap. */
  private static wakeTopSpeed(stats: EffectiveStats): number {
    // The Shift's boost on the base (the SPEED BUOY's term left with the
    // buoys, Story 10.5) — the same call stage one folds.
    const boosted = boostedKinematics(stats.kinematics, CONFIG.boost.factor, true);
    return draftedKinematics(boosted, CONFIG.wake.draft.lift, true).maxSpeed;
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
   * ribbon is dropped immediately (nothing to age out). Detached water has no
   * hull ahead of it, so its `hullAheadU` drops to 0 (Story 8.19's stern
   * rule, amendment 159 — all of it is draftable back to the rider's own
   * half length).
   */
  private detachWake(ship: ShipRecord): void {
    if (pruneWake(ship.wake, this.now) > 0) {
      ship.wake.hullAheadU = 0; // detached water: no hull ahead of it (amendment 159)
      this.orphanWakes.push(ship.wake);
    }
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
    const state = this.zoneTimelineState();
    const ring = state?.current ?? this.idleRing();
    // THE RAMP (Eric 2026-10-07): the rate is a function of how many closes
    // have started — see stormDpsFor. 0 before the first close (nobody can be
    // outside ring 0 anyway), the ladder's last rung once fully closed.
    const bite = stormDpsFor(state, CONFIG.zone) * dt;
    if (bite <= 0) return;
    for (const ship of this.ships.values()) {
      if (!isAfloat(ship.lifecycle) || !isOutside(ship.state, ring.cx, ring.cy, ring.r)) continue;
      // THE GATE (Story 8.4 / AR47): `byId` undefined is what makes "the storm
      // has no killer" and "the storm never refreshes an attacker's counter"
      // structural — the gate skips creditDamage for src 'storm', and sinkShip
      // is reached with `by` undefined. It emits NO `dmg` either (parity: a
      // 20Hz drowning event stream is wire noise; the victim already receives
      // live hp on OwnShip every frame).
      this.applyDamage(ship, bite, 'storm', undefined);
    }
  }

  /**
   * THE TWO WAYS HP COMES BACK (Eric rulings 2026-08-04; re-cut by epic-8
   * amendments 46-48; Story 10.5, Eric 2026-11-05, epic-10 amendment 11) —
   * applyStorm's structural INVERSE: per-tick fractional hp against the same
   * float, clamped, with NO per-tick event (that would spam ~20/s; the owner
   * already receives live `hp` AND `repairHp` on every frame via OwnShip, so
   * the HUD stays exact).
   *
   *   1. THE PAID POOL (`repairHp`) — what a HULL REPAIR press bought. It
   *      drains on the WALL CLOCK at the fixed rate regenHp/regenMs:
   *      `repairHp` decrements by the elapsed budget WHETHER OR NOT the hp
   *      lands. Overflow past maxHp is therefore LOST, not banked — the ruled
   *      behavior, and the reason the press is refused at full hp.
   *
   *   2. THE PASSIVE REGEN (R8 — back since Story 10.5): once the shared
   *      `regenDue(now, lastDamagedAt)` holds (15 s since the last blow that
   *      removed hull hp, any source), `regenGain` adds 2 % of the MISSING hp
   *      per second. Fixed for every hull (captains and combat bots) — not a
   *      stat, no card. It runs BESIDE the pool (neither resets the
   *      other); no event, no cue.
   *
   * IT SITS IN THIS METHOD'S EXISTING STEP_ORDER SLOT — dead LAST among the hp
   * movers, after every damage source — so a blow this tick has already reset
   * the regen clock before the regen reads it.
   *
   * Only AFLOAT hulls tick — "no hp comes back to a hull in the sinking
   * window" (amendment 10).
   */
  private tickRepairs(dtMs: number): void {
    for (const ship of this.ships.values()) {
      if (!isAfloat(ship.lifecycle)) continue;
      // The pool's OWN stamped rate (Story 10.6, R8 / R15), never CONFIG's.
      if (ship.repairHp > 0) World.payRepair(ship, ship.repairRate * dtMs);
      if (World.regenerates(ship, this.now)) ship.hp += regenGain(ship.hp, ship.stats.maxHp, dtMs / 1000);
    }
  }

  /** Does this afloat hull take the R8 passive regen this tick? Every hull is
   *  a captain or a combat bot since Story 10.8 (the PvE fleet's exclusion,
   *  epic-9 amendment 48, retired with it). regenGain caps at the missing hp
   *  itself (0 on a full hull), so no clamp at the call site: a directed
   *  over-full hull is never pulled down. */
  private static regenerates(ship: ShipRecord, now: number): boolean {
    return regenDue(now, ship.lastDamagedAt);
  }

  /** Drain the PAID pool by its wall-clock budget. The pool decrements WHETHER
   *  OR NOT the hp lands, so overflow past maxHp is lost rather than banked —
   *  the ruled behavior. */
  private static payRepair(ship: ShipRecord, budget: number): void {
    const paid = Math.min(budget, ship.repairHp);
    ship.repairHp -= paid;
    ship.hp = Math.min(ship.hp + paid, ship.stats.maxHp);
  }

  /** Zero the repair pool. ONE helper for the three sites that end a hull's
   *  repair state (sink, redeploy, respawn), so a future channel cannot be
   *  added to one of them and forgotten in the others. */
  private static clearRepair(ship: ShipRecord): void {
    ship.repairHp = 0;
  }

  /** Both cooldown abilities READY (Story 10.5): every placement edge that
   *  starts a fresh life — redeploy and respawn (addShip builds them ready). */
  private static readyAbilities(ship: ShipRecord): void {
    ship.repairReadyAt = 0;
    ship.smokeReadyAt = 0;
  }

  // `aliveHulls()` is GONE (Story 8.4): the one place hull silhouettes are
  // gathered is the collector's `collectHulls`, reached only through
  // hitTargets(). It still DELIBERATELY EXCLUDES SINKING HULLS (Story 5.2,
  // amendment 12): a hull in the window is not a collision subject — ordnance
  // passes through rather than resolving a no-op hit (the perceivability seam
  // makes it a visible TARGET; nothing makes it a HITTABLE one).

  /** Every afloat PARTICIPANT's denial disc, of radius
   *  `CONFIG.beacons.keepOutU` — its OWN fact since Story 11.2 (R20: today's
   *  1,000 u kept; it was `CONFIG.vision.dropout.startU`, Eric 2026-10-13,
   *  Story 9.8, until the dropout was removed): 16 discs of 1,000 u cover
   *  ~64 % of the 5,000 u ocean so the lattice seats a placement without the
   *  fallback. (Before Story 9.8 the disc rode each hull's effective
   *  `stats.radarRange`.) THE one derivation of the
   *  denied region, read by the RADIO BEACON placement (Story 10.8; the
   *  retired PvE fleet anchor read it before).
   *
   *  KEYED ON THE PARTICIPANT READING (Story 6.3): every hull that contests
   *  the match denies the water around itself — a 6.4 AI captain denies like
   *  any other combatant. */
  private captainDiscs(): IntelDisc[] {
    const denied: IntelDisc[] = [];
    for (const s of this.ships.values()) {
      if (!isAfloat(s.lifecycle) || !roleIsParticipant(s)) continue;
      denied.push({ x: s.state.x, y: s.state.y, r: CONFIG.beacons.keepOutU });
    }
    return denied;
  }


  /** Advance every live ballistic; spent ones emit a boom (+ damage on a hit).
   *  THE one spent-shell path: remove it from flight, drop every observer's
   *  seen-memory, resolve its outcome into events/damage. The D1 back-dated
   *  spawn pre-step deliberately does NOT resolve outcomes (see preStepShell) —
   *  every projectile funnels through here, one tick after spawn at the
   *  earliest, so all shell damage resolves in exactly one place. */
  private stepShells(dt: number, hitTargets: HitTargets): void {
    const islandIndex = this.islandIndex; // validated once for the whole step
    // THE SWEEP'S TARGET BOXES (Story 11.2 follow-up): one bounding box per
    // target of each list this step flies against, taken HERE — inside the
    // pass, from the polygons as they stand — and dropped with the pass, so a
    // box can never outlive the pose it was taken at (no hull moves inside
    // this row; a sink mid-loop hands out a NEW list, which gets new boxes).
    // A shell step is a short segment: with the boxes it asks only the hulls
    // it can reach instead of edge-testing every hull on the water.
    const boxes = new Map<readonly Target[], readonly PolyBox[]>();
    for (const [id, shell] of this.shells) {
      // EVERY PROJECTILE ASKS THE COLLECTOR FOR ITS OWN MASK (Story 8.4,
      // AR44): a deck-gun shell sees hulls and mines; a torpedo sees hulls;
      // a star shell detonates nothing. The mask rides the
      // projectile (`ShellState.hits`, copied off its CONFIG row at launch), so
      // this loop never branches on which weapon fired.
      //
      // TWO LISTS, AND THE DIFFERENCE BETWEEN THEM IS THE WHOLE OF AMENDMENT
      // 20 (Eric 2026-09-16). `burstSet` is the full mask — what the shell's
      // RESOLUTION reads: the burst's victims, and the mines the LANDING TEST
      // checks at the point the shell lands (amendment 200). `sweepSet` is the
      // same mask MINUS `mine`, and it is the only list stepShell ever sees, so
      // a shell in flight cannot collide with, stop on, or in any way notice a
      // mine it merely flies over. For a mask with no `mine` bit the two are
      // the same memoized array by identity (sweepMask returns the row
      // unchanged), so nothing is built or filtered twice for a torpedo.
      const burstSet = hitTargets(shell.hits);
      const sweepSet = hitTargets(sweepMask(shell.hits));
      const outcome = stepShell(shell, {
        islands: this.map.islands,
        islandIndex,
        targets: sweepSet,
        targetBoxes: targetBoxesOf(boxes, sweepSet),
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
      this.resolveShell(shell, outcome, burstSet);
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
  private stepMines(hitTargets: HitTargets): void {
    // TRIPPING scans EACH KIND'S OWN `hits` row (`MINE_TRIP_HITS`) — HULLS
    // ONLY on all three today — remote minefield clearing is a mechanic
    // nobody ruled on; a deck gun shell landing on the mine is the sanctioned
    // way (amendment 200). DETONATION resolves against the blast set (hulls).
    //
    // THE ITERATION INSIDE checkMineTriggers IS NOT AN ORDNANCE STEP FINDING
    // TARGETS — it is the mine SYSTEM stepping its own store, asking each of
    // its own entities whether anything tripped it. Placement rule 13 forbids
    // an ordnance step enumerating world entities to find VICTIMS; a system
    // walking its own store to advance itself is the opposite direction. The
    // same distinction covers chainMines (one detonation propagating inside
    // the mine store).
    const hulls = (kind: MineKind): readonly Target[] => hitTargets(CONFIG[MINE_TRIP_HITS[kind]].hits);
    for (const { mine, victimId } of checkMineTriggers(this.mines, hulls, this.now, this.mineTripRules())) {
      if (mine.kind === 'captive') this.launchCaptiveTorpedo(mine, victimId);
      else this.detonateMine(mine, hitTargets(MINE_BLAST_HITS), victimId);
    }
  }

  /** The per-mine trip policy for this tick: the trip ring off the OWNER's row
   *  FOR THAT MINE'S KIND (Story 8.13 — one hull may hold all three racks, so
   *  the kind is the mine's own, stamped at drop), with that kind's CONFIG
   *  base as the vacated-owner fallback so an orphan keeps no dead build's
   *  numbers; plus the captive-only hostile gate. */
  private mineTripRules(): MineTripRules {
    return {
      triggerRadius: (ownerId, kind) =>
        this.ships.get(ownerId)?.stats.equipment[MINE_ROW_ID[kind]].triggerRadius ?? configTriggerRadius(kind),
      hostile: (ownerId, victimId) => this.isCaptiveMineHostile(ownerId, victimId),
    };
  }

  /**
   * "HOSTILE" FOR A CAPTIVE MINE (Story 7-5 wave 2, R2.13 — Eric's ruling). An
   * enemy CAPTAIN OR BOT always is: they contest the match, and the mine's
   * owner is already excluded upstream. (The PvE drone's live-aggro clause
   * retired with the fleet at Story 10.8.)
   *
   * THE GATE IS CAPTIVE-ONLY and must not be widened: ordinary and prop-fouling
   * mines still trip on ANY non-owner hull. A vanished victim is not hostile,
   * so a mid-tick teardown cannot launch a torpedo at nothing.
   */
  private isCaptiveMineHostile(_ownerId: string, victimId: string): boolean {
    return this.ships.get(victimId) !== undefined;
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
   * lead solver of game/lead.ts. Turn and it misses.
   *
   * It carries the OWNER's effective CAPTIVE MINES damage and burst radius —
   * read again at detonation through the ordinary mine-blast path — and, since
   * epic-8 amendment 82, that row's `homingTurnRate`: 0 at tier I (a pure lead
   * shot that misses if you turn) stepping to 0.3 rad/s at tier V, where the
   * fish steers under the family's acquire/die rules. FOULING NEVER RIDES
   * ALONG any more: it is its own line with its own mines (amendment 81), so a
   * captive fish's hit slows nothing. A vacated owner falls back to the CONFIG
   * bases exactly as a mine blast does; a vanished VICTIM cannot happen here
   * (the hostile gate refuses one). The fish's homing lock is PINNED to that
   * victim (cycle-148 review gate, P6) — see `captiveTorpedo`.
   */
  private launchCaptiveTorpedo(mine: MineState, victimId: string): void {
    if (!this.consumeMine(mine.id)) return; // already spent this tick
    const victim = this.ships.get(victimId);
    if (victim === undefined) return;
    const { damage, blastRadius, homingTurnRate } = this.mineBlastParams(mine.ownerId, 'captive');
    const vx = Math.cos(victim.state.heading) * victim.state.speed;
    const vy = Math.sin(victim.state.heading) * victim.state.speed;
    // THE LEAD SOLUTION IS ALWAYS THE STRAIGHT-RUN ONE at the family speed: a
    // steering fish CORRECTS from there, it does not aim differently.
    const led = leadIntercept(mine, victim.state, vx, vy, CONFIG.torpedo.speed);
    const dir = Math.atan2(led.y - mine.y, led.x - mine.x);
    this.spawnBallistic(
      captiveTorpedo(this.nextBallisticId(), mine, dir, this.now, {
        damage,
        blastRadius,
        homingTurnRate,
        // THE FISH IS LOCKED TO THE TRIPPING HULL (cycle-148 review gate, P6):
        // the hostile gate (R2.13) cleared THIS victim, and nothing in flight
        // may widen that. A steering torpedo that re-acquired would happily
        // chase a bystander that drifted nearer.
        targetId: victim.id,
      }),
    );
  }

  /**
   * Detonate ONE mine — and its NAVAL CHAIN (Story 2.8; amendments 18, 200).
   * Each detonation: despawn, one boom at the mine point (`hit` = the tripping
   * ship on the FIRST mine only; chained mines and gun-shot detonations carry
   * NO victim id — the splash-boom convention), then the BLAST: every
   * non-owner hull whose silhouette is within the OWNER's effective
   * blastRadius takes the owner's effective mine damage through the hitShip
   * choke (victim-private dmg, kill credit; OWNER EXCLUDED — the universal AoE
   * convention; a VACATED owner's mine falls back to CONFIG bases, pinned).
   * FOULING (the KIND, amendment 81): victims of a FOULING mine's blast get
   * slowedUntil AND slowFactor refreshed (never stacked); a naval mine never
   * fouls. CHAINS (naval only, both ways — amendment 200): a NAVAL detonation
   * sets off every ARMED NAVAL mine, whoever laid it, whose CENTER lies within
   * its blast radius in the same tick, cascading breadth-first with a visited
   * set (bounded — each mine detonates at most once; deletion makes re-entry
   * impossible); fouling and captive mines neither propagate nor receive.
   *
   * CONSUME-FIRST (Story 2.8 review, P6): the mine is deleted from the store
   * BEFORE its blast resolves, and every path into a detonation re-checks
   * existence via that delete. The `visited` set alone was not enough — two
   * mines within each other's blast can both trip in the SAME tick, so the
   * trigger loop (and the landing test's snapshot) hands us a mine an
   * earlier cascade already consumed; without the re-check it detonated twice
   * (two booms, double damage) from one trip.
   */
  private detonateMine(mine: MineState, hulls: readonly Target[], trippedBy?: string): void {
    const queue: MineState[] = [mine];
    const visited = new Set<string>([mine.id]);
    let hit = trippedBy;
    while (queue.length > 0) {
      const m = queue.shift()!;
      // Consume-first re-check: a mine an earlier cascade already detonated is
      // gone from the store and must never detonate a second time.
      if (!this.consumeMine(m.id)) continue;
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

  /**
   * TAKE ONE MINE OFF THE WATER. The single deletion path (detonation, captive
   * launch, a captive destroyed by gunfire), so the collector's generation bumps wherever a mine leaves: a
   * later shell of the same tick can then never be consumed by a mine an
   * earlier detonation already removed. Returns false when it was already gone
   * — the consume-first re-check every detonation path relies on.
   */
  private consumeMine(id: string): boolean {
    if (!this.mines.delete(id)) return false;
    this.targetsGen += 1;
    return true;
  }

  /**
   * ONE MINE'S EFFECTIVE NUMBERS, BY THE MINE'S OWN KIND (Story 8.13): the
   * owner's row for that kind, or that kind's CONFIG bases when the owner has
   * VACATED — an orphan keeps no dead build's TIER, but it is still the kind
   * it was laid as, so a vacated layer's FOULING mine still fouls at the base
   * factor. (The pre-8.13 "an orphan never fouls" pin existed only because
   * fouling was a CARD the orphan could no longer be holding; the kind is now
   * the mine's own property.)
   *
   * The four fields are uniform across the kinds because the ROW is: a naval
   * and a captive row carry `slowFactor` 1 (the inert identity, sim/stats.ts)
   * and everything but the captive carries `homingTurnRate` 0.
   */
  private mineBlastParams(ownerId: string, kind: MineKind): MineBlastParams {
    const row = this.ships.get(ownerId)?.stats.equipment[MINE_ROW_ID[kind]];
    if (row === undefined) return CONFIG_MINE_BLAST[kind];
    return {
      damage: row.damage,
      blastRadius: row.blastRadius,
      slowFactor: row.slowFactor,
      homingTurnRate: row.homingTurnRate,
    };
  }

  /** One mine's blast damage + prop-fouling debuff (owner-stats-driven with
   *  the vacated-owner CONFIG fallback). Returns the blast radius used.
   *  Story 4.3 (amendment 18): a detonation that RESOLVES ≥1 victim sends one
   *  self-private `hc` to the mine's OWNER at the MINE's position — a Mine
   *  Layer learning remotely that a trap sprung is the intended feature.
   *  Victim RESOLUTION, not dmg emission (the ready-room rule); a victimless
   *  detonation sends NOTHING (mines have no fall-of-shot — amendment 16). */
  private blastMine(m: MineState, hulls: readonly Target[]): number {
    const { resolved, blastRadius } = this.applyMineBlast(m, m.ownerId, m.kind, hulls);
    if (resolved > 0) this.emitHitCall(m.ownerId, m.x, m.y);
    return blastRadius;
  }

  /**
   * ONE MINE-STYLE BLAST at `at`, on `ownerId`'s effective numbers FOR `kind`:
   * full damage to every non-owner hull silhouette inside the blast (owner
   * excluded — the universal AoE convention), plus the FOULING slow when the
   * kind is `fouling`. Returns how many hulls it RESOLVED and the radius used.
   *
   * Split out of blastMine (Story 7-5 wave 2) with the Hit Call left BEHIND on
   * purpose: the CAPTIVE MINE's torpedo detonates through here too (it passes
   * `'captive'`, so the burst is the captive row's fixed 32 u and slows
   * nothing — amendments 81/84d), and its `hc` is already emitted by
   * resolveShell's interception branch. Amendment 17's "exactly one `hc` per
   * shell resolution" is what forbids a second one here.
   */
  private applyMineBlast(
    at: Vec2,
    ownerId: string,
    kind: MineKind,
    hulls: readonly Target[],
  ): { resolved: number; blastRadius: number } {
    const { damage, blastRadius, slowFactor } = this.mineBlastParams(ownerId, kind);
    let resolved = 0;
    for (const t of mineBlastVictims({ x: at.x, y: at.y, ownerId }, hulls, blastRadius)) {
      const victimId = t.id;
      // A RADIO BEACON in the blast takes the mine's damage through its own
      // door (Story 10.8, R12) and counts as RESOLVED for the layer's `hc`;
      // it has no engines, so the fouling slow below never applies to it.
      if (t.kind === 'beacon') {
        if (this.damageBeacon(victimId, damage, 'mine', ownerId)) resolved += 1;
        continue;
      }
      const victim = t.kind === 'hull' ? this.ships.get(victimId) : undefined;
      // Per-victim re-check against the DELIBERATELY STALE `hulls` snapshot: a
      // hull sunk earlier this tick is still in it, and damage semantics live
      // in this re-check rather than in the snapshot (amendment 5).
      if (!victim || !isAfloat(victim.lifecycle)) continue;
      resolved += 1;
      this.hitShip(victim, damage, ownerId, 'mine');
      // FOULING (amendments 81, 88): a fouling blast's victim is slowed. The
      // clock is REFRESHED on every hit; the factor is KEEP-THE-STRONGEST —
      // while a slow is still running, a later fouling can only deepen it
      // (min of the active factor and the new one), never lift it (Eric
      // 2026-09-19: "keep the strongest slow"). Never multiplied. Once the
      // window has lapsed the new factor lands as-is. Gated with damage (no
      // fouling in the damage-suppressed ready room). Only the FOULING row
      // carries a factor under 1, so this is a no-op for every other kind.
      if (slowFactor < 1 && this.damageEnabled) {
        const active = this.now < victim.slowedUntil;
        victim.slowFactor = active ? Math.min(victim.slowFactor, slowFactor) : slowFactor;
        victim.slowedUntil = this.now + CONFIG.foulingMines.slowDurationMs;
      }
    }
    return { resolved, blastRadius };
  }

  /**
   * Queue the ARMED NAVAL mines whose centers lie within `blastRadius` of
   * detonating NAVAL mine `m` — WHOEVER LAID THEM (amendment 18: a minefield
   * is water, not property). The whole cascade resolves this tick through the
   * existing visited set.
   *
   * NAVAL ONLY, BOTH WAYS (Eric 2026-10-01, amendment 200: *"Naval Mines yes
   * chain. Fouling/Captive mines, no chain."*): a fouling or captive mine
   * never propagates a chain (the first read below) and never receives one
   * (the per-candidate read).
   *
   * This walk is the mine system propagating inside its OWN store, not an
   * ordnance step finding targets (see stepMines' note on placement rule 13).
   */
  private chainMines(m: MineState, blastRadius: number, visited: Set<string>, queue: MineState[]): void {
    const r2 = blastRadius * blastRadius;
    if (m.kind !== 'naval') return; // amendment 200 — only a naval mine propagates
    for (const other of this.mines.values()) {
      if (visited.has(other.id) || this.now < other.armedAt) continue;
      if (other.kind !== 'naval') continue; // amendment 200 — only a naval mine receives
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
   * single choke for shell, torpedo, and mine damage alike. (The `fromMine`
   * seat the PvE fleet's aggro read — amendment 36 — retired with the fleet at
   * Story 10.8.)
   */
  private hitShip(victim: ShipRecord, amount: number, byId: string, src: DamageSource): void {
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
    // THE GATE does the rest (Story 8.4 / AR47): hp, assist ledger, sink
    // check, `dmg` — applyDamage is the ONLY place a hull's hp is decremented.
    this.applyDamage(victim, amount, src, byId);
  }

  /**
   * THE DAMAGE GATE (Story 8.4, AR47 / D28 / placement rule 12). ONE door onto
   * a hull's hp: the ONLY `victim.hp -=` in the codebase, pinned by an ESLint
   * `no-restricted-syntax` rule over every other server file and by a grep test
   * that reads this file as text.
   *
   * THE FIXED INNER ORDER, and what each step is for:
   *   (a) NO FRIENDLY FIRE, STRUCTURALLY (Eric 2026-09-11). An attacker who is
   *       the victim is refused BEFORE anything — no hp, no ledger, no event —
   *       for EVERY DamageSource. This is not a restatement of the per-weapon
   *       owner-immunity checks upstream; it is the floor under them, so a new
   *       weapon cannot reintroduce self-damage by forgetting one. The ONE
   *       pinned exception to owner immunity lives upstream and is not about
   *       hulls at all: your own shells may detonate your own MINES.
   *   (b) The phase and sinking guards, exactly as the three old writers had
   *       them: a weapons-safe room loses no hp, and a hull inside the sinking
   *       window cannot be finished off (Story 5.2, amendment 12). The storm
   *       keeps its own `zoneStartT` gate at its caller.
   *   (b′) THE ARMOR MULTIPLY (Story 9.7; Story 9.9): every source but the
   *       storm is scaled by the victim's Armor, plus the HUNKER's bonus while
   *       its window is open, minus the attacker's POWER read live
   *       (armorDamage below; Story 10.3 renamed ARMOR PIERCING to POWER).
   *   (c) (THE SHIELDS — the SHIELD BLOCK and the SHIELD BUOY — were DELETED
   *       by Story 10.5, epic-10 amendment 11; nothing absorbs a blow now.)
   *   (d) The overkill clamp, the ONE hp write, and the COMBAT CLOCK stamp
   *       (amendment 47 — one hook for every damage source, storm included). `dealt` is read BEFORE the
   *       write (Eric 2026-08-22: *"if i do 50 damage to someone with 1 HP
   *       left, i get 1 damage worth of XP"*), and the write subtracts `dealt`
   *       rather than the nominal amount, so hp floors at 0 instead of dipping
   *       negative for the instant before sinkShip zeroes it. Nothing reads hp
   *       in between, so this is parity, not a behaviour change.
   *   (e) THE ASSIST LEDGER. A `src` of 'storm' skips it — that is what makes
   *       "the storm never refreshes an attacker's counter" structural rather
   *       than a restated rule.
   *   (f)/(g) The per-source report and the sink check (reportDamage below):
   *       today's emitted order per source, byte-identical.
   */
  private applyDamage(victim: ShipRecord, amount: number, src: DamageSource, byId: string | undefined): void {
    if (byId !== undefined && byId === victim.id) return; // (a) NO FRIENDLY FIRE, every source
    if (!this.damageEnabled) return; // (b) weapons-safe phases
    if (isSinking(victim.lifecycle)) return; // (b) a sinking hull cannot be finished off
    const net = this.armorDamage(victim, amount, src, byId); // (b′) ARMOR (+ the HUNKER's bonus − the attacker's POWER) (Stories 9.7 / 9.9 / 10.3)
    const dealt = Math.max(0, Math.min(net, victim.hp)); // (d) overkill clamp, read BEFORE the write
    victim.hp -= dealt; // (d) THE ONE HULL-HP DECREMENT IN THE GAME
    // (d) THE COMBAT CLOCK (amendment 47): every source that actually removed
    // hp — shell, torpedo, mine, ram / land contact, burn tick, STORM bite —
    // restamps the hull's combat clock, because every one of them passes
    // through here; the passive regen (Story 10.5, R8) reads it in
    // tickRepairs. A blow that removed nothing (`dealt` 0) does NOT count
    // (epic-9 amendment 92); dealing damage never counts at all.
    if (dealt > 0) victim.lastDamagedAt = this.now;
    World.noteDamageTaken(victim, src, dealt); // (d′) Story 9.5's server-only readouts
    if (src !== 'storm' && byId !== undefined) this.creditDamage(byId, victim.id, net, dealt); // (e)
    this.reportDamage(victim, net, src, byId); // (f)+(g)
  }

  /** (d′) THE HARNESS STAMPS (Story 9.5): what last took hp, and the hp taken
   *  from contact — the strike ('contact') and the bleed ('grind') — split by
   *  the blow's own kind (`lastContactWasLand`, stamped by dealContact /
   *  bleedContact): another hull or a wreck, or the coast. Read by
   *  server/scripts/batchsim only; never on the wire. Not a guard and not a
   *  branch on hp — the gate's order above is unchanged. */
  private static noteDamageTaken(victim: ShipRecord, src: DamageSource, dealt: number): void {
    if (dealt > 0) victim.lastDamageSrc = src;
    if (src !== 'contact' && src !== 'grind') return;
    if (victim.lastContactWasLand) victim.landDamageTaken += dealt;
    else victim.contactDamageTaken += dealt;
  }

  /**
   * (b′) THE ARMOR MULTIPLY (Story 9.7, Eric rulings 2026-10-13, epic-9
   * amendments 86–88; rescaled and given its answer by Story 9.9, epic-9
   * amendments 144–147 / 156; the HUNKER's fraction / storm rules carried
   * over from epic-8 amendments 100–102). EVERY source but the STORM is
   * multiplied by `damageMultiplierFor(E)` — the ONE curve, owned by
   * shared/src/sim/stats.ts, the EXACT fraction, never a rounded one (epic-9
   * amendment 120(a): a rounded 0.833 floored an MG shell 6 one point low).
   *
   * EFFECTIVE ARMOR (amendment 146; Story 10.3 ruling 11): E = victim ARMOR +
   * the HUNKER's bonus while open − the ATTACKER's POWER. Both are INDICES
   * since Story 10.3 (100 on every scaffold hull, +20 a card), so an average
   * pair nets E = 0 → ×1 exactly as 9.9's 0 − 0 did. The curve has two branches:
   * E ≥ 0 → K / (K + E), E < 0 → 2 − K / (K − E) = (K − 2E) / (K − E), equal
   * to 1 with matching slope at 0 and bounded strictly under ×2 (a floor at
   * E = 0 and a raw K / (K + E) below zero were both rejected). The scale
   * (amendment 144, was K = 5 / +1 per card / cut +5): K = CONFIG.armor.k =
   * 100; the ARMOR ladder's `stats.armor` is +20 per card (Tier V = +100 over
   * the attacker's POWER → ×0.5, 9.7's multipliers reproduced exactly); the HUNKER (the Battleship's
   * Shift, Story 8.15; was DAMAGE CUT) adds `stats.equipment.hunker.armorBonus`
   * = +100 while `now < hunkerUntil`, ADDITIVELY on the Armor value, never as
   * a second multiply (amendment 88) — so at Tier 0 under HUNKER against POWER
   * 100, E 100 → ×0.5.
   *
   * THE ATTACKER IS READ LIVE AT IMPACT (amendment 156): POWER is the
   * CURRENT `stats.power` (Story 9.9's `armorPiercing`, renamed by Story 10.3,
   * Eric 2026-11-04, epic-10 amendment 8) of the `byId` record, never stamped on the
   * ordnance at launch — a card bought while a torpedo swims counts; a SUNK
   * owner's record persists in `this.ships` until the client leaves, so their
   * mine / torpedo / burn still carries it. A MISSING ATTACKER — an owner who
   * LEFT (removeShip), the coast and a wreck (`byId` undefined) — reads the
   * AVERAGE POWER, `CONFIG.index.base` (Story 10.3 reading, Task 1: today's
   * "reads piercing 0" becomes "reads the average POWER", so those blows still
   * net E = victim ARMOR − base and a coast strike on a base hull is ×1; Eric
   * may veto for POWER 0). Every source but the storm carries it (amendment
   * 147): shells, bursts, torpedoes, mines, the ram 'contact' strike, its
   * 'grind' bleed and the 'burn' tick (Eric: "apply it to all damage"). A
   * SINKING hull's ram and grind read the missing
   * attacker's base POWER (its `attackerId` is undefined per amendment 82)
   * while its torpedo, mine and burn still carry its own POWER (its record
   * persists) — both follow the rulings; do not 'fix' one side.
   *
   * A WHOLE blow rounds DOWN to a whole number (amendment 102 — damage stays
   * whole per amendment 39) BUT NEVER BELOW 1 (epic-9 amendment 119, Eric
   * 2026-10-13 at the 9.7 review gate): a blow that was at least 1 hp lands
   * at least 1. A slow ram bump is 1–2 hp; at any Armor that floored to 0
   * and still played the hit cue — Eric chose the floor-of-one over a
   * silent zero. A blow already 0 stays 0 (floorBlow's `amount > 0` guard).
   * A PHOSPHOR burn tick and a contact BLEED tick ('grind', Story 9.5),
   * fractional by construction, keep their exact product — never floored,
   * never raised to 1. The STORM is exempt (amendment 101): its bites land in
   * full, so the sudden-death ceiling and NFR6's arithmetic are untouched.
   * `creditDamage` and the `dmg` report both read the POST-multiply
   * amount (amendment 113): the attacker's tally is what actually
   * landed. `stats.damageMultiplier` is the victim-only published number
   * (amendment 120(e)) and is never composed in here — the gate always calls
   * the curve with the full E.
   */
  private armorDamage(victim: ShipRecord, amount: number, src: DamageSource, byId: string | undefined): number {
    if (src === 'storm') return amount;
    const bonus = this.now < victim.hunkerUntil ? victim.stats.equipment.hunker.armorBonus : 0;
    return this.armorGate(victim.stats.armor + bonus, amount, src, byId);
  }

  /** THE MULTIPLY ITSELF, on a plain ARMOR number (Story 10.8 extraction —
   *  armorDamage's own arithmetic, unchanged): `amount` × the one curve at
   *  E = `armor` − the attacker's live POWER, a whole blow floored with the
   *  floor of one, a 'burn' / 'grind' fraction kept exact. A hull reaches it
   *  with its ARMOR (+ HUNKER); a RADIO BEACON with `CONFIG.beacons.armor`
   *  (R8: "exactly as a ship with ARMOR 100"). */
  private armorGate(armor: number, amount: number, src: DamageSource, byId: string | undefined): number {
    const scaled = amount * damageMultiplierFor(armor - this.powerOf(byId));
    return src === 'burn' || src === 'grind' ? scaled : World.floorBlow(amount, scaled);
  }

  /**
   * THE BEACON DOOR (Story 10.8, Eric 2026-11-06, R5 / R6 / R8 / R12 / R13) —
   * the ONE way a RADIO BEACON loses hp, as applyDamage is a hull's: every
   * weapon path that finds a `beacon` target (interception, burst, mine
   * blast, the phosphor burn) and the ram reach it and nothing else does.
   * Returns true iff `id` names a beacon that is AFLOAT right now — i.e. the
   * blow RESOLVED on it (the hit call's arithmetic) — whether or not hp moved.
   *
   *   - NOT AFLOAT, NOTHING (R6): charted, sinking or gone, the call is a
   *     no-op and answers false.
   *   - THE SAME ARMOR GATE a ship takes (R8), at ARMOR
   *     `CONFIG.beacons.armor` against the attacker's LIVE POWER (a missing
   *     attacker reads the average), same flooring.
   *   - THE SHOOTER'S DAMAGE TOTAL COUNTS IT (R12) — the nominal post-armor
   *     blow, exactly the figure a hull hit adds — and the beacon's OWN
   *     ledger notes the clamped part for the kill split. No `dmg` row (no
   *     victim client), no entry on any hull's assist ledger, no aggro.
   *   - AT 0 HP IT SINKS EARLY (sinkBeacon).
   * Weapons-safe phases lose no hp, as on a hull.
   */
  damageBeacon(id: string, amount: number, src: DamageSource, byId: string | undefined): boolean {
    const beacon = this.beacons.get(id);
    if (beacon === undefined || !this.beacons.hittable(beacon, this.now)) return false;
    if (!this.damageEnabled || !World.isBlow(amount)) return true;
    const net = this.armorGate(CONFIG.beacons.armor, amount, src, byId);
    const dealt = Math.max(0, Math.min(net, beacon.hp)); // the overkill clamp, read before the write
    beacon.hp -= dealt; // THE ONE BEACON-HP DECREMENT IN THE GAME
    if (byId !== undefined) this.creditBeaconDamage(beacon, byId, net, dealt);
    if (beacon.hp <= 0) this.sinkBeacon(beacon, byId);
    return true;
  }

  /** The credit half of the beacon door: the attacker's results-screen total
   *  takes the nominal blow (creditDamage's figure), the beacon's ledger the
   *  clamped one (recordAssist's rule, on the beacon's own map). */
  private creditBeaconDamage(beacon: BeaconRecord, byId: string, net: number, dealt: number): void {
    const attacker = this.ships.get(byId);
    if (attacker) attacker.damageDealt += net;
    if (CONFIG.xp.assistWindowMs > 0 && dealt > 0) this.noteAssist(beacon.damageFrom, byId, dealt);
  }

  /**
   * A RADIO BEACON DESTROYED AFLOAT (R6, R9, R13): its one-minute sink starts
   * NOW — the early sink time is stamped (public: the room mirrors it onto
   * the schema), the collector's generation bumps so later shells this tick
   * pass through it, and `CONFIG.beacons.killLevels` is paid by THE KILL
   * SPLIT LAW (payKillPot) over the beacon's own ledger: the guaranteed share
   * to the hull that landed the last blow, the rest by damage among everyone
   * with a live counter on it. Nothing else a ship kill does happens: no
   * `sunk` row, no kill-feed line, no kill count, no bounty, no `pveKills`.
   */
  private sinkBeacon(beacon: BeaconRecord, byId: string | undefined): void {
    this.beacons.sink(beacon, this.now);
    this.targetsGen += 1;
    const killer = byId !== undefined ? this.ships.get(byId) : undefined;
    this.payKillPot(CONFIG.beacons.killLevels, beacon.damageFrom, beacon.id, killer);
    beacon.damageFrom.clear(); // the ledger is spent with the payout
  }

  /** The attacker's POWER (Story 9.9's ARMOR PIERCING; `piercingOf` reading
   *  `stats.armorPiercing` until Story 10.3, Eric 2026-11-04, epic-10
   *  amendment 7), read LIVE at impact (Story 9.9, epic-9 amendment 156): the
   *  current stats of the `byId` record. No attacker (the coast, a wreck) and
   *  an attacker who left the room both read the AVERAGE POWER,
   *  `CONFIG.index.base` (Story 10.3 reading — E = victim ARMOR − base, so a
   *  base hull takes them at ×1); a sunk attacker's record persists, so it
   *  still reads its own power. */
  private powerOf(byId: string | undefined): number {
    if (byId === undefined) return CONFIG.index.base;
    return this.ships.get(byId)?.stats.power ?? CONFIG.index.base;
  }

  /** A whole blow after the Armor multiply: floored to a whole number, but a
   *  blow that was > 0 lands at least 1 (epic-9 amendment 119, Eric
   *  2026-10-13 at the 9.7 review gate). A 0 blow stays 0. Pure. */
  private static floorBlow(amount: number, scaled: number): number {
    return amount > 0 ? Math.max(1, Math.floor(scaled)) : 0;
  }

  /** (f)+(g) THE PER-SOURCE REPORT, byte-identical to what the three old
   *  writers emitted:
   *    - 'burn' banks into its (owner, victim) DoT window bucket and flushes
   *      before a lethal bite's sink, so the victim's last `dmg` still lands
   *      ahead of its `sunk` (applyZoneEffects' wire-cadence rule); 'grind'
   *      (the contact bleed, Story 9.5) banks the same way into its
   *      (attacker | land, victim) bucket — the coast's window credits and
   *      kills with no attacker.
   *    - 'storm' emits NOTHING (a 20Hz drowning event stream is wire noise).
   *    - every other source pushes the immediate victim-private `dmg` FIRST
   *      and then takes the sink edge — the order hitShip has always emitted.
   *      `amount` on the event is the NOMINAL blow (post-armor), not `dealt`:
   *      that is the shipped wire number and the results-screen tally's unit. */
  private reportDamage(victim: ShipRecord, amount: number, src: DamageSource, byId: string | undefined): void {
    if (src === 'burn') {
      this.bankDot(victim, dotKey(byId!, victim.id), byId, amount);
      return;
    }
    if (src === 'grind') {
      this.bankDot(victim, grindKey(byId, victim.id), byId, amount);
      return;
    }
    if (src !== 'storm') this.pending.push({ k: 'dmg', id: victim.id, amount, hp: Math.max(0, victim.hp) });
    if (victim.hp <= 0) this.sinkShip(victim.id, byId);
  }

  /** The DoT half of reportDamage: accumulate this pair's window bucket
   *  (`key` — a burn's dotKey or a bleed's grindKey), flush it ahead of a
   *  lethal bite's sink credited to `killer` (undefined for the coast), and
   *  otherwise emit once the window has run (see applyZoneEffects for why the
   *  DoT `dmg` event is windowed while its hp application stays per-tick). */
  private bankDot(victim: ShipRecord, key: string, killer: string | undefined, amount: number): void {
    const bucket = this.dotBuckets.get(key);
    if (bucket === undefined) this.dotBuckets.set(key, { victimId: victim.id, amount, since: this.now });
    else bucket.amount += amount;
    if (victim.hp <= 0) {
      this.flushDot(key);
      this.sinkShip(victim.id, killer);
      return;
    }
    const open = this.dotBuckets.get(key)!;
    if (this.now - open.since >= DOT_EVENT_WINDOW_MS) this.flushDot(key);
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
   * An attacker we cannot find IS ledgered (a departed player's claim survives, exactly as a dead killer's
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
    this.noteAssist(victim.damageFrom, byId, dealt);
  }

  /** The rolling counter itself, on any ledger (Story 10.8 extraction —
   *  recordAssist's body, unchanged): a hull's `damageFrom`, or a radio
   *  beacon's. The caller has already checked the window is on and
   *  `dealt > 0`. */
  private noteAssist(ledger: Map<string, AssistTally>, byId: string, dealt: number): void {
    const prev = ledger.get(byId);
    if (prev === undefined || this.now - prev.at > CONFIG.xp.assistWindowMs) {
      ledger.set(byId, { amount: dealt, at: this.now, buckets: [{ at: this.now, amount: dealt }] });
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
   * count.
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

  /**
   * THE TERMINAL BOOM OF ONE BALLISTIC — the ONE constructor of a shell's or
   * torpedo's own boom subject, so no ending can forget the owner arm. A GUN
   * SHELL's (`kind === 'shell'`) carries the server-internal owner tag `own`
   * (signals.ts BoomSubject — Eric 2026-11-13, epic-11 amendment <AMENDMENT>:
   * the firer is always shown how his own shell ended, so his screen ends the
   * track there instead of flying it on to full reach). A TORPEDO's never
   * does. `hit` names the struck SHIP when there is one to name; the boom
   * row still strips it per observer (the owner included) by class reach.
   */
  private ballisticBoom(shell: ShellState, at: { x: number; y: number }, hit?: string): BoomSubject {
    const boom: BoomSubject =
      hit === undefined ? { k: 'boom', id: shell.id, x: at.x, y: at.y } : { k: 'boom', id: shell.id, hit, x: at.x, y: at.y };
    if (shell.kind === 'shell') boom.own = shell.ownerId;
    return boom;
  }

  /**
   * The boom of a ballistic that stopped without striking a hull. A TORPEDO
   * that merely ran out of run (`expired`) is tagged with its owner (`run`,
   * server-internal — signals.ts BoomSubject) so the boom row gates it at the
   * torpedo eye reach instead of the splash reach (Story 11.2 review gate,
   * F4): nothing exploded. Everything else — an island stop, a shell's fall —
   * is the plain boom (a gun shell's with its owner arm, `ballisticBoom`).
   */
  private missBoom(shell: ShellState, outcome: { kind: string; x: number; y: number }): BoomSubject {
    const boom = this.ballisticBoom(shell, outcome);
    if (shell.kind === 'torp' && outcome.kind === 'expired') boom.run = shell.ownerId;
    return boom;
  }

  /** Turn a spent ballistic's outcome into its events, per the projectile's
   *  OWN hit rule (Story 1.4 seam): `burst` detonates at the target point;
   *  `hitShip` is an early interception OUTSIDE the blast — the interceptor
   *  takes the smaller contactDamage (torpedoes set contactDamage = damage, so
   *  their behavior is unchanged; a damageless star shell deals 0 and still
   *  lights its zone at the stop point — amendment 39); everything else is a
   *  plain splash boom. */
  private resolveShell(shell: ShellState, outcome: ShellOutcome, hulls: readonly Target[]): void {
    if (outcome.kind === 'travel') return;
    if (outcome.kind === 'burst') {
      this.resolveBurst(shell, outcome, hulls);
      return;
    }
    if (outcome.kind !== 'hitShip') {
      this.pending.push(this.missBoom(shell, outcome));
      // A DIRECT shell (the machine gun's) that ARRIVED without striking a
      // hull LANDS here: the landing test runs at its final point (amendment
      // 200 — a no-op for any mask without `mine`). An island stop is not a
      // landing: the shell never reached the point the shooter clicked. The
      // `direct` guard keeps this the DIRECT shell's path alone: a burst-family
      // shell lands only through `resolveBurst` (its `expired` is the map-edge
      // crossing, unreachable for a clamped gun target but excluded by name).
      if (outcome.kind === 'expired' && shell.direct === true) this.landOnMines(shell, outcome, hulls);
      // hitIsland / expired: a MISS — fall of shot to the shooter (Story 4.3;
      // gun family only — the guard lives in emitSplash).
      this.emitSplash(shell, outcome.x, outcome.y);
      return;
    }
    // WHAT THE SHELL TOUCHED IS DECIDED FIRST (Story 8.4 review, P2): the
    // kind comes off the very target list this shell was resolved against, so
    // every branch below — and every branch of resolveInterception — dispatches
    // on the KIND rather than on which store happens to hold the id.
    const kind = World.targetKindOf(hulls, outcome.victimId);
    // A RADIO BEACON'S ID NEVER LEAVES THE SERVER (Story 10.8): the boom of a
    // shell that stopped on one is the plain hit-less boom — `hit` names a
    // SHIP, and the boom row forwards it raw to a spectator.
    this.pending.push(this.ballisticBoom(shell, outcome, kind === 'beacon' ? undefined : outcome.victimId));
    // A MINE CAN NEVER BE THE VICTIM HERE (amendment 20, Eric 2026-09-16):
    // the sweep list stepShell resolved against had no `mine` in it at all, so
    // there is no mine case to special-case and no mine-consumed shell to emit
    // (or withhold) a mark for. A shell that flies over a mine is, to every
    // channel the shooter has, a shell that flew over open water. Do NOT
    // reintroduce a mine branch below: the reason is the same class the
    // star-shell comment in resolveBurst names — a self-private mark near an
    // UNSEEN mine would let a captain walk shells across the water and read
    // the marks to map a minefield he was never shown.
    //
    // An early interception = a victim RESOLVED (Story 4.3, epic-4 amendments
    // 17/18): one Hit Call at the impact point, all ordnance — deliberately
    // NOT derived from dmg emission, so the weapons-safe ready room still calls
    // hits (hitShip early-returns on !damageEnabled).
    this.emitHitCall(shell.ownerId, outcome.x, outcome.y);
    this.resolveInterception(shell, outcome, hulls, kind);
  }

  /** The KIND of the target `id` names, read off the list the shell was
   *  resolved against (Story 8.4 review, P2). Store membership is NOT a kind
   *  test: ids live in different namespaces but nothing enforces that, and a
   *  hull whose id collided with a live mine's used to detonate the mine
   *  instead of taking its hit. `undefined` means the collision named something
   *  no longer in the list — a caller-side defence, never expected. */
  private static targetKindOf(targets: readonly Target[], id: string): TargetKind | undefined {
    for (const t of targets) if (t.id === id) return t.kind;
    return undefined;
  }

  /**
   * What an early interception DOES, once its boom and its Hit Call are out —
   * split from resolveShell for the complexity bound; the order of the branches
   * below is unchanged. Reached only for outcome kind 'hitShip'. `kind` is the
   * victim's TARGET KIND, decided by the caller off the resolved target list
   * (Story 8.4 review, P2) — never `mine`, which is not a collision subject for
   * anything in flight (amendment 20).
   */
  private resolveInterception(
    shell: ShellState,
    outcome: { victimId: string; x: number; y: number },
    hulls: readonly Target[],
    kind: TargetKind | undefined,
  ): void {
    // A flare still lights where it stopped (Story 2.8): an intercepted star
    // shell spawns its zone at the interception point. Story 8.17 gives the
    // same posture to its two siblings — an intercepted PHOSPHOR shell burns
    // where it stopped, and an intercepted FLASH shell flashes there
    // (amendments 131 / 135(d)). The interceptor then takes the shell's
    // contactDamage below like any other early hit (0 for the flash).
    this.applyStopTags(shell, outcome);
    // ...and a FLASH round flashes VISIBLY there too (gate fix F1): its burst
    // (tagged `f`) rides beside the boom at the stop point.
    this.emitInterceptionBurst(shell, outcome);
    // THE CAPTIVE MINE'S TORPEDO (Story 7-5 wave 2, R2.12/R2.14) — the game's
    // one CONTACT-BLAST projectile: it detonates AT ITS IMPACT POINT for the
    // layer's CAPTIVE MINES damage over that row's FIXED 32 u burst, instead of
    // dealing plain contact damage to the hull it touched. It slows NOTHING —
    // fouling is its own line now (amendment 81) and the captive row's
    // `slowFactor` is the inert 1. The struck hull is inside its own
    // blast by construction, so there is no double-dip to guard: this branch
    // RETURNS rather than falling through to the contact hit below. The one Hit
    // Call for this resolution was already emitted above (EPIC-4 amendment 17,
    // the Hit Call — not epic-8's, which amendment 20 retired), which
    // is why applyMineBlast deliberately does not emit one.
    if (contactBlastRadius(shell) > 0) {
      this.applyMineBlast(outcome, shell.ownerId, 'captive', hulls);
      return;
    }
    if (shell.contactDamage <= 0) return; // zero-damage interception: boom only
    const amount = interceptionAmount(shell);
    // A SETTLED 0 is NO blow, exactly as at the burst site (burstDamage): a
    // direct blow settled to nothing (a non-positive raw damage) must not fire
    // the aggro seam or emit a 0 `dmg` (Story 9.12 review gate).
    if (amount <= 0) return;
    // Selected by KIND, not by "the ships map had no such id" (P2): a hull
    // takes contact damage through the gate, a RADIO BEACON through its own
    // door (Story 10.8, R8 — the same amount, the same source); nothing else
    // does (the decoy branch left with Story 10.5).
    const src: DamageSource = shell.kind === 'torp' ? 'torpedo' : 'shell';
    if (kind === 'beacon') {
      this.damageBeacon(outcome.victimId, amount, src, shell.ownerId);
      return;
    }
    if (kind !== 'hull') return;
    const victim = this.ships.get(outcome.victimId);
    if (!victim || !isAfloat(victim.lifecycle)) return;
    // EVERY SHELL THAT CONNECTS DEALS DAMAGE (Eric ruling 2026-08-05): a later
    // shell of the same multi-barrel click gets no discount here — it is its
    // own shell, and it connected. The one-hit-kill law governs a single SHELL,
    // not a single click (the same-click salvo ledger is deleted).
    this.hitShip(victim, amount, shell.ownerId, src);
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
  private resolveBurst(shell: ShellState, at: Vec2, hulls: readonly Target[]): void {
    // Victims first (pure — burstVictims reads only its arguments), so a
    // POINT landing's boom can name the hull it struck before any `dmg`.
    const victims = burstVictims(at, shell.burstRadius, hulls, shell.ownerId);
    this.announceLanding(shell, at, victims);
    // A star shell's burst also lights its zone (Story 1.7), a PHOSPHOR
    // shell's spawns its burning zone (Story 8.17) and a FOULING shell's
    // spawns its foul zone (Story 9.4): the three server-internal tags ride
    // only their own rows, so every other burster is untouched. The
    // burst-flash wire event above is the SAME 'burst' row for all of them —
    // no new GameEvent kind; the zones themselves sync contact-like as
    // litZones / burnZones / foulZones.
    this.applyStopTags(shell, at);
    // A zero-damage burst (the FLASH shell) resolves no victims at all — no
    // 0-hp dmg-event noise, structurally — and so emits `sp` (135(d)).
    //
    // ONE CALL TO THE COLLECTOR'S OWN MEMBERSHIP RULE covers every kind the
    // shell's mask admitted (Story 8.4): hulls take damage, fish
    // are removed. A MINE IS NEVER A BURST VICTIM (amendment 200 — shared
    // burstVictims skips the kind); the LANDING TEST at the burst point runs
    // after the hit call, where the old burst detonation sat.
    let resolved = 0; // hulls the burst RESOLVED (Story 4.3 — counted ahead of
    // the damage-suppression phase guard inside hitShip, so the Hit Call keys
    // off resolution, not dmg: the weapons-safe ready room still calls hits).
    if (shell.damage > 0) {
      for (const t of victims) {
        // Fish are removed below, after the hit call — never a damage victim.
        if (t.kind === 'ordnance') continue;
        resolved += this.burstDamage(shell, t, at);
      }
      // AMENDMENT 19 (Eric 2026-09-15, resolving `deferred-work.md:590`): a
      // hull an EARLIER shell of this same click already sank still counts as a
      // GEOMETRIC victim for the mark — `hc`, not `sp` — while taking no damage
      // and paying no assist. The zero-damage FLASH shell is excluded by the
      // `damage > 0` gate it sits inside: a flash must never answer "is a hull
      // within burstRadius of this point?" (it reveals nothing, 135(d)).
      resolved += this.wrecksInBurst(at, shell.burstRadius, shell.ownerId);
    }
    // Story 4.3: exactly one of hc/sp per shell resolution — a burst that
    // resolved ≥1 hull is a Hit Call at the burst point; one that resolved
    // none is fall of shot.
    //
    // THE STAR SHELL NOW EMITS `hc` LIKE ANY DAMAGING BURST (Story 8.17, epic-8
    // amendment 135(a) — SUPERSEDING the amendment-39 era rule that a
    // damageless flare over a hull must splash). Until 8.17 the flare dealt
    // nothing, so a Hit Call there would have been a lie AND an unsanctioned
    // detection channel: a flare lobbed into fog answering "is a hull within
    // burstRadius of this point?" bypassed the lit zone + LOS. That objection
    // dissolves now, for two reasons that must BOTH hold for the `hc` to be
    // sanctioned: (1) the flare CONNECTS — every hull inside the circle took
    // the tier's damage through the ordinary gate, so the mark is true; and
    // (2) it adds NO channel the light does not already open, with ONE
    // recorded exception. The burst keeps the gun's OUTLINE rule (a hull hit
    // when its outline touches the circle) while the reveal tests the hull's
    // CENTRE, so a hull whose outline touches the rim can be hit and hit-called
    // WITHOUT being revealed by the light. That rim disclosure is ACCEPTED, not
    // covered by the reveal (Eric, review gate 2026-09-29, amendment 136).
    // Every other hull in the circle is revealed to the firer anyway ("lit from
    // above", no LOS term), so the `hc` says nothing new about them.
    // A PHOSPHOR burst over fog does the same for its 100 u+ zone — accepted as the flak precedent (a
    // 50 u blast already does this), amendment 135(b).
    if (resolved > 0) this.emitHitCall(shell.ownerId, at.x, at.y);
    else this.emitSplash(shell, at.x, at.y);
    // THE LANDING TEST (amendment 200; Story 9.12, epic-9 amendment 184(i)):
    // a deck-gun shell's burst point IS where it landed, so every mine whose
    // 10 u marker the blast touches takes the shell's damage. Run
    // AFTER the hc/sp decision on purpose: a mine is never counted in
    // `resolved` (the hit call is about the hulls the shell connected with —
    // a pop with no hull victim keeps `sp`), and a sprung trap announces
    // itself to its own layer through blastMine's `hc`.
    this.landOnMines(shell, at, hulls);
    // The burst REMOVES every ENEMY TORPEDO whose centre it covers (Story 8.15,
    // amendment 105 — the flak gun's side effect; only its mask names
    // `ordnance`): the fish is simply taken off the water — no boom, no
    // damage, no `hc` (a fish is not a hull, and the shooter's mark keys off
    // hulls alone), and the OWNER'S OWN fish are never victims.
    for (const t of victims) {
      if (t.kind === 'ordnance') this.removeBurstOrdnance(t.id, shell.ownerId, at, shell.burstRadius);
    }
  }

  /**
   * A BURST TAKES ONE ENEMY FISH OFF THE WATER (Story 8.15, amendment 105).
   * Reached only from resolveBurst, for an `ordnance` target burstVictims
   * found within the blast. OWN-FISH IMMUNITY lives HERE, where the shooter is
   * known: the collector's list is memoized per mask across every shooter in
   * the tick, so it cannot exclude per owner. Removal is immediate — the fish
   * is gone from `shells`, every observer's seen-memory and the homing
   * track store, its water detaches into the orphan store (amendment 200) —
   * and the collector generation bumps so no later burst this tick finds a
   * ghost. Deleting from `shells` while stepShells iterates it is
   * well-defined (a Map skips entries deleted before their visit): a fish
   * LATER in the Map than the bursting shell never steps again, so it cannot
   * land a hit after it has been shot down; a fish EARLIER in the Map (launched
   * before the flak shell) has already taken this tick's step.
   *
   * THE LIVE-POINT RE-CHECK. The `ordnance` list is memoized at the first
   * flak-mask call of the tick, so a fish that stepped between that call and
   * this burst is listed at its PRE-step point. Removal therefore re-measures
   * the fish's live centre against the blast (the same inclusive `≤ radius`
   * burstVictims applies to a point): a fish that ran out of the blast this
   * tick survives. (One that ran INTO it is still spared — it was not in the
   * list — which is deterministic and acceptable.) The `shells.get` re-check
   * is the consume-first discipline (two bursts covering one fish).
   */
  private removeBurstOrdnance(id: string, shooterId: string, at: Vec2, burstRadius: number): void {
    const fish = this.shells.get(id);
    if (fish === undefined || fish.ownerId === shooterId) return; // gone, or the shooter's own
    if (Math.hypot(fish.x - at.x, fish.y - at.y) > burstRadius) return; // stepped out of the blast
    this.shells.delete(id);
    this.forgetBallistic(id);
    this.orphanTorpWake(id);
    this.targetsGen += 1;
  }

  /** One burst victim that is a hull. Returns 1 when it RESOLVED (Story
   *  4.3's hit-call arithmetic), 0 otherwise. The per-victim liveness re-check on a hull is defence against a directed
   *  caller — since Story 8.4 the collector's sink invalidation means a wreck
   *  is not in `hulls` at all. */
  private burstDamage(shell: ShellState, t: Target, at: Vec2): number {
    const amount = burstHitAmount(shell, t, at);
    // A 0-hp blow is NO blow (Story 9.8 review; Story 9.12 reading r3):
    // `settleBlow` answers 0 only for a non-positive raw blow — reachable
    // under `--tune flak.rimFactor=1` at the exact rim (resolveInterception
    // holds the same guard for a direct blow).
    // That must not fire the aggro seam, credit damage or emit a `dmg`, so
    // nothing below runs.
    if (amount <= 0) return 0;
    // A RADIO BEACON caught by the burst (Story 10.8, R8): the same settled
    // amount through its own door; it RESOLVED iff it was still afloat.
    if (t.kind === 'beacon') return this.damageBeacon(t.id, amount, landingSource(shell), shell.ownerId) ? 1 : 0;
    if (t.kind !== 'hull') return 0;
    const victim = this.ships.get(t.id);
    if (!victim || !isAfloat(victim.lifecycle)) return 0;
    this.hitShip(victim, amount, shell.ownerId, landingSource(shell));
    return 1;
  }

  /** AMENDMENT 19's geometric victims: hulls that sank THIS tick whose
   *  silhouette the burst covers. Counted for the `hc`/`sp` decision only —
   *  no damage, no assist, no event of their own. The owner's own wreck is
   *  excluded on the same owner-immunity rule every other path uses. */
  private wrecksInBurst(at: Vec2, radius: number, ownerId: string): number {
    let n = 0;
    for (const wreck of this.sunkThisTick) {
      if (wreck.id === ownerId) continue;
      if (pointPolygonDistance(at, wreck.poly) <= radius) n += 1;
    }
    return n;
  }

  /**
   * THE LANDING TEST (Eric 2026-10-01, amendments 200/201; re-cut by Eric
   * 2026-10-16, Story 9.12, epic-9 amendment 184(i) — the cursor clause of
   * amendment 202 and amendment 200's "a burst that merely covers a mine does
   * nothing" are RETIRED). A shell whose `hits` mask carries `mine` — exactly
   * the three deck guns — that LANDS at `at` uses its WHOLE BLAST against
   * mines: EVERY mine whose 10 u marker the blast touches (centre within
   * `shell.burstRadius + CONFIG.mine.hitRadiusU` of `at`) takes the shell's
   * `damage` (never contactDamage, and no flak rim term; flat with range since
   * Story 11.1 —
   * a mine is not a burst victim), any kind, armed or arming, any owner (the
   * shooter's own included — the standing friendly-fire exception). So a flak
   * burst clears a cluster, and a Tier I cannon click's two shells on one
   * mine land 8 + 8. `at` is the burst point for the cannon and flak and the
   * arrival point for a machine-gun shell (no blast — "within 10 u of where
   * it arrived"); a shell spent on a hull on the way never calls this.
   *
   * `targets` is the shell's own full-mask list (stepShells' `burstSet`), so
   * the collector stays the one place mines are enumerated; the `mines.get`
   * re-check is the consume-first discipline — a mine an earlier shell or a
   * chain already took this tick is gone, and a second application is a
   * no-op. Mine hp never leaves the server.
   */
  private landOnMines(shell: ShellState, at: Vec2, targets: readonly Target[]): void {
    if (!shell.hits.includes('mine')) return;
    const reach = shell.burstRadius + CONFIG.mine.hitRadiusU;
    const amount = settleBlow(shell.damage);
    for (const t of targets) {
      if (t.kind !== 'mine') continue;
      const mine = this.mines.get(t.id);
      if (mine === undefined) continue; // consume-first re-check, not a policy
      if (!onMine(mine, at, reach)) continue;
      if (this.damageMine(mine, amount)) this.popMine(mine);
    }
  }

  /** Spend `amount` of a mine's hp (amendment 200); true iff it is now at or
   *  below 0 and the caller pops it. A mine is not a ship: no gate, no XP, no
   *  `dmg` event — the one non-hull decrement, allowed only here by the
   *  damage-gate fence (damageGate.test pins it). */
  private damageMine(mine: MineState, amount: number): boolean {
    mine.hp -= amount;
    return mine.hp <= 0;
  }

  /**
   * A MINE SHOT TO 0 HP (amendment 200). A NAVAL or FOULING mine detonates
   * exactly as a tripped one does — boom (no `hit`), its own blast on its
   * OWNER's numbers at its own point, and (naval only) the chain. A CAPTIVE
   * mine is DESTROYED: taken off the water with the same sight-gated `boom`
   * so observers see it go (201(c)), but no `hit`, no blast and no fish — only
   * a TRIP launches a captive's torpedo.
   */
  private popMine(mine: MineState): void {
    if (mine.kind !== 'captive') {
      this.detonateMine(mine, this.hitTargets(MINE_BLAST_HITS));
      return;
    }
    if (!this.consumeMine(mine.id)) return;
    this.pending.push({ k: 'boom', id: mine.id, x: mine.x, y: mine.y });
  }

  /** THE one burst subject a shell emits (the burst point, or a FLASH
   *  round's interception stop point): the wire BurstEvent plus the internal
   *  `own` the burst row's owner arm reads. FLASH SHELLS tag (epic-10
   *  amendment 5): everyone who sees the detonation sees the disc — `f` rides,
   *  and the burst row widens its gate for a tagged subject ONLY to the hulls
   *  inside the flash radius (gate fix F2: the flashed victim sees it too). */
  private pushBurst(shell: ShellState, at: Vec2): void {
    const burst: BurstSubject = { k: 'burst', id: shell.id, x: at.x, y: at.y, own: shell.ownerId };
    // The FLASH disc's radius rides beside `f` (Story 10.5, R7): the launched
    // shell's stamped radius, so the client draws the tier's disc.
    if (shell.flash) {
      burst.f = true;
      burst.r = shell.flash.radius;
    }
    this.pending.push(burst);
  }

  /**
   * WHAT A LANDING LOOKS LIKE (the first event resolveBurst emits). A shell
   * with a blast (`burstRadius > 0`) bursts: the `burst` ring, unchanged. A
   * ZERO-RADIUS landing — the MAIN BATTERY's direct-hit shell (Eric
   * 2026-11-13, epic-11 amendment 8: "Only direct hits count") — has no blast
   * to draw, so it lands as an IMPACT: a `boom` at the landing point, naming
   * the hull whose silhouette holds the point (the first, in target order)
   * as `hit`, or none on a miss. The SECONDARIES' round lands the same way
   * (epic-11 amendment <AMENDMENT>). Like every gun shell's terminal boom it
   * carries the server-internal owner tag (`ballisticBoom`; it was the
   * main-battery-only `land` tag until then), which keeps the retired burst's
   * owner arm. A beacon struck this way is never named (its id never leaves
   * the server, Story 10.8).
   */
  private announceLanding(shell: ShellState, at: Vec2, victims: readonly Target[]): void {
    if (shell.burstRadius > 0) {
      this.pushBurst(shell, at);
      return;
    }
    this.pending.push(this.ballisticBoom(shell, at, victims.find((t) => t.kind === 'hull')?.id));
  }

  /** An INTERCEPTED FLASH round's burst at the stop point (gate fix F1): the
   *  flash fires there (applyStopTags), so its disc must be seen there — the
   *  same subject resolveBurst pushes, beside the interception's boom. Every
   *  other intercepted round (no `flash` tag) bursts nowhere: boom only. */
  private emitInterceptionBurst(shell: ShellState, at: Vec2): void {
    if (!shell.flash) return;
    this.pushBurst(shell, { x: at.x, y: at.y });
  }

  /** WHAT A SHELL LEAVES WHERE IT STOPS, whichever way it stopped (its burst
   *  point, or an interception's stop point — the ONE shared list, so the two
   *  resolution paths can never disagree about a tag): a `lit` flare lights a
   *  zone (Story 1.7), a `burn` phosphor shell spawns a burning zone (Story
   *  8.17), a `foul` fouling shell spawns a foul zone (Story 9.4) and a
   *  `flash` shell dazzles every non-owner hull inside it (Story 8.17,
   *  restored by Story 10.9). Plain shells carry no tag and leave nothing. */
  private applyStopTags(shell: ShellState, at: Vec2): void {
    if (shell.lit) this.spawnLitZone(shell, at);
    if (shell.burn) this.spawnBurnZone(shell, at);
    if (shell.foul) this.spawnFoulZone(shell, at);
    if (shell.flash) this.applyFlash(at, shell.ownerId, shell.flash.radius, shell.flash.durationMs);
  }

  /**
   * A FLASH SHELLS burst (Story 8.17, Eric ruling 2026-09-29, amendment 132;
   * RESTORED by Story 10.9, epic-10 amendments 2 and 4): every AFLOAT
   * non-owner ship whose CENTRE is within `radius` of `at` (amendment 136) —
   * captains and bots alike (a spectator or a wreck has no eyes to dazzle) — is marked `dazzledUntil = max(current,
   * now + durationMs)` — `durationMs` is the shell's tag, stamped by the row
   * as FLASH_WINDOW_MS (the whole whiteout, epic-10 amendment 5): a hull
   * already dazzled keeps whichever expiry is LATER, so a second flash
   * restarts the whiteout, never stacks and never shortens. One-time: no
   * zone, no light, no reveal, no damage, nothing refreshes the mark.
   * Perception (signals.sightOf → the shared `effectiveSight`) reads the
   * mark as the whiteout's clear circle — 0 through ramp + hold, then growing
   * to full sight — for the DAZZLED observer's own sight; frames mirror the
   * mark to the victim alone.
   *
   * GATED ON damageEnabled (Story 2.8 review, P9): a flash is a HOSTILE
   * effect, so a ready-room burst blinds nobody — the shell still flies and
   * bursts, and nothing else happens.
   */
  private applyFlash(at: Vec2, ownerId: string, radius: number, durationMs: number): void {
    if (!this.damageEnabled) return; // ready-room flashes blind nobody
    const r2 = radius * radius;
    const until = this.now + durationMs;
    for (const ship of this.ships.values()) {
      if (ship.id === ownerId || !isAfloat(ship.lifecycle)) continue;
      const dx = ship.state.x - at.x;
      const dy = ship.state.y - at.y;
      if (dx * dx + dy * dy > r2) continue;
      ship.dazzledUntil = Math.max(ship.dazzledUntil, until);
    }
  }

  /** Spawn a lit zone where a star shell stopped (burst point, or the
   *  interception stop point — a flare always lights). Stamped from the
   *  shell's own `lit` tag; since Story 8.17 a lit zone carries no verbs
   *  (amendment 134), so there is no owner lookup any more. */
  private spawnLitZone(shell: ShellState, at: Vec2): void {
    const id = this.nextLitZoneId();
    this.litZones.set(id, {
      id,
      ownerId: shell.ownerId,
      x: at.x,
      y: at.y,
      r: shell.lit!.radius,
      until: this.now + shell.lit!.durationMs,
    });
  }

  /** Spawn a BURNING ZONE where a phosphor shell stopped (burst point, or the
   *  interception stop point — Story 8.17, amendment 131). Radius, lifetime
   *  and dps are STAMPED from the shell's `burn` tag, which the row filled
   *  from the owner's effective stats at LAUNCH (amendment 135(e)) — never an
   *  owner lookup here, so a tier card fitted while the shell flew, or after
   *  the zone lit, changes nothing about it. */
  private spawnBurnZone(shell: ShellState, at: Vec2): void {
    const id = this.nextBurnZoneId();
    const burn = shell.burn!;
    this.burnZones.set(id, {
      id,
      ownerId: shell.ownerId,
      x: at.x,
      y: at.y,
      r: burn.radius,
      until: this.now + burn.durationMs,
      dps: burn.dps,
    });
  }

  /** Spawn a FOUL ZONE where a fouling shell stopped (burst point, or the
   *  interception stop point — Story 9.4, the lit / burn precedent). Radius
   *  and lifetime are STAMPED from the shell's `foul` tag (the radius is the
   *  launching row's tiered `radius`, Story 10.5 R7); the zone is spawned
   *  whatever `damageEnabled` says — it draws in the pre-start phases, it
   *  just stamps nobody there (applyFoulZones). */
  private spawnFoulZone(shell: ShellState, at: Vec2): void {
    const id = this.nextFoulZoneId();
    const foul = shell.foul!;
    this.foulZones.set(id, {
      id,
      ownerId: shell.ownerId,
      x: at.x,
      y: at.y,
      r: foul.radius,
      until: this.now + foul.durationMs,
    });
  }

  /**
   * THE FOUL ZONE STAMP (Story 9.4, Eric ruling 2026-10-11, epic-9
   * amendments 61–68), once per tick over post-move hull OUTLINES: every
   * AFLOAT hull — captains, bots and the zone's OWNER alike (Eric:
   * *"Yes it does slow you"*) — whose silhouette polygon touches ANY live foul
   * zone (the shared `polyInBlast`, point-to-polygon distance ≤ r: the gun
   * burst / mine blast rule, amendment 62 — a long hull is caught a
   * half-length earlier and held a half-length longer than a centre test
   * would) is stamped `fouledUntil = now + CONFIG.foulingShell.lingerMs`.
   * Plain assignment, ONE stamp per hull per tick however many zones cover
   * it: that is what makes "the same source never stacks" (amendment 64)
   * true by construction — a second zone or a later shell can only hold the
   * clock at one linger, never deepen the factor, which is the CONFIG
   * constant folded once in tickKinematics. Sinking hulls are excluded (the
   * mine blast's rule: a slow is refreshed on afloat hulls only).
   *
   * The polygons are the SAME world-space outlines `hitTargets(['hull'])`
   * builds for ballistics and mines this tick (afloat hulls only, post-move,
   * memoized per tick) — never hand-rolled geometry.
   *
   * GATED ON damageEnabled exactly as the FOULING MINE's slow is: nobody is
   * slowed in the pre-start phases or a dev sandbox room where damage is off
   * (amendment 67 — the implementer reading, not a ruling); the shell still
   * flies, the circle still draws, and nothing else happens.
   */
  private applyFoulZones(): void {
    if (!this.damageEnabled) return; // damage off ⇒ the slow is off too (the fouling mine's gate)
    if (this.foulZones.size === 0) return;
    const until = this.now + CONFIG.foulingShell.lingerMs;
    for (const hull of this.hitTargets(FOUL_ZONE_HITS)) {
      if (!this.outlineInAnyFoulZone(hull.poly)) continue;
      this.ships.get(hull.id)!.fouledUntil = until;
    }
  }

  /** Does this outline touch ANY live foul zone? (`polyInBlast` — the one
   *  blast-membership predicate, shared with the gun burst and the mine.) */
  private outlineInAnyFoulZone(poly: readonly Vec2[]): boolean {
    for (const zone of this.foulZones.values()) {
      if (polyInBlast(zone, zone.r, poly)) return true;
    }
    return false;
  }

  /**
   * PHOSPHOR burning-zone DoT (Story 2.8's machinery, Story 8.17's source —
   * amendment 135(g)), once per tick over post-move centers: every BurnZone
   * burns every non-owner alive hull whose CENTER is inside — the zone's own
   * stamped `dps` integrated per tick through the burnShip choke (kill credit
   * to the zone owner), at most once per (owner, victim) pair per tick no
   * matter how many of that owner's zones overlap (the STRONGEST covering
   * zone of that owner bites, so two of one owner's zones never double-burn).
   *
   * Gated on damageEnabled (Story 2.8 review, P9): the weapons-safe ready
   * room never burns anyone — a phosphor shell fired there leaves its zone on
   * the water and nothing else.
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
    if (!this.damageEnabled) return; // ready-room zones never burn
    const burning = new Set<string>();
    for (const ship of this.ships.values()) {
      if (!isAfloat(ship.lifecycle)) continue;
      for (const [ownerId, dps] of this.markZoneEffects(ship)) {
        if (!isAfloat(ship.lifecycle)) break; // a mid-loop sink stops further burns
        burning.add(dotKey(ownerId, ship.id));
        this.burnShip(ship, dps * dt, ownerId);
      }
    }
    this.burnBeacons(dt);
    // Every pair that did NOT burn this tick has stopped burning: flush its
    // remainder now so no applied damage is ever left unreported. The contact
    // bleed's `grind:` windows are applyContactDamage's to flush, not ours.
    for (const key of [...this.dotBuckets.keys()]) {
      if (!key.startsWith(GRIND_KEY_PREFIX) && !burning.has(key)) this.flushDot(key);
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
    // Since Story 8.4 this is a NAMED SEAT on the gate, not a writer: the
    // sinking guard, the overkill clamp, the hp write, the assist credit and
    // the DoT bucket all live in applyDamage / reportDamage, and the 'burn'
    // source is what selects the windowed report instead of an immediate `dmg`.
    this.applyDamage(victim, amount, 'burn', ownerId);
  }

  /** Emit one aggregated victim-private `dmg` for a DoT bucket and drop it.
   *  `hp` reports the victim's CURRENT hp (already applied per tick), so the
   *  client's hp mirror is exact at flush time. A window where nothing burned
   *  at all emits nothing. */
  private flushDot(key: string): void {
    const bucket = this.dotBuckets.get(key);
    if (bucket === undefined) return;
    this.dotBuckets.delete(key);
    const victim = this.ships.get(bucket.victimId);
    if (victim === undefined || bucket.amount <= 0) return;
    this.pending.push({ k: 'dmg', id: bucket.victimId, amount: bucket.amount, hp: Math.max(0, victim.hp) });
  }

  /** THE PHOSPHOR BURN ON RADIO BEACONS (Story 10.8, R8: "special shells (the
   *  phosphor burn included)"): every hittable beacon whose CENTRE a burning
   *  zone covers takes that zone's `dps` per tick through its own door —
   *  the hull rule exactly (centre test, the strongest zone per owner, the
   *  fractional 'burn' amount unfloored), credited to the zone's owner. A
   *  beacon has no owner, so no zone is "its own". No `dmg` window: there is
   *  no victim client to report to. */
  private burnBeacons(dt: number): void {
    if (this.burnZones.size === 0) return;
    for (const beacon of this.beacons.records) {
      if (!this.beacons.hittable(beacon, this.now)) continue;
      for (const [ownerId, dps] of this.markZoneEffects({ id: beacon.id, state: beacon })) {
        this.damageBeacon(beacon.id, dps * dt, 'burn', ownerId);
      }
    }
  }

  /** The per-ship BURN-ZONE scan (Story 8.17): the owners of every covering
   *  non-owned burning zone, each with the strongest `dps` among that owner's
   *  covering zones (deduped — at most one burn per owner per tick, whatever
   *  the overlap). Only `burnZones` is read: a lit zone burns nobody
   *  (amendment 134), a foul zone only slows (Story 9.4, its own store and
   *  its own row — applyFoulZones), and the dazzle branch left with the
   *  verb. `ship` is any body with an id and a centre — a hull, or a radio
   *  beacon (Story 10.8, burnBeacons). */
  private markZoneEffects(ship: { id: string; state: Vec2 }): Map<string, number> {
    const burnedBy = new Map<string, number>();
    for (const zone of this.burnZones.values()) {
      if (zone.ownerId === ship.id) continue; // own zones never burn you
      const dx = ship.state.x - zone.x;
      const dy = ship.state.y - zone.y;
      if (dx * dx + dy * dy > zone.r * zone.r) continue;
      burnedBy.set(zone.ownerId, Math.max(burnedBy.get(zone.ownerId) ?? 0, zone.dps));
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

  /** Drop every burning zone whose lifetime has elapsed (Story 8.17 — the lit
   *  zone's exact rule: natural expiry only, owner death never clears it). */
  private expireBurnZones(): void {
    for (const [id, zone] of this.burnZones) {
      if (this.now >= zone.until) this.burnZones.delete(id);
    }
  }

  /** Drop every foul zone whose lifetime has elapsed (Story 9.4 — the burn
   *  zone's exact rule: natural expiry only, owner death never clears it; a
   *  hull's lingering `fouledUntil` stamp outlives the zone by design). */
  private expireFoulZones(): void {
    for (const [id, zone] of this.foulZones) {
      if (this.now >= zone.until) this.foulZones.delete(id);
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
        // Fail-closed dispatch (Story 8.1): the registry is PARTIAL over its
        // id space, so an id with no built row ticks nothing.
        slotRow(slot.equipmentId)?.tick(ship, slot, dtMs, this.now);
      }
      for (const intent of ship.tickIntents) this.consumeClick(ship, intent);
      this.consumeClick(ship, ship.input);
    }
  }

  /**
   * THE LEVEL CHANNEL (Story 8.15, amendment 103) — the machine gun's stream,
   * the sibling of fireControl's click channel. Every tick, for SLOT 0 ONLY,
   * a row that declares `stream` is handed the HELD LEVEL off the ship's
   * LATEST input (never the intent queue: a level has no edges to replay) and
   * fires or not on its own clock. It passes the SAME gate a click passes
   * (`activationRefusal`: frozen / dead — sinking stays live, amendment 10),
   * so a boarding room, a foundered hull and a dead one stream nothing (the
   * row is handed `held: false`, so a stream cut by the gate ends there); the
   * client already drops `held` on blur and when the refit window opens. No
   * denial is ever queued: an empty magazine is visible in `ammo`, and a
   * level that fires nothing is not a refused press.
   *
   * THE LEVEL COUNTS ONLY WHILE THE GUN IS THE SELECTED SLOT (orchestrator
   * ruling, 2026-09-28): the client sends `held: true` whenever the canvas
   * pointer is down — INCLUDING the click-and-hold that fires a primed Q/E/R
   * weapon — so a hold with any other slot selected (`input.slot !== 0`)
   * streams nothing. The selection rides the same latest input as the level.
   */
  private streamControl(): void {
    for (const ship of this.ships.values()) {
      const slot = ship.loadout[SLOT_GUN];
      const row = slotRow(slot.equipmentId);
      if (row?.stream === undefined) continue;
      // A REFUSED hull (frozen / dead) is told the stream is NOT live, never
      // skipped: a hold cut by the refusal ends the stream THAT tick — the
      // partial-magazine swap starts, and the hold after the refusal lifts is
      // a FRESH stream (review gate P1, 2026-09-30).
      const live = this.activationRefusal(ship) === null && ship.input.held && ship.input.slot === SLOT_GUN;
      row.stream(this.activationContext(ship), slot, live);
    }
  }

  /**
   * THE TURRET STEP (Story 10.4; see the STEP_ORDER row): every hull with a
   * battery steps its turrets through the shared stepper. An AFLOAT hull's
   * turrets point at the latest input's aim point where it is inside their
   * arcs and rest elsewhere (`batteryAimPoint` — the same aim `InputMsg.aim`
   * / `aimDist` the client predicts with; an input with no positive aimDist
   * is NO AIM and keeps every angle, gate S2); a SINKING or dead hull's
   * turrets KEEP their angles (aimPoint null — orchestrator ruling, wave-1
   * gate) while their reloads still count down, so a dying captain can still
   * fire whatever is ready (amendment 10).
   */
  /** THE LAUNCHER STEP (Story 10.6; see the STEP_ORDER row): every hull
   *  holding a torpedo steps its launchers (equipment/mounts.ts). */
  private stepLaunchers(dtMs: number): void {
    for (const ship of this.ships.values()) stepShipLaunchers(ship, dtMs);
  }

  private stepTurrets(dtMs: number): void {
    for (const ship of this.ships.values()) {
      if (ship.turrets.length === 0) continue;
      const aim = isAfloat(ship.lifecycle) ? batteryAimPoint(ship.state, ship.input.aim, ship.input.aimDist) : null;
      stepTurrets(ship.turrets, ship.hullId, ship.state, aim, dtMs);
    }
  }

  /**
   * THE SECONDARIES CHANNEL (Story 10.4, R3; see the STEP_ORDER row). For
   * every hull: the shared heat stepper
   * runs on the latest input's `sec` level — refused (frozen room / dead hull,
   * the one `activationRefusal` rule; a SINKING hull stays live exactly as its
   * weapons do) reads as released, so the guns drain — and every round it
   * returns is spawned. No denial is ever queued: a gun waiting out its
   * interval is not a refused press, and its heat is visible in `OwnShip.sec`.
   */
  private secondariesControl(dtMs: number): void {
    for (const ship of this.ships.values()) {
      const live = this.activationRefusal(ship) === null && ship.input.sec;
      const rounds = stepSecondaries(ship.sec, live, dtMs);
      if (rounds <= 0) continue;
      const ctx = this.activationContext(ship);
      for (let i = 0; i < rounds; i += 1) fireSecondaryRound(ctx);
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
    // ability or empty slot (e.g. a captain's `boost` in slot 1) is silently
    // inert: abilities activate via actSeq, and letting a click reach
    // boostEquipment.activate would burn the charge AND stamp lastFireT off
    // the wrong channel. An out-of-range/empty slot is inert here too (it was
    // an 'empty-slot' gate denial before — same no-op, no lastFireT).
    const id = fittedEquipment(ship.loadout, input.slot);
    // The shared weapon/ability split — the ONE predicate the client's
    // prime/activate fork reads as well.
    if (id === null || !EQUIPMENT_IS_WEAPON[id]) return;
    // A LEVEL WEAPON NEVER FIRES ON A CLICK (Story 8.15, amendment 103): a row
    // that declares `stream` (the machine gun) is driven by streamControl off
    // `input.held`, so a fireSeq edge on it is consumed and then INERT — no
    // activation, no denial, no lastFireT stamp (the stream never back-dates).
    if (slotRow(id)?.stream !== undefined) return;
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
    else this.queueWeaponDenial(ship, input, result.reason);
  }

  /** A refused click's wire denial (keyed (slot, fireSeq) — no `act`). */
  private queueWeaponDenial(ship: ShipRecord, input: InputMsg, denial: ActivationDenial): void {
    const reason = World.wireDenialReason(denial, 'weapon');
    if (reason !== null) this.queueDenial(ship, { slot: input.slot, reason, seq: input.fireSeq });
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
   * press; lastActSeq advances EVERY tick (even dead or inert, exactly like
   * lastFireSeq), so a stale counter never re-reads as a fresh press. Since
   * Story 10.5 (epic-10 amendment 11) the press NAMES its ability
   * (`InputMsg.act`, validated by inputs.ts): the SHIFT (slot 1, through the
   * single sinking gate exactly as before), or one of the two COOLDOWN
   * ABILITIES — HULL REPAIR (`C`) and SMOKE (`V`) — which hold no slot and are
   * answered by pressCooldownAbility. Ability activation is NOT
   * latency-compensated: everything runs at `now`.
   * Story 2.1: every accepted input's press intent is evaluated in seq order
   * (tickIntents), so two presses coalescing into one tick both activate or
   * get their own wire denial; the trailing latest-input pass is the
   * direct-assignment (test) backstop only, a no-op when the queue already
   * covered the press.
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
    // Afloat OR SINKING (Story 5.2 weapons seam, amendments 10/15): the Shift
    // stays live while sinking; the two cooldown abilities refuse a sinking
    // hull themselves (pressCooldownAbility).
    if ((!isAfloat(ship.lifecycle) && !isSinking(ship.lifecycle)) || !activated) return;
    // inputs.ts drops a message with an unknown code; this is the backstop for
    // a directly assigned input.
    const ability = abilityFromCode(input.act);
    if (ability === null) return;
    if (ability === 'shift') this.pressShift(ship, input);
    else this.pressCooldownAbility(ship, input.actSeq, ability);
  }

  /** THE SHIFT PRESS — today's slot-1 path, unchanged: slot 1 activates
   *  through the single sinking gate iff it holds an ability (a weapon or an
   *  empty slot is silently inert). A refusal is a SELF-PRIVATE wire denial
   *  keyed on the press's actSeq (Story 1.10) — the within-RTT double press
   *  (stale client predicts READY, server refuses) is audible. */
  private pressShift(ship: ShipRecord, input: InputMsg): void {
    const id = fittedEquipment(ship.loadout, SLOT_BOOST);
    if (id === null || EQUIPMENT_IS_WEAPON[id]) return;
    const result = this.withInput(ship, input, () => this.sinkingActivationGate(ship, SLOT_BOOST));
    if (result.ok) return;
    const reason = World.wireDenialReason(result.reason, 'ability');
    if (reason !== null) this.queueDenial(ship, { slot: abilitySlot('shift'), reason, seq: input.actSeq, act: abilityCode('shift') });
  }

  /**
   * HULL REPAIR (`C`) and SMOKE (`V`) — the two per-ship COOLDOWN ABILITIES
   * (Story 10.5, Eric 2026-11-05, epic-10 amendment 11, R1–R3). Every ship
   * has both, ready at spawn; neither sits in a slot. The refusal law is the
   * SHARED one both sides call (`repairRefusal` — 'cooling' inside the
   * cooldown, else 'blocked' on a full hull; `smokeRefusal` — 'cooling'), and
   * the cooldown (`abilityReadyAt` — fixed, never scaled by RELOAD, never
   * touched by INSTANT RELOAD) is stamped ONLY on success.
   *
   * THE CALLER'S GATES (the shared law leaves them to the server): a frozen
   * room or a dead hull is refused silently (activationRefusal — never on the
   * wire); a SINKING hull is refused 'blocked' (no hp comes back in the
   * window, and the 9.3 cloud refused a sinking press the same way), nothing
   * started. The effects themselves are unchanged: the paid repair
   * (applyRepair — the ship's own `stats.repair` instant + pooled hp and the `heal`
   * cue) and ONE countermeasure cloud at the hull's centre (makeCloud).
   */
  private pressCooldownAbility(ship: ShipRecord, seq: number, ability: CooldownAbilityId): void {
    if (this.activationRefusal(ship) !== null) return;
    const reason = this.cooldownRefusal(ship, ability);
    if (reason !== null) {
      this.queueDenial(ship, { slot: abilitySlot(ability), reason, seq, act: abilityCode(ability) });
      return;
    }
    // THE SHIP'S OWN NUMBERS (Story 10.6, R8 / R9): the cooldown and the
    // effect read the folded `stats.repair` / `stats.smoke` — never CONFIG,
    // never the ship's RELOAD.
    if (ability === 'repair') {
      ship.repairReadyAt = abilityReadyAt(this.now, ship.stats, 'repair');
      this.applyRepair(ship);
    } else {
      ship.smokeReadyAt = abilityReadyAt(this.now, ship.stats, 'smoke');
      this.makeCloud(ship);
    }
  }

  /** The wire refusal of a cooldown-ability press, or null when it fires. */
  private cooldownRefusal(ship: ShipRecord, ability: CooldownAbilityId): DenialReason | null {
    if (!isAfloat(ship.lifecycle)) return 'blocked';
    if (ability === 'smoke') return smokeRefusal(this.now, ship.smokeReadyAt);
    return repairRefusal(ship.hp, ship.stats.maxHp, this.now, ship.repairReadyAt);
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
   * even dead or on cooldown, so a stale/replayed counter never
   * re-reads as a fresh press) + at-most-once evaluation. An eligible press
   * emits ONE `fh` SUBJECT into pending — {k,h,x,y,id}, the ship's true
   * current position and id, which the signals.ts foghorn row consumes to
   * compute each observer's bearing/tier and NEVER forwards (materialize
   * builds a fresh per-observer payload; x/y reach spectators only, id
   * reaches no one) — and arms the cooldown. An early or ineligible press
   * (dead, inside cooldownMs) is consumed and silently dropped,
   * exactly as malformed input is: no denial, no event, no state beyond the
   * counter.
   */
  private consumeHonk(ship: ShipRecord, input: InputMsg): void {
    const pressed = input.hornSeq > ship.lastHornSeq;
    ship.lastHornSeq = Math.max(ship.lastHornSeq, input.hornSeq);
    // Afloat OR SINKING (Story 5.2, amendment 10 — "Weapons and equipment
    // only. And foghorn."): the horn is named alongside the slots, so a
    // sinking captain keeps the last word.
    if (!pressed || (!isAfloat(ship.lifecycle) && !isSinking(ship.lifecycle)) || this.now < ship.nextHonkAt) return;
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
   * criteria for usability" — so every registry row (the weapons and the
   * Shifts) activates while SINKING exactly as when alive, and a future row is
   * in by default rather than needing a ruling. What a sinking captain loses
   * is the ECONOMY — the upgrade menu and its card picks — which never routed
   * through this gate at all (that block lives in spendPoint: "once sinking,
   * you're done"). (HULL REPAIR and SMOKE hold no slot since Story 10.5 and
   * never reach this gate — pressCooldownAbility.) Only a hull
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
    // The ship-level half of the gate is FACTORED (Story 8.15) so the click
    // channel, the ability channel and the machine gun's LEVEL channel
    // (streamControl) all refuse a frozen room or a dead hull by the one rule.
    // THE WEAPONS LOCK (Story 6.1, amendment 8) sits at the TOP of the one call
    // path to Equipment.activate(), so a boarding room has no second seam to
    // forget: weapons, abilities and mine drops alike are refused before any
    // row is dispatched, before a pool is touched and before a reload is armed.
    // 'frozen' never reaches the wire (wireDenialReason maps it to null, like
    // the gate's other two refusals) — a locked helm and a dark HUD already say
    // the start line is held; a denial klaxon per click would be noise.
    const refusal = this.activationRefusal(ship);
    if (refusal !== null) return { ok: false, reason: refusal };
    const slot = ship.loadout[slotIndex];
    if (!slot) return { ok: false, reason: 'empty-slot' };
    const id = slot.equipmentId;
    if (id === null) return { ok: false, reason: 'empty-slot' };
    const row = slotRow(id);
    // Fail-closed (Story 8.1): an id with no built module answers exactly as an
    // empty slot does — applyCard never fits one, so this is unreachable in play.
    if (row === undefined) return { ok: false, reason: 'empty-slot' };
    return row.activate(this.activationContext(ship, fireT), slot);
  }

  /** The SHIP-LEVEL refusals of the activation gate, shared by every channel
   *  (Story 8.15): 'frozen' while the weapons lock holds, 'dead' for a hull
   *  whose life is over (afloat OR sinking is live — amendments 10/15), else
   *  null. Never on the wire (wireDenialReason maps both to null). */
  private activationRefusal(ship: ShipRecord): ActivationDenial | null {
    if (!this.weaponsEnabled) return 'frozen';
    if (!isAfloat(ship.lifecycle) && !isSinking(ship.lifecycle)) return 'dead';
    return null;
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
      heightRaster: this.map.heightRaster,
      mkId: () => this.nextBallisticId(),
      mintShell: () => {
        const id = this.nextBallisticId();
        return { id, seed: dispersionShellSeed(this.dispersionKey, this.shellSeq) };
      },
      spawnBallistic: (shell, opts) => this.spawnBallistic(shell, opts?.perShellFlash === true),
      dropMine: (x, y, kind) => this.spawnMine(ship, x, y, kind, fireT),
      // R2.15 — keyed on the ACTIVATING ship, which is what makes the star-shell
      // gun reach OWN-FLARES-ONLY: a row cannot ask about anyone else's zones.
      ownLitZones: () => this.ownLiveLitZones(ship.id),
      // Story 8.15 — the two new Shifts' bodies, World-owned and keyed on the
      // ACTIVATING ship: INSTANT RELOAD's walk over its own weapon slots, and
      // HUNKER's window (the ONLY writer of hunkerUntil): inside it the
      // damage gate adds the row's `armorBonus` to the hull's Armor (Story 9.7).
      finishReloads: () => World.finishReloads(ship),
      setHunker: (until) => {
        ship.hunkerUntil = until;
      },
    };
  }

  /**
   * INSTANT RELOAD's effect (Story 8.15, Eric ruling 2026-09-28, amendment 98
   * — "finish one reload only"): for the mounted gun (slot 0) and each fitted
   * Q/E/R weapon whose reload timer is RUNNING, complete that ONE reload now.
   * A per-round pool gains ONE round (capped at its effective max) and its
   * timer drops to zero — rounds spent beyond that stay spent and reload on
   * the ordinary clock: a pool still short restarts its timer at the FULL
   * reloadMs, exactly what the shared machine does after a natural top-up
   * (a zero timer on a short pool would read as "a round is due now" and hand
   * out a second free round on the next tick). The MACHINE GUN is the one
   * exception by construction: its running timer is a MAGAZINE SWAP, and a
   * swap completing means a full magazine (amendment 103), so it fills. A
   * weapon that is not reloading is untouched; the Shift slot (1) is never
   * visited, and neither are the HULL REPAIR / SMOKE cooldowns (Story 10.5,
   * R3 / R10 — they are not reloads). THE SECONDARIES are vented — heat to
   * zero (2026-11-05, Story 10.5, R10, epic-10
   * amendment 11; supersedes amendment 9(h) R7 "heat untouched") — through
   * the shared `ventSecondaries` law.
   */
  private static finishReloads(ship: ShipRecord): void {
    ship.sec = ventSecondaries(ship.sec);
    for (const i of [SLOT_GUN, ...WEAPON_SLOTS]) {
      const slot = ship.loadout[i];
      if (slot === undefined) continue;
      // THE MAIN BATTERY (Story 10.4 reading of record): INSTANT RELOAD
      // finishes EVERY turret (angles untouched), and slot 0's derived pair
      // is re-synced from them.
      if (slot.equipmentId === 'mainBattery') {
        reloadAllTurrets(ship.turrets);
        syncBatterySlot(ship, slot);
      } else {
        World.finishOneReload(ship, slot);
      }
    }
    // THE LAUNCHERS AND RACKS (Story 10.6, R14): every tube loaded, ONE mine
    // per rack that is short; the two slot summaries re-derived.
    instantReloadMounts(ship);
  }

  /** `finishReloads` for one ordinary per-round (or magazine) slot. */
  private static finishOneReload(ship: ShipRecord, slot: LoadoutSlot): void {
    const id = slot.equipmentId;
    if (id === null || slot.state === null || slot.state.reloadMsLeft <= 0 || isMountBacked(id)) return;
    const maxAmmo = equipmentMaxAmmo(ship.stats, id);
    slot.state.n = id === 'machineGun' ? maxAmmo : Math.min(slot.state.n + 1, maxAmmo);
    slot.state.reloadMsLeft = slot.state.n < maxAmmo ? equipmentReloadMs(ship.stats, id) : 0;
  }

  /** A fresh all-zero bonus record (Story 10.7, R5) — one per ship. */
  private static noBonus(): Record<IndexId, number> {
    return Object.fromEntries(INDEX_IDS.map((id) => [id, 0])) as Record<IndexId, number>;
  }

  /** Zero the Story 8.15 per-life clocks — the HUNKER window and the
   *  machine gun's stream clock — at every life boundary where
   *  `boostUntil` resets (redeploy / founder / respawn), so a fresh life
   *  never inherits an open cut or a mid-stream cadence. */
  /** A FRESH LIFE'S GUNS (Story 10.4): turrets at rest and loaded, the
   *  secondaries cold — at the redeploy and respawn edges (a FOUNDERED wreck
   *  keeps its angles: the record is not re-armed until it comes back). */
  private static resetBattery(ship: ShipRecord): void {
    ship.turrets = initialTurrets(ship.hullId);
    ship.sec = initialSecondaries();
    // ...and the torpedo launchers at rest with every tube loaded, every mine
    // rack full, for whatever the family slots hold (Story 10.6, I3).
    resetMounts(ship);
  }

  private static clearShiftClocks(ship: ShipRecord): void {
    ship.hunkerUntil = 0;
    ship.streamNextAt = 0;
    ship.streamLive = false;
  }

  /**
   * THE PAID REPAIR (Eric rulings 2026-08-04; a cooldown ABILITY since Story
   * 10.5) — reached ONLY from pressCooldownAbility, which owns the afloat /
   * full-hull / cooldown guards.
   *
   * `instantHp` lands now, clamped to maxHp; `regenHp` REPLACES the pool.
   * A RE-PRESS REPLACES, IT NEVER STACKS (Eric ruling 2026-09-29, epic-8
   * amendment 141 — the shield / smoke "replaces" posture applied to
   * the heal): whatever was still owed from an earlier copy is DISCARDED, and
   * a fresh pool pays out over a fresh `regenMs` at the unchanged rate
   * (the rate stamped at the press, `repairRate` = regenHp/regenMs — there is still no rate a card can
   * recompute, so the anti-flask half of the old rule holds: a re-press can
   * never make the drain run FASTER, it can only restart it). The instant
   * half lands as before. This supersedes the "pools ADD, the drain runs
   * twice as LONG" law of amendment 51's parenthetical — a captain who
   * re-presses at 2 s into a pool with 30 owed holds 50, not 80.
   *
   * The `heal` cue is queued HERE, for the same reason
   * `bn` is queued in spendPoint rather than inside applyBoon: the pending
   * queue is World state, and a directed repair must not be event-free by
   * accident. It is SELF-PRIVATE (signals.ts) and carries no amount — an
   * observer can never learn that a hull is repairing.
   */
  private applyRepair(ship: ShipRecord): void {
    const { instantHp, regenHp, regenMs } = ship.stats.repair; // the ship's own (Story 10.6, R8)
    ship.hp = Math.min(ship.hp + instantHp, ship.stats.maxHp);
    ship.repairHp = regenHp; // REPLACE (amendment 141), never `+=`
    // The pool's payout rate, STAMPED: it always drains over the fixed window
    // (R15), whatever card is taken mid-drain.
    ship.repairRate = regenMs > 0 ? regenHp / regenMs : 0;
    this.pending.push({ k: 'heal', id: ship.id });
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
    // The back-dated sweep sees exactly what the ordinary sweep sees — the
    // shell's OWN mask through the one collector (Story 8.4), MINUS mines
    // (amendment 20): a back-dated shell flies over a mine exactly as a
    // live-stepped one does. It still resolves no outcomes: a terminal result
    // defers to next tick's sweep.
    const hulls = this.hitTargets(sweepMask(shell.hits));
    const islandIndex = this.islandIndex;
    let remainingMs = this.now - shell.bornAt;
    while (remainingMs > 0) {
      const dtMs = Math.min(remainingMs, CONFIG.tick.simDtMs);
      remainingMs -= dtMs;
      const outcome = stepShell(shell, {
        islands: this.map.islands,
        islandIndex,
        targets: hulls,
        now: this.now,
        dt: dtMs / 1000,
        mapRadius: this.map.radius,
      });
      if (outcome.kind !== 'travel') return; // terminal: defer to next tick's sweep
    }
  }

  /** Store a newly-dropped mine at an already-validated point. NO CAP of any
   *  kind since Story 8.4 (FR57/AR48): nothing is evicted, so a laid trap stays
   *  laid until it is tripped or shot. Story 2.8 (amendment 45): mines are a click-aimed
   *  WEAPON on the fireSeq channel — the equipment row validates the rear
   *  placement sector + placeRange and hands us the CLICKED point, and the
   *  activation carries the D1-compensated fire time, so `droppedAt` is that
   *  validated fireT (not necessarily `now`) and armedAt = droppedAt +
   *  armDelay. */
  private spawnMine(
    owner: ShipRecord,
    x: number,
    y: number,
    kind: MineKind,
    droppedAt: number = this.now,
  ): void {
    addMine(this.mines, owner.id, x, y, droppedAt, this.nextMineId(), kind);
    // A newly-laid mine is not a target this tick (it is still arming), but the
    // store changed, so the collector's memo must not outlive it.
    this.targetsGen += 1;
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

  private nextBurnZoneId(): string {
    this.burnZoneSeq += 1;
    return `bz${this.burnZoneSeq}`;
  }

  private nextFoulZoneId(): string {
    this.foulZoneSeq += 1;
    return `fz${this.foulZoneSeq}`;
  }

  /**
   * One-time ballistic params the client dead-reckons from. NO range-derivable
   * field (no ttl/distLeft) — see BallisticEvent's anti-cheat note. Perception
   * re-issues this per observer at reveal time; the wire shape stays
   * constant-free. `k` carries the projectile kind (shell vs torp).
   */
  private ballisticEvent(shell: ShellState): BallisticEvent {
    const ev: BallisticEvent = {
      k: shell.kind,
      id: shell.id,
      x: shell.x,
      y: shell.y,
      vx: shell.vx,
      vy: shell.vy,
      t: shell.bornAt,
    };
    // Story 8.15: the launch event carries the family exactly as the per-observer
    // reveal does (signals.ts ballisticSignal) — a `shell` gets `w`, a `torp` never.
    if (shell.kind === 'shell' && shell.family !== null) ev.w = shell.family;
    return ev;
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
      const raw = ship.sweepAngle + delta;
      ship.prevSweepAngle = ship.sweepAngle;
      ship.sweepAngle = wrapPositive(raw);
    }
  }

  /**
   * The passive XP tick (Story 2.6, amendment 34): every ALIVE human hull
   * accrues exactly this tick's `dtMs`, so 1200 ticks of the 50ms step is one
   * level to the millisecond. Three gates, all of them here:
   *   • `xpEnabled` — the match phase is 'active' (the ready room and the
   *     post-match freeze accrue nothing; Match drives the flag);
   *   • alive — a wreck awaiting respawn / a spectating corpse earns nothing.
   * The sim never pauses, so XP keeps ticking while the refit modal is open —
   * that is the ratified behavior, not an oversight.
   */
  private tickXp(dtMs: number): void {
    if (!this.xpEnabled) return;
    for (const ship of this.ships.values()) {
      if (isAfloat(ship.lifecycle)) this.addXpMs(ship, dtMs);
    }
  }

  /** Are the RADIO BEACONS running? The match is live for XP, the zone clock
   *  (their cycle clock) has started, and no dev smoke switched them off. */
  private beaconsLive(): boolean {
    return this.beaconsEnabled && this.xpEnabled && this.zoneStartT !== null;
  }

  /** THE PUBLIC BEACON CHART (Story 10.8, R9): the current ring cycle, when
   *  it began and each beacon's position and early sink time — exactly what
   *  the room mirrors onto the schema, and the only beacon facts a bot's port
   *  may read. Empty (cycle -1) when there are none. */
  get beaconChart(): BeaconChart {
    return this.beacons.chart;
  }

  /** Scratch: the hulls a beacon may pay this tick. */
  private readonly beaconHulls: ShipRecord[] = [];

  /** One hull's integer share of a beacon's pot, through THE XP door — so a
   *  level, its offer and its `pt` behave exactly as passive XP's do — and
   *  onto the hull's harness tally. */
  private readonly payBeaconShare = (hull: ShipRecord, shareMs: number): void => {
    this.addXpMs(hull, shareMs);
    hull.beaconXpMs += shareMs;
  };

  /**
   * RADIO BEACON PAYOUT (Story 10.8, R3 / R4; see the STEP_ORDER row). Every
   * AFLOAT PARTICIPANT — captains and bots; a sinking or sunk hull is not
   * afloat — whose centre is within range of a paying beacon splits that beacon's pot
   * (BeaconField.payout). The receiver learns nothing but its own XP: no
   * event, no paint.
   */
  private tickBeacons(dtMs: number): void {
    if (!this.beaconsLive()) return;
    const hulls = this.beaconHulls;
    hulls.length = 0;
    for (const ship of this.ships.values()) {
      if (isAfloat(ship.lifecycle) && roleIsParticipant(ship)) hulls.push(ship);
    }
    this.beacons.payout(this.now, dtMs, hulls, this.payBeaconShare);
  }

  /**
   * RADIO BEACON PLACEMENT (Story 10.8, R2 / R10; see the STEP_ORDER row).
   * When the zone clock is in a ring cycle the field has not placed for, the
   * set is REPLACED: `beaconCountFor(cycle)` picks by the anchor rule
   * (`pickFleetAnchor`, inherited from the retired PvE fleet) about the LIVE
   * ring's centre, no farther out than the
   * ring's radius minus `CONFIG.beacons.edgeMarginU` (the whole paying circle
   * inside the ring), clear of land, outside every captain's keep-out disc
   * (`captainDiscs` — `CONFIG.beacons.keepOutU`), max-min against every
   * afloat hull AND the beacons already picked this cycle. There is no retry
   * queue — the ruling is "at 0:00": a pick that cannot clear the discs takes
   * the rule's max-min fallback at once and is LOGGED. A cycle with no
   * beacons (sudden death) clears the set.
   */
  private placeBeacons(): void {
    const zoneStartT = this.zoneStartT;
    if (zoneStartT === null || !this.beaconsLive()) return;
    const cycle = beaconCycleAt(this.now, zoneStartT, this.zoneCfg);
    if (cycle === this.beacons.cycle) return;
    const ring = this.zoneLiveRing;
    const centre = { x: ring.cx, y: ring.cy };
    const maxRadius = Math.max(0, ring.r - CONFIG.beacons.edgeMarginU);
    const hulls: Vec2[] = [];
    for (const s of this.ships.values()) {
      if (isAfloat(s.lifecycle)) hulls.push({ x: s.state.x, y: s.state.y });
    }
    const denied = this.captainDiscs();
    this.beacons.replace(cycle, beaconCycleStartMs(zoneStartT, cycle, this.zoneCfg), (rng, taken) => {
      const at = pickFleetAnchor(centre, maxRadius, this.map.islands, [...hulls, ...taken], denied, rng);
      if (at.fallback) {
        logWarn('beacon.placeFallback', { tick: this.tick, cycle, slot: taken.length, x: Math.round(at.x), y: Math.round(at.y) });
      }
      return at;
    });
  }

  /** Are the scheduled AIRDROPS running? Mirrors `beaconsLive`: the match
   *  is live (`xpEnabled` — so the post-match results window, where the zone
   *  clock still runs, scatters nothing), the zone clock has started, and no
   *  dev smoke switched them off. */
  private dropsLive(): boolean {
    return this.dropsEnabled && this.xpEnabled && this.zoneStartT !== null;
  }

  /**
   * AIRDROP SCATTER (Story 10.9, R1; see the STEP_ORDER row). Every match
   * minute up to the zone clock's current one that has not been scattered
   * yet places its batch (`dropCountFor` — none from `untilMinute` on; the
   * counter still advances), in minute order.
   */
  private spawnDrops(): void {
    const zoneStartT = this.zoneStartT;
    if (zoneStartT === null || !this.dropsLive()) return;
    const minute = dropMinuteAt(this.now, zoneStartT, this.zoneCfg.beatMs);
    for (; this.nextDropMinute <= minute; this.nextDropMinute += 1) {
      this.scatterBatch(this.nextDropMinute);
    }
  }

  /** One minute's batch on its own private sub-stream. A drop that finds no
   *  spot in `placeAttempts` draws is skipped and LOGGED — never thrown. */
  private scatterBatch(minute: number): void {
    const count = dropCountFor(minute, CONFIG.drops);
    if (count <= 0) return;
    const rng = mulberry32((this.dropSeed ^ Math.imul(minute + 1, 0x9e3779b9)) >>> 0);
    const ring = this.zoneLiveRing;
    for (let n = 0; n < count; n += 1) {
      const at = this.pickDropSpot(rng, ring);
      if (at === null) {
        logWarn('drops.placeSkipped', { tick: this.tick, minute, slot: n, attempts: CONFIG.drops.placeAttempts });
        continue;
      }
      const id = `drp-${minute}-${n}`;
      this.drops.set(id, { id, x: at.x, y: at.y, kind: rollKind(rng, CONFIG.drops) });
    }
  }

  /**
   * A uniform point in the live ring's disc of radius `r − radiusU` (sqrt-
   * radius sampling: two draws per attempt), FLOAT32-EXACT like a beacon's,
   * rejected on land (`islandClearance ≤ SPAWN_ISLAND_CLEARANCE`, the spawn
   * ring's own test) and inside any live beacon's signal circle (R1). Null
   * after `placeAttempts` rejections.
   */
  private pickDropSpot(rng: Rng, ring: ZoneRing): Vec2 | null {
    // A ring too small to hold a whole crate places none (review gate, Codex
    // 2026-11-09): clamping the domain to zero would park a crate on the
    // centre with its disc in the storm — reachable only under a dev
    // `zoneOverride` (production rings never shrink below 15 u before 12:00).
    const radius = ring.r - CONFIG.drops.radiusU;
    if (!(radius >= 0)) return null;
    for (let i = 0; i < CONFIG.drops.placeAttempts; i += 1) {
      const r = radius * Math.sqrt(rng.next());
      const a = rng.next() * Math.PI * 2;
      const p = { x: Math.fround(ring.cx + Math.cos(a) * r), y: Math.fround(ring.cy + Math.sin(a) * r) };
      if (islandClearance(p, this.map.islands) <= SPAWN_ISLAND_CLEARANCE) continue;
      if (this.inBeaconKeepOut(p)) continue;
      return p;
    }
    return null;
  }

  /** THE HARD KEEP-OUT (R1): `p` lies strictly inside the signal circle
   *  (`CONFIG.beacons.rangeU`, centre to centre) of a beacon that is charted,
   *  afloat or sinking — any phase but `gone`. */
  private inBeaconKeepOut(p: Vec2): boolean {
    const r2 = CONFIG.beacons.rangeU * CONFIG.beacons.rangeU;
    for (const b of this.beacons.records) {
      if (this.beacons.phaseOf(b, this.now) === 'gone') continue;
      const dx = p.x - b.x;
      const dy = p.y - b.y;
      if (dx * dx + dy * dy < r2) return true;
    }
    return false;
  }

  /**
   * THE WRECK PICKUP (Story 10.9, R2): a sinking PARTICIPANT leaves one crate
   * of kind `'wreck'` at its centre — its `wreckRolls` stat + amount rolls are
   * drawn at PICKUP (`collectDrop`), nothing here. No land / keep-out / ring
   * check — the hull was there; a wreck in the storm is taken by `stormDrops`
   * next tick. Placed whether or not the schedule is switched off
   * (WorldOptions.drops) — but ONLY ONCE THE ZONE HAS STARTED: a sink before
   * `zoneStartT` is a ready-room / sandbox practice sink (a respawning dev or
   * practice hull), never a match death, and a crate there would turn
   * practice sinks into permanent index points.
   *
   * NOR WHILE RESPAWN IS ON (review gate 2026-11-10): a hull that will respawn
   * (`respawnEnabled` — the sandbox, and every phase before `active`) is
   * practicing even after the zone clock starts, and would otherwise sail
   * back over its own wreck and carry the points into the match.
   *
   * A SCUTTLE (`scuttle`, the departing captain's killer-less sink) leaves a
   * crate ONLY when the hull was IN COMBAT (`inCombat`, Eric 2026-11-09);
   * a sink by damage (a hull, a mine, a ram, the storm) always does.
   */
  private placeWreckDrop(ship: ShipRecord, scuttle: boolean): void {
    if (this.zoneStartT === null || this.respawnEnabled || !roleIsParticipant(ship)) return;
    if (scuttle && !inCombat(ship, this.now)) return;
    const k = this.wreckDrops;
    this.wreckDrops += 1;
    const id = `drp-w-${k}`;
    const x = Math.fround(ship.state.x);
    const y = Math.fround(ship.state.y);
    this.drops.set(id, { id, x, y, kind: 'wreck' });
  }

  /**
   * AIRDROP COLLECTION (Story 10.9, R4; see the STEP_ORDER row). Drops in
   * placement order; for each, the afloat hulls in ship insertion order (the
   * `hull` target list); the first PARTICIPANT whose silhouette is within
   * `radiusU` of the crate collects it. A sinking / sunk hull is not in the
   * list (and is re-checked anyway). The list is asked for per drop: the memo
   * answers at once unless a sink bumped its generation.
   */
  private collectDrops(hitTargets: (mask: readonly TargetKind[]) => readonly Target[]): void {
    // Only while the match is live (review gate 2026-11-10; `dropsLive`'s
    // `xpEnabled` arm): the results window grants no points, no re-fold, no
    // `dp` toast.
    if (!this.xpEnabled || this.drops.size === 0) return;
    for (const drop of [...this.drops.values()]) {
      const taker = this.dropTaker(drop, hitTargets(DROP_TAKER_MASK));
      if (taker !== undefined) this.collectDrop(taker, drop);
    }
  }

  /** The first afloat participant whose hull touches `drop`, or undefined. */
  private dropTaker(drop: DropState, hulls: readonly Target[]): ShipRecord | undefined {
    for (const t of hulls) {
      if (t.kind !== 'hull') continue;
      const ship = this.ships.get(t.id);
      if (ship === undefined || !isAfloat(ship.lifecycle) || !roleIsParticipant(ship)) continue;
      if (dropTouches(drop, t.poly, CONFIG.drops.radiusU)) return ship;
    }
    return undefined;
  }

  /**
   * ONE COLLECTION: the grant is rolled NOW (Eric 2026-11-08 — "the bonus is
   * rolled AFTER I pick it up"; `rollPickup` on this World's k-th pickup
   * sub-stream, see `dropSeed`), every roll lands on the hull's `indexBonus`
   * (Story 10.7's seat, uncapped), then the stats re-fold and settle EXACTLY
   * as `convertBank` does (pools, reload clocks, mounts, wake) — read its
   * RE-ENTRANCY note: nothing here holds the ship's `stats` / `wake` across
   * the re-fold. The crate is deleted and the collector alone is told (`dp`).
   */
  private collectDrop(ship: ShipRecord, drop: DropState): void {
    const k = this.dropPickups;
    this.dropPickups += 1;
    const rng = mulberry32((this.dropSeed ^ Math.imul(PICKUP_DROP_K + k, 0x9e3779b9)) >>> 0);
    const rolls = rollPickup(rng, drop.kind, CONFIG.drops);
    for (const [stat, n] of rolls) ship.indexBonus[stat] += n;
    const prevStats = this.refoldCards(ship);
    this.settleRefold(ship, prevStats);
    ship.dropsTaken += 1;
    this.drops.delete(drop.id);
    this.pending.push({ k: 'dp', id: ship.id, t: this.now, g: rolls });
  }

  /** THE STORM TAKES THE AIRDROPS (Story 10.9; see the STEP_ORDER row): every
   *  crate outside the LIVE ring — the ring applyStorm bites outside of — is
   *  deleted. Nothing to do before the zone starts (the ring is the map). */
  private stormDrops(): void {
    if (this.zoneStartT === null || this.drops.size === 0) return;
    const ring = this.zoneLiveRing;
    for (const drop of this.drops.values()) {
      if (isOutside(drop, ring.cx, ring.cy, ring.r)) this.drops.delete(drop.id);
    }
  }

  /**
   * MAKE ONE MULTI-SPECTRAL COUNTERMEASURE cloud (Story 9.3; Eric rulings
   * 2026-10-11, epic-9 amendments 43–46) — `ActivationContext.setCountermeasure`'s
   * body, the ONE writer of World.clouds. Every press makes a NEW cloud at
   * the activating hull's CENTRE (`state` this tick), `bornAt = now`,
   * `until = now + lifeMs`. No lay window, no restart, no
   * refuse-while-live: five copies stack five clouds (amendment 46). A NON-
   * FINITE position (a NaN/Infinity pose — unreachable through inputs.ts's
   * finite-checked intent, guarded anyway) makes NOTHING: a NaN cloud would
   * poison the `cloud` delivery gate and every client's overlay for 15 s
   * (the 8.18 review-gate guard, kept). The hull's own `cloudUntil`
   * stamp (the bot's self-read) advances to this cloud's expiry.
   */
  private makeCloud(ship: ShipRecord): void {
    const { x, y } = ship.state;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    this.cloudSeq += 1;
    const id = `cl${this.cloudSeq}`;
    // STAMPED (Story 10.6, R9 / I6): the owner's SMOKE SCREEN cards NOW set
    // this cloud's life and disc for good — a card taken later never touches
    // a live cloud.
    const { lifeMs, r0, r1 } = ship.stats.smoke;
    const until = this.now + lifeMs;
    this.clouds.set(id, { id, ownerId: ship.id, x, y, bornAt: this.now, until, lifeMs, r0, r1 });
    ship.cloudUntil = until;
  }

  /**
   * COUNTERMEASURE cloud expiry (Story 9.3) — the `stepClouds` STEP_ORDER row
   * (8.18's stepSmoke seat; see the table). An expiry sweep and NOTHING
   * else: every cloud whose `until` has arrived is deleted, base and all —
   * one sweep for the whole store, so an owner's death, redeploy or leave
   * never shortens a cloud's life (amendment 127). No lay, no stamp (the
   * 8.18 in-smoke stamp is gone with amendment 40). NOT the wounded-smoke
   * emitter below (tickSmoke — CONFIG.smoke, the `sm` event).
   */
  private stepClouds(): void {
    for (const [id, cloud] of this.clouds) {
      if (this.now >= cloud.until) this.clouds.delete(id);
    }
  }

  /**
   * THE FOG FIELD (Story 9.10) — the `stepFog` STEP_ORDER row (directly
   * after stepClouds: weather beside weather). (1) No zone timeline yet →
   * no fog (`fogClear`; the practice water never fogs). (2) Otherwise, once
   * per `refreshMs`: redraw the coverage target when its period is up, cut
   * the field at `fogCutForTarget` (the solid-share quantile) over the
   * lattice inside the live ring (slewed at most `cutRatePerS`; the first
   * live refresh rolls in from the lattice maximum, amendment 175) and
   * start a new density-memo EPOCH at this clock (see `fogMemo`). Nothing
   * else — the field itself is pure math over the seed and the clock, and
   * the memo fills lazily as rays touch it.
   */
  private stepFog(): void {
    if (!this.fogCutPinned && this.zoneStartT === null) {
      this.fogClear();
      return;
    }
    if (this.now < this.fogNextRefreshAt) return;
    this.fogNextRefreshAt = this.now + CONFIG.fog.refreshMs;
    this.fogBumpEpoch();
    if (!this.fogCutPinned) this.fogRefreshCut(this.zoneLiveRing);
  }

  /** Back to "no fog": the cut, the pin, the clocks and the share reset and
   *  a fresh epoch starts (resetForMatchStart and the pre-start tick). The
   *  target wander keeps its stream position — it is a stream, not a clock. */
  private fogClear(): void {
    this.fogCutValue = FOG_NO_CUT;
    this.fogCutPinned = false;
    this.fogTarget = 0;
    this.fogNextTargetAt = 0;
    this.fogNextRefreshAt = 0;
    this.fogCoverageShare = 0;
    this.fogBumpEpoch();
  }

  /**
   * THE COVERAGE CONTROLLER (amendment 165's band, re-cut on the field):
   * the target wanders in [coverageMin, coverageMax) every targetPeriodMs
   * (the first draw on the first live refresh); the goal cut is the shared
   * `fogCutForTarget` (the solid-share quantile, amendment 178) over the
   * `quantileLattice`² lattice inside the live ring at THIS instant; the
   * cut steps toward it by at most `cutRatePerS × refreshMs / 1000`. THE
   * ONSET (Eric 2026-10-15: "roll in over ~1 min", then 2026-10-16
   * "faster" — ≈ 15 s since amendment 177): the first live refresh sets the cut to the lattice's
   * MAXIMUM noise + edgeBand — density 0 at every lattice point — and the
   * cut then slews DOWN toward the goal, so banks grow in from their hearts
   * outward (≈ 15 s from a max near 1.0 to a 20–25 % cut at 0.04/s —
   * Eric 2026-10-16 "the onset roll-in should be faster", amendment 177;
   * was ≈ 35 s to a 5 % cut at 0.02/s).
   * The ONE snap: a goal of FOG_NO_CUT (target 0 — fog off) clears at once,
   * never a crawl toward 9. Then the realized share is re-measured for the
   * readouts.
   *
   * THE FINAL CLOSE (review gate): the live ring's radius falls to 0 at the
   * last close, where a lattice degenerates to one point and the quantile
   * to one noise value. The lattice radius is therefore never below
   * `wavelengthU` (`fogLatticeRadius` — coverage control below one bank's
   * size is meaningless), and once `ring.r < wavelengthU / 2` the cut is
   * HELD at its last value: no goal is refreshed (the epoch still bumps in
   * stepFog, so the field keeps rolling under the held cut).
   */
  private fogRefreshCut(ring: ZoneRing): void {
    const cfg = CONFIG.fog;
    if (this.now >= this.fogNextTargetAt) {
      this.fogTarget = this.fogRng.float(cfg.coverageMin, cfg.coverageMax);
      this.fogNextTargetAt = this.now + cfg.targetPeriodMs;
    }
    if (ring.r < cfg.wavelengthU / 2) return; // the final close: hold the cut
    const lattice = this.fogControllerLattice(ring);
    const goal = fogCutForTarget(this.fogField, this.now, lattice, this.fogTarget);
    const maxStep = (cfg.cutRatePerS * cfg.refreshMs) / 1000;
    if (goal >= FOG_NO_CUT) this.fogCutValue = FOG_NO_CUT; // fog off: at once
    else if (this.fogCutValue >= FOG_NO_CUT) this.fogCutValue = this.fogOnsetCut(lattice); // the onset: roll in from no fog
    else this.fogCutValue = clampStep(this.fogCutValue, goal, maxStep);
    this.fogCoverageShare = this.fogMeasureCoverage(ring);
  }

  /**
   * The coverage controller's lattice for `ring`: `fogLattice` over the ring
   * (floored at one bank's radius, `fogLatticeRadius`) KEPT TO THE OCEAN —
   * points past the map radius are dropped in place (amendment 179: the
   * shared density is 0 there, so a point past the rim would count toward the
   * quantile's raw noise but never toward the realized solid share; a small
   * last ring centered near the rim could then under-read its target — the
   * cycle-194 gate, Codex). Allocation-free after the first call: the kept
   * points are the SAME objects, referenced from a second reusable array, so
   * `fogLatticePts` is never truncated and `fogLattice` never re-mints a
   * dropped point on the next refresh (the Edge Case Hunter's reading).
   */
  private fogControllerLattice(ring: ZoneRing): { x: number; y: number }[] {
    const pts = fogLattice(ring.cx, ring.cy, fogLatticeRadius(ring), CONFIG.fog.quantileLattice, this.fogLatticePts);
    const kept = this.fogOceanPts;
    const r2 = this.map.radius * this.map.radius;
    let k = 0;
    for (const p of pts) {
      if (p.x * p.x + p.y * p.y > r2) continue;
      kept[k] = p;
      k += 1;
    }
    kept.length = k;
    return kept;
  }

  /** The onset cut: the lattice's maximum noise + edgeBand, so density is 0
   *  at every lattice point and the slew down grows the banks in. */
  private fogOnsetCut(lattice: readonly { x: number; y: number }[]): number {
    let max = -Infinity;
    for (const p of lattice) max = Math.max(max, fogNoiseAt(this.fogField, p.x, p.y, this.now));
    return (Number.isFinite(max) ? max : 0) + CONFIG.fog.edgeBand;
  }

  /** The realized fogged share over the lattice inside `ring` under the live
   *  cut: points at SOLID fog (density ≥ FOG_SOLID_DENSITY — what the
   *  quantile controls since amendment 178) over all points. 0 with no fog
   *  or an empty lattice. */
  private fogMeasureCoverage(ring: ZoneRing): number {
    if (this.fogCutValue >= FOG_NO_CUT) return 0;
    const lattice = this.fogControllerLattice(ring);
    if (lattice.length === 0) return 0;
    let fogged = 0;
    for (const p of lattice) if (fieldDensityAt(this.fogField, p.x, p.y, this.now, this.fogCutValue) >= FOG_SOLID_DENSITY) fogged += 1;
    return fogged / lattice.length;
  }

  /**
   * WOUNDED SMOKE emission (Story 4.4, amendments 40-50): every ALIVE hull —
   * the smoking ship's own captain included (amendment 46: the row has no
   * special case) — whose hp FRACTION sits below
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
    // A HURT RADIO BEACON SMOKES LIKE A SHIP (Story 10.8, R11): the SAME
    // anonymous `sm` row — {k,x,y,tier} and nothing else — on the same bands
    // and the same throttle, at the beacon's already-public position. The row
    // carries no source handle, so a beacon's puff and a hull's are one kind
    // to every observer and to the registry's gate.
    this.beacons.smoke(this.now, (x, y, tier) => this.pending.push({ k: 'sm', x, y, tier }));
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
    // A posed hull (Story 9.15, dev only) comes back at its pose; every other
    // hull back on the ring.
    const p = this.placement(ship.id, ship.devPose, () => {
      const occupied = [...this.ships.values()]
        .filter((s) => s.id !== ship.id && isAfloat(s.lifecycle))
        .map((s) => ({ x: s.state.x, y: s.state.y }));
      return pickSpawn(this.map, occupied, this.rng, this.spawnPhase);
    });
    ship.state.x = p.x;
    ship.state.y = p.y;
    ship.state.heading = p.heading;
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
    // A fresh life never inherits an open boost window — nor either slow or
    // a HULL REPAIR pool (founderSinking already zeroed them; kept symmetric
    // for directed callers).
    ship.boostUntil = 0;
    World.clearShiftClocks(ship); // ...nor a HUNKER window or a stream clock (Story 8.15)
    World.resetBattery(ship); // ...nor a previous life's turret angles, reloads or secondaries heat (Story 10.4)
    World.clearRepair(ship);
    World.readyAbilities(ship); // ...and both cooldown abilities ready (Story 10.5)
    // ...nor the dead life's combat clock (amendment 47).
    ship.lastDamagedAt = this.now;
    ship.slowedUntil = 0;
    ship.slowFactor = 1; // the fouling factor clears with its clock (amendment 81)
    ship.fouledUntil = 0; // the foul zone's stamp (Story 9.4)
    ship.dazzledUntil = 0; // ...nor the flash's dazzle (Story 10.9)
    // ...nor a previous life's contributors: creditKill already cleared the
    // ledger at the sink, kept symmetric here for directed callers.
    ship.damageFrom.clear();
    // ...nor a stale grounding read (the redeployShip rule): the respawn
    // placement is island-clear, so the hull is not aground.
    ship.landContact = false;
    World.clearContactState(ship); // ...nor a land edge (Story 9.5)
    World.clearContactTally(ship); // ...nor the dead life's contact tally (Story 9.5)
    // ...nor an own-cloud stamp (Story 9.3; sinkShip already cleared it —
    // kept symmetric here for directed callers).
    ship.cloudUntil = 0;
    ship.draft = 0; // Story 8.19: a respawned hull rides no wake until stepShips stamps it
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
    // Boons AND the whole card economy PERSIST across a waiting-phase respawn, so the fresh
    // loadout re-derives with their slot effects replayed — the SAME shared
    // derivation the client runs (slotsWithCards ≡ loadoutFor at zero cards,
    // and over the spawn SEED alone, byte-identical).
    ship.loadout = slotsWithCards(ship.stats, ship.cards, this.catalog, ship.shift);
    // The respawn TELEPORTS the hull (Story 4.12, amendment 200): the old
    // life's water detaches into the orphan store — where it keeps disclosing
    // and ageing out, a fading track with nothing attached — and the new life
    // starts a fresh ribbon (a kept one would chain a bogus wreck→spawn
    // segment across the map).
    this.detachWake(ship);
    this.pending.push({ k: 'spawn', id: ship.id, x: p.x, y: p.y });
  }
}
