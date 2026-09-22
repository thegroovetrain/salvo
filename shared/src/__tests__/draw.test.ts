// THE COMMON POOL DRAW (Story 8.14, Eric rulings 2026-09-21/22, epic-8
// amendments 89–95) — sim/draw.ts, the engine that replaced sim/deck.ts,
// sim/deckRules.ts and sim/pool.ts.
//
// Pins, all property-style over seeded mulberry32 streams:
//   (1) THE KIND-ODDS INVARIANT (amendment 92). The fraction of cards that are
//       WEAPONS matches the eligible weapon SHARE, and is UNCHANGED by the
//       weighting — pinned twice: statistically over 4000 seeds against an
//       exact oracle, and EXACTLY, seed by seed, as "the same kind sequence
//       with and without weights". The second is the stronger statement and is
//       structural: dealing a line of kind K removes exactly one line of kind
//       K, and stage 2 costs one rng value whatever the weights, so weighting
//       can only ever move WHICH weapon.
//   (2) ELIGIBILITY: no equipment copy 1 with the weapon row full; nothing at
//       or over its cap EXCEPT a consumable, which is dealt at cap on purpose
//       (amendment 94); gun ladders follow the MOUNTED gun; an add-on may be
//       held ahead of its host only while a weapon slot is open.
//   (3) THE WEIGHTING (amendment 90): 1.0 at zero takes, 0.75 at one, 0.5625
//       at two, floored at 0.25, monotone non-increasing.
//   (4) THE SHAPE: four DIFFERENT lines, a SHORTER offer when fewer lines are
//       eligible, never empty while a consumable is dealable, and same seed +
//       same inputs = same offer.
//   (5) THE LEVEL-ZERO GUARANTEE (amendment 93): card 0 is Story 8.10's
//       uniform pick over `usableLines`, UNAFFECTED by weights — pinned both
//       exactly (same seed, same card) and distributionally (uniform).
//
// Pure, zero I/O.

import { describe, it, expect } from 'vitest';
import {
  CATALOG,
  CONFIG,
  boonStackCount,
  drawOffer,
  eligibleLines,
  lineWeight,
  mulberry32,
  usableLines,
  type Catalog,
  type CatalogLine,
  type DrawKind,
  type DrawShip,
  type EquipmentId,
  type LineId,
  type Rng,
  type Weights,
} from '../index.js';

/** A ship with an open weapon row, holding nothing — the level-zero state. */
const OPEN: DrawShip = { held: [], weaponSlotOpen: true, mountedGun: 'gun' };

/** The same ship with all three weapon slots full. */
const CLOSED: DrawShip = { held: [], weaponSlotOpen: false, mountedGun: 'gun' };

/** No takes anywhere: every line at its base weight of 1.0. */
const NO_WEIGHTS: Weights = new Map<LineId, number>();

/** How many of `eligible` are of each kind. */
function kindCounts(eligible: readonly { kind: DrawKind }[]): Record<DrawKind, number> {
  const out: Record<DrawKind, number> = { weapon: 0, upgrade: 0, consumable: 0 };
  for (const e of eligible) out[e.kind] += 1;
  return out;
}

/** The kind of each dealt line, for a ship's eligible set. */
function kindsOf(ship: DrawShip, offer: readonly LineId[], catalog: Catalog = CATALOG): DrawKind[] {
  const byId = new Map(eligibleLines(ship, catalog).map((e) => [e.id, e.kind]));
  return offer.map((id) => byId.get(id) ?? 'consumable');
}

/** An rng that counts how many values it hands out. */
function countingRng(seed: number): { rng: Rng; calls: () => number } {
  const inner = mulberry32(seed);
  let n = 0;
  const next = (): number => {
    n += 1;
    return inner.next();
  };
  return {
    rng: {
      next,
      float: (min, max) => min + next() * (max - min),
      int: (min, max) => min + Math.floor(next() * (max - min + 1)),
      pick: <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)],
    },
    calls: () => n,
  };
}

/** A hand that fills every LADDER and ADD-ON to its cap — what a ship holds
 *  once it has taken every upgrade the pool can offer it. */
function everyUpgradeCapped(catalog: Catalog = CATALOG): LineId[] {
  const out: LineId[] = [];
  for (const key of Object.keys(catalog)) {
    const line = catalog[key];
    if (line === undefined || line.stub === true) continue;
    if (line.kind !== 'ladder' && line.kind !== 'addon') continue;
    for (let i = 0; i < line.cap; i += 1) out.push(key as LineId);
  }
  return out;
}

