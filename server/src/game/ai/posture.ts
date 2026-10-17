// THE POSTURE CHAIN (Story 9.13, Eric ruling 2026-10-17, epic-9 amendment
// 193: "extend today's chain") — what the bot is doing this tick, as one
// readable sequence of clauses. It moved here from ai/utility.ts (which keeps
// a re-export) because the chain grew past what one scoring module should
// hold; every clause below is a ruling, cited where it is built.
//
// THE ORDER IS THE POLICY:
//   1. RING ESCAPE dominates everything (unchanged; utility.ts ringEscaping).
//   2. THE BREAK-OFF. A broken hull (below the profile's disengage line), or a
//      latched break-off not yet released, disengages — or RAMS, when the
//      amendment-77 trigger holds and no ram exit is pending.
//   3. THE LATCH (amendment 196): a break-off ends only once hp is back above
//      the line by CONFIG.bots.disengageHysteresis AND contact is broken for
//      CONFIG.bots.contactBrokenMs (or the bot has reached its cover point).
//   4. THE RAM EXIT (amendment 201): a ram that has touched its target falls
//      to disengage once CONFIG.bots.ramExitMs passes without the target
//      sinking, and never re-arms on that target until the pair separate.
//   5. NO TARGET: siege / trapper standing at a cover point HOLD (amendments
//      199/202); everyone else repositions (the routed patrol is wave 2's).
//   6. THE RING CLAUSES (amendment 200(2)): a target outside the live ring is
//      never chased (engaged only from where the bot is, if in reach); with
//      the close under CONFIG.bots.ringOpenMarginMs no fight is opened.
//   7. NO LINE OF FIRE -> pursue (unchanged; wave 2 routes it).
//   8. A fleet prize the profile values -> farm (unchanged).
//   9. IN OWN REACH -> engage. BEYOND IT, THE ODDS GATE (amendments 194–195):
//      pass -> pursue; fail -> lean in (raider / duelist at
//      CONFIG.bots.leanInFactor of the bar), else SHADOW at own reach (`kite`)
//      unless the contact closes with the longer gun, which is left for cover
//      (hide) or disengage. Outnumbered fails outright.
//
// STATE. The clauses that remember (latch, ram exit, cover, contact clock)
// read and write the Story 9.13 mind seats, and only when the caller hands
// the mind in (`PostureInputs.mind`). Without it the chain is the stateless
// function the old call shape got: no latch, no exit, no cover — so a hand
// built test situation still reads exactly what it reads.
//
// PARITY. Everything read is the bot's own self-read, its own track store
// and fogged view (decoys included), the public map / fog, and the zone
// readouts of amendment 190. No world import, no rng, no clock read.

import {
  CONFIG,
  contactHitDamage,
  effectiveStats,
  hullBumper,
  hullEnvelope,
  type DecoyView,
  type HullId,
  type NavGrid,
  type Vec2,
  type ZoneRing,
} from '@salvo/shared';
import type { BotMind, BotPosture, BotZonePhase } from './types.js';
import { LONGEST_HULL_U, lineBlocked, trackVelocity } from './plot.js';
import { atCover, findCover, type CoverSite } from './cover.js';
import {
  closingSpeed,
  damageEstimate,
  estimatedRemainingHp,
  isDecoyPlot,
  ownReachU,
  plotAt,
  ringDeadband,
  ringEscaping,
  tracksOf,
  type BotSituation,
  type BotTrack,
} from './utility.js';

/** Everything the extended chain reads beyond (sit, target, prev) — every
 *  field optional so the original three-argument call compiles and behaves
 *  as the stateless chain. */
