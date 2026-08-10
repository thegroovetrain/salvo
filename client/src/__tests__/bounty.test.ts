// THE BOUNTY (ui/bounty.ts, Story 4.6, Eric ruling 2026-08-10) — the pure
// client seam: the transition edge detector and the three copy builders.
//
// Two things this suite exists to hold still. First, the EDGE: the claim
// register and the self toast are one-shot cues driven off a POLLED schema
// scalar, so "fires once, on a real change, for the right person" is the whole
// contract — a detector that fired every frame would spam the feed at 60 Hz.
// Second, the COPY: the grammar Eric settled (`BOUNTY: <NAME>`, ` — BOUNTY
// CLAIMED` / ` — BOUNTY LIFTED`, `YOU ARE THE BOUNTY`), and the segment shape
// that keeps a connective a connective — a trailing suffix carrying an `id`
// would render as a NAME in the pilot's hue.

import { describe, expect, it } from 'vitest';
import {
  BOUNTY_TOAST,
  bountyClaimLine,
  bountyKillSuffix,
  bountyToastLine,
  bountyTransition,
} from '../ui/bounty.js';
import { killLine } from '../ui/killFeed.js';

const ME = 'me';

describe('bountyTransition — the one-shot edge off a polled scalar', () => {
  it('VACANT -> HELD claims for someone else: register, no toast', () => {
    expect(bountyTransition('', 'a', ME)).toEqual({ changed: true, holder: 'a', claimed: true, self: false });
  });

  it('VACANT -> HELD BY ME claims AND fires the self cue', () => {
    expect(bountyTransition('', ME, ME)).toEqual({ changed: true, holder: ME, claimed: true, self: true });
  });

  it('HELD -> A DIFFERENT HOLDER claims again (the throne changed hands)', () => {
    expect(bountyTransition('a', 'b', ME)).toEqual({ changed: true, holder: 'b', claimed: true, self: false });
    expect(bountyTransition('a', ME, ME)).toEqual({ changed: true, holder: ME, claimed: true, self: true });
  });

  it('HELD -> VACANT changes but does NOT claim — the sinking already printed its line', () => {
    expect(bountyTransition('a', '', ME)).toEqual({ changed: true, holder: '', claimed: false, self: false });
  });

  it('NO CHANGE is inert — the common case, on all but a handful of frames', () => {
    expect(bountyTransition('a', 'a', ME)).toEqual({ changed: false, holder: 'a', claimed: false, self: false });
    expect(bountyTransition('', '', ME)).toEqual({ changed: false, holder: '', claimed: false, self: false });
    // ...including when the holder is US: re-announcing every frame would be
    // an unmuteable toast + tone loop.
    expect(bountyTransition(ME, ME, ME)).toEqual({ changed: false, holder: ME, claimed: false, self: false });
  });

  it('a LOSING holder gets no cue of any kind — only the claimant is told', () => {
    // The throne moves from me to someone else: changed + claimed, but `self`
    // is false, so the toast and tone belong to them alone.
    expect(bountyTransition(ME, 'b', ME).self).toBe(false);
  });

  it('an un-synced / non-string scalar reads as VACANT rather than throwing', () => {
    expect(bountyTransition('a', undefined as unknown as string, ME)).toEqual({
      changed: true, holder: '', claimed: false, self: false,
    });
    // A vacant throne with an un-synced OWN session id never self-claims.
    expect(bountyTransition('', '', '').self).toBe(false);
  });
});

describe('bountyClaimLine — the public claim register', () => {
  it('reads `BOUNTY: <NAME>`, with the name carrying its roster id for the hue', () => {
    expect(bountyClaimLine({ name: 'ALPHA', id: 'a' })).toEqual([
      { text: 'BOUNTY: ' },
      { text: 'ALPHA', id: 'a' },
    ]);
  });

  it('leaves the LABEL a connective — no id, so it never renders as a name', () => {
    const [label] = bountyClaimLine({ name: 'ALPHA', id: 'a' });
    expect(label.id).toBeUndefined();
  });

  it('mid-ellipsizes a long callsign exactly as killLine does', () => {
    const long = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const [, name] = bountyClaimLine({ name: long, id: 'a' });
    const [victim] = killLine({ name: long, id: 'a' }, null);
    expect(name.text).toBe(victim.text);
  });

  it('prints whatever name it is handed — the caller owns the roster-miss policy', () => {
    // main.ts substitutes the feed's neutral UNKNOWN VESSEL label; a raw
    // session id never reaches this builder in the first place.
    expect(bountyClaimLine({ name: 'UNKNOWN VESSEL', id: 'x' })[1].text).toBe('UNKNOWN VESSEL');
  });
});

describe('bountyKillSuffix — the two ways a throne comes off the board', () => {
  it('CLAIMED when the sinking names a killer', () => {
    expect(bountyKillSuffix(true)).toEqual({ text: ' — BOUNTY CLAIMED' });
  });

  it('LIFTED when nobody is credited (the storm, or the holder\'s own hand)', () => {
    expect(bountyKillSuffix(false)).toEqual({ text: ' — BOUNTY LIFTED' });
  });

  it('is a CONNECTIVE — no id on either variant', () => {
    expect(bountyKillSuffix(true).id).toBeUndefined();
    expect(bountyKillSuffix(false).id).toBeUndefined();
  });

  it('composes onto the shipped kill lines without touching their grammar', () => {
    const attributed = [...killLine({ name: 'ALPHA', id: 'a' }, { name: 'BRAVO', id: 'b' }), bountyKillSuffix(true)];
    expect(attributed.map((s) => s.text).join('')).toBe('ALPHA SUNK BY BRAVO — BOUNTY CLAIMED');
    const storm = [...killLine({ name: 'ALPHA', id: 'a' }, null), bountyKillSuffix(false)];
    expect(storm.map((s) => s.text).join('')).toBe('ALPHA LOST WITH ALL HANDS — BOUNTY LIFTED');
  });
});

describe('bountyToastLine — the self-claim copy', () => {
  it('is the settled line, stated once', () => {
    expect(bountyToastLine()).toBe('YOU ARE THE BOUNTY');
    expect(bountyToastLine()).toBe(BOUNTY_TOAST);
  });

  it('names no opponent, no count and no place — the bounty is identity only', () => {
    expect(bountyToastLine()).not.toMatch(/\d/);
  });
});
