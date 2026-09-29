// THE MACHINE GUN'S HELD-FIRE STREAM (Story 8.15, Eric rulings 2026-09-28,
// epic-8 amendments 103, 104 and 106) — the I/O matrix's stream rows, driven
// end to end through World.step(): `InputMsg.held` (a LEVEL off the latest
// input) -> streamControl -> the magazine row -> direct shells at `now`.
//
// What this file pins:
//   * the cadence: held for 3 s = 6 shells, 500 ms apart, each born at `now`
//     (no fireT, no back-date, no pre-step), each with its OWN `mz`, no
//     `burst` ever, an `sp` per shell that reaches the water, magazine 16 -> 10;
//   * a tap (one held:true sample) fires exactly one shell; release stops it;
//   * a click edge (`fireSeq`) on a mounted machine gun fires NOTHING and
//     denies nothing;
//   * the MAGAZINE MODEL: empty -> the full 15 s swap -> 16; 5 s idle with
//     shells left starts a swap; a shot cancels a running partial swap; every
//     swap takes the full reloadMs whatever was left;
//   * the gates: frozen (boarding), dead (foundered) and sinking (LIVE);
//   * a direct hit deals the full damage as a CONTACT hit (no burst).
// The 20-bot `mz` measurement is wave 4's (the harness `--gun` arm).

import { describe, it, expect } from 'vitest';
import { CONFIG, isAfloat, isSinking, type GameEvent, type InputMsg } from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { flatRaster } from './islandFixture.js';

const DT = CONFIG.tick.simDtMs;
const MG = CONFIG.machineGun;
const SLOT_GUN = 0;

function bareWorld(seed = 15): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  w.map.heightRaster = flatRaster();
  return w;
}

/** A machine-gun captain parked at (x, y), bow along +x. */
function gunner(w: World, id: string, x = 0, y = 0, heading = 0): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), 'captain', 'torpedoBoat', undefined, undefined, 'machineGun');
  rec.state = { x, y, heading, speed: 0 };
  return rec;
}

function makeInput(patch: Partial<InputMsg>): InputMsg {
  return { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 0, aimDist: 400, slot: SLOT_GUN, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0, held: false, ...patch };
}

/** Drive `ticks` ticks with the given level, collecting every tick's events. */
function hold(w: World, id: string, held: boolean, ticks: number, seqFrom: number, log: GameEvent[]): number {
  let seq = seqFrom;
  for (let i = 0; i < ticks; i++) {
    seq += 1;
    w.submitInput(id, makeInput({ seq, held }));
    w.step();
    log.push(...w.tickEvents);
  }
  return seq;
}

const kindCount = (log: readonly GameEvent[], k: string): number => log.filter((e) => e.k === k).length;
const mag = (a: ShipRecord) => a.loadout[SLOT_GUN].state!;

// ---------- the stream --------------------------------------------------------