export interface PostureInputs {
  /** The bot's mind: the latch, the ram exit, the cover point, the contact
   *  clock and the track store (odds count, decoys) live on it. */
  mind?: BotMind | null;
  /** The `contacts` key of `target` (default: `mind.targetKey`). */
  targetKey?: string | null;
  /** The zone clock (port.zonePhase(), amendment 190). */
  zone?: BotZonePhase | null;
  /** The revealed next ring (port.zoneNextRing()): a bot already inside it
   *  need not leave, so the close-imminent clause does not hold it back. */
  nextRing?: ZoneRing | null;
  /** The shared nav grid (cover snaps to water and prices its detour on it). */
  grid?: NavGrid | null;
}

/** Postures that are already a break-off: the cover point is kept, not
 *  re-searched, while the bot stays in one of them. */
const BREAKING_OFF: ReadonlySet<BotPosture> = new Set(['disengage', 'hide', 'ram']);

// ---------------------------------------------------------------------------
// THE CHAIN
// ---------------------------------------------------------------------------

/** What the bot is doing this tick (see the module header for the order). */
export function choosePosture(
  sit: BotSituation,
  target: BotTrack | null,
  prev: BotPosture = 'reposition',
  inp: PostureInputs = {},
): BotPosture {
  const mind = inp.mind ?? null;
  if (mind !== null) noteContact(mind, sit.now);
  if (ringEscaping(sit, prev === 'ringRun')) return 'ringRun';
  const brokenOff = breakOff(sit, target, prev, inp);
  if (brokenOff !== null) return brokenOff;
  return engagement(sit, ringTarget(sit, target), prev, inp);
}

/** Clauses 2–4: the break-off, or null when the bot is not breaking off. */
function breakOff(sit: BotSituation, target: BotTrack | null, prev: BotPosture, inp: PostureInputs): BotPosture | null {
  const mind = inp.mind ?? null;
  if (mind !== null) settleRam(mind, sit);
  const hurt = brokenHull(sit);
  if (!hurt && !stillLatched(mind, sit)) {
    if (mind !== null) mind.disengagedSince = null;
    return null;
  }
  if (mind !== null) latchBreakOff(mind, sit, target, prev, inp);
  return hurt && ramNow(sit, target, mind, targetKeyOf(inp)) ? 'ram' : 'disengage';
}

/** Stamp the latch (amendment 196) and keep a cover point to run for. */
function latchBreakOff(mind: BotMind, sit: BotSituation, target: BotTrack | null, prev: BotPosture, inp: PostureInputs): void {
  mind.disengagedSince ??= sit.now;
  refreshCover(mind, sit, threatOf(sit, target, mind), prev, inp);
}

/** The broken hull's last ditch: the trigger holds (and, with a mind, the
 *  ram is armed / its strike stamped). */
function ramNow(sit: BotSituation, target: BotTrack | null, mind: BotMind | null, key: string | null): boolean {
  if (!wantsRam(sit, target, mind, key)) return false;
  if (mind !== null) armRam(mind, sit, target, key);
  return true;
}

/** Clauses 5–9 for a target the ring clause has already vetted. */
function engagement(sit: BotSituation, target: BotTrack | null, prev: BotPosture, inp: PostureInputs): BotPosture {
  if (target === null) return idle(sit, inp);
  const p = plotAt(sit, target);
  if (outsideRing(sit.ring, p)) return lineBlocked(sit, p, sit.islands) ? idle(sit, inp) : 'engage';
  const inReach = Math.hypot(p.x - sit.x, p.y - sit.y) <= ownReachU(sit);
  if (!inReach && closeImminent(sit, inp)) return 'reposition';
  if (lineBlocked(sit, p, sit.islands)) return 'pursue';
  const w = sit.profile.targetWeights;
  if (target.fleet && w.fleet >= w.captain) return 'farm';
  if (inReach) return 'engage';
  return beyondReach(sit, target, p, prev, inp);
}

/** Clause 9's far half: the odds gate on a contact beyond own reach. A
 *  siege / trapper already HOLDING at its cover point keeps lying in wait
 *  until the plot comes into reach (amendment 199). */
