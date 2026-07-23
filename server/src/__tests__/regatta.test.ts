// Regatta Hoist personal-hue assignment (game/regatta.ts) + the join-option
// sanitizer (rooms/roomOptions.ts sanitizeColorPref). Pure functions — the full
// FCFS / nearest-free / random-free / exhaustion matrix (Eric ruling 2026-07-23),
// plus the plumbing sanitizer. Deterministic: the no-preference path draws off a
// seeded mulberry32 (no Math.random).

import { describe, it, expect, vi } from 'vitest';
import { REGATTA_HUES, REGATTA_NO_HUE, mulberry32, type Rng } from '@salvo/shared';
import { ClientState } from 'colyseus';
import { assignHue } from '../game/regatta.js';
import { sanitizeColorPref } from '../rooms/roomOptions.js';
import { World } from '../game/world.js';
import { ArenaRoom } from '../rooms/ArenaRoom.js';
import { PlayerMeta } from '../rooms/schema/ArenaState.js';

const WHEEL = REGATTA_HUES.length; // 20
const rng = () => mulberry32(0x1234);

describe('assignHue — FCFS personal-hue assignment', () => {
  it('grants a FREE preference verbatim', () => {
    expect(assignHue(new Set([1, 2, 3]), 7, rng())).toBe(7);
    expect(assignHue(new Set(), 0, rng())).toBe(0);
    expect(assignHue(new Set(), 19, rng())).toBe(19);
  });

  it('a TAKEN preference falls to the nearest free hue, ties resolving CLOCKWISE (ascending)', () => {
    // pref 7 taken; 6 + 8 also taken; 5 and 9 both free at distance 2 → 9 wins (7+2).
    expect(assignHue(new Set([6, 7, 8]), 7, rng())).toBe(9);
  });

  it('nearest-free picks the strictly closer side when there is no tie', () => {
    // pref 7 taken, 8 free (distance 1) beats 5 (distance 2).
    expect(assignHue(new Set([6, 7]), 7, rng())).toBe(8);
    // pref 7 taken, 8 taken, 6 free (distance 1) — the only distance-1 free hue.
    expect(assignHue(new Set([7, 8]), 7, rng())).toBe(6);
  });

  it('nearest-free wraps around the wheel ends', () => {
    // pref 0 taken, 1 taken, 19 free (distance 1, wrapping) beats 2 (distance 2).
    expect(assignHue(new Set([0, 1]), 0, rng())).toBe(19);
  });

  it('NO preference draws a uniformly-random FREE hue off the seeded stream (deterministic)', () => {
    const used = new Set([0, 1, 2]);
    const a = assignHue(used, undefined, rng());
    const b = assignHue(used, undefined, rng()); // same seed → same draw
    expect(a).toBe(b);
    expect(used.has(a)).toBe(false); // never a taken hue
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(WHEEL);
  });

  it('the no-preference draw only ever lands on free hues (100 draws, distinct seeds)', () => {
    const used = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]); // half the wheel taken
    for (let s = 0; s < 100; s++) {
      const hue = assignHue(used, undefined, mulberry32(s));
      expect(used.has(hue)).toBe(false);
      expect(hue).toBeGreaterThanOrEqual(10);
    }
  });

  it('defensively survives a full wheel (unreachable at cap 20): joinOrder % 20, else 0, never throws', () => {
    const full = new Set(Array.from({ length: WHEEL }, (_, i) => i));
    // No joinOrder → 0 (the pure-function default; pref is ignored on exhaustion).
    expect(assignHue(full, 5, rng())).toBe(0);
    expect(assignHue(full, undefined, rng())).toBe(0);
    // With a joinOrder the fallback spreads unavoidable duplicates by joinOrder % 20.
    expect(assignHue(full, undefined, rng(), 23)).toBe(3); // 23 % 20
    expect(assignHue(full, 5, rng(), 40)).toBe(0); // 40 % 20 (pref still ignored)
  });

  it('range-guards an out-of-range preference to the no-pref path (25 / -1 / 3.5)', () => {
    // A caller that skipped sanitizeColorPref must not be able to grant a bad hue:
    // an out-of-range pref falls through to the seeded free-draw. With a single
    // free hue, that draw is deterministic (index 7), proving the guard fired.
    const almostFull = new Set(Array.from({ length: WHEEL }, (_, i) => i).filter((i) => i !== 7));
    expect(assignHue(almostFull, 25, rng())).toBe(7);
    expect(assignHue(almostFull, -1, rng())).toBe(7);
    expect(assignHue(almostFull, 3.5, rng())).toBe(7);
  });

  it('sequential FCFS joins (no preference) never collide — 20 distinct hues fill the wheel', () => {
    const stream = mulberry32(0xabc);
    const used = new Set<number>();
    for (let i = 0; i < WHEEL; i++) {
      const hue = assignHue(used, undefined, stream);
      expect(used.has(hue)).toBe(false); // fresh every time
      used.add(hue);
    }
    expect(used.size).toBe(WHEEL); // the whole wheel, uniquely
  });

  it('an earlier join holds a contended preference; the later one flies the nearest free hue', () => {
    const used = new Set<number>();
    const first = assignHue(used, 7, rng()); // free → 7
    used.add(first);
    const second = assignHue(used, 7, rng()); // 7 taken → nearest free (8, distance 1)
    used.add(second);
    expect(first).toBe(7);
    expect(second).toBe(8);
    expect(first).not.toBe(second);
  });
});

