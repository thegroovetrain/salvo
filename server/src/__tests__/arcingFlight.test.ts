// DIRECT HITS, ARCING SHOTS AND HIGH GROUND (Eric 2026-11-13, epic-11
// amendment 8):
//   - the MAIN BATTERY: "Only direct hits count" / "Only the landing point
//     counts" — no blast, no in-flight contact with a ship; a hull whose
//     silhouette holds the landing point takes the full blow; it passes over
//     the chart's lowest land band and is stopped by higher ground; a landing
//     on land is spent and does nothing;
//   - the SECONDARIES: the same island rule; against ships unchanged;
//   - the STAR, PHOSPHOR, FLASH and FOULING shells: "not interrupted by
//     hitting other ships or even islands en-route to their destination".
// Every case here would fail on the code before the ruling (a blast, a
// graze, a coastline stop, an interception).

import { describe, it, expect } from 'vitest';
import {
  BATTERY_BLOCK_HEIGHT,
  CONFIG,
  SLOT_GUN,
  damageMultiplierFor,
  familySlotFor,
  hullSilhouette,
  pointPolygonDistance,
  transformPolygon,
  type EquipmentId,
  type GameEvent,
  type InputMsg,
  type ShellState,
  type ShipClassId,
  type Vec2,
} from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { circleIsland, flatRaster, rasterFrom, ridgeField } from './islandFixture.js';
import { neutralize } from './deckGunFixture.js';
import { fitClassWeapons } from './classWeapons.js';

const BEAM = 0; // every case fires due east, along +x

function bareWorld(seed = 7): World {
  const w = new World(seed, CONFIG.match.fillTo, CONFIG.zone);
  w.map.islands.length = 0;
  w.map.heightRaster = flatRaster(2000);
  return w;
}

function place(w: World, id: string, x: number, y: number, heading = 0, hull: ShipClassId = 'bismarck'): ShipRecord {
  const rec = neutralize(w.addShip(id, id.toUpperCase(), 'captain', hull, undefined, undefined));
  rec.state = { x, y, heading, speed: 0 };
  return rec;
}

function inp(seq: number, o: Partial<InputMsg> = {}): InputMsg {
  return { seq, throttle: 0, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0, actSeq: 0, act: 0, hornSeq: 0, held: false, sec: false, ...o };
}

const ownShells = (w: World, id: string): ShellState[] => [...w.shells.values()].filter((s) => s.ownerId === id);

/** Fire the main battery once at (BEAM, dist); the shells as launched. */
function salvo(w: World, a: ShipRecord, dist: number): ShellState[] {
  w.submitInput(a.id, inp(1, { aim: BEAM, aimDist: dist, fireSeq: 1, slot: SLOT_GUN }));
  w.step();
  const out = ownShells(w, a.id);
  expect(out.length).toBeGreaterThan(0);
  return out;
}

/** Re-aim a launched shell at the exact point `p` (straight from where it is)
 *  — every other field, its hit-rule flags included, stays as launched. */
function retarget(s: ShellState, p: Vec2): void {
  const d = Math.hypot(p.x - s.x, p.y - s.y);
  const speed = Math.hypot(s.vx, s.vy);
  s.vx = ((p.x - s.x) / d) * speed;
  s.vy = ((p.y - s.y) / d) * speed;
  s.targetX = p.x;
  s.targetY = p.y;
  s.distLeft = d + s.hitRadius;
}

/** Step (at least once) until `owner` has no shell in the air; every event seen. */
function flyOut(w: World, owner: string, cap = 400): GameEvent[] {
  const log: GameEvent[] = [];
  for (let i = 0; i < cap; i++) {
    w.step();
    log.push(...w.tickEvents);
    if (ownShells(w, owner).length === 0) break;
  }
  expect(ownShells(w, owner)).toHaveLength(0);
  return log;
}

/** The blow the damage gate deals `victim` for a raw `amount` from `by`. */
const gated = (amount: number, victim: ShipRecord, by: ShipRecord): number =>
  Math.max(1, Math.floor(amount * damageMultiplierFor(victim.stats.armor - by.stats.power)));

const worldPoly = (s: ShipRecord): Vec2[] => transformPolygon(hullSilhouette(s.hullId), s.state.x, s.state.y, s.state.heading);

