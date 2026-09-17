// Structural + behavioral suite pinning the Story 1.2 equipment/loadout surface.
// Complements weapons.test.ts (per-weapon ballistics) by exercising the NEW
// generic seam: the Equipment interface + frozen registry, the ActivationResult
// denial vocabulary derived without changing internal effects, empty-slot
// safety, FR5 (a deselected slot still reloads every tick), the single dispatch
// path (the sinking-activation gate is the ONLY caller of Equipment.activate),
// and loadout init/respawn/redeploy parity with the shared loadoutFor.
//
// Denials are driven through World.sinkingActivationGate — the public gate that
// returns the ActivationResult (never a wire event), mirroring how the World is
// the one production caller.

import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import {
  isAfloat,
  CONFIG,
  CATALOG,
  CONSUMABLE_IDS,
  CONSUMABLE_IS_WEAPON,
  EQUIPMENT_IS_WEAPON,
  LINE_IDS,
  CONSUMABLE_SLOTS,
  SLOT_BOOST,
  SLOT_COUNT,
  SLOT_GUN,
  WEAPON_SLOTS,
  equipmentMaxAmmo,
  isStubLine,
  tierTargetOf,
  type InputMsg,
  type Catalog,
  type LoadoutSlot,
} from '@salvo/shared';
import { World, type ShipRecord, type WorldOptions } from '../game/world.js';
import * as ammo from '../game/equipment/ammo.js';
import { hullRepairRow } from '../game/equipment/consumables/hullRepair.js';
import {
  CONSUMABLES,
  EQUIPMENT,
  buildConsumableRegistry,
  consumableRow,
  slotAmmo,
  slotRow,
  type ActivationContext,
  type Equipment,
} from '../game/equipment/index.js';

const DT = CONFIG.tick.simDtMs;
// THE FIXTURE IS NINE FIXED-ROLE SLOTS (Story 8.5). There is no per-hull fit
// left to name: EVERY captain spawns [gun, speedBoost, <seed weapons>, ...] and
// the rest of the nine are empty. What still differs per hull is the SPAWN
// SEED (sim/catalog.ts), which lands its weapons in the weapon row (2, 3, 4)
// first-empty-first:
//   MINE LAYER   [gun, speedBoost, navalMines,   empty x6]
//   TORPEDO BOAT [gun, speedBoost, heavyTorpedo, empty x6]
// THE RADAR BUOY IS NO LONGER FITTED ON ANY HULL (epic-8 amendment 22): no
// card and no seed reaches it, so the cases that exercise its module fit it
// BY HAND into a free weapon slot (fitBuoy below). The module, its CONFIG row
// and its behaviour pins all stay exactly as shipped.
/** Mine Layer fit, in slot order (the rest of the nine are empty). */
const ML_IDS = ['gun', 'speedBoost', 'navalMines'] as const;
/** Torpedo Boat fit, in slot order. */
const TB_IDS = ['gun', 'speedBoost', 'heavyTorpedo'] as const;
/** The first WEAPON slot (Q) — where each hull's single seeded weapon lands. */
const SLOT_MINE = WEAPON_SLOTS[0];
const SLOT_TORPEDO = WEAPON_SLOTS[0];
/** The SECOND weapon slot (E) — free on every hull, so it is where the tests
 *  hand-fit the radar buoy (amendment 22: nothing fits it in play). */
const SLOT_BUOY = WEAPON_SLOTS[1];
/** An EMPTY weapon slot on every hull today (R): the empty-slot subject. */
const SLOT_EMPTY_WEAPON = WEAPON_SLOTS[2];
/** The first BELT slot - empty all of Story 8.5 (8.7 builds the rack). */
const SLOT_BELT = CONSUMABLE_SLOTS[0];

// ---------- construction helpers ---------------------------------------------

/** World whose islands are cleared, for exact-geometry arc cases. `opts` is
 *  the injection seam the Story 8.7 belt cases use (a test consumable
 *  registry — production's is EMPTY, amendment 41). */
function bareWorld(seed = 7, opts?: WorldOptions): World {
  const w = new World(seed, CONFIG.map.playerCap, CONFIG.zone, opts);
  w.map.islands.length = 0;
  return w;
}

/** Add a MINE LAYER and pin it to the origin at a known heading (speed 0) —
 *  the suite's default fixture: [gun, speedBoost, navalMines, empty x6] covers
 *  a 360-degree weapon, an aimed weapon with a rear placement sector, an
 *  ability, and six empty slots in one hull. The role stays 'captain' so the
 *  FleetController never overwrites the scripted inputs. */
function place(w: World, id: string, heading = 0): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), 'captain', 'mineLayer', undefined, undefined, []);
  rec.state = { x: 0, y: 0, heading, speed: 0 };
  return rec;
}

/** The TORPEDO BOAT sibling: [gun, speedBoost, heavyTorpedo, empty x6] — the
 *  only SEED that carries a torpedo, so every bow-arc case runs on this hull. */
function placeTb(w: World, id: string, heading = 0): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), 'captain', 'torpedoBoat', undefined, undefined, []);
  rec.state = { x: 0, y: 0, heading, speed: 0 };
  return rec;
}

/** Set a full, valid InputMsg on a ship (fireSeq 0 => no click by default). */
function setInput(ship: ShipRecord, patch: Partial<InputMsg>): void {
  ship.input = { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0, ...patch };
}

/** HAND-FIT THE RADAR BUOY into the second weapon slot (E). Since epic-8
 *  amendment 22 no hull's spawn seed and no card fits the buoy, so the only
 *  way to exercise its live module is to write the slot directly — exactly
 *  what `applySlotEffect` would have written. The module's behaviour pins are
 *  unchanged; only the route into the slot is. */
function fitBuoy(ship: ShipRecord): void {
  ship.loadout[SLOT_BUOY] = {
    equipmentId: 'radarBuoy',
    state: { n: equipmentMaxAmmo(ship.stats, 'radarBuoy'), reloadMsLeft: 0 },
  };
}

/** Assert a ship carries its fresh nine-slot fit: the named ids at full pool
 *  and an idle timer, with EVERY remaining slot empty. `ids` is passed rather
 *  than assumed, so a hull's fit is pinned HERE and not inherited. */