describe('the stream — one direct shell per rateMs while held (amendment 103)', () => {
  it('mounts the machineGun module in slot 0 with a full 16-shell magazine', () => {
    const w = bareWorld();
    const a = gunner(w, 'a');
    expect(a.loadout[SLOT_GUN].equipmentId).toBe('machineGun');
    expect(mag(a)).toEqual({ n: MG.maxAmmo, reloadMsLeft: 0 });
    expect(MG.maxAmmo).toBe(16);
    expect(a.stats.equipment.machineGun.rangeU).toBe(a.stats.radarRange); // 660 u, the radar rung
  });

  it('held for 3 s: 6 shells at t = 0, 0.5, 1.0 … each born at `now`, 6 `mz`, NO burst, magazine 16 -> 10', () => {
    const w = bareWorld();
    const a = gunner(w, 'a');
    const log: GameEvent[] = [];
    const births: number[] = [];
    let seq = 0;
    for (let i = 0; i < 60; i++) {
      // 3 s = 60 ticks
      seq = hold(w, 'a', true, 1, seq, log);
      for (const s of w.shells.values()) if (!births.includes(s.bornAt)) births.push(s.bornAt);
    }
    expect(kindCount(log, 'shell')).toBe(6);
    expect(kindCount(log, 'mz')).toBe(6); // one flash PER shell (amendment 89(i))
    expect(kindCount(log, 'burst')).toBe(0); // a direct shell never bursts
    expect(mag(a).n).toBe(10);
    expect(mag(a).reloadMsLeft).toBe(0); // no swap yet: shells left, not idle
    // Cadence: exactly rateMs apart, from the first held tick.
    births.sort((p, q) => p - q);
    expect(births).toHaveLength(6);
    for (let i = 1; i < births.length; i++) expect(births[i] - births[i - 1]).toBe(MG.rateMs);
    // Each shell was born at the tick it spawned in — never back-dated — and
    // reveals to its owner as an `mg` shell.
    for (const e of log) if (e.k === 'shell') expect(e.w).toBe('mg');
    expect(a.lastFireT).toBe(0); // the stream never touches the click channel's clock
  });

  it('every shell that reaches the water expires with the shooter-private `sp` and NO burst', () => {
    const w = bareWorld();
    gunner(w, 'a');
    const log: GameEvent[] = [];
    hold(w, 'a', true, 10, 0, log); // 0.5 s held: one shell...
    hold(w, 'a', false, 40, 10, log); // ...then released while it flies its 400 u (0.8 s)
    expect(kindCount(log, 'shell')).toBe(1);
    expect(kindCount(log, 'sp')).toBe(1);
    expect(kindCount(log, 'burst')).toBe(0);
    expect(kindCount(log, 'hc')).toBe(0);
    const boom = log.find((e) => e.k === 'boom');
    expect(boom).toBeDefined();
    expect((boom as { x: number }).x).toBeCloseTo(400, 3); // expired AT the aim point
  });

  it('a TAP — one held:true sample — fires exactly one shell; release stops the stream', () => {
    const w = bareWorld();
    const a = gunner(w, 'a');
    const log: GameEvent[] = [];
    let seq = hold(w, 'a', true, 1, 0, log);
    seq = hold(w, 'a', false, 30, seq, log);
    expect(kindCount(log, 'shell')).toBe(1);
    expect(mag(a).n).toBe(MG.maxAmmo - 1);
    // Held again inside the cadence window: nothing until rateMs has passed.
    hold(w, 'a', true, 1, seq, log);
    expect(kindCount(log, 'shell')).toBe(2); // 1.5 s later — well past 500 ms
  });

  it('a CLICK EDGE on a mounted machine gun fires nothing and denies nothing (the level alone fires)', () => {
    const w = bareWorld();
    const a = gunner(w, 'a');
    w.submitInput('a', makeInput({ seq: 1, fireSeq: 1, held: false }));
    w.step();
    expect(w.shells.size).toBe(0);
    expect(mag(a)).toEqual({ n: MG.maxAmmo, reloadMsLeft: 0 });
    expect(a.lastFireSeq).toBe(1); // consumed, then inert
    expect(a.lastFireT).toBe(0);
    expect(w.denialsFor('a')).toBeUndefined();
    // Even a directed activate() is a no-op: ok, no state change.
    expect(w.sinkingActivationGate(a, SLOT_GUN)).toEqual({ ok: true });
    expect(mag(a)).toEqual({ n: MG.maxAmmo, reloadMsLeft: 0 });
    expect(w.shells.size).toBe(0);
  });

  it('the level is read off the LATEST input, never the intent queue: two inputs in one tick, latest wins', () => {
    const w = bareWorld();
    const a = gunner(w, 'a');
    w.submitInput('a', makeInput({ seq: 1, held: true }));
    w.submitInput('a', makeInput({ seq: 2, held: false })); // coalesced into the same tick
    w.step();
    expect(w.shells.size).toBe(0);
    expect(mag(a).n).toBe(MG.maxAmmo);
    w.submitInput('a', makeInput({ seq: 3, held: false }));
    w.submitInput('a', makeInput({ seq: 4, held: true }));
    w.step();
    expect(w.shells.size).toBe(1);
  });

  it('a direct hit deals the FULL damage as a contact hit: 4 hp, one `hc`, no burst', () => {
    const w = bareWorld();
    const a = gunner(w, 'a');
    const b = w.addShip('b', 'B', 'captain', 'battleship', undefined, undefined);
    b.state = { x: 300, y: 0, heading: Math.PI / 2, speed: 0 }; // broadside-on at 300 u
    const log: GameEvent[] = [];
    hold(w, 'a', true, 1, 0, log);
    hold(w, 'a', false, 30, 1, log);
    expect(b.hp).toBe(b.stats.maxHp - MG.damage);
    expect(MG.damage).toBe(4);
    expect(kindCount(log, 'hc')).toBe(1);
    expect(kindCount(log, 'burst')).toBe(0);
    expect(kindCount(log, 'sp')).toBe(0);
    expect(a.damageDealt).toBe(4);
  });
});

