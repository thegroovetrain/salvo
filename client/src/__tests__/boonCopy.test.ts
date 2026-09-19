// THE CARD COPY LAYER (ui/boonCopy.ts) — catalog v3's names (Eric's authored
// sheet, §1, verbatim), the four KIND words, and the "name is flavor, rules text
// is the contract" law. Three properties carry the whole module:
//
//   1. COVERAGE — every one of the 29 shipped lines has a real display name and
//      a real kind label. A missing entry would print the humanized id
//      mid-match, or an unlabelled meta row.
//   2. THE MINIMAL FACE (R2.17) — a line that moves a NUMBER prints its live
//      `current → next` sentence and nothing else; every other line prints
//      nothing at all and the hover tooltip does the talking.
//   3. LIVE VALUES — the rules text is computed through a REAL effectiveStats
//      preview diff, so it can never promise a number the firewall would not
//      produce (clamps and caps included).
//
// WHAT CATALOG V3 CHANGED. Rarity and the nine categories are DELETED, replaced
// by ONE neutral meta word — the line's KIND (Eric ruling 2026-09-15, amendment
// 8) — and the v2 per-rung name ladders are gone: the sheet names the LINE and
// the lineage handrail prints the rung. Thirteen lines are STUBS whose mechanism
// is not built, and they have to render FAIL-OPEN (a name, a kind, no
// explanation) rather than breaking the card view.

import { describe, it, expect } from 'vitest';
import { CATALOG, CONFIG, LINE_IDS, effectiveStats, type CatalogLine } from '@salvo/shared';
import {
  boonDescription,
  boonEffectLine,
  boonFitToastLine,
  boonKindLabel,
  boonName,
  boonTooltipText,
  cardStatRows,
  cardTierLabel,
  cardTierSteps,
} from '../ui/boonCopy.js';

const TB = { cls: 'torpedoBoat' as const, cards: [] as string[] };

describe('coverage — every catalog line has a name and a kind word', () => {
  it('names every one of the 29 lines (never the humanized fallback)', () => {
    expect(LINE_IDS).toHaveLength(29);
    for (const id of LINE_IDS) {
      const name = boonName(id);
      expect(name.length, id).toBeGreaterThan(0);
      // A real sheet name is authored UPPERCASE; the fallback humanizer would
      // produce Title Case de-camelCased text instead.
      expect(name, id).toBe(name.toUpperCase());
    }
  });

  it('gives every line a kind LABEL — one of catalog v3\'s four words', () => {
    const WORDS = ['WEAPON', 'UPGRADE', 'ADD-ON', 'CONSUMABLE'];
    for (const id of LINE_IDS) {
      const label = boonKindLabel(CATALOG[id].kind);
      expect(WORDS, id).toContain(label);
    }
    // ...and all four are actually used by the shipped catalog.
    expect([...new Set(LINE_IDS.map((id) => boonKindLabel(CATALOG[id].kind)))].sort())
      .toEqual([...WORDS].sort());
  });

  it('carries the sheet\'s names verbatim (spot checks across the four kinds)', () => {
    expect(boonName('armor')).toBe('ARMOR');
    expect(boonName('radarSweep')).toBe('RADAR SWEEP');
    expect(boonName('deckGunTurret')).toBe('DECK GUN TURRET');
    expect(boonName('supercavTorpedo')).toBe('SUPERCAVITATING TORPEDO');
    expect(boonName('missile')).toBe('HORIZONTAL MISSILE');
    expect(boonName('flak')).toBe('FLAK GUN');
    expect(boonName('broadside')).toBe('BROADSIDE GUN');
    expect(boonName('decoyBuoy')).toBe('DECOY BUOY');
    expect(boonName('acousticHoming')).toBe('ACOUSTIC HOMING');
  });

  it('names the LINE, not the rung — the tier numerals carry the position', () => {
    // The v2 ladders (HULL I..IV) are gone with the v2 catalog: the sheet gives
    // one name per line, so `stack` no longer selects anything.
    expect(boonName('armor', 0)).toBe(boonName('armor', 3));
    // Story 8.7 retired `boonLineageLine`'s "II/V" handrail: the ratified face
    // DRAWS the ladder, so what the numerals say is the STEP this card buys.
    expect(cardTierLabel(CATALOG.armor, 0)).toBe('I → II');
    expect(cardTierLabel(CATALOG.armor, 3)).toBe('IV → V');
  });

  it('fails OPEN on an unknown id/kind (a readable fallback, never an empty card)', () => {
    expect(boonName('someFutureCard')).toBe('Some Future Card');
    expect(boonKindLabel('someFutureKind')).toBe('SOMEFUTUREKIND');
  });
});

