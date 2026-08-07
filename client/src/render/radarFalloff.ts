// THE ONE RETURN MODEL (Story 4.10, amendments 105-106 + 118, 127-132) — pure
// math, no Pixi, no config, no state. Every source that puts intensity into the
// `return` heatmap computes it the same way:
//
//     intensity = material coefficient x falloff(geometry) x the source's own
//                 shape term (aspect dome / depth solidity / band profile)
//
// and the falloff's EXPONENT is chosen by the TARGET'S GEOMETRY, never by its
// name (amendment 106):
//
//     | target geometry              | falloff | why                          |
//     | point   (ship)               |  1/d^4  | fixed cross-section          |
//     | surface (coast, surf, sea)   |  1/d^3  | illuminated area grows       |
//     | volume  (rain, storm)        |  1/d^2  | illuminated volume grows more|
//
// THIS IS WHAT MAKES THE TAXONOMY EMERGENT (amendment 105 — COLOUR IS INTENSITY,
// NEVER CATEGORY). Object type reaches colour ONLY through physical properties
// fed into the one intensity scale: a warship blazes close and fades far under
// the 4th power, a squall stays legible clear across the map under the 2nd, and
// sea clutter forms a near-ship haze because its COEFFICIENT is tiny even though
// it falls off slowly. Nobody writes "ship = red"; it comes out that way.
//
// THE CURVE IS A ONE-CHARACTER GENERALIZATION OF THE SHIPPED ONE, WHICH IS WHY
// IT IS SAFE. Cycle 52's `rangeAttenuation` was
//
//     floor + (1 - floor) / (1 + d/ref)
//
// and this module is the same expression with the ratio raised to the geometry's
// exponent. `n = 1` reproduces it EXACTLY (pinned in radarFalloff.test.ts). The
// form is a true inverse-power law asymptotically, has no singularity at d = 0,
// is strictly decreasing everywhere, and keeps the floor as an ASYMPTOTE rather
// than a clamp — so two different ranges still never attenuate identically,
// which is amendment 64's one-quantity-per-channel rule.
//
// NOTHING HERE READS A RANGE CONSTANT AT ALL — not the eighths ladder's 7/8
// rung, not any other. The red->blue crossover is fitted (`fitPointRef`) where
// the client tunables are defined, and it enters the paint path only as a
// reference RANGE inside the curve. A comparison against a rung — `if (d > the
// 7/8 constant)` — anywhere on a paint path violates amendments 105/118 and is
// the wrong implementation of the ladder; Story 4.9's own source comment on that
// constant (shared/src/constants.ts, `vision`) says so in as many words, and the
// grep that proves it holds is run over this whole directory. Fit the curve; do
// not branch.

/** Fixed cross-section: a hull. Radar equation's 1/d^4. */
export const POINT = 4;
/** Illuminated area grows with range: coastline, surf, sea clutter. 1/d^3. */
export const SURFACE = 3;
/** Illuminated volume grows faster still: rain, the storm wall. 1/d^2. */
export const VOLUME = 2;

/**
 * `x^n` for the three small integer exponents above, by MULTIPLICATION.
 *
 * `Math.pow` with a non-integer exponent is a transcendental call on a path that
 * runs per CELL (a min-zoom frame stamps tens of thousands of them), and the
 * exponents are compile-time constants of 2, 3 or 4 — so the multiply is both
 * faster and exactly representable. An exponent outside the table falls back to
 * `Math.pow`, which no shipped caller reaches; it exists so a future geometry
 * cannot silently return garbage.
 */
function intPow(x: number, n: number): number {
  const x2 = x * x;
  if (n === VOLUME) return x2;
  if (n === SURFACE) return x2 * x;
  if (n === POINT) return x2 * x2;
  if (n === 1) return x;
  return Math.pow(x, n);
}

/**
 * The ONE attenuation curve, for any geometry:
 *
 *     atten(d) = floor + (1 - floor) / (1 + (d/ref)^n)
 *
 * `floor` is an ASYMPTOTE the curve approaches and never reaches (amendment
 * 127 — the floors that guarantee visibility SURVIVE the physics; "signature
 * becomes stealth" is a ruled-out design, not a missing feature).
 *
 * EVERY DEGENERATE INPUT ANSWERS A FINITE NUMBER, never NaN. A non-positive or
 * non-finite `ref` answers 1 ("no attenuation"); a NaN distance or floor is
 * rejected by the NEGATED comparisons below rather than propagated. This is
 * load-bearing rather than defensive: `writeCell` is MAX-WINS, and a single NaN
 * would compare false against every later paint and silently win nothing while
 * a single Infinity would win everything.
 */
