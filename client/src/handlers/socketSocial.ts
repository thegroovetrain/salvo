import { socket } from '../socket.js';
import { state } from '../state.js';
import { render } from '../rendering/render.js';
import { playMatchSound } from '../audio/index.js';

export function registerSocialHandlers(): void {
  socket.on('chat-message', (msg) => {
    state.chatMessages.push(msg);
    render();
    // Auto-scroll chat
    setTimeout(() => {
      const el = document.querySelector('.chat-messages');
      if (el) el.scrollTop = el.scrollHeight;
    }, 0);
  });

  socket.on('player-disconnected', ({ playerName }) => {
    state.chatMessages.push({
      playerId: 'system',
      playerName: 'SYSTEM',
      text: `${playerName} disconnected`,
      timestamp: Date.now(),
      channel: 'global',
    });
    render();
  });

  socket.on('player-reconnected', ({ playerName }) => {
    state.chatMessages.push({
      playerId: 'system',
      playerName: 'SYSTEM',
      text: `${playerName} reconnected!`,
      timestamp: Date.now(),
      channel: 'global',
    });
    render();
  });

  socket.on('teammate-placement-preview', ({ ships }) => {
    state.teammateGhostShips = ships;
    render();
  });

  // Quick Play handlers
  socket.on('quickplay-queue-update', ({ size }) => {
    state.queueSize = size;
    // If we receive a queue update and we have a queueMode set (from rematch requeue),
    // transition to queue screen
    if (state.queueMode && state.screen !== 'queue') {
      state.screen = 'queue';
      state.gameOverStats = null;
      state.rematchPending = null;
      state.game = null;
      state.playerId = null;
      state.gameId = null;
      sessionStorage.removeItem('hullcracker-playerId');
      sessionStorage.removeItem('hullcracker-gameId');
    }
    render();
  });

  socket.on('quickplay-matched', ({ playerId, gameId }) => {
    state.playerId = playerId;
    state.gameId = gameId;
    state.screen = 'placement';
    state.queueMode = null;
    state.queueSize = 0;
    sessionStorage.setItem('hullcracker-playerId', playerId);
    sessionStorage.setItem('hullcracker-gameId', gameId);
    // Clean up the queue history entry so back button doesn't hit a dead state
    history.replaceState(null, '');
    // Play match sound
    if (!state.matchSoundMuted) {
      playMatchSound();
    }
    render();
  });
}
