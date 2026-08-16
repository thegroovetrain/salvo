// BOON PRESENTATION — the client-side copy layer for the shared BOON_CATALOG.
// Player-facing names, rules text, category and rarity labels live HERE, never
// on BoonDef: the catalog is pure sim AND wire contract, so a display field
// would couple every copy edit to a PROTOCOL_VERSION bump.
//
// STORY 2.8 — THE RATIFIED CANON (amendment 42: "all draft card ladders are
// RATIFIED wholesale as printed in the brainstorm document"). Every name below
// is verbatim from _bmad-output/brainstorming-session-2026-07-30.md
// §"Card Copy & Naming". The laws that shape this module:
//
//   • Register: DRY TECHNICAL — real naval hardware vocabulary, positive
//     adjectives, never comparatives (HEAVY WARHEAD, not HEAVIER).
//   • NAME IS FLAVOR; RULES TEXT IS THE CONTRACT — every card prints exactly
//     what it does, with LIVE values ("Radar sweep: 15 RPM → 18 RPM."). That is
//     why description() takes the player's class + fitted boons and computes the
//     next values through a real effectiveStats PREVIEW DIFF: the card can never
//     print a number the firewall would not actually produce.
//   • NAME-BY-STACK-POSITION — a multi-copy line presents the NEXT name in its
//     ladder (held occurrences + 1), not a per-instance name. The deck's
//     duplicate-auto-redraw rule guarantees no two copies of a line share an
//     offer, so the next name is always unambiguous.
//   • MIXED LADDER STYLES — bespoke ladders where the vocabulary is rich, "Mk
//     I–V" numbering where it isn't (ammo/machinery marks are period-authentic).
//     The Mk numerals are printed as authored; the card's name style deliberately
//     does NOT uppercase-transform, so "Mk III" never becomes "MK III".
//
// FAIL-OPEN, not fail-closed: an id with no copy renders a readable
// de-camelCased fallback rather than an empty card, and a stack position past
// the end of a ladder clamps to its last rung. The fail-CLOSED gate lives
// upstream in offerView(), which drops the whole view when an id does not
// resolve against the shared catalog — copy is never load-bearing for
// correctness, only for legibility.

import {
  CONFIG,
  effectiveStats,
  resolveBoons,
  type BoonDef,
  type BoonRarity,
  type EffectiveStats,
  type ShipClassId,
} from '@salvo/shared';

/**
 * The RATIFIED name ladders, keyed by boon id. Index 0 is the name a card
 * presents when you hold NONE of that line; index k when you hold k. A
 * single-copy line is a one-entry ladder. Amendment 42 — verbatim canon.
 */
