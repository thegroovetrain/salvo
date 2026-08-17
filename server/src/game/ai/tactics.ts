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
// STEERING PRIORITY — highest first, and the order is the policy:
//   1. RING ESCAPE. Outside the live ring, steer to its centre at full ahead.
//      It outranks everything a hull under way can do — including the un-beach
//      manoeuvre's exit-heading HOLD, which yields to it: the storm does not
//      miss. The one thing it does NOT outrank is the astern BURST, and that
//      is a correction rather than a demotion: the burst commands astern, so
//      "steer the bow at the ring centre" moved a backing hull AWAY from the
//      ring while it was at it. A hull aground cannot escape a storm by
//      steering; getting off the rock IS the escape, and the ring governs
//      again the instant the burst releases (~<= 4s later, and pinned).
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
// ONE WEAPON PER TICK, and legality is checked in the EQUIPMENT ROWS' OWN
// ORDER so a shot is never silently eaten: the torpedo's bow arc is tested
// FIRST (an arc miss consumes nothing but also fires nothing), the mine's
// astern sector + placeRange + blockedWater before a drop. `fireSlot` is null
// unless every check for that weapon passed, so the driver's fireSeq advances
// exactly when a legal shot was requested.
//
// AND EVERY FLAT-TRAJECTORY SHOT IS CHECKED AGAINST THE COASTLINE (see
// shotReaches). The mine always had this — `blockedWater` is why the rack
// behaves — and the gun family and the tube never did, which is the whole of
// the "focus-firing drones through an island" defect. PLUNGING FIRE is the one
// exemption, because it is the one round that overflies terrain.

import {
  CONFIG,
  angleDiff,
  bearing,
  blockedWater,
  inArc,
  isOutside,
  nearestCoastPoint,
  sectorArcFor,
  wrapAngle,
  type EquipmentId,
  type Island,
  type Rng,
  type Vec2,
} from '@salvo/shared';
import type { BotBrain, BotDecision, BotMind, BotSelf, BotWorldPort } from './types.js';
import { engagementBand, profileOf, type BotProfile } from './profiles.js';
import { chooseSpend, type BotSpendState } from './spending.js';
import {
  choosePosture,
  foldView,
  isActionable,
  lineBlocked,
  selectTargetKey,
  tracksOf,
  type BotPosture,
  type BotSituation,
  type BotTrack,
} from './utility.js';

const TAU = Math.PI * 2;

/** The torpedo's ratified bow sector and the mine's ratified astern sector —
 *  resolved ONCE at module load from the shared single arc-shape source, the
 *  same descriptors the equipment rows enforce with. A bot that computed its
 *  own arc from CONFIG could drift from the row that judges its shot. */
const BOW_SECTOR = sectorArcFor('torpedo');
const REAR_SECTOR = sectorArcFor('mine');

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
/** Fixed-point iterations for the intercept solve (converges well inside 3). */
const LEAD_ITERATIONS = 3;
/** u — how far astern of a peer a `duelist` steers for. Just outside the
 *  Torpedo Boat's 56.3u full-ahead turn radius, so the station is reachable by
 *  a turn rather than an endless spiral. */
const REAR_QUARTER_U = 90;
/** u — the range inside which a torpedo intercept is CREDIBLE. A 60 u/s fish
 *  against a 45 u/s hull needs the target inside knife range or the lead
 *  solution is fiction; beyond this the tube is held for a better opening. */
const TORPEDO_CREDIBLE_U = 250;
/** Fraction of CONFIG.mine.placeRange a drop is commanded at. Astern of the
 *  hull but well inside the rack's reach, so the aim is legal by construction
 *  and only the water can refuse it. */
const MINE_DROP_FRAC = 0.5;
/** ms — how stale a plot must be before `siege` spends a flare to resolve it.
 *  Below this the contact is still fresh enough to shoot at directly. */
const FLARE_STALE_MS = 1500;

/** The bot's helm intent for this tick. */
interface Helm {
  throttle: number;
  rudder: number;
}

