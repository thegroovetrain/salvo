// THE FOULING SHELL, end to end (Story 9.4, Eric ruling 2026-10-11, epic-9
// amendments 61–68) — the consumable that replaced FLASH SHELLS on key `4`:
// one click-aimed, zero-damage shell whose stop point (burst or interception)
// leaves a stationary FOUL ZONE; every afloat hull whose OUTLINE touches the
// zone — the owner, enemies and PvE drones alike, sinking hulls excluded — is
// stamped `fouledUntil = now + lingerMs` each tick inside and runs at
// `CONFIG.foulingShell.slowFactor` × both caps while the stamp is in the
// future. Two zones never stack (one stamp per hull); the mine's slow and the
// shell's multiply (two calls of the one shared fold). Nobody is stamped while
// damage is off. The zone clears at match start and the stamp at every life
// boundary where `slowedUntil` clears.
//
// Every case runs through the REAL fire / step seams against the production
// catalog; the numbers are read from CONFIG, never pinned as literals.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  DEFAULT_HORN_ID,
  consumableSlotFor,
  DEFAULT_KIT,
  droneHullOf,
  isAfloat,
  isSinking,
  type GameEvent,
  type InputMsg,
  type ShipClassId,
} from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { fitClassWeapons } from './classWeapons.js';
import { buildFrame } from '../game/frames.js';
import { flatRaster } from './islandFixture.js';

const DT = CONFIG.tick.simDtMs;
const FS = CONFIG.foulingShell;
const SLOT = consumableSlotFor(DEFAULT_KIT, 'foulingShell')!;

/** Islands cleared and the raster flattened: open water, nothing to stop a
 *  shell or shadow a sensor. */
function bareWorld(seed = 3): World {
  const w = new World(seed, CONFIG.map.playerCap, CONFIG.zone);
  w.map.islands.length = 0;
  w.map.heightRaster = flatRaster();
  return w;
}

function place(w: World, id: string, x: number, y: number, heading = 0, hull: ShipClassId = 'torpedoBoat'): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), 'captain', hull, undefined, undefined);
  fitClassWeapons(w, rec);
  rec.state = { x, y, heading, speed: 0 };
  return rec;
}

/** Set a full, valid InputMsg on a ship (fireSeq 0 ⇒ no click by default). */
function setInput(ship: ShipRecord, patch: Partial<InputMsg>): void {
  ship.input = { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0, held: false, ...patch };
}

/** Fire `slot` at (aim, aimDist) and step until the shell BURSTS or is
 *  INTERCEPTED; return every event kind seen and the resolution tick's clock. */
function fireUntilStop(w: World, firer: ShipRecord, slot: number, aim: number, aimDist: number, maxTicks = 120): { seen: GameEvent[]; at: number } {
  setInput(firer, { aim, aimDist, slot, fireSeq: (firer.input?.fireSeq ?? 0) + 1, seq: 2 });
  const seen: GameEvent[] = [];
  for (let i = 0; i < maxTicks; i++) {
    w.step();
    seen.push(...w.tickEvents);
    if (seen.some((e) => e.k === 'burst' || e.k === 'boom')) return { seen, at: w.now };
  }
  return { seen, at: w.now };
}

const kinds = (events: readonly GameEvent[]): string[] => events.map((e) => e.k);

/** A Battleship at the origin holding ONE FOULING SHELL copy, aimed east. */
function armed(w: World, id = 'a'): ShipRecord {
  const a = place(w, id, 0, 0, 0, 'battleship');
  w.applyCard(a, 'foulingShell');
  expect(a.loadout[SLOT]).toEqual({ equipmentId: 'foulingShell', state: { n: 1, reloadMsLeft: 0 } });
  return a;
}

/** Drop a foul zone straight into world state (the burn-zone injection idiom). */
function injectZone(w: World, id: string, ownerId: string, x: number, y: number, r: number = FS.radius, until = 999_999_999): void {
  w.foulZones.set(id, { id, ownerId, x, y, r, until });
}

