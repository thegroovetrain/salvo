// THE PLOTTING TABLE (cycle 165) — unit pins for ai/plot.ts and its wiring:
// the wake-ribbon course fit, the paint-to-paint velocity, association to a
// plot's PREDICTED position, the sweep-miss drop, and the machine gun's two
// Eric rulings of 2026-10-02 (hold a course-less stale plot; aim one hull
// past the target).
//
// Hand-built tracks, wake cells and events throughout — the fold is a pure
// function of (mind, view, now, beam) and needs no World. The machine-gun
// pins use a REAL ShipRecord (World.addShip, islands cleared) for the shooter
// so the gun's reach and the hull table are the shipped ones, exactly as
// botTactics.test.ts does.

import { describe, expect, it } from 'vitest';
import {
  CONFIG,
  SHIP_CLASS_IDS,
  WAKE_AGE_BUCKETS,
  hullEnvelope,
  mulberry32,
  type GameEvent,
  type HullId,
  type Rng,
} from '@salvo/shared';
import { circleIsland } from './islandFixture.js';
import { World, type ShipRecord } from '../game/world.js';
import type { PerceptionView } from '../game/perception.js';
import type { BotMind, BotWorldPort, RememberedContact, WakeCell } from '../game/ai/types.js';
import {
  ANON_ASSOC_U,
  FASTEST_HULL_SPEED,
  LONGEST_HULL_U,
  SWEEP_MISS_GRACE_MS,
  TRACK_PERSIST_MS,
  WAKE_REACH_U,
  fitWakeVelocity,
  foldWakeCells,
  paintVelocity,
  predictedPos,
  sweptAndMissed,
  trackVelocity,
  type SweepSite,
} from '../game/ai/plot.js';
import { foldView } from '../game/ai/utility.js';
import { aimPoint, type TacticContext } from '../game/ai/tacticKit.js';
import { EQUIPMENT_TACTICS } from '../game/ai/tacticRegistry.js';
import { COMBAT_BRAIN, situationOf } from '../game/ai/tactics.js';

const CELL = CONFIG.vision.radarCellU;
const LIFE = CONFIG.vision.wakeLifeMs;
const NOW = 100000;

function mkMind(seed = 7): BotMind {
  return {
    rng: mulberry32(seed),
    spendRng: mulberry32(seed + 1),
    seq: 0,
    fireSeq: 0,
    actSeq: 0,
    profile: 'duelist',
    phase: 0,
    view: null,
    viewAt: -1,
    contacts: new Map(),
    wakeCells: [],
    lastSweep: -1,
    targetKey: null,
    posture: 'engage',
    stuckMs: 0,
    unbeachUntil: 0,
  };
}

/** An identity-free radar plot, defaulted course-less and never painted. */
function anon(over: Partial<RememberedContact> = {}): RememberedContact {
  return {
    id: null,
    x: 500,
    y: 0,
    heading: null,
    speed: null,
    seenAt: NOW,
    live: false,
    cls: null,
    fleet: false,
    firstSeenAt: NOW - 10000,
    hits: 0,
    vx: null,
    vy: null,
    vAt: -1,
    vSrc: null,
    paintX: 0,
    paintY: 0,
    paintAt: -1,
    missSweptAt: -1,
    ...over,
  };
}

function view(events: GameEvent[]): PerceptionView {
  return { contacts: [], events, mines: [], litZones: [], burnZones: [], decoys: [], smoke: [], chaffGhosts: [] };
}

/** The lattice cell centre the fold will derive for a one-cell rect at (x, y). */
function cellCentre(x: number, y: number): { x: number; y: number } {
  return { x: (Math.floor(x / CELL) + 0.5) * CELL, y: (Math.floor(y / CELL) + 0.5) * CELL };
}

/** A one-cell radar paint at (x, y). */
function blipAt(x: number, y: number, t: number): GameEvent {
  return { k: 'blip', t, gx: Math.floor(x / CELL), gy: Math.floor(y / CELL), w: 1, h: 1, bits: [1] };
}

/** A one-cell wake segment at (x, y) in age bucket `a`. */
function wakeAt(x: number, y: number, a: number, t: number): GameEvent {
  return { k: 'wk', t, a, gx: Math.floor(x / CELL), gy: Math.floor(y / CELL), w: 1, h: 1, bits: [1] };
}

/** A synthetic ribbon behind a hull at (hx, 0) sailing +x at `speed` u/s:
 *  two cells per age bucket, each at the position the hull held when that
 *  water was laid (age = bucket quarter + 30 % / 70 % of the quarter). */
function ribbon(hx: number, speed: number, t: number): WakeCell[] {
  const cells: WakeCell[] = [];
  const quarter = LIFE / WAKE_AGE_BUCKETS;
  for (let b = 0; b < WAKE_AGE_BUCKETS; b += 1) {
    for (const f of [0.3, 0.7]) {
      const ageS = ((b + f) * quarter) / 1000;
      cells.push({ x: hx - speed * ageS, y: 0, bucket: b, t });
    }
  }
  return cells;
}

