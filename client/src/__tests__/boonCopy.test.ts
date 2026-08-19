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
    // STORY 7-5 WAVE 1 — Eric's own card names, verbatim canon
    // (_bmad-output/implementation-artifacts/7-5-decks.md). The v1 spot checks
    // for the SEVEN deleted lines (HEAVY SHELLS, HEAVY WARHEAD, COMMAND
    // DETONATION, TNT FILLER, DECK RACKS, WIDE BURST, CLEAN BOILERS) are
    // RETIRED with their catalog lines.
    expect(boonName('shipHull', 0)).toBe('HULL I');
    expect(boonName('shipHull', 3)).toBe('HULL IV');
    expect(boonName('shipSpeed', 0)).toBe('SPEED I');
    expect(boonName('shipSpeed', 3)).toBe('SPEED IV');
    expect(boonName('intelSweep', 0)).toBe('INTEL I');
    expect(boonName('intelSweep', 4)).toBe('INTEL V');
    expect(boonName('intelRange', 0)).toBe('RANGE I');
    expect(boonName('intelRange', 3)).toBe('RANGE IV');
    expect(boonName('shipCooldown', 0)).toBe('RELOAD I');
    expect(boonName('shipCooldown', 4)).toBe('RELOAD V');
    expect(boonName('gunBarrel', 0)).toBe('BARREL I');
    expect(boonName('gunBarrel', 1)).toBe('BARREL II');
    expect(boonName('gunTurret')).toBe('EXTRA TURRET');
    expect(boonName('torpedoSpeed', 0)).toBe('TORPEDO I');
    expect(boonName('torpedoSpeed', 3)).toBe('TORPEDO IV');
    expect(boonName('torpedoTube')).toBe('EXTRA TUBE');
    expect(boonName('boostDuration', 0)).toBe('BOOST DURATION I');
    expect(boonName('boostDuration', 3)).toBe('BOOST DURATION IV');
    expect(boonName('boostSpeed', 0)).toBe('BOOST SPEED I');
    expect(boonName('boostSpeed', 1)).toBe('BOOST SPEED II');
    expect(boonName('starDuration', 0)).toBe('STAR SHELLS I');
    expect(boonName('starDuration', 3)).toBe('STAR SHELLS IV');
    expect(boonName('mineBlast', 0)).toBe('MINES I');
    expect(boonName('mineBlast', 3)).toBe('MINES IV');
    // The doctrine forks. PHOSPHOR SHELLS is a DISPLAY rename of the
    // `starIncendiary` line — the id is deliberately unchanged (project law:
    // a copy rename is never an id rename, the KILL LEADER precedent).
    expect(boonName('torpedoHoming')).toBe('ACOUSTIC HOMING');
    expect(boonName('minePropFouling')).toBe('PROP FOULING MINES');
    expect(boonName('starIncendiary')).toBe('PHOSPHOR SHELLS');
    expect(boonName('starDazzle')).toBe('DAZZLE SHELLS');
    // STORY 7-5 WAVE 2 — Eric's names for the two reworked equipments, verbatim.
    // The PLUNGING FIRE / ARMOR-PIERCING / HEAVY CHARGE / EXTENDED BATTERY /
    // SELF-PROPELLED MINES spot checks are RETIRED with their catalog lines.
    expect(boonName('broadsideSpread', 0)).toBe('BROADSIDE SPREAD I');
    expect(boonName('broadsideSpread', 3)).toBe('BROADSIDE SPREAD IV');
    expect(boonName('broadsideTurrets', 0)).toBe('BROADSIDE TURRETS I');
    expect(boonName('broadsideTurrets', 1)).toBe('BROADSIDE TURRETS II');
    expect(boonName('buoySweep', 0)).toBe('BUOY I');
    expect(boonName('buoySweep', 3)).toBe('BUOY IV');
    expect(boonName('buoyGun')).toBe('GUN BUOY');
    expect(boonName('buoyJamming')).toBe('JAMMING BUOY');
    expect(boonName('mineCaptive')).toBe('CAPTIVE MINES');
    // Acquisitions — amendment 42 named the Speed Boost card EMERGENCY THROTTLE.
    expect(boonName('acquireTorpedo')).toBe('TORPEDO TUBES');
    expect(boonName('acquireMine')).toBe('MINE RACKS');
    expect(boonName('acquireStarShells')).toBe('STAR SHELL MORTAR');
    expect(boonName('acquireBroadside')).toBe('BROADSIDE BARRAGE');
    expect(boonName('acquireRadarBuoy')).toBe('RADAR BUOY');
    expect(boonName('acquireBoost')).toBe('EMERGENCY THROTTLE');
  });

  it('clamps a stack past the end of a ladder to its last rung (never blank)', () => {
    expect(boonName('shipCooldown', 99)).toBe('RELOAD V');
    expect(boonName('gunTurret', 3)).toBe('EXTRA TURRET');
    expect(boonName('shipCooldown', -1)).toBe('RELOAD I');
  });

  it('fails OPEN on an unknown id (a readable fallback, never an empty card)', () => {
    expect(boonName('someFutureBoon')).toBe('Some Future Boon');
  });

  // The nine survive wave 2 one-for-one: `cannon` → `broadside`, `decoyBuoy` →
  // `radarBuoy`.
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
    const fresh = boonDescription(BOON_CATALOG.shipHull, TB);
    const stacked = boonDescription(BOON_CATALOG.shipHull, { cls: 'torpedoBoat', boons: ['shipHull', 'shipHull'] });
    expect(stacked).not.toBe(fresh);
    const two = effectiveStats(CONFIG.shipClasses.torpedoBoat, resolveBoons(['shipHull', 'shipHull'], BOON_CATALOG));
    expect(stacked).toContain(`${two.maxHp} →`);
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
    expect(boonDescription(BOON_CATALOG.intelRange, TB)).toContain('Sight, gun, broadside and star shells reach with it.');
    expect(boonDescription(BOON_CATALOG.mineBlast, TB)).toContain('The trip ring widens with it.');
  });

  it('doctrine cards spell out the behavior change; acquisitions say what they fit', () => {
    expect(boonDescription(BOON_CATALOG.torpedoHoming, TB)).toContain('steer');
    expect(boonDescription(BOON_CATALOG.minePropFouling, TB)).toContain('fouled');
    expect(boonDescription(BOON_CATALOG.starDazzle, TB)).toContain('dazzle');
    expect(boonDescription(BOON_CATALOG.mineCaptive, TB)).toContain('torpedo');
    expect(boonDescription(BOON_CATALOG.buoyGun, TB)).toContain('5 damage');
    expect(boonDescription(BOON_CATALOG.buoyJamming, TB)).toContain('false returns');
    expect(boonDescription(BOON_CATALOG.acquireBroadside, TB)).toContain('open slot');
    expect(boonDescription(BOON_CATALOG.acquireRadarBuoy, TB)).toContain('open slot');
    // ...and a doctrine card never prints a bare stat diff instead.
    expect(boonDescription(BOON_CATALOG.starIncendiary, TB)).not.toContain('→');
  });

  // STORY 7-5 WAVE 2 — the BROADSIDE pair. SPREAD is the ONE line in the catalog
  // whose printed number falls as the card climbs, and the number it prints is
  // NOT the stat the card writes: `broadside.spreadRung` is an index into a
  // ladder of authored degrees, so "1 → 2" would say nothing. It prints the
  // DERIVED fan half-angle instead, through the same preview diff.
  it('BROADSIDE SPREAD prints the fan TIGHTENING, not the rung it writes', () => {
    const text = boonDescription(BOON_CATALOG.broadsideSpread, TB);
    expect(text).toContain('Barrage spread');
    expect(text).toContain('°');
    expect(text).not.toMatch(/\b1 → 2\b/); // never the raw rung
    // The half-angle really falls, and it is the firewall's own number.
    const before = effectiveStats(CONFIG.shipClasses.battleship);
    const after = effectiveStats(CONFIG.shipClasses.battleship, resolveBoons(['broadsideSpread'], BOON_CATALOG));
    expect(after.broadside.fanHalfAngleRad).toBeLessThan(before.broadside.fanHalfAngleRad);
    expect(text).toContain('Shells land nearer the point you clicked.');
  });

  it('BROADSIDE TURRETS prints shells per barrage, and the straddle note', () => {
    const text = boonDescription(BOON_CATALOG.broadsideTurrets, TB);
    expect(text).toContain('Shells per barrage: 3 → 4.');
    expect(text).toContain('An odd count puts one shell dead on your click.');
  });

  // STORY 7-5 WAVE 1 — the verbs STACK, so no doctrine card may still sell
  // itself as a trade against its former rival. Both star-shell cards and both
  // mine cards are legal to hold together now.
  // WAVE 2 made this TOTAL: exclusivity is deleted (R2.6), so EVERY doctrine
  // card in the catalog is a stacking verb and none may sell itself as a trade.
  it('no doctrine card implies an either/or any more — every verb stacks', () => {
    const verbs = Object.values(BOON_CATALOG).filter((d) => d.effects.some((e) => e.kind === 'doctrine'));
    expect(verbs.length).toBeGreaterThanOrEqual(7);
    for (const def of verbs) {
      const text = boonDescription(def, TB);
      expect(text, def.id).not.toMatch(/instead|replaces/i);
    }
  });

  // PROP FOULING is a PURE behaviour verb since cycle 95 deleted its damage
  // penalty — the shipped v1 text still claimed "Mines hit softer", which was a
  // lie on the card. It states the real slow now.
  it('PROP FOULING states the real slow and claims no damage penalty', () => {
    const text = boonDescription(BOON_CATALOG.minePropFouling, TB);
    expect(text).toContain('25%');
    expect(text).toContain('5 seconds');
    expect(text).not.toMatch(/softer|less damage/i);
  });
});

