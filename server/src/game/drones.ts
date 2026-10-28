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
//     (Story 8.5: loadout.ts gives them the GUN IN SLOT 0 AND EIGHT EMPTIES —
//     no boost, no weapons, no consumables), so they can never activate one.
//     Structural, not policy.
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
//   1. outside the ring   -> back into it down the ring's FLOW FIELD (Story
//      9.13, epic-9 amendments 191/192: the map is public, so a fleet plans
//      its water route over it — game/navCache.ts), around the land rather
//      than bow-on into it. Fleet ships are ruled never to leave the ring, so
//      this outranks even a live target;
//   2. un-beaching        -> if we have been commanding ahead and going
//      nowhere, back off astern for a moment and turn out;
//   3. a target           -> steer at its last known position;
//   4. otherwise          -> the FLEET's shared waypoint plus this hull's own
//      constant formation offset, so the six travel together and hold roughly
//      the spread they spawned with (which is what keeps the witness rule
//      meaningful at 9:00 and not only at 1:00). A waypoint the lead member
//      cannot see in a straight line on the nav grid gets ONE fleet-level
//      route at pick time (Story 9.13, amendment 192(b)); a hull whose own
//      line to its station is blocked steers for the route's next point.
// Island avoidance is the bots' graded multi-ray fan on the nav grid
// (ai/navigate.ts rayAvoidance, amendment 192(c)); it, hull and map-edge
// avoidance are composed onto the rudder with the bots' `helmLeft` weighting
// (`composeRudder`): avoidance claims the helm in proportion to its pressure.
// The waypoint is re-picked if without progress for CONFIG.bots.nav.waypointTimeoutMs, and the
// un-beach trip also arms on the sim's own land contact (Story 9.13).

import {
  CONFIG,
  angleDiff,
  bearing,
  dist,
  droneSizeOf,
  hullBumper,
  isAfloat,
  isOutside,
  isSinking,
  islandDistance,
  lineClear,
  mulberry32,
  SLOT_GUN,
  pointOf,
  snapToWater,
  wrapAngle,
  type DroneSizeId,
  type InputMsg,
  type Rng,
  type Vec2,
  type ZoneRing,
} from '@salvo/shared';
import { shipSees, sightOf, type SightField } from './signals.js';
import { leadIntercept } from './lead.js';
import { isFleetHull } from './participants.js';
import {
  RUDDER_GAIN,
  avoidReachU,
  boundaryBias,
  clampUnit,
  composeRudder,
  pointBias,
  rayAvoidance,
  ringRunBearing,
} from './ai/navigate.js';
import type { NavCache } from './navCache.js';
import type { ShipRecord, World } from './world.js';

/** The fleet helm's composition, shared with the bots (ai/navigate.ts). */
export { composeRudder } from './ai/navigate.js';

const TAU = Math.PI * 2;
const ORIGIN: Vec2 = { x: 0, y: 0 };

/** Distance (u) at which a fleet considers its shared waypoint reached. */
const WAYPOINT_REACH = 120;
/** Clearance (u) a waypoint must keep from any island (else it is rejected). */
const ISLAND_CLEARANCE = 30;
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
// THE WAYPOINT TIMEOUT is `CONFIG.bots.nav.waypointTimeoutMs`: ms a fleet may
// go WITHOUT PROGRESS toward its waypoint before the waypoint is re-picked
// (Story 9.13, epic-9 amendment 192 — a waypoint behind an island must not
// hold the fleet grinding its coast forever). ORCHESTRATOR READING under
// amendment 192 (2026-10-17): "not reached" is read as "no progress" — the
// fleet's closest member gaining WAYPOINT_REACH (120 u) on its best distance
// so far re-arms the clock — so an honest 4,000 u leg at an 18–24 u/s cruise
// is never cut short.

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
  /** ms of SUSTAINED sim `landContact` toward the un-beach trip (Story 9.13):
   *  the grounding damp caps a beached hull at a quarter of its speed
   *  (7.5–10 u/s), above STUCK_SPEED, so the speed test alone never trips on
   *  a hull grinding a coast. Reset by any tick out of contact. */
  landMs: number;
  unbeachUntil: number;
}

