// The room-level amendment-10 pin (Story 3.1 review gate): ArenaRoom's world
// must receive CALLER-SUPPLIED per-ring zone seed material — the guarantee
// that ring offsets are not derivable from the client-known mapSeed otherwise
// rests on one un-pinned line in buildWorld. Harness mirrors the established
// bare-`new ArenaRoom()` idiom (rateLimit/regatta/operability tests): core's
// __init never runs, but buildWorld touches nothing core-owned, so it is
// drivable directly.

import { describe, it, expect } from 'vitest';
import type { World } from '../game/world.js';
import type { SanitizedRoomOptions } from '../rooms/roomOptions.js';
import { ArenaRoom } from '../rooms/ArenaRoom.js';

interface BuildRoom {
  buildWorld(seed: number, sanitized: SanitizedRoomOptions): World;
}

const buildWorld = (seed: number): World =>
  (new ArenaRoom() as unknown as BuildRoom).buildWorld(seed, {});

describe('ArenaRoom zone seeds — the amendment-10 room pin', () => {
  it('two rooms on the SAME map seed roll DIFFERENT rings (private nonces reach the world)', () => {
    // If buildWorld stopped passing zoneSeeds, both worlds would fall back to
    // the map-seed derivation and roll IDENTICAL rings — this pin fails.
    const a = buildWorld(1234);
    const b = buildWorld(1234);
    a.startZone(0);
    b.startZone(0);
    expect(a.map).toEqual(b.map); // the map itself stays seed-deterministic
    a.step();
    b.step();
    // Compare the terminal rings after collapsing time forward: cheapest is to
    // compare the revealed prefix at the same instant — the first reveal.
    const dtToReveal = 2 * 60000 + 50; // group 0 reveal beat (production beatMs)
    while (a.now < dtToReveal) a.step();
    while (b.now < dtToReveal) b.step();
    const ringA = a.zoneRevealedNextRing;
    const ringB = b.zoneRevealedNextRing;
    expect(ringA).not.toBeNull();
    expect(ringB).not.toBeNull();
    // Radii are CONFIG-derived and equal; the CENTERS are the private part.
    expect(ringA!.r).toBeCloseTo(ringB!.r, 9);
    expect([ringA!.cx, ringA!.cy]).not.toEqual([ringB!.cx, ringB!.cy]);
  });
});
