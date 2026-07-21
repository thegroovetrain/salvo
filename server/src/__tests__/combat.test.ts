// The UNIVERSAL STANDARD GUN (Story 1.4, Eric rulings 2026-07-21): 360° (no
// arc), single shot on a 3s reload (a 1-round pool), burst-at-the-clicked-point
// hit rule with bodyblock interception + the proximity exception, hull-
// silhouette-edge spawn (no dead ring), owner burst immunity, and kill credit
// through the burst path. Exercised through the REAL seams: the sinking-
// activation gate for directed shell construction, and full World steps for
// resolution (events collected off tickEvents / buildFrame).

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  UPGRADE_IDS,
  hullSilhouette,
  inArc,
  pointPolygonDistance,
  transformPolygon,
  wrapAngle,
  zeroUpgrades,
  effectiveStats,
  type BallisticEvent,
  type BoomEvent,
  type BurstEvent,
  type DamageEvent,
  type GameEvent,
  type HullId,
} from '@salvo/shared';
import { clampToArc, gunTarget } from '../game/combat.js';
import type { ShipRecord } from '../game/world.js';
import { World } from '../game/world.js';
import { buildFrame } from '../game/frames.js';

const HALF_PI = Math.PI / 2;
const SLOT_GUN = 0;

describe('clampToArc (kept for the torpedo bow arc)', () => {
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

/** A gun-click input aimed at `aim` with a click distance of `aimDist`. */
const gunInput = (aim: number, aimDist = 1000, fireSeq = 1, seq = 1) =>
  ({ seq, throttle: 0, rudder: 0, aim, fireSeq, aimDist, slot: SLOT_GUN as 0 });

/** A bare world (islands cleared) with one ship pinned at the origin. */
function armed(seed = 5, hullId: HullId = 'torpedoBoat'): { w: World; a: ShipRecord } {
  const w = new World(seed);
  w.map.islands.length = 0;
  const a = w.addShip('a', 'A', false, hullId);
  a.state = { x: 0, y: 0, heading: 0, speed: 0 };
  return { w, a };
}

/** Collect every event across `n` steps. */
function stepCollect(w: World, n: number): GameEvent[] {
  const out: GameEvent[] = [];
  for (let i = 0; i < n; i++) {
    w.step();
    out.push(...w.tickEvents);
  }
  return out;
}

const boomsOf = (events: GameEvent[]): BoomEvent[] =>
  events.filter((e): e is BoomEvent => e.k === 'boom');
const burstsOf = (events: GameEvent[]): BurstEvent[] =>
  events.filter((e): e is BurstEvent => e.k === 'burst');
const dmgsOf = (events: GameEvent[]): DamageEvent[] =>
  events.filter((e): e is DamageEvent => e.k === 'dmg');
const shellsOf = (events: GameEvent[]): BallisticEvent[] =>
  events.filter((e): e is BallisticEvent => e.k === 'shell');

// ---------- directed activation: 360°, single shot, shell construction --------

describe('gun activation — 360°, never out-of-arc', () => {
  it.each([
    ['over the bow', 0],
    ['to port', HALF_PI],
    ['dead astern', Math.PI],
    ['to starboard', -HALF_PI],
  ])('fires %s (aim %f) — every bearing activates', (_label, aim) => {
    const { w, a } = armed();
    a.input = gunInput(aim, 300);
    expect(w.sinkingActivationGate(a, SLOT_GUN)).toEqual({ ok: true });
    const [shell] = [...w.shells.values()];
    // Velocity points exactly along the aim — no arc clamp anywhere.
    expect(shell.vx).toBeCloseTo(Math.cos(aim) * CONFIG.gun.shellSpeed, 6);
    expect(shell.vy).toBeCloseTo(Math.sin(aim) * CONFIG.gun.shellSpeed, 6);
  });

  it('the ONLY denial is an empty pool (the shot cooldown)', () => {
    const { w, a } = armed();
    a.input = gunInput(0, 300);
    expect(w.sinkingActivationGate(a, SLOT_GUN)).toEqual({ ok: true }); // pool 1 -> 0
    expect(w.sinkingActivationGate(a, SLOT_GUN)).toEqual({ ok: false, reason: 'no-ammo' });
    expect(a.loadout[SLOT_GUN].state).toEqual({ n: 0, reloadMsLeft: CONFIG.gun.reloadMs });
  });
});

describe('gun shell construction — the burst hit rule rides the projectile', () => {
  it('carries target point, burstRadius, contactDamage, damage from CONFIG', () => {
    const { w, a } = armed();
    a.input = gunInput(HALF_PI, 300);
    w.sinkingActivationGate(a, SLOT_GUN);
    const [shell] = [...w.shells.values()];
    expect(shell.kind).toBe('shell');
    expect(shell.damage).toBe(CONFIG.gun.damage);
    expect(shell.contactDamage).toBe(CONFIG.gun.contactDamage);
    expect(shell.burstRadius).toBe(CONFIG.gun.burstRadius);
    expect(shell.hitRadius).toBe(CONFIG.gun.shellRadius);
    // Target = ship CENTER + unit(aim) × aimDist (inside range: unclamped).
    expect(shell.targetX).toBeCloseTo(0, 6);
    expect(shell.targetY).toBeCloseTo(300, 6);
  });

  it('gunTarget clamps the click to the effective range, measured from the CENTER', () => {
    const { w, a } = armed();
    a.input = gunInput(0, 5000);
    // Base effective range IS radar range (single source, no duplicated 650).
    expect(a.stats.gun.rangeU).toBe(CONFIG.vision.radar);
    expect(gunTarget(a).x).toBeCloseTo(CONFIG.vision.radar, 9);
    w.sinkingActivationGate(a, SLOT_GUN);
    const [shell] = [...w.shells.values()];
    expect(shell.targetX).toBeCloseTo(CONFIG.vision.radar, 9); // center-measured — the muzzle never extends reach
    expect(shell.targetY).toBeCloseTo(0, 9);
  });

  it('the beyond-max clamp uses the EFFECTIVE range (gunRange upgrade), not CONFIG', () => {
    const { w, a } = armed();
    const upgrades = zeroUpgrades();
    upgrades[UPGRADE_IDS.indexOf('gunRange')] = 2; // two stacks
    a.upgrades = upgrades;
    a.stats = effectiveStats(a.cls, upgrades);
    a.input = gunInput(0, 50000);
    w.sinkingActivationGate(a, SLOT_GUN);
    const [shell] = [...w.shells.values()];
    const expected = CONFIG.vision.radar * CONFIG.upgrades.gunRange.mult ** 2;
    expect(shell.targetX).toBeCloseTo(expected, 9);
    expect(expected).toBeGreaterThan(CONFIG.vision.radar); // interregnum artifact: can outrange radar
  });
});

describe('gun shell spawn — hull silhouette edge, NO dead ring', () => {
  function spawnFor(hullId: HullId, aim: number): { shell: { x: number; y: number }; a: ShipRecord } {
    const { w, a } = armed(5, hullId);
    a.input = gunInput(aim, 400);
    expect(w.sinkingActivationGate(a, SLOT_GUN)).toEqual({ ok: true });
    const [shell] = [...w.shells.values()];
    return { shell, a };
  }

  it.each([
    ['torpedoBoat bow', 'torpedoBoat', 0],
    ['torpedoBoat abeam', 'torpedoBoat', HALF_PI],
    ['torpedoBoat astern', 'torpedoBoat', Math.PI],
    ['battleship bow', 'battleship', 0],
    ['battleship abeam', 'battleship', HALF_PI],
    ['battleship quarter', 'battleship', (3 * Math.PI) / 4],
    ['mineLayer astern (transom notch bearing)', 'mineLayer', Math.PI],
  ] as const)('%s: spawns just outside the silhouette boundary', (_label, hullId, aim) => {
    const { shell, a } = spawnFor(hullId, aim);
    const poly = transformPolygon(hullSilhouette(hullId), a.state.x, a.state.y, a.state.heading);
    const d = pointPolygonDistance({ x: shell.x, y: shell.y }, poly);
    expect(d).toBeGreaterThan(0); // strictly outside the own hull
    expect(d).toBeLessThanOrEqual(2 * CONFIG.gun.shellRadius + 1); // ...but hugging the edge
  });

  it('REGRESSION (1.3 deferred dead ring): an abeam battleship shell spawns at ~beam/2, not length/2', () => {
    const { shell } = spawnFor('battleship', HALF_PI);
    const bb = CONFIG.shipClasses.battleship.hull;
    expect(shell.y).toBeLessThanOrEqual(bb.beam / 2 + 2 * CONFIG.gun.shellRadius + 1); // ~20u
    expect(shell.y).toBeLessThan(bb.length / 2); // the old 62u+ offset is gone
  });
});

// ---------- World integration: burst resolution --------------------------------

describe('World combat — burst at the clicked point', () => {
  it('a click on an enemy bursts at the click point: ONE burst event + a victim-private dmg', () => {
    const { w, a } = armed(1);
    const b = w.addShip('b', 'B');
    b.state = { x: 0, y: 100, heading: 0, speed: 0 };
    a.state = { x: 0, y: 0, heading: 0, speed: 0 };
    w.submitInput('a', gunInput(HALF_PI, 100));
    const events = stepCollect(w, 25);
    const bursts = burstsOf(events);
    expect(bursts).toHaveLength(1);
    expect(bursts[0].x).toBeCloseTo(0, 4);
    expect(bursts[0].y).toBeCloseTo(100, 4);
    expect(b.hp).toBe(CONFIG.shipClasses.torpedoBoat.hp - CONFIG.gun.damage); // full burst damage
    expect(dmgsOf(events)).toEqual([
      { k: 'dmg', id: 'b', amount: CONFIG.gun.damage, hp: b.hp },
    ]);
  });

  it('a burst catches SEVERAL: every hull within burstRadius takes full damage, one dmg each', () => {
    const { w, a } = armed(1);
    a.state = { x: 0, y: 0, heading: 0, speed: 0 };
    // Two enemies flanking the click point, hulls ~7.5u from it (inside the
    // 15u blast) but 7.5u clear of the shell's flight line (no interception).
    const b = w.addShip('b', 'B');
    b.state = { x: 12, y: 200, heading: HALF_PI, speed: 0 };
    const c = w.addShip('c', 'C');
    c.state = { x: -12, y: 200, heading: HALF_PI, speed: 0 };
    w.submitInput('a', gunInput(HALF_PI, 200));
    const events = stepCollect(w, 45);
    expect(burstsOf(events)).toHaveLength(1); // ONE burst event, ever
    const dmgs = dmgsOf(events);
    expect(dmgs.map((e) => e.id).sort()).toEqual(['b', 'c']); // one victim-private dmg each
    for (const dmg of dmgs) expect(dmg.amount).toBe(CONFIG.gun.damage);
    expect(b.hp).toBe(CONFIG.shipClasses.torpedoBoat.hp - CONFIG.gun.damage);
    expect(c.hp).toBe(CONFIG.shipClasses.torpedoBoat.hp - CONFIG.gun.damage);
  });

  it('bodyblock FAR from the target: interceptor takes contactDamage, NO burst, shell stops', () => {
    const { w, a } = armed(1);
    a.state = { x: 0, y: 0, heading: 0, speed: 0 };
    const b = w.addShip('b', 'B'); // crosses the flight line 200u short of the click
    b.state = { x: 0, y: 300, heading: HALF_PI, speed: 0 };
    w.submitInput('a', gunInput(HALF_PI, 500));
    const events = stepCollect(w, 60);
    expect(burstsOf(events)).toEqual([]); // bodyblocking kills the burst
    const boom = boomsOf(events).find((e) => e.hit === 'b');
    expect(boom).toBeDefined();
    expect(boom!.y).toBeLessThan(300); // stopped at b's hull, well short of the 500u click
    expect(b.hp).toBe(CONFIG.shipClasses.torpedoBoat.hp - CONFIG.gun.contactDamage); // the SMALLER contact damage
    expect(dmgsOf(events)).toEqual([
      { k: 'dmg', id: 'b', amount: CONFIG.gun.contactDamage, hp: b.hp },
    ]);
  });

  it('bodyblock NEAR the target (proximity exception): full burst at the TARGET, no double-dipping', () => {
    const { w, a } = armed(1);
    a.state = { x: 0, y: 0, heading: 0, speed: 0 };
    const b = w.addShip('b', 'B'); // hull straddles the click point itself
    b.state = { x: 0, y: 495, heading: HALF_PI, speed: 0 };
    w.submitInput('a', gunInput(HALF_PI, 500));
    const events = stepCollect(w, 90);
    const bursts = burstsOf(events);
    expect(bursts).toHaveLength(1);
    expect(bursts[0].y).toBeCloseTo(500, 4); // burst ALWAYS centers on the target xy
    // Burst damage only — never contact + burst on the same shell.
    expect(b.hp).toBe(CONFIG.shipClasses.torpedoBoat.hp - CONFIG.gun.damage);
    expect(dmgsOf(events)).toEqual([
      { k: 'dmg', id: 'b', amount: CONFIG.gun.damage, hp: b.hp },
    ]);
  });

  it('the OWNER is never damaged by its own burst (click inside/at the own hull)', () => {
    const { w, a } = armed(1);
    a.state = { x: 0, y: 0, heading: 0, speed: 0 };
    w.submitInput('a', gunInput(HALF_PI, 5)); // click right at the own hull
    const events = stepCollect(w, 10);
    expect(burstsOf(events)).toHaveLength(1); // it DOES burst at the click point...
    expect(a.hp).toBe(CONFIG.shipClasses.torpedoBoat.hp); // ...harmlessly (owner immunity)
    expect(dmgsOf(events)).toEqual([]);
  });

  it('kill credit flows through the burst path: sunk by the firer, kill + banked point', () => {
    const { w, a } = armed(1);
    a.state = { x: 0, y: 0, heading: 0, speed: 0 };
    const b = w.addShip('b', 'B');
    b.state = { x: 0, y: 100, heading: 0, speed: 0 };
    b.hp = CONFIG.gun.damage; // one burst finishes it
    w.submitInput('a', gunInput(HALF_PI, 100));
    const events = stepCollect(w, 25);
    expect(b.alive).toBe(false);
    expect(a.kills).toBe(1);
    expect(b.deaths).toBe(1);
    expect(a.offers).toHaveLength(1); // the kill banked an upgrade point
    expect(events.some((e) => e.k === 'sunk' && e.id === 'b' && e.by === 'a')).toBe(true);
  });

  it('an island short of the click point stops the shell dead: boom, no damage, no burst', () => {
    const { w, a } = armed(2);
    a.state = { x: 0, y: 0, heading: 0, speed: 0 };
    const b = w.addShip('b', 'B');
    b.state = { x: 0, y: 300, heading: 0, speed: 0 };
    (w.map.islands as { x: number; y: number; r: number }[]).push({ x: 0, y: 100, r: 30 });
    w.submitInput('a', gunInput(HALF_PI, 300));
    const events = stepCollect(w, 60);
    expect(burstsOf(events)).toEqual([]);
    expect(dmgsOf(events)).toEqual([]);
    expect(b.hp).toBe(CONFIG.shipClasses.torpedoBoat.hp);
    const [boom] = boomsOf(events);
    expect(boom.hit).toBeUndefined();
    expect(boom.y).toBeLessThan(100); // splashed on the rock's near face
  });

  it('an island INSIDE the would-be blast still bursts (proximity exception, plain radius query)', () => {
    const { w, a } = armed(2);
    a.state = { x: 0, y: 0, heading: 0, speed: 0 };
    // Island surface reaches to within burstRadius of the 500u click point.
    (w.map.islands as { x: number; y: number; r: number }[]).push({ x: 0, y: 480, r: 30 });
    w.submitInput('a', gunInput(HALF_PI, 500));
    const events = stepCollect(w, 90);
    const bursts = burstsOf(events);
    expect(bursts).toHaveLength(1);
    expect(bursts[0].y).toBeCloseTo(500, 4); // bursts at the TARGET, not the island face
    expect(boomsOf(events)).toEqual([]);
  });

  it('a clean click with nothing near the target bursts there (no boom, no dmg)', () => {
    const { w } = armed(3);
    w.submitInput('a', gunInput(HALF_PI, 200));
    const events = stepCollect(w, 60);
    expect(burstsOf(events)).toEqual([expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) })]);
    expect(burstsOf(events)[0].x).toBeCloseTo(0, 4);
    expect(burstsOf(events)[0].y).toBeCloseTo(200, 4);
    expect(boomsOf(events)).toEqual([]);
    expect(dmgsOf(events)).toEqual([]);
  });
});

