import type { Game } from '@salvo/shared';
import { getTeammates } from '@salvo/shared';
import { allHexes, parseHex, hexNeighborsInBounds, hexToString } from '@salvo/shared/hex';

// ============================================================
// Shared AI Helpers
// ============================================================

/** Simple xorshift128 PRNG — deterministic when seeded, fast */
export type RNG = () => number;

export function createRNG(seed?: number): RNG {
  if (seed === undefined) return Math.random;
  // xorshift128 state
  let s0 = seed | 0 || 1;
  let s1 = (seed * 2654435761) | 0 || 1;
  let s2 = (seed * 2246822519) | 0 || 1;
  let s3 = (seed * 3266489917) | 0 || 1;
  return () => {
    const t = s3;
    let r = s0;
    s3 = s2; s2 = s1; s1 = r;
    r ^= r << 11; r ^= r >>> 8;
    s0 = r ^ t ^ (t >>> 19);
    return (s0 >>> 0) / 4294967296;
  };
}

export function pickRandom<T>(arr: T[], rng: RNG = Math.random): T {
  return arr[Math.floor(rng() * arr.length)];
}

export function shuffled<T>(arr: T[], rng: RNG = Math.random): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function getOwnShipCells(game: Game, botId: string): Set<string> {
  const bot = game.players.get(botId);
  if (!bot) return new Set();
  return new Set(bot.ships.flatMap(s => s.cells));
}

export function getTeammateShipCells(game: Game, botId: string): Set<string> {
  if (!game.teamsEnabled) return new Set();
  const cells = new Set<string>();
  for (const teammateId of getTeammates(game, botId)) {
    const teammate = game.players.get(teammateId);
    if (teammate) {
      for (const ship of teammate.ships) {
        for (const cell of ship.cells) cells.add(cell);
      }
    }
  }
  return cells;
}

export function getAdjacentCoords(coord: string, rings: number): string[] {
  const h = parseHex(coord);
  if (!h) return [];
  return hexNeighborsInBounds(h.q, h.r, rings).map(n => hexToString(n.q, n.r));
}

/** Find all hit cells on enemy ships that are NOT yet sunk */
export function getActiveHits(game: Game, excludeBotId: string): string[] {
  const hits: string[] = [];
  for (const [pid, player] of game.players) {
    if (pid === excludeBotId) continue;
    for (const ship of player.ships) {
      if (ship.cells.some(c => ship.hits.has(c)) && ship.hits.size < ship.cells.length) {
        for (const cell of ship.hits) hits.push(cell);
      }
    }
  }
  return hits;
}

/** Get all unshot, non-island coordinates on the grid */
export function getUnshotCoords(game: Game): string[] {
  return allHexes(game.rings).filter(c => !game.shots.has(c) && !game.islands.has(c));
}
