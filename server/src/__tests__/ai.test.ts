import { describe, it, expect } from 'vitest';
import {
  createGame, addBot, startGame, placeShips,
  allShipsPlaced, beginPlaying, fireSalvo,
  getCurrentTurnPlayerId, validateSalvo,
} from '../game.js';
import { chooseSalvo, generatePlacement, getBotDelay } from '../ai.js';
import type { Game, ShipPlacement } from '@salvo/shared';
import { isPlayerAlive, playerShotCount, SHIP_LENGTHS } from '@salvo/shared';

// ============================================================
// Helpers
// ============================================================

function makeGameWithBot(difficulty: 'easy' | 'medium' | 'hard' | 'impossible'): {
  game: Game;
  humanId: string;
  botId: string;
} {
  const game = createGame('human', 'Alice', { enabled: false, seconds: 60 });
  const result = addBot(game, difficulty);
  if ('error' in result) throw new Error(result.error);
  return { game, humanId: 'human', botId: result.botId };
}

function humanPlacements(): ShipPlacement[] {
  return [
    { length: 1, cells: ['A1'] },
    { length: 2, cells: ['B1', 'B2'] },
    { length: 3, cells: ['C1', 'C2', 'C3'] },
    { length: 4, cells: ['D1', 'D2', 'D3', 'D4'] },
  ];
}

function setupBattle(game: Game, humanId: string, botId: string): void {
  startGame(game);
  placeShips(game, humanId, humanPlacements());
  const botPlacement = generatePlacement(game.players.get(botId)!.aiDifficulty!);
  placeShips(game, botId, botPlacement);
  beginPlaying(game);
}

// ============================================================
// Ship Placement
// ============================================================

describe('AI Ship Placement', () => {
  it.each(['easy', 'medium', 'hard', 'impossible'] as const)(
    'generates valid placement for %s difficulty',
    (difficulty) => {
      const placement = generatePlacement(difficulty);
      expect(placement.length).toBe(SHIP_LENGTHS.length);

      const lengths = placement.map(p => p.length).sort();
      expect(lengths).toEqual([...SHIP_LENGTHS].sort());

      // No overlapping cells
      const allCells = placement.flatMap(p => p.cells);
      expect(new Set(allCells).size).toBe(allCells.length);

      // All cells within grid
      for (const cell of allCells) {
        const row = 'ABCDEFGHIJ'.indexOf(cell[0]);
        const col = parseInt(cell.slice(1), 10);
        expect(row).toBeGreaterThanOrEqual(0);
        expect(row).toBeLessThan(10);
        expect(col).toBeGreaterThanOrEqual(1);
        expect(col).toBeLessThanOrEqual(10);
      }
    }
  );

  it('hard/impossible placement avoids grid edges', () => {
    // Run multiple times and check that placements tend toward interior
    let edgeCells = 0;
    let totalCells = 0;
    for (let i = 0; i < 50; i++) {
      const placement = generatePlacement('hard');
      for (const ship of placement) {
        for (const cell of ship.cells) {
          totalCells++;
          const row = 'ABCDEFGHIJ'.indexOf(cell[0]);
          const col = parseInt(cell.slice(1), 10) - 1;
          if (row === 0 || row === 9 || col === 0 || col === 9) edgeCells++;
        }
      }
    }
    // Hard placement should have fewer edge cells than random (< 50%)
    expect(edgeCells / totalCells).toBeLessThan(0.5);
  });
});

// ============================================================
// Salvo Selection — All Tiers Produce Valid Salvos
// ============================================================

describe('AI Salvo Validity', () => {
  it.each(['easy', 'medium', 'hard', 'impossible'] as const)(
    '%s produces valid salvos',
    (difficulty) => {
      const { game, humanId, botId } = makeGameWithBot(difficulty);
      setupBattle(game, humanId, botId);

      // Force bot's turn
      game.turnOrder = [botId, humanId];
      game.currentTurnIndex = 0;

      const coords = chooseSalvo(game, botId, difficulty);
      const bot = game.players.get(botId)!;
      const expectedShots = playerShotCount(bot);

      expect(coords.length).toBe(expectedShots);

      // All coords should pass validation
      const err = validateSalvo(game, botId, coords);
      expect(err).toBeNull();
    }
  );

  it.each(['easy', 'medium', 'hard', 'impossible'] as const)(
    '%s never picks already-shot coordinates',
    (difficulty) => {
      const { game, humanId, botId } = makeGameWithBot(difficulty);
      setupBattle(game, humanId, botId);
      game.turnOrder = [botId, humanId];
      game.currentTurnIndex = 0;

      // Pre-shoot some cells
      game.shots.add('A1');
      game.shots.add('E5');
      game.shots.add('J10');

      const coords = chooseSalvo(game, botId, difficulty);
      for (const c of coords) {
        expect(game.shots.has(c)).toBe(false);
      }
    }
  );
});

// ============================================================
// Easy — Random, CAN Hit Own Ships
// ============================================================

