// ============================================================
// SALVO — Shared Types
// Server-internal types use Map/Set for convenience.
// Wire types (sent over socket.io) use JSON-serializable equivalents.
// ============================================================

// --- Server-internal types ---

export interface Ship {
  length: number;
  cells: string[];         // e.g. ["0,0","1,0","2,0"] (axial hex coords)
  hits: Set<string>;       // subset of cells that have been hit
}

/** Computed: true when all cells have been hit */
export function isShipSunk(ship: Ship): boolean {
  return ship.hits.size === ship.cells.length;
}

export type AiDifficulty = 'easy' | 'medium' | 'hard' | 'impossible';

// --- Player Colors ---

export type PlayerColor = 'magenta' | 'red' | 'yellow' | 'green' | 'cyan' | 'blue';

/** Fixed global slot order: join order determines color in private games */
export const SLOT_COLORS: PlayerColor[] = ['magenta', 'red', 'yellow', 'green', 'cyan', 'blue'];

/** Team color pools for Quick Play random assignment (disjoint per team config) */
export const TEAM_COLOR_POOLS: Record<string, Record<string, PlayerColor[]>> = {
  /** 2-team modes (2v2, 3v3): warm vs cool */
  '2-team': {
    alpha: ['magenta', 'red', 'yellow'],
    bravo: ['green', 'cyan', 'blue'],
  },
  /** 3-team mode (2v2v2): disjoint pairs */
  '3-team': {
    alpha: ['magenta', 'red'],
    bravo: ['yellow', 'green'],
    charlie: ['cyan', 'blue'],
  },
};

export const BOT_NAME_POOLS: Record<AiDifficulty, string[]> = {
  easy: ['Ethan', 'Emma', 'Eli', 'Eva', 'Eddie', 'Elena', 'Ezra', 'Elise', 'Edgar', 'Emily'],
  medium: ['Marcus', 'Mia', 'Miles', 'Maya', 'Max', 'Meredith', 'Morgan', 'Molly', 'Malcolm', 'Margot'],
  hard: ['Helena', 'Hugo', 'Hana', 'Harris', 'Holly', 'Hector', 'Hazel', 'Henry', 'Hope', 'Hans'],
  impossible: ['Ivan', 'Iris', 'Isaac', 'Isla', 'Ian', 'Ingrid', 'Idris', 'Ivy', 'Igor', 'Imara'],
};

export interface Player {
  id: string;
  name: string;
  ships: Ship[];
  isBot: boolean;
  aiDifficulty: AiDifficulty | null;
  color: PlayerColor;
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

export type GameMode =
  | 'private'
  | 'quickplay-1v1'
  | 'quickplay-2v2'
  | 'quickplay-3v3'
  | 'quickplay-3ffa'
  | 'quickplay-6ffa'
  | 'quickplay-2v2v2';

export type ChatChannel = 'team' | 'global';

export interface Game {
  id: string;
  phase: GamePhase;
  mode: GameMode;
  players: Map<string, Player>;
  hostId: string;
  turnOrder: string[];        // generated when all ships placed
  currentTurnIndex: number;
  rings: number;              // hex grid ring count (4-6)
  islands: Set<string>;       // "q,r" coordinate strings for blocked hexes
  shots: Set<string>;         // all globally fired coordinates ("q,r" format)
  timerConfig: TimerConfig;
  lastActivity: number;       // Date.now() for cleanup
  rematchAccepted: Set<string>; // playerIds who accepted rematch
  /** Per-player stats accumulated during gameplay */
  playerStats: Map<string, PlayerGameStats>;
  /** ID of the player who scored the first hit */
  firstBloodId: string | null;
  /** Team mode: playerId → teamId ('alpha' | 'bravo' | 'charlie') */
  teams: Map<string, string>;
  teamsEnabled: boolean;
  /** Private game type for lobby UI: 'ffa' | '2-team' | '3-team' */
  gameType: 'ffa' | '2-team' | '3-team';
  /** Island count for generation (0=none, 4=few, 6=normal, 8=many) */
  islandCount: number;
}

export interface PlayerGameStats {
  shotsFired: number;
  hitsLanded: number;       // hits on OTHER players' ships
  shipsSunk: number;        // other players' ships this player sunk
  friendlyFireHits: number; // hits on OWN ships
  turnsTaken: number;
}

export const SHIP_LENGTHS = [1, 2, 3, 4] as const;
export const SHIP_NAMES: Record<number, string> = {
  1: 'Scout',
  2: 'Destroyer',
  3: 'Cruiser',
  4: 'Dreadnought',
};

/** Default ring counts per game mode */
export const MODE_RINGS: Record<string, number> = {
  'private': 5,
  'quickplay-1v1': 5,
  'quickplay-2v2': 5,
  'quickplay-3ffa': 5,   // 3-player FFA
  'quickplay-3v3': 6,    // 6 players need bigger grid
  'quickplay-6ffa': 6,
  'quickplay-2v2v2': 6,
};

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
  color: PlayerColor;
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
  mode: GameMode;
  players: Record<string, WirePlayer>;
  hostId: string;
  turnOrder: string[];
  currentTurnIndex: number;
  rings: number;
  islands: string[];         // "q,r" strings for blocked hexes
  shots: string[];
  timerConfig: TimerConfig;
  teamsEnabled: boolean;
  teams: Record<string, string>; // playerId → teamId
  gameType: 'ffa' | '2-team' | '3-team';
  islandCount: number;
}

