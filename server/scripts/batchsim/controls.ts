// THE SCRIPTED CONTROL — a frozen storm-pacing instrument, NOT an AI.
//
// WHAT THIS FILE IS NOW (cycle 110). It used to hold three scripted "pilots"
// (gunner / endgame / pacifist), all of which read `world.ships` directly to
// pick and lead a target. Perception-honest combat bots exist since Story 6.4
// (`server/src/game/ai/`, driven from World's own `botsTick` row), so an
// OMNISCIENT lethal script is no longer a baseline anyone should measure
// against — it cannot even see the intel/counter-intel half of the catalog,
// because it never uses a sensor. `gunner` and the lethal half of `endgame`
// are DELETED. What survives is the one thing bots cannot give you: a frozen,
// never-changing control that paces a match by the STORM alone.
//
// THE CONTROL'S OMNISCIENCE IS INERT. It never targets and never fires, so the
// only world state it reads is the LIVE STORM RING (`world.zoneLiveRing`) and
// the ISLAND LIST (`world.map.islands`) — both of which a real client already
// holds: ring geometry rides ArenaState for the on-water render, and islands
// are rebuilt client-side from the map seed. It reads no enemy pose, no hp, no
// contact. That is why it can stay on `world` without being an honesty
// tradeoff, and why it must stay PACIFIST: the moment anything here targets, it
// becomes a cheating bot and belongs in `ai/` instead.
//
// WHAT IT IS FOR: a lethality-free lower bound on match PACING. A control match
// runs the full storm timeline, so ~12:00 closure, the sudden-death collapse,
// storm pressure, and picks-band reachability under long matches are all
// measurable without a single shot fired. It also exercises the REAL spend
// flow (world.spendPoint through the deterministic policy in spendPolicy.ts),
// so the economy accrues and settles exactly as it does in a live match.
//
// THE CONTROL SEAM (AR12 — the reuse contract the later load-test duties build
// on): a control is created per (captain, match) by a ControlFactory out of
// CONTROL_REGISTRY and driven by the runner exactly once per tick, BEFORE
// world.step(). Its ONLY channels into the simulation are the real wire entry
// points a human client uses — world.submitInput(id, rawInputMsg) and
// world.spendPoint(id, choice) — so swapping in a different factory (a
// load-test firehose control) changes nothing in the runner, the Match wiring,
// or the stats collectors.
//
// MINIMAL SEAMANSHIP — un-beaching (Story 3.4, amendment 25): "the instrument
// must be able to reverse off a rock like any human can." Shared by every
// registry control, because steering is common to them.
// THE FAILURE MODE it fixes: a grounded hull takes the islandSpeedMult damp
// every contact tick, so its speed collapses to a ~0.2 u/s crawl; rudder
// authority scales with speed, so it cannot turn away either. These scripts
// only ever ordered AHEAD (0.5 or 1), so a beached hull was pinned to the
// rock forever — the diagnosed cause of both cap-outs in the 50-match endgame
// campaign. Humans have full astern; the instrument did not.
// THE POLICY (counters only — NO rng anywhere in it, so determinism is
// untouched; no new world accessors, only the hull's own pose and the island
// list islandAvoid already reads): if the control ordered meaningful AHEAD yet
// made no ground for STUCK_TICKS straight, it orders FULL ASTERN for
// UNBEACH_ASTERN_TICKS and then sails normally again. A forward GRACE window
// (UNBEACH_GRACE_TICKS) blocks re-arming right after a burst.
//
// V2 — BREAKING THE METRONOME (same amendment, second iteration). v1 backed
// off with the rudder amidships, which retraced the SAME line; pickGoal then
// steered straight back down it and the hull re-beached on the same rock. The
// rerun campaign still capped out 3/50 endgame + 1/200 gunner matches, ALL
// FOUR diagnosed as exactly that loop (inter-burst gaps pinned at the policy's
// own ~139-158 ticks, 60-97% of the endgame spent immobile), while a lateral
// shift of only 78-153u would have opened water on the last hull. Two changes,
// both deterministic:
//   1. ROTATE AWAY WHILE BACKING. The burst commands a nonzero rudder whose
//      sign is taken from the same cross-product islandAvoid uses, against the
//      NEAREST island in its lookahead cone, so the bow swings away from the
//      obstacle; +1 is the fixed fallback when no island qualifies. The sign is
//      captured ONCE as the burst arms and held (no per-tick flapping). Note
//      stepShip's authority is signed, so the commanded rudder is the NEGATION
//      of the forward-sense turn (see asternTurnRudder). Measured swing over a
//      full burst: 39.5 deg battleship / 65.3 deg mineLayer / 92.8 deg
//      torpedo boat.
//   2. HOLD THE EXIT HEADING THROUGH THE GRACE. Goal-seek is suppressed for
//      the grace window and the rudder simply steers back onto the heading the
//      hull left the burst on (same x3 gain), throttle as normal. Without this
//      the rotated approach line never commits — a battleship undoes the whole
//      39.5 deg in ~1.7 s of goal-seek.
//
// GRACE HOLD, EXACTLY (both reviewers confirmed this tick-by-tick — see
// wantsAstern): the burst's last astern tick (the exit-heading capture tick)
// arms graceTicks = UNBEACH_GRACE_TICKS = 60 but is itself still an astern
// tick. Of the 60 grace ticks that follow, ticks 1-59 hold the captured exit
// heading (holdRudder); on tick 60, graceTicks counts down to 0, holdHeading
// is nulled BEFORE buildInput runs, so goal-seek (seekRudder) resumes that
// same tick — one tick before stuck-detection re-arms (the arming guard
// `asternTicks === 0 && graceTicks === 0` first passes on tick 61). This seam
// is harmless: detection is still fully suppressed on tick 60 regardless of
// which rudder ran, and the 139-158-tick inter-burst metronome floor from the
// v1 rerun campaign (see above) is unchanged by which single tick resumes
// seeking.
//
// DURING THE HOLD, STEERING IS PURE HEADING-HOLD (holdRudder: proportional
// gain onto holdHeading, nothing else) — no islandAvoid bias, no storm/ring
// seeking. This is deliberate: it keeps the committed exit line
// deterministic-simple (one geometric term, no interaction with the normal
// goal-bearing logic) rather than a hybrid that could re-pull the bow toward
// the very obstacle the burst just turned away from. A grace that happens to
// carry the hull toward another rock or the storm edge is not corrected
// during the hold — it self-corrects on the NEXT burst cycle instead (stuck-
// detection re-arms at tick 61 and a fresh pin re-triggers a burst normally).
// The 250-match endgame campaign showed zero cap-outs traceable to this gap.
//
// KNOWN RESIDUAL (disclosed, not fixed): the burst assumes the water astern
// is clear "hence known clear" (see UNBEACH_ASTERN_TICKS above) — true for
// the line the hull just sailed in, but not guaranteed for the ~15u of
// sternway a full burst actually covers. A pocket with a second blocker
// astern within that ~15u (or the map boundary) can zero the burst's
// progress and re-arm stuck-detection with the SAME geometry that produced
// the first burst. The harness does not paper over this: such a match reports
// honestly as an `unresolved` cap-out (see runner.ts / report.ts). None
// occurred across 250 campaign matches.
//
// Determinism: every decision rides its own mulberry32 stream seeded by the
// runner from (matchSeed, captain ordinal) — no Math.random, no Date.now.
// Same run key => byte-identical input streams (unit-pinned).

