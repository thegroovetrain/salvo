// THE ORDNANCE TARGET COLLECTOR (Story 8.4, AR44 / D25 / placement rule 13).
//
// One `hitTargets(mask)` is how EVERY ordnance step finds anything. Before this
// story each step had its own route to its victims — `aliveHulls()` plus a
// `withBuoyTargets()` merge for shells, a separate iteration over `this.mines`
// for bursts, another for chains — which is why "shoot any mine", the decoy and
// uncapped mines would each have needed three copies of one rule.
//
// What this file pins:
//   * the memo (per tick, per mask, mask order irrelevant) and its two
//     invalidations — a SINK and a CONSUMED MINE;
//   * the four kinds, including `ordnance` pinned EMPTY until flak (8.14);
//   * amendments 16/18/20 (a BURST at the clicked point sets off any armed
//     mine whoever laid it, chains cross owners, captives and arming mines are
//     immune, and a shell IN FLIGHT never touches a mine at all) end to end
//     through a real World;
//   * amendment 19 (a burst over a hull sunk this tick marks `hc`, not `sp`)
//     and the star shell's surviving exclusion;
//   * `deferred-work.md:594` — a later shell of one click passes THROUGH a
//     wreck instead of being consumed by it;
//   * the 500-live-mine performance pin (NFR23).

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  type BoomEvent,
  type GameEvent,
  type HitCallEvent,
  type SplashEvent,
  type Target,
  type TargetKind,
  type MineKind,
} from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { buildFrame } from '../game/frames.js';
import { flatRaster } from './islandFixture.js';

const SLOT_GUN = 0;

function bareWorld(seed = 3): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  w.map.heightRaster = flatRaster();
  return w;
}

function place(
  w: World,
  id: string,
  x: number,
  y: number,
  heading = 0,
  hull: 'torpedoBoat' | 'battleship' | 'mineLayer' = 'torpedoBoat',
): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), 'captain', hull, undefined, undefined);
  rec.state = { x, y, heading, speed: 0 };
  return rec;
}

/** A mine straight into world state. Armed at time 0, NAVAL kind, unless told
 *  otherwise — the kind is a per-mine fact since Story 8.13 (amendment 76), so
 *  a captive mine is laid by asking for one, never by flipping a doctrine on
 *  the owner's stat row. */
function mine(
  w: World,
  id: string,
  ownerId: string,
  x: number,
  y: number,
  armedAt = 0,
  kind: MineKind = 'naval',
): void {
  w.mines.set(id, { id, ownerId, x, y, armedAt, kind });
}

const ids = (ts: readonly Target[]): string[] => ts.map((t) => t.id);
const kinds = (ts: readonly Target[]): TargetKind[] => ts.map((t) => t.kind);

/** Click `a`'s gun at (dist, 0) and step until something resolves. */
function shootAt(w: World, shooter: string, dist: number, seq = 9): void {
  w.submitInput(shooter, {
    seq, throttle: 0, rudder: 0, aim: 0, fireSeq: seq, aimDist: dist,
    slot: SLOT_GUN, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0,
  });
  for (let i = 0; i < 60; i += 1) {
    w.step();
    if (w.tickEvents.some((e) => e.k === 'burst' || e.k === 'boom')) return;
  }
  throw new Error('nothing resolved within the tick budget');
}

// ---------------------------------------------------------------------------
// THE MEMO
// ---------------------------------------------------------------------------

describe('hitTargets — the per-tick memo', () => {
  it('returns the SAME array for the same mask within one tick', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    const first = w.hitTargets(['hull']);
    expect(w.hitTargets(['hull'])).toBe(first); // identity, not just equality
  });

  it('is keyed by the SORTED mask, so ["mine","hull"] shares ["hull","mine"]', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    expect(w.hitTargets(['mine', 'hull'])).toBe(w.hitTargets(['hull', 'mine']));
  });

  it('a different mask is a different list', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    mine(w, 'm1', 'b', 100, 0);
    expect(ids(w.hitTargets(['hull']))).toEqual(['a']);
    expect(ids(w.hitTargets(['hull', 'mine']))).toEqual(['a', 'm1']);
  });

  it('is rebuilt from scratch next tick (a moved hull is never stale)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const before = w.hitTargets(['hull'])[0].poly.map((v) => ({ ...v }));
    a.state = { x: 500, y: 0, heading: 0, speed: 0 };
    w.step();
    const after = w.hitTargets(['hull'])[0].poly;
    expect(after[0].x).not.toBeCloseTo(before[0].x, 3);
  });
});

