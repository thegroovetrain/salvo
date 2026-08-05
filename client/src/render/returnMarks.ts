// Pure `return`-grammar echo math (no Pixi import — unit-tested). Cycle 50,
// amendments 51-59: a radar paint stops being a hull silhouette and becomes an
// ECHO — a fuzzy irregular blob whose only channels are SIZE (return strength)
// and BRIGHTNESS (age). This module owns every number that decision needs; the
// Pixi adapter (render/radar.ts) only traces what these functions return, so
// the geometry stays testable without a GPU — the same seam blipMarks.ts holds
// for the `silhouette` grammar.
//
// NOTE ON THE SIBLING PRIMITIVE. `blipMarks.extentAlong` is MAX-FROM-ORIGIN
// (one-sided reach along an axis, for rooting the speed vector on the hull
// outline); shared's `perpendicularExtent` — which is where the `ext` scalar on
// the wire comes from — is a TOTAL SPAN (max − min). They are NOT
// interchangeable. Everything here consumes the total-span reading, so a blob's
// ACROSS semi-axis is `ext / 2`.
//
// Four surfaces live here:
//
//   • RANGE ATTENUATION (orchestrator ruling R2). The server sends PURE ASPECT
//     GEOMETRY in world units and nothing else: `ext` is the hull silhouette
//     projected perpendicular to the observer→target bearing, with no range
//     term. The falloff is applied HERE, at render time, because the client
//     already knows both its own position and the paint position — so the wire
//     stays minimal and leaks strictly less. That also keeps the curve where
//     amendment 61 requires it: a presentation knob in CLIENT_CONFIG, never a
//     new constant in shared `CONFIG.vision`.
//
//   • THE SEEDED BLOB (amendment 59). Jitter derives from (track id, paint
//     time), so a given paint is STABLE across its entire decay while the NEXT
//     paint of the same contact differs — real scope shimmer without
//     frame-to-frame noise, and no two returns of one hull ever look identical.
//     That irregularity is the POINT: it is what stops a player reading class
//     off a shape, which is the whole reversal amendment 51 ordered.
//
//   • ISLAND RETURNS (amendment 58, ruling R4). Islands are already client-known
//     from the map seed (`generateMap`), so a coastline echo is PURE
//     PRESENTATION — no wire field, no server work, no perception-invariant
//     surface. Only the NEAR ARC paints; everything behind stays shadow, which
//     is not a new rule but the existing one (Eric ruling 2026-08-02: islands
//     block every sensor at all ranges). That rule is TWO-SIDED and both sides
//     are enforced here: an island shadows ITSELF (the near-arc horizon), and it
//     shadows EVERY OTHER island behind it (the `segCircleHit` LOS filter, the
//     same primitive `server/src/game/signals.ts:losClear` gates ship paints
//     with). A coast mark a ship could not blip from must not paint either.
//
//   • SWEEP CROSSING. Both ship and island returns are born the instant the beam
//     crosses their bearing, and both then decay on the ordinary phosphor ramp.
//     The island path re-derives its own crossing here because the server never
//     sees an island paint at all.

import { mulberry32, segCircleHit, wrapPositive, type Circle, type Vec2 } from '@salvo/shared';

const TAU = Math.PI * 2;

// Hash constants for `blobSeed`, written in DECIMAL on purpose (comments too):
// the token guard (tokens.test.ts) reports every 6/8-digit hex literal anywhere
// in client/src as a color escaping the token source, and these are mixing
// constants, not colors. Values are the standard 32-bit FNV-1a offset basis and
// prime, plus the two multipliers from the murmur3 finalizer.
const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;
const TIME_MIX = 668265261;
const AVALANCHE_MIX = 2246822507;

