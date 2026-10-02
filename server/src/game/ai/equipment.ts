// THE EQUIPMENT AXIS (Eric ruling, 2026-08-20) — HOW a weapon is used,
// travelling WITH THE WEAPON.
//
// Bot policy splits onto TWO AXES. The SHIP profile (ai/profiles.ts) is
// temperament: engagement band, target weights, disengage/heal thresholds,
// posture, and an APPETITE table saying how eager this captain is about each
// piece of equipment. The EQUIPMENT TACTIC is weapon knowledge: want/solve/
// reach and every doctrine branch for ONE equipment id. The flat model this
// replaces keyed weapon knowledge by HULL, so a Battleship that ACQUIRED mines
// had no idea what a mine was.
//
// THIS FILE holds the WEAPON rows — the three guns and every Q/E/R line —
// as `WEAPON_TACTICS`, TOTAL over every EquipmentId that is not a class Shift.
// The three Shift rows live in ai/shift.ts, the belt rows in ai/consumables.ts,
// the shared vocabulary (types, aiming, appetite) in ai/tacticKit.ts, and
// ai/tacticRegistry.ts assembles the TOTAL `EQUIPMENT_TACTICS` a fitted slot
// resolves through.
//
// TEMPERAMENT MODULATES PROACTIVITY ONLY (ruled). There is ONE mine tactic
// shared by everyone; `trapper` lays as a standing plan and `siege` lays only
// when something is closing, and that difference is carried ENTIRELY by the
// appetite number read against the two thresholds (tacticKit.ts). A profile
// may NOT override placement geometry, doctrine choice or target selection — a
// per-(profile × equipment) override table is the flat model this replaces
// and is forbidden.
//
// EVERY DOCTRINE VERB HAS EXACTLY ONE BEHAVIOURAL CONSUMER, inside its
// equipment's tactic:
//   captiveMines (kind) — full-placeRange proactive lays, hostile-only victims
//   foulingMines (kind) — the trap goes down EARLIER against a closing pursuer
//   torpedo homingTurnRate — the credible-range gate widens (budget − turn room)
//   broadside.spreadRung— the wide base fan may be spent on a just-lost plot;
//                         a tightened fan demands a live track
// (PHOSPHOR SHELLS is its own weapon row below; FLASH SHELLS (`dazzleShells`)
// is a belt row in ai/consumables.ts.)
//
// No rng is drawn anywhere in want() — the mind's stream feeds aim scatter
// and nothing else (the determinism pin).

import {
  CONFIG,
  SHIP_CLASS_IDS,
  bearing,
  hullEnvelope,
  inArc,
  sectorArcFor,
  twinSectorArcFor,
  wrapAngle,
  type EffectiveStats,
  type EquipmentId,
  type ShiftId,
} from '@salvo/shared';
import type { BotPosture, BotSelf } from './types.js';
import {
  hasPersistence,
  isActionable,
  ownLiveMines,
  tracksOf,
  type BotSituation,
  type BotTrack,
} from './utility.js';
import type { BotProfile } from './profiles.js';
import { TRACK_PERSIST_MS, predictedPos, trackVelocity } from './plot.js';
import {
  APPETITE_EAGER,
  APPETITE_NEUTRAL,
  TORPEDO_CREDIBLE_U,
  aimPoint,
  appetiteFor,
  burstOnLiveContact,
  deepFreezeRows,
  distTo,
  sectorPlacement,
  shotReaches,
  solveTorpedoShot,
  type EquipmentTactic,
  type Shot,
  type TacticContext,
  type TorpedoLineId,
} from './tacticKit.js';

// The appetite vocabulary is re-exported so a caller reading weapon appetites
// keeps one import path for the weapon axis.
export { APPETITE_EAGER, APPETITE_NEUTRAL, appetiteFor } from './tacticKit.js';

/** The MINE family id union the parameterized mine tactic is keyed by (Story
 *  8.13) — a narrowing of `EquipmentId`, declared here because `ai/` may not
 *  import `game/equipment/**`. */
type MineLineId = Extract<EquipmentId, 'navalMines' | 'captiveMines' | 'foulingMines'>;

/** Every equipment id a WEAPON row covers: all of them but the class Shifts. */
type WeaponLineId = Exclude<EquipmentId, ShiftId>;

/** The mine's ratified astern sector and the broadside's two beam sectors —
 *  resolved ONCE at module load from the single shared arc source the
 *  equipment rows enforce with. */
