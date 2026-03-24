import {
  type Game, type Player, type Ship, type ShipPlacement,
  type ShotResult, type WireGame, type WirePlayer, type WireShip,
  type TimerConfig, type GameOverStats, type AiDifficulty, type GameMode,
  isShipSunk, isPlayerAlive, playerShotCount, getTeammates, isTeamAlive,
  SHIP_LENGTHS, SHIP_NAMES, BOT_NAME_POOLS, MODE_RINGS,
} from '@salvo/shared';
import {
  parseHex, isValidHex, allHexes, hexDistance, hexNeighborsInBounds, hexToString,
} from '@salvo/shared/hex';
import crypto from 'node:crypto';

// ============================================================
// Game Creation
// ============================================================

export function createGame(
  hostId: string,
  hostName: string,
  timerConfig: TimerConfig = { enabled: true, seconds: 60 },
  mode: GameMode = 'private',
  teamsEnabled: boolean = false,
  rings?: number,
): Game {
  const player: Player = { id: hostId, name: hostName, ships: [], isBot: false, aiDifficulty: null };
  const players = new Map<string, Player>();
  players.set(hostId, player);

  return {
    id: crypto.randomUUID(),
    phase: 'lobby',
    mode,
    players,
    hostId,
    turnOrder: [],
    currentTurnIndex: 0,
    rings: rings ?? MODE_RINGS[mode] ?? 5,
    islands: new Set(),
    shots: new Set(),
    timerConfig,
    lastActivity: Date.now(),
    rematchAccepted: new Set(),
    playerStats: new Map(),
    firstBloodId: null,
    teams: new Map(),
    teamsEnabled,
    gameType: teamsEnabled ? '2-team' : 'ffa',
    islandCount: 6,
  };
}

// ============================================================
// Game Options (lobby-phase updates)
// ============================================================

export type GameType = 'ffa' | '2-team' | '3-team';

export function updateGameOptions(
  game: Game,
  requesterId: string,
  options: { gameType?: GameType; timerSeconds?: number | null; rings?: number; islandCount?: number },
): string | null {
  if (game.phase !== 'lobby') return 'Game is not in lobby phase';
  if (game.hostId !== requesterId) return 'Only the host can change game options';

  if (options.gameType !== undefined) {
    const teamsEnabled = options.gameType !== 'ffa';
    game.teamsEnabled = teamsEnabled;
    game.gameType = options.gameType;

    if (teamsEnabled) {
      // Deterministic team names from host's choice
      const teamNames = options.gameType === '3-team'
        ? ['alpha', 'bravo', 'charlie']
        : ['alpha', 'bravo'];
      // Distribute players evenly across teams (round-robin)
      game.teams.clear();
      let teamIdx = 0;
      for (const playerId of game.players.keys()) {
        game.teams.set(playerId, teamNames[teamIdx % teamNames.length]);
        teamIdx++;
      }
    } else {
      game.teams.clear();
    }
  }

  if (options.timerSeconds !== undefined) {
    if (options.timerSeconds === null || options.timerSeconds === 0) {
      game.timerConfig = { enabled: false, seconds: 60 };
    } else {
      game.timerConfig = { enabled: true, seconds: options.timerSeconds };
    }
  }

  if (options.rings !== undefined) {
    if (options.rings >= 4 && options.rings <= 6) {
      game.rings = options.rings;
    }
  }

  if (options.islandCount !== undefined) {
    if (options.islandCount >= 0 && options.islandCount <= 8) {
      game.islandCount = options.islandCount;
    }
  }

  game.lastActivity = Date.now();
  return null;
}

// ============================================================
// Player Management
// ============================================================

export function addPlayer(game: Game, playerId: string, playerName: string): string | null {
  if (game.phase !== 'lobby') return 'Game is not in lobby phase';
  if (game.players.size >= 6) return 'Game is full (6 players max)';
  if (game.players.has(playerId)) return 'Already in this game';

  game.players.set(playerId, { id: playerId, name: playerName, ships: [], isBot: false, aiDifficulty: null });
  game.lastActivity = Date.now();
  return null;
}

