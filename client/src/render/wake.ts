// THE CLIENT'S WAKE SOURCES (Story 4.12, wave 3) — the one place the client
// keeps "which water has this hull disturbed", and the two RENDERINGS of it.
//
// AMENDMENT 204: THERE IS EXACTLY ONE WAKE AND IT HAS EXACTLY ONE LENGTH. The
// on-water foam and the radar ribbon are two renderings of ONE geometry, never
// two objects with two lifetimes — so this module holds no wake model of its
// own. It keeps a `WakeRibbon` per source (the SHARED model, `shared/src/sim/
// wake.ts`, the same one the server samples) and hands it to both consumers:
// `render/effects.ts` draws foam and displaced water on the water, and
// `render/radar.ts` stamps it onto the radar lattice. A second ribbon model
// anywhere would be a desync surface, which is why there is not one here.
//
// WHY THE CLIENT KEEPS RIBBONS AT ALL — THE SEAM WAVE 2 LEFT OPEN. The server
// deliberately does NOT disclose wake inside a SOURCE-DEPENDENT inner bound:
// the `wk` row's gate takes `blipGate`'s ANNULUS for a SHIP's water
// (`dist > sightU`) and the 3/8 DETECT radius for a TORPEDO's (cycle-69 review
// gate P2), because running water inside those radii through the disclosure
// march would leak a source that BINARY island LOS is hiding. So the inner
// half of the scope's wake is SYNTHESIZED HERE, from pose the client already
// holds — exactly as a sighted HULL's echo is synthesized from its `Contact`
// rather than read off the wire (amendments 88 + 154: two sources, one
// appearance). The range terms are EXACT COMPLEMENTS, per source:
// `midpoint dist <= innerBoundU(src)` here, `>` it in the server's
// `wakeInnerBound`, off radii both sides already agree on.
//
// AND THE SYNTHESIS CARRIES THE SERVER'S REASON WITH IT (cycle-69 review gate,
// P5). The exclusion exists because the height-aware shadow march must never
// reveal water that BINARY LOS hides, so this module applies binary LOS itself
// — per segment — and only synthesizes for a source it is OBSERVING RIGHT NOW.
// The distinction is REMEMBER vs REVEAL: a ribbon and its foam are kept
// (water you watched being laid is yours, amendment 200) and paints already on
// the phosphor keep fading on their own clock (amendment 83), but the moment
// the hull stops being observed the scope stops MAKING new paints from it.
//
// WHAT IT SAMPLES, AND WHY IT IS THE CENTRE. `World.sampleWakes` appends
// `ship.state.x/y` — the hull's CENTRE — so this module appends the centre too
// and the two sources land on the same lattice cells at the truesight seam. The
// on-water FOAM is drawn at the stern instead (that is where foam physically
// is); the ribbon is the geometry, the foam is a rendering of it.
//
// AMENDMENT 201 — NO BUOY SPECIAL-CASING, IN EITHER DIRECTION. A radar buoy is
// anchored at its drop point (as the decoy this rule was written for was), so it
// never travels one sample cadence and `appendWakeSample` stores nothing after
// its first sample: no segments, no foam, no chop, BY CONSTRUCTION. There is
// deliberately no buoy branch here to delete.
//
// AMENDMENT 83 — a paint is a historical record. Nothing in this module is read
// back into a paint after the fact: `WakeStampCache` hands the radar a stamp,
// the radar freezes samples out of it at slice creation, and a later ribbon
// mutation cannot reach a slice that already exists.

import {
  CONFIG,
  WAKE_AGE_BUCKETS,
  appendWakeSample,
  createShipWake,
  createTorpWake,
  eachWakeSegment,
  hullEnvelope,
  islandBlocksSegment,
  paintSegmentCoverage,
  pruneWake,
  type HullId,
  type Island,
  type Vec2,
  type WakeRibbon,
} from '@salvo/shared';
import { FASTEST_HULL_SPEED } from '../config.js';
import { CONTACT_STALE_MS } from './contacts.js';
import { buildWakeStamp, type CellStamp, type WakeSegmentCover } from './radarField.js';
import type { ReturnModelOpts } from './radarHeatmap.js';