/** Per-group shared state: one waypoint stream for all six hulls. */
interface Fleet {
  rng: Rng;
  waypoint: Vec2 | null;
  /** True iff `waypoint` sits ashore — decided ONCE when it is picked (a
   *  waypoint never moves and neither do islands, so a per-tick re-test could
   *  only ever repeat the answer). Only pickWaypoint's ring-centre fallback can
   *  set it, and it keeps today's behaviour: an ashore waypoint is re-picked
   *  on the next read. */
  ashore: boolean;
  /** The fleet's own member ids, kept beside `minds` (add/remove/tick prune)
   *  so "has any member reached it" walks six hulls, not every mind. */
  members: Set<string>;
  /** The fleet's best (closest-member) distance to `waypoint` so far, and the
   *  server ms it last improved by WAYPOINT_REACH — the no-progress re-pick's
   *  state, reset at every pick. */
  bestDist: number;
  progressAt: number;
  /** THE FLEET ROUTE (Story 9.13, amendment 192(b)): the string-pulled water
   *  path from the lead member to `waypoint`, built ONCE at pick time when the
   *  straight line is blocked on the nav grid; null = sailing straight. Its
   *  points are popped as the lead member reaches them. */
  route: Vec2[] | null;
  /** Server ms of the last pickWaypoint: a fleet re-picks at most once per
   *  CONFIG.bots.decisionCadenceMs (fix wave P9 — an ashore fallback used to
   *  re-pick on every hull evaluation, six times a tick). */
  pickedAt: number;
  /** The member the route was built FROM (fix wave P12): when the lead
   *  changes (it sank, it left) the route is re-built from the new lead, so
   *  a member already past the old first point is not sent back to it. */
  routeLead: string | null;
}

/**
 * Diagnostic counters (Eric ruling 2026-10-14: a drone reasons ONLY about what
 * lies within its own sight). Monotonic, read by tests to prove that a hull
 * outside sight is never even evaluated and that a waypoint's ashore test runs
 * once per pick, never per tick.
 */
