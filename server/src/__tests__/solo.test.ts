// SOLO VS AI (Story 6.5) — the server half: the door, the room, the roster.
//
// The story is small in code and large in failure modes, and NONE of the
// failures throw. Every row of the spec's I/O matrix is here, but three of them
// carry the weight:
//
//   THE DOOR      — `create('arena', {solo:true})` is admitted AFTER the PV
//                   gate, and a non-solo direct join is still refused. The flag
//                   is coerced strictly: only the boolean `true`.
//   THE ROSTER    — a bot without a PlayerMeta row is invisible to every
//                   identity surface (`n AFLOAT`, hull colour, nameplates, the
//                   kill feed), while the results table would still be right.
//                   Nothing throws; the player just meets nineteen amber-hollow
//                   UNKNOWN VESSELs. So the rows, hues and names are pinned.
//   THE TIMING    — bots MUST be in world.ships before the Match.update() that
//                   activates: activate() snapshots participants and checkWin()
//                   runs in that same update, so a roster holding only the human
//                   latches an INSTANT VICTORY. The existing suite pins that
//                   insta-finish as CORRECT (drones.test.ts), so nothing else in
//                   the repo would catch it. The control test below reproduces
//                   the late-bot ordering and asserts the wrong outcome it
//                   produces, so the pin above is known to discriminate.
//
// Harness: the bare `new ArenaRoom()` idiom (operability/regatta/zoneSeeds
// tests) with core's own methods stubbed — @colyseus/core's __init never runs,
// so lock/onMessage/setSimulationInterval/clock are injected. The REAL onCreate
// runs, which is the point: the bot fleet's construction ORDER is what is under
// test, and a hand-rolled construction would prove nothing about it.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClientState } from 'colyseus';
import {
  CONFIG,
  PROTOCOL_VERSION,
  REGATTA_HUES,
  REGATTA_NO_HUE,
  SHIP_CLASS_IDS,
  isAfloat,
  type ShipClassId,
} from '@salvo/shared';
import { ArenaRoom, ARENA_DIRECT_JOIN_ERROR } from '../rooms/ArenaRoom.js';
import { sanitizeSolo, type RoomOptions } from '../rooms/roomOptions.js';
import { World } from '../game/world.js';
import { Match, type MatchHooks, type MatchTimings } from '../game/match.js';
import type { ArenaState, PlayerMeta } from '../rooms/schema/ArenaState.js';

const DT = CONFIG.tick.simDtMs;
/** Bots in a solo lobby — DERIVED, exactly as the room derives it. */
const BOTS = CONFIG.map.playerCap - 1;

// --- THE DOOR ---------------------------------------------------------------

describe('the solo door — ArenaRoom.static onAuth (Story 6.5)', () => {
  beforeEach(() => {
    delete process.env.HC_DEV_OPTIONS;
  });

  it('admits solo:true on a production server (no HC_DEV_OPTIONS)', async () => {
    await expect(ArenaRoom.onAuth('', { solo: true, pv: PROTOCOL_VERSION })).resolves.toBe(true);
  });

  it('still refuses a NON-solo direct join without HC_DEV_OPTIONS', async () => {
    await expect(ArenaRoom.onAuth('', { pv: PROTOCOL_VERSION })).rejects.toThrow(ARENA_DIRECT_JOIN_ERROR);
  });

  it('runs the PV gate FIRST — a stale bundle is refused on the solo door too', async () => {
    await expect(ArenaRoom.onAuth('', { solo: true, pv: PROTOCOL_VERSION + 1 })).rejects.toThrow(/refresh/);
    await expect(ArenaRoom.onAuth('', { solo: true })).rejects.toThrow(/refresh/); // missing pv
  });

  it('coerces the flag STRICTLY — a truthy non-boolean is not a solo request', async () => {
    for (const forged of ['true', 1, {}, [], 'solo']) {
      const options = { solo: forged, pv: PROTOCOL_VERSION } as unknown as { pv: number };
      await expect(ArenaRoom.onAuth('', options)).rejects.toThrow(ARENA_DIRECT_JOIN_ERROR);
    }
  });

  it('leaves the dev door exactly as it was', async () => {
    process.env.HC_DEV_OPTIONS = '1';
    await expect(ArenaRoom.onAuth('', { pv: PROTOCOL_VERSION })).resolves.toBe(true);
  });
});