import {
  angleDiff,
  isAfloat,
  mulberry32,
  nearestCoastPoint,
  type InputMsg,
  type Island,
  type Rng,
  type Vec2,
} from '@salvo/shared';
import type { ShipRecord, World } from '../../src/game/world.js';
import { pickSpendChoice } from './spendPolicy.js';

/** One scripted captain: drive your ship (and spend your levels) this tick. */
export interface CaptainControl {
  readonly id: string;
  tick(world: World): void;
}

/** Builds a control for captain `id` on a deterministic seed. */
export type ControlFactory = (id: string, seed: number) => CaptainControl;

// --- control tunables (script behavior, not game balance) -------------------
const ZONE_SAFETY = 0.8; // steer for the ring center once outside this fraction of the live ring
const WAYPOINT_REACHED_U = 60; // wander waypoint retarget distance
const ISLAND_LOOKAHEAD_U = 160; // dronesSmoke huntTick avoidance horizon

// --- un-beach seamanship (Story 3.4, amendment 25) ---------------------------
// All four numbers are TICK/UNIT counters — no rng, no world accessors beyond
// the ship's own pose. See the header for the ruling and the failure mode.
/** Ordered-throttle floor that counts as "meaningful ahead" (the control only
 *  ever emits 1 forward, so this separates ahead from astern/stop). */
