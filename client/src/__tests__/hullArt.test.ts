// Story 10.4 wave 2c — the battleship art (render/hullArt/*): the ported data is
// well-formed for every hull, the turrets sit on the shared stations with a
// barbette under each, the canvas and DOM art share one shape list, every line
// follows the relation rule, and a ShipView borrows cached contexts and never
// redraws on a turret move.

import { describe, it, expect } from 'vitest';
import type { Graphics } from 'pixi.js';
import { CONFIG, SHIP_CLASS_IDS, hullSilhouette, turretMounts, turretStation, type Vec2 } from '@salvo/shared';
import { FEATURES, HOUSES, LOA_M, U_PER_M } from '../render/hullArt/data.js';
import { barbetteRadiusU, hullArt, turretArt, type Prim } from '../render/hullArt/shapes.js';
import { artCacheSize, lineWidthU } from '../render/hullArt/pixiArt.js';
import { artBox, hullArtSvg, restingPrims, sharedFitPxPerU, svgLineWidth } from '../render/hullArt/svgArt.js';
import { ShipView } from '../render/ships.js';
import { relationStroke, relationStyle, type Relation } from '../render/relationColor.js';
import { cssHex } from '../util/color.js';

const RELATIONS: readonly Relation[] = ['own', 'enemy'];

function points(p: Prim): Vec2[] {
  if (p.kind === 'poly') return [...p.pts];
  if (p.kind === 'seg') return [p.a, p.b];
  return [{ x: p.x, y: p.y }];
}

describe('hull art data — well-formed for every hull', () => {
  it('restates the shared scale: CONFIG hull length = the real length overall × U_PER_M', () => {
    for (const id of SHIP_CLASS_IDS) expect(CONFIG.shipClasses[id].hull.length).toBeCloseTo(LOA_M[id] * U_PER_M, 6);
  });

  it('places every deck feature inside the hull’s length / beam box', () => {
    for (const id of SHIP_CLASS_IDS) {
      expect(FEATURES[id].length).toBeGreaterThan(0);
      for (const f of FEATURES[id]) {
        const xs = 'pts' in f ? f.pts.map((p) => p[0]) : 'x0' in f ? [f.x0, f.x1] : [f.x];
        const ys = 'pts' in f ? f.pts.map((p) => p[1]) : 'y0' in f ? [f.y0, f.y1] : [f.y];
        for (const x of xs) expect(x, `${id} ${f.t}`).toBeGreaterThanOrEqual(0);
        for (const x of xs) expect(x, `${id} ${f.t}`).toBeLessThanOrEqual(1);
        for (const y of ys) expect(Math.abs(y), `${id} ${f.t}`).toBeLessThanOrEqual(0.5);
      }
    }
  });

  it('mirrors every beam-paired feature (the page’s port / starboard spreads)', () => {
    for (const id of SHIP_CLASS_IDS) {
      const offAxis = FEATURES[id].filter((f) => 'y' in f && f.y !== 0) as { t: string; x: number; y: number }[];
      for (const f of offAxis) {
        expect(offAxis.some((g) => g.t === f.t && g.x === f.x && g.y === -f.y), `${id} ${f.t} @${f.x}`).toBe(true);
      }
    }
  });
});

describe('turret art — on the shared stations, a barbette under every turret', () => {
  it('draws one barbette ring per shared mount, centred on turretStation', () => {
    for (const id of SHIP_CLASS_IDS) {
      const rings = hullArt(id).deck.filter((p) => p.kind === 'ellipse' && p.fill === null);
      expect(rings).toHaveLength(turretMounts(id).length);
      rings.forEach((r, i) => {
        const s = turretStation(id, i);
        expect(r.kind === 'ellipse' && r.x).toBeCloseTo(s.x, 9);
        expect(r.kind === 'ellipse' && r.y).toBeCloseTo(s.y, 9);
      });
    }
  });

  it('seats the gunhouse over its pivot, inside the barbette’s reach, with one barrel per gun', () => {
    for (const id of SHIP_CLASS_IDS) {
      turretMounts(id).forEach((m, i) => {
        const t = turretArt(id, i);
        const xs = t.house.map((v) => v.x);
        const ys = t.house.map((v) => v.y);
        expect(Math.min(...xs)).toBeLessThan(0);
        expect(Math.max(...xs)).toBeGreaterThan(0);
        expect(Math.min(...ys)).toBeLessThan(0);
        expect(Math.max(...ys)).toBeGreaterThan(0);
        const houseReach = Math.max(...t.house.map((v) => Math.hypot(v.x, v.y)));
        expect(houseReach).toBeGreaterThan(barbetteRadiusU(id) * 0.5);
        expect(t.prims.filter((p) => p.fill === 'barrel')).toHaveLength(m.guns);
        // barrels run forward past the gun face: the turret frame's +x
        for (const b of t.prims.filter((p) => p.fill === 'barrel')) {
          expect(Math.max(...points(b).map((v) => v.x))).toBeGreaterThan(Math.max(...xs));
        }
      });
    }
  });

  it('takes the barrel and barbette sizes from the page’s house table, in metres × U_PER_M', () => {
    for (const id of SHIP_CLASS_IDS) expect(barbetteRadiusU(id)).toBeCloseTo(HOUSES[id].barbette * U_PER_M, 9);
  });
});

