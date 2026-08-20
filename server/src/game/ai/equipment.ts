// THE EQUIPMENT AXIS (Eric ruling, 2026-08-20) — HOW a weapon is used,
// travelling WITH THE WEAPON.
//
// Bot policy splits onto TWO AXES. The SHIP profile (ai/profiles.ts) is
// temperament: engagement band, target weights, disengage/heal thresholds,
// posture, and an APPETITE table saying how eager this captain is about each
// piece of equipment. The EQUIPMENT TACTIC (this file) is weapon knowledge:
// want/solve/reach and every doctrine branch for ONE equipment id. The flat
// model this replaces keyed weapon knowledge by HULL, so a Battleship that
// ACQUIRED mines (acquireMine) had no idea what a mine was, and `bulwark`
// carried star shells natively while being flagged never to fire them.
//
// `EQUIPMENT_TACTICS` is a total `Record<EquipmentId, EquipmentTactic>` — the
// same one-interface-one-registry completeness gate the server's own
// equipment rows use (game/equipment/index.ts): a future equipment cannot
// ship without a bot tactic, because this Record fails to type-check without
// its row.
//
// TEMPERAMENT MODULATES PROACTIVITY ONLY (ruled). There is ONE mine tactic
// shared by everyone; `trapper` lays as a standing plan and `siege` lays only
// when something is closing, and that difference is carried ENTIRELY by the
// appetite number read against the two thresholds below. A profile may NOT
// override placement geometry, doctrine choice or target selection — a
// per-(profile × equipment) override table is the flat model this replaces
// and is forbidden.
//
// EVERY DOCTRINE VERB HAS EXACTLY ONE BEHAVIOURAL CONSUMER, inside its
// equipment's tactic:
//   mine.captive        — full-placeRange proactive lays, hostile-only victims
//   mine.propFouling    — the trap goes down EARLIER against a closing pursuer
//   torpedo.homing      — the credible-range gate widens (budget − turn room)
//   starShells.dazzle   — the flare turns OFFENSIVE (live contact in sight)
//   starShells.phosphor — prefer the SLOW target; the ×0.8 lit shrink caps
//                         how stale a sensor plot is worth lighting
//   radarBuoy.jamming   — sited as COVER while in contact, not as recon
//   radarBuoy.gun       — sited as a PICKET when a tracked hull is in its reach
//   broadside.spreadRung— the wide base fan may be spent on a just-lost plot;
//                         a tightened fan demands a live track
//
// No rng is drawn anywhere in want() — the mind's stream feeds aim scatter
// and nothing else (the determinism pin).

import {
  CONFIG,
  SHIP_CLASS_IDS,
  bearing,
  blockedWater,
  inArc,
  sectorArcFor,
  twinSectorArcFor,
  wrapAngle,
  type EffectiveStats,
  type EquipmentId,
  type Rng,
  type Vec2,
} from '@salvo/shared';
import type { BotMind, BotPosture, BotSelf, BotWorldPort } from './types.js';
import {
  hasPersistence,
  isActionable,
  lineBlocked,
  ownLiveMines,
  tracksOf,
  type BotSituation,
  type BotTrack,
} from './utility.js';
import type { BotProfile } from './profiles.js';

const TAU = Math.PI * 2;

/** The torpedo's ratified bow sector, the mine's ratified astern sector (the
 *  radar buoy shares it verbatim — sectorArcFor('radarBuoy') IS the mine's
 *  descriptor, pinned in shared arcs.test.ts) and the broadside's two beam
 *  sectors — resolved ONCE at module load from the single shared arc source
 *  the equipment rows enforce with. */
const BOW_SECTOR = sectorArcFor('torpedo');
const REAR_SECTOR = sectorArcFor('mine');
const BUOY_SECTOR = sectorArcFor('radarBuoy');
const BEAM_SECTORS = twinSectorArcFor('broadside');

