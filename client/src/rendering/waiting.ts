import { state } from '../state.js';
import { esc, playerIcon } from '../helpers/dom.js';
import { SLOT_COLORS } from '@salvo/shared';
import type { WirePlayer, LobbyCapabilities } from '@salvo/shared';
import { renderError } from './lobby.js';
import { renderChat } from './chat.js';

// --- Seat card helpers ---

function renderOpenSlot(
  slotIndex: number,
  slotColor: string,
  caps: LobbyCapabilities,
  openSlotCounter: { value: number },
  team?: string,
): string {
  const menuItems: string[] = [];

  if (caps.canMoveToSlot) {
    menuItems.push(`<button class="seat-menu-item" role="menuitem" data-action="move-to-slot" data-slot-index="${slotIndex}">Move here</button>`);
  }

  if (caps.canAddBot) {
    menuItems.push(`<button class="seat-menu-item" role="menuitem" data-action="add-bot" data-bot-diff="easy" data-bot-team="${team ?? ''}" data-bot-slot="${slotIndex}">Add AI (Easy)</button>`);
    menuItems.push(`<button class="seat-menu-item" role="menuitem" data-action="add-bot" data-bot-diff="medium" data-bot-team="${team ?? ''}" data-bot-slot="${slotIndex}">Add AI (Medium)</button>`);
    menuItems.push(`<button class="seat-menu-item" role="menuitem" data-action="add-bot" data-bot-diff="hard" data-bot-team="${team ?? ''}" data-bot-slot="${slotIndex}">Add AI (Hard)</button>`);
    menuItems.push(`<button class="seat-menu-item" role="menuitem" data-action="add-bot" data-bot-diff="impossible" data-bot-team="${team ?? ''}" data-bot-slot="${slotIndex}">Add AI (Impossible)</button>`);
  }

  if (menuItems.length === 0) {
    return `<div class="seat-card open seat-empty player-color-${slotColor}" data-player-color="${slotColor}">
      <span style="color:var(--player-${slotColor});opacity:0.4;font-size:12px">Open</span>
    </div>`;
  }

  const slotId = `open-${team ?? 'any'}-${openSlotCounter.value++}`;
  const isOpen = state.openDropdownId === slotId;
  return `<div class="seat-card open seat-empty player-color-${slotColor}" data-player-color="${slotColor}">
    <span style="color:var(--player-${slotColor});opacity:0.4;font-size:12px">Open</span>
    <button class="seat-menu-trigger" data-dropdown-id="${slotId}" aria-haspopup="true" aria-expanded="${isOpen}">+</button>
    <div class="seat-menu${isOpen ? ' open' : ''}" role="menu">
      ${menuItems.join('')}
    </div>
  </div>`;
}

function buildSeatMenuItems(
  p: WirePlayer,
  caps: LobbyCapabilities,
  isMe: boolean,
  teamsEnabled: boolean,
  teams: Record<string, string>,
  players: WirePlayer[],
): string[] {
  const menuItems: string[] = [];

  if (teamsEnabled) {
    menuItems.push(...buildTeamMoveItems(p, caps, isMe, teams, players));
  }

  // Swap request (other players only, not self, not bots for non-host)
  if (!isMe && !p.isBot && caps.canRequestSwap) {
    menuItems.push(`<button class="seat-menu-item" role="menuitem" data-action="request-swap" data-target="${p.id}">Request Swap</button>`);
  }

  // Kick (host only, not self)
  if (!isMe && caps.canKick) {
    menuItems.push(`<button class="seat-menu-item seat-menu-item-danger" role="menuitem" data-action="kick" data-target="${p.id}">Kick</button>`);
  }

  // Transfer host (host only, human targets only, not self)
  if (!isMe && !p.isBot && caps.canTransferHost) {
    menuItems.push(`<button class="seat-menu-item" role="menuitem" data-action="transfer-host" data-target="${p.id}">Transfer Host</button>`);
  }

  return menuItems;
}

function buildHostTeamActions(
  menuItems: string[],
  playerId: string,
  canMove: boolean,
  otherTeam: string,
  otherTeamLabel: string,
  otherTeamPlayers: WirePlayer[],
): void {
  if (canMove) {
    menuItems.push(`<button class="seat-menu-item" role="menuitem" data-action="move" data-target="${playerId}" data-move-team="${otherTeam}">Move to ${otherTeamLabel}</button>`);
  } else {
    for (const op of otherTeamPlayers) {
      menuItems.push(`<button class="seat-menu-item" role="menuitem" data-action="swap" data-player-a="${playerId}" data-player-b="${op.id}">Swap with ${esc(op.name)}</button>`);
    }
  }
}

