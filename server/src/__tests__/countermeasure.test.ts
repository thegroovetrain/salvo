// MULTI-SPECTRAL COUNTERMEASURE — the server half of Story 9.3 (Eric rulings
// 2026-10-11, epic-9 amendments 40–47; SMOKE SCREEN's 8.18 seat), every
// server-side row of the spec's I/O matrix as a directed case:
//
//   • the PRESS: one copy makes ONE stationary cloud at the hull's CENTRE,
//     born now, deleted at now + lifeMs, its pixel base cached beside it;
//     a RE-PRESS makes a second full cloud at the hull's new position (46);
//     a SINKING press is refused `blocked`, copy kept, and clouds already
//     made live out their life (amendment 127); a non-finite pose makes none;
//   • OCCLUSION: a living pixel on the segment hides a contact from EVERY
//     observer, the cloud's owner included (40); the owner standing in its
//     own cloud is blind by eye but its RADAR paints the hull inside (41 +
//     amendment 147); a NON-owner's radar never paints a hull INSIDE the
//     outline behind a pixel and always paints one BEYOND it (no shadow);
//   • the FADE: a cloud at 14 s has thinned enough that lines pass (43);
//   • FLARE + CLOUD (142): the owned lit zone reveals nothing through a
//     pixel; a cloud BEHIND the hull and an ISLAND never block the flare;
//   • TORPEDO WATER (143): the radar half drops water inside a non-owner's
//     cloud and keeps water beyond it; MINE and DECOY at the detect rung
//     hidden, and the non-owner's radar does not paint the decoy inside;
//     `mz`/`sm` suppressed and `fh` muffled one step behind a pixel;
//   • the `clouds` CHANNEL's own gate (42): centre within RADAR range with
//     island-only LOS to the outline's nearest rim, owner always, spectator
//     always; the wire shape `{id,x,y,t0}` and nothing else;
//   • the bot presses once on the way out and not again until its cloud
//     expires; resetForMatchStart clears the water.
//
// EVERY pixel premise is ASSERTED, never assumed: the shared generator makes
// a different cloud per id, so each case searches for an id whose living
// pixels actually lie where the case needs them (and, for the fade, where
// they do NOT). The perception FUZZ and its independent cloud oracle live in
// perception.test.ts; the perf pin in cloudPerf.test.ts; the bot drill in
// botTactics.test.ts.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  cloudBase,
  cloudOutlineRadius,
  consumableSlotFor,
  forEachLivingPixel,
  isAfloat,
  isSinking,
  wrapPositive,
  type FrameMsg,
  type GameEvent,
  type WakeRibbon,
} from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { buildFrame } from '../game/frames.js';
import { sightOf } from '../game/signals.js';
import { addDecoy } from '../game/decoys.js';
import { circleIsland, flatRaster } from './islandFixture.js';

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
 *  `ownerId`, born at `bornAt` (fresh by default), alive for the full life,
 *  its base cached exactly as production caches it at the press. */
function injectCloud(w: World, id: string, ownerId: string, x: number, y: number, bornAt = w.now): void {
  w.clouds.set(id, { id, ownerId, x, y, bornAt, until: bornAt + CM.lifeMs, base: cloudBase(id) });
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

/** Push a raw world-emitted event onto the tick-event buffer perception
 *  dispatches (the perception.test.ts helper, verbatim). */
function emitWorldEvent(w: World, e: GameEvent): void {
  (w as unknown as { events: GameEvent[] }).events.push(e);
}

/** A two-sample TORPEDO ribbon whose one 12 u segment stands at x = `x`,
 *  midpoint (x, 0), laid in the last 100 ms. */
function torpWater(w: World, x: number): WakeRibbon {
  const cap = 8;
  const r: WakeRibbon = { xs: new Float64Array(cap), ys: new Float64Array(cap), ts: new Float64Array(cap), cap, head: 0, count: 2, lifeMs: 2_750, widthU: 9, torp: true, hullAheadU: 0 };
  r.xs[0] = x;
  r.ys[0] = -6;
  r.ts[0] = w.now - 100;
  r.xs[1] = x;
  r.ys[1] = 6;
  r.ts[1] = w.now;
  return r;
}

// ---------------------------------------------------------------------------
// Pixel premises — the test's OWN closest-point test over the shared generator
// ---------------------------------------------------------------------------

function segPointDist(a: P, b: P, p: P): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y);
}

/** Does a LIVING pixel of the cloud `id` centred at `c`, aged `ageMs`, lie
 *  within the footprint of the segment a→b? */