const STUCK_THROTTLE_MIN = 0.4;
/** Per-tick displacement (u) below which a hull ordered AHEAD is not moving.
 *  0.1 u/tick = 2 u/s, which cleanly separates the two regimes: a permalocked
 *  hull crawls at ~0.2-0.25 u/s (~0.01 u/tick — the islandSpeedMult damp
 *  re-crushing speed every contact tick), while even the SLOWEST hull under way
 *  (the 35 u/s battleship) makes 1.75 u/tick. Wide headroom on both sides. */
const STUCK_STEP_U = 0.1;
/** Consecutive sub-threshold ticks before declaring the hull beached (1.5 s).
 *  The slowest hull (battleship, accel 5 u/s^2) passes 2 u/s within 0.4 s of
 *  ordering ahead, so a healthy hull never accumulates this many. */
const STUCK_TICKS = 30;
/** Full-astern burst length (2.5 s). The slowest hull reaches its 9 u/s reverse
 *  cap in 1.8 s, so the burst backs ~15 u down the track the hull arrived on —
 *  water it already occupied, hence known clear. */
const UNBEACH_ASTERN_TICKS = 50;
/** Forward grace after a burst before detection can re-arm (3 s) — longer than
 *  the worst-case astern->ahead turnaround (-9 u/s back through +2 u/s at
 *  accel 5 ~= 2.2 s), so a hull in a pocket backs out, turns and sails on
 *  instead of metronoming between ahead and astern.
 *  EFFECTIVE HOLD (see the header for the full tick trace): of these 60
 *  ticks, 59 (ticks 1-59) are held-steering ticks onto the captured exit
 *  heading; tick 60 resumes goal-seek one tick before stuck-detection
 *  re-arms on tick 61 — harmless, since detection stays suppressed through
 *  tick 60 either way. */
const UNBEACH_GRACE_TICKS = 60;
/** Astern rudder when no island qualifies as the blocker — a FIXED sign, never
 *  an rng pick (determinism), so a bow-on beaching still rotates its exit. */
const UNBEACH_FALLBACK_RUDDER = 1;
/** Proportional gain steering back to a stored heading — the same x3 idiom the
 *  normal goal-bearing rudder uses. */
const HEADING_GAIN = 3;

/** Signed cross product of the hull's forward vector with the bearing to a
 *  point: > 0 = the point lies to PORT (CCW of the heading). The one geometric
 *  primitive behind both islandAvoid's bias and the un-beach turn sign. */
function forwardCross(self: ShipRecord, px: number, py: number): number {
  const fx = Math.cos(self.state.heading);
  const fy = Math.sin(self.state.heading);
  return fx * (py - self.state.y) - fy * (px - self.state.x);
}

