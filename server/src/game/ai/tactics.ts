// COMBAT-BOT TACTICS (Story 6.4, wave 3) — THE HANDS. Everything a bot
// actually DOES with the target and posture wave 2 handed it: where the helm
// goes, which weapon (if any) fires, and where it is aimed.
//
// This is the `BotBrain` the driver plugs in place of wave 1's neutral
// stand-in. Its whole world model is `mind.view` + `mind.contacts` (the
// fogged perception the driver captures for this bot every live tick) plus
// the bot's OWN record (`BotSelf` — its pose, hp, stats, loadout pools and
// economy, which is exactly the `OwnShip` a human client is sent). It reads
// NO world collection: the port hands it the clock, the map (islands +
// radius, which every client rebuilds from the seed) and the live storm
// ring, and nothing else. `world.js` is not imported here AT ALL — not even
// as a type — and the eslint boundary bans it for the whole directory.
//
// DELIBERATION RUNS ON THE DECISION CADENCE, THE HANDS RUN EVERY TICK
// (review-gate FIX 1): decide() is called every tick, but target reselection,
// posture choice and boon spends only happen when the driver passes
// `deliberate: true` (this bot's CONFIG.bots.decisionCadenceMs stagger slot).
// Between deliberations the cached target KEY is re-resolved against the
// live track store — so steering and firing follow the freshest plot — and
// the safety layers (ring escape, the un-beach machine, avoidance) are
// re-evaluated every tick regardless of the cached posture.
//
// THE MATHS ARE PORTED FROM drones.ts, THE MODULE IS NOT (spec: "port the
// maths, not the module"). The 3-iteration fixed-point lead solve, the
// nearest-COASTLINE-point island bias behind a mandatory bounding-circle
// broadphase, the boundary bias and the un-beach trip are all the fleet AI's,
// re-implemented against the perception view because a fleet hull reads
// `world.ships` and a bot may not.
//
// THE RING IS BOTH A FLOOR AND A CEILING. It escapes as a BEARING OVERRIDE
// when the hull is wet (priority 1 below), and — since the storm-chatter fix —
// it also CONSTRAINS every bearing the postures choose while the hull is dry
// (see ringClamped): a heading whose reversal-time run would end outside the
// ring is rotated to the edge of the legal cone instead. Without that second
// half the storm was only ever a post-hoc override, which is why a `disengage`
// flee — a pure reciprocal of the bearing to the threat, with no ring term at
// all — sailed straight through the rim and then bounced on it.
//
// STEERING PRIORITY — highest first, and the order is the policy:
//   1. RING ESCAPE. Outside the live ring, steer to its centre at full ahead,
//      and keep doing so until the hull is a full-ahead turn radius INSIDE the
//      rim (ringEscaping's deadband — releasing exactly on the boundary is
//      what produced the ~2.2s in-and-out limit cycle Eric watched).
//      It outranks every other BEARING a hull under way can choose — including
//      the un-beach manoeuvre's exit-heading HOLD, which yields to it: the
//      storm does not miss. The one thing it does NOT outrank is the astern
//      BURST, and that is a correction rather than a demotion: the burst
//      commands astern, so "steer the bow at the ring centre" moved a backing
//      hull AWAY from the ring while it was at it. A hull aground cannot
//      escape a storm by steering; getting off the rock IS the escape, and the
//      ring governs again the instant the burst releases (~<= 4s later, and
//      pinned).
//      IT DOES NOT OUTRANK AVOIDANCE, and the header used to claim it did.
//      helmFor composes the ESCAPE BEARING like any other track term, weighted
//      by `helmLeft = max(0, 1 − |avoid|)`, so in principle two saturated
//      coastline/mine/boundary terms could take the whole helm from a hull in
//      the storm. That is LATENT, not live: measured over 3707 outside-the-
//      ring bot-ticks, `helmLeft === 0` occurred ZERO times. The composition is
//      deliberately left alone — re-ordering avoidance near a coastline is how
//      bots get beached, and no evidence asks for it.
//   2. UN-BEACHING, in THREE STAGES (arm on sustained contact, back off under
//      a captured rudder, then hold the exit heading) — see updateManoeuvre.
//      The contact is read off the simulation's own bit
//      (BotSelf.landContact), never inferred from speed, because grounding
//      here is a speed CAP and a beached hull still makes 8.75-11.25 u/s. A
//      permanently beached bot is the single most visible failure this story
//      can ship (the fleet AI shipped exactly that once), so this outranks
//      every combat consideration below it.
//   3. POSTURE. engage / pursue / disengage / farm / reposition, per profile.
//   4. AVOIDANCE — coastlines, the map edge, and MINES THE BOT CAN SEE (a bot
//      sinking itself on a mine it was looking at reads as broken, so the mine
//      bias is not optional). It does not replace the posture bearing, but it
//      does TAKE THE HELM IN PROPORTION TO ITS OWN PRESSURE rather than merely
//      nudging a saturated track term: see helmFor for the measurement that
//      forced that, and for why it is the same defect as the un-beach one seen
//      one step earlier.
//
// THE REAR-QUARTER DOGFIGHT (Eric ruling C1) is geometry, not flavour: the
// torpedo's bow ±30° arc means a hull sitting behind a Torpedo Boat denies its
// best weapon while its own 360° gun stays live. The SAME manoeuvre against a
// Mine Layer sails you up the astern ±60° mine sector, so a `duelist` does not
// tail one — see wantsRearQuarter().
//
// ONE WEAPON PER TICK, THROUGH THE EQUIPMENT AXIS (Eric ruling 2026-08-20):
// chooseShot iterates the bot's ACTUAL FITTED SLOTS through EQUIPMENT_TACTICS
// (ai/equipment.ts) — never a hull-keyed weapon ladder — so an equipment
// ACQUIRED into the extra slot works exactly like a native fit. Ordering
// comes from the ship profile's APPETITE table (gun lowest: the fallback);
// the placement class (flare / mine / buoy) is resolved ABOVE the
// target === null guard, because siting a sensor buoy is most valuable when
// nothing is tracked. Every legality gate (arcs, ranges, water, the
// coastline check on every flat-trajectory round) lives with its weapon in
// the tactic's solve(), so `fireSlot` is null unless every check passed and
// the driver's fireSeq advances exactly when a legal shot was requested.