function getTeamNames(): string[] {
  return (state.game?.gameType ?? '2-team') === '3-team'
    ? ['alpha', 'bravo', 'charlie']
    : ['alpha', 'bravo'];
}

function buildTeamMoveItems(
  p: WirePlayer,
  caps: LobbyCapabilities,
  isMe: boolean,
  teams: Record<string, string>,
  players: WirePlayer[],
): string[] {
  const menuItems: string[] = [];
  const myTeam = teams[p.id];
  const labels: Record<string, string> = { alpha: 'Alpha', bravo: 'Bravo', charlie: 'Charlie' };
  const teamNames = getTeamNames();
  const maxPerTeam = Math.floor(6 / teamNames.length);
  const canSelfMove = isMe && !p.isBot && caps.canMoveToSlot;

  for (const otherTeam of teamNames.filter(t => t !== myTeam)) {
    const label = labels[otherTeam] ?? otherTeam;
    const otherPlayers = players.filter(pl => teams[pl.id] === otherTeam);
    const canMove = otherPlayers.length < maxPerTeam;

    if (caps.canKick) {
      buildHostTeamActions(menuItems, p.id, canMove, otherTeam, label, otherPlayers);
    } else if (canSelfMove && canMove) {
      menuItems.push(`<button class="seat-menu-item" role="menuitem" data-action="move" data-target="${p.id}" data-move-team="${otherTeam}">Move to ${label}</button>`);
    }
  }
  return menuItems;
}

function renderSeatDropdown(menuItems: string[], playerId: string): string {
  if (menuItems.length === 0) return '';
  const cardId = `seat-${playerId}`;
  const isOpen = state.openDropdownId === cardId;
  return `
    <button class="seat-menu-trigger" data-dropdown-id="${cardId}" aria-haspopup="true" aria-expanded="${isOpen}">\u22EE</button>
    <div class="seat-menu${isOpen ? ' open' : ''}" role="menu">${menuItems.join('')}</div>`;
}

function renderSwapNotification(): string {
  if (!state.pendingSwapRequest) return '';
  const req = state.pendingSwapRequest;
  return `
    <div class="swap-notification" role="alert" aria-live="assertive">
      <span><strong style="color:var(--text-primary)">${esc(req.requesterName)}</strong> wants to swap</span>
      <div class="swap-actions">
        <button class="btn btn-primary btn-sm seat-menu-item" data-action="accept-swap" data-requester="${req.requesterId}">Accept</button>
        <button class="btn btn-secondary btn-sm seat-menu-item" data-action="decline-swap" data-requester="${req.requesterId}">Decline</button>
      </div>
    </div>`;
}

function seatBadges(p: WirePlayer, caps: LobbyCapabilities): string {
  const badges: string[] = [];
  if (p.id === state.playerId) badges.push('<span class="player-you-badge">YOU</span>');
  if (!p.isBot && caps.readyStates[p.id]) badges.push('<span class="ready-badge">✓</span>');
  if (p.id === state.game?.hostId) badges.push('<span class="host-badge">HOST</span>');
  if (p.isBot) badges.push(`<span class="bot-badge">${esc(p.aiDifficulty ?? 'bot').toUpperCase()}</span>`);
  return badges.join('');
}

function renderFilledSeat(
  p: WirePlayer,
  slotColor: string,
  caps: LobbyCapabilities,
  teamsEnabled: boolean,
  teams: Record<string, string>,
  players: WirePlayer[],
): string {
  const isMe = p.id === state.playerId;
  const menuItems = buildSeatMenuItems(p, caps, isMe, teamsEnabled, teams, players);
  const dropdownHtml = renderSeatDropdown(menuItems, p.id);
  const color = p.color ?? slotColor;
  const selfClass = isMe ? ' player-card-self' : '';
  const swapNotification = isMe ? renderSwapNotification() : '';

  return `<div class="seat-card player-color-${color}${selfClass}" data-player-color="${color}">
    ${playerIcon(p.isBot)} <span class="player-name">${esc(p.name)}</span> ${seatBadges(p, caps)}${dropdownHtml}
  </div>${swapNotification}`;
}

