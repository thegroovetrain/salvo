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
];

/** The closing line and the privacy link, built by `main.ts`. */
export const HOWTO_FOOTER_LEAD = 'What this site stores, and what it sends, is set out in the ';
export const HOWTO_FOOTER_LINK = 'privacy policy';
export const HOWTO_FOOTER_TAIL = '.';
