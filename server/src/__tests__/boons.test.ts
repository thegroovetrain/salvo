// Card engine server plumbing (Story 2.5; live since 2.7; re-cut for catalog
// v3 in Story 8.1). Proves, against INJECTED test registries (the shipped
// HOOK_REGISTRY stays empty — amendment 29; the shipped CATALOG is the full
// v3 content, exercised in upgrades.test.ts — the injected catalog here keeps
// these pins content-independent), that: a behavior card's kinematics hook
// executes in the REAL world tick (measurable position change vs an identical
// control world); applyCard touches exactly the two homes on a live
// ShipRecord (stats only via effectiveStats, slots only in the one loadout —
// untouched slots keep live ammo/reload state, no event queued, no other ship
// field moves); redeployShip and respawn BOTH preserve the build (Story 8.10
// review, P1 — the redeploy wipe is retired); and
// the wire stays SELF-PRIVATE: cards ride `you` only, never a Contact or
// spectator frame.
//
// `slotReplace` IS GONE (Story 8.1): no catalog-v3 line swaps one piece of
// equipment for another, so the effect kind and its pin left together.

import { describe, it, expect } from 'vitest';
import {
  isAfloat,
  CONFIG,
  SLOT_GUN,
  WEAPON_SLOTS,
  effectiveStats,
  CONSUMABLE_SLOTS,
  equipmentMaxAmmo,
  isConsumableId,
  type Catalog,
  type CatalogLine,
  type HookRegistry,
  type ShipClassId,
} from '@salvo/shared';
import { World, type ShipRecord, type WorldOptions } from '../game/world.js';
import { buildFrame } from '../game/frames.js';

const DT = CONFIG.tick.simDtMs;

// NINE FIXED-ROLE SLOTS (Story 8.5): [gun, boost, weapon x3, consumable x4],
// the same shape on every captain hull. `SLOT_EXTRA` is gone with the old
// four-slot loadout.
//
// NOTHING IS FITTED AT SPAWN (Story 8.10, epic-8 amendment 62): the interim
// spawn seed is deleted outright, so every hull comes up [gun, boost, empty x7]
// and this suite's one slotFill card lands in the FIRST weapon slot. It read
// the same way before, for a different reason (TEST_CATALOG, injected below,
// is deliberately content-free and carried none of the shipped weapon lines),
// which is exactly the content-independence these pins are built on.
/** Where this suite's one slotFill card lands on the fixture. */
const SLOT_FILL = WEAPON_SLOTS[0];
/** The full nine-slot id list: the fitted ids in slot order, then nulls. */
const ids = (...fitted: (string | null)[]): (string | null)[] => [
  ...fitted,
  ...Array<null>(9 - fitted.length).fill(null),
];

// --- The injected TEST registries (never the production rows) ---------------

/** A test kinematics hook: raises the forward cap by params.bonus (the boost
 *  shape, as a registered hook). Identity at bonus 0. */
const TEST_HOOKS: HookRegistry = {
  surge: {
    kind: 'kinematics',
    apply: (kin, p) => ((p.bonus ?? 0) === 0 ? kin : { ...kin, maxSpeed: kin.maxSpeed + (p.bonus ?? 0) }),
  },
};

/** A one-copy test line carrying `effects` as its single tier. */
const line = (id: string, effects: CatalogLine['tiers'][number], extra: Partial<CatalogLine> = {}): CatalogLine => ({
  id: id as CatalogLine['id'],
  kind: 'ladder',
  cap: 1,
  tiers: [effects],
  ...extra,
});

const BEHAVIOR_CARD = line('surgeProtocol', [{ kind: 'behavior', hookId: 'surge', params: { bonus: 20 } }]);
const STAT_CARD = line('ironPlating', [{ kind: 'stat', path: 'maxHp', add: 40 }]);
const FILL_CARD = line('bolterRack', [{ kind: 'slotFill', equipmentId: 'navalMines' }]);

/** ONE line carrying FOUR effect kinds at once (the story's acceptance shape):
 *  a stat, a slot fill, a behavior hook and a consumable stock — which STOPPED
 *  being ignored in Story 8.7: the `stock` now lands a one-copy stack in the
 *  first belt slot, and the assertions below say so. */