describe('eligibleLines — the whole eligibility law', () => {
  it('is in CATALOG key order and never holds a stub or an unknown id', () => {
    const order = Object.keys(CATALOG);
    const ids = eligibleLines(OPEN).map((e) => e.id);
    expect([...ids].sort((a, b) => order.indexOf(a) - order.indexOf(b))).toEqual(ids);
    for (const id of ids) expect(CATALOG[id]?.stub, id).not.toBe(true);
  });

  it('WITH A WEAPON SLOT OPEN: an unheld equipment line is kind `weapon`', () => {
    const byId = new Map(eligibleLines(OPEN).map((e) => [e.id, e.kind]));
    expect(byId.get('lightTorpedo')).toBe('weapon');
    expect(byId.get('heavyTorpedo')).toBe('weapon');
    expect(byId.get('navalMines')).toBe('weapon');
  });

  it('WITH THE ROW FULL: no unheld equipment line is eligible at all', () => {
    for (const e of eligibleLines(CLOSED)) {
      const line = CATALOG[e.id];
      if (line.kind !== 'equipment') continue;
      expect.fail(`${e.id} should not be eligible with the weapon row full`);
    }
    // ...and the kinds that survive are upgrades and consumables only.
    expect(kindCounts(eligibleLines(CLOSED)).weapon).toBe(0);
  });

  it('a HELD equipment line below its cap is an `upgrade` (the tier card), and at cap it is out', () => {
    const one: DrawShip = { ...CLOSED, held: ['lightTorpedo'] };
    expect(eligibleLines(one).find((e) => e.id === 'lightTorpedo')?.kind).toBe('upgrade');
    const capped: DrawShip = {
      ...CLOSED,
      held: new Array<LineId>(CATALOG.lightTorpedo.cap).fill('lightTorpedo'),
    };
    expect(eligibleLines(capped).some((e) => e.id === 'lightTorpedo')).toBe(false);
  });

  it('a GUN LADDER follows the MOUNTED gun (amendment 89d)', () => {
    // The production deck-gun ladder names `appliesTo: ['gun']`.
    expect(CATALOG.deckGun.appliesTo).toEqual(['gun']);
    expect(eligibleLines(OPEN).some((e) => e.id === 'deckGun')).toBe(true);
    const otherGun: DrawShip = { ...OPEN, mountedGun: 'machineGun' as EquipmentId };
    expect(eligibleLines(otherGun).some((e) => e.id === 'deckGun')).toBe(false);
    // ...while a ladder with NO appliesTo is gun-blind.
    expect(eligibleLines(otherGun).some((e) => e.id === 'deckGunTurret')).toBe(true);

    // And the mirror image, on an injected catalog: a ladder that names ANOTHER
    // gun is eligible exactly when that gun is the mounted one.
    const rows: Record<string, CatalogLine> = { ...CATALOG };
    rows.deckGun = { ...CATALOG.deckGun, appliesTo: ['machineGun'] };
    expect(eligibleLines(OPEN, rows).some((e) => e.id === 'deckGun')).toBe(false);
    expect(eligibleLines(otherGun, rows).some((e) => e.id === 'deckGun')).toBe(true);
  });

  it('an ADD-ON may be held ahead of its host while a slot is open, never with the row full', () => {
    expect(CATALOG.dazzleShells.appliesTo).toEqual(['starShells']);
    // Row open, no host held: held-ahead is allowed (amendment 89b).
    expect(eligibleLines(OPEN).some((e) => e.id === 'dazzleShells')).toBe(true);
    // Row full, no host: the card would be dead, so it is not dealt.
    expect(eligibleLines(CLOSED).some((e) => e.id === 'dazzleShells')).toBe(false);
    // Row full WITH the host aboard: eligible again.
    const hosted: DrawShip = { ...CLOSED, held: ['starShells'] };
    expect(eligibleLines(hosted).some((e) => e.id === 'dazzleShells')).toBe(true);
    // ...and at its cap of 1 it leaves, host or no host.
    const held: DrawShip = { ...CLOSED, held: ['starShells', 'dazzleShells'] };
    expect(eligibleLines(held).some((e) => e.id === 'dazzleShells')).toBe(false);
  });

  it('A CONSUMABLE IS ALWAYS ELIGIBLE — at its cap, with a full belt, always (amendment 94)', () => {
    const capped: DrawShip = {
      ...CLOSED,
      held: [
        ...new Array<LineId>(CATALOG.hullRepair.cap).fill('hullRepair'),
        ...new Array<LineId>(CATALOG.supercavTorpedo.cap).fill('supercavTorpedo'),
      ],
    };
    const eligible = eligibleLines(capped);
    const ids = eligible.map((e) => e.id);
    expect(ids).toContain('hullRepair');
    expect(ids).toContain('supercavTorpedo');
    // Both are still tagged `consumable`, and BOTH live consumable lines are
    // present — the cap filters equipment, ladders and add-ons, never these.
    expect(eligible.filter((e) => e.kind === 'consumable').map((e) => e.id))
      .toEqual(['supercavTorpedo', 'hullRepair']);
    expect(kindCounts(eligible).weapon).toBe(0); // the row is full
  });
});

