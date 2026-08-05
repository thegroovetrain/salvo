import { describe, it, expect } from 'vitest';
import { CONFIG, HULL_IDS, hullEnvelope } from '../constants.js';
import { MAP_RULES, generateMap, islandFromPolygon } from '../sim/map.js';
import { resolveShipPose, type Pose } from '../sim/collision.js';
import { skeletonNormal } from '../sim/island.js';
import {
  hullSilhouette,
  pointInPolygon,
  pointPolygonDistance,
  polygonMaxRadius,
  segPolygonHit,
  transformPolygon,
} from '../sim/silhouette.js';
import { stepShip } from '../sim/ship.js';
import { mulberry32 } from '../math/rng.js';
import type { ShipState } from '../sim/ship.js';
import type { Island } from '../types.js';
import type { Vec2 } from '../math/vec.js';

const TAU = Math.PI * 2;
const DAMP = CONFIG.ship.islandSpeedMult;
const DT = CONFIG.tick.simDtMs / 1000;
const BIG_MAP = 100000; // effectively boundless for island-only cases
// THE worst case from CONFIG: the whole gun family (gun / cannon / star shells)
// plus the torpedo — the previous max() omitted cannon and star shells, so a
// faster sibling could raise the real worst case without this file noticing.
const maxProjSpeed = Math.max(
  CONFIG.gun.shellSpeed,
  CONFIG.cannon.shellSpeed,
  CONFIG.starShells.shellSpeed,
  CONFIG.torpedo.speed,
);
const maxTravel = maxProjSpeed * DT;

type HullId = Parameters<typeof hullSilhouette>[0];

/** A regular-n-gon island fixture (skeleton = its centre) — the polygon
 *  successor of the old circle fixtures; apothem = r·cos(π/n). */
function ngonIsland(cx: number, cy: number, r: number, n = 32): Island {
  const poly: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    poly.push({ x: cx + Math.cos((TAU * i) / n) * r, y: cy + Math.sin((TAU * i) / n) * r });
  }
  return islandFromPolygon(poly, [{ x: cx, y: cy }]);
}

function worldPoly(ship: ShipState, hullId: HullId): Vec2[] {
  return transformPolygon(hullSilhouette(hullId), ship.x, ship.y, ship.heading);
}

/** INDEPENDENT poly-vs-poly overlap oracle (does not reuse collision.ts
 *  internals): any hull edge crossing or starting inside the island polygon,
 *  or the island wholly inside the hull. */
function hullIslandOverlap(poly: readonly Vec2[], isle: Island): boolean {
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    if (segPolygonHit(poly[j], poly[i], isle.poly, 0) !== null) return true;
  }
  return pointInPolygon(isle.poly[0], poly);
}

/** True iff the posed hull is clear of a single island polygon. */
function islandClear(poly: readonly Vec2[], isle: Island): boolean {
  return !hullIslandOverlap(poly, isle);
}

/** True iff the posed hull is clear of EVERY island. The bounding-circle skip
 *  is soundness-trivial (poly ⊆ bounding circle, hull ⊆ polyMax circle) and
 *  keeps the long map-wide drives affordable. */
function clearOfAll(ship: ShipState, hullId: HullId, isles: readonly Island[]): boolean {
  const poly = worldPoly(ship, hullId);
  const polyMax = polygonMaxRadius(hullSilhouette(hullId));
  return isles.every((i) => {
    if (Math.hypot(ship.x - i.x, ship.y - i.y) > polyMax + i.r + 10) return true;
    return islandClear(poly, i);
  });
}

/** Resolve + apply the caller-side single damp (what world.ts / prediction.ts do). */
function resolve(
  prev: Pose,
  s: ShipState,
  isles: readonly Island[],
  hullId: HullId,
  mapR = BIG_MAP,
): boolean {
  const { contact } = resolveShipPose(prev, s, isles, mapR, hullSilhouette(hullId));
  if (contact) s.speed *= DAMP;
  return contact;
}

