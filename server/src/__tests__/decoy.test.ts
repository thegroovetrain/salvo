// THE BUOY BODY (Story 8.16's DECOY BUOY, catalog-v3 R36/R41, epic-8
// amendments 119–124; shared since Story 10.9 by the four buoy lines —
// epic-10 amendments 2 and 4).
//
// A click-placed consumable dropped at ANY bearing (ruling 9: 360°) out to
// `CONFIG.mine.placeRange`: a 50 hp float in `World.decoys` that is the
// `decoy` target kind — enemy shells, bursts and fish damage it (amendments
// 120/121), the owner's own ordnance never does (amendment 119) — that
// outlives its owner's sinking (amendment 122) and leaves the water
// `CONFIG.buoy.lifetimeMs` after the drop (ruling 0). It rides the
// contact-like `decoys` frame channel (sighted like a ship, amendment 126;
// `by` and `kind` for every observer, `hp` / radar `sweep` / `until` for the
// owner only) and paints on radar as an anonymous 12 u square through the
// ordinary blip gate. These cases drive it through the HEALING BUOY line; the
// drop body is one factory for all four (consumables/buoys.ts).

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  arcFor,
  consumableSlotFor,
  type BuoyKind,
  type ConsumableKit,
  paintSegmentCoverage,
  type BlipEvent,
  type GameEvent,
  type InputMsg,
  type ReturnBlipEvent,
} from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { buildFrame } from '../game/frames.js';
import { observe } from '../game/perception.js';
import { addDecoy } from '../game/decoys.js';
import { circleIsland, flatRaster } from './islandFixture.js';

const TAU = Math.PI * 2;
/** A kit that CARRIES a buoy (Story 10.1) — off the default four, on key 2. */
const KIT: ConsumableKit = ['hullRepair', 'healingBuoy', 'shieldBlock', 'countermeasure'];
const BELT = consumableSlotFor(KIT, 'healingBuoy')!;
/** The test-only far expiry for a directly minted body (no lifetime in play). */
const NEVER = Number.POSITIVE_INFINITY;

function bareWorld(seed = 816): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  w.map.heightRaster = flatRaster(2000);
  return w;
}

function place(w: World, id: string, x: number, y: number, heading = 0): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), 'captain', 'mineLayer', undefined, undefined, undefined, KIT);
  rec.state = { x, y, heading, speed: 0 };
  return rec;
}

/** Aim the ship's latest input (the belt click reads `aim` / `aimDist`). */
function aim(ship: ShipRecord, a: number, dist: number): void {
  ship.input = { ...ship.input, aim: a, aimDist: dist, slot: BELT } as InputMsg;
}

/** Stock one HEALING BUOY copy in its belt slot. */
function stock(w: World, ship: ShipRecord): void {
  w.applyCard(ship, 'healingBuoy');
  expect(ship.loadout[BELT]).toEqual({ equipmentId: 'healingBuoy', state: { n: 1, reloadMsLeft: 0 } });
}

/** The copy is still aboard — on the belt AND in the held build (ONE SPEND LAW). */
function unspent(ship: ShipRecord): void {
  expect(ship.loadout[BELT]).toEqual({ equipmentId: 'healingBuoy', state: { n: 1, reloadMsLeft: 0 } });
  expect(ship.cards).toContain('healingBuoy');
}

/** Drop a buoy of `kind` through the World's own spawn (real expiry, real sweep seed). */
function spawn(w: World, owner: ShipRecord, x: number, y: number, kind: BuoyKind = 'healing'): void {
  (w as unknown as { spawnDecoy(o: ShipRecord, x: number, y: number, k: BuoyKind): void }).spawnDecoy(owner, x, y, kind);
}