describe('the hull line is the shared silhouette (what you see is what gets hit)', () => {
  it('fills the deck and draws the ONE hull-weight line on hullSilhouette itself', () => {
    for (const id of SHIP_CLASS_IDS) {
      const art = hullArt(id);
      const deck = art.deck[0];
      expect(deck.kind === 'poly' && deck.pts).toBe(hullSilhouette(id));
      expect(art.outline).toHaveLength(1);
      expect(art.outline[0].line).toBe('hull');
      expect(art.outline[0].kind === 'poly' && art.outline[0].pts).toBe(hullSilhouette(id));
      expect([...art.deck, ...turretArt(id, 0).prims].some((p) => p.line === 'hull')).toBe(false);
    }
  });

  it('weighs the lines as amendment 7(o): inner about a third of the hull line, rails / cranes 1.5× inner', () => {
    expect(lineWidthU('inner') / lineWidthU('hull')).toBeCloseTo(1 / 3, 6);
    expect(lineWidthU('heavy') / lineWidthU('inner')).toBeCloseTo(1.5, 6);
    expect(svgLineWidth('inner', 3) / svgLineWidth('hull', 3)).toBeCloseTo(1 / 3, 6);
    expect(svgLineWidth('heavy', 3) / svgLineWidth('inner', 3)).toBeCloseTo(1.5, 6);
  });
});

describe('hullArtSvg — the DOM art, from the same shapes', () => {
  it('returns art for every hull in both relations, every line in that relation’s color', () => {
    for (const id of SHIP_CLASS_IDS) {
      for (const r of RELATIONS) {
        const svg = hullArtSvg(id, r, { pxPerU: 2 });
        expect(svg.startsWith('<svg')).toBe(true);
        const strokes = new Set([...svg.matchAll(/stroke="([^"]+)"/g)].map((m) => m[1]).filter((s) => s !== 'none'));
        expect(strokes).toEqual(new Set([cssHex(relationStroke(r))]));
        // one SVG element per resting primitive (deck + turrets + outline)
        const count = (svg.match(/<(polygon|ellipse|line) /g) ?? []).length;
        expect(count).toBe(restingPrims(id).length);
      }
    }
  });

  it('keeps TRUE relative size at a shared scale (a shorter hull draws narrower)', () => {
    const k = sharedFitPxPerU(SHIP_CLASS_IDS, 300, 120);
    const widthOf = (id: (typeof SHIP_CLASS_IDS)[number]): number =>
      Number(/width="([\d.]+)"/.exec(hullArtSvg(id, 'own', { pxPerU: k }))![1]);
    for (const a of SHIP_CLASS_IDS) {
      expect(widthOf(a)).toBeLessThanOrEqual(300 + 1e-6 + 2 * 2.5); // + the line margin
      for (const b of SHIP_CLASS_IDS) {
        const la = artBox(a).maxX - artBox(a).minX;
        const lb = artBox(b).maxX - artBox(b).minX;
        if (la < lb) expect(widthOf(a)).toBeLessThan(widthOf(b));
      }
    }
  });
});

describe('ShipView with the battleship art — built once, never redrawn per frame', () => {
  function instr(g: Graphics): unknown[] {
    return g.context.instructions;
  }

  it('builds one turret child per shared mount, between the deck and the outline', () => {
    for (const id of SHIP_CLASS_IDS) {
      const v = new ShipView(relationStyle('enemy'), id);
      expect(v.turretCount).toBe(turretMounts(id).length);
      const kids = v.gfx.children;
      expect(kids[0]).toBe(v.hull);
      expect(kids[kids.length - 1]).toBe(v.outline);
      for (let i = 0; i < v.turretCount; i++) expect(kids[1 + i]).toBe(v.turretView(i));
      v.destroy();
    }
  });

  it('never touches geometry on setTurretAngles — rotation writes only', () => {
    const v = new ShipView(relationStyle('own'), 'iowa');
    const ctxs = [v.hull.context, v.outline.context, ...Array.from({ length: v.turretCount }, (_, i) => v.turretView(i)!.context)];
    const lens = ctxs.map((c) => c.instructions.length);
    v.setTurretAngles(turretMounts('iowa').map((_, i) => 0.3 * (i + 1)));
    v.setTurretAngles([]);
    const after = [v.hull.context, v.outline.context, ...Array.from({ length: v.turretCount }, (_, i) => v.turretView(i)!.context)];
    after.forEach((c, i) => {
      expect(c).toBe(ctxs[i]);
      expect(c.instructions.length).toBe(lens[i]);
    });
    v.destroy();
  });

  it('shares one cached context per (hull, line color): a second view adds nothing', () => {
    const a = new ShipView(relationStyle('own'), 'yamato');
    const size = artCacheSize();
    const b = new ShipView(relationStyle('own'), 'yamato');
    expect(artCacheSize()).toBe(size);
    expect(b.hull.context).toBe(a.hull.context);
    expect(b.turretView(0)!.context).toBe(a.turretView(0)!.context);
    expect(instr(b.outline).length).toBeGreaterThan(0);
    a.destroy();
    // destroying one view leaves the shared art intact for the other
    expect(instr(b.hull).length).toBeGreaterThan(0);
    b.destroy();
  });
});