// Collision is SWEPT (sim/shell.ts tests the whole tick's travel segment against
// every obstacle), so the proof that matters: at the worst-case per-tick travel
// from CONFIG, the same primitives shell.ts uses still DETECT an obstacle the
// segment crosses even when neither endpoint is touching it (exactly what a
// point sample would miss).
describe('swept-shell no tunneling (worst case from CONFIG + MAP_RULES)', () => {
  /** The thinnest hull afloat (smallest beam) — the worst case for a hull sweep. */
  function thinnestHull(): { id: HullId; beam: number } {
    let best = { id: HULL_IDS[0], beam: hullEnvelope(HULL_IDS[0]).hull.beam };
    for (const id of HULL_IDS) {
      const beam = hullEnvelope(id).hull.beam;
      if (beam < best.beam) best = { id, beam };
    }
    return best;
  }

  it('detects the fastest projectile crossing the thinnest island the generator can produce', () => {
    // Thinnest coastal radius: the smallest half-width at the fractal floor.
    const rMin = MAP_RULES.HW_MIN * MAP_RULES.M_MIN;
    expect(maxTravel / 2).toBeGreaterThan(rMin); // both endpoints can sit outside
    const isle = ngonIsland(0, 0, rMin);
    // KNOWN LIMITATION of the radius-0 exact test (reported cross-cutting):
    // segSegClosest returns ~1e-15 float dust at a proper crossing, so
    // segPolygonHit(..., 0) — and therefore islandSegHit — can miss a genuine
    // coastline crossing. collision.ts pads its overlap tests by 1e-9 for this
    // reason; this proof uses the same pad so it pins the SWEPT geometry, not
    // the dust.
    const PAD = 1e-9;
    // Head-on through the centre.
    expect(
      segPolygonHit({ x: -maxTravel / 2, y: 0 }, { x: maxTravel / 2, y: 0 }, isle.poly, PAD),
    ).not.toBeNull();
    // The case a point sample misses: a grazing chord whose BOTH endpoints sit
    // outside the island while the middle of the travel crosses its coastline.
    const offset = rMin - 0.15; // just under the top vertex at (0, rMin)
    const g0 = { x: -maxTravel / 2, y: offset };
    const g1 = { x: maxTravel / 2, y: offset };
    expect(Math.hypot(g0.x, g0.y)).toBeGreaterThan(rMin); // start clear
    expect(Math.hypot(g1.x, g1.y)).toBeGreaterThan(rMin); // end clear
    const t = segPolygonHit(g0, g1, isle.poly, PAD);
    expect(t).not.toBeNull();
    expect(t!).toBeGreaterThan(0);
    expect(t!).toBeLessThan(1);
  });

  it('detects the fastest projectile crossing the thinnest hull broadside', () => {
    const { id, beam } = thinnestHull();
    const radius = CONFIG.gun.shellRadius;
    const poly = hullSilhouette(id);
    // Broadside at the hull's WIDEST station (max |y| vert), the crossing a
    // point sample is most likely to skip over: the projectile starts clear on
    // one side and ends clear on the other within a single tick's travel.
    const widest = poly.reduce((a, p) => (Math.abs(p.y) > Math.abs(a.y) ? p : a), poly[0]);
    const world = transformPolygon(poly, 0, 0, 0); // heading 0 → local frame
    // Demo length — the swept proof must be constructable at ANY CONFIG speed,
    // so it uses the real per-tick travel whenever that is the larger of the
    // two (a future speed retune below the hull's beam must not fail this
    // test's precondition; the sweep behavior under test is unchanged).
    const half = Math.max(maxTravel / 2, beam / 2 + radius + 1);
    const p0 = { x: widest.x, y: -half };
    const p1 = { x: widest.x, y: half };
    // Genuinely swept-only: neither endpoint is inside or within the shell's own
    // radius of the hull, yet the segment passes clean through the beam.
    for (const p of [p0, p1]) {
      expect(pointInPolygon(p, world)).toBe(false);
      expect(pointPolygonDistance(p, world)).toBeGreaterThan(radius);
    }
    const frac = segPolygonHit(p0, p1, world, radius);
    expect(frac).not.toBeNull();
    expect(frac!).toBeGreaterThan(0);
    expect(frac!).toBeLessThan(1);
  });
});