function beyondReach(sit: BotSituation, target: BotTrack, p: Vec2, prev: BotPosture, inp: PostureInputs): BotPosture {
  const mind = inp.mind ?? null;
  if (prev === 'hold' && sit.profile.holdsInCover && atCover(coverSite(sit), mind?.coverPoint)) return 'hold';
  return gateVerdict(sit, target, p, mind) ?? hideOrLeave(sit, mind, p, prev, inp);
}

/** The gate's answers — pursue, the lean-in pursue, or a SHADOW (`kite`) —
 *  or null for a declined fight (outnumbered fails outright; a closing
 *  contact with the longer gun is left for cover). */
function gateVerdict(sit: BotSituation, target: BotTrack, p: Vec2, mind: BotMind | null): BotPosture | null {
  const tracks = mind === null ? [target] : tracksOf(mind);
  const decoys = mind?.view?.decoys ?? [];
  if (outnumbered(sit, target, tracks, decoys)) return null;
  const odds = oddsFor(sit, target, tracks, decoys);
  const bar = sit.profile.oddsThreshold;
  if (odds >= bar) return 'pursue';
  if (sit.profile.leansIn && odds >= bar * CONFIG.bots.leanInFactor) return 'pursue';
  return shadows(sit, target, p) ? 'kite' : null;
}

/** A declined fight: HIDE when a cover point exists, else disengage. */
function hideOrLeave(sit: BotSituation, mind: BotMind | null, threat: Vec2, prev: BotPosture, inp: PostureInputs): BotPosture {
  if (mind === null) return 'disengage';
  refreshCover(mind, sit, threat, prev, inp);
  return mind.coverPoint ? 'hide' : 'disengage';
}

/** Clause 5: no target. Siege / trapper lie in wait at a cover point. */
function idle(sit: BotSituation, inp: PostureInputs): BotPosture {
  const mind = inp.mind ?? null;
  if (mind === null || !sit.profile.holdsInCover) return 'reposition';
  if (!coverUsable(sit, mind.coverPoint)) {
    mind.coverPoint = findCover(mind, coverSite(sit), null, sit.islands, mind.fogAt, { grid: inp.grid });
  }
  return atCover(coverSite(sit), mind.coverPoint) ? 'hold' : 'reposition';
}

// ---------------------------------------------------------------------------
// THE ODDS GATE (amendments 194–195)
// ---------------------------------------------------------------------------

/**
 * THE ODDS of closing on `target` (amendment 195, the orchestrator's form):
 *   ownHpFrac × (1 + damageEstimate) / peerFactor − crowdPenalty × max(0, nearby − 1)
 * `damageEstimate` is the bot's own Hit-Call estimate (counted per click);
 * `peerFactor` the sighted class's BASE hull over the bot's own class base
 * hull (1 for an unclassed plot — a peer); `nearby` the other hostiles
 * tracked within radar range (nearbyHostiles). Passes at
 * `profile.oddsThreshold`.
 */
export function oddsFor(
  sit: BotSituation,
  target: BotTrack,
  tracks: readonly BotTrack[],
  decoys: readonly DecoyView[],
): number {
  const hpFrac = sit.maxHp > 0 ? sit.hp / sit.maxHp : 0;
  const crowd = CONFIG.bots.crowdPenalty * Math.max(0, nearbyHostiles(sit, target, tracks, decoys) - 1);
  return (hpFrac * (1 + damageEstimate(target))) / peerFactor(sit, target) - crowd;
}

/** OUTNUMBERED (amendment 195): CONFIG.bots.outnumberedCount or more other
 *  hostiles tracked within radar range — the gate fails outright. */
export function outnumbered(
  sit: BotSituation,
  target: BotTrack,
  tracks: readonly BotTrack[],
  decoys: readonly DecoyView[],
): boolean {
  return nearbyHostiles(sit, target, tracks, decoys) >= CONFIG.bots.outnumberedCount;
}

/** Other HOSTILE tracks within the bot's radar range: not the target, not a
 *  wreck, not PvE fleet, not a decoy (known or probable — amendment 197). */
