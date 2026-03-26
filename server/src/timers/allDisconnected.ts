// ============================================================
// All-Disconnected Timer
// When ALL human players in a game disconnect, a 30-second timer
// starts. If no one reconnects, the game is cleaned up.
// ============================================================

import { allDisconnectedTimers } from './index.js';
import { getLobby, getConnections, getGuestSessions } from '../emitters.js';
import { clearGameTimers } from './index.js';
import { broadcastOnlineCount } from '../queue/index.js';

const ALL_DISCONNECTED_SECONDS = 30;

export function startAllDisconnectedTimer(gameId: string): void {
  clearAllDisconnectedTimer(gameId);

  const timer = setTimeout(() => {
    handleAllDisconnectedTimeout(gameId);
  }, ALL_DISCONNECTED_SECONDS * 1000);

  allDisconnectedTimers.set(gameId, timer);
}

export function clearAllDisconnectedTimer(gameId: string): void {
  const timer = allDisconnectedTimers.get(gameId);
  if (timer) {
    clearTimeout(timer);
    allDisconnectedTimers.delete(gameId);
  }
}

function handleAllDisconnectedTimeout(gameId: string): void {
  const lobby = getLobby();
  const game = lobby.getGame(gameId);
  if (!game || game.phase === 'finished') return;

  // Double-check: are all humans still disconnected?
  const guestSessions = getGuestSessions();
  if (!guestSessions.areAllDisconnected(gameId)) return;

  // End the game — no winner, clean up
  guestSessions.unbindAllFromGame(gameId);
  getConnections().removeGame(gameId);
  clearGameTimers(gameId);
  lobby.removeGame(gameId);
  broadcastOnlineCount();
}
