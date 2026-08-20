// sim/spread.ts — THE straddle rule, shared by the BROADSIDE BARRAGE's angular
// fan (R2.3) and BARREL's parallel tracks (R2.16). Both sides call these: the
// server resolves the shells, the client draws one preview line + burst circle
// per shell, so a second derivation on either side is exactly the class of
// desync sim/aim.ts was promoted to prevent.
//
// The behaviour Eric ruled, stated as properties rather than per-count cases:
// an ODD count puts one shell EXACTLY on the click ("One shell will
// *absolutely* hit at the target point"), an EVEN count straddles it with NONE
// on it ("when there are 4 turrets specifically, there is no middle turret"),
// and the shells are evenly spaced across the full fan.

import { describe, it, expect } from 'vitest';
import { CONFIG, effectiveStats, fanBearings, fanTargets, parallelOffsets, straddleOffsets } from '../index.js';

const deg = (d: number): number => (d * Math.PI) / 180;

describe('straddleOffsets — the one ladder', () => {
  it('an ODD count includes an exact 0; an EVEN count never does', () => {
    for (const n of [1, 3, 5, 7]) expect(straddleOffsets(n, 4), `${n}`).toContain(0);
    for (const n of [2, 4, 6]) expect(straddleOffsets(n, 4), `${n}`).not.toContain(0);
  });

  it('is symmetric about zero and evenly spaced at `step`', () => {
    for (const n of [1, 2, 3, 4, 5]) {
      const out = straddleOffsets(n, 3);
      expect(out, `${n}`).toHaveLength(n);
      expect(out.reduce((a, b) => a + b, 0), `${n}`).toBeCloseTo(0, 12); // symmetric
      for (let i = 1; i < out.length; i += 1) expect(out[i] - out[i - 1], `${n}`).toBeCloseTo(3, 12);
    }
  });

  it('degenerate counts are safe: 0/negative/NaN give nothing, 1 gives dead centre', () => {
    expect(straddleOffsets(0, 5)).toEqual([]);
    expect(straddleOffsets(-3, 5)).toEqual([]);
    expect(straddleOffsets(Number.NaN, 5)).toEqual([]);
    expect(straddleOffsets(1, 5)).toEqual([0]);
    // A non-finite STEP still fires the right number of shells, all on the
    // bearing, rather than emitting NaN positions into the sim.
    expect(straddleOffsets(3, Number.NaN)).toEqual([0, 0, 0]);
  });
});

describe('fanBearings — the broadside fan (R2.3)', () => {
  it('the extremes sit at exactly ±halfAngle and the shells are evenly spaced across it', () => {
    const b = fanBearings(1, 5, deg(12));
    expect(b).toHaveLength(5);
    expect(b[0]).toBeCloseTo(1 - deg(12), 12);
    expect(b[4]).toBeCloseTo(1 + deg(12), 12);
    expect(b[2]).toBeCloseTo(1, 12); // odd count: the middle shell IS the click
    for (let i = 1; i < b.length; i += 1) expect(b[i] - b[i - 1]).toBeCloseTo(deg(6), 12);
  });

  it('THE STRADDLE RULE at the three reachable turret counts (3 base, 4, 5 maxed)', () => {
    const half = deg(12);
    // 3 turrets — odd: one shell absolutely on the click.
    expect(fanBearings(0, 3, half).filter((x) => Math.abs(x) < 1e-12)).toHaveLength(1);
    // 4 turrets — EVEN: the two centre shells straddle, none on the bearing.
    const four = fanBearings(0, 4, half);
    expect(four.filter((x) => Math.abs(x) < 1e-12)).toHaveLength(0);
    expect(four[1]).toBeCloseTo(-four[2], 12);
    // 5 turrets — odd again, the middle shell is back on the click.
    expect(fanBearings(0, 5, half).filter((x) => Math.abs(x) < 1e-12)).toHaveLength(1);
  });

  it('a single shell flies exactly on the bearing whatever the fan width', () => {
    expect(fanBearings(2.5, 1, deg(30))).toEqual([2.5]);
  });
});

