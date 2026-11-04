// Story 9.5 — the shared hull-contact resolver and the contact damage math.
// Contracts only (epic-8 amendment 243): the push leaves the pair overlap-free,
// splits the separation by mass, never moves an immovable body, never
// teleports, is independent of input order; the damage formulas reproduce
// Eric's two calibration sentences FROM THE DIALS (amendment 73; re-based for
// mass = ARMOR by Story 10.3, Eric 2026-11-04, ruling 2) and the land
// softness; nothing below the allowance. The push tests use ABSTRACT masses
// (250 / 350): the split law is a ratio, whatever the masses are.
import { describe, it, expect } from 'vitest';
import {
  CATALOG,
  CONFIG,
  contactGrindRate,
  contactHitDamage,
  hullSilhouette,
  landGrindRate,
  landHitDamage,
  pointInPolygon,
  resolveHullContacts,
  segPolygonHit,
  transformPolygon,
  type ContactBody,
  type ShipState,
  type Vec2,
} from '../index.js';

const RAM = CONFIG.ram;

/** Axis-aligned local rectangle, origin-centred (bow at +x). */
function rect(hx: number, hy: number): Vec2[] {
  return [
    { x: hx, y: hy },
    { x: -hx, y: hy },
    { x: -hx, y: -hy },
    { x: hx, y: -hy },
  ];
}

function body(
  id: string,
  local: readonly Vec2[],
  state: ShipState,
  mass: number,
  movable = true,
): ContactBody {
  return {
    id,
    state,
    poly: transformPolygon(local, state.x, state.y, state.heading),
    mass,
    movable,
  };
}

function ship(x: number, y: number, heading = 0, speed = 0): ShipState {
  return { x, y, heading, speed };
}

/** Independent overlap check: any edge of P crossing Q, or either wholly inside the other. */
function overlaps(p: readonly Vec2[], q: readonly Vec2[]): boolean {
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    if (segPolygonHit(p[j], p[i], q, 0) !== null) return true;
  }
  return pointInPolygon(q[0], p) || pointInPolygon(p[0], q);
}

/** Two rectangles overlapping by exactly 2 u along x: A's right edge at x=10,
 *  B's left edge at x=8; B is taller so the shortest way out is along x. */
function rectPair(mA: number, mB: number, aMovable = true, bMovable = true) {
  const a = body('a', rect(10, 3), ship(0, 0), mA, aMovable);
  const b = body('b', rect(10, 10), ship(18, 0), mB, bMovable);
  return { a, b, overlap: 2 };
}

