import { io, Socket } from 'socket.io-client';
import type {
  ClientToServerEvents, ServerToClientEvents,
  WireGame, WirePlayer, ShotResult, ShipPlacement,
  ChatMessage, GameOverStats, TimerConfig, AiDifficulty,
  QuickPlayMode, ChatChannel, PlayerColor,
} from '@salvo/shared';
import { SHIP_LENGTHS, SHIP_NAMES, SLOT_COLORS } from '@salvo/shared';
import { renderHexGridSVG, svgClickToHex, getShipPreview, nextDirection, parseHex, hexToString, allHexes, hexLinear, isValidHex, HEX_DIRECTIONS, PLAYER_COLOR_HEX } from './hexGrid.js';
import type { CellState, ShipHullData } from './hexGrid.js';
import { marked } from 'marked';
import './style.css';

declare const __APP_VERSION__: string;
const VERSION = __APP_VERSION__;

// ============================================================
// Storage Key Migration (salvo- → hullcracker-)
// ============================================================

(function migrateStorageKeys() {
  const migrations = [
    ['salvo-player-name', 'hullcracker-player-name'],
    ['salvo-muted', 'hullcracker-muted'],
    ['salvo-theme', 'hullcracker-theme'],
    ['salvo-playerId', 'hullcracker-playerId'],
    ['salvo-gameId', 'hullcracker-gameId'],
  ];
  for (const [oldKey, newKey] of migrations) {
    const lsVal = localStorage.getItem(oldKey);
    if (lsVal !== null && localStorage.getItem(newKey) === null) {
      localStorage.setItem(newKey, lsVal);
      localStorage.removeItem(oldKey);
    }
    const ssVal = sessionStorage.getItem(oldKey);
    if (ssVal !== null && sessionStorage.getItem(newKey) === null) {
      sessionStorage.setItem(newKey, ssVal);
      sessionStorage.removeItem(oldKey);
    }
  }
})();

// ============================================================
// Random Name Generation
// ============================================================

// Pre-audited: max adjective (9) + space (1) + max noun (9) = 19 ≤ 20
const ADJECTIVES = [
  'Swift', 'Bold', 'Silent', 'Iron', 'Crimson',
  'Brave', 'Shadow', 'Storm', 'Rusty', 'Golden',
  'Rogue', 'Salty', 'Phantom', 'Fierce', 'Neon',
  'Ashen', 'Daring', 'Copper', 'Wicked',
];

const NOUNS = [
  'Torpedo', 'Kraken', 'Anchor', 'Corsair', 'Falcon',
  'Marlin', 'Cannon', 'Voyager', 'Riptide', 'Serpent',
  'Badger', 'Cutlass', 'Frigate', 'Osprey', 'Trident',
  'Sabre', 'Reef', 'Dagger', 'Tempest',
];

