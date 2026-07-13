import { describe, it, expect } from 'vitest';
import { CONFIG, WEAPON, inArc, wrapAngle, type GameEvent } from '@salvo/shared';
import {
  clampToArc,
  fireGuns,
  freshGunCooldowns,
  soonestGunCooldown,
  tickGunCooldowns,
} from '../game/combat.js';
import type { ShipRecord } from '../game/world.js';
import { World } from '../game/world.js';
import { buildFrame } from '../game/frames.js';

const HALF_PI = Math.PI / 2;

function rec(overrides: Partial<ShipRecord> = {}): ShipRecord {
  return {
    id: 'a',
    name: 'A',
    isDrone: false,
    state: { x: 0, y: 0, heading: 0, speed: 0 },
    hp: CONFIG.ship.hp,
    alive: true,
    input: { seq: 1, throttle: 0, rudder: 0, aim: HALF_PI, fire: true, weapon: WEAPON.gun },
    lastAckSeq: 1,
    respawnAt: 0,
    sweepAngle: 0,
    prevSweepAngle: 0,
    seenShells: new Set<string>(),
    gunCooldowns: freshGunCooldowns(),
    kills: 0,
    deaths: 0,
    ...overrides,
  };
}

let idSeq = 0;
const mkId = (): string => `s${++idSeq}`;

describe('clampToArc', () => {
  it('returns the aim unchanged when already inside the arc', () => {
    expect(clampToArc(HALF_PI, HALF_PI, 0.5)).toBeCloseTo(HALF_PI, 9);
  });

  it('clamps to the near edge when the aim is outside the arc', () => {
    const center = HALF_PI;
    const halfArc = 0.4;
    const clamped = clampToArc(HALF_PI + 1, center, halfArc);
    expect(clamped).toBeCloseTo(wrapAngle(center + halfArc), 9);
    expect(inArc(clamped, center, halfArc + 1e-9)).toBe(true);
  });
});

describe('tickGunCooldowns + soonestGunCooldown', () => {
  it('floors cooldowns at zero and reports the soonest-ready mount', () => {
    const cd = [2500, 500];
    tickGunCooldowns(cd, 600);
    expect(cd).toEqual([1900, 0]);
    expect(soonestGunCooldown(cd)).toBe(0);
    expect(soonestGunCooldown([1200, 900])).toBe(900);
  });
});

describe('fireGuns — arc gating', () => {
  it('fires the port mount when aiming to port (+90deg)', () => {
    const ship = rec({ input: { seq: 1, throttle: 0, rudder: 0, aim: HALF_PI, fire: true, weapon: 0 } });
    const shells = fireGuns(ship, 0, mkId);
    expect(shells).toHaveLength(1);
    // Velocity points to +y (port beam): vx~0, vy=+shellSpeed.
    expect(shells[0].vy).toBeCloseTo(CONFIG.gun.shellSpeed, 6);
    expect(Math.abs(shells[0].vx)).toBeLessThan(1e-6);
  });

  it('fires nothing when aiming over the bow (no mount bears)', () => {
    const ship = rec({ input: { seq: 1, throttle: 0, rudder: 0, aim: 0, fire: true, weapon: 0 } });
    expect(fireGuns(ship, 0, mkId)).toHaveLength(0);
  });

  it('fires the starboard mount when aiming to starboard (-90deg)', () => {
    const ship = rec({ input: { seq: 1, throttle: 0, rudder: 0, aim: -HALF_PI, fire: true, weapon: 0 } });
    const shells = fireGuns(ship, 0, mkId);
    expect(shells).toHaveLength(1);
    expect(shells[0].vy).toBeCloseTo(-CONFIG.gun.shellSpeed, 6);
  });
});

