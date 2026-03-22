import {
  type Game, type Player, type Ship, type ShipPlacement,
  type ShotResult, type WireGame, type WirePlayer, type WireShip,
  type TimerConfig, type GameOverStats, type AiDifficulty,
  isShipSunk, isPlayerAlive, playerShotCount,
  SHIP_LENGTHS, SHIP_NAMES, GRID_SIZE, ROWS, BOT_NAME_POOLS,
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
    rematchAccepted: new Set(),
    playerStats: new Map(),
    firstBloodId: null,
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

  // Pick a random unique name from the difficulty's pool
  const usedNames = new Set([...game.players.values()].map(p => p.name));
  const pool = BOT_NAME_POOLS[difficulty].filter(n => !usedNames.has(n));
  const name = pool.length > 0
    ? pool[Math.floor(Math.random() * pool.length)]
    : `Bot ${game.players.size}`; // fallback (shouldn't happen with 10 names and max 3 bots)

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

  // Initialize per-player stats
  game.playerStats = new Map();
  game.firstBloodId = null;
  for (const id of game.players.keys()) {
    game.playerStats.set(id, {
      shotsFired: 0,
      hitsLanded: 0,
      shipsSunk: 0,
      friendlyFireHits: 0,
      turnsTaken: 0,
    });
  }
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

  // Phase 2: Accumulate stats for the shooter
  const shooterStats = game.playerStats.get(playerId);
  if (shooterStats) {
    shooterStats.shotsFired += normalizedCoords.length;
    shooterStats.turnsTaken += 1;

    for (const result of results) {
      for (const hit of result.hits) {
        if (hit.playerId === playerId) {
          shooterStats.friendlyFireHits += 1;
        } else {
          shooterStats.hitsLanded += 1;
          if (game.firstBloodId === null) {
            game.firstBloodId = playerId;
          }
        }
        if (hit.sunk && hit.playerId !== playerId) {
          shooterStats.shipsSunk += 1;
        }
      }
    }
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
  const playerStats: GameOverStats['playerStats'] = {};

  for (const [id, player] of game.players) {
    const stats = game.playerStats.get(id);
    const shotsFired = stats?.shotsFired ?? 0;
    const hitsLanded = stats?.hitsLanded ?? 0;
    playerStats[id] = {
      shotsFired,
      hitsLanded,
      accuracy: shotsFired > 0 ? hitsLanded / shotsFired : 0,
      shipsSunk: stats?.shipsSunk ?? 0,
      friendlyFireHits: stats?.friendlyFireHits ?? 0,
      turnsTaken: stats?.turnsTaken ?? 0,
    };
  }

  // Generate highlights
  const highlights: string[] = [];
  const entries = [...game.players.entries()].map(([id, p]) => ({
    id, name: p.name, ...playerStats[id],
  }));

  // Sharpshooter — highest accuracy (min 3 shots to qualify)
  const qualified = entries.filter(e => e.shotsFired >= 3);
  if (qualified.length > 0) {
    const best = qualified.reduce((a, b) => a.accuracy > b.accuracy ? a : b);
    highlights.push(`Sharpshooter: ${best.name} (${Math.round(best.accuracy * 100)}% accuracy)`);
  }

  // Most Destructive — most ships sunk
  const mostSunk = entries.reduce((a, b) => a.shipsSunk > b.shipsSunk ? a : b);
  if (mostSunk.shipsSunk > 0) {
    highlights.push(`Most Destructive: ${mostSunk.name} (${mostSunk.shipsSunk} ships sunk)`);
  }

  // Friendly Fire Champion — most self-hits (only if someone actually did it)
  const mostFF = entries.reduce((a, b) => a.friendlyFireHits > b.friendlyFireHits ? a : b);
  if (mostFF.friendlyFireHits > 0) {
    highlights.push(`Friendly Fire Champion: ${mostFF.name} (${mostFF.friendlyFireHits} self-hits)`);
  }

  // First Blood
  if (game.firstBloodId) {
    const fbPlayer = game.players.get(game.firstBloodId);
    if (fbPlayer) {
      highlights.push(`First Blood: ${fbPlayer.name}`);
    }
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
  game.rematchAccepted = new Set();
  game.playerStats = new Map();
  game.firstBloodId = null;

  for (const player of game.players.values()) {
    player.ships = [];
  }
}

/** Remove a player and return remaining human count */
export function removePlayer(game: Game, playerId: string): void {
  game.players.delete(playerId);
  game.rematchAccepted.delete(playerId);
  // If host left, reassign to first remaining human
  if (game.hostId === playerId) {
    for (const p of game.players.values()) {
      if (!p.isBot) {
        game.hostId = p.id;
        break;
      }
    }
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
