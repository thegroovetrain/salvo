import {
  type Game, type Player, type Ship, type ShipPlacement,
  type ShotResult, type WireGame, type WirePlayer, type WireShip,
  type TimerConfig, type GameOverStats, type AiDifficulty,
  isShipSunk, isPlayerAlive, playerShotCount,
  SHIP_LENGTHS, SHIP_NAMES, GRID_SIZE, ROWS, AI_NAMES,
} from '@salvo/shared';
import crypto from 'node:crypto';

// ============================================================
// Game Creation
// ============================================================

export function createGame(hostId: string, hostName: string, timerConfig: TimerConfig): Game {
  const player: Player = { id: hostId, name: hostName, ships: [], isBot: false, aiDifficulty: null };
  const players = new Map<string, Player>();
  players.set(hostId, player);

  return {
    id: crypto.randomUUID(),
    phase: 'lobby',
    players,
    hostId,
    turnOrder: [],
    currentTurnIndex: 0,
    gridSize: 10,
    shots: new Set(),
    timerConfig,
    lastActivity: Date.now(),
  };
}

// ============================================================
// Player Management
// ============================================================

export function addPlayer(game: Game, playerId: string, playerName: string): string | null {
  if (game.phase !== 'lobby') return 'Game is not in lobby phase';
  if (game.players.size >= 4) return 'Game is full (4 players max)';
  if (game.players.has(playerId)) return 'Already in this game';

  game.players.set(playerId, { id: playerId, name: playerName, ships: [], isBot: false, aiDifficulty: null });
  game.lastActivity = Date.now();
  return null; // success
}

export function addBot(game: Game, difficulty: AiDifficulty): { botId: string } | { error: string } {
  if (game.phase !== 'lobby') return { error: 'Game is not in lobby phase' };
  if (game.players.size >= 4) return { error: 'Game is full (4 players max)' };

  const botId = `bot-${crypto.randomUUID().slice(0, 8)}`;
  const name = AI_NAMES[difficulty];
  game.players.set(botId, { id: botId, name, ships: [], isBot: true, aiDifficulty: difficulty });
  game.lastActivity = Date.now();
  return { botId };
}

export function removeBot(game: Game, botId: string): string | null {
  if (game.phase !== 'lobby') return 'Game is not in lobby phase';
  const player = game.players.get(botId);
  if (!player || !player.isBot) return 'Player is not a bot';
  game.players.delete(botId);
  game.lastActivity = Date.now();
  return null;
}

export function canStartGame(game: Game, requesterId: string): string | null {
  if (game.phase !== 'lobby') return 'Game is not in lobby phase';
  if (requesterId !== game.hostId) return 'Only the host can start the game';
  if (game.players.size < 2) return 'Need at least 2 players';
  return null;
}

export function startGame(game: Game): void {
  game.phase = 'placement';
  game.lastActivity = Date.now();
}

// ============================================================
// Ship Placement Validation
// ============================================================

function parseCoord(coord: string): { row: number; col: number } | null {
  if (coord.length < 2 || coord.length > 3) return null;
  const rowChar = coord[0].toUpperCase();
  const rowIndex = ROWS.indexOf(rowChar);
  if (rowIndex === -1) return null;
  const col = parseInt(coord.slice(1), 10);
  if (isNaN(col) || col < 1 || col > GRID_SIZE) return null;
  return { row: rowIndex, col: col - 1 };
}

function validateShipCells(cells: string[], expectedLength: number): string | null {
  if (cells.length !== expectedLength) {
    return `Ship should have ${expectedLength} cells, got ${cells.length}`;
  }

  const parsed = cells.map(parseCoord);
  if (parsed.some(p => p === null)) return 'Invalid coordinate';

  const coords = parsed as { row: number; col: number }[];

  // Check if cells form a straight horizontal or vertical line
  const allSameRow = coords.every(c => c.row === coords[0].row);
  const allSameCol = coords.every(c => c.col === coords[0].col);
  if (!allSameRow && !allSameCol) return 'Ship must be horizontal or vertical';

  // Check cells are contiguous
  if (allSameRow) {
    const cols = coords.map(c => c.col).sort((a, b) => a - b);
    for (let i = 1; i < cols.length; i++) {
      if (cols[i] !== cols[i - 1] + 1) return 'Ship cells must be contiguous';
    }
  } else {
    const rows = coords.map(c => c.row).sort((a, b) => a - b);
    for (let i = 1; i < rows.length; i++) {
      if (rows[i] !== rows[i - 1] + 1) return 'Ship cells must be contiguous';
    }
  }

  return null;
}

