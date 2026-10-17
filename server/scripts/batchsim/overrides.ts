// TUNABLE CONFIG overrides (spec: the --set/--sweep dial mechanism).
//
// CONFIG in shared/src/constants.ts is `as const` (compile-time readonly) but
// NOT Object.freeze'd at runtime — verified — so the harness applies overrides
// by in-process structured mutation of the one shared CONFIG object BEFORE any
// World/Match is constructed (orchestrator ruling: never add override seams to
// shared/). Every apply returns a restore closure; the sweep path restores
// between variants, single runs simply exit.
//
// The whitelist is EXACTLY the spec's tunable-dial surface: xp.*, offer.size,
// match.fillTo, map.baseRadius, zone.*. Anything else — even a real CONFIG
// path like gun.damage — is rejected with a clear error, so the harness can
// never quietly become a general balance-editing backdoor.
//
// `CONFIG.deck` AND `CONFIG.pool` NO LONGER EXIST (Story 8.14, amendment 89a):
// decks and the hidden match pool are retired, so the two refusals that named
// them are gone with them — those keys now fail the ordinary whitelist like any
// other unknown path. What replaced them is `offer.weighting.*`, the two
// `[DRAFT]` weighting dials (amendment 90), which ARE tunable: they sit on the
// --tune surface because they are balance numbers Eric expects to move.
// zone.* keys address the PHASED timeline shape (Story 3.1): zone.beatMs,
// zone.offsetCap, zone.stormDps, and SINCE CYCLE 169 the ring ladder by
// INDEX — zone.ringRadii.0 / .1 / .2 in world units (Story 9.1; the old
// zone.ringSteps.N exponents and zone.terminalSightFactor are gone from the
// shipped CONFIG and are refused with that advice, see RETIRED_SET_KEYS;
// resolveLeaf
// walks any dotted path, array indices included). map.baseRadius joins for the
// 3.1 map-radius × ring evidence sweeps (amendment 7).

import { CATALOG, CONFIG, TERRAIN_PARAMS, effectiveStats } from '@salvo/shared';

/** Unknown / non-tunable / non-numeric --set key — main prints and exits 2. */
export class TunableError extends Error {}