function expectFreshLoadout(ship: ShipRecord, ids: readonly ['gun', ...string[]]): void {
  expect(ship.loadout).toHaveLength(SLOT_COUNT); // nine since Story 8.5
  for (let i = 0; i < ids.length; i++) {
    expect(ship.loadout[i].equipmentId).toBe(ids[i]);
    const id = ids[i] as Parameters<typeof equipmentMaxAmmo>[1];
    expect(ship.loadout[i].state).toEqual({ n: equipmentMaxAmmo(ship.stats, id), reloadMsLeft: 0 });
  }
  for (let i = ids.length; i < SLOT_COUNT; i++) {
    expect(ship.loadout[i]).toEqual({ equipmentId: null, state: null });
  }
}

// ---------- 1. registry / interface conformance ------------------------------

describe('EQUIPMENT registry — interface conformance', () => {
  it('every row exposes the Equipment interface with a key-matching id', () => {
    for (const [key, row] of Object.entries(EQUIPMENT)) {
      expect(row.id).toBe(key);
      expect(typeof row.isWeapon).toBe('boolean'); // structural only — content pinned separately
      expect(typeof row.tick).toBe('function');
      expect(typeof row.activate).toBe('function');
    }
  });

  it('holds exactly gun / heavyTorpedo / navalMines / speedBoost / broadside / starShells / radarBuoy', () => {
    expect(Object.keys(EQUIPMENT).sort()).toEqual([
      'broadside',
      'gun',
      'heavyTorpedo',
      'navalMines',
      'radarBuoy',
      'speedBoost',
      'starShells',
    ]);
  });

  // THE REGISTRY/CATALOG PIN (Story 8.1). The registry is PARTIAL over the
  // widened EquipmentId, and this is the invariant that makes that safe:
  // every NON-STUB catalog line's `slotFill` target has a module, and every
  // STUB line's target has none. When Stories 8.13–8.16 build a weapon they
  // flip its `stub` flag and this pin tightens automatically — it is what
  // stops an authored-but-unbuilt id from ever reaching a slot.
  it('every NON-STUB slotFill target has a module; every STUB target has none', () => {
    let nonStubTargets = 0;
    for (const id of LINE_IDS) {
      const target = tierTargetOf(CATALOG[id]);
      if (target === undefined || CATALOG[id].kind !== 'equipment') continue;
      const built = Object.hasOwn(EQUIPMENT, target);
      expect(built, `${id} -> ${target}`).toBe(!isStubLine(id));
      if (!isStubLine(id)) nonStubTargets += 1;
    }
    expect(nonStubTargets).toBe(4); // heavyTorpedo, navalMines, broadside, starShells
    // The gun and the speed boost are slotless/base fits — no line fills them,
    // and they are exactly the registry rows no `slotFill` target names.
    expect(Object.hasOwn(EQUIPMENT, 'gun')).toBe(true);
    expect(Object.hasOwn(EQUIPMENT, 'speedBoost')).toBe(true);
  });

  // Content-level, NOT conformance: the weapon/ability split rides the shared
  // EQUIPMENT_IS_WEAPON map (single source) — gun/torpedo/broadside/starShells
  // AND (as of Story 2.8, amendment 45) the mine are aimed-click weapons, and
  // since Story 7-5 wave 2 so is the RADAR BUOY (click-placed in the mine's
  // rear sector, R2.7 — where the decoy buoy it replaced was an un-aimed
  // stern-drop ability). speedBoost (1.6) is the ONLY non-weapon left.
  it('each row mirrors the shared EQUIPMENT_IS_WEAPON split', () => {
    for (const [id, row] of Object.entries(EQUIPMENT)) {
      expect(row!.isWeapon).toBe(EQUIPMENT_IS_WEAPON[id as keyof typeof EQUIPMENT_IS_WEAPON]);
    }
    expect(EQUIPMENT.gun!.isWeapon).toBe(true);
    expect(EQUIPMENT.heavyTorpedo!.isWeapon).toBe(true);
    // Story 2.8 (amendment 45) DELIBERATELY FLIPS the 1.8 ability pin: the mine
    // is a click-aimed weapon again (rear placement arc + placeRange).
    expect(EQUIPMENT.navalMines!.isWeapon).toBe(true);
    expect(EQUIPMENT.speedBoost!.isWeapon).toBe(false);
    expect(EQUIPMENT.broadside!.isWeapon).toBe(true); // Story 7-5 wave 2
    expect(EQUIPMENT.starShells!.isWeapon).toBe(true); // Story 1.7
    expect(EQUIPMENT.radarBuoy!.isWeapon).toBe(true); // Story 7-5 wave 2 (R2.7): click-placed
  });

  it('the registry itself is frozen — rows cannot be added', () => {
    expect(Object.isFrozen(EQUIPMENT)).toBe(true);
    expect(() => {
      (EQUIPMENT as unknown as Record<string, Equipment>).boost = EQUIPMENT.gun!;
    }).toThrow();
  });

  it('each row is frozen — fields cannot be mutated', () => {
    for (const row of Object.values(EQUIPMENT)) {
      expect(Object.isFrozen(row)).toBe(true);
      expect(() => {
        (row as unknown as { isWeapon: boolean }).isWeapon = false;
      }).toThrow();
    }
  });
});

// ---------- 1b. the CONSUMABLE rows + the two-registry lookup (Story 8.7) -----

// A consumable is not a module: it is a STACK of copies in a belt slot (5-8),
// each copy one use, with NO reload EVER (catalog-v3 R40). The row below is
// the equipment row with its reload machinery removed, and these pins are what
// say so — including the PRODUCTION pin that the registry holds exactly the
// lines whose effects are BUILT: since Story 8.8 that is HULL REPAIR and
// nothing else (the other four stay `stub`, so they are still undealable and
// unstockable in play).

