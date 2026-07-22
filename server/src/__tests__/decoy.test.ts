// Decoy-buoy matrix suite (Story 1.8) — the Mine Layer's slot-2 signature
// ability against the spec's I/O matrix: astern spawn + stationarity, one-live
// replacement, 30s natural expiry, owner-death persistence, no-ammo denial,
// reload cadence, the counterIntel radar deception (blip-gate parity with a
// real ship: annulus boundaries, sweep-crossing tick, island LOS) with the
// WIRE-INDISTINGUISHABILITY proof (a serialized decoy blip is field-for-field
// a ship blip carrying the OWNER's ship id), the no-Hit-Call law (shells and
// bursts pass through; mines never trip on it), and the truesight tiers (owner
// always / sighted enemies / spectators see the buoy view; fogged non-owners
// get nothing on the decoys channel). No Date.now()/Math.random() — fixed
// seeds and scripted inputs only.

import { describe, it, expect } from 'vitest';
import { CONFIG, wrapPositive, type BlipEvent, type FrameMsg } from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { buildFrame } from '../game/frames.js';

const DT = CONFIG.tick.simDtMs;
const SIGHT = CONFIG.vision.sight;
const RADAR = CONFIG.vision.radar;
/** The Mine Layer's decoy slot (Story 1.8 fit: [gun, mine, decoyBuoy, empty]). */
const SLOT_DECOY = 2;
/** Astern drop offset (the mines' stern rack): half the ML hull + trigger margin. */
const DROP_OFFSET = CONFIG.shipClasses.mineLayer.hull.length / 2 + CONFIG.mine.triggerRadius;

function bareWorld(seed = 31): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  return w;
}

/** Add a ship of `hull` and pin it to an exact pose (speed 0). */
function place(w: World, id: string, x: number, y: number, heading = 0, hull: Parameters<World['addShip']>[3] = 'torpedoBoat'): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), false, hull);
  rec.state = { x, y, heading, speed: 0 };
  return rec;
}

/** Submit one fresh ability press (actSeq advance) on `actSlot` for `id`. */
function press(w: World, id: string, seq: number, actSlot: number): void {
  w.submitInput(id, { seq, throttle: 0, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0, actSeq: seq, actSlot });
}

/** Open the observer's paint window around a bearing (without stepping). */
function windowAround(me: ShipRecord, brg: number, halfWidth = 0.02): void {
  me.prevSweepAngle = wrapPositive(brg - halfWidth);
  me.sweepAngle = wrapPositive(brg + halfWidth);
}

/** Drop a decoy buoy directly into world state (perception-facing cases). */
function injectDecoy(w: World, id: string, ownerId: string, x: number, y: number, until = 999_999): void {
  w.decoys.set(id, { id, ownerId, x, y, until });
}

const blipsOf = (f: FrameMsg): BlipEvent[] => f.events.filter((e): e is BlipEvent => e.k === 'blip');

// ---------- lifecycle: spawn / replace / expiry / death / reload --------------

