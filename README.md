# Salvo

A browser-based multiplayer Battleship variant where all players share the same ocean. Every shot hits every player's board — including your own. Friendly fire is real.

2-4 players (or solo vs AI). Quick Play matchmaking for instant games, or private lobbies with join codes. No accounts required.

## What Makes It Different

In classic Battleship, you're searching in the dark. In Salvo, every shot is public and affects everyone:

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

1. **Quick Play or Create/Join** — click 1v1, 2v2, or FFA for instant matchmaking, or create a private game with a join code (add AI bots, enable teams)
2. **Place Ships** — click a ship in the dock, click the grid to place, press R to rotate (or hit Randomize). In 2v2, you can see your teammate's ships as they place them.
3. **Fire Salvos** — click targets on the shared ocean grid, then FIRE SALVO
4. **Win** — last player (or team) with ships afloat wins

### Ships

| Ship | Length | Shots/Turn |
|------|--------|------------|
| Scout | 1 | 1 |
| Destroyer | 2 | 1 |
| Cruiser | 3 | 1 |
| Battleship | 4 | 1 |

You get one shot per surviving ship. Lose a ship, lose a shot.

## Tech Stack

- **Client:** Vite + TypeScript (vanilla, no framework)
- **Server:** Express + socket.io
- **Shared:** TypeScript types shared via npm workspaces
- **Tests:** Vitest (141 tests — game logic, security, AI, matchmaking, surrender, teams, swap)

## Project Structure

```
salvo/
├── shared/src/types.ts       # Shared types, events, computed getters
├── server/src/
│   ├── game.ts               # Pure game logic (no I/O)
│   ├── ai.ts                 # AI opponents (4 difficulty tiers)
│   ├── connections.ts         # Reconnection + event buffering
│   ├── lobby.ts              # Game management, join codes, cleanup
│   └── index.ts              # Express + socket.io wiring
├── client/src/
│   ├── main.ts               # State, socket handlers, rendering
│   └── style.css             # Design system implementation
├── DESIGN.md                 # Visual design system
└── CLAUDE.md                 # AI assistant instructions
```

## Development

```bash
npm run dev          # Start both server (3000) and client (5173)
npm run dev:server   # Server only
npm run dev:client   # Client only
npm test -w server   # Run tests
```

## Features

- **2v2 Team Mode** — play with a teammate: shared ship vision, private team chat, team win condition, ABBA turn order for fairness
- **Quick Play matchmaking** — 1v1, 2v2, and FFA queues with live game counters and match-found sound
- **AI opponents** — 4 difficulty tiers (Easy, Medium, Hard, Impossible) — team-aware in 2v2
- **Unified ocean grid** — your ships and all shot results on one interactive board, with hit count badges for overlapping ships
- **Game-over stats** — accuracy, ships sunk, friendly fire, team aggregate stats, highlights (Sharpshooter, First Blood)
- **Rematch** — play again with the same lobby (consent-based for multiplayer)
- **Turn timer** — optional 30s/60s countdown, configurable by host
- **Placement timer** — configurable countdown during ship placement, auto-places on timeout
- **Chat** — timestamps, game/chat message separation, team/global channel toggle in 2v2
- **Light/dark mode** — toggle with localStorage persistence
- **Surrender** — leave any active game via a "Surrender" button with confirmation modal
- **Reconnection** — turn-based forfeit window with event buffering; page reload shows a rejoin modal
- **Changelog** — in-app version history accessible from the lobby

## Design

Dark tactical display theme with light mode toggle — see [DESIGN.md](DESIGN.md) for the full design system.