const REAR_SECTOR = sectorArcFor('navalMines');
const BEAM_SECTORS = twinSectorArcFor('broadside');

/** Fraction of CONFIG.mine.placeRange a STANDARD mine is dropped at — astern
 *  of the hull but well inside the rack's reach, so arc and range pass by
 *  construction and only the water can refuse. A CAPTIVE mine drops at the
 *  FULL placeRange instead (see mineSolve). */
const MINE_DROP_FRAC = 0.5;
/** × placeRange — how close a track must be before a mine is worth laying
 *  (proactive/eager and reactive/closing branches alike at base). */
const MINE_NEAR_MULT = 2;
/** × placeRange — the WIDENED laying range against a CLOSING pursuer for the
 *  FOULING rack (epic-8 amendment 81, where it was the PROP FOULING verb on
 *  the naval rack): a slow only pays if the victim runs THROUGH the field, so
 *  a fouling trapper seeds the water earlier along the chase. */
const FOUL_CLOSING_MULT = 4;
/** ms — how stale a plot must be before an EAGER flare user lights it. Below
 *  this the contact is fresh enough to shoot at directly. */
const FLARE_STALE_MS = 1500;
/** × FLARE_STALE_MS — a NEUTRAL-appetite holder waits this much longer before
 *  spending a 20s flare on the same plot. Eagerness, never geometry: when both
 *  profiles fire, they fire at the identical point. */
const RELUCTANT_STALE_MULT = 2;
/** The base spread rung — the WIDEST pattern, where the per-turret arcs do not
 *  overlap at all and the barrage sprays across the beam. At this rung (and only
 *  this rung) a broadside may be spent on a just-lost plot; every tightened rung
 *  chokes the pattern toward a converging point weapon, and a point weapon needs
 *  a real position. */
const WIDE_RUNG = 1;
/** ms — how recently a NON-live plot must have been refreshed for the WIDE base
 *  pattern to accept it. ~1.5s of drift at full ahead (67u) is inside the base
 *  barrage's footprint at combat range; older and the shot is a guess. */
const WIDE_FAN_STALE_MS = 1500;

/** Is this track making way TOWARD us? Its course is the disclosed pose or
 *  the bot's estimate (ai/plot.ts `trackVelocity`); unknown course = not
 *  closing (a course-less plot cannot justify a reactive trap). */
function isClosing(sit: BotSituation, t: BotTrack): boolean {
  const v = trackVelocity(t);
  if (v === null) return false;
  return v.vx * (sit.x - t.x) + v.vy * (sit.y - t.y) > 0;
}

/** Is this track inside the hull's astern sector? */
function behindUs(self: BotSelf, sit: BotSituation, t: BotTrack): boolean {
  const center = wrapAngle(self.state.heading + REAR_SECTOR.offset);
  return inArc(Math.atan2(t.y - sit.y, t.x - sit.x), center, REAR_SECTOR.halfArc);
}

// ---------------------------------------------------------------------------
// GUN — every bot's default weapon, the always-available fallback.
// ---------------------------------------------------------------------------

/** A gun-family burst (cannon / broadside / flak): aimed to a clicked point at
 *  a clamped range, coastline-gated. */
function burstSolve(ctx: TacticContext, id: 'gun' | 'broadside' | 'flak', rangeU: number): Shot | null {
  const t = ctx.target;
  if (t === null) return null;
  const p = aimPoint(ctx.mind, ctx.sit, t, CONFIG[id].shellSpeed);
  const d = Math.hypot(p.x - ctx.sit.x, p.y - ctx.sit.y);
  if (d > rangeU) return null;
  if (!shotReaches(ctx.self, ctx.sit, p)) return null;
  return { aim: bearing(ctx.self.state, p), aimDist: d, slot: ctx.slot };
}

const gunTactic: EquipmentTactic = {
  id: 'gun',
  kind: 'shot',
  reachU: (stats) => stats.equipment.gun.rangeU,
  // Blip shooting is a ruled skill (cycle 99): the gun takes NO persistence
  // gate and no doctrine gate — every legality question lives in solve().
  want: (ctx) => ctx.target !== null,
  solve: (ctx) => burstSolve(ctx, 'gun', ctx.sit.stats.equipment.gun.rangeU),
};