describe('resolveShipPose — boundary clamp', () => {
  it('leaves a ship well inside the map untouched (no contact, no damp)', () => {
    const prev: Pose = { x: 100, y: 0, heading: 0 };
    const s: ShipState = { x: 100, y: 0, heading: 0, speed: 10 };
    const contact = resolve(prev, s, [], 'torpedoBoat', 900);
    expect(contact).toBe(false);
    expect(s).toEqual({ x: 100, y: 0, heading: 0, speed: 10 });
  });

  it('clamps a ship past the edge so the whole silhouette fits, and the caller damps', () => {
    const maxR = polygonMaxRadius(hullSilhouette('battleship')); // ≈62.3 (stern corner)
    const prev: Pose = { x: 800, y: 0, heading: 0 };
    const s: ShipState = { x: 900, y: 0, heading: 0, speed: 20 };
    const contact = resolve(prev, s, [], 'battleship', 900);
    expect(contact).toBe(true);
    expect(Math.hypot(s.x, s.y)).toBeCloseTo(900 - maxR, 6);
    expect(s.speed).toBeCloseTo(20 * DAMP, 9);
  });
});

describe('resolveShipPose — island push-out (skeleton normal)', () => {
  const island = ngonIsland(0, 0, 50);

  it('leaves a clear ship untouched', () => {
    const prev: Pose = { x: 200, y: 0, heading: 0 };
    const s: ShipState = { x: 200, y: 0, heading: 0, speed: 10 };
    const contact = resolve(prev, s, [island], 'torpedoBoat');
    expect(contact).toBe(false);
    expect(s).toEqual({ x: 200, y: 0, heading: 0, speed: 10 });
  });

  it('pushes an overlapping hull out along the SKELETON normal and damps once', () => {
    // droneMedium broadside at heading π/2: flat side at x = ship.x − 15,
    // over the island's eastern coastline by ~5u.
    const prev: Pose = { x: 62, y: 10, heading: Math.PI / 2 };
    const s: ShipState = { x: 60, y: 10, heading: Math.PI / 2, speed: 12 };
    resolve(prev, s, [island], 'droneMedium');
    // Push direction = away from the nearest skeleton point (the centre),
    // through the candidate centre (60, 10).
    const n = { x: 60 / Math.hypot(60, 10), y: 10 / Math.hypot(60, 10) };
    const disp = { x: s.x - 60, y: s.y - 10 };
    const mag = Math.hypot(disp.x, disp.y);
    expect(mag).toBeGreaterThan(3); // a real correction, not a nudge
    expect(mag).toBeLessThan(10); // minimal-translation push, no teleport
    expect(disp.x * n.y - disp.y * n.x).toBeCloseTo(0, 6); // parallel to the normal
    expect(disp.x * n.x + disp.y * n.y).toBeGreaterThan(0); // outward, not inward
    expect(s.speed).toBeCloseTo(12 * DAMP, 9);
    expect(islandClear(worldPoly(s, 'droneMedium'), island)).toBe(true);
  });

  it('damps speed ONCE per tick even with multiple island contacts (#64 root cause)', () => {
    const islands: Island[] = [ngonIsland(30, 70, 50), ngonIsland(-30, -70, 50)];
    // A valid prev the ship rotated/moved from; the candidate double-overlaps.
    const prev: Pose = { x: -180, y: -6, heading: 0.7 };
    const s: ShipState = { x: -40, y: -6, heading: 0.7, speed: 12 };
    expect(clearOfAll({ x: prev.x, y: prev.y, heading: prev.heading, speed: 0 }, 'battleship', islands)).toBe(true);
    expect(clearOfAll(s, 'battleship', islands)).toBe(false);
    resolve(prev, s, islands, 'battleship');
    expect(s.speed).toBeCloseTo(12 * DAMP, 9); // ONE damp, not DAMP²
    expect(clearOfAll(s, 'battleship', islands)).toBe(true); // tick ends overlap-free
  });
});