const OMNI_CARD = line('omni', [
  // `radarRange`, not `sightRange`: truesight became DERIVED at the Intel
  // Range merge and left BOON_STAT_PATHS, so a sight-addressing line no longer
  // type-checks. Widening radar here still exercises a stat effect AND now
  // proves the derivation reaches sightRange through applyCard (asserted below).
  { kind: 'stat', path: 'radarRange', mult: 1.25 },
  { kind: 'slotFill', equipmentId: 'radarBuoy' },
  { kind: 'behavior', hookId: 'surge', params: { bonus: 20 } },
  { kind: 'stock', equipmentId: 'hullRepair' },
]);

/** Pool-cap movers: a raiser (+3 tubes) and, applied AFTER it, a shrinker
 *  (-2) — the only way to LOWER a cap below a live pool, since every shipped
 *  pool is 1. */
const WIDE_TUBES = line('deepMagazine', [{ kind: 'stat', path: 'equipment.heavyTorpedo.maxAmmo', add: 3 }]);
const NARROW_TUBES = line('crampedMagazine', [{ kind: 'stat', path: 'equipment.heavyTorpedo.maxAmmo', add: -2 }]);
/** A maxHp-LOWERING card (the hp invariant's only trigger). */
const FRAIL_HULL = line('strippedArmor', [{ kind: 'stat', path: 'maxHp', mult: 0.5 }]);

const TEST_CATALOG: Catalog = {
  surgeProtocol: BEHAVIOR_CARD,
  ironPlating: STAT_CARD,
  bolterRack: FILL_CARD,
  omni: OMNI_CARD,
  deepMagazine: WIDE_TUBES,
  crampedMagazine: NARROW_TUBES,
  strippedArmor: FRAIL_HULL,
};

/** A CAP-2 ladder line — the copy/tier law needs a line with more than one
 *  rung, which every line in TEST_CATALOG deliberately is not. */
const TWIN_PLATING: CatalogLine = {
  ...line('twinPlating', [{ kind: 'stat', path: 'maxHp', add: 40 }]),
  cap: 2,
  tiers: [[{ kind: 'stat', path: 'maxHp', add: 40 }], [{ kind: 'stat', path: 'maxHp', add: 40 }]],
};
const LADDER_CATALOG: Catalog = { twinPlating: TWIN_PLATING };

const OPTS: WorldOptions = { hookRegistry: TEST_HOOKS, catalog: TEST_CATALOG };

function bareWorld(seed = 1, opts: WorldOptions = OPTS): World {
  const w = new World(seed, CONFIG.match.fillTo, CONFIG.zone, opts);
  w.map.islands.length = 0;
  return w;
}

function place(w: World, id: string, x: number, y: number, hull: ShipClassId = 'torpedoBoat'): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), 'captain', hull, undefined, undefined);
  rec.state.x = x;
  rec.state.y = y;
  rec.state.heading = 0;
  rec.state.speed = 0;
  return rec;
}

/** HAND-FIT a weapon into SLOT_FILL. TEST_CATALOG carries no line that fits
 *  the shipped weapons, and since Story 8.5 no hull fits one by hardware
 *  either, so the pool-cap cases (which address `equipment.heavyTorpedo`)
 *  write the slot directly — exactly what `applySlotEffect` would write. What
 *  they pin is the CLAMP/TOP-UP on a fitted pool, not how it got fitted. */
function fitWeapon(ship: ShipRecord, id: 'heavyTorpedo'): void {
  ship.loadout[SLOT_FILL] = {
    equipmentId: id,
    state: { n: equipmentMaxAmmo(ship.stats, id), reloadMsLeft: 0 },
  };
}

/** Deep copy of a loadout's ammo state for byte-comparison. */
const ammoStates = (s: ShipRecord) => s.loadout.map((slot) => (slot.state ? { ...slot.state } : null));

// ---------------------------------------------------------------------------
// Real-tick hook execution.
// ---------------------------------------------------------------------------

