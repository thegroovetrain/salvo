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
//
// CYCLE 62 ADDS THE THIRD TERM OF THE MODEL: the SNR NOISE ENVELOPE (amendment
// 143). Intensity was always `coefficient x falloff x shape`; what the grain does
// to it is now part of the same model rather than a flat multiplier bolted on
// afterwards, because how STEADY a return is is itself a reading of signal
// strength. See `noiseAmplitude`. The exponents, the curve and
// `heightReflectivity` are byte-identical to the cycle-61 model they were tuned
// as.
//
// CYCLE 67 SIMPLIFIES THE FIT (amendments 171-175). A hull's shape term is gone:
// its reflectivity is MATERIAL and nothing else, so `fitPointRef` no longer takes
// a calibration hull at all. See its own comment — the short version is that the
// crossover became a pure statement about RANGE, which is what amendment 118 asked
// for in the first place.

/** Fixed cross-section: a hull. Radar equation's 1/d^4. */
export const POINT = 4;
/** Illuminated area grows with range: coastline, surf, sea clutter. 1/d^3. */
export const SURFACE = 3;
/** Illuminated volume grows faster still: rain, a squall. 1/d^2.
 *
 * CURRENTLY UNCONSUMED, and deliberately kept (cycle 72). Its only material was
 * the storm wall, which Eric deleted from the scope; this stays because it is a
 * primitive of amendment 106's ratified return model — the point/surface/volume
 * exponent table is the MODEL, not a knob — and the next volume material should
 * not have to re-derive it. What went with the wall was every value that only
 * ever tuned it: `model.storm`, `model.volumeRef` and `model.stormBandU`. */
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

/**
 * Solve the curve for the reference range that puts `A` (the required
 * attenuation) exactly at `d`, on the given exponent — the shared inversion
 * both fits below use. Returns null when the material cannot land on that
 * attenuation at that range under that floor at all, which is the caller's cue
 * to answer the range itself rather than a garbage reference.
 */
function refForAttenuation(d: number, a: number, floor: number, exponent: number): number | null {
  if (!(a > floor) || !(a < 1)) return null;
  const ratioN = (1 - floor) / (a - floor) - 1;
  if (!(ratioN > 0)) return null;
  return d / Math.pow(ratioN, 1 / exponent);
}

/** Everything `fitPointRef` needs to solve for the point-target reference. */
export interface PointFit {
  /** Range (u) at which the fitted curve must put a hull's return exactly on
   *  `band`. The caller passes the ladder's 7/8 rung, and client/src/config.ts
   *  is the ONLY place that constant may be read. */
  crossover: number;
  /** Target intensity at the crossover — the red->blue boundary, `bands[2].at`. */
  band: number;
  /** The hull MATERIAL's coefficient (steel = 1). Since cycle 67 this is the
   *  whole of a hull's pre-range reflectivity — there is no second term. */
  coef: number;
  /** The point curve's asymptotic floor (`ship.attenFloor`). */
  floor: number;
}

