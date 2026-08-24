// THE FREE PER-LEVEL AUTO-HEAL (CONFIG.damageControl.levelMissingPct) — Eric's
// answer, 2026-08-23, to a measured complaint: 58.7 % of every level earned was
// being spent on HEAL_CHOICE rather than an upgrade, and raising XP does not fix
// it because volume scales cards and heals together.
//
// THE POINT OF THE FEATURE IS WHAT IT DOES *NOT* TOUCH. Eric likes the heal
// being a strategic decision and wants that kept; the complaint is only about
// the SHARE of levels it eats. So the tests that matter most here are the ones
// pinning that the refit-menu heal still costs a level, still drops the offer,
// still pays its full flat amounts at its own fixed rate, and is otherwise
// byte-identical — a free heal that quietly made the paid one redundant would be
// a worse outcome than doing nothing at all.

import { describe, it, expect } from 'vitest';
import { CONFIG, HEAL_CHOICE, isAfloat, type HullId } from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';

const DC = CONFIG.damageControl;
const MUT = CONFIG.damageControl as { levelMissingPct: number };
const TICKS_PER_LEVEL = CONFIG.xp.levelMs / CONFIG.tick.simDtMs;
const TICKS_PER_S = 1000 / CONFIG.tick.simDtMs;

/** Run `fn` with the auto-heal dial moved, always restoring it. */
function withMissingPct<T>(pct: number, fn: () => T): T {
  const prev = MUT.levelMissingPct;
  MUT.levelMissingPct = pct;
  try {
    return fn();
  } finally {
    MUT.levelMissingPct = prev;
  }
}

function bareWorld(seed = 3): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  return w;
}

function place(w: World, id: string, hull: HullId = 'torpedoBoat', fleet = false): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), fleet ? 'fleet' : 'captain', hull);
  rec.state.speed = 0;
  return rec;
}

/** Tick until `ship` banks one more level via the passive tick. tickRepairs
 *  runs BEFORE tickXp in STEP_ORDER, so the grant is never drained in its own
 *  tick and the pool reads its full amount immediately afterwards. */
function tickOneLevel(w: World): void {
  for (let i = 0; i < TICKS_PER_LEVEL; i++) w.step();
}

const healEvents = (w: World, id: string): unknown[] => w.tickEvents.filter((e) => e.k === 'heal' && e.id === id);