// ---------------------------------------------------------------------------
// THE TWO PICKABLE GUNS (Story 8.15, amendment 109). Both are 360°
// (amendment 106) and reach the radar rung.
// ---------------------------------------------------------------------------

/** FLAK: the cannon's burst-solve on the flak row — one shell to the led point,
 *  bursting there. Same no-persistence, no-doctrine want as the cannon. */
const flakTactic: EquipmentTactic = {
  id: 'flak',
  kind: 'shot',
  reachU: (stats) => stats.equipment.flak.rangeU,
  want: (ctx) => ctx.target !== null,
  solve: (ctx) => burstSolve(ctx, 'flak', ctx.sit.stats.equipment.flak.rangeU),
};

/** u — the LONGEST participant hull, the aim-past overshoot for a plot of
 *  unknown class (off the class table, never a literal). */
const LONGEST_HULL_U = Math.max(...SHIP_CLASS_IDS.map((id) => hullEnvelope(id).hull.length));

/**
 * THE MAGAZINE DISCIPLINE (Eric ruling 2026-10-02, cycle 165): the machine gun
 * does not stream at a plot with NO COURSE whose last refresh is older than
 * one base sweep revolution — wherever that hull is now, it is not where the
 * plot says, and a belt sprayed at it is a belt wasted. Any course (sighted,
 * wake-fitted or paint-measured) or a fresher refresh streams as before.
 * THE MACHINE GUN ONLY: the cannon, flak, broadside and torpedo keep no
 * staleness rule (epic-6 amendment 32c — blip shooting is a ruled skill).
 */
function streamHolds(t: BotTrack, now: number): boolean {
  return !t.live && trackVelocity(t) === null && now - t.seenAt > TRACK_PERSIST_MS;
}

/** u — how far PAST the lead point the stream is aimed (Eric ruling
 *  2026-10-02, cycle 165): one hull length of the plot's disclosed class, else
 *  the longest participant hull. A machine-gun shell expires at its aim
 *  point, so scatter that lands the point short of the hull wasted the shell;
 *  aiming a hull past the target keeps a short-scattered round live through
 *  the hull it was meant for. */
function overshootU(t: BotTrack): number {
  return t.cls === null ? LONGEST_HULL_U : hullEnvelope(t.cls).hull.length;
}

/**
 * THE MACHINE GUN'S STREAM: while the target sits inside the gun's reach, HOLD
 * the level aimed at the lead solution (`held: true` on slot 0). It is never a
 * click — the driver leaves fireSeq alone on a held tick — and the World fires
 * one shell per `rateMs` for as long as the level stays up. The magazine gate
 * is `slotReady` upstream (n > 0), so an empty magazine releases the level by
 * never reaching here; a target leaving reach (measured at its PREDICTED
 * position), no target, or a stale course-less plot (streamHolds) releases it
 * too. The coastline gate is the cannon's: a stream into a rock is a wasted
 * belt. The commanded distance runs one hull past the lead point (overshootU),
 * clamped at the gun's reach.
 */
function streamSolve(ctx: TacticContext): Shot | null {
  const t = ctx.target;
  const sit = ctx.sit;
  const rangeU = sit.stats.equipment.machineGun.rangeU;
  if (t === null || streamHolds(t, sit.now)) return null;
  const q = predictedPos(t, sit.now);
  if (Math.hypot(q.x - sit.x, q.y - sit.y) > rangeU) return null;
  const p = aimPoint(ctx.mind, sit, t, CONFIG.machineGun.shellSpeed);
  if (!shotReaches(ctx.self, sit, p)) return null;
  const d = Math.min(Math.hypot(p.x - sit.x, p.y - sit.y) + overshootU(t), rangeU);
  return { aim: bearing(ctx.self.state, p), aimDist: d, slot: ctx.slot, held: true };
}

const machineGunTactic: EquipmentTactic = {
  id: 'machineGun',
  kind: 'shot',
  reachU: (stats) => stats.equipment.machineGun.rangeU,
  want: (ctx) => ctx.target !== null,
  solve: streamSolve,
};

// ---------------------------------------------------------------------------
// BROADSIDE — 30s of reload; the spreadRung doctrine decides how sure the
// plot must be.
// ---------------------------------------------------------------------------

