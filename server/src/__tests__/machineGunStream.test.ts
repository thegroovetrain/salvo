// THE MACHINE GUN'S HELD-FIRE STREAM (Story 8.15, Eric rulings 2026-09-28,
// epic-8 amendments 103, 104 and 106) — the I/O matrix's stream rows, driven
// end to end through World.step(): `InputMsg.held` (a LEVEL off the latest
// input) -> streamControl -> the magazine row -> direct shells at `now`.
//
// What this file pins:
//   * the cadence: held for 3 s = 9 shells, 350 ms apart (Eric 2026-09-30),
//     each born at `now` (no fireT, no back-date, no pre-step), each with its
//     OWN `mz`, no `burst` ever, an `sp` per shell that reaches the water,
//     magazine 16 -> 7; THE CARRY-OVER (orchestrator ruling 2026-09-30): a
//     live stream's next shot is due at the previous due + rateMs, so tier
//     II's 310 ms fires 10 shells in 3.1 s; a fresh stream re-anchors to
//     now + rateMs and a stalled tick fires one shell, never a burst;
//   * a tap (one held:true sample) fires exactly one shell; release stops it;
//   * a click edge (`fireSeq`) on a mounted machine gun fires NOTHING and
//     denies nothing;
//   * the MAGAZINE MODEL (the swap rule re-cut by Eric 2026-09-30): empty ->
//     the full 10 s swap -> 16, and a hold cannot interrupt it; the stream
//     stopping with shells left (released, or the gun deselected) starts the
//     swap THAT tick — no idle wait; a shot cancels a running partial swap,
//     which restarts from the FULL reloadMs when the stream stops again;
//   * the gates: frozen (boarding), dead (foundered) and sinking (LIVE); a
//     refusal mid-hold ENDS the stream (the swap starts; unfreeze is fresh);
//   * a direct hit deals the full damage as a CONTACT hit (no burst).
// The 20-bot `mz` measurement is wave 4's (the harness `--gun` arm).

