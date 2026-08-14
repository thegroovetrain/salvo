// Boon engine server plumbing (Story 2.5; live since 2.7). Proves, against
// INJECTED test registries (the shipped HOOK_REGISTRY stays empty — amendment
// 29; the shipped BOON_CATALOG is the full 2.8 content, exercised in
// upgrades.test.ts — the injected catalog here keeps these pins
// content-independent), that: a behavior boon's kinematics hook executes in
// the REAL world tick (measurable position change vs an identical control
// world); applyBoon touches exactly the two homes on a live ShipRecord (stats
// only via effectiveStats, slots only in the one loadout — untouched slots
// keep live ammo/reload state, no event queued, no other ship field moves);
// redeployShip wipes boons while respawn preserves them (build + loadout);
// and the wire stays SELF-PRIVATE: boons ride `you` only, never a Contact or
// spectator frame.

import { describe, it, expect } from 'vitest';
import {
  isAfloat,
  CONFIG,
  SLOT_EXTRA,
  SLOT_GUN,
  effectiveStats,
  equipmentMaxAmmo,
  type BoonCatalog,
  type BoonDef,
  type HookRegistry,
  type ShipClassId,
} from '@salvo/shared';
import { World, type ShipRecord, type WorldOptions } from '../game/world.js';
import { buildFrame } from '../game/frames.js';

const DT = CONFIG.tick.simDtMs;

// --- The injected TEST registries (never the production rows) ---------------

/** A test kinematics hook: raises the forward cap by params.bonus (the boost
 *  shape, as a registered hook). Identity at bonus 0. */
const TEST_HOOKS: HookRegistry = {
  surge: {
    kind: 'kinematics',
    apply: (kin, p) => ((p.bonus ?? 0) === 0 ? kin : { ...kin, maxSpeed: kin.maxSpeed + (p.bonus ?? 0) }),
  },
};

const BEHAVIOR_BOON: BoonDef = {
  id: 'surgeProtocol',
  category: 'test',
  rarity: 'common',
  copies: 1,
  effects: [{ kind: 'behavior', hookId: 'surge', params: { bonus: 20 } }],
};
const STAT_BOON: BoonDef = {
  id: 'ironPlating',
  category: 'test',
  rarity: 'common',
  copies: 1,
  effects: [{ kind: 'stat', path: 'maxHp', add: 40 }],
};
const FILL_BOON: BoonDef = {
  id: 'bolterRack',
  category: 'test',
  rarity: 'common',
  copies: 1,
  effects: [{ kind: 'slotFill', equipmentId: 'mine' }],
};
const REPLACE_BOON: BoonDef = {
  id: 'longLance',
  category: 'test',
  rarity: 'common',
  copies: 1,
  effects: [{ kind: 'slotReplace', from: 'torpedo', to: 'cannon' }],
};

/** ONE boon carrying ALL FOUR effect kinds (the story's acceptance shape). */
const OMNI_BOON: BoonDef = {
  id: 'omni',
  category: 'test',
  rarity: 'common',
  copies: 1,
  effects: [
    { kind: 'stat', path: 'sightRange', mult: 1.25 },
    { kind: 'slotFill', equipmentId: 'decoyBuoy' },
    { kind: 'slotReplace', from: 'speedBoost', to: 'starShells' },
    { kind: 'behavior', hookId: 'surge', params: { bonus: 20 } },
  ],
};

/** Pool-cap movers: a raiser (+3 tubes) and, applied AFTER it, a shrinker
 *  (-2) — the only way to LOWER a cap below a live pool, since every shipped
 *  pool is 1. */
const WIDE_TUBES: BoonDef = {
  id: 'deepMagazine',
  category: 'test',
  rarity: 'common',
  copies: 1,
  effects: [{ kind: 'stat', path: 'torpedo.maxAmmo', add: 3 }],
};
const NARROW_TUBES: BoonDef = {
  id: 'crampedMagazine',
  category: 'test',
  rarity: 'common',
  copies: 1,
  effects: [{ kind: 'stat', path: 'torpedo.maxAmmo', add: -2 }],
};
/** A maxHp-LOWERING boon (the hp invariant's only trigger). */
const FRAIL_HULL: BoonDef = {
  id: 'strippedArmor',
  category: 'test',
  rarity: 'common',
  copies: 1,
  effects: [{ kind: 'stat', path: 'maxHp', mult: 0.5 }],
};

