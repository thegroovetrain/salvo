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

/** @deprecated Team color pools removed — QP is FFA only, private teams use SLOT_COLORS by join order */

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

export type GameMode = 'private' | 'quickplay';

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
  /** Ready states for lobby: playerId → ready (bots always considered ready) */
  readyStates: Map<string, boolean>;
  /** Turn mode: sequential (one at a time) or simultaneous (all at once) */
  turnMode: 'sequential' | 'simultaneous';
  /** Simultaneous mode: current round number (0 = not started) */
  roundNumber: number;
  /** Simultaneous mode: locked salvos per player (playerId → coords) */
  lockedSalvos: Map<string, string[]>;
  /** Simultaneous mode: deadline timestamp for current round lock-in */
  lockDeadline: number | null;
  /** Simultaneous mode: frozen list of living player IDs at round start */
  roundParticipants: string[];
  /** Simultaneous mode: frozen shot counts per player at round start */
  roundShotCounts: Map<string, number>;
  /** Simultaneous mode: current round phase */
  roundPhase: 'open' | 'resolving' | null;
}

export interface PlayerGameStats {
  shotsFired: number;
  hitsLanded: number;       // hits on OTHER players' ships
  shipsSunk: number;        // other players' ships this player sunk
  friendlyFireHits: number; // hits on OWN ships
  turnsTaken: number;
}

export const SHIP_LENGTHS = [2, 3, 4] as const;
export const SHIP_NAMES: Record<number, string> = {
  2: 'Destroyer',
  3: 'Cruiser',
  4: 'Dreadnought',
};

