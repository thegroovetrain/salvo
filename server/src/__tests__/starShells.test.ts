// Star-shell matrix suite (Story 1.7) — the Battleship's slot-2 lit-zone
// flare against the spec's I/O matrix: CONFIG-true shell params (burst radius
// = the lit radius, the server-internal lit tag), range clamp, minor burst
// damage across the full circle (owner excluded), END-TO-END zone spawn at
// the burst point + firer truesight parity + third-party radar circle +
// beyond-radar silence, owner-death persistence, natural expiry, and the
// cooling/dead denials. The zone REVEAL semantics themselves (contacts/mines/
// ballistics through an owned zone, "lit from above") are pinned in
// perception.test.ts/signals.test.ts — here they are proven once through the
// real weapon flow.

import { describe, it, expect } from 'vitest';
import { CONFIG, type InputMsg } from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { buildFrame } from '../game/frames.js';

const DT = CONFIG.tick.simDtMs;
const LIT_R = CONFIG.starShells.litRadius;
/** Battleship slot indices under the 1.7 fit [gun, cannon, starShells, empty]. */
const SLOT_STAR = 2;

/** World whose islands are cleared, for exact-geometry cases. */
function bareWorld(seed = 7): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  return w;
}

/** Add a ship of `hull` and teleport it to an exact pose (speed 0). */
function place(w: World, id: string, hull: 'battleship' | 'torpedoBoat' | 'mineLayer', x: number, y: number, heading = 0): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), false, hull);
  rec.state = { x, y, heading, speed: 0 };
  return rec;
}

/** Set a full, valid InputMsg on a ship (fireSeq 0 => no click by default). */
function setInput(ship: ShipRecord, patch: Partial<InputMsg>): void {
  ship.input = { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0, actSeq: 0, actSlot: 0, ...patch };
}

/** Click for `firer` via the real input channel and step until the burst (or
 *  a boom) resolves. Returns the world time the terminal event landed. */
function fireAndResolve(w: World, firer: string, input: Partial<InputMsg>, maxTicks = 120): { seen: string[]; at: number } {
  w.submitInput(firer, { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 1, aimDist: 0, slot: SLOT_STAR, fireT: 0, actSeq: 0, actSlot: 0, ...input });
  const seen: string[] = [];
  for (let i = 0; i < maxTicks; i++) {
    w.step();
    for (const e of w.tickEvents) seen.push(e.k);
    if (seen.includes('burst') || seen.includes('boom')) return { seen, at: w.now };
  }
  return { seen, at: w.now };
}

describe('star shells — shell construction', () => {
  it('firing spawns a CONFIG.starShells flare: speed 130, damage 10, burst = lit radius, lit tag set', () => {
    const w = bareWorld();
    const bb = place(w, 'a', 'battleship', 0, 0);
    setInput(bb, { aim: 0, aimDist: 400, slot: SLOT_STAR });
    expect(w.sinkingActivationGate(bb, SLOT_STAR)).toEqual({ ok: true });
    const shell = [...w.shells.values()][0];
    expect(Math.hypot(shell.vx, shell.vy)).toBeCloseTo(CONFIG.starShells.shellSpeed, 9);
    expect(shell.damage).toBe(CONFIG.starShells.damage);
    expect(shell.contactDamage).toBe(CONFIG.starShells.damage); // minor either way (torpedo precedent)
    expect(shell.burstRadius).toBe(LIT_R); // the burst IS the lit circle
    expect(shell.kind).toBe('shell'); // rides the existing ballistic wire kind
    expect(shell.lit).toEqual({ radius: LIT_R, durationMs: CONFIG.starShells.litDurationMs });
    // Single-shot pool spent, 20s reload started.
    expect(bb.loadout[SLOT_STAR].state).toEqual({ n: 0, reloadMsLeft: CONFIG.starShells.reloadMs });
  });

  it('a click beyond range clamps the burst point to the radar-derived base range (650u)', () => {
    const w = bareWorld();
    const bb = place(w, 'a', 'battleship', 0, 0);
    setInput(bb, { aim: 0, aimDist: 1200, slot: SLOT_STAR });
    expect(w.sinkingActivationGate(bb, SLOT_STAR)).toEqual({ ok: true });
    const shell = [...w.shells.values()][0];
    expect(bb.stats.starShells.rangeU).toBe(CONFIG.vision.radar);
    expect(shell.targetX).toBeCloseTo(CONFIG.vision.radar, 9);
    expect(shell.targetY).toBeCloseTo(0, 9);
  });
});

