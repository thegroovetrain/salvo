import type { Game } from '@salvo/shared';
import { isPlayerAlive, playerShotCount } from '@salvo/shared';
import { getLobby, getConnections, getGuestSessions, emitToPlayer, emitGameState, broadcastToGame } from './emitters.js';
import {
  getCurrentTurnPlayerId, validateSalvo, fireSalvo,
  advanceTurn, checkGameOver, eliminatePlayer, removePlayer,
  toClientView, checkNewEliminations,
  lockPlayerSalvo, resolveSimultaneousRound,
} from './game.js';
import { chooseSalvo, getBotDelay } from './ai/index.js';
import { startTurnTimer, clearTurnTimer, startDisconnectSkipTimer, clearDisconnectSkipTimer, clearGameTimers, startRoundTimer, clearRoundTimer } from './timers/index.js';
import { broadcastOnlineCount } from './queue/index.js';

// ============================================================
// Turn Emission
// ============================================================

/** Start appropriate timer when it becomes a disconnected player's turn. */
function startDisconnectedTurnTimer(gameId: string, playerId: string, timerEnabled: boolean): void {
  if (timerEnabled) {
    startTurnTimer(gameId);    // normal turn timer fires zero shots
  } else {
    startDisconnectSkipTimer(gameId, playerId);  // 10s skip timer
  }
}

export function emitNextTurn(gameId: string): void {
  const game = getLobby().getGame(gameId);
  if (!game || game.phase !== 'playing') return;

  // Simultaneous mode: start a round instead of individual turns
  if (game.turnMode === 'simultaneous') {
    emitRoundStart(gameId);
    return;
  }

  emitSequentialTurn(game, gameId);
}

function emitSequentialTurn(game: Game, gameId: string): void {
  const currentPlayerId = getCurrentTurnPlayerId(game);
  if (!currentPlayerId) return;

  const player = game.players.get(currentPlayerId);
  if (!player) return;

  // Send updated game state to everyone
  for (const pid of game.players.keys()) {
    emitToPlayer(pid, 'game-state', { game: toClientView(game, pid) });
  }

  // If it's a bot's turn, auto-fire after a delay
  if (player.isBot && player.aiDifficulty) {
    const delay = getBotDelay(player.aiDifficulty);
    setTimeout(() => {
      executeBotTurn(gameId, currentPlayerId);
    }, delay);
    return; // don't emit your-turn or start timer for bots
  }

  // If the current turn player is disconnected, start appropriate timer
  if (getConnections().isDisconnected(currentPlayerId)) {
    startDisconnectedTurnTimer(gameId, currentPlayerId, game.timerConfig.enabled);
    return;
  }

  emitToPlayer(currentPlayerId, 'your-turn', {
    shotCount: playerShotCount(player),
    timerSeconds: game.timerConfig.enabled ? game.timerConfig.seconds : null,
  });

  startTurnTimer(gameId);
}

// ============================================================
// Bot Turn Execution
// ============================================================

function broadcastShotResults(game: Game, gameId: string, shooterId: string, shooterName: string, results: ReturnType<typeof fireSalvo>, alreadyDead: Set<string>): void {
  for (const pid of game.players.keys()) {
    emitToPlayer(pid, 'shot-results', {
      shooterId,
      shooterName,
      shots: results,
      game: toClientView(game, pid),
    });
  }

  for (const elim of checkNewEliminations(game, alreadyDead)) {
    broadcastToGame(gameId, 'player-eliminated', {
      playerId: elim.playerId,
      playerName: elim.playerName,
      reason: 'sunk' as const,
    });
  }
}

export function executeBotTurn(gameId: string, botId: string): void {
  const game = getLobby().getGame(gameId);
  if (!game || game.phase !== 'playing') return;
  if (getCurrentTurnPlayerId(game) !== botId) return;

  const bot = game.players.get(botId);
  if (!bot || !bot.aiDifficulty) return;

  const coords = chooseSalvo(game, botId, bot.aiDifficulty);
  if (coords.length === 0) return;

  const err = validateSalvo(game, botId, coords);
  if (err) {
    advanceTurn(game);
    emitNextTurn(gameId);
    return;
  }

  const alreadyDead = new Set(
    [...game.players.values()].filter(p => !isPlayerAlive(p)).map(p => p.id)
  );

  const results = fireSalvo(game, botId, coords);
  broadcastShotResults(game, gameId, botId, bot.name, results, alreadyDead);

  const gameOver = checkGameOver(game);
  if (gameOver) {
    clearTurnTimer(gameId);
    getGuestSessions().unbindAllFromGame(gameId);
    emitGameState(gameId);
    broadcastToGame(gameId, 'game-over', gameOver);
    broadcastOnlineCount();
    return;
  }

  advanceTurn(game);
  emitNextTurn(gameId);
}

// ============================================================
// Simultaneous Mode — Round Flow
// ============================================================

function freezeRoundParticipants(game: Game): string[] {
  const living: string[] = [];
  const shotCounts = new Map<string, number>();
  for (const [pid, player] of game.players) {
    if (isPlayerAlive(player)) {
      living.push(pid);
      shotCounts.set(pid, playerShotCount(player));
    }
  }
  game.roundParticipants = living;
  game.roundShotCounts = shotCounts;
  return living;
}