// `terrain.*` (Epic 9 tuning pass, 2026-10-06): the map-generation panel
// `TERRAIN_PARAMS` (shared/src/sim/heightField.ts) — the island cover band
// (`coverTarget`/`coverMin`/`coverMax`) and `regionWavelength`. A board dial
// like `map.baseRadius`, so it rides the --set surface. Keys are resolved
// against TERRAIN_PARAMS instead of CONFIG (see resolveLeaf); the --set
// whitelist is otherwise untouched.
const TERRAIN_PREFIX = 'terrain.';
const TUNABLE_FAMILIES = ['xp.', 'zone.', TERRAIN_PREFIX];
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
// three live blocks the doc predates (broadside, boost, and the radar buoy —
// deleted in Story 8.16) are in.
// Keep this list in step with the top-level equipment blocks of CONFIG.
const TUNE_FAMILIES = [
  'gun.',
  // Story 8.15: the two pickable guns and the two new class Shifts — every
  // number Eric ruled for them is a harness dial (amendments 97-105).
  'machineGun.',
  'flak.',
  // DECK-GUN RANGE ATTENUATION (Story 9.12, Eric 2026-10-16, epic-9
  // amendments 184–185): the ONE shared block the three deck guns read —
  // `fullFrac` on [0, 1) and `minFactor` on [0, 1] (GUN_FRACTION_KEYS), with
  // `fullFrac < 1` re-checked on the finished CONFIG (validateAttenuationDials).
  // `flak.rimFactor` (the burst's rim falloff) rides the `flak.` family above,
  // on [0, 1] too; the retired `flak.edgeFalloff` is refused by name.
  // `gun.barrels` (two at every tier, no rungs) is an integer dial in [1, 3]
  // (validateBarrels — the ceiling is clampStats's barrel clamp).
  'gunAttenuation.',
  'instantReload.',
  'hunker.',
  'broadside.',
  'torpedo.',
  'mine.',
  // CAPTIVE and FOULING MINES (Story 9.1 session 3, Eric 2026-10-08: "run
  // progressive experiments on trigger/blast radius for all types of mines")
  // — their own CONFIG blocks, so their own families: trigger ring, trigger
  // step per tier, blast, damage, slow.
  'captiveMines.',
  'foulingMines.',
  // MULTI-SPECTRAL COUNTERMEASURE (Story 9.3, Eric 2026-10-11; session 2,
  // 2026-10-12): the cloud's life and its spray-disc radii are harness dials.
  'countermeasure.',
  // FOULING SHELL (Story 9.4, Eric 2026-10-12, amendment 61): radius, life,
  // slow factor and linger are all harness dials; no floor leaf. Read the
  // arm before trusting it: `radius` 0 still stamps a hull whose outline
  // COVERS the burst point (`polyInBlast` is a distance test, 0 inside), a
  // `lingerMs` at or under the 50 ms tick slows nobody (the stamp is read
  // next tick), and a `slowFactor` above 1 is a speed-up zone (ledgered at
  // the 9.4 review gate with the fouling mine's identical factor gap).
  'foulingShell.',
  // RAMMING / CONTACT DAMAGE (Story 9.5, Eric 2026-10-12, epic-9 amendment
  // 73: "every number is a harness dial"): `energyPerHp` (the divisor of the
  // energy law — floor 1 via TUNE_MIN_ONE_LEAVES, a 0 divides by zero),
  // `grindPerUnit`, `allowanceU` and `landSoftness` (floor 0: a 0 allowance
  // prices every touch, a 0 softness makes land free — both real arms).
  // "CONTACT OFF" for an arm is BOTH `ram.allowanceU=1e9` AND
  // `ram.grindPerUnit=0`: the allowance gates only the strike, while the
  // bleed between pressed hulls and the land scrape ride `grindPerUnit`
  // alone (amendment 83) — one dial leaves the other half of contact live.
  'ram.',
  'starShells.',
  // PHOSPHOR SHELLS (Story 8.17) — reachable since Story 9.8, when its reach
  // became its own tiered dial on the twelfths ruler (ruling 125).
  'phosphorShells.',
  'boost.',
  'shipClasses.',
  // PvE FLEET ENVELOPES. `drones.<size>.hp` is the dial behind the question
  // "should a drone be worth, through damage, what its kill tier already says
  // it is worth" — at a damage->XP rate of 1/N, tier x N is the hp that makes
  // the two halves proportional. It is a COMBAT envelope (hp, gun, kinematics)
  // and so belongs on this surface rather than the --set economy whitelist,
  // even though the question that reaches for it is an economy one. The `hp`
  // leaf inherits the existing floor of 1 via TUNE_MIN_ONE_LEAVES.
  'drones.',
  // HULL REPAIR is a COMBAT dial, not an economy one, so it belongs on this
  // surface rather than the --set whitelist: `hullRepair` amounts are FLAT
  // on every hull by ruling ("no maxHp scaling, no upgrade scaling"), which
  // means any change to hull HP silently reprices every heal. A +100 HP arm
  // measured here dropped a heal from ~33% of an average hull to ~20% of one,
  // and the highest-HP hull paid most — so the heal has to be reachable to
  // tell a real class problem apart from that repricing.
  'hullRepair.',
  // OUT-OF-COMBAT REGEN (epic-8 amendment 46) rides the same surface for the
  // same reason: it is the other half of how a hull gets hp back, and the
  // fraction-of-MISSING shape means it never needs repricing with hull HP —
  // but a class read still has to be able to turn it off or up. SINCE STORY
  // 9.6 the PASSIVE HEALING ladder ADDS to these bases inside the fold
  // (+0.006 rate, −1000 ms wait per card), and the fold keeps only POSITIVE
  // results: `regen.missingPctPerS=0` is therefore "off" for an un-carded hull
  // only (a carded bot still regens at 0.006 × copies), and a wait tuned under
  // 1000 × copies saturates instead of stepping (2500 → 1500 → 500 → 500).
  // Read a regen-off arm against bots that cannot draw the ladder, or accept
  // the floor (Edge Case Hunter, 2026-10-13 gate; ledgered in deferred-work).
  'regen.',
  // ARMOR (Story 9.7, Eric 2026-10-13, epic-9 amendments 86–88): `armor.k`,
  // the K in the curve (K / (K + E) for E ≥ 0, (K − 2E) / (K − E) below zero
  // since Story 9.9, amendment 146; 100 by amendment 144), is the dial — floor
  // 1 via TUNE_MIN_ONE_LEAVES (a 0 makes every armored multiplier 0 and E = 0
  // 0/0 = NaN). The HUNKER's (was DAMAGE CUT until Story 9.9) `armorBonus`
  // rides the `hunker.` family above (floor 0, like `grindPerUnit` — the
  // default for a leaf in no floor set: a negative bonus would make HUNKER
  // amplify damage on its own user). The ARMOR / ARMOR PIERCING +20 steps
  // are catalog-authored (amendment 110's pattern), so 9.9 adds no family.
  'armor.',
  // THE WEAPON WEIGHTING (Story 8.14, epic-8 amendments 90/91) — `factor` and
  // `floor`, both `[DRAFT]` numbers Eric expects the harness to move. They are
  // on the --tune surface and not the --set whitelist for the hullRepair
  // reason: weighting decides WHICH weapon a captain is likely to be dealt, so
  // it is a combat-shape dial, not an economy one. The family prefix is
  // `offer.weighting.` rather than `offer.` so `offer.size` keeps its --set
  // home and its floor of 1.
  'offer.weighting.',
  // THE RADAR DROPOUT (Story 9.8, epic-9 amendment 104, rulings 121–123):
  // `startU` / `kneeU` (floor 1 — TUNE_MIN_ONE_KEYS) and the two paint
  // probabilities `kneeP` / `rimP` (clamped to [0, 1] — PROBABILITY_KEYS).
  // ONLY the dropout sub-block: the rest of `vision.*` is the sensor ladder
  // itself, which the shared fold and the client both derive from, so it is
  // not a harness dial.
  'vision.dropout.',
  // THE FOG FIELD (Story 9.10, Eric 2026-10-15 — "no discs", a rolling
  // fractal-noise field; every leaf of CONFIG.fog is a harness dial).
  // Floors: `sightCostPerU`, `windU`, `edgeBand` and `cutRatePerS` at 0 (each
  // a real arm — fog that costs nothing / a still field / a hard edge / a
  // frozen cut); every length, clock and count at 1 (TUNE_MIN_ONE_KEYS — a
  // 0 wavelength or march step divides, a 0 refresh or lattice spins or
  // samples nothing); `gain` on (0, 1] (FOG_GAIN_KEY — fbm persistence) and
  // the coverage band a closed share of the ring's area [0, 1]
  // (FOG_SHARE_KEYS — `coverageMax=0` is "fog off"). `coverageMin <=
  // coverageMax` is refused on the finished CONFIG in validateFogDials.
  // `spinRimU` (u/s at the rim) and `spinShear` take the generic floor of 0:
  // 0 is "no spin" / "rigid spin", both real arms (amendments 177–178; the
  // rate is a speed over the ocean radius, so no divide-by-period hazard).
  'fog.',
  // THE BOT BRAIN (Story 9.13 wave 3, spec Harness paragraph): every numeric
  // leaf of CONFIG.bots is an arm Eric may run against the posture workover's
  // baseline. Floors: the generic 0, except `disengageHysteresis` /
  // `decoyDemote` and every `gunBand.<gun>.<0|1>` on CLOSED [0, 1]
  // (BOT_FRACTION_KEYS / BOT_GUN_BAND), each band's min <= max re-checked on
  // the finished CONFIG (validateBotDials), every `nav.*` leaf at 1 except
  // `nav.clearancePenalty` (0 = no shore cost, a real arm), and the
  // `cardPoints.*` scores, which ship NEGATIVE values (`carried` −1,
  // `beltHunger.low` −1), take any finite number. `nav.cellU`,
  // `disengageHpFrac` and `healHpFrac` are REFUSED (DERIVED_TUNE_KEYS): the
  // first must equal the generator's NAV_CELL and is never read, the other
  // two are snapshotted into the profile tables at module load.
  'bots.',
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
// `mine.triggerRadius` exists in CONFIG and would be silently ignored.
//
// THE WEAPON REACHES ARE DIALS SINCE STORY 9.8 (ruling 125): every
// `<weapon>.rangeU` is the Tier I reach, read live by the fold, so it LEFT
// this map and is tunable (floor 1 — TUNE_MIN_ONE_LEAVES). Its sibling
// `<weapon>.rangeUAtV` is REFUSED (RANGE_AT_V below, the amendment-110
// pattern): the Tier V reach authors the per-card step ONCE, at module load
// (sim/catalog.ts rangeStep), so a --tune of it would change nothing.
const DERIVED_TUNE_KEYS = new Map<string, string>([
  [
    'mine.triggerRadius',
    'the trip ring is DERIVED as mine.blastRadius x CONFIG.mine.triggerFactor (Eric ruling 2026-08-16) — tune mine.blastRadius instead',
  ],
  [
    'bots.nav.cellU',
    'the nav raster IS the generator\'s NAV_CELL (sim/nav.ts) and this mirror is never read — it cannot be tuned',
  ],
  [
    'bots.disengageHpFrac',
    'server ai/profiles.ts snapshots it into every profile table at module load, so a --tune never reaches a bot',
  ],
  [
    'bots.healHpFrac',
    'server ai/profiles.ts snapshots it into every profile table at module load, so a --tune never reaches a bot',
  ],
]);

/** `<weapon>.rangeUAtV` — read once at module load (see DERIVED_TUNE_KEYS). */
const RANGE_AT_V = /\.rangeUAtV$/;

/** Refuse a path the firewall re-derives post-fold (see DERIVED_TUNE_KEYS). */
function assertNotDerived(key: string): void {
  if (RANGE_AT_V.test(key)) {
    throw new TunableError(
      `'${key}' is REFUSED: the Tier V reach authors the per-card step at module load; tune rangeU for the base`,
    );
  }
  const advice = DERIVED_TUNE_KEYS.get(key);
  if (advice !== undefined) {
    throw new TunableError(`'${key}' is a DERIVED stat — tuning it has no effect on the sim: ${advice}`);
  }
}

/** --set keys that left the shipped CONFIG with the literal ring ladder
 *  (Story 9.1, 2026-10-07). Refused with the live dial named, so an old arm
 *  script fails loudly instead of running on a silently unchanged storm. */
const RETIRED_SET_KEYS: readonly (readonly [RegExp, string])[] = [
  [/^zone\.ringSteps(\.|$)/, "retired 2026-10-07 — the ladder is literal: tune 'zone.ringRadii.N' (world units, terminal last)"],
  [/^zone\.terminalSightFactor$/, "retired 2026-10-07 — the terminal ring is 'zone.ringRadii.<last>' (world units)"],
];

/** --tune keys that left the shipped CONFIG (Story 9.12, reading r7 — the
 *  `zone.ringSteps` precedent): refused with the live dial named, so an old
 *  arm script fails loudly instead of dying on "not a numeric CONFIG entry". */
const RETIRED_TUNE_KEYS: readonly (readonly [RegExp, string])[] = [
  [
    /^flak\.edgeFalloff$/,
    "retired 2026-10-16 (Story 9.12) — the flat D − 10 rim is gone: tune 'flak.rimFactor' (fraction of the centre damage lost at the rim, [0, 1])",
  ],
];

/** The family gate, split out of resolveLeaf so the --set rejection message
 *  stays byte-identical to the one shipped before --tune existed. */
function assertKeyAllowed(key: string, allowTune: boolean): void {
  if (!allowTune) {
    for (const [pattern, advice] of RETIRED_SET_KEYS) {
      if (pattern.test(key)) throw new TunableError(`'${key}' is RETIRED: ${advice}`);
    }
  }
  if (allowTune) {
    for (const [pattern, advice] of RETIRED_TUNE_KEYS) {
      if (pattern.test(key)) throw new TunableError(`'${key}' is RETIRED: ${advice}`);
    }
    assertNotDerived(key);
    if (isTuneKey(key)) return;
    throw new TunableError(
      `'${key}' is not an equipment dial (allowed: ${TUNE_FAMILIES.map((f) => `${f}*`).join(', ')})`,
    );
  }
  if (isTunableKey(key)) return;
  throw new TunableError(
    `'${key}' is not a tunable dial (allowed: xp.*, offer.size, match.fillTo, map.baseRadius, zone.*, terrain.*)`,
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
  // `terrain.*` walks TERRAIN_PARAMS (a flat numeric panel); everything else
  // walks CONFIG. Same own-property walk, same leaf rules, different root.
  const terrain = !allowTune && key.startsWith(TERRAIN_PREFIX);
  const parts = (terrain ? key.slice(TERRAIN_PREFIX.length) : key).split('.');
  let node: unknown = terrain ? TERRAIN_PARAMS : CONFIG;
  for (const part of parts.slice(0, -1)) {
    node = step(node, part, key);
  }
  const prop = parts[parts.length - 1];
  // An array entry may be addressed ONLY by index. `zone.ringRadii.0` is a
  // documented, legitimate dial (as `zone.ringSteps.0` was before 2026-10-07); `broadside.traverseDeg.length` is a numeric
  // own property that would TRUNCATE a live CONFIG array and then run the batch
  // as if nothing had happened. The index rule admits the first and refuses the
  // second without needing to enumerate array internals — and because it is
  // generic over Array.isArray it covered `broadside.turretMountSpreadDeg` the
  // moment that field became a per-rung ladder too (2026-08-27), with no new
  // clause. Truncating EITHER of the paired broadside ladders would silently
  // desync the rung pairing effectiveStats() makes, so both are pinned.
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

/** `zone.stormDps` is a LADDER since 2026-10-07 (Story 9.1: 1/2/3/4/5 hp/s by
 *  close). The bare key still works on the --set / --sweep surface and means
 *  "flatten every rung to this value" — the pre-ramp meaning, which is what a
 *  storm-kill or storm-off arm wants; a single rung is `zone.stormDps.N`. */
const STORM_LADDER_KEY = 'zone.stormDps';

function stormLadderKeys(): string[] {
  return CONFIG.zone.stormDps.map((_, i) => `${STORM_LADDER_KEY}.${i}`);
}

/** Validate a --set/--sweep key without touching CONFIG (arg-parse time). */
export function validateTunableKey(key: string): void {
  if (key === STORM_LADDER_KEY) return; // expands to every rung at apply time
  resolveLeaf(key);
}

/** Per-key numeric FLOOR. A dial the sim divides by, or loops until it consumes,
 *  cannot legally be <= 0: `offer.size` 0 makes drawOffer return an empty offer
 *  forever (every level would bank with nothing to spend it on),
 *  `xp.levelMs` 0 makes passive accrual a divide-by-zero,
 *  `zone.beatMs` 0 collapses zoneClosedAtMs to 0 (a zero tick budget — the
 *  shared timeline fails closed, but every match would report as unresolved
 *  nonsense), and `map.baseRadius` 0 is a zero-area board. Everything else may
 *  legitimately be 0 — `zone.offsetCap=0` (concentric rings), `zone.ringSteps.N=0`
 *  (a hold-at-map-radius ring) are real evidence values. */
const MIN_ONE_KEYS = new Set(['xp.levelMs', 'offer.size', 'zone.beatMs', 'map.baseRadius', 'terrain.regionWavelength']);

/** A ring radius of 0 is the collapse ring's job (synthesized, never a dial);
 *  the geometric ladder floors at 1 u structurally, so the dial does too. */
const MIN_ONE_PATTERNS: readonly RegExp[] = [/^zone\.ringRadii\.\d+$/];

/** The cover band is a FRACTION of the ocean's area: (0, 1) exclusive. 0 is
 *  an all-water board mapgen refuses (>= 1 landmass) and 1 is all land. */
const SET_UNIT_INTERVAL_KEYS = new Set(['terrain.coverTarget', 'terrain.coverMin', 'terrain.coverMax']);

/** Floor-check a --set/--sweep VALUE (arg-parse time and again at apply time).
 *  Rejecting here is what keeps a non-positive dial from reaching a sim loop. */
export function validateTunableValue(key: string, value: number): void {
  if (SET_UNIT_INTERVAL_KEYS.has(key)) {
    if (!Number.isFinite(value) || value <= 0 || value >= 1) {
      throw new TunableError(`'${key}': expected a finite fraction in (0, 1), got '${value}'`);
    }
    return;
  }
  const floor = MIN_ONE_KEYS.has(key) || MIN_ONE_PATTERNS.some((p) => p.test(key)) ? 1 : 0;
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
 *    r0 / lifeMs (countermeasure — Story 9.3 review gate) —
 *      shared/src/sim/cloud.ts `cloudScale` divides by both r0 (`r1 / r0`)
 *      and lifeMs (`ageMs / lifeMs`): r0 = 0 makes the disc radius
 *      Infinity/NaN, so the `cloud` delivery gate reads a non-finite disc
 *      while the report reads normal; lifeMs = 0 NaNs the scale at age 0
 *      (the cloud expires at birth — an arm that measures nothing).
 *    k (armor — Story 9.7) — shared/src/sim/stats.ts `damageMultiplierFor`
 *      divides by `k + E` (E ≥ 0): k = 0 is 0/0 = NaN at E = 0 (every
 *      un-armored, un-pierced blow), which NaNs the damage gate's hp write.
 *      The negative branch (Story 9.9, amendment 146) divides by `k − E`,
 *      which is > k for E < 0, so it is bounded strictly under ×2 for every E
 *      the fold can produce (|E| ≤ a few hundred; the numerator overflows only
 *      near ±1e308, unreachable by any card or --tune) — the floor of 1 still
 *      stands for the E = 0 case.
 *  Deliberately an EXPLICIT named set rather than a pattern: a floor is a
 *  refusal to run an arm, so each one is justified by a real call site. */
const TUNE_MIN_ONE_LEAVES = new Set([
  // rangeU (Story 9.8, ruling 125 — every weapon's reach is a dial): it is the
  // aimDist / burst clamp every gun fires to, and the bots' engagement band
  // multiplies it (ai/profiles.ts engagementBand) — a 0 reach is a weapon
  // that fires into its own muzzle and a bot band collapsed to a point.
  'rangeU',
  'steerageSpeed',
  'turnRate',
  'shellSpeed',
  'speed',
  'hp',
  'r0',
  'lifeMs',
  'energyPerHp',
  'k',
]);

/** The per-key --tune floor. Reload/cooldown leaves are matched by
 *  CASE-INSENSITIVE SUFFIX, not by exact leaf name: a prefixed reload leaf
 *  (the machine gun's idle clock was one, until it was deleted 2026-09-30) is
 *  a genuine reload in the same divide-or-spin class as `gun.reloadMs` and an
 *  exact match let it through at floor 0. The suffix rule and `cooldownms`
 *  stay although no CONFIG leaf needs them today — they name a HAZARD CLASS, and a
 *  future `<equipment>.cooldownMs` must inherit the floor by existing, not by
 *  someone remembering to come back here. */
/**
 * Leaves whose only hazard is ZERO but whose legitimate range sits BELOW 1.
 *
 * `turnRate` is rad/s and ships at 0.4 / 0.6 / 0.8 across the three hulls, so
 * the blanket floor of 1 did not merely restrict it — it made the leaf
 * UNTUNABLE AT ITS OWN SHIPPED VALUES, refusing every arm including a no-op
 * one (`--tune shipClasses.battleship.kinematics.turnRate=0.4` was an error).
 * The hazard the floor exists for is the DIVIDE at ai/tactics.ts:816 and
 * ai/utility.ts:518, and that is a divide by zero, not by anything under 1 —
 * so the correct floor here is a small epsilon well clear of 0 and well below
 * any value a hull would plausibly carry.
 *
 * Checked BEFORE the min-one set, which still names `turnRate` because that
 * set documents the hazard class; this map only corrects its magnitude.
 */
const TUNE_SUB_ONE_FLOORS = new Map<string, number>([['turnRate', 0.05]]);

/** Exact --tune keys floored at 1 (Story 9.8): the dropout curve's two
 *  distances. Not leaf names — `startU` / `kneeU` are generic words, and the
 *  hazard is specific to this block (a 0 start makes every return a coin
 *  flip from the hull outward). The pair relations (start < knee < radar, rim ≤ knee
 *  probability) are refused on the finished CONFIG in validateDropoutCurve. */
const TUNE_MIN_ONE_KEYS = new Set([
  'vision.dropout.startU',
  'vision.dropout.kneeU',
  // THE FOG FIELD (Story 9.10) — see the `fog.` family note in TUNE_FAMILIES.
  'fog.targetPeriodMs',
  'fog.wavelengthU',
  'fog.octaves',
  'fog.morphMs',
  'fog.refreshMs',
  'fog.marchStepU',
  'fog.quantileLattice',
]);

/** The coverage lattice's floor (Story 9.10 review gate): under ~1/target
 *  points the (1 − target) quantile lands on the lattice maximum — coverage 0
 *  while the dial names a share. 8 a side (≈ 50 points inside the disc) is
 *  the least that still resolves the 2 % floor of the band. */
const FOG_LATTICE_KEY = 'fog.quantileLattice';
const FOG_LATTICE_FLOOR = 8;
/** Fog dials whose floor keeps the SERVER up (Story 9.10 review gate):
 *  `marchStepU` sizes the density memo (≈ (2 × radius / step)² cells — at
 *  1 u that is 100 M cells, ~800 MB per room; 5 u is ~4 M, 34 MB) and
 *  `refreshMs` is the quantile + epoch cadence (every tick at 50 ms). */
const FOG_SERVER_FLOORS = new Map<string, number>([
  ['fog.marchStepU', 5],
  ['fog.refreshMs', 250],
  [FOG_LATTICE_KEY, FOG_LATTICE_FLOOR],
]);

function tuneFloor(key: string): number {
  const serverFloor = FOG_SERVER_FLOORS.get(key);
  if (serverFloor !== undefined) return serverFloor;
  if (TUNE_MIN_ONE_KEYS.has(key)) return 1;
  if (BOT_NAV.test(key)) return key === BOT_NAV_ZERO_OK ? 0 : 1;
  const leaf = key.slice(key.lastIndexOf('.') + 1);
  const lower = leaf.toLowerCase();
  if (lower.endsWith('reloadms') || lower.endsWith('cooldownms')) return 1;
  const subOne = TUNE_SUB_ONE_FLOORS.get(leaf);
  if (subOne !== undefined) return subOne;
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
  if (validateBotRange(key, value)) return;
  if (UNIT_INTERVAL_KEYS.has(key)) return validateUnitInterval(key, value);
  if (PROBABILITY_KEYS.has(key)) return validateProbability(key, value);
  if (FOG_SHARE_KEYS.has(key)) return validateShare(key, value);
  if (GUN_FRACTION_KEYS.has(key)) return validateFraction(key, value);
  if (key === FOG_GAIN_KEY) return validateGain(key, value);
  if (key === BARRELS_KEY) return validateBarrels(key, value);
  const floor = tuneFloor(key);
  if (!Number.isFinite(value) || value < floor) {
    throw new TunableError(`'${key}': expected a finite value >= ${floor}, got '${value}'`);
  }
}

/**
 * THE TWO WEIGHTING LEAVES ARE MULTIPLIERS IN (0, 1] (Story 8.14 review, F5),
 * not merely "finite and >= 0" — the generic floor of 0 let three arms through
 * that do not measure the mechanism amendments 90/91 describe:
 *
 *   - `factor = 0` (with `floor = 0`) makes EVERY taken line weigh zero, so
 *     stage 2's cumulative walk never crosses `r` and falls through to its
 *     float-dust fallback — the LAST candidate, every time. That is not "a
 *     strong discount"; it is a deterministic pick dressed as a random one.
 *   - `floor = 0` on its own is the same trap at five takers.
 *   - `factor > 1` INVERTS the rule: a line other captains have taken becomes
 *     MORE likely, not less, while the report header still says "weighting".
 *
 * A balance harness may not produce false evidence (the same argument
 * DERIVED_TUNE_KEYS is written on), so the range is refused at the leaf. The
 * pair relation (`floor <= factor`) cannot be judged one leaf at a time and is
 * checked on the finished CONFIG in validateCrossKeyInvariants.
 */
const UNIT_INTERVAL_KEYS = new Set(['offer.weighting.factor', 'offer.weighting.floor']);

/** The dropout curve's paint probabilities (Story 9.8, ruling 121): CLOSED
 *  [0, 1] — 0 (never paints at that rung) and 1 (always paints) are both real
 *  arms; outside it is not a probability. */
const PROBABILITY_KEYS = new Set(['vision.dropout.kneeP', 'vision.dropout.rimP']);

/** The bot dials on CLOSED [0, 1] (Story 9.13 wave 3; see the `bots.` family). */
const BOT_FRACTION_KEYS = new Set(['bots.disengageHysteresis', 'bots.decoyDemote']);
/** A per-gun doctrine band end — `bots.gunBand.<gun>.0` (min) / `.1` (max). */
const BOT_GUN_BAND = /^bots\.gunBand\.[A-Za-z]+\.[01]$/;
/** The routing dials: counts / lengths / clocks, floored at 1 … */
const BOT_NAV = /^bots\.nav\./;
/** … except the shore cost, where 0 is "no penalty" (a real arm). */
const BOT_NAV_ZERO_OK = 'bots.nav.clearancePenalty';
/** The card-points scores: any finite number (the table ships −1s). */
const BOT_CARD_POINTS = /^bots\.cardPoints\./;

/** The bot dials with their OWN range (fractions, the card scores): checked
 *  here, true when handled; every other `bots.*` leaf takes the floor path. */
function validateBotRange(key: string, value: number): boolean {
  if (BOT_FRACTION_KEYS.has(key) || BOT_GUN_BAND.test(key)) {
    validateFraction(key, value);
    return true;
  }
  if (!BOT_CARD_POINTS.test(key)) return false;
  if (!Number.isFinite(value)) throw new TunableError(`'${key}': expected a finite value, got '${value}'`);
  return true;
}

/** Every gun band must stay min <= max on the finished CONFIG (Story 9.13). */
function validateBotDials(): void {
  for (const [gun, band] of Object.entries(CONFIG.bots.gunBand)) {
    const [lo, hi] = band as readonly number[];
    if (!(lo <= hi)) {
      throw new TunableError(`'bots.gunBand.${gun}' must stay min <= max (got [${lo}, ${hi}])`);
    }
  }
}

/** The fog controller's coverage band (Story 9.10): a CLOSED share of the
 *  live ring's area, [0, 1] — 0 is "no fog" and a real arm; above 1 the
 *  quantile would chase a coverage the ring cannot hold. */
const FOG_SHARE_KEYS = new Set(['fog.coverageMin', 'fog.coverageMax']);

/** The deck-gun blow fractions (Story 9.12): CLOSED [0, 1] — the attenuation
 *  curve's full-damage share and far factor (`minFactor=1` is "attenuation
 *  off", a real arm), and flak's rim loss (`rimFactor=0` is the flat blast).
 *  The shared functions clamp out-of-range dials, so an arm outside [0, 1]
 *  would read moved while the sim ran the clamp — refused at the leaf. */
const GUN_FRACTION_KEYS = new Set(['gunAttenuation.fullFrac', 'gunAttenuation.minFactor', 'flak.rimFactor']);

/** `fullFrac` is the one HALF-OPEN fraction, [0, 1) (Story 9.12 review
 *  gate): at 1 or more `rangeAttenuation` answers a STEP, so the arm is
 *  refused at the parse leaf; validateAttenuationDials re-checks the
 *  finished CONFIG as a belt-and-braces guard. */
const FULL_FRAC_KEY = 'gunAttenuation.fullFrac';

function validateFraction(key: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new TunableError(`'${key}': expected a finite fraction in [0, 1], got '${value}'`);
  }
  if (key === FULL_FRAC_KEY && value >= 1) {
    throw new TunableError(
      `'${key}': expected a finite fraction in [0, 1), got '${value}' — at 1 the attenuation curve collapses to a step at the gun's range`,
    );
  }
}

/** THE CANNON'S BARRELS (Story 9.12; review gate): shells per click, an
 *  INTEGER in [1, 3]. 0 is a gun that consumes a round and fires nothing;
 *  the ceiling is clampStats's barrel clamp (shared/src/sim/stats.ts,
 *  `Math.min(3, Math.max(1, barrels))`) and the fold floors integer fields,
 *  so `4` or `1.5` would print as moved while the sim fired 3 or 1 — false
 *  evidence, refused at the leaf. */
const BARRELS_KEY = 'gun.barrels';
const BARRELS_MAX = 3;

function validateBarrels(key: string, value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > BARRELS_MAX) {
    throw new TunableError(
      `'${key}': expected an integer in [1, ${BARRELS_MAX}] (clampStats clamps barrels to 1..${BARRELS_MAX} and floors them), got '${value}'`,
    );
  }
}

function validateShare(key: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new TunableError(`'${key}': expected a finite share of water in [0, 1], got '${value}'`);
  }
}

/** The fog field's fbm persistence (Story 9.10): on (0, 1] — 0 collapses every
 *  octave past the first, above 1 the fine octaves swamp the base shape. */
const FOG_GAIN_KEY = 'fog.gain';

function validateGain(key: string, value: number): void {
  if (!Number.isFinite(value) || !(value > 0) || value > 1) {
    throw new TunableError(`'${key}': expected a finite fbm gain in (0, 1], got '${value}'`);
  }
}

function validateProbability(key: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new TunableError(`'${key}': expected a finite probability in [0, 1], got '${value}'`);
  }
}

