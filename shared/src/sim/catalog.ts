// THE CATALOG (Story 8.1) — catalog v3, Eric's authored sheet
// (`_bmad-output/planning-artifacts/gdds/.../catalog-v3.md`) expressed as data.
// 29 card LINES / 114 physical cards: 11 equipment lines (55), 5 universal
// ladders (22), the deck-gun family (7), 5 add-ons (5), 5 consumables (25).
//
// A LINE is `{ id, kind, cap, tiers[] }`. `cap` is BOTH the physical copy count
// and the number of tiers, pinned equal by validateCatalog: holding copy k
// (1-based) applies `tiers[k-1]`, so a line's whole ladder is authored in one
// place and the fold needs no per-line arithmetic.
//
// THE TIER CONVENTION (catalog-v3 §4): for an EQUIPMENT line, copy 1 IS the
// weapon (tier I, the bare fit) and copies 2–5 are the four upgrade steps;
// for the DECK GUN, which is slotless and always fitted, tier I is already
// equipped and copy 1 is a real upgrade step.
//
// WHAT 8.1 AUTHORS AND WHAT IT DOES NOT. The five universal ladders and the
// deck-gun family carry REAL content, because they replace shipped v2 lines.
// Every equipment line carries copy 1 (`slotFill`) and FOUR EMPTY TIERS —
// Stories 8.12–8.16 fill them from catalog-v3 §4, and the −5 %/tier reload step
// is NOT one of those effects (it is derived from the tier in
// sim/stats.ts clampStats, see there). Consumables stock and nothing else.
//
// STUB LINES (`stub: true`) are lines whose MECHANISM does not exist yet. They
// are authored in full shape so the catalog is complete and the ids are final,
// and they are EXCLUDED from `buildDeck()` — so they can never be offered, and
// no card in a live deck is a dead card (Eric ruling 2026-09-15: stay playable).
//
// CATALOG CONTENT IS WIRE CONTRACT: adding, removing or changing any entry
// REQUIRES a PROTOCOL_VERSION bump (shared/src/index.ts). Line ids ride the
// wire and both sides resolve them FAIL-CLOSED (unknown id silently dropped) —
// the PV join gate is the only desync guard.

import type { EquipmentId } from './loadout.js';
import { EQUIPMENT_IDS } from './loadout.js';
import {
  BOON_STAT_PATH_SET,
  CONSUMABLE_IDS,
  DOCTRINE_MODES,
  doctrineEffect,
  statEffect,
  type BoonBehaviorEffect,
  type BoonDoctrineEffect,
  type BoonEffect,
  type BoonStatEffect,
  type BoonStockEffect,
  type ConsumableId,
  type DoctrineWeapon,
} from './effects.js';

/**
 * THE 29 LINE IDS, in catalog order (Eric ruling 2026-09-15, amendment 7).
 * This order IS the fold order and the `buildDeck()` composition order, so it
 * is part of the determinism contract — never re-sort it.
 */
export const LINE_IDS = [
  // --- the five universal ladders (catalog-v3 §4) --------------------------
  'armor',
  'speed',
  'turning',
  'radarSweep',
  'reload',
  // --- the deck-gun family (slotless, always fitted) -----------------------
  'deckGun',
  'deckGunTurret',
  'deckGunBarrel',
  // --- the eleven equipment lines ------------------------------------------
  'lightTorpedo',
  'heavyTorpedo',
  'supercavTorpedo',
  'navalMines',
  'captiveMines',
  'missile',
  'machineGun',
  'flak',
  'monitor',
  'broadside',
  'starShells',
  // --- the five consumables -------------------------------------------------
  'hullRepair',
  'shieldBlock',
  'smokeScreen',
  'chaff',
  'decoyBuoy',
  // --- the five add-ons -----------------------------------------------------
  'acousticHoming',
  'foulingMines',
  'heatSeeking',
  'dazzleShells',
  'phosphorShells',
] as const;

/** One of the 29 authored card lines. */
export type LineId = (typeof LINE_IDS)[number];

/**
 * The four card KINDS of catalog v3 (the refit card's meta word, Eric ruling
 * 2026-09-15 amendment 8): an `equipment` line whose copy 1 fits a weapon, a
 * universal `ladder` of stat steps, an `addon` that bolts a verb onto equipment
 * it names, a `consumable` whose copies stock a rack.
 */
export type LineKind = 'equipment' | 'ladder' | 'addon' | 'consumable';