export function renderSeatCard(
  p: WirePlayer | null,
  slotIndex: number,
  caps: LobbyCapabilities,
  teamsEnabled: boolean,
  teams: Record<string, string>,
  players: WirePlayer[],
  openSlotCounter: { value: number },
  team?: string,
): string {
  const slotColor = SLOT_COLORS[slotIndex] ?? 'green';
  if (!p) {
    return renderOpenSlot(slotIndex, slotColor, caps, openSlotCounter, team);
  }
  return renderFilledSeat(p, slotColor, caps, teamsEnabled, teams, players);
}

export function renderCustomSelect(
  id: string,
  options: { value: string; label: string; desc?: string }[],
  selected: string,
  isHost: boolean,
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

// --- Waiting room helpers ---

function renderGameOptionsPanel(isHost: boolean): string {
  const game = state.game;
  if (!game) return '';
  const gameType = game.gameType ?? 'ffa';
  const islandCount = game.islandCount ?? 6;

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
  const timerSelected = !game.timerConfig.enabled ? '0' : String(game.timerConfig.seconds);
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

  return `
    <div class="game-options-panel">
      <div class="section-label">GAME OPTIONS</div>
      <div class="option-group"><div class="option-label">Game Type</div>${renderCustomSelect('opt-game-type', gameTypeOptions, gameType, isHost)}</div>
      <div class="option-group"><div class="option-label">Turn Timer</div>${renderCustomSelect('opt-timer', timerOptions, timerSelected, isHost)}</div>
      <div class="option-group"><div class="option-label">Grid Size</div>${renderCustomSelect('opt-rings', ringsOptions, String(game.rings), isHost)}</div>
      <div class="option-group"><div class="option-label">Islands</div>${renderCustomSelect('opt-islands', islandOptions, String(islandCount), isHost)}</div>
    </div>
  `;
}

function renderTeamLobby(
  players: WirePlayer[],
  teams: Record<string, string>,
  gameType: string,
  caps: LobbyCapabilities,
  teamsEnabled: boolean,
  openSlotCounter: { value: number },
): string {
  const MAX_PLAYERS = 6;
  const activeTeams = gameType === '3-team'
    ? ['alpha', 'bravo', 'charlie']
    : ['alpha', 'bravo'];
  const slotsPerTeam = Math.floor(MAX_PLAYERS / activeTeams.length);
  const teamLabels: Record<string, string> = { alpha: 'ALPHA', bravo: 'BRAVO', charlie: 'CHARLIE' };

  let globalSlot = 0;
  const sections = activeTeams.map(teamName => {
    const teamPlayers = players.filter(p => teams[p.id] === teamName);
    const teamSlotCards: string[] = [];
    for (let i = 0; i < slotsPerTeam; i++) {
      const slotIdx = globalSlot++;
      const slotColor = SLOT_COLORS[slotIdx];
      const player = teamPlayers.find(p => p.color === slotColor);
      teamSlotCards.push(renderSeatCard(player ?? null, slotIdx, caps, teamsEnabled, teams, players, openSlotCounter, teamName));
    }
    return `
      <div class="team-section">
        <div class="team-section-header ${teamName}">${teamLabels[teamName]}</div>
        ${teamSlotCards.join('')}
      </div>`;
  }).join('');

  return `<div class="lobby-stacked">${sections}</div>`;
}

function renderFfaLobby(
  players: WirePlayer[],
  teams: Record<string, string>,
  caps: LobbyCapabilities,
  teamsEnabled: boolean,
  openSlotCounter: { value: number },
): string {
  const slotCards = SLOT_COLORS.map((slotColor, i) => {
    const player = players.find(p => p.color === slotColor);
    return renderSeatCard(player ?? null, i, caps, teamsEnabled, teams, players, openSlotCounter);
  }).join('');

  return `
    <div class="lobby-stacked">
      <div class="team-section-header" style="color:var(--text-muted)">PLAYERS</div>
      ${slotCards}
    </div>`;
}

function renderReadyButton(caps: LobbyCapabilities): string {
  if (!caps.canToggleReady) return '';
  const readyClass = caps.isReady ? 'btn btn-primary' : 'btn';
  const readyText = caps.isReady ? 'READY ✓' : 'READY';
  const readyStyle = caps.isReady ? '' : 'border-color:var(--text-muted)';
  return `<button class="${readyClass}" id="btn-toggle-ready" role="switch" aria-checked="${caps.isReady}" aria-label="Toggle ready status" style="${readyStyle}">${readyText}</button>`;
}

function renderStartButton(caps: LobbyCapabilities, playerCount: number): string {
  const isHost = caps.canStart || caps.canChangeOptions; // host indicators

  if (!isHost) {
    if (caps.isReady) {
      return '<p class="player-count" style="color:var(--text-muted)">Waiting for host to start...</p>';
    }
    return '';
  }

  if (!caps.canStart) {
    // Host is not ready yet — don't show start button
    if (playerCount < 2) {
      return '<p class="player-count">Need 2+ Players</p>';
    }
    return '';
  }

  // Host is ready — show Start button
  if (caps.allPlayersReady) {
    return `<button class="btn btn-primary start-pulse" id="btn-start">START GAME</button>`;
  }

  // Amber path
  if (state.showAmberConfirm) {
    return `
      <div class="amber-confirm">
        <p style="color:var(--text-secondary);font-size:14px">Not all players are ready. Start anyway?</p>
        <button class="btn btn-amber btn-sm" id="btn-start-force">Start</button>
        <button class="btn btn-sm" id="btn-start-cancel" style="border-color:var(--text-muted)">Wait</button>
      </div>`;
  }

  return `<button class="btn btn-amber" id="btn-start">START GAME</button>`;
}

function renderCountdownOverlay(): string {
  if (!state.countdownDeadline) return '';
  const remaining = Math.max(0, Math.ceil((state.countdownDeadline - Date.now()) / 1000));
  return `
    <div class="countdown-overlay" role="timer" aria-live="assertive">
      <div class="countdown-number">${remaining}</div>
      <div class="countdown-subtitle">LAUNCHING...</div>
    </div>`;
}

function defaultCapabilities(isHost: boolean): LobbyCapabilities {
  return {
    canChangeOptions: isHost,
    canAddBot: isHost,
    canKick: isHost,
    canMoveToSlot: true,
    canRequestSwap: true,
    canToggleReady: true,
    canStart: false,
    canTransferHost: isHost,
    allPlayersReady: false,
    isReady: false,
    readyStates: {},
  };
}

function getWaitingRoomState() {
  const g = state.game;
  const isHost = g?.hostId === state.playerId || state.isHost;
  if (!g) {
    return {
      players: [] as WirePlayer[],
      isHost,
      teamsEnabled: false,
      teams: {} as Record<string, string>,
      gameType: 'ffa',
      caps: state.capabilities ?? defaultCapabilities(isHost),
    };
  }
  return {
    players: Object.values(g.players),
    isHost,
    teamsEnabled: g.teamsEnabled,
    teams: g.teams,
    gameType: g.gameType,
    caps: state.capabilities ?? defaultCapabilities(isHost),
  };
}

export function renderWaiting(): string {
  const MAX_PLAYERS = 6;
  const { players, isHost, teamsEnabled, teams, gameType, caps } = getWaitingRoomState();
  const openSlotCounter = { value: 0 };

  const lobbyPlayersHtml = teamsEnabled
    ? renderTeamLobby(players, teams, gameType, caps, teamsEnabled, openSlotCounter)
    : renderFfaLobby(players, teams, caps, teamsEnabled, openSlotCounter);

  return `
    <div class="screen">
      <h1 class="game-title">HULLCRACKER.IO</h1>
      <p class="game-subtitle">Multiplayer Naval Warfare</p>
      ${renderError()}
      ${renderCountdownOverlay()}
      <div class="waiting-room">
        <h2 class="label" style="margin-bottom:12px">Game Created</h2>
        <div class="join-code" id="copy-code" title="Click to copy">${state.joinCode ?? ''}</div>
        <p class="join-code-hint">Click to copy &bull; Share with friends</p>
        <div class="lobby-body">
          <div class="lobby-players">
            ${lobbyPlayersHtml}
            ${renderReadyButton(caps)}
            ${renderStartButton(caps, players.length)}
            <button class="btn leave-btn" id="btn-leave">Leave Game</button>
          </div>
          <div class="lobby-right-col">
            ${renderGameOptionsPanel(isHost)}
            <div class="lobby-chat-panel">
              <div class="section-label">CHAT</div>
              ${renderChat()}
            </div>
          </div>
        </div>
        <p class="player-count">${players.length} of 2\u2013${MAX_PLAYERS} players</p>
      </div>
    </div>`;
}
