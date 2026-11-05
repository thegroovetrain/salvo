// THE MAIN BATTERY AND THE SECONDARIES ON THE AUTHORITATIVE WORLD (Story 10.4,
// Eric rulings R2–R4, epic-10 amendment 9). The pure steppers are pinned in
// shared (turrets.test.ts / secondaries.test.ts); this suite pins the SERVER's
// wiring of them — the I/O matrix rows the server owns:
//   * on-target shot fires ONE turret's shells at the aim point, only its reload starts;
//   * two candidates: the on-target turret wins over a lower-index off-target one;
//   * early click fires a ready turret along its CURRENT bearing;
//   * nothing ready → the `cooling` denial;
//   * INSTANT RELOAD finishes every turret (angles and heat untouched);
//   * a sinking hull's turrets HOLD their angles while reloads still run;
//   * secondaries: burst, overheat lock, release / cool, refused once dead;
//   * a secondaries round on a mine's marker damages it and pops it when its
//     hp is spent; a main-battery shell on the marker leaves it untouched;
//   * bots of all four hulls fire main guns and secondaries; no bot mounts a deck gun.
// Every expectation is derived from CONFIG / the hull's folded stats / the
// shared geometry — never a bare number or a name string.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  DEFAULT_KIT,
  SHIFT_IDS,
  SHIP_CLASS_IDS,
  SLOT_BOOST,
  SLOT_GUN,
  aimPointOf,
  bearing,
  desiredTurretAngle,
  turretMounts,
  turretStationWorld,
  type InputMsg,
  type ShellState,
  type ShiftId,
  type ShipClassId,
} from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { buildFrame } from '../game/frames.js';
import { flatRaster } from './islandFixture.js';

const DT = CONFIG.tick.simDtMs;
/** Ticks for any turret to traverse any legal arc (≤ 360°), plus one. */
const SETTLE_TICKS = Math.ceil(360 / ((CONFIG.mainBattery.traverseDegPerS * DT) / 1000)) + 1;

function bareWorld(seed = 7): World {
  const w = new World(seed, CONFIG.match.fillTo, CONFIG.zone);
  w.map.islands.length = 0;
  w.map.heightRaster = flatRaster();
  return w;
}

function place(w: World, id: string, x: number, y: number, heading = 0, hull?: ShipClassId, shift?: ShiftId): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), 'captain', hull, undefined, undefined, shift);
  rec.state.x = x;
  rec.state.y = y;
  rec.state.heading = heading;
  rec.state.speed = 0;
  return rec;
}

/** One well-formed input; `seq` must rise per ship. */
function inp(seq: number, o: Partial<InputMsg> = {}): InputMsg {
  return { seq, throttle: 0, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: SLOT_GUN, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0, held: false, sec: false, ...o };
}

/** The ship's own shells, by family. */
function shellsOf(w: World, owner: string, family: ShellState['family']): ShellState[] {
  return [...w.shells.values()].filter((s) => s.ownerId === owner && s.family === family);
}

/** Indices of the turrets with a running reload. */
function reloading(rec: ShipRecord): number[] {
  return rec.turrets.flatMap((t, i) => (t.reloadMsLeft > 0 ? [i] : []));
}

/** A port-beam aim point at `dist` from the centre of a heading-0 hull. */
const BEAM = Math.PI / 2;

