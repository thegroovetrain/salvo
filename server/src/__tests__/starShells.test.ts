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
import { CONFIG, SLOT_BOOST, type InputMsg } from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { fitClassWeapons } from './classWeapons.js';
import { buildFrame } from '../game/frames.js';
import { flatRaster } from './islandFixture.js';

const DT = CONFIG.tick.simDtMs;
const LIT_R = CONFIG.starShells.litRadius;
/** Battleship slot index under the NINE-SLOT spawn (Story 8.5):
 *  [gun, boost, broadside, starShells, empty x5] — the spawn seed fits
 *  `broadside` then `starShells` into the weapon row, so the flare is slot 3. */
const SLOT_STAR = 3;

/** World whose islands are cleared, for exact-geometry cases. The raster is
 *  flattened too (Story 4.11): real terrain must not radar-shadow a world the
 *  test built as empty water. */
function bareWorld(seed = 7): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  w.map.heightRaster = flatRaster();
  return w;
}

/** Add a ship of `hull` and teleport it to an exact pose (speed 0). */
function place(w: World, id: string, hull: 'battleship' | 'torpedoBoat' | 'mineLayer', x: number, y: number, heading = 0): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), 'captain', hull, undefined, undefined);
  // THE CLASS WEAPON IS A CARD NOW (Story 8.10, amendment 62): the interim
  // spawn seed is deleted and a hull comes up with gun + Shift and an EMPTY
  // weapon row, so this fixture fits it explicitly through the same applyCard
  // path a real pick takes. Every case below keeps its subject.
  fitClassWeapons(w, rec);
  rec.state = { x, y, heading, speed: 0 };
  return rec;
}

/** Set a full, valid InputMsg on a ship (fireSeq 0 => no click by default). */
function setInput(ship: ShipRecord, patch: Partial<InputMsg>): void {
  ship.input = { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0, held: false, ...patch };
}

/** Click for `firer` via the real input channel and step until the burst (or
 *  a boom) resolves. Returns the world time the terminal event landed. */
function fireAndResolve(w: World, firer: string, input: Partial<InputMsg>, maxTicks = 120): { seen: string[]; at: number } {
  w.submitInput(firer, { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 1, aimDist: 0, slot: SLOT_STAR, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0, held: false, ...input });
  const seen: string[] = [];
  for (let i = 0; i < maxTicks; i++) {
    w.step();
    for (const e of w.tickEvents) seen.push(e.k);
    if (seen.includes('burst') || seen.includes('boom')) return { seen, at: w.now };
  }
  return { seen, at: w.now };
}

describe('star shells — shell construction', () => {
  it('firing spawns a TIERED DAMAGE flare (Story 8.17, amendment 130): speed 500, damage = the row (10 at tier I) on burst AND contact, burst = lit radius, lit tag set', () => {
    const w = bareWorld();
    const bb = place(w, 'a', 'battleship', 0, 0);
    setInput(bb, { aim: 0, aimDist: 400, slot: SLOT_STAR });
    expect(w.sinkingActivationGate(bb, SLOT_STAR)).toEqual({ ok: true });
    const shell = [...w.shells.values()][0];
    expect(Math.hypot(shell.vx, shell.vy)).toBeCloseTo(CONFIG.starShells.shellSpeed, 9);
    // Story 8.17 FLIPS amendment 39's damageless pin: the flare deals the
    // row's tier damage (10 at tier I) to every hull inside the whole lit
    // circle, and the same number to an interceptor (the broadside precedent).
    expect(shell.damage).toBe(CONFIG.starShells.damage);
    expect(shell.damage).toBe(10);
    expect(shell.contactDamage).toBe(10);
    expect(shell.hits).toEqual(CONFIG.starShells.hits); // still no mine bit — lighting never clears a minefield
    expect(shell.burn).toBeUndefined(); // a flare never burns (PHOSPHOR SHELLS is its own row)
    expect(shell.flash).toBeUndefined(); // ...and never flashes (FLASH SHELLS is a belt row)
    expect(shell.burstRadius).toBe(LIT_R); // the burst IS the lit circle
    expect(shell.hitRadius).toBe(CONFIG.starShells.shellRadius); // own field — never the gun's
    expect(shell.kind).toBe('shell'); // rides the existing ballistic wire kind
    expect(shell.lit).toEqual({ radius: LIT_R, durationMs: CONFIG.starShells.litDurationMs });
    // Single-shot pool spent, 20s reload started.
    expect(bb.loadout[SLOT_STAR].state).toEqual({ n: 0, reloadMsLeft: CONFIG.starShells.reloadMs });
  });

  it('a click beyond range clamps the burst point to the radar-derived base range (660u)', () => {
    const w = bareWorld();
    const bb = place(w, 'a', 'battleship', 0, 0);
    setInput(bb, { aim: 0, aimDist: 1200, slot: SLOT_STAR });
    expect(w.sinkingActivationGate(bb, SLOT_STAR)).toEqual({ ok: true });
    const shell = [...w.shells.values()][0];
    expect(bb.stats.equipment.starShells.rangeU).toBe(CONFIG.vision.radar);
    expect(shell.targetX).toBeCloseTo(CONFIG.vision.radar, 9);
    expect(shell.targetY).toBeCloseTo(0, 9);
  });
});

