import { io, Socket } from 'socket.io-client';
import type {
  ClientToServerEvents, ServerToClientEvents,
  WireGame, WirePlayer, ShotResult, ShipPlacement,
  ChatMessage, GameOverStats, TimerConfig, AiDifficulty,
  QuickPlayMode, ChatChannel,
} from '@salvo/shared';
import { SHIP_LENGTHS, SHIP_NAMES, ROWS, GRID_SIZE } from '@salvo/shared';
import './style.css';

declare const __APP_VERSION__: string;
const VERSION = __APP_VERSION__;

// ============================================================
// State
// ============================================================

type Screen = 'lobby' | 'waiting' | 'placement' | 'battle' | 'gameover' | 'changelog' | 'queue';

interface AppState {
  screen: Screen;
  playerId: string | null;
  gameId: string | null;
  joinCode: string | null;
  game: WireGame | null;
  isHost: boolean;
  // Placement
  placedShips: ShipPlacement[];
  placingShip: { length: number; horizontal: boolean } | null;
  ghostCells: string[];
  ghostValid: boolean;
  shipsSent: boolean;  // true after clicking Ready, waiting for all players
  teammateGhostShips: ShipPlacement[];
  placementTimerSeconds: number | null;
  placementTimerInterval: ReturnType<typeof setInterval> | null;
  // Battle
  selectedTargets: string[];
  isMyTurn: boolean;
  shotLog: ShotLogEntry[];
  timerSeconds: number | null;
  timerInterval: ReturnType<typeof setInterval> | null;
  // Chat
  chatMessages: ChatMessage[];
  chatChannel: ChatChannel;
  // Game over
  gameOverStats: GameOverStats | null;
  rematchPending: { acceptedIds: string[]; totalHumans: number } | null;
  // Changelog
  changelogHtml: string | null;
  // Mobile
  mobileTab: 'fleet' | 'target';
  // UI
  showJoinModal: boolean;
  showCreateModal: boolean;
  // Saved form values
  savedPlayerName: string;
  // Quick Play
  queueMode: QuickPlayMode | null;
  queueSize: number;
  onlineCount: number;
  matchSoundMuted: boolean;
  // Lobby dropdown
  openDropdownId: string | null;
  // Surrender & Rejoin
  showSurrenderModal: boolean;
  showRejoinModal: boolean;
  rejoinTimeRemaining: number;
  rejoinCountdownInterval: ReturnType<typeof setInterval> | null;
  // Error
  errorMessage: string | null;
  errorTimeout: ReturnType<typeof setTimeout> | null;
}

interface ShotLogEntry {
  shooterId: string;
  shooterName: string;
  shots: ShotResult[];
}

const state: AppState = {
  screen: 'lobby',
  playerId: null,
  gameId: null,
  joinCode: null,
  game: null,
  isHost: false,
  placedShips: [],
  placingShip: null,
  ghostCells: [],
  ghostValid: false,
  shipsSent: false,
  teammateGhostShips: [],
  placementTimerSeconds: null,
  placementTimerInterval: null,
  selectedTargets: [],
  isMyTurn: false,
  shotLog: [],
  timerSeconds: null,
  timerInterval: null,
  chatMessages: [],
  chatChannel: 'global',
  gameOverStats: null,
  rematchPending: null,
  changelogHtml: null,
  mobileTab: 'fleet',
  showJoinModal: false,
  showCreateModal: false,
  savedPlayerName: '',
  queueMode: null,
  queueSize: 0,
  onlineCount: 0,
  matchSoundMuted: localStorage.getItem('salvo-muted') === 'true',
  openDropdownId: null as string | null,
  showSurrenderModal: false,
  showRejoinModal: false,
  rejoinTimeRemaining: 0,
  rejoinCountdownInterval: null,
  errorMessage: null,
  errorTimeout: null,
};

// ============================================================
// Socket Connection
// ============================================================

const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
});

// ============================================================
// Socket Event Handlers
// ============================================================

socket.on('error', ({ message }) => {
  showError(message);
});

