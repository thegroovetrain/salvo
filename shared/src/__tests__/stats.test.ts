// effectiveStats — the server/client desync firewall, Story 2.8 shape:
// effectiveStats(cls, boons = []) — the legacy counts param and the 14-entry
// CONFIG.upgrades stacking DIED with the catalog (FR20; every pin here flipped
// deliberately from the counts-era suite). Properties pinned: (1) zero boons
// is a byte-for-byte identity with the class/CONFIG bases (new promoted
// fields included); (2) boon stat effects stack BY OCCURRENCE in list order;
// (3) doctrine effects fold into the per-weapon mode fields; (4) the
// defensive clamps: sweepRpm ≤ CONFIG.vision.sweepRpmMax (re-homed from the
// deleted CONFIG.upgrades), mine.triggerRadius ≤ blastRadius, gun.barrels
// 1..3; (5) the single-shot gun-pool pin is RETIRED (gun.maxAmmo moves);
// (6) gun/cannon/starShells rangeU are DERIVED from post-fold radarRange —
// an intelRadar stack grows them too (brainstorm 2026-07-30: Intel is a
// stealth offense category), and they are never independently addressable.

import { describe, it, expect } from 'vitest';
import {
  BOON_CATALOG,
  CONFIG,
  SHIP_CLASS_IDS,
  effectiveStats,
  equipmentMaxAmmo,
  equipmentReloadMs,
  resolveBoons,
  type BoonDef,
  type BoonStatPath,
  type EffectiveStats,
} from '../index.js';

const BASE = CONFIG.shipClasses.battleship;

/** A local stat-only test boon (never in the production catalog). */
const boon = (path: BoonStatPath, over: { mult?: number; add?: number }): BoonDef => ({
  id: 't',
  category: 'test',
  rarity: 'common',
  copies: 5,
  effects: [{ kind: 'stat', path, ...over }],
});

/** N occurrences of a production catalog line (the deck's stacking shape). */
const stack = (id: string, n: number): readonly BoonDef[] => resolveBoons(new Array<string>(n).fill(id));

/** Flatten an EffectiveStats tree into dotted-path -> number entries. */
function flatten(stats: EffectiveStats): Map<string, number | string> {
  const out = new Map<string, number | string>();
  const walk = (node: Record<string, unknown>, prefix: string): void => {
    for (const [key, value] of Object.entries(node)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (typeof value === 'number' || typeof value === 'string') out.set(path, value);
      else walk(value as Record<string, unknown>, path);
    }
  };
  walk(stats as unknown as Record<string, unknown>, '');
  return out;
}

describe('effectiveStats — zero-boons identity (per class, new-field bases)', () => {
  it.each(SHIP_CLASS_IDS.map((id) => [id] as const))('%s at zero boons equals its bases', (id) => {
    const cls = CONFIG.shipClasses[id];
    expect(effectiveStats(cls)).toEqual({
      kinematics: { ...cls.kinematics },
      maxHp: cls.hp,
      radarRange: CONFIG.vision.radar,
      sweepRpm: CONFIG.vision.sweepRpm,
      sweepPeriodMs: 60000 / CONFIG.vision.sweepRpm,
      sightRange: CONFIG.vision.sight,
      cooldownScale: 1, // the global cooldown lever is a true no-op at base
      gun: {
        reloadMs: CONFIG.gun.reloadMs,
        maxAmmo: CONFIG.gun.maxAmmo,
        rangeU: CONFIG.vision.radar, // range = radar range (Eric 2026-07-21)
        damage: CONFIG.gun.damage,
        contactDamage: CONFIG.gun.contactDamage,
        burstRadius: CONFIG.gun.burstRadius,
        barrels: 1,
      },
      torpedo: {
        reloadMs: CONFIG.torpedo.reloadMs,
        maxAmmo: CONFIG.torpedo.maxAmmo,
        speed: CONFIG.torpedo.speed,
        damage: CONFIG.torpedo.damage,
        mode: 'standard',
      },
      mine: {
        reloadMs: CONFIG.mine.reloadMs,
        maxAmmo: CONFIG.mine.maxAmmo,
        maxLive: CONFIG.mine.maxLive,
        damage: CONFIG.mine.damage,
        blastRadius: CONFIG.mine.blastRadius,
        triggerRadius: CONFIG.mine.triggerRadius,
        mode: 'standard',
      },
      boost: {
        speedBonus: CONFIG.speedBoost.speedBonus,
        durationMs: CONFIG.speedBoost.durationMs,
        maxAmmo: CONFIG.speedBoost.maxAmmo,
        reloadMs: CONFIG.speedBoost.reloadMs,
      },
      cannon: {
        reloadMs: CONFIG.cannon.reloadMs,
        maxAmmo: CONFIG.cannon.maxAmmo,
        rangeU: CONFIG.vision.radar,
        damage: CONFIG.cannon.damage,
        contactDamage: CONFIG.cannon.contactDamage,
        burstRadius: CONFIG.cannon.burstRadius,
        mode: 'standard',
      },
      starShells: {
        reloadMs: CONFIG.starShells.reloadMs,
        maxAmmo: CONFIG.starShells.maxAmmo,
        rangeU: CONFIG.vision.radar,
        litRadius: CONFIG.starShells.litRadius, // the ratified SIGHT/2 derivation
        litDurationMs: CONFIG.starShells.litDurationMs,
        mode: 'standard',
      },
      decoyBuoy: {
        reloadMs: CONFIG.decoyBuoy.reloadMs,
        maxAmmo: CONFIG.decoyBuoy.maxAmmo,
        durationMs: CONFIG.decoyBuoy.durationMs,
      },
    });
  });

  it('the base radar sweep is 15 rpm = exactly 4000 ms per revolution', () => {
    const s = effectiveStats(BASE);
    expect(s.sweepRpm).toBe(15);
    expect(s.sweepPeriodMs).toBe(4000);
  });

  it('the signature is (cls, boons?): omitted, [], and explicit-default calls are byte-identical', () => {
    expect(effectiveStats(BASE)).toEqual(effectiveStats(BASE, []));
  });
});