describe('hitTargets — the invalidations', () => {
  it('A SINK retires every memoized list: the wreck is gone from the next build', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'b', 200, 0);
    expect(ids(w.hitTargets(['hull']))).toEqual(['a', 'b']);
    w.sinkShip('b', 'a');
    expect(ids(w.hitTargets(['hull']))).toEqual(['a']);
  });

  it('A CONSUMED MINE retires them too, so no shell can be stopped by a ghost', () => {
    const w = bareWorld();
    mine(w, 'm1', 'b', 100, 0);
    mine(w, 'm2', 'b', 200, 0);
    expect(ids(w.hitTargets(['mine']))).toEqual(['m1', 'm2']);
    // `consumeMine` is the ONE deletion path (detonation, captive launch); it
    // is what bumps the generation, so the next list is rebuilt without it.
    const inner = w as unknown as { consumeMine(id: string): boolean };
    expect(inner.consumeMine('m1')).toBe(true);
    expect(ids(w.hitTargets(['mine']))).toEqual(['m2']);
    expect(inner.consumeMine('m1')).toBe(false); // the consume-first re-check
  });
});

// ---------------------------------------------------------------------------
// THE KINDS
// ---------------------------------------------------------------------------

describe('hitTargets — the four kinds', () => {
  it('`hull` is afloat silhouettes only — a sinking hull is not a collision subject', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    const b = place(w, 'b', 200, 0);
    w.sinkShip(b.id, 'a');
    expect(ids(w.hitTargets(['hull']))).toEqual(['a']);
  });

  it('`mine` is a POINT target at the mine centre (one vertex, no new radius number)', () => {
    const w = bareWorld();
    mine(w, 'm1', 'b', 120, -30);
    const [t] = w.hitTargets(['mine']);
    expect(t.kind).toBe('mine');
    expect(t.poly).toEqual([{ x: 120, y: -30 }]);
  });

  it('`mine` OMITS a still-arming mine and a CAPTIVE mine — a burst must not set them off', () => {
    const w = bareWorld();
    place(w, 'cap', 800, 800, 0, 'mineLayer');
    mine(w, 'armed', 'b', 100, 0);
    mine(w, 'arming', 'b', 150, 0, 999_999);
    // THE EXCLUSION IS BY KIND (Story 8.13): a captive mine is captive because
    // it was LAID by the captive rack, not because its layer currently holds a
    // doctrine — so the carve-out survives a refit and a vacated owner.
    mine(w, 'captive', 'cap', 200, 0, 0, 'captive');
    // A FOULING mine is an ordinary burst target: only the captive is immune.
    mine(w, 'fouling', 'b', 250, 0, 0, 'fouling');
    expect(ids(w.hitTargets(['mine']))).toEqual(['armed', 'fouling']);
  });

  it('`decoy` is the radar buoy, the interim occupant of that kind', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    w.buoys.set('b1', {
      id: 'b1', ownerId: a.id, x: 300, y: 0,
      poly: [{ x: 294, y: -6 }, { x: 306, y: -6 }, { x: 306, y: 6 }, { x: 294, y: 6 }],
      hp: 50, until: w.now + 20000, radarRange: 330, sweepAngle: 0, prevSweepAngle: 0,
      jamSeed: 1, jamEpoch: 0, gunReloadMsLeft: 0,
    } as never);
    expect(kinds(w.hitTargets(['decoy']))).toEqual(['decoy']);
  });

  it('`ordnance` is EMPTY and pinned empty until flak (Story 8.14) — and still memoized', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    mine(w, 'm1', 'b', 100, 0);
    expect(w.hitTargets(['ordnance'])).toEqual([]);
    expect(w.hitTargets(['ordnance'])).toBe(w.hitTargets(['ordnance']));
  });

  it('the build ORDER is hulls, then mines, then decoys (parity with the old hulls+buoys list)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    mine(w, 'm1', 'b', 100, 0);
    w.buoys.set('b1', {
      id: 'b1', ownerId: a.id, x: 300, y: 0,
      poly: [{ x: 294, y: -6 }, { x: 306, y: -6 }, { x: 306, y: 6 }, { x: 294, y: 6 }],
      hp: 50, until: w.now + 20000, radarRange: 330, sweepAngle: 0, prevSweepAngle: 0,
      jamSeed: 1, jamEpoch: 0, gunReloadMsLeft: 0,
    } as never);
    expect(kinds(w.hitTargets(['hull', 'mine', 'decoy']))).toEqual(['hull', 'mine', 'decoy']);
  });
});