/**
 * One catalog card LINE.
 *
 * - `cap` — physical copies in the catalog AND `tiers.length` (pinned equal).
 * - `tiers` — copy k applies `tiers[k-1]`. An EMPTY tier is legal and means
 *   "this step exists but 8.1 does not author its content" (every equipment
 *   line's tiers II–V).
 * - `appliesTo` — for an `addon`, the equipment it bolts onto; for the
 *   `deckGun` LADDER, the single equipment row whose TIER its copies advance
 *   (the deck gun is slotless, so it has no `slotFill` to read the target off).
 * - `stub` — the mechanism does not exist yet: excluded from `buildDeck()`.
 * - `healOnGrant` — the grant heals the granted maxHp delta (ARMOR only).
 */
export interface CatalogLine {
  id: LineId;
  kind: LineKind;
  cap: number;
  tiers: readonly (readonly BoonEffect[])[];
  appliesTo?: readonly EquipmentId[];
  stub?: true;
  healOnGrant?: true;
}

/** A catalog, keyed by line id. Injectable wherever ids resolve to lines
 *  (tests inject their own); production passes CATALOG. */
export type Catalog = Readonly<Record<string, CatalogLine>>;

/** Freeze the catalog AND every line inside it (the HOOK_REGISTRY /
 *  SIGNAL_REGISTRY deep-freeze discipline). */
const deepFreezeRows = <T extends object>(rows: T): Readonly<T> => {
  for (const key of Object.keys(rows) as (keyof T)[]) Object.freeze(rows[key]);
  return Object.freeze(rows);
};

// ---------------------------------------------------------------------------
// Authoring helpers. Every NUMBER below cites its catalog-v3 line; nothing is
// invented (Story 8.1 block condition).
// ---------------------------------------------------------------------------

/** A universal ladder: `cap` identical steps of `effects`. */
function ladder(
  id: LineId,
  cap: number,
  effects: readonly BoonEffect[],
  extra: { healOnGrant?: true; appliesTo?: readonly EquipmentId[] } = {},
): CatalogLine {
  return { id, kind: 'ladder', cap, tiers: Object.freeze(new Array<readonly BoonEffect[]>(cap).fill(effects)), ...extra };
}

/**
 * An equipment line: copy 1 fits `equipmentId` (tier I = the bare weapon,
 * catalog-v3 §4 standing rule); tiers II–V are EMPTY until Stories 8.12–8.16
 * author them. `stub` marks a weapon whose module does not exist yet.
 */
function weapon(id: LineId, equipmentId: EquipmentId, stub?: true): CatalogLine {
  const tiers: readonly BoonEffect[][] = [[{ kind: 'slotFill', equipmentId }], [], [], [], []];
  const line: CatalogLine = { id, kind: 'equipment', cap: 5, tiers: Object.freeze(tiers) };
  return stub === undefined ? line : { ...line, stub };
}

/** A one-copy add-on: one `doctrine` verb per equipment it applies to. */
function addon(id: LineId, appliesTo: readonly DoctrineWeapon[], mode: string, stub?: true): CatalogLine {
  const tiers = Object.freeze([Object.freeze(appliesTo.map((eq) => doctrineEffect(eq, mode)))]);
  const line: CatalogLine = { id, kind: 'addon', cap: 1, tiers, appliesTo };
  return stub === undefined ? line : { ...line, stub };
}

/** A cap-5 consumable: every copy stocks one use. Always a stub today — the
 *  rack itself is Story 8.7. */
function consumable(id: LineId & ConsumableId): CatalogLine {
  const stock: BoonStockEffect = { kind: 'stock', equipmentId: id };
  return { id, kind: 'consumable', cap: 5, tiers: Object.freeze(new Array<readonly BoonEffect[]>(5).fill([stock])), stub: true };
}

/**
 * THE production catalog — catalog v3. Key order IS `LINE_IDS` order (pinned).
 *
 * Every authored number cites its ruling:
 *   ARMOR   R8  — +25 max hp per tier, 4 tiers, heals on grant.
 *   SPEED   R10 — +2.5 u/s forward max per tier, 4 tiers, reverse untouched.
 *   TURNING R6  — flat +0.05 rad/s per tier, 4 tiers. [DRAFT]
 *   RADAR SWEEP R11 — +3 rpm per tier, 5 tiers (the 30 rpm clamp stays).
 *   RELOAD  R12 — −5 % per tier, 5 tiers, cap 25 % (cooldownScale 1.0 → 0.75).
 *   DECK GUN R14 — +1.25 damage AND −5 % own reload per tier, 4 tiers; the
 *                  reload half is DERIVED from the tier in clampStats.
 *   DECK GUN TURRET R15 — pool 1 → 2, one copy.
 *   DECK GUN BARREL R16 — +1 barrel per copy, two copies.
 *   ACOUSTIC HOMING R22 · FOULING MINES R28 · HEAT SEEKING R32 ·
 *   DAZZLE / PHOSPHOR SHELLS R33.
 */
