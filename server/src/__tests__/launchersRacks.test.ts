// THE LAUNCHERS, THE RACKS AND THE TWO ABILITY LADDERS ON THE AUTHORITATIVE
// WORLD (Story 10.6, Eric 2026-11-05, R6–R9 / R13–R18, I3, epic-10 amendment
// 12). The pure models are pinned in shared (launchers.test.ts, racks.test.ts,
// catalogUnderIndex.test.ts); this suite pins the SERVER's wiring of them —
// the non-pure rows of the spec's I/O matrix:
//   * a FORE-only hull aiming astern is refused `out-of-arc`, nothing spent;
//   * both launchers bearing, four tubes loaded: ONE click, ONE torpedo;
//   * no tube loaded: the `cooling` denial;
//   * SECOND LAUNCHER TUBE before AFT: the aft launcher arrives with two;
//   * rack restock, alternation and the empty-turn rack on the real world;
//   * EXPANDED after SECOND (captive): four held;
//   * HULL REPAIR at three cards, two hulls: the same heal and cooldown;
//   * SMOKE at 0 / 2 / 5 cards: the stamped cloud; a later card leaves it;
//   * a RELOAD card mid-reload rescales a running tube and a running rack;
//   * INSTANT RELOAD: every tube, one mine per rack;
//   * tier cards change no tube or mine count.
// Every expectation is derived from CONFIG / the folded stats / the shared
// laws — never a bare number or a name string.

import { describe, it, expect } from 'vitest';
import {
  CATALOG,
  CONFIG,
  isAfloat,
  FAMILY_SLOT,
  SLOT_BOOST,
  SLOT_GUN,
  abilityCode,
  launcherAimPoint,
  launcherStationWorld,
  launcherSummary,
  rackCapacity,
  reloadCooldownScale,
  smokeSizeScale,
  type InputMsg,
  type ShiftId,
  type ShipClassId,
} from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { buildFrame } from '../game/frames.js';
import { flatRaster } from './islandFixture.js';

const DT = CONFIG.tick.simDtMs;
const SLOT_TORP = FAMILY_SLOT.torpedo;
const SLOT_MINE = FAMILY_SLOT.mine;
/** Ticks for any mount to traverse any legal arc (≤ 360°), plus one. */
const SETTLE_TICKS = Math.ceil(360 / ((CONFIG.mainBattery.traverseDegPerS * DT) / 1000)) + 1;
/** A torpedo aim distance — any positive distance names the bearing. */
const TORP_DIST = 600;

function bareWorld(seed = 7): World {
  const w = new World(seed, CONFIG.match.fillTo, CONFIG.zone);
  w.map.islands.length = 0;
  w.map.heightRaster = flatRaster();
  return w;
}

function place(w: World, id: string, x = 0, y = 0, hull?: ShipClassId, shift?: ShiftId): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), 'captain', hull, undefined, undefined, shift);
  rec.state.x = x;
  rec.state.y = y;
  rec.state.heading = 0;
  rec.state.speed = 0;
  return rec;
}

/** Per-ship input sequence, so every submit is accepted. */
const seqs = new WeakMap<ShipRecord, number>();
function submit(w: World, rec: ShipRecord, o: Partial<InputMsg>): number {
  const seq = (seqs.get(rec) ?? 0) + 1;
  seqs.set(rec, seq);
  const input: InputMsg = {
    seq, throttle: 0, rudder: 0, aim: 0, fireSeq: rec.lastFireSeq, aimDist: 0, slot: SLOT_GUN,
    fireT: 0, actSeq: rec.lastActSeq, act: 0, hornSeq: 0, held: false, sec: false, ...o,
  };
  w.submitInput(rec.id, input);
  return seq;
}

/** Train the launchers on `aim` (no click), long enough to arrive anywhere. */
function train(w: World, rec: ShipRecord, aim: number): void {
  submit(w, rec, { aim, aimDist: TORP_DIST, slot: SLOT_TORP });
  for (let i = 0; i < SETTLE_TICKS; i += 1) w.step();
}

/** One torpedo click along `aim`; returns the fireSeq used. */
function clickTorpedo(w: World, rec: ShipRecord, aim: number): number {
  const fireSeq = rec.lastFireSeq + 1;
  submit(w, rec, { aim, aimDist: TORP_DIST, slot: SLOT_TORP, fireSeq });
  w.step();
  return fireSeq;
}

