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
// `EQUIPMENT_TACTICS` is a `Partial<Record<EquipmentId, EquipmentTactic>>` —
// PARTIAL, deliberately, because four catalog-v3 weapons still have no module
// (MISSILE, MACHINE GUN, FLAK, MONITOR — Stories 8.14-8.16). So it is NOT the
// compile-forced completeness gate the server's equipment rows are
// (game/equipment/index.ts): a bot simply has no knowledge of a weapon with no
// row here, and `want()` is never asked about one it cannot carry. The gate
// comes back when the registry does — a tactic per BUILT module.
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
//   captiveMines (kind) — full-placeRange proactive lays, hostile-only victims
//   foulingMines (kind) — the trap goes down EARLIER against a closing pursuer
//   torpedo homingTurnRate — the credible-range gate widens (budget − turn room)
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
  isAfloat,
  isConsumableId,
  sectorArcFor,
  twinSectorArcFor,
  twinSectorSide,
  wrapAngle,
  type ConsumableId,
  type EffectiveStats,
  type EquipmentId,
  type Rng,
  type SlotItemId,
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

/**
 * THE TWO FAMILY ID UNIONS the parameterized tactics below are keyed by
 * (Story 8.13). Declared HERE rather than imported from the server's equipment
 * modules because `ai/` is perception-gated — it may not import
 * `game/equipment/**` at all (the ESLint boundary, ai/types.ts) — and they are
 * only narrowings of `EquipmentId`, so the compiler still refuses a string
 * that is not a real line id.
 */
type TorpedoLineId = Extract<EquipmentId, 'heavyTorpedo' | 'lightTorpedo'>;
type MineLineId = Extract<EquipmentId, 'navalMines' | 'captiveMines' | 'foulingMines'>;

/** The torpedo's ratified bow sector, the mine's ratified astern sector (the
 *  radar buoy shares it verbatim — sectorArcFor('radarBuoy') IS the mine's
 *  descriptor, pinned in shared arcs.test.ts) and the broadside's two beam
 *  sectors — resolved ONCE at module load from the single shared arc source
 *  the equipment rows enforce with. */
const BOW_SECTOR = sectorArcFor('heavyTorpedo');
/** The LIGHT torpedo's TWIN beam sectors and the SUPERCAV consumable's narrow
 *  bow cone (Story 8.13) — resolved from the same shared arc source the server
 *  rows enforce with, so a bot never solves a shot its own weapon refuses. */
const LIGHT_BEAMS = twinSectorArcFor('lightTorpedo');
const SUPERCAV_SECTOR = sectorArcFor('supercavTorpedo');
const REAR_SECTOR = sectorArcFor('navalMines');
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
  // Story 8.1 widened EquipmentId to the fifteen catalog-v3 ids. This record
  // stays TOTAL — the compile-time forcing function that a new weapon cannot
  // land without an appetite — so the unbuilt weapons carry the neutral base
  // until their stories give them tactics. `boost` is BUILT (Story 8.9: the
  // universal slot-1 ability); its base stays neutral and each profile that
  // wants it eagerly overrides here (see profiles.ts `appetite`).
  boost: APPETITE_NEUTRAL,
  lightTorpedo: APPETITE_NEUTRAL,
  heavyTorpedo: APPETITE_NEUTRAL,
  navalMines: APPETITE_NEUTRAL,
  captiveMines: APPETITE_NEUTRAL,
  // FOULING MINES joined EquipmentId in Story 8.13 (amendment 81) and takes
  // the naval rack's neutral base; SUPERCAV TORPEDO LEFT it for the consumable
  // id space (amendment 74) and its eagerness now lives in CONSUMABLE_APPETITE.
  foulingMines: APPETITE_NEUTRAL,
  missile: APPETITE_NEUTRAL,
  machineGun: APPETITE_NEUTRAL,
  flak: APPETITE_NEUTRAL,
  monitor: APPETITE_NEUTRAL,
  broadside: APPETITE_NEUTRAL,
  starShells: APPETITE_NEUTRAL,
  radarBuoy: APPETITE_NEUTRAL,
});

/**
 * THE FAMILY FALLBACK (Story 8.13, interim — epic-8 amendment 79's "minimal
 * tactics now, Story 8.18 owns the table"). Three lines became fittable this
 * cycle whose behaviour the profiles already had an opinion about, under
 * another name: CAPTIVE and FOULING mines were DOCTRINE VERBS on the naval
 * rack (so a trapper's `navalMines: 2.6` spoke for them), and the LIGHT
 * torpedo is the heavy's tactic keyed by its own id.
 *
 * Without this, a trapper handed a captive rack would drop to the NEUTRAL base
 * and rank its signature weapon below its radar buoy — a silent behaviour
 * REGRESSION bought by nothing. So a line with no entry of its own reads its
 * FAMILY's entry first, which is exactly the number that used to reach it.
 *
 * IT IS NOT A RETUNE and adds no number: every profile table is untouched, and
 * the day Story 8.18 authors per-line appetites those entries win outright
 * (the profile's own entry is still read first). Delete this map then.
 */