describe('sanitizeColorPref — join-option plumbing (never dev-gated)', () => {
  it('accepts every valid wheel index 0..19', () => {
    for (let i = 0; i < WHEEL; i++) expect(sanitizeColorPref(i)).toBe(i);
  });

  it('rejects out-of-range / fractional / non-number / absent → undefined', () => {
    expect(sanitizeColorPref(20)).toBeUndefined(); // == WHEEL, out of range
    expect(sanitizeColorPref(-1)).toBeUndefined();
    expect(sanitizeColorPref(3.5)).toBeUndefined();
    expect(sanitizeColorPref('7')).toBeUndefined();
    expect(sanitizeColorPref(NaN)).toBeUndefined();
    expect(sanitizeColorPref(null)).toBeUndefined();
    expect(sanitizeColorPref(undefined)).toBeUndefined();
    expect(sanitizeColorPref({})).toBeUndefined();
  });
});

// --- room-layer wiring (ArenaRoom.onJoin / fillToCapacity) -------------------
// The pure function above is exercised in isolation; these prove the ROOM wires
// it correctly at join time. Harness mirrors operability.test.ts's joinRoom: a
// bare `new ArenaRoom()` never runs @colyseus/core's __init(), so world/state/
// clock/hueRng are plain injected properties and a fake client is a literal with
// spies. joinCounter/droneCounter come from the class-field defaults (0).

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
  hueRng: Rng;
  onJoin(client: FakeClient, options?: unknown): void;
  fillToCapacity(): void;
  usedHues(): Set<number>;
}

function fakeClient(id: string): FakeClient {
  return { sessionId: id, state: ClientState.JOINED, send: vi.fn(), leave: vi.fn() };
}

function joinRoom(): JoinRoom {
  const room = new ArenaRoom() as unknown as JoinRoom;
  const w = new World(1);
  w.map.islands.length = 0;
  room.world = w;
  room.match = null;
  room.state = { players: new Map(), mapSeed: 1, mapRadius: w.map.radius };
  room.clients = [];
  room.clock = { setTimeout: vi.fn() };
  room.hueRng = mulberry32(1);
  return room;
}

/** Run onJoin for a fresh client (core pushes it into clients before onJoin). */
function join(room: JoinRoom, id: string, options: Record<string, unknown> = {}): FakeClient {
  const c = fakeClient(id);
  room.clients.push(c);
  room.onJoin(c, options);
  return c;
}

describe('ArenaRoom.onJoin — Regatta hue assignment wiring (Story 1.12)', () => {
  it('assigns a valid 0..19 wheel hue to the joiner’s roster meta (and sends welcome)', () => {
    const room = joinRoom();
    const c = join(room, 'alice');
    const color = room.state.players.get('alice')!.color;
    expect(color).toBeGreaterThanOrEqual(0);
    expect(color).toBeLessThan(REGATTA_HUES.length);
    expect(c.send).toHaveBeenCalled(); // welcome
  });

  it('two joins with the SAME colorPref: the first holds it, the second gets the nearest free hue', () => {
    const room = joinRoom();
    join(room, 'a', { colorPref: 7 });
    join(room, 'b', { colorPref: 7 });
    expect(room.state.players.get('a')!.color).toBe(7);
    expect(room.state.players.get('b')!.color).not.toBe(7);
    expect(room.state.players.get('b')!.color).toBe(8); // nearest free, ascending on tie
  });

  it('fillToCapacity drones keep the 255 sentinel — never a wheel hue', () => {
    const room = joinRoom();
    join(room, 'human');
    room.fillToCapacity();
    const drones = [...room.state.players.values()].filter((m) => m.id.startsWith('drone-'));
    expect(drones.length).toBeGreaterThan(0);
    for (const d of drones) expect(d.color).toBe(REGATTA_NO_HUE);
  });

  it('usedHues excludes the 255 sentinel (drones never reserve a wheel index)', () => {
    const room = joinRoom();
    join(room, 'human', { colorPref: 3 });
    room.fillToCapacity(); // drones join at color 255
    const used = room.usedHues();
    expect(used.has(REGATTA_NO_HUE)).toBe(false);
    expect(used.has(3)).toBe(true); // only the human's hue is reserved
    expect(used.size).toBe(1);
  });

  it('an invalid colorPref (25) falls to the no-pref path — still a valid wheel hue', () => {
    const room = joinRoom();
    join(room, 'a', { colorPref: 25 });
    const color = room.state.players.get('a')!.color;
    expect(color).toBeGreaterThanOrEqual(0);
    expect(color).toBeLessThan(REGATTA_HUES.length); // 25 sanitized away, never granted verbatim
  });
});
