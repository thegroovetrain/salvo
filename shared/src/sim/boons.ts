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
// BOON_CATALOG ships EMPTY (engine before content): test boons live in tests
// as locally-constructed BoonDefs against injected catalogs/registries; the
// real catalog is 2.8's Eric-gated design session and adds only data.

import type { EquipmentId, LoadoutSlot } from './loadout.js';
import { SLOT_EXTRA, equipmentMaxAmmo, loadoutFor } from './loadout.js';
import type { HullId } from '../constants.js';
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
  'gun.maxAmmo',
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
 * THE production boon catalog — deliberately EMPTY in v1 (engine before
 * content: 2.8 is the Eric-gated catalog design session; test boons live only
 * in tests as locally-constructed defs against injected catalogs).
 */
export const BOON_CATALOG: BoonCatalog = deepFreezeRows({});

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
 * hook registry). Both slot edges are silent no-ops: slotFill against an
 * occupied extra slot, slotReplace against an unfitted `from`.
 */
export function applySlotEffect(loadout: LoadoutSlot[], effect: BoonEffect, stats: EffectiveStats): void {
  if (effect.kind === 'slotFill') {
    const slot = loadout[SLOT_EXTRA];
    if (slot === undefined || slot.equipmentId !== null) return; // occupied (or malformed): no-op
    slot.equipmentId = effect.equipmentId;
    slot.state = freshSlotState(stats, effect.equipmentId);
    return;
  }
  if (effect.kind !== 'slotReplace') return; // stat/behavior: not a slot home
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
  target[key] = target[key] * (e.mult ?? 1) + (e.add ?? 0);
}

/**
 * Fold every `stat` effect of `boons` into `stats` IN PLACE, in boon-list
 * order (then per-def effect order) — deterministic, applied AFTER legacy
 * upgrade stacking. Consumed ONLY by effectiveStats() (sim/stats.ts): the
 * one legal path from boons to derived numbers, so the desync firewall holds.
 * Re-derives sweepPeriodMs from the (possibly moved) sweepRpm afterward.
 */
export function applyBoonStats(stats: EffectiveStats, boons: readonly BoonDef[]): void {
  for (const def of boons) {
    for (const e of def.effects) {
      if (e.kind === 'stat') applyStatEffect(stats, e);
    }
  }
  stats.sweepPeriodMs = MS_PER_MINUTE / stats.sweepRpm;
}
