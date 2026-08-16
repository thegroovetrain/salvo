// PvE FLEET CONTROLLER (Story 5.6 — rewritten from the weaponless target-drone
// controller it replaces).
//
// A fleet ship is an ORDINARY ship (World.addShip with role='fleet'); it has no
// client. The FleetController is its "hands": every sim tick it builds a
// sanitized-shape InputMsg per live hull and submits it through the EXACT same
// World.submitInput / InputStore path a human uses — which is still the design
// goal that inputs are the only interface into the simulation.
//
// WHAT CHANGED, AND WHY THE OLD STRUCTURAL GUARANTEE IS GONE
// ----------------------------------------------------------
// The retired controller documented a "STRUCTURAL GUARANTEE" that drones could
// never shoot: it emitted `fireSeq: 0` forever, and a constant counter can
// never out-run the ship's consumed `lastFireSeq`. Story 5.6 arms these hulls
// (Eric ruling 2026-08-14), so that guarantee is DELIBERATELY REPLACED rather
// than quietly edited. What survives of it, and what now stands in its place:
//   * `actSeq: 0` / `actSlot: 0` — still constant. Fleet ships fit no ability
//     (loadout.ts gives them [gun, empty, empty, empty]), so they can never
//     activate one. Structural, not policy.
//   * `hornSeq: 0` — still constant; World's fleet-hull gate backstops it.
//   * `fireSeq` — NOW ADVANCES, but only through `wantsShot()`, which is the
//     single place in this file that can pull a trigger. It requires an
//     acquired target, live line of sight, and a loaded gun. There is no other
//     path, and `slot` is hard-coded 0 (the gun) at the one call site.
//   * `fireT: 0` — still the explicit no-claim sentinel: a server-driven
//     shooter rides the zero-compensation path and never back-dates.
//
// THE BEHAVIOUR MODEL (epic-5 amendments 35/36, all Eric rulings 2026-08-14)
// --------------------------------------------------------------------------
// They do not attack first. They defend themselves, and their friends' fights
// are their business only if they SAW it happen:
//   * being hit acquires the attacker (mines excepted — a mine's layer may be
//     dead or across the map, so there is nothing to chase);
//   * the witness rule fires ONCE, at the instant of the hit: every fleet ship
//     with LOS to BOTH attacker and victim, and no target of its own, joins.
//     A hull that rounds an island two seconds later never joins that fight;
//   * a held target is never given up for a new attacker — re-acquisition
//     happens only after the current one is lost;
//   * memory runs `CONFIG.fleet.memoryMs` from the last CONTACT, where contact
//     is "saw it" OR "was hit by it". That single definition is what makes
//     Eric's close-on-the-bearing ruling work: a captain sniping from beyond
//     both sight ranges keeps refreshing contact with every shell, so the hull
//     keeps coming; stop shooting and it gives up 3 s later;
//   * they never damage and never aggro each other (the world-side burst
//     exclusion enforces the damage half).
//
// STEERING is dumb on purpose — this is self-defence, not an AI opponent
// (Epic 6 owns combat bots). Priority order:
//   1. outside the ring   -> beeline for the LIVE ring centre. Fleet ships are
//      ruled never to leave the ring, so this outranks even a live target;
//   2. un-beaching        -> if we have been commanding ahead and going
//      nowhere, back off astern for a moment and turn out;
//   3. a target           -> steer at its last known position;
//   4. otherwise          -> the FLEET's shared waypoint plus this hull's own
//      constant formation offset, so the nine travel together and hold roughly
//      the spread they spawned with (which is what keeps the witness rule
//      meaningful at 9:00 and not only at 1:00).
// Island avoidance and the map-edge bias are summed onto the rudder on top of
// all four, exactly as before.

import {
  CONFIG,
  angleDiff,
  bearing,
  dist,
  droneSizeOf,
  isAfloat,
  isOutside,
  islandDistance,
  mulberry32,
  nearestCoastPoint,
  wrapAngle,
  type DroneSizeId,
  type InputMsg,
  type Island,
  type Rng,
  type Vec2,
} from '@salvo/shared';
import { shipSees } from './signals.js';
import { isFleetHull } from './participants.js';
import type { ShipRecord, World } from './world.js';

