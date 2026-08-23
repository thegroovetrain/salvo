// THE SPLIT KILL BOUNTY (CONFIG.xp.assistWindowMs / killerShare) — Eric's
// assist economy, 2026-08-22: "The killer gets 1/10 of a level, and the
// remaining 9/10 are split proportionally between everyone who dealt damage to
// that ship that contributed to the kill", with a recency window so stale
// damage cannot claim a share.
//
// THE PROPERTY THAT MATTERS MOST IS CONSERVATION. This mechanism REDISTRIBUTES
// a fixed pot rather than minting XP per point of damage, which is precisely
// what keeps it from running away the way damage->XP does (one bot reached 187
// levels at 1/100). So the tests pin the total paid out, not just each share.
//
// `xpEnabled = false` in every case: it gates the PASSIVE tick but explicitly
// NOT kill credit, so it isolates exactly the payout under test.

import { describe, it, expect } from 'vitest';
import { CONFIG, type HullId } from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';

const XP = CONFIG.xp;
const MUT = CONFIG.xp as { assistWindowMs: number; killerShare: number; assistEnvWeight: number };

function withSplit<T>(windowMs: number, killerShare: number, fn: () => T, envWeight = 0): T {
  const w = MUT.assistWindowMs;
  const k = MUT.killerShare;
  const e = MUT.assistEnvWeight;
  MUT.assistWindowMs = windowMs;
  MUT.killerShare = killerShare;
  MUT.assistEnvWeight = envWeight;
  try {
    return fn();
  } finally {
    MUT.assistWindowMs = w;
    MUT.killerShare = k;
    MUT.assistEnvWeight = e;
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

/** Land exactly `damage` on `victim` from `by`, without sinking it. */
function hit(w: World, by: string, victim: ShipRecord, damage: number, id = `s${Math.floor(damage)}`): void {
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

/** Total XP a ship has banked, in ms — level bank plus the running remainder. */
const totalMs = (s: ShipRecord): number => s.level * XP.levelMs + s.xpMs;
const levels = (s: ShipRecord): number => totalMs(s) / XP.levelMs;

describe('split bounty: OFF is the shipped game', () => {
  it('pays the killer the whole kill value at the shipped default', () => {
    expect(CONFIG.xp.assistWindowMs).toBe(0);
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

describe('split bounty: ON', () => {
  it('still pays a SOLO killer the full value — 1/10 guaranteed plus all of the rest', () => {
    withSplit(30000, 0.1, () => {
      const w = bareWorld();
      const a = place(w, 'a', 0);
      const b = place(w, 'b', 300);
      b.hp = 100;
      hit(w, 'a', b, 100, 'kill');
      // The split only ever moves value to people who actually contributed;
      // with one contributor that is the killer, so nothing is lost.
      expect(levels(a)).toBeCloseTo(XP.killLevels, 6);
    });
  });

  it('splits the remainder BY DAMAGE, killer included', () => {
    withSplit(30000, 0.1, () => {
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
  });

  it('weights an uneven split proportionally', () => {
    withSplit(30000, 0.1, () => {
      const w = bareWorld();
      const a = place(w, 'a', 0);
      const b = place(w, 'b', 300);
      const c = place(w, 'c', 600);
      b.hp = 200;
      hit(w, 'c', b, 150, 'assist'); // c did 75% of the work
      hit(w, 'a', b, 50, 'kill'); // a did 25% and landed it
      expect(levels(c)).toBeCloseTo(0.9 * 0.75, 6);
      expect(levels(a)).toBeCloseTo(0.1 + 0.9 * 0.25, 6);
      expect(levels(a) + levels(c)).toBeCloseTo(XP.killLevels, 6);
    });
  });

  it('honours killerShare — at 1.0 the killer takes everything', () => {
    withSplit(30000, 1, () => {
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
});

describe('split bounty: the contribution WINDOW', () => {
  it('excludes an attacker whose last damage fell outside it', () => {
    withSplit(5000, 0.1, () => {
      const w = bareWorld();
      const a = place(w, 'a', 0);
      const b = place(w, 'b', 300);
      const c = place(w, 'c', 600);
      b.hp = 250;
      hit(w, 'c', b, 100, 'stale'); // c hits early...
      for (let i = 0; i < 200; i++) w.step(); // ...then 10 s pass
      hit(w, 'a', b, 150, 'kill');
      // Eric's case: damaged early, never seen again before it sank.
      expect(levels(c)).toBe(0);
      // With c excluded, a is the only contributor and takes the whole pot.
      expect(levels(a)).toBeCloseTo(XP.killLevels, 6);
    });
  });

  it('includes an attacker who damaged early but returned inside the window', () => {
    withSplit(5000, 0.1, () => {
      const w = bareWorld();
      const a = place(w, 'a', 0);
      const b = place(w, 'b', 300);
      const c = place(w, 'c', 600);
      b.hp = 250;
      hit(w, 'c', b, 90, 'early');
      for (let i = 0; i < 200; i++) w.step();
      hit(w, 'c', b, 10, 'late'); // c comes back — last damage is now recent
      hit(w, 'a', b, 150, 'kill');
      // THE RECENCY GATE IS PER ATTACKER, so c brings its WHOLE 100 damage,
      // not just the 10 dealt inside the window. That is Eric's wording and a
      // deliberate fork — see splitAssists.
      expect(levels(c)).toBeCloseTo(0.9 * (100 / 250), 6);
    });
  });
});

describe('split bounty: the edges', () => {
  it('pays ASSISTS on a storm kill even though no killer share is paid', () => {
    withSplit(30000, 0.1, () => {
      const w = bareWorld();
      const b = place(w, 'b', 300);
      const c = place(w, 'c', 600);
      b.hp = 100;
      hit(w, 'c', b, 60, 'soften');
      w.sinkShip('b'); // by === undefined: the storm has no killer
      // NEW VALUE vs the shipped game, flagged rather than absorbed: an
      // unattributed sink used to credit nobody at all.
      expect(levels(c)).toBeCloseTo(0.9, 6);
    });
  });

  it('excludes a FLEET damager rather than evaporating its share', () => {
    withSplit(30000, 0.1, () => {
      const w = bareWorld();
      const a = place(w, 'a', 0);
      const b = place(w, 'b', 300);
      const d = place(w, 'd', 600, 'droneSmall', true);
      b.hp = 200;
      hit(w, 'd', b, 100, 'drone');
      hit(w, 'a', b, 100, 'kill');
      // The drone's 100 damage is not counted at all, so a — the only eligible
      // contributor — takes the whole pot. Counting it would have silently
      // vanished 45% of this kill's value.
      expect(levels(a)).toBeCloseTo(XP.killLevels, 6);
      expect(levels(d)).toBe(0);
    });
  });

  it('does not let OVERKILL inflate a share', () => {
    withSplit(30000, 0.1, () => {
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
    });
  });

  it('never splits the BOUNTY-HOLDER bonus — that stays whole to the killer', () => {
    withSplit(30000, 0.1, () => {
      const w = bareWorld();
      const a = place(w, 'a', 0);
      const b = place(w, 'b', 300);
      const c = place(w, 'c', 600);
      const v = place(w, 'v', 900);
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
  });

  it('clears the ledger with the life, so a respawn inherits no contributors', () => {
    withSplit(30000, 0.1, () => {
      const w = bareWorld();
      const a = place(w, 'a', 0);
      const b = place(w, 'b', 300);
      b.hp = 100;
      hit(w, 'a', b, 40, 'chip');
      expect(b.damageFrom.size).toBe(1);
      w.sinkShip('b', 'a');
      expect(b.damageFrom.size).toBe(0);
    });
  });
});

describe('split bounty: ENVIRONMENT dilution (storm + fleet, one rule)', () => {
  it('ships at 0 — environment is free, which is what the first split arms measured', () => {
    expect(CONFIG.xp.assistEnvWeight).toBe(0);
  });

  it('at weight 0 a FLEET damager does not dilute the pot', () => {
    withSplit(30000, 0.1, () => {
      const w = bareWorld();
      const a = place(w, 'a', 0);
      const b = place(w, 'b', 300);
      const d = place(w, 'd', 600, 'droneSmall', true);
      b.hp = 200;
      hit(w, 'd', b, 100, 'drone');
      hit(w, 'a', b, 100, 'kill');
      expect(levels(a)).toBeCloseTo(XP.killLevels, 6);
    });
  });

  it('at weight 1 a FLEET damager dilutes exactly like a player would', () => {
    withSplit(
      30000,
      0.1,
      () => {
        const w = bareWorld();
        const a = place(w, 'a', 0);
        const b = place(w, 'b', 300);
        const d = place(w, 'd', 600, 'droneSmall', true);
        b.hp = 200;
        hit(w, 'd', b, 100, 'drone'); // environment did half the work
        hit(w, 'a', b, 100, 'kill'); // a did the other half
        // a keeps its guaranteed 0.1, but the assist pot pays only the half
        // the players actually removed: 0.9 x 0.5 = 0.45.
        expect(levels(a)).toBeCloseTo(0.1 + 0.45, 6);
      },
      1,
    );
  });

  it('at weight 1 a GRAZE finished by the storm pays a graze, not a whole kill', () => {
    withSplit(
      30000,
      0.1,
      () => {
        const w = bareWorld();
        const b = place(w, 'b', 300);
        const c = place(w, 'c', 600);
        b.hp = 250;
        hit(w, 'c', b, 10, 'graze'); // c chips 10...
        b.envDamage += 240; // ...the storm takes the other 240
        w.sinkShip('b'); // unattributed: no killer share is paid
        // 0.9 x (10 / 250) = 0.036, not the whole 0.9 the un-diluted rule pays.
        expect(levels(c)).toBeCloseTo(0.9 * (10 / 250), 4);
      },
      1,
    );
  });

  it('takes a PARTIAL weight — Eric\'s "to some extent" is the interesting middle', () => {
    withSplit(
      30000,
      0.1,
      () => {
        const w = bareWorld();
        const b = place(w, 'b', 300);
        const c = place(w, 'c', 600);
        b.hp = 200;
        hit(w, 'c', b, 100, 'half');
        b.envDamage += 100;
        w.sinkShip('b');
        // env counts at half weight: 100 / (100 + 50) = 2/3 of the pot.
        expect(levels(c)).toBeCloseTo(0.9 * (100 / 150), 4);
      },
      0.5,
    );
  });
});
