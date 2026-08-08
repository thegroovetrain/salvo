// RADAR WAKES — the ONE wake model (Story 4.12, Eric rulings 2026-08-08,
// amendments 194-196/199-205). A hull (or a running torpedo) leaves a ribbon
// of disturbed water behind it: server-owned world state rasterized onto the
// radar lattice exactly as the hull itself is — amendment 152's
// server-rasterizes-the-hull pipeline extended to a second material (Eric:
// *"like the ships being placed on the raster, wakes should be, as well"*).
//
// This module is the SINGLE implementation both sides call — the server's
// per-tick sampler + per-segment disclosure gate, and the client's on-water
// foam emitter read the same ring buffer through the same functions. A second
// wake model anywhere is a desync (amendment 204: ONE wake, ONE length; the
// on-water render and the radar ribbon are two RENDERINGS of one geometry).
//
// THE MODEL. A source appends POSE SAMPLES on a DISTANCE cadence
// (`CONFIG.vision.wakeSampleU` — a stopped hull lays nothing, no `minSpeed`
// knob needed: a hull barely making way takes so long to cover one cadence
// that the segment behind it has expired before it exists). Consecutive
// samples form SEGMENTS; a segment's water carries the age of its OLDER
// endpoint, and water strictly older than the source's life
// (`CONFIG.vision.wakeLifeMs`, × `wakeTorpLifeFactor` for a torpedo) is gone
// — so the tail expires sample by sample and the visible track SHORTENS as it
// ages, which is amendment 203's structural recency channel. A wake OUTLIVES
// its ship (amendment 200): the ribbon is water, not a ship property — the
// owner keeps a dead source's ribbon alive until `pruneWake` empties it.
//
// STORAGE IS A RING BUFFER WITH A DERIVED CAPACITY (`wakeCapacity`): the most
// samples a source can have alive at once is `life × maxSpeed ÷ cadence`,
// never a literal — retuning the clock or the cadence resizes the store with
// it. Overflow degrades gracefully (the oldest — most-nearly-expired — sample
// is overwritten), so a caller that under-provisions `maxSpeedU` (say, a
// transient boost) loses a few seconds of tail early rather than erring.
//
// FINITENESS DISCIPLINE, the cycle-68 lesson (amendment 193: one non-finite
// pose would otherwise have blanked the whole radar layer): every externally
// supplied scalar is finite-checked. A non-finite sample is DROPPED at append
// and the ribbon CLOSES ACROSS IT — the next good sample chains to the
// previous good one — and the per-tick segment scan re-checks stored samples
// so even a corrupted buffer degrades (skip + close across) instead of
// throwing. Nothing in this module throws on any input.
//
// PURE, ZERO I/O, no transcendentals (only comparisons, floor and multiply on
// the hot path — the cadence test compares SQUARED distances).

import { CONFIG, hullEnvelope, type HullId } from '../constants.js';

/**
 * WATER-AGE BUCKET COUNT — the resolution of the `wk` wire event's `a` field
 * and of the client's age→intensity lookup. Both read THIS constant; the wire
 * may carry no finer resolution than the presentation actually consumes
 * (Story 4.9's standing rule, amendment 124).
 *
 * FOUR, because the presentation consumes age as an intensity multiplier
 * whose only visible consequence is WHERE the tail crosses `bands[0].at` and
 * drops off the scope (amendment 203 — length is the recency channel; there
 * is no brightness ramp, so age never renders as a gradient the eye can read
 * finely). Quarter-life steps are the coarsest quantization that still walks
 * the tail off smoothly — the freshest three quarters read, the last quarter
 * frays — and anything finer would be resolution the display never shows.
 */
export const WAKE_AGE_BUCKETS = 4;

/**
 * One source's wake: a ring buffer of pose samples plus the two per-source
 * scalars the model needs (its water's life and its turbulent-core width).
 * Plain object + typed arrays; mutated only through the functions below.
 */
export interface WakeRibbon {
  /** Sample x coordinates (u), ring storage. */
  xs: Float64Array;
  /** Sample y coordinates (u), ring storage. */
  ys: Float64Array;
  /** Sample server times (ms), ring storage — non-decreasing in ring order. */
  ts: Float64Array;
  /** Ring capacity — DERIVED via `wakeCapacity`, never a literal. */
  cap: number;
  /** Ring index of the OLDEST live sample. */
  head: number;
  /** Number of live samples. */
  count: number;
  /** This source's water-dissipation clock (ms) — `CONFIG.vision.wakeLifeMs`
   *  for a hull, × `wakeTorpLifeFactor` for a torpedo. */
  lifeMs: number;
  /** Turbulent-core width (u) — the hull's own beam, or one radar cell for a
   *  torpedo. Consumed by `rasterizeSegmentCoverage`; carried here so the
   *  width travels with the ribbon and is derived exactly once. */
  widthU: number;
}

