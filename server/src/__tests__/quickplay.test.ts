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

  it('createGame accepts quickplay mode', () => {
    const game = createGame('p1', 'Alice', { enabled: true, seconds: 60 }, 'quickplay');
    expect(game.mode).toBe('quickplay');
    expect(game.timerConfig).toEqual({ enabled: true, seconds: 60 });
  });

  it('toClientView includes mode and rings', () => {
    const game = createGame('p1', 'Alice', { enabled: true, seconds: 60 }, 'quickplay');
    const view = toClientView(game, 'p1');
    expect(view.mode).toBe('quickplay');
    expect(typeof view.rings).toBe('number');
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
  it('returns zeros when no games exist', () => {
    const lobby = new LobbyManager();
    const counts = lobby.getActiveGameCounts();
    expect(counts.total).toBe(0);
    expect(counts.searching).toBe(0);
  });

  it('counts quickplay games', () => {
    const lobby = new LobbyManager();
    const game = createGame('p1', 'Alice', { enabled: true, seconds: 60 }, 'quickplay');
    lobby.addGame(game, 'ABCD');
    const counts = lobby.getActiveGameCounts();
    expect(counts.total).toBe(1);
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
    const game = createGame('p1', 'Alice', { enabled: true, seconds: 60 }, 'quickplay');
    game.phase = 'finished';
    lobby.addGame(game, 'MNOP');
    const counts = lobby.getActiveGameCounts();
    expect(counts.total).toBe(0);
  });

  it('passes through searching count', () => {
    const lobby = new LobbyManager();
    const counts = lobby.getActiveGameCounts(5);
    expect(counts.searching).toBe(5);
  });

  it('counts mixed game modes correctly', () => {
    const lobby = new LobbyManager();
    const g1 = createGame('p1', 'A', { enabled: true, seconds: 60 }, 'quickplay');
    const g2 = createGame('p2', 'B', { enabled: true, seconds: 60 }, 'quickplay');
    const g3 = createGame('p3', 'C', { enabled: true, seconds: 60 }, 'quickplay');
    const g4 = createGame('p4', 'D', { enabled: false, seconds: 60 }); // private
    lobby.addGame(g1, 'A001');
    lobby.addGame(g2, 'A002');
    lobby.addGame(g3, 'A003');
    lobby.addGame(g4, 'A004');
    const counts = lobby.getActiveGameCounts(1);
    expect(counts.total).toBe(3);
    expect(counts.searching).toBe(1);
  });
});
