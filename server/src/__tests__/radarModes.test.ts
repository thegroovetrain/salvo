// THE RADAR REALISM CYCLE — directed server-side coverage for the two mode
// flags (amendments 62-68, spec R1/R2/R3): the pure env resolvers (fail-safe,
// never fail-open), the default-mode byte regression (production is identical
// until a flag flips), the `return` grammar's pose-channel DELETION and its
// aspect-only `ext` scalar (amendment 66's anti-cheat bound, pinned), the
// pseudonym identity namespace (stable per-match track ids off the server-
// private stream), and the adapter seam (ArenaRoom reads process.env, World
// never does; the welcome announces the modes). The behavioral fog-of-war
// invariant runs over all four mode combinations in perception.test.ts; the
// decoy indistinguishability law under both flags lives in decoy.test.ts.

import { describe, it, expect, vi } from 'vitest';
import { ClientState } from 'colyseus';
import {
  CONFIG,
  MSG,
  coverageCellCount,
  coverageHas,
  mulberry32,
  rasterizeHullCoverage,
  wrapPositive,
  type FrameMsg,
  type HullCoverage,
  type ReturnBlipEvent,
  type SilhouetteBlipEvent,
  type WelcomeMsg,
} from '@salvo/shared';
import {
  World,
  resolveRadarGrammar,
  resolveRadarIdentity,
  type ShipRecord,
  type WorldOptions,
} from '../game/world.js';
import { buildFrame } from '../game/frames.js';
import { ArenaRoom } from '../rooms/ArenaRoom.js';
import { PlayerMeta } from '../rooms/schema/ArenaState.js';
import type { SanitizedRoomOptions } from '../rooms/roomOptions.js';

const RADAR = CONFIG.vision.radar;

// ---------- construction helpers (the perception.test idiom) ------------------

function bareWorld(seed = 50, opts: WorldOptions = {}): World {
  const w = new World(seed, CONFIG.match.fillTo, CONFIG.zone, opts);
  w.map.islands.length = 0;
  return w;
}

function place(w: World, id: string, x: number, y: number, heading = 0, hull: Parameters<World['addShip']>[3] = 'torpedoBoat'): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), false, hull);
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

/** Silhouette-grammar frames — narrow straight to the 4.2 shape. */
const blipsOf = (f: FrameMsg): SilhouetteBlipEvent[] => f.events.filter((e): e is SilhouetteBlipEvent => e.k === 'blip');
/** `return`-grammar frames — the cycle-63 coverage footprint. */
const returnBlipsOf = (f: FrameMsg): ReturnBlipEvent[] => f.events.filter((e): e is ReturnBlipEvent => e.k === 'blip');
/** The footprint half of a wire blip, as a comparable record. */
const maskOf = (e: ReturnBlipEvent): HullCoverage => ({ gx: e.gx, gy: e.gy, w: e.w, h: e.h, bits: e.bits });

// ---------- the pure resolvers (fail-safe, never fail-open) -------------------

describe('resolveRadarGrammar / resolveRadarIdentity — fail-safe env resolution', () => {
  it('exact flag values select the new modes', () => {
    expect(resolveRadarGrammar('return')).toBe('return');
    expect(resolveRadarIdentity('pseudonym')).toBe('pseudonym');
  });

  it('absent, empty, mis-cased, and garbage values ALL fall back to the shipped behavior', () => {
    for (const raw of [undefined, '', 'RETURN', 'Return', 'silhouette ', 'blob', '1', 'true']) {
      expect(resolveRadarGrammar(raw)).toBe('silhouette');
    }
    for (const raw of [undefined, '', 'PSEUDONYM', 'Pseudonym', 'roster ', 'anon', '1', 'true']) {
      expect(resolveRadarIdentity(raw)).toBe('roster');
    }
    // The literal defaults are legal inputs too (idempotent, not just fallback).
    expect(resolveRadarGrammar('silhouette')).toBe('silhouette');
    expect(resolveRadarIdentity('roster')).toBe('roster');
  });
});