describe('consumable rows — the belt half of the Equipment interface (Story 8.7)', () => {
  /** A stack as `applyStock` writes one: n copies, and a timer that is 0 for
   *  the stack's whole life. */
  const stack = (n: number): LoadoutSlot => ({ equipmentId: 'hullRepair', state: { n, reloadMsLeft: 0 } });
  /** Rows never read the context in 8.7 (no effect ships), so a directed
   *  activation hands them a minimal one. */
  const CTX = { now: 0, fireT: 0 } as unknown as ActivationContext;

  it('a row conforms to the Equipment interface, keyed by its own ConsumableId', () => {
    for (const id of CONSUMABLE_IDS) {
      const row = consumableRow(id, () => ({ ok: true }));
      expect(row.id).toBe(id);
      expect(typeof row.tick).toBe('function');
      expect(typeof row.activate).toBe('function');
      // The split is READ from the shared single source, never re-stated: only
      // the DECOY BUOY is click-placed (catalog-v3 R1).
      expect(row.isWeapon, id).toBe(CONSUMABLE_IS_WEAPON[id]);
    }
    expect(consumableRow('decoyBuoy', () => ({ ok: true })).isWeapon).toBe(true);
    expect(consumableRow('hullRepair', () => ({ ok: true })).isWeapon).toBe(false);
  });

  it('tick is a NO-OP: a stack never reloads, however long it sits fitted', () => {
    const row = consumableRow('hullRepair', () => ({ ok: true }));
    const slot = stack(2);
    const ship = placeTb(bareWorld(), 'a');
    for (let i = 0; i < 200; i++) row.tick(ship, slot, DT);
    expect(slot.state).toEqual({ n: 2, reloadMsLeft: 0 });
  });

  it('activate runs the line effect FIRST and spends the copy only on success', () => {
    const seen: number[] = [];
    const row = consumableRow('hullRepair', (_ctx, slot) => {
      seen.push(slot.state!.n); // the copy is still on the stack while the effect runs
      return { ok: true };
    });
    const slot = stack(2);
    expect(row.activate(CTX, slot)).toEqual({ ok: true });
    expect(slot.state).toEqual({ n: 1, reloadMsLeft: 0 }); // ...and NO reload armed
    expect(row.activate(CTX, slot)).toEqual({ ok: true });
    expect(slot.state).toEqual({ n: 0, reloadMsLeft: 0 });
    expect(seen).toEqual([2, 1]);
  });

  it('an EMPTY or cleared stack denies no-ammo, runs no effect, and changes nothing', () => {
    let ran = 0;
    const row = consumableRow('hullRepair', () => { ran += 1; return { ok: true }; });
    const empty = stack(0);
    expect(row.activate(CTX, empty)).toEqual({ ok: false, reason: 'no-ammo' });
    expect(empty.state).toEqual({ n: 0, reloadMsLeft: 0 });
    const cleared: LoadoutSlot = { equipmentId: null, state: null };
    expect(row.activate(CTX, cleared)).toEqual({ ok: false, reason: 'no-ammo' });
    expect(cleared).toEqual({ equipmentId: null, state: null });
    expect(ran).toBe(0);
  });

  // ONE SPEND LAW (Story 8.7 review patch P2). A copy leaves the stack and a
  // copy leaves `ship.cards` on the SAME condition — `result.ok` — and nowhere
  // else. The gate only runs `spendStock` on success, so a decrement here on a
  // denial would leave an `{ n: 0 }` zombie stack whose card is still held and
  // is handed back on the next respawn replay. A denied effect is a no-event.
  it('a DENIED effect costs nothing: n, cards and the slot are untouched', () => {
    const row = consumableRow('hullRepair', () => ({ ok: false, reason: 'blocked' }));
    const slot = stack(1);
    expect(row.activate(CTX, slot)).toEqual({ ok: false, reason: 'blocked' });
    expect(slot.state).toEqual({ n: 1, reloadMsLeft: 0 });
    // ...and it stays free to retry, as many times as it is denied.
    expect(row.activate(CTX, slot)).toEqual({ ok: false, reason: 'blocked' });
    expect(slot.state).toEqual({ n: 1, reloadMsLeft: 0 });
  });

  it('buildConsumableRegistry deep-freezes: the map AND every row inside it', () => {
    const row = consumableRow('hullRepair', () => ({ ok: true }));
    const reg = buildConsumableRegistry([row]);
    expect(reg.hullRepair).toBe(row);
    expect(Object.isFrozen(reg)).toBe(true);
    expect(Object.isFrozen(reg.hullRepair)).toBe(true);
    expect(() => {
      (reg as unknown as Record<string, unknown>).chaff = row;
    }).toThrow();
    expect(() => {
      (reg.hullRepair as unknown as { isWeapon: boolean }).isWeapon = true;
    }).toThrow();
  });

  // THE PRODUCTION PIN. Story 8.8 flipped `hullRepair` and added its row; the
  // other four consumable lines are still stubs, so nothing else is drawable
  // and nothing else is stockable in play.
  it('the PRODUCTION consumable registry holds exactly HULL REPAIR', () => {
    expect(Object.keys(CONSUMABLES)).toEqual(['hullRepair']);
    expect(Object.isFrozen(CONSUMABLES)).toBe(true);
    expect(Object.isFrozen(CONSUMABLES.hullRepair)).toBe(true);
    for (const id of CONSUMABLE_IDS) {
      if (id === 'hullRepair') continue;
      expect(CONSUMABLES[id], id).toBeUndefined();
    }
  });

  // The `slotFill` totality pin's sibling (see section 1): every NON-STUB
  // consumable line must have a row, every STUB one must have none. Live on
  // both halves since Story 8.8 — exactly one line is built, and the pin
  // tightens by itself the day another is.
  it('every NON-STUB consumable line has a row; every STUB one has none', () => {
    let nonStub = 0;
    for (const id of CONSUMABLE_IDS) {
      expect(CATALOG[id].kind, id).toBe('consumable');
      expect(Object.hasOwn(CONSUMABLES, id), id).toBe(!isStubLine(id));
      if (!isStubLine(id)) nonStub += 1;
    }
    expect(nonStub).toBe(1); // Story 8.8: HULL REPAIR, and only it
  });

  it('slotRow routes BOTH id spaces, and fails closed on null / an unbuilt id', () => {
    const row = consumableRow('hullRepair', () => ({ ok: true }));
    const reg = buildConsumableRegistry([row]);
    // equipment ids -> EQUIPMENT (the consumable registry is never consulted)
    expect(slotRow('gun', reg)).toBe(EQUIPMENT.gun);
    expect(slotRow('speedBoost', reg)).toBe(EQUIPMENT.speedBoost);
    expect(slotRow('lightTorpedo', reg)).toBeUndefined(); // authored, unbuilt (Story 8.13)
    // consumable ids -> the injected registry, NEVER EQUIPMENT
    expect(slotRow('hullRepair', reg)).toBe(row);
    expect(slotRow('chaff', reg)).toBeUndefined();
    // ...and production resolves HULL REPAIR alone for the belt (Story 8.8)
    expect(slotRow('hullRepair')).toBe(hullRepairRow);
    expect(slotRow('chaff')).toBeUndefined();
    expect(slotRow(null, reg)).toBeUndefined();
  });

  // THE NO-RELOAD PIN, at the machinery rather than at the numbers: the shared
  // ammo state machine is never reached for a belt slot, on either path. The
  // spies watch the REAL module the weapon rows call into, and the fitted gun
  // proves the spies are live.
  it('neither tickReload nor consume is EVER called for a belt slot (spied, through the real tick + gate)', () => {
    const row = consumableRow('hullRepair', () => ({ ok: true }));
    // A REAL stack, backed by REAL cards: since review patch P1 the belt is
    // re-derived from `ship.cards` after every spend, so a hand-planted slot
    // with no card behind it would simply vanish. HULL REPAIR is a live
    // catalog line since Story 8.8, so the production catalog holds two copies
    // as it stands; only the ROW is injected, to keep the effect a spy.
    const w = bareWorld(7, { consumables: buildConsumableRegistry([row]) });
    const ship = place(w, 'a');
    w.applyCard(ship, 'hullRepair');
    w.applyCard(ship, 'hullRepair');
    const belt = ship.loadout[SLOT_BELT];
    expect(belt.state).toEqual({ n: 2, reloadMsLeft: 0 });
    const beltState = belt.state;
    const tickSpy = vi.spyOn(ammo, 'tickReload');
    const consumeSpy = vi.spyOn(ammo, 'consume');
    try {
      ship.loadout[SLOT_GUN].state = { n: 0, reloadMsLeft: CONFIG.gun.reloadMs };
      for (let i = 0; i < 5; i++) w.step();
      expect(w.sinkingActivationGate(ship, SLOT_BELT)).toEqual({ ok: true });
      // The gun's pool DID go through the machine — the spies are live.
      expect(tickSpy.mock.calls.length).toBeGreaterThan(0);
      // ...and the belt's state object never did, on either call.
      for (const call of tickSpy.mock.calls) expect(call[0]).not.toBe(beltState);
      for (const call of consumeSpy.mock.calls) expect(call[0]).not.toBe(beltState);
      expect(belt.state).toEqual({ n: 1, reloadMsLeft: 0 });
    } finally {
      tickSpy.mockRestore();
      consumeSpy.mockRestore();
    }
  });
});

