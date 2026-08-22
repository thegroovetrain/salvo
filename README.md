# Hullcracker

A real-time, gridless naval battle royale in the browser. One ship per player on a large circular ocean with islands. Two-tier fog of war: a true-sight bubble around your hull, and a rotating **radar sweep** that paints contacts as phosphor blips which decay from bright to dark green as the information ages — islands cast height-aware radar shadows, and every hull leaves a wake on the scope. Guns, torpedoes, mines, star shells, a broadside barrage and a radar buoy, all with real firing arcs and all blocked by terrain. A storm circle shrinks the ocean and finally collapses it. Last hull floating wins.

Play it at **https://hullcracker.io/**.

The previous turn-based hex game was replaced by this real-time rebuild at v0.16.0; it survives only in git history and in `CHANGELOG.md`.

## Run it

```
npm install
npm run dev        # Colyseus server on :2567 + Vite client on :5173
```

Open http://localhost:5173. Enter a callsign, pick a class, then take one of the two doors: **SOLO** queues you for a standard match against other captains, and **SOLO VS AI** mints you a private arena against 19 AI captains immediately.

### Controls

| Input | Action |
|---|---|
| W / S | Engine telegraph — tap to raise or lower speed |
| A / D | Rudder — hold to turn |
| Mouse | Aim (within the selected weapon's arc) |
| Click left button | Fire at the point you clicked |
| Q / E | Select your class weapons and gear |
| R | Anything you pick up at sea |
| Tab | Open / close the refit window |
| 1–4 | Take that card (refit open) |
| 5 | Damage control — repair your hull (refit open) |
| F | Foghorn |
| X / Z | Zoom in / out |
| M | Mute |
| P | Debug: toggle prediction ⇄ interpolation for own ship |
| WASD + wheel | (While spectating) free pan + zoom out |

## Development

```
npm run check          # lint + type-check + all tests (shared/server/client)
npm run lint           # ESLint (complexity=10 enforced)
npm test -w shared     # kinematics, geometry, ballistics, zone timeline, mapgen, stats, boons
npm test -w server     # world sim, perception/anti-cheat invariants, match state machine, bots, PvE fleet
npm test -w client     # prediction, snapshots, clock, HUD/feel pure logic
npm run build          # shared → client → server
```

- **Tunables** all live in `shared/src/constants.ts` (`CONFIG`) — ship handling, vision/sweep, weapon stats, zone timeline, match flow, boon catalog. Client-only feel knobs in `client/src/config.ts`.
- **Headless smokes** in `server/scripts/*.mjs` prove full flows over real sockets (combat, fog, weapons, zone, match, fleet). Self-booting ones spawn their own server; the rest document their requirements in the header. Smokes use dev-only room options which the server only honors when `HC_DEV_OPTIONS=1` is set in its environment — production clients cannot pass them.
- **Server must boot from `server/`** (or with `--tsconfig server/tsconfig.json`): Colyseus schema decorators need that tsconfig.

## Architecture (short version)

- `shared/` — deterministic simulation math used by both sides: ship kinematics (`sim/ship.ts`), swept ballistic collision (`sim/shell.ts`), collision resolution, seeded fBm height-field map generation, radar shadows and wakes, the boon deck, the zone timeline. All pure functions over plain objects.
- `server/` — authoritative 20Hz fixed-tick `World` (zero Colyseus imports) wrapped by a thin `ArenaRoom`, with a `StandardQueueRoom` in front of it. All outbound state flows through one per-observer chokepoint (`game/perception.ts` → `game/frames.ts`) over the declarative signal registry (`game/signals.ts`): clients are never sent what their sight or sweep hasn't legitimately revealed, enforced by property-style invariant tests. Match lifecycle (`game/match.ts`) is a pure state machine; the PvE fleet (`game/drones.ts`) and the AI captains (`game/ai/`) drive through the same input pipeline as humans.
- `client/` — PixiJS 8 renderer with client-side prediction (shared kinematics + reconcile-and-replay), snapshot interpolation for contacts, and a fog composite built entirely from pre-baked textures (dark overlay with a feathered sight hole, conic sweep wedge, timestamp-decayed blips). DOM is used only for chrome: home, settings, refit, results, kill feed, and the `/how-to-play` and `/privacy` pages.

The visual language is defined in `_bmad-output/planning-artifacts/ux-designs/ux-Hullcracker.io-2026-07-16/DESIGN.md` (with `EXPERIENCE.md` alongside); gameplay design lives in the GDD at `_bmad-output/planning-artifacts/gdds/gdd-Hullcracker.io-2026-07-16/gdd.md`.