socket.on('game-created', ({ code, playerId, gameId }) => {
  state.playerId = playerId;
  state.gameId = gameId;
  state.joinCode = code;
  state.screen = 'waiting';
  // Store for reconnection
  sessionStorage.setItem('salvo-playerId', playerId);
  sessionStorage.setItem('salvo-gameId', gameId);
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
  if (game.placementTimerConfig.enabled) {
    const remaining = placementDeadline
      ? Math.max(1, Math.round((placementDeadline - Date.now()) / 1000))
      : game.placementTimerConfig.seconds;
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

socket.on('game-state', ({ game }) => {
  state.game = game;
  // Dismiss rejoin modal on successful rejoin
  if (state.showRejoinModal) {
    state.showRejoinModal = false;
    if (state.rejoinCountdownInterval) clearInterval(state.rejoinCountdownInterval);
    state.rejoinCountdownInterval = null;
  }
  // Restore player identity from sessionStorage on rejoin (state is fresh after page refresh)
  if (!state.playerId) {
    const saved = sessionStorage.getItem('salvo-playerId');
    if (saved && game.players[saved]) {
      state.playerId = saved;
      state.gameId = game.id;
    }
  }
  if (game.phase === 'placement' && state.screen !== 'placement') {
    state.screen = 'placement';
    if (game.teamsEnabled) state.chatChannel = 'team';
    if (game.placementTimerConfig.enabled && !state.placementTimerInterval) {
      startPlacementTimer(game.placementTimerConfig.seconds);
    }
  } else if (game.phase === 'playing' && state.screen !== 'battle') {
    state.screen = 'battle';
    state.selectedTargets = [];
    stopPlacementTimer();
  } else if (game.phase === 'lobby') {
    state.screen = 'waiting';
  }
  render();
});

socket.on('your-turn', ({ shotCount, timerSeconds }) => {
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
  state.shotLog.push({ shooterId, shooterName, shots });
  state.selectedTargets = [];
  render();
  // Auto-scroll shot log to bottom (newest) if user is near the bottom
  setTimeout(() => {
    const el = document.querySelector('.shot-log');
    if (el && (el.scrollHeight - el.scrollTop - el.clientHeight < 50)) {
      el.scrollTop = el.scrollHeight;
    }
  }, 0);
});

socket.on('player-eliminated', ({ playerName, reason }) => {
  const reasonText = reason === 'forfeit' ? 'forfeited (disconnected)' : 'eliminated';
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
  // Dismiss rejoin modal if still showing
  if (state.showRejoinModal) {
    state.showRejoinModal = false;
    if (state.rejoinCountdownInterval) clearInterval(state.rejoinCountdownInterval);
    state.rejoinCountdownInterval = null;
  }
  // Game is over — clear session so page reload goes to lobby, not rejoin modal
  sessionStorage.removeItem('salvo-playerId');
  sessionStorage.removeItem('salvo-gameId');
  render();
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
  if (game.placementTimerConfig.enabled) {
    const remaining = placementDeadline
      ? Math.max(1, Math.round((placementDeadline - Date.now()) / 1000))
      : game.placementTimerConfig.seconds;
    startPlacementTimer(remaining);
  }
  // Re-store session for reconnection (cleared on game-over)
  if (state.playerId) sessionStorage.setItem('salvo-playerId', state.playerId);
  if (game.id) sessionStorage.setItem('salvo-gameId', game.id);
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
    sessionStorage.removeItem('salvo-playerId');
    sessionStorage.removeItem('salvo-gameId');
  }
  render();
});

socket.on('quickplay-matched', ({ playerId, gameId }) => {
  state.playerId = playerId;
  state.gameId = gameId;
  state.screen = 'placement';
  state.queueMode = null;
  state.queueSize = 0;
  sessionStorage.setItem('salvo-playerId', playerId);
  sessionStorage.setItem('salvo-gameId', gameId);
  // Clean up the queue history entry so back button doesn't hit a dead state
  history.replaceState(null, '');
  // Play match sound
  if (!state.matchSoundMuted) {
    playMatchSound();
  }
  render();
});

socket.on('online-count', ({ count }) => {
  state.onlineCount = count;
  const el = document.getElementById('online-count');
  if (el) el.textContent = `${count} player${count !== 1 ? 's' : ''} online`;
});

// Surrender acknowledgment
socket.on('surrender-ack', () => {
  sessionStorage.removeItem('salvo-playerId');
  sessionStorage.removeItem('salvo-gameId');
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

// Rejoin check response
socket.on('check-rejoin-response', ({ valid }) => {
  const savedPlayerId = sessionStorage.getItem('salvo-playerId');
  const savedGameId = sessionStorage.getItem('salvo-gameId');
  if (!valid || !savedPlayerId || !savedGameId) {
    sessionStorage.removeItem('salvo-playerId');
    sessionStorage.removeItem('salvo-gameId');
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
let isInitialPageLoad = true;
socket.on('connect', () => {
  if (!isInitialPageLoad) {
    // Socket.io internal reconnect — auto-rejoin silently
    const savedPlayerId = sessionStorage.getItem('salvo-playerId');
    const savedGameId = sessionStorage.getItem('salvo-gameId');
    if (savedPlayerId && savedGameId) {
      socket.emit('rejoin', { playerId: savedPlayerId, gameId: savedGameId });
    }
    return;
  }
  isInitialPageLoad = false;

  const savedPlayerId = sessionStorage.getItem('salvo-playerId');
  const savedGameId = sessionStorage.getItem('salvo-gameId');
  if (savedPlayerId && savedGameId) {
    // Check if rejoin is still valid
    socket.emit('check-rejoin', { playerId: savedPlayerId, gameId: savedGameId });
  }
});

// ============================================================
// Timer
// ============================================================

function startTimer(seconds: number): void {
  stopTimer();
  state.timerSeconds = seconds;
  state.timerInterval = setInterval(() => {
    if (state.timerSeconds !== null && state.timerSeconds > 0) {
      state.timerSeconds--;
      renderTimer();
    }
  }, 1000);
}

function stopTimer(): void {
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
  state.timerSeconds = null;
}

function renderTimer(): void {
  const el = document.querySelector('.turn-timer');
  if (!el || state.timerSeconds === null) return;
  const mins = Math.floor(state.timerSeconds / 60);
  const secs = state.timerSeconds % 60;
  el.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
  el.classList.toggle('warning', state.timerSeconds <= 10);
}

// ============================================================
// Placement Timer
// ============================================================

function startPlacementTimer(seconds: number): void {
  stopPlacementTimer();
  state.placementTimerSeconds = seconds;
  state.placementTimerInterval = setInterval(() => {
    if (state.placementTimerSeconds !== null && state.placementTimerSeconds > 0) {
      state.placementTimerSeconds--;
      renderPlacementTimer();
    }
  }, 1000);
}

function stopPlacementTimer(): void {
  if (state.placementTimerInterval) {
    clearInterval(state.placementTimerInterval);
    state.placementTimerInterval = null;
  }
  state.placementTimerSeconds = null;
}

function renderPlacementTimer(): void {
  const el = document.querySelector('.placement-timer');
  if (!el || state.placementTimerSeconds === null) return;
  const mins = Math.floor(state.placementTimerSeconds / 60);
  const secs = state.placementTimerSeconds % 60;
  el.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
  el.classList.toggle('warning', state.placementTimerSeconds <= 10);
}

// ============================================================
// Placement Preview Debounce
// ============================================================

let placementPreviewTimeout: ReturnType<typeof setTimeout> | null = null;

function emitPlacementPreview(): void {
  if (placementPreviewTimeout) clearTimeout(placementPreviewTimeout);
  placementPreviewTimeout = setTimeout(() => {
    if (state.game?.teamsEnabled && state.placedShips.length > 0) {
      socket.emit('placement-preview', { ships: state.placedShips });
    }
  }, 300);
}

// ============================================================
// Error Display
// ============================================================

function showError(message: string): void {
  state.errorMessage = message;
  if (state.errorTimeout) clearTimeout(state.errorTimeout);

  // Update error in-place without re-rendering (preserves input values)
  let errorEl = document.querySelector('.alert-error') as HTMLElement | null;
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
  } else {
    // Insert error element at the top of the screen
    const screen = document.querySelector('.screen');
    if (screen) {
      const titleEl = screen.querySelector('.game-title');
      const subtitleEl = screen.querySelector('.game-subtitle');
      const insertAfter = subtitleEl ?? titleEl;
      if (insertAfter) {
        const div = document.createElement('div');
        div.className = 'alert alert-error';
        div.textContent = message;
        insertAfter.insertAdjacentElement('afterend', div);
        errorEl = div;
      }
    }
  }

  state.errorTimeout = setTimeout(() => {
    state.errorMessage = null;
    const el = document.querySelector('.alert-error');
    if (el) el.remove();
  }, 4000);
}

// ============================================================
// Coordinate Helpers
// ============================================================

function coordToId(row: number, col: number): string {
  return `${ROWS[row]}${col + 1}`;
}

function getShipCells(startRow: number, startCol: number, length: number, horizontal: boolean): string[] | null {
  const cells: string[] = [];
  for (let i = 0; i < length; i++) {
    const r = horizontal ? startRow : startRow + i;
    const c = horizontal ? startCol + i : startCol;
    if (r >= GRID_SIZE || c >= GRID_SIZE) return null;
    cells.push(coordToId(r, c));
  }
  return cells;
}

// ============================================================
// Time Formatting
// ============================================================

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

// ============================================================
// Team Helpers
// ============================================================

function getTeammateId(): string | null {
  if (!state.game || !state.playerId || !state.game.teamsEnabled) return null;
  const myTeam = state.game.teams[state.playerId];
  if (!myTeam) return null;
  for (const [pid, team] of Object.entries(state.game.teams)) {
    if (pid !== state.playerId && team === myTeam) return pid;
  }
  return null;
}

function getHitCountAtCoord(coord: string): number {
  let count = 0;
  for (const entry of state.shotLog) {
    for (const shot of entry.shots) {
      if (shot.coord === coord) {
        count += shot.hits.length;
      }
    }
  }
  return count;
}

// ============================================================
// Match Sound
// ============================================================

function playMatchSound(): void {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);
    osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
    osc.onended = () => ctx.close();
  } catch {
    // Audio not supported — silently ignore
  }
}

function playTurnSound(): void {
  if (state.matchSoundMuted) return;
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.15);
    osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
    osc.onended = () => ctx.close();
  } catch {
    // Audio not supported — silently ignore
  }
}

// ============================================================
// Back Button Guard for Queue
// ============================================================

window.addEventListener('popstate', () => {
  if (state.screen === 'queue') {
    socket.emit('quickplay-leave');
    state.screen = 'lobby';
    state.queueMode = null;
    state.queueSize = 0;
    render();
  }
});

// ============================================================
// Rendering
// ============================================================

function renderSurrenderModal(): string {
  if (!state.showSurrenderModal) return '';
  return `
    <div class="modal-overlay" id="surrender-modal-overlay">
      <div class="modal">
        <h2 class="label" style="margin-bottom:12px">Surrender?</h2>
        <p style="margin-bottom:16px;color:var(--text-muted);font-size:14px">Are you sure you want to surrender? Your ships will be removed from the game.</p>
        <div style="display:flex;gap:8px;justify-content:center">
          <button class="btn btn-danger" id="btn-surrender-confirm">Surrender</button>
          <button class="btn btn-secondary" id="btn-surrender-cancel">Cancel</button>
        </div>
      </div>
    </div>`;
}

function renderRejoinModal(): string {
  if (!state.showRejoinModal) return '';
  return `
    <div class="modal-overlay" id="rejoin-modal-overlay">
      <div class="modal">
        <h2 class="label" style="margin-bottom:12px">Active Game Found</h2>
        <p style="margin-bottom:16px;color:var(--text-muted);font-size:14px">You have an active game. Rejoin?</p>
        <div style="display:flex;gap:8px;justify-content:center">
          <button class="btn btn-primary" id="btn-rejoin-yes">Rejoin</button>
          <button class="btn btn-danger" id="btn-rejoin-no">Leave Game</button>
        </div>
      </div>
    </div>`;
}

function render(): void {
  const app = document.getElementById('app')!;

  switch (state.screen) {
    case 'lobby': app.innerHTML = renderLobby(); break;
    case 'queue': app.innerHTML = renderQueue(); break;
    case 'waiting': app.innerHTML = renderWaiting(); break;
    case 'placement': app.innerHTML = renderPlacement(); break;
    case 'battle': app.innerHTML = renderBattle(); break;
    case 'gameover': app.innerHTML = renderGameOver(); break;
    case 'changelog': app.innerHTML = renderChangelog(); break;
  }

  // Append modals (surrender confirmation + rejoin prompt)
  app.innerHTML += renderSurrenderModal() + renderRejoinModal();

  bindEvents();
}

function renderError(): string {
  if (!state.errorMessage) return '';
  return `<div class="alert alert-error">${esc(state.errorMessage)}</div>`;
}

function renderLobby(): string {
  const joinModalHtml = state.showJoinModal ? `
    <div class="modal-overlay" id="join-modal-overlay">
      <div class="modal">
        <h2 class="label" style="margin-bottom:12px">Enter Game Code</h2>
        <input class="input input-code" id="join-code" type="text" placeholder="XXXX" maxlength="8" autocomplete="off" autofocus>
        <div style="display:flex;gap:8px;margin-top:4px">
          <button class="btn btn-amber" id="btn-join" style="flex:1">Join</button>
          <button class="btn btn-secondary" id="btn-join-cancel" style="flex:1">Cancel</button>
        </div>
      </div>
    </div>
  ` : '';

  const createModalHtml = state.showCreateModal ? `
    <div class="modal-overlay" id="create-modal-overlay">
      <div class="modal">
        <h2 class="label" style="margin-bottom:16px">Game Options</h2>
        <div class="modal-option">
          <div class="modal-option-row">
            <input type="checkbox" id="timer-enabled">
            <label for="timer-enabled">Turn timer</label>
            <select id="timer-seconds" class="input" style="margin-bottom:0;width:auto;padding:4px 8px;font-family:var(--font-mono);font-size:12px">
              <option value="30">30s</option>
              <option value="60" selected>60s</option>
            </select>
          </div>
        </div>
        <div class="modal-option" style="margin-top:8px">
          <div class="modal-option-row">
            <input type="checkbox" id="placement-timer-enabled">
            <label for="placement-timer-enabled">Placement timer</label>
          </div>
        </div>
        <div class="modal-option" style="margin-top:8px">
          <div class="modal-option-row">
            <input type="checkbox" id="teams-enabled">
            <label for="teams-enabled">Teams (2v2)</label>
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:16px">
          <button class="btn btn-primary" id="btn-create-confirm" style="flex:1">Create</button>
          <button class="btn btn-secondary" id="btn-create-cancel" style="flex:1">Cancel</button>
        </div>
      </div>
    </div>
  ` : '';

  return `
    <div class="screen">
      <h1 class="game-title">SALVO</h1>
      <p class="game-subtitle">Shared-Ocean Battleship</p>
      <p class="online-count" id="online-count">${state.onlineCount > 0 ? `${state.onlineCount} player${state.onlineCount !== 1 ? 's' : ''} online` : ''}</p>
      ${renderError()}
      <div class="lobby-card" style="max-width:400px;width:100%">
        <label class="input-label">Your Name</label>
        <input class="input" id="player-name" type="text" placeholder="Enter your name" maxlength="20" autocomplete="off" value="${esc(state.savedPlayerName)}">
        <div class="quickplay-section">
          <p class="label" style="margin-bottom:8px">Quick Play</p>
          <div style="display:flex;gap:8px">
            <button class="btn btn-amber btn-quickplay" id="btn-qp-1v1" style="flex:1">1v1</button>
            <button class="btn btn-amber btn-quickplay" id="btn-qp-2v2" style="flex:1" title="Random teammate — coordinate to win">2v2</button>
            <button class="btn btn-amber btn-quickplay" id="btn-qp-ffa" style="flex:1">FFA</button>
          </div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary" id="btn-create" style="flex:1">Create Game</button>
          <button class="btn btn-outline-green" id="btn-show-join" style="flex:1">Join Game</button>
        </div>
      </div>
      ${joinModalHtml}
      ${createModalHtml}
      <div class="lobby-footer">
        <span>v${VERSION}</span>
        <span class="footer-sep">&bull;</span>
        <a href="#" id="btn-changelog">Changelog</a>
      </div>
    </div>`;
}


function renderQueue(): string {
  const mode = state.queueMode;
  const target = mode === '1v1' ? 2 : 4;
  const size = state.queueSize;
  const modeLabel = mode === '1v1' ? '1V1' : mode === '2v2' ? '2V2 TEAMS' : 'FFA';

  const dots = Array.from({ length: target }, (_, i) =>
    `<span class="queue-dot ${i < size ? 'filled' : ''}">${i < size ? '\u25CF' : '\u25CB'}</span>`
  ).join(' ');

  return `
    <div class="screen">
      <h1 class="game-title" style="font-size:32px">SALVO</h1>
      <div class="queue-wait">
        <p class="label queue-label">SEARCHING FOR ${modeLabel} MATCH...</p>
        <div class="queue-dots">${dots}</div>
        <p class="queue-count">${size} of ${target}</p>
        <button class="btn btn-secondary" id="btn-queue-cancel" style="margin-top:24px">Cancel</button>
      </div>
    </div>`;
}

function renderChangelog(): string {
  // Content loaded async — show cached or loading state
  const content = state.changelogHtml || '<p style="color:var(--text-muted)">Loading changelog...</p>';
  return `
    <div class="screen">
      <h1 class="game-title" style="font-size:32px">CHANGELOG</h1>
      <div class="changelog">${content}</div>
      <button class="btn btn-secondary" id="btn-changelog-back" style="max-width:200px;margin-top:24px">Back to Lobby</button>
    </div>`;
}

/** Simple markdown-to-HTML for changelog (headings, lists, bold, horizontal rules) */
function markdownToHtml(md: string): string {
  const lines = md.split('\n');
  let html = '';
  let inList = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip the top-level "# Changelog" heading
    if (trimmed.startsWith('# ') && !trimmed.startsWith('## ')) continue;

    // ## [0.4.0] - 2026-03-22 → version entry heading
    const versionMatch = trimmed.match(/^## \[(.+?)\] - (.+)$/);
    if (versionMatch) {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<div class="changelog-entry"><h2>v${esc(versionMatch[1])} <span class="changelog-date">${esc(versionMatch[2])}</span></h2>`;
      continue;
    }

    // ### Added/Changed/Fixed → subsection
    if (trimmed.startsWith('### ')) {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<h3 class="changelog-subsection">${esc(trimmed.slice(4))}</h3>`;
      continue;
    }

    // - list item (with **bold** support)
    if (trimmed.startsWith('- ')) {
      if (!inList) { html += '<ul>'; inList = true; }
      let text = esc(trimmed.slice(2));
      // Convert **bold** to <strong>
      text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      // Convert — to mdash
      text = text.replace(/ — /g, ' &mdash; ');
      html += `<li>${text}</li>`;
      continue;
    }

    // Empty line — close list and close entry
    if (trimmed === '') {
      if (inList) { html += '</ul>'; inList = false; }
      // Close entry div if we just had content
      if (html.endsWith('</ul>') || html.endsWith('</h3>')) {
        html += '</div>';
      }
      continue;
    }
  }

  if (inList) html += '</ul>';
  // Close last entry if not closed
  if (!html.endsWith('</div>')) html += '</div>';

  return html;
}

async function loadChangelog(): Promise<void> {
  try {
    const resp = await fetch('/CHANGELOG.md');
    if (!resp.ok) throw new Error(`${resp.status}`);
    const md = await resp.text();
    state.changelogHtml = markdownToHtml(md);
  } catch {
    state.changelogHtml = '<p style="color:var(--text-muted)">Could not load changelog.</p>';
  }
  if (state.screen === 'changelog') render();
}

function renderWaiting(): string {
  const MAX_PLAYERS = 4;
  const players = state.game ? Object.values(state.game.players) : [];
  const isHost = state.game?.players[state.playerId ?? '']?.id === state.game?.turnOrder[0]
    || state.isHost;
  const canStart = players.length >= 2 && isHost;
  const teamsEnabled = state.game?.teamsEnabled ?? false;
  const teams = state.game?.teams ?? {};

  let openSlotCounter = 0;

  // Unified seat card rendering — handles all seat states
  function renderSeatCard(p: WirePlayer | null, team?: string): string {
    if (!p) {
      // Open slot
      if (!isHost) {
        return '<div class="seat-card open"><span style="color:var(--text-muted);font-size:12px">Open slot</span></div>';
      }
      const slotId = `open-${team ?? 'any'}-${openSlotCounter++}`;
      const isOpen = state.openDropdownId === slotId;
      return `<div class="seat-card open">
        <span style="color:var(--text-muted);font-size:12px">Open slot</span>
        <button class="seat-menu-trigger" data-dropdown-id="${slotId}" aria-haspopup="true" aria-expanded="${isOpen}">+</button>
        <div class="seat-menu${isOpen ? ' open' : ''}" role="menu">
          <button class="seat-menu-item" role="menuitem" data-action="add-bot" data-bot-diff="easy" data-bot-team="${team ?? ''}">Add AI (Easy)</button>
          <button class="seat-menu-item" role="menuitem" data-action="add-bot" data-bot-diff="medium" data-bot-team="${team ?? ''}">Add AI (Medium)</button>
          <button class="seat-menu-item" role="menuitem" data-action="add-bot" data-bot-diff="hard" data-bot-team="${team ?? ''}">Add AI (Hard)</button>
          <button class="seat-menu-item" role="menuitem" data-action="add-bot" data-bot-diff="impossible" data-bot-team="${team ?? ''}">Add AI (Impossible)</button>
        </div>
      </div>`;
    }

    // Filled seat
    const isMe = p.id === state.playerId;
    const hostBadge = p.id === Object.keys(state.game?.players ?? {})[0] ? '<span class="host-badge">HOST</span>' : '';
    const botBadge = p.isBot ? `<span class="bot-badge">${esc(p.aiDifficulty ?? 'bot').toUpperCase()}</span>` : '';

    // Build dropdown menu items
    const menuItems: string[] = [];
    if (teamsEnabled) {
      const myTeam = teams[p.id];
      const otherTeam = myTeam === 'alpha' ? 'bravo' : 'alpha';
      const otherTeamLabel = otherTeam === 'alpha' ? 'Alpha' : 'Bravo';
      const otherTeamPlayers = players.filter(pl => teams[pl.id] === otherTeam);
      const maxPerTeam = MAX_PLAYERS / 2;
      const canMove = otherTeamPlayers.length < maxPerTeam;

      if (isHost) {
        if (canMove) {
          menuItems.push(`<button class="seat-menu-item" role="menuitem" data-action="move" data-target="${p.id}">Move to ${otherTeamLabel}</button>`);
        } else {
          // Other team is full — offer swap with each player on the other team
          for (const op of otherTeamPlayers) {
            menuItems.push(`<button class="seat-menu-item" role="menuitem" data-action="swap" data-player-a="${p.id}" data-player-b="${op.id}">Swap with ${esc(op.name)}</button>`);
          }
        }
      } else if (isMe && !p.isBot) {
        if (canMove) {
          menuItems.push(`<button class="seat-menu-item" role="menuitem" data-action="move" data-target="${p.id}">Move to ${otherTeamLabel}</button>`);
        }
      }
    }

    if (p.isBot && isHost) {
      menuItems.push(`<button class="seat-menu-item seat-menu-item-danger" role="menuitem" data-action="kick" data-bot-id="${p.id}">Kick</button>`);
    }

    // Only show trigger if there are actions
    let dropdownHtml = '';
    if (menuItems.length > 0) {
      const cardId = `seat-${p.id}`;
      const isOpen = state.openDropdownId === cardId;
      dropdownHtml = `
        <button class="seat-menu-trigger" data-dropdown-id="${cardId}" aria-haspopup="true" aria-expanded="${isOpen}">\u22EE</button>
        <div class="seat-menu${isOpen ? ' open' : ''}" role="menu">${menuItems.join('')}</div>`;
    }

    return `<div class="seat-card">
      ${playerIcon(p.isBot)} <span class="player-name">${esc(p.name)}${isMe ? ' (you)' : ''}</span> ${hostBadge}${botBadge}${dropdownHtml}
    </div>`;
  }

  let lobbyBody = '';

  if (teamsEnabled) {
    const maxPerTeam = MAX_PLAYERS / 2;
    const alphaPlayers = players.filter(p => teams[p.id] === 'alpha');
    const bravoPlayers = players.filter(p => teams[p.id] === 'bravo');
    const alphaSlots = Math.max(0, maxPerTeam - alphaPlayers.length);
    const bravoSlots = Math.max(0, maxPerTeam - bravoPlayers.length);

    const alphaCards = alphaPlayers.map(p => renderSeatCard(p, 'alpha')).join('')
      + Array(alphaSlots).fill(0).map(() => renderSeatCard(null, 'alpha')).join('');
    const bravoCards = bravoPlayers.map(p => renderSeatCard(p, 'bravo')).join('')
      + Array(bravoSlots).fill(0).map(() => renderSeatCard(null, 'bravo')).join('');

    lobbyBody = `
      <div class="lobby-columns">
        <div class="lobby-column alpha">
          <div class="lobby-column-header alpha" role="heading" aria-level="3">ALPHA</div>
          ${alphaCards}
        </div>
        <div class="lobby-column bravo">
          <div class="lobby-column-header bravo" role="heading" aria-level="3">BRAVO</div>
          ${bravoCards}
        </div>
      </div>`;
  } else {
    const openSlots = Math.max(0, MAX_PLAYERS - players.length);
    const playerCards = players.map(p => renderSeatCard(p)).join('');
    const openCards = Array(openSlots).fill(0).map(() => renderSeatCard(null)).join('');

    lobbyBody = `
      <div style="width:100%">
        <div class="lobby-column-header" role="heading" aria-level="3" style="color:var(--text-muted)">PLAYERS</div>
        <div class="non-team-grid">
          ${playerCards}${openCards}
        </div>
      </div>`;
  }

  return `
    <div class="screen">
      <h1 class="game-title">SALVO</h1>
      <p class="game-subtitle">Shared-Ocean Battleship</p>
      ${renderError()}
      <div class="waiting-room">
        <h2 class="label" style="margin-bottom:12px">Game Created</h2>
        <div class="join-code" id="copy-code" title="Click to copy">${state.joinCode ?? ''}</div>
        <p class="join-code-hint">Click to copy &bull; Share with friends</p>
        ${lobbyBody}
        <p class="player-count">${players.length} of 2\u2013${MAX_PLAYERS} players</p>
        ${isHost ? `<button class="btn btn-amber" id="btn-start" ${canStart ? '' : 'disabled'}>${canStart ? 'Start Game' : 'Need 2+ Players'}</button>` : '<p class="player-count">Waiting for host to start...</p>'}
      </div>
    </div>`;
}

function renderPlacement(): string {
  const placedLengths = new Set(state.placedShips.map(s => s.length));
  const allPlaced = SHIP_LENGTHS.every(l => placedLengths.has(l));
  const teamsEnabled = state.game?.teamsEnabled ?? false;

  const dockHtml = SHIP_LENGTHS.map(length => {
    const placed = placedLengths.has(length);
    const cells = Array(length).fill('<div class="dock-ship-cell"></div>').join('');
    return `<div class="dock-ship ${placed ? 'placed' : ''}" data-ship-length="${length}">
      ${cells}<span class="dock-ship-name">${SHIP_NAMES[length]}</span>
    </div>`;
  }).join('');

  // Readiness indicators
  const players = state.game ? Object.values(state.game.players) : [];
  const readinessHtml = players.map(p => {
    const hasShips = p.ships.length > 0;
    if (hasShips) {
      return `<span class="readiness-indicator ready">${esc(p.name)} Ready \u2713</span>`;
    }
    return `<span class="readiness-indicator placing">${esc(p.name)} Placing<span class="placing-dots">...</span></span>`;
  }).join(' ');

  // Placement timer
  const placementTimerHtml = state.placementTimerSeconds !== null
    ? `<div class="placement-timer ${state.placementTimerSeconds <= 10 ? 'warning' : ''}">${Math.floor(state.placementTimerSeconds / 60)}:${(state.placementTimerSeconds % 60).toString().padStart(2, '0')}</div>`
    : '';

  return `
    <div class="screen">
      <h1 class="game-title" style="font-size:32px">PLACE YOUR SHIPS</h1>
      ${placementTimerHtml}
      <div style="margin-bottom:12px">${readinessHtml}</div>
      ${renderError()}
      <div class="placement-screen">
        <div class="ship-dock">
          <h3>Ships</h3>
          ${dockHtml}
          <div class="placement-hint">
            Click a ship, then click the grid to place it.<br>
            Press <strong>R</strong> or tap <strong>Rotate</strong> to change orientation.<br>
            Click a placed ship to remove it.
          </div>
          <button class="btn btn-secondary" id="btn-rotate" style="margin-top:8px">Rotate</button>
          <button class="btn btn-secondary" id="btn-randomize" style="margin-top:8px">Randomize</button>
          <button class="btn btn-secondary reset-btn" id="btn-reset" style="margin-top:8px" ${state.shipsSent ? 'disabled' : ''}>Reset</button>
          <button class="btn btn-danger" id="btn-surrender" style="margin-top:16px">Surrender</button>
        </div>
        <div class="grid-container">
          <div class="grid-panel">
            <h3>Your Ocean</h3>
            ${renderGrid('placement')}
          </div>
          ${state.shipsSent
            ? '<div class="alert alert-info" style="margin-top:16px;max-width:300px">Ships locked in \u2014 waiting for other players...</div>'
            : allPlaced
              ? `<div style="display:flex;gap:8px;margin-top:16px;max-width:300px">
                  <button class="btn btn-primary" id="btn-ready" style="flex:1">Ready!</button>
                </div>`
              : ''}
        </div>
      </div>
      ${teamsEnabled ? renderChat() : ''}
    </div>`;
}

function renderGrid(mode: 'placement' | 'battle'): string {
  let html = '<div class="game-grid">';

  // Header row
  html += '<div class="grid-header"></div>';
  for (let c = 0; c < GRID_SIZE; c++) {
    html += `<div class="grid-header">${c + 1}</div>`;
  }

  // Grid rows
  for (let r = 0; r < GRID_SIZE; r++) {
    html += `<div class="grid-header">${ROWS[r]}</div>`;
    for (let c = 0; c < GRID_SIZE; c++) {
      const coord = coordToId(r, c);
      const { cssClass, symbol, extraHtml } = getCellState(coord, mode);
      html += `<div class="grid-cell ${cssClass}" data-coord="${coord}" data-mode="${mode}">${symbol}${extraHtml || ''}</div>`;
    }
  }

  html += '</div>';
  return html;
}

function getCellState(coord: string, mode: 'placement' | 'battle'): { cssClass: string; symbol: string; extraHtml?: string } {
  const game = state.game;

  if (mode === 'placement') {
    // Ghost preview (own placement)
    if (state.ghostCells.includes(coord)) {
      return state.ghostValid
        ? { cssClass: 'cell-ghost', symbol: '\u25A0' }
        : { cssClass: 'cell-invalid', symbol: '\u25A0' };
    }
    // Placed ships
    for (const ship of state.placedShips) {
      if (ship.cells.includes(coord)) {
        return { cssClass: 'cell-ship', symbol: '\u25A0' };
      }
    }
    // Teammate ghost preview
    if (state.teammateGhostShips.length > 0) {
      for (const ship of state.teammateGhostShips) {
        if (ship.cells.includes(coord)) {
          return { cssClass: 'cell-teammate-ghost', symbol: '\u25A0' };
        }
      }
    }
    return { cssClass: 'cell-empty', symbol: '' };
  }

  // Unified battle grid — shows YOUR ships + teammate ships + all shot results
  if (!game || !state.playerId) return { cssClass: 'cell-empty', symbol: '' };

  const myPlayer = game.players[state.playerId];
  const isShot = game.shots.includes(coord);
  const myShip = myPlayer?.ships.find(s => s.cells.includes(coord));

  // Check for teammate ship (2v2)
  const teammateId = getTeammateId();
  const teammatePlayer = teammateId ? game.players[teammateId] : null;
  const teammateShip = teammatePlayer?.ships.find(s => s.cells.includes(coord));

  // Selected salvo target (highest priority visual)
  if (state.selectedTargets.includes(coord)) {
    return { cssClass: 'cell-selected', symbol: '\u25CE' };
  }

  if (isShot) {
    // This cell has been shot. Determine what happened.
    const hitCount = getHitCountAtCoord(coord);
    const hitBadgeHtml = hitCount > 1 ? `<span class="hit-count-badge">\u00D7${hitCount}</span>` : '';

    if (myShip && myShip.hits.includes(coord)) {
      // My ship was hit at this cell
      let wasSelfHit = false;
      for (const entry of state.shotLog) {
        for (const shot of entry.shots) {
          if (shot.coord === coord && entry.shooterId === state.playerId) {
            wasSelfHit = true;
          }
        }
      }
      return wasSelfHit
        ? { cssClass: 'cell-ff', symbol: '\u26A0', extraHtml: hitBadgeHtml }
        : { cssClass: 'cell-sunk', symbol: '\u00D7', extraHtml: hitBadgeHtml };
    }

    // Teammate ship hit check
    if (teammateShip && teammateShip.hits.includes(coord)) {
      return { cssClass: 'cell-sunk', symbol: '\u00D7', extraHtml: hitBadgeHtml };
    }

    // Not my ship — check if it hit anyone else
    let wasHit = false;
    for (const player of Object.values(game.players)) {
      if (player.id === state.playerId) continue;
      for (const ship of player.ships) {
        if (ship.hits.includes(coord)) { wasHit = true; break; }
      }
      if (wasHit) break;
    }
    // Also check shot log (other players' ship cells aren't visible via toClientView)
    if (!wasHit) {
      for (const entry of state.shotLog) {
        for (const shot of entry.shots) {
          if (shot.coord === coord && shot.hits.length > 0) {
            wasHit = true; break;
          }
        }
        if (wasHit) break;
      }
    }

    if (wasHit) return { cssClass: 'cell-hit', symbol: '\u00D7', extraHtml: hitBadgeHtml };
    return { cssClass: 'cell-miss', symbol: '\u2022' };
  }

  // Not shot yet
  if (myShip) {
    return { cssClass: 'cell-ship', symbol: '\u25A0' };
  }

  // Teammate ship (visible in 2v2, not shot)
  if (teammateShip) {
    return { cssClass: 'cell-teammate-ship', symbol: '\u25A0' };
  }

  return { cssClass: 'cell-empty', symbol: '' };
}

function renderChat(): string {
  const teamsEnabled = state.game?.teamsEnabled ?? false;

  // Filter messages by channel in team mode
  const filteredMessages = teamsEnabled
    ? state.chatMessages.filter(m => m.playerId === 'system' || m.channel === state.chatChannel)
    : state.chatMessages;

  const chatHtml = filteredMessages.slice(-30).map(m => {
    if (m.playerId === 'system') {
      // Game event message
      return `<div class="chat-msg chat-msg-game"><span class="chat-time">${formatTime(m.timestamp)}</span> ${esc(m.text)}</div>`;
    }
    // Player message
    const chatPlayer = state.game?.players[m.playerId];
    const chatIcon = chatPlayer ? playerIcon(chatPlayer.isBot) : '';
    const teamBadge = teamsEnabled && state.game?.teams[m.playerId]
      ? `<span class="team-badge small ${state.game.teams[m.playerId]}">${state.game.teams[m.playerId] === 'alpha' ? 'A' : 'B'}</span>`
      : '';
    return `<div class="chat-msg chat-msg-player">
      <div class="chat-msg-header">${chatIcon}${teamBadge}<span class="chat-name">${esc(m.playerName)}</span><span class="chat-time">${formatTime(m.timestamp)}</span></div>
      <div class="chat-msg-body">${esc(m.text)}</div>
    </div>`;
  }).join('');

  // Chat toggle for team games
  const toggleHtml = teamsEnabled ? `
    <div class="chat-toggle" role="tablist">
      <button class="chat-toggle-tab ${state.chatChannel === 'team' ? 'active team' : ''}" data-channel="team" role="tab" aria-selected="${state.chatChannel === 'team'}">Team</button>
      <button class="chat-toggle-tab ${state.chatChannel === 'global' ? 'active global' : ''}" data-channel="global" role="tab" aria-selected="${state.chatChannel === 'global'}">Global</button>
    </div>
  ` : '';

  const placeholder = teamsEnabled
    ? (state.chatChannel === 'team' ? 'Team message...' : 'Message everyone...')
    : 'Type a message...';

  const sendBtnClass = teamsEnabled
    ? (state.chatChannel === 'team' ? 'btn btn-chat-team' : 'btn btn-chat-global')
    : 'btn btn-secondary';

  return `
    <div class="chat-panel">
      <h3>Chat</h3>
      ${toggleHtml}
      <div class="chat-messages">${chatHtml}</div>
      <div class="chat-input-row">
        <input class="input" id="chat-input" type="text" placeholder="${placeholder}" maxlength="200" autocomplete="off">
        <button class="${sendBtnClass}" id="btn-chat">Send</button>
      </div>
    </div>`;
}

function renderBattle(): string {
  if (!state.game || !state.playerId) return '';

  const myPlayer = state.game.players[state.playerId];
  const currentTurnId = state.game.turnOrder[state.game.currentTurnIndex];
  const isMyTurn = currentTurnId === state.playerId;
  const expectedShots = myPlayer ? myPlayer.shotCount : 0;
  const canFire = isMyTurn && state.selectedTargets.length === expectedShots;
  const teamsEnabled = state.game.teamsEnabled;
  const teams = state.game.teams;

  // Game mode indicator for 2v2
  const gameModeLabel = teamsEnabled
    ? `<div class="game-mode-label"><span class="desktop-only">TEAM BATTLE</span><span class="mobile-only">2v2</span> \u2014 <span class="team-badge alpha" style="font-size:inherit;padding:0;background:none">Alpha</span> vs <span class="team-badge bravo" style="font-size:inherit;padding:0;background:none">Bravo</span></div>`
    : '';

  const playerEntries = Object.entries(state.game.players);
  if (state.game.turnOrder.length > 0) {
    playerEntries.sort((a, b) => state.game!.turnOrder.indexOf(a[0]) - state.game!.turnOrder.indexOf(b[0]));
  }
  const playersHtml = playerEntries.map(([, p]) => {
    const isMe = p.id === state.playerId;
    const isCurrent = p.id === currentTurnId;
    const nameStyle = p.alive ? '' : 'text-decoration:line-through;color:var(--text-muted)';
    const teamBadge = teamsEnabled && teams[p.id]
      ? `<span class="team-badge ${teams[p.id]}" aria-label="Team ${teams[p.id] === 'alpha' ? 'Alpha' : 'Bravo'}">${teams[p.id] === 'alpha' ? 'Alpha' : 'Bravo'}</span>`
      : '';
    return `<li>
      ${playerIcon(p.isBot)}
      <span style="${nameStyle}">${esc(p.name)}${isMe ? ' (you)' : ''}</span>
      ${teamBadge}
      <span style="margin-left:auto;font-family:var(--font-mono);font-size:11px;color:var(--text-muted)">${p.alive ? p.shotCount + ' ships' : 'out'}</span>
      ${isCurrent && p.alive ? '<span style="color:var(--amber);font-size:10px">\u25C0</span>' : ''}
    </li>`;
  }).join('');

  const shotLogHtml = state.shotLog.map(entry => {
    const allCoords = entry.shots.map(s => s.coord).join(',');
    // Shot lines — multi-line dialogue format
    const shotLines = entry.shots.map(shot => {
      if (shot.miss) {
        return `<div class="shot-log-line"><span class="coord">${shot.coord}</span> <span class="miss-text">miss</span></div>`;
      }
      return shot.hits.map(hit => {
        const isSelfHit = hit.playerId === entry.shooterId;
        const isMyShipHit = hit.playerId === state.playerId;
        if (isSelfHit) {
          return `<div class="shot-log-line"><span class="coord">${shot.coord}</span> <span class="ff">${esc(entry.shooterName)}: hit!</span></div>`;
        }
        if (isMyShipHit) {
          return `<div class="shot-log-line"><span class="coord">${shot.coord}</span> <span class="hit">you: hit!</span></div>`;
        }
        return `<div class="shot-log-line"><span class="coord">${shot.coord}</span> <span class="hit">${esc(hit.playerName)}: hit!</span></div>`;
      }).join('');
    }).join('');

    // Sink/elimination lines after the salvo
    const sinkLines = entry.shots.flatMap(shot =>
      shot.hits.filter(h => h.sunk).map(hit => {
        const ownerName = hit.playerId === state.playerId ? 'your' : `${esc(hit.playerName)}'s`;
        return `<div class="shot-log-sink">\u00D7 ${ownerName} ${SHIP_NAMES[hit.shipLength]} sunk</div>`;
      })
    ).join('');

    return `<div class="shot-log-salvo" data-coords="${allCoords}">
      <div class="shot-log-header">${esc(entry.shooterName)} fires:</div>
      ${shotLines}
      ${sinkLines}
    </div>`;
  }).join('');

  const turnText = isMyTurn
    ? `YOUR TURN \u2014 ${expectedShots} shot${expectedShots !== 1 ? 's' : ''}`
    : `${esc(state.game.players[currentTurnId]?.name ?? '???')}'s turn`;

  const timerHtml = state.timerSeconds !== null
    ? `<div class="turn-timer ${state.timerSeconds <= 10 ? 'warning' : ''}">${Math.floor(state.timerSeconds / 60)}:${(state.timerSeconds % 60).toString().padStart(2, '0')}</div>`
    : '';

  return `
    <div class="screen">
      ${renderError()}
      ${gameModeLabel}
      <div class="battle-layout battle-layout-unified">
        <div class="grid-panel${isMyTurn ? ' your-turn-glow' : ''}" id="ocean-panel">
          <h3>Shared Ocean</h3>
          ${renderGrid('battle')}
        </div>
        <div class="side-panel">
          <div class="turn-indicator ${isMyTurn ? 'your-turn' : 'waiting'}">
            ${turnText}
            ${timerHtml}
          </div>
          <h3 class="label" style="margin-bottom:8px">Players</h3>
          <ul class="player-list" style="margin-bottom:12px">${playersHtml}</ul>
          ${isMyTurn ? `
            <button class="btn btn-amber fire-btn" id="btn-fire" ${canFire ? '' : 'disabled'}>FIRE SALVO</button>
            <p class="shot-count">${state.selectedTargets.length} of ${expectedShots} targets selected</p>
          ` : ''}
          <h3 class="label" style="margin:12px 0 8px">Shot Log</h3>
          <div class="shot-log">${shotLogHtml || '<p style="color:var(--text-muted);font-size:12px">No shots fired yet</p>'}</div>
          ${renderChat()}
          ${myPlayer?.alive ? '<button class="btn btn-danger" id="btn-surrender" style="margin-top:12px;width:100%">Surrender</button>' : ''}
        </div>
      </div>
    </div>`;
}

function renderGameOver(): string {
  if (!state.gameOverStats || !state.game) return '';

  const stats = state.gameOverStats;
  const winner = stats.winnerId ? state.game.players[stats.winnerId] : null;
  const teamsEnabled = state.game.teamsEnabled;
  const teams = state.game.teams;
  const winnerTeamId = stats.winnerTeamId;

  // Team or individual winner banner
  let winnerText: string;
  let winnerSubtext: string;
  if (teamsEnabled && winnerTeamId) {
    winnerText = `TEAM ${winnerTeamId.toUpperCase()} WINS!`;
    winnerSubtext = 'The opposing team has been eliminated';
  } else if (winner) {
    winnerText = `${esc(winner.name)} WINS!`;
    winnerSubtext = 'Last player standing';
  } else {
    winnerText = 'DRAW!';
    winnerSubtext = 'All players eliminated simultaneously';
  }

  const highlightsHtml = stats.highlights.map(h => `<p class="highlight">${esc(h)}</p>`).join('');

  // Team aggregate highlights for 2v2
  let teamHighlightsHtml = '';
  if (teamsEnabled) {
    const teamStats: Record<string, { shots: number; hits: number; sunk: number }> = {};
    for (const [pid, s] of Object.entries(stats.playerStats)) {
      const teamId = teams[pid] ?? 'unknown';
      if (!teamStats[teamId]) teamStats[teamId] = { shots: 0, hits: 0, sunk: 0 };
      teamStats[teamId].shots += s.shotsFired;
      teamStats[teamId].hits += s.hitsLanded;
      teamStats[teamId].sunk += s.shipsSunk;
    }
    const teamHighlights: string[] = [];
    for (const [teamId, ts] of Object.entries(teamStats)) {
      const acc = ts.shots > 0 ? Math.round((ts.hits / ts.shots) * 100) : 0;
      const label = teamId === 'alpha' ? 'Alpha' : 'Bravo';
      teamHighlights.push(`Team ${label} Accuracy: ${acc}%`);
      teamHighlights.push(`Team ${label} Damage: ${ts.sunk} ships sunk`);
    }
    teamHighlightsHtml = teamHighlights.map(h => `<p class="highlight">${esc(h)}</p>`).join('');
  }

  const pending = state.rematchPending;
  const alreadyAccepted = pending?.acceptedIds.includes(state.playerId ?? '') ?? false;

  let rematchHtml: string;
  if (alreadyAccepted && pending) {
    rematchHtml = `<div class="alert alert-info" style="max-width:300px;margin:24px auto 0">Waiting for others... (${pending.acceptedIds.length}/${pending.totalHumans})</div>`;
  } else {
    rematchHtml = `<button class="btn btn-amber" id="btn-rematch" style="max-width:300px;margin:24px auto 0">Play Again</button>`;
  }

  // Stats table
  const players = state.game ? Object.values(state.game.players) : [];
  const statsRows = players.map(p => {
    const s = stats.playerStats[p.id];
    if (!s) return '';
    const accPct = Math.round(s.accuracy * 100);
    const isWinner = teamsEnabled ? teams[p.id] === winnerTeamId : p.id === stats.winnerId;
    const rowStyle = isWinner ? 'color:var(--green)' : '';
    const teamBadge = teamsEnabled && teams[p.id]
      ? `<span class="team-badge ${teams[p.id]}">${teams[p.id] === 'alpha' ? 'Alpha' : 'Bravo'}</span>`
      : '';
    return `<tr style="${rowStyle}">
      <td>${playerIcon(p.isBot)}${esc(p.name)}${isWinner ? ' \u2605' : ''} ${teamBadge}</td>
      <td>${s.shotsFired}</td>
      <td>${s.hitsLanded}</td>
      <td>${accPct}%</td>
      <td>${s.shipsSunk}</td>
      <td>${s.friendlyFireHits}</td>
    </tr>`;
  }).join('');

  const winClass = teamsEnabled && winnerTeamId
    ? (winnerTeamId === 'alpha' ? 'team-win-alpha' : 'team-win-bravo')
    : winner ? '' : 'draw';

  return `
    <div class="screen">
      <div class="game-over">
        <h1 class="${winClass}">${winnerText}</h1>
        <p style="color:var(--text-secondary);margin-bottom:16px">${winnerSubtext}</p>
        ${highlightsHtml}
        ${teamHighlightsHtml}
        <table class="stats-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Shots</th>
              <th>Hits</th>
              <th>Accuracy</th>
              <th>Sunk</th>
              <th>FF</th>
            </tr>
          </thead>
          <tbody>${statsRows}</tbody>
        </table>
        ${rematchHtml}
        <button class="btn btn-secondary" id="btn-new-game" style="max-width:300px;margin:12px auto 0">New Game</button>
      </div>
    </div>`;
}

// ============================================================
// Event Binding
// ============================================================

function bindEvents(): void {
  // Lobby
  on('btn-changelog', 'click', () => {
    state.screen = 'changelog';
    render();
    loadChangelog();
  });

  on('btn-changelog-back', 'click', () => {
    state.screen = 'lobby';
    render();
  });

  // Auto-focus name field on first visit
  if (state.screen === 'lobby' && !state.savedPlayerName) {
    setTimeout(() => document.getElementById('player-name')?.focus(), 0);
  }

  // Quick Play
  on('btn-qp-1v1', 'click', () => {
    const name = val('player-name');
    if (!name) return showError('Enter your name');
    state.savedPlayerName = name;
    state.queueMode = '1v1';
    state.queueSize = 0;
    state.screen = 'queue';
    history.pushState({ screen: 'queue' }, '');
    socket.emit('quickplay-join', { playerName: name, mode: '1v1' });
    render();
  });

  on('btn-qp-2v2', 'click', () => {
    const name = val('player-name');
    if (!name) return showError('Enter your name');
    state.savedPlayerName = name;
    state.queueMode = '2v2';
    state.queueSize = 0;
    state.screen = 'queue';
    history.pushState({ screen: 'queue' }, '');
    socket.emit('quickplay-join', { playerName: name, mode: '2v2' });
    render();
  });

  on('btn-qp-ffa', 'click', () => {
    const name = val('player-name');
    if (!name) return showError('Enter your name');
    state.savedPlayerName = name;
    state.queueMode = 'ffa';
    state.queueSize = 0;
    state.screen = 'queue';
    history.pushState({ screen: 'queue' }, '');
    socket.emit('quickplay-join', { playerName: name, mode: 'ffa' });
    render();
  });

  on('btn-queue-cancel', 'click', () => {
    socket.emit('quickplay-leave');
    state.screen = 'lobby';
    state.queueMode = null;
    state.queueSize = 0;
    render();
  });

  on('btn-create', 'click', () => {
    const name = val('player-name');
    if (!name) return showError('Enter your name');
    state.savedPlayerName = name;
    state.showCreateModal = true;
    render();
  });

  on('btn-create-confirm', 'click', () => {
    const name = state.savedPlayerName;
    if (!name) return showError('Enter your name');
    const timerEnabled = (document.getElementById('timer-enabled') as HTMLInputElement)?.checked ?? false;
    const timerSecs = parseInt((document.getElementById('timer-seconds') as HTMLSelectElement)?.value ?? '60', 10);
    const placementTimerEnabled = (document.getElementById('placement-timer-enabled') as HTMLInputElement)?.checked ?? false;
    const teamsEnabled = (document.getElementById('teams-enabled') as HTMLInputElement)?.checked ?? false;
    state.isHost = true;
    state.showCreateModal = false;
    socket.emit('create-game', {
      playerName: name,
      timerConfig: { enabled: timerEnabled, seconds: timerSecs },
      placementTimerConfig: { enabled: placementTimerEnabled, seconds: timerSecs },
      teamsEnabled,
    });
  });

  on('btn-create-cancel', 'click', () => {
    state.showCreateModal = false;
    render();
  });

  on('create-modal-overlay', 'click', (e?: Event) => {
    if ((e?.target as HTMLElement)?.id === 'create-modal-overlay') {
      state.showCreateModal = false;
      render();
    }
  });

  on('btn-show-join', 'click', () => {
    const name = val('player-name');
    if (!name) return showError('Enter your name');
    state.savedPlayerName = name;
    state.showJoinModal = true;
    render();
    // Focus the code input after render
    setTimeout(() => document.getElementById('join-code')?.focus(), 0);
  });

  on('btn-join', 'click', () => {
    const code = val('join-code');
    if (!code) return showError('Enter a game code');
    state.showJoinModal = false;
    socket.emit('join-game', { code: code.toUpperCase(), playerName: state.savedPlayerName || 'Player' });
  });

  on('btn-join-cancel', 'click', () => {
    state.showJoinModal = false;
    render();
  });

  // Close modal on overlay click
  on('join-modal-overlay', 'click', (e?: Event) => {
    if ((e?.target as HTMLElement)?.id === 'join-modal-overlay') {
      state.showJoinModal = false;
      render();
    }
  });

  // Enter key on inputs
  onKey('player-name', 'Enter', () => document.getElementById('btn-create')?.click());
  onKey('join-code', 'Enter', () => document.getElementById('btn-join')?.click());
  onKey('chat-input', 'Enter', () => document.getElementById('btn-chat')?.click());

  // Waiting room
  on('copy-code', 'click', () => {
    if (state.joinCode) {
      navigator.clipboard.writeText(state.joinCode).catch(() => {});
    }
  });

  on('btn-start', 'click', () => {
    socket.emit('start-game');
  });

  on('btn-add-bot', 'click', () => {
    const select = document.getElementById('bot-difficulty') as HTMLSelectElement | null;
    const difficulty = (select?.value ?? 'medium') as AiDifficulty;
    socket.emit('add-bot', { difficulty });
  });

  // Seat dropdown triggers
  document.querySelectorAll('.seat-menu-trigger').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const dropdownId = el.getAttribute('data-dropdown-id');
      if (!dropdownId) return;
      state.openDropdownId = state.openDropdownId === dropdownId ? null : dropdownId;
      render();
    });
  });

  // Seat dropdown menu actions
  document.querySelectorAll('.seat-menu-item').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = el.getAttribute('data-action');
      if (action === 'add-bot') {
        const difficulty = el.getAttribute('data-bot-diff') as AiDifficulty;
        const team = el.getAttribute('data-bot-team') || undefined;
        if (difficulty) socket.emit('add-bot', { difficulty, ...(team ? { team } : {}) });
      } else if (action === 'move') {
        const targetId = el.getAttribute('data-target');
        if (targetId) socket.emit('swap-team', { targetPlayerId: targetId });
      } else if (action === 'swap') {
        const playerA = el.getAttribute('data-player-a');
        const playerB = el.getAttribute('data-player-b');
        if (playerA && playerB) socket.emit('swap-players', { playerA, playerB });
      } else if (action === 'kick') {
        const botId = el.getAttribute('data-bot-id');
        if (botId) socket.emit('remove-bot', { botId });
      }
      state.openDropdownId = null;
      render();
    });
  });

  // Smart flip dropdown positioning
  document.querySelectorAll('.seat-menu.open').forEach(menu => {
    const trigger = menu.previousElementSibling as HTMLElement;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const menuHeight = menu.getBoundingClientRect().height;
    if (rect.bottom + menuHeight > window.innerHeight) {
      menu.classList.add('flip-up');
    }
  });

  // Hover-to-highlight: shot log entries highlight grid cells
  document.querySelectorAll('.shot-log-salvo').forEach(el => {
    const coordsAttr = el.getAttribute('data-coords');
    if (!coordsAttr) return;
    const coords = coordsAttr.split(',');

    el.addEventListener('mouseenter', () => {
      coords.forEach(c => {
        const cell = document.querySelector(`.grid-cell[data-coord="${c}"]`);
        if (cell) cell.classList.add('cell-highlight');
      });
    });
    el.addEventListener('mouseleave', () => {
      document.querySelectorAll('.cell-highlight').forEach(c => c.classList.remove('cell-highlight'));
    });

    // Mobile: tap to toggle
    el.addEventListener('click', () => {
      const hasHighlight = document.querySelector('.cell-highlight');
      document.querySelectorAll('.cell-highlight').forEach(c => c.classList.remove('cell-highlight'));
      if (!hasHighlight || !coords.some(c => document.querySelector(`.grid-cell[data-coord="${c}"].cell-highlight`))) {
        coords.forEach(c => {
          const cell = document.querySelector(`.grid-cell[data-coord="${c}"]`);
          if (cell) cell.classList.add('cell-highlight');
        });
      }
    });
  });

  // Chat toggle tabs
  document.querySelectorAll('.chat-toggle-tab').forEach(el => {
    el.addEventListener('click', () => {
      const channel = el.getAttribute('data-channel') as ChatChannel;
      if (channel) {
        state.chatChannel = channel;
        render();
      }
    });
  });

  // Chat toggle keyboard navigation
  document.querySelectorAll('.chat-toggle-tab').forEach(el => {
    el.addEventListener('keydown', (e) => {
      const ke = e as KeyboardEvent;
      if (ke.key === 'ArrowLeft' || ke.key === 'ArrowRight') {
        ke.preventDefault();
        state.chatChannel = state.chatChannel === 'team' ? 'global' : 'team';
        render();
      }
    });
  });

  // Placement
  document.querySelectorAll('.dock-ship:not(.placed)').forEach(el => {
    el.addEventListener('click', () => {
      const length = parseInt(el.getAttribute('data-ship-length') ?? '0', 10);
      if (state.placedShips.some(s => s.length === length)) return;
      state.placingShip = { length, horizontal: true };
      state.ghostCells = [];
      render();
    });
  });

  on('btn-rotate', 'click', () => {
    if (state.placingShip) {
      state.placingShip.horizontal = !state.placingShip.horizontal;
      state.ghostCells = [];
      state.ghostValid = false;
      render();
    }
  });

  on('btn-randomize', 'click', () => {
    if (!state.shipsSent) randomizePlacement();
  });

  on('btn-reset', 'click', () => {
    if (!state.shipsSent) {
      state.placedShips = [];
      state.placingShip = null;
      state.ghostCells = [];
      state.ghostValid = false;
      render();
    }
  });

  // Keyboard rotate
  document.addEventListener('keydown', (e) => {
    if (e.key === 'r' || e.key === 'R') {
      if (state.screen === 'placement' && state.placingShip) {
        state.placingShip.horizontal = !state.placingShip.horizontal;
        state.ghostCells = [];
        state.ghostValid = false;
        render();
      }
    }
  });

  // Grid cell clicks
  document.querySelectorAll('.grid-cell').forEach(el => {
    const coord = el.getAttribute('data-coord');
    const mode = el.getAttribute('data-mode');
    if (!coord) return;

    // Hover for ghost preview (placement)
    if (mode === 'placement') {
      el.addEventListener('mouseenter', () => {
        if (!state.placingShip) return;
        const row = ROWS.indexOf(coord[0]);
        const col = parseInt(coord.slice(1), 10) - 1;
        const cells = getShipCells(row, col, state.placingShip.length, state.placingShip.horizontal);
        if (cells) {
          state.ghostCells = cells;
          // Check validity
          const occupied = new Set(state.placedShips.flatMap(s => s.cells));
          state.ghostValid = cells.every(c => !occupied.has(c));
          render();
        }
      });

      el.addEventListener('mouseleave', () => {
        if (state.placingShip && state.ghostCells.length > 0) {
          state.ghostCells = [];
          render();
        }
      });
    }

    el.addEventListener('click', () => {
      if (mode === 'placement') {
        handlePlacementClick(coord);
      } else if (mode === 'battle') {
        handleTargetClick(coord);
      }
    });
  });

  on('btn-ready', 'click', () => {
    socket.emit('place-ships', { ships: state.placedShips });
    // Also emit placement preview for teammate
    if (state.game?.teamsEnabled) {
      socket.emit('placement-preview', { ships: state.placedShips });
    }
    state.shipsSent = true;
    render();
  });

  on('btn-fire', 'click', () => {
    if (state.selectedTargets.length === 0) return;
    socket.emit('fire', { coords: state.selectedTargets });
    state.isMyTurn = false;
    stopTimer();
  });

  // Mobile tabs removed — unified grid doesn't need them

  // Chat
  on('btn-chat', 'click', () => {
    const text = val('chat-input');
    if (!text) return;
    const channel: ChatChannel | undefined = state.game?.teamsEnabled ? state.chatChannel : undefined;
    socket.emit('chat-message', { text, channel });
    (document.getElementById('chat-input') as HTMLInputElement).value = '';
  });

  // Rematch
  on('btn-rematch', 'click', () => {
    // For QP games, Play Again means requeue
    if (state.game && state.game.mode !== 'private') {
      const modeMap: Record<string, QuickPlayMode> = {
        'quickplay-1v1': '1v1',
        'quickplay-2v2': '2v2',
        'quickplay-ffa': 'ffa',
      };
      const qpMode = modeMap[state.game.mode] ?? '1v1';
      state.queueMode = qpMode;
      state.queueSize = 0;
    }
    socket.emit('rematch-request');
  });

  on('btn-new-game', 'click', () => {
    socket.emit('rematch-decline');
    sessionStorage.removeItem('salvo-playerId');
    sessionStorage.removeItem('salvo-gameId');
    state.screen = 'lobby';
    state.playerId = null;
    state.gameId = null;
    state.game = null;
    state.joinCode = null;
    state.isHost = false;
    state.placedShips = [];
    state.selectedTargets = [];
    state.shotLog = [];
    state.chatMessages = [];
    state.gameOverStats = null;
    state.rematchPending = null;
    state.queueMode = null;
    state.queueSize = 0;
    render();
  });

  // Surrender
  on('btn-surrender', 'click', () => {
    state.showSurrenderModal = true;
    render();
  });

  on('btn-surrender-confirm', 'click', () => {
    socket.emit('surrender');
    state.showSurrenderModal = false;
  });

  on('btn-surrender-cancel', 'click', () => {
    state.showSurrenderModal = false;
    render();
  });

  on('surrender-modal-overlay', 'click', (e?: Event) => {
    if ((e?.target as HTMLElement)?.id === 'surrender-modal-overlay') {
      state.showSurrenderModal = false;
      render();
    }
  });

  // Rejoin modal
  on('btn-rejoin-yes', 'click', () => {
    const savedPlayerId = sessionStorage.getItem('salvo-playerId');
    const savedGameId = sessionStorage.getItem('salvo-gameId');
    if (savedPlayerId && savedGameId) {
      socket.emit('rejoin', { playerId: savedPlayerId, gameId: savedGameId });
    }
    // Show loading state — modal stays visible until game-state arrives
    const btn = document.getElementById('btn-rejoin-yes') as HTMLButtonElement | null;
    if (btn) {
      btn.textContent = 'Rejoining...';
      btn.disabled = true;
    }
    if (state.rejoinCountdownInterval) clearInterval(state.rejoinCountdownInterval);
    state.rejoinCountdownInterval = null;
    // Fallback: dismiss modal after 5s if game-state never arrives
    setTimeout(() => {
      if (state.showRejoinModal) {
        state.showRejoinModal = false;
        sessionStorage.removeItem('salvo-playerId');
        sessionStorage.removeItem('salvo-gameId');
        render();
      }
    }, 5000);
  });

  on('btn-rejoin-no', 'click', () => {
    const savedPlayerId = sessionStorage.getItem('salvo-playerId');
    const savedGameId = sessionStorage.getItem('salvo-gameId');
    if (savedPlayerId && savedGameId) {
      socket.emit('decline-rejoin', { playerId: savedPlayerId, gameId: savedGameId });
    }
    sessionStorage.removeItem('salvo-playerId');
    sessionStorage.removeItem('salvo-gameId');
    state.showRejoinModal = false;
    if (state.rejoinCountdownInterval) clearInterval(state.rejoinCountdownInterval);
    state.rejoinCountdownInterval = null;
    render();
  });
}

