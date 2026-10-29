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

import { describe, it, expect } from 'vitest';
import {
  CATALOG,
  CONFIG,
  CONSUMABLE_IDS,
  boonStackCount,
  drawOffer,
  eligibleLines,
  GUN_IDS,
  ladderHost,
  lineWeight,
  MOUNTED_GUN,
  mulberry32,
  usableLines,
  pickRefusal,
  isConsumableKit,
  rollKit,
  KIT_SIZE,
  SLOT_COUNT,
  LINE_IDS,
  type Catalog,
  type ConsumableKit,
  type CatalogLine,
  type GunId,
  type DrawKind,
  type DrawShip,
  type EquipmentId,
  type LineId,
  type Rng,
  type SlotItemId,
  type Weights,
} from '../index.js';

/** The slot ids of a fresh hull: the gun, the Shift, an EMPTY weapon row
 *  (2/3/4) and empty consumable slots. The draw reads the row off this array —
 *  there is no separate `weaponSlotOpen` boolean to disagree with it (review
 *  F2). */
const ROW_OPEN: readonly (SlotItemId | null)[] = ['gun', 'boost', ...new Array<null>(SLOT_COUNT - 2).fill(null)];

/** The same hull with all three weapon slots occupied. */
const ROW_FULL: readonly (SlotItemId | null)[] = [
  'gun', 'boost', 'lightTorpedo', 'heavyTorpedo', 'navalMines', ...new Array<null>(SLOT_COUNT - 5).fill(null),
];

/** THE TEST KIT (Story 10.1): a deliberate four that is NOT `DEFAULT_KIT` —
 *  the two lines this suite stacks to cap (HULL REPAIR, SUPERCAV TORPEDO)
 *  plus two more; the FOULING SHELL and the COUNTERMEASURE are OFF it. */
const KIT: ConsumableKit = ['hullRepair', 'supercavTorpedo', 'shieldBlock', 'healingBuoy'];

/** Is `id` one of the kit's four? */
const inKit = (id: string, kit: ConsumableKit = KIT): boolean => (kit as readonly string[]).includes(id);

/** A ship with an open weapon row, holding nothing — the level-zero state. */
const OPEN: DrawShip = { held: [], slotIds: ROW_OPEN, mountedGun: 'gun', kit: KIT };

