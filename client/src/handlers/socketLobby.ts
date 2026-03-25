import { socket } from '../socket.js';
import { state } from '../state.js';
import { render } from '../rendering/render.js';
import { showError } from '../errors.js';
import { startPlacementTimer, stopTimer, stopPlacementTimer } from '../timers/index.js';

let isInitialPageLoad = true;

export function registerLobbyHandlers(): void {
  socket.on('error', ({ message }) => {
    showError(message);
  });

  socket.on('game-created', ({ code, playerId, gameId }) => {
    state.playerId = playerId;
    state.gameId = gameId;
    state.joinCode = code;
    state.screen = 'waiting';
    // Store for reconnection
    sessionStorage.setItem('hullcracker-playerId', playerId);
    sessionStorage.setItem('hullcracker-gameId', gameId);
    render();
  });

  socket.on('player-joined', ({ game }) => {
    state.game = game;
    state.screen = 'waiting';
    render();
  });

  socket.on('placement-phase', ({ game, placementDeadline }) => {
    state.game = game;
    state.screen = 'placement';
    state.placedShips = [];
    state.placingShip = null;
    state.shipsSent = false;
    state.teammateGhostShips = [];
    // Set default chat channel for team games
    if (game.teamsEnabled) {
      state.chatChannel = 'team';
    }
    // Start placement timer if configured
    if (game.timerConfig.enabled) {
      const remaining = placementDeadline
        ? Math.max(1, Math.round((placementDeadline - Date.now()) / 1000))
        : game.timerConfig.seconds;
      startPlacementTimer(remaining);
    }
    render();
  });

  socket.on('all-ready', ({ game }) => {
    state.game = game;
    state.screen = 'battle';
    state.selectedTargets = [];
    state.shotLog = [];
    stopPlacementTimer();
    render();
  });

  socket.on('online-count', ({ count }) => {
    state.onlineCount = count;
    const el = document.getElementById('online-count');
    if (el) el.textContent = `${count} player${count !== 1 ? 's' : ''} online`;
  });

  // Surrender acknowledgment
  socket.on('surrender-ack', () => {
    sessionStorage.removeItem('hullcracker-playerId');
    sessionStorage.removeItem('hullcracker-gameId');
    state.screen = 'lobby';
    state.game = null;
    state.playerId = null;
    state.gameId = null;
    state.joinCode = null;
    state.showSurrenderModal = false;
    state.placedShips = [];
    state.selectedTargets = [];
    state.shotLog = [];
    state.chatMessages = [];
    state.isMyTurn = false;
    stopTimer();
    stopPlacementTimer();
    render();
  });

  // Leave game acknowledgment (lobby exit)
  socket.on('left-game', () => {
    sessionStorage.removeItem('hullcracker-playerId');
    sessionStorage.removeItem('hullcracker-gameId');
    state.screen = 'lobby';
    state.game = null;
    state.playerId = null;
    state.gameId = null;
    state.joinCode = null;
    state.isHost = false;
    render();
  });

  // Rejoin check response
  socket.on('check-rejoin-response', ({ valid }) => {
    const savedPlayerId = sessionStorage.getItem('hullcracker-playerId');
    const savedGameId = sessionStorage.getItem('hullcracker-gameId');
    if (!valid || !savedPlayerId || !savedGameId) {
      sessionStorage.removeItem('hullcracker-playerId');
      sessionStorage.removeItem('hullcracker-gameId');
      state.showRejoinModal = false;
      if (state.rejoinCountdownInterval) clearInterval(state.rejoinCountdownInterval);
      state.rejoinCountdownInterval = null;
      render();
      return; // stay on lobby
    }
    // Show rejoin modal (no countdown — forfeit is turn-based now)
    state.showRejoinModal = true;
    state.rejoinTimeRemaining = 0;
    render();
  });

  // Reconnection handling
  socket.on('connect', () => {
    if (!isInitialPageLoad) {
      // Socket.io internal reconnect — auto-rejoin silently
      const savedPlayerId = sessionStorage.getItem('hullcracker-playerId');
      const savedGameId = sessionStorage.getItem('hullcracker-gameId');
      if (savedPlayerId && savedGameId) {
        socket.emit('rejoin', { playerId: savedPlayerId, gameId: savedGameId });
      }
      return;
    }
    isInitialPageLoad = false;

    const savedPlayerId = sessionStorage.getItem('hullcracker-playerId');
    const savedGameId = sessionStorage.getItem('hullcracker-gameId');
    if (savedPlayerId && savedGameId) {
      // Check if rejoin is still valid
      socket.emit('check-rejoin', { playerId: savedPlayerId, gameId: savedGameId });
    }
  });
}