describe('graze-slide — a shallow drive past a single island slides, never sticks', () => {
  // The island sits just above the ship's lane; a straight drive clips its top
  // arc, so the correction is ~perpendicular to travel (a lateral deflect, not
  // a head-on brake). The anti-stick guarantee: overlap-free every tick, no
  // significant backward shove (the skeleton normal may carry a small aft
  // component on approach — bounded, never a rewind), and monotone-enough
  // forward progress clear past the island's centre (a wedged ship would
  // freeze at the leading edge instead).
  const island = ngonIsland(0, 0, 50);

  it('slides along the island and past it without sticking or reversing', () => {
    const kin = CONFIG.shipClasses.mineLayer.kinematics;
    const s: ShipState = { x: -200, y: 58, heading: 0, speed: kin.maxSpeed };
    let touched = false;
    let maxX = s.x;
    for (let t = 0; t < 800; t++) {
      const prev: Pose = { x: s.x, y: s.y, heading: s.heading };
      stepShip(s, { throttle: 1, rudder: 0 }, kin, DT);
      if (resolve(prev, s, [island], 'mineLayer')) touched = true;
      expect(clearOfAll(s, 'mineLayer', [island])).toBe(true); // never wedged
      expect(s.x).toBeGreaterThanOrEqual(maxX - 2); // no meaningful backward shove
      maxX = Math.max(maxX, s.x);
    }
    expect(touched).toBe(true); // it was a genuine graze, not a clean miss
    // Slid past the island's widest point rather than sticking at its edge.
    expect(s.x).toBeGreaterThan(island.x);
  });
});

describe('#64 wedge — rotation is blocked by rock (pose-validity rollback)', () => {
  const islands: Island[] = [
    ngonIsland(0, 68, 50), // vertical channel, edge-to-edge gap ≈ 36u
    ngonIsland(0, -68, 50),
  ];
  const overlapsBoth = (s: ShipState): boolean => {
    const poly = worldPoly(s, 'battleship');
    return !islandClear(poly, islands[0]) && !islandClear(poly, islands[1]);
  };

  it('keeps the previous heading when the candidate rotation would jam both islands', () => {
    // A battleship centered in the channel fits at heading 0 but not when turned.
    // Find the smallest rotation that jams BOTH islands (so push-out oscillates
    // and can never clear it — the exact #64 failure the rollback fixes).
    let jam = 0;
    for (let h = 0.05; h <= 1.2; h += 0.05) {
      if (overlapsBoth({ x: 0, y: 0, heading: h, speed: 0 })) {
        jam = h;
        break;
      }
    }
    expect(jam).toBeGreaterThan(0);
    expect(clearOfAll({ x: 0, y: 0, heading: 0, speed: 0 }, 'battleship', islands)).toBe(true);

    const prev: Pose = { x: 0, y: 0, heading: 0 };
    const s: ShipState = { x: 0, y: 0, heading: jam, speed: 10 };
    const contact = resolve(prev, s, islands, 'battleship');
    expect(contact).toBe(true);
    expect(clearOfAll(s, 'battleship', islands)).toBe(true); // ended overlap-free
    expect(s.heading).toBe(0); // rudder blocked — previous heading kept
    expect(s.x).toBeCloseTo(0, 9); // movement (position) preserved
    expect(s.y).toBeCloseTo(0, 9);
  });

  it('full-reverts to the previous pose when the candidate position is trapped', () => {
    // A 3-island pincer 120° apart around the origin: adjacent coastlines are
    // ~21u apart (a battleship fits no gap), so a candidate at (0,0) overlaps at
    // every heading and push-out oscillates without clearing — branches (i) and
    // (ii) both fail, forcing the full revert.
    const trap: Island[] = [
      ngonIsland(0, 70, 50),
      ngonIsland(-60.6, -35, 50),
      ngonIsland(60.6, -35, 50),
    ];
    const prev: Pose = { x: 0, y: 320, heading: 0 }; // clearly valid, outside the trap
    const s: ShipState = { x: 0, y: 0, heading: 0.5, speed: 8 };
    expect(clearOfAll(s, 'battleship', trap)).toBe(false); // candidate is trapped
    const contact = resolve(prev, s, trap, 'battleship');
    expect(contact).toBe(true);
    expect(s.x).toBeCloseTo(prev.x, 9);
    expect(s.y).toBeCloseTo(prev.y, 9);
    expect(s.heading).toBeCloseTo(prev.heading, 9);
  });
});

