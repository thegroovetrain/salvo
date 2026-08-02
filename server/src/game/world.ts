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
  HOOK_REGISTRY,
  NO_BOONS,
  applySlotEffect,
  boonBehaviors,
  boostedKinematics,
  buildDeck,
  burstVictims,
  consumeAcquisition,
  drawOffer,
  effectiveStats,
  equipmentMaxAmmo,
  generateMap,
  hookKinematics,
  isAcquisitionDef,
  loadoutFor,
  slotsWithBoons,
  hullEnvelope,
  hullSilhouette,
  mulberry32,
  pierceDamage,
  resolveBoons,
  resolveShipPose,
  returnCards,
  scrubAcquisitions,
  slowedKinematics,
  stepShell,
  stepShip,
  transformPolygon,
  wrapPositive,
  rollZoneRings,
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
  type HullEnvelope,
  type HullId,
  type HullTarget,
  type InputMsg,
  type LoadoutSlot,
  type Rng,
  type ShellOutcome,
  type ShellState,
  type ShipState,
  type StarShellsMode,
  type Vec2,
  type ZonePhase,
  type ZoneRing,
  type ZoneState,
  type ZoneTimeline,
} from '@salvo/shared';
import {
  EQUIPMENT,
  addMine,
  checkMineTriggers,
  mineBlastVictims,
  type ActivationContext,
  type ActivationDenial,
  type ActivationResult,
  type MineState,
} from './equipment/index.js';
import type { BurstSubject } from './signals.js';
import { InputStore, clampFireTime, neutralInput } from './inputs.js';
import { DroneController } from './drones.js';
import { pickSpawn } from './spawn.js';

const TAU = Math.PI * 2;

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
 * ({id,x,y,r,until,by,mode}), materialized per observer by the litzone signal
 * row.
 */
export interface LitZone {
  id: string;
  ownerId: string; // the firer — the ONLY observer the zone reveals for
  x: number; // u — zone center (the burst point)
  y: number; // u
  r: number; // u — lit radius
  until: number; // ms — server time the zone expires
  /**
   * The firer's star-shell DOCTRINE at zone-spawn time (Story 2.8): 'standard'
   * unless the owner held INCENDIARY/DAZZLE when the flare stopped (owner
   * lookup at spawn; a vacated owner falls back to 'standard' — the CONFIG-base
   * rule). As of Story 2.9 (amendment 50) this rides the wire on LitZoneView
   * to EVERY observer who sees the circle — counterplay over concealment: the
   * zone's nature is observable behavior of the fired shell, not a build
   * leak. Zone-spawn stamping (not fire-time) is deliberate — the burn/dazzle
   * zone effects key off this same field, so the wire mode can never disagree
   * with what the zone actually does.
   */
  mode: StarShellsMode;
}

/**
 * A live decoy buoy (Story 1.8): a STATIONARY server entity dropped astern of
 * its Mine Layer owner. To any fogged non-owner it radar-paints EXACTLY like
 * the owner's own ship (the blip row's counterIntel in signals.ts — same gate,
 * same wire shape, id = the OWNER's ship id); the truth (the buoy for what it
 * is) travels as the contact-like `decoys` frame channel (DecoyView) to the
 * owner / truesighted enemies / spectators. ONE live per owner (spawnDecoy
 * silently replaces); survives its owner's death (litZone precedent) and dies
 * only by natural expiry (expireDecoys). NEVER a collision subject: shells and
 * bursts pass through it, it never trips mines, the storm ignores it.
 */
export interface Decoy {
  id: string;
  ownerId: string; // the Mine Layer that dropped it — the ship id its blips impersonate
  x: number; // u — fixed drop point (stationary forever after)
  y: number; // u
  until: number; // ms — server time the buoy expires
}

