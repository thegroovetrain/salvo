// Phase → HUD UX mapping (ui/phase.ts) + the kill-feed line builder.

import { describe, it, expect } from 'vitest';
import { CONFIG } from '@salvo/shared';
import { matchUx, secondsUntil, isWeaponsSafe, spectateBannerText } from '../ui/phase.js';
import { killLine } from '../ui/killFeed.js';

describe('matchUx — phase to HUD strings', () => {
  it('waiting: AWAITING CAPTAINS n/min + WEAPONS SAFE, no countdown', () => {
    expect(matchUx('waiting', 1, 0, 0)).toEqual({
      topLine: `AWAITING CAPTAINS 1/${CONFIG.match.minHumans}`,
      tag: 'WEAPONS SAFE',
      countdown: '',
    });
    expect(matchUx('waiting', 2, 0, 0).topLine).toBe(`AWAITING CAPTAINS 2/${CONFIG.match.minHumans}`);
  });

  it('countdown: big center seconds derived from countdownEndT and serverNow', () => {
    const ux = matchUx('countdown', 2, 15000, 3200);
    expect(ux.topLine).toBe('MATCH STARTING');
    expect(ux.tag).toBe('WEAPONS SAFE');
    expect(ux.countdown).toBe('12'); // ceil((15000-3200)/1000)
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

describe('isWeaponsSafe — the denied-fire predicate\'s phase gate', () => {
  it('is true during the ready-room phases (waiting/countdown)', () => {
    expect(isWeaponsSafe('waiting')).toBe(true);
    expect(isWeaponsSafe('countdown')).toBe(true);
  });

  it('is false once damage is live (active) or the match is over (finished)', () => {
    expect(isWeaponsSafe('active')).toBe(false);
    expect(isWeaponsSafe('finished')).toBe(false);
  });
});

describe('killLine', () => {
  it('names the killer when attributable, otherwise reports a loss', () => {
    expect(killLine('ALPHA', 'BRAVO')).toBe('ALPHA SUNK BY BRAVO');
    expect(killLine('ALPHA', null)).toBe('ALPHA LOST WITH ALL HANDS');
  });
});
