// THE CARD COPY LAYER (ui/boonCopy.ts, Story 2.8) — the ratified ladders
// (amendment 42, verbatim canon) and the "name is flavor, rules text is the
// contract" law. Three properties carry the whole module:
//
//   1. COVERAGE — every shipped catalog line has a real name at EVERY stack
//      position it can reach, a category label, and non-empty rules text. A
//      missing rung would print the humanized id mid-match.
//   2. NAME-BY-STACK-POSITION — the card shows the NEXT rung (held occurrences
//      + 1), and the ladders are exactly the ones the brainstorm ratified.
//   3. LIVE VALUES — the rules text is computed through a REAL effectiveStats
//      preview diff, so it can never promise a number the firewall would not
//      produce (clamps and caps included).

import { describe, it, expect } from 'vitest';
import { BOON_CATALOG, CONFIG, effectiveStats, resolveBoons } from '@salvo/shared';
import {
  boonCategoryLabel,
  boonDescription,
  boonEffectLine,
  boonFitToastLine,
  boonLineageLine,
  boonName,
  boonRarityLabel,
  boonReplacesLine,
} from '../ui/boonCopy.js';

const TB = { cls: 'torpedoBoat' as const, boons: [] as string[] };

describe('ladder coverage — every catalog line, every stack position', () => {
  it('names every shipped line at every rung it can reach (never the humanized fallback)', () => {
    for (const [id, def] of Object.entries(BOON_CATALOG)) {
      for (let stack = 0; stack < def.copies; stack += 1) {
        const name = boonName(id, stack);
        expect(name.length, `${id}@${stack}`).toBeGreaterThan(0);
        // The fallback humanizer produces a Title Case de-camelCased id; a real
        // ratified name is authored uppercase (with period-authentic Mk marks).
        expect(name, `${id}@${stack}`).toBe(name.toUpperCase().replace(/MK /g, 'Mk '));
      }
    }
  });

  it('gives a multi-copy line a DISTINCT name at each rung (a ladder, not a repeat)', () => {
    for (const [id, def] of Object.entries(BOON_CATALOG)) {
      if (def.copies < 2) continue;
      const rungs = Array.from({ length: def.copies }, (_, k) => boonName(id, k));
      expect(new Set(rungs).size, id).toBe(def.copies);
    }
  });

  it('carries the ratified ladders verbatim (spot checks across the naming styles)', () => {
    expect(boonName('gunDamage', 0)).toBe('HEAVY SHELLS Mk I');
    expect(boonName('gunDamage', 4)).toBe('HEAVY SHELLS Mk V');
    // The universal cooldown line's crew-proficiency ladder (2026-08-04): FIVE
    // rungs, one per copy (the copies 4 → 5 ruling took the cap to 0.5), sitting
    // in the SHIP category beside HULL SCRAPING. Both ends are pinned.
    expect(boonName('shipCooldown', 0)).toBe('DRILL SCHEDULE');
    expect(boonName('shipCooldown', 3)).toBe('BATTLE STATIONS');
    expect(boonName('shipCooldown', 4)).toBe('GUNNERY PENNANT');
    expect(boonName('gunBarrel', 0)).toBe('TWIN MOUNT');
    expect(boonName('gunBarrel', 1)).toBe('TRIPLE MOUNT');
    expect(boonName('gunTurret')).toBe('AFT TURRET');
    expect(boonName('mineDamage', 0)).toBe('TNT FILLER');
    expect(boonName('mineDamage', 4)).toBe('RDX FILLER');
    expect(boonName('mineTrigger', 4)).toBe('COMBINATION FUZE');
    expect(boonName('mineMax', 4)).toBe('CONVERTED HOLD');
    expect(boonName('torpedoSpeed', 3)).toBe('PURE OXYGEN DRIVE');
    expect(boonName('intelRange', 4)).toBe('CAVITY MAGNETRON');
    expect(boonName('intelRange', 3)).toBe('CAVITY MAGNETRON'); // top rung of the merged 4-copy ladder
    expect(boonName('shipSpeed', 4)).toBe('FLANK SPEED TRIALS');
    expect(boonName('shipHull', 4)).toBe('ARMORED CITADEL');
    expect(boonName('boostMax', 4)).toBe('EMERGENCY POWER');
    // The four ratified doctrine forks.
    expect(boonName('cannonArcing')).toBe('PLUNGING FIRE');
    expect(boonName('cannonAp')).toBe('ARMOR-PIERCING SHELLS');
    expect(boonName('torpedoHoming')).toBe('ACOUSTIC HOMING');
    expect(boonName('torpedoCommand')).toBe('COMMAND DETONATION');
    expect(boonName('mineSelfPropelled')).toBe('SELF-PROPELLED MINES');
    expect(boonName('minePropFouling')).toBe('PROP-FOULING MINES');
    expect(boonName('starIncendiary')).toBe('INCENDIARY COMPOUND');
    expect(boonName('starDazzle')).toBe('DAZZLE BURST');
    // Acquisitions — amendment 42 named the Speed Boost card EMERGENCY THROTTLE.
    expect(boonName('acquireTorpedo')).toBe('TORPEDO TUBES');
    expect(boonName('acquireMine')).toBe('MINE RACKS');
    expect(boonName('acquireStarShells')).toBe('STAR SHELL MORTAR');
    expect(boonName('acquireCannon')).toBe('CANNON');
    expect(boonName('acquireDecoy')).toBe('DECOY BUOY');
    expect(boonName('acquireBoost')).toBe('EMERGENCY THROTTLE');
  });

  it('clamps a stack past the end of a ladder to its last rung (never blank)', () => {
    expect(boonName('gunDamage', 99)).toBe('HEAVY SHELLS Mk V');
    expect(boonName('gunTurret', 3)).toBe('AFT TURRET');
    expect(boonName('gunDamage', -1)).toBe('HEAVY SHELLS Mk I');
  });

  it('fails OPEN on an unknown id (a readable fallback, never an empty card)', () => {
    expect(boonName('someFutureBoon')).toBe('Some Future Boon');
  });

  it('labels all NINE catalog categories, and fails open on an unknown one', () => {
    const categories = new Set(Object.values(BOON_CATALOG).map((d) => d.category));
    expect(categories.size).toBe(9);
    for (const c of categories) {
      expect(boonCategoryLabel(c), c).not.toBe(c); // a real label, not the raw key
      expect(boonCategoryLabel(c)).toBe(boonCategoryLabel(c).toUpperCase());
    }
    expect(boonCategoryLabel('someFutureCategory')).toBe('SOMEFUTURECATEGORY');
  });

  it('shows a rarity tag for RARE/EXCLUSIVE and NOTHING for a plain common', () => {
    expect(boonRarityLabel('common')).toBe('');
    expect(boonRarityLabel('rare')).toBe('RARE');
    expect(boonRarityLabel('exclusive')).toBe('EXCLUSIVE');
  });
});