/**
 * WHAT KIND OF SOURCE laid this water — a hull class, or the fish.
 *
 * ONE discriminator, not a parallel `torp?: boolean` beside `cls`, because
 * every place that branches on it (ring-buffer provisioning, the foam's stern
 * offset, the disclosure complement) needs exactly one answer and two fields
 * could disagree. It is also the RESET key `sourceFor` already compares, so a
 * shell id that somehow collided with a hull id re-provisions rather than
 * chaining a fish onto a battleship's track.
 */
export type WakeSourceKind = HullId | 'torp';

/** One visible source, as the wake layer needs it: pose, kind and the tint its
 *  foam carries. `maxSpeedU` provisions the ring buffer — pass the source's
 *  TRUE attainable top speed when it is known (own ship: `kinematics.maxSpeed +
 *  boost.speedBonus`, mirroring `World.wakeTopSpeed`); omitted, the class
 *  envelope is used and a boosted hull loses a little tail early, which is the
 *  shared model's documented graceful degradation. A `'torp'` source ignores it
 *  entirely — `createTorpWake` provisions off the fixed `CONFIG.torpedo.speed`,
 *  exactly as `World.sampleTorpWake` does. */
export interface WakeHull {
  id: string;
  x: number;
  y: number;
  heading: number;
  speed: number;
  cls: WakeSourceKind;
  /** Foam tint — the source's personal hue (Story 1.12's rule, now per hull). */
  color: number;
  maxSpeedU?: number;
}

/** One tracked source's live state. The ribbon is the shared model's; nothing
 *  else here is geometry. */
export interface WakeSource {
  readonly id: string;
  readonly cls: WakeSourceKind;
  color: number;
  readonly ribbon: WakeRibbon;
  /** Server time (ms) this source was last observed — the liveness clock, and
   *  the chain guard (see `chainable`). */
  seenMs: number;
  /** Provisioned top speed (u/s), kept so a re-observation can check whether
   *  the hull could physically have travelled the gap. */
  topSpeedU: number;
  /** Was this source being OBSERVED as of the last `prune`? Cached purely so
   *  the observation EDGE can bump `version` (see `prune`) — the predicate
   *  itself is `wakeSourceObserved`, and nothing reads this flag to decide
   *  anything. */
  observed: boolean;
}

/** A source's provisioned top speed: the fish's fixed speed, the caller's if it
 *  gave one, else the class envelope's. */
function topSpeedOf(h: WakeHull): number {
  if (h.cls === 'torp') return CONFIG.torpedo.speed;
  const given = h.maxSpeedU;
  if (typeof given === 'number' && Number.isFinite(given) && given > 0) return given;
  return hullEnvelope(h.cls).kinematics.maxSpeed;
}

/** A fresh ribbon for this source, from the SHARED model's own factories — the
 *  fish's is one cell wide at half life and carries `torp` (the per-source
 *  disclosure bound), a hull's is its class envelope's. */
function ribbonFor(h: WakeHull, topSpeedU: number): WakeRibbon {
  return h.cls === 'torp' ? createTorpWake() : createShipWake(h.cls, topSpeedU);
}

/**
 * HOW STALE AN OBSERVATION MAY BE and still count as "this source is being
 * observed right now" (ms) — the P5 gate's clock.
 *
 * TWO SERVER TICKS, derived rather than picked. The emitter samples every
 * visible source once per rendered frame off the SAME server-clock estimate the
 * stamp reads, so a source observed this frame has `seenMs === nowMs` exactly;
 * the slack exists only to absorb a client rendering slower than the 20Hz sim
 * (down to 10fps) without flickering. It is deliberately FAR tighter than
 * `CONTACT_STALE_MS` (the contact store's own prune clock, `interpDelayMs +
 * 300`): the defect this closes is a hull whose contact has DROPPED still
 * putting new wake on the scope, so the gate must fire before that clock, not
 * with it.
 */