const TEST_CATALOG: BoonCatalog = {
  surgeProtocol: BEHAVIOR_BOON,
  ironPlating: STAT_BOON,
  bolterRack: FILL_BOON,
  longLance: REPLACE_BOON,
  omni: OMNI_BOON,
  deepMagazine: WIDE_TUBES,
  crampedMagazine: NARROW_TUBES,
  strippedArmor: FRAIL_HULL,
};

const OPTS: WorldOptions = { hookRegistry: TEST_HOOKS, boonCatalog: TEST_CATALOG };

function bareWorld(seed = 1, opts: WorldOptions = OPTS): World {
  const w = new World(seed, CONFIG.match.fillTo, CONFIG.zone, opts);
  w.map.islands.length = 0;
  return w;
}

function place(w: World, id: string, x: number, y: number, hull: ShipClassId = 'torpedoBoat'): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), false, hull);
  rec.state.x = x;
  rec.state.y = y;
  rec.state.heading = 0;
  rec.state.speed = 0;
  return rec;
}

/** Deep copy of a loadout's ammo state for byte-comparison. */
const ammoStates = (s: ShipRecord) => s.loadout.map((slot) => (slot.state ? { ...slot.state } : null));

// ---------------------------------------------------------------------------
// Real-tick hook execution.
// ---------------------------------------------------------------------------

describe('behavior boon — the kinematics hook executes in the REAL world tick', () => {
  it('a booned hull measurably outruns an identical control hull (injected registry, same seed)', () => {
    const w = bareWorld(7);
    const control = bareWorld(7);
    const a = place(w, 'a', 0, 0);
    const c = place(control, 'a', 0, 0);
    w.applyBoon(a, 'surgeProtocol');
    a.input.throttle = 1;
    c.input.throttle = 1;
    for (let i = 0; i < 200; i++) {
      w.step();
      control.step();
    }
    const bonus = 20;
    const base = CONFIG.shipClasses.torpedoBoat.kinematics.maxSpeed;
    expect(c.state.speed).toBeCloseTo(base, 6); // control capped at class max
    expect(a.state.speed).toBeCloseTo(base + bonus, 6); // hook raised the cap
    expect(a.state.x).toBeGreaterThan(c.state.x + 1); // measurable position change
  });

  it('an injected registry alone changes NOTHING for a boon-less hull (zero-boon identity)', () => {
    const w = bareWorld(7);
    const plain = bareWorld(7, {}); // production registries (both empty)
    const a = place(w, 'a', 0, 0);
    const b = place(plain, 'a', 0, 0);
    a.input.throttle = 1;
    b.input.throttle = 1;
    for (let i = 0; i < 40; i++) {
      w.step();
      plain.step();
    }
    expect(a.state).toEqual(b.state); // byte-identical tick
  });

  it('a behavior boon whose hookId is unknown to the registry is a silent per-tick no-op', () => {
    const catalog: BoonCatalog = {
      ghost: { id: 'ghost', category: 'test', rarity: 'common', copies: 1, effects: [{ kind: 'behavior', hookId: 'nope', params: {} }] },
    };
    const w = bareWorld(7, { hookRegistry: TEST_HOOKS, boonCatalog: catalog });
    const control = bareWorld(7, {});
    const a = place(w, 'a', 0, 0);
    const c = place(control, 'a', 0, 0);
    w.applyBoon(a, 'ghost');
    a.input.throttle = 1;
    c.input.throttle = 1;
    for (let i = 0; i < 40; i++) {
      w.step();
      control.step();
    }
    expect(a.state).toEqual(c.state); // fail-closed: identical to no boon at all
  });

  it('composes boost FIRST, hooks AFTER: an active boost and the hook bonus stack additively', () => {
    const w = bareWorld(7);
    const a = place(w, 'a', 0, 0);
    w.applyBoon(a, 'surgeProtocol');
    a.input.throttle = 1;
    a.boostUntil = Number.MAX_SAFE_INTEGER; // hold the bespoke boost window open
    for (let i = 0; i < 200; i++) w.step();
    const expected =
      CONFIG.shipClasses.torpedoBoat.kinematics.maxSpeed + CONFIG.speedBoost.speedBonus + 20;
    expect(a.state.speed).toBeCloseTo(expected, 6);
  });
});

// ---------------------------------------------------------------------------
// applyBoon — the two homes on a live record, nothing else.
// ---------------------------------------------------------------------------