describe('resolveHullContacts — solidity', () => {
  it('ends the pass overlap-free and splits the separation by mass (lighter moves 350/600, heavier 250/600)', () => {
    const { a, b } = rectPair(250, 350);
    const contacts = resolveHullContacts([a, b]);
    expect(contacts).toHaveLength(1);
    expect(overlaps(a.poly, b.poly)).toBe(false);
    const da = Math.hypot(a.state.x - 0, a.state.y - 0);
    const db = Math.hypot(b.state.x - 18, b.state.y - 0);
    const total = da + db;
    expect(total).toBeGreaterThan(0);
    expect(Math.abs(da / total - 350 / 600)).toBeLessThan(1e-6);
    expect(Math.abs(db / total - 250 / 600)).toBeLessThan(1e-6);
  });

  it('does the same with real hull silhouettes (abstract masses 250 vs 350)', () => {
    const local = hullSilhouette('torpedoBoat');
    const heavy = hullSilhouette('battleship');
    const a = body('a', local, ship(0, 0, 0.3), 250);
    const b = body('b', heavy, ship(30, 25, 2.0), 350);
    expect(overlaps(a.poly, b.poly)).toBe(true);
    const ax = a.state.x, ay = a.state.y, bx = b.state.x, by = b.state.y;
    resolveHullContacts([a, b]);
    expect(overlaps(a.poly, b.poly)).toBe(false);
    // the world polygons travel with the states (a pure translation)
    const expected = transformPolygon(local, a.state.x, a.state.y, 0.3);
    a.poly.forEach((p, i) => {
      expect(p.x).toBeCloseTo(expected[i].x, 9);
      expect(p.y).toBeCloseTo(expected[i].y, 9);
    });
    const da = Math.hypot(a.state.x - ax, a.state.y - ay);
    const db = Math.hypot(b.state.x - bx, b.state.y - by);
    expect(Math.abs(da / (da + db) - 350 / 600)).toBeLessThan(1e-6);
  });

  it('never moves an immovable body; the other takes the whole push', () => {
    const { a, b, overlap } = rectPair(250, 350, true, false);
    const bPoly = b.poly.map((p) => ({ ...p }));
    resolveHullContacts([a, b]);
    expect(b.state.x).toBe(18);
    expect(b.state.y).toBe(0);
    expect(b.poly).toEqual(bPoly);
    expect(overlaps(a.poly, b.poly)).toBe(false);
    expect(Math.abs(a.state.x)).toBeGreaterThanOrEqual(overlap);
  });

  it('leaves two immovable bodies where they are but still reports the contact', () => {
    const { a, b } = rectPair(250, 350, false, false);
    const contacts = resolveHullContacts([a, b]);
    expect(contacts).toHaveLength(1);
    expect(a.state.x).toBe(0);
    expect(b.state.x).toBe(18);
  });

  it('never moves a body farther than the overlap depth (no teleport)', () => {
    const { a, b, overlap } = rectPair(250, 350);
    resolveHullContacts([a, b]);
    const da = Math.hypot(a.state.x, a.state.y);
    const db = Math.hypot(b.state.x - 18, b.state.y);
    const eps = 1e-2;
    expect(da).toBeLessThanOrEqual(overlap + eps);
    expect(db).toBeLessThanOrEqual(overlap + eps);
    expect(da + db).toBeLessThanOrEqual(overlap + eps);
  });

  it('gives the same final poses whichever order the bodies are listed in', () => {
    const make = () => [
      body('hull-1', hullSilhouette('torpedoBoat'), ship(0, 0, 0.3, 40), 250),
      body('hull-2', hullSilhouette('battleship'), ship(30, 25, 2.0, 20), 350),
    ];
    const fwd = make();
    const rev = make();
    const cf = resolveHullContacts(fwd);
    const cr = resolveHullContacts([rev[1], rev[0]]);
    expect(rev[0].state).toEqual(fwd[0].state);
    expect(rev[1].state).toEqual(fwd[1].state);
    expect(cr).toEqual(cf);
  });

  it('a pair that does not overlap yields no contact and moves nothing', () => {
    const a = body('a', rect(10, 3), ship(0, 0, 0, 45), 250);
    const b = body('b', rect(10, 10), ship(40, 0, Math.PI, 45), 350);
    const contacts = resolveHullContacts([a, b]);
    expect(contacts).toHaveLength(0);
    expect(a.state.x).toBe(0);
    expect(b.state.x).toBe(40);
  });
});

