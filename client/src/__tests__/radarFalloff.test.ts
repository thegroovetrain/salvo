// THE ONE RETURN MODEL (Story 4.10, amendments 105-106, 118, 127-132) — the
// pure math every return source composes its intensity through.
//
// WHAT IS CONTRACT HERE, not coverage:
//
//   • THE EXPONENT IS THE GEOMETRY, and the three values are ratified numbers
//     from the radar equation, not tuning: point 4, surface 3, volume 2. Their
//     ORDERING is the thing that makes the taxonomy emergent (amendment 105) —
//     a hull must fade faster with range than a coastline, and a coastline
//     faster than a squall — so the ordering is asserted directly rather than
//     inferred from the constants.
//
//   • `n = 1` REPRODUCES THE SHIPPED CURVE EXACTLY. Cycle 52's `rangeAttenuation`
//     was `floor + (1 − floor)/(1 + d/ref)`. The model is that expression with
//     the ratio raised to the geometry's exponent, so the generalization is a
//     one-character change and this suite proves it: the shipped formula is
//     re-implemented locally as an A/B reference and matched bit for bit. That
//     is the safety net under every behavioural change in this cycle.
//
//   • THE CROSSOVER IS FITTED, NEVER BRANCHED (amendment 118 + 132). The
//     red→blue boundary must EMERGE at 7/8 intel range from the curve's own
//     shape. `CONFIG.vision.farRadar` is an input to the fit and appears nowhere
//     on a paint path — `grep -rn farRadar client/src/render/` is empty.
//
//   • AND SINCE CYCLE 67 IT IS A PURE STATEMENT ABOUT RANGE (amendments
//     171-175). A hull's reflectivity is its MATERIAL and nothing else, so
//     EVERY hull crosses red→blue at 7/8 intel range — every class, every
//     aspect. What used to be pinned here as "the mid hull crosses at the rung
//     and a battleship broadside stays red past the rim" was the fit's old
//     `ext` term talking, and that term was an aspect DOUBLE-COUNT against the
//     coverage mask. Class and aspect still read; they read off the SIZE of the
//     mark, which is pinned in radarHeatmap.test.ts and radarMarch.test.ts
//     where masks actually exist.
//
//   • THE FLOORS SURVIVE THE PHYSICS (amendment 127). `minPeak` no longer binds
//     anywhere inside the scope — uniform steel clears it at every range out to
//     the rim — but it is still the guarantee that radar range means ONE number
//     for every hull, so it is asserted directly rather than trusted to the
//     curve, and its worst-draw bound is re-proved at the shipped envelope
//     (amendment 135). "Signature becomes stealth" remains a RULED-OUT design.
//
//   • HEIGHT IS REFLECTIVITY, CLAMPED AT BOTH ENDS (amendment 129).

import { describe, it, expect } from 'vitest';
import { CONFIG } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import {
  POINT,
  SURFACE,
  VOLUME,
  attenuation,
  fitGrainScale,
  fitMaterialRef,
  fitPointRef,
  heightReflectivity,
  noiseAmplitude,
  worstDrawIntensity,
} from '../render/radarFalloff.js';
import { hullSample } from '../render/radarField.js';
import { returnStrength } from '../render/radarMarch.js';

const CFG = CLIENT_CONFIG.blip.heatmap;
const MODEL = CFG.model;
const BANDS = CFG.bands;
const RED = BANDS[2].at;
const GREEN = BANDS[0].at;
const BLUE = BANDS[1].at;
const RIM = CONFIG.vision.radar; // 8/8 — 660u
const CROSS = CONFIG.vision.farRadar; // 7/8 — 577.5u
const REACH = CONFIG.vision.muzzleFlash; // 5/8 — 412.5u, the wake's reach

/**
 * A HULL'S READING at a range — the model's own two seams composed, which is
 * exactly what the march does per sample.
 *
 * IT TAKES NO HULL, AND THAT IS THE CYCLE-67 RULING IN THE SIGNATURE
 * (amendments 171-175). `hullSample` used to take an aspect-projected extent;
 * colour is now MATERIAL and RANGE only, so range is the only argument there is
 * left to pass. Every assertion below that would once have needed a class and an
 * aspect now needs neither, which is the point rather than a convenience.
 */
