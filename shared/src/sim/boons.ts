// Boon effect engine (Story 2.5) — the ratified "two homes + hooks" law
// (epics AR4; Epic 2 amendments 28–30). A boon is `{ id, category, effects[] }`
// and applying one may touch exactly three lawful paths:
//   1. `stat` effects flow ONLY through effectiveStats() (sim/stats.ts calls
//      applyBoonStats — the desync firewall stays intact);
//   2. `slotFill`/`slotReplace` effects mutate ONLY the one LoadoutSlot[]
//      structure, through applySlotEffect below — used INCREMENTALLY by the
//      server (live loadout, untouched slots keep their ammo state) and
//      REPLAYED by the client over loadoutFor output (slotsWithBoons): one
//      function, two callers, id-parity property-tested;
//   3. `behavior(hookId, params)` executes registered hooks (sim/hooks.ts)
//      per-tick on BOTH sides, so prediction survives.
// Nothing else moves — a stat-only boon leaves the loadout reference-equal, a
// slot-only boon leaves stats byte-identical (property-pinned in tests).
//
// BOON_CATALOG ships an INTERIM DUMMY SET (Story 2.7, amendment 35): enough
// stat-only content across enough categories for the offer flow to roll 4
// distinct categories in production. It is deliberate placeholder data under
// the standing draft-copy rule and DIES WHOLESALE in 2.8 (Eric's catalog design
// session), which also strips the 14 legacy upgrades. Test boons still live in
// tests as locally-constructed BoonDefs against injected catalogs/registries.

import type { EquipmentId, LoadoutSlot } from './loadout.js';
import { SLOT_EXTRA, equipmentMaxAmmo, loadoutFor } from './loadout.js';
import { CONFIG, type HullId } from '../constants.js';
import type { EffectiveStats } from './stats.js';
import type { HookParams } from './hooks.js';

/** Catalog boon id (camelCase string — the registry-id convention). */
export type BoonId = string;

/** Offer-distinctness category a boon rolls under (vocabulary is 2.8 catalog
 *  design; the engine only threads it). */
export type BoonCategory = string;

/**
 * The typed whitelist of EffectiveStats scalar paths a `stat` effect may
 * address — every EXISTING scalar except the derived `sweepPeriodMs` (always
 * re-derived from sweepRpm after the fold, preserving the "no rpm is ever
 * converted elsewhere" law). Damage is deliberately NOT addressable: it does
 * not live on EffectiveStats (equipmentInfo.ts records the future seam).
 * `gun.maxAmmo` is deliberately NOT addressable either: effectiveStats PINS the
 * gun pool to 1 (single-shot gun, Eric ruling 2026-07-21 — the pool is a pure
 * cooldown), and no catalog datum may unpin it.
 */
export const BOON_STAT_PATHS = [
  'maxHp',
  'radarRange',
  'sweepRpm',
  'sightRange',
  'kinematics.maxSpeed',
  'kinematics.reverseSpeed',
  'kinematics.accel',
  'kinematics.decel',
  'kinematics.turnRate',
  'kinematics.steerageSpeed',
  'gun.reloadMs',
  'gun.rangeU',
  'torpedo.reloadMs',
  'torpedo.maxAmmo',
  'torpedo.speed',
  'mine.reloadMs',
  'mine.maxAmmo',
  'mine.maxLive',
  'boost.speedBonus',
  'boost.durationMs',
  'boost.maxAmmo',
  'boost.reloadMs',
  'cannon.reloadMs',
  'cannon.maxAmmo',
  'cannon.rangeU',
  'starShells.reloadMs',
  'starShells.maxAmmo',
  'starShells.rangeU',
  'decoyBuoy.reloadMs',
  'decoyBuoy.maxAmmo',
  'decoyBuoy.durationMs',
] as const;

/** A stat-addressable EffectiveStats scalar path. */
export type BoonStatPath = (typeof BOON_STAT_PATHS)[number];

/** Runtime fail-closed guard for the fold (a def built outside the type
 *  system — e.g. deserialized — can never write off-whitelist). */
const BOON_STAT_PATH_SET: ReadonlySet<string> = new Set(BOON_STAT_PATHS);

/**
 * Derived-stat mutation: `value * (mult ?? 1) + (add ?? 0)` on one
 * whitelisted EffectiveStats scalar — the legacy CONFIG.upgrades mult/add
 * vocabulary generalized. Applied AFTER legacy upgrade stacking, in boon-list
 * order (deterministic), only ever inside effectiveStats().
 */
export interface BoonStatEffect {
  kind: 'stat';
  path: BoonStatPath;
  mult?: number;
  add?: number;
}

