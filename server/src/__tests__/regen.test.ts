// OUT-OF-COMBAT REGEN (epic-8 amendments 46-48; Eric ruling 2026-09-17) —
// the channel that REPLACED the free per-level auto-heal in Story 8.8.
//
// The shape, in Eric's words: *"1 %/s of missing, after 30 s"*. So healing is
// paced by DISENGAGING rather than by the economy — a hull that breaks contact
// and stays out of it comes back; a hull that keeps trading never does, because
// every landed blow (storm bites and burn ticks included) resets the clock at
// the one damage gate.
//
// WHAT THIS FILE PINS, and why each one is load-bearing:
//   * nothing at all before the window (the whole point — it is not a trickle
//     you get while fighting);
//   * the asymptotic 1 %-of-MISSING shape against the closed form, not a flat
//     rate (a flat rate would need repricing every time hull HP moves);
//   * the SNAP under 1 hp missing — without it the "full hull" HULL REPAIR
//     refusal is unreachable after any regen and the globe reads 349.9 forever;
//   * the clock reset from a DIRECT HIT and from a STORM BITE (the amendment-47
//     consequence Eric accepted: nobody regens in the storm);
//   * a blow fully eaten by a shield does NOT reset it (`dealt` 0);
//   * a PvE fleet drone NEVER regens (amendment 48 — a drone is environment);
//   * a sinking or sunk hull never regens (amendment 10's "no hp comes back");
//   * NO `heal` event and no pending band — the cue belongs to HULL REPAIR
//     alone, and a 20 Hz trickle would loop the tone.

import { describe, it, expect } from 'vitest';
import { CONFIG, type GameEvent, type HullId } from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { buildFrame } from '../game/frames.js';
import { flatRaster } from './islandFixture.js';

const REGEN = CONFIG.regen;
const DT = CONFIG.tick.simDtMs;
const TICKS_PER_S = 1000 / DT;

function bareWorld(seed = 3): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  w.map.heightRaster = flatRaster();
  return w;
}

function place(w: World, id: string, hull: HullId = 'torpedoBoat', fleet = false): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), fleet ? 'fleet' : 'captain', hull, undefined, undefined);
  rec.state = { x: 0, y: 0, heading: 0, speed: 0 };
  return rec;
}

/** The gate, reached by name — private by design (damageGate.test.ts idiom). */
interface Gate {
  applyDamage(victim: ShipRecord, amount: number, src: 'shell' | 'storm', byId: string | undefined): void;
}
const gate = (w: World): Gate => w as unknown as Gate;
const pend = (w: World): GameEvent[] => (w as unknown as { pending: GameEvent[] }).pending;

/** Advance `ms` of world time in whole sim ticks. */
function run(w: World, ms: number): void {
  for (let i = 0; i < Math.round(ms / DT); i += 1) w.step();
}

/** The closed form of N ticks of `hp += missing × pct × dt/1000`: each tick
 *  scales the MISSING amount by (1 − pct·dt/1000), so missing decays
 *  geometrically. Derived here rather than copied off the implementation, so
 *  the test would catch a rate written per-tick instead of per-second. */
function missingAfter(missing0: number, ticks: number): number {
  return missing0 * (1 - REGEN.missingPctPerS * (DT / 1000)) ** ticks;
}

describe('the 30 s wait', () => {
  it('a hurt hull regens NOTHING until outOfCombatMs have passed', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    a.hp = a.stats.maxHp * 0.5;
    const before = a.hp;
    // One tick short of the window — `lastDamagedAt` was stamped at spawn.
    run(w, REGEN.outOfCombatMs - DT);
    expect(a.hp).toBe(before);
  });

  // THE WAIT IS EXCLUSIVE OF THE TICK THAT ENDS ON IT (review gate, 2026-09-17).
  // A tick is a 50 ms SPAN, `now` its END: the tick that ends at exactly
  // `lastDamagedAt + 30000` covers (29950, 30000], which is still inside the
  // wait. Crediting it would pay a full tick's regen for time spent waiting —
  // the whole tick has to lie past the window before any of it is regen time.
  it('the tick that ENDS exactly on the 30 s mark credits NOTHING — its span is still inside the wait', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    a.hp = a.stats.maxHp * 0.5;
    const before = a.hp;
    run(w, REGEN.outOfCombatMs);
    expect(a.hp).toBe(before);
  });

  it('...and the NEXT tick — the first lying WHOLLY past the wait — credits exactly one tick', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    a.hp = a.stats.maxHp * 0.5;
    const missing0 = a.stats.maxHp - a.hp;
    run(w, REGEN.outOfCombatMs + DT);
    expect(a.stats.maxHp - a.hp).toBeCloseTo(missingAfter(missing0, 1), 6);
  });

  it('a hull spawns with its clock at `now`, not at 0 — a fresh life waits too', () => {
    const w = bareWorld();
    run(w, 5000); // world time is well past 0 before anyone joins
    const a = place(w, 'a');
    expect(a.lastDamagedAt).toBe(w.now);
  });
});

