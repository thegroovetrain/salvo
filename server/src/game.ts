import {
  type Game, type Player, type Ship, type ShipPlacement,
  type ShotResult, type WireGame, type WirePlayer, type WireShip,
  type TimerConfig, type GameOverStats, type AiDifficulty, type GameMode,
  type PlayerColor, type PlayerGameStats,
  isShipSunk, isPlayerAlive, playerShotCount, isTeamAlive,
  SHIP_LENGTHS, SHIP_NAMES, BOT_NAME_POOLS, MODE_RINGS, SLOT_COLORS,
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
  const player: Player = { id: hostId, name: hostName, ships: [], isBot: false, aiDifficulty: null, color: SLOT_COLORS[0] };
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
    readyStates: new Map(),
    turnMode: 'sequential',
    roundNumber: 0,
    lockedSalvos: new Map(),
    lockDeadline: null,
    roundParticipants: [],
    roundShotCounts: new Map(),
    roundPhase: null,
  };
}

// ============================================================
// Game Options (lobby-phase updates)
// ============================================================

export type GameType = 'ffa' | '2-team' | '3-team';

function applyGameType(game: Game, gameType: GameType): void {
  const teamsEnabled = gameType !== 'ffa';
  game.teamsEnabled = teamsEnabled;
  game.gameType = gameType;

  if (!teamsEnabled) {
    game.teams.clear();
    return;
  }

  const teamNames = gameType === '3-team'
    ? ['alpha', 'bravo', 'charlie']
    : ['alpha', 'bravo'];
  game.teams.clear();
  let teamIdx = 0;
  for (const playerId of game.players.keys()) {
    game.teams.set(playerId, teamNames[teamIdx % teamNames.length]);
    teamIdx++;
  }
}

function applyTimerSeconds(game: Game, timerSeconds: number | null): void {
  if (timerSeconds === null || timerSeconds === 0) {
    game.timerConfig = { enabled: false, seconds: 60 };
  } else {
    game.timerConfig = { enabled: true, seconds: timerSeconds };
  }
}

function isValidRings(rings: number): boolean {
  return rings >= 4 && rings <= 6;
}

function isValidIslandCount(count: number): boolean {
  return count >= 0 && count <= 8;
}

function isValidTurnMode(mode: unknown): mode is 'sequential' | 'simultaneous' {
  return mode === 'sequential' || mode === 'simultaneous';
}

function applySimpleOptions(game: Game, options: { rings?: number; islandCount?: number; turnMode?: 'sequential' | 'simultaneous' }): void {
  if (options.rings !== undefined && isValidRings(options.rings)) game.rings = options.rings;
  if (options.islandCount !== undefined && isValidIslandCount(options.islandCount)) game.islandCount = options.islandCount;
  if (isValidTurnMode(options.turnMode)) game.turnMode = options.turnMode;
}

export function updateGameOptions(
  game: Game,
  requesterId: string,
  options: { gameType?: GameType; timerSeconds?: number | null; rings?: number; islandCount?: number; turnMode?: 'sequential' | 'simultaneous' },
): string | null {
  if (game.phase !== 'lobby') return 'Game is not in lobby phase';
  if (game.hostId !== requesterId) return 'Only the host can change game options';

  if (options.gameType !== undefined) applyGameType(game, options.gameType);
  if (options.timerSeconds !== undefined) applyTimerSeconds(game, options.timerSeconds);
  applySimpleOptions(game, options);

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

  const usedColors = new Set([...game.players.values()].map(p => p.color));
  const color = SLOT_COLORS.find(c => !usedColors.has(c)) ?? 'green';
  game.players.set(playerId, { id: playerId, name: playerName, ships: [], isBot: false, aiDifficulty: null, color });
  game.lastActivity = Date.now();
  return null;
}

