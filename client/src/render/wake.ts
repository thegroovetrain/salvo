// THE CLIENT'S WAKE SOURCES (Story 4.12, wave 3) — the one place the client
// keeps "which water has this hull disturbed", for the ON-WATER rendering.
//
// AMENDMENT 204: THERE IS EXACTLY ONE WAKE AND IT HAS EXACTLY ONE LENGTH. The
// on-water foam and the radar ribbon are two renderings of ONE geometry, never
// two objects with two lifetimes — so this module holds no wake model of its
// own. It keeps a `WakeRibbon` per source (the SHARED model, `shared/src/sim/
// wake.ts`, the same one the server samples), and `render/effects.ts` draws foam
// and displaced water on the water from it. A second ribbon model anywhere would
// be a desync surface, which is why there is not one here.
//
// THE RADAR NO LONGER READS THESE RIBBONS (epic-9 amendment 210, Eric
// 2026-10-21: "The client should never be calculating a ship's radar shadow for
// any reason."). The server now discloses EVERY wake segment its beam crosses —
// inside the sight bubble and the detect rung included — so the scope paints
// wire `wk` rows only. (History: until amendment 210 the server withheld wake
// inside a per-source inner bound and this module synthesized that half into
// the radar field — amendments 88 + 154, "two sources, one appearance" — behind
// a binary-LOS and observed-right-now gate, cycle-69 review gate P5. All of that
// is retired.)
//
// WHAT IT SAMPLES, AND WHY IT IS THE CENTRE. `World.sampleWakes` appends
// `ship.state.x/y` — the hull's CENTRE — so this module appends the centre too
// and the on-water track lies on the same water the server's ribbon describes.
// The on-water FOAM is drawn at the stern instead (that is where foam physically
// is); the ribbon is the geometry, the foam is a rendering of it.
//
// AMENDMENT 201 — NO BUOY SPECIAL-CASING, IN EITHER DIRECTION. A DECOY BUOY is
// anchored at its drop point (amendment 123, Story 8.16: a decoy lays no wake),
// so it never travels one sample cadence and `appendWakeSample` stores nothing after
// its first sample: no segments, no foam, no chop, BY CONSTRUCTION. There is
// deliberately no buoy branch here to delete.
//

import {
  CONFIG,
  appendWakeSample,
  createShipWake,
  createTorpWake,
  hullEnvelope,
  pruneWake,
  type HullId,
  type WakeRibbon,
} from '@salvo/shared';
import { CONTACT_STALE_MS } from './contacts.js';

/**
 * WHAT KIND OF SOURCE laid this water — a hull class, or the fish.
 *
 * ONE discriminator, not a parallel `torp?: boolean` beside `cls`, because
 * every place that branches on it (ring-buffer provisioning, the foam's stern
 * offset) needs exactly one answer and two fields
 * could disagree. It is also the RESET key `sourceFor` already compares, so a
 * shell id that somehow collided with a hull id re-provisions rather than
 * chaining a fish onto a battleship's track.
 */
export type WakeSourceKind = HullId | 'torp';

/** One visible source, as the wake layer needs it: pose, kind and the tint its
 *  foam carries. `maxSpeedU` provisions the ring buffer — pass the source's
 *  TRUE attainable top speed when it is known (own ship:
 *  `draftedKinematics(boostedKinematics(kinematics, CONFIG.boost.factor, true),
 *  CONFIG.wake.draft.lift, true).maxSpeed`, mirroring `World.wakeTopSpeed` —
 *  boost AND full wake-draft lift, Story 8.19); omitted, the class
 *  envelope is used and a boosted or drafting hull loses a little tail early, which is the
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
   *  anything. (Its one consumer, the radar's in-bubble wake stamp cache, was
   *  retired by amendment 210; the bookkeeping is kept but drives nothing.) */
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
 *  fish's is one cell wide at half life and carries `torp` (the shared
 *  model's fish flag), a hull's is its class envelope's. */
function ribbonFor(h: WakeHull, topSpeedU: number): WakeRibbon {
  return h.cls === 'torp' ? createTorpWake() : createShipWake(h.cls, topSpeedU);
}

/**
 * HOW STALE AN OBSERVATION MAY BE and still count as "this source is being
 * observed right now" (ms) — the clock `wakeSourceObserved` reads.
 *
 * TWO SERVER TICKS, derived rather than picked. The emitter samples every
 * visible source once per rendered frame off the server-clock estimate, so a
 * source observed this frame has `seenMs === nowMs` exactly;
 * the slack exists only to absorb a client rendering slower than the 20Hz sim
 * (down to 10fps) without flickering. It is deliberately FAR tighter than
 * `CONTACT_STALE_MS` (the contact store's own prune clock, `interpDelayMs +
 * 300`), which still decides when a ribbon may chain (`chainable`).
 */
export const WAKE_OBSERVE_GRACE_MS = 2 * CONFIG.tick.simDtMs;

/**
 * IS THIS SOURCE BEING OBSERVED RIGHT NOW? (cycle-69 review gate, P5.)
 *
 * HISTORY: this predicate gated the client's in-bubble wake SYNTHESIS onto the
 * radar — the REVEAL half of a remember-vs-reveal split. Amendment 210 retired
 * that synthesis (the server now discloses every swept wake segment, and the
 * scope paints wire rows only), so nothing on the radar path reads it. It still
 * drives `WakeSource.observed` / `version` in `prune`. The ribbon and its foam
 * were never gated by it: water you watched being laid stays remembered
 * (amendment 200).
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
 * `version` ticks whenever the SEGMENT SET changes (a sample stored, a tail
 * pruned, a source dropped or reset, an observation edge) and never merely
 * because a hull moved. It was the invalidation handle of the radar's in-bubble
 * wake stamp cache, retired by amendment 210; no production code reads it now.
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
    // The OBSERVATION EDGE is part of the segment-set version (P5).
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
      // STOPPED being observed moves `version` exactly as one that started.
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
