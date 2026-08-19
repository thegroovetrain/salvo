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
// STORY 7-5 WAVE 1 — THE v2 CATALOG. Eric re-authored the deck
// (_bmad-output/implementation-artifacts/7-5-decks.md) and HIS CARD NAMES ARE
// CANON, verbatim: HULL/SPEED/INTEL/RANGE/RELOAD, BARREL, EXTRA TURRET,
// TORPEDO, EXTRA TUBE, BOOST DURATION, BOOST SPEED, STAR SHELLS, MINES, plus
// PHOSPHOR SHELLS / DAZZLE SHELLS / PROP FOULING MINES. Seven lines were
// deleted outright (gunDamage, torpedoDamage, torpedoCommand, mineDamage,
// mineMax, starRadius, boostMax) and their copy went with them.
//
// STORY 7-5 WAVE 2 — TWO WHOLE EQUIPMENTS CHANGED HANDS. The cannon became the
// BROADSIDE BARRAGE and the decoy buoy the RADAR BUOY, so every last v1 bespoke
// ladder is now retired: HEAVY CHARGE / PLUNGING FIRE / ARMOR-PIERCING SHELLS
// and EXTENDED BATTERY are DELETED with their catalog lines, and SELF-PROPELLED
// MINES with the verb CAPTIVE MINES replaced. Their replacements are Eric's own
// names, verbatim canon (`7-5-decks.md`): BROADSIDE SPREAD I–IV, BROADSIDE
// TURRETS I–II, BUOY I–IV, GUN BUOY, JAMMING BUOY, CAPTIVE MINES.
//
// THE VERBS NOW STACK. PHOSPHOR and DAZZLE are independent flags on one star
// shell, as are PROP FOULING and SELF-PROPELLED on one mine, so no doctrine
// card's rules text may imply an either/or any more.
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
  // HEAVY SHELLS is DELETED with `gunDamage` (Eric: the gun needs no damage
  // bonuses). BARREL keeps the ladder-of-numerals register the v2 catalog runs on.
  gunBarrel: ['BARREL I', 'BARREL II'],
  gunTurret: ['EXTRA TURRET'],
  // --- BROADSIDE BARRAGE (WAVE 2 — replaces the cannon outright) ------------
  // Eric's names, verbatim. SPREAD is the only ladder in the catalog whose
  // number goes DOWN as it climbs (the fan tightens), which is why its rules
  // text prints the fan's half-angle rather than the rung the card writes.
  broadsideSpread: ['BROADSIDE SPREAD I', 'BROADSIDE SPREAD II', 'BROADSIDE SPREAD III', 'BROADSIDE SPREAD IV'],
  broadsideTurrets: ['BROADSIDE TURRETS I', 'BROADSIDE TURRETS II'],
  // --- TORPEDOES -----------------------------------------------------------
  // HEAVY WARHEAD and COMMAND DETONATION are both DELETED (their catalog lines
  // are gone; command detonation left the game entirely).
  torpedoSpeed: ['TORPEDO I', 'TORPEDO II', 'TORPEDO III', 'TORPEDO IV'],
  torpedoTube: ['EXTRA TUBE'],
  torpedoHoming: ['ACOUSTIC HOMING'],
  // --- MINES ---------------------------------------------------------------
  // TNT FILLER and DECK RACKS are DELETED with `mineDamage`/`mineMax`.
  mineBlast: ['MINES I', 'MINES II', 'MINES III', 'MINES IV'],
  minePropFouling: ['PROP FOULING MINES'],
  // WAVE 2: the tracking mine becomes a torpedo mine. SELF-PROPELLED MINES is
  // deleted with the verb it named.
  mineCaptive: ['CAPTIVE MINES'],
  // --- SPEED BOOST ---------------------------------------------------------
  // `boostMax` (CLEAN BOILERS…) SPLIT into two lines: duration and speed are
  // separate buys now, so the old one-ladder flavor had nothing left to name.
  boostDuration: ['BOOST DURATION I', 'BOOST DURATION II', 'BOOST DURATION III', 'BOOST DURATION IV'],
  boostSpeed: ['BOOST SPEED I', 'BOOST SPEED II'],
  // --- STAR SHELLS ---------------------------------------------------------
  // WIDE BURST is DELETED with `starRadius`. PHOSPHOR SHELLS is a DISPLAY
  // rename of the `starIncendiary` line — project law (the KILL LEADER
  // precedent): a copy rename is never an id rename.
  starDuration: ['STAR SHELLS I', 'STAR SHELLS II', 'STAR SHELLS III', 'STAR SHELLS IV'],
  starIncendiary: ['PHOSPHOR SHELLS'],
  starDazzle: ['DAZZLE SHELLS'],
  // --- RADAR BUOY (WAVE 2 — replaces the decoy buoy outright) ---------------
  buoySweep: ['BUOY I', 'BUOY II', 'BUOY III', 'BUOY IV'],
  buoyGun: ['GUN BUOY'],
  buoyJamming: ['JAMMING BUOY'],
  // --- INTEL ---------------------------------------------------------------
  intelRange: ['RANGE I', 'RANGE II', 'RANGE III', 'RANGE IV'],
  intelSweep: ['INTEL I', 'INTEL II', 'INTEL III', 'INTEL IV', 'INTEL V'],
  // --- SHIP ----------------------------------------------------------------
  shipSpeed: ['SPEED I', 'SPEED II', 'SPEED III', 'SPEED IV'],
  shipHull: ['HULL I', 'HULL II', 'HULL III', 'HULL IV'],
  shipCooldown: ['RELOAD I', 'RELOAD II', 'RELOAD III', 'RELOAD IV', 'RELOAD V'],
  // --- EQUIPMENT ACQUISITIONS (fill the R slot, shuffle their subdeck in) ---
  acquireTorpedo: ['TORPEDO TUBES'],
  acquireMine: ['MINE RACKS'],
  acquireStarShells: ['STAR SHELL MORTAR'],
  acquireBroadside: ['BROADSIDE BARRAGE'],
  acquireRadarBuoy: ['RADAR BUOY'],
  acquireBoost: ['EMERGENCY THROTTLE'], // amendment 42: the Speed Boost card's ratified name
};