describe('ai/plot — kinematics', () => {
  it('trackVelocity: the disclosed pose wins, else the estimate, else null', () => {
    expect(trackVelocity(anon())).toBeNull();
    expect(trackVelocity(anon({ vx: 3, vy: -4 }))).toEqual({ vx: 3, vy: -4 });
    const v = trackVelocity(anon({ heading: Math.PI / 2, speed: 10, vx: 3, vy: -4 }))!;
    expect(v.vx).toBeCloseTo(0, 9);
    expect(v.vy).toBeCloseTo(10, 9);
  });

  it('predictedPos dead-reckons the last-known position over the time since the refresh', () => {
    expect(predictedPos(anon({ seenAt: NOW - 2000 }), NOW)).toEqual({ x: 500, y: 0 });
    expect(predictedPos(anon({ seenAt: NOW - 2000, vx: 45, vy: 0 }), NOW)).toEqual({ x: 590, y: 0 });
    expect(predictedPos(anon({ seenAt: NOW, vx: 45, vy: 0 }), NOW)).toEqual({ x: 500, y: 0 });
  });

  it('MEASURED STATIONARY (F4): a displacement under two lattice cells is a ZERO course, 40 u is the real one', () => {
    expect(paintVelocity(anon({ paintX: 500, paintY: 0, paintAt: NOW - 4000 }), 510, 0, NOW)).toEqual({ vx: 0, vy: 0 });
    const v = paintVelocity(anon({ paintX: 500, paintY: 0, paintAt: NOW - 4000 }), 540, 0, NOW)!;
    expect(v.vx).toBeCloseTo(10, 9);
    expect(v.vy).toBeCloseTo(0, 9);
  });

  it('a PAINT course is sticky: a Hit Call refresh does not let someone else\'s passing wake replace it', () => {
    const m = mkMind();
    m.contacts.set('p', anon({ x: 500, y: 0, seenAt: NOW - 2000, paintX: 500, paintY: 0, paintAt: NOW - 2000, vx: 0, vy: 0, vSrc: 'paint', vAt: NOW - 2000 }));
    // A Hit Call bumps seenAt past vAt; a ribbon (another hull's) lies next to it this tick.
    const events: GameEvent[] = ribbon(500, 40, NOW).map((c) => wakeAt(c.x, c.y, c.bucket, NOW));
    events.push({ k: 'hc', id: 'me', x: 501, y: 1 });
    foldView(m, view(events), NOW);
    const t = m.contacts.get('p')!;
    expect(t.seenAt).toBe(NOW);
    expect([t.vx, t.vy, t.vSrc]).toEqual([0, 0, 'paint']);
  });

  it('paintVelocity: displacement over Δt, and null with no earlier paint or a sub-second pair', () => {
    expect(paintVelocity(anon(), 680, 0, NOW)).toBeNull();
    expect(paintVelocity(anon({ paintX: 500, paintY: 0, paintAt: NOW - 500 }), 520, 0, NOW)).toBeNull();
    const v = paintVelocity(anon({ paintX: 500, paintY: 0, paintAt: NOW - 4000 }), 680, 0, NOW)!;
    expect(v.vx).toBeCloseTo(45, 9);
    expect(v.vy).toBeCloseTo(0, 9);
  });
});

