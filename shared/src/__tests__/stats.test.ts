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

/** Flatten an EffectiveStats tree into dotted-path -> scalar entries.
 *  BOOLEANS ARE LEAVES TOO since Story 7-5 wave 1 — the doctrine verb flags
 *  live there, and a walker that skipped them would recurse INTO a boolean,
 *  find no entries, and silently report a verb card as a dead card. */
function flatten(stats: EffectiveStats): Map<string, number | string | boolean> {
  const out = new Map<string, number | string | boolean>();
  const walk = (node: Record<string, unknown>, prefix: string): void => {
    for (const [key, value] of Object.entries(node)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') out.set(path, value);
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
        homing: false,
      },
      mine: {
        reloadMs: CONFIG.mine.reloadMs,
        maxAmmo: CONFIG.mine.maxAmmo,
        maxLive: CONFIG.mine.maxLive,
        damage: CONFIG.mine.damage,
        blastRadius: CONFIG.mine.blastRadius,
        triggerRadius: CONFIG.mine.triggerRadius,
        propFouling: false,
        selfPropelled: false,
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
        phosphor: false,
        dazzle: false,
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
    // `mineBlast` is the surviving multiplicative ladder — `intelRange` carried
    // this pin until Story 7-5 wave 1 made it ADDITIVE (+50 u/card).
    const s3 = effectiveStats(BASE, stack('mineBlast', 3));
    expect(s3.mine.blastRadius).toBeCloseTo(CONFIG.mine.blastRadius * 1.1 ** 3, 9);
  });

  it('intelRange stacks ALSO grow gun/cannon/starShells rangeU — Intel is a stealth offense category (brainstorm 2026-07-30)', () => {
    const s4 = effectiveStats(BASE, stack('intelRange', 4)); // ×4 copies
    // ADDITIVE since Story 7-5 wave 1 (Eric: "+50 units to intel range"); the
    // cycle-92 merged line was ×1.15 compounding, which topped out at ~1154 u.
    const grown = CONFIG.vision.radar + 50 * 4;
    expect(s4.radarRange).toBeCloseTo(grown, 9);
    expect(s4.gun.rangeU).toBe(s4.radarRange);
    expect(s4.cannon.rangeU).toBe(s4.radarRange);
    expect(s4.starShells.rangeU).toBe(s4.radarRange);
    expect(s4.gun.rangeU).toBeCloseTo(grown, 9);
  });

  // THE MERGE'S WHOLE POINT (Eric rulings 2026-08-16). Truesight is the 4/8 rung
  // of intel range: it is DERIVED, not stat-addressable, so ONE card moves the
  // whole ladder and the ordering holds by arithmetic at every stack level.
  it('intelRange drives truesight too — sightRange is DERIVED as radarRange/2 at every stack', () => {
    for (let n = 0; n <= 4; n++) {
      const s = effectiveStats(BASE, stack('intelRange', n));
      expect(s.sightRange).toBeCloseTo(s.radarRange / 2, 9);
    }
    // Zero boons is byte-identical to the pre-merge base, because radar IS SIGHT*2.
    expect(effectiveStats(BASE, []).sightRange).toBe(CONFIG.vision.sight);
  });

  it('the eighths ladder ordering now holds by ARITHMETIC at every stack level', () => {
    for (let n = 0; n <= 4; n++) {
      const s = effectiveStats(BASE, stack('intelRange', n));
      const detect = s.sightRange * CONFIG.vision.detectFactor;
      const muzzle = s.radarRange * CONFIG.vision.muzzleFlashFactor;
      const farRadar = s.radarRange * 0.875;
      expect(detect).toBeLessThan(s.sightRange);
      expect(s.sightRange).toBeLessThan(muzzle);
      expect(muzzle).toBeLessThan(farRadar);
      expect(farRadar).toBeLessThan(s.radarRange);
    }
  });

  it('N repeats of an add line stack linearly (shipHull +25/card)', () => {
    for (const n of [1, 3, 4]) {
      expect(effectiveStats(BASE, stack('shipHull', n)).maxHp).toBe(BASE.hp + 25 * n);
    }
    expect(BOON_CATALOG.shipHull.copies).toBe(4); // Story 7-5 wave 1: ×5 → ×4, +20 → +25
  });

  it('torpedoSpeed is the RATIFIED +5/card ladder: 60 → 80 at the 4-copy cap', () => {
    expect(effectiveStats(BASE, stack('torpedoSpeed', 4)).torpedo.speed).toBe(80);
    expect(CONFIG.torpedo.speed).toBe(60);
  });

  // FLIPPED PIN (Story 7-5 wave 1). This test used to assert the OPPOSITE:
  // that shipSpeed scaled maxSpeed AND reverseSpeed by the same ×1.05 factor,
  // so the reverse:forward ratio survived the ladder. Eric's card is now
  // ADDITIVE (+2.5 u/s, "increases ship top speed by this amount"), and NO
  // constant `add` can preserve that ratio across three hulls — a flat +2.5 on
  // reverse would be +111% on the battleship against +29% on its top speed. So
  // reverse is not addressed by any card at all, and this pins that on purpose.
  it('shipSpeed adds to maxSpeed ONLY — reverseSpeed is deliberately untouched', () => {
    for (const n of [1, 2, 4]) {
      const s = effectiveStats(BASE, stack('shipSpeed', n));
      expect(s.kinematics.maxSpeed).toBeCloseTo(BASE.kinematics.maxSpeed + 2.5 * n, 9);
      expect(s.kinematics.reverseSpeed).toBe(BASE.kinematics.reverseSpeed);
    }
    const s = effectiveStats(BASE, stack('shipSpeed', 2));
    expect(s.kinematics.accel).toBe(BASE.kinematics.accel); // accel/turn untouched
    expect(s.kinematics.turnRate).toBe(BASE.kinematics.turnRate);
    expect(BOON_CATALOG.shipSpeed.copies).toBe(4);
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

// ---------------------------------------------------------------------------
// DOCTRINE FOLDS — REWRITTEN FOR THE VERB-FLAG MODEL (Story 7-5 wave 1).
// The old suite pinned four single-valued `mode` enums and, by construction,
// could only ever express ONE doctrine per weapon. Eric's rewrite stacks verbs
// (PHOSPHOR beside DAZZLE, PROP-FOULING beside SELF-PROPELLED), so torpedo /
// mine / starShells now carry one INDEPENDENT BOOLEAN PER VERB and the pins
// below are about COMPOSITION, which is the property that did not exist
// before. `cannon.mode` keeps its enum and keeps its old pins verbatim.
// ---------------------------------------------------------------------------
describe('effectiveStats — doctrine verb folds', () => {
  it('every verb is false at base and the cannon enum is standard; each card sets exactly its own', () => {
    const base = effectiveStats(BASE);
    expect(base.cannon.mode).toBe('standard');
    expect([base.torpedo.homing, base.mine.propFouling, base.mine.selfPropelled, base.starShells.phosphor, base.starShells.dazzle])
      .toEqual([false, false, false, false, false]);
    expect(effectiveStats(BASE, stack('cannonArcing', 1)).cannon.mode).toBe('arcing');
    expect(effectiveStats(BASE, stack('cannonAp', 1)).cannon.mode).toBe('ap');
    expect(effectiveStats(BASE, stack('torpedoHoming', 1)).torpedo.homing).toBe(true);
    expect(effectiveStats(BASE, stack('mineSelfPropelled', 1)).mine.selfPropelled).toBe(true);
    expect(effectiveStats(BASE, stack('minePropFouling', 1)).mine.propFouling).toBe(true);
    // The card id is still `starIncendiary` — a display rename is not an id
    // rename (project law) — but the VERB it sets is `phosphor`.
    expect(effectiveStats(BASE, stack('starIncendiary', 1)).starShells.phosphor).toBe(true);
    expect(effectiveStats(BASE, stack('starDazzle', 1)).starShells.dazzle).toBe(true);
  });

  // THE PROPERTY THE ENUM COULD NOT HOLD, and the reason wave 1 exists: under
  // the old `mode` field the second card granted silently erased the first.
  it('VERBS STACK: both star-shell verbs and both mine verbs compose on one weapon', () => {
    const bothStar = effectiveStats(BASE, resolveBoons(['starIncendiary', 'starDazzle']));
    expect([bothStar.starShells.phosphor, bothStar.starShells.dazzle]).toEqual([true, true]);
    // ...and in the other pick order, since neither erases the other.
    const reversed = effectiveStats(BASE, resolveBoons(['starDazzle', 'starIncendiary']));
    expect([reversed.starShells.phosphor, reversed.starShells.dazzle]).toEqual([true, true]);
    const bothMine = effectiveStats(BASE, resolveBoons(['minePropFouling', 'mineSelfPropelled']));
    expect([bothMine.mine.propFouling, bothMine.mine.selfPropelled]).toEqual([true, true]);
  });

  it('one verb card sets ONE flag and leaves its sibling alone', () => {
    const dazzleOnly = effectiveStats(BASE, stack('starDazzle', 1));
    expect([dazzleOnly.starShells.phosphor, dazzleOnly.starShells.dazzle]).toEqual([false, true]);
    const foulOnly = effectiveStats(BASE, stack('minePropFouling', 1));
    expect([foulOnly.mine.propFouling, foulOnly.mine.selfPropelled]).toEqual([true, false]);
  });

  it('a doctrine card moves ONLY its own doctrine field (flatten diff)', () => {
    const identity = flatten(effectiveStats(BASE));
    const arcing = flatten(effectiveStats(BASE, stack('cannonArcing', 1)));
    expect([...arcing.keys()]).toEqual([...identity.keys()]);
    expect([...arcing.keys()].filter((k) => arcing.get(k) !== identity.get(k))).toEqual(['cannon.mode']);
    const dazzle = flatten(effectiveStats(BASE, stack('starDazzle', 1)));
    expect([...dazzle.keys()].filter((k) => dazzle.get(k) !== identity.get(k))).toEqual(['starShells.dazzle']);
  });

  // The ×0.6 damage trade was DELETED (Eric ruling 2026-08-16), and wave 1
  // deleted `mineDamage` outright, so `mine.damage` now has NO writer at all.
  // The pick-order test this pin used to sit beside is RETIRED with that card:
  // with zero writers of the path, order cannot matter by construction.
  it('minePropFouling sets its verb and does NOT touch damage', () => {
    const s = effectiveStats(BASE, stack('minePropFouling', 1));
    expect(s.mine.propFouling).toBe(true);
    expect(s.mine.damage).toBe(CONFIG.mine.damage);
    // No card writes mine.damage any more — every build lands on the base.
    const heavy = effectiveStats(BASE, resolveBoons(['minePropFouling', 'mineSelfPropelled', 'mineBlast', 'mineBlast']));
    expect(heavy.mine.damage).toBe(CONFIG.mine.damage);
  });

  it('stat stacks apply alongside a doctrine verb (amendment 44): the ladders survive', () => {
    const homingBuild = resolveBoons(['torpedoSpeed', 'torpedoSpeed', 'torpedoHoming']);
    const plainBuild = resolveBoons(['torpedoSpeed', 'torpedoSpeed']);
    expect(effectiveStats(BASE, homingBuild).torpedo.speed).toBe(CONFIG.torpedo.speed + 10);
    expect(effectiveStats(BASE, homingBuild).torpedo.speed).toBe(effectiveStats(BASE, plainBuild).torpedo.speed);
    expect(effectiveStats(BASE, homingBuild).torpedo.homing).toBe(true);
  });

  it('an unknown doctrine weapon/verb in an untyped def is a fail-closed no-op', () => {
    const rogue = {
      id: 'rogue',
      category: 'test',
      rarity: 'rare',
      copies: 1,
      effects: [
        { kind: 'doctrine', weapon: 'gun', mode: 'arcing' }, // gun carries no doctrine state
        { kind: 'doctrine', weapon: 'cannon', mode: 'nuclear' }, // unknown cannon mode
        { kind: 'doctrine', weapon: 'starShells', mode: 'incendiary' }, // the RETIRED verb name
        { kind: 'doctrine', weapon: 'torpedo', mode: 'command' }, // COMMAND DETONATION is deleted
        { kind: 'doctrine', weapon: 'starShells', mode: 'litRadius' }, // a real field, NOT a verb
      ],
    } as unknown as BoonDef;
    // The DOCTRINE_MODES membership test is what makes the dynamic field write
    // safe — only a declared verb name can reach the stats tree, so neither a
    // retired verb nor an arbitrary field name moves anything.
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

  // DERIVED, NOT CLAMPED (Eric ruling 2026-08-16). The old
  // `min(trigger, blastRadius)` clamp is retired: it kept the invariant, but by
  // silently eating ~75% of the 5th trigger card whenever no blast card was
  // held. A fixed fraction of the ceiling can never cross the ceiling.
  it('mine.triggerRadius is DERIVED from blastRadius at every stack, and one card moves both', () => {
    const base = effectiveStats(BASE, []);
    // Byte-identical to the old base: 48 × 2/3 = 32 exactly.
    expect(base.mine.triggerRadius).toBe(CONFIG.mine.triggerRadius);
    for (let n = 0; n <= 5; n++) {
      const s = effectiveStats(BASE, stack('mineBlast', n));
      expect(s.mine.triggerRadius).toBeCloseTo(s.mine.blastRadius * CONFIG.mine.triggerFactor, 9);
      expect(s.mine.triggerRadius).toBeLessThan(s.mine.blastRadius); // the invariant, now structural
    }
    // ONE card grows BOTH rings — the whole point of the merge.
    const five = effectiveStats(BASE, stack('mineBlast', 5));
    expect(five.mine.blastRadius).toBeGreaterThan(base.mine.blastRadius);
    expect(five.mine.triggerRadius).toBeGreaterThan(base.mine.triggerRadius);
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
// ×5) drives a single base-1.0 scalar ADDITIVELY (-0.1/card) that clampStats
// multiplies into all seven equipment reloads, once, post-fold. The ladder was
// widened 4 → 5 copies (0.6 → 0.5 at the cap) by a later Eric ruling the same
// day: 2.5s on the gun feels genuinely fast next to 3s, so a full cooldown
// investment is a real reward.
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
  it('the retuned CONFIG bases are the ruling: gun 5000 ms, cannon 45000 ms', () => {
    expect(CONFIG.gun.reloadMs).toBe(5000);
    // 15000 -> 50000 (the global-cooldown cycle) -> 45000 (the weapon balance
    // pass): both Eric rulings, 2026-08-04.
    expect(CONFIG.cannon.reloadMs).toBe(45000);
  });

  it('zero boons: scale is exactly 1 and EVERY reload is REFERENCE-EXACT to its CONFIG base (a true no-op)', () => {
    for (const id of SHIP_CLASS_IDS) {
      const s = effectiveStats(CONFIG.shipClasses[id]);
      expect(s.cooldownScale, id).toBe(1);
      // Strict equality, not toBeCloseTo: x * 1.0 === x is the whole point.
      for (const [name, read, base] of RELOADS) expect(read(s), `${id}:${name}`).toBe(base);
    }
  });

  it('ONE stack: scale 0.9 — gun 4500, cannon 40500', () => {
    const s = effectiveStats(BASE, stack('shipCooldown', 1));
    expect(s.cooldownScale).toBeCloseTo(0.9, 12);
    expect(s.gun.reloadMs).toBeCloseTo(4500, 9);
    expect(s.cannon.reloadMs).toBeCloseTo(40500, 9);
  });

  it('THE COPY CAP IS 5 and a full stack is EXACTLY 0.5 — the ×5 / 50% ruling pin (Eric 2026-08-04)', () => {
    // The ruling this test exists for: the ladder runs five cards, not four,
    // so the cap is a 50% global cooldown cut. Strict equality on both halves
    // — copies is the physical cap, 0.5 is the number it buys.
    expect(BOON_CATALOG.shipCooldown.copies).toBe(5);
    expect(effectiveStats(BASE, stack('shipCooldown', 5)).cooldownScale).toBe(0.5);
  });

  it('FULL stack (5 copies, the cap): scale 0.5 — ADDITIVE, not 0.9^5', () => {
    const s = effectiveStats(BASE, stack('shipCooldown', BOON_CATALOG.shipCooldown.copies));
    // STRICT equality: additive folding accumulates float dust
    // (1 - 0.1*5 === 0.5000000000000001, not 0.5) — clampStats rounds the
    // scale to 3 decimals BEFORE the multiplies precisely so this is exact,
    // not merely close. See the tick-count test below for why dust mattered.
    expect(s.cooldownScale).toBe(0.5);
    // ANTI-MULTIPLICATIVE PIN: 0.9^5 = 0.59049 would land gun at 2952.45 ms
    // and cannon at 26572.05 ms — Eric's targets are 2500 / 22500 exactly.
    expect(s.cooldownScale).not.toBeCloseTo(0.9 ** 5, 3);
    expect(s.gun.reloadMs).toBe(2500);
    expect(s.cannon.reloadMs).toBe(22500);
    expect(s.gun.reloadMs).not.toBeCloseTo(2952.45, 3);
    expect(s.cannon.reloadMs).not.toBeCloseTo(26572.05, 3);
    // ALL SEVEN move — one card, every cooldown. Torpedo/mine/cannon bases
    // retuned 2026-08-04 (weapon balance pass): 30000 / 15000 / 45000.
    const expected: Record<string, number> = {
      gun: 2500,
      cannon: 22500,
      torpedo: 15000,
      mine: 7500,
      starShells: 10000,
      boost: 9000,
      decoyBuoy: 10000,
    };
    for (const [name, read] of RELOADS) expect(read(s), name).toBe(expected[name]);
  });

  it('FOUR stacks (one short of the cap, still a reachable state): scale 0.6 — gun 3000, cannon 27000', () => {
    const s = effectiveStats(BASE, stack('shipCooldown', 4));
    expect(s.cooldownScale).toBe(0.6);
    expect(s.cooldownScale).not.toBeCloseTo(0.9 ** 4, 3); // 0.6561 would be 3280.5 / 29524.5
    expect(s.gun.reloadMs).toBe(3000);
    expect(s.cannon.reloadMs).toBe(27000);
    const expected: Record<string, number> = {
      gun: 3000,
      cannon: 27000,
      torpedo: 18000,
      mine: 9000,
      starShells: 12000,
      boost: 10800,
      decoyBuoy: 12000,
    };
    for (const [name, read] of RELOADS) expect(read(s), name).toBe(expected[name]);
  });

  it('EVERY reachable stack count (0..5) lands EXACTLY on the ruled table — the rounding-fix regression pin', () => {
    // scale + all seven equipment reloads, per stack count. This fails without
    // clampStats rounding the accumulated scale before the multiplies (a
    // 5-stack would otherwise land at cooldownScale 0.5000000000000001, gun
    // 2500.0000000000005, cannon 22500.000000000004 — all off the ruled
    // numbers by float dust).
    //
    // Bases retuned 2026-08-04 (weapon balance pass): cannon 50000 -> 45000,
    // torpedo 12000 -> 30000, mine 8000 -> 15000.
    //
    // ONE cell carries IEEE754 dust that the scale rounding CANNOT remove:
    // 45000 * 0.7 is 31499.999999999996, not 31500 — the product of two exactly
    // representable-enough operands simply is not the decimal we would write.
    // It is pinned STRICTLY to the double it actually is (never loosened to a
    // tolerance, which would let the scale-rounding regression back in), and
    // the tick-count test below proves the dust is behaviorally inert: it still
    // refills in 630 ticks, exactly as a clean 31500 would.
    const table: Record<number, { scale: number } & Record<string, number>> = {
      0: { scale: 1, gun: 5000, cannon: 45000, torpedo: 30000, mine: 15000, starShells: 20000, boost: 18000, decoyBuoy: 20000 },
      1: { scale: 0.9, gun: 4500, cannon: 40500, torpedo: 27000, mine: 13500, starShells: 18000, boost: 16200, decoyBuoy: 18000 },
      2: { scale: 0.8, gun: 4000, cannon: 36000, torpedo: 24000, mine: 12000, starShells: 16000, boost: 14400, decoyBuoy: 16000 },
      3: { scale: 0.7, gun: 3500, cannon: 31499.999999999996, torpedo: 21000, mine: 10500, starShells: 14000, boost: 12600, decoyBuoy: 14000 },
      4: { scale: 0.6, gun: 3000, cannon: 27000, torpedo: 18000, mine: 9000, starShells: 12000, boost: 10800, decoyBuoy: 12000 },
      5: { scale: 0.5, gun: 2500, cannon: 22500, torpedo: 15000, mine: 7500, starShells: 10000, boost: 9000, decoyBuoy: 10000 },
    };
    // The table IS the whole reachable ladder — no stack count is untested.
    expect(Object.keys(table)).toHaveLength(BOON_CATALOG.shipCooldown.copies + 1);
    for (const [n, expected] of Object.entries(table)) {
      const s = effectiveStats(BASE, stack('shipCooldown', Number(n)));
      expect(s.cooldownScale, `${n} stacks: scale`).toBe(expected.scale);
      for (const [name, read] of RELOADS) expect(read(s), `${n} stacks: ${name}`).toBe(expected[name]);
    }
    // The ruling itself, as strict multiplication identities.
    const full = effectiveStats(BASE, stack('shipCooldown', 5));
    expect(5000 * full.cooldownScale === 2500).toBe(true);
    expect(45000 * full.cooldownScale === 22500).toBe(true);
  });

  it('the tick-count consequence: ammo.ts ticks reloads down in 50ms steps and refills at <= 0 — a 5-stack gun must take EXACTLY 50 ticks (not 51) and cannon 450 (not 451); a 4-stack 60 / 540', () => {
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
    const capped = effectiveStats(BASE, stack('shipCooldown', 5));
    expect(ticksToRefill(capped.gun.reloadMs)).toBe(50);
    expect(ticksToRefill(capped.cannon.reloadMs)).toBe(450);
    const four = effectiveStats(BASE, stack('shipCooldown', 4));
    expect(ticksToRefill(four.gun.reloadMs)).toBe(60);
    expect(ticksToRefill(four.cannon.reloadMs)).toBe(540);
    // The 3-stack cannon is the one cell where 45000 * 0.7 leaves IEEE754 dust
    // (31499.999999999996). This is the assertion that says the dust is
    // BEHAVIOURALLY INERT: it refills in the same 630 ticks a clean 31500 would.
    const three = effectiveStats(BASE, stack('shipCooldown', 3));
    expect(ticksToRefill(three.cannon.reloadMs)).toBe(630);
    expect(ticksToRefill(31500)).toBe(630);
  });

  it('the scale reaches EVERY equipment: no reload is left at its base after a full stack', () => {
    const s = effectiveStats(BASE, stack('shipCooldown', 5));
    for (const [name, read, base] of RELOADS) {
      expect(read(s), name).toBeLessThan(base);
      expect(read(s), name).toBeCloseTo(base * 0.5, 9);
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
    const scaled = flatten(effectiveStats(BASE, stack('shipCooldown', 5)));
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