function pixelOnLine(id: string, c: P, ageMs: number, a: P, b: P): boolean {
  let hit = false;
  forEachLivingPixel(cloudBase(id), c.x, c.y, ageMs, (px, py) => {
    if (!hit && segPointDist(a, b, { x: px, y: py }) <= CM.footprintU) hit = true;
  });
  return hit;
}

/** Search the id space for a cloud whose pixels satisfy `ok` — the premise a
 *  case needs, found rather than assumed (every id is a different cloud). */
function findCloudId(prefix: string, ok: (id: string) => boolean): string {
  for (let i = 1; i <= 400; i += 1) {
    const id = `${prefix}${i}`;
    if (ok(id)) return id;
  }
  throw new Error(`no cloud id under ${prefix} satisfies the premise`);
}

const O: P = { x: 0, y: 0 };

// ---------------------------------------------------------------------------
// The press
// ---------------------------------------------------------------------------

describe('COUNTERMEASURE — the press (rulings 43 / 46, amendment 127)', () => {
  it('one copy: spent at the press, ONE cloud at the hull\'s centre, born now, until now + life, base cached, the hull\'s own stamp advanced', () => {
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
    expect(cloud.base.dieAt.length).toBe(CM.pixels); // the shared generator's memo rides the record
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
// Occlusion — the ONE sight predicate and the radar rule
// ---------------------------------------------------------------------------

describe('COUNTERMEASURE — sight occlusion (ruling 40: ownership-blind, no sight floor)', () => {
  it('enemy 150 u away, a fresh cloud centred between: neither is a contact for the other — the OWNER equally blind; delete it and both are back', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'b', 150, 0);
    const c = { x: 75, y: 0 };
    const id = findCloudId('between', (i) => pixelOnLine(i, c, 0, O, { x: 150, y: 0 }));
    expect(contactIds(buildFrame(w, 'a'))).toEqual(['b']);
    expect(contactIds(buildFrame(w, 'b'))).toEqual(['a']);
    injectCloud(w, id, 'a', c.x, c.y); // a's OWN cloud
    expect(contactIds(buildFrame(w, 'a'))).toEqual([]);
    expect(contactIds(buildFrame(w, 'b'))).toEqual([]);
    w.clouds.delete(id);
    expect(contactIds(buildFrame(w, 'a'))).toEqual(['b']);
    expect(contactIds(buildFrame(w, 'b'))).toEqual(['a']);
  });

  it('standing inside a cloud never scales sight: sightOf is the full stat (no in-cloud bubble), and a hull in the clear beyond the pixels is still hidden by them', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    place(w, 'b', 100, 0);
    const id = findCloudId('onMe', (i) => pixelOnLine(i, O, 0, O, { x: 100, y: 0 }));
    injectCloud(w, id, 'z', 0, 0);
    steps(w, 1);
    expect(sightOf(a, w.now)).toBe(a.stats.sightRange);
    expect(contactIds(buildFrame(w, 'a'))).toEqual([]);
    expect(contactIds(buildFrame(w, 'b'))).toEqual([]);
  });

  describe('the OWNER inside its own cloud (rulings 40 + 41, amendment 147): blind by eye, radar paints the hull inside', () => {
    const BLIP_KEYS = ['k', 't', 'gx', 'gy', 'w', 'h', 'bits'];

    function scene(): { w: World; a: ShipRecord; b: ShipRecord } {
      const w = bareWorld();
      const a = place(w, 'a', 0, 0);
      const b = place(w, 'b', 100, 0);
      // The owner's cloud, centred ON the owner, aged 1 s; a pixel on the
      // a→b line (the premise), b inside the outline.
      const id = findCloudId('own', (i) => pixelOnLine(i, O, 1000, O, { x: 100, y: 0 }));
      injectCloud(w, id, 'a', 0, 0, w.now - 1000);
      expect(100).toBeLessThanOrEqual(cloudOutlineRadius(1000)); // b stands inside the outline
      return { w, a, b };
    }

    it('no contact either way; the OWNER sweeping b gets ONE blip in the ordinary wire shape', () => {
      const { w, a } = scene();
      windowAround(a, 0);
      const f = buildFrame(w, 'a');
      expect(contactIds(f)).toEqual([]);
      const blips = eventsOf(f, 'blip');
      expect(blips).toHaveLength(1);
      expect(Object.keys(blips[0])).toEqual(BLIP_KEYS);
      const text = JSON.stringify(blips);
      for (const forbidden of ['"id"', '"cls"', '"heading"', '"x"', '"y"']) expect(text).not.toContain(forbidden);
    });

    it('not swept: nothing (the beam term still gates the owner\'s paint)', () => {
      const { w, a } = scene();
      windowAround(a, Math.PI);
      const f = buildFrame(w, 'a');
      expect(contactIds(f)).toEqual([]);
      expect(eventsOf(f, 'blip')).toHaveLength(0);
    });

    it('the NON-owner sweeping the owner inside its cloud gets NO blip (inside the outline, pixel on the path)', () => {
      const { w, b } = scene();
      windowAround(b, Math.PI);
      const f = buildFrame(w, 'b');
      expect(contactIds(f)).toEqual([]);
      expect(eventsOf(f, 'blip')).toHaveLength(0);
    });
  });

  it('NON-owner radar, target INSIDE a fresh cloud at 400 u (the annulus): no blip; remove the cloud and it paints; the cloud\'s OWNER at the same spot paints through', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0); // stands in the cloud
    const b = place(w, 'b', 400, 0); // sight 330 < 400 ≤ radar 660
    const id = findCloudId('inside', (i) => pixelOnLine(i, O, 0, { x: 400, y: 0 }, O));
    windowAround(b, Math.PI);
    expect(eventsOf(buildFrame(w, 'b'), 'blip')).toHaveLength(1);
    injectCloud(w, id, 'a', 0, 0);
    expect(eventsOf(buildFrame(w, 'b'), 'blip')).toHaveLength(0);
    w.clouds.delete(id);
    expect(eventsOf(buildFrame(w, 'b'), 'blip')).toHaveLength(1);
    injectCloud(w, id, 'b', 0, 0); // b's own cloud over a: b's radar ignores its pixels
    expect(eventsOf(buildFrame(w, 'b'), 'blip')).toHaveLength(1);
  });

  it('NON-owner radar, target BEHIND the cloud: a hull 100 u past the far rim paints (no shadow); one inside the outline on the same bearing does not', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    place(w, 'c', 650, 0); // 100 u past the far rim of a fresh cloud at 350 (outline 150..550); ≤ 660 radar
    place(w, 'd', 500, 0); // inside that outline
    const c = { x: 350, y: 0 };
    const id = findCloudId('behind', (i) => pixelOnLine(i, c, 0, O, { x: 650, y: 0 }) && pixelOnLine(i, c, 0, O, { x: 500, y: 0 }));
    expect(650 - 350).toBeGreaterThan(cloudOutlineRadius(0));
    expect(500 - 350).toBeLessThanOrEqual(cloudOutlineRadius(0));
    windowAround(a, 0);
    expect(eventsOf(buildFrame(w, 'a'), 'blip')).toHaveLength(2); // both in the annulus, clear water
    injectCloud(w, id, 'z', c.x, c.y);
    const f = buildFrame(w, 'a');
    expect(contactIds(f)).toEqual([]);
    expect(eventsOf(f, 'blip')).toHaveLength(1); // c beyond the cloud paints; d inside it does not
    w.ships.get('c')!.lifecycle = { kind: 'sunk', at: w.now };
    expect(eventsOf(buildFrame(w, 'a'), 'blip')).toHaveLength(0); // ...and the survivor was indeed c
  });

  it('the FADE (ruling 43): the same geometry at 14 s — a cloud whose living set leaves the line clear — the contact is back both ways; fresh, the same cloud hides it', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'b', 150, 0);
    const c = { x: 75, y: 0 };
    const line: P = { x: 150, y: 0 };
    // Found by search: blocks the a→b line fresh, leaves it clear at 14 s.
    const id = findCloudId('fade', (i) => pixelOnLine(i, c, 0, O, line) && !pixelOnLine(i, c, 14_000, O, line));
    injectCloud(w, id, 'z', c.x, c.y, w.now - 14_000);
    expect(contactIds(buildFrame(w, 'a'))).toEqual(['b']);
    expect(contactIds(buildFrame(w, 'b'))).toEqual(['a']);
    w.clouds.delete(id);
    injectCloud(w, id, 'z', c.x, c.y);
    expect(contactIds(buildFrame(w, 'a'))).toEqual([]);
    expect(contactIds(buildFrame(w, 'b'))).toEqual([]);
  });

  it('FLARE + CLOUD (amendment 142): the owned lit zone reveals NOTHING through a pixel; a cloud BEHIND the hull and an ISLAND never block the flare', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'b', 500, 0); // beyond sight (330): only the flare can reveal it
    const line: P = { x: 500, y: 0 };
    const id = findCloudId('flare', (i) => pixelOnLine(i, { x: 250, y: 0 }, 0, O, line));
    expect(contactIds(buildFrame(w, 'a'))).toEqual([]);
    w.litZones.set('z1', { id: 'z1', ownerId: 'a', x: 500, y: 0, r: 110, until: 999_999 });
    expect(contactIds(buildFrame(w, 'a'))).toEqual(['b']); // lit from above
    injectCloud(w, id, 'b', 250, 0); // between them
    expect(contactIds(buildFrame(w, 'a'))).toEqual([]); // a cloud hides hulls even under a flare
    w.clouds.delete(id);
    injectCloud(w, 'behindB', 'b', 760, 0); // BEHIND b — its fresh pixels sit ≥ 560 u out, off the a→b segment
    expect(pixelOnLine('behindB', { x: 760, y: 0 }, 0, O, line)).toBe(false);
    expect(contactIds(buildFrame(w, 'a'))).toEqual(['b']);
    w.clouds.delete('behindB');
    w.map.islands.push(circleIsland(250, 0, 60)); // land between them
    expect(contactIds(buildFrame(w, 'a'))).toEqual(['b']); // an island never blocks the flare (no island term)
    injectCloud(w, id, 'b', 250, 0);
    expect(contactIds(buildFrame(w, 'a'))).toEqual([]); // ...but the cloud still does
  });

  it('TORPEDO WATER (ruling 143 + amendment 41): no in-bubble water since the 4/8 rung; the RADAR half drops water inside a NON-owner\'s cloud and keeps water beyond it, and the owner\'s radar keeps it all', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    windowAround(a, 0);
    w.torpWakes.set('tw', torpWater(w, 250)); // inside sight = inside the fish's detect bound now
    expect(eventsOf(buildFrame(w, 'a'), 'wk')).toHaveLength(0);
    injectCloud(w, 'any', 'z', 125, 0); // a cloud changes nothing: there was nothing to hide
    expect(eventsOf(buildFrame(w, 'a'), 'wk')).toHaveLength(0);
    w.clouds.clear();
    // The RADAR half: water at 500 u.
    w.torpWakes.set('tw', torpWater(w, 500));
    expect(eventsOf(buildFrame(w, 'a'), 'wk')).toHaveLength(1);
    const mid: P = { x: 500, y: 0 };
    const onWater = findCloudId('onWater', (i) => pixelOnLine(i, mid, 0, O, mid));
    injectCloud(w, onWater, 'z', 500, 0); // the water stands INSIDE a non-owner's cloud behind a pixel
    expect(eventsOf(buildFrame(w, 'a'), 'wk')).toHaveLength(0);
    w.clouds.clear();
    injectCloud(w, onWater, 'a', 500, 0); // the observer's OWN cloud: its radar paints through
    expect(eventsOf(buildFrame(w, 'a'), 'wk')).toHaveLength(1);
    w.clouds.clear();
    const before = findCloudId('beforeWater', (i) => pixelOnLine(i, { x: 250, y: 0 }, 0, O, mid));
    injectCloud(w, before, 'z', 250, 0); // pixels on the path, but the water is BEYOND the outline (450 < 500)
    expect(500 - 250).toBeGreaterThan(cloudOutlineRadius(0));
    expect(eventsOf(buildFrame(w, 'a'), 'wk')).toHaveLength(1); // no shadow beyond the cloud
  });

  it('the DETECT rung: a mine and a decoy 200 u out inside a cloud are not sent by sight, and the NON-owner\'s radar does not paint the decoy inside; the owner sees both', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    place(w, 'b', 900, 0);
    w.mines.set('m1', { id: 'm1', ownerId: 'b', x: 200, y: 0, armedAt: 0, kind: 'naval', hp: 10 });
    addDecoy(w.decoys, 'b', 200, -20, 'd1');
    const c = { x: 100, y: 0 };
    const id = findCloudId('detect', (i) => pixelOnLine(i, c, 0, O, { x: 200, y: 0 }) && pixelOnLine(i, c, 0, O, { x: 200, y: -20 }));
    windowAround(a, Math.atan2(-20, 200));
    const clear = buildFrame(w, 'a');
    expect(clear.mines.map((m) => m.id)).toEqual(['m1']);
    expect((clear.decoys ?? []).map((d) => d.id)).toEqual(['d1']);
    expect(eventsOf(clear, 'blip')).toHaveLength(0); // a sighted decoy rides its channel, never doubled as a blip
    injectCloud(w, id, 'b', c.x, c.y);
    const hidden = buildFrame(w, 'a');
    expect(hidden.mines).toEqual([]);
    expect(hidden.decoys).toBeUndefined();
    expect(eventsOf(hidden, 'blip')).toHaveLength(0); // inside the outline behind a pixel: a's radar is refused
    // The owner's OWN view is untouched (owner-always on both rows).
    const own = buildFrame(w, 'b');
    expect(own.mines.map((m) => m.id)).toEqual(['m1']);
    expect((own.decoys ?? []).map((d) => d.id)).toEqual(['d1']);
  });

  it('HALOS + HORN: no `mz`, no `sm`, and `fh` takes the one-step muffle behind a pixel', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'b', 900, 0);
    const honk = { k: 'fh', h: 'standard', x: 400, y: 0, id: 'b' } as unknown as GameEvent;
    emitWorldEvent(w, { k: 'mz', x: 400, y: 0 });
    emitWorldEvent(w, { k: 'sm', x: 400, y: 0, tier: 1 });
    emitWorldEvent(w, honk);
    const clear = buildFrame(w, 'a');
    expect(eventsOf(clear, 'mz')).toHaveLength(1); // 400 ≤ the 412.5 u halo
    expect(eventsOf(clear, 'sm')).toHaveLength(1);
    expect(eventsOf(clear, 'fh')).toEqual([{ k: 'fh', h: 'standard', b: 0, v: 5 }]); // ceil(8 × 400 / 660) = 5
    const id = findCloudId('halo', (i) => pixelOnLine(i, { x: 200, y: 0 }, 0, O, { x: 400, y: 0 }));
    injectCloud(w, id, 'b', 200, 0);
    const hidden = buildFrame(w, 'a');
    expect(eventsOf(hidden, 'mz')).toHaveLength(0);
    expect(eventsOf(hidden, 'sm')).toHaveLength(0);
    expect(eventsOf(hidden, 'fh')).toEqual([{ k: 'fh', h: 'standard', b: 0, v: 7 }]); // max(5, 5 + 2): the island muffle, verbatim
  });
});