import {
  CONFIG,
  angleDiff,
  bearing,
  nearestCoastPoint,
  wrapAngle,
  type EffectiveStats,
  type EquipmentId,
  type Island,
  type ShipState,
  type Vec2,
} from '@salvo/shared';
import type { BotBrain, BotDecision, BotMind, BotSelf, BotWorldPort } from './types.js';
import { engagementBand, profileOf, type BotProfile } from './profiles.js';
import { chooseSpend, type BotSpendState } from './spending.js';
import { EQUIPMENT_TACTICS, appetiteFor, type Shot, type TacticContext } from './equipment.js';
import {
  choosePosture,
  foldView,
  pullBand,
  ringDeadband,
  ringEscaping,
  selectTargetKey,
  type BotPosture,
  type BotSituation,
  type BotTrack,
} from './utility.js';

/** Proportional gain turning heading error into rudder (the fleet AI's). */
const RUDDER_GAIN = 2;
/** Rudder magnitude one active avoidance term contributes. */
const AVOID_STRENGTH = 0.8;
/** u — lookahead along heading for the coastline-avoidance probe. */
const ISLAND_LOOKAHEAD = 120;
/** u — steer back toward centre once within this of the map boundary. */
const BOUNDARY_MARGIN = 80;
/** u — lookahead for the visible-mine probe. Three trigger radii: far enough
 *  to turn out of, near enough that a mine abeam is not a phantom threat. */
const MINE_LOOKAHEAD = CONFIG.mine.triggerRadius * 3;
/** Cruise throttle while holding an engagement band (a bot in its band is
 *  keeping station, not charging). */
const CRUISE_THROTTLE = 0.6;
/** Astern throttle while un-beaching. */
const UNBEACH_THROTTLE = -1;
/** The astern rudder when no coastline is in reach to turn away from — a FIXED
 *  sign, never an rng pick, so a bow-on beaching still rotates its exit. */
const UNBEACH_FALLBACK_RUDDER = 1;
/** u — how far astern of a peer a `duelist` steers for. Just outside the
 *  Torpedo Boat's 56.3u full-ahead turn radius, so the station is reachable by
 *  a turn rather than an endless spiral. */
const REAR_QUARTER_U = 90;

/** The bot's helm intent for this tick. */
interface Helm {
  throttle: number;
  rudder: number;
}


function clampUnit(v: number): number {
  if (v < -1) return -1;
  if (v > 1) return 1;
  return v;
}

// ---------------------------------------------------------------------------
// THE SELF-READ — the bot's own record (BotSelf, the structural view world.ts
// hands in) folded into the two plain values wave 2's pure modules speak.
// BotSelf is BY CONSTRUCTION only fields a human client is sent about its own
// hull, so nothing below this line can touch anything else.
// ---------------------------------------------------------------------------

/** Everything targeting/posture needs about the bot itself. */
export function situationOf(self: BotSelf, mind: BotMind, port: BotWorldPort): BotSituation {
  return {
    now: port.now,
    x: self.state.x,
    y: self.state.y,
    hp: self.hp,
    maxHp: self.stats.maxHp,
    stats: self.stats,
    speed: self.state.speed,
    profile: profileOf(mind.profile),
    ring: port.zoneLiveRing,
    islands: port.map.islands,
  };
}

/** Everything the boon policy needs about the bot's own economy. */
export function spendStateOf(self: BotSelf): BotSpendState {
  return {
    bankedLevels: self.bankedLevels,
    offer: self.offer,
    boons: self.boons,
    hp: self.hp,
    maxHp: self.stats.maxHp,
  };
}

// ---------------------------------------------------------------------------
// WEAPONS — the EQUIPMENT AXIS. Every weapon's want/solve/reach lives with
// the weapon in ai/equipment.ts (EQUIPMENT_TACTICS); this file only walks the
// bot's ACTUAL FITTED SLOTS through that registry, in appetite order.
// ---------------------------------------------------------------------------

/** One fitted slot, ranked by the profile's appetite for what it holds. */
interface RankedSlot {
  slot: number;
  id: EquipmentId;
  appetite: number;
}

/**
 * The bot's fitted slots in the order this PROFILE reaches for them: appetite
 * descending, slot index as the deterministic tie-break. Capability is read
 * from the LOADOUT, never from the hull — an acquired R-slot weapon ranks
 * exactly like a native fit.
 */
function rankedSlots(self: BotSelf, profile: BotProfile): RankedSlot[] {
  const out: RankedSlot[] = [];
  for (let i = 0; i < self.loadout.length; i += 1) {
    const id = self.loadout[i].equipmentId;
    if (id === null) continue;
    out.push({ slot: i, id, appetite: appetiteFor(profile, id) });
  }
  out.sort((a, b) => b.appetite - a.appetite || a.slot - b.slot);
  return out;
}

