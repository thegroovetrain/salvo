// Boon effect engine (Story 2.5) + Boon Catalog v1 (Story 2.8). The 2.7-era
// dummy-set pins FLIPPED DELIBERATELY to the ratified v1 catalog shape
// (amendment 42, thinned by the 2026-08-04 global-cooldown ruling): 36 card
// lines across 9 categories, rarity/copies as
// physical scarcity, 4 symmetric exclusive doctrine pairs, slotFill-only
// acquisitions, healOnGrant on shipHull alone — all validated by the new
// authoring-time validateBoonDef/validateCatalog (closing the 2.5 ledger
// entry). The engine laws (two homes + hooks, fail-closed resolve, the
// server-incremental vs client-replayed parity property) carry forward on the
// new effectiveStats(cls, boons) signature.

import { describe, it, expect } from 'vitest';
import {
  BOON_CATALOG,
  BOON_STAT_PATHS,
  CONFIG,
  DOCTRINE_MODES,
  EQUIPMENT_CATEGORY,
  NO_BOONS,
  SLOT_EXTRA,
  UNIVERSAL_CATEGORIES,
  applyBoonStats,
  applySlotEffect,
  boonBehaviors,
  boonStackCount,
  effectiveStats,
  equipmentMaxAmmo,
  isAcquisitionDef,
  loadoutFor,
  mulberry32,
  resolveBoons,
  slotsWithBoons,
  validateBoonDef,
  validateCatalog,
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

const def = (id: string, ...effects: BoonEffect[]): BoonDef => ({
  id,
  category: 'test',
  rarity: 'common',
  copies: 5,
  effects,
});

// The local test boons — one per effect kind, plus combos. NEVER registered
// in the production catalog: they resolve only through TEST_CATALOG below.
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

/** Flatten an EffectiveStats tree into dotted-path -> scalar entries. */
function flatten(stats: EffectiveStats): Map<string, number | string> {
  const out = new Map<string, number | string>();
  const walk = (node: Record<string, unknown>, prefix: string): void => {
    for (const [key, value] of Object.entries(node)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (typeof value === 'number' || typeof value === 'string') out.set(path, value);
      else walk(value as Record<string, unknown>, path);
    }
  };
  walk(stats as unknown as Record<string, unknown>, '');
  return out;
}

// ---------------------------------------------------------------------------
// Boon Catalog v1 — the ratified content pins (amendment 42).
// ---------------------------------------------------------------------------

const ALL_DEFS = Object.values(BOON_CATALOG);

/** The ratified rarity/copies table, every one of the 28 wave-1 lines
 *  (Story 7-5). Seven lines were DELETED here — `gunDamage`, `torpedoDamage`,
 *  `torpedoCommand`, `mineDamage`, `mineMax`, `starRadius`, `boostMax` — two
 *  are NEW (`boostDuration`/`boostSpeed`, the old `boostMax` split in half),
 *  and every doctrine card except the cannon pair dropped from `exclusive` to
 *  `rare` because its verb now STACKS instead of excluding. */
const SCARCITY: Record<string, { rarity: string; copies: number }> = {
  gunBarrel: { rarity: 'rare', copies: 2 },
  gunTurret: { rarity: 'rare', copies: 1 },
  cannonDamage: { rarity: 'common', copies: 5 },
  cannonArcing: { rarity: 'exclusive', copies: 1 }, // the LAST exclusive pair
  cannonAp: { rarity: 'exclusive', copies: 1 },
  torpedoSpeed: { rarity: 'common', copies: 4 }, // the ratified ×4 ladder (60 → 80)
  torpedoTube: { rarity: 'rare', copies: 1 },
  torpedoHoming: { rarity: 'rare', copies: 1 },
  mineBlast: { rarity: 'common', copies: 4 },
  mineSelfPropelled: { rarity: 'rare', copies: 1 },
  minePropFouling: { rarity: 'rare', copies: 1 },
  boostDuration: { rarity: 'common', copies: 4 },
  boostSpeed: { rarity: 'common', copies: 2 },
  starDuration: { rarity: 'common', copies: 4 },
  starIncendiary: { rarity: 'rare', copies: 1 }, // PHOSPHOR SHELLS — display rename, id kept
  starDazzle: { rarity: 'rare', copies: 1 },
  decoyDuration: { rarity: 'common', copies: 5 },
  intelRange: { rarity: 'common', copies: 4 },
  intelSweep: { rarity: 'common', copies: 5 },
  shipSpeed: { rarity: 'common', copies: 4 },
  shipHull: { rarity: 'common', copies: 4 },
  shipCooldown: { rarity: 'common', copies: 5 }, // THE one global cooldown line, ×5 = 50% cap (Eric 2026-08-04)
  acquireTorpedo: { rarity: 'rare', copies: 1 },
  acquireMine: { rarity: 'rare', copies: 1 },
  acquireStarShells: { rarity: 'rare', copies: 1 },
  acquireCannon: { rarity: 'rare', copies: 1 },
  acquireDecoy: { rarity: 'rare', copies: 1 },
  acquireBoost: { rarity: 'rare', copies: 1 },
};

describe('BOON_CATALOG v1 — the ratified content shape (amendment 42)', () => {
  it('ships exactly the 28 card lines of the scarcity table', () => {
    expect(Object.keys(BOON_CATALOG).sort()).toEqual(Object.keys(SCARCITY).sort());
    // 36 -> 35 (intel merge) -> 34 (cannonBlast deleted) -> 33 (mine ring cards
    // merged) -> 28 (Story 7-5 wave 1: 7 deleted, 2 added).
    expect(ALL_DEFS).toHaveLength(28);
  });

  it('spans exactly the 9 categories', () => {
    expect(new Set(ALL_DEFS.map((d) => d.category))).toEqual(
      new Set(['guns', 'cannon', 'torpedoes', 'mines', 'speedBoost', 'starShells', 'decoyBuoy', 'intel', 'ship']),
    );
  });

  it('every line carries its ratified rarity and copy count', () => {
    for (const [id, expected] of Object.entries(SCARCITY)) {
      const d = BOON_CATALOG[id];
      expect({ rarity: d.rarity, copies: d.copies }, id).toEqual(expected);
    }
  });

  it('is keyed by its own id, with camelCase ids (the registry-id convention)', () => {
    for (const [key, d] of Object.entries(BOON_CATALOG)) {
      expect(d.id).toBe(key);
      expect(key).toMatch(/^[a-z][A-Za-z0-9]*$/);
    }
  });

  it('the production catalog VALIDATES clean (validateCatalog — the 2.5 ledger entry closed)', () => {
    expect(validateCatalog(BOON_CATALOG)).toEqual([]);
    expect(validateCatalog()).toEqual([]); // default arg = the production catalog
  });

  // NARROWED PIN (Story 7-5 wave 1): there were FOUR exclusive pairs and there
  // is now exactly ONE. Three pairs stopped contradicting each other — their
  // verbs stack — so they dropped `exclusiveWith` and became plain rares. The
  // cannon pair genuinely contradicts (AP hardcodes burstRadius 0 while arcing
  // bursts on click), so it keeps the mechanism alive until wave 2 replaces the
  // weapon. The pair SHAPE is pinned exactly as before; only the count moved.
  it('the ONE surviving exclusive pair is symmetric, same-weapon doctrine cards', () => {
    const pairs = [['cannonArcing', 'cannonAp', 'cannon']] as const;
    const exclusives = ALL_DEFS.filter((d) => d.rarity === 'exclusive');
    expect(exclusives.map((d) => d.id).sort()).toEqual(['cannonAp', 'cannonArcing']);
    for (const [a, b, weapon] of pairs) {
      expect(BOON_CATALOG[a].exclusiveWith).toBe(b);
      expect(BOON_CATALOG[b].exclusiveWith).toBe(a);
      for (const id of [a, b]) {
        const doctrines = BOON_CATALOG[id].effects.filter((e) => e.kind === 'doctrine');
        expect(doctrines, id).toHaveLength(1);
        expect(doctrines[0].kind === 'doctrine' && doctrines[0].weapon, id).toBe(weapon);
      }
    }
  });

  // RETIRED HALF / SURVIVING HALF. `doctrine effects live ONLY on exclusives`
  // is GONE, deliberately: rarity no longer says anything about whether an
  // effect is a doctrine, because a stackable verb is an ordinary `rare` card.
  // What survives is the exclusivity mechanism's own symmetry — an `exclusive`
  // still requires a rival and a rival link still requires `exclusive` rarity.
  it('exclusiveWith and the exclusive tier still imply each other (the mechanism survives)', () => {
    for (const d of ALL_DEFS) {
      if (d.exclusiveWith !== undefined) expect(d.rarity, d.id).toBe('exclusive');
      if (d.rarity === 'exclusive') {
        expect(d.effects.some((e) => e.kind === 'doctrine'), d.id).toBe(true);
        expect(d.exclusiveWith, d.id).toBeDefined();
      }
    }
    // The verb cards carry a doctrine at `rare` rarity and NO rival at all.
    for (const id of ['torpedoHoming', 'minePropFouling', 'mineSelfPropelled', 'starIncendiary', 'starDazzle']) {
      expect(BOON_CATALOG[id].rarity, id).toBe('rare');
      expect(BOON_CATALOG[id].exclusiveWith, id).toBeUndefined();
      expect(BOON_CATALOG[id].effects.some((e) => e.kind === 'doctrine'), id).toBe(true);
    }
  });

  it('the 6 acquisitions are rare ×1, slotFill-ONLY, in their equipment category', () => {
    const acquisitions = ALL_DEFS.filter((d) => isAcquisitionDef(d));
    expect(acquisitions.map((d) => d.id).sort()).toEqual([
      'acquireBoost',
      'acquireCannon',
      'acquireDecoy',
      'acquireMine',
      'acquireStarShells',
      'acquireTorpedo',
    ]);
    for (const d of acquisitions) {
      expect(d.rarity, d.id).toBe('rare');
      expect(d.copies, d.id).toBe(1);
      expect(d.effects, d.id).toHaveLength(1);
      const e = d.effects[0];
      expect(e.kind, d.id).toBe('slotFill');
      if (e.kind === 'slotFill') expect(d.category, d.id).toBe(EQUIPMENT_CATEGORY[e.equipmentId]);
    }
    // Every acquirable equipment except the universal gun has exactly one card.
    const targets = acquisitions.map((d) => (d.effects[0].kind === 'slotFill' ? d.effects[0].equipmentId : ''));
    expect(targets.sort()).toEqual(['cannon', 'decoyBuoy', 'mine', 'speedBoost', 'starShells', 'torpedo']);
  });

  it('healOnGrant rides shipHull and NOTHING else', () => {
    for (const d of ALL_DEFS) {
      expect(d.healOnGrant === true, d.id).toBe(d.id === 'shipHull');
    }
  });

  it('every stat effect addresses a whitelisted path (and the whitelist has no derived/mode paths)', () => {
    for (const d of ALL_DEFS) {
      for (const e of d.effects) {
        if (e.kind === 'stat') expect(BOON_STAT_PATHS as readonly string[], d.id).toContain(e.path);
      }
    }
    expect(BOON_STAT_PATHS).not.toContain('sweepPeriodMs'); // derived — never addressable
    // No doctrine field is stat-addressable: not the cannon's surviving `mode`
    // enum, and not any of the five verb booleans that replaced the other three.
    const doctrineFields = ['mode', 'homing', 'propFouling', 'selfPropelled', 'phosphor', 'dazzle'];
    for (const path of BOON_STAT_PATHS) {
      for (const f of doctrineFields) expect(path.endsWith(`.${f}`), path).toBe(false);
    }
  });

  // The established shape (the cycle-93 FRAGMENTATION CASING precedent), now
  // load-bearing for SEVEN paths rather than the seven reloads alone: a stat
  // whose card was deleted keeps its whitelisted path so a future line can land
  // without touching the whitelist. Only a stat that became DERIVED leaves.
  it('the deleted lines\' stat paths STAY whitelisted, unwritten (Story 7-5 wave 1)', () => {
    const orphaned = ['gun.damage', 'torpedo.damage', 'mine.damage', 'mine.maxLive', 'starShells.litRadius', 'boost.maxAmmo', 'kinematics.reverseSpeed'];
    for (const path of orphaned) {
      expect(BOON_STAT_PATHS as readonly string[], path).toContain(path);
      const writers = ALL_DEFS.filter((d) => d.effects.some((e) => e.kind === 'stat' && e.path === path));
      expect(writers.map((d) => d.id), path).toEqual([]);
    }
    // ...while the DERIVED ones are structurally unaddressable, as before.
    expect(BOON_STAT_PATHS).not.toContain('sightRange');
    expect(BOON_STAT_PATHS).not.toContain('mine.triggerRadius');
  });

  it('FLIPPED PIN: gun.maxAmmo IS whitelisted now (the single-shot pin retired knowingly)', () => {
    expect(BOON_STAT_PATHS).toContain('gun.maxAmmo');
    expect(BOON_STAT_PATHS).toContain('gun.barrels');
    expect(BOON_STAT_PATHS).toContain('gun.damage'); // damage promoted onto EffectiveStats
  });

  it('WHITELIST SHRINK: gun/cannon/starShells rangeU are OFF the whitelist (derived from radarRange, brainstorm 2026-07-30)', () => {
    expect(BOON_STAT_PATHS).not.toContain('gun.rangeU');
    expect(BOON_STAT_PATHS).not.toContain('cannon.rangeU');
    expect(BOON_STAT_PATHS).not.toContain('starShells.rangeU');
  });

  it('the universal categories are intel + ship + guns; equipment categories map 1:1', () => {
    expect(UNIVERSAL_CATEGORIES).toEqual(['intel', 'ship', 'guns']);
    expect(EQUIPMENT_CATEGORY).toEqual({
      gun: 'guns',
      torpedo: 'torpedoes',
      mine: 'mines',
      speedBoost: 'speedBoost',
      cannon: 'cannon',
      starShells: 'starShells',
      decoyBuoy: 'decoyBuoy',
    });
    // The verb vocabulary (Story 7-5 wave 1). On torpedo/mine/starShells each
    // entry is now the NAME OF A BOOLEAN FIELD on EffectiveStats; on the cannon
    // it is still a value of the `mode` enum. COMMAND DETONATION is deleted and
    // 'incendiary' was renamed to the verb 'phosphor'.
    expect(DOCTRINE_MODES).toEqual({
      cannon: ['arcing', 'ap'],
      torpedo: ['homing'],
      mine: ['propFouling', 'selfPropelled'],
      starShells: ['phosphor', 'dazzle'],
    });
  });

  it('is deep-frozen: no def can be smuggled in at runtime', () => {
    expect(Object.isFrozen(BOON_CATALOG)).toBe(true);
    expect(() => {
      (BOON_CATALOG as Record<string, unknown>).injected = STAT_BOON;
    }).toThrow(TypeError);
    for (const d of ALL_DEFS) expect(Object.isFrozen(d)).toBe(true);
  });

  it('NO_BOONS is the frozen shared zero-boon identity', () => {
    expect(NO_BOONS).toEqual([]);
    expect(Object.isFrozen(NO_BOONS)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateBoonDef — the authoring-time gate rejects malformed defs.
// ---------------------------------------------------------------------------

describe('validateBoonDef — authoring-time rejection cases', () => {
  // `gunDamage` carried this role until Story 7-5 wave 1 deleted it; any plain
  // additive common line does the job. `intelSweep` moves `sweepRpm`, not
  // `maxHp`, which is what the healOnGrant rejection case below needs.
  const base = BOON_CATALOG.intelSweep;

  it('accepts every production def against the production catalog', () => {
    for (const d of ALL_DEFS) expect(validateBoonDef(d, BOON_CATALOG), d.id).toEqual([]);
  });

  it('rejects an off-whitelist stat path', () => {
    const bad = { ...base, effects: [{ kind: 'stat', path: 'sweepPeriodMs', add: 1 }] } as unknown as BoonDef;
    expect(validateBoonDef(bad, BOON_CATALOG)).not.toEqual([]);
  });

  it('rejects non-finite / non-positive stat values and moves-nothing effects', () => {
    const cases = [
      { kind: 'stat', path: 'maxHp', mult: 0 },
      { kind: 'stat', path: 'maxHp', mult: NaN },
      { kind: 'stat', path: 'maxHp', add: Infinity },
      { kind: 'stat', path: 'maxHp', add: 0 },
      { kind: 'stat', path: 'maxHp' },
    ];
    for (const e of cases) {
      const bad = { ...base, effects: [e] } as unknown as BoonDef;
      expect(validateBoonDef(bad, BOON_CATALOG), JSON.stringify(e)).not.toEqual([]);
    }
  });

  it('rejects empty effects, non-integer/zero copies, and multi-copy exclusives', () => {
    expect(validateBoonDef({ ...base, effects: [] }, BOON_CATALOG)).not.toEqual([]);
    expect(validateBoonDef({ ...base, copies: 0 }, BOON_CATALOG)).not.toEqual([]);
    expect(validateBoonDef({ ...base, copies: 1.5 }, BOON_CATALOG)).not.toEqual([]);
    expect(validateBoonDef({ ...BOON_CATALOG.cannonArcing, copies: 2 }, BOON_CATALOG)).not.toEqual([]);
  });

  it('rejects an asymmetric or wrong-weapon exclusive link', () => {
    // Points at torpedoHoming, which points back at torpedoCommand — asymmetric.
    expect(validateBoonDef({ ...BOON_CATALOG.cannonArcing, exclusiveWith: 'torpedoHoming' }, BOON_CATALOG)).not.toEqual([]);
    // Rival missing from the catalog entirely.
    expect(validateBoonDef({ ...BOON_CATALOG.cannonArcing, exclusiveWith: 'ghost' }, BOON_CATALOG)).not.toEqual([]);
    // An exclusive without a rival at all.
    const lonely = { ...BOON_CATALOG.cannonArcing } as { exclusiveWith?: string };
    delete lonely.exclusiveWith;
    expect(validateBoonDef(lonely as BoonDef, BOON_CATALOG)).not.toEqual([]);
  });

  // RETIRED CLAUSE, named rather than quietly dropped: this test used to also
  // assert that a doctrine effect at non-exclusive rarity is rejected. Story
  // 7-5 wave 1 makes that the NORMAL case — five catalog lines are `rare`
  // doctrine cards — so the clause is gone. The unknown-weapon and
  // unknown-verb rejections, which are the actual fail-closed gate, stand.
  it('rejects unknown doctrine weapons and unknown verbs', () => {
    const badMode = { ...BOON_CATALOG.cannonArcing, effects: [{ kind: 'doctrine', weapon: 'cannon', mode: 'nuclear' }] } as unknown as BoonDef;
    expect(validateBoonDef(badMode, BOON_CATALOG)).not.toEqual([]);
    const badWeapon = { ...BOON_CATALOG.cannonArcing, effects: [{ kind: 'doctrine', weapon: 'gun', mode: 'arcing' }] } as unknown as BoonDef;
    expect(validateBoonDef(badWeapon, BOON_CATALOG)).not.toEqual([]);
    // The RETIRED verb names are rejected exactly like any other unknown.
    const retired = { ...BOON_CATALOG.starDazzle, effects: [{ kind: 'doctrine', weapon: 'starShells', mode: 'incendiary' }] } as unknown as BoonDef;
    expect(validateBoonDef(retired, BOON_CATALOG)).not.toEqual([]);
    const deleted = { ...BOON_CATALOG.torpedoHoming, effects: [{ kind: 'doctrine', weapon: 'torpedo', mode: 'command' }] } as unknown as BoonDef;
    expect(validateBoonDef(deleted, BOON_CATALOG)).not.toEqual([]);
    // ...and a `rare` doctrine card is now perfectly legal.
    expect(validateBoonDef(BOON_CATALOG.starDazzle, BOON_CATALOG)).toEqual([]);
  });

  it('rejects slotFill/slotReplace of unknown equipment and healOnGrant without a heal', () => {
    const badFill = { ...base, effects: [{ kind: 'slotFill', equipmentId: 'railgun' }] } as unknown as BoonDef;
    expect(validateBoonDef(badFill, BOON_CATALOG)).not.toEqual([]);
    const badHeal = { ...base, healOnGrant: true } as BoonDef; // intelSweep moves sweepRpm, not maxHp
    expect(validateBoonDef(badHeal, BOON_CATALOG)).not.toEqual([]);
  });

  it('validateCatalog flags a key/id mismatch', () => {
    const skewed: BoonCatalog = { wrongKey: BOON_CATALOG.intelSweep };
    expect(validateCatalog(skewed)).not.toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// resolveBoons + boonStackCount — fail-closed id -> def, occurrence stacking.
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

  it('REPEATED ids resolve each time — stacking rides occurrence (the deck copy law)', () => {
    expect(resolveBoons(['surgeEngines', 'surgeEngines'], TEST_CATALOG)).toEqual([STAT_BOON, STAT_BOON]);
    const stacked = resolveBoons(['torpedoSpeed', 'torpedoSpeed', 'torpedoSpeed']);
    expect(stacked).toHaveLength(3);
    expect(effectiveStats(TB, stacked).torpedo.speed).toBe(CONFIG.torpedo.speed + 15);
  });

  it('boonStackCount counts occurrences over ids AND defs', () => {
    expect(boonStackCount(['torpedoSpeed', 'shipHull', 'torpedoSpeed'], 'torpedoSpeed')).toBe(2);
    expect(boonStackCount(resolveBoons(['torpedoSpeed', 'shipHull', 'torpedoSpeed']), 'torpedoSpeed')).toBe(2);
    expect(boonStackCount([], 'torpedoSpeed')).toBe(0);
    expect(boonStackCount(['shipHull'], 'torpedoSpeed')).toBe(0);
  });

  it('the seven DELETED reload ids resolve to nothing and move no stat (fail-closed, Eric 2026-08-04)', () => {
    const dead = ['gunReload', 'cannonReload', 'torpedoReload', 'mineReload', 'boostReload', 'starReload', 'decoyReload'];
    for (const id of dead) {
      expect(BOON_CATALOG[id], id).toBeUndefined();
      expect(resolveBoons([id]), id).toBe(NO_BOONS); // the shared empty identity
      expect(effectiveStats(TB, resolveBoons([id])), id).toEqual(effectiveStats(TB));
    }
    expect(resolveBoons(dead)).toBe(NO_BOONS);
    // Mixed with a live id: the survivor still resolves, the corpses drop.
    expect(resolveBoons(['gunReload', 'shipCooldown'])).toEqual([BOON_CATALOG.shipCooldown]);
  });

  it('Object.prototype keys are NOT boons: a junk wire id can never resolve to an inherited property', () => {
    const proto = ['constructor', 'toString', 'hasOwnProperty', '__proto__', 'valueOf'];
    expect(resolveBoons(proto, TEST_CATALOG)).toBe(NO_BOONS);
    expect(resolveBoons(proto)).toBe(NO_BOONS); // production catalog too
    expect(resolveBoons(['constructor', 'surgeEngines'], TEST_CATALOG)).toEqual([STAT_BOON]);
  });
});

// ---------------------------------------------------------------------------
// Home 1: stat effects — only through effectiveStats, list order.
// ---------------------------------------------------------------------------

describe('stat effects — home 1 (effectiveStats), list order, fail-closed folds', () => {
  it('a mult stat boon moves EXACTLY its targeted path (flatten diff), nothing else', () => {
    const identity = flatten(effectiveStats(TB));
    const mooned = flatten(effectiveStats(TB, [STAT_BOON]));
    expect([...mooned.keys()]).toEqual([...identity.keys()]); // same shape
    const changed = [...mooned.keys()].filter((k) => mooned.get(k) !== identity.get(k));
    expect(changed).toEqual(['kinematics.maxSpeed']);
    expect(mooned.get('kinematics.maxSpeed')).toBeCloseTo(TB.kinematics.maxSpeed * 1.1, 9);
  });

  it('a sweepRpm boon re-derives sweepPeriodMs (the derived pair stays coherent)', () => {
    const rpmBoon = def('r', { kind: 'stat', path: 'sweepRpm', add: 5 });
    const s = effectiveStats(TB, [rpmBoon]);
    expect(s.sweepRpm).toBe(CONFIG.vision.sweepRpm + 5);
    expect(s.sweepPeriodMs).toBeCloseTo(60000 / s.sweepRpm, 9);
  });

  it('the sweepRpm CEILING is CONFIG.vision.sweepRpmMax, re-applied over the boon fold', () => {
    const s = effectiveStats(TB, [def('overclock', { kind: 'stat', path: 'sweepRpm', add: 1000 })]);
    expect(s.sweepRpm).toBe(CONFIG.vision.sweepRpmMax);
    expect(s.sweepPeriodMs).toBe(60000 / CONFIG.vision.sweepRpmMax);
  });

  it('an off-whitelist path in an untyped def is a fail-closed no-op (runtime guard)', () => {
    const rogue = {
      ...def('rogue'),
      effects: [{ kind: 'stat', path: 'nope.nothere', mult: 99 }],
    } as unknown as BoonDef;
    expect(effectiveStats(TB, [rogue])).toEqual(effectiveStats(TB));
  });

  it('a folded value that is not a POSITIVE finite number is skipped per-assignment', () => {
    const base = effectiveStats(TB);
    const cases: BoonStatEffect[] = [
      { kind: 'stat', path: 'maxHp', mult: 0 },
      { kind: 'stat', path: 'maxHp', add: NaN },
      { kind: 'stat', path: 'maxHp', mult: NaN },
      { kind: 'stat', path: 'maxHp', add: Infinity },
      { kind: 'stat', path: 'maxHp', mult: Infinity },
      { kind: 'stat', path: 'maxHp', add: -(TB.hp + 1) },
    ];
    for (const e of cases) {
      expect(effectiveStats(TB, [def('bad', e)])).toEqual(base);
    }
    // Per-assignment: a valid effect after an invalid one still applies.
    const s = effectiveStats(TB, [
      def('mixed', { kind: 'stat', path: 'maxHp', mult: NaN }, { kind: 'stat', path: 'maxHp', add: 25 }),
    ]);
    expect(s.maxHp).toBe(TB.hp + 25);
  });
});

// ---------------------------------------------------------------------------
// Home 2: slot effects — the ONE LoadoutSlot[] structure, one shared function.
// ---------------------------------------------------------------------------

describe('slot effects — home 2 (applySlotEffect over the one LoadoutSlot[])', () => {
  const stats = effectiveStats(TB);

  it('slotFill fills the EMPTY extra slot with a fresh full pool at current stats', () => {
    const loadout = loadoutFor('battleship', stats); // no torpedo fitted
    expect(loadout[SLOT_EXTRA].equipmentId).toBeNull();
    applySlotEffect(loadout, FILL_BOON.effects[0], stats);
    expect(loadout[SLOT_EXTRA].equipmentId).toBe('torpedo');
    expect(loadout[SLOT_EXTRA].state).toEqual({ n: equipmentMaxAmmo(stats, 'torpedo'), reloadMsLeft: 0 });
  });

  it('slotFill against an OCCUPIED extra slot is a silent no-op — existing state untouched', () => {
    const loadout = loadoutFor('battleship', stats);
    applySlotEffect(loadout, FILL_BOON.effects[0], stats);
    const occupied = loadout[SLOT_EXTRA];
    occupied.state!.n = 1;
    occupied.state!.reloadMsLeft = 777;
    const stateRef = occupied.state;
    applySlotEffect(loadout, { kind: 'slotFill', equipmentId: 'mine' }, stats);
    expect(occupied.equipmentId).toBe('torpedo');
    expect(occupied.state).toBe(stateRef);
    expect(occupied.state).toEqual({ n: 1, reloadMsLeft: 777 });
  });

  it('slotReplace swaps the slot holding `from` to `to`; OTHER slots keep live ammo state', () => {
    const loadout = loadoutFor('torpedoBoat', stats); // [gun, torpedo, speedBoost, empty]
    loadout[0].state!.n = 0;
    loadout[0].state!.reloadMsLeft = 1500;
    applySlotEffect(loadout, REPLACE_BOON.effects[0], stats);
    expect(loadout[1].equipmentId).toBe('mine');
    expect(loadout[1].state).toEqual({ n: equipmentMaxAmmo(stats, 'mine'), reloadMsLeft: 0 });
    expect(loadout[0].state).toEqual({ n: 0, reloadMsLeft: 1500 });
  });

  it('slotReplace with `from` unfitted, or from === to, is a silent no-op', () => {
    const bsLoadout = loadoutFor('battleship', stats); // no torpedo fitted
    const before = bsLoadout.map((s) => ({ equipmentId: s.equipmentId, state: s.state ? { ...s.state } : null }));
    expect(() => applySlotEffect(bsLoadout, REPLACE_BOON.effects[0], stats)).not.toThrow();
    expect(bsLoadout.map((s) => ({ equipmentId: s.equipmentId, state: s.state ? { ...s.state } : null }))).toEqual(before);
    // Degenerate self-replace: never a free instant reload.
    const tbLoadout = loadoutFor('torpedoBoat', stats);
    tbLoadout[1].state!.n = 0;
    tbLoadout[1].state!.reloadMsLeft = 900;
    const stateRef = tbLoadout[1].state;
    applySlotEffect(tbLoadout, { kind: 'slotReplace', from: 'torpedo', to: 'torpedo' }, stats);
    expect(tbLoadout[1].state).toBe(stateRef);
    expect(tbLoadout[1].state).toEqual({ n: 0, reloadMsLeft: 900 });
  });

  it('slotFill of equipment ALREADY fitted is a no-op — PINNED production-unreachable (buildDeck excludes carried acquisitions)', () => {
    const loadout = loadoutFor('torpedoBoat', stats); // torpedo already in slot 1
    applySlotEffect(loadout, { kind: 'slotFill', equipmentId: 'torpedo' }, stats);
    expect(loadout.map((s) => s.equipmentId)).toEqual(['gun', 'torpedo', 'speedBoost', null]);
    expect(loadout[SLOT_EXTRA].state).toBeNull();
    // An UNfitted id still fills normally (the guard is duplicate-only).
    applySlotEffect(loadout, { kind: 'slotFill', equipmentId: 'mine' }, stats);
    expect(loadout[SLOT_EXTRA].equipmentId).toBe('mine');
  });

  it('stat, behavior AND doctrine effects are structural no-ops in the slot home', () => {
    const loadout = loadoutFor('torpedoBoat', stats);
    const slotRefs = [...loadout];
    const stateRefs = loadout.map((s) => s.state);
    applySlotEffect(loadout, STAT_BOON.effects[0], stats);
    applySlotEffect(loadout, BEHAVIOR_BOON.effects[0], stats);
    applySlotEffect(loadout, { kind: 'doctrine', weapon: 'torpedo', mode: 'homing' }, stats);
    expect(loadout.map((s) => s)).toEqual(slotRefs);
    loadout.forEach((s, i) => expect(s.state).toBe(stateRefs[i]));
  });
});

// ---------------------------------------------------------------------------
// The two-homes property (+ the doctrine third home).
// ---------------------------------------------------------------------------

describe('two homes — a boon may touch stats and slots, NOTHING else, each via its home', () => {
  it('a stat-only boon leaves the loadout REFERENCE-EQUAL through the slot path', () => {
    const stats = effectiveStats(TB, [STAT_BOON]);
    const base = loadoutFor('torpedoBoat', stats);
    const slotRefs = [...base];
    for (const e of STAT_BOON.effects) applySlotEffect(base, e, stats);
    base.forEach((s, i) => expect(s).toBe(slotRefs[i]));
  });

  it('a slot-only boon leaves effectiveStats output BYTE-IDENTICAL', () => {
    expect(effectiveStats(TB, [FILL_BOON])).toEqual(effectiveStats(TB));
    expect(effectiveStats(TB, [REPLACE_BOON])).toEqual(effectiveStats(TB));
    // The production acquisitions are slot-only: byte-identical stats.
    expect(effectiveStats(TB, resolveBoons(['acquireMine']))).toEqual(effectiveStats(TB));
  });

  it('a behavior-only boon touches NEITHER home (hooks are its only leg)', () => {
    expect(effectiveStats(TB, [BEHAVIOR_BOON])).toEqual(effectiveStats(TB));
  });

  it('boonBehaviors extracts exactly the behavior effects, in list order', () => {
    const defs = [STAT_BOON, BEHAVIOR_BOON, FILL_BOON, def('b2', { kind: 'behavior', hookId: 'x', params: {} })];
    expect(boonBehaviors(defs)).toEqual([
      { kind: 'behavior', hookId: 'stormRider', params: { bonus: 5 } },
      { kind: 'behavior', hookId: 'x', params: {} },
    ]);
    expect(boonBehaviors([])).toEqual([]);
  });

  it('applyBoonStats mutates ONLY the targeted scalar (+ the derived sweep pair) in place', () => {
    const stats = effectiveStats(TB);
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

  /** The server's incremental path, emulated faithfully (world.applyBoon's
   *  exact order: per applied boon, recompute stats over defs-so-far, then
   *  apply THAT def's effects to the live loadout). */
  function serverIncremental(cls: ShipClassId, defs: readonly BoonDef[]): LoadoutSlot[] {
    const applied: BoonDef[] = [];
    let stats = effectiveStats(CONFIG.shipClasses[cls]);
    const loadout = loadoutFor(cls, stats);
    for (const d of defs) {
      applied.push(d);
      stats = effectiveStats(CONFIG.shipClasses[cls], applied);
      for (const e of d.effects) applySlotEffect(loadout, e, stats);
    }
    return loadout;
  }

  it('server slot ids == client-derived slot ids after arbitrary boon sequences (seeded property)', () => {
    const rng = mulberry32(0xb00b5);
    const classes: ShipClassId[] = ['torpedoBoat', 'battleship', 'mineLayer'];
    for (let trial = 0; trial < 60; trial++) {
      const cls = rng.pick(classes);
      const n = rng.int(0, 5);
      const defs = Array.from({ length: n }, () => rng.pick(POOL));
      const server = serverIncremental(cls, defs).map((s) => s.equipmentId);
      const client = slotsWithBoons(cls, effectiveStats(CONFIG.shipClasses[cls], defs), defs).map(
        (s) => s.equipmentId,
      );
      expect(client).toEqual(server);
    }
  });

  it('slotsWithBoons at zero boons equals plain loadoutFor (byte-identical baseline)', () => {
    const stats = effectiveStats(TB);
    expect(slotsWithBoons('torpedoBoat', stats, [])).toEqual(loadoutFor('torpedoBoat', stats));
  });

  it('capacity-raise + acquisition compose: gunTurret pool 2 feeds a fresh acquisition fill', () => {
    const build = resolveBoons(['gunTurret', 'acquireMine']);
    const stats = effectiveStats(BS, build);
    const loadout = slotsWithBoons('battleship', stats, build);
    expect(loadout.map((s) => s.equipmentId)).toEqual(['gun', 'cannon', 'starShells', 'mine']);
    expect(loadout[0].state).toEqual({ n: 2, reloadMsLeft: 0 }); // AFT TURRET pool
    expect(loadout[SLOT_EXTRA].state).toEqual({ n: equipmentMaxAmmo(stats, 'mine'), reloadMsLeft: 0 });
  });
});
