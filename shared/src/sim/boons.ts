// Boon effect engine (Story 2.5) + Boon Catalog v1 (Story 2.8) — the ratified
// "two homes + hooks" law (epics AR4; Epic 2 amendments 28–30, 38–46). A boon
// is one card LINE `{ id, category, rarity, copies, effects[] }` and applying
// one may touch exactly these lawful paths:
//   1. `stat` effects flow ONLY through effectiveStats() (sim/stats.ts calls
//      applyBoonStats — the desync firewall stays intact);
//   2. `doctrine` effects fold ONLY into the per-weapon DOCTRINE STATE of
//      EffectiveStats (same fold, same firewall — the doctrines are data +
//      bespoke shared modifiers, the boost precedent; HOOK_REGISTRY stays
//      EMPTY, amendment 30 satisfied without new hook plumbing). Since Story
//      7-5 wave 1 that state is one INDEPENDENT BOOLEAN PER VERB on torpedo/
//      mine/starShells, because verbs now stack; only the cannon still holds a
//      single-valued `mode` enum;
//   3. `slotFill`/`slotReplace` effects mutate ONLY the one LoadoutSlot[]
//      structure, through applySlotEffect below — used INCREMENTALLY by the
//      server and REPLAYED by the client over loadoutFor output;
//   4. `behavior(hookId, params)` executes registered hooks (sim/hooks.ts)
//      per-tick on BOTH sides, so prediction survives.
// Nothing else moves — a stat-only boon leaves the loadout reference-equal, a
// slot-only boon leaves stats byte-identical (property-pinned in tests).
//
// BOON_CATALOG ships the FULL v1 content (amendment 42 — ladders ratified
// wholesale; step VALUES are implementer-drafted handwaves inside the ratified
// pins, 2.10 tunes). Stack count = OCCURRENCES of an id in ship.boons /
// you.boons (repeats are legal and stack); `copies` IS the cap (THE DECK
// MODEL, amendment 38). Player-facing names live CLIENT-side (boonCopy.ts).

import type { EquipmentId, LoadoutSlot } from './loadout.js';
import { SLOT_EXTRA, equipmentMaxAmmo, loadoutFor } from './loadout.js';
import { CONFIG, type HullId } from '../constants.js';
import type { CannonMode, EffectiveStats } from './stats.js';
import type { HookParams } from './hooks.js';

/** Catalog boon id (camelCase string — the registry-id convention). */
export type BoonId = string;

/** Offer/deck category a boon line belongs to (the 9 v1 categories below). */
export type BoonCategory = string;

/** Card scarcity tier (amendment 38): commons are stat cards; rares/exclusives
 *  are the qualitative nature-changers. Physical copy counts ARE the caps. */
export type BoonRarity = 'common' | 'rare' | 'exclusive';

/** The deck's three UNIVERSAL categories — always in every player's deck
 *  regardless of carried equipment (amendment 38: Intel + Ship + Gun). */
export const UNIVERSAL_CATEGORIES: readonly BoonCategory[] = ['intel', 'ship', 'guns'];

/**
 * EquipmentId -> its catalog category (subdeck membership + acquisition-card
 * category). THE single mapping the deck engine keys on — acquisitions carry
 * their equipment's category by construction.
 */
export const EQUIPMENT_CATEGORY: Readonly<Record<EquipmentId, BoonCategory>> = {
  gun: 'guns',
  torpedo: 'torpedoes',
  mine: 'mines',
  speedBoost: 'speedBoost',
  cannon: 'cannon',
  starShells: 'starShells',
  decoyBuoy: 'decoyBuoy',
};

/**
 * The known doctrine VERBS per weapon — the fold's fail-closed vocabulary AND
 * the validateBoonDef authoring gate. Story 7-5 wave 1: on torpedo/mine/
 * starShells each entry now names a BOOLEAN FIELD on EffectiveStats that the
 * fold sets true (verbs STACK — a star shell may be both phosphor and dazzle);
 * on the cannon alone it still names a value of the single-valued `mode` enum,
 * because PLUNGING FIRE and ARMOR-PIERCING genuinely contradict. Nothing else
 * about the effect shape moved. An unknown weapon or verb is a no-op.
 */
export const DOCTRINE_MODES = {
  cannon: ['arcing', 'ap'],
  torpedo: ['homing'],
  mine: ['propFouling', 'selfPropelled'],
  starShells: ['phosphor', 'dazzle'],
} as const satisfies Partial<Record<EquipmentId, readonly string[]>>;

/** A weapon that carries doctrine state on EffectiveStats (verb booleans, or
 *  the cannon's surviving `mode` enum). */
export type DoctrineWeapon = keyof typeof DOCTRINE_MODES;