export interface FleetProbeCounts {
  /** Hull pairs handed to the avoidance kernel (all inside the drone's sight). */
  hullPairs: number;
  /** Signed-distance "is this point ashore" scans over the island list. */
  ashoreTests: number;
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
  /** Every afloat-or-sinking hull, snapshotted ONCE per tick() (reused array,
   *  no per-tick allocation) — the avoidance loop's candidate list. */
  private readonly solids: ShipRecord[] = [];
  /** See FleetProbeCounts. */
  readonly probe: FleetProbeCounts = { hullPairs: 0, ashoreTests: 0 };

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
        ashore: false,
        members: new Set(),
        bestDist: Infinity,
        progressAt: 0,
        route: null,
        pickedAt: -Infinity,
        routeLead: null,
      });
    }
    this.fleets.get(fleetId)?.members.add(id);
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
      landMs: 0,
      unbeachUntil: 0,
    });
  }

  /** Forget a fleet hull (called by World.removeShip). */
  remove(id: string): void {
    this.forget(id);
  }

  /** Drop a mind and its fleet membership together (the one removal path). */
  private forget(id: string): void {
    const mind = this.minds.get(id);
    if (mind) this.fleets.get(mind.fleetId)?.members.delete(id);
    this.minds.delete(id);
  }

  /** Read a hull's current target (testing/inspection only). */
  targetOf(id: string): string | null {
    return this.minds.get(id)?.targetId ?? null;
  }

  /** Read a fleet's route (testing/inspection only): the points still ahead,
   *  or null when the fleet is sailing straight. */
  routeOf(id: string): readonly Vec2[] | null {
    const mind = this.minds.get(id);
    return mind ? (this.fleets.get(mind.fleetId)?.route ?? null) : null;
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
    // ONE sight field per hit (Story 9.10): built once here, never inside the
    // per-witness loop.
    const field = this.sightField();
    const now = this.world.now;
    for (const [id, mind] of this.minds) {
      if (id === victim.id || mind.targetId !== null) continue;
      const witness = this.world.ships.get(id);
      if (!witness || !isAfloat(witness.lifecycle)) continue;
      if (!shipSees(witness, attacker, field, now)) continue;
      if (!shipSees(witness, victim, field, now)) continue;
      this.acquire(id, attacker);
    }
  }

  /**
   * THE DRONES' SIGHT FIELD (Story 9.10, amendment 168): the islands and the
   * fog toll thunk (`World.fogTollAlong` — the shared field under the live
   * cut) that `shipSees` tolls a drone's eye with — the same inputs a
   * captain's SignalContext carries, so a drone is fogged by the same rule
   * as a client. Built ONCE per tick (`field`, below) and once per hit
   * (propagateWitnesses), never inside a per-ship loop. The shot-from chase
   * (amendment 139) reads no field: being shot is not sight. Hull avoidance
   * is UNFOGGED (amendment 170) — it reads the solids, never this.
   */
  private sightField(): SightField {
    const world = this.world;
    return { islands: world.map.islands, fogToll: (ax, ay, bx, by) => world.fogTollAlong(ax, ay, bx, by) };
  }

  /** This tick's sight field (refreshed at the top of `tick`). */
  private field: SightField = { islands: [], fogToll: () => 0 };

  /** Submit one input per live fleet hull. Dead hulls idle (no input). */
  tick(): void {
    this.snapshotSolids();
    this.field = this.sightField();
    for (const fleet of this.fleets.values()) this.advanceRoute(fleet);
    for (const [id, mind] of this.minds) {
      const ship = this.world.ships.get(id);
      if (!ship) {
        this.forget(id);
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

  /** Refill `solids` with every afloat-or-sinking hull (a wreck is solid,
   *  amendment 82). Once per tick: inputs are built before applyInputs, so no
   *  hull moves or changes lifecycle while the drones read it. */
  private snapshotSolids(): void {
    this.solids.length = 0;
    for (const other of this.world.ships.values()) {
      if (isAfloat(other.lifecycle) || isSinking(other.lifecycle)) this.solids.push(other);
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
    if (shipSees(ship, target, this.field, now)) {
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
    const avoid = this.avoidIslands(ship, brg) + this.avoidHulls(ship, mind) + boundaryBias(ship.state, this.world.map.radius);
    const rudder = composeRudder(track, avoid);
    const shot = this.wantsShot(ship, mind);
    mind.seq += 1;
    return {
      seq: mind.seq,
      throttle: this.throttleFor(mind, unbeaching),
      rudder,
      aim: shot?.aim ?? 0,
      fireSeq: mind.fireSeq,
      aimDist: shot?.aimDist ?? 0,
      slot: SLOT_GUN, // the gun, and the only weapon a fleet hull fits
      fireT: 0, // no-claim sentinel: a server-driven shooter never back-dates
      held: false, // Story 8.15: a fleet hull mounts the cannon and never streams
      actSeq: 0, // structurally inert — fleet hulls fit no ability
      actSlot: 0,
      hornSeq: 0, // fleet hulls never honk
    };
  }

  /**
   * Track "going nowhere" and arm the astern manoeuvre. Returns true while
   * un-beaching. TWO trips, either arms it:
   *   * SLOW — below STUCK_SPEED for STUCK_TRIP_MS (a hull pinned by another
   *     hull or a wreck; the grounding damp caps a beached hull well above
   *     zero — cycle 59 — so this tests a LOW speed, never a zero one);
   *   * GROUNDED (Story 9.13) — the sim's own `landContact` held for
   *     `CONFIG.bots.stuckMs`, the bots' un-beach trip. A hull grinding a
   *     coast at the quarter-speed cap is above STUCK_SPEED and never tripped
   *     the slow test, so it ground on until the storm took it.
   */
  private updateStuck(ship: ShipRecord, mind: FleetMind): boolean {
    const now = this.world.now;
    if (now < mind.unbeachUntil) return true;
    const dt = CONFIG.tick.simDtMs;
    mind.stuckMs = Math.abs(ship.state.speed) < STUCK_SPEED ? mind.stuckMs + dt : 0;
    mind.landMs = ship.landContact ? mind.landMs + dt : 0;
    if (mind.stuckMs < STUCK_TRIP_MS && mind.landMs < CONFIG.bots.stuckMs) return false;
    mind.stuckMs = 0;
    mind.landMs = 0;
    mind.unbeachUntil = now + UNBEACH_MS;
    return true;
  }

  private throttleFor(mind: FleetMind, unbeaching: boolean): number {
    if (unbeaching) return UNBEACH_THROTTLE;
    return mind.targetId !== null ? PURSUE_THROTTLE : CRUISE_THROTTLE;
  }

  /** The bearing this hull wants to hold, applying the four overrides. */
  private steerTarget(ship: ShipRecord, mind: FleetMind, unbeaching: boolean): number {
    const pos = ship.state;
    // Override 1: outside the ring -> back in down the ring's flow field
    // (Story 9.13). Fleet ships are ruled never to leave the ring, so this
    // outranks a live target.
    const ring = this.world.zoneLiveRing;
    if (isOutside(pos, ring.cx, ring.cy, ring.r)) return ringRunBearing(pos, this.nav, this.ringGoal());
    // Override 2: while backing off an island, aim AWAY from where we were
    // pointed so the reverse actually unwinds the grounding.
    if (unbeaching) return wrapAngle(pos.heading + Math.PI);
    // Override 3: a target -> its last known position.
    if (mind.lastKnown) return bearing(pos, mind.lastKnown);
    // Override 4: this hull's station on the fleet's shared waypoint — or,
    // while the fleet is routed and this hull's own line is blocked, the
    // route's next point (Story 9.13).
    const station = this.stationOf(mind);
    const head = this.fleets.get(mind.fleetId)?.route?.[0];
    if (head !== undefined && !lineClear(this.nav.grid, pos, station)) return bearing(pos, head);
    return bearing(pos, station);
  }

  /** The map's nav cache (World.nav — one per map, game/navCache.ts). */
  private get nav(): NavCache {
    return this.world.nav;
  }

  /** The ring a return run is FOR: the revealed next ring while there is one
   *  (the close converges on it, and its field is static), else the live
   *  ring — never a per-tick moving ring, so a field is built once per ring. */
  private ringGoal(): ZoneRing {
    return this.world.zoneRevealedNextRing ?? this.world.zoneLiveRing;
  }

  /** The fleet's lead member: its first afloat hull (insertion order). */
  private leadOf(fleet: Fleet): ShipRecord | null {
    for (const id of fleet.members) {
      const ship = this.world.ships.get(id);
      if (ship && isAfloat(ship.lifecycle)) return ship;
    }
    return null;
  }

  /** Pop the route points the lead member has reached (once per fleet per
   *  tick), re-arming the progress clock on each pop; an emptied route is
   *  dropped (the fleet sails straight for the waypoint). */
  private advanceRoute(fleet: Fleet): void {
    const route = fleet.route;
    if (route === null) return;
    const lead = this.leadOf(fleet);
    if (lead === null) return;
    if (lead.id !== fleet.routeLead && fleet.waypoint !== null) {
      this.routeFleet(fleet, fleet.waypoint);
      return;
    }
    while (route.length > 0 && dist(lead.state, route[0]) < WAYPOINT_REACH) {
      route.shift();
      fleet.bestDist = Infinity;
      fleet.progressAt = this.world.now;
    }
    if (route.length === 0) fleet.route = null;
  }

  /** The fleet-level route to a fresh waypoint: one A* at pick time, only
   *  when the lead member's straight line is blocked on the grid. */
  private routeFleet(fleet: Fleet, wp: Vec2): void {
    const lead = this.leadOf(fleet);
    fleet.routeLead = lead?.id ?? null;
    fleet.route = lead !== null && !lineClear(this.nav.grid, lead.state, wp) ? this.nav.routeTo(lead.state, wp) : null;
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
    if (this.needsWaypoint(fleet) && this.pickDue(fleet)) this.pickWaypoint(fleet);
    return fleet.waypoint ?? ORIGIN;
  }

  /** A fleet with no waypoint picks now; otherwise not twice inside one
   *  decision cadence (fix wave P9). */
  private pickDue(fleet: Fleet): boolean {
    return fleet.waypoint === null || this.world.now - fleet.pickedAt >= CONFIG.bots.decisionCadenceMs;
  }

  /** Retarget when there is none, it was picked ashore, any member reached
   *  it, or the fleet has made no progress toward it for CONFIG.bots.nav.waypointTimeoutMs
   *  (Story 9.13 — a waypoint behind an island). The ashore answer was
   *  decided at pick time (Fleet.ashore). Advances the progress clock. */
  private needsWaypoint(fleet: Fleet): boolean {
    const wp = fleet.waypoint;
    if (!wp || fleet.ashore) return true;
    if (this.closestMember(fleet, wp) < WAYPOINT_REACH) return true;
    // Progress is measured toward the route's next point while routed (a
    // detour round an island need not close the straight-line gap).
    const best = this.closestMember(fleet, fleet.route?.[0] ?? wp);
    const now = this.world.now;
    if (best <= fleet.bestDist - WAYPOINT_REACH) {
      fleet.bestDist = best;
      fleet.progressAt = now;
    }
    return now - fleet.progressAt > CONFIG.bots.nav.waypointTimeoutMs;
  }

  /** The closest afloat member's distance to `wp` (Infinity = none afloat). */
  private closestMember(fleet: Fleet, wp: Vec2): number {
    let best = Infinity;
    for (const id of fleet.members) {
      const ship = this.world.ships.get(id);
      if (ship && isAfloat(ship.lifecycle)) best = Math.min(best, dist(ship.state, wp));
    }
    return best;
  }

  /** Pick the fleet a random point uniformly inside 0.8x the LIVE ring
   *  (offset-center), island-free — the ashore test runs here, once. */
  private pickWaypoint(fleet: Fleet): void {
    const ring = this.world.zoneLiveRing;
    fleet.bestDist = Infinity;
    fleet.progressAt = this.world.now;
    fleet.pickedAt = this.world.now;
    const max = ring.r * WAYPOINT_ZONE_FRACTION;
    for (let i = 0; i < 16; i++) {
      const a = fleet.rng.float(0, TAU);
      const r = Math.sqrt(fleet.rng.next()) * max; // sqrt => uniform over the disc
      const p = { x: ring.cx + Math.cos(a) * r, y: ring.cy + Math.sin(a) * r };
      if (!this.insideIsland(p)) {
        fleet.waypoint = p;
        fleet.ashore = false;
        this.routeFleet(fleet, p);
        return;
      }
    }
    this.fallbackWaypoint(fleet, ring);
  }

  /** The ring centre beats the map origin as a fallback (a late offset ring
   *  may not even contain the origin) — SNAPPED to navigable water through
   *  the nav cache (fix wave P9); `ashore` (re-pick on the next due read) only
   *  when the snap finds no water within its reach. */
  private fallbackWaypoint(fleet: Fleet, ring: ZoneRing): void {
    const centre = { x: ring.cx, y: ring.cy };
    const idx = snapToWater(this.nav.grid, centre);
    const wp = idx < 0 ? centre : pointOf(this.nav.grid, idx);
    fleet.waypoint = wp;
    fleet.ashore = idx < 0;
    if (idx < 0) fleet.route = null;
    else this.routeFleet(fleet, wp);
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
    this.probe.ashoreTests += 1;
    return this.world.map.islands.some((isle) => islandDistance(p, isle) <= ISLAND_CLEARANCE);
  }

  /** The island term: the bots' graded multi-ray fan on the nav grid (Story
   *  9.13, amendment 192(c)), reach = CONFIG.bots.nav.avoidReachTurnRadii own
   *  turn radii — at most ~150 u for a drone, inside its 500 u sight, so
   *  amendment 139's sight scope holds by construction. */
  private avoidIslands(ship: ShipRecord, want: number): number {
    const { x, y, heading } = ship.state;
    return rayAvoidance(this.nav.grid, x, y, heading, avoidReachU(ship.stats), want);
  }

  /**
   * HULL AVOIDANCE (Story 9.5, Eric ruling 2026-10-12, epic-9 amendment 78:
   * "PvE drones get avoidance only — they steer clear of hulls; they never
   * choose to ram"). The island point kernel summed over every OTHER hull on
   * the water — afloat or SINKING (a wreck is solid, amendment 82) — a hull
   * ahead is rounded exactly like a headland. SIGHT SCOPE (Eric 2026-10-14:
   * *"There's no need to check against anything it can't see"*): only hulls
   * whose centre lies within the drone's own `sightOf` are evaluated. The cut
   * is EXACT — the kernel already returns 0 past its reach (the larger of
   * `hullLookaheadU` 150 u and the widest bumper, 134 u), both inside the
   * 500 u sight — so it is a pure speed-up. The target it is hunting is NOT excepted — a drone never rams —
   * but it, like a FLEET-MATE (same `fleetId`: the formation sails a hull
   * length apart), is avoided only inside the BUMPER (`hullBumper`: the two
   * half-lengths + `CONFIG.bots.hullBumperU`) rather than the full
   * `CONFIG.bots.hullLookaheadU` [DRAFT] probe every stranger gets (review
   * gate, 2026-10-13: the full probe scattered formations and repelled the
   * hunter from its quarry).
   */
  private avoidHulls(ship: ShipRecord, mind: FleetMind): number {
    const { x, y, heading } = ship.state;
    const fx = Math.cos(heading);
    const fy = Math.sin(heading);
    // UNDAZZLED on purpose (Story 10.9): this scope is an EXACT speed-up cut
    // (the kernel's reach lies inside the undazzled sight), so reading the
    // dazzled quarter-sight here would change behavior — a flashed drone
    // would stop avoiding hulls inside its kernel reach and ram.
    const sight = sightOf(ship, 0);
    const sight2 = sight * sight;
    let bias = 0;
    for (const other of this.solids) {
      if (other === ship) continue;
      const dx = other.state.x - x;
      const dy = other.state.y - y;
      if (dx * dx + dy * dy > sight2) continue; // SIGHT SCOPE (Eric 2026-10-14)
      this.probe.hullPairs += 1;
      const close = other.id === mind.targetId || this.minds.get(other.id)?.fleetId === mind.fleetId;
      const reach = close ? hullBumper(ship.hullId, other.hullId) : CONFIG.bots.hullLookaheadU;
      bias += pointBias(other.state.x, other.state.y, x, y, fx, fy, reach);
    }
    return bias;
  }

  /**
   * THE ONLY TRIGGER IN THIS FILE. Returns the aim for a shot, advancing
   * `fireSeq` exactly when one is taken, or null. Every condition must hold:
   * an acquired target, a loaded gun off cooldown, and LIVE line of sight —
   * so a hull chasing a sniper it cannot see holds its fire until it arrives.
   */
  private wantsShot(ship: ShipRecord, mind: FleetMind): { aim: number; aimDist: number } | null {
    if (mind.targetId === null) return null;
    const slot = ship.loadout[SLOT_GUN];
    if (!slot.state || slot.state.n <= 0 || slot.state.reloadMsLeft > 0) return null;
    const target = this.world.ships.get(mind.targetId);
    if (!target || !isAfloat(target.lifecycle)) return null;
    if (!shipSees(ship, target, this.field, this.world.now)) return null;
    const point = this.aimPoint(ship, target, mind);
    mind.fireSeq += 1;
    return { aim: bearing(ship.state, point), aimDist: dist(ship.state, point) };
  }

  /**
   * The lead-corrected, scattered aim point. The intercept is solved by fixed
   * point (3 passes is far past convergence at these speeds); the scatter is a
   * uniform disc of `CONFIG.fleet.aimScatterU[size]` around it.
   *
   * Lead is not optional flavour: over a few hundred units a 500 u/s shell
   * flies well over half a second (~0.66 s at 330u), in which a 45 u/s
   * Torpedo Boat moves ~30u against a 15u burst radius — so an
   * unled shot misses nearly every moving hull and a perfectly led one nearly
   * never misses. The scatter is the whole difficulty channel between sizes.
   */
  private aimPoint(ship: ShipRecord, target: ShipRecord, mind: FleetMind): Vec2 {
    const vx = Math.cos(target.state.heading) * target.state.speed;
    const vy = Math.sin(target.state.heading) * target.state.speed;
    // The solver itself now lives in game/lead.ts (extracted verbatim in Story
    // 7-5 wave 2 so the captive mine's torpedo leads with the SAME answer).
    const led = leadIntercept(ship.state, target.state, vx, vy, CONFIG.gun.shellSpeed);
    const scatter = CONFIG.fleet.aimScatterU[mind.size];
    const a = mind.rng.float(0, TAU);
    const r = Math.sqrt(mind.rng.next()) * scatter;
    return { x: led.x + Math.cos(a) * r, y: led.y + Math.sin(a) * r };
  }
}

/** The CONFIG.drones size key for a fleet hull, defaulting to `small` for a
 *  hull id that is not a fleet hull at all (unreachable via addShip's drone
 *  path; present so the controller never throws on a malformed registration). */
export function fleetSizeOf(hullId: Parameters<typeof droneSizeOf>[0]): DroneSizeId {
  return droneSizeOf(hullId) ?? 'small';
}
