// RAMMING AND CONTACT DAMAGE, end to end (Story 9.5, Eric rulings 2026-10-11 /
// 2026-10-12 / 2026-10-13, epic-9 amendments 25 and 73–83): hulls are SOLID —
// the shared resolver pushes overlapping pairs apart by mass share in the
// `resolveHullContacts` row — and contact costs hp through the ONE damage gate
// in the `applyContactDamage` row: a once-per-contact whole-hp HIT ('contact')
// on the closing speed over the allowance, whose LATCH ARMS ONLY ON A CHARGED
// HIT (amendment 83); a per-second BLEED ('grind') on sliding + pressing speed
// applied per tick as a fraction and reported in 500 ms windows, exactly as
// the phosphor burn; the land strike on the `landContact` edge and the land
// scrape on the sliding speed only. HUNKER (was DAMAGE CUT until Story 9.9) and SHIELD BLOCK apply like any
// damage (amendment 75); a wreck is solid and unharmed while the live hull
// pays — as HULL contact, never land (amendment 82); two fleet hulls push but
// do not hurt each other; a mutual ram credits both; the weapons-safe gate
// holds; a NaN mass prices as nothing.
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
  damageMultiplierFor,
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
/** Ticks in one DoT report window (500 ms at 20 Hz = 10). */
const WINDOW_TICKS = Math.round(500 / CONFIG.tick.simDtMs);

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
function drone(w: World, id: string, x: number, y: number, heading: number, speed: number, fleetId = 1): ShipRecord {
  const rec = w.addShip(id, 'DRONE', 'fleet', droneHullOf('medium'), DEFAULT_HORN_ID, { x, y });
  w.drones.add(id, 'medium', fleetId, { x: 0, y: 0 });
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

/** Step `n` ticks collecting every tick's events. */
function stepCollect(w: World, n: number): GameEvent[] {
  const out: GameEvent[] = [];
  for (let i = 0; i < n; i++) {
    w.step();
    out.push(...w.tickEvents);
  }
  return out;
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

/** One tick of the head-on BLEED on `a` (vt 0, vn the full closing speed). */
function pressBleedTick(a: ShipRecord, b: ShipRecord, vn: number): number {
  return contactGrindRate(a.stats.maxHp, b.stats.maxHp, 0, vn, RAM).a * DT;
}

/** A free head-on pair that has just taken its HIT: the tick it landed, the
 *  hit priced by the world's inputs, and the hp afterwards. (`lastDamageSrc`
 *  is no predicate here: the same tick's bleed re-stamps it 'grind'.) */
function landHit(w: World): { a: ShipRecord; b: ShipRecord; vn: number; hit: { a: number; b: number }; events: GameEvent[] } {
  const { a, b, vn } = headOnPair(w);
  const hit = contactHitDamage(a.stats.maxHp, b.stats.maxHp, vn, RAM);
  const { events } = stepUntil(w, () => a.stats.maxHp - a.hp >= 1);
  return { a, b, vn, hit, events };
}

/** Re-pin two speedboats bow to bow on the x axis, tips 2 u into each other,
 *  both at `speed` toward each other, before a tick: every tick's contact is
 *  then a pure head-on PRESS (vn = 2 × speed exactly, vt 0, the normal on the
 *  x axis). The pin undoes the push each tick, so the press is SUSTAINED —
 *  the free geometry glances off tip to tip within a few ticks (the sideways
 *  escape), which is real behaviour, not a defect, and no basis for a rate. */
function pinPress(a: ShipRecord, b: ShipRecord, speed: number): void {
  pose(a, -49, 0, 0, speed);
  pose(b, 49, 0, Math.PI, speed);
}

/** `n` pinned pressed ticks at `speed` each, collecting every tick's events. */
function stepPressed(w: World, a: ShipRecord, b: ShipRecord, speed: number, n: number): GameEvent[] {
  const out: GameEvent[] = [];
  for (let i = 0; i < n; i++) {
    pinPress(a, b, speed);
    w.step();
    out.push(...w.tickEvents);
  }
  return out;
}

/** Two speedboats, pinned pressed, full ahead, the hit already landed on the
 *  first tick: the pair, the closing speed and the priced hit. */
function pressedPair(w: World): { a: ShipRecord; b: ShipRecord; vn: number; hit: { a: number; b: number }; events: GameEvent[] } {
  const a = place(w, 'a', -49, 0);
  const b = place(w, 'b', 49, 0, Math.PI);
  setInput(a, { throttle: 1 });
  setInput(b, { throttle: 1 });
  const max = a.stats.kinematics.maxSpeed;
  const vn = 2 * max;
  const hit = contactHitDamage(a.stats.maxHp, b.stats.maxHp, vn, RAM);
  const events = stepPressed(w, a, b, max, 1);
  return { a, b, vn, hit, events };
}

describe('the once-per-contact HIT (amendments 25, 73) and ITS LATCH (amendment 83)', () => {
  it('two speedboats driven head-on each lose exactly contactHitDamage(mA, mB, closing).a with one immediate dmg each', () => {
    const w = bareWorld();
    const { a, b, hit, events } = landHit(w);
    expect(hit.a).toBeGreaterThan(0);
    // The same tick also bleeds (banked, not yet reported), so the hp drop is
    // the hit plus under one tick of bleed.
    expect(a.stats.maxHp - a.hp).toBeGreaterThanOrEqual(hit.a);
    expect(a.stats.maxHp - a.hp).toBeLessThan(hit.a + 1);
    expect(b.stats.maxHp - b.hp).toBeGreaterThanOrEqual(hit.b);
    expect(dmgOf(events, 'a').map((e) => e.amount)).toEqual([hit.a]);
    expect(dmgOf(events, 'b').map((e) => e.amount)).toEqual([hit.b]);
    expect(a.contactDamageTaken).toBeCloseTo(a.stats.maxHp - a.hp, 9);
    expect(a.lastContactWasLand).toBe(false);
    // Still pressed bow to bow next tick (both still full ahead): the pair is
    // latched — no second hit (no whole-hp blow, no immediate dmg).
    const hpA = a.hp;
    w.step();
    expect(hpA - a.hp).toBeLessThan(1);
    expect(dmgOf(w.tickEvents, 'a')).toEqual([]);
  });

  it('the pair re-arms after one separated tick: a second overlap over the allowance hits again', () => {
    const w = bareWorld();
    const { a, b, hit } = landHit(w);
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
    const { events } = stepUntil(w, () => a.hp < a.stats.maxHp, 3);
    expect(dmgOf(events, 'a').map((e) => e.amount)).toEqual([hit.a]);
  });

  it('(a) creeping in under the allowance never latches: ten pressed ticks deal no hit, and the shove that follows is charged once at that tick\'s closing speed', () => {
    const w = bareWorld();
    // Tips 2 u into each other from the start, each creeping ahead at 40 % of
    // the allowance (held by the throttle) — closing at 80 % of it.
    const a = place(w, 'a', -49, 0);
    const b = place(w, 'b', 49, 0, Math.PI);
    const slow = RAM.allowanceU * 0.4;
    setInput(a, { throttle: slow / a.stats.kinematics.maxSpeed });
    setInput(b, { throttle: slow / b.stats.kinematics.maxSpeed });
    const creepBleed = pressBleedTick(a, b, slow * 2);
    const events = stepPressed(w, a, b, slow, 10); // pressed every tick, closing under the allowance
    // Only the bleed of the creep — under one hp in total, no whole-hp blow,
    // and the bleed's one windowed report, never a strike's immediate dmg.
    expect(a.stats.maxHp - a.hp).toBeCloseTo(creepBleed * 10, 6);
    expect(a.stats.maxHp - a.hp).toBeLessThan(1);
    expect(dmgOf(events, 'a').length).toBeLessThanOrEqual(1);
    for (const e of dmgOf(events, 'a')) expect(e.amount).toBeLessThan(1);
    // Now shove at full speed while still pressed: NOT latched (amendment
    // 83), so the hit is charged at this tick's closing speed, exactly once.
    setInput(a, { throttle: 1 });
    setInput(b, { throttle: 1 });
    const max = a.stats.kinematics.maxSpeed;
    const hit = contactHitDamage(a.stats.maxHp, b.stats.maxHp, 2 * max, RAM);
    expect(hit.a).toBeGreaterThan(0);
    const before = a.hp;
    const shove = stepPressed(w, a, b, max, 1);
    expect(before - a.hp).toBeGreaterThanOrEqual(hit.a);
    expect(before - a.hp).toBeLessThan(hit.a + 1);
    // The whole-hp blow is the strike, exactly once; the creep's 500 ms bleed
    // window also closes this tick (under one hp), which is the burn's cadence.
    expect(dmgOf(shove, 'a').filter((e) => e.amount >= 1).map((e) => e.amount)).toEqual([hit.a]);
    expect(dmgOf(shove, 'b').filter((e) => e.amount >= 1).map((e) => e.amount)).toEqual([hit.b]);
    // ...and then latched: five more pressed ticks are bleed only.
    const after = a.hp;
    const more = stepPressed(w, a, b, max, 5);
    expect(after - a.hp).toBeCloseTo(pressBleedTick(a, b, 2 * max) * 5, 6);
    expect(more.filter((e) => e.k === 'dmg' && e.id === 'a' && e.amount >= 1)).toEqual([]);
  });
});

describe('the BLEED (amendment 83 — sliding + pressing speed, delivered like the burn)', () => {
  it('(b) a sustained head-on push bleeds both hulls at grindPerUnit × vn × share per second, hp fractional between windows, one dmg per 500 ms per victim', () => {
    const w = bareWorld();
    const { a, b, vn } = pressedPair(w);
    const max = a.stats.kinematics.maxSpeed;
    const tickA = pressBleedTick(a, b, vn);
    const tickB = contactGrindRate(a.stats.maxHp, b.stats.maxHp, 0, vn, RAM).b * DT;
    expect(tickA).toBeGreaterThan(0);
    const hpA = a.hp;
    const hpB = b.hp;
    const events = stepPressed(w, a, b, max, WINDOW_TICKS);
    expect(hpA - a.hp).toBeCloseTo(tickA * WINDOW_TICKS, 6);
    expect(hpB - b.hp).toBeCloseTo(tickB * WINDOW_TICKS, 6);
    expect(a.hp % 1).not.toBe(0); // fractional between windows, as the burn leaves it
    // The window opened on the hit tick and closes 500 ms later: ONE report
    // per victim across these ticks, carrying the whole window's bleed.
    const reportsA = dmgOf(events, 'a');
    expect(reportsA).toHaveLength(1);
    expect(reportsA[0].amount).toBeCloseTo(tickA * (WINDOW_TICKS + 1), 6);
    expect(reportsA[0].hp).toBe(Math.max(0, a.hp));
    expect(dmgOf(events, 'b')).toHaveLength(1);
    expect(a.contactDamageTaken).toBeCloseTo(a.stats.maxHp - a.hp, 9);
    expect(a.lastDamageSrc).toBe('grind');
  });

  it('a hull sliding abeam of a stopped hull bleeds contactGrindRate(vt, 0) × dt per tick each side — the scrape sentence', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 7); // 2 u into b's beam at the widest station
    const b = place(w, 'b', 0, 0);
    setInput(a, { throttle: 1 });
    const vt = a.stats.kinematics.maxSpeed;
    const rate = contactGrindRate(a.stats.maxHp, b.stats.maxHp, vt, 0, RAM);
    expect(rate.a).toBeGreaterThan(0);
    const ticks = 12;
    for (let i = 0; i < ticks; i++) {
      // Re-pin the abeam geometry before every tick: after this tick's
      // kinematics a sits exactly abeam (dx 0), so the contact normal is the
      // beam line and the whole relative speed is SLIDING (vn 0, vt = speed).
      pose(a, -vt * DT, 7, 0, vt);
      pose(b, 0, 0, 0, 0);
      w.step();
    }
    expect(a.stats.maxHp - a.hp).toBeCloseTo(rate.a * DT * ticks, 6);
    expect(b.stats.maxHp - b.hp).toBeCloseTo(rate.b * DT * ticks, 6);
    expect(a.hp).toBe(b.hp); // equal masses, equal shares
  });

  it('the bleed window flushes the moment the pair parts, and a lethal bleed reports before the sink with the other hull credited', () => {
    const w = bareWorld();
    const { a, b, vn } = pressedPair(w);
    const max = a.stats.kinematics.maxSpeed;
    const tickA = pressBleedTick(a, b, vn);
    // Part them after three more pressed ticks: the open window flushes at once.
    stepPressed(w, a, b, max, 3);
    pose(b, 49, 500, Math.PI, max);
    w.step();
    const flushed = dmgOf(w.tickEvents, 'a');
    expect(flushed).toHaveLength(1);
    expect(flushed[0].amount).toBeCloseTo(tickA * 4, 6);
    // A bleed that empties the hull sinks it `by` the other hull, its last
    // dmg landing ahead of the sunk.
    a.hp = a.stats.maxHp; // both refilled: the re-armed strike must sink neither
    b.hp = b.stats.maxHp;
    stepPressed(w, a, b, max, 1); // the re-armed strike
    expect(isAfloat(a.lifecycle)).toBe(true);
    a.hp = tickA / 2; // less than one tick of bleed left
    stepPressed(w, a, b, max, 1);
    expect(isSinking(a.lifecycle)).toBe(true);
    expect(a.lastDamageSrc).toBe('grind');
    const order = w.tickEvents.filter((e) => (e.k === 'dmg' && e.id === 'a') || e.k === 'sunk').map((e) => e.k);
    expect(order).toEqual(['dmg', 'sunk']);
    expect(sunkOf(w.tickEvents)).toEqual([expect.objectContaining({ id: 'a', by: 'b' })]);
    expect(b.kills).toBe(1);
  });

  // Re-based by Story 9.7 (epic-9 amendments 86–88 / 110–117): the cut is +armorBonus temporary
  // Armor inside K / (K + armor) — at Tier 0, Armor 5 → ×0.5 (Story 9.9: E 100 at K 100, still
  // ×0.5, amendment 144) — and a grind tick keeps its fraction.
  it('(c) under HUNKER the bleed takes the Armor multiplier exactly — never zero, and no dmg 0 spam', () => {
    const w = bareWorld();
    const a = place(w, 'a', -49, 0);
    const b = place(w, 'b', 49, 0, Math.PI);
    setInput(a, { throttle: 1 });
    setInput(b, { throttle: 1 });
    const max = a.stats.kinematics.maxSpeed;
    a.hunkerUntil = Number.MAX_SAFE_INTEGER;
    const factor = damageMultiplierFor(a.stats.armor + a.stats.equipment.hunker.armorBonus);
    expect(factor).toBeGreaterThan(0);
    expect(factor).toBeLessThan(1);
    stepPressed(w, a, b, max, 1); // the strike
    const hpA = a.hp;
    const hpB = b.hp;
    const events = stepPressed(w, a, b, max, WINDOW_TICKS * 2);
    const lossA = hpA - a.hp;
    const lossB = hpB - b.hp;
    expect(lossB).toBeGreaterThan(0);
    expect(lossA).toBeGreaterThan(0);
    expect(lossA).toBeCloseTo(lossB * factor, 6); // equal masses: b's bleed is the uncut rate
    const reports = dmgOf(events, 'a');
    expect(reports.length).toBeLessThanOrEqual(2);
    for (const e of reports) expect(e.amount).toBeGreaterThan(0);
  });

  it('(d) a SHIELD BLOCK absorbs the bleed: no hp moves while it holds, and the window still reports as dmg 0', () => {
    const w = bareWorld();
    const a = place(w, 'a', -49, 0);
    const b = place(w, 'b', 49, 0, Math.PI);
    setInput(a, { throttle: 1 });
    setInput(b, { throttle: 1 });
    const max = a.stats.kinematics.maxSpeed;
    const vn = 2 * max;
    const hit = contactHitDamage(a.stats.maxHp, b.stats.maxHp, vn, RAM);
    a.shield = { hpLeft: hit.a + 1000, until: Number.MAX_SAFE_INTEGER };
    const events = stepPressed(w, a, b, max, 1);
    expect(b.hp).toBeLessThan(b.stats.maxHp);
    expect(a.hp).toBe(a.stats.maxHp);
    expect(dmgOf(events, 'a').map((e) => e.amount)).toEqual([0]); // the absorbed strike still reports
    const tickA = pressBleedTick(a, b, vn);
    expect(a.shield!.hpLeft).toBeCloseTo(1000 - tickA, 6); // the strike and this tick's bleed, off the shield
    const later = stepPressed(w, a, b, max, WINDOW_TICKS);
    expect(a.hp).toBe(a.stats.maxHp);
    expect(a.shield!.hpLeft).toBeCloseTo(1000 - tickA * (WINDOW_TICKS + 1), 6);
    expect(dmgOf(later, 'a').map((e) => e.amount)).toEqual([0]); // one absorbed window, reported once
  });
});

