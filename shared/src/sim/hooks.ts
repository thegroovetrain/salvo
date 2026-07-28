// Behavior hooks (Story 2.5) — the third leg of the boon effect engine's
// "two homes + hooks" law. A boon's `behavior` effect names a hook in
// HOOK_REGISTRY; the hook is implemented ONCE here in shared so the server's
// world tick and the client's predictor run IDENTICAL code and prediction
// survives (the boostedKinematics precedent, generalized).
//
// Hook law (Epic 2 amendments 29–30):
//   - Hooks are pure, deterministic, and side-effect-free.
//   - Exactly ONE attachment point ships in v1: per-tick kinematics
//     (kin, params) -> kin — the ratified boost precedent. New attachment
//     kinds (on-hit, on-activate, timed-hp, …) are added by catalog stories
//     exactly when a real boon needs them; the kind-discriminated HookSpec
//     contract stays generic and heal-compatible by design.
//   - HOOK_REGISTRY ships EMPTY: the speed boost stays bespoke (NOT migrated)
//     until the 2.8 catalog re-expresses it, and test hooks live ONLY in
//     test-injected registries, never here. The registry-iterating parity
//     suite (shared/src/__tests__/hooks.test.ts) is structurally armed so a
//     future entry cannot land without shape/purity/determinism coverage.
//   - Engine call sites take the registry as a PARAMETER (production passes
//     HOOK_REGISTRY; tests inject their own) — that is what lets the
//     production registry ship empty while tests prove the real execution
//     paths. An unknown hookId at execution time is a silent no-op
//     (fail-closed).

import type { ShipConfig } from './ship.js';

/** Params a behavior effect hands its hook: plain finite numbers only (pure
 *  data, deterministic, trivially wire-safe if a catalog ever ships them). */
export type HookParams = Readonly<Record<string, number>>;

/**
 * A per-tick kinematics hook — the ONE v1 attachment point. `apply` folds the
 * hook into a ship's per-tick kinematics BEFORE stepShip (after the bespoke
 * boost — see hookKinematics). It must be pure (never mutate `kin`),
 * deterministic, and return the INPUT REFERENCE UNCHANGED when the hook is
 * inactive for these params (the boostedKinematics allocation-free idiom).
 */
export interface KinematicsHookSpec {
  kind: 'kinematics';
  apply: (kin: ShipConfig, params: HookParams) => ShipConfig;
}

/** The kind-discriminated hook contract. v1 ships kinematics only; future
 *  attachment points extend this union (each forced into parity coverage by
 *  the registry suite's literal key lock). */
export type HookSpec = KinematicsHookSpec;

/** A registry of hooks, keyed by hookId (camelCase). Injectable at every
 *  engine call site; production code passes HOOK_REGISTRY. */
export type HookRegistry = Readonly<Record<string, HookSpec>>;

/** The minimal shape a kinematics fold needs from a `behavior` boon effect
 *  (structurally satisfied by boons.ts's BoonBehaviorEffect). */
export interface KinematicsBehavior {
  hookId: string;
  params: HookParams;
}

/** Freeze the registry AND every row inside it (the signals.ts
 *  SIGNAL_REGISTRY discipline): a shallow freeze on the map alone would leave
 *  rows mutable at runtime. */
const deepFreezeRows = <T extends object>(rows: T): Readonly<T> => {
  for (const key of Object.keys(rows) as (keyof T)[]) Object.freeze(rows[key]);
  return Object.freeze(rows);
};

/**
 * THE production hook registry — deliberately EMPTY in v1 (amendment 29: the
 * speed boost stays bespoke until the 2.8 catalog re-expresses it; test hooks
 * live only in test-injected registries). Registering a hook here REQUIRES
 * adding it to the literal key list + per-row coverage table in
 * shared/src/__tests__/hooks.test.ts — the suite fails on any uncovered entry.
 *
 * REGISTRY CONTENT IS WIRE CONTRACT: adding, removing, or changing any entry
 * REQUIRES a PROTOCOL_VERSION bump (shared/src/index.ts). Hooks run on BOTH
 * sides from the boon ids on the wire, and both sides resolve FAIL-CLOSED
 * (unknown hookId = silent no-op) — a stale client would silently skip a hook
 * the server is simulating, desyncing prediction with no error surface. The PV
 * join gate is the ONLY thing preventing it.
 */
export const HOOK_REGISTRY: HookRegistry = deepFreezeRows({});

/**
 * Fold every `behavior` effect's kinematics hook into `kin`, in list order.
 * Returns `kin` UNCHANGED (same reference) when no behavior resolves to a
 * registered kinematics hook — the common, allocation-free path. An unknown
 * hookId (or a non-kinematics hook kind) is a silent no-op (fail-closed).
 * Call sites compose this AFTER the bespoke boost:
 * `hookKinematics(boostedKinematics(...), behaviors, registry)` — boost
 * first, hooks after (pinned by the prediction parity suite so 2.8 cannot
 * accidentally flip it).
 */
export function hookKinematics(
  kin: ShipConfig,
  behaviors: readonly KinematicsBehavior[],
  registry: HookRegistry,
): ShipConfig {
  let out = kin;
  for (const b of behaviors) {
    // OWN-PROPERTY ONLY (the resolveBoons gate, applied here too): a plain-object
    // registry answers `registry['constructor']` with Object.prototype.constructor.
    // The kind check alone already rejects it; hasOwn makes the rejection
    // structural rather than incidental.
    if (!Object.hasOwn(registry, b.hookId)) continue;
    const hook = registry[b.hookId];
    if (hook === undefined || hook.kind !== 'kinematics') continue;
    out = hook.apply(out, b.params);
  }
  return out;
}
