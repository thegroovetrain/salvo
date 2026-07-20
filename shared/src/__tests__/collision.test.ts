import { describe, it, expect } from 'vitest';
import { segCircleHit } from '../math/geom.js';
import { CONFIG, HULL_IDS, hullEnvelope } from '../constants.js';
import { MAP_RULES } from '../sim/map.js';
import { resolveShipPose, type Pose } from '../sim/collision.js';
import {
  closestPointOnPolygon,
  hullSilhouette,
  pointInPolygon,
  pointPolygonDistance,
  polygonMaxRadius,
  transformPolygon,
} from '../sim/silhouette.js';
import { stepShip } from '../sim/ship.js';
import { mulberry32 } from '../math/rng.js';
import type { ShipState } from '../sim/ship.js';
import type { Circle } from '../types.js';
import type { Vec2 } from '../math/vec.js';

const DAMP = CONFIG.ship.islandSpeedMult;
const DT = CONFIG.tick.simDtMs / 1000;
const BIG_MAP = 100000; // effectively boundless for island-only cases
const maxProjSpeed = Math.max(CONFIG.gun.shellSpeed, CONFIG.torpedo.speed);
const maxTravel = maxProjSpeed * DT;

type HullId = Parameters<typeof hullSilhouette>[0];

function worldPoly(ship: ShipState, hullId: HullId): Vec2[] {
  return transformPolygon(hullSilhouette(hullId), ship.x, ship.y, ship.heading);
}

/** True iff the posed hull is clear of a single island (touching counts as clear). */
function islandClear(poly: readonly Vec2[], isle: Circle): boolean {
  return pointPolygonDistance(isle, poly) >= isle.r - 1e-6;
}

/** True iff the posed hull is clear of EVERY island. */
function clearOfAll(ship: ShipState, hullId: HullId, isles: readonly Circle[]): boolean {
  const poly = worldPoly(ship, hullId);
  return isles.every((i) => islandClear(poly, i));
}

/** Resolve + apply the caller-side single damp (what world.ts / prediction.ts do). */
function resolve(prev: Pose, s: ShipState, isles: readonly Circle[], hullId: HullId, mapR = BIG_MAP): boolean {
  const { contact } = resolveShipPose(prev, s, isles, mapR, hullSilhouette(hullId));
  if (contact) s.speed *= DAMP;
  return contact;
}

// --- The PRE-P1 resolver (bite-proof scaffold): 4-pass push-out, single damp,
//     NO pose-validity rollback — exactly what resolveShipPose replaced. -------
function oldResolve(s: ShipState, isles: readonly Circle[], hullId: HullId, mapR = BIG_MAP): void {
  const poly = hullSilhouette(hullId);
  const maxR = polygonMaxRadius(poly);
  const d0 = Math.hypot(s.x, s.y);
  const lim = mapR - maxR;
  if (d0 > lim) {
    const k = lim / d0;
    s.x *= k;
    s.y *= k;
    s.speed *= DAMP;
  }
  const world = transformPolygon(poly, s.x, s.y, s.heading);
  let contacted = false;
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (const isle of isles) {
      const q = closestPointOnPolygon(isle, world);
      const inside = pointInPolygon(isle, world);
      if (!inside && q.dist >= isle.r) continue;
      let nx: number;
      let ny: number;
      let depth: number;
      if (!inside && q.dist > 1e-9) {
        nx = (q.x - isle.x) / q.dist;
        ny = (q.y - isle.y) / q.dist;
        depth = isle.r - q.dist;
      } else {
        const dx = s.x - isle.x;
        const dy = s.y - isle.y;
        const dd = Math.hypot(dx, dy);
        nx = dd > 1e-9 ? dx / dd : 1;
        ny = dd > 1e-9 ? dy / dd : 0;
        depth = isle.r + q.dist;
      }
      s.x += nx * depth;
      s.y += ny * depth;
      for (const p of world) {
        p.x += nx * depth;
        p.y += ny * depth;
      }
      moved = true;
    }
    if (moved) contacted = true;
    else break;
  }
  if (contacted) s.speed *= DAMP;
}

