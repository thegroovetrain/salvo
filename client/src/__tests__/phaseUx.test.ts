// Phase → HUD UX mapping (ui/phase.ts). The kill-feed line builder moved to its
// own suite (killFeed.test.ts) when it grew colored segments (Story 1.12).

import { describe, it, expect } from 'vitest';
import { heldAtStartLine, matchUx, secondsUntil, spectateBannerText } from '../ui/phase.js';

describe('matchUx — phase to HUD strings', () => {
  it('waiting: CAPTAINS BOARDING — n ABOARD + ALL STATIONS LOCKED, no countdown', () => {
    expect(matchUx('waiting', 1, 0, 0)).toEqual({
      topLine: 'CAPTAINS BOARDING — 1 ABOARD',
      tag: 'ALL STATIONS LOCKED',
      countdown: '',
    });
    expect(matchUx('waiting', 4, 0, 0).topLine).toBe('CAPTAINS BOARDING — 4 ABOARD');
  });

  it('waiting carries NO denominator: expectedCaptains is the queue\'s number and never reaches the client', () => {
    // Story 6.1, amendment 8. The retired `AWAITING CAPTAINS n/2` copy promised
    // a target the arena no longer holds — the roster is already formed when
    // boarding starts, and the only honest figure is how many are aboard.
    expect(matchUx('waiting', 7, 0, 0).topLine).not.toContain('/');
  });

  it('gathering: GATHERING CAPTAINS — n ABOARD + WEAPONS SAFE + big window seconds (draft copy)', () => {
    const ux = matchUx('gathering', 3, 30000, 4200);
    expect(ux.topLine).toBe('GATHERING CAPTAINS — 3 ABOARD');
    expect(ux.tag).toBe('WEAPONS SAFE');
    expect(ux.countdown).toBe('26'); // ceil((30000-4200)/1000) — the JOIN WINDOW deadline
  });

  it('gathering seconds never go negative', () => {
    expect(matchUx('gathering', 2, 1000, 5000).countdown).toBe('0');
  });

  it('countdown: big center seconds derived from countdownEndT and serverNow', () => {
    const ux = matchUx('countdown', 2, 15000, 3200);
    expect(ux.topLine).toBe('MATCH STARTING');
    expect(ux.countdown).toBe('12'); // ceil((15000-3200)/1000)
  });

  it('the tag never softens across the boarding → countdown beat (both are held)', () => {
    // A tag that read LOCKED at boarding and WEAPONS SAFE at 0:10 would say the
    // helm came back at exactly the moment it did not (amendment 8).
    expect(matchUx('countdown', 2, 15000, 3200).tag).toBe(matchUx('waiting', 2, 0, 0).tag);
    expect(matchUx('countdown', 2, 15000, 3200).tag).toBe('ALL STATIONS LOCKED');
  });

  it('countdown never goes negative', () => {
    expect(matchUx('countdown', 2, 1000, 5000).countdown).toBe('0');
  });

  it('active and finished show nothing (normal HUD / results overlay own the screen)', () => {
    for (const phase of ['active', 'finished', 'anything-else']) {
      expect(matchUx(phase, 3, 0, 0)).toEqual({ topLine: '', tag: '', countdown: '' });
    }
  });
});

describe('heldAtStartLine — the pre-live lock (Story 6.1, amendment 8)', () => {
  it('holds from drop until active: boarding AND the 0:10 countdown', () => {
    expect(heldAtStartLine('waiting')).toBe(true);
    expect(heldAtStartLine('countdown')).toBe(true);
  });

  it('releases at active and stays released for the results phase', () => {
    expect(heldAtStartLine('active')).toBe(false);
    expect(heldAtStartLine('finished')).toBe(false);
  });

  it('does NOT hold the dev/sandbox ready room (gathering keeps sailing)', () => {
    // Amendment 2 retired `gathering` from production (joinWindow: 0) and
    // amendment 8 left the sailable weapons-safe room standing there alone.
    expect(heldAtStartLine('gathering')).toBe(false);
  });

  it('an unknown phase string never invents a hold', () => {
    expect(heldAtStartLine('')).toBe(false);
    expect(heldAtStartLine('anything-else')).toBe(false);
  });
});

describe('spectateBannerText — FINDING 4', () => {
  it('reads as a plain sinking while dead-in-active (phase not yet finished)', () => {
    expect(spectateBannerText('active', '', 'me')).toBe('SUNK — SPECTATING');
    expect(spectateBannerText('waiting', 'me', 'me')).toBe('SUNK — SPECTATING'); // pre-finish winnerId is meaningless
  });

  it('shows VICTORY once finished if you are the winner', () => {
    expect(spectateBannerText('finished', 'me', 'me')).toBe('VICTORY — AWAITING RESULTS');
  });

  it('shows MATCH OVER once finished if someone else won', () => {
    expect(spectateBannerText('finished', 'someone-else', 'me')).toBe('MATCH OVER — SPECTATING');
  });

  it('shows MATCH OVER once finished with no determined winner (empty winnerId)', () => {
    expect(spectateBannerText('finished', '', 'me')).toBe('MATCH OVER — SPECTATING');
  });
});

describe('secondsUntil', () => {
  it('ceils partial seconds and clamps at zero', () => {
    expect(secondsUntil(15000, 0)).toBe(15);
    expect(secondsUntil(15001, 0)).toBe(16);
    expect(secondsUntil(0, 1)).toBe(0);
  });
});

