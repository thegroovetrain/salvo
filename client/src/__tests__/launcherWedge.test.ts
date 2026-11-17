// THE TORPEDO FIRING WEDGE, STATION-CENTERED AND FADING (Story 10.6, R28 —
// Eric 2026-11-06: "Each launcher's arc should be centered on the launcher
// itself, not the center of the ship. That includes the wedge. I also would
// like the wedge to extend a lot further and have the alpha gradually fade out
// to the end of it"). The pure view model render/firing.ts bakes once per
// (hull, launcher count, length): every wedge springs from ITS launcher's
// station, runs the chosen length (Eric: no torpedo run figure exists — a
// CLIENT_CONFIG multiple of today's indicative radius), and each wedge is its
// OWN fill: where the fore and aft wedges cross they stack into a brighter
// patch (Eric: "they should overlap as a brighter patch").

import { describe, it, expect } from 'vitest';
import {
  SHIP_CLASS_IDS,
  launcherDeadRad,
  launcherRest,
  launcherSectors,
  launcherTrainRad,
  wrapAngle,
  launcherStation,
} from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import {
  launcherWedgeAlphaAt,
  launcherWedgeLengthU,
  launcherWedges,
  wedgeFade,
} from '../render/weaponArc.js';

const LW = CLIENT_CONFIG.launcherWedge;
const BASE_R = 72; // u — any indicative radius: the law is the multiple of it

describe('launcherWedges — one wedge per firing band, from its own launcher, at its own band (R30)', () => {
  it.each(SHIP_CLASS_IDS)('%s: each wedge spans THAT launcher\'s band off its own end', (hull) => {
    launcherWedges(hull, 2, 500).forEach((wg, k) => {
      const i = Math.floor(k / 2);
      const off = Math.abs(wrapAngle(wg.offset - launcherRest(i)));
      expect(off - wg.halfArc).toBeCloseTo(launcherDeadRad(hull, i), 12);
      expect(off + wg.halfArc).toBeCloseTo(launcherTrainRad(hull, i), 12);
    });
  });

  it.each(SHIP_CLASS_IDS)('%s: the origins ARE the launcher stations and the length is the chosen one', (hull) => {
    for (const n of [1, 2]) {
      const wedges = launcherWedges(hull, n, 500);
      const sectors = launcherSectors(hull, n);
      expect(wedges).toHaveLength(sectors.length);
      wedges.forEach((wg, k) => {
        const i = Math.floor(k / 2); // two bands per launcher, fore first
        expect(wg.origin).toEqual(launcherStation(hull, i));
        expect(wg.offset).toBe(sectors[k].offset);
        expect(wg.halfArc).toBe(sectors[k].halfArc);
        expect(wg.r).toBe(500);
      });
    }
  });

  it('no launcher, no wedge', () => {
    expect(launcherWedges('bismarck', 0, 500)).toEqual([]);
  });
});

describe('launcherWedgeLengthU — the CLIENT_CONFIG multiple of the indicative radius', () => {
  it('is lengthMult × the indicative radius, longer than today\'s wedge', () => {
    expect(launcherWedgeLengthU(BASE_R)).toBe(BASE_R * LW.lengthMult);
    expect(LW.lengthMult).toBeGreaterThan(1);
  });
});

describe('the fade and the max composite', () => {
  it('full strength near the launcher, falling smoothly and monotonically to nothing at the end', () => {
    expect(wedgeFade(0)).toBe(1);
    expect(wedgeFade(LW.fadeStartFrac)).toBe(1);
    expect(wedgeFade(1)).toBe(0);
    expect(wedgeFade(1.2)).toBe(0);
    let prev = 1;
    for (let f = 0; f <= 1; f += 0.01) {
      const a = wedgeFade(f);
      expect(a).toBeLessThanOrEqual(prev + 1e-12);
      expect(a).toBeGreaterThanOrEqual(0);
      prev = a;
    }
  });

  it('alpha is the fade of the distance FROM THE STATION, zero in the dead wedges and past the end', () => {
    const hull = 'bismarck';
    const r = 400;
    const wedges = launcherWedges(hull, 1, r);
    const st = launcherStation(hull, 0);
    const at = (deg: number, d: number) => ({ x: st.x + Math.cos((deg * Math.PI) / 180) * d, y: st.y + Math.sin((deg * Math.PI) / 180) * d });
    for (const side of [1, -1]) {
      const p = at(side * 90, r / 2);
      expect(launcherWedgeAlphaAt(wedges, p.x, p.y)).toBeCloseTo(wedgeFade(0.5), 12);
      const past = at(side * 90, r * 1.01);
      expect(launcherWedgeAlphaAt(wedges, past.x, past.y)).toBe(0);
    }
    const ahead = at(0, r / 2); // the fore launcher's dead wedge
    expect(launcherWedgeAlphaAt(wedges, ahead.x, ahead.y)).toBe(0);
  });

  it('where the fore and aft wedges overlap they STACK (normal over-compositing): brighter than either alone', () => {
    const hull = 'bismarck';
    const both = launcherWedges(hull, 2, 400);
    const fore = both.slice(0, 2);
    const aft = both.slice(2);
    const p = { x: 0, y: 200 }; // on the beam, inside both launchers' bands
    const a = launcherWedgeAlphaAt(fore, p.x, p.y);
    const b = launcherWedgeAlphaAt(aft, p.x, p.y);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(0);
    const stacked = launcherWedgeAlphaAt(both, p.x, p.y);
    expect(stacked).toBeCloseTo(1 - (1 - a) * (1 - b), 12);
    expect(stacked).toBeGreaterThan(Math.max(a, b));
  });
});