describe('swept-shell no tunneling (worst case from CONFIG)', () => {
  it('per-tick travel is smaller than the thinnest obstacle', () => {
    expect(maxTravel).toBeLessThan(2 * MAP_RULES.MIN_R);
    for (const id of HULL_IDS) {
      expect(maxTravel).toBeLessThan(hullEnvelope(id).hull.beam);
    }
  });

  it('detects the fastest shell crossing the thinnest island', () => {
    const island = { x: 0, y: 0 };
    const r = MAP_RULES.MIN_R;
    const p0 = { x: -maxTravel / 2, y: 0 };
    const p1 = { x: maxTravel / 2, y: 0 };
    expect(segCircleHit(p0, p1, island, r)).not.toBeNull();
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

describe('resolveShipPose — island push-out', () => {
  const island: Circle = { x: 0, y: 0, r: 50 };

  it('leaves a clear ship untouched', () => {
    const prev: Pose = { x: 200, y: 0, heading: 0 };
    const s: ShipState = { x: 200, y: 0, heading: 0, speed: 10 };
    const contact = resolve(prev, s, [island], 'torpedoBoat');
    expect(contact).toBe(false);
    expect(s).toEqual({ x: 200, y: 0, heading: 0, speed: 10 });
  });

  it('pushes an overlapping hull out along the contact normal and damps once', () => {
    // droneMedium broadside at heading π/2: flat side at x = ship.x − 15, over
    // the island by 5.
    const prev: Pose = { x: 62, y: 10, heading: Math.PI / 2 };
    const s: ShipState = { x: 60, y: 10, heading: Math.PI / 2, speed: 12 };
    resolve(prev, s, [island], 'droneMedium');
    expect(s.x).toBeCloseTo(65, 4); // pushed straight out along +x
    expect(s.y).toBeCloseTo(10, 4);
    expect(s.speed).toBeCloseTo(12 * DAMP, 9);
    expect(islandClear(worldPoly(s, 'droneMedium'), island)).toBe(true);
  });

  it('damps speed ONCE per tick even with multiple island contacts (#64 root cause)', () => {
    const islands: Circle[] = [
      { x: 30, y: 70, r: 50 },
      { x: -30, y: -70, r: 50 },
    ];
    // A valid prev the ship rotated/moved from; the candidate double-overlaps.
    const prev: Pose = { x: -180, y: -6, heading: 0.7 };
    const s: ShipState = { x: -40, y: -6, heading: 0.7, speed: 12 };
    expect(clearOfAll(s, 'battleship', islands)).toBe(false);
    resolve(prev, s, islands, 'battleship');
    expect(s.speed).toBeCloseTo(12 * DAMP, 9); // ONE damp, not DAMP²
    expect(clearOfAll(s, 'battleship', islands)).toBe(true); // tick ends overlap-free
  });
});

describe('graze-slide — a shallow drive past a single island slides, never sticks', () => {
  // The island sits just above the ship's lane; a straight drive clips its lower
  // arc, so the contact normal is ~perpendicular to travel (a lateral deflect,
  // not a head-on brake). The ship slides ALONG the island and past it — the
  // anti-stick guarantee: overlap-free every tick, never shoved backward, and it
  // makes monotone forward progress clear past the island's center (a wedged
  // ship would freeze at the leading edge instead).
  const island: Circle = { x: 0, y: 0, r: 50 };

  it('slides along the island and past it without sticking or reversing', () => {
    const kin = CONFIG.shipClasses.mineLayer.kinematics;
    const s: ShipState = { x: -200, y: 58, heading: 0, speed: kin.maxSpeed };
    for (let t = 0; t < 800; t++) {
      const prev: Pose = { x: s.x, y: s.y, heading: s.heading };
      stepShip(s, { throttle: 1, rudder: 0 }, kin, DT);
      resolve(prev, s, [island], 'mineLayer');
      expect(clearOfAll(s, 'mineLayer', [island])).toBe(true); // never wedged
      expect(s.x).toBeGreaterThanOrEqual(prev.x - 1e-6); // never shoved backward
    }
    // Slid past the island's widest point rather than sticking at its edge.
    expect(s.x).toBeGreaterThan(island.x);
  });
});

describe('#64 wedge — rotation is blocked by rock (pose-validity rollback)', () => {
  const islands: Circle[] = [
    { x: 0, y: 68, r: 50 }, // vertical channel, edge-to-edge gap 36u
    { x: 0, y: -68, r: 50 },
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
    // A 3-island pincer 120° apart around the origin: adjacent island edges are
    // ~21u apart (a battleship fits no gap), so a candidate at (0,0) overlaps at
    // every heading and push-out oscillates without clearing — branches (i) and
    // (ii) both fail, forcing the full revert.
    const trap: Circle[] = [
      { x: 0, y: 70, r: 50 },
      { x: -60.6, y: -35, r: 50 },
      { x: 60.6, y: -35, r: 50 },
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
  const islands: Circle[] = [
    { x: 30, y: 70, r: 50 },
    { x: -30, y: -70, r: 50 },
  ];
  const kin = CONFIG.shipClasses.battleship.kinematics;

  it('is a genuine double wedge at placement', () => {
    const s: ShipState = { x: -40, y: -6, heading: 0.7, speed: 0 };
    const poly = worldPoly(s, 'battleship');
    expect(islands[0].r - pointPolygonDistance(islands[0], poly)).toBeGreaterThan(5);
    expect(islands[1].r - pointPolygonDistance(islands[1], poly)).toBeGreaterThan(5);
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
  const cluster: Circle[] = [
    { x: 0, y: 70, r: 50 },
    { x: 0, y: -70, r: 50 },
    { x: 150, y: 0, r: 45 },
    { x: -150, y: 20, r: 45 },
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
      expect(Math.hypot(s.x, s.y)).toBeLessThanOrEqual(900 - polygonMaxRadius(hullSilhouette('battleship')) + 1e-6);
      prev = { x: s.x, y: s.y, heading: s.heading };
    }
  }

  it('holds across many random drives through the cluster', () => {
    for (let seed = 1; seed <= 12; seed++) drive(seed);
  });
});

describe('anti-teleport: no single resolve teleports the center', () => {
  it('a deep single-island overlap resolves within the penetration bound', () => {
    const island: Circle = { x: 0, y: 0, r: 70 };
    const poly = hullSilhouette('torpedoBoat');
    const polyMax = polygonMaxRadius(poly);
    const prev: Pose = { x: 0, y: -140, heading: Math.PI / 2 };
    const s: ShipState = { x: 0, y: -60, heading: Math.PI / 2, speed: 5 };
    const cand = { x: s.x, y: s.y };
    resolve(prev, s, [island], 'torpedoBoat');
    const moved = Math.hypot(s.x - cand.x, s.y - cand.y);
    // Strict upper bound on a legitimate push (no ~97u pathological jump).
    expect(moved).toBeLessThanOrEqual(island.r + polyMax + 1e-3);
    expect(clearOfAll(s, 'torpedoBoat', [island])).toBe(true);
  });
});

// --- BITE PROOF: the wedge + invariant FAIL against the pre-P1 push-only
//     resolver, and PASS against resolveShipPose. -----------------------------
describe('bite proof — the old push-only resolver fails what the rollback fixes', () => {
  const channel: Circle[] = [
    { x: 0, y: 68, r: 50 },
    { x: 0, y: -68, r: 50 },
  ];
  const kin = CONFIG.shipClasses.battleship.kinematics;

  /** Creep forward with hard rudder in the tight channel; report whether any
   *  resolved tick ended overlapping. */
  function driveRudder(resolveFn: (prev: Pose, s: ShipState) => void): boolean {
    const s: ShipState = { x: 0, y: 0, heading: 0, speed: 8 };
    let prev: Pose = { x: s.x, y: s.y, heading: s.heading };
    let everOverlapped = false;
    for (let t = 0; t < 80; t++) {
      stepShip(s, { throttle: 0.3, rudder: 1 }, kin, DT);
      resolveFn(prev, s);
      if (!clearOfAll(s, 'battleship', channel)) everOverlapped = true;
      prev = { x: s.x, y: s.y, heading: s.heading };
    }
    return everOverlapped;
  }

  it('rollback resolver: every tick overlap-free; OLD resolver: overlaps at some tick', () => {
    const withRollback = driveRudder((prev, s) => resolve(prev, s, channel, 'battleship'));
    const withOld = driveRudder((_prev, s) => oldResolve(s, channel, 'battleship'));
    expect(withRollback).toBe(false); // rollback never leaves a tick overlapping
    expect(withOld).toBe(true); // the pre-P1 push-only resolver wedges (bite confirmed)
  });

  it('rollback resolver clears the jam pose; OLD resolver leaves it overlapping', () => {
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

    const rollback: ShipState = { x: 0, y: 0, heading: jam, speed: 0 };
    resolve({ x: 0, y: 0, heading: 0 }, rollback, channel, 'battleship');
    expect(clearOfAll(rollback, 'battleship', channel)).toBe(true);

    const old: ShipState = { x: 0, y: 0, heading: jam, speed: 0 };
    oldResolve(old, channel, 'battleship');
    expect(clearOfAll(old, 'battleship', channel)).toBe(false); // OLD can't escape the jam
  });
});