const TAU = Math.PI * 2;
const ORIGIN: Vec2 = { x: 0, y: 0 };

/** Distance (u) at which a fleet considers its shared waypoint reached. */
const WAYPOINT_REACH = 120;
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
/** Cruise throttle while roving (they are not in a hurry). */
const CRUISE_THROTTLE = 0.6;
/** Throttle while pursuing a target. */
const PURSUE_THROTTLE = 1.0;
/** Astern throttle while un-beaching. */
const UNBEACH_THROTTLE = -1.0;
/** u/s — below this while commanding ahead, we are considered to be going nowhere. */
const STUCK_SPEED = 3;
/** ms of going nowhere before the un-beach manoeuvre arms. */
const STUCK_TRIP_MS = 1200;
/** ms the un-beach manoeuvre runs once armed. */
const UNBEACH_MS = 1500;
/** Fixed-point iterations for the lead solution (converges well inside 3). */
const LEAD_ITERATIONS = 3;

function clampUnit(v: number): number {
  if (v < -1) return -1;
  if (v > 1) return 1;
  return v;
}

/** Per-hull memory. `offset` is CONSTANT for the hull's life — it is both the
 *  spawn scatter and the formation station, which is why the fleet keeps its
 *  shape instead of collapsing onto one point. */
interface FleetMind {
  rng: Rng;
  seq: number; // monotonic input seq (InputStore requires strictly-increasing)
  fireSeq: number; // monotonic click counter — advanced ONLY by wantsShot()
  fleetId: number;
  size: DroneSizeId;
  offset: Vec2; // station relative to the fleet waypoint (and the spawn anchor)
  targetId: string | null;
  /** Server ms of the last CONTACT with the target — seen OR hit by. */
  lastContactMs: number;
  /** Last position we knew the target to be at (the chase point). */
  lastKnown: Vec2 | null;
  stuckMs: number;
  unbeachUntil: number;
}

/** Per-fleet shared state: one waypoint stream for all nine hulls. */
interface Fleet {
  rng: Rng;
  waypoint: Vec2 | null;
}

/**
 * Drives every registered fleet ship through the normal input path. Owned by
 * World (it needs the island/zone state and the clock each tick, and World owns
 * both); still zero Colyseus. World calls tick() once per step BEFORE
 * applyInputs, and calls onDamaged() from hitShip.
 */
export class FleetController {
  private readonly minds = new Map<string, FleetMind>();
  private readonly fleets = new Map<number, Fleet>();
  private counter = 0;

  constructor(
    private readonly world: World,
    private readonly seed: number,
  ) {}

  /** How many fleet hulls are currently under control. */
  get size(): number {
    return this.minds.size;
  }

  /**
   * Register a fleet hull. `fleetId` groups hulls into one fleet (shared
   * waypoint stream); `offset` is its constant formation station.
   */
  add(id: string, hullSize: DroneSizeId, fleetId: number, offset: Vec2): void {
    this.counter += 1;
    const rng = mulberry32((this.seed + this.counter * 0x9e3779b9) >>> 0);
    if (!this.fleets.has(fleetId)) {
      this.fleets.set(fleetId, {
        rng: mulberry32((this.seed + fleetId * 0x85ebca6b) >>> 0),
        waypoint: null,
      });
    }
    this.minds.set(id, {
      rng,
      seq: 0,
      fireSeq: 0,
      fleetId,
      size: hullSize,
      offset,
      targetId: null,
      lastContactMs: 0,
      lastKnown: null,
      stuckMs: 0,
      unbeachUntil: 0,
    });
  }

  /** Forget a fleet hull (called by World.removeShip). */
  remove(id: string): void {
    this.minds.delete(id);
  }

  /** Read a hull's current target (testing/inspection only). */
  targetOf(id: string): string | null {
    return this.minds.get(id)?.targetId ?? null;
  }

