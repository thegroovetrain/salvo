import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents, ChatMessage, ChatChannel, ShipPlacement, Game, Player } from '@salvo/shared';
import { getTeammates, SLOT_COLORS } from '@salvo/shared';
import { getLobby, getConnections, emitToPlayer, broadcastToGame, emitGameState } from '../emitters.js';
import { clearLobbyCountdown, hasLobbyCountdown } from './lobby.js';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;

function getTeamNames(game: Game): string[] {
  return game.gameType === '3-team'
    ? ['alpha', 'bravo', 'charlie']
    : ['alpha', 'bravo'];
}

function assignNewTeamColor(game: Game, targetPlayer: Player, nextTeam: string, teamNames: string[]): void {
  const slotsPerTeam = Math.floor(6 / teamNames.length);
  const teamStartSlot = teamNames.indexOf(nextTeam) * slotsPerTeam;
  const usedColors = new Set([...game.players.values()].map(p => p.color));
  usedColors.delete(targetPlayer.color);
  for (let i = teamStartSlot; i < teamStartSlot + slotsPerTeam; i++) {
    if (!usedColors.has(SLOT_COLORS[i])) {
      targetPlayer.color = SLOT_COLORS[i];
      break;
    }
  }
}

// ============================================================
// Swap Request State
// ============================================================

// Key: "requesterId:targetId" → timer for auto-decline
const pendingSwaps = new Map<string, NodeJS.Timeout>();

function clearPendingSwap(key: string): void {
  const timer = pendingSwaps.get(key);
  if (timer) clearTimeout(timer);
  pendingSwaps.delete(key);
}

function findPendingSwapForTarget(targetId: string): string | undefined {
  for (const key of pendingSwaps.keys()) {
    if (key.endsWith(`:${targetId}`)) return key;
  }
  return undefined;
}

/** Clear all pending swap requests for a game (called on player leave/kick) */
export function clearSwapsForGame(game: Game): void {
  for (const key of [...pendingSwaps.keys()]) {
    const [reqId, tgtId] = key.split(':');
    if (game.players.has(reqId) || game.players.has(tgtId)) {
      clearPendingSwap(key);
    }
  }
}

/** Clear all pending swap requests involving a specific player */
export function clearSwapsForPlayer(playerId: string): void {
  for (const key of [...pendingSwaps.keys()]) {
    if (key.startsWith(`${playerId}:`) || key.endsWith(`:${playerId}`)) {
      clearPendingSwap(key);
    }
  }
}

const COORD_PATTERN = /^-?\d+,-?\d+$/;

function isValidPreviewShip(ship: ShipPlacement): boolean {
  if (typeof ship.length !== 'number' || ship.length < 1 || ship.length > 4) return false;
  if (!Array.isArray(ship.cells)) return false;
  return ship.cells.every(cell => typeof cell === 'string' && COORD_PATTERN.test(cell));
}

function isValidPlacementPreview(ships: ShipPlacement[]): boolean {
  if (!Array.isArray(ships) || ships.length > 4) return false;
  return ships.every(isValidPreviewShip);
}

function executeSwapPlayers(game: Game, playerA: string, playerB: string): boolean {
  const pA = game.players.get(playerA);
  const pB = game.players.get(playerB);
  if (!pA || !pB) return false;

  // FFA: just swap colors (slot positions)
  if (!game.teamsEnabled) {
    const colorA = pA.color;
    pA.color = pB.color;
    pB.color = colorA;
    return true;
  }

  const teamA = game.teams.get(playerA);
  const teamB = game.teams.get(playerB);
  if (!teamA || !teamB) return false;
  if (teamA === teamB) return false;

  game.teams.set(playerA, teamB);
  game.teams.set(playerB, teamA);
  const colorA = pA.color;
  pA.color = pB.color;
  pB.color = colorA;
  return true;
}