/** u — the range inside which a STANDARD torpedo intercept is CREDIBLE. A 60
 *  u/s fish against a 45 u/s hull needs the target inside knife range or the
 *  lead solution is fiction; beyond this the tube is held. */
const TORPEDO_CREDIBLE_U = 250;
/** Fraction of CONFIG.mine.placeRange a STANDARD mine is dropped at — astern
 *  of the hull but well inside the rack's reach, so arc and range pass by
 *  construction and only the water can refuse. A CAPTIVE mine drops at the
 *  FULL placeRange instead (see mineSolve). */
const MINE_DROP_FRAC = 0.5;
/** × placeRange — how close a track must be before a mine is worth laying
 *  (proactive/eager and reactive/closing branches alike at base). */
const MINE_NEAR_MULT = 2;
/** × placeRange — the WIDENED laying range against a CLOSING pursuer when
 *  PROP-FOULING is held: a slow only pays if the victim runs THROUGH the
 *  field, so a fouling trapper seeds the water earlier along the chase. */
const FOUL_CLOSING_MULT = 4;
/** ms — how stale a plot must be before an EAGER flare user lights it. Below
 *  this the contact is fresh enough to shoot at directly. */
const FLARE_STALE_MS = 1500;
/** × FLARE_STALE_MS — a NEUTRAL-appetite holder waits this much longer before
 *  spending a 20s flare on the same plot. Eagerness, never geometry: when both
 *  profiles fire, they fire at the identical point. */
const RELUCTANT_STALE_MULT = 2;
/** The base spread rung — the WIDEST fan. At this rung (and only this rung) a
 *  broadside may be spent on a just-lost plot; every tightened rung demands a
 *  live track, because a narrow fan is a point weapon and a point weapon
 *  needs a real position. */
const WIDE_RUNG = 1;
/** ms — how recently a NON-live plot must have been refreshed for the WIDE
 *  base fan to accept it. ~1.5s of drift at full ahead (67u) is inside the
 *  base 12° fan's footprint at combat range; older and the fan is a guess. */
const WIDE_FAN_STALE_MS = 1500;
/** u/s — the fastest playable hull, the drift bound the phosphor stale cap is
 *  derived against (never a literal: a kinematics retune moves it). */
const FASTEST_HULL_SPEED = Math.max(
  ...SHIP_CLASS_IDS.map((cls) => CONFIG.shipClasses[cls].kinematics.maxSpeed),
);

/** Appetite thresholds. Appetite is the SHIP profile's one word about an
 *  equipment: how PROACTIVELY this captain reaches for it. At or above EAGER
 *  the weapon is a standing plan; at or above NEUTRAL it is used reactively
 *  (when the situation demands); below NEUTRAL it is held for emergencies the
 *  tactic itself names (a mine on disengage answers a threat at ANY appetite). */
export const APPETITE_NEUTRAL = 1;
export const APPETITE_EAGER = 2;

/** The neutral eagerness for equipment a profile's table does not name. The
 *  GUN is the deliberate exception: it is the always-available fallback, so
 *  its base appetite sits below everything else and it is tried LAST — the
 *  shipped ladder's ordering, now expressed as data. */
const BASE_APPETITE: Readonly<Record<EquipmentId, number>> = Object.freeze({
  gun: 0.5,
  torpedo: APPETITE_NEUTRAL,
  mine: APPETITE_NEUTRAL,
  speedBoost: APPETITE_NEUTRAL,
  broadside: APPETITE_NEUTRAL,
  starShells: APPETITE_NEUTRAL,
  radarBuoy: APPETITE_NEUTRAL,
});

/** How eager this profile is about one equipment id — the profile's own entry,
 *  else the neutral base. THE one resolver both consumers (the want() gates
 *  here, the slot ordering in tactics.ts) read, so an appetite entry always
 *  has at least the ordering as its consumer. */
export function appetiteFor(profile: BotProfile, id: EquipmentId): number {
  return profile.appetite[id] ?? BASE_APPETITE[id];
}