function validateUnitInterval(key: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0 || value > 1) {
    throw new TunableError(`'${key}': expected a finite value in (0, 1], got '${value}'`);
  }
}

/**
 * CROSS-KEY INVARIANTS — relations between two CONFIG leaves, checked ONCE on
 * the FINISHED CONFIG rather than per key.
 *
 * `--set` and `--tune` each validate their leaves INDEPENDENTLY (family gate,
 * finiteness, per-leaf floor), which is all a single leaf can be judged on. An
 * invariant that RELATES two leaves cannot be judged that way: whichever key is
 * written first is legal on its own, and the pair only becomes illegal once
 * both are in. So the relation is checked after every write, from inside the
 * all-or-nothing try — a violation rolls the whole apply back and no match ever
 * runs on the bad pair.
 *
 * `boost.reloadMs >= boost.durationMs` (Story 8.9, epic-8 amendment 54): the
 * boost is a 1-charge pool, so a reload shorter than the window means the
 * charge is back before the window closes and the boost is PERMANENTLY active
 * — a state the design forbids. Either leaf can break it (`--tune
 * boost.reloadMs=1` shortens the reload, `--tune boost.durationMs=60000`
 * lengthens the window), hence the check on the pair rather than on either.
 * `boost.*` lives on the `--tune` combat surface only — `--set` refuses it at
 * the family gate before any write (pinned) — but the check runs on the
 * finished CONFIG after BOTH surfaces have written, so it is surface-blind.
 *
 * Story 8.9 REVIEW (Edge Case Hunter): the check above compared the RAW pair,
 * but the LIVE reload a match ever ticks against is `reloadMs *
 * cooldownScale`, and `cooldownScale` is moved by the RELOAD ladder (catalog-v3
 * R12: −5%/tier, cap 5 copies -> 0.75, floored at 0.1 in clampStats) — the same
 * fold every equipment reload takes (shared/src/sim/stats.ts clampStats).
 * `--tune boost.reloadMs=12000` cleared the raw check (12000 >= 10000) while a
 * five-RELOAD deck folds it to 9000ms < the 10000ms window — the exact
 * permanently-re-tappable state the raw check exists to forbid, just reached
 * one card-count away. So the relation is now checked through the REAL fold,
 * at the worst case the ladder can reach: `effectiveStats()` on a class with
 * RELOAD stacked to `CATALOG.reload.cap` copies, which is CONFIG-live so a
 * tuned `boost.reloadMs`/`boost.durationMs` is exactly what gets folded. The
 * class chosen (torpedoBoat) is arbitrary — the boost row carries no
 * per-class numbers (see boostRow) — so any class would fold identically.
 *
 * `boost.maxAmmo` (Story 8.9 REVIEW, Edge Case Hunter): the reload/duration
 * relation assumes a single charge. A second charge lets a mid-window tap
 * re-stamp `boostUntil` and extend the active window indefinitely no matter
 * how reload and duration relate, so `maxAmmo` is pinned to exactly 1 here
 * rather than folded into the reload/duration arithmetic.
 *
 * deferred-work: the harness has no general cross-key mechanism — these are
 * the only such relations (Story 8.9), and a third one should turn this
 * helper into a table rather than growing another `if`.
 */
