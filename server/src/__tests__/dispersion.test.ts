// REAL DISPERSION ON THE AUTHORITATIVE WORLD (Story 11.1, Eric 2026-11-12,
// R5 / R6 / R8 / R13 / R16). The pure math is pinned in shared
// (dispersion.test.ts); this suite pins the SERVER's wiring of it, as
// contracts:
//   (a) every main-battery shell of a salvo gets its OWN landing inside the
//       ONE ellipse for the station → center range, and the whole salvo
//       flies PARALLEL to the salvo bearing, abreast off the muzzle line, each
//       shell arriving exactly on its landing (review fix: no converging
//       tracks on the wire);
//   (b) the per-shell seed is an HMAC under the room's dispersion key,
//       independent of every other stream both ways; the same key (or, offline,
//       the same seeds) replays every landing;
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
  dispersedPoint,
  gunReachU,
  hullSilhouette,
  pointPolygonDistance,
  transformPolygon,
  pickTurret,
  turretSalvo,
  turretStationWorld,
  SHIP_CLASS_IDS,
  type ShipClassId,
  type EquipmentId,
  type InputMsg,
  type LoadoutSlot,
  type ShellState,
  type Vec2,
} from '@salvo/shared';
import { salvoShellFlight } from '../game/equipment/ballistics.js';
import { World, type ShipRecord, type WorldOptions } from '../game/world.js';
import { EQUIPMENT, freshAmmo, type ActivationContext } from '../game/equipment/index.js';
import { dispersionShellSeed, offlineDispersionKey } from '../game/dispersionKey.js';
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