describe('World.applyBoon — two homes, nothing else', () => {
  it('a stat boon recomputes cached stats via effectiveStats and leaves the loadout REFERENCE-EQUAL', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const loadoutRef = a.loadout;
    const slotRefs = [...a.loadout];
    const stateRefs = a.loadout.map((s) => s.state);
    w.applyBoon(a, 'ironPlating');
    expect(a.boons).toEqual(['ironPlating']);
    expect(a.stats).toEqual(effectiveStats(a.cls, [STAT_BOON]));
    expect(a.stats.maxHp).toBe(CONFIG.shipClasses.torpedoBoat.hp + 40);
    expect(a.loadout).toBe(loadoutRef); // same array
    a.loadout.forEach((s, i) => {
      expect(s).toBe(slotRefs[i]); // same slot objects
      expect(s.state).toBe(stateRefs[i]); // same state objects
    });
  });

  it('a slot boon mutates ONLY the target slot and leaves stats BYTE-IDENTICAL; untouched slots keep live ammo state', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    a.loadout[SLOT_GUN].state!.n = 0;
    a.loadout[SLOT_GUN].state!.reloadMsLeft = 1234; // gun mid-cooldown — must survive
    const statsBefore = a.stats;
    w.applyBoon(a, 'bolterRack');
    expect(a.stats).toEqual(statsBefore); // recomputed, but byte-identical (no stat effect)
    expect(a.loadout[SLOT_EXTRA].equipmentId).toBe('mine');
    expect(a.loadout[SLOT_EXTRA].state).toEqual({ n: CONFIG.mine.maxAmmo, reloadMsLeft: 0 });
    expect(a.loadout[SLOT_GUN].state).toEqual({ n: 0, reloadMsLeft: 1234 }); // untouched
  });

  it('slotReplace on a live record: the fitted slot swaps with a fresh pool, neighbors keep state', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0); // TB: [gun, torpedo, speedBoost, empty]
    a.loadout[1].state!.n = 0;
    a.loadout[1].state!.reloadMsLeft = 900; // stale torpedo state — replaced wholesale
    w.applyBoon(a, 'longLance');
    expect(a.loadout.map((s) => s.equipmentId)).toEqual(['gun', 'cannon', 'speedBoost', null]);
    expect(a.loadout[1].state).toEqual({ n: CONFIG.cannon.maxAmmo, reloadMsLeft: 0 });
  });

  it('queues NO event (2.7 owns the spend UX) and moves NO other ship field — hp stays put even when maxHp grew', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    w.step(); // flush the join spawn event
    a.hp = 55;
    const before = {
      hp: a.hp, lifecycle: a.lifecycle, boostUntil: a.boostUntil, kills: a.kills, deaths: a.deaths,
      damageDealt: a.damageDealt, lastFireSeq: a.lastFireSeq, lastActSeq: a.lastActSeq,
      respawnAt: a.respawnAt, sweepAngle: a.sweepAngle,
      bankedLevels: a.bankedLevels, offer: a.offer, state: { ...a.state },
    };
    w.applyBoon(a, 'ironPlating');
    w.applyBoon(a, 'bolterRack');
    w.step();
    expect(w.tickEvents.filter((e) => e.k === 'pt' || e.k === 'bn')).toEqual([]);
    expect(a.hp).toBe(55); // NOT healed (no grant side effects — unlike hullPoints upgrades)
    expect({
      hp: a.hp, lifecycle: a.lifecycle, boostUntil: a.boostUntil, kills: a.kills, deaths: a.deaths,
      damageDealt: a.damageDealt, lastFireSeq: a.lastFireSeq, lastActSeq: a.lastActSeq,
      respawnAt: before.respawnAt, sweepAngle: before.sweepAngle,
      bankedLevels: a.bankedLevels, offer: a.offer, state: before.state,
    }).toEqual(before);
  });

  it('ONE boon carrying ALL FOUR effect kinds: stats via effectiveStats, slots in the one loadout, behavior per-tick, nothing else (story AC)', () => {
    const w = bareWorld(3);
    const control = bareWorld(3);
    const a = place(w, 'a', 0, 0); // TB: [gun, torpedo, speedBoost, empty]
    const c = place(control, 'a', 0, 0);
    a.hp = 42;
    w.applyBoon(a, 'omni');
    // Home 1 — stats: exactly the effectiveStats fold (sight boon included).
    expect(a.stats).toEqual(effectiveStats(a.cls, [OMNI_BOON]));
    expect(a.stats.sightRange).toBeCloseTo(CONFIG.vision.sight * 1.25, 9);
    // Home 2 — slots: the fill AND the replace landed in the one structure.
    expect(a.loadout.map((s) => s.equipmentId)).toEqual(['gun', 'torpedo', 'starShells', 'decoyBuoy']);
    expect(a.loadout[2].state).toEqual({ n: CONFIG.starShells.maxAmmo, reloadMsLeft: 0 });
    expect(a.loadout[SLOT_EXTRA].state).toEqual({ n: CONFIG.decoyBuoy.maxAmmo, reloadMsLeft: 0 });
    // Hooks — the behavior effect executes on the real tick (outruns control).
    a.input.throttle = 1;
    c.input.throttle = 1;
    for (let i = 0; i < 200; i++) {
      w.step();
      control.step();
    }
    expect(a.state.speed).toBeCloseTo(CONFIG.shipClasses.torpedoBoat.kinematics.maxSpeed + 20, 6);
    expect(a.state.x).toBeGreaterThan(c.state.x + 1);
    // Nothing else — hp untouched by application (42 minus nothing; no damage here).
    expect(a.hp).toBe(42);
  });

  it('an id the catalog cannot resolve appends (wire-mirrored) but applies NOTHING (fail-closed)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const statsBefore = a.stats;
    const ammoBefore = ammoStates(a);
    expect(() => w.applyBoon(a, 'noSuchBoon')).not.toThrow();
    expect(a.boons).toEqual(['noSuchBoon']);
    expect(a.stats).toEqual(statsBefore);
    expect(ammoStates(a)).toEqual(ammoBefore);
    expect(a.loadout.map((s) => s.equipmentId)).toEqual(['gun', 'torpedo', 'speedBoost', null]);
  });

  it('a cap-LOWERING stat boon clamps the live pool DOWN to the new cap', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0); // TB: [gun, torpedo, speedBoost, empty]
    w.applyBoon(a, 'deepMagazine'); // torpedo cap 1 -> 4
    expect(a.stats.torpedo.maxAmmo).toBe(CONFIG.torpedo.maxAmmo + 3);
    a.loadout[1].state!.n = 4; // a full, widened pool
    w.applyBoon(a, 'crampedMagazine'); // cap 4 -> 2
    expect(a.stats.torpedo.maxAmmo).toBe(CONFIG.torpedo.maxAmmo + 1);
    expect(a.loadout[1].state!.n).toBe(2); // clamped, never above the cap
    // The invariant holds for EVERY fitted slot, not just the moved one.
    for (const slot of a.loadout) {
      if (slot.equipmentId === null) continue;
      expect(slot.state!.n).toBeLessThanOrEqual(equipmentMaxAmmo(a.stats, slot.equipmentId));
    }
  });

  it('a cap-RAISING stat boon fills the pool to the new cap (amendment 41 — everything arrives loaded; FLIPS the 2.5 no-top-up pin)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    a.loadout[1].state!.n = 0;
    a.loadout[1].state!.reloadMsLeft = 900; // mid-reload, empty tubes
    w.applyBoon(a, 'deepMagazine'); // cap 1 -> 4
    expect(a.stats.torpedo.maxAmmo).toBe(CONFIG.torpedo.maxAmmo + 3);
    // The raise arrives loaded: the pool fills to the NEW cap immediately
    // (the reload timer keeps running toward nothing — it settles at full).
    expect(a.loadout[1].state!.n).toBe(CONFIG.torpedo.maxAmmo + 3);
  });

  it('a maxHp-LOWERING stat boon clamps hp to the new cap; a RAISING one still does not heal', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const fullHp = a.stats.maxHp;
    expect(a.hp).toBe(fullHp);
    w.applyBoon(a, 'strippedArmor'); // maxHp * 0.5
    expect(a.stats.maxHp).toBe(fullHp * 0.5);
    expect(a.hp).toBe(a.stats.maxHp); // clamped down — never above the cap
    // Raising it back does NOT heal (the deliberate no-heal rule stands).
    const wounded = a.hp;
    w.applyBoon(a, 'ironPlating'); // +40 maxHp
    expect(a.stats.maxHp).toBeGreaterThan(wounded);
    expect(a.hp).toBe(wounded);
  });

  it('an Object.prototype key as a boon id appends but applies NOTHING and never throws', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const statsBefore = a.stats;
    const ammoBefore = ammoStates(a);
    for (const junk of ['constructor', 'toString', 'hasOwnProperty', 'valueOf']) {
      expect(() => w.applyBoon(a, junk)).not.toThrow();
    }
    expect(a.boons).toEqual(['constructor', 'toString', 'hasOwnProperty', 'valueOf']);
    expect(a.stats).toEqual(statsBefore);
    expect(ammoStates(a)).toEqual(ammoBefore);
    expect(a.loadout.map((s) => s.equipmentId)).toEqual(['gun', 'torpedo', 'speedBoost', null]);
  });

  it('REPEATED ids stack by occurrence (the deck copy-count law): two ironPlating fits fold +40 twice', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    w.applyBoon(a, 'ironPlating');
    w.applyBoon(a, 'ironPlating');
    expect(a.boons).toEqual(['ironPlating', 'ironPlating']);
    expect(a.stats.maxHp).toBe(CONFIG.shipClasses.torpedoBoat.hp + 80);
  });
});

