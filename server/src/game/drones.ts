// Target drones — dumb, weaponless hulls that fill empty match slots so a solo
// (or short-handed) human still gets a full battle royale. A drone is an
// ORDINARY ship (World.addShip with isDrone=true); it has no client. The
// DroneController is its "hands": every sim tick it builds a sanitized-shape
// InputMsg per live drone and submits it through the EXACT same
// World.submitInput / InputStore path a human uses — proving the design goal
// that inputs are the only interface into the simulation.
//
// STRUCTURAL GUARANTEE — the controller has NO fire code path: every InputMsg
// it emits carries `fireSeq: 0, aimDist: 0, aim: 0, slot: 0, fireT: 0`. A constant
// fireSeq is never newer than the ship's consumed lastFireSeq, so drones can
// never shoot — there is nowhere in this file that could ever advance the
// click counter.
//
// Steering is deliberately dumb (this is NOT an AI): each drone waypoint-sails
// to a random point inside the current safe zone at a per-leg throttle, seeded
// per drone via mulberry32 so behavior is deterministic + testable. Avoidance
// overrides, in priority order:
//   1. outside the zone  -> steer straight at the zone center (they should only
//      die to the storm through incompetence, never by parking outside);
//   2. island ahead      -> bias the rudder away from it (+ never pick a
//      waypoint that sits inside an island);
//   3. near the map edge -> steer back toward center.

import {
  angleDiff,
  bearing,
  dist,
  isOutside,
  mulberry32,
  type Circle,
  type InputMsg,
  type Rng,
  type Vec2,
} from '@salvo/shared';
import type { ShipRecord, World } from './world.js';

const TAU = Math.PI * 2;
const ORIGIN: Vec2 = { x: 0, y: 0 };

/** Distance (u) at which a drone considers its waypoint reached and retargets. */
const WAYPOINT_REACH = 60;
/** Lookahead (u) along heading for the island-avoidance probe. */
const ISLAND_LOOKAHEAD = 120;
/** Clearance (u) a waypoint must keep from any island (else it is rejected). */
const ISLAND_CLEARANCE = 30;
/** Steer back toward center once within this distance (u) of the map boundary. */
const BOUNDARY_MARGIN = 80;
/** Proportional gain turning heading error into rudder. */
const RUDDER_GAIN = 2;
/** Rudder magnitude an active avoidance override contributes. */
const AVOID_STRENGTH = 0.8;
/** Waypoints are picked within this fraction of the current zone radius. */
const WAYPOINT_ZONE_FRACTION = 0.8;
const MIN_THROTTLE = 0.5;
const MAX_THROTTLE = 1.0;

function clampUnit(v: number): number {
  if (v < -1) return -1;
  if (v > 1) return 1;
  return v;
}

/** Per-drone steering memory. */
interface DroneMind {
  rng: Rng;
  seq: number; // monotonic input seq (InputStore requires strictly-increasing)
  waypoint: Vec2 | null;
  throttle: number; // current leg throttle, re-rolled on each retarget
}

/**
 * Drives every registered drone through the normal input path. Owned by World
 * (it needs the island/zone state and the clock each tick, and World owns both);
 * still zero Colyseus. World calls tick() once per step BEFORE applyInputs.
 */
export class DroneController {
  private readonly minds = new Map<string, DroneMind>();
  private counter = 0;

  constructor(
    private readonly world: World,
    private readonly seed: number,
  ) {}

  /** How many drones are currently under control. */
  get size(): number {
    return this.minds.size;
  }

  /** Register a drone (called by World.addShip when isDrone). */
  add(id: string): void {
    this.counter += 1;
    const rng = mulberry32((this.seed + this.counter * 0x9e3779b9) >>> 0);
    this.minds.set(id, { rng, seq: 0, waypoint: null, throttle: legThrottle(rng) });
  }

  /** Forget a drone (called by World.removeShip). */
  remove(id: string): void {
    this.minds.delete(id);
  }

  /** Read a drone's current waypoint (testing/inspection only). */
  waypointOf(id: string): Vec2 | null {
    return this.minds.get(id)?.waypoint ?? null;
  }

  /** Submit one input per live drone. Dead drones idle (no input submitted). */
  tick(): void {
    for (const [id, mind] of this.minds) {
      const ship = this.world.ships.get(id);
      if (!ship) {
        this.minds.delete(id);
        continue;
      }
      if (!ship.alive) continue;
      this.world.submitInput(id, this.buildInput(ship, mind));
    }
  }

