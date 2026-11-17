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
import { CONFIG, SHIP_CLASS_IDS } from '@salvo/shared';
import { parseArgs, UsageError } from '../args.js';
import { runMatch } from '../runner.js';
import { applyOverrides } from '../overrides.js';

/** Any of the four hulls (Story 10.4) — the last, so the pins never lean on
 *  the default hull. */
const HULL = SHIP_CLASS_IDS[SHIP_CLASS_IDS.length - 1];

describe('args — --bot-spend / --bot-hull', () => {
  it('parses both; defaults are profile/null', () => {
    const d = parseArgs([]);
    expect(d.botSpend).toBe('profile');
    expect(d.botHull).toBeNull();
    const o = parseArgs(['--bots', '3', '--bot-spend', 'random', '--bot-hull', HULL]);
    expect(o.botSpend).toBe('random');
    expect(o.botHull).toBe(HULL);
  });

  it('refuses the incoherent combinations', () => {
    expect(() => parseArgs(['--bot-spend', 'random'])).toThrow(/needs --bots/);
    expect(() => parseArgs(['--bot-hull', HULL])).toThrow(/needs --bots/);
    expect(() => parseArgs(['--bots', '2', '--bot-spend', 'sometimes'])).toThrow(UsageError);
    // The retired gun-first mode (`--bot-spend gun`, Story 10.4) is refused like any unknown mode.
    expect(() => parseArgs(['--bots', '2', '--bot-spend', 'gun'])).toThrow(UsageError);
    // A retired class id is no hull (Story 10.4: the four battleships).
    expect(() => parseArgs(['--bots', '2', '--bot-hull', 'mineLayer'])).toThrow(/unknown class/);
    expect(() => parseArgs(['--bots', '2', '--bot-hull', 'submarine'])).toThrow(/unknown class/);
    expect(() => parseArgs(['--bots', '2', '--bot-hull', HULL, '--bot-profile', 'random'])).toThrow(
      /conflicts with --bot-profile/,
    );
    expect(() => parseArgs(['--bots', '2', '--bot-hull', HULL, '--roster', 'even'])).toThrow(
      /conflicts with --roster even/,
    );
  });
});

describe('runner — the tuned-profile measurement lobby', () => {
  it('--bot-hull forces the class; profiles are IN-GAME rows (any personality, Story 8.20)', () => {
    const restore = applyOverrides({ 'zone.beatMs': 3000 });
    try {
      const m = runMatch(0, { seed: 909, matches: 1, captains: 0, bots: 4, botHull: HULL, botSpend: 'random' });
      expect(m.bots!.length).toBe(4);
      for (const b of m.bots!) {
        expect(b.cls).toBe(HULL);
        // In-game rows — never a test row (the test id space is only reachable
        // through --bot-profile). Any personality sails any hull (Story 8.20).
        expect(CONFIG.bots.profiles as readonly string[]).toContain(b.profile);
      }
    } finally {
      restore();
    }
  });

  it('random spend reaches chooseSpend: same seed, different picks than weighted', () => {
    // A short passive level (2026-11-04, Story 10.3): at 1000 hp the storm's
    // 10–50 hp/s ladder sinks a compressed-timeline lobby before the default
    // first passive level, and a match with zero picks makes the comparison
    // vacuous — so the level clock is compressed with the zone's.
    const restore = applyOverrides({ 'zone.beatMs': 3000, 'xp.levelMs': 15000 });
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