// ---------- 1c. HULL REPAIR, the first live consumable (Story 8.8) ------------

// The paid heal's body, unchanged, under a new trigger: a CARD you stock and
// FIRE instead of an always-available `5` key. What these pins are actually
// about is the two guards and the ONE SPEND LAW around them — a denied press
// must cost nothing, because the copy is the scarce thing now.

describe('HULL REPAIR — the first live consumable line (Story 8.8)', () => {
  const HR = CONFIG.hullRepair;

  /** A captain holding `n` HULL REPAIR copies in the first belt slot, hurt by
   *  `missing` hp. Everything real: production catalog, production registry. */
  function healer(w: World, id = 'a', n = 1, missing = 100): ShipRecord {
    const ship = place(w, id);
    for (let i = 0; i < n; i += 1) w.applyCard(ship, 'hullRepair');
    ship.hp = ship.stats.maxHp - missing;
    return ship;
  }

  const healEvents = (w: World, id: string): unknown[] =>
    (w as unknown as { pending: { k: string; id: string }[] }).pending.filter((e) => e.k === 'heal' && e.id === id);

  it('stocks from a card into the belt, and the production row is what fires', () => {
    const w = bareWorld();
    const ship = healer(w, 'a', 2);
    expect(ship.loadout[SLOT_BELT].equipmentId).toBe('hullRepair');
    expect(ship.loadout[SLOT_BELT].state).toEqual({ n: 2, reloadMsLeft: 0 });
    expect(slotRow('hullRepair')).toBe(hullRepairRow);
  });

  it('a damaged afloat hull: +instantHp now, +regenHp pooled, a `heal` cue, n-1, one copy leaves `cards`', () => {
    const w = bareWorld();
    const ship = healer(w, 'a', 2, 100);
    const before = ship.hp;
    expect(w.sinkingActivationGate(ship, SLOT_BELT)).toEqual({ ok: true });
    expect(ship.hp).toBe(before + HR.instantHp);
    expect(ship.repairHp).toBe(HR.regenHp);
    expect(healEvents(w, 'a')).toHaveLength(1);
    expect(ship.loadout[SLOT_BELT].state).toEqual({ n: 1, reloadMsLeft: 0 });
    expect(ship.cards.filter((c) => c === 'hullRepair')).toHaveLength(1);
  });

  it('the pool pays out at the fixed rate and stacks by DURATION, never by rate', () => {
    const w = bareWorld();
    const ship = healer(w, 'a', 2, 300);
    w.sinkingActivationGate(ship, SLOT_BELT);
    w.sinkingActivationGate(ship, SLOT_BELT);
    expect(ship.repairHp).toBe(HR.regenHp * 2); // pools ADD...
    const hpBefore = ship.hp;
    w.step(DT);
    // ...and the RATE is unchanged: one regenMs' worth of pool per regenMs.
    expect(ship.hp - hpBefore).toBeCloseTo((HR.regenHp / HR.regenMs) * DT, 9);
  });

  it('a FULL hull is refused `blocked` and NOTHING is spent (ONE SPEND LAW)', () => {
    const w = bareWorld();
    const ship = healer(w, 'a', 1, 0);
    expect(ship.hp).toBe(ship.stats.maxHp);
    expect(w.sinkingActivationGate(ship, SLOT_BELT)).toEqual({ ok: false, reason: 'blocked' });
    expect(ship.loadout[SLOT_BELT].state).toEqual({ n: 1, reloadMsLeft: 0 });
    expect(ship.cards.filter((c) => c === 'hullRepair')).toHaveLength(1);
    expect(ship.repairHp).toBe(0);
    expect(healEvents(w, 'a')).toHaveLength(0);
  });

  it('a SINKING hull is refused by the ROW — the gate passes it through (amendment 10)', () => {
    const w = bareWorld();
    const ship = healer(w, 'a', 1, 100);
    ship.hp = 0;
    (w as unknown as { sinkShip(id: string, by?: string): void }).sinkShip('a', undefined);
    expect(isAfloat(ship.lifecycle)).toBe(false);
    ship.hp = ship.stats.maxHp - 100; // directed, so "full hull" is not what refuses it
    expect(w.sinkingActivationGate(ship, SLOT_BELT)).toEqual({ ok: false, reason: 'blocked' });
    expect(ship.loadout[SLOT_BELT].state).toEqual({ n: 1, reloadMsLeft: 0 });
    expect(ship.repairHp).toBe(0);
  });

  it('a FULLY CLOSED zone does not refuse it — heals stay legal in the collapse (FR47)', () => {
    const w = bareWorld();
    const ship = healer(w, 'a', 1, 100);
    // The collapse bites through the damage gate; nothing about it reads a
    // repair, and the row holds no zone term at all.
    const before = ship.hp;
    expect(w.sinkingActivationGate(ship, SLOT_BELT)).toEqual({ ok: true });
    expect(ship.hp).toBe(before + HR.instantHp);
  });

  it('the last copy clears the belt slot, and a press after that answers empty-slot', () => {
    const w = bareWorld();
    const ship = healer(w, 'a', 1, 200);
    expect(w.sinkingActivationGate(ship, SLOT_BELT)).toEqual({ ok: true });
    expect(ship.loadout[SLOT_BELT]).toEqual({ equipmentId: null, state: null });
    expect(ship.cards).not.toContain('hullRepair');
    expect(w.sinkingActivationGate(ship, SLOT_BELT)).toEqual({ ok: false, reason: 'empty-slot' });
  });

  it('it rides the ABILITY channel, never the weapon one', () => {
    expect(hullRepairRow.isWeapon).toBe(false);
    expect(CONSUMABLE_IS_WEAPON.hullRepair).toBe(false);
  });
});

