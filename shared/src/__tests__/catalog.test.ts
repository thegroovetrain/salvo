// THE CATALOG (Story 8.1) — catalog v3's identity, its authoring validator and
// THE ORDER-INDEPENDENCE PROPERTY.
//
// Pinned here: 26 lines / 109 cards with the exact per-line caps and kinds of
// `catalog-v3.md` §1 as amended; `tiers.length === cap` on every line; the
// 2-line stub set; the validator's rules, including its refusal of a stat
// path that takes `add` from one line and `mult` from another; and a seeded
// permutation property — ≥200 shuffles of random legal multisets over all
// three classes, deep-equal AND JSON-identical.
//
// STORY 8.14 DELETED THE DECK PINS (Eric ruling 2026-09-21, epic-8 amendment
// 89a). `DEFAULT_DECKS`, `DEFAULT_OWNED` and `deckFromCounts` no longer exist:
// every dealable line is drawable by every captain from the common pool, so
// there is no authored 40-card list to transcribe and no ownership set to
// check a deck against. The card TOTAL is simply Σ cap, a count of authored
// ladder, not a supply.
//
// STORY 8.15 CUT THREE LINES AND RE-CUT TWO (Eric rulings 2026-09-21/28, epic-8
// amendments 89e and 103–105): 29/122 -> 26/109. −11 (`missile` 5, `monitor`
// 5, `heatSeeking` 1), and −2 because `machineGun` and `flak` went from
// 5-copy stub EQUIPMENT lines to 4-copy LADDERS — the guns themselves are the
// seat's pick and only their ladders are cards.
//
// STORY 8.13 RE-CUT FOUR LINES' KINDS (Eric rulings 2026-09-19, epic-8
// amendments 74/80/81/83), which is why the CARD TOTAL moved 114 -> 122
// although the LINE count did not move: −1 (`acousticHoming`, a 1-card add-on,
// deleted), +5 (`depthCharge`, a new 5-card consumable), +4
// (`foulingMines` add-on 1 -> equipment 5), ±0 (`supercavTorpedo` equipment 5
// -> consumable 5).

import { describe, it, expect } from 'vitest';
import * as shared from '../index.js';
import {
  CATALOG,
  CONFIG,
  EQUIPMENT_IDS,
  LINE_IDS,
  SHIP_CLASS_IDS,
  catalogCardCount,
  effectiveStats,
  isStubLine,
  mulberry32,
  resolveCards,
  tierTargetOf,
  validateCatalog,
  validateLine,
  type Catalog,
  type CatalogLine,
  type LineId,
  type LineKind,
} from '../index.js';

/** catalog-v3 §1, transcribed: every line's cap and kind. */
const SHEET: Record<LineId, { cap: number; kind: LineKind; stub: boolean }> = {
  armor: { cap: 4, kind: 'ladder', stub: false },
  speed: { cap: 4, kind: 'ladder', stub: false },
  turning: { cap: 4, kind: 'ladder', stub: false },
  radarSweep: { cap: 5, kind: 'ladder', stub: false },
  reload: { cap: 5, kind: 'ladder', stub: false },
  deckGun: { cap: 4, kind: 'ladder', stub: false },
  deckGunTurret: { cap: 1, kind: 'ladder', stub: false },
  deckGunBarrel: { cap: 2, kind: 'ladder', stub: false },
  lightTorpedo: { cap: 5, kind: 'equipment', stub: false }, // LIVE since 8.13 (R18)
  heavyTorpedo: { cap: 5, kind: 'equipment', stub: false },
  // A CONSUMABLE since 8.13 (amendment 74) — it keeps its LINE_IDS slot.
  supercavTorpedo: { cap: 5, kind: 'consumable', stub: false },
  navalMines: { cap: 5, kind: 'equipment', stub: false },
  captiveMines: { cap: 5, kind: 'equipment', stub: false }, // LIVE since 8.13 (R25)
  // THE TWO PICKABLE GUNS' LADDERS since 8.15 (amendments 104/105) — each
  // keeps its locked LINE_IDS slot; `missile`/`monitor` are CUT (89e).
  machineGun: { cap: 4, kind: 'ladder', stub: false },
  flak: { cap: 4, kind: 'ladder', stub: false },
  broadside: { cap: 5, kind: 'equipment', stub: false },
  starShells: { cap: 5, kind: 'equipment', stub: false },
  hullRepair: { cap: 5, kind: 'consumable', stub: false }, // LIVE since Story 8.8 (R13)
  shieldBlock: { cap: 5, kind: 'consumable', stub: false }, // LIVE since 8.16 (R37)
  smokeScreen: { cap: 5, kind: 'consumable', stub: true },
  chaff: { cap: 5, kind: 'consumable', stub: false }, // LIVE since 8.16 (R39)
  decoyBuoy: { cap: 5, kind: 'consumable', stub: false }, // LIVE since 8.16 (R36)
  depthCharge: { cap: 5, kind: 'consumable', stub: true }, // NEW in 8.13 (amendment 83)
  // AN EQUIPMENT LINE since 8.13 (amendment 81) — it keeps its LINE_IDS slot.
  foulingMines: { cap: 5, kind: 'equipment', stub: false },
  dazzleShells: { cap: 1, kind: 'addon', stub: false },
  phosphorShells: { cap: 1, kind: 'addon', stub: false },
};