// ---------- the magazine ------------------------------------------------------

describe('the magazine (amendment 103)', () => {
  it('empties in 16 shells; the 17th held tick sends nothing and no denial; the full 15 s swap then refills to 16', () => {
    const w = bareWorld();
    const a = gunner(w, 'a');
    const log: GameEvent[] = [];
    // 16 shells × 500 ms = 7.5 s from the first shot to the 16th; hold 8 s.
    let seq = hold(w, 'a', true, 160, 0, log);
    expect(kindCount(log, 'shell')).toBe(16);
    expect(mag(a).n).toBe(0);
    expect(w.denialsFor('a')).toBeUndefined();
    // The swap started the tick after the magazine emptied, at the FULL reloadMs.
    expect(mag(a).reloadMsLeft).toBeGreaterThan(0);
    expect(mag(a).reloadMsLeft).toBeLessThanOrEqual(MG.reloadMs);
    // Still held: nothing fires while the swap runs, and it completes at 15 s.
    const swapLeft = mag(a).reloadMsLeft;
    const ticksToDone = Math.ceil(swapLeft / DT);
    seq = hold(w, 'a', false, ticksToDone - 1, seq, log);
    expect(mag(a).n).toBe(0); // not yet
    hold(w, 'a', false, 1, seq, log);
    expect(mag(a)).toEqual({ n: MG.maxAmmo, reloadMsLeft: 0 }); // FULL, timer idle
    expect(kindCount(log, 'shell')).toBe(16); // nothing extra fired
    expect(MG.reloadMs).toBe(15000);
  });

  it('5 s idle with shells left starts the swap; a shot at 4.9 s idle cancels the pending start', () => {
    const w = bareWorld();
    const a = gunner(w, 'a');
    const log: GameEvent[] = [];
    let seq = hold(w, 'a', true, 1, 0, log); // one shell at t0
    expect(mag(a).n).toBe(15);
    // 4.9 s idle: no swap yet.
    seq = hold(w, 'a', false, 98, seq, log);
    expect(mag(a).reloadMsLeft).toBe(0);
    // A shot at 4.9 s restarts the idle clock.
    seq = hold(w, 'a', true, 1, seq, log);
    expect(mag(a).n).toBe(14);
    seq = hold(w, 'a', false, 98, seq, log); // 4.9 s again: still no swap
    expect(mag(a).reloadMsLeft).toBe(0);
    seq = hold(w, 'a', false, 2, seq, log); // crosses 5 s idle: the swap starts, full length
    expect(mag(a).reloadMsLeft).toBeGreaterThan(MG.reloadMs - 2 * DT);
    expect(mag(a).n).toBe(14); // shells left stay loaded while it runs
    // ...and completes to a FULL magazine after the whole 15 s.
    hold(w, 'a', false, Math.ceil(MG.reloadMs / DT), seq, log);
    expect(mag(a)).toEqual({ n: MG.maxAmmo, reloadMsLeft: 0 });
  });

  it('a shot during a running PARTIAL swap cancels it (the shells left fire), and the next swap is again the full 15 s', () => {
    const w = bareWorld();
    const a = gunner(w, 'a');
    const log: GameEvent[] = [];
    let seq = hold(w, 'a', true, 1, 0, log); // 15 left
    seq = hold(w, 'a', false, 100 + 40, seq, log); // 5 s idle -> swap starts; 2 s into it (9 s left of 15)
    expect(mag(a).reloadMsLeft).toBeGreaterThan(0);
    expect(mag(a).reloadMsLeft).toBeLessThan(MG.reloadMs);
    seq = hold(w, 'a', true, 1, seq, log); // a shot: the swap is CANCELLED
    expect(mag(a)).toEqual({ n: 14, reloadMsLeft: 0 });
    expect(kindCount(log, 'shell')).toBe(2);
    // The idle clock restarted from that shot: 4.9 s later still no swap...
    seq = hold(w, 'a', false, 98, seq, log);
    expect(mag(a).reloadMsLeft).toBe(0);
    // ...and when it starts it is the FULL reloadMs, not the 9 s that was left.
    seq = hold(w, 'a', false, 3, seq, log);
    expect(mag(a).reloadMsLeft).toBeGreaterThanOrEqual(MG.reloadMs - 3 * DT);
  });

  it('the ladder moves the magazine: tier II reads 18 shells / 5 damage, and a fresh pool is 18', () => {
    const w = bareWorld();
    const a = gunner(w, 'a');
    w.applyCard(a, 'machineGun');
    expect(a.stats.equipment.machineGun.maxAmmo).toBe(18);
    expect(a.stats.equipment.machineGun.damage).toBe(5);
    expect(a.stats.equipment.machineGun.reloadMs).toBeCloseTo(MG.reloadMs * 0.95, 6);
  });

  it('a tier grant on a FULL, idle magazine tops it up to the new cap: n 18, reloadMsLeft 0, and no swap starts', () => {
    const w = bareWorld();
    const a = gunner(w, 'a');
    const log: GameEvent[] = [];
    const idleTicks = MG.idleReloadMs / DT + 20; // well past the idle clock
    hold(w, 'a', false, idleTicks, 0, log);
    expect(mag(a)).toEqual({ n: MG.maxAmmo, reloadMsLeft: 0 });
    w.applyCard(a, 'machineGun');
    expect(mag(a)).toEqual({ n: 18, reloadMsLeft: 0 });
    hold(w, 'a', false, 40, idleTicks, log);
    expect(mag(a)).toEqual({ n: 18, reloadMsLeft: 0 });
  });

  it('a tier grant DURING an idle swap fills the magazine and the swap ends: no swap runs on a full magazine', () => {
    const w = bareWorld();
    const a = gunner(w, 'a');
    const log: GameEvent[] = [];
    let seq = hold(w, 'a', true, 1, 0, log); // one shot: 15 left
    seq = hold(w, 'a', false, MG.idleReloadMs / DT + 5, seq, log); // idle -> the swap is running
    expect(mag(a).n).toBe(MG.maxAmmo - 1);
    expect(mag(a).reloadMsLeft).toBeGreaterThan(0);
    w.applyCard(a, 'machineGun');
    expect(mag(a).n).toBe(18); // everything arrives loaded
    hold(w, 'a', false, 1, seq, log);
    expect(mag(a)).toEqual({ n: 18, reloadMsLeft: 0 });
  });
});

