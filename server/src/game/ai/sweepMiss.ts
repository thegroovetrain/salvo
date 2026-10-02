// THE SWEEP-MISS DROP (Eric ruling 2026-10-02, cycle 165) — split out of
// ai/plot.ts at the review gate.
//
// When the bot's own beam crosses a plot's predicted spot and nothing paints,
// the plot is gone — what a human concludes watching the sweep line pass
// empty water. Three refinements make "nothing painted" mean something:
//
//   * THE PERCEPTION BOUNDARY'S OWN SHADOW TEST (E7). Beyond sight a hull
//     paints only when the shared height-aware radar march (`visibilityTo`
//     over the map's height raster — public data, `port.map.heightRaster`,
//     built once with the map) says it is at least partly illuminated; that
//     is the very predicate the blip gate applies, so "it would have painted"
//     is asked in the same words. Inside the sight bubble radar paints
//     nothing and sight decides on binary island LOS, so the bubble keeps
//     `lineBlocked`.
//   * THE GRACE (two ticks) — the paint lands on the hull's REAL bearing,
//     which can trail the predicted bearing by a tick or two.
//   * THE WHOLE BAND (E1). The age-grown association radius says how far off
//     its prediction the hull may be; the beam must have swept past that
//     whole disc before an empty sweep is evidence of absence.
//
// The beam window is [lastSweep, sweepAngle): this tick's own angle and the
// one the bot remembered from its previous fold (BotMind.lastSweep) — what a
// human client derives from two consecutive `OwnShip.sweep` frames. Pure: no
// rng, no clock read.

import {
  visibilityTo,
  wrapPositive,
  type EffectiveStats,
  type HeightRaster,
  type Island,
} from '@salvo/shared';
import type { RememberedContact } from './types.js';
import { SWEEP_MISS_GRACE_MS, lineBlocked, predictedAssocRadius, predictedPos } from './plot.js';

/** The two-tick grace — defined in ai/plot.ts (the dead-reckoning horizon is
 *  built from it), re-exported here beside the drop it governs. */
export { SWEEP_MISS_GRACE_MS } from './plot.js';

type TrackMap = Map<string, RememberedContact>;

/** The bot's own position, sensor reach and the public map — the
 *  `BotSituation` fields the sweep-miss test reads, plus the map's height
 *  raster. `raster` is optional so a hand-built site can omit it, in which
 *  case the annulus falls back to island LOS (the conservative gate: the
 *  radar shadow needs land ON the ray, so LOS-clear implies illuminated). */
export interface SweepSite {
  readonly x: number;
  readonly y: number;
  readonly stats: Pick<EffectiveStats, 'radarRange' | 'sightRange' | 'sweepPeriodMs'>;
  readonly islands: readonly Island[];
  readonly raster?: HeightRaster | null;
  /** The public map radius about the map centre — predictions stay on the
   *  water (ai/plot.ts predictedPos). Omitted = no clamp. */
  readonly waterR?: number;
}

/** The beam: this tick's angle (BotSelf's self-read) and the angle the bot
 *  remembered from its previous fold (`BotMind.lastSweep`, -1 = none). */
export interface SweepBeam {
  readonly sweepAngle: number;
  readonly lastSweep: number;
}

/** Did the beam cross bearing `brg` since the last fold? The perception
 *  boundary's own half-open, wrap-safe window — [lastSweep, sweepAngle) —
 *  replicated rather than imported (ai/ may not import signals.js).
 *  Start-inclusive, strict at the end, so a bearing is crossed exactly once
 *  per revolution; a zero-width window (a frozen beam) or no remembered angle
 *  (the first fold of a life) crosses nothing. */
function beamCrossed(beam: SweepBeam, brg: number): boolean {
  if (beam.lastSweep < 0) return false;
  const window = wrapPositive(beam.sweepAngle - beam.lastSweep);
  return wrapPositive(brg - beam.lastSweep) < window;
}