/** The 2 stub ids (Eric ruling 2026-09-15, amendment 5). 13 until Story 8.8
 *  built HULL REPAIR's effect, 12 until Story 8.13 built the LIGHT TORPEDO,
 *  the CAPTIVE MINE and the SUPERCAV TORPEDO (which also stopped being an
 *  equipment line) and added the stub DEPTH CHARGE, 10 until Story 8.15 cut
 *  missile/monitor/heatSeeking and built the machine gun and flak ladders,
 *  5 until Story 8.16 built SHIELD BLOCK, CHAFF and DECOY BUOY. Both left are
 *  CONSUMABLES (SMOKE SCREEN, DEPTH CHARGE — 8.17 / Eric). */
const STUB_IDS: readonly LineId[] = ['smokeScreen', 'depthCharge'];

describe('catalog v3 identity', () => {
  it('ships 26 lines in the ruled order, keyed by id', () => {
    expect(LINE_IDS.length).toBe(26);
    expect(Object.keys(CATALOG)).toEqual([...LINE_IDS]);
    for (const id of LINE_IDS) expect(CATALOG[id].id).toBe(id);
  });

  it('matches the sheet line for line (cap, kind, stub) and sums to 109 cards', () => {
    for (const id of LINE_IDS) {
      const line = CATALOG[id];
      expect({ cap: line.cap, kind: line.kind, stub: line.stub === true }).toEqual(SHEET[id]);
    }
    expect(catalogCardCount()).toBe(109);
  });

  it('has tiers.length === cap on every line', () => {
    for (const id of LINE_IDS) expect(CATALOG[id].tiers.length).toBe(CATALOG[id].cap);
  });

  it('pins the 2-line stub set exactly — no equipment or ladder stub is left (Story 8.15, 8.16)', () => {
    expect(LINE_IDS.filter((id) => isStubLine(id)).sort()).toEqual([...STUB_IDS].sort());
    expect(isStubLine('nope')).toBe(false);
  });

  it('gives every equipment line a copy-1 slotFill, and FOUR EMPTY tiers where the story has not landed', () => {
    // The five lines Story 8.13 authored (their exact steps are pinned in
    // stats.test.ts, against the numbers, not against the effect shapes).
    const LADDERED: readonly LineId[] = ['lightTorpedo', 'heavyTorpedo', 'navalMines', 'captiveMines', 'foulingMines'];
    for (const id of LINE_IDS) {
      const line = CATALOG[id];
      if (line.kind !== 'equipment') continue;
      expect(line.tiers[0], id).toEqual([{ kind: 'slotFill', equipmentId: id }]);
      if (LADDERED.includes(id)) {
        // Tiers II–V are the SAME step, four times, each in its OWN array.
        for (const tier of line.tiers.slice(1)) expect(tier, id).toEqual(line.tiers[1]);
        expect(line.tiers[1]!.length, id).toBeGreaterThan(0);
        for (const e of line.tiers[1]!) expect(e.kind, id).toBe('stat');
      } else {
        // broadside + star shells (8.16).
        expect(line.tiers.slice(1), id).toEqual([[], [], [], []]);
      }
    }
    expect(LINE_IDS.filter((id) => CATALOG[id].kind === 'equipment')).toHaveLength(7);
  });

  it('NO equipment tier authors a reload effect — the −5 %/tier step is DERIVED', () => {
    // catalog-v3 §3's standing rule lives in sim/stats.ts reloadTierScale, not
    // in the sheet: one derivation in the engine, never restated on four tiers
    // of five lines.
    for (const id of LINE_IDS) {
      for (const tier of CATALOG[id].tiers) {
        for (const e of tier) {
          if (e.kind === 'stat') expect(e.path.endsWith('.reloadMs'), `${id}:${e.path}`).toBe(false);
        }
      }
    }
  });

  it('gives every consumable a `stock` on every copy and nothing else', () => {
    for (const id of LINE_IDS) {
      const line = CATALOG[id];
      if (line.kind !== 'consumable') continue;
      for (const tier of line.tiers) expect(tier).toEqual([{ kind: 'stock', equipmentId: id }]);
    }
  });

  it('wires each of the TWO surviving add-ons to the equipment catalog-v3 §4 names', () => {
    // TWO ADD-ONS WENT IN 8.13 (Eric rulings 2026-09-19, epic-8 amendments
    // 80/81): ACOUSTIC HOMING is deleted outright (homing became a tier stat on
    // the torpedo lines) and FOULING MINES became its own tiered EQUIPMENT line.
    // A THIRD WENT IN 8.15: HEAT SEEKING is CUT with the missile (89e).
    expect(LINE_IDS.filter((id) => CATALOG[id].kind === 'addon')).toEqual([
      'dazzleShells', 'phosphorShells',
    ]);
    expect(CATALOG.dazzleShells.appliesTo).toEqual(['starShells']);
    expect(CATALOG.phosphorShells.appliesTo).toEqual(['starShells']);
    expect((CATALOG as Record<string, unknown>).acousticHoming).toBeUndefined();
  });

  it('CUTS missile, monitor and heat seeking end to end (Story 8.15, amendment 89e)', () => {
    const lines = CATALOG as Record<string, unknown>;
    for (const id of ['missile', 'monitor', 'heatSeeking']) {
      expect((LINE_IDS as readonly string[]).includes(id), id).toBe(false);
      expect(lines[id], id).toBeUndefined();
      expect((EQUIPMENT_IDS as readonly string[]).includes(id), id).toBe(false);
    }
  });

  it('DELETES the radar buoy end to end — 13 equipment ids, no card fits it (Story 8.16)', () => {
    expect((EQUIPMENT_IDS as readonly string[]).includes('radarBuoy')).toBe(false);
    expect(EQUIPMENT_IDS).toHaveLength(13);
    expect((CONFIG as Record<string, unknown>).radarBuoy).toBeUndefined();
    // The DECOY BUOY that replaces it is a live CONSUMABLE line, not equipment.
    expect(CATALOG.decoyBuoy.kind).toBe('consumable');
    expect(CATALOG.decoyBuoy.stub).toBeUndefined();
  });

  it('the MACHINE GUN and FLAK lines are their guns\' LADDERS, exactly like DECK GUN (amendments 104/105)', () => {
    // Per tier: MACHINE GUN +2 shells and +1 damage; FLAK +2 damage (blast
    // fixed). The −5 % reload is the derived tier step, never an effect.
    expect(CATALOG.machineGun.appliesTo).toEqual(['machineGun']);
    expect(CATALOG.flak.appliesTo).toEqual(['flak']);
    for (const tier of CATALOG.machineGun.tiers) {
      expect(tier).toEqual([
        { kind: 'stat', path: 'equipment.machineGun.maxAmmo', add: 2 },
        { kind: 'stat', path: 'equipment.machineGun.damage', add: 1 },
      ]);
    }
    for (const tier of CATALOG.flak.tiers) {
      expect(tier).toEqual([{ kind: 'stat', path: 'equipment.flak.damage', add: 2 }]);
    }
    // Each ladder advances its OWN gun's tier (the reload step reads it).
    expect(tierTargetOf(CATALOG.machineGun)).toBe('machineGun');
    expect(tierTargetOf(CATALOG.flak)).toBe('flak');
    expect(tierTargetOf(CATALOG.deckGun)).toBe('gun');
    // No stub flag on either (STUB_ROWS drained with them).
    expect(CATALOG.machineGun.stub).toBeUndefined();
    expect(CATALOG.flak.stub).toBeUndefined();
  });

  it('marks ARMOR as the one heal-on-grant line', () => {
    expect(LINE_IDS.filter((id) => CATALOG[id].healOnGrant === true)).toEqual(['armor']);
  });

  it('is deep-frozen', () => {
    expect(Object.isFrozen(CATALOG)).toBe(true);
    for (const id of LINE_IDS) expect(Object.isFrozen(CATALOG[id])).toBe(true);
  });

  // THE CATALOG IS SHARED, MUTABLE-BY-DEFAULT DATA. `effectiveStats` reads the
  // effect objects on EVERY fold, on both sides — so one stray write to a tier
  // array or an effect object is a permanent, silent, cross-match stat change
  // (and a desync, because only one side ran the code that wrote it). Freezing
  // the rows alone left every array and every effect object below them open.
  it('is deep-frozen at EVERY depth: tiers, each tier array, each effect, appliesTo', () => {
    for (const id of LINE_IDS) {
      const line = CATALOG[id];
      expect(Object.isFrozen(line.tiers), id).toBe(true);
      for (const tier of line.tiers) {
        expect(Object.isFrozen(tier), id).toBe(true);
        for (const e of tier) expect(Object.isFrozen(e), id).toBe(true);
      }
      if (line.appliesTo !== undefined) expect(Object.isFrozen(line.appliesTo), id).toBe(true);
    }
  });

  it('gives every ladder tier its OWN array, and refuses a mutation of an effect', () => {
    expect(CATALOG.armor.tiers[0]).not.toBe(CATALOG.armor.tiers[1]);
    expect(() => {
      (CATALOG.armor.tiers[0][0] as unknown as { add: number }).add = 999;
    }).toThrow();
    expect(effectiveStats(CONFIG.shipClasses.torpedoBoat, ['armor']).maxHp)
      .toBe(effectiveStats(CONFIG.shipClasses.torpedoBoat, []).maxHp + 25);
  });
});