function hullPeak(dist: number): number {
  return returnStrength(hullSample(MODEL), dist);
}

/**
 * CYCLE 52's SHIPPED CURVE, RE-IMPLEMENTED HERE AND ONLY HERE.
 *
 * `rangeAttenuation` is retired from production (its `attenHalfRange` knob went
 * with it), so this is the independent A/B reference that makes "the model at
 * `n = 1` IS the old behaviour" a proof rather than a claim.
 */
function shippedCurve(dist: number, ref: number, floor: number): number {
  return floor + (1 - floor) / (1 + Math.max(0, dist) / ref);
}

// --- 1. the exponents are the geometry ------------------------------------------

describe('the falloff exponent is chosen by the target GEOMETRY (amendment 106)', () => {
  it('pins the three ratified exponents', () => {
    expect(POINT).toBe(4);
    expect(SURFACE).toBe(3);
    expect(VOLUME).toBe(2);
  });

  it('and their ORDERING is what makes the taxonomy emergent: a hull fades '
    + 'fastest, a squall slowest', () => {
    // Same reference, same floor, same range — only the geometry differs. If
    // this ordering ever inverts, sea clutter stops hugging the ship and the
    // storm stops being legible across the map, whatever the coefficients say.
    const at = (n: number): number => attenuation(700, 500, n, 0);
    expect(at(POINT)).toBeLessThan(at(SURFACE));
    expect(at(SURFACE)).toBeLessThan(at(VOLUME));
  });
});

describe('the curve is the shipped one, generalized', () => {
  it('n = 1 reproduces cycle 52\'s `rangeAttenuation` EXACTLY', () => {
    for (const floor of [0, 0.02, 0.45, 0.9]) {
      for (const ref of [1, 165, 330, 558.5, 5000]) {
        for (const d of [0, 1, 7.5, 100, 330, 660, 1e4]) {
          expect(attenuation(d, ref, 1, floor), `d=${d} ref=${ref} floor=${floor}`)
            .toBeCloseTo(shippedCurve(d, ref, floor), 12);
        }
      }
    }
  });

  it('is STRICTLY decreasing at every exponent — two ranges never attenuate '
    + 'identically (amendment 64)', () => {
    for (const n of [POINT, SURFACE, VOLUME]) {
      let prev = Infinity;
      for (let d = 0; d <= 1200; d += 3) {
        const v = attenuation(d, 400, n, 0.02);
        expect(v, `n=${n} d=${d}`).toBeLessThan(prev);
        prev = v;
      }
    }
  });

  it('starts at 1 and approaches the floor as an ASYMPTOTE, never reaching it', () => {
    for (const n of [POINT, SURFACE, VOLUME]) {
      expect(attenuation(0, 400, n, 0.05)).toBe(1);
      expect(attenuation(1e6, 400, n, 0.05)).toBeGreaterThan(0.05);
      expect(attenuation(1e6, 400, n, 0.05)).toBeLessThan(0.0501);
    }
  });

  it('answers a finite number for every degenerate input — a NaN would win or '
    + 'lose every `writeCell` silently', () => {
    for (const n of [POINT, SURFACE, VOLUME]) {
      expect(attenuation(Number.NaN, 400, n, 0.05)).toBe(1); // NaN distance -> 0u
      expect(attenuation(-50, 400, n, 0.05)).toBe(1);
      expect(attenuation(100, 0, n, 0.05)).toBe(1); // no reference: no attenuation
      expect(attenuation(100, Number.NaN, n, 0.05)).toBe(1);
      expect(Number.isFinite(attenuation(100, 400, n, Number.NaN))).toBe(true);
    }
  });
});

// --- 2. THE CALIBRATION (amendment 118) -----------------------------------------

