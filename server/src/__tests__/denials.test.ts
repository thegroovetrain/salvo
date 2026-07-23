// Story 1.10 — the SELF-PRIVATE denial channel (FrameMsg.denied): FR12's
// "denied fire is never silent" made authoritative. The matrix below drives
// every wire reason end-to-end through the REAL input path (submitInput →
// step → buildFrame): 'out-of-arc' (torpedo click astern), 'cooling' (weapon
// click against an empty reloading pool), 'no-ammo' (ability press against an
// empty pool), and 'blocked' (stern drops landing in a rock / off the water).
// Every denial spends NOTHING (round/charge + reload untouched), reaches ONLY
// the pressing client's own frame (owner-only — never another observer, never
// a spectator frame), lives exactly one tick, and never queues for drones.
// The pv join gate is re-pinned here too: a pv-9 (previous-protocol) client
// must be rejected at matchmake time after this story's 9→10 bump.

import { describe, it, expect } from 'vitest';
import { CONFIG, PROTOCOL_VERSION, type InputMsg } from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { buildFrame } from '../game/frames.js';
import { protocolVersionError } from '../rooms/roomOptions.js';

/** World with no islands (directed cases add their own geometry). */
function bareWorld(seed = 7): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  return w;
}

/** Add a ship and teleport it to an exact pose (speed 0). */
function place(
  w: World,
  id: string,
  x: number,
  y: number,
  heading = 0,
  hull: 'torpedoBoat' | 'battleship' | 'mineLayer' = 'torpedoBoat',
): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), false, hull);
  rec.state.x = x;
  rec.state.y = y;
  rec.state.heading = heading;
  rec.state.speed = 0;
  return rec;
}

/** A neutral-driving input with the given press fields. */
function input(seq: number, extra: Partial<InputMsg> = {}): InputMsg {
  return {
    seq,
    throttle: 0,
    rudder: 0,
    aim: 0,
    fireSeq: 0,
    aimDist: 0,
    slot: 0,
    fireT: 0,
    actSeq: 0,
    actSlot: 0,
    ...extra,
  };
}

describe('denial channel — the four wire reasons (I/O matrix)', () => {
  it("out-of-arc: an astern torpedo click denies {slot,'out-of-arc',fireSeq} and keeps the fish", () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0, 0); // TB, bow along +x
    place(w, 'b', 100, 0);
    w.submitInput('a', input(1, { fireSeq: 1, slot: 1, aim: Math.PI })); // dead astern — far outside ±30°
    w.step();
    const fa = buildFrame(w, 'a');
    expect(fa.denied).toEqual([{ slot: 1, reason: 'out-of-arc', seq: 1 }]);
    // Denied presses spend NOTHING: the round is kept and no reload started.
    expect(a.loadout[1].state).toEqual({ n: 1, reloadMsLeft: 0 });
    // SELF-PRIVATE: the other captain's frame is byte-free of the channel.
    expect('denied' in buildFrame(w, 'b')).toBe(false);
  });

  it("cooling: a weapon click against an empty (reloading) pool denies {'cooling'} — the reload-boundary race made explicit", () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    w.submitInput('a', input(1, { fireSeq: 1, slot: 0, aimDist: 100 }));
    w.step(); // click 1 fires the gun (pool 1 → 0, reload starts)
    expect('denied' in buildFrame(w, 'a')).toBe(false);
    w.submitInput('a', input(2, { fireSeq: 2, slot: 0, aimDist: 100 }));
    w.step(); // click 2 lands mid-cooldown — the previously-silent case
    expect(buildFrame(w, 'a').denied).toEqual([{ slot: 0, reason: 'cooling', seq: 2 }]);
    // Nothing further spent: the pool stays empty with its reload running.
    expect(a.loadout[0].state!.n).toBe(0);
    expect(a.loadout[0].state!.reloadMsLeft).toBeGreaterThan(0);
  });

  it("no-ammo: a within-RTT ability double press denies {'no-ammo'} keyed on the press's actSeq", () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0); // TB: slot 2 = speedBoost (1 charge)
    w.submitInput('a', input(1, { actSeq: 1, actSlot: 2 }));
    w.step(); // press 1 activates (charge 1 → 0)
    expect(a.boostUntil).toBeGreaterThan(0);
    expect('denied' in buildFrame(w, 'a')).toBe(false);
    w.submitInput('a', input(2, { actSeq: 2, actSlot: 2 }));
    w.step(); // press 2, pool empty — silently swallowed before 1.10
    expect(buildFrame(w, 'a').denied).toEqual([{ slot: 2, reason: 'no-ammo', seq: 2 }]);
  });

  for (const [label, slot] of [
    ['mine', 1],
    ['decoy', 2],
  ] as const) {
    it(`blocked (island): a ${label} stern drop into a rock denies {'blocked'} and consumes NOTHING`, () => {
      const w = bareWorld();
      const a = place(w, 'a', 0, 0, 0, 'mineLayer'); // stern rack drops at (-76, 0)
      w.map.islands.push({ x: -76, y: 0, r: 20 }); // the rock the stern is backed against
      w.submitInput('a', input(1, { actSeq: 1, actSlot: slot }));
      w.step();
      expect(buildFrame(w, 'a').denied).toEqual([{ slot, reason: 'blocked', seq: 1 }]);
      // Charge AND reload untouched — the previously wasted charge is kept.
      expect(a.loadout[slot].state).toEqual({ n: 1, reloadMsLeft: 0 });
      expect(w.mines.size).toBe(0);
      expect(w.decoys.size).toBe(0);
    });
  }

  it("blocked (boundary): a stern drop off the water disk denies {'blocked'} too", () => {
    const w = bareWorld();
    // Facing map-inward (heading π → bow along −x), stern rack reaches +76u
    // PAST the hull toward +x — beyond the rim from 30u inside it.
    const a = place(w, 'a', w.map.radius - 30, 0, Math.PI, 'mineLayer');
    w.submitInput('a', input(1, { actSeq: 1, actSlot: 1 }));
    w.step();
    expect(buildFrame(w, 'a').denied).toEqual([{ slot: 1, reason: 'blocked', seq: 1 }]);
    expect(a.loadout[1].state).toEqual({ n: 1, reloadMsLeft: 0 });
  });
});