const BOON_LADDERS: Readonly<Record<string, readonly string[]>> = {
  // --- GUNS ----------------------------------------------------------------
  gunDamage: ['HEAVY SHELLS Mk I', 'HEAVY SHELLS Mk II', 'HEAVY SHELLS Mk III', 'HEAVY SHELLS Mk IV', 'HEAVY SHELLS Mk V'],
  gunBarrel: ['TWIN MOUNT', 'TRIPLE MOUNT'],
  gunTurret: ['AFT TURRET'],
  // --- CANNON --------------------------------------------------------------
  cannonDamage: ['HEAVY CHARGE Mk I', 'HEAVY CHARGE Mk II', 'HEAVY CHARGE Mk III', 'HEAVY CHARGE Mk IV', 'HEAVY CHARGE Mk V'],
  cannonBlast: ['FRAGMENTATION CASING Mk I', 'FRAGMENTATION CASING Mk II', 'FRAGMENTATION CASING Mk III', 'FRAGMENTATION CASING Mk IV', 'FRAGMENTATION CASING Mk V'],
  cannonArcing: ['PLUNGING FIRE'],
  cannonAp: ['ARMOR-PIERCING SHELLS'],
  // --- TORPEDOES -----------------------------------------------------------
  torpedoDamage: ['HEAVY WARHEAD Mk I', 'HEAVY WARHEAD Mk II', 'HEAVY WARHEAD Mk III', 'HEAVY WARHEAD Mk IV', 'HEAVY WARHEAD Mk V'],
  torpedoSpeed: ['HIGH-SPEED SETTING', 'WET-HEATER ENGINE', 'ENRICHED OXIDIZER', 'PURE OXYGEN DRIVE'],
  torpedoTube: ['SECOND TUBE'],
  torpedoHoming: ['ACOUSTIC HOMING'],
  torpedoCommand: ['COMMAND DETONATION'],
  // --- MINES ---------------------------------------------------------------
  mineDamage: ['TNT FILLER', 'AMATOL FILLER', 'TORPEX FILLER', 'MINOL FILLER', 'RDX FILLER'],
  mineBlast: ['BLAST CASING Mk I', 'BLAST CASING Mk II', 'BLAST CASING Mk III', 'BLAST CASING Mk IV', 'BLAST CASING Mk V'],
  mineTrigger: ['MAGNETIC FUZE', 'ACOUSTIC FUZE', 'PRESSURE FUZE', 'ANTENNA FUZE', 'COMBINATION FUZE'],
  mineMax: ['DECK RACKS', 'EXTENDED RACKS', 'MINE RAILS', 'SPONSON STOWAGE', 'CONVERTED HOLD'],
  mineSelfPropelled: ['SELF-PROPELLED MINES'],
  minePropFouling: ['PROP-FOULING MINES'],
  // --- SPEED BOOST ---------------------------------------------------------
  boostMax: ['CLEAN BOILERS', 'UPRATED BOILERS', 'SUPERHEATERS', 'FORCED DRAUGHT', 'EMERGENCY POWER'],
  // --- STAR SHELLS ---------------------------------------------------------
  starDuration: ['SLOW-BURN COMPOUND Mk I', 'SLOW-BURN COMPOUND Mk II', 'SLOW-BURN COMPOUND Mk III', 'SLOW-BURN COMPOUND Mk IV', 'SLOW-BURN COMPOUND Mk V'],
  starRadius: ['WIDE BURST Mk I', 'WIDE BURST Mk II', 'WIDE BURST Mk III', 'WIDE BURST Mk IV', 'WIDE BURST Mk V'],
  starIncendiary: ['INCENDIARY COMPOUND'],
  starDazzle: ['DAZZLE BURST'],
  // --- DECOY BUOY ----------------------------------------------------------
  decoyDuration: ['EXTENDED BATTERY Mk I', 'EXTENDED BATTERY Mk II', 'EXTENDED BATTERY Mk III', 'EXTENDED BATTERY Mk IV', 'EXTENDED BATTERY Mk V'],
  // --- INTEL ---------------------------------------------------------------
  intelTruesight: ['IMPROVED OPTICS', 'SPOTTING SCOPES', 'RANGEFINDER ARRAY', 'DIRECTOR TOWER', 'MASTHEAD POST'],
  intelRadar: ['IMPROVED RECEIVER', 'HIGH-GAIN ANTENNA', 'EXTENDED MAST', 'CENTIMETRIC SET', 'CAVITY MAGNETRON'],
  intelSweep: ['UPRATED SWEEP MOTOR Mk I', 'UPRATED SWEEP MOTOR Mk II', 'UPRATED SWEEP MOTOR Mk III', 'UPRATED SWEEP MOTOR Mk IV', 'UPRATED SWEEP MOTOR Mk V'],
  // --- SHIP ----------------------------------------------------------------
  shipSpeed: ['HULL SCRAPING', 'NEW SCREWS', 'ENGINE REFIT', 'GEARED TURBINES', 'FLANK SPEED TRIALS'],
  shipHull: ['REINFORCED HULL', 'ARMOR BELT', 'TORPEDO BULGE', 'WATERTIGHT COMPARTMENTS', 'ARMORED CITADEL'],
  // The universal cooldown line (Eric ruling 2026-08-04): a CREW-PROFICIENCY
  // ladder, not a hardware one — it scales every mounting on the ship at once,
  // so the flavor is the ratings who work them, not any one weapon's loader.
  // The 5th rung (Eric ruling 2026-08-04, copies 4 → 5): the gunnery pennant is
  // the real-world award for the squadron's top gunnery ship — an EARNED capstone
  // for max crew proficiency, so it closes the ladder rather than continuing it.
  shipCooldown: ['DRILL SCHEDULE', 'PRACTICED CREWS', 'VETERAN RATINGS', 'BATTLE STATIONS', 'GUNNERY PENNANT'],
  // --- EQUIPMENT ACQUISITIONS (fill the R slot, shuffle their subdeck in) ---
  acquireTorpedo: ['TORPEDO TUBES'],
  acquireMine: ['MINE RACKS'],
  acquireStarShells: ['STAR SHELL MORTAR'],
  acquireCannon: ['CANNON'],
  acquireDecoy: ['DECOY BUOY'],
  acquireBoost: ['EMERGENCY THROTTLE'], // amendment 42: the Speed Boost card's ratified name
};

