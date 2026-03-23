import { describe, it, expect } from 'vitest';
import {
  createGame, addPlayer, canStartGame, startGame,
  placeShips, beginPlaying, fireSalvo, advanceTurn,
  checkGameOver, forfeitPlayer, toClientView,
  resetForRematch, getTeammate, isTeamAlive,
} from '../game.js';
import type { Game, ShipPlacement } from '@salvo/shared';
import { isPlayerAlive, toGameMode, toQuickPlayMode } from '@salvo/shared';

// ============================================================
// Helpers
// ============================================================

function placementsForPlayer(playerIndex: number): ShipPlacement[] {
  // Each player gets ships in different rows to avoid shared-ocean overlap
  // Player 0: rows A-D, Player 1: rows E-H, Player 2: rows A-D cols 6-9, Player 3: rows E-H cols 6-9
  const rowBase = (playerIndex % 2) * 4; // 0 or 4
  const colBase = Math.floor(playerIndex / 2) * 5; // 0 or 5
  const rows = 'ABCDEFGHIJ';
  const r0 = rows[rowBase];
  const r1 = rows[rowBase + 1];
  const r2 = rows[rowBase + 2];
  const r3 = rows[rowBase + 3];
  const c = colBase + 1; // 1-based
  return [
    { length: 1, cells: [`${r0}${c}`] },
    { length: 2, cells: [`${r1}${c}`, `${r1}${c + 1}`] },
    { length: 3, cells: [`${r2}${c}`, `${r2}${c + 1}`, `${r2}${c + 2}`] },
    { length: 4, cells: [`${r3}${c}`, `${r3}${c + 1}`, `${r3}${c + 2}`, `${r3}${c + 3}`] },
  ];
}

function makeTeamGame(): { game: Game; playerIds: string[] } {
  const game = createGame('p1', 'Alice', { enabled: false, seconds: 60 }, 'private', true);
  const playerIds = ['p1'];
  for (const [id, name] of [['p2', 'Bob'], ['p3', 'Charlie'], ['p4', 'Diana']] as const) {
    addPlayer(game, id, name);
    playerIds.push(id);
  }
  // Assign teams: p1+p2 = alpha, p3+p4 = bravo
  game.teams.set('p1', 'alpha');
  game.teams.set('p2', 'alpha');
  game.teams.set('p3', 'bravo');
  game.teams.set('p4', 'bravo');
  return { game, playerIds };
}

function setupTeamBattle(game: Game, playerIds: string[]): void {
  startGame(game);
  playerIds.forEach((id, i) => {
    placeShips(game, id, placementsForPlayer(i));
  });
  beginPlaying(game);
}

/** Get all cells for a player's ships (used to sink a player). */
function allCellsForPlayer(playerIndex: number): string[] {
  return placementsForPlayer(playerIndex).flatMap(p => p.cells);
}

// ============================================================
// Team Turn Order
// ============================================================

