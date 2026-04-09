import { describe, it, expect } from 'vitest';
import {
  createGame, addPlayer, addBot, removeBot, removePlayer,
  canStartGame, toClientView, resetGameToLobby,
} from '../game.js';
import { getLobbyCapabilities } from '../capabilities.js';
import { generateGloballyUniqueCode, resolveJoinCode } from '../joinCode.js';
import type { Game } from '@salvo/shared';

function makeGame(playerCount: number): { game: Game; playerIds: string[] } {
  const game = createGame('p1', 'Player 1', { enabled: false, seconds: 60 });
  const playerIds = ['p1'];
  for (let i = 2; i <= playerCount; i++) {
    const id = `p${i}`;
    addPlayer(game, id, `Player ${i}`);
    playerIds.push(id);
  }
  return { game, playerIds };
}

// ============================================================
// Capabilities
// ============================================================

describe('LobbyCapabilities', () => {
  it('host gets full capabilities', () => {
    const { game } = makeGame(2);
    const caps = getLobbyCapabilities(game, 'p1');
    expect(caps.canChangeOptions).toBe(true);
    expect(caps.canAddBot).toBe(true);
    expect(caps.canKick).toBe(true);
    expect(caps.canTransferHost).toBe(true);
    expect(caps.canToggleReady).toBe(true);
    expect(caps.canMoveToSlot).toBe(true);
    expect(caps.canRequestSwap).toBe(true);
  });

  it('non-host gets limited capabilities', () => {
    const { game } = makeGame(2);
    const caps = getLobbyCapabilities(game, 'p2');
    expect(caps.canChangeOptions).toBe(false);
    expect(caps.canAddBot).toBe(false);
    expect(caps.canKick).toBe(false);
    expect(caps.canTransferHost).toBe(false);
    expect(caps.canToggleReady).toBe(true);
    expect(caps.canMoveToSlot).toBe(true);
    expect(caps.canRequestSwap).toBe(true);
  });

  it('canStart is false until host is ready', () => {
    const { game } = makeGame(2);
    expect(getLobbyCapabilities(game, 'p1').canStart).toBe(false);
    game.readyStates.set('p1', true);
    expect(getLobbyCapabilities(game, 'p1').canStart).toBe(true);
  });

  it('allPlayersReady tracks all human players', () => {
    const { game } = makeGame(3);
    expect(getLobbyCapabilities(game, 'p1').allPlayersReady).toBe(false);
    game.readyStates.set('p1', true);
    game.readyStates.set('p2', true);
    expect(getLobbyCapabilities(game, 'p1').allPlayersReady).toBe(false);
    game.readyStates.set('p3', true);
    expect(getLobbyCapabilities(game, 'p1').allPlayersReady).toBe(true);
  });

  it('bots are ignored in allPlayersReady', () => {
    const { game } = makeGame(1);
    addBot(game, 'easy');
    game.readyStates.set('p1', true);
    expect(getLobbyCapabilities(game, 'p1').allPlayersReady).toBe(true);
  });

  it('readyStates serialized correctly', () => {
    const { game } = makeGame(2);
    game.readyStates.set('p1', true);
    game.readyStates.set('p2', false);
    const caps = getLobbyCapabilities(game, 'p1');
    expect(caps.readyStates).toEqual({ p1: true, p2: false });
    expect(caps.isReady).toBe(true);
  });

  it('non-host canStart is always false', () => {
    const { game } = makeGame(2);
    game.readyStates.set('p2', true);
    expect(getLobbyCapabilities(game, 'p2').canStart).toBe(false);
  });
});

// ============================================================
// Ready States
// ============================================================

describe('Ready States', () => {
  it('readyStates initialized empty on createGame', () => {
    const { game } = makeGame(1);
    expect(game.readyStates.size).toBe(0);
  });

  it('removePlayer cleans up readyStates', () => {
    const { game } = makeGame(2);
    game.readyStates.set('p2', true);
    removePlayer(game, 'p2');
    expect(game.readyStates.has('p2')).toBe(false);
  });

  it('removeBot cleans up readyStates', () => {
    const { game } = makeGame(1);
    const result = addBot(game, 'easy');
    if ('botId' in result) {
      game.readyStates.set(result.botId, true);
      removeBot(game, result.botId);
      expect(game.readyStates.has(result.botId)).toBe(false);
    }
  });
});

