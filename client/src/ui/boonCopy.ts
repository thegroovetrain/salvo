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
  CATALOG,
  CONFIG,
  EQUIPMENT_STAT_FIELDS,
  LINE_IDS,
  effectiveStats,
  isStubLine,
  tierTargetOf,
  type BoonStatPath,
  type CatalogLine,
  type EffectiveStats,
  type EquipmentId,
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

/**
 * One headline stat of a stat line: what to call it, WHICH STAT PATH it reads
 * and how to print it.
 *
 * STORY 8.7 replaced the `read` closure with the `path` itself. The ratified
 * card face prints a ROW PER STAT EFFECT rather than one headline sentence, and
 * a card's effects are authored as paths (`equipment.gun.damage`) — so the
 * label table has to be keyed the same way, or the face and this module would
 * be two different answers to "what do you call this number". `readStatPath`
 * below is the one reader both surfaces go through.
 */
interface StatLine {
  label: string;
  /** The EffectiveStats path this row reads — the same string the catalog's
   *  `stat` effects address, so `STAT_LABELS` can be generated from it. */
  path: BoonStatPath;
  fmt?: (v: number) => string;
}

/**
 * Pure: read a dotted stat path off an EffectiveStats. Fail-open to 0 on a path
 * that does not resolve — a card printing `0` is a visible defect, whereas a
 * throw from inside the refit band's per-frame render is a permanent freeze
 * (the cycle-91 lesson, applied to the reader rather than the class table).
 */
