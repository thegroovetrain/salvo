import { describe, it, expect, beforeEach } from 'vitest';
import {
  createGame, addPlayer, canStartGame, startGame,
  placeShips, allShipsPlaced, beginPlaying,
  getCurrentTurnPlayerId, validateSalvo, fireSalvo,
  advanceTurn, checkGameOver, forfeitPlayer,
  toClientView, validatePlacement, resetForRematch,
} from '../game.js';
import type { Game, ShipPlacement } from '@salvo/shared';
import { isPlayerAlive, playerShotCount, isShipSunk } from '@salvo/shared';

// ============================================================
// Helpers
// ============================================================

function makeGame(playerCount: number = 2): { game: Game; playerIds: string[] } {
  const game = createGame('p1', 'Alice', { enabled: false, seconds: 60 });
  const playerIds = ['p1'];
  for (let i = 2; i <= playerCount; i++) {
    const id = `p${i}`;
    addPlayer(game, id, `Player${i}`);
    playerIds.push(id);
  }
  return { game, playerIds };
}

function defaultPlacements(): ShipPlacement[] {
  return [
    { length: 1, cells: ['A1'] },
    { length: 2, cells: ['B1', 'B2'] },
    { length: 3, cells: ['C1', 'C2', 'C3'] },
    { length: 4, cells: ['D1', 'D2', 'D3', 'D4'] },
  ];
}

function placementsAt(colOffset: number): ShipPlacement[] {
  // Place ships in different columns to avoid overlap between players
  // All ships in rows A-D, but shifted by colOffset
  const c = colOffset + 1; // 1-based column
  return [
    { length: 1, cells: [`A${c}`] },
    { length: 2, cells: [`B${c}`, `B${c + 1}`] },
    { length: 3, cells: [`C${c}`, `C${c + 1}`, `C${c + 2}`] },
    { length: 4, cells: [`D${c}`, `D${c + 1}`, `D${c + 2}`, `D${c + 3}`] },
  ];
}