// ---------- 2. denial reasons, derived without effect changes -----------------

describe('denial reasons — derived through the gate without changing effects', () => {
  it('the gun is NEVER out-of-arc (360°): a dead-ahead activation fires and spends the round', () => {
    const w = bareWorld();
    const ship = place(w, 'a');
    setInput(ship, { aim: 0, aimDist: 300, slot: SLOT_GUN }); // dead ahead — the old mounts refused this
    expect(w.sinkingActivationGate(ship, SLOT_GUN)).toEqual({ ok: true });
    expect(ship.loadout[SLOT_GUN].state!.n).toBe(0); // single-shot pool spent
  });

  it('gun empty pool denies no-ammo (the shot cooldown — its ONLY denial)', () => {
    const w = bareWorld();
    const ship = place(w, 'a');
    setInput(ship, { aim: Math.PI / 2, aimDist: 300, slot: SLOT_GUN });
    ship.loadout[SLOT_GUN].state = { n: 0, reloadMsLeft: CONFIG.gun.reloadMs };
    expect(w.sinkingActivationGate(ship, SLOT_GUN)).toEqual({ ok: false, reason: 'no-ammo' });
  });

  it('torpedo out-of-arc denies and keeps the fish', () => {
    const w = bareWorld();
    const ship = placeTb(w, 'a');
    setInput(ship, { aim: Math.PI / 2, slot: SLOT_TORPEDO }); // abeam — outside the bow arc
    const res = w.sinkingActivationGate(ship, SLOT_TORPEDO);
    expect(res).toEqual({ ok: false, reason: 'out-of-arc' });
    expect(ship.loadout[SLOT_TORPEDO].state).toEqual({ n: CONFIG.torpedo.maxAmmo, reloadMsLeft: 0 });
  });

  it('torpedo empty pool denies no-ammo', () => {
    const w = bareWorld();
    const ship = placeTb(w, 'a');
    setInput(ship, { aim: 0, slot: SLOT_TORPEDO }); // over the bow — in arc, but empty
    ship.loadout[SLOT_TORPEDO].state = { n: 0, reloadMsLeft: CONFIG.torpedo.reloadMs };
    expect(w.sinkingActivationGate(ship, SLOT_TORPEDO)).toEqual({
      ok: false,
      reason: 'no-ammo',
    });
  });

  it('mine empty pool denies no-ammo (in-arc, in-range aim — Story 2.8 aimed placement)', () => {
    const w = bareWorld();
    const ship = place(w, 'a');
    // Heading 0 ⇒ the rear placement sector centers on π; aim astern, in range.
    setInput(ship, { aim: Math.PI, aimDist: CONFIG.mine.placeRange / 2, slot: SLOT_MINE });
    ship.loadout[SLOT_MINE].state = { n: 0, reloadMsLeft: CONFIG.mine.reloadMs };
    expect(w.sinkingActivationGate(ship, SLOT_MINE)).toEqual({ ok: false, reason: 'no-ammo' });
  });

  it('mine out-of-arc (bow click) and out-of-RANGE both deny out-of-arc, keeping the drop (Story 2.8)', () => {
    const w = bareWorld();
    const ship = place(w, 'a');
    // Bow click: outside the rear sector entirely.
    setInput(ship, { aim: 0, aimDist: 20, slot: SLOT_MINE });
    expect(w.sinkingActivationGate(ship, SLOT_MINE)).toEqual({ ok: false, reason: 'out-of-arc' });
    // Astern but past placeRange: the rack cannot reach — same aim-denial
    // channel (amendment 45 ruling).
    setInput(ship, { aim: Math.PI, aimDist: CONFIG.mine.placeRange + 1, slot: SLOT_MINE });
    expect(w.sinkingActivationGate(ship, SLOT_MINE)).toEqual({ ok: false, reason: 'out-of-arc' });
    // Nothing consumed either way.
    expect(ship.loadout[SLOT_MINE].state).toEqual({ n: CONFIG.mine.maxAmmo, reloadMsLeft: 0 });
    expect(w.mines.size).toBe(0);
  });

  // The RADAR BUOY's denial matrix (Story 7-5 wave 2, R2.7 — the mine's,
  // shared sector and placeRange): bow click / past placeRange -> out-of-arc
  // (nothing consumed); a good astern click places the buoy and consumes.
  it('the radarBuoy denies out-of-arc on a bow click, keeping the charge; an astern click places it', () => {
    const w = bareWorld();
    const ml = place(w, 'ml');
    fitBuoy(ml); // amendment 22: nothing fits the buoy in play any more
    expect(ml.loadout[SLOT_BUOY].equipmentId).toBe('radarBuoy');
    // Default aim (bow, heading 0): outside the rear sector -> out-of-arc.
    setInput(ml, { aim: 0, aimDist: 60, slot: SLOT_BUOY });
    expect(w.sinkingActivationGate(ml, SLOT_BUOY)).toEqual({ ok: false, reason: 'out-of-arc' });
    // Astern but past the shared placeRange: same aim-denial channel.
    setInput(ml, { aim: Math.PI, aimDist: CONFIG.mine.placeRange + 1, slot: SLOT_BUOY });
    expect(w.sinkingActivationGate(ml, SLOT_BUOY)).toEqual({ ok: false, reason: 'out-of-arc' });
    expect(ml.loadout[SLOT_BUOY].state).toEqual({ n: CONFIG.radarBuoy.maxAmmo, reloadMsLeft: 0 });
    expect(w.buoys.size).toBe(0);
    // A legal astern click: the buoy is placed AT the clicked point and the
    // one charge + reload are consumed.
    setInput(ml, { aim: Math.PI, aimDist: 60, slot: SLOT_BUOY });
    expect(w.sinkingActivationGate(ml, SLOT_BUOY)).toEqual({ ok: true });
    expect(w.buoys.size).toBe(1);
    expect(ml.loadout[SLOT_BUOY].state).toEqual({ n: 0, reloadMsLeft: CONFIG.radarBuoy.reloadMs });
    // Empty pool now: a further click denies no-ammo.
    expect(w.sinkingActivationGate(ml, SLOT_BUOY)).toEqual({ ok: false, reason: 'no-ammo' });
  });
});

