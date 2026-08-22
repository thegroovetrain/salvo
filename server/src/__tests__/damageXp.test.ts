// THE DAMAGE->XP RULE (CONFIG.xp.damageLevels) — the measurement dial added so
// a "1 damage grants 1/N of a level" economy can be simulated by the batch-sim
// harness without the shipped game moving.
//
// TWO THINGS ARE UNDER TEST AND THEY MATTER EQUALLY.
//
// (1) THE DIAL IS OFF AND THE SHIPPED ECONOMY IS UNCHANGED. `damageLevels` is 0
//     in CONFIG, and at 0 the credit path returns before touching xpMs — so
//     damage adds nothing, exactly as ShipRecord.xpMs's contract has always
//     said ("Damage adds nothing"). The whole rest of the suite passing is the
//     broad proof; the first case here is the direct one.
//
// (2) THE INSTRUMENT ACTUALLY WORKS WHEN ON. A balance campaign run against a
//     dial that silently does nothing produces confident nonsense, which is
//     worse than no campaign — so the rate is pinned as an EQUALITY, and the
//     exclusions the seam gives for free (self-damage, storm, fleet hulls) are
//     pinned as facts rather than assumed from where the code sits.
//
// CONFIG is `as const` but not frozen at runtime (the same property the harness
// overrides rely on), so each ON case sets the dial, runs, and restores it in a
// finally — no test may leak a live rule into the next one.

import { describe, it, expect } from 'vitest';
import { CONFIG, isAfloat, type HullId } from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';

const XP = CONFIG.xp;
const MUT = CONFIG.xp as { damageLevels: number };

/** Run `fn` with the damage->XP rule live at `rate` levels per 1 damage. */
function withRate<T>(rate: number, fn: () => T): T {
  const prev = MUT.damageLevels;
  MUT.damageLevels = rate;
  try {
    return fn();
  } finally {
    MUT.damageLevels = prev;
  }
}

function bareWorld(seed = 3): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  return w;
}

function place(w: World, id: string, x = 0, y = 0, hull: HullId = 'torpedoBoat', fleet = false): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), fleet ? 'fleet' : 'captain', hull);
  rec.state.x = x;
  rec.state.y = y;
  rec.state.speed = 0;
  return rec;
}

/** Land one contact-only shell from `ownerId` on the hull at (x,y). Mirrors the
 *  injection idiom match.test.ts uses for its damageDealt pin: a shell with no
 *  burst, whose contactDamage IS the full damage, so exactly `damage` lands on
 *  exactly one victim and the credited amount is unambiguous. */
function injectShell(w: World, id: string, ownerId: string, x: number, y: number, damage: number): void {
  w.shells.set(id, {
    id,
    ownerId,
    x,
    y,
    vx: CONFIG.gun.shellSpeed,
    vy: 0,
    distLeft: 60,
    bornAt: w.now,
    kind: 'shell',
    damage,
    hitRadius: CONFIG.gun.shellRadius,
    targetX: null,
    targetY: null,
    burstRadius: 0,
    contactDamage: damage,
  });
}

/** Fire `n` shells one at a time from `by` into `victim`, healing the victim
 *  back to full between hits so nothing sinks and every hit credits in full. */
function landHits(w: World, by: string, victim: ShipRecord, n: number, damage: number): void {
  for (let i = 0; i < n; i++) {
    victim.hp = victim.stats.maxHp;
    injectShell(w, `s${i}`, by, victim.state.x - 20, victim.state.y, damage);
    for (let t = 0; t < 8 && w.shells.size > 0; t++) w.step();
  }
}

describe('damage->XP rule: OFF is the shipped game', () => {
  it('grants no XP for damage at the shipped default of 0', () => {
    expect(CONFIG.xp.damageLevels).toBe(0);
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const b = place(w, 'b', 300, 0);
    w.damageEnabled = true;
    landHits(w, 'a', b, 3, CONFIG.gun.damage);
    expect(a.damageDealt).toBe(3 * CONFIG.gun.damage); // damage really landed
    // ...and bought nothing but the passive ticks those steps also accrued.
    expect(a.xpMs).toBe(w.now);
    expect(a.dmgXpCarryMs).toBe(0);
  });
});

describe('damage->XP rule: ON pays its exact rate', () => {
  it('pays levelMs x rate x damage, as an equality, at 1/300', () => {
    withRate(1 / 300, () => {
      const w = bareWorld();
      const a = place(w, 'a', 0, 0);
      const b = place(w, 'b', 300, 0);
      w.damageEnabled = true;
      landHits(w, 'a', b, 1, CONFIG.gun.damage);
      // 60000 x (1/300) x 15 = 3000ms, and the passive tick adds w.now.
      expect(a.xpMs - w.now).toBe(3000);
    });
  });

  it('pays 3x as much at 1/100 as at 1/300 — the dial is the rate', () => {
    const earned = (rate: number): number =>
      withRate(rate, () => {
        const w = bareWorld();
        const a = place(w, 'a', 0, 0);
        const b = place(w, 'b', 300, 0);
        w.damageEnabled = true;
        landHits(w, 'a', b, 2, CONFIG.gun.damage);
        return a.xpMs - w.now;
      });
    expect(earned(1 / 100)).toBe(3 * earned(1 / 300));
  });

  it('banks whole levels through the normal pipeline (offer + pt event)', () => {
    // 1/100 x 300 damage = 3 levels' worth in one blow. 300 is deliberately
    // BELOW the battleship's 350 hp: a lethal blow would add the kill's own
    // level on top and this case is about the damage rule alone (the overkill
    // case below is where a sinking blow is the point).
    withRate(1 / 100, () => {
      const w = bareWorld();
      const a = place(w, 'a', 0, 0);
      const b = place(w, 'b', 300, 0, 'battleship');
      w.damageEnabled = true;
      landHits(w, 'a', b, 1, 300);
      expect(isAfloat(b.lifecycle)).toBe(true); // nothing sank; no kill level
      expect(a.level).toBe(3);
      expect(a.bankedLevels).toBe(3);
      expect(a.offer).not.toBeNull(); // a real hand was drawn, not just a counter
    });
  });

  it('CARRIES sub-millisecond remainders instead of rounding them away', () => {
    // A rate whose per-hit value is deliberately fractional: 60000 x r x 1 =
    // 0.5ms per hit. Rounding each hit independently would pay either 0 (a
    // silent total loss) or 1ms (a silent 2x overpay); carrying pays exactly
    // half a ms a hit, so 400 hits is exactly 200ms.
    withRate(0.5 / 60000, () => {
      const w = bareWorld();
      const a = place(w, 'a', 0, 0);
      const b = place(w, 'b', 300, 0);
      w.damageEnabled = true;
      landHits(w, 'a', b, 400, 1);
      expect(a.damageDealt).toBe(400);
      expect(a.xpMs - w.now).toBe(200);
    });
  });
});