export const WAKE_OBSERVE_GRACE_MS = 2 * CONFIG.tick.simDtMs;

/**
 * IS THIS SOURCE BEING OBSERVED RIGHT NOW? The REVEAL half of the
 * remember-vs-reveal split (cycle-69 review gate, P5).
 *
 * The client synthesizes in-bubble wake as a stand-in for a disclosure the
 * server refuses — and the server refuses it because the height-aware shadow
 * march must never reveal water that binary island LOS is hiding. A hull that
 * slips behind an island while still inside `sightU` stops being a `Contact`
 * (truesight is binary-LOS gated) and therefore stops being observed, so this
 * predicate is exactly the client-side spelling of the server's reason.
 *
 * It gates the STAMP only. The ribbon, its foam and any phosphor already lit
 * are untouched: water you watched being laid stays remembered (amendment 200),
 * and a paint already made is a historical record (amendment 83).
 */
export function wakeSourceObserved(src: WakeSource, nowMs: number): boolean {
  const age = nowMs - src.seenMs;
  return age >= 0 && age <= WAKE_OBSERVE_GRACE_MS;
}

/**
 * MAY THIS OBSERVATION CHAIN ONTO THE STORED RIBBON, or must the ribbon start
 * over?
 *
 * Two ways it may not, and both are "the client did not watch this water being
 * made":
 *
 *  • THE HULL WAS NOT BEING OBSERVED. `CONTACT_STALE_MS` is the contact store's
 *    OWN liveness clock (a buffer unseen for that long is pruned and its view
 *    faded out), so reusing it means the wake and the hull agree on when a
 *    contact stopped existing — one clock, not a second one to drift.
 *  • THE HULL COULD NOT HAVE GOT THERE. A respawn teleports; so does a
 *    reconnect. `topSpeedU × elapsed` is the furthest the source could
 *    legitimately have travelled, plus one sample cadence of interpolation
 *    slop, and anything past that is a jump rather than a track. Chaining
 *    across it would draw a straight line of water that was never disturbed —
 *    on the water AND on the scope.
 *
 * Both fail toward RESET, which loses tail rather than inventing track.
 *
 * THE TWO CLOCKS ARE DELIBERATELY DIFFERENT (cycle-69 review gate, P9). The
 * liveness clause runs on `seenMs` — every frame the source was OBSERVED,
 * corrupt frames included, because a bad frame is still an observation. The
 * travel clause runs on the LAST STORED SAMPLE's own timestamp, because that is
 * the sample the distance below is measured FROM: measuring the distance from
 * one clock and the elapsed time from another is what let a burst of non-finite
 * frames (which `appendWakeSample` drops, advancing `seenMs` but not the
 * ribbon) shrink `elapsed` toward zero while the gap grew — so the next good
 * frame tripped the impossible-travel test and destroyed the ribbon the guard
 * above exists to protect.
 */
function chainable(src: WakeSource, h: WakeHull, nowMs: number): boolean {
  // A NON-FINITE POSE IS NOT A JUMP, IT IS A BAD FRAME. `appendWakeSample`
  // already drops it and the ribbon closes across it (the next good sample
  // chains to the previous good one, wave 1's finiteness discipline). Letting
  // the impossible-travel test below see a NaN would answer "not chainable" and
  // throw the whole ribbon away over one corrupt frame — the cycle-68 lesson
  // (amendment 193) in this module's own currency: degrade, never destroy.
  if (!Number.isFinite(h.x + h.y)) return true;
  const elapsed = nowMs - src.seenMs;
  if (!(elapsed >= 0) || elapsed > CONTACT_STALE_MS) return false;
  if (src.ribbon.count === 0) return true;
  const last = (src.ribbon.head + src.ribbon.count - 1) % src.ribbon.cap;
  const dx = h.x - src.ribbon.xs[last];
  const dy = h.y - src.ribbon.ys[last];
  // Elapsed since THAT sample, not since the last frame (see the doc above). A
  // non-finite stored timestamp degrades to 0, which is the strictest reading
  // and can only reset.
  // Elapsed since THAT sample, not since the last frame (see the doc above). A
  // non-finite stored timestamp degrades to 0, which is the strictest reading
  // and can only reset.
  const since = nowMs - src.ribbon.ts[last];
  const travelMs = Number.isFinite(since) && since > 0 ? since : 0;
  const reach = (src.topSpeedU * travelMs) / 1000 + CONFIG.vision.wakeSampleU;
  return dx * dx + dy * dy <= reach * reach;
}

