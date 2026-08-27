// THE BROADSIDE'S PER-TURRET ARC DISPLAY (render/firing.ts `turretWedges`).
//
// Eric ruling 2026-08-27 (ruling 4): the ±60° twin sector stops being a pair of
// big filled wedges — under the zero-overlap ladder the guns cover only narrow
// slivers of it, so a filled sector promises water no gun can reach. It becomes
// a thin OUTLINE marking the deny boundary, and the aiming information becomes
// ONE WEDGE PER GUN drawn from that gun's real muzzle over its own arc.
//
// These pins guard the ONE thing a render can get quietly wrong here: where the
// wedges come from. They must be the SIM's own geometry (`turretMuzzles` /
// `turretMountBearings`, the same functions `turretAimPoints` calls) evaluated
// at an identity pose, because the `arcs` Graphics is hull-local. A hand-rolled
// even fan would look plausible on screen and lie about which gun can bear.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  effectiveStats,
  resolveBoons,
  turretMountBearings,
  turretMuzzles,
  wrapAngle,
} from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { arcFillStyle, turretWedges } from '../render/firing.js';

const IDENTITY = { x: 0, y: 0, heading: 0 };
const BW = CLIENT_CONFIG.broadsideArcs;

const arcsFor = (...boons: string[]): {
  hullId: 'battleship';
  turrets: number;
  traverseRad: number;
  mountSpreadRad: number;
} => {
  const b = effectiveStats(CONFIG.shipClasses.battleship, resolveBoons(boons)).broadside;
  return { hullId: 'battleship', turrets: b.turrets, traverseRad: b.traverseRad, mountSpreadRad: b.mountSpreadRad };
};
const MAXED = arcsFor('broadsideSpread', 'broadsideSpread', 'broadsideSpread', 'broadsideSpread');