describe('lineage handrail + doctrine-swap line', () => {
  it('marks the position a card would take out of its line\'s copies', () => {
    expect(boonLineageLine(BOON_CATALOG.shipCooldown, 0)).toBe('I/V');
    expect(boonLineageLine(BOON_CATALOG.shipCooldown, 1)).toBe('II/V');
    expect(boonLineageLine(BOON_CATALOG.torpedoSpeed, 3)).toBe('IV/IV');
    expect(boonLineageLine(BOON_CATALOG.gunBarrel, 1)).toBe('II/II');
  });

  it('shows NOTHING for a single-copy line (there is no lineage to hold)', () => {
    expect(boonLineageLine(BOON_CATALOG.gunTurret, 0)).toBeNull();
    expect(boonLineageLine(BOON_CATALOG.torpedoHoming, 0)).toBeNull();
    expect(boonLineageLine(BOON_CATALOG.acquireMine, 0)).toBeNull();
  });

  it('clamps a full stack to the last position rather than overflowing', () => {
    expect(boonLineageLine(BOON_CATALOG.shipCooldown, 9)).toBe('V/V');
  });

  // THE "REPLACES: <rival>" PINS ARE RETIRED (Story 7-5 wave 2, R2.6).
  // `boonReplacesLine` existed to name the rival of an EXCLUSIVE pair; the
  // cannon's PLUNGING FIRE / ARMOR-PIERCING was the last pair in the game, and
  // `BoonDef.exclusiveWith` left the type with it. The function is deleted
  // rather than kept as one that can only ever return null, so these two pins
  // have nothing left to assert. What replaces them is the STRUCTURAL claim
  // below: no card face can carry a swap line, because no line is exclusive.
  it('NO catalog line is exclusive any more — the swap grammar has no subject', () => {
    const tiers = new Set(Object.values(BOON_CATALOG).map((d) => d.rarity));
    expect(tiers.has('exclusive')).toBe(false);
    // The rarity LABEL is still supported (a future tier can use it) — it just
    // has no line behind it today.
    expect(boonRarityLabel('exclusive')).toBe('EXCLUSIVE');
  });
});

