// THE HOW-TO-PLAY COPY (Story 7.3; rewritten for the big ocean by Story 11.11,
// 2026-11-16, which owns Story 10.14 whole — epic-11 amendments 2 and 18).
//
// DRAFT COPY, AWAITING ERIC'S PASS. Eric holds the pen on this page, and
// epic-6 amendment 41 is standing project law: *a ruling to put information
// somewhere is NOT a licence to author the copy that goes there.* Story 11.11
// kept every one of Eric's 2026-10-01 sentences that is still true WORD FOR
// WORD, made the smallest edit to the ones the game outgrew, and drafted the
// rest from facts verified against the code at b5713a4f (the Story 7.3 /
// `policyCopy.ts` R9 mould: draft from verified facts, Eric approves).
//
// SCOPE IS ERIC'S, 2026-08-19: *"This page needs to give people the basics on
// how to steer their ship, select weapons, upgrade, and shoot. They can figure
// the rest out through play."* No glossary ("NO FUCKING GLOSSARY. One page.").
//
// REGISTER: terse naval; sentences are sanctioned here (EXPERIENCE.md names
// How-to-Play as a prose surface); headings stay uppercase mono.
//
// WHAT THE PAGE TEACHES IS WHAT A CAPTAIN CAN BE DEALT. The CANNON, MACHINE
// GUN, FLAK and BROADSIDE lines are still in the catalog but no captain is ever
// offered them (every hull mounts the main battery; BROADSIDE has no family
// slot), so they have no entry. Epic 11's unbuilt stories (11.4 the operated
// set, 11.9, 11.10 — Eric 2026-11-16: "we're skipping 11-10") and its shelved
// ones (11.3 the arc, 11.5 the splash return) are not described.
//
// Section prose may carry numbers (a retune must come back here); an ENTRY's
// description never does — Eric 2026-10-01: *"give me a stat table showing its
// exact attributes at each tier"* — `pageMarkup.ts` derives each table through
// `weaponTables.ts` from the sim's one stat function.

import type { KeyBinding } from '../ui/pageMarkup.js';

/** Which derived table an entry carries (see `weaponTables.ts`): a weapon's
 *  tiers, a ship stat ladder per hull, a C / V ability ladder, or none (a
 *  one-off card changes one mount count, which its description says). */
export type HowToTableKind = 'tier' | 'shipUpgrade' | 'ability' | 'none';

/** One described card line: its name, a plain-words description, and the
 *  catalog line its derived table is built from. */
export interface HowToEntry {
  /** The card name, uppercase (the catalog line's `boonName`). */
  name: string;
  /** The catalog line id the table folds. */
  lineId: string;
  /** One or two sentences. No numbers: the table carries them. */
  description: string;
  table: HowToTableKind;
}

/** One section of the page: a heading, some prose, and optionally a key table,
 *  described entries and closing prose — rendered in that order. */
export interface HowToSection {
  /** Uppercase mono system line. */
  heading: string;
  /** Body prose, in sentences. */
  paragraphs?: readonly string[];
  /** Rendered as keycap rows beneath the prose. */
  keys?: readonly KeyBinding[];
  /** Described entries, each with its derived stat table. */
  entries?: readonly HowToEntry[];
  /** Prose after the entries. */
  tail?: readonly string[];
}

export const HOWTO_TITLE = 'HOW TO PLAY';

