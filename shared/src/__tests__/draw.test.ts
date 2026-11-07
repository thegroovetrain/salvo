// THE COMMON POOL DRAW (Story 8.14, Eric rulings 2026-09-21/22, epic-8
// amendments 89–95; the offer composition re-cut by Story 10.7, Eric
// 2026-11-06, epic-10 amendment 13) — sim/draw.ts, the engine that replaced
// sim/deck.ts, sim/deckRules.ts and sim/pool.ts.
//
// Contracts pinned here:
//   (1) ELIGIBILITY (unchanged by 10.7 — only the tag moved from a kind to an
//       OFFER TYPE): no bare weapon with its family slot taken; nothing at or
//       over its cap; gun ladders follow the MOUNTED gun; an add-on is dealt
//       only while a weapon it names holds its family slot (Story 10.6, R10);
//       ladders are `ship`, equipment lines and add-ons are `equipment`, and
//       only copy 1 of an equipment line is a bare weapon.
//   (2) THE WEIGHTING (amendment 90): `lineWeight` is factor^takes, floored,
//       monotone non-increasing.
//   (3) THE FOUR-SLOT TYPE PLAN, property-style over many seeds and generated
//       ship states — every I/O-matrix row of the spec that concerns the pure
//       draw: card 0 Ship and card 1 Equipment whenever that type has a line;
//       one type exhausted → every card the other type; never a duplicate;
//       length = min(size, eligible); every card eligible; a bare hull's
//       Equipment card is a bare weapon; nothing eligible → `[]` and zero rng.
//   (4) THE RNG COST, derived from the plan: one value per dealt card plus one
//       per wildcard slot that had both types to choose from.
//   (5) THE WILDCARD COIN follows the rule (a scripted low value → Ship, high
//       → Equipment) — a mechanism test, never a measured frequency.
//   (6) WEIGHTING bends only WHICH BARE WEAPON: a weight on a bare weapon can
//       move a scripted pick; a weight on a tier card or a ladder changes
//       nothing, no weight ever changes a slot's type, and no weight moves the
//       boundary between "a bare weapon" and "another line" in a line pick
//       (the bare weapons are rescaled to sum to their count — amendment 92's
//       law, 2026-11-06, Story 10.7 review gate).
//   (7) ONE KIND PER SLOT (Story 10.5) over seeded random card histories.
//
// The kind-odds invariant (amendment 92), the "two rng per card" pin and the
// level-zero guarantee tests (amendment 93) were DELETED with the mechanisms
// they pinned (2026-11-06, Story 10.7). Pure, zero I/O.

import { describe, it, expect } from 'vitest';
import {
  CATALOG,
  CONFIG,
  EQUIPMENT_FAMILY,
  FAMILY_SLOT,
  SLOT_BOOST,
  SLOT_FAMILIES,
  SLOT_GUN,
  WEAPON_SLOTS,
  boonStackCount,
  drawBonusIndex,
  drawOffer,
  effectiveStats,
  eligibleLines,
  familyMembers,
  familySlotFor,
  ladderHost,
  lineWeight,
  loadoutFor,
  mulberry32,
  pickRefusal,
  slotsWithCards,
  tierTargetOf,
  LINE_IDS,
  type Catalog,
  type CatalogLine,
  type DrawShip,
  type Eligible,
  type OfferType,
  type EquipmentId,
  type LineId,
  type Rng,
  type SlotFamily,
  type Weights,
} from '../index.js';
import { NEUTRAL_HULL } from './neutralHull.js';

/** The slot ids of a fresh hull on the gun-module fit: the gun, no Shift and
 *  three EMPTY family slots. The draw reads the row off this array — there is
 *  no separate `weaponSlotOpen` boolean to disagree with it (review F2). Built
 *  over the captain fit since `loadoutFor`'s `fleet` flag retired with the
 *  PvE fleet (Story 10.8, 2026-11-06): slot 0 the gun module, slot 1 empty. */
const ROW_OPEN: readonly (EquipmentId | null)[] = loadoutFor(effectiveStats(NEUTRAL_HULL)).map((s, i) =>
  i === SLOT_GUN ? 'gun' : i === SLOT_BOOST ? null : s.equipmentId,
);