/** Resolve an injected gun-family shell bursting at (x, y) for `ownerId`. */
function burstAt(w: World, ownerId: string, x: number, y: number): GameEvent[] {
  const inner = w as unknown as {
    resolveShell(shell: unknown, outcome: unknown, hulls: readonly unknown[]): void;
    hitTargets(mask: readonly string[]): readonly unknown[];
    pending: GameEvent[];
  };
  const before = inner.pending.length;
  const shell = {
    id: `s-${ownerId}-${x}`, ownerId, x, y, vx: 0, vy: 0, distLeft: 0, bornAt: w.now,
    kind: 'shell', family: 'cannon', damage: CONFIG.gun.damage, hitRadius: CONFIG.gun.shellRadius,
    targetX: x, targetY: y, burstRadius: CONFIG.gun.burstRadius,
    contactDamage: CONFIG.gun.contactDamage, hits: CONFIG.gun.hits,
  };
  inner.resolveShell(shell, { kind: 'burst', x, y }, inner.hitTargets(CONFIG.gun.hits));
  return inner.pending.slice(before);
}

const blips = (evs: readonly { k: string }[]): ReturnBlipEvent[] =>
  evs.filter((e): e is BlipEvent => e.k === 'blip') as ReturnBlipEvent[];

describe('THE BUOY BODY — the drop (360°, the range clamp, one spend law)', () => {
  it('HAPPY: a click astern inside placeRange on water drops a 50 hp buoy of the line\'s kind AT the click, expiring lifetimeMs on, and spends the copy', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0, 0); // bow +x: astern is π
    stock(w, a);
    aim(a, Math.PI, 60);
    expect(w.sinkingActivationGate(a, BELT)).toEqual({ ok: true });
    expect([...w.decoys.values()]).toEqual([
      expect.objectContaining({
        id: 'd1', ownerId: 'a', hp: CONFIG.buoy.hp, kind: 'healing', expiresAt: w.now + CONFIG.buoy.lifetimeMs, sweep: null,
      }),
    ]);
    const d = w.decoys.get('d1')!;
    expect(d.x).toBeCloseTo(-60, 9);
    expect(d.y).toBeCloseTo(0, 9);
    expect(a.loadout[BELT]).toEqual({ equipmentId: null, state: null });
    expect(a.cards).not.toContain('healingBuoy');
  });

  it('360° (ruling 9): a click ASTERN, ABEAM or AHEAD at placeRange drops; the mines keep their rear sector', () => {
    for (const [i, bearing] of [Math.PI, Math.PI / 2, -Math.PI / 2, 0, Math.PI / 4].entries()) {
      const w = bareWorld();
      const a = place(w, 'a', 0, 0, 0); // bow +x
      stock(w, a);
      aim(a, bearing, CONFIG.mine.placeRange);
      expect(w.sinkingActivationGate(a, BELT), `bearing #${i}`).toEqual({ ok: true });
      const d = w.decoys.get('d1')!;
      expect(Math.hypot(d.x, d.y)).toBeCloseTo(CONFIG.mine.placeRange, 6);
    }
    expect(arcFor('healingBuoy').kind).toBe('full');
    expect(arcFor('navalMines').kind).toBe('sector');
  });

  it('BLOCKED: a click on an island, or off the water disk, denies `blocked` and spends NOTHING', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0, 0);
    w.map.islands.push(circleIsland(-80, 0, 30));
    stock(w, a);
    aim(a, Math.PI, 80); // dead centre of the rock
    expect(w.sinkingActivationGate(a, BELT)).toEqual({ ok: false, reason: 'blocked' });
    unspent(a);
    const rim = place(w, 'r', w.map.radius - 30, 0, Math.PI); // bow −x: +x points past the rim
    stock(w, rim);
    aim(rim, 0, 80);
    expect(w.sinkingActivationGate(rim, BELT)).toEqual({ ok: false, reason: 'blocked' });
    unspent(rim);
    expect(w.decoys.size).toBe(0);
  });

  it('OUT OF RANGE: a click past placeRange, at any bearing, denies `out-of-arc` and spends NOTHING', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0, 0);
    stock(w, a);
    aim(a, 0, CONFIG.mine.placeRange + 1); // the bow
    expect(w.sinkingActivationGate(a, BELT)).toEqual({ ok: false, reason: 'out-of-arc' });
    aim(a, Math.PI, CONFIG.mine.placeRange + 1); // astern
    expect(w.sinkingActivationGate(a, BELT)).toEqual({ ok: false, reason: 'out-of-arc' });
    unspent(a);
    expect(w.decoys.size).toBe(0);
  });

  it('a denied press reaches the owner\'s frame as a `denied` row through the real input path', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0, 0);
    stock(w, a);
    w.submitInput('a', {
      seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 1, aimDist: CONFIG.mine.placeRange + 1, slot: BELT,
      fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0, held: false,
    });
    w.step();
    expect(buildFrame(w, 'a').denied).toEqual([{ slot: BELT, reason: 'out-of-arc', seq: 1 }]);
    unspent(a);
  });
});

