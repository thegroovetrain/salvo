import { describe, it, expect } from 'vitest';
import { createGame, addPlayer, toClientView } from '../game.js';
import { LobbyManager } from '../lobby.js';
import type { Game } from '@salvo/shared';

// ============================================================
// Quick Play — Game Creation & Mode
// ============================================================

describe('Quick Play game creation', () => {
  it('createGame defaults to private mode', () => {
    const game = createGame('p1', 'Alice', { enabled: false, seconds: 60 });
    expect(game.mode).toBe('private');
  });

  it('createGame accepts quickplay-1v1 mode', () => {
    const game = createGame('p1', 'Alice', { enabled: true, seconds: 60 }, 'quickplay-1v1');
    expect(game.mode).toBe('quickplay-1v1');
    expect(game.timerConfig).toEqual({ enabled: true, seconds: 60 });
  });

  it('createGame accepts quickplay-ffa mode', () => {
    const game = createGame('p1', 'Alice', { enabled: true, seconds: 60 }, 'quickplay-ffa');
    expect(game.mode).toBe('quickplay-ffa');
  });

  it('createGame accepts new game modes', () => {
    expect(createGame('p1', 'A', { enabled: true, seconds: 60 }, 'quickplay-3v3').mode).toBe('quickplay-3v3');
    expect(createGame('p1', 'A', { enabled: true, seconds: 60 }, 'quickplay-3ffa').mode).toBe('quickplay-3ffa');
    expect(createGame('p1', 'A', { enabled: true, seconds: 60 }, 'quickplay-6ffa').mode).toBe('quickplay-6ffa');
    expect(createGame('p1', 'A', { enabled: true, seconds: 60 }, 'quickplay-2v2v2').mode).toBe('quickplay-2v2v2');
  });

  it('6-player modes default to 6 rings', () => {
    const g3v3 = createGame('p1', 'A', { enabled: true, seconds: 60 }, 'quickplay-3v3');
    expect(g3v3.rings).toBe(6);
    const g6ffa = createGame('p1', 'A', { enabled: true, seconds: 60 }, 'quickplay-6ffa');
    expect(g6ffa.rings).toBe(6);
    const g2v2v2 = createGame('p1', 'A', { enabled: true, seconds: 60 }, 'quickplay-2v2v2');
    expect(g2v2v2.rings).toBe(6);
  });

  it('2-4 player modes default to 5 rings', () => {
    expect(createGame('p1', 'A', { enabled: true, seconds: 60 }, 'quickplay-1v1').rings).toBe(5);
    expect(createGame('p1', 'A', { enabled: true, seconds: 60 }, 'quickplay-2v2').rings).toBe(5);
    expect(createGame('p1', 'A', { enabled: true, seconds: 60 }, 'quickplay-3ffa').rings).toBe(5);
  });

  it('toClientView includes mode and rings', () => {
    const game = createGame('p1', 'Alice', { enabled: true, seconds: 60 }, 'quickplay-ffa');
    const view = toClientView(game, 'p1');
    expect(view.mode).toBe('quickplay-ffa');
    expect(view.rings).toBe(5);
  });

  it('toClientView includes mode=private for default games', () => {
    const game = createGame('p1', 'Alice', { enabled: false, seconds: 60 });
    const view = toClientView(game, 'p1');
    expect(view.mode).toBe('private');
  });

  it('createGame accepts custom ring count', () => {
    const game = createGame('p1', 'Alice', { enabled: false, seconds: 60 }, 'private', false, 4);
    expect(game.rings).toBe(4);
  });
});

// ============================================================
// Quick Play — LobbyManager.getActiveGameCounts()
// ============================================================

describe('LobbyManager.getActiveGameCounts', () => {
  it('returns all zeros when no games exist', () => {
    const lobby = new LobbyManager();
    const counts = lobby.getActiveGameCounts();
    expect(counts.total).toBe(0);
    expect(counts.oneVsOne).toBe(0);
    expect(counts.twoVsTwo).toBe(0);
    expect(counts.ffa).toBe(0);
    expect(counts.threeVsThree).toBe(0);
    expect(counts.threeFfa).toBe(0);
    expect(counts.sixFfa).toBe(0);
    expect(counts.twoVsTwoVsTwo).toBe(0);
  });

  it('counts quickplay-1v1 games', () => {
    const lobby = new LobbyManager();
    const game = createGame('p1', 'Alice', { enabled: true, seconds: 60 }, 'quickplay-1v1');
    lobby.addGame(game, 'ABCD');
    const counts = lobby.getActiveGameCounts();
    expect(counts.oneVsOne).toBe(1);
    expect(counts.total).toBe(1);
  });

  it('counts quickplay-ffa games', () => {
    const lobby = new LobbyManager();
    const game = createGame('p1', 'Alice', { enabled: true, seconds: 60 }, 'quickplay-ffa');
    lobby.addGame(game, 'EFGH');
    const counts = lobby.getActiveGameCounts();
    expect(counts.ffa).toBe(1);
    expect(counts.total).toBe(1);
  });

  it('counts new game modes', () => {
    const lobby = new LobbyManager();
    lobby.addGame(createGame('p1', 'A', { enabled: true, seconds: 60 }, 'quickplay-3v3'), 'A001');
    lobby.addGame(createGame('p2', 'B', { enabled: true, seconds: 60 }, 'quickplay-2v2v2'), 'A002');
    const counts = lobby.getActiveGameCounts();
    expect(counts.threeVsThree).toBe(1);
    expect(counts.twoVsTwoVsTwo).toBe(1);
    expect(counts.total).toBe(2);
  });

  it('does not count private games', () => {
    const lobby = new LobbyManager();
    const game = createGame('p1', 'Alice', { enabled: false, seconds: 60 });
    lobby.addGame(game, 'IJKL');
    const counts = lobby.getActiveGameCounts();
    expect(counts.total).toBe(0);
  });

  it('does not count finished games', () => {
    const lobby = new LobbyManager();
    const game = createGame('p1', 'Alice', { enabled: true, seconds: 60 }, 'quickplay-1v1');
    game.phase = 'finished';
    lobby.addGame(game, 'MNOP');
    const counts = lobby.getActiveGameCounts();
    expect(counts.total).toBe(0);
  });

  it('passes through searching counts', () => {
    const lobby = new LobbyManager();
    const counts = lobby.getActiveGameCounts(3, 0, 5);
    expect(counts.searching1v1).toBe(3);
    expect(counts.searching2v2).toBe(0);
    expect(counts.searchingFfa).toBe(5);
  });

  it('counts mixed game modes correctly', () => {
    const lobby = new LobbyManager();
    const g1 = createGame('p1', 'A', { enabled: true, seconds: 60 }, 'quickplay-1v1');
    const g2 = createGame('p2', 'B', { enabled: true, seconds: 60 }, 'quickplay-ffa');
    const g3 = createGame('p3', 'C', { enabled: true, seconds: 60 }, 'quickplay-ffa');
    const g4 = createGame('p4', 'D', { enabled: false, seconds: 60 }); // private
    lobby.addGame(g1, 'A001');
    lobby.addGame(g2, 'A002');
    lobby.addGame(g3, 'A003');
    lobby.addGame(g4, 'A004');
    const counts = lobby.getActiveGameCounts(1, 0, 2);
    expect(counts.oneVsOne).toBe(1);
    expect(counts.twoVsTwo).toBe(0);
    expect(counts.ffa).toBe(2);
    expect(counts.total).toBe(3);
    expect(counts.searching1v1).toBe(1);
  });
});