/** Tunables for the echo blob (CLIENT_CONFIG.blip.returns supplies them). */
export interface ReturnOpts {
  /** Vertices around the blob. Enough to read as an irregular smear, few
   *  enough that the jitter stays visible rather than averaging into a circle. */
  vertices: number;
  /** Per-vertex radial jitter as a fraction of the base radius (±). */
  jitter: number;
  /** Smallest drawable ACROSS extent (u) — a bow-on needle at max range is a
   *  weak contact, never an invisible one. */
  minExtent: number;
  /** Range depth as a fraction of the across extent: a scope smears an echo in
   *  range as well as azimuth, and a zero-depth blob would read as a line. */
  depthFrac: number;
  /** Smallest drawable range depth (u). */
  minDepth: number;
  /** Asymptotic floor of the attenuation curve (the scale a return at infinite
   *  range would approach). Strictly > 0 so the curve never reaches it. */
  attenFloor: number;
  /** Range at which the ABOVE-FLOOR part of the curve has halved, as a fraction
   *  of the observer's radar range. */
  attenHalfRange: number;
}

/** Tunables for island coastline returns. */
export interface IslandOpts {
  /** Target spacing between near-arc samples (u of arc length). */
  arcStepU: number;
  /** Hard cap on samples per island — a huge island near the observer must not
   *  turn one frame into a hundred Graphics. */
  maxSamples: number;
  /** Each coast sample's echo extent as a fraction of `arcStepU`, so
   *  consecutive marks nearly touch and read as broken coastline rather than a
   *  dotted line of contacts. */
  extFactor: number;
}

/** One echo the renderer should paint, in world coordinates. */
export interface ReturnMark {
  /** Echo center (world u). */
  x: number;
  y: number;
  /** Aspect-projected extent (u) BEFORE range attenuation. */
  ext: number;
  /** Observer→echo bearing (rad). The blob's ACROSS axis is perpendicular. */
  bearing: number;
  /** Observer→echo distance (u) — the attenuation input. */
  dist: number;
  /** Stable identity for the blob seed and the per-mark cap. */
  key: string;
}

/** A blob's two semi-axes (u), before it is posed to a bearing. */
export interface EchoSize {
  /** Total extent perpendicular to the bearing — the return-strength channel. */
  across: number;
  /** Total extent along the bearing — the scope's range smear. */
  along: number;
}

/**
 * Range attenuation at `dist` for an observer whose radar reaches `radarRange`.
 *
 * STRICTLY DECREASING FOR EVERY dist >= 0, with no clamp anywhere: a hard
 * `Math.max` floor would make two different ranges paint identically, which is
 * exactly the collision the three-channel split (amendment 53) exists to avoid —
 * size means return strength, so two strengths must not share a size by
 * accident. The floor is therefore an ASYMPTOTE, blended in:
 *
 *     atten(d) = floor + (1 − floor) / (1 + d / (halfRange · radarRange))
 *
 * 1.0 at the observer, → `floor` as d → ∞, and the above-floor part has halved
 * at `halfRange · radarRange`. Physical radar power goes as 1/r⁴, which on a
 * scope is flattened by AGC into something far gentler than that — this curve is
 * the readable stand-in, not a propagation model, and it is tuned so a contact
 * at the rim still reads as a contact.
 *
 * A non-positive `radarRange` (never reachable from `effectiveStats`, but a
 * divide-by-zero if it ever were) degrades to no attenuation rather than NaN.
 */
export function rangeAttenuation(dist: number, radarRange: number, o: ReturnOpts): number {
  const ref = o.attenHalfRange * radarRange;
  if (!(ref > 0)) return 1;
  return o.attenFloor + (1 - o.attenFloor) / (1 + Math.max(0, dist) / ref);
}

/**
 * The drawn semi-axes for an echo of aspect extent `ext` at `dist`.
 *
 * `across` is the information channel (amendment 55: hull geometry × relative
 * bearing × range, and NOTHING else — never boons, hp, or damage state, none of
 * which reach this function). `along` is pure presentation: a scope's range
 * smear, floored so a needle bow-on still has a body.
 */
export function echoSize(
  ext: number,
  dist: number,
  radarRange: number,
  o: ReturnOpts,
): EchoSize {
  const across = Math.max(o.minExtent, ext * rangeAttenuation(dist, radarRange, o));
  return { across, along: Math.max(o.minDepth, across * o.depthFrac) };
}