// ---------------------------------------------------------------------------
// AMENDMENTS 16-18 — shooting mines, end to end
// ---------------------------------------------------------------------------

describe('gunfire and mines (amendments 16/18/20)', () => {
  /** The shooter alone at the origin, gun pointing +x. */
  function board(seed = 21): World {
    const w = bareWorld(seed);
    place(w, 'a', 0, 0, 0, 'mineLayer');
    return w;
  }

  /** Fire the gun at (dist, 0) over a board carrying `mines`, and record the
   *  SHOOTER'S OWN FRAME EVENTS for every tick of the shot's life. Events, not
   *  contacts: a mine inside the detect ring legitimately paints as a contact,
   *  and amendment 20 is about what the SHOT tells you, not about what you can
   *  already see. */
  function fireAndRecord(
    dist: number,
    mines: readonly (readonly [string, string, number, number])[],
    seed = 21,
  ): { frames: GameEvent[][]; w: World } {
    const w = board(seed);
    for (const [id, owner, x, y] of mines) mine(w, id, owner, x, y);
    w.submitInput('a', {
      seq: 9, throttle: 0, rudder: 0, aim: 0, fireSeq: 9, aimDist: dist,
      slot: SLOT_GUN, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0,
    });
    const frames: GameEvent[][] = [];
    for (let i = 0; i < 40; i += 1) {
      w.step();
      frames.push(buildFrame(w, 'a').events as GameEvent[]);
    }
    return { frames, w };
  }

  const flat = (frames: GameEvent[][]): GameEvent[] => frames.flat();

  // -------------------------------------------------------------------------
  // AMENDMENT 20 — a shell in flight never touches a mine (Eric 2026-09-16)
  // -------------------------------------------------------------------------

  it('(a) an armed ENEMY mine squarely on the path, OUTSIDE sight: the shell flies on and bursts at the clicked point', () => {
    // 400u is past both the 3/8 detect rung and the true-sight bubble, so the
    // shooter has no sanctioned knowledge of this mine at all.
    expect(CONFIG.vision.detect).toBeLessThan(400);
    expect(CONFIG.vision.sight).toBeLessThan(400);
    const shot = fireAndRecord(600, [['m1', 'x', 400, 0]]);
    expect(shot.w.mines.has('m1')).toBe(true); // never detonated
    const burst = flat(shot.frames).find((e) => e.k === 'burst');
    expect(burst).toMatchObject({ k: 'burst', x: 600, y: 0 }); // reached the aim point
  });

  it('(a) and the shooter\'s event stream is BYTE-IDENTICAL to the same shot over empty water', () => {
    // THE RULING, as an equality: "under no circumstances whatsoever should it
    // block a shot, register a hit or miss, or give any indication whatsoever
    // to the shooter that anything might be there." Anything the mine changed
    // — an earlier boom, a missing burst, an `hc`, a moved `sp` — shows up
    // here as a diff.
    const withMine = fireAndRecord(600, [['m1', 'x', 400, 0]]);
    const cleanWater = fireAndRecord(600, []);
    expect(withMine.frames).toEqual(cleanWater.frames);
  });

  it('(b) the same holds with the mine INSIDE the shooter\'s sight — seeing it changes nothing about the shot', () => {
    expect(CONFIG.vision.detect).toBeGreaterThan(200);
    const withMine = fireAndRecord(600, [['m1', 'x', 200, 0]]);
    const cleanWater = fireAndRecord(600, []);
    expect(withMine.w.mines.has('m1')).toBe(true);
    expect(withMine.frames).toEqual(cleanWater.frames);
  });

  it('(b) the shooter\'s OWN armed mine on the path is equally untouched', () => {
    const withMine = fireAndRecord(600, [['m1', 'a', 300, 0]]);
    const cleanWater = fireAndRecord(600, []);
    expect(withMine.w.mines.has('m1')).toBe(true);
    expect(withMine.frames).toEqual(cleanWater.frames);
  });

  it('(b) a mine inside the would-be BLAST but short of the aim point never bursts the shell early', () => {
    // The interception proximity exception (a target inside the would-be blast
    // bursts the shell for full damage) must have no mine case either.
    const near = 600 - CONFIG.gun.burstRadius + 1;
    const withMine = fireAndRecord(600, [['m1', 'x', near, 0]]);
    const cleanWater = fireAndRecord(600, []);
    expect(withMine.w.mines.has('m1')).toBe(false); // the BURST at 600 covers it
    // The mine dies to the burst at the clicked point — not to contact — so the
    // shooter's own marks are the clean-water ones up to the mine's own boom.
    const marks = flat(withMine.frames).filter((e) => e.k === 'hc' || e.k === 'sp');
    const cleanMarks = flat(cleanWater.frames).filter((e) => e.k === 'hc' || e.k === 'sp');
    expect(marks).toEqual(cleanMarks);
  });

  // -------------------------------------------------------------------------
  // AMENDMENTS 16/18 — the BURST at the clicked point is the one trigger
  // -------------------------------------------------------------------------

  it('(c) a burst whose radius covers a mine CENTRE detonates it — any owner, the mine\'s own blast at the mine', () => {
    const w = board(22);
    mine(w, 'm1', 'x', 600, 0); // an ENEMY mine, AT the clicked point
    shootAt(w, 'a', 600);
    expect(w.mines.has('m1')).toBe(false);
    const boom = w.tickEvents.find((e): e is BoomEvent => e.k === 'boom' && e.id === 'm1');
    expect(boom).toEqual({ k: 'boom', id: 'm1', x: 600, y: 0 }); // at the MINE
  });

  it('(c) the shooter\'s OWN mine is set off by the shooter\'s own burst (the one pinned owner-immunity exception)', () => {
    const w = board(23);
    mine(w, 'm1', 'a', 600, 0);
    shootAt(w, 'a', 600);
    expect(w.mines.has('m1')).toBe(false);
  });

  it('(c) the detonation CHAINS ACROSS OWNERS in the same tick (amendment 18), skipping captives and arming mines', () => {
    const w = board(24);
    place(w, 'cap', 900, 900, 0, 'mineLayer');
    mine(w, 'shot', 'x', 600, 0); // the one the BURST covers
    mine(w, 'mine-mine', 'a', 600, 40); // within the 48u blast — a DIFFERENT owner
    mine(w, 'third', 'y', 600, 80); // chained off the second, a THIRD owner
    mine(w, 'cold', 'x', 600, 120, 999_999); // still arming — immune
    mine(w, 'captive', 'cap', 600, 45, 0, 'captive'); // captive — immune, propagates nothing
    shootAt(w, 'a', 600);
    expect(w.mines.has('shot')).toBe(false);
    expect(w.mines.has('mine-mine')).toBe(false);
    expect(w.mines.has('third')).toBe(false);
    expect(w.mines.has('cold')).toBe(true);
    expect(w.mines.has('captive')).toBe(true);
  });

  it('(c2) a FOULING mine chains like a naval one — only the CAPTIVE kind is carved out', () => {
    const w = board(27);
    mine(w, 'shot', 'x', 600, 0); // the one the BURST covers
    mine(w, 'foul', 'y', 600, 40, 0, 'fouling'); // inside the naval blast, a THIRD owner
    shootAt(w, 'a', 600);
    expect(w.mines.has('shot')).toBe(false);
    expect(w.mines.has('foul')).toBe(false);
  });

  it('(d) a STILL-ARMING mine under the burst is not set off, and the shell still bursts', () => {
    const w = board(25);
    mine(w, 'm1', 'x', 600, 0, 999_999);
    shootAt(w, 'a', 600);
    expect(w.mines.has('m1')).toBe(true);
    expect(w.tickEvents.some((e) => e.k === 'burst')).toBe(true);
  });

  it('(d) a CAPTIVE mine under the burst is not set off either (R2.18)', () => {
    const w = board(26);
    place(w, 'cap', 900, 900, 0, 'mineLayer');
    mine(w, 'm1', 'cap', 600, 0, 0, 'captive');
    shootAt(w, 'a', 600);
    expect(w.mines.has('m1')).toBe(true);
    expect(w.tickEvents.some((e) => e.k === 'burst')).toBe(true);
  });

  it('a STAR SHELL detonates nothing: illumination is not minefield clearing (AR44 mask)', () => {
    // The flare's mask has no `mine` bit at all, which is the structural half.
    expect(CONFIG.starShells.hits).not.toContain('mine');
    expect(CONFIG.gun.hits).toContain('mine');
  });
});