export function addBot(game: Game, difficulty: AiDifficulty): { botId: string } | { error: string } {
  if (game.phase !== 'lobby') return { error: 'Game is not in lobby phase' };
  if (game.players.size >= 6) return { error: 'Game is full (6 players max)' };

  const botId = `bot-${crypto.randomUUID().slice(0, 8)}`;

  const usedNames = new Set([...game.players.values()].map(p => p.name));
  const pool = BOT_NAME_POOLS[difficulty].filter(n => !usedNames.has(n));
  const name = pool.length > 0
    ? pool[Math.floor(Math.random() * pool.length)]
    : `Bot ${game.players.size}`;

  game.players.set(botId, { id: botId, name, ships: [], isBot: true, aiDifficulty: difficulty });
  game.lastActivity = Date.now();
  return { botId };
}

export function removeBot(game: Game, botId: string): string | null {
  if (game.phase !== 'lobby') return 'Game is not in lobby phase';
  const player = game.players.get(botId);
  if (!player || !player.isBot) return 'Player is not a bot';
  game.players.delete(botId);
  game.teams.delete(botId);
  game.lastActivity = Date.now();
  return null;
}

export function canStartGame(game: Game, requesterId: string): string | null {
  if (game.phase !== 'lobby') return 'Game is not in lobby phase';
  if (requesterId !== game.hostId) return 'Only the host can start the game';
  if (game.players.size < 2) return 'Need at least 2 players';

  // Team balance validation
  if (game.teamsEnabled) {
    const teamCounts = new Map<string, number>();
    for (const teamId of game.teams.values()) {
      teamCounts.set(teamId, (teamCounts.get(teamId) ?? 0) + 1);
    }
    const counts = [...teamCounts.values()];
    // All teams must have equal size
    if (counts.length < 2 || !counts.every(c => c === counts[0])) {
      return 'Teams must be balanced — equal players per team';
    }
  }

  return null;
}

// ============================================================
// Island Generation
// ============================================================

/** Generate random island hexes for the game board. */
export function generateIslands(rings: number, targetCount: number): Set<string> {
  if (targetCount <= 0) return new Set();

  const allCoords = allHexes(rings);
  // Exclude center rings (0-1) for playability
  const candidates = allCoords.filter(coord => {
    const h = parseHex(coord)!;
    return hexDistance({ q: 0, r: 0 }, h) >= 2;
  });

  for (let attempt = 0; attempt < 10; attempt++) {
    const islands = pickRandomIslands(candidates, targetCount);

    // Validate: enough open hexes (max 6 players × 10 cells + 10 buffer)
    const openCount = allCoords.length - islands.size;
    const minOpen = 70;
    if (openCount < minOpen) {
      targetCount = Math.max(0, targetCount - 2);
      continue;
    }

    // Validate: no isolated regions < 10 hexes
    if (hasSmallIsolatedRegion(rings, islands)) {
      continue;
    }

    return islands;
  }

  // Fallback: return fewer or no islands
  return new Set();
}

function pickRandomIslands(candidates: string[], count: number): Set<string> {
  const shuffled = [...candidates];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return new Set(shuffled.slice(0, count));
}

/** BFS to check if any contiguous open region has fewer than 10 hexes */
function hasSmallIsolatedRegion(rings: number, islands: Set<string>): boolean {
  const allCoords = allHexes(rings);
  const open = new Set(allCoords.filter(c => !islands.has(c)));
  const visited = new Set<string>();

  for (const start of open) {
    if (visited.has(start)) continue;

    // BFS from this open hex
    const region: string[] = [];
    const queue = [start];
    visited.add(start);

    while (queue.length > 0) {
      const current = queue.shift()!;
      region.push(current);
      const h = parseHex(current)!;
      for (const neighbor of hexNeighborsInBounds(h.q, h.r, rings)) {
        const nStr = hexToString(neighbor.q, neighbor.r);
        if (open.has(nStr) && !visited.has(nStr)) {
          visited.add(nStr);
          queue.push(nStr);
        }
      }
    }

    if (region.length < 10) return true;
  }

  return false;
}

