import { describe, it, expect, beforeEach, vi } from 'vitest';
import { state } from '../state.js';

// Mock render to avoid DOM dependency
vi.mock('../rendering/render.js', () => ({
  render: vi.fn(),
  setBindEvents: vi.fn(),
}));

import { handleTargetClick } from '../handlers/battle.js';

describe('handleTargetClick', () => {
  beforeEach(() => {
    state.isMyTurn = true;
    state.selectedTargets = [];
    state.playerId = 'player1';
    state.game = {
      id: 'g1',
      phase: 'playing',
      players: {
        player1: {
          id: 'player1', name: 'P1', isBot: false, alive: true,
          ships: [], shotCount: 2, color: 'magenta', aiDifficulty: null,
        },
      },
      shots: [],
      turnOrder: ['player1'],
      currentTurnIndex: 0,
      hostId: 'player1',
      teamsEnabled: false,
      teams: {},
      gameType: 'ffa',
      mode: 'private',
      rings: 5,
      islands: [],
      timerConfig: { enabled: false, seconds: 60 },
      islandCount: 6,
    };
  });

  it('selects a target when it is your turn', () => {
    handleTargetClick('1,0');
    expect(state.selectedTargets).toContain('1,0');
  });

  it('deselects an already-selected target', () => {
    state.selectedTargets = ['1,0'];
    handleTargetClick('1,0');
    expect(state.selectedTargets).not.toContain('1,0');
  });

  it('does not exceed max shots', () => {
    state.selectedTargets = ['1,0', '2,0'];
    handleTargetClick('3,0');
    expect(state.selectedTargets).toHaveLength(2);
    expect(state.selectedTargets).not.toContain('3,0');
  });

  it('does nothing when not your turn', () => {
    state.isMyTurn = false;
    handleTargetClick('1,0');
    expect(state.selectedTargets).toHaveLength(0);
  });

  it('does not select already-shot coordinates', () => {
    state.game!.shots = ['1,0'];
    handleTargetClick('1,0');
    expect(state.selectedTargets).not.toContain('1,0');
  });
});
