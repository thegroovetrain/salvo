// CARD PRESENTATION — the client-side copy layer for the shared CATALOG.
// Player-facing names, rules text and the KIND word live HERE, never on
// CatalogLine: the catalog is pure sim AND wire contract, so a display field
// would couple every copy edit to a PROTOCOL_VERSION bump.
//
// STORY 8.1 — CATALOG V3. Every name below is verbatim from Eric's authored
// sheet (`catalog-v3.md` §1); the nine CATEGORY labels and the three RARITY
// tiers are DELETED with the axes behind them and replaced by ONE meta word,
// the line's KIND (WEAPON / UPGRADE / ADD-ON / CONSUMABLE), rendered neutral
// (Eric ruling 2026-09-15, amendment 8). Stories 8.6/8.7 own the real card
// faces; this is the interim readout that keeps the band legible until then.
//
// THE LAWS THAT SHAPE THIS MODULE (carried from Story 2.8 unchanged):
//
//   • Register: DRY TECHNICAL — real naval hardware vocabulary, positive
//     adjectives, never comparatives.
//   • NAME IS FLAVOR; RULES TEXT IS THE CONTRACT — every card prints exactly
//     what it does, with LIVE values ("Radar sweep: 15 RPM → 18 RPM."). That is
//     why description() takes the player's class + fitted cards and computes the
//     next values through a real effectiveStats PREVIEW DIFF: the card can never
//     print a number the firewall would not actually produce.
//   • ONE NAME PER LINE (catalog v3). The v2 name-by-stack-position ladders are
//     gone with the v2 catalog — the sheet names the LINE and the lineage
//     handrail beside the name prints the rung.
//
// STORY 7-5 WAVE 2, R2.17 (Eric ruling 2026-08-19) — THE CARD FACE IS MINIMAL
// AND THE EXPLANATION MOVES TO A HOVER TOOLTIP. *"I want the card itself to be
// pretty minimal in the upgrade tab, just the name and stat change as before
// (previous -> new) if applicable. But hovering one with the mouse should give a
// tooltip explaining the card, so that there are no questions like 'what the
// fuck does a captive mine do?'"* That splits this module's copy into THREE
// surfaces with three different jobs and three different length budgets:
//
//   • `boonDescription` — THE CARD FACE. A stat line's `current → next` sentence
//     and nothing else; every other card returns '' and its face is name +
//     kind word + copy count alone.
//   • `boonTooltipText` — THE EXPLANATION (BOON_EXPLAIN). Plain language, and
//     deliberately longer than anything that ever fitted on a card, because it
//     is no longer inside the card's box. PARTIAL since catalog v3: a line
//     whose mechanism is not built has nothing honest to explain.
//   • `boonEffectLine` — THE HOLDING readout for the hotbar slot tooltip and the
//     results build list: the live value, or a verb's short HOLDING line.
//
// The honesty rules bind ACROSS surfaces, not per string. The two wordings
// caught lying in Story 7-5 (the gun buoy's hostility gate, the jamming buoy's
// concealment claim) left the game with the RADAR BUOY line itself — catalog-v3
// R1 deletes the buoy in favour of the DECOY BUOY consumable.
//
// FAIL-OPEN, not fail-closed: an id with no copy renders a readable
// de-camelCased fallback rather than an empty card, and a stack position past
// the end of a ladder clamps to its last rung. The fail-CLOSED gate lives
// upstream in offerView(), which drops the whole view when an id does not
// resolve against the shared catalog — copy is never load-bearing for
// correctness, only for legibility.

import {
  CONFIG,
  LINE_IDS,
  effectiveStats,
  type CatalogLine,
  type EffectiveStats,
  type LineId,
  type LineKind,
  type ShipClassId,
} from '@salvo/shared';

/**
 * THE CARD NAMES — catalog v3 §1, Eric's own sheet, verbatim (Story 8.1).
 *
 * ONE NAME PER LINE. The v2 catalog gave a multi-copy line a per-rung name
 * ladder (BARREL I / BARREL II); catalog v3 names the LINE and prints the rung
 * as the lineage handrail beside it, so this is a flat table and `boonName`'s
 * `stack` argument no longer selects anything. The argument stays because both
 * call sites (the hotbar's accrued rows and the fit toast) pass a rung they
 * genuinely know, and a future ladder could use it again.
 *
 * TOTAL over LINE_IDS — pinned by __tests__/boonCopy.test.ts, so a 30th line
 * cannot ship nameless.
 */
