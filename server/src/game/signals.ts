// The SIGNAL REGISTRY — one declarative home per spatial signal (Story 1.1).
// Every channel that can put per-observer spatial knowledge into a frame is a
// row here: the 19 GameEvent kinds plus the seven contact-like frame channels
// (`contact`, `mine`, `litzone`, `burnzone`, `foulzone`, `decoy` and `cloud`
// — pseudo event types: not GameEvents, but the invariant suite iterates them
// like everything else; the RADAR BUOY's `buoy` channel was deleted with the
// buoy in Story 8.16 and the DECOY BUOY's `decoy` channel took its seat,
// revealed at sight like a ship; the SMOKE SCREEN's `smoke` channel joined in
// Story 8.18 and became the MULTI-SPECTRAL COUNTERMEASURE's `cloud` channel
// in Story 9.3; the FOULING SHELL's `foulzone` channel joined in Story 9.4 on
// the burn zone's gate). FOG IS NOT A CHANNEL (Story 9.10, Eric 2026-10-15):
// the fog field is public weather both sides derive from the welcome seed
// and the schema cut; it reaches perception only as the TOLL inside the
// sight predicates (`withinSight` below) — nothing per-observer about fog
// ever rides a frame, and the declared exceptions stay at SIX.
// perception.ts's observe()/observeSpectator() are the ONLY callers of a row's
// visible()/materialize(); nothing spatial leaves the server outside a row.
//
// THE SIGHT RULE (one rule for everything OPTICAL): a point is SIGHT-clear
// from the observer iff the segment observer→point crosses no island
// COASTLINE (losClear: islandBlocksSegment — bounding-circle broadphase,
// `core` early-out, then the exact polygon test). `sightClear` is the ONE
// predicate every sight-tier site calls — contacts, shells, booms, spawns,
// sinks, the mz/sm halos, the foghorn muffle and in-bubble torpedo water.
// THE FOG TOLL (Story 9.10, epic-9 amendments 149–150 / 163–170): every
// sight-RANGE comparison on those same sites goes through `withinSight`,
// which adds the ray's fog toll (`SightField.fogToll` — the World's
// `fogTollAlong`, the shared field's midpoint march; observer-first, since
// amendment 179 the observer's own solid bank is free) to its length before
// comparing against the range — fog never widens anything, so the plain
// range test rejects first and the march runs only inside geometric range.
// Radar, zone circles, the foghorn and the storm never read the field.
// ALL island-geometry branching stays inside losClear: no visible()/
// materialize() row may iterate polygon edges itself, or the rows blow the
// ESLint complexity ceiling. THE ONE EXCEPTION (Story 4.11, amendment 179):
// the RADAR blip gate's occlusion term is the shared height-aware shadow
// march (visibilityTo over the height raster) rather than binary island LOS —
// see blipGate.
//
// A MULTI-SPECTRAL COUNTERMEASURE cloud HIDES NOTHING (Story 9.3 session 2,
// Eric ruling 2026-10-12: "rather than fucking with whether I can see
// something, just draw it on top of ships"): it is a CLIENT VISUAL OVERLAY.
// The server only places and times it and delivers {id,x,y,t0} through the
// `cloud` row; no sight, flare, radar or wake gate reads a cloud. (History:
// Story 8.18's smoke and cycle 174's pixel cloud blocked sight and radar —
// both rules are retired.)
//
// Rows see a NARROW SignalContext (the ActivationContext pattern from
// equipment/index.ts) — the observer's ship record, tick time, islands for LOS,
// and the ships map for victim/wreck lookups — never a Colyseus type. The
// `mode` discriminator lets one row serve both the fogged observe() path and
// the unfogged observeSpectator() path; fogged rows never relax fog.
//
// KEY INSERTION ORDER IS LOAD-BEARING: frames go out via msgpack, and JSON/
// msgpack key order follows object insertion order. Every materialize() below
// builds its wire object in the exact historical field order (Contact:
// id,x,y,heading,speed,cls; BallisticEvent: k,id,x,y,vx,vy,t; stripped boom:
// k,id,x,y; MineView: id,x,y,own,by,c (the kind rides EVERY row since cycle
// 162, PV 68); LitZoneView, BurnZoneView and FoulZoneView (Story 9.4):
// id,x,y,r,until,by (the lit zone's `phos`/`daz` tail is DELETED, Story
// 8.17); CloudView: id,x,y,t0 (Story 9.3 — 8.18's SmokeView seat); SplashEvent/HitCallEvent: k,id,x,y;
// MuzzleEvent: k,x,y — Story 4.3; SmokeEvent: k,x,y,tier — Story 4.4;
// FoghornEvent: k,h then self? (honker) / x,y (spectator) / b,v (fogged
// listener) — Story 4.5; SunkEvent: k,id,by?,seen? — the public
// register, absent keys OMITTED). Do not reorder keys — `by` (Story 1.12) is
// appended LAST on mine and on both zone views, so the historical prefix
// stays byte-stable.

import {
  CONFIG,
  bearing,
  isAfloat,
  isSinking,
  islandBlocksSegment,
  paintCoverage,
  visibilityTo,
  wrapAngle,
  wrapPositive,
  type BallisticEvent,
  type BlipEvent,
  type BoomEvent,
  type BurstEvent,
  type Contact,
  type DamageEvent,
  type DecoyView,
  type FoghornEvent,
  type GameEvent,
  type GhostPaint,
  type HealEvent,
  type HeightRaster,
  type HitCallEvent,
  type HullCoverage,
  type HullId,
  type Island,
  type LitZoneView,
  type BurnZoneView,
  type FoulZoneView,
  effectiveSight,
  type MineView,
  type MuzzleEvent,
  type BoonFitEvent,
  type DropEvent,
  type PointEvent,
  type ShellState,
  type SmokeEvent,
  type SpawnEvent,
  type SplashEvent,
  type SunkEvent,
  type TorpedoUpdateEvent,
  type Vec2,
  paintSegmentCoverage,
  cloudOutlineRadius,
  dropoutPaints,
  type CloudView,
  type WakeBlipEvent,
  type WakeRibbon,
} from '@salvo/shared';
import type { BurnZone, FoulZone, LitZone, ShipRecord, StoredCloud } from './world.js';
import { isFleetHull, isParticipant } from './participants.js';
import type { MineState } from './equipment/index.js';
import type { DecoyState } from './decoys.js';

// ---------------------------------------------------------------------------
// The narrow per-observer context rows receive (imitates equipment's
// ActivationContext).
// ---------------------------------------------------------------------------

interface SignalContextBase {
  /** The observing client's id (== its ship id whenever it has a ship). */
  observerId: string;
  /** Server time this tick (ms) — stamped on blips and ballistic reveals. */
  now: number;
  /** Island landmasses for the one LOS rule (bounding circle + coastline). */
  islands: readonly Island[];
  /** The map's quantized height raster + max-height pyramid — the radar blip
   *  gate's ONLY occlusion input (Story 4.11: the shared shadow march). The
   *  raster alone rides the context, never the whole GameMap (the narrow-
   *  context principle above); no other row may read it — every optical
   *  sensor keeps binary island LOS through `islands`. */
  readonly heightRaster: HeightRaster;
  /** Ship records by id — victim/wreck lookups (boom stripping, sunk gating). */
  ships: ReadonlyMap<string, ShipRecord>;
  /** All ACTIVE star-shell lit zones (Story 1.7) — the owned-zone truesight
   *  source (ownZoneCovers) and the litzone row's scan subjects. */
  litZones: ReadonlyMap<string, LitZone>;
  /** All ACTIVE phosphor burning zones (Story 8.17) — the burnzone row's
   *  scan subjects and NOTHING else: no reveal source reads them (a burning
   *  zone is a hazard, not a light — amendment 131). */
  burnZones: ReadonlyMap<string, BurnZone>;
  /** All ACTIVE FOULING SHELL foul zones (Story 9.4) — the foulzone row's
   *  scan subjects and NOTHING else: no reveal source reads them (a foul
   *  zone is a slow patch, not a light — amendment 63). */
  foulZones: ReadonlyMap<string, FoulZone>;
  /** All LIVE decoy buoys (Story 8.16) — the `decoy` frame channel's scan
   *  subjects and the anonymous decoy-paint sources (decoyRadarBlips). Rides
   *  the context like litZones does. */
  decoys: ReadonlyMap<string, DecoyState>;
  /** Every LIVE MULTI-SPECTRAL COUNTERMEASURE cloud this tick (Story 9.3 —
   *  World.clouds, snapshotted by perception per observer pass): the `cloud`
   *  channel's scan subjects and NOTHING else — a cloud occludes no sensor
   *  (Eric 2026-10-12: it is a client overlay). Rides both paths uniformly. */
  readonly clouds: readonly StoredCloud[];
  /** THE FOG TOLL on a ray (Story 9.10 — `World.fogTollAlong` bound by
   *  perception.ts): the extra sight distance a ray A → B pays crossing the
   *  fog field right now, read by every sight-range comparison through
   *  `withinSight` (`fogCostTo`). Rides both paths uniformly; the spectator
   *  path never calls it (spectators are unfogged). Never a radar input
   *  (amendment 163). */
  readonly fogToll: (ax: number, ay: number, bx: number, by: number) => number;
  /** Ship id → stable per-match track id (World.pseudonymFor — the server-
   *  private stream; see World.trackIds for the honest correlation bound).
   *  The `return` blip payload carries no id at all (amendment 152), so no
   *  row consults this today — it rides the context so identity resolution
   *  stays one seam for any future row that needs it. */
  pseudonymOf(shipId: string): string;
  /**
   * Has PvE fleet hull `fleetShipId` acquired `observerId`? (Story 5.6,
   * amendment 40 — FleetController.isTargeting.) The ONE input to the
   * self-private `Contact.aggro` mark, read by the contact row and by
   * NOTHING else. It is not a perception gate: it never decides whether a
   * contact exists, only whether an already-visible contact carries one more
   * attribute for the one observer the answer is about.
   */
  aggroAt(fleetShipId: string, observerId: string): boolean;
  /** EVERY live wake ribbon (Story 4.12 — World.wakeRibbons: ships' active
   *  ribbons, running torpedoes', and detached water still ageing out). The
   *  wake scan's subject list, riding the context the way the height raster
   *  does. Inert on the spectator path (spectators get no radar). */
  readonly wakes: readonly WakeRibbon[];
  /**
   * THE RADAR DROPOUT ROLL'S SEED (Story 9.8, rulings 121–123 —
   * `World.dropoutSeed`): the world-level term of the stateless per-
   * revolution hash `dropoutPaints(d, seed, observer, target, rev)`.
   * SERVER-PRIVATE — derived from the per-room pseudonym entropy, never the
   * client-known map seed: a client that could replay the roll could test
   * which known hull a missed or delivered anonymous paint could have been.
   * Read by the four radar gates (blipGate — ship blips and decoy paints —
   * wakeGate's radar half and the cloud's radar clause) and nothing else.
   */
  readonly dropoutSeed: number;
  /**
   * The dropout roll's TARGET KEY for a wake ribbon (Story 9.8 —
   * `World.wakeKeyOf`): the id of the water's SOURCE (the ship's id for a
   * hull's ribbon, active or detached; the torpedo's shell id for fish
   * water). Server-private; never on the wire.
   */
  wakeKeyOf(r: WakeRibbon): string;
}

/** The fogged observe() path: rows apply full fog-of-war. observe() fail-closes
 *  before any row runs when the observer has no ship, so `me` is always set. */
export interface FoggedSignalContext extends SignalContextBase {
  mode: 'fogged';
  me: ShipRecord;
}

/** The unfogged observeSpectator() path (dead-in-active or finished phase —
 *  gated by frames.ts, never here). `me` is the spectator's ship record when
 *  one still exists (it carries the ballistic reveal memory); a client with no
 *  record gets no ballistic reveals (fail-closed). */
export interface SpectatorSignalContext extends SignalContextBase {
  mode: 'spectator';
  me: ShipRecord | undefined;
}

export type SignalContext = FoggedSignalContext | SpectatorSignalContext;

// ---------------------------------------------------------------------------
// SignalSpec — one registry row.
// ---------------------------------------------------------------------------

/**
 * One spatial signal, declaratively: may THIS observer perceive the subject,
 * and what exact wire shape does it receive. `S` is the row's subject (a
 * world-emitted GameEvent for forwarded kinds; a live ShipRecord / ShellState /
 * MineState for the scan-driven channels); `O` is the materialized wire shape.
 * materialize() is only ever called after visible() passes.
 *
 * THE `counterIntel` SEAM IS DELETED (Story 7-5 wave 2): the decoy buoy's
 * radar-double lie was its only implementer and its only caller. CHAFF's
 * server-generated fakes (Story 8.16) and their perception carve-out were
 * retired with the CHAFF line (Story 9.2, epic-9 amendment 31): no false
 * signal leaves perception today.
 */
export interface SignalSpec<S = unknown, O = unknown> {
  /** Registry key: a GameEvent `k`, or a pseudo-type for a non-event frame
   *  channel (`contact` / `mine` / `litzone`). */
  readonly eventType: string;
  /** The fog-of-war predicate — the anti-cheat gate for this signal. */
  visible(ctx: SignalContext, subject: S): boolean;
  /** Wire-shape the subject for this observer. KEY ORDER IS LOAD-BEARING. */
  materialize(ctx: SignalContext, subject: S): O;
}

// ---------------------------------------------------------------------------
// Shared predicates (the vision math every row builds on).
// ---------------------------------------------------------------------------

/**
 * True iff the segment a→b crosses no island coastline — THE sight rule's
 * occlusion (sightClear below is this from the observer's own state). The
 * flare has NO island term at all — see ownZoneCovers.
 *
 * THE ANTI-CHEAT CHOKEPOINT: this must stay EXACT — an approximation that
 * over-blocks hides a contact the observer has earned, one that under-blocks
 * leaks a contact behind land. `islandBlocksSegment` is exact (its bounding-
 * circle broadphase and `core` early-out only skip work in cases whose answer
 * is already decided), and it is the ONLY island-geometry branching on this
 * path — every visible()/materialize() row delegates here rather than
 * iterating polygon edges, which is what keeps those rows under ESLint
 * complexity 10.
 */
export function losClear(a: Vec2, b: Vec2, islands: readonly Island[]): boolean {
  for (const isle of islands) {
    if (islandBlocksSegment(a, b, isle)) return false;
  }
  return true;
}

/**
 * THE sight predicate: may observer `me` see point `b` optically? Iff no
 * island coastline lies on the segment (losClear from the observer's own
 * state). Every sight-tier gate calls this — the contact row, pointSighted,
 * pointDetected, shipSees, the mz/sm halos, the foghorn muffle and in-bubble
 * torpedo water (wakeGate's sight clause). No cloud term (Story 9.3 session
 * 2, Eric 2026-10-12: the countermeasure is a client overlay — cycle 174's
 * pixel occlusion and Story 8.18's smoke clamp are retired). No fog term
 * EITHER: fog is a RANGE cost, not an occluder — it lives in `withinSight`
 * beside this, never here (a fully fogged ray is still island-clear). Takes
 * the RECORD, not a Vec2, so every caller threads the observer's own state
 * the same way.
 */
export function sightClear(me: ShipRecord, b: Vec2, islands: readonly Island[]): boolean {
  return losClear(me.state, b, islands);
}

/**
 * THE SIGHT FIELD (Story 9.10): everything a sight-range comparison reads
 * besides the observer — the islands for LOS and the fog toll thunk.
 * `SignalContextBase` satisfies it structurally, so every row passes its
 * `ctx`; the PvE drones (drones.ts) build one per tick from the World,
 * because they never hold a SignalContext.
 */
export interface SightField {
  readonly islands: readonly Island[];
  readonly fogToll: (ax: number, ay: number, bx: number, by: number) => number;
}

/** The fog toll on the ray me → p (Story 9.10): the field's thunk — the
 *  World's `fogTollAlong` (shared sim/fog.ts owns the math; the invariant
 *  oracle re-integrates the shared density numerically by design). THE one
 *  entry of the fog cost into perception — nothing else derives it. The
 *  observer is ALWAYS the ray's A end: since amendment 179 the toll is
 *  directional (an observer standing in solid fog pays nothing inside that
 *  bank — "see out of it normally"), so no caller may swap the ends. */