describe('validateCatalog', () => {
  it('passes the production catalog', () => {
    expect(validateCatalog()).toEqual([]);
    for (const id of LINE_IDS) expect(validateLine(CATALOG[id])).toEqual([]);
  });

  it('refuses tiers.length ≠ cap', () => {
    const line: CatalogLine = { id: 'armor', kind: 'ladder', cap: 3, tiers: [[], []] };
    expect(validateLine(line).join(' ')).toContain('tiers.length 2 ≠ cap 3');
  });

  it('refuses a key that does not match its line id', () => {
    const bad: Catalog = { speed: CATALOG.armor };
    expect(validateCatalog(bad).join(' ')).toContain("key 'speed' does not match line id 'armor'");
  });

  it('refuses off-whitelist stat paths, unknown doctrine verbs and unknown slotFill/stock targets', () => {
    const bad: Catalog = {
      a: { id: 'armor', kind: 'ladder', cap: 1, tiers: [[{ kind: 'stat', path: 'sightRange' as never, add: 1 }]] },
      b: { id: 'speed', kind: 'addon', cap: 1, tiers: [[{ kind: 'doctrine', weapon: 'gun', mode: 'homing' }]] },
      c: { id: 'turning', kind: 'equipment', cap: 1, tiers: [[{ kind: 'slotFill', equipmentId: 'nope' as never }]] },
      d: { id: 'reload', kind: 'consumable', cap: 1, tiers: [[{ kind: 'stock', equipmentId: 'nope' as never }]] },
    };
    const errs = validateCatalog(bad).join(' | ');
    expect(errs).toContain("off-whitelist stat path 'sightRange'");
    expect(errs).toContain("doctrine on non-doctrine equipment 'gun'");
    expect(errs).toContain("slotFill of unknown equipment 'nope'");
    expect(errs).toContain("stock of unknown consumable 'nope'");
  });

  it('REFUSES a stat path that takes add from one line and mult from another', () => {
    const bad: Catalog = {
      armor: { id: 'armor', kind: 'ladder', cap: 1, tiers: [[{ kind: 'stat', path: 'maxHp', add: 25 }]] },
      speed: { id: 'speed', kind: 'ladder', cap: 1, tiers: [[{ kind: 'stat', path: 'maxHp', mult: 1.1 }]] },
    };
    const errs = validateCatalog(bad).join(' | ');
    expect(errs).toContain("stat path 'maxHp' takes add (armor) and mult (speed)");
  });

  it('refuses add and mult on one path even inside ONE line, across tiers', () => {
    const bad: Catalog = {
      armor: {
        id: 'armor',
        kind: 'ladder',
        cap: 2,
        tiers: [[{ kind: 'stat', path: 'maxHp', add: 25 }], [{ kind: 'stat', path: 'maxHp', mult: 1.1 }]],
      },
    };
    expect(validateCatalog(bad).join(' | ')).toContain("stat path 'maxHp' takes add");
  });

  // --- THE CROSS-LINE / SHAPE RULES (review gate, Story 8.1) ---------------
  // Four authoring mistakes the validator could not see, each of which ships a
  // card that silently does nothing (or a tier that silently gets overwritten).
  // Every one of them proves the PRODUCTION catalog still passes, above.

  it('refuses a NON-STUB add-on whose every target line is a STUB (a dead card)', () => {
    // The rule outlived its original example: ACOUSTIC HOMING was the live
    // add-on over a stub light torpedo, and it is deleted (amendment 80). The
    // shape is pinned through an injected catalog instead, and production —
    // which has no add-on over a STUB line at all since HEAT SEEKING was cut
    // (8.15) — still passes.
    const bad: Catalog = {
      heavyTorpedo: { id: 'heavyTorpedo', kind: 'equipment', cap: 1, stub: true, tiers: [[{ kind: 'slotFill', equipmentId: 'heavyTorpedo' }]] },
      dazzleShells: { id: 'dazzleShells', kind: 'addon', cap: 1, appliesTo: ['heavyTorpedo'], tiers: [[{ kind: 'doctrine', weapon: 'starShells', mode: 'dazzle' }]] },
    };
    expect(validateCatalog(bad).join(' | ')).toContain('dazzleShells: live add-on applies only to STUB equipment');
    expect(validateCatalog()).toEqual([]);
  });

  it('refuses TWO lines advancing the tier of the same equipment row', () => {
    const bad: Catalog = {
      heavyTorpedo: CATALOG.heavyTorpedo,
      deckGun: { id: 'deckGun', kind: 'ladder', cap: 1, appliesTo: ['heavyTorpedo'], tiers: [[]] },
    };
    expect(validateCatalog(bad).join(' | ')).toContain("two lines advance the tier of 'heavyTorpedo'");
  });

  it('refuses a LADDER that names more than one appliesTo equipment', () => {
    const bad: CatalogLine = { id: 'deckGun', kind: 'ladder', cap: 1, appliesTo: ['gun', 'broadside'], tiers: [[]] };
    expect(validateLine(bad).join(' ')).toContain('deckGun: a ladder may name at most ONE appliesTo equipment');
  });

  it('refuses an EQUIPMENT line whose copy 1 does not fit anything', () => {
    const bad: CatalogLine = { id: 'broadside', kind: 'equipment', cap: 2, tiers: [[], []] };
    expect(validateLine(bad).join(' ')).toContain('broadside: an equipment line needs a slotFill on copy 1');
  });

  it('refuses a healOnGrant line with no positive maxHp add', () => {
    const bad: CatalogLine = {
      id: 'armor', kind: 'ladder', cap: 1, healOnGrant: true,
      tiers: [[{ kind: 'stat', path: 'kinematics.maxSpeed', add: 1 }]],
    };
    expect(validateLine(bad).join(' ')).toContain('healOnGrant requires a positive maxHp add effect');
  });
});

