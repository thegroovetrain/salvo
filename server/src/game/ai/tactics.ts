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
// boundary bias and the un-beach trip are the fleet AI's, re-implemented
// against the perception view because a fleet hull reads `world.ships` and a
// bot may not. Since Story 9.13 the STEERING maths live in ai/navigate.ts
// (graded avoidance on the nav grid, routes, the ring flow field, patrol) and
// the fleet imports them from there — the one direction the boundary allows.
//
// THE RING IS BOTH A FLOOR AND A CEILING. It escapes as a BEARING OVERRIDE
// when the hull is wet (priority 1 below), and — since the storm-chatter fix —
// it also CONSTRAINS every bearing the postures choose while the hull is dry
// (see navigate.ts ringClamped): a heading whose reversal-time run would end
// outside the ring is rotated to the edge of the legal cone instead — or, when
// that edge runs into land, handed to the ring's flow field (Story 9.13). Without that second
// half the storm was only ever a post-hoc override, which is why a `disengage`
// flee — a pure reciprocal of the bearing to the threat, with no ring term at
// all — sailed straight through the rim and then bounced on it.
//
// STEERING PRIORITY — highest first, and the order is the policy:
//   1. RING ESCAPE. Outside the live ring — or DEPARTING for the revealed next
//      ring in time (Story 9.13, amendment 200(1)) — descend the target
//      ring's flow field around the land (ai/navigate.ts) at full ahead,
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
//   4. AVOIDANCE — coastlines (since Story 9.13 the graded multi-ray fan on
//      the nav grid, ai/navigate.ts), the map edge, and MINES THE BOT CAN SEE (a bot
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
// chooseShot iterates the bot's ACTUAL FITTED SLOTS through `tacticFor` — the
// EQUIPMENT_TACTICS / CONSUMABLE_TACTICS pair in ai/tacticRegistry.ts — never
// a hull-keyed weapon ladder — so an equipment
// ACQUIRED into the WEAPON ROW (Story 8.5) works exactly like a seeded fit —
// there is no native per-hull fit left for it to differ from. Ordering
// comes from the ship profile's APPETITE table (gun lowest: the fallback);
// the placement class (flare / mine / decoy) is resolved ABOVE the
// target === null guard, because siting a sensor was most valuable when
// nothing is tracked. Every legality gate (arcs, ranges, water, the
// coastline check on every flat-trajectory round) lives with its weapon in
// the tactic's solve(), so `fireSlot` is null unless every check passed and
// the driver's fireSeq advances exactly when a legal shot was requested.

import {
  CONFIG,
  SLOT_GUN,
  angleDiff,
  bearing,
  nearestCoastPoint,
  wrapAngle,
  type EffectiveStats,
  type SlotItemId,
  type Vec2,
} from '@salvo/shared';
import type { BotBrain, BotDecision, BotMind, BotSelf, BotWorldPort } from './types.js';
import { profileOf, type BotProfile } from './profiles.js';
import { chooseSpend, type BotSpendState } from './spending.js';
import { slotAppetite, tacticFor } from './tacticRegistry.js';
import { leadPoint, type Shot, type TacticContext } from './tacticKit.js';
import { noteTorpedoes } from './torpedoThreat.js';
import { gunBand, ownLitZones, selfIdOf } from './doctrine.js';
import { atCover } from './cover.js';
import {
  RUDDER_GAIN,
  avoidHulls,
  avoidIslands,
  avoidMines,
  avoidReachU,
  bandOrbit,
  boundaryBias,
  clampUnit,
  composeRudder,
  departureDue,
  hullLengthU,
  kiteBearing,
  navOf,
  patrolBearing,
  ringClamped,
  ringGoalOf,
  ringRunBearing,
  steerToward,
  type NavCtx,
} from './navigate.js';
import {
  choosePosture,
  foldView,
  ownReachU,
  plotAt,
  pullBand,
  ringEscaping,
  selectTargetKey,
  type BotPosture,
  type BotSituation,
  type BotTrack,
} from './utility.js';

/** u — how far the un-beach probe looks for the coast to swing away from. */
const UNBEACH_PROBE_U = 120;
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


