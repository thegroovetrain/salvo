// THE SLOTS (Story 8.5, re-cut for THE COMMON POOL in Story 8.14; eleven slots,
// one per keyed consumable, from Story 9.2; NINE since Story 10.1 — four bound
// per ship by its KIT) — the
// properties that tie the moving parts of the slot grammar together: the DRAW
// RULE (a ship is never dealt copy 1 of an equipment line with all three weapon
// slots full — sim/draw.ts), the FILL RULE (a `slotFill` takes the first empty
// WEAPON_SLOT), and the WIDTH of the weapon row (three).
//
//   1. THE REACHABLE-HAND PROPERTY. For any hand a ship can actually ACCUMULATE
//      — at most WEAPON_SLOTS.length distinct equipment lines, every line at or
//      under its cap — fitting every equipment copy in ANY order never hits the
//      full-row refusal, and the weapon row ends up holding exactly the hand's
//      non-stub equipment lines. That is the load-bearing claim of the whole
//      story: no reachable build can ever be dealt a card it has no slot for.
//      It holds because 3 ≤ 3 — if either number ever moves alone, this fails
//      LOUDLY rather than dropping a card silently in play.
//
//   THE DECK IS GONE (Story 8.14, epic-8 amendment 89a): `checkDeck` and
//   `CONFIG.deck` no longer exist, so the bound on distinct equipment lines is
//   now STRUCTURAL — the weapon row's width, enforced at the draw — rather than
//   a deck-legality rule. The generator below builds hands against that bound.
//
//   THE SEED TRIPWIRE IS RETIRED (Story 8.10): the interim spawn-seed table is
//   deleted, so a hull's weapon row holds nothing but the cards it is dealt.
//
// 2. THE SEAT'S GUN (Story 8.14, amendment 95): `loadoutFor(stats, fleet, gun)`
//    mounts slot 0 from MOUNTED_GUN — each seat gun on its OWN module since
//    Story 8.15 (amendments 103–105).
//
// 3. THE PER-KIT PLACEMENT PROPERTY (Story 9.2, re-cut in Story 10.1): for any
//    kit, slot `5 + i` holds `kit[i]` and nothing else over any reachable
//    hand, in any pick order; a line outside the kit stocks nowhere.
//
// Pure, zero I/O. Seeded PRNG (mulberry32), so a failure is reproducible.

import { describe, it, expect } from 'vitest';
import {
  CATALOG,
  CONSUMABLE_IDS,
  DEFAULT_GUN,
  EQUIPMENT_IS_WEAPON,
  GUN_IDS,
  LINE_IDS,
  MOUNTED_GUN,
  SHIP_CLASS_IDS,
  WEAPON_SLOTS,
  CONSUMABLE_SLOTS,
  DEFAULT_KIT,
  KIT_SIZE,
  consumableKindAt,
  consumableSlotFor,
  isConsumableKit,
  rollKit,
  SLOT_BOOST,
  SLOT_COUNT,
  SLOT_GUN,
  applySlotEffect,
  classShift,
  effectiveStats,
  isGunId,
  hullEnvelope,
  isStubLine,
  loadoutFor,
  mulberry32,
  slotsWithCards,
  type Catalog,
  type CatalogLine,
  type ConsumableKit,
  type EquipmentId,
  type LineId,
  type Rng,
} from '../index.js';

/** How many cards a generated hand holds — the old authored deck size, kept as
 *  a local number so the suite still exercises a deep hand. Nothing in the sim
 *  reads it any more (Story 8.14 deleted `CONFIG.deck`). */
const HAND_SIZE = 40;

/** The widest a hand's equipment row can ever get: the draw refuses copy 1 of a
 *  fourth line, so a reachable hand holds at most this many distinct ones. */
const MAX_EQUIPMENT_LINES = WEAPON_SLOTS.length;

/** The eleven `equipment` lines — STUBS INCLUDED, because the DECK RULE counts
 *  them and a legal deck may be built entirely out of them. */
const EQUIPMENT_LINES: readonly LineId[] = LINE_IDS.filter((id) => CATALOG[id].kind === 'equipment');

/** Everything a deck can be padded out with: ladders, consumables, add-ons. */
const FILLER_LINES: readonly LineId[] = LINE_IDS.filter((id) => CATALOG[id].kind !== 'equipment');