describe('Team Turn Order', () => {
  it('beginPlaying with teamsEnabled produces ABBA team pattern', () => {
    const { game, playerIds } = makeTeamGame();
    setupTeamBattle(game, playerIds);

    expect(game.turnOrder).toHaveLength(4);

    // Determine which team each turn-order slot belongs to
    const teamPattern = game.turnOrder.map(id => game.teams.get(id));

    // Must be ABBA: first and last same team, middle two same team, first !== second
    expect(teamPattern[0]).toBeDefined();
    expect(teamPattern[1]).toBeDefined();
    expect(teamPattern[0]).not.toBe(teamPattern[1]); // A !== B
    expect(teamPattern[1]).toBe(teamPattern[2]);      // B === B
    expect(teamPattern[0]).toBe(teamPattern[3]);      // A === A
  });

  it('beginPlaying with teamsEnabled=false uses random order (no ABBA constraint)', () => {
    const game = createGame('p1', 'Alice', { enabled: false, seconds: 60 }, 'private', false);
    for (const [id, name] of [['p2', 'Bob'], ['p3', 'Charlie'], ['p4', 'Diana']] as const) {
      addPlayer(game, id, name);
    }
    startGame(game);
    ['p1', 'p2', 'p3', 'p4'].forEach((id, i) => {
      placeShips(game, id, placementsForPlayer(i));
    });
    beginPlaying(game);

    // All 4 players should be in the turn order
    expect(game.turnOrder).toHaveLength(4);
    expect(new Set(game.turnOrder)).toEqual(new Set(['p1', 'p2', 'p3', 'p4']));
    // No ABBA constraint to verify — just that it's a valid shuffle
  });

  it('beginPlaying with teamsEnabled=true but empty teams map falls back to random order', () => {
    const game = createGame('p1', 'Alice', { enabled: false, seconds: 60 }, 'private', true);
    addPlayer(game, 'p2', 'Bob');
    // Do NOT assign any teams — teams map is empty
    startGame(game);
    placeShips(game, 'p1', placementsForPlayer(0));
    placeShips(game, 'p2', placementsForPlayer(1));
    beginPlaying(game);

    expect(game.turnOrder).toHaveLength(2);
    expect(new Set(game.turnOrder)).toEqual(new Set(['p1', 'p2']));
  });
});

// ============================================================
// Team Win Condition
// ============================================================

describe('Team Win Condition', () => {
  it('1 teammate alive keeps team alive — game continues', () => {
    const { game, playerIds } = makeTeamGame();
    setupTeamBattle(game, playerIds);

    // Force turn order so p1 (alpha) shoots first
    game.turnOrder = ['p1', 'p3', 'p2', 'p4'];
    game.currentTurnIndex = 0;

    // Sink p3 (bravo, playerIndex=2): cells at A6, B6-B7, C6-C8, D6-D9
    const p3Cells = allCellsForPlayer(2);
    // p1 has 4 shots (ships of length 1+2+3+4 = 4 alive ships → 4 shots)
    // We need to sink all of p3's ships. p3 has 1+2+3+4=10 cells.
    // We'll fire multiple salvos to sink p3.

    // Fire salvos from p1 to hit p3's cells
    let cellIndex = 0;
    while (cellIndex < p3Cells.length) {
      game.currentTurnIndex = 0; // Force p1's turn
      const player = game.players.get('p1')!;
      const shotCount = player.ships.filter(s => !s.hits || s.hits.size < s.cells.length).length;
      const targets = p3Cells.slice(cellIndex, cellIndex + shotCount);
      // Pad with unused cells if needed
      while (targets.length < shotCount) {
        targets.push(`J${targets.length + 1}`);
      }
      fireSalvo(game, 'p1', targets);
      cellIndex += shotCount;
      if (cellIndex < p3Cells.length) {
        advanceTurn(game);
      }
    }

    // p3 should be dead, but p4 (bravo) still alive
    expect(isPlayerAlive(game.players.get('p3')!)).toBe(false);
    expect(isPlayerAlive(game.players.get('p4')!)).toBe(true);

    // Game should NOT be over — bravo team still has p4
    const result = checkGameOver(game);
    expect(result).toBeNull();
  });

  it('both teammates dead eliminates team — other team wins', () => {
    const { game, playerIds } = makeTeamGame();
    setupTeamBattle(game, playerIds);

    // Kill both bravo players (p3 index=2, p4 index=3)
    const bravoAllCells = [...allCellsForPlayer(2), ...allCellsForPlayer(3)];

    // Fire from alpha team to sink all bravo ships
    let cellIndex = 0;
    while (cellIndex < bravoAllCells.length) {
      // Alternate between p1 and p2 shooting
      const shooterId = cellIndex % 8 < 4 ? 'p1' : 'p2';
      const shooterIdx = game.turnOrder.indexOf(shooterId);
      game.currentTurnIndex = shooterIdx;

      const player = game.players.get(shooterId)!;
      const shotCount = player.ships.filter(s => s.cells.length > s.hits.size).length;
      if (shotCount === 0) break;

      const targets = bravoAllCells.slice(cellIndex, cellIndex + shotCount);
      // Pad with unused cells if we run short
      const usedCells = new Set([...game.shots]);
      let padCol = 10;
      while (targets.length < shotCount) {
        const padCell = `J${padCol}`;
        if (!usedCells.has(padCell)) {
          targets.push(padCell);
          usedCells.add(padCell);
        }
        padCol--;
      }

      fireSalvo(game, shooterId, targets);
      cellIndex += shotCount;
    }

    // Both bravo players should be dead
    expect(isPlayerAlive(game.players.get('p3')!)).toBe(false);
    expect(isPlayerAlive(game.players.get('p4')!)).toBe(false);

    const result = checkGameOver(game);
    expect(result).not.toBeNull();
    expect(result!.winnerTeamId).toBe('alpha');
    expect(result!.winnerId).toBeDefined();
    // Winner should be an alpha player
    expect(game.teams.get(result!.winnerId!)).toBe('alpha');
  });

  it('surrendered player team still alive if teammate has ships', () => {
    const { game, playerIds } = makeTeamGame();
    setupTeamBattle(game, playerIds);

    // p3 (bravo) surrenders
    forfeitPlayer(game, 'p3');

    expect(isPlayerAlive(game.players.get('p3')!)).toBe(false);
    expect(isPlayerAlive(game.players.get('p4')!)).toBe(true);

    // Game should continue — p4 keeps bravo alive
    const result = checkGameOver(game);
    expect(result).toBeNull();
  });

  it('both teams die in same salvo results in draw', () => {
    const { game, playerIds } = makeTeamGame();
    setupTeamBattle(game, playerIds);

    // Kill all of p1 (alpha, index=0) and p2 (alpha, index=1) ships via forfeit
    forfeitPlayer(game, 'p1');
    forfeitPlayer(game, 'p2');
    // Kill all of p3 (bravo, index=2) and p4 (bravo, index=3) ships via forfeit
    forfeitPlayer(game, 'p3');
    forfeitPlayer(game, 'p4');

    const result = checkGameOver(game);
    expect(result).not.toBeNull();
    expect(result!.winnerId).toBeNull();
    expect(result!.winnerTeamId).toBeNull();
  });
});