/** The catalog partition R2.17 draws: a LADDER moves a number (its face prints
 *  `current → next`); an equipment line, an add-on and a consumable move none
 *  (their face prints nothing at all and the hover tooltip does the talking). */
const STAT_CARDS = LINE_IDS.map((id) => CATALOG[id]).filter((l) => l.kind === 'ladder');
const SILENT_CARDS = LINE_IDS.map((id) => CATALOG[id]).filter((l) => l.kind !== 'ladder');

describe('the card FACE — minimal, and only the numbers (R2.17)', () => {
  it('prints a live current → next sentence for every LADDER line', () => {
    expect(STAT_CARDS).toHaveLength(8); // five universal ladders + the deck-gun family
    for (const line of STAT_CARDS) {
      const text = boonDescription(line, TB);
      expect(text.length, line.id).toBeGreaterThan(0);
      expect(text, line.id).toContain('→');
      expect(text, line.id).toMatch(/^[^.]+: .+ → .+\.$/); // exactly ONE sentence, the diff
    }
  });

  // AN EQUIPMENT LINE IS NOT SILENT. Copy 1 fits the weapon and every copy
  // after it is a TIER, and a tier is -5% of that weapon's own reload (derived
  // in clampStats) — so the face prints the number that actually moves. Only
  // the lines with no built mechanism, and the verb cards, stay silent.
  it('prints a live RELOAD diff for every LIVE equipment line', () => {
    const live = SILENT_CARDS.filter((l) => l.kind === 'equipment' && l.stub !== true);
    expect(live.map((l) => l.id)).toEqual(['heavyTorpedo', 'navalMines', 'broadside', 'starShells']);
    for (const line of live) {
      expect(boonDescription(line, TB), line.id).toMatch(/^Reload: \d+\.\d s → \d+\.\d s\.$/);
    }
  });

  it('prints NOTHING for an add-on, a consumable or an unbuilt weapon', () => {
    const silent = SILENT_CARDS.filter((l) => l.kind !== 'equipment' || l.stub === true);
    expect(SILENT_CARDS).toHaveLength(21);
    expect(silent).toHaveLength(17);
    for (const line of silent) expect(boonDescription(line, TB), line.id).toBe('');
  });

  // THE NUMBER THE CARD SELLS. A Torpedo Boat SPAWNS holding copy 1 of HEAVY
  // TORPEDO, so the next one it is offered is tier II: 30.0 s -> 28.5 s, the
  // -5% step, computed through the real firewall like every other face.
  it('copy 2 of HEAVY TORPEDO prints the tier II step: 30.0 s → 28.5 s', () => {
    const held = { cls: 'torpedoBoat' as const, cards: ['heavyTorpedo'] };
    expect(boonDescription(CATALOG.heavyTorpedo, held)).toBe('Reload: 30.0 s → 28.5 s.');
    // ...and copy 1, on a hull without the weapon, honestly prints no change:
    // it buys the FIT, which the hover tooltip is what explains.
    expect(boonDescription(CATALOG.heavyTorpedo, TB)).toBe('Reload: 30.0 s → 30.0 s.');
  });

  // THE STUB PIN (Eric ruling 2026-09-15, amendment 5): lines authored in full
  // shape with no mechanism behind them. They are excluded from every deck, so
  // they can never be offered — but the card view must still render them
  // FAIL-OPEN rather than throwing or going blank, because the catalog is wire
  // contract and a stale client could see one. THIRTEEN at 8.7; TWELVE since
  // Story 8.8 flipped `hullRepair`'s stub, which is the number to move as each
  // content story lands.
  it('renders every STUB line fail-open: a name, a kind word, no explanation', () => {
    const stubs = LINE_IDS.map((id) => CATALOG[id]).filter((l) => l.stub === true);
    expect(stubs).toHaveLength(12);
    for (const line of stubs) {
      expect(boonName(line.id), line.id).toBe(boonName(line.id).toUpperCase());
      expect(boonKindLabel(line.kind), line.id).not.toBe('');
      expect(boonDescription(line, TB), line.id).toBe('');
      expect(boonTooltipText(line.id), line.id).toBe('');
      // A STUB line prints no rows on the ratified face either — there is no
      // built module whose numbers could be read (Story 8.7, ruling 12).
      expect(cardStatRows(line, 0, TB), line.id).toEqual([]);
    }
  });

  // THE RIDERS ARE GONE FROM THE FACE. Every one of these used to trail the
  // number on the card and every one is now in the hover explanation instead —
  // moved, not dropped, which is what the second half of each assertion proves.
  it('carries no standing note beside the number — the riders are on the tooltip', () => {
    const moved: [string, string][] = [
      ['armor', 'repairs'],
      ['reload', 'every weapon'],
      ['deckGunBarrel', 'parallel'],
      ['radarSweep', 'sweep'],
    ];
    for (const [id, phrase] of moved) {
      expect(boonDescription(CATALOG[id], TB), id).toMatch(/^[^.]+: .+ → .+\.$/);
      expect(boonTooltipText(id).toLowerCase(), id).toContain(phrase);
    }
  });
});

