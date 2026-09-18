// THE CATALOG (Story 8.1) — catalog v3's identity, its authoring validator and
// THE ORDER-INDEPENDENCE PROPERTY.
//
// Pinned here: 29 lines / 114 cards with the exact per-line caps and kinds of
// `catalog-v3.md` §1; `tiers.length === cap` on every line; the 12-line stub
// set; the validator's rules, including its refusal of a stat path that takes
// `add` from one line and `mult` from another; and a seeded permutation
// property — ≥200 shuffles of random legal multisets over all three classes,
// deep-equal AND JSON-identical.

import { describe, it, expect } from 'vitest';
import {
  CATALOG,
  CONFIG,
  DEFAULT_DECKS,
  DEFAULT_OWNED,
  LINE_IDS,
  SHIP_CLASS_IDS,
  SPAWN_SEED,
  catalogCardCount,
  deckFromCounts,
  effectiveStats,
  equipmentLineCount,
  isStubLine,
  mulberry32,
  resolveCards,
  validateCatalog,
  validateLine,
  type Catalog,
  type CatalogLine,
  type LineId,
  type LineKind,
  type ShipClassId,
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
  lightTorpedo: { cap: 5, kind: 'equipment', stub: true },
  heavyTorpedo: { cap: 5, kind: 'equipment', stub: false },
  supercavTorpedo: { cap: 5, kind: 'equipment', stub: true },
  navalMines: { cap: 5, kind: 'equipment', stub: false },
  captiveMines: { cap: 5, kind: 'equipment', stub: true },
  missile: { cap: 5, kind: 'equipment', stub: true },
  machineGun: { cap: 5, kind: 'equipment', stub: true },
  flak: { cap: 5, kind: 'equipment', stub: true },
  monitor: { cap: 5, kind: 'equipment', stub: true },
  broadside: { cap: 5, kind: 'equipment', stub: false },
  starShells: { cap: 5, kind: 'equipment', stub: false },
  hullRepair: { cap: 5, kind: 'consumable', stub: false }, // LIVE since Story 8.8 (R13)
  shieldBlock: { cap: 5, kind: 'consumable', stub: true },
  smokeScreen: { cap: 5, kind: 'consumable', stub: true },
  chaff: { cap: 5, kind: 'consumable', stub: true },
  decoyBuoy: { cap: 5, kind: 'consumable', stub: true },
  acousticHoming: { cap: 1, kind: 'addon', stub: false },
  foulingMines: { cap: 1, kind: 'addon', stub: false },
  heatSeeking: { cap: 1, kind: 'addon', stub: true },
  dazzleShells: { cap: 1, kind: 'addon', stub: false },
  phosphorShells: { cap: 1, kind: 'addon', stub: false },
};

/** The 12 stub ids (Eric ruling 2026-09-15, amendment 5). 13 until Story 8.8
 *  built HULL REPAIR's effect and made it the first dealt consumable. */
const STUB_IDS: readonly LineId[] = [
  'lightTorpedo', 'supercavTorpedo', 'captiveMines', 'missile', 'machineGun', 'flak', 'monitor',
  'shieldBlock', 'smokeScreen', 'chaff', 'decoyBuoy', 'heatSeeking',
];