describe('per-level auto-heal: the ruled shape — a fraction of MISSING hull', () => {
  it('ships at 10 % of missing over 5 s, into its OWN pool at its OWN rate', () => {
    expect(DC.levelMissingPct).toBe(0.1);
    expect(DC.levelRegenMs).toBe(5000);
  });

  it('banks 10 % of MISSING hull — the spec matrix row: a level at 150/350', () => {
    const w = bareWorld();
    const a = place(w, 'a', 'battleship');
    expect(a.stats.maxHp).toBe(350);
    a.hp = 150;
    tickOneLevel(w);
    expect(a.level).toBe(1);
    // 10 % of the 200 missing. NOT 10 % of max (that would be 35) and not a
    // flat amount — the shape is what makes it need no repricing when hull HP
    // next moves.
    expect(a.levelRepairHp).toBeCloseTo(20, 6);
    // The bar has not jumped: the whole grant is still sitting in the pool.
    expect(a.hp).toBe(150);
    // The level is still banked and its offer still drawn — the free heal is
    // additive, never a substitute for the spend.
    expect(a.bankedLevels).toBe(1);
    expect(a.offer).not.toBeNull();
    // The PAID pool is untouched.
    expect(a.repairHp).toBe(0);
  });

  it('delivers BY DURATION — the whole pool over levelRegenMs, whatever its size', () => {
    const w = bareWorld();
    const a = place(w, 'a', 'battleship');
    a.hp = 150;
    tickOneLevel(w);
    expect(a.levelRepairHp).toBeCloseTo(20, 6);
    // 20 hp over 5 s = 4 hp/s. A FIXED hp/s could not do this: the amount
    // varies with how hurt the hull is while the window is fixed at 5 s, which
    // is exactly why this channel exists rather than sharing the paid pool.
    for (let i = 0; i < TICKS_PER_S; i++) w.step();
    expect(a.hp).toBeCloseTo(154, 6);
    for (let i = 0; i < TICKS_PER_S * 4; i++) w.step(); // the remaining 4 s
    expect(a.hp).toBeCloseTo(170, 6);
    expect(a.levelRepairHp).toBeCloseTo(0, 6);
    // The pool is a float drained in 50 ms bites, so the last one can leave
    // sub-picogram dust rather than a hard 0; one more tick clears it and the
    // rate drops with it, so a later grant is never paid at a stale rate.
    w.step();
    expect(a.levelRepairHp).toBe(0);
    expect(a.levelRepairRate).toBe(0);
  });

  it('pays a bigger pool at a PROPORTIONALLY faster rate — same 5 s, more hp', () => {
    const w = bareWorld();
    const a = place(w, 'a', 'battleship');
    a.hp = 50; // 300 missing -> a 30 hp pool, against the 20 hp one above
    tickOneLevel(w);
    expect(a.levelRepairHp).toBeCloseTo(30, 6);
    for (let i = 0; i < TICKS_PER_S * 5; i++) w.step();
    expect(a.hp).toBeCloseTo(80, 6); // still exactly 5 s, not 7.5
    expect(a.levelRepairHp).toBeCloseTo(0, 6);
  });

  it('pays a FULL hull nothing and fires NO heal cue', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    a.hp = a.stats.maxHp;
    tickOneLevel(w);
    expect(a.level).toBe(1);
    expect(a.levelRepairHp).toBe(0);
    expect(a.hp).toBe(a.stats.maxHp);
    // 10 % of zero missing is zero, and the cue must not fire for a heal that
    // did not happen — which is why the event is pushed AFTER the amount.
    expect(healEvents(w, 'a')).toEqual([]);
  });

  it('fires the self-private heal cue on a hurt hull, for free (no client change)', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    a.hp = 100;
    tickOneLevel(w);
    expect(healEvents(w, 'a')).toEqual([{ k: 'heal', id: 'a' }]);
  });

  it('fires once PER LEVEL BANKED when one grant banks several at once', () => {
    const w = bareWorld();
    const a = place(w, 'a', 'battleship');
    a.hp = 150; // 200 missing
    w.grantXp(a, 3); // three levels in ONE grant
    expect(a.level).toBe(3);
    // Each crossing measures the SAME missing hp — the pool is not hp yet — so
    // three levels compound FLAT at 20 each rather than 20 + 18 + 16.2.
    expect(a.levelRepairHp).toBeCloseTo(60, 6);
    // ...and the rate is recomputed against the WHOLE pool, so all 60 still
    // land in one 5 s window rather than three staggered ones.
    expect(a.levelRepairRate).toBeCloseTo(60 / DC.levelRegenMs, 12);
  });

  it('gives a SINKING hull nothing — the no-hp-comes-back rule holds', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    a.hp = 100;
    w.sinkShip('a');
    expect(isAfloat(a.lifecycle)).toBe(false);
    // REACHABLE, not defensive: kill credit is not alive-gated, so a hull can
    // genuinely bank a level after entering its sinking window.
    w.grantXp(a, 1);
    expect(a.level).toBe(1); // the level still lands...
    expect(a.levelRepairHp).toBe(0); //  ...the pool does not
    expect(healEvents(w, 'a')).toEqual([]);
  });

  it('gives a FLEET hull nothing — it never banks a level at all', () => {
    const w = bareWorld();
    const d = place(w, 'd', 'droneSmall', true);
    d.hp = 10;
    w.grantXp(d, 5);
    expect(d.level).toBe(0);
    expect(d.levelRepairHp).toBe(0);
  });

  it('dies with the life — the pool is zeroed at sink entry', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    a.hp = 100;
    tickOneLevel(w);
    expect(a.levelRepairHp).toBeGreaterThan(0);
    w.sinkShip('a');
    expect(a.levelRepairHp).toBe(0);
    expect(a.levelRepairRate).toBe(0);
  });

  it('OFF at 0 (the harness arm) restores the shipped game exactly', () => {
    withMissingPct(0, () => {
      const w = bareWorld();
      const a = place(w, 'a');
      a.hp = 100;
      tickOneLevel(w);
      expect(a.level).toBe(1);
      expect(a.hp).toBe(100);
      expect(a.repairHp).toBe(0);
      expect(a.levelRepairHp).toBe(0);
      expect(healEvents(w, 'a')).toEqual([]);
    });
  });
});

