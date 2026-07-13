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
import { fireGuns, freshGunCooldowns, tickGunCooldowns } from './combat.js';
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
   * Shell ids this observer has already been sent a `shell` event for.
   * Perception emits each ballistic exactly once per observer (at launch for
   * the owner, at first sight for everyone else); entries are forgotten when
   * the shell is spent (see forgetShell).
   */
  seenShells: Set<string>;
  gunCooldowns: number[]; // ms remaining per broadside mount
  kills: number; // hulls this ship has sunk
  deaths: number; // times this ship has been sunk
}

export class World {
  readonly map: GameMap;
  readonly playerCap: number;
  readonly ships = new Map<string, ShipRecord>();
  readonly shells = new Map<string, ShellState>();
  readonly inputs = new InputStore();

  /** ms since world creation — the one server clock. */
  now = 0;
  /** Fixed-step counter. */
  tick = 0;

  private rng: Rng;
  private shellSeq = 0;
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
      seenShells: new Set(),
      gunCooldowns: freshGunCooldowns(),
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
    this.stepShells(dt);
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

  /** Advance every live shell; spent shells emit a boom (+ damage on a hit). */
  private stepShells(dt: number): void {
    const hulls = this.aliveHulls();
    for (const [id, shell] of this.shells) {
      const outcome = stepShell(shell, { islands: this.map.islands, hulls, now: this.now, dt });
      if (outcome.kind === 'travel') continue;
      this.shells.delete(id);
      this.forgetShell(id);
      this.resolveShell(shell, outcome);
    }
  }

  /** Drop a spent shell from every observer's seen-shell set (no leaks, no growth). */
  private forgetShell(id: string): void {
    for (const ship of this.ships.values()) ship.seenShells.delete(id);
  }

  /** Turn a spent shell's outcome into boom (+ dmg/sink) events. */
  private resolveShell(shell: ShellState, outcome: ShellOutcome): void {
    if (outcome.kind === 'travel') return;
    if (outcome.kind !== 'hitShip') {
      this.pending.push({ k: 'boom', id: shell.id, x: outcome.x, y: outcome.y });
      return;
    }
    this.pending.push({ k: 'boom', id: shell.id, hit: outcome.victimId, x: outcome.x, y: outcome.y });
    const victim = this.ships.get(outcome.victimId);
    if (!victim || !victim.alive) return;
    victim.hp -= CONFIG.gun.damage;
    this.pending.push({
      k: 'dmg',
      id: victim.id,
      amount: CONFIG.gun.damage,
      hp: Math.max(0, victim.hp),
    });
    if (victim.hp <= 0) this.sinkShip(victim.id, shell.ownerId);
  }

  /** Tick all gun cooldowns, then fire eligible mounts and spawn their shells. */
  private fireControl(dtMs: number): void {
    for (const ship of this.ships.values()) {
      tickGunCooldowns(ship.gunCooldowns, dtMs);
      const shells = fireGuns(ship, this.now, () => this.nextShellId());
      for (const shell of shells) {
        this.shells.set(shell.id, shell);
        this.pending.push(this.shellEvent(shell));
      }
    }
  }

  private nextShellId(): string {
    this.shellSeq += 1;
    return `s${this.shellSeq}`;
  }

  /** One-time ballistic params the client dead-reckons from. */
  private shellEvent(shell: ShellState): BallisticEvent {
    const speed = Math.hypot(shell.vx, shell.vy);
    const ttl = speed > 0 ? (shell.distLeft / speed) * 1000 : 0;
    return {
      k: 'shell',
      id: shell.id,
      x: shell.x,
      y: shell.y,
      vx: shell.vx,
      vy: shell.vy,
      t: shell.bornAt,
      ttl,
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
    this.pending.push({ k: 'spawn', id: ship.id, x: p.x, y: p.y });
  }
}