/**
 * THE SPREAD-RUNG CONSUMER. The designed fan is long dead and the ladder was
 * re-cut again on 2026-08-27 (zero overlap at tier I, true convergence at tier
 * V), so read the gate by what the rung MEANS rather than by any fan width: at
 * rung 1 the per-turret arcs do not overlap and the barrage lands as a wide
 * shotgun pattern across the beam — enough water covered to be worth a
 * just-lost plot with a disclosed course. Every rung above it chokes the
 * pattern toward a converging point weapon, and a point weapon demands a LIVE
 * track. The polarity is therefore unchanged and still correct.
 */
function fanAcceptsPlot(t: BotTrack, sit: BotSituation): boolean {
  if (t.live) return true;
  if (sit.stats.equipment.broadside.spreadRung > WIDE_RUNG) return false;
  return sit.now - t.seenAt <= WIDE_FAN_STALE_MS;
}

function broadsideSolve(ctx: TacticContext): Shot | null {
  const t = ctx.target;
  if (t === null || trackVelocity(t) === null) return null; // a course-less ghost gets the gun
  if (!fanAcceptsPlot(t, ctx.sit)) return null;
  const shot = burstSolve(ctx, 'broadside', ctx.sit.stats.equipment.broadside.rangeU);
  if (shot === null) return null;
  // THE BEAM ARC IS TESTED exactly as the equipment row tests it: a click in
  // the bow/stern dead zone is denied and would burn the click for nothing.
  for (const sign of [1, -1]) {
    const center = wrapAngle(ctx.self.state.heading + sign * BEAM_SECTORS.offset);
    if (inArc(shot.aim, center, BEAM_SECTORS.halfArc)) return shot;
  }
  return null;
}

const broadsideTactic: EquipmentTactic = {
  id: 'broadside',
  kind: 'shot',
  reachU: (stats) => stats.equipment.broadside.rangeU,
  // A 30s reload is never committed to a plot without PERSISTENCE — the
  // structural counter to chaff's fakes, which re-scatter wholesale
  // each revolution and so can never persist as one coherent track.
  want: (ctx) => ctx.target !== null && hasPersistence(ctx.target, ctx.sit.now),
  solve: broadsideSolve,
};

// ---------------------------------------------------------------------------
// TORPEDO — the homing doctrine widens the credible-range gate.
// ---------------------------------------------------------------------------

/**
 * THE HOMING CONSUMER — now a TIER STAT, not a card (epic-8 amendment 80). A
 * straight-running fish (`homingTurnRate === 0`, every line at tier I) is
 * credible only at knife range (TORPEDO_CREDIBLE_U). A STEERING fish corrects
 * its own terminal error, so the gate widens — bounded by BOTH ruled
 * quantities: the family's `homingMaxRangeU` travel budget, less one half-turn
 * of correction room (π × turn radius, where turn radius = speed / turn rate).
 * A LOW tier buys a SLOW turn, so an early rung's credible range is barely
 * wider than a straight-runner's, and a speed-carded fish's turn opens and
 * shrinks it again — the honest consequence of the geometry, and the same
 * formula the pre-8.13 doctrine read used.
 */
function torpedoReachU(stats: EffectiveStats, id: TorpedoLineId): number {
  const row = stats.equipment[id];
  if (row.homingTurnRate <= 0) return TORPEDO_CREDIBLE_U;
  const turnRadius = row.speed / row.homingTurnRate;
  return Math.max(TORPEDO_CREDIBLE_U, CONFIG.torpedo.homingMaxRangeU - Math.PI * turnRadius);
}

/** ONE TORPEDO TACTIC, built per line (epic-8 amendment 79 — the light
 *  torpedo reuses the heavy's tactic keyed by its own id). Everything that
 *  differs is the row and the arc. */
function torpedoTacticFor(id: TorpedoLineId): EquipmentTactic {
  return {
    id,
    kind: 'shot',
    reachU: (stats) => torpedoReachU(stats, id),
    // Same persistence law as the broadside: a long-reload tube is never spent
    // on a track that has not persisted one sweep revolution (live truesight
    // counts instantly — a fake can never appear inside the bubble).
    want: (ctx) => ctx.target !== null && hasPersistence(ctx.target, ctx.sit.now),
    solve: (ctx) =>
      solveTorpedoShot(ctx, id, ctx.sit.stats.equipment[id].speed, torpedoReachU(ctx.sit.stats, id)),
  };
}

const torpedoTactic: EquipmentTactic = torpedoTacticFor('heavyTorpedo');
const lightTorpedoTactic: EquipmentTactic = torpedoTacticFor('lightTorpedo');