export function addBot(game: Game, difficulty: AiDifficulty, requestedSlot?: number): { botId: string } | { error: string } {
  if (game.phase !== 'lobby') return { error: 'Game is not in lobby phase' };
  if (game.players.size >= 6) return { error: 'Game is full (6 players max)' };

  const botId = `bot-${crypto.randomUUID().slice(0, 8)}`;

  const usedNames = new Set([...game.players.values()].map(p => p.name));
  const pool = BOT_NAME_POOLS[difficulty].filter(n => !usedNames.has(n));
  const name = pool.length > 0
    ? pool[Math.floor(Math.random() * pool.length)]
    : `Bot ${game.players.size}`;

  // Use the requested slot if valid and not already taken, otherwise fall back to next available
  const usedColors = new Set([...game.players.values()].map(p => p.color));
  let color: PlayerColor;
  if (requestedSlot != null && requestedSlot >= 0 && requestedSlot < SLOT_COLORS.length && !usedColors.has(SLOT_COLORS[requestedSlot])) {
    color = SLOT_COLORS[requestedSlot];
  } else {
    color = SLOT_COLORS.find(c => !usedColors.has(c)) ?? 'green';
  }
  game.players.set(botId, { id: botId, name, ships: [], isBot: true, aiDifficulty: difficulty, color });
  game.lastActivity = Date.now();
  return { botId };
}

