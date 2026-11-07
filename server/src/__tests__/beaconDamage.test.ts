// THE RADIO BEACONS — a solid, shootable, rammable body (Story 10.8, Eric
// rulings R5–R8, R11–R13, 2026-11-06, epic-10 amendment 14).
//
// The contract, pinned as mechanism (every number is read off CONFIG and the
// shared functions):
//   * THE DOOR. `World.damageBeacon` is the one way a beacon loses hp, and it
//     applies THE SAME ARMOR GATE a ship takes: a beacon loses exactly what a
//     hull whose ARMOR is `CONFIG.beacons.armor` loses to the same blow from
//     the same attacker, for every damage source.
//   * EVERY WEAPON REACHES IT while it is afloat — main battery, secondaries,
//     each torpedo (a homing fish may lock it), a mine's blast (a mine never
//     TRIPS on it), the special shells, the phosphor burn, a ram — credited
//     to the shooter's damage total, with the shooter's ordinary hit call and
//     no `dmg` row, and its id never rides a boom.
//   * NOT AFLOAT, NOTHING: charted it is not there at all (not solid, not a
//     target); sinking it is solid to hulls and takes no damage.
//   * AT 0 HP IT SINKS EARLY: the public sink time is stamped, it leaves the
//     target lists at once, and its kill value is split by the ship-kill law
//     among its damagers — with no `sunk` row, no kill count, no bounty.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  beaconStateAt,
  damageMultiplierFor,
  type GameEvent,
  type ShellState,
  type Vec2,
} from '@salvo/shared';
import { World, type DamageSource, type ShipRecord } from '../game/world.js';
import type { BeaconRecord } from '../game/beacons.js';
import { B, DT, SINK_MS, SURFACE_MS, bareWorld, captain, inp, run, seatBeacon, xpMsOf } from './beaconFixture.js';

/** The port beam of a heading-0 hull at the origin: where the cases seat the beacon. */
const BEAM = Math.PI / 2;
const D = 300;
const AT: Vec2 = { x: 0, y: D };
/** Ticks for any turret or launcher to traverse any legal arc, plus one. */
const SETTLE = Math.ceil(360 / ((CONFIG.mainBattery.traverseDegPerS * DT) / 1000)) + 1;
/** ms into the cycle the afloat cases start at (just surfaced: a full float minute ahead). */
const AFLOAT = SURFACE_MS + DT;

interface DoorCall {
  amount: number;
  src: DamageSource;
  byId: string | undefined;
  /** What the door answered: the beacon was afloat and the blow resolved on it. */
  took: boolean;
}

/** Record every call through the beacon door (the real door still runs). */
function tap(w: World): DoorCall[] {
  const calls: DoorCall[] = [];
  const real = w.damageBeacon.bind(w);
  w.damageBeacon = (id, amount, src, byId) => {
    const took = real(id, amount, src, byId);
    calls.push({ amount, src, byId, took });
    return took;
  };
  return calls;
}

/** THE GATE, re-derived: `amount` × the one curve at E = beacon ARMOR − the
 *  attacker's POWER; a whole blow floored with a floor of one, a burn / grind
 *  fraction kept exact. */
function gated(amount: number, src: DamageSource, power: number): number {
  const scaled = amount * damageMultiplierFor(B.armor - power);
  if (src === 'burn' || src === 'grind') return scaled;
  return amount > 0 ? Math.max(1, Math.floor(scaled)) : 0;
}

/** What the recorded calls should have cost the beacon, from `by`'s POWER. */
const expectedLoss = (calls: readonly DoorCall[], by: ShipRecord): number =>
  calls.filter((c) => c.took).reduce((sum, c) => sum + gated(c.amount, c.src, by.stats.power), 0);

/** Train on (aim, dist), click `slot` once, and step until every shell the
 *  hull launched has resolved. Returns the events and the shells as launched. */