/**
 * THE shared coastline threat probe behind both islandAvoid and
 * asternTurnRudder (cycle 51): the nearest point on this island's real COAST,
 * with the forward cross sign to it — or null when the island is not a threat
 * ahead. Keying on the coast rather than the bounding-circle centre is what
 * makes the control hug the shape of a ridge or a cove mouth instead of arcing
 * around a phantom circle (a long landmass's tip can be dead ahead while its
 * centre is abeam).
 *
 * BROADPHASE IS MANDATORY (this runs per control per island per tick): the
 * bounding circle rejects before any polygon edge is visited. The forward
 * HALF-DISC filter both callers share is preserved exactly — dot(heading,
 * bearing) > 0, within ISLAND_LOOKAHEAD_U of the LAND (the old gate
 * `|toCentre| <= ISLAND_LOOKAHEAD_U + isle.r` said "within LOOKAHEAD of the
 * rim"; `coast.dist <= ISLAND_LOOKAHEAD_U` says it exactly).
 */
function coastThreat(self: ShipRecord, isle: Island): { cross: number; d: number } | null {
  const { x, y, heading } = self.state;
  if (Math.hypot(isle.x - x, isle.y - y) > ISLAND_LOOKAHEAD_U + isle.r) return null;
  const coast = nearestCoastPoint({ x, y }, isle);
  if (coast.dist > ISLAND_LOOKAHEAD_U) return null;
  const fx = Math.cos(heading);
  const fy = Math.sin(heading);
  const dx = coast.x - x;
  const dy = coast.y - y;
  if (dx * fx + dy * fy <= 0) return null;
  return { cross: forwardCross(self, coast.x, coast.y), d: coast.dist };
}

/**
 * The rudder to hold through an un-beach burst (amendment 25 v2), chosen so the
 * BOW swings AWAY from the coastline that is blocking the bow. Both this
 * function and islandAvoid apply the SAME forward half-disc filter via
 * coastThreat, so the two agree on what counts as "ahead" — but they do NOT
 * agree on aggregation: islandAvoid SUMS a bias contribution over every
 * qualifying island, while this function picks only the single NEAREST
 * qualifying coastline as "the" blocker. Deterministic (nearest wins,
 * first-in-array on ties) and rng-free; +1 when no island qualifies (beached
 * bow-on to nothing either function can see), never a random pick.
 *
 * SIGN NOTE — this is a REVERSE rudder: stepShip scales rudder authority by
 * `speed / steerageSpeed` with a SIGNED speed ("sign flips in reverse"), so a
 * given rudder yaws the hull the opposite way when making sternway. The
 * forward-sense "turn away" rudder is `cross > 0 ? -1 : +1` (islandAvoid's
 * idiom); backing, we command its NEGATION to get the same bow swing.
 */
function asternTurnRudder(world: World, self: ShipRecord): number {
  let blocker: { cross: number; d: number } | null = null;
  for (const isle of world.map.islands) {
    const threat = coastThreat(self, isle);
    if (threat === null) continue;
    if (blocker === null || threat.d < blocker.d) blocker = threat;
  }
  if (blocker === null) return UNBEACH_FALLBACK_RUDDER;
  return blocker.cross > 0 ? 1 : -1; // negation of the forward-sense away turn
}