/**
 * Every hull the client can see, and the water each has disturbed.
 *
 * `version` is the invalidation handle the radar's stamp cache keys on: it
 * ticks whenever the SEGMENT SET changes (a sample stored, a tail pruned, a
 * source dropped or reset) and never merely because a hull moved. That is what
 * makes an in-bubble stamp rebuild cost a fraction of a frame instead of one
 * per frame.
 */
export class WakeSources {
  private readonly srcs = new Map<string, WakeSource>();
  private ver = 0;

  get version(): number {
    return this.ver;
  }

  get size(): number {
    return this.srcs.size;
  }

  get(id: string): WakeSource | undefined {
    return this.srcs.get(id);
  }

  /**
   * Record this frame's pose for one visible hull. Returns TRUE iff the shared
   * model actually STORED a sample — i.e. the source has travelled one full
   * `CONFIG.vision.wakeSampleU` since the last one — which is the on-water
   * emitter's spawn edge. One cadence, one wake.
   */
  observe(h: WakeHull, nowMs: number): boolean {
    const src = this.sourceFor(h, nowMs);
    src.color = h.color;
    src.seenMs = nowMs;
    // The OBSERVATION EDGE is part of the segment-set version (P5): a source
    // that just became observable changes what the in-bubble stamp says, and
    // the cache keys on `version` alone.
    if (!src.observed) {
      src.observed = true;
      this.ver += 1;
    }
    const stored = appendWakeSample(src.ribbon, h.x, h.y, nowMs);
    if (stored) this.ver += 1;
    return stored;
  }

  /** The tracked source for this hull, resetting it when the kind changed or
   *  the observation cannot chain (`chainable`). */
  private sourceFor(h: WakeHull, nowMs: number): WakeSource {
    const found = this.srcs.get(h.id);
    if (found !== undefined && found.cls === h.cls && chainable(found, h, nowMs)) return found;
    if (found !== undefined) this.ver += 1;
    const top = topSpeedOf(h);
    const fresh: WakeSource = {
      id: h.id,
      cls: h.cls,
      color: h.color,
      ribbon: ribbonFor(h, top),
      seenMs: nowMs,
      topSpeedU: top,
      observed: false,
    };
    this.srcs.set(h.id, fresh);
    return fresh;
  }

  /**
   * Age every ribbon's tail out and release sources whose water is entirely
   * gone (amendment 200: a wake outlives its hull UNTIL its water ages out, not
   * forever — a hull that sails out of truesight, or sinks, leaves a fading
   * track behind it exactly as the server's orphan ribbons do).
   *
   * A source still being observed is never released, however empty: a stopped
   * hull's ribbon empties and refills as it gets under way again.
   */
  prune(nowMs: number): void {
    for (const [id, src] of this.srcs) {
      const before = src.ribbon.count;
      const live = pruneWake(src.ribbon, nowMs);
      if (live !== before) this.ver += 1;
      // THE OTHER HALF OF THE OBSERVATION EDGE (P5): a source that has just
      // STOPPED being observed changes what the in-bubble stamp says exactly as
      // one that started, so it must move `version` or the cache would go on
      // handing out a stamp that reveals water the hull is no longer earning.
      const observed = wakeSourceObserved(src, nowMs);
      if (observed !== src.observed) {
        src.observed = observed;
        this.ver += 1;
      }
      if (live > 0) continue;
      if (nowMs - src.seenMs <= CONTACT_STALE_MS) continue;
      this.srcs.delete(id);
      this.ver += 1;
    }
  }

