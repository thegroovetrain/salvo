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
// offer.size, match.fillTo, map.baseRadius, zone.*. Anything else — even a
// real CONFIG path like gun.damage — is rejected with a clear error, so the
// harness can never quietly become a general balance-editing backdoor.
// zone.* keys address the PHASED timeline shape (Story 3.1): zone.beatMs,
// zone.offsetCap, zone.terminalSightFactor, zone.stormDps, and the per-group
// ring exponents by INDEX — zone.ringSteps.0 / zone.ringSteps.1 (resolveLeaf
// walks any dotted path, array indices included). map.baseRadius joins for the
// 3.1 map-radius × ring evidence sweeps (amendment 7).

import { CONFIG } from '@salvo/shared';

/** Unknown / non-tunable / non-numeric --set key — main prints and exits 2. */
export class TunableError extends Error {}

const TUNABLE_FAMILIES = ['xp.', 'deck.', 'zone.'];
const TUNABLE_EXACT = new Set(['offer.size', 'match.fillTo', 'map.baseRadius']);

export function isTunableKey(key: string): boolean {
  return TUNABLE_EXACT.has(key) || TUNABLE_FAMILIES.some((p) => key.startsWith(p));
}

// --tune: THE EQUIPMENT SURFACE, deliberately kept BESIDE the whitelist above
// rather than folded into it. --set/--sweep address HARNESS dials (economy,
// timeline, board); --tune addresses COMBAT numbers, which is a different kind
// of edit and carries its own env gate (HC_BALANCE=1, enforced in batchSim.mjs
// and re-checked in main.ts — args.ts stays pure over argv). Keeping the two
// lists separate is what keeps the boundary VISIBLE: `--set gun.damage=5` is
// still rejected exactly as it always was, and a reader can see at a glance
// which surface a family belongs to.
// THE LIVE CATALOG, not the prep doc's list. The prep note that specced this
// surface named `cannon.`, which no longer exists: Story 7-5 wave 2 replaced the
// cannon outright with the BROADSIDE BARRAGE. Shipping `cannon.` verbatim would
// pass this family gate and then die on the CONFIG walk, while the battleship's
// actual main weapon stayed unreachable — so the dead family is dropped and the
// three live blocks the doc predates (broadside, speedBoost, radarBuoy) are in.
// Keep this list in step with the top-level equipment blocks of CONFIG.
const TUNE_FAMILIES = [
  'gun.',
  'broadside.',
  'torpedo.',
  'mine.',
  'starShells.',
  'speedBoost.',
  'radarBuoy.',
  'shipClasses.',
  // DAMAGE CONTROL is a COMBAT dial, not an economy one, so it belongs on this
  // surface rather than the --set whitelist: `damageControl` amounts are FLAT
  // on every hull by ruling ("no maxHp scaling, no upgrade scaling"), which
  // means any change to hull HP silently reprices every heal. A +100 HP arm
  // measured here dropped a heal from ~33% of an average hull to ~20% of one,
  // and the highest-HP hull paid most — so the heal has to be reachable to
  // tell a real class problem apart from that repricing.
  'damageControl.',
];

/** True for an EQUIPMENT dial family (--tune only, never --set/--sweep). */
export function isTuneKey(key: string): boolean {
  return TUNE_FAMILIES.some((p) => key.startsWith(p));
}

// DERIVED STATS ARE NOT DIALS. Each of these CONFIG paths is re-derived AFTER
// the boon fold — in BOTH shared/src/sim/stats.ts clampStats and
// shared/src/sim/boons.ts applyBoonStats — so a --tune of it is overwritten
// before a single tick runs while the run key, the report header and the JSON
// all claim the sim moved. False evidence is the ONE failure a balance harness
// may not have (the same argument the prototype-walk refusal above is written
// on), so these are refused up front with the real dial named instead.
// `mine.triggerRadius` exists in CONFIG and would be silently ignored; the
// three rangeU paths are not CONFIG entries at all and would otherwise fail
// with the generic not-a-numeric-entry message, which tells the reader nothing
// about WHY the range they are trying to move is unreachable.
const DERIVED_TUNE_KEYS = new Map<string, string>([
  [
    'mine.triggerRadius',
    'the trip ring is DERIVED as mine.blastRadius x CONFIG.mine.triggerFactor (Eric ruling 2026-08-16) — tune mine.blastRadius instead',
  ],
  ['gun.rangeU', 'gun range is DERIVED from radar range (Eric ruling 2026-07-21) and is not independently tunable'],
  ['starShells.rangeU', 'star-shell range is DERIVED from radar range and is not independently tunable'],
  [
    'broadside.rangeU',
    'broadside range is DERIVED from radar range at the 5/8 rung (Story 7-5 wave 2) and is not independently tunable',
  ],
]);

/** Refuse a path the firewall re-derives post-fold (see DERIVED_TUNE_KEYS). */
function assertNotDerived(key: string): void {
  const advice = DERIVED_TUNE_KEYS.get(key);
  if (advice !== undefined) {
    throw new TunableError(`'${key}' is a DERIVED stat — tuning it has no effect on the sim: ${advice}`);
  }
}