  /** Read a fleet's shared waypoint (testing/inspection only). */
  waypointOf(id: string): Vec2 | null {
    const mind = this.minds.get(id);
    return mind ? (this.fleets.get(mind.fleetId)?.waypoint ?? null) : null;
  }

  /** True iff this fleet hull has acquired `observerId` — the source of the
   *  self-private `Contact.aggro` mark (epic-5 amendment 40). */
  isTargeting(fleetShipId: string, observerId: string): boolean {
    return this.minds.get(fleetShipId)?.targetId === observerId;
  }

  /**
   * THE AGGRO ENTRY POINT — called by World.hitShip when a fleet hull takes
   * damage. `byId` is the attacker; `fromMine` suppresses aggro entirely
   * (amendment 36: a mine gives no bearing worth chasing).
   *
   * Runs the victim's own acquisition and then the ONE-SHOT witness sweep.
   *
   * THE VICTIM'S ACQUISITION IS GUARDED, and the guard is the whole of
   * amendment 36's *"a held target is NOT given up for a new attacker"*: a
   * hull already hunting someone keeps hunting them, so a friend shelling
   * your pursuer CANNOT pull it off you (*"third-party rescue is therefore a
   * real play"* — ruled the other way, deliberately). Re-acquisition happens
   * only once the current target is LOST, through refreshTarget's memory
   * expiry. Hits from the CURRENT target still land in acquire(), because
   * that is the contact refresh Eric's close-on-the-bearing ruling runs on —
   * a sniper outside both sight ranges keeps the hunt alive with every shell.
   */
  onDamaged(victimId: string, byId: string | undefined, fromMine: boolean): void {
    if (!byId || fromMine || byId === victimId) return;
    const victim = this.world.ships.get(victimId);
    const attacker = this.world.ships.get(byId);
    const mind = this.minds.get(victimId);
    if (!victim || !attacker || !mind) return;
    if (isFleetHull(attacker)) return; // fleet ships never aggro each other
    if (mind.targetId === null || mind.targetId === attacker.id) this.acquire(victimId, attacker);
    this.propagateWitnesses(victim, attacker);
  }

  /** Point one fleet hull at `attacker`, refreshing its contact stamp. */
  private acquire(fleetShipId: string, attacker: ShipRecord): void {
    const mind = this.minds.get(fleetShipId);
    if (!mind) return;
    mind.targetId = attacker.id;
    mind.lastContactMs = this.world.now;
    mind.lastKnown = { x: attacker.state.x, y: attacker.state.y };
  }

  /**
   * The witness rule, evaluated ONCE at the instant of the hit (amendment 35):
   * every OTHER fleet hull that can see both the attacker and the victim, and
   * has no target of its own, joins the fight.
   */
  private propagateWitnesses(victim: ShipRecord, attacker: ShipRecord): void {
    const islands = this.world.map.islands;
    const now = this.world.now;
    for (const [id, mind] of this.minds) {
      if (id === victim.id || mind.targetId !== null) continue;
      const witness = this.world.ships.get(id);
      if (!witness || !isAfloat(witness.lifecycle)) continue;
      if (!shipSees(witness, attacker, islands, now)) continue;
      if (!shipSees(witness, victim, islands, now)) continue;
      this.acquire(id, attacker);
    }
  }

  /** Submit one input per live fleet hull. Dead hulls idle (no input). */
  tick(): void {
    for (const [id, mind] of this.minds) {
      const ship = this.world.ships.get(id);
      if (!ship) {
        this.minds.delete(id);
        continue;
      }
      if (!isAfloat(ship.lifecycle)) {
        // A HULL THAT LEAVES `alive` DROPS ITS TARGET (review gate, Story 5.6).
        // Its input tick is skipped on the line below, so through the whole
        // sinking window it is structurally unable to steer or fire — but
        // refreshTarget stops running with it, so `isTargeting()` would keep
        // answering true and the self-private `aggro` mark (amendment 40)
        // would go on claiming a threat that cannot exist. Clearing here is
        // the ONE place: the mark reads the mind, so the mind must be the
        // thing that stops being true.
        mind.targetId = null;
        mind.lastKnown = null;
        continue;
      }
      this.refreshTarget(ship, mind);
      this.world.submitInput(id, this.buildInput(ship, mind));
    }
  }