/** One mine click dead astern inside the rack's reach. */
function clickMine(w: World, rec: ShipRecord): void {
  const fireSeq = rec.lastFireSeq + 1;
  submit(w, rec, { aim: rec.state.heading + Math.PI, aimDist: CONFIG.mine.placeRange / 2, slot: SLOT_MINE, fireSeq });
  w.step();
}

const torpsOf = (w: World, owner: string) => [...w.shells.values()].filter((s) => s.ownerId === owner && s.kind === 'torp');
const tubes = (rec: ShipRecord): number[] => rec.launchers.flatMap((l) => l.tubes);
const loadedTubes = (rec: ShipRecord): number => tubes(rec).filter((t) => t <= 0).length;
const minesOf = (w: World, owner: string) => [...w.mines.values()].filter((m) => m.ownerId === owner);

describe('launchers on the world — the R16 pick through the click channel', () => {
  it('FORE ONLY, aim astern: refused out-of-arc, nothing spent, the launcher holds its angle', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    w.applyCard(a, 'heavyTorpedo');
    expect(a.launchers).toHaveLength(1);
    train(w, a, Math.PI / 4); // trained somewhere inside its arc
    const angle = a.launchers[0].a;
    const seq = clickTorpedo(w, a, Math.PI); // dead astern: the 80° wedge
    expect(torpsOf(w, 'a')).toHaveLength(0);
    expect(tubes(a)).toEqual([0]);
    expect(a.launchers[0].a).toBe(angle);
    expect(buildFrame(w, 'a').denied).toEqual([{ slot: SLOT_TORP, reason: 'out-of-arc', seq }]);
  });

  it('a click with no aim distance names no area: refused out-of-arc', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    w.applyCard(a, 'lightTorpedo');
    const fireSeq = a.lastFireSeq + 1;
    submit(w, a, { aim: 0, aimDist: 0, slot: SLOT_TORP, fireSeq });
    w.step();
    expect(torpsOf(w, 'a')).toHaveLength(0);
    expect(buildFrame(w, 'a').denied).toEqual([{ slot: SLOT_TORP, reason: 'out-of-arc', seq: fireSeq }]);
  });

  it('BOTH LAUNCHERS BEAR, four tubes loaded: one click is exactly ONE torpedo and ONE tube reloading', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    for (const id of ['heavyTorpedo', 'aftTorpedoLauncher', 'secondLauncherTube']) w.applyCard(a, id);
    expect(tubes(a)).toEqual([0, 0, 0, 0]);
    train(w, a, Math.PI / 2); // the beam: inside both arcs
    clickTorpedo(w, a, Math.PI / 2);
    expect(torpsOf(w, 'a')).toHaveLength(1);
    expect(tubes(a).filter((t) => t > 0)).toHaveLength(1);
    // The slot's pair is the launchers' summary: three loaded.
    expect(a.loadout[SLOT_TORP].state).toEqual(launcherSummary(a.launchers));
    expect(a.loadout[SLOT_TORP].state!.n).toBe(3);
  });

  it('the fired tube reloads on the held torpedo\'s FOLDED reload; the torpedo runs from its station at the aim point', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    w.applyCard(a, 'lightTorpedo');
    train(w, a, Math.PI / 3);
    clickTorpedo(w, a, Math.PI / 3);
    const [t] = torpsOf(w, 'a');
    // ON TARGET: it runs from the launcher's station straight at the aim point.
    const st = launcherStationWorld(a.hullId, 0, a.state);
    const p = launcherAimPoint(a.state, a.hullId, Math.PI / 3, TORP_DIST)!;
    expect(Math.atan2(t.vy, t.vx)).toBeCloseTo(Math.atan2(p.y - st.y, p.x - st.x), 6);
    // The click resolves in fireControl, AFTER this tick's launcher step: the clock is whole.
    expect(a.launchers[0].tubes[0]).toBe(a.stats.equipment.lightTorpedo.reloadMs);
  });

  it('NO TUBE LOADED: a click in arc is refused `cooling`, nothing fires', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    w.applyCard(a, 'heavyTorpedo');
    train(w, a, 0);
    clickTorpedo(w, a, 0);
    expect(torpsOf(w, 'a')).toHaveLength(1);
    const seq = clickTorpedo(w, a, 0);
    expect(torpsOf(w, 'a')).toHaveLength(1);
    expect(buildFrame(w, 'a').denied).toEqual([{ slot: SLOT_TORP, reason: 'cooling', seq }]);
  });
});