describe('the red→blue crossover EMERGES at 7/8 intel range, for EVERY hull', () => {
  it('the fit is solved, not typed in — and it moves with `farRadar`', () => {
    expect(MODEL.pointRef).toBeGreaterThan(0);
    expect(MODEL.pointRef).toBeCloseTo(
      fitPointRef({ crossover: CROSS, band: RED, coef: MODEL.ship, floor: MODEL.pointFloor }),
      12,
    );
    // Retuning the rung retunes the reference, with no other edit anywhere.
    const wider = fitPointRef({
      crossover: CROSS * 1.2,
      band: RED,
      coef: MODEL.ship,
      floor: MODEL.pointFloor,
    });
    expect(wider).toBeCloseTo(MODEL.pointRef * 1.2, 6);
  });

  it('the fit takes NO HULL — so the crossover cannot be a statement about one '
    + 'class at one aspect (amendments 171-175)', () => {
    // The structural half of the ruling, pinned at the seam rather than
    // inferred from readings: `hullSample` is a function of the MODEL alone, so
    // there is no argument a class or an aspect could enter through. The
    // behavioural half — same register, different SIZE — needs real masks and
    // lives in radarHeatmap.test.ts.
    expect(hullSample(MODEL).refl).toBe(MODEL.ship);
    expect(hullSample.length, '`hullSample(m)` — one argument, the model').toBe(1);
    expect(fitPointRef.length).toBe(1);
    for (const k of ['ext', 'strongExtent']) {
      expect(MODEL, `\`${k}\` is deleted, not merely unread`).not.toHaveProperty(k);
    }
  });

  it('RULE 1 — a hull lands EXACTLY on the red→blue boundary at '
    + `${CROSS}u`, () => {
    expect(hullPeak(CROSS)).toBeCloseTo(RED, 9);
  });

  it('RULE 2 — and reads RED everywhere inside that, out to the hull itself', () => {
    for (let d = 0; d < CROSS; d += 0.5) {
      expect(hullPeak(d), `${d}u`).toBeGreaterThanOrEqual(RED);
    }
    expect(hullPeak(0), 'a hull at zero range saturates the scale').toBe(1);
  });

  it('RULE 3 — and BLUE from there to the 660u rim, never green', () => {
    for (let d = CROSS + 0.5; d <= RIM; d += 0.5) {
      const peak = hullPeak(d);
      expect(peak, `${d}u`).toBeGreaterThanOrEqual(BLUE);
      expect(peak, `${d}u`).toBeLessThan(RED);
    }
  });

  it('RULE 4 — and BOTH registers hold at the worst AND best draw of the shipped '
    + 'envelope, so the read never flickers across a band (amendment 135)', () => {
    // The grain is zero at or above `solidAt`, which is pinned to RED itself, so
    // the whole red half is steady by construction. Only the blue half can
    // wobble, and it must not wobble across either boundary.
    for (let d = CROSS + 0.5; d <= RIM; d += 0.5) {
      const peak = hullPeak(d);
      const amp = noiseAmplitude(peak, CFG.noise);
      expect(peak * (1 + amp), `${d}u luckiest draw`).toBeLessThan(RED);
      expect(peak * (1 - amp), `${d}u unluckiest draw`).toBeGreaterThan(BLUE);
    }
    expect(noiseAmplitude(hullPeak(CROSS), CFG.noise), 'the crossover itself is grain-free').toBe(0);
  });

  it('and the crossover is a CONSEQUENCE of the curve — the return crosses the '
    + 'boundary once, at that range, on a continuous sweep', () => {
    let crossedAt = -1;
    let crossings = 0;
    let prev = hullPeak(0);
    for (let d = 1; d <= RIM; d += 0.5) {
      const v = hullPeak(d);
      if (prev >= RED && v < RED) {
        crossings++;
        crossedAt = d;
      }
      prev = v;
    }
    expect(crossings, 'exactly one red→blue transition').toBe(1);
    // Within one sweep step of the rung — the transition is detected on the
    // first sample PAST it, so it can never land below `CROSS`.
    expect(Math.abs(crossedAt - CROSS), `crossed at ${crossedAt}u`).toBeLessThanOrEqual(0.5);
  });
});