describe('denial channel — lifecycle + privacy edges', () => {
  it('a denial lives exactly one tick (the next frame is byte-free again)', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    w.submitInput('a', input(1, { fireSeq: 1, slot: 1, aim: Math.PI }));
    w.step();
    expect(buildFrame(w, 'a').denied).toHaveLength(1);
    w.step(); // no new press — the stored fireSeq reads as "no new click"
    expect('denied' in buildFrame(w, 'a')).toBe(false);
  });

  it('a spectator frame NEVER carries the channel, even when a denial exists this tick', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    w.submitInput('a', input(1, { fireSeq: 1, slot: 1, aim: Math.PI }));
    w.step();
    expect(w.denialsFor('a')).toHaveLength(1); // the denial IS pending this tick
    // The finished-phase (spectator) build of the SAME observer omits it: the
    // spectator path structurally never reads the denial store.
    expect('denied' in buildFrame(w, 'a', 'finished')).toBe(false);
  });

  it('drones never queue denials (no client, no channel)', () => {
    const w = bareWorld();
    const d = w.addShip('d1', 'DRONE', true, 'droneSmall'); // universal fit: slot 1 = torpedo
    d.state.x = 0;
    d.state.y = 0;
    d.state.heading = 0;
    w.submitInput('d1', input(1, { fireSeq: 1, slot: 1, aim: Math.PI })); // astern — would deny
    w.step();
    expect(w.denialsFor('d1')).toBeUndefined();
  });

  it("the gate's dead refusal stays server-internal (no wire denial for a dead press)", () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    w.respawnEnabled = false;
    w.sinkShip('a');
    w.submitInput('a', input(1, { fireSeq: 1, slot: 0 }));
    w.step(); // fireControl skips dead ships entirely — nothing queues
    expect(w.denialsFor('a')).toBeUndefined();
  });
});

describe('pv join gate — the 9→10 bump is enforced at matchmake', () => {
  it('rejects a pv-9 (previous protocol) client and a missing pv; accepts the current one', () => {
    expect(PROTOCOL_VERSION).toBe(10);
    expect(protocolVersionError(9)).toMatch(/refresh/);
    expect(protocolVersionError(undefined)).toMatch(/refresh/);
    expect(protocolVersionError(PROTOCOL_VERSION)).toBeNull();
  });
});

describe('blocked-drop geometry sanity (the ratified stern rack)', () => {
  it('an ML with open water astern still drops normally (the check refuses only illegal water)', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0, 0, 'mineLayer');
    w.map.islands.push({ x: 200, y: 200, r: 40 }); // a rock nowhere near the rack
    w.submitInput('a', input(1, { actSeq: 1, actSlot: 1 }));
    w.step();
    expect(w.mines.size).toBe(1);
    expect('denied' in buildFrame(w, 'a')).toBe(false);
    // The drop point is the SAME ratified stern rack as before (heading + π,
    // hull-clear + trigger margin): 88/2 + 32 = 76u dead astern.
    const mine = [...w.mines.values()][0];
    expect(mine.x).toBeCloseTo(-76, 6);
    expect(mine.y).toBeCloseTo(0, 6);
    expect(CONFIG.mine.offset).toBeCloseTo(Math.PI, 12);
  });
});
