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
// The four sections after UPGRADING describe every gun, weapon, consumable and ship upgrade (Eric 2026-10-01, amendment 206: 'I also want descriptions of every weapon … Write it like a human'); DEPTH CHARGE is a stub and is not described.

import type { KeyBinding } from '../ui/page.js';

/** One section of the page: a heading, some prose, and optionally a key table. */
export interface HowToSection {
  /** Uppercase mono system line. */
  heading: string;
  /** Body prose, in sentences. */
  paragraphs?: readonly string[];
  /** Rendered as keycap rows beneath the prose. */
  keys?: readonly KeyBinding[];
}

export const HOWTO_TITLE = 'HOW TO PLAY';

export const HOWTO_SECTIONS: readonly HowToSection[] = [
  {
    heading: 'THE OBJECTIVE',
    paragraphs: [
      'Many ships, one ocean, one winner. Last hull floating wins.',
      'A storm closes in as the match runs and takes the ocean with it. Stay inside the ring or it will drown you.',
    ],
  },
  {
    heading: 'STEERING',
    paragraphs: [
      'Your engine is a telegraph. Tap to move it one notch at a time, from full astern to full ahead. The ship takes a few seconds to answer.',
      'Hold the rudder to turn. You need speed to steer: a stopped ship barely turns at all.',
    ],
    keys: [
      { keys: ['W', 'S'], action: 'Engine telegraph — tap to raise or lower speed' },
      { keys: ['A', 'D'], action: 'Rudder — hold to turn' },
    ],
  },
  {
    heading: 'SHOOTING',
    paragraphs: [
      'Your ship mounts one gun, and you pick it before you sail: CANNON, MACHINE GUN or FLAK. Every gun fires all the way around the ship. Islands stop shells.',
      'CANNON: click where you want the shell to land. It bursts there and damages every hull inside the blast. It has a cooldown, so clicking faster does not help. Lead moving targets.',
      'MACHINE GUN: hold the button to stream shells at your cursor until the magazine runs dry, then wait out the reload. Let go with shells left and the reload starts early; fire again to cancel it.',
      'FLAK: click and the shell bursts in the air at that point. A wider, lighter burst than the cannon.',
    ],
    keys: [{ keys: ['CLICK'], action: 'Fire the selected weapon at your cursor (hold for the machine gun)' }],
  },
  {
    heading: 'EQUIPMENT',
    paragraphs: [
      'Three hulls. The SPEEDBOAT is long, thin and fast. The DREADNOUGHT is big and takes a beating. The REPEATER sits between them. Each hull has one SPECIAL on Shift, with its own cooldown.',
      // CONFIG.boost.factor 0.25 / durationMs 10000 / reloadMs 25000;
      // CONFIG.instantReload.reloadMs 45000;
      // CONFIG.damageCut.factor 0.5 / durationMs 8000 / reloadMs 30000
      'SPEED BOOST on the Speedboat: a quarter more top speed for ten seconds. INSTANT RELOAD on the Repeater: your gun and every weapon you have fitted finish reloading at once. DAMAGE CUT on the Dreadnought: hits on your hull do half damage for eight seconds.',
      'The bar at the bottom of the screen holds nine squares: your gun, your SPECIAL, three weapon slots and four belt slots. You sail out with the gun and the SPECIAL. Everything else you draw at sea.',
      'Press a weapon\'s key to select it, press again to go back to the gun. Firing it also returns you to the gun. If a weapon has a firing arc, it is drawn on the water.',
    ],
    keys: [
      { keys: ['SHIFT'], action: 'Your class SPECIAL' },
      { keys: ['Q', 'E', 'R'], action: 'Weapon slots — select, or press again to cancel' },
      { keys: ['1', '2', '3', '4'], action: 'Belt slots — fire a consumable' },
    ],
  },
  {
    heading: 'UPGRADING',
    paragraphs: [
      // CONFIG.xp.levelMs 60000 — a level a minute; CONFIG.xp.killLevels 1
      'You gain a level every minute you stay afloat, and more for sinking other captains. Levels never expire, so there is no rush to spend one.',
      // CONFIG.xp.killLevels 1 / assistWindowMs 60000 / killerShare 0.1
      'A kill is shared. Whoever lands the last blow keeps a guaranteed slice, and the rest is split by damage dealt among everyone who wore the target down, the finisher included. Keep landing hits at least once a minute and your whole contribution stays counted; go silent for a minute and your claim on that hull lapses.',
      // CONFIG.offer.size 4; shared/src/sim/draw.ts eligibility — weapon copy 1
      // only while a weapon slot is empty; gun ladders only while that gun is mounted
      'The refit offers four cards drawn from one pool every captain shares. While a weapon slot is empty you can be dealt anything, and the opening offer always holds a card you can use. Once all three weapon slots are full, the pool deals you upgrades and consumables only. Take one and it is fitted for the rest of the match.',
      // server/src/game/world.ts mulligan — countdown only, once, human captains
      'The first refit opens on its own during the countdown. If you do not like it, press REDRAW for a fresh set. You get one redraw per match, and only before the match starts.',
      // CONSUMABLE_IS_WEAPON (shared/src/sim/loadout.ts) — the prime-then-click set
      'Consumables stock on your belt and stack; each use spends one. HULL REPAIR, SHIELD BLOCK, SMOKE SCREEN and CHAFF fire the moment you press their key. DECOY BUOY, SUPERCAV TORPEDO and FLASH SHELLS select on the key and fire where you click, like a weapon.',
      // CONFIG.hullRepair — 50 hp at once + 50 over 5 s
      'HULL REPAIR is a card too: stock it in your belt and fire it with its number key when you need hull back. Some comes back at once and the rest over a few seconds.',
      // CONFIG.regen.outOfCombatMs 15000 / missingPctPerS 0.01
      'Stay out of the fight and your hull slowly mends on its own: fifteen seconds after the last hit you took, a little of what is missing comes back every second. Any hit, the storm included, stops it again.',
      'You cannot fire while the refit is open. You can still steer.',
    ],
    keys: [
      { keys: ['TAB'], action: 'Open and close the refit' },
      { keys: ['1', '2', '3', '4'], action: 'Take that card' },
    ],
  },
  {
    heading: 'THE GUNS',
    paragraphs: [
      // shared/src/sim/draw.ts:200-208 — a gun's ladder is offered only while that gun is mounted; every gun 360°, reach = radar rung
      'You pick one gun before you sail, and it is yours for the whole match. Every gun reaches as far as your radar and fires in any direction. Each gun has its own upgrade cards, and you will only be offered the ones for the gun you carry.',
      // CONFIG.gun (cannon): 15 dmg, 15 u burst, 5 s; ladder 15/16/17/18/20, second turret at III, second barrel at V (catalog.ts:420-449)
      'CANNON: One shell to where you click. It bursts on arrival and hurts everything in the burst. Upgrades make it hit harder, then add a second turret so you get two shots before you reload, then a second barrel on each turret.',
      // CONFIG.machineGun: 16 shells, 4 dmg, 0.35 s, 10 s reload; ladder +2 shells / +1 dmg / faster per tier (catalog.ts:499-508)
      'MACHINE GUN: Hold the button and it streams shells until the magazine is empty, then you wait ten seconds for a fresh one. Each shell does a little damage, so keep it on target. Upgrades add shells, damage and speed of fire.',
      // CONFIG.flak: 12 dmg, 50 u blast, 6 s; ladder +2 dmg, turrets at III and V (catalog.ts:509-520). The anti-ordnance side effect is deliberately NOT described (amendment 105).
      'FLAK: One shell that bursts in the air with a wide blast. Less damage than the cannon per hit, but a lot easier to land. Upgrades add damage and extra turrets.',
    ],
  },
  {
    heading: 'WEAPONS',
    paragraphs: [
      // catalog.ts:40-50, 346-360 — copy 1 is the weapon, copies 2-5 are tiers; CONFIG.catalog.reloadStepPerTier 0.05
      'Every weapon below is a card from the pool. The first copy fits it in a weapon slot; each copy after that upgrades it, and every upgrade also shaves a little off its reload.',
      // CONFIG.torpedo (heavy): 50 dmg, 65 u/s, bow ±30°, 1 tube, 30 s; ladder +5 dmg, +2.5 speed, tubes 1,1,2,2,3, homing 0 → 0.5 rad/s from tier II
      'HEAVY TORPEDO: Fires straight out the bow, in a cone thirty degrees either side of it. Slow to reload, but it hits for half a hull and keeps running until it finds something. Upgrades add damage, speed and a second tube, and from the second tier it steers itself toward the nearest ship.',
      // CONFIG.lightTorpedo: 40 dmg, 45 u/s, both beams ±45°, 25 s; same ladder shape
      'LIGHT TORPEDO: Fires from either side of the ship, toward whichever side you click. Lighter and slower than the heavy, but you get to shoot sideways, which is where the enemy usually is. Same upgrades as the heavy.',
      // CONFIG.broadside: 4 turrets × 15 dmg, both beams ±60°, 18 s, reach 5/8 of radar; ladder +0.5 turret, +1 spread rung
      'BROADSIDE GUN: Click to either side and every turret on that side fires at once, each shell bursting where it lands. Shorter range than your main gun and useless straight ahead or astern. Upgrades add turrets and tighten the pattern.',
      // CONFIG.starShells: lit r165 u, 10 s, 10 dmg at burst to every enemy hull in the circle, 20 s; ladder +2.5 s, ×1.1 r, +0.5 flares, 10/12/15/17/20 dmg; the lit zone ignores island LOS
      'STAR SHELLS: A flare over the point you click. For ten seconds you see everything inside the lit circle, islands or not, and only you do. It also hurts every enemy ship under it when it bursts. Upgrades make it wider, longer and meaner, and add a second flare.',
      // CONFIG.phosphorShells: 20 dmg burst, r100 u burning zone 5 hp/s for 8 s, 20 s; ladder 20→30 dmg, 5→10 hp/s, ×1.1 r, 8→10 s; reveals nothing
      'PHOSPHOR SHELLS: A shell that bursts into a patch of burning water. Everyone caught in the burst takes damage, and anyone who stays in the patch keeps burning. It lights nothing and shows you nothing. It is just fire. Upgrades grow the patch and the burn.',
      // CONFIG.mine (naval): astern ±60° to 150 u, arms 3 s, 55 dmg, blast 48 u, 2 held, 15 s; chains into every armed naval mine in the blast, any owner (world.ts:4522-4540)
      'NAVAL MINES: Click behind your ship to drop a mine. It arms in three seconds and goes off when an enemy sails over it, and one going off sets off every other naval mine in its blast, whoever laid them. Upgrades add damage, blast and mines in the rack.',
      // CONFIG.captiveMine: trip ring 144 u, launches one torpedo (55 dmg, 65 u/s) at the tripper, 1 held, 20 s; ladder +5 dmg, held 1,1,2,2,3, homing 0 → 0.3 rad/s
      'CAPTIVE MINES: Drops like a naval mine, but it does not blow up. When an enemy comes within range it fires a torpedo at them and is spent. Upgrades add damage and a second mine in the rack, and the torpedo learns to steer.',
      // CONFIG.foulingMine: 10 dmg, blast 72 u, slow ×0.75 for 5 s, 2 held, 15 s; ladder ×1.1 blast, +1 held, slow to ×0.55
      'FOULING MINES: A mine that barely hurts but fouls the propeller: anyone caught in it crawls at three quarters speed for five seconds. Lay them where the enemy will run. Upgrades widen the blast and slow them harder.',
      // CONFIG.mine.hp 10 / hitRadiusU 10 (amendments 200-202): only a deck-gun shell landing on the marker under your cursor hurts a mine; cannon/flak one shot, MG three at tier I; own mines are the one friendly-fire exception
      'A mine has ten hit points and only a direct hit from a gun hurts it. If you can see one, aim right at it and shoot it. Your own mines too. That is the one time you can hurt your own gear.',
    ],
  },
  {
    heading: 'CONSUMABLES',
    paragraphs: [
      // catalog.ts:352-378 — cap 5, no reload, no tiers; belt = slots 5-8 on keys 1-4
      'Consumables go in the belt, on keys 1 to 4. A card gives you one use, and copies of the same card stack in one slot. They have no cooldown and no upgrades.',
      // CONFIG.hullRepair: 50 at once + 50 over 5 s; a re-press replaces the pool (amendment 141)
      'HULL REPAIR: Press it and you get fifty hull back on the spot, and another fifty over the next five seconds. Press it again and the second half starts over; it does not add up.',
      // CONFIG.shieldBlock: 100 hp for 10 s, every source incl. storm and burn (amendment 118); a second replaces
      'SHIELD BLOCK: Soaks the next hundred damage you would take, for up to ten seconds. The storm and burning count too. A second shield replaces the first.',
      // CONFIG.smokeScreen: 5 s lay, puff every 0.5 s, 30 s life, r82.5 → 165 u; blocks sight not radar; in smoke sight = 1/8 radar range (amendment 149)
      'SMOKE SCREEN: For five seconds your ship trails smoke. Each puff grows and hangs around for half a minute. Smoke hides what is in it and behind it from anyone looking, but radar sees straight through it. Standing in smoke, yours or theirs, you can barely see past your own bow.',
      // CONFIG.chaff: 10 fakes within 120 u for 15 s at the activation point, other players' radar only; owner sees a dashed ring (amendment 191)
      'CHAFF: Bursts a cloud of fake radar contacts around where you set it off, for fifteen seconds. Everyone else\'s radar sees ten of you. You see nothing but a ring where the cloud is.',
      // CONFIG.decoy: 50 hp, astern ±60° to 150 u, no timer; enemy ordnance hits it, own never (amendments 119-122); homing torpedoes lock an enemy decoy
      'DECOY BUOY: Pick it, then click behind your ship to drop a buoy that looks like a ship on radar. It takes hits until it sinks, and homing torpedoes will happily chase it. Enemy shells and torpedoes hurt it. Yours do not.',
      // CONFIG.supercavTorpedo: 195 u/s, 50 dmg, bow ±15°, straight-runner, one per copy (amendment 74)
      'SUPERCAV TORPEDO: Pick it, click in a narrow cone off the bow, and a torpedo leaves at three times the speed of a heavy one. It does not steer. One per card.',
      // CONFIG.dazzle (FLASH SHELLS): one 360° shell, r150 u burst, 10 s dazzle, sight = 1/8 radar range, radar untouched, no damage (amendment 132)
      'FLASH SHELLS: Pick it, click, and the shell bursts into a flash. Every enemy ship inside the flash is blinded for ten seconds: they can barely see past their own bow, though their radar still works. No damage.',
    ],
  },
  {
    heading: 'SHIP UPGRADES',
    paragraphs: [
      // catalog.ts:402-419 — ARMOR +25 hp (heals the grant), SPEED +2.5 u/s, TURNING +0.05 rad/s, RADAR SWEEP +3 rpm to 30, RELOAD −5 % per tier to 0.75; reload never touches consumables
      'Five cards improve the ship itself, and they are always in the pool. ARMOR adds hull and heals you by the same amount. SPEED adds to your top speed. TURNING makes you turn faster. RADAR SWEEP spins your radar faster, down to a sweep every two seconds. RELOAD shortens every cooldown on the ship, except your consumables, which have none.',
    ],
  },
];

/** The closing line and the privacy link, built by `main.ts`. */
export const HOWTO_FOOTER_LEAD = 'What this site stores, and what it sends, is set out in the ';
export const HOWTO_FOOTER_LINK = 'privacy policy';
export const HOWTO_FOOTER_TAIL = '.';
