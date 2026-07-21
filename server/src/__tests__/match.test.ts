// Match lifecycle state machine (game/match.ts): every transition including
// countdown cancel + relock, the active reset (field cleared, hulls redeployed,
// zone anchored), waiting-phase damage suppression (mines drop freely but the
// field is wiped at activation), disabled respawn in active, placement
// ordering (sink order, leave-during-match, mutual destruction), the results
// payload, and the post-results disconnect.

import { describe, it, expect } from 'vitest';
import { CONFIG, type ResultsMsg } from '@salvo/shared';
import { World } from '../game/world.js';
import { Match, type MatchHooks } from '../game/match.js';

const DT = CONFIG.tick.simDtMs;
const TIMINGS = { countdownMs: 100, resultsMs: 200 }; // 2 ticks / 4 ticks

interface Recorder {
  calls: string[];
  results: ResultsMsg[];
  hooks: MatchHooks;
}

function recorder(): Recorder {
  const calls: string[] = [];
  const results: ResultsMsg[] = [];
  return {
    calls,
    results,
    hooks: {
      lock: () => calls.push('lock'),
      unlock: () => calls.push('unlock'),
      fillToCapacity: () => calls.push('fill'),
      broadcastResults: (m) => {
        calls.push('results');
        results.push(m);
      },
      disconnect: () => calls.push('disconnect'),
    },
  };
}

interface Ctx extends Recorder {
  w: World;
  m: Match;
}

/** Bare world (no islands) + match with fast timings; ships joined in order. */
function setup(ids: string[]): Ctx {
  const w = new World(1);
  w.map.islands.length = 0;
  const rec = recorder();
  const m = new Match(w, TIMINGS, rec.hooks);
  for (const id of ids) {
    w.addShip(id, id.toUpperCase());
    m.notifyRosterChanged();
  }
  return { w, m, ...rec };
}

function step(ctx: Ctx, ticks = 1): void {
  for (let i = 0; i < ticks; i++) {
    ctx.w.step();
    ctx.m.update();
  }
}

/** Run the countdown out (must already be in countdown). */
function activate(ctx: Ctx): void {
  expect(ctx.m.phase).toBe('countdown');
  for (let i = 0; i < 100 && ctx.m.phase !== 'active'; i++) step(ctx);
  expect(ctx.m.phase).toBe('active');
}

function injectShell(ctx: Ctx, id: string, ownerId: string, x: number, y: number): void {
  ctx.w.shells.set(id, {
    id,
    ownerId,
    x,
    y,
    vx: CONFIG.gun.shellSpeed,
    vy: 0,
    distLeft: 60,
    bornAt: ctx.w.now,
    kind: 'shell',
    damage: CONFIG.gun.damage,
    hitRadius: CONFIG.gun.shellRadius,
    targetX: null,
    targetY: null,
    burstRadius: 0,
    contactDamage: CONFIG.gun.damage, // contact-only injection: legacy full-damage hit
  });
}

function fire(ctx: Ctx, id: string, slot: 0 | 1 | 2, seq: number): void {
  // seq doubles as the click counter: every call is one fresh click.
  ctx.w.submitInput(id, { seq, throttle: 0, rudder: 0, aim: 0, fireSeq: seq, aimDist: 600, slot });
}

/** Step until this tick's events contain a boom (shell resolution is 1-4 ticks). */
function stepUntilBoom(ctx: Ctx, maxTicks = 20): void {
  for (let i = 0; i < maxTicks; i++) {
    step(ctx);
    if (ctx.w.tickEvents.some((e) => e.k === 'boom')) return;
  }
  throw new Error('no boom within the tick budget');
}