/** A legal shot request: one slot, one bearing, one commanded distance. */
export interface Shot {
  aim: number;
  aimDist: number;
  slot: number;
}

/** How a tactic's output reaches the world: a 'shot' needs a target and is
 *  resolved BELOW chooseShot's target guard; a 'placement' (flare / mine /
 *  buoy) is resolved ABOVE it — siting a sensor buoy is most valuable when
 *  nothing is tracked; an 'ability' rides the actSeq channel (chooseAct). */
export type TacticKind = 'shot' | 'placement' | 'ability';

/** Everything a tactic may know when deciding: the bot's own record, its mind
 *  (track store + aim-scatter rng), the folded situation, the narrow port,
 *  the deliberated target (null is legal for placements) and the cached
 *  posture — plus the loadout slot this tactic would fire. */
export interface TacticContext {
  self: BotSelf;
  mind: BotMind;
  sit: BotSituation;
  port: BotWorldPort;
  target: BotTrack | null;
  posture: BotPosture;
  slot: number;
}

/** One equipment's bot tactic — the weapon axis. */
export interface EquipmentTactic {
  readonly id: EquipmentId;
  readonly kind: TacticKind;
  /** u — the effective COMMITTED reach at these stats (the band pull's input;
   *  0 = never pulls). For a shot weapon this is the range it is genuinely
   *  worth firing at, not its maximum flight. */
  reachU(stats: EffectiveStats): number;
  /** Spend this equipment now? Appetite modulates PROACTIVITY here and
   *  nothing else. Must draw no rng. */
  want(ctx: TacticContext): boolean;
  /** The legal shot, or null (an arc/range/water/doctrine refusal — nothing
   *  consumed). Ability rows always return null. */
  solve(ctx: TacticContext): Shot | null;
}

// ---------------------------------------------------------------------------
// AIMING — one lead solve, one scatter, one place (moved verbatim from
// tactics.ts when the weapon ladder moved onto this axis).
// ---------------------------------------------------------------------------

/** Fixed-point iterations for the intercept solve (converges well inside 3). */
const LEAD_ITERATIONS = 3;

/**
 * The lead-corrected intercept point for a track at `speed` u/s of ordnance.
 * A track with no disclosed pose — the identity-free `return`-grammar plot —
 * cannot be led at all, so its last-known point IS the aim point.
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
 * THE ONE PLACE MARKSMANSHIP LIVES (competence knob E2): a uniform disc of
 * CONFIG.bots.aimScatterU scaled by range, applied BEFORE any legality check.
 * The mind's rng feeds this and nothing else.
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

/**
 * THE TERRAIN CHECK — can this flat-trajectory round actually ARRIVE, or does
 * the coastline stop it first (the cycle-99 fix)? A physics question, never a
 * visibility one: firing into fog is a ratified feature (FR16), firing into a
 * rock is a wasted click. Origin is the hull CENTRE (BotSelf carries no hull
 * class), which is the strictly longer segment, so the check can only be
 * conservative.
 */
function shotReaches(self: BotSelf, sit: BotSituation, p: Vec2): boolean {
  return !lineBlocked(self.state, p, sit.islands);
}

function distTo(sit: BotSituation, t: BotTrack): number {
  return Math.hypot(t.x - sit.x, t.y - sit.y);
}

/** Is this track making way TOWARD us? Unknown course = not closing (an
 *  identity-free plot cannot justify a reactive trap). */
function isClosing(sit: BotSituation, t: BotTrack): boolean {
  if (t.heading === null || t.speed === null) return false;
  const vx = Math.cos(t.heading) * t.speed;
  const vy = Math.sin(t.heading) * t.speed;
  return vx * (sit.x - t.x) + vy * (sit.y - t.y) > 0;
}

/** Is this track inside the hull's astern sector? */
function behindUs(self: BotSelf, sit: BotSituation, t: BotTrack): boolean {
  const center = wrapAngle(self.state.heading + REAR_SECTOR.offset);
  return inArc(Math.atan2(t.y - sit.y, t.x - sit.x), center, REAR_SECTOR.halfArc);
}