export const CATALOG: Catalog = deepFreezeRows({
  // --- the five universal ladders ------------------------------------------
  // ARMOR (R8): +25 max hp per tier, 4 tiers (TB 350 / ML 400 / BS 450 at cap);
  // the grant HEALS the granted delta — still the ONLY heal path.
  armor: ladder('armor', 4, [statEffect('maxHp', { add: 25 })], { healOnGrant: true }),
  // SPEED (R10): +2.5 u/s of FORWARD top speed per tier, 4 tiers. Reverse is
  // explicitly untouched — no constant add preserves the reverse:forward ratio
  // across three hulls.
  speed: ladder('speed', 4, [statEffect('kinematics.maxSpeed', { add: 2.5 })]),
  // TURNING (R6): flat +0.05 rad/s per tier, 4 tiers (+0.2 at the cap — flat,
  // not proportional, so it helps the slow hulls most). // [DRAFT] — first-pass
  // value, harness-tuned once bots run v3 decks.
  turning: ladder('turning', 4, [statEffect('kinematics.turnRate', { add: 0.05 })]),
  // RADAR SWEEP (R11): +3 rpm per tier, 5 tiers, 15 → 30 rpm. The ratified
  // 30 rpm ceiling stays in clampStats and is what makes a 6th copy impossible
  // to exploit even if one existed.
  radarSweep: ladder('radarSweep', 5, [statEffect('sweepRpm', { add: 3 })]),
  // RELOAD (R12): −5 % per tier, 5 tiers, cap 25 % — cooldownScale 1.0 → 0.75
  // exactly (round3 in clampStats kills the additive float dust). ADDITIVE, so
  // stacking is linear rather than 0.95^N. Scope (R40): every equipment reload
  // AND the Shift boost cooldown; consumables have no reload.
  reload: ladder('reload', 5, [statEffect('cooldownScale', { add: -0.05 })]),
  // --- the deck-gun family --------------------------------------------------
  // DECK GUN (R14): +1.25 damage per tier, 4 tiers (15 → 20). The OTHER half of
  // the line — −5 % own reload per tier — is NOT an effect: it is derived from
  // `equipment.gun.tier` in clampStats, exactly as every equipment line's step
  // is, so there is one reload derivation in the engine rather than two.
  // `appliesTo: ['gun']` is how this ladder names the row whose tier it moves.
  deckGun: ladder('deckGun', 4, [statEffect('equipment.gun.damage', { add: 1.25 })], { appliesTo: ['gun'] }),
  // DECK GUN TURRET (R15): the gun pool 1 → 2, one copy.
  deckGunTurret: ladder('deckGunTurret', 1, [statEffect('equipment.gun.maxAmmo', { add: 1 })]),
  // DECK GUN BARREL (R16): +1 barrel per copy, two copies (1 → 3 parallel
  // shells 12u apart, full damage each).
  deckGunBarrel: ladder('deckGunBarrel', 2, [statEffect('equipment.gun.barrels', { add: 1 })]),
  // --- the eleven equipment lines -------------------------------------------
  // Copy 1 fits the weapon; tiers II–V are EMPTY this cycle (8.12–8.16).
  lightTorpedo: weapon('lightTorpedo', 'lightTorpedo', true), // R18 — module is Story 8.13
  heavyTorpedo: weapon('heavyTorpedo', 'heavyTorpedo'), // R17 — the shipped torpedo, renamed
  supercavTorpedo: weapon('supercavTorpedo', 'supercavTorpedo', true), // R19 — Story 8.13
  navalMines: weapon('navalMines', 'navalMines'), // R23 — the shipped mine, renamed
  captiveMines: weapon('captiveMines', 'captiveMines', true), // R25 — Story 8.13
  missile: weapon('missile', 'missile', true), // R29 — Story 8.14
  machineGun: weapon('machineGun', 'machineGun', true), // R20/R21 — Story 8.14
  flak: weapon('flak', 'flak', true), // R26/R27 — Story 8.14
  monitor: weapon('monitor', 'monitor', true), // R30 — Story 8.14
  broadside: weapon('broadside', 'broadside'), // R35 — shipped
  starShells: weapon('starShells', 'starShells'), // R31 — shipped
  // --- the five consumables (R13, R36–R39) ----------------------------------
  // All stubs: the rack, the `1`–`4` rail and every effect are Story 8.7.
  hullRepair: consumable('hullRepair'),
  shieldBlock: consumable('shieldBlock'),
  smokeScreen: consumable('smokeScreen'),
  chaff: consumable('chaff'),
  decoyBuoy: consumable('decoyBuoy'),
  // --- the five add-ons ------------------------------------------------------
  // ACOUSTIC HOMING (R22): one card homes EVERY torpedo you carry — light and
  // heavy, never the supercavitating straight-runner.
  acousticHoming: addon('acousticHoming', ['lightTorpedo', 'heavyTorpedo'], 'homing'),
  // FOULING MINES (R28): naval mines ONLY — the captive's fish is a torpedo and
  // does not foul.
  foulingMines: addon('foulingMines', ['navalMines'], 'propFouling'),
  // HEAT SEEKING (R32): the acoustic-homing numbers on the missile. Stub —
  // the missile itself is Story 8.14.
  heatSeeking: addon('heatSeeking', ['missile'], 'homing', true),
  // DAZZLE (R33): enemies inside the lit zone see at ×0.5; never changes the
  // lit radius. Stacks with phosphor on one flare.
  dazzleShells: addon('dazzleShells', ['starShells'], 'dazzle'),
  // PHOSPHOR (R33/R34): 5 hp/s burn inside 0.8× the lit radius; never changes
  // the lit radius.
  phosphorShells: addon('phosphorShells', ['starShells'], 'phosphor'),
});

