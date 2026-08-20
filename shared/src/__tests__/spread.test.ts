// sim/spread.ts — THE straddle rule, shared by BARREL's parallel tracks
// (R2.16) and the broadside's turret muzzle/mount placement (sim/aim.ts).
// Both sides call these: the server resolves the shells, the client draws one
// preview line + burst circle per shell, so a second derivation on either
// side is exactly the class of desync sim/aim.ts was promoted to prevent.
//
// THE BROADSIDE'S DESIGNED ANGULAR FAN IS GONE (Eric's 2026-08-20 per-turret
// arc ruling): `fanBearings`/`fanTargets` are deleted and their pins retired
// with them — the odd/even SHELL straddle was a property of the designed fan
// and no longer applies to the broadside (every turret that bears fires
// exactly at the click; see aim.test.ts turretAimPoints). BARREL keeps the
// straddle law for its tracks: an ODD barrel count puts one shell EXACTLY on
// the click ("One shell will *absolutely* hit at the target point").

import { describe, it, expect } from 'vitest';
import { CONFIG, parallelOffsets, straddleOffsets } from '../index.js';

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