/** Readiness is `n > 0` — the pool, which is exactly what `consume()` tests.
 *  The mine's 2-round rack is why this is the pool and not "not reloading":
 *  a bot may legitimately drop its second mine while the first rebuilds. */
function slotReady(self: BotSelf, slot: number): boolean {
  const state = self.loadout[slot].state;
  return state !== null && state.n > 0;
}

/** Run one KIND of tactic over the ranked slots: first ready slot whose
 *  tactic both wants and legally solves wins the tick. */
function firePass(
  kind: 'shot' | 'placement',
  ranked: readonly RankedSlot[],
  base: TacticContext,
): Shot | null {
  for (const r of ranked) {
    const tactic = EQUIPMENT_TACTICS[r.id];
    if (tactic.kind !== kind) continue;
    if (!slotReady(base.self, r.slot)) continue;
    const ctx: TacticContext = { ...base, slot: r.slot };
    if (!tactic.want(ctx)) continue;
    const shot = tactic.solve(ctx);
    if (shot !== null) return shot;
  }
  return null;
}

/**
 * The one weapon this tick. PLACEMENTS (flare / mine / buoy) are resolved
 * ABOVE the target guard — siting a sensor buoy is most valuable exactly when
 * nothing is tracked, and a withdrawing layer's mine wants no target at all.
 * Shots need a target; the gun's low base appetite keeps it the last resort,
 * so heavy ordnance is always offered the tick first.
 */
function chooseShot(
  self: BotSelf,
  mind: BotMind,
  port: BotWorldPort,
  sit: BotSituation,
  target: BotTrack | null,
  posture: BotPosture,
): Shot | null {
  const ranked = rankedSlots(self, sit.profile);
  const base: TacticContext = { self, mind, sit, port, target, posture, slot: -1 };
  const placed = firePass('placement', ranked, base);
  if (placed !== null) return placed;
  if (target === null) return null;
  return firePass('shot', ranked, base);
}

/**
 * The ability press, if any: the 'ability' rows of the same registry (the
 * speed boost — spent opening range on the way out). Abilities ride the
 * actSeq channel, so this composes with a shot in the same tick.
 */
function chooseAct(
  self: BotSelf,
  mind: BotMind,
  port: BotWorldPort,
  sit: BotSituation,
  target: BotTrack | null,
  posture: BotPosture,
): number | null {
  for (const r of rankedSlots(self, sit.profile)) {
    const tactic = EQUIPMENT_TACTICS[r.id];
    if (tactic.kind !== 'ability') continue;
    if (!slotReady(self, r.slot)) continue;
    if (tactic.want({ self, mind, sit, port, target, posture, slot: r.slot })) return r.slot;
  }
  return null;
}

/**
 * The READY shot-weapon reaches for the band pull: every fitted 'shot' slot
 * with rounds in the pool contributes its tactic's effective reach. Exported
 * for the band-pull tests — the "only while loaded" clause is this list.
 */
export function readyShotReaches(self: BotSelf, stats: EffectiveStats): number[] {
  const out: number[] = [];
  for (let i = 0; i < self.loadout.length; i += 1) {
    const id = self.loadout[i].equipmentId;
    if (id === null || !slotReady(self, i)) continue;
    const tactic = EQUIPMENT_TACTICS[id];
    if (tactic.kind === 'shot') out.push(tactic.reachU(stats));
  }
  return out;
}

// ---------------------------------------------------------------------------
// STEERING
// ---------------------------------------------------------------------------

/** Which stage of the un-beach manoeuvre is driving the helm this tick. */
type Manoeuvre = 'none' | 'astern' | 'hold';

/**
 * The rudder to hold through an astern burst, chosen ONCE as it arms so the
 * BOW swings AWAY from the coast that is blocking it. Nearest coastline wins
 * (first-in-array on ties — deterministic, and rng-free), with the mandatory
 * bounding-circle broadphase before any polygon is visited.
 *
 * Unlike `islandBias` this does NOT apply a forward half-disc filter: a hull
 * that has just been shoved by the resolver can have the rock it is pinned
 * against anywhere around it, and turning away from the nearest land is right
 * in every one of those cases.
 *
 * SIGN NOTE — this is a REVERSE rudder. stepShip scales rudder authority by
 * `speed / steerageSpeed` with a SIGNED speed, so a given rudder yaws the hull
 * the opposite way when making sternway. The forward-sense "turn away" rudder
 * is `cross > 0 ? -1 : +1` (islandBias's idiom); backing, we command its
 * NEGATION to get the same bow swing. `+1` is the fixed fallback when no coast
 * is in reach at all, never a random pick.
 */
function asternRudder(self: BotSelf, port: BotWorldPort): number {
  const { x, y, heading } = self.state;
  const fx = Math.cos(heading);
  const fy = Math.sin(heading);
  let cross: number | null = null;
  let bestD = ISLAND_LOOKAHEAD;
  for (const isle of port.map.islands) {
    if (Math.hypot(isle.x - x, isle.y - y) > ISLAND_LOOKAHEAD + isle.r) continue;
    const coast = nearestCoastPoint({ x, y }, isle);
    if (coast.dist >= bestD) continue;
    bestD = coast.dist;
    cross = fx * (coast.y - y) - fy * (coast.x - x);
  }
  if (cross === null) return UNBEACH_FALLBACK_RUDDER;
  return cross > 0 ? 1 : -1;
}

/** Fold this tick's land contact into the arming dwell, and report whether it
 *  has now tripped. Any tick out of contact resets it, so only water the hull
 *  is genuinely pressing into can arm the manoeuvre. */