// ---------- the gates ---------------------------------------------------------

describe('the stream honours the click channel\'s gates', () => {
  it('FROZEN (weapons locked): a held level fires nothing, and the magazine is untouched', () => {
    const w = bareWorld();
    const a = gunner(w, 'a');
    w.weaponsEnabled = false;
    const log: GameEvent[] = [];
    hold(w, 'a', true, 20, 0, log);
    expect(kindCount(log, 'shell')).toBe(0);
    expect(mag(a).n).toBe(MG.maxAmmo);
  });

  it('SINKING stays live (amendment 10): the dying captain keeps streaming', () => {
    const w = bareWorld();
    const a = gunner(w, 'a');
    w.respawnEnabled = false;
    w.sinkShip('a');
    expect(isSinking(a.lifecycle)).toBe(true);
    const log: GameEvent[] = [];
    hold(w, 'a', true, 20, 0, log);
    expect(kindCount(log, 'shell')).toBe(2); // 1 s held = 2 shells
  });

  it('DEAD (foundered): nothing streams, however long the level is held', () => {
    const w = bareWorld();
    const a = gunner(w, 'a');
    w.respawnEnabled = false;
    w.sinkShip('a');
    w.step(CONFIG.ship.sinkingWindowMs);
    expect(isAfloat(a.lifecycle)).toBe(false);
    expect(isSinking(a.lifecycle)).toBe(false);
    const log: GameEvent[] = [];
    hold(w, 'a', true, 20, 0, log);
    expect(kindCount(log, 'shell')).toBe(0);
  });

  it('the level counts ONLY while the gun is the SELECTED slot: held with slot 2 selected streams nothing (a primed weapon\'s click is a hold too)', () => {
    const w = bareWorld();
    const a = gunner(w, 'a');
    w.applyCard(a, 'heavyTorpedo'); // slot 2 holds a weapon the click channel fires
    const log: GameEvent[] = [];
    for (let i = 1; i <= 20; i++) {
      w.submitInput('a', makeInput({ seq: i, held: true, slot: 2 })); // pointer down, torpedo slot selected
      w.step();
      log.push(...w.tickEvents);
    }
    expect(kindCount(log, 'shell')).toBe(0);
    expect(mag(a).n).toBe(MG.maxAmmo);
    // Back on slot 0 the same level streams at once.
    w.submitInput('a', makeInput({ seq: 21, held: true, slot: SLOT_GUN }));
    w.step();
    expect(w.tickEvents.filter((e) => e.k === 'shell')).toHaveLength(1);
  });

  it('a DROPPED seat mid-hold stops streaming (releaseHeld), and a reconnect with a fresh held:true resumes', () => {
    const w = bareWorld();
    const a = gunner(w, 'a');
    const log: GameEvent[] = [];
    let seq = hold(w, 'a', true, 1, 0, log); // streaming: one shell
    expect(kindCount(log, 'shell')).toBe(1);
    // The transport drops: no more inputs arrive; the room releases the level.
    w.releaseHeld('a');
    for (let i = 0; i < 40; i++) {
      w.step();
      log.push(...w.tickEvents);
    }
    expect(kindCount(log, 'shell')).toBe(1); // 2 s of grace: nothing more
    expect(mag(a).n).toBe(MG.maxAmmo - 1);
    // Throttle/rudder are untouched (the ghost keeps its helm) — only the level drops.
    expect(w.inputs.get('a')!.held).toBe(false);
    expect(w.inputs.get('a')!.seq).toBe(seq);
    // Resume: the reconnected client's fresh held:true streams again.
    seq = hold(w, 'a', true, 1, seq, log);
    expect(kindCount(log, 'shell')).toBe(2);
  });

  it('a CANNON seat ignores the level entirely: held:true on a deck gun fires nothing', () => {
    const w = bareWorld();
    const a = w.addShip('a', 'A', 'captain', 'torpedoBoat', undefined, undefined, 'deckGun');
    a.state = { x: 0, y: 0, heading: 0, speed: 0 };
    const log: GameEvent[] = [];
    hold(w, 'a', true, 20, 0, log);
    expect(kindCount(log, 'shell')).toBe(0);
    expect(a.loadout[SLOT_GUN].state).toEqual({ n: 1, reloadMsLeft: 0 });
  });
});