describe('per-level auto-heal: the MENU heal Eric wants kept is untouched', () => {
  it('still costs a banked level, drops the offer, and pays its FLAT amounts', () => {
    const w = bareWorld();
    const a = place(w, 'a', 'battleship');
    a.hp = 150;
    tickOneLevel(w); // banks a level; the free heal puts 20 in its own pool
    expect(a.levelRepairHp).toBeCloseTo(20, 6);
    expect(a.repairHp).toBe(0); // the PAID pool is untouched by it
    expect(a.bankedLevels).toBe(1);
    const hpBefore = a.hp;
    expect(w.spendPoint('a', HEAL_CHOICE)).toBe(true);
    // The paid heal pays its full shipped amount — flat, not a percentage, and
    // unaffected by the free trickle sitting alongside it.
    expect(a.hp).toBeCloseTo(hpBefore + DC.instantHp, 6);
    expect(a.repairHp).toBe(DC.regenHp);
    expect(a.bankedLevels).toBe(0);
    expect(a.offer).toBeNull();
    // Two channels, two pools: the free one is not touched by the spend.
    expect(a.levelRepairHp).toBeCloseTo(20, 6);
  });

  it('keeps the ANTI-FLASK rule: two menu heals run LONGER, never faster', () => {
    const w = bareWorld();
    const a = place(w, 'a', 'battleship');
    a.hp = 100;
    w.grantXp(a, 2);
    a.levelRepairHp = 0; // isolate the paid channel
    a.levelRepairRate = 0;
    expect(w.spendPoint('a', HEAL_CHOICE)).toBe(true);
    expect(w.spendPoint('a', HEAL_CHOICE)).toBe(true);
    expect(a.repairHp).toBe(DC.regenHp * 2); // pools ADD...
    const hpBefore = a.hp;
    for (let i = 0; i < TICKS_PER_S; i++) w.step();
    // ...and the RATE never changes: still regenHp/regenMs = 10 hp/s, so the
    // doubled pool takes 10 s rather than landing in 5.
    expect(a.hp - hpBefore).toBeCloseTo((DC.regenHp / DC.regenMs) * 1000, 6);
  });

  it('is still refused at full hp — the free heal creates no legal spend', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    tickOneLevel(w);
    a.hp = a.stats.maxHp;
    expect(w.spendPoint('a', HEAL_CHOICE)).toBe(false);
    expect(a.bankedLevels).toBe(1); // nothing was consumed
  });
});

describe('per-level auto-heal: the two channels are independent', () => {
  it('both pools drain concurrently, each at its OWN rate', () => {
    const w = bareWorld();
    const a = place(w, 'a', 'battleship');
    a.hp = 150; // 200 missing
    w.grantXp(a, 1); // free: 20 hp over 5 s = 4 hp/s
    expect(a.levelRepairHp).toBeCloseTo(20, 6);
    expect(w.spendPoint('a', HEAL_CHOICE)).toBe(true); // paid: +50 now, 50 at 10 hp/s
    const hpAfterInstant = a.hp;
    expect(a.repairHp).toBe(DC.regenHp);
    for (let i = 0; i < TICKS_PER_S; i++) w.step();
    // One second pays 10 from the paid pool AND 4 from the free one — 14, which
    // is neither rate alone and is only reachable with two channels.
    expect(a.hp - hpAfterInstant).toBeCloseTo(14, 6);
    expect(a.repairHp).toBeCloseTo(DC.regenHp - 10, 6);
    expect(a.levelRepairHp).toBeCloseTo(16, 6);
  });

  it('mirrors the SUM onto the wire — the field means "hp still owed"', async () => {
    const { buildFrame } = await import('../game/frames.js');
    const w = bareWorld();
    const a = place(w, 'a', 'battleship');
    a.hp = 150;
    w.grantXp(a, 1);
    expect(w.spendPoint('a', HEAL_CHOICE)).toBe(true);
    const you = buildFrame(w, 'a').you;
    expect(you).toBeDefined();
    expect(you!.repairHp).toBeCloseTo(a.repairHp + a.levelRepairHp, 6);
    expect(you!.repairHp).toBeGreaterThan(a.repairHp); // genuinely the sum
  });
});