function tripped(self: BotSelf, mind: BotMind): boolean {
  if (!self.landContact) {
    mind.stuckMs = 0;
    return false;
  }
  mind.stuckMs += CONFIG.tick.simDtMs;
  return mind.stuckMs >= CONFIG.bots.stuckMs;
}

/**
 * Stage 1: full astern, under a rudder captured now so it cannot flap.
 *
 * A RETRY SWINGS THE OTHER WAY. `mind.unbeach` surviving with `holdUntil === 0`
 * means the previous burst ended STILL AGROUND (see endBurst), i.e. this hull
 * is in a pocket that one exit direction could not solve — a cove, a concave
 * headland, land astern. Repeating the same rudder there repeats the same
 * failure, so consecutive attempts alternate. It is the harness pilot's
 * disclosed KNOWN RESIDUAL ("a second blocker astern can zero the burst's
 * progress and re-arm with the SAME geometry") answered rather than inherited.
 */
function beginBurst(self: BotSelf, mind: BotMind, port: BotWorldPort): void {
  const prev = mind.unbeach;
  // `holdUntil === 0` is precisely "the last burst ended still aground". A
  // state carrying a real hold came off a SUCCESSFUL burst — a hull that got
  // clear and then grounded again somewhere else deserves a freshly probed
  // coast, not the inverse of a rudder that worked.
  const failed = prev?.holdUntil === 0 ? prev : null;
  mind.stuckMs = 0;
  mind.unbeachUntil = port.now + CONFIG.bots.unbeachAsternMaxMs;
  mind.unbeach = {
    rudder: failed ? -failed.rudder : asternRudder(self, port),
    fromX: self.state.x,
    fromY: self.state.y,
    holdUntil: 0,
    holdHeading: 0,
  };
}

/**
 * HAS THE BURST DONE ITS JOB? Both halves are required: the hull is off the
 * rock AND it has made `unbeachClearU` of ground away from where it stuck. The
 * second half is what stops the burst ending the instant the resolver lets go,
 * which would put the helm ahead again with the bow still against the coast.
 * Plain displacement is a safe stand-in for sternway here because the burst
 * commands full astern throughout and no hull can carry more than ~4.25u
 * forward after that order (see CONFIG.bots.unbeachClearU).
 */
function burstCleared(self: BotSelf, mind: BotMind): boolean {
  const u = mind.unbeach;
  if (u === undefined || u === null) return true;
  if (self.landContact) return false;
  return Math.hypot(self.state.x - u.fromX, self.state.y - u.fromY) >= CONFIG.bots.unbeachClearU;
}

/**
 * End the burst — into stage 2 if it worked, into a RETRY if it did not.
 *
 * A hull still touching land when its burst ceilings has no exit heading to
 * commit to: holding one would spend `unbeachHoldMs` driving AHEAD into the
 * rock it just failed to leave. So the hold is skipped, the state survives as
 * the "that direction failed" marker beginBurst alternates off, and the dwell
 * re-arms a fresh burst after one `stuckMs`.
 */
function endBurst(self: BotSelf, mind: BotMind, now: number): void {
  mind.unbeachUntil = 0;
  if (mind.unbeach === undefined || mind.unbeach === null) return;
  if (self.landContact) return; // wedged: retry, do not hold
  mind.unbeach.holdUntil = now + CONFIG.bots.unbeachHoldMs;
  mind.unbeach.holdHeading = self.state.heading;
}

/**
 * THE UN-BEACH STATE MACHINE. Three stages, and the middle two exist because
 * one number could not do both jobs:
 *
 *   ARM   — `CONFIG.bots.stuckMs` of SUSTAINED land contact, off the
 *           simulation's own bit (`BotSelf.landContact`), never a speed
 *           guess: grounding is a directional speed CAP, so a dead-on beached
 *           hull still holds `islandSpeedMult x maxSpeed` (11.25/10.00/8.75
 *           u/s by class) and no "am I going nowhere" threshold can separate
 *           that from a slow turn in open water. The bit is ONE TICK STALE by
 *           construction (botsTick sits ahead of resolveCollisions in
 *           STEP_ORDER), which is 50ms against a 1500ms dwell.
 *   ASTERN — full astern until the hull is CLEAR and has made real sternway
 *           (burstCleared), with `unbeachAsternMaxMs` as a ceiling. It ran for
 *           `stuckMs` — 1500ms — before this split, which is less sternway
 *           than a Battleship's own forward way takes to kill: its measured
 *           net displacement over one such burst was +3.21u, i.e. DEEPER IN
 *           THE ROCK, and it was the one hull the first grounding fix did not
 *           help (272.2s worst run against 10-13s for the other two).
 *   HOLD  — `unbeachHoldMs` committed to the exit heading, target-seek
 *           suppressed (avoidance stays live). Without it a bot reverses off
 *           cleanly, re-seeks a bearing that still runs through the same
 *           island and drives straight back in — the metronome, which is why
 *           fixing only the arming half DOUBLED land-contact episodes.
 *           SKIPPED ENTIRELY when the burst ends still aground (endBurst):
 *           there is no exit heading to commit to, and the next attempt
 *           alternates its exit direction instead (beginBurst). That pocket
 *           case is what the first campaign of this cycle left behind — a
 *           single 218s pin on a Battleship, 12% of ALL land contact measured
 *           across 1000 bot-matches, in one hull.
 *
 * The dwell keeps accumulating THROUGH the hold, deliberately: a committed
 * exit heading that happens to run onto another rock must be able to re-arm.
 * It does not accumulate during the burst — that stage already owns the rock.
 *
 * A DEATH MID-MANOEUVRE NEVER SURVIVES THE LIFE (review-gate fix): the
 * driver releases the whole un-beach state — burst clock, dwell, failed-exit
 * marker and any exit-heading hold — alongside the view when the hull goes
 * non-afloat (BotController.releasePerLifeState). The shipped code relied on
 * the respawn TELEPORT tripping burstCleared's displacement test, which did
 * release the stale burst but released it INTO a 3s hold pointed at wherever
 * the bot happened to die; a respawn now starts with a clean helm.
 */
