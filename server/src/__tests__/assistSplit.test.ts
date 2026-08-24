// THE ASSIST SPLIT (CONFIG.xp.assistWindowMs / killerShare) — Eric's assist
// economy, 2026-08-22/23: "The killer gets 1/10 of a level, and the remaining
// 9/10 are split proportionally between everyone who dealt damage to that ship
// that contributed to the kill", read through his rolling-counter model:
//
//   "as long as i continue putting damage on the ship within 60s, it tracks all
//   the damage i have done. If that 60s window expires, then it stops tracking
//   my damage. When the ship is sunk, the xp reward is split proportionally to
//   everyone who still had an active counter at that time."
//
// ONE DIAL DOES ALL THREE JOBS — the per-attacker restart gap, the eligibility
// window at the sink, and the on-switch. The tests below exercise the same
// number in all three roles deliberately; a second gap dial does not exist and
// the barrel's shape pin refuses one.
//
// THE PROPERTY THAT MATTERS MOST IS CONSERVATION. This mechanism REDISTRIBUTES
// a fixed pot rather than minting XP per point of damage, which is precisely
// what keeps it from running away the way a damage->XP rule does (measured: one
// bot reached 187 levels at 1/100, and every damage->XP arm blew the class
// spread out to 20.9-47.3 pp). So the tests pin the total paid out, not just
// each share.
//
// `xpEnabled = false` in every case: it gates the PASSIVE tick but explicitly
// NOT kill credit, so it isolates exactly the payout under test.

import { describe, it, expect } from 'vitest';
import { CONFIG, type HullId } from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';

const XP = CONFIG.xp;
const MUT = CONFIG.xp as { assistWindowMs: number; killerShare: number };
const SHIPPED_WINDOW = 60000;

/** Run `fn` with the two dials moved, always restoring them. Shortening the
 *  window is how the lapse cases stay fast; the rule is window-RELATIVE, and
 *  one case below runs at the real 60 s to pin the shipped number itself. */
function withSplit<T>(windowMs: number, killerShare: number, fn: () => T): T {
  const w = MUT.assistWindowMs;
  const k = MUT.killerShare;
  MUT.assistWindowMs = windowMs;
  MUT.killerShare = killerShare;
  try {
    return fn();
  } finally {
    MUT.assistWindowMs = w;
    MUT.killerShare = k;
  }
}

function bareWorld(seed = 3): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  w.xpEnabled = false; // isolate kill credit from the passive tick
  w.damageEnabled = true;
  return w;
}

function place(w: World, id: string, x = 0, hull: HullId = 'torpedoBoat', fleet = false): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), fleet ? 'fleet' : 'captain', hull);
  rec.state.x = x;
  rec.state.y = 0;
  rec.state.speed = 0;
  return rec;
}

// Monotonic default for `hit()`'s shell id — the previous `s${damage}`
// default collided whenever two same-damage hits omitted an id.
let nextShellId = 0;