  /**
   * Re-resolve the target: drop it if it is gone or sunk, refresh contact while
   * we can see it, and forget it once `memoryMs` has passed since the last
   * contact (seen OR hit by — see the file header).
   */
  private refreshTarget(ship: ShipRecord, mind: FleetMind): void {
    if (mind.targetId === null) return;
    const target = this.world.ships.get(mind.targetId);
    if (!target || !isAfloat(target.lifecycle)) {
      mind.targetId = null;
      mind.lastKnown = null;
      return;
    }
    const now = this.world.now;
    if (shipSees(ship, target, this.world.map.islands, now)) {
      mind.lastContactMs = now;
      mind.lastKnown = { x: target.state.x, y: target.state.y };
      return;
    }
    if (now - mind.lastContactMs > CONFIG.fleet.memoryMs) {
      mind.targetId = null;
      mind.lastKnown = null;
    }
  }

  /** The sanitized-shape input for one fleet hull this tick. */
  private buildInput(ship: ShipRecord, mind: FleetMind): InputMsg {
    const unbeaching = this.updateStuck(ship, mind);
    const brg = this.steerTarget(ship, mind, unbeaching);
    const track = clampUnit(angleDiff(ship.state.heading, brg) * RUDDER_GAIN);
    const rudder = clampUnit(track + this.avoidIslands(ship) + this.boundaryBias(ship));
    const shot = this.wantsShot(ship, mind);
    mind.seq += 1;
    return {
      seq: mind.seq,
      throttle: this.throttleFor(mind, unbeaching),
      rudder,
      aim: shot?.aim ?? 0,
      fireSeq: mind.fireSeq,
      aimDist: shot?.aimDist ?? 0,
      slot: 0, // the gun, and the only weapon a fleet hull fits
      fireT: 0, // no-claim sentinel: a server-driven shooter never back-dates
      actSeq: 0, // structurally inert — fleet hulls fit no ability
      actSlot: 0,
      hornSeq: 0, // fleet hulls never honk
    };
  }

  /**
   * Track "commanding ahead but going nowhere" and arm the astern manoeuvre.
   * Returns true while un-beaching. The grounding damp caps a beached hull
   * well above zero (cycle 59), so this tests a LOW speed, never a zero one.
   */
  private updateStuck(ship: ShipRecord, mind: FleetMind): boolean {
    const now = this.world.now;
    if (now < mind.unbeachUntil) return true;
    if (Math.abs(ship.state.speed) < STUCK_SPEED) {
      mind.stuckMs += CONFIG.tick.simDtMs;
      if (mind.stuckMs >= STUCK_TRIP_MS) {
        mind.stuckMs = 0;
        mind.unbeachUntil = now + UNBEACH_MS;
        return true;
      }
      return false;
    }
    mind.stuckMs = 0;
    return false;
  }

  private throttleFor(mind: FleetMind, unbeaching: boolean): number {
    if (unbeaching) return UNBEACH_THROTTLE;
    return mind.targetId !== null ? PURSUE_THROTTLE : CRUISE_THROTTLE;
  }

  /** The bearing this hull wants to hold, applying the four overrides. */
  private steerTarget(ship: ShipRecord, mind: FleetMind, unbeaching: boolean): number {
    const pos = ship.state;
    // Override 1: outside the ring -> beeline for the LIVE ring centre. Fleet
    // ships are ruled never to leave the ring, so this outranks a live target.
    const ring = this.world.zoneLiveRing;
    if (isOutside(pos, ring.cx, ring.cy, ring.r)) {
      return bearing(pos, { x: ring.cx, y: ring.cy });
    }
    // Override 2: while backing off an island, aim AWAY from where we were
    // pointed so the reverse actually unwinds the grounding.
    if (unbeaching) return wrapAngle(pos.heading + Math.PI);
    // Override 3: a target -> its last known position.
    if (mind.lastKnown) return bearing(pos, mind.lastKnown);
    // Override 4: this hull's station on the fleet's shared waypoint.
    return bearing(pos, this.stationOf(mind));
  }