describe('the shape — 1 % of MISSING per second', () => {
  it('matches the closed form after N ticks past the wait', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    const maxHp = a.stats.maxHp;
    a.hp = maxHp * 0.4;
    const missing0 = maxHp - a.hp;
    run(w, REGEN.outOfCombatMs); // the boundary tick itself credits NOTHING
    const ticks = 10 * TICKS_PER_S;
    run(w, 10_000);
    // Exactly the ten seconds of ticks that lie wholly past the wait, and no
    // boundary freebie.
    expect(maxHp - a.hp).toBeCloseTo(missingAfter(missing0, ticks), 6);
  });

  it('is a fraction of MISSING, not of MAX: the same hull heals FASTER when hurt worse', () => {
    const rate = (hpFrac: number): number => {
      const w = bareWorld();
      const a = place(w, 'a');
      a.hp = a.stats.maxHp * hpFrac;
      const before = a.hp;
      run(w, REGEN.outOfCombatMs + DT); // the FIRST crediting tick
      return a.hp - before;
    };
    expect(rate(0.2)).toBeGreaterThan(rate(0.8));
  });

  it('snaps to FULL once under 1 hp is missing — the asymptote is closed by hand', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    a.hp = a.stats.maxHp - 0.5;
    run(w, REGEN.outOfCombatMs + DT); // the first crediting tick snaps it
    expect(a.hp).toBe(a.stats.maxHp);
  });

  it('never overshoots maxHp', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    a.hp = a.stats.maxHp - 0.5;
    run(w, REGEN.outOfCombatMs + 10_000);
    expect(a.hp).toBe(a.stats.maxHp);
  });
});

describe('the combat clock (amendment 47)', () => {
  it('a landed SHELL resets it — the regen stops at once and waits the full window again', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    place(w, 'b');
    a.hp = a.stats.maxHp * 0.5;
    run(w, REGEN.outOfCombatMs + 2000);
    const healed = a.hp;
    expect(healed).toBeGreaterThan(a.stats.maxHp * 0.5);
    gate(w).applyDamage(a, 10, 'shell', 'b');
    expect(a.lastDamagedAt).toBe(w.now);
    const afterHit = a.hp;
    run(w, REGEN.outOfCombatMs - DT);
    expect(a.hp).toBe(afterHit);
  });

  it('a STORM bite resets it too — nobody regens inside the storm', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    a.hp = a.stats.maxHp * 0.5;
    run(w, REGEN.outOfCombatMs + 2000);
    gate(w).applyDamage(a, 5, 'storm', undefined);
    expect(a.lastDamagedAt).toBe(w.now);
    const afterBite = a.hp;
    run(w, REGEN.outOfCombatMs - DT);
    expect(a.hp).toBe(afterBite);
  });

  it('a blow that lands NO hp does not reset it (`dealt` 0 — the shield case)', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    place(w, 'b');
    a.hp = a.stats.maxHp * 0.5;
    run(w, REGEN.outOfCombatMs);
    const stampBefore = a.lastDamagedAt;
    // A SHIELD BLOCK that swallows the whole blow: the gate runs to the end,
    // emits its report, and leaves `dealt` at 0. (Story 8.15 arms `shield` in
    // play; the gate has always read it.)
    a.shield = { hpLeft: 100, until: w.now + 10_000 };
    const hpBefore = a.hp;
    gate(w).applyDamage(a, 30, 'shell', 'b');
    expect(a.hp).toBe(hpBefore); // fully absorbed
    expect(a.lastDamagedAt).toBe(stampBefore); // ...and the clock did not move
    run(w, DT);
    expect(a.hp).toBeGreaterThan(hpBefore); // still regenerating
  });

  it('DEALING damage never resets the dealer\'s own clock', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    const b = place(w, 'b');
    a.hp = a.stats.maxHp * 0.5;
    run(w, REGEN.outOfCombatMs);
    const stampBefore = a.lastDamagedAt;
    gate(w).applyDamage(b, 30, 'shell', 'a');
    expect(a.lastDamagedAt).toBe(stampBefore);
  });
});

describe('who regens', () => {
  it('a PvE FLEET HULL never does (amendment 48) — a disengaged drone keeps its damage', () => {
    const w = bareWorld();
    const d = place(w, 'd', 'droneSmall', true);
    d.hp = d.stats.maxHp * 0.5;
    const before = d.hp;
    run(w, REGEN.outOfCombatMs + 30_000);
    expect(d.hp).toBe(before);
  });

  it('a SINKING (then SUNK) hull never does — no hp comes back in the window', () => {
    const w = bareWorld();
    w.respawnEnabled = false; // a respawn would refill the hull and hide the pin
    const a = place(w, 'a');
    place(w, 'b');
    a.hp = 1;
    gate(w).applyDamage(a, 999, 'shell', 'b');
    a.hp = a.stats.maxHp * 0.5; // a directed pool a live sinkShip would have zeroed
    const before = a.hp;
    run(w, REGEN.outOfCombatMs + 5000);
    expect(a.hp).toBe(before);
  });
});

describe('the regen is SILENT', () => {
  it('emits no `heal` event and no repair pool of its own', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    a.hp = a.stats.maxHp * 0.5;
    run(w, REGEN.outOfCombatMs + 5000);
    expect(a.hp).toBeGreaterThan(a.stats.maxHp * 0.5);
    expect(a.repairHp).toBe(0);
    expect(w.tickEvents.some((e) => e.k === 'heal')).toBe(false);
    expect(pend(w).some((e) => e.k === 'heal')).toBe(false);
  });

  it('...so the owner\'s wire pool stays 0 while the globe climbs', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    a.hp = a.stats.maxHp * 0.5;
    run(w, REGEN.outOfCombatMs + 5000);
    const f = buildFrame(w, 'a');
    expect(f.you!.repairHp).toBe(0);
    expect(f.you!.hp).toBe(a.hp);
  });
});
