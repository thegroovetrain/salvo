import {
  type Game, type Player, type Ship, type ShipPlacement, type AiDifficulty,
  isShipSunk, isPlayerAlive, playerShotCount,
  SHIP_LENGTHS, GRID_SIZE, ROWS,
} from '@salvo/shared';
import { getTeammate } from './game.js';

// ============================================================
// AI Opponent — Classic Game AI (not LLM)
//
// STRATEGY TIERS:
//   Easy       — random targeting, CAN hit own ships
//   Medium     — hunt/target, avoids own ships
//   Hard       — checkerboard hunt, per-player tracking, probability
//   Impossible — reads all ship positions (cheats), optimal targeting
// ============================================================

// ============================================================
// Shared Helpers
// ============================================================

function coordToId(row: number, col: number): string {
  return `${ROWS[row]}${col + 1}`;
}

function parseCoord(coord: string): { row: number; col: number } {
  return { row: ROWS.indexOf(coord[0]), col: parseInt(coord.slice(1), 10) - 1 };
}

function allCoords(): string[] {
  const coords: string[] = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      coords.push(coordToId(r, c));
    }
  }
  return coords;
}

function getUnshotCoords(game: Game): string[] {
  return allCoords().filter(c => !game.shots.has(c));
}

function getOwnShipCells(game: Game, botId: string): Set<string> {
  const bot = game.players.get(botId);
  if (!bot) return new Set();
  return new Set(bot.ships.flatMap(s => s.cells));
}