function readStatPath(stats: EffectiveStats, path: string): number {
  let cur: unknown = stats;
  for (const seg of path.split('.')) {
    if (typeof cur !== 'object' || cur === null) return 0;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return typeof cur === 'number' ? cur : 0;
}

/** Seconds to one decimal — "30.0 s". The equipment rows' own format: a
 *  weapon's reload is the only card number small enough that the tenth is the
 *  whole story (a 5 % step off 30 s is 1.5 s), so it never prints bare. */
function secs(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

/**
 * THE EQUIPMENT LINES' headline stat: THEIR OWN RELOAD.
 *
 * Copy 1 of an equipment line fits the weapon; every copy after it raises that
 * weapon's TIER, and a tier is −5 % of its own reload (derived from the tier in
 * sim/stats.ts clampStats, not authored as an effect). So the reload IS the
 * number that moves, and the card prints it like any ladder — through the same
 * live preview diff, so it can never promise a step the firewall would not
 * produce. Copy 1 on a hull WITHOUT the weapon honestly prints no change: what
 * that copy buys is the FIT, which the hover tooltip explains.
 *
 * Built from the catalog rather than typed out, and only for lines whose weapon
 * EXISTS — a stub line has no row worth reading, so it stays silent and falls
 * back to the fail-open stub rendering.
 */
function equipmentStatLines(): Partial<Record<LineId, StatLine>> {
  const out: Partial<Record<LineId, StatLine>> = {};
  for (const id of LINE_IDS) {
    const line = CATALOG[id];
    if (line.kind !== 'equipment' || isStubLine(id)) continue;
    const target = tierTargetOf(line);
    if (target === undefined) continue;
    out[id] = { label: 'Reload', path: `equipment.${target}.reloadMs` as BoonStatPath, fmt: secs };
  }
  return out;
}

/**
 * The headline stat each line moves — the number the card prints as
 * `current → next`, and the WHOLE of what a stat card's face says (R2.17).
 *
 * PARTIAL over the catalog: the five consumables are stubs and the five add-ons
 * are verbs, so neither has a number. What speaks is the five universal
 * ladders, the deck-gun family, and every LIVE equipment line (its own reload,
 * generated above). Each label below is carried over verbatim from the v2 line
 * this one replaces (see the `<-` notes), except TURNING, whose word is the
 * class-select stat label already shipped in ui/classSelect.ts.
 */
const STAT_LINES: Readonly<Partial<Record<LineId, StatLine>>> = {
  ...equipmentStatLines(),
  armor: { label: 'Max hull', path: 'maxHp' }, // <- shipHull
  speed: { label: 'Top speed', path: 'kinematics.maxSpeed' }, // <- shipSpeed
  turning: { label: 'Turning', path: 'kinematics.turnRate' },
  // <- intelSweep
  radarSweep: { label: 'Radar sweep', path: 'sweepRpm', fmt: (v) => `${num(v)} RPM` },
  // <- shipCooldown. The ONE global cooldown lever: `cooldownScale` multiplies
  // every equipment's reload post-fold, so this row reads the scalar itself
  // rather than any single weapon — printed as a percentage of base so
  // 100% → 95% reads downward.
  reload: { label: 'All cooldowns', path: 'cooldownScale', fmt: pct },
  // The DECK GUN ladder moves two numbers (damage here, its own reload derived
  // from the tier in clampStats) and the face prints ONE, exactly as the v2
  // broadside SPREAD line did: damage is the number the player watches change.
  deckGun: { label: 'Gun damage', path: 'equipment.gun.damage' },
  deckGunTurret: { label: 'Gun rounds ready', path: 'equipment.gun.maxAmmo' }, // <- gunTurret
  deckGunBarrel: { label: 'Shells per shot', path: 'equipment.gun.barrels' }, // <- gunBarrel
};

/**
 * THE ROW LABELS, keyed by STAT PATH and GENERATED from the table above (Story
 * 8.7, ruling 12): every word the card face prints in a row's left column is
 * the SAME word the hover panel and the slot tooltip already use for that
 * number, uppercased for the 9px mono register. Generated rather than retyped
 * so a relabelled stat cannot end up with two names.
 */
const STAT_LABELS: Readonly<Record<string, string>> = Object.fromEntries(
  Object.values(STAT_LINES)
    .filter((l): l is StatLine => l !== undefined)
    .map((l) => [l.path as string, l.label.toUpperCase()]),
);

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
    'Torpedoes run just under the surface and hit hard, but they run straight — you lead the target yourself. The first copy fits the tubes to your open slot, loaded, if you are not already carrying them; every copy after that is another tier, and each tier cuts their reload by 5%.',
  navalMines:
    'Mines drop astern and sit armed on the water until something crosses the trip ring around them. The first copy fits the racks to your open slot, loaded, if you are not already carrying them; every copy after that is another tier, and each tier cuts their reload by 5%.',
  broadside:
    'A broadside throws a fan of shells off whichever beam you clicked, port or starboard — never over the bow or the stern. The first copy fits the battery to your open slot, if you are not already carrying it; every copy after that is another tier, and each tier cuts its reload by 5%.',
  starShells:
    'A flare lights a circle of ocean you see into as if it were your own sight — the one way to look somewhere you are not. The first copy fits the mortar to your open slot, if you are not already carrying it; every copy after that is another tier, and each tier cuts its reload by 5%.',
  // --- the add-ons whose verbs exist today -----------------------------------
  acousticHoming:
    'Your torpedoes listen for hulls. Once one is inside the acquisition band the fish steers slowly onto it, correcting a near miss for you. It is a gentle turn, not a chase: hard helm still shakes it.',
  foulingMines:
    'Anything caught in one of your mine blasts has its screws fouled: 25% slower for 5 seconds. The damage is unchanged — what you buy is a hull that cannot run while you close on it.',
  phosphorShells:
    'Your lit circles catch fire. A slightly smaller ring inside each one burns every hull but yours at 5 hp a second for as long as the flare lasts. It stacks with DAZZLE SHELLS — one flare can do both.',
  dazzleShells:
    'Your lit circles dazzle. Any hull but yours standing in one has its own true sight cut in half while it stays there: it can still be seen, it just cannot see. It stacks with PHOSPHOR SHELLS.',
  // --- the consumables whose mechanisms exist today --------------------------
  // HULL REPAIR is the first live one (Story 8.8). The AMOUNTS are deliberately
  // absent from the prose: the card face prints them as rows, live from CONFIG,
  // and a number written twice is a number that can disagree with itself.
  hullRepair:
    'Stock it in your belt and fire it with that square\'s number key: part of the repair lands at once and the rest trickles in over the next few seconds. Each copy is one use, and a full hull refuses the press.',
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
  return `${line.label}: ${fmt(readStatPath(before, line.path))} → ${fmt(readStatPath(after, line.path))}.`;
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
  return `${line.label}: ${fmt(readStatPath(stats, line.path))}`;
}

// --- THE TIER NUMERALS (Story 8.7, ruling 11 / UX-DR51) ------------------------
//
// `boonLineageLine`'s "II/V" handrail is RETIRED with the interim face: the
// ratified card draws the ladder itself (one rung per copy the line has), so a
// numeral saying "two of five" would be the third time the same fact is stated.
// What the numerals carry instead is the STEP this card buys — `cur → next` —
// which is the one thing the rungs cannot say.

/**
 * THE FOUR BASE-TIER LINES (UX-DR51). A hull sails with armor, speed, turning
 * and a deck gun already fitted, so its FIRST card of one of those ladders is
 * the step from what it has to the next rung — `I → II` — rather than the
 * acquisition of a Tier I it already owns. Every other ladder, and every weapon
 * line, starts from nothing: its first copy IS Tier I and reads as the bare
 * numeral, with the `cur → next` step appearing only from the second copy on.
 */
const BASE_TIER_LINES: ReadonlySet<string> = new Set(['armor', 'speed', 'turning', 'deckGun']);

/** The step a card buys, as NUMBERS — so the DOM can tint each numeral on the
 *  absolute ladder ramp without re-parsing "III → IV" back apart. `next` is
 *  null on a first copy that is itself Tier I (the bare-numeral case). */
export interface CardTierStep {
  cur: number;
  next: number | null;
}

/**
 * Pure: the tier step for a line at `copiesHeld` copies, or null for a line
 * with NO LADDER at all — a consumable (you carry copies, you do not climb) or
 * an add-on (a verb is fitted once and has no rungs). The card renders an empty
 * ladder row for those, so every card in the offer keeps one baseline.
 */
export function cardTierSteps(line: CatalogLine, copiesHeld: number): CardTierStep | null {
  if (line.kind === 'consumable' || line.kind === 'addon') return null;
  // REVIEW GATE, CYCLE 147: `Math.trunc(NaN)` is `NaN`, and `Math.max(0, NaN)`
  // is `NaN` too — so a non-finite `copiesHeld` (a caller's arithmetic slip)
  // used to sail through untouched and poison `cur`/`next` downstream. Fenced
  // to a held-nothing read (0) rather than propagating the NaN.
  const k = Number.isFinite(copiesHeld) ? Math.max(0, Math.trunc(copiesHeld)) : 0;
  const base = BASE_TIER_LINES.has(line.id);
  const ceiling = tierCeiling(line, base);
  const cur = Math.min(base ? k + 1 : Math.max(1, k), ceiling);
  if (!base && k === 0) return { cur, next: null };
  return { cur, next: cur < ceiling ? cur + 1 : null };
}

/**
 * THE TOP RUNG a line's numerals may ever print (Story 8.12). The ramp is FIVE
 * rungs and no more (UX-DR51), and the caps are authored to land on it: a
 * base-tier line's ceiling is `cap + 1`, because the hull already sails at rung
 * I and every card is a step above it, while every other line's ceiling is the
 * cap itself, its first copy BEING rung I.
 *
 * At the ceiling the card prints the bare numeral — there is no next rung to
 * sell, so `V → VI` is not merely unreachable in play, it is unwritable. Below
 * the ceiling nothing moves: every label is what it was before this story.
 */
function tierCeiling(line: CatalogLine, base: boolean): number {
  return Math.min(base ? line.cap + 1 : line.cap, RAMP_RUNGS);
}

/** Pure: those numerals as the card prints them — `III → IV`, or `I` alone on a
 *  first copy, or null for a consumable / add-on. Replaces `boonLineageLine`. */
export function cardTierLabel(line: CatalogLine, copiesHeld: number): string | null {
  const step = cardTierSteps(line, copiesHeld);
  if (step === null) return null;
  return step.next === null ? roman(step.cur) : `${roman(step.cur)} ${TIER_ARROW} ${roman(step.next)}`;
}

/** The arrow between the two numerals, declared once (the fit model measures the
 *  same glyph). */
export const TIER_ARROW = '→';

/** THE RAMP IS FIVE RUNGS, ABSOLUTE (UX-DR51) — a sixth is forbidden whatever a
 *  future cap says, so `tierCeiling` clamps to this whether or not a catalog
 *  edit ever again lets `cap + 1` (or `cap` itself) exceed it. */
const RAMP_RUNGS = 5;

/** 1..10 as Roman numerals (catalog copies never exceed a handful; anything
 *  beyond the table falls back to the digits, fail-open). */
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
function roman(n: number): string {
  return ROMAN[n - 1] ?? String(n);
}

/**
 * Pure: the "card fitted" toast line (UX-DR23 self-events-only surface, the
 * pointToastLine sibling). Diamond glyph = the accrued-card marker the hotbar
 * tooltip uses, so the toast and the build readout share one mark.
 *
 * A CONSUMABLE IS STOCKED, NOT FITTED (Story 8.7, ruling 14 — UX-DR48's
 * "consumable stocked"). Nothing about the hull changed: a copy went onto the
 * belt, and the verb has to say so or the toast claims a fit that never
 * happened. `kind` is the line's catalog kind, passed by the caller that
 * already has the resolved line (net/roomBindings.ts); an absent or unknown
 * kind reads as the FITTED default, which is what every pre-8.7 caller gets.
 */
export function boonFitToastLine(id: string, stack = 1, kind?: string): string {
  const verb = kind === 'consumable' ? 'STOCKED' : 'FITTED';
  return `◆ ${boonName(id, Math.max(0, stack - 1))} ${verb}`;
}

/** Every authored line id (test seam — the name/kind pins walk this). */
export const COPY_LINE_IDS: readonly string[] = LINE_IDS;

// --- THE FIVE STAT ROWS (Story 8.7, ruling 12) ---------------------------------
//
// The ratified card face (mock `.rc .rows`) is a fixed grid of five 17px rows,
// each a LABEL and a VALUE. It replaces `boonDescription` ON THE FACE —
// `boonDescription` stays, unchanged, as the hover panel's one sentence — and it
// is the only place a number reaches the card, which is what keeps the card and
// the firewall in step: every value below comes out of `effectiveStats`.
//
// FEWER THAN FIVE IS NORMAL. A ladder moves one number; a weapon's first copy
// prints its whole table; an add-on moves none at all. The DOM renders the
// remainder BLANK rather than compacting, so the KIND word and the foot sit on
// one baseline across all four cards in the row.

/** The card's row cap — the mock's five-row grid. A line with more numbers than
 *  that prints its first five, in the table's own order. */
export const CARD_STAT_ROWS = 5;

/** ONE row of the face: a label, the value the build has NOW (null on an
 *  ABSOLUTE row — a weapon's first copy has no `before` to print), and the value
 *  this card would produce. */
export interface CardStatRow {
  label: string;
  cur: string | null;
  next: string;
}

/**
 * THE FIELD WORDS — what the face calls an equipment row's own stat fields
 * (`EQUIPMENT_STAT_FIELDS`). PARTIAL on purpose: the entries below are the words
 * the ruling names, and everything else falls through `fieldWord`'s humanizer,
 * which de-camelCases the field and drops a trailing `Ms`. That fail-open is
 * what lets Stories 8.13-8.16 land a new weapon row without a copy edit here —
 * and, being derived from the field name Eric's own sheet authored, it invents
 * no vocabulary.
 */
const FIELD_WORDS: Readonly<Record<string, string>> = {
  reloadMs: 'RELOAD',
  maxAmmo: 'ROUNDS',
  damage: 'DAMAGE',
  contactDamage: 'CONTACT DMG',
  burstRadius: 'BURST RADIUS',
  blastRadius: 'BLAST RADIUS',
  triggerRadius: 'TRIGGER RADIUS',
  speed: 'SPEED',
  barrels: 'SHELLS PER SHOT',
  // `speedBonus` had a row here until Story 8.9: the boost's bonus became a
  // PROPORTION of the post-fold cap (epic-8 amendment 55), so it left
  // `EQUIPMENT_STAT_FIELDS` entirely and no card can address it. A word for a
  // field no row carries is a label that can never print.
  durationMs: 'DURATION',
  spreadRung: 'SPREAD',
};

/** Pure: a field's row label — the table above, else the humanized field name
 *  uppercased (`litDurationMs` reads LIT DURATION). */
function fieldWord(field: string): string {
  if (Object.hasOwn(FIELD_WORDS, field)) return FIELD_WORDS[field];
  return humanize(field.replace(/Ms$/, '')).toUpperCase();
}

/** Pure: a field's printer. A `*Ms` field is a duration and prints as seconds
 *  ("30.0 s"); everything else takes `num`, which prints an integer AS an
 *  integer — epic-8 amendment 39's rule, applied to every row on the face. */
function fieldFmt(field: string): (v: number) => string {
  return /Ms$/.test(field) ? secs : num;
}

/** Pure: a stat PATH's row label — a ladder path takes the word its `STAT_LINES`
 *  entry already uses, an equipment path takes its field word. */
function statPathLabel(path: string): string {
  if (Object.hasOwn(STAT_LABELS, path)) return STAT_LABELS[path];
  return fieldWord(path.split('.').pop() ?? path);
}

/** Pure: a stat PATH's printer — the authored `fmt` where one exists (RPM, the
 *  cooldown percentage, a weapon's seconds), else the field's own. */
function statPathFmt(path: string): (v: number) => string {
  for (const line of Object.values(STAT_LINES)) {
    if (line !== undefined && line.path === path && line.fmt !== undefined) return line.fmt;
  }
  return fieldFmt(path.split('.').pop() ?? path);
}

/** Pure: one `current to next` row for a stat path, read off the two folds. */
function diffRow(path: string, before: EffectiveStats, after: EffectiveStats): CardStatRow {
  const fmt = statPathFmt(path);
  return { label: statPathLabel(path), cur: fmt(readStatPath(before, path)), next: fmt(readStatPath(after, path)) };
}

/**
 * Pure: a LADDER line's rows — one per `stat` effect in the tier this card
 * WOULD apply (`tiers[copiesHeld]`, clamped to the last authored rung), valued
 * through the live preview diff. Every shipped ladder authors exactly one stat
 * effect per rung, so this is one row today; it is written per-effect because
 * the catalog shape permits more and a two-number rung must not silently print
 * only one of them.
 */
function ladderRows(
  line: CatalogLine,
  copiesHeld: number,
  before: EffectiveStats,
  after: EffectiveStats,
): CardStatRow[] {
  const k = Math.min(Math.max(0, Math.trunc(copiesHeld)), line.tiers.length - 1);
  const rows: CardStatRow[] = [];
  for (const e of line.tiers[k] ?? []) {
    if (e.kind === 'stat') rows.push(diffRow(e.path, before, after));
  }
  return rows;
}

/** Pure: one ABSOLUTE row of an equipment's own table (no `before`, no arrow). */
function absoluteRow(target: EquipmentId, field: string, stats: EffectiveStats): CardStatRow {
  return {
    label: fieldWord(field),
    cur: null,
    next: fieldFmt(field)(readStatPath(stats, `equipment.${target}.${field}`)),
  };
}

/**
 * Pure: a WEAPON line's rows.
 *
 * COPY 1 IS THE FIT, and a fit moves no number — what it buys is the weapon, so
 * the card prints that weapon's whole table ABSOLUTELY (`cur` null, no arrow),
 * in `EQUIPMENT_STAT_FIELDS` order. The MINE rows add a derived `TRIGGER RADIUS`
 * immediately after `BLAST RADIUS` (UX-DR50's "separate rows"): the trip ring is
 * not stat-addressable — `clampStats` derives it from the blast — so it has no
 * field of its own and would otherwise never reach the player at all.
 *
 * COPY 2 AND UP is a TIER, and a tier is a 5% cut to that weapon's own reload
 * (derived in sim/stats.ts, not authored as an effect), so the card prints that
 * one step exactly as a ladder prints its own.
 */
function weaponRows(
  line: CatalogLine,
  copiesHeld: number,
  before: EffectiveStats,
  after: EffectiveStats,
): CardStatRow[] {
  const target = tierTargetOf(line);
  if (target === undefined) return [];
  if (copiesHeld > 0) {
    const stat = STAT_LINES[line.id];
    return stat === undefined ? [] : [diffRow(stat.path, before, after)];
  }
  const row = after.equipment[target] as unknown as Record<string, unknown>;
  const rows: CardStatRow[] = [];
  for (const field of EQUIPMENT_STAT_FIELDS[target] as readonly string[]) {
    rows.push(absoluteRow(target, field, after));
    if (field === 'blastRadius' && typeof row.triggerRadius === 'number') {
      rows.push(absoluteRow(target, 'triggerRadius', after));
    }
  }
  return rows;
}

/**
 * A CONSUMABLE'S ROWS (Story 8.8). A consumable moves no stat on the hull — it
 * is a stack you fire — so there is no preview diff to read and no `cur` to
 * print: every row below is ABSOLUTE (`cur` null, no arrow), exactly as a
 * weapon's first copy prints its own table.
 *
 * The numbers come out of `CONFIG` and are NEVER hardcoded, so a retune of the
 * ruling moves the card's own copy with it — the rule the retired DAMAGE
 * CONTROL rail's readout followed, kept.
 *
 * ONE ENTRY TODAY. HULL REPAIR is the first live consumable (amendment 41
 * flipped its stub in this story); the other four are still stubs, are never
 * dealt, and get no rows.
 */
function hullRepairRows(): CardStatRow[] {
  const h = CONFIG.hullRepair;
  return [
    // The instant half: `instantHp` the moment the copy fires, clamped to maxHp.
    { label: 'INSTANT', cur: null, next: `+${num(h.instantHp)} HP` },
    // The pooled half: `regenHp` paid over `regenMs` (epic-8 amendment 51 — the
    // shipped pool is 50 hp over 5 s; the "5 hp/s" in R13/FR47 is a stale
    // figure). Printed as the AMOUNT over its TIME rather than as a rate,
    // because the amount is what stacks: pools ADD, the rate never changes.
    { label: 'OVER TIME', cur: null, next: `+${num(h.regenHp)} HP / ${num(h.regenMs / 1000)} S` },
  ];
}

/** The rows each LIVE consumable line prints. A line with no entry (all four
 *  remaining stubs) prints none, which is the honest answer for a mechanism
 *  that does not exist yet. */
const CONSUMABLE_ROWS: Readonly<Partial<Record<LineId, () => CardStatRow[]>>> = {
  hullRepair: hullRepairRows,
};

/**
 * Pure: the rows the card face prints for one offered line, against the
 * PLAYER'S OWN BUILD — at most `CARD_STAT_ROWS`, and legitimately EMPTY for a
 * line that moves no number:
 *
 *   - an ADD-ON bolts on a verb (its holding line stays in the hover panel);
 *   - a STUB line has no built module whose numbers could be read;
 *   - a CONSUMABLE that is still a stub (four of the five) has no mechanism to
 *     describe — the LIVE ones print `CONSUMABLE_ROWS` above instead.
 *
 * FAIL-OPEN on the class table, exactly as `statSentence` is and for the same
 * reason: this runs every frame the band is open, and an unresolvable hull must
 * print nothing rather than throw from inside the ticker.
 */
export function cardStatRows(
  line: CatalogLine,
  copiesHeld: number,
  you: BoonPreviewShip,
): readonly CardStatRow[] {
  // A CONSUMABLE IS ANSWERED FIRST and never reaches the preview fold below: it
  // fits nothing, so `effectiveStats` with its id appended moves no number.
  if (line.kind === 'consumable') return CONSUMABLE_ROWS[line.id as LineId]?.() ?? [];
  if (isStubLine(line.id) || line.kind === 'addon') return [];
  if (!Object.hasOwn(CONFIG.shipClasses, you.cls)) return [];
  const spec = CONFIG.shipClasses[you.cls];
  const before = effectiveStats(spec, you.cards);
  const after = effectiveStats(spec, [...you.cards, line.id]);
  const rows = line.kind === 'equipment'
    ? weaponRows(line, copiesHeld, before, after)
    : ladderRows(line, copiesHeld, before, after);
  return rows.slice(0, CARD_STAT_ROWS);
}