// ---------------------------------------------------------------------------
// MINE — one shared tactic; appetite is the ONLY thing trapper and siege
// disagree about. Captive and prop-fouling are doctrine branches here.
// ---------------------------------------------------------------------------

/**
 * CAPTIVE MINES want differently: the trip ring is 144u (not 32u) and the
 * mine fires a torpedo at the first HOSTILE inside it — so laying is
 * PROACTIVE (no rear-arc requirement on the victim: the torpedo does the
 * chasing) and the victim must be a genuine hostile. A NEUTRAL PvE fleet
 * drone walks straight over a captive mine (isCaptiveMineHostile), so a
 * fleet-only target never justifies one — captive mines cannot farm fleet.
 */
function captiveMineWant(ctx: TacticContext): boolean {
  const t = ctx.target;
  // A FLEET-ONLY target never justifies a captive mine, on any posture: the
  // trip is HOSTILE-ONLY, so a neutral PvE drone walks straight over it. This
  // clause is deliberate and stays.
  if (t !== null && t.fleet) return false;
  // WITHDRAWING WITH NOTHING TRACKED: lay anyway, exactly as the base mine
  // does (review gate, cycle 110). Refusing the whole no-target case made
  // CAPTIVE delete the base mine's unconditional withdrawal lay, so a low-hp
  // trapper fleeing an attacker it has LOST IN FOG — the common case, and the
  // one a rear-facing trap is most for — laid nothing where a contact mine
  // always laid. A captive mine trips hostile-only in a 144u ring, so a blind
  // astern lay while running is at least as valid as a contact mine's. Same
  // class as the buoy-recon downgrade: a doctrine may ADD an occasion, never
  // silently remove one.
  if (ctx.posture === 'disengage') return true;
  if (t === null) return false;
  if (appetiteFor(ctx.sit.profile, 'captiveMines') < APPETITE_NEUTRAL) return false;
  // THE OLD PROP-FOULING WIDENING IS GONE FROM HERE, and it is not a
  // regression: the two used to be DOCTRINE VERBS ON ONE RACK that stacked
  // (a captive mine's fish carried the foul), so a holder of both needed this
  // branch to reach the fouling range. Since amendment 81 they are two
  // SEPARATE LINES in two separate slots with two separate racks — a fouling
  // layer's own tactic does its own widening, and a captive mine fouls
  // nothing — so a cross-line term here would be the flat model returning.
  return distTo(ctx.sit, t) <= CONFIG.mine.placeRange * MINE_NEAR_MULT;
}

// THE FIELD-CHURN BOUND IS RETIRED (Story 8.4, FR57/AR48). It existed for one
// reason — `addMine` SILENTLY EVICTED the owner's oldest mine at
// `stats.equipment.navalMines.maxLive`, so an uncounted lay churned the field
// the bot had just built — and Story 8.4 deleted every mine cap and every
// eviction branch. There is nothing left to churn, so `mineFieldFull` is gone
// and a bot lays whenever its tactic and its reload allow. NOTHING ELSE in bot
// policy changes: the prepared occasion and every reactive occasion run exactly
// as before, and `ownLiveMines` survives as the prepared-lay reserve's count.

/** The postures in which a PREPARED lay is allowed: the bot is safe — nothing
 *  is being fought or fled — so a round spent seeding the water costs it no
 *  answer to a live threat. */
const SAFE_LAY_POSTURES: readonly BotPosture[] = ['reposition', 'farm'];

/**
 * THE PREPARED LAY (Eric ruling 2026-08-20, cycle 111 — chosen INTO scope:
 * *"you just have to be lined up well and prepare"*). A mine may go down with
 * NO target at all while the posture is SAFE and the bot's own live-mine
 * count is under CONFIG.bots.preparedMineReserve — the trap is seeded before
 * it is needed, which is the whole doctrine of a hull that hangs back.
 *
 * THE GATE IS DOCTRINE-SHAPED, NOT PROFILE-SHAPED: a CONTACT mine needs
 * something following you, so laying one into empty water is near-wasted —
 * only an EAGER layer (trapper's standing plan) seeds plain racks ahead of
 * need. A CAPTIVE mine is a 144u-trip torpedo launcher that fires at the
 * first hostile into range and so works with NOBODY following — which is
 * precisely why it suits a hull that is hanging back — so holding the
 * doctrine opens the prepared occasion at mere NEUTRAL appetite. The reserve
 * (which used to keep headroom under the now-deleted `maxLive`) is simply how
 * much water a bot seeds with nobody in sight; the profile still only says how
 * eager it is.
 *
 * PREPARED ADDS AN OCCASION, IT NEVER REMOVES ONE (epic-7 amendment 29, the
 * rule five defects produced): every reactive lay below still fires exactly
 * as before, including with the field at the reserve.
 */
