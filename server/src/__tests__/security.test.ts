import { describe, it, expect } from 'vitest';
import {
  toClientView, fireSalvo, eliminatePlayer,
} from '../game.js';
import type { WireGame } from '@salvo/shared';
import { makeGame, hexPlacements, allCellsForPlayer, setupBattle } from './helpers.js';

// ============================================================
// toClientView Security Tests
//
// SECURITY BOUNDARY: toClientView is the single chokepoint for
// all outbound state. Each player must only see their own ship
// positions. Other players' ship cells must NEVER be revealed.
// ============================================================

// Player 0 ship cells: '-4,0'/'-3,0' (patrol), '-2,0'/'-1,0'/'0,0' (destroyer), '1,0'/'2,0'/'3,0'/'4,0' (frigate)
// Player 1 ship cells: '-5,1'/'-4,1' (patrol), '-3,1'/'-2,1'/'-1,1' (destroyer), '0,1'/'1,1'/'2,1'/'3,1' (frigate)
// Safe empty cells (no ships): '-1,-4', '-2,-3', '-3,-2'

function setup2PlayerGame() {
  const { game, playerIds } = makeGame(2);
  setupBattle(game, playerIds);

  const p1Ships = hexPlacements(0);
  const p2Ships = hexPlacements(1);

  return { game, p1Ships, p2Ships };
}

describe('toClientView Security — Ship Position Leakage', () => {
  it('player can see their own ship positions', () => {
    const { game, p1Ships } = setup2PlayerGame();
    const view = toClientView(game, 'p1');

    const myShips = view.players['p1'].ships;
    expect(myShips.length).toBe(3);

    // All cells should be populated for own ships
    for (let i = 0; i < p1Ships.length; i++) {
      expect(myShips[i].cells).toEqual(p1Ships[i].cells);
    }
  });

  it('player CANNOT see other players ship positions', () => {
    const { game, p2Ships } = setup2PlayerGame();
    const view = toClientView(game, 'p1');

    const otherShips = view.players['p2'].ships;
    expect(otherShips.length).toBe(3);

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

    // Hit one of p2's ships (patrol cell at -5,1) + 2 empty cells
    fireSalvo(game, 'p1', ['-5,1', '-1,-4', '-2,-3']);

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

    // Sink p2's patrol (2 cells at -5,1 and -4,1) — need 2 salvos
    fireSalvo(game, 'p1', ['-5,1', '-4,1', '-1,-4']);

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

    fireSalvo(game, 'p1', ['-5,1', '-1,-4', '-2,-3']);

    const viewP1 = toClientView(game, 'p1');
    const viewP2 = toClientView(game, 'p2');

    expect(viewP1.shots).toContain('-5,1');
    expect(viewP1.shots).toContain('-1,-4');
    expect(viewP2.shots).toContain('-5,1');
    expect(viewP2.shots).toContain('-1,-4');
  });

  it('own ship hit info is visible (friendly fire)', () => {
    const { game } = setup2PlayerGame();
    game.turnOrder = ['p1', 'p2'];
    game.currentTurnIndex = 0;

    // p1 hits own ship at -4,0 and -3,0 (self-hit patrol, both cells to sink) + 1 empty
    fireSalvo(game, 'p1', ['-4,0', '-3,0', '-1,-4']);

    const view = toClientView(game, 'p1');
    const myPatrol = view.players['p1'].ships[0];

    expect(myPatrol.hits).toContain('-4,0');
    expect(myPatrol.sunk).toBe(true);
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

  it('eliminated player ships do not leak positions (silent removal)', () => {
    const { game } = setup2PlayerGame();

    eliminatePlayer(game, 'p2');

    const view = toClientView(game, 'p1');
    const p2Ships = view.players['p2'].ships;

    // After silent elimination, ships array should be empty — no cells/hits to leak
    expect(p2Ships).toEqual([]);
  });

  it('toClientView shows eliminated player as not alive with 0 shots', () => {
    const { game } = setup2PlayerGame();

    eliminatePlayer(game, 'p2');

    const view = toClientView(game, 'p1');
    expect(view.players['p2'].alive).toBe(false);
    expect(view.players['p2'].shotCount).toBe(0);
  });

  it('all ship metadata is present (length, sunk status)', () => {
    const { game } = setup2PlayerGame();

    const view = toClientView(game, 'p1');

    // Other player's ships have length and sunk info even without cells
    const p2Ships = view.players['p2'].ships;
    expect(p2Ships.map(s => s.length).sort()).toEqual([2, 3, 4]);
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
      expect(player.shotCount).toBe(3);
    }
  });

  it('reflects eliminated player state', () => {
    const { game } = setup2PlayerGame();
    eliminatePlayer(game, 'p2');

    const view = toClientView(game, 'p1');
    expect(view.players['p2'].alive).toBe(false);
    expect(view.players['p2'].shotCount).toBe(0);
  });
});