describe('damage->XP rule: what the seam refuses, for free', () => {
  it('pays nothing for SELF damage — creditDamage filters the self-hit', () => {
    withRate(1 / 100, () => {
      const w = bareWorld();
      const a = place(w, 'a', 0, 0);
      w.damageEnabled = true;
      landHits(w, 'a', a, 2, CONFIG.gun.damage);
      expect(a.damageDealt).toBe(0);
      expect(a.xpMs - w.now).toBe(0);
    });
  });

  it('pays a FLEET hull nothing — addXpMs fail-closes on drones, as it always has', () => {
    withRate(1 / 100, () => {
      const w = bareWorld();
      const d = place(w, 'd', 0, 0, 'droneSmall', true);
      const b = place(w, 'b', 300, 0);
      w.damageEnabled = true;
      landHits(w, 'd', b, 2, CONFIG.gun.damage);
      expect(d.damageDealt).toBeGreaterThan(0); // it dealt the damage
      expect(d.xpMs).toBe(0); // and accrued nothing, drone rule intact
      expect(d.level).toBe(0);
      expect(d.bankedLevels).toBe(0);
    });
  });

  it('pays nothing while damage is SUPPRESSED (ready room) — no hp, no XP', () => {
    withRate(1 / 100, () => {
      const w = bareWorld();
      const a = place(w, 'a', 0, 0);
      const b = place(w, 'b', 300, 0);
      w.damageEnabled = false;
      const hp0 = b.hp;
      landHits(w, 'a', b, 2, CONFIG.gun.damage);
      expect(b.hp).toBe(hp0);
      expect(a.damageDealt).toBe(0);
      expect(a.xpMs - w.now).toBe(0);
    });
  });
});

describe('damage->XP rule: overkill never pays, but the KILL BONUS still does', () => {
  // Eric ruling 2026-08-22: "excess damage should just not be counted. if i do
  // 50 damage to someone with 1 HP left, i get 1 damage worth of XP" — and,
  // immediately after: "I *DO* get the kill bonus though. I don't want to
  // remove that." Both halves are pinned here together, because the whole risk
  // in this rule is that one of them quietly swallows the other.

  it("pays for 1 damage, not 50, when the victim had 1 hp — Eric's own example", () => {
    withRate(1 / 100, () => {
      const w = bareWorld();
      const a = place(w, 'a', 0, 0);
      const b = place(w, 'b', 300, 0);
      w.damageEnabled = true;
      b.hp = 1;
      injectShell(w, 'k', 'a', b.state.x - 20, b.state.y, 50);
      for (let t = 0; t < 8 && w.shells.size > 0; t++) w.step();
      // 1 damage x 1/100 x 60000 = 600ms of XP. The 49 wasted damage pays
      // NOTHING; at the un-clamped reading this would have been 30000ms.
      const killMs = XP.levelMs * XP.killLevels;
      expect(a.xpMs + a.level * XP.levelMs - w.now).toBe(600 + killMs);
    });
  });

  it('still banks the full kill level on the blow that sinks the hull', () => {
    withRate(1 / 100, () => {
      const w = bareWorld();
      const a = place(w, 'a', 0, 0);
      const b = place(w, 'b', 300, 0);
      w.damageEnabled = true;
      b.hp = 10;
      injectShell(w, 'k', 'a', b.state.x - 20, b.state.y, 400);
      for (let t = 0; t < 8 && w.shells.size > 0; t++) w.step();
      expect(isAfloat(b.lifecycle)).toBe(false);
      // 10 absorbed damage = 6000ms, PLUS the untouched 1-level kill credit.
      expect(a.level).toBe(1);
      expect(a.xpMs - w.now).toBe(6000);
    });
  });

  it('leaves damageDealt on the FULL nominal blow — the tally is not the economy', () => {
    withRate(1 / 100, () => {
      const w = bareWorld();
      const a = place(w, 'a', 0, 0);
      const b = place(w, 'b', 300, 0);
      w.damageEnabled = true;
      b.hp = 10;
      injectShell(w, 'k', 'a', b.state.x - 20, b.state.y, 400);
      for (let t = 0; t < 8 && w.shells.size > 0; t++) w.step();
      // The results-screen stat is deliberately untouched by the XP clamp.
      expect(a.damageDealt).toBe(400);
    });
  });
});