function placementsForPlayer(playerIndex: number): ShipPlacement[] {
  // Each player gets ships in different rows to avoid shared-ocean overlap in tests
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

function setupBattle(game: Game, playerIds: string[]): void {
  startGame(game);
  playerIds.forEach((id, i) => {
    placeShips(game, id, placementsForPlayer(i));
  });
  beginPlaying(game);
}

// ============================================================
// Game Creation
// ============================================================

describe('Game Creation', () => {
  it('creates a game with correct initial state', () => {
    const game = createGame('host', 'Alice', { enabled: false, seconds: 60 });
    expect(game.phase).toBe('lobby');
    expect(game.players.size).toBe(1);
    expect(game.players.get('host')?.name).toBe('Alice');
    expect(game.hostId).toBe('host');
    expect(game.gridSize).toBe(10);
    expect(game.shots.size).toBe(0);
  });
});

// ============================================================
// Player Management
// ============================================================

describe('Player Management', () => {
  it('adds players up to 4', () => {
    const { game } = makeGame(1);
    expect(addPlayer(game, 'p2', 'Bob')).toBeNull();
    expect(addPlayer(game, 'p3', 'Charlie')).toBeNull();
    expect(addPlayer(game, 'p4', 'Dan')).toBeNull();
    expect(game.players.size).toBe(4);
  });

  it('rejects 5th player', () => {
    const { game } = makeGame(4);
    expect(addPlayer(game, 'p5', 'Eve')).toBe('Game is full (4 players max)');
  });

  it('rejects duplicate player', () => {
    const { game } = makeGame(1);
    expect(addPlayer(game, 'p1', 'Alice2')).toBe('Already in this game');
  });

  it('rejects join after game started', () => {
    const { game } = makeGame(2);
    startGame(game);
    expect(addPlayer(game, 'p3', 'Charlie')).toBe('Game is not in lobby phase');
  });

  it('only host can start', () => {
    const { game } = makeGame(2);
    expect(canStartGame(game, 'p2')).toBe('Only the host can start the game');
    expect(canStartGame(game, 'p1')).toBeNull();
  });

  it('needs at least 2 players to start', () => {
    const { game } = makeGame(1);
    expect(canStartGame(game, 'p1')).toBe('Need at least 2 players');
  });
});

// ============================================================
// Ship Placement
// ============================================================

describe('Ship Placement Validation', () => {
  it('accepts valid placement', () => {
    expect(validatePlacement(defaultPlacements())).toBeNull();
  });

  it('rejects wrong number of ships', () => {
    expect(validatePlacement([{ length: 1, cells: ['A1'] }])).toContain('exactly');
  });

  it('rejects wrong ship lengths', () => {
    const placements = [
      { length: 1, cells: ['A1'] },
      { length: 2, cells: ['B1', 'B2'] },
      { length: 3, cells: ['C1', 'C2', 'C3'] },
      { length: 5, cells: ['D1', 'D2', 'D3', 'D4', 'D5'] }, // wrong length
    ];
    expect(validatePlacement(placements)).not.toBeNull();
  });

  it('rejects out of bounds', () => {
    const placements = [
      { length: 1, cells: ['A1'] },
      { length: 2, cells: ['B1', 'B2'] },
      { length: 3, cells: ['C1', 'C2', 'C3'] },
      { length: 4, cells: ['J8', 'J9', 'J10', 'J11'] }, // J11 doesn't exist
    ];
    expect(validatePlacement(placements)).not.toBeNull();
  });

  it('rejects non-contiguous cells', () => {
    const placements = [
      { length: 1, cells: ['A1'] },
      { length: 2, cells: ['B1', 'B3'] }, // gap
      { length: 3, cells: ['C1', 'C2', 'C3'] },
      { length: 4, cells: ['D1', 'D2', 'D3', 'D4'] },
    ];
    expect(validatePlacement(placements)).toContain('contiguous');
  });

  it('rejects diagonal placement', () => {
    const placements = [
      { length: 1, cells: ['A1'] },
      { length: 2, cells: ['B1', 'C2'] }, // diagonal
      { length: 3, cells: ['D1', 'D2', 'D3'] },
      { length: 4, cells: ['E1', 'E2', 'E3', 'E4'] },
    ];
    expect(validatePlacement(placements)).toContain('horizontal or vertical');
  });

  it('rejects overlapping ships', () => {
    const placements = [
      { length: 1, cells: ['A1'] },
      { length: 2, cells: ['A1', 'A2'] }, // overlaps Scout
      { length: 3, cells: ['C1', 'C2', 'C3'] },
      { length: 4, cells: ['D1', 'D2', 'D3', 'D4'] },
    ];
    expect(validatePlacement(placements)).toContain('Overlapping');
  });

  it('rejects double placement', () => {
    const { game } = makeGame(2);
    startGame(game);
    expect(placeShips(game, 'p1', defaultPlacements())).toBeNull();
    expect(placeShips(game, 'p1', defaultPlacements())).toBe('Ships already placed');
  });
});

// ============================================================
// Shot Resolution (Atomic)
// ============================================================

describe('Shot Resolution', () => {
  it('resolves a miss', () => {
    const { game, playerIds } = makeGame(2);
    setupBattle(game, playerIds);
    const currentPlayer = getCurrentTurnPlayerId(game)!;
    const shotCount = playerShotCount(game.players.get(currentPlayer)!);

    // Fire at empty cells
    const coords = Array.from({ length: shotCount }, (_, i) => `J${i + 6}`);
    const results = fireSalvo(game, currentPlayer, coords);
    expect(results.every(r => r.miss)).toBe(true);
  });

  it('resolves a hit', () => {
    const { game, playerIds } = makeGame(2);
    setupBattle(game, playerIds);

    // Force turn order so p1 goes first
    game.turnOrder = ['p1', 'p2'];
    game.currentTurnIndex = 0;

    // p2's ships are at rows E-H (offset 4)
    // Scout at E1, Destroyer at F1-F2, Cruiser at G1-G3, Battleship at H1-H4
    const results = fireSalvo(game, 'p1', ['E1', 'F1', 'G1', 'H1']);
    const hits = results.filter(r => !r.miss);
    expect(hits.length).toBe(4);

    // Scout should be sunk (1 cell, 1 hit)
    const scoutHit = results.find(r => r.coord === 'E1');
    expect(scoutHit?.hits[0].sunk).toBe(true);
    expect(scoutHit?.hits[0].shipLength).toBe(1);
    expect(scoutHit?.hits[0].sunkShipCells).toEqual(['E1']);
  });

  it('resolves atomic — all shots before checking alive', () => {
    const { game, playerIds } = makeGame(2);
    setupBattle(game, playerIds);
    game.turnOrder = ['p1', 'p2'];
    game.currentTurnIndex = 0;

    // Sink all of p2's ships in one salvo (requires 4 shots hitting all 10 cells)
    // But p1 only has 4 shots. Let's set up a scenario where p2 has only 1 ship.
    // Instead, test that all shots resolve even if an earlier one would eliminate.
    // Fire at p2's Scout (E1) and p1's own Scout (A1) — friendly fire + enemy
    const results = fireSalvo(game, 'p1', ['E1', 'A1', 'J9', 'J10']);

    // E1 hits p2's Scout (sunk)
    expect(results[0].hits.length).toBe(1);
    expect(results[0].hits[0].sunk).toBe(true);

    // A1 hits p1's own Scout (friendly fire, sunk)
    expect(results[1].hits.length).toBe(1);
    expect(results[1].hits[0].playerId).toBe('p1'); // self-hit
    expect(results[1].hits[0].sunk).toBe(true);
  });

  it('rejects out-of-turn fire', () => {
    const { game, playerIds } = makeGame(2);
    setupBattle(game, playerIds);
    const currentPlayer = getCurrentTurnPlayerId(game)!;
    const otherPlayer = playerIds.find(id => id !== currentPlayer)!;

    expect(validateSalvo(game, otherPlayer, ['A1'])).toBe('Not your turn');
  });

  it('rejects wrong number of shots', () => {
    const { game, playerIds } = makeGame(2);
    setupBattle(game, playerIds);
    const currentPlayer = getCurrentTurnPlayerId(game)!;

    expect(validateSalvo(game, currentPlayer, ['A1'])).toContain('Must fire exactly');
  });

  it('rejects duplicate shot on already-fired coordinate', () => {
    const { game, playerIds } = makeGame(2);
    setupBattle(game, playerIds);
    game.turnOrder = ['p1', 'p2'];
    game.currentTurnIndex = 0;

    fireSalvo(game, 'p1', ['J6', 'J7', 'J8', 'J9']);
    advanceTurn(game);

    // p2 tries to fire at J6 which was already shot
    const err = validateSalvo(game, 'p2', ['J6', 'J5', 'J4', 'J3']);
    expect(err).toContain('Already shot');
  });

  it('rejects duplicate coordinates within salvo', () => {
    const { game, playerIds } = makeGame(2);
    setupBattle(game, playerIds);
    game.turnOrder = ['p1', 'p2'];
    game.currentTurnIndex = 0;

    const err = validateSalvo(game, 'p1', ['J6', 'J6', 'J7', 'J8']);
    expect(err).toContain('Duplicate');
  });

  it('rejects invalid coordinates', () => {
    const { game, playerIds } = makeGame(2);
    setupBattle(game, playerIds);
    game.turnOrder = ['p1', 'p2'];
    game.currentTurnIndex = 0;

    expect(validateSalvo(game, 'p1', ['Z99', 'A1', 'A2', 'A3'])).toContain('Invalid');
  });
});

// ============================================================
// Turn Management
// ============================================================

describe('Turn Management', () => {
  it('advances to next alive player', () => {
    const { game, playerIds } = makeGame(3);
    setupBattle(game, playerIds);
    game.turnOrder = ['p1', 'p2', 'p3'];
    game.currentTurnIndex = 0;

    advanceTurn(game);
    expect(getCurrentTurnPlayerId(game)).toBe('p2');

    advanceTurn(game);
    expect(getCurrentTurnPlayerId(game)).toBe('p3');

    advanceTurn(game);
    expect(getCurrentTurnPlayerId(game)).toBe('p1'); // wraps around
  });

  it('skips eliminated players', () => {
    const { game, playerIds } = makeGame(3);
    setupBattle(game, playerIds);
    game.turnOrder = ['p1', 'p2', 'p3'];
    game.currentTurnIndex = 0;

    // Eliminate p2
    forfeitPlayer(game, 'p2');

    advanceTurn(game);
    expect(getCurrentTurnPlayerId(game)).toBe('p3'); // skipped p2
  });
});

// ============================================================
// Game Over
// ============================================================

describe('Game Over', () => {
  it('detects winner when one player remains', () => {
    const { game, playerIds } = makeGame(2);
    setupBattle(game, playerIds);

    forfeitPlayer(game, 'p2');
    const result = checkGameOver(game);

    expect(result).not.toBeNull();
    expect(result!.winnerId).toBe('p1');
    expect(game.phase).toBe('finished');
  });

  it('detects draw when all eliminated', () => {
    const { game, playerIds } = makeGame(2);
    setupBattle(game, playerIds);

    forfeitPlayer(game, 'p1');
    forfeitPlayer(game, 'p2');
    const result = checkGameOver(game);

    expect(result).not.toBeNull();
    expect(result!.winnerId).toBeNull();
  });

  it('does not end game with 2+ alive players', () => {
    const { game, playerIds } = makeGame(3);
    setupBattle(game, playerIds);

    forfeitPlayer(game, 'p3');
    const result = checkGameOver(game);
    expect(result).toBeNull();
    expect(game.phase).toBe('playing');
  });
});

// ============================================================
// Self-Elimination
// ============================================================

describe('Self-Elimination', () => {
  it('player can eliminate themselves via friendly fire', () => {
    const { game } = makeGame(2);
    startGame(game);

    // Give p1 only one ship (Scout at A1) for easy self-elimination
    placeShips(game, 'p1', [
      { length: 1, cells: ['A1'] },
      { length: 2, cells: ['A3', 'A4'] },
      { length: 3, cells: ['A6', 'A7', 'A8'] },
      { length: 4, cells: ['B1', 'B2', 'B3', 'B4'] },
    ]);
    placeShips(game, 'p2', placementsAt(4));
    beginPlaying(game);

    game.turnOrder = ['p1', 'p2'];
    game.currentTurnIndex = 0;

    // p1 fires at own ships
    fireSalvo(game, 'p1', ['A1', 'A3', 'A4', 'A6']);

    // p1's Scout, Destroyer are sunk; Cruiser partially hit
    const p1 = game.players.get('p1')!;
    expect(isShipSunk(p1.ships[0])).toBe(true); // Scout
    expect(isShipSunk(p1.ships[1])).toBe(true); // Destroyer
    expect(isPlayerAlive(p1)).toBe(true); // still has Cruiser (partially) and Battleship
  });
});

// ============================================================
// Forfeit
// ============================================================

describe('Forfeit (silent removal)', () => {
  it('clears ships on forfeit (silent — no info leakage)', () => {
    const { game, playerIds } = makeGame(2);
    setupBattle(game, playerIds);

    forfeitPlayer(game, 'p1');
    const p1 = game.players.get('p1')!;
    expect(p1.ships).toEqual([]);
    expect(isPlayerAlive(p1)).toBe(false);
  });

  it('isPlayerAlive returns false for player with empty ships', () => {
    const { game } = makeGame(2);
    startGame(game);
    placeShips(game, 'p1', defaultPlacements());
    const p1 = game.players.get('p1')!;
    expect(isPlayerAlive(p1)).toBe(true);

    p1.ships = [];
    expect(isPlayerAlive(p1)).toBe(false);
  });

  it('playerShotCount returns 0 for player with empty ships', () => {
    const { game } = makeGame(2);
    startGame(game);
    placeShips(game, 'p1', defaultPlacements());
    const p1 = game.players.get('p1')!;
    expect(playerShotCount(p1)).toBe(4);

    p1.ships = [];
    expect(playerShotCount(p1)).toBe(0);
  });

  it('advanceTurn skips player with empty ships', () => {
    const { game, playerIds } = makeGame(3);
    setupBattle(game, playerIds);
    game.turnOrder = ['p1', 'p2', 'p3'];
    game.currentTurnIndex = 0;

    forfeitPlayer(game, 'p2'); // ships = []
    advanceTurn(game);
    expect(getCurrentTurnPlayerId(game)).toBe('p3');
  });

  it('checkGameOver detects winner after silent forfeit', () => {
    const { game, playerIds } = makeGame(2);
    setupBattle(game, playerIds);

    forfeitPlayer(game, 'p2');
    const result = checkGameOver(game);
    expect(result).not.toBeNull();
    expect(result!.winnerId).toBe('p1');
  });
});

// ============================================================
// Rematch
// ============================================================

describe('Rematch', () => {
  it('resets game state for rematch', () => {
    const { game, playerIds } = makeGame(2);
    setupBattle(game, playerIds);

    // Play some
    game.turnOrder = ['p1', 'p2'];
    game.currentTurnIndex = 0;
    fireSalvo(game, 'p1', ['E1', 'J7', 'J8', 'J9']);

    resetForRematch(game);

    expect(game.phase).toBe('placement');
    expect(game.shots.size).toBe(0);
    expect(game.turnOrder.length).toBe(0);
    expect(game.players.size).toBe(2); // players preserved
    for (const player of game.players.values()) {
      expect(player.ships.length).toBe(0); // ships cleared
    }
  });
});

// ============================================================
// Game Stats Tracking
// ============================================================

describe('Game Stats', () => {
  it('tracks shots fired and hits landed per player', () => {
    const { game, playerIds } = makeGame(2);
    setupBattle(game, playerIds);
    game.turnOrder = ['p1', 'p2'];
    game.currentTurnIndex = 0;

    // p1 ships: A1, B1-B2, C1-C3, D1-D4 (playerIndex 0)
    // p2 ships: E1, F1-F2, G1-G3, H1-H4 (playerIndex 1)
    fireSalvo(game, 'p1', ['E1', 'F1', 'G1', 'H1']);

    const p1Stats = game.playerStats.get('p1')!;
    expect(p1Stats.shotsFired).toBe(4);
    expect(p1Stats.hitsLanded).toBe(4); // all hits on p2
    expect(p1Stats.turnsTaken).toBe(1);
  });

  it('tracks friendly fire separately from hits', () => {
    const { game, playerIds } = makeGame(2);
    setupBattle(game, playerIds);
    game.turnOrder = ['p1', 'p2'];
    game.currentTurnIndex = 0;

    // p1 fires at own Scout (A1) + 3 misses
    fireSalvo(game, 'p1', ['A1', 'J6', 'J7', 'J8']);

    const p1Stats = game.playerStats.get('p1')!;
    expect(p1Stats.friendlyFireHits).toBe(1);
    expect(p1Stats.hitsLanded).toBe(0); // self-hit doesn't count as "landed"
  });

  it('tracks ships sunk', () => {
    const { game, playerIds } = makeGame(2);
    setupBattle(game, playerIds);
    game.turnOrder = ['p1', 'p2'];
    game.currentTurnIndex = 0;

    // p2's Scout is at E1 (playerIndex 1)
    fireSalvo(game, 'p1', ['E1', 'J6', 'J7', 'J8']);

    const p1Stats = game.playerStats.get('p1')!;
    expect(p1Stats.shipsSunk).toBe(1);
  });

  it('tracks first blood', () => {
    const { game, playerIds } = makeGame(2);
    setupBattle(game, playerIds);
    game.turnOrder = ['p1', 'p2'];
    game.currentTurnIndex = 0;

    expect(game.firstBloodId).toBeNull();

    // Miss everything
    fireSalvo(game, 'p1', ['J6', 'J7', 'J8', 'J9']);
    expect(game.firstBloodId).toBeNull();

    advanceTurn(game);

    // p2 hits p1's Scout (A1)
    fireSalvo(game, 'p2', ['A1', 'J1', 'J2', 'J3']);
    expect(game.firstBloodId).toBe('p2');
  });

  it('generates meaningful highlights at game over', () => {
    const { game, playerIds } = makeGame(2);
    setupBattle(game, playerIds);
    game.turnOrder = ['p1', 'p2'];
    game.currentTurnIndex = 0;

    // p1 fires at p2's ships (E1, F1, G1, H1)
    fireSalvo(game, 'p1', ['E1', 'F1', 'G1', 'H1']); // 4 hits
    advanceTurn(game);
    fireSalvo(game, 'p2', ['J6', 'J7', 'J8', 'J9']); // 4 misses
    advanceTurn(game);
    fireSalvo(game, 'p1', ['F2', 'G2', 'G3', 'H2']); // 4 more hits

    // Forfeit p2 to end game
    forfeitPlayer(game, 'p2');
    const result = checkGameOver(game);

    expect(result).not.toBeNull();
    expect(result!.playerStats['p1'].accuracy).toBeCloseTo(1.0); // 8/8
    expect(result!.playerStats['p1'].shipsSunk).toBeGreaterThan(0);
    expect(result!.highlights.some(h => h.includes('Sharpshooter'))).toBe(true);
    expect(result!.highlights.some(h => h.includes('First Blood'))).toBe(true);
  });
});

// ============================================================
// Computed Getters
// ============================================================

describe('Computed Getters', () => {
  it('Ship.sunk is computed from hits', () => {
    const { game } = makeGame(2);
    startGame(game);
    placeShips(game, 'p1', defaultPlacements());

    const p1 = game.players.get('p1')!;
    const scout = p1.ships[0]; // length 1
    expect(isShipSunk(scout)).toBe(false);
    scout.hits.add('A1');
    expect(isShipSunk(scout)).toBe(true);
  });

  it('Player.alive is computed from ships', () => {
    const { game } = makeGame(2);
    startGame(game);
    placeShips(game, 'p1', defaultPlacements());

    const p1 = game.players.get('p1')!;
    expect(isPlayerAlive(p1)).toBe(true);

    // Sink all ships
    for (const ship of p1.ships) {
      for (const cell of ship.cells) {
        ship.hits.add(cell);
      }
    }
    expect(isPlayerAlive(p1)).toBe(false);
  });

  it('playerShotCount equals surviving ships', () => {
    const { game } = makeGame(2);
    startGame(game);
    placeShips(game, 'p1', defaultPlacements());

    const p1 = game.players.get('p1')!;
    expect(playerShotCount(p1)).toBe(4);

    // Sink Scout
    p1.ships[0].hits.add('A1');
    expect(playerShotCount(p1)).toBe(3);
  });
});