  /** The sanitized-shape input for one drone this tick. fireSeq is ALWAYS 0. */
  private buildInput(ship: ShipRecord, mind: DroneMind): InputMsg {
    const brg = this.steerTarget(ship, mind);
    const track = clampUnit(angleDiff(ship.state.heading, brg) * RUDDER_GAIN);
    const rudder = clampUnit(track + this.avoidIslands(ship) + this.boundaryBias(ship));
    mind.seq += 1;
    // fireT: 0 is the explicit no-claim sentinel — drones (which can never
    // click anyway) always ride the zero-compensation path.
    return { seq: mind.seq, throttle: mind.throttle, rudder, aim: 0, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0 };
  }

  /** Bearing the drone wants to hold, applying the zone/waypoint overrides. */
  private steerTarget(ship: ShipRecord, mind: DroneMind): number {
    const pos = ship.state;
    // Override 1: outside the safe zone -> beeline for center; drop the waypoint
    // so a fresh one is picked once the drone is back inside.
    if (isOutside(pos, this.world.zoneRadius)) {
      mind.waypoint = null;
      return bearing(pos, ORIGIN);
    }
    return bearing(pos, this.currentWaypoint(pos, mind));
  }

  /** The drone's live waypoint, retargeting when reached / missing / fouled. */
  private currentWaypoint(pos: Vec2, mind: DroneMind): Vec2 {
    if (this.needsWaypoint(pos, mind)) {
      mind.waypoint = this.pickWaypoint(mind.rng);
      mind.throttle = legThrottle(mind.rng);
    }
    return mind.waypoint ?? ORIGIN;
  }

  /** Retarget when there is no waypoint, it is reached, or it fell in an island. */
  private needsWaypoint(pos: Vec2, mind: DroneMind): boolean {
    const wp = mind.waypoint;
    if (!wp) return true;
    if (dist(pos, wp) < WAYPOINT_REACH) return true;
    return this.insideIsland(wp);
  }

  /** A random point uniformly inside 0.8x the current zone radius, island-free. */
  private pickWaypoint(rng: Rng): Vec2 {
    const max = this.world.zoneRadius * WAYPOINT_ZONE_FRACTION;
    for (let i = 0; i < 16; i++) {
      const a = rng.float(0, TAU);
      const r = Math.sqrt(rng.next()) * max; // sqrt => uniform over the disc
      const p = { x: Math.cos(a) * r, y: Math.sin(a) * r };
      if (!this.insideIsland(p)) return p;
    }
    return ORIGIN; // center is always island-free (mapgen's inner exclusion)
  }

  /** True iff `p` sits inside (or hugging) any island. */
  private insideIsland(p: Vec2): boolean {
    return this.world.map.islands.some((c) => dist(p, c) <= c.r + ISLAND_CLEARANCE);
  }

  /** Override 2: sum a rudder bias steering away from every island ahead. */
  private avoidIslands(ship: ShipRecord): number {
    const { x, y, heading } = ship.state;
    const fx = Math.cos(heading);
    const fy = Math.sin(heading);
    let bias = 0;
    for (const c of this.world.map.islands) {
      bias += islandBias(c, x, y, fx, fy);
    }
    return bias;
  }

  /** Override 3: near the map edge, steer back toward center. */
  private boundaryBias(ship: ShipRecord): number {
    const pos = ship.state;
    if (Math.hypot(pos.x, pos.y) < this.world.map.radius - BOUNDARY_MARGIN) return 0;
    return clampUnit(angleDiff(pos.heading, bearing(pos, ORIGIN))) * AVOID_STRENGTH;
  }
}

/** Rudder bias steering away from one island, or 0 if it is not a threat ahead. */
function islandBias(c: Circle, x: number, y: number, fx: number, fy: number): number {
  const dx = c.x - x;
  const dy = c.y - y;
  const ahead = dx * fx + dy * fy; // projection onto heading
  if (ahead <= 0 || Math.hypot(dx, dy) > ISLAND_LOOKAHEAD + c.r) return 0;
  // cross(heading, toIsland) > 0 => island is to port (left); steer starboard
  // (negative rudder = clockwise) and vice-versa.
  const side = fx * dy - fy * dx;
  return side > 0 ? -AVOID_STRENGTH : AVOID_STRENGTH;
}

function legThrottle(rng: Rng): number {
  return rng.float(MIN_THROTTLE, MAX_THROTTLE);
}