describe('rules text — the contract, with live values', () => {
  it('prints the canonical current → next sentence off a real preview diff', () => {
    const sweep = boonDescription(CATALOG.radarSweep, TB);
    const base = effectiveStats(CONFIG.shipClasses.torpedoBoat);
    const next = effectiveStats(CONFIG.shipClasses.torpedoBoat, ['radarSweep']);
    expect(sweep).toBe(`Radar sweep: ${base.sweepRpm} RPM → ${next.sweepRpm} RPM.`);
    expect(next.sweepRpm).toBeGreaterThan(base.sweepRpm);
  });

  it('the printed values MOVE with the player\'s existing build (not a static table)', () => {
    const fresh = boonDescription(CATALOG.armor, TB);
    const stacked = boonDescription(CATALOG.armor, { cls: 'torpedoBoat', cards: ['armor', 'armor'] });
    expect(stacked).not.toBe(fresh);
    const two = effectiveStats(CONFIG.shipClasses.torpedoBoat, ['armor', 'armor']);
    expect(stacked).toContain(`${two.maxHp} →`);
  });

  it('tells the TRUTH at a firewall clamp — a capped sweep prints an unchanged number', () => {
    // The ratified 30-RPM ceiling: the card cannot promise what effectiveStats
    // would refuse to produce, because it asks effectiveStats.
    const capped = { cls: 'torpedoBoat' as const, cards: Array.from({ length: 5 }, () => 'radarSweep') };
    const stats = effectiveStats(CONFIG.shipClasses.torpedoBoat, capped.cards);
    expect(stats.sweepRpm).toBe(CONFIG.vision.sweepRpmMax);
    expect(boonDescription(CATALOG.radarSweep, capped)).toBe(
      `Radar sweep: ${CONFIG.vision.sweepRpmMax} RPM → ${CONFIG.vision.sweepRpmMax} RPM.`,
    );
  });

  it('prints the global cooldown as a PERCENT, reading downward', () => {
    // The one card that scales every equipment reload has no single second
    // count to headline, so it prints the scale itself. Catalog v3 (R12) cut the
    // step from −10% to −5% per tier, capped at 25%.
    expect(boonDescription(CATALOG.reload, TB)).toBe('All cooldowns: 100% → 95%.');
  });

  it('fails open on an unresolvable hull rather than printing half a diff', () => {
    expect(boonDescription(CATALOG.armor, { cls: 'cruiser' as never, cards: [] })).toBe('');
  });
});

