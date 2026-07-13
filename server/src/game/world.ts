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
  generateMap,
  hullEndpoints,
  mulberry32,
  resolveBoundary,
  resolveShipIslands,
  stepShell,
  stepShip,
  wrapPositive,
  type BallisticEvent,
  type GameEvent,
  type GameMap,
  type HullTarget,
  type InputMsg,
  type Rng,
  type ShellOutcome,
  type ShellState,
  type ShipState,
} from '@salvo/shared';
import { freshGunCooldowns } from './combat.js';
import {
  WEAPON_SYSTEMS,
  addMine,
  checkMineTriggers,
  freshMineCooldown,
  freshTorpedoCooldowns,
  type FireContext,
  type MineState,
} from './weapons/index.js';
import { InputStore, neutralInput } from './inputs.js';
import { pickSpawn } from './spawn.js';

const TAU = Math.PI * 2;

/** Everything the server tracks per ship, on top of the shared kinematic state. */
export interface ShipRecord {
  id: string;
  name: string;
  isDrone: boolean;
  state: ShipState;
  hp: number;
  alive: boolean;
  input: InputMsg; // latest applied input (validated + clamped)
  lastAckSeq: number; // highest input seq applied to the sim
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
  gunCooldowns: number[]; // ms remaining per broadside mount
  torpedoCooldowns: number[]; // ms remaining per bow tube
  mineCooldown: number; // ms remaining until the next mine can be dropped
  kills: number; // hulls this ship has sunk
  deaths: number; // times this ship has been sunk
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

  /** ms since world creation — the one server clock. */
  now = 0;
  /** Fixed-step counter. */
  tick = 0;

  private rng: Rng;
  private shellSeq = 0;
  private mineSeq = 0;
  /** Events queued since the last completed step (joins, sinks, respawns). */
  private pending: GameEvent[] = [];
  /** Events belonging to the most recently completed tick (read by frames). */
  private events: GameEvent[] = [];

