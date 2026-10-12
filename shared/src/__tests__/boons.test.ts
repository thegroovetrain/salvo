// THE CARD FOLD ENGINE (sim/effects.ts + sim/boons.ts) — the "two homes +
// hooks" law under catalog v3. The CONTENT pins (29 lines, caps, kinds, the
// stub set, the validator, order-independence) live in catalog.test.ts; this
// suite is about the ENGINE:
//   - the five-effect vocabulary, and that `slotReplace` is gone;
//   - home 1: `stat` effects reach EffectiveStats and nothing else, through a
//     GENERATED whitelist whose deliberate absences are pinned;
//   - home 2: `slotFill` mutates the one LoadoutSlot[] and nothing else —
//     since Story 8.5 it takes the FIRST EMPTY WEAPON SLOT (2, then 3, then 4)
//     and leaves every other slot's state object REFERENCE-IDENTICAL;
//   - `doctrine` verbs, `behavior` hooks, and `stock` — which since Story 8.7
//     fills a consumable slot, the kind's OWN fixed slot since Story 9.2 (its
//     own section near the foot of this file);
//   - the parity property: the server's INCREMENTAL slot path and the client's
//     REPLAYED `slotsWithCards` agree after any sequence of grants.

import { describe, it, expect } from 'vitest';
import {
  BOON_STAT_PATHS,
  CATALOG,
  CONFIG,
  CONSUMABLE_IDS,
  CONSUMABLE_KEY_ORDER,
  CONSUMABLE_SLOTS,
  DOCTRINE_MODES,
  EQUIPMENT_INT_FIELDS,
  EQUIPMENT_STAT_FIELDS,
  EQUIPMENT_IDS,
  LINE_IDS,
  NO_CARDS,
  SLOT_BOOST,
  SLOT_GUN,
  WEAPON_SLOTS,
  applyCardStats,
  applySlotEffect,
  boonStackCount,
  pickRefusal,
  cardBehaviors,
  cardCounts,
  consumableSlotFor,
  effectiveStats,
  equipmentMaxAmmo,
  loadoutFor,
  mulberry32,
  slotsWithCards,
  stockSlotFor,
  validateLine,
  type BoonEffect,
  type Catalog,
  type CatalogLine,
  type ConsumableId,
  type EffectiveStats,
  type LineId,
  type LoadoutSlot,
  type ShipClassId,
  type SlotItemId,
} from '../index.js';

const TB = CONFIG.shipClasses.torpedoBoat;
const BS = CONFIG.shipClasses.battleship;

/** A one-copy test line carrying `effects` (never in the production catalog). */
const line = (id: string, ...effects: BoonEffect[]): CatalogLine => ({
  id: id as LineId,
  kind: 'ladder',
  cap: 1,
  tiers: [effects],
});

/** Assemble an injectable catalog from test lines (insertion order kept). */
function catalogOf(...lines: CatalogLine[]): Catalog {
  const out: Record<string, CatalogLine> = {};
  for (const l of lines) out[l.id] = l;
  return out;
}

/** Fold one test line over a class. */
const foldOne = (cls: typeof TB, l: CatalogLine): EffectiveStats =>
  effectiveStats(cls, [l.id], catalogOf(l));

/** Flatten an EffectiveStats tree into dotted-path -> scalar entries (booleans
 *  are leaves — the doctrine verbs live there). */
function flatten(stats: EffectiveStats): Map<string, number | string | boolean> {
  const out = new Map<string, number | string | boolean>();
  const walk = (node: Record<string, unknown>, prefix: string): void => {
    for (const [key, value] of Object.entries(node)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') out.set(path, value);
      else walk(value as Record<string, unknown>, path);
    }
  };
  walk(stats as unknown as Record<string, unknown>, '');
  return out;
}

const diff = (a: EffectiveStats, b: EffectiveStats): string[] => {
  const before = flatten(a);
  const after = flatten(b);
  return [...after.keys()].filter((k) => after.get(k) !== before.get(k)).sort();
};

// ---------------------------------------------------------------------------
// THE GENERATED WHITELIST (sim/effects.ts).
// ---------------------------------------------------------------------------