  /** Walk the live sources. */
  each(fn: (src: WakeSource) => void): void {
    for (const src of this.srcs.values()) fn(src);
  }

  /** Drop everything (return to port, spectate entry — no hull, no history). */
  clear(): void {
    if (this.srcs.size === 0) return;
    this.srcs.clear();
    this.ver += 1;
  }
}

/**
 * HOW OFTEN A STATIONARY SCOPE REBUILDS ITS IN-BUBBLE WAKE STAMP (ms).
 *
 * DERIVED, not tuned: with nothing moving, the only thing that can change what
 * the stamp says is a segment crossing an AGE-BUCKET boundary, and the buckets
 * are equal quarters of `wakeLifeMs` (`WAKE_AGE_BUCKETS`, wave 1). Rebuilding
 * finer than one bucket width would be rebuilding for an answer that has not
 * moved, which is amendment 124's rule ("no finer resolution than the
 * presentation consumes") applied to time.
 *
 * WHAT IT GUARANTEES, STATED HONESTLY (cycle-69 review gate, P8): the intensity
 * a cached stamp shows is AT MOST ONE BUCKET STALE, not never-stale. A segment
 * crossing a bucket boundary one millisecond after a rebuild keeps its previous
 * bucket for the rest of the interval. That is deliberate and has no gameplay
 * consequence — a bucket is a quarter of the water's whole life and the
 * intensity step between neighbouring buckets is a fraction of one band — but
 * the earlier claim that this cadence "cannot show a stale intensity" was
 * simply false, and a false comment is how the next agent tightens the wrong
 * knob.
 */
export const WAKE_STAMP_REBUILD_MS = CONFIG.vision.wakeLifeMs / WAKE_AGE_BUCKETS;

/**
 * AN UPPER BOUND ON HOW FAST ANY WAKE SOURCE CAN TRAVEL (u/s) — every kind of
 * source, at its true attainable top speed.
 *
 * `FASTEST_HULL_SPEED` alone is the wrong number for a bound that has to hold
 * at every instant of a match, and it was wrong TWICE over: it is the
 * base-kinematics maximum, so it misses the boost bonus (a boosted Torpedo Boat
 * runs 45 + 10 = 55 u/s), and since the torpedo became a wake source in its own
 * right it misses the fish entirely (a fixed 60 u/s). Every other derivation in
 * this cycle already uses the true attainable figure (`World.wakeTopSpeed`,
 * `wakeHulls`' own-ship `maxSpeedU`), so this is the one place that was left
 * behind — and the floor below CITED the guarantee it was failing to deliver.
 *
 * It is an upper bound rather than an exact maximum: no hull exceeds the
 * fastest envelope and boost adds at most `speedBonus`, so the sum can only
 * over-state (drones cannot boost). Over-stating shortens the floor, which
 * fails toward correctness.
 */
export const FASTEST_AFLOAT_SPEED = Math.max(
  FASTEST_HULL_SPEED + CONFIG.speedBoost.speedBonus,
  CONFIG.torpedo.speed,
);