// ---------------------------------------------------------------------------
// Lifecycle: redeploy wipes, respawn preserves.
// ---------------------------------------------------------------------------

describe('lifecycle — redeployShip wipes boons, respawn preserves the build', () => {
  it('respawn (waiting phase) PRESERVES boons: stats keep the fold, the loadout re-derives WITH slot effects', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    w.applyBoon(a, 'ironPlating');
    w.applyBoon(a, 'bolterRack');
    w.sinkShip(a.id);
    expect(isAfloat(a.lifecycle)).toBe(false);
    // Story 5.2: the revive lands on the founder tick (window > respawn delay).
    const ticks = Math.ceil(CONFIG.ship.sinkingWindowMs / DT) + 1;
    for (let i = 0; i < ticks; i++) w.step();
    expect(isAfloat(a.lifecycle)).toBe(true);
    expect(a.boons).toEqual(['ironPlating', 'bolterRack']);
    expect(a.stats.maxHp).toBe(CONFIG.shipClasses.torpedoBoat.hp + 40);
    expect(a.hp).toBe(a.stats.maxHp); // full EFFECTIVE hp, boon fold included
    expect(a.loadout.map((s) => s.equipmentId)).toEqual(['gun', 'torpedo', 'speedBoost', 'mine']);
    expect(a.loadout[SLOT_EXTRA].state).toEqual({ n: CONFIG.mine.maxAmmo, reloadMsLeft: 0 });
  });

  it('redeployShip (the match boundary) WIPES boons with the level bank — fresh match, fresh build', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    w.applyBoon(a, 'ironPlating');
    w.applyBoon(a, 'bolterRack');
    w.resetForMatchStart();
    expect(a.boons).toEqual([]);
    expect(a.stats).toEqual(effectiveStats(a.cls));
    expect(a.hp).toBe(CONFIG.shipClasses.torpedoBoat.hp);
    expect(a.loadout.map((s) => s.equipmentId)).toEqual(['gun', 'torpedo', 'speedBoost', null]);
    // And the per-tick fold is back on the identity path (no stale behaviors).
    a.input.throttle = 1;
    const control = bareWorld(1, {});
    const c = place(control, 'a', a.state.x, a.state.y);
    c.state.heading = a.state.heading;
    c.input.throttle = 1;
    for (let i = 0; i < 20; i++) {
      w.step();
      control.step();
    }
    expect(a.state.speed).toBeCloseTo(c.state.speed, 9);
  });
});