/** The family gate, split out of resolveLeaf so the --set rejection message
 *  stays byte-identical to the one shipped before --tune existed. */
function assertKeyAllowed(key: string, allowTune: boolean): void {
  if (allowTune) {
    assertNotDerived(key);
    if (isTuneKey(key)) return;
    throw new TunableError(
      `'${key}' is not an equipment dial (allowed: ${TUNE_FAMILIES.map((f) => `${f}*`).join(', ')})`,
    );
  }
  if (isTunableKey(key)) return;
  throw new TunableError(
    `'${key}' is not a tunable dial (allowed: xp.*, deck.*, offer.size, match.fillTo, map.baseRadius, zone.*)`,
  );
}

interface Leaf {
  obj: Record<string, number>;
  prop: string;
}

/** Walk a dotted key into CONFIG; throws TunableError unless it lands on an
 *  existing numeric leaf inside the allowed families. `allowTune` switches the
 *  family gate from the --set/--sweep whitelist to the --tune equipment
 *  families; with the default `false` this function behaves — and fails —
 *  exactly as it did before --tune existed. */
function resolveLeaf(key: string, allowTune = false): Leaf {
  assertKeyAllowed(key, allowTune);
  const parts = key.split('.');
  let node: unknown = CONFIG;
  for (const part of parts.slice(0, -1)) {
    node = step(node, part, key);
  }
  const prop = parts[parts.length - 1];
  // An array entry may be addressed ONLY by index. `zone.ringSteps.0` is a
  // documented, legitimate dial; `broadside.traverseDeg.length` is a numeric
  // own property that would TRUNCATE a live CONFIG array and then run the batch
  // as if nothing had happened. The index rule admits the first and refuses the
  // second without needing to enumerate array internals.
  if (Array.isArray(node) && !/^(?:0|[1-9]\d*)$/.test(prop)) {
    throw new TunableError(`'${key}': an array entry is addressable only by index`);
  }
  // hasOwn, so an INHERITED numeric slot can never be mistaken for a real dial.
  // Absent keys fall through to the long-standing not-a-numeric-entry message.
  const leaf = Object.hasOwn(node as object, prop) ? (node as Record<string, unknown>)[prop] : undefined;
  if (typeof leaf !== 'number') throw new TunableError(`'${key}' is not a numeric CONFIG entry`);
  // The cast strips `as const` readonly-ness — deliberate, documented above.
  return { obj: node as Record<string, number>, prop };
}

/** One INTERIOR step of the walk: an OWN property that is itself traversable.
 *  The own-check is what keeps the walk inside CONFIG — without it `--tune
 *  broadside.traverseDeg.__proto__.length=1` resolves to `Array.prototype.length`
 *  and mutates global state outside CONFIG entirely, accepted in silence. A run
 *  that reads ordinary while the sim underneath it is wrong is the one failure a
 *  balance harness may not have, so the walker refuses rather than trusts. */
function step(node: unknown, part: string, key: string): unknown {
  if (typeof node !== 'object' || node === null || !Object.hasOwn(node, part)) {
    throw new TunableError(`'${key}' does not exist in CONFIG`);
  }
  const next = (node as Record<string, unknown>)[part];
  if (typeof next !== 'object' || next === null) {
    throw new TunableError(`'${key}' does not exist in CONFIG`);
  }
  return next;
}

/** Validate a --set/--sweep key without touching CONFIG (arg-parse time). */
export function validateTunableKey(key: string): void {
  resolveLeaf(key);
}

/** Per-key numeric FLOOR. A dial the sim divides by, or loops until it consumes,
 *  cannot legally be <= 0: `offer.size` 0 makes drawOffer return an empty offer
 *  forever (the deck never depletes -> the deck-only economy loop never
 *  terminates), `xp.levelMs` 0 makes passive accrual a divide-by-zero,
 *  `zone.beatMs` 0 collapses zoneClosedAtMs to 0 (a zero tick budget — the
 *  shared timeline fails closed, but every match would report as unresolved
 *  nonsense), and `map.baseRadius` 0 is a zero-area board. Everything else may
 *  legitimately be 0 — `deck.rareWeightPerDryLevel=0` (the ratified no-pity
 *  sweep arm), `zone.offsetCap=0` (concentric rings), `zone.ringSteps.N=0`
 *  (a hold-at-map-radius ring) are real evidence values. */
const MIN_ONE_KEYS = new Set(['xp.levelMs', 'offer.size', 'zone.beatMs', 'map.baseRadius']);

/** Floor-check a --set/--sweep VALUE (arg-parse time and again at apply time).
 *  Rejecting here is what keeps a non-positive dial from reaching a sim loop. */
export function validateTunableValue(key: string, value: number): void {
  const floor = MIN_ONE_KEYS.has(key) ? 1 : 0;
  if (!Number.isFinite(value) || value < floor) {
    throw new TunableError(`'${key}': expected a finite value >= ${floor}, got '${value}'`);
  }
}

/** Validate a --tune key without touching CONFIG (arg-parse time). */
export function validateTuneKey(key: string): void {
  resolveLeaf(key, true);
}

