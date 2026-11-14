// THE MAIN BATTERY AND THE SECONDARIES ON THE AUTHORITATIVE WORLD (Story 10.4,
// Eric rulings R2–R4, epic-10 amendment 9; arc-only fire, amendment 10). The pure steppers are pinned in
// shared (turrets.test.ts / secondaries.test.ts); this suite pins the SERVER's
// wiring of them — the I/O matrix rows the server owns:
//   * NO TRAVERSE (Story 11.1, R16): on the FIRST click tick a ready turret
//     whose arc holds the aim fires ONE salvo at the aim point (every shell
//     dispersed around it — dispersion.test.ts), only its reload starts;
//   * bow first: the lowest-index ready turret that bears fires;
//   * nothing ready, or no READY turret whose arc holds the aim → the `cooling`
//     denial, nothing fires and no reload starts, however long the click is held;
//   * INSTANT RELOAD finishes every turret (angles untouched) and vents the
//     secondaries (heat 0 — Story 10.5, R10);
//   * a sinking hull's turrets keep their angles while reloads still run;
//   * secondaries: burst, release / cool, full heat never locks, refused once dead;
//   * a secondaries round on a mine's marker damages it and pops it when its
//     hp is spent; a main-battery shell on the marker leaves it untouched;
//   * bots of all four hulls fire main guns and secondaries; no bot mounts a deck gun.
// Every expectation is derived from CONFIG / the hull's folded stats / the
// shared geometry — never a bare number or a name string.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  secondariesIntervalMs,
  SHIFT_IDS,
  SHIP_CLASS_IDS,
  SLOT_BOOST,
  SLOT_GUN,
  aimPointOf,
  dispersionAxes,
  turretBears,
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
  return { seq, throttle: 0, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: SLOT_GUN, fireT: 0, actSeq: 0, act: 0, hornSeq: 0, held: false, sec: false, ...o };
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

