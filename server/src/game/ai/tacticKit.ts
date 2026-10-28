// THE TACTIC KIT — the shared vocabulary every bot tactic row is written in.
//
// The tactic rows live in three files by what they drive: ai/equipment.ts
// (the weapons: gun, Q/E/R lines), ai/shift.ts (the three class Shifts) and
// ai/consumables.ts (the belt). ai/tacticRegistry.ts assembles them into the
// TOTAL registries tactics.ts reads. Everything more than one of those files
// needs lives HERE, so the imports flow one way and never cycle:
//
//   tacticKit  <-  equipment / shift / consumables  <-  tacticRegistry  <-  tactics
//
// (A cycle would read a `const` row before its module had evaluated it.)
//
// What lives here: the tactic types, the appetite resolver and thresholds,
// aiming (lead solve + scatter + the coastline check), the torpedo shot solve
// (shared by both torpedo lines and the SUPERCAV belt fish), the sector
// placement (mines and the buoys), the live-contact burst (PHOSPHOR
// SHELLS and the FOULING SHELL) with its astern-filtered pick, the HUNKER (was DAMAGE CUT until Story 9.9)
// cues (the Shift and SHIELD BLOCK) and the registry freezer.
//
// No rng is drawn anywhere in a want() — the mind's stream feeds aim scatter
// and nothing else (the determinism pin).

import {
  CONFIG,
  bearing,
  blockedWater,
  inArc,
  sectorArcFor,
  twinSectorArcFor,
  twinSectorSide,
  wrapAngle,
  type BuoyKind,
  type ConsumableId,
  type EffectiveStats,
  type EquipmentId,
  type Rng,
  type SlotItemId,
  type Vec2,
} from '@salvo/shared';
import type { BotMind, BotPosture, BotSelf, BotWorldPort } from './types.js';
import { isActionable, lineBlocked, plotAt, tracksOf, type BotSituation, type BotTrack } from './utility.js';
import type { BotProfile } from './profiles.js';
import { torpedoInbound } from './torpedoThreat.js';
import { TRACK_PERSIST_MS, trackVelocity } from './plot.js';
import { mountedReachOf } from './doctrine.js';

const TAU = Math.PI * 2;

/**
 * THE TORPEDO FAMILY ID UNION the parameterized torpedo tactic is keyed by
 * (Story 8.13). Declared HERE rather than imported from the server's equipment
 * modules because `ai/` is perception-gated — it may not import
 * `game/equipment/**` at all (the ESLint boundary, ai/types.ts) — and it is
 * only a narrowing of `EquipmentId`, so the compiler still refuses a string
 * that is not a real line id.
 */
export type TorpedoLineId = Extract<EquipmentId, 'heavyTorpedo' | 'lightTorpedo'>;

/** The HEAVY torpedo's bow sector, the LIGHT torpedo's TWIN beam sectors and
 *  the SUPERCAV consumable's narrow bow cone — resolved ONCE at module load
 *  from the single shared arc source the server rows enforce with, so a bot
 *  never solves a shot its own weapon refuses. */
const BOW_SECTOR = sectorArcFor('heavyTorpedo');
const LIGHT_BEAMS = twinSectorArcFor('lightTorpedo');
const SUPERCAV_SECTOR = sectorArcFor('supercavTorpedo');

/** u — the range inside which a STANDARD torpedo intercept is CREDIBLE. A 60
 *  u/s fish against a 45 u/s hull needs the target inside knife range or the
 *  lead solution is fiction; beyond this the tube is held. */
export const TORPEDO_CREDIBLE_U = 250;

// ---------------------------------------------------------------------------
// APPETITE — the ship profile's one word about an equipment.
// ---------------------------------------------------------------------------

/** Appetite thresholds. Appetite is how PROACTIVELY this captain reaches for
 *  an equipment: at or above EAGER the weapon is a standing plan; at or above
 *  NEUTRAL it is used reactively (when the situation demands); below NEUTRAL
 *  it is held for emergencies the tactic itself names (a mine on disengage
 *  answers a threat at ANY appetite). */
export const APPETITE_NEUTRAL = 1;
export const APPETITE_EAGER = 2;