// ---------------------------------------------------------------------------
// THE SELF-READ — the bot's own record (BotSelf, the structural view world.ts
// hands in) folded into the two plain values wave 2's pure modules speak.
// BotSelf is BY CONSTRUCTION only fields a human client is sent about its own
// hull, so nothing below this line can touch anything else.
// ---------------------------------------------------------------------------

/** The mind's resolved profile ROW, with the harness's spend overrides
 *  applied (BotMind.spendRandom / spendGunFirst): a copy whose `spend` alone
 *  is flipped, so temperament is byte-identical and chooseSpend's existing
 *  fork does the rest. Gun-first flips only a WEIGHTED row (a test row stays
 *  random). The shipped path (both false) returns the frozen row itself. */
export function profileRowOf(mind: BotMind): BotProfile {
  const row = profileOf(mind.profile);
  if (mind.spendRandom === true && row.spend !== 'random') return { ...row, spend: 'random' };
  if (mind.spendGunFirst === true && row.spend === 'weighted') return { ...row, spend: 'gunFirst' };
  return row;
}

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
    heading: self.state.heading,
    profile: profileRowOf(mind),
    ring: port.zoneLiveRing,
    islands: port.map.islands,
    waterR: port.map.radius,
    gunId: self.loadout[SLOT_GUN]?.equipmentId ?? null, // the band's anchor (Story 9.8, ruling 126)
    // Story 9.13: own class (ram exit, cover arrival), own lit zones (the
    // lit-target bonus, amendment 204) and the ring departure (200(1)).
    hullId: self.hullId,
    ownLitZones: ownLitZones(mind.view?.litZones, selfIdOf(self), port.now),
    departing: departureDue({ x: self.state.x, y: self.state.y, stats: self.stats, speed: self.state.speed }, port, navOf(port)),
  };
}

/** Everything the card-spend policy needs about the bot's own economy. */
export function spendStateOf(self: BotSelf): BotSpendState {
  return {
    bankedLevels: self.bankedLevels,
    offer: self.offer,
    cards: self.cards,
    // The nine slot contents, so the scorer can skip a card `spendCard` would
    // refuse (Story 8.14 review, F4) — a self-read like every other field here.
    slotIds: self.loadout.map((s) => s.equipmentId),
    hp: self.hp,
    // The paid HULL REPAIR still draining in (Story 8.20): the scorer's HURT
    // read is (hp + repairHp) / maxHp — the heal tactic's own read.
    repairHp: self.repairHp,
    maxHp: self.stats.maxHp,
  };
}

// ---------------------------------------------------------------------------
// WEAPONS — the EQUIPMENT AXIS. Every row's want/solve/reach lives with its
// item (ai/equipment.ts weapons, ai/shift.ts Shifts, ai/consumables.ts belt),
// assembled by ai/tacticRegistry.ts; this file only walks the bot's ACTUAL
// FITTED SLOTS through those registries, in appetite order.
// ---------------------------------------------------------------------------

/** One fitted slot, ranked by the profile's appetite for what it holds. */
interface RankedSlot {
  slot: number;
  id: SlotItemId;
  appetite: number;
}

/**
 * The bot's fitted slots in the order this PROFILE reaches for them: appetite
 * descending, slot index as the deterministic tie-break. Capability is read
 * from the LOADOUT, never from the hull — an acquired R-slot weapon ranks
 * exactly like a native fit.
 *
 * THE BELT IS ADMITTED since Story 8.8 (epic-8 amendment 49): a stocked
 * consumable is a fitted slot like any other, ranked by `slotAppetite` (which
 * spans both id spaces) and resolved by `tacticFor` at each pass. Every belt
 * line sits at the neutral base today, so a consumable ties with an unlisted
 * weapon and the slot index breaks it — the belt is always to the right, so
 * nothing the bot already reached for moves.
 */
function rankedSlots(self: BotSelf, profile: BotProfile): RankedSlot[] {
  const out: RankedSlot[] = [];
  for (let i = 0; i < self.loadout.length; i += 1) {
    const id = self.loadout[i].equipmentId;
    if (id === null) continue;
    out.push({ slot: i, id, appetite: slotAppetite(profile, id) });
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
    const tactic = tacticFor(r.id);
    if (tactic === undefined || tactic.kind !== kind) continue; // unknown id: fail closed
    if (!slotReady(base.self, r.slot)) continue;
    const ctx: TacticContext = { ...base, slot: r.slot };
    if (!tactic.want(ctx)) continue;
    const shot = tactic.solve(ctx);
    if (shot !== null) return shot;
  }
  return null;
}