export function validatePlacement(placements: ShipPlacement[]): string | null {
  // Must have exactly one ship of each required length
  const requiredLengths = [...SHIP_LENGTHS].sort();
  const providedLengths = placements.map(p => p.length).sort();
  if (providedLengths.length !== requiredLengths.length) {
    return `Must place exactly ${requiredLengths.length} ships`;
  }
  for (let i = 0; i < requiredLengths.length; i++) {
    if (providedLengths[i] !== requiredLengths[i]) {
      return `Missing ship of length ${requiredLengths[i]}`;
    }
  }

  // Validate each ship's cells
  for (const placement of placements) {
    const err = validateShipCells(placement.cells, placement.length);
    if (err) return `${SHIP_NAMES[placement.length]}: ${err}`;
  }

  // Check for overlapping cells between player's own ships
  const allCells = new Set<string>();
  for (const placement of placements) {
    for (const cell of placement.cells) {
      const normalized = cell[0].toUpperCase() + cell.slice(1);
      if (allCells.has(normalized)) return `Overlapping ships at ${normalized}`;
      allCells.add(normalized);
    }
  }

  return null;
}

export function placeShips(game: Game, playerId: string, placements: ShipPlacement[]): string | null {
  if (game.phase !== 'placement') return 'Game is not in placement phase';
  const player = game.players.get(playerId);
  if (!player) return 'Player not in game';
  if (player.ships.length > 0) return 'Ships already placed';

  const err = validatePlacement(placements);
  if (err) return err;

  player.ships = placements.map((p): Ship => ({
    length: p.length,
    cells: p.cells.map((c: string) => c[0].toUpperCase() + c.slice(1)),
    hits: new Set<string>(),
  }));

  game.lastActivity = Date.now();
  return null;
}

export function allShipsPlaced(game: Game): boolean {
  for (const player of game.players.values()) {
    if (player.ships.length === 0) return false;
  }
  return true;
}

export function beginPlaying(game: Game): void {
  // Randomize turn order
  const ids = [...game.players.keys()];
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  game.turnOrder = ids;
  game.currentTurnIndex = 0;
  game.phase = 'playing';
  game.lastActivity = Date.now();
}

// ============================================================
// Shot Resolution (Atomic)
// ============================================================

export function getCurrentTurnPlayerId(game: Game): string | null {
  if (game.phase !== 'playing') return null;
  return game.turnOrder[game.currentTurnIndex] ?? null;
}

export function validateSalvo(game: Game, playerId: string, coords: string[]): string | null {
  if (game.phase !== 'playing') return 'Game is not in playing phase';

  const currentPlayer = getCurrentTurnPlayerId(game);
  if (currentPlayer !== playerId) return 'Not your turn';

  const player = game.players.get(playerId);
  if (!player) return 'Player not in game';
  if (!isPlayerAlive(player)) return 'You are eliminated';

  const expectedShots = playerShotCount(player);
  if (coords.length !== expectedShots) {
    return `Must fire exactly ${expectedShots} shots, got ${coords.length}`;
  }

  // Validate each coordinate
  for (const coord of coords) {
    if (!parseCoord(coord)) return `Invalid coordinate: ${coord}`;
    const normalized = coord[0].toUpperCase() + coord.slice(1);
    if (game.shots.has(normalized)) return `Already shot at ${normalized}`;
  }

  // Check for duplicates within the salvo
  const normalized = coords.map(c => c[0].toUpperCase() + c.slice(1));
  if (new Set(normalized).size !== normalized.length) {
    return 'Duplicate coordinates in salvo';
  }

  return null;
}

export function fireSalvo(game: Game, playerId: string, coords: string[]): ShotResult[] {
  const results: ShotResult[] = [];
  const normalizedCoords = coords.map(c => c[0].toUpperCase() + c.slice(1));

  // Phase 1: Resolve all shots atomically (don't check alive mid-salvo)
  for (const coord of normalizedCoords) {
    game.shots.add(coord);

    const shotResult: ShotResult = { coord, hits: [], miss: true };

    for (const player of game.players.values()) {
      for (const ship of player.ships) {
        if (ship.cells.includes(coord) && !ship.hits.has(coord)) {
          ship.hits.add(coord);
          const sunk = isShipSunk(ship);
          shotResult.hits.push({
            playerId: player.id,
            playerName: player.name,
            sunk,
            shipLength: ship.length,
            sunkShipCells: sunk ? [...ship.cells] : null,
          });
          shotResult.miss = false;
        }
      }
    }

    results.push(shotResult);
  }

  game.lastActivity = Date.now();
  return results;
}

// ============================================================
// Turn Management
// ============================================================

