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
//     on a paint path — `grep -rn farRadar client/src/render/` is empty, and
//     the four readings below are what the fit is actually judged on.
//
//   • THE FLOORS SURVIVE THE PHYSICS (amendment 127). 1/d⁴ is steep enough that
//     a small hull bow-on at the rim would genuinely vanish — "signature becomes
//     stealth" — and that is a RULED-OUT design, not a missing feature. The
//     asymptote and `minPeak` are both asserted here, at the rim, on the
//     weakest legitimate return in the game.
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
  fitPointRef,
  heightReflectivity,
} from '../render/radarFalloff.js';
import { shipPeak } from '../render/radarHeatmap.js';

const CFG = CLIENT_CONFIG.blip.heatmap;
const MODEL = CFG.model;
const BANDS = CFG.bands;
const RED = BANDS[2].at;
const GREEN = BANDS[0].at;
const BLUE = BANDS[1].at;
const RIM = CONFIG.vision.radar; // 8/8 — 660u
const CROSS = CONFIG.vision.farRadar; // 7/8 — 577.5u
/** The calibration hull: a Mine Layer presented broadside (amendment 131). */
const MID_HULL = CONFIG.shipClasses.mineLayer.hull.length;
/** A battleship presented broadside — the biggest RCS on the water. */
const BIG_HULL = CONFIG.shipClasses.battleship.hull.length;

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

describe('the red→blue crossover EMERGES at 7/8 intel range', () => {
  it('the fit is solved, not typed in — and it moves with `farRadar`', () => {
    expect(MODEL.pointRef).toBeGreaterThan(0);
    expect(MODEL.pointRef).toBeCloseTo(
      fitPointRef({
        crossover: CROSS,
        ext: MID_HULL,
        strongExtent: CFG.ship.strongExtent,
        band: RED,
        coef: MODEL.ship,
        floor: CFG.ship.attenFloor,
      }),
      12,
    );
    // Retuning the rung retunes the reference, with no other edit anywhere.
    const wider = fitPointRef({
      crossover: CROSS * 1.2,
      ext: MID_HULL,
      strongExtent: CFG.ship.strongExtent,
      band: RED,
      coef: MODEL.ship,
      floor: CFG.ship.attenFloor,
    });
    expect(wider).toBeCloseTo(MODEL.pointRef * 1.2, 6);
  });

  it('READING 1 — the mid hull lands EXACTLY on the red→blue boundary at '
    + `${CROSS}u`, () => {
    expect(shipPeak(MID_HULL, CROSS, CFG)).toBeCloseTo(RED, 9);
  });

  it('READING 2 — and saturates red well inside the rim', () => {
    expect(shipPeak(MID_HULL, 330, CFG)).toBe(1);
    // Find where it saturates, so the number is observed rather than asserted.
    let sat = 0;
    for (let d = 0; d <= RIM; d += 1) if (shipPeak(MID_HULL, d, CFG) >= 1) sat = d;
    expect(sat, 'saturation range (u)').toBeGreaterThan(400);
    expect(sat).toBeLessThan(CROSS);
  });

  it('READING 3 — and still reads BLUE at the 660u rim (not green, not red)', () => {
    const peak = shipPeak(MID_HULL, RIM, CFG);
    expect(peak).toBeGreaterThanOrEqual(BLUE);
    expect(peak).toBeLessThan(RED);
  });

  it('READING 4 — a battleship broadside still reads RED at the rim: a larger '
    + 'RCS legitimately reaches further (amendment 68)', () => {
    expect(shipPeak(BIG_HULL, RIM, CFG)).toBeGreaterThanOrEqual(RED);
  });

  it('and the crossover is a CONSEQUENCE of the curve — the peak crosses the '
    + 'boundary once, at that range, on a continuous sweep', () => {
    let crossedAt = -1;
    let crossings = 0;
    let prev = shipPeak(MID_HULL, 0, CFG);
    for (let d = 1; d <= RIM; d += 0.5) {
      const v = shipPeak(MID_HULL, d, CFG);
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
  it('a `minExtent` needle at the rim falls to `minPeak` and STILL PAINTS green', () => {
    const peak = shipPeak(CFG.ship.minExtent, RIM, CFG);
    expect(peak).toBe(CFG.ship.minPeak);
    expect(peak * (1 - CFG.noise), 'even at the worst noise draw').toBeGreaterThan(GREEN);
  });

  it('and so does a ZERO-extent return — nothing inside radar range paints '
    + 'nothing, at any aspect, at any size', () => {
    for (const d of [1, 330, RIM, RIM * 2]) {
      expect(shipPeak(0, d, CFG), `${d}u`).toBe(CFG.ship.minPeak);
    }
  });

  it('but aspect still MATTERS: a bow-on hull reads far weaker than the same '
    + 'hull abeam at the same range', () => {
    const beam = CONFIG.shipClasses.mineLayer.hull.beam;
    expect(shipPeak(beam, 480, CFG)).toBeLessThan(shipPeak(MID_HULL, 480, CFG));
  });
});

// --- 3. the fit's own edges -----------------------------------------------------

describe('a degenerate fit answers the crossover rather than a garbage range', () => {
  const base = {
    crossover: CROSS,
    ext: MID_HULL,
    strongExtent: 60,
    band: RED,
    coef: 1,
    floor: 0.02,
  };

  it('when the hull cannot reach the band at that range under that floor', () => {
    // floor above the required attenuation: unreachable at ANY range.
    expect(fitPointRef({ ...base, floor: 0.9 })).toBe(CROSS);
    // required attenuation above 1: the hull is too small to ever read red.
    expect(fitPointRef({ ...base, ext: 1 })).toBe(CROSS);
  });

  it('and when an input is zero or non-finite', () => {
    expect(fitPointRef({ ...base, crossover: 0 })).toBe(1);
    expect(fitPointRef({ ...base, ext: 0 })).toBe(CROSS);
    expect(fitPointRef({ ...base, coef: 0 })).toBe(CROSS);
    expect(fitPointRef({ ...base, strongExtent: 0 })).toBe(CROSS);
    expect(Number.isFinite(fitPointRef({ ...base, band: Number.NaN }))).toBe(true);
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
