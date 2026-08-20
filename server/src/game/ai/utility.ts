// COMBAT-BOT UTILITY SCORING (Story 6.4, wave 2) — the world model and the
// choice of target and posture, over THE PERCEPTION VIEW AND NOTHING ELSE.
//
// This module never sees a world collection. Its whole input is one
// `PerceptionView` (the fogged view world.ts hands the driver as a bound
// per-bot observe thunk, captured exactly once per live bot per tick) folded
// into per-bot contact memory, plus the bot's own pose/hp/stats which arrive
// on its OWN record (the BotSelf self-read). Nothing here can know something
// a human client in the same seat would not have been sent.
//
// FOUR THINGS THIS FILE OWNS:
//
// 1. CONTACT MEMORY. `mind.contacts` is a track store, not a snapshot: a live
//    truesight `Contact` refreshes a track at full confidence, a radar blip
//    refreshes it as a decaying low-confidence one, and anything unrefreshed
//    for CONFIG.bots.contactMemoryMs is forgotten. A bot therefore plots a
//    track across sensor gaps (a radar paint lands once per sweep
//    revolution) instead of forgetting the world between paints.
//
// 2. THE BLIP GRAMMAR (identity-free by ruling). A blip carries ONLY a
//    world-anchored cell rect and a packed coverage mask — no id, no class,
//    no heading, no speed — so the position is DERIVED as the centroid of the
//    lit cells and the track is stored identity-free (`id: null`, `heading:
//    null`, `speed: null`), associated to an existing anonymous track by
//    proximity the way a real plotting table associates returns to a track.
//
// 3. THE BOT'S OWN HIT CALLS. `hc` (Hit Call) is a SELF-PRIVATE row the
//    shooter is entitled to — it is how a human learns a fog shot connected —
//    so a bot uses it exactly as a human does: a Hit Call reinforces the
//    track it landed on (refreshing it and raising the damage estimate).
//    The `sp` fall-of-shot splash is DELIBERATELY NOT read: wave 2 captured
//    it as a "bracket-and-walk" feedback channel that no tactics ever
//    consumed, and the review gate deleted the dead knob rather than invent
//    a correction loop late in the cycle (a bracket-and-walk behaviour is
//    LEDGERED in deferred-work.md, not smuggled in). NOTHING ELSE is read
//    from the event stream beyond blips and `sunk` (which merely retires a
//    dead track); no event the bot is not entitled to is consulted, because
//    the view it is handed contains none.
//
// 4. THE REACTION GATE, IN ONE PLACE. `isActionable()` is the sole consumer of
//    CONFIG.bots.reactionMs — one of the two competence knobs (E2). A track
//    must have persisted `reactionMs` since first acquisition before any
//    scoring will return it. Keeping it here (and not sprinkled through
//    tactics) is what makes retuning difficulty a one-number edit.
//
// A NOTE ON `BotTrack`: wave 2 shipped it as `extends RememberedContact` with
// the four fields wave 1's type lacked (class, fleet-ness, acquisition time,
// hit history) and normalized every read through an `asTrack()` fallback,
// because a plain wave-1 entry written elsewhere would be missing them. WAVE 3
// PROMOTED THOSE FOUR FIELDS onto `RememberedContact` itself, so `BotTrack` is
// now a pure alias and the fallback is gone: there is exactly one track shape
// and no way for two of them to disagree.

import {
  CONFIG,
  SHIP_CLASS_IDS,
  islandBlocksSegment,
  type BlipEvent,
  type Contact,
  type EffectiveStats,
  type GameEvent,
  type HullId,
  type Island,
  type ReturnBlipEvent,
  type Vec2,
  type ZoneRing,
} from '@salvo/shared';
import type { PerceptionView } from '../perception.js';
import type { BotMind, BotPosture, RememberedContact } from './types.js';
import { engagementBand, type BotProfile } from './profiles.js';