describe('BOON_STAT_PATHS — GENERATED from EQUIPMENT_STAT_FIELDS (Story 8.1)', () => {
  it('is exactly the top-level paths plus every equipment.<id>.<field>', () => {
    const expected: string[] = [
      'maxHp', 'radarRange', 'sweepRpm', 'cooldownScale',
      'kinematics.maxSpeed', 'kinematics.reverseSpeed', 'kinematics.accel',
      'kinematics.decel', 'kinematics.turnRate', 'kinematics.steerageSpeed',
    ];
    for (const id of EQUIPMENT_IDS) {
      for (const f of EQUIPMENT_STAT_FIELDS[id] as readonly string[]) expected.push(`equipment.${id}.${f}`);
    }
    expect([...BOON_STAT_PATHS]).toEqual(expected);
    expect(new Set(BOON_STAT_PATHS).size).toBe(BOON_STAT_PATHS.length); // no duplicates
  });

  it('covers EVERY EquipmentId (the generator is total, so a new id cannot be missed)', () => {
    expect(Object.keys(EQUIPMENT_STAT_FIELDS).sort()).toEqual([...EQUIPMENT_IDS].sort());
  });

  // THE DELIBERATE ABSENCES. Each is DERIVED post-fold, so a card addressing it
  // would be a second derivation — the whole reason the whitelist exists.
  it('pins the derived paths ABSENT: sightRange, sweepPeriodMs, every rangeU, the broadside arcs, every triggerRadius, every tier', () => {
    const absent = [
      'sightRange',
      'sweepPeriodMs',
      'equipment.gun.rangeU',
      'equipment.starShells.rangeU',
      'equipment.broadside.rangeU',
      'equipment.broadside.traverseRad',
      'equipment.broadside.mountSpreadRad',
      'equipment.navalMines.triggerRadius',
      'equipment.captiveMines.triggerRadius',
      'equipment.foulingMines.triggerRadius',
      // THE CAPTIVE'S BURST IS FIXED (epic-8 amendment 84d): its tier steps
      // the TRIP RING, never the 32 u bang, so there is no blast path either.
      'equipment.captiveMines.blastRadius',
      // THE FLAK BLAST AND BODYBLOCK ARE FIXED (amendment 105, Story 8.15
      // review): no ladder grows the 50 u blast, and the 4 hp bodyblock is a
      // CONFIG constant — the whitelist is the authoring gate, so neither is
      // addressable (the captive's fixed-burst precedent above).
      'equipment.flak.burstRadius',
      'equipment.flak.contactDamage',
      // ...and `supercavTorpedo` has no paths AT ALL: it became a CONSUMABLE
      // (amendment 74), and a consumable has no stat row to address.
      'equipment.supercavTorpedo.damage',
      'equipment.supercavTorpedo.speed',
      'equipment.supercavTorpedo.reloadMs',
      'equipment.supercavTorpedo.maxAmmo',
    ];
    for (const path of absent) expect(BOON_STAT_PATHS, path).not.toContain(path);
    // `tier` is derived from the COPY COUNT, never from an effect: a card that
    // could write it would break the reload step's arithmetic.
    for (const id of EQUIPMENT_IDS) expect(BOON_STAT_PATHS, id).not.toContain(`equipment.${id}.tier`);
    // ...and no doctrine verb is addressable as a stat.
    for (const [weapon, verbs] of Object.entries(DOCTRINE_MODES)) {
      for (const v of verbs as readonly string[]) expect(BOON_STAT_PATHS).not.toContain(`equipment.${weapon}.${v}`);
    }
  });

  it('keeps the WHITELISTED-BUT-UNWRITTEN paths (a stat with no card is still addressable in principle)', () => {
    const written = new Set<string>();
    for (const id of LINE_IDS) {
      for (const tier of CATALOG[id].tiers) {
        for (const e of tier) if (e.kind === 'stat') written.add(e.path);
      }
    }
    // The universal ladders + the deck gun (Story 8.1), the five torpedo /
    // mine ladders (Story 8.13), the machine gun / flak ladders (Story 8.15)
    // and the STAR SHELLS / BROADSIDE / PHOSPHOR SHELLS ladders (Story 8.17,
    // Eric 2026-09-29, amendments 130/131/133).
    expect([...written].sort()).toEqual([
      'cooldownScale', 'equipment.gun.barrels', 'equipment.gun.damage', 'equipment.gun.maxAmmo',
      'kinematics.maxSpeed', 'kinematics.turnRate', 'maxHp', 'sweepRpm',
      'equipment.lightTorpedo.damage', 'equipment.lightTorpedo.speed',
      'equipment.lightTorpedo.maxAmmo', 'equipment.lightTorpedo.homingTurnRate',
      'equipment.heavyTorpedo.damage', 'equipment.heavyTorpedo.speed',
      'equipment.heavyTorpedo.maxAmmo', 'equipment.heavyTorpedo.homingTurnRate',
      'equipment.navalMines.damage', 'equipment.navalMines.blastRadius', 'equipment.navalMines.maxAmmo',
      'equipment.captiveMines.damage', 'equipment.captiveMines.maxAmmo',
      'equipment.captiveMines.homingTurnRate',
      'equipment.foulingMines.blastRadius', 'equipment.foulingMines.maxAmmo',
      'equipment.foulingMines.slowFactor',
      'equipment.machineGun.maxAmmo', 'equipment.machineGun.damage', 'equipment.machineGun.rateMs',
      'equipment.flak.damage', 'equipment.flak.maxAmmo',
      'equipment.starShells.litDurationMs', 'equipment.starShells.litRadius',
      'equipment.starShells.maxAmmo', 'equipment.starShells.damage',
      'equipment.broadside.spreadRung', 'equipment.broadside.turrets',
      'equipment.phosphorShells.damage', 'equipment.phosphorShells.dps',
      'equipment.phosphorShells.zoneRadius', 'equipment.phosphorShells.zoneDurationMs',
    ].sort());
    // Still addressable in principle, still written by nothing: the FOULING
    // mine's damage is fixed at 10 by ruling (amendment 81), the BROADSIDE's
    // at 15 (amendment 133), and radarRange has no card at all.
    for (const path of [
      'radarRange', 'equipment.foulingMines.damage', 'equipment.broadside.damage',
    ]) {
      expect(BOON_STAT_PATHS, path).toContain(path);
      expect(written.has(path), path).toBe(false);
    }
  });

  it('EQUIPMENT_INT_FIELDS names the integer stats the clamp floors once', () => {
    // `maxLive` LEFT this list with the mine caps themselves (Story 8.4,
    // FR57/AR48); `damage` and `contactDamage` JOINED it on 2026-09-17 (epic-8
    // amendment 39 — a shell never deals a fractional hit point). The pin is
    // updated, not deleted.
    expect([...EQUIPMENT_INT_FIELDS]).toEqual(['maxAmmo', 'barrels', 'turrets', 'damage', 'contactDamage']);
  });

  it('DOCTRINE_MODES is keyed by EquipmentId and carries only verbs a v3 add-on grants — NONE since 8.17', () => {
    // CUT FROM FIVE ENTRIES TO TWO in Story 8.13 (Eric rulings 2026-09-19,
    // epic-8 amendments 80/81): the CARDS that granted `homing` on the two
    // torpedoes and `propFouling` on the naval mine are deleted, so the verbs
    // went with them. Homing is a NUMERIC tier stat now; fouling is its own
    // equipment line. CUT TO ONE in Story 8.15: the missile's `homing` went
    // with HEAT SEEKING and the missile itself (amendment 89e). EMPTIED in
    // Story 8.17 (Eric 2026-09-29, amendments 131–134): PHOSPHOR SHELLS is its
    // own weapon and DAZZLE the FLASH SHELLS consumable, so the star shell's
    // verbs are gone. The table stays, empty (the machinery is kept).
    expect(DOCTRINE_MODES).toEqual({});
    expect('starShells' in DOCTRINE_MODES).toBe(false);
    for (const weapon of Object.keys(DOCTRINE_MODES)) expect(EQUIPMENT_IDS).toContain(weapon);
    // The radar buoy's gun/jamming verbs left with the buoy (catalog-v3 R1) and
    // `captive` left because CAPTIVE MINES became its own equipment line (R25).
    expect('radarBuoy' in DOCTRINE_MODES).toBe(false);
    expect('navalMines' in DOCTRINE_MODES).toBe(false);
    expect('lightTorpedo' in DOCTRINE_MODES).toBe(false);
    expect('heavyTorpedo' in DOCTRINE_MODES).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Home 1: stat effects.
// ---------------------------------------------------------------------------

describe('stat effects — home 1 (effectiveStats), fail-closed folds', () => {
  it('a mult stat card moves EXACTLY its targeted path (flatten diff), nothing else', () => {
    const l = line('t', { kind: 'stat', path: 'kinematics.maxSpeed', mult: 1.1 });
    const s = foldOne(TB, l);
    expect(diff(effectiveStats(TB), s)).toEqual(['kinematics.maxSpeed']);
    expect(s.kinematics.maxSpeed).toBeCloseTo(TB.kinematics.maxSpeed * 1.1, 9);
  });

  it('a THREE-SEGMENT equipment path resolves (the 8.1 walk), and only that row moves', () => {
    const l = line('t', { kind: 'stat', path: 'equipment.heavyTorpedo.speed', add: 5 });
    const s = foldOne(TB, l);
    expect(diff(effectiveStats(TB), s)).toEqual(['equipment.heavyTorpedo.speed']);
    expect(s.equipment.heavyTorpedo.speed).toBe(CONFIG.torpedo.speed + 5);
    // The sibling row is untouched — its own CONFIG block since Story 8.13.
    expect(s.equipment.lightTorpedo.speed).toBe(CONFIG.lightTorpedo.speed);
  });

  it('a sweepRpm card re-derives sweepPeriodMs, and the CEILING is re-applied over the fold', () => {
    const s = foldOne(TB, line('r', { kind: 'stat', path: 'sweepRpm', add: 5 }));
    expect(s.sweepRpm).toBe(CONFIG.vision.sweepRpm + 5);
    expect(s.sweepPeriodMs).toBeCloseTo(60000 / s.sweepRpm, 9);
    const over = foldOne(TB, line('o', { kind: 'stat', path: 'sweepRpm', add: 1000 }));
    expect(over.sweepRpm).toBe(CONFIG.vision.sweepRpmMax);
    expect(over.sweepPeriodMs).toBe(60000 / CONFIG.vision.sweepRpmMax);
  });

  it('an off-whitelist or malformed path is a fail-closed no-op (runtime guard)', () => {
    for (const path of ['nope.nothere', 'sightRange', 'equipment.gun.rangeU', 'equipment.nope.damage', 'equipment.gun']) {
      const l = line('rogue', { kind: 'stat', path: path as never, mult: 99 });
      expect(foldOne(TB, l), path).toEqual(effectiveStats(TB));
    }
  });

  it('a folded value that is not a POSITIVE finite number is skipped per-assignment', () => {
    const base = effectiveStats(TB);
    const cases: BoonEffect[] = [
      { kind: 'stat', path: 'maxHp', mult: 0 },
      { kind: 'stat', path: 'maxHp', add: NaN },
      { kind: 'stat', path: 'maxHp', mult: NaN },
      { kind: 'stat', path: 'maxHp', add: Infinity },
      { kind: 'stat', path: 'maxHp', mult: Infinity },
      { kind: 'stat', path: 'maxHp', add: -(TB.hp + 1) },
    ];
    for (const e of cases) expect(foldOne(TB, line('bad', e))).toEqual(base);
    // Per-assignment: a valid effect after an invalid one still applies.
    const mixed = line('mixed', { kind: 'stat', path: 'maxHp', mult: NaN }, { kind: 'stat', path: 'maxHp', add: 25 });
    expect(foldOne(TB, mixed).maxHp).toBe(TB.hp + 25);
  });

  it('applyCardStats mutates the tree IN PLACE and touches only the targeted scalar', () => {
    const stats = effectiveStats(TB);
    const before = flatten(stats);
    const cat = catalogOf(line('hp', { kind: 'stat', path: 'maxHp', add: 25 }));
    applyCardStats(stats, ['hp'], cat);
    const after = flatten(stats);
    expect([...after.keys()].filter((k) => after.get(k) !== before.get(k))).toEqual(['maxHp']);
    expect(stats.maxHp).toBe(TB.hp + 25);
  });

  it('`stock` is a TOTAL no-op in the fold (Story 8.7 owns the rack)', () => {
    const l: CatalogLine = {
      id: 'hullRepair', kind: 'consumable', cap: 5,
      tiers: new Array(5).fill([{ kind: 'stock', equipmentId: 'hullRepair' }]),
    };
    expect(effectiveStats(TB, new Array<LineId>(5).fill('hullRepair'), catalogOf(l))).toEqual(effectiveStats(TB));
  });
});

// ---------------------------------------------------------------------------
// Counting helpers.
// ---------------------------------------------------------------------------

describe('cardCounts / boonStackCount — the copy-count spine', () => {
  it('counts occurrences, caps at the line cap, drops junk, and keeps CATALOG order', () => {
    const counts = cardCounts(['reload', 'armor', 'reload', 'nope', 'constructor', 'armor', 'armor']);
    expect([...counts]).toEqual([['armor', 3], ['reload', 2]]); // catalog order: armor before reload
    expect(cardCounts(new Array<string>(9).fill('reload')).get('reload')).toBe(5); // capped
    expect([...cardCounts([])]).toEqual([]);
  });

  it('boonStackCount counts occurrences of one id', () => {
    expect(boonStackCount(['armor', 'speed', 'armor'], 'armor')).toBe(2);
    expect(boonStackCount([], 'armor')).toBe(0);
  });

  it('NO_CARDS is the frozen shared zero-card identity', () => {
    expect(NO_CARDS).toEqual([]);
    expect(Object.isFrozen(NO_CARDS)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Home 2: slot effects.
// ---------------------------------------------------------------------------

describe('slot effects — home 2 (applySlotEffect over the one LoadoutSlot[])', () => {
  const stats = effectiveStats(TB);
  const fill = (equipmentId: 'heavyTorpedo' | 'navalMines' | 'starShells' | 'broadside'): BoonEffect =>
    ({ kind: 'slotFill', equipmentId });
  const [W0, W1, W2] = WEAPON_SLOTS;

  it('slotFill fills the FIRST EMPTY WEAPON SLOT — 2, then 3, then 4, in fit order', () => {
    // WAS: the single SLOT_EXTRA (3). The weapon row is three wide now, so the
    // second and third equipment cards stop being no-ops (deferred-work :1988).
    const loadout = loadoutFor(stats);
    expect(loadout[W0].equipmentId).toBeNull();
    applySlotEffect(loadout, fill('heavyTorpedo'), stats);
    expect(loadout[W0].equipmentId).toBe('heavyTorpedo');
    expect(loadout[W0].state).toEqual({ n: equipmentMaxAmmo(stats, 'heavyTorpedo'), reloadMsLeft: 0 });
    applySlotEffect(loadout, fill('navalMines'), stats);
    expect(loadout[W1].equipmentId).toBe('navalMines');
    applySlotEffect(loadout, fill('starShells'), stats);
    expect(loadout[W2].equipmentId).toBe('starShells');
    expect(loadout.map((s) => s.equipmentId)).toEqual([
      'gun', 'boost', 'heavyTorpedo', 'navalMines', 'starShells', ...CONSUMABLE_SLOTS.map(() => null),
    ]);
  });

  it('A FILL TOUCHES ITS TARGET SLOT AND NOTHING ELSE — every other state object is REFERENCE-IDENTICAL', () => {
    // THE identity pin: "fitting a weapon never touches another slot's timer"
    // is a statement about object identity, not about equal numbers. Live
    // timers make it bite — an implementation that rebuilds the array (or
    // re-freshens a pool) fails here while a toEqual would pass.
    const loadout = loadoutFor(stats);
    applySlotEffect(loadout, fill('heavyTorpedo'), stats);
    loadout[SLOT_GUN].state!.reloadMsLeft = 321;
    loadout[SLOT_BOOST].state!.n = 0;
    loadout[W0].state!.reloadMsLeft = 4242;
    const slotRefs = [...loadout];
    const stateRefs = loadout.map((s) => s.state);
    applySlotEffect(loadout, fill('navalMines'), stats);
    loadout.forEach((slot, i) => {
      expect(slot, `slot ${i}`).toBe(slotRefs[i]); // the ARRAY is mutated in place
      if (i !== W1) expect(slot.state, `slot ${i} state`).toBe(stateRefs[i]);
    });
    expect(loadout[SLOT_GUN].state).toEqual({ n: 1, reloadMsLeft: 321 });
    expect(loadout[SLOT_BOOST].state!.n).toBe(0);
    expect(loadout[W0].state).toEqual({ n: equipmentMaxAmmo(stats, 'heavyTorpedo'), reloadMsLeft: 4242 });
  });

  it('a FULL weapon row is a silent no-op — the loadout is untouched, nothing spills into the consumable slots', () => {
    const loadout = loadoutFor(stats);
    for (const e of [fill('heavyTorpedo'), fill('navalMines'), fill('starShells')]) {
      applySlotEffect(loadout, e, stats);
    }
    const before = loadout.map((s) => s.equipmentId);
    const stateRefs = loadout.map((s) => s.state);
    applySlotEffect(loadout, fill('broadside'), stats);
    expect(loadout.map((s) => s.equipmentId)).toEqual(before);
    loadout.forEach((s, i) => expect(s.state, `slot ${i}`).toBe(stateRefs[i]));
  });

  it('slotFill of equipment ALREADY fitted is a no-op (the duplicate guard, over ANY slot)', () => {
    const loadout = loadoutFor(stats);
    applySlotEffect(loadout, fill('heavyTorpedo'), stats);
    const stateRef = loadout[W0].state;
    loadout[W0].state!.n = 1;
    applySlotEffect(loadout, fill('heavyTorpedo'), stats);
    expect(loadout[W0].state).toBe(stateRef);
    expect(loadout[W0].state).toEqual({ n: 1, reloadMsLeft: 0 }); // never re-freshened
    expect(loadout[W1].equipmentId).toBeNull(); // and it did NOT land in the next slot
    // An UNfitted id still fills normally (the guard is duplicate-only).
    applySlotEffect(loadout, fill('navalMines'), stats);
    expect(loadout[W1].equipmentId).toBe('navalMines');
  });

  it('stat, behavior and doctrine effects are structural no-ops in the slot home (and a STUB stock with them)', () => {
    // `stock` moved home in Story 8.7 — it fills a consumable slot now. The one used
    // here is DEPTH CHARGE, still a stub (epic-8 amendment 83; SHIELD BLOCK
    // until Story 8.16 and SMOKE SCREEN until Story 8.18 were used here and
    // went live), so the stub
    // gate refuses it and it stays a no-op; a LIVE keyed line would fill its slot. The live rack is exercised against a non-stub
    // test catalog at the foot of this file.
    const loadout = loadoutFor(stats);
    const slotRefs = [...loadout];
    const stateRefs = loadout.map((s) => s.state);
    const effects: BoonEffect[] = [
      { kind: 'stat', path: 'maxHp', add: 1 },
      { kind: 'behavior', hookId: 'x', params: {} },
      // A doctrine effect for a verb that no longer exists (Story 8.17): the
      // slot home ignores doctrine regardless.
      { kind: 'doctrine', weapon: 'starShells', mode: 'dazzle' },
      { kind: 'stock', equipmentId: 'depthCharge' },
    ];
    for (const e of effects) applySlotEffect(loadout, e, stats);
    expect(loadout.map((s) => s)).toEqual(slotRefs);
    loadout.forEach((s, i) => expect(s.state).toBe(stateRefs[i]));
  });

  it('`slotReplace` IS DELETED: an untyped one moves nothing (no catalog-v3 line swaps equipment)', () => {
    const loadout = loadoutFor(stats);
    const before = loadout.map((s) => s.equipmentId);
    applySlotEffect(loadout, { kind: 'slotReplace', from: 'heavyTorpedo', to: 'navalMines' } as unknown as BoonEffect, stats);
    expect(loadout.map((s) => s.equipmentId)).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// The two-homes property (+ doctrine and hooks).
// ---------------------------------------------------------------------------

describe('two homes — a card may touch stats and slots, NOTHING else, each via its home', () => {
  it('a stat-only card leaves the loadout REFERENCE-EQUAL through the slot path', () => {
    const l = line('t', { kind: 'stat', path: 'kinematics.maxSpeed', mult: 1.1 });
    const stats = foldOne(TB, l);
    const base = loadoutFor(stats);
    const slotRefs = [...base];
    for (const e of l.tiers[0]) applySlotEffect(base, e, stats);
    base.forEach((s, i) => expect(s).toBe(slotRefs[i]));
  });

  it('a slot-only card leaves effectiveStats output BYTE-IDENTICAL', () => {
    // The production equipment lines are exactly this shape at copy 1.
    expect(effectiveStats(TB, ['navalMines'])).toEqual(effectiveStats(TB));
    expect(effectiveStats(TB, ['broadside'])).toEqual(effectiveStats(TB));
  });

  it('a behavior-only card touches NEITHER home (hooks are its only leg)', () => {
    expect(foldOne(TB, line('b', { kind: 'behavior', hookId: 'stormRider', params: { bonus: 5 } })))
      .toEqual(effectiveStats(TB));
  });

  it('cardBehaviors extracts exactly the behavior effects the held copies buy, in fold order', () => {
    const cat = catalogOf(
      line('a', { kind: 'stat', path: 'maxHp', add: 1 }, { kind: 'behavior', hookId: 'stormRider', params: { bonus: 5 } }),
      line('b', { kind: 'behavior', hookId: 'x', params: {} }),
    );
    expect(cardBehaviors(['b', 'a'], cat)).toEqual([
      { kind: 'behavior', hookId: 'stormRider', params: { bonus: 5 } },
      { kind: 'behavior', hookId: 'x', params: {} },
    ]);
    expect(cardBehaviors([], cat)).toEqual([]);
    // Fold order, not list order — the same property effectiveStats has.
    expect(cardBehaviors(['a', 'b'], cat)).toEqual(cardBehaviors(['b', 'a'], cat));
  });

  it('the production catalog buys NO behavior effects (HOOK_REGISTRY stays empty)', () => {
    expect(cardBehaviors(LINE_IDS.flatMap((id) => new Array<LineId>(CATALOG[id].cap).fill(id)))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Parity property: server-incremental vs client-replayed slot ids.
// ---------------------------------------------------------------------------

describe('one derivation, both sides — incremental vs replayed slot-id parity', () => {
  /** The NON-STUB equipment lines plus two ladders (CANNON carries the pool
   *  rung since 2026-09-30), as a grant pool. */
  const POOL: LineId[] = ['heavyTorpedo', 'navalMines', 'broadside', 'starShells', 'armor', 'deckGun'];

  /**
   * The server's incremental path, emulated faithfully: per granted card,
   * recompute stats over the cards held SO FAR, then apply the effects THAT
   * copy buys (tier k of its line) to the live loadout.
   */
  function serverIncremental(cls: ShipClassId, cards: readonly LineId[]): LoadoutSlot[] {
    const held: LineId[] = [];
    let stats = effectiveStats(CONFIG.shipClasses[cls]);
    const loadout = loadoutFor(stats);
    for (const id of cards) {
      held.push(id);
      stats = effectiveStats(CONFIG.shipClasses[cls], held);
      const copy = held.filter((h) => h === id).length;
      for (const e of CATALOG[id].tiers[copy - 1] ?? []) applySlotEffect(loadout, e, stats);
    }
    return loadout;
  }

  it('server slot ids == client-derived slot ids after arbitrary grant sequences (seeded property)', () => {
    const rng = mulberry32(0xb00b5);
    const classes: ShipClassId[] = ['torpedoBoat', 'battleship', 'mineLayer'];
    for (let trial = 0; trial < 120; trial += 1) {
      const cls = rng.pick(classes);
      const n = rng.int(0, 6);
      const cards = Array.from({ length: n }, () => rng.pick(POOL));
      const server = serverIncremental(cls, cards).map((s) => s.equipmentId);
      const client = slotsWithCards(effectiveStats(CONFIG.shipClasses[cls], cards), cards)
        .map((s) => s.equipmentId);
      expect(client, cards.join('+')).toEqual(server);
    }
  });

  it('slotsWithCards at zero cards equals plain loadoutFor (byte-identical baseline)', () => {
    const stats = effectiveStats(TB);
    expect(slotsWithCards(stats, [])).toEqual(loadoutFor(stats));
    // ...and the fleet flag rides through to the gun-only drone fit (a drone
    // holds no cards at all — EMPTY_DECK_LIST — so this IS its whole loadout).
    expect(slotsWithCards(stats, [], CATALOG, true)).toEqual(loadoutFor(stats, true));
    expect(slotsWithCards(stats, [], CATALOG, true)[SLOT_BOOST])
      .toEqual({ equipmentId: null, state: null });
  });

  it('a capacity ladder + an equipment fit compose: turret pool 2 beside a fresh fill', () => {
    // CANNON ×2 reaches tier III, whose rung adds the second turret (Eric
    // 2026-09-30 — the deleted DECK GUN TURRET card's effect).
    const cards: LineId[] = ['deckGun', 'deckGun', 'navalMines'];
    const stats = effectiveStats(BS, cards);
    const loadout = slotsWithCards(stats, cards);
    expect(loadout.map((s) => s.equipmentId)).toEqual([
      'gun', 'boost', 'navalMines', null, null, ...CONSUMABLE_SLOTS.map(() => null),
    ]);
    expect(loadout[0].state).toEqual({ n: 2, reloadMsLeft: 0 }); // the CANNON tier-III pool
    expect(loadout[WEAPON_SLOTS[0]].state).toEqual({ n: equipmentMaxAmmo(stats, 'navalMines'), reloadMsLeft: 0 });
  });

  it('THE WEAPON ROW IS FIRST-EMPTY-FIRST: the replay follows FIT order, where the stat fold does not', () => {
    // Three weapon slots, two equipment cards — WHICH weapon sits in Q and
    // which in E is a fact about the order they took the cards in. The stats,
    // meanwhile, are identical either way: that asymmetry is the contract.
    // (Before Story 8.5 the same asymmetry decided which single card landed at
    // all; now both land, in order.)
    const cards: LineId[] = ['navalMines', 'heavyTorpedo'];
    const reversed: LineId[] = ['heavyTorpedo', 'navalMines'];
    const stats = effectiveStats(BS, cards);
    expect(effectiveStats(BS, reversed)).toEqual(stats);
    const [Q, E] = WEAPON_SLOTS;
    expect(slotsWithCards(stats, cards)[Q].equipmentId).toBe('navalMines');
    expect(slotsWithCards(stats, cards)[E].equipmentId).toBe('heavyTorpedo');
    expect(slotsWithCards(stats, reversed)[Q].equipmentId).toBe('heavyTorpedo');
    expect(slotsWithCards(stats, reversed)[E].equipmentId).toBe('navalMines');
  });
});

// ---------------------------------------------------------------------------
// THE STUB SLOT GUARD (review gate, Story 8.1). A STUB line is authored in full
// shape -- copy 1 carries a real `slotFill` -- with NO module behind it. The
// server refused to fit one; the SHARED fold did not, so the client (and the
// server own respawn replay, which goes through slotsWithCards) would fit a
// phantom weapon into the extra slot off a card id that reached `cards` by any
// path. The guard belongs in shared, where both sides read it.
// ---------------------------------------------------------------------------
describe('a STUB line NEVER fills a slot (shared guard, both sides)', () => {
  const stats = effectiveStats(CONFIG.shipClasses.torpedoBoat);
  // PRODUCTION HAS NO EQUIPMENT STUB LEFT (Story 8.15 cut missile/monitor and
  // built the machine gun and flak), so the guard is exercised through an
  // injected catalog in which the BROADSIDE line is stubbed.
  const STUBBED: Catalog = { ...CATALOG, broadside: { ...CATALOG.broadside, stub: true } };

  it('slotsWithCards over a stub id leaves the loadout exactly loadoutFor', () => {
    expect(slotsWithCards(stats, ['broadside'], STUBBED)).toEqual(loadoutFor(stats));
  });

  it('...and a LIVE line still fills it, so the guard is about stubs alone', () => {
    expect(slotsWithCards(stats, ['navalMines'], STUBBED)[WEAPON_SLOTS[0]].equipmentId).toBe('navalMines');
    expect(slotsWithCards(stats, ['broadside'])[WEAPON_SLOTS[0]].equipmentId).toBe('broadside');
  });

  it('a stub NEVER consumes a weapon slot — a live line behind it still takes slot 2', () => {
    // The stub is skipped, not "fitted then ignored": the row does not shift.
    expect(slotsWithCards(stats, ['broadside', 'navalMines'], STUBBED)[WEAPON_SLOTS[0]].equipmentId)
      .toBe('navalMines');
  });

  it('applySlotEffect itself refuses a stub fill', () => {
    const loadout = loadoutFor(stats);
    applySlotEffect(loadout, { kind: 'slotFill', equipmentId: 'broadside' }, stats, STUBBED);
    for (const i of WEAPON_SLOTS) expect(loadout[i].equipmentId).toBeNull();
  });

  it('a GUN LADDER card (machineGun / flak, Story 8.15) never fills a slot — it only steps its gun', () => {
    expect(slotsWithCards(stats, ['machineGun', 'flak'])).toEqual(loadoutFor(stats));
    expect(slotsWithCards(stats, ['machineGun', 'navalMines'])[WEAPON_SLOTS[0]].equipmentId).toBe('navalMines');
  });
});

// ---------------------------------------------------------------------------
// THE CONSUMABLE SLOTS (Story 8.7, FIXED since Story 9.2) — a consumable copy
// goes into its KIND'S OWN slot (`consumableSlotFor`, sim/loadout.ts — epic-9
// amendments 21/31): the packed belt is retired, nothing packs and nothing
// shifts, so a kind's key means the same thing all match. A stack is
// `{ n: copiesHeld, reloadMsLeft: 0 }` — it never reloads — and
// `slotsWithCards` needs no code of its own to replay it: k copies replayed IS
// n = k. The DEPTH CHARGE stub has no slot at all.
// ---------------------------------------------------------------------------

describe('the consumable slots — stockSlotFor / the stock fold (Story 8.7, fixed slots since 9.2)', () => {
  const stats = effectiveStats(TB);

  /** The private `consumable()` helper of sim/catalog.ts — the shape is
   *  identical (cap copies, one `stock` per copy, a fresh effect object per
   *  tier) and `validateLine` is asserted clean. */
  const consumableLine = (id: ConsumableId, opts: { stub?: true; cap?: number } = {}): CatalogLine => {
    const cap = opts.cap ?? 5;
    const tiers = Array.from({ length: cap }, () => [{ kind: 'stock', equipmentId: id }] as readonly BoonEffect[]);
    const l: CatalogLine = { id: id as LineId, kind: 'consumable', cap, tiers };
    return opts.stub === undefined ? l : { ...l, stub: opts.stub };
  };

  /** Every consumable line, NONE of them a stub — so the unkeyed DEPTH CHARGE
   *  is exercised as a LIVE line with no slot to go to. */
  const UNSTUBBED: Catalog = catalogOf(...CONSUMABLE_IDS.map((id) => consumableLine(id)));
  const stock = (id: ConsumableId): BoonEffect => ({ kind: 'stock', equipmentId: id });
  const slotOf = (id: ConsumableId): number => {
    const slot = consumableSlotFor(id);
    if (slot === null) throw new Error(`${id} has no slot`);
    return slot;
  };
  const fill = (equipmentId: 'heavyTorpedo' | 'navalMines' | 'starShells'): BoonEffect =>
    ({ kind: 'slotFill', equipmentId });

  /** THE FIXED-PLACEMENT CONTRACT over one loadout and the cards it replayed:
   *  every held keyed kind sits at its own slot with n = its copies (≤ cap),
   *  every unheld kind's slot is empty, and no slot holds another kind. */
  function expectFixedPlacement(loadout: LoadoutSlot[], cards: readonly string[], label: string): void {
    for (const id of CONSUMABLE_KEY_ORDER) {
      const slot = loadout[slotOf(id)];
      const copies = Math.min(boonStackCount(cards, id), CATALOG[id].cap);
      if (copies === 0) {
        expect(slot, `${label}: ${id} empty`).toEqual({ equipmentId: null, state: null });
      } else {
        expect(slot, `${label}: ${id}`).toEqual({ equipmentId: id, state: { n: copies, reloadMsLeft: 0 } });
      }
    }
  }

  it('the test lines are LEGAL catalog lines, and production keys every live consumable', () => {
    for (const id of CONSUMABLE_IDS) expect(validateLine(consumableLine(id)), id).toEqual([]);
    for (const id of CONSUMABLE_IDS) {
      expect(consumableSlotFor(id) !== null, id).toBe(CATALOG[id].stub !== true);
    }
  });

  // --- the slot ------------------------------------------------------------

  it('stockSlotFor answers the kind’s OWN slot, empty or already holding it, over any other contents', () => {
    const rng = mulberry32(0x9a2);
    for (let trial = 0; trial < 100; trial += 1) {
      // Random OTHER kinds fill the remaining consumable slots legally.
      const ids: (SlotItemId | null)[] = loadoutFor(stats).map((s) => s.equipmentId);
      for (const id of CONSUMABLE_KEY_ORDER) if (rng.next() < 0.5) ids[slotOf(id)] = id;
      for (const id of CONSUMABLE_KEY_ORDER) {
        expect(stockSlotFor(ids, id), `${id} over ${ids.join(',')}`).toBe(slotOf(id));
      }
    }
  });

  it('an unkeyed kind (the DEPTH CHARGE stub) and a malformed array have no slot (fail-closed)', () => {
    const ids: (SlotItemId | null)[] = loadoutFor(stats).map((s) => s.equipmentId);
    expect(stockSlotFor(ids, 'depthCharge')).toBeNull();
    expect(stockSlotFor([], 'hullRepair')).toBeNull(); // a missing slot is never "empty"
    const corrupt = [...ids];
    corrupt[slotOf('hullRepair')] = 'shieldBlock'; // another kind where none may sit
    expect(stockSlotFor(corrupt, 'hullRepair')).toBeNull();
  });

  // --- the fold -------------------------------------------------------------

  it('the FIRST copy opens { n: 1, reloadMsLeft: 0 } at the kind’s slot and touches nothing else', () => {
    for (const id of CONSUMABLE_KEY_ORDER) {
      const loadout = loadoutFor(stats);
      const slotRefs = [...loadout];
      const stateRefs = loadout.map((s) => s.state);
      applySlotEffect(loadout, stock(id), stats);
      expect(loadout[slotOf(id)], id).toEqual({ equipmentId: id, state: { n: 1, reloadMsLeft: 0 } });
      loadout.forEach((slot, i) => {
        expect(slot, `${id} slot ${i}`).toBe(slotRefs[i]);
        if (i !== slotOf(id)) expect(slot.state, `${id} slot ${i} state`).toBe(stateRefs[i]);
      });
    }
  });

  it('the SECOND copy INCREMENTS n in place — same state object', () => {
    const loadout = loadoutFor(stats);
    applySlotEffect(loadout, stock('shieldBlock'), stats);
    const stateRef = loadout[slotOf('shieldBlock')].state;
    applySlotEffect(loadout, stock('shieldBlock'), stats);
    expect(loadout[slotOf('shieldBlock')].state).toBe(stateRef); // mutated in place, never re-built
    expect(stateRef).toEqual({ n: 2, reloadMsLeft: 0 });
  });

  it('stocking a SECOND kind never moves the first (no packing)', () => {
    const loadout = loadoutFor(stats);
    applySlotEffect(loadout, stock('hullRepair'), stats);
    const repair = loadout[slotOf('hullRepair')];
    const repairState = repair.state;
    applySlotEffect(loadout, stock('decoyBuoy'), stats);
    expect(loadout[slotOf('hullRepair')]).toBe(repair);
    expect(loadout[slotOf('hullRepair')].state).toBe(repairState);
    expect(loadout[slotOf('decoyBuoy')].equipmentId).toBe('decoyBuoy');
    expectFixedPlacement(loadout, ['hullRepair', 'decoyBuoy'], 'repair then decoy');
  });

  it('a STUB consumable line is REFUSED — the same gate `slotFill` uses, catalog-driven', () => {
    const loadout = loadoutFor(stats);
    const before = JSON.parse(JSON.stringify(loadout)) as LoadoutSlot[];
    applySlotEffect(loadout, stock('hullRepair'), stats, catalogOf(consumableLine('hullRepair', { stub: true })));
    expect(loadout).toEqual(before);
  });

  it('an UNKEYED line stocks nowhere even when live — a silent no-op, every state object the same', () => {
    const loadout = loadoutFor(stats);
    const before = JSON.parse(JSON.stringify(loadout)) as LoadoutSlot[];
    const stateRefs = loadout.map((s) => s.state);
    applySlotEffect(loadout, stock('depthCharge'), stats, UNSTUBBED);
    expect(loadout).toEqual(before);
    loadout.forEach((s, i) => expect(s.state, `slot ${i}`).toBe(stateRefs[i]));
  });

  it('a stock NEVER touches the gun, the Shift or the weapon row — even with the row full', () => {
    const loadout = loadoutFor(stats);
    for (const e of [fill('heavyTorpedo'), fill('navalMines'), fill('starShells')]) applySlotEffect(loadout, e, stats);
    const head = [SLOT_GUN, SLOT_BOOST, ...WEAPON_SLOTS];
    const headIds = head.map((i) => loadout[i].equipmentId);
    const headStates = head.map((i) => loadout[i].state);
    for (const id of CONSUMABLE_IDS) applySlotEffect(loadout, stock(id), stats);
    expect(head.map((i) => loadout[i].equipmentId)).toEqual(headIds);
    head.forEach((i, k) => expect(loadout[i].state, `slot ${i}`).toBe(headStates[k]));
    expectFixedPlacement(loadout, CONSUMABLE_IDS, 'one of each');
  });

  it('...and a slotFill never spills into the consumable slots while stacks sit there', () => {
    const loadout = loadoutFor(stats);
    applySlotEffect(loadout, stock('hullRepair'), stats);
    for (const e of [fill('heavyTorpedo'), fill('navalMines'), fill('starShells')]) applySlotEffect(loadout, e, stats);
    applySlotEffect(loadout, fill('heavyTorpedo'), stats); // duplicate, and the row is full anyway
    expectFixedPlacement(loadout, ['hullRepair'], 'repair beside a full row');
  });

  // --- the replay -----------------------------------------------------------

  it('slotsWithCards REPLAYS the slot with no code of its own: k copies ⇒ n = k (capped at the line cap)', () => {
    for (let k = 1; k <= 7; k += 1) {
      const cards = new Array<string>(k).fill('hullRepair');
      expectFixedPlacement(slotsWithCards(stats, cards), cards, `k=${k}`);
    }
  });

  it('FIXED PLACEMENT (seeded property): any legal hand puts every stack at its own slot, weapons untouched', () => {
    const rng = mulberry32(0x5107);
    const WEAPONS: LineId[] = ['heavyTorpedo', 'navalMines', 'starShells', 'lightTorpedo'];
    const KINDS = [...CONSUMABLE_KEY_ORDER] as LineId[];
    for (let trial = 0; trial < 200; trial += 1) {
      const held: LineId[] = [];
      const n = rng.int(0, 20);
      for (let i = 0; i < n; i += 1) {
        const id = rng.next() < 0.2 ? rng.pick(WEAPONS) : rng.pick(KINDS);
        // A LEGAL hand: the server never lets a refused pick into `cards`.
        const slotIds = slotsWithCards(effectiveStats(TB, held), held).map((s) => s.equipmentId);
        if (pickRefusal(held, slotIds, id) === null) held.push(id);
      }
      const loadout = slotsWithCards(effectiveStats(TB, held), held);
      const label = held.join('+');
      expectFixedPlacement(loadout, held, label);
      // The weapon row is exactly what the same hand WITHOUT its consumables fits.
      const weaponsOnly = held.filter((id) => !(CONSUMABLE_IDS as readonly string[]).includes(id));
      const bare = slotsWithCards(effectiveStats(TB, weaponsOnly), weaponsOnly);
      for (const i of [SLOT_GUN, SLOT_BOOST, ...WEAPON_SLOTS]) {
        expect(loadout[i].equipmentId, `${label} slot ${i}`).toBe(bare[i].equipmentId);
      }
    }
  });

  it('the replay agrees with the INCREMENTAL path over a mixed hand, in either fit order', () => {
    const cards: ConsumableId[] = ['decoyBuoy', 'hullRepair', 'decoyBuoy', 'countermeasure', 'hullRepair', 'decoyBuoy'];
    for (const hand of [cards, [...cards].reverse()]) {
      const replayed = slotsWithCards(stats, hand);
      const incremental = loadoutFor(stats);
      for (const id of hand) applySlotEffect(incremental, stock(id), stats);
      expect(replayed).toEqual(incremental);
      expectFixedPlacement(replayed, hand, hand.join('+'));
    }
  });

  it('using the LAST copy nulls ONLY that kind’s slot — every other stack stays put', () => {
    // A spent copy leaves `cards` server-side, so the next replay is the
    // clear-at-zero state: the kind's own slot reads null, nothing shifts.
    const before: ConsumableId[] = ['hullRepair', 'countermeasure', 'decoyBuoy', 'decoyBuoy'];
    const after = before.filter((id) => id !== 'countermeasure');
    const a = slotsWithCards(stats, before);
    const b = slotsWithCards(stats, after);
    expect(b[slotOf('countermeasure')]).toEqual({ equipmentId: null, state: null });
    a.forEach((slot, i) => {
      if (i !== slotOf('countermeasure')) expect(b[i], `slot ${i}`).toEqual(slot);
    });
  });
});


// ---------------------------------------------------------------------------
// pickRefusal — THE ONE PICK PREDICATE (Story 8.14 review, F1/F2)
//
// Every "can this ship take this card" question in the engine runs through
// this: World.refusesCard (so applyCard, the dev spawn fit and every directed
// grant), World.spendCard (before the level is consumed), the client's greyed
// refit card, the bot spend scorer and the batch-sim spend instrument. One
// branch per refusal, plus the legal cases and the fail-closed edges.
// ---------------------------------------------------------------------------

describe('pickRefusal — every branch', () => {
  /** A fresh hull's slots: gun, Shift, an empty weapon row, empty consumable slots. */
  const OPEN_SLOTS: readonly (SlotItemId | null)[] = loadoutFor(effectiveStats(TB)).map((s) => s.equipmentId);
  /** The same hull with Q/E/R occupied. */
  const ROW_IDS: readonly SlotItemId[] = ['lightTorpedo', 'heavyTorpedo', 'navalMines'];
  const ROW_FULL: readonly (SlotItemId | null)[] = OPEN_SLOTS.map((id, i) => {
    const k = (WEAPON_SLOTS as readonly number[]).indexOf(i);
    return k < 0 ? id : ROW_IDS[k];
  });
  /** Every keyed consumable kind stocked in its own slot. */
  const ALL_STOCKED: readonly (SlotItemId | null)[] = OPEN_SLOTS.map(
    (id, i) => CONSUMABLE_KEY_ORDER.find((k) => consumableSlotFor(k) === i) ?? id,
  );

  it("'stub' — a consumable with no key has no slot, so it is refused even when the catalog un-stubs it", () => {
    // Story 9.2: the slot IS the key; a keyless line must never enter `cards`.
    const { stub: _dropped, ...liveDepthCharge } = CATALOG.depthCharge;
    const unstubbed: Catalog = { ...CATALOG, depthCharge: liveDepthCharge };
    expect(consumableSlotFor('depthCharge')).toBeNull();
    expect(pickRefusal([], OPEN_SLOTS, 'depthCharge', unstubbed)).toBe('stub');
    // and the keyed kinds in the same catalog are untouched by the guard
    for (const k of CONSUMABLE_KEY_ORDER) expect(pickRefusal([], OPEN_SLOTS, k, unstubbed)).toBeNull();
  });

  it('null — the ordinary legal pick, every kind', () => {
    expect(pickRefusal([], OPEN_SLOTS, 'lightTorpedo')).toBeNull(); // copy 1, row open
    expect(pickRefusal(['lightTorpedo'], ROW_FULL, 'lightTorpedo')).toBeNull(); // a TIER card
    expect(pickRefusal([], OPEN_SLOTS, 'armor')).toBeNull(); // a ladder
    expect(pickRefusal([], OPEN_SLOTS, 'foulingShell')).toBeNull(); // FOULING SHELL, a consumable (no add-on is left since 8.17)
    expect(pickRefusal([], OPEN_SLOTS, 'hullRepair')).toBeNull(); // a consumable
  });

  it("'stub' — an unbuilt line, an unknown id, and a prototype key (fail closed)", () => {
    const stubId = LINE_IDS.find((id) => CATALOG[id].stub === true);
    expect(stubId, 'the catalog still carries at least one stub line').toBeDefined();
    expect(pickRefusal([], OPEN_SLOTS, stubId as string)).toBe('stub');
    expect(pickRefusal([], OPEN_SLOTS, 'notALine')).toBe('stub');
    expect(pickRefusal([], OPEN_SLOTS, 'constructor')).toBe('stub');
    expect(pickRefusal([], OPEN_SLOTS, '__proto__')).toBe('stub');
  });

  it("'atCap' — at the line's cap, for EVERY kind, consumables included", () => {
    // THE BUG THIS EXISTS FOR (review F1): a consumable at its cap already owns
    // its slot, so the slot alone would take copy 6 — the cap does not.
    const five = new Array<string>(CATALOG.hullRepair.cap).fill('hullRepair');
    expect(stockSlotFor(ALL_STOCKED, 'hullRepair')).not.toBeNull(); // the slot would take it...
    expect(pickRefusal(five, ALL_STOCKED, 'hullRepair')).toBe('atCap'); // ...the cap does not.
    for (const id of CONSUMABLE_KEY_ORDER) {
      const capped = new Array<string>(CATALOG[id].cap).fill(id);
      expect(CATALOG[id].cap, id).toBe(5);
      expect(pickRefusal(capped, OPEN_SLOTS, id), id).toBe('atCap');
      expect(pickRefusal(capped.slice(1), OPEN_SLOTS, id), `${id} below cap`).toBeNull();
    }
    expect(pickRefusal(new Array<string>(CATALOG.armor.cap).fill('armor'), OPEN_SLOTS, 'armor')).toBe('atCap');
    const maxTorp = new Array<string>(CATALOG.lightTorpedo.cap).fill('lightTorpedo');
    expect(pickRefusal(maxTorp, ROW_FULL, 'lightTorpedo')).toBe('atCap');
    // The cap is decided BEFORE the row, so a capped line reads
    // `atCap` whatever the slots look like.
    expect(pickRefusal(five, OPEN_SLOTS, 'hullRepair')).toBe('atCap');
  });

  it('a consumable is never refused for room: every keyed kind is pickable beside all the others (no full belt)', () => {
    // Since Story 9.2 (epic-9 amendment 21) there is no belt to fill: below its
    // cap a live consumable is legal whatever else is stocked.
    const held = [...CONSUMABLE_KEY_ORDER];
    for (const id of CONSUMABLE_KEY_ORDER) {
      expect(pickRefusal(held, ALL_STOCKED, id), id).toBeNull();
      expect(pickRefusal([], OPEN_SLOTS, id), id).toBeNull();
    }
  });

  it("'noWeaponSlot' — copy 1 of an equipment line with Q/E/R full, never a later copy", () => {
    expect(pickRefusal([], ROW_FULL, 'starShells')).toBe('noWeaponSlot');
    expect(pickRefusal(['starShells'], ROW_FULL, 'starShells')).toBeNull(); // tier II lands on the hull
    // Only EQUIPMENT claims the row: a ladder and two consumables (the
    // FOULING SHELL and HULL REPAIR) all pass with the row full.
    for (const id of ['armor', 'foulingShell', 'hullRepair']) {
      expect(pickRefusal([], ROW_FULL, id), id).toBeNull();
    }
  });

  it('is FAIL-CLOSED on a short or malformed slot array for the weapon row (a missing slot is never empty)', () => {
    expect(pickRefusal([], [], 'starShells')).toBe('noWeaponSlot');
    // ...and undefined entries are not empty either.
    expect(pickRefusal([], new Array<null>(OPEN_SLOTS.length).fill(null).map(() => undefined) as never, 'starShells'))
      .toBe('noWeaponSlot');
  });

  it('honours an INJECTED catalog rather than the shipped one', () => {
    const rows = { ...CATALOG, armor: { ...CATALOG.armor, stub: true as const } };
    expect(pickRefusal([], OPEN_SLOTS, 'armor', rows)).toBe('stub');
    expect(pickRefusal([], OPEN_SLOTS, 'armor')).toBeNull();
  });
});
