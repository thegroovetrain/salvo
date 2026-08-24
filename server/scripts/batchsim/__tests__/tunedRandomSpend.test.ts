// THE TUNED-PROFILE RANDOM-SPEND MODE (balance campaign, 2026-08-24) — the
// second instance of the randomized-pick measurement design: rolled IN-GAME
// profiles keep their whole temperament (band, targeting, heal thresholds,
// appetite) while the card pick alone goes uniform-random, so card winrates
// stay causally readable under realistic postures. Plus --bot-hull, the
// mono-class arm's door on the rolled-profile path.
//
// THE PINS THAT MATTER: the default path is BYTE-IDENTICAL (a run that never
// asks for the mode cannot be moved by its existence), the override actually
// reaches chooseSpend (same seed, different picks), and a forced hull carries
// in-game rows — never test rows — for exactly that hull.

import { describe, it, expect } from 'vitest';
import { CONFIG } from '@salvo/shared';
import { parseArgs, UsageError } from '../args.js';
import { runMatch } from '../runner.js';
import { applyOverrides } from '../overrides.js';

describe('args — --bot-spend / --bot-hull', () => {
  it('parses both; defaults are profile/null', () => {
    const d = parseArgs([]);
    expect(d.botSpend).toBe('profile');
    expect(d.botHull).toBeNull();
    const o = parseArgs(['--bots', '3', '--bot-spend', 'random', '--bot-hull', 'mineLayer']);
    expect(o.botSpend).toBe('random');
    expect(o.botHull).toBe('mineLayer');
  });

  it('refuses the incoherent combinations', () => {
    expect(() => parseArgs(['--bot-spend', 'random'])).toThrow(/needs --bots/);
    expect(() => parseArgs(['--bot-hull', 'mineLayer'])).toThrow(/needs --bots/);
    expect(() => parseArgs(['--bots', '2', '--bot-spend', 'sometimes'])).toThrow(UsageError);
    expect(() => parseArgs(['--bots', '2', '--bot-hull', 'submarine'])).toThrow(/unknown class/);
    expect(() => parseArgs(['--bots', '2', '--bot-hull', 'mineLayer', '--bot-profile', 'random'])).toThrow(
      /conflicts with --bot-profile/,
    );
    expect(() => parseArgs(['--bots', '2', '--bot-hull', 'mineLayer', '--roster', 'even'])).toThrow(
      /conflicts with --roster even/,
    );
  });
});

describe('runner — the tuned-profile measurement lobby', () => {
  it('--bot-hull forces the class; profiles are that hull’s IN-GAME rows', () => {
    const restore = applyOverrides({ 'zone.beatMs': 3000 });
    try {
      const m = runMatch(0, { seed: 909, matches: 1, captains: 0, bots: 4, botHull: 'mineLayer', botSpend: 'random' });
      expect(m.bots!.length).toBe(4);
      for (const b of m.bots!) {
        expect(b.cls).toBe('mineLayer');
        // In-game rows for the forced hull — never a test row (the test id
        // space is only reachable through --bot-profile).
        expect(CONFIG.bots.profiles.mineLayer as readonly string[]).toContain(b.profile);
      }
    } finally {
      restore();
    }
  });

  it('random spend reaches chooseSpend: same seed, different picks than weighted', () => {
    const restore = applyOverrides({ 'zone.beatMs': 3000 });
    try {
      const weighted = runMatch(0, { seed: 4242, matches: 1, captains: 0, bots: 6 });
      const random = runMatch(0, { seed: 4242, matches: 1, captains: 0, bots: 6, botSpend: 'random' });
      const picksOf = (m: typeof weighted) => m.bots!.flatMap((b) => b.picks.map((p) => p.id));
      // Both lobbies spent SOMETHING (a match with zero picks would make the
      // inequality below vacuous) and the pick streams diverge.
      expect(picksOf(weighted).length).toBeGreaterThan(0);
      expect(picksOf(random).length).toBeGreaterThan(0);
      expect(picksOf(random)).not.toEqual(picksOf(weighted));
    } finally {
      restore();
    }
  });

  it('the default path is byte-identical with the mode merely available', () => {
    const restore = applyOverrides({ 'zone.beatMs': 3000 });
    try {
      const bare = runMatch(0, { seed: 77, matches: 1, captains: 0, bots: 4 });
      const explicit = runMatch(0, { seed: 77, matches: 1, captains: 0, bots: 4, botSpend: 'profile' });
      expect(JSON.stringify(explicit)).toBe(JSON.stringify(bare));
    } finally {
      restore();
    }
  });
});
