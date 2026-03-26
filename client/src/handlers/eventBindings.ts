import { state } from '../state.js';
import { render } from '../rendering/render.js';
import { socket } from '../socket.js';
import { on, onKey, val } from '../helpers/dom.js';
import { saveName } from '../helpers/storage.js';
import { generateRandomName } from '../helpers/format.js';
import { showError } from '../errors.js';
import { handlePlacementClick, randomizePlacement } from './placement.js';
import { handleTargetClick } from './battle.js';
import { loadChangelog } from '../rendering/lobby.js';
import { svgClickToHex, nextDirection, parseHex, getShipPreview } from '../hexGrid.js';
import type { AiDifficulty, QuickPlayMode, ChatChannel } from '@salvo/shared';
import { stopTimer } from '../timers/index.js';

function handleQPJoin(mode: QuickPlayMode): void {
  const name = val('player-name');
  if (!name) return showError('Enter your name');
  saveName(name);
  state.queueMode = mode;
  state.queueSize = 0;
  state.screen = 'queue';
  history.pushState({ screen: 'queue' }, '');
  socket.emit('quickplay-join', { playerName: name, mode });
  render();
}

function handleAddBot(el: Element): void {
  const difficulty = el.getAttribute('data-bot-diff') as AiDifficulty;
  const team = el.getAttribute('data-bot-team') || undefined;
  const slotStr = el.getAttribute('data-bot-slot');
  const slotIndex = slotStr != null ? parseInt(slotStr, 10) : undefined;
  if (difficulty) socket.emit('add-bot', { difficulty, ...(team ? { team } : {}), ...(slotIndex != null ? { slotIndex } : {}) });
}

function handleSeatMove(el: Element): void {
  const targetId = el.getAttribute('data-target');
  if (targetId) socket.emit('swap-team', { targetPlayerId: targetId });
}

function handleSeatSwap(el: Element): void {
  const playerA = el.getAttribute('data-player-a');
  const playerB = el.getAttribute('data-player-b');
  if (playerA && playerB) socket.emit('swap-players', { playerA, playerB });
}

function handleSeatKick(el: Element): void {
  const botId = el.getAttribute('data-bot-id');
  if (botId) socket.emit('remove-bot', { botId });
}

function handleSeatMoveToSlot(el: Element): void {
  const slotStr = el.getAttribute('data-slot-index');
  if (slotStr != null) socket.emit('move-to-slot', { slotIndex: parseInt(slotStr, 10) });
}

const seatActions: Record<string, (el: Element) => void> = {
  'add-bot': handleAddBot,
  'move': handleSeatMove,
  'swap': handleSeatSwap,
  'kick': handleSeatKick,
  'move-to-slot': handleSeatMoveToSlot,
};

function handleSeatMenuAction(el: Element): void {
  const action = el.getAttribute('data-action');
  if (action && seatActions[action]) seatActions[action](el);
}

export function bindEvents(): void {
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
  on('btn-qp-1v1', 'click', () => handleQPJoin('1v1'));
  on('btn-qp-2v2', 'click', () => handleQPJoin('2v2'));
  on('btn-qp-3v3', 'click', () => handleQPJoin('3v3'));
  on('btn-qp-3ffa', 'click', () => handleQPJoin('3ffa'));
  on('btn-qp-6ffa', 'click', () => handleQPJoin('6ffa'));
  on('btn-qp-2v2v2', 'click', () => handleQPJoin('2v2v2'));

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
      handleSeatMenuAction(el);
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

}