describe('effectiveStats — boon stacking BY OCCURRENCE (the deck copy law)', () => {
  it('N repeats of a mult line compound: base × mult^N', () => {
    const s3 = effectiveStats(BASE, stack('intelRadar', 3));
    expect(s3.radarRange).toBeCloseTo(CONFIG.vision.radar * 1.15 ** 3, 9);
  });

  it('intelRadar stacks ALSO grow gun/cannon/starShells rangeU — Intel is a stealth offense category (brainstorm 2026-07-30)', () => {
    const s5 = effectiveStats(BASE, stack('intelRadar', 5));
    const grown = CONFIG.vision.radar * 1.15 ** 5;
    expect(s5.radarRange).toBeCloseTo(grown, 9);
    expect(s5.gun.rangeU).toBe(s5.radarRange);
    expect(s5.cannon.rangeU).toBe(s5.radarRange);
    expect(s5.starShells.rangeU).toBe(s5.radarRange);
    expect(s5.gun.rangeU).toBeCloseTo(grown, 9);
  });

  it('N repeats of an add line stack linearly (shipHull +20/card)', () => {
    for (const n of [1, 3, 5]) {
      expect(effectiveStats(BASE, stack('shipHull', n)).maxHp).toBe(BASE.hp + 20 * n);
    }
  });

  it('torpedoSpeed is the RATIFIED +5/card ladder: 60 → 80 at the 4-copy cap', () => {
    expect(effectiveStats(BASE, stack('torpedoSpeed', 4)).torpedo.speed).toBe(80);
    expect(CONFIG.torpedo.speed).toBe(60);
  });

  it('shipSpeed scales maxSpeed AND reverseSpeed by the same factor (reverse rides along)', () => {
    const s = effectiveStats(BASE, stack('shipSpeed', 2));
    const f = 1.05 ** 2;
    expect(s.kinematics.maxSpeed).toBeCloseTo(BASE.kinematics.maxSpeed * f, 9);
    expect(s.kinematics.reverseSpeed).toBeCloseTo(BASE.kinematics.reverseSpeed * f, 9);
    expect(s.kinematics.accel).toBe(BASE.kinematics.accel); // accel/turn untouched
    expect(s.kinematics.turnRate).toBe(BASE.kinematics.turnRate);
  });

  it('boon-list order is load-bearing and deterministic (mult-then-add ≠ add-then-mult)', () => {
    const mult = boon('maxHp', { mult: 2 });
    const add = boon('maxHp', { add: 30 });
    expect(effectiveStats(BASE, [mult, add]).maxHp).toBe(BASE.hp * 2 + 30);
    expect(effectiveStats(BASE, [add, mult]).maxHp).toBe((BASE.hp + 30) * 2);
    expect(effectiveStats(BASE, [mult, add])).toEqual(effectiveStats(BASE, [mult, add]));
  });
});

