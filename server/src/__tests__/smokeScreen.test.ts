// SMOKE SCREEN — the server half of Story 8.18 (catalog-v3 R38; Eric rulings
// 2026-09-29, epic-8 amendments 138–145), every server-side row of the spec's
// I/O matrix as a directed case:
//
//   • the LAY: one copy opens a 5 s window; a puff drops at the STERN every
//     500 ms — ten per copy, an eleventh never (rulings 138 / setSmokeScreen);
//   • GROWTH: r40 at birth → r50 at 15 s → deleted at 30 s (ruling 139), read
//     through the sim clock — a puff that MISSES a segment fresh BLOCKS it once
//     it has grown, and the segment clears again when the puff dies;
//   • RE-PRESS restarts the clock (ruling 140), grid kept mid-lay: 16 puffs;
//   • a SINKING press is refused `blocked`, copy kept; FOUNDERING mid-lay stops
//     the trail while the laid puffs live out their 30 s (ruling 144);
//   • OCCLUSION: a contact behind a puff is gone; its radar blip is not —
//     beyond sight as ever, and INSIDE the bubble too (amendment 147: radar
//     paints the hull that smoke alone hides; an island-hidden one stays
//     dark); an observer's OWN puff hides a hull behind it like anyone's;
//   • STANDING IN SMOKE (amendment 149, final — Eric: "if I'm in smoke, I
//     should be able to see at 1/8 intel range, including into other smoke.
//     If I'm not in smoke, I can't see into it. If I'm in it, go ahead and
//     occlude everything outside of that range, no matter what. Radar still
//     works."): sight 82.5 u, no puff term inside it, nothing optical beyond
//     it (halos, horn, own flare included), radar untouched; `inSmoke` rides
//     `you` only; a NaN stern lays nothing (P1);
//   • FLARE + SMOKE (ruling 142): the owned lit zone reveals nothing through a
//     puff on the segment; a puff BEHIND the hull and an ISLAND never block it;
//   • TORPEDO WATER (ruling 143): in-bubble `wk` hidden by a puff; the radar
//     half untouched; MINE and DECOY at the detect rung hidden; `mz`/`sm`
//     suppressed and `fh` muffled one step behind a puff;
//   • the `smoke` CHANNEL's own gate: sight + radius, island-only LOS to the
//     disc's NEAREST point (amendment 148: delivered if any part is island-
//     visible), owner always, spectator always, visible from inside another
//     puff; the wire shape `{id,x,y,t0}` and nothing else — no own-flag;
//   • resetForMatchStart clears the water and every lay window.
//
// The HULL REPAIR replace (ruling 141) is pinned beside the heal in
// equipment.test.ts / upgrades.test.ts; the interim bot row (ruling 145) in
// botTactics.test.ts; the perception FUZZ and its independent smoke oracle in
// perception.test.ts; the perf pin in smokePerf.test.ts.

import { describe, it, expect } from 'vitest';
import { CONFIG, CONSUMABLE_SLOTS, isAfloat, isSinking, wrapPositive, type FrameMsg, type GameEvent, type WakeRibbon } from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { buildFrame } from '../game/frames.js';
import { sightOf } from '../game/signals.js';
import { addDecoy } from '../game/decoys.js';
import { circleIsland, flatRaster } from './islandFixture.js';

const SC = CONFIG.smokeScreen;
const DT = CONFIG.tick.simDtMs;
const SIGHT = CONFIG.vision.sight;
const BELT = CONSUMABLE_SLOTS[0];

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

/** Stock `n` SMOKE SCREEN copies in the first belt slot (production catalog). */
function stock(w: World, ship: ShipRecord, n = 1): void {
  for (let i = 0; i < n; i += 1) w.applyCard(ship, 'smokeScreen');
}

/** Fire the belt slot through the ONE activation path. */
const press = (w: World, ship: ShipRecord): unknown => w.sinkingActivationGate(ship, BELT);

const copies = (ship: ShipRecord): number => ship.loadout[BELT].state?.n ?? 0;

/** Drop a puff straight into the store (the injectMine posture): a fresh 40 u
 *  disc owned by `ownerId`, alive for the full 30 s unless told otherwise. */
function injectPuff(w: World, id: string, ownerId: string, x: number, y: number, bornAt = w.now, until = bornAt + SC.lifeMs): void {
  w.smoke.set(id, { id, ownerId, x, y, bornAt, until });
}

function steps(w: World, n: number): void {
  for (let i = 0; i < n; i += 1) w.step(DT);
}