/** Fill the extra slot (SLOT_EXTRA) with `equipmentId` — fresh full pool at
 *  current stats. No-op (silent) when the extra slot is already occupied. */
export interface BoonSlotFillEffect {
  kind: 'slotFill';
  equipmentId: EquipmentId;
}

/** Replace the slot currently holding `from` with `to` (fresh full-pool
 *  state). No-op (silent) when `from` is unfitted — the applyGrantEffects
 *  fail-closed guard, carried forward. */
export interface BoonSlotReplaceEffect {
  kind: 'slotReplace';
  from: EquipmentId;
  to: EquipmentId;
}

/** Execute the registered hook `hookId` with `params` at its attachment point
 *  (v1: per-tick kinematics — sim/hooks.ts). Unknown hookId = silent no-op. */
export interface BoonBehaviorEffect {
  kind: 'behavior';
  hookId: string;
  params: HookParams;
}

/** The four-effect vocabulary — the ONLY ways a boon may touch the sim. */
export type BoonEffect = BoonStatEffect | BoonSlotFillEffect | BoonSlotReplaceEffect | BoonBehaviorEffect;

/** One catalog boon: an id, its offer category, and its effect list. */
export interface BoonDef {
  id: BoonId;
  category: BoonCategory;
  effects: readonly BoonEffect[];
}

/** Freeze the catalog AND every def inside it (the HOOK_REGISTRY /
 *  SIGNAL_REGISTRY deep-freeze discipline). */
const deepFreezeRows = <T extends object>(rows: T): Readonly<T> => {
  for (const key of Object.keys(rows) as (keyof T)[]) Object.freeze(rows[key]);
  return Object.freeze(rows);
};

/** A boon catalog, keyed by BoonId. Injectable wherever ids resolve to defs
 *  (server World options, client resolve); production passes BOON_CATALOG. */
export type BoonCatalog = Readonly<Record<BoonId, BoonDef>>;

/**
 * THE production boon catalog — an INTERIM DUMMY SET (Story 2.7, amendment 35).
 *
 * Shape: 5 categories × 2 boons = 10 entries, STAT EFFECTS ONLY on whitelisted
 * BOON_STAT_PATHS, so HOOK_REGISTRY stays empty (amendments 29/30 intact) and
 * no slotFill/slotReplace ships before 2.8 designs the loadout content. Two
 * boons per category is the minimum that makes distinct-category rolls VARY
 * (one member per category would make every offer identical).
 *
 * DRAFT COPY, DRAFT NUMBERS: every id, category and multiplier here is
 * implementer-drafted placeholder data (the standing draft-copy rule) chosen to
 * be mild and boring — this set exists to prove the roll/bank/spend flow end to
 * end in production, not to be balanced. Player-facing names/descriptions live
 * CLIENT-side (client/src/ui/boonCopy.ts): BoonDef stays pure sim, so copy
 * edits never touch the wire contract. The whole table dies in 2.8.
 *
 * ITERATION ORDER IS LOAD-BEARING: rollBoonOffer derives its category list from
 * catalog insertion order (sim/offers.ts), so reordering these keys changes
 * every seeded offer. Treat the order as append-only, like UPGRADE_IDS.
 *
 * CATALOG CONTENT IS WIRE CONTRACT: adding, removing, or changing any entry
 * REQUIRES a PROTOCOL_VERSION bump (shared/src/index.ts). Boon ids ride the
 * wire and the client resolves them FAIL-CLOSED (unknown id = silently
 * dropped), so a stale client would silently ignore a boon the server is
 * simulating — a desync with no error surface. The PV join gate is the ONLY
 * thing preventing it.
 */
