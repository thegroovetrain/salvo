// HOOK_REGISTRY lock + hookKinematics fold (Story 2.5). The registry lock is
// the signals.test.ts pattern applied to the second registry: a LITERAL
// expected-key coverage table + a toHaveLength pin + per-row shape/purity/
// determinism checks that ITERATE the real registry — so a future hook cannot
// be registered without (a) failing the key/length pins and (b) adding a
// coverage row with sample params. The registry ships EMPTY (amendment 29:
// boost stays bespoke, test hooks live only in test-injected registries), so
// the suite is structurally armed while iterating zero real entries today.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  HOOK_REGISTRY,
  hookKinematics,
  type HookRegistry,
  type HookParams,
  type KinematicsBehavior,
  type ShipConfig,
} from '../index.js';

const BASE_KIN: ShipConfig = CONFIG.shipClasses.torpedoBoat.kinematics;

/**
 * COVERAGE TABLE — one row per registered hook, keyed LITERALLY by hookId,
 * carrying the sample params the per-row checks exercise it with. Registering
 * a hook in HOOK_REGISTRY without a row here fails the key-equality pin below;
 * adding a row without registering fails it the other way. EMPTY today
 * (amendment 29 — the registry ships empty until the 2.8 catalog).
 */
const HOOK_COVERAGE: Record<string, { sampleParams: HookParams }> = {};

describe('HOOK_REGISTRY — the registry lock (signals.test.ts pattern)', () => {
  it('has exactly the covered keys (EMPTY in v1 — amendment 29: boost stays bespoke)', () => {
    expect(Object.keys(HOOK_REGISTRY).sort()).toEqual(Object.keys(HOOK_COVERAGE).sort());
    expect(Object.keys(HOOK_REGISTRY)).toHaveLength(0);
  });

  it('is deep-frozen: neither the map nor any row can be mutated at runtime', () => {
    expect(Object.isFrozen(HOOK_REGISTRY)).toBe(true);
    expect(() => {
      (HOOK_REGISTRY as Record<string, unknown>).injected = { kind: 'kinematics' };
    }).toThrow(TypeError);
    for (const row of Object.values(HOOK_REGISTRY)) expect(Object.isFrozen(row)).toBe(true);
  });

  // Per-row checks iterate the REAL registry — zero iterations today, armed
  // for every future entry (each forced through its coverage row's params).
  it('every row: kinematics kind, callable apply; pure (never mutates kin), deterministic, and identity-compatible', () => {
    for (const [hookId, row] of Object.entries(HOOK_REGISTRY)) {
      const { sampleParams } = HOOK_COVERAGE[hookId]; // key-pinned above — must exist
      expect(row.kind).toBe('kinematics'); // the ONE v1 attachment point (amendment 30)
      expect(typeof row.apply).toBe('function');
      const input: ShipConfig = { ...BASE_KIN };
      const snapshot = { ...input };
      const out1 = row.apply(input, sampleParams);
      expect(input).toEqual(snapshot); // pure: the input kin is never mutated
      const out2 = row.apply(input, sampleParams);
      expect(out2).toEqual(out1); // deterministic: same inputs, same fold
    }
  });
});

// ---------------------------------------------------------------------------
// hookKinematics fold behavior — proven via TEST registries (never the
// production one; amendment 29).
// ---------------------------------------------------------------------------

/** A test registry: a multiplier hook and an additive hook on maxSpeed, plus
 *  an inactive-at-zero hook proving the identity-reference idiom. */
const TEST_REGISTRY: HookRegistry = {
  doubleSpeed: {
    kind: 'kinematics',
    apply: (kin, p) => ({ ...kin, maxSpeed: kin.maxSpeed * (p.factor ?? 2) }),
  },
  plusSpeed: {
    kind: 'kinematics',
    apply: (kin, p) => ({ ...kin, maxSpeed: kin.maxSpeed + (p.bonus ?? 0) }),
  },
  inactive: {
    kind: 'kinematics',
    apply: (kin, p) => ((p.on ?? 0) === 0 ? kin : { ...kin, turnRate: kin.turnRate * 2 }),
  },
};

const b = (hookId: string, params: HookParams = {}): KinematicsBehavior => ({ hookId, params });

describe('hookKinematics — the per-tick fold', () => {
  it('zero behaviors returns the INPUT REFERENCE unchanged (allocation-free identity)', () => {
    expect(hookKinematics(BASE_KIN, [], TEST_REGISTRY)).toBe(BASE_KIN);
    expect(hookKinematics(BASE_KIN, [], HOOK_REGISTRY)).toBe(BASE_KIN);
  });

  it('an unknown hookId is a SILENT no-op (fail-closed): same reference, no throw', () => {
    expect(hookKinematics(BASE_KIN, [b('noSuchHook', { x: 1 })], TEST_REGISTRY)).toBe(BASE_KIN);
    // Against the shipped EMPTY registry every behavior is unknown — identity.
    expect(hookKinematics(BASE_KIN, [b('doubleSpeed')], HOOK_REGISTRY)).toBe(BASE_KIN);
  });

  it('a hook that is inactive for its params keeps the reference through the fold', () => {
    expect(hookKinematics(BASE_KIN, [b('inactive', { on: 0 })], TEST_REGISTRY)).toBe(BASE_KIN);
  });

  it('applies hooks in behavior-list order (mult-then-add differs from add-then-mult)', () => {
    const bonus = 10;
    const multFirst = hookKinematics(BASE_KIN, [b('doubleSpeed'), b('plusSpeed', { bonus })], TEST_REGISTRY);
    const addFirst = hookKinematics(BASE_KIN, [b('plusSpeed', { bonus }), b('doubleSpeed')], TEST_REGISTRY);
    expect(multFirst.maxSpeed).toBe(BASE_KIN.maxSpeed * 2 + bonus);
    expect(addFirst.maxSpeed).toBe((BASE_KIN.maxSpeed + bonus) * 2);
    expect(multFirst.maxSpeed).not.toBe(addFirst.maxSpeed);
  });

  it('never mutates the input kinematics (pure fold over pure hooks)', () => {
    const input: ShipConfig = { ...BASE_KIN };
    const out = hookKinematics(input, [b('doubleSpeed'), b('plusSpeed', { bonus: 5 })], TEST_REGISTRY);
    expect(input).toEqual(BASE_KIN);
    expect(out).not.toBe(input);
    // Every non-target field is carried verbatim (the boostedKinematics idiom).
    expect(out).toEqual({ ...BASE_KIN, maxSpeed: BASE_KIN.maxSpeed * 2 + 5 });
  });

  it('skips unknown ids mid-fold and still applies the known ones', () => {
    const out = hookKinematics(
      BASE_KIN,
      [b('noSuchHook'), b('plusSpeed', { bonus: 7 }), b('alsoMissing')],
      TEST_REGISTRY,
    );
    expect(out.maxSpeed).toBe(BASE_KIN.maxSpeed + 7);
  });
});