// ---------------------------------------------------------------------------
// GUN — every bot's default weapon, the always-available fallback.
// ---------------------------------------------------------------------------

/** A gun-family burst (gun / broadside): aimed to a clicked point at a
 *  clamped range, coastline-gated. */
function burstSolve(ctx: TacticContext, id: 'gun' | 'broadside', rangeU: number): Shot | null {
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
  reachU: (stats) => stats.gun.rangeU,
  // Blip shooting is a ruled skill (cycle 99): the gun takes NO persistence
  // gate and no doctrine gate — every legality question lives in solve().
  want: (ctx) => ctx.target !== null,
  solve: (ctx) => burstSolve(ctx, 'gun', ctx.sit.stats.gun.rangeU),
};

// ---------------------------------------------------------------------------
// BROADSIDE — 30s of reload; the spreadRung doctrine decides how sure the
// plot must be.
// ---------------------------------------------------------------------------

/**
 * THE SPREAD-RUNG CONSUMER: the wide BASE fan (rung 1, 12° half-angle) covers
 * enough water to be worth a just-lost plot with a disclosed course; every
 * tightened rung (BROADSIDE SPREAD cards) narrows the fan toward a point
 * weapon, and a point weapon demands a LIVE track.
 */
function fanAcceptsPlot(t: BotTrack, sit: BotSituation): boolean {
  if (t.live) return true;
  if (sit.stats.broadside.spreadRung > WIDE_RUNG) return false;
  return sit.now - t.seenAt <= WIDE_FAN_STALE_MS;
}

function broadsideSolve(ctx: TacticContext): Shot | null {
  const t = ctx.target;
  if (t === null || t.heading === null) return null; // an unled ghost gets the gun
  if (!fanAcceptsPlot(t, ctx.sit)) return null;
  const shot = burstSolve(ctx, 'broadside', ctx.sit.stats.broadside.rangeU);
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
  reachU: (stats) => stats.broadside.rangeU,
  // A 30s reload is never committed to a plot without PERSISTENCE — the
  // structural counter to a jamming buoy's fakes, which re-scatter wholesale
  // each revolution and so can never persist as one coherent track.
  want: (ctx) => ctx.target !== null && hasPersistence(ctx.target, ctx.sit.now),
  solve: broadsideSolve,
};

// ---------------------------------------------------------------------------
// TORPEDO — the homing doctrine widens the credible-range gate.
// ---------------------------------------------------------------------------

/**
 * THE HOMING CONSUMER. A standard fish is credible only at knife range
 * (TORPEDO_CREDIBLE_U). An ACOUSTIC HOMING fish corrects its own terminal
 * error, so the gate widens — bounded by BOTH ruled quantities: the
 * `homingMaxRangeU` travel budget, less one half-turn of correction room
 * (π × turn radius, where turn radius = speed / homingTurnRate — 120u at
 * base and WORSE with speed cards, so a speed-carded fish's credible range
 * genuinely SHRINKS as its turn opens).
 */
function torpedoReachU(stats: EffectiveStats): number {
  if (!stats.torpedo.homing) return TORPEDO_CREDIBLE_U;
  const turnRadius = stats.torpedo.speed / CONFIG.torpedo.homingTurnRate;
  return Math.max(TORPEDO_CREDIBLE_U, CONFIG.torpedo.homingMaxRangeU - Math.PI * turnRadius);
}

function torpedoSolve(ctx: TacticContext): Shot | null {
  const t = ctx.target;
  if (t === null || t.heading === null) return null; // a return-grammar plot cannot be led
  if (distTo(ctx.sit, t) > torpedoReachU(ctx.sit.stats)) return null;
  const p = aimPoint(ctx.mind, ctx.sit, t, ctx.sit.stats.torpedo.speed);
  const aim = bearing(ctx.self.state, p);
  const center = wrapAngle(ctx.self.state.heading + BOW_SECTOR.offset);
  if (!inArc(aim, center, BOW_SECTOR.halfArc)) return null; // ARC FIRST — an arc miss consumes nothing
  if (!shotReaches(ctx.self, ctx.sit, p)) return null;
  return { aim, aimDist: distTo(ctx.sit, t), slot: ctx.slot };
}