/**
 * The typed whitelist of EffectiveStats scalar paths a `stat` effect may
 * address — every scalar except the derived fields (always re-derived after
 * the fold, never independently stat-addressable) and the mode fields
 * (doctrine effects' home). Derived fields: `sweepPeriodMs` (from sweepRpm),
 * and `gun.rangeU`/`cannon.rangeU`/`starShells.rangeU` (from radarRange —
 * brainstorm 2026-07-30: Intel's radarRange growth quietly buffs gun/cannon/
 * blast-torp reach too, so those three ride radarRange, they don't take their
 * own boon lines). Story 2.8 additions: the promoted damage/blast/trigger/lit
 * scalars, plus `gun.barrels` and `gun.maxAmmo` — the single-shot gun-pool
 * pin is DELIBERATELY RETIRED (AFT TURRET raises the pool; clamps live in
 * effectiveStats).
 *
 * The seven `<equipment>.reloadMs` paths STAY whitelisted even though the
 * 2026-08-04 global-cooldown ruling deleted every per-weapon reload card: a
 * future per-weapon line must still be able to compose BEFORE the global
 * `cooldownScale` multiply in clampStats. Nothing in the catalog writes them
 * today.
 *
 * STORY 7-5 WAVE 1 widened that same shape rather than narrowing the list.
 * `gun.damage`, `torpedo.damage`, `mine.damage`, `mine.maxLive`,
 * `starShells.litRadius`, `boost.maxAmmo` and `kinematics.reverseSpeed` are now
 * ALSO whitelisted-but-unwritten — their cards were deleted, the paths were
 * not. Deleting a path is only correct when the stat itself stops being
 * addressable in principle (the `sightRange` / `mine.triggerRadius` case, where
 * a card writing it would be a second derivation of a DERIVED number). A stat
 * that merely has no card behind it stays here so a future line can land
 * without touching this whitelist.
 */
export const BOON_STAT_PATHS = [
  'maxHp',
  'radarRange',
  'sweepRpm',
  // `sightRange` is DELIBERATELY ABSENT (Eric ruling 2026-08-16). It became a
  // DERIVED field — radarRange/2, re-pinned post-fold in sim/stats.ts clampStats
  // and in applyBoonStats below, exactly as the three rangeU paths are. Removing
  // it from this whitelist is what makes it structurally underivable anywhere
  // else: a future card that tried to address it would not type-check.
  // The ONE global cooldown lever (Eric ruling 2026-08-04): a top-level base-1
  // scalar multiplied into EVERY equipment reloadMs post-fold (sim/stats.ts
  // clampStats). `shipCooldown` drives it with add: -0.1 so stacking is
  // ADDITIVE-LINEAR (1.0 → 0.5 at the 5-copy cap), not 0.9^N.
  'cooldownScale',
  'kinematics.maxSpeed',
  'kinematics.reverseSpeed',
  'kinematics.accel',
  'kinematics.decel',
  'kinematics.turnRate',
  'kinematics.steerageSpeed',
  'gun.reloadMs',
  'gun.maxAmmo',
  'gun.damage',
  'gun.contactDamage',
  'gun.burstRadius',
  'gun.barrels',
  'torpedo.reloadMs',
  'torpedo.maxAmmo',
  'torpedo.speed',
  'torpedo.damage',
  'mine.reloadMs',
  'mine.maxAmmo',
  'mine.maxLive',
  'mine.damage',
  'mine.blastRadius',
  // `mine.triggerRadius` is DELIBERATELY ABSENT (Eric ruling 2026-08-16): it
  // became a DERIVED field — blastRadius × CONFIG.mine.triggerFactor — re-pinned
  // post-fold in both clampStats and applyBoonStats, exactly as sightRange and
  // the three rangeU paths are. Its card merged into `mineBlast`.
  'boost.speedBonus',
  'boost.durationMs',
  'boost.maxAmmo',
  'boost.reloadMs',
  'cannon.reloadMs',
  'cannon.maxAmmo',
  'cannon.damage',
  'cannon.contactDamage',
  'cannon.burstRadius',
  'starShells.reloadMs',
  'starShells.maxAmmo',
  'starShells.litRadius',
  'starShells.litDurationMs',
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
 * Derived-stat mutation: `value * (mult ?? 1) + (add ?? 0)` on one whitelisted
 * EffectiveStats scalar. Applied in boon-list order (deterministic), only ever
 * inside effectiveStats().
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
 *  state). No-op (silent) when `from` is unfitted. */
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

/**
 * Set a weapon's doctrine VERB on EffectiveStats (Story 2.8) — the doctrine
 * cards' declarative home. THE SHAPE OF THIS DATUM DID NOT MOVE in Story 7-5
 * wave 1; what changed is what the fold does with it. `mode` names a verb from
 * that weapon's DOCTRINE_MODES vocabulary: on torpedo/mine/starShells it is the
 * name of a BOOLEAN FIELD the fold sets true (so two verbs on one weapon
 * compose), on the cannon it is a value of the surviving `mode` enum (last
 * write wins). An unknown weapon/verb combination is a fail-closed no-op.
 */
export interface BoonDoctrineEffect {
  kind: 'doctrine';
  weapon: EquipmentId;
  mode: string;
}

