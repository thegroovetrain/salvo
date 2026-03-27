import { state } from '../state.js';
import { esc, playerIcon } from '../helpers/dom.js';
import { renderGrid } from './grid.js';
import type { WirePlayer, GameOverStats } from '@salvo/shared';

function getWinnerBanner(
  teamsEnabled: boolean,
  winnerTeamId: string | null | undefined,
  winner: WirePlayer | null,
): { text: string; subtext: string; winClass: string } {
  if (teamsEnabled && winnerTeamId) {
    return {
      text: `TEAM ${winnerTeamId.toUpperCase()} WINS!`,
      subtext: 'The opposing team has been eliminated',
      winClass: `team-win-${winnerTeamId}`,
    };
  }
  if (winner) {
    const winnerColor = winner.color ?? 'green';
    return {
      text: `<span class="player-color-${winnerColor}">${esc(winner.name)}</span> WINS!`,
      subtext: 'Last player standing',
      winClass: '',
    };
  }
  return { text: 'DRAW!', subtext: 'All players eliminated simultaneously', winClass: 'draw' };
}

function renderStatsRow(
  p: WirePlayer,
  stats: GameOverStats,
  teamsEnabled: boolean,
  teams: Record<string, string>,
  winnerTeamId: string | null | undefined,
): string {
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
}

function renderPostGameButtons(): string {
  const isPrivate = state.game?.mode === 'private';

  if (isPrivate) {
    // Custom games: "Return to Lobby" as primary action
    return `<button class="btn btn-primary" id="btn-return-lobby" style="max-width:300px;margin:24px auto 0">Return to Lobby</button>`;
  }

  // Quick play: show rematch (requeue) + new game
  const pending = state.rematchPending;
  const alreadyAccepted = pending?.acceptedIds.includes(state.playerId ?? '') ?? false;
  if (alreadyAccepted && pending) {
    return `<div class="alert alert-info" style="max-width:300px;margin:24px auto 0">Waiting for others... (${pending.acceptedIds.length}/${pending.totalHumans})</div>`;
  }
  return `<button class="btn btn-amber" id="btn-rematch" style="max-width:300px;margin:24px auto 0">Play Again</button>`;
}

export function renderGameOver(): string {
  if (!state.gameOverStats || !state.game) return '';

  const stats = state.gameOverStats;
  const winner = stats.winnerId ? state.game.players[stats.winnerId] : null;
  const teamsEnabled = state.game.teamsEnabled;
  const teams = state.game.teams;
  const winnerTeamId = stats.winnerTeamId;

  const { text: winnerText, subtext: winnerSubtext, winClass } = getWinnerBanner(teamsEnabled, winnerTeamId, winner);
  const highlightsHtml = stats.highlights.map(h => `<p class="highlight">${esc(h)}</p>`).join('');

  // Stats table — sorted by turn order
  const players = state.game ? Object.values(state.game.players) : [];
  const turnOrder = state.game?.turnOrder ?? [];
  if (turnOrder.length > 0) {
    players.sort((a, b) => turnOrder.indexOf(a.id) - turnOrder.indexOf(b.id));
  }
  const statsRows = players.map(p => renderStatsRow(p, stats, teamsEnabled, teams, winnerTeamId)).join('');

  return `
    <div class="screen">
      <div class="game-over">
        <h1 class="${winClass}">${winnerText}</h1>
        <p style="color:var(--text-secondary);margin-bottom:16px">${winnerSubtext}</p>
        ${highlightsHtml}
        <div class="grid-panel" style="margin-bottom:16px">${renderGrid('battle')}</div>
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
        ${renderPostGameButtons()}
        <button class="btn btn-secondary" id="btn-new-game" style="max-width:300px;margin:12px auto 0">${state.game?.mode === 'private' ? 'Leave Game' : 'New Game'}</button>
      </div>
    </div>`;
}