describe('sanitizeSolo — strict, and never dev-gated', () => {
  it('accepts only the boolean true', () => {
    expect(sanitizeSolo(true)).toBe(true);
    for (const bad of ['true', 1, 0, false, null, undefined, {}, []]) {
      expect(sanitizeSolo(bad)).toBeUndefined();
    }
  });
});

// --- THE ROOM ---------------------------------------------------------------

interface FakeClient {
  sessionId: string;
  state: ClientState;
  send: ReturnType<typeof vi.fn>;
  leave: ReturnType<typeof vi.fn>;
}

/** The room's private surface this suite drives (see the header on the idiom). */
interface SoloRoom {
  world: World;
  match: Match | null;
  state: ArenaState;
  clients: FakeClient[];
  lock: ReturnType<typeof vi.fn>;
  onCreate(options?: RoomOptions): void;
  onJoin(client: FakeClient, options?: unknown): void;
  syncRoster(): void;
}

function fakeClient(id: string): FakeClient {
  return { sessionId: id, state: ClientState.JOINED, send: vi.fn(), leave: vi.fn() };
}

/** A real onCreate on a bare room, with core's own methods injected. */
function room(options: RoomOptions): SoloRoom {
  const r = new ArenaRoom() as unknown as SoloRoom & Record<string, unknown>;
  r.lock = vi.fn(() => Promise.resolve());
  r.unlock = vi.fn(() => Promise.resolve());
  r.disconnect = vi.fn(() => Promise.resolve());
  r.broadcast = vi.fn();
  r.onMessage = vi.fn();
  r.setSimulationInterval = vi.fn();
  r.clock = { setInterval: vi.fn(), setTimeout: vi.fn() };
  r.clients = [];
  r.onCreate(options);
  return r;
}

/** The solo room the production client asks for (plus a pinned map seed and a
 *  short countdown where a test needs to reach 'active' — dev options only). */
function soloRoom(extra: RoomOptions = {}): SoloRoom {
  return room({ solo: true, ...extra });
}

function join(r: SoloRoom, id: string, options: Record<string, unknown> = {}): FakeClient {
  const c = fakeClient(id);
  r.clients.push(c);
  r.onJoin(c, options);
  return c;
}

/** One sim step, in the room's own order (world then match) — the body of
 *  runStep minus the frame fan-out no test client is listening for. */
function step(r: SoloRoom, ticks = 1): void {
  for (let i = 0; i < ticks; i += 1) {
    r.world.step(DT);
    r.match?.update();
  }
}

function bots(r: SoloRoom): { id: string; name: string; hullId: string }[] {
  return [...r.world.ships.values()].filter((s) => s.role === 'bot');
}

function rosterColors(r: SoloRoom): number[] {
  const out: number[] = [];
  r.state.players.forEach((meta: PlayerMeta) => out.push(meta.color));
  return out;
}