// ---------- World fire control: one shot per click, single-shot pool -----------

describe('World fire control — one shot per click (fireSeq), single-shot pool', () => {
  it('REGRESSION: one fireSeq increment fires exactly ONE shell even when the ' +
    'same input re-applies for 20 ticks', () => {
    const { w } = armed();
    w.submitInput('a', gunInput(HALF_PI, 300));
    const events = stepCollect(w, 20);
    expect(shellsOf(events)).toHaveLength(1);
  });

  it('a click during the reload is consumed, not queued (no deferred shot after reload)', () => {
    const { w } = armed();
    w.submitInput('a', gunInput(HALF_PI, 300, 1, 1));
    stepCollect(w, 1); // shell 1 out — the single-shot pool is empty, reloading (3s)
    w.submitInput('a', gunInput(HALF_PI, 300, 2, 2)); // click mid-reload, empty pool
    // Step well past the reload end: the mid-reload click must NOT fire late.
    const events = stepCollect(w, CONFIG.gun.reloadMs / CONFIG.tick.simDtMs + 20);
    expect(shellsOf(events)).toHaveLength(0);
    // A FRESH click after the reload fires again (the pool refilled).
    w.submitInput('a', gunInput(HALF_PI, 300, 3, 3));
    expect(shellsOf(stepCollect(w, 2))).toHaveLength(1);
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

  it('the shell event still reaches other observers through the perception seam', () => {
    const { w, a } = armed(1);
    const b = w.addShip('b', 'B');
    b.state = { x: 0, y: 100, heading: 0, speed: 0 };
    a.state = { x: 0, y: 0, heading: 0, speed: 0 };
    w.submitInput('a', gunInput(HALF_PI, 100));
    w.step();
    expect(w.tickEvents.some((e) => e.k === 'shell')).toBe(true);
    expect(buildFrame(w, 'b').events.filter((e) => e.k === 'shell')).toHaveLength(1);
  });
});
