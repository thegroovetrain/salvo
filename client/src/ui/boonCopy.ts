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
// shell, as are PROP FOULING and CAPTIVE MINES on one mine, so no doctrine
// card's rules text may imply an either/or any more.
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
//     and nothing else; a verb or acquisition card returns '' and its face is
//     name + tag alone. The `note` riders are gone from STAT_LINES entirely.
//   • `boonTooltipText` — THE EXPLANATION (BOON_EXPLAIN). Total over the
//     catalog, plain language, and deliberately longer than anything that ever
//     fitted on a card, because it is no longer inside the card's box.
//   • `boonEffectLine` — THE HOLDING readout for the hotbar slot tooltip and the
//     results build list: the live value, or a verb's short HOLDING line.
//
// The honesty rules bind ACROSS surfaces, not per string: GUN BUOY may never
// claim a hostility gate (R2.21) and JAMMING BUOY may never claim concealment
// (R2.11), on the face, in the holding line, and in the explanation alike.
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
  // Eric's names, verbatim. SPREAD widens each turret's own firing arc (the
  // 2026-08-20 per-turret-arc ruling), which is why its rules text prints the
  // traverse half-angle rather than the rung the card writes.
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
  buoyDuration: ['BUOY I', 'BUOY II', 'BUOY III', 'BUOY IV'],
  buoyGun: ['GUN BUOY'],
  buoyJamming: ['JAMMING BUOY'],
  // --- INTEL ---------------------------------------------------------------
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

/** Radians as a signed half-angle in whole-ish degrees — "±34°". The ± is
 *  doing real work: it says the number is a HALF-WIDTH about each turret's own
 *  mount bearing (its traverse), not a distance. */
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

/** One headline stat of a stat line: what to call it, where to read it and how
 *  to print it.
 *
 *  THE `note` FIELD IS DELETED (Story 7-5 wave 2, R2.17). A standing rider —
 *  "The trip ring widens with it.", "Every weapon and ability reloads faster." —
 *  is EXPLANATION, and the card face no longer carries explanation: it carries
 *  the ladder name, the lineage marker, the rarity tag and the `current → next`
 *  sentence, and nothing else. Every one of those riders was folded into the
 *  line's hover-tooltip copy (BOON_EXPLAIN) rather than dropped. */
interface StatLine {
  label: string;
  read: (s: EffectiveStats) => number;
  fmt?: (v: number) => string;
}

/** The headline stat each COMMON/RARE line moves — the number the card prints
 *  as `current → next`, and since R2.17 the WHOLE of what a stat card's face
 *  says. One row per stat line in BOON_CATALOG. */
const STAT_LINES: Readonly<Record<string, StatLine>> = {
  gunBarrel: { label: 'Shells per shot', read: (s) => s.gun.barrels },
  gunTurret: { label: 'Gun rounds ready', read: (s) => s.gun.maxAmmo },
  // THE BROADSIDE PAIR (Story 7-5 wave 2). SPREAD's stat-addressable field is a
  // RUNG (1..5) — an index into an authored ladder of degrees — and printing
  // "1 → 2" would tell the player nothing about what tightens. So it reads the
  // DERIVED half-angle instead, straight off the same effectiveStats preview
  // diff every other line uses: the firewall does the ladder lookup and the ×4
  // clamp, so a maxed stack honestly prints the same number twice.
  //
  // SINCE 2026-08-27 THE CARD MOVES TWO NUMBERS and the face still prints ONE.
  // The rung also swings the MOUNT bearings inward (`mountSpreadRad`), which is
  // half of what the card actually buys — but a second printed line would need
  // NEW PLAYER-FACING WORDS, and inventing card copy is what the naming law
  // forbids. Traverse stays the headline because it is the number the player
  // sees change on the water (their wedges get wider). FLAGGED FOR ERIC'S COPY
  // PASS: the choke is currently unnamed on the face.
  broadsideSpread: { label: 'Turret traverse', read: (s) => s.broadside.traverseRad, fmt: halfAngleDeg },
  broadsideTurrets: { label: 'Shells per barrage', read: (s) => s.broadside.turrets },
  torpedoSpeed: { label: 'Torpedo speed', read: (s) => s.torpedo.speed },
  torpedoTube: { label: 'Torpedoes loaded', read: (s) => s.torpedo.maxAmmo },
  mineBlast: { label: 'Mine blast radius', read: (s) => s.mine.blastRadius },
  // The two halves of the retired `boostMax` line, bought separately now.
  boostDuration: { label: 'Boost duration', read: (s) => s.boost.durationMs, fmt: secs },
  boostSpeed: { label: 'Boost speed', read: (s) => s.boost.speedBonus },
  starDuration: { label: 'Flare burn time', read: (s) => s.starShells.litDurationMs, fmt: secs },
  // R2.20 (Eric ruling 2026-08-19) replaced the sweep-rate line with this one:
  // +2.5s of buoy life per card.
  buoyDuration: { label: 'Buoy lifetime', read: (s) => s.radarBuoy.durationMs, fmt: secs },
  intelSweep: { label: 'Radar sweep', read: (s) => s.sweepRpm, fmt: (v) => `${num(v)} RPM` },
  shipSpeed: { label: 'Top speed', read: (s) => s.kinematics.maxSpeed },
  shipHull: { label: 'Max hull', read: (s) => s.maxHp },
  // The ONE global cooldown lever: `cooldownScale` multiplies every equipment's
  // reload post-fold, so this row reads the scalar itself rather than any single
  // weapon — printed as a percentage of base so 100% → 90% reads downward.
  shipCooldown: { label: 'All cooldowns', read: (s) => s.cooldownScale, fmt: pct },
};