describe('THE BUOY BODY — damage (amendments 119–121)', () => {
  it('an ENEMY burst takes the shell\'s damage off it and fires the SHOOTER\'s hit call; no `dmg`', () => {
    const w = bareWorld();
    place(w, 'o', -800, 0);
    place(w, 'e', 800, 0);
    addDecoy(w.decoys, 'o', 0, 0, 'd1', 'healing', NEVER, 0);
    const evs = burstAt(w, 'e', 0, 0);
    expect(w.decoys.get('d1')!.hp).toBe(CONFIG.buoy.hp - CONFIG.gun.damage);
    expect(evs.filter((e) => e.k === 'hc' && e.id === 'e')).toHaveLength(1); // amendment 121
    expect(evs.some((e) => e.k === 'sp')).toBe(false);
    expect(evs.some((e) => e.k === 'dmg')).toBe(false); // a buoy is not a ship
  });

  it('the OWNER\'s own burst over its own buoy does NOTHING: no damage, no hit call (it splashes)', () => {
    const w = bareWorld();
    place(w, 'o', -800, 0);
    addDecoy(w.decoys, 'o', 0, 0, 'd1', 'healing', NEVER, 0);
    const evs = burstAt(w, 'o', 0, 0);
    expect(w.decoys.get('d1')!.hp).toBe(CONFIG.buoy.hp);
    expect(evs.some((e) => e.k === 'hc')).toBe(false);
    expect(evs.filter((e) => e.k === 'sp' && e.id === 'o')).toHaveLength(1);
  });

  it('damageDecoy itself refuses the owner (defence in depth beside the shared skip)', () => {
    const w = bareWorld();
    place(w, 'o', -800, 0);
    addDecoy(w.decoys, 'o', 0, 0, 'd1', 'healing', NEVER, 0);
    const inner = w as unknown as { damageDecoy(id: string, amount: number, byId: string): boolean };
    expect(inner.damageDecoy('d1', 999, 'o')).toBe(false);
    expect(w.decoys.get('d1')!.hp).toBe(CONFIG.buoy.hp);
    expect(inner.damageDecoy('nope', 5, 'e')).toBe(false);
    expect(inner.damageDecoy('d1', 5, 'e')).toBe(true);
    expect(w.decoys.get('d1')!.hp).toBe(CONFIG.buoy.hp - 5);
  });

  it('an ENEMY mine blast damages it; the layer\'s OWN blast never does', () => {
    const w = bareWorld();
    const o = place(w, 'o', -800, 0);
    const e = place(w, 'e', 800, 800);
    addDecoy(w.decoys, 'o', 0, 0, 'd1', 'healing', NEVER, 0);
    const inner = w as unknown as {
      applyMineBlast(at: { x: number; y: number }, ownerId: string, kind: string, hulls: readonly unknown[]): { resolved: number };
      hitTargets(mask: readonly string[]): readonly unknown[];
    };
    expect(inner.applyMineBlast({ x: 5, y: 0 }, o.id, 'naval', inner.hitTargets(['hull', 'decoy'])).resolved).toBe(0);
    expect(w.decoys.get('d1')!.hp).toBe(CONFIG.buoy.hp);
    inner.applyMineBlast({ x: 5, y: 0 }, e.id, 'naval', inner.hitTargets(['hull', 'decoy']));
    expect(w.decoys.has('d1')).toBe(false); // the blast outweighs a fresh buoy
  });

  it('OWNER SINKS: the buoy persists past the sinking (amendment 122) — until its own lifetime ends', () => {
    const w = bareWorld();
    const o = place(w, 'o', -800, 0);
    place(w, 'e', 0, 60); // sighted neighbour of the buoy
    spawn(w, o, 0, 0);
    const born = w.now;
    w.sinkShip(o.id, 'e');
    for (let i = 0; i < Math.ceil(CONFIG.ship.sinkingWindowMs / CONFIG.tick.simDtMs) + 10; i++) w.step();
    expect(w.now - born).toBeLessThan(CONFIG.buoy.lifetimeMs); // premise
    expect(w.decoys.get('d1')).toEqual(expect.objectContaining({ ownerId: 'o', hp: CONFIG.buoy.hp }));
    expect(buildFrame(w, 'e').decoys).toEqual([{ id: 'd1', x: 0, y: 0, own: false, by: 'o', kind: 'healing' }]);
    while (w.now < born + CONFIG.buoy.lifetimeMs) w.step();
    expect(w.decoys.has('d1')).toBe(false); // the sunk owner's buoy still expires on time
  });
});

