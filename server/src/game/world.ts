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
  mulberry32,
  stepShip,
  wrapPositive,
  type GameEvent,
  type GameMap,
  type InputMsg,
  type Rng,
  type ShipState,
} from '@salvo/shared';
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
  sweepAngle: number; // rad — current radar sweep angle
}

export class World {
  readonly map: GameMap;
  readonly ships = new Map<string, ShipRecord>();
  readonly inputs = new InputStore();

  /** ms since world creation — the one server clock. */
  now = 0;
  /** Fixed-step counter. */
  tick = 0;

  private rng: Rng;
  /** Events queued since the last completed step (joins, sinks, respawns). */
  private pending: GameEvent[] = [];
  /** Events belonging to the most recently completed tick (read by frames). */
  private events: GameEvent[] = [];

  constructor(seed: number, playerCap: number = CONFIG.match.fillTo) {
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
   * Sink a ship: dead, hp 0, respawn scheduled. Combat (step 8) will route
   * damage through here; tests drive it directly.
   */
  sinkShip(id: string, by?: string): void {
    const ship = this.ships.get(id);
    if (!ship || !ship.alive) return;
    ship.alive = false;
    ship.hp = 0;
    ship.state.speed = 0;
    ship.respawnAt = this.now + CONFIG.ship.respawnDelay;
    this.pending.push({ k: 'sunk', id, by });
  }

  /** Advance the simulation one fixed step (default SIM_DT = 50ms). */
  step(dtMs: number = CONFIG.tick.simDtMs): void {
    this.tick += 1;
    this.now += dtMs;
    const dt = dtMs / 1000;

    this.applyInputs();
    this.stepShips(dt);
    this.resolveBoundary();
    // ---- SEAM (step 7): ship-island collision (push-out + speed damp) ----
    // ---- SEAM (step 8): shells (swept collision) + fire control ----------
    // ---- SEAM (step 10): radar paint window (prev sweep angle -> current) -
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

  /** Map edge: clamp position to the circle and damp speed while pressing out. */
  private resolveBoundary(): void {
    const r = this.map.radius;
    for (const ship of this.ships.values()) {
      if (!ship.alive) continue;
      const s = ship.state;
      const d = Math.hypot(s.x, s.y);
      if (d <= r) continue;
      const scale = r / d;
      s.x *= scale;
      s.y *= scale;
      s.speed *= CONFIG.ship.islandSpeedMult; // same damp factor as island grazing
    }
  }

  /**
   * Advance each radar sweep. STUB: rotation only — the paint window (which
   * targets the beam crossed this tick) lands in step 10 alongside blips.
   */
  private advanceSweeps(dtMs: number): void {
    const delta = (TAU * dtMs) / CONFIG.vision.sweepPeriod;
    for (const ship of this.ships.values()) {
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
    this.pending.push({ k: 'spawn', id: ship.id, x: p.x, y: p.y });
  }
}
