// Transport-level flood guard (story 0.1): the 0.17 room must carry the
// CONFIG-declared limit, and the limit must be sized for burst DELIVERY
// (Colyseus counts msgs by server-side arrival in 1s windows — a wifi stall
// flushes several seconds of queued 20Hz inputs into one window).
import { describe, expect, it } from 'vitest';
import { CONFIG } from '@salvo/shared';
import { ArenaRoom } from '../rooms/ArenaRoom.js';

describe('transport rate limit', () => {
  // Colyseus severs a dead socket after ~8s of failed pings; the worst honest
  // burst is that whole backlog + the live cadence landing in one 1s arrival
  // window. This constant is THE named home of that assumption — the comments
  // in constants.ts and ArenaRoom.ts point here rather than restating it.
  const WORST_STALL_WINDOWS = 9; // ~8s ping-sever backlog + 1 live window

  it('sizes CONFIG.net.maxMessagesPerSecond for burst delivery, not just send cadence', () => {
    const sendRate = 1000 / CONFIG.tick.simDtMs; // input sampler cadence (20/s)
    expect(CONFIG.net.maxMessagesPerSecond).toBeGreaterThanOrEqual(sendRate * WORST_STALL_WINDOWS);
    expect(Number.isFinite(CONFIG.net.maxMessagesPerSecond)).toBe(true);
  });

  it('wires the CONFIG limit onto the room property Colyseus enforces', () => {
    const room = new ArenaRoom();
    expect(room.maxMessagesPerSecond).toBe(CONFIG.net.maxMessagesPerSecond);
  });
});
