import { io, Socket } from 'socket.io-client';
import type {
  ClientToServerEvents, ServerToClientEvents,
  WireGame, WirePlayer, ShotResult, ShipPlacement,
  ChatMessage, GameOverStats, TimerConfig, AiDifficulty,
} from '@salvo/shared';
import { SHIP_LENGTHS, SHIP_NAMES, ROWS, GRID_SIZE } from '@salvo/shared';
import './style.css';

// ============================================================
// State
// ============================================================

type Screen = 'lobby' | 'waiting' | 'placement' | 'battle' | 'gameover';

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
  // Battle
  selectedTargets: string[];
  isMyTurn: boolean;
  shotLog: ShotLogEntry[];
  timerSeconds: number | null;
  timerInterval: ReturnType<typeof setInterval> | null;
  // Chat
  chatMessages: ChatMessage[];
  // Game over
  gameOverStats: GameOverStats | null;
  rematchPending: { acceptedIds: string[]; totalHumans: number } | null;
  // Mobile
  mobileTab: 'fleet' | 'target';
  // Error
  errorMessage: string | null;
  errorTimeout: ReturnType<typeof setTimeout> | null;
}

interface ShotLogEntry {
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
  selectedTargets: [],
  isMyTurn: false,
  shotLog: [],
  timerSeconds: null,
  timerInterval: null,
  chatMessages: [],
  gameOverStats: null,
  rematchPending: null,
  mobileTab: 'fleet',
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

socket.on('placement-phase', ({ game }) => {
  state.game = game;
  state.screen = 'placement';
  state.placedShips = [];
  state.placingShip = null;
  state.shipsSent = false;
  render();
});

socket.on('all-ready', ({ game }) => {
  state.game = game;
  state.screen = 'battle';
  state.selectedTargets = [];
  state.shotLog = [];
  render();
});

socket.on('game-state', ({ game }) => {
  state.game = game;
  if (game.phase === 'placement' && state.screen !== 'placement') {
    state.screen = 'placement';
  } else if (game.phase === 'playing' && state.screen !== 'battle') {
    state.screen = 'battle';
    state.selectedTargets = [];
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
  render();
});

socket.on('turn-timeout', () => {
  if (state.isMyTurn) {
    state.isMyTurn = false;
    stopTimer();
  }
  render();
});

socket.on('shot-results', ({ shooterName, shots, game }) => {
  state.game = game;
  state.isMyTurn = false;
  stopTimer();
  state.shotLog.unshift({ shooterName, shots });
  state.selectedTargets = [];
  render();
});

socket.on('player-eliminated', ({ playerName, reason }) => {
  const reasonText = reason === 'forfeit' ? 'forfeited (disconnected)' : 'eliminated';
  state.chatMessages.push({
    playerId: 'system',
    playerName: 'SYSTEM',
    text: `${playerName} has been ${reasonText}!`,
    timestamp: Date.now(),
  });
  render();
});

socket.on('game-over', (stats) => {
  state.gameOverStats = stats;
  state.screen = 'gameover';
  state.isMyTurn = false;
  stopTimer();
  render();
});

socket.on('rematch-pending', ({ acceptedIds, totalHumans }) => {
  state.rematchPending = { acceptedIds, totalHumans };
  render();
});

socket.on('rematch-starting', ({ game }) => {
  state.game = game;
  state.screen = 'placement';
  state.placedShips = [];
  state.placingShip = null;
  state.shipsSent = false;
  state.selectedTargets = [];
  state.shotLog = [];
  state.gameOverStats = null;
  state.rematchPending = null;
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

socket.on('player-disconnected', ({ playerName, timeoutSeconds }) => {
  state.chatMessages.push({
    playerId: 'system',
    playerName: 'SYSTEM',
    text: `${playerName} disconnected (${timeoutSeconds}s to reconnect)`,
    timestamp: Date.now(),
  });
  render();
});

socket.on('player-reconnected', ({ playerName }) => {
  state.chatMessages.push({
    playerId: 'system',
    playerName: 'SYSTEM',
    text: `${playerName} reconnected!`,
    timestamp: Date.now(),
  });
  render();
});

// Reconnection handling
socket.on('connect', () => {
  const savedPlayerId = sessionStorage.getItem('salvo-playerId');
  const savedGameId = sessionStorage.getItem('salvo-gameId');
  if (savedPlayerId && savedGameId && state.playerId) {
    socket.emit('rejoin', { playerId: savedPlayerId, gameId: savedGameId });
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
// Rendering
// ============================================================

function render(): void {
  const app = document.getElementById('app')!;

  switch (state.screen) {
    case 'lobby': app.innerHTML = renderLobby(); break;
    case 'waiting': app.innerHTML = renderWaiting(); break;
    case 'placement': app.innerHTML = renderPlacement(); break;
    case 'battle': app.innerHTML = renderBattle(); break;
    case 'gameover': app.innerHTML = renderGameOver(); break;
  }

  bindEvents();
}

function renderError(): string {
  if (!state.errorMessage) return '';
  return `<div class="alert alert-error">${esc(state.errorMessage)}</div>`;
}

function renderLobby(): string {
  return `
    <div class="screen">
      <h1 class="game-title">SALVO</h1>
      <p class="game-subtitle">Shared-Ocean Battleship</p>
      ${renderError()}
      <div class="lobby-cards">
        <div class="lobby-card">
          <h2>Create Game</h2>
          <label class="input-label">Your Name</label>
          <input class="input" id="create-name" type="text" placeholder="Enter your name" maxlength="20" autocomplete="off">
          <div class="timer-config">
            <input type="checkbox" id="timer-enabled">
            <label for="timer-enabled">Turn timer</label>
            <select id="timer-seconds">
              <option value="30">30s</option>
              <option value="60" selected>60s</option>
            </select>
          </div>
          <button class="btn btn-primary" id="btn-create">Create</button>
        </div>
        <div class="lobby-card">
          <h2>Join Game</h2>
          <label class="input-label">Your Name</label>
          <input class="input" id="join-name" type="text" placeholder="Enter your name" maxlength="20" autocomplete="off">
          <label class="input-label">Game Code</label>
          <input class="input input-code" id="join-code" type="text" placeholder="XXXX" maxlength="8" autocomplete="off">
          <button class="btn btn-amber" id="btn-join">Join</button>
        </div>
      </div>
    </div>`;
}

function renderWaiting(): string {
  const players = state.game ? Object.values(state.game.players) : [];
  const isHost = state.game?.players[state.playerId ?? '']?.id === state.game?.turnOrder[0]
    || state.isHost;
  const canStart = players.length >= 2 && isHost;

  const playerListHtml = players.map(p => {
    const isMe = p.id === state.playerId;
    const hostBadge = p.id === Object.keys(state.game?.players ?? {})[0] ? '<span class="host-badge">HOST</span>' : '';
    const botBadge = p.isBot ? `<span class="bot-badge">${esc(p.aiDifficulty ?? 'bot').toUpperCase()}</span>` : '';
    const removeBtn = p.isBot && isHost ? `<button class="btn-remove-bot" data-bot-id="${p.id}" title="Remove bot">&times;</button>` : '';
    return `<li><span class="player-dot"></span> ${esc(p.name)} ${isMe ? '(you)' : ''} ${hostBadge}${botBadge}${removeBtn}</li>`;
  }).join('');

  const waitingSlots = Array(4 - players.length).fill(0).map(() =>
    '<li><span class="player-dot waiting"></span> <span style="color:var(--text-muted)">waiting...</span></li>'
  ).join('');

  const canAddBot = isHost && players.length < 4;

  return `
    <div class="screen">
      <h1 class="game-title">SALVO</h1>
      <p class="game-subtitle">Shared-Ocean Battleship</p>
      ${renderError()}
      <div class="waiting-room">
        <h2 class="label" style="margin-bottom:12px">Game Created</h2>
        <div class="join-code" id="copy-code" title="Click to copy">${state.joinCode ?? ''}</div>
        <p class="join-code-hint">Click to copy &bull; Share with friends</p>
        <ul class="player-list">${playerListHtml}${waitingSlots}</ul>
        ${isHost ? `<button class="btn btn-amber" id="btn-start" ${canStart ? '' : 'disabled'}>${canStart ? 'Start Game' : 'Need 2+ Players'}</button>` : '<p class="player-count">Waiting for host to start...</p>'}
        ${canAddBot ? `
          <div style="display:flex;gap:8px;margin-top:8px">
            <select id="bot-difficulty" class="input" style="margin-bottom:0;flex:1">
              <option value="easy">Easy</option>
              <option value="medium" selected>Medium</option>
              <option value="hard">Hard</option>
              <option value="impossible">Impossible</option>
            </select>
            <button class="btn btn-secondary" id="btn-add-bot" style="width:auto;padding:10px 16px">Add Bot</button>
          </div>
        ` : ''}
        <p class="player-count">${players.length} of 2–4 players</p>
      </div>
    </div>`;
}

function renderPlacement(): string {
  const placedLengths = new Set(state.placedShips.map(s => s.length));
  const allPlaced = SHIP_LENGTHS.every(l => placedLengths.has(l));

  const dockHtml = SHIP_LENGTHS.map(length => {
    const placed = placedLengths.has(length);
    const cells = Array(length).fill('<div class="dock-ship-cell"></div>').join('');
    return `<div class="dock-ship ${placed ? 'placed' : ''}" data-ship-length="${length}">
      ${cells}<span class="dock-ship-name">${SHIP_NAMES[length]}</span>
    </div>`;
  }).join('');

  return `
    <div class="screen">
      <h1 class="game-title" style="font-size:32px">PLACE YOUR SHIPS</h1>
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
        </div>
        <div class="grid-container">
          <div class="grid-panel">
            <h3>Your Ocean</h3>
            ${renderGrid('placement')}
          </div>
          ${state.shipsSent
            ? '<div class="alert alert-info" style="margin-top:16px;max-width:300px">Ships locked in — waiting for other players...</div>'
            : allPlaced
              ? '<button class="btn btn-primary" id="btn-ready" style="margin-top:16px;max-width:200px">Ready!</button>'
              : ''}
        </div>
      </div>
    </div>`;
}

function renderGrid(mode: 'placement' | 'fleet' | 'target'): string {
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
      const { cssClass, symbol } = getCellState(coord, mode);
      html += `<div class="grid-cell ${cssClass}" data-coord="${coord}" data-mode="${mode}">${symbol}</div>`;
    }
  }

  html += '</div>';
  return html;
}

function getCellState(coord: string, mode: 'placement' | 'fleet' | 'target'): { cssClass: string; symbol: string } {
  const game = state.game;

  if (mode === 'placement') {
    // Ghost preview
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
    return { cssClass: 'cell-empty', symbol: '' };
  }

  if (!game || !state.playerId) return { cssClass: 'cell-empty', symbol: '' };

  const myPlayer = game.players[state.playerId];
  const isShot = game.shots.includes(coord);

  if (mode === 'fleet') {
    // My ships
    const myShip = myPlayer?.ships.find(s => s.cells.includes(coord));
    if (myShip) {
      if (myShip.sunk) return { cssClass: 'cell-sunk', symbol: '\u2716' };
      if (myShip.hits.includes(coord)) return { cssClass: 'cell-ff', symbol: '\u26A0' };
      return { cssClass: 'cell-ship', symbol: '\u25A0' };
    }
    // Fleet view: only show shot indicators on YOUR ship cells (handled above).
    // Shots at empty cells on your grid are not shown — fleet view is defense-only.
    return { cssClass: 'cell-empty', symbol: '' };
  }

  // Target mode
  if (state.selectedTargets.includes(coord)) {
    return { cssClass: 'cell-selected', symbol: '\u25CE' };
  }

  if (isShot) {
    // Check if any player was hit at this coord
    let wasHit = false;
    let wasSunk = false;
    for (const player of Object.values(game.players)) {
      for (const ship of player.ships) {
        if (ship.hits.includes(coord)) {
          wasHit = true;
          if (ship.sunk) wasSunk = true;
        }
      }
    }
    // Also check shot log for hit info
    for (const entry of state.shotLog) {
      for (const shot of entry.shots) {
        if (shot.coord === coord && shot.hits.length > 0) {
          wasHit = true;
          if (shot.hits.some(h => h.sunk)) wasSunk = true;
        }
      }
    }
    if (wasSunk) return { cssClass: 'cell-sunk', symbol: '\u2716' };
    if (wasHit) return { cssClass: 'cell-hit', symbol: '\u00D7' };
    return { cssClass: 'cell-miss', symbol: '\u2022' };
  }

  return { cssClass: 'cell-empty', symbol: '' };
}

function renderBattle(): string {
  if (!state.game || !state.playerId) return '';

  const myPlayer = state.game.players[state.playerId];
  const currentTurnId = state.game.turnOrder[state.game.currentTurnIndex];
  const isMyTurn = currentTurnId === state.playerId;
  const expectedShots = myPlayer ? myPlayer.shotCount : 0;
  const canFire = isMyTurn && state.selectedTargets.length === expectedShots;

  const playersHtml = Object.values(state.game.players).map(p => {
    const isMe = p.id === state.playerId;
    const isCurrent = p.id === currentTurnId;
    const dotClass = p.alive ? '' : 'dead';
    const nameStyle = p.alive ? '' : 'text-decoration:line-through;color:var(--text-muted)';
    return `<li>
      <span class="player-dot ${dotClass}"></span>
      <span style="${nameStyle}">${esc(p.name)}${isMe ? ' (you)' : ''}</span>
      <span style="margin-left:auto;font-family:var(--font-mono);font-size:11px;color:var(--text-muted)">${p.alive ? p.shotCount + ' ships' : 'out'}</span>
      ${isCurrent && p.alive ? '<span style="color:var(--amber);font-size:10px">\u25C0</span>' : ''}
    </li>`;
  }).join('');

  const shotLogHtml = state.shotLog.slice(0, 20).map(entry => {
    return entry.shots.map(shot => {
      const coordHtml = `<span class="coord">${shot.coord}</span>`;
      if (shot.miss) {
        return `<div class="shot-log-entry">${coordHtml}<span class="miss-text">\u2022 Miss (${esc(entry.shooterName)})</span></div>`;
      }
      return shot.hits.map(hit => {
        const isFriendlyFire = hit.playerId === entry.shooterName || (state.playerId && hit.playerId === state.playerId && entry.shooterName !== state.game?.players[state.playerId]?.name);
        // Check if it's the shooter hitting themselves
        const shooterPlayer = Object.values(state.game?.players ?? {}).find(p => p.name === entry.shooterName);
        const isFF = shooterPlayer && hit.playerId === shooterPlayer.id;
        const isMyShipHit = hit.playerId === state.playerId;

        if (isMyShipHit && !isFF) {
          return `<div class="shot-log-entry">${coordHtml}<span class="ff">\u26A0 ${esc(entry.shooterName)} hit YOUR ${SHIP_NAMES[hit.shipLength]}${hit.sunk ? ' (SUNK!)' : ''}</span></div>`;
        }
        if (isFF) {
          return `<div class="shot-log-entry">${coordHtml}<span class="ff">\u26A0 FRIENDLY FIRE \u2014 ${esc(entry.shooterName)} hit own ${SHIP_NAMES[hit.shipLength]}${hit.sunk ? ' (SUNK!)' : ''}</span></div>`;
        }
        const cls = hit.sunk ? 'sunk-text' : 'hit';
        return `<div class="shot-log-entry">${coordHtml}<span class="${cls}">\u00D7 ${esc(entry.shooterName)} hit ${esc(hit.playerName)}'s ${SHIP_NAMES[hit.shipLength]}${hit.sunk ? ' (SUNK!)' : ''}</span></div>`;
      }).join('');
    }).join('');
  }).join('');

  const chatHtml = state.chatMessages.slice(-30).map(m => {
    if (m.playerId === 'system') {
      return `<div class="chat-msg" style="color:var(--amber);font-style:italic">${esc(m.text)}</div>`;
    }
    return `<div class="chat-msg"><span class="chat-name">${esc(m.playerName)}:</span> ${esc(m.text)}</div>`;
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
      <div class="mobile-tab-bar">
        <button class="mobile-tab ${state.mobileTab === 'fleet' ? 'active' : ''}" data-tab="fleet">Your Fleet</button>
        <button class="mobile-tab ${state.mobileTab === 'target' ? 'active' : ''}" data-tab="target">Target Ocean</button>
      </div>
      <div class="battle-layout">
        <div class="grid-panel ${state.mobileTab === 'target' ? 'mobile-hidden' : ''}" id="fleet-panel">
          <h3>Your Fleet</h3>
          ${renderGrid('fleet')}
        </div>
        <div class="grid-panel ${state.mobileTab === 'fleet' ? 'mobile-hidden' : ''}" id="target-panel">
          <h3>Target Ocean</h3>
          ${renderGrid('target')}
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
          <div class="chat-panel">
            <h3>Chat</h3>
            <div class="chat-messages">${chatHtml}</div>
            <div class="chat-input-row">
              <input class="input" id="chat-input" type="text" placeholder="Type a message..." maxlength="200" autocomplete="off">
              <button class="btn btn-secondary" id="btn-chat">Send</button>
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

function renderGameOver(): string {
  if (!state.gameOverStats || !state.game) return '';

  const stats = state.gameOverStats;
  const winner = stats.winnerId ? state.game.players[stats.winnerId] : null;

  const highlightsHtml = stats.highlights.map(h => `<p class="highlight">${esc(h)}</p>`).join('');

  const pending = state.rematchPending;
  const alreadyAccepted = pending?.acceptedIds.includes(state.playerId ?? '') ?? false;

  let rematchHtml: string;
  if (alreadyAccepted && pending) {
    rematchHtml = `<div class="alert alert-info" style="max-width:300px;margin:24px auto 0">Waiting for others... (${pending.acceptedIds.length}/${pending.totalHumans})</div>`;
  } else {
    rematchHtml = `<button class="btn btn-amber" id="btn-rematch" style="max-width:300px;margin:24px auto 0">Play Again</button>`;
  }

  return `
    <div class="screen">
      <div class="game-over">
        <h1 class="${winner ? '' : 'draw'}">${winner ? `${esc(winner.name)} WINS!` : 'DRAW!'}</h1>
        <p style="color:var(--text-secondary);margin-bottom:16px">
          ${winner ? 'Last player standing' : 'All players eliminated simultaneously'}
        </p>
        ${highlightsHtml}
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
  on('btn-create', 'click', () => {
    const name = val('create-name');
    if (!name) return showError('Enter your name');
    const timerEnabled = (document.getElementById('timer-enabled') as HTMLInputElement)?.checked ?? false;
    const timerSecs = parseInt((document.getElementById('timer-seconds') as HTMLSelectElement)?.value ?? '60', 10);
    state.isHost = true;
    socket.emit('create-game', {
      playerName: name,
      timerConfig: { enabled: timerEnabled, seconds: timerSecs },
    });
  });

  on('btn-join', 'click', () => {
    const name = val('join-name');
    const code = val('join-code');
    if (!name) return showError('Enter your name');
    if (!code) return showError('Enter a game code');
    socket.emit('join-game', { code: code.toUpperCase(), playerName: name });
  });

  // Enter key on inputs
  onKey('create-name', 'Enter', () => document.getElementById('btn-create')?.click());
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

  document.querySelectorAll('.btn-remove-bot').forEach(el => {
    el.addEventListener('click', () => {
      const botId = el.getAttribute('data-bot-id');
      if (botId) socket.emit('remove-bot', { botId });
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
      } else if (mode === 'target') {
        handleTargetClick(coord);
      }
    });
  });

  on('btn-ready', 'click', () => {
    socket.emit('place-ships', { ships: state.placedShips });
    state.shipsSent = true;
    render();
  });

  on('btn-fire', 'click', () => {
    if (state.selectedTargets.length === 0) return;
    socket.emit('fire', { coords: state.selectedTargets });
    state.isMyTurn = false;
    stopTimer();
  });

  // Mobile tabs
  document.querySelectorAll('.mobile-tab').forEach(el => {
    el.addEventListener('click', () => {
      state.mobileTab = el.getAttribute('data-tab') as 'fleet' | 'target';
      render();
    });
  });

  // Chat
  on('btn-chat', 'click', () => {
    const text = val('chat-input');
    if (!text) return;
    socket.emit('chat-message', { text });
    (document.getElementById('chat-input') as HTMLInputElement).value = '';
  });

  // Rematch
  on('btn-rematch', 'click', () => {
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
}

function handlePlacementClick(coord: string): void {
  // If clicking on an already-placed ship, remove it
  const existingIdx = state.placedShips.findIndex(s => s.cells.includes(coord));
  if (existingIdx !== -1) {
    state.placedShips.splice(existingIdx, 1);
    render();
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

function on(id: string, event: string, handler: () => void): void {
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

// ============================================================
// Initial Render
// ============================================================

initTheme();
render();