describe('main battery — the arc-only click on the authoritative world', () => {
  it('FIRST CLICK TICK: turrets at rest, a click on the beam — turret 0 fires its guns AT the aim point that tick; only its reload starts', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const dist = a.stats.equipment.mainBattery.rangeU / 2;
    turretMounts(a.hullId).forEach((m, i) => expect(a.turrets[i].a).toBe(m.facing === 'fwd' ? 0 : Math.PI)); // the premise: nowhere near the beam
    w.submitInput('a', inp(1, { aim: BEAM, aimDist: dist, fireSeq: 1 }));
    w.step();
    const shells = shellsOf(w, 'a', 'cannon');
    // Every turret bears on the beam: the lowest index, with no traverse wait.
    expect(reloading(a)).toEqual([0]);
    expect(shells).toHaveLength(turretMounts(a.hullId)[0].guns);
    expect(a.turrets[0].reloadMsLeft).toBe(a.stats.equipment.mainBattery.reloadMs);
    // CONVERGE (R13): every shell is aimed at the one aim point, so every
    // landing is within the dispersion ellipse's long semi-axis of it.
    const aim = aimPointOf(a.state, BEAM, dist);
    const station = turretStationWorld(a.hullId, 0, a.state);
    const { alongU } = dispersionAxes(Math.hypot(aim.x - station.x, aim.y - station.y) * 2);
    for (const sh of shells) expect(Math.hypot(sh.targetX! - aim.x, sh.targetY! - aim.y)).toBeLessThanOrEqual(alongU);
    // ...on the cannon shell's hit rule, the row's damage, NO mine bit.
    for (const sh of shells) {
      expect(sh.damage).toBe(a.stats.equipment.mainBattery.damage);
      expect(sh.hits).toEqual(CONFIG.mainBattery.hits);
      expect(sh.hits).not.toContain('mine');
    }
    // Slot 0's pair is the derived summary: one turret down.
    expect(a.loadout[SLOT_GUN].state).toEqual({ n: a.turrets.length - 1, reloadMsLeft: a.stats.equipment.mainBattery.reloadMs });
    // The drawn angles snapped to the aim the same tick (the derived angle).
    turretMounts(a.hullId).forEach((_, i) => {
      const st = turretStationWorld(a.hullId, i, a.state);
      expect(a.state.heading + a.turrets[i].a).toBeCloseTo(Math.atan2(aim.y - st.y, aim.x - st.x), 9);
    });
  });

  it('BOW FIRST: with turret 0 reloading, the next ready turret that bears fires', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const dist = a.stats.equipment.mainBattery.rangeU / 2;
    a.turrets[0].reloadMsLeft = a.stats.equipment.mainBattery.reloadMs;
    w.submitInput('a', inp(1, { aim: BEAM, aimDist: dist, fireSeq: 1 }));
    w.step();
    expect(reloading(a)).toEqual([0, 1]);
    expect(shellsOf(w, 'a', 'cannon')).toHaveLength(turretMounts(a.hullId)[1].guns);
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

  it.each(SHIP_CLASS_IDS)('ARC-ONLY (%s): aim dead ahead, the forward turrets spent, the aft turrets loaded → nothing fires on any click tick, `cooling`, the aft turrets stay loaded', (hull) => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0, 0, hull);
    const dist = a.stats.equipment.mainBattery.rangeU / 2;
    const aimPt = aimPointOf(a.state, 0, dist);
    const mounts = turretMounts(a.hullId);
    mounts.forEach((m, i) => {
      expect(turretBears(a.hullId, i, a.state, aimPt), `${i}`).toBe(m.facing === 'fwd'); // the premise
      if (m.facing === 'fwd') a.turrets[i].reloadMsLeft = a.stats.equipment.mainBattery.reloadMs;
    });
    const aft = mounts.flatMap((m, i) => (m.facing === 'aft' ? [i] : []));
    w.submitInput('a', inp(1, { aim: 0, aimDist: dist, fireSeq: 1 }));
    w.step();
    expect(shellsOf(w, 'a', 'cannon')).toHaveLength(0);
    expect(buildFrame(w, 'a').denied).toEqual([{ slot: SLOT_GUN, reason: 'cooling', seq: 1 }]);
    // ...and on every later click tick too: no traverse ever brings an aft turret round.
    for (let seq = 2; seq <= 20; seq++) {
      w.submitInput('a', inp(seq, { aim: 0, aimDist: dist, fireSeq: seq }));
      w.step();
    }
    expect(shellsOf(w, 'a', 'cannon')).toHaveLength(0);
    for (const i of aft) expect(a.turrets[i].reloadMsLeft, `aft ${i}`).toBe(0);
    expect(a.loadout[SLOT_GUN].state?.n).toBe(aft.length); // the hotbar still counts them ready
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

  it('INSTANT RELOAD finishes EVERY turret and VENTS the secondaries (Story 10.5, R10); the angles are untouched', () => {
    const w = bareWorld();
    const shift: ShiftId = 'instantReload';
    expect(SHIFT_IDS).toContain(shift);
    const a = place(w, 'a', 0, 0, 0, undefined, shift);
    expect(a.loadout[SLOT_BOOST].equipmentId).toBe(shift);
    a.turrets.forEach((t, i) => {
      t.reloadMsLeft = (i + 1) * DT * 10;
    });
    a.turrets[0].a = 0.25;
    a.sec.heat = 1;
    const angles = a.turrets.map((t) => t.a);
    expect(w.sinkingActivationGate(a, SLOT_BOOST).ok).toBe(true);
    expect(reloading(a)).toEqual([]);
    expect(a.turrets.map((t) => t.a)).toEqual(angles);
    expect(a.sec.heat).toBe(0);
    expect(a.loadout[SLOT_GUN].state).toEqual({ n: a.turrets.length, reloadMsLeft: 0 });
  });

  it('a SINKING hull\'s turrets keep their angles (whatever it aims) while their reloads still count down', () => {
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

  // Story 10.4 gate S2: aimDist 0 (the neutral input before a player's first
  // real one, an idle bot) is NO AIM — before batteryAimPoint the aim point
  // was the hull's own centre and every turret slewed to a hard stop.
  it('NO AIM: a hull on the neutral input (aimDist 0, any bearing) keeps every turret at rest for 3 s', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const b = place(w, 'b', 0, 2000);
    const restA = a.turrets.map((t) => t.a);
    const restB = b.turrets.map((t) => t.a);
    // `a` never sends an input (neutralInput); `b` sends a bearing with no distance.
    w.submitInput('b', inp(1, { aim: BEAM, aimDist: 0 }));
    for (let i = 0; i < Math.ceil(3000 / DT); i++) w.step();
    expect(a.turrets.map((t) => t.a)).toEqual(restA);
    expect(b.turrets.map((t) => t.a)).toEqual(restB);
  });

  it('NO AIM: a click carrying aimDist 0 fires nothing, starts no reload, and is refused like nothing-ready', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    w.submitInput('a', inp(1, { aim: BEAM, aimDist: 0, fireSeq: 1 }));
    w.step();
    expect(shellsOf(w, 'a', 'cannon')).toHaveLength(0);
    expect(reloading(a)).toEqual([]);
    expect(a.loadout[SLOT_GUN].state).toEqual({ n: a.turrets.length, reloadMsLeft: 0 });
    expect(buildFrame(w, 'a').denied).toEqual([{ slot: SLOT_GUN, reason: 'cooling', seq: 1 }]);
  });
});

