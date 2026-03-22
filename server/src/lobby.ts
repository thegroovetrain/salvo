import type { Game } from '@salvo/shared';

// ============================================================
// Lobby Manager
// Manages active games, join codes, and cleanup.
// ============================================================

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I,O,0,1 to avoid confusion
const CODE_LENGTH = 4;

function generateCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

export class LobbyManager {
  // gameId → Game
  private games = new Map<string, Game>();
  // joinCode → gameId
  private codeToGame = new Map<string, string>();
  // playerId → gameId (for quick lookup)
  private playerToGame = new Map<string, string>();

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

  /**
   * Generate a unique join code (collision-safe).
   */
  generateUniqueCode(): string {
    let attempts = 0;
    while (attempts < 100) {
      const code = generateCode();
      if (!this.codeToGame.has(code)) return code;
      attempts++;
    }
    // Extremely unlikely — fall back to longer code
    return generateCode() + generateCode();
  }

  addGame(game: Game, code: string): void {
    this.games.set(game.id, game);
    this.codeToGame.set(code, game.id);
  }

  registerPlayer(playerId: string, gameId: string): void {
    this.playerToGame.set(playerId, gameId);
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
    // Remove code mapping
    for (const [code, id] of this.codeToGame) {
      if (id === gameId) {
        this.codeToGame.delete(code);
        break;
      }
    }
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