describe('match — waiting phase (ready room)', () => {
  it('starts weapons-safe: damage off, respawn on', () => {
    const ctx = setup(['a']);
    expect(ctx.m.phase).toBe('waiting');
    expect(ctx.w.damageEnabled).toBe(false);
    expect(ctx.w.respawnEnabled).toBe(true);
  });

  it('suppresses all shell damage (target practice: boom, no hp loss)', () => {
    const ctx = setup(['a']);
    const a = ctx.w.ships.get('a')!;
    injectShell(ctx, 's1', 'ghost', a.state.x - 20, a.state.y); // point blank on a
    stepUntilBoom(ctx); // impact still visible (boom emitted)...
    expect(a.hp).toBe(CONFIG.shipClasses.torpedoBoat.hp); // ...but no hp is lost
    expect(a.alive).toBe(true);
    expect(ctx.w.tickEvents.some((e) => e.k === 'dmg')).toBe(false);
  });

  it('allows mine drops (no phase lockout — resetForMatchStart clears the field at activation instead)', () => {
    const ctx = setup(['a']);
    fire(ctx, 'a', 2, 1);
    step(ctx);
    expect(ctx.w.mines.size).toBe(1);
    expect(ctx.w.ships.get('a')!.loadout[2].state!.reloadMsLeft).toBeGreaterThan(0); // drop started the reload
  });

  it('a practice mine deals no damage when triggered (target practice: boom, no hp loss, mine despawns)', () => {
    const ctx = setup(['a']); // single human — stays in waiting (matches the other tests here)
    const a = ctx.w.ships.get('a')!;
    // Drop an already-armed mine (owned by a bystander, like injectShell's 'ghost')
    // right on top of a — walks a ship onto an armed practice mine in waiting.
    ctx.w.mines.set('m1', { id: 'm1', ownerId: 'ghost', x: a.state.x, y: a.state.y, armedAt: 0 });
    step(ctx);
    expect(ctx.w.mines.size).toBe(0); // triggered + despawned
    expect(ctx.w.tickEvents.some((e) => e.k === 'boom')).toBe(true);
    expect(a.hp).toBe(CONFIG.shipClasses.torpedoBoat.hp); // no hp lost — damage is suppressed
    expect(a.alive).toBe(true);
  });

  it('keeps the respawn loop alive', () => {
    const ctx = setup(['a']);
    ctx.w.sinkShip('a');
    const a = ctx.w.ships.get('a')!;
    expect(a.respawnAt).toBeGreaterThan(0);
    step(ctx, Math.ceil(CONFIG.ship.respawnDelay / DT) + 1);
    expect(a.alive).toBe(true);
  });
});

describe('match — countdown', () => {
  it('starts at minHumans, locks the room, sets countdownEndT', () => {
    const ctx = setup(['a']);
    expect(ctx.calls).toEqual([]);
    ctx.w.addShip('b', 'B');
    ctx.m.notifyRosterChanged();
    expect(ctx.m.phase).toBe('countdown');
    expect(ctx.m.countdownEndT).toBe(ctx.w.now + TIMINGS.countdownMs);
    expect(ctx.calls).toEqual(['lock']);
    expect(ctx.w.damageEnabled).toBe(false); // countdown is still weapons-safe
  });

  it('cancels back to waiting (and unlocks) when humans drop below minimum', () => {
    const ctx = setup(['a', 'b']);
    ctx.m.onPlayerLeave('b');
    expect(ctx.m.phase).toBe('waiting');
    expect(ctx.m.countdownEndT).toBe(0);
    expect(ctx.calls).toEqual(['lock', 'unlock']);
    expect(ctx.w.ships.has('b')).toBe(false);
    // Reaching the minimum again starts a FRESH countdown.
    step(ctx, 5);
    ctx.w.addShip('b', 'B');
    ctx.m.notifyRosterChanged();
    expect(ctx.m.phase).toBe('countdown');
    expect(ctx.m.countdownEndT).toBe(ctx.w.now + TIMINGS.countdownMs);
    expect(ctx.calls).toEqual(['lock', 'unlock', 'lock']);
  });

  it('activates at countdown end: fill seam, field cleared, hulls redeployed, zone anchored', () => {
    const ctx = setup(['a', 'b']);
    const a = ctx.w.ships.get('a')!;
    // Dirty the practice field.
    injectShell(ctx, 's1', 'a', 500, 500);
    ctx.w.mines.set('m1', { id: 'm1', ownerId: 'a', x: 1, y: 2, armedAt: 0 });
    a.hp = 40;
    a.state.x = 5;
    a.state.y = 5;
    a.loadout[0].state = { n: 0, reloadMsLeft: 1000 }; // draw down the gun pool
    a.seenBallistics.add('s1');
    expect(ctx.w.zonePhase).toBe('idle');

    activate(ctx);

    expect(ctx.calls).toContain('fill'); // STEP 15 drone seam ran
    expect(ctx.w.shells.size).toBe(0);
    expect(ctx.w.mines.size).toBe(0);
    expect(ctx.w.zonePhase).not.toBe('idle'); // storm timeline anchored
    expect(ctx.m.countdownEndT).toBe(0);
    expect(ctx.w.damageEnabled).toBe(true);
    expect(ctx.w.respawnEnabled).toBe(false);
    for (const ship of ctx.w.ships.values()) {
      expect(ship.hp).toBe(CONFIG.shipClasses.torpedoBoat.hp);
      expect(ship.alive).toBe(true);
      expect(Math.hypot(ship.state.x, ship.state.y)).toBeCloseTo(ctx.w.map.spawnRing, 6);
      // Full pools on every weapon slot (0-2; slot 3 is the empty extra slot).
      expect(ship.loadout.slice(0, 3).every((s) => s.state!.n > 0 && s.state!.reloadMsLeft === 0)).toBe(true);
      expect(ship.seenBallistics.size).toBe(0);
    }
    // The redeploy emits spawn events (clients snap camera/prediction).
    step(ctx);
    const spawns = ctx.w.tickEvents.filter((e) => e.k === 'spawn').map((e) => e.id);
    expect(spawns.sort()).toEqual(['a', 'b']);
  });
});