/**
 * THE CALIBRATION (amendment 118): solve for the reference range that puts a
 * hull's return EXACTLY on the red->blue boundary at `crossover`.
 *
 * A hull's return is `coef * atten(d)` (radarField.hullSample), so the
 * attenuation required at the crossover is simply
 *
 *     A = band / coef
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
 * CYCLE 67 REMOVED THE CALIBRATION HULL FROM THIS FIT, AND THAT MAKES AMENDMENT
 * 118 CLEANER RATHER THAN LOOSER (amendments 171-175). Until now the solve also
 * took an `ext` — an aspect-projected extent — and a `strongExtent` normalizer,
 * because a hull's reflectivity carried an aspect term. It no longer does: the
 * COVERAGE MASK carries aspect (a bow-on hull rasterizes to a genuinely small
 * mark), so scaling reflectivity by extent as well was counting the same physics
 * twice. Eric's ruling is that colour is MATERIAL and RANGE only. What survives
 * here is therefore a PURE STATEMENT ABOUT RANGE: **every hull crosses red->blue
 * at 7/8 intel range, whatever its class and whatever its aspect** — which is
 * what amendment 118 actually asks for, and which no longer needs a nominated
 * "mid-size hull broadside" to be meaningful.
 *
 * IT ALSO RETIRES THE CYCLE-63 "CROSSOVER IS A LATTICE-PHASE BAND" PROBLEM
 * ENTIRELY (amendment 158's second bullet, and the `coverageExtent` correction at
 * amendment 159k). That band existed because the fit's `ext` input was
 * reconstructed from the FUZZED mask, so lattice phase and per-paint glint
 * scintillated the crossover across roughly [rung - 60u, rung + 35u]. No
 * mask-derived quantity reaches intensity any more, so the crossover is an exact
 * range again — and exactly steady under the grain too, since `noise.solidAt` is
 * pinned to this same `band`, where the SNR envelope's amplitude is zero.
 *
 * DEGENERATE FITS ANSWER `crossover` rather than NaN or Infinity: `A` outside
 * `(floor, 1)` means the material cannot land on that band at that range under
 * this floor at all (the ill-conditioning that made lowering `attenFloor`
 * necessary — see the config comment). Returning the crossover keeps the curve
 * sane and lets the calibration TEST fail loudly instead of the renderer failing
 * silently.
 */
export function fitPointRef(o: PointFit): number {
  if (!(o.crossover > 0) || !(o.coef > 0)) return Math.max(1, o.crossover);
  const ref = refForAttenuation(o.crossover, o.band / o.coef, o.floor, POINT);
  return ref === null ? Math.max(1, o.crossover) : ref;
}

// --- the SNR noise envelope (cycle 62, amendment 143) --------------------------

/**
 * The grain's shape: how much a cell's intensity is allowed to jitter, as a
 * function of the intensity itself (CLIENT_CONFIG.blip.heatmap.noise).
 */
export interface NoiseEnvelope {
  /** Peak jitter (±, as a fraction) at the DETECTION FLOOR — a return that is
   *  barely there is barely stable. */
  amount: number;
  /** Intensity at which the grain has fallen to exactly zero. At or above this
   *  a cell is rock steady, which is what a saturated return looks like. */
  solidAt: number;
}

/**
 * NOISE SCALES WITH WEAKNESS — SNR, not a flat jitter (amendment 143).
 *
 * On a real set a solid landmass returns a stable block of the strongest colour
 * with a graded fringe; the grain lives in LOW SIGNAL-TO-NOISE returns — sea
 * clutter, rain, distant small targets and the partially-illuminated edge of any
 * target. Cycle 61's flat ±30% was backwards: it put static in the interior of an
 * island, the one place a scope is rock-steady, and it was also what smeared
 * intensity OFF the iso-height lines so colour bands dithered across a landmass
 * instead of landing on its contours (amendment 142's diagnosis).
 *
 * So the amplitude ramps linearly from `amount` at zero signal to ZERO at
 * `solidAt`. This is a consequence of amendment 105 (colour is intensity), not a
 * new channel: the grain now reports that a return is MARGINAL, which is
 * information a real operator reads straight off the scope.
 *
 * SEA CLUTTER NEEDS NO SPECIAL CASE. It is deliberately tuned to straddle the
 * transparency threshold (amendments 133, 136), so it sits at the noisy end BY
 * CONSTRUCTION — the envelope hands it the biggest amplitude on the scope for
 * free. Its bound, and every other coefficient's, must be re-proved against THIS
 * curve rather than against the retired flat one (amendment 135).
 *
 * Degenerate inputs answer 0 (perfectly solid) rather than NaN: a non-positive
 * `solidAt` or `amount` means "no grain", and a negative intensity is treated as
 * zero signal.
 *
 * `scale` IS A PER-MATERIAL GRAIN SCALE (Story 4.12, amendment 203), defaulting
 * to 1 — the AMBIENT envelope, byte-identical to every pre-4.12 caller. It
 * exists because the grain models the SCINTILLATION OF INCOHERENT SCATTER, and
 * not every return on this scope is incoherent scatter: a ship's track is an
 * ORGANIZED, persistent surface feature with a definite boundary, not random
 * capillary roughness, so it twinkles far less than the sea state around it.
 * That is a physical statement about a material, which is exactly what this
 * parameter is — it is NOT a legibility knob, and it must never be reached for
 * to make some material easier to see (that lever is the coefficient, and
 * amendment 163's standing note applies).
 *
 * It also happens to be what makes amendment 198 BUILDABLE at all. A wake has
 * to light essentially ALL of its cells (worst draw above `bands[0].at`) while
 * still never outranking the faintest legitimate echo (best draw below
 * `minPeak`'s worst draw), and at ambient grain those two are INFEASIBLE
 * together — see `fitGrainScale`, which solves the largest amplitude the
 * corridor admits.
 */