/** The neutral eagerness for equipment a profile's table does not name. TOTAL
 *  over EquipmentId — the compile-time forcing function that a new line cannot
 *  land without an appetite. The GUNS are the deliberate exception: slot 0 is
 *  the always-available fallback whichever gun is mounted, so its base sits
 *  below everything else and it is tried LAST — the shipped ladder's ordering,
 *  expressed as data. The three class Shifts sit at the neutral base; a
 *  profile that wants one eagerly says so in ai/profiles.ts `appetite`. */
const BASE_APPETITE: Readonly<Record<EquipmentId, number>> = Object.freeze({
  gun: 0.5,
  machineGun: 0.5,
  flak: 0.5,
  boost: APPETITE_NEUTRAL,
  instantReload: APPETITE_NEUTRAL,
  hunker: APPETITE_NEUTRAL,
  lightTorpedo: APPETITE_NEUTRAL,
  heavyTorpedo: APPETITE_NEUTRAL,
  navalMines: APPETITE_NEUTRAL,
  captiveMines: APPETITE_NEUTRAL,
  foulingMines: APPETITE_NEUTRAL,
  broadside: APPETITE_NEUTRAL,
  starShells: APPETITE_NEUTRAL,
  phosphorShells: APPETITE_NEUTRAL,
});

/** How eager this profile is about one equipment id — the profile's own entry,
 *  else the neutral base. Every line a profile has an opinion about is written
 *  explicitly in ai/profiles.ts. THE one resolver both consumers (the want()
 *  gates, the slot ordering in tactics.ts) read, so an appetite entry always
 *  has at least the ordering as its consumer. */
export function appetiteFor(profile: BotProfile, id: EquipmentId): number {
  return profile.appetite[id] ?? BASE_APPETITE[id];
}

// ---------------------------------------------------------------------------
// THE TACTIC TYPES
// ---------------------------------------------------------------------------

/** A legal shot request: one slot, one bearing, one commanded distance. */
export interface Shot {
  aim: number;
  aimDist: number;
  slot: number;
  /** A LEVEL shot (Story 8.15): the machine gun streams while `held` is true
   *  and ignores a click, so the brain sends `held` and NO fireSeq edge. */
  held?: true;
}

/** How a tactic's output reaches the world: a 'shot' needs a target and is
 *  resolved BELOW chooseShot's target guard; a 'placement' (flare / mine /
 *  decoy) is resolved ABOVE it — a placement's own want() decides whether it
 *  needs a target; an 'ability' rides the actSeq channel (chooseAct). */
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
 * ONE SLOT ITEM'S BOT TACTIC — the shape every row shares. A fitted slot may
 * hold a piece of EQUIPMENT (slots 0-4) or a CONSUMABLE stack (its kind's fixed slot, 5-10),
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
   *  nothing else. Must draw no rng and write nothing. */
  want(ctx: TacticContext): boolean;
  /** The legal shot, or null (an arc/range/water/doctrine refusal — nothing
   *  consumed). Ability rows always return null. */
  solve(ctx: TacticContext): Shot | null;
}

/** One equipment's bot tactic — the weapon axis (and the Shift slot). */
export interface EquipmentTactic extends SlotTactic {
  readonly id: EquipmentId;
}

/** One consumable line's bot tactic — the BELT axis (epic-8 amendment 49).
 *  Same shape, narrower id. */
export interface ConsumableTactic extends SlotTactic {
  readonly id: ConsumableId;
}

/** Freeze every row, then the table — the registries are deep-frozen like the
 *  server's own EQUIPMENT registry. */
export const deepFreezeRows = <T extends object>(rows: T): Readonly<T> => {
  for (const key of Object.keys(rows) as (keyof T)[]) Object.freeze(rows[key]);
  return Object.freeze(rows);
};

// ---------------------------------------------------------------------------
// AIMING — one lead solve, one scatter, one place.
// ---------------------------------------------------------------------------

/** Fixed-point iterations for the intercept solve (converges well inside 3). */
const LEAD_ITERATIONS = 3;