describe('effectiveStats — the single-shot gun-pool pin is RETIRED (Story 2.8)', () => {
  // FLIPPED PIN: the counts-era suite pinned gun.maxAmmo to 1 against any
  // stack (gunAmmo neutralized). The AFT TURRET line now legitimately raises
  // the pool — whitelist + stats unpinned KNOWINGLY.
  it('gunTurret raises the gun pool 1 → 2', () => {
    expect(effectiveStats(BASE).gun.maxAmmo).toBe(1);
    expect(effectiveStats(BASE, stack('gunTurret', 1)).gun.maxAmmo).toBe(2);
  });

  it('gunBarrel raises barrels 1 → 2 → 3 (TWIN → TRIPLE MOUNT)', () => {
    expect(effectiveStats(BASE, stack('gunBarrel', 1)).gun.barrels).toBe(2);
    expect(effectiveStats(BASE, stack('gunBarrel', 2)).gun.barrels).toBe(3);
  });
});

describe('effectiveStats — doctrine mode folds', () => {
  it('every weapon defaults to standard; each doctrine card sets exactly its mode', () => {
    const base = effectiveStats(BASE);
    expect([base.cannon.mode, base.torpedo.mode, base.mine.mode, base.starShells.mode]).toEqual([
      'standard',
      'standard',
      'standard',
      'standard',
    ]);
    expect(effectiveStats(BASE, stack('cannonArcing', 1)).cannon.mode).toBe('arcing');
    expect(effectiveStats(BASE, stack('cannonAp', 1)).cannon.mode).toBe('ap');
    expect(effectiveStats(BASE, stack('torpedoHoming', 1)).torpedo.mode).toBe('homing');
    expect(effectiveStats(BASE, stack('torpedoCommand', 1)).torpedo.mode).toBe('command');
    expect(effectiveStats(BASE, stack('mineSelfPropelled', 1)).mine.mode).toBe('selfPropelled');
    expect(effectiveStats(BASE, stack('starIncendiary', 1)).starShells.mode).toBe('incendiary');
    expect(effectiveStats(BASE, stack('starDazzle', 1)).starShells.mode).toBe('dazzle');
  });

  it('a doctrine card moves ONLY its mode field (flatten diff)', () => {
    const identity = flatten(effectiveStats(BASE));
    const arcing = flatten(effectiveStats(BASE, stack('cannonArcing', 1)));
    expect([...arcing.keys()]).toEqual([...identity.keys()]);
    const changed = [...arcing.keys()].filter((k) => arcing.get(k) !== identity.get(k));
    expect(changed).toEqual(['cannon.mode']);
  });

  it('minePropFouling sets the mode AND trades damage down (its bundled stat effect)', () => {
    const s = effectiveStats(BASE, stack('minePropFouling', 1));
    expect(s.mine.mode).toBe('propFouling');
    expect(s.mine.damage).toBeCloseTo(CONFIG.mine.damage * 0.6, 9);
  });

  it('stat stacks apply under either doctrine (amendment 44): swap keeps the ladders', () => {
    const homingBuild = resolveBoons(['torpedoDamage', 'torpedoDamage', 'torpedoHoming']);
    const commandBuild = resolveBoons(['torpedoDamage', 'torpedoDamage', 'torpedoCommand']);
    expect(effectiveStats(BASE, homingBuild).torpedo.damage).toBe(CONFIG.torpedo.damage + 4);
    expect(effectiveStats(BASE, commandBuild).torpedo.damage).toBe(CONFIG.torpedo.damage + 4);
  });

  it('an unknown doctrine weapon/mode in an untyped def is a fail-closed no-op', () => {
    const rogue = {
      id: 'rogue',
      category: 'test',
      rarity: 'exclusive',
      copies: 1,
      effects: [
        { kind: 'doctrine', weapon: 'gun', mode: 'arcing' }, // gun has no mode field
        { kind: 'doctrine', weapon: 'cannon', mode: 'nuclear' }, // unknown mode
      ],
    } as unknown as BoonDef;
    expect(effectiveStats(BASE, [rogue])).toEqual(effectiveStats(BASE));
  });
});