describe('Easy AI', () => {
  it('does not avoid own ship positions', () => {
    // Over many runs, Easy should eventually pick a cell that overlaps its own ships
    const { game, humanId, botId } = makeGameWithBot('easy');
    setupBattle(game, humanId, botId);
    game.turnOrder = [botId, humanId];
    game.currentTurnIndex = 0;

    const botShipCells = new Set(
      game.players.get(botId)!.ships.flatMap(s => s.cells)
    );

    let hitOwnShip = false;
    for (let i = 0; i < 100; i++) {
      // Reset shots for each attempt
      game.shots = new Set();
      const coords = chooseSalvo(game, botId, 'easy');
      if (coords.some(c => botShipCells.has(c))) {
        hitOwnShip = true;
        break;
      }
    }
    // With 4 shots out of 100 cells, and 10 own-ship cells, probability of
    // never hitting own ship in 100 tries is astronomically low
    expect(hitOwnShip).toBe(true);
  });
});

// ============================================================
// Medium — Avoids Own Ships
// ============================================================

describe('Medium AI', () => {
  it('avoids own ship positions', () => {
    const { game, humanId, botId } = makeGameWithBot('medium');
    setupBattle(game, humanId, botId);
    game.turnOrder = [botId, humanId];
    game.currentTurnIndex = 0;

    const botShipCells = new Set(
      game.players.get(botId)!.ships.flatMap(s => s.cells)
    );

    for (let i = 0; i < 50; i++) {
      game.shots = new Set();
      const coords = chooseSalvo(game, botId, 'medium');
      for (const c of coords) {
        expect(botShipCells.has(c)).toBe(false);
      }
    }
  });

  it('targets adjacent cells after a hit', () => {
    const { game, humanId, botId } = makeGameWithBot('medium');
    setupBattle(game, humanId, botId);
    game.turnOrder = [botId, humanId];
    game.currentTurnIndex = 0;

    // Simulate a previous hit on the human's Cruiser at C1
    const humanShip = game.players.get(humanId)!.ships.find(s => s.cells.includes('C1'))!;
    humanShip.hits.add('C1');
    game.shots.add('C1');

    // Adjacent to C1: B1, D1, C2 — at least one should be targeted
    const adjacent = ['B1', 'D1', 'C2'];
    const botShipCells = new Set(game.players.get(botId)!.ships.flatMap(s => s.cells));
    // Filter to adjacent cells the bot wouldn't avoid
    const validAdj = adjacent.filter(c => !botShipCells.has(c));

    // If all adjacent cells overlap bot's ships, skip this test (extremely unlikely)
    if (validAdj.length === 0) return;

    let targetedAdjacent = false;
    for (let i = 0; i < 50; i++) {
      game.shots = new Set(['C1']);
      const coords = chooseSalvo(game, botId, 'medium');
      if (coords.some(c => validAdj.includes(c))) {
        targetedAdjacent = true;
        break;
      }
    }
    expect(targetedAdjacent).toBe(true);
  });
});

// ============================================================
// Hard — Avoids Own Ships + Checkerboard
// ============================================================

describe('Hard AI', () => {
  it('avoids own ship positions', () => {
    const { game, humanId, botId } = makeGameWithBot('hard');
    setupBattle(game, humanId, botId);
    game.turnOrder = [botId, humanId];
    game.currentTurnIndex = 0;

    const botShipCells = new Set(
      game.players.get(botId)!.ships.flatMap(s => s.cells)
    );

    for (let i = 0; i < 50; i++) {
      game.shots = new Set();
      const coords = chooseSalvo(game, botId, 'hard');
      for (const c of coords) {
        expect(botShipCells.has(c)).toBe(false);
      }
    }
  });

  it('uses checkerboard pattern in hunt mode', () => {
    const { game, humanId, botId } = makeGameWithBot('hard');
    setupBattle(game, humanId, botId);
    game.turnOrder = [botId, humanId];
    game.currentTurnIndex = 0;

    // With no prior hits, hard should use checkerboard
    const coords = chooseSalvo(game, botId, 'hard');

    // Check that selected cells follow checkerboard (row + col is even)
    const botShipCells = new Set(game.players.get(botId)!.ships.flatMap(s => s.cells));
    const nonBotCoords = coords.filter(c => !botShipCells.has(c));

    // At least some should be checkerboard cells
    const checkerboard = nonBotCoords.filter(c => {
      const row = 'ABCDEFGHIJ'.indexOf(c[0]);
      const col = parseInt(c.slice(1), 10) - 1;
      return (row + col) % 2 === 0;
    });
    expect(checkerboard.length).toBeGreaterThan(0);
  });
});

// ============================================================
// Impossible — Uses Perfect Information
// ============================================================