// ---------------------------------------------------------------------------
// AMENDMENT 19 + deferred-work.md:594 — a hull sunk THIS tick
// ---------------------------------------------------------------------------

describe('a hull sunk THIS tick (amendment 19, :594)', () => {
  // `resolveBurst` is driven directly here (no `step()`), so the events are
  // read off the tick's PENDING queue rather than `tickEvents` (last tick).
  const pend = (w: World): GameEvent[] => (w as unknown as { pending: GameEvent[] }).pending;
  const hcs = (w: World): HitCallEvent[] => pend(w).filter((e: GameEvent): e is HitCallEvent => e.k === 'hc');
  const sps = (w: World): SplashEvent[] => pend(w).filter((e: GameEvent): e is SplashEvent => e.k === 'sp');

  /** Drive `resolveBurst` directly over a wreck the same tick it sank. */
  function burstOverWreck(damage: number): World {
    const w = bareWorld(23);
    const a = place(w, 'a', 0, 0);
    const b = place(w, 'b', 300, 0);
    w.sinkShip(b.id, a.id); // b sinks — as an earlier shell of this click would
    const inner = w as unknown as {
      resolveBurst(shell: unknown, at: { x: number; y: number }, hulls: readonly Target[]): void;
      hitTargets(mask: readonly TargetKind[]): readonly Target[];
    };
    inner.resolveBurst(
      {
        id: 's2', ownerId: 'a', x: 300, y: 0, vx: 0, vy: 0, distLeft: 0, bornAt: w.now,
        kind: 'shell', damage, hitRadius: CONFIG.gun.shellRadius,
        targetX: 300, targetY: 0, burstRadius: CONFIG.gun.burstRadius,
        contactDamage: CONFIG.gun.contactDamage, hits: CONFIG.gun.hits,
      },
      { x: 300, y: 0 },
      inner.hitTargets(CONFIG.gun.hits),
    );
    return w;
  }

  it('a DAMAGING burst over it marks `hc`, deals nothing and pays nothing (amendment 19)', () => {
    const w = burstOverWreck(CONFIG.gun.damage);
    expect(hcs(w)).toHaveLength(1);
    expect(sps(w)).toHaveLength(0);
    expect(w.ships.get('a')!.damageDealt).toBe(0); // geometric only: no assist, no damage
  });

  it('the ZERO-DAMAGE star shell keeps its exclusion — a flare is never a detector', () => {
    const w = burstOverWreck(0);
    expect(hcs(w)).toHaveLength(0);
    expect(sps(w)).toHaveLength(1);
  });

  it(':594 — the wreck is not a collision subject, so a later shell passes THROUGH it', () => {
    const w = bareWorld(24);
    place(w, 'a', 0, 0);
    const b = place(w, 'b', 300, 0);
    expect(ids(w.hitTargets(CONFIG.gun.hits))).toContain('b');
    w.sinkShip(b.id, 'a');
    expect(ids(w.hitTargets(CONFIG.gun.hits))).not.toContain('b');
  });
});