export function startGame(game: Game): void {
  // Generate islands at lobby→placement transition (before placement begins)
  game.islands = generateIslands(game.rings, game.islandCount);
  game.phase = 'placement';
  game.lastActivity = Date.now();
}

// ============================================================
// Ship Placement Validation
// ============================================================

function validateShipCells(cells: string[], expectedLength: number, rings: number): string | null {
  if (cells.length !== expectedLength) {
    return `Ship should have ${expectedLength} cells, got ${cells.length}`;
  }

  // Parse all cells
  const parsed = cells.map(parseHex);
  if (parsed.some(p => p === null)) return 'Invalid coordinate';
  const hexes = parsed as { q: number; r: number }[];

  // All cells must be valid
  if (hexes.some(h => !isValidHex(h.q, h.r, rings))) return 'Coordinate out of bounds';

  // For length 1, just one valid cell is enough
  if (expectedLength === 1) return null;

  // Check if cells form a straight line along one of 6 hex directions
  const anchor = hexes[0];
  let foundDirection = false;

  for (let dirIdx = 0; dirIdx < 6; dirIdx++) {
    // Check if this ship matches this direction from anchor
    const expected = [];
    for (let i = 0; i < expectedLength; i++) {
      const dq = hexes[i].q - anchor.q;
      const dr = hexes[i].r - anchor.r;
      expected.push({ dq, dr });
    }

    // The ship is valid along a direction if each cell is the anchor + i * direction
    // Try to find the direction vector from the first two cells
    const dq = hexes[1].q - anchor.q;
    const dr = hexes[1].r - anchor.r;

    // Check all cells follow this direction
    let valid = true;
    for (let i = 0; i < expectedLength; i++) {
      if (hexes[i].q !== anchor.q + dq * i || hexes[i].r !== anchor.r + dr * i) {
        valid = false;
        break;
      }
    }

    if (valid) {
      // Verify the direction vector is one of the 6 hex directions
      const isHexDir = Math.abs(dq) <= 1 && Math.abs(dr) <= 1 && Math.abs(dq + dr) <= 1
        && (dq !== 0 || dr !== 0);
      if (isHexDir) {
        foundDirection = true;
        break;
      }
    }
  }

  if (!foundDirection) return 'Ship must follow a hex axis';

  return null;
}

export function validatePlacement(placements: ShipPlacement[], rings: number, islands: Set<string>): string | null {
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
    const err = validateShipCells(placement.cells, placement.length, rings);
    if (err) return `${SHIP_NAMES[placement.length]}: ${err}`;
  }

  // Check for overlapping cells and island collisions
  const allCells = new Set<string>();
  for (const placement of placements) {
    for (const cell of placement.cells) {
      if (islands.has(cell)) return `Ship placed on island at ${cell}`;
      if (allCells.has(cell)) return `Overlapping ships at ${cell}`;
      allCells.add(cell);
    }
  }

  return null;
}