describe('star shells — burst damage + zone spawn (end-to-end)', () => {
  it('bursts for the TIER DAMAGE across the full lit circle (Story 8.17) — one dmg per hull inside, `hc` — and spawns the zone there', () => {
    const w = bareWorld();
    const a = place(w, 'a', 'battleship', 0, 0);
    const near = place(w, 'near', 'battleship', 480, 80); // hull within 165 of the click point
    const far = place(w, 'far', 'battleship', 480, 400); // well outside the circle
    const { seen, at } = fireAndResolve(w, 'a', { aim: 0, aimDist: 500 });
    expect(seen).toContain('burst'); // the flash reuses the EXISTING burst event kind
    // Story 8.17 (amendment 130) FLIPS amendment 39's damageless pin: the hull
    // inside the circle takes the tier's 10, the one outside nothing, the
    // owner never — and the burst resolved a hull, so it is a Hit Call
    // (amendment 135(a)).
    expect(near.hp).toBe(near.stats.maxHp - 10);
    expect(far.hp).toBe(far.stats.maxHp);
    expect(a.hp).toBe(a.stats.maxHp);
    expect(seen.filter((k) => k === 'dmg')).toHaveLength(1);
    expect(seen).toContain('hc');
    expect(seen).not.toContain('sp');
    // The zone: centered on the clicked point, lit radius, natural expiry — and
    // NO verb fields (amendment 134).
    expect(w.litZones.size).toBe(1);
    const zone = [...w.litZones.values()][0];
    expect(zone).toEqual({ id: zone.id, ownerId: 'a', x: 500, y: 0, r: LIT_R, until: at + CONFIG.starShells.litDurationMs });
  });

  it('a flare over EMPTY water still splashes (`sp`) — the Hit Call keys off resolved hulls, never off the burst alone', () => {
    const w = bareWorld();
    place(w, 'a', 'battleship', 0, 0);
    const { seen } = fireAndResolve(w, 'a', { aim: 0, aimDist: 500 });
    expect(seen).toContain('burst');
    expect(seen).toContain('sp');
    expect(seen).not.toContain('hc');
    expect(seen).not.toContain('dmg');
  });

  it('an early interceptor takes the TIER DAMAGE as contact damage, stops the flare — and the zone spawns AT THE STOP POINT', () => {
    const w = bareWorld();
    place(w, 'a', 'battleship', 0, 0);
    const mid = place(w, 'mid', 'battleship', 300, 0); // bodyblocks the 650u click (an arbitrary long-range distance), 350u short
    const { seen } = fireAndResolve(w, 'a', { aim: 0, aimDist: 650 });
    expect(seen).toContain('boom');
    expect(seen).not.toContain('burst');
    // Story 8.17: the interceptor takes the row's 10 (the broadside precedent)
    // and the flare STILL lights where it stopped.
    expect(mid.hp).toBe(mid.stats.maxHp - 10);
    expect(seen).toContain('dmg');
    expect(w.litZones.size).toBe(1);
    const zone = [...w.litZones.values()][0];
    // The zone sits at the interception stop point (short of the 650u click, an arbitrary long-range distance).
    expect(Math.hypot(zone.x, zone.y)).toBeLessThan(400);
  });

  it('the lit zone is stamped from the shell’s OWN `lit` tag — a card fitted while the flare flies never changes the landing zone', () => {
    // Story 8.17: the owner lookup at zone spawn is GONE with the verbs; the
    // zone's radius and lifetime are the numbers the shell carried at launch.
    const w = bareWorld();
    const a = place(w, 'a', 'battleship', 0, 0);
    w.submitInput('a', { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 1, aimDist: 650, slot: SLOT_STAR, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0, held: false });
    w.step(); // consumes the click; the flare is airborne at tier I
    expect(w.shells.size).toBe(1);
    for (let i = 0; i < 4; i++) w.applyCard(a, 'starShells'); // tier V lands while the flare flies
    expect(a.stats.equipment.starShells.litRadius).toBeGreaterThan(LIT_R);
    for (let i = 0; i < 120 && w.litZones.size === 0; i++) w.step();
    expect(w.litZones.size).toBe(1);
    const zone = [...w.litZones.values()][0];
    expect(zone.r).toBe(LIT_R); // the tier-I radius it was fired with
    const wire = buildFrame(w, 'a').litZones![0];
    expect(Object.keys(wire)).toEqual(['id', 'x', 'y', 'r', 'until', 'by']); // no `phos`/`daz` tail
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
    // FIRER: full contact for the hull inside the zone (far beyond its 330u
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
    w.respawnEnabled = false;
    w.sinkShip('a');
    // Story 5.2 (amendment 10): a SINKING Battleship still fires — only a
    // foundered one is dead. Cross the window before asserting the refusal.
    w.step(CONFIG.ship.sinkingWindowMs);
    expect(w.sinkingActivationGate(bb, SLOT_STAR)).toEqual({ ok: false, reason: 'dead' });
  });

  it('the same slot on a Mine Layer is EMPTY, never a flare', () => {
    // WAS "ML slot-2 is the RADAR BUOY": since Story 8.5 the Mine Layer's
    // seed is `navalMines` alone and the radar buoy is deleted (Story 8.16),
    // so the flare's index on a Mine Layer holds nothing. What this case has
    // always pinned survives verbatim: the slot is NOT the star shell — no
    // flare, no shell, no zone, no mine and no decoy.
    const w = bareWorld();
    const ml = place(w, 'ml', 'mineLayer', 0, 0);
    expect(ml.loadout[SLOT_STAR]).toEqual({ equipmentId: null, state: null });
    setInput(ml, { slot: SLOT_STAR });
    expect(w.sinkingActivationGate(ml, SLOT_STAR)).toEqual({ ok: false, reason: 'empty-slot' });
    expect(w.shells.size).toBe(0);
    expect(w.litZones.size).toBe(0);
    expect(w.mines.size).toBe(0);
    expect(w.decoys.size).toBe(0);
  });

  it('the BOOST slot stays an ABILITY on every hull: a forged click is inert through the weapon-only wall', () => {
    // WAS "TB slot-2": Story 8.5 moved the boost to its own fixed slot 1 on
    // EVERY captain (amendment 23), so the subject is the boost slot itself.
    const w = bareWorld();
    const tb = place(w, 'tb', 'torpedoBoat', 0, 0);
    expect(tb.loadout[SLOT_BOOST].equipmentId).toBe('boost');
    w.submitInput('tb', { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 1, aimDist: 400, slot: SLOT_BOOST, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0, held: false });
    w.step();
    expect(tb.boostUntil).toBe(0); // the click never reached the ability row
    expect(tb.loadout[SLOT_BOOST].state).toEqual({ n: CONFIG.boost.maxAmmo, reloadMsLeft: 0 });
  });
});