const torpedoTactic: EquipmentTactic = {
  id: 'torpedo',
  kind: 'shot',
  reachU: torpedoReachU,
  // Same persistence law as the broadside: a 30s tube is never spent on a
  // track that has not persisted one sweep revolution (live truesight counts
  // instantly — a fake can never appear inside the bubble, structurally).
  want: (ctx) => ctx.target !== null && hasPersistence(ctx.target, ctx.sit.now),
  solve: torpedoSolve,
};

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
  if (appetiteFor(ctx.sit.profile, 'mine') < APPETITE_NEUTRAL) return false;
  // PROP-FOULING WIDENS THE CLOSING WINDOW HERE TOO (cross-model review, cycle
  // 110). The two verbs STACK by design — the catalog says so, and the captive
  // torpedo carries the foul — but `mineWant` hands the whole decision to this
  // function the moment `captive` is set, so the base path's fouling widening
  // was unreachable for a holder of BOTH. A neutral-appetite layer with both
  // verbs, facing a pursuer closing astern at 450u, laid nothing where fouling
  // ALONE would have laid: adding a card made the bot worse. Same class as the
  // buoy, phosphor and captive-disengage downgrades.
  const mult =
    ctx.sit.stats.mine.propFouling && isClosing(ctx.sit, t) ? FOUL_CLOSING_MULT : MINE_NEAR_MULT;
  return distTo(ctx.sit, t) <= CONFIG.mine.placeRange * mult;
}

/**
 * THE FIELD-CHURN BOUND (Eric ruling 2026-08-20, cycle 111): EVERY lay —
 * prepared and reactive alike — is refused with the bot's own board at
 * `stats.mine.maxLive`. This closes a shipped defect: `addMine`
 * (game/equipment/mines.ts) SILENTLY EVICTS the owner's oldest mine at the
 * cap, so an uncounted lay churns the field the bot just built. The count is
 * read from the bot's own perception view (`ownLiveMines`) — the same data a
 * human client receives — never from a world collection.
 */
function mineFieldFull(ctx: TacticContext): boolean {
  return ownLiveMines(ctx.mind) >= ctx.sit.stats.mine.maxLive;
}

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
 * (kept under `maxLive`) is what keeps headroom so a reactive lay always has
 * a round's worth of room; the profile still only says how eager it is.
 *
 * PREPARED ADDS AN OCCASION, IT NEVER REMOVES ONE (epic-7 amendment 29, the
 * rule five defects produced): every reactive lay below still fires exactly
 * as before, including with the field at the reserve.
 */