function fogCostTo(field: SightField, me: ShipRecord, p: Vec2): number {
  return field.fogToll(me.state.x, me.state.y, p.x, p.y);
}

/**
 * THE one sight-RANGE comparison (Story 9.10, amendments 164, 167): is
 * point `p` within `range` of the observer once the ray's fog toll is added
 * to its length — `d + fogCostTo ≤ range`, boundary inclusive. The plain
 * squared test runs FIRST and rejects anything beyond geometric range before
 * any march (fog never widens sight) — written `!(d2 <= r²)` so a non-finite
 * range REJECTS (fail-closed: a NaN range sees nothing, never everything).
 * With no fog the toll thunk answers 0 without a march (the World's cut
 * gate), so the pre-fog gates are byte-identical. Every sight-tier range
 * site calls this — the contact row, pointSighted, pointDetected, shipSees,
 * discSighted (to the nearest rim point), the mz/sm halos and wakeGate's
 * in-bubble torpedo-water clause. Radar's annulus boundary
 * (`inRadarAnnulus`, `wakeInnerBound`) stays the plain geometric `sightOf`
 * — a hull fog hides inside the bubble is dark to BOTH sensors
 * (amendment 163).
 */
function withinSight(field: SightField, me: ShipRecord, p: Vec2, range: number): boolean {
  const dx = p.x - me.state.x;
  const dy = p.y - me.state.y;
  const d2 = dx * dx + dy * dy;
  if (!(d2 <= range * range)) return false;
  const toll = fogCostTo(field, me, p);
  if (toll <= 0) return true;
  return Math.sqrt(d2) + toll <= range;
}

/**
 * The observer's EFFECTIVE sight radius this tick: the SHARED `effectiveSight`
 * (sim/sight.ts) over its stats — today simply the derived `sightRange`,
 * since nothing in the game scales sight at runtime any more. HISTORY: the
 * FLASH SHELLS dazzle (Story 8.17, amendment 132) once collapsed it to 1/8 of
 * intel range through a second argument; Story 9.4 replaced that consumable
 * with the FOULING SHELL, whose zone slows props and never touches sight, so
 * the argument and the mark are gone (and Story 9.3 had already removed the
 * 8.18 in-smoke argument — a cloud never scales sight). THE one place the
 * sight RADIUS enters perception — every sight-tier predicate below and
 * every derived rung (detect, the annulus boundary, the wake inner bounds)
 * calls this, so a future sight modifier lands in the shared function and
 * nowhere else. FOG (Story 9.10) does NOT scale this radius: it is a toll
 * on the RAY, added in `withinSight` — which is why the radar annulus, which
 * reads this radius directly, is fog-blind by construction (amendment 163).
 * Never re-derived here: one derivation, both sides.
 */
export function sightOf(me: ShipRecord): number {
  return effectiveSight(me.stats);
}

/**
 * "Can `me` see `other`'s hull centre right now?" — the contact row's own
 * predicate, minus the lit-zone term, hoisted for reuse by the PvE fleet AI
 * (Story 5.6). Exported deliberately rather than re-derived there: a second
 * hand-rolled copy of the sight tier is exactly the desync class this file
 * exists to prevent, and `observe()` is the wrong tool for a fleet ship (it is
 * eight full scans, it allocates a SignalContext, and it MUTATES observer
 * state — seenBallistics/torpDirs — so it cannot be called speculatively).
 *
 * The lit-zone term is deliberately absent: a star shell is a captain's tool
 * for revealing hulls to CAPTAINS, and letting it also hand the AI free vision
 * would make firing one actively dangerous in a way nobody ruled on. No
 * cloud term (Story 9.3 session 2: a countermeasure cloud hides nothing).
 * FOGGED like a captain (Story 9.10, amendment 168): the field's banks toll
 * the ray through `withinSight`, so a drone loses its target, its witness
 * view and its shot inside fog by the same rule a client does; the
 * shot-from chase (amendment 139) never calls this and is untouched.
 */
export function shipSees(me: ShipRecord, other: ShipRecord, field: SightField): boolean {
  return withinSight(field, me, other.state, sightOf(me)) && sightClear(me, other.state, field.islands);
}

/** Sight-tier test for a point: within the OBSERVER'S effective sight range
 *  (inclusive — sightOf, fog-tolled through withinSight) + SIGHT-clear
 *  (island LOS). Takes the ShipRecord so the sightRange boons apply to every
 *  point-sighted gate (ballistics, mines, booms, wrecks, spawns) uniformly. */
function pointSighted(me: ShipRecord, p: Vec2, field: SightField): boolean {
  return withinSight(field, me, p, sightOf(me)) && sightClear(me, p, field.islands);
}

/**
 * DETECT-tier test for a point (Story 4.9, amendments 119/121): the 4/12 rung
 * since Story 9.8 (`detectFactor` 1, so detect = sight on the twelfths ruler) —
 * within `sightOf(me) * CONFIG.vision.detectFactor` (inclusive) +
 * LOS-clear. pointSighted's SIBLING, never a narrowing of it: exactly THREE
 * rows ride this gate — mines (mineSignal), torpedoes (ballisticSignal's
 * `torp` branch), and homing-torpedo updates (torpedoUpdateSignal). Everything
 * else pointSighted serves — shells, booms, bursts, sunk-witness,
 * spawns — stays on truesight, byte-identical (SHELLS DO NOT MOVE: a shell is
 * in the air; a torpedo is a wake just under the surface and a mine sits in
 * the water). Observer-scaled exactly as sight is (amendment 121 — while the
 * FLASH SHELLS dazzle existed, Story 8.17 – 9.4, it shrank this rung with
 * sight) and island LOS applies unchanged. The rung is
 * resolved through `sightOf`, never a literal, so it keeps ONE derivation
 * path: no card writes `stats.radarRange` today (the INTEL RANGE line was
 * deleted 2026-08-20), so every observer resolves the same base sight rung — but a
 * future radar card would move this rung for free. Fog-tolled through
 * withinSight exactly as sight is (Story 9.10): a mine or a fish inside a
 * bank is spotted late by the same ray cost.
 */
function pointDetected(me: ShipRecord, p: Vec2, field: SightField): boolean {
  return withinSight(field, me, p, sightOf(me) * CONFIG.vision.detectFactor) && sightClear(me, p, field.islands);
}

/**
 * THE 6/12 RUNG (the 5/8 rung before Story 9.8), OBSERVER-SCALED (Eric ruling 2026-08-16: *"It scales. Intel
 * range means your detection range on all levels gets further."*). THE one
 * resolver — both the `mz` and `sm` rows call it, because a second hand-rolled
 * copy of a sight tier is exactly the desync class this file exists to prevent.
 *
 * Anchored on `me.stats.radarRange`, NEVER on `sightOf`. No card writes that
 * field today — the INTEL RANGE line was deleted 2026-08-20, so the rung
 * resolves to the same 6/12 rung for every observer — but the anchor STAYS,
 * because it keeps ONE derivation path and a future radar card would scale
 * the rung with no change here. That is also what kept the
 * ratified reading — *a flash is a light source, not an illuminated object, so
 * dazzle does not change how far it carries* — true BY CONSTRUCTION while the
 * FLASH SHELLS dazzle existed (Story 8.17 – 9.4): `sightOf` was the sole
 * dazzle entry point in perception, so a radar-anchored rung could not
 * acquire dazzle scaling through a later refactor. The anchor outlives the
 * dazzle for the same reason. Same argument amendment 122
 * made when the foghorn moved onto intel range.
 *
 * THIS SUPERSEDES the flat-halo clause on both rows below, and with it epic-4
 * amendments 15/42/119. The anti-leak rationale that clause carried holds for
 * SUBJECT-scaling (a plume whose radius encoded the SMOKING ship's build would
 * broadcast it) and not for OBSERVER-scaling: the watcher already knows their
 * own build, and neither row carries any identity (`mz` is a bare {k,x,y}, `sm`
 * a bare {k,x,y,tier}).
 *
 * Fail-closed on a degenerate range, mirroring `hornBandFor`'s guard.
 */
function muzzleFlashReach(me: ShipRecord): number {
  const intel = me.stats.radarRange;
  if (!Number.isFinite(intel) || intel <= 0) return 0;
  return intel * CONFIG.vision.muzzleFlashFactor;
}

/**
 * True iff a lit zone OWNED by this observer covers point `p` (Story 1.7):
 * dist(p, zone center) ≤ zone radius, boundary INCLUSIVE. "Lit from above" —
 * deliberately NO island-LOS term on any zone path (an island between the
 * observer and a lit point never blocks the reveal; the flare hangs over the
 * water), and no cloud term (Story 9.3 session 2, Eric 2026-10-12: a cloud
 * hides nothing — amendment 142's flare-blinding term is retired with it).
 * FIRER-ONLY by construction: only zones whose ownerId is the observer
 * count, so a non-owner NEVER gains contacts/mines/ballistics from someone
 * else's zone. Feeds the contact/mine/ballistic rows as an OR beside their
 * sight gates.
 */
export function ownZoneCovers(ctx: SignalContext, p: Vec2): boolean {
  const me = ctx.me;
  if (!me) return false;
  for (const zone of ctx.litZones.values()) {
    if (zone.ownerId !== me.id) continue;
    const dx = p.x - zone.x;
    const dy = p.y - zone.y;
    if (dx * dx + dy * dy <= zone.r * zone.r) return true;
  }
  return false;
}

/** Anything carrying a radar sweep window — a ShipRecord (the radar buoy's
 *  own sweep, the other implementer, was deleted in Story 8.16):
 *  sweptThisTick reads exactly these two fields. */
interface SweepWindow {
  sweepAngle: number;
  prevSweepAngle: number;
}

/**
 * True iff the observer's beam crossed `brg` this tick: the half-open window
 * [prevSweepAngle, sweepAngle), wrap-safe. Start-inclusive + strict `<` at the
 * end means each bearing is painted exactly once per revolution.
 */
function sweptThisTick(me: SweepWindow, brg: number): boolean {
  const window = wrapPositive(me.sweepAngle - me.prevSweepAngle);
  return wrapPositive(brg - me.prevSweepAngle) < window;
}

/**
 * True iff the observer's beam crossed ANY bearing of the disc (centre `c`,
 * radius `r`) this tick — sweptThisTick widened from a point to the disc's
 * bearing span, bearing(observer, c) ± asin(min(1, r/d)). Two arcs meet iff
 * the span's start lies in the beam window [prev, cur) or the window's start
 * lies in the span. An observer INSIDE the disc (d ≤ r) is surrounded by it:
 * any sweep (a non-empty window) counts. The `cloud` row's radar clause.
 */
function sweptDiscThisTick(me: ShipRecord, c: Vec2, r: number): boolean {
  const window = wrapPositive(me.sweepAngle - me.prevSweepAngle);
  const d = Math.hypot(c.x - me.state.x, c.y - me.state.y);
  if (window <= 0) return false;
  if (d <= r) return true;
  const half = Math.asin(Math.min(1, r / d));
  const spanStart = bearing(me.state, c) - half;
  return wrapPositive(spanStart - me.prevSweepAngle) < window || wrapPositive(me.prevSweepAngle - spanStart) <= 2 * half;
}

/** The bearing (wrapped to [0, 2π)) at which the beam ENTERS the disc (centre
 *  `c`, radius `r`): bearing(observer, c) − asin(min(1, r/d)); null when the
 *  observer stands inside the disc (no span — it surrounds them). */
function discSpanStart(me: ShipRecord, c: Vec2, r: number): number | null {
  const d = Math.hypot(c.x - me.state.x, c.y - me.state.y);
  if (d <= r) return null;
  return wrapPositive(bearing(me.state, c) - Math.asin(Math.min(1, r / d)));
}

/**
 * THE REVOLUTION A DISC'S PASS BELONGS TO (Story 9.8 review, F1). A point
 * target is swept on exactly one tick, so `sweepRev` names its pass. A DISC
 * spans an arc the beam can take several ticks to cross — and when that arc
 * straddles bearing 0, `advanceSweeps` bumps `sweepRev` mid-pass, so rolling
 * on the live `sweepRev` would split one physical pass into two draws (paint
 * on the pre-wrap tick, miss on the post-wrap one, or the reverse). So a disc
 * rolls on the revolution of its span START: the beam (now at `sweepAngle`)
 * reached `spanStart` in this revolution iff spanStart ≤ sweepAngle; a span
 * start AHEAD of the beam was crossed before the last wrap — `sweepRev − 1`.
 * (Sound because a swept span is < π wide, so its start was crossed less
 * than one revolution ago.) An observer inside the disc (null start) rolls
 * on `sweepRev` — inside `startU`, where p(paint) is 1 anyway.
 */
function discRollRev(me: ShipRecord, spanStart: number | null): number {
  if (spanStart === null || spanStart <= me.sweepAngle) return me.sweepRev;
  return me.sweepRev - 1;
}

/** Radar-annulus test for a POINT: beyond sight (exclusive), within radar
 *  (inclusive) — both the OBSERVER'S effective ranges (the sight boundary is
 *  the SAME sightOf every sight predicate uses, so "sight wins inside its
 *  radius" stays coherent whatever that sight resolves to: a narrower bubble
 *  becomes paintable annulus, never a dead ring). Sight wins inside its
 *  radius: since Story 4.11 the annulus exclusion, not any shared occlusion predicate,
 *  is what keeps the two tiers from answering for the same point — sight
 *  occludes on binary island LOS while radar occludes on the height-aware
 *  shadow march, so an island-LOS-blocked ship inside sight is simply
 *  invisible (not in the annulus, so it cannot paint) even where a low island
 *  would leave it radar-visible (amendment 179; Eric 2026-08-02: islands
 *  block every sensor). (Story 8.18's in-bubble smoke clause re-entered the
 *  bubble; Story 9.3 session 2 retired it — a cloud hides nothing, so there
 *  is no smoke-hidden in-bubble hull to paint.) Point-based so a non-ship subject can share it (Story 1.8)
 *  runs the IDENTICAL test on a decoy position. */
function inRadarAnnulus(me: ShipRecord, p: Vec2): boolean {
  const dx = p.x - me.state.x;
  const dy = p.y - me.state.y;
  const d2 = dx * dx + dy * dy;
  const sight = sightOf(me);
  return d2 > sight * sight && withinRadarRange(me, p);
}

/** The annulus's OUTER edge alone — the point is within the observer's
 *  effective radar range (`stats.radarRange`, inclusive `<=`). */
function withinRadarRange(me: ShipRecord, p: Vec2): boolean {
  const dx = p.x - me.state.x;
  const dy = p.y - me.state.y;
  return dx * dx + dy * dy <= me.stats.radarRange * me.stats.radarRange;
}

/**
 * THE ship-blip gate (one function, three callers — FR10's temporal
 * indistinguishability by construction): sight < dist ≤ radar (the annulus)
 * ∧ the observer's beam crossed the point's bearing this tick ∧ the target is
 * at least PARTIALLY illuminated under the height-aware radar shadow (Story
 * 4.11, amendment 179 — the shared `visibilityTo` march over the height
 * raster replaced binary island LOS on this one gate; a partially shadowed
 * hull still returns something and is therefore disclosed, and only vis = 0 —
 * past the residual reach, or behind hard cover ≥ mast height — deletes the
 * blip). No cloud term (Story 9.3 session 2, Eric 2026-10-12: a cloud hides
 * nothing — 8.18's in-bubble smoke clause and cycle 174's radarClear are
 * retired; the gate is byte-identical to pre-8.18). The march is the SAME
 * shared function the client's beam march runs (the story's one-
 * implementation constraint), which is what keeps the scope and the gate
 * from ever disagreeing. TERM ORDER IS LOAD-BEARING FOR COST: annulus →
 * swept-this-tick → shadow march, so the expensive march runs only for
 * candidates already in this tick's beam wedge. The genuine ship scan and
 * the decoy paint both call THIS, so anything afloat at a position paints
 * exactly when a ship there would — same tick, same boundaries, same
 * shadowing. Do not fork it, and do not give a non-ship subject its own
 * height: observer and target are both at mast height (amendment 101), which
 * is what makes the model symmetric.
 */
