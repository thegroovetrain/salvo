// Boon effect engine (Story 2.5) — the two-homes-plus-hooks law, proven on
// locally-constructed TEST boons (the production BOON_CATALOG ships Story 2.7's
// interim DUMMY set, whose SHAPE is pinned below): all four effect kinds, the two-homes property (a stat-only
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
  type BoonStatEffect,
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
// The shipped catalog: the INTERIM DUMMY SET, deep-frozen (Story 2.7,
// amendment 35). These pins FLIPPED from "ships empty" — the 2.5 empty-catalog
// assertions are replaced one-for-one by dummy-SHAPE assertions, because the
// shape (stat-only, whitelisted paths, enough categories) is what keeps
// amendments 29/30 intact and what rollBoonOffer depends on. Content itself is
// draft copy and dies in 2.8.
// ---------------------------------------------------------------------------

describe('BOON_CATALOG — the interim dummy set (amendment 35)', () => {
  it('ships at least 8 entries across at least 5 categories, 2+ per category', () => {
    const defs = Object.values(BOON_CATALOG);
    expect(defs.length).toBeGreaterThanOrEqual(8);
    const byCat = new Map<string, number>();
    for (const def of defs) byCat.set(def.category, (byCat.get(def.category) ?? 0) + 1);
    expect(byCat.size).toBeGreaterThanOrEqual(5);
    for (const [cat, n] of byCat) expect(n, cat).toBeGreaterThanOrEqual(2);
  });

  it('is keyed by its own id, with camelCase ids (the registry-id convention)', () => {
    for (const [key, def] of Object.entries(BOON_CATALOG)) {
      expect(def.id).toBe(key);
      expect(key).toMatch(/^[a-z][A-Za-z0-9]*$/);
    }
  });

  it('carries STAT EFFECTS ONLY, on whitelisted paths — so HOOK_REGISTRY stays empty', () => {
    for (const def of Object.values(BOON_CATALOG)) {
      expect(def.effects.length).toBeGreaterThan(0);
      for (const e of def.effects) {
        // No slotFill / slotReplace / behavior in the dummy set (amendments
        // 29/30: the boost stays bespoke and no hook may be registered).
        expect(e.kind).toBe('stat');
        expect(BOON_STAT_PATHS as readonly string[]).toContain((e as BoonStatEffect).path);
      }
    }
  });

  it('every entry resolves through resolveBoons and folds into real stats', () => {
    const base = effectiveStats(TB, zeroUpgrades());
    for (const id of Object.keys(BOON_CATALOG)) {
      const defs = resolveBoons([id]);
      expect(defs).toHaveLength(1);
      const folded = effectiveStats(TB, zeroUpgrades(), defs);
      // A stat boon must MOVE something (a no-op entry would be a dead card).
      expect(flatten(folded)).not.toEqual(flatten(base));
    }
  });

  it('is deep-frozen: no def can be smuggled in at runtime', () => {
    expect(Object.isFrozen(BOON_CATALOG)).toBe(true);
    expect(() => {
      (BOON_CATALOG as Record<string, unknown>).injected = STAT_BOON;
    }).toThrow(TypeError);
    for (const def of Object.values(BOON_CATALOG)) expect(Object.isFrozen(def)).toBe(true);
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

  it('Object.prototype keys are NOT boons: a junk wire id can never resolve to an inherited property', () => {
    // Without the own-property gate `catalog['constructor']` answers
    // Object.prototype.constructor — not undefined, no `effects` — and any
    // downstream effect iteration throws on a purely wire-supplied id.
    const proto = ['constructor', 'toString', 'hasOwnProperty', '__proto__', 'valueOf'];
    expect(resolveBoons(proto, TEST_CATALOG)).toBe(NO_BOONS);
    expect(resolveBoons(proto)).toBe(NO_BOONS); // production catalog too
    expect(() => {
      for (const d of resolveBoons(proto, TEST_CATALOG)) void d.effects.length;
    }).not.toThrow();
    // And a prototype key mixed into a real list drops out, order preserved.
    expect(resolveBoons(['constructor', 'surgeEngines'], TEST_CATALOG)).toEqual([STAT_BOON]);
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

  it('gun.maxAmmo is NOT on the whitelist: the single-shot gun pool stays pinned', () => {
    // effectiveStats pins gun.maxAmmo to CONFIG.gun.maxAmmo (1) — the universal
    // standard gun is single-shot, its pool presented as a pure cooldown (Eric
    // ruling 2026-07-21). No catalog datum may unpin it.
    expect(BOON_STAT_PATHS).not.toContain('gun.maxAmmo');
    const rogue = {
      id: 'rogue',
      category: 'test',
      effects: [{ kind: 'stat', path: 'gun.maxAmmo', add: 5 }],
    } as unknown as BoonDef;
    expect(effectiveStats(TB, zeroUpgrades(), [rogue]).gun.maxAmmo).toBe(CONFIG.gun.maxAmmo);
  });

  it('a folded value that is not a POSITIVE finite number is skipped per-assignment (fail-closed sanity)', () => {
    const base = effectiveStats(TB, zeroUpgrades());
    const cases: BoonStatEffect[] = [
      { kind: 'stat', path: 'maxHp', mult: 0 }, // zeroing a stat is invalid data
      { kind: 'stat', path: 'maxHp', add: NaN },
      { kind: 'stat', path: 'maxHp', mult: NaN },
      { kind: 'stat', path: 'maxHp', add: Infinity },
      { kind: 'stat', path: 'maxHp', mult: Infinity },
      { kind: 'stat', path: 'maxHp', add: -(TB.hp + 1) }, // drives the result negative
    ];
    for (const e of cases) {
      expect(effectiveStats(TB, zeroUpgrades(), [def('bad', e)])).toEqual(base);
    }
  });

  it('a NaN/zero kinematics fold cannot poison the stats tree (the desync shape that matters)', () => {
    const base = effectiveStats(TB, zeroUpgrades());
    expect(effectiveStats(TB, zeroUpgrades(), [def('nanSpeed', { kind: 'stat', path: 'kinematics.maxSpeed', mult: NaN })]))
      .toEqual(base);
    // sweepRpm 0 would make the derived sweepPeriodMs Infinity — skipped instead.
    const zeroRpm = effectiveStats(TB, zeroUpgrades(), [def('stopSweep', { kind: 'stat', path: 'sweepRpm', mult: 0 })]);
    expect(zeroRpm.sweepRpm).toBe(base.sweepRpm);
    expect(Number.isFinite(zeroRpm.sweepPeriodMs)).toBe(true);
    expect(zeroRpm.sweepPeriodMs).toBe(base.sweepPeriodMs);
  });

  it('the skip is PER ASSIGNMENT: a valid effect after an invalid one still applies', () => {
    const s = effectiveStats(TB, zeroUpgrades(), [
      def('mixed', { kind: 'stat', path: 'maxHp', mult: NaN }, { kind: 'stat', path: 'maxHp', add: 25 }),
    ]);
    expect(s.maxHp).toBe(TB.hp + 25);
  });

  it('the sweepRpm CEILING is re-applied over the boon fold (boon data may not exceed maxRpm)', () => {
    const maxRpm = CONFIG.upgrades.sweepSpeed.maxRpm;
    const s = effectiveStats(TB, zeroUpgrades(), [def('overclock', { kind: 'stat', path: 'sweepRpm', add: 1000 })]);
    expect(s.sweepRpm).toBe(maxRpm);
    expect(s.sweepPeriodMs).toBe(60000 / maxRpm);
    // A mult over the ceiling clamps identically, and legacy stacks + a boon
    // still cannot cross it.
    const upg = zeroUpgrades();
    upg[UPGRADE_IDS.indexOf('sweepSpeed')] = 5; // already at the cap
    const stacked = effectiveStats(TB, upg, [def('overclock2', { kind: 'stat', path: 'sweepRpm', mult: 10 })]);
    expect(stacked.sweepRpm).toBe(maxRpm);
    expect(stacked.sweepPeriodMs).toBe(60000 / maxRpm);
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
    const loadout = loadoutFor('battleship', stats); // [gun, cannon, starShells, empty] — no torpedo fitted
    expect(loadout[SLOT_EXTRA].equipmentId).toBeNull();
    applySlotEffect(loadout, FILL_BOON.effects[0], stats);
    expect(loadout[SLOT_EXTRA].equipmentId).toBe('torpedo');
    expect(loadout[SLOT_EXTRA].state).toEqual({ n: equipmentMaxAmmo(stats, 'torpedo'), reloadMsLeft: 0 });
  });

  it('slotFill against an OCCUPIED extra slot is a silent no-op — existing state untouched', () => {
    const loadout = loadoutFor('battleship', stats); // no torpedo fitted: the first fill lands
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

  it('slotReplace with `from === to` is a DEGENERATE no-op — never a free instant reload', () => {
    const loadout = loadoutFor('torpedoBoat', stats); // [gun, torpedo, speedBoost, empty]
    loadout[1].state!.n = 0;
    loadout[1].state!.reloadMsLeft = 900; // mid-reload, empty tubes
    const stateRef = loadout[1].state;
    applySlotEffect(loadout, { kind: 'slotReplace', from: 'torpedo', to: 'torpedo' }, stats);
    expect(loadout[1].equipmentId).toBe('torpedo');
    expect(loadout[1].state).toBe(stateRef); // same object — no refit
    expect(loadout[1].state).toEqual({ n: 0, reloadMsLeft: 900 }); // NOT a fresh full pool
  });

  it('slotFill of equipment ALREADY fitted in another slot is a no-op (id-addressing stays unambiguous)', () => {
    const loadout = loadoutFor('torpedoBoat', stats); // torpedo already in slot 1
    applySlotEffect(loadout, { kind: 'slotFill', equipmentId: 'torpedo' }, stats);
    expect(loadout.map((s) => s.equipmentId)).toEqual(['gun', 'torpedo', 'speedBoost', null]);
    expect(loadout[SLOT_EXTRA].state).toBeNull();
    // Same for the gun (slot 0) and the hull's special.
    applySlotEffect(loadout, { kind: 'slotFill', equipmentId: 'gun' }, stats);
    applySlotEffect(loadout, { kind: 'slotFill', equipmentId: 'speedBoost' }, stats);
    expect(loadout[SLOT_EXTRA].equipmentId).toBeNull();
    // An UNfitted id still fills normally (the guard is duplicate-only).
    applySlotEffect(loadout, { kind: 'slotFill', equipmentId: 'mine' }, stats);
    expect(loadout[SLOT_EXTRA].equipmentId).toBe('mine');
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