describe('resolveCards', () => {
  it('keeps list order, resolves repeats each time and drops junk fail-closed', () => {
    expect(resolveCards(['armor', 'nope', 'armor', 'constructor']).map((l) => l.id)).toEqual(['armor', 'armor']);
    expect(resolveCards([])).toEqual([]);
  });
});

/** A random legal multiset: every NON-STUB line, 0..cap copies. */
function randomHand(rng: { next: () => number }): LineId[] {
  const hand: LineId[] = [];
  for (const id of LINE_IDS) {
    if (isStubLine(id)) continue;
    const n = Math.floor(rng.next() * (CATALOG[id].cap + 1));
    for (let i = 0; i < n; i += 1) hand.push(id);
  }
  return hand;
}

/** Fisher-Yates over the injected stream — deterministic per seed. */
function shuffle<T>(xs: readonly T[], rng: { next: () => number }): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng.next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

describe('THE ORDER-INDEPENDENCE PROPERTY', () => {
  it('folds any legal multiset byte-identically under any permutation, on every class', () => {
    const rng = mulberry32(0x81CA0D07);
    let cases = 0;
    for (let round = 0; round < 70; round += 1) {
      const hand = randomHand(rng);
      for (const clsId of SHIP_CLASS_IDS) {
        const cls = CONFIG.shipClasses[clsId];
        const a = effectiveStats(cls, hand);
        const b = effectiveStats(cls, shuffle(hand, rng));
        expect(a).toEqual(b);
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
        cases += 1;
      }
    }
    expect(cases).toBeGreaterThanOrEqual(200);
  });

  it('caps a line at its `cap` — a sixth copy of a cap-5 line buys nothing', () => {
    const cls = CONFIG.shipClasses.battleship;
    const five = effectiveStats(cls, new Array<LineId>(5).fill('reload'));
    const nine = effectiveStats(cls, new Array<LineId>(9).fill('reload'));
    expect(nine).toEqual(five);
    expect(five.cooldownScale).toBe(0.75);
  });
});