export function placeShips(game: Game, playerId: string, placements: ShipPlacement[]): string | null {
  if (game.phase !== 'placement') return 'Game is not in placement phase';
  const player = game.players.get(playerId);
  if (!player) return 'Player not in game';
  if (player.ships.length > 0) return 'Ships already placed';

  const err = validatePlacement(placements, game.rings, game.islands);
  if (err) return err;

  player.ships = placements.map((p): Ship => ({
    length: p.length,
    cells: [...p.cells],  // hex coords are already canonical "q,r" format
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
  // Generate turn order: simple team alternation
  if (game.teamsEnabled && game.teams.size > 0) {
    const teamGroups = new Map<string, string[]>();
    for (const [playerId, teamId] of game.teams) {
      if (!teamGroups.has(teamId)) teamGroups.set(teamId, []);
      teamGroups.get(teamId)!.push(playerId);
    }

    // Shuffle within each team
    for (const members of teamGroups.values()) {
      for (let i = members.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [members[i], members[j]] = [members[j], members[i]];
      }
    }

    // Shuffle team order
    const teamIds = [...teamGroups.keys()];
    for (let i = teamIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [teamIds[i], teamIds[j]] = [teamIds[j], teamIds[i]];
    }

    // Alternating: [A1, B1, C1, A2, B2, C2, ...]
    const teams = teamIds.map(id => teamGroups.get(id)!);
    const maxSize = Math.max(...teams.map(t => t.length));
    game.turnOrder = [];
    for (let slot = 0; slot < maxSize; slot++) {
      for (const team of teams) {
        if (slot < team.length) {
          game.turnOrder.push(team[slot]);
        }
      }
    }
  } else {
    // FFA / non-team: random shuffle
    const ids = [...game.players.keys()];
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    game.turnOrder = ids;
  }

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
    const hex = parseHex(coord);
    if (!hex) return `Invalid coordinate: ${coord}`;
    if (!isValidHex(hex.q, hex.r, game.rings)) return `Coordinate out of bounds: ${coord}`;
    if (game.islands.has(coord)) return `Cannot shoot at island: ${coord}`;
    if (game.shots.has(coord)) return `Already shot at ${coord}`;
  }

  // Check for duplicates within the salvo
  if (new Set(coords).size !== coords.length) {
    return 'Duplicate coordinates in salvo';
  }

  return null;
}

export function fireSalvo(game: Game, playerId: string, coords: string[]): ShotResult[] {
  const results: ShotResult[] = [];

  // Phase 1: Resolve all shots atomically (don't check alive mid-salvo)
  for (const coord of coords) {
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
    shooterStats.shotsFired += coords.length;
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

  if (game.teamsEnabled) {
    const teamIds = new Set(game.teams.values());
    const aliveTeams: string[] = [];
    for (const teamId of teamIds) {
      if (isTeamAlive(game, teamId)) {
        aliveTeams.push(teamId);
      }
    }

    if (aliveTeams.length > 1) return null;

    game.phase = 'finished';
    game.lastActivity = Date.now();

    if (aliveTeams.length === 1) {
      const winnerTeamId = aliveTeams[0];
      const winnerId = [...game.teams.entries()]
        .find(([pid, tid]) => {
          const player = game.players.get(pid);
          return player && tid === winnerTeamId && isPlayerAlive(player);
        })
        ?.[0] ?? null;
      return computeGameOverStats(game, winnerId, winnerTeamId);
    } else {
      return computeGameOverStats(game, null, null);
    }
  }

  const alivePlayers = [...game.players.values()].filter(isPlayerAlive);
  if (alivePlayers.length > 1) return null;

  game.phase = 'finished';
  game.lastActivity = Date.now();

  const winnerId = alivePlayers.length === 1 ? alivePlayers[0].id : null;
  return computeGameOverStats(game, winnerId, null);
}

function computeGameOverStats(game: Game, winnerId: string | null, winnerTeamId: string | null): GameOverStats {
  const playerStats: GameOverStats['playerStats'] = {};

  for (const [id] of game.players) {
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

  const highlights: string[] = [];
  const entries = [...game.players.entries()].map(([id, p]) => ({
    id, name: p.name, ...playerStats[id],
  }));

  // Sharpshooter
  const qualified = entries.filter(e => e.shotsFired >= 3);
  if (qualified.length > 0) {
    const best = qualified.reduce((a, b) => a.accuracy > b.accuracy ? a : b);
    highlights.push(`Sharpshooter: ${best.name} (${Math.round(best.accuracy * 100)}% accuracy)`);
  }

  // Most Destructive
  const mostSunk = entries.reduce((a, b) => a.shipsSunk > b.shipsSunk ? a : b);
  if (mostSunk.shipsSunk > 0) {
    highlights.push(`Most Destructive: ${mostSunk.name} (${mostSunk.shipsSunk} ships sunk)`);
  }

  // Friendly Fire Champion
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

  // Team aggregate highlights
  if (game.teamsEnabled && game.teams.size > 0) {
    const teamIds = [...new Set(game.teams.values())];
    const teamNames: Record<string, string> = { alpha: 'Team Alpha', bravo: 'Team Bravo', charlie: 'Team Charlie' };

    for (const teamId of teamIds) {
      const teamPlayerIds = [...game.teams.entries()]
        .filter(([, tid]) => tid === teamId)
        .map(([pid]) => pid);

      let totalShots = 0;
      let totalHits = 0;
      let totalSunk = 0;
      for (const pid of teamPlayerIds) {
        const s = playerStats[pid];
        if (s) {
          totalShots += s.shotsFired;
          totalHits += s.hitsLanded;
          totalSunk += s.shipsSunk;
        }
      }

      const label = teamNames[teamId] ?? teamId;
      if (totalShots > 0) {
        highlights.push(`${label}: ${Math.round((totalHits / totalShots) * 100)}% accuracy`);
      }
      if (totalSunk > 0) {
        highlights.push(`${label}: ${totalSunk} ships sunk`);
      }
    }
  }

  return { winnerId, winnerTeamId, playerStats, highlights };
}

// ============================================================
// Forfeit (silent removal — no info leakage in FFA)
// ============================================================

export function forfeitPlayer(game: Game, playerId: string): void {
  const player = game.players.get(playerId);
  if (!player) return;
  player.ships = [];
  game.lastActivity = Date.now();
}

// ============================================================
// Reset for Rematch
// ============================================================

export function resetForRematch(game: Game): void {
  game.phase = 'placement';
  game.shots = new Set();
  game.islands = generateIslands(game.rings, game.islandCount);
  game.turnOrder = [];
  game.currentTurnIndex = 0;
  game.lastActivity = Date.now();
  game.rematchAccepted = new Set();
  game.playerStats = new Map();
  game.firstBloodId = null;

  // INVARIANT: game.teams and game.teamsEnabled are NOT cleared — teams persist across rematches.

  for (const player of game.players.values()) {
    player.ships = [];
  }
}

/** Remove a player and return remaining human count */
export function removePlayer(game: Game, playerId: string): void {
  game.players.delete(playerId);
  game.rematchAccepted.delete(playerId);
  game.teams.delete(playerId);
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
// Each player only sees their own ship positions (and teammate's).
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
    cells: [],
    hits: [],
    sunk: isShipSunk(ship),
  };
}

function serializeShipForEliminated(_ship: Ship): WireShip {
  return {
    length: _ship.length,
    cells: [],
    hits: [..._ship.hits],
    sunk: true,
  };
}

function serializePlayer(player: Player, isOwner: boolean, isTeammate: boolean = false): WirePlayer {
  const alive = isPlayerAlive(player);
  return {
    id: player.id,
    name: player.name,
    ships: player.ships.map((s: Ship) =>
      (isOwner || isTeammate) ? serializeShipForOwner(s) :
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
  const viewerTeam = game.teams.get(viewerId);
  const players: Record<string, WirePlayer> = {};
  for (const [id, player] of game.players) {
    const isOwner = id === viewerId;
    const isTeammate = !isOwner && viewerTeam != null && game.teams.get(id) === viewerTeam;
    players[id] = serializePlayer(player, isOwner, isTeammate);
  }

  const teamsRecord: Record<string, string> = {};
  for (const [playerId, teamId] of game.teams) {
    teamsRecord[playerId] = teamId;
  }

  return {
    id: game.id,
    phase: game.phase,
    mode: game.mode,
    players,
    hostId: game.hostId,
    turnOrder: game.turnOrder,
    currentTurnIndex: game.currentTurnIndex,
    rings: game.rings,
    islands: [...game.islands],
    shots: [...game.shots],
    timerConfig: game.timerConfig,
    teamsEnabled: game.teamsEnabled,
    teams: teamsRecord,
    gameType: game.gameType,
    islandCount: game.islandCount,
  };
}
