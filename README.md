# Salvo

A browser-based multiplayer Battleship variant where all players share the same ocean. Every shot hits every player's board — including your own. Friendly fire is real.

2-4 players, private lobbies with join codes, no accounts required.

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

1. **Create or Join** — one player creates a game and shares the 4-letter code
2. **Place Ships** — click a ship in the dock, click the grid to place, press R to rotate
3. **Fire Salvos** — click targets on the Target Ocean grid, then FIRE SALVO
4. **Win** — last player with ships afloat wins

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
- **Tests:** Vitest (47 tests — game logic + security)

## Project Structure

```
salvo/
├── shared/src/types.ts       # Shared types, events, computed getters
├── server/src/
│   ├── game.ts               # Pure game logic (no I/O)
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

## Design

Dark tactical display theme — see [DESIGN.md](DESIGN.md) for the full design system.
