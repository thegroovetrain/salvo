import {
  type Game, type Player, type Ship, type ShipPlacement, type AiDifficulty,
  isShipSunk, isPlayerAlive, playerShotCount, getTeammates,
  SHIP_LENGTHS,
} from '@salvo/shared';
import {
  allHexes, parseHex, hexToString, hexNeighborsInBounds, isValidHex,
  hexLinear, hexDistance, HEX_DIRECTIONS,
} from '@salvo/shared/hex';

// ============================================================
// AI Opponent — Classic Game AI (not LLM)
//
// STRATEGY TIERS:
//   Easy       — random targeting, CAN hit own ships
//   Medium     — hunt/target, avoids own ships
//   Hard       — hex 3-coloring hunt, per-player tracking
//   Impossible — reads all ship positions (cheats), optimal targeting
// ============================================================

// ============================================================
// Shared Helpers
// ============================================================

function getUnshotCoords(game: Game): string[] {
  return allHexes(game.rings).filter(c => !game.shots.has(c) && !game.islands.has(c));
}

function getOwnShipCells(game: Game, botId: string): Set<string> {
  const bot = game.players.get(botId);
  if (!bot) return new Set();
  return new Set(bot.ships.flatMap(s => s.cells));
}

function getTeammateShipCells(game: Game, botId: string): Set<string> {
  if (!game.teamsEnabled) return new Set();
  const cells = new Set<string>();
  for (const teammateId of getTeammates(game, botId)) {
    const teammate = game.players.get(teammateId);
    if (teammate) {
      for (const ship of teammate.ships) {
        for (const cell of ship.cells) {
          cells.add(cell);
        }
      }
    }
  }
  return cells;
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

function getAdjacentCoords(coord: string, rings: number): string[] {
  const h = parseHex(coord);
  if (!h) return [];
  return hexNeighborsInBounds(h.q, h.r, rings).map(n => hexToString(n.q, n.r));
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

export function generatePlacement(difficulty: AiDifficulty, rings: number = 5, islands: Set<string> = new Set()): ShipPlacement[] {
  const occupied = new Set<string>();
  const ships: ShipPlacement[] = [];
  const lengths = [...SHIP_LENGTHS].sort((a, b) => b - a);

  const allValidHexes = allHexes(rings).filter(c => !islands.has(c));

  for (const length of lengths) {
    let placed = false;
    for (let attempt = 0; attempt < 200; attempt++) {
      // Pick a random anchor hex
      const anchor = pickRandom(allValidHexes);
      const h = parseHex(anchor)!;

      // For hard/impossible: prefer inner rings (closer to center)
      if (difficulty === 'hard' || difficulty === 'impossible') {
        const dist = hexDistance({ q: 0, r: 0 }, h);
        if (dist >= rings - 1 && Math.random() < 0.7) continue; // bias away from outer ring
      }

      // Pick a random direction (0-5)
      const dir = Math.floor(Math.random() * 6);

      const cells = hexLinear(h.q, h.r, dir, length, rings);
      if (!cells) continue;
      if (cells.some(c => occupied.has(c) || islands.has(c))) continue;

      cells.forEach(c => occupied.add(c));
      ships.push({ length, cells });
      placed = true;
      break;
    }
    if (!placed) {
      // Fallback: retry entire placement
      return generatePlacement(difficulty, rings, islands);
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

  return targets.slice(0, Math.min(shotCount, unshot.length));
}

// ============================================================
// EASY — Random Randy
// ============================================================

function chooseEasy(game: Game, _botId: string, unshot: string[], count: number): string[] {
  return shuffled(unshot).slice(0, count);
}

// ============================================================
// MEDIUM — Methodical Mike
// Hunt/target pattern. Avoids own ships.
// ============================================================

function chooseMedium(game: Game, botId: string, unshot: string[], count: number): string[] {
  const ownCells = getOwnShipCells(game, botId);
  const teammateCells = getTeammateShipCells(game, botId);
  const safeUnshot = unshot.filter(c => !ownCells.has(c) && !teammateCells.has(c));
  const pool = safeUnshot.length > 0 ? safeUnshot : unshot;

  const targets: string[] = [];
  const used = new Set<string>();

  // TARGET: look for adjacent cells to active hits
  const activeHits = getActiveHits(game, botId);
  for (const hit of shuffled(activeHits)) {
    if (targets.length >= count) break;
    const adj = getAdjacentCoords(hit, game.rings).filter(c => pool.includes(c) && !used.has(c));
    for (const a of shuffled(adj)) {
      if (targets.length >= count) break;
      targets.push(a);
      used.add(a);
    }
  }

  // HUNT: fill remaining with random
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
// Hex 3-coloring hunt, per-player tracking.
// ============================================================

function chooseHard(game: Game, botId: string, unshot: string[], count: number): string[] {
  const ownCells = getOwnShipCells(game, botId);
  const teammateCells = getTeammateShipCells(game, botId);
  const safeUnshot = unshot.filter(c => !ownCells.has(c) && !teammateCells.has(c));
  const pool = safeUnshot.length > 0 ? safeUnshot : unshot;

  const targets: string[] = [];
  const used = new Set<string>();

  // TARGET: probe adjacent to active hits
  const activeHits = getActiveHits(game, botId);
  if (activeHits.length > 0) {
    for (const hit of shuffled(activeHits)) {
      if (targets.length >= count) break;
      const adj = getAdjacentCoords(hit, game.rings).filter(c => pool.includes(c) && !used.has(c));
      for (const a of shuffled(adj)) {
        if (targets.length >= count) break;
        targets.push(a);
        used.add(a);
      }
    }
  }

  // HUNT: hex 3-coloring — shoot one color group to guarantee hitting any ship of length >= 2
  // Color = ((q - r) % 3 + 3) % 3
  if (targets.length < count) {
    const coloredCells = pool.filter(c => {
      const h = parseHex(c);
      if (!h) return false;
      return ((h.q - h.r) % 3 + 3) % 3 === 0 && !used.has(c);
    });

    const huntPool = coloredCells.length > 0 ? coloredCells : pool.filter(c => !used.has(c));

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
// ============================================================

function chooseImpossible(game: Game, botId: string, unshot: string[], count: number): string[] {
  const ownCells = getOwnShipCells(game, botId);
  const teammateCells = getTeammateShipCells(game, botId);

  const cellScores = new Map<string, number>();
  for (const [pid, player] of game.players) {
    if (pid === botId) continue;
    if (!isPlayerAlive(player)) continue;
    for (const ship of player.ships) {
      if (isShipSunk(ship)) continue;
      for (const cell of ship.cells) {
        if (game.shots.has(cell)) continue;
        if (ownCells.has(cell)) continue;
        if (teammateCells.has(cell)) continue;
        cellScores.set(cell, (cellScores.get(cell) ?? 0) + 1);
      }
    }
  }

  const scored = shuffled([...cellScores.entries()])
    .sort((a, b) => b[1] - a[1]);

  const targets = scored.slice(0, count).map(([coord]) => coord);

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
// Firing Delay
// ============================================================

export function getBotDelay(difficulty: AiDifficulty): number {
  switch (difficulty) {
    case 'easy':       return 500 + Math.random() * 500;
    case 'medium':     return 800 + Math.random() * 700;
    case 'hard':       return 1000 + Math.random() * 1000;
    case 'impossible': return 1200 + Math.random() * 800;
  }
}