export function advanceTurn(game: Game): void {
  if (game.phase !== 'playing') return;

  // Find next alive player
  const numPlayers = game.turnOrder.length;
  let nextIndex = (game.currentTurnIndex + 1) % numPlayers;
  let checked = 0;

  while (checked < numPlayers) {
    const nextPlayerId = game.turnOrder[nextIndex];
    const nextPlayer = game.players.get(nextPlayerId);
    if (nextPlayer && isPlayerAlive(nextPlayer)) {
      game.currentTurnIndex = nextIndex;
      return;
    }
    nextIndex = (nextIndex + 1) % numPlayers;
    checked++;
  }
}

export function checkGameOver(game: Game): GameOverStats | null {
  if (game.phase !== 'playing') return null;

  const alivePlayers = [...game.players.values()].filter(isPlayerAlive);

  if (alivePlayers.length > 1) return null;

  game.phase = 'finished';
  game.lastActivity = Date.now();

  const winnerId = alivePlayers.length === 1 ? alivePlayers[0].id : null;
  return computeGameOverStats(game, winnerId);
}

function computeGameOverStats(game: Game, winnerId: string | null): GameOverStats {
  // We track stats from shot results. For now, compute from game state.
  // This is a simplified version — the full tracking would accumulate during play.
  const playerStats: GameOverStats['playerStats'] = {};

  for (const player of game.players.values()) {
    playerStats[player.id] = {
      shotsFired: 0,
      hitsLanded: 0,
      shipsSunk: 0,
      friendlyFireIncidents: 0,
    };
  }

  // Count hits on each player's ships
  for (const player of game.players.values()) {
    for (const ship of player.ships) {
      if (isShipSunk(ship)) {
        // We don't track WHO sunk it in this simplified version
        // Full tracking would require accumulating during fireSalvo
      }
    }
  }

  // Generate highlights
  const highlights: string[] = [];
  if (winnerId) {
    const winner = game.players.get(winnerId);
    if (winner) {
      highlights.push(`Winner: ${winner.name}`);
    }
  } else {
    highlights.push('Draw — all players eliminated!');
  }

  return { winnerId, playerStats, highlights };
}

// ============================================================
// Forfeit (disconnect timeout)
// ============================================================

export function forfeitPlayer(game: Game, playerId: string): void {
  const player = game.players.get(playerId);
  if (!player) return;

  // Sink all ships
  for (const ship of player.ships) {
    for (const cell of ship.cells) {
      ship.hits.add(cell);
    }
  }

  game.lastActivity = Date.now();
}

// ============================================================
// Reset for Rematch
// ============================================================

export function resetForRematch(game: Game): void {
  game.phase = 'placement';
  game.shots = new Set();
  game.turnOrder = [];
  game.currentTurnIndex = 0;
  game.lastActivity = Date.now();

  for (const player of game.players.values()) {
    player.ships = [];
  }
}

// ============================================================
// Serialization — toClientView
//
// SECURITY: This is the single chokepoint for all outbound state.
// Each player only sees their own ship positions.
// Other players' ships are visible only as hit/sunk info via ShotResults.
// ============================================================

function serializeShipForOwner(ship: Ship): WireShip {
  return {
    length: ship.length,
    cells: [...ship.cells],
    hits: [...ship.hits],
    sunk: isShipSunk(ship),
  };
}

function serializeShipForOthers(ship: Ship): WireShip {
  return {
    length: ship.length,
    cells: [],     // NEVER reveal positions
    hits: [],      // hits are communicated via ShotResult events
    sunk: isShipSunk(ship),
  };
}

function serializeShipForEliminated(_ship: Ship): WireShip {
  // Eliminated players' ships: sunk is always true,
  // cells are known because every cell was hit (and revealed via ShotResults)
  return {
    length: _ship.length,
    cells: [],     // Still don't leak — clients reconstruct from shot history
    hits: [..._ship.hits],
    sunk: true,
  };
}

function serializePlayer(player: Player, isOwner: boolean): WirePlayer {
  const alive = isPlayerAlive(player);
  return {
    id: player.id,
    name: player.name,
    ships: player.ships.map((s: Ship) =>
      isOwner ? serializeShipForOwner(s) :
      !alive ? serializeShipForEliminated(s) :
      serializeShipForOthers(s)
    ),
    alive,
    shotCount: playerShotCount(player),
    isBot: player.isBot,
    aiDifficulty: player.aiDifficulty,
  };
}

export function toClientView(game: Game, viewerId: string): WireGame {
  const players: Record<string, WirePlayer> = {};
  for (const [id, player] of game.players) {
    players[id] = serializePlayer(player, id === viewerId);
  }

  return {
    id: game.id,
    phase: game.phase,
    players,
    turnOrder: game.turnOrder,
    currentTurnIndex: game.currentTurnIndex,
    gridSize: game.gridSize,
    shots: [...game.shots],
    timerConfig: game.timerConfig,
  };
}