// --- THE HOVER TOOLTIP (Story 7-5 wave 2, R2.17) --------------------------------
//
// *"hovering one with the mouse should give a tooltip explaining the card, so
// that there are no questions like 'what the fuck does a captive mine do?'"*
describe('the hover explanation — every BUILT line, and the honest one', () => {
  /** The lines catalog v3 leaves without an explanation, and why. EXACT, so the
   *  agent who builds one has to delete its entry. */
  const NO_EXPLANATION: readonly string[] = [
    'turning', 'deckGun', // new in v3: no v2 line whose text could be carried over
    'lightTorpedo', 'supercavTorpedo', 'captiveMines', 'missile', 'machineGun', 'flak', 'monitor',
    // `hullRepair` left this list in Story 8.8 — the first consumable with a
    // mechanism to explain.
    'shieldBlock', 'smokeScreen', 'chaff', 'decoyBuoy', 'heatSeeking',
  ];

  it('writes a real explanation for every line whose mechanism exists', () => {
    const silent: string[] = [];
    for (const id of LINE_IDS) {
      const text = boonTooltipText(id);
      if (text.trim().length === 0) {
        silent.push(id);
        continue;
      }
      // Not a stub, and not the face's sentence copied over: an explanation is
      // prose, so it runs well past the ~90-character card-face budget.
      expect(text.length, id).toBeGreaterThan(100);
      expect(text, id).not.toContain('→');
    }
    expect(silent.sort()).toEqual([...NO_EXPLANATION].sort());
  });

  it('explains the behaviour change of every BUILT verb and what each weapon is', () => {
    expect(boonTooltipText('acousticHoming')).toContain('steers');
    expect(boonTooltipText('foulingMines')).toContain('fouled');
    expect(boonTooltipText('dazzleShells')).toContain('dazzle');
    expect(boonTooltipText('phosphorShells')).toContain('burns');
    expect(boonTooltipText('broadside')).toContain('open slot');
    expect(boonTooltipText('heavyTorpedo')).toContain('open slot');
  });

  // THE SUBDECK IS DELETED (Story 8.1): no card shuffles another card into your
  // deck any more, so no explanation may still promise that it does.
  it('no explanation still promises a subdeck of upgrade cards', () => {
    for (const id of LINE_IDS) {
      expect(boonTooltipText(id).toLowerCase(), id).not.toContain('join your deck');
      expect(boonTooltipText(id).toLowerCase(), id).not.toContain('joined your deck');
    }
  });

  it('fails open on an unwritten id rather than throwing mid-hover', () => {
    expect(boonTooltipText('notARealCard')).toBe('');
  });

  // The verbs STACK, so no verb card may sell itself as a trade against a rival.
  it('no verb sells itself as a trade against a rival — and the pair says so', () => {
    for (const id of LINE_IDS) {
      expect(boonTooltipText(id), id).not.toMatch(/\breplaces?\b/i);
    }
    expect(boonTooltipText('phosphorShells')).toContain('stacks with DAZZLE SHELLS');
    expect(boonTooltipText('dazzleShells')).toContain('stacks with PHOSPHOR SHELLS');
  });

  // FOULING MINES is a PURE behaviour verb since cycle 95 deleted its damage
  // penalty — the shipped v1 text still claimed "Mines hit softer", a lie on the
  // card. It states the real slow now.
  it('FOULING MINES states the real slow and claims no damage penalty', () => {
    const text = boonTooltipText('foulingMines');
    expect(text).toContain('25%');
    expect(text).toContain('5 seconds');
    expect(text).not.toMatch(/softer|less damage/i);
  });
});