describe('the fitted toast', () => {
  it('names the rung that was fitted and carries the accrued-boon diamond', () => {
    expect(boonFitToastLine('shipCooldown', 1)).toBe('◆ RELOAD I FITTED');
    expect(boonFitToastLine('shipCooldown', 3)).toBe('◆ RELOAD III FITTED');
    expect(boonFitToastLine('acquireBoost', 1)).toBe('◆ EMERGENCY THROTTLE FITTED');
  });

  it('floors a defensive 0 to the ladder\'s first name', () => {
    expect(boonFitToastLine('shipCooldown', 0)).toBe('◆ RELOAD I FITTED');
  });
});

describe('the tooltip effect line (Story 2.9) — the HOLDING, not the sales pitch', () => {
  const bare = effectiveStats(CONFIG.shipClasses.torpedoBoat);

  it('reports a stat line\'s LIVE value, with no current→next arrow', () => {
    expect(boonEffectLine('shipHull', bare)).toBe(`Max hull: ${bare.maxHp}`);
    expect(boonEffectLine('shipHull', bare)).not.toContain('→');
    expect(boonEffectLine('intelSweep', bare)).toBe(`Radar sweep: ${bare.sweepRpm} RPM`);
    expect(boonEffectLine('shipCooldown', bare)).toBe('All cooldowns: 100%');
  });

  it('MOVES with the fitted stack (it reads the firewall\'s output, not CONFIG)', () => {
    const stacked = effectiveStats(CONFIG.shipClasses.torpedoBoat, resolveBoons(['shipHull', 'shipHull']));
    expect(boonEffectLine('shipHull', stacked)).not.toBe(boonEffectLine('shipHull', bare));
    expect(boonEffectLine('shipHull', stacked)).toBe(`Max hull: ${stacked.maxHp}`);
  });

  it('drops the card\'s standing note — the row is a readout, not a pitch', () => {
    expect(boonDescription(BOON_CATALOG.shipHull, { cls: 'torpedoBoat', boons: [] })).toContain('Repairs');
    expect(boonEffectLine('shipHull', bare)).not.toContain('Repairs');
  });

  it('reuses the doctrine / acquisition text verbatim (one copy of every string)', () => {
    expect(boonEffectLine('mineCaptive', bare)).toBe(
      boonDescription(BOON_CATALOG.mineCaptive, { cls: 'battleship', boons: [] }),
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
