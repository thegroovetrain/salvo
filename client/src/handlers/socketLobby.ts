import { socket } from '../socket.js';
import { state } from '../state.js';
import { render } from '../rendering/render.js';
import { showError, showMessage } from '../errors.js';
import { startPlacementTimer, stopTimer, stopPlacementTimer } from '../timers/index.js';
import { setGuestId } from '../helpers/storage.js';

export function registerLobbyHandlers(): void {
  socket.on('error', ({ message }) => {
    // If reconnecting and game is gone, show info instead of error
    if (message === 'Game no longer available') {
      showMessage(message, 'info');
    } else {
      showError(message);
    }
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

  socket.on('player-joined', ({ game, capabilities }) => {
    state.game = game;
    if (capabilities) state.capabilities = capabilities;
    state.screen = 'waiting';
    // Cancel pending swap request on player join (lobby state changed)
    state.pendingSwapRequest = null;
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

  // Tab eviction — another tab took over this session
  socket.on('tab-evicted', () => {
    sessionStorage.removeItem('hullcracker-playerId');
    sessionStorage.removeItem('hullcracker-gameId');
    state.screen = 'lobby';
    state.game = null;
    state.playerId = null;
    state.gameId = null;
    state.joinCode = null;
    state.isMyTurn = false;
    stopTimer();
    stopPlacementTimer();
    showMessage('Playing in another tab', 'info');
    render();
  });

  // Server-assigned guestId (when client didn't have a valid one)
  socket.on('guest-id-assigned', ({ guestId }) => {
    setGuestId(guestId);
    // Update socket auth for future reconnections
    socket.auth = { guestId };
  });
}