/** The immutable zero-cards list — the shared allocation-free identity for
 *  every zero-card fast path (server record cache, client resolve). */
export const NO_CARDS: readonly LineId[] = Object.freeze([]);

/** True iff `id` names a STUB line — authored in shape, mechanism not built,
 *  never dealt into a deck (and therefore never offered). */
export function isStubLine(id: string, catalog: Catalog = CATALOG): boolean {
  if (!Object.hasOwn(catalog, id)) return false;
  return catalog[id]?.stub === true;
}

/**
 * Resolve a card-id list to its catalog lines, FAIL-CLOSED: an unknown id is
 * silently dropped (never a throw — a junk id on the wire must not take the
 * client down), known ids keep list order, REPEATED ids resolve each time
 * (that is how copies stack).
 */
export function resolveCards(ids: readonly string[], catalog: Catalog = CATALOG): readonly CatalogLine[] {
  const out: CatalogLine[] = [];
  for (const id of ids) {
    // OWN-PROPERTY ONLY: a plain-object catalog answers `catalog['constructor']`
    // with Object.prototype.constructor. Object.hasOwn is the fail-closed gate
    // on EVERY catalog/registry lookup in the engine.
    if (!Object.hasOwn(catalog, id)) continue;
    const line = catalog[id];
    if (line !== undefined) out.push(line);
  }
  return out;
}

/**
 * Copies held per LINE, capped at each line's `cap`, in CATALOG key order —
 * THE structure the stat fold consumes. Counting first and folding in catalog
 * order (never card-list order) is what makes `effectiveStats` byte-identical
 * under any permutation of the same multiset. Unknown ids are dropped.
 */
export function cardCounts(ids: readonly string[], catalog: Catalog = CATALOG): Map<string, number> {
  const raw = new Map<string, number>();
  for (const id of ids) {
    if (!Object.hasOwn(catalog, id)) continue;
    raw.set(id, (raw.get(id) ?? 0) + 1);
  }
  const counts = new Map<string, number>();
  for (const key of Object.keys(catalog)) {
    const n = raw.get(key);
    const line = catalog[key];
    if (n === undefined || line === undefined) continue;
    counts.set(key, Math.min(n, line.cap));
  }
  return counts;
}

/** Occurrences of `id` in a fitted-card list — THE stack count (repeats are
 *  legal; `cap` caps them physically via the deck). */
export function boonStackCount(cards: readonly string[], id: string): number {
  let n = 0;
  for (const c of cards) if (c === id) n += 1;
  return n;
}

