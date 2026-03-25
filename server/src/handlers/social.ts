import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents, ChatMessage, ChatChannel, ShipPlacement, Game, Player } from '@salvo/shared';
import { getTeammates, SLOT_COLORS } from '@salvo/shared';
import { getLobby, getConnections, emitToPlayer, broadcastToGame, emitGameState } from '../emitters.js';

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

    const channel: ChatChannel = rawChannel ?? 'global';

    const message: ChatMessage = {
      playerId,
      playerName: player.name,
      text: text.slice(0, 200), // limit message length
      timestamp: Date.now(),
      channel,
    };

    if (channel === 'team' && game.teamsEnabled) {
      // Team chat: emit to sender + all teammates
      emitToPlayer(playerId, 'chat-message', message);
      for (const teammateId of getTeammates(game, playerId)) {
        emitToPlayer(teammateId, 'chat-message', message);
      }
    } else {
      // Global chat (or team channel with teams disabled — fall back to global)
      if (channel === 'team' && !game.teamsEnabled) {
        message.channel = 'global';
      }
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
}