function updateManoeuvre(self: BotSelf, mind: BotMind, port: BotWorldPort): Manoeuvre {
  const now = port.now;
  if (mind.unbeachUntil > 0) {
    if (now < mind.unbeachUntil && !burstCleared(self, mind)) return 'astern';
    endBurst(self, mind, now);
  }
  if (tripped(self, mind)) {
    beginBurst(self, mind, port);
    return 'astern';
  }
  const u = mind.unbeach;
  if (u === undefined || u === null) return 'none';
  if (now < u.holdUntil) return 'hold';
  // A finished hold is spent. A `holdUntil === 0` state is the failed-exit
  // marker beginBurst alternates off, so it is kept exactly as long as the
  // hull is still touching the thing it failed to leave.
  if (u.holdUntil > 0 || !self.landContact) mind.unbeach = null;
  return 'none';
}

/** Should a `duelist` take the rear quarter of this target? Only with a
 *  disclosed course to get behind, and NEVER against a Mine Layer: tailing one
 *  sails straight up its astern ±60° mine sector, which is the same geometry
 *  that makes the manoeuvre correct against everything else. */
function wantsRearQuarter(profile: BotProfile, t: BotTrack): boolean {
  if (profile.id !== 'duelist') return false;
  if (t.heading === null) return false;
  return t.cls !== 'mineLayer';
}

/** The point a bot steers AT: the target itself, or its rear quarter. */
export function approachPoint(profile: BotProfile, t: BotTrack): Vec2 {
  if (!wantsRearQuarter(profile, t)) return { x: t.x, y: t.y };
  const rear = wrapAngle((t.heading ?? 0) + Math.PI);
  return { x: t.x + Math.cos(rear) * REAR_QUARTER_U, y: t.y + Math.sin(rear) * REAR_QUARTER_U };
}

/** Band-holding geometry: close when outside the band, open when inside its
 *  floor, and hold a beam-on orbit while in it (which is what keeps a bot at
 *  its profile's fighting range instead of ramming through it).
 *
 *  THE BAND PULL (Eric ruling 2026-08-20) is applied HERE, at the helm: a
 *  READY fitted weapon whose reach lies below the profile's near edge tugs
 *  that edge halfway toward its reach (utility.ts pullBand) — so a `siege`
 *  Battleship eases in with a loaded torpedo and drifts back out the moment
 *  the tube empties, while the profile fractions stay the anchor. */
function bandBearing(self: BotSelf, sit: BotSituation, t: BotTrack): number {
  const aim = approachPoint(sit.profile, t);
  const brg = bearing(self.state, aim);
  const d = Math.hypot(aim.x - sit.x, aim.y - sit.y);
  const band = pullBand(engagementBand(sit.profile, sit.stats), readyShotReaches(self, sit.stats));
  if (d > band.max) return brg;
  if (d < band.min) return wrapAngle(brg + Math.PI);
  const side = angleDiff(brg, self.state.heading) >= 0 ? 1 : -1;
  return wrapAngle(brg + (Math.PI / 2) * side);
}

/** With nothing to chase, make for the live ring centre — the one place on the
 *  water that is always still there in ten minutes. */
function patrolBearing(self: BotSelf, sit: BotSituation): number {
  return bearing(self.state, { x: sit.ring.cx, y: sit.ring.cy });
}

/** The bearing the POSTURE wants, before the storm gets a say. Every branch
 *  here is a combat decision; none of them knows where the ring is. */
function postureBearing(
  self: BotSelf,
  sit: BotSituation,
  target: BotTrack | null,
  posture: BotPosture,
): number {
  const pos = self.state;
  if (target === null || posture === 'reposition') return patrolBearing(self, sit);
  if (posture === 'disengage') return wrapAngle(bearing(pos, target) + Math.PI);
  if (posture === 'pursue') return bearing(pos, approachPoint(sit.profile, target));
  return bandBearing(self, sit, target);
}

/**
 * u — HOW FAR AHEAD A BEARING IS JUDGED AGAINST THE RING.
 *
 * The TIME is the hull's own 180° REVERSAL TIME, `π / turnRate` (Torpedo Boat
 * 3.93s, Mine Layer 5.24s, Battleship 7.85s) — the honest answer to "how long
 * before I could be pointed back inward at all". Anything shorter is a promise
 * the hull cannot keep, and it is exactly why the Battleship read as the
 * offender first: it needs twice the Torpedo Boat's warning and was given the
 * same none. Per-hull and boon-aware for free, because it reads
 * `EffectiveStats.kinematics` rather than a table.
 *
 * THE SPEED IS THE GREATER OF RATED AND ACTUAL, and that is not a hedge — it
 * is the SPEED BOOST. `chooseAct` spends the boost on `disengage`, precisely
 * the posture that runs at the rim, and the ability raises the hull's cap in
 * the WORLD without touching `EffectiveStats.kinematics`; a `raider` therefore
 * makes 57 u/s against a rated 45 and covers 27% more water than a rated
 * lookahead budgets for. Measured: with the rated figure alone, 15 of 19
 * residual crossings were boosted raiders. `max()` and not the live speed
 * outright, because a hull loafing at 10 u/s can still accelerate, and
 * shrinking the horizon to match a momentary throttle would hand the storm
 * back the head start this whole constraint exists to deny.
 */