describe('the solo room — construction', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    delete process.env.HC_DEV_OPTIONS;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fills the lobby to the PLAYER CAP with bots — a derived count, not a constant', () => {
    const r = soloRoom();
    expect(bots(r)).toHaveLength(BOTS);
    expect(BOTS + 1).toBe(CONFIG.map.playerCap); // one human completes the lobby
    expect(r.world.ships.size).toBe(BOTS); // nothing else in the water yet
  });

  it('THE TIMING PIN: every bot is in the water BEFORE the first tick and before any Match.update', () => {
    const r = soloRoom();
    // Zero ticks have run: setSimulationInterval is stubbed, so onCreate is the
    // only thing that has executed. A bot built even one tick later than this
    // would miss activate()'s participant snapshot.
    expect(r.world.tick).toBe(0);
    expect(r.match?.phase).toBe('waiting');
    expect(bots(r)).toHaveLength(BOTS);
    expect(bots(r).every((b) => isAfloat(r.world.ships.get(b.id)!.lifecycle))).toBe(true);
  });

  it('locks the room at birth (a solo room is private, which is the security argument)', () => {
    const r = soloRoom();
    expect(r.lock).toHaveBeenCalledTimes(1);
  });

  it('builds NO bots for an ordinary arena (the control)', () => {
    process.env.HC_DEV_OPTIONS = '1';
    const r = room({});
    expect(r.world.ships.size).toBe(0);
    expect(r.state.players.size).toBe(0);
  });

  it('gives every bot a roster row with a REAL Regatta hue — never the drone-grey sentinel', () => {
    const r = soloRoom();
    expect(r.state.players.size).toBe(BOTS);
    const colors = rosterColors(r);
    for (const c of colors) {
      expect(c).not.toBe(REGATTA_NO_HUE);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThan(REGATTA_HUES.length);
    }
    expect(new Set(colors).size).toBe(BOTS); // distinct — no two bots share a hue
  });

  it('names every bot from the callsign pool, without repeat', () => {
    const r = soloRoom();
    const names = bots(r).map((b) => b.name);
    expect(names.every((n) => n.length > 0)).toBe(true);
    expect(new Set(names).size).toBe(BOTS);
    for (const b of bots(r)) expect(r.state.players.get(b.id)!.name).toBe(b.name);
  });

  it('deals a BALANCED class spread (6/6/7 across 19), all three hulls present', () => {
    const counts = new Map<string, number>();
    const r = soloRoom();
    for (const b of bots(r)) counts.set(b.hullId, (counts.get(b.hullId) ?? 0) + 1);
    expect([...counts.keys()].sort()).toEqual([...SHIP_CLASS_IDS].sort());
    expect([...counts.values()].sort()).toEqual([6, 6, 7]);
  });

  it('varies WHICH class takes the odd seat across rooms (the order is rolled, not fixed)', () => {
    // The shuffle rides the room's seeded stream, which is keyed off the map
    // seed — so across many rooms the 7-seat class must not be constant.
    const odd = new Set<string>();
    for (let i = 0; i < 12 && odd.size < 2; i += 1) {
      const r = soloRoom();
      const counts = new Map<string, number>();
      for (const b of bots(r)) counts.set(b.hullId, (counts.get(b.hullId) ?? 0) + 1);
      for (const [hull, n] of counts) if (n === 7) odd.add(hull);
    }
    expect(odd.size).toBeGreaterThan(1);
  });
});