/** Everything the server tracks per ship, on top of the shared kinematic state. */
export interface ShipRecord {
  id: string;
  name: string;
  isDrone: boolean;
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
   * THE DECK (Story 2.8, amendment 38): this player's card multiset — the
   * universal lines + carried-equipment subdecks + absent-equipment
   * acquisitions (sim/deck.ts buildDeck over the FRESH loadout's fit). Every
   * level's offer is DRAWN from it (grantPoint), unchosen/swapped-out cards
   * RETURN to it (spendPoint), an acquisition pick purges + scrubs it.
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
   * FIFO queue of pre-drawn BOON offers, one per unspent banked level (Story
   * 2.7). points = offers.length — this queue is the SINGLE SOURCE OF TRUTH for
   * the level count (OwnShip.pts derives from it). Each offer is drawn once at
   * earn-time (sim/deck.drawOffer against this ship's deck+stream) so reopening
   * the refit window can't reroll; the front offer is the one surfaced on the
   * wire. Wiped by redeployShip (a fresh match = fresh build).
   */
  offers: BoonOffer[];
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
   * like upgrades/offers/boons.
   */
  xpMs: number;
  /** Levels COMPLETED (integer). Mirrored onto OwnShip.lvl (self-private);
   *  moves only inside grantXp's bank loop. Same lifecycle as `xpMs`. */
  level: number;
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
  alive: boolean;
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
   * ms — server-clock time the active speed-boost window ends (Story 1.6);
   * 0 = inactive. Written ONLY by the speedBoost Equipment row's activate();
   * read by stepShips (now < boostUntil => boosted kinematics cap) and mirrored
   * onto OwnShip.boostUntil (owner-only) by frames.ts. RESET to 0 on spawn/
   * respawn/redeploy so a fresh life never inherits a still-open window.
   */
  boostUntil: number;
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
  kills: number; // hulls this ship has sunk
  deaths: number; // times this ship has been sunk
  damageDealt: number; // hp dealt to OTHER hulls (self-hits and storm excluded)
}

export class World {
  readonly map: GameMap;
  readonly playerCap: number;
  readonly ships = new Map<string, ShipRecord>();
  /** All in-flight ballistics (gun shells AND torpedoes), keyed by id. */
  readonly shells = new Map<string, ShellState>();
  /** All live dropped mines (static points), in drop order. */
  readonly mines = new Map<string, MineState>();
  /** All live star-shell lit zones (static circles), in burst order (Story 1.7). */
  readonly litZones = new Map<string, LitZone>();
  /** All live decoy buoys (static points), in drop order — max one per owner
   *  (spawnDecoy evicts the owner's previous buoy) (Story 1.8). */
  readonly decoys = new Map<string, Decoy>();
  readonly inputs = new InputStore();
  /** Drives drone hulls through the normal input path (see game/drones.ts). */
  readonly drones: DroneController;

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
   * THE SAME-CLICK SALVO LEDGER (Story 2.8 review, P1): salvo tag → the ids of
   * hulls that have ALREADY taken a damage application from that salvo. A
   * multi-barrel click's fanned bursts overlap at practical ranges, so without
   * this a single hull takes barrels× damage from one click (3 × 25 = 75 > the
   * 70hp lightest hull) — a breach of the ratified no-one-click-kill
   * guardrail. Entries are dropped as soon as the salvo has no shell left in
   * flight (releaseSalvo), so the map is bounded by live salvos.
   */
  private readonly salvoHits = new Map<string, Set<string>>();
  /**
   * OPEN INCENDIARY DoT EVENT BUCKETS (Story 2.8 review, P4), keyed by
   * dotKey(zone owner, victim): the applied-but-not-yet-reported DoT for that
   * pair and the server time its window opened. hp is ALREADY deducted — this
   * only defers the victim-private `dmg` event (see applyZoneEffects).
   */
  private readonly dotBuckets = new Map<string, { victimId: string; amount: number; since: number }>();
  private mineSeq = 0;
  private litZoneSeq = 0;
  private decoySeq = 0;
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

  constructor(
    seed: number,
    playerCap: number = CONFIG.match.fillTo,
    zoneCfg: ZoneTimeline = CONFIG.zone,
    opts: WorldOptions = {},
  ) {
    this.hookRegistry = opts.hookRegistry ?? HOOK_REGISTRY;
    this.boonCatalog = opts.boonCatalog ?? BOON_CATALOG;
    this.playerCap = playerCap;
    this.seed = seed;
    this.map = generateMap(seed, playerCap);
    this.rng = mulberry32((seed ^ 0x9e3779b9) >>> 0); // spawn stream, decorrelated from mapgen
    this.zoneCfg = zoneCfg;
    this.zoneSeeds = opts.zoneSeeds;
    // Drone steering stream, decorrelated again from mapgen + spawn.
    this.drones = new DroneController(this, (seed ^ 0x85ebca6b) >>> 0);
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


  /** Events emitted during the last completed step (and joins just before it). */
  get tickEvents(): readonly GameEvent[] {
    return this.events;
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
   *  pass their picked ShipClassId; drones pass a drone hull id — the envelope
   *  source (hullEnvelope) is the ONLY thing that differs between them. */
  addShip(id: string, name: string, isDrone = false, hullId: HullId = 'torpedoBoat'): ShipRecord {
    const p = pickSpawn(this.map, [...this.ships.values()].map((s) => ({ x: s.state.x, y: s.state.y })), this.rng);
    const cls = hullEnvelope(hullId);
    const stats = effectiveStats(cls);
    // Per-hull loadout (Story 1.6): the class fit, or the universal drone fit.
    const loadout = loadoutFor(hullId, stats);
    const rec: ShipRecord = {
      id,
      name,
      isDrone,
      hullId,
      cls,
      hullPoly: [],
      prevPose: { x: p.x, y: p.y, heading: 0, speed: 0 },
      // THE DECK (2.8): over the fresh fit; drones never get one (pinned).
      deck: isDrone ? EMPTY_DECK : buildDeck(this.boonCatalog, World.carriedEquipment(loadout)),
      deckRng: this.deckRngFor(this.joinSeq++),
      offers: [],
      xpMs: 0,
      level: 0,
      boons: [],
      boonDefs: NO_BOONS,
      boonBehaviors: NO_BEHAVIORS,
      stats,
      state: { x: p.x, y: p.y, heading: Math.atan2(-p.y, -p.x), speed: 0 },
      hp: stats.maxHp,
      alive: true,
      input: neutralInput(),
      tickIntents: [],
      lastAckSeq: 0,
      lastFireSeq: 0,
      lastActSeq: 0,
      boostUntil: 0,
      slowedUntil: 0,
      dazzledUntil: 0,
      rttMs: null,
      lastFireT: 0,
      respawnAt: 0,
      sweepAngle: 0,
      prevSweepAngle: 0,
      seenBallistics: new Set(),
      torpDirs: new Map(),
      loadout,
      kills: 0,
      deaths: 0,
      damageDealt: 0,
    };
    this.ships.set(id, rec);
    if (isDrone) this.drones.add(id);
    this.pending.push({ k: 'spawn', id, x: p.x, y: p.y });
    return rec;
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

  /** Remove a ship entirely (client left). */
  removeShip(id: string): void {
    this.ships.delete(id);
    this.inputs.remove(id);
    this.drones.remove(id);
  }

  /**
   * Countdown→active transition (match lifecycle): clear the practice field —
   * all shells and mines gone, per-observer ballistic memory wiped, queued
   * events dropped — then redeploy EVERY hull to a fresh spawn-ring placement
   * with full hp and full ammo pools. Inputs are kept (players keep driving
   * through the transition); each ship emits a spawn event so clients snap
   * their camera/prediction to the teleport. Roster/welcome state is untouched.
   */
  resetForMatchStart(): void {
    this.shells.clear();
    this.mines.clear();
    this.litZones.clear(); // practice-field zones never light the real match (mines precedent)
    this.decoys.clear(); // practice-field buoys never lie into the real match (Story 1.8)
    this.pending = [];
    const placed: Vec2[] = [];
    for (const ship of this.ships.values()) this.redeployShip(ship, placed);
  }

  /** Fresh-match state for one hull: ring placement, full hp, full ammo pools.
   *  THE BUILD IS WIPED: a redeploy is the countdown→active match boundary, and
   *  a fresh match means a fresh build — anything farmed in the practice-room
   *  waiting phase (drone kills) must not carry a head start into the real
   *  match. (respawn() below, waiting-phase only, PRESERVES the build.) */
  private redeployShip(ship: ShipRecord, placed: Vec2[]): void {
    const p = pickSpawn(this.map, placed, this.rng);
    placed.push(p);
    ship.state.x = p.x;
    ship.state.y = p.y;
    ship.state.heading = Math.atan2(-p.y, -p.x);
    ship.state.speed = 0;
    ship.offers = [];
    // XP progress dies with the build (Story 2.6): the countdown→active
    // boundary is a fresh match, so nothing farmed in the ready room (a drone
    // kill's XP, or waiting-phase seconds) carries a head start into it.
    // respawn() below, waiting-phase only, PRESERVES both.
    ship.xpMs = 0;
    ship.level = 0;
    // Boons are wiped WITH offers (Story 2.5): the match boundary means a
    // fresh build — respawn() below, waiting-phase only, preserves.
    ship.boons = [];
    ship.boonDefs = NO_BOONS;
    ship.boonBehaviors = NO_BEHAVIORS;
    ship.stats = effectiveStats(ship.cls);
    ship.hp = ship.stats.maxHp;
    ship.alive = true;
    ship.respawnAt = 0;
    // A fresh life never inherits an open boost window — nor a slow or dazzle.
    ship.boostUntil = 0;
    ship.slowedUntil = 0;
    ship.dazzledUntil = 0;
    // lastFireSeq / lastActSeq are deliberately NOT reset — a reset fires a
    // phantom shot / phantom boost (the stored input's fireSeq/actSeq would read
    // as a fresh click/press on this tick).
    ship.seenBallistics.clear();
    ship.torpDirs.clear();
    ship.loadout = loadoutFor(ship.hullId, ship.stats);
    // THE DECK is rebuilt over the FRESH fit (Story 2.8): a fresh match means a
    // fresh deck — but the deck STREAM is deliberately NOT reseeded (ship.
    // deckRng persists), so a player's whole-session draw sequence stays a pure
    // function of (mapSeed, join ordinal, draw count). Drones keep EMPTY_DECK.
    ship.deck = ship.isDrone
      ? EMPTY_DECK
      : buildDeck(this.boonCatalog, World.carriedEquipment(ship.loadout));
    ship.kills = 0;
    ship.deaths = 0;
    ship.damageDealt = 0;
    this.pending.push({ k: 'spawn', id: ship.id, x: p.x, y: p.y });
  }

  /**
   * Sink a ship: dead, hp 0, respawn scheduled (only while respawnEnabled —
   * in the active match phase the dead transition to spectators instead),
   * death counted. Attributes a kill (and its XP, which banks a point on every
   * level crossed) to `by` when it names a different ship still in the room —
   * a DEAD killer (mutual destruction) still gets both; storm (`by` undefined)
   * and self-kills grant nothing by construction. Combat routes damage through
   * here; tests drive it directly.
   */
  sinkShip(id: string, by?: string): void {
    const ship = this.ships.get(id);
    if (!ship || !ship.alive) return;
    ship.alive = false;
    ship.hp = 0;
    ship.state.speed = 0;
    // Close any open speed-boost window at the instant of death (Story 1.6): a
    // future boostUntil must not ride the owner's frames through the death gap,
    // where it would paint active-boost HUD chrome on a dead ship. The slow and
    // dazzle marks die with it (Story 2.8) — same dead-chrome rule.
    ship.boostUntil = 0;
    ship.slowedUntil = 0;
    ship.dazzledUntil = 0;
    ship.deaths += 1;
    ship.respawnAt = this.respawnEnabled ? this.now + CONFIG.ship.respawnDelay : 0;
    if (by && by !== id) {
      const killer = this.ships.get(by);
      if (killer) {
        killer.kills += 1;
        this.grantXp(killer, World.killXpLevels(ship));
      }
    }
    this.pending.push({ k: 'sunk', id, by });
  }

  /**
   * Levels' worth of XP a kill on `victim` pays (Story 2.6, amendment 31): a
   * human captain is the full `CONFIG.xp.killLevels`; a drone pays its SIZE
   * TIER (¼ / ⅓ / ½), read off the victim's existing hull id — the PvE tier
   * fractions' first real consumer, with no new drone state. An unknown hull
   * id pays nothing (fail-closed).
   */
  private static killXpLevels(victim: ShipRecord): number {
    if (!victim.isDrone) return CONFIG.xp.killLevels;
    const tiers: Partial<Record<HullId, number>> = CONFIG.xp.droneTierLevels;
    return tiers[victim.hullId] ?? 0;
  }

  /**
   * THE one XP entry point (Story 2.6): add `levels` worth of XP to a ship and
   * bank every threshold it crosses. Integer ms throughout — a kill's value is
   * rounded ONCE here, so a ⅓-level drone kill is a fixed 20000ms and three of
   * them are exactly one level.
   *
   * DRONES NEVER ACCRUE (the ratified bugfix): the guard sits in the credit
   * path itself, so no caller — passive tick, kill credit, or a future one —
   * can hand a drone XP, an offer array, or a `pt` event.
   *
   * The bank loop is a WHILE: one grant may cross several levels (a kill on
   * top of near-full progress, or a kill worth > 1 level), and each crossing
   * banks its own point + pre-rolled offer through the unchanged grantPoint.
   * The remainder always carries — no XP is ever snapped away (amendment 32).
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
    if (ship.isDrone || !Number.isFinite(ms) || ms <= 0) return;
    ship.xpMs += ms;
    while (ship.xpMs >= CONFIG.xp.levelMs) {
      ship.xpMs -= CONFIG.xp.levelMs;
      ship.level += 1;
      this.grantPoint(ship);
    }
  }

  /**
   * Level reward (Story 2.8, THE DECK MODEL): DRAW one offer from this ship's
   * own deck on its own persistent stream. A non-empty draw banks the offer
   * (pts === offers.length stays the single source of truth) and queues the
   * self-private `pt` event; an EMPTY draw (deck exhausted — pinned as
   * unreachable within production match parameters) banks NOTHING and emits NO
   * `pt`: the level still incremented (addXpMs already did), but an offer-less
   * level must not advertise TAB-to-refit. Reopening the refit window can
   * never reroll — spendPoint only ever consumes the queue front (FR19).
   */
  private grantPoint(killer: ShipRecord): void {
    const { deck, offer } = drawOffer(killer.deck, killer.deckRng, this.boonCatalog);
    killer.deck = deck;
    if (offer.length === 0) return; // empty deck: level up, no offer, no toast
    killer.offers.push(offer);
    this.pending.push({ k: 'pt', id: killer.id });
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
   * DOCTRINE SWAP (amendments 38/44): when the def names an exclusiveWith
   * rival CURRENTLY held, ONE occurrence of the rival id leaves `boons` before
   * the new id lands (stat stacks apply under either doctrine — only the
   * doctrine card itself swaps). The removed id is RETURNED to the caller so
   * spendPoint can put the rival's card back in the deck (ping-pong legal).
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
   * Fail-closed: an id the world's catalog cannot resolve appends (the wire
   * mirrors it; clients drop it at resolve) but applies nothing. Public so
   * directed tests (and the spend path) can drive it.
   */
  applyBoon(ship: ShipRecord, boonId: string): string | null {
    // Own-property gate (fail-closed): a plain-object catalog answers
    // `this.boonCatalog['constructor']` with Object.prototype.constructor —
    // not undefined, and with no `effects` to iterate.
    const def = Object.hasOwn(this.boonCatalog, boonId) ? this.boonCatalog[boonId] : undefined;
    const swappedOut = World.swapOutRival(ship, def);
    ship.boons.push(boonId);
    ship.boonDefs = resolveBoons(ship.boons, this.boonCatalog);
    ship.boonBehaviors = ship.boonDefs.length === 0 ? NO_BEHAVIORS : boonBehaviors(ship.boonDefs);
    const prevStats = ship.stats;
    ship.stats = effectiveStats(ship.cls, ship.boonDefs);
    if (def?.healOnGrant === true && ship.alive) {
      const delta = Math.max(0, ship.stats.maxHp - prevStats.maxHp);
      ship.hp = Math.min(ship.hp + delta, ship.stats.maxHp);
    }
    // hp invariant: a maxHp-LOWERING fit may not leave hp above the cap.
    ship.hp = Math.min(ship.hp, ship.stats.maxHp);
    if (def !== undefined) {
      for (const effect of def.effects) applySlotEffect(ship.loadout, effect, ship.stats);
    }
    this.reconcilePools(ship, prevStats);
    return swappedOut;
  }

  /** The doctrine-swap half of applyBoon (amendments 38/44): when `def` names
   *  an exclusiveWith rival CURRENTLY held, remove ONE occurrence of the rival
   *  id and report it (the caller returns its card to the deck). */
  private static swapOutRival(ship: ShipRecord, def: BoonDef | undefined): string | null {
    if (def?.exclusiveWith === undefined) return null;
    const at = ship.boons.indexOf(def.exclusiveWith);
    if (at < 0) return null;
    ship.boons.splice(at, 1); // ONE occurrence — the rival's single card
    return def.exclusiveWith;
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
   * Wire entry point for MSG.spend: consume ONE banked level. Validate-
   * everything like submitInput, fail-closed — unknown ship, empty bank, or a
   * malformed choice returns false with the queue untouched. `choice` indexes
   * the FRONT offer, bounded by that offer's ACTUAL length (4 against the
   * production catalog, so digit 4 is live — Story 2.7; a short offer from a
   * small injected catalog bounds itself). Levels ARE spendable while dead
   * (builds persist across waiting-phase respawns — same precedent as the dead
   * killer's reward).
   *
   * The fitted boon is applied through applyBoon (the 2.5 seam, now live) and
   * the SELF-PRIVATE `bn` event is queued HERE, not inside applyBoon: a
   * directed applyBoon (tests, future scripted grants) must stay event-free —
   * "a spend happened" is a property of this path only.
   */
  spendPoint(id: string, rawChoice: unknown): boolean {
    const ship = this.ships.get(id);
    if (!ship || ship.offers.length === 0) return false;
    if (typeof rawChoice !== 'number' || !Number.isInteger(rawChoice)) return false;
    const front = ship.offers[0];
    if (rawChoice < 0 || rawChoice >= front.length) return false;
    ship.offers.shift();
    this.settleSpend(ship, front, rawChoice);
    return true;
  }

  /** The spend's application half: give back the unchosen cards, fit the pick
   *  (returning a swapped-out doctrine rival to the deck), queue the
   *  self-private `bn`, and run the acquisition bookkeeping when the pick
   *  filled the R slot. Split from spendPoint (complexity budget). */
  private settleSpend(ship: ShipRecord, front: BoonOffer, choice: number): void {
    const boon = front[choice];
    // THE DECK's give-back (Story 2.8): the 3 unchosen cards return to the
    // pool; the chosen card is consumed (never returned) — the deck visibly
    // thins over a match by exactly the cards fitted.
    ship.deck = returnCards(ship.deck, front.filter((_, i) => i !== choice));
    const swappedOut = this.applyBoon(ship, boon);
    // Doctrine swap (amendment 44): the swapped-out rival's card returns to
    // the deck — doctrine can ping-pong across a match.
    if (swappedOut !== null) ship.deck = returnCards(ship.deck, [swappedOut]);
    this.pending.push({ k: 'bn', id: ship.id, boon });
    // Acquisition pick (amendments 38/43): the R slot is PERMANENT — the
    // acquired subdeck shuffles in, every remaining acquisition card purges,
    // and banked offers scrub + refill deterministically on this same stream.
    const def = Object.hasOwn(this.boonCatalog, boon) ? this.boonCatalog[boon] : undefined;
    if (def !== undefined && isAcquisitionDef(def)) this.consumeAcquisitionPick(ship, def);
  }

  /**
   * The acquisition-pick deck bookkeeping (Story 2.8, amendments 38/43), run
   * AFTER applyBoon installed the equipment: shuffle the acquired equipment's
   * subdeck into the pool + purge every remaining acquisition card
   * (consumeAcquisition — the R slot can never fill again), then scrub the
   * now-dead acquisition cards out of every still-BANKED offer, refilling each
   * scrubbed offer back to size from the deck in offer order
   * (scrubAcquisitions — deterministic on this ship's own stream, triggered
   * only by this ship's own pick: NOT a reroll, FR19 untouched).
   *
   * SCRUBBED-TO-EMPTY OFFERS ARE REMOVED (Story 2.8 review, P5): a banked
   * offer can be 100% acquisition cards, and an exhausted deck refills it with
   * NOTHING. A zero-card offer still counted in `pts` (pts === offers.length)
   * but spendPoint bounds `choice` by front.length — so a zero-card FRONT can
   * never be consumed and the whole FIFO deadlocks forever. Dropping it MIRRORS
   * the ratified empty-deck rule in grantPoint (an empty draw banks no offer:
   * the level still happened, there is just nothing to fit) — pts falls with
   * offers.length and the queue stays spendable.
   */
  private consumeAcquisitionPick(ship: ShipRecord, def: BoonDef): void {
    const fill = def.effects.find((e) => e.kind === 'slotFill');
    if (fill === undefined || fill.kind !== 'slotFill') return;
    ship.deck = consumeAcquisition(ship.deck, this.boonCatalog, fill.equipmentId);
    const scrubbed = scrubAcquisitions(ship.deck, this.boonCatalog, ship.offers, ship.deckRng);
    ship.deck = scrubbed.deck;
    ship.offers = scrubbed.offers.filter((offer) => offer.length > 0);
  }

  /** Advance the simulation one fixed step (default SIM_DT = 50ms). */
  step(dtMs: number = CONFIG.tick.simDtMs): void {
    this.tick += 1;
    this.now += dtMs;
    const dt = dtMs / 1000;

    // Drones write their inputs through the same store humans use, so they are
    // picked up by applyInputs exactly like any client this tick.
    this.drones.tick();
    this.applyInputs();
    this.stepShips(dt);
    this.resolveCollisions();
    // Storm: post-move positions decide who is outside the (damage-only) zone.
    // The physical map boundary stays at mapRadius — ships freely sail into the
    // storm; the zone only bites HP.
    this.applyStorm(dt);
    // Ballistics + mines both test against post-move hulls (built once).
    const hulls = this.aliveHulls();
    this.stepShells(dt, hulls);
    // Self-propelled mines creep BEFORE the trigger scan (Story 2.8) — a
    // deliberate step-order position: a mine that crawls into trigger range
    // this tick trips this tick, against the same post-move hulls.
    this.creepMines(dt);
    this.stepMines(hulls);
    // Star-shell doctrine zone effects (Story 2.8): incendiary DoT + dazzle
    // marking, against post-move centers, BEFORE the expiry sweep so a zone
    // burns/dazzles through its final tick.
    this.applyZoneEffects(dt);
    // Lit zones (Story 1.7): natural-expiry sweep, positioned with the other
    // static-entity resolution (the mines precedent). Zones are SPAWNED inside
    // stepShells (resolveBurst on a star shell) and deliberately survive their
    // owner's death — expiry is the only way out.
    this.expireLitZones();
    // Decoy buoys (Story 1.8): the same natural-expiry law, swept beside the
    // zones. Buoys are SPAWNED by the decoy ability row (activationControl) and
    // survive their owner's death — expiry (or owner replacement) is the only
    // way out.
    this.expireDecoys();
    this.fireControl(dtMs);
    // Ability activation (Story 1.6): the actSeq sibling of fireControl, resolved
    // in the same step-order position — both turn this tick's stored input intent
    // into activations through the single sinking gate.
    this.activationControl();
    // Radar: the sweep advances here; the per-observer paint (blips) happens
    // at frame-build time in perception.ts using [prevSweepAngle, sweepAngle).
    this.advanceSweeps(dtMs);
    this.processRespawns();
    // Passive XP (Story 2.6) — DELIBERATE step-order position: dead LAST, after
    // respawns and before the event swap. After respawns so a hull that came
    // back this very tick is already alive for its own accrual (the alive gate
    // reads post-respawn truth, not a one-tick-stale one); before the swap so a
    // level banked here publishes its `pt` event on THIS tick's frame rather
    // than trailing into the next one. Nothing downstream in the step reads XP,
    // so no other system's behavior can depend on where it sits.
    this.tickXp(dtMs);

    // Publish this tick's events (including joins/sinks queued between steps).
    this.events = this.pending;
    this.pending = [];
    // Publish this tick's denied presses (Story 1.10) — same swap discipline.
    this.tickDenials = this.pendingDenials;
    this.pendingDenials = new Map();
  }

  /**
   * Queue a SELF-PRIVATE wire denial for one refused press (Story 1.10 —
   * FR12's "denied fire is never silent"). Maps the row's internal denial
   * onto the wire vocabulary per channel: 'out-of-arc' and 'blocked' pass
   * through; an empty pool reads 'cooling' on the WEAPON click channel (the
   * round is reloading — with the shared ammo machine an empty weapon pool
   * always has its reload running) and 'no-ammo' on the ABILITY channel (no
   * charge). The gate's 'dead'/'empty-slot' refusals never reach the wire
   * (client-predictable / honest-client-unreachable). Drones have no client,
   * so their denials are never queued. `seq` is the press identity the
   * client dedups on (fireSeq for clicks, actSeq for ability presses).
   */
  private queueDenial(
    ship: ShipRecord,
    slot: number,
    seq: number,
    denial: ActivationDenial,
    channel: 'weapon' | 'ability',
  ): void {
    if (ship.isDrone) return;
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
    return null; // 'dead' / 'empty-slot' — gate refusals stay server-internal
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
    }
  }

  /** Kinematics for every living hull (shared stepShip, same as prediction).
   *  EFFECTIVE kinematics (maxSpeed upgrade); the client predictor steps with
   *  the same effectiveStats() result, so prediction stays in lockstep. */
  private stepShips(dt: number): void {
    for (const ship of this.ships.values()) {
      if (!ship.alive) continue;
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
    }
  }

  /**
   * Resolve each candidate pose against islands + the map edge via the shared
   * pose-validity rollback (sim/collision.ts) — the SAME function the client
   * Predictor runs, so prediction never diverges on rocks or the boundary.
   * islandSpeedMult is applied ONCE per tick here (the call site) when the ship
   * touched an island or pressed the boundary. hullPoly doubles as the transform
   * scratch (aliveHulls rewrites it for this tick's ballistic/mine tests).
   */
  private resolveCollisions(): void {
    for (const ship of this.ships.values()) {
      if (!ship.alive) continue;
      const { contact } = resolveShipPose(
        ship.prevPose,
        ship.state,
        this.map.islands,
        this.map.radius,
        hullSilhouette(ship.hullId),
        ship.hullPoly,
      );
      if (contact) ship.state.speed *= CONFIG.ship.islandSpeedMult;
    }
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
   */
  private applyStorm(dt: number): void {
    if (this.zoneStartT === null || !this.damageEnabled) return;
    const ring = this.zoneLiveRing;
    const bite = CONFIG.zone.stormDps * dt;
    for (const ship of this.ships.values()) {
      if (!ship.alive || !isOutside(ship.state, ring.cx, ring.cy, ring.r)) continue;
      ship.hp -= bite;
      if (ship.hp <= 0) this.sinkShip(ship.id); // by=undefined — the storm has no killer
    }
  }

  /** Alive hull silhouette polygons (post-move) that shells and mines test
   *  against this tick. Each ship's transformed verts are written into its own
   *  hullPoly scratch (transformPolygon reuses the array), so the 20Hz loop
   *  allocates only the small per-tick target list. */
  private aliveHulls(): HullTarget[] {
    const hulls: HullTarget[] = [];
    for (const ship of this.ships.values()) {
      if (!ship.alive) continue;
      const s = ship.state;
      transformPolygon(hullSilhouette(ship.hullId), s.x, s.y, s.heading, ship.hullPoly);
      hulls.push({ id: ship.id, poly: ship.hullPoly });
    }
    return hulls;
  }

  /** Advance every live ballistic; spent ones emit a boom (+ damage on a hit).
   *  THE one spent-shell path: remove it from flight, drop every observer's
   *  seen-memory, resolve its outcome into events/damage. The D1 back-dated
   *  spawn pre-step deliberately does NOT resolve outcomes (see preStepShell) —
   *  every projectile funnels through here, one tick after spawn at the
   *  earliest, so all shell damage resolves in exactly one place. */
  private stepShells(dt: number, hulls: HullTarget[]): void {
    for (const [id, shell] of this.shells) {
      const outcome = stepShell(shell, {
        islands: this.map.islands,
        hulls,
        now: this.now,
        dt,
        mapRadius: this.map.radius,
      });
      if (outcome.kind === 'travel') continue;
      // An AP shell that pierced but is NOT spent keeps flying (Story 2.8):
      // its hits resolve now, the projectile stays in flight for next tick.
      if (outcome.kind === 'pierced' && !outcome.spent) {
        this.resolveShell(shell, outcome, hulls);
        continue;
      }
      this.shells.delete(id);
      this.forgetBallistic(id);
      this.resolveShell(shell, outcome, hulls);
      // AFTER resolution: this shell's own hits must be claimed against the
      // salvo ledger before the last-shell-out release can drop it.
      this.releaseSalvo(shell);
    }
  }

  /**
   * SELF-PROPELLED MINES (Story 2.8 doctrine): every ARMED mine whose owner
   * currently holds the selfPropelled doctrine creeps at CONFIG.mine.creepSpeed
   * toward the nearest NON-OWNER alive hull center within creepAcquireRange.
   * Owner lookup at step time (a vacated/doctrine-less owner's mines sit
   * still — the CONFIG-base fallback rule). A creeping mine never leaves the
   * water disk and never enters an island circle (stopped at the rim — mines
   * float). Position changes flow to clients automatically: MineViews are
   * re-materialized per tick.
   */
  private creepMines(dt: number): void {
    for (const mine of this.mines.values()) {
      if (this.now < mine.armedAt) continue; // unarmed mines never move
      const owner = this.ships.get(mine.ownerId);
      if (owner === undefined || owner.stats.mine.mode !== 'selfPropelled') continue;
      const target = this.nearestEnemyCenter(mine, mine.ownerId, CONFIG.mine.creepAcquireRange);
      if (target === null) continue;
      const d = Math.hypot(target.x - mine.x, target.y - mine.y);
      if (d <= 0) continue;
      const step = Math.min(CONFIG.mine.creepSpeed * dt, d);
      const p = this.clampMinePoint(
        { x: mine.x + ((target.x - mine.x) / d) * step, y: mine.y + ((target.y - mine.y) / d) * step },
        mine,
      );
      mine.x = p.x;
      mine.y = p.y;
    }
  }

  /** Nearest ALIVE non-`ownerId` hull center within `range` of `p`, or null.
   *  Deterministic: strict `<` keeps the earliest ships-map entry on ties. */
  private nearestEnemyCenter(p: Vec2, ownerId: string, range: number): Vec2 | null {
    let best: Vec2 | null = null;
    let bestD = range;
    for (const ship of this.ships.values()) {
      if (!ship.alive || ship.id === ownerId) continue;
      const d = Math.hypot(ship.state.x - p.x, ship.state.y - p.y);
      if (d < bestD || (best === null && d <= range)) {
        bestD = d;
        best = ship.state;
      }
    }
    return best;
  }

  /**
   * Clamp a creeping mine's candidate point: never outside the water disk
   * (scaled back to the rim) and never inside an island circle (pushed to the
   * rim along the island-center ray; a degenerate center hit keeps `prev`).
   *
   * REJECT-ON-FAILURE (Story 2.8 review, P10): the clamp is a SINGLE pass, so
   * in a pinch (two islands, or an island hard against the rim) a push-out can
   * land inside the NEXT island or back outside the disk. Rather than iterate
   * to a fixed point that may not exist, the step is REJECTED — the mine holds
   * its previous position this tick. Creep is a slow crawl; a held tick is
   * invisible, an illegal rest position is not.
   */
  private clampMinePoint(p: Vec2, prev: Vec2): Vec2 {
    let x = p.x;
    let y = p.y;
    const r = Math.hypot(x, y);
    if (r > this.map.radius) {
      x = (x / r) * this.map.radius;
      y = (y / r) * this.map.radius;
    }
    for (const isle of this.map.islands) {
      const dx = x - isle.x;
      const dy = y - isle.y;
      const d = Math.hypot(dx, dy);
      if (d >= isle.r) continue;
      if (d <= 0) return { x: prev.x, y: prev.y }; // dead-center: hold position
      x = isle.x + (dx / d) * isle.r;
      y = isle.y + (dy / d) * isle.r;
    }
    return this.minePointLegal(x, y) ? { x, y } : { x: prev.x, y: prev.y };
  }

  /** Is a mine point legal to REST at: inside the water disk and outside every
   *  island circle? A hair of float tolerance so a point the clamp above placed
   *  exactly ON a rim reads as legal. */
  private minePointLegal(x: number, y: number): boolean {
    const EPS = 1e-6;
    if (Math.hypot(x, y) > this.map.radius + EPS) return false;
    for (const isle of this.map.islands) {
      if (Math.hypot(x - isle.x, y - isle.y) < isle.r - EPS) return false;
    }
    return true;
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
    const triggerRadiusFor = (ownerId: string): number =>
      this.ships.get(ownerId)?.stats.mine.triggerRadius ?? CONFIG.mine.triggerRadius;
    for (const { mine, victimId } of checkMineTriggers(this.mines, hulls, this.now, triggerRadiusFor)) {
      this.detonateMine(mine, hulls, victimId);
    }
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
    return { damage: mine.damage, blastRadius: mine.blastRadius, fouls: mine.mode === 'propFouling' };
  }

  /** One mine's blast damage + prop-fouling debuff (owner-stats-driven with
   *  the vacated-owner CONFIG fallback). Returns the blast radius used. */
  private blastMine(m: MineState, hulls: readonly HullTarget[]): number {
    const { damage, blastRadius, fouls } = this.mineBlastParams(m.ownerId);
    for (const victimId of mineBlastVictims(m, hulls, blastRadius)) {
      const victim = this.ships.get(victimId);
      if (!victim || !victim.alive) continue;
      this.hitShip(victim, damage, m.ownerId);
      // PROP-FOULING: a fouling blast's victim is slowed — REFRESH (plain
      // assignment), never stack. Gated with damage (no fouling in the
      // damage-suppressed ready room).
      if (fouls && this.damageEnabled) victim.slowedUntil = this.now + CONFIG.mine.foulDurationMs;
    }
    return blastRadius;
  }

  /** Queue the SAME-OWNER armed mines whose centers lie within `blastRadius`
   *  of detonating mine `m` (amendment 46 — enemy mines never chain). */
  private chainMines(m: MineState, blastRadius: number, visited: Set<string>, queue: MineState[]): void {
    const r2 = blastRadius * blastRadius;
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

  /**
   * THE SAME-CLICK SALVO SINGLE-HIT RULE (Story 2.8 review, P1): may `shell`
   * still apply damage to `victimId`? An untagged shell (every single-barrel
   * shot, every other weapon) always may. A tagged shell may only if no
   * earlier shell of the SAME click has already damaged that victim — first
   * resolved wins, later same-salvo hits on that victim deal 0 while still
   * booming/bursting normally. Different victims are untouched (area
   * throughput preserved). Claims as it answers.
   */
  private claimSalvoHit(shell: ShellState, victimId: string): boolean {
    if (shell.salvo === undefined) return true;
    let hits = this.salvoHits.get(shell.salvo);
    if (hits === undefined) {
      hits = new Set<string>();
      this.salvoHits.set(shell.salvo, hits);
    }
    if (hits.has(victimId)) return false;
    hits.add(victimId);
    return true;
  }

  /** Drop a salvo's hit ledger once its LAST shell has left flight (call after
   *  the shell was removed from `this.shells`). Bounded cleanup — live salvos
   *  are at most a handful of shells. */
  private releaseSalvo(shell: ShellState): void {
    if (shell.salvo === undefined) return;
    for (const other of this.shells.values()) if (other.salvo === shell.salvo) return;
    this.salvoHits.delete(shell.salvo);
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
   */
  private hitShip(victim: ShipRecord, amount: number, byId: string): void {
    if (!this.damageEnabled) return;
    victim.hp -= amount;
    this.creditDamage(byId, victim.id, amount);
    this.pending.push({ k: 'dmg', id: victim.id, amount, hp: Math.max(0, victim.hp) });
    if (victim.hp <= 0) this.sinkShip(victim.id, byId);
  }

  /** Accumulate damageDealt on the attacker (self-hits excluded; storm never routes here). */
  private creditDamage(byId: string, victimId: string, amount: number): void {
    if (byId === victimId) return;
    const attacker = this.ships.get(byId);
    if (attacker) attacker.damageDealt += amount;
  }

  /** Turn a spent ballistic's outcome into its events, per the projectile's
   *  OWN hit rule (Story 1.4 seam): `burst` detonates at the target point;
   *  `pierced` applies the AP falloff per hull in hit order (Story 2.8);
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
    if (outcome.kind === 'pierced') {
      this.resolvePierce(shell, outcome.hits, outcome.spent);
      return;
    }
    if (outcome.kind !== 'hitShip') {
      this.pending.push({ k: 'boom', id: shell.id, x: outcome.x, y: outcome.y });
      return;
    }
    this.pending.push({ k: 'boom', id: shell.id, hit: outcome.victimId, x: outcome.x, y: outcome.y });
    // A DAMAGELESS flare still lights where it stopped (Story 2.8, amendment
    // 39): an intercepted star shell spawns its zone at the interception point.
    if (shell.lit) this.spawnLitZone(shell, outcome);
    if (shell.contactDamage <= 0) return; // zero-damage interception: boom only
    const victim = this.ships.get(outcome.victimId);
    if (!victim || !victim.alive) return;
    // SALVO single-hit rule (P1): a later shell of the same click still booms
    // and still stops here — it simply deals no damage to an already-hit hull.
    if (!this.claimSalvoHit(shell, victim.id)) return;
    this.hitShip(victim, shell.contactDamage, shell.ownerId);
  }

  /**
   * ARMOR-PIERCING resolution (Story 2.8): each pierced hull, in hit order,
   * takes pierceDamage(shell.damage, order) — the 100/50/25% falloff by GLOBAL
   * hit index across the shell's life — through the hitShip choke, with one
   * boom per pierce point (hit = the pierced hull, victim-stripping stays with
   * the boom row). No burst ever; the shell's island/edge stop needs no extra
   * splash boom (the per-hit booms carry the projectile id).
   *
   * BOOM IDS (Story 2.8 review, P2): the client removes a dead-reckoned track
   * when a boom carrying ITS id arrives, so a NON-TERMINAL pierce (the shell
   * flew on through) must not reuse the live projectile id — the still-flying
   * shell would vanish for every observer. A non-terminal hit's boom carries a
   * DERIVED id (`<shellId>#p<order>`, unique per hit and unknown to every
   * client track, which makes it a pure impact spark); the TERMINAL hit (the
   * one that ends the flight — `spent`) keeps the REAL id so the track is
   * removed exactly once. Nothing else correlates boom ids: signals.ts's boom
   * row keys only on position/`hit`, and seenBallistics/torpDirs are keyed by
   * the real projectile id alone (forgetBallistic).
   */
  private resolvePierce(
    shell: ShellState,
    hits: readonly { victimId: string; x: number; y: number; order: number }[],
    spent: boolean,
  ): void {
    for (const [i, h] of hits.entries()) {
      const terminal = spent && i === hits.length - 1;
      const id = terminal ? shell.id : `${shell.id}#p${h.order}`;
      this.pending.push({ k: 'boom', id, hit: h.victimId, x: h.x, y: h.y });
      const victim = this.ships.get(h.victimId);
      if (victim && victim.alive) this.hitShip(victim, pierceDamage(shell.damage, h.order), shell.ownerId);
    }
  }

  /**
   * Detonate a burst at the shell's target point: ONE burst event (the
   * server-internal `own` field drives owner-visibility in signals.ts and is
   * ALWAYS stripped by its materialize), then the shared burstVictims()
   * resolves every hull silhouette within the blast (owner excluded —
   * permanent owner immunity) and each victim takes the shell's full damage
   * through the hitShip choke: one victim-private dmg event per victim, kill
   * credit through the normal path, no contact-damage double-dipping (a burst
   * outcome never also reports an interceptor) and — Story 2.8 review, P1 — no
   * SAME-CLICK double-dipping either (claimSalvoHit).
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
    if (shell.damage > 0) {
      for (const victimId of burstVictims(at, shell.burstRadius, hulls, shell.ownerId)) {
        const victim = this.ships.get(victimId);
        if (!victim || !victim.alive) continue;
        // SALVO single-hit rule (P1): the burst still happens for everyone —
        // a hull already hit by an earlier shell of the SAME click just takes 0.
        if (!this.claimSalvoHit(shell, victim.id)) continue;
        this.hitShip(victim, shell.damage, shell.ownerId);
      }
    }
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
   */
  private detonateMinesInBurst(shell: ShellState, at: Vec2, hulls: readonly HullTarget[]): void {
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
   *  `mode` is the OWNER's star-shell doctrine at spawn time (owner lookup; a
   *  vacated owner falls back to 'standard' — the CONFIG-base rule, pinned). */
  private spawnLitZone(shell: ShellState, at: Vec2): void {
    const id = this.nextLitZoneId();
    this.litZones.set(id, {
      id,
      ownerId: shell.ownerId,
      x: at.x,
      y: at.y,
      r: shell.lit!.radius,
      until: this.now + shell.lit!.durationMs,
      mode: this.ships.get(shell.ownerId)?.stats.starShells.mode ?? 'standard',
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
      if (!ship.alive) continue;
      for (const ownerId of this.markZoneEffects(ship)) {
        if (!ship.alive) break; // a mid-loop sink stops further burns
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
    victim.hp -= amount;
    this.creditDamage(ownerId, victim.id, amount);
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
   *  non-owned dazzle zone and collect the owners of covering incendiary
   *  zones (deduped — at most one burn per owner per tick). */
  private markZoneEffects(ship: ShipRecord): Set<string> {
    const burnedBy = new Set<string>();
    for (const zone of this.litZones.values()) {
      if (zone.ownerId === ship.id) continue; // own zones never burn or dazzle you
      const dx = ship.state.x - zone.x;
      const dy = ship.state.y - zone.y;
      if (dx * dx + dy * dy > zone.r * zone.r) continue;
      if (zone.mode === 'dazzle') ship.dazzledUntil = this.now + DAZZLE_GRACE_MS;
      else if (zone.mode === 'incendiary') burnedBy.add(zone.ownerId);
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

  /** Drop every decoy buoy whose lifetime has elapsed (Story 1.8 — the litZone
   *  expiry law: no per-ship state, owner death never clears it; the only other
   *  way out is owner replacement in spawnDecoy). */
  private expireDecoys(): void {
    for (const [id, decoy] of this.decoys) {
      if (this.now >= decoy.until) this.decoys.delete(id);
    }
  }

  /**
   * Store a newly-dropped decoy buoy (Story 1.8). ONE live per owner: placing
   * a second SILENTLY deletes the first (no boom, no event — the mines
   * oldest-eviction precedent). Lifetime comes from the owner's effective
   * stats (a pure CONFIG.decoyBuoy pass-through today).
   */
  private spawnDecoy(owner: ShipRecord, x: number, y: number): void {
    for (const [id, decoy] of this.decoys) {
      if (decoy.ownerId === owner.id) this.decoys.delete(id);
    }
    const id = this.nextDecoyId();
    this.decoys.set(id, { id, ownerId: owner.id, x, y, until: this.now + owner.stats.decoyBuoy.durationMs });
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
    if (!ship.alive || !clicked) return;
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
    if (!ship.alive || !activated) return;
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
   * THE sinking-activation gate — the ONLY call path to Equipment.activate()
   * anywhere. Takes the SELECTED slot INDEX and resolves the slot on THIS
   * ship internally, so a caller can never hand it ship A plus ship B's slot
   * object (a cross-ship aliasing hazard that would fire from A while draining
   * B's pool). A dead ship is refused first ('dead') — defense-in-depth on a
   * public seam (fireControl already skips the dead, but Epic 5's sinking
   * policy will drive this gate directly). Today otherwise a PASSTHROUGH:
   * every activation on a fitted slot is allowed. The sinking-state policy
   * (which equipment a sinking ship may still activate) is deliberately TBD
   * per D4 — Epic 5 wires the sinking state through here; no policy logic
   * lands before it. An empty or out-of-range slot is answered here
   * (empty-slot denial, no dereference) so rows never see one. Public so
   * directed tests can drive activation and read the ActivationResult (never
   * on the wire).
   */
  sinkingActivationGate(
    ship: ShipRecord,
    slotIndex: number,
    fireT: number = this.now,
  ): ActivationResult {
    if (!ship.alive) return { ok: false, reason: 'dead' };
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
      spawnBallistic: (shell) => this.spawnBallistic(shell),
      dropMine: (x, y) => this.spawnMine(ship, x, y, fireT),
      dropDecoy: (x, y) => this.spawnDecoy(ship, x, y),
    };
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
  private spawnBallistic(shell: ShellState): void {
    this.shells.set(shell.id, shell);
    this.pending.push(this.ballisticEvent(shell));
    if (shell.bornAt < this.now) this.preStepShell(shell);
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
    const hulls = this.aliveHulls();
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
      if (outcome.kind === 'pierced') {
        this.rollBackPierce(shell, outcome.hits);
        return;
      }
      if (outcome.kind !== 'travel') return; // terminal: defer to next tick's sweep
    }
  }

  /**
   * A back-dated AP shell pierced during its pre-step (Story 2.8): pre-stepping
   * NEVER resolves damage (the fireControl no-damage invariant above), but
   * stepPierce already recorded the hit ids — which would silently immunize
   * those hulls when the next tick's sweep re-steps. UNDO the pierce: pop this
   * call's hits off the shell's pierce bookkeeping and park the shell AT the
   * FIRST pierce point, so next tick's sweep re-pierces there against
   * then-live hulls and resolves normally (the same one-tick-deferred
   * semantics as every other pre-step terminal). The shell forfeits at most
   * one tick's already-decremented distLeft — range only ever shortens.
   */
  private rollBackPierce(shell: ShellState, hits: readonly { x: number; y: number }[]): void {
    const pierce = shell.pierce!;
    pierce.hitIds.length -= hits.length; // this call's ids are the trailing entries
    pierce.remaining += hits.length;
    shell.x = hits[0].x;
    shell.y = hits[0].y;
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

  private nextDecoyId(): string {
    this.decoySeq += 1;
    return `d${this.decoySeq}`;
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
      if (ship.alive) this.addXpMs(ship, dtMs);
    }
  }

  /** Bring sunk ships back on the ring once their respawn delay elapses. */
  private processRespawns(): void {
    for (const ship of this.ships.values()) {
      if (ship.alive || ship.respawnAt === 0 || this.now < ship.respawnAt) continue;
      this.respawn(ship);
    }
  }

  private respawn(ship: ShipRecord): void {
    const occupied = [...this.ships.values()]
      .filter((s) => s.id !== ship.id && s.alive)
      .map((s) => ({ x: s.state.x, y: s.state.y }));
    const p = pickSpawn(this.map, occupied, this.rng);
    ship.state.x = p.x;
    ship.state.y = p.y;
    ship.state.heading = Math.atan2(-p.y, -p.x);
    ship.state.speed = 0;
    // Respawn happens only in the waiting phase (active-phase death = spectate),
    // so the build PERSISTS: full EFFECTIVE hp + effective-size ammo pools.
    // XP progress (xpMs/level) and banked offers persist with it — deliberately
    // untouched here. (redeployShip, the match boundary, is where the whole
    // build, XP included, gets wiped.)
    ship.hp = ship.stats.maxHp;
    ship.alive = true;
    ship.respawnAt = 0;
    // A fresh life never inherits an open boost window — nor a slow or dazzle
    // (sinkShip already zeroed them; kept symmetric for directed callers).
    ship.boostUntil = 0;
    ship.slowedUntil = 0;
    ship.dazzledUntil = 0;
    // lastFireSeq / lastActSeq are deliberately NOT reset — a reset fires a
    // phantom shot / phantom boost (the stored input's fireSeq/actSeq would read
    // as a fresh click/press on this tick).
    // Boons AND the deck PERSIST across a waiting-phase respawn, so the fresh
    // loadout re-derives with their slot effects replayed — the SAME shared
    // derivation the client runs (slotsWithBoons ≡ loadoutFor at zero boons,
    // byte-identical).
    ship.loadout = slotsWithBoons(ship.hullId, ship.stats, ship.boonDefs);
    this.pending.push({ k: 'spawn', id: ship.id, x: p.x, y: p.y });
  }
}