describe('launchers on the world — cards resize them, everything arrives loaded (I3)', () => {
  it('SECOND LAUNCHER TUBE before AFT: the fore gets two tubes, then the aft arrives with two', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    w.applyCard(a, 'supercavTorpedo');
    w.applyCard(a, 'secondLauncherTube');
    expect(a.launchers.map((l) => l.tubes)).toEqual([[0, 0]]);
    w.applyCard(a, 'aftTorpedoLauncher');
    expect(a.launchers.map((l) => l.tubes)).toEqual([[0, 0], [0, 0]]);
    expect(a.loadout[SLOT_TORP].state).toEqual({ n: 4, reloadMsLeft: 0 });
  });

  it('a new tube arrives LOADED beside a running one, whose clock is untouched', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    w.applyCard(a, 'heavyTorpedo');
    train(w, a, 0);
    clickTorpedo(w, a, 0);
    const running = a.launchers[0].tubes[0];
    expect(running).toBeGreaterThan(0);
    w.applyCard(a, 'secondLauncherTube');
    expect(a.launchers[0].tubes).toEqual([running, 0]);
  });

  it('tier cards change no tube count (R4)', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    w.applyCard(a, 'heavyTorpedo');
    for (let i = 1; i < CATALOG.heavyTorpedo.cap; i += 1) w.applyCard(a, 'heavyTorpedo');
    expect(tubes(a)).toHaveLength(1);
  });

  it('a fresh life brings the launchers back at rest and loaded', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    place(w, 'b', 0, 2000);
    w.applyCard(a, 'heavyTorpedo');
    train(w, a, Math.PI / 4);
    clickTorpedo(w, a, Math.PI / 4);
    w.sinkShip('a', 'b');
    for (let i = 0; i < 20_000 / DT && !isAfloat(a.lifecycle); i += 1) w.step();
    expect(isAfloat(a.lifecycle)).toBe(true); // respawned (a standalone World respawns)
    expect(a.launchers).toEqual([{ a: 0, tubes: [0] }]);
  });
});

describe('racks on the world — restock, alternation, the empty-turn rack (R7 / R17 / R18)', () => {
  it('RESTOCK: a drop starts the clock at once; one mine per cycle; the clock stops when full', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    w.applyCard(a, 'navalMines');
    const cap = rackCapacity(a.stats, 'navalMines');
    expect(a.racks.racks).toEqual([{ n: cap, reloadMsLeft: 0 }]);
    clickMine(w, a);
    expect(minesOf(w, 'a')).toHaveLength(1);
    const reload = a.stats.equipment.navalMines.reloadMs;
    expect(a.racks.racks[0]).toEqual({ n: cap - 1, reloadMsLeft: reload });
    for (let i = 0; i < reload / DT; i += 1) w.step();
    expect(a.racks.racks[0]).toEqual({ n: cap, reloadMsLeft: 0 });
    expect(a.loadout[SLOT_MINE].state).toEqual({ n: cap, reloadMsLeft: 0 });
  });

  it('TWO RACKS alternate per drop — A, B, A, B — and both clocks run', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    w.applyCard(a, 'navalMines');
    w.applyCard(a, 'secondMineRack');
    const cap = rackCapacity(a.stats, 'navalMines');
    expect(a.racks.racks.map((r) => r.n)).toEqual([cap, cap]);
    const order: number[] = [];
    for (let k = 0; k < 4; k += 1) {
      const before = a.racks.racks.map((r) => r.n);
      clickMine(w, a);
      order.push(a.racks.racks.findIndex((r, i) => r.n < before[i]));
    }
    expect(order).toEqual([0, 1, 0, 1]);
    expect(a.racks.racks.every((r) => r.reloadMsLeft > 0)).toBe(true);
  });

  it('THE EMPTY-TURN RACK: A empty on its turn, B drops, and the next turn is A\'s (R18)', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    w.applyCard(a, 'navalMines');
    w.applyCard(a, 'secondMineRack');
    a.racks.racks[0].n = 0;
    a.racks.racks[0].reloadMsLeft = a.stats.equipment.navalMines.reloadMs * 10; // keep A empty
    a.racks.next = 0;
    const b = a.racks.racks[1].n;
    clickMine(w, a);
    expect(a.racks.racks[1].n).toBe(b - 1);
    expect(a.racks.next).toBe(0);
  });

  it('EXPANDED after SECOND (captive): 2 racks × 2 = 4 held, the expanded seats arrive holding', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    w.applyCard(a, 'captiveMines');
    w.applyCard(a, 'secondMineRack');
    w.applyCard(a, 'expandedMineRacks');
    expect(a.racks.racks.map((r) => r.n)).toEqual([2, 2]);
    expect(a.loadout[SLOT_MINE].state!.n).toBe(4);
  });

  it('tier cards change no mines-per-rack (R4)', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    w.applyCard(a, 'navalMines');
    const cap = rackCapacity(a.stats, 'navalMines');
    for (let i = 1; i < CATALOG.navalMines.cap; i += 1) w.applyCard(a, 'navalMines');
    expect(rackCapacity(a.stats, 'navalMines')).toBe(cap);
    expect(a.racks.racks.map((r) => r.n)).toEqual([cap]);
  });
});