describe('ai/plot — the wake-ribbon course fit (first paint)', () => {
  it('fits direction and speed from the age gradient: old water → paint', () => {
    const v = fitWakeVelocity(anon({ x: 500, y: 0, seenAt: NOW }), ribbon(500, 40, NOW), NOW)!;
    expect(v).not.toBeNull();
    expect(v.vx).toBeGreaterThan(0);
    expect(Math.abs(v.vy)).toBeLessThan(1e-9);
    expect(Math.abs(Math.hypot(v.vx, v.vy) - 40) / 40).toBeLessThan(0.2);
  });

  it('accounts for the gap between the ribbon paint and the hull paint', () => {
    // The beam crossed the ribbon 400 ms AFTER it painted the hull: the water
    // was 400 ms older relative to the paint than its bucket says.
    // By then the hull had sailed on 16 u, and the ribbon trails from THERE.
    const cells = ribbon(500 + 40 * 0.4, 40, NOW);
    const v = fitWakeVelocity(anon({ x: 500, y: 0, seenAt: NOW - 400 }), cells, NOW)!;
    expect(Math.abs(v.vx - 40) / 40).toBeLessThan(0.2);
  });

  it('CHORD BIAS (F3): the YOUNGEST bucket with a ≥ 36 u baseline is the reference; a too-short young chord falls back to the oldest', () => {
    const t = anon({ x: 500, y: 0, seenAt: NOW });
    // Bucket 1 says "+x"; bucket 3 (a turn's old water) says "+x, -y".
    const turned: WakeCell[] = [
      { x: 420, y: 0, bucket: 1, t: NOW }, { x: 420, y: 0, bucket: 1, t: NOW },
      { x: 300, y: 100, bucket: 3, t: NOW }, { x: 300, y: 100, bucket: 3, t: NOW },
    ];
    const young = fitWakeVelocity(t, turned, NOW)!;
    expect(young.vy).toBeCloseTo(0, 9);
    expect(young.vx).toBeCloseTo(80 / ((1.5 / WAKE_AGE_BUCKETS) * LIFE / 1000), 6);
    // Bucket 0 is only 20 u back (< 36 u): skipped, and the oldest rule takes bucket 3.
    const short: WakeCell[] = [
      { x: 480, y: 0, bucket: 0, t: NOW }, { x: 480, y: 0, bucket: 0, t: NOW },
      { x: 300, y: 0, bucket: 3, t: NOW }, { x: 300, y: 0, bucket: 3, t: NOW },
    ];
    const old = fitWakeVelocity(t, short, NOW)!;
    expect(old.vx).toBeCloseTo(200 / ((3.5 / WAKE_AGE_BUCKETS) * LIFE / 1000), 6);
  });

  it('too short a ribbon is no course: fewer than three cells, or a baseline under two lattice cells', () => {
    const t = anon({ x: 500, y: 0 });
    expect(fitWakeVelocity(t, ribbon(500, 40, NOW).slice(0, 2), NOW)).toBeNull();
    const stub: WakeCell[] = [0, 1, 2, 3].map((b) => ({ x: 500 - 3 * b, y: 0, bucket: b, t: NOW }));
    expect(fitWakeVelocity(t, stub, NOW)).toBeNull();
  });

  it('an implausible speed (> 1.5 × the fastest hull) is no course', () => {
    // Young water (bucket 0, ~0.7 s old) 250 u behind the paint: 360 u/s.
    const fast: WakeCell[] = [0, 1, 2].map((i) => ({ x: 250 + i, y: 0, bucket: 0, t: NOW }));
    expect(250).toBeLessThan(WAKE_REACH_U);
    expect(fitWakeVelocity(anon({ x: 500, y: 0 }), fast, NOW)).toBeNull();
  });

  it('cells beyond wake reach, or older than one sweep, are not this plot\'s water', () => {
    const far = ribbon(500, 40, NOW).map((c) => ({ ...c, y: WAKE_REACH_U + 50 }));
    expect(fitWakeVelocity(anon({ x: 500, y: 0 }), far, NOW)).toBeNull();
    const stale = ribbon(500, 40, NOW - TRACK_PERSIST_MS - 1);
    expect(fitWakeVelocity(anon({ x: 500, y: 0 }), stale, NOW)).toBeNull();
  });

  it('foldWakeCells buffers each `wk` row as its centroid and prunes past one sweep', () => {
    const m = mkMind();
    m.wakeCells = [{ x: 1, y: 1, bucket: 0, t: NOW - TRACK_PERSIST_MS - 1 }];
    foldWakeCells(m, [wakeAt(300, 0, 2, NOW), blipAt(500, 0, NOW)], NOW);
    expect(m.wakeCells).toEqual([{ ...cellCentre(300, 0), bucket: 2, t: NOW }]);
  });

  it('through foldView: a first paint with a ribbon behind it gets a wake course', () => {
    const m = mkMind();
    const hull = cellCentre(500, 0);
    const events: GameEvent[] = ribbon(hull.x, 40, NOW).map((c) => wakeAt(c.x, c.y, c.bucket, NOW));
    events.push(blipAt(500, 0, NOW));
    foldView(m, view(events), NOW);
    expect(m.contacts.size).toBe(1);
    const t = [...m.contacts.values()][0]!;
    expect(t.vSrc).toBe('wake');
    expect(t.vx!).toBeGreaterThan(30);
    expect(t.vx!).toBeLessThan(50);
  });
});

