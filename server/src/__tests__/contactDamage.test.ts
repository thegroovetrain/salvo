// RAMMING AND CONTACT DAMAGE, end to end (Story 9.5, Eric rulings 2026-10-11 /
// 2026-10-12, epic-9 amendments 25 and 73–82): hulls are SOLID — the shared
// resolver pushes overlapping pairs apart by mass share in the
// `resolveHullContacts` row — and contact costs hp through the ONE damage gate
// as source 'contact' in the `applyContactDamage` row: a once-per-contact HIT
// on the closing speed over the allowance, a per-second GRIND on the sliding
// speed pooled into whole hp, the land strike on the `landContact` edge and
// the land scrape while pressed. DAMAGE CUT and SHIELD BLOCK apply like any
// damage (amendment 75); a wreck is solid and unharmed while the live hull
// pays (amendment 82); a mutual ram credits both; the weapons-safe gate holds.
//
// Every number here is read from CONFIG and the shared contact functions —
// the calibration sentences themselves (200 / 5 per second / 50) are pinned
// in shared/src/__tests__/contact.test.ts; this file asserts that the world
// hands the gate exactly what those functions price.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  DEFAULT_HORN_ID,
  contactGrindRate,
  contactHitDamage,
  droneHullOf,
  groundingSpeedFactor,
  isAfloat,
  isSinking,
  landHitDamage,
  type DamageEvent,
  type GameEvent,
  type InputMsg,
  type ShipClassId,
  type SunkEvent,
} from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { fitClassWeapons } from './classWeapons.js';
import { circleIsland, flatRaster } from './islandFixture.js';

const DT = CONFIG.tick.simDtMs / 1000;
const RAM = CONFIG.ram;

/** Islands cleared and the raster flattened: open water. */
function bareWorld(seed = 3): World {
  const w = new World(seed, CONFIG.map.playerCap, CONFIG.zone);
  w.map.islands.length = 0;
  w.map.heightRaster = flatRaster();
  return w;
}

function place(w: World, id: string, x: number, y: number, heading = 0, hull: ShipClassId = 'torpedoBoat'): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), 'captain', hull, undefined, undefined);
  fitClassWeapons(w, rec);
  pose(rec, x, y, heading, 0);
  return rec;
}

/** A PvE drone registered with the fleet controller at an exact pose. */
function drone(w: World, id: string, x: number, y: number, heading: number, speed: number): ShipRecord {
  const rec = w.addShip(id, 'DRONE', 'fleet', droneHullOf('medium'), DEFAULT_HORN_ID, { x, y });
  w.drones.add(id, 'medium', 1, { x: 0, y: 0 });
  pose(rec, x, y, heading, speed);
  return rec;
}

/** Mutate the pose in place (the record's state object is what the world's
 *  cached contact body aliases). */
function pose(rec: ShipRecord, x: number, y: number, heading: number, speed: number): void {
  rec.state.x = x;
  rec.state.y = y;
  rec.state.heading = heading;
  rec.state.speed = speed;
}

function setInput(ship: ShipRecord, patch: Partial<InputMsg>): void {
  ship.input = { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0, held: false, ...patch };
}

/** Full ahead at the hull's rated max — the speed the kinematics hold. */
function fullAhead(rec: ShipRecord, heading: number): void {
  rec.state.heading = heading;
  rec.state.speed = rec.stats.kinematics.maxSpeed;
  setInput(rec, { throttle: 1 });
}

const dmgOf = (events: readonly GameEvent[], id: string): DamageEvent[] =>
  events.filter((e): e is DamageEvent => e.k === 'dmg' && e.id === id);
const sunkOf = (events: readonly GameEvent[]): SunkEvent[] => events.filter((e): e is SunkEvent => e.k === 'sunk');

/** Step until `pred` holds or `max` ticks pass; returns the tick's events (the
 *  world's own `tickEvents`) and how many ticks were stepped. */
function stepUntil(w: World, pred: () => boolean, max = 40): { events: GameEvent[]; ticks: number } {
  for (let i = 1; i <= max; i++) {
    w.step();
    if (pred()) return { events: [...w.tickEvents], ticks: i };
  }
  return { events: [...w.tickEvents], ticks: max };
}