/**
 * The DERIVED ring capacity: the most samples that can be simultaneously
 * alive is `(lifeMs/1000) × maxSpeedU ÷ wakeSampleU` (a source at top speed
 * lays one sample per cadence and each lives `lifeMs`), rounded up, plus a
 * two-sample margin — one for the fencepost (a track of N cadence intervals
 * holds N+1 samples) and one for the just-appended head whose predecessor
 * has not yet expired. Never a literal (spec task 2): retuning the clock,
 * the cadence, or a hull's speed resizes the store with it.
 *
 * Degenerate inputs (non-finite or non-positive speed/life) yield the
 * 2-sample floor — a ribbon that can hold one segment, never a zero-length
 * or NaN-length allocation.
 */
export function wakeCapacity(maxSpeedU: number, lifeMs: number): number {
  const speed = Number.isFinite(maxSpeedU) && maxSpeedU > 0 ? maxSpeedU : 0;
  const life = Number.isFinite(lifeMs) && lifeMs > 0 ? lifeMs : 0;
  return Math.ceil(((life / 1000) * speed) / CONFIG.vision.wakeSampleU) + 2;
}

/**
 * A fresh, empty ribbon for a source with the given top speed, water life and
 * core width. `maxSpeedU` should be the source's true attainable top speed
 * (include boost headroom if the caller has it); under-provisioning degrades
 * gracefully — see the module doc. A non-finite `lifeMs` degrades to 0
 * (everything instantly expired), a non-finite `widthU` to 0 (spine-only,
 * one-cell ribbon) — degrade, never throw.
 */
export function createWakeRibbon(maxSpeedU: number, lifeMs: number, widthU: number): WakeRibbon {
  const cap = wakeCapacity(maxSpeedU, lifeMs);
  return {
    xs: new Float64Array(cap),
    ys: new Float64Array(cap),
    ts: new Float64Array(cap),
    cap,
    head: 0,
    count: 0,
    lifeMs: Number.isFinite(lifeMs) && lifeMs > 0 ? lifeMs : 0,
    widthU: Number.isFinite(widthU) && widthU > 0 ? widthU : 0,
  };
}

/** A ship-class (or drone) wake's turbulent-core width: the hull's own beam
 *  (amendment 205's "the turbulent core runs at roughly the hull's beam") —
 *  9/32/20u for the three captain classes → 1-4 lattice cells. DERIVED from
 *  the source, never a constant. */
export function shipWakeWidthU(cls: HullId): number {
  return hullEnvelope(cls).hull.beam;
}

/** A torpedo wake's core width: exactly ONE radar cell (amendment 196 — a
 *  thin ribbon, findable if you are watching that stretch of water). */
export function torpWakeWidthU(): number {
  return CONFIG.vision.radarCellU;
}

/** A torpedo wake's water life: roughly half a ship's (amendment 196) — the
 *  ONE place the `wakeLifeMs × wakeTorpLifeFactor` derivation lives. 6s at
 *  the fixed 60 u/s torpedo speed ≈ 360u of ribbon. */
export function torpWakeLifeMs(): number {
  return CONFIG.vision.wakeLifeMs * CONFIG.vision.wakeTorpLifeFactor;
}

/** Convenience: a hull source's ribbon (life = `CONFIG.vision.wakeLifeMs`,
 *  width = its own beam). `maxSpeedU` is the caller's — pass the effective
 *  top speed, boost included, if known. */
export function createShipWake(cls: HullId, maxSpeedU: number): WakeRibbon {
  return createWakeRibbon(maxSpeedU, CONFIG.vision.wakeLifeMs, shipWakeWidthU(cls));
}

/** Convenience: a torpedo source's ribbon (fixed `CONFIG.torpedo.speed`,
 *  half-life water, one-cell core). */
export function createTorpWake(): WakeRibbon {
  return createWakeRibbon(CONFIG.torpedo.speed, torpWakeLifeMs(), torpWakeWidthU());
}

/**
 * Record the source's pose, on the distance cadence: the sample is stored
 * only when the source has travelled at least `CONFIG.vision.wakeSampleU`
 * since the last stored sample (squared-distance compare — no sqrt). A
 * non-finite x/y/t is DROPPED and the ribbon closes across it (the next good
 * sample chains to the previous good one) — never a throw, never a poisoned
 * buffer. When the ring is full the oldest sample is overwritten.
 *
 * Returns true iff the sample was stored (diagnostic; callers need not care).
 */
export function appendWakeSample(r: WakeRibbon, x: number, y: number, t: number): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(t)) return false;
  if (r.count > 0) {
    const last = (r.head + r.count - 1) % r.cap;
    const dx = x - r.xs[last];
    const dy = y - r.ys[last];
    const step = CONFIG.vision.wakeSampleU;
    if (dx * dx + dy * dy < step * step) return false;
  }
  const slot = (r.head + r.count) % r.cap;
  r.xs[slot] = x;
  r.ys[slot] = y;
  r.ts[slot] = t;
  if (r.count < r.cap) r.count += 1;
  else r.head = (r.head + 1) % r.cap;
  return true;
}