function getTeammateShipCells(game: Game, botId: string): Set<string> {
  if (!game.teamsEnabled) return new Set();
  const teammateId = getTeammate(game, botId);
  if (!teammateId) return new Set();
  const teammate = game.players.get(teammateId);
  if (!teammate) return new Set();
  return new Set(teammate.ships.flatMap(s => s.cells));
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffled<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function getAdjacentCoords(coord: string): string[] {
  const { row, col } = parseCoord(coord);
  const adj: string[] = [];
  if (row > 0) adj.push(coordToId(row - 1, col));
  if (row < GRID_SIZE - 1) adj.push(coordToId(row + 1, col));
  if (col > 0) adj.push(coordToId(row, col - 1));
  if (col < GRID_SIZE - 1) adj.push(coordToId(row, col + 1));
  return adj;
}

/** Find all hit cells that belong to ships that are NOT yet sunk */
function getActiveHits(game: Game, excludeBotId: string): string[] {
  const hits: string[] = [];
  for (const [pid, player] of game.players) {
    if (pid === excludeBotId) continue;
    for (const ship of player.ships) {
      if (!isShipSunk(ship)) {
        for (const cell of ship.hits) {
          hits.push(cell);
        }
      }
    }
  }
  return hits;
}

// ============================================================
// Ship Placement
// ============================================================

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

export function generatePlacement(difficulty: AiDifficulty): ShipPlacement[] {
  const occupied = new Set<string>();
  const ships: ShipPlacement[] = [];
  const lengths = [...SHIP_LENGTHS].sort((a, b) => b - a);

  for (const length of lengths) {
    let placed = false;
    for (let attempt = 0; attempt < 200; attempt++) {
      const horizontal = Math.random() < 0.5;

      let row: number, col: number;
      if (difficulty === 'hard' || difficulty === 'impossible') {
        // Strategic: prefer interior cells, avoid corners/edges
        row = 1 + Math.floor(Math.random() * (GRID_SIZE - 2));
        col = 1 + Math.floor(Math.random() * (GRID_SIZE - 2));
      } else {
        row = Math.floor(Math.random() * GRID_SIZE);
        col = Math.floor(Math.random() * GRID_SIZE);
      }

      const maxRow = horizontal ? GRID_SIZE : GRID_SIZE - length;
      const maxCol = horizontal ? GRID_SIZE - length : GRID_SIZE;
      if (row > maxRow || col > maxCol) continue;

      const cells = getShipCells(row, col, length, horizontal);
      if (!cells) continue;
      if (cells.some(c => occupied.has(c))) continue;

      cells.forEach(c => occupied.add(c));
      ships.push({ length, cells });
      placed = true;
      break;
    }
    if (!placed) {
      // Fallback: retry entire placement
      return generatePlacement(difficulty);
    }
  }

  return ships;
}

// ============================================================
// Target Selection — Dispatches to per-tier strategy
// ============================================================

export function chooseSalvo(game: Game, botId: string, difficulty: AiDifficulty): string[] {
  const bot = game.players.get(botId);
  if (!bot) return [];
  const shotCount = playerShotCount(bot);
  if (shotCount === 0) return [];

  const unshot = getUnshotCoords(game);
  if (unshot.length === 0) return [];

  let targets: string[];
  switch (difficulty) {
    case 'easy':       targets = chooseEasy(game, botId, unshot, shotCount); break;
    case 'medium':     targets = chooseMedium(game, botId, unshot, shotCount); break;
    case 'hard':       targets = chooseHard(game, botId, unshot, shotCount); break;
    case 'impossible': targets = chooseImpossible(game, botId, unshot, shotCount); break;
  }

  // Safety: ensure we never return more targets than available unshot cells
  return targets.slice(0, Math.min(shotCount, unshot.length));
}

// ============================================================
// EASY — Random Randy
// Fires at random cells. CAN hit own ships. No tracking.
// ============================================================

function chooseEasy(game: Game, _botId: string, unshot: string[], count: number): string[] {
  const shuffledCells = shuffled(unshot);
  return shuffledCells.slice(0, count);
}

// ============================================================
// MEDIUM — Methodical Mike
// Hunt/target pattern. Avoids own ships.
// ============================================================

function chooseMedium(game: Game, botId: string, unshot: string[], count: number): string[] {
  const ownCells = getOwnShipCells(game, botId);
  const teammateCells = getTeammateShipCells(game, botId);
  const safeUnshot = unshot.filter(c => !ownCells.has(c) && !teammateCells.has(c));
  const pool = safeUnshot.length > 0 ? safeUnshot : unshot; // fallback if all safe cells shot

  const targets: string[] = [];
  const used = new Set<string>();

  // TARGET mode: look for adjacent cells to active hits
  const activeHits = getActiveHits(game, botId);
  for (const hit of shuffled(activeHits)) {
    if (targets.length >= count) break;
    const adj = getAdjacentCoords(hit).filter(c => pool.includes(c) && !used.has(c));
    for (const a of shuffled(adj)) {
      if (targets.length >= count) break;
      targets.push(a);
      used.add(a);
    }
  }

  // HUNT mode: fill remaining with random
  if (targets.length < count) {
    const remaining = pool.filter(c => !used.has(c));
    for (const c of shuffled(remaining)) {
      if (targets.length >= count) break;
      targets.push(c);
      used.add(c);
    }
  }

  return targets;
}

// ============================================================
// HARD — Strategic Sara
// Checkerboard hunting, per-player tracking, probability-aware.
// ============================================================

function chooseHard(game: Game, botId: string, unshot: string[], count: number): string[] {
  const ownCells = getOwnShipCells(game, botId);
  const teammateCells = getTeammateShipCells(game, botId);
  const safeUnshot = unshot.filter(c => !ownCells.has(c) && !teammateCells.has(c));
  const pool = safeUnshot.length > 0 ? safeUnshot : unshot;

  const targets: string[] = [];
  const used = new Set<string>();

  // TARGET mode: probe adjacent to active hits (same as medium but smarter)
  const activeHits = getActiveHits(game, botId);
  if (activeHits.length > 0) {
    // Try to extend in the direction of existing hits (if 2+ hits are collinear)
    for (const hit of shuffled(activeHits)) {
      if (targets.length >= count) break;
      const adj = getAdjacentCoords(hit).filter(c => pool.includes(c) && !used.has(c));
      for (const a of shuffled(adj)) {
        if (targets.length >= count) break;
        targets.push(a);
        used.add(a);
      }
    }
  }

  // HUNT mode: checkerboard pattern (every other cell, like a chess board)
  // This is optimal for finding ships — no ship can hide between checkerboard cells
  if (targets.length < count) {
    const checkerboard = pool.filter(c => {
      const { row, col } = parseCoord(c);
      return (row + col) % 2 === 0 && !used.has(c);
    });

    // If checkerboard cells exhausted, fall back to all remaining
    const huntPool = checkerboard.length > 0 ? checkerboard : pool.filter(c => !used.has(c));

    for (const c of shuffled(huntPool)) {
      if (targets.length >= count) break;
      targets.push(c);
      used.add(c);
    }
  }

  return targets;
}

// ============================================================
// IMPOSSIBLE — Oracle
// Knows where all ships are. Targets optimally. Still avoids own ships.
// ============================================================

function chooseImpossible(game: Game, botId: string, unshot: string[], count: number): string[] {
  const ownCells = getOwnShipCells(game, botId);
  const teammateCells = getTeammateShipCells(game, botId);

  // Build a map of unshot enemy ship cells, scored by how many players they'd hit
  const cellScores = new Map<string, number>();
  for (const [pid, player] of game.players) {
    if (pid === botId) continue;
    if (!isPlayerAlive(player)) continue;
    for (const ship of player.ships) {
      if (isShipSunk(ship)) continue;
      for (const cell of ship.cells) {
        if (game.shots.has(cell)) continue;    // already shot
        if (ownCells.has(cell)) continue;      // avoid own ships
        if (teammateCells.has(cell)) continue;  // avoid teammate ships
        cellScores.set(cell, (cellScores.get(cell) ?? 0) + 1);
      }
    }
  }

  // Sort by score (hit most players first), shuffle first for random tiebreaking
  const scored = shuffled([...cellScores.entries()])
    .sort((a, b) => b[1] - a[1]);

  const targets = scored.slice(0, count).map(([coord]) => coord);

  // If we don't have enough scored targets (unlikely), fill with random safe unshot
  if (targets.length < count) {
    const used = new Set(targets);
    const remaining = unshot.filter(c => !used.has(c) && !ownCells.has(c) && !teammateCells.has(c));
    for (const c of shuffled(remaining)) {
      if (targets.length >= count) break;
      targets.push(c);
    }
  }

  return targets;
}

// ============================================================
// Firing Delay — variable per difficulty (milliseconds)
// ============================================================

export function getBotDelay(difficulty: AiDifficulty): number {
  switch (difficulty) {
    case 'easy':       return 500 + Math.random() * 500;   // 0.5-1s
    case 'medium':     return 800 + Math.random() * 700;   // 0.8-1.5s
    case 'hard':       return 1000 + Math.random() * 1000; // 1-2s
    case 'impossible': return 1200 + Math.random() * 800;  // 1.2-2s
  }
}
