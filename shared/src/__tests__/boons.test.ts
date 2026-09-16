// THE CARD FOLD ENGINE (sim/effects.ts + sim/boons.ts) — the "two homes +
// hooks" law under catalog v3. The CONTENT pins (29 lines, caps, kinds, the
// stub set, the validator, order-independence) live in catalog.test.ts; this
// suite is about the ENGINE:
//   - the five-effect vocabulary, and that `slotReplace` is gone;
//   - home 1: `stat` effects reach EffectiveStats and nothing else, through a
//     GENERATED whitelist whose deliberate absences are pinned;
//   - home 2: `slotFill` mutates the one LoadoutSlot[] and nothing else;
//   - `doctrine` verbs, `behavior` hooks and `stock` (a total no-op today);
//   - the parity property: the server's INCREMENTAL slot path and the client's
//     REPLAYED `slotsWithCards` agree after any sequence of grants.

import { describe, it, expect } from 'vitest';
import {
  BOON_STAT_PATHS,
  CATALOG,
  CONFIG,
  DOCTRINE_MODES,
  EQUIPMENT_INT_FIELDS,
  EQUIPMENT_STAT_FIELDS,
  EQUIPMENT_IDS,
  LINE_IDS,
  NO_CARDS,
  SLOT_EXTRA,
  applyCardStats,
  applySlotEffect,
  boonStackCount,
  cardBehaviors,
  cardCounts,
  effectiveStats,
  equipmentMaxAmmo,
  loadoutFor,
  mulberry32,
  slotsWithCards,
  type BoonEffect,
  type Catalog,
  type CatalogLine,
  type EffectiveStats,
  type LineId,
  type LoadoutSlot,
  type ShipClassId,
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
    // FR57/AR48) — the pin is updated, not deleted.
    expect([...EQUIPMENT_INT_FIELDS]).toEqual(['maxAmmo', 'barrels', 'turrets']);
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
  const fill = (equipmentId: 'heavyTorpedo' | 'navalMines' | 'starShells'): BoonEffect =>
    ({ kind: 'slotFill', equipmentId });

  it('slotFill fills the EMPTY extra slot with a fresh full pool at current stats', () => {
    const loadout = loadoutFor('battleship', stats); // no torpedo fitted
    expect(loadout[SLOT_EXTRA].equipmentId).toBeNull();
    applySlotEffect(loadout, fill('heavyTorpedo'), stats);
    expect(loadout[SLOT_EXTRA].equipmentId).toBe('heavyTorpedo');
    expect(loadout[SLOT_EXTRA].state).toEqual({ n: equipmentMaxAmmo(stats, 'heavyTorpedo'), reloadMsLeft: 0 });
  });

  it('slotFill against an OCCUPIED extra slot is a silent no-op — existing state untouched', () => {
    const loadout = loadoutFor('battleship', stats);
    applySlotEffect(loadout, fill('heavyTorpedo'), stats);
    const occupied = loadout[SLOT_EXTRA];
    occupied.state!.n = 1;
    occupied.state!.reloadMsLeft = 777;
    const stateRef = occupied.state;
    applySlotEffect(loadout, fill('navalMines'), stats);
    expect(occupied.equipmentId).toBe('heavyTorpedo');
    expect(occupied.state).toBe(stateRef);
    expect(occupied.state).toEqual({ n: 1, reloadMsLeft: 777 });
  });

  it('slotFill of equipment ALREADY fitted is a no-op (the duplicate guard)', () => {
    const loadout = loadoutFor('torpedoBoat', stats); // heavyTorpedo already in slot 1
    applySlotEffect(loadout, fill('heavyTorpedo'), stats);
    expect(loadout.map((s) => s.equipmentId)).toEqual(['gun', 'heavyTorpedo', 'speedBoost', null]);
    expect(loadout[SLOT_EXTRA].state).toBeNull();
    // An UNfitted id still fills normally (the guard is duplicate-only).
    applySlotEffect(loadout, fill('navalMines'), stats);
    expect(loadout[SLOT_EXTRA].equipmentId).toBe('navalMines');
  });

  it('stat, behavior, doctrine AND stock effects are structural no-ops in the slot home', () => {
    const loadout = loadoutFor('torpedoBoat', stats);
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
    const loadout = loadoutFor('torpedoBoat', stats);
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
    const base = loadoutFor('torpedoBoat', stats);
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
    const loadout = loadoutFor(cls, stats);
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
      const client = slotsWithCards(cls, effectiveStats(CONFIG.shipClasses[cls], cards), cards)
        .map((s) => s.equipmentId);
      expect(client, cards.join('+')).toEqual(server);
    }
  });

  it('slotsWithCards at zero cards equals plain loadoutFor (byte-identical baseline)', () => {
    const stats = effectiveStats(TB);
    expect(slotsWithCards('torpedoBoat', stats, [])).toEqual(loadoutFor('torpedoBoat', stats));
  });

  it('a capacity ladder + an equipment fit compose: turret pool 2 beside a fresh fill', () => {
    const cards: LineId[] = ['deckGunTurret', 'navalMines'];
    const stats = effectiveStats(BS, cards);
    const loadout = slotsWithCards('battleship', stats, cards);
    expect(loadout.map((s) => s.equipmentId)).toEqual(['gun', 'broadside', 'starShells', 'navalMines']);
    expect(loadout[0].state).toEqual({ n: 2, reloadMsLeft: 0 }); // DECK GUN TURRET pool
    expect(loadout[SLOT_EXTRA].state).toEqual({ n: equipmentMaxAmmo(stats, 'navalMines'), reloadMsLeft: 0 });
  });

  it('THE EXTRA SLOT IS FIRST-FIT: the replay follows FIT order, where the stat fold does not', () => {
    // One extra slot, two equipment cards — which one a captain ends up
    // carrying is a fact about the order they took the cards in. The stats,
    // meanwhile, are identical either way: that asymmetry is the contract.
    const cards: LineId[] = ['navalMines', 'heavyTorpedo'];
    const reversed: LineId[] = ['heavyTorpedo', 'navalMines'];
    const stats = effectiveStats(BS, cards);
    expect(effectiveStats(BS, reversed)).toEqual(stats);
    expect(slotsWithCards('battleship', stats, cards)[SLOT_EXTRA].equipmentId).toBe('navalMines');
    expect(slotsWithCards('battleship', stats, reversed)[SLOT_EXTRA].equipmentId).toBe('heavyTorpedo');
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
    expect(slotsWithCards('torpedoBoat', stats, ['lightTorpedo'])).toEqual(loadoutFor('torpedoBoat', stats));
    expect(slotsWithCards('battleship', stats, ['captiveMines', 'monitor', 'flak']))
      .toEqual(loadoutFor('battleship', stats));
  });

  it('...and a LIVE line still fills it, so the guard is about stubs alone', () => {
    expect(slotsWithCards('battleship', stats, ['navalMines'])[SLOT_EXTRA].equipmentId).toBe('navalMines');
  });

  it('applySlotEffect itself refuses a stub fill', () => {
    const loadout = loadoutFor('torpedoBoat', stats);
    applySlotEffect(loadout, { kind: 'slotFill', equipmentId: 'missile' }, stats);
    expect(loadout[SLOT_EXTRA].equipmentId).toBeNull();
  });
});
