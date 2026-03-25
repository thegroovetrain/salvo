import { state } from '../state.js';
import { getTeammateId, getHitCountAtCoord } from '../helpers/team.js';
import { renderHexGridSVG } from '../hexGrid.js';
import type { ShipHullData } from '../hexGrid.js';
import type { WireGame, WirePlayer, PlayerColor } from '@salvo/shared';

// --- Ship hull collectors (used by renderGrid) ---

function collectOwnShipHulls(me: WirePlayer | null, color: PlayerColor | undefined): ShipHullData[] {
  if (!me) return [];
  return me.ships
    .filter(ship => ship.cells.length > 0)
    .map(ship => ({ cells: ship.cells, sunk: ship.sunk, color }));
}

function collectTeammateShipHulls(game: WireGame): ShipHullData[] {
  if (!game.teamsEnabled || !state.playerId) return [];
  const hulls: ShipHullData[] = [];
  const myTeam = game.teams[state.playerId];
  for (const [pid, player] of Object.entries(game.players)) {
    if (pid === state.playerId || game.teams[pid] !== myTeam) continue;
    for (const ship of player.ships) {
      if (ship.cells.length > 0) {
        hulls.push({ cells: ship.cells, sunk: ship.sunk, teammate: true, color: player.color });
      }
    }
  }
  return hulls;
}

function collectPlacementHulls(color: PlayerColor | undefined): ShipHullData[] {
  const hulls: ShipHullData[] = [];
  for (const ship of state.placedShips) {
    if (ship.cells.length > 0) {
      hulls.push({ cells: ship.cells, sunk: false, color });
    }
  }
  if (state.ghostCells.length > 0) {
    hulls.push({ cells: state.ghostCells, sunk: false, ghost: true, ghostValid: state.ghostValid, color });
  }
  for (const tmShip of state.teammateGhostShips) {
    if (tmShip.cells.length > 0) {
      hulls.push({ cells: tmShip.cells, sunk: false, teammate: true, ghost: true, ghostValid: true });
    }
  }
  return hulls;
}

function isOwnOrTeammate(game: WireGame, pid: string): boolean {
  if (pid === state.playerId) return true;
  if (game.teamsEnabled && game.teams[pid] === game.teams[state.playerId ?? '']) return true;
  return false;
}

function collectOtherPlayerHulls(game: WireGame, sunkOnly: boolean): ShipHullData[] {
  const hulls: ShipHullData[] = [];
  for (const [pid, player] of Object.entries(game.players)) {
    if (isOwnOrTeammate(game, pid)) continue;
    for (const ship of player.ships) {
      if (ship.cells.length === 0) continue;
      if (sunkOnly && !ship.sunk) continue;
      hulls.push({ cells: ship.cells, sunk: ship.sunk, color: player.color });
    }
  }
  return hulls;
}

export function renderGrid(mode: 'placement' | 'battle'): string {
  const game = state.game;
  if (!game) return '';
  const rings = game.rings;
  const islands = new Set(game.islands);
  const hexSize = 24;

  const myColor = state.playerId ? game.players[state.playerId]?.color : undefined;
  const me = state.playerId ? game.players[state.playerId] : null;

  const shipHulls: ShipHullData[] = [
    ...collectOwnShipHulls(me, myColor),
    ...collectTeammateShipHulls(game),
    ...(mode === 'placement' ? collectPlacementHulls(myColor) : []),
    ...(game.phase === 'finished' ? collectOtherPlayerHulls(game, false) : []),
    ...(game.phase !== 'finished' && mode === 'battle' ? collectOtherPlayerHulls(game, true) : []),
  ];

  return renderHexGridSVG(rings, hexSize, islands, (coord) => getCellState(coord, mode), mode, shipHulls);
}

// --- Cell state for placement mode ---

function getCellStatePlacement(coord: string): { cssClass: string; symbol: string; badgeText?: string } {
  if (state.ghostCells.includes(coord)) {
    return state.ghostValid
      ? { cssClass: 'cell-ghost', symbol: '' }
      : { cssClass: 'cell-invalid', symbol: '' };
  }
  for (const ship of state.placedShips) {
    if (ship.cells.includes(coord)) {
      return { cssClass: 'cell-ship', symbol: '' };
    }
  }
  for (const ship of state.teammateGhostShips) {
    if (ship.cells.includes(coord)) {
      return { cssClass: 'cell-teammate-ghost', symbol: '' };
    }
  }
  return { cssClass: 'cell-empty', symbol: '' };
}

export function getCellState(coord: string, mode: 'placement' | 'battle'): { cssClass: string; symbol: string; badgeText?: string } {
  if (mode === 'placement') return getCellStatePlacement(coord);
  return getCellStateBattle(coord);
}

// --- Battle cell state helpers ---

export function wasSelfHitAtCoord(coord: string): boolean {
  for (const entry of state.shotLog) {
    for (const shot of entry.shots) {
      if (shot.coord === coord && entry.shooterId === state.playerId) {
        return true;
      }
    }
  }
  return false;
}

function wasHitInGamePlayers(game: WireGame, coord: string): boolean {
  for (const player of Object.values(game.players)) {
    if (player.id === state.playerId) continue;
    for (const ship of player.ships) {
      if (ship.hits.includes(coord)) return true;
    }
  }
  return false;
}

function wasHitInShotLog(coord: string): boolean {
  for (const entry of state.shotLog) {
    for (const shot of entry.shots) {
      if (shot.coord === coord && shot.hits.length > 0) return true;
    }
  }
  return false;
}

function getShotCellState(
  coord: string,
  myShip: { hits: string[] } | undefined,
  teammateShip: { hits: string[] } | undefined,
  game: WireGame,
): { cssClass: string; symbol: string; badgeText?: string } {
  const hitCount = getHitCountAtCoord(coord);
  const badgeText = hitCount > 1 ? `\u00D7${hitCount}` : undefined;

  if (myShip && myShip.hits.includes(coord)) {
    return wasSelfHitAtCoord(coord)
      ? { cssClass: 'cell-ff', symbol: '\u26A0', badgeText }
      : { cssClass: 'cell-sunk', symbol: '\u00D7', badgeText };
  }

  if (teammateShip && teammateShip.hits.includes(coord)) {
    return { cssClass: 'cell-sunk', symbol: '\u00D7', badgeText };
  }

  const wasHit = wasHitInGamePlayers(game, coord) || wasHitInShotLog(coord);
  if (wasHit) return { cssClass: 'cell-hit', symbol: '\u00D7', badgeText };
  return { cssClass: 'cell-miss', symbol: '\u2022' };
}

export function getCellStateBattle(coord: string): { cssClass: string; symbol: string; badgeText?: string } {
  const game = state.game;
  if (!game || !state.playerId) return { cssClass: 'cell-empty', symbol: '' };

  if (state.selectedTargets.includes(coord)) {
    return { cssClass: 'cell-selected', symbol: '\u25CE' };
  }

  const myPlayer = game.players[state.playerId];
  const myShip = myPlayer?.ships.find(s => s.cells.includes(coord));
  const teammateId = getTeammateId();
  const teammatePlayer = teammateId ? game.players[teammateId] : null;
  const teammateShip = teammatePlayer?.ships.find(s => s.cells.includes(coord));

  if (game.shots.includes(coord)) {
    return getShotCellState(coord, myShip, teammateShip, game);
  }

  if (myShip) return { cssClass: 'cell-ship', symbol: '' };
  if (teammateShip) return { cssClass: 'cell-teammate-ship', symbol: '' };
  return { cssClass: 'cell-empty', symbol: '' };
}
