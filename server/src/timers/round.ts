// Round timer for simultaneous mode
import type { Game } from '@salvo/shared';

const roundTimers = new Map<string, ReturnType<typeof setTimeout>>();

// Set via registerRoundTimerCallbacks to avoid circular imports
let _checkAndResolveRound: ((gameId: string) => void) | null = null;
let _getGame: ((gameId: string) => Game | undefined) | null = null;
let _lockPlayerSalvo: ((game: Game, playerId: string, coords: string[]) => void) | null = null;

export function registerRoundTimerCallbacks(deps: {
  checkAndResolveRound: (gameId: string) => void;
  getGame: (gameId: string) => Game | undefined;
  lockPlayerSalvo: (game: Game, playerId: string, coords: string[]) => void;
}): void {
  _checkAndResolveRound = deps.checkAndResolveRound;
  _getGame = deps.getGame;
  _lockPlayerSalvo = deps.lockPlayerSalvo;
}

export function startRoundTimer(gameId: string, seconds: number): void {
  clearRoundTimer(gameId);
  const timer = setTimeout(() => handleRoundTimeout(gameId), seconds * 1000);
  roundTimers.set(gameId, timer);
}

export function clearRoundTimer(gameId: string): void {
  const timer = roundTimers.get(gameId);
  if (timer) {
    clearTimeout(timer);
    roundTimers.delete(gameId);
  }
}

function handleRoundTimeout(gameId: string): void {
  roundTimers.delete(gameId);
  if (!_getGame || !_lockPlayerSalvo || !_checkAndResolveRound) return;
  const game = _getGame(gameId);
  if (!game || game.phase !== 'playing') return;
  if (game.turnMode !== 'simultaneous' || game.roundPhase !== 'open') return;

  // Auto-lock all unlocked participants with empty salvos
  for (const pid of game.roundParticipants) {
    if (!game.lockedSalvos.has(pid)) {
      _lockPlayerSalvo(game, pid, []);
    }
  }
  _checkAndResolveRound(gameId);
}