/** Run `ship` at full throttle for `ticks` and return its speed — the cap the
 *  World's own kinematics fold applied, read where it shows. */
function plateau(w: World, ship: ShipRecord, ticks = 80): number {
  setInput(ship, { throttle: 1 });
  for (let i = 0; i < ticks; i++) w.step();
  return ship.state.speed;
}

describe('FOULING SHELL — the shell and its zone (amendments 61, 67)', () => {
  it('bursts at the click: a zone with r / until from CONFIG at the burst point, `sp` to the firer, no damage, no `hc`, one copy spent', () => {
    const w = bareWorld();
    const a = armed(w);
    const b = place(w, 'b', 500, 0, Math.PI / 2); // 100 u from the burst point, beam-on
    const { seen, at } = fireUntilStop(w, a, SLOT, 0, 400);
    expect(kinds(seen)).toContain('burst');
    expect(kinds(seen)).toContain('sp'); // a zero-damage burst resolves no victim
    expect(kinds(seen)).not.toContain('hc');
    expect(kinds(seen)).not.toContain('dmg');
    expect(b.hp).toBe(b.stats.maxHp);
    expect(w.foulZones.size).toBe(1);
    const zone = [...w.foulZones.values()][0];
    expect(zone.id).toBe('fz1');
    expect(zone.ownerId).toBe('a');
    expect(zone.x).toBeCloseTo(400, 6);
    expect(zone.y).toBeCloseTo(0, 6);
    expect(zone.r).toBe(FS.radius);
    expect(zone.until).toBe(at + FS.durationMs);
    expect(w.litZones.size).toBe(0); // no light...
    expect(w.burnZones.size).toBe(0); // ...no fire
    expect(a.loadout[SLOT]).toEqual({ equipmentId: null, state: null }); // ONE SPEND
    expect(a.cards).not.toContain('foulingShell');
  });

  it('the shell is the flash\'s shape: clamped at its own reach dial (Story 9.8, ruling 125), zero damage both ways, the hull|decoy mask, the `foul` tag from CONFIG', () => {
    const w = bareWorld();
    const a = armed(w);
    setInput(a, { aim: Math.PI, aimDist: 5000, slot: SLOT, fireSeq: 1, seq: 2 });
    expect(w.sinkingActivationGate(a, SLOT)).toEqual({ ok: true });
    const shell = [...w.shells.values()][0];
    expect(shell.targetX).toBeCloseTo(-FS.rangeU, 6); // CONFIG.foulingShell.rangeU, never radarRange
    expect(FS.rangeU).toBeLessThan(a.stats.radarRange);
    expect(shell.foul).toEqual({ radius: FS.radius, durationMs: FS.durationMs });
    expect(shell.damage).toBe(0);
    expect(shell.contactDamage).toBe(0);
    expect(shell.burstRadius).toBe(FS.radius);
    expect(shell.hits).toEqual(FS.hits);
    expect(shell.family).toBe('cannon');
    expect('lit' in shell).toBe(false);
    expect('burn' in shell).toBe(false);
  });

  it('an interception en route spawns the zone at the STOP POINT with 0 damage to the interceptor', () => {
    const w = bareWorld();
    const a = armed(w);
    const mid = place(w, 'mid', 300, 0, 0); // bodyblocks the flight to (650, 0)
    place(w, 'far', 650, 0, Math.PI / 2); // the clicked point — never reached
    const { seen, at } = fireUntilStop(w, a, SLOT, 0, 650);
    expect(kinds(seen)).toContain('boom');
    expect(kinds(seen)).not.toContain('burst');
    expect(kinds(seen)).not.toContain('dmg');
    expect(mid.hp).toBe(mid.stats.maxHp);
    expect(w.foulZones.size).toBe(1);
    const zone = [...w.foulZones.values()][0];
    expect(Math.abs(zone.x - mid.state.x)).toBeLessThanOrEqual(mid.cls.hull.length / 2 + FS.shellRadius); // at the hull, not the click
    expect(zone.until).toBe(at + FS.durationMs);
  });

  it('expires at `until` and not before; the stamp it left outlives it by the linger', () => {
    const w = bareWorld();
    const b = place(w, 'b', 400, 0);
    const until = w.now + 20 * DT;
    injectZone(w, 'fz1', 'x', 400, 0, FS.radius, until);
    while (w.now < until - DT) w.step();
    expect(w.foulZones.size).toBe(1); // alive one tick before `until`...
    expect(b.fouledUntil).toBe(w.now + FS.lingerMs);
    w.step();
    // ...the tick `now` reaches `until` still stamps (the burn zone's "through
    // its final tick" rule — the stamp row sits before the expiry sweep), and
    // the sweep then drops the zone.
    expect(w.now).toBe(until);
    expect(w.foulZones.size).toBe(0);
    expect(b.fouledUntil).toBe(until + FS.lingerMs);
    w.step();
    expect(b.fouledUntil).toBe(until + FS.lingerMs); // nothing refreshes it now
  });

  it('with damage OFF (the pre-start phases) the zone spawns and draws but stamps NOBODY', () => {
    const w = bareWorld();
    w.damageEnabled = false;
    const a = armed(w);
    const b = place(w, 'b', 420, 0);
    const { seen } = fireUntilStop(w, a, SLOT, 0, 400);
    expect(kinds(seen)).toContain('burst');
    expect(w.foulZones.size).toBe(1);
    for (let i = 0; i < 5; i++) w.step();
    expect(b.fouledUntil).toBe(0);
    expect(buildFrame(w, 'b').foulZones?.length).toBe(1); // ...it still reaches the client
    expect('fouledUntil' in buildFrame(w, 'b').you!).toBe(false);
  });
});

