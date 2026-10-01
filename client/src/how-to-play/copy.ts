// THE HOW-TO-PLAY COPY (Story 7.3).
//
// DRAFT COPY, AWAITING ERIC'S PASS. Eric holds the pen on this page — he said
// so when the story opened — and epic-6 amendment 41 is standing project law:
// *a ruling to put information somewhere is NOT a licence to author the copy
// that goes there.* Every sentence below was drafted by the implementer from
// facts verified against the code, in the `policyCopy.ts` R9 mould: draft from
// verified facts, Eric approves, then it FREEZES the way `ui/taglines.ts` is
// frozen. Until that pass lands, treat this file as a proposal.
//
// SCOPE IS ERIC'S, 2026-08-19, and it is NARROWER than the story's AC:
//   *"This page needs to give people the basics on how to steer their ship,
//    select weapons, upgrade, and shoot. They can figure the rest out through
//    play."*
// That SUPERSEDES the AC's coverage list (three sensor tiers, storm rhythm,
// classes and slot grammar, the boon economy) and UX-DR29's boon glossary —
// *"No need for a boon glossary"*, *"NO FUCKING GLOSSARY. One page."* The
// glossary clause of UX-DR29 and FR39 is struck, not deferred. What survives
// from FR39 is the WIN CONDITION, which is stated here because it is stated
// nowhere else a new player can read (epic-5 amendment 46(c)), and Eric ruled
// on 2026-08-14 that the copy moves to this page.
//
// REGISTER: terse naval, and SENTENCES ARE SANCTIONED HERE. `EXPERIENCE.md:53`
// names How-to-Play as one of only two surfaces where prose is allowed rather
// than uppercase mono — headings stay uppercase mono because they are still
// system lines. This is the opposite of the privacy page, which deliberately
// drops the naval voice; here the voice is the point.
//
// EVERY FACT BELOW IS FROM THE CODE, NOT THE DESIGN DOCS. Several docs —
// CLAUDE.md and EXPERIENCE.md among them — are stale on the controls and were
// NOT used: there is no CTRL binding of any kind, the refit window is TAB, the
// picks are 1-4 (5 is unbound — Story 8.8 deleted the DAMAGE CONTROL rail it
// used to spend a level on), and the gun has no key at all.
//
// RE-CUT 2026-10-01 (Story 8.22, FR71 / UX-DR72): the pool draw, the gun pick,
// the class SPECIAL on Shift, the nine squares, consumables, the countdown
// offer and REDRAW, the three class names (epic-8 amendment 204). Every number
// below was read from CONFIG at authoring time and is cited beside its
// sentence; the page imports no game module by design, so the numbers are
// prose — a retune must come back here (deferred-work 2026-09-17 entry, closed
// as restated-with-citation).
//
// The four sections after UPGRADES describe every gun, weapon, consumable and
// ship upgrade (Eric 2026-10-01, amendment 206; DEPTH CHARGE is a stub and is
// not described). Eric 2026-10-01: *"For each weapon, instead of writing out
// its stats in the description, give me a stat table showing its exact
// attributes at each tier."* So each one is an ENTRY: a name, a description
// with NO NUMBERS, and a table `main.ts` derives through `weaponTables.ts`
// from the sim's one stat function — the numbers live in exactly one place.

import type { KeyBinding } from '../ui/page.js';

/** Which derived table an entry carries (see `weaponTables.ts`). */
export type HowToTableKind = 'tier' | 'consumable' | 'shipUpgrade';