describe('resolveHullContacts — closing and sliding speed', () => {
  it('two hulls head-on at 45 u/s each close at 90 with no slide', () => {
    const a = body('a', rect(10, 3), ship(0, 0, 0, 45), 250);
    const b = body('b', rect(10, 10), ship(18, 0, Math.PI, 45), 250);
    const [c] = resolveHullContacts([a, b]);
    expect(c.a).toBe('a');
    expect(c.b).toBe('b');
    expect(c.nx).toBeCloseTo(-1, 9); // from B toward A
    expect(c.ny).toBeCloseTo(0, 9);
    expect(c.vn).toBeCloseTo(90, 9);
    expect(c.vt).toBeCloseTo(0, 9);
  });

  it('a hull sliding past a stopped one does not close; its slide is its speed', () => {
    const a = body('a', rect(3, 10), ship(0, 0, Math.PI / 2, 30), 250); // 20 u wide abeam once turned
    const b = body('b', rect(10, 10), ship(18, 0, 0, 0), 250);
    const [c] = resolveHullContacts([a, b]);
    expect(c.vn).toBeCloseTo(0, 9);
    expect(c.vt).toBeCloseTo(30, 9);
  });

  it('two real bows meeting tip to tip read the full closing speed on the line of centres, not the sideways escape', () => {
    // A speedboat (bow at +50) and a dreadnought (bow at +62, turned about)
    // overlapping 5 u at the tips: the minimal geometric escape is nearly
    // sideways (pointed bows slide off each other), but the contact speeds
    // are measured on the line of centres, so the ram reads 45 + 35 = 80.
    const a = body('a', hullSilhouette('torpedoBoat'), ship(0, 0, 0, 45), 250);
    const b = body('b', hullSilhouette('battleship'), ship(50 + 62 - 5, 0, Math.PI, 35), 350);
    const [c] = resolveHullContacts([a, b]);
    expect(c.nx).toBeCloseTo(-1, 9);
    expect(c.ny).toBeCloseTo(0, 9);
    expect(c.vn).toBeCloseTo(80, 9);
    expect(c.vt).toBeCloseTo(0, 9);
  });

  it('a deep overlap pushes the small hull AWAY from the big hull\'s centre, never through it', () => {
    // The small hull's centre sits inside the big hull, past the point where
    // the geometric escape would carry it out the far side: the push must
    // still move it down (away from B's centre at y = +3), not up through B.
    const a = body('a', hullSilhouette('torpedoBoat'), ship(0, 0, 0, 45), 250);
    const b = body('b', hullSilhouette('battleship'), ship(0, 3, 0, 0), 350);
    resolveHullContacts([a, b]);
    expect(a.state.y).toBeLessThan(0);
    expect(b.state.y).toBeGreaterThan(3);
  });
});