describe('match — active phase', () => {
  it('re-enables mine drops', () => {
    const ctx = setup(['a', 'b']);
    activate(ctx);
    fire(ctx, 'a', 2, 1);
    step(ctx);
    expect(ctx.w.mines.size).toBe(1);
    expect(ctx.w.ships.get('a')!.loadout[2].state!.reloadMsLeft).toBeGreaterThan(0); // drop started the reload
  });

  it('leaves sunk ships down: no respawn is ever scheduled', () => {
    const ctx = setup(['a', 'b', 'c']);
    activate(ctx);
    ctx.w.sinkShip('c', 'a');
    const c = ctx.w.ships.get('c')!;
    expect(c.respawnAt).toBe(0);
    step(ctx, Math.ceil(CONFIG.ship.respawnDelay / DT) + 2);
    expect(c.alive).toBe(false);
    expect(ctx.m.phase).toBe('active'); // two humans still afloat
  });

  it('accumulates damageDealt on the shooter (not the victim)', () => {
    const ctx = setup(['a', 'b', 'c']);
    activate(ctx);
    const b = ctx.w.ships.get('b')!;
    injectShell(ctx, 's1', 'a', b.state.x - 20, b.state.y);
    stepUntilBoom(ctx);
    expect(b.hp).toBe(CONFIG.shipClasses.torpedoBoat.hp - CONFIG.gun.damage);
    expect(ctx.w.ships.get('a')!.damageDealt).toBe(CONFIG.gun.damage);
    expect(b.damageDealt).toBe(0);
  });

  it('sink order drives placement: later sink places higher, winner = 1', () => {
    const ctx = setup(['a', 'b', 'c']);
    activate(ctx);
    ctx.w.sinkShip('c', 'a');
    step(ctx);
    expect(ctx.m.phase).toBe('active');
    ctx.w.sinkShip('b', 'a');
    step(ctx);
    expect(ctx.m.phase).toBe('finished');
    expect(ctx.m.winnerId).toBe('a');
    expect(ctx.m.placements.get('a')).toBe(1);
    expect(ctx.m.placements.get('b')).toBe(2);
    expect(ctx.m.placements.get('c')).toBe(3);
    expect(ctx.calls.filter((c) => c === 'results')).toHaveLength(1);
    const msg = ctx.results[0];
    expect(msg.winnerId).toBe('a');
    expect(msg.rows.map((r) => [r.id, r.placement])).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);
    expect(msg.rows.find((r) => r.id === 'a')!.kills).toBe(2);
    expect(msg.rows.find((r) => r.id === 'a')!.name).toBe('A');
  });

  it('FINDING P2 hardening: a participant absent from the snapshot (late join, unreachable via the room lock today) still gets a winner row', () => {
    const ctx = setup(['a', 'b']);
    activate(ctx);
    // participants is snapshotted once at activate(); simulate a ship added
    // to the World afterward without going through the normal join path (the
    // room lock makes this unreachable in production, but harden it anyway).
    ctx.w.addShip('late', 'LATE');
    expect(ctx.m.phase).toBe('active'); // 3 humans now alive: no insta-finish
    ctx.w.sinkShip('a', 'late');
    ctx.w.sinkShip('b', 'late');
    step(ctx);
    expect(ctx.m.phase).toBe('finished');
    expect(ctx.m.winnerId).toBe('late');
    expect(ctx.m.placements.get('late')).toBe(1);
    const msg = ctx.results[0];
    expect(msg.winnerId).toBe('late');
    const row = msg.rows.find((r) => r.id === 'late');
    expect(row).toBeDefined();
    expect(row!.name).toBe('LATE');
    expect(row!.placement).toBe(1);
  });

  it('mutual destruction: the latest-sunk human wins (RULING)', () => {
    const ctx = setup(['a', 'b']);
    activate(ctx);
    ctx.w.sinkShip('a', 'b');
    ctx.w.sinkShip('b', 'a'); // same tick, sunk after a
    step(ctx);
    expect(ctx.m.phase).toBe('finished');
    expect(ctx.m.winnerId).toBe('b');
    expect(ctx.m.placements.get('b')).toBe(1);
    expect(ctx.m.placements.get('a')).toBe(2);
  });

  it('a mid-match leave counts as sunk-at-leave-time and triggers the win check', () => {
    const ctx = setup(['a', 'b', 'c']);
    activate(ctx);
    ctx.w.ships.get('b')!.damageDealt = 30; // stats must survive the removal
    ctx.m.onPlayerLeave('b');
    expect(ctx.m.phase).toBe('active'); // a + c still afloat
    ctx.m.onPlayerLeave('c');
    expect(ctx.m.phase).toBe('finished');
    expect(ctx.m.winnerId).toBe('a');
    expect(ctx.m.placements.get('a')).toBe(1);
    expect(ctx.m.placements.get('c')).toBe(2); // later departure places higher
    expect(ctx.m.placements.get('b')).toBe(3);
    const rowB = ctx.results[0].rows.find((r) => r.id === 'b')!;
    expect(rowB.name).toBe('B');
    expect(rowB.damageDealt).toBe(30);
  });
});