function preparedMineWant(ctx: TacticContext): boolean {
  if (!SAFE_LAY_POSTURES.includes(ctx.posture)) return false;
  if (ownLiveMines(ctx.mind) >= CONFIG.bots.preparedMineReserve) return false;
  const appetite = appetiteFor(ctx.sit.profile, 'mine');
  if (appetite >= APPETITE_EAGER) return true;
  return ctx.sit.stats.mine.captive && appetite >= APPETITE_NEUTRAL;
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
function reactiveMineWant(ctx: TacticContext): boolean {
  const { sit, target: t } = ctx;
  if (ctx.posture === 'disengage') return true;
  if (t === null) return false;
  const appetite = appetiteFor(sit.profile, 'mine');
  if (appetite < APPETITE_NEUTRAL) return false;
  if (!behindUs(ctx.self, sit, t)) return false;
  const d = distTo(sit, t);
  if (isClosing(sit, t)) {
    const mult = sit.stats.mine.propFouling ? FOUL_CLOSING_MULT : MINE_NEAR_MULT;
    if (d <= CONFIG.mine.placeRange * mult) return true;
  }
  return appetite >= APPETITE_EAGER && d <= CONFIG.mine.placeRange * MINE_NEAR_MULT;
}

/**
 * Does this bot want a mine in the water now? The churn bound refuses first
 * (no lay of any kind may evict), the prepared occasion ADDS next, and the
 * reactive occasions — the shipped behaviour, captive branch included — run
 * exactly as before.
 */
function mineWant(ctx: TacticContext): boolean {
  if (mineFieldFull(ctx)) return false;
  if (preparedMineWant(ctx)) return true;
  if (ctx.sit.stats.mine.captive) return captiveMineWant(ctx);
  return reactiveMineWant(ctx);
}

/** A drop commanded DEAD ASTERN — the centre of the given ratified placement
 *  sector — so arc and range pass by construction and only the water can
 *  refuse (`blockedWater` is the SAME predicate the equipment rows deny with). */
function sectorPlacement(
  ctx: TacticContext,
  sector: { offset: number },
  dropU: number,
): Shot | null {
  const aim = wrapAngle(ctx.self.state.heading + sector.offset);
  const p = { x: ctx.sit.x + Math.cos(aim) * dropU, y: ctx.sit.y + Math.sin(aim) * dropU };
  if (blockedWater(p, ctx.port.map.islands, ctx.port.map.radius)) return null;
  return { aim, aimDist: dropU, slot: ctx.slot };
}

const mineTactic: EquipmentTactic = {
  id: 'mine',
  kind: 'placement',
  reachU: () => CONFIG.mine.placeRange,
  want: mineWant,
  // CAPTIVE lays at the FULL placeRange: a 144u trip ring is area denial, so
  // the round goes as far out as the rack reaches; a contact mine stays at
  // half reach, seeding the water the hull just left.
  solve: (ctx) =>
    sectorPlacement(
      ctx,
      REAR_SECTOR,
      CONFIG.mine.placeRange * (ctx.sit.stats.mine.captive ? 1 : MINE_DROP_FRAC),
    ),
};

// ---------------------------------------------------------------------------
// STAR SHELLS — the sensor shot, plus the two offensive doctrine verbs.
// ---------------------------------------------------------------------------

/** ms — how stale a plot must be before THIS profile spends a flare on it.
 *  Eagerness only: when an eager and a neutral holder both fire, they fire at
 *  the identical point. */
function flareStaleFloorMs(profile: BotProfile): number {
  return appetiteFor(profile, 'starShells') >= APPETITE_EAGER
    ? FLARE_STALE_MS
    : FLARE_STALE_MS * RELUCTANT_STALE_MULT;
}

/**
 * THE PHOSPHOR REACH COST: phosphor shrinks the flare's OWN lit circle ×0.8
 * (the equipment row spawns litRadius × incendiaryRadiusFactor), so a stale
 * plot is only worth lighting while its drift bound still fits inside the
 * smaller circle — staler than this and the burning zone probably misses.
 */
function phosphorStaleCapMs(stats: EffectiveStats): number {
  const lit = stats.starShells.litRadius * CONFIG.starShells.incendiaryRadiusFactor;
  return (lit / FASTEST_HULL_SPEED) * 1000;
}

/**
 * THE OFFENSIVE FLARE (dazzle and/or phosphor held): fired at a LIVE contact
 * inside our own sight bubble — dazzle halves the victim's whole sightOf and
 * phosphor burns 5 hp/s — rather than only at a stale far plot. PHOSPHOR
 * PREFERS THE SLOW TARGET (a DoT zone only pays on a hull that stays in it);
 * dazzle alone takes the nearest.
 */
function offensiveFlareTarget(ctx: TacticContext): BotTrack | null {
  const ss = ctx.sit.stats.starShells;
  if (!ss.dazzle && !ss.phosphor) return null;
  let best: BotTrack | null = null;
  let bestKey = Infinity;
  for (const t of tracksOf(ctx.mind)) {
    if (!t.live || !isActionable(t, ctx.sit.now)) continue;
    const d = distTo(ctx.sit, t);
    if (d > ctx.sit.stats.sightRange) continue;
    const key = ss.phosphor ? t.speed ?? Infinity : d;
    if (key < bestKey) {
      bestKey = key;
      best = t;
    }
  }
  return best;
}

/**
 * THE RELUCTANT WAIT MAY NEVER OUTLAST THE GEOMETRY (review gate, cycle 110).
 * `flareStaleFloorMs` makes a non-eager holder wait 2× before spending a
 * flare, and `phosphorStaleCapMs` refuses a plot too stale for the SHRUNKEN
 * burning circle to still cover. At shipped numbers those cross: the
 * reluctant floor is 3000ms and the phosphor cap is 165 × 0.8 / 45 × 1000 =
 * 2933ms, so the window was EMPTY by 67ms and buying PHOSPHOR silently
 * deleted the C2 sensor-flare role for every non-eager holder — `bulwark`,
 * which CARRIES star shells natively, and every acquirer at the base
 * appetite. It was invisible to the blind-vacuum rig because those rows are
 * all eager, and to the suite because the phosphor tests all use `siege`.
 *
 * The cap is real geometry and wins; RELUCTANCE DEGRADES TO THE EAGER FLOOR
 * rather than to nothing, so a doctrine still never removes a role. Pinned
 * below by a constraint test, so a future litRadius card cannot re-cross it.
 */
function flareFloorUnderCap(profile: BotProfile, capMs: number): number {
  const wanted = flareStaleFloorMs(profile);
  return wanted < capMs ? wanted : FLARE_STALE_MS;
}

/**
 * THE SENSOR FLARE (Eric ruling C2): the stalest plot worth lighting — an
 * actionable track we have LOST, quiet past this profile's staleness floor,
 * beyond our own truesight bubble, inside flare reach. Nearest wins.
 */
function sensorFlareTarget(ctx: TacticContext): BotTrack | null {
  const sit = ctx.sit;
  const capMs = sit.stats.starShells.phosphor ? phosphorStaleCapMs(sit.stats) : Infinity;
  const floorMs = flareFloorUnderCap(sit.profile, capMs);
  let best: BotTrack | null = null;
  let bestD = Infinity;
  for (const t of tracksOf(ctx.mind)) {
    if (t.live || !isActionable(t, sit.now)) continue;
    const age = sit.now - t.seenAt;
    if (age < floorMs || age > capMs) continue;
    const d = distTo(sit, t);
    if (d <= sit.stats.sightRange || d > sit.stats.starShells.rangeU) continue;
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  return best;
}

function flareSolve(ctx: TacticContext): Shot | null {
  const t = offensiveFlareTarget(ctx) ?? sensorFlareTarget(ctx);
  if (t === null) return null;
  // THE TERRAIN GATE IS ON THE SHOT, never on the selector: the bot still
  // wants the nearest plot; it holds the round when the round cannot arrive.
  if (!shotReaches(ctx.self, ctx.sit, t)) return null;
  const d = Math.min(distTo(ctx.sit, t), ctx.sit.stats.starShells.rangeU);
  return { aim: bearing(ctx.self.state, t), aimDist: d, slot: ctx.slot };
}

const starShellsTactic: EquipmentTactic = {
  id: 'starShells',
  kind: 'placement',
  reachU: (stats) => stats.starShells.rangeU,
  // Any holder with at least neutral appetite uses flares — the shipped
  // usesStarShells:false flag on bulwark (a hull that CARRIES them natively)
  // is exactly the capability-keyed-by-hull defect this axis retires.
  want: (ctx) => appetiteFor(ctx.sit.profile, 'starShells') >= APPETITE_NEUTRAL,
  solve: flareSolve,
};

// ---------------------------------------------------------------------------
// RADAR BUOY — no tactic existed at all before this file. Placement is
// re-derived from CONFIG.mine.placeRange + sectorArcFor('radarBuoy') (the
// equipment row is import-banned from ai/).
// ---------------------------------------------------------------------------

/**
 * WHERE a buoy is wanted depends on its doctrine, and on nothing the profile
 * says (appetite gates only WHETHER this captain bothers):
 *   plain sensor — RECON: sited when NOTHING is tracked, which is why the
 *                  placement class resolves ABOVE the target guard at all;
 *   jamming      — COVER: sited while IN CONTACT, scattering fakes over the
 *                  fight the bot is actually having;
 *   gun          — PICKET: sited when a tracked hull is inside the reach the
 *                  buoy's own gun could actually serve (its flat radarRange
 *                  around a drop one placeRange astern).
 */
function buoyWant(ctx: TacticContext): boolean {
  if (appetiteFor(ctx.sit.profile, 'radarBuoy') < APPETITE_NEUTRAL) return false;
  const rb = ctx.sit.stats.radarBuoy;
  // RECON IS AVAILABLE TO EVERY DOCTRINE. Both buoy verbs are pure ADDS in the
  // sim — a jamming buoy still relays to its owner exactly as a plain one does
  // (`signals.ts` buoyGate is untouched by the verb; jamming only ADDS fakes,
  // and the owner is exempt from them), and a gun buoy is a sensor that also
  // shoots. So a doctrine may ADD a siting occasion and may NEVER remove the
  // base one: an empty scope is always worth a buoy. Reading the switch the
  // other way made buying a doctrine a DOWNGRADE in the role the buoy already
  // had, which no card in this catalog does.
  if (ctx.target === null) return true;
  // COVER: fakes scattered over the fight the bot is actually having.
  if (rb.jamming) return true;
  // PICKET: only where the buoy's own gun could actually serve, measured from
  // a drop one placeRange astern.
  if (rb.gun) return distTo(ctx.sit, ctx.target) <= rb.radarRange + CONFIG.mine.placeRange;
  return false;
}

const radarBuoyTactic: EquipmentTactic = {
  id: 'radarBuoy',
  kind: 'placement',
  reachU: () => CONFIG.mine.placeRange,
  want: buoyWant,
  // Dropped dead astern at the FULL shared placeRange (max standoff for a
  // sensor), through the same sector-centre construction as the mine — the
  // buoy shares the mine's whole placement envelope (R2.7), which BUOY_SECTOR
  // resolves from the one shared arc source — the buoy's own descriptor, not
  // a mine assumption (the two are pinned identical in shared arcs.test.ts).
  solve: (ctx) => sectorPlacement(ctx, BUOY_SECTOR, CONFIG.mine.placeRange),
};

// ---------------------------------------------------------------------------
// SPEED BOOST — the one ability: spent opening range on the way out.
// ---------------------------------------------------------------------------

const speedBoostTactic: EquipmentTactic = {
  id: 'speedBoost',
  kind: 'ability',
  reachU: () => 0,
  want: (ctx) =>
    ctx.posture === 'disengage' && appetiteFor(ctx.sit.profile, 'speedBoost') >= APPETITE_NEUTRAL,
  solve: () => null,
};

// ---------------------------------------------------------------------------
// THE REGISTRY — total over EquipmentId (the completeness gate), deep-frozen
// like the server's own EQUIPMENT registry.
// ---------------------------------------------------------------------------

const deepFreezeRows = <T extends object>(rows: T): Readonly<T> => {
  for (const key of Object.keys(rows) as (keyof T)[]) Object.freeze(rows[key]);
  return Object.freeze(rows);
};

export const EQUIPMENT_TACTICS: Readonly<Record<EquipmentId, EquipmentTactic>> = deepFreezeRows({
  gun: gunTactic,
  torpedo: torpedoTactic,
  mine: mineTactic,
  speedBoost: speedBoostTactic,
  broadside: broadsideTactic,
  starShells: starShellsTactic,
  radarBuoy: radarBuoyTactic,
});