function blipGate(ctx: FoggedSignalContext, p: Vec2, targetKey: string): boolean {
  const me = ctx.me;
  return (
    inRadarAnnulus(me, p) &&
    sweptThisTick(me, bearing(me.state, p)) &&
    visibilityTo(ctx.heightRaster, me.state.x, me.state.y, p.x, p.y) > 0 &&
    radarPaints(ctx, Math.hypot(p.x - me.state.x, p.y - me.state.y), targetKey)
  );
}

/**
 * THE RADAR DROPOUT TERM (Story 9.8, epic-9 amendment 104, rulings 121–123):
 * does THIS sweep revolution paint a return at centre distance `d`? The
 * shared pure `dropoutPaints` over (the server-private `ctx.dropoutSeed`, the
 * OBSERVER's ship id, the TARGET's key, the observer's `sweepRev`) — a
 * STATELESS hash, never a consumed stream, so every `observe()` caller (each
 * client's frame, each bot thunk) and the test oracle get the identical
 * answer. p(paint) is 1 to `CONFIG.vision.dropout.startU` (the 8/12 rung), so
 * nothing inside it ever misses; beyond it the far returns come and go.
 *
 * EVERYTHING RADAR DELIVERS ROLLS (ruling 123): ship blips and decoy paints
 * (via blipGate), the wake's radar half (wakeGate) and the countermeasure
 * cloud's radar clause (discRadarDetected). No size weighting (ruling 122):
 * one curve for every return. Never consulted inside sight (the roll lives in
 * the RADAR gate only), and never by the lit / burn / foul zone circles —
 * those are drawn hazards, not returns (`zoneCircleVisible`). A miss is the
 * gate answering false: nothing about the target is emitted.
 */
function radarPaints(ctx: FoggedSignalContext, d: number, targetKey: string): boolean {
  return dropoutPaints(d, ctx.dropoutSeed, ctx.me.id, targetKey, ctx.me.sweepRev);
}

/** THE blip wire shaper (one function, two callers — FR10's wire
 *  indistinguishability by construction). KEY ORDER IS LOAD-BEARING: the wire
 *  emits k,t,gx,gy,w,h,bits — THE SERVER RASTERIZES THE HULL (cycle 63,
 *  amendment 152): the true silhouette polygon at the paint pose, projected
 *  onto the shared radar grid (CONFIG.vision.radarCellU) and FUZZED per paint
 *  (dilation + glint, amendments 156-157) by the shared `paintCoverage`, as a
 *  world-anchored coverage footprint carrying NO id, NO class, NO heading, NO
 *  extent and no exact position. Identity never leaves the server — there is
 *  no correlation handle across sweeps. GEOMETRY ONLY, observer-independent:
 *  the mask is a pure function of (hull, pose, grid, paint tick), never of
 *  boons, hp, damage state, or the observer — every observer painting this
 *  hull this tick receives the identical mask, and the client computes all
 *  intensity. A genuine paint passes the ship's position and LIVE pose; the
 *  a non-ship radar subject passes its own position and its frozen
 *  cls/heading (a radar reflector reports true stationary values) — byte-for-
 *  byte the same shape either way, because both run through this one shaper
 *  and the one shared rasterizer+fuzz pipeline (amendment 11 by construction).
 *
 *  THE MASK IS FUZZED PER PAINT (cycle-63 review gate, amendments 156-157):
 *  `paintCoverage` dilates the sharp rasterization and jitters its fringe on a
 *  seed derived from (tick time, exact pose) — never from any ship identity —
 *  so class is inferable with skill, never readable (amendment 68), and the
 *  jitter can never become the cross-sweep correlation handle amendment 152
 *  removed. Still observer-independent: the seed has no observer term, so
 *  every observer painting this hull this tick receives the identical mask —
 *  which is why the one-slot memo below is sound: consecutive observers whose
 *  beams gate the same hull in the same tick reuse the mask instead of
 *  re-rasterizing it (cycle-63 review gate note; a full per-(ship, tick)
 *  cache is not warranted — expected hulls-in-wedge per observer per tick is
 *  well under one, amendment 153). */
interface MaskMemo {
  cls: HullId;
  x: number;
  y: number;
  heading: number;
  t: number;
  mask: HullCoverage;
}
let lastMask: MaskMemo | null = null;

/** The memoized paint pipeline: (pose, tick) → wire mask. Pure per key. */
function paintMask(cls: HullId, p: Vec2, heading: number, t: number): HullCoverage {
  const m = lastMask;
  if (m !== null && m.cls === cls && m.x === p.x && m.y === p.y && m.heading === heading && m.t === t) {
    return m.mask;
  }
  const mask = paintCoverage(cls, p.x, p.y, heading, CONFIG.vision.radarCellU, t);
  lastMask = { cls, x: p.x, y: p.y, heading, t, mask };
  return mask;
}

function blipShape(ctx: SignalContext, p: Vec2, cls: HullId, heading: number): BlipEvent {
  return { k: 'blip', t: ctx.now, ...paintRect(ctx, p, cls, heading) };
}

/** THE COVERAGE RECT — the blip's payload minus `k` and `t` (`GhostPaint`,
 *  cycle 162), in the SAME key order the blip carries it (gx,gy,w,h,bits).
 *  One caller since CHAFF's retirement (Story 9.2): blipShape. */
function paintRect(ctx: SignalContext, p: Vec2, cls: HullId, heading: number): GhostPaint {
  const c = paintMask(cls, p, heading, ctx.now);
  return { gx: c.gx, gy: c.gy, w: c.w, h: c.h, bits: c.bits };
}

// ---------------------------------------------------------------------------
// Contact-like channels (pseudo event types — synced state, not GameEvents).
// ---------------------------------------------------------------------------

/**
 * `contact` — true-sight tier: another hull still on the water (afloat OR
 * sinking) within the observer's effective sight range (boundary INCLUSIVE)
 * + SIGHT-clear (island LOS), OR the hull's CENTER inside a lit zone the
 * observer OWNS (Story 1.7 — firer-only truesight parity, "lit from above":
 * no island term on the zone path). Live position/heading/
 * speed straight from the sim.
 * Spectators (unfogged) see every such hull — including, in the finished
 * phase, their own.
 */
const contactSignal: SignalSpec<ShipRecord, Contact> = {
  eventType: 'contact',
  visible(ctx, ship) {
    // Afloat OR SINKING (Story 5.2, amendment 15 seam 3 — perceivability): a
    // sinking hull is still a participant and still a target, a contact under
    // the unchanged sight/LOS rules for its whole window. NOTHING in the
    // payload discloses the window (amendment 16): materialize builds the
    // same {id,x,y,heading,speed,cls} as for any live hull, so an observer
    // reads only the visible deceleration — no enemy-facing sinking channel.
    if (!isAfloat(ship.lifecycle) && !isSinking(ship.lifecycle)) return false;
    if (ctx.mode === 'spectator') return true;
    const me = ctx.me;
    if (ship.id === me.id) return false;
    // The observer's own effective sight (the one derivation), fog-tolled
    // (Story 9.10: withinSight adds the ray's bank cost before comparing);
    // the owned-zone OR is untouched (a flare lights from above).
    return (
      (withinSight(ctx, me, ship.state, sightOf(me)) && sightClear(me, ship.state, ctx.islands)) ||
      ownZoneCovers(ctx, ship.state)
    );
  },
  materialize(ctx, ship) {
    const s = ship.state;
    // `cls` is the full HullId — drone contacts carry droneSmall/Medium/Large.
    const base = { id: ship.id, x: s.x, y: s.y, heading: s.heading, speed: s.speed, cls: ship.hullId };
    // THE SELF-PRIVATE AGGRO MARK (Story 5.6, amendment 40). Appended LAST so
    // the historical key order is byte-stable, and present ONLY when this
    // contact is a fleet hull that has acquired THE OBSERVER RECEIVING THIS
    // FRAME. Three properties, each load-bearing:
    //   * FOGGED PATH ONLY — a spectator's frame never carries it, even for a
    //     hull that was hunting them a tick ago (`mode` is checked before the
    //     controller is asked at all);
    //   * keyed on ctx.observerId, so a third party watching the same chase
    //     sees the identical contact WITHOUT the key. It is not "this hull is
    //     hunting someone", it is "this hull is hunting YOU";
    //   * OMITTED, never `false` — msgpack carries no dead keys, and the wire
    //     shape for every non-targeted contact stays byte-identical to 5.5.
    // It needs NO seventh perception exception: the row only runs because
    // contactSignal.visible already passed, so it widens no spatial
    // disclosure (the `sinkingUntil` shape, applied to a Contact).
    if (ctx.mode !== 'fogged' || !ctx.aggroAt(ship.id, ctx.observerId)) return base;
    return { ...base, aggro: true };
  },
};

/**
 * `mine` — contact-like state (NOT events), recomputed every tick exactly like
 * contacts. The owner sees ALL its own mines always (own field awareness, even
 * under fog); everyone else sees a mine only when it is within DETECT range
 * (Story 4.9; the 4/12 rung = sight since Story 9.8, pointDetected — a mine
 * sits low in the water, its own rung, today coincident with sight) + island-LOS — OR inside a lit zone the
 * observer OWNS (Story 1.7 truesight parity, no LOS on the zone path). Mines
 * NEVER radar-paint, and arm state makes no difference to visibility. A
 * static persistent entity synced this way cannot suffer event-lifecycle
 * staleness (a triggered/despawned mine simply drops out of the next frame's
 * list). Spectators see every mine.
 */
const mineSignal: SignalSpec<MineState, MineView> = {
  eventType: 'mine',
  visible(ctx, mine) {
    if (ctx.mode === 'spectator') return true;
    return (
      mine.ownerId === ctx.me.id ||
      pointDetected(ctx.me, mine, ctx) ||
      ownZoneCovers(ctx, mine)
    );
  },
  materialize(ctx, mine) {
    // KEY ORDER IS LOAD-BEARING (msgpack): id,x,y,own,by,c. `by` (Story 1.12)
    // is the dropper's ship id — roster-resolved to the dropper's personal hue
    // for every observer (a deliberate intel grant, Eric 2026-07-23).
    //
    // `c` — THE MINE'S KIND, FOR EVERY OBSERVER (Eric ruling 2026-10-01,
    // "Everyone sees the kind"; cycle 162, PV 68). This SUPERSEDES Story
    // 8.13's own-only rule (epic-8 amendment 76), under which the key was
    // stripped for every non-owner: the marker on the water now draws the
    // kind's own glyph in the dropper's hue for whoever sees it (owner,
    // enemy, spectator alike), so every materialized row carries it, LAST.
    // ANTI-CHEAT: this row is already sight-gated (visible() above — owner
    // always, else detect + island LOS, else an owned flare), so the kind is
    // a field on a delivered row, not a new delivery: it discloses nothing
    // beyond the mine's presence, and the perception exception count stays
    // at SIX.
    return { id: mine.id, x: mine.x, y: mine.y, own: mine.ownerId === ctx.observerId, by: mine.ownerId, c: mine.kind };
  },
};

/**
 * `litzone` — contact-like state (NOT events), recomputed every tick exactly
 * like mines (Story 1.7). The OWNER (firer) always sees its own zones; any
 * other fogged observer sees a zone iff its CENTER is within the observer's
 * effective radar range — deliberately NO island LOS and NO sweep gate (a
 * 10s flare in the sky, not a hull paint; zone-CENTER distance, not
 * circle-edge, keeps the rule one comparison). Invisible beyond radar range.
 * Spectators see all. ONLY the circle rides this row — the firer's truesight
 * parity inside it flows through the contact/mine/ballistic rows
 * (ownZoneCovers), never here. `by` is the firer's ship id
 * (roster-resolvable — the 1.12 personal-hue hook).
 */
const litZoneSignal: SignalSpec<LitZone, LitZoneView> = {
  eventType: 'litzone',
  visible: zoneCircleVisible, // the gate below, shared with the burning zone (Story 8.17)
  materialize(_ctx, zone) {
    // KEY ORDER IS LOAD-BEARING (msgpack): id,x,y,r,until,by. The two doctrine
    // flags that used to trail (`phos`/`daz`, Story 2.9 amendment 50) are
    // DELETED with the verbs (Story 8.17, amendment 134): a lit zone only
    // lights, so a flare costs exactly its pre-2.9 bytes again.
    return {
      id: zone.id,
      x: zone.x,
      y: zone.y,
      r: zone.r,
      until: zone.until,
      by: zone.ownerId,
    };
  },
};

/** The LIT ZONE's visibility gate, hoisted so the burning zone (amendment
 *  135(f)) and the foul zone (Story 9.4, amendment 63) can share it
 *  BYTE-FOR-BYTE: spectators always; the owner always;
 *  otherwise iff the zone's CENTRE is within the observer's effective radar
 *  range — deliberately NO island LOS and NO sweep gate. */
function zoneCircleVisible(ctx: SignalContext, zone: { ownerId: string; x: number; y: number }): boolean {
  if (ctx.mode === 'spectator') return true;
  const me = ctx.me;
  if (zone.ownerId === me.id) return true;
  const dx = zone.x - me.state.x;
  const dy = zone.y - me.state.y;
  const radar = me.stats.radarRange;
  return dx * dx + dy * dy <= radar * radar; // no LOS, no sweep gate
}

/**
 * `burnzone` — the PHOSPHOR SHELLS burning zone (Story 8.17, Eric ruling
 * 2026-09-29, epic-8 amendments 131 / 135(f)): contact-like state (NOT
 * events), recomputed every tick exactly like lit zones, through the LIT
 * ZONE's visibility gate byte-for-byte (`zoneCircleVisible`): the OWNER always
 * sees its own zones; any other fogged observer sees a zone iff its CENTER is
 * within the observer's effective radar range — no island LOS, no sweep gate
 * (a burning patch of sea is as visible as a flare in the sky — counterplay
 * over concealment); spectators see all.
 *
 * A HAZARD ONLY: this row carries the CIRCLE and nothing else. Unlike the lit
 * zone, NOTHING inside a burning zone is revealed by it — no contact, mine or
 * ballistic row reads `burnZones` (ownZoneCovers iterates `litZones` alone),
 * so a hull standing in the firer's own fire but outside the firer's sight
 * stays dark to the firer (amendment 135(e)). The zone's `dps` is server-
 * private (a build read); `by` is the firer's ship id (personal hue).
 */
const burnZoneSignal: SignalSpec<BurnZone, BurnZoneView> = {
  eventType: 'burnzone',
  visible: zoneCircleVisible,
  materialize(_ctx, zone) {
    // KEY ORDER IS LOAD-BEARING (msgpack): id,x,y,r,until,by — the lit zone's
    // exact shape. `dps` NEVER rides (it is the firer's tier, a build leak).
    return {
      id: zone.id,
      x: zone.x,
      y: zone.y,
      r: zone.r,
      until: zone.until,
      by: zone.ownerId,
    };
  },
};

/**
 * `foulzone` — the FOULING SHELL foul zone (Story 9.4, Eric ruling
 * 2026-10-11, epic-9 amendments 61–68): contact-like state (NOT events),
 * recomputed every tick exactly like burn zones, through the BURN ZONE's
 * visibility gate byte-for-byte (`zoneCircleVisible` — amendment 63): the
 * OWNER always sees its own zones; any other fogged observer sees a zone iff
 * its CENTER is within the observer's effective radar range — no island LOS,
 * no sweep gate; spectators see all. Rejected at the spec step: the mine's
 * gate (sight + LOS) and "sighted AND radar-painted". Drawn as a circle,
 * never a radar return.
 *
 * A HAZARD ONLY: this row carries the CIRCLE and nothing else. Nothing inside
 * a foul zone is revealed by it — no contact, mine or ballistic row reads
 * `foulZones` — and the slow it deals reaches each victim ONLY through its
 * own private `OwnShip.fouledUntil` (frames.toOwnShip), never through this
 * row. `by` is the firer's ship id (personal hue); `r` rides so the client
 * stays dumb.
 */
const foulZoneSignal: SignalSpec<FoulZone, FoulZoneView> = {
  eventType: 'foulzone',
  visible: zoneCircleVisible,
  materialize(_ctx, zone) {
    // KEY ORDER IS LOAD-BEARING (msgpack): id,x,y,r,until,by — the burn
    // zone's exact shape. `ownerId` rides only as `by`.
    return {
      id: zone.id,
      x: zone.x,
      y: zone.y,
      r: zone.r,
      until: zone.until,
      by: zone.ownerId,
    };
  },
};