describe('main battery — the R4 click on the authoritative world', () => {
  it('ON TARGET: a trained turret fires its own guns AT the aim point; only its reload starts', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const dist = a.stats.equipment.mainBattery.rangeU / 2;
    w.submitInput('a', inp(1, { aim: BEAM, aimDist: dist }));
    for (let i = 0; i < SETTLE_TICKS; i++) w.step();
    w.submitInput('a', inp(2, { aim: BEAM, aimDist: dist, fireSeq: 1 }));
    w.step();
    const shells = shellsOf(w, 'a', 'cannon');
    // R4 priority 1, lowest index: every turret bears on the beam, so turret 0.
    expect(reloading(a)).toEqual([0]);
    expect(shells).toHaveLength(turretMounts(a.hullId)[0].guns);
    expect(a.turrets[0].reloadMsLeft).toBe(a.stats.equipment.mainBattery.reloadMs);
    // The salvo straddles the aim point: its parallel tracks' targets average to it.
    const aim = aimPointOf(a.state, BEAM, dist);
    const cx = shells.reduce((s, sh) => s + sh.targetX!, 0) / shells.length;
    const cy = shells.reduce((s, sh) => s + sh.targetY!, 0) / shells.length;
    expect(cx).toBeCloseTo(aim.x, 6);
    expect(cy).toBeCloseTo(aim.y, 6);
    // ...on the cannon shell's hit rule, the row's damage, NO mine bit.
    for (const sh of shells) {
      expect(sh.damage).toBe(a.stats.equipment.mainBattery.damage);
      expect(sh.hits).toEqual(CONFIG.mainBattery.hits);
      expect(sh.hits).not.toContain('mine');
    }
    // Slot 0's pair is the derived summary: one turret down.
    expect(a.loadout[SLOT_GUN].state).toEqual({ n: a.turrets.length - 1, reloadMsLeft: a.stats.equipment.mainBattery.reloadMs });
  });

  it('TWO CANDIDATES: a ready turret ON the aim wins over a lower-index ready turret off it', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const dist = a.stats.equipment.mainBattery.rangeU / 2;
    const aim = aimPointOf(a.state, BEAM, dist);
    // Turret 0 stays at rest (90° off the beam); turret 1 sits exactly on it.
    a.turrets[1].a = desiredTurretAngle(a.hullId, 1, a.state, aim);
    w.submitInput('a', inp(1, { aim: BEAM, aimDist: dist, fireSeq: 1 }));
    w.step();
    expect(reloading(a)).toEqual([1]);
    expect(shellsOf(w, 'a', 'cannon')).toHaveLength(turretMounts(a.hullId)[1].guns);
  });

  it('EARLY CLICK: no turret on the aim → one ready turret fires along its CURRENT bearing', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const dist = a.stats.equipment.mainBattery.rangeU / 2;
    // Every turret at rest, the aim a quarter turn away: one tick of traverse
    // cannot reach it.
    w.submitInput('a', inp(1, { aim: BEAM, aimDist: dist, fireSeq: 1 }));
    w.step();
    const fired = reloading(a);
    expect(fired).toHaveLength(1);
    const i = fired[0];
    const shells = shellsOf(w, 'a', 'cannon');
    expect(shells).toHaveLength(turretMounts(a.hullId)[i].guns);
    const along = a.state.heading + a.turrets[i].a; // the turret's current world bearing
    for (const sh of shells) expect(Math.atan2(sh.vy, sh.vx)).toBeCloseTo(Math.atan2(Math.sin(along), Math.cos(along)), 9);
    // ...at the aim's distance from that turret's station (inside reach).
    const station = turretStationWorld(a.hullId, i, a.state);
    const aimPt = aimPointOf(a.state, BEAM, dist);
    const cx = shells.reduce((s, sh) => s + sh.targetX!, 0) / shells.length;
    const cy = shells.reduce((s, sh) => s + sh.targetY!, 0) / shells.length;
    expect(Math.hypot(cx - station.x, cy - station.y)).toBeCloseTo(Math.hypot(aimPt.x - station.x, aimPt.y - station.y), 6);
    expect(bearing(station, { x: cx, y: cy })).not.toBeCloseTo(bearing(station, aimPt), 2);
  });

  it('NOTHING READY: every turret reloading → nothing fires, the wire denial is `cooling`', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    for (const t of a.turrets) t.reloadMsLeft = a.stats.equipment.mainBattery.reloadMs;
    w.submitInput('a', inp(1, { aim: 0, aimDist: 300, fireSeq: 1 }));
    w.step();
    expect(shellsOf(w, 'a', 'cannon')).toHaveLength(0);
    expect(buildFrame(w, 'a').denied).toEqual([{ slot: SLOT_GUN, reason: 'cooling', seq: 1 }]);
  });

  it('a turret fired at tick T is ready again exactly reloadMs later', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    a.turrets[0].reloadMsLeft = a.stats.equipment.mainBattery.reloadMs;
    const ticks = a.stats.equipment.mainBattery.reloadMs / DT;
    for (let k = 1; k < ticks; k++) w.step();
    expect(a.turrets[0].reloadMsLeft).toBeGreaterThan(0);
    w.step();
    expect(a.turrets[0].reloadMsLeft).toBe(0);
  });

  it('INSTANT RELOAD finishes EVERY turret; the angles and the secondaries heat are untouched', () => {
    const w = bareWorld();
    const shift: ShiftId = 'instantReload';
    expect(SHIFT_IDS).toContain(shift);
    const a = place(w, 'a', 0, 0, 0, undefined, shift);
    expect(a.loadout[SLOT_BOOST].equipmentId).toBe(shift);
    a.turrets.forEach((t, i) => {
      t.reloadMsLeft = (i + 1) * DT * 10;
    });
    a.turrets[0].a = 0.25;
    a.sec.heat = 0.5;
    const angles = a.turrets.map((t) => t.a);
    expect(w.sinkingActivationGate(a, SLOT_BOOST).ok).toBe(true);
    expect(reloading(a)).toEqual([]);
    expect(a.turrets.map((t) => t.a)).toEqual(angles);
    expect(a.sec.heat).toBe(0.5);
    expect(a.loadout[SLOT_GUN].state).toEqual({ n: a.turrets.length, reloadMsLeft: 0 });
  });

  it('a SINKING hull\'s turrets hold their angles (whatever it aims) while their reloads still count down', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    place(w, 'b', 0, 400);
    a.turrets[0].reloadMsLeft = a.stats.equipment.mainBattery.reloadMs;
    w.sinkShip('a', 'b');
    const angles = a.turrets.map((t) => t.a);
    const before = a.turrets[0].reloadMsLeft;
    w.submitInput('a', inp(1, { aim: BEAM, aimDist: 400 }));
    for (let i = 0; i < 5; i++) w.step();
    expect(a.turrets.map((t) => t.a)).toEqual(angles);
    expect(a.turrets[0].reloadMsLeft).toBe(before - 5 * DT);
  });

  it('a respawn brings the turrets back at rest and loaded, the secondaries cold', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    a.turrets[0].a = 0.3;
    a.turrets[1].reloadMsLeft = 1;
    a.sec.heat = 0.9;
    w.sinkShip('a');
    w.step(CONFIG.ship.sinkingWindowMs);
    for (let i = 0; i < Math.ceil(CONFIG.ship.respawnDelay / DT) + 2 && a.lifecycle.kind !== 'alive'; i++) w.step();
    expect(a.lifecycle.kind).toBe('alive');
    expect(a.turrets.map((t) => t.reloadMsLeft).every((r) => r === 0)).toBe(true);
    turretMounts(a.hullId).forEach((m, i) => expect(a.turrets[i].a).toBe(m.facing === 'fwd' ? 0 : Math.PI));
    expect(a.sec.heat).toBe(0);
  });
});

