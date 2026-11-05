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
//       held ahead of its host only while a weapon slot is open; and since
//       Story 10.1 (epic-10 amendment 3) NO consumable outside the ship's KIT
//       is ever dealt — not by the draw, not by the level-zero guarantee.
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
//
// STORY 10.5 (Eric 2026-11-05, epic-10 amendment 10): the kit is retired. The
// `consumable` kind is gone from the draw (two kinds, `weapon` and `upgrade`),
// an offer may be short or EMPTY, a bare weapon is eligible only while ITS
// FAMILY'S slot is empty (one kind per slot — the property block below), the
// level-zero guarantee is a slot-filling weapon, and BROADSIDE is never dealt.

import { describe, it, expect } from 'vitest';
import {
  CATALOG,
  CONFIG,
  EQUIPMENT_FAMILY,
  FAMILY_SLOT,
  SLOT_FAMILIES,
  WEAPON_SLOTS,
  boonStackCount,
  drawOffer,
  effectiveStats,
  eligibleLines,
  familyMembers,
  familySlotFor,
  ladderHost,
  lineWeight,
  loadoutFor,
  mulberry32,
  usableLines,
  pickRefusal,
  slotsWithCards,
  tierTargetOf,
  LINE_IDS,
  type Catalog,
  type CatalogLine,
  type DrawKind,
  type DrawShip,
  type EquipmentId,
  type LineId,
  type Rng,
  type SlotFamily,
  type Weights,
} from '../index.js';
import { NEUTRAL_HULL } from './neutralHull.js';

/** The slot ids of a fresh hull on the gun-module fit: the gun, no Shift and
 *  three EMPTY family slots. The draw reads the row off this array — there is
 *  no separate `weaponSlotOpen` boolean to disagree with it (review F2). */
const ROW_OPEN: readonly (EquipmentId | null)[] = loadoutFor(effectiveStats(NEUTRAL_HULL), true).map((s) => s.equipmentId);

/** The same hull with all three family slots occupied — the first kind of each
 *  family, read off the model. */
const ROW_FULL: readonly (EquipmentId | null)[] = ROW_OPEN.map((id, i) => {
  const k = (WEAPON_SLOTS as readonly number[]).indexOf(i);
  return k < 0 ? id : familyMembers(SLOT_FAMILIES[k])[0];
});

/** The three RETIRED deck-gun modules (reference + the PvE fleet since Story
 *  10.4) — the hosts the three gun ladders name. A captain mounts none of them. */
const GUN_MODULES = ['gun', 'machineGun', 'flak'] as const satisfies readonly EquipmentId[];

/** A ship with an open weapon row, holding nothing — the level-zero state. */
const OPEN: DrawShip = { held: [], slotIds: ROW_OPEN, mountedGun: 'gun' };

/** The same ship with all three family slots full (by a fit, holding no card). */
const CLOSED: DrawShip = { held: [], slotIds: ROW_FULL, mountedGun: 'gun' };

/** No takes anywhere: every line at its base weight of 1.0. */
const NO_WEIGHTS: Weights = new Map<LineId, number>();

/** Every dealable EQUIPMENT line whose weapon has a family slot, in catalog order. */
const WEAPON_LINES: LineId[] = LINE_IDS.filter((id) => {
  const line = CATALOG[id];
  const eq = tierTargetOf(line);
  return line.kind === 'equipment' && line.stub !== true && eq !== undefined && familySlotFor(eq) !== null;
});

/** The family of a weapon line. */
const familyOfLine = (id: LineId): SlotFamily => EQUIPMENT_FAMILY[tierTargetOf(CATALOG[id])!]!;

/** A REAL captain's draw state for a hand of cards: the slots are the replay of
 *  the hand, never typed by hand. */
function shipOf(held: readonly LineId[]): DrawShip {
  const stats = effectiveStats(NEUTRAL_HULL, held);
  return { held, slotIds: slotsWithCards(stats, held).map((s) => s.equipmentId), mountedGun: 'mainBattery' };
}

/** How many of `eligible` are of each kind. */
function kindCounts(eligible: readonly { kind: DrawKind }[]): Record<DrawKind, number> {
  const out: Record<DrawKind, number> = { weapon: 0, upgrade: 0 };
  for (const e of eligible) out[e.kind] += 1;
  return out;
}

