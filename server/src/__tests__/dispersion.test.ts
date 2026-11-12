// REAL DISPERSION ON THE AUTHORITATIVE WORLD (Story 11.1, Eric 2026-11-12,
// R5 / R6 / R8 / R13 / R16). The pure math is pinned in shared
// (dispersion.test.ts); this suite pins the SERVER's wiring of it, as
// contracts:
//   (a) every main-battery shell of a salvo gets its OWN landing inside the
//       ellipse for its muzzle → center range, flies from its muzzle straight
//       at it, and arrives there with a collinear path (no sideways snap);
//   (b) the same world seeds and inputs land every shell on the same point,
//       and the stream is room-private (another pseudonym seed, other points);
//   (c) a main-battery hit deals the same damage at short and at long range
//       (range attenuation retired);
//   (d) the utility shells and the legacy unmounted weapons never ask for a
//       dispersion seed and land on the clamped click exactly as before;
//   (e) secondaries rounds land around the clamped aim, inside its ellipse.
// Never a seed-produced number: every expectation is a relation to the shared
// geometry, CONFIG or the hull's folded stats.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  SLOT_GUN,
  aimPointOf,
  burstPointAlong,
  dispersionAxes,
  gunReachU,
  hullSilhouette,
  pointPolygonDistance,
  transformPolygon,
  pickTurret,
  turretSalvo,
  type EquipmentId,
  type InputMsg,
  type LoadoutSlot,
  type ShellState,
  type Vec2,
} from '@salvo/shared';
import { World, type ShipRecord, type WorldOptions } from '../game/world.js';
import { EQUIPMENT, freshAmmo, type ActivationContext } from '../game/equipment/index.js';
import { flatRaster } from './islandFixture.js';
import { neutralize } from './deckGunFixture.js';

const BEAM = Math.PI / 2;
const EPS = 1e-9;

function bareWorld(seed = 7, opts: WorldOptions = {}): World {
  const w = new World(seed, CONFIG.match.fillTo, CONFIG.zone, opts);
  w.map.islands.length = 0;
  w.map.heightRaster = flatRaster();
  return w;
}

function place(w: World, id: string, x: number, y: number, heading = 0): ShipRecord {
  const rec = neutralize(w.addShip(id, id.toUpperCase(), 'captain', 'bismarck', undefined, undefined));
  rec.state = { x, y, heading, speed: 0 };
  return rec;
}

function inp(seq: number, o: Partial<InputMsg> = {}): InputMsg {
  return { seq, throttle: 0, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: SLOT_GUN, fireT: 0, actSeq: 0, act: 0, hornSeq: 0, held: false, sec: false, ...o };
}

const own = (w: World, owner: string, family: ShellState['family']): ShellState[] =>
  [...w.shells.values()].filter((s) => s.ownerId === owner && s.family === family);

/** The landing's offset from `aim`, in the shot's frame (origin → aim), over the semi-axes. */
function inEllipse(origin: Vec2, aim: Vec2, p: Vec2): number {
  const range = Math.hypot(aim.x - origin.x, aim.y - origin.y);
  const ux = (aim.x - origin.x) / range;
  const uy = (aim.y - origin.y) / range;
  const { alongU, acrossU } = dispersionAxes(range);
  const a = ((p.x - aim.x) * ux + (p.y - aim.y) * uy) / alongU;
  const b = (-(p.x - aim.x) * uy + (p.y - aim.y) * ux) / acrossU;
  return a * a + b * b;
}

/** Fire ONE main-battery click from `a` on `aim`/`aimDist`; returns the new salvo. */
function click(w: World, a: ShipRecord, aim: number, aimDist: number, seq = 1): ShellState[] {
  const before = new Set(w.shells.keys());
  w.submitInput(a.id, inp(seq, { aim, aimDist, fireSeq: seq }));
  w.step();
  return own(w, a.id, 'cannon').filter((s) => !before.has(s.id));
}