/**
 * `decoy` — contact-like state (Story 8.16, catalog-v3 R36, amendments
 * 119–124, 126), recomputed every tick like mines: the OWNER always sees its
 * own decoy (own field awareness, even under fog); everyone else sees it at
 * SIGHT range + island LOS (pointSighted — LIKE A SHIP, amendment 126, which
 * superseded 124(h)'s mine-detect rung: radar paints only OUTSIDE sight, so a
 * detect-rung view left a dark band between the two where the paint stopped
 * and nothing replaced it — a free decoy tell) or inside a lit zone the
 * observer OWNS (Story 1.7 parity, no LOS on the zone path). Spectators see
 * all. Beyond sight an enemy learns of the decoy ONLY through its anonymous
 * radar paint (decoyRadarBlips below), which carries no id and no owner.
 */
const decoySignal: SignalSpec<DecoyState, DecoyView> = {
  eventType: 'decoy',
  visible(ctx, decoy) {
    if (ctx.mode === 'spectator') return true;
    return (
      decoy.ownerId === ctx.me.id ||
      pointSighted(ctx.me, decoy, ctx) ||
      ownZoneCovers(ctx, decoy)
    );
  },
  materialize(ctx, decoy) {
    // KEY ORDER IS LOAD-BEARING (msgpack): id,x,y,own,by[,hp] — the shared
    // DecoyView declaration order. `by` (the owner's ship id) rides EVERY
    // view (amendment 124(a) — the client's hue latch keys on it, the
    // MineView.by precedent); `hp` ONLY on the owner's own view, appended
    // LAST with the key ABSENT otherwise (the MineView.c idiom).
    const own = decoy.ownerId === ctx.observerId;
    return { id: decoy.id, x: decoy.x, y: decoy.y, own, by: decoy.ownerId, ...(own ? { hp: decoy.hp } : {}) };
  },
};

/**
 * `cloud` — the MULTI-SPECTRAL COUNTERMEASURE cloud (Story 9.3 — 8.18's
 * `smoke` seat): contact-like state (NOT events), recomputed every tick like
 * decoys, in Map-insertion (press) order. A cloud is a CLIENT VISUAL OVERLAY
 * (Story 9.3 session 2, Eric ruling 2026-10-12: "just draw it on top of
 * ships") — it hides nothing on the server; this row is only how each client
 * learns there is one to paint. THE DELIVERY GATE senses the cloud's SPRAY
 * DISC (centre, radius `cloudOutlineRadius(age)` — 200 → 500 u over its
 * life), sensor-based as amendment 51 ruled ("If I can see smoke particles
 * in my sight range, I want them composited … If it's detected by my radar,
 * I want my radar to paint it"): SPECTATORS always; the OWNER always (you
 * made it); otherwise iff the disc is
 *   (a) SIGHTED — its nearest point is within the observer's effective sight
 *       (d − r ≤ sightOf, inclusive) on an ISLAND-clear segment to that
 *       nearest rim point (`losClear`; the observer itself when inside), or
 *   (b) RADAR-DETECTED — its nearest point is within `stats.radarRange`
 *       (inclusive) ∧ the beam crossed the disc's bearing span this tick
 *       (`sweptDiscThisTick`) ∧ the centre is shadow-visible (`visibilityTo`
 *       over the height raster > 0 — one march).
 * NO lit-zone term (a flare lights hulls, not weather). Radar delivery is
 * per-sweep, so the channel is intermittent by design — the client HOLDS a
 * cloud once received until its life ends (a cloud is stationary and fully
 * derived from {id,x,y,t0}, so holding discloses nothing new).
 *
 * THIS IS A CHANNEL WITH ITS OWN ORACLE, NOT A DECLARED PERCEPTION EXCEPTION
 * (the litzone / burnzone / foulzone / decoy precedent): its gate is a per-row
 * predicate the invariant suite re-derives independently (verifyClouds), and
 * never reaches past the sight bubble or this tick's radar. The declared
 * exceptions are exactly SIX — sp, hc, mz, sunk, sm, fh — rows that reach
 * beyond every gate (Story 9.10's fog is a TOLL on the sight predicates,
 * never a channel: the field is public weather derived on both sides from
 * the welcome seed and the schema cut). materialize() emits
 * `{id, x, y, t0}` and NOTHING
 * else: no radius (both sides derive it from `t0`), no owner (a cloud tells
 * you nothing about who made it — the mz/sm anonymity posture), no `until`.
 */

/** The point of the disc (centre `c`, radius `r`) nearest the observer at
 *  `o`: c − r·unit(c − o); `o` itself when it stands inside the disc. */
function nearestRimPoint(o: Vec2, c: Vec2, r: number): Vec2 {
  const dx = c.x - o.x;
  const dy = c.y - o.y;
  const d = Math.hypot(dx, dy);
  if (d <= r) return { x: o.x, y: o.y };
  return { x: c.x - (r * dx) / d, y: c.y - (r * dy) / d };
}

/** Clause (a): the disc's nearest point within sight on an island-clear
 *  segment. `d` is the observer→centre distance, `r` the disc radius.
 *  Story 9.10: the segment to the nearest rim point pays the fog toll
 *  (withinSight — its plain test is the old `d − r ≤ sightOf`); an observer
 *  standing inside a bank pays on that segment like on any other. */
function discSighted(ctx: FoggedSignalContext, cloud: StoredCloud, d: number, r: number): boolean {
  const me = ctx.me;
  if (d - r > sightOf(me)) return false;
  const rim = nearestRimPoint(me.state, cloud, r);
  return withinSight(ctx, me, rim, sightOf(me)) && losClear(me.state, rim, ctx.islands);
}

/** Clause (b): the disc's nearest point within radar range, its bearing span
 *  swept this tick, and the centre shadow-visible (cost order). */
function discRadarDetected(ctx: FoggedSignalContext, cloud: StoredCloud, d: number, r: number): boolean {
  const me = ctx.me;
  if (d - r > me.stats.radarRange) return false;
  if (!sweptDiscThisTick(me, cloud, r)) return false;
  if (visibilityTo(ctx.heightRaster, me.state.x, me.state.y, cloud.x, cloud.y) <= 0) return false;
  // Story 9.8 (ruling 123): the radar delivery rolls the dropout at the
  // CENTRE distance, like every other return — on the revolution of the
  // disc's span start, so one pass straddling bearing 0 is ONE draw (F1).
  const rev = discRollRev(me, discSpanStart(me, cloud, r));
  return dropoutPaints(d, ctx.dropoutSeed, me.id, cloud.id, rev);
}

/** The fogged half of the cloud gate: the disc sighted or radar-detected. */
function cloudSensed(ctx: FoggedSignalContext, cloud: StoredCloud): boolean {
  const r = cloudOutlineRadius(ctx.now - cloud.bornAt);
  const d = Math.hypot(cloud.x - ctx.me.state.x, cloud.y - ctx.me.state.y);
  return discSighted(ctx, cloud, d, r) || discRadarDetected(ctx, cloud, d, r);
}

const cloudSignal: SignalSpec<StoredCloud, CloudView> = {
  eventType: 'cloud',
  visible(ctx, cloud) {
    if (ctx.mode === 'spectator') return true;
    if (cloud.ownerId === ctx.me.id) return true;
    return cloudSensed(ctx, cloud);
  },
  materialize(_ctx, cloud) {
    // KEY ORDER IS LOAD-BEARING (msgpack): id,x,y,t0 — the shared CloudView
    // declaration order. ALWAYS a fresh bare object: `ownerId` and `until`
    // live on the store record and may never ride along by accident — and NO
    // own-flag either.
    return { id: cloud.id, x: cloud.x, y: cloud.y, t0: cloud.bornAt };
  },
};

// ---------------------------------------------------------------------------
// Perception-generated event channels (scan-driven, never forwarded raw).
// ---------------------------------------------------------------------------

/**
 * `blip` — the radar tier: sight < dist ≤ radar (both boundaries as
 * written) ∧ shadow-visible (Story 4.11:
 * `visibilityTo` over the height raster > 0 — partial illumination
 * discloses; only full shadow deletes) ∧ the observer's beam crossed the
 * target's bearing this tick (the half-open window [prev, cur) — wrap-safe,
 * each bearing painted exactly once per revolution). Paints carry position-
 * at-paint-time; the server keeps no blip history (phosphor decay is client
 * render math). ONLY SHIPS PAINT — torpedoes and mines never appear on radar
 * (the ship scan iterates ships only, by construction). A ship inside a lit
 * zone the observer OWNS never blips: it is already a FULL contact (Story
 * 1.7). No cloud term anywhere (Story 9.3 session 2: a cloud hides
 * nothing — a hull inside anyone's cloud paints like any hull). The row
 * stays self-contained rather
 * than leaning on the scan's contact-first ordering. Spectators get live
 * contacts instead, never blips.
 *
 * COUNTER-INTEL IS DELETED (Story 7-5 wave 2). The one non-ship addition to
 * the blip subsequence — the DECOY BUOY's anonymous paint (Story 8.16) — is
 * not a row: it merges through decoyRadarBlips below, gated by the SAME
 * blipGate.
 */
const blipSignal: SignalSpec<ShipRecord, BlipEvent> = {
  eventType: 'blip',
  visible(ctx, target) {
    // Blips are perception-generated, never world-emitted: a world-dispatched
    // 'blip' event (not a live ShipRecord) fails this shape guard — fail-closed.
    if (!('state' in target)) return false;
    if (ctx.mode !== 'fogged') return false;
    const me = ctx.me;
    // Afloat OR SINKING (Story 5.2, amendment 15 seam 3): a sinking hull
    // still paints under the identical annulus/sweep/shadow gate — the blip
    // payload carries pose only, so nothing discloses the window here either.
    if ((!isAfloat(target.lifecycle) && !isSinking(target.lifecycle)) || target.id === me.id) return false;
    if (ownZoneCovers(ctx, target.state)) return false; // already a full contact — never doubled as a blip
    // The observer's OWN radar, and nothing else (the radar buoy's relay and
    // its own-scope `src` tag were deleted with the buoy in Story 8.16).
    return blipGate(ctx, target.state, target.id);
  },
  materialize(ctx, target) {
    // Live pose (Story 4.2, FR14): hull id, heading, and the raw signed speed
    // scalar at paint time — never a derived cap or boost flag (build leak).
    // In `return` grammar the pose feeds the server-side raster ONLY — the
    // wire carries the coverage footprint, nothing else (amendment 152).
    return blipShape(ctx, target.state, target.hullId, target.state.heading);
  },
};

// ---------------------------------------------------------------------------
// NON-SHIP blip sources (Story 8.16 — replacing the deleted RADAR BUOY's
// self-paint, own scope and jamming) — perception-generated additions to the
// ONE blip subsequence, called only by perception's fogged view and merged
// before the payload-only blipOrder sort, so a frame's blip ordering never
// leaks which member came from a hull or a decoy. Every one is
// UNTAGGED: the `src` sensor tag died with the buoy (PV 59).
// ---------------------------------------------------------------------------

/**
 * THE DECOY'S PAINT: a small degenerate-segment square at the decoy's fixed
 * position — its TRUE physical footprint (`CONFIG.decoyBuoy.sizeU`, the same
 * square the ballistic paths collide with), rasterized and per-paint glinted
 * by the SAME shared segment pipeline the wake row uses, onto the same
 * lattice, in the same {k:'blip',...} wire shape. Deliberately NOT
 * paintCoverage over any HullId: the decoy paints as what it is, a return
 * visibly the size of a float, carrying (like every blip since amendment 152)
 * no id, no class, no owner, nothing.
 */
function decoyPaintBlip(ctx: SignalContext, decoy: DecoyState): BlipEvent {
  const s = CONFIG.decoyBuoy.sizeU;
  const c = paintSegmentCoverage(decoy.x, decoy.y, decoy.x, decoy.y, s, CONFIG.vision.radarCellU, ctx.now);
  return { k: 'blip', t: ctx.now, gx: c.gx, gy: c.gy, w: c.w, h: c.h, bits: c.bits };
}

/**
 * Every decoy this observer's OWN radar paints this tick: through the ONE
 * blipGate (annulus ∧ this-tick beam ∧ shadow march) and never inside a lit
 * zone the observer owns (there the truth rides the `decoy` channel). THE
 * OWNER INCLUDED — the owner's radar paints their own decoy through the same
 * gate, with no special case (orchestrator ruling, Story 8.16).
 */
export function decoyRadarBlips(ctx: FoggedSignalContext): BlipEvent[] {
  const out: BlipEvent[] = [];
  for (const decoy of ctx.decoys.values()) {
    if (ownZoneCovers(ctx, decoy)) continue;
    if (blipGate(ctx, decoy, decoy.id)) out.push(decoyPaintBlip(ctx, decoy));
  }
  return out;
}

// ---------------------------------------------------------------------------
// `wk` — RADAR WAKES (Story 4.12, amendments 194-196/200/205).
// ---------------------------------------------------------------------------

/**
 * One wake ribbon SEGMENT offered to the `wk` row by perception's wake scan
 * (the scan walks each ribbon via the shared eachWakeSegment and copies the
 * scratch into this shape). `x`/`y` is the segment MIDPOINT — the gate's one
 * test point, named so the shared point predicates (inRadarAnnulus, bearing)
 * read it directly. `ax..by` are the endpoints the rasterizer projects;
 * `widthU` is the SOURCE-derived turbulent-core width (a hull's own beam, one
 * radar cell for a torpedo — carried on the ribbon, derived exactly once in
 * shared sim/wake.ts). The `ax` key doubles as the row's fail-closed shape
 * guard: a world-emitted `wk` WIRE event ({k,t,a,gx,...}) reaching this row
 * via tickEvents dispatch has no `ax` and is dropped — wake events are
 * perception-generated ONLY, never forwarded.
 */
export interface WakeSubject {
  /** Segment midpoint (u) — the per-segment gate's test point. */
  x: number;
  y: number;
  /** Older endpoint (u). */
  ax: number;
  ay: number;
  /** Newer endpoint (u). */
  bx: number;
  by: number;
  /** Quantized water-age bucket, 0..WAKE_AGE_BUCKETS-1 (the recency channel). */
  bucket: number;
  /** Turbulent-core width (u), derived from the source. */
  widthU: number;
  /** TORPEDO water? (WakeRibbon.torp, copied by the scan.) Selects the
   *  per-source inner disclosure bound — detect for a torpedo, sight for a
   *  ship (review-gate P2; see the row doc). NEVER on the wire. */
  torp: boolean;
  /** The dropout roll's TARGET KEY — the water's source id
   *  (`World.wakeKeyOf`, copied by the scan; Story 9.8). NEVER on the wire. */
  key: string;
}

/** Cached per-ribbon bounding circle (see wakeBounds): the bound depends only
 *  on the RIBBON, never the observer, so N observers amortize ONE recompute
 *  per ribbon mutation instead of paying the O(samples) scan each (measured:
 *  the uncached recompute was the single largest wake-scan cost in a full
 *  room). The validity key is (head, count, newest sample, oldest sample):
 *  every ribbon mutation moves at least one of these — append moves count or
 *  head, prune moves head and count, the applyBoon upsize replays into a NEW
 *  object (fresh WeakMap key) — and the endpoint samples guard test-style
 *  direct ring writes. `rad < 0` encodes "no live bound" (sub-2-sample or
 *  all-non-finite). */
interface RibbonBoundsMemo {
  head: number;
  count: number;
  tNew: number;
  xNew: number;
  yNew: number;
  xOld: number;
  yOld: number;
  cx: number;
  cy: number;
  rad: number;
}
const RIBBON_BOUNDS = new WeakMap<WakeRibbon, RibbonBoundsMemo>();

/** NaN-tolerant slot equality for the memo key (a corrupt stored sample may
 *  legitimately be NaN; NaN !== NaN would otherwise thrash the cache). */
function slotEq(a: number, b: number): boolean {
  return a === b || (Number.isNaN(a) && Number.isNaN(b));
}

function boundsMemoValid(m: RibbonBoundsMemo, r: WakeRibbon, newest: number, oldest: number): boolean {
  return (
    m.head === r.head &&
    m.count === r.count &&
    slotEq(m.tNew, r.ts[newest]) &&
    slotEq(m.xNew, r.xs[newest]) &&
    slotEq(m.yNew, r.ys[newest]) &&
    slotEq(m.xOld, r.xs[oldest]) &&
    slotEq(m.yOld, r.ys[oldest])
  );
}