  constructor(seed: number, playerCap: number = CONFIG.match.fillTo) {
    this.playerCap = playerCap;
    this.map = generateMap(seed, playerCap);
    this.rng = mulberry32((seed ^ 0x9e3779b9) >>> 0); // spawn stream, decorrelated from mapgen
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
  addShip(id: string, name: string, isDrone = false): ShipRecord {
    const occupied = [...this.ships.values()].map((s) => ({ x: s.state.x, y: s.state.y }));
    const p = pickSpawn(this.map, occupied, this.rng);
    const rec: ShipRecord = {
      id,
      name,
      isDrone,
      state: { x: p.x, y: p.y, heading: Math.atan2(-p.y, -p.x), speed: 0 },
      hp: CONFIG.ship.hp,
      alive: true,
      input: neutralInput(),
      lastAckSeq: 0,
      respawnAt: 0,
      sweepAngle: 0,
      prevSweepAngle: 0,
      seenBallistics: new Set(),
      gunCooldowns: freshGunCooldowns(),
      torpedoCooldowns: freshTorpedoCooldowns(),
      mineCooldown: freshMineCooldown(),
      kills: 0,
      deaths: 0,
    };
    this.ships.set(id, rec);
    this.pending.push({ k: 'spawn', id, x: p.x, y: p.y });
    return rec;
  }

  /** Remove a ship entirely (client left). */
  removeShip(id: string): void {
    this.ships.delete(id);
    this.inputs.remove(id);
  }

  /**
   * Sink a ship: dead, hp 0, respawn scheduled, death counted. Attributes a
   * kill to `by` when it names a different living-or-dead ship. Combat routes
   * damage through here; tests drive it directly.
   */
  sinkShip(id: string, by?: string): void {
    const ship = this.ships.get(id);
    if (!ship || !ship.alive) return;
    ship.alive = false;
    ship.hp = 0;
    ship.state.speed = 0;
    ship.deaths += 1;
    ship.respawnAt = this.now + CONFIG.ship.respawnDelay;
    if (by && by !== id) {
      const killer = this.ships.get(by);
      if (killer) killer.kills += 1;
    }
    this.pending.push({ k: 'sunk', id, by });
  }

  /** Advance the simulation one fixed step (default SIM_DT = 50ms). */
  step(dtMs: number = CONFIG.tick.simDtMs): void {
    this.tick += 1;
    this.now += dtMs;
    const dt = dtMs / 1000;

    this.applyInputs();
    this.stepShips(dt);
    this.resolveCollisions();
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

  /** Kinematics for every living hull (shared stepShip, same as prediction). */
  private stepShips(dt: number): void {
    for (const ship of this.ships.values()) {
      if (!ship.alive) continue;
      stepShip(ship.state, ship.input, CONFIG.ship, dt);
    }
  }

  /**
   * Ship vs island then vs map edge — both via the shared collision module, so
   * client prediction resolves rocks and the boundary identically (no divergence).
   */
  private resolveCollisions(): void {
    for (const ship of this.ships.values()) {
      if (!ship.alive) continue;
      resolveShipIslands(ship.state, this.map.islands);
      resolveBoundary(ship.state, this.map.radius);
    }
  }

  /** Alive hull capsules (post-move) that shells test against this tick. */
  private aliveHulls(): HullTarget[] {
    const hulls: HullTarget[] = [];
    for (const ship of this.ships.values()) {
      if (!ship.alive) continue;
      const h = hullEndpoints(ship.state.x, ship.state.y, ship.state.heading);
      h.id = ship.id;
      hulls.push(h);
    }
    return hulls;
  }

  /** Advance every live ballistic; spent ones emit a boom (+ damage on a hit). */
  private stepShells(dt: number, hulls: HullTarget[]): void {
    for (const [id, shell] of this.shells) {
      const outcome = stepShell(shell, { islands: this.map.islands, hulls, now: this.now, dt });
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

  /** Apply damage to a hull, emitting dmg (+ sink on death). */
  private hitShip(victim: ShipRecord, amount: number, byId: string): void {
    victim.hp -= amount;
    this.pending.push({ k: 'dmg', id: victim.id, amount, hp: Math.max(0, victim.hp) });
    if (victim.hp <= 0) this.sinkShip(victim.id, byId);
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
    this.hitShip(victim, shell.damage ?? CONFIG.gun.damage, shell.ownerId);
  }

  /**
   * Tick EVERY weapon's cooldowns for every ship (regardless of selection), then
   * route this tick's fire to the selected weapon system. Systems reach the
   * World only through the narrow FireContext (spawn ballistics / drop mines).
   */
  private fireControl(dtMs: number): void {
    for (const ship of this.ships.values()) {
      for (const sys of WEAPON_SYSTEMS) sys.tick(ship, dtMs);
      if (!ship.alive || !ship.input.fire) continue;
      WEAPON_SYSTEMS[ship.input.weapon].fire(this.fireContext(ship));
    }
  }

  /** The capabilities a weapon system needs to fire this ship this tick. */
  private fireContext(ship: ShipRecord): FireContext {
    return {
      ship,
      now: this.now,
      mkId: () => this.nextBallisticId(),
      spawnBallistic: (shell) => this.spawnBallistic(shell),
      dropMine: (x, y) => this.spawnMine(ship.id, x, y),
    };
  }

  /** Store a newly-fired ballistic + queue its one-time reveal event. */
  private spawnBallistic(shell: ShellState): void {
    this.shells.set(shell.id, shell);
    this.pending.push(this.ballisticEvent(shell));
  }

  /** Store a newly-dropped mine (per-player + global caps enforced in addMine). */
  private spawnMine(ownerId: string, x: number, y: number): void {
    addMine(this.mines, ownerId, x, y, this.now, this.nextMineId());
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
      k: shell.kind ?? 'shell',
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
    const delta = (TAU * dtMs) / CONFIG.vision.sweepPeriod;
    for (const ship of this.ships.values()) {
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
    ship.hp = CONFIG.ship.hp;
    ship.alive = true;
    ship.respawnAt = 0;
    ship.gunCooldowns = freshGunCooldowns();
    ship.torpedoCooldowns = freshTorpedoCooldowns();
    ship.mineCooldown = freshMineCooldown();
    this.pending.push({ k: 'spawn', id: ship.id, x: p.x, y: p.y });
  }
}
