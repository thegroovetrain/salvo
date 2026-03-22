import { describe, it, expect } from 'vitest';
import {
  createGame, addPlayer, startGame, placeShips,
  allShipsPlaced, beginPlaying, toClientView,
  fireSalvo, forfeitPlayer,
} from '../game.js';
import type { Game, ShipPlacement, WireGame } from '@salvo/shared';

// ============================================================
// toClientView Security Tests
//
// SECURITY BOUNDARY: toClientView is the single chokepoint for
// all outbound state. Each player must only see their own ship
// positions. Other players' ship cells must NEVER be revealed.
// ============================================================

function setup2PlayerGame(): { game: Game; p1Ships: ShipPlacement[]; p2Ships: ShipPlacement[] } {
  const game = createGame('p1', 'Alice', { enabled: false, seconds: 60 });
  addPlayer(game, 'p2', 'Bob');
  startGame(game);

  const p1Ships: ShipPlacement[] = [
    { length: 1, cells: ['A1'] },
    { length: 2, cells: ['B1', 'B2'] },
    { length: 3, cells: ['C1', 'C2', 'C3'] },
    { length: 4, cells: ['D1', 'D2', 'D3', 'D4'] },
  ];

  const p2Ships: ShipPlacement[] = [
    { length: 1, cells: ['E5'] },
    { length: 2, cells: ['F5', 'F6'] },
    { length: 3, cells: ['G5', 'G6', 'G7'] },
    { length: 4, cells: ['H5', 'H6', 'H7', 'H8'] },
  ];

  placeShips(game, 'p1', p1Ships);
  placeShips(game, 'p2', p2Ships);
  beginPlaying(game);

  return { game, p1Ships, p2Ships };
}

describe('toClientView Security — Ship Position Leakage', () => {
  it('player can see their own ship positions', () => {
    const { game, p1Ships } = setup2PlayerGame();
    const view = toClientView(game, 'p1');

    const myShips = view.players['p1'].ships;
    expect(myShips.length).toBe(4);

    // All cells should be populated for own ships
    for (let i = 0; i < p1Ships.length; i++) {
      expect(myShips[i].cells).toEqual(p1Ships[i].cells);
    }
  });

  it('player CANNOT see other players ship positions', () => {
    const { game, p2Ships } = setup2PlayerGame();
    const view = toClientView(game, 'p1');

    const otherShips = view.players['p2'].ships;
    expect(otherShips.length).toBe(4);

    // All cells arrays must be empty — positions hidden
    for (const ship of otherShips) {
      expect(ship.cells).toEqual([]);
      expect(ship.cells.length).toBe(0);
    }
  });

  it('other players ship cells are empty even when partially hit', () => {
    const { game } = setup2PlayerGame();
    game.turnOrder = ['p1', 'p2'];
    game.currentTurnIndex = 0;

    // Hit one of p2's ships
    fireSalvo(game, 'p1', ['E5', 'J1', 'J2', 'J3']);

    const view = toClientView(game, 'p1');
    const otherShips = view.players['p2'].ships;

    for (const ship of otherShips) {
      expect(ship.cells).toEqual([]);
    }
  });

  it('other players ship cells are empty even when sunk', () => {
    const { game } = setup2PlayerGame();
    game.turnOrder = ['p1', 'p2'];
    game.currentTurnIndex = 0;

    // Sink p2's Scout (1 cell at E5)
    fireSalvo(game, 'p1', ['E5', 'J1', 'J2', 'J3']);

    const view = toClientView(game, 'p1');
    const p2Ships = view.players['p2'].ships;
    const sunkShip = p2Ships.find(s => s.sunk);

    expect(sunkShip).toBeDefined();
    expect(sunkShip!.cells).toEqual([]); // still hidden
  });

  it('global shots are visible to all players', () => {
    const { game } = setup2PlayerGame();
    game.turnOrder = ['p1', 'p2'];
    game.currentTurnIndex = 0;

    fireSalvo(game, 'p1', ['E5', 'J1', 'J2', 'J3']);

    const viewP1 = toClientView(game, 'p1');
    const viewP2 = toClientView(game, 'p2');

    expect(viewP1.shots).toContain('E5');
    expect(viewP1.shots).toContain('J1');
    expect(viewP2.shots).toContain('E5');
    expect(viewP2.shots).toContain('J1');
  });

  it('own ship hit info is visible (friendly fire)', () => {
    const { game } = setup2PlayerGame();
    game.turnOrder = ['p1', 'p2'];
    game.currentTurnIndex = 0;

    // p1 hits own ship at A1 (self-hit)
    fireSalvo(game, 'p1', ['A1', 'J1', 'J2', 'J3']);

    const view = toClientView(game, 'p1');
    const myScout = view.players['p1'].ships[0];

    expect(myScout.hits).toContain('A1');
    expect(myScout.sunk).toBe(true);
  });

  it('view is different per player — each sees only their ships', () => {
    const { game, p1Ships, p2Ships } = setup2PlayerGame();

    const viewP1 = toClientView(game, 'p1');
    const viewP2 = toClientView(game, 'p2');

    // p1's view: own ships have cells, p2's don't
    expect(viewP1.players['p1'].ships[0].cells.length).toBeGreaterThan(0);
    expect(viewP1.players['p2'].ships[0].cells.length).toBe(0);

    // p2's view: own ships have cells, p1's don't
    expect(viewP2.players['p2'].ships[0].cells.length).toBeGreaterThan(0);
    expect(viewP2.players['p1'].ships[0].cells.length).toBe(0);
  });

  it('forfeited player ships do not leak positions', () => {
    const { game } = setup2PlayerGame();

    forfeitPlayer(game, 'p2');

    const view = toClientView(game, 'p1');
    const p2Ships = view.players['p2'].ships;

    // Even after forfeit, cells should be empty
    for (const ship of p2Ships) {
      expect(ship.cells).toEqual([]);
    }

    // But sunk should be true
    for (const ship of p2Ships) {
      expect(ship.sunk).toBe(true);
    }
  });

  it('all ship metadata is present (length, sunk status)', () => {
    const { game } = setup2PlayerGame();

    const view = toClientView(game, 'p1');

    // Other player's ships have length and sunk info even without cells
    const p2Ships = view.players['p2'].ships;
    expect(p2Ships.map(s => s.length).sort()).toEqual([1, 2, 3, 4]);
    expect(p2Ships.every(s => typeof s.sunk === 'boolean')).toBe(true);
  });
});

describe('toClientView — Game State Integrity', () => {
  it('includes correct phase', () => {
    const { game } = setup2PlayerGame();
    expect(toClientView(game, 'p1').phase).toBe('playing');
  });

  it('includes turn order', () => {
    const { game } = setup2PlayerGame();
    const view = toClientView(game, 'p1');
    expect(view.turnOrder.length).toBe(2);
    expect(view.turnOrder).toContain('p1');
    expect(view.turnOrder).toContain('p2');
  });

  it('includes alive and shotCount for all players', () => {
    const { game } = setup2PlayerGame();
    const view = toClientView(game, 'p1');

    for (const player of Object.values(view.players)) {
      expect(player.alive).toBe(true);
      expect(player.shotCount).toBe(4);
    }
  });

  it('reflects eliminated player state', () => {
    const { game } = setup2PlayerGame();
    forfeitPlayer(game, 'p2');

    const view = toClientView(game, 'p1');
    expect(view.players['p2'].alive).toBe(false);
    expect(view.players['p2'].shotCount).toBe(0);
  });
});
