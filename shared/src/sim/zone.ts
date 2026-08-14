// Storm circle (battle-royale zone) — the ONE shared PHASED timeline model
// (Story 3.1), used by both the server (authoritative storm damage + schema
// mirroring) and the client (butter-smooth 60fps ring derived locally). Pure
// functions over a plain timeline; no I/O, no Colyseus.
//
// SHAPE (Eric-ratified, epic-3 amendments 3/4/5/7/10): the match runs
// `ringSteps.length + 1` RING GROUPS, each group a fixed four-beat minute
// rhythm of `beatMs` per beat:
//   beat 1 CLEAR   — the live ring holds; open water, no pressure.
//   beat 2 SUPPLY  — reserved structural slot. ZERO behavior, ZERO HUD trace:
//                    the ring holds exactly like clear (the parked supply-drop
//                    mechanic will one day live here; nothing surfaces it).
//   beat 3 REVEAL  — the NEXT ring's geometry becomes public (planning
//                    pressure); the live ring still holds.
//   beat 4 CLOSING — the live ring interpolates LINEARLY (center AND radius)
//                    from ring g to ring g+1 over the beat.
// After the last group the timeline is CLOSED forever on the terminal ring.
//
// SUDDEN DEATH — THE FINAL COLLAPSE (Eric ruling 2026-08-14, superseding
// epic-3 amendment 24's "no post-closure mechanic" for the collapse case).
// With `suddenDeath` set, ONE MORE ring group is appended to the same four-beat
// rhythm, so nothing about the rhythm, the readout grammar, the reveal one-shot
// or the seed derivation is special-cased. At the shipped 60s beat it lands on
// Eric's clock exactly: 12:00-13:00 clear, 13:00-14:00 supply, 14:00 REVEAL
// (the collapse point is marked with an X), 15:00-16:00 CLOSING — the terminal
// ring shrinks CONCENTRICALLY onto its own center, radius 660u -> 0. At 16:00
// the whole map is storm and every hull afloat bleeds stormDps until one is
// left. The collapse ring is:
//   • CONCENTRIC with the terminal ring ("find the center of the final ring…
//     close in on itself"), so it carries NO new information and is NEVER
//     rolled: it consumes no seed material and no offset draw;
//   • radius EXACTLY 0, appended AFTER zoneRingRadii's clamp chain — the 1u
//     floor that protects the schema's `zoneNextR === 0` unrevealed sentinel
//     still binds the GEOMETRIC terminal, and this is the one legal radius-0
//     ring in the model;
//   • SYNTHESIZED, not transmitted: because the wire says "r 0 = unrevealed",
//     the client cannot read the collapse ring off the schema — it rebuilds it
//     from the ring it already holds (collapseRingOf), and the server reaches
//     the identical ring through the rolled array. Same geometry, two inputs —
//     the effectiveStats() firewall pattern applied to the zone.
// With the flag off (every dev-only zoneOverride, every smoke literal) the
// timeline is byte-identical to the pre-ruling three-group one.
//
// RINGS are offset-center circles, rolled ONCE at zone start on a seeded
// server-private stream (World owns the stream — amendment 10: mapSeed is
// client-known, so nothing here may derive centers a client could precompute;
// clients only ever see the revealed prefix via the room schema). Containment
// is STRUCTURAL: each next ring's center offset is bounded by
// offsetCap × (r_cur − r_next), so ring g+1 ⊆ ring g for ANY stream values.
//
// The TERMINAL radius is DERIVED from CONFIG.vision.sight (never an
// independent constant — retuning truesight moves the endgame, Story 3.4);
// intermediate radii step down geometrically via per-group `ringSteps`
// exponents (equal ratio steps at the shipped defaults).

import { CONFIG } from '../constants.js';
import { mulberry32 } from '../math/rng.js';
import type { Vec2 } from '../math/vec.js';

const TAU = Math.PI * 2;

/** Beats per ring group (clear / supply / reveal / closing). Structural. */
export const ZONE_BEATS_PER_GROUP = 4;

/** In-group beat order → phase name (see the file header). */
const BEAT_PHASES = ['clear', 'supply', 'reveal', 'closing'] as const;