describe('lineWeight — the weighting (amendments 90/91)', () => {
  it('is 1.0 at zero takes, 0.75 at one, 0.5625 at two, and floored at 0.25 from five on', () => {
    expect(lineWeight(0)).toBe(1);
    expect(lineWeight(1)).toBe(0.75);
    expect(lineWeight(2)).toBeCloseTo(0.5625, 12);
    expect(lineWeight(5)).toBe(0.25);
    expect(lineWeight(50)).toBe(0.25);
  });

  it('is monotone NON-INCREASING in takes and never leaves [floor, 1]', () => {
    let prev = Number.POSITIVE_INFINITY;
    for (let n = 0; n <= 40; n += 1) {
      const w = lineWeight(n);
      expect(w, `takes ${n}`).toBeLessThanOrEqual(prev);
      expect(w, `takes ${n}`).toBeGreaterThanOrEqual(CONFIG.offer.weighting.floor);
      expect(w, `takes ${n}`).toBeLessThanOrEqual(1);
      prev = w;
    }
  });

  it('reads its numbers from CONFIG.offer.weighting — both [DRAFT] harness dials', () => {
    expect(CONFIG.offer.weighting).toEqual({ factor: 0.75, floor: 0.25 });
    expect(lineWeight(1, { factor: 0.5, floor: 0.1 })).toBe(0.5);
    expect(lineWeight(9, { factor: 0.5, floor: 0.1 })).toBe(0.1);
  });
});

// ---------------------------------------------------------------------------
// THE KIND-ODDS INVARIANT (amendment 92, Eric verbatim: *"the odds of drawing A
// weapon are the same, but WHICH weapon it is gets weighted."*)
// ---------------------------------------------------------------------------

const SEEDS = 4000;

/** Heavy weighting on some weapons, none on the rest — the lopsided ledger the
 *  invariant has to survive. */
const LOPSIDED: Weights = new Map<LineId, number>([
  ['lightTorpedo', lineWeight(5)],
  ['heavyTorpedo', lineWeight(4)],
  ['navalMines', lineWeight(3)],
]);

describe('THE KIND-ODDS INVARIANT — weighting moves WHICH weapon, never whether', () => {
  it.each([['no weights', NO_WEIGHTS], ['a lopsided ledger', LOPSIDED]] as const)(
    "with %s, the first card is a weapon at exactly the eligible weapon's share",
    (_label, weights) => {
      const eligible = eligibleLines(OPEN);
      const expected = kindCounts(eligible).weapon / eligible.length;
      let weapons = 0;
      for (let seed = 0; seed < SEEDS; seed += 1) {
        const offer = drawOffer(OPEN, weights, mulberry32(seed));
        if (kindsOf(OPEN, offer)[0] === 'weapon') weapons += 1;
      }
      expect(weapons / SEEDS).toBeCloseTo(expected, 1); // within ±0.05; see below for ±3pp
      expect(Math.abs(weapons / SEEDS - expected)).toBeLessThan(0.03);
    },
  );

  it('EXACTLY: the kind sequence of an offer is byte-identical with and without weights', () => {
    // Structural, not statistical: dealing a line of kind K removes exactly one
    // line of kind K, so every later share is the same; and stage 2 spends one
    // rng value whatever the weights, so the streams stay aligned.
    let differentLines = 0;
    for (let seed = 0; seed < SEEDS; seed += 1) {
      const plain = drawOffer(OPEN, NO_WEIGHTS, mulberry32(seed));
      const weighted = drawOffer(OPEN, LOPSIDED, mulberry32(seed));
      expect(kindsOf(OPEN, weighted), `seed ${seed}`).toEqual(kindsOf(OPEN, plain));
      if (weighted.join() !== plain.join()) differentLines += 1;
    }
    // ...and the weighting is not inert: it really does change WHICH weapon.
    expect(differentLines).toBeGreaterThan(0);
  });

  it('a weighted-down line is drawn LESS often than an unweighted sibling of the same kind', () => {
    const heavy: Weights = new Map<LineId, number>([['lightTorpedo', lineWeight(5)]]);
    let discounted = 0;
    let sibling = 0;
    for (let seed = 0; seed < SEEDS; seed += 1) {
      const offer = drawOffer(OPEN, heavy, mulberry32(seed));
      if (offer.includes('lightTorpedo')) discounted += 1;
      if (offer.includes('heavyTorpedo')) sibling += 1;
    }
    expect(discounted).toBeGreaterThan(0); // less likely, NEVER impossible
    expect(discounted).toBeLessThan(sibling);
  });
});