// ---------- default-mode regression (AC4) -------------------------------------

describe('default modes — production behavior is byte-identical until a flag flips', () => {
  it('an optionless World runs silhouette/roster, and a paint carries the exact 4.2 shape', () => {
    const w = bareWorld(51);
    expect(w.radarGrammar).toBe('silhouette');
    expect(w.radarIdentity).toBe('roster');
    const a = place(w, 'a', 0, 0);
    const b = place(w, 'b', 400, 0, 0.7);
    b.state.speed = 12;
    windowAround(a, 0);
    const blips = blipsOf(buildFrame(w, 'a'));
    expect(blips).toEqual([
      { k: 'blip', id: 'b', x: 400, y: 0, t: w.now, cls: 'torpedoBoat', heading: 0.7, speed: 12 },
    ]);
    // Key ORDER pinned too (msgpack wire shape — Object.keys, not toEqual).
    expect(Object.keys(blips[0])).toEqual(['k', 'id', 'x', 'y', 't', 'cls', 'heading', 'speed']);
  });
});

// ---------- the return grammar (cycle 63, amendments 151-155) -------------------

describe('return grammar — THE SERVER RASTERIZES THE HULL: a coverage footprint and nothing else', () => {
  const CELL = CONFIG.vision.radarCellU;
  const RETURN_KEYS = ['k', 't', 'gx', 'gy', 'w', 'h', 'bits'] as const satisfies readonly (keyof ReturnBlipEvent)[];
  const FORBIDDEN = ['id', 'x', 'y', 'ext', 'cls', 'heading', 'speed'];

  it('a return-mode frame carries EXACTLY {k,t,gx,gy,w,h,bits} on every blip — no id, no position, no ext, no pose (amendment 152)', () => {
    const w = bareWorld(52, { radarGrammar: 'return' });
    const a = place(w, 'a', 0, 0);
    place(w, 'bb', 400, 0, 0.9, 'battleship');
    place(w, 'tb', 0, 420, 2.1, 'torpedoBoat');
    place(w, 'ml', -450, 0, -0.4, 'mineLayer');
    a.prevSweepAngle = 0; // one window sweeping the full circle minus ε
    a.sweepAngle = wrapPositive(-1e-9);
    const blips = returnBlipsOf(buildFrame(w, 'a'));
    expect(blips).toHaveLength(3);
    // Each footprint must be the TRUE hull polygon rasterized at its TRUE pose
    // — matched exactly once each, since the wire no longer says which is which.
    const expected = [
      rasterizeHullCoverage('battleship', 400, 0, 0.9, CELL),
      rasterizeHullCoverage('torpedoBoat', 0, 420, 2.1, CELL),
      rasterizeHullCoverage('mineLayer', -450, 0, -0.4, CELL),
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
    const w = bareWorld(53, { radarGrammar: 'return' });
    const a1 = place(w, 'a1', 0, 0);
    const a2 = place(w, 'a2', 120, -260);
    const b = place(w, 'b', 400, 0, 1.1, 'battleship');
    windowAround(a1, Math.atan2(b.state.y - a1.state.y, b.state.x - a1.state.x));
    windowAround(a2, Math.atan2(b.state.y - a2.state.y, b.state.x - a2.state.x));
    const seen1 = returnBlipsOf(buildFrame(w, 'a1'));
    const seen2 = returnBlipsOf(buildFrame(w, 'a2'));
    // Compare the footprint that matches b's true raster, which must appear
    // for BOTH observers, byte-identical — moving the observer moves nothing.
    const truth = JSON.stringify(rasterizeHullCoverage('battleship', 400, 0, 1.1, CELL));
    const of1 = seen1.filter((e) => JSON.stringify(maskOf(e)) === truth);
    const of2 = seen2.filter((e) => JSON.stringify(maskOf(e)) === truth);
    expect(of1).toHaveLength(1);
    expect(of2).toHaveLength(1);
  });

  it('a bow-on hull and a broadside hull of the same class produce DIFFERENT rects — the footprint finally points the way the hull does', () => {
    const w = bareWorld(54, { radarGrammar: 'return' });
    const a = place(w, 'a', 0, 0);
    const b = place(w, 'b', 400, 0, 0, 'battleship'); // heading +x: long axis in x
    windowAround(a, 0);
    const bowOn = returnBlipsOf(buildFrame(w, 'a'))[0];
    b.state.heading = Math.PI / 2; // long axis in y
    windowAround(a, 0);
    const abeam = returnBlipsOf(buildFrame(w, 'a'))[0];
    // Heading +x: the rect is much wider than tall; heading +y: the reverse.
    expect(bowOn.w).toBeGreaterThan(bowOn.h * 2);
    expect(abeam.h).toBeGreaterThan(abeam.w * 2);
    // ...and the covered cells trace the hull, not a line across the bearing:
    // the mask is deeper than one cell on BOTH axes for a battleship.
    expect(bowOn.h).toBeGreaterThan(1);
    expect(abeam.w).toBeGreaterThan(1);
  });

  it('ANTI-CHEAT (fail-proven): the footprint is UNCHANGED by granting boons or changing hp/damage state', () => {
    const w = bareWorld(55, { radarGrammar: 'return' });
    const a = place(w, 'a', 0, 0);
    const b = place(w, 'b', 400, 0, 0.9, 'battleship');
    windowAround(a, 0);
    const before = returnBlipsOf(buildFrame(w, 'a'))[0];
    // Wound the target deep into the tier-2 smoke band AND grant it boons —
    // including shipHull, which moves maxHp and heals — none of which is hull
    // geometry or pose, so NONE of it may reach the footprint.
    b.hp = b.stats.maxHp * 0.1;
    w.applyBoon(b, 'shipHull');
    w.applyBoon(b, 'gunDamage');
    w.applyBoon(b, 'intelRadar');
    windowAround(a, 0);
    const after = returnBlipsOf(buildFrame(w, 'a'))[0];
    expect(maskOf(after)).toEqual(maskOf(before));
    // The OBSERVER's own non-vision boons change nothing either.
    w.applyBoon(a, 'gunDamage');
    windowAround(a, 0);
    const observed = returnBlipsOf(buildFrame(w, 'a'))[0];
    expect(maskOf(observed)).toEqual(maskOf(before));
  });

  it('the gate did NOT move: silhouette and return worlds paint the same ships on the same tick (only the shape branches)', () => {
    // Two worlds, identical seed and scene, different grammar: WHO paints is
    // byte-identical — blipGate is untouched by this cycle (amendment 154).
    const scene = (opts: WorldOptions): FrameMsg => {
      const w = bareWorld(56, opts);
      const a = place(w, 'a', 0, 0);
      place(w, 'in', 400, 0, 0.3); // annulus, swept — paints
      place(w, 'out', 0, -400, 0.3); // annulus, unswept — silent
      place(w, 'near', 100, 0, 0.3); // inside sight — contact, never a blip
      windowAround(a, 0);
      return buildFrame(w, 'a');
    };
    const sil = blipsOf(scene({}));
    expect(sil.map((e) => e.id)).toEqual(['in']);
    expect(sil.map((e) => Object.keys(e))).toEqual([['k', 'id', 'x', 'y', 't', 'cls', 'heading', 'speed']]);
    const ret = returnBlipsOf(scene({ radarGrammar: 'return' }));
    expect(ret).toHaveLength(1); // identical visibility…
    expect(Object.keys(ret[0])).toEqual([...RETURN_KEYS]); // …different wire shape
    // The one footprint is the swept ship's, and neither hidden ship leaks:
    // the mask lights the cell containing (400, 0) and equals that hull's raster.
    const cellOfU = (v: number): number => Math.floor(v / CELL);
    expect(coverageHas(maskOf(ret[0]), cellOfU(400) - ret[0].gx, cellOfU(0) - ret[0].gy)).toBe(true);
    expect(maskOf(ret[0])).toEqual(rasterizeHullCoverage('torpedoBoat', 400, 0, 0.3, CELL));
  });
});

// ---------- pseudonym identity (AC6, R3) ---------------------------------------

describe('pseudonym identity — stable per-match track ids off the server-private stream', () => {
  it('no blip id equals ANY roster ship id, and the track id is stable across paints and ticks', () => {
    const w = bareWorld(57, { radarIdentity: 'pseudonym' });
    const a = place(w, 'a', 0, 0);
    place(w, 'b', 400, 0, 0.7);
    windowAround(a, 0);
    const first = blipsOf(buildFrame(w, 'a'));
    expect(first).toHaveLength(1);
    expect(w.ships.has(first[0].id)).toBe(false); // never a roster id
    expect(first[0].id).toBe(w.pseudonymFor('b')); // the target's stable track id
    // The SAME track id on a later tick's paint — stable for the match.
    w.step();
    windowAround(a, 0);
    const second = blipsOf(buildFrame(w, 'a'));
    expect(second).toHaveLength(1);
    expect(second[0].id).toBe(first[0].id);
    // The silhouette payload still rides in full (identity ⊥ grammar).
    expect(Object.keys(first[0])).toEqual(['k', 'id', 'x', 'y', 't', 'cls', 'heading', 'speed']);
    expect((first[0] as SilhouetteBlipEvent).cls).toBe('torpedoBoat');
  });

  it('track ids ride the PRIVATE stream: same map seed + different pseudonym seeds ⇒ different tracks (never derivable from the client-known map seed alone)', () => {
    const mkTrack = (pseudonymSeed: number): string => {
      const w = bareWorld(58, { radarIdentity: 'pseudonym', pseudonymSeed });
      w.addShip('p0', 'P0');
      return w.pseudonymFor('p0');
    };
    expect(mkTrack(0xdead_beef)).not.toBe(mkTrack(0x1234_5678)); // seed material decides
    expect(mkTrack(0xdead_beef)).toBe(mkTrack(0xdead_beef)); // …deterministically
  });

  it('every ship gets a distinct track id, and ids survive removeShip (a decoy may impersonate a departed owner)', () => {
    const w = bareWorld(59, { radarIdentity: 'pseudonym' });
    for (let i = 0; i < 12; i++) w.addShip(`p${i}`, `P${i}`);
    const tracks = [...Array(12).keys()].map((i) => w.pseudonymFor(`p${i}`));
    expect(new Set(tracks).size).toBe(12); // all distinct
    const kept = w.pseudonymFor('p3');
    w.removeShip('p3');
    expect(w.pseudonymFor('p3')).toBe(kept); // append-only for the room's lifetime
  });

  it('in roster mode the pseudonym map is INERT on the wire: blips carry roster ids untouched', () => {
    const w = bareWorld(60); // default roster identity
    const a = place(w, 'a', 0, 0);
    place(w, 'b', 400, 0);
    windowAround(a, 0);
    expect(blipsOf(buildFrame(w, 'a')).map((e) => e.id)).toEqual(['b']);
  });
});

// ---------- the adapter seam (ArenaRoom: env in, welcome out) ------------------

// Harness mirrors regatta.test.ts's joinRoom: a bare `new ArenaRoom()` never
// runs @colyseus/core's __init(), so world/state/clock are plain injected
// properties and a fake client is a literal with spies.

interface FakeClient {
  sessionId: string;
  state: ClientState;
  send: ReturnType<typeof vi.fn>;
  leave: ReturnType<typeof vi.fn>;
}

interface JoinRoom {
  world: World;
  match: null;
  state: { players: Map<string, PlayerMeta>; mapSeed: number; mapRadius: number };
  clients: FakeClient[];
  clock: { setTimeout: ReturnType<typeof vi.fn> };
  hueRng: ReturnType<typeof mulberry32>;
  onJoin(client: FakeClient, options?: unknown): void;
  buildWorld(seed: number, sanitized: SanitizedRoomOptions): World;
}

function joinRoom(world: World): JoinRoom {
  const room = new ArenaRoom() as unknown as JoinRoom;
  room.world = world;
  room.match = null;
  room.state = { players: new Map(), mapSeed: 1, mapRadius: world.map.radius };
  room.clients = [];
  room.clock = { setTimeout: vi.fn() };
  room.hueRng = mulberry32(1);
  return room;
}

/** Run buildWorld with the three radar env vars pinned to `env` (undefined =
 *  deleted), restoring the previous process.env values afterward. */
function buildWorldWithEnv(env: { grammar?: string; identity?: string }): World {
  const prevGrammar = process.env.HC_RADAR_GRAMMAR;
  const prevIdentity = process.env.HC_RADAR_IDENTITY;
  try {
    if (env.grammar === undefined) delete process.env.HC_RADAR_GRAMMAR;
    else process.env.HC_RADAR_GRAMMAR = env.grammar;
    if (env.identity === undefined) delete process.env.HC_RADAR_IDENTITY;
    else process.env.HC_RADAR_IDENTITY = env.identity;
    const room = new ArenaRoom() as unknown as JoinRoom;
    return room.buildWorld(1, {} as SanitizedRoomOptions);
  } finally {
    if (prevGrammar === undefined) delete process.env.HC_RADAR_GRAMMAR;
    else process.env.HC_RADAR_GRAMMAR = prevGrammar;
    if (prevIdentity === undefined) delete process.env.HC_RADAR_IDENTITY;
    else process.env.HC_RADAR_IDENTITY = prevIdentity;
  }
}

describe('ArenaRoom — the adapter reads process.env; the welcome announces the modes', () => {
  it('buildWorld resolves HC_RADAR_GRAMMAR / HC_RADAR_IDENTITY from the environment (the adapter seam)', () => {
    const flipped = buildWorldWithEnv({ grammar: 'return', identity: 'pseudonym' });
    expect(flipped.radarGrammar).toBe('return');
    expect(flipped.radarIdentity).toBe('pseudonym');
    const unset = buildWorldWithEnv({});
    expect(unset.radarGrammar).toBe('silhouette');
    expect(unset.radarIdentity).toBe('roster');
    const garbage = buildWorldWithEnv({ grammar: 'BLOB', identity: 'anon' });
    expect(garbage.radarGrammar).toBe('silhouette'); // fail-safe, never fail-open
    expect(garbage.radarIdentity).toBe('roster');
  });

  it('the welcome handshake carries the room modes verbatim (the ONLY place they travel)', () => {
    const world = new World(1, CONFIG.match.fillTo, CONFIG.zone, { radarGrammar: 'return', radarIdentity: 'pseudonym' });
    world.map.islands.length = 0;
    const room = joinRoom(world);
    const c: FakeClient = { sessionId: 'alice', state: ClientState.JOINED, send: vi.fn(), leave: vi.fn() };
    room.clients.push(c);
    room.onJoin(c, {});
    const welcomeCall = c.send.mock.calls.find(([channel]) => channel === MSG.welcome);
    expect(welcomeCall).toBeDefined();
    const welcome = welcomeCall![1] as WelcomeMsg;
    expect(welcome.radarGrammar).toBe('return');
    expect(welcome.radarIdentity).toBe('pseudonym');
  });

  it('a default room welcomes with the shipped modes', () => {
    const world = new World(2);
    const room = joinRoom(world);
    const c: FakeClient = { sessionId: 'bob', state: ClientState.JOINED, send: vi.fn(), leave: vi.fn() };
    room.clients.push(c);
    room.onJoin(c, {});
    const welcome = c.send.mock.calls.find(([channel]) => channel === MSG.welcome)![1] as WelcomeMsg;
    expect(welcome.radarGrammar).toBe('silhouette');
    expect(welcome.radarIdentity).toBe('roster');
  });
});