function ringLookaheadU(stats: EffectiveStats, speed: number): number {
  const rated = stats.kinematics.maxSpeed;
  return (Math.max(rated, Math.abs(speed)) * Math.PI) / stats.kinematics.turnRate;
}

/**
 * THE RING AS A CONSTRAINT ON A CHOSEN HEADING — the whole of this fix.
 *
 * Until now the storm appeared in the bot's steering in exactly one shape: an
 * OVERRIDE, once the hull was already wet. Nothing capped how far a chosen
 * heading could travel, so `disengage`'s pure reciprocal-of-the-bearing flee
 * (`postureBearing`) ran a boosted raider at 55 u/s in a straight line into
 * the storm whenever the enemy happened to lie inward of it. 8 of the 10
 * measured exits taken while the ring was NOT even closing were `disengage`.
 *
 * THE TEST IS A DISC PROJECTION, one line of algebra. With `u = pos − centre`,
 * `d = |u|`, a run of `L` (see ringLookaheadU) along `dir` and the safe radius
 * `S` below, the run ends at `pos + L·dir`, so it stays inside `S` iff
 *
 *     d² + 2L(u·dir) + L² <= S²    i.e.    u·dir <= (S² − d² − L²) / 2L
 *
 * Dividing by `d` turns that into a bound on the COSINE of the angle off the
 * outward radial, so the violating set is always a cone about "straight out"
 * and the repair is a rotation to its edge on the side the bearing was already
 * on — the smallest correction that satisfies it, never a reversal.
 *
 * THE CONSTRAINT ENGAGES EXACTLY AT `d > S − L` (set the bound to `d` and it
 * factors to `(d + L)² = S²`), so a bot in open water is untouched and a bot
 * near the rim finds its flee bent TANGENTIAL — running along the inside of
 * the ring, which is what a competent human does when cornered. It is a
 * CONSTRAINT and not a behaviour: nothing here chooses a target, a posture, a
 * throttle or a shot, and the deliberately-not-built "priced excursion" (a bot
 * knowingly taking storm damage to break a lethal contact) stays unbuilt.
 *
 * Degenerate cases, both fail-safe: at `d ≈ 0` no heading changes `u·dir` and
 * the bearing stands; when even straight inward cannot make it (`cosMax <= -1`
 * — a collapsing ring smaller than the hull's own reversal run), the least
 * violating heading IS straight inward, which is also what ring escape would
 * command a moment later.
 *
 * MEASURED, 10 matches x 12 bots, seed 7, ~356 bot-minutes: ring crossings 80
 * -> 12, crossings while the ring was NOT closing 69 -> 3, storm damage 492 ->
 * 226 hp, time outside 0.60% -> 0.26%, and the chatter signature itself —
 * median depth reached back inside before the NEXT exit — 0.2u -> 142.9u.
 * Bots fight the same: 10.80 -> 10.90 kills/match and 178.8 -> 177.2 damage
 * per bot-minute, on a mean afloat time that ROSE 2.86 -> 2.97 minutes.
 */
function ringClamped(pos: ShipState, sit: BotSituation, want: number): number {
  const ring = sit.ring;
  const ux = pos.x - ring.cx;
  const uy = pos.y - ring.cy;
  const d = Math.hypot(ux, uy);
  if (!(ring.r > 0) || d < 1e-6) return want;
  const lookahead = ringLookaheadU(sit.stats, pos.speed);
  // THE RUN MUST END INSIDE THE DEADBAND, NOT MERELY INSIDE THE RING — the
  // SAME `ringDeadband` the escape releases at, so "water I may steer into"
  // and "water I have escaped to" are one boundary rather than two. Measured,
  // and it is why: clamping against the raw rim puts the constraint's
  // equilibrium at sqrt(r^2 - L^2), which on a 2223u ring is SEVEN UNITS
  // inside it — bots ran a perfect tangential orbit and grazed the rim by 1u
  // anyway, trading Eric's chatter for a wall-hug. Five of seventeen residual
  // crossings were exactly that, all at 90-110 degrees off the outward radial.
  const safe = Math.max(0, ring.r - ringDeadband(sit.stats, pos.speed));
  const cosMax = (safe * safe - d * d - lookahead * lookahead) / (2 * lookahead * d);
  if (cosMax >= 1) return want; // the whole compass ends inside: no constraint
  const out = Math.atan2(uy, ux); // the outward radial — the cone's axis
  if (cosMax <= -1) return wrapAngle(out + Math.PI); // nothing fits: run inward
  const off = angleDiff(out, want); // signed angle of `want` off the radial
  const limit = Math.acos(cosMax);
  if (Math.abs(off) >= limit) return want;
  return wrapAngle(out + (off >= 0 ? limit : -limit));
}

/** The bearing the helm wants, applying the priority order in the header. The
 *  astern stage never asks: it steers on its captured rudder (see helmFor).
 *
 *  THE HOLD IS DELIBERATELY NOT CLAMPED. It is the un-beach machine's
 *  committed exit heading, chosen to get a hull OFF a rock, and bending it
 *  toward the ring centre is how a bot re-beaches on the same coast. Ring
 *  escape already outranks it (the clause above), which is the case that
 *  actually matters; the constraint is for headings a bot chose freely. */