/** A Fisher-Yates shuffle off the seeded stream. */
function shuffled<T>(rng: Rng, xs: readonly T[]): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = rng.int(0, i);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * A random REACHABLE hand: up to `MAX_EQUIPMENT_LINES` distinct equipment lines
 * at random counts, padded to exactly `HAND_SIZE` with non-equipment lines at
 * or under their caps (two passes — a random one, then a greedy one that always
 * closes the gap, since the filler capacity is 59 against a 40-card hand).
 * Returns the cards in a RANDOM order, plus the equipment lines it used.
 */
function randomReachableHand(rng: Rng): { cards: LineId[]; equipment: LineId[] } {
  const equipment = shuffled(rng, EQUIPMENT_LINES).slice(0, rng.int(0, MAX_EQUIPMENT_LINES));
  const cards: LineId[] = [];
  for (const id of equipment) {
    for (let i = rng.int(1, CATALOG[id].cap); i > 0; i -= 1) cards.push(id);
  }
  const filler = shuffled(rng, FILLER_LINES);
  const taken = new Map<LineId, number>();
  for (const greedy of [false, true]) {
    for (const id of filler) {
      const room = Math.min(HAND_SIZE - cards.length, CATALOG[id].cap - (taken.get(id) ?? 0));
      if (room <= 0) continue;
      const n = greedy ? room : rng.int(0, room);
      taken.set(id, (taken.get(id) ?? 0) + n);
      for (let i = n; i > 0; i -= 1) cards.push(id);
    }
  }
  return { cards: shuffled(rng, cards), equipment };
}

describe('THE REACHABLE-HAND PROPERTY — a reachable hand can never out-card the weapon row', () => {
  it('over 250 random reachable hands: no fill is refused, and the row holds exactly the non-stub equipment', () => {
    const rng = mulberry32(0x9510_75);
    const stats = effectiveStats(hullEnvelope('torpedoBoat'));
    for (let trial = 0; trial < 250; trial += 1) {
      const { cards, equipment } = randomReachableHand(rng);
      const label = `trial ${trial}`;
      expect(cards, label).toHaveLength(HAND_SIZE);
      expect(new Set(equipment).size, label).toBeLessThanOrEqual(MAX_EQUIPMENT_LINES);

      // Fit every copy in the hand's RANDOM order, exactly as slotsWithCards
      // replays it, and watch each individual fill land.
      const loadout = loadoutFor(stats);
      const copies = new Map<LineId, number>();
      for (const id of cards) {
        const line = CATALOG[id];
        const copy = (copies.get(id) ?? 0) + 1;
        copies.set(id, copy);
        expect(copy, `${label}:${id}`).toBeLessThanOrEqual(line.cap);
        for (const e of line.tiers[copy - 1] ?? []) {
          if (e.kind !== 'slotFill') continue;
          applySlotEffect(loadout, e, stats, DEFAULT_KIT, CATALOG);
          // THE FULL-ROW REFUSAL IS NEVER REACHED: a non-stub fill always ends
          // up fitted somewhere (this same copy, or an earlier one).
          if (isStubLine(id)) continue;
          expect(loadout.some((s) => s.equipmentId === e.equipmentId), `${label}:${id}`).toBe(true);
        }
      }

      const expected = equipment.filter((id) => !isStubLine(id));
      const fitted = WEAPON_SLOTS.map((i) => loadout[i].equipmentId).filter((id) => id !== null);
      expect([...fitted].sort(), label).toEqual([...(expected as unknown as EquipmentId[])].sort());
      // ...and the fill never left the weapon row: gun, boost and the consumable slots are
      // exactly as loadoutFor built them.
      expect(loadout[SLOT_GUN].equipmentId, label).toBe('gun');
      expect(loadout[SLOT_BOOST].equipmentId, label).toBe('boost');
      for (const i of CONSUMABLE_SLOTS) {
        expect(loadout[i], `${label}:consumable ${i}`).toEqual({ equipmentId: null, state: null });
      }
    }
  });

});

// ---------------------------------------------------------------------------
// THE SEAT'S GUN (Story 8.14, Eric rulings 2026-09-21/22, epic-8 amendments
// 89d/95). The gun is the captain's PICK, frozen at queue; slot 0 mounts the
// module MOUNTED_GUN names for it. STORY 8.15 gave the machine gun and the
// flak gun their own modules (amendments 103–105), ending the 8.14 interim in
// which all three mounted the deck-gun module.
// ---------------------------------------------------------------------------