// ---------------------------------------------------------------------------
// THE UNHOMED LINES (Story 8.14). The three default decks are DELETED
// (Eric ruling 2026-09-21, epic-8 amendment 89a): no card is class-locked and
// none is brought to a match, so "which hull carries this line" is no longer a
// fact about the catalog. What survives of the old block is the one claim that
// still means something — THE FIVE LINES THAT WERE IN NO DEFAULT DECK ARE
// DRAWABLE BY EVERYONE NOW, exactly like every other non-stub line.
// ---------------------------------------------------------------------------

/** The lines that were in no default deck when decks existed (five until
 *  HEAT SEEKING was cut in Story 8.15). */
const FORMERLY_UNHOMED: readonly LineId[] = ['foulingMines', 'broadside', 'decoyBuoy', 'phosphorShells'];

describe('THE COMMON POOL — nothing is homed to a hull any more (amendment 89a)', () => {
  it('every line the catalog knows is in LINE_IDS, and the formerly-unhomed lines are ordinary lines', () => {
    for (const id of FORMERLY_UNHOMED) {
      expect(LINE_IDS.includes(id), id).toBe(true);
      expect(CATALOG[id], id).toBeDefined();
    }
  });

  it('the deck engine is gone from the barrel — no default decks, no ownership, no legality', () => {
    const barrel = shared as Record<string, unknown>;
    for (const name of [
      'DEFAULT_DECKS',
      'DEFAULT_OWNED',
      'deckFromCounts',
      'equipmentLineCount',
      'checkDeck',
      'buildDeckState',
      'consumeCard',
      'rollMatchPool',
      'sanitizePool',
      'consumableLines',
    ]) {
      expect(barrel[name], name).toBeUndefined();
    }
  });
});