describe('star shells — burst damage + zone spawn (end-to-end)', () => {
  it('bursts for ≤10 across the full 110u circle (owner excluded) and spawns the zone there', () => {
    const w = bareWorld();
    const a = place(w, 'a', 'battleship', 0, 0);
    const near = place(w, 'near', 'battleship', 480, 80); // hull within 110 of the click point
    const far = place(w, 'far', 'battleship', 480, 400); // well outside the circle
    const { seen, at } = fireAndResolve(w, 'a', { aim: 0, aimDist: 500 });
    expect(seen).toContain('burst'); // the flash reuses the EXISTING burst event kind
    expect(near.hp).toBe(near.stats.maxHp - CONFIG.starShells.damage); // 150 - 10, once
    expect(far.hp).toBe(far.stats.maxHp); // untouched outside the circle
    expect(a.hp).toBe(a.stats.maxHp); // owner immune, always
    // The zone: centered on the clicked point, lit radius, natural expiry.
    expect(w.litZones.size).toBe(1);
    const zone = [...w.litZones.values()][0];
    expect(zone).toEqual({ id: zone.id, ownerId: 'a', x: 500, y: 0, r: LIT_R, until: at + CONFIG.starShells.litDurationMs });
  });

  it('an early interceptor OUTSIDE the would-be circle takes the minor 10, stops the flare, and NO zone spawns', () => {
    const w = bareWorld();
    place(w, 'a', 'battleship', 0, 0);
    const mid = place(w, 'mid', 'battleship', 300, 0); // bodyblocks the 650u shot, 350u short
    const { seen } = fireAndResolve(w, 'a', { aim: 0, aimDist: 650 });
    expect(seen).toContain('boom');
    expect(seen).not.toContain('burst');
    expect(mid.hp).toBe(mid.stats.maxHp - CONFIG.starShells.damage);
    expect(w.litZones.size).toBe(0); // no burst, no light
  });

  it('the zone expires naturally after litDurationMs (the step() sweep)', () => {
    const w = bareWorld();
    place(w, 'a', 'battleship', 0, 0);
    fireAndResolve(w, 'a', { aim: 0, aimDist: 400 });
    expect(w.litZones.size).toBe(1);
    const steps = Math.ceil(CONFIG.starShells.litDurationMs / DT) + 1;
    for (let i = 0; i < steps; i++) w.step();
    expect(w.litZones.size).toBe(0);
  });

  it("the zone survives its owner's death and still dies only by expiry", () => {
    const w = bareWorld();
    place(w, 'a', 'battleship', 0, 0);
    fireAndResolve(w, 'a', { aim: 0, aimDist: 400 });
    expect(w.litZones.size).toBe(1);
    w.respawnEnabled = false; // active-phase policy: the dead stay dead
    w.sinkShip('a');
    for (let i = 0; i < 10; i++) w.step();
    expect(w.litZones.size).toBe(1); // persists past the owner's death
    const steps = Math.ceil(CONFIG.starShells.litDurationMs / DT) + 1;
    for (let i = 0; i < steps; i++) w.step();
    expect(w.litZones.size).toBe(0); // natural expiry only
  });
});