/**
 * The blob seed for a paint: a 32-bit avalanche of (track key, paint time).
 *
 * Both inputs matter and neither may be dropped. The KEY is what keeps every
 * echo of one contact from being a re-roll of the same shape; the TIME is what
 * makes the next paint of that same contact differ. Together they give
 * amendment 59's exact contract — stable while it decays, different next sweep.
 *
 * FNV-1a over the key, the time folded in with a mixing constant, then a final
 * xorshift-multiply avalanche so a 50ms tick step (the smallest change the
 * server clock can deliver) still lands on an unrelated seed.
 */
export function blobSeed(key: string, paintT: number): number {
  let h = FNV_OFFSET;
  for (let i = 0; i < key.length; i++) {
    h = Math.imul(h ^ key.charCodeAt(i), FNV_PRIME);
  }
  h = Math.imul(h ^ (paintT | 0), TIME_MIX);
  h = Math.imul(h ^ (h >>> 15), AVALANCHE_MIX);
  return (h ^ (h >>> 13)) >>> 0;
}

/**
 * The irregular echo polygon, as WORLD-FRAME OFFSETS from the paint position
 * (the Graphics is positioned at the paint and never rotated — the same frame
 * discipline blipMarks.ts keeps, so a blob and a `sp` splash at the same spot
 * cannot disagree about where "there" is).
 *
 * Built in a local frame where +x runs along the observer→echo bearing (the
 * range axis) and +y across it (the extent axis), then rotated by `bearing`.
 * That orientation is load-bearing: `ext` is defined perpendicular to the
 * bearing, so a blob rotated any other way would be stating an aspect the hull
 * does not have.
 */
export function returnPolygon(
  seed: number,
  size: EchoSize,
  bearing: number,
  o: ReturnOpts,
): Vec2[] {
  const rng = mulberry32(seed);
  const n = Math.max(3, Math.round(o.vertices));
  const cos = Math.cos(bearing);
  const sin = Math.sin(bearing);
  const ax = size.along / 2;
  const ay = size.across / 2;
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const j = 1 + rng.float(-1, 1) * o.jitter;
    const lx = Math.cos(a) * ax * j;
    const ly = Math.sin(a) * ay * j;
    out.push({ x: lx * cos - ly * sin, y: lx * sin + ly * cos });
  }
  return out;
}

/**
 * Did the beam cross `target` while advancing from `from` to `to`?
 *
 * Half-open in the direction of travel — `(from, to]` — so a bearing exactly on
 * a frame boundary paints once, never twice. A zero-width advance (a stalled
 * clock, or two render calls inside the same millisecond) crosses nothing,
 * which is what keeps a paused tab from stacking duplicate marks.
 */
export function sweepCrossed(from: number, to: number, target: number): boolean {
  const span = wrapPositive(to - from);
  if (span <= 0) return false;
  const off = wrapPositive(target - from);
  return off > 0 && off <= span;
}

/** Does the swept arc `(from, to]` touch the bearing interval `centre ± half`? */
function arcOverlaps(from: number, to: number, centre: number, half: number): boolean {
  return (
    sweepCrossed(from, to, centre - half) ||
    sweepCrossed(from, to, centre + half) ||
    sweepCrossed(centre - half, centre + half, to)
  );
}

/**
 * Sample the island's NEAR ARC — the coastline the beam can actually reach.
 *
 * The horizon of a circle seen from outside it is the pair of tangent points,
 * at ±acos(r/d) around the island-centre→observer direction; everything beyond
 * them is the island's own shadow and must never paint. Samples sit at arc
 * MIDPOINTS so no mark ever lands exactly on a tangent, where it would flicker
 * as the observer moves.
 *
 * Every returned point is strictly nearer the observer than the island centre
 * is: |P−O|² = r² + d² − 2rd·cos(θ−φ) < d² whenever cos(θ−φ) > r/(2d), and the
 * horizon condition cos(θ−φ) >= r/d is strictly stronger. That inequality IS
 * the near-arc guarantee, and it is what the AC10 test pins.
 */
