// THE PLOTTING TABLE — what a bot can work out about a radar plot's MOTION
// from the rows it is already sent (cycle 165).
//
// A radar paint carries no course and no speed (the identity-free return
// grammar), and until this cycle a bot treated every plot as frozen at its
// last paint: the lead solve aimed at a point up to one sweep old, successive
// paints of a moving hull landed ~190u apart and each opened a NEW plot, and
// the `wk` wake rows — the very course information a human reads off the
// scope — were dropped on the floor. Measured: 0 % machine-gun hits on a
// moving radar-only target at 500u. This module is the bot's plotting table:
//
//   * THE WAKE FIT (first paint). A wake segment's water-age bucket is on the
//     wire, so the ribbon behind a fresh paint has an age GRADIENT: the old
//     water is where the hull was, the paint is where it is. Course = from the
//     oldest painted water toward the paint; speed = that baseline over that
//     water's age. No ship id, no wake owner — the wire refuses both, so the
//     fit is pure geometry over cells near the plot (amendment 194's "the
//     player's inference, never the wire's statement").
//   * PAINT-TO-PAINT (every later paint). Two paints of one plot a second or
//     more apart are a measurement, and override the wake guess.
//   * DEAD RECKONING. `predictedPos` runs the plot forward on its course; the
//     lead solve, the paint association and the sweep-miss drop all read it.
//   * THE SWEEP-MISS DROP (Eric ruling 2026-10-02, cycle 165). When the bot's
//     own beam crosses a plot's predicted spot and nothing paints, the plot is
//     gone — what a human concludes watching the sweep line pass empty water.
//     Island LOS is the conservative gate: the height-aware radar shadow needs
//     land ON the ray, so LOS-clear means "it would have painted".
//
// PURE: no rng, no clock read (`now` is passed in), Map insertion order is
// preserved everywhere. Everything here reads the bot's fogged view, its
// own track store and self-reads a human client is also sent (the beam
// angles — `OwnShip.sweep`). Nothing here imports world.js or perception.js.

import {
  CONFIG,
  SHIP_CLASS_IDS,
  WAKE_AGE_BUCKETS,
  hullEnvelope,
  islandBlocksSegment,
  wrapPositive,
  type EffectiveStats,
  type GameEvent,
  type GhostPaint,
  type Island,
  type Vec2,
} from '@salvo/shared';
import type { BotMind, RememberedContact, WakeCell } from './types.js';

export type { WakeCell } from './types.js';

type TrackMap = Map<string, RememberedContact>;

/** ms — one full sweep revolution at the BASE rotation rate: the persistence
 *  bar a fog track must clear before 30s-reload ordnance commits to it, the
 *  machine gun's hold age for a course-less plot, and the wake buffer's
 *  memory. Lives here (and is re-exported by ai/utility.ts) so the plotting
 *  table needs no import from utility.ts — which imports this module. */
export const TRACK_PERSIST_MS = 60000 / CONFIG.vision.sweepRpm;

/** u/s — the fastest PARTICIPANT hull's rated top speed, off the class table
 *  (never a literal): the reach of a wake ribbon, the plausibility cap on a
 *  course estimate and the association radius for a course-less plot all
 *  scale with it, so a hull retune moves them together. */
export const FASTEST_HULL_SPEED = Math.max(
  ...SHIP_CLASS_IDS.map((id) => hullEnvelope(id).kinematics.maxSpeed),
);

/** u — the LONGEST participant hull (off the class table, never a literal):
 *  the machine gun's aim-past overshoot for a plot of unknown class, and half
 *  of it bounds how far from a plot's centre a Hit Call can land. */
export const LONGEST_HULL_U = Math.max(...SHIP_CLASS_IDS.map((id) => hullEnvelope(id).hull.length));

/** u — how far from a plot a wake cell may lie and still be ITS water: the
 *  longest ribbon the fastest hull can leave (top speed × the water's life)
 *  plus two lattice cells of rasterization slop. */
export const WAKE_REACH_U = FASTEST_HULL_SPEED * (CONFIG.vision.wakeLifeMs / 1000) + 2 * CONFIG.vision.radarCellU;

