import { describe, it, expect, beforeEach, vi } from 'vitest';
import { state } from '../state.js';
import type { WireGame } from '@salvo/shared';

// Mock hexGrid to avoid SVG rendering complexity
vi.mock('../hexGrid.js', () => ({
  renderHexGridSVG: vi.fn(() => '<svg></svg>'),
  svgClickToHex: vi.fn(),
  getShipPreview: vi.fn(),
  nextDirection: vi.fn(),
  parseHex: vi.fn(),
  hexToString: vi.fn(),
  allHexes: vi.fn(() => []),
  hexLinear: vi.fn(),
  isValidHex: vi.fn(),
  HEX_DIRECTIONS: [],
  PLAYER_COLOR_HEX: {},
}));

import { getCellState, wasSelfHitAtCoord } from '../rendering/grid.js';

function makeGame(overrides?: Partial<WireGame>): WireGame {
  return {
    id: 'g1',
    phase: 'playing',
    players: {
      player1: {
        id: 'player1', name: 'P1', isBot: false, alive: true,
        ships: [{ length: 2, cells: ['0,0', '1,0'], hits: [], sunk: false }],
        shotCount: 2, color: 'magenta', aiDifficulty: null,
      },
      player2: {
        id: 'player2', name: 'P2', isBot: false, alive: true,
        ships: [{ length: 2, cells: [], hits: [], sunk: false }],
        shotCount: 2, color: 'red', aiDifficulty: null,
      },
    },
    shots: [],
    turnOrder: ['player1', 'player2'],
    currentTurnIndex: 0,
    hostId: 'player1',
    teamsEnabled: false,
    teams: {},
    gameType: 'ffa',
    mode: 'private',
    rings: 5,
    islands: [],
    timerConfig: { enabled: false, seconds: 60 },
    islandCount: 6,
    ...overrides,
  };
}

describe('getCellState', () => {
  beforeEach(() => {
    state.playerId = 'player1';
    state.selectedTargets = [];
    state.shotLog = [];
    state.placedShips = [];
    state.ghostCells = [];
    state.ghostValid = false;
    state.teammateGhostShips = [];
  });

  describe('placement mode', () => {
    it('returns cell-empty for unoccupied hex', () => {
      state.game = makeGame();
      const result = getCellState('3,3', 'placement');
      expect(result.cssClass).toBe('cell-empty');
    });

    it('returns cell-ghost for valid ghost preview', () => {
      state.game = makeGame();
      state.ghostCells = ['3,3'];
      state.ghostValid = true;
      const result = getCellState('3,3', 'placement');
      expect(result.cssClass).toBe('cell-ghost');
    });

    it('returns cell-invalid for invalid ghost preview', () => {
      state.game = makeGame();
      state.ghostCells = ['3,3'];
      state.ghostValid = false;
      const result = getCellState('3,3', 'placement');
      expect(result.cssClass).toBe('cell-invalid');
    });

    it('returns cell-ship for placed ship', () => {
      state.game = makeGame();
      state.placedShips = [{ length: 2, cells: ['3,3', '4,3'] }];
      const result = getCellState('3,3', 'placement');
      expect(result.cssClass).toBe('cell-ship');
    });
  });

  describe('battle mode', () => {
    it('returns cell-selected for targeted hex', () => {
      state.game = makeGame();
      state.selectedTargets = ['2,0'];
      const result = getCellState('2,0', 'battle');
      expect(result.cssClass).toBe('cell-selected');
    });

    it('returns cell-ship for own unshot ship', () => {
      state.game = makeGame();
      const result = getCellState('0,0', 'battle');
      expect(result.cssClass).toBe('cell-ship');
    });

    it('returns cell-miss for shot that hit nothing', () => {
      state.game = makeGame({ shots: ['5,5'] });
      const result = getCellState('5,5', 'battle');
      expect(result.cssClass).toBe('cell-miss');
    });

    it('returns cell-empty for unshot empty hex', () => {
      state.game = makeGame();
      const result = getCellState('5,5', 'battle');
      expect(result.cssClass).toBe('cell-empty');
    });
  });
});

describe('wasSelfHitAtCoord', () => {
  beforeEach(() => {
    state.playerId = 'player1';
    state.shotLog = [];
  });

  it('returns true when player hit their own ship', () => {
    state.shotLog = [{
      shooterId: 'player1',
      shooterName: 'P1',
      shots: [{ coord: '0,0', miss: false, hits: [{ playerId: 'player1', playerName: 'P1', shipLength: 2, sunk: false, sunkShipCells: null }] }],
    }];
    expect(wasSelfHitAtCoord('0,0')).toBe(true);
  });

  it('returns false when someone else hit the coord', () => {
    state.shotLog = [{
      shooterId: 'player2',
      shooterName: 'P2',
      shots: [{ coord: '0,0', miss: false, hits: [{ playerId: 'player1', playerName: 'P1', shipLength: 2, sunk: false, sunkShipCells: null }] }],
    }];
    expect(wasSelfHitAtCoord('0,0')).toBe(false);
  });

  it('returns false when coord has no shots', () => {
    expect(wasSelfHitAtCoord('5,5')).toBe(false);
  });
});