/** Category tag copy, keyed by BoonDef.category — the ratified nine. */
const CATEGORY_LABELS: Readonly<Record<string, string>> = {
  guns: 'GUNS',
  broadside: 'BROADSIDE',
  torpedoes: 'TORPEDOES',
  mines: 'MINES',
  speedBoost: 'SPEED BOOST',
  starShells: 'STAR SHELLS',
  radarBuoy: 'RADAR BUOY',
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

/** Radians as a signed half-angle in whole-ish degrees — "±12°". The one
 *  ladder whose printed number falls as it climbs (the broadside fan tightens),
 *  so the ± is doing real work: it says the number is a HALF-WIDTH about the
 *  click, not a distance. */
function halfAngleDeg(rad: number): string {
  return `±${num((rad * 180) / Math.PI)}°`;
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
  gunBarrel: { label: 'Shells per shot', read: (s) => s.gun.barrels, note: 'Every shell bursts at its own point.' },
  gunTurret: { label: 'Gun rounds ready', read: (s) => s.gun.maxAmmo },
  // THE BROADSIDE PAIR (Story 7-5 wave 2). SPREAD's stat-addressable field is a
  // RUNG (1..5) — an index into an authored ladder of degrees — and printing
  // "1 → 2" would tell the player nothing about what tightens. So it reads the
  // DERIVED half-angle instead, straight off the same effectiveStats preview
  // diff every other line uses: the firewall does the ladder lookup and the ×4
  // clamp, so a maxed stack honestly prints "±3° → ±3°".
  broadsideSpread: {
    label: 'Barrage spread',
    read: (s) => s.broadside.fanHalfAngleRad,
    fmt: halfAngleDeg,
    note: 'Shells land nearer the point you clicked.',
  },
  broadsideTurrets: {
    label: 'Shells per barrage',
    read: (s) => s.broadside.turrets,
    note: 'An odd count puts one shell dead on your click.',
  },
  torpedoSpeed: { label: 'Torpedo speed', read: (s) => s.torpedo.speed },
  torpedoTube: { label: 'Torpedoes loaded', read: (s) => s.torpedo.maxAmmo },
  // The merged mine-ring line (Eric ruling 2026-08-16). The trip ring is a
  // fixed fraction of the blast, so ONE card grows both and the note says so
  // rather than making the player infer it from a second number row.
  mineBlast: { label: 'Mine blast radius', read: (s) => s.mine.blastRadius, note: 'The trip ring widens with it.' },
  // The two halves of the retired `boostMax` line, bought separately now.
  boostDuration: { label: 'Boost duration', read: (s) => s.boost.durationMs, fmt: secs },
  boostSpeed: { label: 'Boost speed', read: (s) => s.boost.speedBonus },
  starDuration: { label: 'Flare burn time', read: (s) => s.starShells.litDurationMs, fmt: secs },
  buoySweep: { label: 'Buoy sweep', read: (s) => s.radarBuoy.sweepRpm, fmt: (v) => `${num(v)} RPM` },
  intelRange: {
    label: 'Radar range',
    read: (s) => s.radarRange,
    // The riders ride the NOTE rather than a second number row (Eric ruling
    // 2026-08-16), which is the pattern already ratified for gun/broadside/star
    // reach. `Sight` leads the list deliberately: truesight is now derived from
    // this card, and it is the half a player would otherwise never see move.
    note: 'Sight, gun, broadside and star shells reach with it.',
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
 * (a doctrine card changes a weapon's NATURE, so the card has to say how).
 *
 * STORY 7-5 WAVE 1: the verbs STACK now. `torpedoCommand` is gone with COMMAND
 * DETONATION; the star-shell and mine pairs stopped being either/or, so their
 * text says "also" rather than trading one behavior for another, and PROP
 * FOULING no longer claims a damage penalty (cycle 95 deleted it) — it states
 * the real slow instead.
 *
 * AMENDMENT 47 (the container-fit law) governs the LENGTH of every line here.
 * The Story 2.8 drafts ran 111–149 characters, which wrapped to 7–9 lines inside
 * the card's 186px inner box and pushed the doctrine cards 50–97px past the card
 * bottom on the live site. These are the SHORTEST wordings that still state the
 * whole contract. The pin in __tests__/refitCardFit.test.ts fails the build if a
 * future edit re-inflates one: the budget is ~5 wrapped lines (~90 characters)
 * for a doctrine card carrying a REPLACES line under a two-line ladder name.
 */
const DOCTRINE_TEXT: Readonly<Record<string, string>> = {
  torpedoHoming: 'Torpedoes slowly steer to the nearest enemy hull in their acquisition band.',
  mineCaptive: 'A mine no longer blasts on contact. It fires one torpedo at the first hostile in range.',
  buoyGun: 'Your buoy shoots at hostile hulls inside its radar circle: 5 damage every 5 seconds.',
  buoyJamming: 'Your buoy fills its radar circle with false returns on every scan but your own.',
  minePropFouling: 'Hulls caught in a mine blast are fouled: 25% slower for 5 seconds. Damage unchanged.',
  starIncendiary: 'Your lit zones also burn: a smaller circle scorches every hull but yours inside it.',
  starDazzle: 'Your lit zones also dazzle: every hull but yours inside one has its true sight cut.',
};

/** The acquisition cards' rules text — what arrives in the open slot. */
const ACQUISITION_TEXT: Readonly<Record<string, string>> = {
  acquireTorpedo: 'Fits torpedo tubes to your open slot, loaded. Their upgrade cards join your deck.',
  acquireMine: 'Fits mine racks to your open slot, loaded. Their upgrade cards join your deck.',
  acquireStarShells: 'Fits a star shell mortar to your open slot, loaded. Its upgrade cards join your deck.',
  acquireBroadside: 'Fits a broadside battery to your open slot, loaded. Its upgrade cards join your deck.',
  acquireRadarBuoy: 'Fits a radar buoy rack to your open slot, loaded. Its upgrade cards join your deck.',
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
  // FAIL-OPEN on the class table (cycle 91). This runs EVERY FRAME while the
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

// THE "REPLACES: <rival>" GRAMMAR IS DELETED (Story 7-5 wave 2, R2.6).
// `boonReplacesLine` existed to name the rival of an EXCLUSIVE pair, and the
// cannon's PLUNGING FIRE / ARMOR-PIERCING was the last pair in the game — wave 1
// had already turned every other doctrine into an independent stacking verb.
// With the cannon deleted, `BoonDef.exclusiveWith` leaves the type entirely, so
// there is nothing left for the line to describe. Removed with its pins rather
// than left as a function that can only ever return null.

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