describe('secondaries — the heat-limited stream on the authoritative world', () => {
  it('BURST then RELEASE: rounds stream while held (family mg, flying over ships — epic-11 amendment <AMENDMENT>), heat rises, then drains with no rounds', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    w.submitInput('a', inp(1, { aim: 0, aimDist: a.stats.secondaryRangeU, sec: true }));
    w.step();
    const first = shellsOf(w, 'a', 'mg');
    expect(first).toHaveLength(1); // the press tick fires its round
    expect(first[0].damage).toBe(CONFIG.secondaries.damage);
    expect(first[0].overShips).toBe(true); // the main battery's flight: only the landing point counts
    for (let i = 0; i < 10; i++) w.step();
    expect(a.sec.heat).toBeGreaterThan(0);
    const heat = a.sec.heat;
    const ids = new Set([...w.shells.keys()]);
    w.submitInput('a', inp(2, { aim: 0, aimDist: a.stats.secondaryRangeU, sec: false }));
    // The last round's own interval does not cool (heat per ROUND, Story
    // 10.4 gate): step past it before the drain shows.
    for (let i = 0; i < Math.ceil(secondariesIntervalMs(heat) / DT) + 1; i++) w.step();
    expect(a.sec.heat).toBeLessThan(heat);
    expect([...w.shells.values()].some((s) => !ids.has(s.id) && s.family === 'mg')).toBe(false);
    // ...and the own frame carries {heat} only.
    expect(buildFrame(w, 'a').you!.sec).toEqual({ heat: a.sec.heat });
  });

  it('FULL HEAT NEVER LOCKS: continuous fire reaches full heat and the held guns keep streaming at the hot interval', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    w.submitInput('a', inp(1, { aim: 0, aimDist: a.stats.secondaryRangeU, sec: true }));
    const cap = Math.ceil(CONFIG.secondaries.overheatMs / DT) + 2;
    for (let i = 0; i < cap && a.sec.heat < 1; i++) w.step();
    expect(a.sec.heat).toBe(1);
    const seen = new Set([...w.shells.keys()]);
    let fired = 0;
    const hotTicks = Math.ceil(secondariesIntervalMs(1) / DT);
    for (let i = 0; i < hotTicks * 3 + 1; i++) {
      w.step();
      for (const s of w.shells.values()) {
        if (seen.has(s.id) || s.family !== 'mg') continue;
        seen.add(s.id);
        fired += 1;
      }
      expect(a.sec.heat).toBe(1);
    }
    expect(fired).toBeGreaterThanOrEqual(3); // still held at full heat: the guns never stop
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
    // Mid-reach: every dispersed landing is a unit or two off the marker's
    // centre, well inside its hit radius (flat damage, Story 11.1).
    const x = 0.4 * a.stats.secondaryRangeU;
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
    w.submitInput('a', inp(1, { aim: 0, aimDist: x, fireSeq: 1 }));
    w.step();
    expect(shellsOf(w, 'a', 'cannon').length).toBeGreaterThan(0);
    // The salvo's whole flight at the row's muzzle velocity, plus a few ticks.
    const flightTicks = Math.ceil((x / CONFIG.mainBattery.shellSpeed) * (1000 / CONFIG.tick.simDtMs)) + 10;
    for (let i = 0; i < flightTicks && shellsOf(w, 'a', 'cannon').length > 0; i++) w.step();
    expect(shellsOf(w, 'a', 'cannon')).toHaveLength(0); // the salvo landed
    expect(w.mines.get('m')?.hp).toBe(CONFIG.mine.hp);
  });
});

describe('bots — every hull fights with main guns and secondaries; no deck gun on a captain', () => {
  it('a short deterministic melee: each of the four hulls fires a main salvo and a secondaries round', () => {
    const w = bareWorld(11);
    const ids: string[] = [];
    SHIP_CLASS_IDS.forEach((hull, i) => {
      const rec = w.addBot(hull, undefined, SHIFT_IDS[i % SHIFT_IDS.length]);
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