function place(w: World, id: string, x: number, y: number, heading = 0, hull: ShipClassId = 'bismarck'): ShipRecord {
  const rec = neutralize(w.addShip(id, id.toUpperCase(), 'captain', hull, undefined, undefined));
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

describe('(a) the main battery: every shell its own landing, PARALLEL tracks off the muzzle line', () => {
  it('every hull: one velocity direction (the salvo bearing), spawns abreast on the muzzle line, landings inside the station → center ellipse, each arriving exactly on its landing', () => {
    let hullsChecked = 0;
    for (const hull of SHIP_CLASS_IDS) {
      const w = bareWorld();
      const a = place(w, 'a', 0, 0, 0, hull);
      if (a.turrets.length === 0) continue;
      hullsChecked += 1;
      const dist = a.stats.equipment.mainBattery.rangeU * 0.9;
      // The un-dispersed solution, from the very shared calls the server makes.
      const aimPt = aimPointOf(a.state, BEAM, dist);
      const pick = pickTurret(a.turrets, a.hullId, a.state, aimPt)!;
      const reach = gunReachU(pick.station, pick.bearing, pick.aimDistU, a.stats.equipment.mainBattery.rangeU, w.map.radius, []);
      const salvo = turretSalvo(pick, a.hullId, a.state, reach, w.map.radius);
      const ux = Math.cos(salvo.bearing);
      const uy = Math.sin(salvo.bearing);
      const muzzle = salvo.shells[0].origin;
      const shells = click(w, a, BEAM, dist);
      expect(shells, hull).toHaveLength(salvo.shells.length);
      expect(shells.length, hull).toBeGreaterThan(1);
      const landings = new Set<string>();
      for (const sh of shells) {
        const speed = Math.hypot(sh.vx, sh.vy);
        // ONE velocity direction for the whole salvo: the salvo bearing.
        expect(Math.abs(sh.vx * uy - sh.vy * ux) / speed, `${hull} ${sh.id} not parallel`).toBeLessThan(1e-12);
        expect(sh.vx * ux + sh.vy * uy, hull).toBeGreaterThan(0);
        // Spawned ON the muzzle line (through the muzzle, perpendicular to the bearing).
        expect((sh.x - muzzle.x) * ux + (sh.y - muzzle.y) * uy, `${hull} ${sh.id} off the muzzle line`).toBeCloseTo(0, 9);
        const land = { x: sh.targetX!, y: sh.targetY! };
        // …straight behind its landing along the bearing (no sideways snap on arrival).
        expect(Math.abs((land.x - sh.x) * uy - (land.y - sh.y) * ux), hull).toBeLessThan(1e-9);
        expect(inEllipse(pick.station, salvo.center, land), hull).toBeLessThanOrEqual(1 + EPS); // the ONE station → center ellipse (R3 hard edge)
        landings.add(`${land.x},${land.y}`);
      }
      expect(landings.size, hull).toBe(shells.length); // R5: every shell rolls its own landing
      // Fly them out: every tracked position stays on its own parallel track, and
      // the landing (a `boom` since the blast retired — epic-11 amendment 8) is AT the landing point.
      const track = new Map(shells.map((s) => [s.id, { o: { x: s.x, y: s.y }, t: { x: s.targetX!, y: s.targetY! } }]));
      const burstAt = new Map<string, Vec2>();
      for (let i = 0; i < 400 && own(w, 'a', 'cannon').length > 0; i++) {
        w.step();
        for (const s of own(w, 'a', 'cannon')) {
          const { o } = track.get(s.id)!;
          expect(Math.abs((s.x - o.x) * uy - (s.y - o.y) * ux)).toBeLessThan(1e-6);
        }
        for (const e of w.tickEvents) if (e.k === 'boom' && e.id !== undefined && track.has(e.id)) burstAt.set(e.id, { x: e.x, y: e.y });
      }
      expect(burstAt.size, hull).toBe(shells.length);
      for (const [id, p] of burstAt) {
        const { t } = track.get(id)!;
        expect(p.x).toBeCloseTo(t.x, 9);
        expect(p.y).toBeCloseTo(t.y, 9);
      }
    }
    expect(hullsChecked).toBeGreaterThan(0);
  });

  it('a point-blank salvo spawns each shell ON its own landing, still on the salvo bearing', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    // 2 u off the bow turret's station, on a bearing inside its arc: nearer than its muzzle.
    const st = turretStationWorld(a.hullId, 0, a.state);
    const p = { x: st.x + Math.cos(a.state.heading + 1.2) * 2, y: st.y + Math.sin(a.state.heading + 1.2) * 2 };
    const shells = click(w, a, Math.atan2(p.y - a.state.y, p.x - a.state.x), Math.hypot(p.x - a.state.x, p.y - a.state.y));
    expect(shells.length).toBeGreaterThan(0);
    for (const sh of shells) {
      expect(sh.x).toBe(sh.targetX);
      expect(sh.y).toBe(sh.targetY);
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

describe('(a2) a firer at the rim: no shell spawns outside the water disk', () => {
  it('the spawn slides forward along the salvo bearing into the disk; direction and distance stay honest', () => {
    const R = bareWorld().map.radius;
    const muzzle = { x: R - 2, y: 0 };
    const bearing = Math.PI / 2 + 0.05; // roughly tangent to the rim
    const station = { x: R - 4, y: -30 };
    const center = { x: R - 3, y: 400 };
    let exercised = 0;
    for (let seed = 1; seed <= 500; seed += 1) {
      const f = salvoShellFlight(station, center, muzzle, bearing, seed, R);
      expect(Math.hypot(f.spawn.x, f.spawn.y)).toBeLessThanOrEqual(R);
      expect(Math.hypot(f.landing.x, f.landing.y)).toBeLessThanOrEqual(R);
      const dx = f.landing.x - f.spawn.x;
      const dy = f.landing.y - f.spawn.y;
      expect(f.distU).toBeCloseTo(Math.hypot(dx, dy), 6);
      if (f.distU > 1e-6) {
        expect(Math.cos(Math.atan2(dy, dx) - bearing)).toBeGreaterThan(1 - 1e-6);
      }
      // Would the un-slid spawn (landing projected back onto the muzzle line) be outside?
      const ux = Math.cos(bearing);
      const uy = Math.sin(bearing);
      const p = dispersedPoint(station.x, station.y, center.x, center.y, seed);
      const along = (p.x - muzzle.x) * ux + (p.y - muzzle.y) * uy;
      if (along > 0 && Math.hypot(p.x - ux * along, p.y - uy * along) > R) exercised += 1;
    }
    expect(exercised).toBeGreaterThan(0);
  });
});

describe('(b) the dispersion key: replay, and independence from every other stream', () => {
  /** A short scripted fight with the zone clock running (so beacons and
   *  airdrops roll): every main-battery and secondaries landing, the track
   *  ids, the beacon chart and the airdrops. */
  function run(opts: WorldOptions): { landings: string[]; tracks: string[]; beacons: string; drops: string } {
    const w = bareWorld(21, opts);
    place(w, 'a', 0, 0);
    place(w, 'b', 3000, 0);
    w.startZone(w.now);
    const out: string[] = [];
    for (let seq = 1; seq <= 30; seq++) {
      w.submitInput('a', inp(seq, { aim: BEAM + seq * 0.01, aimDist: 300 + seq * 7, fireSeq: seq, sec: seq % 2 === 0 }));
      w.step();
      for (const s of w.shells.values()) out.push(`${s.id}:${s.targetX},${s.targetY}`);
    }
    return {
      landings: [...new Set(out)],
      tracks: [...w.pseudonyms.entries()].map(([k, v]) => `${k}=${v}`),
      beacons: JSON.stringify(w.beaconChart.beacons),
      drops: JSON.stringify([...w.drops.values()]),
    };
  }
  const KEY_A = new Uint8Array(32).fill(0xa5);
  const KEY_B = new Uint8Array(32).fill(0x5a);

  it('(a) INDEPENDENCE: another key moves every landing and nothing else; another pseudonym seed moves everything else and no landing', () => {
    const base = run({ pseudonymSeed: 0xabc, dispersionKey: KEY_A });
    expect(base.landings.length).toBeGreaterThan(0);
    expect(base.tracks.length).toBe(2);
    expect(JSON.parse(base.beacons).length).toBeGreaterThan(0); // non-vacuous: beacons rolled
    expect(JSON.parse(base.drops).length).toBeGreaterThan(0); // non-vacuous: airdrops rolled
    // Same seeds, another key: the same shells land elsewhere; the private streams are untouched.
    const otherKey = run({ pseudonymSeed: 0xabc, dispersionKey: KEY_B });
    expect(otherKey.landings.map((s) => s.split(':')[0])).toEqual(base.landings.map((s) => s.split(':')[0]));
    expect(otherKey.landings).not.toEqual(base.landings);
    expect(otherKey.tracks).toEqual(base.tracks);
    expect(otherKey.beacons).toBe(base.beacons);
    expect(otherKey.drops).toBe(base.drops);
    // Same key, another pseudonym seed: the private streams move, the landings do not.
    const otherPriv = run({ pseudonymSeed: 0xdef, dispersionKey: KEY_A });
    expect(otherPriv.tracks).not.toEqual(base.tracks);
    expect(otherPriv.beacons).not.toBe(base.beacons);
    expect(otherPriv.drops).not.toBe(base.drops);
    expect(otherPriv.landings).toEqual(base.landings);
  });

  it('(b) the same key and inputs land every shell on the same point', () => {
    const first = run({ pseudonymSeed: 0xabc, dispersionKey: KEY_A }).landings;
    expect(run({ pseudonymSeed: 0xabc, dispersionKey: new Uint8Array(KEY_A) }).landings).toEqual(first);
  });

  it('(c) OFFLINE (no key — batch sims, tests, the RL env): the same seeds replay every landing exactly, and the derived key is not a fixed one', () => {
    expect(run({}).landings).toEqual(run({}).landings);
    expect(run({ pseudonymSeed: 0xabc }).landings).toEqual(run({ pseudonymSeed: 0xabc }).landings);
    expect(run({ pseudonymSeed: 0xabc }).landings).not.toEqual(run({ pseudonymSeed: 0xdef }).landings);
  });

  it('(d) consecutive ordinals\' seeds are not related by XOR with a fixed constant (the retired first cut was)', () => {
    for (const key of [KEY_A, KEY_B, offlineDispersionKey(21, 0xabc)]) {
      const xors = new Set<number>();
      for (let n = 1; n <= 16; n += 1) xors.add((dispersionShellSeed(key, n) ^ dispersionShellSeed(key, n + 1)) >>> 0);
      expect(xors.size).toBeGreaterThan(8);
      for (let n = 1; n <= 16; n += 1) {
        const s = dispersionShellSeed(key, n);
        expect(Number.isInteger(s) && s >= 0 && s <= 0xffffffff).toBe(true);
      }
    }
  });
});

describe('(c) flat damage: a main-battery hit is the same at short and at long range', () => {
  it('every blow on the target is the same amount at 20 % and at 95 % of reach', () => {
    const blows = (frac: number): number[] => {
      const w = bareWorld();
      const a = place(w, 'a', 0, 0);
      const d = a.stats.equipment.mainBattery.rangeU * frac;
      // Bow-on to the line of fire (the long pattern axis along the hull):
      // aimed at its centre, the shells that LAND on the silhouette are the
      // direct hits (epic-11 amendment 8 — no blast) — the same blow at any range.
      const b = place(w, 'b', 0, d, BEAM);
      const out: number[] = [];
      for (let seq = 1; seq <= a.turrets.length; seq++) click(w, a, BEAM, d, seq); // every turret that bears
      for (let i = 0; i < 200 && own(w, 'a', 'cannon').length > 0; i++) {
        w.step();
        for (const e of w.tickEvents) if (e.k === 'dmg' && e.id === b.id) out.push(e.amount);
      }
      return out;
    };
    const near = blows(0.2);
    const far = blows(0.95);
    expect(near.length).toBeGreaterThan(0);
    expect(far.length).toBeGreaterThan(0);
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
      heightRaster: w.map.heightRaster,
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