/** The kind of each dealt line, for a ship's eligible set. */
function kindsOf(ship: DrawShip, offer: readonly LineId[], catalog: Catalog = CATALOG): (DrawKind | undefined)[] {
  const byId = new Map(eligibleLines(ship, catalog).map((e) => [e.id, e.kind]));
  return offer.map((id) => byId.get(id));
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

/** A hand that fills every dealable LADDER and ADD-ON to its cap. */
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
    const ids = eligibleLines(OPEN).map((e) => e.id);
    expect(ids).toEqual(LINE_IDS.filter((id) => ids.includes(id)));
    for (const id of ids) expect(CATALOG[id].stub, id).not.toBe(true);
  });

  it('ON AN EMPTY ROW: every family weapon line is kind `weapon` — and BROADSIDE, with no slot, is not eligible at all (R6)', () => {
    const eligible = eligibleLines(OPEN);
    for (const id of WEAPON_LINES) expect(eligible, id).toContainEqual({ id, kind: 'weapon' });
    expect(eligible.filter((e) => e.kind === 'weapon').map((e) => e.id)).toEqual(WEAPON_LINES);
    expect(eligible.some((e) => e.id === 'broadside')).toBe(false);
  });

  it('BROADSIDE and every line the kit retire deleted are never eligible, whatever the ship holds (Story 10.5)', () => {
    const ships: DrawShip[] = [OPEN, CLOSED, shipOf([]), shipOf(['lightTorpedo']), { ...OPEN, held: ['broadside'] }];
    for (const ship of ships) {
      const ids = eligibleLines(ship).map((e) => e.id as string);
      for (const gone of ['broadside', 'hullRepair', 'shieldBlock', 'countermeasure', 'radarBuoy', 'healingBuoy', 'shieldBuoy', 'speedBuoy', 'depthCharge']) {
        expect(ids, gone).not.toContain(gone);
      }
    }
  });

  it('WITH A FAMILY SLOT FILLED: no unheld line of THAT family is eligible; the other families are untouched', () => {
    for (const family of SLOT_FAMILIES) {
      const slotIds = [...ROW_OPEN];
      slotIds[FAMILY_SLOT[family]] = familyMembers(family)[0];
      const weapons = eligibleLines({ ...OPEN, slotIds }).filter((e) => e.kind === 'weapon').map((e) => e.id);
      expect(weapons, family).toEqual(WEAPON_LINES.filter((id) => familyOfLine(id) !== family));
    }
    expect(eligibleLines(CLOSED).filter((e) => e.kind === 'weapon')).toEqual([]);
  });

  it('a HELD equipment line below its cap is an `upgrade` (the tier card), and at cap it is out', () => {
    for (const id of WEAPON_LINES) {
      const cap = CATALOG[id].cap;
      for (let copies = 1; copies < cap; copies += 1) {
        expect(eligibleLines(shipOf(new Array<LineId>(copies).fill(id))), `${id} x${copies}`).toContainEqual({ id, kind: 'upgrade' });
      }
      expect(eligibleLines(shipOf(new Array<LineId>(cap).fill(id))).some((e) => e.id === id), id).toBe(false);
    }
  });

  it('is FAIL-CLOSED on a short slot array: a missing family slot is never empty, so no bare weapon is eligible', () => {
    expect(eligibleLines({ ...OPEN, slotIds: [] }).filter((e) => e.kind === 'weapon')).toEqual([]);
  });

  it('THE WHOLE GUN FAMILY follows the MOUNTED gun, appliesTo or not (amendment 89d, review F3)', () => {
    // CANNON (`deckGun`) names `appliesTo` — it is the ladder whose copies
    // advance the gun's equipment TIER. Since 2026-09-30 it is the WHOLE cannon
    // family: the one-off TURRET and BARREL cards are its tier III / V rungs.
    expect(CATALOG.deckGun.appliesTo).toEqual(['gun']);
    expect(Object.hasOwn(CATALOG, 'deckGunTurret')).toBe(false);
    expect(Object.hasOwn(CATALOG, 'deckGunBarrel')).toBe(false);

    const GUN_FAMILY = ['deckGun'];
    // Mounted gun is the deck gun's row: CANNON is dealable.
    const mounted = eligibleLines(OPEN).map((e) => e.id);
    for (const id of GUN_FAMILY) expect(mounted, id).toContain(id);

    // A seat carrying ANY other gun (Story 8.15) is dealt none of it.
    const otherGun: DrawShip = { ...OPEN, mountedGun: 'machineGun' as EquipmentId };
    const elsewhere = eligibleLines(otherGun).map((e) => e.id);
    for (const id of GUN_FAMILY) expect(elsewhere, id).not.toContain(id);

    // A gun ladder WITHOUT `appliesTo` still follows the mounted gun through its
    // tier's `equipment.<row>.` stat path (ladderHost source 2, review F3) — an
    // injected test line, since no production line relies on it any more.
    const pathOnly: CatalogLine = {
      id: 'testGunPool' as LineId,
      kind: 'ladder',
      cap: 1,
      tiers: [[{ kind: 'stat', path: 'equipment.gun.maxAmmo', add: 1 }]],
    };
    expect(ladderHost(pathOnly)).toBe('gun');
    const injected: Record<string, CatalogLine> = { ...CATALOG, testGunPool: pathOnly };
    expect(eligibleLines(OPEN, injected).some((e) => (e.id as string) === 'testGunPool')).toBe(true);
    expect(eligibleLines(otherGun, injected).some((e) => (e.id as string) === 'testGunPool')).toBe(false);

    // ...while the UNIVERSAL ladders (no `equipment.` stat path, no
    // appliesTo) are gun-blind and stay dealable whatever is mounted (Story
    // 10.3, Eric 2026-11-04, epic-10 amendment 8: HULL POINTS and PASSIVE
    // HEALING deleted; SPEED / TURNING / RADAR SWEEP renamed).
    for (const id of ['engines', 'rudder', 'intel', 'reload']) {
      expect(elsewhere, id).toContain(id);
    }

    // And the mirror image, on an injected catalog: a ladder that names ANOTHER
    // gun is eligible exactly when that gun is the mounted one.
    const rows: Record<string, CatalogLine> = { ...CATALOG };
    rows.deckGun = { ...CATALOG.deckGun, appliesTo: ['machineGun'] };
    expect(eligibleLines(OPEN, rows).some((e) => e.id === 'deckGun')).toBe(false);
    expect(eligibleLines(otherGun, rows).some((e) => e.id === 'deckGun')).toBe(true);
  });

  it('EACH GUN LADDER IS GATED TO ITS OWN MOUNTED GUN (Story 8.15, amendments 89d/104/105)', () => {
    // ladderHost reads the ladder's `appliesTo` — the machine gun and flak
    // ladders name their own rows, exactly as DECK GUN names `gun`.
    expect(ladderHost(CATALOG.machineGun)).toBe('machineGun');
    expect(ladderHost(CATALOG.flak)).toBe('flak');
    expect(ladderHost(CATALOG.deckGun)).toBe('gun');
    for (const id of ['armor', 'power', 'engines', 'rudder', 'intel', 'reload'] as const) {
      expect(ladderHost(CATALOG[id]), id).toBeUndefined(); // universal
      // ...and so eligible on every seat, whatever gun it mounts (Story 9.9,
      // epic-9 amendment 145: the draw covers POWER like ARMOR).
      for (const gun of [...GUN_MODULES, 'mainBattery'] as const) {
        const ship: DrawShip = { ...OPEN, mountedGun: gun };
        expect(eligibleLines(ship).some((e) => e.id === id), `${id} on ${gun}`).toBe(true);
      }
    }

    // Which gun ladders a seat can be dealt, per mounted gun — the WHOLE set,
    // so a cannon ladder can never reach a flak seat and vice versa.
    const GUN_LADDERS = ['deckGun', 'machineGun', 'flak'];
    const want: Record<(typeof GUN_MODULES)[number], string[]> = {
      gun: ['deckGun'],
      machineGun: ['machineGun'],
      flak: ['flak'],
    };
    for (const gun of GUN_MODULES) {
      const ship: DrawShip = { ...OPEN, mountedGun: gun };
      const dealt = eligibleLines(ship).map((e) => e.id).filter((id) => GUN_LADDERS.includes(id));
      expect(dealt, gun).toEqual(want[gun]);
      // Every gun ladder that IS eligible is an UPGRADE, never a weapon.
      for (const e of eligibleLines(ship)) {
        if (GUN_LADDERS.includes(e.id)) expect(e.kind, `${gun}/${e.id}`).toBe('upgrade');
      }
    }
  });

  it('the draw NEVER OFFERS a gun ladder for an unmounted gun, over many seeded offers (Story 8.15)', () => {
    const rng = mulberry32(0x815_0815);
    for (const gun of GUN_MODULES) {
      const mounted: EquipmentId = gun;
      const ship: DrawShip = { ...OPEN, mountedGun: mounted };
      for (let i = 0; i < 300; i += 1) {
        for (const id of drawOffer(ship, new Map(), rng)) {
          const host = ladderHost(CATALOG[id]);
          if (CATALOG[id].kind === 'ladder' && host !== undefined) expect(host, `${gun} offered ${id}`).toBe(mounted);
        }
      }
    }
  });

  it('A CAPTAIN IS NEVER DEALT A DECK-GUN LADDER (Story 10.4): the main battery hosts no ladder', () => {
    // Every captain's slot 0 is `mainBattery`. No catalog ladder names that
    // row, so CANNON / MACHINE GUN / FLAK are ineligible on any weapon row,
    // and no seeded offer ever carries one.
    const hosted = LINE_IDS.filter((id) => CATALOG[id].kind === 'ladder' && ladderHost(CATALOG[id]) !== undefined);
    expect(hosted.length).toBeGreaterThan(0);
    for (const id of hosted) expect(ladderHost(CATALOG[id]), id).not.toBe('mainBattery');
    for (const base of [OPEN, CLOSED]) {
      const ship: DrawShip = { ...base, mountedGun: 'mainBattery' };
      const dealt = eligibleLines(ship).map((e) => e.id);
      for (const id of hosted) expect(dealt, id).not.toContain(id);
    }
    const rng = mulberry32(0x104_0104);
    const captain: DrawShip = { ...OPEN, mountedGun: 'mainBattery' };
    for (let i = 0; i < 300; i += 1) {
      for (const id of drawOffer(captain, new Map(), rng)) expect(hosted, id).not.toContain(id);
    }
  });

  it('a gun ladder leaves the pool at its cap of 4 (the MG and flak ladders, like DECK GUN)', () => {
    const mg: DrawShip = { ...OPEN, mountedGun: 'machineGun', held: ['machineGun', 'machineGun', 'machineGun'] };
    expect(eligibleLines(mg).some((e) => e.id === 'machineGun')).toBe(true);
    const capped: DrawShip = { ...mg, held: [...mg.held, 'machineGun'] };
    expect(eligibleLines(capped).some((e) => e.id === 'machineGun')).toBe(false);
  });

  it('an ADD-ON may be held ahead of its host while a slot is open, never with the row full', () => {
    // NO PRODUCTION ADD-ON IS LEFT since Story 8.17 (Eric 2026-09-29,
    // amendments 131–134: DAZZLE SHELLS became the FLASH SHELLS consumable and
    // PHOSPHOR SHELLS its own weapon), but the `addon` kind and its draw law
    // stay in the engine — so the law is pinned on an INJECTED add-on, shaped
    // exactly as the deleted DAZZLE SHELLS card was (injected over the
    // `foulingShell` slot, which held DAZZLE SHELLS before Story 9.4).
    const WITH_ADDON: Catalog = {
      ...CATALOG,
      foulingShell: {
        id: 'foulingShell', kind: 'addon', cap: 1, appliesTo: ['starShells'],
        tiers: [[{ kind: 'doctrine', weapon: 'starShells', mode: 'dazzle' }]],
      },
    };
    const has = (ship: DrawShip): boolean => eligibleLines(ship, WITH_ADDON).some((e) => e.id === 'foulingShell');
    // Row open, no host held: held-ahead is allowed (amendment 89b).
    expect(has(OPEN)).toBe(true);
    // Row full, no host: the card would be dead, so it is not dealt.
    expect(has(CLOSED)).toBe(false);
    // Row full WITH the host aboard: eligible again.
    expect(has({ ...CLOSED, held: ['starShells'] })).toBe(true);
    // ...and at its cap of 1 it leaves, host or no host.
    expect(has({ ...CLOSED, held: ['starShells', 'foulingShell'] })).toBe(false);
  });
});