function generateRandomName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adj} ${noun}`;
}

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
  placingShip: { length: number; dirIndex: number } | null;
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
  // Info notification (host transfer etc.)
  infoMessage: string | null;
  infoMessageTimeout: ReturnType<typeof setTimeout> | null;
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
  savedPlayerName: localStorage.getItem('hullcracker-player-name') || generateRandomName(),
  queueMode: null,
  queueSize: 0,
  onlineCount: 0,
  matchSoundMuted: localStorage.getItem('hullcracker-muted') === 'true',
  openDropdownId: null as string | null,
  showSurrenderModal: false,
  showRejoinModal: false,
  rejoinTimeRemaining: 0,
  rejoinCountdownInterval: null,
  errorMessage: null,
  errorTimeout: null,
  infoMessage: null,
  infoMessageTimeout: null,
};

// Persist initial name (covers first-visit generation)
if (!localStorage.getItem('hullcracker-player-name')) {
  localStorage.setItem('hullcracker-player-name', state.savedPlayerName);
}

function saveName(name: string): void {
  state.savedPlayerName = name;
  localStorage.setItem('hullcracker-player-name', name);
}

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

socket.on('game-state', ({ game }) => {
  // Detect host transfer: if hostId changed to me, show notification
  const prevHostId = state.game?.hostId;
  if (prevHostId && prevHostId !== game.hostId && game.hostId === state.playerId) {
    state.isHost = true;
    state.infoMessage = 'You are now the host';
    state.infoMessageTimeout = setTimeout(() => {
      state.infoMessage = null;
      render();
    }, 5000);
  }
  state.game = game;
  // Dismiss rejoin modal on successful rejoin
  if (state.showRejoinModal) {
    state.showRejoinModal = false;
    if (state.rejoinCountdownInterval) clearInterval(state.rejoinCountdownInterval);
    state.rejoinCountdownInterval = null;
  }
  // Restore player identity from sessionStorage on rejoin (state is fresh after page refresh)
  if (!state.playerId) {
    const saved = sessionStorage.getItem('hullcracker-playerId');
    if (saved && game.players[saved]) {
      state.playerId = saved;
      state.gameId = game.id;
    }
  }
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
let isInitialPageLoad = true;
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

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      sharedAudioCtx = new AudioContext();
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

function playTone(
  freqStart: number, freqMid: number, freqEnd: number,
  duration: number, volume: number, type: OscillatorType = 'sine'
): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freqMid, ctx.currentTime + duration * 0.3);
    osc.frequency.exponentialRampToValueAtTime(freqEnd, ctx.currentTime + duration * 0.7);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch {
    // Audio not supported — silently ignore
  }
}

function playMatchSound(): void {
  if (state.matchSoundMuted) return;
  playTone(600, 1200, 800, 0.5, 0.3);
}

function playTurnSound(): void {
  if (state.matchSoundMuted) return;
  playTone(400, 800, 600, 0.4, 0.2);
}

function playSalvoSound(shots: ShotResult[]): void {
  if (state.matchSoundMuted) return;
  const hasSunk = shots.some(s => s.hits.some(h => h.sunk));
  const hasHit = shots.some(s => s.hits.length > 0);
  if (hasSunk) {
    // Alarm warble — sunk ship detected
    playTone(600, 900, 500, 0.6, 0.25);
  } else if (hasHit) {
    // Impact — confirmed hit
    playTone(400, 600, 300, 0.35, 0.25);
  } else {
    // Sonar ping — all miss
    playTone(200, 300, 150, 0.3, 0.15);
  }
}

function playPlacementSound(): void {
  if (state.matchSoundMuted) return;
  playTone(300, 350, 250, 0.15, 0.15);
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

  // Capture scroll positions before innerHTML destroys the DOM
  const shotLog = document.querySelector('.shot-log');
  const chatMsgs = document.querySelector('.chat-messages');
  const shotLogScroll = shotLog ? shotLog.scrollTop : null;
  const chatScroll = chatMsgs ? chatMsgs.scrollTop : null;

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

  // Restore scroll positions after DOM rebuild
  if (shotLogScroll !== null) {
    const el = document.querySelector('.shot-log');
    if (el) el.scrollTop = shotLogScroll;
  }
  if (chatScroll !== null) {
    const el = document.querySelector('.chat-messages');
    if (el) el.scrollTop = chatScroll;
  }

  bindEvents();
}

function renderError(): string {
  const parts: string[] = [];
  if (state.errorMessage) parts.push(`<div class="alert alert-error">${esc(state.errorMessage)}</div>`);
  if (state.infoMessage) parts.push(`<div class="alert alert-info">${esc(state.infoMessage)}</div>`);
  return parts.join('');
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

  return `
    <div class="screen">
      <h1 class="game-title">HULLCRACKER.IO</h1>
      <p class="game-subtitle">Multiplayer Naval Warfare</p>
      <p class="online-count" id="online-count">${state.onlineCount > 0 ? `${state.onlineCount} player${state.onlineCount !== 1 ? 's' : ''} online` : ''}</p>
      ${renderError()}
      <div class="lobby-card" style="max-width:400px;width:100%">
        <label class="input-label">Your Name</label>
        <div style="display:flex;gap:8px">
          <input class="input" id="player-name" type="text" placeholder="Enter your name" maxlength="20" autocomplete="off" value="${esc(state.savedPlayerName)}" style="flex:1">
          <button class="btn-dice" id="btn-randomize" type="button" title="Random name">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none"/><circle cx="15.5" cy="8.5" r="1.5" fill="currentColor" stroke="none"/><circle cx="8.5" cy="15.5" r="1.5" fill="currentColor" stroke="none"/><circle cx="15.5" cy="15.5" r="1.5" fill="currentColor" stroke="none"/></svg>
          </button>
        </div>
        <div class="quickplay-section">
          <p class="label" style="margin-bottom:8px">Quick Play</p>
          <div style="display:flex;gap:8px">
            <button class="btn btn-amber btn-quickplay" id="btn-qp-1v1" style="flex:1">1v1</button>
            <button class="btn btn-amber btn-quickplay" id="btn-qp-3ffa" style="flex:1">3-FFA</button>
            <button class="btn btn-amber btn-quickplay" id="btn-qp-6ffa" style="flex:1">6-FFA</button>
          </div>
          <div style="display:flex;gap:8px;margin-top:8px">
            <button class="btn btn-amber btn-quickplay" id="btn-qp-2v2" style="flex:1" title="Random teammate — coordinate to win">2v2</button>
            <button class="btn btn-amber btn-quickplay" id="btn-qp-3v3" style="flex:1">3v3</button>
            <button class="btn btn-amber btn-quickplay" id="btn-qp-2v2v2" style="flex:1">2v2v2</button>
          </div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary" id="btn-create" style="flex:1">Create Game</button>
          <button class="btn btn-outline-green" id="btn-show-join" style="flex:1">Join Game</button>
        </div>
      </div>
      ${joinModalHtml}
      <div class="lobby-footer">
        <span>v${VERSION}</span>
        <span class="footer-sep">&bull;</span>
        <a href="#" id="btn-changelog">Changelog</a>
      </div>
    </div>`;
}


function renderQueue(): string {
  const mode = state.queueMode;
  function getTargetSize(m: QuickPlayMode | null): number {
    switch (m) {
      case '1v1': return 2;
      case '2v2': return 4;
      case '3v3': return 6;
      case '3ffa': return 3;
      case '6ffa': return 6;
      case '2v2v2': return 6;
      default: return 2;
    }
  }
  function getModeLabel(m: QuickPlayMode | null): string {
    switch (m) {
      case '1v1': return '1V1';
      case '2v2': return '2V2 TEAMS';
      case '3v3': return '3V3 TEAMS';
      case '3ffa': return '3-PLAYER FFA';
      case '6ffa': return '6-PLAYER FFA';
      case '2v2v2': return '2V2V2 TEAMS';
      default: return '';
    }
  }
  const target = getTargetSize(mode);
  const size = state.queueSize;
  const modeLabel = getModeLabel(mode);

  const dots = Array.from({ length: target }, (_, i) =>
    `<span class="queue-dot ${i < size ? 'filled' : ''}">${i < size ? '\u25CF' : '\u25CB'}</span>`
  ).join(' ');

  return `
    <div class="screen">
      <h1 class="game-title" style="font-size:24px">HULLCRACKER.IO</h1>
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
      <button class="btn btn-secondary" id="btn-changelog-back" style="max-width:200px;margin-bottom:16px">Back to Lobby</button>
      <div class="changelog">${content}</div>
    </div>`;
}

async function loadChangelog(): Promise<void> {
  try {
    const resp = await fetch('/CHANGELOG.md');
    if (!resp.ok) throw new Error(`${resp.status}`);
    const md = await resp.text();
    state.changelogHtml = marked(md) as string;
  } catch {
    state.changelogHtml = '<p style="color:var(--text-muted)">Could not load changelog.</p>';
  }
  if (state.screen === 'changelog') render();
}

function renderWaiting(): string {
  const MAX_PLAYERS = 6;
  const players = state.game ? Object.values(state.game.players) : [];
  const isHost = state.game?.hostId === state.playerId || state.isHost;
  const canStart = players.length >= 2 && isHost;
  const teamsEnabled = state.game?.teamsEnabled ?? false;
  const teams = state.game?.teams ?? {};

  let openSlotCounter = 0;

  // Unified seat card rendering — handles all seat states
  function renderSeatCard(p: WirePlayer | null, slotIndex: number, team?: string): string {
    const slotColor = SLOT_COLORS[slotIndex] ?? 'green';
    if (!p) {
      // Open slot — show the slot's assigned color preview
      if (!isHost) {
        return `<div class="seat-card open seat-empty player-color-${slotColor}" data-player-color="${slotColor}"><span style="color:var(--player-${slotColor});opacity:0.4;font-size:12px">Open</span></div>`;
      }
      const slotId = `open-${team ?? 'any'}-${openSlotCounter++}`;
      const isOpen = state.openDropdownId === slotId;
      return `<div class="seat-card open seat-empty player-color-${slotColor}" data-player-color="${slotColor}">
        <span style="color:var(--player-${slotColor});opacity:0.4;font-size:12px">Open</span>
        <button class="seat-menu-trigger" data-dropdown-id="${slotId}" aria-haspopup="true" aria-expanded="${isOpen}">+</button>
        <div class="seat-menu${isOpen ? ' open' : ''}" role="menu">
          <button class="seat-menu-item" role="menuitem" data-action="add-bot" data-bot-diff="easy" data-bot-team="${team ?? ''}" data-bot-slot="${slotIndex}">Add AI (Easy)</button>
          <button class="seat-menu-item" role="menuitem" data-action="add-bot" data-bot-diff="medium" data-bot-team="${team ?? ''}" data-bot-slot="${slotIndex}">Add AI (Medium)</button>
          <button class="seat-menu-item" role="menuitem" data-action="add-bot" data-bot-diff="hard" data-bot-team="${team ?? ''}" data-bot-slot="${slotIndex}">Add AI (Hard)</button>
          <button class="seat-menu-item" role="menuitem" data-action="add-bot" data-bot-diff="impossible" data-bot-team="${team ?? ''}" data-bot-slot="${slotIndex}">Add AI (Impossible)</button>
        </div>
      </div>`;
    }

    // Filled seat
    const isMe = p.id === state.playerId;
    const hostBadge = p.id === state.game?.hostId ? '<span class="host-badge">HOST</span>' : '';
    const botBadge = p.isBot ? `<span class="bot-badge">${esc(p.aiDifficulty ?? 'bot').toUpperCase()}</span>` : '';

    // Build dropdown menu items
    const menuItems: string[] = [];
    if (teamsEnabled) {
      const myTeam = teams[p.id];
      const allTeamLabels: Record<string, string> = { alpha: 'Alpha', bravo: 'Bravo', charlie: 'Charlie' };
      // Use gameType to determine team count — not activeTeams (Bravo may be empty)
      const gt = state.game?.gameType ?? '2-team';
      const allTeamNames = gt === '3-team' ? ['alpha', 'bravo', 'charlie'] : ['alpha', 'bravo'];
      const numTeams = allTeamNames.length;
      const maxPerTeam = Math.floor(MAX_PLAYERS / numTeams);
      const otherTeams = allTeamNames.filter(t => t !== myTeam);

      for (const otherTeam of otherTeams) {
        const otherTeamLabel = allTeamLabels[otherTeam] ?? otherTeam;
        const otherTeamPlayers = players.filter(pl => teams[pl.id] === otherTeam);
        const canMove = otherTeamPlayers.length < maxPerTeam;

        if (isHost) {
          if (canMove) {
            menuItems.push(`<button class="seat-menu-item" role="menuitem" data-action="move" data-target="${p.id}" data-move-team="${otherTeam}">Move to ${otherTeamLabel}</button>`);
          } else {
            for (const op of otherTeamPlayers) {
              menuItems.push(`<button class="seat-menu-item" role="menuitem" data-action="swap" data-player-a="${p.id}" data-player-b="${op.id}">Swap with ${esc(op.name)}</button>`);
            }
          }
        } else if (isMe && !p.isBot) {
          if (canMove) {
            menuItems.push(`<button class="seat-menu-item" role="menuitem" data-action="move" data-target="${p.id}" data-move-team="${otherTeam}">Move to ${otherTeamLabel}</button>`);
          }
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

    const colorClass = `player-color-${p.color ?? slotColor}`;
    const selfClass = isMe ? ' player-card-self' : '';
    const youBadge = isMe ? `<span class="player-you-badge">YOU</span>` : '';
    return `<div class="seat-card ${colorClass}${selfClass}" data-player-color="${p.color ?? slotColor}">
      ${playerIcon(p.isBot)} <span class="player-name">${esc(p.name)}</span> ${youBadge}${hostBadge}${botBadge}${dropdownHtml}
    </div>`;
  }

  // Unique team IDs for multi-team display
  const teamIds = [...new Set(Object.values(teams))];

  // Game options panel (visible to all, editable by host)
  const game = state.game;
  const gameType = game?.gameType ?? 'ffa';
  const islandCount = game?.islandCount ?? 6;

  // Custom dropdown renderer
  function renderCustomSelect(
    id: string,
    options: { value: string; label: string; desc?: string }[],
    selected: string,
  ): string {
    const selectedOpt = options.find(o => o.value === selected) ?? options[0];
    const isOpen = state.openDropdownId === id;
    const disabledClass = !isHost ? ' disabled' : '';
    const disabledAttr = !isHost ? ' aria-disabled="true"' : '';
    return `<div class="custom-select${disabledClass}" id="${id}">
      <div class="custom-select-trigger" tabindex="${isHost ? '0' : '-1'}" role="button" aria-haspopup="listbox" aria-expanded="${isOpen}"${disabledAttr} data-select-id="${id}">
        <div class="select-value">${esc(selectedOpt.label)}${selectedOpt.desc ? `<span class="select-subtitle">${esc(selectedOpt.desc)}</span>` : ''}</div>
        ${isHost ? '<span class="select-arrow">▼</span>' : ''}
      </div>
      <div class="custom-select-menu${isOpen ? '' : ' hidden'}" role="listbox" data-select-id="${id}">
        ${options.map(o => `<div class="select-option${o.value === selected ? ' selected' : ''}" role="option" aria-selected="${o.value === selected}" data-value="${o.value}" data-select-id="${id}">
          <div class="select-option-name">${esc(o.label)}${o.value === selected ? ' <span class="check">✓</span>' : ''}</div>
          ${o.desc ? `<div class="select-option-desc">${esc(o.desc)}</div>` : ''}
        </div>`).join('')}
      </div>
    </div>`;
  }

  const gameTypeOptions = [
    { value: 'ffa', label: 'Free For All', desc: 'every player for themselves' },
    { value: '2-team', label: 'Two Teams', desc: 'Alpha vs Bravo' },
    { value: '3-team', label: 'Three Teams', desc: 'Alpha / Bravo / Charlie' },
  ];
  const timerOptions = [
    { value: '0', label: 'Off' },
    { value: '30', label: '30s' },
    { value: '60', label: '60s' },
  ];
  const timerSelected = !game?.timerConfig.enabled ? '0' : String(game.timerConfig.seconds);
  const ringsOptions = [
    { value: '4', label: '4 rings', desc: '61 hexes' },
    { value: '5', label: '5 rings', desc: '91 hexes' },
    { value: '6', label: '6 rings', desc: '127 hexes' },
  ];
  const islandOptions = [
    { value: '0', label: 'None' },
    { value: '4', label: 'Few' },
    { value: '6', label: 'Normal' },
    { value: '8', label: 'Many' },
  ];

  const gameOptionsHtml = game ? `
    <div class="game-options-panel">
      <div class="section-label">GAME OPTIONS</div>
      <div class="option-group"><div class="option-label">Game Type</div>${renderCustomSelect('opt-game-type', gameTypeOptions, gameType)}</div>
      <div class="option-group"><div class="option-label">Turn Timer</div>${renderCustomSelect('opt-timer', timerOptions, timerSelected)}</div>
      <div class="option-group"><div class="option-label">Grid Size</div>${renderCustomSelect('opt-rings', ringsOptions, String(game.rings))}</div>
      <div class="option-group"><div class="option-label">Islands</div>${renderCustomSelect('opt-islands', islandOptions, String(islandCount))}</div>
    </div>
  ` : '';

  let lobbyPlayersHtml = '';

  if (teamsEnabled) {
    // Deterministic team list from host's game type choice
    const activeTeams = gameType === '3-team'
      ? ['alpha', 'bravo', 'charlie']
      : ['alpha', 'bravo'];
    const slotsPerTeam = Math.floor(MAX_PLAYERS / activeTeams.length);
    const teamLabels: Record<string, string> = { alpha: 'ALPHA', bravo: 'BRAVO', charlie: 'CHARLIE' };

    let globalSlot = 0;
    const sections = activeTeams.map(teamName => {
      const teamPlayers = players.filter(p => teams[p.id] === teamName);
      // Render fixed color slots for this team's range
      const teamSlotCards: string[] = [];
      for (let i = 0; i < slotsPerTeam; i++) {
        const slotIdx = globalSlot++;
        const slotColor = SLOT_COLORS[slotIdx];
        const player = teamPlayers.find(p => p.color === slotColor);
        teamSlotCards.push(renderSeatCard(player ?? null, slotIdx, teamName));
      }
      const cards = teamSlotCards.join('');
      return `
        <div class="team-section">
          <div class="team-section-header ${teamName}">${teamLabels[teamName]}</div>
          ${cards}
        </div>`;
    }).join('');

    lobbyPlayersHtml = `<div class="lobby-stacked">${sections}</div>`;
  } else {
    // Render all 6 slots in fixed MRYGCB order — players appear in their color's slot
    const slotCards = SLOT_COLORS.map((slotColor, i) => {
      const player = players.find(p => p.color === slotColor);
      return renderSeatCard(player ?? null, i);
    }).join('');

    lobbyPlayersHtml = `
      <div class="lobby-stacked">
        <div class="team-section-header" style="color:var(--text-muted)">PLAYERS</div>
        ${slotCards}
      </div>`;
  }

  const leaveBtn = `<button class="btn leave-btn" id="btn-leave">Leave Game</button>`;

  return `
    <div class="screen">
      <h1 class="game-title">HULLCRACKER.IO</h1>
      <p class="game-subtitle">Multiplayer Naval Warfare</p>
      ${renderError()}
      <div class="waiting-room">
        <h2 class="label" style="margin-bottom:12px">Game Created</h2>
        <div class="join-code" id="copy-code" title="Click to copy">${state.joinCode ?? ''}</div>
        <p class="join-code-hint">Click to copy &bull; Share with friends</p>
        <div class="lobby-body">
          <div class="lobby-players">${lobbyPlayersHtml}</div>
          ${gameOptionsHtml}
        </div>
        <p class="player-count">${players.length} of 2\u2013${MAX_PLAYERS} players</p>
        ${isHost ? `<button class="btn btn-amber" id="btn-start" ${canStart ? '' : 'disabled'}>${canStart ? 'Start Game' : 'Need 2+ Players'}</button>` : '<p class="player-count">Waiting for host to start...</p>'}
        ${leaveBtn}
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
  const game = state.game;
  if (!game) return '';
  const rings = game.rings;
  const islands = new Set(game.islands);
  const hexSize = 24; // pixels per hex

  // Build ship hull data for the overlay layer
  const shipHulls: ShipHullData[] = [];

  const myColor = state.playerId ? game.players[state.playerId]?.color : undefined;

  // Own ships (cells are populated for the current player)
  const me = state.playerId ? game.players[state.playerId] : null;
  if (me) {
    for (const ship of me.ships) {
      if (ship.cells.length > 0) {
        shipHulls.push({ cells: ship.cells, sunk: ship.sunk, color: myColor });
      }
    }
  }

  // Teammate ships (in team games, cells are visible)
  if (game.teamsEnabled && state.playerId) {
    const myTeam = game.teams[state.playerId];
    for (const [pid, player] of Object.entries(game.players)) {
      if (pid !== state.playerId && game.teams[pid] === myTeam) {
        for (const ship of player.ships) {
          if (ship.cells.length > 0) {
            shipHulls.push({ cells: ship.cells, sunk: ship.sunk, teammate: true, color: player.color });
          }
        }
      }
    }
  }

  // Placed ships during placement phase (not yet in wire game)
  if (mode === 'placement') {
    for (const ship of state.placedShips) {
      if (ship.cells.length > 0) {
        shipHulls.push({ cells: ship.cells, sunk: false, color: myColor });
      }
    }
  }

  // Ghost preview ships (placement phase)
  if (mode === 'placement' && state.ghostCells.length > 0) {
    shipHulls.push({ cells: state.ghostCells, sunk: false, ghost: true, ghostValid: state.ghostValid, color: myColor });
  }

  // Teammate ghost preview
  if (mode === 'placement' && state.teammateGhostShips.length > 0) {
    for (const tmShip of state.teammateGhostShips) {
      if (tmShip.cells.length > 0) {
        shipHulls.push({ cells: tmShip.cells, sunk: false, teammate: true, ghost: true, ghostValid: true });
      }
    }
  }

  // Game-over: show ALL players' ships in their colors
  if (game.phase === 'finished') {
    for (const [pid, player] of Object.entries(game.players)) {
      if (pid === state.playerId) continue; // own ships already added above
      if (game.teamsEnabled && game.teams[pid] === game.teams[state.playerId ?? '']) continue; // teammates already added
      for (const ship of player.ships) {
        if (ship.cells.length > 0) {
          shipHulls.push({ cells: ship.cells, sunk: ship.sunk, color: player.color });
        }
      }
    }
  } else if (mode === 'battle') {
    // During battle: sunk enemy ships (cells revealed on sunk) in owner's color
    for (const [pid, player] of Object.entries(game.players)) {
      if (pid === state.playerId) continue;
      if (game.teamsEnabled && game.teams[pid] === game.teams[state.playerId ?? '']) continue;
      for (const ship of player.ships) {
        if (ship.sunk && ship.cells.length > 0) {
          shipHulls.push({ cells: ship.cells, sunk: true, color: player.color });
        }
      }
    }
  }

  return renderHexGridSVG(rings, hexSize, islands, (coord) => getCellState(coord, mode), mode, shipHulls);
}

