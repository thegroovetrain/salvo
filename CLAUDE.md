# CLAUDE.md

## Project

Hullcracker.io is a multiplayer naval combat game. All players' ships occupy the same hex grid — every shot affects everyone.

### Commands
```
npm run dev          # Start server (3000) + client (5173)
npm run check        # Lint + type-check + test (all workspaces)
npm run lint         # ESLint (complexity=10 enforced)
npm test -w server   # Server tests (vitest, 395 tests)
npm test -w client   # Client tests (vitest + jsdom, 52 tests)
npx tsc --noEmit -p server/tsconfig.json  # Type-check server
npx tsc --noEmit -p client/tsconfig.json  # Type-check client
```

### Architecture

#### Shared
- **shared/src/types.ts** — All types, socket events, computed getters (isShipSunk, isPlayerAlive, playerShotCount), team helpers (getTeammates, isTeamAlive), PlayerColor type, SLOT_COLORS
- **shared/src/hex.ts** — Hex coordinate math: axial coordinates (q,r), distance, neighbors, rings, linear paths, pixel↔hex conversion with cube rounding

#### Server
- **server/src/index.ts** — Express setup, static file serving, server bootstrap
- **server/src/socketSetup.ts** — Socket.io connection handler, registers all handler modules
- **server/src/game.ts** — Pure game logic, no I/O. toClientView() security boundary. checkNewEliminations() for post-salvo elimination detection
- **server/src/gameFlow.ts** — Turn flow: emitNextTurn, executeBotTurn, handlePlayerExit. Simultaneous mode: round orchestration (startRound, processLockedSalvos)
- **server/src/emitters.ts** — Socket emission helpers: emitToPlayer, emitGameState, broadcastToGame
- **server/src/capabilities.ts** — `getLobbyCapabilities()`: server-authoritative permission payload for lobby phase (canStart, canKick, canAddBot, canRequestSwap, canToggleReady, canTransferHost, readyStates)
- **server/src/handlers/** — Socket event handlers by domain: lobby.ts (create/join/start + ready-up/kick/transfer-host/return-to-lobby/countdown), playing.ts (place-ships/fire/lock-salvo), social.ts (chat/swap-team/swap-request/respond-swap), connection.ts (leave/surrender/disconnect), rematch.ts (rematch/quickplay-join)
- **server/src/timers/** — Timer management: placement.ts, turn.ts, round.ts (simultaneous round lock deadline), disconnectSkip.ts (skip disconnected player's turn after grace period), allDisconnected.ts (end game when all humans disconnect), index.ts (clearGameTimers orchestrator + timer Maps)
- **server/src/queue/** — Ticket-based Quick Play matchmaking: types.ts (QueueTicket/QueuedMember interfaces), adapter.ts (ticket creation), matcher.ts (greedy FIFO matching for 6-player FFA), index.ts (orchestrator: ticket Map + guestId→ticketId reverse index, enqueue/dequeue/dissolve, match creation, tab eviction migration)
- **server/src/party/** — Party system: state.ts (PartyManager: create/join/leave/disband, leader transfer, member DC grace, rate limiting, GC)
- **server/src/ai/** — AI opponents: doctrine.ts (commander layer: hunt/kill/trade-up/protect-lead/desperation/cleanup), gunnery.ts (shot selection per doctrine), probability.ts (heat-map targeting), placement.ts (ship placement generation), helpers.ts (board analysis utilities), index.ts (public API)
- **server/src/guestSessions.ts** — GuestSessionManager: persistent guest identity (localStorage guestId via Socket.IO auth), session lifecycle, game binding, multi-tab eviction, GC
- **server/src/connections.ts** — playerId↔socketId mapping, disconnect state tracking, event buffering
- **server/src/lobby.ts** — Game lifecycle, join codes, cleanup timer
- **server/src/helpers.ts** — autoAssignTeam, shuffle, assignQuickPlayColors

#### Client
- **client/src/main.ts** — Bootstrap: state init, socket handler registration, initial render
- **client/src/state.ts** — AppState type + mutable singleton (leaf node, zero app imports)
- **client/src/socket.ts** — Socket.io client connection
- **client/src/rendering/** — Screen renderers: lobby.ts, waiting.ts, battle.ts, gameOver.ts, grid.ts (getCellState + battle/placement sub-functions), chat.ts, modals.ts, render.ts (main dispatch)
- **client/src/handlers/** — Event handling: socketGame.ts (game + round events), socketLobby.ts, socketSocial.ts (socket event registration), eventBindings.ts (DOM event listeners), placement.ts (ship placement logic), battle.ts (target selection + lock-salvo)
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
- SHIP_LENGTHS = [2, 3, 4] (Destroyer, Cruiser, Battleship). No single-hex Scout.
- Salvos resolve atomically — all shots land before checking alive status (note: "salvo" is the game mechanic term for a volley of shots, not the old brand name)
- Turn modes: Game.turnMode is 'sequential' | 'simultaneous'. Private games use sequential (one player per turn). Quick Play uses simultaneous (all players lock salvos within 30s deadline, then all resolve atomically in one round). Simultaneous round state: roundNumber, lockedSalvos, lockDeadline, roundParticipants, roundShotCounts, roundPhase. Socket events: lock-salvo, round-start, player-locked, round-results
- toClientView() is the single chokepoint for all outbound game state (security tests enforce this)
- Guest identity: persistent guestId (client-generated UUID in localStorage, sent via Socket.IO auth). GuestSessionManager maps guestId → socketId/playerId/gameId. Auto-reconnect on page refresh — no rejoin modal
- No forfeit on disconnect: disconnected players get their turn skipped (not forfeited) after a grace period. Ships remain on the board. Game ends only if all human players disconnect.
- Unified single grid — no separate fleet/target grids (shared ocean = one grid)
- Per-player stats (shots, hits, accuracy, FF) accumulated during fireSalvo, computed at game-over
- Version is single-source from package.json, injected by Vite at build time via `__APP_VERSION__`
- Game.mode is 'private' | 'quickplay'. Quick Play is a single 6-player FFA mode with 30s simultaneous turns
- Hex grid: axial coordinates (q,r), configurable 4-6 rings per game. MODE_RINGS maps mode → default ring count (private: 5, quickplay: 6)
- Islands: random blocked hexes generated at startGame(). Count configurable by host (0=None, 4=Few, 6=Normal, 8=Many). BFS validates no isolated regions < 10 hexes.
- Teams: Game.teams (Map<playerId, teamId>) + Game.teamsEnabled + Game.gameType ('ffa' | '2-team' | '3-team'). Simple alternating turn order. 3-team support (alpha/bravo/charlie). getTeammates() returns array. Teams persist across rematches.
- Chat: ChatMessage.channel ('team' | 'global'). Team messages route to sender + all teammates. Non-team games default to 'global'.
- Placement timer shares turn timer (no separate placementTimerConfig). Auto-places ships on timeout via generatePlacement('easy'). Always enabled for Quick Play.
- Private lobby: no create modal. Host configures Game Type / Turn Timer / Grid Size / Islands in-lobby via update-game-options socket event. Defaults: FFA, 60s, 5 rings, Normal islands. Two-column layout (players left, options panel right). Custom dropdown components with ARIA a11y. Leave button with host transfer.
- Queue uses ticket-based matchmaking: QueueTicket wraps 1 member (solo only). Greedy FIFO matcher sums ticket sizes to fill 6-player FFA. Ticket Map is single source of truth; Socket.IO rooms for broadcasting only. guestId→ticketId reverse index for O(1) disconnect/eviction.
- Parties cannot queue for Quick Play (QueueErrorReason: 'in-party'). Party system exists for private games only.
- Quick Play rematch requeues players as solo tickets.
- Quick Play rematch destroys the game and requeues players (clean game boundaries); private games use "Return to Lobby" (resetGameToLobby) instead of rematch
- Player colors: 6 fixed colors (magenta/red/yellow/green/cyan/blue). Private games assign by join order (SLOT_COLORS). Quick Play shuffles all 6. Lobby renders fixed color slots.
- Game-over reveal: toClientView() uses serializeShipForGameOver() to expose all ship cells when phase='finished'. Client renders all players' ships in their assigned colors.
- Surrender is silent: `player.ships = []` (no hit markers on shared board — prevents FFA info leakage)
- Surrender button available during placement and playing phases; auto-reconnect on page reload (no modal)
- AI architecture: two-layer doctrine/gunnery system. Commander picks doctrine (hunt/kill/trade-up/protect-lead/desperation/cleanup) based on game state; gunnery executes shot selection per doctrine. Tiers unlock doctrine subsets (Easy=hunt only, Impossible=all). Probability heat-map for hunt targeting.
- Lobby capabilities: `LobbyCapabilities` payload emitted with every `game-state` during lobby phase. Server-authoritative permissions (canStart, canKick, canAddBot, canRequestSwap, canToggleReady, canTransferHost). Client renders menus from capabilities, never guesses.
- Ready-up: `Game.readyStates` (Map<playerId, boolean>). All humans toggle ready. Host ready activates Start. Green path (all ready → 5s countdown), amber path (confirm prompt → immediate start). Countdown cancels on any lobby state change.
- Swap requests: peer-to-peer with 15s auto-decline timer. Crossed requests auto-accept. Bots instant. `pendingSwaps` Map in social.ts. `clearSwapsForPlayer/Game` for cleanup.
- Host transfer: manual `transfer-host` event + auto on 10s disconnect grace. Reconnecting host does NOT reclaim. Target must be connected human.
- Lobby persistence: `resetGameToLobby()` resets finished game to lobby phase. Custom games use "Return to Lobby" instead of rematch. Quick play uses "Return" to homescreen.
- Unified join codes: `resolveJoinCode()` checks party first, then game. `generateGloballyUniqueCode()` checks both namespaces. Both `PartyManager` and `LobbyManager` accept injected `setCodeGenerator()`.
- Timer cleanup: `registerGameCleanup()` pattern in timers/index.ts avoids circular imports. Lobby countdown and host transfer timers register via callback.
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

## Dev Server
- **Never start the dev server yourself.** The user manages the dev server manually.
- Before running `/qa`, `/browse`, or any browser-based skill, check if the dev server is running: `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000 2>/dev/null`
- If it's not running, ask the user to start it with `npm run dev` and wait.
- If you find stale node processes on port 3000 or 5173, kill them and tell the user.

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

### Directives
- If at any time the linter discovers complexity errors, fix them immediately. Do not worry about when they were from, just fix them.

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health