describe('the solo room — the human joins', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    process.env.HC_DEV_OPTIONS = '1'; // for the short-countdown override only
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.HC_DEV_OPTIONS;
  });

  it('arms the countdown with ONE human aboard (expectedCaptains 1, minHumans 1)', () => {
    const r = soloRoom();
    expect(r.match?.phase).toBe('waiting');
    join(r, 'alice');
    // No second captain is coming, and none is waited for: the boarding gate is
    // satisfied by the whole cohort (1) being aboard.
    expect(r.match?.phase).toBe('countdown');
  });

  it('reads 20 AFLOAT: a full roster of participants, never 1', () => {
    const r = soloRoom();
    join(r, 'alice');
    r.syncRoster();
    let afloat = 0;
    r.state.players.forEach((meta: PlayerMeta) => {
      if (meta.alive) afloat += 1;
    });
    expect(r.state.players.size).toBe(CONFIG.map.playerCap);
    expect(afloat).toBe(CONFIG.map.playerCap);
  });

  it('runs a real match rather than latching an instant human victory', () => {
    const r = soloRoom({ matchOverride: { countdownMs: 100 } });
    join(r, 'alice');
    step(r, 10); // well past the countdown
    expect(r.match?.phase).toBe('active');
    expect(r.match?.winnerId).toBe('');
    // The participant snapshot caught the whole field, so every bot can place,
    // be recorded sunk, and win.
    expect(r.world.ships.size).toBe(CONFIG.map.playerCap);
    step(r, 20);
    expect(r.match?.phase).toBe('active'); // still a match, twenty hulls in
  });

  it('the human KEEPS a preference a bot is already flying — the two SWAP hues', () => {
    const r = soloRoom();
    // Take a hue a bot is DEMONSTRABLY flying (a literal would be the free hue
    // one room in twenty, and the swap would never be exercised).
    const holder = bots(r)[0];
    const pref = r.state.players.get(holder.id)!.color;
    const before = rosterColors(r);
    join(r, 'alice', { colorPref: pref });
    expect(r.state.players.get('alice')!.color).toBe(pref); // the player keeps their choice
    expect(r.state.players.get(holder.id)!.color).not.toBe(pref);
    // ...and the bot took the hue the human would otherwise have flown: the
    // wheel is still a bijection over 20 hulls.
    const after = rosterColors(r);
    expect(new Set(after).size).toBe(CONFIG.map.playerCap);
    expect(new Set(after)).toEqual(new Set([...Array(REGATTA_HUES.length).keys()]));
    expect(before).toHaveLength(BOTS);
  });

  it('grants a FREE preference verbatim with no swap at all', () => {
    const r = soloRoom();
    const taken = new Set(rosterColors(r));
    const free = [...Array(REGATTA_HUES.length).keys()].find((h) => !taken.has(h))!;
    join(r, 'alice', { colorPref: free });
    expect(r.state.players.get('alice')!.color).toBe(free);
    expect(new Set(rosterColors(r)).size).toBe(CONFIG.map.playerCap);
  });

  it('with NO preference the human simply takes the free hue (no bot is disturbed)', () => {
    const r = soloRoom();
    const before = new Map<string, number>();
    r.state.players.forEach((meta: PlayerMeta, id: string) => before.set(id, meta.color));
    join(r, 'alice');
    for (const [id, hue] of before) expect(r.state.players.get(id)!.color).toBe(hue);
    expect(new Set(rosterColors(r)).size).toBe(CONFIG.map.playerCap);
  });

  it('redraws a BOT whose callsign collides with the player’s (case-insensitively)', () => {
    const r = soloRoom();
    const victim = bots(r)[3];
    const clash = victim.name;
    join(r, 'alice', { name: clash.toLowerCase() });
    const renamed = r.world.ships.get(victim.id)!;
    expect(renamed.name).not.toBe(clash);
    expect(r.state.players.get(victim.id)!.name).toBe(renamed.name); // the row followed
    // No bot flies the player's callsign, and the fleet's names are still unique.
    const names = bots(r).map((b) => b.name);
    expect(names.some((n) => n.toUpperCase() === clash.toUpperCase())).toBe(false);
    expect(new Set(names).size).toBe(BOTS);
    expect(r.state.players.get('alice')!.name).toBe(clash.toLowerCase());
  });

  it('leaves every bot name alone when the player’s callsign is their own', () => {
    const r = soloRoom();
    const before = bots(r).map((b) => b.name);
    join(r, 'alice', { name: 'ERIC' });
    expect(bots(r).map((b) => b.name)).toEqual(before);
  });
});

// --- THE DISCRIMINATOR ------------------------------------------------------
//
// The pin above asserts an ORDERING, and an ordering assertion is only worth
// what the wrong order costs. This reproduces the wrong order directly on
// World+Match — bots added AFTER the activating update — and asserts the exact
// damage: an instant human victory over an empty ocean, with the bots that
// arrived a tick late holding no place at all.