  /** This hull's steer-to point: the fleet waypoint plus its constant station
   *  offset, clamped to stay inside the live ring. */
  private stationOf(mind: FleetMind): Vec2 {
    const wp = this.fleetWaypoint(mind);
    return this.clampToRing({ x: wp.x + mind.offset.x, y: wp.y + mind.offset.y });
  }

  /** The fleet's shared waypoint, retargeted when reached / missing / fouled. */
  private fleetWaypoint(mind: FleetMind): Vec2 {
    const fleet = this.fleets.get(mind.fleetId);
    if (!fleet) return ORIGIN;
    if (this.needsWaypoint(fleet)) fleet.waypoint = this.pickWaypoint(fleet.rng);
    return fleet.waypoint ?? ORIGIN;
  }

  /** Retarget when there is none, any member reached it, or it fell ashore. */
  private needsWaypoint(fleet: Fleet): boolean {
    const wp = fleet.waypoint;
    if (!wp) return true;
    if (this.insideIsland(wp)) return true;
    for (const [id, mind] of this.minds) {
      if (this.fleets.get(mind.fleetId) !== fleet) continue;
      const ship = this.world.ships.get(id);
      if (ship && isAfloat(ship.lifecycle) && dist(ship.state, wp) < WAYPOINT_REACH) return true;
    }
    return false;
  }

  /** A random point uniformly inside 0.8x the LIVE ring (offset-center), island-free. */
  private pickWaypoint(rng: Rng): Vec2 {
    const ring = this.world.zoneLiveRing;
    const max = ring.r * WAYPOINT_ZONE_FRACTION;
    for (let i = 0; i < 16; i++) {
      const a = rng.float(0, TAU);
      const r = Math.sqrt(rng.next()) * max; // sqrt => uniform over the disc
      const p = { x: ring.cx + Math.cos(a) * r, y: ring.cy + Math.sin(a) * r };
      if (!this.insideIsland(p)) return p;
    }
    // The ring center beats the map origin as a fallback: a late offset ring
    // may not even contain the origin. Islands there are survivable (push-out).
    return { x: ring.cx, y: ring.cy };
  }

  /** Pull a point back inside the live ring so a station offset can never
   *  station a hull in the storm. */
  private clampToRing(p: Vec2): Vec2 {
    const ring = this.world.zoneLiveRing;
    const dx = p.x - ring.cx;
    const dy = p.y - ring.cy;
    const d = Math.hypot(dx, dy);
    const max = ring.r * WAYPOINT_ZONE_FRACTION;
    if (d <= max || d === 0) return p;
    const k = max / d;
    return { x: ring.cx + dx * k, y: ring.cy + dy * k };
  }

  /** True iff `p` sits ashore on (or hugging the coast of) any island.
   *  `islandDistance` is SIGNED (negative ashore) and carries its own
   *  bounding-circle broadphase, so distant islands cost one hypot. */
  private insideIsland(p: Vec2): boolean {
    return this.world.map.islands.some((isle) => islandDistance(p, isle) <= ISLAND_CLEARANCE);
  }

  /** Sum a rudder bias steering away from every coastline ahead. */
  private avoidIslands(ship: ShipRecord): number {
    const { x, y, heading } = ship.state;
    const fx = Math.cos(heading);
    const fy = Math.sin(heading);
    let bias = 0;
    for (const isle of this.world.map.islands) {
      bias += islandBias(isle, x, y, fx, fy);
    }
    return bias;
  }

  /** Near the map edge, steer back toward center. */
  private boundaryBias(ship: ShipRecord): number {
    const pos = ship.state;
    if (Math.hypot(pos.x, pos.y) < this.world.map.radius - BOUNDARY_MARGIN) return 0;
    return clampUnit(angleDiff(pos.heading, bearing(pos, ORIGIN))) * AVOID_STRENGTH;
  }