describe('LAND (amendment 81: the strike on the edge, the scrape on the sliding speed, a pinned or parked hull pays nothing more)', () => {
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
    expect(a.stats.maxHp - a.hp).toBeCloseTo(expected, 6); // dead-on: no sliding, so no scrape rides along
    expect(dmgOf(events, 'a').map((e) => e.amount)).toEqual([expected]);
    expect(a.landDamageTaken).toBeCloseTo(expected, 6);
    expect(a.contactDamageTaken).toBe(0);
    expect(a.lastContactWasLand).toBe(true);
    expect(a.damageFrom.size).toBe(0); // no attacker on the ledger
    expect(a.state.speed).toBeLessThanOrEqual(a.stats.kinematics.maxSpeed * groundingSpeedFactor(a.landHeadOn) + 1e-9);
    // Pressed on through the next ticks: no second strike (the edge fired
    // once); dead-on there is no sliding speed, so no scrape either — a hull
    // pinned head-on against a rock does not bleed on its press.
    const hp = a.hp;
    for (let i = 0; i < 10; i++) w.step();
    expect(a.landContact).toBe(true);
    expect(a.hp).toBeCloseTo(hp, 6);
  });

  it('a grounding death has no killer: `sunk` without `by`, and it reads as land contact', () => {
    const w = coastWorld();
    const a = place(w, 'a', 140, 0);
    fullAhead(a, 0);
    a.hp = 1;
    const { events } = stepUntil(w, () => isSinking(a.lifecycle));
    expect(sunkOf(events)).toEqual([expect.objectContaining({ k: 'sunk', id: 'a' })]);
    expect(sunkOf(events)[0].by).toBeUndefined();
    expect(a.lastDamageSrc).toBe('contact');
    expect(a.lastContactWasLand).toBe(true);
  });

  it('scraping along a coast bleeds the land grind per tick as a fraction, reported in windows, tallied as land', () => {
    const w = bareWorld();
    w.map.islands.push(circleIsland(0, 300, 200)); // coast along y = 100
    const a = place(w, 'a', -60, 94);
    fullAhead(a, 0.08); // along the coast, pressing gently into it
    const events = stepCollect(w, 60);
    expect(a.landDamageTaken).toBeGreaterThan(0);
    expect(a.contactDamageTaken).toBe(0);
    expect(a.stats.maxHp - a.hp).toBeCloseTo(a.landDamageTaken, 9);
    expect(a.lastDamageSrc).toBe('grind');
    expect(a.lastContactWasLand).toBe(true);
    // Sixty ticks is three seconds: at most a handful of windowed reports,
    // never one per tick.
    expect(dmgOf(events, 'a').length).toBeLessThanOrEqual(7);
    expect(a.damageFrom.size).toBe(0);
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

describe('WRECKS, FLEET PAIRS, DRONES, the GATE and CREDIT', () => {
  it('(f) a live hull into a sinking wreck: the wreck is pushed and unharmed, the live hull pays its share with no attacker credited — as HULL contact, never land (amendment 82)', () => {
    const w = bareWorld();
    const a = place(w, 'a', -70, 0);
    const b = place(w, 'b', 40, 0);
    w.sinkShip('b');
    expect(isSinking(b.lifecycle)).toBe(true);
    fullAhead(a, 0);
    const expected = contactHitDamage(a.stats.maxHp, b.stats.maxHp, a.state.speed, RAM).a;
    const bx = b.state.x;
    const { events } = stepUntil(w, () => a.hp < a.stats.maxHp);
    expect(a.stats.maxHp - a.hp).toBeGreaterThanOrEqual(expected);
    expect(a.stats.maxHp - a.hp).toBeLessThan(expected + 1);
    expect(b.hp).toBe(0);
    expect(dmgOf(events, 'b')).toEqual([]);
    expect(b.state.x).toBeGreaterThan(bx); // shoved along by the ram
    expect(isSinking(b.lifecycle)).toBe(true);
    expect(sunkOf(events)).toEqual([]); // no second sink, and none of a's
    expect(b.damageDealt).toBe(0); // the wreck's captain is credited nothing
    expect(a.damageFrom.size).toBe(0);
    // The tally and the harness readouts: contact by a hull, not the coast.
    expect(a.contactDamageTaken).toBeCloseTo(a.stats.maxHp - a.hp, 9);
    expect(a.landDamageTaken).toBe(0);
    expect(a.lastContactWasLand).toBe(false);
  });

  it('(f) a death by wreck contact has no killer and still reads as hull contact (the harness classifies it sunkByContact, not ranAground)', () => {
    const w = bareWorld();
    const a = place(w, 'a', -70, 0);
    const b = place(w, 'b', 40, 0);
    w.sinkShip('b');
    fullAhead(a, 0);
    a.hp = 1;
    const { events } = stepUntil(w, () => isSinking(a.lifecycle));
    expect(sunkOf(events).map((e) => [e.id, e.by])).toEqual([['a', undefined]]);
    expect(a.lastDamageSrc).toBe('contact');
    expect(a.lastContactWasLand).toBe(false);
  });

  it('(g) two PvE fleet hulls are pushed apart but deal each other nothing — no hit, no bleed', () => {
    const w = bareWorld();
    const d1 = drone(w, 'd1', -45, 0, 0, 35, 1);
    const d2 = drone(w, 'd2', 45, 0, Math.PI, 35, 2); // a different fleet: still PvE on PvE
    setInput(d1, { throttle: 1 });
    setInput(d2, { throttle: 1 });
    const gap0 = d2.state.x - d1.state.x;
    const events = stepCollect(w, 5);
    expect(d2.state.x - d1.state.x).toBeGreaterThan(gap0 - 2 * 35 * DT * 5); // pushed apart against the closing
    expect(d1.hp).toBe(d1.stats.maxHp);
    expect(d2.hp).toBe(d2.stats.maxHp);
    expect(events.filter((e) => e.k === 'dmg')).toEqual([]);
    expect(d1.lastDamageSrc).toBeNull();
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
    expect(a.stats.maxHp - a.hp).toBeGreaterThanOrEqual(hit.a);
    expect(a.stats.maxHp - a.hp).toBeLessThan(hit.a + 1);
    expect(isSinking(d.lifecycle)).toBe(true);
    expect(sunkOf(w.tickEvents)).toEqual([expect.objectContaining({ id: 'd1', by: 'a' })]);
    expect(a.pveKills[d.hullId]).toBe(1);
    expect(w.drones.targetOf('d1')).toBe('a');
  });

  it('HUNKER and SHIELD BLOCK apply to a contact HIT like any damage (amendment 75)', () => {
    // The cut: the blow takes the victim's Armor + the cut's bonus (Story 9.7, epic-9
    // amendments 86–88 / 110–117) and is floored.
    const cutW = bareWorld();
    const { a, b, vn } = headOnPair(cutW);
    a.hunkerUntil = Number.MAX_SAFE_INTEGER;
    const nominal = contactHitDamage(a.stats.maxHp, b.stats.maxHp, vn, RAM);
    const { events } = stepUntil(cutW, () => a.stats.maxHp - a.hp >= 1);
    expect(dmgOf(events, 'a').map((e) => e.amount)).toEqual([
      Math.floor(nominal.a * damageMultiplierFor(a.stats.armor + a.stats.equipment.hunker.armorBonus)),
    ]);
    expect(dmgOf(events, 'b').map((e) => e.amount)).toEqual([nominal.b]); // b carries no cut
    // The shield: a block bigger than the blow eats it whole.
    const shW = bareWorld();
    const pair = headOnPair(shW);
    pair.a.shield = { hpLeft: nominal.a + 100, until: Number.MAX_SAFE_INTEGER };
    const shielded = stepUntil(shW, () => pair.b.hp < pair.b.stats.maxHp);
    expect(pair.a.hp).toBe(pair.a.stats.maxHp);
    expect(pair.a.shield!.hpLeft).toBeLessThanOrEqual(100); // the strike, then this tick's bleed
    expect(pair.a.shield!.hpLeft).toBeGreaterThan(99);
    expect(dmgOf(shielded.events, 'a').map((e) => e.amount)).toEqual([0]); // the absorbed blow still reports
  });

  it('a RAM between two hulls: each blow carries the OTHER hull\'s ARMOR PIERCING, read live (Story 9.9, epic-9 amendments 146–147 / 156)', () => {
    // A: Armor 20, AP 40. B: Armor 20, AP 0. A's blow on B is E 20 − 40 = −20
    // (amplified); B's blow on A is E 20 − 0 = 20 (reduced). Both floored.
    const w = bareWorld();
    const { a, b, vn } = headOnPair(w);
    w.applyCard(a, 'armor');
    w.applyCard(a, 'armorPiercing');
    w.applyCard(a, 'armorPiercing');
    w.applyCard(b, 'armor');
    expect([a.stats.armor, a.stats.armorPiercing, b.stats.armor, b.stats.armorPiercing]).toEqual([20, 40, 20, 0]);
    const nominal = contactHitDamage(a.stats.maxHp, b.stats.maxHp, vn, RAM);
    const { events } = stepUntil(w, () => a.stats.maxHp - a.hp >= 1);
    const blow = (n: number, e: number): number => Math.max(1, Math.floor(n * damageMultiplierFor(e)));
    expect(dmgOf(events, 'b').map((e) => e.amount)).toEqual([blow(nominal.b, b.stats.armor - a.stats.armorPiercing)]);
    expect(dmgOf(events, 'a').map((e) => e.amount)).toEqual([blow(nominal.a, a.stats.armor - b.stats.armorPiercing)]);
    expect(blow(nominal.b, -20)).toBeGreaterThan(blow(nominal.b, 20)); // the pierced side really is amplified
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

  it('(e) a hull the hit just sank is credited for no later blow: the survivor\'s bleed from that tick on names nobody', () => {
    const w = bareWorld();
    const { a, b, vn } = headOnPair(w);
    const hit = contactHitDamage(a.stats.maxHp, b.stats.maxHp, vn, RAM);
    a.hp = hit.a; // a sinks on the strike; b survives it
    stepUntil(w, () => isSinking(a.lifecycle));
    expect(isAfloat(b.lifecycle)).toBe(true);
    // The strike itself was one impact: b's share is credited to a.
    expect(a.damageDealt).toBe(hit.b);
    expect(b.damageFrom.has('a')).toBe(true);
    // The bleed of the same tick and every later pressed tick: a's wreck is
    // solid and b keeps paying, but a is credited nothing more.
    const dealtAtImpact = a.damageDealt;
    const hpB = b.hp;
    stepCollect(w, 5);
    expect(b.hp).toBeLessThan(hpB); // still bleeding against the wreck
    expect(a.damageDealt).toBe(dealtAtImpact);
    expect(b.lastContactWasLand).toBe(false);
  });

  it('(h) a NaN mass prices as nothing: no NaN ever reaches a hull\'s hp', () => {
    const w = bareWorld();
    const { a, b } = headOnPair(w);
    (a.stats as { maxHp: number }).maxHp = NaN;
    const events = stepCollect(w, 10);
    expect(Number.isFinite(a.hp)).toBe(true);
    expect(Number.isFinite(b.hp)).toBe(true);
    expect(b.hp).toBe(b.stats.maxHp);
    expect(events.filter((e) => e.k === 'dmg')).toEqual([]);
    expect(Number.isFinite(a.state.x) && Number.isFinite(b.state.x)).toBe(true);
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
    expect(a.hp).toBe(a.stats.maxHp); // no closing speed, no hit, no bleed
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