describe('fireGuns — gating rules', () => {
  it('does not fire a mount that is still reloading', () => {
    const ship = rec();
    fireGuns(ship, 0, mkId); // fires port, sets its cooldown
    expect(fireGuns(ship, 0, mkId)).toHaveLength(0);
    expect(ship.gunCooldowns[0]).toBe(CONFIG.gun.reload);
  });

  it('does not fire when fire is not held, wrong weapon, or dead', () => {
    expect(fireGuns(rec({ input: { seq: 1, throttle: 0, rudder: 0, aim: HALF_PI, fire: false, weapon: 0 } }), 0, mkId)).toHaveLength(0);
    expect(fireGuns(rec({ input: { seq: 1, throttle: 0, rudder: 0, aim: HALF_PI, fire: true, weapon: WEAPON.torpedo } }), 0, mkId)).toHaveLength(0);
    expect(fireGuns(rec({ alive: false }), 0, mkId)).toHaveLength(0);
  });
});

/** Collect every event across `n` steps. */
function stepCollect(w: World, n: number): GameEvent[] {
  const out: GameEvent[] = [];
  for (let i = 0; i < n; i++) {
    w.step();
    out.push(...w.tickEvents);
  }
  return out;
}

describe('World combat integration', () => {
  function fight(): { w: World; a: ShipRecord; b: ShipRecord } {
    const w = new World(1);
    const a = w.addShip('a', 'A');
    const b = w.addShip('b', 'B');
    // A at origin heading 0; B 100u to port (+y). Aim A's guns at B.
    a.state = { x: 0, y: 0, heading: 0, speed: 0 };
    b.state = { x: 0, y: 100, heading: 0, speed: 0 };
    w.submitInput('a', { seq: 1, throttle: 0, rudder: 0, aim: HALF_PI, fire: true, weapon: 0 });
    return { w, a, b };
  }

  it('emits a shell event on the firing tick', () => {
    const { w } = fight();
    w.step();
    expect(w.tickEvents.some((e) => e.k === 'shell')).toBe(true);
    // The frame carries it through the perception seam.
    const shells = buildFrame(w, 'b').events.filter((e) => e.k === 'shell');
    expect(shells).toHaveLength(1);
  });

  it('damages the target with a boom(+hit) and dmg event', () => {
    const { w, b } = fight();
    const events = stepCollect(w, 25); // enough for the shell to reach B
    expect(b.hp).toBe(CONFIG.ship.hp - CONFIG.gun.damage);
    const boom = events.find((e) => e.k === 'boom' && e.hit === 'b');
    const dmg = events.find((e) => e.k === 'dmg' && e.id === 'b');
    expect(boom).toBeTruthy();
    expect(dmg).toMatchObject({ amount: CONFIG.gun.damage, hp: CONFIG.ship.hp - CONFIG.gun.damage });
  });

  it('a killing hit sinks the target and books the kill/death', () => {
    const { w, a, b } = fight();
    b.hp = CONFIG.gun.damage; // one shell will finish B
    const events = stepCollect(w, 25);
    expect(b.alive).toBe(false);
    expect(a.kills).toBe(1);
    expect(b.deaths).toBe(1);
    expect(events.some((e) => e.k === 'sunk' && e.id === 'b' && e.by === 'a')).toBe(true);
  });

  it('an island between shooter and target blocks the shell (no damage)', () => {
    const w = new World(2);
    const a = w.addShip('a', 'A');
    const b = w.addShip('b', 'B');
    a.state = { x: 0, y: 0, heading: 0, speed: 0 };
    b.state = { x: 0, y: 120, heading: 0, speed: 0 };
    // Drop an island squarely on the firing line between A and B.
    (w.map.islands as { x: number; y: number; r: number }[]).push({ x: 0, y: 60, r: 30 });
    w.submitInput('a', { seq: 1, throttle: 0, rudder: 0, aim: HALF_PI, fire: true, weapon: 0 });
    const events = stepCollect(w, 25);
    expect(b.hp).toBe(CONFIG.ship.hp); // never hit
    expect(events.some((e) => e.k === 'boom' && e.hit === undefined)).toBe(true); // splashed on the rock
    expect(events.some((e) => e.k === 'dmg')).toBe(false);
  });
});