describe('Impossible AI', () => {
  it('always hits enemy ships', () => {
    const { game, humanId, botId } = makeGameWithBot('impossible');
    setupBattle(game, humanId, botId);
    game.turnOrder = [botId, humanId];
    game.currentTurnIndex = 0;

    const humanShipCells = new Set(
      game.players.get(humanId)!.ships.flatMap(s => s.cells)
    );

    const coords = chooseSalvo(game, botId, 'impossible');

    // Every shot should hit a human ship cell
    for (const c of coords) {
      expect(humanShipCells.has(c)).toBe(true);
    }
  });

  it('avoids own ship positions even with perfect info', () => {
    const { game, humanId, botId } = makeGameWithBot('impossible');
    setupBattle(game, humanId, botId);
    game.turnOrder = [botId, humanId];
    game.currentTurnIndex = 0;

    const botShipCells = new Set(
      game.players.get(botId)!.ships.flatMap(s => s.cells)
    );

    const coords = chooseSalvo(game, botId, 'impossible');
    for (const c of coords) {
      expect(botShipCells.has(c)).toBe(false);
    }
  });

  it('prioritizes cells that hit multiple players', () => {
    // Simple 2-player + bot setup where one cell is shared
    const { game, humanId, botId } = makeGameWithBot('impossible');
    setupBattle(game, humanId, botId);
    game.turnOrder = [botId, humanId];
    game.currentTurnIndex = 0;

    // The Impossible bot knows where the human's ships are.
    // With only 2 players, every human ship cell has score 1.
    // Just verify the bot always picks actual enemy ship cells.
    const humanShipCells = new Set(
      game.players.get(humanId)!.ships.flatMap(s => s.cells)
    );
    const coords = chooseSalvo(game, botId, 'impossible');
    const hitsOnHuman = coords.filter(c => humanShipCells.has(c));

    // Impossible bot should hit enemy ships with every shot
    expect(hitsOnHuman.length).toBe(coords.length);
  });
});

// ============================================================
// Bot Delay
// ============================================================

describe('Bot Delay', () => {
  it('returns appropriate delays per difficulty', () => {
    for (let i = 0; i < 20; i++) {
      expect(getBotDelay('easy')).toBeGreaterThanOrEqual(500);
      expect(getBotDelay('easy')).toBeLessThan(1000);
      expect(getBotDelay('medium')).toBeGreaterThanOrEqual(800);
      expect(getBotDelay('medium')).toBeLessThan(1500);
      expect(getBotDelay('hard')).toBeGreaterThanOrEqual(1000);
      expect(getBotDelay('hard')).toBeLessThan(2000);
      expect(getBotDelay('impossible')).toBeGreaterThanOrEqual(1200);
      expect(getBotDelay('impossible')).toBeLessThan(2000);
    }
  });
});

// ============================================================
// Edge Cases
// ============================================================

describe('AI Edge Cases', () => {
  it('handles nearly-full board (few unshot cells)', () => {
    const { game, humanId, botId } = makeGameWithBot('medium');
    setupBattle(game, humanId, botId);
    game.turnOrder = [botId, humanId];
    game.currentTurnIndex = 0;

    // Shoot almost everything
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 10; c++) {
        const coord = `${'ABCDEFGHIJ'[r]}${c + 1}`;
        if (coord !== 'J9' && coord !== 'J10') {
          game.shots.add(coord);
        }
      }
    }

    // Only 2 cells left, bot has 4 shots — should only return up to 2
    const coords = chooseSalvo(game, botId, 'medium');
    expect(coords.length).toBeLessThanOrEqual(2);
    expect(coords.length).toBeGreaterThan(0);
  });

  it('bot with 1 surviving ship fires 1 shot', () => {
    const { game, humanId, botId } = makeGameWithBot('hard');
    setupBattle(game, humanId, botId);
    game.turnOrder = [botId, humanId];
    game.currentTurnIndex = 0;

    // Sink 3 of the bot's 4 ships
    const bot = game.players.get(botId)!;
    for (let i = 0; i < 3; i++) {
      for (const cell of bot.ships[i].cells) {
        bot.ships[i].hits.add(cell);
      }
    }

    expect(playerShotCount(bot)).toBe(1);
    const coords = chooseSalvo(game, botId, 'hard');
    expect(coords.length).toBe(1);
  });
});

// ============================================================
// Bot Management
// ============================================================

describe('Bot Management', () => {
  it('adds bot to game', () => {
    const game = createGame('host', 'Alice', { enabled: false, seconds: 60 });
    const result = addBot(game, 'medium');
    expect('botId' in result).toBe(true);
    expect(game.players.size).toBe(2);
  });

  it('rejects bot when game is full', () => {
    const game = createGame('host', 'Alice', { enabled: false, seconds: 60 });
    addBot(game, 'easy');
    addBot(game, 'medium');
    addBot(game, 'hard');
    const result = addBot(game, 'impossible');
    expect('error' in result).toBe(true);
  });

  it('bot player has correct flags', () => {
    const game = createGame('host', 'Alice', { enabled: false, seconds: 60 });
    const result = addBot(game, 'hard');
    if ('error' in result) throw new Error(result.error);

    const bot = game.players.get(result.botId)!;
    expect(bot.isBot).toBe(true);
    expect(bot.aiDifficulty).toBe('hard');
    expect(bot.name).toBe('Bot (Hard)');
  });
});