// ============================================================
// Reset Game to Lobby
// ============================================================

describe('resetGameToLobby', () => {
  it('resets game to lobby phase', () => {
    const { game } = makeGame(2);
    game.phase = 'finished';
    game.shots = new Set(['0,0', '1,0']);
    game.turnOrder = ['p1', 'p2'];
    game.readyStates.set('p1', true);
    resetGameToLobby(game);
    expect(game.phase).toBe('lobby');
    expect(game.shots.size).toBe(0);
    expect(game.islands.size).toBe(0);
    expect(game.turnOrder).toEqual([]);
    expect(game.readyStates.size).toBe(0);
  });

  it('clears player ships on reset', () => {
    const { game } = makeGame(2);
    game.players.get('p1')!.ships = [{ length: 2, cells: ['0,0', '1,0'], hits: new Set() }];
    game.phase = 'finished';
    resetGameToLobby(game);
    expect(game.players.get('p1')!.ships).toEqual([]);
  });

  it('preserves teams and teamsEnabled', () => {
    const { game } = makeGame(2);
    game.teamsEnabled = true;
    game.teams.set('p1', 'alpha');
    game.teams.set('p2', 'bravo');
    game.phase = 'finished';
    resetGameToLobby(game);
    expect(game.teamsEnabled).toBe(true);
    expect(game.teams.get('p1')).toBe('alpha');
  });
});

// ============================================================
// Join Code Resolution
// ============================================================

describe('resolveJoinCode', () => {
  it('resolves party codes first', () => {
    const partyMgr = {
      getPartyByCode: (code: string) => code === 'ABCD' ? { partyId: 'party-1', members: new Map() } : undefined,
    };
    const lobbyMgr = {
      getGameByCode: () => undefined,
    };
    const result = resolveJoinCode('ABCD', partyMgr, lobbyMgr as never);
    expect(result.type).toBe('party');
  });

  it('falls back to game codes', () => {
    const { game } = makeGame(1);
    const partyMgr = { getPartyByCode: () => undefined };
    const lobbyMgr = { getGameByCode: (code: string) => code === 'WXYZ' ? game : undefined };
    const result = resolveJoinCode('WXYZ', partyMgr, lobbyMgr);
    expect(result.type).toBe('game');
  });

  it('returns invalid for unknown codes', () => {
    const partyMgr = { getPartyByCode: () => undefined };
    const lobbyMgr = { getGameByCode: () => undefined };
    const result = resolveJoinCode('ZZZZ', partyMgr, lobbyMgr);
    expect(result.type).toBe('invalid');
  });
});

describe('generateGloballyUniqueCode', () => {
  it('generates a code not in either namespace', () => {
    const partyMgr = { getPartyByCode: () => undefined };
    const lobbyMgr = { getGameByCode: () => undefined };
    const code = generateGloballyUniqueCode(partyMgr, lobbyMgr);
    expect(code).toHaveLength(4);
  });
});

// ============================================================
// Kick Player
// ============================================================

describe('Kick Player', () => {
  it('removePlayer transfers host', () => {
    const { game } = makeGame(3);
    removePlayer(game, 'p1'); // host leaves
    expect(game.hostId).not.toBe('p1');
    expect(game.players.has('p1')).toBe(false);
  });

  it('removeBot removes bot from game', () => {
    const { game } = makeGame(1);
    const result = addBot(game, 'easy');
    expect(game.players.size).toBe(2);
    if ('botId' in result) {
      removeBot(game, result.botId);
      expect(game.players.size).toBe(1);
    }
  });
});

// ============================================================
// Host Transfer
// ============================================================

describe('Host Transfer', () => {
  it('removePlayer auto-transfers host to next human', () => {
    const { game } = makeGame(3);
    expect(game.hostId).toBe('p1');
    removePlayer(game, 'p1');
    // Should transfer to p2 (first non-bot)
    expect(game.hostId).toBe('p2');
  });

  it('host transfer skips bots', () => {
    const { game } = makeGame(1);
    addBot(game, 'easy');
    addPlayer(game, 'p2', 'Player 2');
    expect(game.hostId).toBe('p1');
    removePlayer(game, 'p1');
    expect(game.hostId).toBe('p2');
  });
});