const APPETITE_FAMILY: Readonly<Partial<Record<EquipmentId, EquipmentId>>> = Object.freeze({
  lightTorpedo: 'heavyTorpedo',
  captiveMines: 'navalMines',
  foulingMines: 'navalMines',
});

/** How eager this profile is about one equipment id — the profile's own entry,
 *  else its FAMILY's entry (see APPETITE_FAMILY), else the neutral base. THE
 *  one resolver both consumers (the want() gates here, the slot ordering in
 *  tactics.ts) read, so an appetite entry always has at least the ordering as
 *  its consumer. */
export function appetiteFor(profile: BotProfile, id: EquipmentId): number {
  const family = APPETITE_FAMILY[id];
  return profile.appetite[id] ?? (family === undefined ? undefined : profile.appetite[family]) ?? BASE_APPETITE[id];
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

/**
 * ONE SLOT ITEM'S BOT TACTIC — the shape both axes share. A fitted slot may
 * hold a piece of EQUIPMENT (slots 0-4) or a CONSUMABLE stack (the belt, 5-8),
 * the two id spaces are disjoint, and each has its OWN registry keyed by its
 * OWN id (`EQUIPMENT_TACTICS` / `CONSUMABLE_TACTICS`) so neither record ever
 * grows a fake row. `tacticFor` is the one lookup that spans them, narrowing
 * through the shared guard rather than a cast — exactly the two-registry
 * discipline `slotRow` uses on the server side.
 */
export interface SlotTactic {
  readonly id: SlotItemId;
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

/** One equipment's bot tactic — the weapon axis. */
export interface EquipmentTactic extends SlotTactic {
  readonly id: EquipmentId;
}

/** One consumable line's bot tactic — the BELT axis (epic-8 amendment 49).
 *  Same shape, narrower id. */
export interface ConsumableTactic extends SlotTactic {
  readonly id: ConsumableId;
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
  reachU: (stats) => stats.equipment.gun.rangeU,
  // Blip shooting is a ruled skill (cycle 99): the gun takes NO persistence
  // gate and no doctrine gate — every legality question lives in solve().
  want: (ctx) => ctx.target !== null,
  solve: (ctx) => burstSolve(ctx, 'gun', ctx.sit.stats.equipment.gun.rangeU),
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
  if (t === null || t.heading === null) return null; // an unled ghost gets the gun
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
  // structural counter to a jamming buoy's fakes, which re-scatter wholesale
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

/** Is `aim` legal for this torpedo line? The HEAVY (and the supercav belt
 *  fish) fire into a bow SECTOR; the LIGHT fires into either BEAM and refuses
 *  the fore/aft dead zones — the server's own arc law (equipment/
 *  torpedoCore.ts `torpedoBearing`), read from the same shared descriptors. */
function torpedoAimLegal(id: TorpedoLineId | 'supercavTorpedo', heading: number, aim: number): boolean {
  if (id === 'lightTorpedo') return twinSectorSide(heading, aim, LIGHT_BEAMS) !== null;
  const sector = id === 'supercavTorpedo' ? SUPERCAV_SECTOR : BOW_SECTOR;
  return inArc(aim, wrapAngle(heading + sector.offset), sector.halfArc);
}

/** One torpedo shot solve, shared by both equipment lines and the supercav
 *  belt fish: lead at THIS weapon's speed, refuse out of THIS weapon's arc
 *  (ARC FIRST — an arc miss consumes nothing), refuse a blocked line. */
function solveTorpedoShot(
  ctx: TacticContext,
  id: TorpedoLineId | 'supercavTorpedo',
  speed: number,
  reachU: number,
): Shot | null {
  const t = ctx.target;
  if (t === null || t.heading === null) return null; // a return-grammar plot cannot be led
  if (distTo(ctx.sit, t) > reachU) return null;
  const p = aimPoint(ctx.mind, ctx.sit, t, speed);
  const aim = bearing(ctx.self.state, p);
  if (!torpedoAimLegal(id, ctx.self.state.heading, aim)) return null;
  if (!shotReaches(ctx.self, ctx.sit, p)) return null;
  return { aim, aimDist: distTo(ctx.sit, t), slot: ctx.slot };
}

/** ONE TORPEDO TACTIC, built per line (epic-8 amendment 79 — the light
 *  torpedo reuses the heavy's tactic keyed by its own id; Story 8.18 owns the
 *  real table). Everything that differs is the row and the arc. */
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

/** ONE MINE TACTIC, built per line (epic-8 amendment 79 — captive and fouling
 *  reuse the mine tactic keyed by their own ids; Story 8.18 owns the real
 *  table). The three racks share every chassis number, so only the want
 *  branches and the drop distance differ. */
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
  const lit = stats.equipment.starShells.litRadius * CONFIG.starShells.incendiaryRadiusFactor;
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
  const ss = ctx.sit.stats.equipment.starShells;
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
  const capMs = sit.stats.equipment.starShells.phosphor ? phosphorStaleCapMs(sit.stats) : Infinity;
  const floorMs = flareFloorUnderCap(sit.profile, capMs);
  let best: BotTrack | null = null;
  let bestD = Infinity;
  for (const t of tracksOf(ctx.mind)) {
    if (t.live || !isActionable(t, sit.now)) continue;
    const age = sit.now - t.seenAt;
    if (age < floorMs || age > capMs) continue;
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
  const t = offensiveFlareTarget(ctx) ?? sensorFlareTarget(ctx);
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
  const rb = ctx.sit.stats.equipment.radarBuoy;
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
// THE BOOST — the one ability: spent opening range on the way out. Story 8.9
// made it universal on slot 1 (+25 % of the ladder-raised cap for 10 s, 25 s
// reload), so every captain hull carries this tactic, not just the fast ones.
// ---------------------------------------------------------------------------

const boostTactic: EquipmentTactic = {
  id: 'boost',
  kind: 'ability',
  reachU: () => 0,
  want: (ctx) => ctx.posture === 'disengage' && appetiteFor(ctx.sit.profile, 'boost') >= APPETITE_NEUTRAL,
  solve: () => null,
};

// ---------------------------------------------------------------------------
// THE REGISTRY — PARTIAL over EquipmentId (Story 8.1), deep-frozen like the
// server's own EQUIPMENT registry, and keyed exactly like it: a weapon whose
// module does not exist cannot be fitted, so it needs no tactic. tactics.ts
// walks the bot's ACTUAL FITTED SLOTS, so a missing row is unreachable — and
// resolves fail-closed (the slot is skipped) if it ever were not.
// ---------------------------------------------------------------------------

const deepFreezeRows = <T extends object>(rows: T): Readonly<T> => {
  for (const key of Object.keys(rows) as (keyof T)[]) Object.freeze(rows[key]);
  return Object.freeze(rows);
};

export const EQUIPMENT_TACTICS: Readonly<Partial<Record<EquipmentId, EquipmentTactic>>> = deepFreezeRows({
  gun: gunTactic,
  heavyTorpedo: torpedoTactic,
  lightTorpedo: lightTorpedoTactic,
  navalMines: mineTactic,
  captiveMines: captiveMineTactic,
  foulingMines: foulingMineTactic,
  boost: boostTactic,
  broadside: broadsideTactic,
  starShells: starShellsTactic,
  radarBuoy: radarBuoyTactic,
});

// ---------------------------------------------------------------------------
// THE BELT AXIS (epic-8 amendment 49) — ONE ROW, DELIBERATELY.
//
// `HEAL_CHOICE` left the bot spend policy with the wire in Story 8.8, so
// without this a bot could draw and stock HULL REPAIR cards and never fire one
// until Story 8.18 builds the real consumable tactic table. The rule is the
// SAME threshold that used to buy the `5` key: a bot presses its stocked stack
// when its hull is under the profile's `healHpFrac`. Nothing else — no
// posture term, no appetite tier, no target read.
//
// STORY 8.18 STILL OWNS THE TABLE and may replace this row outright; it also
// retunes the spend SCORER, which is untouched here (a hurt bot still scores a
// HULL REPAIR card at the consumable kind base, not above it — ruled).
// ---------------------------------------------------------------------------

const hullRepairTactic: ConsumableTactic = {
  id: 'hullRepair',
  kind: 'ability',
  // Never pulls the engagement band: healing is not a reach.
  reachU: () => 0,
  // TWO THINGS THE BARE `hp / maxHp` READ GETS WRONG, both fixed at the review
  // gate rather than by retuning anything:
  //
  //   * THE PAID POOL IS HP ALREADY BOUGHT. `repairHp` is the last copy's
  //     second 50 hp, landing over 5 s. Reading `hp` alone reads the hull
  //     mid-payment, so a bot that fires at 120/350 sees 170 on the next tick
  //     and fires again for hp already on its way — a three-deep stack gone
  //     inside one pool's lifetime. Counting the pool asks the only question
  //     worth asking: where will this hull BE?
  //   * A SINKING HULL IS THE HUNGRIEST OF ALL. It reads 0/350 and the row
  //     would press every tick, at a slot the server always refuses (no hp
  //     comes back in the window — amendment 10). The driver drops non-afloat
  //     bots before they decide; this is the tactic's own guard, so a caller
  //     that reaches the brain another way cannot resurrect the behaviour.
  //
  // No new number and no new profile field: the threshold is still the
  // profile's existing `healHpFrac` (amendment 49's "minimal" rule).
  want: (ctx) =>
    isAfloat(ctx.self.lifecycle) &&
    ctx.sit.maxHp > 0 &&
    (ctx.sit.hp + ctx.self.repairHp) / ctx.sit.maxHp < ctx.sit.profile.healHpFrac,
  // Abilities ride the actSeq channel and solve no shot.
  solve: () => null,
};

/**
 * SUPERCAV TORPEDO — the belt's first SHOT row (Story 8.13, epic-8 amendments
 * 74/79: *"a bot holding SUPERCAV TORPEDO stock uses the torpedo tactic on its
 * belt slot"*). It is the torpedo tactic with three substitutions and nothing
 * else: the bow ±15° sector, the 195 u/s lead, and the straight-runner's
 * credible range (it never homes, so the gate never widens). A stack has no
 * stat row, so the speed comes from CONFIG exactly as the server's row reads
 * it. Story 8.18 still owns the real belt table.
 */
const supercavTorpedoTactic: ConsumableTactic = {
  id: 'supercavTorpedo',
  kind: 'shot',
  reachU: () => TORPEDO_CREDIBLE_U,
  want: (ctx) => ctx.target !== null && hasPersistence(ctx.target, ctx.sit.now),
  solve: (ctx) =>
    solveTorpedoShot(ctx, 'supercavTorpedo', CONFIG.supercavTorpedo.speed, TORPEDO_CREDIBLE_U),
};

/** The consumable half of the tactic registry — PARTIAL over ConsumableId,
 *  exactly as EQUIPMENT_TACTICS is partial over EquipmentId. A line with no row
 *  here is simply unknown to bots, and the slot is skipped fail-closed. */
export const CONSUMABLE_TACTICS: Readonly<Partial<Record<ConsumableId, ConsumableTactic>>> = deepFreezeRows({
  hullRepair: hullRepairTactic,
  supercavTorpedo: supercavTorpedoTactic,
});

/**
 * HOW EAGER A BOT IS ABOUT ONE BELT LINE. A profile still says nothing about
 * consumables (amendment 49 ships the minimal rule and no new tuning), so the
 * table is TOTAL over ConsumableId at the SAME neutral base an unlisted
 * equipment would sit at — which keeps the ranking stable and the tie-break on
 * slot index. It is a table rather than a constant so that SUPERCAV TORPEDO,
 * the first belt line with a shot tactic (amendment 74), has a declared entry
 * beside the rest; Story 8.18 is where any real belt tuning lands.
 */
const CONSUMABLE_APPETITE: Readonly<Record<ConsumableId, number>> = Object.freeze({
  hullRepair: APPETITE_NEUTRAL,
  shieldBlock: APPETITE_NEUTRAL,
  smokeScreen: APPETITE_NEUTRAL,
  chaff: APPETITE_NEUTRAL,
  decoyBuoy: APPETITE_NEUTRAL,
  depthCharge: APPETITE_NEUTRAL,
  supercavTorpedo: APPETITE_NEUTRAL,
});

function consumableAppetite(id: ConsumableId): number {
  return CONSUMABLE_APPETITE[id];
}

/** How eager this profile is about whatever a slot holds — the one resolver
 *  `rankedSlots` reads, spanning both id spaces through the shared guard. */
export function slotAppetite(profile: BotProfile, id: SlotItemId): number {
  return isConsumableId(id) ? consumableAppetite(id) : appetiteFor(profile, id);
}

/** THE ONE TACTIC LOOKUP FOR A FITTED SLOT — `slotRow`'s bot-side twin.
 *  Narrows through the shared guard (never a cast) and answers with whichever
 *  registry owns the id, or `undefined` when neither does. */
export function tacticFor(id: SlotItemId): SlotTactic | undefined {
  return isConsumableId(id) ? CONSUMABLE_TACTICS[id] : EQUIPMENT_TACTICS[id];
}
