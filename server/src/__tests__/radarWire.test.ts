// THE RADAR WIRE — directed server-side coverage for the one blip grammar
// (cycle 63's coverage footprint; cycle 105's ONE-RADAR ruling deleted the
// retired silhouette grammar and the per-room mode flags this file used to
// exercise). What survives here are the pins on the SHIPPED behaviour: the
// identity-free wire shape and its key order, world-anchored observer
// independence, aspect disclosure, the anti-cheat bound (boons/hp never reach
// the mask), the annulus/sweep gate, and the server-private per-match track-id
// stream (World.pseudonymFor — identity never leaves the server, and the
// track map exists so any future identity consumer resolves through one
// seam). The behavioral fog-of-war invariant runs in perception.test.ts; the
// decoy indistinguishability law lives in decoy.test.ts.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  coverageCellCount,
  coverageHas,
  paintCoverage,
  wrapPositive,
  type BlipEvent,
  type FrameMsg,
  type HullCoverage,
} from '@salvo/shared';
import { World, type ShipRecord, type WorldOptions } from '../game/world.js';
import { buildFrame } from '../game/frames.js';
import { flatRaster } from './islandFixture.js';

// ---------- construction helpers (the perception.test idiom) ------------------

/** Islands cleared AND the raster flattened (Story 4.11): real terrain must
 *  not radar-shadow a world the test built as empty water. */
function bareWorld(seed = 50, opts: WorldOptions = {}): World {
  const w = new World(seed, CONFIG.match.fillTo, CONFIG.zone, opts);
  w.map.islands.length = 0;
  w.map.heightRaster = flatRaster();
  return w;
}

function place(w: World, id: string, x: number, y: number, heading = 0, hull: Parameters<World['addShip']>[3] = 'torpedoBoat'): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), 'captain', hull);
  rec.state.x = x;
  rec.state.y = y;
  rec.state.heading = heading;
  rec.state.speed = 0;
  return rec;
}

function windowAround(me: ShipRecord, brg: number, halfWidth = 0.02): void {
  me.prevSweepAngle = wrapPositive(brg - halfWidth);
  me.sweepAngle = wrapPositive(brg + halfWidth);
}

const blipsOf = (f: FrameMsg): BlipEvent[] => f.events.filter((e): e is BlipEvent => e.k === 'blip');
/** The footprint half of a wire blip, as a comparable record. */
const maskOf = (e: BlipEvent): HullCoverage => ({ gx: e.gx, gy: e.gy, w: e.w, h: e.h, bits: e.bits });

// ---------- the wire shape (cycle 63, amendments 151-155) ---------------------