describe('bots one tick late — the failure the timing pin exists to catch', () => {
  function hooks(calls: string[]): MatchHooks {
    return {
      lock: () => calls.push('lock'),
      unlock: () => calls.push('unlock'),
      broadcastResults: () => calls.push('results'),
      requeue: () => calls.push('requeue'),
      disconnect: () => calls.push('disconnect'),
    };
  }
  const TIMINGS: MatchTimings = { countdownMs: 100, resultsMs: 200, joinWindowMs: 0, minHumans: 1, expectedCaptains: 1 };

  it('a LATE fleet latches an instant victory for the lone human (and no bot places)', () => {
    const w = new World(1);
    w.map.islands.length = 0;
    const calls: string[] = [];
    const m = new Match(w, TIMINGS, hooks(calls));
    w.addShip('alice', 'ALICE');
    m.notifyRosterChanged();
    for (let i = 0; i < 10; i += 1) {
      w.step(DT);
      m.update();
    }
    // THE DAMAGE: the match is already decided before the fleet exists.
    expect(m.winnerId).toBe('alice');
    for (let i = 0; i < 5; i += 1) w.addBot();
    expect(m.placements.size).toBeLessThanOrEqual(1); // no bot can ever place here
  });

  it('the SAME timings with the fleet built first run a real match instead', () => {
    const w = new World(1);
    w.map.islands.length = 0;
    const calls: string[] = [];
    const m = new Match(w, TIMINGS, hooks(calls));
    for (let i = 0; i < 5; i += 1) w.addBot();
    w.addShip('alice', 'ALICE');
    m.notifyRosterChanged();
    for (let i = 0; i < 10; i += 1) {
      w.step(DT);
      m.update();
    }
    expect(m.phase).toBe('active');
    expect(m.winnerId).toBe('');
  });
});

// --- world.addBot(hull) / world.renameBot ------------------------------------

describe('World.addBot — the optional class (Story 6.5)', () => {
  it('honours a supplied hull class', () => {
    const w = new World(1);
    w.map.islands.length = 0;
    for (const hull of SHIP_CLASS_IDS) expect(w.addBot(hull).hullId).toBe(hull);
  });

  it('with NO argument behaves exactly as it shipped — same classes, same order', () => {
    const shipped: ShipClassId[] = [];
    const a = new World(7);
    a.map.islands.length = 0;
    for (let i = 0; i < 8; i += 1) shipped.push(a.addBot().hullId as ShipClassId);
    const b = new World(7);
    b.map.islands.length = 0;
    const again = Array.from({ length: 8 }, () => b.addBot().hullId as ShipClassId);
    expect(again).toEqual(shipped);
  });

  it('a forced class does not shift the stream for the enrollments after it', () => {
    // The controller still ROLLS a class and discards it, so callsigns (and
    // every later class roll) land in the same order either way.
    const a = new World(9);
    a.map.islands.length = 0;
    const b = new World(9);
    b.map.islands.length = 0;
    a.addBot();
    b.addBot('battleship');
    expect(a.addBot().hullId).toBe(b.addBot().hullId);
    expect([...a.ships.values()].map((s) => s.name)).toEqual([...b.ships.values()].map((s) => s.name));
  });
});

describe('World.renameBot', () => {
  it('draws a fresh unused callsign and leaves the hull alone', () => {
    const w = new World(3);
    w.map.islands.length = 0;
    const rec = w.addBot('mineLayer');
    const was = rec.name;
    const next = w.renameBot(rec.id);
    expect(next).not.toBeNull();
    expect(next).not.toBe(was);
    expect(rec.name).toBe(next);
    expect(rec.hullId).toBe('mineLayer'); // nothing but the name moved
    expect(rec.role).toBe('bot');
  });

  it('refuses an unknown id and a human captain', () => {
    const w = new World(3);
    w.map.islands.length = 0;
    w.addShip('alice', 'ALICE');
    expect(w.renameBot('nobody')).toBeNull();
    expect(w.renameBot('alice')).toBeNull();
    expect(w.ships.get('alice')!.name).toBe('ALICE');
  });
});