describe('effectiveStats — defensive clamps', () => {
  it('sweepRpm is capped at CONFIG.vision.sweepRpmMax (the re-homed ratified ceiling)', () => {
    expect(CONFIG.vision.sweepRpmMax).toBe(30);
    const capped = effectiveStats(BASE, stack('intelSweep', 5));
    expect(capped.sweepRpm).toBe(30); // 15 + 5×3 exactly at the cap
    expect(capped.sweepPeriodMs).toBe(2000);
    // Past the physical copy cap (test-only over-stack): still clamped.
    const over = effectiveStats(BASE, stack('intelSweep', 20));
    expect(over.sweepRpm).toBe(30);
    expect(over.sweepPeriodMs).toBe(2000);
  });

  it('mine.triggerRadius is clamped to blastRadius (fuze stacks past casing stacks)', () => {
    // 5 trigger stacks alone: 32 × 1.1^5 ≈ 51.5 > blast 48 → clamped to 48.
    const s = effectiveStats(BASE, stack('mineTrigger', 5));
    expect(s.mine.triggerRadius).toBe(s.mine.blastRadius);
    // With blast stacks too, the trigger may grow up to the (bigger) blast.
    const both = effectiveStats(BASE, resolveBoons(['mineTrigger', 'mineTrigger', 'mineTrigger', 'mineTrigger', 'mineTrigger', 'mineBlast', 'mineBlast']));
    expect(both.mine.triggerRadius).toBeLessThanOrEqual(both.mine.blastRadius);
    expect(both.mine.triggerRadius).toBeGreaterThan(CONFIG.mine.triggerRadius);
  });

  it('gun.barrels is clamped to 1..3 integer (untyped over/under-stack data)', () => {
    const over = { ...boon('gun.barrels', { add: 10 }), id: 'over' };
    expect(effectiveStats(BASE, [over]).gun.barrels).toBe(3);
    // A sub-1 fold is already rejected by the positive-scalar gate (mult 0.1
    // → 0.1 is positive but the clamp floors it to 1).
    const under = { ...boon('gun.barrels', { mult: 0.1 }), id: 'under' };
    expect(effectiveStats(BASE, [under]).gun.barrels).toBe(1);
  });
});

describe('effectiveStats — every production catalog line folds (no dead cards)', () => {
  it('each non-acquisition line moves the stats tree; acquisitions leave it byte-identical', () => {
    const identity = flatten(effectiveStats(BASE));
    for (const [id, def] of Object.entries(BOON_CATALOG)) {
      const folded = flatten(effectiveStats(BASE, resolveBoons([id])));
      const isAcquisition = def.effects.some((e) => e.kind === 'slotFill');
      if (isAcquisition) expect(folded, id).toEqual(identity);
      else expect(folded, id).not.toEqual(identity);
    }
  });
});

// ---------------------------------------------------------------------------
// cooldownScale — THE one global cooldown lever (Eric rulings 2026-08-04).
// The seven per-equipment reload ladders died; `shipCooldown` (ship, common,
// ×4) drives a single base-1.0 scalar ADDITIVELY (-0.1/card) that clampStats
// multiplies into all seven equipment reloads, once, post-fold.
// ---------------------------------------------------------------------------

/** The seven equipment reloads, paired with their CONFIG bases. */
const RELOADS = [
  ['gun', (s: EffectiveStats) => s.gun.reloadMs, CONFIG.gun.reloadMs],
  ['cannon', (s: EffectiveStats) => s.cannon.reloadMs, CONFIG.cannon.reloadMs],
  ['torpedo', (s: EffectiveStats) => s.torpedo.reloadMs, CONFIG.torpedo.reloadMs],
  ['mine', (s: EffectiveStats) => s.mine.reloadMs, CONFIG.mine.reloadMs],
  ['starShells', (s: EffectiveStats) => s.starShells.reloadMs, CONFIG.starShells.reloadMs],
  ['boost', (s: EffectiveStats) => s.boost.reloadMs, CONFIG.speedBoost.reloadMs],
  ['decoyBuoy', (s: EffectiveStats) => s.decoyBuoy.reloadMs, CONFIG.decoyBuoy.reloadMs],
] as const;

