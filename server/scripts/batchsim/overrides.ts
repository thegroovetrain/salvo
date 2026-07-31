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

/**
 * Apply a set of overrides by structured mutation; returns a restore closure
 * that puts every original value back (reverse order). Call BEFORE constructing
 * any World — CONFIG reads are live, so already-running sims must not exist.
 */
export function applyOverrides(set: Readonly<Record<string, number>>): () => void {
  const undo: { leaf: Leaf; prev: number }[] = [];
  for (const key of Object.keys(set)) {
    const leaf = resolveLeaf(key);
    undo.push({ leaf, prev: leaf.obj[leaf.prop] });
    leaf.obj[leaf.prop] = set[key];
  }
  return () => {
    for (const u of undo.reverse()) u.leaf.obj[u.leaf.prop] = u.prev;
  };
}