/** Re-exported from types.ts (moved there so BotMind can cache the
 *  deliberated posture without an import cycle); tactics and tests keep
 *  importing it from here. */
export type { BotPosture } from './types.js';

/**
 * ONE PLOTTED TRACK. An alias of `RememberedContact` since wave 3 promoted
 * class / fleet-ness / acquisition time / hit history onto it: the name is
 * kept because it is what scoring and tactics speak, and because a future
 * scoring-only field would land here rather than on the driver's type.
 */
export type BotTrack = RememberedContact;


/** Everything scoring needs about the bot ITSELF — built by the driver from
 *  the bot's own ShipRecord and the narrow port. Deliberately a plain value:
 *  this module imports nothing from world.ts, not even a type. */
export interface BotSituation {
  now: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  stats: EffectiveStats;
  /** u/s — the hull's CURRENT signed speed, straight off its own ShipState.
   *  A self-read of the bot's own hull, the same category as `hp`, and it
   *  discloses nothing. It exists for exactly one reason: `EffectiveStats`
   *  does NOT carry the speed boost (World.stepShips raises the per-tick cap
   *  outside it), so `ringDeadband` cannot size a boosted hull's turn radius
   *  without it. See ringDeadband. */
  speed: number;
  profile: BotProfile;
  /** The LIVE storm ring — ring escape overrides everything else. */
  ring: ZoneRing;
  /** The map's coastlines — `port.map.islands`, which every client rebuilds
   *  from the seed, so this discloses nothing. Read for exactly one question:
   *  IS THERE A LINE OF FIRE (see lineBlocked). Steering reads the port's copy
   *  directly; scoring and the trigger read it from here. */
  islands: readonly Island[];
}

/**
 * IS THE STRAIGHT LINE FROM `a` TO `b` STOPPED BY LAND?
 *
 * The bot's line-of-fire test, and it is the SIM'S OWN PRIMITIVE
 * (`islandBlocksSegment` — bounding-circle broadphase, `core` early-out, then
 * the exact coastline walk), which is what `stepShell` resolves flight against
 * and what `clipAtIslands` draws the human's aim preview with. One question,
 * one answer, three consumers.
 *
 * NOTHING IS DISCLOSED: the map is public (both sides rebuild it from
 * `welcome.mapSeed`) and ai/tactics.ts already iterates `port.map.islands`
 * every tick for coastline avoidance.
 */
export function lineBlocked(a: Vec2, b: Vec2, islands: readonly Island[]): boolean {
  for (const isle of islands) {
    if (islandBlocksSegment(a, b, isle)) return true;
  }
  return false;
}

/** u — association radius for an identity-free return-grammar paint. Six
 *  lattice cells: a hull makes ~11u between observes at full ahead, the
 *  lattice itself quantizes to 9u and the mask is deliberately fuzzed, so
 *  this is a few steps of slop and no more. Beyond it, a paint is a NEW
 *  track — which is honest: nothing on the wire linked them. */
const ANON_ASSOC_U = CONFIG.vision.radarCellU * 6;

/** u — how near a Hit Call must land to be credited to a track. Twice the
 *  WIDEST gun-family blast covers "that was the thing I was shooting at"
 *  without crediting a hull a map away. Derived from the max rather than a
 *  named weapon (it was the cannon's 30u until Story 7-5 wave 2 deleted the
 *  cannon; the broadside that replaced it bursts at the gun's 15u), so a
 *  retune of either blast moves this with it. */
const HIT_ASSOC_U = Math.max(CONFIG.gun.burstRadius, CONFIG.broadside.burstRadius) * 2;

/** Hit Calls that read as "crippled" (the damage term saturates here). A
 *  severity-free count is all the wire gives; three connections is a real
 *  beating for every hull in the game. */
const HITS_FOR_CRIPPLED = 3;

/** Fraction of intel range beyond which a track is not worth scoring at all.
 *  Slightly over 1 so a track that drifted just past radar range is still
 *  chaseable rather than snapping to worthless. */