describe('decoy buoy — placement lifecycle', () => {
  it('a press drops the buoy ASTERN (hull-clear), consumes the charge, starts the 20s reload, expires at +30s', () => {
    const w = bareWorld();
    const ml = place(w, 'a', 0, 0, 0, 'mineLayer'); // heading 0 => astern is -x
    press(w, 'a', 1, SLOT_DECOY);
    w.step();
    expect(w.decoys.size).toBe(1);
    const d = [...w.decoys.values()][0];
    expect(d.ownerId).toBe('a');
    expect(d.x).toBeCloseTo(-DROP_OFFSET, 6);
    expect(d.y).toBeCloseTo(0, 6);
    expect(d.until).toBe(w.now + CONFIG.decoyBuoy.durationMs);
    expect(ml.loadout[SLOT_DECOY].state).toEqual({ n: 0, reloadMsLeft: CONFIG.decoyBuoy.reloadMs });
  });

  it('the buoy is STATIONARY: it never moves even as its owner sails away', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0, 0, 'mineLayer');
    press(w, 'a', 1, SLOT_DECOY);
    w.step();
    const before = { ...[...w.decoys.values()][0] };
    w.submitInput('a', { seq: 2, throttle: 1, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0, actSeq: 1, actSlot: SLOT_DECOY });
    for (let i = 0; i < 40; i++) w.step(); // 2s full ahead
    const after = [...w.decoys.values()][0];
    expect({ x: after.x, y: after.y }).toEqual({ x: before.x, y: before.y });
  });

  it('ONE live per owner: a second placement silently replaces the first', () => {
    const w = bareWorld();
    const ml = place(w, 'a', 0, 0, 0, 'mineLayer');
    press(w, 'a', 1, SLOT_DECOY);
    w.step();
    const firstId = [...w.decoys.keys()][0];
    // Reload the pool directly and press again from a new pose.
    ml.loadout[SLOT_DECOY].state = { n: 1, reloadMsLeft: 0 };
    ml.state = { x: 200, y: 0, heading: 0, speed: 0 };
    press(w, 'a', 2, SLOT_DECOY);
    w.step();
    expect(w.decoys.size).toBe(1); // never two
    const second = [...w.decoys.values()][0];
    expect(second.id).not.toBe(firstId); // a NEW buoy, not the old one moved
    expect(second.x).toBeCloseTo(200 - DROP_OFFSET, 6);
    // ...and another owner's buoy is never evicted by it.
    injectDecoy(w, 'other', 'z', 500, 500);
    ml.loadout[SLOT_DECOY].state = { n: 1, reloadMsLeft: 0 };
    press(w, 'a', 3, SLOT_DECOY);
    w.step();
    expect(w.decoys.has('other')).toBe(true);
    expect(w.decoys.size).toBe(2);
  });

  it('expires naturally after durationMs (the step() sweep)', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0, 0, 'mineLayer');
    press(w, 'a', 1, SLOT_DECOY);
    w.step();
    expect(w.decoys.size).toBe(1);
    const steps = Math.ceil(CONFIG.decoyBuoy.durationMs / DT) + 1;
    for (let i = 0; i < steps; i++) w.step();
    expect(w.decoys.size).toBe(0);
  });

  it("survives its owner's death and still dies only by expiry (litZone precedent)", () => {
    const w = bareWorld();
    place(w, 'a', 0, 0, 0, 'mineLayer');
    press(w, 'a', 1, SLOT_DECOY);
    w.step();
    w.respawnEnabled = false; // active-phase policy: the dead stay dead
    w.sinkShip('a');
    for (let i = 0; i < 10; i++) w.step();
    expect(w.decoys.size).toBe(1); // persists past the owner's death
    const steps = Math.ceil(CONFIG.decoyBuoy.durationMs / DT) + 1;
    for (let i = 0; i < steps; i++) w.step();
    expect(w.decoys.size).toBe(0); // natural expiry only
  });

  it('an empty pool denies no-ammo; the reload cadence re-arms a placement after 20s', () => {
    const w = bareWorld();
    const ml = place(w, 'a', 0, 0, 0, 'mineLayer');
    press(w, 'a', 1, SLOT_DECOY);
    w.step();
    // A second press mid-cooldown: denied, nothing changes.
    expect(w.sinkingActivationGate(ml, SLOT_DECOY)).toEqual({ ok: false, reason: 'no-ammo' });
    expect(w.decoys.size).toBe(1);
    // Run the 20s reload out — a fresh press then places (and replaces).
    const firstId = [...w.decoys.keys()][0];
    const steps = Math.ceil(CONFIG.decoyBuoy.reloadMs / DT) + 1;
    for (let i = 0; i < steps; i++) w.step();
    expect(ml.loadout[SLOT_DECOY].state).toEqual({ n: 1, reloadMsLeft: 0 });
    press(w, 'a', 2, SLOT_DECOY);
    w.step();
    expect(w.decoys.size).toBe(1);
    expect([...w.decoys.keys()][0]).not.toBe(firstId);
  });

  it('resetForMatchStart clears practice-field buoys', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0, 0, 'mineLayer');
    injectDecoy(w, 'd1', 'a', 100, 0);
    w.resetForMatchStart();
    expect(w.decoys.size).toBe(0);
  });
});