// THE TIER NUMERALS (Story 8.7, ruling 11 / UX-DR51) — what replaced the
// "II/V" handrail. The ladder itself is drawn on the face, so these say the
// STEP the card buys, which the rungs cannot.
describe('cardTierLabel — the step, not the position', () => {
  it('reads a BASE-TIER line as a step from what the hull already has', () => {
    // A hull sails with armor / speed / turning / a deck gun fitted, so the
    // first card of one of those is I → II rather than the purchase of a Tier I.
    expect(cardTierLabel(CATALOG.armor, 0)).toBe('I → II');
    expect(cardTierLabel(CATALOG.speed, 0)).toBe('I → II');
    expect(cardTierLabel(CATALOG.turning, 0)).toBe('I → II');
    expect(cardTierLabel(CATALOG.deckGun, 0)).toBe('I → II');
    expect(cardTierLabel(CATALOG.armor, 2)).toBe('III → IV');
  });

  it('reads every OTHER ladder and every weapon as a bare I on its first copy', () => {
    expect(cardTierLabel(CATALOG.radarSweep, 0)).toBe('I');
    expect(cardTierLabel(CATALOG.reload, 0)).toBe('I');
    expect(cardTierLabel(CATALOG.deckGunTurret, 0)).toBe('I');
    expect(cardTierLabel(CATALOG.heavyTorpedo, 0)).toBe('I');
  });

  it('and as a step from the copy held once there is one', () => {
    expect(cardTierLabel(CATALOG.heavyTorpedo, 1)).toBe('I → II');
    expect(cardTierLabel(CATALOG.reload, 1)).toBe('I → II');
    expect(cardTierLabel(CATALOG.radarSweep, 4)).toBe('IV → V');
  });

  it('shows NO ladder at all for a consumable or an add-on', () => {
    expect(cardTierLabel(CATALOG.hullRepair, 0)).toBeNull();
    expect(cardTierLabel(CATALOG.decoyBuoy, 0)).toBeNull();
    expect(cardTierLabel(CATALOG.acousticHoming, 0)).toBeNull();
    expect(cardTierLabel(CATALOG.foulingMines, 0)).toBeNull();
  });

  it('carries the same step as NUMBERS, so the DOM can tint each numeral', () => {
    expect(cardTierSteps(CATALOG.armor, 0)).toEqual({ cur: 1, next: 2 });
    expect(cardTierSteps(CATALOG.radarSweep, 0)).toEqual({ cur: 1, next: null });
    expect(cardTierSteps(CATALOG.heavyTorpedo, 2)).toEqual({ cur: 2, next: 3 });
    expect(cardTierSteps(CATALOG.hullRepair, 0)).toBeNull();
  });

  // STORY 8.12 — THE CEILING. The ramp is five rungs (UX-DR51) and the caps are
  // authored to land on it, so the top of a ladder must read as the bare rung it
  // is standing on: there is no sixth rung to sell. A base-tier line's ceiling is
  // `cap + 1` (the hull already sails at I and every card steps above it); every
  // other line's is the cap itself.
  it('stops at the TOP RUNG — a card at the cap sells no step', () => {
    expect(cardTierLabel(CATALOG.armor, 4)).toBe('V');
    expect(cardTierLabel(CATALOG.speed, 4)).toBe('V');
    expect(cardTierLabel(CATALOG.turning, 4)).toBe('V');
    expect(cardTierLabel(CATALOG.deckGun, 4)).toBe('V');
    expect(cardTierLabel(CATALOG.radarSweep, 5)).toBe('V');
    // A ONE-RUNG ladder is at its ceiling the moment it is held: the TURRET is
    // fitted once and has nowhere to climb.
    expect(cardTierLabel(CATALOG.deckGunTurret, 1)).toBe('I');
    expect(cardTierSteps(CATALOG.armor, 4)).toEqual({ cur: 5, next: null });
    expect(cardTierSteps(CATALOG.radarSweep, 5)).toEqual({ cur: 5, next: null });
  });

  it('never prints a SIXTH rung — on any ladder, at any count the wire can carry', () => {
    // Property-style: walk every line that has a ladder at all, from empty to
    // three copies past its cap (an over-stack the server should never grant),
    // and assert no label ever reaches VI — neither side of the arrow.
    for (const line of Object.values(CATALOG)) {
      for (let held = 0; held <= line.cap + 3; held += 1) {
        const label = cardTierLabel(line, held);
        if (label === null) continue;
        expect(label, `${line.id} @ ${held}`).not.toContain('VI');
        const step = cardTierSteps(line, held)!;
        expect(step.cur, `${line.id} @ ${held}`).toBeLessThanOrEqual(5);
        expect(step.next ?? 0, `${line.id} @ ${held}`).toBeLessThanOrEqual(5);
      }
    }
  });

  it('moves NOTHING below the ceiling — every step is what it was', () => {
    expect(cardTierLabel(CATALOG.armor, 3)).toBe('IV → V');
    expect(cardTierLabel(CATALOG.armor, 2)).toBe('III → IV');
    expect(cardTierLabel(CATALOG.radarSweep, 4)).toBe('IV → V');
    expect(cardTierLabel(CATALOG.heavyTorpedo, 4)).toBe('IV → V');
    expect(cardTierSteps(CATALOG.armor, 2)).toEqual({ cur: 3, next: 4 });
    expect(cardTierSteps(CATALOG.deckGunTurret, 0)).toEqual({ cur: 1, next: null });
  });

  // REVIEW GATE, CYCLE 147: `Math.trunc(NaN)` is `NaN`, so a non-finite
  // `copiesHeld` used to sail through the old `Math.max(0, Math.trunc(...))`
  // untouched and poison `cur`/`next` with NaN. Fenced to a held-nothing read.
  it('fences a non-finite copiesHeld to held-nothing, never NaN', () => {
    expect(cardTierSteps(CATALOG.reload, NaN)).toEqual({ cur: 1, next: null });
  });

  // REVIEW GATE, CYCLE 147: `tierCeiling` used to read `cap + 1` for a base-tier
  // line with NO independent clamp to the five-rung ramp — so a base-tier line
  // authored (or, defensively, injected) with `cap` at 5 would ceiling at 6 and
  // print `V → VI`. `RAMP_RUNGS` is the second, catalog-independent stop.
  it('never lets a base-tier line\'s ceiling exceed the five-rung ramp, whatever its cap', () => {
    const overCapped: CatalogLine = {
      ...CATALOG.armor,
      cap: 5,
      tiers: [...CATALOG.armor.tiers, CATALOG.armor.tiers[0]],
    } as CatalogLine;
    expect(cardTierLabel(overCapped, 4)).toBe('V');
  });
});