describe('catalog v3 identity', () => {
  it('ships 29 lines in the ruled order, keyed by id', () => {
    expect(LINE_IDS.length).toBe(29);
    expect(Object.keys(CATALOG)).toEqual([...LINE_IDS]);
    for (const id of LINE_IDS) expect(CATALOG[id].id).toBe(id);
  });

  it('matches the sheet line for line (cap, kind, stub) and sums to 114 cards', () => {
    for (const id of LINE_IDS) {
      const line = CATALOG[id];
      expect({ cap: line.cap, kind: line.kind, stub: line.stub === true }).toEqual(SHEET[id]);
    }
    expect(catalogCardCount()).toBe(114);
  });

  it('has tiers.length === cap on every line', () => {
    for (const id of LINE_IDS) expect(CATALOG[id].tiers.length).toBe(CATALOG[id].cap);
  });

  it('pins the 12-line stub set exactly', () => {
    expect(LINE_IDS.filter((id) => isStubLine(id)).sort()).toEqual([...STUB_IDS].sort());
    expect(isStubLine('nope')).toBe(false);
  });

  it('gives every equipment line a copy-1 slotFill and FOUR EMPTY tiers (8.12–8.16 fill them)', () => {
    for (const id of LINE_IDS) {
      const line = CATALOG[id];
      if (line.kind !== 'equipment') continue;
      expect(line.tiers[0]).toEqual([{ kind: 'slotFill', equipmentId: id }]);
      expect(line.tiers.slice(1)).toEqual([[], [], [], []]);
    }
  });

  it('gives every consumable a `stock` on every copy and nothing else', () => {
    for (const id of LINE_IDS) {
      const line = CATALOG[id];
      if (line.kind !== 'consumable') continue;
      for (const tier of line.tiers) expect(tier).toEqual([{ kind: 'stock', equipmentId: id }]);
    }
  });

  it('wires each add-on to the equipment catalog-v3 §4 names', () => {
    expect(CATALOG.acousticHoming.appliesTo).toEqual(['lightTorpedo', 'heavyTorpedo']);
    expect(CATALOG.foulingMines.appliesTo).toEqual(['navalMines']);
    expect(CATALOG.heatSeeking.appliesTo).toEqual(['missile']);
    expect(CATALOG.dazzleShells.appliesTo).toEqual(['starShells']);
    expect(CATALOG.phosphorShells.appliesTo).toEqual(['starShells']);
    expect(CATALOG.acousticHoming.tiers[0]).toEqual([
      { kind: 'doctrine', weapon: 'lightTorpedo', mode: 'homing' },
      { kind: 'doctrine', weapon: 'heavyTorpedo', mode: 'homing' },
    ]);
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
    const bad: Catalog = {
      heavyTorpedo: { id: 'heavyTorpedo', kind: 'equipment', cap: 1, stub: true, tiers: [[{ kind: 'slotFill', equipmentId: 'heavyTorpedo' }]] },
      acousticHoming: { id: 'acousticHoming', kind: 'addon', cap: 1, appliesTo: ['heavyTorpedo'], tiers: [[{ kind: 'doctrine', weapon: 'heavyTorpedo', mode: 'homing' }]] },
    };
    expect(validateCatalog(bad).join(' | ')).toContain('acousticHoming: live add-on applies only to STUB equipment');
    // ...and the production acousticHoming is fine: it also names heavyTorpedo,
    // which is live, even though lightTorpedo is still a stub.
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
    const bad: CatalogLine = { id: 'monitor', kind: 'equipment', cap: 2, tiers: [[], []] };
    expect(validateLine(bad).join(' ')).toContain('monitor: an equipment line needs a slotFill on copy 1');
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
// THE DEFAULT DECKS (Story 8.2 — Eric ruling 2026-09-15, epic-8 amendment 10,
// delivered as a spreadsheet). The counts below are the ruling, transcribed
// count for count; the code is checked AGAINST them, never the other way
// round. Every count is at or under its cap (spec Block-If: verified here),
// each deck is 40 with exactly three equipment lines, and the five unhomed
// lines appear in none of them.
// ---------------------------------------------------------------------------

/** Amendment 10's 30 universal cards. */
const UNIVERSAL: Partial<Record<LineId, number>> = {
  armor: 3, speed: 3, turning: 3, radarSweep: 3, reload: 3,
  hullRepair: 3, shieldBlock: 3, smokeScreen: 2, chaff: 2,
  deckGun: 2, deckGunTurret: 1, deckGunBarrel: 2,
};

/** Amendment 10's per-hull ten. */
const PER_HULL: Record<ShipClassId, Partial<Record<LineId, number>>> = {
  torpedoBoat: { lightTorpedo: 3, heavyTorpedo: 3, machineGun: 3, acousticHoming: 1 },
  mineLayer: { navalMines: 3, captiveMines: 3, flak: 3, foulingMines: 1 },
  battleship: { missile: 3, monitor: 3, starShells: 3, dazzleShells: 1 },
};

/** The five lines in no default deck (amendment 10). */
const UNHOMED: readonly LineId[] = ['supercavTorpedo', 'broadside', 'decoyBuoy', 'heatSeeking', 'phosphorShells'];

function countsOf(ids: readonly LineId[]): Map<LineId, number> {
  const out = new Map<LineId, number>();
  for (const id of ids) out.set(id, (out.get(id) ?? 0) + 1);
  return out;
}

describe('DEFAULT_DECKS — amendment 10, count for count', () => {
  it.each(SHIP_CLASS_IDS)('%s: 40 cards at exactly the ruled counts, in LINE_IDS order', (hull) => {
    const deck = DEFAULT_DECKS[hull];
    expect(deck).toHaveLength(CONFIG.deck.size);
    const expected = { ...UNIVERSAL, ...PER_HULL[hull] };
    const counts = countsOf(deck);
    for (const id of LINE_IDS) expect(counts.get(id) ?? 0, `${hull}:${id}`).toBe(expected[id] ?? 0);
    // Composition order is LINE_IDS order — the determinism contract.
    const order = [...new Set(deck)];
    expect(order).toEqual(LINE_IDS.filter((id) => (expected[id] ?? 0) > 0));
    // Thirty universal + ten per hull.
    expect(Object.values(UNIVERSAL).reduce((a, b) => a + b, 0)).toBe(30);
    expect(Object.values(PER_HULL[hull]).reduce((a, b) => a + b, 0)).toBe(10);
  });

  it.each(SHIP_CLASS_IDS)('%s: exactly three equipment lines, every count at or under its cap', (hull) => {
    expect(equipmentLineCount(DEFAULT_DECKS[hull])).toBe(CONFIG.deck.maxEquipmentLines);
    for (const [id, n] of countsOf(DEFAULT_DECKS[hull])) expect(n, `${hull}:${id}`).toBeLessThanOrEqual(CATALOG[id].cap);
  });

  it('the five UNHOMED lines appear in no default deck', () => {
    for (const hull of SHIP_CLASS_IDS) {
      for (const id of UNHOMED) expect(DEFAULT_DECKS[hull].includes(id), `${hull}:${id}`).toBe(false);
    }
  });

  it('the Battleship no longer carries HEAT SEEKING (amendment 10 vs FR56)', () => {
    expect(DEFAULT_DECKS.battleship.includes('heatSeeking')).toBe(false);
  });

  it('DEFAULT_OWNED is the union of the three decks — 24 of the 29 lines, the unhomed five absent', () => {
    const union = new Set<LineId>(SHIP_CLASS_IDS.flatMap((h) => [...DEFAULT_DECKS[h]]));
    expect(DEFAULT_OWNED).toEqual(union);
    expect(DEFAULT_OWNED.size).toBe(LINE_IDS.length - UNHOMED.length);
    for (const id of UNHOMED) expect(DEFAULT_OWNED.has(id)).toBe(false);
  });

  it('is frozen: the record, each list, and the owned set', () => {
    expect(Object.isFrozen(DEFAULT_DECKS)).toBe(true);
    for (const hull of SHIP_CLASS_IDS) expect(Object.isFrozen(DEFAULT_DECKS[hull])).toBe(true);
    expect(Object.isFrozen(DEFAULT_OWNED)).toBe(true);
    expect(() => { (DEFAULT_DECKS.torpedoBoat as LineId[]).push('armor'); }).toThrow();
  });

  it('DEFAULT_OWNED REFUSES add/delete/clear — Object.freeze alone does not close a Set', () => {
    // The legality authority the door checks every deck against: a mutation
    // here would unlock (or lock out) a line for every captain in the process.
    const owned = DEFAULT_OWNED as Set<LineId>;
    expect(() => owned.add('phosphorShells')).toThrow('DEFAULT_OWNED is immutable');
    expect(DEFAULT_OWNED.has('phosphorShells')).toBe(false);
    expect(() => owned.delete('armor')).toThrow('DEFAULT_OWNED is immutable');
    expect(DEFAULT_OWNED.has('armor')).toBe(true);
    expect(() => owned.clear()).toThrow('DEFAULT_OWNED is immutable');
    expect(DEFAULT_OWNED.size).toBe(LINE_IDS.length - UNHOMED.length);
  });
});

// ---------------------------------------------------------------------------
// SPAWN_SEED — the INTERIM table Story 8.10 deletes (epic-8 amendment 21).
// ---------------------------------------------------------------------------
describe('SPAWN_SEED — the interim spawn seed (Story 8.5, amendment 21)', () => {
  it('keys are exactly the three PICKABLE hulls — no drone hull is seeded (amendment 24)', () => {
    expect(Object.keys(SPAWN_SEED).sort()).toEqual([...SHIP_CLASS_IDS].sort());
    for (const hull of SHIP_CLASS_IDS) expect(SPAWN_SEED[hull], hull).toBeDefined();
  });

  it('is today\u2019s shipped class fit, line for line', () => {
    expect(SPAWN_SEED.torpedoBoat).toEqual(['heavyTorpedo']);
    expect(SPAWN_SEED.battleship).toEqual(['broadside', 'starShells']);
    expect(SPAWN_SEED.mineLayer).toEqual(['navalMines']);
  });

  it('every seeded id is a LIVE (non-stub) EQUIPMENT line of the catalog', () => {
    for (const hull of SHIP_CLASS_IDS) {
      for (const id of SPAWN_SEED[hull] ?? []) {
        expect(LINE_IDS.includes(id), id).toBe(true);
        expect(CATALOG[id].kind, id).toBe('equipment');
        expect(isStubLine(id), id).toBe(false);
      }
      // ...and no hull is seeded past the three-wide weapon row on its own.
      expect(new Set(SPAWN_SEED[hull] ?? []).size, hull).toBe((SPAWN_SEED[hull] ?? []).length);
      expect((SPAWN_SEED[hull] ?? []).length, hull).toBeLessThanOrEqual(CONFIG.deck.maxEquipmentLines);
    }
  });

  it('is frozen at both depths (the table and each seed list)', () => {
    expect(Object.isFrozen(SPAWN_SEED)).toBe(true);
    for (const hull of SHIP_CLASS_IDS) expect(Object.isFrozen(SPAWN_SEED[hull]), hull).toBe(true);
    expect(() => { (SPAWN_SEED.torpedoBoat as LineId[]).push('navalMines'); }).toThrow();
  });
});

describe('deckFromCounts — the authoring helper refuses transcription slips at load', () => {
  it('expands counts in LINE_IDS order to a frozen 40-id list', () => {
    const deck = deckFromCounts({ ...UNIVERSAL, ...PER_HULL.torpedoBoat });
    expect(deck).toEqual(DEFAULT_DECKS.torpedoBoat);
    expect(Object.isFrozen(deck)).toBe(true);
    // Key order in the counts object does not matter — LINE_IDS order wins.
    expect(deckFromCounts({ ...PER_HULL.torpedoBoat, ...UNIVERSAL })).toEqual(DEFAULT_DECKS.torpedoBoat);
  });

  it('throws on a count over the cap', () => {
    expect(() => deckFromCounts({ ...UNIVERSAL, ...PER_HULL.torpedoBoat, acousticHoming: 2, armor: 2 })).toThrow(/acousticHoming.*cap/);
  });

  it('throws on a total other than CONFIG.deck.size', () => {
    expect(() => deckFromCounts({ ...UNIVERSAL, ...PER_HULL.torpedoBoat, armor: 4 })).toThrow(/41 cards/);
    expect(() => deckFromCounts({ ...UNIVERSAL })).toThrow(/30 cards/);
  });

  it('refuses a key an INJECTED catalog knows but LINE_IDS does not — the expansion walks LINE_IDS', () => {
    // The membership test must be LINE_IDS, not the (injectable) catalog:
    // the expansion loop walks LINE_IDS, so a count keyed outside it could
    // never become a card and used to be dropped in silence.
    const wider: Catalog = { ...CATALOG, phantomLine: { ...CATALOG.armor, id: 'phantomLine' as LineId } };
    expect(() =>
      deckFromCounts({ ...UNIVERSAL, ...PER_HULL.torpedoBoat, phantomLine: 3 } as Partial<Record<LineId, number>>, wider),
    ).toThrow(/unknown line 'phantomLine'/);
    // ...and a ZERO count for it is refused too: the key itself is the slip.
    expect(() =>
      deckFromCounts({ ...UNIVERSAL, ...PER_HULL.torpedoBoat, phantomLine: 0 } as Partial<Record<LineId, number>>, wider),
    ).toThrow(/not in LINE_IDS/);
  });

  it('throws on an unknown line and on a non-integer or negative count', () => {
    expect(() => deckFromCounts({ ...UNIVERSAL, ...PER_HULL.torpedoBoat, nope: 1 } as Partial<Record<LineId, number>>)).toThrow(/unknown line/);
    expect(() => deckFromCounts({ ...UNIVERSAL, ...PER_HULL.torpedoBoat, armor: 2.5 })).toThrow(/non-negative integer/);
    expect(() => deckFromCounts({ ...UNIVERSAL, ...PER_HULL.torpedoBoat, armor: -1 })).toThrow(/non-negative integer/);
  });
});
