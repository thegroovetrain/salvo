import { state } from '../state.js';
import { esc, playerIcon } from '../helpers/dom.js';
import { SHIP_LENGTHS, SHIP_NAMES } from '@salvo/shared';
import { allHexes } from '../hexGrid.js';
import type { WirePlayer, ShotResult } from '@salvo/shared';
import type { ShotLogEntry } from '../state.js';
import { renderGrid } from './grid.js';
import { renderChat } from './chat.js';
import { renderError } from './lobby.js';

export function renderPlacement(): string {
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

// --- Battle screen helpers ---

function renderPlayerListItem(
  p: WirePlayer,
  currentTurnId: string,
  teamsEnabled: boolean,
  teams: Record<string, string>,
): string {
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
}

function renderShotLine(shot: ShotResult, shooterId: string): string {
  if (shot.miss) {
    return `<div class="shot-log-line"><span class="coord">${shot.coord}</span> <span class="miss-text">miss</span></div>`;
  }
  const nameSpans = shot.hits.map(h => {
    const hitColor = state.game?.players[h.playerId]?.color ?? 'green';
    const isSelf = h.playerId === shooterId;
    return isSelf ? `<span class="ff">${esc(h.playerName)}</span>` : `<span class="player-color-${hitColor}">${esc(h.playerName)}</span>`;
  });
  return `<div class="shot-log-line"><span class="coord">${shot.coord}</span> <span class="hit">hit: [${nameSpans.join(', ')}]</span></div>`;
}

function renderShotLogEntry(entry: ShotLogEntry): string {
  const allCoords = entry.shots.map(s => s.coord).join(',');
  const shooterColor = state.game?.players[entry.shooterId]?.color ?? 'green';

  const shotLines = entry.shots.map(shot => renderShotLine(shot, entry.shooterId)).join('');

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
}

function renderGameModeLabel(teams: Record<string, string>): string {
  const teamIds = [...new Set(Object.values(teams))];
  const teamLabels = teamIds.map(t => `<span class="team-badge ${t}" style="font-size:inherit;padding:0;background:none">${t.charAt(0).toUpperCase() + t.slice(1)}</span>`);
  const modeShort = teamIds.length > 2 ? `${teamIds.length}-team` : '2v2';
  return `<div class="game-mode-label"><span class="desktop-only">TEAM BATTLE</span><span class="mobile-only">${modeShort}</span> \u2014 ${teamLabels.join(' vs ')}</div>`;
}

function renderTurnIndicator(isMyTurn: boolean, currentPlayer: WirePlayer | undefined, expectedShots: number): string {
  const turnPlayerColor = currentPlayer?.color ?? 'green';
  const turnText = isMyTurn
    ? `<span class="player-color-${turnPlayerColor}">YOUR TURN</span> \u2014 ${expectedShots} shot${expectedShots !== 1 ? 's' : ''}`
    : `<span class="player-color-${turnPlayerColor}">${esc(currentPlayer?.name ?? '???')}</span>'s turn`;

  const timerHtml = state.timerSeconds !== null
    ? `<div class="turn-timer ${state.timerSeconds <= 10 ? 'warning' : ''}">${Math.floor(state.timerSeconds / 60)}:${(state.timerSeconds % 60).toString().padStart(2, '0')}</div>`
    : '';

  return `<div class="turn-indicator ${isMyTurn ? 'your-turn' : 'waiting'}">${turnText}${timerHtml}</div>`;
}

function renderFireControls(canFire: boolean, expectedShots: number): string {
  return `
    <button class="btn btn-amber fire-btn" id="btn-fire" ${canFire ? '' : 'disabled'}>FIRE SALVO</button>
    <p class="shot-count">${state.selectedTargets.length} of ${expectedShots} targets selected</p>
  `;
}

function renderSortedPlayerList(currentTurnId: string, teamsEnabled: boolean, teams: Record<string, string>): string {
  const playerEntries = Object.entries(state.game!.players);
  if (state.game!.turnOrder.length > 0) {
    playerEntries.sort((a, b) => state.game!.turnOrder.indexOf(a[0]) - state.game!.turnOrder.indexOf(b[0]));
  }
  return playerEntries.map(([, p]) => renderPlayerListItem(p, currentTurnId, teamsEnabled, teams)).join('');
}

function renderShotLogPanel(): string {
  const shotLogHtml = state.shotLog.map(entry => renderShotLogEntry(entry)).join('');
  return `<div class="shot-log">${shotLogHtml || '<p style="color:var(--text-muted);font-size:12px">No shots fired yet</p>'}</div>`;
}

function renderSurrenderButton(alive: boolean): string {
  return alive ? '<button class="btn btn-danger" id="btn-surrender" style="margin-top:12px;width:100%">Surrender</button>' : '';
}

export function renderBattle(): string {
  if (!state.game || !state.playerId) return '';

  const myPlayer = state.game.players[state.playerId];
  const currentTurnId = state.game.turnOrder[state.game.currentTurnIndex];
  const isMyTurn = currentTurnId === state.playerId;
  const expectedShots = myPlayer ? myPlayer.shotCount : 0;
  // Cap shots at available unshot hexes (late-game boards may have fewer targets)
  const unshotCount = state.game.shots ? allHexes(state.game.rings).filter(c => !state.game!.shots.includes(c) && !state.game!.islands.includes(c)).length : expectedShots;
  const maxShots = Math.min(expectedShots, unshotCount);
  const teamsEnabled = state.game.teamsEnabled;
  const gameModeLabel = teamsEnabled ? renderGameModeLabel(state.game.teams) : '';
  const currentPlayer = state.game.players[currentTurnId];
  const canFire = isMyTurn && state.selectedTargets.length >= 1 && state.selectedTargets.length <= maxShots;

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
          ${renderTurnIndicator(isMyTurn, currentPlayer, maxShots)}
          <h3 class="label" style="margin-bottom:8px">Players</h3>
          <ul class="player-list" style="margin-bottom:12px">${renderSortedPlayerList(currentTurnId, teamsEnabled, state.game.teams)}</ul>
          ${isMyTurn ? renderFireControls(canFire, maxShots) : ''}
          <h3 class="label" style="margin:12px 0 8px">Shot Log</h3>
          ${renderShotLogPanel()}
          ${renderChat()}
          ${renderSurrenderButton(myPlayer?.alive ?? false)}
        </div>
      </div>
    </div>`;
}
