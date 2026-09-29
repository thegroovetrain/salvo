// DECOY BUOY (Story 8.16, catalog-v3 R36/R41, epic-8 amendments 119–124).
//
// A click-placed consumable dropped in the MINE's rear sector: a 50 hp float in
// `World.decoys` that is the `decoy` target kind — enemy shells, bursts and
// fish damage it (amendments 120/121), the owner's own ordnance never does
// (amendment 119) — with no lifetime and no owner-death despawn (amendment
// 122). It rides the contact-like `decoys` frame channel (the mine rule; `by`
// for every observer, `hp` for the owner only) and paints on radar as an
// anonymous 12 u square through the ordinary blip gate.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  CONSUMABLE_SLOTS,
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
const BELT = CONSUMABLE_SLOTS[0];

function bareWorld(seed = 816): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  w.map.heightRaster = flatRaster(2000);
  return w;
}

function place(w: World, id: string, x: number, y: number, heading = 0): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), 'captain', 'mineLayer', undefined, undefined);
  rec.state = { x, y, heading, speed: 0 };
  return rec;
}

/** Aim the ship's latest input (the belt click reads `aim` / `aimDist`). */
function aim(ship: ShipRecord, a: number, dist: number): void {
  ship.input = { ...ship.input, aim: a, aimDist: dist, slot: BELT } as InputMsg;
}

/** Stock one DECOY BUOY copy in the first belt slot. */
function stock(w: World, ship: ShipRecord): void {
  w.applyCard(ship, 'decoyBuoy');
  expect(ship.loadout[BELT]).toEqual({ equipmentId: 'decoyBuoy', state: { n: 1, reloadMsLeft: 0 } });
}

/** The copy is still aboard — on the belt AND in the held build (ONE SPEND LAW). */
function unspent(ship: ShipRecord): void {
  expect(ship.loadout[BELT]).toEqual({ equipmentId: 'decoyBuoy', state: { n: 1, reloadMsLeft: 0 } });
  expect(ship.cards).toContain('decoyBuoy');
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

describe('DECOY BUOY — the drop (the mine rack\'s denial matrix, one spend law)', () => {
  it('HAPPY: a click astern inside placeRange on water drops a 50 hp decoy AT the click and spends the copy', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0, 0); // bow +x: astern is π
    stock(w, a);
    aim(a, Math.PI, 60);
    expect(w.sinkingActivationGate(a, BELT)).toEqual({ ok: true });
    expect([...w.decoys.values()]).toEqual([
      expect.objectContaining({ id: 'd1', ownerId: 'a', hp: CONFIG.decoyBuoy.hp }),
    ]);
    const d = w.decoys.get('d1')!;
    expect(d.x).toBeCloseTo(-60, 9);
    expect(d.y).toBeCloseTo(0, 9);
    expect(a.loadout[BELT]).toEqual({ equipmentId: null, state: null });
    expect(a.cards).not.toContain('decoyBuoy');
  });

  it('BLOCKED: a click on an island, or off the water disk, denies `blocked` and spends NOTHING', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0, 0);
    w.map.islands.push(circleIsland(-80, 0, 30));
    stock(w, a);
    aim(a, Math.PI, 80); // dead centre of the rock
    expect(w.sinkingActivationGate(a, BELT)).toEqual({ ok: false, reason: 'blocked' });
    unspent(a);
    const rim = place(w, 'r', w.map.radius - 30, 0, Math.PI); // bow −x: astern is +x, past the rim
    stock(w, rim);
    aim(rim, 0, 80);
    expect(w.sinkingActivationGate(rim, BELT)).toEqual({ ok: false, reason: 'blocked' });
    unspent(rim);
    expect(w.decoys.size).toBe(0);
  });

  it('OUT OF ARC: a bow click, or a click past placeRange, denies `out-of-arc` and spends NOTHING', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0, 0);
    stock(w, a);
    aim(a, 0, 60); // the bow
    expect(w.sinkingActivationGate(a, BELT)).toEqual({ ok: false, reason: 'out-of-arc' });
    aim(a, Math.PI, CONFIG.mine.placeRange + 1);
    expect(w.sinkingActivationGate(a, BELT)).toEqual({ ok: false, reason: 'out-of-arc' });
    unspent(a);
    expect(w.decoys.size).toBe(0);
  });

  it('a denied press reaches the owner\'s frame as a `denied` row through the real input path', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0, 0);
    stock(w, a);
    w.submitInput('a', {
      seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 1, aimDist: 60, slot: BELT,
      fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0, held: false,
    });
    w.step();
    expect(buildFrame(w, 'a').denied).toEqual([{ slot: BELT, reason: 'out-of-arc', seq: 1 }]);
    unspent(a);
  });
});

