// The authoritative simulation. Plain TS, ZERO Colyseus imports — the room is
// a thin adapter around this class, so everything here is unit-testable.
//
// Clock: World owns server time. `now` is ms since world (= room) creation and
// advances only inside step(); every outbound timestamp (frames, welcome,
// blips later) reads it, so there is exactly one clock.
//
// Step order (per plan): inputs -> ships -> boundary -> [islands -> shells ->
// fire control -> radar paint: later steps, seams marked below] -> sweep
// advance -> respawns.

import {
  CONFIG,
  HEAL_CHOICE,
  UPGRADE_IDS,
  defaultLoadout,
  effectiveStats,
  generateMap,
  hullEndpoints,
  mulberry32,
  resolveBoundary,
  resolveShipIslands,
  rollOffer,
  stepShell,
  stepShip,
  weaponMaxAmmo,
  wrapPositive,
  zonePhaseAt,
  zoneRadiusAt,
  isOutside,
  zeroUpgrades,
  type BallisticEvent,
  type EffectiveStats,
  type GameEvent,
  type GameMap,
  type HullTarget,
  type InputMsg,
  type LoadoutSlot,
  type Rng,
  type ShellOutcome,
  type ShellState,
  type ShipClass,
  type ShipClassId,
  type ShipState,
  type UpgradeId,
  type UpgradeOffer,
  type Vec2,
  type WeaponId,
  type ZonePhase,
  type ZoneTimeline,
} from '@salvo/shared';
import {
  EQUIPMENT,
  addMine,
  checkMineTriggers,
  type ActivationContext,
  type ActivationResult,
  type MineState,
} from './equipment/index.js';
import { InputStore, neutralInput } from './inputs.js';
import { DroneController } from './drones.js';
import { pickSpawn } from './spawn.js';

const TAU = Math.PI * 2;

/** Everything the server tracks per ship, on top of the shared kinematic state. */
export interface ShipRecord {
  id: string;
  name: string;
  isDrone: boolean;
  /** Ship class id (chosen pre-queue). Fixed for a hull's whole life. */
  classId: ShipClassId;
  /** Cached resolved class (hull + hp + kinematics) for this classId. */
  cls: ShipClass;
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
   * input.weapon (0/1/2) selects by slot index. Reset to the full default
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