const TARGET_HORIZON_FACTOR = 1.25;

/** Confidence floor for the oldest still-remembered track — a minute-old plot
 *  is worth something, just not much. */
const STALE_FLOOR = 0.15;

/** u — radius that decides whether a track is ALONE. Half of base truesight:
 *  two hulls this close are supporting each other. */
const ISOLATION_U = CONFIG.vision.sight * 0.5;

/**
 * Score multiplier for a track with LAND IN THE WAY — a plot the trigger will
 * refuse to shoot at (see ai/tactics.ts). Without it the terrain check alone
 * would only stop the wasted ordnance, not the stuck ENGAGEMENT: a bot would
 * hold fire and go on circling the headland, which is the half of Eric's
 * report ("focus fire on some drones it cannot possibly hit") that reads as
 * broken even with the guns silent.
 *
 * A PENALTY AND NOT A VETO, deliberately. Zeroing a blocked track would make a
 * bot forget a hull it is about to sail past a headland and re-acquire, and
 * would leave it with NO target at all in cluttered coastal water — patrolling
 * for the ring centre while an enemy sits 200u away behind a rock.
 *
 * THE NUMBER IS SET BY THE WORST MEASURED CASE, not by feel. `forager` is the
 * profile the defect lived on (15.7% of its shells into terrain) precisely
 * because its `targetWeights.fleet` of 2.0 parks it on drone groups in
 * cluttered coastal water, against a `captain` weight of 0.5. Anything above
 * 0.25 leaves that fight unchanged — 2.0 x 0.35 = 0.70 still beats 0.50 — so
 * the penalty has to bite harder than a third to move the one case it was
 * written for. At 0.2 the blocked drones score 0.40 against the reachable
 * captain's 0.50 and the bot takes the shot it can actually make, while a
 * blocked track that is the ONLY thing on the water still scores well clear of
 * zero, still wins the slot, and still gets pursued.
 */
const BLOCKED_LINE_SCORE = 0.2;

/** A hull id that is PvE fleet content rather than a participant. */
function isFleetHullId(cls: HullId): boolean {
  return !(SHIP_CLASS_IDS as readonly string[]).includes(cls);
}

/** The one sighting shape every fold path funnels through. */
interface Sighting {
  id: string | null;
  x: number;
  y: number;
  heading: number | null;
  speed: number | null;
  cls: HullId | null;
}

type TrackMap = Map<string, RememberedContact>;

/** A brand-new track's carried-over half (no history to preserve). */
function freshBase(now: number): Pick<BotTrack, 'id' | 'cls' | 'fleet' | 'firstSeenAt' | 'hits'> {
  return { id: null, cls: null, fleet: false, firstSeenAt: now, hits: 0 };
}

/** Write (or refresh) one track. Position/pose come from the sighting;
 *  acquisition time, hit history and any previously-disclosed class survive. */
function writeTrack(tracks: TrackMap, key: string, s: Sighting, now: number, live: boolean): void {
  const base = tracks.get(key) ?? freshBase(now);
  const cls = s.cls ?? base.cls;
  const track: BotTrack = {
    id: s.id ?? base.id,
    x: s.x,
    y: s.y,
    heading: s.heading,
    speed: s.speed,
    seenAt: now,
    live,
    cls,
    fleet: cls === null ? base.fleet : isFleetHullId(cls),
    firstSeenAt: base.firstSeenAt,
    hits: base.hits,
  };
  tracks.set(key, track);
}

/** Nearest track key within `maxU` of a point, or null. `anonOnly` restricts
 *  the search to identity-free tracks (return-grammar association). Ties keep
 *  the earliest insertion — Map order, so the fold stays deterministic. */
