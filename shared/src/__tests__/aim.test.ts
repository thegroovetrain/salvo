// Shared AIM GEOMETRY (sim/aim.ts) — the promoted spawn/burst-point helpers.
//
// These functions exist to make ONE claim structurally true: the client's
// ordnance aim preview draws the shot the server will actually fire. The server
// equipment rows are now thin ShipRecord-shaped wrappers around exactly these,
// so a behavior change here is a change to both sides at once — and these pins
// are what stops a "harmless" refactor from moving a burst point out from under
// a preview circle.

import { describe, it, expect } from 'vitest';
import {
  burstPointAlong,
  clampInsideMap,
  gunReachU,
  hullClearOffset,
  muzzleOrTarget,
  muzzleSpawn,
  pointInLitZone,
  torpedoSpawn,
} from '../sim/aim.js';
import { hullSilhouette, pointPolygonDistance, transformPolygon } from '../sim/silhouette.js';
import { CONFIG, hullEnvelope, type HullId } from '../constants.js';

const HULLS: HullId[] = ['torpedoBoat', 'battleship', 'mineLayer'];

function len(id: HullId): number {
  return hullEnvelope(id).hull.length;
}

describe('hullClearOffset', () => {
  it('is half the hull length plus the extra clearance', () => {
    expect(hullClearOffset(120, 8)).toBe(68);
    expect(hullClearOffset(len('battleship'), 0)).toBe(len('battleship') / 2);
  });
});

describe('muzzleSpawn — the silhouette-edge muzzle (no dead ring)', () => {
  it('lands OUTSIDE the hull polygon on every bearing, for every hull', () => {
    const pose = { x: 100, y: -40, heading: 0.7 };
    for (const id of HULLS) {
      const poly = transformPolygon(hullSilhouette(id), pose.x, pose.y, pose.heading);
      for (let i = 0; i < 24; i++) {
        const dir = (i / 24) * Math.PI * 2;
        const m = muzzleSpawn(pose, id, dir, CONFIG.gun.shellRadius);
        // Strictly outside its own hull: pointPolygonDistance is 0 INSIDE the
        // polygon, so any positive distance is a legal spawn. (It is not always
        // a full shellRadius clear — on a concave bearing, the mineLayer's
        // transom notch, the muzzle legitimately sits inside the open cavity
        // and the shell flies out through it. That is the documented rule.)
        expect(pointPolygonDistance(m, poly), `${id} @ ${dir.toFixed(2)}`).toBeGreaterThan(0);
      }
    }
  });

  it('sits on the aim bearing out of the ship centre', () => {
    const pose = { x: 0, y: 0, heading: 0 };
    const m = muzzleSpawn(pose, 'battleship', 0, CONFIG.gun.shellRadius);
    expect(m.y).toBeCloseTo(0, 6);
    expect(m.x).toBeGreaterThan(0);
    // Bow tip + the shell radius, exactly (the bow is the polygon's +x extreme).
    expect(m.x).toBeCloseTo(len('battleship') / 2 + CONFIG.gun.shellRadius, 3);
  });

  it('rotates with the hull (a heading turn moves the muzzle, not the bearing)', () => {
    const a = muzzleSpawn({ x: 0, y: 0, heading: 0 }, 'torpedoBoat', 0, 2);
    const b = muzzleSpawn({ x: 0, y: 0, heading: Math.PI / 2 }, 'torpedoBoat', 0, 2);
    // Beam-on, the silhouette is much narrower than it is long.
    expect(b.x).toBeLessThan(a.x);
  });
});

describe('clampInsideMap', () => {
  const R = 1000;
  it('leaves an in-disk target untouched', () => {
    const t = { x: 300, y: -200 };
    expect(clampInsideMap({ x: 0, y: 0 }, t, R)).toEqual(t);
  });

  it('pulls an over-the-rim target back just inside the water', () => {
    const p = clampInsideMap({ x: 900, y: 0 }, { x: 1400, y: 0 }, R);
    expect(Math.hypot(p.x, p.y)).toBeLessThan(R);
    expect(Math.hypot(p.x, p.y)).toBeGreaterThan(R - 2); // epsilon, not a big pull-back
  });
});

