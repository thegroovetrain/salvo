// THE CARD FOLD ENGINE (sim/effects.ts + sim/boons.ts) — the "two homes +
// hooks" law under catalog v3. The CONTENT pins (29 lines, caps, kinds, the
// stub set, the validator, order-independence) live in catalog.test.ts; this
// suite is about the ENGINE:
//   - the four-effect vocabulary (`slotReplace` and, since Story 10.5, `stock`
//     are gone);
//   - home 1: `stat` effects reach EffectiveStats and nothing else, through a
//     GENERATED whitelist whose deliberate absences are pinned;
//   - home 2: `slotFill` mutates the one LoadoutSlot[] and nothing else —
//     since Story 10.5 into the weapon's FAMILY slot (one kind per slot),
//     leaving every other slot's state object REFERENCE-IDENTICAL;
//   - `doctrine` verbs and `behavior` hooks;
//   - the parity property: the server's INCREMENTAL slot path and the client's
//     REPLAYED `slotsWithCards` agree after any sequence of grants;
//   - `pickRefusal`, the one "can this ship take this card" predicate.

import { describe, it, expect } from 'vitest';
import {
  BOON_STAT_PATHS,
  CATALOG,
  CONFIG,
  DOCTRINE_MODES,
  EQUIPMENT_FAMILY,
  EQUIPMENT_INT_FIELDS,
  EQUIPMENT_STAT_FIELDS,
  EQUIPMENT_IDS,
  FAMILY_SLOT,
  LINE_IDS,
  NO_CARDS,
  SLOT_BOOST,
  SLOT_FAMILIES,
  SLOT_GUN,
  WEAPON_SLOTS,
  applyCardStats,
  applySlotEffect,
  boonStackCount,
  pickRefusal,
  cardBehaviors,
  cardCounts,
  effectiveStats,
  equipmentMaxAmmo,
  familyMembers,
  familySlotFor,
  loadoutFor,
  mulberry32,
  slotsWithCards,
  tierTargetOf,
  type BoonEffect,
  type Catalog,
  type CatalogLine,
  type EffectiveStats,
  type EquipmentId,
  type LineId,
  type LoadoutSlot,
  type ShipClassId,
  type SlotFamily,
} from '../index.js';
import { lineForEquipment } from '../sim/catalog.js';