// ---------------------------------------------------------------------------
// THE PERFORMANCE PIN (NFR23)
// ---------------------------------------------------------------------------

describe('the 500-live-mine performance pin (NFR23)', () => {
  type PerfInner = {
    stepMines(hitTargets: (m: readonly TargetKind[]) => readonly Target[]): void;
    resolveBurst(shell: unknown, at: { x: number; y: number }, hulls: readonly Target[]): void;
    hitTargets(mask: readonly TargetKind[]): readonly Target[];
  };

  /** A FRESH field for EVERY timed run (Story 8.4 review, P9). The old shape
   *  built ONE world outside the loop and timed it five times — and a timed run
   *  MUTATES it: `stepMines` trips, `resolveBurst` detonates, and a cascade can
   *  take mines off the water for good, so runs 2-5 would time a thinner field
   *  than run 1 and the best-of-5 would report the cheapest, not the worst.
   *  (Measured: with THIS fixture's geometry nothing actually detonates — the
   *  hulls sit clear of every trigger ring and the burst point is 240u from the
   *  nearest mine — so the old number was not wrong. It was unguarded: any
   *  future nudge to the layout would have quietly hollowed the pin out.) The
   *  rebuild happens here, OUTSIDE the clock, and the count is asserted below. */
  function perfField(): PerfInner {
    const w = bareWorld(31);
    for (let i = 0; i < 20; i += 1) {
      place(w, `s${i}`, -1200 + i * 120, 600);
    }
    for (let i = 0; i < 500; i += 1) {
      mine(w, `m${i}`, `s${i % 20}`, -1000 + (i % 50) * 40, -600 + Math.floor(i / 50) * 40);
    }
    return w as unknown as PerfInner;
  }

  it('checkMineTriggers + hitTargets + one full resolveBurst stay well inside the 50 ms tick', () => {
    const shell = {
      id: 'perf', ownerId: 's0', x: 0, y: 0, vx: 0, vy: 0, distLeft: 0, bornAt: 0,
      kind: 'shell', damage: CONFIG.gun.damage, hitRadius: CONFIG.gun.shellRadius,
      targetX: 0, targetY: 0, burstRadius: CONFIG.gun.burstRadius,
      contactDamage: CONFIG.gun.contactDamage, hits: CONFIG.gun.hits,
    };
    let best = Infinity;
    let mines = 0;
    for (let run = 0; run < 5; run += 1) {
      const inner = perfField(); // built OUTSIDE the clock — a fresh 500 every run
      mines = inner.hitTargets(['mine']).length;
      const t0 = performance.now();
      inner.stepMines((mask) => inner.hitTargets(mask));
      const targets = inner.hitTargets(CONFIG.gun.hits);
      inner.resolveBurst(shell, { x: 0, y: 0 }, targets);
      best = Math.min(best, performance.now() - t0);
    }
    // Every run really did see the full field.
    expect(mines).toBe(500);
    // Re-measured 2026-09-16 on the dev machine (Darwin 25.4, Node 22) with the
    // per-run rebuild: the number is recorded in this cycle's spec; the
    // ASSERTION is the tick budget.
    if (process.env.HC_PERF_LOG) console.log(`mine-perf best-of-5: ${best.toFixed(3)} ms`);
    expect(best).toBeLessThan(50);
  });
});