describe('match — finished phase', () => {
  function finished(): Ctx {
    const ctx = setup(['a', 'b']);
    activate(ctx);
    ctx.w.sinkShip('b', 'a');
    step(ctx);
    expect(ctx.m.phase).toBe('finished');
    return ctx;
  }

  it('freezes the outcome (damage suppressed again) and disconnects after resultsMs', () => {
    const ctx = finished();
    expect(ctx.w.damageEnabled).toBe(false);
    const a = ctx.w.ships.get('a')!;
    injectShell(ctx, 's9', 'ghost', a.state.x - 20, a.state.y);
    step(ctx, Math.ceil(TIMINGS.resultsMs / DT) + 1);
    expect(a.hp).toBe(CONFIG.shipClasses.torpedoBoat.hp); // post-match shells cannot rewrite the result
    expect(ctx.calls.filter((c) => c === 'disconnect')).toHaveLength(1);
    step(ctx, 10);
    expect(ctx.calls.filter((c) => c === 'disconnect')).toHaveLength(1); // fired once
  });

  it('never starts a new match in the same room', () => {
    const ctx = finished();
    ctx.w.addShip('d', 'D');
    ctx.m.notifyRosterChanged();
    step(ctx, 5);
    expect(ctx.m.phase).toBe('finished');
    expect(ctx.calls.filter((c) => c === 'lock')).toHaveLength(1); // only the original countdown
  });
});

describe('world storm damage respects the damage policy flag', () => {
  it('bleeds no hp while damage is suppressed, even outside the zone', () => {
    // Fast zone: shrink well underway within a few ticks.
    const w = new World(1, 6, { grace: 0, shrinkDuration: 100, endRadiusFraction: 0.1 });
    w.map.islands.length = 0;
    const a = w.addShip('a', 'A');
    w.startZone();
    for (let i = 0; i < 10; i++) w.step(); // zone now far smaller than the ring
    expect(Math.hypot(a.state.x, a.state.y)).toBeGreaterThan(w.zoneRadius);
    w.damageEnabled = false;
    const hp = a.hp;
    for (let i = 0; i < 10; i++) w.step();
    expect(a.hp).toBe(hp);
    w.damageEnabled = true;
    w.step();
    expect(a.hp).toBeLessThan(hp);
  });
});