/** Two speedboats bow to bow on the x axis, `gap` u between the tips, each
 *  full ahead at the other. The closing speed is the sum of the two rated
 *  maxima along the line of centres. */
function headOnPair(w: World, gap = 20): { a: ShipRecord; b: ShipRecord; vn: number } {
  const half = 50; // the torpedoBoat silhouette runs ±50 u bow to stern
  const a = place(w, 'a', -(half + gap / 2), 0);
  const b = place(w, 'b', half + gap / 2, 0);
  fullAhead(a, 0);
  fullAhead(b, Math.PI);
  return { a, b, vn: a.stats.kinematics.maxSpeed + b.stats.kinematics.maxSpeed };
}

describe('the once-per-contact HIT (amendments 25, 73)', () => {
  it('two speedboats driven head-on each lose exactly contactHitDamage(mA, mB, closing).a with one dmg each, and the next tick deals no hit', () => {
    const w = bareWorld();
    const { a, b, vn } = headOnPair(w);
    const expected = contactHitDamage(a.stats.maxHp, b.stats.maxHp, vn, RAM);
    expect(expected.a).toBeGreaterThan(0);
    const { events } = stepUntil(w, () => a.hp < a.stats.maxHp);
    expect(a.stats.maxHp - a.hp).toBe(expected.a);
    expect(b.stats.maxHp - b.hp).toBe(expected.b);
    expect(dmgOf(events, 'a').map((e) => e.amount)).toEqual([expected.a]);
    expect(dmgOf(events, 'b').map((e) => e.amount)).toEqual([expected.b]);
    expect(a.contactDamageTaken).toBe(expected.a);
    expect(a.lastDamageSrc).toBe('contact');
    // Still pressed bow to bow next tick (both still full ahead): the pair is
    // latched — no second hit, and the grind at zero sliding speed is nothing.
    const hpA = a.hp;
    const hpB = b.hp;
    w.step();
    expect(a.hp).toBe(hpA);
    expect(b.hp).toBe(hpB);
    expect(dmgOf(w.tickEvents, 'a')).toEqual([]);
  });

  it('the pair re-arms after one separated tick: a second overlap over the allowance hits again', () => {
    const w = bareWorld();
    const { a, b, vn } = headOnPair(w);
    const expected = contactHitDamage(a.stats.maxHp, b.stats.maxHp, vn, RAM).a;
    stepUntil(w, () => a.hp < a.stats.maxHp);
    expect(a.stats.maxHp - a.hp).toBe(expected);
    a.hp = a.stats.maxHp; // refilled, so the second blow is not clamped by what is left
    b.hp = b.stats.maxHp;
    // Separate for one tick (b lifted clear of the line), then put it back on
    // the bow with the same closing speed.
    const bx = b.state.x;
    pose(b, bx, 500, Math.PI, b.stats.kinematics.maxSpeed);
    w.step();
    expect(a.hp).toBe(a.stats.maxHp);
    // On a's own line (the first push may have slid both hulls sideways off
    // y = 0 — a tip-to-tip escape is sideways), so the line of centres and the
    // velocities are collinear and the closing speed is exactly the sum.
    pose(b, a.state.x + 100 + 2, a.state.y, Math.PI, b.stats.kinematics.maxSpeed);
    stepUntil(w, () => a.hp < a.stats.maxHp, 3);
    expect(a.stats.maxHp - a.hp).toBe(expected);
  });

  it('a closing speed at or under the allowance arms the latch without damage — a later faster push WITHOUT separation never hits', () => {
    const w = bareWorld();
    // Tips 2 u into each other from the start, each creeping ahead at 40 % of
    // the allowance (held by the throttle) — closing at 80 % of it.
    const a = place(w, 'a', -49, 0);
    const b = place(w, 'b', 49, 0, Math.PI);
    const slow = RAM.allowanceU * 0.4;
    pose(a, -49, 0, 0, slow);
    pose(b, 49, 0, Math.PI, slow);
    setInput(a, { throttle: slow / a.stats.kinematics.maxSpeed });
    setInput(b, { throttle: slow / b.stats.kinematics.maxSpeed });
    expect(contactHitDamage(a.stats.maxHp, b.stats.maxHp, slow * 2, RAM)).toEqual({ a: 0, b: 0 });
    for (let i = 0; i < 3; i++) w.step(); // overlapping every tick, closing under the allowance
    expect(a.hp).toBe(a.stats.maxHp);
    expect(b.hp).toBe(b.stats.maxHp);
    // Now shove at full speed while still pressed: latched, so no hit.
    fullAhead(a, 0);
    fullAhead(b, Math.PI);
    for (let i = 0; i < 5; i++) w.step();
    expect(a.hp).toBe(a.stats.maxHp);
    expect(b.hp).toBe(b.stats.maxHp);
  });
});