describe('cooldownScale — the ONE global cooldown lever (Eric ruling 2026-08-04)', () => {
  it('the retuned CONFIG bases are the ruling: gun 5000 ms, cannon 50000 ms', () => {
    expect(CONFIG.gun.reloadMs).toBe(5000);
    expect(CONFIG.cannon.reloadMs).toBe(50000);
  });

  it('zero boons: scale is exactly 1 and EVERY reload is REFERENCE-EXACT to its CONFIG base (a true no-op)', () => {
    for (const id of SHIP_CLASS_IDS) {
      const s = effectiveStats(CONFIG.shipClasses[id]);
      expect(s.cooldownScale, id).toBe(1);
      // Strict equality, not toBeCloseTo: x * 1.0 === x is the whole point.
      for (const [name, read, base] of RELOADS) expect(read(s), `${id}:${name}`).toBe(base);
    }
  });

  it('ONE stack: scale 0.9 — gun 4500, cannon 45000', () => {
    const s = effectiveStats(BASE, stack('shipCooldown', 1));
    expect(s.cooldownScale).toBeCloseTo(0.9, 12);
    expect(s.gun.reloadMs).toBeCloseTo(4500, 9);
    expect(s.cannon.reloadMs).toBeCloseTo(45000, 9);
  });

  it('FULL stack (4 copies, the cap): scale 0.6 — ADDITIVE, not 0.9^4', () => {
    expect(BOON_CATALOG.shipCooldown.copies).toBe(4); // the physical cap the pin rests on
    const s = effectiveStats(BASE, stack('shipCooldown', 4));
    // STRICT equality: additive folding accumulates float dust
    // (1 - 0.1*4 === 0.6000000000000001, not 0.6) — clampStats rounds the
    // scale to 3 decimals BEFORE the multiplies precisely so this is exact,
    // not merely close. See the tick-count test below for why dust mattered.
    expect(s.cooldownScale).toBe(0.6);
    // ANTI-MULTIPLICATIVE PIN: 0.9^4 = 0.6561 would land gun at 3280.5 ms and
    // cannon at 32805 ms — Eric's targets are 3000 / 30000 exactly.
    expect(s.cooldownScale).not.toBeCloseTo(0.9 ** 4, 3);
    expect(s.gun.reloadMs).toBe(3000);
    expect(s.cannon.reloadMs).toBe(30000);
    expect(s.gun.reloadMs).not.toBeCloseTo(3280.5, 3);
    expect(s.cannon.reloadMs).not.toBeCloseTo(32805, 3);
    // ALL SEVEN move — one card, every cooldown.
    const expected: Record<string, number> = {
      gun: 3000,
      cannon: 30000,
      torpedo: 7200,
      mine: 4800,
      starShells: 12000,
      boost: 10800,
      decoyBuoy: 12000,
    };
    for (const [name, read] of RELOADS) expect(read(s), name).toBe(expected[name]);
  });

  it('EVERY reachable stack count (0..4) lands EXACTLY on the ruled table — the rounding-fix regression pin', () => {
    // scale + all seven equipment reloads, per stack count. This fails without
    // clampStats rounding the accumulated scale before the multiplies (a
    // 4-stack would otherwise land at cooldownScale 0.6000000000000001, gun
    // 3000.0000000000005, cannon 30000.000000000004 — all off the ruled
    // numbers by float dust).
    const table: Record<number, { scale: number } & Record<string, number>> = {
      0: { scale: 1, gun: 5000, cannon: 50000, torpedo: 12000, mine: 8000, starShells: 20000, boost: 18000, decoyBuoy: 20000 },
      1: { scale: 0.9, gun: 4500, cannon: 45000, torpedo: 10800, mine: 7200, starShells: 18000, boost: 16200, decoyBuoy: 18000 },
      2: { scale: 0.8, gun: 4000, cannon: 40000, torpedo: 9600, mine: 6400, starShells: 16000, boost: 14400, decoyBuoy: 16000 },
      3: { scale: 0.7, gun: 3500, cannon: 35000, torpedo: 8400, mine: 5600, starShells: 14000, boost: 12600, decoyBuoy: 14000 },
      4: { scale: 0.6, gun: 3000, cannon: 30000, torpedo: 7200, mine: 4800, starShells: 12000, boost: 10800, decoyBuoy: 12000 },
    };
    for (const [n, expected] of Object.entries(table)) {
      const s = effectiveStats(BASE, stack('shipCooldown', Number(n)));
      expect(s.cooldownScale, `${n} stacks: scale`).toBe(expected.scale);
      for (const [name, read] of RELOADS) expect(read(s), `${n} stacks: ${name}`).toBe(expected[name]);
    }
    // The ruling itself, as strict multiplication identities.
    const full = effectiveStats(BASE, stack('shipCooldown', 4));
    expect(5000 * full.cooldownScale === 3000).toBe(true);
    expect(50000 * full.cooldownScale === 30000).toBe(true);
  });

  it('the tick-count consequence: ammo.ts ticks reloads down in 50ms steps and refills at <= 0 — a 4-stack gun must take EXACTLY 60 ticks (not 61), a 4-stack cannon EXACTLY 600 (not 601)', () => {
    // Inlined ammo.ts loop shape (server/src/game/equipment/ammo.ts) — do not
    // import server code into a shared test.
    const ticksToRefill = (reloadMs: number): number => {
      let left = reloadMs;
      let n = 0;
      while (left > 0) {
        left -= 50;
        n++;
      }
      return n;
    };
    const s = effectiveStats(BASE, stack('shipCooldown', 4));
    expect(ticksToRefill(s.gun.reloadMs)).toBe(60);
    expect(ticksToRefill(s.cannon.reloadMs)).toBe(600);
  });

  it('the scale reaches EVERY equipment: no reload is left at its base after a full stack', () => {
    const s = effectiveStats(BASE, stack('shipCooldown', 4));
    for (const [name, read, base] of RELOADS) {
      expect(read(s), name).toBeLessThan(base);
      expect(read(s), name).toBeCloseTo(base * 0.6, 9);
    }
  });

  it('OVER-STACK (defensive): floored at 0.1 — never zero, negative, or non-finite', () => {
    for (const n of [10, 15, 50]) {
      const s = effectiveStats(BASE, stack('shipCooldown', n));
      expect(s.cooldownScale, `${n} stacks`).toBe(0.1);
      for (const [name, read, base] of RELOADS) {
        const v = read(s);
        expect(Number.isFinite(v), `${n}:${name}`).toBe(true);
        expect(v, `${n}:${name}`).toBeGreaterThan(0);
        expect(v, `${n}:${name}`).toBeCloseTo(base * 0.1, 9);
      }
    }
  });

  it('a hand-built over-stack of raw defs floors identically (no catalog copy cap in the way)', () => {
    const raw = new Array<BoonDef>(12).fill(boon('cooldownScale', { add: -0.1 }));
    const s = effectiveStats(BASE, raw);
    expect(s.cooldownScale).toBe(0.1);
    expect(s.gun.reloadMs).toBeCloseTo(CONFIG.gun.reloadMs * 0.1, 9);
  });

  it('the scale moves ONLY the seven reloads (flatten diff) — no other stat rides along', () => {
    const identity = flatten(effectiveStats(BASE));
    const scaled = flatten(effectiveStats(BASE, stack('shipCooldown', 4)));
    const changed = [...scaled.keys()].filter((k) => scaled.get(k) !== identity.get(k));
    expect(changed.sort()).toEqual(
      [
        'boost.reloadMs',
        'cannon.reloadMs',
        'cooldownScale',
        'decoyBuoy.reloadMs',
        'gun.reloadMs',
        'mine.reloadMs',
        'starShells.reloadMs',
        'torpedo.reloadMs',
      ].sort(),
    );
  });
});