describe('the broadside arc display — one wedge per gun, from the SHARED geometry', () => {
  it('THE ONE-GEOMETRY PIN: every apex is turretMuzzles() and every centre is turretMountBearings()', () => {
    const bs = arcsFor();
    for (const side of [1, -1] as const) {
      const w = turretWedges(side, bs);
      const muzzles = turretMuzzles(IDENTITY, 'battleship', bs.turrets, side);
      const mounts = turretMountBearings(0, bs.turrets, side, bs.mountSpreadRad);
      expect(w).toHaveLength(bs.turrets);
      w.forEach((wedge, i) => {
        expect(wedge.apex.x, `side ${side} apex ${i} x`).toBeCloseTo(muzzles[i].x, 12);
        expect(wedge.apex.y, `side ${side} apex ${i} y`).toBeCloseTo(muzzles[i].y, 12);
        expect((wedge.from + wedge.to) / 2, `side ${side} centre ${i}`).toBeCloseTo(mounts[i], 12);
        expect(wedge.to - wedge.from, `side ${side} width ${i}`).toBeCloseTo(2 * bs.traverseRad, 12);
        expect(wedge.r).toBe(BW.wedgeRadius);
      });
    }
  });

  it('N guns are N DISTINCT apexes on the engaged beam — never N wedges from one point', () => {
    const bs = arcsFor();
    const half = CONFIG.shipClasses.battleship.hull.beam / 2;
    const port = turretWedges(1, bs);
    const stbd = turretWedges(-1, bs);
    expect(new Set(port.map((w) => `${w.apex.x.toFixed(9)},${w.apex.y.toFixed(9)}`)).size).toBe(bs.turrets);
    for (const w of port) expect(w.apex.y).toBeCloseTo(half, 9);
    for (const w of stbd) expect(w.apex.y).toBeCloseTo(-half, 9);
  });

  // THE VISIBLE HALF OF THE RULING: at base the wedges must leave real gaps, or
  // the display would be drawing the shotgun as a solid arc.
  it('the wedges leave GAPS at base and OVERLAP at the cap — the schedule, on screen', () => {
    const gapsIn = (bs: ReturnType<typeof arcsFor>): number[] => {
      const w = turretWedges(1, bs);
      const out: number[] = [];
      for (let i = 1; i < w.length; i += 1) out.push(wrapAngle(w[i].from - w[i - 1].to));
      return out;
    };
    for (const g of gapsIn(arcsFor())) expect(g).toBeGreaterThan(0); // clear water between guns
    for (const g of gapsIn(MAXED)) expect(g).toBeLessThan(0); // arcs run into each other
  });

  it('BROADSIDE TURRETS densifies the SAME covered sector, never a wider one', () => {
    const four = turretWedges(1, arcsFor());
    const six = turretWedges(1, arcsFor('broadsideTurrets', 'broadsideTurrets'));
    expect(six).toHaveLength(6);
    const centre = (w: { from: number; to: number }): number => (w.from + w.to) / 2;
    // Outermost mount bearings are IDENTICAL — extra guns fill in between.
    expect(centre(six[0])).toBeCloseTo(centre(four[0]), 12);
    expect(centre(six[5])).toBeCloseTo(centre(four[3]), 12);
    // …and each wedge keeps its own (unchanged) traverse: no count-derived width.
    for (const w of six) expect(w.to - w.from).toBeCloseTo(four[0].to - four[0].from, 12);
  });

  it('a lone turret sits dead on the beam', () => {
    const w = turretWedges(1, { ...arcsFor(), turrets: 1 });
    expect(w).toHaveLength(1);
    expect((w[0].from + w[0].to) / 2).toBeCloseTo(Math.PI / 2, 12);
  });

  it('the display radius is a CONFIG knob, and stays inside the legal sector indicator', () => {
    expect(BW.wedgeRadius).toBeGreaterThan(0);
    expect(BW.wedgeRadius).toBeLessThan(72); // ARC_R — the sector outline it sits inside
  });

  it('repeat calls with the SAME geometry return the same memoized array', () => {
    const bs = arcsFor();
    expect(turretWedges(1, bs)).toBe(turretWedges(1, { ...bs })); // four scalars, not identity
    expect(turretWedges(1, bs)).not.toBe(turretWedges(-1, bs)); // one slot PER BEAM
    expect(turretWedges(1, bs)).not.toBe(turretWedges(1, MAXED)); // a boon grant re-derives
  });
});

// THE LIT/DIM DECISION, tested as a decision and not as a draw. The wedge fill
// and the torpedo/mine sector fill are one grammar and read ONE pair of alphas
// (CLIENT_CONFIG.arcFill) — they used to carry a private copy each, which is two
// sources for one choice. `lit` also carries the DENIAL: the caller passes the
// denied red with lit true, so a denial keeps the bright weight and changes
// register only.
describe('arcFillStyle — the one lit/dim/denied fill decision', () => {
  const AMBER = CLIENT_CONFIG.colors.amber;
  const DENIED = CLIENT_CONFIG.colors.denied;
  const DIM = CLIENT_CONFIG.colors.textMuted;
  const F = CLIENT_CONFIG.arcFill;

  it('lit keeps the weapon colour at the lit weight; unlit drops to the muted tint', () => {
    expect(arcFillStyle(AMBER, true)).toEqual({ color: AMBER, alpha: F.litAlpha });
    expect(arcFillStyle(AMBER, false)).toEqual({ color: DIM, alpha: F.dimAlpha });
  });

  it('a DENIED arc reads at the LIT weight — the denial is a register change, not a fade', () => {
    expect(arcFillStyle(DENIED, true)).toEqual({ color: DENIED, alpha: F.litAlpha });
    expect(F.litAlpha).toBeGreaterThan(F.dimAlpha);
  });

  it('an unlit arc NEVER wears the weapon colour, whichever weapon asked', () => {
    for (const c of [AMBER, DENIED, CLIENT_CONFIG.colors.legacy.torpGlow]) {
      expect(arcFillStyle(c, false).color).toBe(DIM);
    }
  });
});
