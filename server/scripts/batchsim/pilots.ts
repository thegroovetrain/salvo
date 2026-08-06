// Scripted captain pilots (amendment 54) + the deterministic spend policy.
//
// THE PILOT SEAM (AR12 — the reuse contract the later load-test and bot-vs-bot
// duties build on): a pilot is created per (captain, match) by a PilotFactory
// out of PILOT_REGISTRY and driven by the runner exactly once per tick, BEFORE
// world.step(). Its ONLY channels into the simulation are the real wire entry
// points a human client uses — world.submitInput(id, rawInputMsg) and
// world.spendPoint(id, choice) — so swapping in a different factory (an Epic 6
// perception-honest bot, a load-test firehose pilot) changes nothing in the
// runner, the Match wiring, or the stats collectors.
//
// V1 pilots are deliberately OMNISCIENT: they read world.ships / world.map /
// world.zoneLiveRing directly instead of a perception frame. That is an honesty
// tradeoff accepted for ECONOMY tuning (the spec pins it): building
// perception frames in the hot loop would burn the batch budget, and fog-
// honest target selection is Epic 6's bot duty, not this story's.
//
// PACIFIST CONTROL (Story 3.1, amendment 6): PILOT_REGISTRY.pacifist is the
// gunner with the hunt policy OFF — it never fires and never seeks targets,
// but still rides the ring rhythm (live-ring safety + wander) and still spends
// its levels through the real spend flow. Lethal (gunner) matches remain the
// LOWER-BOUND baseline on match length; pacifist matches run the full storm
// timeline so ~12:00 closure, storm pressure, and picks-band reachability
// under long matches are measurable.
//
// ENDGAME INSTRUMENT (Story 3.4, amendment 23): PILOT_REGISTRY.endgame is the
// SAME gunner with the hunt policy expressed as a world PREDICATE instead of a
// flag — pacifist behavior (steer the ring rhythm, never target, never fire)
// until the zone timeline is fully closed, then gunner behavior inside the
// terminal ring. WHY the gate is `zonePhase === 'closed'` and not the final
// ring GROUP's start: gating at the group start lets these omniscient pilots
// clear the field BEFORE 12:00, which is exactly the evidence the Endgame
// Guarantee needs; gating at full closure makes every RESOLVED match
// structurally conclude past 12:00 with the fight staged inside the terminal
// ring — the Story 3.4 evidence instrument for "matches conclude past 12:00,
// no stalemate loop" (the geometric bar of amendment 24; no forcing mechanic
// is added anywhere). The gate is a pure phase equality: it consumes NO rng
// (determinism is untouched — the wander branch only draws when there is no
// target, and the predicate itself never draws), and it never reads
// world.zoneStartMs (0 while idle) or ring geometry (test overrides run
// terminalSightFactor 0). While idle the phase is 'idle', so the endgame pilot
// can never degenerate into a plain gunner before the match arms.
//
// The endgame pilot is a MODELING instrument, not a human model: real captains
// skirmish long before closure. It exists to prove the geometry concludes.
//
// MINIMAL SEAMANSHIP — un-beaching (Story 3.4, amendment 25): "the instrument
// must be able to reverse off a rock like any human can." Shared by ALL THREE
// registry pilots, because steering is common to them.
// THE FAILURE MODE it fixes: a grounded hull takes the islandSpeedMult damp
// every contact tick, so its speed collapses to a ~0.2 u/s crawl; rudder
// authority scales with speed, so it cannot turn away either. These pilots
// only ever ordered AHEAD (0.5 or 1), so a beached pilot was pinned to the
// rock forever — the diagnosed cause of both cap-outs in the 50-match endgame
// campaign. Humans have full astern; the instrument did not.
// THE POLICY (counters only — NO rng anywhere in it, so determinism is
// untouched; no new world accessors, only the hull's own pose and the island
// list islandAvoid already reads): if the pilot ordered meaningful AHEAD yet
// made no ground for STUCK_TICKS straight, it orders FULL ASTERN for
// UNBEACH_ASTERN_TICKS and then sails normally again. A forward GRACE window
// (UNBEACH_GRACE_TICKS) blocks re-arming right after a burst. No targeting or
// firing happens on astern ticks.
//
// V2 — BREAKING THE METRONOME (same amendment, second iteration). v1 backed
// off with the rudder amidships, which retraced the SAME line; pickGoal then
// steered straight back at the target and the hull re-beached on the same
// rock. The rerun campaign still capped out 3/50 endgame + 1/200 gunner
// matches, ALL FOUR diagnosed as exactly that loop (inter-burst gaps pinned at
// the policy's own ~139-158 ticks, 60-97% of the endgame spent immobile),
// while a lateral shift of only 78-153u would have opened LOS on the last
// hull. Two changes, both deterministic:
//   1. ROTATE AWAY WHILE BACKING. The burst commands a nonzero rudder whose
//      sign is taken from the same cross-product islandAvoid uses, against the
//      NEAREST island in its lookahead cone, so the bow swings away from the
//      obstacle; +1 is the fixed fallback when no island qualifies. The sign is
//      captured ONCE as the burst arms and held (no per-tick flapping). Note
//      stepShip's authority is signed, so the commanded rudder is the NEGATION
//      of the forward-sense turn (see asternTurnRudder). Measured swing over a
//      full burst: 39.5 deg battleship / 65.3 deg mineLayer / 92.8 deg
//      torpedo boat.
//   2. HOLD THE EXIT HEADING THROUGH THE GRACE. Target-seek is suppressed for
//      the grace window and the rudder simply steers back onto the heading the
//      hull left the burst on (same x3 gain), throttle and gunnery as normal.
//      Without this the rotated approach line never commits — a battleship
//      undoes the whole 39.5 deg in ~1.7 s of target-seek.
//
// GRACE HOLD, EXACTLY (both reviewers confirmed this tick-by-tick — see
// wantsAstern): the burst's last astern tick (the exit-heading capture tick)
// arms graceTicks = UNBEACH_GRACE_TICKS = 60 but is itself still an astern
// tick. Of the 60 grace ticks that follow, ticks 1-59 hold the captured exit
// heading (holdRudder); on tick 60, graceTicks counts down to 0, holdHeading
// is nulled BEFORE buildInput runs, so target-seek (seekRudder) resumes that
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
// Determinism: every pilot decision rides its own mulberry32 stream seeded by
// the runner from (matchSeed, captain ordinal) — no Math.random, no Date.now.
// Same run key => byte-identical input streams (unit-pinned).
//
// SPEND POLICY (a measurement instrument, NOT canon AI — documented per the
// spec): whenever a level is banked, spend immediately on the front offer;
// with probability SPEND_TOP_P pick uniformly among the offer's HIGHEST-rarity
// lines (exclusive > rare > common — the "slight preference order"), otherwise
// uniformly among the whole offer. One refinement keeps the instrument honest:
// an EXCLUSIVE whose doctrine pair is already resolved on this ship (either
// side fitted) is demoted to common preference — the doctrine swap returns the
// rival's card to the deck (net-zero deck drain), so an always-prefer-exclusive
// policy would ping-pong the pair forever and never let the deck thin (found
// empirically; the swap stays LEGAL via the uniform branch, just not sought).
// This exercises the real spendPoint/settleSpend path (give-back, doctrine
// swap, acquisition scrub) while keeping picks deterministic per stream.