export function attenuation(dist: number, ref: number, exponent: number, floor: number): number {
  if (!(ref > 0)) return 1;
  const f = floor > 0 ? Math.min(1, floor) : 0; // NaN -> 0
  const d = dist > 0 ? dist : 0; // NaN / negative -> 0
  return f + (1 - f) / (1 + intPow(d / ref, exponent));
}

/** Everything `fitPointRef` needs to solve for the point-target reference. */
export interface PointFit {
  /** Range (u) at which the fitted curve must put the calibration hull's peak
   *  exactly on `band`. The caller passes the ladder's 7/8 rung, and
   *  client/src/config.ts is the ONLY place that constant may be read. */
  crossover: number;
  /** The calibration hull's aspect-projected extent (u) at the presented aspect. */
  ext: number;
  /** Attenuated extent (u) that reads as a full-strength core (`strongExtent`). */
  strongExtent: number;
  /** Target intensity at the crossover — the red->blue boundary, `bands[2].at`. */
  band: number;
  /** The material coefficient the same peak is multiplied by (steel = 1). */
  coef: number;
  /** The point curve's asymptotic floor (`ship.attenFloor`). */
  floor: number;
}

/**
 * THE CALIBRATION (amendment 118): solve for the reference range that puts a
 * mid-size hull's peak EXACTLY on the red->blue boundary at `crossover`.
 *
 * The peak a ship kernel reads is `coef * ext * atten(d) / strongExtent`
 * (radarHeatmap.shipPeak), so the required attenuation at the crossover is
 *
 *     A = band * strongExtent / (coef * ext)
 *
 * and inverting the curve at `n = POINT` gives
 *
 *     (d/ref)^4 = (1 - A) / (A - floor)   ->   ref = d / ((1-A)/(A-floor))^(1/4)
 *
 * so the crossover EMERGES from the curve instead of being a threshold anyone
 * can branch on. Evaluated ONCE, where the client tunables are defined — never
 * per frame and never per cell — which is why the fourth root is allowed to be
 * a `Math.pow`.
 *
 * DEGENERATE FITS ANSWER `crossover` rather than NaN or Infinity: `A` outside
 * `(floor, 1)` means the calibration hull cannot land on that band at that
 * range under this floor at all (the ill-conditioning that made lowering
 * `attenFloor` necessary — see the config comment). Returning the crossover
 * keeps the curve sane and lets the calibration TEST fail loudly instead of the
 * renderer failing silently.
 */
export function fitPointRef(o: PointFit): number {
  const denom = o.coef * o.ext;
  if (!(o.crossover > 0) || !(denom > 0) || !(o.strongExtent > 0)) return Math.max(1, o.crossover);
  const a = (o.band * o.strongExtent) / denom;
  if (!(a > o.floor) || !(a < 1)) return Math.max(1, o.crossover);
  const ratioN = (1 - a) / (a - o.floor);
  return o.crossover / Math.pow(ratioN, 1 / POINT);
}

/** Terrain reflectivity tunables (CLIENT_CONFIG.blip.heatmap.model). */
export interface HeightOpts {
  /** Coefficient of terrain at (or barely above) sea level — a mudflat. */
  landFlat: number;
  /** Coefficient of terrain at or above `refHeight` — a rock headland. */
  landSteep: number;
  /** Quantized `HeightRaster` height (0-255) at which `landSteep` is reached. */
  refHeight: number;
}

/**
 * MATERIAL REFLECTIVITY FROM TERRAIN HEIGHT (amendment 129) — a lerp from the
 * flat coefficient to the steep one over `refHeight`, clamped at both ends.
 *
 * IT MULTIPLIES THE DEPTH RULE, IT DOES NOT REPLACE IT. Coast strength is
 * `depth-solidity x height-reflectivity`, so amendment 78 survives intact — a
 * big island still reads as a big mass with softer edges — and what height ADDS
 * is that a steep headland reads red where a low sandy island of the SAME SIZE
 * reads blue or green. Height-replaces-depth and height-as-a-ceiling were both
 * put to Eric and both REJECTED.
 *
 * `h` is the quantized height straight off the cycle-59 `HeightRaster`
 * (`sampleHeight`), the ratified elevation authority — never the contour
 * polygons, which are a rendering artifact that is never collided or LOS-tested.
 * A non-finite or negative sample lands on the FLAT coefficient (the
 * conservative end) rather than propagating a NaN into `writeCell`.
 */
export function heightReflectivity(h: number, o: HeightOpts): number {
  if (!(o.refHeight > 0)) return o.landSteep;
  const t = h > 0 ? Math.min(1, h / o.refHeight) : 0; // NaN / negative -> 0
  return o.landFlat + (o.landSteep - o.landFlat) * t;
}