describe('the blip wire — THE SERVER RASTERIZES THE HULL: a coverage footprint and nothing else', () => {
  const CELL = CONFIG.vision.radarCellU;
  const RETURN_KEYS = ['k', 't', 'gx', 'gy', 'w', 'h', 'bits'] as const satisfies readonly (keyof BlipEvent)[];
  const FORBIDDEN = ['id', 'x', 'y', 'ext', 'cls', 'heading', 'speed'];

  it('a frame carries EXACTLY {k,t,gx,gy,w,h,bits} on every blip — no id, no position, no ext, no pose (amendment 152)', () => {
    const w = bareWorld(52);
    const a = place(w, 'a', 0, 0);
    place(w, 'bb', 400, 0, 0.9, 'battleship');
    place(w, 'tb', 0, 420, 2.1, 'torpedoBoat');
    place(w, 'ml', -450, 0, -0.4, 'mineLayer');
    a.prevSweepAngle = 0; // one window sweeping the full circle minus ε
    a.sweepAngle = wrapPositive(-1e-9);
    const blips = blipsOf(buildFrame(w, 'a'));
    expect(blips).toHaveLength(3);
    // Each footprint must be the TRUE hull polygon rasterized at its TRUE pose
    // and fuzzed on the paint tick's seed (cycle-63 review gate: the wire mask
    // is `paintCoverage`, never the sharp rasterization) — matched exactly
    // once each, since the wire does not say which is which.
    const expected = [
      paintCoverage('battleship', 400, 0, 0.9, CELL, w.now),
      paintCoverage('torpedoBoat', 0, 420, 2.1, CELL, w.now),
      paintCoverage('mineLayer', -450, 0, -0.4, CELL, w.now),
    ];
    for (const ev of blips) {
      // Assert on the object's KEYS, order included (msgpack wire shape) — and
      // the retired channels are gone by NAME, not merely by count.
      expect(Object.keys(ev)).toEqual([...RETURN_KEYS]);
      for (const forbidden of FORBIDDEN) expect(forbidden in (ev as object)).toBe(false);
      expect(ev.t).toBe(w.now);
      expect(coverageCellCount(maskOf(ev))).toBeGreaterThan(0); // never an empty mask
      const hit = expected.findIndex((m) => JSON.stringify(m) === JSON.stringify(maskOf(ev)));
      expect(hit).toBeGreaterThanOrEqual(0);
      expected.splice(hit, 1);
    }
    expect(expected).toHaveLength(0); // all three hulls accounted for, once each
  });

  it('the mask is WORLD-ANCHORED and observer-INDEPENDENT: two observers at different positions receive byte-identical footprints', () => {
    const w = bareWorld(53);
    const a1 = place(w, 'a1', 0, 0);
    const a2 = place(w, 'a2', 120, -260);
    const b = place(w, 'b', 400, 0, 1.1, 'battleship');
    windowAround(a1, Math.atan2(b.state.y - a1.state.y, b.state.x - a1.state.x));
    windowAround(a2, Math.atan2(b.state.y - a2.state.y, b.state.x - a2.state.x));
    const seen1 = blipsOf(buildFrame(w, 'a1'));
    const seen2 = blipsOf(buildFrame(w, 'a2'));
    // Compare the footprint that matches b's true raster, which must appear
    // for BOTH observers, byte-identical — moving the observer moves nothing.
    const truth = JSON.stringify(paintCoverage('battleship', 400, 0, 1.1, CELL, w.now));
    const of1 = seen1.filter((e) => JSON.stringify(maskOf(e)) === truth);
    const of2 = seen2.filter((e) => JSON.stringify(maskOf(e)) === truth);
    expect(of1).toHaveLength(1);
    expect(of2).toHaveLength(1);
  });

  it('a bow-on hull and a broadside hull of the same class produce DIFFERENT rects — the footprint points the way the hull does', () => {
    const w = bareWorld(54);
    const a = place(w, 'a', 0, 0);
    const b = place(w, 'b', 400, 0, 0, 'battleship'); // heading +x: long axis in x
    windowAround(a, 0);
    const bowOn = blipsOf(buildFrame(w, 'a'))[0];
    b.state.heading = Math.PI / 2; // long axis in y
    windowAround(a, 0);
    const abeam = blipsOf(buildFrame(w, 'a'))[0];
    // Heading +x: the rect is wider than tall; heading +y: the reverse. The
    // factor is a strict `>` rather than the pre-fuzz 2×: a fuzzed mask's
    // dims are per-paint random variables (amendments 156-157), and the
    // robust every-paint orientation pin lives in shared
    // radarRaster.test.ts — this test pins the WIRE end of the same property.
    expect(bowOn.w).toBeGreaterThan(bowOn.h);
    expect(abeam.h).toBeGreaterThan(abeam.w);
    // ...and the covered cells trace the hull, not a line across the bearing:
    // the mask is deeper than one cell on BOTH axes for a battleship.
    expect(bowOn.h).toBeGreaterThan(1);
    expect(abeam.w).toBeGreaterThan(1);
  });

  it('ANTI-CHEAT (fail-proven): the footprint is UNCHANGED by granting boons or changing hp/damage state', () => {
    const w = bareWorld(55);
    const a = place(w, 'a', 0, 0);
    const b = place(w, 'b', 400, 0, 0.9, 'battleship');
    windowAround(a, 0);
    const before = blipsOf(buildFrame(w, 'a'))[0];
    // Wound the target deep into the tier-2 smoke band AND grant it boons —
    // including shipHull, which moves maxHp and heals — none of which is hull
    // geometry or pose, so NONE of it may reach the footprint.
    b.hp = b.stats.maxHp * 0.1;
    w.applyBoon(b, 'shipHull');
    w.applyBoon(b, 'gunBarrel');
    w.applyBoon(b, 'intelRange');
    windowAround(a, 0);
    const after = blipsOf(buildFrame(w, 'a'))[0];
    expect(maskOf(after)).toEqual(maskOf(before));
    // The OBSERVER's own non-vision boons change nothing either.
    w.applyBoon(a, 'gunBarrel');
    windowAround(a, 0);
    const observed = blipsOf(buildFrame(w, 'a'))[0];
    expect(maskOf(observed)).toEqual(maskOf(before));
  });

  it('the gate: an annulus ship paints only when swept, a sighted ship is a contact and never a blip', () => {
    const w = bareWorld(56);
    const a = place(w, 'a', 0, 0);
    place(w, 'in', 400, 0, 0.3); // annulus, swept — paints
    place(w, 'out', 0, -400, 0.3); // annulus, unswept — silent
    place(w, 'near', 100, 0, 0.3); // inside sight — contact, never a blip
    windowAround(a, 0);
    const f = buildFrame(w, 'a');
    const blips = blipsOf(f);
    expect(blips).toHaveLength(1);
    expect(f.contacts.map((c) => c.id)).toEqual(['near']);
    // The one footprint is the swept ship's, and neither hidden ship leaks:
    // the mask lights the cell containing (400, 0) and equals that hull's raster.
    const cellOfU = (v: number): number => Math.floor(v / CELL);
    expect(coverageHas(maskOf(blips[0]), cellOfU(400) - blips[0].gx, cellOfU(0) - blips[0].gy)).toBe(true);
    expect(maskOf(blips[0])).toEqual(paintCoverage('torpedoBoat', 400, 0, 0.3, CELL, blips[0].t));
  });
});