export interface ChatMessage {
  playerId: string;
  playerName: string;
  text: string;
  timestamp: number;
  channel: ChatChannel;
}

export interface GameOverStats {
  winnerId: string | null; // null = draw
  winnerTeamId: string | null; // null = draw or non-team game
  playerStats: Record<string, {
    shotsFired: number;
    hitsLanded: number;
    accuracy: number;          // hitsLanded / shotsFired (0-1)
    shipsSunk: number;
    friendlyFireHits: number;
    turnsTaken: number;
  }>;
  highlights: string[]; // e.g. "Sharpshooter: Eric (78%)"
}

// --- Ship placement input ---

export interface ShipPlacement {
  length: number;
  cells: string[];
}

// --- Socket Events ---

export type QuickPlayMode = '1v1' | '2v2' | '3v3' | '3ffa' | '6ffa' | '2v2v2';

export interface GameCountData {
  total: number;
  oneVsOne: number;
  twoVsTwo: number;
  threeVsThree: number;
  threeFfa: number;
  sixFfa: number;
  twoVsTwoVsTwo: number;
  searching1v1: number;
  searching2v2: number;
  searching3v3: number;
  searching3ffa: number;
  searching6ffa: number;
  searching2v2v2: number;
}

export interface ClientToServerEvents {
  'create-game': (data: { playerName: string }) => void;
  'update-game-options': (data: { gameType?: 'ffa' | '2-team' | '3-team'; timerSeconds?: number | null; rings?: number; islandCount?: number }) => void;
  'join-game': (data: { code: string; playerName: string }) => void;
  'start-game': () => void;
  'add-bot': (data: { difficulty: AiDifficulty; team?: string; slotIndex?: number }) => void;
  'remove-bot': (data: { botId: string }) => void;
  'place-ships': (data: { ships: ShipPlacement[] }) => void;
  'fire': (data: { coords: string[] }) => void;
  'chat-message': (data: { text: string; channel?: ChatChannel }) => void;
  'swap-team': (data: { targetPlayerId: string }) => void;
  'swap-players': (data: { playerA: string; playerB: string }) => void;
  'move-to-slot': (data: { slotIndex: number }) => void;
  'placement-preview': (data: { ships: ShipPlacement[] }) => void;
  'rejoin': (data: { playerId: string; gameId: string }) => void;
  'rematch-request': () => void;
  'rematch-decline': () => void;
  'quickplay-join': (data: { playerName: string; mode: QuickPlayMode }) => void;
  'quickplay-leave': () => void;
  'surrender': () => void;
  'leave-game': () => void;
  'decline-rejoin': (data: { playerId: string; gameId: string }) => void;
  'check-rejoin': (data: { playerId: string; gameId: string }) => void;
}