export function noiseAmplitude(intensity: number, env: NoiseEnvelope, scale = 1): number {
  if (!(env.amount > 0) || !(env.solidAt > 0) || !(scale > 0)) return 0;
  const t = intensity > 0 ? Math.min(1, intensity / env.solidAt) : 0; // NaN -> 0
  return scale * env.amount * (1 - t);
}

/**
 * THE PRE-GRAIN INTENSITY WHOSE UNLUCKIEST DRAW LANDS EXACTLY ON `band` —
 * the inverse of `p × (1 − amplitude(p))`, solved rather than searched.
 *
 * This is the quantity every "the material is still lit at its worst draw"
 * statement is really about, and it is a QUADRATIC because the amplitude is
 * itself a function of the intensity (amendment 143). With `k = scale × amount`
 * the worst draw is
 *
 *     w(p) = p × (1 − k × (1 − p/solidAt)) = (k/solidAt)·p² + (1 − k)·p
 *
 * so `w(p) = band` has one positive root, taken here in the numerically stable
 * form. A zero envelope answers `band` itself (no grain, no gap). Degenerate
 * inputs answer `band` rather than NaN.
 *
 * Valid where the amplitude ramp is live (`p < solidAt`), which is the whole of
 * the weak end this is ever asked about; a `band` at or above `solidAt` is
 * grain-free and the identity answer is exact there too.
 */
export function worstDrawIntensity(band: number, env: NoiseEnvelope, scale = 1): number {
  if (!(band > 0)) return 0;
  const k = env.amount > 0 && env.solidAt > 0 && scale > 0 ? scale * env.amount : 0;
  if (!(k > 0) || k >= 1) return band;
  const a = k / env.solidAt;
  const b = 1 - k;
  return (2 * band) / (b + Math.sqrt(b * b + 4 * a * band));
}

/** Everything `fitGrainScale` needs to solve for a material's grain scale. */
export interface GrainFit {
  /** The material's peak pre-grain intensity (its coefficient — attenuation is
   *  ≤ 1 everywhere, so the coefficient IS the peak). */
  coef: number;
  /** Lower rail of the corridor the material must stay inside: its UNLUCKIEST
   *  draw must clear this. */
  lo: number;
  /** Upper rail: its LUCKIEST draw must stay under this. */
  hi: number;
  /** The ambient envelope the scale multiplies. */
  env: NoiseEnvelope;
  /** Fraction of the feasibility ceiling to actually spend. THE ONE FREE CHOICE
   *  in this calibration — a safety factor on an arithmetic bound, not a look
   *  knob: 0.5 is a 2× margin on both rails at once. */
  safety: number;
}