/**
 * The one weapon this tick. PLACEMENTS (flare / mine / decoy) are resolved
 * ABOVE the target guard — a placement's want() may fire exactly when
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
 * The ability press, if any: the 'ability' rows of EITHER registry — the class
 * Shift (the speed boost on the way out or into a fight, INSTANT RELOAD, DAMAGE
 * CUT) and the consumable abilities (HULL REPAIR, SHIELD BLOCK, MULTI-SPECTRAL COUNTERMEASURE). Abilities ride the actSeq channel, so this composes with a shot in
 * the same tick.
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
    const tactic = tacticFor(r.id);
    if (tactic === undefined || tactic.kind !== 'ability') continue; // unknown id: fail closed
    if (!slotReady(self, r.slot)) continue;
    if (!tactic.want({ self, mind, sit, port, target, posture, slot: r.slot })) continue;
    mind.lastTactic = r.id; // harness readout (Story 9.13)
    return r.slot;
  }
  return null;
}

/**
 * The READY shot-weapon reaches for the band pull: every fitted 'shot' slot
 * with rounds in the pool contributes its tactic's effective reach. Exported
 * for the band-pull tests — the "only while loaded" clause is this list.
 *
 * THE BELT IS IN IT (cycle-148 review gate, P3). This used to skip every
 * consumable slot on the claim that no consumable line was a 'shot' tactic —
 * true when it was written, and false since Story 8.13 gave the belt the
 * SUPERCAV TORPEDO (epic-8 amendment 74). A bot holding supercav stock will
 * genuinely shoot it (`firePass` resolves the belt through `tacticFor`), so a
 * band pull computed without its reach steered the hull to a range its own
 * ready weapon did not want. The lookup goes through `tacticFor`, the ONE
 * resolver that spans both id spaces, so the registries stay the authority on
 * what is a shot.
 */
