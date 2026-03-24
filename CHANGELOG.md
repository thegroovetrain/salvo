# Changelog

## [0.11.1] - 2026-03-24

### Added
- **Custom dropdown components** — native `<select>` elements replaced with styled dropdowns matching the dark tactical theme. Game Type dropdown shows rich options with subtitles (FFA / Two Teams / Three Teams).
- **Two-column lobby layout** — players and team sections on the left, game options panel on the right. Collapses to single column on mobile (768px breakpoint).
- **Leave Game button** — ghost-styled button with confirmation dialog. Host transfers to the longest-tenured human player (Map insertion order).
- **Host transfer notification** — "You are now the host" info banner with 5-second auto-dismiss when host leaves.
- **Configurable island count** — None / Few / Normal / Many (maps to 0 / 4 / 6 / 8 islands). Host picks explicitly instead of auto-scaling by player count.
- **Host badge accuracy** — the HOST badge now tracks correctly when host transfers, always showing on the right player.

### Changed
- **Rebranded to HULLCRACKER.IO** — new game title, "Multiplayer Naval Warfare" tagline, Dreadnought ship class (was Battleship). Storage keys migrated automatically for existing players.
- **Game Type semantics simplified** — "2-team" now means "two teams" (Alpha/Bravo), "3-team" means "three teams" (Alpha/Bravo/Charlie). No auto-scaling based on player count. Always 6 slots evenly split across teams.
- **Keyboard accessibility** — custom dropdowns support Tab, Enter/Space, Arrow keys, Escape. ARIA attributes (listbox, option, aria-selected, aria-expanded) for screen readers.

### Fixed
- **Missing Charlie team** — selecting "2-Player Teams" with 5+ players no longer silently adds a third team. Host explicitly picks Two Teams or Three Teams.

## [0.11.0] - 2026-03-24

### Added
- **Hex grid** — the 10x10 square grid is replaced with a hexagonal grid using axial coordinates (q,r). 5 rings (91 hexes) for 2-4 player modes, 6 rings (127 hexes) for 6-player modes. SVG rendering with pointy-top orientation.
- **Islands** — random blocked hexes that can't be placed on or shot at. 8 islands for 2p, 6 for 3-4p, 4 for 5-6p. BFS connectivity validation prevents unplayable boards.
- **6-direction ship placement** — ships now follow 3 hex axes (6 directions) instead of horizontal/vertical. Press R to cycle directions.
- **New game modes** — 3v3, 3-player FFA, 6-player FFA, and 2v2v2 (3 teams of 2). Max players increased from 4 to 6.
- **Configurable ring count** — private game host can choose 4, 5, or 6 rings. Quick Play modes auto-select based on player count.
- **Lobby game options** — host-editable Game Type (FFA / 2-Player Teams / 3-Player Teams), Turn Timer (Off / 30s / 60s), and Grid Size directly in the lobby. Visible to all players.
- **3-team support** — alpha/bravo/charlie team IDs, `getTeammates()` returns array of 0-2 teammates, 3-team win conditions and shared vision
- **Shared test helpers** — `server/src/__tests__/helpers.ts` with `makeGame()`, `makeTeamGame()`, `hexPlacements()`, `setupBattle()` for DRY test setup

### Changed
- **Coordinate format** — all coordinates use axial hex format `"q,r"` (e.g. `"3,-1"`) instead of `"A1"` letter-number format
- **Turn order** — simplified from ABBA to straight team alternation. FFA uses round-robin.
- **Lobby flow** — removed create game modal. "Create Game" goes straight to lobby with defaults (FFA, 60s timer, 5 rings). Options adjustable in-lobby.
- **Placement timer** — removed as separate config, shares the turn timer

### Removed
- Square grid constants (`GRID_SIZE`, `ROWS`, `COLS`)
- `placementTimerConfig` (merged into `timerConfig`)
- `getTeammate()` singular (replaced by `getTeammates()` plural)
- Create game modal

## [0.10.3] - 2026-03-23

### Added
- **Random default names** — first-time visitors get a naval-themed auto-generated name (e.g. "Swift Torpedo", "Bold Kraken") pre-filled in the name field. A dice button lets you re-randomize anytime.
- **Name persistence** — player names now persist across page refreshes via localStorage, whether auto-generated or manually typed

### Changed
- **Vertical lobby layout** — private game lobbies now stack team cards (Alpha on top, Bravo below) vertically instead of side-by-side, giving each card full width for longer names

## [0.10.2] - 2026-03-23

