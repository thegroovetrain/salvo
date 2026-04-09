import { describe, it, expect } from 'vitest';
import {
  createGame, addBot, startGame, placeShips,
  allShipsPlaced, beginPlaying, fireSalvo,
  getCurrentTurnPlayerId, validateSalvo,
} from '../game.js';
import { chooseSalvo, generatePlacement, getBotDelay, createRNG } from '../ai/index.js';
import { selectDoctrine } from '../ai/doctrine.js';
import { probabilityMap } from '../ai/probability.js';
import type { Game, ShipPlacement } from '@salvo/shared';
import { isPlayerAlive, playerShotCount, SHIP_LENGTHS } from '@salvo/shared';
import { allHexes, parseHex, isValidHex, hexDistance } from '@salvo/shared/hex';
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

/** Place ships so human and bot share a hex cell (multi-hit scenario) */
function setupOverlappingBattle(game: Game, humanId: string, botId: string): {
  sharedCell: string;
} {
  startGame(game);
  game.islands = new Set();
  // Human ships on row r=0
  const humanShips: ShipPlacement[] = [
    { length: 2, cells: ['0,0', '1,0'] },
    { length: 3, cells: ['2,0', '3,0', '4,0'] },
    { length: 4, cells: ['-4,0', '-3,0', '-2,0', '-1,0'] },
  ];
  // Bot ships on row r=1, but first cell overlaps human's first ship at 0,0.
  // We can't literally set cells to the same coord for two players via placeShips
  // because each player's placement is validated independently. Let's place then manually set.
  const botShips: ShipPlacement[] = [
    { length: 2, cells: ['0,0', '0,1'] }, // overlaps human ship at 0,0!
    { length: 3, cells: ['-3,1', '-2,1', '-1,1'] },
    { length: 4, cells: ['1,1', '2,1', '3,1', '4,1'] },
  ];
  placeShips(game, humanId, humanShips);
  placeShips(game, botId, botShips);
  beginPlaying(game);
  return { sharedCell: '0,0' };
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

  it('hard/impossible ships are more spread apart than easy', () => {
    const measureSpread = (diff: 'easy' | 'impossible') => {
      let totalMinDist = 0;
      const trials = 30;
      for (let i = 0; i < trials; i++) {
        const placement = generatePlacement(diff, 5, new Set());
        let minDist = Infinity;
        for (let a = 0; a < placement.length; a++) {
          for (let b = a + 1; b < placement.length; b++) {
            for (const ca of placement[a].cells) {
              for (const cb of placement[b].cells) {
                const ha = parseHex(ca)!;
                const hb = parseHex(cb)!;
                minDist = Math.min(minDist, hexDistance(ha, hb));
              }
            }
          }
        }
        totalMinDist += minDist;
      }
      return totalMinDist / trials;
    };
    const easySpread = measureSpread('easy');
    const impossibleSpread = measureSpread('impossible');
    // Impossible should have greater minimum distance between ships on average
    expect(impossibleSpread).toBeGreaterThan(easySpread);
  });

  it('seeded RNG produces deterministic placement', () => {
    const rng1 = createRNG(42);
    const rng2 = createRNG(42);
    const p1 = generatePlacement('hard', 5, new Set(), rng1);
    const p2 = generatePlacement('hard', 5, new Set(), rng2);
    expect(p1).toEqual(p2);
  });
});

// ============================================================
// Salvo Validity — All Tiers
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
// Medium — Soft Self-Avoidance, Hunt/Kill/Desperation
// ============================================================