describe('behavior card — the kinematics hook executes in the REAL world tick', () => {
  it('a card-fitted hull measurably outruns an identical control hull (injected registry, same seed)', () => {
    const w = bareWorld(7);
    const control = bareWorld(7);
    const a = place(w, 'a', 0, 0);
    const c = place(control, 'a', 0, 0);
    w.applyCard(a, 'surgeProtocol');
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

  it('an injected registry alone changes NOTHING for a card-less hull (zero-card identity)', () => {
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

  it('a behavior card whose hookId is unknown to the registry is a silent per-tick no-op', () => {
    const catalog: Catalog = { ghost: line('ghost', [{ kind: 'behavior', hookId: 'nope', params: {} }]) };
    const w = bareWorld(7, { hookRegistry: TEST_HOOKS, catalog });
    const control = bareWorld(7, {});
    const a = place(w, 'a', 0, 0);
    const c = place(control, 'a', 0, 0);
    w.applyCard(a, 'ghost');
    a.input.throttle = 1;
    c.input.throttle = 1;
    for (let i = 0; i < 40; i++) {
      w.step();
      control.step();
    }
    expect(a.state).toEqual(c.state); // fail-closed: identical to no card at all
  });

  it('composes boost FIRST, hooks AFTER: an active boost and the hook bonus stack additively', () => {
    const w = bareWorld(7);
    const a = place(w, 'a', 0, 0);
    w.applyCard(a, 'surgeProtocol');
    a.input.throttle = 1;
    a.boostUntil = Number.MAX_SAFE_INTEGER; // hold the bespoke boost window open
    for (let i = 0; i < 200; i++) w.step();
    // Story 8.9 / amendment 55: the boost pays a PROPORTION of the post-fold
    // max (factor x maxSpeed), not a flat u/s; the hook's +20 still lands on
    // top, additively, because it composes AFTER.
    const tbMax = CONFIG.shipClasses.torpedoBoat.kinematics.maxSpeed;
    const expected = tbMax + tbMax * CONFIG.boost.factor + 20;
    expect(a.state.speed).toBeCloseTo(expected, 6);
  });
});

// ---------------------------------------------------------------------------
// applyCard — the two homes on a live record, nothing else.
// ---------------------------------------------------------------------------

describe('World.applyCard — two homes, nothing else', () => {
  it('a stat card recomputes cached stats via effectiveStats and leaves the loadout REFERENCE-EQUAL', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const loadoutRef = a.loadout;
    const slotRefs = [...a.loadout];
    const stateRefs = a.loadout.map((s) => s.state);
    w.applyCard(a, 'ironPlating');
    expect(a.cards).toEqual(['ironPlating']);
    expect(a.stats).toEqual(effectiveStats(a.cls, ['ironPlating'], TEST_CATALOG));
    expect(a.stats.maxHp).toBe(CONFIG.shipClasses.torpedoBoat.hp + 40);
    expect(a.loadout).toBe(loadoutRef); // same array
    a.loadout.forEach((s, i) => {
      expect(s).toBe(slotRefs[i]); // same slot objects
      expect(s.state).toBe(stateRefs[i]); // same state objects
    });
  });

  it('a slot card mutates ONLY the target slot and leaves stats BYTE-IDENTICAL; untouched slots keep live ammo state', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    a.loadout[SLOT_GUN].state!.n = 0;
    a.loadout[SLOT_GUN].state!.reloadMsLeft = 1234; // gun mid-cooldown — must survive
    const statsBefore = a.stats;
    w.applyCard(a, 'bolterRack');
    expect(a.stats).toEqual(statsBefore); // recomputed, but byte-identical (no stat effect)
    expect(a.loadout[SLOT_FILL].equipmentId).toBe('navalMines');
    expect(a.loadout[SLOT_FILL].state).toEqual({ n: CONFIG.mine.maxAmmo, reloadMsLeft: 0 });
    expect(a.loadout[SLOT_GUN].state).toEqual({ n: 0, reloadMsLeft: 1234 }); // untouched
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
    w.applyCard(a, 'ironPlating');
    w.applyCard(a, 'bolterRack');
    w.step();
    expect(w.tickEvents.filter((e) => e.k === 'pt' || e.k === 'bn')).toEqual([]);
    expect(a.hp).toBe(55); // NOT healed (no grant side effects — ARMOR's heal-on-grant is the only heal path)
    expect({
      hp: a.hp, lifecycle: a.lifecycle, boostUntil: a.boostUntil, kills: a.kills, deaths: a.deaths,
      damageDealt: a.damageDealt, lastFireSeq: a.lastFireSeq, lastActSeq: a.lastActSeq,
      respawnAt: before.respawnAt, sweepAngle: before.sweepAngle,
      bankedLevels: a.bankedLevels, offer: a.offer, state: before.state,
    }).toEqual(before);
  });

  it('ONE card carrying FOUR effect kinds: stats via effectiveStats, slots in the one loadout, behavior per-tick, nothing else (story AC)', () => {
    const w = bareWorld(3);
    const control = bareWorld(3);
    const a = place(w, 'a', 0, 0); // TB under TEST_CATALOG: [gun, boost, empty x7]
    const c = place(control, 'a', 0, 0);
    a.hp = 42;
    w.applyCard(a, 'omni');
    // Home 1 — stats: exactly the effectiveStats fold (sight boon included).
    expect(a.stats).toEqual(effectiveStats(a.cls, ['omni'], TEST_CATALOG));
    expect(a.stats.radarRange).toBeCloseTo(CONFIG.vision.radar * 1.25, 9);
    // The whole point of the merge: truesight is the 4/8 rung, so it MOVED with
    // radar through the one derivation rather than needing its own card.
    expect(a.stats.sightRange).toBeCloseTo((CONFIG.vision.radar * 1.25) / 2, 9);
    // Home 2 — slots: BOTH slot effects landed in the one structure, each in
    // its own row (Story 8.7). The `slotFill` took the first WEAPON slot; the
    // `stock` took the first BELT slot as a fresh one-copy stack that never
    // reloads. Neither can reach the other's row.
    expect(a.loadout.map((s) => s.equipmentId)).toEqual([
      'gun', 'boost', 'radarBuoy', null, null, 'hullRepair', null, null, null,
    ]);
    expect(a.loadout[SLOT_FILL].state).toEqual({ n: CONFIG.radarBuoy.maxAmmo, reloadMsLeft: 0 });
    expect(a.loadout[CONSUMABLE_SLOTS[0]].state).toEqual({ n: 1, reloadMsLeft: 0 });
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

  it('an id the catalog cannot resolve is REFUSED outright — it never even reaches `cards` (fail-closed)', () => {
    // TIGHTENED BY THE 8.14 REVIEW (F1). It used to APPEND and apply nothing,
    // on the theory that the client drops it at resolve. `pickRefusal` — the
    // one predicate both sides now run — reads an id the catalog does not own
    // as `stub`, so the copy is refused before the push and nothing unresolvable
    // ever rides the wire in `cards` at all.
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const statsBefore = a.stats;
    const ammoBefore = ammoStates(a);
    expect(() => w.applyCard(a, 'noSuchBoon')).not.toThrow();
    expect(a.cards).toEqual([]);
    expect(a.stats).toEqual(statsBefore);
    expect(ammoStates(a)).toEqual(ammoBefore);
    expect(a.loadout.map((s) => s.equipmentId)).toEqual(ids('gun', 'boost'));
  });

  it('a cap-LOWERING stat card clamps the live pool DOWN to the new cap', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0); // TB under TEST_CATALOG: [gun, boost, empty x7]
    fitWeapon(a, 'heavyTorpedo');
    w.applyCard(a, 'deepMagazine'); // torpedo cap 1 -> 4
    expect(a.stats.equipment.heavyTorpedo.maxAmmo).toBe(CONFIG.torpedo.maxAmmo + 3);
    a.loadout[SLOT_FILL].state!.n = 4; // a full, widened pool
    w.applyCard(a, 'crampedMagazine'); // cap 4 -> 2
    expect(a.stats.equipment.heavyTorpedo.maxAmmo).toBe(CONFIG.torpedo.maxAmmo + 1);
    expect(a.loadout[SLOT_FILL].state!.n).toBe(2); // clamped, never above the cap
    // The invariant holds for EVERY fitted slot, not just the moved one — and
    // a BELT slot is skipped through the shared narrowing guard (Story 8.7: a
    // consumable stack has no stats row and no cap to clamp to).
    for (const slot of a.loadout) {
      if (slot.equipmentId === null || isConsumableId(slot.equipmentId)) continue;
      expect(slot.state!.n).toBeLessThanOrEqual(equipmentMaxAmmo(a.stats, slot.equipmentId));
    }
  });

  it('a cap-RAISING stat card fills the pool to the new cap (amendment 41 — everything arrives loaded; FLIPS the 2.5 no-top-up pin)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    fitWeapon(a, 'heavyTorpedo');
    a.loadout[SLOT_FILL].state!.n = 0;
    a.loadout[SLOT_FILL].state!.reloadMsLeft = 900; // mid-reload, empty tubes
    w.applyCard(a, 'deepMagazine'); // cap 1 -> 4
    expect(a.stats.equipment.heavyTorpedo.maxAmmo).toBe(CONFIG.torpedo.maxAmmo + 3);
    // The raise arrives loaded: the pool fills to the NEW cap immediately
    // (the reload timer keeps running toward nothing — it settles at full).
    expect(a.loadout[SLOT_FILL].state!.n).toBe(CONFIG.torpedo.maxAmmo + 3);
  });

  it('a maxHp-LOWERING stat card clamps hp to the new cap; a RAISING one still does not heal', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const fullHp = a.stats.maxHp;
    expect(a.hp).toBe(fullHp);
    w.applyCard(a, 'strippedArmor'); // maxHp * 0.5
    expect(a.stats.maxHp).toBe(fullHp * 0.5);
    expect(a.hp).toBe(a.stats.maxHp); // clamped down — never above the cap
    // Raising it back does NOT heal (the deliberate no-heal rule stands).
    const wounded = a.hp;
    w.applyCard(a, 'ironPlating'); // +40 maxHp
    expect(a.stats.maxHp).toBeGreaterThan(wounded);
    expect(a.hp).toBe(wounded);
  });

  it('an Object.prototype key as a card id is REFUSED, applies NOTHING and never throws', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const statsBefore = a.stats;
    const ammoBefore = ammoStates(a);
    for (const junk of ['constructor', 'toString', 'hasOwnProperty', 'valueOf']) {
      expect(() => w.applyCard(a, junk)).not.toThrow();
    }
    expect(a.cards).toEqual([]);
    expect(a.stats).toEqual(statsBefore);
    expect(ammoStates(a)).toEqual(ammoBefore);
    expect(a.loadout.map((s) => s.equipmentId)).toEqual(ids('gun', 'boost'));
  });

  it('REPEATED ids stack by occurrence up to the line CAP: copy 2 of a cap-2 line folds its tier, copy 3 buys nothing', () => {
    const w = bareWorld(1, { hookRegistry: TEST_HOOKS, catalog: LADDER_CATALOG });
    const a = place(w, 'a', 0, 0);
    const base = CONFIG.shipClasses.torpedoBoat.hp;
    w.applyCard(a, 'twinPlating');
    expect(a.stats.maxHp).toBe(base + 40);
    w.applyCard(a, 'twinPlating');
    expect(a.cards).toEqual(['twinPlating', 'twinPlating']);
    expect(a.stats.maxHp).toBe(base + 80);
    // Past the cap the fold takes nothing (the deck can never deal a third
    // copy; this is the fail-closed guard, not a path).
    w.applyCard(a, 'twinPlating');
    expect(a.stats.maxHp).toBe(base + 80);
  });
});