export interface ServerToClientEvents {
  'error': (data: { message: string }) => void;
  'game-created': (data: { code: string; playerId: string; gameId: string }) => void;
  'player-joined': (data: { game: WireGame }) => void;
  'placement-phase': (data: { game: WireGame; placementDeadline?: number }) => void;
  'all-ready': (data: { game: WireGame }) => void;
  'your-turn': (data: { shotCount: number; timerSeconds: number | null }) => void;
  'turn-timeout': (data: { playerId: string }) => void;
  'shot-results': (data: { shooterId: string; shooterName: string; shots: ShotResult[]; game: WireGame }) => void;
  'player-eliminated': (data: { playerId: string; playerName: string; reason: 'forfeit' | 'sunk' }) => void;
  'game-over': (data: GameOverStats) => void;
  'game-state': (data: { game: WireGame }) => void; // full state on reconnect
  'chat-message': (data: ChatMessage) => void;
  'player-disconnected': (data: { playerId: string; playerName: string }) => void;
  'teammate-placement-preview': (data: { ships: ShipPlacement[] }) => void;
  'player-reconnected': (data: { playerId: string; playerName: string }) => void;
  'rematch-pending': (data: { acceptedIds: string[]; totalHumans: number }) => void;
  'rematch-starting': (data: { game: WireGame; placementDeadline?: number }) => void;
  'rematch-declined': (data: { playerName: string; code: string; game: WireGame }) => void;
  'quickplay-queue-update': (data: { size: number }) => void;
  'quickplay-matched': (data: { playerId: string; gameId: string }) => void;
  'online-count': (data: { count: number }) => void;
  'surrender-ack': () => void;
  'left-game': () => void;
  'check-rejoin-response': (data: { valid: boolean; timeRemaining: number }) => void;
}

// --- Helpers ---

/** Map QuickPlayMode to GameMode */
export function toGameMode(qpMode: QuickPlayMode): GameMode {
  switch (qpMode) {
    case '1v1': return 'quickplay-1v1';
    case '2v2': return 'quickplay-2v2';
    case '3v3': return 'quickplay-3v3';
    case '3ffa': return 'quickplay-3ffa';
    case '6ffa': return 'quickplay-6ffa';
    case '2v2v2': return 'quickplay-2v2v2';
  }
}

/** Map GameMode to QuickPlayMode (inverse of toGameMode) */
export function toQuickPlayMode(gameMode: GameMode): QuickPlayMode | null {
  switch (gameMode) {
    case 'quickplay-1v1': return '1v1';
    case 'quickplay-2v2': return '2v2';
    case 'quickplay-3v3': return '3v3';
    case 'quickplay-3ffa': return '3ffa';
    case 'quickplay-6ffa': return '6ffa';
    case 'quickplay-2v2v2': return '2v2v2';
    default: return null;
  }
}

/** Get all teammates of a player (excludes self). Returns [] for FFA/non-team games. */
export function getTeammates(game: Game, playerId: string): string[] {
  if (!game.teamsEnabled) return [];
  const myTeam = game.teams.get(playerId);
  if (!myTeam) return [];
  const teammates: string[] = [];
  for (const [pid, tid] of game.teams) {
    if (pid !== playerId && tid === myTeam) {
      teammates.push(pid);
    }
  }
  return teammates;
}

/** Check if any player on the team is still alive */
export function isTeamAlive(game: Game, teamId: string): boolean {
  for (const [pid, tid] of game.teams) {
    if (tid === teamId) {
      const player = game.players.get(pid);
      if (player && isPlayerAlive(player)) return true;
    }
  }
  return false;
}
