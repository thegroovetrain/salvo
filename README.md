# Hullcracker.io

A browser-based multiplayer naval combat game where all players share the same ocean. Every shot hits every player's board — including your own. Friendly fire is real.

2-6 players (or solo vs AI). Quick Play matchmaking for instant games, or private lobbies with join codes. No accounts required.

## What Makes It Different

In classic naval combat games, you're searching in the dark. In Hullcracker, every shot is public and affects everyone:

- **Friendly fire** — shooting near your own ships risks self-damage
- **Information compounds** — every shot reveals state for all players
- **Natural catch-up** — the leading player has more ships... and more targets
- **Multi-shot salvos** — you get one shot per surviving ship per turn

## Quick Start

```bash
npm install
npm run dev
```

Open two browser tabs to `http://localhost:5173`. Create a game in one tab, copy the join code, join in the other.

## How to Play

1. **Quick Play or Create/Join** — click 1v1, 2v2, 3v3, FFA, or 2v2v2 for instant matchmaking, or create a private game with a join code (add AI bots, pick team mode, configure islands)
2. **Place Ships** — click a ship in the dock, click the hex grid to place, press R to rotate through 6 directions (or hit Randomize). In team games, you can see your teammate's ships as they place them.
3. **Fire Salvos** — click targets on the shared ocean grid, then FIRE SALVO
4. **Win** — last player (or team) with ships afloat wins

### Ships

| Ship | Length | Shots/Turn |
|------|--------|------------|
| Scout | 1 | 1 |
| Destroyer | 2 | 1 |
| Cruiser | 3 | 1 |
| Dreadnought | 4 | 1 |

You get one shot per surviving ship. Lose a ship, lose a shot.

## Tech Stack

- **Client:** Vite + TypeScript (vanilla, no framework)
- **Server:** Express + socket.io
- **Shared:** TypeScript types shared via npm workspaces
- **Tests:** Vitest (309 tests — server: game logic, security, AI, matchmaking, surrender, teams, swap, islands, player colors; client: state, helpers, audio, grid, battle, smoke)
- **Linting:** ESLint with cyclomatic complexity ≤ 10 enforced

## Project Structure

```
salvo/
├── shared/src/
│   ├── types.ts              # Shared types, events, computed getters
│   └── hex.ts                # Hex coordinate math (axial, distance, rings)
├── server/src/
│   ├── index.ts              # Express setup, server bootstrap
│   ├── socketSetup.ts        # Socket.io handler registration
│   ├── game.ts               # Pure game logic (no I/O)
│   ├── gameFlow.ts           # Turn flow, bot execution, player exit
│   ├── ai.ts                 # AI opponents (4 difficulty tiers)
│   ├── handlers/             # Socket event handlers by domain
│   ├── timers/               # Placement, turn, forfeit timer management
│   └── queue/                # Quick Play matchmaking
├── client/src/
│   ├── main.ts               # Bootstrap (61 LOC)
│   ├── state.ts              # AppState type + mutable singleton
│   ├── rendering/            # Screen renderers (lobby, battle, grid, etc.)
│   ├── handlers/             # Socket + DOM event handlers
│   ├── audio/                # Sound system (AudioContext, tones)
│   ├── helpers/              # DOM utils, formatting, storage, teams
│   ├── hexGrid.ts            # SVG hex grid renderer
│   └── style.css             # Design system implementation
├── DESIGN.md                 # Visual design system
└── CLAUDE.md                 # AI assistant instructions
```

## Development

```bash
npm run dev          # Start both server (3000) and client (5173)
npm run dev:server   # Server only
npm run dev:client   # Client only
npm test             # Run all tests (server + client)
npm run lint         # ESLint (complexity enforced)
npm run check        # Lint + type-check + test (all workspaces)
```

## Features

- **Team modes** — Two Teams (Alpha vs Bravo) or Three Teams (Alpha/Bravo/Charlie): shared ship vision, private team chat, team win condition, alternating turn order
- **Hex grid** — hexagonal ocean with axial coordinates, 4-6 configurable rings, islands that block placement and shots
- **Quick Play matchmaking** — 1v1, 2v2, 3v3, 3-FFA, 6-FFA, and 2v2v2 queues with live game counters and match-found sound
- **AI opponents** — 4 difficulty tiers (Easy, Medium, Hard, Impossible) — team-aware in 2v2
- **Unified ocean grid** — your ships and all shot results on one interactive board, with hit count badges for overlapping ships
- **Player colors** — each player slot has a unique color (Magenta, Red, Yellow, Green, Cyan, Blue) shown on ships, cards, chat, turn indicators, and the game-over battlefield map
- **Game-over battlefield map** — all ships revealed in player colors when the game ends, with sequential reveal in elimination order
- **Game-over stats** — accuracy, ships sunk, friendly fire, team aggregate stats, highlights (Sharpshooter, First Blood)
- **Rematch** — play again with the same lobby (consent-based for multiplayer)
- **Lobby game options** — custom dropdown UI for Game Type, Turn Timer, Grid Size, and Islands — all configurable by host in a side panel
- **Leave game** — exit the lobby cleanly with host auto-transfer to the next player
- **Turn timer** — optional 30s/60s countdown, configurable by host
- **Placement timer** — configurable countdown during ship placement, auto-places on timeout
- **Chat** — timestamps, game/chat message separation, team/global channel toggle in 2v2
- **Light/dark mode** — toggle with localStorage persistence
- **Surrender** — leave any active game via a "Surrender" button with confirmation modal
- **Reconnection** — turn-based forfeit window with event buffering; page reload shows a rejoin modal
- **Changelog** — in-app version history accessible from the lobby

## Design

Dark tactical display theme with light mode toggle — see [DESIGN.md](DESIGN.md) for the full design system.