/**
 * The verb cards' HOLDING line — the compact "what this line is doing for you
 * RIGHT NOW" that a hotbar tooltip row and a results-screen build row print
 * under a `◆ NAME`. A verb moves no number, so `boonEffectLine` has nothing to
 * read off `EffectiveStats`; this table is what those two surfaces show instead.
 *
 * IT IS NEITHER THE CARD FACE NOR THE EXPLANATION (Story 7-5 wave 2, R2.17).
 * A verb card's FACE is now name + tag only, and the EXPLANATION — the answer
 * to *"what the fuck does a captive mine do?"* — lives in BOON_EXPLAIN below,
 * where no container budget compresses it. These stay short deliberately: they
 * ride INSIDE the hotbar panel, whose own fit pin (__tests__/tooltipFit.test.ts)
 * starts trimming accrued rows away the moment they grow.
 *
 * STORY 7-5 WAVE 1: the verbs STACK now, so no line here may imply an either/or.
 * PROP FOULING no longer claims a damage penalty (cycle 95 deleted it).
 */
const DOCTRINE_HOLDING: Readonly<Record<string, string>> = {
  torpedoHoming: 'Torpedoes steer onto the nearest hull in their acquisition band.',
  mineCaptive: 'Mines fire one torpedo instead of blasting on contact.',
  // R2.21 (Eric ruling 2026-08-19) SUPERSEDED R2.10's hostile gate: the gun buoy
  // is AUTONOMOUS and shoots anything its own radar sees that is not its owner —
  // enemy captains, bots and NEUTRAL fleet drones alike, nearest to the buoy
  // first. So this line may not say "hostile", "enemy" or "attacker": every one
  // of those words promises an aggro gate this weapon does not have. The same
  // ban binds its BOON_EXPLAIN entry, and boonCopy.test.ts checks both.
  buoyGun: 'Buoys shoot the nearest hull but yours: 5 damage every 5s.',
  // R2.11: it ADDS fakes and never deletes a real return, and it is RADAR ONLY.
  // The line must not imply concealment — the buoy hides nothing, it makes the
  // water unreadable — and must leave the counter standing: sail in and look.
  buoyJamming: 'Buoys fill their circle with false radar returns for all but you.',
  minePropFouling: 'Mine blasts foul screws: 25% slower for 5 seconds.',
  starIncendiary: 'Your lit zones also burn every hull but yours inside them.',
  starDazzle: 'Your lit zones also cut the true sight of every hull but yours.',
};

/** The acquisition cards' HOLDING line — DOCTRINE_HOLDING's sibling for the six
 *  equipment fits: same job, same two consumers, same brevity budget. */