describe('the main battery — direct hits only, the landing point counts', () => {
  it('a landing point inside a hull: that hull takes the row\'s full blow through the damage gate (one blow per shell)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const b = place(w, 'b', 400, 0, Math.PI / 2);
    const shells = salvo(w, a, 400);
    for (const s of shells) retarget(s, { x: 400, y: 0 });
    const log = flyOut(w, 'a');
    const blows = log.filter((e) => e.k === 'dmg' && e.id === 'b');
    expect(blows).toHaveLength(shells.length);
    expect(b.hp).toBe(b.stats.maxHp - shells.length * gated(a.stats.equipment.mainBattery.damage, b, a));
    // The landing is an IMPACT naming the struck hull, never a blast ring.
    expect(log.some((e) => e.k === 'burst')).toBe(false);
    expect(log.filter((e) => e.k === 'boom' && e.hit === 'b')).toHaveLength(shells.length);
  });

  it('a landing point 1 u outside the hull\'s outline does NOTHING (the 15 u blast is retired)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const b = place(w, 'b', 400, 0, Math.PI / 2);
    const poly = worldPoly(b);
    // Walk out from the centre along −x (toward the shooter) to 1 u off the outline.
    let x = 400;
    while (pointPolygonDistance({ x, y: 0 }, poly) < 1) x -= 0.05;
    const p = { x, y: 0 };
    expect(pointPolygonDistance(p, poly)).toBeGreaterThanOrEqual(1);
    expect(pointPolygonDistance(p, poly)).toBeLessThan(CONFIG.gun.burstRadius); // inside the old blast
    for (const s of salvo(w, a, 400)) retarget(s, p);
    const log = flyOut(w, 'a');
    expect(b.hp).toBe(b.stats.maxHp);
    expect(log.some((e) => e.k === 'dmg')).toBe(false);
    expect(log.some((e) => e.k === 'boom' && e.hit !== undefined)).toBe(false);
  });

  it('a hull on the path SHORT of the landing point is passed over: no damage, no stop — the shell still lands', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const mid = place(w, 'mid', 250, 0, Math.PI / 2); // broadside across the line of fire
    const far = { x: 600, y: 0 };
    const shells = salvo(w, a, 600);
    for (const s of shells) retarget(s, far);
    const log = flyOut(w, 'a');
    expect(mid.hp).toBe(mid.stats.maxHp);
    expect(log.some((e) => e.k === 'dmg')).toBe(false);
    const landed = log.filter((e) => e.k === 'boom' && shells.some((s) => s.id === e.id));
    expect(landed).toHaveLength(shells.length);
    for (const e of landed) expect(e.k === 'boom' && e.x === far.x && e.y === far.y).toBe(true);
  });

  it('the firer\'s own hull holding the landing point takes nothing (no friendly fire)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    for (const s of salvo(w, a, 400)) retarget(s, { x: 0, y: 0 });
    flyOut(w, 'a');
    expect(a.hp).toBe(a.stats.maxHp);
  });
});