export const HOWTO_SECTIONS: readonly HowToSection[] = [
  {
    heading: '[ HOW TO PLAY ]',
    paragraphs: [
      'Many ships, one ocean, one winner. Last hull floating wins.',
      'A nasty storm is closing in. Stay inside the ring or it will drown you.',
      'If you run out of HP, you sink. You have 5 seconds to try and snag a revenge kill before you go down with the ship.',
      'You slowly regenerate HP as long as you haven\'t taken damage in the last 15 seconds.',
      // Story 11.11: only the secondaries hurt a mine now (CONFIG.secondaries).
      'Shoot a spotted mine with your secondaries to destroy it.',
      // Story 11.11: gunfire clears the lowest ground; special shells arc over everything (epic-11 amendment 8).
      'Islands block sight, radar, and ships. Gunfire clears low ground but not high ground, and special shells arc over everything.',
      'Your shells never hurt your own ship.',
    ],
  },
  {
    heading: '[ CONTROLS ]',
    keys: [
      { keys: ['W', 'S'], action: 'Throttle Up/Down. Tap to go to the next step, engine will accelerate/decelerate.' },
      { keys: ['A', 'D'], action: 'Rudder Left/Right. Hold to turn.' },
      { keys: ['LEFT CLICK'], action: 'Fire your Main Battery (or your currently selected weapon).' },
      { keys: ['RIGHT CLICK'], action: 'Hold to fire your Secondaries.' },
      { keys: ['Q', 'E', 'R'], action: 'Select one of your equipped weapons, then click to fire. Press again to cancel.' },
      { keys: ['SHIFT'], action: 'Use your Special.' },
      { keys: ['C'], action: 'Hull Repair.' },
      { keys: ['V'], action: 'Smoke Screen.' },
      { keys: ['TAB', '1', '2', '3', '4'], action: 'Hold Tab and press a number to take that upgrade card. Clicking a card works too.' },
      { keys: ['MOUSE WHEEL', 'X', 'Z'], action: 'Zoom the camera in/out.' },
      { keys: ['MIDDLE DRAG', '↑', '↓', '←', '→'], action: 'Pan the camera.' },
      { keys: ['SPACE'], action: 'Bring the camera back to your ship.' },
      { keys: ['F'], action: 'Sound your horn.' },
      { keys: ['M'], action: 'Mute.' },
      { keys: ['ESC'], action: 'Settings.' },
    ],
  },
  {
    heading: '[ YOUR SHIP ]',
    paragraphs: [
      'Pick your battleship and your Special before you queue: open YOUR SHIP on the home screen.',
      'There are four battleships: YAMATO, BISMARCK, HMS WARSPITE, and USS IOWA. Every one has 1000 HP. They differ in their five stats, in how their main guns are laid out, and in how far those guns reach.',
      'Your Special goes on SHIFT. SPEED BOOST makes you faster for a few seconds. INSTANT RELOAD finishes every reload on the ship at once and cools your secondaries. HUNKER gives you a big burst of temporary armor.',
      'Every ship has five stats, each around 100. ARMOR cuts the damage you take, and makes you heavier when ramming. POWER cuts through the other ship\'s ARMOR. RELOAD shortens your gun and weapon reloads. ENGINES is your top speed. INTEL is how fast your radar spins.',
      'Ramming and running aground both hurt. The faster you hit, the more it costs.',
    ],
  },
  {
    heading: '[ GUNS ]',
    paragraphs: [
      'Left click fires one Main Battery turret at the cursor: the first loaded turret that can turn to face it. Each turret reloads on its own.',
      'Shells scatter a little around where you aim, and the oval around your cursor shows how much. A shell only hurts the ship it lands on.',
      'Hold right click to fire your Secondaries in any direction. They reach about half as far as your main guns, and slow down as they heat up.',
      'Wherever your own shells land, a mark stays on the water for a few seconds: amber for a hit, grey-green for a miss.',
    ],
  },
  {
    heading: '[ UPGRADES ]',
    paragraphs: [
      // CONFIG.xp.levelMs 60000; killLevels 1; killerShare 0.1; assistWindowMs 60000; bounty +1.
      'All players automatically gain one level\'s worth of experience every minute.',
      'Sinking any ship is worth a level. The killer is guaranteed some of it; the rest is split by damage among everyone who hit that ship in the last 60 seconds. The current Kill Leader is worth double.',
      'Every level gives you an upgrade offer of four cards in the corner of the screen: a Ship card, an Equipment card, and two wildcards. Take one by clicking it or with Tab and its number. You can bank levels and spend them whenever you like, even in a fight. Hover a card to see what it would change.',
      'Everyone starts with one free level during the countdown, and may redraw that first offer once.',
      'Ship cards raise one of your five stats, or improve Hull Repair or Smoke Screen. Equipment cards give you a new weapon, raise a weapon\'s tier (up to Tier V), or add a one-off extra.',
      'Every level also rolls a die for each stat, adding 0, 1, 2 or 3 points. Stats that grow flash amber.',
    ],
  },
  {
    heading: '[ WEAPONS ]',
    paragraphs: [
      'You have three weapon slots: torpedoes on Q, mines on E, and special shells on R. The first card of a kind fills its slot for the rest of the match, and more copies raise its tier. Every tier reloads faster and hits harder.',
    ],
    entries: [
      { name: 'LIGHT TORPEDO', lineId: 'lightTorpedo', table: 'tier', description: 'Fires from a launcher that can face the cursor. Homes in on the loudest ship nearby.' },
      { name: 'HEAVY TORPEDO', lineId: 'heavyTorpedo', table: 'tier', description: 'Slower to reload and harder hitting than the light. Homes in on the loudest ship nearby.' },
      { name: 'SUPERCAV TORPEDO', lineId: 'supercavTorpedo', table: 'tier', description: 'Very fast, no homing.' },
      { name: 'NAVAL MINES', lineId: 'navalMines', table: 'tier', description: 'Click to drop a mine off your stern. Explodes when an enemy sails over it, and sets off every other Naval Mine in its blast.' },
      { name: 'CAPTIVE MINES', lineId: 'captiveMines', table: 'tier', description: 'Drops like a Naval Mine. Instead of exploding, it fires a torpedo at the first enemy to come in range.' },
      { name: 'FOULING MINES', lineId: 'foulingMines', table: 'tier', description: 'Drops like a Naval Mine. Hurts less, but slows any enemy caught in the blast.' },
      { name: 'STAR SHELLS', lineId: 'starShells', table: 'tier', description: 'Fires a flare to where you click. Grants you vision on anything in the circle, and damages every ship under it when it bursts. You can always fire your Main Battery anywhere into the region lit up by your Star Shells no matter where it is on the map.' },
      { name: 'PHOSPHOR SHELLS', lineId: 'phosphorShells', table: 'tier', description: 'Explodes into a patch of burning water. Damages on burst, then keeps burning anyone who sits in it.' },
      { name: 'FOULING SHELL', lineId: 'foulingShell', table: 'tier', description: 'Leaves a patch of fouled water where it lands. Any enemy inside is slowed, and stays slow for a moment after leaving.' },
      { name: 'FLASH SHELLS', lineId: 'dazzleShells', table: 'tier', description: 'Every enemy caught in the flash is blinded for a while. Radar unaffected. No damage.' },
      { name: 'AFT LAUNCHER', lineId: 'aftTorpedoLauncher', table: 'none', description: 'Adds a torpedo launcher at your stern.' },
      { name: 'SECOND MINE RACK', lineId: 'secondMineRack', table: 'none', description: 'A second mine rack with its own mines and reload. Your racks take turns.' },
      { name: 'RACK CAPACITY', lineId: 'expandedMineRacks', table: 'none', description: 'Every mine rack holds one more mine.' },
    ],
  },
  {
    heading: '[ REPAIR AND SMOKE ]',
    paragraphs: [
      'Every ship carries Hull Repair on C and Smoke Screen on V from the start. Each has its own cooldown, which your RELOAD stat does not change; their own Ship cards do. Neither works while you are sinking.',
    ],
    entries: [
      { name: 'HULL REPAIR', lineId: 'hullRepair', table: 'ability', description: 'Heals some HP instantly and the rest over a few seconds. Using another one restarts the timer instead of adding to it.' },
      { name: 'SMOKE SCREEN', lineId: 'smokeScreen', table: 'ability', description: 'Puts a growing cloud of smoke around you. Smoke blocks sight, not radar. Anyone inside smoke, including you, is nearly blind. But they also can\'t see you.' },
    ],
  },
  {
    heading: '[ SHIP UPGRADES ]',
    entries: [
      { name: 'ARMOR', lineId: 'armor', table: 'shipUpgrade', description: 'Take less damage, and hit harder when ramming.' },
      { name: 'POWER', lineId: 'power', table: 'shipUpgrade', description: 'Every hit you land cuts through more of the target\'s ARMOR.' },
      { name: 'ENGINES', lineId: 'engines', table: 'shipUpgrade', description: 'Higher top speed.' },
      { name: 'INTEL', lineId: 'intel', table: 'shipUpgrade', description: 'Radar spins faster.' },
      { name: 'RELOAD', lineId: 'reload', table: 'shipUpgrade', description: 'Your main guns and Q / E / R weapons reload faster.' },
    ],
  },
  {
    // DRAFT (Story 12.4, 2026-11-19): factual placeholder; Eric rewrites the copy.
    heading: '[ SUPPLY DROPS AND AIRDROPS ]',
    paragraphs: [
      'Supply drops are marked on everyone\'s map at the start of each ring. A minute later ten crates land around each mark.',
      'Airdrop crates are scattered across the ocean every minute, fewer as the match goes on. Sail over one for a tenth of a level of experience. The storm destroys any crate it closes over.',
      'A ship sunk in battle leaves a wreck worth one random stat point for each level its captain had. A ship sunk at level 0 leaves no wreck.',
    ],
  },
  {
    heading: '[ SIGHT AND RADAR ]',
    paragraphs: [
      // CONFIG reach table: sight 200 hm, hull fade to 350 hm, radar 400 hm (Story 11.2).
      'Distances are in hectometers (hm). You can see ships clearly out to 200 hm, and they fade out by 350 hm. Your radar reaches 400 hm and paints ships and their wakes, but never tells you who they are.',
      'The battle sits in the eye of a storm. Rain blocks part of your sight and fills your radar with clutter, and the edge of the ring is the wettest.',
      'Torpedoes and mines are hard to spot. You only see them up close.',
      'Zoom all the way out to see the whole ocean. Small ships get corner brackets so you can still find them.',
    ],
  },
];

/** The closing line and the privacy link, built by `pageMarkup.ts`. */
export const HOWTO_FOOTER_LEAD = 'What this site stores, and what it sends, is set out in the ';
export const HOWTO_FOOTER_LINK = 'privacy policy';
export const HOWTO_FOOTER_TAIL = '.';