export function nearbyHostiles(
  sit: BotSituation,
  target: BotTrack,
  tracks: readonly BotTrack[],
  decoys: readonly DecoyView[],
): number {
  let n = 0;
  for (const t of tracks) {
    if (t === target || t.sunk || t.fleet || isDecoyPlot(t, decoys)) continue;
    const p = plotAt(sit, t);
    if (Math.hypot(p.x - sit.x, p.y - sit.y) <= sit.stats.radarRange) n += 1;
  }
  return n;
}

/** The sighted class's BASE hull over the bot's own class base hull (never
 *  either side's upgrades — amendment 195); 1 for an unclassed plot. Without
 *  a hull id on the situation the bot's own folded max hull stands in. */
function peerFactor(sit: BotSituation, target: BotTrack): number {
  if (target.cls === null) return 1;
  const own = sit.hullId === undefined ? sit.maxHp : hullEnvelope(sit.hullId).hp;
  return own > 0 ? hullEnvelope(target.cls).hp / own : 1;
}

/** u — the reach a SIGHTED class carries by what the seat can see: its base
 *  deck-gun reach (the seat default; upgrades and a picked gun are private),
 *  memoized per class. An unclassed plot is a peer: own reach. */
const BASE_REACH = new Map<HullId, number>();
export function targetReachU(sit: BotSituation, target: BotTrack): number {
  if (target.cls === null) return ownReachU(sit);
  let r = BASE_REACH.get(target.cls);
  if (r === undefined) {
    r = effectiveStats(hullEnvelope(target.cls)).equipment.gun.rangeU;
    BASE_REACH.set(target.cls, r);
  }
  return r;
}

/** THE SHADOW (amendment 194, read literally — orchestrator ruling
 *  2026-10-17): a failed gate that is not outnumbered holds the contact at
 *  the edge of own reach (`kite`, the band orbit at kiteHoldFrac–1 × reach)
 *  when it is NOT closing, or when it closes and own reach is at least the
 *  sighted class's base reach (≥, so a cannon bot shadows a sighted peer);
 *  a closing contact with the longer gun is left (hide / disengage). */
function shadows(sit: BotSituation, target: BotTrack, p: Vec2): boolean {
  if (!isClosing(sit, target, p)) return true;
  return ownReachU(sit) >= targetReachU(sit, target);
}

/** Is the plot's course pointed at the bot? A course-less plot is not. */
function isClosing(sit: BotSituation, target: BotTrack, p: Vec2): boolean {
  const v = trackVelocity(target);
  if (v === null) return false;
  return v.vx * (sit.x - p.x) + v.vy * (sit.y - p.y) > 0;
}

// ---------------------------------------------------------------------------
// THE RING CLAUSES (amendment 200(2))
// ---------------------------------------------------------------------------

function outsideRing(ring: ZoneRing, p: Vec2): boolean {
  return Math.hypot(p.x - ring.cx, p.y - ring.cy) > ring.r;
}

/** A target outside the live ring is no target unless it is in own reach
 *  right now (engaged from where the bot is, never chased past the rim). */
function ringTarget(sit: BotSituation, target: BotTrack | null): BotTrack | null {
  if (target === null) return null;
  const p = plotAt(sit, target);
  if (!outsideRing(sit.ring, p)) return target;
  return Math.hypot(p.x - sit.x, p.y - sit.y) <= ownReachU(sit) ? target : null;
}

/** The close comes inside CONFIG.bots.ringOpenMarginMs — unless the bot is
 *  already inside the revealed next ring (by its own escape deadband), when
 *  it has nowhere it must leave for. */
function closeImminent(sit: BotSituation, inp: PostureInputs): boolean {
  const ms = inp.zone?.closesInMs ?? null;
  if (ms === null || ms >= CONFIG.bots.ringOpenMarginMs) return false;
  const next = inp.nextRing ?? null;
  if (next === null) return true;
  return Math.hypot(sit.x - next.cx, sit.y - next.cy) > next.r - ringDeadband(sit.stats, sit.speed);
}