describe('#64 wedge — full astern escapes a placed wedge in bounded ticks', () => {
  const islands: Island[] = [ngonIsland(30, 70, 50), ngonIsland(-30, -70, 50)];
  const kin = CONFIG.shipClasses.battleship.kinematics;

  it('is a genuine double wedge at placement', () => {
    const s: ShipState = { x: -40, y: -6, heading: 0.7, speed: 0 };
    const poly = worldPoly(s, 'battleship');
    expect(hullIslandOverlap(poly, islands[0])).toBe(true);
    expect(hullIslandOverlap(poly, islands[1])).toBe(true);
  });

  it('backs out within bounded ticks, every resolved tick overlap-free', () => {
    // prev is seeded to the placement pose (valid-by-assumption convention for a
    // ship constructed in place); every subsequent tick's prev is the resolved,
    // overlap-free previous pose.
    const s: ShipState = { x: -40, y: -6, heading: 0.7, speed: 0 };
    let prev: Pose = { x: s.x, y: s.y, heading: s.heading };
    let escapeTick = -1;
    for (let t = 0; t < 600; t++) {
      stepShip(s, { throttle: -1, rudder: 0 }, kin, DT);
      resolve(prev, s, islands, 'battleship');
      expect(clearOfAll(s, 'battleship', islands)).toBe(true);
      prev = { x: s.x, y: s.y, heading: s.heading };
      if (s.x <= -160) {
        escapeTick = t;
        break;
      }
    }
    expect(escapeTick).toBeGreaterThan(0);
    expect(escapeTick).toBeLessThan(600);
  });
});

describe('no-escape invariant: every resolved tick ends overlap-free', () => {
  // A clustered island field; a battleship driven with a wandering rudder must
  // NEVER end a tick overlapping — the property the rollback guarantees.
  const cluster: Island[] = [
    ngonIsland(0, 70, 50),
    ngonIsland(0, -70, 50),
    ngonIsland(150, 0, 45),
    ngonIsland(-150, 20, 45),
  ];
  const kin = CONFIG.shipClasses.battleship.kinematics;

  function drive(seed: number): void {
    const rng = mulberry32(seed);
    const s: ShipState = { x: -40, y: 0, heading: 0, speed: 8 };
    let prev: Pose = { x: s.x, y: s.y, heading: s.heading };
    for (let i = 0; i < 400; i++) {
      stepShip(s, { throttle: rng.float(-1, 1), rudder: rng.float(-1, 1) }, kin, DT);
      resolve(prev, s, cluster, 'battleship', 900);
      expect(clearOfAll(s, 'battleship', cluster)).toBe(true);
      expect(Math.hypot(s.x, s.y)).toBeLessThanOrEqual(
        900 - polygonMaxRadius(hullSilhouette('battleship')) + 1e-6,
      );
      prev = { x: s.x, y: s.y, heading: s.heading };
    }
  }

  it('holds across many random drives through the cluster', () => {
    for (let seed = 1; seed <= 12; seed++) drive(seed);
  });
});

describe('no-escape invariant on a REAL generated map', () => {
  // The post-invariant must hold against actual fractal coastlines, not just
  // n-gon fixtures: ram the biggest landmass, then wander at random — no tick
  // may end with the silhouette overlapping land or outside the boundary.
  it('a long randomized drive never ends a tick overlapping or out of bounds', () => {
    const kin = CONFIG.shipClasses.battleship.kinematics;
    const polyMax = polygonMaxRadius(hullSilhouette('battleship'));
    for (const seed of [7, 33, 90]) {
      const map = generateMap(seed, 20);
      const isle = map.islands.reduce((a, b) => (b.r > a.r ? b : a));
      // Start just off the biggest island's coast, on its map-centre side, bow
      // pointed straight at its bounding centre.
      const d = Math.hypot(isle.x, isle.y);
      const toCentre = { x: -isle.x / d, y: -isle.y / d };
      const s: ShipState = {
        x: isle.x + toCentre.x * (isle.r + polyMax + 20),
        y: isle.y + toCentre.y * (isle.r + polyMax + 20),
        heading: Math.atan2(-toCentre.y, -toCentre.x),
        speed: 0,
      };
      expect(clearOfAll(s, 'battleship', map.islands)).toBe(true); // valid start
      const rng = mulberry32(seed * 7919);
      let prev: Pose = { x: s.x, y: s.y, heading: s.heading };
      let contacts = 0;
      for (let t = 0; t < 1200; t++) {
        const throttle = t < 200 ? 1 : rng.float(-1, 1); // ram first, wander after
        stepShip(s, { throttle, rudder: t < 200 ? 0 : rng.float(-1, 1) }, kin, DT);
        if (resolve(prev, s, map.islands, 'battleship', map.radius)) contacts++;
        expect(clearOfAll(s, 'battleship', map.islands)).toBe(true);
        expect(Math.hypot(s.x, s.y)).toBeLessThanOrEqual(map.radius - polyMax + 1e-6);
        prev = { x: s.x, y: s.y, heading: s.heading };
      }
      expect(contacts).toBeGreaterThan(0); // the drive genuinely exercised collision
    }
  });
});