/**
 * Timeline tunables (structural subset of CONFIG.zone). Broken out so tests and
 * the dev-only room `zoneOverride` can reshape the timeline without touching
 * stormDps (damage stays authoritative at CONFIG.zone.stormDps — never
 * overridable).
 */
export interface ZoneTimeline {
  /** ms — one beat; a ring group is ZONE_BEATS_PER_GROUP of these. */
  beatMs: number;
  /**
   * Per-group geometric position (0..1 exponent) of each INTERMEDIATE ring in
   * the descent from map radius R to the terminal radius T:
   * r_g = R · (T/R)^ringSteps[g−1]. Length defines the group count
   * (groups = length + 1); the shipped defaults are equal ratio steps
   * (pure geometric shrink). Values outside (0,1) are clamped structurally.
   */
  ringSteps: readonly number[];
  /** 0..1 — max next-ring center offset as a fraction of (r_cur − r_next).
   *  Clamped into [0,1] so containment holds for ANY stream values. */
  offsetCap: number;
  /** × CONFIG.vision.sight — the terminal (endgame) ring radius. The default 2
   *  is the ratified "two truesight diameters across" reading (amendment 4). */
  terminalSightFactor: number;
  /**
   * SUDDEN DEATH (Eric ruling 2026-08-14): append one more ring group whose
   * ring is the terminal ring's own center at radius 0 — the final collapse
   * (see the file header). Optional and DEFAULT-OFF at the type level so every
   * existing dev-only `zoneOverride` literal and every headless smoke keeps the
   * three-group timeline it was written against, unchanged. Only the shipped
   * CONFIG.zone turns it on.
   */
  suddenDeath?: boolean;
}

/**
 * Zone phase for sim/display. `idle` is the pre-start state (zone not yet
 * anchored — a server/schema concern; the pure timeline functions below never
 * return it).
 */
export type ZonePhase = 'idle' | 'clear' | 'supply' | 'reveal' | 'closing' | 'closed';

/** One ring: an offset-center circle in world units. */
export interface ZoneRing {
  cx: number; // u
  cy: number; // u
  r: number; // u
}

/** The live timeline state both sides derive from the same clock + CONFIG. */
export interface ZoneState {
  /** Never 'idle' — the caller owns the not-yet-started state. */
  phase: Exclude<ZonePhase, 'idle'>;
  /** 0-based ring-group index; clamps to the last group once closed. */
  groupIndex: number;
  /** The LIVE ring: ring g exactly during clear/supply/reveal, the linear
   *  ring-g → ring-g+1 interpolation during closing, terminal once closed. */
  current: ZoneRing;
  /** The revealed NEXT ring — non-null from the reveal beat through the end of
   *  the close, null otherwise (clients never see unrevealed geometry). */
  next: ZoneRing | null;
  /** ms — to this group's close START during clear/supply/reveal, to the close
   *  END while closing, 0 once closed. */
  closesInMs: number;
}

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(Math.max(v, 0), 1) : 0);

/**
 * Does this timeline end in the SUDDEN-DEATH collapse group? THE one predicate
 * every consumer asks (shared math, the World's endgame-reached fact, the
 * renderer's mark) — never `cfg.suddenDeath` read raw, so an absent flag and an
 * explicit `false` can never diverge.
 */
export function zoneCollapses(cfg: ZoneTimeline = CONFIG.zone): boolean {
  return cfg.suddenDeath === true;
}

/** Ring groups from the GEOMETRIC descent alone (map → terminal), i.e. the
 *  whole timeline before sudden death appends its collapse group. */
function geometricGroups(cfg: ZoneTimeline): number {
  return (Array.isArray(cfg.ringSteps) ? cfg.ringSteps.length : 0) + 1;
}

/** Ring-group count implied by the timeline (fail-closed to 1), including the
 *  appended sudden-death collapse group when the timeline collapses. */
export function zoneGroups(cfg: ZoneTimeline = CONFIG.zone): number {
  return geometricGroups(cfg) + (zoneCollapses(cfg) ? 1 : 0);
}

/** The collapse ring for `ring`: ITS OWN CENTER at radius 0. Concentric by
 *  construction (Eric ruling 2026-08-14 — "close in on itself"), which is
 *  exactly why it needs no roll, no seed and no wire field: both sides can
 *  build it from the ring they already hold. */