// THE DIALS ARE RE-BASED FOR MASS = ARMOR (Story 10.3, Eric 2026-11-04,
// ruling 2): a hull's ramming mass is its ARMOR INDEX (100 on every scaffold
// hull), not its max hull, and `energyPerHp` / `grindPerUnit` moved so that
// every outcome keeps its FRACTION of a 1000 hp hull — a full-speed speedboat
// head-on still costs each hull ~80 %. Every expectation below is the formula
// over CONFIG.ram at the index base, or a fraction of the ruled hull; never a
// literal hp figure.
describe('contact damage — Eric\'s calibration read from CONFIG.ram at mass = ARMOR (Story 10.3)', () => {
  const M = CONFIG.index.base; // every scaffold hull's ARMOR, so its mass
  const HULL = CONFIG.shipClasses.torpedoBoat.hp; // 1000 on every class
  /** The energy law by hand: the hit two equal masses M take at closing vn. */
  const equalHit = (vn: number): number => {
    const mu = (M * M) / (M + M);
    return Math.floor((0.5 * mu * vn * vn * (M / (M + M))) / RAM.energyPerHp);
  };

  it('two equal hulls head-on at 90 u/s closing each take the energy law\'s split — about four fifths of a hull (Eric: "~80 %")', () => {
    const hit = contactHitDamage(M, M, 90, RAM);
    expect(hit).toEqual({ a: equalHit(90), b: equalHit(90) });
    expect(hit.a / HULL).toBeGreaterThan(0.75);
    expect(hit.a / HULL).toBeLessThan(0.85);
    expect(Number.isInteger(hit.a)).toBe(true); // floored, whole hp
  });

  it('a hull scraping a stopped equal hull at 45 u/s bleeds grindPerUnit × 45 × ½ each — a small fraction of a hull per second', () => {
    const g = contactGrindRate(M, M, 45, 0, RAM);
    const want = RAM.grindPerUnit * 45 * (M / (M + M));
    expect(Math.abs(g.a - want)).toBeLessThan(1e-9);
    expect(Math.abs(g.b - want)).toBeLessThan(1e-9);
    expect(g.a / HULL).toBeLessThan(0.05); // a scrape is attrition, never a strike
  });

  it('a sustained PUSH bleeds like a scrape (amendment 83): the rate rides sliding + pressing speed', () => {
    // Pressing at 45 with no slide costs exactly what sliding at 45 does...
    expect(contactGrindRate(M, M, 0, 45, RAM)).toEqual(contactGrindRate(M, M, 45, 0, RAM));
    // ...and the two components add.
    const both = contactGrindRate(M, M, 30, 15, RAM);
    expect(Math.abs(both.a - contactGrindRate(M, M, 45, 0, RAM).a)).toBeLessThan(1e-9);
    expect(contactGrindRate(M, M, 0, 0, RAM)).toEqual({ a: 0, b: 0 }); // at rest, nothing
  });

  it('mass is ARMOR: the lower-ARMOR hull takes the larger share — the other hull\'s mass fraction', () => {
    // An ARMOR-upgraded hull (the index + one card, read from the catalog)
    // against a base hull at 80 closing: the base hull takes the heavy hull's
    // share of the energy, the heavy hull the base hull's share.
    const step = (CATALOG.armor.tiers[0].find((e) => e.kind === 'stat') as { add: number }).add;
    const heavy = M + step;
    const mu = (M * heavy) / (M + heavy);
    const energy = 0.5 * mu * 80 * 80;
    const hit = contactHitDamage(M, heavy, 80, RAM);
    expect(hit).toEqual({
      a: Math.floor((energy * (heavy / (M + heavy))) / RAM.energyPerHp),
      b: Math.floor((energy * (M / (M + heavy))) / RAM.energyPerHp),
    });
    expect(hit.a).toBeGreaterThan(hit.b);
    const g = contactGrindRate(M, heavy, 45, 0, RAM);
    expect(g.a / g.b).toBeCloseTo(heavy / M, 12);
  });

  it('land is the infinite-mass limit softened: a base hull dead-on at 45 u/s takes ½·M·vn²/energyPerHp × landSoftness — about a fifth of a hull', () => {
    const want = Math.floor(((0.5 * M * 45 * 45) / RAM.energyPerHp) * RAM.landSoftness);
    expect(landHitDamage(M, 45, RAM)).toBe(want);
    expect(want / HULL).toBeGreaterThan(0.15);
    expect(want / HULL).toBeLessThan(0.25);
    expect(landGrindRate(45, RAM)).toBeCloseTo(RAM.grindPerUnit * 45 * RAM.landSoftness, 12);
    expect(landGrindRate(0, RAM)).toBe(0); // a parked hull takes nothing
  });

  it('a strike at or under the allowance costs nothing', () => {
    expect(contactHitDamage(M, M, RAM.allowanceU, RAM)).toEqual({ a: 0, b: 0 });
    expect(contactHitDamage(M, M, 0, RAM)).toEqual({ a: 0, b: 0 });
    expect(landHitDamage(M, RAM.allowanceU, RAM)).toBe(0);
  });

  it('the land scrape rides the SLIDING speed only: a head-on press against a rock bleeds nothing', () => {
    expect(landGrindRate(0, RAM)).toBe(0);
    expect(landGrindRate(45, RAM)).toBeGreaterThan(0);
  });

  it('a non-finite or empty pair prices as NOTHING, never NaN (the NaN contract)', () => {
    const NONE = { a: 0, b: 0 };
    expect(contactHitDamage(NaN, M, 90, RAM)).toEqual(NONE);
    expect(contactHitDamage(M, Infinity, 90, RAM)).toEqual(NONE);
    expect(contactHitDamage(0, 0, 90, RAM)).toEqual(NONE);
    expect(contactHitDamage(M, M, NaN, RAM)).toEqual(NONE);
    expect(contactGrindRate(NaN, M, 45, 0, RAM)).toEqual(NONE);
    expect(contactGrindRate(0, 0, 45, 0, RAM)).toEqual(NONE);
    expect(contactGrindRate(M, M, NaN, 0, RAM)).toEqual(NONE);
    expect(contactGrindRate(M, M, 0, Infinity, RAM)).toEqual(NONE);
    expect(landHitDamage(NaN, 45, RAM)).toBe(0);
    expect(landGrindRate(NaN, RAM)).toBe(0);
  });
});
