// MULTI-SPECTRAL COUNTERMEASURE — the server half of Story 9.3 (Eric rulings
// 2026-10-11, epic-9 amendments 40–47; SMOKE SCREEN's 8.18 seat), re-cut by
// Story 9.3 session 2 (Eric 2026-10-12: "just draw it on top of ships" — the
// cloud is a CLIENT VISUAL OVERLAY; the server hides nothing):
//
//   • the PRESS: one copy makes ONE stationary cloud at the hull's CENTRE,
//     born now, deleted at now + lifeMs; a RE-PRESS makes a second full cloud
//     at the hull's new position (46); a SINKING press is refused `blocked`,
//     copy kept, and clouds already made live out their life (amendment 127);
//     a non-finite pose makes none;
//   • a cloud HIDES NOTHING: a fresh cloud between two hulls hides neither
//     (contacts, radar paints, the owner inside its own cloud alike);
//   • the `clouds` CHANNEL's own gate over the spray DISC (centre, radius
//     cloudOutlineRadius(age)): SIGHTED — the disc's nearest point within
//     sight with island LOS to it — or RADAR-DETECTED — the nearest point
//     within radar range, the beam across the disc's bearing span, the centre
//     shadow-visible; owner always, spectator always; the wire shape
//     `{id,x,y,t0}` and nothing else; gone the step it expires;
//   • the bot presses once on the way out and not again until its cloud
//     expires; resetForMatchStart clears the water.
//
// The perception FUZZ and its independent cloud oracle live in
// perception.test.ts; the bot drill in botTactics.test.ts.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  cloudOutlineRadius,
  consumableSlotFor,
  islandBlocksSegment,
  isSinking,
  wrapPositive,
  type FrameMsg,
  type GameEvent,
} from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { buildFrame } from '../game/frames.js';
import { circleIsland, flatRaster, rasterFrom, ridgeField } from './islandFixture.js';

const CM = CONFIG.countermeasure;
const DT = CONFIG.tick.simDtMs;
const KEY = consumableSlotFor('countermeasure')!;

type P = { x: number; y: number };

function bareWorld(seed = 1): World {
  const w = new World(seed, CONFIG.match.fillTo, CONFIG.zone);
  w.map.islands.length = 0;
  w.map.heightRaster = flatRaster();
  return w;
}

/** A torpedo-boat captain teleported to an exact pose (speed 0, beam parked). */
function place(w: World, id: string, x: number, y: number, heading = 0): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), 'captain', 'torpedoBoat', undefined, undefined);
  rec.state.x = x;
  rec.state.y = y;
  rec.state.heading = heading;
  rec.state.speed = 0;
  rec.sweepAngle = 0;
  rec.prevSweepAngle = 0;
  return rec;
}

/** Stock `n` copies in the countermeasure's fixed slot (production catalog). */
function stock(w: World, ship: ShipRecord, n = 1): void {
  for (let i = 0; i < n; i += 1) w.applyCard(ship, 'countermeasure');
}

/** Fire the slot through the ONE activation path. */
const press = (w: World, ship: ShipRecord): unknown => w.sinkingActivationGate(ship, KEY);

const copies = (ship: ShipRecord): number => ship.loadout[KEY].state?.n ?? 0;

/** Drop a cloud straight into the store (the injectMine posture): owned by
 *  `ownerId`, born at `bornAt` (fresh by default), alive for the full life. */
function injectCloud(w: World, id: string, ownerId: string, x: number, y: number, bornAt = w.now): void {
  w.clouds.set(id, { id, ownerId, x, y, bornAt, until: bornAt + CM.lifeMs });
}

function steps(w: World, n: number): void {
  for (let i = 0; i < n; i += 1) w.step(DT);
}

const contactIds = (f: FrameMsg): string[] => f.contacts.map((c) => c.id);
const eventsOf = (f: FrameMsg, k: string): GameEvent[] => f.events.filter((e) => e.k === k);
const cloudIds = (f: FrameMsg): string[] => (f.clouds ?? []).map((c) => c.id);

/** Open the observer's paint window around a bearing (without stepping). */
function windowAround(me: ShipRecord, brg: number, halfWidth = 0.02): void {
  me.prevSweepAngle = wrapPositive(brg - halfWidth);
  me.sweepAngle = wrapPositive(brg + halfWidth);
}

const O: P = { x: 0, y: 0 };

// ---------------------------------------------------------------------------
// The press
// ---------------------------------------------------------------------------