/** u — a wake baseline shorter than two lattice cells is quantization noise,
 *  not a course. */
const WAKE_MIN_BASELINE_U = 2 * CONFIG.vision.radarCellU;

/** u — the shortest baseline the YOUNG-bucket fit accepts (four lattice
 *  cells): below it the 9 u quantization is too large a share of the chord to
 *  trust the direction, and the fit falls back to the oldest bucket. */
const WAKE_YOUNG_BASELINE_U = 4 * CONFIG.vision.radarCellU;

/** Painted wake cells a course fit needs, at minimum. */
const WAKE_MIN_CELLS = 3;

/** u/s — an estimate faster than this is not a hull (another ribbon crossed
 *  the plot's water, or the gradient was misread). 1.5 × leaves room for the
 *  speed boost and a wake draft on top of the rated top speed. */
const PLAUSIBLE_SPEED = 1.5 * FASTEST_HULL_SPEED;

/** ms — the shortest paint pair that counts as a velocity measurement. Below
 *  this the lattice quantization (9u cells) dominates the displacement. */
export const PAINT_BASELINE_MIN_MS = 1000;

/** u — association radius for an identity-free return-grammar paint, measured
 *  from a plot's PREDICTED position (cycle 165). Six lattice cells: the
 *  lattice quantizes to 9u and the mask is deliberately fuzzed, so this is a
 *  few steps of slop and no more. A course-less plot gets the wider,
 *  unambiguous-only second chance in `associatePaint`. */
export const ANON_ASSOC_U = CONFIG.vision.radarCellU * 6;

/**
 * IS THE STRAIGHT LINE FROM `a` TO `b` STOPPED BY LAND?
 *
 * The bot's line-of-fire test, and it is the SIM'S OWN PRIMITIVE
 * (`islandBlocksSegment` — bounding-circle broadphase, `core` early-out, then
 * the exact coastline walk), which is what `stepShell` resolves flight against
 * and what `clipAtIslands` draws the human's aim preview with. One question,
 * one answer, every consumer (re-exported by ai/utility.ts, its old home).
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

/** Centroid of a lattice rect's LIT cells in world units, or null for an
 *  empty mask — a radar blip and a wake segment share the rect grammar, so
 *  one function reads both. `gx`/`gy` are absolute lattice indices, so a
 *  cell's centre is `(index + 0.5) * radarCellU` — the only geometry the
 *  grammar discloses. */
