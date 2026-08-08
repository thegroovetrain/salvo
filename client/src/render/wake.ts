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
// deliberately does NOT disclose wake inside the sight bubble: the `wk` row
// inherits `blipGate`'s ANNULUS (`dist > sightU`), because running in-bubble
// water through the disclosure march would leak a hull that binary LOS is
// hiding behind an island. So the in-bubble half of the scope's wake is
// SYNTHESIZED HERE, from pose the client already holds — exactly as a sighted
// HULL's echo is synthesized from its `Contact` rather than read off the wire
// (amendments 88 + 154: two sources, one appearance). The range terms are
// EXACT COMPLEMENTS: `midpoint dist <= sightU` here, `> sightU` in the server's
// gate, off one dazzle-scaled radius both sides already agree on.
//
// WHAT IT SAMPLES, AND WHY IT IS THE CENTRE. `World.stepWakes` appends
// `ship.state.x/y` — the hull's CENTRE — so this module appends the centre too
// and the two sources land on the same lattice cells at the truesight seam. The
// on-water FOAM is drawn at the stern instead (that is where foam physically
// is); the ribbon is the geometry, the foam is a rendering of it.
//
// AMENDMENT 201 — NO DECOY SPECIAL-CASING, IN EITHER DIRECTION. A decoy is
// frozen at its drop pose, so it never travels one sample cadence and
// `appendWakeSample` stores nothing after its first sample: no segments, no
// foam, no chop, BY CONSTRUCTION. There is deliberately no decoy branch here to
// delete when the decoy rework lands.
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
  eachWakeSegment,
  hullEnvelope,
  pruneWake,
  rasterizeSegmentCoverage,
  type HullId,
  type Vec2,
  type WakeRibbon,
} from '@salvo/shared';
import { FASTEST_HULL_SPEED } from '../config.js';
import { CONTACT_STALE_MS } from './contacts.js';
import { buildWakeStamp, type CellStamp, type WakeSegmentCover } from './radarField.js';
import type { ReturnModelOpts } from './radarHeatmap.js';

/** One visible hull, as the wake layer needs it: pose, class and the tint its
 *  foam carries. `maxSpeedU` provisions the ring buffer — pass the source's
 *  TRUE attainable top speed when it is known (own ship: `kinematics.maxSpeed +
 *  boost.speedBonus`, mirroring `World.wakeTopSpeed`); omitted, the class
 *  envelope is used and a boosted hull loses a little tail early, which is the
 *  shared model's documented graceful degradation. */
export interface WakeHull {
  id: string;
  x: number;
  y: number;
  heading: number;
  speed: number;
  cls: HullId;
  /** Foam tint — the source's personal hue (Story 1.12's rule, now per hull). */
  color: number;
  maxSpeedU?: number;
}

/** One tracked source's live state. The ribbon is the shared model's; nothing
 *  else here is geometry. */
export interface WakeSource {
  readonly id: string;
  readonly cls: HullId;
  color: number;
  readonly ribbon: WakeRibbon;
  /** Server time (ms) this source was last observed — the liveness clock, and
   *  the chain guard (see `chainable`). */
  seenMs: number;
  /** Provisioned top speed (u/s), kept so a re-observation can check whether
   *  the hull could physically have travelled the gap. */
  topSpeedU: number;
}

/** A source's provisioned top speed: the caller's if it gave one, else the
 *  class envelope's. */
function topSpeedOf(h: WakeHull): number {
  const given = h.maxSpeedU;
  if (typeof given === 'number' && Number.isFinite(given) && given > 0) return given;
  return hullEnvelope(h.cls).kinematics.maxSpeed;
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
  const reach = (src.topSpeedU * elapsed) / 1000 + CONFIG.vision.wakeSampleU;
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
    const stored = appendWakeSample(src.ribbon, h.x, h.y, nowMs);
    if (stored) this.ver += 1;
    return stored;
  }

  /** The tracked source for this hull, resetting it when the class changed or
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
      ribbon: createShipWake(h.cls, top),
      seenMs: nowMs,
      topSpeedU: top,
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
 * are equal quarters of `wakeLifeMs` (`WAKE_AGE_BUCKETS`, wave 1). One bucket
 * width is therefore the coarsest cadence that cannot show a stale intensity,
 * and anything finer would be rebuilding for an answer that has not moved.
 */