/**
 * The equipment row whose TIER a line's copies advance, or undefined. An
 * `equipment` line reads it off copy 1's `slotFill`; the DECK GUN ladder names
 * it in `appliesTo` (it is slotless, so it has no slotFill to read). Add-ons
 * have `appliesTo` too and deliberately do NOT advance any tier — they bolt a
 * verb on, they are not a rung.
 */
export function tierTargetOf(line: CatalogLine): EquipmentId | undefined {
  if (line.kind === 'equipment') {
    const fill = line.tiers[0]?.find((e) => e.kind === 'slotFill');
    return fill?.kind === 'slotFill' ? fill.equipmentId : undefined;
  }
  if (line.kind === 'ladder') return line.appliesTo?.[0];
  return undefined;
}

// ---------------------------------------------------------------------------
// Authoring-time validation. Pure and throw-free: every validator returns a
// list of human-readable problems (empty = valid). Run over CATALOG in tests,
// and available to any tool that authors an injected catalog.
// ---------------------------------------------------------------------------

const EQUIPMENT_ID_SET: ReadonlySet<string> = new Set(EQUIPMENT_IDS);
const CONSUMABLE_ID_SET: ReadonlySet<string> = new Set(CONSUMABLE_IDS);
const LINE_KINDS: readonly string[] = ['equipment', 'ladder', 'addon', 'consumable'];

/** Problems with one STAT effect. */
function validateStatEffect(e: BoonStatEffect, tag: string): string[] {
  const errs: string[] = [];
  if (!BOON_STAT_PATH_SET.has(e.path)) errs.push(`${tag}: off-whitelist stat path '${e.path}'`);
  if (e.mult === undefined && e.add === undefined) errs.push(`${tag}: stat effect moves nothing`);
  if (e.mult !== undefined && (!Number.isFinite(e.mult) || e.mult <= 0)) errs.push(`${tag}: mult must be finite and > 0`);
  if (e.add !== undefined && (!Number.isFinite(e.add) || e.add === 0)) errs.push(`${tag}: add must be finite and non-zero`);
  return errs;
}

/** Problems with one DOCTRINE effect. */
function validateDoctrineEffect(e: BoonDoctrineEffect, tag: string): string[] {
  if (!Object.hasOwn(DOCTRINE_MODES, e.weapon)) return [`${tag}: doctrine on non-doctrine equipment '${e.weapon}'`];
  const modes = DOCTRINE_MODES[e.weapon as DoctrineWeapon] as readonly string[];
  if (!modes.includes(e.mode)) return [`${tag}: unknown doctrine mode '${e.mode}' for '${e.weapon}'`];
  return [];
}

/** Problems with one BEHAVIOR effect. */
function validateBehaviorEffect(e: BoonBehaviorEffect, tag: string): string[] {
  if (typeof e.hookId !== 'string' || e.hookId.length === 0) return [`${tag}: behavior needs a hookId`];
  return [];
}

/** Problems with one EFFECT of a line. */
function validateEffect(e: BoonEffect, tag: string): string[] {
  if (e.kind === 'stat') return validateStatEffect(e, tag);
  if (e.kind === 'slotFill') {
    return EQUIPMENT_ID_SET.has(e.equipmentId) ? [] : [`${tag}: slotFill of unknown equipment '${e.equipmentId}'`];
  }
  if (e.kind === 'doctrine') return validateDoctrineEffect(e, tag);
  if (e.kind === 'stock') {
    return CONSUMABLE_ID_SET.has(e.equipmentId) ? [] : [`${tag}: stock of unknown consumable '${e.equipmentId}'`];
  }
  if (e.kind === 'behavior') return validateBehaviorEffect(e, tag);
  return [`${tag}: unknown effect kind`];
}

/** Problems with a line's optional flags (helper of validateShape). */
function validateFlags(line: CatalogLine): string[] {
  const errs: string[] = [];
  if (line.stub !== undefined && line.stub !== true) errs.push(`${line.id}: stub may only be true`);
  for (const eq of line.appliesTo ?? []) {
    if (!EQUIPMENT_ID_SET.has(eq)) errs.push(`${line.id}: appliesTo unknown equipment '${eq}'`);
  }
  if (line.healOnGrant !== undefined && line.healOnGrant !== true) errs.push(`${line.id}: healOnGrant may only be true`);
  if (line.healOnGrant === true) {
    const heals = line.tiers.some((t) => t.some((e) => e.kind === 'stat' && e.path === 'maxHp' && (e.add ?? 0) > 0));
    if (!heals) errs.push(`${line.id}: healOnGrant requires a positive maxHp add effect`);
  }
  return errs;
}