import {
  BOON_CATALOG,
  CONFIG,
  angleDiff,
  mulberry32,
  nearestCoastPoint,
  type InputMsg,
  type Island,
  type Rng,
  type Vec2,
} from '@salvo/shared';
import type { ShipRecord, World } from '../../src/game/world.js';

/** One scripted captain: drive your ship (and spend your levels) this tick. */
export interface CaptainPilot {
  readonly id: string;
  tick(world: World): void;
}

/** Builds a pilot for captain `id` on a deterministic seed. */
export type PilotFactory = (id: string, seed: number) => CaptainPilot;

/** Should the pilot seek and shoot targets THIS tick? Evaluated once per tick
 *  against the live world. MUST be pure and rng-free (see header). */
export type HuntPolicy = (world: World) => boolean;

/** Probability the spend policy takes the highest-rarity line (else uniform). */
export const SPEND_TOP_P = 0.75;

const RARITY_RANK: Record<string, number> = { common: 0, rare: 1, exclusive: 2 };

/** Preference rank of one offer line for `fitted` — the doctrine-pair
 *  demotion documented in the header (swapping is legal, never sought). */
function preferenceRank(id: string, fitted: readonly string[]): number {
  const def = BOON_CATALOG[id];
  if (def === undefined) return 0;
  if (def.exclusiveWith !== undefined && (fitted.includes(id) || fitted.includes(def.exclusiveWith))) return 0;
  return RARITY_RANK[def.rarity] ?? 0;
}

/** The deterministic spend policy, shared by pilots AND the deck-only mode.
 *  `fitted` = the ship's currently-applied boon ids (ship.boons). */
export function pickSpendChoice(offer: readonly string[], rng: Rng, fitted: readonly string[]): number {
  const ranks = offer.map((id) => preferenceRank(id, fitted));
  const best = Math.max(...ranks);
  const top: number[] = [];
  for (let i = 0; i < offer.length; i += 1) if (ranks[i] === best) top.push(i);
  if (rng.next() < SPEND_TOP_P) return top[Math.floor(rng.next() * top.length)];
  return Math.floor(rng.next() * offer.length);
}