/** Would a hull at `p` (at distance `d`) have answered the beam? Inside the
 *  sight bubble: sight's own binary island LOS (radar paints nothing there).
 *  Beyond it: the shared radar-shadow march the blip gate uses, when the map
 *  raster is at hand; else island LOS. */
function wouldPaint(site: SweepSite, px: number, py: number, d: number): boolean {
  if (d <= site.stats.sightRange || site.raster == null) {
    return !lineBlocked({ x: site.x, y: site.y }, { x: px, y: py }, site.islands);
  }
  return visibilityTo(site.raster, site.x, site.y, px, py) > 0;
}

/**
 * Did the bot's beam just sweep this plot's predicted spot and come back
 * empty? True iff the plot is not in sight, was not refreshed THIS tick (a
 * paint folded this tick is the opposite of a miss), its predicted position
 * is inside the bot's radar range where a hull would have answered
 * (wouldPaint), and the bearing to it lies in this tick's paint window.
 */
export function sweptAndMissed(beam: SweepBeam, site: SweepSite, t: RememberedContact, now: number): boolean {
  if (t.live || t.seenAt === now) return false;
  const p = predictedPos(t, now, site.waterR);
  const dx = p.x - site.x;
  const dy = p.y - site.y;
  const d = Math.hypot(dx, dy);
  if (d > site.stats.radarRange) return false;
  if (!wouldPaint(site, p.x, p.y, d)) return false;
  return beamCrossed(beam, Math.atan2(dy, dx));
}

/**
 * HAS THE BEAM CLEARED THE PLOT'S WHOLE BAND (cycle 165 review, E1)? The
 * plot's association radius (ai/plot.ts `predictedAssocRadius`, age-grown for
 * a plot with a course) is how far from the prediction the hull may honestly
 * be — and a paint anywhere inside that disc would have joined the plot. So
 * an empty sweep means nothing until the beam has swept PAST the whole disc:
 * its angular half-width seen from the bot is asin(radius / distance) (a full
 * quarter turn when the bot sits inside the disc). Measured from the mark, a
 * full revolution with no paint clears it whatever the geometry, so a window
 * that wrapped round still drops.
 */
function bandCleared(beam: SweepBeam, site: SweepSite, t: RememberedContact, now: number): boolean {
  if (now - t.missSweptAt >= site.stats.sweepPeriodMs) return true;
  const p = predictedPos(t, now, site.waterR);
  const d = Math.hypot(p.x - site.x, p.y - site.y);
  const half = d > 0 ? Math.asin(Math.min(1, predictedAssocRadius(t, now) / d)) : Math.PI / 2;
  return wrapPositive(beam.sweepAngle - Math.atan2(p.y - site.y, p.x - site.x)) >= half;
}

/** Is a MARKED plot due to go: still unrefreshed since the mark, the grace
 *  run, and the band cleared? */
function markExpired(beam: SweepBeam, site: SweepSite, t: RememberedContact, now: number): boolean {
  if (t.seenAt >= t.missSweptAt) return false;
  if (now - t.missSweptAt < SWEEP_MISS_GRACE_MS) return false;
  return bandCleared(beam, site, t, now);
}

/**
 * The sweep-miss pass. A plot the beam swept clean this tick is MARKED
 * (`missSweptAt`); a marked plot is deleted once markExpired says so. A
 * refresh clears the mark at the writer (utility.ts writeTrack /
 * foldHitCall), so the `seenAt` test there is a belt-and-braces check.
 * Map deletion during iteration is safe and keeps the survivors' order.
 */
export function settleSweptMisses(tracks: TrackMap, beam: SweepBeam, site: SweepSite, now: number): void {
  for (const [key, t] of tracks) {
    if (t.missSweptAt >= 0) {
      if (markExpired(beam, site, t, now)) tracks.delete(key);
      continue;
    }
    if (sweptAndMissed(beam, site, t, now)) t.missSweptAt = now;
  }
}