describe('ai/plot — paint association to the PREDICTED position', () => {
  it('a second paint on the predicted line joins the SAME plot and measures its velocity', () => {
    const m = mkMind();
    const p0 = cellCentre(500, 0);
    m.contacts.set('a:500:0', anon({ ...p0, seenAt: NOW - 4000, paintX: p0.x, paintY: p0.y, paintAt: NOW - 4000, vx: 45, vy: 0, vSrc: 'wake', vAt: NOW - 4000 }));
    const p1 = cellCentre(p0.x + 180, 0);
    foldView(m, view([blipAt(p0.x + 180, 0, NOW)]), NOW);
    expect(m.contacts.size).toBe(1);
    const t = m.contacts.get('a:500:0')!;
    expect(t.x).toBe(p1.x);
    expect(t.vSrc).toBe('paint'); // a paint measurement overrides the wake guess
    expect(t.vx).toBeCloseTo((p1.x - p0.x) / 4, 9);
    expect(t.paintAt).toBe(NOW);
    expect(t.paintX).toBe(p1.x);
  });

  it('the SOLE course-less plot that could have sailed there takes the second paint', () => {
    const m = mkMind();
    const p0 = cellCentre(500, 0);
    m.contacts.set('a:500:0', anon({ ...p0, seenAt: NOW - 4000, paintX: p0.x, paintY: p0.y, paintAt: NOW - 4000 }));
    expect(180).toBeGreaterThan(ANON_ASSOC_U);
    expect(180).toBeLessThan(FASTEST_HULL_SPEED * 4 + ANON_ASSOC_U);
    foldView(m, view([blipAt(p0.x + 180, 0, NOW)]), NOW);
    expect(m.contacts.size).toBe(1);
    const t = m.contacts.get('a:500:0')!;
    expect(t.vSrc).toBe('paint');
    expect(t.vx!).toBeGreaterThan(40);
  });

  it('two course-less candidates are AMBIGUOUS: the paint opens a new plot', () => {
    const m = mkMind();
    m.contacts.set('a:500:0', anon({ x: 500, y: 0, seenAt: NOW - 4000, paintX: 500, paintY: 0, paintAt: NOW - 4000 }));
    m.contacts.set('a:500:200', anon({ x: 500, y: 200, seenAt: NOW - 4000, paintX: 500, paintY: 200, paintAt: NOW - 4000 }));
    foldView(m, view([blipAt(620, 100, NOW)]), NOW);
    expect(m.contacts.size).toBe(3);
    expect(m.contacts.get('a:500:0')!.paintAt).toBe(NOW - 4000);
    expect(m.contacts.get('a:500:200')!.paintAt).toBe(NOW - 4000);
  });

  it('a Hit Call refreshes the plot but never the paint baseline or the course', () => {
    const m = mkMind();
    m.contacts.set('a:500:0', anon({ seenAt: NOW - 2000, paintX: 500, paintY: 0, paintAt: NOW - 2000, vx: 45, vy: 0, vSrc: 'paint', vAt: NOW - 2000 }));
    // The hit lands at the PREDICTED spot (590, 0) — 90 u from the last paint.
    foldView(m, view([{ k: 'hc', id: 'me', x: 592, y: 2 }]), NOW);
    expect(m.contacts.size).toBe(1);
    const t = m.contacts.get('a:500:0')!;
    expect(t.hits).toBe(1);
    expect(t.seenAt).toBe(NOW);
    expect([t.x, t.y]).toEqual([590, 0]); // the dead-reckoned spot, not the impact (F1)
    expect([t.paintX, t.paintY, t.paintAt]).toEqual([500, 0, NOW - 2000]);
    expect([t.vx, t.vy, t.vSrc]).toEqual([45, 0, 'paint']);
  });

  it('NO HIT-CALL WALK (F1): a course plot moves to its prediction, never the impact point; a course-less one takes the impact', () => {
    const m = mkMind();
    m.contacts.set('c', anon({ x: 500, y: 0, seenAt: NOW - 1000, vx: 0, vy: 45, vSrc: 'paint', vAt: NOW - 1000 }));
    m.contacts.set('n', anon({ x: -500, y: 0, seenAt: NOW - 1000 }));
    // Strikes 20 u down each hull from its centre (a 100 u hull takes them anywhere along it).
    foldView(m, view([{ k: 'hc', id: 'me', x: 500, y: 65 }, { k: 'hc', id: 'me', x: -500, y: 20 }]), NOW);
    const c = m.contacts.get('c')!;
    expect([c.x, c.y, c.hits, c.seenAt]).toEqual([500, 45, 1, NOW]);
    const n = m.contacts.get('n')!;
    expect([n.x, n.y, n.hits]).toEqual([-500, 20, 1]);
    // A second hit one tick later re-solves from the prediction again: no drift.
    foldView(m, view([{ k: 'hc', id: 'me', x: 500, y: 70 }]), NOW + 50);
    const c2 = m.contacts.get('c')!;
    expect(c2.x).toBe(500);
    expect(c2.y).toBeCloseTo(45 + 45 * 0.05, 9);
  });

  it('AGE-GROWN ASSOCIATION (F2): a course plot 4 s old takes a paint 90 u off its prediction, not one 200 u off', () => {
    const plotAt = (m: BotMind): void => {
      m.contacts.set('c', anon({ x: 300, y: 0, seenAt: NOW - 4000, paintX: 300, paintY: 0, paintAt: NOW - 4000, vx: 45, vy: 0, vSrc: 'wake', vAt: NOW - 4000 }));
    };
    // Predicted (480, 0); radius = 54 + 15 × 4 = 114 u.
    expect(ANON_ASSOC_U + (FASTEST_HULL_SPEED / 3) * 4).toBeCloseTo(114, 6);
    const near = mkMind();
    plotAt(near);
    foldView(near, view([blipAt(480, 90, NOW)]), NOW);
    expect([...near.contacts.keys()]).toEqual(['c']);
    expect(near.contacts.get('c')!.vSrc).toBe('paint');
    const far = mkMind();
    plotAt(far);
    foldView(far, view([blipAt(480, 200, NOW)]), NOW);
    expect(far.contacts.size).toBe(2);
    expect(far.contacts.get('c')!.paintAt).toBe(NOW - 4000);
    // A FRESH course plot keeps the fixed 54 u: 90 u off is a new plot.
    const fresh = mkMind();
    fresh.contacts.set('c', anon({ x: 480, y: 0, seenAt: NOW - 50, paintX: 480, paintY: 0, paintAt: NOW - 50, vx: 45, vy: 0, vSrc: 'wake', vAt: NOW - 50 }));
    foldView(fresh, view([blipAt(482, 90, NOW)]), NOW);
    expect(fresh.contacts.size).toBe(2);
  });

  it('a Hit Call 55 u from a course plot\'s predicted centre credits it (half a hull either side)', () => {
    expect(LONGEST_HULL_U / 2).toBeGreaterThan(55);
    const m = mkMind();
    m.contacts.set('c', anon({ x: 500, y: 0, seenAt: NOW - 1000, vx: 0, vy: 45, vSrc: 'paint', vAt: NOW - 1000 }));
    foldView(m, view([{ k: 'hc', id: 'me', x: 500, y: 45 + 55 }]), NOW);
    expect(m.contacts.size).toBe(1);
    const t = m.contacts.get('c')!;
    expect(t.hits).toBe(1);
    expect([t.x, t.y]).toEqual([500, 45]); // F1: the prediction, not the bow
  });

  it('STRAY HIT CALL (P4): no age-grown course radius and no rule (b) — it opens its own plot', () => {
    const m = mkMind();
    // A course plot 4 s old predicted at (480, 0): a PAINT 90 u off would join it (F2); a Hit Call must not.
    m.contacts.set('c', anon({ x: 300, y: 0, seenAt: NOW - 4000, paintX: 300, paintY: 0, paintAt: NOW - 4000, vx: 45, vy: 0, vSrc: 'wake', vAt: NOW - 4000 }));
    // A course-less plot 150 u off: rule (b) would take a paint; a Hit Call must not.
    m.contacts.set('n', anon({ x: -150, y: 300, seenAt: NOW - 4000, paintX: -150, paintY: 300, paintAt: NOW - 4000 }));
    foldView(m, view([{ k: 'hc', id: 'me', x: 480, y: 90 }, { k: 'hc', id: 'me', x: 0, y: 300 }]), NOW);
    expect(m.contacts.size).toBe(4);
    expect(m.contacts.get('c')!.hits).toBe(0);
    expect(m.contacts.get('n')!.hits).toBe(0);
    // Within the FIXED 54 u of a prediction it still joins, as before this cycle.
    const j = mkMind();
    j.contacts.set('n', anon({ x: -150, y: 300, seenAt: NOW - 4000 }));
    foldView(j, view([{ k: 'hc', id: 'me', x: -110, y: 300 }]), NOW);
    expect(j.contacts.size).toBe(1);
    expect(j.contacts.get('n')!.hits).toBe(1);
  });

  it('a Hit Call in empty water opens a plot with NO paint baseline', () => {
    const m = mkMind();
    foldView(m, view([{ k: 'hc', id: 'me', x: 300, y: 300 }]), NOW);
    const t = [...m.contacts.values()][0]!;
    expect(t.hits).toBe(1);
    expect(t.paintAt).toBe(-1);
  });

  it('a live sighting carries its disclosed pose as the course', () => {
    const m = mkMind();
    const v: PerceptionView = { ...view([]), contacts: [{ id: 's1', x: 10, y: 20, heading: 0, speed: 30, cls: 'battleship' }] as PerceptionView['contacts'] };
    foldView(m, v, NOW);
    const t = m.contacts.get('s1')!;
    expect([t.vx, t.vy, t.vSrc, t.vAt]).toEqual([30, 0, 'sight', NOW]);
  });
});