export const BOON_CATALOG: BoonCatalog = deepFreezeRows({
  // --- hull ---------------------------------------------------------------
  reinforcedBulkheads: {
    id: 'reinforcedBulkheads',
    category: 'hull',
    effects: [{ kind: 'stat', path: 'maxHp', mult: 1.12 }],
  },
  splinterMattresses: {
    id: 'splinterMattresses',
    category: 'hull',
    effects: [
      { kind: 'stat', path: 'maxHp', mult: 1.06 },
      { kind: 'stat', path: 'kinematics.decel', mult: 1.08 },
    ],
  },
  // --- propulsion ---------------------------------------------------------
  forcedDraught: {
    id: 'forcedDraught',
    category: 'propulsion',
    effects: [{ kind: 'stat', path: 'kinematics.maxSpeed', mult: 1.1 }],
  },
  trimmedScrews: {
    id: 'trimmedScrews',
    category: 'propulsion',
    effects: [
      { kind: 'stat', path: 'kinematics.accel', mult: 1.12 },
      { kind: 'stat', path: 'kinematics.turnRate', mult: 1.05 },
    ],
  },
  // --- gunnery ------------------------------------------------------------
  rangefinderCrew: {
    id: 'rangefinderCrew',
    category: 'gunnery',
    effects: [{ kind: 'stat', path: 'gun.rangeU', mult: 1.1 }],
  },
  practicedLoaders: {
    id: 'practicedLoaders',
    category: 'gunnery',
    // reloadMs is a COST: a mult BELOW 1 is the improvement (the legacy
    // gunReload upgrade's vocabulary, carried forward verbatim).
    effects: [{ kind: 'stat', path: 'gun.reloadMs', mult: 0.9 }],
  },
  // --- sensors ------------------------------------------------------------
  highGainAntenna: {
    id: 'highGainAntenna',
    category: 'sensors',
    effects: [{ kind: 'stat', path: 'radarRange', mult: 1.1 }],
  },
  crowsNestWatch: {
    id: 'crowsNestWatch',
    category: 'sensors',
    effects: [
      { kind: 'stat', path: 'sightRange', mult: 1.08 },
      { kind: 'stat', path: 'sweepRpm', mult: 1.05 },
    ],
  },
  // --- ordnance -----------------------------------------------------------
  deepMagazines: {
    id: 'deepMagazines',
    category: 'ordnance',
    // A pool ADD is a no-op for a hull that does not fit the system (the stat
    // still moves; nothing else does) — dead picks are an accepted interim
    // wart that dies with this table in 2.8.
    effects: [{ kind: 'stat', path: 'torpedo.maxAmmo', add: 1 }],
  },
  practicedHandlers: {
    id: 'practicedHandlers',
    category: 'ordnance',
    effects: [
      { kind: 'stat', path: 'torpedo.reloadMs', mult: 0.92 },
      { kind: 'stat', path: 'mine.reloadMs', mult: 0.92 },
    ],
  },
});

/** The immutable zero-boons list — the shared allocation-free identity for
 *  every zero-boon fast path (server record cache, client resolve). */
export const NO_BOONS: readonly BoonDef[] = Object.freeze([]);

/**
 * Resolve a boon-id list to its defs, FAIL-CLOSED: an unknown id is silently
 * dropped (never a throw — a junk id on the wire must not take the client
 * down), known ids keep list order. Returns NO_BOONS (the shared identity)
 * when nothing resolves, so zero-boon callers stay allocation-free.
 */
export function resolveBoons(ids: readonly string[], catalog: BoonCatalog = BOON_CATALOG): readonly BoonDef[] {
  if (ids.length === 0) return NO_BOONS;
  const defs: BoonDef[] = [];
  for (const id of ids) {
    // OWN-PROPERTY ONLY: a plain-object catalog answers `catalog['constructor']`
    // with Object.prototype.constructor, which is not undefined and has no
    // `effects` — a junk wire id would then throw downstream. Object.hasOwn is
    // the fail-closed gate on EVERY catalog/registry lookup in the engine.
    if (!Object.hasOwn(catalog, id)) continue;
    const def = catalog[id];
    if (def !== undefined) defs.push(def);
  }
  return defs.length === 0 ? NO_BOONS : defs;
}

/** Every `behavior` effect across `boons`, in list order — the per-tick hook
 *  workload for hookKinematics (callers cache the result beside their stats). */
export function boonBehaviors(boons: readonly BoonDef[]): BoonBehaviorEffect[] {
  const out: BoonBehaviorEffect[] = [];
  for (const def of boons) {
    for (const e of def.effects) if (e.kind === 'behavior') out.push(e);
  }
  return out;
}

/** A fitted slot with a fresh full pool at current stats — exactly the
 *  loadoutFor / server freshAmmo semantics. */
function freshSlotState(stats: EffectiveStats, id: EquipmentId): LoadoutSlot['state'] {
  return { n: equipmentMaxAmmo(stats, id), reloadMsLeft: 0 };
}

/**
 * Apply ONE effect's slot consequence to a live loadout IN PLACE — THE single
 * slot-mutation path of the engine, shared verbatim by the server (applyBoon,
 * incremental: untouched slots keep their live ammo/reload state) and the
 * client (slotsWithBoons, replayed over loadoutFor output). `stat`/`behavior`
 * effects are structural no-ops here (their homes are effectiveStats and the
 * hook registry). Every slot edge is a silent no-op: slotFill against an
 * occupied extra slot, slotFill of equipment ALREADY fitted anywhere,
 * slotReplace against an unfitted `from`, and slotReplace with `from === to`.
 */