describe('a RELOAD card mid-reload rescales every running tube and rack clock (new ÷ old)', () => {
  it('a running tube and a running rack keep their progress fraction; loaded / full ones stay idle', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    w.applyCard(a, 'heavyTorpedo');
    w.applyCard(a, 'secondLauncherTube');
    w.applyCard(a, 'navalMines');
    w.applyCard(a, 'secondMineRack');
    train(w, a, 0);
    clickTorpedo(w, a, 0);
    clickMine(w, a);
    for (let i = 0; i < 10; i += 1) w.step();
    const tubeLeft = a.launchers[0].tubes[0];
    const rackLeft = a.racks.racks[0].reloadMsLeft;
    expect(tubeLeft).toBeGreaterThan(0);
    expect(rackLeft).toBeGreaterThan(0);
    const oldTorp = a.stats.equipment.heavyTorpedo.reloadMs;
    const oldMine = a.stats.equipment.navalMines.reloadMs;
    w.applyCard(a, 'reload');
    const tr = a.stats.equipment.heavyTorpedo.reloadMs / oldTorp;
    const mr = a.stats.equipment.navalMines.reloadMs / oldMine;
    expect(tr).toBeLessThan(1);
    expect(a.launchers[0].tubes[0]).toBeCloseTo(tubeLeft * tr, 9);
    expect(a.launchers[0].tubes[1]).toBe(0);
    expect(a.racks.racks[0].reloadMsLeft).toBeCloseTo(rackLeft * mr, 9);
    expect(a.racks.racks[1].reloadMsLeft).toBe(0);
  });

  it('the weapon\'s own tier card rescales its running tube the same way', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    w.applyCard(a, 'lightTorpedo');
    train(w, a, 0);
    clickTorpedo(w, a, 0);
    const left = a.launchers[0].tubes[0];
    const old = a.stats.equipment.lightTorpedo.reloadMs;
    w.applyCard(a, 'lightTorpedo');
    const ratio = a.stats.equipment.lightTorpedo.reloadMs / old;
    expect(ratio).toBeLessThan(1);
    expect(a.launchers[0].tubes[0]).toBeCloseTo(left * ratio, 9);
  });
});

describe('INSTANT RELOAD on the mounts (R14)', () => {
  it('loads every tube and gives ONE mine to each short rack', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0, undefined, 'instantReload');
    for (const id of ['heavyTorpedo', 'aftTorpedoLauncher', 'secondLauncherTube', 'navalMines', 'secondMineRack']) w.applyCard(a, id);
    const reload = a.stats.equipment.navalMines.reloadMs;
    for (const l of a.launchers) l.tubes.fill(reload);
    a.racks.racks[0].n = 0;
    a.racks.racks[0].reloadMsLeft = reload / 2;
    a.racks.racks[1].n = 1;
    a.racks.racks[1].reloadMsLeft = reload / 2;
    expect(w.sinkingActivationGate(a, SLOT_BOOST).ok).toBe(true);
    expect(loadedTubes(a)).toBe(4);
    expect(a.racks.racks.map((r) => r.n)).toEqual([1, 2]);
    expect(a.loadout[SLOT_TORP].state!.n).toBe(4);
    expect(a.loadout[SLOT_MINE].state!.n).toBe(3);
  });
});