export function nearArcSamples(
  island: Circle,
  observer: Vec2,
  o: IslandOpts,
): ReturnMark[] {
  const dx = island.x - observer.x;
  const dy = island.y - observer.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= island.r) return []; // observer aground/inside — no coast to paint
  const phi = Math.atan2(-dy, -dx); // island centre → observer
  const half = Math.acos(Math.min(1, island.r / dist));
  const n = Math.min(o.maxSamples, Math.max(2, Math.ceil((2 * half * island.r) / o.arcStepU)));
  const ext = o.arcStepU * o.extFactor;
  const out: ReturnMark[] = [];
  for (let i = 0; i < n; i++) {
    const th = phi - half + ((i + 0.5) / n) * 2 * half;
    const x = island.x + Math.cos(th) * island.r;
    const y = island.y + Math.sin(th) * island.r;
    const bx = x - observer.x;
    const by = y - observer.y;
    out.push({
      x,
      y,
      ext,
      bearing: Math.atan2(by, bx),
      dist: Math.hypot(bx, by),
      key: `i${island.x.toFixed(0)},${island.y.toFixed(0)}#${i}`,
    });
  }
  return out;
}

/**
 * Is the observer→`p` segment clear of every island in `field` EXCEPT `self`?
 *
 * `segCircleHit` is THE line-of-sight primitive of this codebase — the same one
 * `server/src/game/signals.ts:losClear` runs to decide whether a SHIP paints.
 * Terrain answers to it identically: a coast mark whose sightline is blocked by
 * another island must not paint, or the scope would draw a shoreline the same
 * observer could not blip a hull at.
 *
 * `self` is excluded by IDENTITY, not by geometry: an island can never occlude
 * itself, because its own near arc IS the return, and every one of those samples
 * sits exactly on its circle (where `segCircleHit` reports a touch).
 */
function losClearOfOthers(
  observer: Vec2,
  p: Vec2,
  field: readonly Circle[],
  self: Circle,
): boolean {
  for (const isl of field) {
    if (isl === self) continue;
    if (segCircleHit(observer, p, isl, isl.r) !== null) return false;
  }
  return true;
}

/**
 * The island returns born THIS FRAME: near-arc samples whose bearing the beam
 * crossed while advancing from `from` to `to`, that are in range, and that the
 * rest of the island field does not shadow.
 *
 * The cheap whole-island bearing-span rejection runs FIRST, and the per-sample
 * predicate is ordered cheapest-first behind it (beam crossing → range → LOS).
 * A 60fps frame advances the beam ~1.5° at 15rpm while an island subtends a
 * handful of degrees, so on nearly every frame nothing is in the beam and this
 * costs one hypot plus three angle compares per island — the sampling loop, and
 * with it the only LOS work, runs solely for the island the beam is actually on.
 * WORST CASE per frame is therefore `maxSamples × (islands the beam is inside) ×
 * (field − 1)` quadratic tests; the ordering keeps the realistic case at zero.
 *
 * RANGE IS CHECKED PER SAMPLE, not just per island. The whole-island gate uses
 * the island's NEAREST point (its coastline is what paints, not its centre), but
 * the near arc runs out to the tangents at up to sqrt(d² − r²) — so a coastline
 * that starts inside the radar ring can reach past it, and a mark outside the
 * drawn ring would contradict the hard annulus gate every ship paint obeys.
 *
 * The observer being inside the island is treated as no coast at all rather than
 * as a divide-by-zero.
 *
 * `field` is the whole client-known island list; `island` must be the SAME
 * OBJECT as its entry there (render/radar.ts iterates the very array it passes),
 * because the self-exclusion is by reference — a value-equal clone would shadow
 * its own coastline into nothing.
 */
export function islandReturns(
  island: Circle,
  field: readonly Circle[],
  observer: Vec2,
  from: number,
  to: number,
  radarRange: number,
  o: IslandOpts,
): ReturnMark[] {
  const dx = island.x - observer.x;
  const dy = island.y - observer.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= island.r || dist - island.r > radarRange) return [];
  const centre = Math.atan2(dy, dx);
  const half = Math.asin(Math.min(1, island.r / dist));
  if (!arcOverlaps(from, to, centre, half)) return [];
  return nearArcSamples(island, observer, o).filter(
    (m) =>
      sweepCrossed(from, to, m.bearing) &&
      m.dist <= radarRange &&
      losClearOfOthers(observer, m, field, island),
  );
}