export function registerSocialHandlers(io: IO, socket: Socket<ClientToServerEvents, ServerToClientEvents>): void {
  const lobby = getLobby();
  const connections = getConnections();

  // ============================================================
  // Chat — channel routing
  // ============================================================

  socket.on('chat-message', ({ text, channel: rawChannel }: { text: string; channel?: ChatChannel }) => {
    const playerId = connections.getPlayerIdBySocket(socket.id);
    if (!playerId) return;

    const game = lobby.getGameByPlayer(playerId);
    if (!game) return;

    const player = game.players.get(playerId);
    if (!player) return;

    // Force global in lobby or when teams disabled
    const useTeam = rawChannel === 'team' && game.teamsEnabled && game.phase !== 'lobby';
    const channel: ChatChannel = useTeam ? 'team' : 'global';

    const message: ChatMessage = {
      playerId,
      playerName: player.name,
      text: text.slice(0, 200),
      timestamp: Date.now(),
      channel,
    };

    if (useTeam) {
      emitToPlayer(playerId, 'chat-message', message);
      for (const teammateId of getTeammates(game, playerId)) {
        emitToPlayer(teammateId, 'chat-message', message);
      }
    } else {
      broadcastToGame(game.id, 'chat-message', message);
    }
  });

  // ============================================================
  // Swap Team (lobby phase, host only)
  // ============================================================

  socket.on('swap-team', ({ targetPlayerId }: { targetPlayerId: string }) => {
    const playerId = connections.getPlayerIdBySocket(socket.id);
    if (!playerId) return;

    const game = lobby.getGameByPlayer(playerId);
    if (!game) return;

    if (game.phase !== 'lobby') return;
    if (game.hostId !== playerId && targetPlayerId !== playerId) return;

    const targetPlayer = game.players.get(targetPlayerId);
    if (!targetPlayer) return;

    const teamNames = getTeamNames(game);
    const currentTeam = game.teams.get(targetPlayerId);
    const currentIdx = currentTeam ? teamNames.indexOf(currentTeam) : -1;
    const nextTeam = teamNames[(currentIdx + 1) % teamNames.length];
    game.teams.set(targetPlayerId, nextTeam);

    assignNewTeamColor(game, targetPlayer, nextTeam, teamNames);
    if (hasLobbyCountdown(game.id)) clearLobbyCountdown(game.id);
    emitGameState(game.id);
  });

  // ============================================================
  // Swap Players (lobby phase, host only — atomic team swap)
  // ============================================================

  socket.on('swap-players', ({ playerA, playerB }: { playerA: string; playerB: string }) => {
    const playerId = connections.getPlayerIdBySocket(socket.id);
    if (!playerId) return;

    const game = lobby.getGameByPlayer(playerId);
    if (!game) return;
    if (game.phase !== 'lobby' || game.hostId !== playerId) return;
    if (playerA === playerB) return;

    if (executeSwapPlayers(game, playerA, playerB)) {
      if (hasLobbyCountdown(game.id)) clearLobbyCountdown(game.id);
      emitGameState(game.id);
    }
  });

  // ============================================================
  // Move to Slot (lobby phase, any player)
  // ============================================================

  socket.on('move-to-slot', ({ slotIndex }: { slotIndex: number }) => {
    const playerId = connections.getPlayerIdBySocket(socket.id);
    if (!playerId) return;

    const game = lobby.getGameByPlayer(playerId);
    if (!game || game.phase !== 'lobby') return;

    if (slotIndex < 0 || slotIndex >= 6) return;
    const targetColor = SLOT_COLORS[slotIndex];

    // Check slot is not already occupied
    const occupied = [...game.players.values()].some(p => p.color === targetColor);
    if (occupied) return;

    const player = game.players.get(playerId);
    if (!player) return;

    // In team mode, update team assignment based on the slot's team range
    if (game.teamsEnabled) {
      const teamNames = getTeamNames(game);
      const slotsPerTeam = Math.floor(6 / teamNames.length);
      const newTeamIdx = Math.floor(slotIndex / slotsPerTeam);
      game.teams.set(playerId, teamNames[newTeamIdx]);
    }

    player.color = targetColor;
    if (hasLobbyCountdown(game.id)) clearLobbyCountdown(game.id);
    emitGameState(game.id);
  });

  // ============================================================
  // Placement Preview (team mode)
  // ============================================================

  socket.on('placement-preview', ({ ships }: { ships: ShipPlacement[] }) => {
    const playerId = connections.getPlayerIdBySocket(socket.id);
    if (!playerId) return;

    const game = lobby.getGameByPlayer(playerId);
    if (!game || game.phase !== 'placement' || !game.teamsEnabled) return;

    if (!isValidPlacementPreview(ships)) return;

    for (const teammateId of getTeammates(game, playerId)) {
      emitToPlayer(teammateId, 'teammate-placement-preview', { ships });
    }
  });

  // ============================================================
  // Swap Request System (lobby phase, any player)
  // ============================================================

  socket.on('request-swap', ({ targetPlayerId }: { targetPlayerId: string }) => {
    const playerId = connections.getPlayerIdBySocket(socket.id);
    if (!playerId) return;

    const game = lobby.getGameByPlayer(playerId);
    if (!game || game.phase !== 'lobby') return;
    if (playerId === targetPlayerId) return;

    const requester = game.players.get(playerId);
    const target = game.players.get(targetPlayerId);
    if (!requester || !target) return;

    // Bots auto-accept instantly
    if (target.isBot) {
      executeSwapPlayers(game, playerId, targetPlayerId);
      emitGameState(game.id);
      return;
    }

    // Check for crossed swap requests (mutual agreement → auto-accept)
    const crossedKey = `${targetPlayerId}:${playerId}`;
    if (pendingSwaps.has(crossedKey)) {
      clearPendingSwap(crossedKey);
      executeSwapPlayers(game, playerId, targetPlayerId);
      emitGameState(game.id);
      return;
    }

    // One pending request per target
    const existingKey = findPendingSwapForTarget(targetPlayerId);
    if (existingKey) {
      socket.emit('error', { message: 'That player already has a pending swap request' });
      return;
    }

    const swapKey = `${playerId}:${targetPlayerId}`;

    // Auto-decline after 15s
    const timer = setTimeout(() => {
      pendingSwaps.delete(swapKey);
      emitToPlayer(playerId, 'swap-declined', { targetId: targetPlayerId, targetName: target.name });
    }, 15_000);

    pendingSwaps.set(swapKey, timer);
    emitToPlayer(targetPlayerId, 'swap-requested', { requesterId: playerId, requesterName: requester.name });
  });

  socket.on('respond-swap', ({ requesterId, accept }: { requesterId: string; accept: boolean }) => {
    const playerId = connections.getPlayerIdBySocket(socket.id);
    if (!playerId) return;

    const swapKey = `${requesterId}:${playerId}`;
    if (!pendingSwaps.has(swapKey)) return; // no pending request

    clearPendingSwap(swapKey);

    const game = lobby.getGameByPlayer(playerId);
    if (!game || game.phase !== 'lobby') return;

    if (accept) {
      executeSwapPlayers(game, requesterId, playerId);

      // Cancel countdown if active (lobby state changed)
      if (hasLobbyCountdown(game.id)) {
        clearLobbyCountdown(game.id);
        broadcastToGame(game.id, 'start-countdown-cancelled', undefined);
      }

      emitGameState(game.id);
    } else {
      const target = game.players.get(playerId);
      emitToPlayer(requesterId, 'swap-declined', { targetId: playerId, targetName: target?.name ?? 'Player' });
    }
  });
}