const contactIds = (f: FrameMsg): string[] => f.contacts.map((c) => c.id);
const eventsOf = (f: FrameMsg, k: string): GameEvent[] => f.events.filter((e) => e.k === k);

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
  const r: WakeRibbon = { xs: new Float64Array(cap), ys: new Float64Array(cap), ts: new Float64Array(cap), cap, head: 0, count: 2, lifeMs: 2_750, widthU: 9, torp: true };
  r.xs[0] = x;
  r.ys[0] = -6;
  r.ts[0] = w.now - 100;
  r.xs[1] = x;
  r.ys[1] = 6;
  r.ts[1] = w.now;
  return r;
}

// ---------------------------------------------------------------------------
// The lay
// ---------------------------------------------------------------------------

describe('SMOKE SCREEN — the lay (rulings 138 / 140 / 144)', () => {
  it('the numbers are the rulings: 40 → 60 u over 30 s, a 5 s trail at 500 ms, and the wounded-smoke block is untouched', () => {
    expect(SC).toEqual({ r0: 40, r1: 60, lifeMs: 30_000, layMs: 5_000, puffIntervalMs: 500, expandMs: 30_000, inSmokeSightFraction: 0.125 });
    expect(CONFIG.smoke.puffIntervalMs).toBe(250); // CONFIG.smoke is the damage-band plume, never conflated
  });

  it('one copy: spent at the press, the window stamped, then TEN puffs at the STERN every 500 ms — the eleventh never', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0, 0);
    stock(w, a, 1);
    const t0 = w.now;
    expect(press(w, a)).toEqual({ ok: true });
    expect(copies(a)).toBe(0); // the ONE SPEND LAW: a successful press costs the copy
    expect(a.cards.filter((c) => c === 'smokeScreen')).toHaveLength(0);
    expect(a.smokeUntil).toBe(t0 + SC.layMs);
    expect(a.nextPuffAt).toBe(t0);
    expect(w.smoke.size).toBe(0); // nothing drops at the press itself — stepSmoke ran before activationControl
    steps(w, 1);
    expect(w.smoke.size).toBe(1); // the first puff lands on the very next tick
    steps(w, 99); // t0 + 5000
    expect(w.smoke.size).toBe(10);
    steps(w, 40); // well past the window
    expect(w.smoke.size).toBe(10); // the eleventh never
    const puffs = [...w.smoke.values()];
    // THE CADENCE IS PRESS-ANCHORED: `nextPuffAt` is stamped `now` at the
    // press and advanced by 500 ms per puff, so the first puff drops on the
    // next tick (t0 + 50) and every later one on the press's own 500 ms
    // grid (t0 + 500, + 1000, …, + 4500) — ten in the 5 s window.
    expect(puffs.map((p) => p.bornAt)).toEqual([t0 + DT, ...Array.from({ length: 9 }, (_, i) => t0 + (i + 1) * SC.puffIntervalMs)]);
    const stern = -a.cls.hull.length / 2; // heading 0: the stern is dead astern on -x
    for (const p of puffs) {
      expect(p).toEqual({ id: p.id, ownerId: 'a', x: stern, y: 0, bornAt: p.bornAt, until: p.bornAt + SC.lifeMs });
      expect(p.id).toMatch(/^sk\d+$/);
    }
    expect(w.smokeCount).toBe(10);
    expect(a.smokeUntil).toBe(t0 + SC.layMs); // the window is a stamp, not a countdown: it simply lapses
  });

  it('the stern follows the heading (a hull pointing +y lays on -y)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 100, 100, Math.PI / 2);
    stock(w, a, 1);
    press(w, a);
    steps(w, 1);
    const p = [...w.smoke.values()][0];
    expect(p.x).toBeCloseTo(100, 9);
    expect(p.y).toBeCloseTo(100 - a.cls.hull.length / 2, 9);
  });

  it('a RE-PRESS while laying RESTARTS the 5 s clock (ruling 140): 6 puffs, then a fresh 10 — 16 in all', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    stock(w, a, 2);
    press(w, a);
    steps(w, 55); // +2.75 s: puffs at 50, 500, 1000, 1500, 2000, 2500
    expect(w.smoke.size).toBe(6);
    const t1 = w.now;
    expect(press(w, a)).toEqual({ ok: true });
    expect(copies(a)).toBe(0); // the second copy is SPENT
    expect(a.smokeUntil).toBe(t1 + SC.layMs); // the clock restarts from the re-press
    expect(a.nextPuffAt).toBe(3000); // ...but the running 500 ms grid is KEPT (no re-anchor mid-lay)
    steps(w, 100); // to +7.75 s: 3000, 3500, …, 7500 — ten more
    expect(w.smoke.size).toBe(16);
    steps(w, 40);
    expect(w.smoke.size).toBe(16);
  });

  it('a re-press landing ON a cadence tick keeps the grid — no 50 ms double-drop: 7 + 9 = 16', () => {
    // Orchestrator ruling at build: the cadence grid is re-anchored only from
    // IDLE. A re-press that lands on the tick that just dropped a puff leaves
    // `nextPuffAt` on the running grid (+500), so the trail stays evenly
    // spaced and the window simply extends to press + 5 s (exclusive).
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    stock(w, a, 2);
    press(w, a);
    steps(w, 60); // +3.0 s: the 3000 ms puff dropped THIS tick — seven so far
    expect(w.smoke.size).toBe(7);
    press(w, a);
    expect(a.nextPuffAt).toBe(3500);
    steps(w, 1);
    expect(w.smoke.size).toBe(7); // no re-armed puff 50 ms after the last
    steps(w, 200); // window ends at 8000 (exclusive): 3500 … 7500 — nine more
    expect(w.smoke.size).toBe(16);
  });

  it('a SINKING press is refused `blocked` by the row and the copy is kept (ruling 144, the chaff guard verbatim)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    stock(w, a, 1);
    w.sinkShip('a');
    expect(isAfloat(a.lifecycle)).toBe(false);
    expect(press(w, a)).toEqual({ ok: false, reason: 'blocked' });
    expect(copies(a)).toBe(1);
    expect(a.cards.filter((c) => c === 'smokeScreen')).toHaveLength(1);
    expect(a.smokeUntil).toBe(0);
    steps(w, 10);
    expect(w.smoke.size).toBe(0);
  });

  it('FOUNDERING mid-lay: sink entry closes the window — no puff after it — while the laid puffs live to their own `until` (rulings 144 / amendment 127)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    stock(w, a, 1);
    const t0 = w.now;
    press(w, a);
    steps(w, 35); // +1.75 s: four puffs (50, 500, 1000, 1500)
    expect(w.smoke.size).toBe(4);
    w.sinkShip('a', undefined);
    expect(a.smokeUntil).toBe(0); // the window closed at sink ENTRY
    expect(a.nextPuffAt).toBe(0);
    steps(w, 25); // +3 s, still sinking: the 2000 / 2500 / 3000 ms puffs would have dropped here
    expect(w.smoke.size).toBe(4);
    steps(w, 80); // through the founder edge (+5 s window) and the respawn
    expect(w.smoke.size).toBe(4);
    expect(a.smokeUntil).toBe(0);
    // The four puffs die on their OWN clocks, oldest first, well after the hull.
    while (w.now < t0 + DT + SC.lifeMs) steps(w, 1);
    expect(w.smoke.size).toBe(3); // the 50 ms puff died at exactly bornAt + lifeMs
    while (w.now < t0 + 1500 + SC.lifeMs) steps(w, 1);
    expect(w.smoke.size).toBe(0);
  });

  it('resetForMatchStart clears every puff and every lay window (the mines / decoys / chaff precedent)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    place(w, 'b', 900, 0);
    stock(w, a, 1);
    press(w, a);
    steps(w, 15); // 50, 500
    expect(w.smoke.size).toBe(2);
    expect(a.smokeUntil).toBeGreaterThan(w.now);
    w.resetForMatchStart();
    expect(w.smoke.size).toBe(0);
    expect(w.smokeCount).toBe(0);
    for (const s of w.ships.values()) {
      expect(s.smokeUntil).toBe(0);
      expect(s.nextPuffAt).toBe(0);
    }
    steps(w, 20);
    expect(w.smoke.size).toBe(0); // no trail resumes into the real match
  });
});