describe('the GRIND pool (amendments 25, 81 — whole hp as the fraction crosses integers)', () => {
  it('a hull sliding abeam of a stopped hull accrues contactGrindRate × dt per tick each side and lands whole hp from the pool', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 7); // 2 u into b's beam at the widest station
    const b = place(w, 'b', 0, 0);
    setInput(a, { throttle: 1 });
    const vt = a.stats.kinematics.maxSpeed;
    const rate = contactGrindRate(a.stats.maxHp, b.stats.maxHp, vt, RAM);
    expect(rate.a).toBeGreaterThan(0);
    const ticks = 12;
    for (let i = 0; i < ticks; i++) {
      // Re-pin the abeam geometry before every tick: after this tick's
      // kinematics a sits exactly abeam (dx 0), so the contact normal is the
      // beam line and the whole relative speed is SLIDING (vn 0, vt = speed).
      pose(a, -vt * DT, 7, 0, vt);
      pose(b, 0, 0, 0, 0);
      w.step();
      expect(a.grindPool).toBeGreaterThanOrEqual(0);
      expect(a.grindPool).toBeLessThan(1);
      expect(Number.isInteger(a.hp)).toBe(true);
      for (const e of dmgOf(w.tickEvents, 'a')) expect(Number.isInteger(e.amount) && e.amount >= 1).toBe(true);
    }
    const lostA = a.stats.maxHp - a.hp;
    const lostB = b.stats.maxHp - b.hp;
    expect(lostA + a.grindPool).toBeCloseTo(rate.a * DT * ticks, 6);
    expect(lostB + b.grindPool).toBeCloseTo(rate.b * DT * ticks, 6);
    expect(lostA).toBeGreaterThan(0);
    expect(lostA).toBe(lostB); // equal masses, equal shares
    expect(a.contactDamageTaken).toBe(lostA);
  });
});

describe('LAND (amendment 81: the strike on the edge, the scrape while pressed, a parked hull pays nothing)', () => {
  /** A coast at x = 200 (a circle island to the east of the origin). */
  function coastWorld(): World {
    const w = bareWorld();
    w.map.islands.push(circleIsland(300, 0, 100));
    return w;
  }

  it('a hull driven dead-on into a coast loses landHitDamage(maxHp, speed × headOn) on the edge, no killer, and the grounding cap holds', () => {
    const w = coastWorld();
    const a = place(w, 'a', 140, 0);
    fullAhead(a, 0);
    const speed = a.state.speed;
    const { events } = stepUntil(w, () => a.landContact);
    expect(a.landHeadOn).toBeGreaterThan(0.9);
    const expected = landHitDamage(a.stats.maxHp, speed * a.landHeadOn, RAM);
    expect(expected).toBeGreaterThan(0);
    expect(a.stats.maxHp - a.hp).toBe(expected);
    expect(dmgOf(events, 'a').map((e) => e.amount)).toEqual([expected]);
    expect(a.landDamageTaken).toBe(expected);
    expect(a.contactDamageTaken).toBe(0);
    expect(a.damageFrom.size).toBe(0); // no attacker on the ledger
    expect(a.state.speed).toBeLessThanOrEqual(a.stats.kinematics.maxSpeed * groundingSpeedFactor(a.landHeadOn) + 1e-9);
    // Pressed on through the next ticks: no second strike (the edge fired
    // once); dead-on there is no sliding speed, so no scrape either.
    const hp = a.hp;
    for (let i = 0; i < 10; i++) w.step();
    expect(a.landContact).toBe(true);
    expect(a.hp).toBe(hp);
  });

  it('a grounding death has no killer: `sunk` without `by`', () => {
    const w = coastWorld();
    const a = place(w, 'a', 140, 0);
    fullAhead(a, 0);
    a.hp = 1;
    const { events } = stepUntil(w, () => isSinking(a.lifecycle));
    expect(sunkOf(events)).toEqual([expect.objectContaining({ k: 'sunk', id: 'a' })]);
    expect(sunkOf(events)[0].by).toBeUndefined();
    expect(a.lastDamageSrc).toBe('contact');
  });

  it('scraping along a coast bleeds the land grind as whole hp from its own pool', () => {
    const w = bareWorld();
    w.map.islands.push(circleIsland(0, 300, 200)); // coast along y = 100
    const a = place(w, 'a', -60, 94);
    fullAhead(a, 0.08); // along the coast, pressing gently into it
    for (let i = 0; i < 60; i++) {
      w.step();
      expect(a.landGrindPool).toBeLessThan(1);
      expect(Number.isInteger(a.hp)).toBe(true);
    }
    expect(a.landDamageTaken).toBeGreaterThan(0);
    expect(a.contactDamageTaken).toBe(0);
    expect(a.stats.maxHp - a.hp).toBe(a.landDamageTaken);
  });

  it('a parked hull against the coast takes nothing', () => {
    const w = coastWorld();
    const a = place(w, 'a', 151, 0); // bow 1 u into the coast, speed 0
    setInput(a, { throttle: 0 });
    w.step();
    expect(a.landContact).toBe(true); // pushed clear: contact, with no motion to price
    for (let i = 0; i < 40; i++) w.step();
    expect(a.hp).toBe(a.stats.maxHp);
    expect(a.landDamageTaken).toBe(0);
  });
});

