import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  UPGRADE_IDS,
  WEAPON,
  defaultLoadout,
  effectiveStats,
  inArc,
  wrapAngle,
  zeroUpgrades,
  type BallisticEvent,
  type BoomEvent,
  type GameEvent,
} from '@salvo/shared';
import { clampToArc, fireGuns } from '../game/combat.js';
import type { ShipRecord } from '../game/world.js';
import { World } from '../game/world.js';
import { buildFrame } from '../game/frames.js';

const HALF_PI = Math.PI / 2;

const CRUISER_STATS = effectiveStats(CONFIG.shipClasses.cruiser, zeroUpgrades());

function rec(overrides: Partial<ShipRecord> = {}): ShipRecord {
  return {
    id: 'a',
    name: 'A',
    isDrone: false,
    classId: 'cruiser',
    cls: CONFIG.shipClasses.cruiser,
    upgrades: zeroUpgrades(),
    offers: [],
    stats: CRUISER_STATS,
    state: { x: 0, y: 0, heading: 0, speed: 0 },
    hp: CONFIG.shipClasses.cruiser.hp,
    alive: true,
    input: { seq: 1, throttle: 0, rudder: 0, aim: HALF_PI, fireSeq: 1, aimDist: 1000, weapon: WEAPON.gun },
    lastAckSeq: 1,
    lastFireSeq: 0,
    respawnAt: 0,
    sweepAngle: 0,
    prevSweepAngle: 0,
    seenBallistics: new Set<string>(),
    loadout: defaultLoadout(CRUISER_STATS),
    kills: 0,
    deaths: 0,
    damageDealt: 0,
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

/** A gun input aimed at `aim` with a click distance of `aimDist`. */
const gunInput = (aim: number, aimDist = 1000, fireSeq = 1, seq = 1) =>
  ({ seq, throttle: 0, rudder: 0, aim, fireSeq, aimDist, weapon: 0 as const });

describe('fireGuns — arc gating', () => {
  it('fires the port mount when aiming to port (+90deg)', () => {
    const ship = rec({ input: gunInput(HALF_PI) });
    const shells = fireGuns(ship, 0, mkId);
    expect(shells).toHaveLength(1);
    // Velocity points to +y (port beam): vx~0, vy=+shellSpeed.
    expect(shells[0].vy).toBeCloseTo(CONFIG.gun.shellSpeed, 6);
    expect(Math.abs(shells[0].vx)).toBeLessThan(1e-6);
  });

  it('fires nothing when aiming over the bow (no mount bears)', () => {
    const ship = rec({ input: gunInput(0) });
    expect(fireGuns(ship, 0, mkId)).toHaveLength(0);
  });

  it('fires the starboard mount when aiming to starboard (-90deg)', () => {
    const ship = rec({ input: gunInput(-HALF_PI) });
    const shells = fireGuns(ship, 0, mkId);
    expect(shells).toHaveLength(1);
    expect(shells[0].vy).toBeCloseTo(-CONFIG.gun.shellSpeed, 6);
  });
});

describe('fireGuns — gating rules', () => {
  it('drains the shared ammo pool, then denies once empty', () => {
    const ship = rec();
    expect(fireGuns(ship, 0, mkId)).toHaveLength(1); // pool 2 -> 1, reload starts
    expect(fireGuns(ship, 0, mkId)).toHaveLength(1); // pool 1 -> 0 (both out one arc)
    expect(fireGuns(ship, 0, mkId)).toHaveLength(0); // empty
    expect(ship.loadout[WEAPON.gun].state!.n).toBe(0);
    expect(ship.loadout[WEAPON.gun].state!.reloadMsLeft).toBe(CONFIG.gun.reloadMs); // firing mid-reload didn't reset it
  });

  it('does not fire when guns are not selected or the ship is dead ' +
    '(the click gate itself lives in World.fireControl)', () => {
    expect(fireGuns(rec({ input: { ...gunInput(HALF_PI), weapon: WEAPON.torpedo } }), 0, mkId)).toHaveLength(0);
    expect(fireGuns(rec({ alive: false }), 0, mkId)).toHaveLength(0);
  });
});

describe('fireGuns — shell range is the click distance (aimDist)', () => {
  const MUZZLE = CONFIG.shipClasses.cruiser.hull.length / 2 + CONFIG.gun.shellRadius;

  it('a click at 200u yields a muzzle-relative range of 200 − muzzleOffset', () => {
    const ship = rec({ input: gunInput(HALF_PI, 200) });
    const [shell] = fireGuns(ship, 0, mkId);
    expect(shell.distLeft).toBeCloseTo(200 - MUZZLE, 9);
  });

  it('a click beyond max range clamps to CONFIG.gun.shellRange', () => {
    const ship = rec({ input: gunInput(HALF_PI, 5000) });
    const [shell] = fireGuns(ship, 0, mkId);
    expect(shell.distLeft).toBe(CONFIG.gun.shellRange);
  });

  it('a click at/inside the own hull floors the range at 0 (splash at the muzzle)', () => {
    const ship = rec({ input: gunInput(HALF_PI, 5) });
    const [shell] = fireGuns(ship, 0, mkId);
    expect(shell.distLeft).toBe(0);
  });

  it('the beyond-max clamp uses the EFFECTIVE range (gunRange upgrade), not CONFIG', () => {
    const upgrades = zeroUpgrades();
    upgrades[UPGRADE_IDS.indexOf('gunRange')] = 2; // two stacks
    const stats = effectiveStats(CONFIG.shipClasses.cruiser, upgrades);
    const ship = rec({ upgrades, stats, input: gunInput(HALF_PI, 50000) });
    const [shell] = fireGuns(ship, 0, mkId);
    const expected = CONFIG.gun.shellRange * CONFIG.upgrades.gunRange.mult ** 2;
    expect(shell.distLeft).toBeCloseTo(expected, 9);
    expect(shell.distLeft).toBeGreaterThan(CONFIG.gun.shellRange);
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
    // A at origin heading 0; B 100u to port (+y). Aim A's guns at B (click on it).
    a.state = { x: 0, y: 0, heading: 0, speed: 0 };
    b.state = { x: 0, y: 100, heading: 0, speed: 0 };
    w.submitInput('a', gunInput(HALF_PI, 100));
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
    expect(b.hp).toBe(CONFIG.shipClasses.cruiser.hp - CONFIG.gun.damage);
    const boom = events.find((e) => e.k === 'boom' && e.hit === 'b');
    const dmg = events.find((e) => e.k === 'dmg' && e.id === 'b');
    expect(boom).toBeTruthy();
    expect(dmg).toMatchObject({ amount: CONFIG.gun.damage, hp: CONFIG.shipClasses.cruiser.hp - CONFIG.gun.damage });
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
    w.submitInput('a', gunInput(HALF_PI, 120));
    const events = stepCollect(w, 25);
    expect(b.hp).toBe(CONFIG.shipClasses.cruiser.hp); // never hit
    expect(events.some((e) => e.k === 'boom' && e.hit === undefined)).toBe(true); // splashed on the rock
    expect(events.some((e) => e.k === 'dmg')).toBe(false);
  });
});

/** A bare world with one gun ship at the origin, heading 0 (port arc = +y). */
function armed(seed = 5): { w: World; a: ShipRecord } {
  const w = new World(seed);
  w.map.islands.length = 0;
  const a = w.addShip('a', 'A');
  a.state = { x: 0, y: 0, heading: 0, speed: 0 };
  return { w, a };
}

const boomsOf = (events: GameEvent[]): BoomEvent[] =>
  events.filter((e): e is BoomEvent => e.k === 'boom');
const shellsOf = (events: GameEvent[]): BallisticEvent[] =>
  events.filter((e): e is BallisticEvent => e.k === 'shell');

describe('World fire control — one shot per click (fireSeq)', () => {
  it('REGRESSION: one fireSeq increment fires exactly ONE shell even when the ' +
    'same input re-applies for 20 ticks', () => {
    const { w } = armed();
    w.submitInput('a', gunInput(HALF_PI, 300));
    // The latest-input store re-applies this same message every tick.
    const events = stepCollect(w, 20);
    expect(shellsOf(events)).toHaveLength(1);
  });

  it('a click during reload is consumed, not queued (no deferred shot after reload)', () => {
    const { w } = armed();
    w.submitInput('a', gunInput(HALF_PI, 300, 1, 1));
    stepCollect(w, 10); // shell 1 out; pool drawn down, reloading (3s)
    // Drain the remaining pool round so the mid-reload click can't ride it.
    w.submitInput('a', gunInput(HALF_PI, 300, 2, 2));
    stepCollect(w, 1); // consumes click 2 -> pool now empty
    w.submitInput('a', gunInput(HALF_PI, 300, 3, 3)); // click mid-reload, empty pool
    // Step well past the reload end: the mid-reload click must NOT fire late.
    const events = stepCollect(w, CONFIG.gun.reloadMs / CONFIG.tick.simDtMs + 20);
    expect(shellsOf(events)).toHaveLength(0);
  });

  it('two clicks two ticks apart fire two shells (one per ready mount)', () => {
    const { w } = armed();
    w.submitInput('a', gunInput(HALF_PI, 300, 1, 1)); // click 1: port arc
    const first = stepCollect(w, 2);
    expect(shellsOf(first)).toHaveLength(1); // fired once, no re-fire on tick 2
    w.submitInput('a', gunInput(-HALF_PI, 300, 2, 3)); // click 2: starboard arc (ready mount)
    const second = stepCollect(w, 2);
    expect(shellsOf(second)).toHaveLength(1);
  });

  it('two clicks drain the 2-pool out the SAME arc; a third is denied', () => {
    const { w } = armed();
    w.submitInput('a', gunInput(HALF_PI, 300, 1, 1)); // click 1, port arc
    expect(shellsOf(stepCollect(w, 2))).toHaveLength(1); // pool 2 -> 1
    w.submitInput('a', gunInput(HALF_PI, 300, 2, 3)); // click 2, SAME port arc
    expect(shellsOf(stepCollect(w, 2))).toHaveLength(1); // pool 1 -> 0
    w.submitInput('a', gunInput(HALF_PI, 300, 3, 5)); // click 3, empty pool
    expect(shellsOf(stepCollect(w, 2))).toHaveLength(0); // denied — nothing spawns
  });

  it('a click while dead is consumed — no shot on the respawn tick', () => {
    const { w, a } = armed();
    w.sinkShip('a');
    w.submitInput('a', gunInput(HALF_PI, 300, 1, 1)); // click while dead
    const ticks = CONFIG.ship.respawnDelay / CONFIG.tick.simDtMs + 10;
    const events = stepCollect(w, ticks);
    expect(a.alive).toBe(true); // it respawned along the way
    expect(shellsOf(events)).toHaveLength(0); // the dead click never fired
    expect(a.lastFireSeq).toBe(1); // ...but it WAS consumed
  });
});

describe('World — guns fire AT the click point (aimDist)', () => {
  it('the shell splashes at a 200u click point, not at max range', () => {
    const { w } = armed();
    w.submitInput('a', gunInput(HALF_PI, 200));
    const [boom] = boomsOf(stepCollect(w, 60));
    expect(boom.x).toBeCloseTo(0, 4);
    expect(boom.y).toBeCloseTo(200, 4);
  });

  it('a click beyond max range splashes at muzzleOffset + shellRange', () => {
    const { w } = armed();
    w.submitInput('a', gunInput(HALF_PI, 5000));
    const [boom] = boomsOf(stepCollect(w, 120));
    const muzzle = CONFIG.shipClasses.cruiser.hull.length / 2 + CONFIG.gun.shellRadius;
    expect(boom.y).toBeCloseTo(muzzle + CONFIG.gun.shellRange, 4);
  });

  it('a click inside the own hull splashes at the muzzle with ZERO hp change (no self-damage)', () => {
    const { w, a } = armed();
    w.submitInput('a', gunInput(HALF_PI, 5));
    const events = stepCollect(w, 10);
    const booms = boomsOf(events);
    expect(booms).toHaveLength(1);
    expect(booms[0].hit).toBeUndefined(); // 'expired' never routes to hitShip
    expect(booms[0].y).toBeCloseTo(CONFIG.shipClasses.cruiser.hull.length / 2 + CONFIG.gun.shellRadius, 4);
    expect(a.hp).toBe(CONFIG.shipClasses.cruiser.hp);
    expect(events.some((e) => e.k === 'dmg')).toBe(false);
  });

  it('an island short of the click point still wins (splash on the rock, not at aimDist)', () => {
    const { w } = armed();
    (w.map.islands as { x: number; y: number; r: number }[]).push({ x: 0, y: 100, r: 30 });
    w.submitInput('a', gunInput(HALF_PI, 300));
    const [boom] = boomsOf(stepCollect(w, 60));
    expect(boom.y).toBeLessThan(100); // island entry, well short of the 300u click
    expect(boom.y).toBeCloseTo(70, 0);
  });
});