describe('rules text — the contract, with live values', () => {
  it('writes non-empty rules text for EVERY shipped line', () => {
    for (const def of Object.values(BOON_CATALOG)) {
      expect(boonDescription(def, TB).length, def.id).toBeGreaterThan(0);
    }
  });

  it('prints the canonical current → next sentence off a real preview diff', () => {
    const sweep = boonDescription(BOON_CATALOG.intelSweep, TB);
    const base = effectiveStats(CONFIG.shipClasses.torpedoBoat);
    const next = effectiveStats(CONFIG.shipClasses.torpedoBoat, resolveBoons(['intelSweep'], BOON_CATALOG));
    expect(sweep).toBe(`Radar sweep: ${base.sweepRpm} RPM → ${next.sweepRpm} RPM.`);
    expect(next.sweepRpm).toBeGreaterThan(base.sweepRpm);
  });

  it('the printed values MOVE with the player\'s existing build (not a static table)', () => {
    const fresh = boonDescription(BOON_CATALOG.gunDamage, TB);
    const stacked = boonDescription(BOON_CATALOG.gunDamage, { cls: 'torpedoBoat', boons: ['gunDamage', 'gunDamage'] });
    expect(stacked).not.toBe(fresh);
    const two = effectiveStats(CONFIG.shipClasses.torpedoBoat, resolveBoons(['gunDamage', 'gunDamage'], BOON_CATALOG));
    expect(stacked).toContain(`${two.gun.damage} →`);
  });

  it('tells the TRUTH at a firewall clamp — a capped sweep prints an unchanged number', () => {
    // The ratified 30-RPM ceiling: the card cannot promise what effectiveStats
    // would refuse to produce, because it asks effectiveStats.
    const capped = { cls: 'torpedoBoat' as const, boons: Array.from({ length: 5 }, () => 'intelSweep') };
    const stats = effectiveStats(CONFIG.shipClasses.torpedoBoat, resolveBoons(capped.boons, BOON_CATALOG));
    expect(stats.sweepRpm).toBe(CONFIG.vision.sweepRpmMax);
    expect(boonDescription(BOON_CATALOG.intelSweep, capped)).toBe(
      `Radar sweep: ${CONFIG.vision.sweepRpmMax} RPM → ${CONFIG.vision.sweepRpmMax} RPM.`,
    );
  });

  it('prints durations as seconds, the global cooldown as a PERCENT, and carries the standing notes', () => {
    expect(boonDescription(BOON_CATALOG.starDuration, TB)).toContain('s →');
    // The one card that scales seven different reloads has no single second
    // count to headline, so it prints the scale itself, reading downward.
    expect(boonDescription(BOON_CATALOG.shipCooldown, TB)).toContain('All cooldowns: 100% → 90%.');
    expect(boonDescription(BOON_CATALOG.shipHull, TB)).toContain('Repairs the hull it adds.');
    expect(boonDescription(BOON_CATALOG.intelRange, TB)).toContain('Sight, gun, cannon and star shells reach with it.');
    expect(boonDescription(BOON_CATALOG.mineTrigger, TB)).toContain('Never wider than the blast.');
  });

  it('doctrine cards spell out the behavior change; acquisitions say what they fit', () => {
    expect(boonDescription(BOON_CATALOG.cannonAp, TB)).toContain('three hulls');
    expect(boonDescription(BOON_CATALOG.cannonArcing, TB)).toContain('islands');
    expect(boonDescription(BOON_CATALOG.torpedoHoming, TB)).toContain('steer');
    expect(boonDescription(BOON_CATALOG.torpedoCommand, TB)).toContain('detonate');
    expect(boonDescription(BOON_CATALOG.minePropFouling, TB)).toContain('fouled');
    expect(boonDescription(BOON_CATALOG.starDazzle, TB)).toContain('dazzled');
    expect(boonDescription(BOON_CATALOG.acquireCannon, TB)).toContain('open slot');
    // ...and a doctrine card never prints a bare stat diff instead.
    expect(boonDescription(BOON_CATALOG.starIncendiary, TB)).not.toContain('→');
  });
});

