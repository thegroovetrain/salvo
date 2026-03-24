import { describe, it, expect } from 'vitest';
import {
  createGame, addBot, startGame, placeShips,
  allShipsPlaced, beginPlaying, fireSalvo,
  getCurrentTurnPlayerId, validateSalvo,
} from '../game.js';
import { chooseSalvo, generatePlacement, getBotDelay } from '../ai.js';
import type { Game, ShipPlacement } from '@salvo/shared';
import { isPlayerAlive, playerShotCount, SHIP_LENGTHS } from '@salvo/shared';
import { allHexes, parseHex, isValidHex } from '@salvo/shared/hex';
import { hexPlacements } from './helpers.js';

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

function setupBotBattle(game: Game, humanId: string, botId: string): void {
  startGame(game);
  game.islands = new Set(); // clear islands for deterministic placement
  placeShips(game, humanId, hexPlacements(0));
  const botPlacement = generatePlacement(game.players.get(botId)!.aiDifficulty!, game.rings, game.islands);
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
      const placement = generatePlacement(difficulty, 5, new Set());
      expect(placement.length).toBe(SHIP_LENGTHS.length);

      const lengths = placement.map(p => p.length).sort();
      expect(lengths).toEqual([...SHIP_LENGTHS].sort());

      // No overlapping cells
      const allCells = placement.flatMap(p => p.cells);
      expect(new Set(allCells).size).toBe(allCells.length);

      // All cells within 5-ring grid
      for (const cell of allCells) {
        const h = parseHex(cell);
        expect(h).not.toBeNull();
        expect(isValidHex(h!.q, h!.r, 5)).toBe(true);
      }
    }
  );

  it('placement avoids island hexes', () => {
    const islands = new Set(['0,0', '1,0', '-1,0', '0,1', '0,-1']);
    for (let i = 0; i < 20; i++) {
      const placement = generatePlacement('medium', 5, islands);
      const allCells = placement.flatMap(p => p.cells);
      for (const cell of allCells) {
        expect(islands.has(cell)).toBe(false);
      }
    }
  });

  it('hard/impossible placement biases toward inner rings', () => {
    let outerRingCells = 0;
    let totalCells = 0;
    for (let i = 0; i < 50; i++) {
      const placement = generatePlacement('hard', 5, new Set());
      for (const ship of placement) {
        for (const cell of ship.cells) {
          totalCells++;
          const h = parseHex(cell)!;
          const dist = Math.max(Math.abs(h.q), Math.abs(h.r), Math.abs(h.q + h.r));
          if (dist >= 4) outerRingCells++;
        }
      }
    }
    // Hard placement should have fewer outer ring cells than random
    expect(outerRingCells / totalCells).toBeLessThan(0.5);
  });

  it('generates valid placement on 6-ring grid', () => {
    const placement = generatePlacement('medium', 6, new Set());
    const allCells = placement.flatMap(p => p.cells);
    for (const cell of allCells) {
      const h = parseHex(cell)!;
      expect(isValidHex(h.q, h.r, 6)).toBe(true);
    }
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
      setupBotBattle(game, humanId, botId);
      game.turnOrder = [botId, humanId];
      game.currentTurnIndex = 0;

      const coords = chooseSalvo(game, botId, difficulty);
      const bot = game.players.get(botId)!;
      const expectedShots = playerShotCount(bot);

      expect(coords.length).toBe(expectedShots);

      const err = validateSalvo(game, botId, coords);
      expect(err).toBeNull();
    }
  );

  it.each(['easy', 'medium', 'hard', 'impossible'] as const)(
    '%s never picks already-shot coordinates',
    (difficulty) => {
      const { game, humanId, botId } = makeGameWithBot(difficulty);
      setupBotBattle(game, humanId, botId);
      game.turnOrder = [botId, humanId];
      game.currentTurnIndex = 0;

      // Pre-shoot some cells
      game.shots.add('0,0');
      game.shots.add('2,-1');
      game.shots.add('-3,2');

      const coords = chooseSalvo(game, botId, difficulty);
      for (const c of coords) {
        expect(game.shots.has(c)).toBe(false);
      }
    }
  );

  it.each(['easy', 'medium', 'hard', 'impossible'] as const)(
    '%s never picks island coordinates',
    (difficulty) => {
      const { game, humanId, botId } = makeGameWithBot(difficulty);
      setupBotBattle(game, humanId, botId);
      game.turnOrder = [botId, humanId];
      game.currentTurnIndex = 0;

      // Add islands
      game.islands.add('3,-3');
      game.islands.add('4,-2');

      const coords = chooseSalvo(game, botId, difficulty);
      for (const c of coords) {
        expect(game.islands.has(c)).toBe(false);
      }
    }
  );
});

// ============================================================
// Easy — Random, CAN Hit Own Ships
// ============================================================

describe('Easy AI', () => {
  it('does not avoid own ship positions', () => {
    const { game, humanId, botId } = makeGameWithBot('easy');
    setupBotBattle(game, humanId, botId);
    game.turnOrder = [botId, humanId];
    game.currentTurnIndex = 0;

    const botShipCells = new Set(
      game.players.get(botId)!.ships.flatMap(s => s.cells)
    );

    let hitOwnShip = false;
    for (let i = 0; i < 100; i++) {
      game.shots = new Set();
      const coords = chooseSalvo(game, botId, 'easy');
      if (coords.some(c => botShipCells.has(c))) {
        hitOwnShip = true;
        break;
      }
    }
    expect(hitOwnShip).toBe(true);
  });
});