// ---------------------------------------------------------------------------
// Occlusion — the ONE sight predicate
// ---------------------------------------------------------------------------

describe('SMOKE SCREEN — occlusion (the sightClear predicate at every sight-tier site)', () => {
  it('a contact behind a puff is GONE from the frame; remove the puff and it is back', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'b', 200, 0);
    expect(contactIds(buildFrame(w, 'a'))).toEqual(['b']);
    injectPuff(w, 'sk1', 'b', 100, 0);
    expect(contactIds(buildFrame(w, 'a'))).toEqual([]);
    w.smoke.delete('sk1');
    expect(contactIds(buildFrame(w, 'a'))).toEqual(['b']);
  });

  it('GROWTH through the sim clock (ruling 139): a puff that MISSES the segment at r40 BLOCKS it at r50 after 15 s, and the segment clears when the puff dies at 30 s', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'b', 200, 0);
    injectPuff(w, 'sk1', 'b', 100, 45); // 45 u off the a→b line: fresh r40 misses it
    expect(contactIds(buildFrame(w, 'a'))).toEqual(['b']);
    steps(w, 300); // +15 s: r = 50 ≥ 45 — the grown disc now lies on the segment
    expect(w.smoke.size).toBe(1);
    expect(contactIds(buildFrame(w, 'a'))).toEqual([]);
    steps(w, 300); // +30 s: deleted at exactly bornAt + lifeMs
    expect(w.smoke.size).toBe(0);
    expect(contactIds(buildFrame(w, 'a'))).toEqual(['b']);
  });

  it("the radar blip is UNAFFECTED: a hull in the annulus behind a puff still paints when swept, and is never a contact", () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    place(w, 'c', 450, 0); // sight 330 < 450 ≤ radar 660
    windowAround(a, 0);
    const clear = buildFrame(w, 'a');
    expect(eventsOf(clear, 'blip')).toHaveLength(1);
    injectPuff(w, 'sk1', 'c', 300, 0); // squarely on the a→c segment
    const smoked = buildFrame(w, 'a');
    expect(eventsOf(smoked, 'blip')).toHaveLength(1); // radar is smoke-blind by ruling
    expect(contactIds(smoked)).toEqual([]);
  });

  describe('IN-BUBBLE radar (Eric ruling 2026-09-29, amendment 147): radar paints a hull inside the sight bubble that smoke alone hides', () => {
    const BLIP_KEYS = ['k', 't', 'gx', 'gy', 'w', 'h', 'bits'];

    it('observer (0,0) sweeping bearing 0, hull (200,0), puff r40 at (100,0): no contact, ONE blip — the same wire shape as an annulus paint (no id/class/heading)', () => {
      const w = bareWorld();
      const a = place(w, 'a', 0, 0);
      place(w, 'b', 200, 0);
      place(w, 'c', 450, 0); // an annulus paint on the same bearing, for the shape comparison
      windowAround(a, 0);
      const clear = buildFrame(w, 'a');
      expect(contactIds(clear)).toEqual(['b']);
      expect(eventsOf(clear, 'blip')).toHaveLength(1); // c alone — b is a contact, never doubled
      injectPuff(w, 'sk1', 'z', 100, 0);
      const smoked = buildFrame(w, 'a');
      expect(contactIds(smoked)).toEqual([]);
      const blips = eventsOf(smoked, 'blip');
      expect(blips).toHaveLength(2); // c's annulus paint + b's in-bubble paint
      for (const blip of blips) expect(Object.keys(blip)).toEqual(BLIP_KEYS); // byte-identical key order to an annulus blip
      const text = JSON.stringify(blips);
      for (const forbidden of ['"id"', '"cls"', '"heading"', '"speed"', '"x"', '"y"']) expect(text).not.toContain(forbidden);
    });

    it('the same scene with an ISLAND instead of the puff: nothing — islands block every sensor (Eric 2026-08-02)', () => {
      const w = bareWorld();
      const a = place(w, 'a', 0, 0);
      place(w, 'b', 200, 0);
      w.map.islands.push(circleIsland(100, 0, 30));
      windowAround(a, 0);
      const f = buildFrame(w, 'a');
      expect(contactIds(f)).toEqual([]);
      expect(eventsOf(f, 'blip')).toHaveLength(0);
    });

    it('the same scene with the puff but NOT swept: nothing (the beam term still gates the paint)', () => {
      const w = bareWorld();
      const a = place(w, 'a', 0, 0);
      place(w, 'b', 200, 0);
      injectPuff(w, 'sk1', 'z', 100, 0);
      windowAround(a, Math.PI); // the beam is on the far side
      const f = buildFrame(w, 'a');
      expect(contactIds(f)).toEqual([]);
      expect(eventsOf(f, 'blip')).toHaveLength(0);
    });

    it('a DECOY at (200,0) behind the puff paints its small blip and never rides the `decoy` channel (anything afloat paints exactly when a ship there would)', () => {
      const w = bareWorld();
      const a = place(w, 'a', 0, 0);
      place(w, 'b', 900, 900);
      addDecoy(w.decoys, 'b', 200, 0, 'd1');
      windowAround(a, 0);
      expect((buildFrame(w, 'a').decoys ?? []).map((d) => d.id)).toEqual(['d1']);
      injectPuff(w, 'sk1', 'b', 100, 0);
      const f = buildFrame(w, 'a');
      expect(f.decoys).toBeUndefined();
      expect(eventsOf(f, 'blip')).toHaveLength(1);
    });
  });

  it('an observer INSIDE a puff (amendment 149): hidden from a clear observer outside it, and itself seeing only 82.5 u — a hull at 100 u in the clear is NOT a contact, one at 60 u is', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    place(w, 'b', 100, 0);
    place(w, 'c', 60, 0);
    injectPuff(w, 'sk1', 'z', 0, 0); // a stands in it (r40); b and c are out in the clear
    steps(w, 1); // the per-tick stamp
    expect(a.inSmoke).toBe(true);
    expect(sightOf(a, w.now)).toBe(82.5);
    expect(contactIds(buildFrame(w, 'a'))).toEqual(['c']); // 60 ≤ 82.5 < 100
    expect(contactIds(buildFrame(w, 'b'))).toEqual(['c']); // b sees nothing INTO the puff (a's centre is inside it); c is clear
    expect(contactIds(buildFrame(w, 'c'))).toEqual(['b']); // c (not in smoke) likewise never sees a
  });

  it("a clear observer's OWN puff hides a hull behind it exactly like anyone's (no owner exemption — ownership plays no part in smoke)", () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'b', 200, 0);
    injectPuff(w, 'sk1', 'a', 100, 0); // a's own trail, on the a→b segment
    steps(w, 1);
    expect(contactIds(buildFrame(w, 'a'))).toEqual([]);
    expect(contactIds(buildFrame(w, 'b'))).toEqual([]);
  });

  it('FLARE + SMOKE (ruling 142): the owned lit zone reveals NOTHING through a puff on the segment; a puff BEHIND the hull and an ISLAND never block the flare', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'b', 500, 0); // beyond sight (330): only the flare can reveal it
    expect(contactIds(buildFrame(w, 'a'))).toEqual([]);
    w.litZones.set('z1', { id: 'z1', ownerId: 'a', x: 500, y: 0, r: 110, until: 999_999 });
    expect(contactIds(buildFrame(w, 'a'))).toEqual(['b']); // lit from above
    injectPuff(w, 'sk1', 'b', 250, 0); // between them
    expect(contactIds(buildFrame(w, 'a'))).toEqual([]); // smoke hides hulls even under a flare
    w.smoke.delete('sk1');
    injectPuff(w, 'sk2', 'b', 600, 0); // BEHIND b — off the a→b segment (100 u past its end, r40)
    expect(contactIds(buildFrame(w, 'a'))).toEqual(['b']);
    w.smoke.delete('sk2');
    w.map.islands.push(circleIsland(250, 0, 60)); // land between them
    expect(contactIds(buildFrame(w, 'a'))).toEqual(['b']); // an island never blocks the flare (no island term)
    injectPuff(w, 'sk3', 'b', 250, 0);
    expect(contactIds(buildFrame(w, 'a'))).toEqual([]); // ...but the puff still does
  });

  it('TORPEDO WATER (ruling 143): an in-bubble `wk` segment behind a puff is not emitted; the radar half is governed by the height march alone', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    windowAround(a, 0);
    w.torpWakes.set('tw', torpWater(w, 250)); // inside sight, beyond the fish's detect bound (247.5)
    expect(eventsOf(buildFrame(w, 'a'), 'wk')).toHaveLength(1);
    injectPuff(w, 'sk1', 'z', 125, 0); // on the a→midpoint segment
    expect(eventsOf(buildFrame(w, 'a'), 'wk')).toHaveLength(0);
    // The RADAR half: the same water at 500 u, the same puff geometry — the
    // shadow march over a flat raster sees no smoke.
    w.smoke.clear();
    w.torpWakes.set('tw', torpWater(w, 500));
    expect(eventsOf(buildFrame(w, 'a'), 'wk')).toHaveLength(1);
    injectPuff(w, 'sk2', 'z', 400, 0);
    expect(eventsOf(buildFrame(w, 'a'), 'wk')).toHaveLength(1);
  });

  it('the DETECT rung: a mine and a decoy 200 u out behind a puff are not sent', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'b', 900, 0);
    w.mines.set('m1', { id: 'm1', ownerId: 'b', x: 200, y: 0, armedAt: 0, kind: 'naval' });
    addDecoy(w.decoys, 'b', 200, -20, 'd1');
    const clear = buildFrame(w, 'a');
    expect(clear.mines.map((m) => m.id)).toEqual(['m1']);
    expect((clear.decoys ?? []).map((d) => d.id)).toEqual(['d1']);
    injectPuff(w, 'sk1', 'b', 100, 0);
    const smoked = buildFrame(w, 'a');
    expect(smoked.mines).toEqual([]);
    expect(smoked.decoys).toBeUndefined();
    // The owner's OWN view is untouched by the puff (owner-always on both rows).
    const own = buildFrame(w, 'b');
    expect(own.mines.map((m) => m.id)).toEqual(['m1']);
    expect((own.decoys ?? []).map((d) => d.id)).toEqual(['d1']);
  });

  it('HALOS + HORN: no `mz`, no `sm`, and `fh` takes the one-step muffle behind a puff', () => {
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
    injectPuff(w, 'sk1', 'b', 200, 0);
    const smoked = buildFrame(w, 'a');
    expect(eventsOf(smoked, 'mz')).toHaveLength(0);
    expect(eventsOf(smoked, 'sm')).toHaveLength(0);
    expect(eventsOf(smoked, 'fh')).toEqual([{ k: 'fh', h: 'standard', b: 0, v: 7 }]); // max(5, 5 + 2): the island muffle, verbatim
  });
});

