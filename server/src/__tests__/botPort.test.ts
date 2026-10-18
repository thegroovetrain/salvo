// THE BOT PORT'S ZONE READOUTS (Story 9.13, epic-9 amendments 190 + 200(3)).
//
// Amendment 190 (Eric 2026-10-17, human parity) widened BotWorldPort by the
// revealed next ring and the zone clock; 200(3) adds the always-safe disc.
// What is pinned here is PARITY and the geometric contract, never a ring size:
//   * zoneNextRing() is exactly the world's revealed ring (the schema's
//     zoneNext* mirror) — null before the reveal beat;
//   * zonePhase() is exactly what a client derives through the shared
//     zoneLiveState from the schema's inputs, tick for tick, and its
//     closesInMs counts down;
//   * zoneSafeDisc() is centred on the live ring with r = 2·r_next − r_live
//     (r_next read off the public ladder, zoneRingRadii over the same zone
//     config), and is contained in the revealed next ring once there is one.

import { describe, it, expect } from 'vitest';
import { CONFIG, zoneLiveState, zoneRingRadii, type ZoneRing, type ZoneTimeline } from '@salvo/shared';
import { World } from '../game/world.js';
import type { BotWorldPort } from '../game/ai/types.js';

/** A quick timeline: CONFIG.zone's own ladder and flags, short beats. */
const CFG: ZoneTimeline = { ...CONFIG.zone, beatMs: 400 };
const EPS = 1e-6;

function world(): { w: World; port: BotWorldPort } {
  const w = new World(7, CONFIG.map.playerCap, CFG);
  // The port the BotController actually holds (private on the controller).
  const port = (w.bots as unknown as { port: BotWorldPort }).port;
  return { w, port };
}

function ladder(w: World): number[] {
  return zoneRingRadii(w.map.radius, CFG);
}

/** What a schema-fed client derives for the clock. */
function clientClock(w: World): { phase: string; closesInMs: number | null } {
  if (w.zonePhase === 'idle') return { phase: 'idle', closesInMs: null };
  const s = zoneLiveState(w.now, w.zoneStartMs, w.zoneCurrentRing, w.zoneRevealedNextRing, CFG);
  return { phase: s.phase, closesInMs: s.phase === 'closed' ? null : s.closesInMs };
}

function contains(outer: ZoneRing, inner: ZoneRing): boolean {
  return Math.hypot(outer.cx - inner.cx, outer.cy - inner.cy) + inner.r <= outer.r + EPS;
}

describe('BotWorldPort zone readouts (amendment 190 — human parity)', () => {
  it('while idle: no next ring, no clock, and the safe disc is cut from ladder rung 1', () => {
    const { w, port } = world();
    expect(port.zoneNextRing()).toBeNull();
    expect(port.zonePhase()).toEqual({ phase: 'idle', closesInMs: null });
    const live = port.zoneLiveRing;
    const disc = port.zoneSafeDisc();
    expect(disc.cx).toBe(live.cx);
    expect(disc.cy).toBe(live.cy);
    expect(disc.r).toBeCloseTo(Math.max(0, 2 * ladder(w)[1] - live.r), 6);
  });

  it('before the reveal the next ring is null and the safe disc is r = 2·r_next − r_cur ≥ 0 on the live centre', () => {
    const { w, port } = world();
    w.startZone();
    w.step();
    expect(port.zonePhase().phase).not.toBe('reveal');
    expect(port.zonePhase().phase).not.toBe('closing');
    expect(port.zoneNextRing()).toBeNull();
    const live = port.zoneLiveRing;
    const disc = port.zoneSafeDisc();
    expect(disc.r).toBeGreaterThanOrEqual(0);
    expect(disc.r).toBeCloseTo(Math.max(0, 2 * ladder(w)[1] - live.r), 6);
    expect([disc.cx, disc.cy]).toEqual([live.cx, live.cy]);
  });

  it('over the whole timeline the clock is the client derivation, the next ring is the revealed one, and the safe disc sits inside it', () => {
    const { w, port } = world();
    w.startZone();
    let sawReveal = false;
    let sawClosed = false;
    let prev: { phase: string; closesInMs: number | null } | null = null;
    for (let t = 0; t < 4000 && !sawClosed; t++) {
      w.step();
      const clock = port.zonePhase();
      expect(clock).toEqual(clientClock(w));
      expect(clock.phase).toBe(w.zonePhase);
      expect(port.zoneNextRing()).toEqual(w.zoneRevealedNextRing);
      const next = port.zoneNextRing();
      const disc = port.zoneSafeDisc();
      expect(disc.r).toBeGreaterThanOrEqual(0);
      if (next !== null) {
        sawReveal = true;
        expect(contains(next, disc)).toBe(true);
      }
      // closesInMs counts DOWN within a phase (it resets only at a boundary).
      if (prev !== null && prev.phase === clock.phase && clock.closesInMs !== null && prev.closesInMs !== null) {
        expect(clock.closesInMs).toBeLessThan(prev.closesInMs);
      }
      if (clock.phase === 'closed') {
        sawClosed = true;
        expect(clock.closesInMs).toBeNull();
        expect(port.zoneSafeDisc()).toEqual(port.zoneLiveRing); // no next rung: the live ring
      }
      prev = clock;
    }
    expect(sawReveal).toBe(true);
    expect(sawClosed).toBe(true);
  });

  it('the port is a live view: the clock it reports moves with the world clock', () => {
    const { w, port } = world();
    w.startZone();
    w.step();
    const a = port.zonePhase().closesInMs!;
    w.step();
    const b = port.zonePhase().closesInMs!;
    expect(b).toBe(a - CONFIG.tick.simDtMs);
    expect(port.now).toBe(w.now);
  });
});