// ---------------------------------------------------------------------------
// THE REVIEW PATCHES (Story 8.4 review, 2026-09-16)
// ---------------------------------------------------------------------------

// P1 IS RETIRED BY AMENDMENT 20 (Eric 2026-09-16). It pinned the marks a
// MINE-CONSUMED shell may emit (none) — and there is no mine-consumed shell any
// more: a shell never collides with a mine at all. The stronger rule that
// replaces it is the byte-identical event-stream comparison in "gunfire and
// mines" above, which allows no emission of ANY kind, not just no `hc`/`sp`.

describe('P2 — the interception dispatches by KIND, not by store membership', () => {
  it('a HULL whose id equals a live mine id takes contact damage; the mine is untouched', () => {
    // Ids live in different namespaces but NOTHING enforces that. Under the old
    // `this.mines.get(id)` dispatch the collision resolved as the MINE. The
    // in-flight half of that defect is now structurally impossible (amendment
    // 20 keeps mines out of the sweep entirely); the KIND dispatch survives
    // because hull-vs-decoy still turns on it.
    const w = bareWorld(44);
    place(w, 'a', 0, 0, 0, 'mineLayer');
    const b = place(w, 'collide', 200, 0);
    mine(w, 'collide', 'x', 4000, 4000); // same id, parked far away
    const hp0 = b.hp;
    shootAt(w, 'a', 600);
    expect(b.hp).toBeLessThan(hp0); // the HULL took the hit
    expect(w.mines.has('collide')).toBe(true); // the mine never detonated
  });
});