/** Land exactly `damage` on `victim` from `by`, without sinking it. */
function hit(w: World, by: string, victim: ShipRecord, damage: number, id = `s${nextShellId++}`): void {
  w.shells.set(id, {
    id,
    ownerId: by,
    x: victim.state.x - 20,
    y: victim.state.y,
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
  for (let t = 0; t < 8 && w.shells.size > 0; t++) w.step();
}

/** Advance the world by `ms` of quiet. */
function idle(w: World, ms: number): void {
  for (let i = 0; i < Math.ceil(ms / CONFIG.tick.simDtMs); i++) w.step();
}

/** Total XP a ship has banked, in ms — level bank plus the running remainder. */
const totalMs = (s: ShipRecord): number => s.level * XP.levelMs + s.xpMs;
const levels = (s: ShipRecord): number => totalMs(s) / XP.levelMs;

describe('assist split: the shipped dials', () => {
  it('ships ON at the ruled 60 s window and a 1/10 killer share', () => {
    expect(XP.assistWindowMs).toBe(SHIPPED_WINDOW);
    expect(XP.killerShare).toBe(0.1);
  });

  it('OFF (assistWindowMs 0, the harness arm) restores last-hit-takes-all', () => {
    withSplit(0, 0.1, () => {
      const w = bareWorld();
      const a = place(w, 'a', 0);
      const b = place(w, 'b', 300);
      const c = place(w, 'c', 600);
      hit(w, 'c', b, 100); // c softens b up...
      b.hp = 20;
      hit(w, 'a', b, 200, 'kill'); // ...but a lands the kill
      expect(levels(a)).toBeCloseTo(XP.killLevels, 6);
      expect(levels(c)).toBe(0); // no assist economy exists
      expect(b.damageFrom.size).toBe(0); // and no ledger is even maintained
    });
  });
});

describe('assist split: the payout', () => {
  it('still pays a SOLO killer the full value — 1/10 guaranteed plus all of the rest', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0);
    const b = place(w, 'b', 300);
    b.hp = 100;
    hit(w, 'a', b, 100, 'kill');
    // The split only ever moves value to people who actually contributed; with
    // one contributor that is the killer, so nothing is lost.
    expect(levels(a)).toBeCloseTo(XP.killLevels, 6);
  });

  it('splits the remainder BY DAMAGE, killer included — 0.55 / 0.45', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0);
    const b = place(w, 'b', 300);
    const c = place(w, 'c', 600);
    b.hp = 200;
    hit(w, 'c', b, 100, 'assist'); // c: 100 damage
    hit(w, 'a', b, 100, 'kill'); // a: 100 damage AND the kill
    // a = 0.1 guaranteed + half of the remaining 0.9 = 0.55
    // c = half of 0.9                                 = 0.45
    expect(levels(a)).toBeCloseTo(0.55 * XP.killLevels, 6);
    expect(levels(c)).toBeCloseTo(0.45 * XP.killLevels, 6);
    // CONSERVATION: the pot is redistributed, never inflated.
    expect(levels(a) + levels(c)).toBeCloseTo(XP.killLevels, 6);
  });

  it('weights an uneven split proportionally — 0.675 / 0.325', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0);
    const b = place(w, 'b', 300);
    const c = place(w, 'c', 600);
    b.hp = 200;
    hit(w, 'c', b, 150, 'assist'); // c did 75 % of the work
    hit(w, 'a', b, 50, 'kill'); // a did 25 % and landed it
    expect(levels(c)).toBeCloseTo(0.9 * 0.75, 6); // 0.675
    expect(levels(a)).toBeCloseTo(0.1 + 0.9 * 0.25, 6); // 0.325
    expect(levels(a) + levels(c)).toBeCloseTo(XP.killLevels, 6);
  });

  it('conserves the pot across FOUR contributors', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0);
    const b = place(w, 'b', 300);
    const c = place(w, 'c', 600);
    const d = place(w, 'd', 900);
    b.hp = 400;
    hit(w, 'c', b, 100, 'c1');
    hit(w, 'd', b, 200, 'd1');
    hit(w, 'a', b, 100, 'kill');
    expect(levels(a) + levels(c) + levels(d)).toBeCloseTo(XP.killLevels, 6);
    expect(levels(d)).toBeCloseTo(0.9 * 0.5, 6); // half the damage, half the remainder
  });

  it('conservation is millisecond-approximate, not structural', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0);
    const b = place(w, 'b', 300);
    const c = place(w, 'c', 600);
    b.hp = 7; // an awkward ratio: 3/7 and 4/7 of the 0.9 remainder, non-terminating in ms
    hit(w, 'c', b, 3, 'c-part');
    hit(w, 'a', b, 4, 'kill'); // a: 4 damage AND the kill
    const expectedTotalMs = CONFIG.xp.killLevels * XP.levelMs;
    const actualTotalMs = totalMs(a) + totalMs(c);
    // Each share behind this payout rounds independently through grantXp
    // (±0.5ms each) — the killer's guaranteed share, the killer's split
    // share, and the contributor's split share — so conservation holds to
    // ROUNDING, not exactly: within ±1ms per recipient (2 recipients here)
    // of killLevels * levelMs.
    expect(Math.abs(actualTotalMs - expectedTotalMs)).toBeLessThanOrEqual(2);
  });

  it('honours killerShare — at 1.0 the killer takes everything', () => {
    withSplit(SHIPPED_WINDOW, 1, () => {
      const w = bareWorld();
      const a = place(w, 'a', 0);
      const b = place(w, 'b', 300);
      const c = place(w, 'c', 600);
      b.hp = 200;
      hit(w, 'c', b, 100, 'assist');
      hit(w, 'a', b, 100, 'kill');
      expect(levels(a)).toBeCloseTo(XP.killLevels, 6);
      expect(levels(c)).toBe(0);
    });
  });

  it('splits a DRONE victim\'s pot too — the ¼/½/¾ tiers divide like a captain\'s', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0);
    const c = place(w, 'c', 600);
    const d = place(w, 'd', 300, 'droneMedium', true);
    d.hp = 200;
    hit(w, 'c', d, 100, 'assist');
    hit(w, 'a', d, 100, 'kill');
    // The pot is the drone's own tier value (½ a level), split on the same
    // rules. Every measured arm behaved this way (Eric answer A5).
    const pot = XP.droneTierLevels.droneMedium;
    expect(levels(a)).toBeCloseTo(0.55 * pot, 6);
    expect(levels(c)).toBeCloseTo(0.45 * pot, 6);
    expect(levels(a) + levels(c)).toBeCloseTo(pot, 6);
  });
});