describe('star shells — the lit intel, end-to-end through the real weapon', () => {
  it('firer gains a contact inside the zone; a radar-range third party gets ONLY the circle; beyond radar is byte-free', () => {
    const w = bareWorld();
    place(w, 'a', 'battleship', 0, 0); // the firer
    const hidden = place(w, 'e', 'torpedoBoat', 500, 40, 1.1); // inside the flare circle, outside everyone's sight
    const c = place(w, 'c', 'mineLayer', 100, -100); // third party: zone center ~412u away — inside radar
    const d = place(w, 'd', 'mineLayer', -700, 0); // zone center 1200u away — beyond radar
    // Park every sweep away from the relevant bearings so no radar blip muddies the read.
    for (const s of [c, d]) {
      s.prevSweepAngle = Math.PI;
      s.sweepAngle = Math.PI + 0.0001;
    }
    const { seen, at } = fireAndResolve(w, 'a', { aim: 0, aimDist: 500 });
    expect(seen).toContain('burst');
    // FIRER: full contact for the hull inside the zone (far beyond its 220u
    // sight; c, 141u away, is an ordinary sight contact riding along).
    const fa = buildFrame(w, 'a');
    expect(fa.contacts.find((x) => x.id === 'e')).toEqual({
      id: 'e', x: hidden.state.x, y: hidden.state.y, heading: hidden.state.heading, speed: 0, cls: 'torpedoBoat',
    });
    expect(fa.litZones).toEqual([
      { id: 'z1', x: 500, y: 0, r: LIT_R, until: at + CONFIG.starShells.litDurationMs, by: 'a' },
    ]);
    // THIRD PARTY in radar range: the tagged circle and NOTHING else from it.
    const fc = buildFrame(w, 'c');
    expect(fc.litZones).toEqual([
      { id: 'z1', x: 500, y: 0, r: LIT_R, until: at + CONFIG.starShells.litDurationMs, by: 'a' },
    ]);
    expect(fc.contacts.map((x) => x.id)).not.toContain('e'); // someone else's zone reveals nothing
    // BEYOND radar: frames byte-free of the zone (key absent, not []).
    expect('litZones' in buildFrame(w, 'd')).toBe(false);
  });
});

describe('star shells — denials', () => {
  it('cooling (empty pool) denies no-ammo and changes nothing', () => {
    const w = bareWorld();
    const bb = place(w, 'a', 'battleship', 0, 0);
    setInput(bb, { aim: 0, aimDist: 400, slot: SLOT_STAR });
    bb.loadout[SLOT_STAR].state = { n: 0, reloadMsLeft: CONFIG.starShells.reloadMs };
    expect(w.sinkingActivationGate(bb, SLOT_STAR)).toEqual({ ok: false, reason: 'no-ammo' });
    expect(w.shells.size).toBe(0);
    expect(w.litZones.size).toBe(0);
  });

  it('a dead Battleship is refused first (dead)', () => {
    const w = bareWorld();
    const bb = place(w, 'a', 'battleship', 0, 0);
    setInput(bb, { aim: 0, aimDist: 400, slot: SLOT_STAR });
    w.sinkShip('a');
    expect(w.sinkingActivationGate(bb, SLOT_STAR)).toEqual({ ok: false, reason: 'dead' });
  });

  it('ML slot-2 clicks keep dropping mines (byte-identical universal fit — never a flare)', () => {
    const w = bareWorld();
    const ml = place(w, 'ml', 'mineLayer', 0, 0);
    expect(ml.loadout[SLOT_STAR].equipmentId).toBe('mine');
    setInput(ml, { slot: SLOT_STAR });
    expect(w.sinkingActivationGate(ml, SLOT_STAR)).toEqual({ ok: true });
    expect(w.mines.size).toBe(1);
    expect(w.shells.size).toBe(0);
    expect(w.litZones.size).toBe(0);
  });

  it('TB slot-2 stays the speedBoost ABILITY: a forged click is inert through the weapon-only wall', () => {
    const w = bareWorld();
    const tb = place(w, 'tb', 'torpedoBoat', 0, 0);
    expect(tb.loadout[SLOT_STAR].equipmentId).toBe('speedBoost');
    w.submitInput('tb', { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 1, aimDist: 400, slot: SLOT_STAR, fireT: 0, actSeq: 0, actSlot: 0 });
    w.step();
    expect(tb.boostUntil).toBe(0); // the click never reached the ability row
    expect(tb.loadout[SLOT_STAR].state).toEqual({ n: CONFIG.speedBoost.maxAmmo, reloadMsLeft: 0 });
  });
});