function nearestKey(tracks: TrackMap, x: number, y: number, maxU: number, anonOnly: boolean): string | null {
  let best: string | null = null;
  let bestD2 = maxU * maxU;
  for (const [key, t] of tracks) {
    if (anonOnly && t.id !== null) continue;
    const dx = t.x - x;
    const dy = t.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= bestD2) {
      bestD2 = d2;
      best = key;
    }
  }
  return best;
}

/** A deterministic key for a brand-new identity-free track (position-derived,
 *  never a counter — two worlds stepping the same seed must agree). */
function anonKey(x: number, y: number): string {
  return `a:${Math.round(x)}:${Math.round(y)}`;
}

/** Fold an identity-free position (a return-grammar paint, or a Hit Call in
 *  empty water) into the nearest anonymous track, or open a new one. */
function foldAnonymous(tracks: TrackMap, x: number, y: number, now: number): string {
  const key = nearestKey(tracks, x, y, ANON_ASSOC_U, true) ?? anonKey(x, y);
  writeTrack(tracks, key, { id: null, x, y, heading: null, speed: null, cls: null }, now, false);
  return key;
}

/** Centroid of a return blip's LIT cells in world units, or null for an empty
 *  mask. `gx`/`gy` are absolute lattice indices, so a cell's centre is
 *  `(index + 0.5) * radarCellU` — the only geometry the grammar discloses. */
function returnBlipCenter(e: ReturnBlipEvent): { x: number; y: number } | null {
  const cell = CONFIG.vision.radarCellU;
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let row = 0; row < e.h; row += 1) {
    for (let col = 0; col < e.w; col += 1) {
      const bit = row * e.w + col;
      const word = e.bits[bit >> 5] ?? 0;
      if ((word & (1 << (bit & 31))) === 0) continue;
      sx += (e.gx + col + 0.5) * cell;
      sy += (e.gy + row + 0.5) * cell;
      n += 1;
    }
  }
  return n === 0 ? null : { x: sx / n, y: sy / n };
}

/** Fold one radar paint — an identity-free coverage footprint. */
function foldBlip(tracks: TrackMap, e: BlipEvent, now: number): void {
  const c = returnBlipCenter(e);
  if (c !== null) foldAnonymous(tracks, c.x, c.y, now);
}

/** Fold the bot's own Hit Call: something of ours connected HERE. Credits the
 *  nearest track (refreshing it — a connection proves presence) or opens one,
 *  which is exactly what the shooter is entitled to conclude. */
function foldHitCall(tracks: TrackMap, x: number, y: number, now: number): void {
  const key = nearestKey(tracks, x, y, HIT_ASSOC_U, false) ?? foldAnonymous(tracks, x, y, now);
  const t = tracks.get(key);
  if (t === undefined) return;
  // A LIVE track has better position data than the burst point; a stale one
  // does not, so the impact point becomes its new plot.
  const hit: BotTrack = { ...t, hits: t.hits + 1, seenAt: now, x: t.live ? t.x : x, y: t.live ? t.y : y };
  tracks.set(key, hit);
}

/** Fold one live truesight contact at full confidence. */
function foldContact(tracks: TrackMap, c: Contact, now: number): void {
  writeTrack(tracks, c.id, { id: c.id, x: c.x, y: c.y, heading: c.heading, speed: c.speed, cls: c.cls }, now, true);
}

/** Route one event to its fold. Everything not named here — the `sp` splash
 *  included, since the review gate deleted its dead feedback channel — is
 *  deliberately ignored: a bot reads only what it is entitled to and only
 *  what it uses. */
function foldEvent(tracks: TrackMap, e: GameEvent, now: number): void {
  if (e.k === 'blip') {
    foldBlip(tracks, e, now);
    return;
  }
  if (e.k === 'hc') {
    foldHitCall(tracks, e.x, e.y, now);
    return;
  }
  if (e.k === 'sunk') tracks.delete(e.id);
}