describe('DECOY BUOY — damage (amendments 119–121)', () => {
  it('an ENEMY burst takes the shell\'s damage off it (15 -> 35) and fires the SHOOTER\'s hit call; no `dmg`', () => {
    const w = bareWorld();
    place(w, 'o', -800, 0);
    place(w, 'e', 800, 0);
    addDecoy(w.decoys, 'o', 0, 0, 'd1');
    const evs = burstAt(w, 'e', 0, 0);
    expect(w.decoys.get('d1')!.hp).toBe(CONFIG.decoyBuoy.hp - CONFIG.gun.damage);
    expect(evs.filter((e) => e.k === 'hc' && e.id === 'e')).toHaveLength(1); // amendment 121
    expect(evs.some((e) => e.k === 'sp')).toBe(false);
    expect(evs.some((e) => e.k === 'dmg')).toBe(false); // a decoy is not a ship
  });

  it('the OWNER\'s own burst over its own decoy does NOTHING: no damage, no hit call (it splashes)', () => {
    const w = bareWorld();
    place(w, 'o', -800, 0);
    addDecoy(w.decoys, 'o', 0, 0, 'd1');
    const evs = burstAt(w, 'o', 0, 0);
    expect(w.decoys.get('d1')!.hp).toBe(CONFIG.decoyBuoy.hp);
    expect(evs.some((e) => e.k === 'hc')).toBe(false);
    expect(evs.filter((e) => e.k === 'sp' && e.id === 'o')).toHaveLength(1);
  });

  it('damageDecoy itself refuses the owner (defence in depth beside the shared skip)', () => {
    const w = bareWorld();
    place(w, 'o', -800, 0);
    addDecoy(w.decoys, 'o', 0, 0, 'd1');
    const inner = w as unknown as { damageDecoy(id: string, amount: number, byId: string): boolean };
    expect(inner.damageDecoy('d1', 999, 'o')).toBe(false);
    expect(w.decoys.get('d1')!.hp).toBe(CONFIG.decoyBuoy.hp);
    expect(inner.damageDecoy('nope', 5, 'e')).toBe(false);
    expect(inner.damageDecoy('d1', 5, 'e')).toBe(true);
    expect(w.decoys.get('d1')!.hp).toBe(CONFIG.decoyBuoy.hp - 5);
  });

  it('an ENEMY mine blast damages it; the layer\'s OWN blast never does', () => {
    const w = bareWorld();
    const o = place(w, 'o', -800, 0);
    const e = place(w, 'e', 800, 800);
    addDecoy(w.decoys, 'o', 0, 0, 'd1');
    const inner = w as unknown as {
      applyMineBlast(at: { x: number; y: number }, ownerId: string, kind: string, hulls: readonly unknown[]): { resolved: number };
      hitTargets(mask: readonly string[]): readonly unknown[];
    };
    expect(inner.applyMineBlast({ x: 5, y: 0 }, o.id, 'naval', inner.hitTargets(['hull', 'decoy'])).resolved).toBe(0);
    expect(w.decoys.get('d1')!.hp).toBe(CONFIG.decoyBuoy.hp);
    inner.applyMineBlast({ x: 5, y: 0 }, e.id, 'naval', inner.hitTargets(['hull', 'decoy']));
    expect(w.decoys.has('d1')).toBe(false); // 55 hp blast > a fresh 50 hp decoy
  });

  it('OWNER SINKS: the decoy persists — no lifetime, no owner-death despawn (amendment 122)', () => {
    const w = bareWorld();
    const o = place(w, 'o', -800, 0);
    place(w, 'e', 0, 60); // sighted neighbour of the decoy
    addDecoy(w.decoys, 'o', 0, 0, 'd1');
    w.sinkShip(o.id, 'e');
    for (let i = 0; i < Math.ceil(CONFIG.ship.sinkingWindowMs / CONFIG.tick.simDtMs) + 400; i++) w.step();
    expect(w.decoys.get('d1')).toEqual(expect.objectContaining({ ownerId: 'o', hp: CONFIG.decoyBuoy.hp }));
    expect(buildFrame(w, 'e').decoys).toEqual([{ id: 'd1', x: 0, y: 0, own: false, by: 'o' }]);
  });
});