/** Default ring counts per game mode */
export const MODE_RINGS: Record<string, number> = {
  'private': 5,
  'quickplay': 6,   // 6-player FFA always uses 6 rings
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
  turnMode: 'sequential' | 'simultaneous';
  roundNumber: number;
  lockedPlayerIds: string[];
  roundPhase: 'open' | 'resolving' | null;
  lockDeadline: number | null;
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

// --- Party Types ---

// --- Lobby Capabilities ---

export interface LobbyCapabilities {
  canChangeOptions: boolean;
  canAddBot: boolean;
  canKick: boolean;
  canMoveToSlot: boolean;
  canRequestSwap: boolean;
  canToggleReady: boolean;
  canStart: boolean;
  canTransferHost: boolean;
  allPlayersReady: boolean;
  isReady: boolean;
  readyStates: Record<string, boolean>;
}

export type PartyErrorReason =
  | 'already-in-party'
  | 'in-game'
  | 'party-full'
  | 'invalid-code'
  | 'not-leader'
  | 'members-in-game'
  | 'rate-limited'
  | 'not-in-party'
  | 'target-party-queued';

export const PARTY_ERROR_MESSAGES: Record<PartyErrorReason, string> = {
  'already-in-party': "You're already in a party",
  'in-game': "Can't join a party while in a game",
  'party-full': 'Party is full (max 3 players)',
  'invalid-code': 'Invalid party code',
  'not-leader': 'Only the party leader can do that',
  'members-in-game': "Can't disband while members are in a game",
  'rate-limited': 'Please wait before creating another party',
  'not-in-party': "You're not in a party",
  'target-party-queued': 'That party is currently in matchmaking',
};

export interface WirePartyMember {
  displayId: string;    // opaque per-party ID (NOT guestId — guestId is a credential)
  name: string | null;
  joinedAt: number;
}

export interface PartyStatePayload {
  partyId: string;
  code: string;
  leaderId: string;    // matches a member's displayId
  members: WirePartyMember[];
}

// --- Queue error reasons ---

export type QueueErrorReason =
  | 'not-leader'
  | 'already-queued'
  | 'member-disconnected'
  | 'in-game'
  | 'in-party';

export const QUEUE_ERROR_MESSAGES: Record<QueueErrorReason, string> = {
  'not-leader': 'Only the party leader can start or cancel matchmaking',
  'already-queued': "You're already in a queue",
  'member-disconnected': 'A party member is disconnected',
  'in-game': "Can't queue while in a game",
  'in-party': 'Parties can only play private games. Create a private game instead.',
};

// --- Ship placement input ---

export interface ShipPlacement {
  length: number;
  cells: string[];
}

// --- Socket Events ---

export interface GameCountData {
  total: number;
  searching: number;
}

export interface ClientToServerEvents {
  'create-game': (data: { playerName: string }) => void;
  'update-game-options': (data: { gameType?: 'ffa' | '2-team' | '3-team'; timerSeconds?: number | null; rings?: number; islandCount?: number; turnMode?: 'sequential' | 'simultaneous' }) => void;
  'join-game': (data: { code: string; playerName: string }) => void;
  'start-game': (data?: { force?: boolean }) => void;
  'add-bot': (data: { difficulty: AiDifficulty; team?: string; slotIndex?: number }) => void;
  'remove-bot': (data: { botId: string }) => void;
  'place-ships': (data: { ships: ShipPlacement[] }) => void;
  'fire': (data: { coords: string[] }) => void;
  'chat-message': (data: { text: string; channel?: ChatChannel }) => void;
  'swap-team': (data: { targetPlayerId: string }) => void;
  'swap-players': (data: { playerA: string; playerB: string }) => void;
  'move-to-slot': (data: { slotIndex: number }) => void;
  'placement-preview': (data: { ships: ShipPlacement[] }) => void;
  'rematch-request': () => void;
  'rematch-decline': () => void;
  'quickplay-join': (data: { playerName: string }) => void;
  'lock-salvo': (data: { coords: string[] }) => void;
  'quickplay-leave': () => void;
  'surrender': () => void;
  'leave-game': () => void;
  // Lobby events (Sprint 1d)
  'toggle-ready': () => void;
  'request-swap': (data: { targetPlayerId: string }) => void;
  'respond-swap': (data: { requesterId: string; accept: boolean }) => void;
  'kick-player': (data: { targetPlayerId: string }) => void;
  'transfer-host': (data: { targetPlayerId: string }) => void;
  'return-to-lobby': () => void;
  // Party events
  'create-party': () => void;
  'join-party': (data: { code: string }) => void;
  'leave-party': () => void;
  'disband-party': () => void;
}

export interface ServerToClientEvents {
  'error': (data: { message: string }) => void;
  'game-created': (data: { code: string; playerId: string; gameId: string }) => void;
  'player-joined': (data: { game: WireGame; capabilities?: LobbyCapabilities }) => void;
  'placement-phase': (data: { game: WireGame; placementDeadline?: number }) => void;
  'all-ready': (data: { game: WireGame }) => void;
  'your-turn': (data: { shotCount: number; timerSeconds: number | null }) => void;
  'turn-timeout': (data: { playerId: string }) => void;
  'shot-results': (data: { shooterId: string; shooterName: string; shots: ShotResult[]; game: WireGame }) => void;
  'player-eliminated': (data: { playerId: string; playerName: string; reason: 'surrender' | 'sunk' }) => void;
  'game-over': (data: GameOverStats) => void;
  'game-state': (data: { game: WireGame; capabilities?: LobbyCapabilities }) => void;
  'chat-message': (data: ChatMessage) => void;
  'player-disconnected': (data: { playerId: string; playerName: string }) => void;
  'teammate-placement-preview': (data: { ships: ShipPlacement[] }) => void;
  'player-reconnected': (data: { playerId: string; playerName: string }) => void;
  'rematch-pending': (data: { acceptedIds: string[]; totalHumans: number }) => void;
  'rematch-starting': (data: { game: WireGame; placementDeadline?: number }) => void;
  'rematch-declined': (data: { playerName: string; code: string; game: WireGame }) => void;
  'quickplay-queue-update': (data: { size: number; ticketCount: number; target: number }) => void;
  'quickplay-matched': (data: { playerId: string; gameId: string }) => void;
  'round-start': (data: { roundNumber: number; shotCount: number; timerSeconds: number | null; livingPlayerIds: string[] }) => void;
  'player-locked': (data: { playerId: string }) => void;
  'round-results': (data: { salvos: { shooterId: string; shooterName: string; shots: ShotResult[] }[]; game: WireGame }) => void;
  'party-queue-cancelled': () => void;
  'queue-error': (data: { reason: QueueErrorReason }) => void;
  'online-count': (data: { count: number }) => void;
  'surrender-ack': () => void;
  'left-game': () => void;
  'tab-evicted': () => void;
  'guest-id-assigned': (data: { guestId: string }) => void;
  // Lobby events (Sprint 1d)
  'swap-requested': (data: { requesterId: string; requesterName: string }) => void;
  'swap-declined': (data: { targetId: string; targetName: string }) => void;
  'player-kicked': (data: { reason: string }) => void;
  'start-countdown': (data: { deadline: number }) => void;
  'start-countdown-cancelled': () => void;
  // Party events
  'party-created': (data: PartyStatePayload) => void;
  'party-joined': (data: PartyStatePayload) => void;
  'party-updated': (data: PartyStatePayload) => void;
  'party-left': () => void;
  'party-disbanded': () => void;
  'party-error': (data: { reason: PartyErrorReason }) => void;
  'party-leader-disconnected': () => void;
  'party-leader-reconnected': () => void;
}

// --- Helpers ---

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