describe('the main battery and the secondaries — the lowest land band is passed over, higher ground stops the round', () => {
  /** A ridge across the line of fire at x = 300 (±30 u), `q` high. */
  function ridgeWorld(q: number): World {
    const w = bareWorld();
    w.map.heightRaster = rasterFrom(2000, ridgeField(300, 0, 30, 400, q));
    return w;
  }

  it('MAIN BATTERY over the lowest band: the shell reaches its landing and hits the hull there', () => {
    const w = ridgeWorld(BATTERY_BLOCK_HEIGHT - 1);
    w.map.islands.push(circleIsland(300, 0, 30)); // the coastline alone no longer stops it
    const a = place(w, 'a', 0, 0);
    const b = place(w, 'b', 600, 0, Math.PI / 2);
    salvo(w, a, 600);
    flyOut(w, 'a');
    expect(b.hp).toBeLessThan(b.stats.maxHp);
  });

  it('MAIN BATTERY into high ground: every shell stops at the ridge, splashes there and the hull beyond is untouched', () => {
    const w = ridgeWorld(BATTERY_BLOCK_HEIGHT);
    const a = place(w, 'a', 0, 0);
    const b = place(w, 'b', 600, 0, Math.PI / 2);
    const shells = salvo(w, a, 600);
    for (const s of shells) {
      expect(s.terrainStop).toBe(true);
      expect(s.targetX!).toBeLessThanOrEqual(300 - 30 + CONFIG.mainBattery.shellRadius + 14); // at the ridge's near face (one raster cell)
    }
    const log = flyOut(w, 'a');
    expect(b.hp).toBe(b.stats.maxHp);
    expect(log.filter((e) => e.k === 'sp' && e.id === 'a')).toHaveLength(shells.length);
  });

  it('MAIN BATTERY landing on land: fired and spent (the turret reloads), lands there, damages nothing', () => {
    const w = ridgeWorld(BATTERY_BLOCK_HEIGHT - 1);
    const a = place(w, 'a', 0, 0);
    const b = place(w, 'b', 360, 0, Math.PI / 2); // just past the land, untouched by a landing on it
    const shells = salvo(w, a, 300);
    expect(a.turrets.some((t) => t.reloadMsLeft > 0)).toBe(true);
    for (const s of shells) expect(s.terrainStop).toBeUndefined();
    const log = flyOut(w, 'a');
    expect(b.hp).toBe(b.stats.maxHp);
    expect(log.some((e) => e.k === 'dmg')).toBe(false);
  });

  it('SECONDARIES: over the lowest band a round reaches its point; into high ground it stops at the ridge; a hull on its path is still struck first', () => {
    const fire = (w: World, a: ShipRecord, dist: number): ShellState[] => {
      w.submitInput(a.id, inp(1, { aim: BEAM, aimDist: dist, sec: true }));
      w.step();
      const rounds = ownShells(w, a.id).filter((s) => s.family === 'mg');
      expect(rounds.length).toBeGreaterThan(0);
      w.submitInput(a.id, inp(2, { aim: BEAM, aimDist: dist, sec: false }));
      return rounds;
    };
    const low = ridgeWorld(BATTERY_BLOCK_HEIGHT - 1);
    low.map.islands.push(circleIsland(300, 0, 30));
    const la = place(low, 'a', 0, 0);
    for (const r of fire(low, la, 500)) expect(r.terrainStop).toBeUndefined();
    const lowLog = flyOut(low, 'a');
    expect(lowLog.some((e) => e.k === 'boom' && e.x > 330)).toBe(true); // it splashed beyond the land

    const high = ridgeWorld(BATTERY_BLOCK_HEIGHT);
    const ha = place(high, 'a', 0, 0);
    const rounds = fire(high, ha, 500);
    for (const r of rounds) expect(r.terrainStop).toBe(true);
    const highLog = flyOut(high, 'a');
    expect(highLog.some((e) => e.k === 'boom' && e.x > 330)).toBe(false);

    const ship = bareWorld();
    const sa = place(ship, 'a', 0, 0);
    const mid = place(ship, 'mid', 200, 0, Math.PI / 2);
    fire(ship, sa, 500);
    flyOut(ship, 'a');
    expect(mid.hp).toBeLessThan(mid.stats.maxHp); // unchanged against ships
  });
});

describe('STAR, PHOSPHOR, FLASH and FOULING shells arc over ships and islands', () => {
  const LINES: readonly EquipmentId[] = ['starShells', 'phosphorShells', 'dazzleShells', 'foulingShell'];

  for (const id of LINES) {
    it(`${id}: a hull and an island (coastline and high ground) on the path do not stop it — it bursts at the click`, () => {
      const w = bareWorld();
      w.map.heightRaster = rasterFrom(2000, ridgeField(300, 0, 30, 400, 255));
      w.map.islands.push(circleIsland(300, 0, 30));
      const a = place(w, 'a', 0, 0);
      fitClassWeapons(w, a);
      const slot = familySlotFor(id)!;
      w.applyCard(a, id);
      expect(a.loadout[slot]?.equipmentId).toBe(id);
      const mid = place(w, 'mid', 150, 0, Math.PI / 2);
      const reach = (a.stats.equipment[id] as { rangeU: number }).rangeU;
      const dist = Math.min(600, reach);
      expect(dist).toBeGreaterThan(330); // the click lies beyond the island
      w.submitInput('a', inp(1, { aim: BEAM, aimDist: dist, fireSeq: 1, slot }));
      const log = flyOut(w, 'a');
      const bursts = log.filter((e) => e.k === 'burst');
      expect(bursts).toHaveLength(1);
      expect(bursts[0].x).toBeCloseTo(dist, 6);
      expect(log.some((e) => e.k === 'boom')).toBe(false); // never intercepted by `mid`, never stopped by the island
      // ...and its effect is planted AT THE CLICK (a zone, or the flash's disc).
      const zones = [...w.litZones.values(), ...w.burnZones.values(), ...w.foulZones.values()];
      if (id === 'dazzleShells') expect(bursts[0].k === 'burst' && bursts[0].f).toBe(true);
      else expect(zones.map((z) => Math.round(z.x))).toEqual([Math.round(dist)]);
      expect(mid.state.x).toBeLessThan(300); // the hull and the island both lay on the path
    });
  }
});