describe('lineage handrail + doctrine-swap line', () => {
  it('marks the position a card would take out of its line\'s copies', () => {
    expect(boonLineageLine(BOON_CATALOG.gunDamage, 0)).toBe('I/V');
    expect(boonLineageLine(BOON_CATALOG.gunDamage, 1)).toBe('II/V');
    expect(boonLineageLine(BOON_CATALOG.torpedoSpeed, 3)).toBe('IV/IV');
    expect(boonLineageLine(BOON_CATALOG.gunBarrel, 1)).toBe('II/II');
  });

  it('shows NOTHING for a single-copy line (there is no lineage to hold)', () => {
    expect(boonLineageLine(BOON_CATALOG.gunTurret, 0)).toBeNull();
    expect(boonLineageLine(BOON_CATALOG.torpedoHoming, 0)).toBeNull();
    expect(boonLineageLine(BOON_CATALOG.acquireMine, 0)).toBeNull();
  });

  it('clamps a full stack to the last position rather than overflowing', () => {
    expect(boonLineageLine(BOON_CATALOG.gunDamage, 9)).toBe('V/V');
  });

  it('names the rival ONLY while you hold it (amendment 44 — the free swap)', () => {
    expect(boonReplacesLine(BOON_CATALOG.torpedoCommand, [])).toBeNull();
    expect(boonReplacesLine(BOON_CATALOG.torpedoCommand, ['torpedoHoming'])).toBe('REPLACES: ACOUSTIC HOMING');
    expect(boonReplacesLine(BOON_CATALOG.torpedoHoming, ['torpedoCommand'])).toBe('REPLACES: COMMAND DETONATION');
    // A non-exclusive line never carries the swap line, whatever you hold.
    expect(boonReplacesLine(BOON_CATALOG.gunDamage, ['gunDamage'])).toBeNull();
  });

  it('every exclusive pair in the catalog can name its rival (symmetry, end to end)', () => {
    for (const def of Object.values(BOON_CATALOG)) {
      if (def.exclusiveWith === undefined) continue;
      expect(boonReplacesLine(def, [def.exclusiveWith]), def.id).toBe(`REPLACES: ${boonName(def.exclusiveWith)}`);
    }
  });
});