describe('assist split: the rolling COUNTER (one dial, three jobs)', () => {
  it('drops an attacker whose last damage fell outside the window', () => {
    withSplit(5000, 0.1, () => {
      const w = bareWorld();
      const a = place(w, 'a', 0);
      const b = place(w, 'b', 300);
      const c = place(w, 'c', 600);
      b.hp = 250;
      hit(w, 'c', b, 100, 'stale'); // c hits early...
      idle(w, 10000); // ...then goes quiet past the window
      hit(w, 'a', b, 150, 'kill');
      // Eric's case: damaged early, never seen again before it sank.
      expect(levels(c)).toBe(0);
      // With c dropped, a is the only contributor and takes the whole pot.
      expect(levels(a)).toBeCloseTo(XP.killLevels, 6);
    });
  });

  it('drops EVERY claim after a lull in all damage — the encounter-lapse case, for free', () => {
    withSplit(5000, 0.1, () => {
      const w = bareWorld();
      const a = place(w, 'a', 0);
      const b = place(w, 'b', 300);
      const c = place(w, 'c', 600);
      const d = place(w, 'd', 900);
      b.hp = 300;
      hit(w, 'c', b, 100, 'old1'); // an old fight, two attackers
      hit(w, 'd', b, 50, 'old2');
      idle(w, 10000); // nobody touches b for longer than the window
      hit(w, 'a', b, 150, 'kill'); // a opens a fresh fight and finishes it
      // With gap = window, "everyone silent for the window" is exactly "every
      // counter individually expired", so the encounter-level wipe needs no
      // separate rule and no separate dial.
      expect(levels(c)).toBe(0);
      expect(levels(d)).toBe(0);
      expect(levels(a)).toBeCloseTo(XP.killLevels, 6);
    });
  });

  it('keeps a LONG fight whole — 3 minutes of continuous trade at the REAL 60 s window', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0);
    const b = place(w, 'b', 300);
    const c = place(w, 'c', 600);
    b.hp = 100000; // survives the trade; made lethal at the end
    hit(w, 'c', b, 100, 'open'); // c OPENS the fight
    // BOTH trade every 30 s for 3 minutes. Each attacker's own gap is 30 s —
    // well inside the 60 s counter — so nobody's tally ever restarts and the
    // opening damage survives the whole fight. This is exactly what a SLIDING
    // window over the same history would have thrown away.
    for (let k = 0; k < 6; k++) {
      idle(w, 30000);
      hit(w, 'a', b, 10, `ta${k}`);
      hit(w, 'c', b, 10, `tc${k}`);
    }
    expect(w.now).toBeGreaterThan(180000);
    b.hp = 100;
    hit(w, 'a', b, 100, 'kill');
    // c: 100 opening + 60 traded = 160. a: 60 traded + 100 kill = 160.
    expect(b.damageFrom.size).toBe(0); // cleared by the sink
    expect(levels(c)).toBeCloseTo(0.9 * 0.5, 6); // its OPENING damage still counts
    expect(levels(a)).toBeCloseTo(0.1 + 0.9 * 0.5, 6);
  });

  it('REJOINING STARTS YOU FRESH — 10, not 210, while the fight rages on', () => {
    withSplit(5000, 0.1, () => {
      const w = bareWorld();
      const a = place(w, 'a', 0);
      const b = place(w, 'b', 300);
      const c = place(w, 'c', 600);
      b.hp = 100000;
      hit(w, 'c', b, 200, 'c-early'); // c does BIG early damage...
      // ...then leaves while a keeps hitting throughout, so the FIGHT never
      // lapses — only c personally does. Someone else keeping it alive does not
      // keep YOUR claim alive.
      for (let k = 0; k < 4; k++) {
        hit(w, 'a', b, 25, `a${k}`);
        idle(w, 2500);
      }
      hit(w, 'c', b, 10, 'c-rejoin');
      expect(b.damageFrom.get('c')!.amount).toBe(10); // the 200 is GONE
      expect(b.damageFrom.get('a')!.amount).toBe(100); // a never lapsed
    });
  });

  it('pays the rejoiner on the FRESH tally only', () => {
    withSplit(5000, 0.1, () => {
      const w = bareWorld();
      const a = place(w, 'a', 0);
      const b = place(w, 'b', 300);
      const c = place(w, 'c', 600);
      b.hp = 100000;
      hit(w, 'c', b, 200, 'c-early');
      for (let k = 0; k < 4; k++) {
        hit(w, 'a', b, 25, `a${k}`);
        idle(w, 2500);
      }
      hit(w, 'c', b, 100, 'c-rejoin'); // c rejoins with 100
      b.hp = 100;
      hit(w, 'a', b, 100, 'kill'); // a total 200, c total 100
      expect(levels(c)).toBeCloseTo(0.9 * (100 / 300), 4); // not 300/500
    });
  });

  it('does NOT restart a contributor who keeps hitting inside the window', () => {
    withSplit(5000, 0.1, () => {
      const w = bareWorld();
      const b = place(w, 'b', 300);
      place(w, 'a', 0);
      b.hp = 100000;
      for (let k = 0; k < 5; k++) {
        hit(w, 'a', b, 20, `h${k}`);
        idle(w, 2000); // well inside the window
      }
      expect(b.damageFrom.get('a')!.amount).toBe(100); // all five hits accumulate
    });
  });

  it('keeps the bucket history BOUNDED however long the fight runs', () => {
    withSplit(5000, 0.1, () => {
      const w = bareWorld();
      const b = place(w, 'b', 300);
      place(w, 'a', 0);
      b.hp = 100000; // never sinks
      for (let i = 0; i < 40; i++) {
        hit(w, 'a', b, 1, `h${i}`);
        idle(w, 600); // under the window, so the tally never restarts
      }
      const rec = b.damageFrom.get('a')!;
      expect(rec.amount).toBe(40); // one unbroken tally
      // 5 s window / 1 s buckets, plus one grace bucket — never 40. The history
      // is encounterSpan.ts's substrate, not a payout input.
      expect(rec.buckets.length).toBeLessThanOrEqual(8);
    });
  });
});