function validateCrossKeyInvariants(): void {
  validateWeightingPair();
  validateCoverBand();
  validateDropoutCurve();
  validateFogDials();
  validateAttenuationDials();
  validateBotDials();
  const { durationMs, maxAmmo } = CONFIG.boost;
  if (maxAmmo !== 1) {
    throw new TunableError(
      `'boost.maxAmmo' must be exactly 1 (got ${maxAmmo}): the Shift boost is a single-charge pool ` +
        "— a second charge makes the active window extendable by a mid-window tap, which 'reload >= " +
        "duration' cannot prevent",
    );
  }
  const rawReloadMs = CONFIG.boost.reloadMs;
  const maxedReloadMs = effectiveStats(
    CONFIG.shipClasses.torpedoBoat,
    Array.from({ length: CATALOG.reload.cap }, () => 'reload'),
  ).equipment.boost.reloadMs;
  if (maxedReloadMs < durationMs) {
    throw new TunableError(
      `'boost.reloadMs' × the RELOAD ladder at cap must stay >= 'boost.durationMs' (raw ${rawReloadMs} ` +
        `-> ${maxedReloadMs} live at five RELOAD copies < ${durationMs}): an active window must ` +
        'always imply a cooling pool',
    );
  }
}

/**
 * `terrain.coverMin <= terrain.coverTarget <= terrain.coverMax` (Epic 9 tuning
 * pass): `retargetCover` (shared/src/sim/map.ts) steers toward the target and
 * `validateMap` accepts only the band, so a target outside its own band makes
 * EVERY seed fail validation and the run throws MapGenerationError on each
 * match — honest but useless. Refused up front on the finished panel.
 */