function collapseRingOf(ring: ZoneRing): ZoneRing {
  return { cx: ring.cx, cy: ring.cy, r: 0 };
}

/** The beat duration, or null when degenerate (0/negative/NaN — fail-closed:
 *  callers treat a degenerate timeline as instantly closed, never a hang). */
function beatMsOf(cfg: ZoneTimeline): number | null {
  return Number.isFinite(cfg.beatMs) && cfg.beatMs > 0 ? cfg.beatMs : null;
}

/** Terminal ring radius (u): terminalSightFactor × CONFIG.vision.sight —
 *  COMPUTED from the truesight tunable (Story 3.4's endgame guarantee),
 *  clamped non-negative and fail-closed to the ratified ×2 on NaN. */
export function zoneTerminalRadius(cfg: ZoneTimeline = CONFIG.zone): number {
  const factor = Number.isFinite(cfg.terminalSightFactor) ? Math.max(cfg.terminalSightFactor, 0) : 2;
  return factor * CONFIG.vision.sight;
}

/**
 * ms from zone start to full closure (the end of the last group's close beat).
 * THE tick-budget helper (harness/tests). 0 for a degenerate beat duration —
 * a broken timeline is closed immediately, never open forever.
 */
export function zoneClosedAtMs(cfg: ZoneTimeline = CONFIG.zone): number {
  const beatMs = beatMsOf(cfg);
  return beatMs === null ? 0 : zoneGroups(cfg) * ZONE_BEATS_PER_GROUP * beatMs;
}

/**
 * ms from zone start to the ENDGAME RING — the end of the last GEOMETRIC
 * group's close beat, i.e. the instant the terminal 660u ring becomes the live
 * ring (12:00 at the shipped defaults).
 *
 * Identical to zoneClosedAtMs on a non-collapsing timeline; under sudden death
 * the two separate by one full ring group, and THIS is the one the Story 3.4
 * Endgame Guarantee is about. The distinction is not cosmetic: the batch-sim's
 * past-closure evidence rate asks "did this match run past the endgame ring",
 * and measuring it against full closure instead would score a healthy campaign
 * that concludes at ~13:00 as 0% past closure.
 */
export function zoneEndgameAtMs(cfg: ZoneTimeline = CONFIG.zone): number {
  const beatMs = beatMsOf(cfg);
  return beatMs === null ? 0 : geometricGroups(cfg) * ZONE_BEATS_PER_GROUP * beatMs;
}

/**
 * Ring radii ring-0 → terminal (length groups+1). Ring 0 is the full map;
 * intermediate rings follow the ringSteps exponents; the last is the terminal
 * radius. STRUCTURALLY monotone non-increasing and ≥ the terminal (each value
 * clamps into [terminal, previous]; NaN falls to the previous radius) — no
 * degenerate cfg can produce a growing or NaN ring. The terminal is FLOORED at
 * 1u structurally: a real ring's radius is always > 0, so the schema's
 * `zoneNextR === 0` unrevealed sentinel can never collide with a legal ring
 * even under a degenerate dev-only zoneOverride (terminalSightFactor 0).
 *
 * SUDDEN DEATH appends an exact 0 AFTER that whole clamp chain — deliberately
 * outside it, so the 1u floor keeps protecting the GEOMETRIC terminal (the last
 * ring that can ever ride the wire as revealed geometry) while the collapse
 * ring, which is synthesized on both sides and never transmitted, is the one
 * legal radius-0 ring in the model.
 */
export function zoneRingRadii(mapRadius: number, cfg: ZoneTimeline = CONFIG.zone): number[] {
  const groups = geometricGroups(cfg);
  const terminal = Math.max(1, Math.min(zoneTerminalRadius(cfg), mapRadius));
  const radii = [mapRadius];
  for (let g = 1; g < groups; g += 1) {
    const prev = radii[g - 1];
    const step = clamp01(cfg.ringSteps[g - 1]);
    const r = mapRadius * Math.pow(terminal / mapRadius, step);
    radii.push(Number.isFinite(r) ? Math.min(Math.max(r, terminal), prev) : prev);
  }
  radii.push(Math.min(terminal, radii[radii.length - 1]));
  if (zoneCollapses(cfg)) radii.push(0);
  return radii;
}