export function paintCenter(e: GhostPaint): Vec2 | null {
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

// ---------------------------------------------------------------------------
// KINEMATICS
// ---------------------------------------------------------------------------

/** A plot's velocity (u/s): the DISCLOSED pose when the source gave one, else
 *  the bot's estimate, else null (a course-less plot). */
export function trackVelocity(t: RememberedContact): { vx: number; vy: number } | null {
  if (t.heading !== null && t.speed !== null) {
    return { vx: Math.cos(t.heading) * t.speed, vy: Math.sin(t.heading) * t.speed };
  }
  if (t.vx !== null && t.vy !== null) return { vx: t.vx, vy: t.vy };
  return null;
}

/** Where the plot should be NOW: its last-known position run forward on its
 *  course over the time since it was last refreshed. Identity for a
 *  course-less plot (and for anything refreshed this tick). */
export function predictedPos(t: RememberedContact, now: number): Vec2 {
  const v = trackVelocity(t);
  if (v === null) return { x: t.x, y: t.y };
  const dt = Math.max(0, now - t.seenAt) / 1000;
  return { x: t.x + v.vx * dt, y: t.y + v.vy * dt };
}

/** u — a paint-to-paint displacement shorter than this is MEASURED
 *  STATIONARY (orchestrator ruling F4, cycle 165): two lattice cells. A
 *  parked hull's paint centroids jitter by up to a cell between sweeps (the
 *  mask is fuzzed on the 9 u lattice), and reading that jitter as a slow
 *  crawl dead-reckons the parked plot off its hull — a few u per second,
 *  compounding for the whole sweep. */
const PAINT_STILL_U = 2 * CONFIG.vision.radarCellU;

/** Paint-to-paint velocity: the displacement between the plot's last radar
 *  paint and this one over the time between them — or null when there is no
 *  earlier paint or the pair is too close in time to measure. A displacement
 *  under PAINT_STILL_U is a measured ZERO course ({0, 0}): the plot HAS a
 *  course (it is stationary), which is not the same as having none. */
export function paintVelocity(
  prev: Pick<RememberedContact, 'paintX' | 'paintY' | 'paintAt'>,
  x: number,
  y: number,
  now: number,
): { vx: number; vy: number } | null {
  if (prev.paintAt < 0) return null;
  const dt = now - prev.paintAt;
  if (dt < PAINT_BASELINE_MIN_MS) return null;
  const dx = x - prev.paintX;
  const dy = y - prev.paintY;
  if (Math.hypot(dx, dy) < PAINT_STILL_U) return { vx: 0, vy: 0 };
  const s = dt / 1000;
  return { vx: dx / s, vy: dy / s };
}

// ---------------------------------------------------------------------------
// THE WAKE FIT
// ---------------------------------------------------------------------------

/** Buffer every `wk` row of this view as one remembered cell (its lit-cell
 *  centroid, its age bucket, the paint time) and forget cells older than one
 *  base sweep revolution — the beam has gone round since, and fresher water
 *  has been painted if the hull is still there. */
export function foldWakeCells(mind: BotMind, events: readonly GameEvent[], now: number): void {
  const kept = mind.wakeCells.filter((c) => now - c.t <= TRACK_PERSIST_MS);
  for (const e of events) {
    if (e.k !== 'wk') continue;
    const c = paintCenter(e);
    if (c !== null) kept.push({ x: c.x, y: c.y, bucket: e.a, t: now });
  }
  mind.wakeCells = kept;
}

/** Painted cells per age bucket. */
function bucketCounts(cells: readonly WakeCell[]): number[] {
  const counts = new Array<number>(WAKE_AGE_BUCKETS).fill(0);
  for (const c of cells) counts[c.bucket] = (counts[c.bucket] ?? 0) + 1;
  return counts;
}

/** The cells of the OLDEST age bucket that holds two or more cells — the
 *  far end of the ribbon, measured with some redundancy — else the oldest
 *  bucket present at all (one cell; the baseline-length gate decides whether
 *  a lone cell is far enough out to mean anything). */
function oldestBucketCells(cells: readonly WakeCell[]): WakeCell[] {
  const counts = bucketCounts(cells);
  const pair = oldestBucketWith(counts, 2);
  const pick = pair >= 0 ? pair : oldestBucketWith(counts, 1);
  return cells.filter((c) => c.bucket === pick);
}

/**
 * THE REFERENCE WATER for the course fit (cycle 165 review, orchestrator
 * ruling F3): the YOUNGEST bucket holding two or more cells whose centroid
 * lies at least WAKE_YOUNG_BASELINE_U from the plot; else the oldest-bucket
 * rule above. WHY YOUNG FIRST: the fit draws a straight CHORD from the old
 * water to the paint, and a turning hull's ribbon is an arc — the chord's
 * direction is off the hull's present heading by half the arc angle. On a
 * 500 u orbit at 45 u/s the oldest bucket (~4.8 s, ~216 u of arc) reads ~12°
 * off (20° measured with quantization); bucket 1 (~2 s) reads ~5°. A short
 * chord is noisier, hence the four-cell floor before it is trusted.
 */
function referenceCells(cells: readonly WakeCell[], t: Pick<RememberedContact, 'x' | 'y'>): WakeCell[] {
  const counts = bucketCounts(cells);
  for (let b = 0; b < WAKE_AGE_BUCKETS; b += 1) {
    if ((counts[b] ?? 0) < 2) continue;
    const mine = cells.filter((c) => c.bucket === b);
    const c = centroidOf(mine);
    if (Math.hypot(t.x - c.x, t.y - c.y) >= WAKE_YOUNG_BASELINE_U) return mine;
  }
  return oldestBucketCells(cells);
}

/** The oldest bucket holding at least `min` cells, or -1. */
function oldestBucketWith(counts: readonly number[], min: number): number {
  for (let b = counts.length - 1; b >= 0; b -= 1) {
    if ((counts[b] ?? 0) >= min) return b;
  }
  return -1;
}

/** Mean of a non-empty cell list's positions and paint times. */
function centroidOf(cells: readonly WakeCell[]): { x: number; y: number; t: number } {
  let x = 0;
  let y = 0;
  let t = 0;
  for (const c of cells) {
    x += c.x;
    y += c.y;
    t += c.t;
  }
  return { x: x / cells.length, y: y / cells.length, t: t / cells.length };
}

/** Wake cells near enough to the plot to be its ribbon, painted within the
 *  last sweep revolution, with an in-range age bucket. */
function nearCells(t: Pick<RememberedContact, 'x' | 'y'>, cells: readonly WakeCell[], now: number): WakeCell[] {
  return cells.filter(
    (c) =>
      now - c.t <= TRACK_PERSIST_MS &&
      c.bucket >= 0 &&
      c.bucket < WAKE_AGE_BUCKETS &&
      Math.hypot(c.x - t.x, c.y - t.y) <= WAKE_REACH_U,
  );
}

/**
 * THE FIRST-PAINT COURSE: fit a velocity to the wake ribbon painted near a
 * plot, or null when the ribbon cannot support one.
 *
 * The reference bucket's centroid C (referenceCells) is where the hull WAS; the
 * plot is where it IS. The water in bucket `a` was `(a + 0.5) / BUCKETS ×
 * wakeLifeMs` old (the bucket's mean) WHEN IT WAS PAINTED, and the plot was
 * last refreshed at `seenAt` — so the hull covered |plot − C| in that mean
 * age plus the gap between the two paints (the beam can cross the ribbon a
 * few ticks before or after the hull, so the gap has either sign). Too short
 * a baseline (< two cells), a non-positive elapsed time or an implausible
 * speed (> 1.5 × the fastest hull) is no estimate.
 */
export function fitWakeVelocity(
  t: Pick<RememberedContact, 'x' | 'y' | 'seenAt'>,
  cells: readonly WakeCell[],
  now: number,
): { vx: number; vy: number } | null {
  const near = nearCells(t, cells, now);
  if (near.length < WAKE_MIN_CELLS) return null;
  const ref = referenceCells(near, t);
  if (ref.length === 0) return null;
  const c = centroidOf(ref);
  const dx = t.x - c.x;
  const dy = t.y - c.y;
  const baseline = Math.hypot(dx, dy);
  if (baseline < WAKE_MIN_BASELINE_U) return null;
  const bucket = ref[0]?.bucket ?? 0;
  const meanAgeMs = ((bucket + 0.5) / WAKE_AGE_BUCKETS) * CONFIG.vision.wakeLifeMs;
  const elapsedS = (meanAgeMs + (t.seenAt - c.t)) / 1000;
  if (!(elapsedS > 0)) return null;
  if (baseline / elapsedS > PLAUSIBLE_SPEED) return null;
  return { vx: dx / elapsedS, vy: dy / elapsedS };
}

// ---------------------------------------------------------------------------
// PAINT ASSOCIATION
// ---------------------------------------------------------------------------

/** Nearest plot whose PREDICTED position lies within `maxU` of a point, or
 *  null. `anonOnly` restricts the search to identity-free plots (the paint
 *  association); a Hit Call searches every plot. Ties keep the earliest
 *  insertion (Map order), so the fold stays deterministic. */
export function nearestPredicted(
  tracks: TrackMap,
  p: Vec2,
  now: number,
  maxU: number,
  anonOnly: boolean,
): string | null {
  let best: string | null = null;
  let bestD2 = maxU * maxU;
  for (const [key, t] of tracks) {
    if (anonOnly && t.id !== null) continue;
    const q = predictedPos(t, now);
    const d2 = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
    if (d2 <= bestD2) {
      bestD2 = d2;
      best = key;
    }
  }
  return best;
}

/**
 * × FASTEST_HULL_SPEED — how fast the association radius of a plot WITH A
 * COURSE grows with its prediction's age (orchestrator ruling F2, cycle 165).
 * A course is an estimate: heading error and a turning hull carry the real
 * hull off the dead-reckoned line, and the error grows with every second
 * since the last refresh. Measured on the orbit and straight-runner probes,
 * the next paint landed 55–97 u from the prediction at 1.5–4.25 s — just
 * past the fixed 54 u radius, so each of those paints opened a NEW plot and
 * the paint-to-paint course (1–12° of heading error, against the wake
 * chord's ~20° on a turn) was never measured. A third of the fastest hull's
 * speed per second covers that band (~118 u at 4.25 s) without reaching the
 * next hull over in a normal fight. Nearest still wins.
 */
const ASSOC_GROWTH_FRAC = 1 / 3;

/** u — rule (a)'s radius for one plot: the fixed slop for a course-less plot
 *  (its second chance is rule b), plus prediction-age growth for one with a
 *  course. */
function predictedAssocRadius(t: RememberedContact, now: number): number {
  if (trackVelocity(t) === null) return ANON_ASSOC_U;
  const ageS = Math.max(0, now - t.seenAt) / 1000;
  return ANON_ASSOC_U + FASTEST_HULL_SPEED * ASSOC_GROWTH_FRAC * ageS;
}

/** Rule (a): the identity-free plot whose PREDICTED position is nearest `p`
 *  among those within their own radius (predictedAssocRadius), or null. Ties
 *  keep the earliest insertion (Map order). */
function nearestPredictedAnon(tracks: TrackMap, p: Vec2, now: number): string | null {
  let best: string | null = null;
  let bestD = Infinity;
  for (const [key, t] of tracks) {
    if (t.id !== null || t.seenAt === now) continue; // one paint per plot per tick
    const q = predictedPos(t, now);
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d <= predictedAssocRadius(t, now) && d < bestD) {
      bestD = d;
      best = key;
    }
  }
  return best;
}