  /** Spawn a new ship on the ring, max-distance from existing ships. */
  addShip(id: string, name: string, isDrone = false, classId: ShipClassId = 'cruiser'): ShipRecord {
    const occupied = [...this.ships.values()].map((s) => ({ x: s.state.x, y: s.state.y }));
    const p = pickSpawn(this.map, occupied, this.rng);
    const cls = CONFIG.shipClasses[classId];
    const upgrades = zeroUpgrades();
    const stats = effectiveStats(cls, upgrades);
    const rec: ShipRecord = {
      id,
      name,
      isDrone,
      classId,
      cls,
      upgrades,
      offers: [],
      stats,
      state: { x: p.x, y: p.y, heading: Math.atan2(-p.y, -p.x), speed: 0 },
      hp: stats.maxHp,
      alive: true,
      input: neutralInput(),
      lastAckSeq: 0,
      lastFireSeq: 0,
      respawnAt: 0,
      sweepAngle: 0,
      prevSweepAngle: 0,
      seenBallistics: new Set(),
      loadout: defaultLoadout(stats),
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
    // lastFireSeq is deliberately NOT reset — a reset fires a phantom shot
    // (the stored input's fireSeq would read as a fresh click on this tick).
    ship.seenBallistics.clear();
    ship.loadout = defaultLoadout(ship.stats);
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

  /** Which weapon pool an ammo-type upgrade also loads +1 current round into. */
  private static readonly AMMO_UPGRADE_WEAPON: Partial<Record<UpgradeId, WeaponId>> = {
    gunAmmo: 0,
    torpedoAmmo: 1,
    mineAmmo: 2,
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
    const weapon = World.AMMO_UPGRADE_WEAPON[type];
    if (weapon === undefined) return;
    // Universal fit: slot index == WeaponId, and the weapon slots are always
    // fitted (state set) — the null check just fail-safes the invariant.
    const pool = killer.loadout[weapon].state;
    if (!pool) return;
    pool.n = Math.min(pool.n + 1, weaponMaxAmmo(killer.stats, weapon));
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
    this.fireControl(dtMs);
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
      stepShip(ship.state, ship.input, ship.stats.kinematics, dt);
    }
  }

  /**
   * Ship vs island then vs map edge — both via the shared collision module, so
   * client prediction resolves rocks and the boundary identically (no divergence).
   */
  private resolveCollisions(): void {
    for (const ship of this.ships.values()) {
      if (!ship.alive) continue;
      resolveShipIslands(ship.state, this.map.islands, ship.cls.hull.beam / 2);
      resolveBoundary(ship.state, this.map.radius);
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

  /** Alive hull capsules (post-move) that shells test against this tick. */
  private aliveHulls(): HullTarget[] {
    const hulls: HullTarget[] = [];
    for (const ship of this.ships.values()) {
      if (!ship.alive) continue;
      const h = hullEndpoints(ship.state.x, ship.state.y, ship.state.heading, ship.cls.hull);
      h.id = ship.id;
      hulls.push(h);
    }
    return hulls;
  }

  /** Advance every live ballistic; spent ones emit a boom (+ damage on a hit). */
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
      this.resolveShell(shell, outcome);
    }
  }

  /**
   * Resolve mines that tripped this tick: boom at the mine point (hit gated by
   * perception per observer), damage the triggering ship, despawn the mine.
   */
  private stepMines(hulls: HullTarget[]): void {
    for (const { mine, victimId } of checkMineTriggers(this.mines, hulls, this.now)) {
      this.mines.delete(mine.id);
      this.pending.push({ k: 'boom', id: mine.id, hit: victimId, x: mine.x, y: mine.y });
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

  /** Turn a spent ballistic's outcome into boom (+ dmg/sink) events. */
  private resolveShell(shell: ShellState, outcome: ShellOutcome): void {
    if (outcome.kind === 'travel') return;
    if (outcome.kind !== 'hitShip') {
      this.pending.push({ k: 'boom', id: shell.id, x: outcome.x, y: outcome.y });
      return;
    }
    this.pending.push({ k: 'boom', id: shell.id, hit: outcome.victimId, x: outcome.x, y: outcome.y });
    const victim = this.ships.get(outcome.victimId);
    if (!victim || !victim.alive) return;
    this.hitShip(victim, shell.damage, shell.ownerId);
  }

  /**
   * Tick EVERY fitted slot's equipment for every ship (regardless of selection
   * — a weapon reloads while another is in use; empty slots are skipped), then
   * route this tick's click — if any — to the SELECTED slot (slot index =
   * input.weapon) through the single sinking-activation gate. One shot per
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
      this.sinkingActivationGate(ship, ship.loadout[ship.input.weapon]);
    }
  }

  /**
   * THE sinking-activation gate — the ONLY call path to Equipment.activate()
   * anywhere. Today a pure PASSTHROUGH: every activation on a fitted slot is
   * allowed. The sinking-state policy (which equipment a sinking ship may
   * still activate) is deliberately TBD per D4 — Epic 5 wires the sinking
   * state through here; no policy logic lands before it. An empty or
   * out-of-range slot is answered here (empty-slot denial, no dereference) so
   * rows never see one. Public so directed tests can drive activation and
   * read the ActivationResult (never on the wire).
   */
  sinkingActivationGate(ship: ShipRecord, slot: LoadoutSlot | undefined): ActivationResult {
    if (!slot || slot.equipmentId === null) return { ok: false, reason: 'empty-slot' };
    return EQUIPMENT[slot.equipmentId].activate(this.activationContext(ship), slot);
  }

  /** The capabilities equipment needs to activate for this ship this tick. */
  private activationContext(ship: ShipRecord): ActivationContext {
    return {
      ship,
      now: this.now,
      mkId: () => this.nextBallisticId(),
      spawnBallistic: (shell) => this.spawnBallistic(shell),
      dropMine: (x, y) => this.spawnMine(ship, x, y),
    };
  }

  /** Store a newly-fired ballistic + queue its one-time reveal event. */
  private spawnBallistic(shell: ShellState): void {
    this.shells.set(shell.id, shell);
    this.pending.push(this.ballisticEvent(shell));
  }

  /** Store a newly-dropped mine. Per-player cap = the OWNER'S effective
   *  maxLive (maxMines upgrade); the defensive global cap stays in addMine. */
  private spawnMine(owner: ShipRecord, x: number, y: number): void {
    addMine(this.mines, owner.id, x, y, this.now, this.nextMineId(), owner.stats.mine.maxLive);
  }

  private nextBallisticId(): string {
    this.shellSeq += 1;
    return `s${this.shellSeq}`;
  }

  private nextMineId(): string {
    this.mineSeq += 1;
    return `m${this.mineSeq}`;
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
    // lastFireSeq is deliberately NOT reset — a reset fires a phantom shot
    // (the stored input's fireSeq would read as a fresh click on this tick).
    ship.loadout = defaultLoadout(ship.stats);
    this.pending.push({ k: 'spawn', id: ship.id, x: p.x, y: p.y });
  }
}