/**
 * Roll the full ring set ONCE at zone start. `ringSeeds[i]` seeds an
 * INDEPENDENT mulberry32 stream for rolled ring i+1 (rings 1..groups; ring 0
 * is always the full map at the origin) — one uint32 of server-private seed
 * material per ring, supplied by the caller (amendment 10 + review FIX 2:
 * a single shared stream lets a modded client brute-force the 2^32 state
 * space offline against ring 1's revealed angle/offset and precompute rings
 * 2–3; per-ring streams make one ring's reveal disclose NOTHING about later
 * rings' offsets). Consumption order per stream is fixed (angle then
 * distance) so the (seed → offset) mapping is stable; a MISSING seed fails
 * CLOSED to a concentric ring (offset 0). Containment is structural: the
 * center offset is bounded by clamp01(offsetCap) × (r_prev − r_g), so every
 * next ring lies fully inside the current one for ANY seed values.
 *
 * THE SUDDEN-DEATH COLLAPSE RING IS NOT ROLLED. It is appended concentric with
 * the geometric terminal and consumes NO seed and NO stream draw, so the whole
 * rolled prefix is byte-identical to a non-collapsing timeline on the same
 * seeds — turning the flag on cannot move a single existing ring.
 */
export function rollZoneRings(mapRadius: number, cfg: ZoneTimeline, ringSeeds: readonly number[]): ZoneRing[] {
  const radii = zoneRingRadii(mapRadius, cfg);
  const cap = clamp01(cfg.offsetCap);
  const rolled = zoneCollapses(cfg) ? radii.length - 1 : radii.length;
  const rings: ZoneRing[] = [{ cx: 0, cy: 0, r: radii[0] }];
  for (let g = 1; g < rolled; g += 1) {
    const prev = rings[g - 1];
    const seed = ringSeeds[g - 1];
    const rng = seed === undefined ? null : mulberry32(seed >>> 0);
    const angle = rng === null ? 0 : rng.float(0, TAU);
    const d = rng === null ? 0 : rng.next() * cap * Math.max(0, prev.r - radii[g]);
    rings.push({ cx: prev.cx + Math.cos(angle) * d, cy: prev.cy + Math.sin(angle) * d, r: radii[g] });
  }
  if (zoneCollapses(cfg)) rings.push(collapseRingOf(rings[rings.length - 1]));
  return rings;
}

/**
 * The closed terminal state (shared by both entry points below).
 *
 * Under sudden death the closed ring is the COLLAPSE ring — the terminal ring's
 * own center at radius 0 — regardless of which ring the caller could hand in.
 * That is what makes a schema-fed client agree with the server through the
 * latency window at final closure: its mirror may still carry the 660u terminal
 * as `zoneCur*` for a patch or two, and holding that would render an open safe
 * circle in a map that is entirely storm.
 */
function closedState(groups: number, terminal: ZoneRing, cfg: ZoneTimeline): ZoneState {
  const current = zoneCollapses(cfg) ? collapseRingOf(terminal) : terminal;
  return { phase: 'closed', groupIndex: groups - 1, current, next: null, closesInMs: 0 };
}

/**
 * The EFFECTIVE next ring for a group: the revealed one when there is one, and
 * otherwise — in the FINAL group of a collapsing timeline — the synthesized
 * concentric collapse ring.
 *
 * This is the whole client/server reconciliation in one function. The wire's
 * `zoneNextR === 0` means "unrevealed", so the collapse ring can never arrive
 * as revealed geometry; but in the final group there is exactly ONE thing the
 * next ring can be, so the client rebuilds it instead of receiving it. The
 * server passes it in from the rolled array and this returns it untouched —
 * one derivation, identical geometry, no wire change.
 */
function effectiveNext(
  current: ZoneRing,
  next: ZoneRing | null,
  group: number,
  groups: number,
  cfg: ZoneTimeline,
): ZoneRing | null {
  if (next !== null) return next;
  return zoneCollapses(cfg) && group === groups - 1 ? collapseRingOf(current) : null;
}

