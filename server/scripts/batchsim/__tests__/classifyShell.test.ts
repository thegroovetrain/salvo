// THE LAUNCH LEDGER FILES A CAPTIVE FISH BY ITS HIT RULE, NEVER ITS DAMAGE
// (Story 9.12). Since Eric's 2026-10-16 ladders the heavy torpedo and the
// captive mine carry the identical 90…135 damage, so the old
// `damage === CONFIG.mine.damage` split filed every heavy fish as captive.
// The captive's fish is the game's one CONTACT-BLAST projectile (point-less,
// yet carrying a blast — mines.ts `contactBlastRadius`); that is the tag.

import { describe, it, expect } from 'vitest';
import { CONFIG, type ShellState } from '@salvo/shared';
import { captiveTorpedo } from '../../../src/game/equipment/mines.js';
import { classifyShell } from '../catalogMetrics.js';

function heavyFish(damage: number): ShellState {
  return {
    id: 't1', ownerId: 'a', x: 0, y: 0, vx: 0, vy: 1, distLeft: Number.POSITIVE_INFINITY, bornAt: 0, kind: 'torp',
    family: null, damage, hitRadius: CONFIG.torpedo.hitRadius, targetX: null, targetY: null, burstRadius: 0,
    contactDamage: damage, hits: CONFIG.torpedo.hits,
  };
}

describe('classifyShell — torpedo vs captive torpedo', () => {
  it('a heavy torpedo carrying exactly the captive damage is still a torpedo', () => {
    expect(classifyShell(heavyFish(CONFIG.mine.damage))).toBe('torpedo');
    expect(classifyShell(heavyFish(CONFIG.torpedo.damage))).toBe('torpedo');
  });

  it('the fish a tripped captive mine launches is a captive torpedo, whatever its damage', () => {
    const mine = { id: 'm1', ownerId: 'a', x: 0, y: 0, armedAt: 0, kind: 'captive' as const, hp: CONFIG.mine.hp };
    for (const damage of [CONFIG.torpedo.damage, CONFIG.mine.damage + 7]) {
      const fish = captiveTorpedo('c1', mine, 0, 0, {
        damage, blastRadius: CONFIG.captiveMines.blastRadius, homingTurnRate: 0, targetId: 'v',
      });
      expect(classifyShell(fish)).toBe('captiveTorpedo');
    }
  });
});
