import { describe, it, expect } from 'vitest';
import {
  createGame, addPlayer, canStartGame, startGame,
  placeShips, beginPlaying, fireSalvo, advanceTurn,
  checkGameOver, forfeitPlayer, toClientView,
  resetForRematch,
} from '../game.js';
import type { Game, ShipPlacement } from '@salvo/shared';
import { isPlayerAlive, getTeammates, isTeamAlive, toGameMode, toQuickPlayMode } from '@salvo/shared';
import { makeTeamGame, hexPlacements, allCellsForPlayer, setupBattle } from './helpers.js';

// ============================================================
// Team Turn Order
// ============================================================

describe('Team Turn Order', () => {
  it('beginPlaying with teamsEnabled produces alternating team pattern', () => {
    const { game, playerIds } = makeTeamGame(['alpha', 'alpha', 'bravo', 'bravo']);
    setupBattle(game, playerIds);

    expect(game.turnOrder).toHaveLength(4);

    const teamPattern = game.turnOrder.map(id => game.teams.get(id));
    // Alternating: teams alternate (not ABBA anymore)
    expect(teamPattern[0]).toBeDefined();
    expect(teamPattern[1]).toBeDefined();
    expect(teamPattern[0]).not.toBe(teamPattern[1]); // alternates
  });

  it('beginPlaying with teamsEnabled=false uses random order', () => {
    const { game, playerIds } = makeTeamGame(['alpha', 'alpha', 'bravo', 'bravo']);
    game.teamsEnabled = false;
    game.teams.clear();
    setupBattle(game, playerIds);

    expect(game.turnOrder).toHaveLength(4);
    expect(new Set(game.turnOrder)).toEqual(new Set(playerIds));
  });

  it('beginPlaying with teamsEnabled=true but empty teams map falls back to random order', () => {
    const { game, playerIds } = makeTeamGame(['alpha', 'alpha', 'bravo', 'bravo']);
    game.teams.clear();
    setupBattle(game, playerIds);

    expect(game.turnOrder).toHaveLength(4);
    expect(new Set(game.turnOrder)).toEqual(new Set(playerIds));
  });

  it('3-team mode produces alternating ABC pattern', () => {
    const { game, playerIds } = makeTeamGame(
      ['alpha', 'alpha', 'bravo', 'bravo', 'charlie', 'charlie'],
      { rings: 6 },
    );
    setupBattle(game, playerIds);

    expect(game.turnOrder).toHaveLength(6);
    // All 3 teams should appear in the turn order
    const teams = new Set(game.turnOrder.map(id => game.teams.get(id)));
    expect(teams.size).toBe(3);
  });
});

// ============================================================
// Team Win Condition
// ============================================================

describe('Team Win Condition', () => {
  it('1 teammate alive keeps team alive — game continues', () => {
    const { game, playerIds } = makeTeamGame(['alpha', 'alpha', 'bravo', 'bravo']);
    setupBattle(game, playerIds);

    // Kill p3 (bravo, playerIndex=2) via forfeit
    forfeitPlayer(game, 'p3');

    expect(isPlayerAlive(game.players.get('p3')!)).toBe(false);
    expect(isPlayerAlive(game.players.get('p4')!)).toBe(true);

    const result = checkGameOver(game);
    expect(result).toBeNull(); // game continues — p4 keeps bravo alive
  });

  it('both teammates dead eliminates team — other team wins', () => {
    const { game, playerIds } = makeTeamGame(['alpha', 'alpha', 'bravo', 'bravo']);
    setupBattle(game, playerIds);

    forfeitPlayer(game, 'p3');
    forfeitPlayer(game, 'p4');

    const result = checkGameOver(game);
    expect(result).not.toBeNull();
    expect(result!.winnerTeamId).toBe('alpha');
    expect(game.teams.get(result!.winnerId!)).toBe('alpha');
  });

  it('surrendered player team still alive if teammate has ships', () => {
    const { game, playerIds } = makeTeamGame(['alpha', 'alpha', 'bravo', 'bravo']);
    setupBattle(game, playerIds);

    forfeitPlayer(game, 'p3');

    expect(isPlayerAlive(game.players.get('p3')!)).toBe(false);
    expect(isPlayerAlive(game.players.get('p4')!)).toBe(true);

    const result = checkGameOver(game);
    expect(result).toBeNull();
  });

  it('both teams die in same salvo results in draw', () => {
    const { game, playerIds } = makeTeamGame(['alpha', 'alpha', 'bravo', 'bravo']);
    setupBattle(game, playerIds);

    forfeitPlayer(game, 'p1');
    forfeitPlayer(game, 'p2');
    forfeitPlayer(game, 'p3');
    forfeitPlayer(game, 'p4');

    const result = checkGameOver(game);
    expect(result).not.toBeNull();
    expect(result!.winnerId).toBeNull();
    expect(result!.winnerTeamId).toBeNull();
  });

  it('3-team game: last team standing wins', () => {
    const { game, playerIds } = makeTeamGame(
      ['alpha', 'alpha', 'bravo', 'bravo', 'charlie', 'charlie'],
      { rings: 6 },
    );
    setupBattle(game, playerIds);

    // Eliminate alpha and bravo teams
    forfeitPlayer(game, 'p1');
    forfeitPlayer(game, 'p2');
    forfeitPlayer(game, 'p3');
    forfeitPlayer(game, 'p4');

    const result = checkGameOver(game);
    expect(result).not.toBeNull();
    expect(result!.winnerTeamId).toBe('charlie');
  });
});

