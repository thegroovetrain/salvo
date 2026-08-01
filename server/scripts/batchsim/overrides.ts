// TUNABLE CONFIG overrides (spec: the --set/--sweep dial mechanism).
//
// CONFIG in shared/src/constants.ts is `as const` (compile-time readonly) but
// NOT Object.freeze'd at runtime — verified — so the harness applies overrides
// by in-process structured mutation of the one shared CONFIG object BEFORE any
// World/Match is constructed (orchestrator ruling: never add override seams to
// shared/). Every apply returns a restore closure; the sweep path restores
// between variants, single runs simply exit.
//
// The whitelist is EXACTLY the spec's tunable-dial surface: xp.*, deck.*,
// offer.size, match.fillTo, zone.*. Anything else — even a real CONFIG path
// like gun.damage — is rejected with a clear error, so the harness can never
// quietly become a general balance-editing backdoor.

import { CONFIG } from '@salvo/shared';

/** Unknown / non-tunable / non-numeric --set key — main prints and exits 2. */
export class TunableError extends Error {}

const TUNABLE_FAMILIES = ['xp.', 'deck.', 'zone.'];
const TUNABLE_EXACT = new Set(['offer.size', 'match.fillTo']);

export function isTunableKey(key: string): boolean {
  return TUNABLE_EXACT.has(key) || TUNABLE_FAMILIES.some((p) => key.startsWith(p));
}

interface Leaf {
  obj: Record<string, number>;
  prop: string;
}

/** Walk a dotted key into CONFIG; throws TunableError unless it lands on an
 *  existing numeric leaf inside the tunable families. */
function resolveLeaf(key: string): Leaf {
  if (!isTunableKey(key)) {
    throw new TunableError(
      `'${key}' is not a tunable dial (allowed: xp.*, deck.*, offer.size, match.fillTo, zone.*)`,
    );
  }
  const parts = key.split('.');
  let node: unknown = CONFIG;
  for (const part of parts.slice(0, -1)) {
    node = (node as Record<string, unknown>)[part];
    if (typeof node !== 'object' || node === null) {
      throw new TunableError(`'${key}' does not exist in CONFIG`);
    }
  }
  const prop = parts[parts.length - 1];
  const leaf = (node as Record<string, unknown>)[prop];
  if (typeof leaf !== 'number') throw new TunableError(`'${key}' is not a numeric CONFIG entry`);
  // The cast strips `as const` readonly-ness — deliberate, documented above.
  return { obj: node as Record<string, number>, prop };
}

/** Validate a --set/--sweep key without touching CONFIG (arg-parse time). */
export function validateTunableKey(key: string): void {
  resolveLeaf(key);
}

/** Per-key numeric FLOOR. A dial the sim divides by, or loops until it consumes,
 *  cannot legally be <= 0: `offer.size` 0 makes drawOffer return an empty offer
 *  forever (the deck never depletes -> the deck-only economy loop never
 *  terminates), and `xp.levelMs` 0 makes passive accrual a divide-by-zero.
 *  Everything else may legitimately be 0 — `deck.rareWeightPerDryLevel=0` (the
 *  ratified no-pity sweep arm) and `zone.grace=0` / `zone.endRadiusFraction=0`
 *  (the fast-storm test arms) are real evidence values. */
const MIN_ONE_KEYS = new Set(['xp.levelMs', 'offer.size']);

/** Floor-check a --set/--sweep VALUE (arg-parse time and again at apply time).
 *  Rejecting here is what keeps a non-positive dial from reaching a sim loop. */
export function validateTunableValue(key: string, value: number): void {
  const floor = MIN_ONE_KEYS.has(key) ? 1 : 0;
  if (!Number.isFinite(value) || value < floor) {
    throw new TunableError(`'${key}': expected a finite value >= ${floor}, got '${value}'`);
  }
}

/**
 * Apply a set of overrides by structured mutation; returns a restore closure
 * that puts every original value back (reverse order). Call BEFORE constructing
 * any World — CONFIG reads are live, so already-running sims must not exist.
 */
export function applyOverrides(set: Readonly<Record<string, number>>): () => void {
  const undo: { leaf: Leaf; prev: number }[] = [];
  for (const key of Object.keys(set)) {
    const leaf = resolveLeaf(key);
    validateTunableValue(key, set[key]); // defense in depth: programmatic callers too
    undo.push({ leaf, prev: leaf.obj[leaf.prop] });
    leaf.obj[leaf.prop] = set[key];
  }
  return () => {
    for (const u of undo.reverse()) u.leaf.obj[u.leaf.prop] = u.prev;
  };
}