const ACQUISITION_HOLDING: Readonly<Record<string, string>> = {
  acquireTorpedo: 'Torpedo tubes fitted; their cards joined your deck.',
  acquireMine: 'Mine racks fitted; their cards joined your deck.',
  acquireStarShells: 'A star shell mortar fitted; its cards joined your deck.',
  acquireBroadside: 'A broadside battery fitted; its cards joined your deck.',
  acquireRadarBuoy: 'A radar buoy rack fitted; its cards joined your deck.',
  acquireBoost: 'An emergency throttle fitted; its cards joined your deck.',
};

/**
 * THE EXPLANATIONS (Story 7-5 wave 2, R2.17 — Eric ruling 2026-08-19).
 *
 * *"hovering one with the mouse should give a tooltip explaining the card, so
 * that there are no questions like 'what the fuck does a captive mine do?'"*
 *
 * ONE ENTRY PER CATALOG LINE — TOTAL, stat lines included, because a
 * `current → next` number does not tell a new player what `cooldownScale` or a
 * trip ring IS. These are plain-language answers to "what does this actually
 * do", written for somebody who has never seen the mechanic.
 *
 * THEY ARE DELIBERATELY LONGER THAN ANYTHING THAT EVER FITTED ON A CARD.
 * Amendment 47's ~90-character / ~5-wrapped-line budget is a statement about
 * the 216×236 card BOX (Story 2.8's doctrine text overflowed it by 50–97px on
 * the live site). This copy does not live in that box, so that budget does not
 * govern it — but it is not unbounded either: __tests__/refitTooltipFit.test.ts
 * measures every entry against the hover panel's OWN container, the clear space
 * above the refit band at the 1280×614 logical floor.
 *
 * THE HONESTY PINS SURVIVE THE REWRITE. Two shipped wordings were caught lying
 * during this story, and their replacements are pinned by forbidden-word lists
 * on BOTH surfaces: GUN BUOY may not say hostile/enemy/attacker/threat (R2.21
 * made it autonomous — it shoots neutral fleet drones too), and JAMMING BUOY
 * may not say hide/conceal/invisible/cloak (R2.11 — it ADDS fakes, removes
 * nothing, and sailing in to look is the ratified counter).
 *
 * WHERE THE OLD `note` RIDERS WENT: every standing rider the card face used to
 * carry ("The trip ring widens with it.", "Repairs the hull it adds.", the
 * eighths-ladder list on RANGE, the buoy-gap curve on BUOY) was folded into the
 * matching entry below rather than dropped.
 */
