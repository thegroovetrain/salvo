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
//     fills the four-wide BELT (its own section at the foot of this file);
//   - the parity property: the server's INCREMENTAL slot path and the client's
//     REPLAYED `slotsWithCards` agree after any sequence of grants.

import { describe, it, expect } from 'vitest';
import {
  BOON_STAT_PATHS,
  CATALOG,
  CONFIG,
  CONSUMABLE_IDS,
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
  canStock,
  cardBehaviors,
  cardCounts,
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
    // Catalog v3 authors five stat paths; the rest stand ready for 8.12–8.16.
    expect([...written].sort()).toEqual([
      'cooldownScale', 'equipment.gun.barrels', 'equipment.gun.damage', 'equipment.gun.maxAmmo',
      'kinematics.maxSpeed', 'kinematics.turnRate', 'maxHp', 'sweepRpm',
    ].sort());
    for (const path of ['radarRange', 'equipment.heavyTorpedo.speed', 'equipment.navalMines.blastRadius']) {
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

  it('DOCTRINE_MODES is keyed by EquipmentId and carries only verbs a v3 add-on grants', () => {
    expect(DOCTRINE_MODES).toEqual({
      lightTorpedo: ['homing'],
      heavyTorpedo: ['homing'],
      navalMines: ['propFouling'],
      missile: ['homing'],
      starShells: ['phosphor', 'dazzle'],
    });
    for (const weapon of Object.keys(DOCTRINE_MODES)) expect(EQUIPMENT_IDS).toContain(weapon);
    // The radar buoy's gun/jamming verbs left with the buoy (catalog-v3 R1) and
    // `captive` left because CAPTIVE MINES became its own equipment line (R25).
    expect('radarBuoy' in DOCTRINE_MODES).toBe(false);
    expect(DOCTRINE_MODES.navalMines).not.toContain('captive');
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
    expect(s.equipment.lightTorpedo.speed).toBe(45); // the sibling row is untouched
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
      'gun', 'speedBoost', 'heavyTorpedo', 'navalMines', 'starShells', null, null, null, null,
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

  it('a FULL weapon row is a silent no-op — the loadout is untouched, nothing spills into the belt', () => {
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
    // `stock` moved home in Story 8.7 — it fills the BELT now. It is still a
    // no-op HERE because every production consumable line is a stub (epic-8
    // amendment 41) and the stub gate refuses it; the live rack is exercised
    // against a non-stub test catalog at the foot of this file.
    const loadout = loadoutFor(stats);
    const slotRefs = [...loadout];
    const stateRefs = loadout.map((s) => s.state);
    const effects: BoonEffect[] = [
      { kind: 'stat', path: 'maxHp', add: 1 },
      { kind: 'behavior', hookId: 'x', params: {} },
      { kind: 'doctrine', weapon: 'heavyTorpedo', mode: 'homing' },
      { kind: 'stock', equipmentId: 'hullRepair' },
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
  /** The NON-STUB equipment lines plus a ladder, as a grant pool. */
  const POOL: LineId[] = ['heavyTorpedo', 'navalMines', 'broadside', 'starShells', 'armor', 'deckGunTurret'];

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
    const cards: LineId[] = ['deckGunTurret', 'navalMines'];
    const stats = effectiveStats(BS, cards);
    const loadout = slotsWithCards(stats, cards);
    expect(loadout.map((s) => s.equipmentId)).toEqual([
      'gun', 'speedBoost', 'navalMines', null, null, null, null, null, null,
    ]);
    expect(loadout[0].state).toEqual({ n: 2, reloadMsLeft: 0 }); // DECK GUN TURRET pool
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

  it('slotsWithCards over a stub id leaves the loadout exactly loadoutFor', () => {
    expect(slotsWithCards(stats, ['lightTorpedo'])).toEqual(loadoutFor(stats));
    expect(slotsWithCards(stats, ['captiveMines', 'monitor', 'flak'])).toEqual(loadoutFor(stats));
  });

  it('...and a LIVE line still fills it, so the guard is about stubs alone', () => {
    expect(slotsWithCards(stats, ['navalMines'])[WEAPON_SLOTS[0]].equipmentId).toBe('navalMines');
  });

  it('a stub NEVER consumes a weapon slot — a live line behind it still takes slot 2', () => {
    // The stub is skipped, not "fitted then ignored": the row does not shift.
    expect(slotsWithCards(stats, ['lightTorpedo', 'navalMines'])[WEAPON_SLOTS[0]].equipmentId).toBe('navalMines');
  });

  it('applySlotEffect itself refuses a stub fill', () => {
    const loadout = loadoutFor(stats);
    applySlotEffect(loadout, { kind: 'slotFill', equipmentId: 'missile' }, stats);
    for (const i of WEAPON_SLOTS) expect(loadout[i].equipmentId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// THE RACK (Story 8.7) — `stock` stops being a no-op. A consumable copy goes
// into the FOUR-WIDE BELT (slots 5–8): the slot that already holds the line if
// there is one, else the first empty belt slot, else nowhere (a silent no-op,
// which the server's spendCard refuses BEFORE it mutates anything and the
// client greys as `SLOTS FULL`). A stack is `{ n: copiesHeld, reloadMsLeft: 0 }`
// — it never reloads — and `slotsWithCards` needs no new code to replay it:
// k copies replayed IS n = k.
//
// EVERY PRODUCTION CONSUMABLE IS STILL A STUB (epic-8 amendment 41), so these
// tests run on an injected NON-STUB catalog; the production pin (the belt stays
// empty in play) is asserted below and in nineSlots.test.ts.
// ---------------------------------------------------------------------------

describe('the belt — canStock / stockSlotFor / the stock fold (Story 8.7)', () => {
  const stats = effectiveStats(TB);
  const [B0, B1, B2, B3] = CONSUMABLE_SLOTS;

  /** The private `consumable()` helper of sim/catalog.ts, minus its hard-wired
   *  `stub: true` — the shape is identical (cap copies, one `stock` per copy,
   *  a fresh effect object per tier) and `validateLine` is asserted clean. */
  const consumableLine = (id: ConsumableId, opts: { stub?: true; cap?: number } = {}): CatalogLine => {
    const cap = opts.cap ?? 5;
    const tiers = Array.from({ length: cap }, () => [{ kind: 'stock', equipmentId: id }] as readonly BoonEffect[]);
    const l: CatalogLine = { id: id as LineId, kind: 'consumable', cap, tiers };
    return opts.stub === undefined ? l : { ...l, stub: opts.stub };
  };

  /** All five lines, NONE of them a stub — the catalog Story 8.8 onward ships. */
  const BELT: Catalog = catalogOf(...CONSUMABLE_IDS.map((id) => consumableLine(id)));
  const stock = (id: ConsumableId): BoonEffect => ({ kind: 'stock', equipmentId: id });
  const beltIds = (loadout: LoadoutSlot[]): (SlotItemId | null)[] => CONSUMABLE_SLOTS.map((i) => loadout[i].equipmentId);
  const fill = (equipmentId: 'heavyTorpedo' | 'navalMines' | 'starShells'): BoonEffect =>
    ({ kind: 'slotFill', equipmentId });

  /** Slot ids for a loadout whose belt holds `held` — gun, boost and a weapon
   *  row in front of it, exactly as the wire mirror hands them over. */
  const beltFrom = (held: (ConsumableId | null)[]): (SlotItemId | null)[] =>
    ['gun', 'speedBoost', 'heavyTorpedo', null, null, ...held];

  it('the test lines are LEGAL catalog lines (the helper is the shipped shape, un-stubbed)', () => {
    for (const id of CONSUMABLE_IDS) expect(validateLine(consumableLine(id)), id).toEqual([]);
    expect(CATALOG[CONSUMABLE_IDS[0]].stub).toBe(true); // ...and production stays stubbed (amendment 41)
  });

  // --- the predicate ------------------------------------------------------

  it('an EMPTY belt takes any line in the FIRST belt slot', () => {
    const ids = beltFrom([null, null, null, null]);
    expect(stockSlotFor(ids, 'hullRepair')).toBe(B0);
    expect(canStock(ids, 'hullRepair')).toBe(true);
  });

  it('a HELD line wins over an EARLIER empty slot (held first, then first-empty)', () => {
    const ids = beltFrom([null, null, 'hullRepair', null]);
    expect(stockSlotFor(ids, 'hullRepair')).toBe(B2); // NOT B0, which is empty and earlier
    expect(stockSlotFor(ids, 'chaff')).toBe(B0);
  });

  it('a FULL belt REFUSES a new line — null, and canStock false', () => {
    const ids = beltFrom(['hullRepair', 'shieldBlock', 'smokeScreen', 'chaff']);
    expect(stockSlotFor(ids, 'decoyBuoy')).toBeNull();
    expect(canStock(ids, 'decoyBuoy')).toBe(false);
  });

  it('a FULL belt still takes a line it ALREADY HOLDS, in that line’s own slot', () => {
    const ids = beltFrom(['hullRepair', 'shieldBlock', 'smokeScreen', 'chaff']);
    expect(stockSlotFor(ids, 'smokeScreen')).toBe(B2);
    expect(canStock(ids, 'smokeScreen')).toBe(true);
  });

  it('canStock is EXACTLY "the belt holds it ∨ a belt slot is empty", over every arrangement', () => {
    const arrangements: (ConsumableId | null)[][] = [
      [null, null, null, null],
      ['hullRepair', null, null, null],
      ['hullRepair', 'chaff', null, null],
      ['hullRepair', 'chaff', 'smokeScreen', null],
      ['hullRepair', 'chaff', 'smokeScreen', 'shieldBlock'],
    ];
    for (const held of arrangements) {
      const ids = beltFrom(held);
      const empty = held.some((x) => x === null);
      for (const id of CONSUMABLE_IDS) {
        const label = `${id} over ${held.join(',')}`;
        expect(canStock(ids, id), label).toBe(held.includes(id) || empty);
        expect(canStock(ids, id), label).toBe(stockSlotFor(ids, id) !== null);
      }
    }
  });

  it('only the BELT is ever answered: a weapon slot index is never returned, and a short array is fail-closed', () => {
    const ids = beltFrom([null, null, null, null]);
    for (const id of CONSUMABLE_IDS) {
      const slot = stockSlotFor(ids, id);
      expect(slot === null || (CONSUMABLE_SLOTS as readonly number[]).includes(slot), id).toBe(true);
    }
    expect(stockSlotFor([], 'hullRepair')).toBeNull(); // malformed: no belt to read
    expect(canStock(['gun', 'speedBoost', null, null, null], 'hullRepair')).toBe(false);
  });

  // --- the fold -----------------------------------------------------------

  it('the FIRST copy fills belt slot 5 with { n: 1, reloadMsLeft: 0 } and touches nothing else', () => {
    const loadout = loadoutFor(stats);
    const slotRefs = [...loadout];
    const stateRefs = loadout.map((s) => s.state);
    applySlotEffect(loadout, stock('hullRepair'), stats, BELT);
    expect(loadout[B0].equipmentId).toBe('hullRepair');
    expect(loadout[B0].state).toEqual({ n: 1, reloadMsLeft: 0 });
    loadout.forEach((slot, i) => {
      expect(slot, `slot ${i}`).toBe(slotRefs[i]);
      if (i !== B0) expect(slot.state, `slot ${i} state`).toBe(stateRefs[i]);
    });
    expect(beltIds(loadout)).toEqual(['hullRepair', null, null, null]);
  });

  it('the SECOND copy INCREMENTS n in the held slot — same state object, no second slot', () => {
    const loadout = loadoutFor(stats);
    applySlotEffect(loadout, stock('hullRepair'), stats, BELT);
    const stateRef = loadout[B0].state;
    applySlotEffect(loadout, stock('hullRepair'), stats, BELT);
    expect(loadout[B0].state).toBe(stateRef); // mutated in place, never re-built
    expect(loadout[B0].state).toEqual({ n: 2, reloadMsLeft: 0 });
    expect(beltIds(loadout)).toEqual(['hullRepair', null, null, null]);
  });

  it('FOUR lines fill 5, 6, 7, 8 in fit order', () => {
    const loadout = loadoutFor(stats);
    for (const id of ['chaff', 'hullRepair', 'decoyBuoy', 'smokeScreen'] as ConsumableId[]) {
      applySlotEffect(loadout, stock(id), stats, BELT);
    }
    expect(beltIds(loadout)).toEqual(['chaff', 'hullRepair', 'decoyBuoy', 'smokeScreen']);
    for (const i of CONSUMABLE_SLOTS) expect(loadout[i].state, `slot ${i}`).toEqual({ n: 1, reloadMsLeft: 0 });
  });

  it('a FIFTH line is a SILENT no-op — the loadout is byte-identical and every state object is the same one', () => {
    const loadout = loadoutFor(stats);
    for (const id of ['chaff', 'hullRepair', 'decoyBuoy', 'smokeScreen'] as ConsumableId[]) {
      applySlotEffect(loadout, stock(id), stats, BELT);
    }
    const before = JSON.parse(JSON.stringify(loadout)) as LoadoutSlot[];
    const stateRefs = loadout.map((s) => s.state);
    applySlotEffect(loadout, stock('shieldBlock'), stats, BELT);
    expect(loadout).toEqual(before);
    loadout.forEach((s, i) => expect(s.state, `slot ${i}`).toBe(stateRefs[i]));
  });

  it('a STUB consumable line is REFUSED — the same gate `slotFill` uses, catalog-driven', () => {
    const loadout = loadoutFor(stats);
    const stubbed = catalogOf(consumableLine('hullRepair', { stub: true }));
    applySlotEffect(loadout, stock('hullRepair'), stats, stubbed);
    expect(beltIds(loadout)).toEqual([null, null, null, null]);
    // ...and the PRODUCTION catalog stubs all five (amendment 41): the belt is
    // unreachable in play after 8.7.
    for (const id of CONSUMABLE_IDS) applySlotEffect(loadout, stock(id), stats, CATALOG);
    expect(beltIds(loadout)).toEqual([null, null, null, null]);
  });

  it('a stock NEVER touches the gun, the boost or the weapon row — even with the row full', () => {
    const loadout = loadoutFor(stats);
    for (const e of [fill('heavyTorpedo'), fill('navalMines'), fill('starShells')]) applySlotEffect(loadout, e, stats);
    const head = loadout.slice(0, B0);
    const headIds = head.map((s) => s.equipmentId);
    const headStates = head.map((s) => s.state);
    for (const id of CONSUMABLE_IDS) applySlotEffect(loadout, stock(id), stats, BELT);
    expect(loadout.slice(0, B0).map((s) => s.equipmentId)).toEqual(headIds);
    loadout.slice(0, B0).forEach((s, i) => expect(s.state, `slot ${i}`).toBe(headStates[i]));
    expect(beltIds(loadout)).toEqual(['hullRepair', 'shieldBlock', 'smokeScreen', 'chaff']); // the 5th refused
    expect(loadout[B3].equipmentId).toBe('chaff');
  });

  it('...and a slotFill never spills into the belt while a stack sits there', () => {
    const loadout = loadoutFor(stats);
    applySlotEffect(loadout, stock('hullRepair'), stats, BELT);
    for (const e of [fill('heavyTorpedo'), fill('navalMines'), fill('starShells')]) applySlotEffect(loadout, e, stats);
    applySlotEffect(loadout, fill('heavyTorpedo'), stats); // duplicate, and the row is full anyway
    expect(beltIds(loadout)).toEqual(['hullRepair', null, null, null]);
    expect(loadout[B0].state).toEqual({ n: 1, reloadMsLeft: 0 });
  });

  // --- the replay ---------------------------------------------------------

  it('slotsWithCards REPLAYS the rack with no code of its own: k copies ⇒ n = k (capped at the line cap)', () => {
    for (let k = 1; k <= 7; k += 1) {
      const cards = new Array<string>(k).fill('hullRepair');
      const loadout = slotsWithCards(stats, cards, BELT);
      expect(loadout[B0].equipmentId, `k=${k}`).toBe('hullRepair');
      expect(loadout[B0].state, `k=${k}`).toEqual({ n: Math.min(k, BELT.hullRepair.cap), reloadMsLeft: 0 });
      expect(beltIds(loadout).filter((id) => id !== null), `k=${k}`).toHaveLength(1);
    }
  });

  it('the replay agrees with the INCREMENTAL path over a mixed hand, in fit order', () => {
    const cards = ['chaff', 'hullRepair', 'chaff', 'decoyBuoy', 'hullRepair', 'chaff'];
    const replayed = slotsWithCards(stats, cards, BELT);
    const incremental = loadoutFor(stats);
    for (const id of cards) applySlotEffect(incremental, stock(id as ConsumableId), stats, BELT);
    expect(replayed).toEqual(incremental);
    expect(beltIds(replayed)).toEqual(['chaff', 'hullRepair', 'decoyBuoy', null]);
    expect(replayed[B0].state).toEqual({ n: 3, reloadMsLeft: 0 });
    expect(replayed[B1].state).toEqual({ n: 2, reloadMsLeft: 0 });
    expect(replayed[B2].state).toEqual({ n: 1, reloadMsLeft: 0 });
  });
});