/**
 * THE FLOOR ON HOW OFTEN A BUSY SCOPE MAY REBUILD (ms) — the measurement-driven
 * half of the cache, and the one that keeps a scrum under the 2.5 ms bar.
 *
 * With twenty hulls under way inside one bubble, a source stores a sample every
 * ~0.27s, so `sources.version` moves several times a SECOND per hull and the
 * "segment set changed" test fires on essentially every frame. Measured, that
 * pushed the radar layer from 1.63 ms to 2.19 ms at 0.5× zoom — inside the bar,
 * but spending most of cycle 68's remaining headroom on a rebuild nobody can
 * see.
 *
 * Nobody can see it because THE BEAM ONLY CROSSES A GIVEN BEARING ONCE PER
 * REVOLUTION. A stamp is consumed at slice creation, so all that a staler stamp
 * costs is the ribbon head sitting slightly behind its true position when the
 * beam happens to arrive — and the fastest thing on the water takes
 * `radarCellU / FASTEST_AFLOAT_SPEED` to travel ONE LATTICE CELL. Refusing to
 * rebuild more often than that is therefore refusing to rebuild for a
 * difference the lattice cannot represent, which is amendment 124's standing
 * rule ("no finer resolution than the presentation consumes") applied to time
 * instead of to the wire.
 *
 * THE SPEED IS THE TRUE ATTAINABLE ONE (cycle-69 review gate, P7). It used to
 * be `FASTEST_HULL_SPEED`, the BASE envelope maximum, which made the sentence
 * above false exactly when it mattered: a boosted Torpedo Boat crosses a 9u
 * cell in 164ms and a torpedo in 150ms, both inside the old 200ms floor. See
 * `FASTEST_AFLOAT_SPEED`.
 */
export const WAKE_STAMP_MIN_MS = (CONFIG.vision.radarCellU / FASTEST_AFLOAT_SPEED) * 1000;

/**
 * THE IN-BUBBLE WAKE STAMP, cached.
 *
 * A rebuild walks every live segment of every tracked source, rasterizes the
 * in-bubble ones onto the shared lattice and lays chop around them — which is
 * real work, and doing it on all sixty frames of a second would spend the
 * radar layer's entire remaining headroom on an answer that changes a few times
 * a second. So it rebuilds on the things that can actually change it:
 *
 *  • THE SIGHT RADIUS (`sightU`) — the complement's own boundary. It is a STEP
 *    function of two discrete inputs (`fogHoleRadiusU(sightRange, dazzled)`),
 *    so a dazzle onset/end moves it by a large
 *    fraction all at once and nothing else in this list notices. It was
 *    missing from the key (cycle-69 review gate, P6), which left a stationary
 *    observer double-painting or blanking the sight-delta band for up to a
 *    full rebuild interval; and because it cannot churn frame to frame, it is
 *    checked AHEAD of the rate floor rather than behind it.
 *  • THE SEGMENT SET (`sources.version`) — a sample stored, a tail pruned, a
 *    source starting or STOPPING being observed (the P5 edge).
 *  • THE OBSERVER moving one sample cadence, which is what moves the
 *    complement's boundary across a segment.
 *  • THE GLINT SEED (`seedT`, the sweep revolution index) — a new revolution
 *    re-scintillates every flank, exactly as `buildShipStamp`'s does.
 *  • The bucket clock (`WAKE_STAMP_REBUILD_MS`).
 *
 * A cached stamp is never MUTATED, only replaced, so a slice that froze samples
 * out of it keeps exactly what it froze (amendment 83).
 */
export class WakeStampCache {
  private stamp: CellStamp = new Map();
  private key = -1;
  private ox = NaN;
  private oy = NaN;
  private sight = NaN;
  private seed = NaN;
  private builtMs = -Infinity;

  /** Live cell count of the cached stamp — the measurement seam. */
  get size(): number {
    return this.stamp.size;
  }

  stampFor(
    sources: WakeSources,
    own: Vec2,
    sightU: number,
    nowMs: number,
    cellU: number,
    model: ReturnModelOpts,
    islands: readonly Island[] = [],
    seedT = 0,
  ): CellStamp {
    if (!this.stale(sources.version, own, sightU, nowMs, seedT)) return this.stamp;
    this.key = sources.version;
    this.ox = own.x;
    this.oy = own.y;
    this.sight = sightU;
    this.seed = seedT;
    this.builtMs = nowMs;
    this.stamp = buildTruesightWakeStamp(sources, own, sightU, nowMs, cellU, model, islands, seedT);
    return this.stamp;
  }