describe('(a) the main battery: every shell its own landing, a straight flight there', () => {
  it('each shell of the salvo lands inside the ellipse for ITS muzzle → center range, its velocity points from its muzzle at its landing, and it arrives on a collinear path', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const dist = a.stats.equipment.mainBattery.rangeU * 0.9;
    // The un-dispersed solution, from the very shared calls the server makes.
    const aimPt = aimPointOf(a.state, BEAM, dist);
    const pick = pickTurret(a.turrets, a.hullId, a.state, aimPt)!;
    const reach = gunReachU(pick.station, pick.bearing, pick.aimDistU, a.stats.equipment.mainBattery.rangeU, w.map.radius, []);
    const salvo = turretSalvo(pick, a.hullId, a.state, reach, w.map.radius);
    const shells = click(w, a, BEAM, dist);
    expect(shells).toHaveLength(salvo.shells.length);
    const landings = new Set<string>();
    shells.forEach((sh, k) => {
      const origin = salvo.shells[k].origin;
      expect(sh.x).toBeCloseTo(origin.x, 9); // its OWN muzzle
      expect(sh.y).toBeCloseTo(origin.y, 9);
      const land = { x: sh.targetX!, y: sh.targetY! };
      expect(inEllipse(origin, salvo.center, land)).toBeLessThanOrEqual(1 + EPS); // inside ITS ellipse (R3 hard edge)
      expect(Math.atan2(sh.vy, sh.vx)).toBeCloseTo(Math.atan2(land.y - origin.y, land.x - origin.x), 12); // flies AT it
      landings.add(`${land.x},${land.y}`);
    });
    expect(landings.size).toBe(shells.length); // R5: every shell rolls its own landing
    // Fly them out: every tracked position stays on its muzzle → landing line, and the burst is AT the landing.
    const track = new Map(shells.map((s) => [s.id, { o: { x: s.x, y: s.y }, t: { x: s.targetX!, y: s.targetY! } }]));
    const burstAt = new Map<string, Vec2>();
    for (let i = 0; i < 200 && own(w, 'a', 'cannon').length > 0; i++) {
      w.step();
      for (const s of own(w, 'a', 'cannon')) {
        const { o, t } = track.get(s.id)!;
        const cross = (s.x - o.x) * (t.y - o.y) - (s.y - o.y) * (t.x - o.x);
        expect(Math.abs(cross) / Math.hypot(t.x - o.x, t.y - o.y)).toBeLessThan(1e-6);
      }
      for (const e of w.tickEvents) if (e.k === 'burst' && track.has(e.id)) burstAt.set(e.id, { x: e.x, y: e.y });
    }
    expect(burstAt.size).toBe(shells.length);
    for (const [id, p] of burstAt) {
      const { t } = track.get(id)!;
      expect(p.x).toBeCloseTo(t.x, 9);
      expect(p.y).toBeCloseTo(t.y, 9);
    }
  });

  it('a salvo aimed past the rim lands inside the map disk (R8)', () => {
    const w = bareWorld();
    const R = w.map.radius;
    const a = place(w, 'a', 0, 0, BEAM);
    const reach = a.stats.equipment.mainBattery.rangeU;
    a.state.y = R - reach / 2; // the rim inside reach, dead ahead
    let n = 0;
    for (let seq = 1; seq <= a.turrets.length; seq++) {
      for (const s of click(w, a, BEAM, reach, seq)) {
        n += 1;
        expect(Math.hypot(s.targetX!, s.targetY!)).toBeLessThanOrEqual(R);
      }
    }
    expect(n).toBeGreaterThan(0);
  });
});

describe('(b) replay and privacy', () => {
  /** Every main-battery and secondaries landing over a short scripted fight. */
  function landings(opts: WorldOptions): string[] {
    const w = bareWorld(21, opts);
    const a = place(w, 'a', 0, 0);
    const out: string[] = [];
    for (let seq = 1; seq <= 30; seq++) {
      w.submitInput('a', inp(seq, { aim: BEAM + seq * 0.01, aimDist: 300 + seq * 7, fireSeq: seq, sec: seq % 2 === 0 }));
      w.step();
      for (const s of w.shells.values()) out.push(`${s.id}:${s.targetX},${s.targetY}`);
    }
    return [...new Set(out)];
  }

  it('the same world seeds and inputs land every shell on the same point', () => {
    const first = landings({ pseudonymSeed: 0xabc });
    expect(first.length).toBeGreaterThan(0);
    expect(landings({ pseudonymSeed: 0xabc })).toEqual(first);
    expect(landings({})).toEqual(landings({})); // the batch-sim case: no pseudonym seed, still deterministic
  });

  it('the stream is ROOM-PRIVATE: another pseudonym seed on the same map lands the same shells elsewhere', () => {
    const a = landings({ pseudonymSeed: 0xabc });
    const b = landings({ pseudonymSeed: 0xdef });
    expect(a.map((s) => s.split(':')[0])).toEqual(b.map((s) => s.split(':')[0])); // the same shells…
    expect(b).not.toEqual(a); // …on other points
  });
});