/** Conservative per-ribbon bounding circle over the LIVE samples (centre +
 *  radius covering every segment midpoint AND the width-grown ribbon), or
 *  null for a sub-2-sample ribbon (which can hold no segment). Non-finite
 *  stored samples are skipped exactly as the segment walk skips them.
 *  Memoized per ribbon mutation (RIBBON_BOUNDS above) — a pure cost device,
 *  never a rule. */
function wakeBounds(r: WakeRibbon): RibbonBoundsMemo | null {
  if (r.count < 2) return null;
  const newest = (r.head + r.count - 1) % r.cap;
  const oldest = r.head;
  const memo = RIBBON_BOUNDS.get(r);
  if (memo !== undefined && boundsMemoValid(memo, r, newest, oldest)) return memo.rad < 0 ? null : memo;
  const fresh = buildBoundsMemo(r, newest, oldest);
  RIBBON_BOUNDS.set(r, fresh);
  return fresh.rad < 0 ? null : fresh;
}

/** The uncached bound scan (wakeBounds' slow path): AABB over the finite live
 *  samples → centre + covering radius (+ half the core width), or the `rad:
 *  -1` dead marker when every stored sample was non-finite. */
function buildBoundsMemo(r: WakeRibbon, newest: number, oldest: number): RibbonBoundsMemo {
  const [minX, minY, maxX, maxY] = wakeAabb(r);
  const hw = (maxX - minX) / 2;
  const hh = (maxY - minY) / 2;
  const dead = minX > maxX; // every stored sample was non-finite
  return {
    head: r.head,
    count: r.count,
    tNew: r.ts[newest],
    xNew: r.xs[newest],
    yNew: r.ys[newest],
    xOld: r.xs[oldest],
    yOld: r.ys[oldest],
    cx: dead ? 0 : minX + hw,
    cy: dead ? 0 : minY + hh,
    rad: dead ? -1 : Math.sqrt(hw * hw + hh * hh) + r.widthU / 2,
  };
}

/** AABB over a ribbon's finite live samples — [minX, minY, maxX, maxY];
 *  inverted (min > max) when every stored sample was non-finite. */
function wakeAabb(r: WakeRibbon): [number, number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let n = 0; n < r.count; n++) {
    const i = (r.head + n) % r.cap;
    const x = r.xs[i];
    const y = r.ys[i];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

/**
 * One-slot per-(observer, sweep window) wedge memo for the CONSERVATIVE
 * swept prefilter below: the window's edge directions rotated OUTWARD by a
 * margin (1e-3 rad) that dwarfs any atan2/wrap rounding, as unit vectors, so
 * the prefilter's two cross products can only ever OVER-accept. Observers
 * are scanned sequentially, so one slot amortizes the trig to once per
 * observer per tick. `wide` disables the prefilter for a window too wide for
 * a two-half-plane wedge test (impossible from the real ~4.5°/tick sweep;
 * reachable only from directed-test windows) — fail open, decide nothing.
 */
interface WedgeMemo {
  me: ShipRecord;
  prev: number;
  cur: number;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  wide: boolean;
}
let lastWedge: WedgeMemo | null = null;
const WEDGE_MARGIN = 1e-3; // rad

function wedgeFor(me: ShipRecord): WedgeMemo {
  const m = lastWedge;
  if (m !== null && m.me === me && m.prev === me.prevSweepAngle && m.cur === me.sweepAngle) return m;
  const window = wrapPositive(me.sweepAngle - me.prevSweepAngle);
  const a = me.prevSweepAngle - WEDGE_MARGIN;
  const b = me.prevSweepAngle + window + WEDGE_MARGIN;
  const next: WedgeMemo = {
    me,
    prev: me.prevSweepAngle,
    cur: me.sweepAngle,
    ax: Math.cos(a),
    ay: Math.sin(a),
    bx: Math.cos(b),
    by: Math.sin(b),
    wide: window + 2 * WEDGE_MARGIN >= Math.PI,
  };
  lastWedge = next;
  return next;
}

/** CONSERVATIVE pre-reject for the swept clause (a pure cost device, never a
 *  rule): `false` PROVES sweptThisTick would answer false (the margin-grown
 *  wedge strictly contains the true half-open window); `true` decides
 *  nothing — the exact production predicate still runs. Two cross products
 *  against the memoized wedge edges replace an atan2 per candidate segment
 *  (measured: the bearing atan2 over every in-annulus segment was the
 *  second-largest wake-scan cost in a full room). */
function mayBeSwept(me: ShipRecord, dx: number, dy: number): boolean {
  const w = wedgeFor(me);
  if (w.wide) return true;
  return w.ax * dy - w.ay * dx >= 0 && w.bx * dy - w.by * dx <= 0;
}

/**
 * THE PER-SOURCE INNER DISCLOSURE BOUND (cycle-69 review gate, P2): the
 * radius inside which a source's water is NOT disclosed on the `wk` row. A
 * SHIP's wake stands in for the radar tier, so its inner bound is the sight
 * bubble (blipGate's annulus verbatim — the client synthesizes in-bubble hull
 * wake from the full pose it holds). A TORPEDO's wake stands in for the
 * fish's own DETECT tier: the fish reveals at `sightOf × detectFactor` (the
 * detect rung, pointDetected — 4/12 = sight since Story 9.8), so its water must disclose down to THAT radius —
 * with the ship bound, the (detect, sight] band was a dead band with no
 * entity, no disclosed wake, and no synthesized wake, killing amendment 196's
 * tell exactly in the terminal approach. Observer-scaled exactly as the tier
 * each bound mirrors (sightOf / pointDetected's own derivation), and it rides
 * `stats.radarRange` through them, so a future intel card moves both bounds
 * with no work here.
 */
function wakeInnerBound(me: ShipRecord, torp: boolean): number {
  const sight = sightOf(me);
  return torp ? sight * CONFIG.vision.detectFactor : sight;
}

/**
 * THE PER-SEGMENT WAKE GATE (the blipGate mirror, per source — see the wk
 * row's doc for the full rationale): inner bound < dist ≤ radar ∧ swept this
 * tick ∧ occlusion CONSISTENT WITH THE SENSOR THE BAND STANDS IN FOR —
 * inside the sight bubble (reachable only by torpedo water, whose inner
 * bound is detect) the fish itself is hidden by pointDetected's BINARY
 * island LOS (sightClear), so its water uses that same binary test (the
 * shadow march must never reveal water that the sight predicate hides —
 * precisely the leak the sight exclusion exists to prevent); beyond sight,
 * the amendment-179 shadow accumulator, exactly as a hull. No cloud term on
 * either half (Story 9.3 session 2, Eric 2026-10-12: a cloud hides nothing).
 * Clause order is blipGate's cost order.
 */
function wakeGate(ctx: FoggedSignalContext, seg: WakeSubject): boolean {
  const me = ctx.me;
  const dx = seg.x - me.state.x;
  const dy = seg.y - me.state.y;
  const d2 = dx * dx + dy * dy;
  const inner = wakeInnerBound(me, seg.torp);
  if (d2 <= inner * inner || d2 > me.stats.radarRange * me.stats.radarRange) return false;
  if (!sweptThisTick(me, bearing(me.state, seg))) return false;
  const sight = sightOf(me);
  // Inside the GEOMETRIC bubble the water is SIGHT-delivered (torpedo water
  // only — the ship bound is the bubble itself), so it pays the fog toll
  // like the fish it stands in for (Story 9.10; the bubble's edge itself,
  // the radar's inner bound, stays geometric — amendment 163).
  if (d2 <= sight * sight) return withinSight(ctx, me, seg, sight) && sightClear(me, seg, ctx.islands);
  // Beyond sight the water is a RADAR return: the shadow march, then the
  // dropout roll keyed on the water's source (Story 9.8, ruling 123). The
  // in-bubble half above (torpedo water inside sight) never rolls.
  if (visibilityTo(ctx.heightRaster, me.state.x, me.state.y, seg.x, seg.y) <= 0) return false;
  return radarPaints(ctx, Math.sqrt(d2), seg.key);
}

/**
 * THE RIBBON BROADPHASE (Story 4.12 spec: "cost scales with what the beam
 * crossed rather than with track length"): may ANY segment of this ribbon
 * pass the per-segment gate for this observer this tick? CONSERVATIVE ONLY —
 * a `true` here decides nothing (every disclosed segment still passes the
 * full per-segment gate); a `false` must be PROVABLY safe. Three culls, each
 * a superset bound of a gate clause:
 *   • entirely beyond radar (centre dist − rad > radarRange ⇒ every midpoint
 *     fails the annulus' outer bound);
 *   • entirely inside the source's INNER bound (centre dist + rad ≤ the
 *     ribbon's per-source inner radius — sight for a ship's water, DETECT
 *     for a torpedo's (review-gate P2) ⇒ every midpoint fails the inner
 *     exclusion — see the wk row's doc for the per-source split);
 *   • bearing span disjoint from this tick's swept wedge (observer outside
 *     the bounding circle ⇒ ribbon bearings ⊂ [centre bearing ± asin(rad/d)];
 *     an observer INSIDE the circle gets no bearing cull).
 * Exported for perception's wake scan — a cost gate beside the row, never a
 * rule: deleting every call site changes no frame, only its price.
 */
export function sweepMayCrossWake(me: ShipRecord, r: WakeRibbon): boolean {
  const b = wakeBounds(r);
  if (b === null) return false;
  const dx = b.cx - me.state.x;
  const dy = b.cy - me.state.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d - b.rad > me.stats.radarRange) return false;
  if (d + b.rad <= wakeInnerBound(me, r.torp)) return false;
  if (d <= b.rad) return true; // observer inside the bound — no bearing cull
  const half = Math.asin(Math.min(1, b.rad / d));
  const window = wrapPositive(me.sweepAngle - me.prevSweepAngle);
  // Centre bearing from the already-computed delta (bearing() is atan2 of the
  // same delta — inlined to keep the helper's Vec2 shape out of this bound).
  const offset = wrapPositive(Math.atan2(dy, dx) - half - me.prevSweepAngle);
  // Arc-interval intersection on the circle: the ribbon arc [start, start+2h]
  // meets the sweep window [prev, prev+window) iff its start lies inside the
  // window, or the window's start lies inside the arc (the wrap case).
  return offset < window || offset > 2 * Math.PI - 2 * half;
}

/** The memoized segment-mask pipeline (the paintMask precedent): a wake mask
 *  is a pure function of (segment geometry, PAINT TICK) — since the cycle-69
 *  review gate (P3) the flanks glint per paint through
 *  `paintSegmentCoverage`, so `t` is in the one-slot key exactly as it is in
 *  paintMask's. Consecutive observers whose beams cross the same segment in
 *  the SAME tick still reuse the mask (the seed is observer-free); a later
 *  revolution re-draws it, which is the scintillation working. */
interface WakeMaskMemo {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  widthU: number;
  t: number;
  mask: HullCoverage;
}
let lastWakeMask: WakeMaskMemo | null = null;

function wakeMask(s: WakeSubject, t: number): HullCoverage {
  const m = lastWakeMask;
  if (m !== null && m.ax === s.ax && m.ay === s.ay && m.bx === s.bx && m.by === s.by && m.widthU === s.widthU && m.t === t) {
    return m.mask;
  }
  const mask = paintSegmentCoverage(s.ax, s.ay, s.bx, s.by, s.widthU, CONFIG.vision.radarCellU, t);
  lastWakeMask = { ax: s.ax, ay: s.ay, bx: s.bx, by: s.by, widthU: s.widthU, t, mask };
  return mask;
}

/**
 * `wk` — a wake ribbon segment the observer's beam crossed this tick (Story
 * 4.12): disturbed water as a weak surface return. NOT a declared exception
 * to the master perception invariant — the gate mirrors the three `blipGate`
 * clauses per SEGMENT in the same cost order (annulus → swept-this-tick →
 * occlusion), evaluated at the segment MIDPOINT; segments are ~one sample
 * cadence (12u) long, so the midpoint predicate is about as tight as the
 * hull's centre predicate already is (a ledgered cycle-68 imprecision,
 * inherited knowingly). What is new is only that the subject is water rather
 * than a ship.
 *
 * THE INNER BOUND IS PER SOURCE (cycle-69 review gate, P2 — see
 * wakeInnerBound/wakeGate above): a SHIP's water inherits blipGate's sight
 * exclusion verbatim, a TORPEDO's water discloses down to the DETECT radius.
 * The ship-side exclusion stays a ruled implementation choice, recorded
 * here: a HULL inside sight behind an island is invisible by design (not a
 * contact — island LOS; not a blip — the annulus is what keeps the two
 * tiers' different occlusion predicates from answering for the same point,
 * see inRadarAnnulus). Disclosing in-bubble ship water through the radar's
 * shadow march would re-open exactly that seam — a fresh bucket-0 segment
 * ends within one cadence of its hull's stern, so in-bubble wake behind an
 * island would leak a hidden hull's position. Amendment 154's "the split
 * must not be visible" is satisfied the way amendment 88 already satisfies
 * it for hull paints: inside truesight the client synthesizes the same
 * appearance from the full pose it already holds (contacts/own ship — the
 * amendment 202/206 chop path), so scope and water agree from both sources.
 * Orphaned in-bubble water a client never learned of is unknowable to BOTH
 * its renderings — scope and water agree on silence — and previously-
 * disclosed paints persist on phosphor across the boundary AT THE BASE SWEEP
 * RATE (the three-clocks coincidence, amendment 205; a maxed intelSweep
 * build's three-paint window is 6s against 12s water — the ACCEPTED
 * shortfall ruled at the cycle-69 gate, P4, pinned in shared zone.test.ts).
 * The torpedo side has no such synthesis to lean on — beyond detect the
 * client is never told the fish exists — so the same exclusion produced a
 * dead band in (detect, sight] that killed amendment 196's tell in the
 * terminal approach; detect is therefore the fish-water bound, and its
 * IN-BUBBLE OCCLUSION IS BINARY ISLAND LOS, matching pointDetected (the
 * sensor it stands in for) rather than the shadow march (wakeGate above).
 *
 * NO ownZoneCovers term, deliberately (the blip row's zone clause exists
 * because a zone-covered ship is already a FULL contact — water has no
 * contact tier to double). NO self-exclusion: your own wake DOES paint on
 * your own scope (amendment 204 — physically right; the client's near-range
 * display mask keeps it quiet). Spectators get none (they have no radar —
 * the blip rule).
 *
 * materialize() emits GEOMETRY plus the age bucket and NOTHING else
 * (amendment 194): no ship id, class, hue, owner, or hull↔wake linkage — the
 * segment coverage on the shared lattice (paintSegmentCoverage at
 * CONFIG.vision.radarCellU with the source-derived width) and the quantized
 * water-age bucket, which IS the recency channel (the client cannot infer
 * which end of a track is new — that inference would BE the identity linkage
 * the payload refuses to carry). The mask is GLINTED PER PAINT (cycle-69
 * review gate, P3): the sharp ribbon's lit-row count was the source's exact
 * beam — a class lookup table, the leak amendments 156-158 closed on hulls —
 * so the flanks scintillate on a (time, exact pose) seed while the spine
 * stays core; dilation stays OFF (wave 1's ruling: the hull's structural
 * smear would blob a one-cell ribbon).
 */
const wakeSignal: SignalSpec<WakeSubject, WakeBlipEvent> = {
  eventType: 'wk',
  visible(ctx, seg) {
    // Wake events are perception-generated, never world-emitted: a world-
    // dispatched 'wk' WIRE event (no `ax` on the wire shape) fails closed.
    if (!('ax' in seg)) return false;
    if (ctx.mode !== 'fogged') return false;
    // Conservative swept PREFILTER (mayBeSwept — a cost device that can only
    // over-accept, so it decides nothing): in wake geometry the ~4.5° wedge
    // is by far the most selective spatial clause, and this keeps the atan2
    // off the vast majority of a crossed ribbon's segments. The REAL gate
    // (wakeGate) then mirrors blipGate's clause order exactly, with the
    // per-source inner bound and occlusion split documented above.
    if (!mayBeSwept(ctx.me, seg.x - ctx.me.state.x, seg.y - ctx.me.state.y)) return false;
    return wakeGate(ctx, seg);
  },
  materialize(ctx, seg) {
    // KEY ORDER IS LOAD-BEARING (msgpack): k,t,a,gx,gy,w,h,bits — the
    // ReturnBlipEvent order with the age bucket after `t`.
    const c = wakeMask(seg, ctx.now);
    return { k: 'wk', t: ctx.now, a: seg.bucket, gx: c.gx, gy: c.gy, w: c.w, h: c.h, bits: c.bits };
  },
};