function randomizePlacement(): void {
  const occupied = new Set<string>();
  const ships: ShipPlacement[] = [];

  // Place largest ships first (harder to fit)
  const lengths = [...SHIP_LENGTHS].sort((a, b) => b - a);

  for (const length of lengths) {
    let placed = false;
    for (let attempt = 0; attempt < 200; attempt++) {
      const horizontal = Math.random() < 0.5;
      const maxRow = horizontal ? GRID_SIZE : GRID_SIZE - length;
      const maxCol = horizontal ? GRID_SIZE - length : GRID_SIZE;
      const row = Math.floor(Math.random() * maxRow);
      const col = Math.floor(Math.random() * maxCol);

      const cells = getShipCells(row, col, length, horizontal);
      if (!cells) continue;
      if (cells.some(c => occupied.has(c))) continue;

      cells.forEach(c => occupied.add(c));
      ships.push({ length, cells });
      placed = true;
      break;
    }
    if (!placed) {
      // Extremely unlikely on 10x10 with 4 small ships, but handle gracefully
      state.placedShips = [];
      randomizePlacement();
      return;
    }
  }

  state.placedShips = ships;
  state.placingShip = null;
  state.ghostCells = [];
  render();
  emitPlacementPreview();
}

function handlePlacementClick(coord: string): void {
  // If clicking on an already-placed ship, remove it
  const existingIdx = state.placedShips.findIndex(s => s.cells.includes(coord));
  if (existingIdx !== -1) {
    state.placedShips.splice(existingIdx, 1);
    render();
    emitPlacementPreview();
    return;
  }

  // If placing a ship
  if (!state.placingShip) return;

  const row = ROWS.indexOf(coord[0]);
  const col = parseInt(coord.slice(1), 10) - 1;
  const cells = getShipCells(row, col, state.placingShip.length, state.placingShip.horizontal);
  if (!cells) return showError('Ship would go out of bounds');

  // Check overlap
  const occupied = new Set(state.placedShips.flatMap(s => s.cells));
  if (cells.some(c => occupied.has(c))) return showError('Ships overlap');

  state.placedShips.push({ length: state.placingShip.length, cells });
  state.placingShip = null;
  state.ghostCells = [];
  render();
  emitPlacementPreview();
}

