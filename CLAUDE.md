# CLAUDE.md

## Project

Hullcracker.io is a multiplayer naval combat game. All players' ships occupy the same hex grid — every shot affects everyone.

### Commands
```
npm run dev          # Start server (3000) + client (5173)
npm run check        # Lint + type-check + test (all workspaces)
npm run lint         # ESLint (complexity=10 enforced)
npm test -w server   # Server tests (vitest, 255 tests)
npm test -w client   # Client tests (vitest + jsdom, 54 tests)
npx tsc --noEmit -p server/tsconfig.json  # Type-check server
npx tsc --noEmit -p client/tsconfig.json  # Type-check client
```

### Architecture

#### Shared
- **shared/src/types.ts** — All types, socket events, computed getters (isShipSunk, isPlayerAlive, playerShotCount), mode helpers (toGameMode, toQuickPlayMode), team helpers (getTeammates, isTeamAlive), PlayerColor type, SLOT_COLORS, TEAM_COLOR_POOLS
- **shared/src/hex.ts** — Hex coordinate math: axial coordinates (q,r), distance, neighbors, rings, linear paths, pixel↔hex conversion with cube rounding

#### Server
- **server/src/index.ts** — Express setup, static file serving, server bootstrap
- **server/src/socketSetup.ts** — Socket.io connection handler, registers all handler modules
- **server/src/game.ts** — Pure game logic, no I/O. toClientView() security boundary. checkNewEliminations() for post-salvo elimination detection
- **server/src/gameFlow.ts** — Turn flow: emitNextTurn, executeBotTurn, handlePlayerExit
- **server/src/emitters.ts** — Socket emission helpers: emitToPlayer, emitGameState, broadcastToGame
- **server/src/handlers/** — Socket event handlers by domain: lobby.ts (create/join/start), playing.ts (place-ships/fire), social.ts (chat/swap-team), connection.ts (rejoin/surrender/disconnect), rematch.ts (rematch/quickplay-join)
- **server/src/timers/** — Timer management: placement.ts, turn.ts, forfeit.ts, index.ts (clearGameTimers orchestrator + timer Maps)
- **server/src/queue/** — Quick Play matchmaking: queue state, tryMatchRoom, mode helpers
- **server/src/ai.ts** — AI opponents: 4 tiers (Easy/Medium/Hard/Impossible)
- **server/src/connections.ts** — playerId↔socketId mapping, disconnect state tracking, event buffering
- **server/src/lobby.ts** — Game lifecycle, join codes, cleanup timer
- **server/src/helpers.ts** — autoAssignTeam, shuffle, assignQuickPlayColors

#### Client
- **client/src/main.ts** — Bootstrap: state init, socket handler registration, initial render
- **client/src/state.ts** — AppState type + mutable singleton (leaf node, zero app imports)
- **client/src/socket.ts** — Socket.io client connection
- **client/src/rendering/** — Screen renderers: lobby.ts, waiting.ts, battle.ts, gameOver.ts, grid.ts (getCellState + battle/placement sub-functions), chat.ts, modals.ts, render.ts (main dispatch)
- **client/src/handlers/** — Event handling: socketGame.ts, socketLobby.ts, socketSocial.ts (socket event registration), eventBindings.ts (DOM event listeners), placement.ts (ship placement logic), battle.ts (target selection)
- **client/src/audio/** — AudioContext sound system: playTone, salvo/placement/match/turn sounds
- **client/src/timers/** — Turn timer + placement timer management
- **client/src/helpers/** — dom.ts (on/val/esc/playerIcon), format.ts (time formatting, name generation), storage.ts (localStorage migration), team.ts (teammate lookup)
- **client/src/settings/** — Theme toggle, mute toggle
- **client/src/errors.ts** — Error display with auto-dismiss
- **client/src/hexGrid.ts** — SVG hex grid renderer: polygon generation, pixel↔hex click detection, ship hull overlay, per-player color rendering
- **client/src/style.css** — Full DESIGN.md implementation, CIC tactical display

### Code Quality Conventions
- **Cyclomatic complexity ≤ 10** — Enforced by ESLint (`complexity: ["error", 10]`). All functions must stay under this limit.
- **~500 LOC per file** — Soft convention, not enforced. Files may exceed this when the content is cohesive.
- **Circular dependency rule** — state.ts has zero imports from other client modules. Rendering modules never import from handlers (one-way: handlers → rendering).

### Key Decisions
- Ship.sunk, Player.alive, Player.shotCount are computed getters, not stored state
- Salvos resolve atomically — all shots land before checking alive status (note: "salvo" is the game mechanic term for a volley of shots, not the old brand name)
- toClientView() is the single chokepoint for all outbound game state (security tests enforce this)
- Reconnection buffers events during disconnect; forfeit is turn-based (not wall-clock) — player forfeits when their turn arrives and they're still disconnected
- Unified single grid — no separate fleet/target grids (shared ocean = one grid)
- Per-player stats (shots, hits, accuracy, FF) accumulated during fireSalvo, computed at game-over
- Version is single-source from package.json, injected by Vite at build time via `__APP_VERSION__`
- Game.mode includes 7 quickplay modes ('quickplay-1v1' | '2v2' | 'ffa' | '3v3' | '3ffa' | '6ffa' | '2v2v2') plus 'private'
- Hex grid: axial coordinates (q,r), configurable 4-6 rings per game. MODE_RINGS maps mode → default ring count (5 for 2-4p, 6 for 6p)
- Islands: random blocked hexes generated at startGame(). Count configurable by host (0=None, 4=Few, 6=Normal, 8=Many). BFS validates no isolated regions < 10 hexes.
- Teams: Game.teams (Map<playerId, teamId>) + Game.teamsEnabled + Game.gameType ('ffa' | '2-team' | '3-team'). Simple alternating turn order. 3-team support (alpha/bravo/charlie). getTeammates() returns array. Teams persist across rematches.
- Chat: ChatMessage.channel ('team' | 'global'). Team messages route to sender + all teammates. Non-team games default to 'global'.
- Placement timer shares turn timer (no separate placementTimerConfig). Auto-places ships on timeout via generatePlacement('easy'). Always enabled for Quick Play.
- Private lobby: no create modal. Host configures Game Type / Turn Timer / Grid Size / Islands in-lobby via update-game-options socket event. Defaults: FFA, 60s, 5 rings, Normal islands. Two-column layout (players left, options panel right). Custom dropdown components with ARIA a11y. Leave button with host transfer.
- toGameMode/toQuickPlayMode helpers in shared/types.ts eliminate binary ternary duplication
- Quick Play rematch destroys the game and requeues players (clean game boundaries); private rematch resets in-place
- Player colors: 6 fixed colors (magenta/red/yellow/green/cyan/blue). Private games assign by join order (SLOT_COLORS). Quick Play randomizes: FFA shuffles all 6; team modes use TEAM_COLOR_POOLS (warm/cool split for 2-team, disjoint pairs for 3-team). Lobby renders fixed color slots.
- Game-over reveal: toClientView() uses serializeShipForGameOver() to expose all ship cells when phase='finished'. Client renders all players' ships in their assigned colors.
- Forfeit is silent: `player.ships = []` (no hit markers on shared board — prevents FFA info leakage)
- Surrender button available during placement and playing phases; rejoin modal on page reload replaces auto-rejoin
- Versioning: X.0.0 = major, 0.X.0 = minor, 0.0.X = revision

## gstack

For all web browsing, use the `/browse` skill from gstack. Never use `mcp__claude-in-chrome__*` tools.

Available gstack skills:
- `/office-hours`
- `/plan-ceo-review`
- `/plan-eng-review`
- `/plan-design-review`
- `/design-consultation`
- `/review`
- `/ship`
- `/browse`
- `/qa`
- `/qa-only`
- `/design-review`
- `/setup-browser-cookies`
- `/retro`
- `/investigate`
- `/document-release`
- `/codex`
- `/careful`
- `/freeze`
- `/guard`
- `/unfreeze`
- `/gstack-upgrade`

If gstack skills aren't working, run `cd .claude/skills/gstack && ./setup` to build the binary and register skills.

## Design System
Always read DESIGN.md before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval.
In QA mode, flag any code that doesn't match DESIGN.md.

## Deploy Configuration (configured by /setup-deploy)
- Platform: Render
- Production URL: https://salvo-d3ih.onrender.com/ (temporary — will change at wider release)
- Deploy workflow: auto-deploy on push to main
- Deploy status command: HTTP health check
- Merge method: merge
- Project type: web app (multiplayer game)
- Post-deploy health check: https://salvo-d3ih.onrender.com/

### Custom deploy hooks
- Pre-merge: none
- Deploy trigger: automatic on push to main (Render auto-deploy)
- Deploy status: poll production URL
- Health check: https://salvo-d3ih.onrender.com/
