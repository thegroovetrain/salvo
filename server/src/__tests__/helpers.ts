/**
 * Shared test helpers for Salvo hex grid tests.
 * All coordinate strings use axial "q,r" format.
 */

import {
  createGame, addPlayer, startGame, placeShips, allShipsPlaced, beginPlaying,
} from '../game.js';
import type { Game, ShipPlacement, TimerConfig, GameMode } from '@salvo/shared';
import { hexToString } from '@salvo/shared/hex';

const DEFAULT_TIMER: TimerConfig = { enabled: false, seconds: 60 };

/**
 * Create a game with N players. Default 5 rings for ≤3 players, 6 rings for 4+.
 */
export function makeGame(
  playerCount: number,
  options: {
    rings?: number;
    teamsEnabled?: boolean;
    mode?: GameMode;
  } = {},
): { game: Game; playerIds: string[] } {
  const defaultRings = playerCount <= 3 ? 5 : 6;
  const { rings = defaultRings, teamsEnabled = false, mode = 'private' } = options;
  const game = createGame('p1', 'Player 1', DEFAULT_TIMER, mode, teamsEnabled, rings);
  const playerIds = ['p1'];

  for (let i = 2; i <= playerCount; i++) {
    const id = `p${i}`;
    addPlayer(game, id, `Player ${i}`);
    playerIds.push(id);
  }

  return { game, playerIds };
}

/**
 * Create a team game with the given team configuration.
 */
export function makeTeamGame(
  teamConfig: string[],
  options: { rings?: number; mode?: GameMode } = {},
): { game: Game; playerIds: string[] } {
  const { rings, mode } = options;
  const { game, playerIds } = makeGame(teamConfig.length, { rings, teamsEnabled: true, mode });

  for (let i = 0; i < teamConfig.length; i++) {
    game.teams.set(playerIds[i], teamConfig[i]);
  }

  return { game, playerIds };
}

/**
 * Non-overlapping hex ship placements for player at given index.
 * Each player's 4 ships (1+2+3+4 = 10 cells) are placed along the E direction
 * on a unique r-row.
 *
 * 5-ring grid: supports players 0-2 (r=0, r=1, r=-1)
 * 6-ring grid: supports players 0-5 (r=0, r=1, r=-1, r=2, r=-2, r=3)
 */
export function hexPlacements(playerIndex: number): ShipPlacement[] {
  // Row assignments. On 5-ring grid, rows with 10+ valid q slots:
  //   r=0:  q ∈ [-5, 5]  = 11 slots, startQ = -4
  //   r=1:  q ∈ [-5, 4]  = 10 slots, startQ = -5
  //   r=-1: q ∈ [-4, 5]  = 10 slots, startQ = -4
  // On 6-ring grid (adds):
  //   r=2:  q ∈ [-6, 4]  = 11 slots, startQ = -5
  //   r=-2: q ∈ [-4, 6]  = 11 slots, startQ = -4
  //   r=3:  q ∈ [-6, 3]  = 10 slots, startQ = -6
  const rows: { r: number; startQ: number }[] = [
    { r: 0, startQ: -4 },
    { r: 1, startQ: -5 },
    { r: -1, startQ: -4 },
    { r: 2, startQ: -5 },
    { r: -2, startQ: -4 },
    { r: 3, startQ: -6 },
  ];

  const { r, startQ } = rows[playerIndex % rows.length];
  return makeLinearShips(r, startQ);
}

function makeLinearShips(r: number, startQ: number): ShipPlacement[] {
  const cell = (i: number) => hexToString(startQ + i, r);
  return [
    { length: 1, cells: [cell(0)] },
    { length: 2, cells: [cell(1), cell(2)] },
    { length: 3, cells: [cell(3), cell(4), cell(5)] },
    { length: 4, cells: [cell(6), cell(7), cell(8), cell(9)] },
  ];
}

/** Get all ship cells for a player at the given index. */
export function allCellsForPlayer(playerIndex: number): string[] {
  return hexPlacements(playerIndex).flatMap(p => p.cells);
}

/**
 * Place ships for all players and begin playing.
 * Clears islands so predetermined test placements don't conflict.
 */
export function setupBattle(game: Game, playerIds: string[]): void {
  startGame(game);
  game.islands = new Set();
  for (let i = 0; i < playerIds.length; i++) {
    placeShips(game, playerIds[i], hexPlacements(i));
  }
  if (allShipsPlaced(game)) {
    beginPlaying(game);
  }
}

/** Default placements (player 0 layout). */
export function defaultPlacements(): ShipPlacement[] {
  return hexPlacements(0);
}