export function applySlotEffect(loadout: LoadoutSlot[], effect: BoonEffect, stats: EffectiveStats): void {
  if (effect.kind === 'slotFill') {
    const slot = loadout[SLOT_EXTRA];
    if (slot === undefined || slot.equipmentId !== null) return; // occupied (or malformed): no-op
    // Already fitted somewhere: no-op. The engine addresses slots BY EQUIPMENT
    // ID (slotReplace's `from`, the server's ammo lookups), so a duplicate id
    // makes the addressing ambiguous. 2.8 may deliberately revisit duplicates
    // (a two-tube fit would need id-addressing replaced first).
    if (loadout.some((s) => s.equipmentId === effect.equipmentId)) return;
    slot.equipmentId = effect.equipmentId;
    slot.state = freshSlotState(stats, effect.equipmentId);
    return;
  }
  if (effect.kind !== 'slotReplace') return; // stat/behavior: not a slot home
  // Degenerate self-replace: a no-op, NOT a refit. Replacing X with X would
  // hand out a fresh full pool with reloadMsLeft 0 — a free instant reload.
  if (effect.from === effect.to) return;
  const slot = loadout.find((s) => s.equipmentId === effect.from);
  if (slot === undefined) return; // `from` unfitted: fail-closed no-op
  slot.equipmentId = effect.to;
  slot.state = freshSlotState(stats, effect.to);
}

/**
 * The client-side loadout derivation (ONE derivation, both sides): the hull's
 * base loadoutFor fit with every boon's slot effects replayed over it, in
 * boon-list order. Produces the SAME slot ids the server's incremental
 * applyBoon path holds live (property-pinned) — pool STATE here is the fresh
 * full-pool baseline (the live counts ride OwnShip.ammo, slot-aligned).
 */
export function slotsWithBoons(
  hullId: HullId,
  stats: EffectiveStats,
  boons: readonly BoonDef[],
): LoadoutSlot[] {
  const loadout = loadoutFor(hullId, stats);
  for (const def of boons) {
    for (const e of def.effects) applySlotEffect(loadout, e, stats);
  }
  return loadout;
}

/** ms per minute — sweepRpm -> sweepPeriodMs re-derivation after the fold. */
const MS_PER_MINUTE = 60000;

/** Write one stat effect onto the (freshly-built, mutation-safe) stats tree. */
function applyStatEffect(stats: EffectiveStats, e: BoonStatEffect): void {
  if (!BOON_STAT_PATH_SET.has(e.path)) return; // off-whitelist (untyped def): fail-closed
  const [head, tail] = e.path.split('.');
  const root = stats as unknown as Record<string, number | Record<string, number>>;
  const target = tail === undefined ? (root as Record<string, number>) : (root[head] as Record<string, number>);
  const key = tail ?? head;
  const v = target[key] * (e.mult ?? 1) + (e.add ?? 0);
  // Sanity gate: EVERY whitelisted stat is a strictly POSITIVE scalar (speeds,
  // ranges, hp, reload ms, rpm, pool sizes). Zero, negative, NaN and Infinity
  // are all invalid effect data — skip the assignment rather than poison the
  // stats tree (a NaN maxSpeed desyncs prediction silently; a 0 sweepRpm makes
  // sweepPeriodMs Infinity). Deterministic and identical on both sides.
  if (!Number.isFinite(v) || v <= 0) return;
  target[key] = v;
}

/**
 * Fold every `stat` effect of `boons` into `stats` IN PLACE, in boon-list
 * order (then per-def effect order) — deterministic, applied AFTER legacy
 * upgrade stacking. Consumed ONLY by effectiveStats() (sim/stats.ts): the
 * one legal path from boons to derived numbers, so the desync firewall holds.
 * Re-applies the ratified sweepRpm ceiling and re-derives sweepPeriodMs from
 * the (possibly moved) sweepRpm afterward.
 */
export function applyBoonStats(stats: EffectiveStats, boons: readonly BoonDef[]): void {
  for (const def of boons) {
    for (const e of def.effects) {
      if (e.kind === 'stat') applyStatEffect(stats, e);
    }
  }
  // The ONE ratified stat ceiling (CONFIG.upgrades.sweepSpeed.maxRpm), re-applied
  // over the boon fold: it is a property of the stat, not of the legacy upgrade
  // path, so boon data may not exceed it either. Sibling site of the legacy
  // clamp in sim/stats.ts — the two are the only places the ceiling lives.
  stats.sweepRpm = Math.min(stats.sweepRpm, CONFIG.upgrades.sweepSpeed.maxRpm);
  stats.sweepPeriodMs = MS_PER_MINUTE / stats.sweepRpm;
}