describe('secondaries — the heat-limited stream on the authoritative world', () => {
  it('BURST then RELEASE: rounds stream while held (family mg, direct), heat rises, then drains with no rounds', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    w.submitInput('a', inp(1, { aim: 0, aimDist: a.stats.secondaryRangeU, sec: true }));
    w.step();
    const first = shellsOf(w, 'a', 'mg');
    expect(first).toHaveLength(1); // the press tick fires its round
    expect(first[0].damage).toBe(CONFIG.secondaries.damage);
    expect(first[0].direct).toBe(true);
    for (let i = 0; i < 10; i++) w.step();
    expect(a.sec.heat).toBeGreaterThan(0);
    expect(a.sec.locked).toBe(false);
    const heat = a.sec.heat;
    const ids = new Set([...w.shells.keys()]);
    w.submitInput('a', inp(2, { aim: 0, aimDist: a.stats.secondaryRangeU, sec: false }));
    w.step();
    expect(a.sec.heat).toBeLessThan(heat);
    expect([...w.shells.values()].some((s) => !ids.has(s.id) && s.family === 'mg')).toBe(false);
    // ...and the own frame carries {heat, locked} only.
    expect(buildFrame(w, 'a').you!.sec).toEqual({ heat: a.sec.heat, locked: false });
  });

  it('OVERHEAT: continuous fire locks the guns; no round while locked even if held; they fire again once cooled', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    w.submitInput('a', inp(1, { aim: 0, aimDist: a.stats.secondaryRangeU, sec: true }));
    const cap = Math.ceil(CONFIG.secondaries.overheatMs / DT) + 2;
    for (let i = 0; i < cap && !a.sec.locked; i++) w.step();
    expect(a.sec.locked).toBe(true);
    let count = shellsOf(w, 'a', 'mg').length + 0;
    const seen = new Set([...w.shells.keys()]);
    const coolCap = Math.ceil(CONFIG.secondaries.coolMs / DT) + 2;
    let firedWhileLocked = false;
    for (let i = 0; i < coolCap && a.sec.locked; i++) {
      w.step();
      if (a.sec.locked && [...w.shells.values()].some((s) => !seen.has(s.id) && s.family === 'mg')) firedWhileLocked = true;
    }
    expect(firedWhileLocked).toBe(false);
    expect(a.sec.locked).toBe(false);
    count = [...w.shells.values()].filter((s) => !seen.has(s.id) && s.family === 'mg').length;
    w.step(); // still held: the guns are back
    expect([...w.shells.values()].filter((s) => !seen.has(s.id) && s.family === 'mg').length).toBeGreaterThan(count);
  });

  it('a DEAD hull streams nothing; a SINKING one still fires (weapons stay live in the window)', () => {
    const w = bareWorld();
    w.respawnEnabled = false; // a live match: the dead stay dead
    const a = place(w, 'a', 0, 0);
    w.sinkShip('a');
    w.submitInput('a', inp(1, { aim: 0, aimDist: a.stats.secondaryRangeU, sec: true }));
    w.step();
    expect(shellsOf(w, 'a', 'mg').length).toBeGreaterThan(0);
    w.step(CONFIG.ship.sinkingWindowMs); // founders
    expect(a.lifecycle.kind).toBe('sunk');
    const ids = new Set([...w.shells.keys()]);
    for (let i = 0; i < 5; i++) w.step();
    expect([...w.shells.values()].some((s) => !ids.has(s.id) && s.ownerId === 'a')).toBe(false);
  });
});

