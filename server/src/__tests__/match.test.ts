// Match lifecycle state machine (game/match.ts): every transition including
// countdown cancel + relock, the active reset (field cleared, hulls redeployed,
// zone anchored), waiting-phase damage suppression (mines drop freely but the
// field is wiped at activation), disabled respawn in active, placement
// ordering (sink order, leave-during-match, mutual destruction), the results
// payload, and the post-results disconnect.

import { describe, it, expect } from 'vitest';
import { isAfloat, CONFIG, type ResultsMsg, type ShipClassId } from '@salvo/shared';
import { World } from '../game/world.js';
import { Match, type MatchHooks } from '../game/match.js';
import { isFleetHull } from '../game/participants.js';

const DT = CONFIG.tick.simDtMs;
// Ticks in one full sinking window. Since the amendment-17 REVERSAL (Eric veto
// 2026-08-12) the match is HELD OPEN while any CAPTAIN is in its window: the
// outcome latches on the sink tick, but 'finished' lands only at the last
// captain founder — so every terminal sink below is followed by a window of
// stepping before the finish assertions.
const SINK_TICKS = CONFIG.ship.sinkingWindowMs / DT;
// joinWindowMs: 0 = the legacy fast path (waiting -> countdown + lock at
// minHumans, no gathering phase) so every pre-gathering suite keeps its exact
// assertions; the gathering window has its own suite below.
const TIMINGS = { countdownMs: 100, resultsMs: 200, joinWindowMs: 0 }; // 2 ticks / 4 ticks

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
      broadcastResults: (m) => {
        calls.push('results');
        results.push(m);
      },
      requeue: () => calls.push('requeue'),
      disconnect: () => calls.push('disconnect'),
    },
  };
}

interface Ctx extends Recorder {
  w: World;
  m: Match;
}

/** Bare world (no islands) + match with fast timings; ships joined in order.
 *  `hull` picks the class for every joined ship — default torpedoBoat, but mine
 *  tests pass 'mineLayer' so slot 2 fits a mine (the TB carries speedBoost there,
 *  Story 1.6). */
