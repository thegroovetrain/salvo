import { placementTimers } from './index.js';
import { getLobby } from '../emitters.js';
import { emitToPlayer } from '../emitters.js';
import { placeShips, allShipsPlaced, beginPlaying, toClientView } from '../game.js';
import { generatePlacement } from '../ai.js';
import { emitNextTurn } from '../gameFlow.js';

export function startPlacementTimer(gameId: string): void {
  const game = getLobby().getGame(gameId);
  if (!game) return;
  if (!game.timerConfig.enabled) return;

  clearPlacementTimer(gameId);

  const timer = setTimeout(() => {
    handlePlacementTimeout(gameId);
  }, game.timerConfig.seconds * 1000);

  placementTimers.set(gameId, timer);
}

export function clearPlacementTimer(gameId: string): void {
  const timer = placementTimers.get(gameId);
  if (timer) {
    clearTimeout(timer);
    placementTimers.delete(gameId);
  }
}

export function handlePlacementTimeout(gameId: string): void {
  const game = getLobby().getGame(gameId);
  if (!game || game.phase !== 'placement') return;

  // Auto-place ships for all unready players
  for (const player of game.players.values()) {
    if (player.ships.length === 0) {
      const placement = generatePlacement('easy', game.rings, game.islands);
      const err = placeShips(game, player.id, placement);
      if (err) {
        console.warn(`Auto-placement failed for ${player.id}: ${err}`);
      }
    }
  }

  if (allShipsPlaced(game)) {
    beginPlaying(game);
    for (const pid of game.players.keys()) {
      emitToPlayer(pid, 'all-ready', { game: toClientView(game, pid) });
    }
    emitNextTurn(game.id);
  }
}