// ---------------------------------------------------------------------------
// Wire privacy: boons ride `you` ONLY (the banked-points privacy mirror).
// ---------------------------------------------------------------------------

describe('wire privacy — boons never leak', () => {
  it('own frame: you.boons mirrors the applied list (a defensive copy, not the live array)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    w.applyBoon(a, 'ironPlating');
    w.step();
    const f = buildFrame(w, 'a');
    expect(f.you!.boons).toEqual(['ironPlating']);
    expect(f.you!.boons).not.toBe(a.boons); // defensive copy (the self-private-field discipline)
  });

  it("another observer's frame: the booned hull's Contact carries NO boons key", () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    place(w, 'b', 100, 0); // inside mutual sight
    w.applyBoon(a, 'ironPlating');
    w.step();
    const fb = buildFrame(w, 'b');
    const contact = fb.contacts.find((c) => c.id === 'a')!;
    expect(contact).toBeDefined();
    expect('boons' in contact).toBe(false);
    expect(JSON.stringify(fb)).not.toContain('ironPlating');
  });

  it('spectator (unfogged) frames: contacts carry NO boons either', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    place(w, 'b', 100, 0);
    w.applyBoon(a, 'ironPlating');
    w.step();
    const spec = buildFrame(w, 'b', 'finished'); // finished: everyone spectates unfogged
    expect(spec.spec).toBe(true);
    for (const c of spec.contacts) expect('boons' in c).toBe(false);
    expect(JSON.stringify(spec)).not.toContain('ironPlating');
  });
});