import { describe, it, expect } from 'vitest';
import { CONFIG, isAfloat, isSinking, type GameEvent, type InputMsg } from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { flatRaster } from './islandFixture.js';
import { machineGunEquipment } from '../game/equipment/machineGun.js';
import type { ActivationContext } from '../game/equipment/index.js';

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

  it('held for 3 s: 9 shells at t = 0, 0.35, 0.7 … each born at `now`, 9 `mz`, NO burst, magazine 16 -> 7', () => {
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
    expect(MG.rateMs).toBe(350);
    expect(kindCount(log, 'shell')).toBe(9);
    expect(kindCount(log, 'mz')).toBe(9); // one flash PER shell (amendment 89(i))
    expect(kindCount(log, 'burst')).toBe(0); // a direct shell never bursts
    expect(mag(a).n).toBe(7);
    expect(mag(a).reloadMsLeft).toBe(0); // no swap: the stream is live between shots
    // Cadence: exactly rateMs apart, from the first held tick.
    births.sort((p, q) => p - q);
    expect(births).toHaveLength(9);
    for (let i = 1; i < births.length; i++) expect(births[i] - births[i - 1]).toBe(MG.rateMs);
    // Each shell was born at the tick it spawned in — never back-dated — and
    // reveals to its owner as an `mg` shell.
    for (const e of log) if (e.k === 'shell') expect(e.w).toBe('mg');
    expect(a.lastFireT).toBe(0); // the stream never touches the click channel's clock
  });

  it('THE CARRY-OVER: held 3.1 s at tier II (310 ms) fires 10 shells (3100 / 310), not the 9 a round-up to 350 ms would', () => {
    const w = bareWorld();
    const a = gunner(w, 'a');
    w.applyCard(a, 'machineGun');
    expect(a.stats.equipment.machineGun.rateMs).toBe(310);
    const log: GameEvent[] = [];
    const births: number[] = [];
    let seq = 0;
    for (let i = 0; i < 62; i++) {
      // 3.1 s = 62 ticks (t = 0 … 3.05 s)
      seq = hold(w, 'a', true, 1, seq, log);
      for (const s of w.shells.values()) if (!births.includes(s.bornAt)) births.push(s.bornAt);
    }
    expect(kindCount(log, 'shell')).toBe(10);
    // Every shell lands on the first tick at or after its carried due time
    // (0, 310, 620, … 2790): never more than one tick late, never early.
    births.sort((p, q) => p - q);
    const t0 = births[0];
    births.forEach((b, k) => {
      expect(b - t0).toBeGreaterThanOrEqual(k * 310);
      expect(b - t0).toBeLessThan(k * 310 + DT);
    });
  });

  it('a FRESH stream re-anchors: after a release the new first shot is due a full rateMs later, no carried credit', () => {
    const w = bareWorld();
    const a = gunner(w, 'a');
    w.applyCard(a, 'machineGun'); // 310 ms
    const log: GameEvent[] = [];
    let seq = hold(w, 'a', true, 8, 0, log); // t = 0 … 350: shots at 0 and 350 (due 310); next due 620
    expect(kindCount(log, 'shell')).toBe(2);
    seq = hold(w, 'a', false, 1, seq, log); // t = 400: released — the stream is no longer live
    seq = hold(w, 'a', true, 5, seq, log); // t = 450 … 650: the cadence still holds; fires at 650
    expect(kindCount(log, 'shell')).toBe(3);
    // FRESH: next due 650 + 310 = 960 -> the 1000 tick. A carried stream
    // (620 + 310 = 930) would have fired at 950.
    seq = hold(w, 'a', true, 6, seq, log); // t = 700 … 950
    expect(kindCount(log, 'shell')).toBe(3);
    hold(w, 'a', true, 1, seq, log); // t = 1000
    expect(kindCount(log, 'shell')).toBe(4);
  });

  it('NO CATCH-UP BURST: a stalled 2 s tick fires ONE shell and re-anchors to now + rateMs', () => {
    const w = bareWorld();
    const a = gunner(w, 'a');
    const log: GameEvent[] = [];
    let seq = hold(w, 'a', true, 1, 0, log); // the first shot
    expect(kindCount(log, 'shell')).toBe(1);
    seq += 1;
    w.submitInput('a', makeInput({ seq, held: true }));
    w.step(2000); // a stall: ~5 rateMs late
    log.push(...w.tickEvents);
    expect(kindCount(log, 'shell')).toBe(2); // one shell, not five
    expect(mag(a).n).toBe(MG.maxAmmo - 2);
    seq = hold(w, 'a', true, 6, seq, log); // +300 ms after the stall: nothing
    expect(kindCount(log, 'shell')).toBe(2);
    hold(w, 'a', true, 1, seq, log); // +350 ms: the re-anchored due time
    expect(kindCount(log, 'shell')).toBe(3);
  });

  it('every shell that reaches the water expires with the shooter-private `sp` and NO burst', () => {
    const w = bareWorld();
    gunner(w, 'a');
    const log: GameEvent[] = [];
    hold(w, 'a', true, 7, 0, log); // 0.35 s held (t = 0 … 0.3): one shell...
    hold(w, 'a', false, 40, 7, log); // ...then released while it flies its 400 u (0.8 s)
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
    expect(kindCount(log, 'shell')).toBe(2); // 1.5 s later — well past 350 ms
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

// ---------- the lit-zone reach (amendment 114) -------------------------------

// EVERY DECK GUN FIRES INTO ITS OWN LIT-UP AREA (Eric ruling 2026-09-29,
// amendment 114): R2.15's reach extension — a click past the gun's range whose
// far point lies inside one of the shooter's OWN live star-shell zones is
// honoured at the clicked distance — applies to the machine gun exactly as to
// the cannon. An ENEMY's flare, or none, still clamps to the 660 u rung.
describe('the lit-zone reach — the machine gun fires into its own flare (amendment 114)', () => {
  function litStream(owner: string | null): { w: World; a: ShipRecord } {
    const w = bareWorld();
    const a = gunner(w, 'a');
    if (owner !== null) {
      w.litZones.set('z1', {
        id: 'z1', ownerId: owner, x: 800, y: 0, r: 120, until: 10 * 60 * 1000,
      });
    }
    w.submitInput('a', makeInput({ seq: 1, held: true, aimDist: 800 }));
    w.step();
    return { w, a };
  }

  it('a click at 800 u into an OWN live lit zone lands the shell at 800 u', () => {
    const { w, a } = litStream('a');
    expect(a.stats.equipment.machineGun.rangeU).toBe(660);
    const shells = [...w.shells.values()];
    expect(shells).toHaveLength(1);
    expect(shells[0].targetX).toBeCloseTo(800, 6);
  });

  it('the same click into an ENEMY zone, or with no zone, clamps to 660 u', () => {
    for (const owner of ['b', null]) {
      const { w } = litStream(owner);
      const shells = [...w.shells.values()];
      expect(shells, `owner=${owner}`).toHaveLength(1);
      expect(shells[0].targetX, `owner=${owner}`).toBeCloseTo(660, 6);
    }
  });
});

// ---------- the magazine ------------------------------------------------------

describe('the magazine (amendment 103; the swap rule Eric 2026-09-30)', () => {
  it('empties in 16 shells; the full 10 s swap starts at once, a HOLD cannot interrupt it, and it fills to 16', () => {
    const w = bareWorld();
    const a = gunner(w, 'a');
    const log: GameEvent[] = [];
    // 16 shells × 350 ms = 5.25 s from the first shot to the 16th; hold 6 s.
    let seq = hold(w, 'a', true, 120, 0, log);
    expect(kindCount(log, 'shell')).toBe(16);
    expect(mag(a).n).toBe(0);
    expect(w.denialsFor('a')).toBeUndefined();
    // The swap started the tick after the magazine emptied, at the FULL reloadMs.
    expect(mag(a).reloadMsLeft).toBeGreaterThan(0);
    expect(mag(a).reloadMsLeft).toBeLessThanOrEqual(MG.reloadMs);
    // STILL HELD: nothing fires and the timer is never reset — it counts down
    // one tick at a time to the end.
    let left = mag(a).reloadMsLeft;
    const ticksToDone = Math.ceil(left / DT);
    for (let i = 0; i < ticksToDone - 1; i++) {
      seq = hold(w, 'a', true, 1, seq, log);
      expect(mag(a).n).toBe(0);
      expect(mag(a).reloadMsLeft).toBe(left - DT);
      left = mag(a).reloadMsLeft;
    }
    expect(kindCount(log, 'shell')).toBe(16); // nothing extra fired
    // The swap completes -> FULL, and the level still held fires AT ONCE.
    hold(w, 'a', true, 1, seq, log);
    expect(mag(a)).toEqual({ n: MG.maxAmmo - 1, reloadMsLeft: 0 });
    expect(kindCount(log, 'shell')).toBe(17);
    expect(MG.reloadMs).toBe(10000);
  });

  it('an empty magazine\'s swap refills after the whole reloadMs when released, too', () => {
    const w = bareWorld();
    const a = gunner(w, 'a');
    const log: GameEvent[] = [];
    let seq = hold(w, 'a', true, 120, 0, log);
    expect(mag(a).n).toBe(0);
    const ticksToDone = Math.ceil(mag(a).reloadMsLeft / DT);
    seq = hold(w, 'a', false, ticksToDone - 1, seq, log);
    expect(mag(a).n).toBe(0); // not yet
    hold(w, 'a', false, 1, seq, log);
    expect(mag(a)).toEqual({ n: MG.maxAmmo, reloadMsLeft: 0 }); // FULL, timer idle
  });

  it('RELEASE with shells left starts the full swap THAT tick (no idle wait), and it completes to a full magazine', () => {
    const w = bareWorld();
    const a = gunner(w, 'a');
    const log: GameEvent[] = [];
    let seq = hold(w, 'a', true, 1, 0, log); // one shell at t0
    expect(mag(a)).toEqual({ n: 15, reloadMsLeft: 0 });
    seq = hold(w, 'a', false, 1, seq, log); // released: the swap starts now, full length
    expect(mag(a)).toEqual({ n: 15, reloadMsLeft: MG.reloadMs });
    seq = hold(w, 'a', false, MG.reloadMs / DT - 1, seq, log);
    expect(mag(a)).toEqual({ n: 15, reloadMsLeft: DT }); // shells left stay loaded while it runs
    hold(w, 'a', false, 1, seq, log);
    expect(mag(a)).toEqual({ n: MG.maxAmmo, reloadMsLeft: 0 });
  });

  it('DESELECTING the gun mid-hold stops the stream: the swap starts that tick (amendment 111)', () => {
    const w = bareWorld();
    const a = gunner(w, 'a');
    w.submitInput('a', makeInput({ seq: 1, held: true }));
    w.step();
    expect(mag(a)).toEqual({ n: 15, reloadMsLeft: 0 });
    w.submitInput('a', makeInput({ seq: 2, held: true, slot: 2 })); // still held, another slot selected
    w.step();
    expect(mag(a)).toEqual({ n: 15, reloadMsLeft: MG.reloadMs });
  });

  it('a shot during a running PARTIAL swap cancels it (the shells left fire); it restarts from the FULL time when the stream stops', () => {
    const w = bareWorld();
    const a = gunner(w, 'a');
    const log: GameEvent[] = [];
    let seq = hold(w, 'a', true, 1, 0, log); // 15 left
    seq = hold(w, 'a', false, 40, seq, log); // released -> the swap starts; 2 s into it
    expect(mag(a).reloadMsLeft).toBe(MG.reloadMs - 39 * DT);
    seq = hold(w, 'a', true, 1, seq, log); // a shot: the swap is CANCELLED
    expect(mag(a)).toEqual({ n: 14, reloadMsLeft: 0 });
    expect(kindCount(log, 'shell')).toBe(2);
    // Held on between shots: the stream is live, no swap restarts.
    seq = hold(w, 'a', true, 3, seq, log);
    expect(mag(a)).toEqual({ n: 14, reloadMsLeft: 0 });
    // Released: the swap restarts at the FULL reloadMs, not the 8 s that was left.
    hold(w, 'a', false, 1, seq, log);
    expect(mag(a)).toEqual({ n: 14, reloadMsLeft: MG.reloadMs });
  });

  it('a NEGATIVE swap remainder with shells missing still starts the full swap on a release (the `<= 0` idiom, review gate P3)', () => {
    const w = bareWorld();
    const a = gunner(w, 'a');
    const slot = a.loadout[SLOT_GUN];
    slot.state = { n: 5, reloadMsLeft: -10 };
    machineGunEquipment.stream!({ ship: a } as unknown as ActivationContext, slot, false);
    expect(slot.state).toEqual({ n: 5, reloadMsLeft: MG.reloadMs });
  });

  it('the ladder moves the magazine: tier II reads 18 shells / 5 damage / 0.31 s, and a fresh pool is 18', () => {
    const w = bareWorld();
    const a = gunner(w, 'a');
    w.applyCard(a, 'machineGun');
    expect(a.stats.equipment.machineGun.maxAmmo).toBe(18);
    expect(a.stats.equipment.machineGun.damage).toBe(5);
    expect(a.stats.equipment.machineGun.rateMs).toBe(310);
    expect(a.stats.equipment.machineGun.reloadMs).toBeCloseTo(MG.reloadMs * 0.95, 6);
  });

  it('a tier grant on a FULL, never-fired magazine tops it up to the new cap: n 18, reloadMsLeft 0, and no swap starts', () => {
    const w = bareWorld();
    const a = gunner(w, 'a');
    const log: GameEvent[] = [];
    hold(w, 'a', false, 120, 0, log);
    expect(mag(a)).toEqual({ n: MG.maxAmmo, reloadMsLeft: 0 });
    w.applyCard(a, 'machineGun');
    expect(mag(a)).toEqual({ n: 18, reloadMsLeft: 0 });
    hold(w, 'a', false, 40, 120, log);
    expect(mag(a)).toEqual({ n: 18, reloadMsLeft: 0 });
  });

  it('a tier grant DURING a running swap fills the magazine and the swap ends: no swap runs on a full magazine', () => {
    const w = bareWorld();
    const a = gunner(w, 'a');
    const log: GameEvent[] = [];
    let seq = hold(w, 'a', true, 1, 0, log); // one shot: 15 left
    seq = hold(w, 'a', false, 5, seq, log); // released -> the swap is running
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

  it('a hull REFUSED mid-stream (frozen) with 9/16 shells: the stream ends that tick and the full swap starts (review gate P1)', () => {
    const w = bareWorld();
    const a = gunner(w, 'a');
    const log: GameEvent[] = [];
    let seq = 0;
    while (mag(a).n > 9) seq = hold(w, 'a', true, 1, seq, log);
    expect(mag(a)).toEqual({ n: 9, reloadMsLeft: 0 });
    expect(a.streamLive).toBe(true);
    w.weaponsEnabled = false; // the boarding lock lands mid-hold
    hold(w, 'a', true, 1, seq, log);
    expect(a.streamLive).toBe(false);
    expect(mag(a)).toEqual({ n: 9, reloadMsLeft: MG.reloadMs });
  });

  it('UNFREEZE with the button still held: the first shot is a FRESH stream (re-anchored) and it cancels the swap the refusal started', () => {
    const w = bareWorld();
    const a = gunner(w, 'a');
    w.applyCard(a, 'machineGun'); // 310 ms: a carried due differs from a fresh one
    const log: GameEvent[] = [];
    let seq = hold(w, 'a', true, 1, 0, log); // shot at X, due X + 310
    seq = hold(w, 'a', true, 1, seq, log); // X + 50: live, nothing due
    w.weaponsEnabled = false;
    seq = hold(w, 'a', true, 1, seq, log); // X + 100: refused -> the stream ends, the swap starts
    expect(mag(a).reloadMsLeft).toBe(a.stats.equipment.machineGun.reloadMs);
    w.weaponsEnabled = true;
    while (kindCount(log, 'shell') < 2) seq = hold(w, 'a', true, 1, seq, log);
    const born = Math.max(...[...w.shells.values()].map((s) => s.bornAt));
    expect(mag(a)).toEqual({ n: 16, reloadMsLeft: 0 }); // the shot cancelled the swap
    // FRESH: next due = this shot + rateMs (a carried stream would be X + 620).
    expect(a.streamNextAt).toBe(born + a.stats.equipment.machineGun.rateMs);
  });

  it('SINKING stays live (amendment 10): the dying captain keeps streaming', () => {
    const w = bareWorld();
    const a = gunner(w, 'a');
    w.respawnEnabled = false;
    w.sinkShip('a');
    expect(isSinking(a.lifecycle)).toBe(true);
    const log: GameEvent[] = [];
    hold(w, 'a', true, 20, 0, log);
    expect(kindCount(log, 'shell')).toBe(3); // 1 s held = 3 shells (t = 0, 0.35, 0.7)
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