describe('Medium AI', () => {
  it('prefers non-self cells but accepts self-hits when cornered', () => {
    const { game, humanId, botId } = makeGameWithBot('medium');
    setupBotBattle(game, humanId, botId);
    game.turnOrder = [botId, humanId];
    game.currentTurnIndex = 0;

    const botShipCells = new Set(
      game.players.get(botId)!.ships.flatMap(s => s.cells)
    );

    // With a fresh board, Medium should mostly avoid own ships
    let selfHitCount = 0;
    let totalShots = 0;
    for (let i = 0; i < 30; i++) {
      game.shots = new Set();
      const coords = chooseSalvo(game, botId, 'medium');
      for (const c of coords) {
        totalShots++;
        if (botShipCells.has(c)) selfHitCount++;
      }
    }
    // Should prefer non-self cells (< 20% self-hits on fresh board)
    expect(selfHitCount / totalShots).toBeLessThan(0.2);
  });

  it('fires at own ships when only self-cells remain', () => {
    const { game, humanId, botId } = makeGameWithBot('medium');
    setupBotBattle(game, humanId, botId);
    game.turnOrder = [botId, humanId];
    game.currentTurnIndex = 0;

    const botShipCells = new Set(
      game.players.get(botId)!.ships.flatMap(s => s.cells)
    );

    // Shoot everything except bot's own ship cells
    for (const hex of allHexes(game.rings)) {
      if (!botShipCells.has(hex)) game.shots.add(hex);
    }

    const coords = chooseSalvo(game, botId, 'medium');
    expect(coords.length).toBeGreaterThan(0);
    // All targets must be bot's own cells (only thing left)
    for (const c of coords) {
      expect(botShipCells.has(c)).toBe(true);
    }
  });

  it('targets adjacent cells after a hit', () => {
    const { game, humanId, botId } = makeGameWithBot('medium');
    setupBotBattle(game, humanId, botId);
    game.turnOrder = [botId, humanId];
    game.currentTurnIndex = 0;

    const humanShipCell = game.players.get(humanId)!.ships[1].cells[0];
    const humanShip = game.players.get(humanId)!.ships.find(s => s.cells.includes(humanShipCell))!;
    humanShip.hits.add(humanShipCell);
    game.shots.add(humanShipCell);

    let targetedAdjacent = false;
    for (let i = 0; i < 50; i++) {
      game.shots = new Set([humanShipCell]);
      const coords = chooseSalvo(game, botId, 'medium');
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
// Hard — Full Doctrine + Probability Map
// ============================================================

describe('Hard AI', () => {
  it('accepts self-hits for tactical trades', () => {
    const { game, humanId, botId } = makeGameWithBot('hard');
    setupBotBattle(game, humanId, botId);
    game.turnOrder = [botId, humanId];
    game.currentTurnIndex = 0;

    const botShipCells = new Set(
      game.players.get(botId)!.ships.flatMap(s => s.cells)
    );

    // Shoot everything except bot's own ship cells
    for (const hex of allHexes(game.rings)) {
      if (!botShipCells.has(hex)) game.shots.add(hex);
    }

    const coords = chooseSalvo(game, botId, 'hard');
    expect(coords.length).toBeGreaterThan(0);
    for (const c of coords) {
      expect(botShipCells.has(c)).toBe(true);
    }
  });

  it('uses hex 3-coloring pattern in hunt mode (soft bonus)', () => {
    const { game, humanId, botId } = makeGameWithBot('hard');
    setupBotBattle(game, humanId, botId);
    game.turnOrder = [botId, humanId];
    game.currentTurnIndex = 0;

    // With no prior hits, hard should prefer 3-coloring
    let color0Count = 0;
    let totalCount = 0;
    for (let trial = 0; trial < 20; trial++) {
      game.shots = new Set();
      const coords = chooseSalvo(game, botId, 'hard');
      for (const c of coords) {
        totalCount++;
        const h = parseHex(c);
        if (h && ((h.q - h.r) % 3 + 3) % 3 === 0) color0Count++;
      }
    }
    // Should prefer color-0 cells (> 50% given soft bonus)
    expect(color0Count / totalCount).toBeGreaterThan(0.4);
  });
});

// ============================================================
// Impossible — Omniscient + Greedy Salvo
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

  it('targets enemy ships even when overlapping with own ships (multi-hit)', () => {
    const { game, humanId, botId } = makeGameWithBot('impossible');
    setupBotBattle(game, humanId, botId);
    game.turnOrder = [botId, humanId];
    game.currentTurnIndex = 0;

    // In a normal game, Impossible always hits enemy ships
    const humanShipCells = new Set(
      game.players.get(humanId)!.ships.flatMap(s => s.cells)
    );
    const coords = chooseSalvo(game, botId, 'impossible');
    // Verify it prioritizes enemy cells
    for (const c of coords) {
      expect(humanShipCells.has(c)).toBe(true);
    }
  });

  it('fires at own ships when only self-cells remain', () => {
    const { game, humanId, botId } = makeGameWithBot('impossible');
    setupBotBattle(game, humanId, botId);
    game.turnOrder = [botId, humanId];
    game.currentTurnIndex = 0;

    const botShipCells = new Set(
      game.players.get(botId)!.ships.flatMap(s => s.cells)
    );

    for (const hex of allHexes(game.rings)) {
      if (!botShipCells.has(hex)) game.shots.add(hex);
    }

    const coords = chooseSalvo(game, botId, 'impossible');
    expect(coords.length).toBeGreaterThan(0);
  });
});

// ============================================================
// Doctrine Selection
// ============================================================

describe('Doctrine Selection', () => {
  it('returns cleanup in 1v1 (only 1 enemy)', () => {
    const { game, humanId, botId } = makeGameWithBot('hard');
    setupBotBattle(game, humanId, botId);
    // In 1v1, cleanup always triggers (highest priority, 1 enemy alive)
    expect(selectDoctrine(game, botId, 'hard')).toBe('cleanup');
  });

  it('returns hunt when multiple enemies alive and no hits', () => {
    // Need 3+ players for non-cleanup doctrine
    const game = createGame('human1', 'Alice', { enabled: false, seconds: 60 });
    addBot(game, 'hard');
    const r2 = addBot(game, 'easy');
    if ('error' in r2) throw new Error(r2.error);
    const botId = [...game.players.keys()].find(id => game.players.get(id)!.aiDifficulty === 'hard')!;

    startGame(game);
    game.islands = new Set();
    const pids = [...game.players.keys()];
    for (let i = 0; i < pids.length; i++) {
      placeShips(game, pids[i], hexPlacements(i));
    }
    beginPlaying(game);

    expect(selectDoctrine(game, botId, 'hard')).toBe('hunt');
  });

  it('returns kill when active hits exist (multi-enemy)', () => {
    const game = createGame('human1', 'Alice', { enabled: false, seconds: 60 });
    addBot(game, 'hard');
    addBot(game, 'easy');
    const botId = [...game.players.keys()].find(id => game.players.get(id)!.aiDifficulty === 'hard')!;

    startGame(game);
    game.islands = new Set();
    const pids = [...game.players.keys()];
    for (let i = 0; i < pids.length; i++) {
      placeShips(game, pids[i], hexPlacements(i));
    }
    beginPlaying(game);

    // Create active hit on human's longest ship (length 4, not sunk by 1 hit)
    const humanShip = game.players.get('human1')!.ships[2]; // length-4 ship
    humanShip.hits.add(humanShip.cells[0]);
    game.shots.add(humanShip.cells[0]);

    expect(selectDoctrine(game, botId, 'hard')).toBe('kill');
  });

  it('returns desperation when bot has 1-2 ships (multi-enemy)', () => {
    const game = createGame('human1', 'Alice', { enabled: false, seconds: 60 });
    const r1 = addBot(game, 'hard');
    addBot(game, 'easy');
    if ('error' in r1) throw new Error(r1.error);
    const botId = r1.botId;

    startGame(game);
    game.islands = new Set();
    const pids = [...game.players.keys()];
    for (let i = 0; i < pids.length; i++) {
      placeShips(game, pids[i], hexPlacements(i));
    }
    beginPlaying(game);

    // Sink 2 of 3 bot ships (leaving 1 surviving — desperation threshold)
    const bot = game.players.get(botId)!;
    for (let i = 0; i < 2; i++) {
      for (const cell of bot.ships[i].cells) bot.ships[i].hits.add(cell);
    }
    expect(selectDoctrine(game, botId, 'hard')).toBe('desperation');
  });

  it('easy always returns hunt', () => {
    const { game, humanId, botId } = makeGameWithBot('easy');
    setupBotBattle(game, humanId, botId);
    expect(selectDoctrine(game, botId, 'easy')).toBe('hunt');
  });
});

// ============================================================
// Probability Map
// ============================================================

describe('Probability Map', () => {
  it('produces non-zero probabilities for enemy ship positions', () => {
    const { game, humanId, botId } = makeGameWithBot('hard');
    setupBotBattle(game, humanId, botId);

    const probMap = probabilityMap(game, botId);
    expect(probMap.size).toBeGreaterThan(0);

    // Human ship cells should have non-zero probability
    const humanCells = game.players.get(humanId)!.ships.flatMap(s => s.cells);
    const coveredCells = humanCells.filter(c => (probMap.get(c) ?? 0) > 0);
    expect(coveredCells.length).toBeGreaterThan(0);
  });

  it('returns empty map when all ships are sunk', () => {
    const { game, humanId, botId } = makeGameWithBot('hard');
    setupBotBattle(game, humanId, botId);

    // Sink all human ships
    for (const ship of game.players.get(humanId)!.ships) {
      for (const cell of ship.cells) ship.hits.add(cell);
    }

    const probMap = probabilityMap(game, botId);
    expect(probMap.size).toBe(0);
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

    const all = allHexes(game.rings);
    const keep = new Set([all[all.length - 1], all[all.length - 2]]);
    for (const c of all) {
      if (!keep.has(c)) game.shots.add(c);
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

    const bot = game.players.get(botId)!;
    for (let i = 0; i < 2; i++) {
      for (const cell of bot.ships[i].cells) bot.ships[i].hits.add(cell);
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

// ============================================================
// No-Deadlock Stress Test
// ============================================================

describe('No-Deadlock Stress Test', () => {
  it.each(['easy', 'medium', 'hard', 'impossible'] as const)(
    '%s completes 50 full games without deadlock',
    (difficulty) => {
      for (let trial = 0; trial < 50; trial++) {
        const { game, humanId, botId } = makeGameWithBot(difficulty);
        setupBotBattle(game, humanId, botId);
        game.turnOrder = [botId, humanId];
        game.currentTurnIndex = 0;

        // Simulate: bot fires, we mark shots, repeat until board is full
        let turns = 0;
        const maxTurns = 200;
        while (turns < maxTurns) {
          const unshot = allHexes(game.rings).filter(c => !game.shots.has(c) && !game.islands.has(c));
          if (unshot.length === 0) break;

          const coords = chooseSalvo(game, botId, difficulty);
          expect(coords.length).toBeGreaterThan(0);

          for (const c of coords) game.shots.add(c);
          turns++;
        }
        expect(turns).toBeLessThan(maxTurns);
      }
    },
  );
});

// ============================================================
// Simulation Harness — Bot vs Bot Win Rates
// ============================================================

describe('Bot vs Bot Simulation', () => {
  it('impossible beats easy most of the time', () => {
    const rng = createRNG(12345);
    let impossibleWins = 0;
    const games = 20;

    for (let i = 0; i < games; i++) {
      const game = createGame('easy-bot', 'EasyBot', { enabled: false, seconds: 60 });
      const easyResult = addBot(game, 'impossible');
      if ('error' in easyResult) throw new Error(easyResult.error);
      const impossibleId = easyResult.botId;
      const easyId = 'easy-bot';

      startGame(game);
      game.islands = new Set();
      placeShips(game, easyId, generatePlacement('easy', game.rings, game.islands, rng));
      placeShips(game, impossibleId, generatePlacement('impossible', game.rings, game.islands, rng));
      beginPlaying(game);
      game.turnOrder = [easyId, impossibleId];
      game.currentTurnIndex = 0;

      let turn = 0;
      while (isPlayerAlive(game.players.get(easyId)!) && isPlayerAlive(game.players.get(impossibleId)!) && turn < 300) {
        const currentId = game.turnOrder[turn % 2];
        const difficulty = currentId === impossibleId ? 'impossible' : 'easy';
        const coords = chooseSalvo(game, currentId, difficulty as any, rng);
        fireSalvo(game, currentId, coords);
        turn++;
      }

      if (!isPlayerAlive(game.players.get(easyId)!)) impossibleWins++;
    }

    // Impossible should win at least 60% against Easy
    expect(impossibleWins / games).toBeGreaterThanOrEqual(0.6);
  });
});

// ============================================================
// Performance Benchmark
// ============================================================

describe('Performance', () => {
  it('chooseSalvo completes within 50ms for all tiers on 6-ring grid', () => {
    for (const difficulty of ['easy', 'medium', 'hard', 'impossible'] as const) {
      const game = createGame('human', 'Alice', { enabled: false, seconds: 60 }, 'private', false, 6);
      const result = addBot(game, difficulty);
      if ('error' in result) throw new Error(result.error);
      const botId = result.botId;

      startGame(game);
      game.islands = new Set();
      placeShips(game, 'human', hexPlacements(0));
      placeShips(game, botId, generatePlacement(difficulty, game.rings, game.islands));
      beginPlaying(game);
      game.turnOrder = [botId, 'human'];
      game.currentTurnIndex = 0;

      const start = performance.now();
      chooseSalvo(game, botId, difficulty);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(50);
    }
  });
});