function desiredBearing(
  self: BotSelf,
  mind: BotMind,
  sit: BotSituation,
  target: BotTrack | null,
  posture: BotPosture,
  holding: boolean,
): number {
  const pos = self.state;
  if (ringEscaping(sit, posture === 'ringRun')) return bearing(pos, { x: sit.ring.cx, y: sit.ring.cy });
  if (holding) return mind.unbeach?.holdHeading ?? pos.heading;
  return ringClamped(pos, sit, postureBearing(self, sit, target, posture));
}

/** Full ahead everywhere except holding a band (station-keeping). */
function throttleFor(posture: BotPosture): number {
  return posture === 'engage' || posture === 'farm' ? CRUISE_THROTTLE : 1;
}

/**
 * The shared avoidance kernel: a rudder bias away from ONE hazard point that
 * lies ahead within `lookahead`. cross(heading, toHazard) > 0 means the hazard
 * is to port, so steer starboard, and vice versa. Hazards astern contribute
 * nothing — you are already leaving.
 */
function pointBias(hx: number, hy: number, x: number, y: number, fx: number, fy: number, lookahead: number): number {
  const dx = hx - x;
  const dy = hy - y;
  if (Math.hypot(dx, dy) > lookahead) return 0;
  if (dx * fx + dy * fy <= 0) return 0; // astern
  return fx * dy - fy * dx > 0 ? -AVOID_STRENGTH : AVOID_STRENGTH;
}

/**
 * Rudder bias away from one island's COASTLINE. Keyed on the nearest point of
 * the real coast, never the bounding-circle centre — the tip of a long
 * landmass can be dead ahead while its centre is abeam. BROADPHASE IS
 * MANDATORY (this runs per bot per island per tick): the bounding circle
 * rejects before any edge is visited.
 */
function islandBias(isle: Island, x: number, y: number, fx: number, fy: number): number {
  if (Math.hypot(isle.x - x, isle.y - y) > ISLAND_LOOKAHEAD + isle.r) return 0;
  const coast = nearestCoastPoint({ x, y }, isle);
  if (coast.dist > ISLAND_LOOKAHEAD) return 0;
  return pointBias(coast.x, coast.y, x, y, fx, fy, ISLAND_LOOKAHEAD);
}

/** Summed coastline bias over every island. */
function avoidIslands(self: BotSelf, port: BotWorldPort): number {
  const { x, y, heading } = self.state;
  const fx = Math.cos(heading);
  const fy = Math.sin(heading);
  let bias = 0;
  for (const isle of port.map.islands) bias += islandBias(isle, x, y, fx, fy);
  return bias;
}

/**
 * Summed bias away from every mine the bot CAN SEE — its own are skipped
 * because an owner never trips its own rack, so a `trapper` is free to sail
 * through its own field. Everything here comes from the perception view's
 * `mines`, which already carries the 3/8 detect gate: a bot avoids exactly the
 * mines a human in its seat would have been shown.
 */
function avoidMines(self: BotSelf, mind: BotMind): number {
  if (mind.view === null) return 0;
  const { x, y, heading } = self.state;
  const fx = Math.cos(heading);
  const fy = Math.sin(heading);
  let bias = 0;
  for (const m of mind.view.mines) {
    if (m.own) continue;
    bias += pointBias(m.x, m.y, x, y, fx, fy, MINE_LOOKAHEAD);
  }
  return bias;
}

/** Near the map edge, steer back toward the middle. */
function boundaryBias(self: BotSelf, port: BotWorldPort): number {
  const pos = self.state;
  if (Math.hypot(pos.x, pos.y) < port.map.radius - BOUNDARY_MARGIN) return 0;
  return clampUnit(angleDiff(pos.heading, bearing(pos, { x: 0, y: 0 }))) * AVOID_STRENGTH;
}

/**
 * Throttle + rudder for this tick: the posture bearing, with every avoidance
 * term composed onto the rudder.
 *
 * AVOIDANCE YIELDS THE HELM IN PROPORTION TO ITS OWN PRESSURE, and this is a
 * fix, not a taste. The shipped composition was a plain sum, `track + avoid`,
 * over a track term that SATURATES at ±1: a bearing running straight through a
 * coastline pinned track at +1 against a single island term of −0.8, netting
 * +0.2 — a turn TOWARD the land the probe had just found. Even at equilibrium
 * the sum only bought a 0.4/2 = 22.9° offset from a bearing aimed at rock,
 * which on most approach geometries is not a miss. Weighting the track term by
 * the avoidance headroom (`1 − |avoid|`) makes one active island term claim
 * 80% of the helm and two claim all of it, so the bot rounds the obstacle and
 * resumes its bearing when the coast leaves the probe's forward half-disc,
 * instead of grinding along it. Measured over the 60s bow-on beaching drill
 * (per class × 4 map seeds, mean ticks in land contact): 41.6% before this
 * cycle → 25.4% with the three-stage manoeuvre alone → 8.0% with this. It
 * changes NO target selection, no engagement band and no profile table — the
 * bot still wants exactly what it wanted; it just cannot insist through a
 * headland.
 *
 * THE ASTERN STAGE TAKES NO AVOIDANCE AT ALL, and the reason is the same sign
 * inversion asternRudder documents: every avoidance term here is a FORWARD-
 * sense bias (steer so the bow swings away), but rudder authority is scaled by
 * a SIGNED speed, so while making sternway those terms yaw the hull the wrong
 * way — they would fight the very turn the burst captured its rudder to make.
 * Backing therefore steers on the captured rudder ALONE. The hold is ordinary
 * ahead steering, so avoidance stays live through it exactly as usual.
 */