// ---------------------------------------------------------------------------
// THE LATCH, THE CONTACT CLOCK AND COVER (amendments 196, 199)
// ---------------------------------------------------------------------------

/** Below the profile's disengage fraction — the break-off's own test, shared
 *  with the ram trigger so the two can never disagree about "broken". */
export function brokenHull(sit: BotSituation): boolean {
  return sit.maxHp > 0 && sit.hp / sit.maxHp < sit.profile.disengageHpFrac;
}

/** A latched break-off not yet released (amendment 196): released once hp is
 *  above the line by the hysteresis AND contact is broken or cover reached. */
function stillLatched(mind: BotMind | null, sit: BotSituation): boolean {
  if (mind === null || mind.disengagedSince === null || mind.disengagedSince === undefined) return false;
  const healed = sit.maxHp > 0 && sit.hp / sit.maxHp >= sit.profile.disengageHpFrac + CONFIG.bots.disengageHysteresis;
  if (!healed) return true;
  const quiet = sit.now - (mind.lastContactAt ?? -1) >= CONFIG.bots.contactBrokenMs;
  return !(quiet || atCover(coverSite(sit), mind.coverPoint));
}

/**
 * THE CONTACT CLOCK (amendment 196's broken-contact half): stamp
 * `mind.lastContactAt` with the latest moment any hostile was SEEN (a live
 * track: now) or PAINTED (its last paint time). Wrecks and decoys (known or
 * probable) are not contact. Reads paint times, not "painted this tick", so
 * a paint between two deliberations still counts.
 */
export function noteContact(mind: BotMind, now: number): void {
  const decoys = mind.view?.decoys ?? [];
  let last = mind.lastContactAt ?? -1;
  for (const t of mind.contacts.values()) {
    if (t.sunk || isDecoyPlot(t, decoys)) continue;
    last = Math.max(last, t.live ? now : t.paintAt);
  }
  mind.lastContactAt = last;
}

/** The cover search's view of the situation. */
function coverSite(sit: BotSituation): CoverSite {
  return {
    x: sit.x,
    y: sit.y,
    waterR: sit.waterR,
    hullLength: sit.hullId === undefined ? LONGEST_HULL_U : hullEnvelope(sit.hullId).hull.length,
  };
}

/** A cover point still worth steering for: set and inside the live ring. */
function coverUsable(sit: BotSituation, p: Vec2 | null | undefined): p is Vec2 {
  return p !== null && p !== undefined && !outsideRing(sit.ring, p);
}

/** Re-search the cover point on a FRESH break-off (the previous posture was
 *  not one), when there is none, or when the ring has left it behind;
 *  otherwise keep it, so the search runs on the decision cadence only when
 *  the answer can have changed. */
function refreshCover(mind: BotMind, sit: BotSituation, threat: Vec2 | null, prev: BotPosture, inp: PostureInputs): void {
  if (BREAKING_OFF.has(prev) && coverUsable(sit, mind.coverPoint)) return;
  mind.coverPoint = findCover(mind, coverSite(sit), threat, sit.islands, mind.fogAt, { grid: inp.grid });
}

/** What the break-off runs from: the target's plot, else the nearest
 *  hostile the bot tracks, else nothing. */
