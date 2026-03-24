import { describe, it, expect, beforeEach } from 'vitest';
import {
  createGame, addPlayer, startGame, placeShips, beginPlaying,
  allShipsPlaced, forfeitPlayer, getCurrentTurnPlayerId,
  advanceTurn, checkGameOver, removePlayer, toClientView,
} from '../game.js';
import { ConnectionManager } from '../connections.js';
import type { Game, ShipPlacement } from '@salvo/shared';
import { isPlayerAlive } from '@salvo/shared';
import { makeGame, hexPlacements, allCellsForPlayer, setupBattle } from './helpers.js';

// ============================================================
// Surrender — Pure Game Logic Integration
// (Tests the handlePlayerExit flow as pure functions)
// ============================================================

describe('Surrender during playing phase', () => {
  it('surrender (not their turn) forfeits without advancing turn', () => {
    const { game, playerIds } = makeGame(3);
    setupBattle(game, playerIds);
    game.turnOrder = ['p1', 'p2', 'p3'];
    game.currentTurnIndex = 0; // p1's turn

    // p2 surrenders (not their turn)
    forfeitPlayer(game, 'p2');
    expect(game.players.get('p2')!.ships).toEqual([]);
    expect(isPlayerAlive(game.players.get('p2')!)).toBe(false);

    // Turn should still be p1's
    expect(getCurrentTurnPlayerId(game)).toBe('p1');

    // Game should not be over (p1 and p3 still alive)
    expect(checkGameOver(game)).toBeNull();
  });

  it('surrender (their turn) requires advanceTurn before removePlayer', () => {
    const { game, playerIds } = makeGame(3);
    setupBattle(game, playerIds);
    game.turnOrder = ['p1', 'p2', 'p3'];
    game.currentTurnIndex = 1; // p2's turn

    // p2 surrenders on their own turn
    forfeitPlayer(game, 'p2');

    // Before removing, advanceTurn should skip to p3
    advanceTurn(game);
    expect(getCurrentTurnPlayerId(game)).toBe('p3');

    // Now safe to remove
    removePlayer(game, 'p2');
    expect(game.players.has('p2')).toBe(false);
  });

  it('surrender triggers game-over when only 1 player remains', () => {
    const { game, playerIds } = makeGame(2);
    setupBattle(game, playerIds);

    forfeitPlayer(game, 'p2');
    const result = checkGameOver(game);

    expect(result).not.toBeNull();
    expect(result!.winnerId).toBe('p1');
    expect(game.phase).toBe('finished');
  });

  it('surrender in 3-player game does not end game', () => {
    const { game, playerIds } = makeGame(3);
    setupBattle(game, playerIds);

    forfeitPlayer(game, 'p3');
    const result = checkGameOver(game);
    expect(result).toBeNull();
    expect(game.phase).toBe('playing');
  });
});

describe('Surrender during placement phase', () => {
  it('removePlayer during placement works cleanly', () => {
    const { game } = makeGame(3);
    startGame(game);
    game.islands = new Set();
    expect(game.phase).toBe('placement');

    removePlayer(game, 'p3');
    expect(game.players.size).toBe(2);
    expect(game.players.has('p3')).toBe(false);
  });

  it('host reassignment when host surrenders', () => {
    const { game } = makeGame(3);
    startGame(game);
    game.islands = new Set();

    removePlayer(game, 'p1'); // p1 is host
    expect(game.hostId).toBe('p2'); // reassigned to next human
  });
});

describe('Surrender — toClientView security', () => {
  it('other players see empty ships array after surrender', () => {
    const { game, playerIds } = makeGame(2);
    setupBattle(game, playerIds);

    forfeitPlayer(game, 'p2');

    const view = toClientView(game, 'p1');
    expect(view.players['p2'].ships).toEqual([]);
    expect(view.players['p2'].alive).toBe(false);
    expect(view.players['p2'].shotCount).toBe(0);
  });

  it('surrendered player sees their own empty ships', () => {
    const { game, playerIds } = makeGame(2);
    setupBattle(game, playerIds);

    forfeitPlayer(game, 'p1');

    const view = toClientView(game, 'p1');
    expect(view.players['p1'].ships).toEqual([]);
    expect(view.players['p1'].alive).toBe(false);
  });

  it('no board cells are marked as hit after surrender', () => {
    const { game, playerIds } = makeGame(2);
    setupBattle(game, playerIds);

    const shotsBefore = game.shots.size;
    forfeitPlayer(game, 'p2');
    const shotsAfter = game.shots.size;

    // Silent forfeit should not add any shots to the global shot set
    expect(shotsAfter).toBe(shotsBefore);
  });
});

describe('ConnectionManager — surrender cleanup', () => {
  it('remove() cleans up disconnected player', () => {
    const cm = new ConnectionManager();
    cm.register('player1', 'socket1', 'game1');

    cm.handleDisconnect('socket1');

    // Player surrenders — immediate cleanup
    cm.remove('player1');

    // Verify the player is gone
    expect(cm.getSocketId('player1')).toBeUndefined();
    expect(cm.getPlayerIdBySocket('socket1')).toBeUndefined();
  });

  it('getDisconnectTimeRemaining returns time for disconnected player', () => {
    const cm = new ConnectionManager();
    cm.register('player1', 'socket1', 'game1');
    cm.handleDisconnect('socket1');

    const remaining = cm.getDisconnectTimeRemaining('player1');
    expect(remaining).not.toBeNull();
    expect(remaining!).toBeGreaterThan(0);
    expect(remaining!).toBeLessThanOrEqual(60);

    // Cleanup
    cm.remove('player1');
  });

  it('getDisconnectTimeRemaining returns null for connected player', () => {
    const cm = new ConnectionManager();
    cm.register('player1', 'socket1', 'game1');

    expect(cm.getDisconnectTimeRemaining('player1')).toBeNull();
  });

  it('getDisconnectTimeRemaining returns null for unknown player', () => {
    const cm = new ConnectionManager();
    expect(cm.getDisconnectTimeRemaining('nonexistent')).toBeNull();
  });
});