function helmFor(
  self: BotSelf,
  mind: BotMind,
  port: BotWorldPort,
  sit: BotSituation,
  target: BotTrack | null,
  posture: BotPosture,
): Helm {
  const stage = updateManoeuvre(self, mind, port);
  if (stage === 'astern') {
    return { throttle: UNBEACH_THROTTLE, rudder: mind.unbeach?.rudder ?? UNBEACH_FALLBACK_RUDDER };
  }
  const want = desiredBearing(self, mind, sit, target, posture, stage === 'hold');
  const track = clampUnit(angleDiff(self.state.heading, want) * RUDDER_GAIN);
  const avoid = avoidIslands(self, port) + avoidMines(self, mind) + boundaryBias(self, port);
  const helmLeft = Math.max(0, 1 - Math.abs(avoid));
  return { throttle: throttleFor(posture), rudder: clampUnit(track * helmLeft + avoid) };
}

// ---------------------------------------------------------------------------
// THE BRAIN
// ---------------------------------------------------------------------------

/**
 * Fold a FRESH view into contact memory. The driver observes every live tick
 * and stamps `viewAt`, so under the driver the fold runs every tick — but the
 * equality test still earns its keep: a test (or a frozen tick) that hands
 * the brain a view it did NOT capture this tick must not re-run the memory
 * prune or re-credit Hit Calls against it.
 */
function ingest(mind: BotMind, port: BotWorldPort): void {
  if (mind.view !== null && mind.viewAt === port.now) foldView(mind, mind.view, port.now);
}

/**
 * THE DELIBERATION — the decision-cadence work: reselect the target (cached
 * as its track KEY so every later tick re-resolves the freshest plot) and
 * re-choose the posture. The one writer of both cached fields.
 *
 * The OUTGOING posture is fed back in: it is the latch for the ring-escape
 * deadband (see utility.ts's ringEscaping), so escape releases one full-ahead
 * turn radius INSIDE the rim rather than exactly on it.
 */
function deliberateNow(mind: BotMind, sit: BotSituation): void {
  mind.targetKey = selectTargetKey(mind, sit);
  mind.posture = choosePosture(sit, resolveTarget(mind), mind.posture);
}

/** The cached target key resolved against the LIVE track store — a pruned or
 *  sunk key yields no target until the next deliberation re-picks. */
function resolveTarget(mind: BotMind): BotTrack | null {
  return mind.targetKey === null ? null : mind.contacts.get(mind.targetKey) ?? null;
}

/** Where the bot points when it is not shooting — at its target if it has one,
 *  else straight ahead. Aim is only consumed by a firing/priming tick, but a
 *  coherent value keeps the input stream honest. */
function idleAim(self: BotSelf, target: BotTrack | null): number {
  return target === null ? self.state.heading : bearing(self.state, target);
}

/**
 * THE COMBAT BRAIN. Every tick: fold what was seen, then turn the cached
 * deliberation into a helm order, at most one shot and at most one ability
 * press. On a `deliberate` tick (the decision cadence — defaulted true so a
 * single-decision test IS a deliberation) it first reselects target and
 * posture, and only then may it also spend a banked level. Steering safety
 * (ring escape, un-beaching, avoidance) lives in helmFor and runs every tick
 * regardless of the cached posture.
 */
export const COMBAT_BRAIN: BotBrain = {
  decide(self: BotSelf, mind: BotMind, port: BotWorldPort, deliberate = true): BotDecision {
    ingest(mind, port);
    const sit = situationOf(self, mind, port);
    if (deliberate) deliberateNow(mind, sit);
    const target = resolveTarget(mind);
    const posture = mind.posture;
    const helm = helmFor(self, mind, port, sit, target, posture);
    const shot = chooseShot(self, mind, port, sit, target, posture);
    return {
      throttle: helm.throttle,
      rudder: helm.rudder,
      aim: shot === null ? idleAim(self, target) : shot.aim,
      aimDist: shot === null ? 0 : shot.aimDist,
      fireSlot: shot === null ? null : shot.slot,
      actSlot: chooseAct(self, mind, port, sit, target, posture),
      spendChoice: deliberate ? chooseSpend(sit.profile, spendStateOf(self), undefined, mind.spendRng) : null,
    };
  },

  /**
   * THE HELD DECISION (Story 7-6 wave 4) — the 'endgame' engage gate's
   * pre-release tick. Perception still folds (parity: a captain waiting out
   * the storm still watches the scope, and the memory it builds is what makes
   * the release competent), the helm runs the FULL every-tick safety stack —
   * ring escape, un-beaching, island avoidance — through the same helmFor the
   * live brain uses, and levels are still spent on the decision cadence. What
   * never happens: a target (targetKey is FORCED null every tick, so the
   * postures that chase one are unreachable), a shot, or an ability press.
   */
  decideHeld(self: BotSelf, mind: BotMind, port: BotWorldPort, deliberate = true): BotDecision {
    ingest(mind, port);
    const sit = situationOf(self, mind, port);
    mind.targetKey = null; // unconditional: a held bot NEVER carries a target
    if (deliberate) mind.posture = choosePosture(sit, null, mind.posture);
    const helm = helmFor(self, mind, port, sit, null, mind.posture);
    return {
      throttle: helm.throttle,
      rudder: helm.rudder,
      aim: self.state.heading,
      aimDist: 0,
      fireSlot: null,
      actSlot: null,
      spendChoice: deliberate ? chooseSpend(sit.profile, spendStateOf(self), undefined, mind.spendRng) : null,
    };
  },
};