function handleTargetClick(coord: string): void {
  if (!state.isMyTurn || !state.game || !state.playerId) return;

  // Can't select already-shot coordinates
  if (state.game.shots.includes(coord)) return;

  const myPlayer = state.game.players[state.playerId];
  if (!myPlayer) return;
  const maxShots = myPlayer.shotCount;

  const idx = state.selectedTargets.indexOf(coord);
  if (idx !== -1) {
    // Deselect
    state.selectedTargets.splice(idx, 1);
  } else if (state.selectedTargets.length < maxShots) {
    // Select
    state.selectedTargets.push(coord);
  }
  render();
}

// ============================================================
// DOM Helpers
// ============================================================

function on(id: string, event: string, handler: (e?: Event) => void): void {
  document.getElementById(id)?.addEventListener(event, handler);
}

function onKey(id: string, key: string, handler: () => void): void {
  document.getElementById(id)?.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === key) handler();
  });
}

function val(id: string): string {
  return (document.getElementById(id) as HTMLInputElement)?.value?.trim() ?? '';
}

function playerIcon(isBot: boolean): string {
  if (isBot) {
    // Robot head — simple geometric bot face
    return `<span class="player-icon"><svg viewBox="0 0 16 16" fill="var(--green)"><rect x="3" y="5" width="10" height="8" rx="2"/><rect x="6" y="1" width="4" height="4" rx="1"/><rect x="5" y="7" width="2" height="2" rx="0.5"/><rect x="9" y="7" width="2" height="2" rx="0.5"/><rect x="6" y="11" width="4" height="1"/></svg></span>`;
  }
  // Person silhouette — head circle + shoulders
  return `<span class="player-icon"><svg viewBox="0 0 16 16" fill="var(--green)"><circle cx="8" cy="4" r="3"/><path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6"/></svg></span>`;
}

