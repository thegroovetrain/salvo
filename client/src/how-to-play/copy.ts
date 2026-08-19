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
// picks are 1-4 with 5 on DAMAGE CONTROL, and the gun has no key at all.

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

/** The sub-line under the title. */
export const HOWTO_SUBTITLE = 'THE SHORT VERSION. THE REST YOU LEARN AT SEA.';

export const HOWTO_SECTIONS: readonly HowToSection[] = [
  {
    heading: 'THE OBJECTIVE',
    paragraphs: [
      'Twenty hulls, one ocean, one winner. Last hull floating wins.',
      'A storm closes in as the match runs and takes the ocean with it. Stay inside the ring or it will drown you by inches.',
    ],
  },
  {
    heading: 'STEERING',
    paragraphs: [
      'Your engine is a telegraph, not a pedal. Each tap moves it one notch — full astern, through stop, to full ahead — and the ship takes her time answering.',
      'The rudder is held, not tapped. You need way on to steer at all: a ship dead in the water turns nowhere.',
    ],
    keys: [
      { keys: ['W', 'S'], action: 'Engine telegraph — one notch per tap' },
      { keys: ['A', 'D'], action: 'Rudder — hold to hold the turn' },
    ],
  },
  {
    heading: 'SHOOTING',
    paragraphs: [
      'Click the water where you want the shell to land. Your deck gun throws it there and it bursts on arrival, hitting every hull inside the blast.',
      'The gun reloads on a cooldown, so you will not win a brawl by clicking faster. Lead your target, mind the islands — they stop a shell dead — and make the shot count.',
    ],
    keys: [{ keys: ['CLICK'], action: 'Fire at the point you clicked' }],
  },
  {
    heading: 'WEAPONS',
    paragraphs: [
      'Every hull carries the same deck gun. It is always there, it needs no key, and you fall back to it automatically once anything else has fired.',
      'On top of that your class carries two of its own — torpedoes, mines, a heavy cannon, star shells, a speed boost, a decoy. Press its key to bring it up, press the same key again to put it away. Some are weapons you aim and fire; some are gear that works the instant you press it.',
    ],
    keys: [
      { keys: ['Q', 'E'], action: 'Bring up your class weapons and gear' },
      { keys: ['R'], action: 'Anything you pick up at sea' },
    ],
  },
  {
    heading: 'UPGRADING',
    paragraphs: [
      'You earn a level every minute simply for staying afloat, and more for sinking other captains. Levels bank up and never expire — there is no rush to spend one.',
      'Open the refit and you are offered four cards. Take one, and it is bolted to your hull for the rest of the match. Spend on DAMAGE CONTROL instead and you patch the hull you already have.',
      'The refit is a full stop on your guns while it is open. Your helm still answers, so keep her moving — the sea does not wait for you to read.',
    ],
    keys: [
      { keys: ['TAB'], action: 'Open and close the refit' },
      { keys: ['1', '2', '3', '4'], action: 'Take that card' },
      { keys: ['5'], action: 'Damage control — patch the hull' },
    ],
  },
  {
    heading: 'LEARNING THE WATER',
    paragraphs: [
      'SOLO VS AI puts you on the water against nineteen AI captains immediately, with nothing to wait for. It is the fastest way to learn a hull, and the AI will sink you if you let it.',
      'Everything else — what your radar is telling you, how the storm keeps time, when to fight and when to run — you will pick up faster at sea than on this page.',
    ],
  },
];

/** The closing line and the privacy link, built by `main.ts`. */
export const HOWTO_FOOTER_LEAD = 'What this site stores, and what it sends, is set out in the ';
export const HOWTO_FOOTER_LINK = 'privacy policy';
export const HOWTO_FOOTER_TAIL = '.';
