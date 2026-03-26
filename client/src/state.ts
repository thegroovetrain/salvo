import type {
  WireGame, ShipPlacement, ChatMessage,
  GameOverStats, QuickPlayMode, ChatChannel, ShotResult,
} from '@salvo/shared';

export type Screen = 'lobby' | 'waiting' | 'placement' | 'battle' | 'gameover' | 'changelog' | 'queue';

export interface ShotLogEntry {
  shooterId: string;
  shooterName: string;
  shots: ShotResult[];
}

export interface AppState {
  screen: Screen;
  playerId: string | null;
  gameId: string | null;
  joinCode: string | null;
  game: WireGame | null;
  isHost: boolean;
  // Placement
  placedShips: ShipPlacement[];
  placingShip: { length: number; dirIndex: number } | null;
  ghostCells: string[];
  ghostValid: boolean;
  shipsSent: boolean;
  teammateGhostShips: ShipPlacement[];
  placementTimerSeconds: number | null;
  placementTimerInterval: ReturnType<typeof setInterval> | null;
  // Battle
  selectedTargets: string[];
  isMyTurn: boolean;
  shotLog: ShotLogEntry[];
  timerSeconds: number | null;
  timerInterval: ReturnType<typeof setInterval> | null;
  // Chat
  chatMessages: ChatMessage[];
  chatChannel: ChatChannel;
  // Game over
  gameOverStats: GameOverStats | null;
  rematchPending: { acceptedIds: string[]; totalHumans: number } | null;
  // Changelog
  changelogHtml: string | null;
  // UI
  showJoinModal: boolean;
  // Saved form values
  savedPlayerName: string;
  // Quick Play
  queueMode: QuickPlayMode | null;
  queueSize: number;
  onlineCount: number;
  matchSoundMuted: boolean;
  // Lobby dropdown
  openDropdownId: string | null;
  // Surrender
  showSurrenderModal: boolean;
  // Error
  errorMessage: string | null;
  errorTimeout: ReturnType<typeof setTimeout> | null;
  // Info notification
  infoMessage: string | null;
  infoMessageTimeout: ReturnType<typeof setTimeout> | null;
}

// Mutable singleton — all modules import this directly.
// Dynamic initialization (localStorage, generateRandomName) happens in main.ts.
export const state: AppState = {
  screen: 'lobby',
  playerId: null,
  gameId: null,
  joinCode: null,
  game: null,
  isHost: false,
  placedShips: [],
  placingShip: null,
  ghostCells: [],
  ghostValid: false,
  shipsSent: false,
  teammateGhostShips: [],
  placementTimerSeconds: null,
  placementTimerInterval: null,
  selectedTargets: [],
  isMyTurn: false,
  shotLog: [],
  timerSeconds: null,
  timerInterval: null,
  chatMessages: [],
  chatChannel: 'global',
  gameOverStats: null,
  rematchPending: null,
  changelogHtml: null,
  showJoinModal: false,
  savedPlayerName: '',  // initialized in main.ts
  queueMode: null,
  queueSize: 0,
  onlineCount: 0,
  matchSoundMuted: false,  // initialized in main.ts
  openDropdownId: null as string | null,
  showSurrenderModal: false,
  errorMessage: null,
  errorTimeout: null,
  infoMessage: null,
  infoMessageTimeout: null,
};