describe('the fitted toast', () => {
  it('names the line that was fitted and carries the accrued-card diamond', () => {
    expect(boonFitToastLine('reload', 1)).toBe('◆ RELOAD FITTED');
    expect(boonFitToastLine('reload', 3)).toBe('◆ RELOAD FITTED');
    expect(boonFitToastLine('heavyTorpedo', 1)).toBe('◆ HEAVY TORPEDO FITTED');
  });

  it('floors a defensive 0 rather than going blank', () => {
    expect(boonFitToastLine('reload', 0)).toBe('◆ RELOAD FITTED');
  });

  it('fails open on an unknown id', () => {
    expect(boonFitToastLine('someFutureCard', 1)).toBe('◆ Some Future Card FITTED');
  });

  // STORY 8.7, RULING 14 (UX-DR48's "consumable stocked"). Nothing about the
  // hull changed when a consumable lands — a copy went onto the belt — so the
  // verb has to say so or the toast claims a fit that never happened.
  it('says STOCKED for a consumable line, and FITTED for every other kind', () => {
    expect(boonFitToastLine('hullRepair', 1, 'consumable')).toBe('◆ HULL REPAIR STOCKED');
    expect(boonFitToastLine('decoyBuoy', 2, 'consumable')).toBe('◆ DECOY BUOY STOCKED');
    expect(boonFitToastLine('reload', 1, 'ladder')).toBe('◆ RELOAD FITTED');
    expect(boonFitToastLine('heavyTorpedo', 1, 'equipment')).toBe('◆ HEAVY TORPEDO FITTED');
    expect(boonFitToastLine('acousticHoming', 1, 'addon')).toBe('◆ ACOUSTIC HOMING FITTED');
  });

  it('keeps the pre-8.7 default when no kind is passed or the kind is unknown', () => {
    expect(boonFitToastLine('hullRepair', 1)).toBe('◆ HULL REPAIR FITTED');
    expect(boonFitToastLine('hullRepair', 1, 'someFutureKind')).toBe('◆ HULL REPAIR FITTED');
  });
});