describe('WRECKS, DRONES, the GATE and CREDIT', () => {
  it('a live hull into a sinking wreck: the wreck is pushed and unharmed, the live hull pays its share with no attacker credited (amendment 82)', () => {
    const w = bareWorld();
    const a = place(w, 'a', -70, 0);
    const b = place(w, 'b', 40, 0);
    w.sinkShip('b');
    expect(isSinking(b.lifecycle)).toBe(true);
    const sunkBefore = w.tickEvents.length; // (events are swapped per tick; the sink is pending now)
    fullAhead(a, 0);
    const expected = contactHitDamage(a.stats.maxHp, b.stats.maxHp, a.state.speed, RAM).a;
    const bx = b.state.x;
    const { events } = stepUntil(w, () => a.hp < a.stats.maxHp);
    expect(a.stats.maxHp - a.hp).toBe(expected);
    expect(b.hp).toBe(0);
    expect(dmgOf(events, 'b')).toEqual([]);
    expect(b.state.x).toBeGreaterThan(bx); // shoved along by the ram
    expect(isSinking(b.lifecycle)).toBe(true);
    expect(sunkOf(events)).toEqual([]); // no second sink, and none of a's
    expect(b.damageDealt).toBe(0); // the wreck's captain is credited nothing
    expect(a.damageFrom.size).toBe(0);
    expect(sunkBefore).toBeGreaterThanOrEqual(0);
  });

  it('a captain ramming a drone: the drone takes its share and dies, the captain takes its share, a PvE kill is credited, the drone aggroed its rammer', () => {
    const w = bareWorld();
    const a = place(w, 'a', -60, 0);
    const d = drone(w, 'd1', 43, 0, Math.PI, 35);
    fullAhead(a, 0);
    expect(w.drones.targetOf('d1')).toBeNull();
    w.step();
    // The closing speed the resolver measured: both x-velocities after this
    // tick's kinematics (the contact row changes neither).
    const vn = a.state.speed * Math.cos(a.state.heading) - d.state.speed * Math.cos(d.state.heading);
    const hit = contactHitDamage(a.stats.maxHp, d.stats.maxHp, vn, RAM);
    expect(hit.b).toBeGreaterThanOrEqual(d.stats.maxHp); // the ruled 80 u/s drone row
    expect(a.stats.maxHp - a.hp).toBe(hit.a);
    expect(isSinking(d.lifecycle)).toBe(true);
    expect(sunkOf(w.tickEvents)).toEqual([expect.objectContaining({ id: 'd1', by: 'a' })]);
    expect(a.pveKills[d.hullId]).toBe(1);
    expect(w.drones.targetOf('d1')).toBe('a');
  });

  it('DAMAGE CUT and SHIELD BLOCK apply to a contact hit like any damage (amendment 75)', () => {
    // The cut: the blow is multiplied by the victim's factor and floored.
    const cutW = bareWorld();
    const { a, b, vn } = headOnPair(cutW);
    a.damageCutUntil = Number.MAX_SAFE_INTEGER;
    const nominal = contactHitDamage(a.stats.maxHp, b.stats.maxHp, vn, RAM);
    stepUntil(cutW, () => a.hp < a.stats.maxHp);
    expect(a.stats.maxHp - a.hp).toBe(Math.floor(nominal.a * a.stats.equipment.damageCut.factor));
    expect(b.stats.maxHp - b.hp).toBe(nominal.b); // b carries no cut
    // The shield: a block bigger than the blow eats it whole.
    const shW = bareWorld();
    const pair = headOnPair(shW);
    pair.a.shield = { hpLeft: nominal.a + 100, until: Number.MAX_SAFE_INTEGER };
    const { events } = stepUntil(shW, () => pair.b.hp < pair.b.stats.maxHp);
    expect(pair.a.hp).toBe(pair.a.stats.maxHp);
    expect(pair.a.shield).toEqual({ hpLeft: 100, until: Number.MAX_SAFE_INTEGER });
    expect(dmgOf(events, 'a').map((e) => e.amount)).toEqual([0]); // the absorbed blow still reports
  });

  it('damageEnabled false: the push still happens, no hp moves, nothing is reported', () => {
    const w = bareWorld();
    w.damageEnabled = false;
    const a = place(w, 'a', -45, 0);
    const b = place(w, 'b', 45, 0, Math.PI); // tips 10 u into each other, both stopped
    fullAhead(a, 0);
    fullAhead(b, Math.PI);
    const dist0 = b.state.x - a.state.x;
    w.step();
    expect(b.state.x - a.state.x).toBeGreaterThan(dist0 - 2 * a.state.speed * DT); // pushed apart against the closing
    expect(a.hp).toBe(a.stats.maxHp);
    expect(b.hp).toBe(b.stats.maxHp);
    expect(w.tickEvents.filter((e) => e.k === 'dmg')).toEqual([]);
    expect(a.lastDamageSrc).toBeNull();
  });

  it('a mutual kill credits both: each sinks `by` the other and each counts the kill', () => {
    const w = bareWorld();
    const { a, b, vn } = headOnPair(w);
    const hit = contactHitDamage(a.stats.maxHp, b.stats.maxHp, vn, RAM);
    a.hp = hit.a;
    b.hp = hit.b;
    const { events } = stepUntil(w, () => isSinking(a.lifecycle));
    expect(isSinking(b.lifecycle)).toBe(true);
    const sunk = sunkOf(events);
    expect(sunk.map((e) => [e.id, e.by]).sort()).toEqual([['a', 'b'], ['b', 'a']]);
    expect(a.kills).toBe(1);
    expect(b.kills).toBe(1);
  });
});

