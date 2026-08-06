import { describe, it, expect } from 'vitest';
import { CONFIG, HULL_IDS, hullEnvelope } from '../constants.js';
import { MAP_RULES, generateMap, islandFromPolygon } from '../sim/map.js';
import {
  applyGroundingDamp,
  groundingSpeedFactor,
  resolveShipPose,
  type Pose,
  type ShipPoseResult,
} from '../sim/collision.js';
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
import { wrapAngle } from '../math/angle.js';
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

/** Resolve + apply the SHARED grounding damp (exactly what world.ts /
 *  prediction.ts do — one implementation, called with the hull's rated max). */
function resolve(
  prev: Pose,
  s: ShipState,
  isles: readonly Island[],
  hullId: HullId,
  mapR = BIG_MAP,
): ShipPoseResult {
  const res = resolveShipPose(prev, s, isles, mapR, hullSilhouette(hullId));
  applyGroundingDamp(s, res, hullEnvelope(hullId).kinematics.maxSpeed);
  return res;
}

/** The speed a contact of this head-on-ness caps `hullId` at (u/s). */
function groundedCap(hullId: HullId, headOn: number): number {
  return hullEnvelope(hullId).kinematics.maxSpeed * groundingSpeedFactor(headOn);
}

/** Distance from the map centre to the FURTHEST hull vert at this pose. */
function maxVertRadius(s: ShipState, hullId: HullId): number {
  return Math.max(...worldPoly(s, hullId).map((p) => Math.hypot(p.x, p.y)));
}

