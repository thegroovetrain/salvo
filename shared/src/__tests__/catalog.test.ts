// THE CATALOG (Story 8.1) — catalog v3's identity, its authoring validator and
// THE ORDER-INDEPENDENCE PROPERTY.
//
// Pinned here: 29 lines / 114 cards with the exact per-line caps and kinds of
// `catalog-v3.md` §1; `tiers.length === cap` on every line; the 13-line stub
// set; the validator's rules, including its refusal of a stat path that takes
// `add` from one line and `mult` from another; and a seeded permutation
// property — ≥200 shuffles of random legal multisets over all three classes,
// deep-equal AND JSON-identical.

import { describe, it, expect } from 'vitest';
import {
  CATALOG,
  CONFIG,
  LINE_IDS,
  SHIP_CLASS_IDS,
  catalogCardCount,
  effectiveStats,
  isStubLine,
  mulberry32,
  resolveCards,
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
  hullRepair: { cap: 5, kind: 'consumable', stub: true },
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

/** The 13 stub ids (Eric ruling 2026-09-15, amendment 5). */
const STUB_IDS: readonly LineId[] = [
  'lightTorpedo', 'supercavTorpedo', 'captiveMines', 'missile', 'machineGun', 'flak', 'monitor',
  'hullRepair', 'shieldBlock', 'smokeScreen', 'chaff', 'decoyBuoy', 'heatSeeking',
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

  it('pins the 13-line stub set exactly', () => {
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