describe('(c) flat damage: a main-battery hit is the same at short and at long range', () => {
  it('every blow on the target is the same amount at 20 % and at 95 % of reach', () => {
    const blows = (frac: number): number[] => {
      const w = bareWorld();
      const a = place(w, 'a', 0, 0);
      const d = a.stats.equipment.mainBattery.rangeU * frac;
      const b = place(w, 'b', 0, d, 0); // broadside to the fall of shot
      // Aim a blast's reach short of its near side: every dispersed shell
      // bursts on the water just short of it (or on contact inside its would-be
      // blast) and the blast catches the hull — the same burst blow at any range.
      const edge = pointPolygonDistance({ x: 0, y: 0 }, transformPolygon(hullSilhouette(b.hullId), b.state.x, b.state.y, b.state.heading));
      const out: number[] = [];
      click(w, a, BEAM, edge - a.stats.equipment.mainBattery.burstRadius / 2);
      for (let i = 0; i < 200 && own(w, 'a', 'cannon').length > 0; i++) {
        w.step();
        for (const e of w.tickEvents) if (e.k === 'dmg' && e.id === b.id) out.push(e.amount);
      }
      return out;
    };
    const near = blows(0.2);
    const far = blows(0.95);
    expect(near.length).toBeGreaterThan(0);
    expect(far.length).toBe(near.length);
    for (const amount of [...near, ...far]) expect(amount).toBe(near[0]);
  });
});

describe('(d) never dispersed: utility shells and the legacy unmounted weapons', () => {
  /** Activate `id`'s row directly on a fake context whose `mintShell` FAILS the
   *  test: a row that is not dispersed must never ask for a seed. */
  function fire(id: EquipmentId, aimDist: number, aim = 0.7): { ship: ShipRecord; shells: ShellState[]; mapRadius: number } {
    const w = bareWorld();
    const ship = place(w, 'a', 0, 0);
    ship.input = inp(1, { aim, aimDist });
    const shells: ShellState[] = [];
    let n = 0;
    const ctx: ActivationContext = {
      ship,
      now: w.now,
      fireT: w.now,
      mapRadius: w.map.radius,
      islands: [],
      mkId: () => `t${++n}`,
      mintShell: () => {
        throw new Error(`${id} asked for a dispersion seed`);
      },
      spawnBallistic: (s) => shells.push(s),
      dropMine: () => undefined,
      ownLitZones: () => [],
      finishReloads: () => undefined,
      setHunker: () => undefined,
    };
    const slot: LoadoutSlot = { equipmentId: id, state: freshAmmo(9) };
    const row = EQUIPMENT[id]!;
    if (row.stream !== undefined) row.stream(ctx, slot, true);
    else expect(row.activate(ctx, slot)).toEqual({ ok: true });
    return { ship, shells, mapRadius: w.map.radius };
  }

  it.each(['starShells', 'phosphorShells', 'dazzleShells', 'foulingShell', 'flak', 'machineGun'] as const)('%s: one shell, landing EXACTLY on the clamped click', (id) => {
    const aimDist = 200; // inside every row's reach, past every muzzle
    const { ship, shells } = fire(id, aimDist);
    expect(shells).toHaveLength(1);
    const click = aimPointOf(ship.state, ship.input.aim, aimDist);
    expect(shells[0].targetX).toBeCloseTo(click.x, 9);
    expect(shells[0].targetY).toBeCloseTo(click.y, 9);
  });

  it('gun (the cannon): its barrels straddle the clamped click exactly, as before (no seed asked)', () => {
    const aimDist = 200;
    const { ship, shells, mapRadius } = fire('gun', aimDist);
    expect(shells.length).toBe(ship.stats.equipment.gun.barrels);
    const center = burstPointAlong(ship.state, aimDist, mapRadius, ship.stats.equipment.gun.rangeU, ship.input.aim);
    const mx = shells.reduce((s, sh) => s + sh.targetX!, 0) / shells.length;
    const my = shells.reduce((s, sh) => s + sh.targetY!, 0) / shells.length;
    expect(mx).toBeCloseTo(center.x, 9);
    expect(my).toBeCloseTo(center.y, 9);
  });

  it('broadside: fires on the beam without asking for a seed', () => {
    expect(fire('broadside', 200, BEAM).shells.length).toBeGreaterThan(0);
  });
});

describe('(e) the secondaries: each round lands inside the ellipse around the clamped aim', () => {
  it('rounds fly from their muzzle straight at their own landing, inside the ellipse for that range', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const aimDist = a.stats.secondaryRangeU * 0.9;
    const aimPt = aimPointOf(a.state, 0.3, aimDist);
    const seen = new Set<string>();
    for (let seq = 1; seq <= 20; seq++) {
      w.submitInput('a', inp(seq, { aim: 0.3, aimDist, sec: true }));
      w.step();
      for (const s of own(w, 'a', 'mg')) {
        if (seen.has(s.id)) continue;
        seen.add(s.id);
        // A round is seen the tick it spawns, still on its muzzle.
        const land = { x: s.targetX!, y: s.targetY! };
        expect(inEllipse({ x: s.x, y: s.y }, aimPt, land)).toBeLessThanOrEqual(1 + 1e-6);
        expect(Math.atan2(s.vy, s.vx)).toBeCloseTo(Math.atan2(land.y - s.y, land.x - s.x), 9);
      }
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});