const BOON_EXPLAIN: Readonly<Record<string, string>> = {
  // --- guns ----------------------------------------------------------------
  gunBarrel:
    'Your gun throws extra shells on parallel tracks either side of the one you aimed, each bursting at its own point. An odd number puts one shell exactly on your click; an even number straddles it.',
  gunTurret:
    'Keeps a second gun round ready, so you can fire twice back to back instead of waiting out the whole reload between shots. The reload is unchanged — you simply have somewhere to keep the spare.',
  // --- broadside -----------------------------------------------------------
  broadsideSpread:
    'Each turret in the battery has its own firing arc and fires as close to your click as that arc can swing. Each card widens every arc, so more of the salvo can train onto the point you clicked.',
  broadsideTurrets:
    'Adds a turret to each side, so every barrage throws one more shell — one more gun, with its own arc, that can bear on the point you click. Every gun that bears lands its shell exactly there.',
  // --- torpedoes -----------------------------------------------------------
  torpedoSpeed:
    'A faster fish reaches the target sooner and leaves less water for them to turn out of. It does not hit harder: speed buys shots that are harder to dodge, not shots that hurt more.',
  torpedoTube:
    'Keeps a second torpedo loaded, so you can put two in the water back to back — a spread at one hull, or one each at two — instead of waiting out a full reload between them.',
  torpedoHoming:
    'Your torpedoes listen for hulls. Once one is inside the acquisition band the fish steers slowly onto it, correcting a near miss for you. It is a gentle turn, not a chase: hard helm still shakes it.',
  // --- mines ---------------------------------------------------------------
  mineBlast:
    'Widens the mine blast, and the trip ring with it — the ring that sets a mine off is always two thirds of the blast, so one card grows both. A wider mine denies more water and is harder to thread.',
  minePropFouling:
    'Anything caught in one of your mine blasts has its screws fouled: 25% slower for 5 seconds. The damage is unchanged — what you buy is a hull that cannot run while you close on it.',
  mineCaptive:
    'A captive mine is a torpedo waiting on a mooring. It never blows up on contact. It sits on a much wider trip ring and, when a hostile crosses that ring, launches one torpedo at where they are heading — then it is spent.',
  // --- speed boost ---------------------------------------------------------
  boostDuration:
    'Holds the emergency throttle open longer, so one press carries you further. It does not raise the speed you boost to — that is the other boost line.',
  boostSpeed:
    'Raises the speed the emergency throttle drives you to, over your rated top speed. It does not last any longer — that is the other boost line.',
  // --- star shells ---------------------------------------------------------
  starDuration:
    'A star shell lights a circle of ocean wherever you drop it, and you see into your own lit circle as clearly as into your own sight. It is how you look somewhere you are not. The flare burns longer.',
  starIncendiary:
    'Your lit circles catch fire. A slightly smaller ring inside each one burns every hull but yours at 5 hp a second for as long as the flare lasts. It stacks with DAZZLE SHELLS — one flare can do both.',
  starDazzle:
    'Your lit circles dazzle. Any hull but yours standing in one has its own true sight cut in half while it stays there: it can still be seen, it just cannot see. It stacks with PHOSPHOR SHELLS.',
  // --- radar buoy ----------------------------------------------------------
  buoyDuration:
    'A radar buoy is a set of eyes you leave behind: it sweeps its own circle and relays what it paints to you alone. Each card keeps one on the water longer, closing the dead gap between one buoy and the next.',
  buoyGun:
    'Bolts a light gun to your buoys. Each one fires by itself at the nearest hull its own radar can see — anything at all except yours — for 5 damage every 5 seconds. What it cannot see, it cannot shoot.',
  buoyJamming:
    'Your buoys flood their own circle with false radar returns. Every other scope fills with contacts that are not there; real returns still paint, they are simply one candidate among many. Sight sees the truth.',
  // --- intel ---------------------------------------------------------------
  intelSweep:
    'Spins your radar faster. A contact paints only as the beam crosses its bearing, so a quicker sweep refreshes what you know more often and leaves a target less water to cross between paints.',
  // --- ship ----------------------------------------------------------------
  shipSpeed:
    'Raises your top speed ahead. Reverse and rate of turn are untouched — this is straight-line pace, which decides whether you can close a gap or break off a fight you are losing.',
  shipHull:
    'Raises your maximum hull, and repairs exactly the amount it adds the moment you fit it — so it is a heal as well as a buffer. Nothing else in the game raises maximum hull.',
  shipCooldown:
    'There is one cooldown lever in the game and this is it: every weapon and ability you carry reloads faster by the same fraction. It reads as a percentage of base, so the number falls as you stack it.',
  // --- acquisitions --------------------------------------------------------
  acquireTorpedo:
    'Fits torpedo tubes to your open slot, loaded. Torpedoes run just under the surface and hit hard, but they run straight — you lead the target yourself. Their upgrade cards join your deck.',
  acquireMine:
    'Fits mine racks to your open slot, loaded. Mines drop astern and sit armed on the water until something crosses the trip ring around them. Their upgrade cards join your deck.',
  acquireStarShells:
    'Fits a star shell mortar to your open slot. A flare lights a circle of ocean you see into as if it were your own sight — the one way to look somewhere you are not. Its upgrade cards join your deck.',
  acquireBroadside:
    'Fits a broadside battery to your open slot. It throws a fan of shells off whichever beam you clicked, port or starboard — never over the bow or the stern. Its upgrade cards join your deck.',
  acquireRadarBuoy:
    'Fits a radar buoy rack to your open slot. A buoy is a stationary set of eyes you drop astern; it sweeps its own circle and relays the returns to you until it expires or is sunk. Its cards join your deck.',
  acquireBoost:
    'Fits an emergency throttle to your open slot. One press drives your hull past its rated top speed for a few seconds — for closing, for breaking off, for stepping out of a torpedo. Its cards join your deck.',
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
 * Pure: the card FACE's one text row — and, since R2.17 (Eric ruling
 * 2026-08-19), the ONLY prose a card face carries.
 *
 * *"I want the card itself to be pretty minimal in the upgrade tab, just the
 * name and stat change as before (previous -> new) if applicable."*
 *
 * So a STAT line prints its headline number as `current → next` (live, via the
 * preview diff above) and NOTHING else — no standing note. A VERB card (the
 * doctrines) and an ACQUISITION card move no number, so they print NOTHING AT
 * ALL: their face is the ladder name, the lineage marker and the rarity tag,
 * and their explanation lives in the hover tooltip (`boonTooltipText`).
 *
 * An empty string is therefore a LEGITIMATE, EXPECTED answer here, not a
 * failure — which is a real change from Story 2.8, where blank rules text meant
 * a broken card. Fail-open still holds for the one case that IS a failure: an
 * unresolvable hull prints no half-formed number.
 */