/**
 * SOLVE THE PER-MATERIAL GRAIN SCALE (Story 4.12, amendment 203) — the largest
 * grain a material can carry and still satisfy BOTH rails of its corridor,
 * scaled back by a stated safety factor.
 *
 * A material of peak intensity `c` draws in `c × (1 ± a)`. Staying under `hi`
 * needs `a < hi/c − 1`; clearing `lo` needs `a < 1 − lo/c`. The FEASIBILITY
 * CEILING is the smaller of the two, and when `c` is the corridor's midpoint the
 * two are equal and the ceiling is exactly `(hi − lo)/(hi + lo)`.
 *
 * The scale is then that ceiling (times the safety factor) divided by the
 * AMBIENT amplitude at the same intensity, so the answer moves automatically
 * with `noise.amount`, `noise.solidAt`, `bands[0].at` and `minPeak` — nothing
 * about it is typed in, which is amendment 172's lesson applied (a provisional
 * number acquires authority by being cited, so this one is never written down).
 *
 * A corridor with no room (`hi <= lo`, or a coefficient outside it) answers 0 —
 * NO GRAIN — rather than a negative or non-finite scale: the material then draws
 * at its nominal value and the BOUND TEST fails loudly, exactly as a degenerate
 * `fitPointRef` answers the crossover so the calibration test can catch it.
 */
export function fitGrainScale(o: GrainFit): number {
  if (!(o.coef > 0) || !(o.safety > 0)) return 0;
  const ceiling = Math.min(o.hi / o.coef - 1, 1 - o.lo / o.coef);
  if (!(ceiling > 0)) return 0;
  const ambient = noiseAmplitude(o.coef, o.env);
  if (!(ambient > 0)) return 0;
  return (o.safety * ceiling) / ambient;
}

/** Everything `fitMaterialRef` needs to solve for a material's reference range. */
export interface MaterialFit {
  /** Range (u) at which the material's UNLUCKIEST draw must land exactly on
   *  `band` — its REACH. The caller passes a rung of the eighths ladder, and
   *  client/src/config.ts is the only place that constant may be read. */
  reach: number;
  /** The intensity the worst draw must land on there — `bands[0].at`, the
   *  transparency threshold. */
  band: number;
  /** The material's coefficient. */
  coef: number;
  /** Asymptotic floor of its curve. */
  floor: number;
  /** Its geometry class (SURFACE for water). */
  geom: number;
  /** The ambient grain envelope. */
  env: NoiseEnvelope;
  /** The material's own grain scale (`fitGrainScale`). */
  grainScale: number;
}

/**
 * THE REACH CALIBRATION (Story 4.12, amendment 203) — solve for the reference
 * range that puts a material's WORST DRAW exactly on the transparency threshold
 * at `reach`, so its extent lands on the eighths ladder instead of on a literal.
 *
 * It is `fitPointRef`'s sibling and follows the same discipline: the answer is
 * an input to the CURVE, never a range anything compares against. Writing
 * `if (d > someRung)` on a paint path violates amendment 105 no matter which
 * rung it is; fit the curve, do not branch.
 *
 * IT FITS THE WORST DRAW, NOT THE NOMINAL, and that is the whole point of
 * bothering (amendment 135: a bound proved at nominal is not proved). "The wake
 * reads out to 5/8 intel range" means EVERY cell of it lights out to there, so
 * the quantity that must land on the threshold is the unluckiest draw
 * (`worstDrawIntensity`), not the average one. Inside the reach every draw
 * clears the threshold and the material lights all of its cells; past it the lit
 * fraction falls smoothly to zero as the draw window slides under — which is the
 * "reads inside, frays out beyond" behaviour, emergent rather than drawn.
 *
 * Degenerate fits answer `reach` rather than NaN or Infinity, exactly as
 * `fitPointRef` answers its crossover, so the calibration TEST fails loudly
 * instead of the renderer failing silently.
 */
export function fitMaterialRef(o: MaterialFit): number {
  // NaN-safe by NEGATED comparison, so a non-finite reach answers 1 rather than
  // propagating into a reference range that would poison every cell it prices.
  const fallback = o.reach > 1 ? o.reach : 1;
  if (!(o.reach > 0) || !(o.coef > 0)) return fallback;
  const lit = worstDrawIntensity(o.band, o.env, o.grainScale);
  const ref = refForAttenuation(o.reach, lit / o.coef, o.floor, o.geom);
  return ref === null ? fallback : ref;
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