/**
 * THE one live-ring derivation — the exact math BOTH sides run (no forked
 * interpolation anywhere). Takes the revealed-prefix shape the client has:
 * `current` = ring g as of the last ring boundary (the schema mirror), `next` =
 * the revealed ring g+1 or null before its reveal beat. The server's
 * full-knowledge zoneStateAt() delegates here, so schema-fed clients and the
 * authoritative world agree beat-exactly on phase AND geometry.
 *
 * Fail-closed: a degenerate beat duration reads as closed on `current`; a
 * closing beat with no `next` (stale schema at a boundary tick) holds ring g.
 *
 * SUDDEN DEATH: in the FINAL group of a collapsing timeline a null `next` is
 * not a stale schema — it is the unrevealed sentinel standing in for the one
 * ring it can only be — so `effectiveNext()` synthesizes the concentric
 * collapse ring there instead of holding. Every other group holds exactly as
 * before.
 */
export function zoneLiveState(
  now: number,
  startT: number,
  current: ZoneRing,
  next: ZoneRing | null,
  cfg: ZoneTimeline = CONFIG.zone,
): ZoneState {
  const beatMs = beatMsOf(cfg);
  const groups = zoneGroups(cfg);
  if (beatMs === null) return closedState(groups, next ?? current, cfg);
  const elapsed = Math.max(0, now - startT);
  const beat = Math.floor(elapsed / beatMs);
  const group = Math.floor(beat / ZONE_BEATS_PER_GROUP);
  if (group >= groups) return closedState(groups, next ?? current, cfg);
  const beatInGroup = beat - group * ZONE_BEATS_PER_GROUP;
  const phase = BEAT_PHASES[beatInGroup];
  const groupEndMs = (group + 1) * ZONE_BEATS_PER_GROUP * beatMs;
  const eff = effectiveNext(current, next, group, groups, cfg);
  if (phase !== 'closing') {
    const revealed = phase === 'reveal' ? eff : null;
    return { phase, groupIndex: group, current, next: revealed, closesInMs: groupEndMs - beatMs - elapsed };
  }
  const closesInMs = groupEndMs - elapsed;
  if (eff === null) return { phase, groupIndex: group, current, next: null, closesInMs };
  const f = (elapsed - (groupEndMs - beatMs)) / beatMs;
  const live: ZoneRing = {
    cx: current.cx + (eff.cx - current.cx) * f,
    cy: current.cy + (eff.cy - current.cy) * f,
    r: current.r + (eff.r - current.r) * f,
  };
  return { phase, groupIndex: group, current: live, next: eff, closesInMs };
}

/**
 * Full-knowledge timeline state over the complete rolled ring set (the server /
 * test entry point; rings.length = groups + 1 from rollZoneRings). Same math as
 * zoneLiveState by construction — it only seats the right rings.
 */
export function zoneStateAt(
  now: number,
  startT: number,
  rings: readonly ZoneRing[],
  cfg: ZoneTimeline = CONFIG.zone,
): ZoneState {
  const beatMs = beatMsOf(cfg);
  const groups = zoneGroups(cfg);
  const last = rings[rings.length - 1];
  if (beatMs === null) return closedState(groups, last, cfg);
  const elapsed = Math.max(0, now - startT);
  const group = Math.floor(elapsed / (ZONE_BEATS_PER_GROUP * beatMs));
  if (group >= groups) return closedState(groups, last, cfg);
  return zoneLiveState(now, startT, rings[group] ?? last, rings[group + 1] ?? null, cfg);
}

/**
 * Is `pos` outside the circle centered (cx, cy) with radius r? CENTER-AWARE
 * (rings are offset circles as of Story 3.1). Boundary is INCLUSIVE-SAFE: a
 * point exactly ON the ring is INSIDE (not outside), so storm damage requires
 * strictly dist² > r².
 *
 * A ring with NO RADIUS CONTAINS NOTHING: `r <= 0` is outside for every point,
 * including the ring's own center. That is the sudden-death collapse ring's
 * whole meaning (at full collapse the map is 100% storm and every hull afloat
 * bleeds), and writing it as `!(r > 0)` also makes a NaN radius fail CLOSED
 * rather than silently marking the entire map safe.
 */
export function isOutside(pos: Vec2, cx: number, cy: number, r: number): boolean {
  if (!(r > 0)) return true;
  const dx = pos.x - cx;
  const dy = pos.y - cy;
  return dx * dx + dy * dy > r * r;
}