describe('HULL REPAIR and SMOKE read the ship\'s own folded numbers (R8 / R9 / R15)', () => {
  const press = (w: World, rec: ShipRecord, act: number): void => {
    submit(w, rec, { actSeq: rec.lastActSeq + 1, act });
    w.step();
  };

  it('HULL REPAIR at three cards: +20 a card at once and in the pool; the cooldown is the law on EVERY hull', () => {
    const w = bareWorld();
    const hulls: ShipClassId[] = ['yamato', 'iowa'];
    const waits: number[] = [];
    hulls.forEach((hull, i) => {
      const s = place(w, `s${i}`, i * 3000, 0, hull);
      for (let k = 0; k < 3; k += 1) w.applyCard(s, 'hullRepair');
      for (let k = 0; k < CATALOG.reload.cap; k += 1) w.applyCard(s, 'reload'); // RELOAD never touches it
      s.hp = s.stats.maxHp / 2;
      s.lastDamagedAt = w.now;
      const before = s.hp;
      press(w, s, abilityCode('repair'));
      const per = CONFIG.hullRepair.hpPerCard * 3;
      expect(s.hp).toBe(before + CONFIG.hullRepair.instantHp + per);
      expect(s.repairHp).toBe(CONFIG.hullRepair.regenHp + per);
      waits.push(s.repairReadyAt - w.now);
    });
    const law = CONFIG.hullRepair.cooldownMs * reloadCooldownScale(CONFIG.index.base + 3 * CONFIG.hullRepair.reloadPerCard);
    expect(waits[0]).toBe(waits[1]);
    expect(waits[0]).toBeCloseTo(law, 6);
  });

  it('the pool pays out over the FIXED window whatever the card count (R15)', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    for (let k = 0; k < 5; k += 1) w.applyCard(a, 'hullRepair');
    a.hp = 1;
    a.lastDamagedAt = w.now + 1e9; // keep the passive regen out
    press(w, a, abilityCode('repair'));
    const pool = a.repairHp;
    expect(pool).toBeGreaterThan(0);
    for (let i = 0; i < CONFIG.hullRepair.regenMs / DT - 1; i += 1) w.step();
    expect(a.repairHp).toBeGreaterThan(0);
    w.step();
    expect(a.repairHp).toBeCloseTo(0, 6);
  });

  it.each([0, 2, 5])('SMOKE at %i cards: the cloud is STAMPED with the owner\'s life and disc; the cooldown is the law', (cards) => {
    const w = bareWorld();
    const a = place(w, 'a');
    for (let k = 0; k < cards; k += 1) w.applyCard(a, 'smokeScreen');
    press(w, a, abilityCode('smoke'));
    const [cloud] = [...w.clouds.values()];
    const scale = smokeSizeScale(cards);
    expect(cloud.lifeMs).toBe(CONFIG.countermeasure.lifeMs + cards * CONFIG.countermeasure.lifeMsPerCard);
    expect(cloud.r0).toBeCloseTo(CONFIG.countermeasure.r0 * scale, 9);
    expect(cloud.r1).toBeCloseTo(CONFIG.countermeasure.r1 * scale, 9);
    expect(cloud.until).toBe(cloud.bornAt + cloud.lifeMs);
    const law = CONFIG.countermeasure.cooldownMs * reloadCooldownScale(CONFIG.index.base + cards * CONFIG.countermeasure.reloadPerCard);
    expect(a.smokeReadyAt - cloud.bornAt).toBeCloseTo(law, 6);
  });

  it('the anchor: at TWO cards the stamped disc is exactly the CONFIG disc', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    for (let k = 0; k < CONFIG.countermeasure.sizeAnchorCards; k += 1) w.applyCard(a, 'smokeScreen');
    press(w, a, abilityCode('smoke'));
    const [cloud] = [...w.clouds.values()];
    expect(cloud.r0).toBe(CONFIG.countermeasure.r0);
    expect(cloud.r1).toBe(CONFIG.countermeasure.r1);
  });

  it('a SMOKE SCREEN card taken after the press never changes the live cloud', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    press(w, a, abilityCode('smoke'));
    const [cloud] = [...w.clouds.values()];
    const before = { ...cloud };
    w.applyCard(a, 'smokeScreen');
    w.step();
    const live = w.clouds.get(cloud.id)!;
    expect(live).toEqual(before);
    expect(buildFrame(w, 'a').clouds![0]).toMatchObject({ lifeMs: before.lifeMs, r0: before.r0, r1: before.r1 });
  });
});