  /**
   * THE ONLY TRIGGER IN THIS FILE. Returns the aim for a shot, advancing
   * `fireSeq` exactly when one is taken, or null. Every condition must hold:
   * an acquired target, a loaded gun off cooldown, and LIVE line of sight —
   * so a hull chasing a sniper it cannot see holds its fire until it arrives.
   */
  private wantsShot(ship: ShipRecord, mind: FleetMind): { aim: number; aimDist: number } | null {
    if (mind.targetId === null) return null;
    const slot = ship.loadout[0];
    if (!slot.state || slot.state.n <= 0 || slot.state.reloadMsLeft > 0) return null;
    const target = this.world.ships.get(mind.targetId);
    if (!target || !isAfloat(target.lifecycle)) return null;
    if (!shipSees(ship, target, this.world.map.islands, this.world.now)) return null;
    const point = this.aimPoint(ship, target, mind);
    mind.fireSeq += 1;
    return { aim: bearing(ship.state, point), aimDist: dist(ship.state, point) };
  }

  /**
   * The lead-corrected, scattered aim point. The intercept is solved by fixed
   * point (3 passes is far past convergence at these speeds); the scatter is a
   * uniform disc of `CONFIG.fleet.aimScatterU[size]` around it.
   *
   * Lead is not optional flavour: over ≤330u a 500 u/s shell flies ~0.66 s, in
   * which a 45 u/s Torpedo Boat moves 30u against a 15u burst radius — so an
   * unled shot misses nearly every moving hull and a perfectly led one nearly
   * never misses. The scatter is the whole difficulty channel between sizes.
   */
  private aimPoint(ship: ShipRecord, target: ShipRecord, mind: FleetMind): Vec2 {
    const vx = Math.cos(target.state.heading) * target.state.speed;
    const vy = Math.sin(target.state.heading) * target.state.speed;
    let t = 0;
    for (let i = 0; i < LEAD_ITERATIONS; i += 1) {
      const px = target.state.x + vx * t;
      const py = target.state.y + vy * t;
      t = Math.hypot(px - ship.state.x, py - ship.state.y) / CONFIG.gun.shellSpeed;
    }
    const scatter = CONFIG.fleet.aimScatterU[mind.size];
    const a = mind.rng.float(0, TAU);
    const r = Math.sqrt(mind.rng.next()) * scatter;
    return {
      x: target.state.x + vx * t + Math.cos(a) * r,
      y: target.state.y + vy * t + Math.sin(a) * r,
    };
  }
}

/**
 * Rudder bias steering away from one island's COASTLINE, or 0 if it is not a
 * threat ahead. Keyed on the nearest point on the real coast rather than the
 * bounding-circle centre, so a hull hugs the shape of a ridge or a cove mouth
 * instead of arcing around a phantom circle (the tip of a long landmass can be
 * dead ahead while its centre is abeam — the centre test missed exactly that).
 *
 * BROADPHASE (mandatory — this runs per hull per island per tick): the
 * bounding circle rejects before any edge is visited. Only on a bounding hit
 * is the exact coast point computed.
 */
function islandBias(isle: Island, x: number, y: number, fx: number, fy: number): number {
  const cdx = isle.x - x;
  const cdy = isle.y - y;
  if (Math.hypot(cdx, cdy) > ISLAND_LOOKAHEAD + isle.r) return 0; // bounding-circle broadphase
  const coast = nearestCoastPoint({ x, y }, isle);
  if (coast.dist > ISLAND_LOOKAHEAD) return 0;
  const dx = coast.x - x;
  const dy = coast.y - y;
  if (dx * fx + dy * fy <= 0) return 0; // the coast point is astern
  // cross(heading, toCoast) > 0 => land is to port (left); steer starboard
  // (negative rudder = clockwise) and vice-versa.
  const side = fx * dy - fy * dx;
  return side > 0 ? -AVOID_STRENGTH : AVOID_STRENGTH;
}

/** The CONFIG.drones size key for a fleet hull, defaulting to `small` for a
 *  hull id that is not a fleet hull at all (unreachable via addShip's drone
 *  path; present so the controller never throws on a malformed registration). */
export function fleetSizeOf(hullId: Parameters<typeof droneSizeOf>[0]): DroneSizeId {
  return droneSizeOf(hullId) ?? 'small';
}