// ---------- the deception: counterIntel blips through the ship-blip gate ------

describe('decoy buoy — radar deception (the EXACT ship-blip gate, owner-id substitution)', () => {
  /** Observer `b` at the origin; the buoy's owner `a` parked far outside b's
   *  radar so only the BUOY can produce an 'a' signal. */
  function observed(): { w: World; b: ShipRecord } {
    const w = bareWorld(33);
    place(w, 'a', -2000, 0, 0, 'mineLayer'); // the impersonated owner, far away
    const b = place(w, 'b', 0, 0);
    return { w, b };
  }

  it('paints in the annulus when swept: {k:blip, id: OWNER ship id, x,y = the BUOY, t: now}', () => {
    const { w, b } = observed();
    injectDecoy(w, 'd1', 'a', 400, 0);
    windowAround(b, 0);
    const blips = blipsOf(buildFrame(w, 'b'));
    expect(blips).toEqual([{ k: 'blip', id: 'a', x: 400, y: 0, t: w.now }]);
  });

  it('does not paint outside the beam window (the swept-this-tick gate)', () => {
    const { w, b } = observed();
    injectDecoy(w, 'd1', 'a', 400, 0);
    windowAround(b, Math.PI); // beam on the far side
    expect(blipsOf(buildFrame(w, 'b'))).toEqual([]);
  });

  it('annulus boundaries are the ship rule exactly: paints at radar, silent past it and inside sight', () => {
    const { w, b } = observed();
    injectDecoy(w, 'edge', 'a', RADAR, 0); // exactly at radar — inclusive
    windowAround(b, 0);
    expect(blipsOf(buildFrame(w, 'b')).map((e) => e.x)).toEqual([RADAR]);
    w.decoys.clear();
    injectDecoy(w, 'past', 'a', RADAR + 0.01, 0); // a hair beyond
    windowAround(b, 0);
    expect(blipsOf(buildFrame(w, 'b'))).toEqual([]);
    w.decoys.clear();
    injectDecoy(w, 'close', 'a', SIGHT, 0); // at sight => truth tier, never the annulus
    windowAround(b, 0);
    const f = buildFrame(w, 'b');
    expect(blipsOf(f)).toEqual([]);
    expect(f.decoys?.map((d) => d.id)).toEqual(['close']); // truesight sees the buoy for what it is
  });

  it('an island blocks the decoy blip exactly like a ship (LOS parity)', () => {
    const { w, b } = observed();
    w.map.islands.push({ x: 200, y: 0, r: 40 });
    injectDecoy(w, 'd1', 'a', 400, 0);
    windowAround(b, 0);
    expect(blipsOf(buildFrame(w, 'b'))).toEqual([]);
  });

  it('NEVER blips to its owner (the lie is for others)', () => {
    const w = bareWorld(34);
    const a = place(w, 'a', 0, 0, 0, 'mineLayer');
    injectDecoy(w, 'd1', 'a', 400, 0); // in a's OWN radar annulus
    windowAround(a, 0);
    const f = buildFrame(w, 'a');
    expect(blipsOf(f)).toEqual([]); // no self-echo
    expect(f.decoys?.map((d) => d.id)).toEqual(['d1']); // the owner sees the truth instead
  });

  it("an observer whose OWN lit zone covers the buoy gets the truth, never the blip (zone parity)", () => {
    const { w, b } = observed();
    injectDecoy(w, 'd1', 'a', 400, 0);
    w.litZones.set('z1', { id: 'z1', ownerId: 'b', x: 400, y: 0, r: CONFIG.starShells.litRadius, until: 999_999 });
    windowAround(b, 0); // swept AND in the annulus — but zone-truesighted
    const f = buildFrame(w, 'b');
    expect(blipsOf(f)).toEqual([]);
    expect(f.decoys?.map((d) => d.id)).toEqual(['d1']);
  });

  it('WIRE-INDISTINGUISHABILITY: a decoy blip and a real ship blip in the SAME frame are field-for-field identical', () => {
    const { w, b } = observed();
    place(w, 'x', 400, 0); // a real ship in the annulus at bearing 0
    injectDecoy(w, 'd1', 'a', 0, 400); // the buoy in the annulus at bearing π/2
    b.prevSweepAngle = wrapPositive(-0.05); // one window spanning both bearings
    b.sweepAngle = Math.PI / 2 + 0.05;
    const blips = blipsOf(buildFrame(w, 'b'));
    expect(blips).toHaveLength(2);
    const real = blips.find((e) => e.id === 'x')!;
    const lie = blips.find((e) => e.id === 'a')!; // id === the OWNER's ship id
    expect(real).toBeDefined();
    expect(lie).toBeDefined();
    // Field-for-field: same keys, same ORDER (msgpack wire shape), same types.
    expect(Object.keys(lie)).toEqual(Object.keys(real));
    for (const key of Object.keys(real) as (keyof BlipEvent)[]) {
      expect(typeof lie[key]).toBe(typeof real[key]);
    }
    expect(lie.t).toBe(real.t); // stamped by the same tick clock
    // Serialized forms differ ONLY in id/position values — never in shape.
    expect(JSON.stringify(lie)).toBe(JSON.stringify({ k: 'blip', id: 'a', x: 0, y: 400, t: w.now }));
  });

  it('an expired buoy stops painting the moment the sweep drops it', () => {
    const { w, b } = observed();
    injectDecoy(w, 'd1', 'a', 400, 0, w.now + DT); // expires after one step
    w.step(); // now >= until -> expireDecoys removes it
    windowAround(b, 0);
    expect(w.decoys.size).toBe(0);
    expect(blipsOf(buildFrame(w, 'b'))).toEqual([]);
  });
});