describe('the floors survive the physics (amendment 127)', () => {
  it('NOTHING THE SERVER BLIPS PAINTS NOTHING: every range inside the scope '
    + 'clears the transparency threshold at the WORST draw', () => {
    for (let d = 0; d <= RIM; d += 5) {
      const peak = hullPeak(d);
      expect(peak, `${d}u`).toBeGreaterThanOrEqual(MODEL.minPeak);
      expect(peak * (1 - noiseAmplitude(peak, CFG.noise)), `${d}u worst draw`)
        .toBeGreaterThan(GREEN);
    }
  });

  it('and `minPeak` is still a real floor rather than a vestige — it catches the '
    + 'curve once the material alone would fall under it', () => {
    // Uniform steel clears `minPeak` everywhere inside the scope, so the floor
    // stops binding in normal play — that is the RULING landing, not the floor
    // going away. It still engages, and the range where it takes over is
    // OBSERVED here rather than asserted, so a retune moves the number instead
    // of breaking the test.
    let bindsAt = Infinity;
    for (let d = 0; d <= 4000; d += 1) {
      if (hullPeak(d) <= MODEL.minPeak) {
        bindsAt = d;
        break;
      }
    }
    expect(bindsAt, 'the floor engages somewhere').toBeLessThan(4000);
    expect(bindsAt, 'and only well OUTSIDE the scope').toBeGreaterThan(RIM);
    expect(hullPeak(1e6), 'and it holds all the way out').toBe(MODEL.minPeak);
  });

  it('aspect no longer changes the register — colour is MATERIAL and RANGE '
    + '(amendments 171-175)', () => {
    // REPLACES the cycle-61 pin "a bow-on hull reads far weaker than the same
    // hull abeam at the same range", which asserted the aspect DOUBLE-COUNT as
    // correct and would have defended it against this fix (the pattern named in
    // amendment 169). A ship's RCS is dominated by corner reflectors and is
    // large from every aspect; the mask, not the colour, is where aspect lives.
    // There is now no aspect ARGUMENT to vary — so the pin is that two ranges
    // differ and nothing else can.
    expect(hullPeak(480)).toBe(hullPeak(480));
    expect(hullPeak(480)).toBeGreaterThan(hullPeak(600));
  });
});

// --- 3. the fit's own edges -----------------------------------------------------

describe('a degenerate fit answers the crossover rather than a garbage range', () => {
  const base = { crossover: CROSS, band: RED, coef: 1, floor: 0.02 };

  it('when the material cannot reach the band at that range under that floor', () => {
    // floor above the required attenuation: unreachable at ANY range.
    expect(fitPointRef({ ...base, floor: 0.9 })).toBe(CROSS);
    // required attenuation above 1: too weak a material to ever read red.
    expect(fitPointRef({ ...base, coef: 0.5 })).toBe(CROSS);
  });

  it('and when an input is zero or non-finite', () => {
    expect(fitPointRef({ ...base, crossover: 0 })).toBe(1);
    expect(fitPointRef({ ...base, coef: 0 })).toBe(CROSS);
    expect(fitPointRef({ ...base, coef: Number.NaN })).toBe(CROSS);
    expect(Number.isFinite(fitPointRef({ ...base, band: Number.NaN }))).toBe(true);
  });
});

// --- 3b. THE SNR NOISE ENVELOPE (cycle 62, amendment 143) -----------------------
//
// The third term of the model, and a CORRECTION rather than a retune: cycle 61's
// flat ±30% put static in the interior of a landmass, which is the one place a
// real scope is rock-steady, and smeared intensity off the iso-height lines the
// colour bands are meant to land on. Amplitude now falls with signal.