export function boonDescription(def: BoonDef, you: BoonPreviewShip): string {
  if (!Object.hasOwn(STAT_LINES, def.id)) return '';
  // An empty sentence means statSentence could not resolve the hull — the ONLY
  // way it returns '' (every other path returns a template with a label and two
  // numbers), and printing nothing beats printing half a diff.
  return statSentence(def.id, STAT_LINES[def.id], you);
}

/**
 * Pure: the card's HOVER-TOOLTIP EXPLANATION — what the card actually does, in
 * plain terms (Story 7-5 wave 2, R2.17).
 *
 * *"hovering one with the mouse should give a tooltip explaining the card, so
 * that there are no questions like 'what the fuck does a captive mine do?'"*
 *
 * TOTAL over BOON_CATALOG — EVERY line gets one, stat lines included, because a
 * `current → next` number does not tell a new player what `cooldownScale` or a
 * trip ring IS. Keyed on the id alone and carrying NO live values: the face
 * already prints the player's own numbers, and a static string is what makes
 * the tooltip's container-fit pin exact rather than build-dependent.
 *
 * HOVER ONLY, BY RULING. There is deliberately no keyboard path to this text:
 * Tab opens the refit window and 1–4 / 5 pick, and *"an experienced player
 * knows what they want and will use the shortcut or click faster without
 * reading"* — the shortcut exists precisely so the reading can be skipped.
 *
 * Fail-open to '' on an unwritten id, exactly like every other lookup here.
 */
export function boonTooltipText(id: string): string {
  return Object.hasOwn(BOON_EXPLAIN, id) ? BOON_EXPLAIN[id] : '';
}

/**
 * Pure: the ACCRUED-BOON effect line for the hotbar slot tooltip (Story 2.9) —
 * the one-line "what this line is doing for you RIGHT NOW" under a `◆ NAME` row.
 *
 * Deliberately NOT the refit card's sentence: a card sells a change and prints
 * `current → next`; a tooltip row reports a HOLDING and prints the value the
 * fitted build actually has. So the stat lines read straight off the LIVE
 * effective stats already resolved for the slot (no preview diff, no second
 * resolve — `stats` IS the firewall's output for this hull).
 *
 * Doctrine and acquisition lines have no number to report, so they print their
 * HOLDING line (DOCTRINE_HOLDING / ACQUISITION_HOLDING). Since R2.17 that is a
 * table of its own rather than a share of the card's copy: the card face stopped
 * carrying prose at all, and the hover EXPLANATION is far too long to ride
 * inside a panel whose own fit pin (__tests__/tooltipFit.test.ts) trims accrued
 * rows away as they grow. Two surfaces, two lengths, one set of honesty pins.
 *
 * TOTAL over BOON_CATALOG by construction (every line is a stat, a doctrine or
 * an acquisition); an unwritten id fails open to '' rather than breaking a row.
 */
export function boonEffectLine(id: string, stats: EffectiveStats): string {
  if (Object.hasOwn(DOCTRINE_HOLDING, id)) return DOCTRINE_HOLDING[id];
  if (Object.hasOwn(ACQUISITION_HOLDING, id)) return ACQUISITION_HOLDING[id];
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