function threatOf(sit: BotSituation, target: BotTrack | null, mind: BotMind): Vec2 | null {
  if (target !== null) return plotAt(sit, target);
  const decoys = mind.view?.decoys ?? [];
  let best: Vec2 | null = null;
  let bestD = Infinity;
  for (const t of mind.contacts.values()) {
    if (t.sunk || isDecoyPlot(t, decoys)) continue;
    const p = plotAt(sit, t);
    const d = Math.hypot(p.x - sit.x, p.y - sit.y);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

function targetKeyOf(inp: PostureInputs): string | null {
  return inp.targetKey ?? inp.mind?.targetKey ?? null;
}

// ---------------------------------------------------------------------------
// THE RAM (amendment 77 trigger, amendment 201 exit)
// ---------------------------------------------------------------------------

/**
 * THE RAM TRIGGER [DRAFT] (Story 9.5, Eric ruling 2026-10-12, epic-9
 * amendment 77 — moved here unchanged from utility.ts): a broken hull rams
 * only a LIVE SIGHTED, classed target within CONFIG.bots.ramReachU whose
 * predicted hit at the PROJECTED closing speed (`contactHitDamage(own max
 * hull, the target's CLASS BASE hp, vn).b`) lands (> 0) and is at least the
 * target's remaining hp by the bot's own Hit-Call estimate.
 * Since Story 9.13 (amendment 201) it also refuses the key of a ram whose
 * exit is pending — touched, ramExitMs gone by, the target still afloat.
 */
function wantsRam(sit: BotSituation, target: BotTrack | null, mind: BotMind | null, key: string | null): boolean {
  if (target === null || !target.live || target.id === null || target.cls === null) return false;
  if (ramRefused(mind, key, sit.now)) return false;
  return ramLands(sit, target, target.cls);
}

/** The exit ban: the key of a ram whose exit is due (amendment 201). */
function ramRefused(mind: BotMind | null, key: string | null, now: number): boolean {
  return mind !== null && key !== null && key === mind.ramTargetKey && ramExitDue(mind, now);
}

/** The amendment-77 arithmetic: in reach, and the priced hit lands and
 *  covers the estimated remaining hull. */
function ramLands(sit: BotSituation, target: BotTrack, cls: HullId): boolean {
  const p = plotAt(sit, target);
  const dx = p.x - sit.x;
  const dy = p.y - sit.y;
  const d = Math.hypot(dx, dy);
  if (d > CONFIG.bots.ramReachU) return false;
  const baseHp = hullEnvelope(cls).hp;
  const hit = contactHitDamage(sit.maxHp, baseHp, closingSpeed(sit, target, dx, dy, d), CONFIG.ram).b;
  return hit > 0 && hit >= estimatedRemainingHp(target, baseHp);
}

/** The strike happened (`ramStruckAt` stamped) and CONFIG.bots.ramExitMs has
 *  run since without the target sinking (a sunk target is no target). */
function ramExitDue(mind: BotMind, now: number): boolean {
  const at = mind.ramStruckAt ?? null;
  return at !== null && now - at >= CONFIG.bots.ramExitMs;
}

/** Arm (or keep) the ram on `key`, stamping the strike the first deliberation
 *  the pair is within bumper distance (the hulls are touching). */
function armRam(mind: BotMind, sit: BotSituation, target: BotTrack | null, key: string | null): void {
  if (key !== mind.ramTargetKey) {
    mind.ramTargetKey = key;
    mind.ramStruckAt = null;
  }
  if (target === null || (mind.ramStruckAt ?? null) !== null) return;
  const p = plotAt(sit, target);
  // Without a hull id the longest participant hull stands in for both halves.
  const bumper = sit.hullId === undefined ? LONGEST_HULL_U + CONFIG.bots.hullBumperU : hullBumper(sit.hullId, target.cls);
  if (Math.hypot(p.x - sit.x, p.y - sit.y) <= bumper) mind.ramStruckAt = sit.now;
}

/** Release the ram memory once the pair has SEPARATED (beyond ramReachU) or
 *  the rammed track is gone from memory — the re-arm ban ends there. */
function settleRam(mind: BotMind, sit: BotSituation): void {
  const key = mind.ramTargetKey ?? null;
  if (key === null) return;
  const t = mind.contacts.get(key);
  if (t !== undefined && !t.sunk) {
    const p = plotAt(sit, t);
    if (Math.hypot(p.x - sit.x, p.y - sit.y) <= CONFIG.bots.ramReachU) return;
  }
  mind.ramTargetKey = null;
  mind.ramStruckAt = null;
}