/**
 * The lead-corrected intercept point for a track at `speed` u/s of ordnance,
 * solved from where the plot should be NOW (ai/plot.ts `predictedPos` — the
 * last-known position dead-reckoned on its course since the last refresh)
 * with its course (`trackVelocity` — the disclosed pose, else the bot's
 * estimate from the wake or a paint pair; cycle 165: "course feeds every
 * weapon", Eric 2026-10-02). Only a COURSE-LESS plot cannot be led at all,
 * so its last-known point IS the aim point. A live sighting was refreshed
 * this tick, so its prediction is its position and the solve is the old one.
 */
export function leadPoint(sit: BotSituation, t: BotTrack, speed: number): Vec2 {
  const base = plotAt(sit, t);
  const v = trackVelocity(t);
  if (v === null) return base;
  let tof = 0;
  for (let i = 0; i < LEAD_ITERATIONS; i += 1) {
    const px = base.x + v.vx * tof;
    const py = base.y + v.vy * tof;
    tof = Math.hypot(px - sit.x, py - sit.y) / speed;
  }
  return { x: base.x + v.vx * tof, y: base.y + v.vy * tof };
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
export function aimPoint(mind: BotMind, sit: BotSituation, t: BotTrack, speed: number): Vec2 {
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
export function shotReaches(self: BotSelf, sit: BotSituation, p: Vec2): boolean {
  return !lineBlocked(self.state, p, sit.islands);
}

/** u — the distance to a plot's PREDICTED point (utility.ts plotAt — cycle
 *  165 review, B4): every range, band and placement check reads the same
 *  point the lead solve starts from. Identical to the raw distance for a live
 *  sighting or a course-less plot. */
export function distTo(sit: BotSituation, t: BotTrack): number {
  const p = plotAt(sit, t);
  return Math.hypot(p.x - sit.x, p.y - sit.y);
}

// ---------------------------------------------------------------------------
// THE TORPEDO SHOT — both torpedo lines and the SUPERCAV belt fish.
// ---------------------------------------------------------------------------

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
export function solveTorpedoShot(
  ctx: TacticContext,
  id: TorpedoLineId | 'supercavTorpedo',
  speed: number,
  reachU: number,
): Shot | null {
  const t = ctx.target;
  if (t === null || trackVelocity(t) === null) return null; // a course-less plot cannot be led
  // Range is gated on where the plot should be NOW, not its stale paint.
  const d = distTo(ctx.sit, t);
  if (d > reachU) return null;
  const p = aimPoint(ctx.mind, ctx.sit, t, speed);
  const aim = bearing(ctx.self.state, p);
  if (!torpedoAimLegal(id, ctx.self.state.heading, aim)) return null;
  if (!shotReaches(ctx.self, ctx.sit, p)) return null;
  return { aim, aimDist: d, slot: ctx.slot };
}

// ---------------------------------------------------------------------------
// PLACEMENTS AND BURSTS shared across axes.
// ---------------------------------------------------------------------------

/** A drop commanded at the centre of the given ratified placement sector —
 *  so arc and range pass by construction and only the water can refuse
 *  (`blockedWater` is the SAME predicate the equipment rows deny with). The
 *  mines drop this way; the buoys try it bearing by bearing (ringPlacement). */
/** The ring solver's bearing step (rad) — twelve candidate bearings round
 *  the hull. A sampling resolution, not a gameplay dial. */
const RING_STEP = Math.PI / 6;

/**
 * THE FULL-CIRCLE drop (Story 10.9, ruling 9 — the buoys' 360° arc): the
 * first WATER-LEGAL point at `dropU` (the full placeRange), trying dead
 * astern first (the mine's sector centre, `CONFIG.mine.offset` — where the
 * DECOY BUOY always dropped) and then fanning out alternately port and
 * starboard round the whole circle; null when every candidate is ashore or
 * off the disk. Range passes by construction; only the water can refuse
 * (`blockedWater`, the equipment row's own predicate).
 */
export function ringPlacement(ctx: TacticContext, dropU: number): Shot | null {
  const steps = Math.round((2 * Math.PI) / RING_STEP);
  for (let i = 0; i < steps; i++) {
    const k = Math.ceil(i / 2) * (i % 2 === 0 ? 1 : -1);
    const shot = sectorPlacement(ctx, { offset: CONFIG.mine.offset + k * RING_STEP }, dropU);
    if (shot !== null) return shot;
  }
  return null;
}

export function sectorPlacement(
  ctx: TacticContext,
  sector: { offset: number },
  dropU: number,
): Shot | null {
  const aim = wrapAngle(ctx.self.state.heading + sector.offset);
  const p = { x: ctx.sit.x + Math.cos(aim) * dropU, y: ctx.sit.y + Math.sin(aim) * dropU };
  if (blockedWater(p, ctx.port.map.islands, ctx.port.map.radius)) return null;
  return { aim, aimDist: dropU, slot: ctx.slot };
}

/** The nearest LIVE, actionable track inside our own truesight bubble — the
 *  target the PHOSPHOR SHELLS row and the engaging FOULING SHELL row burst
 *  on. `keep` narrows the candidates (the astern pick below); the default
 *  keeps every track. */
export function nearestLiveInSight(ctx: TacticContext, keep: (t: BotTrack) => boolean = () => true): BotTrack | null {
  let best: BotTrack | null = null;
  let bestD = Infinity;
  for (const t of tracksOf(ctx.mind)) {
    if (!t.live || !isActionable(t, ctx.sit.now) || !keep(t)) continue;
    const d = distTo(ctx.sit, t);
    if (d > ctx.sit.stats.sightRange) continue;
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  return best;
}

/** The nearest LIVE, actionable track inside sight that lies ASTERN of the
 *  bot (Story 9.4, amendment 65 — the disengaging FOULING SHELL's pick):
 *  "astern" = the contact's bearing from the bot is more than 90° off the
 *  bot's heading (behind the beam), read at the plot's predicted point like
 *  every other range check. */
export function nearestLiveAstern(ctx: TacticContext): BotTrack | null {
  return nearestLiveInSight(ctx, (t) => isAstern(ctx, t));
}

/** Is this track behind the bot's beam? |wrap(bearing − heading)| > 90°. */
function isAstern(ctx: TacticContext, t: BotTrack): boolean {
  const off = wrapAngle(bearing(ctx.self.state, plotAt(ctx.sit, t)) - ctx.self.state.heading);
  return Math.abs(off) > Math.PI / 2;
}

/** A burst placed ON a live contact (no lead — the zone is an area), clamped
 *  to `rangeU`, coastline-gated on the shot. The target defaults to the
 *  nearest live contact in sight; a row with its own pick passes it. */
export function burstOnLiveContact(ctx: TacticContext, rangeU: number, target: BotTrack | null = nearestLiveInSight(ctx)): Shot | null {
  const t = target;
  if (t === null) return null;
  const d = distTo(ctx.sit, t);
  if (d > rangeU) return null;
  if (!shotReaches(ctx.self, ctx.sit, t)) return null;
  return { aim: bearing(ctx.self.state, plotAt(ctx.sit, t)), aimDist: d, slot: ctx.slot };
}

// ---------------------------------------------------------------------------
// HOSTILE READS (Story 9.13, amendment 199) — the trigger extensions' cues.
// ---------------------------------------------------------------------------

/** Is this track a HOSTILE worth a defensive press: a captain (a sighted PvE
 *  fleet hull is neutral — the captive-mine precedent; an unclassed paint is
 *  assumed a captain), not a wreck, past the reaction gate, and LIVE or
 *  refreshed within one base sweep revolution (a fresh paint)? */
export function isFreshHostile(t: BotTrack, now: number): boolean {
  if (t.sunk || t.fleet || !isActionable(t, now)) return false;
  return t.live || now - t.seenAt <= TRACK_PERSIST_MS;
}

/** Any fresh hostile track whose predicted plot lies within `reachU`?
 *  `keep` narrows the candidates (the radar-only chaser read below). */
export function anyHostileWithin(
  ctx: TacticContext,
  reachU: number,
  keep: (t: BotTrack) => boolean = () => true,
): boolean {
  for (const t of tracksOf(ctx.mind)) {
    if (!isFreshHostile(t, ctx.sit.now) || !keep(t)) continue;
    if (distTo(ctx.sit, t) <= reachU) return true;
  }
  return false;
}

/** Any fresh hostile inside the MOUNTED gun's reach (amendment 199's "a
 *  hostile in weapon reach"; `effectiveReach.maxU`). */
export function anyHostileInReach(ctx: TacticContext, reachU: number = mountedReachOf(ctx).maxU): boolean {
  return anyHostileWithin(ctx, reachU);
}

/** A RADAR CHASER (amendment 199): a fresh hostile PLOT — painted, not in
 *  sight — inside own radar range. */
export function radarChaser(ctx: TacticContext): boolean {
  return anyHostileWithin(ctx, ctx.sit.stats.radarRange, (t) => !t.live);
}

/**
 * Is this track MOVING AWAY from the bot (amendment 199 — the pursuing
 * FOULING SHELL's pick)? Its course (disclosed or estimated) points more than
 * 90° off the bearing from it to us: v · (self − plot) < 0. A course-less or
 * stopped track is not fleeing.
 */
export function movingAway(sit: BotSituation, t: BotTrack): boolean {
  const v = trackVelocity(t);
  if (v === null || (v.vx === 0 && v.vy === 0)) return false;
  const p = plotAt(sit, t);
  return v.vx * (sit.x - p.x) + v.vy * (sit.y - p.y) < 0;
}

/** At or above the profile's break-off line (a HEALTHY bot, amendment 199's
 *  declined-fight clause). */
export function healthy(sit: BotSituation): boolean {
  return sit.maxHp > 0 && sit.hp / sit.maxHp >= sit.profile.disengageHpFrac;
}

/** Is one of the bot's OWN buoys of `kind` on the water (Story 10.9 — the
 *  DECOY BUOY's `ownDecoyLive`, now per kind)? The owner is always sent its
 *  own (`DecoyView.own`, the decoy row's owner-always clause), and every view
 *  carries `kind`. */
export function ownBuoyLive(mind: BotMind, kind: BuoyKind): boolean {
  return mind.view?.decoys.some((d) => d.own && d.kind === kind) ?? false;
}

/** THE HARNESS STAMP (Story 9.13): record the tactic row that produced a shot
 *  on the mind's `lastTactic` seat and hand the shot through. A null shot
 *  stamps nothing. */
export function stamped(ctx: TacticContext, row: string, shot: Shot | null): Shot | null {
  if (shot !== null) ctx.mind.lastTactic = row;
  return shot;
}

/** Postures in which HUNKER / SHIELD BLOCK also fire with a hostile in weapon
 *  reach (amendment 199): pursuing, kiting, fleeing, hiding. */
const REACH_GUARD_POSTURES: readonly BotPosture[] = ['pursue', 'kite', 'disengage', 'hide'];

/** The last seconds before a ram (amendment 199): the ram posture with its
 *  target inside `CONFIG.bots.ramReachU`. */
function preRam(ctx: TacticContext): boolean {
  return ctx.posture === 'ram' && ctx.target !== null && distTo(ctx.sit, ctx.target) <= CONFIG.bots.ramReachU;
}

/**
 * THE HUNKER CUES (amendment 115, extended by amendment 199) — (a) ENGAGED IN
 * COMBAT: the bot's own `engage` posture, with a target; (b) a seen enemy
 * torpedo inbound on a collision line within 150 u (ai/torpedoThreat.ts);
 * (c) the last seconds before a ram; (d) pursuing, kiting, fleeing or hiding
 * with ANY fresh hostile inside the mounted gun's reach. Shared by the HUNKER
 * Shift and the SHIELD BLOCK belt row (amendment 124(g)).
 */
export function hunkerCues(ctx: TacticContext): boolean {
  if (ctx.posture === 'engage' && ctx.target !== null) return true;
  if (torpedoInbound(ctx.self, ctx.mind, ctx.sit.now)) return true;
  if (preRam(ctx)) return true;
  return REACH_GUARD_POSTURES.includes(ctx.posture) && anyHostileInReach(ctx);
}
