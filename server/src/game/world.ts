// The authoritative simulation. Plain TS, ZERO Colyseus imports — the room is
// a thin adapter around this class, so everything here is unit-testable.
//
// Clock: World owns server time. `now` is ms since world (= room) creation and
// advances only inside step(); every outbound timestamp (frames, welcome,
// blips later) reads it, so there is exactly one clock.
//
// Step order (per plan): inputs -> ships -> boundary -> [islands -> shells ->
// fire control -> ability activation -> radar paint: later steps, seams marked
// below] -> sweep advance -> respawns. Ability activation (Story 1.6) sits with
// fire control — both consume this tick's stored input intent (fireSeq clicks /
// actSeq presses) through the single sinking-activation gate.

import {
  CONFIG,
  EQUIPMENT_IS_WEAPON,
  HEAL_CHOICE,
  UPGRADE_IDS,
  boostedKinematics,
  burstVictims,
  effectiveStats,
  equipmentMaxAmmo,
  generateMap,
  loadoutFor,
  hullEnvelope,
  hullSilhouette,
  mulberry32,
  resolveShipPose,
  rollOffer,
  stepShell,
  stepShip,
  transformPolygon,
  wrapPositive,
  zonePhaseAt,
  zoneRadiusAt,
  isOutside,
  zeroUpgrades,
  type BallisticEvent,
  type EffectiveStats,
  type EquipmentId,
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
  type UpgradeId,
  type UpgradeOffer,
  type Vec2,
  type ZonePhase,
  type ZoneTimeline,
} from '@salvo/shared';
import {
  EQUIPMENT,
  addMine,
  checkMineTriggers,
  mineBlastVictims,
  type ActivationContext,
  type ActivationResult,
  type MineState,
} from './equipment/index.js';
import type { BurstSubject } from './signals.js';
import { InputStore, clampFireTime, neutralInput } from './inputs.js';
import { DroneController } from './drones.js';
import { pickSpawn } from './spawn.js';