describe('mines — only the secondaries hurt one (R3)', () => {
  /** A mine owned by a third party at (x, 0), armed. */
  function mine(w: World, x: number): void {
    w.mines.set('m', { id: 'm', ownerId: 'm-owner', x, y: 0, armedAt: 0, kind: 'naval', hp: CONFIG.mine.hp });
  }

  it('a secondaries round landing on the marker takes its damage off the mine; it pops when the hp is spent', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    // Inside the full-damage radius, so no attenuation enters the count.
    const x = CONFIG.gunAttenuation.fullFrac * a.stats.secondaryRangeU * 0.8;
    mine(w, x);
    w.submitInput('a', inp(1, { aim: 0, aimDist: x, sec: true }));
    const hits: number[] = [];
    let last: number = CONFIG.mine.hp;
    for (let i = 0; i < 200 && w.mines.has('m'); i++) {
      w.step();
      const m = w.mines.get('m');
      const now = m === undefined ? 0 : m.hp;
      if (now < last) hits.push(last - now);
      last = now;
    }
    expect(w.mines.has('m')).toBe(false);
    // Every landing took exactly one round's damage (the final one may be clipped at 0).
    for (const h of hits.slice(0, -1)) expect(h).toBe(CONFIG.secondaries.damage);
    expect(hits).toHaveLength(Math.ceil(CONFIG.mine.hp / CONFIG.secondaries.damage));
  });

  it('a main-battery salvo landing on the marker leaves the mine untouched', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const x = a.stats.equipment.mainBattery.rangeU / 3;
    mine(w, x);
    w.submitInput('a', inp(1, { aim: 0, aimDist: x }));
    for (let i = 0; i < SETTLE_TICKS; i++) w.step();
    w.submitInput('a', inp(2, { aim: 0, aimDist: x, fireSeq: 1 }));
    w.step();
    expect(shellsOf(w, 'a', 'cannon').length).toBeGreaterThan(0);
    for (let i = 0; i < 60 && shellsOf(w, 'a', 'cannon').length > 0; i++) w.step();
    expect(shellsOf(w, 'a', 'cannon')).toHaveLength(0); // the salvo landed
    expect(w.mines.get('m')?.hp).toBe(CONFIG.mine.hp);
  });
});

describe('bots — every hull fights with main guns and secondaries; no deck gun on a captain', () => {
  it('a short deterministic melee: each of the four hulls fires a main salvo and a secondaries round', () => {
    const w = bareWorld(11);
    const ids: string[] = [];
    SHIP_CLASS_IDS.forEach((hull, i) => {
      const rec = w.addBot(hull, undefined, SHIFT_IDS[i % SHIFT_IDS.length], DEFAULT_KIT);
      // A tight square, every hull inside everyone's sight and secondaries reach.
      const r = rec.stats.secondaryRangeU / 3;
      const ang = (i / SHIP_CLASS_IDS.length) * Math.PI * 2;
      rec.state.x = Math.cos(ang) * r;
      rec.state.y = Math.sin(ang) * r;
      rec.state.heading = ang + Math.PI / 2;
      ids.push(rec.id);
    });
    for (const id of ids) {
      const rec = w.ships.get(id)!;
      expect(rec.loadout[SLOT_GUN].equipmentId).toBe('mainBattery');
    }
    const cannon = new Set<string>();
    const mg = new Set<string>();
    const ticks = Math.ceil((2 * CONFIG.mainBattery.reloadMs) / DT);
    for (let i = 0; i < ticks && (cannon.size < ids.length || mg.size < ids.length); i++) {
      w.step();
      for (const s of w.shells.values()) {
        if (s.family === 'cannon') cannon.add(s.ownerId);
        if (s.family === 'mg') mg.add(s.ownerId);
      }
    }
    expect([...cannon].sort()).toEqual([...ids].sort());
    expect([...mg].sort()).toEqual([...ids].sort());
    for (const id of ids) {
      const deck: readonly (string | null)[] = ['gun', 'machineGun', 'flak'];
      expect(w.ships.get(id)!.loadout.some((s) => deck.includes(s.equipmentId))).toBe(false);
    }
  });
});