describe("loadoutFor(stats, fleet, gun) — slot 0 is the SEAT'S gun", () => {
  const stats = effectiveStats(hullEnvelope('torpedoBoat'));

  it('each seat gun mounts ITS OWN module (Story 8.15): deckGun→gun, machineGun→machineGun, flak→flak', () => {
    expect(MOUNTED_GUN.deckGun).toBe('gun');
    expect(MOUNTED_GUN.machineGun).toBe('machineGun');
    expect(MOUNTED_GUN.flak).toBe('flak');
    expect(new Set(GUN_IDS.map((g) => MOUNTED_GUN[g])).size).toBe(GUN_IDS.length); // no two share one
  });

  it.each(GUN_IDS)('%s mounts its module in slot 0 with a FULL pool', (gun) => {
    const eq = MOUNTED_GUN[gun];
    const loadout = loadoutFor(stats, false, gun);
    expect(loadout[SLOT_GUN]).toEqual({ equipmentId: eq, state: { n: stats.equipment[eq].maxAmmo, reloadMsLeft: 0 } });
    expect(loadout[SLOT_BOOST].equipmentId).toBe('boost');
    expect(loadout).toHaveLength(SLOT_COUNT);
    expect(EQUIPMENT_IS_WEAPON[eq]).toBe(true);
  });

  it('the Shift rides beside ANY gun: every (gun × hull) seat fits slot 0 from the gun and slot 1 from the hull', () => {
    for (const cls of SHIP_CLASS_IDS) {
      const clsStats = effectiveStats(hullEnvelope(cls));
      for (const gun of GUN_IDS) {
        const loadout = loadoutFor(clsStats, false, gun, classShift(cls));
        expect(loadout[SLOT_GUN].equipmentId, `${cls}/${gun}`).toBe(MOUNTED_GUN[gun]);
        expect(loadout[SLOT_BOOST].equipmentId, `${cls}/${gun}`).toBe(classShift(cls));
        // The client replay (slotsWithCards) lands on the SAME fit.
        expect(slotsWithCards(clsStats, [], DEFAULT_KIT, CATALOG, false, gun, classShift(cls)), `${cls}/${gun}`).toEqual(loadout);
      }
    }
  });

  it('the default gun is the deck gun, and the fleet fit is gun-only whatever the seat says', () => {
    expect(DEFAULT_GUN).toBe('deckGun');
    expect(loadoutFor(stats)).toEqual(loadoutFor(stats, false, 'deckGun'));
    for (const gun of GUN_IDS) {
      const drone = loadoutFor(stats, true, gun);
      expect(drone[SLOT_GUN].equipmentId, gun).toBe('gun');
      expect(drone[SLOT_BOOST].equipmentId, gun).toBeNull();
      for (const i of WEAPON_SLOTS) expect(drone[i].equipmentId, gun).toBeNull();
    }
  });

  it('isGunId is the one narrowing guard, and it fails closed', () => {
    for (const gun of GUN_IDS) expect(isGunId(gun)).toBe(true);
    for (const junk of ['gun', 'monitor', '', 'DECKGUN', null, undefined, 3, {}]) {
      expect(isGunId(junk), String(junk)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// THE PER-KIT PLACEMENT PROPERTY (Story 8.7's rack, re-cut in Story 9.2 — epic-9
// amendments 21/31 — and again in Story 10.1, epic-10 amendment 3). The packed
// belt is retired and the global key row with it: every consumable kind a SHIP
// CARRIES owns ONE fixed slot, `5 + i` for `kit[i]` (`consumableSlotFor`), so
// over any reachable hand taken in any order each stack sits at its own slot,
// nothing packs, nothing shifts, and a line the kit does not carry — live or
// stub — stocks nowhere. The kits are SAMPLED by seed over the production pool
// (`rollKit`); the property also runs on the production catalog with every
// consumable UN-STUBBED, so the DEPTH CHARGE is exercised as a live line that
// no sampled kit carries and that still has nowhere to go.
// ---------------------------------------------------------------------------

/** The production catalog, consumables un-stubbed — nothing else changed. */
const UNSTUBBED: Catalog = (() => {
  const rows: Record<string, CatalogLine> = { ...CATALOG };
  for (const id of CONSUMABLE_IDS) {
    const { stub: _stub, ...rest } = CATALOG[id];
    rows[id] = rest;
  }
  return rows;
})();

/** The per-kit placement contract over one replayed loadout: slot `5 + i`
 *  holds `kit[i]` at n = copies held (capped) or is empty, and no slot holds a
 *  kind the kit does not carry. */
function expectKitPlacement(
  loadout: readonly { equipmentId: string | null; state: { n: number; reloadMsLeft: number } | null }[],
  kit: ConsumableKit,
  copies: ReadonlyMap<string, number>,
  catalog: Catalog,
  label: string,
): void {
  kit.forEach((kind, i) => {
    const slot = CONSUMABLE_SLOTS[i];
    expect(consumableKindAt(kit, slot), `${label}: slot ${slot} is bound to kit[${i}]`).toBe(kind);
    expect(consumableSlotFor(kit, kind), `${label}: ${kind} owns slot ${slot}`).toBe(slot);
    const n = Math.min(copies.get(kind) ?? 0, catalog[kind].cap);
    const want = n === 0 ? { equipmentId: null, state: null } : { equipmentId: kind, state: { n, reloadMsLeft: 0 } };
    expect(loadout[slot], `${label}: ${kind}`).toEqual(want);
  });
  for (const id of CONSUMABLE_IDS) {
    if (consumableSlotFor(kit, id) !== null) continue;
    expect(loadout.some((s) => s.equipmentId === id), `${label}: ${id} is not carried`).toBe(false);
  }
}

describe('THE PER-KIT PLACEMENT PROPERTY — the consumable slots over sampled kits, random reachable hands and random pick orders', () => {
  it('over 200 trials: slot 5+i holds kit[i] and nothing else, n = copies held, weapons untouched, order-invariant', () => {
    const rng = mulberry32(0x8_7_be17);
    const stats = effectiveStats(hullEnvelope('torpedoBoat'));
    for (let trial = 0; trial < 200; trial += 1) {
      const kit = rollKit(rng.next);
      expect(isConsumableKit(kit)).toBe(true);
      const { cards } = randomReachableHand(rng);
      const label = `trial ${trial} [${kit.join(',')}]`;
      const loadout = slotsWithCards(stats, cards, kit, UNSTUBBED);
      const copies = new Map<string, number>();
      for (const id of cards) copies.set(id, (copies.get(id) ?? 0) + 1);

      // 1. EVERY CONSUMABLE SLOT HOLDS ITS KIT LINE OR NOTHING; every line the
      //    kit does not carry (the live-in-UNSTUBBED DEPTH CHARGE included) is
      //    nowhere.
      expectKitPlacement(loadout, kit, copies, UNSTUBBED, label);

      // 2. THE WEAPON ROW IS UNTOUCHED: the whole loadout is byte-identical to
      //    the same hand folded through the production catalog (every sampled
      //    kit line is live in production, and the stub never stocks).
      expect(loadout, label).toEqual(slotsWithCards(stats, cards, kit, CATALOG));

      // 3. ORDER INVARIANCE. Re-taking the same cards in another order lands
      //    every stack in the SAME slot — nothing depends on pick order.
      const other = slotsWithCards(stats, shuffled(rng, cards), kit, UNSTUBBED);
      for (const i of CONSUMABLE_SLOTS) expect(other[i], `${label}: slot ${i}`).toEqual(loadout[i]);

      // 4. THE SLOT FOLLOWS THE KIT, NOT THE LINE: the same four in another
      //    order put each stack at that order's slot, same counts.
      const permuted = shuffled(rng, kit);
      const again = slotsWithCards(stats, cards, permuted, UNSTUBBED);
      expectKitPlacement(again, permuted, copies, UNSTUBBED, `${label} permuted`);
      for (const i of [SLOT_GUN, SLOT_BOOST, ...WEAPON_SLOTS]) expect(again[i], `${label}: slot ${i}`).toEqual(loadout[i]);
    }
  });

  it('there is one consumable slot per carried kind and KIT_SIZE of them — no kind ever competes for room', () => {
    expect(CONSUMABLE_SLOTS).toHaveLength(KIT_SIZE);
    expect(SLOT_COUNT).toBe(SLOT_BOOST + 1 + WEAPON_SLOTS.length + KIT_SIZE);
    for (let seed = 0; seed < 50; seed += 1) {
      const kit = rollKit(mulberry32(seed).next);
      expect(CONSUMABLE_SLOTS.map((i) => consumableKindAt(kit, i)), `seed ${seed}`).toEqual([...kit]);
      expect(new Set(kit.map((id) => consumableSlotFor(kit, id))).size, `seed ${seed}`).toBe(KIT_SIZE);
    }
  });
});
