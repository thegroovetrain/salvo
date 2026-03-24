# CLAUDE.md

## Project

Salvo is a multiplayer shared-ocean Battleship game. All players' ships occupy the same 10x10 grid — every shot affects everyone.

### Commands
```
npm run dev          # Start server (3000) + client (5173)
npm test -w server   # Run tests (vitest, 141 tests)
npx tsc --noEmit -p server/tsconfig.json  # Type-check server
npx tsc --noEmit -p client/tsconfig.json  # Type-check client
```

### Architecture
- **shared/src/types.ts** — All types, socket events, computed getters (isShipSunk, isPlayerAlive, playerShotCount), mode helpers (toGameMode, toQuickPlayMode)
- **server/src/game.ts** — Pure game logic, no I/O. toClientView() is the security boundary — never leaks ship positions. Team helpers (getTeammate, isTeamAlive), ABBA turn order, team-aware checkGameOver
- **server/src/connections.ts** — playerId↔socketId mapping, disconnect state tracking, event buffering (forfeit handled by turn timer, not wall-clock)
- **server/src/ai.ts** — AI opponents: 4 tiers (Easy/Medium/Hard/Impossible), ship placement + target selection. Team-aware: excludes teammate from targets (except Easy)
- **server/src/lobby.ts** — Game lifecycle, join codes (collision-safe), cleanup timer
- **server/src/index.ts** — Express + socket.io event routing, turn timer management, placement timer, bot auto-play, Quick Play queue (socket.io rooms, 1v1/2v2/FFA), surrender/rejoin handlers, handlePlayerExit() shared helper, team chat routing, swap-team handler, swap-players handler (atomic team swap), placement-preview relay, turn-based forfeit logic
- **client/src/main.ts** — Single-file vanilla TS client: state management, socket handlers, DOM rendering
- **client/src/style.css** — Full DESIGN.md implementation

### Key Decisions
- Ship.sunk, Player.alive, Player.shotCount are computed getters, not stored state
- Salvos resolve atomically — all shots land before checking alive status
- toClientView() is the single chokepoint for all outbound game state (security tests enforce this)
- Reconnection buffers events during disconnect; forfeit is turn-based (not wall-clock) — player forfeits when their turn arrives and they're still disconnected
- Unified single grid — no separate fleet/target grids (shared ocean = one grid)
- Per-player stats (shots, hits, accuracy, FF) accumulated during fireSalvo, computed at game-over
- Version is single-source from package.json, injected by Vite at build time via `__APP_VERSION__`
- Game.mode ('private' | 'quickplay-1v1' | 'quickplay-2v2' | 'quickplay-ffa') distinguishes game types for counters and future ranked play
- Teams: Game.teams (Map<playerId, teamId>) + Game.teamsEnabled. ABBA turn order [A1,B1,B2,A2]. Team win = last team standing. Shared ship vision between teammates via toClientView. Teams persist across rematches.
- Chat: ChatMessage.channel ('team' | 'global'). Team messages route to sender+teammate only. Non-team games default to 'global'.
- Placement timer: Game.placementTimerConfig. Auto-places ships on timeout via generatePlacement('easy'). Always enabled for Quick Play.
- toGameMode/toQuickPlayMode helpers in shared/types.ts eliminate binary ternary duplication
- Quick Play rematch destroys the game and requeues players (clean game boundaries); private rematch resets in-place
- Forfeit is silent: `player.ships = []` (no hit markers on shared board — prevents FFA info leakage)
- Surrender button available during placement and playing phases; rejoin modal on page reload replaces auto-rejoin
- Versioning: 0.X.0 = new features, 0.0.X = bugfixes, X.0.0 = major (fundamentally different game)

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