// ============================================================
// Team Balance Validation
// ============================================================

describe('Team Balance Validation', () => {
  it('canStartGame with balanced teams (2v2) succeeds', () => {
    const { game } = makeTeamGame();
    const error = canStartGame(game, 'p1');
    expect(error).toBeNull();
  });

  it('canStartGame with unbalanced teams (3v1) returns error', () => {
    const game = createGame('p1', 'Alice', { enabled: false, seconds: 60 }, 'private', true);
    for (const [id, name] of [['p2', 'Bob'], ['p3', 'Charlie'], ['p4', 'Diana']] as const) {
      addPlayer(game, id, name);
    }
    // 3 on alpha, 1 on bravo
    game.teams.set('p1', 'alpha');
    game.teams.set('p2', 'alpha');
    game.teams.set('p3', 'alpha');
    game.teams.set('p4', 'bravo');

    const error = canStartGame(game, 'p1');
    expect(error).not.toBeNull();
    expect(error).toContain('balanced');
  });
});

// ============================================================
// Shared Vision (Security)
// ============================================================

describe('Shared Vision (Security)', () => {
  it('toClientView reveals teammate ship cells in 2v2', () => {
    const { game, playerIds } = makeTeamGame();
    setupTeamBattle(game, playerIds);

    // p1 views game — should see p2's (teammate) ship cells
    const view = toClientView(game, 'p1');
    const p2Ships = view.players['p2'].ships;

    // Teammate ships should have populated cells
    for (const ship of p2Ships) {
      expect(ship.cells.length).toBeGreaterThan(0);
    }
  });

  it('toClientView does NOT reveal opponent ship cells in 2v2', () => {
    const { game, playerIds } = makeTeamGame();
    setupTeamBattle(game, playerIds);

    // p1 views game — should NOT see p3's (opponent) ship cells
    const view = toClientView(game, 'p1');
    const p3Ships = view.players['p3'].ships;
    const p4Ships = view.players['p4'].ships;

    for (const ship of p3Ships) {
      expect(ship.cells).toEqual([]);
    }
    for (const ship of p4Ships) {
      expect(ship.cells).toEqual([]);
    }
  });

  it('toClientView reveals eliminated teammate ship cells', () => {
    const { game, playerIds } = makeTeamGame();
    setupTeamBattle(game, playerIds);

    // Kill p2 (alpha teammate) by forfeiting
    forfeitPlayer(game, 'p2');

    expect(isPlayerAlive(game.players.get('p2')!)).toBe(false);

    // p1 views game — p2 is eliminated teammate
    const view = toClientView(game, 'p1');
    const p2Ships = view.players['p2'].ships;

    // Eliminated players show as sunk; for teammates the serialization
    // should still use the owner path (isTeammate=true), but since ships=[]
    // after forfeit, there are no ships to reveal.
    // The key behavior: eliminated non-teammates show serializeShipForEliminated
    // while teammates show serializeShipForOwner.
    // After forfeit, ships array is empty, so we verify the code path
    // by checking a teammate killed by shots instead.
    expect(p2Ships).toHaveLength(0); // forfeit clears ships

    // Now test with a teammate killed by actual shots (ships remain but all sunk)
    // Reset and set up a different scenario
    const { game: game2, playerIds: pids2 } = makeTeamGame();
    setupTeamBattle(game2, pids2);

    // Sink p2 (alpha, index=1) by hitting all their cells
    const p2Cells = allCellsForPlayer(1); // E1, F1-F2, G1-G3, H1-H4
    let cellIdx = 0;
    while (cellIdx < p2Cells.length) {
      // Use p3 (bravo) to shoot
      const shooterIdx = game2.turnOrder.indexOf('p3');
      game2.currentTurnIndex = shooterIdx;
      const shooter = game2.players.get('p3')!;
      const shotCount = shooter.ships.filter(s => s.cells.length > s.hits.size).length;
      if (shotCount === 0) break;

      const targets = p2Cells.slice(cellIdx, cellIdx + shotCount);
      const usedCells = new Set([...game2.shots]);
      let padRow = 9; // row J
      while (targets.length < shotCount) {
        const padCell = `J${padRow}`;
        if (!usedCells.has(padCell)) {
          targets.push(padCell);
          usedCells.add(padCell);
        }
        padRow--;
      }
      fireSalvo(game2, 'p3', targets);
      cellIdx += shotCount;
    }

    expect(isPlayerAlive(game2.players.get('p2')!)).toBe(false);

    // p1 views — eliminated teammate p2 should still show cells (owner/teammate path)
    const view2 = toClientView(game2, 'p1');
    const p2ShipsView = view2.players['p2'].ships;

    // Teammate ships (even eliminated) use serializeShipForOwner which includes cells
    for (const ship of p2ShipsView) {
      expect(ship.cells.length).toBeGreaterThan(0);
      expect(ship.sunk).toBe(true);
    }
  });
});