// --- gunner pilot tunables (script behavior, not game balance) ---------------
const ZONE_SAFETY = 0.8; // steer for the ring center once outside this fraction of the live ring
const FIRE_RANGE_FACTOR = 0.65; // click only inside this fraction of effective gun range (accuracy over reach)
const CLOSE_RANGE_U = 150; // throttle down inside this range (hold steerage, keep tracking)
const WAYPOINT_REACHED_U = 60; // wander waypoint retarget distance
const ISLAND_LOOKAHEAD_U = 160; // dronesSmoke huntTick avoidance horizon

// --- un-beach seamanship (Story 3.4, amendment 25) ---------------------------
// All four numbers are TICK/UNIT counters — no rng, no world accessors beyond
// the ship's own pose. See the header for the ruling and the failure mode.
/** Ordered-throttle floor that counts as "meaningful ahead" (the pilot only
 *  ever emits 0.5 or 1 forward, so this separates ahead from astern/stop). */
const STUCK_THROTTLE_MIN = 0.4;
/** Per-tick displacement (u) below which a hull ordered AHEAD is not moving.
 *  0.1 u/tick = 2 u/s, which cleanly separates the two regimes: a permalocked
 *  hull crawls at ~0.2-0.25 u/s (~0.01 u/tick — the islandSpeedMult damp
 *  re-crushing speed every contact tick), while the SLOWEST intentional-slow
 *  order in this file (CLOSE_RANGE throttle 0.5 on the 35 u/s battleship) still
 *  makes 17.5 u/s = 0.875 u/tick. ~9x of headroom on both sides. */
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
 *  heading; tick 60 resumes target-seek one tick before stuck-detection
 *  re-arms on tick 61 — harmless, since detection stays suppressed through
 *  tick 60 either way. */
const UNBEACH_GRACE_TICKS = 60;
/** Astern rudder when no island qualifies as the blocker — a FIXED sign, never
 *  an rng pick (determinism), so a bow-on beaching still rotates its exit. */
const UNBEACH_FALLBACK_RUDDER = 1;
/** Proportional gain steering back to a stored heading — the same x3 idiom the
 *  normal goal-bearing rudder uses. */
const HEADING_GAIN = 3;

/** Nearest ALIVE non-self hull (deterministic: strict `<` keeps the earliest
 *  ships-map entry on ties — the world's own nearestEnemyCenter idiom). */
function nearestEnemy(world: World, self: ShipRecord): { ship: ShipRecord; d: number } | null {
  let best: ShipRecord | null = null;
  let bestD = Infinity;
  for (const ship of world.ships.values()) {
    if (!ship.alive || ship.id === self.id) continue;
    const d = Math.hypot(ship.state.x - self.state.x, ship.state.y - self.state.y);
    if (d < bestD) {
      bestD = d;
      best = ship;
    }
  }
  return best === null ? null : { ship: best, d: bestD };
}

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
 * makes a pilot hug the shape of a ridge or a cove mouth instead of arcing
 * around a phantom circle (a long landmass's tip can be dead ahead while its
 * centre is abeam).
 *
 * BROADPHASE IS MANDATORY (this runs per pilot per island per tick): the
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

/** Lead the target by straight-line shell flight time (dronesSmoke leadPoint,
 *  retargeted to the gun's shell speed). */