function validateCoverBand(): void {
  const { coverMin, coverTarget, coverMax } = TERRAIN_PARAMS;
  if (!(coverMin <= coverTarget && coverTarget <= coverMax)) {
    throw new TunableError(
      `terrain cover band must satisfy coverMin <= coverTarget <= coverMax (got ${coverMin} <= ${coverTarget} <= ${coverMax})`,
    );
  }
}

/**
 * THE DROPOUT CURVE MUST BE A CURVE (Story 9.8 review, F3): `startU < kneeU <
 * vision.radar` and `rimP <= kneeP`, on the FINAL resolved values (an arm may
 * set several leaves at once). Anything else is what shared `dropoutPaintP`
 * calls DEGENERATE and fails closed on — a STEP at startU (full paint inside,
 * none beyond) — so a sim would silently read a mis-set dial as "the dropout
 * got harsher". A harness may not produce false evidence; refused up front.
 */
function validateDropoutCurve(): void {
  const { startU, kneeU, kneeP, rimP } = CONFIG.vision.dropout;
  const radar = CONFIG.vision.radar;
  if (!(startU < kneeU)) {
    throw new TunableError(
      `'vision.dropout.startU' (${startU}) must stay < 'vision.dropout.kneeU' (${kneeU}): otherwise the curve collapses to a step at startU`,
    );
  }
  if (!(kneeU < radar)) {
    throw new TunableError(
      `'vision.dropout.kneeU' (${kneeU}) must stay < 'vision.radar' (${radar}): otherwise the curve collapses to a step at startU`,
    );
  }
  if (!(rimP <= kneeP)) {
    throw new TunableError(
      `'vision.dropout.rimP' (${rimP}) must stay <= 'vision.dropout.kneeP' (${kneeP}): a rim more reliable than the knee collapses the curve to a step at startU`,
    );
  }
}