// ---------- 2b. mine dispatch channel (Story 2.8: aimed weapon, fire control) --

describe('mine dispatch — the fire (fireSeq) channel, never activation (Story 2.8 flip of the 1.8 pin)', () => {
  it('a fireSeq CLICK astern places a mine at the clicked point; an actSeq press on the slot is inert', () => {
    const w = bareWorld();
    const ship = place(w, 'a'); // ML fit: mine at weapon slot 2; heading 0 => astern = pi
    // CLICK (weapon channel): places at the clicked point.
    w.submitInput('a', { seq: 1, throttle: 0, rudder: 0, aim: Math.PI, fireSeq: 1, aimDist: 50, slot: SLOT_MINE, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0 });
    w.step();
    expect(w.mines.size).toBe(1);
    const [mine] = [...w.mines.values()];
    expect(mine.x).toBeCloseTo(ship.state.x - 50, 0); // AT the click (astern 50u; hull barely moved)
    // PRESS (ability channel) with a reloaded pool: refused by the ability wall
    // — actSeq targets non-weapons only, and the mine is a weapon now.
    // A FULL rack (2-deep at base since the 2026-08-04 balance pass) with an
    // idle timer — so the only thing that could move the pool is the press.
    ship.loadout[SLOT_MINE].state = { n: CONFIG.mine.maxAmmo, reloadMsLeft: 0 };
    w.submitInput('a', { seq: 2, throttle: 0, rudder: 0, aim: Math.PI, fireSeq: 1, aimDist: 50, slot: SLOT_MINE, fireT: 0, actSeq: 1, actSlot: SLOT_MINE, hornSeq: 0 });
    w.step();
    expect(w.mines.size).toBe(1); // no second mine — presses never reach a weapon
    expect(ship.loadout[SLOT_MINE].state).toEqual({ n: 2, reloadMsLeft: 0 }); // charges intact
  });
});

// ---------- 3. empty-slot safety ---------------------------------------------

describe('empty-slot safety — the gate answers before any dereference', () => {
  it('an empty WEAPON slot (4, R) denies empty-slot without crashing', () => {
    const w = bareWorld();
    const ship = placeTb(w, 'a'); // TB seed fills only slot 2, so 3 and 4 are empty
    expect(ship.loadout[SLOT_EMPTY_WEAPON]).toEqual({ equipmentId: null, state: null });
    expect(w.sinkingActivationGate(ship, SLOT_EMPTY_WEAPON)).toEqual({
      ok: false,
      reason: 'empty-slot',
    });
  });

  it('an empty BELT slot (5) denies empty-slot without crashing (the rack is Story 8.7)', () => {
    const w = bareWorld();
    const ship = place(w, 'a');
    expect(ship.loadout[SLOT_BELT]).toEqual({ equipmentId: null, state: null });
    expect(w.sinkingActivationGate(ship, SLOT_BELT)).toEqual({
      ok: false,
      reason: 'empty-slot',
    });
  });

  it('the index one past the last slot (9) denies empty-slot without crashing', () => {
    const w = bareWorld();
    const ship = place(w, 'a');
    expect(w.sinkingActivationGate(ship, SLOT_COUNT)).toEqual({ ok: false, reason: 'empty-slot' });
  });

  it('an out-of-range slot index denies empty-slot without crashing', () => {
    const w = bareWorld();
    const ship = place(w, 'a');
    expect(w.sinkingActivationGate(ship, 99)).toEqual({ ok: false, reason: 'empty-slot' });
  });

  it('a dead ship is refused first (dead), before any slot resolution', () => {
    const w = bareWorld();
    const ship = place(w, 'a');
    setInput(ship, { aim: Math.PI / 2, aimDist: 300, slot: SLOT_GUN }); // would fire if alive
    w.respawnEnabled = false;
    w.sinkShip('a');
    // Story 5.2 (amendment 10): a SINKING hull still fires — only a foundered
    // one is refused. Cross the window before asserting.
    w.step(CONFIG.ship.sinkingWindowMs);
    expect(isAfloat(ship.lifecycle)).toBe(false);
    expect(w.sinkingActivationGate(ship, SLOT_GUN)).toEqual({ ok: false, reason: 'dead' });
  });
});

// ---------- 4. FR5: deselected slots still reload every tick -------------------

