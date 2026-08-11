import { describe, it, expect } from 'vitest';
import {
  LIFECYCLE_ALIVE,
  canTransition,
  isAfloat,
  isSunk,
  sinkingSince,
  sunkAt,
  transitionLifecycle,
  type LifecycleEdge,
  type LifecycleKind,
  type ShipLifecycle,
} from '../sim/lifecycle.js';
import * as shared from '../index.js';

/** Every edge, in table order — the exhaustiveness spine of the tests below. */
const EDGES: readonly LifecycleEdge[] = ['sink', 'founder', 'sinkInstant', 'heal', 'redeploy'];

/** One representative value per state. The timestamps are distinct and
 *  non-zero so a dropped or defaulted stamp fails loudly. */
const STATES: Readonly<Record<LifecycleKind, ShipLifecycle>> = {
  alive: LIFECYCLE_ALIVE,
  sinking: sinkingSince(1000),
  sunk: sunkAt(2000),
};

/**
 * THE TRANSITION TABLE, restated independently of the implementation (the
 * shipClasses identity-test pattern). Anything the module allows that this
 * matrix does not — or refuses that it does — is a deliberate ruling change,
 * not an incidental edit.
 *
 *              sink   founder  sinkInstant  heal   redeploy
 *   alive       ✓        ✗          ✓         ✗        ✓
 *   sinking     ✗        ✓          ✗         ✓        ✓
 *   sunk        ✗        ✗          ✗         ✗        ✓
 */
const LEGAL: Readonly<Record<LifecycleKind, readonly LifecycleEdge[]>> = {
  alive: ['sink', 'sinkInstant', 'redeploy'],
  sinking: ['founder', 'heal', 'redeploy'],
  sunk: ['redeploy'],
};

describe('ship lifecycle — the union', () => {
  it('alive is a frozen payload-free singleton', () => {
    expect(LIFECYCLE_ALIVE.kind).toBe('alive');
    expect(Object.isFrozen(LIFECYCLE_ALIVE)).toBe(true);
    // Payload-free: nothing but the discriminant rides an alive hull.
    expect(Object.keys(LIFECYCLE_ALIVE)).toEqual(['kind']);
  });

  it('sinking carries `since` and sunk carries `at` — the times a boolean could not', () => {
    const sinking = sinkingSince(4321);
    expect(sinking).toEqual({ kind: 'sinking', since: 4321 });
    const sunk = sunkAt(9876);
    expect(sunk).toEqual({ kind: 'sunk', at: 9876 });
    expect(Object.isFrozen(sinking)).toBe(true);
    expect(Object.isFrozen(sunk)).toBe(true);
  });

  it('isAfloat is TRUE for alive only in Story 5.1', () => {
    expect(isAfloat(LIFECYCLE_ALIVE)).toBe(true);
    expect(isAfloat(sunkAt(0))).toBe(false);
    // `sinking` is DECLARED-ONLY (amendment 1) — the sim never enters it, so
    // its afloat-ness is Story 5.2's ruling, not this story's. This assertion
    // pins TODAY's answer so 5.2 changing it is a visible, deliberate edit.
    expect(isAfloat(sinkingSince(0))).toBe(false);
  });

  it('isSunk answers the TERMINAL question, not the negation of isAfloat', () => {
    expect(isSunk(sunkAt(0))).toBe(true);
    expect(isSunk(LIFECYCLE_ALIVE)).toBe(false);
    expect(isSunk(sinkingSince(0))).toBe(false);
    // Today the two predicates happen to be exact complements over the
    // REACHABLE states — but not over `sinking`, which is neither afloat nor
    // sunk. That is why they are separate functions rather than one and a `!`.
    expect(isAfloat(sinkingSince(0))).toBe(false);
    expect(isSunk(sinkingSince(0))).toBe(false);
  });
});