describe('grain amplitude is a function of the return\'s own strength', () => {
  const ENV = CFG.noise;

  it('largest at zero signal, exactly zero at saturation, and never negative', () => {
    expect(noiseAmplitude(0, ENV)).toBeCloseTo(ENV.amount, 12);
    expect(noiseAmplitude(ENV.solidAt, ENV)).toBe(0);
    for (const i of [ENV.solidAt, ENV.solidAt + 0.1, 1, 1e6]) {
      expect(noiseAmplitude(i, ENV), `past saturation at ${i}`).toBe(0);
    }
  });

  it('and falls MONOTONICALLY in between, so grainier always means weaker', () => {
    let prev = Infinity;
    for (let i = 0; i <= 1; i += 0.01) {
      const a = noiseAmplitude(i, ENV);
      expect(a).toBeLessThanOrEqual(prev + 1e-12);
      expect(a).toBeGreaterThanOrEqual(0);
      prev = a;
    }
  });

  it('THE REGISTERS, at the shipped envelope: a red return is solid, a threshold '
    + 'return is heavily grained', () => {
    expect(noiseAmplitude(RED, ENV), 'red is rock steady').toBe(0);
    expect(noiseAmplitude(BLUE, ENV), 'blue is lightly textured').toBeGreaterThan(0.2);
    expect(noiseAmplitude(GREEN, ENV), 'green crawls').toBeGreaterThan(0.35);
    expect(noiseAmplitude(GREEN, ENV)).toBeGreaterThan(noiseAmplitude(BLUE, ENV));
  });

  it('a degenerate envelope answers 0 (perfectly solid), never NaN', () => {
    for (const env of [
      { amount: 0, solidAt: 0.7 },
      { amount: -1, solidAt: 0.7 },
      { amount: 0.45, solidAt: 0 },
      { amount: Number.NaN, solidAt: 0.7 },
      { amount: 0.45, solidAt: Number.NaN },
    ]) {
      expect(noiseAmplitude(0.3, env)).toBe(0);
    }
    expect(Number.isFinite(noiseAmplitude(Number.NaN, ENV))).toBe(true);
  });
});

// --- 3b. THE WAKE CORRIDOR (Story 4.12, amendments 198 + 203) -------------------
//
// The wake material is the first thing on this scope calibrated between TWO
// rails at once, and the second thing whose reference range is SOLVED rather than
// typed. Everything below is stated against a locally re-implemented envelope
// (the `radarHeatmap.test.ts` pattern) so a shape change in the production one
// fails HERE rather than silently re-deriving every bound to whatever the new
// shape happens to permit.