// ============================================================
// Team Balance Validation
// ============================================================

describe('Team Balance Validation', () => {
  it('canStartGame with balanced teams (2v2) succeeds', () => {
    const { game } = makeTeamGame(['alpha', 'alpha', 'bravo', 'bravo']);
    expect(canStartGame(game, 'p1')).toBeNull();
  });

  it('canStartGame with unbalanced teams (3v1) returns error', () => {
    const { game } = makeTeamGame(['alpha', 'alpha', 'alpha', 'bravo']);
    expect(canStartGame(game, 'p1')).toContain('balanced');
  });

  it('canStartGame with balanced 3-team (2v2v2) succeeds', () => {
    const { game } = makeTeamGame(
      ['alpha', 'alpha', 'bravo', 'bravo', 'charlie', 'charlie'],
      { rings: 6 },
    );
    expect(canStartGame(game, 'p1')).toBeNull();
  });
});

// ============================================================
// Shared Vision (Security)
// ============================================================

describe('Shared Vision (Security)', () => {
  it('toClientView reveals teammate ship cells in 2v2', () => {
    const { game, playerIds } = makeTeamGame(['alpha', 'alpha', 'bravo', 'bravo']);
    setupBattle(game, playerIds);

    const view = toClientView(game, 'p1');
    const p2Ships = view.players['p2'].ships;

    for (const ship of p2Ships) {
      expect(ship.cells.length).toBeGreaterThan(0);
    }
  });

  it('toClientView does NOT reveal opponent ship cells in 2v2', () => {
    const { game, playerIds } = makeTeamGame(['alpha', 'alpha', 'bravo', 'bravo']);
    setupBattle(game, playerIds);

    const view = toClientView(game, 'p1');
    for (const ship of view.players['p3'].ships) {
      expect(ship.cells).toEqual([]);
    }
    for (const ship of view.players['p4'].ships) {
      expect(ship.cells).toEqual([]);
    }
  });

  it('3v3: player sees 2 teammates ship cells', () => {
    const { game, playerIds } = makeTeamGame(
      ['alpha', 'alpha', 'alpha', 'bravo', 'bravo', 'bravo'],
      { rings: 6 },
    );
    setupBattle(game, playerIds);

    const view = toClientView(game, 'p1');
    // p2 and p3 are teammates
    for (const ship of view.players['p2'].ships) {
      expect(ship.cells.length).toBeGreaterThan(0);
    }
    for (const ship of view.players['p3'].ships) {
      expect(ship.cells.length).toBeGreaterThan(0);
    }
    // p4, p5, p6 are opponents
    for (const ship of view.players['p4'].ships) {
      expect(ship.cells).toEqual([]);
    }
  });
});

// ============================================================
// Team Helpers
// ============================================================

describe('Team Helpers', () => {
  describe('getTeammates', () => {
    it('returns teammate IDs for 2v2', () => {
      const { game } = makeTeamGame(['alpha', 'alpha', 'bravo', 'bravo']);
      expect(getTeammates(game, 'p1')).toEqual(['p2']);
      expect(getTeammates(game, 'p3')).toEqual(['p4']);
    });

    it('returns multiple teammates for 3v3', () => {
      const { game } = makeTeamGame(
        ['alpha', 'alpha', 'alpha', 'bravo', 'bravo', 'bravo'],
        { rings: 6 },
      );
      const teammates = getTeammates(game, 'p1');
      expect(teammates).toHaveLength(2);
      expect(teammates).toContain('p2');
      expect(teammates).toContain('p3');
    });

    it('returns empty array when player has no team assignment', () => {
      const { game } = makeTeamGame(['alpha', 'alpha', 'bravo', 'bravo']);
      expect(getTeammates(game, 'unknown')).toEqual([]);
    });

    it('returns empty array for non-team games', () => {
      const { game } = makeTeamGame(['alpha', 'alpha', 'bravo', 'bravo']);
      game.teamsEnabled = false;
      expect(getTeammates(game, 'p1')).toEqual([]);
    });
  });

  describe('isTeamAlive', () => {
    it('returns true when any teammate is alive', () => {
      const { game, playerIds } = makeTeamGame(['alpha', 'alpha', 'bravo', 'bravo']);
      setupBattle(game, playerIds);

      forfeitPlayer(game, 'p1');
      expect(isTeamAlive(game, 'alpha')).toBe(true); // p2 still alive
    });

    it('returns false when both teammates are dead', () => {
      const { game, playerIds } = makeTeamGame(['alpha', 'alpha', 'bravo', 'bravo']);
      setupBattle(game, playerIds);

      forfeitPlayer(game, 'p1');
      forfeitPlayer(game, 'p2');
      expect(isTeamAlive(game, 'alpha')).toBe(false);
    });
  });
});

