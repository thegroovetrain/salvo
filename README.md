# Hullcracker — Real-Time Prototype

A real-time, gridless naval battle royale in the browser. One ship per player on a large circular ocean with islands. Two-tier fog of war: a true-sight bubble around your hull, and a rotating **radar sweep** that paints contacts as phosphor blips which decay from bright to dark green as the information ages. Guns, torpedoes, and mines — all hull-mounted with real firing arcs, all blocked by terrain. A storm circle shrinks the ocean. Last hull floating wins.

This branch is a full-systems prototype that replaced the previous turn-based game (which lives on `main`).

## Run it

```
npm install
npm run dev        # Colyseus server on :2567 + Vite client on :5173
```

Open http://localhost:5173 in two browser tabs (or one tab — drones fill the match). Enter a callsign, hit PLAY. The match countdown arms at 2 human captains; a solo captain can drive around the weapons-safe ready room until someone joins.

### Controls

| Input | Action |
|---|---|
| W / S | Throttle ahead / astern |
| A / D | Rudder port / starboard |
| Mouse | Aim (within the selected weapon's arc) |
| Click left button | Fire one shot (selected weapon) |
| 1 / 2 / 3 | Select guns / torpedoes / mines |
| M | Mute |
| P | Debug: toggle prediction ⇄ interpolation for own ship |
| WASD + wheel | (While spectating) free pan + zoom out |

## Development

```
npm run check          # lint + type-check + all tests (shared/server/client)
npm test -w shared     # kinematics, geometry, zone timeline, mapgen
npm test -w server     # world sim, perception/anti-cheat invariants, match state machine, drones
npm test -w client     # prediction, snapshots, clock, HUD/feel pure logic
```

- **Tunables** all live in `shared/src/constants.ts` (`CONFIG`) — ship handling, vision/sweep, weapon stats, zone timeline, match flow. Client-only feel knobs in `client/src/config.ts`.
- **Headless smokes** in `server/scripts/*.mjs` prove full flows over real sockets (combat, fog, weapons, zone, match, drones). Self-booting ones spawn their own server; the rest document their requirements in the header. Smokes use dev-only room options which the server only honors when `HC_DEV_OPTIONS=1` is set in its environment — production clients cannot pass them.
- **Server must boot from `server/`** (or with `--tsconfig server/tsconfig.json`): Colyseus schema decorators need that tsconfig.

## Architecture (short version)

- `shared/` — deterministic simulation math used by both sides: ship kinematics (`sim/ship.ts`), swept ballistic collision (`sim/shell.ts`), collision resolution, seeded map generation, zone timeline. All pure functions over plain objects.
- `server/` — authoritative 20Hz fixed-tick `World` (zero Colyseus imports) wrapped by a thin `ArenaRoom`. All outbound state flows through one per-observer chokepoint (`game/perception.ts` → `game/frames.ts`): clients are never sent what their sight or sweep hasn't legitimately revealed, enforced by property-style invariant tests. Match lifecycle (`game/match.ts`) is a pure state machine; drones drive through the same input pipeline as humans.
- `client/` — PixiJS 8 renderer with client-side prediction (shared kinematics + reconcile-and-replay), snapshot interpolation for contacts, and a fog composite built entirely from pre-baked textures (dark overlay with a feathered sight hole, conic sweep wedge, timestamp-decayed blips). DOM is used only for menu / results / kill feed.

The design history and full plan live in the project's plan file; the visual language is `DESIGN.md`.