/**
 * THE BALLISTIC REVEAL GATE — "is this live projectile disclosable to this
 * observer THIS TICK", independent of memory. THE one predicate for the two
 * reveal rows, the torpU row AND perception.ballisticScan's per-visit clear
 * step (Story 8.13, epic-8 amendment 78): a second hand-rolled copy of this
 * boolean is exactly the desync class this file exists to prevent — the mark
 * would be cleared by one rule and re-set by another.
 *
 *   - no record (a record-less spectator): fail-closed, never open;
 *   - a spectator WITH a record: always open (unfogged);
 *   - the OWNER: always open — own projectiles are revealed once at launch
 *     and, since the gate never closes on them, never cleared, never re-sent;
 *   - everyone else: first-sight (`shell` — SHELLS DO NOT MOVE: a shell is in
 *     the air, truesight) / first-detect (`torp` — a wake just under the
 *     surface, the detect rung; Story 4.9, amendments 119/121; 4/12 since 9.8) OR inside a lit
 *     zone the observer OWNS (Story 1.7 truesight parity).
 *
 * Callers guard the subject shape (`'ownerId' in shell`) before asking; the
 * gate branches on the record's own `kind`.
 */
export function ballisticGateOpen(ctx: SignalContext, shell: ShellState): boolean {
  const me = ctx.me;
  if (!me) return false;
  if (ctx.mode === 'spectator') return true;
  return (
    shell.ownerId === me.id ||
    (shell.kind === 'torp'
      ? pointDetected(me, shell, ctx)
      : pointSighted(me, shell, ctx)) ||
    ownZoneCovers(ctx, shell)
  );
}

/**
 * `shell` / `torp` — per-observer ballistic reveal, ONCE PER VISIT of the gate
 * (ShipRecord.seenBallistics — a per-visit mark since Story 8.13, epic-8
 * amendment 78: perception.ballisticScan clears it the first tick a still-live
 * projectile is outside the gate, so a projectile that leaves and re-enters is
 * revealed again, in this same shape, with `t` = the re-reveal time; while it
 * stays inside it is never re-sent — byte-identical to the old exactly-once
 * behaviour). The OWNER always gets it at launch. Everyone
 * else gets it when the projectile becomes visible (within sight + LOS),
 * with CURRENT pos/velocity ONLY — never a range-derivable field (no ttl /
 * distLeft). The client dead-reckons from there, so a shell fired outside your
 * bubble materializes at your sight boundary, never at its (hidden) launch
 * point; and a constant-free wire shape cannot be solved back to the muzzle
 * (see BallisticEvent's anti-cheat note). Spectators skip the sight gate but
 * keep the exactly-once reveal memory: a projectile launched BEFORE the
 * observer died (and never sighted) still materializes with current params,
 * and this-tick launches are not double-sent. A spectator with no ship record
 * has no reveal memory — fail-closed, no reveals.
 *
 * Two registry rows (two wire kinds), one shared implementation — with ONE
 * deliberate fork (Story 4.9, amendments 119/121): the GATE branches on kind.
 * A shell first reveals at the truesight boundary (pointSighted — SHELLS DO
 * NOT MOVE: a shell is in the air); a torpedo first reveals at the DETECT
 * boundary (pointDetected, the detect rung — a wake just under the surface).
 * Everything else — the owner-always path, the owned-zone OR, the
 * exactly-once seenBallistics memory, the wire shape — is identical for both.
 */
function ballisticSignal(kind: 'shell' | 'torp'): SignalSpec<ShellState, BallisticEvent> {
  return {
    eventType: kind,
    visible(ctx, shell) {
      // Only a LIVE projectile record may reveal. A world-emitted 'shell'/'torp'
      // event reaching this row via tickEvents dispatch (no ownerId on the wire
      // shape) is dropped — reveals are re-issued per observer by the scan.
      if (!('ownerId' in shell) || shell.kind !== kind) return false;
      const me = ctx.me;
      if (!me || me.seenBallistics.has(shell.id)) return false;
      // The mark is PER VISIT (Story 8.13): perception.ballisticScan clears it
      // the first tick a still-live projectile fails THIS SAME gate, so a
      // re-entry reveals again. One predicate, shared with the clear step —
      // never a second copy of the boolean.
      return ballisticGateOpen(ctx, shell);
    },
    materialize(ctx, shell) {
      // PURE wire-shaper — no mutation. Marking the projectile seen (the
      // exactly-once semantics) is the SCAN's job: perception.ballisticScan
      // marks each revealed id immediately after pushing this shape. A mutating
      // materialize on a publicly importable registry would let Story 1.8's
      // counter-intel wiring accidentally consume reveals just by shaping one.
      // `t` is REVEAL time (ctx.now), never the projectile's bornAt.
      const ev: BallisticEvent = { k: shell.kind, id: shell.id, x: shell.x, y: shell.y, vx: shell.vx, vy: shell.vy, t: ctx.now };
      // THE ONE DECLARED FAMILY FIELD (Story 8.15, amendment 89(i)): a SHELL
      // reveal carries `w` — the gun family that fired it, from the fixed
      // three-word set — appended LAST so the key order is {k,id,x,y,vx,vy,t,w}.
      // Never on a `torp` (this row's `kind` is the predicate, and a torpedo's
      // family is null besides): torpedoes stay blind. It names no shooter,
      // no range and no tier, so the constant-free anti-cheat argument holds.
      if (kind === 'shell' && shell.family !== null) ev.w = shell.family;
      return ev;
    },
  };
}

/** deg → rad for the torpU emission threshold (CONFIG authors it in degrees). */
const TORP_UPDATE_THRESHOLD_RAD = (CONFIG.torpedo.homingUpdateAngleDeg * Math.PI) / 180;

/** Has this torpedo's velocity direction drifted ≥ the torpU threshold from
 *  what `me` last received for the track? False when the observer holds no
 *  baseline (never revealed — updates only ever follow a reveal). */
function homingTrackDrifted(me: ShipRecord, shell: ShellState): boolean {
  const last = me.torpDirs.get(shell.id);
  if (last === undefined || !me.seenBallistics.has(shell.id)) return false;
  return Math.abs(wrapAngle(Math.atan2(shell.vy, shell.vx) - last)) >= TORP_UPDATE_THRESHOLD_RAD;
}

/**
 * `torpU` — a STEERING (ACOUSTIC HOMING) torpedo's ballistic update (Story
 * 2.8): the enemy client dead-reckons a torpedo from its reveal velocity, so a
 * fish whose velocity DIRECTION has drifted ≥ CONFIG.torpedo.
 * homingUpdateAngleDeg from what THIS observer last received re-emits current
 * pos + velocity — same constant-free shape rule as the reveal ({k,id,x,y,vx,
 * vy,t}: no range-derivable field may EVER be added). Emitted ONLY to an
 * observer for whom the track is ALREADY revealed (seenBallistics — the
 * exactly-once convention relaxes to allow UPDATES keyed by the same id, for
 * this row alone) AND who can currently see it via the torpedo reveal
 * predicate (owner / DETECT+LOS — Story 4.9's pointDetected, matching the
 * `torp` reveal gate so corrections stop exactly where first reveal starts /
 * owned lit zone; spectators skip the gate, mirroring the reveal row). NOT
 * self-private: torpU is an OBSERVED-projectile event, gated like the
 * reveals. The per-observer direction baseline lives in ShipRecord.torpDirs
 * (set at reveal, advanced by perception's scan after each emission —
 * materialize stays a pure shaper).
 */
const torpedoUpdateSignal: SignalSpec<ShellState, TorpedoUpdateEvent> = {
  eventType: 'torpU',
  visible(ctx, shell) {
    // Only a LIVE homing torpedo record may update. A fabricated world-emitted
    // 'torpU' event reaching this row via tickEvents dispatch (no ownerId /
    // homing on the wire shape) is dropped — fail-closed.
    if (!('ownerId' in shell) || shell.kind !== 'torp' || shell.homing === undefined) return false;
    const me = ctx.me;
    if (!me || !homingTrackDrifted(me, shell)) return false;
    return ballisticGateOpen(ctx, shell); // a torp's gate: owner / DETECT+LOS / owned zone
  },
  materialize(ctx, shell) {
    // KEY ORDER IS LOAD-BEARING (k,id,x,y,vx,vy,t) — the BallisticEvent order.
    // `t` is UPDATE time (ctx.now).
    return { k: 'torpU', id: shell.id, x: shell.x, y: shell.y, vx: shell.vx, vy: shell.vy, t: ctx.now };
  },
};

// ---------------------------------------------------------------------------
// World-event forwarding channels (subject = the world-emitted GameEvent).
// ---------------------------------------------------------------------------

/**
 * `boom` — visible iff the boom location is within sight + LOS, inside a lit
 * zone the observer OWNS (Story 1.7 truesight parity — everything a firer's
 * zone reveals can also visibly explode), OR the boom struck the observer
 * (`hit === me`). The shell's owner does NOT get an out-of-sight boom on THIS
 * row — but the original rationale ("hit confirmation beyond sight would leak
 * contact presence") is SUPERSEDED for the owner-hit case by Story 4.3,
 * amendment 17: out-of-sight hit confirmation is now the deliberate,
 * narrowly-scoped job of the SELF-PRIVATE Hit Call row (`hc`, hitCallSignal
 * below) — position only, never a victim id or severity — because the
 * ratified decoy disambiguation oracle depended on it (that oracle is moot
 * since Story 7-5 wave 2 deleted the decoy — the RULING stands on its own:
 * a shooter learns that something of theirs connected). Bystanders and victims
 * keep today's boom rules exactly; the owner's dead-reckoned shell still just
 * expires by client lifetime on this row. Even when the boom IS visible, its
 * `hit` (victim id) is stripped unless the victim's CENTER is itself sighted
 * or zone-covered (or the observer IS the victim): a hull can straddle the
 * sight edge with its center in fog, and emitting the id there would leak the
 * victim's identity. A hit-less boom just plays a generic impact/splash on
 * the client. Spectators get the raw event.
 */
const boomSignal: SignalSpec<BoomEvent, BoomEvent> = {
  eventType: 'boom',
  visible(ctx, e) {
    if (ctx.mode === 'spectator') return true;
    return e.hit === ctx.me.id || pointSighted(ctx.me, e, ctx) || ownZoneCovers(ctx, e);
  },
  materialize(ctx, e) {
    if (ctx.mode === 'spectator') return e;
    const me = ctx.me;
    if (!e.hit || e.hit === me.id) return e;
    const victim = ctx.ships.get(e.hit);
    if (victim && (pointSighted(me, victim.state, ctx) || ownZoneCovers(ctx, victim.state))) {
      return e;
    }
    return { k: 'boom', id: e.id, x: e.x, y: e.y }; // impact visible, victim id stripped
  },
};

/**
 * Server-INTERNAL burst subject: the wire BurstEvent plus the firing shell's
 * ownerId, carried only inside World.tickEvents for the owner-visibility rule
 * below. `own` NEVER reaches the wire — materialize() always rebuilds the
 * bare {k,id,x,y} shape, on BOTH the fogged and spectator paths.
 */
export interface BurstSubject extends BurstEvent {
  own: string;
}

/**
 * `burst` — a gun shell detonating at its target point. Visible to the shell
 * OWNER (the burst centers on the point they clicked, so it reveals nothing
 * they didn't author — unlike boom, whose owner-suppression rule guards
 * against hit-confirmation leaks), to anyone with the burst point sighted
 * (sight + LOS, the boom pattern), or with the point inside a lit zone the
 * observer OWNS (Story 1.7). Damage never rides here — burst victims
 * get their own victim-private dmg events; burstRadius is CONFIG, never on
 * the wire.
 *
 * ABSENCE-INFERENCE CHANNEL (accepted by design): the owner ALWAYS sees their
 * own burst, so the ABSENCE of a burst after a shot leaks one bit — "something
 * intercepted the shell short of the target." This is deliberately tolerated
 * because it is subsumed by radar: islands stop shells, so an island-shadowed
 * hull can never be probed this way, and any LOS-clear hull inside gun range
 * (gun range = radar range) is painted by the radar sweep within one ~4s
 * revolution regardless. The owner learns nothing the sweep would not reveal.
 */
const burstSignal: SignalSpec<BurstSubject, BurstEvent> = {
  eventType: 'burst',
  visible(ctx, e) {
    if (ctx.mode === 'spectator') return true;
    return e.own === ctx.me.id || pointSighted(ctx.me, e, ctx) || ownZoneCovers(ctx, e);
  },
  materialize(_ctx, e) {
    // ALWAYS a fresh bare object — never `e` verbatim, which would leak the
    // server-internal `own` field (spectator path included).
    return { k: 'burst', id: e.id, x: e.x, y: e.y };
  },
};

/**
 * The observer legitimately WITNESSED the wreck — today's historical sunk
 * gate, extracted verbatim: spectator, the observer's own hull, or the wreck
 * position sighted (sight + LOS) / inside a lit zone the observer OWNS
 * (Story 1.7 truesight parity, so a firer watches a zone-revealed hull
 * actually go down). Fail-closed on a missing wreck record. This predicate is
 * BOTH a visibility clause and the per-observer `seen` stamp (materialize
 * below), so today's gate keeps its exact meaning and simply becomes a flag
 * instead of a filter.
 */
function sunkWitnessed(ctx: SignalContext, e: SunkEvent): boolean {
  if (ctx.mode === 'spectator' || e.id === ctx.me.id) return true;
  const wreck = ctx.ships.get(e.id);
  if (wreck === undefined) return false;
  return pointSighted(ctx.me, wreck.state, ctx) || ownZoneCovers(ctx, wreck.state);
}

/**
 * The sinking is CREDITED TO this observer — your kill, at any range and
 * through any fog (the amendment 17 principle, terminal case: "your target
 * went down" is the end of the same shooter-only conversation the Hit Call
 * opened). THE single site the future "or a teammate's kill" extension
 * changes — nothing else may re-derive kill credit.
 */
function sunkCreditedTo(ctx: SignalContext, e: SunkEvent): boolean {
  return e.by !== undefined && e.by === ctx.me?.id;
}

/**
 * `sunk` — THE PUBLIC REGISTER (global kill feed): the 4th DECLARED exception
 * to the master perception invariant (joining Story 4.3's `sp`/`hc`/`mz`),
 * with its own independently-reimplemented oracle in perception.test.ts.
 * Three clauses, three separate reasons:
 *   • WITNESSED (sunkWitnessed — today's rule, unchanged): spectator, own
 *     hull, or wreck position sighted / owned-zone-covered;
 *   • CREDITED TO YOU (sunkCreditedTo — the amendment 17 shooter-only
 *     principle): you learn that anything you sank went down, drone included;
 *   • THE VICTIM IS A COMBATANT (`isParticipant(wreck)`): every captain's
 *     sinking reaches every client. This is the single site the PvE/combat-bot
 *     distinction runs through, and since Story 6.3 it reads the PARTICIPANT
 *     seam — so a 6.4 AI captain's sinking is public, exactly as a human's is,
 *     with no edit here.
 * ANTI-LEAK RATIONALE for the public clause: the PUBLIC payload is IDENTITY
 * ONLY ({k,id,by?} — no position, class, hue, damage, or weapon field). Story
 * 5.6's `vcls` does not weaken that: it is stamped for the CREDITED KILLER
 * alone (stampVictimClass below), so no row that reaches an observer on the
 * public clause ever carries a class ABOUT A PLAYER. Story 7.6's `kcls` does
 * reach the public clause — it is observer-independent — but it names a PvE
 * FLEET hull's tier and nothing else (stampKillerClass below): never a
 * captain's class, no position, no hue, no weapon. And
 * ArenaRoom.syncRoster() already makes the FACT of every sinking public —
 * alive/kills/deaths mirror to every client. What this row adds beyond the
 * schema is precision, and that is the honest scope of the ratification: the
 * event is a SAME-TICK channel (frame events send synchronously each tick;
 * schema patches ride Colyseus's patch-rate timer), and it PAIRS killer to
 * victim explicitly via `by` — two same-tick kills by different killers
 * aggregate in the counters as (+1, +1) and cannot be paired back from
 * deltas. So the public clause makes ATTRIBUTION explicit and same-tick;
 * it does not merely restate the schema. Drone sinkings are NOT public
 * (drones are not contestants — a
 * drone kill is a fraction of a level via CONFIG.xp.droneTierLevels where a
 * captain is a full one); they arrive only witnessed or credited.
 * materialize() stamps the per-observer `seen: true` exactly when
 * sunkWitnessed holds — the client gates everything SPATIAL (sink VFX,
 * contact teardown) on it, so location stays as protected as it is today.
 */