function preparedMineWant(ctx: TacticContext, id: MineLineId): boolean {
  if (!SAFE_LAY_POSTURES.includes(ctx.posture)) return false;
  if (ownLiveMines(ctx.mind) >= CONFIG.bots.preparedMineReserve) return false;
  const appetite = appetiteFor(ctx.sit.profile, id);
  if (appetite >= APPETITE_EAGER) return true;
  return id === 'captiveMines' && appetite >= APPETITE_NEUTRAL;
}

/**
 * The REACTIVE lays — the pre-cycle-111 `mineWant` body, byte-identical in
 * behaviour. While WITHDRAWING, always — a mine astern answers the immediate
 * threat at any appetite. Otherwise appetite modulates PROACTIVITY only:
 *   EAGER   (trapper)      — a standing plan: lays with something close and
 *                            behind, closing or not;
 *   NEUTRAL (siege et al.) — lays only when something is CLOSING;
 * and PROP-FOULING widens the closing branch's range (FOUL_CLOSING_MULT):
 * the slow only pays if the pursuer runs through the field, so the fouling
 * trap goes down earlier along the chase.
 */
function reactiveMineWant(ctx: TacticContext, id: MineLineId): boolean {
  const { sit, target: t } = ctx;
  if (ctx.posture === 'disengage') return true;
  if (t === null) return false;
  const appetite = appetiteFor(sit.profile, id);
  if (appetite < APPETITE_NEUTRAL) return false;
  if (!behindUs(ctx.self, sit, t)) return false;
  const d = distTo(sit, t);
  if (isClosing(sit, t)) {
    // FOULING is the widening kind now (amendment 81), not a verb on the naval
    // rack: a slow only pays if the pursuer runs THROUGH the field.
    const mult = id === 'foulingMines' ? FOUL_CLOSING_MULT : MINE_NEAR_MULT;
    if (d <= CONFIG.mine.placeRange * mult) return true;
  }
  return appetite >= APPETITE_EAGER && d <= CONFIG.mine.placeRange * MINE_NEAR_MULT;
}

/**
 * Does this bot want a mine in the water now? The prepared occasion ADDS first
 * and the reactive occasions — the shipped behaviour, captive branch included —
 * run exactly as before. Since Story 8.4 nothing refuses a lay on board count:
 * mines have no cap and a lay can no longer evict a laid trap.
 */
function mineWant(ctx: TacticContext, id: MineLineId): boolean {
  if (preparedMineWant(ctx, id)) return true;
  if (id === 'captiveMines') return captiveMineWant(ctx);
  return reactiveMineWant(ctx, id);
}

/** ONE MINE TACTIC, built per line (epic-8 amendment 79 — captive and fouling
 *  reuse the mine tactic keyed by their own ids). The three racks share every
 *  chassis number, so only the want branches and the drop distance differ.
 *  The drop is dead astern, at the centre of the rear sector. */
function mineTacticFor(id: MineLineId): EquipmentTactic {
  return {
    id,
    kind: 'placement',
    reachU: () => CONFIG.mine.placeRange,
    want: (ctx) => mineWant(ctx, id),
    // CAPTIVE lays at the FULL placeRange: a 144u trip ring is area denial, so
    // the round goes as far out as the rack reaches; a contact or fouling mine
    // stays at half reach, seeding the water the hull just left.
    solve: (ctx) =>
      sectorPlacement(ctx, REAR_SECTOR, CONFIG.mine.placeRange * (id === 'captiveMines' ? 1 : MINE_DROP_FRAC)),
  };
}

const mineTactic: EquipmentTactic = mineTacticFor('navalMines');
const captiveMineTactic: EquipmentTactic = mineTacticFor('captiveMines');
const foulingMineTactic: EquipmentTactic = mineTacticFor('foulingMines');