/**
 * Drop expired water off the tail: while the oldest sample's water is
 * strictly older than the ribbon's life (or the stored sample is somehow
 * non-finite), advance the head. Returns the live sample count — 0 means the
 * ribbon is spent, which is the signal the server uses to release a dead
 * source's wake (amendment 200: a wake outlives its ship UNTIL its water
 * ages out, not forever). Safe because ring order is time order: the oldest
 * sample always bounds the oldest segment.
 */
export function pruneWake(r: WakeRibbon, now: number): number {
  if (!Number.isFinite(now)) return r.count;
  while (r.count > 0) {
    const t = r.ts[r.head];
    if (Number.isFinite(t) && now - t <= r.lifeMs) break;
    r.head = (r.head + 1) % r.cap;
    r.count -= 1;
  }
  return r.count;
}

/**
 * One ribbon segment — a pair of consecutive stored samples, older→newer.
 * `ageMs` is the age of the segment's WATER at the caller's `now`: the OLDER
 * endpoint's, so a segment expires exactly when its oldest water does and
 * the tail shortens sample by sample (amendment 203). `bucket` is the
 * quantized age the wire carries (`wakeAgeBucket`).
 */
export interface WakeSegment {
  /** Older endpoint (u). */
  ax: number;
  ay: number;
  /** Newer endpoint (u). */
  bx: number;
  by: number;
  /** Midpoint (u) — the per-segment gate's test point. */
  mx: number;
  my: number;
  /** Age of this segment's water (ms, ≥ 0). */
  ageMs: number;
  /** Quantized water-age bucket, 0..WAKE_AGE_BUCKETS-1. */
  bucket: number;
}

/** Scratch segment for `eachWakeSegment` — handed to the callback and reused
 *  across calls (the POSE_SCRATCH pattern): consume it synchronously, copy
 *  what you keep. */
const SEG_SCRATCH: WakeSegment = { ax: 0, ay: 0, bx: 0, by: 0, mx: 0, my: 0, ageMs: 0, bucket: 0 };

/** True iff the stored sample at ring index `i` is wholly finite. Append
 *  guarantees this; the scan re-checks anyway (amendment 193's lesson — the
 *  per-tick scan must survive a corrupted buffer). */
function finiteSample(r: WakeRibbon, i: number): boolean {
  return Number.isFinite(r.xs[i]) && Number.isFinite(r.ys[i]) && Number.isFinite(r.ts[i]);
}

/** Build the scratch segment for samples a (older) → b (newer) and hand it to
 *  the callback — unless its water has expired (strictly older than life). */
function emitSegment(r: WakeRibbon, a: number, b: number, now: number, fn: (seg: WakeSegment) => void): void {
  const age = now - r.ts[a];
  if (age > r.lifeMs) return;
  const s = SEG_SCRATCH;
  s.ax = r.xs[a];
  s.ay = r.ys[a];
  s.bx = r.xs[b];
  s.by = r.ys[b];
  s.mx = (s.ax + s.bx) / 2;
  s.my = (s.ay + s.by) / 2;
  s.ageMs = age < 0 ? 0 : age;
  s.bucket = wakeAgeBucket(s.ageMs, r.lifeMs);
  fn(s);
}

/**
 * Walk the ribbon's LIVE segments oldest→newest, invoking `fn` once per
 * segment with the reused scratch (copy what you keep). A non-finite stored
 * sample is skipped and the ribbon closes across it — its neighbours chain
 * directly; expired segments are skipped. Never throws; a non-finite `now`
 * or a sub-2-sample ribbon walks nothing.
 */
export function eachWakeSegment(r: WakeRibbon, now: number, fn: (seg: WakeSegment) => void): void {
  if (!Number.isFinite(now) || r.count < 2) return;
  let prev = -1;
  for (let n = 0; n < r.count; n++) {
    const i = (r.head + n) % r.cap;
    if (!finiteSample(r, i)) continue;
    if (prev >= 0) emitSegment(r, prev, i, now, fn);
    prev = i;
  }
}

/**
 * Quantize a water age into the wire's bucket, 0 (freshest quarter of life)
 * .. WAKE_AGE_BUCKETS-1 (the last). Buckets are equal fractions of the
 * source's OWN life, so a torpedo's 6s ribbon and a hull's 12s ribbon read
 * the same scale. Boundary rule: bucket b covers [b, b+1) × life/N, so age
 * exactly at a boundary lands in the OLDER bucket; age at or past life
 * clamps to the last bucket (callers never emit expired water — the clamp is
 * for the degenerate float dust at exactly `life`). Non-finite or degenerate
 * inputs answer the last bucket (oldest — fail toward "about to be gone"),
 * a negative age the first.
 */
export function wakeAgeBucket(ageMs: number, lifeMs: number): number {
  if (!Number.isFinite(ageMs) || !Number.isFinite(lifeMs) || lifeMs <= 0) return WAKE_AGE_BUCKETS - 1;
  const b = Math.floor((ageMs / lifeMs) * WAKE_AGE_BUCKETS);
  if (b < 0) return 0;
  return b >= WAKE_AGE_BUCKETS ? WAKE_AGE_BUCKETS - 1 : b;
}