/** u — how far a course-less plot could have sailed since its last paint (or
 *  its last refresh, if it was never painted), plus the association slop. */
function courselessReach(t: RememberedContact, now: number): number {
  const since = t.paintAt >= 0 ? t.paintAt : t.seenAt;
  return FASTEST_HULL_SPEED * (Math.max(0, now - since) / 1000) + ANON_ASSOC_U;
}

/** The ONE course-less identity-free plot that could have reached `p`, or
 *  null when none — or more than one — could (ambiguity opens a new plot:
 *  nothing on the wire says which it was). */
function soleCourselessCandidate(tracks: TrackMap, p: Vec2, now: number): string | null {
  let found: string | null = null;
  for (const [key, t] of tracks) {
    if (t.id !== null || t.seenAt === now || trackVelocity(t) !== null) continue;
    if (Math.hypot(t.x - p.x, t.y - p.y) > courselessReach(t, now)) continue;
    if (found !== null) return null;
    found = key;
  }
  return found;
}

/**
 * Which identity-free plot does a position at `p` belong to (cycle 165)?
 *   (a) the nearest plot whose PREDICTED position is within its radius —
 *       ANON_ASSOC_U, growing with the prediction's age for a plot with a
 *       course — so one hull stays one plot however far it sailed between
 *       sweeps, as long as the bot has its course;
 *   (b) else the SOLE course-less plot that could have sailed there since its
 *       last paint at the fastest hull's speed — the second paint that gives
 *       a plot its first measured course;
 *   else null (the caller opens a new plot).
 * ONE PAINT PER PLOT PER TICK (cycle 165 review): a plot already refreshed
 * this tick is skipped by both rules, so a second same-tick paint (two hulls
 * close together) cannot re-take the plot the first paint just moved — it
 * goes to the next candidate or opens its own plot, and the other hull's plot
 * is not left looking swept clean.
 */
