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
  type InputMsg,
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

/** Rudder bias steering clear of islands dead ahead (dronesSmoke islandAvoid). */
function islandAvoid(world: World, self: ShipRecord): number {
  const fx = Math.cos(self.state.heading);
  const fy = Math.sin(self.state.heading);
  let bias = 0;
  for (const isle of world.map.islands) {
    const dx = isle.x - self.state.x;
    const dy = isle.y - self.state.y;
    if (dx * fx + dy * fy <= 0 || Math.hypot(dx, dy) > ISLAND_LOOKAHEAD_U + isle.r) continue;
    bias += fx * dy - fy * dx > 0 ? -0.9 : 0.9;
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
    if (!ship.alive) return;
    world.submitInput(this.id, this.buildInput(world, ship));
  }

  private buildInput(world: World, ship: ShipRecord): InputMsg {
    const target = this.hunt(world) ? nearestEnemy(world, ship) : null;
    const goal = this.pickGoal(world, ship, target);
    const brg = Math.atan2(goal.y - ship.state.y, goal.x - ship.state.x);
    const rudder = clamp(angleDiff(ship.state.heading, brg) * 3 + islandAvoid(world, ship), -1, 1);
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
      actSlot: 0,
    };
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
