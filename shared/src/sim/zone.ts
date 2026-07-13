// Storm circle (battle-royale zone) — the ONE shared timeline model, used by
// both the server (authoritative storm damage + schema animation) and the
// client (butter-smooth 60fps ring derived locally). Pure functions over a
// plain timeline; no I/O, no Colyseus.
//
// The zone is concentric to the map center (0, 0) in the tracer (offset-center
// shrink is a flagged post-tracer knob). Its timeline is anchored to a START
// TIME, not room creation: the match lifecycle (step 14) calls World.startZone()
// at the waiting->active transition, so everything here takes `startT`.
//
// SHAPE OF THE CURVE — RULING: the shrink is LINEAR for the prototype. The knob
// to change it lives here and NOWHERE else (both sides call this one function),
// so an ease-in/out is a one-line swap in shrinkFraction() when we want it.

import { CONFIG } from '../constants.js';
import type { Vec2 } from '../math/vec.js';

/**
 * Timeline tunables (structural subset of CONFIG.zone). Broken out so tests and
 * the dev-only room `zoneOverride` can fast-forward the timeline without
 * touching stormDps (damage stays authoritative at CONFIG.zone.stormDps).
 */
export interface ZoneTimeline {
  grace: number; // ms — full radius before the shrink begins
  shrinkDuration: number; // ms — time to shrink from full to the end radius
  endRadiusFraction: number; // final radius as a fraction of mapRadius
}

/** Coarse zone phase for display/UX. `idle` (pre-start) is a server concern. */
export type ZonePhase = 'grace' | 'shrinking' | 'closed';

/** Default timeline: the shipped CONFIG values. */
export const DEFAULT_ZONE: ZoneTimeline = CONFIG.zone;

/**
 * Fraction (0..1) of the way through the shrink at `elapsedInShrink` ms.
 * LINEAR (the knob — see file header). Clamped to [0, 1].
 */
function shrinkFraction(elapsedInShrink: number, shrinkDuration: number): number {
  if (shrinkDuration <= 0) return 1;
  const f = elapsedInShrink / shrinkDuration;
  return f < 0 ? 0 : f > 1 ? 1 : f;
}

/**
 * The safe-zone radius (world units) at server time `t`, given the timeline was
 * anchored at `startT`. Full through the grace window, then shrinks over
 * shrinkDuration to endRadiusFraction·mapRadius, then holds. Grace boundary is
 * INCLUSIVE (radius is still full at exactly elapsed == grace, since the shrink
 * fraction is 0 there — no discontinuity).
 */
export function zoneRadiusAt(
  t: number,
  startT: number,
  mapRadius: number,
  cfg: ZoneTimeline = DEFAULT_ZONE,
): number {
  const elapsed = t - startT;
  if (elapsed <= cfg.grace) return mapRadius;
  const endRadius = mapRadius * cfg.endRadiusFraction;
  const frac = shrinkFraction(elapsed - cfg.grace, cfg.shrinkDuration);
  return mapRadius + (endRadius - mapRadius) * frac;
}

/**
 * Zone phase at server time `t` (timeline anchored at `startT`): `grace` before
 * the shrink starts, `shrinking` while it closes, `closed` once it holds at the
 * end radius. Aligns with zoneRadiusAt (at elapsed == grace the phase reads
 * `shrinking` but the radius is still full, since shrink fraction is 0).
 */
export function zonePhaseAt(t: number, startT: number, cfg: ZoneTimeline = DEFAULT_ZONE): ZonePhase {
  const elapsed = t - startT;
  if (elapsed < cfg.grace) return 'grace';
  if (elapsed < cfg.grace + cfg.shrinkDuration) return 'shrinking';
  return 'closed';
}

/**
 * Is `pos` outside the safe zone of the given radius? Concentric to the map
 * center (0, 0). Boundary is INCLUSIVE-SAFE: a point exactly ON the ring is
 * INSIDE (not outside), so storm damage requires strictly x²+y² > radius².
 */
export function isOutside(pos: Vec2, radius: number): boolean {
  return pos.x * pos.x + pos.y * pos.y > radius * radius;
}