/** Equipment leaves the SIM ITSELF DIVIDES BY. Each entry is a measured NaN /
 *  Infinity path, not a precaution — under a blanket floor of 0 the harness
 *  would run the whole campaign and print an ordinary-looking report:
 *    steerageSpeed — shared/src/sim/ship.ts:69 `clampUnit(s.speed /
 *      cfg.steerageSpeed)`; at rest that is 0/0 = NaN, which propagates
 *      straight into heading and then position.
 *    turnRate — server/src/game/ai/tactics.ts:816 and ai/utility.ts:518 both
 *      divide by it; the resulting Infinity/NaN steer fails the finite check in
 *      game/inputs.ts and the input is SILENTLY DROPPED, so the bots go inert
 *      while every row still reads plausible.
 *    shellSpeed / speed (torpedo) — server/src/game/ai/tactics.ts:277
 *      `hypot(...) / speed` in the lead solve, same silent-drop ending; a
 *      0 u/s projectile also never leaves the muzzle.
 *    hp — seeds EffectiveStats.maxHp (shared/src/sim/stats.ts:285) and
 *      server/src/game/world.ts:4075 divides by it (`ship.hp /
 *      ship.stats.maxHp`) with no guard, so a 0-hp class NaNs the damage-band
 *      read and smokes every tick on top of being one-shot by anything.
 *  Deliberately an EXPLICIT named set rather than a pattern: a floor is a
 *  refusal to run an arm, so each one is justified by a real call site. */
const TUNE_MIN_ONE_LEAVES = new Set(['steerageSpeed', 'turnRate', 'shellSpeed', 'speed', 'hp']);

/** The per-key --tune floor. Reload/cooldown leaves are matched by
 *  CASE-INSENSITIVE SUFFIX, not by exact leaf name: `radarBuoy.gunReloadMs` is
 *  a genuine reload in the same divide-or-spin class as `gun.reloadMs` and an
 *  exact match let it through at floor 0. `cooldownms` is kept in the rule even
 *  though no CONFIG leaf uses it today — this names a HAZARD CLASS, and a
 *  future `<equipment>.cooldownMs` must inherit the floor by existing, not by
 *  someone remembering to come back here. */
function tuneFloor(key: string): number {
  const leaf = key.slice(key.lastIndexOf('.') + 1);
  const lower = leaf.toLowerCase();
  if (lower.endsWith('reloadms') || lower.endsWith('cooldownms')) return 1;
  return TUNE_MIN_ONE_LEAVES.has(leaf) ? 1 : 0;
}

/** Floor-check a --tune VALUE (arg-parse time and again at apply time). A dial
 *  the sim ticks down to zero and divides by is the same divide-or-spin hazard
 *  class as MIN_ONE_KEYS, and on the equipment surface that class is the
 *  reload/cooldown leaves (a 0ms reload is an every-tick weapon, and
 *  rescaleReloadTimers divides by the old value) plus the kinematics/ballistics
 *  leaves the sim divides by — see tuneFloor. Everything else may legitimately
 *  be 0 — `gun.burstRadius=0` is what ARMOR-PIERCING already does, and a
 *  0-damage arm is a real control. */
export function validateTuneValue(key: string, value: number): void {
  const floor = tuneFloor(key);
  if (!Number.isFinite(value) || value < floor) {
    throw new TunableError(`'${key}': expected a finite value >= ${floor}, got '${value}'`);
  }
}

/**
 * Apply a set of overrides by structured mutation; returns a restore closure
 * that puts every original value back (reverse order). Call BEFORE constructing
 * any World — CONFIG reads are live, so already-running sims must not exist.
 *
 * `tune` (the --tune equipment surface) folds into the SAME undo list and the
 * SAME single restore closure, so a sweep grid or a labelled balance arm
 * restores between variants exactly as it always has — one mechanism, not two.
 */
export function applyOverrides(
  set: Readonly<Record<string, number>>,
  tune: Readonly<Record<string, number>> = {},
): () => void {
  const undo: { leaf: Leaf; prev: number }[] = [];
  const write = (key: string, value: number, allowTune: boolean): void => {
    const leaf = resolveLeaf(key, allowTune);
    // Defense in depth: programmatic callers bypass the CLI's parse-time check.
    if (allowTune) validateTuneValue(key, value);
    else validateTunableValue(key, value);
    undo.push({ leaf, prev: leaf.obj[leaf.prop] });
    leaf.obj[leaf.prop] = value;
  };
  const rollback = (): void => {
    for (const u of undo.reverse()) u.leaf.obj[u.leaf.prop] = u.prev;
  };
  // ALL-OR-NOTHING. A throw partway through used to leave every earlier key
  // mutated with no closure returned to put it back — and because a sweep grid
  // applies and restores per variant, the NEXT variant would then run on a
  // silently poisoned CONFIG and report its numbers as if nothing were wrong.
  // A failed apply must leave CONFIG exactly as it found it.
  try {
    for (const key of Object.keys(set)) write(key, set[key], false);
    for (const key of Object.keys(tune)) write(key, tune[key], true);
  } catch (err) {
    rollback();
    throw err;
  }
  return rollback;
}