// ============================================================
// Team Helpers
// ============================================================

describe('Team Helpers', () => {
  describe('getTeammate', () => {
    it('returns teammate ID', () => {
      const { game } = makeTeamGame();
      expect(getTeammate(game, 'p1')).toBe('p2');
      expect(getTeammate(game, 'p2')).toBe('p1');
      expect(getTeammate(game, 'p3')).toBe('p4');
      expect(getTeammate(game, 'p4')).toBe('p3');
    });

    it('returns null when player has no team assignment', () => {
      const { game } = makeTeamGame();
      // Player not in teams map
      expect(getTeammate(game, 'unknown')).toBeNull();
    });

    it('returns null when teammate is not in game', () => {
      const game = createGame('p1', 'Alice', { enabled: false, seconds: 60 }, 'private', true);
      // Only p1 is on alpha, no teammate
      game.teams.set('p1', 'alpha');
      expect(getTeammate(game, 'p1')).toBeNull();
    });
  });

  describe('isTeamAlive', () => {
    it('returns true when any teammate is alive', () => {
      const { game, playerIds } = makeTeamGame();
      setupTeamBattle(game, playerIds);

      // Kill p1 but p2 still alive
      forfeitPlayer(game, 'p1');
      expect(isTeamAlive(game, 'alpha')).toBe(true);
    });

    it('returns false when both teammates are dead', () => {
      const { game, playerIds } = makeTeamGame();
      setupTeamBattle(game, playerIds);

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
    const { game, playerIds } = makeTeamGame();
    setupTeamBattle(game, playerIds);

    // End the game by forfeiting bravo
    forfeitPlayer(game, 'p3');
    forfeitPlayer(game, 'p4');
    checkGameOver(game);

    expect(game.phase).toBe('finished');

    // Reset for rematch
    resetForRematch(game);

    expect(game.phase).toBe('placement');
    expect(game.teamsEnabled).toBe(true);
    expect(game.teams.size).toBe(4);
    expect(game.teams.get('p1')).toBe('alpha');
    expect(game.teams.get('p2')).toBe('alpha');
    expect(game.teams.get('p3')).toBe('bravo');
    expect(game.teams.get('p4')).toBe('bravo');
  });
});

// ============================================================
// GameOverStats
// ============================================================

describe('GameOverStats', () => {
  it('winnerTeamId is set correctly for team games', () => {
    const { game, playerIds } = makeTeamGame();
    setupTeamBattle(game, playerIds);

    // Eliminate bravo team
    forfeitPlayer(game, 'p3');
    forfeitPlayer(game, 'p4');

    const stats = checkGameOver(game);
    expect(stats).not.toBeNull();
    expect(stats!.winnerTeamId).toBe('alpha');
  });

  it('team aggregate highlights are generated', () => {
    const { game, playerIds } = makeTeamGame();
    setupTeamBattle(game, playerIds);

    // Have p1 fire a salvo so stats are populated
    game.turnOrder = ['p1', 'p3', 'p2', 'p4'];
    game.currentTurnIndex = 0;

    // Fire at bravo player cells to get some hits
    const p3Cells = allCellsForPlayer(2);
    fireSalvo(game, 'p1', p3Cells.slice(0, 4));
    advanceTurn(game);

    // Eliminate bravo to end game
    forfeitPlayer(game, 'p3');
    forfeitPlayer(game, 'p4');

    const stats = checkGameOver(game);
    expect(stats).not.toBeNull();
    expect(stats!.highlights.length).toBeGreaterThan(0);

    // Should contain team aggregate highlights
    const teamHighlights = stats!.highlights.filter(h =>
      h.includes('Team Alpha') || h.includes('Team Bravo')
    );
    expect(teamHighlights.length).toBeGreaterThan(0);
  });
});

// ============================================================
// toGameMode / toQuickPlayMode helpers
// ============================================================

describe('toGameMode / toQuickPlayMode helpers', () => {
  it('toGameMode maps all 3 QuickPlayModes correctly', () => {
    expect(toGameMode('1v1')).toBe('quickplay-1v1');
    expect(toGameMode('2v2')).toBe('quickplay-2v2');
    expect(toGameMode('ffa')).toBe('quickplay-ffa');
  });

  it('toQuickPlayMode maps all GameModes correctly', () => {
    expect(toQuickPlayMode('quickplay-1v1')).toBe('1v1');
    expect(toQuickPlayMode('quickplay-2v2')).toBe('2v2');
    expect(toQuickPlayMode('quickplay-ffa')).toBe('ffa');
  });

  it('toQuickPlayMode returns null for private mode', () => {
    expect(toQuickPlayMode('private')).toBeNull();
  });
});