const sunkSignal: SignalSpec<SunkEvent, SunkEvent> = {
  eventType: 'sunk',
  visible(ctx, e) {
    if (sunkWitnessed(ctx, e) || sunkCreditedTo(ctx, e)) return true;
    const wreck = ctx.ships.get(e.id);
    return wreck !== undefined && isParticipant(wreck); // the public register: combatants only
  },
  materialize(ctx, e) {
    // ALWAYS a fresh object (the burstSignal discipline): KEY ORDER IS
    // LOAD-BEARING (msgpack): k,id,by?,seen?,bty?,vcls?,kcls? — and NEVER a key whose
    // value is undefined (msgpack encodes it; world-emitted storm deaths
    // carry `by: undefined`, which must leave the wire as an ABSENT key).
    const out: SunkEvent = { k: 'sunk', id: e.id };
    if (e.by !== undefined) out.by = e.by;
    if (sunkWitnessed(ctx, e)) out.seen = true; // per-observer; spectators always carry it
    // `bty` (Story 4.6, Eric rulings 2026-08-10): which PARTICIPANT held the
    // bounty throne at the pre-sink instant — 'v' the victim, 'k' the killer.
    // Appended LAST, only when present. This adds NO disclosure: 'v' only
    // ever rides a combatant sinking (a drone can never hold the throne, so
    // it is already public via this row's third clause); 'k' may ride a DRONE
    // wreck (the leader sinks a drone), but that event reaches only the
    // witness and the credited killer, both of whom already know the leader's
    // identity from the public ArenaState.bountyId — and `by` is already on
    // the line. Unlike `seen` it is observer-INDEPENDENT — passed through
    // verbatim from the world's pre-sink read, never re-derived per observer.
    if (e.bty === 'v' || e.bty === 'k') out.bty = e.bty;
    stampVictimClass(ctx, e, out);
    stampKillerClass(ctx, e, out);
    return out;
  },
};

/**
 * `vcls` — THE VICTIM'S HULL ID, TO THE CREDITED KILLER ALONE (Story 5.6,
 * epic-5 amendment 43, Eric ruling 2026-08-14): *"I want to know the kills I
 * get when I get them... if a Small Drone is killed by my mine."*
 *
 * WHY IT MUST BE ON THE WIRE. You can sink a fleet ship you never saw — a
 * mine it sailed over, or a shell fired from beyond sight, since every gun's
 * reach is its own dial on the twelfths ruler (Story 9.8, ruling 125) and the
 * deck gun's reaches past truesight. With fleet hulls off the roster (amendment 39) the
 * client then holds no name, no hull and no row for that id at all, so the
 * feed could only read `UNKNOWN VESSEL`. The server knows; nobody else can.
 *
 * PER-OBSERVER, on the `seen` pattern and DELIBERATELY NOT the `bty` one:
 * `bty` is observer-independent (every recipient gets the same value), while
 * this key exists for exactly one recipient. ONE GATE, not two:
 * `by === observerId` — THE CREDITED KILLER, FULL STOP, the same identity
 * `sunkCreditedTo` reads. A bystander who WITNESSED the identical sinking gets
 * the row without the key; a SPECTATOR who IS the credited killer gets it.
 *
 * THE VIEW MODE IS NOT A GATE (orchestrator ruling, review gate). An earlier
 * draft also required `mode === 'fogged'`, reading amendment 43's *"witnesses
 * and spectators included"* as excluding a dead killer — a misreading: that
 * phrase names OBSERVERS WHO ARE NOT THE KILLER. Eric's ruling is *"I want to
 * know the kills I get when I get them"*, and a mine you laid before you died,
 * tripped by a fleet ship while you spectate, is exactly such a kill — the
 * SIZE is the payout, so withholding it withholds the thing the ruling asks
 * for. A one-gate rule is also strictly simpler than a two-gate one and cannot
 * drift from `sunkCreditedTo`. No leak: materialize() runs PER OBSERVER, so
 * `by === observerId` still admits exactly one recipient regardless of mode.
 *
 * NO SEVENTH PERCEPTION EXCEPTION. The row is already a declared exception
 * and already reaches its killer through `sunkCreditedTo`; this adds one
 * attribute for the one client that earned the XP for it and could already
 * read the size back out of the payout tier. The master invariant stays at
 * exactly SIX.
 *
 * EVERY VICTIM, not just fleet hulls — a captain kill carrying its victim's
 * class to its killer alone is the same disclosure class (the killer already
 * has the wreck and the feed line names them), and a uniform rule has one
 * oracle instead of two. Appended LAST; the key is OMITTED when it does not
 * apply, never `undefined` (msgpack encodes that).
 */
function stampVictimClass(ctx: SignalContext, e: SunkEvent, out: SunkEvent): void {
  if (e.by === undefined || e.by !== ctx.observerId) return;
  const wreck = ctx.ships.get(e.id);
  if (wreck !== undefined) out.vcls = wreck.hullId;
}

/**
 * `kcls` — THE KILLER'S HULL ID, AND ONLY EVER A PvE FLEET HULL'S (Story 7.6,
 * Eric ruling 2026-08-21): *"if someone gets sunk by a drone, you can tell me
 * what drone sunk them. Its fine. UNKNOWN VESSEL can only be a drone anyway.
 * Please, let me laugh and foghorn salute the dumbass who died to a drone."*
 *
 * WHY IT MUST BE ON THE WIRE — the MIRROR of `vcls`, not a widening of it. A
 * fleet hull can sink a captain from outside every observer's truesight bubble,
 * and with fleet hulls off the roster (amendment 39) no client then holds a
 * name, a hull or a row for that killer id. Because a CAPTAIN victim's sinking
 * is PUBLIC (the third clause above), that line renders on every client, and
 * every one of them could only read `UNKNOWN VESSEL`. The ever-seen hull memo
 * covers the killer we once had in our bubble; this key covers the case the
 * memo structurally cannot.
 *
 * FLEET HULLS ONLY — THE ONE CONSTRAINT THAT MATTERS, and it is enforced here
 * and nowhere else. `killer.role !== 'fleet'` returns without stamping. A
 * captain's hull class is NOT disclosed by this row today, and widening it
 * would be a genuine new disclosure about a PLAYER (their class is a build fact
 * you read off a contact when you can actually see them). A fleet hull's tier
 * is about nobody — a server-spawned PvE hull whose existence, size mix and
 * tier ladder are fixed by CONFIG and identical every match.
 *
 * OBSERVER-INDEPENDENT, on the `bty` pattern and deliberately NOT the
 * `seen`/`vcls` one: the fact it carries is the same for every recipient, so
 * per-observer stamping would only invent a difference that does not exist.
 * NO SEVENTH PERCEPTION EXCEPTION: the row is already a declared exception, and
 * this key discloses nothing spatial, nothing about any observer's sensors and
 * nothing about any player. The master invariant stays at exactly SIX.
 *
 * FAIL-CLOSED on a missing killer record (a killer who left the room between
 * the sinking and the frame): the key is simply omitted and the client falls
 * back exactly as it does today. Appended LAST, after `vcls`; OMITTED rather
 * than `undefined` (msgpack encodes that).
 */
function stampKillerClass(ctx: SignalContext, e: SunkEvent, out: SunkEvent): void {
  if (e.by === undefined || e.by === e.id) return; // no credited killer / self-sink
  const killer = ctx.ships.get(e.by);
  // THE GATE. Never a captain, never an AI captain ('bot'), never anything but
  // a PvE fleet hull — see the note above; this is the whole safety argument.
  // Read through the Story 6.3 role SEAM (`isFleetHull` is WORLD CONTENT, the
  // exact reading this key needs) rather than a raw `role ===` comparison, so a
  // future role lands on the safe side without an edit here.
  if (killer === undefined || !isFleetHull(killer)) return;
  out.kcls = killer.hullId;
}

/**
 * `spawn` — visible to the spawner itself, and to anyone who can see the spawn
 * point (sight + LOS, or inside a lit zone the observer OWNS — Story 1.7).
 * Spectators get the raw event.
 */
const spawnSignal: SignalSpec<SpawnEvent, SpawnEvent> = {
  eventType: 'spawn',
  visible(ctx, e) {
    if (ctx.mode === 'spectator') return true;
    return e.id === ctx.me.id || pointSighted(ctx.me, e, ctx) || ownZoneCovers(ctx, e);
  },
  materialize(_ctx, e) {
    return e;
  },
};

/**
 * SELF-PRIVATE kinds: forwarded ONLY to the ship the event names — dmg
 * (victim), pt (earner), bn (the boon a spend FITTED — Story 2.7), dp (a
 * consumable a drone kill STOCKED — Eric ruling 2026-10-01), heal (the
 * DAMAGE CONTROL spend — Eric rulings 2026-08-04). Enemy hp, builds, boons,
 * level banks, and repairs all stay hidden by this one gate (levels / boon ids
 * ride ONLY on OwnShip, never on contacts/blips/booms). (The 'upg' row died
 * with the legacy upgrade economy — Story 2.8's wholesale strip.)
 *
 * `spectatorPublic`: dmg alone passes through unfiltered to spectators (they
 * may watch a fight's hp — a dead player has no channel back into the match).
 * pt/bn/dp/heal stay self-private even in UNFOGGED spectator frames: a
 * dead-in-active captain still gets its own level/fit toasts (spending while
 * dead is legal), but no other spectator may learn a living ship's fitted
 * boon, level bank, or that it just repaired. (The 'heal' row LEFT with the
 * REPAIR spend — Story 2.1, Eric ruling 2026-07-24 — and RETURNED with the
 * DAMAGE CONTROL strip, 2026-08-04, on strictly tighter terms: no hp amount,
 * no total, no victim id, nothing derivable about another ship.)
 */
function selfPrivateSignal<E extends DamageEvent | PointEvent | BoonFitEvent | DropEvent | HealEvent>(
  kind: E['k'],
  spectatorPublic: boolean,
): SignalSpec<E, E> {
  return {
    eventType: kind,
    visible(ctx, e) {
      if (ctx.mode === 'spectator' && spectatorPublic) return true;
      return e.id === ctx.observerId;
    },
    materialize(_ctx, e) {
      return e;
    },
  };
}

/**
 * SHOOTER-PRIVATE kinds (Story 4.3) — the selfPrivateSignal idiom applied to
 * the gunnery events `sp`/`hc`, whose `id` names the SHOOTER rather than a
 * victim/earner. A separate factory (not a widening of selfPrivateSignal's
 * union) so the dmg/pt/bn gate keeps its exact historical type. Both rows are
 * spectator-public, exactly like `dmg` (a dead player may watch the gunnery
 * conversation; there is no channel back into the match).
 */
function shooterPrivateSignal<E extends SplashEvent | HitCallEvent>(kind: E['k']): SignalSpec<E, E> {
  return {
    eventType: kind,
    visible(ctx, e) {
      if (ctx.mode === 'spectator') return true; // spectator-public, the dmg precedent
      return e.id === ctx.observerId;
    },
    materialize(_ctx, e) {
      return e; // world-emitted key order (k,id,x,y) forwarded verbatim
    },
  };
}

/**
 * `sp` — FALL OF SHOT (Story 4.3, amendment 16): the shooter's own shell
 * terminated without resolving any victim; a splash at the true impact point,
 * for the shooter ALONE, at any range and through any fog. A DECLARED
 * exception to the master perception invariant: it references a point outside
 * the observer's sight ∪ paints, justified because the point is one the
 * shooter authored (their own click / their own shell's flight) — the burst
 * row's owner rationale, extended to misses. Self-private + spectator-public:
 * exactly the `dmg` row's shape. GUN-FAMILY ONLY at the emission site (wire
 * kind 'shell'): torpedoes and mines never produce one (World.emitSplash).
 */
const fallOfShotSignal = shooterPrivateSignal<SplashEvent>('sp');

/**
 * `hc` — HIT CALL (Story 4.3, amendments 17/18): something the shooter fired
 * or laid CONNECTED — position only, never a victim id or any severity
 * channel. A DECLARED exception to the master perception invariant AND a
 * knowing supersession of the boom row's owner anti-leak rule for the
 * owner-hit case ONLY (see the boom row's amended comment): leaking
 * "something of yours connected out there" to its owner is now the intended
 * feature (it was ratified to keep the decoy disambiguation oracle alive; the
 * decoy is deleted since Story 7-5 wave 2 and the row is unchanged).
 * Self-private + spectator-public: exactly the `dmg` row's shape. ALL
 * ORDNANCE at the emission sites: gun, broadside — one `hc` PER SHELL of a
 * barrage (R2.5) — star shells, torpedo, mines.
 */
const hitCallSignal = shooterPrivateSignal<HitCallEvent>('hc');

/**
 * `mz` — MUZZLE FLASH (Story 4.3, amendments 15/19/20): a gun-family weapon
 * fired at this point. A DECLARED exception to the master perception
 * invariant with its own NEW spatial rule: visible iff
 * dist(observer, flash) ≤ the muzzle-flash halo (`muzzleFlashReach` — the
 * ladder's 6/12 rung since Story 9.8, radarRange × muzzleFlashFactor; the
 * CONSTANT, deliberately NOT the observer's own sightOf: a flash is a light
 * source, not an illuminated object, so no sight reduction — the FLASH SHELLS
 * dazzle, while it existed (Story 8.17 – 9.4) — changes how far it carries,
 * and intel boons do not widen it) ∧
 * SIGHT clear (island LOS — the standing 2026-08-02 ruling: islands block
 * EVERY sensor at ALL ranges). Deliberately NO ownZoneCovers term — a star-shell
 * zone does not help you see a flash you are too far away from. materialize
 * returns the bare {k,x,y} for EVERY observer — shooter and spectators
 * included; there is no privileged view of this row and no identity of any
 * kind on it (amendment 19: the flash must create a question, not answer
 * one).
 */
const muzzleFlashSignal: SignalSpec<MuzzleEvent, MuzzleEvent> = {
  eventType: 'mz',
  visible(ctx, e) {
    if (ctx.mode === 'spectator') return true;
    const me = ctx.me;
    // The observer-scaled 6/12 halo (Eric ruling 2026-08-16; Story 9.8),
    // fog-tolled (Story 9.10, amendment 167: the flash PAYS the toll — the
    // halo is a sight reach, not a radar one).
    return withinSight(ctx, me, e, muzzleFlashReach(me)) && sightClear(me, e, ctx.islands);
  },
  materialize(_ctx, e) {
    // ALWAYS a fresh bare object (the burst-row discipline): the wire shape is
    // {k,x,y} for every observer — no id can ever ride along by accident.
    return { k: 'mz', x: e.x, y: e.y };
  },
};

/**
 * `sm` — WOUNDED SMOKE (Story 4.4, amendments 40-50): a hull below a damage
 * band is smoking at this point, this hard. The FIFTH declared exception to
 * the master perception invariant (after 4.3's sp/hc/mz and PV 23's public
 * sunk register), with its own independently-reimplemented oracle in
 * perception.test.ts. Visible iff dist(observer, puff) ≤
 * CONFIG.vision.muzzleFlash — the mz row's CONSTANT halo reused verbatim
 * (amendment 42: no fourth vision constant), deliberately NOT the observer's
 * own sightOf and NOT the boon-widened stats.sightRange: smoke
 * reach must be identical for every observer, or the plume would carry
 * per-observer build/state information — ∧ SIGHT clear (amendment 44:
 * islands block EVERY sensor at ALL ranges). Deliberately NO ownZoneCovers
 * term, exactly like mz: a star-shell zone does not help you see a plume you
 * are too far away from. materialize returns a fresh bare {k,x,y,tier} for
 * EVERY observer — the smoking ship's own captain (amendment 46: own smoke
 * rides this row with no special case) and spectators included; no ship id,
 * hue, class, hp, or fraction may ever ride it (amendment 45: no correlation
 * handle of any kind exists on this row, so per-source capping is impossible
 * by construction).
 */
