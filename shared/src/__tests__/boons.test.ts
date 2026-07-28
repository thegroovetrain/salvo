// Boon effect engine (Story 2.5) — the two-homes-plus-hooks law, proven on
// locally-constructed TEST boons (the production BOON_CATALOG ships EMPTY and
// is pinned so): all four effect kinds, the two-homes property (a stat-only
// boon leaves the loadout untouched, a slot-only boon leaves stats
// byte-identical), the slotFill/slotReplace silent no-op edges, fail-closed
// resolve, list-order determinism, and the server-incremental vs
// client-replayed slot-id parity property over seeded random boon sequences.

import { describe, it, expect } from 'vitest';
import {
  BOON_CATALOG,
  BOON_STAT_PATHS,
  CONFIG,
  NO_BOONS,
  SLOT_EXTRA,
  UPGRADE_IDS,
  applyBoonStats,
  applySlotEffect,
  boonBehaviors,
  effectiveStats,
  equipmentMaxAmmo,
  loadoutFor,
  mulberry32,
  resolveBoons,
  slotsWithBoons,
  zeroUpgrades,
  type BoonCatalog,
  type BoonDef,
  type BoonEffect,
  type EffectiveStats,
  type LoadoutSlot,
  type ShipClassId,
} from '../index.js';

const TB = CONFIG.shipClasses.torpedoBoat;
const BS = CONFIG.shipClasses.battleship;

const def = (id: string, ...effects: BoonEffect[]): BoonDef => ({ id, category: 'test', effects });

// The local test boons — one per effect kind, plus combos. NEVER registered
// in the production catalog (amendment 29): they resolve only through the
// injected TEST_CATALOG below.
const STAT_BOON = def('surgeEngines', { kind: 'stat', path: 'kinematics.maxSpeed', mult: 1.1 });
const FILL_BOON = def('bolterRack', { kind: 'slotFill', equipmentId: 'torpedo' });
const REPLACE_BOON = def('longLance', { kind: 'slotReplace', from: 'torpedo', to: 'mine' });
const BEHAVIOR_BOON = def('stormRider', { kind: 'behavior', hookId: 'stormRider', params: { bonus: 5 } });

const TEST_CATALOG: BoonCatalog = {
  surgeEngines: STAT_BOON,
  bolterRack: FILL_BOON,
  longLance: REPLACE_BOON,
  stormRider: BEHAVIOR_BOON,
};

/** Flatten an EffectiveStats tree into dotted-path -> number entries (the
 *  stats.test.ts AFFECTED-diff helper, reused for boon stat isolation). */
function flatten(stats: EffectiveStats): Map<string, number> {
  const out = new Map<string, number>();
  const walk = (node: Record<string, unknown>, prefix: string): void => {
    for (const [key, value] of Object.entries(node)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (typeof value === 'number') out.set(path, value);
      else walk(value as Record<string, unknown>, path);
    }
  };
  walk(stats as unknown as Record<string, unknown>, '');
  return out;
}

// ---------------------------------------------------------------------------
// The shipped catalog: EMPTY, deep-frozen (engine before content).
// ---------------------------------------------------------------------------