function leadPoint(self: ShipRecord, target: ShipRecord, d: number): Vec2 {
  const t = d / CONFIG.gun.shellSpeed;
  return {
    x: target.state.x + Math.cos(target.state.heading) * target.state.speed * t,
    y: target.state.y + Math.sin(target.state.heading) * target.state.speed * t,
  };
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/**
 * The v1 economy pilot: seek the nearest live hull, lead the shot, click the
 * standard gun (slot 0 — 360°, flies to the clicked point) whenever the target
 * is comfortably inside effective range; stay inside the storm; wander a
 * seeded waypoint when nothing is alive nearby. Grown from dronesSmoke's
 * huntTick ideas onto the in-process world.submitInput seam.
 */
class GunnerPilot implements CaptainPilot {
  private seq = 0;
  private fireSeq = 0;
  private aim = 0;
  private aimDist = 0;
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
    /** The hunt policy, evaluated per tick: `() => false` is the pacifist
     *  control (never target, never fire); `(w) => w.zonePhase === 'closed'`
     *  is the Story 3.4 endgame instrument. Never consumes rng. */
    private readonly hunt: HuntPolicy = () => true,
  ) {
    this.rng = mulberry32(seed);
  }

  tick(world: World): void {
    const ship = world.ships.get(this.id);
    if (!ship) return;
    // Spends are legal while dead (builds persist across waiting-phase deaths);
    // drain at most one banked level per tick through the REAL spend flow.
    if (ship.offers.length > 0) world.spendPoint(this.id, pickSpendChoice(ship.offers[0], this.rng, ship.boons));
    if (!ship.alive) {
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
   *  same line and metronomed). No targeting and no wander draw happen on
   *  these ticks, so the pilot never fires while backing and the rng stream
   *  stays untouched. */
  private asternInput(): InputMsg {
    return {
      seq: ++this.seq,
      throttle: -1,
      rudder: this.asternRudder,
      aim: this.aim,
      fireSeq: this.fireSeq,
      aimDist: this.aimDist,
      slot: 0,
      fireT: 0,
      actSeq: 0,
      actSlot: 0, hornSeq: 0,
    };
  }

  private buildInput(world: World, ship: ShipRecord): InputMsg {
    const target = this.hunt(world) ? nearestEnemy(world, ship) : null;
    // Through the grace window the rudder HOLDS the exit heading instead of
    // seeking; gunnery and throttle are untouched (amendment 25 v2).
    const rudder = this.holdHeading === null ? this.seekRudder(world, ship, target) : this.holdRudder(ship);
    const throttle = target !== null && target.d < CLOSE_RANGE_U ? 0.5 : 1;
    if (target !== null && target.d <= ship.stats.gun.rangeU * FIRE_RANGE_FACTOR) {
      // Click every tick while the solution holds: clicks are consumed, never
      // queued, so the reload paces actual shots (dronesSmoke huntTick idiom).
      const lead = leadPoint(ship, target.ship, target.d);
      this.aim = Math.atan2(lead.y - ship.state.y, lead.x - ship.state.x);
      this.aimDist = Math.min(Math.hypot(lead.x - ship.state.x, lead.y - ship.state.y), ship.stats.gun.rangeU);
      this.fireSeq += 1;
    }
    return {
      seq: ++this.seq,
      throttle,
      rudder,
      aim: this.aim,
      fireSeq: this.fireSeq,
      aimDist: this.aimDist,
      slot: 0, // the universal standard gun
      fireT: 0, // in-process: no latency, no claim (zero compensation)
      actSeq: 0,
      actSlot: 0, hornSeq: 0,
    };
  }

  /** The normal rudder: steer the goal bearing, biased clear of islands. */
  private seekRudder(world: World, ship: ShipRecord, target: { ship: ShipRecord; d: number } | null): number {
    const goal = this.pickGoal(world, ship, target);
    const brg = Math.atan2(goal.y - ship.state.y, goal.x - ship.state.x);
    return clamp(angleDiff(ship.state.heading, brg) * HEADING_GAIN + islandAvoid(world, ship), -1, 1);
  }

  /** The grace-window rudder: proportional steering back onto the heading the
   *  hull left the burst on. Nothing else may pull the bow around until the
   *  window expires — the probe measured target-seek undoing a battleship's
   *  whole 39.5 degree exit turn in ~1.7 s. No wander draw happens here. */
  private holdRudder(ship: ShipRecord): number {
    return clamp(angleDiff(ship.state.heading, this.holdHeading ?? ship.state.heading) * HEADING_GAIN, -1, 1);
  }

  /** Storm first, target second, seeded wander third — all against the LIVE
   *  ring (offset-center as of Story 3.1), never the map origin. */
  private pickGoal(world: World, ship: ShipRecord, target: { ship: ShipRecord; d: number } | null): Vec2 {
    const ring = world.zoneLiveRing;
    const fromRingCenter = Math.hypot(ship.state.x - ring.cx, ship.state.y - ring.cy);
    if (fromRingCenter > ring.r * ZONE_SAFETY) return { x: ring.cx, y: ring.cy };
    if (target !== null) return target.ship.state;
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

/** The pilot registry — the swap point for Epic 6 duties (see header). */
export const PILOT_REGISTRY: Record<string, PilotFactory> = {
  gunner: (id, seed) => new GunnerPilot(id, seed, () => true),
  // The no-hunt control (Story 3.1): same seeded steering/spending instrument,
  // hunt policy off — proves storm-forced pacing without lethality.
  pacifist: (id, seed) => new GunnerPilot(id, seed, () => false),
  // The endgame guarantee instrument (Story 3.4, amendment 23): pacifist until
  // the timeline is fully CLOSED, gunner after — see the header for why the
  // gate sits at closure rather than at the final ring group's start.
  endgame: (id, seed) => new GunnerPilot(id, seed, (w) => w.zonePhase === 'closed'),
};
