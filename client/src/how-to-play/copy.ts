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
      'Click where you want the shell to land. It bursts there and damages every hull inside the blast.',
      'The gun has a cooldown, so clicking faster does not help. Lead moving targets. Islands stop shells.',
    ],
    keys: [{ keys: ['CLICK'], action: 'Fire at the point you clicked' }],
  },
  {
    heading: 'EQUIPMENT',
    paragraphs: [
      'Your ship carries two pieces of equipment, either weapons or utilities. Press its key to select it, press again to cancel (using the equipment also returns you to the deck gun). Some fire where you click. Others activate the moment you press them. If it has a firing arc, it will be indicated on the screen.',
      'All ships come with one extra equipment slot. You can pick something else up to fill it from the upgrade pool.'
    ],
    keys: [
      { keys: ['Q', 'E'], action: 'Select your class weapons and gear' },
      { keys: ['R'], action: 'Anything you pick up at sea' },
    ],
  },
  {
    heading: 'UPGRADING',
    paragraphs: [
      'You gain a level every minute you stay afloat, and more for sinking other captains. Levels never expire, so there is no rush to spend one.',
      'A kill is shared. Whoever lands the last blow keeps a guaranteed slice, and the rest is split by damage dealt among everyone still working on that hull in the last minute. Soften a target and you are paid for it, even if someone else finishes the job.',
      'The refit offers four cards. Take one and it is fitted for the rest of the match. Spend the level on DAMAGE CONTROL instead to repair your hull.',
      'Every level you earn also patches part of your missing hull on its own, free of charge. It is a slow trickle, not a rescue — DAMAGE CONTROL is still what answers a real emergency.',
      'You cannot fire while the refit is open. You can still steer.',
    ],
    keys: [
      { keys: ['TAB'], action: 'Open and close the refit' },
      { keys: ['1', '2', '3', '4'], action: 'Take that card' },
      { keys: ['5'], action: 'Damage control — repair your hull' },
    ],
  },
];

/** The closing line and the privacy link, built by `main.ts`. */
export const HOWTO_FOOTER_LEAD = 'What this site stores, and what it sends, is set out in the ';
export const HOWTO_FOOTER_LINK = 'privacy policy';
export const HOWTO_FOOTER_TAIL = '.';