const TAU = Math.PI * 2;

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
 * ({id,x,y,r,until,by}), materialized per observer by the litzone signal row.
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
   * Kill-reward upgrade counts, indexed by UPGRADE_IDS order. Survive respawn
   * (waiting-phase deaths keep the build) but NOT redeployShip (fresh match =
   * fresh build). Mutated only by applyUpgrade() (the spend-application path);
   * `stats` is recomputed with it.
   */
  upgrades: number[];
  /**
   * FIFO queue of pre-rolled upgrade offers, one per unspent banked point.
   * points = offers.length — this queue is the SINGLE SOURCE OF TRUTH for the
   * point count (OwnShip.pts derives from it). Each offer is rolled once at
   * earn-time (sim/offers.rollOffer) so reopening the spend window can't reroll;
   * the front offer is the one surfaced on the wire. Wiped by redeployShip (a
   * fresh match = fresh build), like upgrades.
   */
  offers: UpgradeOffer[];
  /**
   * Cached effective stats for (cls, upgrades) — the shared effectiveStats()
   * result. Every stat read in the sim (kinematics, vision, weapon pools,
   * reloads, ranges) goes through this, NEVER raw CONFIG, so upgraded hulls
   * cannot silently fall back to base numbers. Recomputed on grant/add/redeploy.
   */
  stats: EffectiveStats;
  state: ShipState;
  hp: number;
  alive: boolean;
  input: InputMsg; // latest applied input (validated + clamped)
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

  private rng: Rng;
  /**
   * Upgrade-offer stream, decorrelated from mapgen/spawn/drone streams so
   * rolling (or not rolling) offers can never shift spawn/drone determinism
   * in tests or replays.
   */
  private readonly upgradeRng: Rng;
  private shellSeq = 0;
  private mineSeq = 0;
  private litZoneSeq = 0;
  private decoySeq = 0;
  /** Zone timeline (default CONFIG.zone; overridable for smokes/tests only). */
  private readonly zoneCfg: ZoneTimeline;
  /** Server ms the storm timeline was anchored at; null = idle (not started). */
  private zoneStartT: number | null = null;
  /** Events queued since the last completed step (joins, sinks, respawns). */
  private pending: GameEvent[] = [];
  /** Events belonging to the most recently completed tick (read by frames). */
  private events: GameEvent[] = [];

  constructor(
    seed: number,
    playerCap: number = CONFIG.match.fillTo,
    zoneCfg: ZoneTimeline = CONFIG.zone,
  ) {
    this.playerCap = playerCap;
    this.map = generateMap(seed, playerCap);
    this.rng = mulberry32((seed ^ 0x9e3779b9) >>> 0); // spawn stream, decorrelated from mapgen
    this.upgradeRng = mulberry32((seed ^ 0x27d4eb2f) >>> 0); // upgrade grants, own stream
    this.zoneCfg = zoneCfg;
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
    if (this.zoneStartT === null) this.zoneStartT = t;
  }

  /** Server ms the zone was anchored at, or 0 while idle (for the schema). */
  get zoneStartMs(): number {
    return this.zoneStartT ?? 0;
  }

  /** Current safe-zone radius (u). Full map radius while idle. */
  get zoneRadius(): number {
    if (this.zoneStartT === null) return this.map.radius;
    return zoneRadiusAt(this.now, this.zoneStartT, this.map.radius, this.zoneCfg);
  }

  /** Current zone phase for the public schema. */
  get zonePhase(): 'idle' | ZonePhase {
    if (this.zoneStartT === null) return 'idle';
    return zonePhaseAt(this.now, this.zoneStartT, this.zoneCfg);
  }

  /** Events emitted during the last completed step (and joins just before it). */
  get tickEvents(): readonly GameEvent[] {
    return this.events;
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
    const occupied = [...this.ships.values()].map((s) => ({ x: s.state.x, y: s.state.y }));
    const p = pickSpawn(this.map, occupied, this.rng);
    const cls = hullEnvelope(hullId);
    const upgrades = zeroUpgrades();
    const stats = effectiveStats(cls, upgrades);
    const rec: ShipRecord = {
      id,
      name,
      isDrone,
      hullId,
      cls,
      hullPoly: [],
      prevPose: { x: p.x, y: p.y, heading: 0, speed: 0 },
      upgrades,
      offers: [],
      stats,
      state: { x: p.x, y: p.y, heading: Math.atan2(-p.y, -p.x), speed: 0 },
      hp: stats.maxHp,
      alive: true,
      input: neutralInput(),
      lastAckSeq: 0,
      lastFireSeq: 0,
      lastActSeq: 0,
      boostUntil: 0,
      rttMs: null,
      lastFireT: 0,
      respawnAt: 0,
      sweepAngle: 0,
      prevSweepAngle: 0,
      seenBallistics: new Set(),
      // Per-hull loadout (Story 1.6): the Torpedo Boat fits speedBoost in slot 2,
      // every other hull id (classes + drones) keeps the universal weapon fit.
      loadout: loadoutFor(hullId, stats),
      kills: 0,
      deaths: 0,
      damageDealt: 0,
    };
    this.ships.set(id, rec);
    if (isDrone) this.drones.add(id);
    this.pending.push({ k: 'spawn', id, x: p.x, y: p.y });
    return rec;
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
   *  UPGRADES ARE WIPED: a redeploy is the countdown→active match boundary, and
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
    ship.upgrades = zeroUpgrades();
    ship.offers = [];
    ship.stats = effectiveStats(ship.cls, ship.upgrades);
    ship.hp = ship.stats.maxHp;
    ship.alive = true;
    ship.respawnAt = 0;
    // A fresh life never inherits an open boost window.
    ship.boostUntil = 0;
    // lastFireSeq / lastActSeq are deliberately NOT reset — a reset fires a
    // phantom shot / phantom boost (the stored input's fireSeq/actSeq would read
    // as a fresh click/press on this tick).
    ship.seenBallistics.clear();
    ship.loadout = loadoutFor(ship.hullId, ship.stats);
    ship.kills = 0;
    ship.deaths = 0;
    ship.damageDealt = 0;
    this.pending.push({ k: 'spawn', id: ship.id, x: p.x, y: p.y });
  }

  /**
   * Sink a ship: dead, hp 0, respawn scheduled (only while respawnEnabled —
   * in the active match phase the dead transition to spectators instead),
   * death counted. Attributes a kill (and a banked upgrade point) to `by`
   * when it names a different ship still in the room — a DEAD killer (mutual
   * destruction) still gets both; storm (`by` undefined) and self-kills grant
   * nothing by construction. Combat routes damage through here; tests drive it
   * directly.
   */
  sinkShip(id: string, by?: string): void {
    const ship = this.ships.get(id);
    if (!ship || !ship.alive) return;
    ship.alive = false;
    ship.hp = 0;
    ship.state.speed = 0;
    // Close any open speed-boost window at the instant of death (Story 1.6): a
    // future boostUntil must not ride the owner's frames through the death gap,
    // where it would paint active-boost HUD chrome on a dead ship.
    ship.boostUntil = 0;
    ship.deaths += 1;
    ship.respawnAt = this.respawnEnabled ? this.now + CONFIG.ship.respawnDelay : 0;
    if (by && by !== id) {
      const killer = this.ships.get(by);
      if (killer) {
        killer.kills += 1;
        this.grantPoint(killer);
      }
    }
    this.pending.push({ k: 'sunk', id, by });
  }

  /**
   * Kill reward: bank ONE upgrade point with a pre-rolled offer. The offer is
   * rolled at EARN time on the decorrelated upgrade stream, so reopening the
   * spend window can never reroll it — spendPoint only ever consumes the queue
   * front. Stats are untouched until the point is spent.
   */
  private grantPoint(killer: ShipRecord): void {
    killer.offers.push(rollOffer(this.upgradeRng));
    this.pending.push({ k: 'pt', id: killer.id });
  }

  /**
   * Apply one SPECIFIC upgrade to a ship: bump the count, recompute the cached
   * effective stats, apply the grant-time side effects (hull heal / +1 loaded
   * round), and queue the SELF-PRIVATE upg event (perception forwards it only
   * to `id`, exactly like the victim-private dmg rule — the event now reads as
   * "point spent"). Public so directed tests can grant a known type; gameplay
   * only ever reaches it through spendPoint's offer-slot choice.
   */
  applyUpgrade(ship: ShipRecord, type: UpgradeId): void {
    ship.upgrades[UPGRADE_IDS.indexOf(type)] += 1;
    ship.stats = effectiveStats(ship.cls, ship.upgrades);
    this.applyGrantEffects(ship, type);
    this.pending.push({ k: 'upg', id: ship.id, type });
  }

  /** Which equipment's pool an ammo-type upgrade also loads +1 current round
   *  into (re-keyed from the retired WeaponId to EquipmentId). gunAmmo still
   *  routes here for wire stability, but the effective gun pool is pinned to 1
   *  (single-shot), so the clamp makes the load a no-op at a full pool. */
  private static readonly AMMO_UPGRADE_EQUIPMENT: Partial<Record<UpgradeId, EquipmentId>> = {
    gunAmmo: 'gun',
    torpedoAmmo: 'torpedo',
    mineAmmo: 'mine',
  };

  /**
   * Grant-time side effects beyond the stat table: hullPoints heals +add
   * (clamped to the new maxHp; only a LIVING killer heals — a mutual-
   * destruction corpse keeps hp 0 and gets full effective hp on respawn
   * anyway); ammo-type upgrades also load +1 current round (clamped to the new
   * effective pool size) so the reward is immediately usable.
   */
  private applyGrantEffects(killer: ShipRecord, type: UpgradeId): void {
    if (type === 'hullPoints') {
      if (killer.alive) {
        killer.hp = Math.min(killer.hp + CONFIG.upgrades.hullPoints.add, killer.stats.maxHp);
      }
      return;
    }
    const equipmentId = World.AMMO_UPGRADE_EQUIPMENT[type];
    if (equipmentId === undefined) return;
    // gunAmmo is a legacy pre-rolled-offer id kept only for wire stability: the
    // gun is single-shot (maxAmmo pinned to 1), so its pool is a pure cooldown.
    // Spending gunAmmo increments the upgrade count (applyUpgrade, above) but
    // must NOT touch the gun pool — topping up `n` mid-cooldown would hand out a
    // free round that bypasses the 3s reload (spec 1.4: "count increments but no
    // effect"). Only real ammo pools (torpedo/mine) load the +1 round.
    if (equipmentId === 'gun') return;
    // Per-hull loadout (Story 1.6): the ammo-upgradeable system may NOT be
    // fitted on this hull — a Torpedo Boat carries no mine, so a `mineAmmo`
    // offer is a DEAD PICK (the spec's documented interregnum wart, dying with
    // the Epic 2 economy). The upgrade count + effective stats still apply
    // upstream (applyUpgrade); only the pool side-effect is skipped, as a NO-OP,
    // when the slot is absent — never a crash. A fitted slot ALWAYS has state
    // (the LoadoutSlot invariant), so the load itself stays assertive.
    const slot = killer.loadout.find((s) => s.equipmentId === equipmentId);
    if (slot === undefined) return;
    const pool = slot.state!;
    pool.n = Math.min(pool.n + 1, equipmentMaxAmmo(killer.stats, equipmentId));
  }

  /**
   * Wire entry point for MSG.spend: consume ONE banked point. Validate-
   * everything like submitInput, fail-closed — unknown ship, empty bank, or a
   * malformed choice returns false with the queue untouched. choice 0..2
   * spends the FRONT offer's slot; upgrades ARE spendable while dead (builds
   * persist across waiting-phase respawns — same precedent as the dead
   * killer's reward). HEAL_CHOICE routes to spendHeal.
   */
  spendPoint(id: string, rawChoice: unknown): boolean {
    const ship = this.ships.get(id);
    if (!ship || ship.offers.length === 0) return false;
    if (typeof rawChoice !== 'number' || !Number.isInteger(rawChoice)) return false;
    if (rawChoice === HEAL_CHOICE) return this.spendHeal(ship);
    if (rawChoice < 0 || rawChoice > 2) return false;
    this.applyUpgrade(ship, ship.offers.shift()![rawChoice]);
    return true;
  }

  /**
   * Heal spend: alive-only and rejected at full hp — either rejection
   * PRESERVES the point (a misfired heal must not eat it). Heals
   * min(healHp, missing hp), consumes the front offer, and emits the
   * self-private heal event carrying the ACTUAL clamped delta.
   */
  private spendHeal(ship: ShipRecord): boolean {
    if (!ship.alive || ship.hp >= ship.stats.maxHp) return false;
    const healed = Math.min(CONFIG.upgradePoints.healHp, ship.stats.maxHp - ship.hp);
    ship.hp += healed;
    ship.offers.shift();
    this.pending.push({ k: 'heal', id: ship.id, amount: healed });
    return true;
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
    this.stepMines(hulls);
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

    // Publish this tick's events (including joins/sinks queued between steps).
    this.events = this.pending;
    this.pending = [];
  }

  /** Copy each client's latest stored input onto its ship. */
  private applyInputs(): void {
    for (const ship of this.ships.values()) {
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
      const kin = boostedKinematics(ship.stats.kinematics, ship.stats.boost.speedBonus, this.now < ship.boostUntil);
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
   * Storm damage: every alive hull outside the current safe radius bleeds
   * stormDps·dt HP (kept fractional — hp is a float internally). A storm kill
   * routes through sinkShip with `by` undefined (unattributed). Per RULING this
   * emits NO per-tick dmg event (that would spam ~20/s); the victim already
   * receives its live hp every frame via OwnShip.hp, and the client HP bar reads
   * from you.hp, so it stays accurate. No boom for storm ticks either.
   */
  private applyStorm(dt: number): void {
    if (this.zoneStartT === null || !this.damageEnabled) return;
    const radius = this.zoneRadius;
    const bite = CONFIG.zone.stormDps * dt;
    for (const ship of this.ships.values()) {
      if (!ship.alive || !isOutside(ship.state, radius)) continue;
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
      this.shells.delete(id);
      this.forgetBallistic(id);
      this.resolveShell(shell, outcome, hulls);
    }
  }

  /**
   * Resolve mines that tripped this tick (Story 1.8 blast rework): each trip
   * detonates as a BLAST — despawn, one boom at the mine point (hit = the
   * tripping ship, gated per observer by perception), full damage to EVERY
   * non-owner hull whose silhouette is within blastRadius.
   */
  private stepMines(hulls: HullTarget[]): void {
    for (const { mine, victimId } of checkMineTriggers(this.mines, hulls, this.now)) {
      this.detonateMine(mine, hulls, victimId);
    }
  }

  /**
   * Detonate ONE mine (Story 1.8): despawn it, emit a single boom at the mine
   * point (`hit` = the tripping ship when a pass-over tripped it; a gun-shot
   * detonation has no tripping ship, so the boom carries NO victim id — the
   * splash-boom convention, per-observer victim stripping stays with the boom
   * row), then the BLAST: every non-owner hull (enemies AND drones) whose
   * silhouette lies within CONFIG.mine.blastRadius takes full damage through
   * the hitShip choke (victim-private dmg, kill credit; OWNER EXCLUDED — the
   * universal AoE convention). NO CHAIN DETONATIONS: a mine blast never
   * detonates other mines (only the owner's shell bursts do, and those resolve
   * each detonation as a plain blast right here).
   */
  private detonateMine(mine: MineState, hulls: readonly HullTarget[], trippedBy?: string): void {
    this.mines.delete(mine.id);
    this.pending.push(
      trippedBy !== undefined
        ? { k: 'boom', id: mine.id, hit: trippedBy, x: mine.x, y: mine.y }
        : { k: 'boom', id: mine.id, x: mine.x, y: mine.y },
    );
    for (const victimId of mineBlastVictims(mine, hulls)) {
      const victim = this.ships.get(victimId);
      if (victim && victim.alive) this.hitShip(victim, CONFIG.mine.damage, mine.ownerId);
    }
  }

  /** Drop a spent ballistic from every observer's seen set (no leaks, no growth). */
  private forgetBallistic(id: string): void {
    for (const ship of this.ships.values()) ship.seenBallistics.delete(id);
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
   *  `hitShip` is an early interception OUTSIDE the blast — the interceptor
   *  takes the smaller contactDamage (torpedoes set contactDamage = damage, so
   *  their behavior is unchanged); everything else is a plain splash boom. */
  private resolveShell(shell: ShellState, outcome: ShellOutcome, hulls: readonly HullTarget[]): void {
    if (outcome.kind === 'travel') return;
    if (outcome.kind === 'burst') {
      this.resolveBurst(shell, outcome, hulls);
      return;
    }
    if (outcome.kind !== 'hitShip') {
      this.pending.push({ k: 'boom', id: shell.id, x: outcome.x, y: outcome.y });
      return;
    }
    this.pending.push({ k: 'boom', id: shell.id, hit: outcome.victimId, x: outcome.x, y: outcome.y });
    const victim = this.ships.get(outcome.victimId);
    if (!victim || !victim.alive) return;
    this.hitShip(victim, shell.contactDamage, shell.ownerId);
  }

  /**
   * Detonate a burst at the shell's target point: ONE burst event (the
   * server-internal `own` field drives owner-visibility in signals.ts and is
   * ALWAYS stripped by its materialize), then the shared burstVictims()
   * resolves every hull silhouette within the blast (owner excluded —
   * permanent owner immunity) and each victim takes the shell's full damage
   * through the hitShip choke: one victim-private dmg event per victim, kill
   * credit through the normal path, no contact-damage double-dipping (a burst
   * outcome never also reports an interceptor).
   */
  private resolveBurst(shell: ShellState, at: Vec2, hulls: readonly HullTarget[]): void {
    const burst: BurstSubject = { k: 'burst', id: shell.id, x: at.x, y: at.y, own: shell.ownerId };
    this.pending.push(burst);
    // A star shell's burst also lights its zone (Story 1.7): the server-
    // internal `lit` tag rides only star shells, so every other burster is
    // untouched. The burst-flash wire event above is the SAME 'burst' row —
    // no new GameEvent kind; the zone itself syncs contact-like as litZones.
    if (shell.lit) this.spawnLitZone(shell, at);
    for (const victimId of burstVictims(at, shell.burstRadius, hulls, shell.ownerId)) {
      const victim = this.ships.get(victimId);
      if (victim && victim.alive) this.hitShip(victim, shell.damage, shell.ownerId);
    }
    this.detonateMinesInBurst(shell, at, hulls);
  }

  /**
   * Click-your-own-minefield (Story 1.8, Eric ruling 2026-07-22): a shell
   * burst detonates the shell OWNER's own ARMED mines whose CENTER lies within
   * the burst radius — each resolving as a normal mine blast at the MINE's
   * position (owner-excluded damage, no-victim boom). Three hard gates, in
   * order: OWNER-ONLY (an enemy's burst never touches your field), ARMED-ONLY
   * (armDelay keeps its anti-instant-bomb role — an unarmed mine is immune),
   * and NO CASCADE (the detonation set is snapshotted from the SHELL burst
   * alone before any blast resolves, and mine blasts never detonate mines, so
   * one burst can never ripple across a field).
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

  /** Spawn a lit zone at a star shell's burst point (resolveBurst only). */
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
   * route this tick's click — if any — to the slot the click names
   * (input.slot; 0 = the gun, the permanently-selected default — a primed
   * skillshot click carries its slot) through the single sinking-activation
   * gate. One shot per
   * click: a fireSeq newer than lastFireSeq is one pending click, and it is
   * ALWAYS consumed this tick (even dead or denied), so clicks during reload
   * are consumed, not queued. Equipment reaches the World only through the
   * narrow ActivationContext (spawn ballistics / drop mines).
   */
  private fireControl(dtMs: number): void {
    for (const ship of this.ships.values()) {
      for (const slot of ship.loadout) {
        if (slot.equipmentId !== null) EQUIPMENT[slot.equipmentId].tick(ship, slot, dtMs);
      }
      const clicked = ship.input.fireSeq > ship.lastFireSeq;
      ship.lastFireSeq = Math.max(ship.lastFireSeq, ship.input.fireSeq);
      if (!ship.alive || !clicked) continue;
      // The CLICK channel dispatches WEAPONS ONLY — the mirror of
      // activationControl's ability wall (Story 1.6). A forged click naming an
      // ability or empty slot (e.g. a TB's speedBoost in slot 2) is silently
      // inert: abilities activate via actSeq, and letting a click reach
      // boostEquipment.activate would burn the charge AND stamp lastFireT off
      // the wrong channel. An out-of-range/empty slot is inert here too (it was
      // an 'empty-slot' gate denial before — same no-op, no lastFireT).
      const id = fittedEquipment(ship.loadout, ship.input.slot);
      if (id === null || !EQUIPMENT_IS_WEAPON[id]) continue;
      // D1: validate the click's claimed fire time BEFORE activation. The clamp
      // is the trust boundary (never earlier than now - min(RTT+jitter, ceiling),
      // never before the previous ACCEPTED fire time).
      const fireT = clampFireTime({
        claimed: ship.input.fireT,
        now: this.now,
        rttMs: ship.rttMs,
        jitterMs: CONFIG.net.fireJitterAllowanceMs,
        ceilingMs: CONFIG.net.fireBackdateCeilingMs,
        prevFireT: ship.lastFireT,
      });
      const result = this.sinkingActivationGate(ship, ship.input.slot, fireT);
      // Only a SUCCESSFUL activation consumes fire-time monotonicity — a denial
      // (empty pool, empty slot) must not floor a later honest back-date.
      if (result.ok) ship.lastFireT = fireT;
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
   */
  private activationControl(): void {
    for (const ship of this.ships.values()) {
      const activated = ship.input.actSeq > ship.lastActSeq;
      ship.lastActSeq = Math.max(ship.lastActSeq, ship.input.actSeq);
      if (!ship.alive || !activated) continue;
      // actSeq targets ABILITIES only: a weapon or empty slot is a no-op (no
      // state change), so a forged actSeq on a gun/torpedo slot fires nothing —
      // the mirror of fireControl's weapon-only wall.
      const id = fittedEquipment(ship.loadout, ship.input.actSlot);
      if (id === null || EQUIPMENT_IS_WEAPON[id]) continue;
      this.sinkingActivationGate(ship, ship.input.actSlot);
    }
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
      if (outcome.kind !== 'travel') return; // terminal: defer to next tick's sweep
    }
  }

  /** Store a newly-dropped mine. Per-player cap = the OWNER'S effective
   *  maxLive (maxMines upgrade); the defensive global cap stays in addMine.
   *  Story 1.8: mines are an ABILITY (actSeq channel) — activation runs at
   *  `now` with no fireT compensation, so `droppedAt` is always the server
   *  apply time and armedAt = now + armDelay (the 3s arm delay dwarfs any
   *  latency skew a claim could have shaved). Drop point / caps / eviction
   *  untouched. */
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
    // (redeployShip, the match boundary, is where upgrades get wiped.)
    ship.hp = ship.stats.maxHp;
    ship.alive = true;
    ship.respawnAt = 0;
    // A fresh life never inherits an open boost window.
    ship.boostUntil = 0;
    // lastFireSeq / lastActSeq are deliberately NOT reset — a reset fires a
    // phantom shot / phantom boost (the stored input's fireSeq/actSeq would read
    // as a fresh click/press on this tick).
    ship.loadout = loadoutFor(ship.hullId, ship.stats);
    this.pending.push({ k: 'spawn', id: ship.id, x: p.x, y: p.y });
  }
}