describe('lineWeight — the weighting (amendments 90/91)', () => {
  it('is factor^takes at the CONFIG dials, 1.0 at zero takes, and floored at the CONFIG floor', () => {
    const { factor, floor } = CONFIG.offer.weighting;
    expect(lineWeight(0)).toBe(1);
    expect(lineWeight(1)).toBe(factor);
    expect(lineWeight(2)).toBeCloseTo(factor * factor, 12);
    expect(lineWeight(50)).toBe(floor);
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

  it('takes an injected factor/floor pair in place of CONFIG.offer.weighting', () => {
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
    for (let seed = 0; seed < 300; seed += 1) {
      const offer = drawOffer(OPEN, NO_WEIGHTS, mulberry32(seed));
      expect(offer).toHaveLength(CONFIG.offer.size);
      expect(new Set(offer).size).toBe(offer.length);
      const eligible = eligibleLines(OPEN).map((e) => e.id);
      for (const id of offer) expect(eligible).toContain(id);
    }
  });

  it('is deterministic: the same seed and the same inputs give the same offer', () => {
    for (let seed = 0; seed < 50; seed += 1) {
      expect(drawOffer(OPEN, NO_WEIGHTS, mulberry32(seed))).toEqual(drawOffer(OPEN, NO_WEIGHTS, mulberry32(seed)));
    }
  });

  it('spends exactly TWO rng values per dealt card — one per stage', () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const { rng, calls } = countingRng(seed);
      const offer = drawOffer(OPEN, NO_WEIGHTS, rng);
      expect(calls()).toBe(2 * offer.length);
    }
  });

  it('NEVER deals a line at or over its cap, and never a bare weapon whose family slot is taken', () => {
    const capped = [...everyUpgradeCapped(), ...new Array<LineId>(CATALOG.lightTorpedo.cap).fill('lightTorpedo')];
    const ship = shipOf(capped);
    for (let seed = 0; seed < 300; seed += 1) {
      for (const id of drawOffer(ship, NO_WEIGHTS, mulberry32(seed))) {
        expect(boonStackCount(capped, id), id).toBeLessThan(CATALOG[id].cap);
        expect(pickRefusal(ship.held, ship.slotIds, id), id).toBeNull();
      }
    }
  });

  it('gives a SHORTER offer when fewer than CONFIG.offer.size lines are eligible — never padded, never repeated', () => {
    // Every ladder capped and every family slot holding a capped weapon but
    // ONE line one copy short: exactly one line is still eligible.
    const full = [...everyUpgradeCapped(), ...SLOT_FAMILIES.flatMap((f) => {
      const line = WEAPON_LINES.find((id) => familyOfLine(id) === f)!;
      return new Array<LineId>(CATALOG[line].cap).fill(line);
    })];
    const last = full[full.length - 1];
    const ship = shipOf(full.slice(0, -1));
    expect(eligibleLines(ship).map((e) => e.id)).toEqual([last]);
    for (let seed = 0; seed < 50; seed += 1) {
      expect(drawOffer(ship, NO_WEIGHTS, mulberry32(seed))).toEqual([last]);
    }
  });

  it('AN EXHAUSTED HULL DRAWS AN EMPTY OFFER (Story 10.5 — the always-dealt consumables are gone), and spends no rng', () => {
    const full = [...everyUpgradeCapped(), ...SLOT_FAMILIES.flatMap((f) => {
      const line = WEAPON_LINES.find((id) => familyOfLine(id) === f)!;
      return new Array<LineId>(CATALOG[line].cap).fill(line);
    })];
    const ship = shipOf(full);
    expect(eligibleLines(ship)).toEqual([]);
    const { rng, calls } = countingRng(7);
    expect(drawOffer(ship, NO_WEIGHTS, rng)).toEqual([]);
    expect(drawOffer(ship, NO_WEIGHTS, rng, CATALOG, { guarantee: true })).toEqual([]);
    expect(calls()).toBe(0);
  });

  it('a catalog with NOTHING dealable draws an empty offer rather than throwing', () => {
    const stubOnly: Catalog = { depthCharge: CATALOG.depthCharge };
    expect(drawOffer(OPEN, NO_WEIGHTS, mulberry32(1), stubOnly)).toEqual([]);
    expect(drawOffer(OPEN, NO_WEIGHTS, mulberry32(1), {})).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// ONE KIND PER SLOT (Story 10.5, Eric 2026-11-05, epic-10 amendment 10): once a
// family's slot holds a kind, no OTHER kind of that family may ever be offered
// for the rest of the match — the acceptance criterion's property, over random
// card histories built the way the server builds them (offer → legal pick).
// ---------------------------------------------------------------------------
describe('ONE KIND PER SLOT — the draw never offers a second kind of a filled family', () => {
  /** The kind holding each family's slot, read off the replayed row. */
  const slotted = (ship: DrawShip): Map<SlotFamily, EquipmentId> => {
    const out = new Map<SlotFamily, EquipmentId>();
    for (const f of SLOT_FAMILIES) {
      const eq = ship.slotIds[FAMILY_SLOT[f]];
      if (eq !== null && eq !== undefined) out.set(f, eq);
    }
    return out;
  };

  it('PROPERTY: over seeded random histories, every offered equipment line is the slotted kind of its family or fills an EMPTY slot', () => {
    const rng = mulberry32(0x105_0e);
    let offers = 0;
    let secondKindChances = 0;
    for (let trial = 0; trial < 150; trial += 1) {
      const held: LineId[] = [];
      for (let level = 0; level < 30; level += 1) {
        const ship = shipOf(held);
        const offer = drawOffer(ship, NO_WEIGHTS, rng, CATALOG, { guarantee: level === 0 });
        offers += 1;
        const fitted = slotted(ship);
        if (fitted.size > 0) secondKindChances += 1;
        for (const id of offer) {
          expect(id, 'never BROADSIDE').not.toBe('broadside');
          const line = CATALOG[id];
          if (line.kind !== 'equipment') continue;
          const eq = tierTargetOf(line)!;
          const holder = fitted.get(EQUIPMENT_FAMILY[eq]!);
          expect(holder === undefined || holder === eq, `${id} offered with ${String(holder)} slotted (${held.join('+')})`).toBe(true);
          // ...and the pick gate agrees with the draw on every offered card.
          expect(pickRefusal(ship.held, ship.slotIds, id), id).toBeNull();
        }
        if (offer.length === 0) break;
        held.push(rng.pick(offer)); // the captain takes a card, like the server's spend
      }
      // The history never put two kinds of one family aboard.
      const kinds = new Map<SlotFamily, Set<EquipmentId>>();
      for (const id of held) {
        const line = CATALOG[id];
        if (line.kind !== 'equipment') continue;
        const eq = tierTargetOf(line)!;
        const f = EQUIPMENT_FAMILY[eq]!;
        kinds.set(f, (kinds.get(f) ?? new Set()).add(eq));
      }
      for (const [f, set] of kinds) expect(set.size, `${f} in ${held.join('+')}`).toBe(1);
    }
    // The property was actually exercised: most offers were drawn with a slot filled.
    expect(secondKindChances).toBeGreaterThan(offers / 2);
  });

  it('a second kind is refused if it is FORCED, for every ordered pair of kinds in a family', () => {
    for (const first of WEAPON_LINES) {
      const ship = shipOf([first]);
      for (const second of WEAPON_LINES) {
        if (second === first || familyOfLine(second) !== familyOfLine(first)) continue;
        expect(pickRefusal(ship.held, ship.slotIds, second), `${second} after ${first}`).toBe('noWeaponSlot');
        expect(eligibleLines(ship).some((e) => e.id === second), `${second} after ${first}`).toBe(false);
      }
    }
  });
});

describe('the level-zero guarantee — card 0 is a SLOT-FILLING WEAPON, uniformly', () => {
  const FRESH = shipOf([]);

  it('usableLines on a fresh hull is every family weapon line, in CATALOG order — never a ladder, the stub or BROADSIDE', () => {
    expect(usableLines([], FRESH.slotIds)).toEqual(WEAPON_LINES);
  });

  it('EXCLUDES a line this hull could not take — the guarantee runs pickRefusal (review F2)', () => {
    for (const family of SLOT_FAMILIES) {
      const taken = WEAPON_LINES.find((id) => familyOfLine(id) === family)!;
      const ship = shipOf([taken]);
      const usable = usableLines(ship.held, ship.slotIds);
      expect(usable, family).toEqual(WEAPON_LINES.filter((id) => familyOfLine(id) !== family));
      for (const id of usable) expect(pickRefusal(ship.held, ship.slotIds, id), id).toBeNull();
    }
    expect(usableLines([], ROW_FULL)).toEqual([]);
  });

  it('CARD 0 IS A WEAPON THAT FILLS AN EMPTY SLOT, on a fresh hull and after any partial fit', () => {
    const rng = mulberry32(0x0);
    for (let seed = 0; seed < 300; seed += 1) {
      const families = SLOT_FAMILIES.filter(() => rng.next() < 0.4);
      const held = families.map((f) => rng.pick(WEAPON_LINES.filter((id) => familyOfLine(id) === f)));
      const ship = shipOf(held);
      if (families.length === SLOT_FAMILIES.length) continue; // nothing usable: the vacuous case, below
      const [first] = drawOffer(ship, NO_WEIGHTS, mulberry32(seed), CATALOG, { guarantee: true });
      const line = CATALOG[first];
      expect(line.kind, `seed ${seed}`).toBe('equipment');
      const slot = familySlotFor(tierTargetOf(line)!);
      expect(slot, `seed ${seed}`).not.toBeNull();
      expect(ship.slotIds[slot!], `seed ${seed}`).toBeNull();
      expect(pickRefusal(ship.held, ship.slotIds, first), `seed ${seed}`).toBeNull();
    }
  });

  it('the rest of a guaranteed offer is the ordinary draw: full size, all different, all eligible', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const offer = drawOffer(FRESH, NO_WEIGHTS, mulberry32(seed), CATALOG, { guarantee: true });
      expect(offer).toHaveLength(CONFIG.offer.size);
      expect(new Set(offer).size).toBe(offer.length);
      const eligible = eligibleLines(FRESH).map((e) => e.id);
      for (const id of offer) expect(eligible).toContain(id);
    }
  });

  it('THE GUARANTEED PICK IS UNWEIGHTED — same seed, same card, whatever the ledger', () => {
    const heavy: Weights = new Map(WEAPON_LINES.map((id, i) => [id, i % 2 === 0 ? CONFIG.offer.weighting.floor : 1]));
    for (let seed = 0; seed < 200; seed += 1) {
      const plain = drawOffer(FRESH, NO_WEIGHTS, mulberry32(seed), CATALOG, { guarantee: true });
      const weighted = drawOffer(FRESH, heavy, mulberry32(seed), CATALOG, { guarantee: true });
      expect(weighted[0], `seed ${seed}`).toBe(plain[0]);
    }
  });

  it('...and it reaches EVERY usable line over many seeds (a uniform pick leaves none out)', () => {
    const seen = new Set<LineId>();
    for (let seed = 0; seed < 2000; seed += 1) {
      seen.add(drawOffer(FRESH, NO_WEIGHTS, mulberry32(seed), CATALOG, { guarantee: true })[0]);
    }
    expect([...seen].sort()).toEqual([...WEAPON_LINES].sort());
  });

  it('is VACUOUS, never a reroll: with every family slot filled the offer is the plain draw, rng value for rng value', () => {
    const held = SLOT_FAMILIES.map((f) => WEAPON_LINES.find((id) => familyOfLine(id) === f)!);
    const ship = shipOf(held);
    expect(usableLines(ship.held, ship.slotIds)).toEqual([]);
    for (let seed = 0; seed < 50; seed += 1) {
      expect(drawOffer(ship, NO_WEIGHTS, mulberry32(seed), CATALOG, { guarantee: true }))
        .toEqual(drawOffer(ship, NO_WEIGHTS, mulberry32(seed)));
    }
  });
});