describe('cove escape — the worst concavity the generator produces (measured)', () => {
  // Measured across seeds 1..400 at playerCap 20 (convex-hull pocket depth —
  // distance from a coastline vertex to the polygon's convex hull; mouth = the
  // spanning hull-bridge length):
  //   deepest cove:         seed 333, island 12, vertex 8  — 119.6u deep, 635.7u mouth
  //   narrowest deep notch: seed 363, island 10, vertex 40 —  41.3u deep, 103.6u mouth
  // A torpedo boat (thinnest hull — reaches deepest into a notch) is driven
  // bow-first into the cove bottom at full throttle until wedged, then ordered
  // full astern: it must come fully clear within 40 ticks (2s) of the helm
  // order, and at NO tick — wedging in or backing out — may its silhouette
  // overlap land. Re-measure and re-pin if the generator's shape math changes.
  const cases = [
    { name: 'deepest cove', seed: 333, isle: 12, vert: 8 },
    { name: 'narrowest deep notch', seed: 363, isle: 10, vert: 40 },
  ] as const;

  const kin = CONFIG.shipClasses.torpedoBoat.kinematics;
  const polyMax = polygonMaxRadius(hullSilhouette('torpedoBoat'));

  /** Walk outward along the cove normal until the placement pose is clear. */
  function clearStart(v: Vec2, n: { nx: number; ny: number }, heading: number, isles: readonly Island[]): ShipState {
    for (let back = polyMax + 5; back < polyMax + 200; back += 2) {
      const s: ShipState = { x: v.x + n.nx * back, y: v.y + n.ny * back, heading, speed: 0 };
      if (clearOfAll(s, 'torpedoBoat', isles)) return s;
    }
    throw new Error('no clear start pose found outside the cove');
  }

  for (const c of cases) {
    it(`wedges into the ${c.name} (seed ${c.seed}) and backs clear within 40 ticks`, () => {
      const map = generateMap(c.seed, 20);
      const isle = map.islands[c.isle];
      const v = isle.poly[c.vert]; // the cove-bottom vertex
      const n = skeletonNormal(v, isle); // outward at the cove bottom
      const s = clearStart(v, n, Math.atan2(-n.ny, -n.nx), map.islands);
      let prev: Pose = { x: s.x, y: s.y, heading: s.heading };
      const step = (throttle: number): boolean => {
        stepShip(s, { throttle, rudder: 0 }, kin, DT);
        const contact = resolve(prev, s, map.islands, 'torpedoBoat', map.radius);
        expect(clearOfAll(s, 'torpedoBoat', map.islands)).toBe(true); // NEVER overlaps land
        prev = { x: s.x, y: s.y, heading: s.heading };
        return contact;
      };

      // Phase 1 — full throttle into the cove bottom until wedged.
      let wedged = false;
      for (let t = 0; t < 60; t++) {
        if (step(1)) wedged = true;
      }
      expect(wedged).toBe(true); // it genuinely hit the coastline
      const wedgeDist = Math.hypot(s.x - v.x, s.y - v.y);

      // Phase 2 — helm order: full astern. Must come fully clear within 40 ticks.
      let escapeTick = -1;
      for (let t = 0; t < 40; t++) {
        const contact = step(-1);
        const retreated = Math.hypot(s.x - v.x, s.y - v.y) > wedgeDist + 2;
        if (!contact && retreated) {
          escapeTick = t;
          break;
        }
      }
      expect(escapeTick).toBeGreaterThanOrEqual(0);
      expect(escapeTick).toBeLessThan(40);
    });
  }
});

