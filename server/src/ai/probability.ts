import type { Game, Ship } from '@salvo/shared';
import { isShipSunk, isPlayerAlive } from '@salvo/shared';
import { allHexes, hexLinear, parseHex } from '@salvo/shared/hex';

// ============================================================
// Probability Density Map — Hard Tier
//
// For each alive enemy, for each unsunk ship, enumerate all valid
// placements on the hex grid. Count cell coverage, normalize.
// Returns combined heat map across all enemies.
//
// Complexity: O(enemies × ships × hexes × 6 directions) — fast
// ============================================================

function isValidPlacement(cells: string[], game: Game, ship: Ship): boolean {
  return cells.every(c => {
    if (game.islands.has(c)) return false;
    if (game.shots.has(c)) return ship.hits.has(c);
    return true;
  });
}

function countPlacementsForShip(
  ship: Ship, game: Game, validHexes: string[],
  heatMap: Map<string, number>,
): number {
  let count = 0;
  for (const startCoord of validHexes) {
    const start = parseHex(startCoord);
    if (!start) continue;
    for (let dir = 0; dir < 6; dir++) {
      const cells = hexLinear(start.q, start.r, dir, ship.length, game.rings);
      if (!cells || !isValidPlacement(cells, game, ship)) continue;
      count++;
      for (const cell of cells) {
        if (!game.shots.has(cell)) {
          heatMap.set(cell, (heatMap.get(cell) ?? 0) + 1);
        }
      }
    }
  }
  return count;
}

export function probabilityMap(game: Game, botId: string): Map<string, number> {
  const heatMap = new Map<string, number>();
  let totalPlacements = 0;
  const validHexes = allHexes(game.rings);

  for (const [pid, player] of game.players) {
    if (pid === botId || !isPlayerAlive(player)) continue;
    if (game.teamsEnabled && game.teams.get(pid) === game.teams.get(botId)) continue;

    for (const ship of player.ships) {
      if (isShipSunk(ship)) continue;
      totalPlacements += countPlacementsForShip(ship, game, validHexes, heatMap);
    }
  }

  if (totalPlacements > 0) {
    for (const [cell, count] of heatMap) {
      heatMap.set(cell, count / totalPlacements);
    }
  }

  return heatMap;
}
