// Transport-level flood guard (story 0.1): the 0.17 room must carry the
// CONFIG-declared limit, and the limit must be sized for burst DELIVERY
// (Colyseus counts msgs by server-side arrival in 1s windows — a wifi stall
// flushes several seconds of queued 20Hz inputs into one window).
import { describe, expect, it } from 'vitest';
import { CONFIG } from '@salvo/shared';
import { ArenaRoom } from '../rooms/ArenaRoom.js';

describe('transport rate limit', () => {
  it('sizes CONFIG.net.maxMessagesPerSecond for burst delivery, not just send cadence', () => {
    const sendRate = 1000 / CONFIG.tick.simDtMs; // input sampler cadence (20/s)
    // Colyseus severs a dead socket after ~8s of failed pings; the worst honest
    // burst is that whole backlog + the live cadence arriving in one window.
    expect(CONFIG.net.maxMessagesPerSecond).toBeGreaterThanOrEqual(sendRate * 9);
    expect(Number.isFinite(CONFIG.net.maxMessagesPerSecond)).toBe(true);
  });

  it('wires the CONFIG limit onto the room property Colyseus enforces', () => {
    const room = new ArenaRoom();
    expect(room.maxMessagesPerSecond).toBe(CONFIG.net.maxMessagesPerSecond);
  });
});