describe('assist split: the edges', () => {
  it('pays ASSISTS on a storm kill, with the killer share unpaid', () => {
    const w = bareWorld();
    const b = place(w, 'b', 300);
    const c = place(w, 'c', 600);
    b.hp = 100;
    hit(w, 'c', b, 60, 'soften');
    w.sinkShip('b'); // by === undefined: the storm has no killer
    // The guaranteed tenth is payment for the RISK OF CLOSING, and nobody took
    // it, so it is burned. NEW VALUE against the shipped game, flagged rather
    // than absorbed: an unattributed sink used to credit nobody at all.
    // Dial-relative rather than a hardcoded 0.9, so a retune of killerShare
    // moves this expectation with it.
    expect(levels(c)).toBeCloseTo((1 - CONFIG.xp.killerShare) * CONFIG.xp.killLevels, 6);
  });

  it('lets claims LAPSE while a hull burns alone — the storm never refreshes a counter', () => {
    withSplit(5000, 0.1, () => {
      const w = bareWorld();
      const b = place(w, 'b', 300);
      const c = place(w, 'c', 600);
      b.hp = 200;
      hit(w, 'c', b, 100, 'chip');
      const at = b.damageFrom.get('c')!.at;
      // Storm damage bypasses creditDamage entirely, so it cannot touch the
      // counter — structural, not a restated rule.
      b.hp -= 50;
      expect(b.damageFrom.get('c')!.at).toBe(at);
      idle(w, 10000); // burning alone, past the window
      w.sinkShip('b');
      expect(levels(c)).toBe(0); // the pot evaporates: nobody was in a fight
    });
  });

  it('excludes a FLEET damager rather than evaporating its share', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0);
    const b = place(w, 'b', 300);
    const d = place(w, 'd', 600, 'droneSmall', true);
    b.hp = 200;
    hit(w, 'd', b, 100, 'drone');
    hit(w, 'a', b, 100, 'kill');
    // The drone's 100 damage is never ledgered at all, so a — the only eligible
    // contributor — takes the whole pot. Counting it would have silently
    // vanished 45 % of this kill's value.
    expect(b.damageFrom.has('d')).toBe(false);
    expect(levels(a)).toBeCloseTo(XP.killLevels, 6);
    expect(levels(d)).toBe(0);
  });

  it('a FLEET killer burns the guaranteed share', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0);
    const c = place(w, 'c', 600);
    const f = place(w, 'f', 900, 'droneSmall', true);
    const b = place(w, 'b', 300);
    b.hp = 300;
    hit(w, 'a', b, 100, 'a-soft'); // a and c soften b up...
    hit(w, 'c', b, 100, 'c-soft');
    hit(w, 'f', b, 100, 'f-kill'); // ...but the fleet hull lands the kill
    // addXpMs fail-closes on fleet hulls, so the guaranteed killerShare tenth
    // simply evaporates here rather than landing on anyone — the humans only
    // ever split the 0.9 remainder, proportionally to their own damage.
    expect(levels(f)).toBe(0);
    expect(levels(a)).toBeCloseTo(0.5 * (1 - CONFIG.xp.killerShare) * CONFIG.xp.killLevels, 6);
    expect(levels(c)).toBeCloseTo(0.5 * (1 - CONFIG.xp.killerShare) * CONFIG.xp.killLevels, 6);
    // No one receives the killer share: the humans' total is exactly the
    // remainder, never the full pot.
    expect(levels(a) + levels(c)).toBeCloseTo((1 - CONFIG.xp.killerShare) * CONFIG.xp.killLevels, 6);
  });

  it("a dead attacker's claim still pays", () => {
    const w = bareWorld();
    const a = place(w, 'a', 0);
    const b = place(w, 'b', 300);
    const k = place(w, 'k', 600);
    b.hp = 200;
    hit(w, 'a', b, 100, 'a-hit'); // a damages b, does not sink it
    w.sinkShip('a'); // a itself dies — mutual destruction
    hit(w, 'k', b, 100, 'k-kill'); // k finishes b off inside the window
    // a's claim still pays despite being dead at payout time: eligibleContributors
    // reads the victim's damage ledger only, never the contributor's own
    // lifecycle — the mutual-destruction kill-credit precedent applied to assists.
    expect(levels(a)).toBeCloseTo(0.5 * (1 - CONFIG.xp.killerShare) * CONFIG.xp.killLevels, 6);
    expect(levels(k)).toBeCloseTo(
      CONFIG.xp.killerShare * CONFIG.xp.killLevels + 0.5 * (1 - CONFIG.xp.killerShare) * CONFIG.xp.killLevels,
      6
    );
  });

  it('does not let OVERKILL inflate a share', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0);
    const b = place(w, 'b', 300);
    const c = place(w, 'c', 600);
    b.hp = 200;
    hit(w, 'c', b, 100, 'assist'); // c: 100 real damage
    b.hp = 100;
    hit(w, 'a', b, 900, 'kill'); // a: 900 nominal, only 100 absorbed
    // If the ledger took the nominal blow, a would hold 900/1000 of the
    // remainder. It takes the clamped figure, so the split is an even 50/50.
    expect(levels(a)).toBeCloseTo(0.1 + 0.45, 6);
    expect(levels(c)).toBeCloseTo(0.45, 6);
    // The RESULTS TALLY still counts the full nominal blow — Eric's ruling was
    // about the economy, not the scoreboard.
    expect(a.damageDealt).toBe(900);
  });

  it('never splits the BOUNTY-HOLDER bonus — that stays whole to the killer', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0);
    const b = place(w, 'b', 300);
    const c = place(w, 'c', 600);
    place(w, 'v', 900);
    w.sinkShip('v', 'b'); // b takes the throne with one captain kill
    const cBefore = levels(c);
    b.hp = 200;
    hit(w, 'c', b, 100, 'assist');
    hit(w, 'a', b, 100, 'kill');
    // a: the +1 bonus WHOLE, plus its 0.55 of the ordinary pot.
    expect(levels(a)).toBeCloseTo(CONFIG.bounty.killLevels + 0.55, 6);
    // c assisted the kill but earns nothing extra for the throne.
    expect(levels(c) - cBefore).toBeCloseTo(0.45, 6);
  });

  it('clears the ledger with the life, so a respawn inherits no contributors', () => {
    const w = bareWorld();
    place(w, 'a', 0);
    const b = place(w, 'b', 300);
    b.hp = 100;
    hit(w, 'a', b, 40, 'chip');
    expect(b.damageFrom.size).toBe(1);
    w.sinkShip('b', 'a');
    expect(b.damageFrom.size).toBe(0);
  });

  it('pays a killer who is on the books for nothing — conservation is structural', () => {
    // `sinkShip(id, by)` is a DIRECTED API and its contract is "an attributed
    // sink credits the killer". Every in-sim damage path ledgers the killing
    // blow, so this state is unreachable from the simulation — but leaving the
    // contract dependent on another method's call order is the hidden coupling
    // the REQUIRED `dealt` parameter exists to forbid at the other seam.
    const w = bareWorld();
    const a = place(w, 'a', 0);
    const b = place(w, 'b', 300);
    w.sinkShip('b', 'a');
    expect(levels(a)).toBeCloseTo(XP.killLevels, 6); // not the bare 0.1
  });
});