describe('FOULING SHELL — who is stamped: the OUTLINE rule (amendment 62), owner, drone, sinking', () => {
  it('an enemy whose centre is OUTSIDE the rim but whose bow reaches 10 u inside it is stamped; the same hull beam-on at the same centre is not', () => {
    const w = bareWorld();
    injectZone(w, 'fz1', 'x', 400, 0);
    const bowIn = place(w, 'bowIn', 400 + FS.radius + 10, 0, Math.PI); // centre 160 u out, bow (half length 50) 10 u inside
    const beamOn = place(w, 'beamOn', 400, FS.radius + 10, 0); // centre 160 u out, side-on: nothing closer than 160
    w.step();
    expect(bowIn.fouledUntil).toBe(w.now + FS.lingerMs);
    expect(beamOn.fouledUntil).toBe(0);
    // ...and the centre rule would have got both wrong: the centre of each is
    // exactly the same distance from the centre of the zone.
  });

  it('the OWNER inside its own zone is stamped exactly like an enemy (Eric: it slows you)', () => {
    const w = bareWorld();
    const a = armed(w);
    fireUntilStop(w, a, SLOT, 0, 400);
    expect(a.fouledUntil).toBe(0); // 400 u away at the burst
    a.state.x = 400; // sails into it
    w.step();
    expect(a.fouledUntil).toBe(w.now + FS.lingerMs);
  });

  it('a PvE fleet drone inside is stamped (a drone is a ship)', () => {
    const w = bareWorld();
    injectZone(w, 'fz1', 'x', 400, 0);
    const d = w.addShip('d', 'DRONE', 'fleet', droneHullOf('medium'), DEFAULT_HORN_ID, { x: 420, y: 10 });
    w.step();
    expect(d.fouledUntil).toBe(w.now + FS.lingerMs);
  });

  it('a SINKING hull inside is not stamped, and its stale stamp is never refreshed', () => {
    const w = bareWorld();
    injectZone(w, 'fz1', 'x', 400, 0);
    const s = place(w, 's', 400, 0);
    w.respawnEnabled = false;
    w.sinkShip('s');
    expect(isSinking(s.lifecycle)).toBe(true);
    w.step();
    expect(s.fouledUntil).toBe(0);
    s.fouledUntil = 123; // a stamp carried into the window...
    w.step();
    expect(s.fouledUntil).toBe(123); // ...is left exactly as it was
  });
});