describe('drawOffer — the shape of an offer', () => {
  it('deals CONFIG.offer.size DIFFERENT lines, every one of them eligible', () => {
    for (let seed = 0; seed < 500; seed += 1) {
      const offer = drawOffer(OPEN, NO_WEIGHTS, mulberry32(seed));
      expect(offer, `seed ${seed}`).toHaveLength(CONFIG.offer.size);
      expect(new Set(offer).size, `seed ${seed}`).toBe(offer.length);
      const eligible = new Set(eligibleLines(OPEN).map((e) => e.id));
      for (const id of offer) expect(eligible.has(id), `seed ${seed}:${id}`).toBe(true);
    }
  });

  it('is deterministic: the same seed and the same inputs give the same offer', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      expect(drawOffer(OPEN, LOPSIDED, mulberry32(seed))).toEqual(drawOffer(OPEN, LOPSIDED, mulberry32(seed)));
    }
  });

  it('spends exactly TWO rng values per dealt card — one per stage', () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const { rng, calls } = countingRng(seed);
      const offer = drawOffer(OPEN, NO_WEIGHTS, rng);
      expect(calls(), `seed ${seed}`).toBe(2 * offer.length);
    }
  });

  it('NEVER deals an equipment copy 1 with the weapon row full', () => {
    for (let seed = 0; seed < 500; seed += 1) {
      for (const id of drawOffer(CLOSED, LOPSIDED, mulberry32(seed))) {
        const line = CATALOG[id];
        expect(line.kind === 'equipment' && boonStackCount(CLOSED.held, id) === 0, `seed ${seed}:${id}`).toBe(false);
      }
    }
  });

  it('NEVER deals a line at or over its cap — EXCEPT a consumable, which is dealt at cap on purpose', () => {
    // A deep hand: every ladder and add-on maxed, one equipment line at cap,
    // both consumables at cap, the weapon row full.
    const held: LineId[] = [
      ...everyUpgradeCapped(),
      ...new Array<LineId>(CATALOG.lightTorpedo.cap).fill('lightTorpedo'),
      ...new Array<LineId>(CATALOG.hullRepair.cap).fill('hullRepair'),
      ...new Array<LineId>(CATALOG.supercavTorpedo.cap).fill('supercavTorpedo'),
    ];
    const ship: DrawShip = { held, weaponSlotOpen: false, mountedGun: 'gun' };
    let cappedConsumables = 0;
    for (let seed = 0; seed < 300; seed += 1) {
      const offer = drawOffer(ship, NO_WEIGHTS, mulberry32(seed));
      expect(offer.length, `seed ${seed}`).toBeGreaterThan(0); // never empty
      for (const id of offer) {
        const line = CATALOG[id];
        const copies = boonStackCount(held, id);
        if (line.kind === 'consumable') {
          if (copies >= line.cap) cappedConsumables += 1;
          continue;
        }
        expect(copies, `seed ${seed}:${id}`).toBeLessThan(line.cap);
      }
    }
    // BOTH HALVES PINNED: the at-cap consumables really were dealt (amendment
    // 94 — greyed client-side, refused server-side, never filtered out).
    expect(cappedConsumables).toBeGreaterThan(0);
  });

  it('gives a SHORTER offer when fewer than CONFIG.offer.size lines are eligible — never padded, never repeated', () => {
    const held: LineId[] = [
      ...everyUpgradeCapped(),
      ...new Array<LineId>(CATALOG.hullRepair.cap).fill('hullRepair'),
      ...new Array<LineId>(CATALOG.supercavTorpedo.cap).fill('supercavTorpedo'),
    ];
    const ship: DrawShip = { held, weaponSlotOpen: false, mountedGun: 'gun' };
    const eligible = eligibleLines(ship);
    expect(eligible.map((e) => e.id).sort()).toEqual(['hullRepair', 'supercavTorpedo']);
    for (let seed = 0; seed < 200; seed += 1) {
      const offer = drawOffer(ship, NO_WEIGHTS, mulberry32(seed));
      expect([...offer].sort(), `seed ${seed}`).toEqual(['hullRepair', 'supercavTorpedo']);
    }
  });

  it('IS NEVER EMPTY while any consumable line is dealable (amendment 94)', () => {
    // Even a ship that holds everything it possibly can is shown a card.
    const held: LineId[] = [];
    for (const key of Object.keys(CATALOG)) {
      const line = CATALOG[key];
      if (line.stub === true) continue;
      for (let i = 0; i < line.cap; i += 1) held.push(key as LineId);
    }
    const ship: DrawShip = { held, weaponSlotOpen: false, mountedGun: 'gun' };
    for (let seed = 0; seed < 100; seed += 1) {
      expect(drawOffer(ship, NO_WEIGHTS, mulberry32(seed)).length, `seed ${seed}`).toBeGreaterThan(0);
    }
  });

  it('a catalog with NOTHING dealable draws an empty offer rather than throwing', () => {
    const empty: Catalog = {};
    expect(drawOffer(OPEN, NO_WEIGHTS, mulberry32(1), empty)).toEqual([]);
    expect(drawOffer(OPEN, NO_WEIGHTS, mulberry32(1), empty, { guarantee: true })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// THE LEVEL-ZERO GUARANTEE (Story 8.10 as amended by amendment 93: level zero
// and its REDRAW only, and the weighting never touches it).
// ---------------------------------------------------------------------------

describe('the level-zero guarantee — card 0 is a USABLE card, uniformly', () => {
  const USABLE = usableLines([]);

  it('usableLines is every consumable + every unheld equipment line, in CATALOG order', () => {
    const expected = Object.keys(CATALOG).filter((id) => {
      const line = CATALOG[id];
      return line.stub !== true && (line.kind === 'consumable' || line.kind === 'equipment');
    });
    expect(USABLE).toEqual(expected);
    // A line the ship already holds is not usable; nor is one at cap.
    expect(usableLines(['lightTorpedo'])).not.toContain('lightTorpedo');
    expect(usableLines(new Array<LineId>(CATALOG.hullRepair.cap).fill('hullRepair'))).not.toContain('hullRepair');
  });

  it("card 0 is always usable, and the rest of the offer is the ordinary draw", () => {
    for (let seed = 0; seed < 500; seed += 1) {
      const offer = drawOffer(OPEN, LOPSIDED, mulberry32(seed), CATALOG, { guarantee: true });
      expect(offer, `seed ${seed}`).toHaveLength(CONFIG.offer.size);
      expect(USABLE, `seed ${seed}`).toContain(offer[0]);
      expect(new Set(offer).size, `seed ${seed}`).toBe(offer.length);
    }
  });

  it('THE GUARANTEED PICK IS UNWEIGHTED — same seed, same card, whatever the ledger', () => {
    for (let seed = 0; seed < SEEDS; seed += 1) {
      const plain = drawOffer(OPEN, NO_WEIGHTS, mulberry32(seed), CATALOG, { guarantee: true });
      const weighted = drawOffer(OPEN, LOPSIDED, mulberry32(seed), CATALOG, { guarantee: true });
      expect(weighted[0], `seed ${seed}`).toBe(plain[0]);
    }
  });

  it('...and its distribution is UNIFORM over the usable lines, weights or no weights', () => {
    const counts = new Map<LineId, number>(USABLE.map((id) => [id, 0]));
    for (let seed = 0; seed < SEEDS; seed += 1) {
      const first = drawOffer(OPEN, LOPSIDED, mulberry32(seed), CATALOG, { guarantee: true })[0];
      counts.set(first, (counts.get(first) ?? 0) + 1);
    }
    const share = 1 / USABLE.length;
    for (const [id, n] of counts) {
      expect(Math.abs(n / SEEDS - share), `${id} share`).toBeLessThan(0.03);
    }
  });

  it('is VACUOUS, never a reroll: with nothing usable the offer is the plain draw', () => {
    // Every consumable and every equipment line at cap, the row full: nothing
    // usable is left, so the guarantee spends no rng value and changes nothing.
    const held: LineId[] = [];
    for (const key of Object.keys(CATALOG)) {
      const line = CATALOG[key];
      if (line.stub === true || (line.kind !== 'consumable' && line.kind !== 'equipment')) continue;
      for (let i = 0; i < line.cap; i += 1) held.push(key as LineId);
    }
    const ship: DrawShip = { held, weaponSlotOpen: false, mountedGun: 'gun' };
    expect(usableLines(held)).toEqual([]);
    for (let seed = 0; seed < 200; seed += 1) {
      expect(drawOffer(ship, NO_WEIGHTS, mulberry32(seed), CATALOG, { guarantee: true }), `seed ${seed}`)
        .toEqual(drawOffer(ship, NO_WEIGHTS, mulberry32(seed)));
    }
  });
});