### Changed
- **Lobby dropdown menus** — seat cards now have contextual dropdown menus (+ to add AI, ⋮ for player actions) instead of cramped inline buttons. Host can move players, swap players between full teams, or kick bots.
- **Shot log dialogue format** — each salvo now shows as a multi-line Battleship-style dialogue ("Eric fires: / A3 miss / B5 hit: [Morgan]") with sink lines, replacing the old per-shot entries. Newest entries at bottom with auto-scroll.
- **Turn indicator** — pulsing amber glow around the grid panel and larger turn text when it's your turn, plus an audio chirp notification
- **Hover-to-highlight** — hover a shot log entry to see those coordinates highlighted with info blue on the grid
- **Lobby width** — waiting room widened from 440px to 560px for more breathing room
- **Fixed-height panels** — shot log and chat panels now have fixed heights to prevent page layout shifts

### Added
- **Swap players** — host can swap two players between teams even when both teams are full (contextual "Swap with [name]" options in dropdown)
- **Player name truncation** — long names in the lobby now truncate with ellipsis instead of overflowing the container

## [0.10.1] - 2026-03-23

### Changed
- **Quick Play 2v2 button** — now amber like the other QP buttons instead of blue, for visual consistency
- **Battle player list** — players now appear in turn order so you can see who goes next at a glance
- **Private game lobby redesign** — team columns (Alpha left, Bravo right) replace the flat player list. Open seats show one-click bot difficulty buttons (E/M/H/I) instead of a dropdown. Players can move themselves between teams, and the host can rearrange anyone.

### Removed
- **Turn order visualization in lobby** — the A-B-B-A dots were misleading since turn order is randomized at game start. Turn order now only appears in the battle screen where it matters.

## [0.10.0] - 2026-03-23

### Added
- **2v2 Team Mode** — play with a teammate against another pair. Teams share ship vision, coordinate via private team chat, and win/lose together. Available in both Quick Play and private games.
- **Fair turn order** — teams alternate in a balanced A-B-B-A pattern so neither side has a first-mover advantage
- **Team chat** — toggle between Team (private, green) and Global (public, amber) channels. Only your teammate sees team messages.
- **Quick Play 2v2** — new matchmaking queue for team games. Random teammate assignment with full team coordination.
- **Placement timer** — configurable countdown during ship placement. Auto-places ships on timeout. Always enabled for Quick Play (60s), optional for private games.
- **Reset board** — return all placed ships to the tray before clicking Ready
- **Player readiness indicators** — see who is still placing ships vs who is Ready during the placement phase
- **Live teammate placement preview** — see your teammate's in-progress ship layout as ghost ships on your grid (2v2 only)
- **Game mode indicator** — "TEAM BATTLE — Alpha vs Bravo" header during 2v2 games
- **Hit count badges** — when a shot hits multiple overlapping ships, a small "×N" badge shows the hit count
- **Chat redesign** — timestamps on all messages, visual separation between game events and player chat, auto-scroll to latest message

### Changed
- **Reconnect timer** — forfeit is now turn-based instead of a fixed 60-second wall-clock countdown. Disconnected players are forfeited when their turn arrives and they haven't returned. Brief network blips during other players' turns cost nothing.
- **Team-aware bot AI** — bots on a team avoid targeting their teammate's ships (except Easy bots, who hit everything)
- **Desktop layout** — larger fonts and grid cells on screens ≥1200px, wider content area on ≥1440px
- **Changelog page** — uniform entry widths, consistent structure, better typography alignment

### Fixed
- **Light mode compatibility** — CSS now uses variables instead of hardcoded colors for hit badges, chat messages, and changelog entries
- **Duplicate elimination announcements** — sunk players are only announced once, not re-announced every turn
- **Stale rejoin modal** — modal auto-dismisses when the server reports the game is no longer valid
- **Placement timer sync** — client countdown syncs to server deadline instead of starting fresh, preventing drift from network latency
- **Timer cleanup** — all game timers (placement, forfeit, turn) are properly cleared when a game is removed
- **Placement preview validation** — server validates teammate placement preview data before relaying

## [0.9.2] - 2026-03-23

### Added
- **Surrender button** — players can now leave a game during placement or playing phases via a "Surrender" button with confirmation modal
- **Rejoin modal** — on page reload, a modal asks "Rejoin?" with a countdown timer showing remaining reconnect time, instead of auto-rejoining silently
- **Instant leave from rejoin modal** — clicking "Leave Game" on the rejoin prompt forfeits immediately, so other players aren't stuck waiting

### Changed
- **Silent forfeit** — all forfeits (voluntary + disconnect timeout) now silently remove ships instead of marking cells as hit, preventing position leakage in FFA games
- **Session cleared on game-over** — page reload after a finished game goes straight to lobby instead of showing a confusing rejoin prompt