describe('P3 — a destroyed or expired buoy invalidates the memo THE SAME TICK', () => {
  /** A buoy on the +x axis with a hand-set hp. */
  function buoy(w: World, id: string, ownerId: string, x: number, hp: number, until = w.now + 20000): void {
    w.buoys.set(id, {
      id, ownerId, x, y: 0,
      poly: [{ x: x - 6, y: -6 }, { x: x + 6, y: -6 }, { x: x + 6, y: 6 }, { x: x - 6, y: 6 }],
      hp, until, radarRange: 330, sweepAngle: 0, prevSweepAngle: 0, sweepTotalRad: 0,
      jamSeed: 1, jamEpoch: 0, jamFakes: [], gunReloadMsLeft: 0,
    } as never);
  }

  it('a buoy DESTROYED by fire is gone from the next list built the same tick', () => {
    const w = bareWorld(45);
    buoy(w, 'b1', 'x', 200, 1); // one point of hp: the first hit destroys it
    expect(ids(w.hitTargets(['decoy']))).toEqual(['b1']);
    const inner = w as unknown as { hitBuoy(id: string, amount: number): boolean };
    expect(inner.hitBuoy('b1', 50)).toBe(true);
    expect(w.buoys.has('b1')).toBe(false);
    // WITHOUT the generation bump this is the stale memo, and the second shell
    // of the click dies on a square that is not on the water any more.
    expect(ids(w.hitTargets(['decoy']))).toEqual([]);
  });

  it('a buoy that EXPIRES in tickBuoys retires the memo too', () => {
    const w = bareWorld(46);
    buoy(w, 'b1', 'x', 200, 50, w.now + 1); // lapses on the next tick
    expect(ids(w.hitTargets(['decoy']))).toEqual(['b1']);
    const inner = w as unknown as { tickBuoys(dtMs: number): void };
    w.now += 50;
    inner.tickBuoys(50);
    expect(w.buoys.has('b1')).toBe(false);
    expect(ids(w.hitTargets(['decoy']))).toEqual([]);
  });

  it('two shells in one tick: the first kills the buoy, the second is NOT consumed by it', () => {
    const w = bareWorld(47);
    const a = place(w, 'a', 0, 0, 0, 'mineLayer');
    buoy(w, 'b1', 'x', 300, 1);
    const inner = w as unknown as {
      resolveShell(shell: unknown, outcome: unknown, hulls: readonly Target[]): void;
      hitTargets(mask: readonly TargetKind[]): readonly Target[];
      pending: GameEvent[];
    };
    const shellAt = (id: string): unknown => ({
      id, ownerId: a.id, x: 300, y: 0, vx: 0, vy: 0, distLeft: 0, bornAt: w.now,
      kind: 'shell', damage: CONFIG.gun.damage, hitRadius: CONFIG.gun.shellRadius,
      targetX: 300, targetY: 0, burstRadius: CONFIG.gun.burstRadius,
      contactDamage: CONFIG.gun.contactDamage, hits: CONFIG.gun.hits,
    });
    const hit = { kind: 'hitShip', victimId: 'b1', x: 300, y: 0 };
    inner.resolveShell(shellAt('s1'), hit, inner.hitTargets(CONFIG.gun.hits));
    expect(w.buoys.has('b1')).toBe(false);
    // The SECOND shell asks the collector again — and must be offered nothing,
    // so its own resolution can never name the dead square at all.
    expect(ids(inner.hitTargets(CONFIG.gun.hits))).not.toContain('b1');
  });
});

