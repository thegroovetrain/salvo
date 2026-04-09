import type { Game, GameCountData } from '@salvo/shared';
import { generateCode } from './joinCode.js';

// ============================================================
// Lobby Manager
// Manages active games, join codes, and cleanup.
// ============================================================

export class LobbyManager {
  // gameId → Game
  private games = new Map<string, Game>();
  // joinCode → gameId
  private codeToGame = new Map<string, string>();
  // playerId → gameId (for quick lookup)
  private playerToGame = new Map<string, string>();
  /** Injected global code generator (checks both party + game namespaces) */
  private globalCodeGen: (() => string) | null = null;

  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private readonly ABANDONED_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

  startCleanup(): void {
    this.cleanupInterval = setInterval(() => this.cleanupAbandoned(), 10 * 60 * 1000);
  }

  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  setCodeGenerator(fn: () => string): void {
    this.globalCodeGen = fn;
  }

  generateUniqueCode(): string {
    if (this.globalCodeGen) return this.globalCodeGen();
    // Fallback: game-only check (used in tests without full wiring)
    let attempts = 0;
    while (attempts < 100) {
      const code = generateCode();
      if (!this.codeToGame.has(code)) return code;
      attempts++;
    }
    return generateCode() + generateCode();
  }

  addGame(game: Game, code: string): void {
    this.games.set(game.id, game);
    this.codeToGame.set(code, game.id);
  }

  registerPlayer(playerId: string, gameId: string): void {
    this.playerToGame.set(playerId, gameId);
  }

  unregisterPlayer(playerId: string): void {
    this.playerToGame.delete(playerId);
  }

  get gameCount(): number {
    return this.games.size;
  }

  getGame(gameId: string): Game | undefined {
    return this.games.get(gameId);
  }

  getGameByCode(code: string): Game | undefined {
    const gameId = this.codeToGame.get(code.toUpperCase());
    if (!gameId) return undefined;
    return this.games.get(gameId);
  }

  getGameByPlayer(playerId: string): Game | undefined {
    const gameId = this.playerToGame.get(playerId);
    if (!gameId) return undefined;
    return this.games.get(gameId);
  }

  getCodeForGame(gameId: string): string | undefined {
    for (const [code, id] of this.codeToGame) {
      if (id === gameId) return code;
    }
    return undefined;
  }

  removeGame(gameId: string): void {
    const game = this.games.get(gameId);
    if (game) {
      for (const playerId of game.players.keys()) {
        this.playerToGame.delete(playerId);
      }
    }
    this.games.delete(gameId);
    for (const [code, id] of this.codeToGame) {
      if (id === gameId) {
        this.codeToGame.delete(code);
        break;
      }
    }
  }

  getActiveGameCounts(searching = 0): GameCountData {
    let total = 0;
    for (const game of this.games.values()) {
      if (game.phase !== 'finished' && game.mode === 'quickplay') {
        total++;
      }
    }
    return { total, searching };
  }

  private cleanupAbandoned(): void {
    const now = Date.now();
    for (const [gameId, game] of this.games) {
      if (now - game.lastActivity > this.ABANDONED_TIMEOUT_MS) {
        this.removeGame(gameId);
      }
    }
  }
}
