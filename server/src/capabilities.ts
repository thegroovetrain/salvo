import type { Game, LobbyCapabilities } from '@salvo/shared';

/** Compute lobby capabilities for a specific player. Only meaningful during lobby phase. */
export function getLobbyCapabilities(game: Game, playerId: string): LobbyCapabilities {
  const isHost = game.hostId === playerId;
  const player = game.players.get(playerId);
  const isHuman = player != null && !player.isBot;
  const hostReady = game.readyStates.get(game.hostId) === true;

  // Check if all human players are ready
  let allPlayersReady = true;
  for (const [pid, p] of game.players) {
    if (!p.isBot && game.readyStates.get(pid) !== true) {
      allPlayersReady = false;
      break;
    }
  }

  // Serialize ready states
  const readyStates: Record<string, boolean> = {};
  for (const [pid, ready] of game.readyStates) {
    readyStates[pid] = ready;
  }

  return {
    canChangeOptions: isHost,
    canAddBot: isHost,
    canKick: isHost,
    canMoveToSlot: isHuman,
    canRequestSwap: isHuman,
    canToggleReady: isHuman,
    canStart: isHost && hostReady,
    canTransferHost: isHost,
    allPlayersReady,
    isReady: game.readyStates.get(playerId) === true,
    readyStates,
  };
}
