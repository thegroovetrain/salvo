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
import type { Rng } from '../math/rng.js';
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

/** Ring-group count implied by the timeline (fail-closed to 1). */
export function zoneGroups(cfg: ZoneTimeline = CONFIG.zone): number {
  return (Array.isArray(cfg.ringSteps) ? cfg.ringSteps.length : 0) + 1;
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
 * Ring radii ring-0 → terminal (length groups+1). Ring 0 is the full map;
 * intermediate rings follow the ringSteps exponents; the last is the terminal
 * radius. STRUCTURALLY monotone non-increasing and ≥ the terminal (each value
 * clamps into [terminal, previous]; NaN falls to the previous radius) — no
 * degenerate cfg can produce a growing or NaN ring.
 */
export function zoneRingRadii(mapRadius: number, cfg: ZoneTimeline = CONFIG.zone): number[] {
  const groups = zoneGroups(cfg);
  const terminal = Math.min(zoneTerminalRadius(cfg), mapRadius);
  const radii = [mapRadius];
  for (let g = 1; g < groups; g += 1) {
    const prev = radii[g - 1];
    const step = clamp01(cfg.ringSteps[g - 1]);
    const r = mapRadius * Math.pow(terminal / mapRadius, step);
    radii.push(Number.isFinite(r) ? Math.min(Math.max(r, terminal), prev) : prev);
  }
  radii.push(Math.min(terminal, radii[radii.length - 1]));
  return radii;
}

/**
 * Roll the full ring set ONCE at zone start. `rng` is the caller's stream —
 * the server passes its private zone stream (amendment 10); tests pass any
 * seeded stream. Consumption order is fixed (angle then distance per ring) so
 * a (seed → rings) mapping is stable. Containment is structural: the center
 * offset is bounded by clamp01(offsetCap) × (r_prev − r_g), so every next
 * ring lies fully inside the current one for ANY stream values.
 */
export function rollZoneRings(mapRadius: number, cfg: ZoneTimeline, rng: Rng): ZoneRing[] {
  const radii = zoneRingRadii(mapRadius, cfg);
  const cap = clamp01(cfg.offsetCap);
  const rings: ZoneRing[] = [{ cx: 0, cy: 0, r: radii[0] }];
  for (let g = 1; g < radii.length; g += 1) {
    const prev = rings[g - 1];
    const angle = rng.float(0, TAU);
    const d = rng.next() * cap * Math.max(0, prev.r - radii[g]);
    rings.push({ cx: prev.cx + Math.cos(angle) * d, cy: prev.cy + Math.sin(angle) * d, r: radii[g] });
  }
  return rings;
}

/** The closed terminal state (shared by both entry points below). */
function closedState(groups: number, terminal: ZoneRing): ZoneState {
  return { phase: 'closed', groupIndex: groups - 1, current: terminal, next: null, closesInMs: 0 };
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
  if (beatMs === null) return closedState(groups, next ?? current);
  const elapsed = Math.max(0, now - startT);
  const beat = Math.floor(elapsed / beatMs);
  const group = Math.floor(beat / ZONE_BEATS_PER_GROUP);
  if (group >= groups) return closedState(groups, next ?? current);
  const beatInGroup = beat - group * ZONE_BEATS_PER_GROUP;
  const phase = BEAT_PHASES[beatInGroup];
  const groupEndMs = (group + 1) * ZONE_BEATS_PER_GROUP * beatMs;
  if (phase !== 'closing') {
    const revealed = phase === 'reveal' ? next : null;
    return { phase, groupIndex: group, current, next: revealed, closesInMs: groupEndMs - beatMs - elapsed };
  }
  const closesInMs = groupEndMs - elapsed;
  if (next === null) return { phase, groupIndex: group, current, next: null, closesInMs };
  const f = (elapsed - (groupEndMs - beatMs)) / beatMs;
  const live: ZoneRing = {
    cx: current.cx + (next.cx - current.cx) * f,
    cy: current.cy + (next.cy - current.cy) * f,
    r: current.r + (next.r - current.r) * f,
  };
  return { phase, groupIndex: group, current: live, next, closesInMs };
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
  if (beatMs === null) return closedState(groups, last);
  const elapsed = Math.max(0, now - startT);
  const group = Math.floor(elapsed / (ZONE_BEATS_PER_GROUP * beatMs));
  if (group >= groups) return closedState(groups, last);
  return zoneLiveState(now, startT, rings[group] ?? last, rings[group + 1] ?? null, cfg);
}

/**
 * Is `pos` outside the circle centered (cx, cy) with radius r? CENTER-AWARE
 * (rings are offset circles as of Story 3.1). Boundary is INCLUSIVE-SAFE: a
 * point exactly ON the ring is INSIDE (not outside), so storm damage requires
 * strictly dist² > r².
 */
export function isOutside(pos: Vec2, cx: number, cy: number, r: number): boolean {
  const dx = pos.x - cx;
  const dy = pos.y - cy;
  return dx * dx + dy * dy > r * r;
}