function fireAt(w: World, id: string, slot: number, aim = BEAM, dist = D): { log: GameEvent[]; shells: ShellState[] } {
  w.submitInput(id, inp(1, { aim, aimDist: dist, slot }));
  run(w, SETTLE);
  w.submitInput(id, inp(2, { aim, aimDist: dist, slot, fireSeq: 1 }));
  const log: GameEvent[] = [];
  const seen = new Map<string, ShellState>();
  for (let i = 0; i < 600; i += 1) {
    w.step();
    log.push(...w.tickEvents);
    const mine = [...w.shells.values()].filter((s) => s.ownerId === id);
    for (const s of mine) if (!seen.has(s.id)) seen.set(s.id, { ...s });
    if (seen.size > 0 && mine.length === 0) return { log, shells: [...seen.values()] };
  }
  throw new Error(`slot ${slot} never fired, or its shot never resolved`);
}

/** Fit `line` through the real pick path and return the slot it landed in. */
function fit(w: World, rec: ShipRecord, line: string, copies = 1): number {
  for (let i = 0; i < copies; i += 1) w.applyCard(rec, line);
  const slot = rec.loadout.findIndex((s) => s.equipmentId === line);
  expect(slot, line).toBeGreaterThanOrEqual(0);
  return slot;
}

/** A shooter at the origin and one afloat beacon on its port beam. */
function range(seed: number, into = AFLOAT): { w: World; a: ShipRecord; beacon: BeaconRecord; calls: DoorCall[] } {
  const w = bareWorld(seed);
  const a = captain(w, 'a', 0, 0);
  const beacon = seatBeacon(w, into, AT);
  return { w, a, beacon, calls: tap(w) };
}

const kinds = (log: readonly GameEvent[], k: string): GameEvent[] => log.filter((e) => e.k === k);

// ---------------------------------------------------------------------------
// THE DOOR
// ---------------------------------------------------------------------------

describe('damageBeacon — the same ARMOR gate a ship takes (R8)', () => {
  const SOURCES: DamageSource[] = ['shell', 'burst', 'torpedo', 'mine', 'contact', 'burn', 'grind'];

  it('for every source, a beacon loses exactly what a hull of the beacon\'s ARMOR loses to the same blow from the same attacker', () => {
    const w = bareWorld(6000);
    const plain = captain(w, 'plain', 0, 0);
    const sharp = captain(w, 'sharp', 0, 200);
    w.applyCard(sharp, 'power'); // an attacker whose POWER is off the average
    expect(sharp.stats.power).not.toBe(plain.stats.power);
    const twin = captain(w, 'twin', 0, 400);
    twin.stats = { ...twin.stats, armor: B.armor };
    const beacon = seatBeacon(w, AFLOAT, { x: 600, y: 0 });
    const applyDamage = (w as unknown as { applyDamage(v: ShipRecord, n: number, s: DamageSource, by: string | undefined): void }).applyDamage.bind(w);
    for (const by of [plain.id, sharp.id, undefined]) {
      for (const src of SOURCES) {
        for (const amount of [1, 7, 18.5, 0.37]) {
          twin.hp = twin.stats.maxHp;
          beacon.hp = B.hp;
          applyDamage(twin, amount, src, by);
          expect(w.damageBeacon(beacon.id, amount, src, by)).toBe(true);
          expect(B.hp - beacon.hp, `${src} ${amount} by ${by}`).toBe(twin.stats.maxHp - twin.hp);
        }
      }
    }
  });

  it('the shooter\'s damage total counts it, the beacon\'s own ledger notes it, and no hull\'s ledger does — no `dmg`, no aggro', () => {
    const { w, a, beacon } = range(6001);
    const other = captain(w, 'other', 0, -400);
    w.step();
    const before = a.damageDealt;
    w.damageBeacon(beacon.id, 40, 'shell', 'a');
    expect(a.damageDealt - before).toBe(gated(40, 'shell', a.stats.power));
    expect(beacon.damageFrom.get('a')?.amount).toBe(B.hp - beacon.hp);
    expect(other.damageFrom.size).toBe(0);
    expect(a.damageFrom.size).toBe(0);
    w.step();
    expect(kinds(w.tickEvents, 'dmg')).toEqual([]);
  });

  it('refuses an unknown id, a non-blow, and a weapons-safe room (resolved, no hp)', () => {
    const { w, beacon } = range(6002);
    expect(w.damageBeacon('bcn-9-9', 10, 'shell', 'a')).toBe(false);
    expect(w.damageBeacon(beacon.id, 0, 'shell', 'a')).toBe(true);
    expect(w.damageBeacon(beacon.id, Number.NaN, 'shell', 'a')).toBe(true);
    w.damageEnabled = false;
    expect(w.damageBeacon(beacon.id, 10, 'shell', 'a')).toBe(true);
    expect(beacon.hp).toBe(B.hp);
  });
});