/** Category tag copy, keyed by BoonDef.category — the ratified nine. */
const CATEGORY_LABELS: Readonly<Record<string, string>> = {
  guns: 'GUNS',
  cannon: 'CANNON',
  torpedoes: 'TORPEDOES',
  mines: 'MINES',
  speedBoost: 'SPEED BOOST',
  starShells: 'STAR SHELLS',
  decoyBuoy: 'DECOY BUOY',
  intel: 'INTEL',
  ship: 'SHIP',
};

/** Rarity tag copy: a plain COMMON shows NOTHING (the absence is the tier). */
const RARITY_LABELS: Readonly<Record<BoonRarity, string>> = {
  common: '',
  rare: 'RARE',
  exclusive: 'EXCLUSIVE',
};

/** "reinforcedBulkheads" -> "Reinforced Bulkheads" — the no-copy fallback. */
function humanize(id: string): string {
  const spaced = id.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Pure: the card name for a boon id at a given STACK (held occurrences) —
 * name-by-stack-position. Clamped into the ladder at both ends (a stack past
 * the ladder's end keeps its last rung rather than going blank), fail-open to
 * the humanized id for an unwritten line.
 */
export function boonName(id: string, stack = 0): string {
  if (!Object.hasOwn(BOON_LADDERS, id)) return humanize(id);
  const ladder = BOON_LADDERS[id];
  const i = Math.min(Math.max(0, Math.trunc(stack)), ladder.length - 1);
  return ladder[i];
}

/** Pure: the uppercase category tag for a BoonDef.category (fail-open). */
export function boonCategoryLabel(category: string): string {
  return Object.hasOwn(CATEGORY_LABELS, category) ? CATEGORY_LABELS[category] : category.toUpperCase();
}

/** Pure: the rarity tag ('' for a plain common — commons show no tag). */
export function boonRarityLabel(rarity: BoonRarity): string {
  return RARITY_LABELS[rarity] ?? '';
}

// --- rules text: the CONTRACT, with live values --------------------------------

/** Trimmed number: integers print bare, everything else to one decimal. */
function num(v: number): string {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/** Trimmed seconds for a ms duration — "3s", "2.7s" (the hotbar's grammar). */
function secs(ms: number): string {
  return `${num(ms / 1000)}s`;
}

/** A 0..1 scale as a percentage OF BASE — "100%", "90%". Used by the global
 *  cooldown line, whose one number stands in for seven different reloads: a
 *  card that scales all of them has no single second-count to headline, so it
 *  prints the scale itself and the before→after reads honestly downward. */
function pct(v: number): string {
  return `${num(v * 100)}%`;
}

/** One headline stat of a stat line: what to call it, where to read it, how to
 *  print it, and any second sentence the ladder owes the player. */
interface StatLine {
  label: string;
  read: (s: EffectiveStats) => number;
  fmt?: (v: number) => string;
  note?: string;
}

/** The headline stat each COMMON/RARE line moves — the number the card prints
 *  as `current → next`. One row per stat line in BOON_CATALOG. */
const STAT_LINES: Readonly<Record<string, StatLine>> = {
  gunDamage: { label: 'Gun damage', read: (s) => s.gun.damage },
  gunBarrel: { label: 'Shells per shot', read: (s) => s.gun.barrels, note: 'Every shell bursts at its own point.' },
  gunTurret: { label: 'Gun rounds ready', read: (s) => s.gun.maxAmmo },
  cannonDamage: { label: 'Cannon damage', read: (s) => s.cannon.damage },
  cannonBlast: { label: 'Cannon blast radius', read: (s) => s.cannon.burstRadius },
  torpedoDamage: { label: 'Torpedo damage', read: (s) => s.torpedo.damage },
  torpedoSpeed: { label: 'Torpedo speed', read: (s) => s.torpedo.speed },
  torpedoTube: { label: 'Torpedoes loaded', read: (s) => s.torpedo.maxAmmo },
  mineDamage: { label: 'Mine damage', read: (s) => s.mine.damage },
  mineBlast: { label: 'Mine blast radius', read: (s) => s.mine.blastRadius },
  mineTrigger: { label: 'Mine trigger radius', read: (s) => s.mine.triggerRadius, note: 'Never wider than the blast.' },
  mineMax: { label: 'Mines on the board', read: (s) => s.mine.maxLive },
  boostMax: { label: 'Boost speed', read: (s) => s.boost.speedBonus },
  starDuration: { label: 'Flare burn time', read: (s) => s.starShells.litDurationMs, fmt: secs },
  starRadius: { label: 'Lit zone radius', read: (s) => s.starShells.litRadius },
  decoyDuration: { label: 'Buoy lifetime', read: (s) => s.decoyBuoy.durationMs, fmt: secs },
  intelTruesight: { label: 'True sight', read: (s) => s.sightRange },
  intelRadar: {
    label: 'Radar range',
    read: (s) => s.radarRange,
    // The brainstorm's emergence flag, printed honestly: Intel is a stealth
    // offense category — gun, cannon and star-shell reach ride radar range.
    note: 'Gun, cannon and star shells reach with it.',
  },
  intelSweep: { label: 'Radar sweep', read: (s) => s.sweepRpm, fmt: (v) => `${num(v)} RPM` },
  shipSpeed: { label: 'Top speed', read: (s) => s.kinematics.maxSpeed },
  shipHull: { label: 'Max hull', read: (s) => s.maxHp, note: 'Repairs the hull it adds.' },
  // The ONE global cooldown lever: `cooldownScale` multiplies every equipment's
  // reload post-fold, so this row reads the scalar itself rather than any single
  // weapon — printed as a percentage of base so 100% → 90% reads downward.
  shipCooldown: {
    label: 'All cooldowns',
    read: (s) => s.cooldownScale,
    fmt: pct,
    note: 'Every weapon and ability reloads faster.',
  },
};

/**
 * The doctrine cards' rules text — each spells out the full behavior change
 * (the Exclusive Law: exclusives change a weapon's NATURE).
 *
 * AMENDMENT 47 (the container-fit law) rewrote every line here. The Story 2.8
 * drafts ran 111–149 characters, which wrapped to 7–9 lines inside the card's
 * 186px inner box and pushed the exclusive cards 50–97px past the card bottom
 * on the live site. These are the SHORTEST wordings that still state the whole
 * contract — nothing was deleted from any behavior (no-burst, pierce count and
 * damage ladder, island stop, acquisition-range homing, decoy immunity, the
 * command-detonation range and the surviving contact hit, the fouling trade,
 * the burn/dazzle radius-and-duration terms are all still printed). The pin in
 * __tests__/refitCardFit.test.ts fails the build if a future edit re-inflates
 * one: the budget is ~5 wrapped lines (~90 characters) for a doctrine card
 * carrying a REPLACES line under a two-line ladder name.
 */
const DOCTRINE_TEXT: Readonly<Record<string, string>> = {
  cannonArcing: 'Cannon shells lob over islands and hulls, cannot be intercepted, and burst on your click.',
  cannonAp: 'Cannon shells stop bursting. A shot pierces up to three hulls: 100/50/25%. Islands stop it.',
  torpedoHoming: 'Torpedoes slowly steer to the nearest enemy hull in range. Decoys are ignored.',
  torpedoCommand: 'Click to detonate a torpedo, out to radar range, in a big blast. Contact still hits.',
  mineSelfPropelled: 'Armed mines creep toward the nearest enemy hull in acquisition range.',
  minePropFouling: 'Mines hit softer, but hulls in the blast are fouled to half speed briefly.',
  starIncendiary: 'The lit zone burns: a smaller circle scorches every hull but yours inside it, while lit.',
  starDazzle: 'The lit zone still lights. Every hull but yours inside it is dazzled: true sight cut.',
};

/** The acquisition cards' rules text — what arrives in the open slot. */
const ACQUISITION_TEXT: Readonly<Record<string, string>> = {
  acquireTorpedo: 'Fits torpedo tubes to your open slot, loaded. Their upgrade cards join your deck.',
  acquireMine: 'Fits mine racks to your open slot, loaded. Their upgrade cards join your deck.',
  acquireStarShells: 'Fits a star shell mortar to your open slot, loaded. Its upgrade cards join your deck.',
  acquireCannon: 'Fits a heavy cannon to your open slot, loaded. Its upgrade cards join your deck.',
  acquireDecoy: 'Fits a decoy buoy rack to your open slot, loaded. Its upgrade cards join your deck.',
  acquireBoost: 'Fits an emergency throttle to your open slot, ready. Its upgrade cards join your deck.',
};

/** The player state a card's live values are computed against. */
export interface BoonPreviewShip {
  cls: ShipClassId;
  boons: readonly string[];
}

/**
 * The card's `current → next` sentence for a STAT line, computed through a real
 * effectiveStats PREVIEW DIFF: resolve the player's fitted boons, resolve them
 * again with this id appended, and read the headline stat off both. The firewall
 * does the arithmetic (clamps, caps and derivations included), so a card can
 * never promise a number the sim would not produce — a sweep line at the 30-RPM
 * ceiling honestly prints "30 RPM → 30 RPM".
 */
function statSentence(id: string, line: StatLine, you: BoonPreviewShip): string {
  // FAIL-OPEN on the class table (cycle 90). This runs EVERY FRAME while the
  // refit band is open, i.e. exactly while the player is picking a card, and an
  // unresolvable `cls` would hand `effectiveStats` an undefined spec and throw
  // on `cls.kinematics` — inside the ticker callback, which until this cycle
  // meant a permanent freeze. Every other catalog/registry lookup in the engine
  // is already `Object.hasOwn`-gated; this was one of the exceptions. Returning
  // '' prints no numbers rather than inventing a hull we cannot identify.
  if (!Object.hasOwn(CONFIG.shipClasses, you.cls)) return '';
  const spec = CONFIG.shipClasses[you.cls];
  const before = effectiveStats(spec, resolveBoons(you.boons));
  const after = effectiveStats(spec, resolveBoons([...you.boons, id]));
  const fmt = line.fmt ?? num;
  return `${line.label}: ${fmt(line.read(before))} → ${fmt(line.read(after))}.`;
}

/**
 * Pure: the card's RULES TEXT — the contract, not the flavor. A stat line
 * prints its headline number as `current → next` (live, via the preview diff
 * above) plus any standing note; a doctrine card spells out the behavior change;
 * an acquisition card says what it fits. Fail-open: an unwritten line renders ''
 * rather than breaking the card.
 */
export function boonDescription(def: BoonDef, you: BoonPreviewShip): string {
  if (Object.hasOwn(DOCTRINE_TEXT, def.id)) return DOCTRINE_TEXT[def.id];
  if (Object.hasOwn(ACQUISITION_TEXT, def.id)) return ACQUISITION_TEXT[def.id];
  if (!Object.hasOwn(STAT_LINES, def.id)) return '';
  const line = STAT_LINES[def.id];
  const head = statSentence(def.id, line, you);
  // An empty head means statSentence could not resolve the hull — the ONLY way
  // it returns '' (every other path returns a template with a label and two
  // numbers). Print nothing at all rather than a note dangling after a leading
  // space. Fail-proven: reverting this line fails two tests in refitFailOpen.
  if (head === '') return '';
  return line.note ? `${head} ${line.note}` : head;
}

/**
 * Pure: the ACCRUED-BOON effect line for the hotbar slot tooltip (Story 2.9) —
 * the one-line "what this line is doing for you RIGHT NOW" under a `◆ NAME` row.
 *
 * Deliberately NOT the refit card's sentence: a card sells a change and prints
 * `current → next`; a tooltip row reports a HOLDING and prints the value the
 * fitted build actually has. So the stat lines read straight off the LIVE
 * effective stats already resolved for the slot (no preview diff, no second
 * resolve — `stats` IS the firewall's output for this hull), and the standing
 * `note` is dropped: it belongs to the sales pitch, not the readout.
 *
 * Doctrine and acquisition lines have no number to report, so they reuse their
 * card text verbatim — one copy of every string, and the tooltip's container-fit
 * pin (__tests__/tooltipFit.test.ts) is what keeps the long ones honest.
 *
 * TOTAL over BOON_CATALOG by construction (every line is a stat, a doctrine or
 * an acquisition); an unwritten id fails open to '' rather than breaking a row.
 */
export function boonEffectLine(id: string, stats: EffectiveStats): string {
  if (Object.hasOwn(DOCTRINE_TEXT, id)) return DOCTRINE_TEXT[id];
  if (Object.hasOwn(ACQUISITION_TEXT, id)) return ACQUISITION_TEXT[id];
  if (!Object.hasOwn(STAT_LINES, id)) return '';
  const line = STAT_LINES[id];
  const fmt = line.fmt ?? num;
  return `${line.label}: ${fmt(line.read(stats))}`;
}

/**
 * Pure: the DOCTRINE-SWAP line for a card whose rival doctrine you already hold
 * (amendment 44 — picking it swaps for free, and the rival's card returns to the
 * deck), or null when there is nothing to replace. The rival is named at ITS
 * ladder position 0 (every doctrine is a 1-copy line, so that is its only name).
 */
export function boonReplacesLine(def: BoonDef, held: readonly string[]): string | null {
  const rival = def.exclusiveWith;
  if (rival === undefined || !held.includes(rival)) return null;
  return `REPLACES: ${boonName(rival)}`;
}

/**
 * Pure: the LINEAGE marker for a multi-copy line — "II/V", the position this
 * card would take (held occurrences + 1) out of the line's total copies (Sally's
 * ratified handrail: a player under combat lockout can see that ARMOR BELT
 * continues REINFORCED HULL). A single-copy line has no lineage and returns
 * null; the position is clamped so a full stack still reads "V/V".
 */
export function boonLineageLine(def: BoonDef, stack: number): string | null {
  if (def.copies <= 1) return null;
  const pos = Math.min(def.copies, Math.max(1, Math.trunc(stack) + 1));
  return `${roman(pos)}/${roman(def.copies)}`;
}

/** 1..10 as Roman numerals (catalog copies never exceed a handful; anything
 *  beyond the table falls back to the digits, fail-open). */
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
function roman(n: number): string {
  return ROMAN[n - 1] ?? String(n);
}

/** Pure: the "boon fitted" toast line (UX-DR23 self-events-only surface, the
 *  pointToastLine sibling). Diamond glyph = the accrued-boon marker the hotbar
 *  tooltip uses (`◆n`), so the toast and the build readout share one mark.
 *  `stack` is the occurrence count AFTER the fit, so the toast names exactly the
 *  rung the card showed (1 → the ladder's first name). */
export function boonFitToastLine(id: string, stack = 1): string {
  return `◆ ${boonName(id, Math.max(0, stack - 1))} FITTED`;
}