// ============================================================
// Medium — Avoids Own Ships
// ============================================================

describe('Medium AI', () => {
  it('avoids own ship positions', () => {
    const { game, humanId, botId } = makeGameWithBot('medium');
    setupBotBattle(game, humanId, botId);
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
    setupBotBattle(game, humanId, botId);
    game.turnOrder = [botId, humanId];
    game.currentTurnIndex = 0;

    // Simulate a previous hit on one of the human's ship cells
    const humanShipCell = game.players.get(humanId)!.ships[1].cells[0]; // Destroyer first cell
    const humanShip = game.players.get(humanId)!.ships.find(s => s.cells.includes(humanShipCell))!;
    humanShip.hits.add(humanShipCell);
    game.shots.add(humanShipCell);

    let targetedAdjacent = false;
    for (let i = 0; i < 50; i++) {
      game.shots = new Set([humanShipCell]);
      const coords = chooseSalvo(game, botId, 'medium');
      // Check if any coord is adjacent to the hit cell
      const h = parseHex(humanShipCell)!;
      for (const c of coords) {
        const ch = parseHex(c);
        if (ch) {
          const dist = Math.max(Math.abs(h.q - ch.q), Math.abs(h.r - ch.r), Math.abs((h.q + h.r) - (ch.q + ch.r)));
          if (dist === 1) {
            targetedAdjacent = true;
            break;
          }
        }
      }
      if (targetedAdjacent) break;
    }
    expect(targetedAdjacent).toBe(true);
  });
});

// ============================================================
// Hard — Hex 3-Coloring Hunt
// ============================================================

describe('Hard AI', () => {
  it('avoids own ship positions', () => {
    const { game, humanId, botId } = makeGameWithBot('hard');
    setupBotBattle(game, humanId, botId);
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

  it('uses hex 3-coloring pattern in hunt mode', () => {
    const { game, humanId, botId } = makeGameWithBot('hard');
    setupBotBattle(game, humanId, botId);
    game.turnOrder = [botId, humanId];
    game.currentTurnIndex = 0;

    // With no prior hits, hard should use 3-coloring
    const coords = chooseSalvo(game, botId, 'hard');
    const botShipCells = new Set(game.players.get(botId)!.ships.flatMap(s => s.cells));
    const nonBotCoords = coords.filter(c => !botShipCells.has(c));

    // Check 3-coloring: ((q - r) % 3 + 3) % 3 === 0
    const coloredCells = nonBotCoords.filter(c => {
      const h = parseHex(c);
      if (!h) return false;
      return ((h.q - h.r) % 3 + 3) % 3 === 0;
    });
    // Most cells should follow the 3-coloring pattern
    expect(coloredCells.length).toBeGreaterThan(0);
  });
});

// ============================================================
// Impossible — Uses Perfect Information
// ============================================================

describe('Impossible AI', () => {
  it('always hits enemy ships', () => {
    const { game, humanId, botId } = makeGameWithBot('impossible');
    setupBotBattle(game, humanId, botId);
    game.turnOrder = [botId, humanId];
    game.currentTurnIndex = 0;

    const humanShipCells = new Set(
      game.players.get(humanId)!.ships.flatMap(s => s.cells)
    );

    const coords = chooseSalvo(game, botId, 'impossible');
    for (const c of coords) {
      expect(humanShipCells.has(c)).toBe(true);
    }
  });

  it('avoids own ship positions even with perfect info', () => {
    const { game, humanId, botId } = makeGameWithBot('impossible');
    setupBotBattle(game, humanId, botId);
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
    setupBotBattle(game, humanId, botId);
    game.turnOrder = [botId, humanId];
    game.currentTurnIndex = 0;

    // Shoot almost everything except 2 cells
    const all = allHexes(game.rings);
    const keep = new Set([all[all.length - 1], all[all.length - 2]]);
    for (const c of all) {
      if (!keep.has(c)) {
        game.shots.add(c);
      }
    }

    const coords = chooseSalvo(game, botId, 'medium');
    expect(coords.length).toBeLessThanOrEqual(2);
    expect(coords.length).toBeGreaterThan(0);
  });

  it('bot with 1 surviving ship fires 1 shot', () => {
    const { game, humanId, botId } = makeGameWithBot('hard');
    setupBotBattle(game, humanId, botId);
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
    addBot(game, 'impossible');
    addBot(game, 'easy');
    const result = addBot(game, 'medium');
    expect('error' in result).toBe(true);
  });

  it('bot player has correct flags', () => {
    const game = createGame('host', 'Alice', { enabled: false, seconds: 60 });
    const result = addBot(game, 'hard');
    if ('error' in result) throw new Error(result.error);

    const bot = game.players.get(result.botId)!;
    expect(bot.isBot).toBe(true);
    expect(bot.aiDifficulty).toBe('hard');
    expect(bot.name[0]).toBe('H');
  });
});