// ---------------------------------------------------------------------------
// EVERY WEAPON, AFLOAT
// ---------------------------------------------------------------------------

describe('every weapon damages an AFLOAT beacon through the door (R8, R12)', () => {
  /** The shared assertions of one weapon case. */
  function expectStruck(c: { a: ShipRecord; beacon: BeaconRecord; calls: DoorCall[] }, log: readonly GameEvent[], srcs: DamageSource[]): void {
    const took = c.calls.filter((x) => x.took);
    expect(took.length).toBeGreaterThan(0);
    for (const call of took) {
      expect(srcs).toContain(call.src);
      expect(call.byId).toBe('a');
    }
    const loss = expectedLoss(c.calls, c.a);
    expect(loss).toBeGreaterThan(0);
    expect(B.hp - c.beacon.hp).toBeCloseTo(loss, 9);
    expect(c.a.damageDealt).toBeCloseTo(loss, 9); // credited to the shooter's total (R12)
    // The shooter's ordinary hit call; no victim row; the beacon's id on no event.
    expect(kinds(log, 'hc').length).toBeGreaterThan(0);
    for (const e of kinds(log, 'hc')) expect((e as { id: string }).id).toBe('a');
    expect(kinds(log, 'dmg')).toEqual([]);
    expect(JSON.stringify(log)).not.toContain(c.beacon.id);
  }

  it('MAIN BATTERY: a salvo on the beacon', () => {
    const c = range(6100);
    const { log, shells } = fireAt(c.w, 'a', 0);
    expect(shells.every((s) => s.family === 'cannon')).toBe(true);
    expectStruck(c, log, ['burst', 'shell']);
  });

  it('SECONDARIES: the held stream', () => {
    const c = range(6101);
    const log: GameEvent[] = [];
    c.w.submitInput('a', inp(1, { aim: BEAM, aimDist: D, sec: true }));
    for (let i = 0; i < 30; i += 1) {
      c.w.step();
      log.push(...c.w.tickEvents);
    }
    c.w.submitInput('a', inp(2, { aim: BEAM, aimDist: D, sec: false }));
    for (let i = 0; i < 30; i += 1) {
      c.w.step();
      log.push(...c.w.tickEvents);
    }
    expectStruck(c, log, ['shell']);
  });

  for (const line of ['lightTorpedo', 'heavyTorpedo', 'supercavTorpedo'] as const) {
    it(`TORPEDO (${line}): the fish stops on the beacon for its contact damage`, () => {
      const c = range(6110 + line.length);
      const { log, shells } = fireAt(c.w, 'a', fit(c.w, c.a, line));
      expect(shells).toHaveLength(1);
      expect(shells[0].kind).toBe('torp');
      expectStruck(c, log, ['torpedo']);
      expect(c.calls.map((x) => x.amount)).toEqual([shells[0].contactDamage]);
    });
  }

  it('a HOMING torpedo may LOCK a beacon (R12): aimed to pass it by, it turns in and strikes', () => {
    const c = range(6120);
    const slot = fit(c.w, c.a, 'lightTorpedo', 5); // the top rung: the line's strongest homing
    expect(c.a.stats.equipment.lightTorpedo.homingTurnRate).toBeGreaterThan(0);
    // Aim at a point beside the beacon: a straight runner would pass clear of the body.
    const aside = 40;
    const aim = Math.atan2(D, aside);
    const locked: (string | undefined)[] = [];
    c.w.submitInput('a', inp(1, { aim, aimDist: D, slot }));
    run(c.w, SETTLE);
    c.w.submitInput('a', inp(2, { aim, aimDist: D, slot, fireSeq: 1 }));
    let launched: ShellState | undefined;
    for (let i = 0; i < 600 && (launched === undefined || c.w.shells.size > 0); i += 1) {
      c.w.step();
      for (const s of c.w.shells.values()) {
        launched ??= { ...s };
        locked.push(s.homing?.targetId);
      }
    }
    expect(launched).toBeDefined();
    expect(aside).toBeGreaterThan(B.bodyRadiusU + launched!.hitRadius); // the straight run misses
    expect(locked).toContain(c.beacon.id);
    expect(c.calls.filter((x) => x.took).map((x) => x.src)).toEqual(['torpedo']);
    expect(c.beacon.hp).toBeLessThan(B.hp);
  });

  it('a MINE never TRIPS on a beacon, and its BLAST damages one (R12)', () => {
    const c = range(6130);
    const mine = { id: 'm1', ownerId: 'a', x: AT.x + 20, y: AT.y, armedAt: 0, kind: 'naval' as const, hp: CONFIG.mine.hp };
    expect(20).toBeLessThan(c.a.stats.equipment.navalMines.triggerRadius); // the beacon is inside the trip ring
    c.w.mines.set(mine.id, mine);
    run(c.w, 20);
    expect(c.w.mines.has('m1')).toBe(true);
    expect(c.beacon.hp).toBe(B.hp);
    // A hull trips it; the blast covers the beacon too.
    const v = captain(c.w, 'v', AT.x + 20, AT.y - 30);
    const log: GameEvent[] = [];
    for (let i = 0; i < 3; i += 1) {
      c.w.step();
      log.push(...c.w.tickEvents);
    }
    expect(c.w.mines.has('m1')).toBe(false);
    expect(v.hp).toBeLessThan(v.stats.maxHp);
    expect(c.calls.filter((x) => x.took)).toEqual([{ amount: c.a.stats.equipment.navalMines.damage, src: 'mine', byId: 'a', took: true }]);
    expect(B.hp - c.beacon.hp).toBe(expectedLoss(c.calls, c.a));
    expect(JSON.stringify(log)).not.toContain(c.beacon.id);
  });

  it('SPECIAL SHELLS: a star shell\'s burst damages it', () => {
    const c = range(6140);
    const { log } = fireAt(c.w, 'a', fit(c.w, c.a, 'starShells'));
    expectStruck(c, log, ['burst', 'shell']);
  });

  it('SPECIAL SHELLS: a phosphor shell burns it — the zone\'s dps every tick its centre is inside', () => {
    const c = range(6141);
    const { log } = fireAt(c.w, 'a', fit(c.w, c.a, 'phosphorShells'));
    for (let i = 0; i < 40; i += 1) {
      c.w.step();
      log.push(...c.w.tickEvents);
    }
    const burns = c.calls.filter((x) => x.src === 'burn');
    expect(burns.length).toBeGreaterThan(10);
    const zone = [...c.w.burnZones.values()][0];
    expect(zone).toBeDefined();
    for (const call of burns) {
      expect(call.amount).toBeCloseTo((zone.dps * DT) / 1000, 9);
      expect(call.byId).toBe('a');
    }
    expect(B.hp - c.beacon.hp).toBeCloseTo(expectedLoss(c.calls, c.a), 6);
    expect(c.a.damageDealt).toBeCloseTo(expectedLoss(c.calls, c.a), 6);
    expect(kinds(log, 'dmg')).toEqual([]);
  });

  for (const line of ['dazzleShells', 'foulingShell'] as const) {
    it(`a NON-DAMAGING shell (${line}) just bursts on it: no hp lost, nothing thrown`, () => {
      const c = range(6150 + line.length);
      const { log } = fireAt(c.w, 'a', fit(c.w, c.a, line));
      run(c.w, 10); // a foul zone over a beacon stamps nothing (it has no engines)
      expect(kinds(log, 'burst').length + kinds(log, 'boom').length).toBeGreaterThan(0);
      expect(c.beacon.hp).toBe(B.hp);
    });
  }

  it('a RAM: the beacon is immovable, both take damage by the ramming law, and the hull\'s share has no attacker (R7)', () => {
    const w = bareWorld(6160);
    const beacon = seatBeacon(w, AFLOAT, AT);
    const calls = tap(w);
    const r = captain(w, 'r', AT.x - 90, AT.y, 0); // bow toward the beacon
    r.state.speed = 30;
    expect(r.state.speed).toBeGreaterThan(CONFIG.ram.allowanceU);
    const log: GameEvent[] = [];
    w.submitInput('r', inp(1, { throttle: 1 }));
    for (let i = 0; i < 60; i += 1) {
      w.step();
      log.push(...w.tickEvents);
    }
    // Immovable and solid: the beacon is where it was and the hull did not pass.
    expect([beacon.x, beacon.y]).toEqual([AT.x, AT.y]);
    expect(r.state.x).toBeLessThan(AT.x);
    // The beacon's share, credited to the rammer; the strike first, then the bleed.
    const took = calls.filter((x) => x.took);
    expect(took[0].src).toBe('contact');
    expect(took.every((x) => x.byId === 'r')).toBe(true);
    expect(took.some((x) => x.src === 'grind')).toBe(true);
    expect(B.hp - beacon.hp).toBeCloseTo(expectedLoss(calls, r), 6);
    expect(r.damageDealt).toBeCloseTo(expectedLoss(calls, r), 6);
    // The hull's share: real hp, from contact, credited to nobody.
    expect(r.hp).toBeLessThan(r.stats.maxHp);
    expect(['contact', 'grind']).toContain(r.lastDamageSrc);
    expect(r.lastContactWasLand).toBe(false);
    expect(r.damageFrom.size).toBe(0);
    expect(JSON.stringify(log)).not.toContain(beacon.id);
  });

  it('a hull SUNK on a beacon has no killer', () => {
    const w = bareWorld(6161);
    seatBeacon(w, AFLOAT, AT);
    const r = captain(w, 'r', AT.x - 90, AT.y, 0);
    const bystander = captain(w, 'by', 0, -600);
    r.hp = 1;
    r.state.speed = 30;
    const log: GameEvent[] = [];
    for (let i = 0; i < 40; i += 1) {
      w.step();
      log.push(...w.tickEvents);
    }
    const sunk = kinds(log, 'sunk');
    expect(sunk).toHaveLength(1);
    expect(sunk[0]).toMatchObject({ k: 'sunk', id: 'r' });
    expect((sunk[0] as { by?: string }).by).toBeUndefined();
    expect(bystander.kills).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// NOT AFLOAT, NOTHING
// ---------------------------------------------------------------------------

describe('before it surfaces and once its sink has started, nothing damages it (R6)', () => {
  const SOURCES: DamageSource[] = ['shell', 'burst', 'torpedo', 'mine', 'contact', 'burn', 'grind'];

  it('CHARTED: not a target, not solid — the door refuses every source, a torpedo and a hull pass through the spot, a mine blast and a burn zone do nothing', () => {
    const { w, a, beacon, calls } = range(6200, DT); // one tick into the cycle
    for (const src of SOURCES) expect(w.damageBeacon(beacon.id, 50, src, 'a')).toBe(false);
    expect(w.hitTargets(['beacon'])).toEqual([]);
    calls.length = 0;
    // A torpedo straight at it runs on past.
    const slot = fit(w, a, 'heavyTorpedo');
    w.submitInput('a', inp(1, { aim: BEAM, aimDist: D, slot }));
    run(w, SETTLE);
    w.submitInput('a', inp(2, { aim: BEAM, aimDist: D, slot, fireSeq: 1 }));
    let farthest = 0;
    for (let i = 0; i < 160; i += 1) {
      w.step();
      for (const s of w.shells.values()) farthest = Math.max(farthest, s.y);
    }
    expect(farthest).toBeGreaterThan(AT.y + 4 * B.bodyRadiusU);
    // A burning zone and a mine blast over it.
    w.burnZones.set('z', { id: 'z', ownerId: 'a', x: AT.x, y: AT.y, r: 100, until: w.now + 60_000, dps: 40 });
    w.mines.set('m1', { id: 'm1', ownerId: 'a', x: AT.x + 20, y: AT.y, armedAt: 0, kind: 'naval', hp: CONFIG.mine.hp });
    captain(w, 'v', AT.x + 20, AT.y - 30);
    run(w, 5);
    expect(w.mines.has('m1')).toBe(false);
    // A hull sails across the spot.
    const r = captain(w, 'r', AT.x - 90, AT.y + 0, 0);
    r.state.speed = 30;
    w.submitInput('r', inp(1, { throttle: 1 }));
    run(w, 120);
    expect(r.state.x).toBeGreaterThan(AT.x + 40);
    expect(calls.filter((x) => x.took)).toEqual([]);
    expect(beacon.hp).toBe(B.hp);
    expect(w.beacons.phaseOf(beacon, w.now)).toBe('charted');
  });

  it('SINKING: solid to hulls (the wreck law) and untouchable — the door refuses every source, a ram stops the hull and costs the beacon nothing', () => {
    const { w, a, beacon, calls } = range(6201, SINK_MS + DT);
    expect(w.beacons.phaseOf(beacon, w.now)).toBe('sinking');
    for (const src of SOURCES) expect(w.damageBeacon(beacon.id, 50, src, 'a')).toBe(false);
    expect(w.hitTargets(['beacon'])).toEqual([]);
    calls.length = 0;
    w.burnZones.set('z', { id: 'z', ownerId: 'a', x: AT.x, y: AT.y, r: 100, until: w.now + 60_000, dps: 40 });
    const r = captain(w, 'r', AT.x - 90, AT.y, 0);
    r.state.speed = 30;
    w.submitInput('r', inp(1, { throttle: 1 }));
    run(w, 60);
    expect(r.state.x).toBeLessThan(AT.x); // still solid
    expect(r.hp).toBeLessThan(r.stats.maxHp); // and the hull still pays its share
    expect(calls.filter((x) => x.took)).toEqual([]);
    expect(beacon.hp).toBe(B.hp);
    expect(r.damageDealt).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// DESTROYED AFLOAT
// ---------------------------------------------------------------------------

describe('at 0 hp the sink starts at once (R6, R9, R13)', () => {
  it('stamps the public sink time, leaves the target lists that instant, and later blows that tick do nothing', () => {
    const { w, beacon } = range(6300);
    w.step();
    beacon.hp = 5;
    expect(w.hitTargets(['hull', 'beacon']).some((t) => t.id === beacon.id)).toBe(true);
    expect(w.damageBeacon(beacon.id, 50, 'shell', 'a')).toBe(true);
    expect(beacon.sinkT).toBe(w.now);
    expect(w.beaconChart.beacons[0].sinkT).toBe(w.now);
    expect(w.hitTargets(['hull', 'beacon']).some((t) => t.id === beacon.id)).toBe(false);
    expect(w.damageBeacon(beacon.id, 50, 'shell', 'a')).toBe(false);
    // The shared model reads the stamp: sinking now, gone one sink later.
    expect(beaconStateAt(w.now, w.beaconChart.cycleStartT, beacon.sinkT).phase).toBe('sinking');
    expect(beaconStateAt(w.now + B.sinkMs, w.beaconChart.cycleStartT, beacon.sinkT).phase).toBe('gone');
  });

  it('a later shell of the same salvo passes through: only the shells up to the killing one are spent on it', () => {
    const c = range(6301);
    c.beacon.hp = 1;
    fireAt(c.w, 'a', 0);
    expect(c.beacon.sinkT).toBeGreaterThan(0);
    expect(c.calls.filter((x) => x.took)).toHaveLength(1);
    expect(c.beacon.hp).toBe(0);
  });

  it('pays the beacon kill value by the ship-kill split — the killer\'s share, the rest by damage among its damagers — and nothing else a ship kill does', () => {
    const { w, a, beacon } = range(6302);
    const b = captain(w, 'b', 0, -400);
    const idle = captain(w, 'idle', 0, 800);
    w.step();
    const start = { a: xpMsOf(a), b: xpMsOf(b), idle: xpMsOf(idle) };
    // Two damagers at ×1 (neutral POWER against the beacon's ARMOR): a wears it down, b finishes it.
    const aDealt = B.hp * 0.75;
    w.damageBeacon(beacon.id, aDealt, 'shell', 'a');
    w.damageBeacon(beacon.id, B.hp, 'shell', 'b'); // overkill: only what was left counts
    expect(beacon.hp).toBe(0);
    const bDealt = B.hp - aDealt;
    const pot = B.killLevels * CONFIG.xp.levelMs;
    const share = CONFIG.xp.killerShare;
    const gain = { a: xpMsOf(a) - start.a, b: xpMsOf(b) - start.b };
    expect(gain.a).toBeCloseTo((pot * (1 - share) * aDealt) / B.hp, -1);
    expect(gain.b).toBeCloseTo(pot * share + (pot * (1 - share) * bDealt) / B.hp, -1);
    expect(gain.a + gain.b).toBeCloseTo(pot, -1); // the whole value, to its damagers alone
    expect(xpMsOf(idle)).toBe(start.idle);
    // Not a kill: no tally, no bounty, no `sunk` row, no feed line.
    expect([a.kills, b.kills]).toEqual([0, 0]);
    expect(w.bountyId).toBe('');
    w.step();
    expect(kinds(w.tickEvents, 'sunk')).toEqual([]);
    expect(JSON.stringify(w.tickEvents)).not.toContain(beacon.id);
    expect(beacon.damageFrom.size).toBe(0);
  });

  it('SMOKE AND FIRE (R11): a hurt beacon puffs the anonymous `sm` row at the ship bands while AFLOAT, none once sinking (a hull emits only afloat) — a whole one never does', () => {
    const { w, beacon } = range(6303);
    const bands = CONFIG.damageBands;
    const puffsAt = (n: number): GameEvent[] => {
      const out: GameEvent[] = [];
      for (let i = 0; i < n; i += 1) {
        w.step();
        out.push(...kinds(w.tickEvents, 'sm'));
      }
      return out;
    };
    const window = Math.ceil(CONFIG.smoke.puffIntervalMs / DT) + 1;
    expect(puffsAt(window)).toEqual([]);
    beacon.hp = B.hp * bands.amberBelow - 1;
    const hurt = puffsAt(window);
    expect(hurt.length).toBeGreaterThan(0);
    for (const e of hurt) expect(e).toEqual({ k: 'sm', x: beacon.x, y: beacon.y, tier: 1 });
    beacon.hp = B.hp * bands.criticalBelow - 1;
    expect(puffsAt(window).every((e) => (e as { tier: number }).tier === 2)).toBe(true);
    // Destroyed: the sink minute starts at once, and a sinking beacon — like
    // a sinking hull — emits nothing.
    w.damageBeacon(beacon.id, B.hp, 'shell', undefined);
    expect(puffsAt(window)).toEqual([]);
    run(w, B.sinkMs / DT);
    expect(puffsAt(window)).toEqual([]);
  });
});