describe('the wake material is SOLVED between two rails (amendment 203)', () => {
  const ENV = CFG.noise;
  /** The envelope, re-implemented from the RULING (amendment 143 + 203's scale). */
  const amp = (p: number, scale = 1): number =>
    p >= ENV.solidAt || !(scale > 0) ? 0 : scale * ENV.amount * (1 - Math.max(0, p) / ENV.solidAt);
  /** The UNLUCKIEST draw of a pre-grain intensity, and the LUCKIEST. Named for
   *  the draw rather than for the outcome: which one is the "worst case" depends
   *  on which rail is being defended, and this suite defends both. */
  const unlucky = (p: number, scale = 1): number => p * (1 - amp(p, scale));
  const lucky = (p: number, scale = 1): number => p * (1 + amp(p, scale));
  /** The pre-grain intensity of fresh wake water at a range. */
  const wakeAt = (d: number): number =>
    MODEL.wake * attenuation(d, MODEL.wakeRef, SURFACE, MODEL.floor);

  it('the scaled envelope agrees with production, and scale 1 is the AMBIENT one '
    + 'bit for bit — every pre-4.12 caller is untouched', () => {
    for (let p = -0.2; p <= 1.2; p += 0.017) {
      expect(noiseAmplitude(p, ENV), `ambient at ${p.toFixed(3)}`).toBe(noiseAmplitude(p, ENV, 1));
      for (const s of [0.25, MODEL.wakeGrain, 1, 2]) {
        expect(noiseAmplitude(p, ENV, s), `scale ${s} at ${p.toFixed(3)}`).toBeCloseTo(amp(p, s), 12);
      }
    }
    expect(noiseAmplitude(0.3, ENV, 0), 'a zero scale is NO grain').toBe(0);
    expect(noiseAmplitude(0.3, ENV, Number.NaN), 'and so is a non-finite one').toBe(0);
  });

  it('`worstDrawIntensity` INVERTS the worst draw — the quantity both the reach '
    + 'fit and the age ladder are stated in', () => {
    for (const s of [MODEL.wakeGrain, 0.5, 1]) {
      for (const band of [0.05, GREEN, 0.3]) {
        expect(unlucky(worstDrawIntensity(band, ENV, s), s), `band ${band} scale ${s}`)
          .toBeCloseTo(band, 12);
      }
    }
    expect(worstDrawIntensity(GREEN, ENV, 0), 'no grain: the band itself').toBe(GREEN);
  });

  it('RAIL 1 — EVERY DRAW OF FRESH WATER LIGHTS, from the antenna out to the '
    + 'reach: that CONTINUITY is what makes a track read as a line', () => {
    for (let d = 0; d <= REACH; d += 2.5) {
      expect(unlucky(wakeAt(d), MODEL.wakeGrain), `${d}u unluckiest draw`)
        .toBeGreaterThanOrEqual(GREEN - 1e-12);
    }
  });

  it('RAIL 2 — NO DRAW OUTRANKS THE FAINTEST LEGITIMATE ECHO, at the luckiest '
    + 'wake draw against the unluckiest hull draw (clutter\'s third bound, '
    + 'applied to the material that shares a sweep with a hull\'s own faintest '
    + 'cell)', () => {
    // Attenuation is <= 1 everywhere, so the coefficient IS the peak.
    expect(lucky(MODEL.wake, MODEL.wakeGrain)).toBeLessThan(unlucky(MODEL.minPeak));
    for (let d = 0; d <= RIM; d += 5) {
      expect(lucky(wakeAt(d), MODEL.wakeGrain), `${d}u`).toBeLessThan(unlucky(MODEL.minPeak));
    }
  });

  it('and it is GREEN at every range and every draw — a wake is never blue', () => {
    expect(lucky(MODEL.wake, MODEL.wakeGrain)).toBeLessThan(BLUE);
  });

  it('THE REACH IS DERIVED ONTO THE LADDER: the worst draw crosses `bands[0].at` '
    + `EXACTLY at the 5/8 rung (${REACH}u), and frays out beyond it`, () => {
    expect(unlucky(wakeAt(REACH), MODEL.wakeGrain)).toBeCloseTo(GREEN, 12);
    // Inside: every cell lights. Outside: the draw window slides under, so the
    // lit FRACTION falls — which is the fade, emergent rather than drawn.
    expect(unlucky(wakeAt(REACH - 50), MODEL.wakeGrain)).toBeGreaterThan(GREEN);
    expect(unlucky(wakeAt(REACH + 50), MODEL.wakeGrain)).toBeLessThan(GREEN);
    expect(lucky(wakeAt(RIM), MODEL.wakeGrain), 'and nothing at all lights at the rim')
      .toBeLessThan(GREEN);
  });

  it('the reference is SOLVED, not typed in — and it moves with the rung', () => {
    const fit = (reach: number): number => fitMaterialRef({
      reach,
      band: GREEN,
      coef: MODEL.wake,
      floor: MODEL.floor,
      geom: SURFACE,
      env: ENV,
      grainScale: MODEL.wakeGrain,
    });
    expect(MODEL.wakeRef).toBeCloseTo(fit(REACH), 9);
    // Retuning the rung retunes the reference proportionally, with no other edit
    // anywhere — the same property `fitPointRef` is pinned on.
    expect(fit(REACH * 1.2)).toBeCloseTo(MODEL.wakeRef * 1.2, 6);
  });

  it('the GRAIN SCALE is solved as half the feasibility ceiling — the corridor '
    + 'is INFEASIBLE at ambient grain, which is why the scale exists', () => {
    const hi = unlucky(MODEL.minPeak);
    expect(MODEL.wakeGrain).toBeCloseTo(
      fitGrainScale({ coef: MODEL.wake, lo: GREEN, hi, env: ENV, safety: 0.5 }),
      12,
    );
    // The ceiling: the largest amplitude both rails admit at this coefficient.
    const ceiling = Math.min(hi / MODEL.wake - 1, 1 - GREEN / MODEL.wake);
    expect(amp(MODEL.wake, MODEL.wakeGrain), 'half the ceiling — a 2x margin')
      .toBeCloseTo(0.5 * ceiling, 12);
    expect(amp(MODEL.wake), 'and AMBIENT grain is far outside it')
      .toBeGreaterThan(ceiling * 4);
  });

  it('the coefficient is the corridor MIDPOINT, so one scale buys the same '
    + 'relative margin against both rails', () => {
    const hi = unlucky(MODEL.minPeak);
    expect(MODEL.wake).toBeCloseTo((GREEN + hi) / 2, 12);
    expect(hi / MODEL.wake - 1).toBeCloseTo(1 - GREEN / MODEL.wake, 12);
  });

  it('AGE IS THE SAME COIN AS RANGE: end-of-life water reads exactly as fresh '
    + 'water does at the reach, so the visible track SHORTENS to nothing', () => {
    expect(MODEL.wakeAgeFloor).toBeGreaterThan(0);
    expect(MODEL.wakeAgeFloor).toBeLessThan(1);
    const oldest = MODEL.wake * MODEL.wakeAgeFloor;
    expect(unlucky(oldest, MODEL.wakeGrain), 'the oldest bucket sits ON the threshold at zero range')
      .toBeCloseTo(GREEN, 12);
    expect(oldest).toBeCloseTo(wakeAt(REACH), 12);
    // Structural, not a ramp: it moves the reach, and it can never brighten.
    expect(oldest).toBeLessThan(MODEL.wake);
  });

  it('a degenerate material fit answers the reach rather than a garbage range', () => {
    const base = {
      reach: REACH,
      band: GREEN,
      coef: MODEL.wake,
      floor: MODEL.floor,
      geom: SURFACE,
      env: ENV,
      grainScale: MODEL.wakeGrain,
    };
    for (const bad of [
      { ...base, coef: 0 },
      { ...base, reach: 0 },
      { ...base, reach: Number.NaN },
      { ...base, coef: GREEN / 2 }, // cannot reach the band at any range
      { ...base, floor: 0.5 }, // the floor is already above the target
      { ...base, band: 1 }, // needs attenuation > 1
    ]) {
      const r = fitMaterialRef(bad);
      expect(Number.isFinite(r), JSON.stringify({ coef: bad.coef, reach: bad.reach })).toBe(true);
      expect(r).toBeGreaterThan(0);
    }
  });

  it('a degenerate grain fit answers 0 (no grain) rather than a negative scale', () => {
    const base = { coef: MODEL.wake, lo: GREEN, hi: unlucky(MODEL.minPeak), env: ENV, safety: 0.5 };
    for (const bad of [
      { ...base, coef: 0 },
      { ...base, safety: 0 },
      { ...base, hi: base.lo }, // an empty corridor
      { ...base, coef: 1 }, // the coefficient sits outside the corridor
      { ...base, env: { amount: 0, solidAt: RED } },
    ]) {
      expect(fitGrainScale(bad)).toBe(0);
    }
  });
});