/** One described weapon, consumable or ship upgrade: its name, a plain-words
 *  description, and the catalog line its derived table is built from. */
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
      'Shoot a spotted mine with your deck gun to damage/destroy it.',
      'Islands block sight, radar, ships, and incoming ordinance.'
    ],
  },
  {
    heading: '[ CONTROLS ]',
    keys: [
      { keys: ['W', 'S'], action: 'Throttle Up/Down. Tap to go to the next step, engine will accelerate/decelerate.' },
      { keys: ['A', 'D'], action: 'Rudder Left/Right. Hold to turn.' },
      { keys: ['LEFT CLICK'], action: 'Fire your Deck Gun (or your currently selected weapon).'},
      { keys: ['Q', 'E', 'R'], action: 'Select or Fire one of your equipped weapons.'},
      { keys: ['SHIFT'], action: 'Use your hull\'s special equipment.'},
      { keys: ['TAB'], action: 'Open/Close the Refit Window.'},
      { keys: ['1', '2', '3', '4'], action: 'Use a consumable item. | Select a card while the Refit Window is open.'},
    ],
  },
  {
    heading: '[ EXPERIENCE ]',
    paragraphs: [
      // CONFIG.xp.levelMs 60000 — a level a minute; CONFIG.xp.killLevels 1
      'All players automatically gain one level\'s worth of experience every minute.',
      // CONFIG.xp.killLevels 1 / assistWindowMs 60000 / killerShare 0.1
      'Killing any ship is worth XP. Players are worth more, drones are worth less. The current Kill Leader is worth double. The killer is guaranteed some fraction of the XP value of kill, the rest is split proportionally to everyone who damaged that ship within the last 60 seconds.',
      'Whenever you get enough XP to gain a level, you get an upgrade point with it to spend at your leisure.'
    ],
  },
  {
    heading: '[ UPGRADES ]',
    paragraphs: [
      'When you have Upgrade Points to spend, open the Refit Window and choose one of the available Weapons, Ship/Weapon Upgrades, or Consumables.',
      'All players begin with one free upgrade point, with which you are guranteed to see at least one equippable item (either a Weapon or a Consumable). You may reroll the free upgrade once before the game starts if desired.'
    ]
  },
  {
    heading: '[ DECK GUNS ]',
    entries: [
      { name: 'CANNON', lineId: 'deckGun', table: 'tier', description: 'Decent damage and fire rate. Small blast radius.' },
      { name: 'MACHINE GUN', lineId: 'machineGun', table: 'tier', description: 'Hold to fire a stream of shells.' },
      { name: 'FLAK', lineId: 'flak', table: 'tier', description: 'Slightly less damage than the Cannon, but faster reload and larger blast radius.' },
    ]
  },
  {
    heading: '[ WEAPONS ]',
    entries: [
      { name: 'HEAVY TORPEDO', lineId: 'heavyTorpedo', table: 'tier', description: 'Fires forward within the bow arc. From Tier II on it homes in on the nearest ship.' },
      { name: 'LIGHT TORPEDO', lineId: 'lightTorpedo', table: 'tier', description: 'Fires out of either side. Slower and lighter than the heavy.' },
      { name: 'BROADSIDE GUN', lineId: 'broadside', table: 'tier', description: 'Click to either side and every turret on that side fires. Shorter range than your Deck Gun, and it can\'t fire forward or backward.' },
      { name: 'STAR SHELLS', lineId: 'starShells', table: 'tier', description: 'Fires a flare to where you click. Grants you vision on anything in the circle, and damages every ship under it when it bursts. You can always fire your Deck Gun anywhere into the region lit up by your Star Shells no matter where it is on the map.' },
      { name: 'PHOSPHOR SHELLS', lineId: 'phosphorShells', table: 'tier', description: 'Explodes into a patch of burning water. Damages on burst, then keeps burning anyone who sits in it.' },
      { name: 'NAVAL MINES', lineId: 'navalMines', table: 'tier', description: 'Click behind your ship to drop a mine. Explodes when an enemy sails over it, and sets off every other Naval Mine in its blast.' },
      { name: 'CAPTIVE MINES', lineId: 'captiveMines', table: 'tier', description: 'Drops like a Naval Mine. Instead of exploding, it fires a torpedo at the first enemy to come in range.' },
      { name: 'FOULING MINES', lineId: 'foulingMines', table: 'tier', description: 'Drops like a Naval Mine. Barely hurts, but slows any enemy caught in the blast.' },
    ],
  },
  {
    heading: '[ CONSUMABLES ]',
    paragraphs: [
      'Consumables go in your 1-4 slots. Each card is one use, and copies of the same consumable stack. No reload, no upgrades.',
    ],
    entries: [
      { name: 'HULL REPAIR', lineId: 'hullRepair', table: 'consumable', description: 'Heals some HP instantly and the rest over a few seconds. Using another one restarts the timer instead of adding to it.' },
      { name: 'SHIELD BLOCK', lineId: 'shieldBlock', table: 'consumable', description: 'Absorbs incoming damage until it is used up or runs out of time.' },
      { name: 'SMOKE SCREEN', lineId: 'smokeScreen', table: 'consumable', description: 'Lays a trail of smoke behind you. Smoke blocks sight, not radar. Anyone inside smoke, including you, is nearly blind. But they also can\'t see you.' },
      { name: 'CHAFF', lineId: 'chaff', table: 'consumable', description: 'Fills the area around you with fake radar contacts.' },
      { name: 'DECOY BUOY', lineId: 'decoyBuoy', table: 'consumable', description: 'Select it, then click behind your ship to drop a buoy. It shows up on radar and homing torpedoes will chase it instead of you.' },
      { name: 'SUPERCAV TORPEDO', lineId: 'supercavTorpedo', table: 'consumable', description: 'Select it, then click near the bow. Very fast, no homing.' },
      { name: 'FLASH SHELLS', lineId: 'dazzleShells', table: 'consumable', description: 'Select it, then click. Every enemy caught in the flash is blinded for a while. Radar unaffected. No damage.' },
    ],
  },
  {
    heading: '[ SHIP UPGRADES ]',
    entries: [
      { name: 'ARMOR', lineId: 'armor', table: 'shipUpgrade', description: 'More max HP, and heals you by the same amount.' },
      { name: 'SPEED', lineId: 'speed', table: 'shipUpgrade', description: 'Higher top speed.' },
      { name: 'TURNING', lineId: 'turning', table: 'shipUpgrade', description: 'Turns faster.' },
      { name: 'RADAR SWEEP', lineId: 'radarSweep', table: 'shipUpgrade', description: 'Radar spins faster.' },
      { name: 'RELOAD', lineId: 'reload', table: 'shipUpgrade', description: 'Every reload and cooldown on the ship gets shorter, except consumables.' },
    ],
  },
];

/** The closing line and the privacy link, built by `main.ts`. */
export const HOWTO_FOOTER_LEAD = 'What this site stores, and what it sends, is set out in the ';
export const HOWTO_FOOTER_LINK = 'privacy policy';
export const HOWTO_FOOTER_TAIL = '.';
