// ============================================================
// SALVO — Shared Types
// Server-internal types use Map/Set for convenience.
// Wire types (sent over socket.io) use JSON-serializable equivalents.
// ============================================================

// --- Server-internal types ---

export interface Ship {
  length: number;
  cells: string[];         // e.g. ["B3","B4","B5"]
  hits: Set<string>;       // subset of cells that have been hit
}

/** Computed: true when all cells have been hit */
export function isShipSunk(ship: Ship): boolean {
  return ship.hits.size === ship.cells.length;
}

export type AiDifficulty = 'easy' | 'medium' | 'hard' | 'impossible';

export const AI_NAMES: Record<AiDifficulty, string> = {
  easy: 'Bot (Easy)',
  medium: 'Bot (Medium)',
  hard: 'Bot (Hard)',
  impossible: 'Bot (Impossible)',
};

export interface Player {
  id: string;
  name: string;
  ships: Ship[];
  isBot: boolean;
  aiDifficulty: AiDifficulty | null;
}

/** Computed: has at least one unsunk ship */
export function isPlayerAlive(player: Player): boolean {
  return player.ships.some(s => !isShipSunk(s));
}

/** Computed: number of surviving ships = shots per turn */
export function playerShotCount(player: Player): number {
  return player.ships.filter(s => !isShipSunk(s)).length;
}

export type GamePhase = 'lobby' | 'placement' | 'playing' | 'finished';

export interface TimerConfig {
  enabled: boolean;
  seconds: number; // 30 or 60
}

export interface Game {
  id: string;
  phase: GamePhase;
  players: Map<string, Player>;
  hostId: string;
  turnOrder: string[];        // randomized when all ships placed
  currentTurnIndex: number;
  gridSize: 10;
  shots: Set<string>;         // all globally fired coordinates
  timerConfig: TimerConfig;
  lastActivity: number;       // Date.now() for cleanup
}

export const SHIP_LENGTHS = [1, 2, 3, 4] as const;
export const SHIP_NAMES: Record<number, string> = {
  1: 'Scout',
  2: 'Destroyer',
  3: 'Cruiser',
  4: 'Battleship',
};
export const GRID_SIZE = 10;
export const ROWS = 'ABCDEFGHIJ';
export const COLS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

// --- Wire types (JSON-serializable, used in socket events) ---

export interface WireShip {
  length: number;
  cells: string[];
  hits: string[];
  sunk: boolean;
}

export interface WirePlayer {
  id: string;
  name: string;
  ships: WireShip[];  // only YOUR ships have cells populated; others have cells=[]
  isBot: boolean;
  aiDifficulty: AiDifficulty | null;
  alive: boolean;
  shotCount: number;
}

export interface WireSunkShipInfo {
  cells: string[];
  length: number;
}

export interface PlayerHit {
  playerId: string;
  playerName: string;
  sunk: boolean;
  shipLength: number;
  sunkShipCells: string[] | null; // revealed when a ship is sunk
}

export interface ShotResult {
  coord: string;
  hits: PlayerHit[];
  miss: boolean;
}

export interface WireGame {
  id: string;
  phase: GamePhase;
  players: Record<string, WirePlayer>;
  turnOrder: string[];
  currentTurnIndex: number;
  gridSize: 10;
  shots: string[];
  timerConfig: TimerConfig;
}

export interface ChatMessage {
  playerId: string;
  playerName: string;
  text: string;
  timestamp: number;
}

export interface GameOverStats {
  winnerId: string | null; // null = draw
  playerStats: Record<string, {
    shotsFired: number;
    hitsLanded: number;
    shipsSunk: number;
    friendlyFireIncidents: number;
  }>;
  highlights: string[]; // e.g. "Most Accurate: Eric (68%)"
}

// --- Ship placement input ---

export interface ShipPlacement {
  length: number;
  cells: string[];
}

// --- Socket Events ---

export interface ClientToServerEvents {
  'create-game': (data: { playerName: string; timerConfig?: TimerConfig }) => void;
  'join-game': (data: { code: string; playerName: string }) => void;
  'start-game': () => void;
  'add-bot': (data: { difficulty: AiDifficulty }) => void;
  'remove-bot': (data: { botId: string }) => void;
  'place-ships': (data: { ships: ShipPlacement[] }) => void;
  'fire': (data: { coords: string[] }) => void;
  'chat-message': (data: { text: string }) => void;
  'rejoin': (data: { playerId: string; gameId: string }) => void;
}

export interface ServerToClientEvents {
  'error': (data: { message: string }) => void;
  'game-created': (data: { code: string; playerId: string; gameId: string }) => void;
  'player-joined': (data: { game: WireGame }) => void;
  'placement-phase': (data: { game: WireGame }) => void;
  'all-ready': (data: { game: WireGame }) => void;
  'your-turn': (data: { shotCount: number; timerSeconds: number | null }) => void;
  'turn-timeout': (data: { playerId: string }) => void;
  'shot-results': (data: { shooterId: string; shooterName: string; shots: ShotResult[]; game: WireGame }) => void;
  'player-eliminated': (data: { playerId: string; playerName: string; reason: 'forfeit' | 'sunk' }) => void;
  'game-over': (data: GameOverStats) => void;
  'game-state': (data: { game: WireGame }) => void; // full state on reconnect
  'chat-message': (data: ChatMessage) => void;
  'player-disconnected': (data: { playerId: string; playerName: string; timeoutSeconds: number }) => void;
  'player-reconnected': (data: { playerId: string; playerName: string }) => void;
}