/**
 * DROP EVERY TRACK OUT OF TRUESIGHT, before this view is folded.
 *
 * `live` is documented as "backed by a LIVE truesight Contact", and until this
 * existed it was not: `writeTrack` set it at refresh time and NOTHING EVER
 * CLEARED IT, so a hull sighted once and then lost stayed flagged live for the
 * whole 8s memory window (observed at ageMs 6950). Three consumers read it as
 * "visible now" and were all wrong for it — `cannonShot`'s live gate spent a
 * 50s reload on a plot that had gone dark, `freshness()` returned a full 1.0
 * for a seven-second-old position so scoring never decayed it, and
 * `flareTarget` would never light a plot that went stale while flagged.
 *
 * Clearing here rather than testing `seenAt === now` at each read is the
 * narrower fix: `seenAt` is refreshed by radar paints and Hit Calls too, so
 * "refreshed this tick" is a WIDER predicate than "sighted this tick" and
 * reading it as the latter would have let the cannon fire at a same-tick blip.
 * The fold's own order does the rest — `foldContact` runs last and re-raises
 * the flag for everything genuinely in the bubble (see foldView).
 */
function dropTruesight(tracks: TrackMap): void {
  for (const t of tracks.values()) t.live = false;
}

/** Forget every track unrefreshed for longer than the memory window. */
function prune(tracks: TrackMap, now: number): void {
  for (const [key, t] of tracks) {
    if (now - t.seenAt > CONFIG.bots.contactMemoryMs) tracks.delete(key);
  }
}

/**
 * Fold one perception view into the bot's contact memory. THE only writer of
 * `mind.contacts`. Runs once per captured view — which, since the
 * review-gate cadence fix, is once per live tick.
 *
 * ORDER IS LOAD-BEARING: `live` is DROPPED on every track first (see
 * dropTruesight), then events (blips, Hit Calls) fold, then live truesight
 * contacts fold LAST — so a hull that is both painted and sighted this tick
 * ends up stored LIVE. The reverse order would let a same-tick radar paint
 * demote a sighted hull to a stale plot — the sensors disagree about
 * confidence, never about existence, and truesight always wins.
 * Deterministic: no rng, no clock read (`now` is passed in).
 */
export function foldView(mind: BotMind, view: PerceptionView, now: number): void {
  const tracks = mind.contacts;
  dropTruesight(tracks);
  for (const e of view.events) foldEvent(tracks, e, now);
  for (const c of view.contacts) foldContact(tracks, c, now);
  prune(tracks, now);
}

/** Every remembered track. Insertion-ordered (deterministic). */
export function tracksOf(mind: BotMind): BotTrack[] {
  return [...mind.contacts.values()];
}

/**
 * THE REACTION GATE — the single consumer of CONFIG.bots.reactionMs (E2's
 * second competence knob). A track the bot has only just acquired is not yet
 * something it may act on; it must have persisted this long since first
 * acquisition. Retuning difficulty is this one number.
 */
export function isActionable(t: BotTrack, now: number): boolean {
  return now - t.firstSeenAt >= CONFIG.bots.reactionMs;
}

/** ms — one full sweep revolution at the BASE rotation rate: the persistence
 *  bar a fog track must clear before 30s-reload ordnance commits to it. */
export const TRACK_PERSIST_MS = 60000 / CONFIG.vision.sweepRpm;

/**
 * TRACK PERSISTENCE — the structural counter to an enemy JAMMING BUOY. A
 * jamming buoy scatters 10 fakes per revolution, wire-indistinguishable from
 * real blips and folded into this store as ordinary tracks; but fakes
 * RE-SCATTER WHOLESALE each revolution, so no fake survives association as
 * one coherent track across a full sweep period, while a real hull's paints
 * keep refreshing the same plot. Two clauses:
 *   - a LIVE truesight contact passes instantly — a fake can never appear
 *     inside the observer's bubble, structurally;
 *   - otherwise the track must have persisted one base sweep revolution
 *     since first acquisition.
 * Consumed by the torpedo and broadside tactics (30s reloads) and NOTHING
 * ELSE — the gun is deliberately ungated, because shooting at radar blips is
 * a ruled skill (Eric, cycle 99) and a staleness budget on it would break
 * bracket-and-walk fire (FR16).
 */