export function associatePaint(tracks: TrackMap, p: Vec2, now: number): string | null {
  return nearestPredictedAnon(tracks, p, now) ?? soleCourselessCandidate(tracks, p, now);
}

// ---------------------------------------------------------------------------
// THE SWEEP-MISS DROP (Eric ruling 2026-10-02, cycle 165)
// ---------------------------------------------------------------------------

/** The bot's own position, radar reach and the public coastlines — the
 *  `BotSituation` fields the sweep-miss test reads. */
export interface SweepSite {
  readonly x: number;
  readonly y: number;
  readonly stats: Pick<EffectiveStats, 'radarRange'>;
  readonly islands: readonly Island[];
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

/**
 * Did the bot's beam just sweep this plot's predicted spot and come back
 * empty? True iff the plot is not in sight, was not refreshed THIS tick (a
 * paint folded this tick is the opposite of a miss), its predicted position
 * is inside the bot's radar range with clear island LOS, and the bearing to
 * it lies in this tick's paint window.
 */
export function sweptAndMissed(beam: SweepBeam, site: SweepSite, t: RememberedContact, now: number): boolean {
  if (t.live || t.seenAt === now) return false;
  const p = predictedPos(t, now);
  const dx = p.x - site.x;
  const dy = p.y - site.y;
  if (Math.hypot(dx, dy) > site.stats.radarRange) return false;
  if (lineBlocked({ x: site.x, y: site.y }, p, site.islands)) return false;
  return beamCrossed(beam, Math.atan2(dy, dx));
}

/**
 * ms — THE SWEEP-MISS GRACE: two sim ticks (~9° of beam travel at the base
 * rate). A hull paints when the beam crosses its REAL bearing, and that can
 * trail the plot's PREDICTED bearing by a tick or two — a 20 u prediction
 * error is ~2.3° at 500 u (~4.6° at 250 u) against a beam moving 4.5° a tick.
 * Dropping on the tick of the miss would delete the plot one tick before its
 * own paint arrived, and that paint would then open a FRESH plot: reaction
 * gate, persistence, target key and course all lost. The grace lets the real
 * paint land on the plot it belongs to (orchestrator ruling, cycle 165).
 */
export const SWEEP_MISS_GRACE_MS = 2 * CONFIG.tick.simDtMs;

/**
 * The sweep-miss pass. A plot the beam swept clean this tick is MARKED
 * (`missSweptAt`); a marked plot still unrefreshed once the grace has run is
 * deleted. A refresh clears the mark at the writer (utility.ts writeTrack /
 * foldHitCall), so `seenAt < missSweptAt` here is a belt-and-braces check.
 * Map deletion during iteration is safe and keeps the survivors' order.
 */
export function settleSweptMisses(tracks: TrackMap, beam: SweepBeam, site: SweepSite, now: number): void {
  for (const [key, t] of tracks) {
    if (t.missSweptAt >= 0) {
      const stale = t.seenAt < t.missSweptAt && now - t.missSweptAt >= SWEEP_MISS_GRACE_MS;
      if (stale) tracks.delete(key);
      continue;
    }
    if (sweptAndMissed(beam, site, t, now)) t.missSweptAt = now;
  }
}

/**
 * Re-fit the wake course of every plot that has no disclosed pose and no
 * sighting-sourced estimate. The beam paints a ribbon across several ticks —
 * before or after the hull, by sweep direction — so the fit re-runs every
 * tick while the buffer holds water near the plot. A PAINT measurement is
 * STICKY until the next paint (orchestrator ruling F4, cycle 165): a wake fit
 * never replaces it — not even after a Hit Call has bumped `seenAt`. A paint
 * pair is a measurement of THIS plot; wake cells near it may be anyone's
 * water passing by, and a measured-stationary plot must not be talked into
 * moving by another hull's ribbon.
 */
export function refitWakeCourses(tracks: TrackMap, cells: readonly WakeCell[], now: number): void {
  if (cells.length === 0) return;
  for (const t of tracks.values()) {
    if (t.vSrc === 'sight' || t.vSrc === 'paint' || t.heading !== null) continue;
    const v = fitWakeVelocity(t, cells, now);
    if (v === null) continue;
    t.vx = v.vx;
    t.vy = v.vy;
    t.vAt = now;
    t.vSrc = 'wake';
  }
}