/** The same hull with all three family slots occupied — the first kind of each
 *  family, read off the model. */
const ROW_FULL: readonly (EquipmentId | null)[] = ROW_OPEN.map((id, i) => {
  const k = (WEAPON_SLOTS as readonly number[]).indexOf(i);
  return k < 0 ? id : familyMembers(SLOT_FAMILIES[k])[0];
});

/** The three RETIRED deck-gun modules (reference only since Story 10.4; the
 *  PvE fleet that mounted `gun` retired at 10.8) — the hosts the three gun ladders name. A captain mounts none of them. */
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

/** The offer type of each dealt line, for a ship's eligible set. */
function typesOf(ship: DrawShip, offer: readonly LineId[], catalog: Catalog = CATALOG): (OfferType | undefined)[] {
  const byId = new Map(eligibleLines(ship, catalog).map((e) => [e.id, e.type]));
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

/** An rng that hands out a SCRIPTED sequence of values (then 0 forever), and
 *  counts them — for mechanism tests that must know which value each draw
 *  step sees. */
function scriptedRng(values: readonly number[]): { rng: Rng; calls: () => number } {
  let n = 0;
  const next = (): number => {
    const v = values[n] ?? 0;
    n += 1;
    return v;
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

/** Every copy of every dealable line of the given catalog kinds, to its cap. */
function capped(kinds: readonly CatalogLine['kind'][], catalog: Catalog = CATALOG): LineId[] {
  const out: LineId[] = [];
  for (const key of Object.keys(catalog)) {
    const line = catalog[key];
    if (line === undefined || line.stub === true || !kinds.includes(line.kind)) continue;
    for (let i = 0; i < line.cap; i += 1) out.push(key as LineId);
  }
  return out;
}

/** A hand that fills every dealable LADDER and ADD-ON to its cap. */
function everyUpgradeCapped(catalog: Catalog = CATALOG): LineId[] {
  return capped(['ladder', 'addon'], catalog);
}

/** One weapon per family, held to its cap — every family slot filled and maxed. */
function slotWeaponsCapped(): LineId[] {
  return SLOT_FAMILIES.flatMap((f) => {
    const line = WEAPON_LINES.find((id) => familyOfLine(id) === f)!;
    return new Array<LineId>(CATALOG[line].cap).fill(line);
  });
}

describe('eligibleLines — the whole eligibility law', () => {
  it('is in CATALOG key order and never holds a stub or an unknown id', () => {
    const ids = eligibleLines(OPEN).map((e) => e.id);
    expect(ids).toEqual(LINE_IDS.filter((id) => ids.includes(id)));
    for (const id of ids) expect(CATALOG[id].stub, id).not.toBe(true);
  });

  it('ON AN EMPTY ROW: every family weapon line is an `equipment` BARE WEAPON — and BROADSIDE, with no slot, is not eligible at all (R6)', () => {
    const eligible = eligibleLines(OPEN);
    for (const id of WEAPON_LINES) expect(eligible, id).toContainEqual({ id, type: 'equipment', bareWeapon: true });
    expect(eligible.filter((e) => e.bareWeapon).map((e) => e.id)).toEqual(WEAPON_LINES);
    expect(eligible.some((e) => e.id === 'broadside')).toBe(false);
  });

  it('BROADSIDE and every line the kit retire deleted are never eligible, whatever the ship holds (Story 10.5)', () => {
    const ships: DrawShip[] = [OPEN, CLOSED, shipOf([]), shipOf(['lightTorpedo']), { ...OPEN, held: ['broadside'] }];
    for (const ship of ships) {
      const ids = eligibleLines(ship).map((e) => e.id as string);
      // (`hullRepair` is a live SHIP ladder again since Story 10.6, R8.)
      for (const gone of ['broadside', 'shieldBlock', 'countermeasure', 'radarBuoy', 'healingBuoy', 'shieldBuoy', 'speedBuoy', 'depthCharge', 'rudder']) {
        expect(ids, gone).not.toContain(gone);
      }
    }
  });

  it('WITH A FAMILY SLOT FILLED: no unheld line of THAT family is eligible; the other families are untouched', () => {
    for (const family of SLOT_FAMILIES) {
      const slotIds = [...ROW_OPEN];
      slotIds[FAMILY_SLOT[family]] = familyMembers(family)[0];
      const weapons = eligibleLines({ ...OPEN, slotIds }).filter((e) => e.bareWeapon).map((e) => e.id);
      expect(weapons, family).toEqual(WEAPON_LINES.filter((id) => familyOfLine(id) !== family));
    }
    expect(eligibleLines(CLOSED).filter((e) => e.bareWeapon)).toEqual([]);
  });

  it('a HELD equipment line below its cap is an `equipment` TIER card (not a bare weapon), and at cap it is out', () => {
    for (const id of WEAPON_LINES) {
      const cap = CATALOG[id].cap;
      for (let copies = 1; copies < cap; copies += 1) {
        expect(eligibleLines(shipOf(new Array<LineId>(copies).fill(id))), `${id} x${copies}`).toContainEqual({ id, type: 'equipment', bareWeapon: false });
      }
      expect(eligibleLines(shipOf(new Array<LineId>(cap).fill(id))).some((e) => e.id === id), id).toBe(false);
    }
  });

  it('is FAIL-CLOSED on a short slot array: a missing family slot is never empty, so no bare weapon is eligible', () => {
    expect(eligibleLines({ ...OPEN, slotIds: [] }).filter((e) => e.bareWeapon)).toEqual([]);
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
    for (const id of ['engines', 'intel', 'reload', 'range', 'hullRepair', 'smokeScreen']) {
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
    for (const id of ['armor', 'power', 'engines', 'intel', 'reload', 'range', 'hullRepair', 'smokeScreen'] as const) {
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
      // Every gun ladder that IS eligible is a SHIP card, never a bare weapon.
      for (const e of eligibleLines(ship)) {
        if (GUN_LADDERS.includes(e.id)) expect(e, `${gun}/${e.id}`).toEqual({ id: e.id, type: 'ship', bareWeapon: false });
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

  it('an ADD-ON is dealt only while a weapon it NAMES holds its family slot — never ahead of its host (Story 10.6, R10 / I8)', () => {
    // The law, pinned on an INJECTED add-on that names ONE shell (the
    // production one-offs name a whole family — catalogUnderIndex.test.ts):
    // what matters is which equipment sits in the slot, not the open row
    // (amendment 89b's held-ahead rule is retired).
    const WITH_ADDON: Catalog = {
      ...CATALOG,
      foulingShell: {
        id: 'foulingShell', kind: 'addon', cap: 1, appliesTo: ['starShells'],
        tiers: [[{ kind: 'stat', path: 'equipment.starShells.litRadius', mult: 1.1 }]],
      },
    };
    const has = (ship: DrawShip): boolean => eligibleLines(ship, WITH_ADDON).some((e) => e.id === 'foulingShell');
    const withShell = (eq: EquipmentId): DrawShip => {
      const slotIds = [...ROW_OPEN];
      slotIds[FAMILY_SLOT.shell] = eq;
      return { ...OPEN, slotIds };
    };
    // Row open, no host aboard: NOT dealt (the held-ahead rule is gone).
    expect(has(OPEN)).toBe(false);
    // The host in its family slot: an equipment card (never a bare weapon).
    expect(has(withShell('starShells'))).toBe(true);
    expect(eligibleLines(withShell('starShells'), WITH_ADDON)).toContainEqual({ id: 'foulingShell', type: 'equipment', bareWeapon: false });
    // ANOTHER kind of the family in the slot is not the host.
    expect(has(withShell('phosphorShells'))).toBe(false);
    // ...and at its cap of 1 it leaves, host or no host.
    expect(has({ ...withShell('starShells'), held: ['starShells', 'foulingShell'] })).toBe(false);
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
// THE FOUR-SLOT TYPE PLAN (Story 10.7, Eric 2026-11-06, epic-10 amendment 13,
// rulings R1–R4): `[ship, equipment, wildcard, wildcard]`, property-style over
// many seeds and generated ship states.
// ---------------------------------------------------------------------------

/** A tiny weight — "less likely" pushed far enough that a scripted pick moves. */
const TINY = 1e-6;

/** `hand` with ONE copy of `id` removed. */
function minusOne(hand: readonly LineId[], id: LineId): LineId[] {
  const i = hand.lastIndexOf(id);
  return i < 0 ? [...hand] : [...hand.slice(0, i), ...hand.slice(i + 1)];
}

/** The ladders a CAPTAIN can be dealt (the gun ladders host on rows no
 *  captain mounts), in catalog order. */
const CAPTAIN_LADDERS: LineId[] = eligibleLines(shipOf([])).filter((e) => e.type === 'ship').map((e) => e.id);

/** The named ship states of the spec's I/O matrix, built as real captains. */
function fixtureStates(): [string, DrawShip][] {
  const ladders = capped(['ladder']);
  const addons = capped(['addon']);
  const weapons = slotWeaponsCapped();
  const full = [...ladders, ...addons, ...weapons];
  const firstLadder = CAPTAIN_LADDERS[0];
  const lastLadder = CAPTAIN_LADDERS[CAPTAIN_LADDERS.length - 1];
  const lastWeapon = weapons[weapons.length - 1];
  return [
    ['bare hull', shipOf([])],
    ['open row on the gun-module fit', OPEN],
    ['row closed by a fit', CLOSED],
    ['one weapon slotted', shipOf([WEAPON_LINES[0]])],
    ['one weapon slotted, one ladder rung', shipOf([WEAPON_LINES[0], firstLadder])],
    ['equipment exhausted', shipOf([...addons, ...weapons])],
    ['ship ladders exhausted', shipOf(ladders)],
    ['ship ladders exhausted, one weapon slotted', shipOf([...ladders, WEAPON_LINES[0]])],
    ['one ship line left, equipment open', shipOf(minusOne(ladders, lastLadder))],
    ['three eligible', shipOf(minusOne(minusOne(minusOne(full, firstLadder), lastLadder), lastWeapon))],
    ['two eligible', shipOf(minusOne(minusOne(full, lastLadder), lastWeapon))],
    ['one eligible', shipOf(minusOne(full, lastWeapon))],
    ['nothing eligible', shipOf(full)],
  ];
}

/** Ship states along seeded random card histories, offer → legal pick, the way
 *  the server builds them, until nothing is left to deal. */
function historyStates(trials: number): [string, DrawShip][] {
  const rng = mulberry32(0x10_7_0);
  const out: [string, DrawShip][] = [];
  for (let trial = 0; trial < trials; trial += 1) {
    const held: LineId[] = [];
    for (let level = 0; level < 200; level += 1) {
      const ship = shipOf([...held]);
      out.push([`history ${trial} level ${level}`, ship]);
      const offer = drawOffer(ship, NO_WEIGHTS, rng);
      if (offer.length === 0) break;
      held.push(rng.pick(offer));
    }
  }
  return out;
}

const STATES: [string, DrawShip][] = [...fixtureStates(), ...historyStates(12)];

/** Seeds per state for the property sweeps. */
const SEEDS_PER_STATE = 8;

/** Does `eligible` hold a line of type `t`? */
const hasType = (eligible: readonly Eligible[], t: OfferType): boolean => eligible.some((e) => e.type === t);

/** THE PLAN INVARIANTS of one drawn offer against the ship's eligible set. */
function expectPlan(ship: DrawShip, offer: readonly LineId[], label: string): void {
  const eligible = eligibleLines(ship);
  const ids = eligible.map((e) => e.id);
  expect(offer.length, label).toBe(Math.min(CONFIG.offer.size, eligible.length));
  expect(new Set(offer).size, `${label}: no duplicate line`).toBe(offer.length);
  for (const id of offer) expect(ids, `${label}: ${id} eligible`).toContain(id);
  const types = typesOf(ship, offer);
  const ship0 = hasType(eligible, 'ship');
  const equipment0 = hasType(eligible, 'equipment');
  if (offer.length > 0) expect(types[0], `${label}: card 0`).toBe(ship0 ? 'ship' : 'equipment');
  if (offer.length > 1 && equipment0) expect(types[1], `${label}: card 1`).toBe('equipment');
  if (!ship0) expect(types.every((t) => t === 'equipment'), `${label}: ship exhausted`).toBe(true);
  if (!equipment0) expect(types.every((t) => t === 'ship'), `${label}: equipment exhausted`).toBe(true);
}

/** THE RNG COST the plan implies for a drawn offer: one value per dealt card,
 *  plus one coin per WILDCARD slot (every slot after the two fixed ones) that
 *  still had an undealt line of BOTH types when it was dealt. */
function planRngCost(ship: DrawShip, offer: readonly LineId[]): number {
  const eligible = eligibleLines(ship);
  let cost = offer.length;
  for (let i = 2; i < offer.length; i += 1) {
    const dealt = new Set(offer.slice(0, i));
    const remaining = eligible.filter((e) => !dealt.has(e.id));
    if (hasType(remaining, 'ship') && hasType(remaining, 'equipment')) cost += 1;
  }
  return cost;
}

describe('the generated ship states cover every I/O-matrix row', () => {
  it('holds a full set of both types, both exhaustions, a short set (2 and 3 lines) and an empty one', () => {
    const sets = STATES.map(([, ship]) => eligibleLines(ship));
    expect(sets.some((e) => e.length >= CONFIG.offer.size && hasType(e, 'ship') && hasType(e, 'equipment'))).toBe(true);
    expect(sets.some((e) => e.length > 0 && !hasType(e, 'equipment'))).toBe(true);
    expect(sets.some((e) => e.length > 0 && !hasType(e, 'ship'))).toBe(true);
    expect(sets.some((e) => e.length === 2)).toBe(true);
    expect(sets.some((e) => e.length === 3)).toBe(true);
    expect(sets.some((e) => e.length === 0)).toBe(true);
    // ...and a state where the Ship type runs dry after the fixed Ship slot.
    expect(sets.some((e) => e.filter((x) => x.type === 'ship').length === 1 && e.length > CONFIG.offer.size)).toBe(true);
  });

  it('every eligible line carries the type of its catalog kind; only copy 1 of an equipment line is a bare weapon', () => {
    for (const [label, ship] of STATES) {
      for (const e of eligibleLines(ship)) {
        const kind = CATALOG[e.id].kind;
        expect(e.type, `${label}: ${e.id}`).toBe(kind === 'ladder' ? 'ship' : 'equipment');
        expect(e.bareWeapon, `${label}: ${e.id}`).toBe(kind === 'equipment' && boonStackCount(ship.held, e.id) === 0);
      }
    }
  });
});

describe('drawOffer — the four-slot type plan', () => {
  it('PROPERTY: card 0 Ship and card 1 Equipment whenever that type has a line; one type exhausted → all the other; no duplicate; length = min(size, eligible); every card eligible', () => {
    for (const [label, ship] of STATES) {
      for (let seed = 0; seed < SEEDS_PER_STATE; seed += 1) {
        expectPlan(ship, drawOffer(ship, NO_WEIGHTS, mulberry32(seed)), `${label} seed ${seed}`);
      }
    }
  });

  it('PROPERTY: the invariants hold under a lopsided weighting too', () => {
    const heavy: Weights = new Map(WEAPON_LINES.map((id, i) => [id, i % 2 === 0 ? TINY : 1]));
    for (const [label, ship] of STATES) {
      for (let seed = 0; seed < SEEDS_PER_STATE; seed += 1) {
        expectPlan(ship, drawOffer(ship, heavy, mulberry32(seed)), `${label} seed ${seed}`);
      }
    }
  });

  it('AT LEVEL ZERO the Equipment card is a bare weapon the hull can take', () => {
    const bare = shipOf([]);
    for (let seed = 0; seed < 200; seed += 1) {
      const offer = drawOffer(bare, NO_WEIGHTS, mulberry32(seed));
      const card = eligibleLines(bare).find((e) => e.id === offer[1]);
      expect(card?.bareWeapon, `seed ${seed}`).toBe(true);
      expect(pickRefusal(bare.held, bare.slotIds, offer[1]), `seed ${seed}`).toBeNull();
    }
  });

  it('NOTHING ELIGIBLE → an empty offer and ZERO rng spent', () => {
    const ship = shipOf([...everyUpgradeCapped(), ...slotWeaponsCapped()]);
    expect(eligibleLines(ship)).toEqual([]);
    const { rng, calls } = countingRng(7);
    expect(drawOffer(ship, NO_WEIGHTS, rng)).toEqual([]);
    expect(calls()).toBe(0);
  });

  it('a catalog with NOTHING dealable draws an empty offer, spends no rng and never throws', () => {
    const stubOnly: Catalog = { depthCharge: CATALOG.depthCharge };
    for (const catalog of [stubOnly, {}]) {
      const { rng, calls } = countingRng(1);
      expect(drawOffer(OPEN, NO_WEIGHTS, rng, catalog)).toEqual([]);
      expect(calls()).toBe(0);
    }
  });

  it('is deterministic: the same ship, weights and seed give the same offer', () => {
    const weights: Weights = new Map([[WEAPON_LINES[0], TINY]]);
    for (const [label, ship] of STATES) {
      for (let seed = 0; seed < 3; seed += 1) {
        expect(drawOffer(ship, weights, mulberry32(seed)), `${label} seed ${seed}`).toEqual(drawOffer(ship, weights, mulberry32(seed)));
      }
    }
  });

  it('NEVER deals a line at or over its cap, and never a card the pick gate would refuse', () => {
    for (const [label, ship] of STATES) {
      for (let seed = 0; seed < SEEDS_PER_STATE; seed += 1) {
        for (const id of drawOffer(ship, NO_WEIGHTS, mulberry32(seed))) {
          expect(boonStackCount(ship.held, id), `${label}: ${id}`).toBeLessThan(CATALOG[id].cap);
          expect(pickRefusal(ship.held, ship.slotIds, id), `${label}: ${id}`).toBeNull();
        }
      }
    }
  });
});

describe('drawOffer — the rng cost and the wildcard coin', () => {
  it('RNG COST: one value per dealt card plus one per wildcard slot that had both types to choose from', () => {
    for (const [label, ship] of STATES) {
      for (let seed = 0; seed < SEEDS_PER_STATE; seed += 1) {
        const { rng, calls } = countingRng(seed);
        const offer = drawOffer(ship, NO_WEIGHTS, rng);
        expect(calls(), `${label} seed ${seed}`).toBe(planRngCost(ship, offer));
      }
    }
  });

  it('a wildcard whose other type is DRY takes the type that has lines and spends NO coin', () => {
    const ship = shipOf(minusOne(capped(['ladder']), CAPTAIN_LADDERS[0]));
    const eligible = eligibleLines(ship);
    expect(eligible.filter((e) => e.type === 'ship')).toHaveLength(1);
    expect(eligible.length).toBeGreaterThan(CONFIG.offer.size);
    // Every value the draw sees is LOW — a coin, if one were flipped, would ask
    // for Ship; none is left, so no coin is flipped at all.
    const { rng, calls } = scriptedRng([]);
    const offer = drawOffer(ship, NO_WEIGHTS, rng);
    expect(typesOf(ship, offer)).toEqual(['ship', ...new Array<OfferType>(CONFIG.offer.size - 1).fill('equipment')]);
    expect(calls()).toBe(offer.length);
  });

  it('THE COIN: a low value at a wildcard deals a Ship line, a high value an Equipment line (R1)', () => {
    const bare = shipOf([]);
    const eligible = eligibleLines(bare);
    // Precondition: neither type can run dry inside one offer on a bare hull.
    expect(eligible.filter((e) => e.type === 'ship').length).toBeGreaterThanOrEqual(CONFIG.offer.size);
    expect(eligible.filter((e) => e.type === 'equipment').length).toBeGreaterThanOrEqual(CONFIG.offer.size);
    const LOW = 0;
    const HIGH = 1 - Number.EPSILON;
    for (const startLow of [true, false]) {
      const coins: number[] = [];
      for (let i = 2; i < CONFIG.offer.size; i += 1) coins.push((i % 2 === 0) === startLow ? LOW : HIGH);
      // Fixed slots: one line value each; each wildcard: its coin, then its line value.
      const script = [0, 0, ...coins.flatMap((c) => [c, 0])];
      const { rng, calls } = scriptedRng(script);
      const offer = drawOffer(bare, NO_WEIGHTS, rng);
      const want: OfferType[] = ['ship', 'equipment', ...coins.map((c): OfferType => (c === LOW ? 'ship' : 'equipment'))];
      expect(typesOf(bare, offer), `startLow ${startLow}`).toEqual(want.slice(0, CONFIG.offer.size));
      expect(calls()).toBe(script.length);
    }
  });
});

describe('drawOffer — WEIGHTING bends only WHICH bare weapon (amendment 90)', () => {
  it('a weight on a BARE WEAPON moves a scripted pick off it', () => {
    const bare = shipOf([]);
    const candidates = eligibleLines(bare).filter((e) => e.type === 'equipment');
    expect(candidates.length).toBeGreaterThan(1);
    expect(candidates[0].bareWeapon).toBe(true);
    // The Equipment slot's line value lands in the MIDDLE of the first
    // candidate's even share.
    const script = [0, 0.5 / candidates.length];
    const plain = drawOffer(bare, NO_WEIGHTS, scriptedRng(script).rng);
    const weighted = drawOffer(bare, new Map([[candidates[0].id, TINY]]), scriptedRng(script).rng);
    expect(plain[1]).toBe(candidates[0].id);
    expect(weighted[1]).toBe(candidates[1].id);
  });

  it('a weighting NEVER moves the bare-weapon boundary of a line pick — only WHICH bare weapon lands (amendment 92; 2026-11-06, 10.7 review gate)', () => {
    // Two families slotted (copy 1, below cap → their TIER cards and hosted
    // add-ons are eligible), the last family EMPTY (its kinds are bare weapons).
    const open = SLOT_FAMILIES[SLOT_FAMILIES.length - 1];
    const held = SLOT_FAMILIES.filter((f) => f !== open).map((f) => WEAPON_LINES.find((id) => familyOfLine(id) === f)!);
    const ship = shipOf(held);
    const candidates = eligibleLines(ship).filter((e) => e.type === 'equipment');
    const bareAt = candidates.flatMap((e, i) => (e.bareWeapon ? [i] : []));
    const bareIds = bareAt.map((i) => candidates[i].id);
    // Preconditions: the slot mixes bare weapons with other lines, and the bare
    // weapons sit together in the walk (one family), so "is it bare?" for a
    // scripted value is a fixed interval whose length is their unweighted share.
    expect(bareAt.length).toBeGreaterThan(1);
    expect(bareAt.length).toBeLessThan(candidates.length);
    expect(bareAt[bareAt.length - 1] - bareAt[0]).toBe(bareAt.length - 1);
    const { floor } = CONFIG.offer.weighting;
    const lopsided: [string, Weights][] = [
      ['every bare weapon at the floor', new Map(bareIds.map((id) => [id, floor]))],
      ['one bare weapon at the floor, the rest at 1', new Map([[bareIds[0], floor]])],
      ['one bare weapon near zero, the rest at 1', new Map([[bareIds[0], TINY]])],
    ];
    /** The Equipment card (slot 1) for a scripted line value `r`. */
    const equipmentCard = (weights: Weights, r: number): LineId => drawOffer(ship, weights, scriptedRng([0, r]).rng)[1];
    const isBare = (id: LineId): boolean => bareIds.includes(id);
    const STEPS = 997; // midpoints of a prime grid: never exactly on a walk boundary
    let movedWithinBare = false;
    for (let k = 0; k < STEPS; k += 1) {
      const r = (k + 0.5) / STEPS;
      const plain = equipmentCard(NO_WEIGHTS, r);
      for (const [label, weights] of lopsided) {
        const weighted = equipmentCard(weights, r);
        expect(isBare(weighted), `${label}, r ${r}`).toBe(isBare(plain));
        if (!isBare(plain)) expect(weighted, `${label}, r ${r}`).toBe(plain);
        movedWithinBare ||= weighted !== plain;
      }
    }
    expect(movedWithinBare).toBe(true); // within the bare weapons, a low weight still moves the pick
  });

  it('a weight on any line that is NOT a bare weapon right now — a tier card, a ladder, an add-on — changes NOTHING', () => {
    let exercisedTier = false;
    for (const [label, ship] of STATES) {
      const eligible = eligibleLines(ship);
      const inert: Weights = new Map(eligible.filter((e) => !e.bareWeapon).map((e) => [e.id, TINY]));
      exercisedTier ||= eligible.some((e) => e.type === 'equipment' && !e.bareWeapon);
      for (let seed = 0; seed < SEEDS_PER_STATE; seed += 1) {
        expect(drawOffer(ship, inert, mulberry32(seed)), `${label} seed ${seed}`).toEqual(drawOffer(ship, NO_WEIGHTS, mulberry32(seed)));
      }
    }
    expect(exercisedTier).toBe(true);
  });

  it('no weighting ever changes a slot TYPE — only which bare weapon fills it', () => {
    const heavy: Weights = new Map(WEAPON_LINES.map((id, i) => [id, i % 2 === 0 ? TINY : 1]));
    let moved = 0;
    for (const [label, ship] of STATES) {
      for (let seed = 0; seed < SEEDS_PER_STATE; seed += 1) {
        const plain = drawOffer(ship, NO_WEIGHTS, mulberry32(seed));
        const weighted = drawOffer(ship, heavy, mulberry32(seed));
        expect(typesOf(ship, weighted), `${label} seed ${seed}`).toEqual(typesOf(ship, plain));
        if (weighted.join() !== plain.join()) moved += 1;
      }
    }
    expect(moved).toBeGreaterThan(0); // the weighting is not inert
  });
});

// ---------------------------------------------------------------------------
// ONE KIND PER SLOT (Story 10.5, Eric 2026-11-05, epic-10 amendment 11): once a
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
        const offer = drawOffer(ship, NO_WEIGHTS, rng);
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

describe('drawBonusIndex — the exhausted hull\'s pick (Story 10.7, R5)', () => {
  const BONUS_IDS = CONFIG.offer.exhausted.indices;

  it('spends exactly ONE rng value and answers a listed index', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const { rng, calls } = countingRng(seed);
      expect(BONUS_IDS).toContain(drawBonusIndex(rng));
      expect(calls()).toBe(1);
    }
  });

  it('is uniform: each equal slice of [0, 1) maps to its own index, and every index is reachable', () => {
    const n = BONUS_IDS.length;
    const fixed = (v: number): Rng => ({ next: () => v, float: () => v, int: () => 0, pick: <T>(arr: readonly T[]): T => arr[0] });
    for (let i = 0; i < n; i += 1) {
      expect(drawBonusIndex(fixed(i / n))).toBe(BONUS_IDS[i]);
      expect(drawBonusIndex(fixed((i + 0.999) / n))).toBe(BONUS_IDS[i]);
    }
    expect(drawBonusIndex(fixed(1))).toBe(BONUS_IDS[n - 1]); // a stub rng's 1 stays in range
  });

  it('fails closed (undefined, no junk key) on an empty or misconfigured list and on a NaN / negative rng — the rng value still spent', () => {
    const fixed = (v: number): Rng => ({ next: () => v, float: () => v, int: () => 0, pick: <T>(arr: readonly T[]): T => arr[0] });
    expect(drawBonusIndex(fixed(0.5), [])).toBeUndefined();
    expect(drawBonusIndex(fixed(0.1), ['hullRepair', 'nope'])).toBeUndefined();
    expect(drawBonusIndex(fixed(Number.NaN))).toBeUndefined();
    expect(drawBonusIndex(fixed(-0.5))).toBeUndefined();
    const { rng, calls } = countingRng(7);
    expect(drawBonusIndex(rng, [])).toBeUndefined();
    expect(calls()).toBe(1);
  });

  it('is deterministic off the stream: the same seed picks the same sequence', () => {
    const seq = (seed: number): (string | undefined)[] => {
      const rng = mulberry32(seed);
      return Array.from({ length: 24 }, () => drawBonusIndex(rng));
    };
    expect(seq(0x10_7_5)).toEqual(seq(0x10_7_5));
  });
});