  private stale(version: number, own: Vec2, sightU: number, nowMs: number, seedT: number): boolean {
    // AHEAD OF THE FLOOR, and only this one (see the class doc): the sight
    // radius is a step function of dazzle and boons, so it cannot churn — but
    // when it does move it moves far, and holding a stamp built against the old
    // radius for even one floor interval is the double-paint P6 found.
    if (!(sightU === this.sight)) return true;
    const age = nowMs - this.builtMs;
    // THE FLOOR WINS OVER EVERY OTHER REASON TO REBUILD (see WAKE_STAMP_MIN_MS):
    // under it, no input can have moved by more than the lattice can express.
    if (age >= 0 && age < WAKE_STAMP_MIN_MS) return false;
    if (version !== this.key) return true;
    if (!(seedT === this.seed)) return true;
    if (!(age < WAKE_STAMP_REBUILD_MS)) return true;
    const dx = own.x - this.ox;
    const dy = own.y - this.oy;
    const step = CONFIG.vision.wakeSampleU;
    return !(dx * dx + dy * dy < step * step);
  }
}

/**
 * THE INNER DISCLOSURE RADIUS this source's water is the CLIENT's to synthesize
 * inside of — the exact complement of the server's `wakeInnerBound`.
 *
 * A SHIP's water: the sight bubble, because the server's `wk` row inherits
 * `blipGate`'s annulus for it and the client holds full pose inside.
 * A TORPEDO's water: the 3/8 DETECT radius, because the server discloses fish
 * water down to that rung (cycle-69 review gate, P2) and the client only holds
 * a fish's pose inside it (`pointDetected` is where the entity reveals, and
 * `trackCullRadiusSq` culls the local track on the same radius). Synthesizing
 * out to `sightU` for a fish would double-paint the whole (detect, sight] band
 * against the wire.
 */
function innerBoundU(src: WakeSource, sightU: number): number {
  return src.ribbon.torp ? sightU * CONFIG.vision.detectFactor : sightU;
}

/**
 * May this segment be REVEALED to the local scope — the binary-LOS half of the
 * P5 gate.
 *
 * The whole reason the server refuses to disclose water inside these radii is
 * that its height-aware shadow accumulator must never reveal water that BINARY
 * island LOS is hiding (`losClear`, the rule `pointSighted` and `pointDetected`
 * both run). The client stands in for that disclosure, so it owes the same
 * test: `marchRay`'s accumulator alone would let a low island pass water that
 * truesight itself would not.
 */
function segmentRevealable(own: Vec2, mx: number, my: number, islands: readonly Island[]): boolean {
  if (islands.length === 0) return true;
  LOS_SCRATCH.x = mx;
  LOS_SCRATCH.y = my;
  for (const isle of islands) {
    if (islandBlocksSegment(own, LOS_SCRATCH, isle)) return false;
  }
  return true;
}

/** Reused endpoint for `segmentRevealable` (the SEG_SCRATCH pattern): filled
 *  and consumed synchronously, so the per-frame scan allocates nothing. */
const LOS_SCRATCH: Vec2 = { x: 0, y: 0 };

/**
 * THE ONE-PER-REBUILD ISLAND SHORTLIST — the broadphase that keeps the P5 LOS
 * clause affordable.
 *
 * Every segment this stamp considers has its MIDPOINT inside `sightU` of the
 * observer, so the whole observer→midpoint segment lies inside that disc, so
 * only an island whose bounding circle MEETS the disc can possibly block one.
 * Culling once per rebuild stops the clause scaling with the number of islands
 * on the MAP (~18) instead of with the two or three actually alongside.
 *
 * WHAT IT IS NOT: it is not where the rebuild's cost lives. Measured on a full
 * room orbiting inside one bubble, a rebuild costs ~10.5-11.4 ms against the
 * pre-patch sharp path's ~2.0-2.2 ms, and neither this cull nor a
 * per-revolution mask memo moved that materially (the memo recovered ~9% and
 * was dropped rather than carried for it) — the mask PIPELINE is the term. The
 * rate floor amortizes it to ~+0.15 ms/frame, which is why the layer still
 * measures 1.71-1.74 ms at 0.5× zoom against the 2.5 ms bar; the SPIKE is
 * ledgered rather than fixed here.
 *
 * It is a strict SUPERSET filter — it can only remove islands that could not
 * have blocked anything — so it is a cost device and decides nothing, the same
 * standing shape as the server's `mayBeSwept` prefilter.
 */