function emitRoundStart(gameId: string): void {
  const game = getLobby().getGame(gameId);
  if (!game || game.phase !== 'playing') return;

  game.roundPhase = 'open';
  game.roundNumber++;
  game.lockedSalvos.clear();

  const living = freezeRoundParticipants(game);
  const timerSeconds = game.timerConfig.enabled ? game.timerConfig.seconds : null;
  game.lockDeadline = timerSeconds ? Date.now() + timerSeconds * 1000 : null;

  // Emit round-start to each living player with their frozen shot count
  for (const pid of living) {
    emitToPlayer(pid, 'round-start', {
      roundNumber: game.roundNumber,
      shotCount: game.roundShotCounts.get(pid) ?? 0,
      timerSeconds,
      livingPlayerIds: living,
    });
  }

  // Send updated game state to everyone
  for (const pid of game.players.keys()) {
    emitToPlayer(pid, 'game-state', { game: toClientView(game, pid) });
  }

  if (timerSeconds) startRoundTimer(gameId, timerSeconds);
  scheduleBotLockIns(game, gameId, living);
}

function scheduleBotLockIns(game: Game, gameId: string, living: string[]): void {
  for (const pid of living) {
    const player = game.players.get(pid);
    if (player?.isBot && player.aiDifficulty) {
      const delay = getBotDelay(player.aiDifficulty);
      setTimeout(() => executeBotLockIn(gameId, pid), delay);
    }
  }
}

function executeBotLockIn(gameId: string, botId: string): void {
  const game = getLobby().getGame(gameId);
  if (!game || game.phase !== 'playing') return;
  if (game.turnMode !== 'simultaneous' || game.roundPhase !== 'open') return;
  if (game.lockedSalvos.has(botId)) return;

  const bot = game.players.get(botId);
  if (!bot || !bot.aiDifficulty) return;

  const coords = chooseSalvo(game, botId, bot.aiDifficulty);
  // Cap at frozen shot count
  const maxShots = game.roundShotCounts.get(botId) ?? 0;
  const capped = coords.slice(0, maxShots);

  lockPlayerSalvo(game, botId, capped);
  broadcastToGame(gameId, 'player-locked', { playerId: botId });
  checkAndResolveRound(gameId);
}

export function checkAndResolveRound(gameId: string): void {
  const game = getLobby().getGame(gameId);
  if (!game || game.roundPhase !== 'open') return;

  // Check if all participants have locked in
  for (const pid of game.roundParticipants) {
    if (!game.lockedSalvos.has(pid)) return;
  }

  game.roundPhase = 'resolving';
  clearRoundTimer(gameId);

  const alreadyDead = new Set(
    [...game.players.values()].filter(p => !isPlayerAlive(p)).map(p => p.id),
  );

  const results = resolveSimultaneousRound(game);

  // Check for new eliminations
  const eliminations = checkNewEliminations(game, alreadyDead);
  for (const elim of eliminations) {
    broadcastToGame(gameId, 'player-eliminated', {
      playerId: elim.playerId,
      playerName: elim.playerName,
      reason: 'sunk' as const,
    });
  }

  // Broadcast round results to all players (per-player views via toClientView)
  for (const pid of game.players.keys()) {
    emitToPlayer(pid, 'round-results', {
      salvos: results,
      game: toClientView(game, pid),
    });
  }

  // Check game over
  const gameOver = checkGameOver(game);
  if (gameOver) {
    clearRoundTimer(gameId);
    getGuestSessions().unbindAllFromGame(gameId);
    emitGameState(gameId);
    broadcastToGame(gameId, 'game-over', gameOver);
    broadcastOnlineCount();
    return;
  }

  // Start next round
  emitRoundStart(gameId);
}

// ============================================================
// Shared Player Exit Logic
// ============================================================

function handleNonPlayingExit(game: Game, playerId: string, gameId: string): void {
  const lobby = getLobby();
  const player = game.players.get(playerId);
  broadcastToGame(gameId, 'player-eliminated', {
    playerId,
    playerName: player?.name ?? 'Unknown',
    reason: 'surrender' as const,
  });
  removePlayer(game, playerId);
  lobby.registerPlayer(playerId, '');

  const remainingHumans = [...game.players.values()].filter(p => !p.isBot);
  if (remainingHumans.length === 0) {
    clearGameTimers(gameId);
    lobby.removeGame(gameId);
    broadcastOnlineCount();
  } else if (remainingHumans.length < 2 && game.phase !== 'finished') {
    for (const p of remainingHumans) {
      emitToPlayer(p.id, 'error', { message: 'Game ended — not enough players' });
    }
    clearGameTimers(gameId);
    lobby.removeGame(gameId);
    broadcastOnlineCount();
  }
}

export function handlePlayerExit(game: Game, playerId: string, gameId: string): void {
  if (game.phase !== 'playing') {
    handleNonPlayingExit(game, playerId, gameId);
    return;
  }

  const isSimultaneous = game.turnMode === 'simultaneous';
  const wasTurn = !isSimultaneous && getCurrentTurnPlayerId(game) === playerId;
  if (wasTurn) {
    clearTurnTimer(gameId);
    clearDisconnectSkipTimer(playerId);
  }

  // In simultaneous mode, overwrite locked salvo with empty
  if (isSimultaneous) {
    game.lockedSalvos.set(playerId, []);
  }

  eliminatePlayer(game, playerId);
  const player = game.players.get(playerId);

  broadcastToGame(gameId, 'player-eliminated', {
    playerId,
    playerName: player?.name ?? 'Unknown',
    reason: 'surrender' as const,
  });

  const gameOver = checkGameOver(game);
  if (gameOver) {
    clearTurnTimer(gameId);
    clearRoundTimer(gameId);
    clearDisconnectSkipTimer(playerId);
    getGuestSessions().unbindAllFromGame(gameId);
    emitGameState(gameId);
    broadcastToGame(gameId, 'game-over', gameOver);
    broadcastOnlineCount();
    return;
  }

  if (isSimultaneous) {
    // Check if all remaining participants have locked in
    checkAndResolveRound(gameId);
  } else if (wasTurn) {
    advanceTurn(game);
    emitNextTurn(gameId);
  }
}
