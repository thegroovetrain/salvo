// Story 10.11 (epic-10 amendment 20) — the standard queue's bot-fill switch.
//
// HC_QUEUE_BOT_FILL is a NUMBER OF SECONDS (Eric 2026-11-10): a finite value
// > 0 turns bot fill on with that hold; anything else leaves the queue as it
// was (arm at CONFIG.match.minHumans, CONFIG's hold, no bots). The parser takes
// the env as an argument, so nothing here touches process.env.
//
// Also here: the queue's arena create bag (queueArenaCreateOptions), the seam
// between the switch and the arena's trusted `botFill`.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClientState } from 'colyseus';
import { CONFIG, MSG, type QueueStatusMsg } from '@salvo/shared';
import { queueFillSettings } from '../rooms/queueFill.js';
import { queueArenaCreateOptions, StandardQueueRoom } from '../rooms/StandardQueueRoom.js';
import { sanitizeRoomOptions, type RoomOptions } from '../rooms/roomOptions.js';

// The matchMaker is an ESM namespace (not spy-able in place), so the whole
// object is replaced for this file's module graph (the lobby.test.ts idiom):
// the queue room's formArena sees these stubs.
const mm = vi.hoisted(() => ({
  createRoom: vi.fn(),
  reserveMultipleSeatsFor: vi.fn(),
  buildSeatReservation: vi.fn(),
}));
vi.mock('colyseus', async (importOriginal) => {
  const real = await importOriginal<typeof import('colyseus')>();
  return { ...real, matchMaker: mm };
});

const OFF = { botFill: false, armMinimum: CONFIG.match.minHumans, queueTimerMs: CONFIG.match.queueTimerMs };

describe('queueFillSettings — HC_QUEUE_BOT_FILL', () => {
  it('is OFF when unset, with CONFIG’s arm minimum and hold', () => {
    expect(queueFillSettings({})).toEqual(OFF);
  });

  it('is OFF for empty, zero, negative and non-numeric values', () => {
    for (const raw of ['', '  ', '0', '-5', 'abc', 'Infinity', '-Infinity', 'NaN', '1e400']) {
      expect(queueFillSettings({ HC_QUEUE_BOT_FILL: raw }), raw).toEqual(OFF);
    }
  });

  it('a positive number of seconds turns it ON: one captain arms, the hold is that many seconds', () => {
    for (const seconds of [60, 5, 300]) {
      expect(queueFillSettings({ HC_QUEUE_BOT_FILL: String(seconds) })).toEqual({
        botFill: true,
        armMinimum: 1,
        queueTimerMs: seconds * 1000,
      });
    }
  });

  it('accepts a fractional number of seconds', () => {
    expect(queueFillSettings({ HC_QUEUE_BOT_FILL: '2.5' }).queueTimerMs).toBe(2500);
  });

  it('is a production switch — not gated on HC_DEV_OPTIONS', () => {
    for (const dev of [undefined, '0', '1']) {
      expect(queueFillSettings({ HC_QUEUE_BOT_FILL: '60', HC_DEV_OPTIONS: dev }).botFill, String(dev)).toBe(true);
    }
  });
});

describe('queueArenaCreateOptions — the queue’s arena create bag', () => {
  it('bot fill OFF: exactly { expectedCaptains } — no botFill, no ticket, no mode', () => {
    expect(queueArenaCreateOptions(3, false)).toEqual({ expectedCaptains: 3 });
  });

  it('bot fill ON: botFill under a VALID trust ticket, and still no mode', () => {
    const bag = queueArenaCreateOptions(1, true);
    expect(bag).toMatchObject({ expectedCaptains: 1, botFill: true });
    expect(bag).not.toHaveProperty('mode');
    // The ticket must be the real one: the arena's sanitizer admits botFill.
    const { sanitized, rejectedKeys } = sanitizeRoomOptions(bag as RoomOptions, false);
    expect(sanitized).toMatchObject({ expectedCaptains: 1, botFill: true });
    expect(sanitized.mode).toBeUndefined();
    expect(rejectedKeys).toEqual([]);
  });
});

// --- the room: the switch reaches the arena create bag -----------------------