describe('the tooltip effect line (Story 2.9) — the HOLDING, not the sales pitch', () => {
  const bare = effectiveStats(CONFIG.shipClasses.torpedoBoat);

  it('reports a stat line\'s LIVE value, with no current→next arrow', () => {
    expect(boonEffectLine('armor', bare)).toBe(`Max hull: ${bare.maxHp}`);
    expect(boonEffectLine('armor', bare)).not.toContain('→');
    expect(boonEffectLine('radarSweep', bare)).toBe(`Radar sweep: ${bare.sweepRpm} RPM`);
    expect(boonEffectLine('reload', bare)).toBe('All cooldowns: 100%');
  });

  it('MOVES with the fitted stack (it reads the firewall\'s output, not CONFIG)', () => {
    const stacked = effectiveStats(CONFIG.shipClasses.torpedoBoat, ['armor', 'armor']);
    expect(boonEffectLine('armor', stacked)).not.toBe(boonEffectLine('armor', bare));
    expect(boonEffectLine('armor', stacked)).toBe(`Max hull: ${stacked.maxHp}`);
  });

  it('reports the value only — never the card\'s sales pitch or its explanation', () => {
    expect(boonEffectLine('armor', bare)).not.toContain('Repairs');
  });

  // R2.17 SPLIT what used to be one string. A verb card's face prints NOTHING,
  // so the holding row cannot reuse it; and the hover EXPLANATION is prose far
  // too long to ride inside a panel whose own fit pin trims accrued rows as they
  // grow. So the holding line is its own short table.
  it('is its OWN short line for a verb — not the blank face, not the long explanation', () => {
    const holding = boonEffectLine('acousticHoming', bare);
    expect(holding.length).toBeGreaterThan(0);
    expect(holding).not.toBe(boonTooltipText('acousticHoming'));
    expect(holding.length).toBeLessThan(boonTooltipText('acousticHoming').length);
    expect(boonDescription(CATALOG.acousticHoming, TB)).toBe('');
  });

  it('fails open to \'\' for a line with neither a holding line nor a headline stat', () => {
    // A STUB equipment line has no built weapon to read a holding off, so it
    // reports its `◆ NAME` row alone — the honest readout. A LIVE one prints
    // the reload it is actually carrying.
    expect(boonEffectLine('monitor', bare)).toBe('');
    expect(boonEffectLine('notARealCard', bare)).toBe('');
    expect(boonEffectLine('heavyTorpedo', bare)).toBe('Reload: 30.0 s');
  });
});
