// COMBAT-BOT TACTICS (Story 6.4, wave 3) — THE HANDS. Everything a bot
// actually DOES with the target and posture wave 2 handed it: where the helm
// goes, which weapon (if any) fires, and where it is aimed.
//
// This is the `BotBrain` the driver plugs in place of wave 1's neutral
// stand-in. Its whole world model is `mind.view` + `mind.contacts` (the fogged
// perception the driver captured on this bot's own cadence slot) plus the
// bot's OWN ShipRecord — its pose, hp, stats, loadout pools and economy, which
// is exactly the `OwnShip` a human client is sent. It reads NO world
// collection: the port hands it the clock, the map (islands + radius, which
// every client rebuilds from the seed) and the live storm ring, and nothing
// else. `world.js` is a TYPE-ONLY import here, lint-enforced.
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
//      It outranks the un-beach manoeuvre deliberately: the storm does not
//      miss, and a hull aground in the storm must at least be pointed the
//      right way when it comes off.
//   2. UN-BEACHING. SUSTAINED LAND CONTACT for CONFIG.bots.stuckMs arms an
//      astern manoeuvre — read off the simulation's own contact bit
//      (ShipRecord.landContact), never inferred from speed, because grounding
//      here is a speed CAP and a beached hull still makes 8.75-11.25 u/s (see
//      updateStuck). A permanently beached bot is the single most visible
//      failure this story can ship (the fleet AI shipped exactly that once),
//      so this outranks every combat consideration below it.
//   3. POSTURE. engage / pursue / disengage / farm / reposition, per profile.
//   4. AVOIDANCE, summed onto the rudder rather than replacing it: coastlines,
//      the map edge, and MINES THE BOT CAN SEE. A bot sinking itself on a mine
//      it was looking at reads as broken, so the mine bias is not optional.
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
// astern sector + placeRange + blockedWater before a drop, the gun family's
// only denial being an empty pool. `fireSlot` is null unless every check for
// that weapon passed, so the driver's fireSeq advances exactly when a legal
// shot was requested.

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
import type { ShipRecord } from '../world.js';
import type { BotBrain, BotDecision, BotMind, BotWorldPort } from './types.js';
import { engagementBand, profileOf, type BotProfile } from './profiles.js';
import { chooseSpend, type BotSpendState } from './spending.js';
import {
  choosePosture,
  foldView,
  isActionable,
  selectTarget,
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
// THE SELF-READ — the bot's own ShipRecord folded into the two plain values
// wave 2's pure modules speak. Nothing below this line touches a ShipRecord
// field that a human client is not sent about its own hull.
// ---------------------------------------------------------------------------

/** Everything targeting/posture needs about the bot itself. */
export function situationOf(self: ShipRecord, mind: BotMind, port: BotWorldPort): BotSituation {
  return {
    now: port.now,
    x: self.state.x,
    y: self.state.y,
    hp: self.hp,
    maxHp: self.stats.maxHp,
    stats: self.stats,
    profile: profileOf(mind.profile),
    ring: port.zoneLiveRing,
  };
}

/** Everything the boon policy needs about the bot's own economy. */
export function spendStateOf(self: ShipRecord): BotSpendState {
  return {
    bankedLevels: self.bankedLevels,
    offer: self.offer,
    boons: self.boons,
    hp: self.hp,
    maxHp: self.stats.maxHp,
  };
}

/** The loadout slot fitting `id`, or -1. */
function slotOf(self: ShipRecord, id: EquipmentId): number {
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
function readySlot(self: ShipRecord, id: EquipmentId): number {
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

/** A gun-family shot (gun / cannon): 360°, clamped range, no arc to miss. */
function burstShot(
  self: ShipRecord,
  mind: BotMind,
  sit: BotSituation,
  t: BotTrack,
  id: 'gun' | 'cannon',
  rangeU: number,
): Shot | null {
  const slot = readySlot(self, id);
  if (slot < 0) return null;
  const p = aimPoint(mind, sit, t, CONFIG[id].shellSpeed);
  const d = Math.hypot(p.x - sit.x, p.y - sit.y);
  if (d > rangeU) return null;
  return { aim: bearing(self.state, p), aimDist: d, slot };
}

/** The gun — every bot's default weapon and the only one a fleet-clearing
 *  `forager` needs (3/4/5 rounds clear a fleet hull by size). */
function gunShot(self: ShipRecord, mind: BotMind, sit: BotSituation, t: BotTrack): Shot | null {
  return burstShot(self, mind, sit, t, 'gun', sit.stats.gun.rangeU);
}

/**
 * The cannon (Battleship). Held for a plot worth 45 seconds of reload: a LIVE
 * contact with a disclosed course, so the lead solution is real. An unled
 * ghost gets the gun instead.
 */
function cannonShot(self: ShipRecord, mind: BotMind, sit: BotSituation, t: BotTrack): Shot | null {
  if (!t.live || t.heading === null) return null;
  return burstShot(self, mind, sit, t, 'cannon', sit.stats.cannon.rangeU);
}

/**
 * The torpedo (Torpedo Boat). THE BOW ARC IS TESTED FIRST, exactly as the
 * equipment row tests it — an arc miss consumes nothing, but it also launches
 * nothing, so a bot that requested one would burn a click for free and look
 * broken. Contact-only in standard/homing mode (aimDist is ignored), and only
 * inside the range where a 60 u/s fish can credibly intercept.
 */
function torpedoShot(self: ShipRecord, mind: BotMind, sit: BotSituation, t: BotTrack): Shot | null {
  const slot = readySlot(self, 'torpedo');
  if (slot < 0) return null;
  if (t.heading === null) return null; // a return-grammar plot cannot be led
  const d = Math.hypot(t.x - sit.x, t.y - sit.y);
  if (d > TORPEDO_CREDIBLE_U) return null;
  const p = aimPoint(mind, sit, t, sit.stats.torpedo.speed);
  const aim = bearing(self.state, p);
  const center = wrapAngle(self.state.heading + BOW_SECTOR.offset);
  if (!inArc(aim, center, BOW_SECTOR.halfArc)) return null; // ARC FIRST
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
  self: ShipRecord,
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
function flareShot(self: ShipRecord, mind: BotMind, sit: BotSituation): Shot | null {
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
  self: ShipRecord,
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
function chooseAct(self: ShipRecord, sit: BotSituation, posture: BotPosture): number | null {
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

/**
 * Track SUSTAINED LAND CONTACT and arm the astern manoeuvre. Returns true
 * while un-beaching.
 *
 * IT READS THE SIMULATION'S OWN CONTACT BIT, NOT A SPEED HEURISTIC. Grounding
 * in this game is a directional speed CAP, never a stop (cycle 59): a dead-on
 * grounded hull still holds `islandSpeedMult x maxSpeed` — 11.25 / 10.00 /
 * 8.75 u/s by class — so ANY "am I going nowhere" threshold low enough to mean
 * beached is below a number a beached hull never goes below, and any threshold
 * above it fires on every slow turn in open water. This function's first
 * shipped form tripped under 3 u/s and was therefore unreachable dead code: a
 * bot could grind a coastline for minutes. `ShipRecord.landContact` is the
 * resolver's exact answer (`resolveShipPose().contact`, LAND ONLY — a
 * map-boundary press is deliberately not contact), stored by
 * World.resolveCollisions. Reading it off the bot's OWN record is a self-read
 * like hp or ammo, not perception of the world.
 *
 * It is ONE TICK STALE by construction — botsTick sits ahead of
 * resolveCollisions in STEP_ORDER so every AI input reaches applyInputs in the
 * same tick — which is 50ms against a 1500ms trip and cannot matter.
 *
 * The trip and the manoeuvre still share ONE number, `CONFIG.bots.stuckMs`:
 * sustained contact for that window arms the reverse, which then holds for the
 * same window, so a grounded bot is reversing within one and clear within two.
 * The window doubles as the graze debounce — a brush that resolves inside it
 * never commands astern, and only water the hull is genuinely pressing into
 * reports contact tick after tick.
 */
function updateStuck(self: ShipRecord, mind: BotMind, now: number): boolean {
  if (now < mind.unbeachUntil) return true;
  if (!self.landContact) {
    mind.stuckMs = 0;
    return false;
  }
  mind.stuckMs += CONFIG.tick.simDtMs;
  if (mind.stuckMs < CONFIG.bots.stuckMs) return false;
  mind.stuckMs = 0;
  mind.unbeachUntil = now + CONFIG.bots.stuckMs;
  return true;
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
function bandBearing(self: ShipRecord, sit: BotSituation, t: BotTrack): number {
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
function patrolBearing(self: ShipRecord, sit: BotSituation): number {
  return bearing(self.state, { x: sit.ring.cx, y: sit.ring.cy });
}

/** The bearing the helm wants, applying the priority order in the header. */
function desiredBearing(
  self: ShipRecord,
  sit: BotSituation,
  target: BotTrack | null,
  posture: BotPosture,
  unbeaching: boolean,
): number {
  const pos = self.state;
  const ring = sit.ring;
  if (isOutside(pos, ring.cx, ring.cy, ring.r)) return bearing(pos, { x: ring.cx, y: ring.cy });
  if (unbeaching) return wrapAngle(pos.heading + Math.PI);
  if (target === null || posture === 'reposition') return patrolBearing(self, sit);
  if (posture === 'disengage') return wrapAngle(bearing(pos, target) + Math.PI);
  if (posture === 'pursue') return bearing(pos, approachPoint(sit.profile, target));
  return bandBearing(self, sit, target);
}

/** Full ahead everywhere except holding a band (station-keeping) and backing
 *  off a coastline. */
function throttleFor(posture: BotPosture, unbeaching: boolean): number {
  if (unbeaching) return UNBEACH_THROTTLE;
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
function avoidIslands(self: ShipRecord, port: BotWorldPort): number {
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
function avoidMines(self: ShipRecord, mind: BotMind): number {
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
function boundaryBias(self: ShipRecord, port: BotWorldPort): number {
  const pos = self.state;
  if (Math.hypot(pos.x, pos.y) < port.map.radius - BOUNDARY_MARGIN) return 0;
  return clampUnit(angleDiff(pos.heading, bearing(pos, { x: 0, y: 0 }))) * AVOID_STRENGTH;
}

/** Throttle + rudder for this tick: the posture bearing, plus every avoidance
 *  term summed onto the rudder (never replacing it). */
function helmFor(
  self: ShipRecord,
  mind: BotMind,
  port: BotWorldPort,
  sit: BotSituation,
  target: BotTrack | null,
  posture: BotPosture,
): Helm {
  const unbeaching = updateStuck(self, mind, port.now);
  const want = desiredBearing(self, sit, target, posture, unbeaching);
  const track = clampUnit(angleDiff(self.state.heading, want) * RUDDER_GAIN);
  const avoid = avoidIslands(self, port) + avoidMines(self, mind) + boundaryBias(self, port);
  return { throttle: throttleFor(posture, unbeaching), rudder: clampUnit(track + avoid) };
}

// ---------------------------------------------------------------------------
// THE BRAIN
// ---------------------------------------------------------------------------

/**
 * Fold a FRESH view into contact memory. The driver observes on this bot's own
 * cadence slot and stamps `viewAt`; decide() runs every tick, so the equality
 * test is what makes the fold exactly-once per observe rather than five times
 * per view (which would re-run the memory prune and re-count Hit Calls).
 */
function ingest(mind: BotMind, port: BotWorldPort): void {
  if (mind.view !== null && mind.viewAt === port.now) foldView(mind, mind.view, port.now);
}

/** Where the bot points when it is not shooting — at its target if it has one,
 *  else straight ahead. Aim is only consumed by a firing/priming tick, but a
 *  coherent value keeps the input stream honest. */
function idleAim(self: ShipRecord, target: BotTrack | null): number {
  return target === null ? self.state.heading : bearing(self.state, target);
}

/**
 * THE COMBAT BRAIN. One tick: fold what was seen, pick a target and a posture
 * (wave 2), then turn both into a helm order, at most one shot, at most one
 * ability press and at most one banked-level spend.
 */
export const COMBAT_BRAIN: BotBrain = {
  decide(self: ShipRecord, mind: BotMind, port: BotWorldPort): BotDecision {
    ingest(mind, port);
    const sit = situationOf(self, mind, port);
    const target = selectTarget(mind, sit);
    const posture = choosePosture(sit, target);
    const helm = helmFor(self, mind, port, sit, target, posture);
    const shot = chooseShot(self, mind, port, sit, target, posture);
    return {
      throttle: helm.throttle,
      rudder: helm.rudder,
      aim: shot === null ? idleAim(self, target) : shot.aim,
      aimDist: shot === null ? 0 : shot.aimDist,
      fireSlot: shot === null ? null : shot.slot,
      actSlot: chooseAct(self, sit, posture),
      spendChoice: chooseSpend(sit.profile, spendStateOf(self)),
    };
  },
};
