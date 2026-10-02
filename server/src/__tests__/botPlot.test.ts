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
import { situationOf } from '../game/ai/tactics.js';

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
    expect(t.x).toBe(592);
    expect([t.paintX, t.paintY, t.paintAt]).toEqual([500, 0, NOW - 2000]);
    expect([t.vx, t.vy, t.vSrc]).toEqual([45, 0, 'paint']);
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
  const ACROSS = { prevSweepAngle: 2 * Math.PI - 0.05, sweepAngle: 0.05 }; // wraps through bearing 0
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
    expect(sweptAndMissed({ prevSweepAngle: 1, sweepAngle: 1.1 }, SITE, stale, NOW)).toBe(false);
    expect(sweptAndMissed(ACROSS, SITE, { ...stale, seenAt: NOW }, NOW)).toBe(false);
    expect(sweptAndMissed(ACROSS, SITE, { ...stale, live: true }, NOW)).toBe(false);
    expect(sweptAndMissed({ prevSweepAngle: 0, sweepAngle: 0 }, SITE, stale, NOW)).toBe(false);
  });

  it('the window is half-open: start-inclusive, end-exclusive', () => {
    expect(sweptAndMissed({ prevSweepAngle: 0, sweepAngle: 0.1 }, SITE, stale, NOW)).toBe(true);
    expect(sweptAndMissed({ prevSweepAngle: 2 * Math.PI - 0.1, sweepAngle: 0 }, SITE, stale, NOW)).toBe(false);
  });

  const DT = CONFIG.tick.simDtMs;
  const FROZEN = { prevSweepAngle: 3, sweepAngle: 3 }; // later ticks: the beam has moved on

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