describe('FOULING SHELL — the stamp refreshes, lingers, never stacks (amendment 64)', () => {
  it('refreshes to now + lingerMs EVERY tick inside; after leaving it holds the last inside tick\'s stamp and the slow ends then', () => {
    const w = bareWorld();
    injectZone(w, 'fz1', 'x', 400, 0);
    const b = place(w, 'b', 400, 0);
    for (let i = 0; i < 10; i++) {
      w.step();
      expect(b.fouledUntil).toBe(w.now + FS.lingerMs);
    }
    const t0 = w.now;
    b.state.x = 2000; // gone
    for (let i = 0; i < 3; i++) w.step();
    expect(b.fouledUntil).toBe(t0 + FS.lingerMs);
    // The slow is on until exactly then: the cap reads ×slowFactor before, ×1 after.
    const cap = b.stats.kinematics.maxSpeed;
    const ticksLeft = Math.floor((b.fouledUntil - w.now) / DT) - 2; // run out the linger, not past it
    expect(plateau(w, b, ticksLeft)).toBeCloseTo(cap * FS.slowFactor, 1);
    expect(w.now).toBeLessThan(b.fouledUntil);
    while (w.now < b.fouledUntil + 5000) w.step(); // the linger lapses and the hull works back up
    expect(b.state.speed).toBeCloseTo(cap, 1);
  });

  it('two overlapping zones hold the factor at ONE slowFactor and the stamp at ONE linger; a second shell on the spot only re-stamps', () => {
    const w = bareWorld();
    const single = place(w, 'single', 400, 0);
    const double = place(w, 'double', 400, 3000);
    injectZone(w, 'fz1', 'x', 400, 0);
    injectZone(w, 'fz2', 'x', 400, 3000);
    injectZone(w, 'fz3', 'y', 420, 3000); // a second, overlapping zone of another firer
    w.step();
    expect(double.fouledUntil).toBe(w.now + FS.lingerMs);
    expect(single.fouledUntil).toBe(double.fouledUntil);
    // The caps: both hulls plateau at the SAME speed — one factor, not two.
    setInput(single, { throttle: 1 });
    setInput(double, { throttle: 1 });
    for (let i = 0; i < 80; i++) w.step();
    expect(double.state.speed).toBeCloseTo(single.state.speed, 9);
    expect(double.state.speed).toBeCloseTo(double.stats.kinematics.maxSpeed * FS.slowFactor, 1);
    expect(double.state.speed).toBeGreaterThan(double.stats.kinematics.maxSpeed * FS.slowFactor * FS.slowFactor + 1);
    // A second SHELL bursting on a stamped hull: the stamp is still one linger.
    const w2 = bareWorld();
    const a = armed(w2);
    const b = place(w2, 'b', 400, 0);
    fireUntilStop(w2, a, SLOT, 0, 400);
    w2.step();
    expect(b.fouledUntil).toBe(w2.now + FS.lingerMs);
    w2.applyCard(a, 'foulingShell');
    fireUntilStop(w2, a, SLOT, 0, 400);
    expect(w2.foulZones.size).toBe(2);
    w2.step();
    expect(b.fouledUntil).toBe(w2.now + FS.lingerMs); // never longer than one linger
  });

  it('shell × mine MULTIPLY through tickKinematics: 0.55 × 0.75 while both run; the shell\'s 0.75 alone once the mine window lapses', () => {
    const w = bareWorld();
    const b = place(w, 'b', 0, 0);
    injectZone(w, 'fz1', 'x', 0, 0, 5000); // a zone the hull cannot leave while it runs
    const mineFactor = 0.55; // the FOULING MINES tier-V depth (amendment 81), as the blast stamps it
    b.slowFactor = mineFactor;
    b.slowedUntil = Number.MAX_SAFE_INTEGER;
    const cap = b.stats.kinematics.maxSpeed;
    const both = plateau(w, b, 100);
    expect(both).toBeLessThanOrEqual(cap * mineFactor * FS.slowFactor + 1e-9);
    expect(both).toBeCloseTo(cap * mineFactor * FS.slowFactor, 1); // 0.4125 × cap
    expect(w.now).toBeLessThan(b.fouledUntil);
    b.slowedUntil = 0; // the mine window lapses; the zone is still under the hull
    const shellOnly = plateau(w, b, 100);
    expect(shellOnly).toBeLessThanOrEqual(cap * FS.slowFactor + 1e-9);
    expect(shellOnly).toBeCloseTo(cap * FS.slowFactor, 1);
  });
});