describe('anti-teleport: no single resolve teleports the center', () => {
  it('a deep single-island overlap resolves within the penetration bound', () => {
    const island = ngonIsland(0, 0, 70);
    const poly = hullSilhouette('torpedoBoat');
    const polyMax = polygonMaxRadius(poly);
    const prev: Pose = { x: 0, y: -140, heading: Math.PI / 2 };
    const s: ShipState = { x: 0, y: -60, heading: Math.PI / 2, speed: 5 };
    const cand = { x: s.x, y: s.y };
    resolve(prev, s, [island], 'torpedoBoat');
    const moved = Math.hypot(s.x - cand.x, s.y - cand.y);
    // Strict upper bound on a legitimate push: separating the bounding circles
    // (isle.r + polyMax) certainly separates the polygons.
    expect(moved).toBeLessThanOrEqual(island.r + polyMax + 1e-3);
    expect(clearOfAll(s, 'torpedoBoat', [island])).toBe(true);
  });
});

// --- BITE PROOF: the pose-validity rollback anchor is load-bearing. Feeding
//     the resolver the CANDIDATE pose as `prev` (no valid anchor to roll back
//     to — behaviorally the pre-P1 push-only resolver) leaves overlap ticks
//     that the real prev-anchored rollback never does. ------------------------
describe('bite proof — without the rollback anchor, push-only resolution wedges', () => {
  const channel: Island[] = [ngonIsland(0, 68, 50), ngonIsland(0, -68, 50)];
  const kin = CONFIG.shipClasses.battleship.kinematics;

  /** Creep forward with hard rudder in the tight channel; report whether any
   *  resolved tick ended overlapping. */
  function driveRudder(withAnchor: boolean): boolean {
    const s: ShipState = { x: 0, y: 0, heading: 0, speed: 8 };
    let prev: Pose = { x: s.x, y: s.y, heading: s.heading };
    let everOverlapped = false;
    for (let t = 0; t < 80; t++) {
      stepShip(s, { throttle: 0.3, rudder: 1 }, kin, DT);
      const anchor = withAnchor ? prev : { x: s.x, y: s.y, heading: s.heading };
      resolve(anchor, s, channel, 'battleship');
      if (!clearOfAll(s, 'battleship', channel)) everOverlapped = true;
      prev = { x: s.x, y: s.y, heading: s.heading };
    }
    return everOverlapped;
  }

  it('anchored rollback: every tick overlap-free; anchor-less: overlaps at some tick', () => {
    expect(driveRudder(true)).toBe(false); // rollback never leaves a tick overlapping
    expect(driveRudder(false)).toBe(true); // push-only (no valid anchor) wedges — bite confirmed
  });

  it('anchored rollback clears the jam pose; anchor-less leaves it overlapping', () => {
    // The exact both-islands-jammed candidate from the rotation-blocked test.
    let jam = 0;
    for (let h = 0.05; h <= 1.2; h += 0.05) {
      const t: ShipState = { x: 0, y: 0, heading: h, speed: 0 };
      const poly = worldPoly(t, 'battleship');
      if (!islandClear(poly, channel[0]) && !islandClear(poly, channel[1])) {
        jam = h;
        break;
      }
    }
    expect(jam).toBeGreaterThan(0);

    const anchored: ShipState = { x: 0, y: 0, heading: jam, speed: 0 };
    resolve({ x: 0, y: 0, heading: 0 }, anchored, channel, 'battleship');
    expect(clearOfAll(anchored, 'battleship', channel)).toBe(true);

    const anchorless: ShipState = { x: 0, y: 0, heading: jam, speed: 0 };
    resolve({ x: 0, y: 0, heading: jam }, anchorless, channel, 'battleship');
    expect(clearOfAll(anchorless, 'battleship', channel)).toBe(false); // can't escape the jam
  });
});
