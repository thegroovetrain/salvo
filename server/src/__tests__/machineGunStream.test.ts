// THE MACHINE GUN'S HELD-FIRE STREAM (Story 8.15, Eric rulings 2026-09-28,
// epic-8 amendments 103, 104 and 106) — the I/O matrix's stream rows, driven
// end to end through World.step(): `InputMsg.held` (a LEVEL off the latest
// input) -> streamControl -> the magazine row -> direct shells at `now`.
//
// What this file pins:
//   * the cadence: held for 3 s = 10 shells, 300 ms apart (Eric 2026-10-02,
//     epic-8 amendment 232), each born at `now` (no fireT, no back-date, no
//     pre-step), each with its OWN `mz`, no `burst` ever, an `sp` per shell
//     that reaches the water, magazine 12 -> 2; tier II's 250 ms holds exactly;
//     THE CARRY-OVER (orchestrator ruling 2026-09-30): a live stream's next
//     shot is due at the previous due + rateMs. Every delay on Eric's
//     2026-10-02 table (300/250/200/150/100 ms) is a whole number of 50 ms
//     ticks, where carried and fresh due times coincide — so the carry-over
//     tests INJECT a non-tick-aligned 310 ms delay into the ship's cached
//     stats row (the combat.test.ts stats-spread precedent) to keep the
//     mechanism proven: 10 shells in 3.1 s; a fresh stream re-anchors to
//     now + rateMs and a stalled tick fires one shell, never a burst;
//   * a tap (one held:true sample) fires exactly one shell; release stops it;
//   * a click edge (`fireSeq`) on a mounted machine gun fires NOTHING and
//     denies nothing;
//   * the MAGAZINE MODEL (the swap rule re-cut by Eric 2026-09-30): empty ->
//     the full 12 s swap -> 12, and a hold cannot interrupt it; the stream
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

/** INJECT a shot delay into the ship's cached effective-stats row (the
 *  combat.test.ts stats-spread precedent). Eric's 2026-10-02 delays are all
 *  whole 50 ms ticks, where a carried due time and a fresh one coincide; a
 *  NON-tick-aligned delay (310 ms) is the only way to tell them apart, so the
 *  carry-over tests run on one. Nothing re-folds stats mid-test (only a card
 *  grant or a spawn does), and the stream reads the row every tick. */
function injectRateMs(a: ShipRecord, rateMs: number): void {
  const mg = { ...a.stats.equipment.machineGun, rateMs };
  a.stats = { ...a.stats, equipment: { ...a.stats.equipment, machineGun: mg } };
}

// ---------- the stream --------------------------------------------------------