describe('COUNTERMEASURE — the press (rulings 43 / 46, amendment 127)', () => {
  it('one copy: spent at the press, ONE cloud at the hull\'s centre, born now, until now + life, the hull\'s own stamp advanced', () => {
    const w = bareWorld();
    const a = place(w, 'a', 30, -40, 1.2);
    stock(w, a, 1);
    const t0 = w.now;
    expect(press(w, a)).toEqual({ ok: true });
    expect(copies(a)).toBe(0); // the ONE SPEND LAW: a successful press costs the copy
    expect(a.cards.filter((c) => c === 'countermeasure')).toHaveLength(0);
    expect(w.clouds.size).toBe(1); // made AT the press, not on a later tick
    expect(w.cloudCount).toBe(1);
    const [cloud] = [...w.clouds.values()];
    expect(cloud.id).toMatch(/^cl\d+$/);
    expect(cloud).toMatchObject({ ownerId: 'a', x: 30, y: -40, bornAt: t0, until: t0 + CM.lifeMs });
    expect(a.cloudUntil).toBe(t0 + CM.lifeMs);
    steps(w, 40);
    expect(w.clouds.size).toBe(1); // nothing else drops: no trail, no cadence
  });

  it('the cloud lands on the hull\'s own position whatever the heading', () => {
    for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 3]) {
      const w = bareWorld();
      const a = place(w, 'a', 100, 100, heading);
      stock(w, a, 1);
      press(w, a);
      const [c] = [...w.clouds.values()];
      expect(c.x, `heading ${heading}`).toBe(a.state.x);
      expect(c.y, `heading ${heading}`).toBe(a.state.y);
    }
  });

  it('RE-PRESS 3 s later at a new position: a SECOND full cloud there; the first is untouched (no restart, no refusal — ruling 46)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    stock(w, a, 2);
    const t0 = w.now;
    press(w, a);
    steps(w, 60); // +3 s
    a.state.x = 120;
    a.state.y = -30;
    const t1 = w.now;
    expect(press(w, a)).toEqual({ ok: true });
    expect(copies(a)).toBe(0); // the second copy is SPENT
    const clouds = [...w.clouds.values()];
    expect(clouds).toHaveLength(2);
    expect(clouds[0]).toMatchObject({ x: 0, y: 0, bornAt: t0, until: t0 + CM.lifeMs });
    expect(clouds[1]).toMatchObject({ x: 120, y: -30, bornAt: t1, until: t1 + CM.lifeMs });
    expect(clouds[0].id).not.toBe(clouds[1].id);
    expect(a.cloudUntil).toBe(t1 + CM.lifeMs); // the stamp follows the most recent cloud
    // They die on their OWN clocks, oldest first.
    while (w.now < t0 + CM.lifeMs) steps(w, 1);
    expect(w.clouds.size).toBe(1);
    while (w.now < t1 + CM.lifeMs) steps(w, 1);
    expect(w.clouds.size).toBe(0);
  });

  it('a SINKING press is refused `blocked`, the copy kept, no cloud made; clouds already made live out their life past the hull (amendment 127)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    stock(w, a, 2);
    const t0 = w.now;
    press(w, a);
    expect(w.clouds.size).toBe(1);
    w.sinkShip('a');
    expect(isSinking(a.lifecycle)).toBe(true);
    expect(a.cloudUntil).toBe(0); // the own-cloud stamp dies with the life
    expect(press(w, a)).toEqual({ ok: false, reason: 'blocked' });
    expect(copies(a)).toBe(1);
    expect(a.cards.filter((c) => c === 'countermeasure')).toHaveLength(1);
    expect(w.clouds.size).toBe(1);
    steps(w, 120); // through the founder edge and the respawn — the cloud is still on the water
    expect(w.clouds.size).toBe(1);
    while (w.now < t0 + CM.lifeMs) steps(w, 1);
    expect(w.clouds.size).toBe(0); // deleted at exactly bornAt + lifeMs
  });

  it('a NON-FINITE position makes nothing: no NaN cloud ever enters the store', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    stock(w, a, 2);
    a.state.x = Number.NaN;
    press(w, a);
    expect(w.clouds.size).toBe(0);
    a.state.x = 0;
    press(w, a);
    expect(w.clouds.size).toBe(1);
    for (const c of w.clouds.values()) expect(Number.isFinite(c.x) && Number.isFinite(c.y)).toBe(true);
  });

  it('resetForMatchStart clears every cloud and every own-cloud stamp (the mines / decoys precedent)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    place(w, 'b', 900, 0);
    stock(w, a, 1);
    press(w, a);
    expect(w.clouds.size).toBe(1);
    expect(a.cloudUntil).toBeGreaterThan(w.now);
    w.resetForMatchStart();
    expect(w.clouds.size).toBe(0);
    expect(w.cloudCount).toBe(0);
    for (const s of w.ships.values()) expect(s.cloudUntil).toBe(0);
    steps(w, 20);
    expect(w.clouds.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// A cloud hides NOTHING (Story 9.3 session 2, Eric 2026-10-12)
// ---------------------------------------------------------------------------

describe('COUNTERMEASURE — a cloud hides nothing (Story 9.3 session 2: a client overlay)', () => {
  it('a fresh cloud centred between two hulls 150 u apart hides neither from the other — whoever owns it', () => {
    for (const owner of ['a', 'b', 'z']) {
      const w = bareWorld();
      place(w, 'a', 0, 0);
      place(w, 'b', 150, 0);
      injectCloud(w, 'mid', owner, 75, 0);
      expect(contactIds(buildFrame(w, 'a')), `owner ${owner}`).toEqual(['b']);
      expect(contactIds(buildFrame(w, 'b')), `owner ${owner}`).toEqual(['a']);
    }
  });

  it("radar paints a hull standing inside a NON-owner's fresh cloud in the annulus", () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    place(w, 'b', 700, 0); // sight < 700 ≤ dropout start < radar (Story 9.8, amendment 103)
    injectCloud(w, 'onB', 'b', 700, 0);
    windowAround(a, 0);
    expect(eventsOf(buildFrame(w, 'a'), 'blip')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// The `clouds` channel — its own gate over the spray disc, its own wire shape
// ---------------------------------------------------------------------------

describe('COUNTERMEASURE — the `clouds` channel (the spray disc SIGHTED or RADAR-DETECTED; owner / spectator always)', () => {
  const SIGHT = CONFIG.vision.sight;
  const RADAR = CONFIG.vision.radar;
  const R0 = cloudOutlineRadius(0);
  // Placements off the live ladder (Story 9.8, amendment 103): NEAR's nearest
  // rim point sits 30 u inside sight, FAR's 70 u past it; RADAR_C's whole
  // disc is beyond sight and its centre inside the dropout's flat band (so
  // every swept tick delivers — ruling 121); BEYOND's nearest point is past
  // radar.
  const NEAR = SIGHT + R0 - 30;
  const FAR = SIGHT + R0 + 70;
  const RADAR_C = SIGHT + R0 + 100;
  const BEYOND = RADAR + R0 + 100;

  it('SIGHTED: a fresh disc whose nearest point is just inside sight rides; one whose nearest point is just past it does not (no radar: zero-width beam)', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0); // place() parks a zero-width beam window: no radar term
    place(w, 'b', 900, 900);
    expect(NEAR - R0).toBeLessThanOrEqual(SIGHT); // premise: inside sight
    expect(FAR - R0).toBeGreaterThan(SIGHT); // premise: past sight
    injectCloud(w, 'near', 'b', NEAR, 0);
    injectCloud(w, 'far', 'b', -FAR, 0);
    expect(cloudIds(buildFrame(w, 'a'))).toEqual(['near']);
  });

  it('SIGHTED needs island LOS to the nearest point: land over it keeps the cloud off the wire', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'b', 900, 900);
    const isle = circleIsland(150, 0, 60);
    w.map.islands.push(isle);
    expect(islandBlocksSegment(O, { x: NEAR - R0, y: 0 }, isle)).toBe(true); // premise: the nearest rim point is behind land
    injectCloud(w, 'c1', 'b', NEAR, 0);
    expect(cloudIds(buildFrame(w, 'a'))).toEqual([]);
    w.map.islands.length = 0;
    expect(cloudIds(buildFrame(w, 'a'))).toEqual(['c1']);
  });

  it('RADAR-DETECTED: a disc beyond sight inside radar range rides with the beam parked across its bearing span; parked elsewhere it does not', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    place(w, 'b', 900, 900);
    expect(RADAR_C - R0).toBeGreaterThan(SIGHT); // premise: no point of the disc in sight
    expect(RADAR_C - R0).toBeLessThanOrEqual(RADAR); // premise: its nearest point in radar range
    expect(RADAR_C).toBeLessThanOrEqual(CONFIG.vision.dropout.startU); // premise: no dropout at the centre
    expect(0.2).toBeLessThan(Math.asin(R0 / RADAR_C)); // premise: 0.2 rad is inside the bearing span
    injectCloud(w, 'c1', 'b', RADAR_C, 0);
    windowAround(a, 0.2); // inside the span ±asin(R0/RADAR_C), off the centre's own bearing
    expect(cloudIds(buildFrame(w, 'a'))).toEqual(['c1']);
    windowAround(a, Math.PI);
    expect(cloudIds(buildFrame(w, 'a'))).toEqual([]);
  });

  it('RADAR-DETECTED needs the shadow march: hard cover between the observer and the disc keeps it off the wire', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    place(w, 'b', 900, 900);
    injectCloud(w, 'c1', 'b', RADAR_C, 0);
    windowAround(a, 0);
    expect(cloudIds(buildFrame(w, 'a'))).toEqual(['c1']);
    w.map.heightRaster = rasterFrom(RADAR_C + 100, ridgeField(150, 0, 20, 400)); // a tall wall across the bearing to the cloud
    expect(cloudIds(buildFrame(w, 'a'))).toEqual([]);
  });

  it('a disc whose nearest point is beyond radar range never rides, whatever the beam', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    place(w, 'b', 900, 900);
    expect(BEYOND - R0).toBeGreaterThan(RADAR); // premise
    injectCloud(w, 'far1', 'b', BEYOND, 0);
    windowAround(a, 0, 0.5);
    expect(cloudIds(buildFrame(w, 'a'))).toEqual([]);
  });

  it('the OWNER always sees its own clouds, however far; a SPECTATOR sees every cloud', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'b', 900, 900);
    injectCloud(w, 'mine', 'a', 2000, 0);
    injectCloud(w, 'theirs', 'b', -2000, 0);
    expect(cloudIds(buildFrame(w, 'a'))).toEqual(['mine']);
    expect(cloudIds(buildFrame(w, 'b'))).toEqual(['theirs']);
    expect(cloudIds(buildFrame(w, 'a', 'finished'))).toEqual(['mine', 'theirs']); // unfogged, in press order
  });

  it('from INSIDE cloud A, cloud B 100 u away is still in the channel (a cloud never hides a cloud)', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'b', 900, 900);
    injectCloud(w, 'A', 'b', 0, 0);
    injectCloud(w, 'B', 'b', 100, 0);
    expect(cloudIds(buildFrame(w, 'a'))).toEqual(['A', 'B']);
  });

  it('the wire shape is {id,x,y,t0} in that order — no owner, no until', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'b', 900, 900);
    injectCloud(w, 'cl9', 'b', 50, 0, w.now - 1234);
    const f = buildFrame(w, 'a');
    expect(f.clouds).toEqual([{ id: 'cl9', x: 50, y: 0, t0: w.now - 1234 }]);
    expect(Object.keys(f.clouds![0])).toEqual(['id', 'x', 'y', 't0']);
    const text = JSON.stringify(f);
    for (const forbidden of ['ownerId', 'bornAt', 'until']) expect(text).not.toContain(forbidden);
  });

  it('a cloud leaves the channel the step it expires — never a stale cloud on the wire', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    injectCloud(w, 'old', 'z', 50, 0, w.now - (CM.lifeMs - DT)); // one tick of life left; a stands inside it
    expect(cloudIds(buildFrame(w, 'a'))).toEqual(['old']);
    steps(w, 1);
    expect(w.clouds.size).toBe(0);
    expect(buildFrame(w, 'a').clouds).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// The bot
// ---------------------------------------------------------------------------

describe('COUNTERMEASURE — the bot (R12 on one cloud per press)', () => {
  it('a hurt bot holding two copies presses ONCE on the way out — one cloud at its centre — and not again until that cloud expires', () => {
    const w = new World(81624, 4);
    w.map.islands.length = 0;
    const rec = w.addBot('torpedoBoat', 'duelist');
    stock(w, rec, 2);
    const step = (ms: number): void => steps(w, Math.round(ms / DT));
    rec.hp = rec.stats.maxHp * 0.1;
    step(12_000);
    expect(copies(rec)).toBe(1);
    expect(w.clouds.size).toBe(1);
    const [cloud] = [...w.clouds.values()];
    expect(cloud.ownerId).toBe(rec.id);
    expect(rec.cloudUntil).toBe(cloud.until);
    rec.hp = rec.stats.maxHp * 0.1; // stay on the way out
    while (w.now < cloud.until - DT) steps(w, 1);
    expect(copies(rec)).toBe(1); // its own cloud is still up
    step(5_000);
    expect(copies(rec)).toBe(0); // expired: pressed again
  });
});