export function hasPersistence(t: BotTrack, now: number): boolean {
  return t.live || now - t.firstSeenAt >= TRACK_PERSIST_MS;
}

/**
 * THE BAND PULL (Eric ruling, 2026-08-20). A fitted weapon that is READY and
 * whose effective reach lies BELOW the hull's engagement band tugs the band's
 * near edge toward that reach — CAPPED AT HALFWAY, so the profile fractions
 * stay the anchor and one card can never erase a profile's identity: a
 * `siege` Battleship with a loaded torpedo eases in and drifts back out when
 * the tube empties; it never becomes a `duelist`. `reaches` is the READY shot
 * weapons' reach list (tactics.ts builds it from EQUIPMENT_TACTICS), so the
 * pull exists exactly while the weapon is loaded. A reach at or above the
 * band's near edge never pulls — the weapon is already usable in the band —
 * and the far edge never moves at all.
 */
export function pullBand(
  band: { min: number; max: number },
  reaches: readonly number[],
): { min: number; max: number } {
  let min = band.min;
  for (const r of reaches) {
    if (r < band.min) min = Math.min(min, (band.min + r) / 2);
  }
  return min === band.min ? band : { min, max: band.max };
}

/** Confidence in a track's plot: 1 while live, decaying to a floor as its
 *  last refresh ages out toward the memory horizon. */
function freshness(t: BotTrack, now: number): number {
  if (t.live) return 1;
  const age = (now - t.seenAt) / CONFIG.bots.contactMemoryMs;
  return Math.max(STALE_FLOOR, 1 - age);
}

/** 0..1 estimated damage, from self-private Hit Calls alone. */
function damageEstimate(t: BotTrack): number {
  return Math.min(1, t.hits / HITS_FOR_CRIPPLED);
}

/** 0..1 isolation: 1 when nothing else is tracked nearby, falling off as
 *  company arrives. */
function isolation(t: BotTrack, neighbours: readonly BotTrack[]): number {
  let n = 0;
  for (const o of neighbours) {
    if (o === t) continue;
    if (Math.hypot(o.x - t.x, o.y - t.y) <= ISOLATION_U) n += 1;
  }
  return 1 / (1 + n);
}

/**
 * Profile-weighted desirability of one track, 0 = not worth pursuing. The
 * five terms are exactly the ones the profiles speak in: WHAT it is
 * (participant vs fleet hull — never human vs bot, ruling B3), HOW CLOSE it
 * is, HOW SURE we are of the plot, HOW HURT we believe it is (self-private
 * Hit Calls only) and HOW ALONE it is — times a SIXTH term that is not about
 * the track at all but about the water between: a target with a coastline in
 * the way cannot be shot at (see BLOCKED_LINE_SCORE).
 */
export function scoreTrack(t: BotTrack, sit: BotSituation, neighbours: readonly BotTrack[]): number {
  const horizon = sit.stats.radarRange * TARGET_HORIZON_FACTOR;
  const d = Math.hypot(t.x - sit.x, t.y - sit.y);
  if (d > horizon) return 0;
  const w = sit.profile.targetWeights;
  const kind = t.fleet ? w.fleet : w.captain;
  const prox = 1 - d / horizon;
  const dmg = 1 + w.damaged * damageEstimate(t);
  const iso = 1 + w.isolated * isolation(t, neighbours);
  const reach = lineBlocked({ x: sit.x, y: sit.y }, t, sit.islands) ? BLOCKED_LINE_SCORE : 1;
  return kind * prox * freshness(t, sit.now) * dmg * iso * reach;
}