// ---------- no Hit Call: not a collision subject ------------------------------

describe('decoy buoy — never a collision subject (sanctioned disambiguation)', () => {
  it('a shell flies THROUGH the buoy: no interception, no boom at the buoy, buoy persists', () => {
    const w = bareWorld(35);
    place(w, 'g', 0, -500); // far-off owner of the shell (no interference)
    injectDecoy(w, 'd1', 'z', 100, 0);
    w.shells.set('s1', {
      id: 's1', ownerId: 'g', x: 50, y: 0, vx: CONFIG.gun.shellSpeed, vy: 0,
      distLeft: 200, bornAt: w.now, kind: 'shell', damage: CONFIG.gun.damage,
      hitRadius: CONFIG.gun.shellRadius, targetX: null, targetY: null,
      burstRadius: 0, contactDamage: CONFIG.gun.damage,
    });
    // Fly it PAST the buoy first: still airborne beyond x=100 proves no
    // interception ever happened at the buoy.
    for (let i = 0; i < 20 && (w.shells.get('s1')?.x ?? Infinity) <= 110; i++) w.step();
    expect(w.shells.get('s1')).toBeDefined();
    expect(w.shells.get('s1')!.x).toBeGreaterThan(100);
    // Then let it spend its range: the only boom is the range-end splash far
    // past the buoy, and nothing ever took damage.
    const dmg: unknown[] = [];
    for (let i = 0; i < 40 && w.shells.has('s1'); i++) {
      w.step();
      dmg.push(...w.tickEvents.filter((e) => e.k === 'dmg'));
    }
    expect(w.shells.has('s1')).toBe(false); // spent by RANGE, not stopped at the buoy
    expect(dmg).toEqual([]);
    expect(w.decoys.has('d1')).toBe(true); // unharmed
  });

  it('a gun burst centered ON the buoy: burst event, ZERO dmg events, buoy persists', () => {
    const w = bareWorld(36);
    place(w, 'a', 0, 0, 0, 'mineLayer');
    injectDecoy(w, 'd1', 'z', 300, 0);
    w.submitInput('a', { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 1, aimDist: 300, slot: 0, fireT: 0, actSeq: 0, actSlot: 0 });
    let sawBurst = false;
    const dmg: unknown[] = [];
    for (let i = 0; i < 60 && !sawBurst; i++) {
      w.step();
      sawBurst = w.tickEvents.some((e) => e.k === 'burst');
      dmg.push(...w.tickEvents.filter((e) => e.k === 'dmg'));
    }
    expect(sawBurst).toBe(true);
    expect(dmg).toEqual([]); // the buoy is not a hull — no Hit Call
    expect(w.decoys.has('d1')).toBe(true);
  });

  it('an armed mine NEVER trips on a buoy sitting inside its trigger radius', () => {
    const w = bareWorld(37);
    place(w, 'far', 900, 900); // keep the world non-empty, far from the field
    injectDecoy(w, 'd1', 'z', 0, 0);
    w.mines.set('m1', { id: 'm1', ownerId: 'e', x: 10, y: 0, armedAt: 0 }); // buoy well inside 32u
    for (let i = 0; i < 10; i++) w.step();
    expect(w.mines.has('m1')).toBe(true); // only HULLS trip mines
    expect(w.decoys.has('d1')).toBe(true);
  });
});