/** A legal shot request: one slot, one bearing, one commanded distance. */
interface Shot {
  aim: number;
  aimDist: number;
  slot: number;
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

/** The loadout slot fitting `id`, or -1. */
function slotOf(self: BotSelf, id: EquipmentId): number {
  for (let i = 0; i < self.loadout.length; i += 1) {
    if (self.loadout[i].equipmentId === id) return i;
  }
  return -1;
}

/**
 * The slot fitting `id` IF it can be used this tick, else -1. Readiness is
 * `n > 0` — the pool, which is exactly what `consume()` tests. For every
 * one-round pool in the game (gun, cannon, star shells, torpedo, boost, decoy)
 * that is identically "not reloading"; the mine's 2-round rack is the one
 * place the two differ, and there a bot may legitimately drop its second mine
 * while the first round is still rebuilding — refusing would idle the rack for
 * 15s and neuter the whole `trapper` profile.
 */
function readySlot(self: BotSelf, id: EquipmentId): number {
  const i = slotOf(self, id);
  if (i < 0) return -1;
  const state = self.loadout[i].state;
  return state !== null && state.n > 0 ? i : -1;
}

// ---------------------------------------------------------------------------
// AIMING — one lead solve, one scatter, one place.
// ---------------------------------------------------------------------------

/**
 * The lead-corrected intercept point for a track at `speed` u/s of ordnance,
 * solved by fixed point (the fleet AI's solver, 3 passes is far past
 * convergence at these speeds). A track with no disclosed pose — the
 * identity-free `return`-grammar plot, which carries position and NOTHING else
 * — cannot be led at all, so its last-known point IS the aim point.
 */
function leadPoint(sit: BotSituation, t: BotTrack, speed: number): Vec2 {
  if (t.heading === null || t.speed === null) return { x: t.x, y: t.y };
  const vx = Math.cos(t.heading) * t.speed;
  const vy = Math.sin(t.heading) * t.speed;
  let tof = 0;
  for (let i = 0; i < LEAD_ITERATIONS; i += 1) {
    const px = t.x + vx * tof;
    const py = t.y + vy * tof;
    tof = Math.hypot(px - sit.x, py - sit.y) / speed;
  }
  return { x: t.x + vx * tof, y: t.y + vy * tof };
}

/**
 * THE ONE PLACE MARKSMANSHIP LIVES (competence knob E2). A uniform disc of
 * `CONFIG.bots.aimScatterU` scaled by range against `aimScatterRefU`, so a
 * long shot wanders proportionally more than a knife-range one. Applied to the
 * lead solution BEFORE any legality check, so an arc/range/water refusal
 * judges the point the bot will actually shoot at.
 */
function scatter(p: Vec2, sit: BotSituation, rng: Rng): Vec2 {
  const range = Math.hypot(p.x - sit.x, p.y - sit.y);
  const r = Math.sqrt(rng.next()) * CONFIG.bots.aimScatterU * (range / CONFIG.bots.aimScatterRefU);
  const a = rng.float(0, TAU);
  return { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r };
}

/** The scattered lead solution for one weapon against one track. */
function aimPoint(mind: BotMind, sit: BotSituation, t: BotTrack, speed: number): Vec2 {
  return scatter(leadPoint(sit, t, speed), sit, mind.rng);
}

// ---------------------------------------------------------------------------
// WEAPONS — one candidate function per system, each returning a LEGAL shot or
// null. Every one of them re-checks the equipment row's own gate.
// ---------------------------------------------------------------------------

/**
 * THE TERRAIN CHECK — can this projectile actually REACH the point it is aimed
 * at, or does the coastline stop it first?
 *
 * THIS IS AN OMISSION BEING CLOSED, NOT A NEW RULE. Every other shooter in the
 * game already gets this answer: `stepShell` stops a non-arcing shell dead at
 * the first coastline it meets, and the HUMAN is told so before he pulls the
 * trigger — `client/src/render/aimPreview.ts` runs `clipAtIslands()` on every
 * gun aim and dims the burst circle when the shot will not arrive. The bot was
 * the only shooter never told, and it never self-corrected because the radar
 * gate paints OVER partially-shadowing terrain (Story 4.11 `visibilityTo`)
 * while the shell is stopped by the polygon at any height — so it re-acquired
 * the same unreachable plot once per sweep revolution, indefinitely.
 *
 * IT IS A PHYSICS QUESTION, NOT A VISIBILITY ONE. "Can this shot arrive?" is
 * deliberately NOT "should I shoot at something I cannot see": firing into fog
 * is a ratified feature (FR16 — the self-private `sp` splash exists precisely
 * so bracket-and-walk fire works), and a `return`-grammar plot stays a legal
 * target here exactly as it always was.
 *
 * THE ORIGIN IS THE HULL CENTRE, not the silhouette muzzle the sim spawns
 * from: `BotSelf` carries no hull class (by design — it is the self-read a
 * human client gets), so `muzzleSpawn` is unreachable from ai/. The centre is
 * the strictly LONGER segment, so the check can only ever be conservative, and
 * the extra span is inside the bot's own hull.
 */
function shotReaches(self: BotSelf, sit: BotSituation, p: Vec2): boolean {
  return !lineBlocked(self.state, p, sit.islands);
}

/**
 * A gun-family shot (gun / cannon): 360°, clamped range, no arc to miss — and
 * a coastline that must not be in the way. `arcing` is the PLUNGING FIRE
 * exemption: that doctrine overflies terrain and hulls alike (`stepShell`
 * skips en-route collision entirely for it), so gating it would delete the
 * card's whole point.
 */
function burstShot(
  self: BotSelf,
  mind: BotMind,
  sit: BotSituation,
  t: BotTrack,
  id: 'gun' | 'cannon',
  spec: { rangeU: number; arcing: boolean },
): Shot | null {
  const slot = readySlot(self, id);
  if (slot < 0) return null;
  const p = aimPoint(mind, sit, t, CONFIG[id].shellSpeed);
  const d = Math.hypot(p.x - sit.x, p.y - sit.y);
  if (d > spec.rangeU) return null;
  if (!spec.arcing && !shotReaches(self, sit, p)) return null;
  return { aim: bearing(self.state, p), aimDist: d, slot };
}

/** The gun — every bot's default weapon and the only one a fleet-clearing
 *  `forager` needs (3/4/5 rounds clear a fleet hull by size). It has no
 *  doctrine that arcs, so terrain always stops it. */
function gunShot(self: BotSelf, mind: BotMind, sit: BotSituation, t: BotTrack): Shot | null {
  return burstShot(self, mind, sit, t, 'gun', { rangeU: sit.stats.gun.rangeU, arcing: false });
}

/**
 * The cannon (Battleship). Held for a plot worth 45 seconds of reload: a LIVE
 * contact with a disclosed course, so the lead solution is real. An unled
 * ghost gets the gun instead. PLUNGING FIRE is the one shot in the game that
 * may be taken through a headland.
 */
function cannonShot(self: BotSelf, mind: BotMind, sit: BotSituation, t: BotTrack): Shot | null {
  if (!t.live || t.heading === null) return null;
  const arcing = sit.stats.cannon.mode === 'arcing';
  return burstShot(self, mind, sit, t, 'cannon', { rangeU: sit.stats.cannon.rangeU, arcing });
}

/**
 * The torpedo (Torpedo Boat). THE BOW ARC IS TESTED FIRST, exactly as the
 * equipment row tests it — an arc miss consumes nothing, but it also launches
 * nothing, so a bot that requested one would burn a click for free and look
 * broken. Contact-only in standard/homing mode (aimDist is ignored), and only
 * inside the range where a 60 u/s fish can credibly intercept. A fish runs on
 * the surface and no doctrine arcs it, so the coastline stops it exactly as it
 * stops a shell — and at a 50s reload, launching one into a rock is the
 * single most expensive way a Torpedo Boat can waste a tick.
 */
function torpedoShot(self: BotSelf, mind: BotMind, sit: BotSituation, t: BotTrack): Shot | null {
  const slot = readySlot(self, 'torpedo');
  if (slot < 0) return null;
  if (t.heading === null) return null; // a return-grammar plot cannot be led
  const d = Math.hypot(t.x - sit.x, t.y - sit.y);
  if (d > TORPEDO_CREDIBLE_U) return null;
  const p = aimPoint(mind, sit, t, sit.stats.torpedo.speed);
  const aim = bearing(self.state, p);
  const center = wrapAngle(self.state.heading + BOW_SECTOR.offset);
  if (!inArc(aim, center, BOW_SECTOR.halfArc)) return null; // ARC FIRST
  if (!shotReaches(self, sit, p)) return null;
  return { aim, aimDist: d, slot };
}

/**
 * Does this profile want a mine in the water right now? While WITHDRAWING,
 * always — that is the whole `trapper` idea, and it is the one time `forager`
 * lays one too (to shake a chaser). Otherwise only a proactive layer, and only
 * with something CLOSE and BEHIND it: a mine dropped astern is a trap for
 * whatever is following, and a trap with nothing following is a wasted round.
 */
export function wantsMine(
  profile: BotProfile,
  sit: BotSituation,
  heading: number,
  t: BotTrack | null,
  posture: BotPosture,
): boolean {
  if (posture === 'disengage') return true;
  if (!profile.usesMinesProactively || t === null) return false;
  if (Math.hypot(t.x - sit.x, t.y - sit.y) > CONFIG.mine.placeRange * 2) return false;
  const center = wrapAngle(heading + REAR_SECTOR.offset);
  return inArc(Math.atan2(t.y - sit.y, t.x - sit.x), center, REAR_SECTOR.halfArc);
}

/**
 * A mine drop (Mine Layer). Commanded DEAD ASTERN — the centre of the ratified
 * rear sector — at half the rack's reach, so the arc and range gates pass by
 * construction and the only thing that can refuse the drop is the water
 * itself: `blockedWater` is the SAME predicate the equipment row denies with
 * (inside a coastline polygon, or off the water disc), so a bot never burns a
 * click dropping a mine on a rock.
 */
function mineShot(
  self: BotSelf,
  sit: BotSituation,
  port: BotWorldPort,
  t: BotTrack | null,
  posture: BotPosture,
): Shot | null {
  const slot = readySlot(self, 'mine');
  if (slot < 0) return null;
  if (!wantsMine(sit.profile, sit, self.state.heading, t, posture)) return null;
  const aim = wrapAngle(self.state.heading + REAR_SECTOR.offset);
  const d = CONFIG.mine.placeRange * MINE_DROP_FRAC;
  const p = { x: sit.x + Math.cos(aim) * d, y: sit.y + Math.sin(aim) * d };
  if (blockedWater(p, port.map.islands, port.map.radius)) return null;
  return { aim, aimDist: d, slot };
}

/**
 * The stalest plot worth a flare: an actionable track we have LOST (not live),
 * gone quiet for FLARE_STALE_MS, sitting beyond our own truesight bubble (a
 * hull we can already see needs no light) and inside the flare's reach.
 * Nearest wins — the closest lost contact is the one about to matter.
 */
function flareTarget(mind: BotMind, sit: BotSituation): BotTrack | null {
  let best: BotTrack | null = null;
  let bestD = Infinity;
  for (const t of tracksOf(mind)) {
    if (t.live || !isActionable(t, sit.now)) continue;
    if (sit.now - t.seenAt < FLARE_STALE_MS) continue;
    const d = Math.hypot(t.x - sit.x, t.y - sit.y);
    if (d <= sit.stats.sightRange || d > sit.stats.starShells.rangeU) continue;
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  return best;
}

/**
 * STAR SHELLS AS A SENSOR (Eric ruling C2) — the one behaviour in this story
 * that reads as "this thing knows how to play". A `siege` Battleship that has
 * LOST a contact fires a flare at its last known position: the lit zone grants
 * the firer truesight parity inside it, so the plot resolves back into a live
 * contact the cannon can be spent on. It deliberately does not need a lead
 * solution — the flare lights an AREA, which is exactly why it works on the
 * unled plots nothing else here will shoot at.
 */
function flareShot(self: BotSelf, mind: BotMind, sit: BotSituation): Shot | null {
  if (!sit.profile.usesStarShells) return null;
  const slot = readySlot(self, 'starShells');
  if (slot < 0) return null;
  const t = flareTarget(mind, sit);
  if (t === null) return null;
  const d = Math.min(Math.hypot(t.x - sit.x, t.y - sit.y), sit.stats.starShells.rangeU);
  return { aim: bearing(self.state, t), aimDist: d, slot };
}

/**
 * The one weapon this tick, in preference order: the sensor shot first (it is
 * spent on a contact nothing else can engage), then the trap, then the heavy
 * ordnance, then the gun as the always-available fallback. Each candidate
 * returns null unless its own legality gate passed, so this reads as a ladder
 * rather than a pile of conditions.
 */
function chooseShot(
  self: BotSelf,
  mind: BotMind,
  port: BotWorldPort,
  sit: BotSituation,
  target: BotTrack | null,
  posture: BotPosture,
): Shot | null {
  const flare = flareShot(self, mind, sit);
  if (flare !== null) return flare;
  const mine = mineShot(self, sit, port, target, posture);
  if (mine !== null) return mine;
  if (target === null) return null;
  return (
    torpedoShot(self, mind, sit, target) ??
    cannonShot(self, mind, sit, target) ??
    gunShot(self, mind, sit, target)
  );
}

/**
 * The ability press, if any: the boost that opens a `raider`'s range and the
 * decoy that breaks a `trapper`'s lock, both spent on the way OUT. Abilities
 * ride the actSeq channel, so this composes with a shot in the same tick.
 */
function chooseAct(self: BotSelf, sit: BotSituation, posture: BotPosture): number | null {
  if (posture !== 'disengage') return null;
  if (sit.profile.usesBoost) {
    const boost = readySlot(self, 'speedBoost');
    if (boost >= 0) return boost;
  }
  if (sit.profile.usesDecoy) {
    const decoy = readySlot(self, 'decoyBuoy');
    if (decoy >= 0) return decoy;
  }
  return null;
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
 *  its profile's fighting range instead of ramming through it). */
function bandBearing(self: BotSelf, sit: BotSituation, t: BotTrack): number {
  const aim = approachPoint(sit.profile, t);
  const brg = bearing(self.state, aim);
  const d = Math.hypot(aim.x - sit.x, aim.y - sit.y);
  const band = engagementBand(sit.profile, sit.stats);
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

/** The bearing the helm wants, applying the priority order in the header. The
 *  astern stage never asks: it steers on its captured rudder (see helmFor). */
function desiredBearing(
  self: BotSelf,
  mind: BotMind,
  sit: BotSituation,
  target: BotTrack | null,
  posture: BotPosture,
  holding: boolean,
): number {
  const pos = self.state;
  const ring = sit.ring;
  if (isOutside(pos, ring.cx, ring.cy, ring.r)) return bearing(pos, { x: ring.cx, y: ring.cy });
  if (holding) return mind.unbeach?.holdHeading ?? pos.heading;
  if (target === null || posture === 'reposition') return patrolBearing(self, sit);
  if (posture === 'disengage') return wrapAngle(bearing(pos, target) + Math.PI);
  if (posture === 'pursue') return bearing(pos, approachPoint(sit.profile, target));
  return bandBearing(self, sit, target);
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
 */
function deliberateNow(mind: BotMind, sit: BotSituation): void {
  mind.targetKey = selectTargetKey(mind, sit);
  mind.posture = choosePosture(sit, resolveTarget(mind));
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
      actSlot: chooseAct(self, sit, posture),
      spendChoice: deliberate ? chooseSpend(sit.profile, spendStateOf(self)) : null,
    };
  },
};
