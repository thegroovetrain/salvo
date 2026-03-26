import { socket } from '../socket.js';
import { state } from '../state.js';
import { render } from '../rendering/render.js';
import { startTimer, stopTimer, startPlacementTimer, stopPlacementTimer } from '../timers/index.js';
import { playTurnSound, playSalvoSound, playTone } from '../audio/index.js';

function handleHostTransfer(game: { hostId: string }): void {
  const prevHostId = state.game?.hostId;
  if (prevHostId && prevHostId !== game.hostId && game.hostId === state.playerId) {
    state.isHost = true;
    state.infoMessage = 'You are now the host';
    state.infoMessageTimeout = setTimeout(() => {
      state.infoMessage = null;
      render();
    }, 5000);
  }
}

function restorePlayerIdentity(game: { id: string; players: Record<string, unknown> }): void {
  if (state.playerId) return;
  const saved = sessionStorage.getItem('hullcracker-playerId');
  if (saved && game.players[saved]) {
    state.playerId = saved;
    state.gameId = game.id;
  }
}

function syncScreenToPhase(game: { phase: string; teamsEnabled: boolean; timerConfig: { enabled: boolean; seconds: number } }): void {
  if (game.phase === 'placement' && state.screen !== 'placement') {
    state.screen = 'placement';
    if (game.teamsEnabled) state.chatChannel = 'team';
    if (game.timerConfig.enabled && !state.placementTimerInterval) {
      startPlacementTimer(game.timerConfig.seconds);
    }
  } else if (game.phase === 'playing' && state.screen !== 'battle') {
    state.screen = 'battle';
    state.selectedTargets = [];
    stopPlacementTimer();
  } else if (game.phase === 'lobby') {
    state.screen = 'waiting';
  }
}

export function registerGameHandlers(): void {
  socket.on('game-state', ({ game }) => {
    handleHostTransfer(game);
    state.game = game;
    restorePlayerIdentity(game);
    syncScreenToPhase(game);
    render();
  });

  socket.on('your-turn', ({ shotCount: _shotCount, timerSeconds }) => {
    state.isMyTurn = true;
    state.selectedTargets = [];
    if (timerSeconds !== null) {
      startTimer(timerSeconds);
    }
    playTurnSound();
    render();
  });

  socket.on('turn-timeout', () => {
    if (state.isMyTurn) {
      state.isMyTurn = false;
      stopTimer();
    }
    render();
  });

  socket.on('shot-results', ({ shooterId, shooterName, shots, game }) => {
    state.game = game;
    state.isMyTurn = false;
    stopTimer();
    // Play salvo result sound
    playSalvoSound(shots);
    // Capture scroll state BEFORE render destroys the DOM
    const logEl = document.querySelector('.shot-log');
    const wasNearBottom = !logEl || (logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 50);
    state.shotLog.push({ shooterId, shooterName, shots });
    state.selectedTargets = [];
    render();
    // Auto-scroll shot log to bottom if user was near the bottom (or first salvo)
    if (wasNearBottom) {
      setTimeout(() => {
        const el = document.querySelector('.shot-log');
        if (el) el.scrollTop = el.scrollHeight;
      }, 0);
    }
  });

  socket.on('player-eliminated', ({ playerName, reason }) => {
    const reasonText = reason === 'surrender' ? 'surrendered' : 'eliminated';
    state.chatMessages.push({
      playerId: 'system',
      playerName: 'SYSTEM',
      text: `${playerName} has been ${reasonText}!`,
      timestamp: Date.now(),
      channel: 'global',
    });
    render();
  });

  socket.on('game-over', (stats) => {
    state.gameOverStats = stats;
    state.screen = 'gameover';
    state.isMyTurn = false;
    stopTimer();
    stopPlacementTimer();
    // Game is over — clear session so page reload goes to lobby
    sessionStorage.removeItem('hullcracker-playerId');
    sessionStorage.removeItem('hullcracker-gameId');
    render();
    // Sequential ship reveal animation on the game-over grid
    const hullEls = document.querySelectorAll<SVGPathElement>('.ship-hull');
    if (hullEls.length > 0) {
      // Hide all hulls initially, then reveal one at a time
      hullEls.forEach(el => el.style.opacity = '0');
      hullEls.forEach((el, i) => {
        setTimeout(() => {
          el.style.opacity = el.getAttribute('opacity') || '1';
        }, 100 * (i + 1));
      });
      // Summary tone after all ships revealed (only if still on game-over screen)
      setTimeout(() => {
        if (!state.matchSoundMuted && state.screen === 'gameover') playTone(250, 400, 200, 0.5, 0.15);
      }, 100 * (hullEls.length + 1));
    }
  });

  socket.on('rematch-pending', ({ acceptedIds, totalHumans }) => {
    state.rematchPending = { acceptedIds, totalHumans };
    render();
  });

  socket.on('rematch-starting', ({ game, placementDeadline }) => {
    state.game = game;
    state.screen = 'placement';
    state.placedShips = [];
    state.placingShip = null;
    state.shipsSent = false;
    state.selectedTargets = [];
    state.shotLog = [];
    state.gameOverStats = null;
    state.rematchPending = null;
    state.teammateGhostShips = [];
    if (game.teamsEnabled) state.chatChannel = 'team';
    if (game.timerConfig.enabled) {
      const remaining = placementDeadline
        ? Math.max(1, Math.round((placementDeadline - Date.now()) / 1000))
        : game.timerConfig.seconds;
      startPlacementTimer(remaining);
    }
    // Re-store session for reconnection (cleared on game-over)
    if (state.playerId) sessionStorage.setItem('hullcracker-playerId', state.playerId);
    if (game.id) sessionStorage.setItem('hullcracker-gameId', game.id);
    render();
  });

  socket.on('rematch-declined', ({ playerName, code, game }) => {
    state.game = game;
    state.joinCode = code;
    state.screen = 'waiting';
    state.placedShips = [];
    state.selectedTargets = [];
    state.shotLog = [];
    state.gameOverStats = null;
    state.rematchPending = null;
    state.chatMessages.push({
      playerId: 'system',
      playerName: 'SYSTEM',
      text: `${playerName} left. Back in lobby with code ${code}.`,
      timestamp: Date.now(),
      channel: 'global',
    });
    render();
  });
}