/** The five-effect vocabulary — the ONLY ways a boon may touch the sim. */
export type BoonEffect =
  | BoonStatEffect
  | BoonSlotFillEffect
  | BoonSlotReplaceEffect
  | BoonBehaviorEffect
  | BoonDoctrineEffect;

/**
 * One catalog card LINE: id, category, scarcity (rarity + physical copies),
 * and its effect list. `exclusiveWith` links the two cards of a CONTRADICTORY
 * doctrine pair (symmetric, same weapon — validated); since Story 7-5 wave 1
 * the cannon pair is its only user, because every other doctrine card became
 * an independently-stackable verb. `healOnGrant` marks the grant itself as
 * healing the granted maxHp delta (shipHull — the ONLY heal path).
 */
export interface BoonDef {
  id: BoonId;
  category: BoonCategory;
  rarity: BoonRarity;
  copies: number;
  effects: readonly BoonEffect[];
  exclusiveWith?: BoonId;
  healOnGrant?: true;
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

/** Shorthand builders for the catalog table below (authoring sugar only). */
const stat = (path: BoonStatPath, over: { mult?: number; add?: number }): BoonStatEffect => ({
  kind: 'stat',
  path,
  ...over,
});
const doctrine = (weapon: DoctrineWeapon, mode: string): BoonDoctrineEffect => ({
  kind: 'doctrine',
  weapon,
  mode,
});
const acquire = (id: BoonId, equipmentId: EquipmentId): BoonDef => ({
  id,
  category: EQUIPMENT_CATEGORY[equipmentId],
  rarity: 'rare',
  copies: 1,
  effects: [{ kind: 'slotFill', equipmentId }],
});

/**
 * THE production Boon Catalog — STORY 7-5 WAVE 1 (Eric's card rewrite,
 * `7-5-decks.md`). 28 card lines across 9 categories; was 33.
 *
 * WHAT THIS PASS DID, in one paragraph. Every ladder Eric re-authored is now a
 * SHORT ladder of BIG steps at a smaller copy count (HULL/SPEED/RANGE/MINES/
 * STAR SHELLS all ×4), and seven lines are GONE outright: `gunDamage` and
 * `torpedoDamage` (Eric: *"The gun is absurdly powerful and does not need
 * damage bonuses"*), `mineDamage` and `mineMax`, `starRadius`, `boostMax` (it
 * split into the two lines BOOST DURATION and BOOST SPEED), and
 * `torpedoCommand` (COMMAND DETONATION is deleted as a mechanic). Several
 * ladders changed FORM rather than value: SPEED and RANGE became ADDITIVE
 * (+2.5 u/s, +50 u) where they used to be ×1.05 / ×1.15, and STAR SHELLS
 * became additive +1250 ms. `shipSpeed` no longer touches `reverseSpeed` at
 * all (there is no constant `add` that preserves the reverse:forward ratio
 * across three hulls, and a flat +2.5 on reverse would be +111% on the
 * battleship against +29% on its top speed).
 *
 * AND THE DOCTRINE CARDS STOPPED BEING EITHER/OR. PHOSPHOR/DAZZLE and
 * PROP-FOULING/SELF-PROPELLED are now INDEPENDENT VERBS you may hold together
 * (see EffectiveStats' boolean verb fields and applyDoctrineEffect above), so
 * they drop `exclusiveWith` and their rarity collapses from `exclusive` to
 * `rare`. `PHOSPHOR SHELLS` is a DISPLAY rename of the card whose id stays
 * `starIncendiary` — project law, the KILL LEADER precedent: a copy rename is
 * not an id rename. The `exclusive` TIER and the whole exclusivity mechanism
 * SURVIVE untouched, because the cannon pair still uses them: PLUNGING FIRE
 * and ARMOR-PIERCING really do contradict (AP hardcodes burstRadius 0), so
 * independent flags there would ship an incoherent state. That pair, and the
 * mechanism with it, is wave 2's problem.
 *
 * Player-facing names live CLIENT-side (boonCopy.ts). Stack count = OCCURRENCES
 * of an id in ship.boons / you.boons; `copies` IS the cap (THE DECK MODEL,
 * amendment 38).
 *
 * CATALOG CONTENT IS WIRE CONTRACT: adding, removing, or changing any entry
 * REQUIRES a PROTOCOL_VERSION bump (shared/src/index.ts). Boon ids ride the
 * wire and the client resolves them FAIL-CLOSED (unknown id = silently
 * dropped) — the PV join gate is the ONLY desync guard.
 */
export const BOON_CATALOG: BoonCatalog = deepFreezeRows({
  // --- guns (universal) ----------------------------------------------------
  // HEAVY SHELLS is DELETED (Eric: *"The gun is absurdly powerful and does not
  // need damage bonuses."*). `gun.damage` stays on BOON_STAT_PATHS with no card
  // behind it — the established shape (the cycle-93 FRAGMENTATION CASING
  // precedent).
  // BARREL I–II (rare ×2): +1 barrel per card (clamped 1..3). The shots fire in
  // PARALLEL lines rather than a spread — that geometry is wave 2.
  gunBarrel: { id: 'gunBarrel', category: 'guns', rarity: 'rare', copies: 2, effects: [stat('gun.barrels', { add: 1 })] },
  // EXTRA TURRET (rare ×1): gun pool 1 → 2 — the single-shot pin deliberately retired.
  gunTurret: { id: 'gunTurret', category: 'guns', rarity: 'rare', copies: 1, effects: [stat('gun.maxAmmo', { add: 1 })] },
  // --- cannon (WAVE 2: the cannon becomes the BROADSIDE BARRAGE) ------------
  // Carried forward BYTE-IDENTICAL. HEAVY CHARGE Mk I–V: 65 → 75 hp (+2/card).
  cannonDamage: { id: 'cannonDamage', category: 'cannon', rarity: 'common', copies: 5, effects: [stat('cannon.damage', { add: 2 })] },
  // PLUNGING FIRE ⚔ ARMOR-PIERCING SHELLS — THE LAST EXCLUSIVE PAIR IN THE
  // GAME, and the reason `exclusiveWith`, its symmetry validation, the deck
  // swap-out and returnCards all still exist. AP hardcodes burstRadius 0 while
  // arcing bursts on click: holding both is not a build, it is a contradiction.
  // Both cards (and the mechanism) go in wave 2 with the weapon.
  cannonArcing: { id: 'cannonArcing', category: 'cannon', rarity: 'exclusive', copies: 1, exclusiveWith: 'cannonAp', effects: [doctrine('cannon', 'arcing')] },
  cannonAp: { id: 'cannonAp', category: 'cannon', rarity: 'exclusive', copies: 1, exclusiveWith: 'cannonArcing', effects: [doctrine('cannon', 'ap')] },
  // --- torpedoes -----------------------------------------------------------
  // HEAVY WARHEAD is DELETED — `torpedo.damage` keeps its whitelisted path with
  // no card behind it.
  // TORPEDO I–IV (×4): +5 u/s per card, 60 → 80 (RATIFIED, unchanged).
  torpedoSpeed: { id: 'torpedoSpeed', category: 'torpedoes', rarity: 'common', copies: 4, effects: [stat('torpedo.speed', { add: 5 })] },
  // EXTRA TUBE (rare ×1): tube pool 1 → 2.
  torpedoTube: { id: 'torpedoTube', category: 'torpedoes', rarity: 'rare', copies: 1, effects: [stat('torpedo.maxAmmo', { add: 1 })] },
  // ACOUSTIC HOMING (rare ×1): now a lone VERB, not half an exclusive pair —
  // COMMAND DETONATION is deleted, so there is nothing left to be exclusive
  // WITH. Same effect datum it always carried.
  torpedoHoming: { id: 'torpedoHoming', category: 'torpedoes', rarity: 'rare', copies: 1, effects: [doctrine('torpedo', 'homing')] },
  // --- mines ---------------------------------------------------------------
  // MINES I–IV (×4): ×1.1 blast radius per card — AND the trip ring with it,
  // since `mine.triggerRadius` is DERIVED as `blastRadius × triggerFactor`
  // (Eric ruling 2026-08-16). TNT FILLER and DECK RACKS are both deleted;
  // `mine.damage` and `mine.maxLive` keep their whitelisted paths unwritten.
  mineBlast: { id: 'mineBlast', category: 'mines', rarity: 'common', copies: 4, effects: [stat('mine.blastRadius', { mult: 1.1 })] },
  // PROP FOULING (rare ×1): a PURE behaviour verb — no damage trade (the
  // cycle-95 ruling deleted that), and since wave 1 no longer exclusive with
  // anything. Holding it alongside SELF-PROPELLED is now a legal build.
  minePropFouling: { id: 'minePropFouling', category: 'mines', rarity: 'rare', copies: 1, effects: [doctrine('mine', 'propFouling')] },
  // SELF-PROPELLED MINES (rare ×1): carried forward as a card so the line
  // survives into wave 2, where it is reworked into CAPTIVE MINES. It loses
  // only its exclusivity here — the verb itself is untouched.
  mineSelfPropelled: { id: 'mineSelfPropelled', category: 'mines', rarity: 'rare', copies: 1, effects: [doctrine('mine', 'selfPropelled')] },
  // --- speedBoost ----------------------------------------------------------
  // `boostMax` SPLIT INTO TWO LINES (Eric): the old single card moved
  // speedBonus alone at +2/card ×5. Now duration and speed are separate buys.
  // BOOST DURATION I–IV: +1000 ms per card (6s → 10s).
  boostDuration: { id: 'boostDuration', category: 'speedBoost', rarity: 'common', copies: 4, effects: [stat('boost.durationMs', { add: 1000 })] },
  // BOOST SPEED I–II: +5 u/s per card (10 → 20 u/s over the forward cap).
  boostSpeed: { id: 'boostSpeed', category: 'speedBoost', rarity: 'common', copies: 2, effects: [stat('boost.speedBonus', { add: 5 })] },
  // --- starShells ----------------------------------------------------------
  // STAR SHELLS I–IV (×4): +1250 ms lit duration per card — ADDITIVE now
  // (10s → 15s), where the old SLOW-BURN COMPOUND ladder was ×1.1 compounding.
  // WIDE BURST is deleted; `starShells.litRadius` stays whitelisted, unwritten.
  starDuration: { id: 'starDuration', category: 'starShells', rarity: 'common', copies: 4, effects: [stat('starShells.litDurationMs', { add: 1250 })] },
  // PHOSPHOR SHELLS (rare ×1) — id UNCHANGED (`starIncendiary`): this is a
  // DISPLAY rename, and project law is that a copy rename is not an id rename.
  // The verb it sets is `phosphor`.
  starIncendiary: { id: 'starIncendiary', category: 'starShells', rarity: 'rare', copies: 1, effects: [doctrine('starShells', 'phosphor')] },
  // DAZZLE SHELLS (rare ×1): STACKS with phosphor now — a shell can burn and
  // blind. That is precisely what the verb-flag stat model exists to express.
  starDazzle: { id: 'starDazzle', category: 'starShells', rarity: 'rare', copies: 1, effects: [doctrine('starShells', 'dazzle')] },
  // --- decoyBuoy (WAVE 2: the decoy becomes the RADAR BUOY) ----------------
  // Carried forward BYTE-IDENTICAL. EXTENDED BATTERY Mk I–V: ×1.1 lifetime.
  decoyDuration: { id: 'decoyDuration', category: 'decoyBuoy', rarity: 'common', copies: 5, effects: [stat('decoyBuoy.durationMs', { mult: 1.1 })] },
  // --- intel (universal) ---------------------------------------------------
  // RANGE I–IV (×4): +50 u of INTEL RANGE per card — ADDITIVE now, where the
  // cycle-92 merged line was ×1.15 compounding. It drives `radarRange`, and the
  // whole eighths ladder rides that ONE number: detect 0.375R, sight 0.5R,
  // muzzle/smoke 0.625R, farRadar 0.875R, radar R — plus gun/cannon/starShells
  // rangeU. So the ladder ordering holds at every stack level by ARITHMETIC,
  // exactly as the merge established, and `sightRange` remains DERIVED
  // (radarRange/2) rather than stat-addressable. Top of ladder: radar 860,
  // sight 430. The ×4 copy cap is also the client radar COST cap (render cost
  // is quadratic in radarRange), and the additive step makes the top of the
  // ladder markedly cheaper than the old ×1.15⁴ ≈ 1154 u.
  intelRange: { id: 'intelRange', category: 'intel', rarity: 'common', copies: 4, effects: [stat('radarRange', { add: 50 })] },
  // INTEL I–V (×5): +3 RPM per card (15 → 30 at the ratified cap).
  intelSweep: { id: 'intelSweep', category: 'intel', rarity: 'common', copies: 5, effects: [stat('sweepRpm', { add: 3 })] },
  // --- ship (universal) ----------------------------------------------------
  // SPEED I–IV (×4): +2.5 u/s of TOP SPEED per card. It does NOT touch
  // `reverseSpeed` — the old ×1.05 card scaled both to preserve the
  // reverse:forward ratio, and no constant `add` can preserve that ratio across
  // three hulls (a flat +2.5 would be +111% on the battleship's reverse against
  // +29% on its top speed). Eric's card reads "increases ship top speed by this
  // amount", so top speed is what it moves. `kinematics.reverseSpeed` keeps its
  // whitelisted path with no card behind it.
  shipSpeed: { id: 'shipSpeed', category: 'ship', rarity: 'common', copies: 4, effects: [stat('kinematics.maxSpeed', { add: 2.5 })] },
  // HULL I–IV (×4): +25 max hp per card; the grant HEALS the granted delta
  // (healOnGrant — the ONLY heal path, amendment 38).
  shipHull: { id: 'shipHull', category: 'ship', rarity: 'common', copies: 4, healOnGrant: true, effects: [stat('maxHp', { add: 25 })] },
  // RELOAD I–V (×5): −0.10 cooldownScale per card, the ONE global cooldown
  // line (Eric ruling 2026-08-04). ADDITIVE, never multiplicative: 1.0 → 0.5 at
  // the cap. Applied once, post-fold, to EVERY equipment reloadMs (stats.ts
  // clampStats).
  shipCooldown: { id: 'shipCooldown', category: 'ship', rarity: 'common', copies: 5, effects: [stat('cooldownScale', { add: -0.1 })] },
  // --- acquisitions (rare ×1 each; category = the equipment's category) -----
  acquireTorpedo: acquire('acquireTorpedo', 'torpedo'),
  acquireMine: acquire('acquireMine', 'mine'),
  acquireStarShells: acquire('acquireStarShells', 'starShells'),
  acquireCannon: acquire('acquireCannon', 'cannon'),
  acquireDecoy: acquire('acquireDecoy', 'decoyBuoy'),
  acquireBoost: acquire('acquireBoost', 'speedBoost'),
});

/** The immutable zero-boons list — the shared allocation-free identity for
 *  every zero-boon fast path (server record cache, client resolve). */
export const NO_BOONS: readonly BoonDef[] = Object.freeze([]);

/** True iff a def is an equipment-ACQUISITION card (carries a slotFill) — the
 *  deck engine's purge/scrub predicate (amendments 38/43). */
export function isAcquisitionDef(def: BoonDef): boolean {
  return def.effects.some((e) => e.kind === 'slotFill');
}

/** Occurrences of `id` in a fitted-boon list — THE stack count (repeats are
 *  legal; `copies` caps them physically via the deck). Works on ids or defs. */
export function boonStackCount(boons: readonly (BoonDef | BoonId)[], id: BoonId): number {
  let n = 0;
  for (const b of boons) if ((typeof b === 'string' ? b : b.id) === id) n += 1;
  return n;
}

/**
 * Resolve a boon-id list to its defs, FAIL-CLOSED: an unknown id is silently
 * dropped (never a throw — a junk id on the wire must not take the client
 * down), known ids keep list order, REPEATED ids resolve each time (stacking).
 * Returns NO_BOONS (the shared identity) when nothing resolves.
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
 * incremental) and the client (slotsWithBoons, replayed over loadoutFor
 * output). `stat`/`behavior`/`doctrine` effects are structural no-ops here
 * (their homes are effectiveStats and the hook registry). Every slot edge is a
 * silent no-op: slotFill against an occupied extra slot, slotFill of equipment
 * ALREADY fitted anywhere (acquisition cards for carried equipment never enter
 * the deck, so this path is production-unreachable — pinned), slotReplace
 * against an unfitted `from`, and slotReplace with `from === to`.
 */
export function applySlotEffect(loadout: LoadoutSlot[], effect: BoonEffect, stats: EffectiveStats): void {
  if (effect.kind === 'slotFill') {
    const slot = loadout[SLOT_EXTRA];
    if (slot === undefined || slot.equipmentId !== null) return; // occupied (or malformed): no-op
    if (loadout.some((s) => s.equipmentId === effect.equipmentId)) return; // already fitted: no-op
    slot.equipmentId = effect.equipmentId;
    slot.state = freshSlotState(stats, effect.equipmentId);
    return;
  }
  if (effect.kind !== 'slotReplace') return; // stat/behavior/doctrine: not a slot home
  // Degenerate self-replace: a no-op, NOT a refit (a fresh pool would be a
  // free instant reload).
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
  // Sanity gate: EVERY whitelisted stat is a strictly POSITIVE scalar. Zero,
  // negative, NaN and Infinity are all invalid effect data — skip the
  // assignment rather than poison the stats tree. Deterministic on both sides.
  if (!Number.isFinite(v) || v <= 0) return;
  target[key] = v;
}

/**
 * Fold one doctrine effect into its weapon's doctrine state — fail-closed:
 * an unknown weapon or an unknown verb for that weapon moves nothing.
 *
 * Story 7-5 wave 1: for torpedo/mine/starShells the verb NAMES A BOOLEAN
 * FIELD on the weapon's stats block and the fold SETS IT TRUE, so two verbs on
 * one weapon compose instead of the second silently erasing the first. The
 * cannon keeps the single-valued enum assignment (last write wins), which is
 * correct there because its two doctrines contradict. The DOCTRINE_MODES
 * membership test above is what makes the dynamic field write safe: only the
 * declared verb names — which ARE the boolean field names — can reach it.
 */
function applyDoctrineEffect(stats: EffectiveStats, e: BoonDoctrineEffect): void {
  if (!Object.hasOwn(DOCTRINE_MODES, e.weapon)) return;
  const weapon = e.weapon as DoctrineWeapon;
  if (!(DOCTRINE_MODES[weapon] as readonly string[]).includes(e.mode)) return;
  if (weapon === 'cannon') {
    stats.cannon.mode = e.mode as CannonMode;
    return;
  }
  (stats[weapon] as unknown as Record<string, boolean>)[e.mode] = true;
}

/**
 * Fold every `stat` and `doctrine` effect of `boons` into `stats` IN PLACE, in
 * boon-list order (then per-def effect order) — deterministic. Consumed ONLY
 * by effectiveStats() (sim/stats.ts): the one legal path from boons to derived
 * numbers, so the desync firewall holds. Re-applies the ratified sweepRpm
 * ceiling (CONFIG.vision.sweepRpmMax — sibling of the clamp in sim/stats.ts,
 * the only two sites) and re-derives sweepPeriodMs afterward.
 */
export function applyBoonStats(stats: EffectiveStats, boons: readonly BoonDef[]): void {
  for (const def of boons) {
    for (const e of def.effects) {
      if (e.kind === 'stat') applyStatEffect(stats, e);
      else if (e.kind === 'doctrine') applyDoctrineEffect(stats, e);
    }
  }
  stats.sweepRpm = Math.min(stats.sweepRpm, CONFIG.vision.sweepRpmMax);
  stats.sweepPeriodMs = MS_PER_MINUTE / stats.sweepRpm;
  // gun/cannon/starShells range is radarRange, always (brainstorm 2026-07-30:
  // Radar Range quietly buffs gun/cannon/blast-torp reach — Intel is a
  // stealth offense category). Re-derived here (not stat-addressable —
  // BOON_STAT_PATHS omits all three rangeU paths) so an intelRadar fold
  // anywhere in the list can never leave them stale; re-pinned again in
  // sim/stats.ts clampStats, the sweepPeriodMs precedent's sibling site.
  stats.gun.rangeU = stats.radarRange;
  stats.cannon.rangeU = stats.radarRange;
  stats.starShells.rangeU = stats.radarRange;
  // THE EIGHTHS LADDER IS ONE NUMBER NOW (Eric ruling 2026-08-16): truesight is
  // the 4/8 rung of intel range, so it is DERIVED here exactly as the three
  // rangeU paths above are, and for the same reason — `sightRange` left
  // BOON_STAT_PATHS, so an `intelRange` fold anywhere in the list would
  // otherwise leave it stale. Re-pinned again in sim/stats.ts clampStats (the
  // firewall's unconditional output pass); these two are the only sites.
  stats.sightRange = stats.radarRange / 2;
  // The mine trip ring rides the blast radius (Eric ruling 2026-08-16) — same
  // reason as the re-pins above: `mine.triggerRadius` left BOON_STAT_PATHS, so a
  // `mineBlast` fold anywhere in the list would otherwise leave it stale. Also
  // re-pinned in sim/stats.ts clampStats; these two are the only sites.
  stats.mine.triggerRadius = stats.mine.blastRadius * CONFIG.mine.triggerFactor;
}

// ---------------------------------------------------------------------------
// Authoring-time catalog validation (Story 2.8 — closes the 2.5 ledger entry).
// Pure and throw-free: each validator returns a list of human-readable
// problems (empty = valid). Run over the production catalog in tests; also
// available to any tool that authors injected catalogs.
// ---------------------------------------------------------------------------

/** The real equipment ids (slotFill/slotReplace targets). */
const EQUIPMENT_IDS: ReadonlySet<string> = new Set(Object.keys(EQUIPMENT_CATEGORY));

/** Problems with one STAT effect (helper of validateEffect). */
function validateStatEffect(e: BoonStatEffect, tag: string): string[] {
  const errs: string[] = [];
  if (!BOON_STAT_PATH_SET.has(e.path)) errs.push(`${tag}: off-whitelist stat path '${e.path}'`);
  if (e.mult === undefined && e.add === undefined) errs.push(`${tag}: stat effect moves nothing`);
  if (e.mult !== undefined && (!Number.isFinite(e.mult) || e.mult <= 0)) errs.push(`${tag}: mult must be finite and > 0`);
  if (e.add !== undefined && (!Number.isFinite(e.add) || e.add === 0)) errs.push(`${tag}: add must be finite and non-zero`);
  return errs;
}

/** Problems with one SLOT effect (helper of validateEffect). */
function validateSlotEffect(e: BoonSlotFillEffect | BoonSlotReplaceEffect, tag: string): string[] {
  const errs: string[] = [];
  if (e.kind === 'slotFill') {
    if (!EQUIPMENT_IDS.has(e.equipmentId)) errs.push(`${tag}: slotFill of unknown equipment '${e.equipmentId}'`);
    return errs;
  }
  if (!EQUIPMENT_IDS.has(e.from) || !EQUIPMENT_IDS.has(e.to)) errs.push(`${tag}: slotReplace of unknown equipment`);
  if (e.from === e.to) errs.push(`${tag}: degenerate slotReplace (from === to)`);
  return errs;
}

/** Problems with one DOCTRINE effect (helper of validateEffect). */
function validateDoctrineEffect(e: BoonDoctrineEffect, tag: string): string[] {
  if (!Object.hasOwn(DOCTRINE_MODES, e.weapon)) return [`${tag}: doctrine on non-doctrine weapon '${e.weapon}'`];
  const modes = DOCTRINE_MODES[e.weapon as DoctrineWeapon] as readonly string[];
  if (!modes.includes(e.mode)) return [`${tag}: unknown doctrine mode '${e.mode}' for '${e.weapon}'`];
  return [];
}

/** Problems with one EFFECT of a def (helper of validateBoonDef). */
function validateEffect(e: BoonEffect, tag: string): string[] {
  if (e.kind === 'stat') return validateStatEffect(e, tag);
  if (e.kind === 'slotFill' || e.kind === 'slotReplace') return validateSlotEffect(e, tag);
  if (e.kind === 'doctrine') return validateDoctrineEffect(e, tag);
  if (e.kind !== 'behavior') return [`${tag}: unknown effect kind`];
  return [];
}

/** Problems with a def's rarity/copies row (helper of validateBoonDef). */
function validateScarcity(def: BoonDef): string[] {
  const errs: string[] = [];
  if (!['common', 'rare', 'exclusive'].includes(def.rarity)) errs.push(`${def.id}: unknown rarity '${def.rarity}'`);
  if (!Number.isInteger(def.copies) || def.copies < 1) errs.push(`${def.id}: copies must be an integer ≥ 1`);
  if (def.rarity === 'exclusive' && def.copies !== 1) errs.push(`${def.id}: an exclusive is always 1 copy`);
  if (def.healOnGrant !== undefined && def.healOnGrant !== true) errs.push(`${def.id}: healOnGrant may only be true`);
  if (def.healOnGrant === true) {
    const heals = def.effects.some((e) => e.kind === 'stat' && e.path === 'maxHp' && (e.add ?? 0) > 0);
    if (!heals) errs.push(`${def.id}: healOnGrant requires a positive maxHp add effect`);
  }
  return errs;
}

/** The weapon of a def's doctrine effect, if any (exclusive-pair helper). */
function doctrineWeaponOf(d: BoonDef): string | undefined {
  return d.effects.find((e): e is BoonDoctrineEffect => e.kind === 'doctrine')?.weapon;
}

/** Problems with the RIVAL side of an exclusive link (helper below). */
function validateRival(def: BoonDef, rival: BoonDef | undefined): string[] {
  if (rival === undefined) return [`${def.id}: exclusiveWith names unknown boon '${def.exclusiveWith}'`];
  const errs: string[] = [];
  if (rival.exclusiveWith !== def.id) errs.push(`${def.id}: exclusiveWith is not symmetric with '${rival.id}'`);
  if (rival.rarity !== 'exclusive') errs.push(`${def.id}: rival '${rival.id}' is not rarity 'exclusive'`);
  const w1 = doctrineWeaponOf(def);
  if (w1 === undefined || w1 !== doctrineWeaponOf(rival)) {
    errs.push(`${def.id}: exclusive pair must both carry a doctrine on the same weapon`);
  }
  return errs;
}

/**
 * Problems with a def's exclusiveWith link (helper of validateBoonDef).
 *
 * The clause `doctrine effects belong to 'exclusive' rarity only` was RETIRED
 * in Story 7-5 wave 1, deliberately and not by oversight: a doctrine effect is
 * now a VERB, and a verb that stacks with its neighbours (PHOSPHOR beside
 * DAZZLE) is a plain `rare` card. Rarity no longer says anything about whether
 * an effect is a doctrine. What survives untouched is the exclusivity
 * mechanism itself — `exclusive` rarity still REQUIRES a named rival, an
 * `exclusiveWith` link still requires `exclusive` rarity, and a pair must
 * still be symmetric and carry doctrines on the SAME weapon. The cannon pair
 * is its last user.
 */
function validateExclusiveLink(def: BoonDef, catalog: BoonCatalog): string[] {
  const errs: string[] = [];
  if (def.exclusiveWith === undefined) {
    if (def.rarity === 'exclusive') errs.push(`${def.id}: an exclusive must name its rival (exclusiveWith)`);
    return errs;
  }
  if (def.rarity !== 'exclusive') errs.push(`${def.id}: exclusiveWith requires rarity 'exclusive'`);
  const rival = Object.hasOwn(catalog, def.exclusiveWith) ? catalog[def.exclusiveWith] : undefined;
  errs.push(...validateRival(def, rival));
  return errs;
}

/**
 * Validate ONE boon def against its catalog (authoring-time; closes the 2.5
 * deferred-work entry). Returns problems, empty = valid: whitelisted stat
 * paths with finite positive values, non-empty effects, sane rarity/copies
 * (exclusives are 1 copy), symmetric same-weapon exclusive pairs, known
 * doctrine modes, real slotFill/slotReplace equipment, healOnGrant coherence.
 */
export function validateBoonDef(def: BoonDef, catalog: BoonCatalog = BOON_CATALOG): string[] {
  const errs: string[] = [];
  if (typeof def.id !== 'string' || !/^[a-z][A-Za-z0-9]*$/.test(def.id)) errs.push(`'${String(def.id)}': id must be camelCase`);
  if (typeof def.category !== 'string' || def.category.length === 0) errs.push(`${def.id}: category must be non-empty`);
  if (def.effects.length === 0) errs.push(`${def.id}: effects must be non-empty`);
  def.effects.forEach((e, i) => errs.push(...validateEffect(e, `${def.id}[${i}]`)));
  errs.push(...validateScarcity(def));
  errs.push(...validateExclusiveLink(def, catalog));
  return errs;
}

/**
 * Validate a whole catalog: every def valid under validateBoonDef, and every
 * key equal to its def's id (the registry-id convention). Returns problems,
 * empty = valid. The production BOON_CATALOG passes (pinned in tests).
 */
export function validateCatalog(catalog: BoonCatalog = BOON_CATALOG): string[] {
  const errs: string[] = [];
  for (const key of Object.keys(catalog)) {
    const def = catalog[key];
    if (def === undefined) continue;
    if (def.id !== key) errs.push(`catalog key '${key}' does not match def id '${def.id}'`);
    errs.push(...validateBoonDef(def, catalog));
  }
  return errs;
}