describe('BOON_CATALOG — ships empty and frozen (amendment 29 / engine before content)', () => {
  it('has zero entries', () => {
    expect(Object.keys(BOON_CATALOG)).toHaveLength(0);
  });

  it('is deep-frozen: no def can be smuggled in at runtime', () => {
    expect(Object.isFrozen(BOON_CATALOG)).toBe(true);
    expect(() => {
      (BOON_CATALOG as Record<string, unknown>).injected = STAT_BOON;
    }).toThrow(TypeError);
  });

  it('NO_BOONS is the frozen shared zero-boon identity', () => {
    expect(NO_BOONS).toEqual([]);
    expect(Object.isFrozen(NO_BOONS)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// resolveBoons — fail-closed id -> def.
// ---------------------------------------------------------------------------

describe('resolveBoons — fail-closed resolve', () => {
  it('drops unknown ids silently and keeps known ids in list order', () => {
    const defs = resolveBoons(['junk', 'surgeEngines', 'alsoJunk', 'bolterRack'], TEST_CATALOG);
    expect(defs).toEqual([STAT_BOON, FILL_BOON]);
  });

  it('returns the NO_BOONS identity (same reference) for [] and for all-unknown lists', () => {
    expect(resolveBoons([], TEST_CATALOG)).toBe(NO_BOONS);
    expect(resolveBoons(['junk', 'junk2'], TEST_CATALOG)).toBe(NO_BOONS);
  });

  it('defaults to the production catalog, where every id is unknown today', () => {
    expect(resolveBoons(['surgeEngines'])).toBe(NO_BOONS);
  });

  it('a repeated id resolves to the def each time (stacking is a catalog question, not the resolver policy)', () => {
    expect(resolveBoons(['surgeEngines', 'surgeEngines'], TEST_CATALOG)).toEqual([STAT_BOON, STAT_BOON]);
  });
});

// ---------------------------------------------------------------------------
// Home 1: stat effects — only through effectiveStats, after legacy stacking.
// ---------------------------------------------------------------------------

describe('stat effects — home 1 (effectiveStats), after legacy stacking, list order', () => {
  it('a mult stat boon moves EXACTLY its targeted path (flatten diff), nothing else', () => {
    const identity = flatten(effectiveStats(TB, zeroUpgrades()));
    const mooned = flatten(effectiveStats(TB, zeroUpgrades(), [STAT_BOON]));
    expect([...mooned.keys()]).toEqual([...identity.keys()]); // same shape
    const changed = [...mooned.keys()].filter((k) => mooned.get(k) !== identity.get(k));
    expect(changed).toEqual(['kinematics.maxSpeed']);
    expect(mooned.get('kinematics.maxSpeed')).toBeCloseTo(TB.kinematics.maxSpeed * 1.1, 9);
  });

  it('applies AFTER legacy upgrade stacking: (base * legacyMult^n) * boonMult', () => {
    const upg = zeroUpgrades();
    upg[UPGRADE_IDS.indexOf('maxSpeed')] = 2; // 2 legacy stacks, then the boon's 1.1 on top
    const legacy = effectiveStats(TB, upg).kinematics.maxSpeed;
    const s = effectiveStats(TB, upg, [STAT_BOON]);
    expect(s.kinematics.maxSpeed).toBeCloseTo(legacy * 1.1, 9);
    expect(legacy).toBeCloseTo(TB.kinematics.maxSpeed * CONFIG.upgrades.maxSpeed.mult ** 2, 9);
  });

  it('add and mult compose per effect (v*mult+add) and stack across boons in LIST ORDER', () => {
    const multBoon = def('m', { kind: 'stat', path: 'maxHp', mult: 2 });
    const addBoon = def('a', { kind: 'stat', path: 'maxHp', add: 30 });
    const multFirst = effectiveStats(BS, zeroUpgrades(), [multBoon, addBoon]).maxHp;
    const addFirst = effectiveStats(BS, zeroUpgrades(), [addBoon, multBoon]).maxHp;
    expect(multFirst).toBe(BS.hp * 2 + 30);
    expect(addFirst).toBe((BS.hp + 30) * 2);
    expect(multFirst).not.toBe(addFirst); // order is load-bearing — and deterministic
    // Determinism: the same list twice gives byte-identical output.
    expect(effectiveStats(BS, zeroUpgrades(), [multBoon, addBoon])).toEqual(
      effectiveStats(BS, zeroUpgrades(), [multBoon, addBoon]),
    );
  });

  it('a sweepRpm boon re-derives sweepPeriodMs (the derived pair stays coherent)', () => {
    const rpmBoon = def('r', { kind: 'stat', path: 'sweepRpm', add: 5 });
    const s = effectiveStats(TB, zeroUpgrades(), [rpmBoon]);
    expect(s.sweepRpm).toBe(CONFIG.vision.sweepRpm + 5);
    expect(s.sweepPeriodMs).toBeCloseTo(60000 / s.sweepRpm, 9);
  });

  it('sweepPeriodMs is NOT on the whitelist (derived, never directly addressable); damage is not addressable at all', () => {
    expect(BOON_STAT_PATHS).not.toContain('sweepPeriodMs');
    for (const path of BOON_STAT_PATHS) expect(path.toLowerCase()).not.toContain('damage');
  });

  it('an off-whitelist path in an untyped def is a fail-closed no-op (runtime guard)', () => {
    const rogue = {
      id: 'rogue',
      category: 'test',
      effects: [{ kind: 'stat', path: 'nope.nothere', mult: 99 }],
    } as unknown as BoonDef;
    expect(effectiveStats(TB, zeroUpgrades(), [rogue])).toEqual(effectiveStats(TB, zeroUpgrades()));
  });

  it('zero boons: the 3-arg default is byte-identical to the 2-arg call (regression identity)', () => {
    expect(effectiveStats(TB, zeroUpgrades(), [])).toEqual(effectiveStats(TB, zeroUpgrades()));
    expect(effectiveStats(TB, zeroUpgrades(), NO_BOONS)).toEqual(effectiveStats(TB, zeroUpgrades()));
  });
});

// ---------------------------------------------------------------------------
// Home 2: slot effects — the ONE LoadoutSlot[] structure, one shared function.
// ---------------------------------------------------------------------------

describe('slot effects — home 2 (applySlotEffect over the one LoadoutSlot[])', () => {
  const stats = effectiveStats(TB, zeroUpgrades());

  it('slotFill fills the EMPTY extra slot with a fresh full pool at current stats', () => {
    const loadout = loadoutFor('torpedoBoat', stats);
    expect(loadout[SLOT_EXTRA].equipmentId).toBeNull();
    applySlotEffect(loadout, FILL_BOON.effects[0], stats);
    expect(loadout[SLOT_EXTRA].equipmentId).toBe('torpedo');
    expect(loadout[SLOT_EXTRA].state).toEqual({ n: equipmentMaxAmmo(stats, 'torpedo'), reloadMsLeft: 0 });
  });

  it('slotFill against an OCCUPIED extra slot is a silent no-op — existing state untouched', () => {
    const loadout = loadoutFor('torpedoBoat', stats);
    applySlotEffect(loadout, FILL_BOON.effects[0], stats);
    const occupied = loadout[SLOT_EXTRA];
    occupied.state!.n = 1;
    occupied.state!.reloadMsLeft = 777; // live mid-reload state
    const stateRef = occupied.state;
    applySlotEffect(loadout, { kind: 'slotFill', equipmentId: 'mine' }, stats);
    expect(occupied.equipmentId).toBe('torpedo'); // NOT replaced by the second fill
    expect(occupied.state).toBe(stateRef); // same state object, untouched
    expect(occupied.state).toEqual({ n: 1, reloadMsLeft: 777 });
  });

  it('slotReplace swaps the slot holding `from` to `to` with a fresh full pool; OTHER slots keep live ammo state', () => {
    const loadout = loadoutFor('torpedoBoat', stats); // [gun, torpedo, speedBoost, empty]
    loadout[0].state!.n = 0;
    loadout[0].state!.reloadMsLeft = 1500; // gun mid-cooldown — must survive
    applySlotEffect(loadout, REPLACE_BOON.effects[0], stats);
    expect(loadout[1].equipmentId).toBe('mine');
    expect(loadout[1].state).toEqual({ n: equipmentMaxAmmo(stats, 'mine'), reloadMsLeft: 0 });
    expect(loadout[0].state).toEqual({ n: 0, reloadMsLeft: 1500 }); // untouched neighbor
    expect(loadout[2].equipmentId).toBe('speedBoost');
    expect(loadout[SLOT_EXTRA].equipmentId).toBeNull();
  });

  it('slotReplace with `from` unfitted is a silent no-op (fail-closed — the applyGrantEffects guard)', () => {
    const loadout = loadoutFor('battleship', stats); // no torpedo fitted
    const before = loadout.map((s) => ({ equipmentId: s.equipmentId, state: s.state ? { ...s.state } : null }));
    expect(() => applySlotEffect(loadout, REPLACE_BOON.effects[0], stats)).not.toThrow();
    expect(loadout.map((s) => ({ equipmentId: s.equipmentId, state: s.state ? { ...s.state } : null }))).toEqual(before);
  });

  it('stat and behavior effects are structural no-ops in the slot home', () => {
    const loadout = loadoutFor('torpedoBoat', stats);
    const slotRefs = [...loadout];
    const stateRefs = loadout.map((s) => s.state);
    applySlotEffect(loadout, STAT_BOON.effects[0], stats);
    applySlotEffect(loadout, BEHAVIOR_BOON.effects[0], stats);
    expect(loadout.map((s) => s)).toEqual(slotRefs); // same slot objects
    loadout.forEach((s, i) => expect(s.state).toBe(stateRefs[i])); // same state objects
  });
});

// ---------------------------------------------------------------------------
// The two-homes property.
// ---------------------------------------------------------------------------

describe('two homes — a boon may touch stats and slots, NOTHING else, and each only via its home', () => {
  it('a stat-only boon leaves the loadout REFERENCE-EQUAL through the slot path', () => {
    const stats = effectiveStats(TB, zeroUpgrades(), [STAT_BOON]);
    const base = loadoutFor('torpedoBoat', stats);
    const slotRefs = [...base];
    for (const e of STAT_BOON.effects) applySlotEffect(base, e, stats);
    base.forEach((s, i) => expect(s).toBe(slotRefs[i]));
    expect(base.map((s) => s.equipmentId)).toEqual(['gun', 'torpedo', 'speedBoost', null]);
  });

  it('a slot-only boon leaves effectiveStats output BYTE-IDENTICAL', () => {
    expect(effectiveStats(TB, zeroUpgrades(), [FILL_BOON])).toEqual(effectiveStats(TB, zeroUpgrades()));
    expect(effectiveStats(TB, zeroUpgrades(), [REPLACE_BOON])).toEqual(effectiveStats(TB, zeroUpgrades()));
  });

  it('a behavior-only boon touches NEITHER home (hooks are its only leg)', () => {
    expect(effectiveStats(TB, zeroUpgrades(), [BEHAVIOR_BOON])).toEqual(effectiveStats(TB, zeroUpgrades()));
    const stats = effectiveStats(TB, zeroUpgrades());
    const loadout = loadoutFor('torpedoBoat', stats);
    const stateRefs = loadout.map((s) => s.state);
    for (const e of BEHAVIOR_BOON.effects) applySlotEffect(loadout, e, stats);
    loadout.forEach((s, i) => expect(s.state).toBe(stateRefs[i]));
  });

  it('boonBehaviors extracts exactly the behavior effects, in list order', () => {
    const defs = [STAT_BOON, BEHAVIOR_BOON, FILL_BOON, def('b2', { kind: 'behavior', hookId: 'x', params: {} })];
    expect(boonBehaviors(defs)).toEqual([
      { kind: 'behavior', hookId: 'stormRider', params: { bonus: 5 } },
      { kind: 'behavior', hookId: 'x', params: {} },
    ]);
    expect(boonBehaviors([])).toEqual([]);
    expect(boonBehaviors([STAT_BOON, FILL_BOON])).toEqual([]);
  });

  it('applyBoonStats mutates ONLY the targeted scalar (+ the derived sweep pair) in place', () => {
    const stats = effectiveStats(TB, zeroUpgrades());
    const before = flatten(stats);
    applyBoonStats(stats, [def('hp', { kind: 'stat', path: 'maxHp', add: 25 })]);
    const after = flatten(stats);
    const changed = [...after.keys()].filter((k) => after.get(k) !== before.get(k));
    expect(changed).toEqual(['maxHp']);
    expect(stats.maxHp).toBe(TB.hp + 25);
  });
});

// ---------------------------------------------------------------------------
// Parity property: server-incremental vs client-replayed slot ids.
// ---------------------------------------------------------------------------

describe('one derivation, both sides — incremental vs replayed slot-id parity', () => {
  /** The effect pool random sequences draw from (all four kinds, incl. no-op
   *  edges: double fills, replaces whose `from` may or may not be fitted). */
  const POOL: BoonDef[] = [
    STAT_BOON,
    FILL_BOON,
    REPLACE_BOON,
    BEHAVIOR_BOON,
    def('fillMine', { kind: 'slotFill', equipmentId: 'mine' }),
    def('mineToDecoy', { kind: 'slotReplace', from: 'mine', to: 'decoyBuoy' }),
    def('boostToCannon', { kind: 'slotReplace', from: 'speedBoost', to: 'cannon' }),
    def('combo', { kind: 'stat', path: 'torpedo.reloadMs', mult: 0.8 }, { kind: 'slotFill', equipmentId: 'starShells' }),
  ];

  /** The server's incremental path, emulated faithfully: per applied boon,
   *  recompute stats over the defs-so-far, then apply THAT def's effects to
   *  the live loadout (world.applyBoon's exact order). */
  function serverIncremental(cls: ShipClassId, defs: readonly BoonDef[]): LoadoutSlot[] {
    const applied: BoonDef[] = [];
    let stats = effectiveStats(CONFIG.shipClasses[cls], zeroUpgrades());
    const loadout = loadoutFor(cls, stats);
    for (const d of defs) {
      applied.push(d);
      stats = effectiveStats(CONFIG.shipClasses[cls], zeroUpgrades(), applied);
      for (const e of d.effects) applySlotEffect(loadout, e, stats);
    }
    return loadout;
  }

  it('server slot ids == client-derived slot ids after arbitrary boon sequences (seeded property)', () => {
    const rng = mulberry32(0xb00b5);
    const classes: ShipClassId[] = ['torpedoBoat', 'battleship', 'mineLayer'];
    for (let trial = 0; trial < 60; trial++) {
      const cls = rng.pick(classes);
      const n = rng.int(0, 5); // 0..5 boons, order randomized
      const defs = Array.from({ length: n }, () => rng.pick(POOL));
      const server = serverIncremental(cls, defs).map((s) => s.equipmentId);
      const client = slotsWithBoons(cls, effectiveStats(CONFIG.shipClasses[cls], zeroUpgrades(), defs), defs).map(
        (s) => s.equipmentId,
      );
      expect(client).toEqual(server);
    }
  });

  it('slotsWithBoons at zero boons equals plain loadoutFor (byte-identical baseline)', () => {
    const stats = effectiveStats(TB, zeroUpgrades());
    expect(slotsWithBoons('torpedoBoat', stats, [])).toEqual(loadoutFor('torpedoBoat', stats));
  });
});