describe('equipment helpers', () => {
  it('equipmentMaxAmmo / equipmentReloadMs look up the per-equipment effective values', () => {
    const s = effectiveStats(BASE, stack('shipCooldown', 1));
    expect(equipmentMaxAmmo(s, 'gun')).toBe(s.gun.maxAmmo);
    expect(equipmentMaxAmmo(s, 'torpedo')).toBe(s.torpedo.maxAmmo);
    expect(equipmentMaxAmmo(s, 'mine')).toBe(s.mine.maxAmmo);
    expect(equipmentMaxAmmo(s, 'speedBoost')).toBe(s.boost.maxAmmo);
    expect(equipmentMaxAmmo(s, 'decoyBuoy')).toBe(s.decoyBuoy.maxAmmo);
    expect(equipmentReloadMs(s, 'gun')).toBe(s.gun.reloadMs);
    expect(equipmentReloadMs(s, 'torpedo')).toBe(s.torpedo.reloadMs);
    expect(equipmentReloadMs(s, 'mine')).toBe(s.mine.reloadMs);
    expect(equipmentReloadMs(s, 'speedBoost')).toBe(s.boost.reloadMs);
    expect(equipmentReloadMs(s, 'decoyBuoy')).toBe(s.decoyBuoy.reloadMs);
    // ONE shipCooldown stack scales EVERY lookup, not just one weapon's.
    expect(equipmentReloadMs(s, 'mine')).toBeCloseTo(CONFIG.mine.reloadMs * 0.9, 9);
    expect(equipmentReloadMs(s, 'gun')).toBeCloseTo(CONFIG.gun.reloadMs * 0.9, 9);
  });

  it('the legacy upgrade vocabulary is GONE: no CONFIG.upgrades block survives', () => {
    expect('upgrades' in CONFIG).toBe(false);
  });
});