// ---------------------------------------------------------------------------
// STAR SHELLS — the sensor shot. (The two offensive doctrine verbs that used
// to ride here are DELETED, Story 8.17 / amendment 134; PHOSPHOR SHELLS has
// its own row below.)
// ---------------------------------------------------------------------------

/** ms — how stale a plot must be before THIS profile spends a flare on it.
 *  Eagerness only: when an eager and a neutral holder both fire, they fire at
 *  the identical point. (The phosphor stale CAP that once bounded this —
 *  `phosphorStaleCapMs`, the ×0.8 lit shrink — went with the verb; the
 *  reluctant floor is simply the floor again.) */
function flareStaleFloorMs(profile: BotProfile): number {
  return appetiteFor(profile, 'starShells') >= APPETITE_EAGER
    ? FLARE_STALE_MS
    : FLARE_STALE_MS * RELUCTANT_STALE_MULT;
}

/**
 * THE SENSOR FLARE (Eric ruling C2): the stalest plot worth lighting — an
 * actionable track we have LOST, quiet past this profile's staleness floor,
 * beyond our own truesight bubble, inside flare reach. Nearest wins.
 */
function sensorFlareTarget(ctx: TacticContext): BotTrack | null {
  const sit = ctx.sit;
  const floorMs = flareStaleFloorMs(sit.profile);
  let best: BotTrack | null = null;
  let bestD = Infinity;
  for (const t of tracksOf(ctx.mind)) {
    if (t.live || !isActionable(t, sit.now)) continue;
    if (sit.now - t.seenAt < floorMs) continue;
    const d = distTo(sit, t);
    if (d <= sit.stats.sightRange || d > sit.stats.equipment.starShells.rangeU) continue;
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  return best;
}

function flareSolve(ctx: TacticContext): Shot | null {
  const t = sensorFlareTarget(ctx);
  if (t === null) return null;
  // THE TERRAIN GATE IS ON THE SHOT, never on the selector: the bot still
  // wants the nearest plot; it holds the round when the round cannot arrive.
  if (!shotReaches(ctx.self, ctx.sit, t)) return null;
  const d = Math.min(distTo(ctx.sit, t), ctx.sit.stats.equipment.starShells.rangeU);
  return { aim: bearing(ctx.self.state, t), aimDist: d, slot: ctx.slot };
}

const starShellsTactic: EquipmentTactic = {
  id: 'starShells',
  kind: 'placement',
  reachU: (stats) => stats.equipment.starShells.rangeU,
  // Any holder with at least neutral appetite uses flares — the shipped
  // usesStarShells:false flag on bulwark (a hull that CARRIES them natively)
  // is exactly the capability-keyed-by-hull defect this axis retires.
  want: (ctx) => appetiteFor(ctx.sit.profile, 'starShells') >= APPETITE_NEUTRAL,
  solve: flareSolve,
};

// ---------------------------------------------------------------------------
// PHOSPHOR SHELLS (Story 8.17, amendment 135(h)). Fired straight at the
// NEAREST LIVE contact inside the bot's own sight bubble, inside the row's
// reach (tacticKit.ts burstOnLiveContact).
// ---------------------------------------------------------------------------

const phosphorShellsTactic: EquipmentTactic = {
  id: 'phosphorShells',
  kind: 'placement',
  reachU: (stats) => stats.equipment.phosphorShells.rangeU,
  want: (ctx) => appetiteFor(ctx.sit.profile, 'phosphorShells') >= APPETITE_NEUTRAL,
  solve: (ctx) => burstOnLiveContact(ctx, ctx.sit.stats.equipment.phosphorShells.rangeU),
};

// ---------------------------------------------------------------------------
// THE WEAPON TABLE — TOTAL over every non-Shift EquipmentId, deep-frozen.
// ai/tacticRegistry.ts adds the Shift rows to make EQUIPMENT_TACTICS.
// ---------------------------------------------------------------------------

export const WEAPON_TACTICS: Readonly<Record<WeaponLineId, EquipmentTactic>> = deepFreezeRows({
  gun: gunTactic,
  machineGun: machineGunTactic,
  flak: flakTactic,
  heavyTorpedo: torpedoTactic,
  lightTorpedo: lightTorpedoTactic,
  navalMines: mineTactic,
  captiveMines: captiveMineTactic,
  foulingMines: foulingMineTactic,
  broadside: broadsideTactic,
  starShells: starShellsTactic,
  phosphorShells: phosphorShellsTactic,
});