describe('DECOY BUOY — the views and the radar paint', () => {
  it('owner always (with `hp` last); a DETECTING enemy gets {id,x,y,own,by}; a far one gets nothing', () => {
    const w = bareWorld();
    place(w, 'o', -2000, 0); // the owner, far from its own float
    place(w, 'near', 0, 80); // inside detect
    place(w, 'far', 0, 1500); // beyond detect and sight
    addDecoy(w.decoys, 'o', 0, 0, 'd1');
    const own = buildFrame(w, 'o').decoys!;
    expect(own).toEqual([{ id: 'd1', x: 0, y: 0, own: true, by: 'o', hp: CONFIG.decoyBuoy.hp }]);
    expect(Object.keys(own[0])).toEqual(['id', 'x', 'y', 'own', 'by', 'hp']);
    const near = buildFrame(w, 'near').decoys!;
    expect(near).toEqual([{ id: 'd1', x: 0, y: 0, own: false, by: 'o' }]);
    expect('hp' in near[0]).toBe(false);
    expect('decoys' in buildFrame(w, 'far')).toBe(false); // omitted when none
  });

  it('it PAINTS on radar as an untagged 12 u square when the observer\'s beam crosses it — and only then', () => {
    const w = bareWorld();
    const obs = place(w, 'obs', 0, 0);
    addDecoy(w.decoys, 'x', 450, 0, 'd1'); // in obs's annulus (sight < 450 <= radar)
    const want = paintSegmentCoverage(450, 0, 450, 0, CONFIG.decoyBuoy.sizeU, CONFIG.vision.radarCellU, w.now);
    obs.prevSweepAngle = TAU - 0.05;
    obs.sweepAngle = 0.05; // the beam crosses bearing 0 this tick
    const painted = blips(observe(w, 'obs').events);
    expect(painted).toEqual([{ k: 'blip', t: w.now, gx: want.gx, gy: want.gy, w: want.w, h: want.h, bits: want.bits }]);
    obs.prevSweepAngle = 1;
    obs.sweepAngle = 1.1; // the beam elsewhere
    expect(blips(observe(w, 'obs').events)).toEqual([]);
    // Inside the observer's own lit zone: the truth rides the `decoys`
    // channel, never a doubled paint.
    obs.prevSweepAngle = TAU - 0.05;
    obs.sweepAngle = 0.05;
    w.litZones.set('z', { id: 'z', ownerId: 'obs', x: 450, y: 0, r: 100, until: w.now + 5000, phosphor: false, dazzle: false } as never);
    expect(blips(observe(w, 'obs').events)).toEqual([]);
  });

  it('the OWNER\'s radar paints its own decoy through the same gate (no special case)', () => {
    const w = bareWorld();
    const o = place(w, 'o', 0, 0);
    addDecoy(w.decoys, 'o', 450, 0, 'd1');
    o.prevSweepAngle = TAU - 0.05;
    o.sweepAngle = 0.05;
    expect(blips(observe(w, 'o').events)).toHaveLength(1);
  });

  it('a new decoy has NO tick: the STEP_ORDER carries no decoy row and the buoy row is gone', () => {
    const w = bareWorld();
    const d = addDecoy(w.decoys, 'x', 0, 0, 'd1');
    const snapshot = { ...d };
    for (let i = 0; i < 50; i++) w.step();
    expect(w.decoys.get('d1')).toEqual(snapshot); // nothing moved it, aged it, or shot from it
  });
});