### Fixed
- **Race condition** — surrender and disconnect timer can no longer double-fire (connection cleaned up before exit logic runs)

## [0.9.1] - 2026-03-23

### Fixed
- **Lobby button colors** — Create Game is now green (solid), Join Game is green (outline). Three-tier visual hierarchy: amber Quick Play > green Create > outlined Join
- **Global mute toggle** — moved from queue screen to top-right corner next to light/dark toggle, available on every screen. Uses text label (MUTE/UNMUTE) instead of emoji
- **Cleaner queue screen** — removed mute button clutter, Cancel is now full-width
- **Touch targets** — all buttons now meet 44px minimum height for accessibility

## [0.9.0] - 2026-03-23

### Added
- **Quick Play matchmaking** — 1v1 and FFA queue buttons on the lobby. Click one and wait for other humans to join — no codes, no coordination
- **Queue wait screen** — animated dots show how many players are queued, with a cancel button to leave
- **Live game counters** — lobby shows active games and players searching in real-time
- **Match-found sound** — sonar ping plays when a match is found (with mute toggle)
- **Queue switching** — clicking a different mode while queued auto-switches without error
- **Back button guard** — browser back button cleanly exits the queue
- **Auto-focus name field** — name input gets focus on first visit

### Changed
- Quick Play is now the primary lobby action; Create/Join are secondary
- Quick-play games always use a 60-second turn timer
- Quick-play rematch destroys the game and requeues all consenting players (clean game boundaries for future ranked play)
- Quick-play decline sends remaining players back to the queue instead of a private lobby
- Games now track their type (private, 1v1, FFA) for accurate lobby counters and future ranked play

## [0.8.0] - 2026-03-22

### Added
- **Bot friendly names** — bots now have real names like Meredith, Hugo, and Iris instead of "Bot (Medium)." First letter hints at difficulty: E=Easy, M=Medium, H=Hard, I=Impossible
- **Player icons** — inline SVG icons next to every player name. Person silhouette for humans, robot head for bots. Both in tactical green.
- 40 bot names total (10 per difficulty, 5 male + 5 female each)
- Names are randomly assigned and unique within each game

## [0.7.0] - 2026-03-22

### Changed
- **Game Options modal** — turn timer and future game settings now live in a modal that opens when clicking Create Game, keeping the lobby clean and extensible

## [0.6.0] - 2026-03-22

### Changed
- **Simplified lobby** — single name field with Create Game and Join Game buttons side by side
- Join Game opens a focused modal for the 4-letter code instead of a separate form
- Removed duplicate name input fields

## [0.5.0] - 2026-03-22

### Changed
- Changelog page now renders from CHANGELOG.md at runtime — single source of truth, no more hardcoded HTML

## [0.4.2] - 2026-03-22

### Fixed
- Friendly fire reports were wrong when multiple bots shared a name — Bot B attacking Bot A showed as "FRIENDLY FIRE" because the shot log looked up shooters by name instead of ID

## [0.4.1] - 2026-03-22

### Fixed
- Render deployment broken since v0.3.0 — Vite config used a relative path for package.json that resolved outside the repo during build

## [0.4.0] - 2026-03-22

### Changed
- **Unified single grid** — your ships and all shot results on one interactive ocean instead of two separate grids
- You can now see your own ships while selecting targets, making friendly fire risk visible and deliberate
- Simplified cell colors: red = enemy hit, orange = self-hit (friendly fire), dark red = enemy hit your ship
- Removed fleet/target tab toggle on mobile (no longer needed)

## [0.3.0] - 2026-03-22

### Added
- Changelog page accessible from the lobby footer
- Version number moved from subtitle to footer with changelog link

## [0.2.1] - 2026-03-22

### Fixed
- Enemy hits on your ships no longer show as "friendly fire" in the shot log — only self-inflicted hits use the orange FF label

## [0.2.0] - 2026-03-22

### Added
- Game-over stats with per-player table: shots fired, hits landed, accuracy %, ships sunk, friendly fire count
- Auto-generated highlights: Sharpshooter (highest accuracy), Most Destructive (most ships sunk), Friendly Fire Champion, First Blood

## [0.1.0] - 2026-03-21

### Added
- Initial playable beta
- 2-4 player shared-ocean Battleship with private join codes
- AI opponents with 4 difficulty tiers (Easy, Medium, Hard, Impossible)
- Ship placement: click-to-place, rotate, randomize button
- Turn timer (30s/60s/off, host-configurable)
- Text chat for all players
- 60-second reconnection with event buffering
- Rematch with consent (bots auto-accept, declined players go to new lobby)
- Light/dark mode toggle with localStorage persistence
- Mobile responsive layout
- Deployed on Render.com
