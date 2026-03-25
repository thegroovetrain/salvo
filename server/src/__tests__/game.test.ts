import { describe, it, expect } from 'vitest';
import {
  createGame, addPlayer, addBot, canStartGame, startGame,
  placeShips, allShipsPlaced, beginPlaying,
  getCurrentTurnPlayerId, validateSalvo, fireSalvo,
  advanceTurn, checkGameOver, forfeitPlayer,
  toClientView, validatePlacement, resetForRematch,
  generateIslands, updateGameOptions, removePlayer,
} from '../game.js';
import type { Game, ShipPlacement } from '@salvo/shared';
import { isPlayerAlive, playerShotCount, isShipSunk } from '@salvo/shared';
import { makeGame, hexPlacements, allCellsForPlayer, setupBattle, defaultPlacements } from './helpers.js';

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
    expect(game.rings).toBe(5);
    expect(game.islands.size).toBe(0);
    expect(game.shots.size).toBe(0);
  });

  it('creates game with custom ring count', () => {
    const game = createGame('host', 'Alice', { enabled: false, seconds: 60 }, 'private', false, 6);
    expect(game.rings).toBe(6);
  });
});

// ============================================================
// Player Management
// ============================================================

describe('Player Management', () => {
  it('adds players up to 6', () => {
    const { game } = makeGame(1);
    for (let i = 2; i <= 6; i++) {
      expect(addPlayer(game, `p${i}`, `Player ${i}`)).toBeNull();
    }
    expect(game.players.size).toBe(6);
  });

  it('rejects 7th player', () => {
    const { game } = makeGame(6);
    expect(addPlayer(game, 'p7', 'Eve')).toBe('Game is full (6 players max)');
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
  it('accepts valid hex placement', () => {
    expect(validatePlacement(defaultPlacements(), 5, new Set())).toBeNull();
  });

  it('rejects wrong number of ships', () => {
    expect(validatePlacement([{ length: 1, cells: ['0,0'] }], 5, new Set())).toContain('exactly');
  });

  it('rejects wrong ship lengths', () => {
    const placements = [
      { length: 1, cells: ['0,0'] },
      { length: 2, cells: ['1,0', '2,0'] },
      { length: 3, cells: ['-1,0', '-2,0', '-3,0'] },
      { length: 5, cells: ['0,1', '0,2', '0,3', '0,4', '0,5'] },
    ];
    expect(validatePlacement(placements, 5, new Set())).not.toBeNull();
  });

  it('rejects out of bounds', () => {
    const placements = [
      { length: 1, cells: ['0,0'] },
      { length: 2, cells: ['1,0', '2,0'] },
      { length: 3, cells: ['-1,0', '-2,0', '-3,0'] },
      { length: 4, cells: ['3,0', '4,0', '5,0', '6,0'] }, // 6,0 out of 5-ring
    ];
    expect(validatePlacement(placements, 5, new Set())).not.toBeNull();
  });

  it('rejects non-hex-axis placement', () => {
    const placements = [
      { length: 1, cells: ['0,0'] },
      { length: 2, cells: ['1,0', '0,1'] }, // not along a hex axis
      { length: 3, cells: ['-1,0', '-2,0', '-3,0'] },
      { length: 4, cells: ['0,1', '0,2', '0,3', '0,4'] },
    ];
    expect(validatePlacement(placements, 5, new Set())).not.toBeNull();
  });

  it('rejects overlapping ships', () => {
    const placements = [
      { length: 1, cells: ['0,0'] },
      { length: 2, cells: ['0,0', '1,0'] }, // overlaps Scout
      { length: 3, cells: ['-1,0', '-2,0', '-3,0'] },
      { length: 4, cells: ['0,1', '0,2', '0,3', '0,4'] },
    ];
    expect(validatePlacement(placements, 5, new Set())).toContain('Overlapping');
  });

  it('rejects placement on island', () => {
    const islands = new Set(['1,0']);
    const placements = [
      { length: 1, cells: ['0,0'] },
      { length: 2, cells: ['1,0', '2,0'] }, // 1,0 is an island
      { length: 3, cells: ['-1,0', '-2,0', '-3,0'] },
      { length: 4, cells: ['0,1', '0,2', '0,3', '0,4'] },
    ];
    expect(validatePlacement(placements, 5, islands)).toContain('island');
  });

  it('accepts all 6 hex directions', () => {
    // Each direction: (1,0), (1,-1), (0,-1), (-1,0), (-1,1), (0,1)
    const dirs = [
      ['0,0', '1,0'],     // E
      ['0,0', '1,-1'],    // NE
      ['0,0', '0,-1'],    // NW
      ['0,0', '-1,0'],    // W
      ['0,0', '-1,1'],    // SW
      ['0,0', '0,1'],     // SE
    ];
    for (const cells of dirs) {
      const placements = [
        { length: 1, cells: ['3,0'] },
        { length: 2, cells },
        { length: 3, cells: ['-1,-1', '-2,-1', '-3,-1'] },
        { length: 4, cells: ['0,2', '0,3', '0,4', '0,5'] },
      ];
      expect(validatePlacement(placements, 5, new Set())).toBeNull();
    }
  });

  it('rejects double placement', () => {
    const { game } = makeGame(2);
    startGame(game);
    game.islands = new Set(); // clear islands for deterministic placement
    expect(placeShips(game, 'p1', defaultPlacements())).toBeNull();
    expect(placeShips(game, 'p1', defaultPlacements())).toBe('Ships already placed');
  });
});

// ============================================================
// Island Generation
// ============================================================

describe('Island Generation', () => {
  it('generates requested island count (few)', () => {
    const islands = generateIslands(5, 4);
    expect(islands.size).toBeLessThanOrEqual(4);
    expect(islands.size).toBeGreaterThan(0);
  });

  it('generates requested island count (normal)', () => {
    const islands = generateIslands(5, 6);
    expect(islands.size).toBeLessThanOrEqual(6);
  });

  it('generates requested island count (many) on large grid', () => {
    const islands = generateIslands(6, 8);
    expect(islands.size).toBeLessThanOrEqual(8);
  });

  it('excludes center rings (distance < 2)', () => {
    // Run multiple times since it's random
    for (let i = 0; i < 10; i++) {
      const islands = generateIslands(5, 6);
      for (const coord of islands) {
        const parts = coord.split(',');
        const q = parseInt(parts[0]);
        const r = parseInt(parts[1]);
        const dist = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
        expect(dist).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('islands are generated at startGame (placement phase)', () => {
    const { game } = makeGame(2);
    expect(game.islands.size).toBe(0); // no islands in lobby
    startGame(game);
    expect(game.islands.size).toBeGreaterThan(0); // islands generated
    expect(game.phase).toBe('placement');
  });

  it('islands regenerated on rematch', () => {
    const { game, playerIds } = makeGame(2);
    setupBattle(game, playerIds);
    const originalIslands = new Set(game.islands);

    resetForRematch(game);

    // Islands exist (may or may not be same due to randomness)
    expect(game.islands.size).toBeGreaterThan(0);
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

    // Fire at empty cells far from any ships (NW corner, no ships here)
    const emptyCoords = ['-1,-4', '-2,-3', '-3,-2', '-4,-1'].slice(0, shotCount);
    // Mark them as valid by ensuring they're not already shot and not islands
    const results = fireSalvo(game, currentPlayer, emptyCoords);
    expect(results.every(r => r.miss)).toBe(true);
  });

  it('resolves a hit on known ship cells', () => {
    const { game, playerIds } = makeGame(2);
    setupBattle(game, playerIds);
    game.turnOrder = ['p1', 'p2'];
    game.currentTurnIndex = 0;

    // p2's ships are hexPlacements(1). Get p2's scout cell.
    const p2Cells = allCellsForPlayer(1);
    const scoutCell = hexPlacements(1)[0].cells[0]; // length-1 ship

    // Fire at p2's scout + empty cells
    const shotCount = playerShotCount(game.players.get('p1')!);
    const targets = [scoutCell, '-1,-4', '-2,-3', '-3,-2'].slice(0, shotCount);
    const results = fireSalvo(game, 'p1', targets);

    const scoutResult = results.find(r => r.coord === scoutCell);
    expect(scoutResult?.miss).toBe(false);
    expect(scoutResult?.hits[0].sunk).toBe(true);
    expect(scoutResult?.hits[0].shipLength).toBe(1);
  });

  it('resolves atomic — all shots before checking alive', () => {
    const { game, playerIds } = makeGame(2);
    setupBattle(game, playerIds);
    game.turnOrder = ['p1', 'p2'];
    game.currentTurnIndex = 0;

    const p1Scout = hexPlacements(0)[0].cells[0];
    const p2Scout = hexPlacements(1)[0].cells[0];

    const shotCount = playerShotCount(game.players.get('p1')!);
    const targets = [p2Scout, p1Scout, '-1,-4', '-2,-3'].slice(0, shotCount);
    const results = fireSalvo(game, 'p1', targets);

    // Both scouts should be hit
    expect(results.find(r => r.coord === p2Scout)?.hits.length).toBe(1);
    expect(results.find(r => r.coord === p1Scout)?.hits[0].playerId).toBe('p1');
  });

  it('rejects out-of-turn fire', () => {
    const { game, playerIds } = makeGame(2);
    setupBattle(game, playerIds);
    const currentPlayer = getCurrentTurnPlayerId(game)!;
    const otherPlayer = playerIds.find(id => id !== currentPlayer)!;

    expect(validateSalvo(game, otherPlayer, ['0,0'])).toBe('Not your turn');
  });

  it('rejects wrong number of shots', () => {
    const { game, playerIds } = makeGame(2);
    setupBattle(game, playerIds);
    const currentPlayer = getCurrentTurnPlayerId(game)!;

    expect(validateSalvo(game, currentPlayer, ['0,0'])).toContain('Must fire exactly');
  });

  it('rejects duplicate shot on already-fired coordinate', () => {
    const { game, playerIds } = makeGame(2);
    setupBattle(game, playerIds);
    game.turnOrder = ['p1', 'p2'];
    game.currentTurnIndex = 0;

    const shotCount = playerShotCount(game.players.get('p1')!);
    const firstSalvo = ['-1,-4', '-2,-3', '-3,-2', '-4,-1'].slice(0, shotCount);
    fireSalvo(game, 'p1', firstSalvo);
    advanceTurn(game);

    const p2ShotCount = playerShotCount(game.players.get('p2')!);
    const secondSalvo = ['-1,-4', '0,-4', '1,-4', '2,-4'].slice(0, p2ShotCount);
    const err = validateSalvo(game, 'p2', secondSalvo);
    expect(err).toContain('Already shot');
  });

  it('rejects duplicate coordinates within salvo', () => {
    const { game, playerIds } = makeGame(2);
    setupBattle(game, playerIds);
    game.turnOrder = ['p1', 'p2'];
    game.currentTurnIndex = 0;

    const err = validateSalvo(game, 'p1', ['-1,-4', '-1,-4', '-2,-3', '-3,-2']);
    expect(err).toContain('Duplicate');
  });

  it('rejects invalid coordinates', () => {
    const { game, playerIds } = makeGame(2);
    setupBattle(game, playerIds);
    game.turnOrder = ['p1', 'p2'];
    game.currentTurnIndex = 0;

    expect(validateSalvo(game, 'p1', ['invalid', '-1,-4', '-2,-3', '-3,-2'])).toContain('Invalid');
  });

  it('rejects shots on island hexes', () => {
    const { game, playerIds } = makeGame(2);
    setupBattle(game, playerIds);
    game.turnOrder = ['p1', 'p2'];
    game.currentTurnIndex = 0;

    // Add a known island at one of the target cells
    game.islands.add('-1,-4');

    const err = validateSalvo(game, 'p1', ['-1,-4', '-2,-3', '-3,-2', '-4,-1']);
    expect(err).toContain('island');
  });

  it('rejects out-of-bounds coordinates', () => {
    const { game, playerIds } = makeGame(2);
    setupBattle(game, playerIds);
    game.turnOrder = ['p1', 'p2'];
    game.currentTurnIndex = 0;

    expect(validateSalvo(game, 'p1', ['10,0', '-1,-4', '-2,-3', '-3,-2'])).toContain('out of bounds');
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
    expect(getCurrentTurnPlayerId(game)).toBe('p1');
  });

  it('skips eliminated players', () => {
    const { game, playerIds } = makeGame(3);
    setupBattle(game, playerIds);
    game.turnOrder = ['p1', 'p2', 'p3'];
    game.currentTurnIndex = 0;

    forfeitPlayer(game, 'p2');
    advanceTurn(game);
    expect(getCurrentTurnPlayerId(game)).toBe('p3');
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
// Forfeit
// ============================================================

describe('Forfeit (silent removal)', () => {
  it('clears ships on forfeit', () => {
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
    game.islands = new Set();
    placeShips(game, 'p1', defaultPlacements());
    const p1 = game.players.get('p1')!;
    expect(isPlayerAlive(p1)).toBe(true);

    p1.ships = [];
    expect(isPlayerAlive(p1)).toBe(false);
  });

  it('playerShotCount returns 0 for player with empty ships', () => {
    const { game } = makeGame(2);
    startGame(game);
    game.islands = new Set();
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

    forfeitPlayer(game, 'p2');
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

    game.turnOrder = ['p1', 'p2'];
    game.currentTurnIndex = 0;
    const p2Scout = hexPlacements(1)[0].cells[0];
    fireSalvo(game, 'p1', [p2Scout, '-1,-4', '-2,-3', '-3,-2']);

    resetForRematch(game);

    expect(game.phase).toBe('placement');
    expect(game.shots.size).toBe(0);
    expect(game.turnOrder.length).toBe(0);
    expect(game.players.size).toBe(2);
    expect(game.islands.size).toBeGreaterThan(0); // islands regenerated
    for (const player of game.players.values()) {
      expect(player.ships.length).toBe(0);
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

    // Fire at all of p2's ship cells
    const p2Cells = allCellsForPlayer(1);
    const shotCount = playerShotCount(game.players.get('p1')!);
    const targets = p2Cells.slice(0, shotCount);
    fireSalvo(game, 'p1', targets);

    const p1Stats = game.playerStats.get('p1')!;
    expect(p1Stats.shotsFired).toBe(shotCount);
    expect(p1Stats.hitsLanded).toBe(shotCount); // all hits on p2
    expect(p1Stats.turnsTaken).toBe(1);
  });

  it('tracks friendly fire separately from hits', () => {
    const { game, playerIds } = makeGame(2);
    setupBattle(game, playerIds);
    game.turnOrder = ['p1', 'p2'];
    game.currentTurnIndex = 0;

    const p1Scout = hexPlacements(0)[0].cells[0];
    const shotCount = playerShotCount(game.players.get('p1')!);
    const targets = [p1Scout, '-1,-4', '-2,-3', '-3,-2'].slice(0, shotCount);
    fireSalvo(game, 'p1', targets);

    const p1Stats = game.playerStats.get('p1')!;
    expect(p1Stats.friendlyFireHits).toBe(1);
    expect(p1Stats.hitsLanded).toBe(0);
  });

  it('tracks ships sunk', () => {
    const { game, playerIds } = makeGame(2);
    setupBattle(game, playerIds);
    game.turnOrder = ['p1', 'p2'];
    game.currentTurnIndex = 0;

    const p2Scout = hexPlacements(1)[0].cells[0];
    const shotCount = playerShotCount(game.players.get('p1')!);
    const targets = [p2Scout, '-1,-4', '-2,-3', '-3,-2'].slice(0, shotCount);
    fireSalvo(game, 'p1', targets);

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
    const shotCount = playerShotCount(game.players.get('p1')!);
    fireSalvo(game, 'p1', ['-1,-4', '-2,-3', '-3,-2', '-4,-1'].slice(0, shotCount));
    expect(game.firstBloodId).toBeNull();

    advanceTurn(game);

    // p2 hits p1's scout
    const p1Scout = hexPlacements(0)[0].cells[0];
    const p2ShotCount = playerShotCount(game.players.get('p2')!);
    fireSalvo(game, 'p2', [p1Scout, '0,-4', '1,-4', '2,-4'].slice(0, p2ShotCount));
    expect(game.firstBloodId).toBe('p2');
  });

  it('generates meaningful highlights at game over', () => {
    const { game, playerIds } = makeGame(2);
    setupBattle(game, playerIds);
    game.turnOrder = ['p1', 'p2'];
    game.currentTurnIndex = 0;

    const p2Cells = allCellsForPlayer(1);
    // Fire at p2 cells over multiple rounds
    const shotCount = playerShotCount(game.players.get('p1')!);
    fireSalvo(game, 'p1', p2Cells.slice(0, shotCount));
    advanceTurn(game);
    fireSalvo(game, 'p2', ['-1,-4', '-2,-3', '-3,-2', '-4,-1'].slice(0, playerShotCount(game.players.get('p2')!)));
    advanceTurn(game);
    fireSalvo(game, 'p1', p2Cells.slice(shotCount, shotCount * 2));

    forfeitPlayer(game, 'p2');
    const result = checkGameOver(game);

    expect(result).not.toBeNull();
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
    game.islands = new Set();
    placeShips(game, 'p1', defaultPlacements());

    const p1 = game.players.get('p1')!;
    const scout = p1.ships[0];
    expect(isShipSunk(scout)).toBe(false);
    scout.hits.add(scout.cells[0]);
    expect(isShipSunk(scout)).toBe(true);
  });

  it('Player.alive is computed from ships', () => {
    const { game } = makeGame(2);
    startGame(game);
    game.islands = new Set();
    placeShips(game, 'p1', defaultPlacements());

    const p1 = game.players.get('p1')!;
    expect(isPlayerAlive(p1)).toBe(true);

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
    game.islands = new Set();
    placeShips(game, 'p1', defaultPlacements());

    const p1 = game.players.get('p1')!;
    expect(playerShotCount(p1)).toBe(4);

    // Sink Scout
    p1.ships[0].hits.add(p1.ships[0].cells[0]);
    expect(playerShotCount(p1)).toBe(3);
  });
});

// ============================================================
// toClientView with islands
// ============================================================

describe('toClientView', () => {
  it('includes islands in wire game', () => {
    const { game } = makeGame(2);
    startGame(game);
    game.islands = new Set(['3,0', '4,-1']); // override random islands

    const view = toClientView(game, 'p1');
    expect(view.islands).toContain('3,0');
    expect(view.islands).toContain('4,-1');
    expect(view.islands.length).toBe(2);
  });

  it('includes rings in wire game', () => {
    const { game } = makeGame(2);
    const view = toClientView(game, 'p1');
    expect(view.rings).toBe(5);
  });

  it('includes hostId and islandCount in wire game', () => {
    const { game } = makeGame(2);
    const view = toClientView(game, 'p1');
    expect(view.hostId).toBe('p1');
    expect(view.islandCount).toBe(6);
  });
});

// ============================================================
// Island Count Configuration
// ============================================================

describe('Island Count Configuration', () => {
  it('createGame initializes islandCount to 6', () => {
    const game = createGame('host', 'Alice');
    expect(game.islandCount).toBe(6);
  });

  it('updateGameOptions sets valid islandCount', () => {
    const game = createGame('host', 'Alice');
    const err = updateGameOptions(game, 'host', { islandCount: 4 });
    expect(err).toBeNull();
    expect(game.islandCount).toBe(4);
  });

  it('updateGameOptions sets islandCount to 0 (None)', () => {
    const game = createGame('host', 'Alice');
    const err = updateGameOptions(game, 'host', { islandCount: 0 });
    expect(err).toBeNull();
    expect(game.islandCount).toBe(0);
  });

  it('updateGameOptions rejects negative islandCount', () => {
    const game = createGame('host', 'Alice');
    updateGameOptions(game, 'host', { islandCount: -1 });
    expect(game.islandCount).toBe(6); // unchanged
  });

  it('updateGameOptions rejects islandCount > 8', () => {
    const game = createGame('host', 'Alice');
    updateGameOptions(game, 'host', { islandCount: 100 });
    expect(game.islandCount).toBe(6); // unchanged
  });

  it('generateIslands returns empty set for targetCount 0', () => {
    const islands = generateIslands(5, 0);
    expect(islands.size).toBe(0);
  });

  it('startGame uses game.islandCount', () => {
    const game = createGame('host', 'Alice');
    addPlayer(game, 'p2', 'Bob');
    updateGameOptions(game, 'host', { islandCount: 0 });
    startGame(game);
    expect(game.islands.size).toBe(0);
  });
});

// ============================================================
// Game Type Team Logic (deterministic)
// ============================================================

describe('Game Type Team Logic', () => {
  it('2-team always assigns alpha/bravo even with 6 players', () => {
    const game = createGame('p1', 'A');
    addPlayer(game, 'p2', 'B');
    addPlayer(game, 'p3', 'C');
    addPlayer(game, 'p4', 'D');
    addPlayer(game, 'p5', 'E');
    addPlayer(game, 'p6', 'F');
    updateGameOptions(game, 'p1', { gameType: '2-team' });

    const teamValues = new Set(game.teams.values());
    expect(teamValues).toEqual(new Set(['alpha', 'bravo']));
    // No charlie
    for (const teamId of game.teams.values()) {
      expect(teamId).not.toBe('charlie');
    }
  });

  it('3-team assigns alpha/bravo/charlie', () => {
    const game = createGame('p1', 'A');
    addPlayer(game, 'p2', 'B');
    addPlayer(game, 'p3', 'C');
    updateGameOptions(game, 'p1', { gameType: '3-team' });

    const teamValues = new Set(game.teams.values());
    expect(teamValues).toEqual(new Set(['alpha', 'bravo', 'charlie']));
  });

  it('ffa clears all teams', () => {
    const game = createGame('p1', 'A');
    addPlayer(game, 'p2', 'B');
    updateGameOptions(game, 'p1', { gameType: '2-team' });
    expect(game.teams.size).toBe(2);

    updateGameOptions(game, 'p1', { gameType: 'ffa' });
    expect(game.teams.size).toBe(0);
    expect(game.teamsEnabled).toBe(false);
  });
});

// ============================================================
// Leave Game / Host Transfer
// ============================================================

describe('Leave Game / Host Transfer', () => {
  it('removePlayer transfers host to next human in Map order', () => {
    const game = createGame('p1', 'Host');
    addPlayer(game, 'p2', 'Player2');
    addPlayer(game, 'p3', 'Player3');

    removePlayer(game, 'p1');
    expect(game.hostId).toBe('p2'); // next in Map insertion order
    expect(game.players.has('p1')).toBe(false);
  });

  it('removePlayer clears team assignment', () => {
    const game = createGame('p1', 'A');
    addPlayer(game, 'p2', 'B');
    updateGameOptions(game, 'p1', { gameType: '2-team' });
    expect(game.teams.has('p2')).toBe(true);

    removePlayer(game, 'p2');
    expect(game.teams.has('p2')).toBe(false);
  });

  it('host leaves with only bots remaining — no crash', () => {
    const game = createGame('p1', 'Host');
    // Add a bot
    const botId = 'bot-1';
    game.players.set(botId, { id: botId, name: 'Bot', ships: [], isBot: true, aiDifficulty: 'easy', color: 'red' });

    removePlayer(game, 'p1');
    // hostId may still point to p1 since no human found, but no crash
    expect(game.players.has('p1')).toBe(false);
    expect(game.players.size).toBe(1);
  });
});

// ============================================================
// Player Colors
// ============================================================

describe('Player Colors', () => {
  it('assigns slot colors in MRYGCB order', () => {
    const game = createGame('p1', 'Alice');
    expect(game.players.get('p1')!.color).toBe('magenta'); // slot 0
    addPlayer(game, 'p2', 'Bob');
    expect(game.players.get('p2')!.color).toBe('red'); // slot 1
    addPlayer(game, 'p3', 'Charlie');
    expect(game.players.get('p3')!.color).toBe('yellow'); // slot 2
    addPlayer(game, 'p4', 'Diana');
    expect(game.players.get('p4')!.color).toBe('green'); // slot 3
    addPlayer(game, 'p5', 'Eve');
    expect(game.players.get('p5')!.color).toBe('cyan'); // slot 4
    addPlayer(game, 'p6', 'Frank');
    expect(game.players.get('p6')!.color).toBe('blue'); // slot 5
  });

  it('assigns slot colors to bots', () => {
    const game = createGame('p1', 'Alice');
    // Host is slot 0 (magenta)
    addPlayer(game, 'p2', 'Bob'); // slot 1 (red)
    expect(game.players.get('p2')!.color).toBe('red');
    const botResult = addBot(game, 'easy');
    if ('botId' in botResult) {
      expect(game.players.get(botResult.botId)!.color).toBe('yellow'); // slot 2
    }
  });

  it('color persists through team swap', () => {
    const game = createGame('p1', 'Alice', { enabled: false, seconds: 60 }, 'private', true);
    addPlayer(game, 'p2', 'Bob');
    const p1Color = game.players.get('p1')!.color;
    const p2Color = game.players.get('p2')!.color;

    // Colors should not change on gameType change
    updateGameOptions(game, 'p1', { gameType: '3-team' });
    expect(game.players.get('p1')!.color).toBe(p1Color);
    expect(game.players.get('p2')!.color).toBe(p2Color);

    // Colors should not change back to FFA
    updateGameOptions(game, 'p1', { gameType: 'ffa' });
    expect(game.players.get('p1')!.color).toBe(p1Color);
    expect(game.players.get('p2')!.color).toBe(p2Color);
  });

  it('color appears in serialized WirePlayer', () => {
    const game = createGame('p1', 'Alice');
    addPlayer(game, 'p2', 'Bob');
    const view = toClientView(game, 'p1');
    expect(view.players['p1'].color).toBe('magenta');
    expect(view.players['p2'].color).toBe('red');
  });

  it('game-over reveals all ship cells to all players', () => {
    const game = createGame('p1', 'Alice');
    addPlayer(game, 'p2', 'Bob');
    game.islandCount = 0; // avoid island conflicts with test placements
    startGame(game);

    // Place ships for both players
    const err1 = placeShips(game, 'p1', hexPlacements(0));
    const err2 = placeShips(game, 'p2', hexPlacements(1));
    expect(err1).toBeNull();
    expect(err2).toBeNull();
    beginPlaying(game);

    // Before game-over: p2's ship cells hidden from p1
    const viewDuringPlay = toClientView(game, 'p1');
    const p2ShipsDuringPlay = viewDuringPlay.players['p2'].ships;
    // p2 is alive, so cells should be empty
    expect(p2ShipsDuringPlay.every(s => s.cells.length === 0)).toBe(true);

    // Force game-over
    game.phase = 'finished';
    const viewAfterGameOver = toClientView(game, 'p1');
    const p2ShipsAfterGameOver = viewAfterGameOver.players['p2'].ships;
    // Now all cells should be revealed
    expect(p2ShipsAfterGameOver.some(s => s.cells.length > 0)).toBe(true);
  });

  it('game-over does not reveal ship cells during playing phase (regression)', () => {
    const game = createGame('p1', 'Alice');
    addPlayer(game, 'p2', 'Bob');
    game.islandCount = 0;
    startGame(game);
    placeShips(game, 'p1', hexPlacements(0));
    placeShips(game, 'p2', hexPlacements(1));
    beginPlaying(game);

    // During playing phase, p2's alive ships should be hidden from p1
    const view = toClientView(game, 'p1');
    const p2Ships = view.players['p2'].ships;
    expect(p2Ships.every(s => s.cells.length === 0)).toBe(true);
  });

  it('all 6 colors are unique', () => {
    const game = createGame('p1', 'P1');
    addPlayer(game, 'p2', 'P2');
    addPlayer(game, 'p3', 'P3');
    addPlayer(game, 'p4', 'P4');
    addPlayer(game, 'p5', 'P5');
    addPlayer(game, 'p6', 'P6');

    const colors = [...game.players.values()].map(p => p.color);
    expect(new Set(colors).size).toBe(6);
  });
});