describe('FR5 — a deselected slot still reloads every tick', () => {
  it('with the gun selected, the reloading MINE and BUOY slots both advance', () => {
    const w = bareWorld();
    const ship = place(w, 'a');
    fitBuoy(ship); // amendment 22 — hand-fitted; the tick behaviour it pins is unchanged
    setInput(ship, { slot: SLOT_GUN }); // gun slot named; fireSeq 0 => no activation
    ship.loadout[SLOT_MINE].state = { n: 0, reloadMsLeft: CONFIG.mine.reloadMs };
    ship.loadout[SLOT_BUOY].state = { n: 0, reloadMsLeft: CONFIG.radarBuoy.reloadMs };
    w.step();
    expect(ship.loadout[SLOT_MINE].state!.reloadMsLeft).toBe(CONFIG.mine.reloadMs - DT);
    expect(ship.loadout[SLOT_BUOY].state!.reloadMsLeft).toBe(CONFIG.radarBuoy.reloadMs - DT);
  });

  it('the same holds on the OTHER hull: a reloading TORPEDO advances under the gun', () => {
    const w = bareWorld();
    const ship = placeTb(w, 'a');
    setInput(ship, { slot: SLOT_GUN });
    ship.loadout[SLOT_TORPEDO].state = { n: 0, reloadMsLeft: CONFIG.torpedo.reloadMs };
    w.step();
    expect(ship.loadout[SLOT_TORPEDO].state!.reloadMsLeft).toBe(CONFIG.torpedo.reloadMs - DT);
  });
});

// ---------- 4b. the empty slots are never ticked ------------------------------