/**
 * The `mind.contacts` KEY of the best actionable track by profile-weighted
 * score, or null. Strict `>` keeps the earliest-acquired track on a tie
 * (deterministic). Returning the KEY rather than the track is what lets the
 * driver's decision cadence cache the choice on the mind and re-resolve it
 * against the freshest plot every tick between deliberations.
 */
export function selectTargetKey(mind: BotMind, sit: BotSituation): string | null {
  const all = tracksOf(mind);
  let best: string | null = null;
  let bestScore = 0;
  for (const [key, t] of mind.contacts) {
    if (!isActionable(t, sit.now)) continue;
    const s = scoreTrack(t, sit, all);
    if (s > bestScore) {
      bestScore = s;
      best = key;
    }
  }
  return best;
}

/** The best actionable track itself (selectTargetKey resolved), or null. */
export function selectTarget(mind: BotMind, sit: BotSituation): BotTrack | null {
  const key = selectTargetKey(mind, sit);
  return key === null ? null : mind.contacts.get(key) ?? null;
}

/**
 * u — THE RING-ESCAPE DEADBAND: how far INSIDE the live ring a hull must get
 * before it is allowed to stop running for the centre.
 *
 * `isOutside` is boundary-inclusive with ZERO hysteresis, so escape used to
 * release the instant `dist <= r` — one tick inside, posture flips back to
 * whatever was pushing the hull outward in the first place, and the hull
 * re-crosses. Measured on the water: a ~2.2s limit cycle of ±3-8u amplitude,
 * bleeding `stormDps` for about half of each period. That is the "dipping in
 * and out of the storm ring for no good reason" Eric watched.
 *
 * THE NUMBER IS THE HULL'S OWN FULL-AHEAD TURN RADIUS (`speed / turnRate` —
 * at rated speed, Torpedo Boat 56.25u, Mine Layer 66.67u, Battleship 87.50u),
 * which is ALREADY THIS FILE'S FAMILY OF DERIVATION: `REAR_QUARTER_U` in
 * tactics.ts is documented as "just outside the Torpedo Boat's 56.3u
 * full-ahead turn radius" for the same reason — it is the distance at which a
 * heading is a manoeuvre rather than a hope. It reads
 * `EffectiveStats.kinematics`, so it is per-hull and boon-aware for free, and
 * it is never a fraction of ring radius: that would be 140u on the opening
 * 2800u ring and 33u on the 660u endgame ring, i.e. loosest where the storm is
 * slowest and tightest where it is closing hardest — exactly backwards.
 *
 * THE SPEED IS THE GREATER OF RATED AND ACTUAL, for the same reason
 * `ringLookaheadU` takes it and NOT for free: THE SPEED BOOST IS NOT IN
 * `EffectiveStats`. `World.stepShips` raises the per-tick `maxSpeed` cap
 * outside the stat block entirely, so a boosted hull turns through a WIDER
 * circle than its rated stats describe — and `chooseAct` spends the boost on
 * `disengage`, which is precisely the posture that runs at the rim. Sizing the
 * deadband off rated speed alone hands a boosted `raider` a release threshold
 * calibrated for a ship that turns tighter than it does; the cross-model
 * review caught this as the half of the boost fix that was missed, after the
 * measurement had already named boosted raiders as 15 of 19 residual
 * crossings. RATED IS A FLOOR (`max`, never the live speed outright): a hull
 * loafing at 10 u/s can still accelerate, and shrinking its deadband to match
 * a momentary throttle would give the storm back the head start the deadband
 * exists to deny.
 *
 * ONE FUNCTION, BOTH CONSUMERS — the release threshold (`ringEscaping`) and
 * the steer-into threshold (`ringClamped`'s safe radius) must be the same
 * number or the bot's idea of "water I may steer for" and "water I have
 * escaped to" drift apart and re-open the chatter from the other side. That
 * is why `BotSituation` carries `speed` rather than `ringEscaping` guessing.
 *
 * SANITY AGAINST THE CLOSING RATE: the ring closes at 16.1/10.5/9.1/11.0 u/s
 * across the four groups, so even a Battleship's 87.5u buys 5.4s on the
 * fastest beat — well over the 250ms deliberation cadence, so the deadband can
 * never be eaten by the ring between two decisions.
 */