/**
 * THE ATTENUATION CURVE MUST BE A CURVE (Story 9.12): `gunAttenuation.fullFrac
 * < 1` on the FINAL value. At 1 or more the shared `rangeAttenuation` answers
 * a STEP — full damage all the way to range, `minFactor` only beyond — so an
 * arm would read as "attenuation from X %" while the sim ran no falloff.
 */
function validateAttenuationDials(): void {
  const { fullFrac } = CONFIG.gunAttenuation;
  if (!(fullFrac < 1)) {
    throw new TunableError(
      `'gunAttenuation.fullFrac' (${fullFrac}) must stay < 1: otherwise the curve collapses to a step at the gun's range`,
    );
  }
}

/**
 * THE FOG DIALS MUST DESCRIBE A FIELD (Story 9.10): `coverageMin <=
 * coverageMax` (the target is drawn in [min, max]); `octaves` and
 * `quantileLattice` are COUNTS — a fractional octave count is a partial fbm
 * loop and a fractional lattice side is a lattice that is not square — so
 * both must be integers (review gate, Codex #3). Judged on the FINISHED
 * CONFIG — an arm may set several leaves at once.
 */
function validateFogDials(): void {
  const { coverageMin, coverageMax, octaves, quantileLattice } = CONFIG.fog;
  if (!(coverageMin <= coverageMax)) {
    throw new TunableError(`'fog.coverageMin' (${coverageMin}) must stay <= 'fog.coverageMax' (${coverageMax})`);
  }
  if (!Number.isInteger(octaves)) throw new TunableError(`'fog.octaves' must be an integer count of fbm octaves, got '${octaves}'`);
  if (!Number.isInteger(quantileLattice)) {
    throw new TunableError(`'fog.quantileLattice' must be an integer lattice side, got '${quantileLattice}'`);
  }
  if (quantileLattice > FOG_LATTICE_CEILING) {
    throw new TunableError(`'fog.quantileLattice' (${quantileLattice}) must stay <= ${FOG_LATTICE_CEILING}: the quantile sorts side² noise samples every refresh`);
  }
}

