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
// (6) gun/broadside/starShells rangeU are DERIVED from post-fold radarRange —
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
        captive: false,
      },
      boost: {
        speedBonus: CONFIG.speedBoost.speedBonus,
        durationMs: CONFIG.speedBoost.durationMs,
        maxAmmo: CONFIG.speedBoost.maxAmmo,
        reloadMs: CONFIG.speedBoost.reloadMs,
      },
      broadside: {
        reloadMs: CONFIG.broadside.reloadMs,
        maxAmmo: CONFIG.broadside.maxAmmo,
        // THE 5/8 RUNG, not the horizon — the only weapon that does not reach
        // full radar range (Eric: "limited to 5/8"). 412.5u at base.
        rangeU: CONFIG.vision.radar * CONFIG.vision.muzzleFlashFactor,
        damage: CONFIG.broadside.damage,
        burstRadius: CONFIG.broadside.burstRadius,
        turrets: CONFIG.broadside.turrets,
        spreadRung: 1,
        traverseRad: (CONFIG.broadside.traverseDeg[0] * Math.PI) / 180,
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
      radarBuoy: {
        reloadMs: CONFIG.radarBuoy.reloadMs,
        maxAmmo: CONFIG.radarBuoy.maxAmmo,
        durationMs: CONFIG.radarBuoy.durationMs,
        radarRange: CONFIG.radarBuoy.radarRange,
        sweepRpm: CONFIG.radarBuoy.sweepRpm,
        hp: CONFIG.radarBuoy.hp,
        gunDamage: CONFIG.radarBuoy.gunDamage,
        gunReloadMs: CONFIG.radarBuoy.gunReloadMs,
        gun: false,
        jamming: false,
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
    // `mineBlast` is the surviving multiplicative ladder — the intel-range line
    // carried this pin until Story 7-5 wave 1 made it additive, and Eric's
    // 2026-08-20 ruling deleted it outright.
    const s3 = effectiveStats(BASE, stack('mineBlast', 3));
    expect(s3.mine.blastRadius).toBeCloseTo(CONFIG.mine.blastRadius * 1.1 ** 3, 9);
  });

  // THE INTEL-RANGE STACKING TEST IS RETIRED (Eric ruling 2026-08-20): its
  // SUBJECT was the card, and no card writes `radarRange` any more. What the
  // card used to prove — that gun/starShells rangeU IS radarRange and the
  // broadside is one rung short of it — is still pinned, at the base level,
  // by the two tests below.
  it('gun/starShells rangeU IS radarRange; nothing in the catalog moves it', () => {
    const s = effectiveStats(BASE);
    expect(s.radarRange).toBe(CONFIG.vision.radar);
    expect(s.gun.rangeU).toBe(s.radarRange);
    expect(s.starShells.rangeU).toBe(s.radarRange);
    const writers = Object.values(BOON_CATALOG).filter((d) =>
      d.effects.some((e) => e.kind === 'stat' && e.path === 'radarRange'),
    );
    expect(writers.map((d) => d.id)).toEqual([]);
  });

  // THE BROADSIDE'S TWO DERIVED FIELDS (Story 7-5 wave 2). Both are re-pinned
  // post-fold in clampStats AND applyBoonStats, exactly as the rangeU siblings
  // are, and neither is stat-addressable.
  it('broadside rangeU is the 5/8 rung of radarRange; the SPREAD ladder is read off the rung', () => {
    const base = effectiveStats(BASE);
    expect(base.broadside.rangeU).toBeCloseTo(base.radarRange * CONFIG.vision.muzzleFlashFactor, 9);
    expect(base.broadside.rangeU).toBeCloseTo(412.5, 9); // the ratified base
    expect(base.broadside.rangeU).toBeLessThan(base.radarRange);
    // 0..4 SPREAD copies walk the authored traverse ladder 34 -> 40 -> 46 -> 52 -> 58.
    for (let n = 0; n <= 4; n++) {
      const s = effectiveStats(BASE, stack('broadsideSpread', n));
      expect(s.broadside.spreadRung, `${n} copies`).toBe(n + 1);
      expect(s.broadside.traverseRad, `${n} copies`).toBeCloseTo((CONFIG.broadside.traverseDeg[n] * Math.PI) / 180, 12);
    }
    // Over-stacking past the physical copy cap CLAMPS rather than running off
    // the table (the gun.barrels precedent) — a hostile boon list cannot NaN it.
    const over = effectiveStats(BASE, stack('broadsideSpread', 9));
    expect(over.broadside.spreadRung).toBe(CONFIG.broadside.traverseDeg.length);
    expect(Number.isFinite(over.broadside.traverseRad)).toBe(true);
  });

  it('broadsideTurrets adds a shell per card, 3 -> 5, and moves nothing else', () => {
    expect(effectiveStats(BASE).broadside.turrets).toBe(3);
    expect(effectiveStats(BASE, stack('broadsideTurrets', 2)).broadside.turrets).toBe(5);
  });

  it('buoyDuration moves the BUOY life only, and its x4 ceiling EXACTLY meets the reload', () => {
    // R2.20 (Eric): the buoy card is DURATION, not sweep. +2.5s per copy off a
    // 20s base. The ceiling is load-bearing rather than incidental: at x4 the
    // buoy lives exactly as long as its own reload, so a maxed build has
    // CONTINUOUS coverage while a bare one leaves a ~10s gap. If either number
    // moves, that "the ladder closes the gap it started with" reading breaks.
    const buoy = effectiveStats(BASE, stack('buoyDuration', 4));
    expect(buoy.radarBuoy.durationMs).toBeCloseTo(CONFIG.radarBuoy.durationMs + 2500 * 4, 9); // 20s -> 30s
    expect(buoy.radarBuoy.durationMs).toBe(CONFIG.radarBuoy.reloadMs); // the gap closes EXACTLY
    expect(effectiveStats(BASE).radarBuoy.durationMs).toBeLessThan(CONFIG.radarBuoy.reloadMs); // ...and is open at base
    // The buoy's SWEEP now has NO card behind it — fixed at the CONFIG value at
    // every build, and the ship's own intelSweep still never reaches it.
    expect(buoy.radarBuoy.sweepRpm).toBe(CONFIG.radarBuoy.sweepRpm);
    const ship = effectiveStats(BASE, stack('intelSweep', 5));
    expect(ship.radarBuoy.sweepRpm).toBe(CONFIG.radarBuoy.sweepRpm);
    // The buoy's radar set is FLAT at the CONFIG value.
    expect(effectiveStats(BASE).radarBuoy.radarRange).toBe(CONFIG.radarBuoy.radarRange);
  });

  // CAPTIVE MINES (Story 7-5 wave 2, R2.12): trigger and blast SWAP, then the
  // trigger triples. Both outputs are linear in the ONE folded blast radius, so
  // the MINES ladder applies on top and CARD ORDER CANNOT MATTER.
  it('mineCaptive swaps the rings and triples the trip — 144u/32u at base, 210.8u/46.9u at ×4', () => {
    const plain = effectiveStats(BASE);
    expect([plain.mine.triggerRadius, plain.mine.blastRadius]).toEqual([32, 48]);
    const captive = effectiveStats(BASE, stack('mineCaptive', 1));
    expect(captive.mine.triggerRadius).toBeCloseTo(144, 9);
    expect(captive.mine.blastRadius).toBeCloseTo(32, 9);
    const stacked4 = effectiveStats(BASE, resolveBoons(['mineCaptive', 'mineBlast', 'mineBlast', 'mineBlast', 'mineBlast']));
    expect(stacked4.mine.triggerRadius).toBeCloseTo(48 * 1.1 ** 4 * 3, 6); // ~210.8
    expect(stacked4.mine.blastRadius).toBeCloseTo((48 * 1.1 ** 4 * 2) / 3, 6); // ~46.9
  });

  it('CARD ORDER CANNOT MATTER: the captive verb before or after the MINES ladder is byte-identical', () => {
    const before = effectiveStats(BASE, resolveBoons(['mineCaptive', 'mineBlast', 'mineBlast']));
    const after = effectiveStats(BASE, resolveBoons(['mineBlast', 'mineCaptive', 'mineBlast']));
    const last = effectiveStats(BASE, resolveBoons(['mineBlast', 'mineBlast', 'mineCaptive']));
    expect(after).toEqual(before);
    expect(last).toEqual(before);
  });

  // THE MERGE'S WHOLE POINT (Eric rulings 2026-08-16). Truesight is the 4/8 rung
  // of intel range: DERIVED, never stat-addressable, so there is ONE derivation
  // of the ladder rather than two. The "at every stack level" loops that used to
  // ride the intel-range card are RETIRED with it (Eric 2026-08-20) — nothing
  // writes `radarRange`, so the ladder resolves to its base for every observer
  // and these pins hold it there.
  it('sightRange is DERIVED as radarRange/2, never stat-addressable', () => {
    const s = effectiveStats(BASE);
    expect(s.sightRange).toBeCloseTo(s.radarRange / 2, 9);
    expect(s.sightRange).toBe(CONFIG.vision.sight); // radar IS SIGHT*2
  });

  it('the eighths ladder ordering holds by ARITHMETIC off the one number', () => {
    const s = effectiveStats(BASE);
    const detect = s.sightRange * CONFIG.vision.detectFactor;
    const muzzle = s.radarRange * CONFIG.vision.muzzleFlashFactor;
    const farRadar = s.radarRange * 0.875;
    expect(detect).toBeLessThan(s.sightRange);
    expect(s.sightRange).toBeLessThan(muzzle);
    expect(muzzle).toBeLessThan(farRadar);
    expect(farRadar).toBeLessThan(s.radarRange);
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
// (PHOSPHOR beside DAZZLE, PROP-FOULING beside CAPTIVE), so every weapon now
// carries one INDEPENDENT BOOLEAN PER VERB and the pins below are about
// COMPOSITION, which is the property that did not exist before. Story 7-5
// wave 2 removed the last enum with the cannon, so there is no `mode` field
// left anywhere and the fold has no special cases.
// ---------------------------------------------------------------------------
describe('effectiveStats — doctrine verb folds', () => {
  it('every verb is false at base; each card sets exactly its own', () => {
    const base = effectiveStats(BASE);
    expect([base.torpedo.homing, base.mine.propFouling, base.mine.captive, base.starShells.phosphor, base.starShells.dazzle,
      base.radarBuoy.gun, base.radarBuoy.jamming]).toEqual([false, false, false, false, false, false, false]);
    expect(effectiveStats(BASE, stack('torpedoHoming', 1)).torpedo.homing).toBe(true);
    expect(effectiveStats(BASE, stack('mineCaptive', 1)).mine.captive).toBe(true);
    expect(effectiveStats(BASE, stack('buoyGun', 1)).radarBuoy.gun).toBe(true);
    expect(effectiveStats(BASE, stack('buoyJamming', 1)).radarBuoy.jamming).toBe(true);
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
    // CAPTIVE beside PROP-FOULING is Eric's own A1 ruling — the captive mine's
    // torpedo carries the foul with it.
    const bothMine = effectiveStats(BASE, resolveBoons(['minePropFouling', 'mineCaptive']));
    expect([bothMine.mine.propFouling, bothMine.mine.captive]).toEqual([true, true]);
    const bothBuoy = effectiveStats(BASE, resolveBoons(['buoyGun', 'buoyJamming']));
    expect([bothBuoy.radarBuoy.gun, bothBuoy.radarBuoy.jamming]).toEqual([true, true]);
  });

  it('one verb card sets ONE flag and leaves its sibling alone', () => {
    const dazzleOnly = effectiveStats(BASE, stack('starDazzle', 1));
    expect([dazzleOnly.starShells.phosphor, dazzleOnly.starShells.dazzle]).toEqual([false, true]);
    const foulOnly = effectiveStats(BASE, stack('minePropFouling', 1));
    expect([foulOnly.mine.propFouling, foulOnly.mine.captive]).toEqual([true, false]);
  });

  it('a doctrine card moves ONLY its own doctrine field (flatten diff)', () => {
    const identity = flatten(effectiveStats(BASE));
    const buoyGun = flatten(effectiveStats(BASE, stack('buoyGun', 1)));
    expect([...buoyGun.keys()]).toEqual([...identity.keys()]);
    expect([...buoyGun.keys()].filter((k) => buoyGun.get(k) !== identity.get(k))).toEqual(['radarBuoy.gun']);
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
    const heavy = effectiveStats(BASE, resolveBoons(['minePropFouling', 'mineCaptive', 'mineBlast', 'mineBlast']));
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
        { kind: 'doctrine', weapon: 'cannon', mode: 'ap' }, // the DELETED weapon
        { kind: 'doctrine', weapon: 'mine', mode: 'selfPropelled' }, // the DELETED verb
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
  ['broadside', (s: EffectiveStats) => s.broadside.reloadMs, CONFIG.broadside.reloadMs],
  ['torpedo', (s: EffectiveStats) => s.torpedo.reloadMs, CONFIG.torpedo.reloadMs],
  ['mine', (s: EffectiveStats) => s.mine.reloadMs, CONFIG.mine.reloadMs],
  ['starShells', (s: EffectiveStats) => s.starShells.reloadMs, CONFIG.starShells.reloadMs],
  ['boost', (s: EffectiveStats) => s.boost.reloadMs, CONFIG.speedBoost.reloadMs],
  ['radarBuoy', (s: EffectiveStats) => s.radarBuoy.reloadMs, CONFIG.radarBuoy.reloadMs],
] as const;

describe('cooldownScale — the ONE global cooldown lever (Eric ruling 2026-08-04)', () => {
  it('the retuned CONFIG bases are the ruling: gun 5000 ms, broadside 30000 ms', () => {
    expect(CONFIG.gun.reloadMs).toBe(5000);
    // The cannon's 45000 (15000 -> 50000 -> 45000, Eric 2026-08-04) left with
    // the weapon; the BROADSIDE BARRAGE replacing it is 30000 by Eric's own
    // wave-2 words: *"lets set the cooldown to 30 seconds"*. A max shipCooldown
    // build lands it at 15s.
    expect(CONFIG.broadside.reloadMs).toBe(30000);
  });

  it('zero boons: scale is exactly 1 and EVERY reload is REFERENCE-EXACT to its CONFIG base (a true no-op)', () => {
    for (const id of SHIP_CLASS_IDS) {
      const s = effectiveStats(CONFIG.shipClasses[id]);
      expect(s.cooldownScale, id).toBe(1);
      // Strict equality, not toBeCloseTo: x * 1.0 === x is the whole point.
      for (const [name, read, base] of RELOADS) expect(read(s), `${id}:${name}`).toBe(base);
    }
  });

  it('ONE stack: scale 0.9 — gun 4500, broadside 27000', () => {
    const s = effectiveStats(BASE, stack('shipCooldown', 1));
    expect(s.cooldownScale).toBeCloseTo(0.9, 12);
    expect(s.gun.reloadMs).toBeCloseTo(4500, 9);
    expect(s.broadside.reloadMs).toBeCloseTo(27000, 9);
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
    // and the broadside at 17714.7 ms — the targets are 2500 / 15000 exactly.
    expect(s.cooldownScale).not.toBeCloseTo(0.9 ** 5, 3);
    expect(s.gun.reloadMs).toBe(2500);
    expect(s.broadside.reloadMs).toBe(15000);
    expect(s.gun.reloadMs).not.toBeCloseTo(2952.45, 3);
    expect(s.broadside.reloadMs).not.toBeCloseTo(17714.7, 3);
    // ALL SEVEN move — one card, every cooldown.
    const expected: Record<string, number> = {
      gun: 2500,
      broadside: 15000,
      torpedo: 15000,
      mine: 7500,
      starShells: 10000,
      boost: 9000,
      radarBuoy: 15000,
    };
    for (const [name, read] of RELOADS) expect(read(s), name).toBe(expected[name]);
  });

  it('FOUR stacks (one short of the cap, still a reachable state): scale 0.6 — gun 3000, broadside 18000', () => {
    const s = effectiveStats(BASE, stack('shipCooldown', 4));
    expect(s.cooldownScale).toBe(0.6);
    expect(s.cooldownScale).not.toBeCloseTo(0.9 ** 4, 3); // 0.6561 would be 3280.5 / 19683
    expect(s.gun.reloadMs).toBe(3000);
    expect(s.broadside.reloadMs).toBe(18000);
    const expected: Record<string, number> = {
      gun: 3000,
      broadside: 18000,
      torpedo: 18000,
      mine: 9000,
      starShells: 12000,
      boost: 10800,
      radarBuoy: 18000,
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
    // Bases retuned 2026-08-04 (weapon balance pass): torpedo 12000 -> 30000,
    // mine 8000 -> 15000; the broadside's 30000 is Eric's wave-2 ruling.
    //
    // THE ONE IEEE754-DUST CELL IS GONE — and by accident, not by fix. It was
    // `45000 * 0.7 === 31499.999999999996`, and 45000 was the CANNON's base; the
    // broadside's 30000 multiplies clean at every stack. The rounding this test
    // exists to guard is UNCHANGED and still load-bearing (it is what keeps the
    // scale itself off 0.5000000000000001), so the strict-equality table below
    // still fails without it. Noted rather than silently dropped: if a base ever
    // lands back on a dusty product, pin it STRICTLY to the double it actually
    // is — never loosen the cell to a tolerance.
    const table: Record<number, { scale: number } & Record<string, number>> = {
      0: { scale: 1, gun: 5000, broadside: 30000, torpedo: 30000, mine: 15000, starShells: 20000, boost: 18000, radarBuoy: 30000 },
      1: { scale: 0.9, gun: 4500, broadside: 27000, torpedo: 27000, mine: 13500, starShells: 18000, boost: 16200, radarBuoy: 27000 },
      2: { scale: 0.8, gun: 4000, broadside: 24000, torpedo: 24000, mine: 12000, starShells: 16000, boost: 14400, radarBuoy: 24000 },
      3: { scale: 0.7, gun: 3500, broadside: 21000, torpedo: 21000, mine: 10500, starShells: 14000, boost: 12600, radarBuoy: 21000 },
      4: { scale: 0.6, gun: 3000, broadside: 18000, torpedo: 18000, mine: 9000, starShells: 12000, boost: 10800, radarBuoy: 18000 },
      5: { scale: 0.5, gun: 2500, broadside: 15000, torpedo: 15000, mine: 7500, starShells: 10000, boost: 9000, radarBuoy: 15000 },
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
    expect(30000 * full.cooldownScale === 15000).toBe(true);
  });

  it('the tick-count consequence: ammo.ts ticks reloads down in 50ms steps and refills at <= 0 — a 5-stack gun must take EXACTLY 50 ticks (not 51) and broadside 300 (not 301); a 4-stack 60 / 360', () => {
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
    expect(ticksToRefill(capped.broadside.reloadMs)).toBe(300);
    const four = effectiveStats(BASE, stack('shipCooldown', 4));
    expect(ticksToRefill(four.gun.reloadMs)).toBe(60);
    expect(ticksToRefill(four.broadside.reloadMs)).toBe(360);
    // The dust cell this test used to prove behaviourally inert (the 3-stack
    // cannon, 45000 * 0.7 = 31499.999999999996) left with the weapon. The
    // 3-stack broadside is clean, and pinned so a base retune that reintroduces
    // dust shows up as a TICK COUNT rather than only as a decimal.
    const three = effectiveStats(BASE, stack('shipCooldown', 3));
    expect(three.broadside.reloadMs).toBe(21000);
    expect(ticksToRefill(three.broadside.reloadMs)).toBe(420);
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
        'broadside.reloadMs',
        'cooldownScale',
        'radarBuoy.reloadMs',
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
    expect(equipmentMaxAmmo(s, 'radarBuoy')).toBe(s.radarBuoy.maxAmmo);
    expect(equipmentReloadMs(s, 'gun')).toBe(s.gun.reloadMs);
    expect(equipmentReloadMs(s, 'torpedo')).toBe(s.torpedo.reloadMs);
    expect(equipmentReloadMs(s, 'mine')).toBe(s.mine.reloadMs);
    expect(equipmentReloadMs(s, 'speedBoost')).toBe(s.boost.reloadMs);
    expect(equipmentReloadMs(s, 'radarBuoy')).toBe(s.radarBuoy.reloadMs);
    // ONE shipCooldown stack scales EVERY lookup, not just one weapon's.
    expect(equipmentReloadMs(s, 'mine')).toBeCloseTo(CONFIG.mine.reloadMs * 0.9, 9);
    expect(equipmentReloadMs(s, 'gun')).toBeCloseTo(CONFIG.gun.reloadMs * 0.9, 9);
  });

  it('the legacy upgrade vocabulary is GONE: no CONFIG.upgrades block survives', () => {
    expect('upgrades' in CONFIG).toBe(false);
  });
});