export function removeBot(game: Game, botId: string): string | null {
  if (game.phase !== 'lobby') return 'Game is not in lobby phase';
  const player = game.players.get(botId);
  if (!player || !player.isBot) return 'Player is not a bot';
  game.players.delete(botId);
  game.teams.delete(botId);
  game.readyStates.delete(botId);
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

function parseAndValidateHexes(cells: string[], rings: number): { q: number; r: number }[] | string {
  const parsed = cells.map(parseHex);
  if (parsed.some(p => p === null)) return 'Invalid coordinate';
  const hexes = parsed as { q: number; r: number }[];
  if (hexes.some(h => !isValidHex(h.q, h.r, rings))) return 'Coordinate out of bounds';
  return hexes;
}

function isValidHexDirection(dq: number, dr: number): boolean {
  return Math.abs(dq) <= 1 && Math.abs(dr) <= 1 && Math.abs(dq + dr) <= 1
    && (dq !== 0 || dr !== 0);
}

function cellsFollowDirection(
  hexes: { q: number; r: number }[], anchor: { q: number; r: number }, dq: number, dr: number,
): boolean {
  return hexes.every((h, i) => h.q === anchor.q + dq * i && h.r === anchor.r + dr * i);
}

function validateShipCells(cells: string[], expectedLength: number, rings: number): string | null {
  if (cells.length !== expectedLength) {
    return `Ship should have ${expectedLength} cells, got ${cells.length}`;
  }

  const result = parseAndValidateHexes(cells, rings);
  if (typeof result === 'string') return result;
  const hexes = result;

  const anchor = hexes[0];
  const dq = hexes[1].q - anchor.q;
  const dr = hexes[1].r - anchor.r;

  if (isValidHexDirection(dq, dr) && cellsFollowDirection(hexes, anchor, dq, dr)) {
    return null;
  }

  return 'Ship must follow a hex axis';
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

function shuffleArray<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function buildTeamTurnOrder(game: Game): string[] {
  const teamGroups = new Map<string, string[]>();
  for (const [playerId, teamId] of game.teams) {
    if (!teamGroups.has(teamId)) teamGroups.set(teamId, []);
    teamGroups.get(teamId)!.push(playerId);
  }

  for (const members of teamGroups.values()) {
    shuffleArray(members);
  }

  const teamIds = [...teamGroups.keys()];
  shuffleArray(teamIds);

  // Alternating: [A1, B1, C1, A2, B2, C2, ...]
  const teams = teamIds.map(id => teamGroups.get(id)!);
  const maxSize = Math.max(...teams.map(t => t.length));
  const turnOrder: string[] = [];
  for (let slot = 0; slot < maxSize; slot++) {
    for (const team of teams) {
      if (slot < team.length) {
        turnOrder.push(team[slot]);
      }
    }
  }
  return turnOrder;
}

function initPlayerStats(game: Game): void {
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

export function beginPlaying(game: Game): void {
  if (game.teamsEnabled && game.teams.size > 0) {
    game.turnOrder = buildTeamTurnOrder(game);
  } else {
    const ids = [...game.players.keys()];
    shuffleArray(ids);
    game.turnOrder = ids;
  }

  game.currentTurnIndex = 0;
  game.phase = 'playing';
  game.lastActivity = Date.now();
  initPlayerStats(game);
}

// ============================================================
// Shot Resolution (Atomic)
// ============================================================

export function getCurrentTurnPlayerId(game: Game): string | null {
  if (game.phase !== 'playing') return null;
  return game.turnOrder[game.currentTurnIndex] ?? null;
}

function validateSalvoCoord(coord: string, game: Game): string | null {
  const hex = parseHex(coord);
  if (!hex) return `Invalid coordinate: ${coord}`;
  if (!isValidHex(hex.q, hex.r, game.rings)) return `Coordinate out of bounds: ${coord}`;
  if (game.islands.has(coord)) return `Cannot shoot at island: ${coord}`;
  if (game.shots.has(coord)) return `Already shot at ${coord}`;
  return null;
}

export function validateSalvo(game: Game, playerId: string, coords: string[]): string | null {
  if (game.phase !== 'playing') return 'Game is not in playing phase';

  const currentPlayer = getCurrentTurnPlayerId(game);
  if (currentPlayer !== playerId) return 'Not your turn';

  const player = game.players.get(playerId);
  if (!player) return 'Player not in game';
  if (!isPlayerAlive(player)) return 'You are eliminated';

  const expectedShots = playerShotCount(player);
  // Cap at available unshot hexes — late-game boards may have fewer targets than shots
  const unshotCount = allHexes(game.rings).filter(c => !game.shots.has(c) && !game.islands.has(c)).length;
  const maxShots = Math.min(expectedShots, unshotCount);
  if (coords.length < 1 || coords.length > maxShots) {
    return `Must fire 1\u2013${maxShots} shots, got ${coords.length}`;
  }

  for (const coord of coords) {
    const err = validateSalvoCoord(coord, game);
    if (err) return err;
  }

  if (new Set(coords).size !== coords.length) {
    return 'Duplicate coordinates in salvo';
  }

  return null;
}

function resolveShot(game: Game, coord: string): ShotResult {
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
  return shotResult;
}

function accumulateShooterStats(game: Game, playerId: string, results: ShotResult[], coordCount: number): void {
  const shooterStats = game.playerStats.get(playerId);
  if (!shooterStats) return;

  shooterStats.shotsFired += coordCount;
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

export function fireSalvo(game: Game, playerId: string, coords: string[]): ShotResult[] {
  const results = coords.map(coord => resolveShot(game, coord));
  accumulateShooterStats(game, playerId, results, coords.length);
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

function checkTeamGameOver(game: Game): GameOverStats | null {
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

  if (aliveTeams.length !== 1) return computeGameOverStats(game, null, null);

  const winnerTeamId = aliveTeams[0];
  const winnerId = [...game.teams.entries()]
    .find(([pid, tid]) => {
      const player = game.players.get(pid);
      return player && tid === winnerTeamId && isPlayerAlive(player);
    })
    ?.[0] ?? null;
  return computeGameOverStats(game, winnerId, winnerTeamId);
}

export function checkGameOver(game: Game): GameOverStats | null {
  if (game.phase !== 'playing') return null;

  if (game.teamsEnabled) return checkTeamGameOver(game);

  const alivePlayers = [...game.players.values()].filter(isPlayerAlive);
  if (alivePlayers.length > 1) return null;

  game.phase = 'finished';
  game.lastActivity = Date.now();

  const winnerId = alivePlayers.length === 1 ? alivePlayers[0].id : null;
  return computeGameOverStats(game, winnerId, null);
}

const EMPTY_STATS = { shotsFired: 0, hitsLanded: 0, shipsSunk: 0, friendlyFireHits: 0, turnsTaken: 0 };

function toPlayerStatEntry(stats: typeof EMPTY_STATS): GameOverStats['playerStats'][string] {
  const { shotsFired, hitsLanded, shipsSunk, friendlyFireHits, turnsTaken } = stats;
  return {
    shotsFired, hitsLanded, shipsSunk, friendlyFireHits, turnsTaken,
    accuracy: shotsFired > 0 ? hitsLanded / shotsFired : 0,
  };
}

function buildPlayerStats(game: Game): GameOverStats['playerStats'] {
  const playerStats: GameOverStats['playerStats'] = {};
  for (const [id] of game.players) {
    playerStats[id] = toPlayerStatEntry(game.playerStats.get(id) ?? EMPTY_STATS);
  }
  return playerStats;
}

type StatEntry = { id: string; name: string; shotsFired: number; hitsLanded: number; accuracy: number; shipsSunk: number; friendlyFireHits: number; turnsTaken: number };

function buildHighlights(entries: StatEntry[], game: Game): string[] {
  const highlights: string[] = [];

  const qualified = entries.filter(e => e.shotsFired >= 3);
  if (qualified.length > 0) {
    const best = qualified.reduce((a, b) => a.accuracy > b.accuracy ? a : b);
    highlights.push(`Sharpshooter: ${best.name} (${Math.round(best.accuracy * 100)}% accuracy)`);
  }

  const mostSunk = entries.reduce((a, b) => a.shipsSunk > b.shipsSunk ? a : b);
  if (mostSunk.shipsSunk > 0) {
    highlights.push(`Most Destructive: ${mostSunk.name} (${mostSunk.shipsSunk} ships sunk)`);
  }

  const mostFF = entries.reduce((a, b) => a.friendlyFireHits > b.friendlyFireHits ? a : b);
  if (mostFF.friendlyFireHits > 0) {
    highlights.push(`Friendly Fire Champion: ${mostFF.name} (${mostFF.friendlyFireHits} self-hits)`);
  }

  if (game.firstBloodId) {
    const fbPlayer = game.players.get(game.firstBloodId);
    if (fbPlayer) {
      highlights.push(`First Blood: ${fbPlayer.name}`);
    }
  }

  return highlights;
}

function computeGameOverStats(game: Game, winnerId: string | null, winnerTeamId: string | null): GameOverStats {
  const playerStats = buildPlayerStats(game);

  const entries = [...game.players.entries()].map(([id, p]) => ({
    id, name: p.name, ...playerStats[id],
  }));

  const highlights = buildHighlights(entries, game);

  return { winnerId, winnerTeamId, playerStats, highlights };
}

// ============================================================
// Elimination Checking
// ============================================================

/** Returns player IDs that are newly dead (were alive before, now dead). Call after fireSalvo. */
export function checkNewEliminations(game: Game, alreadyDead: Set<string>): { playerId: string; playerName: string }[] {
  const newlyDead: { playerId: string; playerName: string }[] = [];
  for (const player of game.players.values()) {
    if (!isPlayerAlive(player) && !alreadyDead.has(player.id)) {
      newlyDead.push({ playerId: player.id, playerName: player.name });
    }
  }
  return newlyDead;
}

// ============================================================
// Eliminate (silent removal — no info leakage in FFA)
// Used by surrender. Disconnect does NOT eliminate.
// ============================================================

export function eliminatePlayer(game: Game, playerId: string): void {
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

  // Reset simultaneous round state (turnMode is preserved)
  game.roundNumber = 0;
  game.lockedSalvos.clear();
  game.lockDeadline = null;
  game.roundParticipants = [];
  game.roundShotCounts.clear();
  game.roundPhase = null;

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
  game.readyStates.delete(playerId);
  if (game.hostId === playerId) {
    for (const p of game.players.values()) {
      if (!p.isBot) {
        game.hostId = p.id;
        break;
      }
    }
  }
}

/** Reset a finished game back to lobby phase (custom games only) */
export function resetGameToLobby(game: Game): void {
  game.phase = 'lobby';
  game.shots = new Set();
  game.islands = new Set();
  game.turnOrder = [];
  game.currentTurnIndex = 0;
  game.lastActivity = Date.now();
  game.rematchAccepted = new Set();
  game.playerStats = new Map();
  game.firstBloodId = null;
  game.readyStates = new Map();

  // Reset simultaneous round state (turnMode is preserved)
  game.roundNumber = 0;
  game.lockedSalvos.clear();
  game.lockDeadline = null;
  game.roundParticipants = [];
  game.roundShotCounts.clear();
  game.roundPhase = null;

  for (const player of game.players.values()) {
    player.ships = [];
  }
}

// ============================================================
// Player Color Assignment
// ============================================================

/** Set a player's color directly (used by QP random assignment in index.ts) */
export function assignPlayerColor(game: Game, playerId: string, color: PlayerColor): void {
  const player = game.players.get(playerId);
  if (player) player.color = color;
}

// ============================================================
// Simultaneous Mode — Validation & Resolution
// ============================================================

function validateSimultaneousState(game: Game, playerId: string): string | null {
  if (game.phase !== 'playing') return 'Game is not in playing phase';
  if (game.turnMode !== 'simultaneous') return 'Game is not in simultaneous mode';
  if (game.roundPhase !== 'open') return 'No round is currently open';
  const player = game.players.get(playerId);
  if (!player) return 'Player not found';
  if (!isPlayerAlive(player)) return 'Player is eliminated';
  if (game.lockedSalvos.has(playerId)) return 'Already locked in for this round';
  return null;
}

function validateSimultaneousCoords(game: Game, playerId: string, coords: string[]): string | null {
  const maxShots = game.roundShotCounts.get(playerId) ?? 0;
  if (coords.length > maxShots) return `Too many shots (max ${maxShots})`;
  for (const coord of coords) {
    const hex = parseHex(coord);
    if (!hex) return `Invalid coordinate: ${coord}`;
    if (!isValidHex(hex.q, hex.r, game.rings)) return `Coordinate out of bounds: ${coord}`;
    if (game.shots.has(coord)) return `Already shot at ${coord}`;
    if (game.islands.has(coord)) return `${coord} is an island`;
  }
  if (new Set(coords).size !== coords.length) return 'Duplicate coordinates';
  return null;
}

export function validateSimultaneousSalvo(
  game: Game, playerId: string, coords: string[],
): string | null {
  return validateSimultaneousState(game, playerId) ?? validateSimultaneousCoords(game, playerId, coords);
}

export function lockPlayerSalvo(game: Game, playerId: string, coords: string[]): void {
  game.lockedSalvos.set(playerId, coords);
}

/** Snapshot of hittable cells at round start (before resolution) */
interface ShipCellRef { ownerId: string; shipIdx: number }

interface BoardSnapshot {
  /** coord → ALL ship refs on that cell (multiple ships can share a hex in shared ocean) */
  hittableCells: Map<string, ShipCellRef[]>;
}

function snapshotBoardState(game: Game): BoardSnapshot {
  const hittableCells = new Map<string, ShipCellRef[]>();
  for (const [pid, player] of game.players) {
    for (let i = 0; i < player.ships.length; i++) {
      const ship = player.ships[i];
      for (const cell of ship.cells) {
        if (!ship.hits.has(cell)) {
          const refs = hittableCells.get(cell);
          if (refs) { refs.push({ ownerId: pid, shipIdx: i }); }
          else { hittableCells.set(cell, [{ ownerId: pid, shipIdx: i }]); }
        }
      }
    }
  }
  return { hittableCells };
}

function resolvePlayerSalvo(
  game: Game,
  shooterId: string,
  coords: string[],
  snapshot: BoardSnapshot,
  stats: PlayerGameStats,
): ShotResult[] {
  const results: ShotResult[] = [];
  for (const coord of coords) {
    stats.shotsFired++;
    const targets = snapshot.hittableCells.get(coord);
    if (!targets || targets.length === 0) {
      results.push({ coord, hits: [], miss: true });
      continue;
    }
    const hits: PlayerHit[] = [];
    for (const target of targets) {
      const targetPlayer = game.players.get(target.ownerId)!;
      const targetShip = targetPlayer.ships[target.shipIdx];
      const isSelf = target.ownerId === shooterId;
      if (isSelf) { stats.friendlyFireHits++; } else { stats.hitsLanded++; }
      hits.push({
        playerId: target.ownerId,
        playerName: targetPlayer.name,
        sunk: false,
        shipLength: targetShip.length,
        sunkShipCells: null,
      });
    }
    results.push({ coord, hits, miss: false });
  }
  stats.turnsTaken++;
  return results;
}

/** Batch-apply all hit coords to actual ship state */
function batchApplyHits(game: Game, allCoords: string[], snapshot: BoardSnapshot): void {
  for (const coord of allCoords) {
    game.shots.add(coord);
    const targets = snapshot.hittableCells.get(coord);
    if (!targets) continue;
    for (const target of targets) {
      const targetPlayer = game.players.get(target.ownerId);
      if (targetPlayer) {
        targetPlayer.ships[target.shipIdx].hits.add(coord);
      }
    }
  }
}

/** Update sunk status in ShotResults after batch apply */
function updateSunkStatus(game: Game, allResults: { shots: ShotResult[] }[]): void {
  for (const entry of allResults) {
    for (const shot of entry.shots) {
      for (const hit of shot.hits) {
        const targetPlayer = game.players.get(hit.playerId);
        if (!targetPlayer) continue;
        const ship = targetPlayer.ships.find(s => s.cells.includes(shot.coord));
        if (ship && isShipSunk(ship)) {
          hit.sunk = true;
          hit.sunkShipCells = [...ship.cells];
        }
      }
    }
  }
}

export interface SimultaneousRoundResult {
  shooterId: string;
  shooterName: string;
  shots: ShotResult[];
}

export function resolveSimultaneousRound(game: Game): SimultaneousRoundResult[] {
  const snapshot = snapshotBoardState(game);
  const results: SimultaneousRoundResult[] = [];
  const allHitCoords: string[] = [];

  // Resolve each player's salvo against the snapshot
  for (const [shooterId, coords] of game.lockedSalvos) {
    const shooter = game.players.get(shooterId);
    if (!shooter) continue;
    const stats = game.playerStats.get(shooterId) ?? { ...EMPTY_STATS };
    game.playerStats.set(shooterId, stats);
    const shots = resolvePlayerSalvo(game, shooterId, coords, snapshot, stats);
    results.push({ shooterId, shooterName: shooter.name, shots });
    // Track first blood
    for (const shot of shots) {
      for (const hit of shot.hits) {
        if (hit.playerId !== shooterId && game.firstBloodId === null) {
          game.firstBloodId = shooterId;
        }
        if (hit.playerId !== shooterId) {
          const sStats = game.playerStats.get(shooterId);
          if (sStats) {
            // shipsSunk updated after batch apply
          }
        }
      }
    }
    allHitCoords.push(...coords);
  }

  // Batch apply all hits
  batchApplyHits(game, allHitCoords, snapshot);

  // Update sunk status and shipsSunk stats
  updateSunkStatus(game, results);
  updateShipsSunkStats(game, results);

  // Clear round state
  game.lockedSalvos.clear();
  game.roundPhase = null;
  game.lockDeadline = null;
  game.lastActivity = Date.now();

  return results;
}

function updateShipsSunkStats(game: Game, results: SimultaneousRoundResult[]): void {
  for (const entry of results) {
    const stats = game.playerStats.get(entry.shooterId);
    if (!stats) continue;
    // Track sunk ships by identity to avoid double-counting when multiple cells of the same ship are hit in one round
    const countedShips = new Set<string>();
    for (const shot of entry.shots) {
      for (const hit of shot.hits) {
        if (hit.sunk && hit.playerId !== entry.shooterId) {
          const shipKey = `${hit.playerId}:${hit.shipLength}:${hit.sunkShipCells?.[0] ?? shot.coord}`;
          if (!countedShips.has(shipKey)) {
            countedShips.add(shipKey);
            stats.shipsSunk++;
          }
        }
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

/** Game-over: reveal all ship cells to all players for the colorful battlefield map */
function serializeShipForGameOver(ship: Ship): WireShip {
  return {
    length: ship.length,
    cells: [...ship.cells],
    hits: [...ship.hits],
    sunk: isShipSunk(ship),
  };
}

function serializePlayer(player: Player, isOwner: boolean, isTeammate: boolean = false, gameOver: boolean = false): WirePlayer {
  const alive = isPlayerAlive(player);
  return {
    id: player.id,
    name: player.name,
    ships: player.ships.map((s: Ship) =>
      gameOver ? serializeShipForGameOver(s) :
      (isOwner || isTeammate) ? serializeShipForOwner(s) :
      !alive ? serializeShipForEliminated(s) :
      serializeShipForOthers(s)
    ),
    alive,
    shotCount: playerShotCount(player),
    isBot: player.isBot,
    aiDifficulty: player.aiDifficulty,
    color: player.color,
  };
}

export function toClientView(game: Game, viewerId: string): WireGame {
  const viewerTeam = game.teams.get(viewerId);
  const gameOver = game.phase === 'finished';
  const players: Record<string, WirePlayer> = {};
  for (const [id, player] of game.players) {
    const isOwner = id === viewerId;
    const isTeammate = !isOwner && viewerTeam != null && game.teams.get(id) === viewerTeam;
    players[id] = serializePlayer(player, isOwner, isTeammate, gameOver);
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
    turnMode: game.turnMode,
    roundNumber: game.roundNumber,
    lockedPlayerIds: [...game.lockedSalvos.keys()],
    roundPhase: game.roundPhase,
    lockDeadline: game.lockDeadline,
  };
}