const woundedSmokeSignal: SignalSpec<SmokeEvent, SmokeEvent> = {
  eventType: 'sm',
  visible(ctx, e) {
    if (ctx.mode === 'spectator') return true;
    const me = ctx.me;
    // The observer-scaled 6/12 halo (Eric ruling 2026-08-16; Story 9.8),
    // fog-tolled (Story 9.10, amendment 167: smoke PAYS the toll like the
    // flash; zone circles, the foghorn and the storm never do).
    return withinSight(ctx, me, e, muzzleFlashReach(me)) && sightClear(me, e, ctx.islands);
  },
  materialize(_ctx, e) {
    // ALWAYS a fresh bare object (the mz/burst-row discipline): the wire shape
    // is {k,x,y,tier} for every observer — no id can ever ride along by
    // accident, and no observer gets a privileged view.
    return { k: 'sm', x: e.x, y: e.y, tier: e.tier };
  },
};

/** The world-emitted foghorn SUBJECT (Story 4.5): World.consumeHonk always
 *  stamps the honker's true position and id onto the internal event —
 *  server-private inputs the row consumes and NEVER forwards (see the row). */
type FoghornSubject = FoghornEvent & { x: number; y: number; id: string };

/** The twelve-band wire domain (Story 9.8, ruling 129 — FoghornEvent.v;
 *  eight bands since Story 4.9 before it). */
type FoghornBand = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

/** The band count — one band per rung of the twelfths ruler (amendment 103). */
const HORN_BANDS = 12;
/** The plateau floor: the sight rung (4/12) — bands 1..4 share one gain. */
const HORN_PLATEAU = 4;
/** The island muffle's demotion, in bands (ruling 129: +3 — the eighths'
 *  +2 re-read proportionally onto the twelfths). */
const HORN_MUFFLE = 3;

/**
 * The fogged listener's VOLUME BAND for a honk, or null = inaudible (Story
 * 9.8, ruling 129 — twelve bands, the proportional re-read of Story 4.9's
 * eight / amendment 122) — THE one band resolver: visible() and materialize()
 * both call this, so the gate and the wire can never drift. The band is which
 * TWELFTH of the LISTENER'S own INTEL RANGE (`stats.radarRange` — the one
 * ruler, never sight-scaled) the honker sits in: `band = ceil(12 × d / intel
 * range)`, d == 0 resolving to band 1, boundaries inclusive (at base stats
 * band 4 ends exactly at truesight — full volume — and band 12 at the radar
 * rim, 50%; gain is a CLIENT-side lookup, never on the wire). Beyond band 12:
 * inaudible, no event at all.
 *
 * Every band is anchored on intel range, which no sight reduction touches, so
 * "a dazzle cannot deafen" holds BY CONSTRUCTION (amendment 53's clamps are
 * retired, their purpose satisfied structurally).
 *
 * THE PLATEAU FLOOR — `Math.max(band, 4)` ON THE RAW BAND, BEFORE THE MUFFLE
 * (review fix, anti-cheat). Bands 1-4 are INDISTINGUISHABLE in every honest
 * surface (the same client gain and the same chevron weight), so sending
 * WHICH of them a honker sits in would hand a MODIFIED client extra range
 * resolution inside the sight plateau with NO honest consumer — precisely the
 * disclosure amendment 51 bounds (BEARING AND VOLUME TIER ONLY). The wire
 * carries the band floor-clamped to the COARSEST value that reproduces the
 * ratified gain curve exactly.
 *
 * ISLANDS MUFFLE, NEVER BLOCK (amendment 54, preserved in meaning; the test
 * is the sightClear predicate, so the horn is neither more nor less blind than
 * every other optical sensor): after the FLOORED band resolves, a failed
 * sightClear() demotes ONCE to `max(5, floored + 3)` (ruling 129 — the old +2
 * of eight bands re-read onto twelve), so a blocked honk at the sight edge
 * lands at band 7 and bands 10-12 lose the honk entirely. Exactly ONE losClear
 * call and ONE set of bounds. `max(5, …)` keeps "a rock ALWAYS costs the
 * honker reach" true at the floor itself.
 *
 * THE FLOOR RUNS FIRST *BECAUSE* THE MUFFLE WOULD OTHERWISE LEAK IT (review
 * fix): flooring the EMITTED value instead would resolve a blocked raw band
 * 1-3 differently from a blocked raw band 4, so an observer who knows an
 * island intervenes would recover exactly the plateau bit the floor exists to
 * suppress. Flooring first collapses the whole plateau to one blocked answer.
 *
 * FAIL CLOSED ON A DEGENERATE INTEL RANGE (review fix). A band exists only for
 * a POSITIVE FINITE radarRange and a finite d. `radarRange` is checked FIRST,
 * before the `d === 0` short-circuit (which takes band 1 without reading the
 * range); the band's own domain test then runs on the RAW band, before the
 * floor, as an explicit `Number.isInteger` + bounds test (`NaN > 12` is FALSE).
 * Unreachable from an honest server today; that is why it returns null rather
 * than throwing.
 */
function hornBandFor(me: ShipRecord, subject: FoghornSubject, islands: readonly Island[]): FoghornBand | null {
  const intel = me.stats.radarRange;
  if (!Number.isFinite(intel) || intel <= 0) return null; // before the d === 0 branch, which never reads it
  const d = Math.hypot(subject.x - me.state.x, subject.y - me.state.y);
  const band = d === 0 ? 1 : Math.ceil((HORN_BANDS * d) / intel);
  if (!Number.isInteger(band) || band < 1 || band > HORN_BANDS) return null;
  const floored = Math.max(band, HORN_PLATEAU); // the plateau floor, on the RAW band
  const emitted = sightClear(me, subject, islands)
    ? floored
    : Math.max(HORN_PLATEAU + 1, floored + HORN_MUFFLE); // one step, applied once (amendment 54, ruling 129)
  return emitted > HORN_BANDS ? null : (emitted as FoghornBand);
}

/**
 * `fh` — THE FOGHORN (Story 4.5, amendments 51-58): a captain chose to sound
 * their horn. The SIXTH declared exception to the master perception
 * invariant (after 4.3's sp/hc/mz, PV 23's public sunk register, and 4.4's
 * sm), with its own independently-reimplemented oracle in perception.test.ts.
 * Three observer shapes, each a FRESH object literal (the mz discipline —
 * materialize NEVER forwards or spreads the subject, so the server-private
 * x/y/id can never ride along by accident):
 *   honker    → {k,h,self:true} — their own horn back, no distance/LOS test,
 *               checked FIRST in both gates (before any spectator or me math);
 *   spectator → {k,h,x,y} — the omniscient path (the client aims the chevron
 *               from its own camera); short-circuits BEFORE any ctx.me read,
 *               since a record-less spectator has me === undefined;
 *   fogged    → {k,h,b,v} — bearing (wrapPositive [0, 2π)) + volume BAND
 *               (1..12, Story 9.8 ruling 129) from hornBandFor above. NO x, NO y, NO ship
 *               id, and no correlation handle of any kind (amendment 45's
 *               rule verbatim): a honk is a bearing the honker chose to give
 *               away, and nothing more.
 * `h` is the horn variant — the row's ONLY identity-adjacent field, a knowing
 * narrow break with mz/sm's neutral-signal rule (amendment 52: a distinctive
 * purchased horn being recognizable at the radar rim is the point of buying one).
 */
const foghornSignal: SignalSpec<FoghornSubject, FoghornEvent> = {
  eventType: 'fh',
  visible(ctx, e) {
    if (e.id === ctx.observerId) return true; // the honker always hears their own horn
    if (ctx.mode === 'spectator') return true; // before any ctx.me math (me may be undefined)
    return hornBandFor(ctx.me, e, ctx.islands) !== null;
  },
  materialize(ctx, e) {
    if (e.id === ctx.observerId) return { k: 'fh', h: e.h, self: true };
    if (ctx.mode === 'spectator') return { k: 'fh', h: e.h, x: e.x, y: e.y };
    // visible() passed, so the band is non-null — the ONE shared resolver
    // guarantees the gate and this payload agree.
    const v = hornBandFor(ctx.me, e, ctx.islands) as FoghornBand;
    return { k: 'fh', h: e.h, b: wrapPositive(bearing(ctx.me.state, e)), v };
  },
};

// ---------------------------------------------------------------------------
// The registry: every spatial signal channel, one row each.
// ---------------------------------------------------------------------------

/** Freeze the registry AND every row inside it. A shallow Object.freeze on the
 *  map alone would leave the rows mutable (a counter-intel slot could be
 *  monkey-patched onto a row at runtime); this freezes each row too. Generic
 *  over the map type so the precise per-key row types survive
 *  (SIGNAL_REGISTRY.contact stays SignalSpec<ShipRecord, Contact>). */
const deepFreezeRows = <T extends object>(rows: T): Readonly<T> => {
  for (const key of Object.keys(rows) as (keyof T)[]) Object.freeze(rows[key]);
  return Object.freeze(rows);
};

/**
 * String-keyed registry of every signal channel — the 19 GameEvent kinds plus
 * the `contact`/`mine`/`litzone`/`burnzone`/`foulzone`/`decoy`/`cloud`
 * pseudo-types.
 * perception.ts dispatches world events by `e.k` (an emitted kind with no row
 * is a hard fail-closed drop) and drives the contact/blip/ballistic/mine/
 * litzone/burnzone/foulzone scans through their rows. Deep-frozen: the map AND every row are frozen —
 * rows are added at authoring time only, each with its required invariant
 * test case.
 */
export const SIGNAL_REGISTRY = deepFreezeRows({
  contact: contactSignal,
  mine: mineSignal,
  litzone: litZoneSignal,
  // Story 8.17: the PHOSPHOR burning zone's contact-like frame channel, on
  // the lit zone's gate byte-for-byte (amendment 135(f)). A circle only —
  // nothing is revealed through it.
  burnzone: burnZoneSignal,
  // Story 9.4: the FOULING SHELL foul zone's contact-like frame channel, on
  // the burn zone's gate byte-for-byte (amendment 63). A circle only —
  // nothing is revealed through it; the slow rides the victim's own `you`.
  foulzone: foulZoneSignal,
  // Story 8.16: the DECOY BUOY's contact-like frame channel (owner always /
  // SIGHTED like a ship, amendment 126 / owned-zone / spectators), in the seat the
  // deleted RADAR BUOY's `buoy` row held. Its anonymous radar paint is NOT
  // a row: it merges into the `blip` subsequence via decoyRadarBlips above.
  decoy: decoySignal,
  // Story 9.3 (8.18's `smoke` seat): the MULTI-SPECTRAL COUNTERMEASURE
  // cloud's contact-like frame channel (owner always / spectators / its
  // spray disc SIGHTED or RADAR-DETECTED). A cloud hides nothing (Story 9.3
  // session 2, Eric 2026-10-12 — a client overlay); this row is only how
  // the cloud itself ({id,x,y,t0}) reaches the client.
  cloud: cloudSignal,
  // Story 9.10: FOG HAS NO ROW — the field is public weather (welcome seed +
  // schema cut) and its hiding is the toll inside every sight site above
  // (withinSight). Nothing per-observer about fog rides a frame.
  blip: blipSignal,
  shell: ballisticSignal('shell'),
  torp: ballisticSignal('torp'),
  torpU: torpedoUpdateSignal, // Story 2.8: the homing-track update (scan-driven, like shell/torp)
  boom: boomSignal,
  burst: burstSignal,
  sunk: sunkSignal,
  spawn: spawnSignal,
  dmg: selfPrivateSignal<DamageEvent>('dmg', true),
  pt: selfPrivateSignal<PointEvent>('pt', false),
  bn: selfPrivateSignal<BoonFitEvent>('bn', false),
  // Drone drops (Eric ruling 2026-10-01): a consumable a drone kill stocked.
  // The pt/bn terms exactly — killer-only, never a fog exception, and
  // spectatorPublic FALSE (another ship's belt is a build, and builds stay
  // hidden).
  dp: selfPrivateSignal<DropEvent>('dp', false),
  // DAMAGE CONTROL (Eric rulings 2026-08-04): the heal spend's own toast.
  // spectatorPublic FALSE — the pt/bn terms, deliberately NOT dmg's: a heal is
  // an economy act, and "that hull just repaired" must never reach anyone but
  // the hull that spent the level (the spec's no-observer-visible-cue rule).
  heal: selfPrivateSignal<HealEvent>('heal', false),
  // Story 4.3 (amendments 15-20): the gunnery conversation — three declared
  // fog exceptions, each with its stated rationale on its row above.
  sp: fallOfShotSignal,
  hc: hitCallSignal,
  mz: muzzleFlashSignal,
  // Story 4.4 (amendments 40-50): wounded smoke — the fifth declared fog
  // exception, anonymous by construction (see the row above).
  sm: woundedSmokeSignal,
  // Story 4.5 (amendments 51-58): the foghorn — the sixth declared fog
  // exception and the first partial LOS carve-out (islands muffle one step —
  // max(5, band + 2) on the Story 4.9 eight-band ladder).
  fh: foghornSignal,
  // Story 4.12 (amendments 194-196/200): radar wakes — disturbed water gated
  // per SEGMENT on the blipGate clause order with a per-source inner bound
  // (cycle-69 review gate P2), in the `return` grammar only (P1); NOT a
  // declared fog exception (see the row above). Identity-free by construction.
  wk: wakeSignal,
});

/**
 * COMPILE-TIME EXHAUSTIVENESS (zero runtime cost — types are fully erased):
 * adding a new GameEvent kind in shared/src/types.ts without a matching
 * registry row makes `MissingEventRows` a non-`never` type, which then fails the
 * `AssertNever` constraint and breaks `tsc`. The registry MAY hold extra keys
 * (the contact/mine pseudo-rows); it may never OMIT a GameEvent kind.
 */
type MissingEventRows = Exclude<GameEvent['k'], keyof typeof SIGNAL_REGISTRY>;
type AssertNever<T extends never> = T;
// Exported only so it counts as "used" — nothing imports it; its sole purpose
// is that `tsc` evaluates the AssertNever constraint on MissingEventRows here.
export type RegistryCoversEveryGameEventKind = AssertNever<MissingEventRows>;

/**
 * Row lookup for WORLD-EVENT dispatch (perception.forwardedEvents). Resolves
 * ONLY the 19 GameEvent-kind rows. It excludes the contact/mine/litzone
 * pseudo-rows so a fabricated `k:'mine'` (or `k:'litzone'`) world
 * event can never materialize (restoring the old dispatcher's
 * `default: return null` guarantee), and uses an OWN-property lookup
 * (Object.hasOwn) so an inherited prototype key ('constructor', 'toString')
 * resolves to undefined, not a Function. Any unresolved kind fails closed:
 * the caller drops the event (nothing spatial leaves the server outside a
 * registry row).
 */
const PSEUDO_ROWS: ReadonlySet<string> = new Set(['contact', 'mine', 'litzone', 'burnzone', 'foulzone', 'decoy', 'cloud']);

export function signalFor(kind: string): SignalSpec | undefined {
  // Pseudo-rows never dispatch from world events ('decoy' took the deleted
  // 'buoy' seat in Story 8.16 — a fabricated k:'decoy' world event must never
  // materialize a DecoyView; 'burnzone' joined in Story 8.17, 'smoke' in
  // Story 8.18 and its successor 'cloud' in Story 9.3, and 'foulzone' in
  // Story 9.4, all on the same rule — a fabricated k:'foulzone' world event
  // must never materialize a FoulZoneView).
  if (PSEUDO_ROWS.has(kind)) return undefined;
  if (!Object.hasOwn(SIGNAL_REGISTRY, kind)) return undefined; // own-property only
  return (SIGNAL_REGISTRY as Partial<Record<string, SignalSpec>>)[kind];
}