describe('P4 — the per-tick state is cleared in the PROLOGUE', () => {
  it('a sinkShip BETWEEN ticks does not survive as a "sank this tick" wreck', () => {
    // match.ts leave-scuttle sinks a hull outside any step. With the clears in
    // the EPILOGUE that wreck was still in `sunkThisTick` for the whole of the
    // NEXT tick, so a burst resolved inside that tick minted an `hc` for a hull
    // that sank before the tick began — amendment 19 says THIS tick.
    const w = bareWorld(48);
    const a = place(w, 'a', 0, 0);
    const b = place(w, 'b', 600, 0);
    w.sinkShip(b.id, a.id); // OUTSIDE a step, exactly as leave-scuttle does
    // A shell already in flight, one tick short of its target point. The wreck
    // is no collision subject (the sink invalidated the collector), so this
    // BURSTS at 600,0 — right on top of it — inside the very next step().
    w.shells.set('s9', {
      id: 's9', ownerId: a.id, x: 580, y: 0, vx: 600, vy: 0, distLeft: 400, bornAt: w.now,
      kind: 'shell', damage: CONFIG.gun.damage, hitRadius: CONFIG.gun.shellRadius,
      targetX: 600, targetY: 0, burstRadius: CONFIG.gun.burstRadius,
      contactDamage: CONFIG.gun.contactDamage, hits: CONFIG.gun.hits,
    } as never);
    w.step(); // the NEXT tick: stepShells resolves the burst inside it
    expect(w.tickEvents.some((e) => e.k === 'burst')).toBe(true); // it really burst
    const marks = w.tickEvents.filter((e) => e.k === 'hc' || e.k === 'sp');
    expect(marks.map((e) => e.k)).toEqual(['sp']); // fall of shot, NOT a hit call
  });

});

describe('P8 — wrecksInBurst honours the fleet friendly filter', () => {
  it('a FLEET-owned burst never counts a friendly fleet wreck as a geometric victim', () => {
    // A fleet shell does not see a friendly fleet hull as a collision subject at
    // all (stepShells filter, amendment 36). Counting one here would let the
    // wreck list re-admit through the back door what the damage path refuses.
    const w = bareWorld(49);
    w.addShip('fleetA', 'F1', 'fleet', 'torpedoBoat', undefined, { x: 0, y: 0 });
    const f2 = w.addShip('fleetB', 'F2', 'fleet', 'torpedoBoat', undefined, { x: 300, y: 0 });
    f2.state = { x: 300, y: 0, heading: 0, speed: 0 };
    w.sinkShip('fleetB', undefined);
    const inner = w as unknown as {
      wrecksInBurst(at: { x: number; y: number }, radius: number, ownerId: string): number;
    };
    expect(inner.wrecksInBurst({ x: 300, y: 0 }, CONFIG.gun.burstRadius, 'fleetA')).toBe(0);
    // A CAPTAIN burst over the same wreck still counts it (amendment 19).
    place(w, 'a', -900, 0);
    expect(inner.wrecksInBurst({ x: 300, y: 0 }, CONFIG.gun.burstRadius, 'a')).toBe(1);
  });
});


// ---------------------------------------------------------------------------
// CYCLE-148 REVIEW GATE, P4 — EACH MINE KIND TRIPS THROUGH ITS OWN `hits` ROW
// ---------------------------------------------------------------------------
//
// The trip scan collected `CONFIG.mine.hits` ONCE and scanned every armed mine
// against that one list, whatever rack it came off. `CONFIG.foulingMines.hits`
// was therefore authored data nothing read — and the day the fouling line's
// mask diverges from the naval one (a fouling mine that catches a decoy's
// screws, say) the divergence would have been silently ignored. The masks agree
// today, so the only way to SEE the routing is to make them disagree.
describe('the mine trip scan routes by KIND (MINE_TRIP_HITS)', () => {
  /** One layer, and two victims each parked on top of one of their mines. */
  function twoMines(seed: number): World {
    const w = bareWorld(seed);
    place(w, 'a', 0, 0); // the layer — never trips its own
    place(w, 'b', 600, 0);
    place(w, 'c', -600, 0);
    mine(w, 'm-naval', 'a', 600, 0, 0, 'naval');
    mine(w, 'm-foul', 'a', -600, 0, 0, 'fouling');
    return w;
  }

  it('THE CONTROL: with both rows authored hull-only, both mines trip', () => {
    const w = twoMines(71);
    w.step();
    expect(w.mines.has('m-naval')).toBe(false);
    expect(w.mines.has('m-foul')).toBe(false);
  });

  it('a FOULING mine whose row collects nothing never trips — the naval one still does', () => {
    const row = CONFIG.foulingMines as unknown as { hits: readonly TargetKind[] };
    const saved = row.hits;
    row.hits = []; // this line now catches nothing at all
    try {
      const w = twoMines(72);
      w.step();
      expect(w.mines.has('m-naval')).toBe(false); // the naval rack is untouched
      expect(w.mines.has('m-foul')).toBe(true); // ...and the fouling rack is inert
    } finally {
      row.hits = saved;
    }
  });
});
