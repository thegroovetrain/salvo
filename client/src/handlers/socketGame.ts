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

function isSimultaneousRoundOpen(game: { roundPhase: string | null; turnMode: string }): boolean {
  return game.roundPhase === 'open' && game.turnMode === 'simultaneous';
}

function restoreSimultaneousState(game: { roundPhase: string | null; turnMode: string; lockedPlayerIds: string[]; roundNumber: number; lockDeadline: number | null; players: Record<string, { alive: boolean }> }): void {
  if (!isSimultaneousRoundOpen(game)) return;
  const pid = state.playerId ?? '';
  state.lockedIn = game.lockedPlayerIds.includes(pid);
  state.lockedPlayerIds = game.lockedPlayerIds;
  state.roundNumber = game.roundNumber;
  if (game.lockDeadline) {
    startTimer(Math.max(1, Math.round((game.lockDeadline - Date.now()) / 1000)));
  }
  state.isMyTurn = !state.lockedIn && (game.players[pid]?.alive ?? false);
}

function syncScreenToPhase(game: { phase: string; teamsEnabled: boolean; timerConfig: { enabled: boolean; seconds: number } }): void {
  if (game.phase === 'placement' && state.screen !== 'placement') {
    state.screen = 'placement';
    state.pendingSwapRequest = null;
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
    state.pendingSwapRequest = null;
  }
}

export function registerGameHandlers(): void {
  socket.on('game-state', ({ game, capabilities }) => {
    handleHostTransfer(game);
    state.game = game;
    state.capabilities = capabilities ?? null;
    restorePlayerIdentity(game);
    syncScreenToPhase(game);
    restoreSimultaneousState(game);
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

  // ── Simultaneous mode handlers ──

  socket.on('round-start', ({ roundNumber, timerSeconds }) => {
    state.isMyTurn = true;
    state.lockedIn = false;
    state.lockedPlayerIds = [];
    state.roundNumber = roundNumber;
    state.selectedTargets = [];
    if (timerSeconds !== null) {
      startTimer(timerSeconds);
    }
    playTurnSound();
    render();
  });

  socket.on('player-locked', ({ playerId }) => {
    if (!state.lockedPlayerIds.includes(playerId)) {
      state.lockedPlayerIds.push(playerId);
    }
    render();
  });

  socket.on('round-results', ({ salvos, game }) => {
    state.game = game;
    state.isMyTurn = false;
    state.lockedIn = false;
    state.lockedPlayerIds = [];
    stopTimer();
    // Capture scroll state BEFORE render destroys the DOM
    const logEl = document.querySelector('.shot-log');
    const wasNearBottom = !logEl || (logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 50);
    for (const salvo of salvos) {
      playSalvoSound(salvo.shots);
      state.shotLog.push({ shooterId: salvo.shooterId, shooterName: salvo.shooterName, shots: salvo.shots });
    }
    state.selectedTargets = [];
    render();
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
    // Only clear session for quickplay games — private games persist for return-to-lobby
    if (state.game?.mode !== 'private') {
      sessionStorage.removeItem('hullcracker-playerId');
      sessionStorage.removeItem('hullcracker-gameId');
    }
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

  // ── Sprint 1d: Lobby events ──

  socket.on('swap-requested', ({ requesterId, requesterName }) => {
    state.pendingSwapRequest = { requesterId, requesterName };
    render();
  });

  socket.on('swap-declined', () => {
    // The swap was declined or auto-declined — no notification needed
    render();
  });

  socket.on('player-kicked', () => {
    state.game = null;
    state.playerId = null;
    state.gameId = null;
    state.joinCode = null;
    state.screen = 'lobby';
    state.capabilities = null;
    state.pendingSwapRequest = null;
    state.countdownDeadline = null;
    if (state.countdownInterval) { clearInterval(state.countdownInterval); state.countdownInterval = null; }
    state.infoMessage = 'You were removed from the game';
    state.infoMessageTimeout = setTimeout(() => {
      state.infoMessage = null;
      render();
    }, 5000);
    sessionStorage.removeItem('hullcracker-playerId');
    sessionStorage.removeItem('hullcracker-gameId');
    render();
  });

  socket.on('start-countdown', ({ deadline }) => {
    state.countdownDeadline = deadline;
    // Play countdown beeps
    if (!state.matchSoundMuted) {
      const now = Date.now();
      for (let i = 0; i < 5; i++) {
        const freq = 800 - i * 100; // 800, 700, 600, 500, 400
        const delay = (deadline - now - 5000) + i * 1000 + 1000;
        if (delay >= 0) {
          setTimeout(() => {
            if (state.countdownDeadline) playTone(freq, freq, freq * 0.8, 0.1, 0.2);
          }, delay);
        }
      }
    }
    // Update countdown display
    if (state.countdownInterval) clearInterval(state.countdownInterval);
    state.countdownInterval = setInterval(() => {
      if (!state.countdownDeadline || Date.now() >= state.countdownDeadline) {
        if (state.countdownInterval) clearInterval(state.countdownInterval);
        state.countdownInterval = null;
        state.countdownDeadline = null;
      }
      render();
    }, 200);
    render();
  });

  socket.on('start-countdown-cancelled', () => {
    state.countdownDeadline = null;
    if (state.countdownInterval) {
      clearInterval(state.countdownInterval);
      state.countdownInterval = null;
    }
    render();
  });
}
