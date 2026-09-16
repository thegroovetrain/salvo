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
//   * amendments 16-18 (shoot any armed mine, chains cross owners, captives and
//     arming mines immune both ways) end to end through a real World;
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
} from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
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
  const rec = w.addShip(id, id.toUpperCase(), 'captain', hull, undefined, undefined, []);
  rec.state = { x, y, heading, speed: 0 };
  return rec;
}

/** A mine straight into world state. Armed at time 0 unless told otherwise. */
function mine(w: World, id: string, ownerId: string, x: number, y: number, armedAt = 0): void {
  w.mines.set(id, { id, ownerId, x, y, armedAt });
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

  it('`mine` OMITS a still-arming mine and a captive layer\'s mine — a shell must fly ON, not stop', () => {
    const w = bareWorld();
    const layer = place(w, 'cap', 800, 800, 0, 'mineLayer');
    layer.stats.equipment.navalMines.captive = true;
    mine(w, 'armed', 'b', 100, 0);
    mine(w, 'arming', 'b', 150, 0, 999_999);
    mine(w, 'captive', 'cap', 200, 0);
    expect(ids(w.hitTargets(['mine']))).toEqual(['armed']);
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

describe('shooting a mine (amendments 16-18)', () => {
  /** The shooter alone at the origin, gun pointing +x. */
  function board(): World {
    const w = bareWorld(21);
    place(w, 'a', 0, 0, 0, 'mineLayer');
    return w;
  }

  it("a shell that PASSES OVER an enemy's armed mine detonates it — the mine's blast, at the mine", () => {
    const w = board();
    mine(w, 'm1', 'x', 200, 0); // an ENEMY mine, short of the click point
    shootAt(w, 'a', 600);
    expect(w.mines.has('m1')).toBe(false);
    const boom = w.tickEvents.find((e): e is BoomEvent => e.k === 'boom' && e.id === 'm1');
    expect(boom).toEqual({ k: 'boom', id: 'm1', x: 200, y: 0 }); // at the MINE
  });

  it('the shell is CONSUMED by the mine: it never reaches its own burst point', () => {
    const w = board();
    mine(w, 'm1', 'x', 200, 0);
    shootAt(w, 'a', 600);
    expect(w.tickEvents.some((e) => e.k === 'burst')).toBe(false);
    expect(w.shells.size).toBe(0);
  });

  it("the shooter's OWN armed mine is set off by the shooter's own shell (the one pinned exception)", () => {
    const w = board();
    mine(w, 'm1', 'a', 200, 0);
    shootAt(w, 'a', 600);
    expect(w.mines.has('m1')).toBe(false);
  });

  it('a STILL-ARMING mine is not set off, and does not stop the shell either', () => {
    const w = board();
    mine(w, 'm1', 'x', 200, 0, 999_999);
    shootAt(w, 'a', 600);
    expect(w.mines.has('m1')).toBe(true);
    expect(w.tickEvents.some((e) => e.k === 'burst')).toBe(true); // it flew on and burst
  });

  it("a CAPTIVE layer's mine is not set off, and does not stop the shell either (R2.18)", () => {
    const w = board();
    const layer = place(w, 'cap', 900, 900, 0, 'mineLayer');
    layer.stats.equipment.navalMines.captive = true;
    mine(w, 'm1', 'cap', 200, 0);
    shootAt(w, 'a', 600);
    expect(w.mines.has('m1')).toBe(true);
    expect(w.tickEvents.some((e) => e.k === 'burst')).toBe(true);
  });

  it('a detonation CHAINS ACROSS OWNERS in the same tick (amendment 18), skipping captives and arming mines', () => {
    const w = board();
    const layer = place(w, 'cap', 900, 900, 0, 'mineLayer');
    layer.stats.equipment.navalMines.captive = true;
    mine(w, 'shot', 'x', 200, 0); // the one the shell hits
    mine(w, 'mine-mine', 'a', 200, 40); // MINE within the 48u blast — a DIFFERENT owner
    mine(w, 'third', 'y', 200, 80); // chained off the second, a THIRD owner
    mine(w, 'cold', 'x', 200, 120, 999_999); // still arming — immune
    mine(w, 'captive', 'cap', 200, 45); // captive — immune, and propagates nothing
    shootAt(w, 'a', 600);
    expect(w.mines.has('shot')).toBe(false);
    expect(w.mines.has('mine-mine')).toBe(false);
    expect(w.mines.has('third')).toBe(false);
    expect(w.mines.has('cold')).toBe(true);
    expect(w.mines.has('captive')).toBe(true);
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
  it('checkMineTriggers + hitTargets + one full resolveBurst stay well inside the 50 ms tick', () => {
    const w = bareWorld(31);
    for (let i = 0; i < 20; i += 1) {
      place(w, `s${i}`, -1200 + i * 120, 600);
    }
    for (let i = 0; i < 500; i += 1) {
      mine(w, `m${i}`, `s${i % 20}`, -1000 + (i % 50) * 40, -600 + Math.floor(i / 50) * 40);
    }
    const inner = w as unknown as {
      stepMines(hitTargets: (m: readonly TargetKind[]) => readonly Target[]): void;
      resolveBurst(shell: unknown, at: { x: number; y: number }, hulls: readonly Target[]): void;
      hitTargets(mask: readonly TargetKind[]): readonly Target[];
    };
    const shell = {
      id: 'perf', ownerId: 's0', x: 0, y: 0, vx: 0, vy: 0, distLeft: 0, bornAt: 0,
      kind: 'shell', damage: CONFIG.gun.damage, hitRadius: CONFIG.gun.shellRadius,
      targetX: 0, targetY: 0, burstRadius: CONFIG.gun.burstRadius,
      contactDamage: CONFIG.gun.contactDamage, hits: CONFIG.gun.hits,
    };
    let best = Infinity;
    for (let run = 0; run < 5; run += 1) {
      const t0 = performance.now();
      inner.stepMines((mask) => inner.hitTargets(mask));
      const targets = inner.hitTargets(CONFIG.gun.hits);
      inner.resolveBurst(shell, { x: 0, y: 0 }, targets);
      best = Math.min(best, performance.now() - t0);
    }
    // Measured 2026-09-15 on the dev machine (Darwin 25.4, Node 22): the best
    // of 5 runs lands around a millisecond, two orders under the budget. The
    // number is recorded in this cycle's spec; the ASSERTION is the tick budget.
    if (process.env.HC_PERF_LOG) console.log(`mine-perf best-of-5: ${best.toFixed(3)} ms`);
    expect(best).toBeLessThan(50);
  });
});