/** The same ship with all three weapon slots full. */
const CLOSED: DrawShip = { held: [], slotIds: ROW_FULL, mountedGun: 'gun', kit: KIT };

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

    // ...while the six UNIVERSAL ladders (no `equipment.` stat path, no
    // appliesTo) are gun-blind and stay dealable whatever is mounted.
    for (const id of ['hullPoints', 'speed', 'turning', 'radarSweep', 'reload', 'passiveHealing']) {
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
    for (const id of ['hullPoints', 'armor', 'armorPiercing', 'speed', 'turning', 'radarSweep', 'reload', 'passiveHealing'] as const) {
      expect(ladderHost(CATALOG[id]), id).toBeUndefined(); // universal
      // ...and so eligible on every seat, whatever gun it mounts (Story 9.9,
      // epic-9 amendment 145: the draw covers ARMOR PIERCING like ARMOR).
      for (const gun of GUN_IDS) {
        const ship: DrawShip = { ...OPEN, mountedGun: MOUNTED_GUN[gun] };
        expect(eligibleLines(ship).some((e) => e.id === id), `${id} on ${gun}`).toBe(true);
      }
    }

    // Which gun ladders a seat can be dealt, per mounted gun — the WHOLE set,
    // so a cannon ladder can never reach a flak seat and vice versa.
    const GUN_LADDERS = ['deckGun', 'machineGun', 'flak'];
    const want: Record<GunId, string[]> = {
      deckGun: ['deckGun'],
      machineGun: ['machineGun'],
      flak: ['flak'],
    };
    for (const gun of GUN_IDS) {
      const ship: DrawShip = { ...OPEN, mountedGun: MOUNTED_GUN[gun] };
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
    for (const gun of GUN_IDS) {
      const mounted = MOUNTED_GUN[gun];
      const ship: DrawShip = { ...OPEN, mountedGun: mounted };
      for (let i = 0; i < 300; i += 1) {
        for (const id of drawOffer(ship, new Map(), rng)) {
          const host = ladderHost(CATALOG[id]);
          if (CATALOG[id].kind === 'ladder' && host !== undefined) expect(host, `${gun} offered ${id}`).toBe(mounted);
        }
      }
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

  it('A CARRIED CONSUMABLE IS ALWAYS ELIGIBLE — at its cap, always (amendment 94; kit-confined since Story 10.1)', () => {
    const capped: DrawShip = {
      ...CLOSED,
      held: [
        ...new Array<LineId>(CATALOG.hullRepair.cap).fill('hullRepair'),
        ...new Array<LineId>(CATALOG.supercavTorpedo.cap).fill('supercavTorpedo'),
        ...new Array<LineId>(CATALOG.shieldBlock.cap).fill('shieldBlock'),
        ...new Array<LineId>(CATALOG.countermeasure.cap).fill('countermeasure'),
        ...new Array<LineId>(CATALOG.healingBuoy.cap).fill('healingBuoy'),
        ...new Array<LineId>(CATALOG.foulingShell.cap).fill('foulingShell'),
      ],
    };
    const eligible = eligibleLines(capped);
    const ids = eligible.map((e) => e.id);
    expect(ids).toContain('hullRepair');
    expect(ids).toContain('supercavTorpedo');
    // All are still tagged `consumable`, and EVERY line THE KIT CARRIES is
    // present, in catalog order — the cap filters equipment, ladders and
    // add-ons, never these. A live line OUTSIDE the kit never is (Story 10.1),
    // and the one stub never is. (CHAFF retired in Story 9.2, amendment 31.)
    expect(eligible.filter((e) => e.kind === 'consumable').map((e) => e.id))
      .toEqual(LINE_IDS.filter((id) => inKit(id)));
    expect(kindCounts(eligible).weapon).toBe(0); // the row is full
  });

  it('A CONSUMABLE OUTSIDE THE KIT IS NEVER A CANDIDATE (Story 10.1) — and the same line is, under a kit that carries it', () => {
    const offKit = CONSUMABLE_IDS.filter((id) => CATALOG[id].stub !== true && !inKit(id));
    expect(offKit.length).toBeGreaterThan(0); // the test kit really leaves live lines out
    for (const ship of [OPEN, CLOSED]) {
      const ids = eligibleLines(ship).map((e) => e.id);
      for (const id of offKit) expect(ids, id).not.toContain(id);
      for (const id of KIT) expect(ids, id).toContain(id);
    }
    for (const id of offKit) {
      const carrying: ConsumableKit = [id, ...KIT.slice(1)];
      expect(isConsumableKit(carrying), id).toBe(true);
      expect(eligibleLines({ ...OPEN, kit: carrying }).map((e) => e.id), id).toContain(id);
    }
  });

  it('the kit ORDER does not touch eligibility — membership is the whole law', () => {
    const reversed: ConsumableKit = [...KIT].reverse();
    expect(eligibleLines({ ...OPEN, kit: reversed })).toEqual(eligibleLines(OPEN));
    expect(eligibleLines({ ...CLOSED, kit: reversed })).toEqual(eligibleLines(CLOSED));
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
    const ship: DrawShip = { held, slotIds: ROW_FULL, mountedGun: 'gun', kit: KIT };
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
    // Since Story 8.16 production has FIVE live consumables (SIX since 8.17's
    // FLASH SHELLS, SEVEN since 8.18's SMOKE SCREEN), always eligible, so it
    // can no longer run short at offer size 4 — the property is pinned on the
    // pre-8.16 catalog shape (shield/decoy — and flash and smoke — stubbed),
    // injected. Two of the four stubbed lines are in KIT; the other two of
    // KIT survive, so the eligible set is exactly those two.
    const TWO_LIVE: Catalog = {
      ...CATALOG,
      shieldBlock: { ...CATALOG.shieldBlock, stub: true },
      countermeasure: { ...CATALOG.countermeasure, stub: true },
      healingBuoy: { ...CATALOG.healingBuoy, stub: true },
      foulingShell: { ...CATALOG.foulingShell, stub: true },
    };
    const held: LineId[] = [
      ...everyUpgradeCapped(),
      ...new Array<LineId>(CATALOG.hullRepair.cap).fill('hullRepair'),
      ...new Array<LineId>(CATALOG.supercavTorpedo.cap).fill('supercavTorpedo'),
    ];
    const ship: DrawShip = { held, slotIds: ROW_FULL, mountedGun: 'gun', kit: KIT };
    const eligible = eligibleLines(ship, TWO_LIVE);
    expect(eligible.map((e) => e.id).sort()).toEqual(['hullRepair', 'supercavTorpedo']);
    for (let seed = 0; seed < 200; seed += 1) {
      const offer = drawOffer(ship, NO_WEIGHTS, mulberry32(seed), TWO_LIVE);
      expect([...offer].sort(), `seed ${seed}`).toEqual(['hullRepair', 'supercavTorpedo']);
    }
  });

  it('a fully capped captain sees an offer of its KIT\'s consumables in production — as many as the kit and the offer size allow', () => {
    const held: LineId[] = [...everyUpgradeCapped()];
    for (const id of KIT) held.push(...new Array<LineId>(CATALOG[id].cap).fill(id));
    const ship: DrawShip = { held, slotIds: ROW_FULL, mountedGun: 'gun', kit: KIT };
    const live = [...KIT].sort();
    expect(eligibleLines(ship).map((e) => e.id).sort()).toEqual(live);
    // Story 8.16 closed amendment 94's two-card offer by going live with five
    // consumables; since Story 10.1 the ceiling is the KIT, so a capped
    // captain's offer is min(offer size, kit size) different kit lines.
    for (let seed = 0; seed < 200; seed += 1) {
      const offer = drawOffer(ship, NO_WEIGHTS, mulberry32(seed));
      expect(offer, `seed ${seed}`).toHaveLength(Math.min(CONFIG.offer.size, KIT_SIZE));
      for (const id of offer) expect(live, `seed ${seed}:${id}`).toContain(id);
      expect(new Set(offer).size).toBe(offer.length);
    }
  });

  it('THE DRAW IS CONFINED TO THE KIT (Story 10.1, seeded property): 2,000+ offers, no consumable outside it — and a carried line at cap IS dealt', () => {
    // Three ship states × sampled kits: the empty hull, the full row, and a
    // hull holding every kit line at its cap (the amendment-94 case).
    const rng = mulberry32(0x10_1);
    let offers = 0;
    let cappedDealt = 0;
    for (let trial = 0; trial < 40; trial += 1) {
      const kit = rollKit(rng.next);
      const capped: LineId[] = [];
      for (const id of kit) capped.push(...new Array<LineId>(CATALOG[id].cap).fill(id));
      const ships: DrawShip[] = [
        { ...OPEN, kit },
        { ...CLOSED, kit },
        { held: [...everyUpgradeCapped(), ...capped], slotIds: ROW_FULL, mountedGun: 'gun', kit },
      ];
      for (const ship of ships) {
        for (let k = 0; k < 20; k += 1) {
          const seed = rng.int(0, 0x7fff_ffff);
          for (const guarantee of [false, true]) {
            const offer = drawOffer(ship, LOPSIDED, mulberry32(seed), CATALOG, { guarantee });
            offers += 1;
            for (const id of offer) {
              if (CATALOG[id].kind !== 'consumable') continue;
              expect(inKit(id, kit), `trial ${trial} seed ${seed}: ${id} ∉ [${kit.join(',')}]`).toBe(true);
              if (boonStackCount(ship.held, id) >= CATALOG[id].cap) cappedDealt += 1;
            }
          }
        }
      }
    }
    expect(offers).toBeGreaterThanOrEqual(2000);
    expect(cappedDealt).toBeGreaterThan(0); // amendment 94 stands: dealt greyed, never filtered
  });

  it('IS NEVER EMPTY while any consumable line is dealable (amendment 94)', () => {
    // Even a ship that holds everything it possibly can is shown a card.
    const held: LineId[] = [];
    for (const key of Object.keys(CATALOG)) {
      const line = CATALOG[key];
      if (line.stub === true) continue;
      for (let i = 0; i < line.cap; i += 1) held.push(key as LineId);
    }
    const ship: DrawShip = { held, slotIds: ROW_FULL, mountedGun: 'gun', kit: KIT };
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
  const USABLE = usableLines([], ROW_OPEN, KIT);

  it('usableLines is every KIT consumable + every unheld equipment line, in CATALOG order', () => {
    const expected = Object.keys(CATALOG).filter((id) => {
      const line = CATALOG[id];
      return line.stub !== true && ((line.kind === 'consumable' && inKit(id)) || line.kind === 'equipment');
    });
    expect(USABLE).toEqual(expected);
    // A live consumable outside the kit is never usable (Story 10.1) — under a
    // kit that carries it, it is.
    for (const id of CONSUMABLE_IDS) {
      if (CATALOG[id].stub === true || inKit(id)) continue;
      expect(USABLE, id).not.toContain(id);
      expect(usableLines([], ROW_OPEN, [id, ...KIT.slice(1)]), id).toContain(id);
    }
    // A line the ship already holds is not usable; nor is one at cap.
    expect(usableLines(['lightTorpedo'], ROW_OPEN, KIT)).not.toContain('lightTorpedo');
    expect(usableLines(new Array<LineId>(CATALOG.hullRepair.cap).fill('hullRepair'), ROW_OPEN, KIT))
      .not.toContain('hullRepair');
  });

  it('EXCLUDES a line this hull could not take — the guarantee runs pickRefusal (review F2)', () => {
    // The level-zero guarantee also fires on the countdown REDRAW, and a dev
    // `fitOverride` can have filled Q/E/R before then. Copy 1 of an equipment
    // line would land in `cards` with no slot, so it is not usable there.
    const rowFull = usableLines([], ROW_FULL, KIT);
    for (const id of rowFull) expect(CATALOG[id].kind, id).toBe('consumable');
    expect(rowFull).toContain('hullRepair');
    // ...and with the row open every one of them is back.
    expect(usableLines([], ROW_OPEN, KIT).some((id) => CATALOG[id].kind === 'equipment')).toBe(true);

    // A consumable is out only at its cap ('atCap') — there is no full belt
    // since Story 9.2 (epic-9 amendment 21); below cap it is always usable.
    const capped = new Array<LineId>(CATALOG.hullRepair.cap).fill('hullRepair');
    expect(pickRefusal(capped, ROW_FULL, 'hullRepair', KIT)).toBe('atCap');
    expect(usableLines(capped, ROW_FULL, KIT)).not.toContain('hullRepair');
    expect(usableLines(capped, ROW_FULL, KIT)).toContain('supercavTorpedo');
  });

  it('CARD 0 IS ALWAYS TAKEABLE, whatever the row and the consumable slots look like', () => {
    const ship: DrawShip = { held: [], slotIds: ROW_FULL, mountedGun: 'gun', kit: KIT };
    for (let seed = 0; seed < 200; seed += 1) {
      const offer = drawOffer(ship, LOPSIDED, mulberry32(seed), CATALOG, { guarantee: true });
      for (const id of offer) {
        expect(CATALOG[id].kind === 'equipment' && boonStackCount(ship.held, id) === 0, `seed ${seed}:${id}`)
          .toBe(false);
      }
    }
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
    const ship: DrawShip = { held, slotIds: ROW_FULL, mountedGun: 'gun', kit: KIT };
    expect(usableLines(held, ROW_FULL, KIT)).toEqual([]);
    for (let seed = 0; seed < 200; seed += 1) {
      expect(drawOffer(ship, NO_WEIGHTS, mulberry32(seed), CATALOG, { guarantee: true }), `seed ${seed}`)
        .toEqual(drawOffer(ship, NO_WEIGHTS, mulberry32(seed)));
    }
  });
});