/** The lattice's ceiling: 256² = 65k noise samples sorted per refresh is the most a tick can carry. */
const FOG_LATTICE_CEILING = 256;

/**
 * `offer.weighting.floor <= offer.weighting.factor` (Story 8.14 review, F5).
 * `lineWeight(n) = max(floor, factor ** n)` is meant to STEP DOWN from 1.0 and
 * settle on the floor; a floor ABOVE the factor makes the very first take jump
 * the weight back UP to the floor and hold it there, so the dial reads as a
 * discount and behaves as a flat constant. Either leaf alone is legal in
 * (0, 1], so like the boost pair this is only judgeable once both are written.
 */
function validateWeightingPair(): void {
  const { factor, floor } = CONFIG.offer.weighting;
  if (floor > factor) {
    throw new TunableError(
      `'offer.weighting.floor' (${floor}) must stay <= 'offer.weighting.factor' (${factor}): a floor above ` +
        'the factor turns max(floor, factor ** n) into a constant from the first take on',
    );
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
    for (const key of Object.keys(set)) {
      if (key === STORM_LADDER_KEY) {
        for (const rung of stormLadderKeys()) write(rung, set[key], false);
        continue;
      }
      write(key, set[key], false);
    }
    // THE REGION TERM TRACKS THE BOARD. `TERRAIN_PARAMS.regionWavelength` is
    // initialised from `CONFIG.map.baseRadius` at module load (heightField.ts),
    // so a `--set map.baseRadius` alone would leave it at the OLD radius and
    // the arm would measure a board whose macro land-clustering repeats —
    // not the board a CONFIG change would ship. Follow it unless the arm set
    // the wavelength explicitly. Same undo list, same restore.
    if (Object.hasOwn(set, 'map.baseRadius') && !Object.hasOwn(set, 'terrain.regionWavelength')) {
      write('terrain.regionWavelength', set['map.baseRadius'], false);
    }
    for (const key of Object.keys(tune)) write(key, tune[key], true);
    // Relations between leaves, on the FINISHED CONFIG — inside the try, so a
    // violation rolls every write back exactly like a bad leaf does.
    validateCrossKeyInvariants();
  } catch (err) {
    rollback();
    throw err;
  }
  return rollback;
}