describe('THE BUOY BODY — the views and the radar paint', () => {
  it('owner always (kind, then the self-private hp / until); a SIGHTING enemy gets {id,x,y,own,by,kind}; a far one gets nothing', () => {
    const w = bareWorld();
    place(w, 'o', -2000, 0); // the owner, far from its own float
    place(w, 'near', 0, 80); // inside sight
    place(w, 'far', 0, 1500); // beyond sight
    addDecoy(w.decoys, 'o', 0, 0, 'd1', 'healing', 12_345, 0);
    const own = buildFrame(w, 'o').decoys!;
    expect(own).toEqual([{ id: 'd1', x: 0, y: 0, own: true, by: 'o', kind: 'healing', hp: CONFIG.buoy.hp, until: 12_345 }]);
    expect(Object.keys(own[0])).toEqual(['id', 'x', 'y', 'own', 'by', 'kind', 'hp', 'until']);
    const near = buildFrame(w, 'near').decoys!;
    expect(near).toEqual([{ id: 'd1', x: 0, y: 0, own: false, by: 'o', kind: 'healing' }]);
    for (const k of ['hp', 'sweep', 'until']) expect(k in near[0]).toBe(false);
    expect('decoys' in buildFrame(w, 'far')).toBe(false); // omitted when none
  });

  it('an enemy INSIDE SIGHT gets the view (it rides sight, not the mine/torpedo detect rung — which equals sight since 2026-10-08); one just past sight with no paint gets nothing (amendment 126)', () => {
    const w = bareWorld();
    place(w, 'o', -2000, 0);
    const probe = place(w, 'probe', 0, 0);
    const sight = probe.stats.sightRange;
    probe.state = { x: 0.9 * sight, y: 0, heading: 0, speed: 0 };
    probe.prevSweepAngle = 1;
    probe.sweepAngle = 1.1; // the beam elsewhere: no paint either way
    addDecoy(w.decoys, 'o', 0, 0, 'd1', 'healing', NEVER, 0);
    expect(buildFrame(w, 'probe').decoys).toEqual([{ id: 'd1', x: 0, y: 0, own: false, by: 'o', kind: 'healing' }]);
    probe.state = { x: 1.1 * sight, y: 0, heading: 0, speed: 0 };
    const far = observe(w, 'probe');
    expect(blips(far.events)).toEqual([]);
    expect('decoys' in buildFrame(w, 'probe')).toBe(false);
  });

  it('it PAINTS on radar as an untagged 12 u square when the observer\'s beam crosses it — and only then', () => {
    const w = bareWorld();
    const obs = place(w, 'obs', 0, 0);
    addDecoy(w.decoys, 'x', 700, 0, 'd1', 'healing', NEVER, 0); // inside the dropout's flat band (Story 9.8)
    const want = paintSegmentCoverage(700, 0, 700, 0, CONFIG.buoy.sizeU, CONFIG.vision.radarCellU, w.now);
    obs.prevSweepAngle = TAU - 0.05;
    obs.sweepAngle = 0.05; // the beam crosses bearing 0 this tick
    const painted = blips(observe(w, 'obs').events);
    expect(painted).toEqual([{ k: 'blip', t: w.now, gx: want.gx, gy: want.gy, w: want.w, h: want.h, bits: want.bits }]);
    obs.prevSweepAngle = 1;
    obs.sweepAngle = 1.1; // the beam elsewhere
    expect(blips(observe(w, 'obs').events)).toEqual([]);
    // Inside the observer's own lit zone the paint STILL rides (amendment 210
    // ruling (a): the entire sweep) — beside the truth on the `decoys` channel.
    obs.prevSweepAngle = TAU - 0.05;
    obs.sweepAngle = 0.05;
    w.litZones.set('z', { id: 'z', ownerId: 'obs', x: 700, y: 0, r: 100, until: w.now + 5000 } as never);
    expect(blips(observe(w, 'obs').events)).toEqual(painted);
  });

  it('the OWNER\'s radar paints its own buoy through the same gate (no special case)', () => {
    const w = bareWorld();
    const o = place(w, 'o', 0, 0);
    addDecoy(w.decoys, 'o', 700, 0, 'd1', 'healing', NEVER, 0); // flat band (Story 9.8)
    o.prevSweepAngle = TAU - 0.05;
    o.sweepAngle = 0.05;
    expect(blips(observe(w, 'o').events)).toHaveLength(1);
  });

  it('a RADAR buoy\'s own view carries its beam angle (`sweep`), self-private; every view carries `kind`', () => {
    const w = bareWorld();
    const o = place(w, 'o', 0, 0, 1.0);
    place(w, 'near', 40, 40);
    spawn(w, o, 60, 0, 'radar');
    const own = buildFrame(w, 'o').decoys![0];
    expect(Object.keys(own)).toEqual(['id', 'x', 'y', 'own', 'by', 'kind', 'hp', 'sweep', 'until']);
    expect(own.sweep).toBeCloseTo(1.0, 12); // seeded at the owner's heading
    expect(buildFrame(w, 'near').decoys![0]).toEqual({ id: 'd1', x: 60, y: 0, own: false, by: 'o', kind: 'radar' });
  });
});

describe('THE BUOY BODY — the lifetime (ruling 0: 30 s after the drop)', () => {
  it('alive through the tick before lifetimeMs, gone on the tick it reaches lifetimeMs; nothing else ages or moves it', () => {
    const w = bareWorld();
    const o = place(w, 'o', -800, 0);
    spawn(w, o, 0, 0);
    const born = w.now;
    const snapshot = { ...w.decoys.get('d1')! };
    while (w.now + CONFIG.tick.simDtMs < born + CONFIG.buoy.lifetimeMs) w.step();
    expect(w.now).toBeLessThan(born + CONFIG.buoy.lifetimeMs);
    expect(w.decoys.get('d1')).toEqual(snapshot); // nothing moved it, wore its hp, or shot from it
    w.step();
    expect(w.now).toBe(born + CONFIG.buoy.lifetimeMs);
    expect(w.decoys.has('d1')).toBe(false);
    expect('decoys' in buildFrame(w, 'o')).toBe(false);
  });
});