// ---------- the server-private track-id stream (R3) ---------------------------

describe('pseudonym track ids — the server-private per-match stream survives the ONE-RADAR deletion', () => {
  it('a track id is never a roster id, is stable for the match, and never rides any wire (the blip carries no id at all)', () => {
    const w = bareWorld(57);
    const a = place(w, 'a', 0, 0);
    place(w, 'b', 400, 0, 0.7);
    const track = w.pseudonymFor('b');
    expect(w.ships.has(track)).toBe(false); // never a roster id
    expect(track).toMatch(/^trk-/);
    w.step();
    expect(w.pseudonymFor('b')).toBe(track); // stable for the match
    // The wire never carries it: a painted frame's blips have no id member.
    windowAround(a, 0);
    for (const e of blipsOf(buildFrame(w, 'a'))) expect('id' in (e as object)).toBe(false);
  });

  it('track ids ride the PRIVATE stream: same map seed + different pseudonym seeds ⇒ different tracks (never derivable from the client-known map seed alone)', () => {
    const mkTrack = (pseudonymSeed: number): string => {
      const w = bareWorld(58, { pseudonymSeed });
      w.addShip('p0', 'P0');
      return w.pseudonymFor('p0');
    };
    expect(mkTrack(0xdead_beef)).not.toBe(mkTrack(0x1234_5678)); // seed material decides
    expect(mkTrack(0xdead_beef)).toBe(mkTrack(0xdead_beef)); // …deterministically
  });

  it('every ship gets a distinct track id, and ids survive removeShip (a decoy may impersonate a departed owner)', () => {
    const w = bareWorld(59);
    for (let i = 0; i < 12; i++) w.addShip(`p${i}`, `P${i}`);
    const tracks = [...Array(12).keys()].map((i) => w.pseudonymFor(`p${i}`));
    expect(new Set(tracks).size).toBe(12); // all distinct
    const kept = w.pseudonymFor('p3');
    w.removeShip('p3');
    expect(w.pseudonymFor('p3')).toBe(kept); // append-only for the room's lifetime
  });
});