describe('ship lifecycle — the transition table', () => {
  it('canTransition matches the ratified matrix for all 15 (state, edge) pairs', () => {
    for (const kind of Object.keys(STATES) as LifecycleKind[]) {
      for (const edge of EDGES) {
        const expected = LEGAL[kind].includes(edge);
        expect(canTransition(STATES[kind], edge), `${kind} --${edge}-->`).toBe(expected);
      }
    }
  });

  it('every ILLEGAL transition THROWS — a sim invariant, never a silent no-op', () => {
    let illegal = 0;
    for (const kind of Object.keys(STATES) as LifecycleKind[]) {
      for (const edge of EDGES) {
        if (LEGAL[kind].includes(edge)) continue;
        illegal += 1;
        expect(() => transitionLifecycle(STATES[kind], edge, 100), `${kind} --${edge}-->`).toThrow(
          /illegal ship lifecycle transition/,
        );
      }
    }
    // 15 pairs, 7 legal — the matrix above is complete, not partially checked.
    expect(illegal).toBe(8);
  });

  it('sink: alive -> sinking, stamping `since`', () => {
    expect(transitionLifecycle(LIFECYCLE_ALIVE, 'sink', 7000)).toEqual({ kind: 'sinking', since: 7000 });
  });

  it('founder: sinking -> sunk, stamping `at`', () => {
    expect(transitionLifecycle(sinkingSince(7000), 'founder', 12000)).toEqual({ kind: 'sunk', at: 12000 });
  });

  it('sinkInstant: alive -> sunk DIRECTLY — the Story 5.1 sim path (amendment 1)', () => {
    // The sim keeps sinking instantaneous, and sinkShip's single guarded
    // transition is the SOLE idempotency lock on the `sunk` event. Splitting
    // it into sink+founder is how that event gets emitted twice.
    expect(transitionLifecycle(LIFECYCLE_ALIVE, 'sinkInstant', 500)).toEqual({ kind: 'sunk', at: 500 });
    // ...and a second attempt on the already-sunk hull is refused, which is
    // what makes the guard's early-return a lock rather than a suggestion.
    expect(() => transitionLifecycle(sunkAt(500), 'sinkInstant', 600)).toThrow();
  });

  it('heal: sinking -> alive is a LEGAL RESERVED edge (amendment 3, the AC clause)', () => {
    // Reserved for a future damage-control save: legal today, performed by
    // nothing in the sim until Story 5.2+. THIS TEST is the coverage the AC
    // asks for — "never dead code, covered by a transition test".
    expect(canTransition(sinkingSince(3000), 'heal')).toBe(true);
    expect(transitionLifecycle(sinkingSince(3000), 'heal', 3500)).toEqual(LIFECYCLE_ALIVE);
    // It is a SINKING-only edge — a hull on the bottom is never healed back.
    expect(() => transitionLifecycle(sunkAt(3000), 'heal', 3500)).toThrow();
    expect(() => transitionLifecycle(LIFECYCLE_ALIVE, 'heal', 3500)).toThrow();
  });

  it('redeploy: any -> alive — creation, match-start reset, AND respawn', () => {
    // The three shipped `-> alive` paths (amendment 3): addShip, redeployShip
    // (production-reachable on every match), processRespawns.
    for (const kind of Object.keys(STATES) as LifecycleKind[]) {
      expect(transitionLifecycle(STATES[kind], 'redeploy', 999), kind).toEqual(LIFECYCLE_ALIVE);
    }
  });

  it('heal and redeploy stay DISTINCT edges — the same destination, nothing else in common', () => {
    // Collapsing them into one generic "anything may return to alive" edge
    // would make "`sinking -> alive` is reserved for a future heal" stop
    // describing anything (amendment 3). The proof they are not aliases: heal
    // is refused from exactly the two states redeploy accepts.
    expect(canTransition(LIFECYCLE_ALIVE, 'heal')).toBe(false);
    expect(canTransition(sunkAt(0), 'heal')).toBe(false);
    expect(canTransition(LIFECYCLE_ALIVE, 'redeploy')).toBe(true);
    expect(canTransition(sunkAt(0), 'redeploy')).toBe(true);
  });

  it('the `-> alive` edges ignore the timestamp and return the shared singleton', () => {
    expect(transitionLifecycle(sinkingSince(1), 'heal', 42)).toBe(LIFECYCLE_ALIVE);
    expect(transitionLifecycle(sunkAt(1), 'redeploy', 42)).toBe(LIFECYCLE_ALIVE);
  });
});

describe('ship lifecycle — purity', () => {
  it('transitions never mutate their input', () => {
    const before = sinkingSince(1234);
    const snapshot = { ...before };
    transitionLifecycle(before, 'founder', 5678);
    transitionLifecycle(before, 'heal', 5678);
    expect(before).toEqual(snapshot);
  });

  it('every call is allocation-fresh and structurally equal for equal inputs', () => {
    const a = transitionLifecycle(LIFECYCLE_ALIVE, 'sinkInstant', 111);
    const b = transitionLifecycle(LIFECYCLE_ALIVE, 'sinkInstant', 111);
    expect(a).toEqual(b);
    expect(a).not.toBe(b); // the payload states are values, not singletons
  });

  it('rides the shared barrel', () => {
    const ns = shared as Record<string, unknown>;
    for (const name of [
      'LIFECYCLE_ALIVE',
      'sinkingSince',
      'sunkAt',
      'isAfloat',
      'isSunk',
      'canTransition',
      'transitionLifecycle',
    ]) {
      expect(ns[name], name).toBeDefined();
    }
    // No compatibility boolean escapes into the barrel (amendment 2): the
    // lifecycle is the ONLY representation of life and death.
    expect(ns['aliveBoolean']).toBeUndefined();
  });
});