export function readyShotReaches(self: BotSelf, stats: EffectiveStats): number[] {
  const out: number[] = [];
  for (let i = 0; i < self.loadout.length; i += 1) {
    const id = self.loadout[i].equipmentId;
    if (id === null || !slotReady(self, i)) continue;
    const tactic = tacticFor(id);
    if (tactic !== undefined && tactic.kind === 'shot') out.push(tactic.reachU(stats)); // unknown id: skipped
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
 * It does NOT apply a forward filter (unlike the avoidance fan): a hull
 * that has just been shoved by the resolver can have the rock it is pinned
 * against anywhere around it, and turning away from the nearest land is right
 * in every one of those cases.
 *
 * SIGN NOTE — this is a REVERSE rudder. stepShip scales rudder authority by
 * `speed / steerageSpeed` with a SIGNED speed, so a given rudder yaws the hull
 * the opposite way when making sternway. The forward-sense "turn away" rudder
 * is `cross > 0 ? -1 : +1` (navigate.ts pointBias's idiom); backing, we command its
 * NEGATION to get the same bow swing. `+1` is the fixed fallback when no coast
 * is in reach at all, never a random pick.
 */
function asternRudder(self: BotSelf, port: BotWorldPort): number {
  const { x, y, heading } = self.state;
  const fx = Math.cos(heading);
  const fy = Math.sin(heading);
  let cross: number | null = null;
  let bestD = UNBEACH_PROBE_U;
  for (const isle of port.map.islands) {
    if (Math.hypot(isle.x - x, isle.y - y) > UNBEACH_PROBE_U + isle.r) continue;
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

/** The point a bot steers AT: the target's plot point, or its rear quarter.
 *  The plot point is the PREDICTED position (utility.ts plotAt — cycle 165
 *  review, B4: the helm steers at the same point the guns lead from); a
 *  caller without a situation reads the plot's last-known position. */
export function approachPoint(profile: BotProfile, t: BotTrack, sit?: Pick<BotSituation, 'now' | 'waterR'>): Vec2 {
  const p = sit === undefined ? { x: t.x, y: t.y } : plotAt(sit, t);
  if (!wantsRearQuarter(profile, t)) return p;
  const rear = wrapAngle((t.heading ?? 0) + Math.PI);
  return { x: p.x + Math.cos(rear) * REAR_QUARTER_U, y: p.y + Math.sin(rear) * REAR_QUARTER_U };
}

/** Band holding at the GUN's doctrine band (Story 9.13, amendment 198 —
 *  ai/doctrine.ts gunBand; the profile only nudges it), with the BAND PULL
 *  (Eric ruling 2026-08-20) applied here: a READY fitted weapon whose reach
 *  lies below the band's near edge tugs that edge halfway toward its reach
 *  (utility.ts pullBand). The beam-on orbit is ai/navigate.ts bandOrbit. */
function bandBearing(self: BotSelf, sit: BotSituation, t: BotTrack): number {
  const band = pullBand(gunBand(sit.profile, sit.stats, sit.gunId), readyShotReaches(self, sit.stats));
  return bandOrbit(self.state, approachPoint(sit.profile, t, sit), band);
}

/** This tick's nav context (ai/navigate.ts). */
function navCtxOf(self: BotSelf, mind: BotMind, port: BotWorldPort, deliberate: boolean): NavCtx {
  return { pos: self.state, mind, nav: navOf(port), now: port.now, hullU: hullLengthU(self.hullId), deliberate };
}

/** NO TARGET (amendments 200(3), 202): siege / trapper make for their cover
 *  point; everyone else runs the routed, cover-weighted patrol inside the
 *  always-safe disc (pre-reveal) or the revealed next ring. The live-centre
 *  patrol and its orbit are retired. */
function idleBearing(ctx: NavCtx, port: BotWorldPort, sit: BotSituation): number {
  const cover = ctx.mind.coverPoint ?? null;
  if (sit.profile.holdsInCover && cover !== null) return steerToward(ctx, cover);
  return patrolBearing(ctx, port, sit, avoidReachU(sit.stats));
}

/** THE BREAK-OFF (disengage / hide, amendment 199): steer (routed) for the
 *  cover point when there is one, else the reciprocal of the threat. */
function fleeBearing(ctx: NavCtx, port: BotWorldPort, sit: BotSituation, target: BotTrack | null): number {
  const cover = ctx.mind.coverPoint ?? null;
  if (cover !== null) return steerToward(ctx, cover);
  if (target === null) return idleBearing(ctx, port, sit);
  return wrapAngle(bearing(ctx.pos, plotAt(sit, target)) + Math.PI);
}

/** The bearing the POSTURE wants, before the storm gets a say. */
function postureBearing(
  ctx: NavCtx,
  self: BotSelf,
  port: BotWorldPort,
  sit: BotSituation,
  target: BotTrack | null,
  posture: BotPosture,
): number {
  if (posture === 'disengage' || posture === 'hide') return fleeBearing(ctx, port, sit, target);
  if (target === null || posture === 'reposition' || posture === 'hold') return idleBearing(ctx, port, sit);
  if (posture === 'pursue') return steerToward(ctx, approachPoint(sit.profile, target, sit));
  if (posture === 'ram') return bearing(ctx.pos, ramPoint(self, sit, target));
  if (posture === 'kite') return kiteBearing(self.state, plotAt(sit, target), ownReachU(sit));
  return bandBearing(self, sit, target);
}

/** THE RAM POINT (Story 9.5, amendment 77): the lead intercept of the target's
 *  plot at the speed the bot will actually close at — the greater of its
 *  rated max and its live speed (a ram runs full ahead, and a boosted hull
 *  closes faster than its rating). The same solve the guns lead with; a
 *  course-less plot is simply its point. */
function ramPoint(self: BotSelf, sit: BotSituation, target: BotTrack): Vec2 {
  const speed = Math.max(sit.stats.kinematics.maxSpeed, Math.max(0, self.state.speed)); // sternway closes nothing
  return leadPoint(sit, target, speed);
}

/** The bearing the helm wants, applying the priority order in the header:
 *  the ring run (the target ring's flow field), the un-beach hold, else the
 *  posture's bearing under the land-aware ring clamp (ai/navigate.ts). The
 *  astern stage never asks: it steers on its captured rudder (see helmFor).
 *
 *  THE HOLD IS DELIBERATELY NOT CLAMPED. It is the un-beach machine's
 *  committed exit heading, chosen to get a hull OFF a rock, and bending it
 *  toward the ring is how a bot re-beaches on the same coast. Ring escape
 *  already outranks it; the constraint is for headings a bot chose freely. */
function desiredBearing(
  ctx: NavCtx,
  self: BotSelf,
  port: BotWorldPort,
  sit: BotSituation,
  target: BotTrack | null,
  posture: BotPosture,
  stage: Manoeuvre,
  escaping: boolean,
): number {
  const pos = self.state;
  if (escaping) return ringRunBearing(pos, ctx.nav, ringGoalOf(port));
  if (stage === 'hold') return ctx.mind.unbeach?.holdHeading ?? pos.heading;
  return ringClamped(pos, sit, postureBearing(ctx, self, port, sit, target, posture), ctx.nav, ringGoalOf(port));
}

/** HOLD stations at zero throttle (amendment 199); holding a band
 *  (engage / farm) cruises; everything else — a `ram` included — is full
 *  ahead. */
function throttleFor(posture: BotPosture): number {
  if (posture === 'hold') return 0;
  return posture === 'engage' || posture === 'farm' ? CRUISE_THROTTLE : 1;
}

/** Dead in the water this tick: HOLD always (amendment 199), and a HIDE that
 *  has reached its cover point (the orchestrator's reading under 199 — the
 *  posture stays `hide` and re-evaluates every deliberation). */
function sitsStill(self: BotSelf, mind: BotMind, posture: BotPosture): boolean {
  if (posture === 'hold') return true;
  if (posture !== 'hide') return false;
  return atCover({ x: self.state.x, y: self.state.y, hullLength: hullLengthU(self.hullId) }, mind.coverPoint);
}

/**
 * Throttle + rudder for this tick: the desired bearing, with every avoidance
 * term composed onto the rudder by the helmLeft rule (ai/navigate.ts
 * composeRudder: avoidance claims the helm in proportion to its own pressure —
 * the plain sum it replaced turned a saturated track TOWARD the land the probe
 * had just found; measured over the 60 s bow-on beaching drill 41.6 % ->
 * 8.0 % ticks in contact). Islands are the graded multi-ray fan on the nav
 * grid (Story 9.13, amendment 192(c)); mines, hulls and the map edge keep
 * their point kernels.
 *
 * THE ASTERN STAGE TAKES NO AVOIDANCE AT ALL: every avoidance term is a
 * FORWARD-sense bias, and rudder authority is scaled by a SIGNED speed, so
 * while making sternway those terms would fight the very turn the burst
 * captured its rudder to make. HOLD — and a HIDE at its cover point — (not
 * escaping, not un-beaching) sits dead in the water: throttle 0, rudder 0, no
 * wake; a `hold` posture
 * that is escaping or un-beaching steers like any other at full ahead.
 */
function helmFor(
  self: BotSelf,
  mind: BotMind,
  port: BotWorldPort,
  sit: BotSituation,
  target: BotTrack | null,
  posture: BotPosture,
  deliberate: boolean,
): Helm {
  const stage = updateManoeuvre(self, mind, port);
  if (stage === 'astern') {
    return { throttle: UNBEACH_THROTTLE, rudder: mind.unbeach?.rudder ?? UNBEACH_FALLBACK_RUDDER };
  }
  const escaping = ringEscaping(sit, posture === 'ringRun');
  if (!escaping && stage === 'none' && sitsStill(self, mind, posture)) return { throttle: throttleFor('hold'), rudder: 0 };
  const ctx = navCtxOf(self, mind, port, deliberate);
  const want = desiredBearing(ctx, self, port, sit, target, posture, stage, escaping);
  const track = clampUnit(angleDiff(self.state.heading, want) * RUDDER_GAIN);
  const avoid =
    avoidIslands(self, ctx.nav.grid, want) + avoidMines(self, mind) + boundaryBias(self.state, port.map.radius)
    + avoidHulls(self, mind, posture);
  return { throttle: posture === 'hold' ? 1 : throttleFor(posture), rudder: composeRudder(track, avoid) };
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
function ingest(self: BotSelf, mind: BotMind, port: BotWorldPort): void {
  if (mind.view === null || mind.viewAt !== port.now) return;
  // Cycle 165: the bot's OWN beam — this tick's angle and the one it remembered
  // from its last fold, as a client compares consecutive frames — and its
  // situation feed the sweep-miss drop.
  const beam = { sweepAngle: self.sweepAngle, lastSweep: mind.lastSweep };
  // Story 9.10 (amendment 169): the public fog density rides the site so a
  // plot whose predicted spot sits in fog is never read as a sweep miss.
  const site = { ...situationOf(self, mind, port), raster: port.map.heightRaster, fogAt: mind.fogAt };
  foldView(mind, mind.view, port.now, { beam, site });
  mind.lastSweep = self.sweepAngle;
  // Story 8.15, amendment 115: the seen-torpedo table (HUNKER's (was DAMAGE CUT until Story 9.9) inbound trigger).
  noteTorpedoes(mind, self, port.now);
}

/** The trigger half of a decision. A LEVEL shot (the machine gun, Story 8.15)
 *  becomes `held: true` with NO fireSlot — so no fireSeq edge and `slot` 0 on
 *  the wire; every other shot is the ordinary click on its slot. */
function triggerOf(
  self: BotSelf,
  sit: BotSituation,
  target: BotTrack | null,
  shot: Shot | null,
): Pick<BotDecision, 'aim' | 'aimDist' | 'fireSlot' | 'held'> {
  if (shot === null) return { aim: idleAim(self, sit, target), aimDist: 0, fireSlot: null, held: false };
  const held = shot.held === true;
  return { aim: shot.aim, aimDist: shot.aimDist, fireSlot: held ? null : shot.slot, held };
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
function deliberateNow(mind: BotMind, sit: BotSituation, port: BotWorldPort): void {
  mind.targetKey = selectTargetKey(mind, sit);
  mind.posture = choosePosture(sit, resolveTarget(mind), mind.posture, postureInputs(mind, port));
}

/** The extended chain's inputs (Story 9.13, amendment 193): the mind (latch,
 *  ram exit, cover), the zone clock and next ring (amendment 190), the grid. */
function postureInputs(mind: BotMind, port: BotWorldPort): Parameters<typeof choosePosture>[3] {
  return { mind, targetKey: mind.targetKey, zone: port.zonePhase(), nextRing: port.zoneNextRing(), grid: navOf(port).grid };
}

/** The cached target key resolved against the LIVE track store — a pruned or
 *  sunk key yields no target until the next deliberation re-picks. */
function resolveTarget(mind: BotMind): BotTrack | null {
  return mind.targetKey === null ? null : mind.contacts.get(mind.targetKey) ?? null;
}

/** Where the bot points when it is not shooting — at its target if it has one,
 *  else straight ahead. Aim is only consumed by a firing/priming tick, but a
 *  coherent value keeps the input stream honest. */
function idleAim(self: BotSelf, sit: BotSituation, target: BotTrack | null): number {
  return target === null ? self.state.heading : bearing(self.state, plotAt(sit, target));
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
    ingest(self, mind, port);
    const sit = situationOf(self, mind, port);
    if (deliberate) deliberateNow(mind, sit, port);
    const target = resolveTarget(mind);
    const posture = mind.posture;
    const helm = helmFor(self, mind, port, sit, target, posture, deliberate);
    const shot = chooseShot(self, mind, port, sit, target, posture);
    return {
      throttle: helm.throttle,
      rudder: helm.rudder,
      ...triggerOf(self, sit, target, shot),
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
    ingest(self, mind, port);
    const sit = situationOf(self, mind, port);
    mind.targetKey = null; // unconditional: a held bot NEVER carries a target
    if (deliberate) mind.posture = choosePosture(sit, null, mind.posture, postureInputs(mind, port));
    const helm = helmFor(self, mind, port, sit, null, mind.posture, deliberate);
    return {
      throttle: helm.throttle,
      rudder: helm.rudder,
      aim: self.state.heading,
      aimDist: 0,
      fireSlot: null,
      actSlot: null,
      held: false,
      spendChoice: deliberate ? chooseSpend(sit.profile, spendStateOf(self), undefined, mind.spendRng) : null,
    };
  },
};