const LINE_NAMES: Readonly<Record<LineId, string>> = {
  // --- the five universal ladders ------------------------------------------
  armor: 'ARMOR',
  speed: 'SPEED',
  turning: 'TURNING',
  radarSweep: 'RADAR SWEEP',
  reload: 'RELOAD',
  // --- the deck-gun family --------------------------------------------------
  deckGun: 'DECK GUN',
  deckGunTurret: 'DECK GUN TURRET',
  deckGunBarrel: 'DECK GUN BARREL',
  // --- the eleven equipment lines -------------------------------------------
  lightTorpedo: 'LIGHT TORPEDO',
  heavyTorpedo: 'HEAVY TORPEDO',
  supercavTorpedo: 'SUPERCAVITATING TORPEDO',
  navalMines: 'NAVAL MINES',
  captiveMines: 'CAPTIVE MINES',
  missile: 'HORIZONTAL MISSILE',
  machineGun: 'MACHINE GUN',
  flak: 'FLAK GUN',
  monitor: 'MONITOR GUN',
  broadside: 'BROADSIDE GUN',
  starShells: 'STAR SHELLS',
  // --- the five consumables -------------------------------------------------
  hullRepair: 'HULL REPAIR',
  shieldBlock: 'SHIELD BLOCK',
  smokeScreen: 'SMOKE SCREEN',
  chaff: 'CHAFF',
  decoyBuoy: 'DECOY BUOY',
  // --- the five add-ons -----------------------------------------------------
  acousticHoming: 'ACOUSTIC HOMING',
  foulingMines: 'FOULING MINES',
  heatSeeking: 'HEAT SEEKING',
  dazzleShells: 'DAZZLE SHELLS',
  phosphorShells: 'PHOSPHOR SHELLS',
};

/**
 * THE KIND WORD — the refit card's meta tag (Eric ruling 2026-09-15,
 * amendment 8). Four words for catalog v3's four kinds, and they replace BOTH
 * v2 meta tags at once: the nine CATEGORY labels and the three RARITY tiers are
 * deleted with the axes behind them.
 *
 * A LADDER LINE IS LABELLED `UPGRADE`, which is the sheet's own column word
 * (catalog-v3 §1 types: Upgrade / Equipment / Upgrade (add-on) / Consumable) —
 * including the deck-gun family, which are ladders on a slotless weapon.
 *
 * The word is the a11y channel: the meta row renders NEUTRAL, so nothing on
 * this card is carried by colour alone.
 */
const KIND_LABELS: Readonly<Record<LineKind, string>> = {
  equipment: 'WEAPON',
  ladder: 'UPGRADE',
  addon: 'ADD-ON',
  consumable: 'CONSUMABLE',
};