describe('the fitted toast', () => {
  it('names the rung that was fitted and carries the accrued-boon diamond', () => {
    expect(boonFitToastLine('gunDamage', 1)).toBe('◆ HEAVY SHELLS Mk I FITTED');
    expect(boonFitToastLine('gunDamage', 3)).toBe('◆ HEAVY SHELLS Mk III FITTED');
    expect(boonFitToastLine('acquireBoost', 1)).toBe('◆ EMERGENCY THROTTLE FITTED');
  });

  it('floors a defensive 0 to the ladder\'s first name', () => {
    expect(boonFitToastLine('gunDamage', 0)).toBe('◆ HEAVY SHELLS Mk I FITTED');
  });
});

describe('the tooltip effect line (Story 2.9) — the HOLDING, not the sales pitch', () => {
  const bare = effectiveStats(CONFIG.shipClasses.torpedoBoat);

  it('reports a stat line\'s LIVE value, with no current→next arrow', () => {
    expect(boonEffectLine('gunDamage', bare)).toBe(`Gun damage: ${bare.gun.damage}`);
    expect(boonEffectLine('gunDamage', bare)).not.toContain('→');
    expect(boonEffectLine('intelSweep', bare)).toBe(`Radar sweep: ${bare.sweepRpm} RPM`);
    expect(boonEffectLine('shipCooldown', bare)).toBe('All cooldowns: 100%');
  });

  it('MOVES with the fitted stack (it reads the firewall\'s output, not CONFIG)', () => {
    const stacked = effectiveStats(CONFIG.shipClasses.torpedoBoat, resolveBoons(['gunDamage', 'gunDamage']));
    expect(boonEffectLine('gunDamage', stacked)).not.toBe(boonEffectLine('gunDamage', bare));
    expect(boonEffectLine('gunDamage', stacked)).toBe(`Gun damage: ${stacked.gun.damage}`);
  });

  it('drops the card\'s standing note — the row is a readout, not a pitch', () => {
    expect(boonDescription(BOON_CATALOG.shipHull, { cls: 'torpedoBoat', boons: [] })).toContain('Repairs');
    expect(boonEffectLine('shipHull', bare)).not.toContain('Repairs');
  });

  it('reuses the doctrine / acquisition text verbatim (one copy of every string)', () => {
    expect(boonEffectLine('cannonAp', bare)).toBe(
      boonDescription(BOON_CATALOG.cannonAp, { cls: 'battleship', boons: [] }),
    );
    expect(boonEffectLine('acquireTorpedo', bare)).toBe(
      boonDescription(BOON_CATALOG.acquireTorpedo, { cls: 'battleship', boons: [] }),
    );
  });

  it('is TOTAL over the catalog — no line can be presentation-silent (FR22)', () => {
    const blank = Object.keys(BOON_CATALOG).filter((id) => boonEffectLine(id, bare).trim() === '');
    expect(blank).toEqual([]);
  });

  it('fails open on an unwritten id rather than throwing mid-hover', () => {
    expect(boonEffectLine('notARealBoon', bare)).toBe('');
  });
});