function getCellState(coord: string, mode: 'placement' | 'battle'): { cssClass: string; symbol: string; extraHtml?: string } {
  const game = state.game;

  if (mode === 'placement') {
    // Ghost preview (own placement)
    if (state.ghostCells.includes(coord)) {
      return state.ghostValid
        ? { cssClass: 'cell-ghost', symbol: '' }
        : { cssClass: 'cell-invalid', symbol: '' };
    }
    // Placed ships
    for (const ship of state.placedShips) {
      if (ship.cells.includes(coord)) {
        return { cssClass: 'cell-ship', symbol: '' };
      }
    }
    // Teammate ghost preview
    if (state.teammateGhostShips.length > 0) {
      for (const ship of state.teammateGhostShips) {
        if (ship.cells.includes(coord)) {
          return { cssClass: 'cell-teammate-ghost', symbol: '' };
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
    return { cssClass: 'cell-ship', symbol: '' };
  }

  // Teammate ship (visible in 2v2, not shot)
  if (teammateShip) {
    return { cssClass: 'cell-teammate-ship', symbol: '' };
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
      ? `<span class="team-badge small ${state.game.teams[m.playerId]}">${state.game.teams[m.playerId].charAt(0).toUpperCase()}</span>`
      : '';
    const chatColor = chatPlayer?.color ?? 'green';
    return `<div class="chat-msg chat-msg-player">
      <div class="chat-msg-header">${chatIcon}${teamBadge}<span class="chat-name player-color-${chatColor}">${esc(m.playerName)}</span><span class="chat-time">${formatTime(m.timestamp)}</span></div>
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

  // Game mode indicator for team games
  let gameModeLabel = '';
  if (teamsEnabled) {
    const teamIds = [...new Set(Object.values(teams))];
    const teamLabels = teamIds.map(t => `<span class="team-badge ${t}" style="font-size:inherit;padding:0;background:none">${t.charAt(0).toUpperCase() + t.slice(1)}</span>`);
    const modeShort = teamIds.length > 2 ? `${teamIds.length}-team` : '2v2';
    gameModeLabel = `<div class="game-mode-label"><span class="desktop-only">TEAM BATTLE</span><span class="mobile-only">${modeShort}</span> \u2014 ${teamLabels.join(' vs ')}</div>`;
  }

  const playerEntries = Object.entries(state.game.players);
  if (state.game.turnOrder.length > 0) {
    playerEntries.sort((a, b) => state.game!.turnOrder.indexOf(a[0]) - state.game!.turnOrder.indexOf(b[0]));
  }
  const playersHtml = playerEntries.map(([, p]) => {
    const isMe = p.id === state.playerId;
    const isCurrent = p.id === currentTurnId;
    const nameStyle = p.alive ? '' : 'text-decoration:line-through;color:var(--text-muted)';
    const teamBadge = teamsEnabled && teams[p.id]
      ? `<span class="team-badge ${teams[p.id]}" aria-label="Team ${teams[p.id].charAt(0).toUpperCase() + teams[p.id].slice(1)}">${teams[p.id].charAt(0).toUpperCase() + teams[p.id].slice(1)}</span>`
      : '';
    const pColor = p.color ?? 'green';
    const youBadge = isMe ? '<span class="player-you-badge">YOU</span>' : '';
    return `<li class="player-color-${pColor}" style="border-left:3px solid var(--player-${pColor});padding-left:6px${!p.alive ? ';opacity:0.5' : ''}">
      ${playerIcon(p.isBot)}
      <span class="player-color-${pColor}" style="${nameStyle}">${esc(p.name)}</span>${youBadge}
      ${teamBadge}
      <span style="margin-left:auto;font-family:var(--font-mono);font-size:11px;color:var(--text-muted)">${p.alive ? p.shotCount + ' ships' : 'out'}</span>
      ${isCurrent && p.alive ? '<span style="color:var(--amber);font-size:10px">\u25C0</span>' : ''}
    </li>`;
  }).join('');

  const shotLogHtml = state.shotLog.map(entry => {
    const allCoords = entry.shots.map(s => s.coord).join(',');
    const shooterColor = state.game?.players[entry.shooterId]?.color ?? 'green';
    // Shot lines — multi-line dialogue format
    const shotLines = entry.shots.map(shot => {
      if (shot.miss) {
        return `<div class="shot-log-line"><span class="coord">${shot.coord}</span> <span class="miss-text">miss</span></div>`;
      }
      const nameSpans = shot.hits.map(h => {
        const hitColor = state.game?.players[h.playerId]?.color ?? 'green';
        const isSelf = h.playerId === entry.shooterId;
        return isSelf ? `<span class="ff">${esc(h.playerName)}</span>` : `<span class="player-color-${hitColor}">${esc(h.playerName)}</span>`;
      });
      return `<div class="shot-log-line"><span class="coord">${shot.coord}</span> <span class="hit">hit: [${nameSpans.join(', ')}]</span></div>`;
    }).join('');

    // Sink/elimination lines after the salvo
    const sinkLines = entry.shots.flatMap(shot =>
      shot.hits.filter(h => h.sunk).map(hit => {
        const hitColor = state.game?.players[hit.playerId]?.color ?? 'green';
        const ownerName = `<span class="player-color-${hitColor}">${esc(hit.playerName)}</span>'s`;
        return `<div class="shot-log-sink">\u00D7 ${ownerName} ${SHIP_NAMES[hit.shipLength]} sunk</div>`;
      })
    ).join('');

    return `<div class="shot-log-salvo" data-coords="${allCoords}">
      <div class="shot-log-header"><span class="player-color-${shooterColor}">${esc(entry.shooterName)}</span> fires:</div>
      ${shotLines}
      ${sinkLines}
    </div>`;
  }).join('');

  const currentPlayer = state.game.players[currentTurnId];
  const turnPlayerColor = currentPlayer?.color ?? 'green';
  const turnText = isMyTurn
    ? `<span class="player-color-${turnPlayerColor}">YOUR TURN</span> \u2014 ${expectedShots} shot${expectedShots !== 1 ? 's' : ''}`
    : `<span class="player-color-${turnPlayerColor}">${esc(currentPlayer?.name ?? '???')}</span>'s turn`;

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
    const winnerColor = winner.color ?? 'green';
    winnerText = `<span class="player-color-${winnerColor}">${esc(winner.name)}</span> WINS!`;
    winnerSubtext = 'Last player standing';
  } else {
    winnerText = 'DRAW!';
    winnerSubtext = 'All players eliminated simultaneously';
  }

  const highlightsHtml = stats.highlights.map(h => `<p class="highlight">${esc(h)}</p>`).join('');


  const pending = state.rematchPending;
  const alreadyAccepted = pending?.acceptedIds.includes(state.playerId ?? '') ?? false;

  let rematchHtml: string;
  if (alreadyAccepted && pending) {
    rematchHtml = `<div class="alert alert-info" style="max-width:300px;margin:24px auto 0">Waiting for others... (${pending.acceptedIds.length}/${pending.totalHumans})</div>`;
  } else {
    rematchHtml = `<button class="btn btn-amber" id="btn-rematch" style="max-width:300px;margin:24px auto 0">Play Again</button>`;
  }

  // Stats table — sorted by turn order
  const players = state.game ? Object.values(state.game.players) : [];
  const turnOrder = state.game?.turnOrder ?? [];
  if (turnOrder.length > 0) {
    players.sort((a, b) => turnOrder.indexOf(a.id) - turnOrder.indexOf(b.id));
  }
  const statsRows = players.map(p => {
    const s = stats.playerStats[p.id];
    if (!s) return '';
    const accPct = Math.round(s.accuracy * 100);
    const isWinner = teamsEnabled ? teams[p.id] === winnerTeamId : p.id === stats.winnerId;
    const playerColor = p.color ?? 'green';
    const rowStyle = isWinner ? `color:var(--player-${playerColor})` : '';
    const teamBadge = teamsEnabled && teams[p.id]
      ? `<span class="team-badge ${teams[p.id]}">${teams[p.id].charAt(0).toUpperCase() + teams[p.id].slice(1)}</span>`
      : '';
    return `<tr style="${rowStyle}">
      <td>${playerIcon(p.isBot)}<span class="player-color-${playerColor}">${esc(p.name)}</span>${isWinner ? ' \u2605' : ''} ${teamBadge}</td>
      <td>${s.shotsFired}</td>
      <td>${s.hitsLanded}</td>
      <td>${accPct}%</td>
      <td>${s.shipsSunk}</td>
      <td>${s.friendlyFireHits}</td>
    </tr>`;
  }).join('');

  const winClass = teamsEnabled && winnerTeamId
    ? `team-win-${winnerTeamId}`
    : winner ? '' : 'draw';

  // Render the final battle grid as a debrief map
  const gridHtml = renderGrid('battle');

  return `
    <div class="screen">
      <div class="game-over">
        <h1 class="${winClass}">${winnerText}</h1>
        <p style="color:var(--text-secondary);margin-bottom:16px">${winnerSubtext}</p>
        ${highlightsHtml}
        <div class="grid-panel" style="margin-bottom:16px">${gridHtml}</div>
        <div style="overflow-x:auto;width:100%">
        <table class="stats-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Shots</th>
              <th>Hits</th>
              <th>Acc</th>
              <th>Sunk</th>
              <th>FF</th>
            </tr>
          </thead>
          <tbody>${statsRows}</tbody>
        </table>
        </div>
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

  // Randomize name
  on('btn-randomize', 'click', () => {
    saveName(generateRandomName());
    render();
  });

  // Quick Play
  on('btn-qp-1v1', 'click', () => {
    const name = val('player-name');
    if (!name) return showError('Enter your name');
    saveName(name);
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
    saveName(name);
    state.queueMode = '2v2';
    state.queueSize = 0;
    state.screen = 'queue';
    history.pushState({ screen: 'queue' }, '');
    socket.emit('quickplay-join', { playerName: name, mode: '2v2' });
    render();
  });

  on('btn-qp-3v3', 'click', () => {
    const name = val('player-name');
    if (!name) return showError('Enter your name');
    saveName(name);
    state.queueMode = '3v3';
    state.queueSize = 0;
    state.screen = 'queue';
    history.pushState({ screen: 'queue' }, '');
    socket.emit('quickplay-join', { playerName: name, mode: '3v3' });
    render();
  });

  on('btn-qp-3ffa', 'click', () => {
    const name = val('player-name');
    if (!name) return showError('Enter your name');
    saveName(name);
    state.queueMode = '3ffa';
    state.queueSize = 0;
    state.screen = 'queue';
    history.pushState({ screen: 'queue' }, '');
    socket.emit('quickplay-join', { playerName: name, mode: '3ffa' });
    render();
  });

  on('btn-qp-6ffa', 'click', () => {
    const name = val('player-name');
    if (!name) return showError('Enter your name');
    saveName(name);
    state.queueMode = '6ffa';
    state.queueSize = 0;
    state.screen = 'queue';
    history.pushState({ screen: 'queue' }, '');
    socket.emit('quickplay-join', { playerName: name, mode: '6ffa' });
    render();
  });

  on('btn-qp-2v2v2', 'click', () => {
    const name = val('player-name');
    if (!name) return showError('Enter your name');
    saveName(name);
    state.queueMode = '2v2v2';
    state.queueSize = 0;
    state.screen = 'queue';
    history.pushState({ screen: 'queue' }, '');
    socket.emit('quickplay-join', { playerName: name, mode: '2v2v2' });
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
    saveName(name);
    state.isHost = true;
    socket.emit('create-game', { playerName: name });
  });

  on('btn-show-join', 'click', () => {
    const name = val('player-name');
    if (!name) return showError('Enter your name');
    saveName(name);
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

  // Custom dropdown triggers (game options)
  document.querySelectorAll('.custom-select-trigger').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const selectId = el.getAttribute('data-select-id');
      if (!selectId || el.getAttribute('aria-disabled') === 'true') return;
      state.openDropdownId = state.openDropdownId === selectId ? null : selectId;
      render();
    });
    el.addEventListener('keydown', (e) => {
      const ke = e as KeyboardEvent;
      if (ke.key === 'Enter' || ke.key === ' ') {
        e.preventDefault();
        (el as HTMLElement).click();
      } else if (ke.key === 'Escape') {
        state.openDropdownId = null;
        render();
      }
    });
  });

  // Custom dropdown option selection
  document.querySelectorAll('.select-option').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const selectId = el.getAttribute('data-select-id');
      const value = el.getAttribute('data-value');
      if (!selectId || !value) return;

      if (selectId === 'opt-game-type') {
        socket.emit('update-game-options', { gameType: value as 'ffa' | '2-team' | '3-team' });
      } else if (selectId === 'opt-timer') {
        socket.emit('update-game-options', { timerSeconds: parseInt(value, 10) || null });
      } else if (selectId === 'opt-rings') {
        socket.emit('update-game-options', { rings: parseInt(value, 10) });
      } else if (selectId === 'opt-islands') {
        socket.emit('update-game-options', { islandCount: parseInt(value, 10) });
      }

      state.openDropdownId = null;
      render();
    });
  });

  // Leave game button
  on('btn-leave', 'click', () => {
    if (confirm('Leave this game?')) {
      socket.emit('leave-game');
    }
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
        const slotStr = el.getAttribute('data-bot-slot');
        const slotIndex = slotStr != null ? parseInt(slotStr, 10) : undefined;
        if (difficulty) socket.emit('add-bot', { difficulty, ...(team ? { team } : {}), ...(slotIndex != null ? { slotIndex } : {}) });
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
      const svg = document.querySelector('.hex-grid');
      coords.forEach(c => {
        const cell = svg?.querySelector(`[data-coord="${c}"]`);
        if (cell) cell.classList.add('cell-highlight');
      });
    });
    el.addEventListener('mouseleave', () => {
      document.querySelectorAll('.cell-highlight').forEach(c => c.classList.remove('cell-highlight'));
    });

    // Mobile: tap to toggle
    el.addEventListener('click', () => {
      const svg = document.querySelector('.hex-grid');
      const hasHighlight = document.querySelector('.cell-highlight');
      document.querySelectorAll('.cell-highlight').forEach(c => c.classList.remove('cell-highlight'));
      if (!hasHighlight || !coords.some(c => document.querySelector(`[data-coord="${c}"].cell-highlight`))) {
        coords.forEach(c => {
          const cell = svg?.querySelector(`[data-coord="${c}"]`);
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
      state.placingShip = { length, dirIndex: 0 };
      state.ghostCells = [];
      render();
    });
  });

  on('btn-rotate', 'click', () => {
    if (state.placingShip) {
      state.placingShip.dirIndex = nextDirection(state.placingShip.dirIndex);
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
        state.placingShip.dirIndex = nextDirection(state.placingShip.dirIndex);
        state.ghostCells = [];
        state.ghostValid = false;
        render();
      }
    }
  });

  // Hex grid SVG click handling
  const svgEl = document.querySelector('.hex-grid') as SVGSVGElement | null;
  if (svgEl) {
    const hexSize = parseInt(svgEl.getAttribute('data-hex-size') ?? '24', 10);
    const rings = parseInt(svgEl.getAttribute('data-rings') ?? '5', 10);
    const mode = svgEl.querySelector('[data-mode]')?.getAttribute('data-mode') ?? 'battle';

    svgEl.addEventListener('mousemove', (e) => {
      if (mode !== 'placement' || !state.placingShip) return;
      const coord = svgClickToHex(e, svgEl, hexSize, rings);
      if (!coord) return;
      // Don't preview on islands
      if (state.game?.islands.includes(coord)) return;
      const h = parseHex(coord);
      if (!h) return;
      const occupied = new Set(state.placedShips.flatMap(s => s.cells));
      const preview = getShipPreview(h.q, h.r, state.placingShip.dirIndex, state.placingShip.length, rings, new Set(state.game?.islands ?? []), occupied);
      if (preview.cells.length > 0) {
        state.ghostCells = preview.cells;
        state.ghostValid = preview.valid;
        render();
      }
    });

    svgEl.addEventListener('mouseleave', () => {
      if (state.placingShip && state.ghostCells.length > 0) {
        state.ghostCells = [];
        render();
      }
    });

    svgEl.addEventListener('click', (e) => {
      const coord = svgClickToHex(e, svgEl, hexSize, rings);
      if (!coord) return;
      // Don't interact with islands
      if (state.game?.islands.includes(coord)) return;
      if (mode === 'placement') {
        handlePlacementClick(coord);
      } else if (mode === 'battle') {
        handleTargetClick(coord);
      }
    });
  }

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
        'quickplay-3v3': '3v3',
        'quickplay-3ffa': '3ffa',
        'quickplay-6ffa': '6ffa',
        'quickplay-2v2v2': '2v2v2',
      };
      const qpMode = modeMap[state.game.mode] ?? '1v1';
      state.queueMode = qpMode;
      state.queueSize = 0;
    }
    socket.emit('rematch-request');
  });

  on('btn-new-game', 'click', () => {
    socket.emit('rematch-decline');
    sessionStorage.removeItem('hullcracker-playerId');
    sessionStorage.removeItem('hullcracker-gameId');
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
    const savedPlayerId = sessionStorage.getItem('hullcracker-playerId');
    const savedGameId = sessionStorage.getItem('hullcracker-gameId');
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
        sessionStorage.removeItem('hullcracker-playerId');
        sessionStorage.removeItem('hullcracker-gameId');
        render();
      }
    }, 5000);
  });

  on('btn-rejoin-no', 'click', () => {
    const savedPlayerId = sessionStorage.getItem('hullcracker-playerId');
    const savedGameId = sessionStorage.getItem('hullcracker-gameId');
    if (savedPlayerId && savedGameId) {
      socket.emit('decline-rejoin', { playerId: savedPlayerId, gameId: savedGameId });
    }
    sessionStorage.removeItem('hullcracker-playerId');
    sessionStorage.removeItem('hullcracker-gameId');
    state.showRejoinModal = false;
    if (state.rejoinCountdownInterval) clearInterval(state.rejoinCountdownInterval);
    state.rejoinCountdownInterval = null;
    render();
  });
}

function randomizePlacement(): void {
  const rings = state.game?.rings ?? 5;
  const islands = new Set(state.game?.islands ?? []);
  const occupied = new Set<string>();
  const ships: ShipPlacement[] = [];
  const lengths = [...SHIP_LENGTHS].sort((a, b) => b - a);
  const validHexes = allHexes(rings).filter(c => !islands.has(c));

  for (const length of lengths) {
    let placed = false;
    for (let attempt = 0; attempt < 200; attempt++) {
      const anchor = validHexes[Math.floor(Math.random() * validHexes.length)];
      const h = parseHex(anchor);
      if (!h) continue;
      const dir = Math.floor(Math.random() * 6);
      const cells = hexLinear(h.q, h.r, dir, length, rings);
      if (!cells) continue;
      if (cells.some(c => occupied.has(c) || islands.has(c))) continue;

      cells.forEach(c => occupied.add(c));
      ships.push({ length, cells });
      placed = true;
      break;
    }
    if (!placed) {
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

  const h = parseHex(coord);
  if (!h) return;
  const rings = state.game?.rings ?? 5;
  const islands = new Set(state.game?.islands ?? []);
  const occupied = new Set(state.placedShips.flatMap(s => s.cells));
  const preview = getShipPreview(h.q, h.r, state.placingShip.dirIndex, state.placingShip.length, rings, islands, occupied);
  const cells = preview.cells;
  if (cells.length === 0) return showError('Ship would go out of bounds');
  if (!preview.valid) return showError('Ships overlap or placed on island');

  // Track hull count before render so we can flash only the new one
  const hullCountBefore = document.querySelectorAll('.ship-hull').length;
  state.placedShips.push({ length: state.placingShip.length, cells });
  state.placingShip = null;
  state.ghostCells = [];
  render();
  emitPlacementPreview();
  // Placement confirmation flash + tone — only the newly placed ship's hull
  playPlacementSound();
  const allHulls = document.querySelectorAll<SVGPathElement>('.ship-hull');
  allHulls.forEach((el, i) => {
    if (i < hullCountBefore) return; // skip previously existing hulls
    const origFill = el.getAttribute('fill') || '';
    el.setAttribute('fill', 'rgba(0,255,136,0.8)');
    setTimeout(() => el.setAttribute('fill', origFill), 200);
  });
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
  const saved = localStorage.getItem('hullcracker-theme');
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
      localStorage.setItem('hullcracker-theme', 'light');
      btn.textContent = 'DARK';
    } else {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('hullcracker-theme', 'dark');
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
    localStorage.setItem('hullcracker-muted', String(state.matchSoundMuted));
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
