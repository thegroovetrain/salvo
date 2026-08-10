// THE KILL LEADER (ui/bounty.ts, Story 4.6, Eric rulings 2026-08-10 — the
// same-day rework of the shipped copy grammar) — the pure client seam: the
// transition edge detector and the copy builders.
//
// Two things this suite exists to hold still. First, the EDGE: the claim
// register and the self toast are one-shot cues driven off a POLLED schema
// scalar, so "fires once, on a real change, for the right person" is the whole
// contract — a detector that fired every frame would spam the feed at 60 Hz.
// Second, the GRAMMAR Eric settled in the rework: the skull mark rides the
// leader's NAME in one shared segment (killer or victim alike), the claim
// register reads `☠ <NAME> IS THE NEW KILL LEADER`, and the toast says
// `YOU ARE THE KILL LEADER`. The retired CLAIMED/LIFTED suffix tests went with
// their helper (the cycle-69 precedent: retire, never adapt, when a channel is
// deleted).

import { describe, expect, it } from 'vitest';
import {
  BOUNTY_TOAST,
  KILL_LEADER_MARK,
  bountyClaimLine,
  bountyKillLine,
  bountyToastLine,
  bountyTransition,
  leaderNameSegment,
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

describe('KILL_LEADER_MARK — the one exported glyph', () => {
  it('is U+2620 forced to TEXT presentation (U+FE0E) — one constant, swappable in one edit', () => {
    expect(KILL_LEADER_MARK).toBe('☠︎');
    expect([...KILL_LEADER_MARK]).toHaveLength(2); // skull + variation selector, nothing else
  });
});

describe('leaderNameSegment — the mark and the name share ONE segment', () => {
  it('prefixes the mark inside the NAME segment so it inherits the hue and 600 weight', () => {
    expect(leaderNameSegment({ name: 'ALPHA', id: 'a' })).toEqual({
      text: `${KILL_LEADER_MARK} ALPHA`,
      id: 'a',
      leader: true,
    });
  });

  it('mid-ellipsizes the callsign through the one shared cap, mark untouched', () => {
    const long = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const seg = leaderNameSegment({ name: long, id: 'a' });
    const [victim] = killLine({ name: long, id: 'a' }, null);
    expect(seg.text).toBe(`${KILL_LEADER_MARK} ${victim.text}`);
  });
});

describe('bountyClaimLine — the public claim register', () => {
  it('reads `☠︎ <NAME> IS THE NEW KILL LEADER`, the marked name carrying its roster id', () => {
    expect(bountyClaimLine({ name: 'ALPHA', id: 'a' })).toEqual([
      { text: `${KILL_LEADER_MARK} ALPHA`, id: 'a', leader: true },
      { text: ' IS THE NEW KILL LEADER' },
    ]);
  });

  it('leaves the LABEL a connective — no id, so it never renders as a name', () => {
    const [, label] = bountyClaimLine({ name: 'ALPHA', id: 'a' });
    expect(label.id).toBeUndefined();
    expect(label.leader).toBeUndefined();
  });

  it('prints whatever name it is handed — the caller owns the roster-miss policy', () => {
    // main.ts substitutes the feed's neutral UNKNOWN VESSEL label; a raw
    // session id never reaches this builder in the first place.
    expect(bountyClaimLine({ name: 'UNKNOWN VESSEL', id: 'x' })[0].text).toBe(`${KILL_LEADER_MARK} UNKNOWN VESSEL`);
  });

  it('names no count and no place — the throne is identity only', () => {
    expect(bountyClaimLine({ name: 'ALPHA', id: 'a' }).map((s) => s.text).join('')).not.toMatch(/\d/);
  });
});

describe('bountyKillLine — the skull rides the leader wherever they appear', () => {
  const V = { name: 'ALPHA', id: 'a' };
  const K = { name: 'BRAVO', id: 'b' };

  it("marks the VICTIM when the victim led ('v'): `☠ ALPHA SUNK BY BRAVO`", () => {
    const line = bountyKillLine(V, K, 'v');
    expect(line.map((s) => s.text).join('')).toBe(`${KILL_LEADER_MARK} ALPHA SUNK BY BRAVO`);
    expect(line[0]).toEqual({ text: `${KILL_LEADER_MARK} ALPHA`, id: 'a', leader: true });
    expect(line[2]).toEqual({ text: 'BRAVO', id: 'b' }); // the killer stays unmarked
  });

  it("marks the KILLER when the killer led ('k'): `ALPHA SUNK BY ☠ BRAVO`", () => {
    const line = bountyKillLine(V, K, 'k');
    expect(line.map((s) => s.text).join('')).toBe(`ALPHA SUNK BY ${KILL_LEADER_MARK} BRAVO`);
    expect(line[0]).toEqual({ text: 'ALPHA', id: 'a' }); // the victim stays unmarked
    expect(line[2]).toEqual({ text: `${KILL_LEADER_MARK} BRAVO`, id: 'b', leader: true });
  });

  it("a storm sink of the leader ('v', no killer) marks the victim on the LOST line", () => {
    const line = bountyKillLine(V, null, 'v');
    expect(line.map((s) => s.text).join('')).toBe(`${KILL_LEADER_MARK} ALPHA LOST WITH ALL HANDS`);
  });

  it("a degenerate 'k' with no killer (the server never emits it) falls back to the unmarked line", () => {
    expect(bountyKillLine(V, null, 'k')).toEqual(killLine(V, null));
  });

  it('never touches the grammar of the underlying kill line — only the leader segment is swapped', () => {
    const marked = bountyKillLine(V, K, 'v');
    const plain = killLine(V, K);
    expect(marked).toHaveLength(plain.length);
    expect(marked[1]).toEqual(plain[1]); // ' SUNK BY ' connective, byte-identical
  });
});

describe('bountyToastLine — the self-claim copy', () => {
  it('is the settled line, stated once', () => {
    expect(bountyToastLine()).toBe('YOU ARE THE KILL LEADER');
    expect(bountyToastLine()).toBe(BOUNTY_TOAST);
  });

  it('names no opponent, no count and no place — the throne is identity only', () => {
    expect(bountyToastLine()).not.toMatch(/\d/);
  });
});
