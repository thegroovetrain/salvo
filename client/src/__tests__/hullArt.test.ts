// Story 10.4 wave 2c — the battleship art (render/hullArt/*): the ported data is
// well-formed for every hull, the turrets sit on the shared stations with a
// barbette under each, the canvas and DOM art share one shape list, every line
// follows the relation rule, and a ShipView borrows cached contexts and never
// redraws on a turret move.

import { describe, it, expect } from 'vitest';
import type { Graphics } from 'pixi.js';
import { SHIP_CLASS_IDS, U_PER_M, hullSilhouette, turretMounts, turretStation, type Vec2 } from '@salvo/shared';
import { FEATURES, HOUSES } from '../render/hullArt/data.js';
import { barbetteRadiusU, hullArt, turretArt, turretDrawOrder, type Prim } from '../render/hullArt/shapes.js';
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
      // Stacked in DRAW order (nearer amidships on top), right above the deck.
      turretDrawOrder(id).forEach((t, k) => expect(kids[1 + k], `${id} ${t}`).toBe(v.turretView(t)));
      v.destroy();
    }
  });

  // Eric 2026-11-06: "on the 4x2 ships it looks like the third gun (from the
  // front) barrels are rendered under the fourth gun turrets. Fix that." A
  // SUPERFIRING turret draws above the one it fires over: the one nearer
  // amidships is on top — a rule off each turret's station, not a hull table.
  it('turretDrawOrder: nearer amidships draws LATER (higher z), every hull', () => {
    for (const id of SHIP_CLASS_IDS) {
      const order = turretDrawOrder(id);
      expect([...order].sort((a, b) => a - b), id).toEqual(turretMounts(id).map((_, i) => i));
      const d = (i: number): number => Math.abs(turretStation(id, i).x);
      for (let k = 1; k < order.length; k++) expect(d(order[k]), `${id} ${order}`).toBeLessThanOrEqual(d(order[k - 1]));
    }
  });

  it('on the four-turret hulls the THIRD turret from the bow sits above the FOURTH, the second above the first', () => {
    for (const id of SHIP_CLASS_IDS.filter((c) => turretMounts(c).length === 4)) {
      const v = new ShipView(relationStyle('own'), id);
      const z = (i: number): number => v.gfx.children.indexOf(v.turretView(i)!);
      expect(z(2), id).toBeGreaterThan(z(3));
      expect(z(1), id).toBeGreaterThan(z(0));
      v.setLaunchers([0, Math.PI], 2); // launchers stay under every turret
      for (let i = 0; i < v.turretCount; i++) expect(v.gfx.children.indexOf(v.launcherView(0)!)).toBeLessThan(z(i));
      v.destroy();
    }
  });

  it('the static (SVG) art stacks the turrets in the same draw order', () => {
    for (const id of SHIP_CLASS_IDS) {
      const prims = restingPrims(id);
      const deck = hullArt(id).deck.length;
      const per = turretMounts(id).map((_, i) => turretArt(id, i).prims.length);
      let at = deck;
      for (const t of turretDrawOrder(id)) {
        // the gunhouse (each turret's LAST prim) of turret t lands at this run's end
        at += per[t];
        expect(prims[at - 1].fill, `${id} ${t}`).toBe('turret');
      }
      expect(at).toBe(prims.length - hullArt(id).outline.length);
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