describe('SOLIDITY in a world step (the mass split) and the STEP_ORDER seat', () => {
  it('two stopped overlapping hulls are pushed apart by the other\'s mass share — the lighter hull moves farther', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0); // 250 hp
    const b = place(w, 'b', 0, 10, 0, 'battleship'); // 350 hp, 10 u into a's beam
    expect(b.stats.maxHp).toBeGreaterThan(a.stats.maxHp);
    w.step();
    const dA = -a.state.y; // a moved −y, b moved +y
    const dB = b.state.y - 10;
    expect(dA).toBeGreaterThan(0);
    expect(dB).toBeGreaterThan(0);
    expect(dA / dB).toBeCloseTo(b.stats.maxHp / a.stats.maxHp, 6);
    expect(a.hp).toBe(a.stats.maxHp); // no closing speed, no hit
    expect(b.hp).toBe(b.stats.maxHp);
    expect(isAfloat(a.lifecycle) && isAfloat(b.lifecycle)).toBe(true);
  });

  it('the hull pass sits immediately before the land pass and the damage row immediately after it, ahead of sampleWakes', () => {
    const names = World.STEP_ORDER.map((r) => r.name);
    const hull = names.indexOf('resolveHullContacts');
    expect(names[hull + 1]).toBe('resolveCollisions');
    expect(names[hull + 2]).toBe('applyContactDamage');
    expect(names[hull + 3]).toBe('sampleWakes');
  });
});