// ---------------------------------------------------------------------------
// The `smoke` channel — its own gate, its own wire shape
// ---------------------------------------------------------------------------

describe('SMOKE SCREEN — the `smoke` channel (sight + radius, island-only LOS, owner / spectator always)', () => {
  const smokeIds = (f: FrameMsg): string[] => (f.smoke ?? []).map((s) => s.id);

  it('a puff whose centre is within sight + radius rides; one 70 u past sight does not; behind an island it does not', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'b', 900, 900);
    injectPuff(w, 'near', 'b', SIGHT + 20, 0); // 350 ≤ 330 + 40
    injectPuff(w, 'far', 'b', 0, SIGHT + 70); // 400 > 370
    expect(smokeIds(buildFrame(w, 'a'))).toEqual(['near']);
    w.map.islands.push(circleIsland(175, 0, 50)); // land between a and `near`
    expect(smokeIds(buildFrame(w, 'a'))).toEqual([]);
  });

  it('NEAREST-RIM delivery (amendment 148): an island over the puff\'s centre leaves its water-side rim visible — the puff rides, the hull behind it is hidden, and paints as an in-bubble blip when swept', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    place(w, 'b', 300, 0);
    w.map.islands.push(circleIsland(150, 35, 30)); // hides the puff's CENTRE from a, not the a→b line (35 > 30)
    injectPuff(w, 'sk1', 'b', 150, 35); // r40: crosses the a→b line (35 ≤ 40); its rim toward a (≈111, 26) is 40 u off the island's centre — clear
    windowAround(a, 0);
    const f = buildFrame(w, 'a');
    expect(smokeIds(f)).toEqual(['sk1']);
    expect(contactIds(f)).toEqual([]);
    expect(eventsOf(f, 'blip')).toHaveLength(1);
  });

  it('the OWNER always sees its own puffs, however far; a SPECTATOR sees every puff', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'b', 900, 900);
    injectPuff(w, 'mine', 'a', 2000, 0);
    injectPuff(w, 'theirs', 'b', -2000, 0);
    expect(smokeIds(buildFrame(w, 'a'))).toEqual(['mine']);
    expect(smokeIds(buildFrame(w, 'b'))).toEqual(['theirs']);
    expect(smokeIds(buildFrame(w, 'a', 'finished'))).toEqual(['mine', 'theirs']); // unfogged, in lay order
  });

  it('from INSIDE puff A, puff B 100 u away is still in the channel (island-only gate — a puff never hides a puff)', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'b', 900, 900);
    injectPuff(w, 'A', 'b', 0, 0);
    injectPuff(w, 'B', 'b', 100, 0);
    expect(smokeIds(buildFrame(w, 'a'))).toEqual(['A', 'B']);
  });

  it('the wire shape is {id,x,y,t0} in that order — no radius, no owner, no until', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'b', 900, 900);
    injectPuff(w, 'sk9', 'b', 50, 0, w.now - 1234);
    const f = buildFrame(w, 'a');
    expect(f.smoke).toEqual([{ id: 'sk9', x: 50, y: 0, t0: w.now - 1234 }]);
    expect(Object.keys(f.smoke![0])).toEqual(['id', 'x', 'y', 't0']);
    const text = JSON.stringify(f);
    expect(text).not.toContain('ownerId');
    expect(text).not.toContain('bornAt');
    expect(text).not.toContain('"r"');
    expect(text).not.toContain('until');
  });

  it('a puff dies from the channel the step it expires — never a stale disc on the wire', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    injectPuff(w, 'old', 'z', 50, 0, w.now - SC.lifeMs + DT); // one tick of life left
    expect(smokeIds(buildFrame(w, 'a'))).toEqual(['old']);
    steps(w, 1);
    expect(w.smoke.size).toBe(0);
    expect(buildFrame(w, 'a').smoke).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// STANDING IN SMOKE — amendment 149 (final)
// ---------------------------------------------------------------------------

describe('SMOKE SCREEN — STANDING IN SMOKE (Eric ruling 2026-09-29, amendment 149, final)', () => {
  /** Observer `a` at the origin standing in a fresh r40 puff (nobody's), stamped. */
  function inSmokeWorld(): { w: World; a: ShipRecord } {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    injectPuff(w, 'me', 'z', 0, 0);
    return { w, a };
  }

  it('the stamp: `inSmoke` is false until stepSmoke reads the store, true while any live puff contains the centre, whoever laid it, and false again when the puff dies', () => {
    const { w, a } = inSmokeWorld();
    expect(a.inSmoke).toBe(false);
    steps(w, 1);
    expect(a.inSmoke).toBe(true);
    expect(sightOf(a, w.now)).toBe(82.5); // 660 × 1/8 — its own dial
    expect(sightOf(a, w.now)).toBe(a.stats.radarRange * SC.inSmokeSightFraction);
    w.smoke.delete('me');
    steps(w, 1);
    expect(a.inSmoke).toBe(false);
    expect(sightOf(a, w.now)).toBe(a.stats.sightRange);
  });

  it('the boundary: the centre ON the disc edge (40 u) is in smoke; 41 u is not', () => {
    const w = bareWorld();
    const a = place(w, 'a', 40, 0);
    const b = place(w, 'b', 41, 0);
    injectPuff(w, 'p', 'z', 0, 0);
    steps(w, 1);
    expect(a.inSmoke).toBe(true);
    expect(b.inSmoke).toBe(false);
  });

  it('sees INTO other smoke within 82.5 u, nothing optical beyond it, and its radar still works: (200,0) blip only; (60,0) inside another puff a CONTACT; (150,0) in the clear a blip, not a contact', () => {
    const { w, a } = inSmokeWorld();
    place(w, 'far', 200, 0);
    place(w, 'near', 60, 0);
    place(w, 'mid', 150, 0);
    injectPuff(w, 'other', 'z', 60, 0); // `near` stands in a second puff; a (60 u off) does not
    steps(w, 1);
    expect(a.inSmoke).toBe(true);
    windowAround(a, 0);
    const f = buildFrame(w, 'a');
    expect(contactIds(f)).toEqual(['near']);
    expect(eventsOf(f, 'blip')).toHaveLength(2); // far + mid: ordinary annulus paints beyond 82.5
    // Without the sweep, the radar half vanishes and the contact stays.
    windowAround(a, Math.PI);
    const dark = buildFrame(w, 'a');
    expect(contactIds(dark)).toEqual(['near']);
    expect(eventsOf(dark, 'blip')).toHaveLength(0);
  });

  it('a hull at 100 u in the CLEAR is not a contact for an in-smoke observer (82.5 is the whole optical world); at 60 u behind a THIRD puff on the segment it still is', () => {
    const { w, a } = inSmokeWorld();
    place(w, 'b', 100, 0);
    place(w, 'c', 60, 0);
    injectPuff(w, 'between', 'z', 50, 0); // on the a→c segment, containing neither centre... (50 u from a > 40; 10 u from c ≤ 40 — c stands in it)
    steps(w, 1);
    expect(a.inSmoke).toBe(true);
    expect(contactIds(buildFrame(w, 'a'))).toEqual(['c']);
  });

  it('an ISLAND still blocks an in-smoke observer inside its bubble', () => {
    const { w, a } = inSmokeWorld();
    place(w, 'c', 70, 0);
    w.map.islands.push(circleIsland(50, 0, 8));
    steps(w, 1);
    expect(a.inSmoke).toBe(true);
    expect(contactIds(buildFrame(w, 'a'))).toEqual([]);
  });

  it('mz / sm marks at 200 u are NOT delivered to an in-smoke observer (their 412.5 u halo is clamped to 82.5), at 60 u they are; the horn at 200 u takes the muffle', () => {
    const { w, a } = inSmokeWorld();
    place(w, 'b', 900, 0);
    steps(w, 1);
    expect(a.inSmoke).toBe(true);
    emitWorldEvent(w, { k: 'mz', x: 200, y: 0 });
    emitWorldEvent(w, { k: 'sm', x: 200, y: 0, tier: 1 });
    emitWorldEvent(w, { k: 'fh', h: 'standard', x: 200, y: 0, id: 'b' } as unknown as GameEvent);
    const far = buildFrame(w, 'a');
    expect(eventsOf(far, 'mz')).toHaveLength(0);
    expect(eventsOf(far, 'sm')).toHaveLength(0);
    expect(eventsOf(far, 'fh')).toEqual([{ k: 'fh', h: 'standard', b: 0, v: 6 }]); // ceil(8×200/660)=3 → floor 4 → muffled max(5, 4+2)
    emitWorldEvent(w, { k: 'mz', x: 60, y: 0 });
    emitWorldEvent(w, { k: 'sm', x: 60, y: 0, tier: 1 });
    const near = buildFrame(w, 'a');
    expect(eventsOf(near, 'mz')).toHaveLength(1);
    expect(eventsOf(near, 'sm')).toHaveLength(1);
  });

  it("an in-smoke observer's OWN lit zone reveals nothing to it (\"no matter what\"); the same zone reveals the hull once the observer is clear", () => {
    const { w, a } = inSmokeWorld();
    place(w, 'b', 500, 0);
    w.litZones.set('z1', { id: 'z1', ownerId: 'a', x: 500, y: 0, r: 110, until: 999_999 });
    steps(w, 1);
    expect(a.inSmoke).toBe(true);
    expect(contactIds(buildFrame(w, 'a'))).toEqual([]);
    w.smoke.delete('me');
    steps(w, 1);
    expect(a.inSmoke).toBe(false);
    expect(contactIds(buildFrame(w, 'a'))).toEqual(['b']);
  });

  it('dazzled AND in smoke: 82.5 — the dazzle dial answers (equal numbers today, separate dials)', () => {
    const { w, a } = inSmokeWorld();
    steps(w, 1);
    a.dazzledUntil = w.now + 5_000;
    expect(sightOf(a, w.now)).toBe(a.stats.radarRange * CONFIG.flashShells.sightFraction);
    expect(sightOf(a, w.now)).toBe(82.5);
  });

  it('`OwnShip.inSmoke` rides `you` (true) only while inside, is ABSENT (never false) otherwise, and never rides a contact', () => {
    const { w, a } = inSmokeWorld();
    place(w, 'b', 30, 0); // in the same puff: both in smoke, both see each other (island LOS only, within 82.5)
    place(w, 'c', 300, 0); // in the clear
    steps(w, 1);
    const fa = buildFrame(w, 'a');
    const fb = buildFrame(w, 'b');
    const fc = buildFrame(w, 'c');
    expect(fa.you!.inSmoke).toBe(true);
    expect(fb.you!.inSmoke).toBe(true);
    expect('inSmoke' in fc.you!).toBe(false);
    expect(contactIds(fa)).toEqual(['b']);
    expect('inSmoke' in fa.contacts[0]).toBe(false);
    expect(contactIds(fc)).toEqual([]); // a and b are hidden inside the puff from a clear observer
    expect(JSON.stringify({ ...fc, you: undefined })).not.toContain('inSmoke');
    w.smoke.delete('me');
    steps(w, 1);
    expect('inSmoke' in buildFrame(w, 'a').you!).toBe(false);
    expect(a.inSmoke).toBe(false);
  });

  it('a SINKING hull inside a live puff IS in smoke (1/8 sight, OwnShip.inSmoke true); a SUNK hull is never stamped', () => {
    const { w, a } = inSmokeWorld();
    place(w, 'near', 60, 0);
    place(w, 'far', 100, 0);
    injectPuff(w, 'other', 'z', 60, 0); // `near` stands inside another puff
    steps(w, 1);
    expect(a.inSmoke).toBe(true);
    w.sinkShip('a');
    expect(isSinking(a.lifecycle)).toBe(true);
    steps(w, 1);
    expect(isSinking(a.lifecycle)).toBe(true);
    expect(a.inSmoke).toBe(true);
    expect(sightOf(a, w.now)).toBe(82.5);
    const f = buildFrame(w, 'a');
    expect(f.you!.inSmoke).toBe(true);
    expect(contactIds(f)).toContain('near');
    expect(contactIds(f)).not.toContain('far');
    a.lifecycle = { kind: 'sunk', at: w.now };
    steps(w, 1);
    expect(a.inSmoke).toBe(false);
  });

  it('P1 — a NON-FINITE stern lays nothing: no NaN puff ever enters the store', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    place(w, 'b', 200, 0);
    stock(w, a, 1);
    press(w, a);
    a.state.x = Number.NaN;
    (w as unknown as { stepSmoke(): void }).stepSmoke();
    expect(w.smoke.size).toBe(0);
    a.state.x = 0;
    (w as unknown as { stepSmoke(): void }).stepSmoke();
    expect(w.smoke.size).toBe(1); // the finite pose lays on the next read
    for (const p of w.smoke.values()) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
  });
});