describe('the stream — one direct shell per rateMs while held (amendment 103)', () => {
  it('mounts the machineGun module in slot 0 with a full magazine', () => {
    const w = bareWorld();
    const a = gunner(w, 'a');
    expect(a.loadout[SLOT_GUN].equipmentId).toBe('machineGun');
    expect(mag(a)).toEqual({ n: MG.maxAmmo, reloadMsLeft: 0 });
    expect(a.stats.equipment.machineGun.rangeU).toBe(CONFIG.machineGun.rangeU); // its own dial, 6/12 (Story 9.8, ruling 125)
  });

  it('held for 3 s: one shell per rateMs from the first held tick, each born at `now` with its own `mz`, NO burst, the magazine drained by exactly that count', () => {
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
    // Tier I's delay is a whole number of ticks, so 60 held ticks fire one
    // shell per due time 0, rateMs, 2·rateMs … inside the 3 s.
    expect(MG.rateMs % DT).toBe(0);
    const n = Math.floor((60 * DT - 1) / MG.rateMs) + 1;
    expect(n).toBeLessThan(MG.maxAmmo); // the magazine never runs dry inside the window
    expect(kindCount(log, 'shell')).toBe(n);
    expect(kindCount(log, 'mz')).toBe(n); // one flash PER shell (amendment 89(i))
    expect(kindCount(log, 'burst')).toBe(0); // a direct shell never bursts
    expect(mag(a).n).toBe(MG.maxAmmo - n);
    expect(mag(a).reloadMsLeft).toBe(0); // no swap: the stream is live between shots
    // Cadence: exactly rateMs apart, from the first held tick.
    births.sort((p, q) => p - q);
    expect(births).toHaveLength(n);
    for (let i = 1; i < births.length; i++) expect(births[i] - births[i - 1]).toBe(MG.rateMs);
    // Each shell was born at the tick it spawned in — never back-dated — and
    // reveals to its owner as an `mg` shell.
    for (const e of log) if (e.k === 'shell') expect(e.w).toBe('mg');
    expect(a.lastFireT).toBe(0); // the stream never touches the click channel's clock
  });

  it('tier II\'s faster, non-tick-aligned delay holds on the carry-over: the i-th shell is due at i × rateMs and fires on the first tick at or after it', () => {
    const w = bareWorld();
    const a = gunner(w, 'a');
    w.applyCard(a, 'machineGun');
    const rate = a.stats.equipment.machineGun.rateMs;
    expect(rate).toBeLessThan(MG.rateMs); // the ladder speeds the stream
    expect(rate % DT).not.toBe(0); // a non-tick delay: the carry-over is what keeps its average
    const log: GameEvent[] = [];
    const births: number[] = [];
    let seq = 0;
    for (let i = 0; i < 60; i++) {
      seq = hold(w, 'a', true, 1, seq, log);
      for (const s of w.shells.values()) if (!births.includes(s.bornAt)) births.push(s.bornAt);
    }
    const due = Array.from({ length: Math.floor((60 * DT - 1) / rate) + 1 }, (_, i) => i * rate); // 0, 275 … 2750
    expect(kindCount(log, 'shell')).toBe(due.length);
    expect(mag(a).n).toBe(a.stats.equipment.machineGun.maxAmmo - due.length);
    births.sort((p, q) => p - q);
    const t0 = births[0];
    expect(births.map((b) => b - t0)).toEqual(due.map((d) => Math.ceil(d / DT) * DT));
  });

  it('THE CARRY-OVER: an injected non-tick-aligned 310 ms delay held 3.1 s fires 10 shells (3100 / 310), not the 9 a round-up to 350 ms would', () => {
    // REDESIGNED (cycle 166): this used to ride tier II's 310 ms; every
    // delay on Eric's 2026-10-02 table lands on a 50 ms tick, where the
    // carry-over changes nothing, so the 310 ms is injected (injectRateMs).
    const w = bareWorld();
    const a = gunner(w, 'a');
    injectRateMs(a, 310);
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
    injectRateMs(a, 310); // non-tick-aligned, so a carried due differs from a fresh one (see injectRateMs)
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
    w.step(2000); // a stall: ~6 rateMs late
    log.push(...w.tickEvents);
    expect(kindCount(log, 'shell')).toBe(2); // one shell, not six
    expect(mag(a).n).toBe(MG.maxAmmo - 2);
    seq = hold(w, 'a', true, 5, seq, log); // +250 ms after the stall: nothing
    expect(kindCount(log, 'shell')).toBe(2);
    hold(w, 'a', true, 1, seq, log); // +300 ms: the re-anchored due time
    expect(kindCount(log, 'shell')).toBe(3);
  });

  it('every shell that reaches the water expires with the shooter-private `sp` and NO burst', () => {
    const w = bareWorld();
    gunner(w, 'a');
    const log: GameEvent[] = [];
    hold(w, 'a', true, 7, 0, log); // 0.35 s held (t = 0 … 0.3): two shells (t = 0, 0.3)...
    hold(w, 'a', false, 40, 7, log); // ...then released while they fly their 400 u (0.8 s)
    expect(kindCount(log, 'shell')).toBe(2);
    expect(kindCount(log, 'sp')).toBe(2); // one per shell
    expect(kindCount(log, 'burst')).toBe(0);
    expect(kindCount(log, 'hc')).toBe(0);
    const booms = log.filter((e) => e.k === 'boom');
    expect(booms).toHaveLength(2);
    for (const boom of booms) expect((boom as { x: number }).x).toBeCloseTo(400, 3); // expired AT the aim point
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
    expect(kindCount(log, 'shell')).toBe(2); // 1.5 s later — well past 300 ms
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

  it('a direct hit deals the FULL damage as a contact hit: one `hc`, no burst', () => {
    const w = bareWorld();
    const a = gunner(w, 'a');
    const b = w.addShip('b', 'B', 'captain', 'battleship', undefined, undefined);
    b.state = { x: 300, y: 0, heading: Math.PI / 2, speed: 0 }; // broadside-on at 300 u
    const log: GameEvent[] = [];
    hold(w, 'a', true, 1, 0, log);
    hold(w, 'a', false, 30, 1, log);
    expect(b.hp).toBe(b.stats.maxHp - MG.damage);
    expect(kindCount(log, 'hc')).toBe(1);
    expect(kindCount(log, 'burst')).toBe(0);
    expect(kindCount(log, 'sp')).toBe(0);
    expect(a.damageDealt).toBe(MG.damage);
  });
});

// ---------- the lit-zone reach (amendment 114) -------------------------------

// EVERY DECK GUN FIRES INTO ITS OWN LIT-UP AREA (Eric ruling 2026-09-29,
// amendment 114): R2.15's reach extension — a click past the gun's range whose
// far point lies inside one of the shooter's OWN live star-shell zones is
// honoured at the clicked distance — applies to the machine gun exactly as to
// the cannon. An ENEMY's flare, or none, still clamps to the gun's own reach (its Tier I
// dial since Story 9.8, ruling 125).
describe('the lit-zone reach — the machine gun fires into its own flare (amendment 114)', () => {
  /** u — a click past the gun's Tier I reach (Story 9.8: derived, never a literal). */
  const FAR = CONFIG.machineGun.rangeU + 140;
  function litStream(owner: string | null): { w: World; a: ShipRecord } {
    const w = bareWorld();
    const a = gunner(w, 'a');
    if (owner !== null) {
      w.litZones.set('z1', {
        id: 'z1', ownerId: owner, x: FAR, y: 0, r: 120, until: 10 * 60 * 1000,
      });
    }
    w.submitInput('a', makeInput({ seq: 1, held: true, aimDist: FAR }));
    w.step();
    return { w, a };
  }

  it('a click past reach into an OWN live lit zone lands the shell at the click', () => {
    const { w, a } = litStream('a');
    expect(a.stats.equipment.machineGun.rangeU).toBe(CONFIG.machineGun.rangeU);
    expect(FAR).toBeGreaterThan(CONFIG.machineGun.rangeU);
    const shells = [...w.shells.values()];
    expect(shells).toHaveLength(1);
    expect(shells[0].targetX).toBeCloseTo(FAR, 6);
  });

  it('the same click into an ENEMY zone, or with no zone, clamps to the gun reach', () => {
    for (const owner of ['b', null]) {
      const { w } = litStream(owner);
      const shells = [...w.shells.values()];
      expect(shells, `owner=${owner}`).toHaveLength(1);
      expect(shells[0].targetX, `owner=${owner}`).toBeCloseTo(CONFIG.machineGun.rangeU, 6);
    }
  });
});

// ---------- the magazine ------------------------------------------------------

describe('the magazine (amendment 103; the swap rule Eric 2026-09-30)', () => {
  it('empties the magazine; the full swap starts at once, a HOLD cannot interrupt it, and it fills to maxAmmo', () => {
    const w = bareWorld();
    const a = gunner(w, 'a');
    const log: GameEvent[] = [];
    // maxAmmo shells at rateMs apart must empty well inside the 6 s hold.
    expect((MG.maxAmmo - 1) * MG.rateMs).toBeLessThan(120 * DT);
    let seq = hold(w, 'a', true, 120, 0, log);
    expect(kindCount(log, 'shell')).toBe(MG.maxAmmo);
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
    expect(kindCount(log, 'shell')).toBe(MG.maxAmmo); // nothing extra fired
    // The swap completes -> FULL, and the level still held fires AT ONCE.
    hold(w, 'a', true, 1, seq, log);
    expect(mag(a)).toEqual({ n: MG.maxAmmo - 1, reloadMsLeft: 0 });
    expect(kindCount(log, 'shell')).toBe(MG.maxAmmo + 1);
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
    expect(mag(a)).toEqual({ n: MG.maxAmmo - 1, reloadMsLeft: 0 });
    seq = hold(w, 'a', false, 1, seq, log); // released: the swap starts now, full length
    expect(mag(a)).toEqual({ n: MG.maxAmmo - 1, reloadMsLeft: MG.reloadMs });
    seq = hold(w, 'a', false, MG.reloadMs / DT - 1, seq, log);
    expect(mag(a)).toEqual({ n: MG.maxAmmo - 1, reloadMsLeft: DT }); // shells left stay loaded while it runs
    hold(w, 'a', false, 1, seq, log);
    expect(mag(a)).toEqual({ n: MG.maxAmmo, reloadMsLeft: 0 });
  });

  it('DESELECTING the gun mid-hold stops the stream: the swap starts that tick (amendment 111)', () => {
    const w = bareWorld();
    const a = gunner(w, 'a');
    w.submitInput('a', makeInput({ seq: 1, held: true }));
    w.step();
    expect(mag(a)).toEqual({ n: MG.maxAmmo - 1, reloadMsLeft: 0 });
    w.submitInput('a', makeInput({ seq: 2, held: true, slot: 2 })); // still held, another slot selected
    w.step();
    expect(mag(a)).toEqual({ n: MG.maxAmmo - 1, reloadMsLeft: MG.reloadMs });
  });

  it('a shot during a running PARTIAL swap cancels it (the shells left fire); it restarts from the FULL time when the stream stops', () => {
    const w = bareWorld();
    const a = gunner(w, 'a');
    const log: GameEvent[] = [];
    let seq = hold(w, 'a', true, 1, 0, log); // 11 left
    seq = hold(w, 'a', false, 40, seq, log); // released -> the swap starts; 2 s into it
    expect(mag(a).reloadMsLeft).toBe(MG.reloadMs - 39 * DT);
    seq = hold(w, 'a', true, 1, seq, log); // a shot: the swap is CANCELLED
    expect(mag(a)).toEqual({ n: MG.maxAmmo - 2, reloadMsLeft: 0 });
    expect(kindCount(log, 'shell')).toBe(2);
    // Held on between shots: the stream is live, no swap restarts.
    seq = hold(w, 'a', true, 3, seq, log);
    expect(mag(a)).toEqual({ n: MG.maxAmmo - 2, reloadMsLeft: 0 });
    // Released: the swap restarts at the FULL reloadMs, not the ~10 s that was left.
    hold(w, 'a', false, 1, seq, log);
    expect(mag(a)).toEqual({ n: MG.maxAmmo - 2, reloadMsLeft: MG.reloadMs });
  });

  it('a NEGATIVE swap remainder with shells missing still starts the full swap on a release (the `<= 0` idiom, review gate P3)', () => {
    const w = bareWorld();
    const a = gunner(w, 'a');
    const slot = a.loadout[SLOT_GUN];
    slot.state = { n: 5, reloadMsLeft: -10 };
    machineGunEquipment.stream!({ ship: a } as unknown as ActivationContext, slot, false);
    expect(slot.state).toEqual({ n: 5, reloadMsLeft: MG.reloadMs });
  });

  it('the ladder moves the magazine: tier II holds more shells, fires and swaps faster at FLAT damage, and a fresh pool is the new cap', () => {
    const w = bareWorld();
    const a = gunner(w, 'a');
    w.applyCard(a, 'machineGun');
    expect(a.stats.equipment.machineGun.maxAmmo).toBeGreaterThan(MG.maxAmmo);
    expect(Number.isInteger(a.stats.equipment.machineGun.maxAmmo)).toBe(true);
    expect(a.stats.equipment.machineGun.damage).toBe(MG.damage); // no damage rungs (Story 9.12)
    expect(a.stats.equipment.machineGun.rateMs).toBeLessThan(MG.rateMs);
    expect(a.stats.equipment.machineGun.reloadMs).toBeLessThan(MG.reloadMs);
    expect(mag(a)).toEqual({ n: a.stats.equipment.machineGun.maxAmmo, reloadMsLeft: 0 });
  });

  it('a tier grant on a FULL, never-fired magazine tops it up to the new cap, reloadMsLeft 0, and no swap starts', () => {
    const w = bareWorld();
    const a = gunner(w, 'a');
    const log: GameEvent[] = [];
    hold(w, 'a', false, 120, 0, log);
    expect(mag(a)).toEqual({ n: MG.maxAmmo, reloadMsLeft: 0 });
    w.applyCard(a, 'machineGun');
    const cap = a.stats.equipment.machineGun.maxAmmo;
    expect(cap).toBeGreaterThan(MG.maxAmmo);
    expect(mag(a)).toEqual({ n: cap, reloadMsLeft: 0 });
    hold(w, 'a', false, 40, 120, log);
    expect(mag(a)).toEqual({ n: cap, reloadMsLeft: 0 });
  });

  it('a tier grant DURING a running swap fills the magazine and the swap ends: no swap runs on a full magazine', () => {
    const w = bareWorld();
    const a = gunner(w, 'a');
    const log: GameEvent[] = [];
    let seq = hold(w, 'a', true, 1, 0, log); // one shot: 11 left
    seq = hold(w, 'a', false, 5, seq, log); // released -> the swap is running
    expect(mag(a).n).toBe(MG.maxAmmo - 1);
    expect(mag(a).reloadMsLeft).toBeGreaterThan(0);
    w.applyCard(a, 'machineGun');
    const cap = a.stats.equipment.machineGun.maxAmmo;
    expect(mag(a).n).toBe(cap); // everything arrives loaded
    hold(w, 'a', false, 1, seq, log);
    expect(mag(a)).toEqual({ n: cap, reloadMsLeft: 0 });
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

  it('a hull REFUSED mid-stream (frozen) with shells left: the stream ends that tick and the full swap starts (review gate P1)', () => {
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
    // REDESIGNED (cycle 166): this rode tier II's 310 ms; tier II is 250 ms
    // now (a whole number of ticks, where carried and fresh coincide), so the
    // non-tick-aligned 310 ms is injected (see injectRateMs).
    injectRateMs(a, 310); // a carried due differs from a fresh one
    const log: GameEvent[] = [];
    let seq = hold(w, 'a', true, 1, 0, log); // shot at X, due X + 310
    seq = hold(w, 'a', true, 1, seq, log); // X + 50: live, nothing due
    w.weaponsEnabled = false;
    seq = hold(w, 'a', true, 1, seq, log); // X + 100: refused -> the stream ends, the swap starts
    expect(mag(a).reloadMsLeft).toBe(a.stats.equipment.machineGun.reloadMs);
    w.weaponsEnabled = true;
    while (kindCount(log, 'shell') < 2) seq = hold(w, 'a', true, 1, seq, log);
    const born = Math.max(...[...w.shells.values()].map((s) => s.bornAt));
    expect(mag(a)).toEqual({ n: MG.maxAmmo - 2, reloadMsLeft: 0 }); // the shot cancelled the swap
    // FRESH: next due = this shot (X + 350) + rateMs = X + 660 (a carried
    // stream would be X + 620).
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
    expect(kindCount(log, 'shell')).toBe(Math.floor((20 * DT - 1) / MG.rateMs) + 1); // 1 s held: one per due time 0, rateMs, …
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
    expect(a.loadout[SLOT_GUN].state).toEqual({ n: CONFIG.gun.maxAmmo, reloadMsLeft: 0 });
  });
});