// ---------------------------------------------------------------------------
// The `clouds` channel — its own gate, its own wire shape
// ---------------------------------------------------------------------------

describe('COUNTERMEASURE — the `clouds` channel (ruling 42: radar range to the centre, island-only LOS to the rim, owner / spectator always)', () => {
  it('a cloud whose centre is at 650 u rides; one at 670 u does not; behind an island (rim and centre) it does not', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'b', 900, 900);
    injectCloud(w, 'near', 'b', 650, 0); // ≤ 660
    injectCloud(w, 'far', 'b', 0, 670); // > 660
    expect(cloudIds(buildFrame(w, 'a'))).toEqual(['near']);
    w.map.islands.push(circleIsland(300, 0, 50)); // land between a and `near`'s rim (450, 0)
    expect(cloudIds(buildFrame(w, 'a'))).toEqual([]);
  });

  it('NEAREST-RIM delivery: an island over the cloud\'s centre leaves its water-side rim visible — the cloud rides', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'b', 900, 900);
    injectCloud(w, 'c1', 'b', 400, 0); // fresh: rim toward a at (200, 0)
    w.map.islands.push(circleIsland(400, 60, 50)); // hides the centre (400, 0) from a, not the rim (200, 0)
    expect(cloudIds(buildFrame(w, 'a'))).toEqual(['c1']);
    w.map.islands.length = 0;
    w.map.islands.push(circleIsland(100, 0, 20)); // on the a→rim segment
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

  it('from INSIDE cloud A, cloud B 100 u away is still in the channel (island-only gate — a cloud never hides a cloud)', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'b', 900, 900);
    injectCloud(w, 'A', 'b', 0, 0);
    injectCloud(w, 'B', 'b', 100, 0);
    expect(cloudIds(buildFrame(w, 'a'))).toEqual(['A', 'B']);
  });

  it('the wire shape is {id,x,y,t0} in that order — no owner, no until, no base, no pixels', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'b', 900, 900);
    injectCloud(w, 'cl9', 'b', 50, 0, w.now - 1234);
    const f = buildFrame(w, 'a');
    expect(f.clouds).toEqual([{ id: 'cl9', x: 50, y: 0, t0: w.now - 1234 }]);
    expect(Object.keys(f.clouds![0])).toEqual(['id', 'x', 'y', 't0']);
    const text = JSON.stringify(f);
    for (const forbidden of ['ownerId', 'bornAt', 'until', '"base"', 'dieAt', '"ox"', '"oy"']) expect(text).not.toContain(forbidden);
  });

  it('a cloud leaves the channel the step it expires — never a stale cloud on the wire', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    injectCloud(w, 'old', 'z', 50, 0, w.now - CM.lifeMs + DT); // one tick of life left
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