/** Rudder bias steering clear of coastline dead ahead (dronesSmoke islandAvoid). */
function islandAvoid(world: World, self: ShipRecord): number {
  let bias = 0;
  for (const isle of world.map.islands) {
    const threat = coastThreat(self, isle);
    if (threat !== null) bias += threat.cross > 0 ? -0.9 : 0.9;
  }
  return bias;
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/**
 * THE PACIFIST CONTROL (Story 3.1, amendment 6): stay inside the storm, wander
 * a seeded waypoint otherwise, spend every banked level through the real spend
 * flow — and never target, never aim, never fire. `aim`, `aimDist` and
 * `fireSeq` are emitted as a constant 0 for the whole match, which is what
 * makes the "never fires" pin structural rather than behavioural.
 */
class PacifistControl implements CaptainControl {
  private seq = 0;
  private waypoint: Vec2 | null = null;
  private readonly rng: Rng;
  // --- un-beach seamanship state (amendment 25): pure counters, no rng ---
  private lastX: number | null = null;
  private lastY: number | null = null;
  private lastThrottle = 0;
  private stuckTicks = 0;
  private asternTicks = 0;
  private graceTicks = 0;
  /** Rudder held for the WHOLE current burst — captured once when it arms so
   *  the sign cannot flap tick to tick as the geometry changes. */
  private asternRudder = 0;
  /** The heading to hold through the grace window (null = not holding). */
  private holdHeading: number | null = null;

  constructor(
    readonly id: string,
    seed: number,
  ) {
    this.rng = mulberry32(seed);
  }

  tick(world: World): void {
    const ship = world.ships.get(this.id);
    if (!ship) return;
    // Spends are legal while dead (builds persist across waiting-phase deaths);
    // drain at most one banked level per tick through the REAL spend flow.
    if (ship.offer !== null) world.spendPoint(this.id, pickSpendChoice(ship.offer, this.rng, ship.boons));
    if (!isAfloat(ship.lifecycle)) {
      // A respawn teleports the hull: carrying the pre-death pose forward would
      // read as a giant displacement (harmless) or, worse, keep a stale stuck
      // count alive across the gap. Start the seamanship state clean.
      this.resetSeamanship();
      return;
    }
    const input = this.wantsAstern(world, ship) ? this.asternInput() : this.buildInput(world, ship);
    this.lastThrottle = input.throttle;
    world.submitInput(this.id, input);
  }

  private resetSeamanship(): void {
    this.lastX = null;
    this.lastY = null;
    this.lastThrottle = 0;
    this.stuckTicks = 0;
    this.asternTicks = 0;
    this.graceTicks = 0;
    this.asternRudder = 0;
    this.holdHeading = null;
  }

  /** Distance made good since the previous tick (Infinity on the first tick /
   *  after a respawn — an unknown step can never read as "not moving"). */
  private stepDistance(ship: ShipRecord): number {
    const prevX = this.lastX;
    const prevY = this.lastY;
    this.lastX = ship.state.x;
    this.lastY = ship.state.y;
    if (prevX === null || prevY === null) return Infinity;
    return Math.hypot(ship.state.x - prevX, ship.state.y - prevY);
  }

  /** THE UN-BEACH GATE (amendment 25). Advances every counter exactly once per
   *  tick and answers "is this tick a full-astern tick?". Rng-free by
   *  construction; the only world state it reads is the hull's own pose. */
  private wantsAstern(world: World, ship: ShipRecord): boolean {
    const moved = this.stepDistance(ship);
    if (this.asternTicks === 0 && this.graceTicks === 0 && this.detectBeached(moved)) {
      this.asternTicks = UNBEACH_ASTERN_TICKS;
      // Captured ONCE, held for the whole burst (no per-tick re-evaluation).
      this.asternRudder = asternTurnRudder(world, ship);
    }
    if (this.asternTicks > 0) {
      this.asternTicks -= 1;
      // The grace arms as the burst ends, never during it.
      if (this.asternTicks === 0) this.graceTicks = UNBEACH_GRACE_TICKS;
      return true;
    }
    if (this.graceTicks > 0) {
      // First tick out of the burst: THIS is the exit heading the rotated
      // approach line has to commit to (see the header's v2 rationale).
      if (this.holdHeading === null) this.holdHeading = ship.state.heading;
      this.graceTicks -= 1;
      if (this.graceTicks === 0) this.holdHeading = null;
    }
    return false;
  }

  /** Ordered ahead but making no ground for STUCK_TICKS straight — the
   *  observable signature of a permalock (see the constants for why the
   *  threshold cannot confuse this with an intentional slow bell). */
  private detectBeached(moved: number): boolean {
    const pinned = this.lastThrottle >= STUCK_THROTTLE_MIN && moved < STUCK_STEP_U;
    this.stuckTicks = pinned ? this.stuckTicks + 1 : 0;
    if (this.stuckTicks < STUCK_TICKS) return false;
    this.stuckTicks = 0;
    return true;
  }

  /** Full astern with the burst's captured rudder: back off the rock while
   *  swinging the bow AWAY from it, so the approach line the hull will sail
   *  next is a DIFFERENT one (amendment 25 v2 — rudder amidships retraced the
   *  same line and metronomed). No wander draw happens on these ticks, so the
   *  rng stream stays untouched. */
  private asternInput(): InputMsg {
    return {
      seq: ++this.seq,
      throttle: -1,
      rudder: this.asternRudder,
      aim: 0,
      fireSeq: 0,
      aimDist: 0,
      slot: 0,
      fireT: 0,
      actSeq: 0,
      actSlot: 0, hornSeq: 0,
    };
  }

  private buildInput(world: World, ship: ShipRecord): InputMsg {
    // Through the grace window the rudder HOLDS the exit heading instead of
    // seeking (amendment 25 v2).
    const rudder = this.holdHeading === null ? this.seekRudder(world, ship) : this.holdRudder(ship);
    return {
      seq: ++this.seq,
      throttle: 1,
      rudder,
      aim: 0, // never aims: the control is pacifist by construction
      fireSeq: 0, // never fires
      aimDist: 0,
      slot: 0,
      fireT: 0, // in-process: no latency, no claim (zero compensation)
      actSeq: 0,
      actSlot: 0, hornSeq: 0,
    };
  }

  /** The normal rudder: steer the goal bearing, biased clear of islands. */
  private seekRudder(world: World, ship: ShipRecord): number {
    const goal = this.pickGoal(world, ship);
    const brg = Math.atan2(goal.y - ship.state.y, goal.x - ship.state.x);
    return clamp(angleDiff(ship.state.heading, brg) * HEADING_GAIN + islandAvoid(world, ship), -1, 1);
  }

  /** The grace-window rudder: proportional steering back onto the heading the
   *  hull left the burst on. Nothing else may pull the bow around until the
   *  window expires — the probe measured goal-seek undoing a battleship's
   *  whole 39.5 degree exit turn in ~1.7 s. No wander draw happens here. */
  private holdRudder(ship: ShipRecord): number {
    return clamp(angleDiff(ship.state.heading, this.holdHeading ?? ship.state.heading) * HEADING_GAIN, -1, 1);
  }

  /** Storm first, seeded wander second — all against the LIVE ring
   *  (offset-center as of Story 3.1), never the map origin. */
  private pickGoal(world: World, ship: ShipRecord): Vec2 {
    const ring = world.zoneLiveRing;
    const fromRingCenter = Math.hypot(ship.state.x - ring.cx, ship.state.y - ring.cy);
    if (fromRingCenter > ring.r * ZONE_SAFETY) return { x: ring.cx, y: ring.cy };
    if (this.waypoint === null || distTo(ship.state, this.waypoint) < WAYPOINT_REACHED_U) {
      const r = Math.sqrt(this.rng.next()) * ring.r * 0.6;
      const a = this.rng.next() * Math.PI * 2;
      this.waypoint = { x: ring.cx + Math.cos(a) * r, y: ring.cy + Math.sin(a) * r };
    }
    return this.waypoint;
  }
}

function distTo(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** The control registry — the swap point for a future load-test duty (see the
 *  header). One row: there is exactly one scripted control, and anything
 *  lethal belongs in `server/src/game/ai/` where it has to earn its
 *  information through `perception.observe()`. */
export const CONTROL_REGISTRY: Record<string, ControlFactory> = {
  pacifist: (id, seed) => new PacifistControl(id, seed),
};