describe('burstPointAlong — the clicked burst point', () => {
  const center = { x: 0, y: 0 };
  const R = 5000;

  it('honors the clicked distance inside range', () => {
    const p = burstPointAlong(center, 200, R, 650, 0);
    expect(p.x).toBeCloseTo(200, 6);
    expect(p.y).toBeCloseTo(0, 6);
  });

  it('clamps a beyond-range click to the effective range', () => {
    const p = burstPointAlong(center, 5000, R, 650, 0);
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(650, 6);
  });

  it('floors a point-blank click at minU (the command-detonation floor)', () => {
    const p = burstPointAlong(center, 3, R, 650, 0, 70);
    expect(p.x).toBeCloseTo(70, 6);
  });

  it('minU wins over rangeU in the degenerate minU > rangeU case', () => {
    const p = burstPointAlong(center, 10, R, 40, 0, 70);
    expect(p.x).toBeCloseTo(70, 6);
  });

  it('map-clamps a rim shot instead of letting it expire at the edge', () => {
    const p = burstPointAlong({ x: 950, y: 0 }, 400, 1000, 650, 0);
    expect(Math.hypot(p.x, p.y)).toBeLessThan(1000);
  });
});

describe('muzzleOrTarget — no INNER dead ring either', () => {
  const pose = { x: 0, y: 0, heading: 0 };
  it('spawns AT the target for a point-blank click inside the muzzle', () => {
    const target = { x: 10, y: 0 }; // well inside a battleship's 62u bow
    const o = muzzleOrTarget(pose, 'battleship', 0, target, CONFIG.gun.shellRadius);
    expect(o).toEqual(target);
  });

  it('spawns at the muzzle for a normal click', () => {
    const target = { x: 400, y: 0 };
    const o = muzzleOrTarget(pose, 'battleship', 0, target, CONFIG.gun.shellRadius);
    expect(o.x).toBeCloseTo(len('battleship') / 2 + CONFIG.gun.shellRadius, 3);
  });
});

describe('torpedo geometry', () => {
  it('torpedoSpawn is the bow-clear offset along the launch bearing', () => {
    const p = torpedoSpawn({ x: 0, y: 0, heading: 0 }, len('torpedoBoat'), 0);
    const want = hullClearOffset(
      len('torpedoBoat'),
      CONFIG.torpedo.hitRadius + CONFIG.torpedo.spawnClearance,
    );
    expect(p.x).toBeCloseTo(want, 6);
  });

  // The `minCommandDistance` pin is RETIRED with COMMAND DETONATION (Story
  // 7-5): the commanded burst point no longer exists, so there is no "ahead of
  // the spawn point" invariant left to hold.
});

// RETIRED (Story 7-5 wave 2, R2.16): 'BARREL_FAN_STEP_RAD is the ratified 3°
// fan step both sides fan a salvo by'. BARREL's extra shells fly on PARALLEL
// TRACKS now, not a spreading fan, so an angular step is the wrong shape
// entirely — the constant is deleted and its replacement is
// CONFIG.gun.barrelSpacingU (a lateral distance) resolved through
// sim/spread.ts parallelOffsets. Pinned in __tests__/spread.test.ts, with the
// constant's absence pinned in the barrel test.

// ---------- THE STAR-SHELL GUN REACH (R2.15) — the PROMOTED predicate --------
//
// This rule shipped implemented TWICE: `server/src/game/equipment/guns.ts`
// gunReachU (the legality gate) and `client/src/render/weaponArc.ts`
// weaponReachU (the aim preview), agreeing only because one was mirrored off
// the other. Both now CALL what is pinned below, so these are the ONE set of
// pins for the rule — and the two workspace-side parity tests
// (server combat.test.ts, client weaponArc.test.ts) each assert their side
// reproduces exactly this function, which is what would fail the moment either
// re-grew a private copy.

const MAP_R = 3000;
const BASE = 660; // the base gun reach (CONFIG.vision.radar)