// ============================================================
// Rematch
// ============================================================

describe('Rematch', () => {
  it('resetForRematch preserves teams and teamsEnabled', () => {
    const { game, playerIds } = makeTeamGame(['alpha', 'alpha', 'bravo', 'bravo']);
    setupBattle(game, playerIds);

    forfeitPlayer(game, 'p3');
    forfeitPlayer(game, 'p4');
    checkGameOver(game);

    resetForRematch(game);

    expect(game.phase).toBe('placement');
    expect(game.teamsEnabled).toBe(true);
    expect(game.teams.size).toBe(4);
    expect(game.teams.get('p1')).toBe('alpha');
    expect(game.teams.get('p3')).toBe('bravo');
  });
});

// ============================================================
// GameOverStats
// ============================================================

describe('GameOverStats', () => {
  it('winnerTeamId is set correctly for team games', () => {
    const { game, playerIds } = makeTeamGame(['alpha', 'alpha', 'bravo', 'bravo']);
    setupBattle(game, playerIds);

    forfeitPlayer(game, 'p3');
    forfeitPlayer(game, 'p4');

    const stats = checkGameOver(game);
    expect(stats).not.toBeNull();
    expect(stats!.winnerTeamId).toBe('alpha');
  });

  it('team aggregate highlights include Team Charlie for 3-team games', () => {
    const { game, playerIds } = makeTeamGame(
      ['alpha', 'alpha', 'bravo', 'bravo', 'charlie', 'charlie'],
      { rings: 6 },
    );
    setupBattle(game, playerIds);

    // Have p1 fire to populate stats
    game.turnOrder = ['p1', 'p3', 'p5', 'p2', 'p4', 'p6'];
    game.currentTurnIndex = 0;
    const p3Cells = allCellsForPlayer(2);
    fireSalvo(game, 'p1', p3Cells.slice(0, 4));

    // Eliminate bravo + charlie
    forfeitPlayer(game, 'p3');
    forfeitPlayer(game, 'p4');
    forfeitPlayer(game, 'p5');
    forfeitPlayer(game, 'p6');

    const stats = checkGameOver(game);
    expect(stats).not.toBeNull();
    expect(stats!.highlights.length).toBeGreaterThan(0);
    // Team Alpha should have aggregate highlights
    expect(stats!.highlights.some(h => h.includes('Team Alpha'))).toBe(true);
  });
});

// ============================================================
// toGameMode / toQuickPlayMode helpers
// ============================================================

describe('toGameMode / toQuickPlayMode helpers', () => {
  it('toGameMode maps all QuickPlayModes correctly', () => {
    expect(toGameMode('1v1')).toBe('quickplay-1v1');
    expect(toGameMode('2v2')).toBe('quickplay-2v2');
    expect(toGameMode('ffa')).toBe('quickplay-ffa');
    expect(toGameMode('3v3')).toBe('quickplay-3v3');
    expect(toGameMode('3ffa')).toBe('quickplay-3ffa');
    expect(toGameMode('6ffa')).toBe('quickplay-6ffa');
    expect(toGameMode('2v2v2')).toBe('quickplay-2v2v2');
  });

  it('toQuickPlayMode maps all GameModes correctly', () => {
    expect(toQuickPlayMode('quickplay-1v1')).toBe('1v1');
    expect(toQuickPlayMode('quickplay-2v2')).toBe('2v2');
    expect(toQuickPlayMode('quickplay-ffa')).toBe('ffa');
    expect(toQuickPlayMode('quickplay-3v3')).toBe('3v3');
    expect(toQuickPlayMode('quickplay-3ffa')).toBe('3ffa');
    expect(toQuickPlayMode('quickplay-6ffa')).toBe('6ffa');
    expect(toQuickPlayMode('quickplay-2v2v2')).toBe('2v2v2');
  });

  it('toQuickPlayMode returns null for private mode', () => {
    expect(toQuickPlayMode('private')).toBeNull();
  });
});