describe('FOULING SHELL — the wire: `fouledUntil` is VICTIM-PRIVATE and omitted when inactive', () => {
  it('rides `you` iff in the future; never a contact; never a spectator payload', () => {
    const w = bareWorld();
    injectZone(w, 'fz1', 'x', 400, 0);
    const b = place(w, 'b', 400, 0);
    place(w, 'watcher', 400, 300); // sees b as a contact (300 u, inside sight), its outline 250 u clear of the rim
    expect('fouledUntil' in buildFrame(w, 'b').you!).toBe(false); // not yet stamped — key absent, never 0
    w.step();
    expect(buildFrame(w, 'b').you!.fouledUntil).toBe(b.fouledUntil);
    const fw = buildFrame(w, 'watcher');
    const contact = fw.contacts.find((c) => c.id === 'b')!;
    expect(contact).toBeDefined();
    expect('fouledUntil' in contact).toBe(false);
    expect('fouledUntil' in fw.you!).toBe(false); // the watcher itself is clear of the zone
    expect(JSON.stringify(buildFrame(w, 'b', 'finished'))).not.toContain('fouledUntil');
    b.state.x = 2000;
    while (w.now < b.fouledUntil) w.step();
    expect(b.fouledUntil).toBeGreaterThan(0); // the record keeps the lapsed stamp...
    expect('fouledUntil' in buildFrame(w, 'b').you!).toBe(false); // ...the wire omits it
  });
});

describe('FOULING SHELL — resets: match start and every life boundary where `slowedUntil` resets', () => {
  it('resetForMatchStart clears every zone and every hull\'s stamp', () => {
    const w = bareWorld();
    const a = place(w, 'a', 400, 0);
    const b = place(w, 'b', 400, 20);
    injectZone(w, 'fz1', 'a', 400, 0);
    w.step();
    expect(a.fouledUntil).toBeGreaterThan(w.now);
    expect(b.fouledUntil).toBeGreaterThan(w.now);
    w.resetForMatchStart();
    expect(w.foulZones.size).toBe(0);
    expect(a.fouledUntil).toBe(0);
    expect(b.fouledUntil).toBe(0);
  });

  it('a fresh hull starts at 0; founder zeroes it (sink-entry keeps it — a hull that sinks fouled sinks fouled); respawn re-zeroes it', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    expect(a.fouledUntil).toBe(0);
    a.fouledUntil = w.now + 60_000;
    a.slowedUntil = w.now + 60_000;
    w.respawnEnabled = false; // founder first, respawn on its own below
    w.sinkShip('a');
    expect(a.fouledUntil).toBeGreaterThan(0); // kept through the window, like slowedUntil
    while (isSinking(a.lifecycle)) w.step();
    expect(isAfloat(a.lifecycle)).toBe(false);
    expect(a.fouledUntil).toBe(0); // founder
    expect(a.slowedUntil).toBe(0);
    a.fouledUntil = 1; // a stale mark planted on the wreck...
    a.respawnAt = w.now + DT; // ...armed by hand (sink-entry arms it when respawns are on)
    while (!isAfloat(a.lifecycle)) w.step(); // ...respawn
    expect(a.fouledUntil).toBe(0);
  });
});