describe('gunReachU — an OWN live flare extends the gun past its range', () => {
  it('an IN-RANGE click is the base range, untouched, whatever zones exist', () => {
    const zones = [{ x: 0, y: 400, r: 120 }];
    expect(gunReachU({ x: 0, y: 0 }, Math.PI / 2, 400, BASE, MAP_R, zones)).toBe(BASE);
    expect(gunReachU({ x: 0, y: 0 }, Math.PI / 2, BASE, BASE, MAP_R, zones)).toBe(BASE);
  });

  it('an out-of-range click INSIDE an own zone lifts the reach to the click itself', () => {
    const zones = [{ x: 0, y: 900, r: 120 }];
    expect(gunReachU({ x: 0, y: 0 }, Math.PI / 2, 900, BASE, MAP_R, zones)).toBe(900);
  });

  it('the lift is only ever TO the click, never past it', () => {
    // A huge zone straddling the click does not license a map-edge shot.
    const zones = [{ x: 0, y: 900, r: 2000 }];
    expect(gunReachU({ x: 0, y: 0 }, Math.PI / 2, 900, BASE, MAP_R, zones)).toBe(900);
  });

  it('an out-of-range click with NO zone at all clamps to the base range', () => {
    expect(gunReachU({ x: 0, y: 0 }, Math.PI / 2, 900, BASE, MAP_R, [])).toBe(BASE);
  });

  it('an out-of-range click OUTSIDE every zone clamps to the base range', () => {
    const zones = [{ x: 0, y: 900, r: 50 }]; // the flare hangs elsewhere
    expect(gunReachU({ x: 0, y: 0 }, 0, 900, BASE, MAP_R, zones)).toBe(BASE);
  });

  it('is NaN-SAFE by the exact `!(aimDist > base)` branch shape', () => {
    // `aimDist <= base` would be FALSE for NaN and fall through to the geometry;
    // the negated form takes the unchanged-range branch on both sides instead.
    const zones = [{ x: 0, y: 900, r: 5000 }];
    expect(gunReachU({ x: 0, y: 0 }, Math.PI / 2, NaN, BASE, MAP_R, zones)).toBe(BASE);
  });

  it('tests the MAP-CLAMPED burst point, not the raw cursor (they differ at the rim)', () => {
    // Ship near the rim, clicking out over the edge. The raw cursor at 900u sits
    // OUTSIDE the water disk; the burst point is clamped back to just inside it.
    const ship = { x: 0, y: MAP_R - 100 };
    const cursorY = ship.y + 900;
    const burst = burstPointAlong(ship, 900, MAP_R, 900, Math.PI / 2);
    expect(burst.y).toBeLessThan(cursorY); // the clamp really did bite
    // A zone AT THE CURSOR (past the rim) licenses nothing...
    expect(gunReachU(ship, Math.PI / 2, 900, BASE, MAP_R, [{ x: 0, y: cursorY, r: 20 }])).toBe(BASE);
    // ...while a zone at the CLAMPED burst point does.
    expect(gunReachU(ship, Math.PI / 2, 900, BASE, MAP_R, [{ x: burst.x, y: burst.y, r: 20 }])).toBe(900);
  });

  it('containment is INCLUSIVE at the rim (d² <= r²), both here and in pointInLitZone', () => {
    // Burst exactly on the zone's edge: legal.
    expect(gunReachU({ x: 0, y: 0 }, Math.PI / 2, 900, BASE, MAP_R, [{ x: 0, y: 800, r: 100 }])).toBe(900);
    expect(pointInLitZone({ x: 10, y: 0 }, [{ x: 0, y: 0, r: 10 }])).toBe(true);
    expect(pointInLitZone({ x: 10.001, y: 0 }, [{ x: 0, y: 0, r: 10 }])).toBe(false);
    expect(pointInLitZone({ x: 0, y: 0 }, [])).toBe(false);
  });

  it('OWN + LIVE are the CALLER\'s filters — the type cannot express an owner or an expiry', () => {
    // The predicate takes centre+radius only. There is no field an enemy zone or
    // an expired one could arrive in, so "own flares only" is structural: both
    // callers (World.ownLiveLitZones, render/litZones ownActiveZones) filter
    // before the list ever reaches here.
    const zone = { x: 0, y: 900, r: 120 } as Record<string, number>;
    expect(Object.keys(zone).sort()).toEqual(['r', 'x', 'y']);
  });
});