/** True iff every vert of the posed hull sits inside the map circle. */
function insideMapCircle(s: ShipState, hullId: HullId, mapR: number): boolean {
  return worldPoly(s, hullId).every((p) => Math.hypot(p.x, p.y) <= mapR + 1e-6);
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

// The map edge is a WALL, not ground (Eric ruling 2026-08-06). Pre-fix this
// block asserted the opposite — `contact: true` plus a full damp on a pure
// boundary press, and a clamp at `mapRadius − polygonMaxRadius` regardless of
// heading. Both assertions are DELIBERATELY inverted here: they encoded the
// two mechanisms of the "pinned in open ocean" bug.
describe('resolveShipPose — boundary clamp (heading-aware, never grounding)', () => {
  it('leaves a ship well inside the map untouched (no contact, no damp)', () => {
    const prev: Pose = { x: 100, y: 0, heading: 0 };
    const s: ShipState = { x: 100, y: 0, heading: 0, speed: 10 };
    const res = resolve(prev, s, [], 'torpedoBoat', 900);
    expect(res.contact).toBe(false);
    expect(s).toEqual({ x: 100, y: 0, heading: 0, speed: 10 });
  });

  it('clamps a ship past the edge without reporting grounding or touching speed', () => {
    const prev: Pose = { x: 800, y: 0, heading: 0 };
    const s: ShipState = { x: 900, y: 0, heading: 0, speed: 20 };
    const res = resolve(prev, s, [], 'battleship', 900);
    expect(res.contact).toBe(false); // the edge is not ground
    expect(res.headOn).toBe(0);
    expect(s.speed).toBe(20); // and it costs no way at all
    expect(insideMapCircle(s, 'battleship', 900)).toBe(true);
  });

  it('clamps by the hull FIT at its pose, not by the bounding radius', () => {
    const local = hullSilhouette('battleship');
    const maxR = polygonMaxRadius(local); // ≈62.3 — the old heading-independent wall
    const bow = Math.max(...local.map((p) => p.x)); // reach when driving at the edge
    const beam = Math.max(...local.map((p) => Math.abs(p.y))); // reach when parallel to it
    expect(beam).toBeLessThan(maxR - 30); // the wall stood materially inside the drawn edge

    // Bow-on: the hull stops with its BOW on the boundary, not its bounding circle.
    const head: ShipState = { x: 900, y: 0, heading: 0, speed: 20 };
    resolve({ x: 800, y: 0, heading: 0 }, head, [], 'battleship', 900);
    expect(Math.hypot(head.x, head.y)).toBeCloseTo(900 - bow, 6);
    expect(maxVertRadius(head, 'battleship')).toBeCloseTo(900, 6); // exactly touching

    // Parallel to the edge: it may come ~(maxR − beam) ≈ 46u closer than before,
    // and the clamp is still exact — the outboard side just kisses the circle.
    const along: ShipState = { x: 900, y: 0, heading: Math.PI / 2, speed: 20 };
    resolve({ x: 800, y: 0, heading: Math.PI / 2 }, along, [], 'battleship', 900);
    expect(Math.hypot(along.x, along.y)).toBeGreaterThan(900 - maxR + 30);
    expect(maxVertRadius(along, 'battleship')).toBeCloseTo(900, 6);
    expect(insideMapCircle(along, 'battleship', 900)).toBe(true); // still impenetrable
  });

  it('holds the edge impenetrable at every heading (sampled all round)', () => {
    for (let h = 0; h < TAU; h += TAU / 64) {
      for (const bearing of [0, 1.1, 2.7, 4.3]) {
        const s: ShipState = {
          x: Math.cos(bearing) * 5000,
          y: Math.sin(bearing) * 5000,
          heading: h,
          speed: 20,
        };
        resolve({ x: 0, y: 0, heading: h }, s, [], 'battleship', 900);
        expect(insideMapCircle(s, 'battleship', 900)).toBe(true);
      }
    }
  });
});

// --- THE OPEN-OCEAN PIN (cycle 59 regression) -------------------------------
// The investigation repro, verbatim: seed 1, battleship at (1200, 0), heading
// 0, full ahead, rudder amidships, driven onto the map edge. Pre-fix it
// settled at distFromCenter = mapRadius − 62.29 (the heading-independent
// bounding radius) doing 0.083 u/s — rudder authority 0.24 deg/s, a
// SIX-MINUTE 90° turn — with the nearest land 368u away, because the boundary
// press reported as grounding and the per-tick damp compounded every tick the
// player held throttle.
describe('open-ocean pin — pressing the map edge is not grounding', () => {
  const kin = CONFIG.shipClasses.battleship.kinematics;
  const polyMax = polygonMaxRadius(hullSilhouette('battleship'));
  /** The pre-fix fixed point of the per-tick multiplier: accel·dt·m/(1−m). */
  const OLD_PINNED_SPEED = (kin.accel * DT * DAMP) / (1 - DAMP);
  /** Rudder authority there (deg/s) — the six-minute 90° turn. */
  const OLD_PINNED_TURN = ((OLD_PINNED_SPEED / kin.steerageSpeed) * kin.turnRate * 180) / Math.PI;

  const map = generateMap(1, 10);
  /** Clearance from the hull's bounding circle to the nearest coastline. */
  const landGap = (s: ShipState): number =>
    Math.min(...map.islands.map((i) => Math.hypot(s.x - i.x, s.y - i.y) - i.r - polyMax));

  /** Drive the repro and return the final state. */
  function pressEdge(ticks: number, rudder: number): ShipState {
    const s: ShipState = { x: 1200, y: 0, heading: 0, speed: kin.maxSpeed };
    let prev: Pose = { x: s.x, y: s.y, heading: s.heading };
    for (let t = 0; t < ticks; t++) {
      stepShip(s, { throttle: 1, rudder }, kin, DT);
      resolve(prev, s, map.islands, 'battleship', map.radius);
      expect(insideMapCircle(s, 'battleship', map.radius)).toBe(true); // edge stays a wall
      prev = { x: s.x, y: s.y, heading: s.heading };
    }
    return s;
  }

  it('the pre-fix numbers really were a pin (documented, not asserted behavior)', () => {
    expect(OLD_PINNED_SPEED).toBeLessThan(0.1);
    expect(OLD_PINNED_TURN).toBeLessThan(0.3); // deg/s — 90° in ~6 minutes
  });

  it('keeps full way and full helm authority pinned against the edge', () => {
    const s = pressEdge(600, 0);
    // Hard against the edge, bow ON the boundary (not 62.3u inside it) …
    expect(map.radius - Math.hypot(s.x, s.y)).toBeLessThan(polyMax);
    expect(maxVertRadius(s, 'battleship')).toBeCloseTo(map.radius, 6);
    // … in genuinely open water: nothing to ground on for hundreds of units.
    expect(landGap(s)).toBeGreaterThan(200);
    // THE FIX: full way, and therefore full rudder authority.
    expect(s.speed).toBeCloseTo(kin.maxSpeed, 6);
    expect(s.speed / kin.steerageSpeed).toBeGreaterThanOrEqual(1);
  });

  it('turns away from the edge in a few seconds, not six minutes', () => {
    const s = pressEdge(600, 0); // pinned bow-on, heading 0
    let prev: Pose = { x: s.x, y: s.y, heading: s.heading };
    let turnTick = -1;
    for (let t = 0; t < 200; t++) {
      stepShip(s, { throttle: 1, rudder: 1 }, kin, DT);
      resolve(prev, s, map.islands, 'battleship', map.radius);
      expect(insideMapCircle(s, 'battleship', map.radius)).toBe(true);
      prev = { x: s.x, y: s.y, heading: s.heading };
      if (Math.abs(wrapAngle(s.heading)) >= Math.PI / 2) {
        turnTick = t;
        break;
      }
    }
    expect(turnTick).toBeGreaterThanOrEqual(0);
    // 78 ticks measured (3.9 s) at the full 0.4 rad/s; the pre-fix pin needed
    // ~6 minutes at 0.24 deg/s, i.e. >7000 ticks.
    expect(turnTick).toBeLessThan(100);
    expect(s.speed).toBeGreaterThan(kin.steerageSpeed); // never lost steerage
  });
});

// --- COASTAL GROUNDING (cycle 59) -------------------------------------------
// The other half of the ruling: driven hard into a REAL generated coastline the
// hull is stopped without penetration, but the directional damp leaves it
// enough way to keep steerage, so helm alone recovers it in bounded time.
describe('coastal grounding — stopped, never pinned', () => {
  const kin = CONFIG.shipClasses.battleship.kinematics;
  const map = generateMap(1, 20); // production ocean size (fillTo = 20)

  it('grounds on a real coastline, holds steerage, and turns off it in bounded ticks', () => {
    const s: ShipState = { x: 1200, y: 0, heading: 0, speed: kin.maxSpeed };
    let prev: Pose = { x: s.x, y: s.y, heading: s.heading };
    let groundTick = -1;
    let last: ShipPoseResult = { contact: false, headOn: 0 };
    let travel = 0;
    for (let t = 0; t < 900; t++) {
      const before = { x: s.x, y: s.y };
      stepShip(s, { throttle: 1, rudder: 0 }, kin, DT);
      last = resolve(prev, s, map.islands, 'battleship', map.radius);
      expect(clearOfAll(s, 'battleship', map.islands)).toBe(true); // NEVER penetrates
      prev = { x: s.x, y: s.y, heading: s.heading };
      if (last.contact && groundTick === -1) groundTick = t;
      if (t >= 850) travel += Math.hypot(s.x - before.x, s.y - before.y);
    }
    expect(groundTick).toBeGreaterThan(0); // it genuinely drove onto land
    expect(last.contact).toBe(true); // still aground at the end
    expect(last.headOn).toBeGreaterThan(0.9); // a near-square ram
    // STOPPED: over the last 50 ticks (2.5s) at full throttle it makes barely a
    // hull-width of ground — the rock, not the damp, is what holds it.
    expect(travel).toBeLessThan(20);
    expect(s.speed).toBeLessThanOrEqual(groundedCap('battleship', last.headOn) + 1e-9);
    // … but the cap keeps it at steerage speed, so the helm still answers.
    expect(s.speed).toBeGreaterThanOrEqual(kin.steerageSpeed);

    const h0 = s.heading;
    let freeTick = -1;
    for (let t = 0; t < 200; t++) {
      stepShip(s, { throttle: 1, rudder: 1 }, kin, DT);
      const res = resolve(prev, s, map.islands, 'battleship', map.radius);
      expect(clearOfAll(s, 'battleship', map.islands)).toBe(true);
      prev = { x: s.x, y: s.y, heading: s.heading };
      if (!res.contact && Math.abs(wrapAngle(s.heading - h0)) > 0.5) {
        freeTick = t;
        break;
      }
    }
    expect(freeTick).toBeGreaterThanOrEqual(0);
    expect(freeTick).toBeLessThan(200); // ≤10s of helm, measured ~4s
    expect(s.speed).toBeGreaterThan(kin.steerageSpeed); // and it is making way again
  });

  it('a dead-astern order still backs a rammed hull off (the shipped escape)', () => {
    const rock = ngonIsland(0, 0, 140);
    const s: ShipState = { x: -220, y: 0, heading: 0, speed: kin.maxSpeed };
    let prev: Pose = { x: s.x, y: s.y, heading: s.heading };
    for (let t = 0; t < 60; t++) {
      stepShip(s, { throttle: 1, rudder: 0 }, kin, DT);
      resolve(prev, s, [rock], 'battleship');
      expect(clearOfAll(s, 'battleship', [rock])).toBe(true);
      prev = { x: s.x, y: s.y, heading: s.heading };
    }
    const aground = s.x;
    let freeTick = -1;
    for (let t = 0; t < 120; t++) {
      stepShip(s, { throttle: -1, rudder: 0 }, kin, DT);
      const res = resolve(prev, s, [rock], 'battleship');
      expect(clearOfAll(s, 'battleship', [rock])).toBe(true);
      prev = { x: s.x, y: s.y, heading: s.heading };
      if (!res.contact && s.x < aground - 5) {
        freeTick = t;
        break;
      }
    }
    expect(freeTick).toBeGreaterThanOrEqual(0);
    expect(freeTick).toBeLessThan(120);
  });
});

describe('resolveShipPose — island push-out (skeleton normal)', () => {
  const island = ngonIsland(0, 0, 50);

  it('leaves a clear ship untouched', () => {
    const prev: Pose = { x: 200, y: 0, heading: 0 };
    const s: ShipState = { x: 200, y: 0, heading: 0, speed: 10 };
    const res = resolve(prev, s, [island], 'torpedoBoat');
    expect(res.contact).toBe(false);
    expect(s).toEqual({ x: 200, y: 0, heading: 0, speed: 10 });
  });

  it('pushes an overlapping hull out along the SKELETON normal, GRAZING costs no way', () => {
    // droneMedium broadside at heading π/2: flat side at x = ship.x − 15,
    // over the island's eastern coastline by ~5u.
    const prev: Pose = { x: 62, y: 10, heading: Math.PI / 2 };
    const s: ShipState = { x: 60, y: 10, heading: Math.PI / 2, speed: 12 };
    const res = resolve(prev, s, [island], 'droneMedium');
    // Push direction = away from the nearest skeleton point (the centre),
    // through the candidate centre (60, 10).
    const n = { x: 60 / Math.hypot(60, 10), y: 10 / Math.hypot(60, 10) };
    const disp = { x: s.x - 60, y: s.y - 10 };
    const mag = Math.hypot(disp.x, disp.y);
    expect(mag).toBeGreaterThan(3); // a real correction, not a nudge
    expect(mag).toBeLessThan(10); // minimal-translation push, no teleport
    expect(disp.x * n.y - disp.y * n.x).toBeCloseTo(0, 6); // parallel to the normal
    expect(disp.x * n.x + disp.y * n.y).toBeGreaterThan(0); // outward, not inward
    // DIRECTIONAL DAMP (Eric ruling 2026-08-06): the hull is travelling ~along
    // the coast (heading π/2 against a near-+x escape normal), so the contact
    // is a graze and costs no way at all. Pre-fix this asserted 12 × 0.25.
    expect(res.contact).toBe(true);
    expect(res.headOn).toBe(0);
    expect(s.speed).toBe(12);
    expect(islandClear(worldPoly(s, 'droneMedium'), island)).toBe(true);
  });

  it('applies ONE damp per tick even with multiple island contacts (#64 root cause)', () => {
    const islands: Island[] = [ngonIsland(30, 70, 50), ngonIsland(-30, -70, 50)];
    // A valid prev the ship rotated/moved from; the candidate double-overlaps.
    const prev: Pose = { x: -180, y: -6, heading: 0.7 };
    const s: ShipState = { x: -40, y: -6, heading: 0.7, speed: 12 };
    expect(clearOfAll({ x: prev.x, y: prev.y, heading: prev.heading, speed: 0 }, 'battleship', islands)).toBe(true);
    expect(clearOfAll(s, 'battleship', islands)).toBe(false);
    const res = resolve(prev, s, islands, 'battleship');
    // ONE damp for the whole tick, from the NET escape of both islands — never
    // a per-contact stack (the #64 collapse). The cap is the ruled
    // maxSpeed-relative one, so it is also idempotent by construction.
    expect(res.contact).toBe(true);
    expect(s.speed).toBeCloseTo(Math.min(12, groundedCap('battleship', res.headOn)), 9);
    expect(clearOfAll(s, 'battleship', islands)).toBe(true); // tick ends overlap-free
  });

  it('caps a DEAD-ON ram at islandSpeedMult × rated max, keeping steerage', () => {
    const kin = CONFIG.shipClasses.battleship.kinematics;
    const rock = ngonIsland(0, 0, 120);
    // Bow pointed at the island centre, driving straight in at full ahead.
    const prev: Pose = { x: -200, y: 0, heading: 0 };
    const s: ShipState = { x: -160, y: 0, heading: 0, speed: kin.maxSpeed };
    const res = resolve(prev, s, [rock], 'battleship');
    expect(res.contact).toBe(true);
    expect(res.headOn).toBeCloseTo(1, 6); // square-on
    expect(s.speed).toBeCloseTo(kin.maxSpeed * DAMP, 9); // the ruled tunable
    // THE POINT of the cap: even fully aground the hull keeps rudder authority
    // (pre-fix the multiplier drove it to 0.083 u/s = 0.24 deg/s).
    expect(s.speed).toBeGreaterThanOrEqual(kin.steerageSpeed);
  });
});

// --- R4 REGRESSION (adversarial review gate, cycle 51) ----------------------
// The shipped defect: `skeletonNormal` aimed the escape from the nearest
// skeleton POINT while map-gen validated star-shapedness about the skeleton
// POLYLINE. A hull ramming a long 2-POINT RIDGE broadside AMIDSHIPS therefore
// got its push direction from a far ridge endpoint — heavily TANGENTIAL to
// the coast — so pushOutOf's "minimal clearing translation" slid it ALONG the
// coastline instead of off it: up to 30.19u in a single 50ms tick against a
// legitimate 2.25u of free travel. Both sides now project onto skeleton
// SEGMENTS via the one shared `nearestOnSkeleton`, so the push is
// perpendicular to the ridge and a resolved tick can never out-travel an
// unobstructed one.
describe('broadside ram — the push-out never slides a hull along the coast', () => {
  const kin = CONFIG.shipClasses.battleship.kinematics;
  const local = hullSilhouette('battleship');
  const polyMax = polygonMaxRadius(local);
  const FREE_TRAVEL = kin.maxSpeed * DT; // the most an UNOBSTRUCTED tick can move

  /** Back off along `n` from `mid` until the posed hull is clear of everything. */
  function clearStart(mid: Vec2, nx: number, ny: number, isles: readonly Island[]): ShipState | null {
    for (let back = polyMax; back < polyMax + 400; back += 8) {
      const s: ShipState = {
        x: mid.x + nx * back,
        y: mid.y + ny * back,
        heading: Math.atan2(-ny, -nx),
        speed: kin.maxSpeed,
      };
      if (clearOfAll(s, 'battleship', isles)) return s;
    }
    return null;
  }

  it('rams every long 2-point ridge amidships without ever out-travelling a free tick', () => {
    let rams = 0;
    let contacts = 0;
    let worst = 0;
    let worstDesc = '';
    let overlaps = 0;
    for (let seed = 0; seed < 8; seed++) {
      const map = generateMap(seed, 20);
      for (const isle of map.islands) {
        if (isle.skeleton.length !== 2) continue;
        const [a, b] = isle.skeleton;
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len < 150) continue; // a LONG ridge — the worst tangential lever arm
        const tx = (b.x - a.x) / len;
        const ty = (b.y - a.y) / len;
        for (const f of [0.35, 0.5, 0.65]) {
          for (const side of [1, -1]) {
            const mid = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
            const s = clearStart(mid, -ty * side, tx * side, map.islands);
            if (!s) continue;
            rams++;
            let prev: Pose = { x: s.x, y: s.y, heading: s.heading };
            for (let t = 0; t < 40; t++) {
              s.speed = kin.maxSpeed; // pinned at full ahead: no damping reprieve
              stepShip(s, { throttle: 1, rudder: 0 }, kin, DT);
              if (resolve(prev, s, map.islands, 'battleship', map.radius).contact) contacts++;
              if (!clearOfAll(s, 'battleship', map.islands)) overlaps++;
              const moved = Math.hypot(s.x - prev.x, s.y - prev.y);
              if (moved > worst) {
                worst = moved;
                worstDesc = `seed ${seed} ridge ${len.toFixed(0)}u f=${f} side=${side} tick ${t}`;
              }
              prev = { x: s.x, y: s.y, heading: s.heading };
            }
          }
        }
      }
    }
    expect(rams).toBeGreaterThan(20); // long ridges genuinely exist in the sweep
    expect(contacts).toBeGreaterThan(rams); // and every ram genuinely hit rock
    expect(overlaps).toBe(0); // the shipped post-invariant is NOT regressed
    // THE BOUND. Measured 7.08u before the fix on this harness (30.19u on the
    // reviewer's) and, after it, exactly FREE_TRAVEL to float dust — i.e. the
    // worst resolved tick is now an UNOBSTRUCTED one, and no push-out tick
    // moves the hull further than simply sailing would have.
    const msg = `worst single-tick displacement ${worst.toFixed(4)}u at ${worstDesc}`;
    expect(worst, msg).toBeLessThanOrEqual(FREE_TRAVEL + 1e-9);
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
      if (resolve(prev, s, [island], 'mineLayer').contact) touched = true;
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
    const res = resolve(prev, s, islands, 'battleship');
    expect(res.contact).toBe(true);
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
    const res = resolve(prev, s, trap, 'battleship');
    expect(res.contact).toBe(true);
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
      // The boundary invariant is now stated on the HULL, not on its bounding
      // circle: the clamp is heading-aware (cycle 59), so a hull running
      // parallel to the edge legitimately sits closer than
      // `mapRadius − polygonMaxRadius` — while still fitting inside the disc,
      // which is the impenetrability that actually matters.
      expect(insideMapCircle(s, 'battleship', 900)).toBe(true);
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
        if (resolve(prev, s, map.islands, 'battleship', map.radius).contact) contacts++;
        expect(clearOfAll(s, 'battleship', map.islands)).toBe(true);
        expect(insideMapCircle(s, 'battleship', map.radius)).toBe(true); // hull-exact edge invariant
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
  //   deepest cove:         seed 270, island 8,  vertex 30 —  92.0u deep, 563.6u mouth
  //   narrowest deep notch: seed 74,  island 16, vertex 1  —  40.2u deep, 117.7u mouth
  // RE-PINNED at the cycle-51 review gate: unifying `nearestOnSkeleton` across
  // the generator's star-shape predicate and collision's push-out changed the
  // accept/reject decision, so the RNG stream consumption — and therefore every
  // map — moved (deliberately; nothing had shipped). The same measurement that
  // produced the old pins reproduces them EXACTLY on the pre-fix generator, so
  // these are the same worst cases on the new one. Deepest concavity fell
  // 119.6u -> 92.0u: the tightened predicate rejects the deepest pockets.
  // A torpedo boat (thinnest hull — reaches deepest into a notch) is driven
  // bow-first into the cove bottom at full throttle until wedged, then ordered
  // full astern: it must come fully clear within 40 ticks (2s) of the helm
  // order, and at NO tick — wedging in or backing out — may its silhouette
  // overlap land. Re-measure and re-pin if the generator's shape math changes.
  const cases = [
    { name: 'deepest cove', seed: 270, isle: 8, vert: 30 },
    { name: 'narrowest deep notch', seed: 74, isle: 16, vert: 1 },
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
        const contact = resolve(prev, s, map.islands, 'torpedoBoat', map.radius).contact;
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