// ---------- the truth channel: owner / truesight / fogged / spectator ---------

describe('decoy buoy — decoys channel tiers (the truth)', () => {
  it('the OWNER always sees its buoy, even far beyond sight; a fogged non-owner gets NO decoys key', () => {
    const w = bareWorld(38);
    place(w, 'a', 0, 0, 0, 'mineLayer');
    place(w, 'far', 0, -2000); // non-owner, buoy far outside sight AND radar
    injectDecoy(w, 'd1', 'a', 1500, 0, 42_000);
    const fa = buildFrame(w, 'a');
    expect(fa.decoys).toEqual([{ id: 'd1', x: 1500, y: 0, until: 42_000, own: true }]);
    // Byte-free for the fogged non-owner: the key is ABSENT, not [].
    expect('decoys' in buildFrame(w, 'far')).toBe(false);
  });

  it('a truesighted enemy receives the DecoyView; just outside sight it vanishes (and only ever blips)', () => {
    const w = bareWorld(39);
    place(w, 'a', -2000, 0, 0, 'mineLayer');
    const e = place(w, 'e', 0, 0);
    windowAround(e, Math.PI); // park the beam away — isolate the truth channel
    injectDecoy(w, 'd1', 'a', SIGHT, 0, 42_000); // exactly at sight — inclusive
    expect(buildFrame(w, 'e').decoys).toEqual([{ id: 'd1', x: SIGHT, y: 0, until: 42_000, own: false }]);
    w.decoys.get('d1')!.x = SIGHT + 0.01; // a hair beyond
    expect('decoys' in buildFrame(w, 'e')).toBe(false);
  });

  it('an island blocks the truesight buoy view (LOS rule)', () => {
    const w = bareWorld(40);
    place(w, 'a', -2000, 0, 0, 'mineLayer');
    place(w, 'e', 0, 0);
    w.map.islands.push({ x: 60, y: 0, r: 25 });
    injectDecoy(w, 'd1', 'a', 120, 0); // inside sight range but behind the rock
    expect('decoys' in buildFrame(w, 'e')).toBe(false);
  });

  it('spectators see every buoy (dead-in-active and finished phase alike)', () => {
    const w = bareWorld(41);
    place(w, 'a', 0, 0, 0, 'mineLayer');
    place(w, 'b', 300, 0);
    injectDecoy(w, 'd1', 'a', 5_000, 5_000, 42_000); // absurdly far from everyone
    w.respawnEnabled = false;
    w.sinkShip('b', 'a'); // b spectates in the active phase
    w.step();
    // spectator 'b' does not own it (own: false); owner 'a' still reads own: true even as a finished-phase spectator.
    expect(buildFrame(w, 'b', 'active').decoys).toEqual([{ id: 'd1', x: 5_000, y: 5_000, until: 42_000, own: false }]);
    expect(buildFrame(w, 'a', 'finished').decoys).toEqual([{ id: 'd1', x: 5_000, y: 5_000, until: 42_000, own: true }]);
  });
});