const NEAR_ISLES: Island[] = [];

function nearIslands(own: Vec2, sightU: number, islands: readonly Island[]): readonly Island[] {
  NEAR_ISLES.length = 0;
  for (const isle of islands) {
    const dx = isle.x - own.x;
    const dy = isle.y - own.y;
    const reach = sightU + isle.r;
    if (dx * dx + dy * dy <= reach * reach) NEAR_ISLES.push(isle);
  }
  return NEAR_ISLES;
}

/**
 * Collect the IN-BOUND segments of every tracked source and stamp them.
 *
 * THE GATE IS PER SEGMENT AND IT IS THE SERVER'S COMPLEMENT. `wakeInnerBound`
 * keeps a segment whose MIDPOINT is beyond the source's inner radius; this
 * keeps exactly the ones at or inside it, off the same midpoint the shared
 * model already computes. A 540u track therefore hands its near end to the
 * client and its far end to the wire, and no cell is claimed twice or dropped
 * between them.
 *
 * TWO MORE CLAUSES, BOTH THE SERVER'S REASON MADE LOCAL (cycle-69 review gate,
 * P5): the source must be OBSERVED RIGHT NOW (`wakeSourceObserved`), and the
 * segment must be BINARY-LOS clear. Neither touches what the client REMEMBERS —
 * the ribbon and its foam age out on their own clock and paints already lit
 * keep fading — they gate only what is newly REVEALED.
 *
 * THE MASK IS THE PAINT PIPELINE'S, NOT THE SHARP RASTERIZER'S (follow-up to
 * P3): `paintSegmentCoverage` applies the same per-paint flank glint the
 * server's `wk` shaper applies, on a `seedT` that is the sweep REVOLUTION
 * INDEX (the `buildShipStamp` idiom). Using the sharp `rasterizeSegmentCoverage`
 * here would leave synthesized water crisp while wire water scintillated —
 * amendment 154's "two sources, one appearance" broken, and the class
 * fingerprint P3 closed re-opened on the in-bubble path.
 *
 * `shadowFloor` is 0 here, unlike the wire path's `wakeLitFloor`: these
 * segments were disclosed by nobody, so the local beam's shadow accumulator may
 * take them all the way dark exactly as it does terrain (amendment 190 protects
 * what the SERVER gated, and this is not that).
 */
export function buildTruesightWakeStamp(
  sources: WakeSources,
  own: Vec2,
  sightU: number,
  nowMs: number,
  cellU: number,
  model: ReturnModelOpts,
  islands: readonly Island[] = [],
  seedT = 0,
): CellStamp {
  const segs: WakeSegmentCover[] = [];
  // ONE island cull for the whole rebuild (see nearIslands): a per-segment walk
  // over every island on the map was measured at 5× the sharp path's cost.
  const near = nearIslands(own, sightU, islands);
  sources.each((src) => {
    if (!wakeSourceObserved(src, nowMs)) return;
    const inner = innerBoundU(src, sightU);
    const reach = inner * inner;
    eachWakeSegment(src.ribbon, nowMs, (s) => {
      const dx = s.mx - own.x;
      const dy = s.my - own.y;
      if (dx * dx + dy * dy > reach) return;
      if (!segmentRevealable(own, s.mx, s.my, near)) return;
      segs.push({
        cov: paintSegmentCoverage(s.ax, s.ay, s.bx, s.by, src.ribbon.widthU, cellU, seedT),
        a: s.bucket,
      });
    });
  });
  return buildWakeStamp(segs, model, 0);
}