function esc(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

// ============================================================
// ============================================================
// Theme Toggle
// ============================================================

function initTheme(): void {
  const saved = localStorage.getItem('salvo-theme');
  if (saved === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  }

  const btn = document.createElement('button');
  btn.className = 'theme-toggle';
  btn.textContent = saved === 'light' ? 'DARK' : 'LIGHT';
  btn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'light' ? '' : 'light';
    if (next) {
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('salvo-theme', 'light');
      btn.textContent = 'DARK';
    } else {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('salvo-theme', 'dark');
      btn.textContent = 'LIGHT';
    }
  });
  document.body.appendChild(btn);
}

function initMuteToggle(): void {
  const btn = document.createElement('button');
  btn.className = 'mute-toggle';
  btn.id = 'global-mute';
  btn.textContent = state.matchSoundMuted ? 'UNMUTE' : 'MUTE';
  btn.addEventListener('click', () => {
    state.matchSoundMuted = !state.matchSoundMuted;
    localStorage.setItem('salvo-muted', String(state.matchSoundMuted));
    btn.textContent = state.matchSoundMuted ? 'UNMUTE' : 'MUTE';
  });
  document.body.appendChild(btn);
}

// ============================================================
// Initial Render
// ============================================================

initTheme();
initMuteToggle();

// Click-outside handler for dropdowns — registered once, not per-render
document.addEventListener('click', () => {
  if (state.openDropdownId) {
    state.openDropdownId = null;
    render();
  }
});

render();