function setup(ids: string[], hull: ShipClassId = 'torpedoBoat', timings = TIMINGS): Ctx {
  const w = new World(1);
  w.map.islands.length = 0;
  const rec = recorder();
  const m = new Match(w, timings, rec.hooks);
  for (const id of ids) {
    w.addShip(id, id.toUpperCase(), 'captain', hull);
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
  ctx.w.submitInput(id, { seq, throttle: 0, rudder: 0, aim: 0, fireSeq: seq, aimDist: 600, slot, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0 });
}

/** One fresh ability press (actSeq advance) on `actSlot` (boost/decoy). seq
 *  doubles as the press counter. */
function press(ctx: Ctx, id: string, actSlot: 0 | 1 | 2, seq: number): void {
  ctx.w.submitInput(id, { seq, throttle: 0, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0, actSeq: seq, actSlot, hornSeq: 0 });
}

/** One fresh mine CLICK (Story 2.8, amendment 45: the mine is an aimed weapon
 *  again) — aimed dead astern of the ship's live heading, well inside
 *  placeRange, on the named slot. seq doubles as the click counter. */
function mineClick(ctx: Ctx, id: string, slot: 0 | 1 | 2, seq: number): void {
  const heading = ctx.w.ships.get(id)!.state.heading;
  const aim = heading + Math.PI; // rear-sector center
  ctx.w.submitInput(id, { seq, throttle: 0, rudder: 0, aim, fireSeq: seq, aimDist: CONFIG.mine.placeRange / 2, slot, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0 });
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
  it('starts weapons-safe: damage off, respawn on, XP off', () => {
    const ctx = setup(['a']);
    expect(ctx.m.phase).toBe('waiting');
    expect(ctx.w.damageEnabled).toBe(false);
    expect(ctx.w.respawnEnabled).toBe(true);
    expect(ctx.w.xpEnabled).toBe(false); // amendment 34: the ready room banks nothing
  });

  it('accrues NO passive XP in the ready room, however long it idles (Story 2.6)', () => {
    const ctx = setup(['a']);
    const a = ctx.w.ships.get('a')!;
    step(ctx, CONFIG.xp.levelMs / DT + 10); // well past one level of match time
    expect(a.xpMs).toBe(0);
    expect(a.level).toBe(0);
    expect(a.bankedLevels).toBe(0);
  });

  it('suppresses all shell damage (target practice: boom, no hp loss)', () => {
    const ctx = setup(['a']);
    const a = ctx.w.ships.get('a')!;
    injectShell(ctx, 's1', 'ghost', a.state.x - 20, a.state.y); // point blank on a
    stepUntilBoom(ctx); // impact still visible (boom emitted)...
    expect(a.hp).toBe(CONFIG.shipClasses.torpedoBoat.hp); // ...but no hp is lost
    expect(isAfloat(a.lifecycle)).toBe(true);
    expect(ctx.w.tickEvents.some((e) => e.k === 'dmg')).toBe(false);
  });

  it('allows mine drops (no phase lockout — resetForMatchStart clears the field at activation instead)', () => {
    const ctx = setup(['a'], 'mineLayer'); // mine at slot 1 (Story 1.8: [gun, mine, decoyBuoy])
    mineClick(ctx, 'a', 1, 1); // Story 2.8: mines are an aimed WEAPON — a rear-arc click
    step(ctx);
    expect(ctx.w.mines.size).toBe(1);
    expect(ctx.w.ships.get('a')!.loadout[1].state!.reloadMsLeft).toBeGreaterThan(0); // drop started the reload
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
    expect(isAfloat(a.lifecycle)).toBe(true);
  });

  it('keeps the respawn loop alive', () => {
    const ctx = setup(['a']);
    ctx.w.sinkShip('a');
    const a = ctx.w.ships.get('a')!;
    expect(a.respawnAt).toBeGreaterThan(0);
    // Story 5.2: the revive lands on the founder tick (sinking window 5000ms
    // outlasts the 3000ms respawn delay; processRespawns revives only the SUNK).
    step(ctx, Math.ceil(CONFIG.ship.sinkingWindowMs / DT) + 1);
    expect(isAfloat(a.lifecycle)).toBe(true);
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
    expect(ctx.w.xpEnabled).toBe(false); // ...and still pays no XP
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

    // No 'fill' call to assert any more: amendment 41 deleted the drone-fill
    // hook outright, so activation is field reset + storm anchor and nothing
    // else. Nothing may have been added to the world at activation.
    expect(ctx.calls).not.toContain('fill');
    expect([...ctx.w.ships.keys()].every((id) => !id.startsWith('fleet-') && !id.startsWith('drone-'))).toBe(true);
    expect(ctx.w.shells.size).toBe(0);
    expect(ctx.w.mines.size).toBe(0);
    expect(ctx.w.zonePhase).not.toBe('idle'); // storm timeline anchored
    expect(ctx.m.countdownEndT).toBe(0);
    expect(ctx.w.damageEnabled).toBe(true);
    expect(ctx.w.respawnEnabled).toBe(false);
    expect(ctx.w.xpEnabled).toBe(true); // the passive tick starts with the match
    for (const ship of ctx.w.ships.values()) {
      expect(ship.hp).toBe(CONFIG.shipClasses.torpedoBoat.hp);
      expect(isAfloat(ship.lifecycle)).toBe(true);
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

describe('match — gathering window (joinWindowMs > 0)', () => {
  // 100ms window = 2 ticks; countdown 100ms = 2 more ticks.
  const GATHER_TIMINGS = { countdownMs: 100, resultsMs: 200, joinWindowMs: 100 };
  const gsetup = (ids: string[]) => setup(ids, 'torpedoBoat', GATHER_TIMINGS);

  it('NEGATIVE joinWindowMs takes the legacy path too: immediate countdown + lock', () => {
    // The contract is "<= 0 collapses to legacy", not "=== 0" — pin the < 0 leg.
    const ctx = setup(['a'], 'torpedoBoat', { countdownMs: 100, resultsMs: 200, joinWindowMs: -1 });
    ctx.w.addShip('b', 'B');
    ctx.m.notifyRosterChanged();
    expect(ctx.m.phase).toBe('countdown');
    expect(ctx.m.countdownEndT).toBe(ctx.w.now + 100);
    expect(ctx.calls).toEqual(['lock']);
  });

  it('opens UNLOCKED at minHumans: gathering phase, deadline set, no lock call', () => {
    const ctx = gsetup(['a']);
    expect(ctx.m.phase).toBe('waiting');
    ctx.w.addShip('b', 'B');
    ctx.m.notifyRosterChanged();
    expect(ctx.m.phase).toBe('gathering');
    expect(ctx.m.countdownEndT).toBe(ctx.w.now + GATHER_TIMINGS.joinWindowMs);
    expect(ctx.calls).toEqual([]); // the room was NOT locked
  });

  it('stays weapons-safe with respawn ENABLED (ready-room policy)', () => {
    // Window far longer than the respawn delay so the whole loop runs INSIDE
    // gathering (a short window would activate mid-wait and revive trivially).
    const ctx = setup(['a', 'b'], 'torpedoBoat', { countdownMs: 100, resultsMs: 200, joinWindowMs: 600000 });
    expect(ctx.m.phase).toBe('gathering');
    expect(ctx.w.damageEnabled).toBe(false);
    expect(ctx.w.xpEnabled).toBe(false);
    expect(ctx.w.respawnEnabled).toBe(true); // a ready-room death must respawn
    ctx.w.sinkShip('a');
    // Story 5.2: revive lands on the founder tick (5000ms > respawn delay).
    step(ctx, Math.ceil(CONFIG.ship.sinkingWindowMs / DT) + 1);
    expect(ctx.m.phase).toBe('gathering'); // still inside the window
    expect(isAfloat(ctx.w.ships.get('a')!.lifecycle)).toBe(true);
  });

  it('a join during the window never resets the timer', () => {
    const ctx = gsetup(['a', 'b']);
    const deadline = ctx.m.countdownEndT;
    step(ctx); // let time advance so a reset would be visible
    ctx.w.addShip('c', 'C');
    ctx.m.notifyRosterChanged();
    expect(ctx.m.phase).toBe('gathering');
    expect(ctx.m.countdownEndT).toBe(deadline);
    expect(ctx.calls).toEqual([]); // still unlocked
  });

  it('window expiry arms the countdown and locks EXACTLY once', () => {
    const ctx = gsetup(['a', 'b']);
    step(ctx, 2); // 2 ticks = 100ms: the window expires
    expect(ctx.m.phase).toBe('countdown');
    expect(ctx.m.countdownEndT).toBe(ctx.w.now + GATHER_TIMINGS.countdownMs);
    expect(ctx.calls).toEqual(['lock']);
    step(ctx, 2); // the unchanged countdown then activates as today
    expect(ctx.m.phase).toBe('active');
    expect(ctx.calls.filter((c) => c === 'lock')).toHaveLength(1);
  });

  it('countdownEndT is the CURRENT-PHASE deadline: gathering end, then countdown end, 0 in waiting', () => {
    const ctx = gsetup(['a']);
    expect(ctx.m.countdownEndT).toBe(0); // waiting
    ctx.w.addShip('b', 'B');
    ctx.m.notifyRosterChanged();
    const gatherEnd = ctx.w.now + GATHER_TIMINGS.joinWindowMs;
    expect(ctx.m.countdownEndT).toBe(gatherEnd);
    step(ctx, 2);
    expect(ctx.m.phase).toBe('countdown');
    expect(ctx.m.countdownEndT).not.toBe(gatherEnd); // re-armed for the countdown
    expect(ctx.m.countdownEndT).toBe(ctx.w.now + GATHER_TIMINGS.countdownMs);
  });

  it('cancel from gathering (humans < min) returns to waiting with NO unlock call', () => {
    const ctx = gsetup(['a', 'b']);
    expect(ctx.m.phase).toBe('gathering');
    ctx.m.onPlayerLeave('b');
    expect(ctx.m.phase).toBe('waiting');
    expect(ctx.m.countdownEndT).toBe(0);
    expect(ctx.calls).toEqual([]); // never locked, so never unlocked
    // Reaching the minimum again opens a FRESH window.
    step(ctx, 3);
    ctx.w.addShip('b', 'B');
    ctx.m.notifyRosterChanged();
    expect(ctx.m.phase).toBe('gathering');
    expect(ctx.m.countdownEndT).toBe(ctx.w.now + GATHER_TIMINGS.joinWindowMs);
  });
});

describe('match — active phase', () => {
  it('re-enables mine drops', () => {
    const ctx = setup(['a', 'b'], 'mineLayer'); // mine at slot 1 (Story 1.8: [gun, mine, decoyBuoy])
    activate(ctx);
    mineClick(ctx, 'a', 1, 1); // Story 2.8: mines are an aimed WEAPON — a rear-arc click
    step(ctx);
    expect(ctx.w.mines.size).toBe(1);
    expect(ctx.w.ships.get('a')!.loadout[1].state!.reloadMsLeft).toBeGreaterThan(0); // drop started the reload
  });

  it('leaves sunk ships down: no respawn is ever scheduled', () => {
    const ctx = setup(['a', 'b', 'c']);
    activate(ctx);
    ctx.w.sinkShip('c', 'a');
    const c = ctx.w.ships.get('c')!;
    expect(c.respawnAt).toBe(0);
    step(ctx, Math.ceil(CONFIG.ship.respawnDelay / DT) + 2);
    expect(isAfloat(c.lifecycle)).toBe(false);
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
    expect(ctx.m.phase).toBe('active'); // held open for the sinking windows (amendment 17 reversed)
    step(ctx, SINK_TICKS);
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
    step(ctx, SINK_TICKS + 1); // the losers' windows must run out first (amendment 17 reversed)
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

  it('same-tick mutual destruction is a DRAW (Story 5.2, amendment 14 — supersedes latest-sunk-wins)', () => {
    const ctx = setup(['a', 'b']);
    activate(ctx);
    ctx.w.sinkShip('a', 'b');
    ctx.w.sinkShip('b', 'a'); // same tick — the wipe amendment 14 rules a draw
    step(ctx, SINK_TICKS + 1); // both windows hold the transition (amendment 17 reversed)
    expect(ctx.m.phase).toBe('finished');
    // Every remaining captain went down on one tick: no "later sinker" exists,
    // so winnerId is deliberately '' and the client renders a DRAW.
    expect(ctx.m.winnerId).toBe('');
    // Placements keep the reverse-sink numbering from 1 (no winner row); the
    // within-tick order is event order, superseded by the DRAW banner.
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
    // The outcome latches the instant a is the sole afloat captain, but the
    // scuttled b/c hulls (Story 6.7) are still in their sinking windows, so
    // the transition to 'finished' waits (amendment 17 reversed).
    expect(ctx.m.phase).toBe('active');
    step(ctx, SINK_TICKS + 1); // both scuttled windows must run out first
    expect(ctx.m.phase).toBe('finished');
    expect(ctx.m.winnerId).toBe('a');
    expect(ctx.m.placements.get('a')).toBe(1);
    expect(ctx.m.placements.get('c')).toBe(2); // later departure places higher
    expect(ctx.m.placements.get('b')).toBe(3);
    // The departures never left the ocean empty of humans — 'a' is standing, so
    // the telemetry cause is a cleared field, not an abandonment (amendment 53).
    expect(ctx.m.endSummary().endedBy).toBe('fieldCleared');
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
    // The finish waits for b's whole window (amendment 17 reversed).
    step(ctx, SINK_TICKS + 1);
    expect(ctx.m.phase).toBe('finished');
    return ctx;
  }

  it('freezes the outcome (damage + XP suppressed again) and disconnects after resultsMs', () => {
    const ctx = finished();
    expect(ctx.w.damageEnabled).toBe(false);
    expect(ctx.w.xpEnabled).toBe(false); // the winner stops accruing at the finish
    const a = ctx.w.ships.get('a')!;
    injectShell(ctx, 's9', 'ghost', a.state.x - 20, a.state.y);
    step(ctx, Math.ceil(TIMINGS.resultsMs / DT) + 1);
    expect(a.hp).toBe(CONFIG.shipClasses.torpedoBoat.hp); // post-match shells cannot rewrite the result
    expect(ctx.calls.filter((c) => c === 'disconnect')).toHaveLength(1);
    step(ctx, 10);
    expect(ctx.calls.filter((c) => c === 'disconnect')).toHaveLength(1); // fired once
  });

  // Story 6.3: the requeue signal is the COLLAPSE's, and only the collapse's. A
  // finished match disconnects too — that is the whole ambiguity the channel
  // exists to resolve — and a client that received `rq` here would be flung
  // straight back into a queue instead of reading its own results.
  it('the ordinary post-results disconnect signals no requeue', () => {
    const ctx = finished();
    step(ctx, Math.ceil(TIMINGS.resultsMs / DT) + 1);
    expect(ctx.calls).toContain('disconnect');
    expect(ctx.calls).not.toContain('requeue');
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

// --- results are CAPTAINS ONLY (Eric ruling 2026-08-11) -----------------------
//
// Amendment 4 made a finish-with-hulls-still-afloat reachable for the first
// time (drones no longer gate the win), which exposed a placement gap: a hull
// that never sank was in neither tier of the shipped "winner = 1, everyone else
// by reverse sink order" rule, fell through resultsMsg()'s `?? 0` default, and
// sorted ABOVE the winner (a real match showed 18 of 20 rows at placement 0).
//
// ERIC'S RULING — *"just don't show the drones in the match results. problem
// solved."* — SUPERSEDES amendment 8's survivors tier, which is deleted. The
// results rows are captains only and placement is CAPTAIN-RELATIVE, so the
// shipped two-tier rule is restored intact, just restricted to captains. This
// is what the project docs already claimed ("humans-only placement/results")
// and what the Public Register's "drones are not combatants" position implies.
//
// The survivors tier is UNREACHABLE now, not merely unused: checkWin() finishes
// only when at most ONE captain is afloat and that captain IS the winner, so
// every other captain is sunk (or departed, which records a sink) by then.
describe('match — the results table is captains only', () => {
  /** Captains + `drones` drone hulls in the water, activated. The drones join
   *  AFTER the captains, so activation roster order is captains then drones. */
  function withDrones(captains: string[], drones: number): Ctx {
    const ctx = setup(captains);
    for (let i = 1; i <= drones; i++) ctx.w.addShip(`drone-${i}`, `DRONE-0${i}`, 'fleet');
    activate(ctx);
    return ctx;
  }

  const isDroneRow = (r: { id: string }): boolean => r.id.startsWith('drone-');

  // THE REGRESSION TEST. Against the pre-fix computePlacements() every surviving
  // drone stayed out of the placements Map, resultsMsg() defaulted it to 0, and
  // the ascending sort seated all three of them ahead of the winner: rows would
  // read [drone-1 0, drone-2 0, drone-3 0, a 1, b 2].
  it('no results row is a DRONE, none is left at placement 0, and the winner is the FIRST row', () => {
    const ctx = withDrones(['a', 'b'], 3);
    expect([...ctx.w.ships.values()].filter((s) => isFleetHull(s) && isAfloat(s.lifecycle))).toHaveLength(3);
    ctx.w.sinkShip('b', 'a');
    step(ctx, SINK_TICKS + 1); // b's window runs out first (amendment 17 reversed)
    expect(ctx.m.phase).toBe('finished');
    const msg = ctx.results[0];
    expect(msg.rows.some(isDroneRow)).toBe(false); // drones are not in the results
    expect(msg.rows.every((r) => r.placement >= 1)).toBe(true);
    expect(msg.rows[0].id).toBe('a');
    expect(msg.rows[0].placement).toBe(1);
    // Dense 1..(captain count) — the partition invariant, captain-relative.
    expect(msg.rows.map((r) => [r.id, r.placement])).toEqual([
      ['a', 1],
      ['b', 2],
    ]);
  });

  it('pins the full order: winner, then the sunk CAPTAINS in reverse sink order', () => {
    const ctx = withDrones(['a', 'b', 'c'], 2);
    ctx.w.sinkShip('drone-1', 'a'); // a drone sink must not consume a placement
    step(ctx);
    ctx.w.sinkShip('c', 'a');
    step(ctx);
    expect(ctx.m.phase).toBe('active');
    ctx.w.sinkShip('b', 'a');
    step(ctx, SINK_TICKS + 1); // the windows run out (amendment 17 reversed)
    expect(ctx.m.phase).toBe('finished');
    expect(ctx.m.winnerId).toBe('a');
    // 3 captains -> exactly 3 rows at 1..3, unaffected by the 2 drones (one
    // sunk, one still afloat) that shared the water with them.
    expect(ctx.results[0].rows.map((r) => [r.id, r.placement])).toEqual([
      ['a', 1], // winner
      ['b', 2], // sunk last of the captains
      ['c', 3],
    ]);
    expect(ctx.m.placements.has('drone-1')).toBe(false); // a sunk drone holds none
    expect(ctx.m.placements.has('drone-2')).toBe(false); // nor an afloat one
  });

  it('is deterministic across runs, with drone sinks interleaved through the captains', () => {
    const run = (): [string, number][] => {
      const ctx = withDrones(['a', 'b', 'c'], 4);
      ctx.w.sinkShip('drone-3', 'a'); // drone sinks bracket the captain sinks…
      step(ctx);
      ctx.w.sinkShip('c', 'a');
      step(ctx);
      ctx.w.sinkShip('drone-1', 'a');
      step(ctx);
      ctx.w.sinkShip('b', 'a');
      step(ctx, SINK_TICKS + 1); // the windows run out (amendment 17 reversed)
      expect(ctx.m.phase).toBe('finished');
      return ctx.results[0].rows.map((r) => [r.id, r.placement]);
    };
    // …and change nothing: the captains hold the dense range 1..3.
    const expected: [string, number][] = [
      ['a', 1],
      ['b', 2], // sunk last of the captains
      ['c', 3],
    ];
    expect(run()).toEqual(expected);
    expect(run()).toEqual(expected);
    expect(run()).toEqual(expected);
  });

  it('a same-tick wipe with drones afloat: DRAW (amendment 14), captains still row 1 and 2', () => {
    const ctx = withDrones(['a', 'b'], 2);
    ctx.w.sinkShip('a', 'b');
    ctx.w.sinkShip('b', 'a'); // same tick — a draw since Story 5.2
    step(ctx, SINK_TICKS + 1); // both windows hold the transition (amendment 17 reversed)
    expect(ctx.m.phase).toBe('finished');
    expect(ctx.m.winnerId).toBe(''); // drones can't claim it and neither captain may
    expect([...ctx.w.ships.values()].filter((s) => isFleetHull(s) && isAfloat(s.lifecycle))).toHaveLength(2);
    expect(ctx.results[0].rows.map((r) => [r.id, r.placement])).toEqual([
      ['b', 1],
      ['a', 2],
    ]);
  });

  it('leaves TELEMETRY counting every hull — presentation changed, the operator data did not', () => {
    const ctx = withDrones(['a', 'b'], 3);
    ctx.w.sinkShip('drone-1', 'a');
    step(ctx);
    ctx.w.sinkShip('b', 'a');
    step(ctx, SINK_TICKS + 1); // b's window runs out (amendment 17 reversed)
    expect(ctx.m.phase).toBe('finished');
    expect(ctx.results[0].rows).toHaveLength(2); // captains only on the wire…
    const sum = ctx.m.endSummary();
    expect(sum.rosterSize).toBe(5); // …but every hull in the telemetry
    const byClass = Object.values(sum.rosterByClass).reduce((n, v) => n + v, 0);
    expect(byClass).toBe(5);
    // ONE kill, not two: the telemetry SHAPE did not move (amendment 38 is
    // explicit that rosterSize/rosterByClass/killsByClass stay as they are),
    // but the number it reads changed at its source — `ShipRecord.kills` now
    // counts CAPTAIN victims only, so the drone sinking above pays XP and
    // fires `sunk` while landing in no tally anywhere.
    expect(Object.values(sum.killsByClass).reduce((n, v) => n + v, 0)).toBe(1);
  });
});

// --- THE PARTICIPANTS-ONLY WIN CHECK (Story 6.3, epic-6 amendment 13) --------
//
// The win check has counted captains only since 5-1 (amendment 4); what 6.3
// changes is WHICH QUESTION it asks — `isParticipant` ("does this hull contest
// the outcome") instead of the overloaded `isDrone`. The rows below are the
// story's I/O matrix, and they are behaviour-identical to the shipped game by
// construction (the two predicates are coextensive until 6.4 lands bots). They
// exist so that when a THIRD role arrives, the sites that must follow it —
// win/hold/placements/results — are pinned, and the sites that must NOT
// (minHumans) are pinned too.
describe('match — the win check counts PARTICIPANTS, the countdown counts HUMANS', () => {
  /** Captains + `fleet` PvE hulls in the water, activated. */
  function withFleet(captains: string[], fleet: number): Ctx {
    const ctx = setup(captains);
    for (let i = 1; i <= fleet; i++) ctx.w.addShip(`fleet-${i}`, 'DRONE', 'fleet', 'droneSmall');
    activate(ctx);
    return ctx;
  }

  it('a lone captain with fleet hulls in the water never arms the countdown', () => {
    // minHumans is a PEOPLE count (isHuman). Nine fleet hulls are nine hulls
    // and zero captains, so the room stays in its ready room — the property
    // FR34 turns into a hard rule for bots in 6.4.
    const ctx = setup(['a']);
    for (let i = 1; i <= 9; i++) ctx.w.addShip(`fleet-${i}`, 'DRONE', 'fleet', 'droneSmall');
    ctx.m.notifyRosterChanged();
    step(ctx, 20);
    expect(ctx.m.phase).toBe('waiting');
    expect(ctx.calls).toHaveLength(0); // never locked, never counted down
  });

  it('the LAST captain among live fleet hulls wins, and no fleet hull places or rows', () => {
    const ctx = withFleet(['a', 'b'], 4);
    ctx.w.sinkShip('b', 'a');
    step(ctx, SINK_TICKS + 1);
    expect(ctx.m.phase).toBe('finished');
    expect(ctx.m.winnerId).toBe('a');
    const afloatFleet = [...ctx.w.ships.values()].filter((s) => isFleetHull(s) && isAfloat(s.lifecycle));
    expect(afloatFleet).toHaveLength(4); // the ocean is still full of them
    for (const s of afloatFleet) expect(ctx.m.placements.has(s.id)).toBe(false);
    expect(ctx.results[0].rows.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('a same-tick wipe with NO fleet hull in the water is still a DRAW', () => {
    // The empty-ocean twin of the drones-afloat case above: the draw comes from
    // the SINK STAMPS, never from who else is floating.
    const ctx = withFleet(['a', 'b'], 0);
    ctx.w.sinkShip('a', 'b');
    ctx.w.sinkShip('b', 'a');
    step(ctx, SINK_TICKS + 1);
    expect(ctx.m.phase).toBe('finished');
    expect(ctx.m.winnerId).toBe('');
    expect(ctx.m.endSummary().outcome).toBe('draw');
    expect(ctx.results[0].rows.map((r) => [r.id, r.placement])).toEqual([
      ['b', 1],
      ['a', 2],
    ]);
  });

  it('sinking EVERY fleet hull never finishes a match two captains are still fighting', () => {
    const ctx = withFleet(['a', 'b'], 5);
    for (let i = 1; i <= 5; i++) {
      ctx.w.sinkShip(`fleet-${i}`, 'a');
      step(ctx);
    }
    step(ctx, SINK_TICKS + 2); // well past every fleet window
    expect(ctx.m.phase).toBe('active'); // no latch, no finish, no results
    expect(ctx.results).toHaveLength(0);
    expect(ctx.m.winnerId).toBe('');
  });
});

// --- MATCH + AI CAPTAINS (Story 6.5) ----------------------------------------
//
// The suite above notes that `isParticipant` and `isFleetHull` were
// "coextensive until 6.4 lands bots" — bots landed, and until now NOTHING
// constructed a Match with one in it. That is the gap this block closes, and it
// is the load-bearing coverage for Solo vs AI: the mode ships no new lifecycle
// rule, so the whole termination argument is that the PARTICIPANT rule already
// covers an AI captain. Untested, that argument is a claim.
//
// The `minHumans: 1` timings here are exactly what the solo room derives (see
// rooms/ArenaRoom.finishCreate) — a one-captain cohort. minHumans is still a
// PEOPLE count: the last case pins that nineteen bots arm nothing on their own.
describe('match — AI CAPTAINS are participants (Story 6.5: 1 human + a bot fleet)', () => {
  const SOLO = { ...TIMINGS, minHumans: 1, expectedCaptains: 1 };

  /** A solo-shaped cohort: `bots` AI captains in the water FIRST (the room
   *  builds them at create, before any tick), then the one human. */
  function solo(bots: number, timings = SOLO): Ctx {
    const w = new World(1);
    w.map.islands.length = 0;
    const rec = recorder();
    const m = new Match(w, timings, rec.hooks);
    for (let i = 0; i < bots; i++) w.addBot();
    w.addShip('alice', 'ALICE');
    m.notifyRosterChanged();
    return { w, m, ...rec };
  }

  it('nineteen bots and one captain: the countdown arms and the match RUNS', () => {
    const ctx = solo(19);
    expect(ctx.m.phase).toBe('countdown'); // one human IS the whole cohort
    activate(ctx);
    step(ctx, 20);
    // The thing that must NOT happen: `captains.length > 1` sees twenty
    // participants, so nothing latches and no results fire.
    expect(ctx.m.phase).toBe('active');
    expect(ctx.m.winnerId).toBe('');
    expect(ctx.results).toHaveLength(0);
    expect(ctx.w.ships.size).toBe(20);
  });

  it('a BOT wins — winnerId is the bot’s id and the results table names it', () => {
    const ctx = solo(1);
    activate(ctx);
    const bot = ctx.w.ships.get('bot-1')!;
    ctx.w.sinkShip('alice', 'bot-1');
    step(ctx, SINK_TICKS + 1); // the human's window holds the finish
    expect(ctx.m.phase).toBe('finished');
    expect(ctx.m.winnerId).toBe('bot-1');
    const rows = ctx.results[0].rows;
    expect(rows.map((r) => [r.id, r.placement])).toEqual([
      ['bot-1', 1],
      ['alice', 2],
    ]);
    expect(rows[0].name).toBe(bot.name); // its real callsign, not a drone label
    expect(ctx.m.endSummary().outcome).toBe('winner'); // a real winner, not a draw
  });

  it('a sinking BOT holds the finish for its full window, exactly as a captain does', () => {
    const ctx = solo(1);
    activate(ctx);
    ctx.w.sinkShip('bot-1', 'alice');
    step(ctx, 1);
    expect(ctx.m.phase).toBe('active'); // held: a participant is still going down
    expect(ctx.results).toHaveLength(0);
    step(ctx, SINK_TICKS);
    expect(ctx.m.phase).toBe('finished');
    expect(ctx.m.winnerId).toBe('alice');
    expect(ctx.m.placements.get('bot-1')).toBe(2); // it placed, like any participant
  });

  it('bots are not people: a fleet of them with NO human arms nothing', () => {
    const w = new World(1);
    w.map.islands.length = 0;
    const rec = recorder();
    const m = new Match(w, SOLO, rec.hooks);
    for (let i = 0; i < 19; i++) w.addBot();
    m.notifyRosterChanged();
    for (let i = 0; i < 20; i++) {
      w.step();
      m.update();
    }
    expect(m.phase).toBe('waiting');
    expect(rec.calls).toHaveLength(0); // never locked, never counted down
  });
});

describe('world storm damage respects the damage policy flag', () => {
  it('bleeds no hp while damage is suppressed, even outside the zone', () => {
    // Fast zone: fully closed on a tiny concentric terminal within a few ticks.
    const w = new World(1, 6, { beatMs: 1, ringSteps: [1 / 3, 2 / 3], offsetCap: 0, terminalSightFactor: 1 });
    w.map.islands.length = 0;
    const a = w.addShip('a', 'A');
    w.startZone();
    for (let i = 0; i < 10; i++) w.step(); // zone now far smaller than the ring
    const ring = w.zoneLiveRing;
    expect(Math.hypot(a.state.x - ring.cx, a.state.y - ring.cy)).toBeGreaterThan(ring.r);
    w.damageEnabled = false;
    const hp = a.hp;
    for (let i = 0; i < 10; i++) w.step();
    expect(a.hp).toBe(hp);
    w.damageEnabled = true;
    w.step();
    expect(a.hp).toBeLessThan(hp);
  });
});
