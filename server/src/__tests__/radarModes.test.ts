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
  bearing,
  hullSilhouette,
  mulberry32,
  perpendicularExtent,
  transformPolygon,
  wrapPositive,
  type BlipEvent,
  type FrameMsg,
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

const blipsOf = (f: FrameMsg): BlipEvent[] => f.events.filter((e): e is BlipEvent => e.k === 'blip');

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

// ---------- the return grammar (AC5, R2, amendment 66) -------------------------

describe('return grammar — the pose deletion and the aspect-only ext scalar', () => {
  it('a return-mode frame contains NO cls, heading, or speed on ANY blip — and ext matches the shared aspect primitive', () => {
    const w = bareWorld(52, { radarGrammar: 'return' });
    const a = place(w, 'a', 0, 0);
    place(w, 'bb', 400, 0, 0.9, 'battleship');
    place(w, 'tb', 0, 420, 2.1, 'torpedoBoat');
    place(w, 'ml', -450, 0, -0.4, 'mineLayer');
    a.prevSweepAngle = 0; // one window sweeping the full circle minus ε
    a.sweepAngle = wrapPositive(-1e-9);
    const blips = blipsOf(buildFrame(w, 'a'));
    expect(blips).toHaveLength(3);
    for (const ev of blips) {
      // The actual deletion, pinned (AC5): the 4.2 pose channels are GONE.
      expect(Object.keys(ev)).toEqual(['k', 'id', 'x', 'y', 't', 'ext']);
      for (const forbidden of ['cls', 'heading', 'speed']) {
        expect(forbidden in (ev as object)).toBe(false);
      }
      // ext = perpendicularExtent(transformPolygon(hull, 0, 0, heading), bearing)
      // — pure aspect geometry in world units, per the spec's formula verbatim.
      const target = w.ships.get(ev.id)!;
      const expected = perpendicularExtent(
        transformPolygon(hullSilhouette(target.hullId), 0, 0, target.state.heading),
        bearing(a.state, target.state),
      );
      expect((ev as ReturnBlipEvent).ext).toBe(expected);
      expect((ev as ReturnBlipEvent).ext).toBeGreaterThan(0);
    }
  });

  it('R2: ext carries NO range term — the same hull at the same aspect paints the identical ext near and far', () => {
    const w = bareWorld(53, { radarGrammar: 'return' });
    const a = place(w, 'a', 0, 0);
    const b = place(w, 'b', 360, 0, 1.1, 'battleship'); // just past sight, bearing 0
    windowAround(a, 0);
    const near = blipsOf(buildFrame(w, 'a'))[0] as ReturnBlipEvent;
    b.state.x = RADAR; // same bearing (0), same heading — much farther
    windowAround(a, 0);
    const far = blipsOf(buildFrame(w, 'a'))[0] as ReturnBlipEvent;
    expect(near.ext).toBe(far.ext); // attenuation is CLIENT render math, never the wire
  });

  it('ext is aspect-DEPENDENT: the same hull painted bow-on reads smaller than abeam (the design thesis, on the wire)', () => {
    const w = bareWorld(54, { radarGrammar: 'return' });
    const a = place(w, 'a', 0, 0);
    const b = place(w, 'b', 400, 0, 0, 'battleship'); // bow-on to the observer (bearing 0, heading 0)
    windowAround(a, 0);
    const bowOn = blipsOf(buildFrame(w, 'a'))[0] as ReturnBlipEvent;
    b.state.heading = Math.PI / 2; // abeam
    windowAround(a, 0);
    const abeam = blipsOf(buildFrame(w, 'a'))[0] as ReturnBlipEvent;
    expect(abeam.ext).toBeGreaterThan(bowOn.ext);
  });

  it("AMENDMENT 66's ANTI-CHEAT BOUND (fail-proven): ext is UNCHANGED by granting boons or changing hp/damage state", () => {
    const w = bareWorld(55, { radarGrammar: 'return' });
    const a = place(w, 'a', 0, 0);
    const b = place(w, 'b', 400, 0, 0.9, 'battleship');
    windowAround(a, 0);
    const before = blipsOf(buildFrame(w, 'a'))[0] as ReturnBlipEvent;
    // Wound the target deep into the tier-2 smoke band AND grant it boons —
    // including shipHull, which moves maxHp and heals — none of which is hull
    // geometry or relative bearing, so NONE of it may reach the echo.
    b.hp = b.stats.maxHp * 0.1;
    w.applyBoon(b, 'shipHull');
    w.applyBoon(b, 'gunDamage');
    w.applyBoon(b, 'intelRadar');
    windowAround(a, 0);
    const after = blipsOf(buildFrame(w, 'a'))[0] as ReturnBlipEvent;
    expect(after.ext).toBe(before.ext);
    // The OBSERVER's own non-vision boons change nothing either.
    w.applyBoon(a, 'gunDamage');
    windowAround(a, 0);
    const observed = blipsOf(buildFrame(w, 'a'))[0] as ReturnBlipEvent;
    expect(observed.ext).toBe(before.ext);
  });

  it('the gate did NOT move: silhouette and return worlds paint the same ships on the same tick (only the shape branches)', () => {
    // Two worlds, identical seed and scene, different grammar: who paints is
    // byte-identical — blipGate is untouched by this cycle (the spec's rule).
    const scene = (opts: WorldOptions): { ids: string[]; keys: string[][] } => {
      const w = bareWorld(56, opts);
      const a = place(w, 'a', 0, 0);
      place(w, 'in', 400, 0, 0.3); // annulus, swept — paints
      place(w, 'out', 0, -400, 0.3); // annulus, unswept — silent
      place(w, 'near', 100, 0, 0.3); // inside sight — contact, never a blip
      windowAround(a, 0);
      const blips = blipsOf(buildFrame(w, 'a'));
      return { ids: blips.map((e) => e.id), keys: blips.map((e) => Object.keys(e)) };
    };
    const sil = scene({});
    const ret = scene({ radarGrammar: 'return' });
    expect(sil.ids).toEqual(['in']);
    expect(ret.ids).toEqual(['in']); // identical visibility…
    expect(sil.keys).toEqual([['k', 'id', 'x', 'y', 't', 'cls', 'heading', 'speed']]);
    expect(ret.keys).toEqual([['k', 'id', 'x', 'y', 't', 'ext']]); // …different wire shape
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