const TB = CONFIG.shipClasses.iowa;
const BS = CONFIG.shipClasses.yamato;

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
      // THE SEVEN INDICES (Story 10.3, Eric 2026-11-04, epic-10 amendment 8)
      // after `maxHp`, then radarRange and the four pass-through kinematics.
      // `kinematics.maxSpeed` / `turnRate`, `sweepRpm`, `cooldownScale` and
      // the `regen.*` pair are GONE from the whitelist: derived or deleted.
      'maxHp', 'armor', 'power', 'reload', 'engines', 'rudder', 'intel', 'range', 'radarRange',
      'kinematics.reverseSpeed', 'kinematics.accel', 'kinematics.decel', 'kinematics.steerageSpeed',
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
  // Every weapon `rangeU` LEFT this list with Story 9.8 (Eric 2026-10-13,
  // epic-9 ruling 125): reach is a per-weapon TIERED dial each upgrade card
  // steps, so it is addressable — pinned PRESENT in barrel.test.ts.
  it('pins the derived paths ABSENT: sightRange, sweepPeriodMs, the broadside arcs, every triggerRadius, every tier', () => {
    const absent = [
      'sightRange',
      'sweepPeriodMs',
      // Story 9.7 (epic-9 amendments 86–88 / 110–117): derived from `armor`.
      'damageMultiplier',
      // Story 10.3 (epic-10 amendment 8): derived from the indices in
      // sim/indexStats.ts — a card writes ENGINES, never the speed.
      'kinematics.maxSpeed',
      'kinematics.turnRate',
      'sweepRpm',
      'cooldownScale',
      // ...and the regen pair is DELETED with PASSIVE HEALING.
      'regen.missingPctPerS',
      'regen.outOfCombatMs',
      // The cut's Armor bonus is a CONFIG pass-through (amendment 88).
      'equipment.hunker.armorBonus',
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
      // THE SUPERCAV NEVER HOMES (amendment 74): its row is back since Story
      // 10.5, but its turn rate is not addressable.
      'equipment.supercavTorpedo.homingTurnRate',
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
    // Eric 2026-09-29, amendments 130/131/133), and ARMOR (Story 9.7, epic-9
    // amendments 86–88 / 110–117), and POWER (Story 9.9's ARMOR PIERCING,
    // epic-9 amendments 144–145). Story 10.3 (Eric 2026-11-04, epic-10
    // amendment 7): the six ship ladders write THEIR OWN INDICES (`reload`,
    // `engines`, `rudder`, `intel` replace `cooldownScale`, `kinematics.*`,
    // `sweepRpm`), FOULING MINES gains a damage step, and `maxHp` / `range` /
    // the four pass-through kinematics are whitelisted, unwritten.
    expect([...written].sort()).toEqual([
      'armor', 'power', 'reload', 'engines', 'rudder', 'intel',
      'equipment.gun.damage', 'equipment.gun.maxAmmo',
      'equipment.lightTorpedo.damage', 'equipment.lightTorpedo.speed',
      'equipment.lightTorpedo.maxAmmo', 'equipment.lightTorpedo.homingTurnRate',
      'equipment.heavyTorpedo.damage', 'equipment.heavyTorpedo.speed',
      'equipment.heavyTorpedo.maxAmmo', 'equipment.heavyTorpedo.homingTurnRate',
      'equipment.navalMines.damage', 'equipment.navalMines.blastRadius', 'equipment.navalMines.maxAmmo',
      'equipment.captiveMines.damage', 'equipment.captiveMines.maxAmmo',
      'equipment.captiveMines.homingTurnRate',
      'equipment.foulingMines.damage', 'equipment.foulingMines.blastRadius', 'equipment.foulingMines.maxAmmo',
      'equipment.foulingMines.slowFactor',
      'equipment.machineGun.maxAmmo', 'equipment.machineGun.rateMs',
      'equipment.flak.damage', 'equipment.flak.maxAmmo',
      'equipment.starShells.litDurationMs', 'equipment.starShells.litRadius',
      'equipment.starShells.maxAmmo', 'equipment.starShells.damage',
      'equipment.broadside.spreadRung', 'equipment.broadside.turrets',
      'equipment.phosphorShells.damage', 'equipment.phosphorShells.dps',
      'equipment.phosphorShells.zoneRadius', 'equipment.phosphorShells.zoneDurationMs',
      // Story 9.8 (ruling 125): every tiered weapon's reach steps per card.
      'equipment.gun.rangeU', 'equipment.machineGun.rangeU', 'equipment.flak.rangeU',
      'equipment.broadside.rangeU', 'equipment.starShells.rangeU', 'equipment.phosphorShells.rangeU',
      // Story 10.5: the three moved weapons' one tiered stat each.
      'equipment.supercavTorpedo.damage', 'equipment.dazzleShells.radius', 'equipment.foulingShell.radius',
    ].sort());
    // Still addressable in principle, still written by nothing: the
    // BROADSIDE's damage is fixed by ruling (amendment 133), radarRange has no
    // card at all, since Story 9.12 (Eric 2026-10-16) the cannon's barrels are
    // a fixed CONFIG.gun.barrels and the machine gun's damage is flat, and
    // since Story 10.3 `maxHp` (HULL POINTS deleted), `range` (no card yet)
    // and the four pass-through kinematics have no writer.
    for (const path of [
      'radarRange', 'equipment.broadside.damage',
      'equipment.gun.barrels', 'equipment.machineGun.damage',
      'maxHp', 'range', 'kinematics.reverseSpeed', 'kinematics.accel', 'kinematics.decel', 'kinematics.steerageSpeed',
      // The two burst shells' reach is FIXED (Story 10.5, R7 tiers the radius).
      'equipment.dazzleShells.rangeU', 'equipment.foulingShell.rangeU',
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
    // own weapon and DAZZLE the FLASH SHELLS line, so the star shell's
    // verbs are gone. The table stays, empty (the machinery is kept).
    expect(DOCTRINE_MODES).toEqual({});
    expect('starShells' in DOCTRINE_MODES).toBe(false);
    for (const weapon of Object.keys(DOCTRINE_MODES)) expect(EQUIPMENT_IDS).toContain(weapon);
    // `captive` left because CAPTIVE MINES became its own equipment line (R25).
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
    const l = line('t', { kind: 'stat', path: 'kinematics.reverseSpeed', mult: 1.1 });
    const s = foldOne(TB, l);
    expect(diff(effectiveStats(TB), s)).toEqual(['kinematics.reverseSpeed']);
    expect(s.kinematics.reverseSpeed).toBeCloseTo(TB.kinematics.reverseSpeed * 1.1, 9);
  });

  it('an INDEX card moves its index AND what the fold derives from it, nothing else (Story 10.3)', () => {
    const s = foldOne(TB, line('e', { kind: 'stat', path: 'engines', mult: 1.5 }));
    expect(diff(effectiveStats(TB), s)).toEqual(['engines', 'kinematics.maxSpeed']);
    expect(s.kinematics.maxSpeed).toBe((CONFIG.index.engines * s.engines) / CONFIG.index.base);
  });

  it('a THREE-SEGMENT equipment path resolves (the 8.1 walk), and only that row moves', () => {
    const l = line('t', { kind: 'stat', path: 'equipment.heavyTorpedo.speed', add: 5 });
    const s = foldOne(TB, l);
    expect(diff(effectiveStats(TB), s)).toEqual(['equipment.heavyTorpedo.speed']);
    expect(s.equipment.heavyTorpedo.speed).toBe(CONFIG.torpedo.speed + 5);
    // The sibling row is untouched — its own CONFIG block since Story 8.13.
    expect(s.equipment.lightTorpedo.speed).toBe(CONFIG.lightTorpedo.speed);
  });

  it('an INTEL card re-derives sweepRpm and sweepPeriodMs, and the CEILING is re-applied over the fold', () => {
    const s = foldOne(TB, line('r', { kind: 'stat', path: 'intel', add: 5 }));
    expect(s.intel).toBe(TB.index.intel + 5);
    expect(s.sweepRpm).toBe((CONFIG.vision.sweepRpm * s.intel) / CONFIG.index.base);
    expect(s.sweepPeriodMs).toBeCloseTo(60000 / s.sweepRpm, 9);
    const over = foldOne(TB, line('o', { kind: 'stat', path: 'intel', add: 100000 }));
    expect(over.sweepRpm).toBe(CONFIG.vision.sweepRpmMax);
    expect(over.sweepPeriodMs).toBe(60000 / CONFIG.vision.sweepRpmMax);
  });

  it('an off-whitelist or malformed path is a fail-closed no-op (runtime guard)', () => {
    for (const path of ['nope.nothere', 'sightRange', 'equipment.broadside.traverseRad', 'equipment.nope.damage', 'equipment.gun']) {
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

  it('the deleted `stock` effect is a TOTAL no-op in the fold (an untyped line carrying one moves nothing)', () => {
    const l = line('s', { kind: 'stock', equipmentId: 'hullRepair' } as unknown as BoonEffect);
    expect(foldOne(TB, l)).toEqual(effectiveStats(TB));
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
    expect(boonStackCount(['armor', 'engines', 'armor'], 'armor')).toBe(2);
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

/** One weapon of each family, and a second kind of each — read off the model. */
const FIRST_OF = Object.fromEntries(SLOT_FAMILIES.map((f) => [f, familyMembers(f)[0]])) as Record<SlotFamily, EquipmentId>;
const SECOND_OF = Object.fromEntries(SLOT_FAMILIES.map((f) => [f, familyMembers(f)[1]])) as Record<SlotFamily, EquipmentId>;
const fill = (equipmentId: EquipmentId): BoonEffect => ({ kind: 'slotFill', equipmentId });

describe('slot effects — home 2 (applySlotEffect over the one LoadoutSlot[])', () => {
  const stats = effectiveStats(TB);

  it('slotFill fills the weapon\'s FAMILY slot with a fresh full pool — every family weapon, on an empty row', () => {
    for (const id of EQUIPMENT_IDS) {
      const slot = familySlotFor(id);
      if (slot === null) continue;
      const loadout = loadoutFor(stats);
      applySlotEffect(loadout, fill(id), stats);
      expect(loadout[slot], id).toEqual({ equipmentId: id, state: { n: equipmentMaxAmmo(stats, id), reloadMsLeft: 0 } });
      // ...and nowhere else: the other two family slots stay empty.
      for (const i of WEAPON_SLOTS) if (i !== slot) expect(loadout[i].equipmentId, `${id} slot ${i}`).toBeNull();
    }
  });

  it('A FILL TOUCHES ITS TARGET SLOT AND NOTHING ELSE — every other state object is REFERENCE-IDENTICAL', () => {
    // THE identity pin: "fitting a weapon never touches another slot's timer"
    // is a statement about object identity, not about equal numbers. Live
    // timers make it bite — an implementation that rebuilds the array (or
    // re-freshens a pool) fails here while a toEqual would pass.
    const loadout = loadoutFor(stats);
    applySlotEffect(loadout, fill(FIRST_OF.torpedo), stats);
    loadout[SLOT_GUN].state!.reloadMsLeft = 321;
    loadout[SLOT_BOOST].state!.n = 0;
    loadout[FAMILY_SLOT.torpedo].state!.reloadMsLeft = 4242;
    const slotRefs = [...loadout];
    const stateRefs = loadout.map((s) => s.state);
    applySlotEffect(loadout, fill(FIRST_OF.mine), stats);
    loadout.forEach((slot, i) => {
      expect(slot, `slot ${i}`).toBe(slotRefs[i]); // the ARRAY is mutated in place
      if (i !== FAMILY_SLOT.mine) expect(slot.state, `slot ${i} state`).toBe(stateRefs[i]);
    });
    expect(loadout[SLOT_GUN].state!.reloadMsLeft).toBe(321);
    expect(loadout[SLOT_BOOST].state!.n).toBe(0);
    expect(loadout[FAMILY_SLOT.torpedo].state!.reloadMsLeft).toBe(4242);
  });

  it('ONE KIND PER SLOT: a second kind of a filled family is a silent no-op — it never displaces, never spills into another slot', () => {
    for (const family of SLOT_FAMILIES) {
      const loadout = loadoutFor(stats);
      applySlotEffect(loadout, fill(FIRST_OF[family]), stats);
      const before = loadout.map((s) => s.equipmentId);
      const stateRefs = loadout.map((s) => s.state);
      for (const other of familyMembers(family)) applySlotEffect(loadout, fill(other), stats);
      expect(loadout.map((s) => s.equipmentId), family).toEqual(before);
      loadout.forEach((s, i) => expect(s.state, `${family} slot ${i}`).toBe(stateRefs[i]));
    }
  });

  it('slotFill of equipment ALREADY fitted is a no-op: the pool is never re-freshened', () => {
    const loadout = loadoutFor(stats);
    applySlotEffect(loadout, fill(FIRST_OF.mine), stats);
    const stateRef = loadout[FAMILY_SLOT.mine].state;
    loadout[FAMILY_SLOT.mine].state!.n = 0;
    applySlotEffect(loadout, fill(FIRST_OF.mine), stats);
    expect(loadout[FAMILY_SLOT.mine].state).toBe(stateRef);
    expect(loadout[FAMILY_SLOT.mine].state!.n).toBe(0);
  });

  it('equipment with NO family slot fits nowhere: BROADSIDE (left the deal, R6), the guns and the Shifts', () => {
    for (const id of EQUIPMENT_IDS) {
      if (familySlotFor(id) !== null) continue;
      const loadout = loadoutFor(stats);
      const before = loadout.map((s) => s.equipmentId);
      applySlotEffect(loadout, fill(id), stats);
      expect(loadout.map((s) => s.equipmentId), id).toEqual(before);
    }
    expect(slotsWithCards(stats, ['broadside'])).toEqual(loadoutFor(stats));
  });

  // Review gate (Edge Case Hunter 5): the documented answer for an id outside
  // EQUIPMENT_FAMILY is `null`, never `undefined` (a `!== null` caller would
  // otherwise treat it as fitted somewhere).
  it('familySlotFor: an id outside EQUIPMENT_FAMILY (unknown, or an Object.prototype key) answers null', () => {
    for (const id of ['notAnEquipment', 'toString', '__proto__', '']) {
      expect(familySlotFor(id as EquipmentId), id).toBeNull();
    }
  });

  it('a short or malformed loadout is fail-closed: a missing family slot is never filled', () => {
    const short = loadoutFor(stats).slice(0, FAMILY_SLOT.torpedo);
    applySlotEffect(short, fill(FIRST_OF.torpedo), stats);
    expect(short).toHaveLength(FAMILY_SLOT.torpedo);
    expect(short.some((s) => s.equipmentId === FIRST_OF.torpedo)).toBe(false);
  });

  it('stat, behavior and doctrine effects are structural no-ops in the slot home — and so is the deleted `stock`', () => {
    const loadout = loadoutFor(stats);
    const slotRefs = [...loadout];
    const stateRefs = loadout.map((s) => s.state);
    const effects: BoonEffect[] = [
      { kind: 'stat', path: 'maxHp', add: 1 },
      { kind: 'behavior', hookId: 'x', params: {} },
      { kind: 'doctrine', weapon: 'starShells', mode: 'dazzle' },
      { kind: 'stock', equipmentId: 'hullRepair' } as unknown as BoonEffect,
      { kind: 'slotReplace', from: 'heavyTorpedo', to: 'navalMines' } as unknown as BoonEffect,
    ];
    for (const e of effects) applySlotEffect(loadout, e, stats);
    expect(loadout.map((s) => s)).toEqual(slotRefs);
    loadout.forEach((s, i) => expect(s.state).toBe(stateRefs[i]));
  });
});

// ---------------------------------------------------------------------------
// The two-homes property (+ doctrine and hooks).
// ---------------------------------------------------------------------------

describe('two homes — a card may touch stats and slots, NOTHING else, each via its home', () => {
  it('a stat-only card leaves the loadout REFERENCE-EQUAL through the slot path', () => {
    const l = line('t', { kind: 'stat', path: 'engines', mult: 1.1 });
    const stats = foldOne(TB, l);
    const base = loadoutFor(stats);
    const slotRefs = [...base];
    for (const e of l.tiers[0]) applySlotEffect(base, e, stats);
    base.forEach((s, i) => expect(s).toBe(slotRefs[i]));
  });

  it('a slot-only card leaves effectiveStats output BYTE-IDENTICAL', () => {
    // The production equipment lines are exactly this shape at copy 1.
    expect(effectiveStats(TB, ['navalMines'])).toEqual(effectiveStats(TB));
    expect(effectiveStats(TB, ['dazzleShells'])).toEqual(effectiveStats(TB));
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

/** Every dealable EQUIPMENT line (a weapon card), in catalog order. */
const WEAPON_LINES: LineId[] = LINE_IDS.filter((id) => CATALOG[id].kind === 'equipment' && CATALOG[id].stub !== true);

describe('one derivation, both sides — incremental vs replayed slot-id parity', () => {
  /** A grant pool: every weapon line (BROADSIDE included — it fits nowhere on
   *  either path) plus two ladders. */
  const POOL: LineId[] = [...WEAPON_LINES, 'armor', 'deckGun'];

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

  it('server slot ids == client-derived slot ids after arbitrary grant sequences — second kinds of a family included (seeded property)', () => {
    const rng = mulberry32(0xb00b5);
    const classes: ShipClassId[] = ['iowa', 'yamato', 'warspite'];
    for (let trial = 0; trial < 200; trial += 1) {
      const cls = rng.pick(classes);
      const n = rng.int(0, 8);
      const cards = Array.from({ length: n }, () => rng.pick(POOL));
      const server = serverIncremental(cls, cards).map((s) => s.equipmentId);
      const client = slotsWithCards(effectiveStats(CONFIG.shipClasses[cls], cards), cards).map((s) => s.equipmentId);
      expect(client, cards.join('+')).toEqual(server);
    }
  });

  it('slotsWithCards at zero cards equals plain loadoutFor (byte-identical baseline)', () => {
    const stats = effectiveStats(TB);
    expect(slotsWithCards(stats, [])).toEqual(loadoutFor(stats));
    // ...and the fleet flag rides through to the gun-only drone fit.
    expect(slotsWithCards(stats, [], CATALOG, true)).toEqual(loadoutFor(stats, true));
    expect(slotsWithCards(stats, [], CATALOG, true)[SLOT_BOOST]).toEqual({ equipmentId: null, state: null });
  });

  it('a capacity ladder + an equipment fit compose: the folded gun pool beside a fresh fill', () => {
    // CANNON ×2 reaches tier III, whose rung adds the second turret (Eric
    // 2026-09-30). Read on the GUN-MODULE fit (`fleet`): a captain mounts the
    // main battery since Story 10.4 and is never dealt this ladder, but the
    // composition of a folded pool with a fresh fill is a contract of the
    // replay itself.
    const cards: LineId[] = ['deckGun', 'deckGun', 'navalMines'];
    const stats = effectiveStats(BS, cards);
    const loadout = slotsWithCards(stats, cards, CATALOG, true);
    expect(loadout[SLOT_GUN]).toEqual({ equipmentId: 'gun', state: { n: equipmentMaxAmmo(stats, 'gun'), reloadMsLeft: 0 } });
    expect(equipmentMaxAmmo(stats, 'gun')).toBeGreaterThan(CONFIG.gun.maxAmmo);
    expect(loadout[FAMILY_SLOT.mine]).toEqual({
      equipmentId: 'navalMines', state: { n: equipmentMaxAmmo(stats, 'navalMines'), reloadMsLeft: 0 },
    });
  });

  it('THE SLOT IS THE FAMILY\'S, WHATEVER THE CARD ORDER: every permutation of one weapon per family replays the same row', () => {
    // WAS first-empty-first (Story 8.5): which weapon sat in Q was a fact about
    // the order the cards were taken in. Since Story 10.5 it is a fact about
    // the weapon's KIND and nothing else.
    const rng = mulberry32(0x105);
    for (let trial = 0; trial < 100; trial += 1) {
      const picks = SLOT_FAMILIES.map((f) => rng.pick(familyMembers(f)));
      const cards = picks.map((eq) => lineForEquipment(eq)!.id);
      const shuffled = [...cards].sort(() => rng.next() - 0.5);
      const stats = effectiveStats(BS, shuffled);
      const row = slotsWithCards(stats, shuffled).map((s) => s.equipmentId);
      SLOT_FAMILIES.forEach((f, k) => expect(row[FAMILY_SLOT[f]], shuffled.join('+')).toBe(picks[k]));
      expect(effectiveStats(BS, cards)).toEqual(stats); // and the stats never cared
    }
  });

  it('between two kinds of ONE family the FIRST card taken holds the slot — on both paths', () => {
    for (const family of SLOT_FAMILIES) {
      const a = lineForEquipment(FIRST_OF[family])!.id;
      const b = lineForEquipment(SECOND_OF[family])!.id;
      const stats = effectiveStats(TB, [a, b]);
      expect(slotsWithCards(stats, [a, b])[FAMILY_SLOT[family]].equipmentId, family).toBe(FIRST_OF[family]);
      expect(slotsWithCards(stats, [b, a])[FAMILY_SLOT[family]].equipmentId, family).toBe(SECOND_OF[family]);
      expect(serverIncremental('iowa', [b, a])[FAMILY_SLOT[family]].equipmentId, family).toBe(SECOND_OF[family]);
    }
  });
});

// ---------------------------------------------------------------------------
// THE STUB SLOT GUARD (review gate, Story 8.1). A STUB line is authored in full
// shape -- copy 1 carries a real `slotFill` -- with NO module behind it. The
// server refused to fit one; the SHARED fold did not, so the client (and the
// server own respawn replay, which goes through slotsWithCards) would fit a
// phantom weapon off a card id that reached `cards` by any path. The guard
// belongs in shared, where both sides read it.
// ---------------------------------------------------------------------------
describe('a STUB line NEVER fills a slot (shared guard, both sides)', () => {
  const stats = effectiveStats(CONFIG.shipClasses.iowa);
  // PRODUCTION HAS NO EQUIPMENT STUB (the one stub, DEPTH CHARGE, fits
  // nothing), so the guard is exercised through an injected catalog in which
  // the NAVAL MINES line is stubbed.
  const STUBBED: Catalog = { ...CATALOG, navalMines: { ...CATALOG.navalMines, stub: true } };

  it('slotsWithCards over a stub id leaves the loadout exactly loadoutFor', () => {
    expect(slotsWithCards(stats, ['navalMines'], STUBBED)).toEqual(loadoutFor(stats));
    expect(slotsWithCards(stats, ['depthCharge'])).toEqual(loadoutFor(stats));
  });

  it('...and the same line fills when live, so the guard is about stubs alone', () => {
    expect(slotsWithCards(stats, ['navalMines'])[FAMILY_SLOT.mine].equipmentId).toBe('navalMines');
  });

  it('a stub NEVER holds its family slot — a live kind of that family behind it still takes it', () => {
    expect(slotsWithCards(stats, ['navalMines', 'captiveMines'], STUBBED)[FAMILY_SLOT.mine].equipmentId)
      .toBe('captiveMines');
  });

  it('applySlotEffect itself refuses a stub fill', () => {
    const loadout = loadoutFor(stats);
    applySlotEffect(loadout, { kind: 'slotFill', equipmentId: 'navalMines' }, stats, STUBBED);
    for (const i of WEAPON_SLOTS) expect(loadout[i].equipmentId).toBeNull();
  });

  it('a GUN LADDER card (machineGun / flak, Story 8.15) never fills a slot — it only steps its gun', () => {
    expect(slotsWithCards(stats, ['machineGun', 'flak'])).toEqual(loadoutFor(stats));
    expect(slotsWithCards(stats, ['machineGun', 'navalMines'])[FAMILY_SLOT.mine].equipmentId).toBe('navalMines');
  });
});

// ---------------------------------------------------------------------------
// pickRefusal — THE one "can this ship take this card" predicate.
// ---------------------------------------------------------------------------
describe('pickRefusal — every branch', () => {
  const stats = effectiveStats(TB);
  const idsFor = (held: readonly LineId[]): (EquipmentId | null)[] =>
    slotsWithCards(effectiveStats(TB, held), held).map((s) => s.equipmentId);
  const EMPTY = loadoutFor(stats).map((s) => s.equipmentId);

  it('null — the ordinary legal pick: every dealable line with a home, on a fresh hull', () => {
    for (const id of LINE_IDS) {
      const want = CATALOG[id].stub === true ? 'stub' : id === 'broadside' ? 'noWeaponSlot' : null;
      expect(pickRefusal([], EMPTY, id), id).toBe(want);
    }
  });

  it("'stub' — an unbuilt line, an unknown id, a deleted line and a prototype key (fail closed)", () => {
    for (const id of ['depthCharge', 'nope', 'hullRepair', 'healingBuoy', 'constructor', 'toString', '']) {
      expect(pickRefusal([], EMPTY, id), id).toBe('stub');
    }
  });

  it("'atCap' — at the line's cap, for every dealable line, and one under it is still legal", () => {
    for (const id of LINE_IDS) {
      if (CATALOG[id].stub === true || id === 'broadside') continue;
      const cap = CATALOG[id].cap;
      const full = new Array<LineId>(cap).fill(id);
      expect(pickRefusal(full, idsFor(full), id), id).toBe('atCap');
      const under = new Array<LineId>(cap - 1).fill(id);
      expect(pickRefusal(under, idsFor(under), id), id).toBeNull();
    }
  });

  it("'noWeaponSlot' — a SECOND KIND of a filled family is refused; the SAME kind tiers up; the other families stay open", () => {
    for (const line of WEAPON_LINES) {
      const eq = tierTargetOf(CATALOG[line])!;
      const family = EQUIPMENT_FAMILY[eq];
      if (family === null) continue;
      const held = [line];
      const ids = idsFor(held);
      for (const other of WEAPON_LINES) {
        const otherFamily = EQUIPMENT_FAMILY[tierTargetOf(CATALOG[other])!];
        if (otherFamily === null) continue;
        const want = other === line || otherFamily !== family ? null : 'noWeaponSlot';
        expect(pickRefusal(held, ids, other), `${other} after ${line}`).toBe(want);
      }
    }
  });

  it("'noWeaponSlot' — BROADSIDE has no slot at all (it left the deal, R6), at any count and on any row", () => {
    expect(pickRefusal([], EMPTY, 'broadside')).toBe('noWeaponSlot');
    const held: LineId[] = ['lightTorpedo'];
    expect(pickRefusal(held, idsFor(held), 'broadside')).toBe('noWeaponSlot');
  });

  it('is FAIL-CLOSED on a short or malformed slot array (a missing slot is never empty)', () => {
    for (const line of WEAPON_LINES) {
      if (line === 'broadside') continue;
      expect(pickRefusal([], [], line), line).toBe('noWeaponSlot');
      expect(pickRefusal([], EMPTY.slice(0, WEAPON_SLOTS[0]), line), line).toBe('noWeaponSlot');
    }
    // A ladder never asks about a slot.
    expect(pickRefusal([], [], 'armor')).toBeNull();
  });

  it('honours an INJECTED catalog rather than the shipped one', () => {
    const cat = catalogOf({ ...CATALOG.navalMines, stub: true }, CATALOG.captiveMines);
    expect(pickRefusal([], EMPTY, 'navalMines', cat)).toBe('stub');
    expect(pickRefusal([], EMPTY, 'captiveMines', cat)).toBeNull();
    expect(pickRefusal([], EMPTY, 'armor', cat)).toBe('stub'); // not a line of this catalog
  });
});