interface FakeSocket {
  sessionId: string;
  state: ClientState;
  send: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  leave: ReturnType<typeof vi.fn>;
}

interface QueueHarness {
  onCreate(): void;
  onJoin(client: FakeSocket, options?: unknown): void;
  clients: FakeSocket[];
  clock: { currentTime: number; setInterval: unknown; setTimeout: unknown };
  setMetadata: ReturnType<typeof vi.fn>;
}

describe('StandardQueueRoom — the switch drives arm and form', () => {
  const previous = process.env.HC_QUEUE_BOT_FILL;
  let created: Record<string, unknown>[];

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    created = [];
    mm.createRoom.mockReset().mockImplementation(async (_name: string, options: Record<string, unknown>) => {
      created.push(options);
      return { roomId: 'arena-1' };
    });
    mm.reserveMultipleSeatsFor.mockReset().mockImplementation(async (_room: unknown, seats: unknown[]) =>
      seats.map(() => true));
    mm.buildSeatReservation.mockReset().mockImplementation((_room: unknown, sessionId: string) => ({ sessionId }));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    if (previous === undefined) delete process.env.HC_QUEUE_BOT_FILL;
    else process.env.HC_QUEUE_BOT_FILL = previous;
  });

  /** A real queue room created under `botFill` (the env as Render would set it). */
  function queueRoom(botFill: string | undefined) {
    if (botFill === undefined) delete process.env.HC_QUEUE_BOT_FILL;
    else process.env.HC_QUEUE_BOT_FILL = botFill;
    const ticks: (() => void)[] = [];
    const r = new StandardQueueRoom() as unknown as QueueHarness;
    r.clients = [];
    r.clock = {
      currentTime: 0,
      setInterval: (fn: () => void) => ticks.push(fn),
      setTimeout: () => 0,
    };
    r.setMetadata = vi.fn(() => Promise.resolve());
    r.onCreate();
    const join = (id: string): FakeSocket => {
      const c: FakeSocket = { sessionId: id, state: ClientState.JOINED, send: vi.fn(), error: vi.fn(), leave: vi.fn() };
      r.clients.push(c);
      r.onJoin(c, {});
      return c;
    };
    const runTo = async (ms: number): Promise<void> => {
      r.clock.currentTime = ms;
      for (const fn of ticks) fn();
      // Let formMatch's awaits (createRoom, reserveMultipleSeatsFor) settle.
      await new Promise((resolve) => setImmediate(resolve));
    };
    return { r, join, runTo };
  }

  const lastStatus = (c: FakeSocket): QueueStatusMsg =>
    c.send.mock.calls.filter((call) => call[0] === MSG.queueStatus).at(-1)?.[1] as QueueStatusMsg;

  it('ON: a lone captain arms at join and forms at the hold with a trusted botFill bag', async () => {
    const seconds = 7;
    const { join, runTo } = queueRoom(String(seconds));
    const alice = join('alice');
    expect(lastStatus(alice)).toMatchObject({ n: 1, min: 1, startsInMs: seconds * 1000 });

    await runTo(seconds * 1000 - 1);
    expect(created).toHaveLength(0);
    await runTo(seconds * 1000);
    expect(created).toHaveLength(1);
    const { sanitized } = sanitizeRoomOptions(created[0] as RoomOptions, false);
    expect(sanitized).toMatchObject({ expectedCaptains: 1, botFill: true });
    expect(sanitized.mode).toBeUndefined();
    expect(alice.send).toHaveBeenCalledWith(MSG.seat, { sessionId: 'alice' });
  });

  it('OFF: a lone captain never arms; two form after CONFIG’s hold with NO botFill', async () => {
    const { join, runTo } = queueRoom(undefined);
    const alice = join('alice');
    expect(lastStatus(alice)).toMatchObject({ n: 1, min: CONFIG.match.minHumans, startsInMs: null });
    await runTo(CONFIG.match.queueTimerMs * 3);
    expect(created).toHaveLength(0);

    for (let i = 1; i < CONFIG.match.minHumans; i += 1) join(`c${i}`);
    await runTo(CONFIG.match.queueTimerMs * 3 + CONFIG.match.queueTimerMs);
    expect(created).toEqual([{ expectedCaptains: CONFIG.match.minHumans }]);
  });
});