export function ringDeadband(stats: EffectiveStats, speed: number): number {
  return Math.max(stats.kinematics.maxSpeed, Math.abs(speed)) / stats.kinematics.turnRate;
}

/**
 * IS THIS BOT RUNNING FOR THE RING CENTRE THIS TICK? The ONE predicate both
 * ring consumers ask — `choosePosture` here and `desiredBearing` in tactics.ts
 * — because two independent readings of "am I escaping" would disagree about
 * when escape ENDS and re-open the chatter from the other side.
 *
 * `latched` is the hysteresis memory, and it is the CACHED POSTURE rather than
 * a new field on the mind: posture is already the bot's one-word answer to
 * "what am I doing", the driver already caches it across the decision cadence,
 * and steering already receives it. So the arm threshold is `isOutside`'s
 * exactly (nothing about entering the storm moves), and only the RELEASE
 * threshold tightens to `ringDeadband` inside the rim.
 *
 * `r <= 0` is outside for every point — the sudden-death collapse ring's whole
 * meaning, and the same fail-closed reading `isOutside` takes.
 */
export function ringEscaping(sit: BotSituation, latched: boolean): boolean {
  const ring = sit.ring;
  if (!(ring.r > 0)) return true;
  const d = Math.hypot(sit.x - ring.cx, sit.y - ring.cy);
  return d > (latched ? ring.r - ringDeadband(sit.stats, sit.speed) : ring.r);
}

/**
 * What the bot is doing this tick. The order of these clauses IS the policy:
 *
 *   1. RING ESCAPE DOMINATES EVERYTHING. Outside the live storm ring nothing
 *      else is worth deciding — the storm does not miss. It RELEASES a
 *      deadband inside the rim rather than on the boundary (see ringEscaping
 *      / ringDeadband), which is why `prev` is threaded in: the posture the
 *      bot already held is the latch.
 *   2. Then survival: below the profile's disengage fraction, break off.
 *   3. Then, with nothing actionable to chase, reposition (wave-3 tactics
 *      patrols toward the ring centre).
 *   4. NO LINE OF FIRE -> `pursue`, whatever the band geometry says. This is
 *      the posture half of the terrain fix: `engage`/`farm` hold the band and
 *      orbit beam-on at cruise, which against a target behind a headland is
 *      exactly the circling-and-never-shooting Eric watched. `pursue` steers
 *      AT the target at full ahead, and the coastline-avoidance term in
 *      tactics.ts's helm then rounds the obstruction rather than driving into
 *      it — so the bot opens the angle instead of parking on a dead bearing.
 *      No new posture is invented; the existing one is simply the right one.
 *   5. `farm` distinguishes clearing world content from fighting a captain —
 *      it is the posture `forager` lives in, and any profile takes it when
 *      its own weights say a fleet hull is the better prize.
 *   6. Otherwise it is band geometry: inside the band engage, outside pursue.
 */
export function choosePosture(
  sit: BotSituation,
  target: BotTrack | null,
  prev: BotPosture = 'reposition',
): BotPosture {
  if (ringEscaping(sit, prev === 'ringRun')) return 'ringRun';
  if (sit.maxHp > 0 && sit.hp / sit.maxHp < sit.profile.disengageHpFrac) return 'disengage';
  if (target === null) return 'reposition';
  if (lineBlocked({ x: sit.x, y: sit.y }, target, sit.islands)) return 'pursue';
  const w = sit.profile.targetWeights;
  if (target.fleet && w.fleet >= w.captain) return 'farm';
  const band = engagementBand(sit.profile, sit.stats);
  return Math.hypot(target.x - sit.x, target.y - sit.y) <= band.max ? 'engage' : 'pursue';
}