// --- 4. height reflectivity (amendment 129) -------------------------------------

describe('terrain height is a reflectivity coefficient, clamped at both ends', () => {
  it('sea level reads flat, `refHeight` and above reads steep', () => {
    expect(heightReflectivity(0, MODEL)).toBe(MODEL.landFlat);
    expect(heightReflectivity(MODEL.refHeight, MODEL)).toBeCloseTo(MODEL.landSteep, 12);
    expect(heightReflectivity(255, MODEL), 'the raster maximum clamps').toBeCloseTo(
      MODEL.landSteep,
      12,
    );
  });

  it('and rises monotonically between them', () => {
    let prev = -Infinity;
    for (let h = 0; h <= 255; h++) {
      const v = heightReflectivity(h, MODEL);
      expect(v).toBeGreaterThanOrEqual(prev);
      expect(v).toBeGreaterThanOrEqual(MODEL.landFlat);
      expect(v).toBeLessThanOrEqual(MODEL.landSteep);
      prev = v;
    }
  });

  it('a negative or non-finite sample lands on the FLAT end, never on NaN', () => {
    expect(heightReflectivity(-5, MODEL)).toBe(MODEL.landFlat);
    expect(heightReflectivity(Number.NaN, MODEL)).toBe(MODEL.landFlat);
  });

  it('a zero `refHeight` degrades to the steep coefficient (the pre-4.10 fill), '
    + 'not to a division by zero', () => {
    expect(heightReflectivity(30, { ...MODEL, refHeight: 0 })).toBe(MODEL.landSteep);
  });

  it('THE POINT OF THE CHANNEL: a steep headland and a low mudflat of identical '
    + 'geometry do not paint the same', () => {
    expect(heightReflectivity(200, MODEL)).toBeGreaterThan(heightReflectivity(5, MODEL) * 2);
  });
});