/** Problems with a line's kind/cap/tiers row. THE `tiers.length === cap` PIN
 *  lives here: copy k applies tiers[k-1], so a short ladder would silently give
 *  the last copies nothing and a long one would author unreachable steps. */
function validateShape(line: CatalogLine): string[] {
  const errs: string[] = [];
  if (!LINE_KINDS.includes(line.kind)) errs.push(`${line.id}: unknown kind '${line.kind}'`);
  if (!Number.isInteger(line.cap) || line.cap < 1) errs.push(`${line.id}: cap must be an integer ≥ 1`);
  if (line.tiers.length !== line.cap) errs.push(`${line.id}: tiers.length ${line.tiers.length} ≠ cap ${line.cap}`);
  errs.push(...validateFlags(line));
  return errs;
}

/**
 * Validate ONE catalog line (authoring-time). Returns problems, empty = valid:
 * camelCase id, known kind, `tiers.length === cap`, valid effects, coherent
 * `healOnGrant`, real `appliesTo` equipment.
 */
export function validateLine(line: CatalogLine): string[] {
  const errs: string[] = [];
  if (typeof line.id !== 'string' || !/^[a-z][A-Za-z0-9]*$/.test(line.id)) errs.push(`'${String(line.id)}': id must be camelCase`);
  line.tiers.forEach((tier, t) => {
    tier.forEach((e, i) => errs.push(...validateEffect(e, `${line.id} tier ${t + 1}[${i}]`)));
  });
  errs.push(...validateShape(line));
  return errs;
}

/**
 * THE ORDER-INDEPENDENCE RULE (Story 8.1). `effectiveStats` folds lines in
 * CATALOG order, so a permutation of the CARD LIST can never change the
 * result — but a path that takes `add` from one line and `mult` from another
 * is still a latent order hazard the moment anything reorders the catalog, and
 * it makes the two ladders' interaction impossible to reason about. So it is
 * refused at authoring time, across lines AND across tiers.
 */
function validateNoAddMultCollision(catalog: Catalog): string[] {
  const adders = new Map<string, string>();
  const multipliers = new Map<string, string>();
  for (const [line, e] of everyStatEffect(catalog)) {
    if (e.add !== undefined) adders.set(e.path, adders.get(e.path) ?? line.id);
    if (e.mult !== undefined) multipliers.set(e.path, multipliers.get(e.path) ?? line.id);
  }
  const errs: string[] = [];
  for (const [path, addLine] of adders) {
    const multLine = multipliers.get(path);
    if (multLine !== undefined) {
      errs.push(`stat path '${path}' takes add (${addLine}) and mult (${multLine}) — order-dependent, refused`);
    }
  }
  return errs;
}

/** Every `stat` effect in a catalog, paired with the line that authored it. */
function everyStatEffect(catalog: Catalog): [CatalogLine, BoonStatEffect][] {
  const out: [CatalogLine, BoonStatEffect][] = [];
  for (const key of Object.keys(catalog)) {
    const line = catalog[key];
    if (line === undefined) continue;
    for (const tier of line.tiers) {
      for (const e of tier) if (e.kind === 'stat') out.push([line, e]);
    }
  }
  return out;
}

/**
 * Validate a whole catalog: every line valid, every key equal to its line's id,
 * and NO stat path receiving both `add` and `mult`. Returns problems, empty =
 * valid. The production CATALOG passes (pinned in catalog.test.ts).
 */
export function validateCatalog(catalog: Catalog = CATALOG): string[] {
  const errs: string[] = [];
  for (const key of Object.keys(catalog)) {
    const line = catalog[key];
    if (line === undefined) continue;
    if (line.id !== key) errs.push(`catalog key '${key}' does not match line id '${line.id}'`);
    errs.push(...validateLine(line));
  }
  errs.push(...validateNoAddMultCollision(catalog));
  return errs;
}

/** Total physical cards in a catalog (Σ cap) — 114 for catalog v3. */
export function catalogCardCount(catalog: Catalog = CATALOG): number {
  let n = 0;
  for (const key of Object.keys(catalog)) n += catalog[key]?.cap ?? 0;
  return n;
}