describe('ai/plot — the sweep-miss drop (Eric ruling 2026-10-02)', () => {
  const SITE: SweepSite = { x: 0, y: 0, stats: { radarRange: 1000 }, islands: [] };
  const ACROSS = { lastSweep: 2 * Math.PI - 0.05, sweepAngle: 0.05 }; // wraps through bearing 0
  const stale = anon({ x: 500, y: 0, seenAt: NOW - 1000 });

  it('drops a plot whose predicted spot the beam just swept clean (wrap-safe window)', () => {
    expect(sweptAndMissed(ACROSS, SITE, stale, NOW)).toBe(true);
    // Dead-reckoned: the plot itself is off the beam, its prediction is on it.
    const moving = anon({ x: 500, y: -45, seenAt: NOW - 1000, vx: 0, vy: 45 });
    expect(sweptAndMissed(ACROSS, SITE, moving, NOW)).toBe(true);
    expect(sweptAndMissed(ACROSS, SITE, anon({ x: 500, y: 45, seenAt: NOW - 1000, vx: 0, vy: 45 }), NOW)).toBe(false);
  });

  it('keeps it out of radar range, behind an island, off the beam, painted this tick, live, or under a frozen beam', () => {
    expect(sweptAndMissed(ACROSS, { ...SITE, stats: { radarRange: 400 } }, stale, NOW)).toBe(false);
    expect(sweptAndMissed(ACROSS, { ...SITE, islands: [circleIsland(250, 0, 40)] }, stale, NOW)).toBe(false);
    expect(sweptAndMissed({ lastSweep: 1, sweepAngle: 1.1 }, SITE, stale, NOW)).toBe(false);
    expect(sweptAndMissed(ACROSS, SITE, { ...stale, seenAt: NOW }, NOW)).toBe(false);
    expect(sweptAndMissed(ACROSS, SITE, { ...stale, live: true }, NOW)).toBe(false);
    expect(sweptAndMissed({ lastSweep: 0, sweepAngle: 0 }, SITE, stale, NOW)).toBe(false);
  });

  it('the window is half-open: start-inclusive, end-exclusive', () => {
    expect(sweptAndMissed({ lastSweep: 0, sweepAngle: 0.1 }, SITE, stale, NOW)).toBe(true);
    expect(sweptAndMissed({ lastSweep: 2 * Math.PI - 0.1, sweepAngle: 0 }, SITE, stale, NOW)).toBe(false);
  });

  it('PARITY BY CONSTRUCTION (P1): no remembered angle sweeps nothing; the brain remembers its own last angle', () => {
    expect(sweptAndMissed({ lastSweep: -1, sweepAngle: 0.05 }, SITE, stale, NOW)).toBe(false);
    const { rec, port } = mgShooter();
    const m = mkMind();
    rec.sweepAngle = 1.23;
    m.view = view([]);
    m.viewAt = NOW;
    COMBAT_BRAIN.decide(rec, m, port);
    expect(m.lastSweep).toBe(1.23);
    // A view not captured this tick is not folded, and the angle is not taken.
    rec.sweepAngle = 2.5;
    m.viewAt = NOW - 50;
    COMBAT_BRAIN.decideHeld(rec, m, port);
    expect(m.lastSweep).toBe(1.23);
    m.viewAt = NOW;
    COMBAT_BRAIN.decideHeld(rec, m, port);
    expect(m.lastSweep).toBe(2.5);
  });

  it('ONE PAINT PER PLOT PER TICK (P2): two paints in one cell refresh two nearby plots once each, neither swept', () => {
    const m = mkMind();
    const c = cellCentre(500, 0);
    m.contacts.set('A', anon({ ...c, seenAt: NOW - 4000, paintX: c.x, paintY: c.y, paintAt: NOW - 4000 }));
    m.contacts.set('B', anon({ x: c.x + 18, y: c.y, seenAt: NOW - 4000, paintX: c.x + 18, paintY: c.y, paintAt: NOW - 4000 }));
    foldView(m, view([blipAt(500, 0, NOW), blipAt(500, 0, NOW)]), NOW, { beam: ACROSS, site: SITE });
    expect(m.contacts.size).toBe(2);
    for (const k of ['A', 'B']) {
      const t = m.contacts.get(k)!;
      expect(t.seenAt).toBe(NOW);
      expect(t.paintAt).toBe(NOW);
      expect(t.missSweptAt).toBe(-1);
    }
  });

  const DT = CONFIG.tick.simDtMs;
  const FROZEN = { lastSweep: 3, sweepAngle: 3 }; // later ticks: the beam has moved on

  it('through foldView: a swept plot is MARKED, not dropped, on the tick of the miss', () => {
    const m = mkMind();
    m.contacts.set('miss', anon({ x: 500, y: 0, seenAt: NOW - 1000 }));
    m.contacts.set('kept', anon({ x: 0, y: 500, seenAt: NOW - 1000 }));
    foldView(m, view([]), NOW, { beam: ACROSS, site: SITE });
    expect([...m.contacts.keys()]).toEqual(['miss', 'kept']);
    expect(m.contacts.get('miss')!.missSweptAt).toBe(NOW);
    expect(m.contacts.get('kept')!.missSweptAt).toBe(-1);
  });

  it('the GRACE: still unrefreshed two ticks after the mark, the plot is dropped (not one tick after)', () => {
    expect(SWEEP_MISS_GRACE_MS).toBe(2 * DT);
    const m = mkMind();
    m.contacts.set('miss', anon({ x: 500, y: 0, seenAt: NOW - 1000 }));
    foldView(m, view([]), NOW, { beam: ACROSS, site: SITE });
    foldView(m, view([]), NOW + DT, { beam: FROZEN, site: SITE });
    expect(m.contacts.has('miss')).toBe(true);
    foldView(m, view([]), NOW + 2 * DT, { beam: FROZEN, site: SITE });
    expect(m.contacts.has('miss')).toBe(false);
  });

  it('a paint landing INSIDE the grace (on the hull\'s real, trailing bearing) saves the plot and clears the mark', () => {
    const m = mkMind();
    const p = cellCentre(500, 0);
    m.contacts.set('a', anon({ ...p, seenAt: NOW - 1000, paintX: p.x, paintY: p.y, paintAt: NOW - 1000 }));
    foldView(m, view([]), NOW, { beam: ACROSS, site: SITE });
    expect(m.contacts.get('a')!.missSweptAt).toBe(NOW);
    foldView(m, view([blipAt(p.x + 5, p.y, NOW + DT)]), NOW + DT, { beam: FROZEN, site: SITE });
    expect(m.contacts.get('a')!.missSweptAt).toBe(-1);
    foldView(m, view([]), NOW + 3 * DT, { beam: FROZEN, site: SITE });
    expect(m.contacts.size).toBe(1);
    expect(m.contacts.get('a')!.seenAt).toBe(NOW + DT);
  });

  it('any refresh clears the mark: a Hit Call, a sighting', () => {
    const m = mkMind();
    m.contacts.set('a', anon({ x: 500, y: 0, seenAt: NOW - 1000 }));
    m.contacts.set('s1', anon({ id: 's1', x: 700, y: 0, seenAt: NOW - 1000 }));
    foldView(m, view([]), NOW, { beam: ACROSS, site: SITE });
    expect(m.contacts.get('a')!.missSweptAt).toBe(NOW);
    expect(m.contacts.get('s1')!.missSweptAt).toBe(NOW);
    const sighted: PerceptionView = {
      ...view([{ k: 'hc', id: 'me', x: 501, y: 0 }]),
      contacts: [{ id: 's1', x: 700, y: 0, heading: 0, speed: 0, cls: 'battleship' }] as PerceptionView['contacts'],
    };
    foldView(m, sighted, NOW + DT, { beam: FROZEN, site: SITE });
    expect(m.contacts.get('s1')!.missSweptAt).toBe(-1);
    expect(m.contacts.get('a')!.missSweptAt).toBe(-1);
    foldView(m, view([]), NOW + 3 * DT, { beam: FROZEN, site: SITE });
    expect([...m.contacts.keys()]).toEqual(['a', 's1']);
  });

  it('a plot painted THIS tick is never marked', () => {
    const m2 = mkMind();
    const p = cellCentre(500, 0);
    m2.contacts.set('a', anon({ ...p, seenAt: NOW - 1000, paintX: p.x, paintY: p.y, paintAt: NOW - 1000 }));
    foldView(m2, view([blipAt(500, 0, NOW)]), NOW, { beam: ACROSS, site: SITE });
    expect(m2.contacts.size).toBe(1);
    expect(m2.contacts.get('a')!.seenAt).toBe(NOW);
    expect(m2.contacts.get('a')!.missSweptAt).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// THE MACHINE GUN — real shooter record, hand-built target plots.
// ---------------------------------------------------------------------------

function fakePort(w: World): BotWorldPort {
  return {
    now: NOW,
    map: w.map,
    zoneLiveRing: { cx: 0, cy: 0, r: w.map.radius * 4 },
    zoneEndgameReached: false,
    helmEnabled: true,
    submitInput: () => true,
    spendPoint: () => true,
  };
}

function mgShooter(): { w: World; rec: ShipRecord; port: BotWorldPort } {
  const w = new World(1650, 8);
  w.map.islands.length = 0;
  const rec = w.addShip('b-1', 'TESTER', 'bot', 'torpedoBoat', undefined, { x: 0, y: 0 });
  rec.state.x = 0;
  rec.state.y = 0;
  rec.state.heading = 0;
  rec.loadout[0] = { equipmentId: 'machineGun', state: { n: rec.stats.equipment.machineGun.maxAmmo, reloadMsLeft: 0 } };
  return { w, rec, port: fakePort(w) };
}

function mgCtx(rec: ShipRecord, port: BotWorldPort, mind: BotMind, target: RememberedContact): TacticContext {
  return { self: rec, mind, sit: situationOf(rec, mind, port), port, target, posture: 'engage', slot: 0 };
}

describe('ai/equipment — the machine gun (Eric rulings 2026-10-02)', () => {
  it('HOLDS its magazine on a course-less plot older than one sweep; streams at 3999 ms; streams at 8000 ms with a course', () => {
    const { rec, port } = mgShooter();
    const solve = (t: RememberedContact) => EQUIPMENT_TACTICS.machineGun.solve(mgCtx(rec, port, mkMind(), t));
    expect(solve(anon({ x: 300, y: 0, seenAt: NOW - TRACK_PERSIST_MS - 1 }))).toBeNull();
    expect(solve(anon({ x: 300, y: 0, seenAt: NOW - TRACK_PERSIST_MS + 1 }))?.held).toBe(true);
    expect(solve(anon({ x: 300, y: 0, seenAt: NOW - 8000, vx: 0, vy: 5, vSrc: 'paint', vAt: NOW - 8000 }))?.held).toBe(true);
    // A plot MEASURED STATIONARY has a course (zero): it streams, however old (F4).
    expect(solve(anon({ x: 300, y: 0, seenAt: NOW - 6000, vx: 0, vy: 0, vSrc: 'paint', vAt: NOW - 6000 }))?.held).toBe(true);
    // A live sighting is never held, however the clock reads.
    expect(solve(anon({ x: 300, y: 0, live: true, seenAt: NOW - 8000 }))?.held).toBe(true);
  });

  it('the cannon keeps NO staleness rule on the same stale course-less plot', () => {
    const { rec, port } = mgShooter();
    rec.loadout[0] = { equipmentId: 'gun', state: { n: 1, reloadMsLeft: 0 } };
    const shot = EQUIPMENT_TACTICS.gun.solve(mgCtx(rec, port, mkMind(), anon({ x: 300, y: 0, seenAt: NOW - 6000 })));
    expect(shot).not.toBeNull();
  });

  it('AIMS PAST: aimDist = lead-point distance + the target\'s hull length (longest hull when unknown), clamped at reach', () => {
    const { rec, port } = mgShooter();
    const rangeU = rec.stats.equipment.machineGun.rangeU;
    const longest = Math.max(...SHIP_CLASS_IDS.map((id) => hullEnvelope(id).hull.length));
    const cases: [HullId | null, number][] = [
      ['battleship', hullEnvelope('battleship').hull.length],
      [null, longest],
    ];
    for (const [cls, over] of cases) {
      const t = anon({ x: 200, y: 50, cls, seenAt: NOW });
      const mind = mkMind(11);
      const twin = mkMind(11); // the same scatter stream, to rebuild the point
      const shot = EQUIPMENT_TACTICS.machineGun.solve(mgCtx(rec, port, mind, t))!;
      const p = aimPoint(twin, situationOf(rec, twin, port), t, CONFIG.machineGun.shellSpeed);
      expect(shot.aimDist).toBeCloseTo(Math.min(Math.hypot(p.x, p.y) + over, rangeU), 9);
    }
    const edge = EQUIPMENT_TACTICS.machineGun.solve(mgCtx(rec, port, mkMind(), anon({ x: rangeU - 20, y: 0, seenAt: NOW })))!;
    expect(edge.aimDist).toBe(rangeU);
  });

  it('the range gate measures the PREDICTED position', () => {
    const { rec, port } = mgShooter();
    const rangeU = rec.stats.equipment.machineGun.rangeU;
    // Last paint inside reach, sailing out of it: 2 s at 45 u/s carries it past.
    const leaving = anon({ x: rangeU - 30, y: 0, seenAt: NOW - 2000, vx: 45, vy: 0, vSrc: 'paint', vAt: NOW - 2000 });
    expect(EQUIPMENT_TACTICS.machineGun.solve(mgCtx(rec, port, mkMind(), leaving))).toBeNull();
  });

  it('HOLDS when the INTERCEPT is beyond reach (P3): outbound at 650 u holds, inbound at 650 u streams', () => {
    const { rec, port } = mgShooter();
    const rangeU = rec.stats.equipment.machineGun.rangeU;
    expect(rangeU).toBe(660);
    const out = anon({ x: 650, y: 0, seenAt: NOW, vx: 45, vy: 0, vSrc: 'paint', vAt: NOW });
    expect(EQUIPMENT_TACTICS.machineGun.solve(mgCtx(rec, port, mkMind(), out))).toBeNull();
    const inbound = anon({ x: 650, y: 0, seenAt: NOW, vx: -45, vy: 0, vSrc: 'paint', vAt: NOW });
    const shot = EQUIPMENT_TACTICS.machineGun.solve(mgCtx(rec, port, mkMind(), inbound))!;
    expect(shot.held).toBe(true);
    expect(shot.aimDist).toBe(rangeU); // the overshoot alone clamps at reach
  });
});

describe('ai/tacticKit — the lead solve on an estimated course', () => {
  it('a course-having anonymous plot is led AHEAD of its last paint; a course-less one is aimed at', () => {
    const { rec, port } = mgShooter();
    const still: Rng = { next: () => 0, float: (min) => min, int: (min) => min, pick: (arr) => arr[0]! };
    const mind = { ...mkMind(), rng: still };
    const sit = situationOf(rec, mind, port);
    const moving = anon({ x: 0, y: 400, seenAt: NOW - 2000, paintX: 0, paintY: 400, paintAt: NOW - 2000, vx: 40, vy: 0, vSrc: 'paint', vAt: NOW - 2000 });
    const led = aimPoint(mind, sit, moving, CONFIG.machineGun.shellSpeed);
    // Dead-reckoned 80 u, then led further by the shell's time of flight.
    expect(led.x).toBeGreaterThan(80);
    expect(led.y).toBeCloseTo(400, 9);
    const fixed = aimPoint(mind, sit, anon({ x: 0, y: 400, seenAt: NOW - 2000 }), CONFIG.machineGun.shellSpeed);
    expect(fixed).toEqual({ x: 0, y: 400 });
  });
});