describe('fanTargets — every shell ends at the CLICK\'S RANGE (an arc, not a cone)', () => {
  const origin = { x: 100, y: -40 };
  const target = { x: 400, y: -40 }; // 300u due east

  it('every target point is the same distance from the ship as the click', () => {
    for (const p of fanTargets(origin, target, 5, deg(12))) {
      expect(Math.hypot(p.x - origin.x, p.y - origin.y)).toBeCloseTo(300, 9);
    }
  });

  it('an ODD count puts one shell EXACTLY on the clicked point', () => {
    const pts = fanTargets(origin, target, 3, deg(12));
    expect(pts[1].x).toBeCloseTo(target.x, 9);
    expect(pts[1].y).toBeCloseTo(target.y, 9);
    // ...and an EVEN count puts none there, straddling it instead.
    const four = fanTargets(origin, target, 4, deg(12));
    for (const p of four) expect(Math.hypot(p.x - target.x, p.y - target.y)).toBeGreaterThan(1);
  });

  it('a degenerate click ON the ship centre returns that point, never NaN', () => {
    for (const p of fanTargets(origin, origin, 3, deg(12))) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
      expect(p).toEqual({ x: origin.x, y: origin.y });
    }
  });

  it('the LIVE fan width comes from effectiveStats, tightening as SPREAD stacks', () => {
    const wide = effectiveStats(CONFIG.shipClasses.battleship).broadside;
    const pts = fanTargets(origin, target, wide.turrets, wide.fanHalfAngleRad);
    expect(pts).toHaveLength(3);
    // The widest and tightest reachable patterns, measured as the arc the
    // extreme shells span — this is the "spread, then parallel-ish, then near
    // the clicked point" progression Eric described, in units.
    const span = (halfAngle: number): number => {
      const [a, , c] = fanTargets(origin, target, 3, halfAngle);
      return Math.hypot(c.x - a.x, c.y - a.y);
    };
    const tightest = (CONFIG.broadside.fanHalfAngleDeg[4] * Math.PI) / 180;
    // SPREAD still tightens meaningfully...
    expect(span(wide.fanHalfAngleRad)).toBeGreaterThan(span(tightest) * 1.5);
    // ...but the ladder must NOT tighten so far that it removes the need to
    // catch a hull broadside-on. This pins ERIC'S OWN CONSTRAINT on the weapon
    // — *"you definitely can't hit a single ship with all the shots from this
    // unless they are close and exposing their broadside to you"* — rather than
    // an arbitrary ratio, which is what the retired `* 3` was.
    //
    // The measure is the pattern's SPAN against how much of it one hull can
    // catch: its silhouette plus a burst radius either side. A Battleship
    // bow-on shows its 32u BEAM; broadside-on it shows its 124u LENGTH.
    const bs = CONFIG.shipClasses.battleship.hull;
    const burst = CONFIG.broadside.burstRadius;
    // The span grows with FIRING RANGE, so measure it at the weapon's own base
    // reach — the 5/8 rung, derived exactly as clampStats derives it.
    const reachU = CONFIG.vision.radar * CONFIG.vision.muzzleFlashFactor; // 412.5u
    const atTightest = 2 * tightest * reachU;
    expect(atTightest).toBeGreaterThan(bs.beam + 2 * burst); // bow-on CANNOT take them all
    expect(atTightest).toBeLessThan(bs.length + 2 * burst); // broadside-on CAN
    // The retired ladder failed the first clause: its 3° cap spanned 43.2u at
    // that same reach, NARROWER than a bow-on battleship's 62u catch, so every
    // shell landed regardless of aspect — a guaranteed point strike.
    const retiredCap = (3 * Math.PI) / 180;
    expect(2 * retiredCap * reachU).toBeLessThan(bs.beam + 2 * burst);
  });
});

describe('parallelOffsets — BARREL fires parallel now (R2.16)', () => {
  it('offsets are PERPENDICULAR to the bearing, `spacing` apart, straddling the aim line', () => {
    const out = parallelOffsets(0, 3, 12); // heading +x → offsets on ±y
    for (const v of out) expect(v.x).toBeCloseTo(0, 12);
    expect(out.map((v) => v.y)).toEqual([-12, 0, 12]);
  });

  it('rotates with the bearing (the tracks stay parallel to the shot, not to the world)', () => {
    // Heading +y → offsets on ∓x. TWO barrels straddle at ±spacing/2, because
    // `spacing` is the gap between ADJACENT tracks, not the half-width.
    const out = parallelOffsets(Math.PI / 2, 2, 12);
    expect(out[0].x).toBeCloseTo(6, 9);
    expect(out[1].x).toBeCloseTo(-6, 9);
    for (const v of out) expect(v.y).toBeCloseTo(0, 9);
  });

  it('the STRADDLE rule is the broadside\'s: 1 and 3 barrels centre, 2 straddles', () => {
    const centred = (n: number): number =>
      parallelOffsets(0.7, n, CONFIG.gun.barrelSpacingU).filter((v) => Math.hypot(v.x, v.y) < 1e-12).length;
    expect(centred(1)).toBe(1);
    expect(centred(2)).toBe(0);
    expect(centred(3)).toBe(1);
  });

  it('the band width is CONSTANT with range — the property that makes it parallel, not a fan', () => {
    // The whole point of R2.16: the volley covers the same 24u band at 100u as
    // at 600u, where an angular fan would widen without bound.
    const out = parallelOffsets(0, 3, CONFIG.gun.barrelSpacingU);
    const width = Math.hypot(out[2].x - out[0].x, out[2].y - out[0].y);
    expect(width).toBeCloseTo(2 * CONFIG.gun.barrelSpacingU, 9);
  });
});