// ---------------------------------------------------------------------------
// Lifecycle: redeploy PRESERVES (Story 8.10 review, P1), respawn preserves.
// ---------------------------------------------------------------------------

describe('lifecycle — redeployShip and respawn both preserve the build', () => {
  it('respawn (waiting phase) PRESERVES the build: stats keep the fold, the loadout re-derives WITH slot effects', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    w.applyCard(a, 'ironPlating');
    w.applyCard(a, 'bolterRack');
    w.sinkShip(a.id);
    expect(isAfloat(a.lifecycle)).toBe(false);
    // Story 5.2: the revive lands on the founder tick (window > respawn delay).
    const ticks = Math.ceil(CONFIG.ship.sinkingWindowMs / DT) + 1;
    for (let i = 0; i < ticks; i++) w.step();
    expect(isAfloat(a.lifecycle)).toBe(true);
    expect(a.cards).toEqual(['ironPlating', 'bolterRack']);
    expect(a.stats.maxHp).toBe(CONFIG.shipClasses.torpedoBoat.hp + 40);
    expect(a.hp).toBe(a.stats.maxHp); // full EFFECTIVE hp, card fold included
    expect(a.loadout.map((s) => s.equipmentId)).toEqual(ids('gun', 'boost', 'navalMines'));
    expect(a.loadout[SLOT_FILL].state).toEqual({ n: CONFIG.mine.maxAmmo, reloadMsLeft: 0 });
  });

  // THE TRUTH FLIPPED (Story 8.10 review, P1): the activation redeploy used to
  // wipe the build on every room without `holdStartLine`. It now PRESERVES the
  // card economy on every path — the countdown grant is the only pre-active
  // economy a room can hold, and wiping it wiped the feature — so a redeploy
  // is a fresh HULL over the SAME build: hp/loadout are rebuilt from the kept
  // cards (a fresh reload clock), and the fold is still live.
  it('redeployShip (the match boundary) PRESERVES the build and rebuilds the fit over it', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    w.applyCard(a, 'ironPlating');
    w.applyCard(a, 'bolterRack');
    w.resetForMatchStart();
    expect(a.cards).toEqual(['ironPlating', 'bolterRack']);
    expect(a.stats).toEqual(effectiveStats(a.cls, ['ironPlating', 'bolterRack'], TEST_CATALOG));
    expect(a.hp).toBe(a.stats.maxHp); // full EFFECTIVE hp, card fold included
    expect(a.loadout.map((s) => s.equipmentId)).toEqual(ids('gun', 'boost', 'navalMines'));
    // ...and the per-tick fold is rebuilt, not stale: these two cards carry no
    // kinematics hook, so the hull still runs the identity path against a
    // card-less control (the behaviors cache was re-derived, not carried
    // over as a foreign array).
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
// Wire privacy: cards ride `you` ONLY (the banked-points privacy mirror).
// ---------------------------------------------------------------------------

describe('wire privacy — cards never leak', () => {
  it('own frame: you.cards mirrors the applied list (a defensive copy, not the live array)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    w.applyCard(a, 'ironPlating');
    w.step();
    const f = buildFrame(w, 'a');
    expect(f.you!.cards).toEqual(['ironPlating']);
    expect(f.you!.cards).not.toBe(a.cards); // defensive copy (the self-private-field discipline)
    // THE RENAME IS A WIRE BREAK (Story 8.1, PV 51): the old key is GONE, not
    // shadowed — a PV-50 client reading `you.boons` must find nothing at all.
    expect('boons' in f.you!).toBe(false);
    expect(JSON.stringify(f)).not.toContain('boons');
  });

  it("another observer's frame: the card-fitted hull's Contact carries NO cards key", () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    place(w, 'b', 100, 0); // inside mutual sight
    w.applyCard(a, 'ironPlating');
    w.step();
    const fb = buildFrame(w, 'b');
    const contact = fb.contacts.find((c) => c.id === 'a')!;
    expect(contact).toBeDefined();
    expect('cards' in contact).toBe(false);
    expect(JSON.stringify(fb)).not.toContain('ironPlating');
  });

  it('spectator (unfogged) frames: contacts carry NO cards either', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    place(w, 'b', 100, 0);
    w.applyCard(a, 'ironPlating');
    w.step();
    const spec = buildFrame(w, 'b', 'finished'); // finished: everyone spectates unfogged
    expect(spec.spec).toBe(true);
    for (const c of spec.contacts) expect('cards' in c).toBe(false);
    expect(JSON.stringify(spec)).not.toContain('ironPlating');
  });
});