/** "reinforcedBulkheads" -> "Reinforced Bulkheads" — the no-copy fallback. */
function humanize(id: string): string {
  const spaced = id.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Pure: the card name for a line id, fail-open to the humanized id for an
 * unwritten line. `stack` is accepted and ignored (see LINE_NAMES).
 */
export function boonName(id: string, _stack = 0): string {
  return Object.hasOwn(LINE_NAMES, id) ? LINE_NAMES[id as LineId] : humanize(id);
}

/** Pure: the uppercase KIND word for a catalog line's kind (fail-open). */
export function boonKindLabel(kind: string): string {
  return Object.hasOwn(KIND_LABELS, kind) ? KIND_LABELS[kind as LineKind] : kind.toUpperCase();
}

/** The kind words, longest-first-safe (test seam — the refit card's width model
 *  fits against the longest of these, CONSUMABLE). */
export const KIND_WORDS: readonly string[] = Object.values(KIND_LABELS);

// --- rules text: the CONTRACT, with live values --------------------------------

/** Trimmed number: integers print bare, everything else to one decimal. */
function num(v: number): string {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/** A 0..1 scale as a percentage OF BASE — "100%", "90%". Used by the global
 *  cooldown line, whose one number stands in for every equipment reload: a card
 *  that scales all of them has no single second-count to headline, so it prints
 *  the scale itself and the before→after reads honestly downward. */
function pct(v: number): string {
  return `${num(v * 100)}%`;
}

/** One headline stat of a stat line: what to call it, where to read it and how
 *  to print it. */
interface StatLine {
  label: string;
  read: (s: EffectiveStats) => number;
  fmt?: (v: number) => string;
}

/**
 * The headline stat each line moves — the number the card prints as
 * `current → next`, and the WHOLE of what a stat card's face says (R2.17).
 *
 * PARTIAL over the catalog, and far more sparsely than in v2. Catalog v3's
 * eleven EQUIPMENT lines spend copy 1 on the weapon itself and leave tiers II–V
 * empty until Stories 8.12–8.16 author them, so they move no number yet; the
 * five consumables are stubs; the five add-ons are verbs. What is left is the
 * five universal ladders and the deck-gun family, which DO carry authored
 * content — and every label below is carried over verbatim from the v2 line
 * this one replaces (see the `<-` notes), except TURNING, whose word is the
 * class-select stat label already shipped in ui/classSelect.ts.
 */
const STAT_LINES: Readonly<Partial<Record<LineId, StatLine>>> = {
  armor: { label: 'Max hull', read: (s) => s.maxHp }, // <- shipHull
  speed: { label: 'Top speed', read: (s) => s.kinematics.maxSpeed }, // <- shipSpeed
  turning: { label: 'Turning', read: (s) => s.kinematics.turnRate },
  // <- intelSweep
  radarSweep: { label: 'Radar sweep', read: (s) => s.sweepRpm, fmt: (v) => `${num(v)} RPM` },
  // <- shipCooldown. The ONE global cooldown lever: `cooldownScale` multiplies
  // every equipment's reload post-fold, so this row reads the scalar itself
  // rather than any single weapon — printed as a percentage of base so
  // 100% → 95% reads downward.
  reload: { label: 'All cooldowns', read: (s) => s.cooldownScale, fmt: pct },
  // The DECK GUN ladder moves two numbers (damage here, its own reload derived
  // from the tier in clampStats) and the face prints ONE, exactly as the v2
  // broadside SPREAD line did: damage is the number the player watches change.
  deckGun: { label: 'Gun damage', read: (s) => s.equipment.gun.damage },
  deckGunTurret: { label: 'Gun rounds ready', read: (s) => s.equipment.gun.maxAmmo }, // <- gunTurret
  deckGunBarrel: { label: 'Shells per shot', read: (s) => s.equipment.gun.barrels }, // <- gunBarrel
};

/**
 * The VERB cards' HOLDING line — the compact "what this line is doing for you
 * RIGHT NOW" that a hotbar tooltip row and a results-screen build row print
 * under a `◆ NAME`. A verb moves no number, so `boonEffectLine` has nothing to
 * read off `EffectiveStats`; this table is what those two surfaces show instead.
 *
 * Four of catalog v3's five add-ons map straight onto a shipped v2 doctrine and
 * carry its line verbatim. HEAT SEEKING has no entry: the missile it bolts onto
 * is Story 8.14, and writing copy for a weapon nobody has played is exactly what
 * the naming law forbids. It fails open to '' like every other unwritten id.
 */
const DOCTRINE_HOLDING: Readonly<Partial<Record<LineId, string>>> = {
  acousticHoming: 'Torpedoes steer onto the nearest hull in their acquisition band.',
  foulingMines: 'Mine blasts foul screws: 25% slower for 5 seconds.',
  phosphorShells: 'Your lit zones also burn every hull but yours inside them.',
  dazzleShells: 'Your lit zones also cut the true sight of every hull but yours.',
};

/**
 * THE EXPLANATIONS (Story 7-5 wave 2, R2.17 — Eric ruling 2026-08-19).
 *
 * *"hovering one with the mouse should give a tooltip explaining the card, so
 * that there are no questions like 'what the fuck does a captive mine do?'"*
 *
 * PARTIAL, not total, since Story 8.1. Every entry below is the v2 text of the
 * line this one replaces, carried over unchanged — the four equipment lines
 * whose weapons exist keep their acquisition card's explanation MINUS its
 * "their upgrade cards join your deck" sentence, which the subdeck walk's
 * deletion made untrue. The lines with no entry are the ones with nothing
 * honest to say yet: the thirteen STUB lines (their mechanisms are Stories
 * 8.13–8.16), TURNING and the DECK GUN ladder (new in v3 — no v2 line to carry
 * from). `boonTooltipText` fails open to '' for all of them, so a card with no
 * explanation simply shows no hover panel.
 *
 * THE HONESTY PINS that survived into v3 travel with their text: the buoy
 * wordings that were caught lying are gone entirely with the RADAR BUOY line
 * (catalog-v3 R1 deletes the buoy in favour of the DECOY BUOY consumable).
 */
const BOON_EXPLAIN: Readonly<Partial<Record<LineId, string>>> = {
  // --- the universal ladders ------------------------------------------------
  armor:
    'Raises your maximum hull, and repairs exactly the amount it adds the moment you fit it — so it is a heal as well as a buffer. Nothing else in the game raises maximum hull.',
  speed:
    'Raises your top speed ahead. Reverse and rate of turn are untouched — this is straight-line pace, which decides whether you can close a gap or break off a fight you are losing.',
  radarSweep:
    'Spins your radar faster. A contact paints only as the beam crosses its bearing, so a quicker sweep refreshes what you know more often and leaves a target less water to cross between paints.',
  reload:
    'There is one cooldown lever in the game and this is it: every weapon and ability you carry reloads faster by the same fraction. It reads as a percentage of base, so the number falls as you stack it.',
  // --- the deck-gun family --------------------------------------------------
  deckGunTurret:
    'Keeps a second gun round ready, so you can fire twice back to back instead of waiting out the whole reload between shots. The reload is unchanged — you simply have somewhere to keep the spare.',
  deckGunBarrel:
    'Your gun throws extra shells on parallel tracks either side of the one you aimed, each bursting at its own point. An odd number puts one shell exactly on your click; an even number straddles it.',
  // --- the equipment lines whose weapons exist today -------------------------
  heavyTorpedo:
    'Fits torpedo tubes to your open slot, loaded. Torpedoes run just under the surface and hit hard, but they run straight — you lead the target yourself.',
  navalMines:
    'Fits mine racks to your open slot, loaded. Mines drop astern and sit armed on the water until something crosses the trip ring around them.',
  broadside:
    'Fits a broadside battery to your open slot. It throws a fan of shells off whichever beam you clicked, port or starboard — never over the bow or the stern.',
  starShells:
    'Fits a star shell mortar to your open slot. A flare lights a circle of ocean you see into as if it were your own sight — the one way to look somewhere you are not.',
  // --- the add-ons whose verbs exist today -----------------------------------
  acousticHoming:
    'Your torpedoes listen for hulls. Once one is inside the acquisition band the fish steers slowly onto it, correcting a near miss for you. It is a gentle turn, not a chase: hard helm still shakes it.',
  foulingMines:
    'Anything caught in one of your mine blasts has its screws fouled: 25% slower for 5 seconds. The damage is unchanged — what you buy is a hull that cannot run while you close on it.',
  phosphorShells:
    'Your lit circles catch fire. A slightly smaller ring inside each one burns every hull but yours at 5 hp a second for as long as the flare lasts. It stacks with DAZZLE SHELLS — one flare can do both.',
  dazzleShells:
    'Your lit circles dazzle. Any hull but yours standing in one has its own true sight cut in half while it stays there: it can still be seen, it just cannot see. It stacks with PHOSPHOR SHELLS.',
};

/** The player state a card's live values are computed against. */
export interface BoonPreviewShip {
  cls: ShipClassId;
  cards: readonly string[];
}

/**
 * The card's `current → next` sentence for a STAT line, computed through a real
 * effectiveStats PREVIEW DIFF: fold the player's fitted cards, fold them again
 * with this id appended, and read the headline stat off both. The firewall does
 * the arithmetic (clamps, caps and derivations included), so a card can never
 * promise a number the sim would not produce — a sweep line at the 30-RPM
 * ceiling honestly prints "30 RPM → 30 RPM".
 */
function statSentence(id: string, line: StatLine, you: BoonPreviewShip): string {
  // FAIL-OPEN on the class table (cycle 91). This runs EVERY FRAME while the
  // refit band is open, i.e. exactly while the player is picking a card, and an
  // unresolvable `cls` would hand `effectiveStats` an undefined spec and throw
  // on `cls.kinematics` — inside the ticker callback, which until this cycle
  // meant a permanent freeze. Returning '' prints no numbers rather than
  // inventing a hull we cannot identify.
  if (!Object.hasOwn(CONFIG.shipClasses, you.cls)) return '';
  const spec = CONFIG.shipClasses[you.cls];
  const before = effectiveStats(spec, you.cards);
  const after = effectiveStats(spec, [...you.cards, id]);
  const fmt = line.fmt ?? num;
  return `${line.label}: ${fmt(line.read(before))} → ${fmt(line.read(after))}.`;
}

/**
 * Pure: the card FACE's one text row — and, since R2.17, the ONLY prose a card
 * face carries. A STAT line prints its headline number as `current → next`
 * (live, via the preview diff above); everything else prints NOTHING AT ALL and
 * its explanation lives in the hover tooltip (`boonTooltipText`).
 *
 * An empty string is a LEGITIMATE, EXPECTED answer here, not a failure — and
 * since catalog v3 it is the common case, because an equipment line's copy 1
 * fits the weapon and its four upgrade tiers are not authored yet.
 */
export function boonDescription(line: CatalogLine, you: BoonPreviewShip): string {
  const stat = STAT_LINES[line.id];
  if (stat === undefined) return '';
  // An empty sentence means statSentence could not resolve the hull — the ONLY
  // way it returns '' — and printing nothing beats printing half a diff.
  return statSentence(line.id, stat, you);
}

/**
 * Pure: the card's HOVER-TOOLTIP EXPLANATION — what the card actually does, in
 * plain terms. Keyed on the id alone and carrying NO live values: the face
 * already prints the player's own numbers, and a static string is what makes
 * the tooltip's container-fit pin exact rather than build-dependent.
 *
 * HOVER ONLY, BY RULING. Fail-open to '' on an unwritten id.
 */
export function boonTooltipText(id: string): string {
  return Object.hasOwn(BOON_EXPLAIN, id) ? (BOON_EXPLAIN[id as LineId] ?? '') : '';
}

/**
 * Pure: the ACCRUED-CARD effect line for the hotbar slot tooltip (Story 2.9) —
 * the one-line "what this line is doing for you RIGHT NOW" under a `◆ NAME` row.
 *
 * Deliberately NOT the refit card's sentence: a card sells a change and prints
 * `current → next`; a tooltip row reports a HOLDING and prints the value the
 * fitted build actually has. So the stat lines read straight off the LIVE
 * effective stats already resolved for the slot (no preview diff, no second
 * fold — `stats` IS the firewall's output for this hull).
 *
 * A line with neither a holding line nor a headline stat fails open to '' — the
 * row then shows its `◆ NAME` alone, which is the honest readout for an
 * equipment line whose upgrade tiers are not authored yet.
 */
export function boonEffectLine(id: string, stats: EffectiveStats): string {
  const holding = DOCTRINE_HOLDING[id as LineId];
  if (holding !== undefined) return holding;
  const line = STAT_LINES[id as LineId];
  if (line === undefined) return '';
  const fmt = line.fmt ?? num;
  return `${line.label}: ${fmt(line.read(stats))}`;
}

/**
 * Pure: the LINEAGE marker for a multi-copy line — "II/V", the position this
 * card would take (held occurrences + 1) out of the line's `cap` (Sally's
 * ratified handrail). A single-copy line has no lineage and returns null; the
 * position is clamped so a full stack still reads "V/V".
 */
export function boonLineageLine(line: CatalogLine, stack: number): string | null {
  if (line.cap <= 1) return null;
  const pos = Math.min(line.cap, Math.max(1, Math.trunc(stack) + 1));
  return `${roman(pos)}/${roman(line.cap)}`;
}

/** 1..10 as Roman numerals (catalog copies never exceed a handful; anything
 *  beyond the table falls back to the digits, fail-open). */
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
function roman(n: number): string {
  return ROMAN[n - 1] ?? String(n);
}

/** Pure: the "card fitted" toast line (UX-DR23 self-events-only surface, the
 *  pointToastLine sibling). Diamond glyph = the accrued-card marker the hotbar
 *  tooltip uses, so the toast and the build readout share one mark. */
export function boonFitToastLine(id: string, stack = 1): string {
  return `◆ ${boonName(id, Math.max(0, stack - 1))} FITTED`;
}

/** Every authored line id (test seam — the name/kind pins walk this). */
export const COPY_LINE_IDS: readonly string[] = LINE_IDS;