export const WAKE_STAMP_REBUILD_MS = CONFIG.vision.wakeLifeMs / WAKE_AGE_BUCKETS;

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
 * beam happens to arrive — and the fastest hull in the game takes
 * `radarCellU / maxSpeed` to travel ONE LATTICE CELL. Refusing to rebuild more
 * often than that is therefore refusing to rebuild for a difference the lattice
 * cannot represent, which is amendment 124's standing rule ("no finer resolution
 * than the presentation consumes") applied to time instead of to the wire.
 */
export const WAKE_STAMP_MIN_MS = (CONFIG.vision.radarCellU / FASTEST_HULL_SPEED) * 1000;

/**
 * THE IN-BUBBLE WAKE STAMP, cached.
 *
 * A rebuild walks every live segment of every tracked source, rasterizes the
 * in-bubble ones onto the shared lattice and lays chop around them — which is
 * real work, and doing it on all sixty frames of a second would spend the
 * radar layer's entire remaining headroom on an answer that changes a few times
 * a second. So it rebuilds on the three things that can actually change it:
 *
 *  • THE SEGMENT SET (`sources.version`) — a sample stored, a tail pruned.
 *  • THE OBSERVER moving one sample cadence, which is what moves the truesight
 *    complement's boundary across a segment.
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
  ): CellStamp {
    if (!this.stale(sources.version, own, nowMs)) return this.stamp;
    this.key = sources.version;
    this.ox = own.x;
    this.oy = own.y;
    this.builtMs = nowMs;
    this.stamp = buildTruesightWakeStamp(sources, own, sightU, nowMs, cellU, model);
    return this.stamp;
  }

  private stale(version: number, own: Vec2, nowMs: number): boolean {
    const age = nowMs - this.builtMs;
    // THE FLOOR WINS OVER EVERY OTHER REASON TO REBUILD (see WAKE_STAMP_MIN_MS):
    // under it, no input can have moved by more than the lattice can express.
    if (age >= 0 && age < WAKE_STAMP_MIN_MS) return false;
    if (version !== this.key) return true;
    if (!(age < WAKE_STAMP_REBUILD_MS)) return true;
    const dx = own.x - this.ox;
    const dy = own.y - this.oy;
    const step = CONFIG.vision.wakeSampleU;
    return !(dx * dx + dy * dy < step * step);
  }
}

/**
 * Collect the IN-BUBBLE segments of every tracked source and stamp them.
 *
 * THE GATE IS PER SEGMENT AND IT IS THE SERVER'S COMPLEMENT. `blipGate`'s
 * annulus keeps a segment whose MIDPOINT is beyond `sightU`; this keeps exactly
 * the ones at or inside it, off the same midpoint the shared model already
 * computes. A 540u track therefore hands its near end to the client and its far
 * end to the wire, and no cell is claimed twice or dropped between them.
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
): CellStamp {
  const segs: WakeSegmentCover[] = [];
  const reach = sightU * sightU;
  sources.each((src) => {
    eachWakeSegment(src.ribbon, nowMs, (s) => {
      const dx = s.mx - own.x;
      const dy = s.my - own.y;
      if (dx * dx + dy * dy > reach) return;
      segs.push({
        cov: rasterizeSegmentCoverage(s.ax, s.ay, s.bx, s.by, src.ribbon.widthU, cellU),
        a: s.bucket,
      });
    });
  });
  return buildWakeStamp(segs, model, 0);
}