describe('the empty slots are never ticked', () => {
  it('behavioral: a ship steps many ticks with SIX empty slots, world stays healthy while the fitted ones reload', () => {
    const w = bareWorld();
    const ship = place(w, 'a');
    fitBuoy(ship); // a fourth fitted slot, so the loop has more than the seed to do
    setInput(ship, { slot: SLOT_GUN }); // no click (fireSeq 0)
    // Drain the fitted slots so their reload timers must tick down.
    ship.loadout[SLOT_GUN].state = { n: 0, reloadMsLeft: CONFIG.gun.reloadMs };
    ship.loadout[SLOT_MINE].state = { n: 0, reloadMsLeft: CONFIG.mine.reloadMs };
    ship.loadout[SLOT_BUOY].state = { n: 0, reloadMsLeft: CONFIG.radarBuoy.reloadMs };
    const N = 5;
    expect(() => {
      for (let i = 0; i < N; i++) w.step();
    }).not.toThrow();
    // EVERY empty slot untouched — no state materialized, nothing to tick.
    for (const i of [SLOT_EMPTY_WEAPON, ...CONSUMABLE_SLOTS]) {
      expect(ship.loadout[i]).toEqual({ equipmentId: null, state: null });
    }
    // The fitted slots DID reload-tick (proves the loop ran, and skips only 3).
    expect(ship.loadout[SLOT_GUN].state!.reloadMsLeft).toBe(CONFIG.gun.reloadMs - N * DT);
    expect(ship.loadout[SLOT_MINE].state!.reloadMsLeft).toBe(CONFIG.mine.reloadMs - N * DT);
    expect(ship.loadout[SLOT_BUOY].state!.reloadMsLeft).toBe(CONFIG.radarBuoy.reloadMs - N * DT);
  });

  it("source: fireControl's per-slot tick loop dispatches through slotRow (which answers undefined for an empty slot)", () => {
    const gameDir = resolve(dirname(fileURLToPath(import.meta.url)), '../game');
    const src = readFileSync(resolve(gameDir, 'world.ts'), 'utf8');
    const fire = src.indexOf('private fireControl(');
    expect(fire).toBeGreaterThan(-1);
    const loopBody = src.slice(fire, src.indexOf('sinkingActivationGate(ship', fire));
    // The tick dispatch runs only for fitted slots — the `equipmentId !== null`
    // guard MOVED INTO `slotRow` in Story 8.7 (it answers undefined for a null
    // id), which is why the `?.` is now the whole guard. `?.` since Story 8.1:
    // both registries are PARTIAL over their id space, so an id with no built
    // row ticks nothing — and a BELT slot's consumable row ticks nothing ever.
    expect(/slotRow\(slot\.equipmentId, this\.consumables\)\?\.tick\(/.test(loopBody)).toBe(true);
    expect(/EQUIPMENT\[slot\.equipmentId\]/.test(loopBody)).toBe(false);
  });
});

// ---------- 5. the gate is the sole dispatch path -----------------------------

describe('the sinking-activation gate is the sole dispatch path to activate()', () => {
  const gameDir = resolve(dirname(fileURLToPath(import.meta.url)), '../game');

  function gameSourceFiles(): string[] {
    return readdirSync(gameDir, { recursive: true })
      .filter((f): f is string => typeof f === 'string' && f.endsWith('.ts'))
      .map((f) => join(gameDir, f));
  }

  /** Line comments, block-comment bodies, and JSDoc lines are not real code. */
  function isCommentLine(line: string): boolean {
    const t = line.trim();
    return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
  }

  /** The source line containing byte offset `at`. */
  function lineAt(src: string, at: number): string {
    const start = src.lastIndexOf('\n', at - 1) + 1;
    const end = src.indexOf('\n', at);
    return src.slice(start, end === -1 ? undefined : end);
  }

  /**
   * Every REAL `activate(` call across game sources, excluding: (i) the
   * Equipment interface method declaration (no `.` receiver), (ii) match.ts's
   * unrelated `this.activate()` phase transition, and (iii) comment lines.
   * Returns each survivor as { file, index } (index = byte offset in file).
   */
  function realActivateCalls(): { file: string; index: number }[] {
    const hits: { file: string; index: number }[] = [];
    for (const file of gameSourceFiles()) {
      const src = readFileSync(file, 'utf8');
      const re = /\bactivate\(/g;
      for (let m = re.exec(src); m !== null; m = re.exec(src)) {
        const line = lineAt(src, m.index);
        if (isCommentLine(line)) continue; // (iii)
        if (src[m.index - 1] !== '.') continue; // (i) interface decl: no `.` receiver
        if (/\bthis\.activate\(/.test(line)) continue; // (ii) match.ts phase transition
        hits.push({ file, index: m.index });
      }
    }
    return hits;
  }

  /**
   * Byte bounds [start,end] of the method `name`'s body in `src`, found by
   * locating the definition (the occurrence NOT preceded by `.`, i.e. not a
   * call site) and brace-matching from its opening `{` — never by assuming
   * which method lexically follows it.
   */
  function methodBodyBounds(src: string, name: string): { start: number; end: number } {
    const needle = name + '(';
    let defAt = -1;
    for (let at = src.indexOf(needle); at !== -1; at = src.indexOf(needle, at + needle.length)) {
      if (src[at - 1] !== '.') { defAt = at; break; } // a def, not `this.<name>(`
    }
    expect(defAt).toBeGreaterThan(-1);
    let depth = 0;
    let start = -1;
    for (let i = defAt; i < src.length; i++) {
      if (src[i] === '{') { if (depth === 0) start = i; depth++; }
      else if (src[i] === '}' && --depth === 0) return { start, end: i };
    }
    throw new Error('unbalanced braces');
  }

  it('exactly one real activate() call survives across all game sources', () => {
    const hits = realActivateCalls();
    expect(hits).toHaveLength(1);
    expect(hits[0].file.endsWith('world.ts')).toBe(true);
  });

  it('that single dispatch sits inside World.sinkingActivationGate (brace-matched body)', () => {
    const worldPath = resolve(gameDir, 'world.ts');
    const src = readFileSync(worldPath, 'utf8');
    const body = methodBodyBounds(src, 'sinkingActivationGate');
    const hit = realActivateCalls().find((h) => h.file === worldPath);
    expect(hit).toBeDefined();
    expect(hit!.index).toBeGreaterThan(body.start);
    expect(hit!.index).toBeLessThan(body.end);
  });
});

// ---------- 6. loadout init / respawn / redeploy parity -----------------------

describe('loadout init parity — addShip / respawn / redeploy', () => {
  it('addShip produces a full idle loadout matching equipmentMaxAmmo, the rest of the nine empty', () => {
    const w = bareWorld();
    expectFreshLoadout(place(w, 'a'), ML_IDS);
    expectFreshLoadout(placeTb(w, 'tb'), TB_IDS);
  });

  // THE SHAPE IS UNIVERSAL (Story 8.5): slots 0 and 1 hold the SAME equipment
  // on every captain hull, and only the seeded weapon row differs.
  it('every captain hull spawns the same shape: gun in 0, boost in 1, seed in the weapon row', () => {
    const w = bareWorld();
    const hulls = [
      ['torpedoBoat', ['heavyTorpedo']],
      ['battleship', ['broadside', 'starShells']],
      ['mineLayer', ['navalMines']],
    ] as const;
    for (const [hull, seed] of hulls) {
      const ship = w.addShip(hull, hull, 'captain', hull, undefined, undefined, []);
      expect(ship.loadout).toHaveLength(SLOT_COUNT);
      expect(ship.loadout[SLOT_GUN].equipmentId).toBe('gun');
      expect(ship.loadout[SLOT_BOOST].equipmentId).toBe('speedBoost');
      expect(WEAPON_SLOTS.map((i) => ship.loadout[i].equipmentId)).toEqual([
        ...seed,
        ...Array<null>(WEAPON_SLOTS.length - seed.length).fill(null),
      ]);
      for (const i of CONSUMABLE_SLOTS) expect(ship.loadout[i]).toEqual({ equipmentId: null, state: null });
      expect(ship.cards).toEqual([...seed]); // the seed rides as CARDS, so the deck owes their copy 1
      expect(slotAmmo(ship)).toHaveLength(SLOT_COUNT);
    }
  });

  it('a FLEET hull spawns gun-only: eight empties, no boost (amendment 24)', () => {
    const w = bareWorld();
    const d = w.addShip('d', 'D', 'fleet', 'droneSmall', undefined, undefined, []);
    expect(d.loadout).toHaveLength(SLOT_COUNT);
    expect(d.loadout[SLOT_GUN].equipmentId).toBe('gun');
    for (let i = 1; i < SLOT_COUNT; i++) {
      expect(d.loadout[i]).toEqual({ equipmentId: null, state: null });
    }
    expect(d.cards).toEqual([]);
  });

  it('respawn (waiting-phase) rebuilds the full loadout from stats', () => {
    const w = bareWorld();
    const ship = place(w, 'a');
    ship.loadout[SLOT_GUN].state = { n: 0, reloadMsLeft: 999 }; // dirty it, prove the rebuild
    w.sinkShip('a');
    // Story 5.2: the revive lands on the founder tick (window > respawn delay).
    const steps = Math.ceil(CONFIG.ship.sinkingWindowMs / DT) + 2;
    for (let i = 0; i < steps; i++) w.step();
    expect(isAfloat(ship.lifecycle)).toBe(true);
    expectFreshLoadout(ship, ML_IDS);
  });

  it('redeploy (resetForMatchStart) rebuilds the full loadout from stats', () => {
    const w = bareWorld();
    const ship = place(w, 'a');
    ship.loadout[SLOT_MINE].state = { n: 0, reloadMsLeft: 500 }; // dirty it, prove the rebuild
    fitBuoy(ship); // a hand-fitted slot the rebuild must clear — the seed is the only source
    w.resetForMatchStart();
    expectFreshLoadout(ship, ML_IDS);
  });

  it('a FLEET hull keeps its gun-only fit through a redeploy (the fleet flag is load-bearing)', () => {
    const w = bareWorld();
    const d = w.addShip('d', 'D', 'fleet', 'droneSmall', undefined, undefined, []);
    w.resetForMatchStart();
    expect(d.loadout[SLOT_BOOST]).toEqual({ equipmentId: null, state: null }); // no boost grown
    for (let i = 1; i < SLOT_COUNT; i++) expect(d.loadout[i].equipmentId).toBeNull();
  });
});

describe('slotAmmo — slot-aligned fresh wire copies, not live pool references', () => {
  it('returns SLOT_COUNT entries: fresh {n, reloadMsLeft} per fitted slot, null for empty', () => {
    const w = bareWorld();
    const ship = place(w, 'a');
    const wire = slotAmmo(ship);
    expect(wire).toHaveLength(SLOT_COUNT); // slot-aligned: one entry per loadout slot (NINE)
    for (let i = 0; i < ML_IDS.length; i++) {
      expect(wire[i]).not.toBe(ship.loadout[i].state); // a fresh copy, not the live pool object
      expect(Object.keys(wire[i]!)).toEqual(['n', 'reloadMsLeft']); // key order pinned for the wire
      expect(wire[i]).toEqual(ship.loadout[i].state); // same values
    }
    // Every empty slot => null (never a zero pool).
    for (let i = ML_IDS.length; i < SLOT_COUNT; i++) expect(wire[i]).toBeNull();
  });
});
