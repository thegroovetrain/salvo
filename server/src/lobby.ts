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

  getActiveGameCounts(
    searching1v1 = 0, searching2v2 = 0,
    searching3v3 = 0, searching3ffa = 0, searching6ffa = 0, searching2v2v2 = 0,
  ): GameCountData {
    const modeCounts: Record<string, number> = {
      'quickplay-1v1': 0, 'quickplay-2v2': 0, 'quickplay-3v3': 0,
      'quickplay-3ffa': 0, 'quickplay-6ffa': 0, 'quickplay-2v2v2': 0,
    };

    for (const game of this.games.values()) {
      if (game.phase !== 'finished' && game.mode in modeCounts) {
        modeCounts[game.mode]++;
      }
    }

    const oneVsOne = modeCounts['quickplay-1v1'];
    const twoVsTwo = modeCounts['quickplay-2v2'];
    const threeVsThree = modeCounts['quickplay-3v3'];
    const threeFfa = modeCounts['quickplay-3ffa'];
    const sixFfa = modeCounts['quickplay-6ffa'];
    const twoVsTwoVsTwo = modeCounts['quickplay-2v2v2'];

    return {
      total: oneVsOne + twoVsTwo + threeVsThree + threeFfa + sixFfa + twoVsTwoVsTwo,
      oneVsOne, twoVsTwo, threeVsThree, threeFfa, sixFfa, twoVsTwoVsTwo,
      searching1v1, searching2v2, searching3v3, searching3ffa, searching6ffa, searching2v2v2,
    };
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
